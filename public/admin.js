// Admin screens: new job, edit job details / assignment, team logins.
import { esc, icon, on, $, $$, toast, sheet, confirmSheet, empty, jobNo, tr } from './ui.js?v=__V__';
import * as store from './store.js?v=__V__';
import { STATUS, isOpen, PHOTO_ROOMS, MAX_ROOMS, slug } from './jobs.mjs?v=__V__';

const PROPERTY = [
  ['houseNumber', 'Número / piso', 'p. ej. 12 o Flat 4B', true, 'text', 'address-line1'],
  ['street', 'Calle', 'p. ej. Example Street', true, 'text', 'address-line2'],
  ['town', 'Ciudad', 'p. ej. Manchester', true, 'text', 'address-level2'],
  ['postcode', 'Código postal', 'p. ej. M1 2AB', true, 'text', 'postal-code'],
];
const CONTACT = [
  ['personName', 'Nombre', 'Nombre completo', false, 'text', 'off'],
  ['personPhone', 'Teléfono', 'Número de teléfono', false, 'tel', 'off'],
  ['personEmail', 'Correo', 'Correo electrónico', false, 'email', 'off'],
];
const field = ([k, label, ph, req, type, ac], value = '') => `<label class="field"><span>${label}${req ? '' : ' <small>(opcional)</small>'}</span>
  <input id="${k}" name="${k}" type="${type}" placeholder="${ph}" value="${esc(value)}" autocomplete="${ac}" ${req ? 'required' : ''} ${k === 'postcode' ? 'autocapitalize="characters"' : ''}></label>`;

// the employee list, kept on the device so jobs can be created and assigned with no signal
async function employees() {
  try {
    const list = (await store.api('/api/users')).filter((u) => u.active && u.role === 'employee');
    store.cacheUsers(list);
    return list;
  } catch { return (await store.cachedUsers()) || null; }
}
const assignSelect = (list, cur) => list
  ? `<select id="assignedTo" name="assignedTo"><option value="">— Sin asignar todavía —</option>${list.map((u) => `<option value="${esc(u.email)}" ${u.email === cur ? 'selected' : ''}>${esc(u.name)} · ${esc(u.email)}</option>`).join('')}
      ${cur && !list.some((u) => u.email === cur) ? `<option selected value="${esc(cur)}">${esc(cur)}</option>` : ''}</select>`
  : `<input id="assignedTo" name="assignedTo" type="email" value="${esc(cur || '')}" placeholder="empleado@correo.com">`;

// photo spots for a new job: starts with the standard eight; remove any, add your own
const spotsEditor = (rooms) => `<section class="form-section"><h3 class="section-title">Zonas de fotos <span id="spotcount">${rooms.length}</span></h3>
  <p class="small muted" style="margin-bottom:10px">Una foto de antes y otra de después por zona. Se pueden añadir más en la obra.</p>
  <div class="spot-chips" id="spots" data-rooms="${esc(JSON.stringify(rooms))}"></div>
  <div class="add-spot"><input id="spotname" placeholder="Añade una zona, p. ej. Pasillo" autocomplete="off" enterkeyhint="done" aria-label="Nombre de la nueva zona">
    <button type="button" class="btn btn-secondary" id="addspot">${icon('add')} Añadir</button></div>
  <div class="row-between"><button type="button" class="btn btn-text btn-sm" id="stdspots">${icon('restart_alt')} Las 8 estándar</button><button type="button" class="btn btn-text btn-sm danger" id="nospots">Quitar todas</button></div></section>`;
function wireSpots(v, onChange) {
  const box = $('#spots', v);
  if (!box) return;
  const get = () => JSON.parse(box.dataset.rooms);
  const set = (rooms) => { box.dataset.rooms = JSON.stringify(rooms); paint(); onChange(); };
  const err = $('#err', v);
  const paint = () => {
    const rooms = get();
    $('#spotcount', v).textContent = rooms.length;
    box.innerHTML = rooms.length ? rooms.map((r, k) => `<span class="spot-chip"><span class="spot-no">${k + 1}</span>${esc(tr(r))}<button type="button" class="icon-btn" data-rm="${k}" aria-label="Quitar ${esc(tr(r))}">${icon('close')}</button></span>`).join('')
      : '<p class="muted small">Sin zonas — el empleado las añadirá en la obra.</p>';
    on(box, '[data-rm]', 'click', (e, b) => { const r = get(); r.splice(Number(b.dataset.rm), 1); set(r); });
  };
  const add = () => {
    const input = $('#spotname', v), name = input.value.trim().replace(/\s+/g, ' ');
    const rooms = get();
    if (!name) return input.focus();
    if (rooms.some((r) => slug(r) === slug(name))) { err.hidden = false; err.textContent = `“${name}” ya es una zona de fotos.`; return; }
    if (rooms.length >= MAX_ROOMS) { err.hidden = false; err.textContent = `Como máximo ${MAX_ROOMS} zonas de fotos.`; return; }
    err.hidden = true; input.value = ''; set([...rooms, name]); input.focus();
  };
  on(v, '#addspot', 'click', add);
  on(v, '#spotname', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  on(v, '#stdspots', 'click', () => set([...PHOTO_ROOMS]));
  on(v, '#nospots', 'click', () => set([]));
  paint();
}

function form(values, users, { spots } = {}) {
  return `<form id="jobform" novalidate>
    <section class="form-section"><h3 class="section-title">Vivienda</h3>${PROPERTY.map((f) => field(f, values[f[0]])).join('')}</section>
    <section class="form-section"><h3 class="section-title">Caja de llaves</h3>
      <label class="field"><span>PIN de la caja de llaves <small>(opcional)</small></span><span class="input-wrap"><input id="keySafePin" name="keySafePin" type="password" inputmode="numeric" autocomplete="off" value="${esc(values.keySafePin || '')}" placeholder="Déjalo vacío si no hay caja de llaves">
        <button type="button" class="icon-btn" id="eye" aria-label="Mostrar PIN">${icon('visibility')}</button></span></label></section>
    <section class="form-section"><h3 class="section-title">Persona de contacto</h3>${CONTACT.map((f) => field(f, values[f[0]])).join('')}</section>
    <section class="form-section"><h3 class="section-title">Asignar a</h3><label class="field"><span>Empleado</span>${assignSelect(users, values.assignedTo)}</label>
      ${users && !users.length ? '<p class="muted small">Aún no hay empleados — <a href="#/team">añádelos en la página Equipo</a>.</p>' : ''}</section>
    ${spots ? spotsEditor(Array.isArray(values.rooms) ? values.rooms : [...PHOTO_ROOMS]) : ''}
    <p class="form-error" id="err" role="alert" hidden></p></form>`;
}
function readForm(v) {
  const out = Object.fromEntries($$('#jobform input[name], #jobform select[name]', v).map((i) => [i.name, i.value.trim()]));
  const spots = $('#spots', v);
  if (spots) out.rooms = JSON.parse(spots.dataset.rooms);
  out.assignedTo = (out.assignedTo || '').toLowerCase();
  return out;
}
function validate(v) {
  const err = $('#err', v);
  $$('.field.invalid', v).forEach((x) => x.classList.remove('invalid'));
  const missing = PROPERTY.filter(([k]) => !$(`#${k}`, v).value.trim());
  missing.forEach(([k]) => $(`#${k}`, v).closest('.field').classList.add('invalid'));
  if (missing.length) { err.hidden = false; err.textContent = `Rellena: ${missing.map((m) => m[1].toLowerCase()).join(', ')}.`; $(`#${missing[0][0]}`, v).focus(); return false; }
  err.hidden = true; return true;
}
const wirePin = (v) => on(v, '#eye', 'click', (e, b) => { const p = $('#keySafePin', v); p.type = p.type === 'password' ? 'text' : 'password'; b.innerHTML = icon(p.type === 'password' ? 'visibility' : 'visibility_off'); });

// ── new job ─────────────────────────────────────────────
// Saved through the outbox like everything else, so it works with no signal: the job gets a
// temporary id and the real LCC-YYYY-NNNNN number as soon as it reaches the server.
// The form is kept as a draft on the device while you type.
async function newJob() {
  const users = await employees();
  const draft = (await store.getDraft('new-job')) || {};
  const restored = Object.values(draft).some(Boolean);
  return {
    title: 'Nuevo trabajo', back: '#/home', side: 'new',
    body: `${restored ? `<p class="notice">${icon('restore')}<span class="grow">Se ha recuperado un borrador anterior.</span><button class="btn btn-text btn-sm" id="clear">Borrar</button></p>` : ''}
      <p class="lead">Crea el trabajo — aparecerá en el móvil del empleado en cuanto se asigne.${store.sync.reachable ? '' : ' <b>Estás sin conexión:</b> se enviará y recibirá su número cuando vuelvas a tener conexión.'}</p>${form(draft, users, { spots: true })}`,
    footer: `<button class="btn btn-primary btn-lg" id="save">${icon('add_home_work')} Crear trabajo</button>`,
    mount(v, f) {
      wirePin(v);
      wireSpots(v, () => store.saveDraft('new-job', readForm(v)));
      on(v, 'input[name], select', 'input', () => store.saveDraft('new-job', readForm(v)));
      on(v, 'select', 'change', () => store.saveDraft('new-job', readForm(v)));
      on(v, '#clear', 'click', async () => { await store.clearDraft('new-job'); window.dispatchEvent(new Event('lcc:redraw')); });
      $('#jobform', v).onsubmit = (e) => { e.preventDefault(); $('#save', f).click(); };
      on(f, '#save', 'click', async () => {
        if (!validate(v)) return;
        const id = store.createJob(readForm(v));
        await store.clearDraft('new-job');
        toast(store.sync.reachable ? 'Trabajo creado' : 'Trabajo guardado — se enviará cuando tengas conexión');
        location.replace(`#/jobs/${encodeURIComponent(id)}`);
      });
    },
  };
}

// ── edit job details / (re)assign ───────────────────────
async function editJob(id) {
  const j = store.job(id) || (await store.loadJob(id));
  if (!j) throw new Error('Trabajo no encontrado');
  const users = await employees();
  const key = `edit-job:${j.id}`;
  const draft = await store.getDraft(key);
  return {
    title: 'Editar trabajo', back: `#/jobs/${encodeURIComponent(id)}`, side: 'jobs',
    body: `${draft ? `<p class="notice">${icon('restore')}<span class="grow">Se han recuperado cambios sin guardar.</span><button class="btn btn-text btn-sm" id="clear">Descartar</button></p>` : ''}
      <p class="lead"><span class="mono">${esc(jobNo(j))}</span></p>${form({ ...j, ...draft }, users, {})}`,
    footer: `<button class="btn btn-primary btn-lg" id="save">${icon('save')} Guardar cambios</button>`,
    mount(v, f) {
      wirePin(v);
      on(v, 'input, select', 'input', () => store.saveDraft(key, readForm(v)));
      on(v, 'select', 'change', () => store.saveDraft(key, readForm(v)));
      on(v, '#clear', 'click', async () => { await store.clearDraft(key); window.dispatchEvent(new Event('lcc:redraw')); });
      $('#jobform', v).onsubmit = (e) => { e.preventDefault(); $('#save', f).click(); };
      on(f, '#save', 'click', () => {
        if (!validate(v)) return;
        const body = readForm(v);
        if (!users && body.assignedTo === '') delete body.assignedTo;
        if ('assignedTo' in body && body.assignedTo !== j.assignedTo && [STATUS.draft, STATUS.readyToStart, STATUS.assigned].includes(j.status)) body.status = body.assignedTo ? STATUS.assigned : STATUS.readyToStart;
        store.patch(id, body);
        store.clearDraft(key);
        toast('Guardado');
        location.replace(`#/jobs/${encodeURIComponent(id)}`);
      });
    },
  };
}

// ── team ────────────────────────────────────────────────
async function team(q, me) {
  let users;
  try { users = await store.api('/api/users'); } catch (e) { if (e.offline) throw e; throw e; }
  const jobsFor = (email) => store.jobs().filter((j) => j.assignedTo === email && isOpen(j)).length;
  const showPassword = (email, password) => sheet(`<h2>Datos de acceso</h2><p class="muted">Envíaselos a la persona. La contraseña solo se muestra una vez.</p>
    <div class="cred"><span>Correo</span><b>${esc(email)}</b><span>Contraseña</span><b class="mono big">${esc(password)}</b></div>
    <div class="sheet-actions"><button class="btn btn-primary" id="copy">${icon('content_copy')} Copiar</button><button class="btn btn-secondary" data-close>Listo</button></div>`, {
    wire: (d) => on(d, '#copy', 'click', async () => { try { await navigator.clipboard.writeText(`LCC Informes — ${location.origin}\nCorreo: ${email}\nContraseña: ${password}`); toast('Copiado'); } catch { toast('No se puede copiar — apúntalo', 'bad'); } }),
  });
  return {
    title: 'Equipo', back: '#/more', side: 'team',
    body: `<p class="lead">Accesos de tus empleados y administradores.</p>
      ${users.length ? `<div class="card-list">${users.map((u) => `<div class="card person ${u.active ? '' : 'inactive'}">
        <span class="avatar">${esc((u.name[0] || '?').toUpperCase())}</span>
        <div class="grow"><b>${esc(u.name)}</b> ${u.role === 'admin' ? '<span class="role-tag">Administrador</span>' : ''}${u.active ? '' : '<span class="role-tag off">Desactivado</span>'}
          <small>${esc(u.email)}${u.role === 'employee' && u.active ? ` · ${jobsFor(u.email)} trabajo(s) abierto(s)` : ''}</small></div>
        <button class="icon-btn" data-menu="${esc(u.id)}" aria-label="Opciones de ${esc(u.name)}">${icon('more_horiz')}</button></div>`).join('')}</div>`
        : empty('groups', 'Aún no hay equipo', 'Añade tu primer empleado.')}`,
    footer: `<button class="btn btn-primary btn-lg" id="add">${icon('person_add')} Añadir persona</button>`,
    mount(v, f) {
      on(f, '#add', 'click', () => sheet(`<form novalidate><h2>Añadir persona</h2>
        <label class="field"><span>Nombre</span><input id="n" autocomplete="off" required></label>
        <label class="field"><span>Correo</span><input id="e" type="email" inputmode="email" autocapitalize="none" autocomplete="off" required></label>
        <fieldset class="field"><legend>Rol</legend><div class="segmented"><label><input type="radio" name="r" value="employee" checked><span>Empleado</span></label><label><input type="radio" name="r" value="admin"><span>Administrador</span></label></div></fieldset>
        <p class="form-error" id="err" role="alert" hidden></p>
        <div class="sheet-actions"><button class="btn btn-primary btn-lg">Añadir y crear contraseña</button><button type="button" class="btn btn-secondary" data-close>Cancelar</button></div></form>`, {
        wire: (d) => $('form', d).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const r = await store.api('/api/users', { method: 'POST', body: { name: $('#n', d).value, email: $('#e', d).value, role: $('input[name=r]:checked', d).value } });
            d.close(); window.dispatchEvent(new Event('lcc:redraw')); showPassword(r.email, r.password);
          } catch (ex) { const err = $('#err', d); err.hidden = false; err.textContent = ex.offline ? 'Sin conexión — inténtalo cuando tengas cobertura.' : ex.message; }
        }),
      }));
      on(v, '[data-menu]', 'click', (e, b) => {
        const u = users.find((x) => x.id === b.dataset.menu);
        sheet(`<h2>${esc(u.name)}</h2><p class="muted">${esc(u.email)}</p><div class="list-card">
          <button class="list-row" id="reset">${icon('lock_reset')}<span>Restablecer contraseña</span></button>
          ${u.id === me.id ? '' : `<button class="list-row ${u.active ? 'danger' : ''}" id="toggle">${icon(u.active ? 'person_off' : 'person')}<span>${u.active ? 'Desactivar acceso' : 'Reactivar acceso'}</span></button>`}</div>
          <div class="sheet-actions"><button class="btn btn-secondary" data-close>Cerrar</button></div>`, {
          wire: (d) => {
            on(d, '#reset', 'click', async () => {
              d.close();
              if (!(await confirmSheet({ title: '¿Restablecer contraseña?', text: `Se cerrará la sesión de ${u.email} y tendrá una contraseña nueva.`, ok: 'Restablecer contraseña' }))) return;
              try { const r = await store.api(`/api/users/${u.id}`, { method: 'PATCH', body: { resetPassword: true } }); showPassword(u.email, r.password); } catch (ex) { toast(ex.message, 'bad'); }
            });
            on(d, '#toggle', 'click', async () => {
              d.close();
              if (u.active && !(await confirmSheet({ title: '¿Desactivar acceso?', text: `${u.name} no podrá iniciar sesión. Sus trabajos e informes se mantienen.`, ok: 'Desactivar', danger: true }))) return;
              try { await store.api(`/api/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); toast(u.active ? 'Acceso desactivado' : 'Acceso reactivado'); window.dispatchEvent(new Event('lcc:redraw')); } catch (ex) { toast(ex.message, 'bad'); }
            });
          },
        });
      });
    },
  };
}

export const ROUTES = [
  [/^\/new$/, newJob, 'admin'],
  [/^\/jobs\/([^/]+)\/edit$/, editJob, 'admin'],
  [/^\/team$/, team, 'admin'],
];
