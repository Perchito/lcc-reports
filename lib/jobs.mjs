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
  return job;
}

function bad(message) { return Object.assign(new Error(message), { status: 400 }); }

const str = (v, max = 500) => { if (typeof v !== 'string') throw bad('Expected text'); return v.trim().slice(0, max); };
const isoOrNull = (v) => { if (v === null) return null; if (Number.isNaN(Date.parse(v))) throw bad('Bad date'); return new Date(v).toISOString(); };

function materials(v) {
  if (!v || typeof v !== 'object') throw bad('Bad materials');
  return Object.fromEntries(MATERIAL_AREAS.map((area) => [area, (Array.isArray(v[area]) ? v[area] : []).map((m) => {
    const description = str(m.description, 200);
    if (!description) throw bad('Material needs a description');
    const quantity = Number(m.quantity);
    return {
      description, specification: str(m.specification ?? '', 300),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit: MATERIAL_UNITS.includes(m.unit) ? m.unit : 'Pieces',
      status: MATERIAL_STATUSES.includes(m.status) ? m.status : 'To Order',
    };
  })]));
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

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert')).strict;
  const j = newJob('LCC-2026-00001', { houseNumber: '12', street: 'High St', town: 'London', postcode: 'W5 1AA' }, 'a@x');
  assert.equal(address(j), '12, High St, London, W5 1AA');
  assert.equal(Object.keys(j.photos).length, 8);
  assert.throws(() => newJob('x', { street: 'a' }, 'a'));
  assert.deepEqual(cleanPatch({ status: 'Completed' }, 'employee'), { status: 'Completed' });
  assert.throws(() => cleanPatch({ status: 'Admin Reviewed' }, 'employee'));
  assert.throws(() => cleanPatch({ materials: {} }, 'employee'));
  assert.throws(() => cleanPatch({ assignedTo: 'x' }, 'employee'));
  assert.equal(cleanPatch({ assignedTo: ' Maria@LCC.com ' }, 'admin').assignedTo, 'maria@lcc.com');
  const m = cleanPatch({ materials: { Kitchen: [{ description: 'Paint', quantity: '2.5', unit: 'Litres', status: 'nope' }] } }, 'admin').materials;
  assert.deepEqual(m.Kitchen[0], { description: 'Paint', specification: '', quantity: 2.5, unit: 'Litres', status: 'To Order' });
  assert.deepEqual(m.Bathroom, []);
  assert.equal(slug('Kitchen (Side 1)'), 'kitchen_side_1_');
  console.log('jobs ok');
}
