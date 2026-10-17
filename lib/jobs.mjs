// Job model: the same constants and JSON shape as the Flutter app's lib/models/job.dart.
// Shared by the server and (served as /jobs.mjs) the browser.

// The standard photo spots a new job starts with (the admin can change them per job, and spots can be
// added or removed on site). Before and after photos share the spot name, so they always pair. For jobs
// created before per-job spots existed (no `rooms` field), these eight are the list. Don't reorder.
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

// ── Spanish labels for values the app stores in English ──
// Statuses, rooms, areas, units and problem types are saved in English (data + the PDF report stay
// as they were); people see them in Spanish. Names typed by users (custom photo spots) show as typed.
const ES = {
  // job status (displayStatus) + stored statuses
  Draft: 'Borrador', 'Ready to Start': 'Listo para empezar', Assigned: 'Asignado', 'In Progress': 'En curso', 'Work In Progress': 'En curso',
  'Awaiting After Photos': 'Faltan fotos después', 'Awaiting Review': 'Pendiente de revisión', Completed: 'Completado', 'Report Generated': 'Informe generado',
  Reviewed: 'Revisado', 'Admin Reviewed': 'Revisado',
  // photo spots / areas
  'Living Room': 'Salón', 'Bedroom 1': 'Dormitorio 1', 'Bedroom 2': 'Dormitorio 2', 'Bedroom 3': 'Dormitorio 3',
  'Kitchen (Side 1)': 'Cocina (lado 1)', 'Kitchen (Side 2)': 'Cocina (lado 2)', 'Bathroom (Side 1)': 'Baño (lado 1)', 'Bathroom (Side 2)': 'Baño (lado 2)',
  Kitchen: 'Cocina', Bathroom: 'Baño', 'Whole property': 'Toda la vivienda', Hallway: 'Pasillo', Stairs: 'Escaleras', Garden: 'Jardín',
  // materials
  'To Order': 'Por pedir', Ordered: 'Pedido', Received: 'Recibido', Installed: 'Instalado',
  Pieces: 'Piezas', Litres: 'Litros', Metres: 'Metros', m2: 'm²', Boxes: 'Cajas', Packs: 'Paquetes', Bags: 'Bolsas',
  // problems
  'Missing material': 'Falta material', "Can't access property": 'No se puede acceder', 'Damaged item': 'Algo dañado',
  'Extra work required': 'Trabajo extra', 'Problem with property': 'Problema en la vivienda', 'Photo problem': 'Problema con fotos', Other: 'Otro',
  // customer changes
  Add: 'Añadir', Remove: 'Quitar',
  // health & safety
  'Safety boots': 'Botas de seguridad', Gloves: 'Guantes', 'Safety glasses': 'Gafas de seguridad', 'Dust mask (FFP2/FFP3)': 'Mascarilla (FFP2/FFP3)',
  'Ear protection': 'Protección auditiva', 'Hi-vis vest': 'Chaleco reflectante', 'Hard hat': 'Casco',
  // final checklists
  "Bath or shower tray secure and level": "Bañera o plato de ducha fijos y nivelados",
  "Shower screen or enclosure secure and operating correctly": "Mampara o cabina de ducha fija y funcionando bien",
  "Toilet secure and flushing correctly": "Inodoro fijo y la cisterna funciona bien",
  "Basin secure and taps operating correctly": "Lavabo fijo y grifos funcionando bien",
  "Hot and cold water working correctly": "Agua caliente y fría funcionando bien",
  "All accessible plumbing connections checked for leaks": "Todas las conexiones de fontanería accesibles revisadas, sin fugas",
  "Waste outlets draining correctly": "Desagües vaciando bien",
  "Silicone seals complete and neat": "Sellados de silicona completos y limpios",
  "Tiles secure, grout complete and no obvious damage": "Azulejos fijos, juntas completas y sin daños visibles",
  "Flooring secure, clean and free from trip hazards": "Suelo fijo, limpio y sin riesgo de tropiezo",
  "Walls and ceiling finished to the agreed specification": "Paredes y techo terminados según lo acordado",
  "Lights and extractor fan checked where applicable": "Luces y extractor revisados (si aplica)",
  "Accessories and grab rails secure where fitted": "Accesorios y asideros fijos (si se han puesto)",
  "Access panels and service valves accessible": "Registros y llaves de paso accesibles",
  "No exposed wiring, sharp edges or other safety hazards": "Sin cables a la vista, bordes cortantes ni otros peligros",
  "Bathroom cleaned and free from dust and debris": "Baño limpio, sin polvo ni escombros",
  "All rubbish, tools and surplus materials removed": "Retirada toda la basura, herramientas y material sobrante",
  "No damage to doors, frames or surrounding areas": "Sin daños en puertas, marcos ni zonas de alrededor",
  "Before-and-after photographs uploaded": "Fotos de antes y después subidas",
  "Required specialist tests and certificates recorded where applicable": "Pruebas y certificados necesarios registrados (si aplica)",
  "Outstanding defects or incomplete works reported": "Defectos o trabajos pendientes comunicados",
  "Property left secure and safe for the resident": "Vivienda cerrada y segura para el residente",
  "All kitchen units secure and level": "Todos los muebles de cocina fijos y nivelados",
  "Cupboard doors and drawers open and close correctly": "Puertas y cajones abren y cierran bien",
  "Handles, hinges, plinths and end panels secure": "Tiradores, bisagras, zócalos y laterales fijos",
  "Worktops secure, with joints and edges properly finished": "Encimeras fijas, con juntas y cantos bien terminados",
  "Sink secure and taps operating correctly": "Fregadero fijo y grifos funcionando bien",
  "Sink waste draining correctly": "Desagüe del fregadero vaciando bien",
  "Splashbacks and tiles secure, with grout complete": "Frontales y azulejos fijos, con juntas completas",
  "Flooring secure and free from trip hazards": "Suelo fijo y sin riesgo de tropiezo",
  "Walls, ceiling and paintwork finished to specification": "Paredes, techo y pintura terminados según lo acordado",
  "Lights, switches and sockets visually checked": "Luces, interruptores y enchufes revisados a la vista",
  "Extractor hood or ventilation checked where fitted": "Campana o ventilación revisada (si se ha puesto)",
  "Supplied appliances checked where included in the work order": "Electrodomésticos revisados (si están en la orden de trabajo)",
  "Stopcock and required service access maintained": "Llave de paso general y accesos necesarios despejados",
  "Kitchen cleaned, including cupboards and worktops": "Cocina limpia, incluidos armarios y encimeras",
  "Bathroom final checklist": "Lista final del baño",
  "Kitchen final checklist": "Lista final de la cocina",
};
export const tr = (v) => ES[v] ?? v;

// English copies of what workers write (filled by the server, lib/translate.mjs): `<field>En` made from `<field>EnOf`.
/** The English text to show a client: the translation if it is up to date, else what was written. */
export const en = (o, f) => (o?.[`${f}En`] && o[`${f}EnOf`] === o[f] ? o[`${f}En`] : o?.[f] || '');
export const needsEnglish = (o, f) => !!String(o?.[f] || '').trim() && o[`${f}EnOf`] !== o[f];
/** For staff screens: the English line under a worker's text, only when it differs from what they wrote. */
export const enLine = (o, f) => { const e = en(o, f); return e && e !== o?.[f] ? e : ''; };

const PROPERTY = ['houseNumber', 'street', 'town', 'postcode', 'keySafePin', 'personName', 'personPhone', 'personEmail'];

export const MAX_ROOMS = 30;
/** The job's photo spots (older jobs: the standard eight). */
export const roomsOf = (j) => (Array.isArray(j?.rooms) ? j.rooms : PHOTO_ROOMS);
/** Photo spot names, trimmed, no duplicates (two names that make the same file name count as the same). */
export function cleanRooms(list) {
  const out = [];
  for (const raw of list) {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (name && !out.some((r) => slug(r) === slug(name))) out.push(name);
  }
  if (out.length > MAX_ROOMS) throw bad(`Como máximo ${MAX_ROOMS} zonas de fotos`);
  return out;
}
/** A spot by its URL key: the slug the app sends, or (older app) the position in the list. */
export function findRoom(j, key) {
  const rooms = roomsOf(j);
  return /^\d+$/.test(String(key)) ? rooms[Number(key)] : rooms.find((r) => slug(r) === key);
}
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_');
export const address = (j) => [j.houseNumber, j.street, j.town, j.postcode].filter((p) => String(p || '').trim()).join(', ');

export function newJob(id, body, createdBy) {
  const job = {
    id, createdBy, createdAt: new Date().toISOString(), status: STATUS.draft, assignedTo: '',
    reportGeneratedAt: null, submittedAt: null,
    materials: Object.fromEntries(MATERIAL_AREAS.map((a) => [a, []])),
    rooms: [...PHOTO_ROOMS],
    photos: {},
    problems: [],
    changes: [],
  };
  for (const k of PROPERTY) job[k] = String(body[k] ?? '').trim();
  const NAMES = { houseNumber: 'el número', street: 'la calle', town: 'la ciudad', postcode: 'el código postal' };
  for (const k of ['houseNumber', 'street', 'town', 'postcode']) if (!job[k]) throw bad(`Falta ${NAMES[k]}`);
  if (Array.isArray(body.rooms)) job.rooms = cleanRooms(body.rooms);
  job.photos = Object.fromEntries(job.rooms.map((r) => [r, {}]));
  // assigning while creating (the redesigned app does it in one step, also when created offline)
  if ('assignedTo' in body) {
    job.assignedTo = String(body.assignedTo || '').trim().toLowerCase();
    job.status = job.assignedTo ? STATUS.assigned : STATUS.readyToStart;
    if (job.assignedTo) job.assignedAt = job.createdAt;
  }
  // id made on the phone for a job created offline: a resend finds this job instead of making a second one
  if (validId(body.clientId)) job.clientId = body.clientId;
  if ('finalTypes' in body) job.finalTypes = cleanFinalTypes(body.finalTypes);
  return job;
}

const cleanFinalTypes = (v) => Object.keys(FINAL).filter((t) => Array.isArray(v) && v.includes(t));
function bad(message) { return Object.assign(new Error(message), { status: 400 }); }

const str = (v, max = 500) => { if (typeof v !== 'string') throw bad('Se esperaba texto'); return v.trim().slice(0, max); };
const isoOrNull = (v) => { if (v === null) return null; if (Number.isNaN(Date.parse(v))) throw bad('Fecha no válida'); return new Date(v).toISOString(); };

// short random id for materials/problems (crypto.randomUUID exists in Node and every current browser)
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const ID_RE = /^[a-z0-9]{6,32}$/;
const validId = (v) => typeof v === 'string' && ID_RE.test(v);

/** One material line, cleaned. Keeps a valid client id (offline-created items) or makes one. */
export function materialItem(m, createdBy) {
  const description = str(m?.description ?? '', 200);
  if (!description) throw bad('El material necesita una descripción');
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
  if (!v || typeof v !== 'object') throw bad('Materiales no válidos');
  return Object.fromEntries(MATERIAL_AREAS.map((area) => [area, (Array.isArray(v[area]) ? v[area] : []).map((m) => materialItem(m))]));
}

/** Cleans a reported problem; the id comes from the phone so a resend never duplicates it. */
export function problemItem(p, createdBy, jobId) {
  if (!PROBLEM_CATEGORIES.includes(p?.category)) throw bad('Elige el tipo de problema');
  const description = str(p.description ?? '', 2000);
  if (!description) throw bad('Describe el problema');
  const photoPath = p.photoPath ?? null;
  if (photoPath !== null && !String(photoPath).startsWith(`/api/jobs/${jobId}/files/problem_`)) throw bad('Foto no válida');
  const area = p.area ? str(p.area, 60) : '';
  return { id: validId(p.id) ? p.id : newId(), category: p.category, area, description, photoPath, createdBy, createdAt: new Date().toISOString() };
}

// Customer change requests: something added to / taken off the agreed work, signed by the customer as proof —
// on the worker's phone, or later through a link (signCode) sent to the customer. Signed = final, no edit or delete.
export const CHANGE_TYPES = ['Add', 'Remove'];
export const CHANGE_DECLARATION = 'I confirm that I have asked LCC Bathrooms & Services Ltd to make the change described above, which was not part of the work originally agreed.';
export const SIG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
export const CODE_RE = /^[A-Za-z0-9_-]{20,64}$/;
export const newCode = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
export const isSigned = (c) => !!c?.signature;
/** Name + signature, as given by the customer. */
export function signature(c) {
  const customerName = str(c?.customerName ?? '', 120);
  if (!customerName) throw bad('Falta el nombre del cliente');
  if (typeof c.signature !== 'string' || !SIG_RE.test(c.signature) || c.signature.length > 300_000) throw bad('Falta la firma del cliente');
  return { customerName, signature: c.signature };
}
export function changeItem(c, createdBy) {
  if (!CHANGE_TYPES.includes(c?.type)) throw bad('Elige añadir o quitar');
  const description = str(c.description ?? '', 2000);
  if (!description) throw bad('Describe el cambio');
  const base = { id: validId(c.id) ? c.id : newId(), type: c.type, description, createdBy, createdAt: new Date().toISOString() };
  // to be signed through a link: the code comes from the phone, so the link can be shared before the change is synced
  if (c.remote) return { ...base, customerName: str(c.customerName ?? '', 120), signature: null, signedAt: null, signCode: CODE_RE.test(c.signCode ?? '') ? c.signCode : newCode() };
  const signedAt = c.signedAt && !Number.isNaN(Date.parse(c.signedAt)) ? new Date(c.signedAt).toISOString() : new Date().toISOString();
  // signedDescription: the English text the client read on the worker's phone (the app shows a translation)
  const shown = typeof c.signedDescription === 'string' && c.signedDescription.trim() ? { signedDescription: str(c.signedDescription, 2000) } : {};
  return { ...base, ...signature(c), ...shown, signedAt, signedVia: 'device' };
}

// ── quotes: a site visit for a new client before any job exists ──
// Stored in the jobs table with kind 'quote' (id Q-2026-00001): client details, the work and price, and photos of
// the property's condition, which the client signs (here or by link) so LCC can't be blamed for damage that was
// already there. "Convertir en trabajo" makes a normal job carrying the condition photos and signature.
export const isQuote = (j) => j?.kind === 'quote';
export const CONDITION_DECLARATION = 'I confirm that the photos above show the condition of the property before LCC Bathrooms & Services Ltd started any work, and that any damage or wear shown was already there.';
export const MAX_CONDITION = 200;
export function newQuote(id, body, createdBy) {
  const q = { id, kind: 'quote', createdBy, createdAt: new Date().toISOString(), work: '', price: null, condition: [], conditionSign: null, convertedTo: null };
  for (const k of PROPERTY) q[k] = String(body[k] ?? '').trim().slice(0, 200);
  Object.assign(q, quoteFields(body));
  if (!q.personName) throw bad('Falta el nombre del cliente');
  if (validId(body.clientId)) q.clientId = body.clientId;
  return q;
}
function quoteFields(body) {
  const out = {};
  if ('work' in body) out.work = str(body.work ?? '', 4000);
  if ('price' in body) {
    const n = body.price === '' || body.price == null ? null : Math.round(Number(String(body.price).replace(/[£,\s]/g, '')) * 100) / 100;
    if (n !== null && !(Number.isFinite(n) && n >= 0)) throw bad('Precio no válido');
    out.price = n;
  }
  return out;
}
/** Quote edits: anyone who can see the quote, until it becomes a job. */
export function cleanQuotePatch(body) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (PROPERTY.includes(k)) out[k] = str(v, 200);
    else if (k !== 'work' && k !== 'price') throw bad(`No se puede cambiar ${k}`);
  }
  Object.assign(out, quoteFields(body || {}));
  if ('personName' in out && !out.personName) throw bad('Falta el nombre del cliente');
  return out;
}
export const conditionMeta = (b) => ({ area: str(String(b?.area ?? ''), 60), note: str(String(b?.note ?? ''), 500) });
export const conditionLocked = (j) => !!j.conditionSign?.signedAt;
export const money = (n) => (n == null ? '' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

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
    else if (admin && k === 'finalTypes') out[k] = cleanFinalTypes(v);
    else if (k === 'status') {
      if (!Object.values(STATUS).includes(v) || (!admin && v === STATUS.adminReviewed)) throw bad('Estado no válido');
      out[k] = v;
    } else if (k === 'reportGeneratedAt' || k === 'submittedAt') out[k] = isoOrNull(v);
    else throw bad(`No se puede cambiar ${k}`);
  }
  return out;
}

// ── job progress: the one place the UI and server agree on where a job stands ──
export const photoTotal = (j) => roomsOf(j).length;
export const photoCount = (j, type) => roomsOf(j).filter((r) => j.photos?.[r]?.[`${type}Path`]).length;
export const missingPhotos = (j, type) => roomsOf(j).filter((r) => !j.photos?.[r]?.[`${type}Path`]);
// a spot's side has a main photo (`beforePath`, what counts it as done) plus any number of extra ones
// (`beforeExtra: [{ id, path, by, at }]`). Deleting the main one promotes the first extra.
export const MAX_EXTRA = 40;
export const extrasOf = (j, room, type) => j.photos?.[room]?.[`${type}Extra`] || [];
/** Every photo of one spot + side, main first: [{ id: 'main' | extra id, path, at }] */
export const photosOf = (j, room, type) => [
  ...(j.photos?.[room]?.[`${type}Path`] ? [{ id: 'main', path: j.photos[room][`${type}Path`], at: j.photos[room][`${type}At`] }] : []),
  ...extrasOf(j, room, type).map((x) => ({ id: x.id, path: x.path, at: x.at })),
];
/** Removes the main photo of a spot + side in place; the first extra (if any) takes its place. */
export function dropMain(p, type) {
  const [next, ...rest] = p[`${type}Extra`] || [];
  Object.assign(p, { [`${type}Path`]: next?.path ?? null, [`${type}TakenBy`]: next?.by ?? null, [`${type}At`]: next?.at ?? null });
  if (next) p[`${type}Extra`] = rest;
}
export const materialCount = (j) => MATERIAL_AREAS.reduce((n, a) => n + (j.materials?.[a]?.length || 0), 0);
export const materialList = (j) => MATERIAL_AREAS.flatMap((area) => (j.materials?.[area] || []).map((m) => ({ ...m, area })));

/** What people see: the stored status, plus "Awaiting Review" once submitted and not yet reviewed. */
export function displayStatus(j) {
  if (j.status === STATUS.adminReviewed) return 'Reviewed';
  if (j.submittedAt) return 'Awaiting Review';
  const total = photoTotal(j);
  if (j.status === STATUS.workInProgress && total && photoCount(j, 'before') === total && photoCount(j, 'after') < total && photoCount(j, 'after') > 0) return 'Awaiting After Photos';
  if (j.status === STATUS.workInProgress) return 'In Progress';
  if (j.status === STATUS.reportGenerated || j.status === STATUS.completed) return 'Completed';
  return j.status || STATUS.draft;
}

/** Four stages: before photos, after photos, report generated, submitted. Photos count partially. */
export function progress(j) {
  const before = photoCount(j, 'before'), after = photoCount(j, 'after'), photos = photoTotal(j);
  const stages = [
    { key: 'before', label: 'Fotos antes', done: photos > 0 && before === photos, part: photos ? before / photos : 0 },
    { key: 'after', label: 'Fotos después', done: photos > 0 && after === photos, part: photos ? after / photos : 0 },
    { key: 'report', label: 'Informe generado', done: !!j.reportGeneratedAt, part: j.reportGeneratedAt ? 1 : 0 },
    { key: 'submit', label: 'Enviado', done: !!j.submittedAt || j.status === STATUS.adminReviewed, part: j.submittedAt || j.status === STATUS.adminReviewed ? 1 : 0 },
  ];
  const pct = Math.round((stages.reduce((n, s) => n + s.part, 0) / stages.length) * 100);
  return { stages, pct, done: stages.filter((s) => s.done).length, total: stages.length, before, after, photos };
}

/** "2 firmados · 1 sin firmar" */
export function changesSummary(j) {
  const all = j.changes || [], signed = all.filter(isSigned).length, open = all.length - signed;
  if (!all.length) return 'Ninguno';
  return [signed && `${signed} firmado${signed === 1 ? '' : 's'}`, open && `${open} sin firmar`].filter(Boolean).join(' · ');
}

/** Checklist shown before submitting; `fix` is the route that sorts the problem. */
export function reviewChecklist(j) {
  const before = photoCount(j, 'before'), after = photoCount(j, 'after'), total = photoTotal(j);
  const none = 'Aún no hay zonas de fotos — añade al menos una';
  return [
    { label: 'Datos de la vivienda', ok: !!address(j).trim(), detail: address(j) || 'Falta la dirección', fix: 'edit' },
    { label: 'Fotos antes', ok: total > 0 && before === total, detail: total ? `${before} / ${total} hechas` : none, fix: 'photos/before' },
    { label: 'Materiales anotados', ok: true, detail: `${materialCount(j)} material${materialCount(j) === 1 ? '' : 'es'}`, fix: 'materials' },
    { label: 'Problemas revisados', ok: true, detail: `${j.problems?.length || 0} comunicado${(j.problems?.length || 0) === 1 ? '' : 's'}`, fix: 'problems' },
    { label: 'Cambios del cliente', ok: true, detail: changesSummary(j), fix: 'changes' },
    { label: 'Fotos después', ok: total > 0 && after === total, detail: total ? `${after} / ${total} hechas` : none, fix: 'photos/after' },
    ...finalTypesOf(j).map((t) => ({ label: `Lista final: ${FINAL_ES[t]}`, ok: !!j.final?.[t]?.signedAt, detail: j.final?.[t]?.signedAt ? (j.final[t].handover ? 'Firmada · lista para entregar' : 'Firmada · con pendientes') : 'Sin hacer', fix: `final/${t}` })),
  ];
}

export const isStarted = (j) => ![STATUS.draft, STATUS.readyToStart, STATUS.assigned].includes(j.status);

// health & safety, once per job before it starts: every PPE item ticked + first-aid kit photos (closed, and open showing what's inside)
export const PPE = ['Safety boots', 'Gloves', 'Safety glasses', 'Dust mask (FFP2/FFP3)', 'Ear protection', 'Hi-vis vest', 'Hard hat'];
export const SAFETY_PHOTOS = ['kit', 'kitOpen'];
export const safetyDone = (j) => !!j.safety?.doneAt;
export const needsSafety = (j) => !isStarted(j) && !safetyDone(j); // jobs started before this check existed aren't held up
// every PPE item answered Sí/No; a No needs the reason why. Those Nos are what the admin is told about
export function safetyAnswers(list) {
  const by = new Map((Array.isArray(list) ? list : []).map((a) => [a?.item, a]));
  return PPE.map((item) => {
    const a = by.get(item);
    if (typeof a?.ok !== 'boolean') throw bad('Responde Sí o No a todo el equipo de protección');
    if (a.ok) return { item, ok: true };
    const reason = str(String(a.reason ?? ''), 300);
    if (!reason) throw bad(`Explica por qué no tienes: ${tr(item)}`);
    return { item, ok: false, reason };
  });
}
export const safetyIssues = (s) => (s?.answers || []).filter((a) => !a.ok);
// final checklists (bathroom / kitchen): the admin picks which a job needs; the worker answers every line Sí/No/N/A,
// says if it's ready for handover and signs. Signed = final. The report can't be sent until each one is signed.
export const FINAL = {
  bathroom: { title: 'Bathroom final checklist', question: 'Is the bathroom ready for handover?', items: ["Bath or shower tray secure and level", "Shower screen or enclosure secure and operating correctly", "Toilet secure and flushing correctly", "Basin secure and taps operating correctly", "Hot and cold water working correctly", "All accessible plumbing connections checked for leaks", "Waste outlets draining correctly", "Silicone seals complete and neat", "Tiles secure, grout complete and no obvious damage", "Flooring secure, clean and free from trip hazards", "Walls and ceiling finished to the agreed specification", "Lights and extractor fan checked where applicable", "Accessories and grab rails secure where fitted", "Access panels and service valves accessible", "No exposed wiring, sharp edges or other safety hazards", "Bathroom cleaned and free from dust and debris", "All rubbish, tools and surplus materials removed", "No damage to doors, frames or surrounding areas", "Before-and-after photographs uploaded", "Required specialist tests and certificates recorded where applicable", "Outstanding defects or incomplete works reported", "Property left secure and safe for the resident"] },
  kitchen: { title: 'Kitchen final checklist', question: 'Is the kitchen ready for handover?', items: ["All kitchen units secure and level", "Cupboard doors and drawers open and close correctly", "Handles, hinges, plinths and end panels secure", "Worktops secure, with joints and edges properly finished", "Sink secure and taps operating correctly", "Hot and cold water working correctly", "Sink waste draining correctly", "All accessible plumbing connections checked for leaks", "Silicone seals complete and neat", "Splashbacks and tiles secure, with grout complete", "Flooring secure and free from trip hazards", "Walls, ceiling and paintwork finished to specification", "Lights, switches and sockets visually checked", "Extractor hood or ventilation checked where fitted", "Supplied appliances checked where included in the work order", "No exposed wiring, sharp edges or other safety hazards", "Stopcock and required service access maintained", "Kitchen cleaned, including cupboards and worktops", "All rubbish, tools and surplus materials removed", "No damage to doors, frames or surrounding areas", "Before-and-after photographs uploaded", "Required specialist tests and certificates recorded where applicable", "Outstanding defects or incomplete works reported", "Property left secure and safe for the resident"] },
};
export const FINAL_ES = { bathroom: 'Baño', kitchen: 'Cocina' };
export const finalTypesOf = (j) => (Array.isArray(j.finalTypes) ? j.finalTypes.filter((t) => FINAL[t]) : []);
export const finalPending = (j) => finalTypesOf(j).filter((t) => !j.final?.[t]?.signedAt);
export function finalChecklist(type, b) {
  const def = FINAL[type];
  if (!def) throw bad('Lista no válida');
  const by = new Map((Array.isArray(b?.answers) ? b.answers : []).map((a) => [a?.item, a]));
  const answers = def.items.map((item) => {
    const a = by.get(item);
    if (!['yes', 'no', 'na'].includes(a?.a)) throw bad(`Contesta: ${tr(item)}`);
    if (a.a !== 'no') return { item, a: a.a };
    const comment = str(String(a.comment ?? ''), 300);
    if (!comment) throw bad(`Explica el No: ${tr(item)}`);
    return { item, a: 'no', comment };
  });
  if (typeof b.handover !== 'boolean') throw bad('Contesta si está listo para entregar');
  if (b.handover && answers.some((x) => x.a === 'no')) throw bad('Hay puntos en No: no puede estar listo para entregar');
  const comments = str(String(b.comments ?? ''), 1000);
  if (!b.handover && !comments) throw bad('Escribe qué queda pendiente');
  if (typeof b.signature !== 'string' || !SIG_RE.test(b.signature) || b.signature.length > 300_000) throw bad('Falta tu firma');
  return { answers, handover: b.handover, comments, signature: b.signature };
}
export const londonDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
// one day's safety events (the Seguridad page + its daily PDF): finished checks and "no first-aid kit" alerts
export function safetyLog(jobs, day) {
  const out = [];
  for (const j of jobs) {
    const s = j.safety;
    if (s?.doneAt && londonDay(s.doneAt) === day) out.push({ job: j, kind: 'done', at: s.doneAt, by: s.doneBy, issues: safetyIssues(s) });
    if (s?.noKitAt && londonDay(s.noKitAt) === day) out.push({ job: j, kind: 'noKit', at: s.noKitAt, by: s.noKitBy, issues: [] });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
export const isOpen = (j) => !j.submittedAt && j.status !== STATUS.adminReviewed;

/** The single next thing to do on a job: { label, step } where step is a route under #/jobs/<id>/. */
export function nextStep(j, role = 'employee') {
  if (role === 'admin' && j.submittedAt && j.status !== STATUS.adminReviewed) return { label: 'Revisar informe', step: 'report' };
  if (!isOpen(j)) return { label: 'Ver informe', step: 'report' };
  if (!isStarted(j)) return { label: 'Empezar trabajo', step: 'start' };
  const total = photoTotal(j);
  if (!total || photoCount(j, 'before') < total) return { label: 'Fotos antes', step: 'photos/before' };
  if (photoCount(j, 'after') < total) return { label: 'Fotos después', step: 'photos/after' };
  const pending = finalPending(j);
  if (pending.length) return { label: `Lista final: ${FINAL_ES[pending[0]]}`, step: `final/${pending[0]}` };
  return { label: 'Revisar y enviar', step: 'review' };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert')).strict;
  const j = newJob('LCC-2026-00001', { houseNumber: '12', street: 'High St', town: 'London', postcode: 'W5 1AA' }, 'a@x');
  assert.equal(address(j), '12, High St, London, W5 1AA');
  assert.equal(Object.keys(j.photos).length, 8); assert.equal(photoTotal(j), 8);
  const few = newJob('z', { houseNumber: '1', street: 'a', town: 'b', postcode: 'c', rooms: [' Kitchen ', 'kitchen', 'Bath  room', ''] }, 'a');
  assert.deepEqual(few.rooms, ['Kitchen', 'Bath room']); assert.equal(photoTotal(few), 2);
  assert.equal(findRoom(few, 'bath_room'), 'Bath room'); assert.equal(findRoom(few, '1'), 'Bath room'); assert.equal(findRoom(few, 'nope'), undefined);
  assert.deepEqual(roomsOf({}), PHOTO_ROOMS); // job from before per-job spots
  const ph = { beforePath: 'm', beforeExtra: [{ id: 'a', path: 'pa', by: 'u', at: 't' }, { id: 'b', path: 'pb' }] };
  assert.deepEqual(photosOf({ photos: { K: ph } }, 'K', 'before').map((x) => x.path), ['m', 'pa', 'pb']);
  dropMain(ph, 'before'); assert.equal(ph.beforePath, 'pa'); assert.equal(ph.beforeTakenBy, 'u'); assert.deepEqual(ph.beforeExtra.map((x) => x.id), ['b']);
  dropMain(ph, 'before'); dropMain(ph, 'before'); assert.equal(ph.beforePath, null); assert.equal(photosOf({ photos: { K: ph } }, 'K', 'before').length, 0);
  few.photos.Kitchen.beforePath = 'x'; few.photos['Bath room'].beforePath = 'x'; few.status = STATUS.workInProgress;
  assert.equal(progress(few).before, 2); assert.equal(nextStep(few).step, 'photos/after'); assert.equal(reviewChecklist(few)[1].detail, '2 / 2 hechas');
  const empty = newJob('e', { houseNumber: '1', street: 'a', town: 'b', postcode: 'c', rooms: [] }, 'a');
  assert.equal(reviewChecklist(empty)[1].ok, false); assert.equal(nextStep({ ...empty, status: STATUS.workInProgress }).step, 'photos/before');
  assert.throws(() => cleanRooms(Array.from({ length: 31 }, (_, i) => `R${i}`)));
  assert.throws(() => newJob('x', { street: 'a' }, 'a'));
  const nj = newJob('y', { houseNumber: '1', street: 'a', town: 'b', postcode: 'c', assignedTo: ' Maria@X.com', clientId: 'abcdef123456' }, 'a');
  assert.equal(nj.assignedTo, 'maria@x.com'); assert.equal(nj.status, STATUS.assigned); assert.equal(nj.clientId, 'abcdef123456');
  assert.deepEqual(cleanPatch({ status: 'Completed' }, 'employee'), { status: 'Completed' });
  assert.throws(() => cleanPatch({ status: 'Admin Reviewed' }, 'employee'));
  assert.throws(() => cleanPatch({ materials: {} }, 'employee'));
  assert.throws(() => cleanPatch({ assignedTo: 'x' }, 'employee'));
  const fa = (a) => FINAL.bathroom.items.map((item, i) => (i ? { item, a: 'yes' } : { item, a, comment: a === 'no' ? 'falta' : '' }));
  const SIG = 'data:image/png;base64,AAAA';
  assert.equal(finalChecklist('bathroom', { answers: fa('na'), handover: true, signature: SIG }).answers[0].a, 'na');
  assert.throws(() => finalChecklist('bathroom', { answers: fa('no'), handover: true, signature: SIG })); // a No can't be "ready"
  assert.throws(() => finalChecklist('bathroom', { answers: fa('no'), handover: false, signature: SIG })); // No handover needs comments
  assert.equal(finalChecklist('bathroom', { answers: fa('no'), handover: false, comments: 'x', signature: SIG }).answers[0].comment, 'falta');
  assert.deepEqual(finalPending({ finalTypes: ['kitchen', 'bathroom', 'x'], final: { kitchen: { signedAt: 'y' } } }), ['bathroom']);
  assert.deepEqual(cleanPatch({ finalTypes: ['kitchen', 'nope'] }, 'admin').finalTypes, ['kitchen']);
  const yes = PPE.map((item) => ({ item, ok: true }));
  assert.equal(safetyAnswers(yes).length, PPE.length);
  assert.throws(() => safetyAnswers(yes.slice(1)));
  assert.throws(() => safetyAnswers([{ item: PPE[0], ok: false, reason: ' ' }, ...yes.slice(1)]));
  assert.equal(safetyIssues({ answers: safetyAnswers([{ item: PPE[0], ok: false, reason: 'rotas' }, ...yes.slice(1)]) }).length, 1);
  const log = safetyLog([{ id: 'a', safety: { doneAt: '2026-10-17T23:30:00Z', doneBy: 'x', noKitAt: '2026-10-17T08:00:00Z', answers: [{ item: 'Gloves', ok: false, reason: 'r' }] } }], '2026-10-18');
  assert.equal(log.length, 1); assert.equal(log[0].issues.length, 1); // 23:30 UTC = 00:30 next day in London (BST)
  assert.ok(needsSafety(nj) && !needsSafety({ ...nj, safety: { doneAt: 'x' } }) && !needsSafety({ ...nj, status: STATUS.workInProgress }));
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
  const sig = 'data:image/png;base64,iVBORw0KGgo=';
  const ch = changeItem({ type: 'Add', description: ' Extra shelf ', customerName: 'Mrs Smith', signature: sig, id: 'c1c1c1c1' }, 'e@x');
  assert.equal(ch.id, 'c1c1c1c1'); assert.equal(ch.description, 'Extra shelf'); assert.ok(ch.signedAt);
  assert.throws(() => changeItem({ type: 'Add', description: 'x', customerName: 'y' }, 'e'));
  assert.throws(() => changeItem({ type: 'Add', description: 'x', customerName: 'y', signature: 'data:image/png;base64,<script>' }, 'e'));
  assert.throws(() => changeItem({ type: 'Swap', description: 'x', customerName: 'y', signature: sig }, 'e'));
  assert.throws(() => changeItem({ type: 'Remove', description: 'x', customerName: ' ', signature: sig }, 'e'));
  const rc = changeItem({ type: 'Remove', description: 'No door handle', remote: true, signCode: 'x'.repeat(24) }, 'e@x');
  assert.equal(rc.signCode, 'x'.repeat(24)); assert.equal(isSigned(rc), false);
  assert.match(changeItem({ type: 'Add', description: 'y', remote: true, signCode: 'short' }, 'e').signCode, CODE_RE);
  assert.equal(changesSummary({ changes: [ch, rc] }), '1 firmado · 1 sin firmar');
  assert.throws(() => signature({ customerName: 'A' }));
  const q = newQuote('Q-2026-00001', { personName: ' Mr Jones ', price: '£1,250.5', work: 'New bathroom' }, 'e@x');
  assert.equal(q.personName, 'Mr Jones'); assert.equal(q.price, 1250.5); assert.ok(isQuote(q)); assert.equal(money(q.price), '£1,250.50');
  assert.throws(() => newQuote('Q', { street: 'x' }, 'e'));
  assert.deepEqual(cleanQuotePatch({ price: '', street: ' A ' }), { street: 'A', price: null });
  assert.throws(() => cleanQuotePatch({ price: '-3' })); assert.throws(() => cleanQuotePatch({ status: 'x' })); assert.throws(() => cleanQuotePatch({ personName: ' ' }));
  assert.deepEqual(conditionMeta({ area: 'Kitchen', note: ' crack ' }), { area: 'Kitchen', note: 'crack' });
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
  assert.equal(nextStep(j, 'admin').step, 'report'); assert.equal(nextStep(j).label, 'Ver informe');
  console.log('jobs ok');
}
