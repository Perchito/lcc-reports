// Job model: the same constants and JSON shape as the Flutter app's lib/models/job.dart.
// Shared by the server and (via /api/config) the browser.

// The eight fixed photo identities. Before and after photos share the room
// key, so "Kitchen (Side 1) BEFORE" always matches its AFTER. Don't reorder.
export const PHOTO_ROOMS = [
  'Living Room', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3',
  'Kitchen (Side 1)', 'Kitchen (Side 2)', 'Bathroom (Side 1)', 'Bathroom (Side 2)',
];
export const MATERIAL_AREAS = ['Living Room', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Kitchen', 'Bathroom'];
export const MATERIAL_STATUSES = ['To Order', 'Ordered', 'Received', 'Installed'];
export const MATERIAL_UNITS = ['Pieces', 'Litres', 'Metres', 'm2', 'Boxes', 'Packs', 'Bags'];
export const PROBLEM_CATEGORIES = [
  'Missing material', "Can't access property", 'Damaged item', 'Extra work required',
  'Problem with property', 'Photo problem', 'Other',
];
export const STATUS = {
  draft: 'Draft', readyToStart: 'Ready to Start', assigned: 'Assigned', workInProgress: 'Work In Progress',
  awaitingAfterPhotos: 'Awaiting After Photos', completed: 'Completed', reportGenerated: 'Report Generated',
  adminReviewed: 'Admin Reviewed',
};

const PROPERTY = ['houseNumber', 'street', 'town', 'postcode', 'keySafePin', 'personName', 'personPhone', 'personEmail'];

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_');
export const address = (j) => [j.houseNumber, j.street, j.town, j.postcode].filter((p) => String(p || '').trim()).join(', ');

export function newJob(id, body, createdBy) {
  const job = {
    id, createdBy, createdAt: new Date().toISOString(), status: STATUS.draft, assignedTo: '',
    reportGeneratedAt: null, submittedAt: null,
    materials: Object.fromEntries(MATERIAL_AREAS.map((a) => [a, []])),
    photos: Object.fromEntries(PHOTO_ROOMS.map((r) => [r, {}])),
    problems: [],
  };
  for (const k of PROPERTY) job[k] = String(body[k] ?? '').trim();
  for (const k of ['houseNumber', 'street', 'town', 'postcode']) if (!job[k]) throw bad(`${k} is required`);
  // assigning while creating (the redesigned app does it in one step, also when created offline)
  if ('assignedTo' in body) {
    job.assignedTo = String(body.assignedTo || '').trim().toLowerCase();
    job.status = job.assignedTo ? STATUS.assigned : STATUS.readyToStart;
    if (job.assignedTo) job.assignedAt = job.createdAt;
  }
  // id made on the phone for a job created offline: a resend finds this job instead of making a second one
  if (validId(body.clientId)) job.clientId = body.clientId;
  return job;
}

function bad(message) { return Object.assign(new Error(message), { status: 400 }); }

const str = (v, max = 500) => { if (typeof v !== 'string') throw bad('Expected text'); return v.trim().slice(0, max); };
const isoOrNull = (v) => { if (v === null) return null; if (Number.isNaN(Date.parse(v))) throw bad('Bad date'); return new Date(v).toISOString(); };

// short random id for materials/problems (crypto.randomUUID exists in Node and every current browser)
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const ID_RE = /^[a-z0-9]{6,32}$/;
const validId = (v) => typeof v === 'string' && ID_RE.test(v);

/** One material line, cleaned. Keeps a valid client id (offline-created items) or makes one. */
export function materialItem(m, createdBy) {
  const description = str(m?.description ?? '', 200);
  if (!description) throw bad('Material needs a description');
  const quantity = Number(m.quantity);
  return {
    id: validId(m.id) ? m.id : newId(),
    description, specification: str(m.specification ?? '', 300),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit: MATERIAL_UNITS.includes(m.unit) ? m.unit : 'Pieces',
    status: MATERIAL_STATUSES.includes(m.status) ? m.status : 'To Order',
    ...(m.createdBy || createdBy ? { createdBy: m.createdBy || createdBy } : {}),
  };
}

function materials(v) {
  if (!v || typeof v !== 'object') throw bad('Bad materials');
  return Object.fromEntries(MATERIAL_AREAS.map((area) => [area, (Array.isArray(v[area]) ? v[area] : []).map((m) => materialItem(m))]));
}

/** Cleans a reported problem; the id comes from the phone so a resend never duplicates it. */
export function problemItem(p, createdBy, jobId) {
  if (!PROBLEM_CATEGORIES.includes(p?.category)) throw bad('Pick a problem type');
  const description = str(p.description ?? '', 2000);
  if (!description) throw bad('Please describe the problem');
  const photoPath = p.photoPath ?? null;
  if (photoPath !== null && !String(photoPath).startsWith(`/api/jobs/${jobId}/files/problem_`)) throw bad('Bad photo');
  const area = p.area ? str(p.area, 60) : '';
  return { id: validId(p.id) ? p.id : newId(), category: p.category, area, description, photoPath, createdBy, createdAt: new Date().toISOString() };
}

/**
 * Cleans a PATCH body into the top-level fields this role may change.
 * Admin: property info, assignee, materials, status, dates. Employee: workflow
 * status (never "Admin Reviewed") + report/submit dates — like the Flutter app,
 * where employees only see materials read-only.
 */
export function cleanPatch(body, role) {
  const out = {};
  const admin = role === 'admin';
  for (const [k, v] of Object.entries(body || {})) {
    if (admin && PROPERTY.includes(k)) out[k] = str(v, 200);
    else if (admin && k === 'assignedTo') out[k] = str(v, 200).toLowerCase();
    else if (admin && k === 'materials') out[k] = materials(v);
    else if (k === 'status') {
      if (!Object.values(STATUS).includes(v) || (!admin && v === STATUS.adminReviewed)) throw bad('Bad status');
      out[k] = v;
    } else if (k === 'reportGeneratedAt' || k === 'submittedAt') out[k] = isoOrNull(v);
    else throw bad(`Can't change ${k}`);
  }
  return out;
}

// ── job progress: the one place the UI and server agree on where a job stands ──
export const photoCount = (j, type) => PHOTO_ROOMS.filter((r) => j.photos?.[r]?.[`${type}Path`]).length;
export const missingPhotos = (j, type) => PHOTO_ROOMS.filter((r) => !j.photos?.[r]?.[`${type}Path`]);
export const materialCount = (j) => MATERIAL_AREAS.reduce((n, a) => n + (j.materials?.[a]?.length || 0), 0);
export const materialList = (j) => MATERIAL_AREAS.flatMap((area) => (j.materials?.[area] || []).map((m) => ({ ...m, area })));

/** What people see: the stored status, plus "Awaiting Review" once submitted and not yet reviewed. */
export function displayStatus(j) {
  if (j.status === STATUS.adminReviewed) return 'Reviewed';
  if (j.submittedAt) return 'Awaiting Review';
  if (j.status === STATUS.workInProgress && photoCount(j, 'before') === 8 && photoCount(j, 'after') < 8 && photoCount(j, 'after') > 0) return 'Awaiting After Photos';
  if (j.status === STATUS.workInProgress) return 'In Progress';
  if (j.status === STATUS.reportGenerated || j.status === STATUS.completed) return 'Completed';
  return j.status || STATUS.draft;
}

/** Four stages: before photos, after photos, report generated, submitted. Photos count partially. */
export function progress(j) {
  const before = photoCount(j, 'before'), after = photoCount(j, 'after');
  const stages = [
    { key: 'before', label: 'Before photos', done: before === 8, part: before / 8 },
    { key: 'after', label: 'After photos', done: after === 8, part: after / 8 },
    { key: 'report', label: 'Report generated', done: !!j.reportGeneratedAt, part: j.reportGeneratedAt ? 1 : 0 },
    { key: 'submit', label: 'Submitted', done: !!j.submittedAt || j.status === STATUS.adminReviewed, part: j.submittedAt || j.status === STATUS.adminReviewed ? 1 : 0 },
  ];
  const pct = Math.round((stages.reduce((n, s) => n + s.part, 0) / stages.length) * 100);
  return { stages, pct, done: stages.filter((s) => s.done).length, total: stages.length, before, after };
}

/** Checklist shown before submitting; `fix` is the route that sorts the problem. */
export function reviewChecklist(j) {
  const before = photoCount(j, 'before'), after = photoCount(j, 'after');
  return [
    { label: 'Property details', ok: !!address(j).trim(), detail: address(j) || 'Address missing', fix: 'edit' },
    { label: 'Before photos', ok: before === 8, detail: `${before} / 8 completed`, fix: 'photos/before' },
    { label: 'Materials recorded', ok: true, detail: `${materialCount(j)} item${materialCount(j) === 1 ? '' : 's'}`, fix: 'materials' },
    { label: 'Problems reviewed', ok: true, detail: `${j.problems?.length || 0} reported`, fix: 'problems' },
    { label: 'After photos', ok: after === 8, detail: `${after} / 8 completed`, fix: 'photos/after' },
  ];
}

const isStarted = (j) => ![STATUS.draft, STATUS.readyToStart, STATUS.assigned].includes(j.status);
export const isOpen = (j) => !j.submittedAt && j.status !== STATUS.adminReviewed;

/** The single next thing to do on a job: { label, step } where step is a route under #/jobs/<id>/. */
export function nextStep(j, role = 'employee') {
  if (role === 'admin' && j.submittedAt && j.status !== STATUS.adminReviewed) return { label: 'Review report', step: 'report' };
  if (!isOpen(j)) return { label: 'View report', step: 'report' };
  if (!isStarted(j)) return { label: 'Start job', step: 'start' };
  if (photoCount(j, 'before') < 8) return { label: 'Before photos', step: 'photos/before' };
  if (photoCount(j, 'after') < 8) return { label: 'After photos', step: 'photos/after' };
  return { label: 'Review & submit', step: 'review' };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert')).strict;
  const j = newJob('LCC-2026-00001', { houseNumber: '12', street: 'High St', town: 'London', postcode: 'W5 1AA' }, 'a@x');
  assert.equal(address(j), '12, High St, London, W5 1AA');
  assert.equal(Object.keys(j.photos).length, 8);
  assert.throws(() => newJob('x', { street: 'a' }, 'a'));
  const nj = newJob('y', { houseNumber: '1', street: 'a', town: 'b', postcode: 'c', assignedTo: ' Maria@X.com', clientId: 'abcdef123456' }, 'a');
  assert.equal(nj.assignedTo, 'maria@x.com'); assert.equal(nj.status, STATUS.assigned); assert.equal(nj.clientId, 'abcdef123456');
  assert.deepEqual(cleanPatch({ status: 'Completed' }, 'employee'), { status: 'Completed' });
  assert.throws(() => cleanPatch({ status: 'Admin Reviewed' }, 'employee'));
  assert.throws(() => cleanPatch({ materials: {} }, 'employee'));
  assert.throws(() => cleanPatch({ assignedTo: 'x' }, 'employee'));
  assert.equal(cleanPatch({ assignedTo: ' Maria@LCC.com ' }, 'admin').assignedTo, 'maria@lcc.com');
  const m = cleanPatch({ materials: { Kitchen: [{ description: 'Paint', quantity: '2.5', unit: 'Litres', status: 'nope' }] } }, 'admin').materials;
  assert.match(m.Kitchen[0].id, /^[a-z0-9]{16}$/); delete m.Kitchen[0].id;
  assert.deepEqual(m.Kitchen[0], { description: 'Paint', specification: '', quantity: 2.5, unit: 'Litres', status: 'To Order' });
  assert.deepEqual(m.Bathroom, []);
  assert.equal(slug('Kitchen (Side 1)'), 'kitchen_side_1_');
  const withId = materialItem({ description: 'Tiles', id: 'abc123def' }, 'e@x');
  assert.equal(withId.id, 'abc123def'); assert.equal(withId.createdBy, 'e@x');
  assert.match(materialItem({ description: 'x', id: 'BAD!' }).id, /^[a-z0-9]{16}$/);
  assert.throws(() => problemItem({ category: 'Other', description: 'x', photoPath: '/evil' }, 'e', 'J'));
  assert.equal(problemItem({ category: 'Other', description: ' x ', id: 'p1p1p1p1' }, 'e', 'J').id, 'p1p1p1p1');
  const p0 = progress(j);
  assert.equal(p0.pct, 0); assert.equal(nextStep(j).step, 'start'); assert.equal(displayStatus(j), 'Draft');
  j.status = STATUS.workInProgress;
  for (const r of PHOTO_ROOMS) j.photos[r].beforePath = 'x';
  assert.equal(progress(j).pct, 25); assert.equal(nextStep(j).step, 'photos/after');
  j.photos['Living Room'].afterPath = 'x';
  assert.equal(displayStatus(j), 'Awaiting After Photos');
  for (const r of PHOTO_ROOMS) j.photos[r].afterPath = 'x';
  assert.equal(nextStep(j).step, 'review'); assert.ok(reviewChecklist(j).every((c) => c.ok));
  j.submittedAt = 'now'; j.reportGeneratedAt = 'now';
  assert.equal(progress(j).pct, 100); assert.equal(displayStatus(j), 'Awaiting Review');
  assert.equal(nextStep(j, 'admin').step, 'report'); assert.equal(nextStep(j).label, 'View report');
  console.log('jobs ok');
}
