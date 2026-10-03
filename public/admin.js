// Admin screens: new job, edit job details / assignment, team logins.
import { esc, icon, on, $, $$, go, toast, sheet, confirmSheet, empty, skeleton, line1 } from './ui.js?v=__V__';
import * as store from './store.js?v=__V__';
import { STATUS, isOpen } from './jobs.mjs?v=__V__';

const PROPERTY = [
  ['houseNumber', 'House / flat number', 'e.g. 12 or Flat 4B', true, 'text', 'address-line1'],
  ['street', 'Street', 'e.g. Example Street', true, 'text', 'address-line2'],
  ['town', 'Town / city', 'e.g. Manchester', true, 'text', 'address-level2'],
  ['postcode', 'Postcode', 'e.g. M1 2AB', true, 'text', 'postal-code'],
];
const CONTACT = [
  ['personName', 'Name', 'Full name', false, 'text', 'off'],
  ['personPhone', 'Phone', 'Phone number', false, 'tel', 'off'],
  ['personEmail', 'Email', 'Email address', false, 'email', 'off'],
];
const field = ([k, label, ph, req, type, ac], value = '') => `<label class="field"><span>${label}${req ? '' : ' <small>(optional)</small>'}</span>
  <input id="${k}" name="${k}" type="${type}" placeholder="${ph}" value="${esc(value)}" autocomplete="${ac}" ${req ? 'required' : ''} ${k === 'postcode' ? 'autocapitalize="characters"' : ''}></label>`;

async function employees() {
  try { return (await store.api('/api/users')).filter((u) => u.active && u.role === 'employee'); } catch { return null; }
}
const assignSelect = (list, cur) => list
  ? `<select id="assignedTo" name="assignedTo"><option value="">— Not assigned yet —</option>${list.map((u) => `<option value="${esc(u.email)}" ${u.email === cur ? 'selected' : ''}>${esc(u.name)} · ${esc(u.email)}</option>`).join('')}
      ${cur && !list.some((u) => u.email === cur) ? `<option selected value="${esc(cur)}">${esc(cur)}</option>` : ''}</select>`
  : `<input id="assignedTo" name="assignedTo" type="email" value="${esc(cur || '')}" placeholder="employee@email.com">`;

function form(values, users, { title }) {
  return `<form id="jobform" novalidate>
    <section class="form-section"><h3 class="section-title">Property</h3>${PROPERTY.map((f) => field(f, values[f[0]])).join('')}</section>
    <section class="form-section"><h3 class="section-title">Key safe</h3>
      <label class="field"><span>Key safe PIN <small>(optional)</small></span><span class="input-wrap"><input id="keySafePin" name="keySafePin" type="password" inputmode="numeric" autocomplete="off" value="${esc(values.keySafePin || '')}" placeholder="Leave empty if there is no key safe">
        <button type="button" class="icon-btn" id="eye" aria-label="Show PIN">${icon('visibility')}</button></span></label></section>
    <section class="form-section"><h3 class="section-title">Person in charge</h3>${CONTACT.map((f) => field(f, values[f[0]])).join('')}</section>
    <section class="form-section"><h3 class="section-title">Assign to</h3><label class="field"><span>Employee</span>${assignSelect(users, values.assignedTo)}</label>
      ${users && !users.length ? '<p class="muted small">No employees yet — <a href="#/team">add them on the Team page</a>.</p>' : ''}</section>
    <p class="form-error" id="err" role="alert" hidden></p></form>`;
}
function readForm(v) {
  const out = Object.fromEntries($$('#jobform input, #jobform select', v).map((i) => [i.name, i.value.trim()]));
  out.assignedTo = (out.assignedTo || '').toLowerCase();
  return out;
}
function validate(v) {
  const err = $('#err', v);
  $$('.field.invalid', v).forEach((x) => x.classList.remove('invalid'));
  const missing = PROPERTY.filter(([k]) => !$(`#${k}`, v).value.trim());
  missing.forEach(([k]) => $(`#${k}`, v).closest('.field').classList.add('invalid'));
  if (missing.length) { err.hidden = false; err.textContent = `Please fill in: ${missing.map((m) => m[1].toLowerCase()).join(', ')}.`; $(`#${missing[0][0]}`, v).focus(); return false; }
  err.hidden = true; return true;
}
const wirePin = (v) => on(v, '#eye', 'click', (e, b) => { const p = $('#keySafePin', v); p.type = p.type === 'password' ? 'text' : 'password'; b.innerHTML = icon(p.type === 'password' ? 'visibility' : 'visibility_off'); });

// ── new job ─────────────────────────────────────────────
async function newJob() {
  const users = await employees();
  let dirty = false, saving = false;
  return {
    title: 'New job', back: '#/home', side: 'new',
    body: `<p class="lead">Create the job — it gets its own Job ID and appears on the employee's phone once assigned.</p>${form({}, users, {})}`,
    footer: `<button class="btn btn-primary btn-lg" id="save">${icon('add_home_work')} Create job</button>`,
    dirty: () => dirty && !saving,
    mount(v, f) {
      wirePin(v);
      on(v, 'input, select', 'input', () => { dirty = true; });
      $('#jobform', v).onsubmit = (e) => { e.preventDefault(); $('#save', f).click(); };
      on(f, '#save', 'click', async (e, b) => {
        if (!validate(v)) return;
        const body = readForm(v);
        b.disabled = true; saving = true;
        try {
          const job = await store.api('/api/jobs', { method: 'POST', body });
          if (body.assignedTo) await store.api(`/api/jobs/${encodeURIComponent(job.id)}`, { method: 'PATCH', body: { assignedTo: body.assignedTo, status: STATUS.assigned } });
          else await store.api(`/api/jobs/${encodeURIComponent(job.id)}`, { method: 'PATCH', body: { status: STATUS.readyToStart } });
          await store.loadJob(job.id);
          toast(`Job ${job.id} created`);
          location.replace(`#/jobs/${encodeURIComponent(job.id)}`);
        } catch (ex) {
          saving = false; b.disabled = false;
          const err = $('#err', v); err.hidden = false;
          err.textContent = ex.offline ? 'No connection — new jobs need the internet to get their Job ID. Nothing was lost; try again when you’re online.' : ex.message;
        }
      });
    },
  };
}

// ── edit job details / (re)assign ───────────────────────
async function editJob(id) {
  const j = store.job(id) || (await store.loadJob(id));
  if (!j) throw new Error('Job not found');
  const users = await employees();
  let dirty = false;
  return {
    title: 'Edit job', back: `#/jobs/${encodeURIComponent(id)}`, side: 'jobs',
    body: `<p class="lead"><span class="mono">${esc(j.id)}</span></p>${form(j, users, {})}`,
    footer: `<button class="btn btn-primary btn-lg" id="save">${icon('save')} Save changes</button>`,
    dirty: () => dirty,
    mount(v, f) {
      wirePin(v);
      on(v, 'input, select', 'input', () => { dirty = true; });
      $('#jobform', v).onsubmit = (e) => { e.preventDefault(); $('#save', f).click(); };
      on(f, '#save', 'click', () => {
        if (!validate(v)) return;
        const body = readForm(v);
        if (!users && body.assignedTo === '') delete body.assignedTo;
        if ('assignedTo' in body && body.assignedTo !== j.assignedTo && [STATUS.draft, STATUS.readyToStart, STATUS.assigned].includes(j.status)) body.status = body.assignedTo ? STATUS.assigned : STATUS.readyToStart;
        store.patch(id, body);
        dirty = false;
        toast('Saved');
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
  const showPassword = (email, password) => sheet(`<h2>Login details</h2><p class="muted">Send these to the person. The password is shown only once.</p>
    <div class="cred"><span>Email</span><b>${esc(email)}</b><span>Password</span><b class="mono big">${esc(password)}</b></div>
    <div class="sheet-actions"><button class="btn btn-primary" id="copy">${icon('content_copy')} Copy</button><button class="btn btn-secondary" data-close>Done</button></div>`, {
    wire: (d) => on(d, '#copy', 'click', async () => { try { await navigator.clipboard.writeText(`LCC Reports — ${location.origin}\nEmail: ${email}\nPassword: ${password}`); toast('Copied'); } catch { toast('Copy not available — note it down', 'bad'); } }),
  });
  return {
    title: 'Team', back: '#/more', side: 'team',
    body: `<p class="lead">Logins for your employees and admins.</p>
      ${users.length ? `<div class="card-list">${users.map((u) => `<div class="card person ${u.active ? '' : 'inactive'}">
        <span class="avatar">${esc((u.name[0] || '?').toUpperCase())}</span>
        <div class="grow"><b>${esc(u.name)}</b> ${u.role === 'admin' ? '<span class="role-tag">Admin</span>' : ''}${u.active ? '' : '<span class="role-tag off">Deactivated</span>'}
          <small>${esc(u.email)}${u.role === 'employee' && u.active ? ` · ${jobsFor(u.email)} open job(s)` : ''}</small></div>
        <button class="icon-btn" data-menu="${esc(u.id)}" aria-label="Options for ${esc(u.name)}">${icon('more_horiz')}</button></div>`).join('')}</div>`
        : empty('groups', 'No team yet', 'Add your first employee.')}`,
    footer: `<button class="btn btn-primary btn-lg" id="add">${icon('person_add')} Add person</button>`,
    mount(v, f) {
      on(f, '#add', 'click', () => sheet(`<form novalidate><h2>Add person</h2>
        <label class="field"><span>Name</span><input id="n" autocomplete="off" required></label>
        <label class="field"><span>Email</span><input id="e" type="email" inputmode="email" autocapitalize="none" autocomplete="off" required></label>
        <fieldset class="field"><legend>Role</legend><div class="segmented"><label><input type="radio" name="r" value="employee" checked><span>Employee</span></label><label><input type="radio" name="r" value="admin"><span>Admin</span></label></div></fieldset>
        <p class="form-error" id="err" role="alert" hidden></p>
        <div class="sheet-actions"><button class="btn btn-primary btn-lg">Add &amp; create password</button><button type="button" class="btn btn-secondary" data-close>Cancel</button></div></form>`, {
        wire: (d) => $('form', d).addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const r = await store.api('/api/users', { method: 'POST', body: { name: $('#n', d).value, email: $('#e', d).value, role: $('input[name=r]:checked', d).value } });
            d.close(); window.dispatchEvent(new Event('lcc:redraw')); showPassword(r.email, r.password);
          } catch (ex) { const err = $('#err', d); err.hidden = false; err.textContent = ex.offline ? 'No connection — try again when online.' : ex.message; }
        }),
      }));
      on(v, '[data-menu]', 'click', (e, b) => {
        const u = users.find((x) => x.id === b.dataset.menu);
        sheet(`<h2>${esc(u.name)}</h2><p class="muted">${esc(u.email)}</p><div class="list-card">
          <button class="list-row" id="reset">${icon('lock_reset')}<span>Reset password</span></button>
          ${u.id === me.id ? '' : `<button class="list-row ${u.active ? 'danger' : ''}" id="toggle">${icon(u.active ? 'person_off' : 'person')}<span>${u.active ? 'Deactivate login' : 'Reactivate login'}</span></button>`}</div>
          <div class="sheet-actions"><button class="btn btn-secondary" data-close>Close</button></div>`, {
          wire: (d) => {
            on(d, '#reset', 'click', async () => {
              d.close();
              if (!(await confirmSheet({ title: 'Reset password?', text: `${u.email} will be signed out and get a new password.`, ok: 'Reset password' }))) return;
              try { const r = await store.api(`/api/users/${u.id}`, { method: 'PATCH', body: { resetPassword: true } }); showPassword(u.email, r.password); } catch (ex) { toast(ex.message, 'bad'); }
            });
            on(d, '#toggle', 'click', async () => {
              d.close();
              if (u.active && !(await confirmSheet({ title: 'Deactivate login?', text: `${u.name} won't be able to sign in. Their jobs and reports stay.`, ok: 'Deactivate', danger: true }))) return;
              try { await store.api(`/api/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); toast(u.active ? 'Login deactivated' : 'Login reactivated'); window.dispatchEvent(new Event('lcc:redraw')); } catch (ex) { toast(ex.message, 'bad'); }
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
