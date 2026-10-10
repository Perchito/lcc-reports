import express from 'express';
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import {
  SESSION_DAYS, hashPassword, verifyPassword, newToken, newPassword, tokenHash, readCookie,
  loginBlocked, loginFailed, loginOk,
} from './lib/auth.mjs';
import { homeStorage } from './lib/home-storage.mjs';
import { MATERIAL_AREAS, MAX_ROOMS, STATUS, tr, newJob, cleanPatch, materialItem, problemItem, changeItem, signature, isSigned, CODE_RE, newCode, CHANGE_DECLARATION, slug, roomsOf, findRoom, isQuote, newQuote, cleanQuotePatch, conditionMeta, conditionLocked, MAX_CONDITION, CONDITION_DECLARATION, cleanRooms, photosOf, dropMain, MAX_EXTRA } from './lib/jobs.mjs';
import { reportPdf, pdfFilename } from './lib/pdf.mjs';
import { sendEmail, emailConfigured } from './lib/mailer.mjs';
import { pushRoutes, notify } from './lib/push.mjs';
import { address } from './lib/jobs.mjs';

const { DATABASE_URL, PORT = 4630 } = process.env;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const storage = homeStorage({
  url: process.env.HOME_STORAGE_URL || 'http://127.0.0.1:9100',
  project: process.env.HOME_STORAGE_PROJECT || 'lcc-reports',
  key: process.env.HOME_STORAGE_KEY,
});
const app = express();
app.set('trust proxy', 'loopback'); // cloudflared on localhost sets X-Forwarded-Proto
app.use(express.json({ limit: '1mb' }));
// every API reply says which deploy is running, so an open copy of the app can offer "Actualizar" (VERSION is set below, per start)
app.use('/api', (req, res, next) => { res.set('X-App-Version', VERSION); next(); });

const COOKIE = 'lcc_session';
const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.ip);
const bad = (status, error) => Object.assign(new Error(error), { status });

// ── session ─────────────────────────────────────────────
app.use(async (req, res, next) => {
  const token = readCookie(req, COOKIE);
  if (!token) return next();
  try {
    const { rows } = await pool.query(
      `select u.id, u.email, u.name, u.role from sessions s join users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now() and u.active`, [tokenHash(token)]);
    req.user = rows[0];
    next();
  } catch (e) { next(e); }
});

const requireUser = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No has iniciado sesión' });
  if (role && req.user.role !== role) return res.status(403).json({ error: 'No tienes permiso' });
  next();
};
const admin = requireUser('admin');

app.post('/api/login', async (req, res) => {
  const ip = clientIp(req);
  if (loginBlocked(ip)) return res.status(429).json({ error: 'Demasiados intentos — vuelve a intentarlo en 15 minutos.' });
  const { email = '', password = '' } = req.body || {};
  const { rows } = await pool.query('select id, pass_hash from users where lower(email) = lower($1) and active', [String(email).trim()]);
  if (!rows[0] || !verifyPassword(String(password), rows[0].pass_hash)) {
    loginFailed(ip);
    console.warn(`[auth] failed login for ${String(email).slice(0, 80)} from ${ip}`);
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  loginOk(ip);
  await startSession(req, res, rows[0].id);
  res.json({ ok: true });
});

async function startSession(req, res, userId, days = SESSION_DAYS) {
  const token = newToken();
  await pool.query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + $3::interval)',
    [tokenHash(token), userId, `${days} days`]);
  await pool.query('delete from sessions where expires_at < now()');
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: days * 86400_000 });
}

// Personal login link (no password to type): /l/<code>, made or revoked with scripts/login-link.mjs.
// Only the sha256 of the code is stored; opening it logs that person in for a year.
app.get('/l/:code', async (req, res) => {
  const ip = clientIp(req);
  if (loginBlocked(ip)) return res.status(429).send('Demasiados intentos — vuelve a intentarlo en 15 minutos.');
  const { rows } = await pool.query('select id from users where login_link_hash = $1 and active', [tokenHash(req.params.code)]);
  if (!rows[0]) { loginFailed(ip); console.warn(`[auth] bad login link from ${ip}`); return res.redirect('/'); }
  loginOk(ip);
  await startSession(req, res, rows[0].id, 365);
  res.redirect('/');
});

app.post('/api/logout', async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) await pool.query('delete from sessions where token_hash = $1', [tokenHash(token)]);
  res.clearCookie(COOKIE).json({ ok: true });
});

app.get('/api/me', requireUser(), (req, res) => res.json(req.user));
// cheap reachability check for the app's sync engine (navigator.onLine alone can't tell)
app.get('/api/health', (req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }));

app.post('/api/password', requireUser(), async (req, res) => {
  const { current = '', next = '' } = req.body || {};
  if (String(next).length < 8) throw bad(400, 'La nueva contraseña necesita al menos 8 caracteres');
  const { rows } = await pool.query('select pass_hash from users where id = $1', [req.user.id]);
  if (!verifyPassword(String(current), rows[0].pass_hash)) throw bad(400, 'La contraseña actual no es correcta');
  await pool.query('update users set pass_hash = $2 where id = $1', [req.user.id, hashPassword(String(next))]);
  await pool.query('delete from sessions where user_id = $1 and token_hash <> $2', [req.user.id, tokenHash(readCookie(req, COOKIE))]);
  res.json({ ok: true });
});

// ── team (replaces the Firebase console for adding employees) ──
app.get('/api/users', admin, async (req, res) => {
  const { rows } = await pool.query('select id, email, name, role, active from users order by active desc, name');
  res.json(rows);
});
app.post('/api/users', admin, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase(), name = String(req.body?.name || '').trim();
  const role = req.body?.role === 'admin' ? 'admin' : 'employee';
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) throw bad(400, 'Hace falta un nombre y un correo válido');
  const password = 'bathrooms'; // Luis's choice: every new account starts on this; change it in Más
  await pool.query('insert into users (email, name, role, pass_hash) values ($1, $2, $3, $4)', [email, name, role, hashPassword(password)]);
  res.json({ email, password });
});
app.patch('/api/users/:id', admin, async (req, res) => {
  const { active, resetPassword } = req.body || {};
  if (req.params.id === req.user.id && active === false) throw bad(400, 'No puedes desactivarte a ti mismo');
  let password;
  if (typeof active === 'boolean') await pool.query('update users set active = $2 where id = $1', [req.params.id, active]);
  if (resetPassword) {
    password = newPassword();
    await pool.query('update users set pass_hash = $2 where id = $1', [req.params.id, hashPassword(password)]);
  }
  if (active === false || resetPassword) await pool.query('delete from sessions where user_id = $1', [req.params.id]);
  res.json({ ok: true, password });
});

// ── jobs ────────────────────────────────────────────────
// admin sees every job; an employee only the jobs assigned to their email, plus the quotes they made
const visible = (i) => `($${i}::text = 'admin' or lower(data->>'assignedTo') = lower($${i + 1}) or (data->>'kind' = 'quote' and lower(data->>'createdBy') = lower($${i + 1})))`;
const who = (u) => [u.role, u.email];

app.get('/api/jobs', requireUser(), async (req, res) => {
  const { rows } = await pool.query(`select data from jobs where ${visible(1)} order by created_at desc`, who(req.user));
  res.json(rows.map((r) => r.data));
});

async function loadJob(req) {
  const { rows } = await pool.query(`select data from jobs where id = $1 and ${visible(2)}`, [req.params.id, ...who(req.user)]);
  if (!rows[0]) throw bad(404, 'Trabajo no encontrado');
  return rows[0].data;
}
app.get('/api/jobs/:id', requireUser(), async (req, res) => res.json(await loadJob(req)));

// unique Job ID per year: LCC-2026-00001, LCC-2026-00002, … (quotes: Q-2026-00001). Anyone can make a quote; jobs are for admins.
app.post('/api/jobs', requireUser(), async (req, res) => {
  const quote = req.body?.kind === 'quote';
  if (!quote && req.user.role !== 'admin') throw bad(403, 'No tienes permiso');
  const clientId = req.body?.clientId;
  if (clientId) { // created offline and sent again: hand back the job the first send made
    const { rows } = await pool.query(`select data from jobs where data->>'clientId' = $1`, [String(clientId)]);
    if (rows[0]) return res.json(rows[0].data);
  }
  res.json(await insertNumbered(quote ? 'Q' : 'LCC', (id) => (quote ? newQuote : newJob)(id, req.body || {}, req.user.email)));
});
async function insertNumbered(prefix, make) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows: [{ n }] } = await pool.query(
      `select coalesce(max(substring(id from '\\d+$')::int), 0) + 1 as n from jobs where id like $1`, [`${prefix}-${year}-%`]);
    const job = make(`${prefix}-${year}-${String(n).padStart(5, '0')}`);
    try {
      await pool.query('insert into jobs (id, data) values ($1, $2)', [job.id, job]);
      if (job.assignedTo) notify(pool, { emails: [job.assignedTo] }, { title: 'Nuevo trabajo asignado', body: address(job), url: `/#/jobs/${job.id}`, tag: job.id });
      return job;
    } catch (e) { if (e.code !== '23505') throw e; } // two at once: take the next number
  }
  throw bad(409, 'No se pudo asignar un número, inténtalo de nuevo');
}

// every write is a targeted change on the server's copy, so two people working
// on the same job never overwrite each other's photos or materials
async function update(req, sql, params) {
  await loadJob(req); // access check
  const { rows } = await pool.query(`update jobs set data = ${sql} where id = $1 returning data`, [req.params.id, ...params]);
  return rows[0].data;
}

app.patch('/api/jobs/:id', requireUser(), async (req, res) => {
  const current = await loadJob(req);
  if (isQuote(current)) {
    if (current.convertedTo) throw bad(409, `Este presupuesto ya es el trabajo ${current.convertedTo}`);
    return res.json(await update(req, 'data || $2::jsonb', [cleanQuotePatch(req.body)]));
  }
  const patch = cleanPatch(req.body, req.user.role);
  const now = new Date().toISOString();
  if (patch.status === STATUS.adminReviewed) patch.reviewedAt = now;
  if ('assignedTo' in patch) patch.assignedAt = patch.assignedTo ? now : null;
  const before = await loadJob(req);
  const job = await update(req, 'data || $2::jsonb', [patch]);
  res.json(job);
  // push notifications for the moments people wait for (never to the person who did it)
  const where = { title: '', body: address(job), tag: job.id };
  if (job.assignedTo && job.assignedTo !== before.assignedTo) notify(pool, { emails: [job.assignedTo], except: req.user.id }, { ...where, title: 'Nuevo trabajo asignado', url: `/#/jobs/${job.id}` });
  if (job.submittedAt && !before.submittedAt) {
    notify(pool, { role: 'admin', except: req.user.id }, { ...where, title: 'Informe enviado', body: `${address(job)} — de ${req.user.name}`, url: `/#/reports/${job.id}` });
    emailReport(job, req.user.name).catch((e) => console.error(`[email] report ${job.id} failed:`, e.message));
  }
  if (job.status === STATUS.adminReviewed && before.status !== STATUS.adminReviewed && job.assignedTo) notify(pool, { emails: [job.assignedTo], except: req.user.id }, { ...where, title: 'Informe revisado', url: `/#/reports/${job.id}` });
});

// read-modify-write of one job under a row lock: for edits inside lists (materials, problems)
async function withJob(req, fn) {
  await loadJob(req); // access check
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query('select data from jobs where id = $1 for update', [req.params.id]);
    const data = rows[0].data;
    fn(data);
    await client.query('update jobs set data = $2 where id = $1', [req.params.id, data]);
    await client.query('commit');
    return data;
  } catch (e) { await client.query('rollback').catch(() => {}); throw e; }
  finally { client.release(); }
}
const findMaterial = (data, mid) => {
  for (const area of MATERIAL_AREAS) {
    const i = (data.materials?.[area] || []).findIndex((m) => m.id === mid);
    if (i >= 0) return { area, i, item: data.materials[area][i] };
  }
  return null;
};

// materials one at a time: admins and employees both add/edit; employees delete only what they added.
// The id comes from the phone, so replaying a queued add is harmless.
app.post('/api/jobs/:id/materials', requireUser(), async (req, res) => {
  const area = req.body?.area;
  if (!MATERIAL_AREAS.includes(area)) throw bad(400, 'Elige una zona');
  const item = materialItem(req.body.item || {}, req.user.email);
  res.json(await withJob(req, (data) => {
    data.materials ??= {};
    const found = findMaterial(data, item.id);
    if (found) data.materials[found.area].splice(found.i, 1);
    (data.materials[area] ??= []).push(found ? { ...item, createdBy: found.item.createdBy } : item);
  }));
});
app.patch('/api/jobs/:id/materials/:mid', requireUser(), async (req, res) => {
  res.json(await withJob(req, (data) => {
    const found = findMaterial(data, req.params.mid);
    if (!found) throw bad(404, 'Ese material ya se eliminó');
    const item = materialItem({ ...found.item, ...req.body, id: found.item.id, createdBy: found.item.createdBy });
    const area = MATERIAL_AREAS.includes(req.body?.area) ? req.body.area : found.area;
    data.materials[found.area].splice(found.i, 1);
    (data.materials[area] ??= []).push(item);
  }));
});
app.delete('/api/jobs/:id/materials/:mid', requireUser(), async (req, res) => {
  res.json(await withJob(req, (data) => {
    const found = findMaterial(data, req.params.mid);
    if (!found) return; // already gone: deleting twice is fine
    if (req.user.role !== 'admin' && found.item.createdBy !== req.user.email) throw bad(403, 'Solo el administrador puede quitar materiales que no añadiste tú');
    data.materials[found.area].splice(found.i, 1);
  }));
});

// the photo spot in the URL: its slug (or, from the first version of the app, its position)
const room = (job, req) => {
  const r = findRoom(job, req.params.room);
  if (!r || !['before', 'after'].includes(req.params.type)) throw bad(404, 'Esa zona de fotos ya no está en este trabajo');
  return r;
};
const jpeg = express.raw({ type: ['image/jpeg', 'image/png'], limit: '12mb' });
const isImage = (b) => Buffer.isBuffer(b) && b.length > 4 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50));

// photos live in storage as jobs/<id>/<room>_<before|after>.jpg, like the Flutter app's file names;
// extra photos of a spot as <room>_<before|after>_<extra id>.jpg
const keyOf = (path) => { const m = /^\/api\/jobs\/([^/]+)\/files\/([a-z0-9_]+\.jpg)/.exec(path || ''); return m && `jobs/${m[1]}/${m[2]}`; };
const fileUrl = (id, file) => `/api/jobs/${id}/files/${file}?v=${Date.now()}`;

app.put('/api/jobs/:id/photos/:room/:type', requireUser(), jpeg, async (req, res) => {
  if (!isImage(req.body)) throw bad(400, 'Envía una foto JPEG o PNG');
  const r = room(await loadJob(req), req), t = req.params.type;
  const file = `${slug(r)}_${t}.jpg`;
  await storage.put(`jobs/${req.params.id}/${file}`, req.body, req.headers['content-type']);
  let old;
  res.json(await withJob(req, (data) => {
    const p = ((data.photos ??= {})[r] ??= {});
    old = keyOf(p[`${t}Path`]); // after a promotion the main photo can be an extra's file
    Object.assign(p, { [`${t}Path`]: fileUrl(req.params.id, file), [`${t}TakenBy`]: req.user.email, [`${t}At`]: new Date().toISOString() });
  }));
  if (old && old !== `jobs/${req.params.id}/${file}`) storage.del(old).catch(() => {});
});

app.delete('/api/jobs/:id/photos/:room/:type', requireUser(), async (req, res) => {
  const r = room(await loadJob(req), req), t = req.params.type;
  let old;
  res.json(await withJob(req, (data) => {
    const p = data.photos?.[r];
    if (!p?.[`${t}Path`]) return; // already gone
    old = keyOf(p[`${t}Path`]);
    dropMain(p, t);
  }));
  if (old) storage.del(old).catch(() => {});
});

// extra photos: the id comes from the device, so a resent upload replaces instead of duplicating
const xid = (req) => { if (!/^[a-z0-9]{6,32}$/.test(req.params.xid)) throw bad(400, 'Identificador no válido'); return req.params.xid; };
app.put('/api/jobs/:id/photos/:room/:type/:xid', requireUser(), jpeg, async (req, res) => {
  if (!isImage(req.body)) throw bad(400, 'Envía una foto JPEG o PNG');
  const r = room(await loadJob(req), req), t = req.params.type, id = xid(req);
  const file = `${slug(r)}_${t}_${id}.jpg`;
  await storage.put(`jobs/${req.params.id}/${file}`, req.body, req.headers['content-type']);
  res.json(await withJob(req, (data) => {
    const p = ((data.photos ??= {})[r] ??= {});
    const photo = { id, path: fileUrl(req.params.id, file), by: req.user.email, at: new Date().toISOString() };
    const list = (p[`${t}Extra`] ??= []), i = list.findIndex((x) => x.id === id);
    if (i >= 0) list[i] = photo;
    else if (!p[`${t}Path`]) Object.assign(p, { [`${t}Path`]: photo.path, [`${t}TakenBy`]: photo.by, [`${t}At`]: photo.at }); // main was deleted meanwhile: this one is it
    else if (list.length >= MAX_EXTRA) throw bad(400, `Como máximo ${MAX_EXTRA + 1} fotos por zona`);
    else list.push(photo);
  }));
});
app.delete('/api/jobs/:id/photos/:room/:type/:xid', requireUser(), async (req, res) => {
  const r = room(await loadJob(req), req), t = req.params.type, id = xid(req);
  let old;
  res.json(await withJob(req, (data) => {
    const p = data.photos?.[r];
    old = keyOf(p?.[`${t}Extra`]?.find((x) => x.id === id)?.path); // its stored file: the spot may have been renamed since
    if (p?.[`${t}Extra`]) p[`${t}Extra`] = p[`${t}Extra`].filter((x) => x.id !== id);
  }));
  if (old) storage.del(old).catch(() => {});
});

// photo spots on a job: anyone working on it can add one on site; a spot can only be removed while it has no photos
app.post('/api/jobs/:id/rooms', requireUser(), async (req, res) => {
  const [name] = cleanRooms([req.body?.name]);
  if (!name) throw bad(400, 'Ponle un nombre a la zona');
  res.json(await withJob(req, (data) => {
    const rooms = [...roomsOf(data)];
    if (rooms.some((r) => slug(r) === slug(name))) return; // already there (or a resend)
    if (rooms.length >= MAX_ROOMS) throw bad(400, `Como máximo ${MAX_ROOMS} zonas de fotos`);
    data.rooms = [...rooms, name];
    (data.photos ??= {})[name] ??= {};
  }));
});
// rename a spot: its photos move with it (their files keep their old names — the paths are stored on the job)
app.patch('/api/jobs/:id/rooms/:room', requireUser(), async (req, res) => {
  const [name] = cleanRooms([req.body?.name]);
  if (!name) throw bad(400, 'Ponle un nombre a la zona');
  res.json(await withJob(req, (data) => {
    const r = findRoom(data, req.params.room), rooms = [...roomsOf(data)];
    if (!r) { if (rooms.includes(name)) return; throw bad(404, 'Esa zona de fotos ya no está en este trabajo'); } // resent rename
    if (r === name) return;
    if (rooms.some((x) => x !== r && slug(x) === slug(name))) throw bad(409, `Ya hay una zona “${tr(name)}”`);
    data.rooms = rooms.map((x) => (x === r ? name : x));
    if (data.photos?.[r]) { data.photos[name] = data.photos[r]; delete data.photos[r]; }
  }));
});
app.delete('/api/jobs/:id/rooms/:room', requireUser(), async (req, res) => {
  res.json(await withJob(req, (data) => {
    const r = findRoom(data, req.params.room);
    if (!r) return; // already gone
    if (photosOf(data, r, 'before').length || photosOf(data, r, 'after').length) throw bad(409, `“${tr(r)}” tiene fotos — bórralas primero`);
    data.rooms = roomsOf(data).filter((x) => x !== r);
    delete data.photos?.[r];
  }));
});

app.put('/api/jobs/:id/files/problem', requireUser(), jpeg, async (req, res) => {
  if (!isImage(req.body)) throw bad(400, 'Envía una foto JPEG o PNG');
  await loadJob(req);
  // ?pid=<problem id> makes the name stable, so a resent upload overwrites instead of duplicating
  const pid = /^[a-z0-9]{6,32}$/.test(req.query.pid || '') ? req.query.pid : String(Date.now());
  const file = `problem_${pid}_issue.jpg`;
  await storage.put(`jobs/${req.params.id}/${file}`, req.body, req.headers['content-type']);
  res.json({ url: `/api/jobs/${req.params.id}/files/${file}` });
});

app.post('/api/jobs/:id/problems', requireUser(), async (req, res) => {
  const problem = problemItem(req.body || {}, req.user.email, req.params.id);
  let added = false;
  const job = await withJob(req, (data) => {
    data.problems ??= [];
    if (!data.problems.some((p) => p.id === problem.id)) { data.problems.push(problem); added = true; } // else: resend of a queued report
  });
  res.json(job);
  if (added) notify(pool, { role: 'admin', except: req.user.id }, { title: `Problema: ${tr(problem.category)}`, body: `${address(job)}${problem.area ? ` · ${tr(problem.area)}` : ''} — ${problem.description}`, url: `/#/jobs/${job.id}/problems`, tag: `${job.id}:problem` });
});

// customer change requests, signed on the worker's phone; the id comes from the phone so a resend never duplicates one
app.post('/api/jobs/:id/changes', requireUser(), async (req, res) => {
  const change = changeItem(req.body || {}, req.user.email);
  let added = false;
  const job = await withJob(req, (data) => {
    data.changes ??= [];
    if (!data.changes.some((c) => c.id === change.id)) { data.changes.push(change); added = true; }
  });
  res.json(job);
  if (added && isSigned(change)) notify(pool, { role: 'admin', except: req.user.id }, { title: `Cambio firmado: ${tr(change.type)}`, body: `${address(job)} — ${change.description} (${change.customerName})`, url: `/#/jobs/${job.id}/changes`, tag: `${job.id}:change` });
});
// a change still waiting for its signature can be cancelled (wrong text, customer said no); signed ones stay
app.delete('/api/jobs/:id/changes/:cid', requireUser(), async (req, res) => {
  res.json(await withJob(req, (data) => {
    const c = (data.changes || []).find((x) => x.id === req.params.cid);
    if (!c) return; // already gone
    if (isSigned(c)) throw bad(409, 'El cliente ya lo ha firmado — no se puede quitar');
    data.changes = data.changes.filter((x) => x !== c);
  }));
});

// ── condition photos (quotes, and jobs made from them): photo + where + note, locked once the client signs ──
const conditionOpen = (data) => { if (conditionLocked(data)) throw bad(409, 'El cliente ya firmó el estado de la vivienda — no se pueden cambiar las fotos'); };
app.put('/api/jobs/:id/condition/:xid', requireUser(), jpeg, async (req, res) => {
  if (!isImage(req.body)) throw bad(400, 'Envía una foto JPEG o PNG');
  conditionOpen(await loadJob(req));
  const id = xid(req), file = `cond_${id}.jpg`;
  await storage.put(`jobs/${req.params.id}/${file}`, req.body, req.headers['content-type']);
  res.json(await withJob(req, (data) => {
    conditionOpen(data);
    const list = (data.condition ??= []), i = list.findIndex((x) => x.id === id);
    const photo = { id, path: fileUrl(req.params.id, file), ...conditionMeta(req.query), by: req.user.email, at: new Date().toISOString() };
    if (i >= 0) list[i] = { ...list[i], path: photo.path }; // resend: keep what was written since
    else if (list.length >= MAX_CONDITION) throw bad(400, `Como máximo ${MAX_CONDITION} fotos`);
    else list.push(photo);
  }));
});
app.patch('/api/jobs/:id/condition/:xid', requireUser(), async (req, res) => {
  const id = xid(req);
  res.json(await withJob(req, (data) => {
    conditionOpen(data);
    const p = (data.condition || []).find((x) => x.id === id);
    if (p) Object.assign(p, conditionMeta({ area: p.area, note: p.note, ...req.body }));
  }));
});
app.delete('/api/jobs/:id/condition/:xid', requireUser(), async (req, res) => {
  const id = xid(req);
  let old;
  res.json(await withJob(req, (data) => {
    const p = (data.condition || []).find((x) => x.id === id);
    if (!p) return;
    conditionOpen(data);
    old = keyOf(p.path);
    data.condition = data.condition.filter((x) => x !== p);
  }));
  if (old) storage.del(old).catch(() => {});
});
// the client signs the condition photos: here ({customerName, signature}) or later by link ({remote, signCode})
app.post('/api/jobs/:id/condition-sign', requireUser(), async (req, res) => {
  const b = req.body || {};
  const next = b.remote
    ? { customerName: String(b.customerName || '').trim().slice(0, 120), signature: null, signedAt: null, signCode: CODE_RE.test(b.signCode || '') ? b.signCode : newCode(), sentBy: req.user.email, sentAt: new Date().toISOString() }
    : { ...signature(b), signedAt: new Date().toISOString(), signedVia: 'device', witnessedBy: req.user.email };
  let fresh = false;
  const job = await withJob(req, (data) => {
    if (conditionLocked(data)) return; // already signed (or a resend)
    if (!data.condition?.length) throw bad(400, 'Haz al menos una foto antes de firmar');
    if (!next.signedAt && data.conditionSign?.signCode) return; // link already made: keep it, so links sent earlier still work
    data.conditionSign = { ...next, ...(next.signedAt ? { photoIds: data.condition.map((p) => p.id) } : {}) };
    fresh = !!next.signedAt;
  });
  res.json(job);
  if (fresh) notify(pool, { role: 'admin', except: req.user.id }, { title: 'Estado de la vivienda firmado', body: `${job.personName || address(job)} — ${job.condition.length} fotos`, url: `/#/${isQuote(job) ? 'quotes' : 'jobs'}/${job.id}`, tag: `${job.id}:condition` });
});

// quote → job: a normal job with the client details, the work, and the condition photos (copied) + signature.
// Admins choose who does it; an employee converting their own quote gets the job.
app.post('/api/jobs/:id/convert', requireUser(), async (req, res) => {
  const q = await loadJob(req);
  if (!isQuote(q)) throw bad(400, 'Esto no es un presupuesto');
  if (q.convertedTo) return res.json({ quote: q, jobId: q.convertedTo });
  const assignedTo = req.user.role === 'admin' ? String(req.body?.assignedTo ?? '').trim().toLowerCase() : req.user.email;
  const job = await insertNumbered('LCC', (id) => {
    const j = newJob(id, { ...q, assignedTo, clientId: undefined }, req.user.email);
    return Object.assign(j, { fromQuote: q.id, work: q.work, price: q.price, condition: [], conditionSign: q.conditionSign && { ...q.conditionSign } });
  });
  // photo files move under the job, so whoever is assigned can open them
  const condition = [];
  for (const p of q.condition || []) {
    const got = await storage.get(keyOf(p.path)).catch(() => null);
    if (!got?.ok) continue;
    const file = `cond_${p.id}.jpg`;
    await storage.put(`jobs/${job.id}/${file}`, Buffer.from(await got.arrayBuffer()), 'image/jpeg');
    condition.push({ ...p, path: fileUrl(job.id, file) });
  }
  // a link still waiting for the client's signature now belongs to the job; a signed one stays readable from the quote
  if (job.conditionSign?.signedAt) delete job.conditionSign.signCode;
  await pool.query(`update jobs set data = data || $2::jsonb where id = $1`, [job.id, { condition, conditionSign: job.conditionSign }]);
  const quote = await withJob(req, (data) => {
    data.convertedTo = job.id; data.convertedAt = new Date().toISOString();
    if (data.conditionSign && !data.conditionSign.signedAt) delete data.conditionSign.signCode;
  });
  res.json({ quote, jobId: job.id });
});

// ── signing by link: public, the long random code in the link is the only key ──
// The code belongs to a customer change, or to a condition-photo signature.
const byCode = async (db, code, lock = false) => {
  if (!CODE_RE.test(code)) throw bad(404, 'This link is not valid');
  const { rows } = await db.query(`select data from jobs where data->'changes' @> $1::jsonb or data->'conditionSign'->>'signCode' = $2 limit 1 ${lock ? 'for update' : ''}`,
    [JSON.stringify([{ signCode: code }]), code]);
  const job = rows[0]?.data;
  if (job?.conditionSign?.signCode === code) return { job, target: job.conditionSign, kind: 'condition' };
  const change = job?.changes?.find((c) => c.signCode === code);
  if (!change) throw bad(404, 'This link is not valid or was cancelled');
  return { job, target: change, kind: 'change' };
};
const publicView = ({ job, target: c, kind }, code) => ({
  kind, company: 'LCC Bathrooms & Services Ltd', address: address(job), jobId: job.id, customerName: c.customerName || job.personName || '',
  signed: !!c.signedAt, signedAt: c.signedAt, signature: c.signature,
  ...(kind === 'change' ? { type: c.type, description: c.description, declaration: CHANGE_DECLARATION }
    : { declaration: CONDITION_DECLARATION, photos: (job.condition || []).filter((p) => !c.photoIds || c.photoIds.includes(p.id))
      .map((p) => ({ area: p.area, note: p.note, at: p.at, url: `/api/sign/${code}/photo/${p.id}` })) }),
});
app.get('/api/sign/:code', async (req, res) => {
  res.set('cache-control', 'no-store').json(publicView(await byCode(pool, req.params.code), req.params.code));
});
app.get('/api/sign/:code/photo/:xid', async (req, res) => {
  const { job, kind } = await byCode(pool, req.params.code);
  const p = kind === 'condition' && (job.condition || []).find((x) => x.id === req.params.xid);
  const r = p && await storage.get(keyOf(p.path));
  if (!r?.ok) throw bad(404, 'Photo not found');
  res.set({ 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' }).send(Buffer.from(await r.arrayBuffer()));
});
app.post('/api/sign/:code', async (req, res) => {
  let sig;
  try { sig = signature(req.body || {}); } catch { throw bad(400, 'Please type your name and sign in the box'); }
  const client = await pool.connect();
  let found, fresh = false;
  try {
    await client.query('begin');
    found = await byCode(client, req.params.code, true);
    const { job, target, kind } = found;
    if (!target.signedAt) {
      if (kind === 'condition' && !job.condition?.length) throw bad(400, 'There are no photos to sign yet');
      Object.assign(target, sig, { signedAt: new Date().toISOString(), signedVia: 'link', signedIp: clientIp(req), signedAgent: String(req.headers['user-agent'] || '').slice(0, 300),
        ...(kind === 'condition' ? { photoIds: job.condition.map((p) => p.id) } : {}) });
      await client.query('update jobs set data = $2 where id = $1', [job.id, job]);
      fresh = true;
    }
    await client.query('commit');
  } catch (e) { await client.query('rollback').catch(() => {}); throw e; }
  finally { client.release(); }
  res.json(publicView(found, req.params.code));
  if (!fresh) return;
  const { job, target, kind } = found;
  const note = kind === 'change'
    ? { title: `Cambio firmado: ${tr(target.type)}`, body: `${address(job)} — ${target.description} (${target.customerName})`, url: `/#/jobs/${job.id}/changes`, tag: `${job.id}:change` }
    : { title: 'Estado de la vivienda firmado', body: `${target.customerName} — ${job.condition.length} fotos · ${address(job) || job.id}`, url: `/#/${isQuote(job) ? 'quotes' : 'jobs'}/${job.id}`, tag: `${job.id}:condition` };
  notify(pool, { role: 'admin' }, note);
  if (job.assignedTo) notify(pool, { emails: [job.assignedTo], role: 'employee' }, note);
});

const fileKey = (req) => {
  if (!/^[a-z0-9_]+\.jpg$/.test(req.params.file)) throw bad(404, 'No encontrado');
  return `jobs/${req.params.id}/${req.params.file}`;
};
app.get('/api/jobs/:id/files/:file', requireUser(), async (req, res) => {
  const key = fileKey(req);
  await loadJob(req);
  const r = await storage.get(key);
  if (!r.ok) throw bad(404, 'Foto no encontrada');
  // the URL carries ?v=<upload time>, so a replaced photo gets a new URL
  res.set({ 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' })
    .send(Buffer.from(await r.arrayBuffer()));
});

// the report PDF with every photo it shows; opts.materials / opts.problems / opts.changes = false leave those sections out
async function jobPdf(job, opts = {}) {
  const images = {}; // photo path -> Buffer
  const paths = [...roomsOf(job).flatMap((r) => ['before', 'after'].flatMap((t) => photosOf(job, r, t))).map((p) => p.path),
    ...(opts.problems === false ? [] : (job.problems || []).map((p) => p.photoPath).filter(Boolean)), ...(job.condition || []).map((p) => p.path)];
  await Promise.all(paths.map(async (path) => {
    const got = await storage.get(keyOf(path)).catch(() => null);
    if (got?.ok) images[path] = Buffer.from(await got.arrayBuffer());
  }));
  return reportPdf(job, images, opts);
}

app.get('/api/jobs/:id/pdf', requireUser(), async (req, res) => {
  const job = await loadJob(req);
  res.set({
    'content-type': 'application/pdf', 'cache-control': 'private, no-store',
    'content-disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${pdfFilename(job)}"`,
  }).send(await jobPdf(job, { materials: req.query.materials !== '0', problems: req.query.problems !== '0', changes: req.query.changes !== '0' }));
});

// every submitted report goes to the office by email, PDF attached (REPORT_EMAIL_TO, default Daniel)
async function emailReport(job, by) {
  if (!emailConfigured()) return console.warn(`[email] not set up — report ${job.id} not emailed`);
  const to = process.env.REPORT_EMAIL_TO || 'daniel@lccbathroom-services.com';
  await sendEmail({
    to, subject: `Informe terminado: ${address(job)} (${job.id})`,
    text: `${by} ha enviado el informe del trabajo ${job.id}.\n\n${address(job)}\n\nEl informe en PDF va adjunto. También puedes verlo en la app: https://lcc.perchito.app/#/reports/${job.id}`,
    attachments: [{ filename: pdfFilename(job), content: await jobPdf(job), contentType: 'application/pdf' }],
  });
  console.log(`[email] report ${job.id} sent to ${to}`);
}

app.use('/api/push', requireUser(), pushRoutes(pool));
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

// Cloudflare gives .js/.css a 4h browser cache, so index.html (never cached) points
// at them with ?v=<start time> and every restart busts it. Same stamp inside modules.
const VERSION = Date.now().toString(36);
const stamped = (path) => readFileSync(path, 'utf8').replaceAll('__V__', VERSION);
const indexHtml = stamped('public/index.html');
const signHtml = readFileSync('public/sign.html', 'utf8');
app.get('/sign/:code', (req, res) => res.set('Cache-Control', 'no-cache').type('html').send(signHtml));
app.get(['/', '/index.html'], (req, res) => res.set('Cache-Control', 'no-cache').type('html').send(indexHtml));
// every front-end module, stamped so `import './ui.js?v=__V__'` is one shared instance per deploy
const jsFiles = Object.fromEntries(readdirSync('public').filter((f) => f.endsWith('.js') && f !== 'sw.js').map((f) => [`/${f}`, stamped(`public/${f}`)]));
jsFiles['/jobs.mjs'] = readFileSync('lib/jobs.mjs', 'utf8');
// the service worker gets the version too, so a deploy installs a fresh app-shell cache
jsFiles['/sw.js'] = stamped('public/sw.js');
app.get(Object.keys(jsFiles), (req, res) => res.set('Cache-Control', 'no-cache').type('js').send(jsFiles[req.path]));
app.use(express.static('public', { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.status === 413 ? 'La foto es demasiado grande' : err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'Ese correo ya lo usa otra cuenta' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Identificador no válido' });
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

app.listen(PORT, () => console.log(`LCC Property Reports on :${PORT}`));
