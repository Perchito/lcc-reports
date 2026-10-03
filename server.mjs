import express from 'express';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import {
  SESSION_DAYS, hashPassword, verifyPassword, newToken, newPassword, tokenHash, readCookie,
  loginBlocked, loginFailed, loginOk,
} from './lib/auth.mjs';
import { homeStorage } from './lib/home-storage.mjs';
import { PHOTO_ROOMS, PROBLEM_CATEGORIES, newJob, cleanPatch, slug } from './lib/jobs.mjs';
import { reportPdf, pdfFilename } from './lib/pdf.mjs';

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
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  if (role && req.user.role !== role) return res.status(403).json({ error: 'Not allowed' });
  next();
};
const admin = requireUser('admin');

app.post('/api/login', async (req, res) => {
  const ip = clientIp(req);
  if (loginBlocked(ip)) return res.status(429).json({ error: 'Too many attempts — try again in 15 minutes.' });
  const { email = '', password = '' } = req.body || {};
  const { rows } = await pool.query('select id, pass_hash from users where lower(email) = lower($1) and active', [String(email).trim()]);
  if (!rows[0] || !verifyPassword(String(password), rows[0].pass_hash)) {
    loginFailed(ip);
    console.warn(`[auth] failed login for ${String(email).slice(0, 80)} from ${ip}`);
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  loginOk(ip);
  const token = newToken();
  await pool.query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + $3::interval)',
    [tokenHash(token), rows[0].id, `${SESSION_DAYS} days`]);
  await pool.query('delete from sessions where expires_at < now()');
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_DAYS * 86400_000 });
  res.json({ ok: true });
});

app.post('/api/logout', async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) await pool.query('delete from sessions where token_hash = $1', [tokenHash(token)]);
  res.clearCookie(COOKIE).json({ ok: true });
});

app.get('/api/me', requireUser(), (req, res) => res.json(req.user));

app.post('/api/password', requireUser(), async (req, res) => {
  const { current = '', next = '' } = req.body || {};
  if (String(next).length < 8) throw bad(400, 'New password needs at least 8 characters');
  const { rows } = await pool.query('select pass_hash from users where id = $1', [req.user.id]);
  if (!verifyPassword(String(current), rows[0].pass_hash)) throw bad(400, 'Current password is wrong');
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
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) throw bad(400, 'Name and a valid email are needed');
  const password = newPassword();
  await pool.query('insert into users (email, name, role, pass_hash) values ($1, $2, $3, $4)', [email, name, role, hashPassword(password)]);
  res.json({ email, password });
});
app.patch('/api/users/:id', admin, async (req, res) => {
  const { active, resetPassword } = req.body || {};
  if (req.params.id === req.user.id && active === false) throw bad(400, "You can't deactivate yourself");
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
// admin sees every job; an employee only the jobs assigned to their email
const visible = (i) => `($${i}::text = 'admin' or lower(data->>'assignedTo') = lower($${i + 1}))`;
const who = (u) => [u.role, u.email];

app.get('/api/jobs', requireUser(), async (req, res) => {
  const { rows } = await pool.query(`select data from jobs where ${visible(1)} order by created_at desc`, who(req.user));
  res.json(rows.map((r) => r.data));
});

async function loadJob(req) {
  const { rows } = await pool.query(`select data from jobs where id = $1 and ${visible(2)}`, [req.params.id, ...who(req.user)]);
  if (!rows[0]) throw bad(404, 'Job not found');
  return rows[0].data;
}
app.get('/api/jobs/:id', requireUser(), async (req, res) => res.json(await loadJob(req)));

// unique Job ID per year: LCC-2026-00001, LCC-2026-00002, …
app.post('/api/jobs', admin, async (req, res) => {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { rows: [{ n }] } = await pool.query(
      `select coalesce(max(substring(id from '\\d+$')::int), 0) + 1 as n from jobs where id like $1`, [`LCC-${year}-%`]);
    const job = newJob(`LCC-${year}-${String(n).padStart(5, '0')}`, req.body || {}, req.user.email);
    try {
      await pool.query('insert into jobs (id, data) values ($1, $2)', [job.id, job]);
      return res.json(job);
    } catch (e) { if (e.code !== '23505') throw e; } // two admins at once: take the next number
  }
  throw bad(409, 'Could not allocate a Job ID, try again');
});

// every write is a targeted change on the server's copy, so two people working
// on the same job never overwrite each other's photos or materials
async function update(req, sql, params) {
  await loadJob(req); // access check
  const { rows } = await pool.query(`update jobs set data = ${sql} where id = $1 returning data`, [req.params.id, ...params]);
  return rows[0].data;
}

app.patch('/api/jobs/:id', requireUser(), async (req, res) => {
  res.json(await update(req, 'data || $2::jsonb', [cleanPatch(req.body, req.user.role)]));
});

const room = (req) => {
  const r = PHOTO_ROOMS[Number(req.params.room)];
  if (!r || !['before', 'after'].includes(req.params.type)) throw bad(404, 'No such photo slot');
  return r;
};
const jpeg = express.raw({ type: ['image/jpeg', 'image/png'], limit: '12mb' });
const isImage = (b) => Buffer.isBuffer(b) && b.length > 4 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50));

// photos live in storage as jobs/<id>/<room>_<before|after>.jpg, like the Flutter app's file names
app.put('/api/jobs/:id/photos/:room/:type', requireUser(), jpeg, async (req, res) => {
  const r = room(req), t = req.params.type;
  if (!isImage(req.body)) throw bad(400, 'Send a JPEG or PNG photo');
  await loadJob(req);
  const file = `${slug(r)}_${t}.jpg`;
  await storage.put(`jobs/${req.params.id}/${file}`, req.body, req.headers['content-type']);
  const patch = { [`${t}Path`]: `/api/jobs/${req.params.id}/files/${file}?v=${Date.now()}`, [`${t}TakenBy`]: req.user.email, [`${t}At`]: new Date().toISOString() };
  res.json(await update(req, `jsonb_set(data, array['photos', $2], coalesce(data->'photos'->$2, '{}') || $3::jsonb)`, [r, patch]));
});

app.delete('/api/jobs/:id/photos/:room/:type', requireUser(), async (req, res) => {
  const r = room(req), t = req.params.type;
  const patch = { [`${t}Path`]: null, [`${t}TakenBy`]: null, [`${t}At`]: null };
  const job = await update(req, `jsonb_set(data, array['photos', $2], coalesce(data->'photos'->$2, '{}') || $3::jsonb)`, [r, patch]);
  storage.del(`jobs/${req.params.id}/${slug(r)}_${t}.jpg`).catch(() => {});
  res.json(job);
});

app.put('/api/jobs/:id/files/problem', requireUser(), jpeg, async (req, res) => {
  if (!isImage(req.body)) throw bad(400, 'Send a JPEG or PNG photo');
  await loadJob(req);
  const file = `problem_${Date.now()}_issue.jpg`;
  await storage.put(`jobs/${req.params.id}/${file}`, req.body, req.headers['content-type']);
  res.json({ url: `/api/jobs/${req.params.id}/files/${file}` });
});

app.post('/api/jobs/:id/problems', requireUser(), async (req, res) => {
  const { category, description = '', photoPath = null } = req.body || {};
  if (!PROBLEM_CATEGORIES.includes(category)) throw bad(400, 'Pick a problem type');
  if (!String(description).trim()) throw bad(400, 'Please describe the problem');
  if (photoPath !== null && !String(photoPath).startsWith(`/api/jobs/${req.params.id}/files/problem_`)) throw bad(400, 'Bad photo');
  const problem = { category, description: String(description).trim().slice(0, 2000), photoPath, createdBy: req.user.email, createdAt: new Date().toISOString() };
  res.json(await update(req, `jsonb_set(data, '{problems}', coalesce(data->'problems', '[]') || $2::jsonb)`, [JSON.stringify([problem])]));
});

const fileKey = (req) => {
  if (!/^[a-z0-9_]+\.jpg$/.test(req.params.file)) throw bad(404, 'Not found');
  return `jobs/${req.params.id}/${req.params.file}`;
};
app.get('/api/jobs/:id/files/:file', requireUser(), async (req, res) => {
  const key = fileKey(req);
  await loadJob(req);
  const r = await storage.get(key);
  if (!r.ok) throw bad(404, 'Photo not found');
  // the URL carries ?v=<upload time>, so a replaced photo gets a new URL
  res.set({ 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' })
    .send(Buffer.from(await r.arrayBuffer()));
});

app.get('/api/jobs/:id/pdf', requireUser(), async (req, res) => {
  const job = await loadJob(req);
  const images = {};
  await Promise.all(PHOTO_ROOMS.flatMap((r) => ['before', 'after'].map(async (t) => {
    const path = job.photos?.[r]?.[`${t}Path`];
    if (!path) return;
    const got = await storage.get(`jobs/${job.id}/${slug(r)}_${t}.jpg`).catch(() => null);
    if (got?.ok) images[`${r}|${t}`] = Buffer.from(await got.arrayBuffer());
  })));
  res.set({
    'content-type': 'application/pdf', 'cache-control': 'private, no-store',
    'content-disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${pdfFilename(job)}"`,
  }).send(await reportPdf(job, images));
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Cloudflare gives .js/.css a 4h browser cache, so index.html (never cached) points
// at them with ?v=<start time> and every restart busts it. Same stamp inside modules.
const VERSION = Date.now().toString(36);
const stamped = (path) => readFileSync(path, 'utf8').replaceAll('__V__', VERSION);
const indexHtml = stamped('public/index.html');
app.get(['/', '/index.html'], (req, res) => res.set('Cache-Control', 'no-cache').type('html').send(indexHtml));
const jsFiles = { '/app.js': stamped('public/app.js'), '/jobs.mjs': readFileSync('lib/jobs.mjs', 'utf8') };
app.get(Object.keys(jsFiles), (req, res) => res.set('Cache-Control', 'no-cache').type('js').send(jsFiles[req.path]));
app.use(express.static('public', { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.status === 413 ? 'That photo is too big' : err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'That email is already used by another account' });
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid id' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => console.log(`LCC Property Reports on :${PORT}`));
