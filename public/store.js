// Offline store + sync engine.
//
// The server is the source of truth; this keeps a per-user copy of the jobs on the
// device (IndexedDB) and an outbox of changes made here. What screens see is
// "server copy + changes still waiting", so work done offline shows immediately and
// survives closing the app. Photos are saved as blobs on the device first and only
// then uploaded. The outbox is replayed in order whenever the server is reachable.
//
//   local change → IndexedDB outbox (queued) → server reachable → sending → server
//   confirms → removed (job copy updated)   |   refused → kept as failed (retry/discard)
import { PHOTO_ROOMS, MATERIAL_AREAS, newJob, roomsOf, slug } from './jobs.mjs?v=__V__';

// ── IndexedDB: kv (job cache per user), outbox (changes), blobs (photos not yet uploaded) ──
const db = new Promise((resolve, reject) => {
  const req = indexedDB.open('lcc-reports', 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore('kv');
    req.result.createObjectStore('outbox', { keyPath: 'id' });
    req.result.createObjectStore('blobs');
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function tx(name, mode, fn) {
  const d = await db;
  return new Promise((resolve, reject) => {
    const t = d.transaction(name, mode);
    const r = fn(t.objectStore(name));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}
const kvGet = (k) => tx('kv', 'readonly', (s) => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k));

// ── state ───────────────────────────────────────────────
let me = null;
export const user = () => me;
const server = new Map(); // id -> job as the server last returned it
let ops = [];             // this user's outbox, oldest first
const alias = new Map();  // temporary id of a job created offline -> the real Job ID the server gave it
const canon = (id) => alias.get(id) || id;
export const sync = {
  reachable: navigator.onLine, // last real contact with the server (navigator.onLine alone can lie)
  flushing: false, sendingId: null, error: '', loaded: false,
  lastSynced: null,
};
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let notifyQueued = false;
function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => { notifyQueued = false; listeners.forEach((fn) => fn()); });
}

/** Start the store for a logged-in user: load their cached jobs + outbox, then refresh. */
export async function start(user) {
  me = user;
  server.clear();
  for (const j of (await kvGet(`jobs:${me.id}`)) || []) server.set(j.id, j);
  sync.lastSynced = (await kvGet(`synced:${me.id}`)) || null;
  ops = ((await tx('outbox', 'readonly', (s) => s.getAll())) || []).filter((o) => o.uid === me.id).sort((a, b) => a.seq - b.seq);
  alias.clear();
  for (const [k, v] of Object.entries((await kvGet(`alias:${me.id}`)) || {})) alias.set(k, v);
  sync.loaded = server.size > 0 || !!sync.lastSynced;
  notify();
  refresh();
}

/** Forget this user's data on the device (logout). */
export async function reset() {
  if (!me) return;
  const uid = me.id;
  for (const o of ops) if (o.blobKey) await tx('blobs', 'readwrite', (s) => s.delete(o.blobKey));
  await tx('outbox', 'readwrite', (s) => ops.forEach((o) => s.delete(o.id)));
  await tx('kv', 'readwrite', (s) => {
    for (const k of ['jobs', 'synced', 'alias', 'users']) s.delete(`${k}:${uid}`);
    s.delete(IDBKeyRange.bound(`draft:${uid}:`, `draft:${uid}:\uffff`));
  });
  await tx('blobs', 'readwrite', (s) => s.delete(IDBKeyRange.bound(`draft:${uid}:`, `draft:${uid}:\uffff`)));
  alias.clear();
  blobUrls.forEach((u) => URL.revokeObjectURL(u)); blobUrls.clear();
  me = null; ops = []; server.clear(); sync.loaded = false;
}

// ── talking to the server ───────────────────────────────
export class Offline extends Error { constructor() { super('Sin conexión — puedes seguir trabajando, los cambios se sincronizarán solos.'); this.offline = true; } }

/** fetch + JSON for online-only actions (login, team, new job, PDFs). */
export async function api(path, { method = 'GET', body, raw } = {}) {
  const init = { method, headers: {} };
  if (raw) { init.body = raw; init.headers['content-type'] = raw.type || 'image/jpeg'; }
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  let res;
  try { res = await fetch(path, init); } catch { setReachable(false); throw new Offline(); }
  setReachable(true);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { window.dispatchEvent(new Event('lcc:logged-out')); throw new Error('Vuelve a iniciar sesión'); }
  if (!res.ok) throw Object.assign(new Error(data.error || `Algo salió mal (${res.status})`), { status: res.status });
  return data;
}
function setReachable(v) {
  if (sync.reachable === v) return;
  sync.reachable = v; notify();
  if (v) flush();
}

async function saveCache() {
  if (!me) return;
  await kvSet(`jobs:${me.id}`, [...server.values()]);
}

/** Pull the job list from the server; keeps the cached copy when offline. */
export async function refresh() {
  if (!me) return;
  try {
    const list = await api('/api/jobs');
    server.clear();
    for (const j of list) server.set(j.id, j);
    sync.loaded = true;
    await saveCache();
    markSynced();
  } catch (e) { if (!e.offline) sync.error = e.message; }
  notify();
  flush();
}
function markSynced() { sync.lastSynced = Date.now(); if (me) kvSet(`synced:${me.id}`, sync.lastSynced); }

/** One job, from the server when possible (fresh), else the device copy. */
export async function loadJob(id) {
  id = canon(id);
  if (isTemp(id)) return job(id); // created offline, not on the server yet
  try {
    const j = await api(`/api/jobs/${encodeURIComponent(id)}`);
    server.set(j.id, j); saveCache(); notify();
  } catch (e) { if (!e.offline && e.status === 404) { server.delete(id); saveCache(); } else if (!e.offline) throw e; }
  return job(id);
}

// ── reading: server copy + pending changes ──────────────
export const isTemp = (id) => String(id).startsWith('NEW-');
export const jobs = () => [...new Set([...server.keys(), ...ops.filter((o) => o.kind === 'create').map((o) => o.jobId)])].map(job).filter(Boolean)
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
export function job(id) {
  id = canon(id);
  let base = server.get(id);
  if (!base) { // a job created on this device that hasn't reached the server yet
    const c = ops.find((o) => o.kind === 'create' && o.jobId === id);
    if (!c) return null;
    base = { ...newJob(id, c.body, me?.email), createdAt: new Date(c.seq).toISOString(), pendingCreate: true };
  }
  return ops.filter((o) => o.jobId === id && o.kind !== 'create').reduce(applyOp, structuredClone(base));
}

/** Applies one queued change to a job copy — mirrors what the server will do with it. */
export function applyOp(j, o) {
  const b = o.body;
  const findMat = (mid) => { for (const area of MATERIAL_AREAS) { const i = (j.materials?.[area] || []).findIndex((m) => m.id === mid); if (i >= 0) return { area, i }; } return null; };
  switch (o.kind) {
    case 'patch': Object.assign(j, b); break;
    case 'photo': case 'photoDel': {
      const room = typeof b.room === 'number' ? PHOTO_ROOMS[b.room] : b.room, t = b.type; // number: queued by the first version
      j.photos[room] = { ...j.photos[room], [`${t}Path`]: o.kind === 'photo' ? `local:${o.blobKey}` : null, [`${t}TakenBy`]: o.kind === 'photo' ? me?.email : null, [`${t}At`]: o.kind === 'photo' ? new Date(o.seq).toISOString() : null };
      break;
    }
    case 'roomAdd': if (!roomsOf(j).some((r) => slug(r) === slug(b.name))) { j.rooms = [...roomsOf(j), b.name]; (j.photos ??= {})[b.name] ??= {}; } break;
    case 'roomDel': j.rooms = roomsOf(j).filter((r) => r !== b.name); delete j.photos?.[b.name]; break;
    case 'matAdd': { const f = findMat(b.item.id); if (f) j.materials[f.area].splice(f.i, 1); (j.materials[b.area] ??= []).push({ createdBy: me?.email, ...b.item }); break; }
    case 'matEdit': { const f = findMat(b.mid); if (f) { const item = { ...j.materials[f.area][f.i], ...b.fields }; j.materials[f.area].splice(f.i, 1); (j.materials[b.fields.area || f.area] ??= []).push(item); delete item.area; } break; }
    case 'matDel': { const f = findMat(b.mid); if (f) j.materials[f.area].splice(f.i, 1); break; }
    case 'problem': if (!j.problems?.some((p) => p.id === b.id)) (j.problems ??= []).push({ ...b, photoPath: o.blobKey ? `local:${o.blobKey}` : null, createdBy: me?.email, createdAt: new Date(o.seq).toISOString() }); break;
  }
  return j;
}

// ── writing: every change goes through the outbox ───────
let seq = Date.now();
async function enqueue(op, blob) {
  if (op.kind !== 'create' && alias.has(op.jobId)) { op.id = op.id.replace(op.jobId, alias.get(op.jobId)); op.jobId = alias.get(op.jobId); }
  op = { ...op, uid: me.id, seq: Math.max(++seq, Date.now()), state: 'queued', error: '' };
  const prev = ops.find((o) => o.id === op.id); // same slot again (retake / delete): replaces the waiting one
  if (prev?.blobKey) { await tx('blobs', 'readwrite', (s) => s.delete(prev.blobKey)); dropUrl(prev.blobKey); }
  if (blob) { op.blobKey = `${op.id}:${op.seq}`; await tx('blobs', 'readwrite', (s) => s.put(blob, op.blobKey)); }
  await tx('outbox', 'readwrite', (s) => s.put(op));
  ops = [...ops.filter((o) => o.id !== op.id), op];
  notify();
  flush();
}
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);

/** New job (admin). Works offline: it gets a temporary NEW-… id until the server issues the Job ID. */
export function createJob(body) {
  const tempId = `NEW-${rid().slice(0, 8).toUpperCase()}`;
  enqueue({ id: `create:${tempId}`, jobId: tempId, kind: 'create', body: { ...body, clientId: rid() } });
  return tempId;
}
export const patch = (jobId, body) => enqueue({ id: `patch:${jobId}:${rid()}`, jobId, kind: 'patch', body });
// photo slots are addressed by the spot's name (slug in ids and URLs)
export const photo = (jobId, room, type, blob) => enqueue({ id: `slot:${jobId}:${slug(room)}:${type}`, jobId, kind: 'photo', body: { room, type } }, blob);
export const deletePhoto = (jobId, room, type) => enqueue({ id: `slot:${jobId}:${slug(room)}:${type}`, jobId, kind: 'photoDel', body: { room, type } });
export const addRoom = (jobId, name) => enqueue({ id: `room:${jobId}:${slug(name)}:${rid()}`, jobId, kind: 'roomAdd', body: { name } });
export const removeRoom = (jobId, name) => enqueue({ id: `room:${jobId}:${slug(name)}:${rid()}`, jobId, kind: 'roomDel', body: { name } });
export const addMaterial = (jobId, area, item) => { const id = item.id || rid(); enqueue({ id: `mat:${jobId}:${id}:${rid()}`, jobId, kind: 'matAdd', body: { area, item: { ...item, id } } }); return id; };
export const editMaterial = (jobId, mid, fields) => enqueue({ id: `mat:${jobId}:${mid}:${rid()}`, jobId, kind: 'matEdit', body: { mid, fields } });
export const deleteMaterial = (jobId, mid) => enqueue({ id: `mat:${jobId}:${mid}:${rid()}`, jobId, kind: 'matDel', body: { mid } });
export function addProblem(jobId, problem, blob) {
  const id = rid();
  enqueue({ id: `problem:${jobId}:${id}`, jobId, kind: 'problem', body: { ...problem, id } }, blob);
  return id;
}

// ── sync ────────────────────────────────────────────────
const enc = encodeURIComponent;
async function send(o) {
  const b = o.body, base = `/api/jobs/${enc(o.jobId)}`;
  const blob = o.blobKey ? await tx('blobs', 'readonly', (s) => s.get(o.blobKey)) : null;
  switch (o.kind) {
    case 'create': return api('/api/jobs', { method: 'POST', body: b });
    case 'patch': return api(base, { method: 'PATCH', body: b });
    case 'photo':
      if (!blob) throw Object.assign(new Error('La foto ya no está en este móvil — vuelve a hacerla'), { status: 410 });
      return api(`${base}/photos/${enc(typeof b.room === 'number' ? b.room : slug(b.room))}/${b.type}`, { method: 'PUT', raw: blob });
    case 'photoDel': return api(`${base}/photos/${enc(typeof b.room === 'number' ? b.room : slug(b.room))}/${b.type}`, { method: 'DELETE' });
    case 'roomAdd': return api(`${base}/rooms`, { method: 'POST', body: b });
    case 'roomDel': return api(`${base}/rooms/${enc(slug(b.name))}`, { method: 'DELETE' });
    case 'matAdd': return api(`${base}/materials`, { method: 'POST', body: b });
    case 'matEdit': return api(`${base}/materials/${enc(b.mid)}`, { method: 'PATCH', body: b.fields });
    case 'matDel': return api(`${base}/materials/${enc(b.mid)}`, { method: 'DELETE' });
    case 'problem': {
      let photoPath = null;
      if (blob) photoPath = (await api(`${base}/files/problem?pid=${enc(b.id)}`, { method: 'PUT', raw: blob })).url;
      return api(`${base}/problems`, { method: 'POST', body: { ...b, photoPath } });
    }
  }
}
// the server gave a job created offline its real Job ID: move its waiting changes over to it
async function adopt(tempId, realId) {
  alias.set(tempId, realId);
  await kvSet(`alias:${me.id}`, Object.fromEntries(alias));
  for (const o of ops.filter((x) => x.jobId === tempId)) {
    const moved = { ...o, jobId: realId, id: o.id.replace(tempId, realId) };
    await tx('outbox', 'readwrite', (s) => { s.delete(o.id); s.put(moved); });
    ops[ops.indexOf(o)] = moved;
  }
  window.dispatchEvent(new CustomEvent('lcc:job-id', { detail: { tempId, realId } }));
}
async function removeOp(o) {
  await tx('outbox', 'readwrite', (s) => s.delete(o.id));
  if (o.blobKey) { await tx('blobs', 'readwrite', (s) => s.delete(o.blobKey)); dropUrl(o.blobKey); }
  ops = ops.filter((x) => x !== o);
}

let retryTimer = null, retryDelay = 4000;
export async function flush() {
  if (sync.flushing || !me) return;
  sync.flushing = true; clearTimeout(retryTimer); notify();
  try {
    for (;;) {
      // next waiting change; failed ones wait for Retry/Discard, and changes to a job created
      // offline wait until that job exists on the server
      const o = ops.find((x) => x.state !== 'failed' && (x.kind === 'create' || !ops.some((c) => c.kind === 'create' && c.jobId === x.jobId)));
      if (!o) break;
      sync.sendingId = o.id; notify();
      try {
        const j = await send(o);
        if (j?.id) { server.set(j.id, j); await saveCache(); }
        await removeOp(o);
        if (o.kind === 'create') await adopt(o.jobId, j.id);
      } catch (e) {
        if (e.offline) { retryTimer = setTimeout(flush, retryDelay); retryDelay = Math.min(retryDelay * 2, 60_000); return; }
        if (!e.status || e.status >= 500 || e.status === 429 || e.status === 401) { // server trouble / signed out: keep it, try later
          sync.error = e.status === 401 ? 'Vuelve a iniciar sesión para enviar tu trabajo guardado.' : 'El servidor tuvo un problema — tu trabajo está a salvo y se volverá a intentar.';
          retryTimer = setTimeout(flush, retryDelay); retryDelay = Math.min(retryDelay * 2, 60_000);
          return;
        }
        // refused for good (e.g. job reassigned): keep it visible, never silently drop
        o.state = 'failed'; o.error = e.message;
        await tx('outbox', 'readwrite', (s) => s.put(o));
      }
    }
    retryDelay = 4000;
    if (!ops.some((o) => o.state === 'failed')) sync.error = '';
    if (!ops.length) markSynced();
  } finally { sync.flushing = false; sync.sendingId = null; notify(); }
}
export async function retry(id) {
  const o = ops.find((x) => x.id === id);
  if (o) { o.state = 'queued'; o.error = ''; await tx('outbox', 'readwrite', (s) => s.put(o)); }
  flush();
}
export async function discard(id) { const o = ops.find((x) => x.id === id); if (o) await removeOp(o); notify(); }
export const syncNow = async () => { ops.forEach((o) => { if (o.state === 'failed') o.state = 'queued'; }); await health(); await refresh(); };

// ── what screens ask about the queue ────────────────────
export const pending = (jobId) => ops.filter((o) => !jobId || o.jobId === canon(jobId));
export const pendingCount = () => ops.length;
/** 'uploading' | 'queued' | 'failed' | null for one photo slot */
export function slotState(jobId, room, type) {
  jobId = canon(jobId);
  const o = ops.find((x) => x.id === `slot:${jobId}:${slug(room)}:${type}`);
  if (!o) return null;
  if (o.state === 'failed') return 'failed';
  return sync.sendingId === o.id ? 'uploading' : 'queued';
}
export const slotOp = (jobId, room, type) => ops.find((x) => x.id === `slot:${canon(jobId)}:${slug(room)}:${type}`);
export const OP_LABEL = { roomAdd: 'Nueva zona de fotos', roomDel: 'Zona de fotos quitada', create: 'Nuevo trabajo', patch: 'Cambio en el trabajo', photo: 'Foto', photoDel: 'Foto borrada', matAdd: 'Nuevo material', matEdit: 'Cambio de material', matDel: 'Material quitado', problem: 'Problema comunicado' };

// ── drafts (forms in progress) and the employee list, per user, wiped on sign-out ──
export const getDraft = (key) => kvGet(`draft:${me.id}:${key}`);
export const saveDraft = (key, value) => kvSet(`draft:${me.id}:${key}`, value);
export const clearDraft = (key) => tx('kv', 'readwrite', (s) => s.delete(`draft:${me.id}:${key}`));
export const getDraftBlob = (key) => tx('blobs', 'readonly', (s) => s.get(`draft:${me.id}:${key}`));
export const saveDraftBlob = (key, blob) => tx('blobs', 'readwrite', (s) => (blob ? s.put(blob, `draft:${me.id}:${key}`) : s.delete(`draft:${me.id}:${key}`)));
export const cachedUsers = () => kvGet(`users:${me.id}`);
export const cacheUsers = (list) => kvSet(`users:${me.id}`, list);

// photos still on the device, as object URLs
const blobUrls = new Map();
function dropUrl(key) { const u = blobUrls.get(key); if (u) { URL.revokeObjectURL(u); blobUrls.delete(key); } }
export async function localUrl(key) {
  if (!blobUrls.has(key)) {
    const blob = await tx('blobs', 'readonly', (s) => s.get(key));
    if (!blob) return null;
    blobUrls.set(key, URL.createObjectURL(blob));
  }
  return blobUrls.get(key);
}

// ── connectivity: real health checks, not just navigator.onLine ──
export async function health() {
  try { const r = await fetch('/api/health', { cache: 'no-store' }); setReachable(r.ok); }
  catch { setReachable(false); }
  return sync.reachable;
}
addEventListener('online', () => health());
addEventListener('offline', () => setReachable(false));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && me) { health(); refresh(); } });
// gentle background check only while there is something to send or we think we're offline
setInterval(() => { if (me && (ops.length || !sync.reachable) && document.visibilityState === 'visible') health(); }, 30_000);
// and pick up new assignments / reviews every couple of minutes while the app is open
setInterval(() => { if (me && sync.reachable && !sync.flushing && document.visibilityState === 'visible') refresh(); }, 120_000);
navigator.storage?.persist?.(); // ask the browser not to evict unsent photos
