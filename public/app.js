// LCC Property Reports — PWA version of the Flutter app (lib/screens/*). One module,
// hash routes, no framework. Every screen is a function that returns HTML and wires
// its own handlers; the server owns all data (see server.mjs).
import {
  PHOTO_ROOMS, MATERIAL_AREAS, MATERIAL_STATUSES, MATERIAL_UNITS, PROBLEM_CATEGORIES, STATUS, address,
} from './jobs.mjs?v=__V__';

const COMPANY = 'LCC Bathrooms & Services Ltd';
const REPORT_TITLE = 'PROPERTY CONDITION / COMPLETION REPORT';
const $app = document.getElementById('app');
let me = null;

// ── helpers ─────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name, cls = '', style = '') => `<span class="i ${cls}" ${style ? `style="${style}"` : ''} aria-hidden="true">${name}</span>`;
const fmtDate = (d, long) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: long ? 'long' : 'short', year: 'numeric' });
const $ = (sel, root = $app) => root.querySelector(sel);
const $$ = (sel, root = $app) => [...root.querySelectorAll(sel)];
const on = (sel, ev, fn) => $$(sel).forEach((el) => el.addEventListener(ev, (e) => fn(e, el)));
const go = (hash) => { location.hash = hash; };
const back = (fallback = '#/') => (history.length > 1 ? history.back() : go(fallback));

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

async function api(path, { method = 'GET', body, raw } = {}) {
  const init = { method, headers: {} };
  if (raw) { init.body = raw; init.headers['content-type'] = raw.type || 'image/jpeg'; }
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  let res;
  try { res = await fetch(path, init); } catch { throw new Error('No connection — check your signal and try again'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { me = null; route(); throw new Error('Please log in again'); }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ── job model helpers (lib/models/job.dart) ─────────────
const count = (j, t) => PHOTO_ROOMS.filter((r) => j.photos?.[r]?.[`${t}Path`]).length;
const missing = (j, t) => PHOTO_ROOMS.filter((r) => !j.photos?.[r]?.[`${t}Path`]);
const materialCount = (j) => MATERIAL_AREAS.reduce((n, a) => n + (j.materials?.[a]?.length || 0), 0);
const finished = (j) => [STATUS.completed, STATUS.reportGenerated, STATUS.adminReviewed].includes(j.status);
const qty = (q) => (Number(q) % 1 === 0 ? String(Math.trunc(q)) : String(q));
const isAdmin = () => me?.role === 'admin';

const CHIP = {
  [STATUS.draft]: '#757575', [STATUS.readyToStart]: '#546e7a', [STATUS.assigned]: '#1976d2',
  [STATUS.workInProgress]: '#f57c00', [STATUS.awaitingAfterPhotos]: '#e64a19', [STATUS.completed]: '#388e3c',
  [STATUS.reportGenerated]: '#00796b', [STATUS.adminReviewed]: '#7b1fa2',
};
const chip = (s) => { const c = CHIP[s] || '#757575'; return `<span class="chip" style="color:${c};border-color:${c}55;background:${c}12">${esc(s.toUpperCase())}</span>`; };

const logo = (size) => `
  <div class="logo" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 100 100"><polygon points="50,2 91.6,26 91.6,74 50,98 8.4,74 8.4,26" fill="none" stroke="#1a1a2e" stroke-width="1.4" stroke-linejoin="round"/></svg>
    <div class="in">
      <div class="lcc" style="font-size:${size * 0.2}px">LCC</div>
      <span class="i" style="font-size:${size * 0.16}px">bathtub</span>
      <div class="name" style="font-size:${size * 0.055}px">BATHROOMS &amp;<br>SERVICES LTD</div>
      <div class="since" style="font-size:${size * 0.04}px;margin-top:${size * 0.015}px">SINCE 2024</div>
    </div>
  </div>`;

const bar = (title, { backTo = '#/', actions = '', bold = false } = {}) => `
  <header class="bar">
    ${backTo ? `<button class="icon-btn" data-back="${esc(backTo)}" aria-label="Back">${icon('arrow_back')}</button>` : ''}
    <h1 class="${bold ? 'bold' : ''}" ${backTo ? '' : 'style="margin-left:16px"'}>${esc(title)}</h1>${actions}
  </header>`;

function render(html) {
  $app.innerHTML = html;
  on('[data-back]', 'click', (e, el) => back(el.dataset.back));
  window.scrollTo(0, 0);
}
const loading = (title) => render(`${title ? bar(title) : ''}<div class="spinner"></div>`);

function dialog(html, wire) {
  const d = document.createElement('dialog');
  d.innerHTML = html;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  wire?.(d);
  d.showModal();
  return d;
}

function viewPhoto(src) {
  const d = dialog(`<img src="${esc(src)}" alt=""><button class="icon-btn" data-close aria-label="Close">${icon('close')}</button>`);
  d.classList.add('viewer');
  d.addEventListener('click', (e) => { if (e.target.tagName === 'IMG') d.close(); });
}

// pick a photo (the phone offers camera or library) and shrink it to 1600px JPEG, like image_picker did
function pickPhoto() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      try {
        const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, 'image/jpeg', 0.7);
      } catch { toast("Couldn't read that photo — try another one"); resolve(null); }
    });
    input.click();
  });
}

const getJob = (id) => api(`/api/jobs/${encodeURIComponent(id)}`);
const patchJob = (id, body) => api(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body });

// ── login ───────────────────────────────────────────────
function loginScreen() {
  render(`
    <div class="login"><form novalidate>
      ${logo(190)}
      <div style="height:40px"></div>
      <label for="email">Email / Username</label>
      <div class="field-wrap"><input id="email" type="email" autocomplete="username" placeholder="Enter your email or username" value="${esc(localStorage.getItem('lcc-email') || '')}"><span class="suffix icon-btn">${icon('person_outline')}</span></div>
      <label for="pw">Password</label>
      <div class="field-wrap"><input id="pw" type="password" autocomplete="current-password" placeholder="Enter your password"><button type="button" class="suffix icon-btn" id="eye" aria-label="Show password">${icon('visibility')}</button></div>
      <div style="height:24px"></div>
      <button class="btn" id="go">Login</button>
      <div class="center" style="margin-top:8px"><button type="button" class="btn text" id="forgot" style="margin:auto">Forgot Password?</button></div>
    </form></div>`);
  on('#eye', 'click', (e, b) => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; b.innerHTML = icon(p.type === 'password' ? 'visibility' : 'visibility_off'); });
  on('#forgot', 'click', () => toast('Ask your admin to reset your password from the Team page'));
  on('form', 'submit', async (e) => {
    e.preventDefault();
    const btn = $('#go'); btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const email = $('#email').value.trim();
      await api('/api/login', { method: 'POST', body: { email, password: $('#pw').value } });
      try { localStorage.setItem('lcc-email', email); } catch {}
      me = await api('/api/me');
      location.hash = '#/'; route();
    } catch (err) {
      toast(err.message); $('#pw').value = ''; $('#pw').focus();
      btn.disabled = false; btn.textContent = 'Login';
    }
  });
}

async function logout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  caches.delete('lcc-photos').catch(() => {});
  me = null; location.hash = '#/'; route();
}

// ── admin menu (admin_menu_screen.dart) ─────────────────
async function adminHome() {
  render(`${bar('LCC Admin', { backTo: '', bold: true, actions: `<button class="icon-btn" id="menu" aria-label="Menu">${icon('menu')}</button>` })}
    <main class="page">
      ${[
        ['#/new', '#e3f4f5', '#0097a7', 'folder_copy', 'Open the Work', 'Create a new property job'],
        ['#/pick/before', '#e9f6ec', '#2e9e4f', 'history', 'How It Was Before', 'Before-condition photographs'],
        ['#/pick/results', '#f2eafb', '#7c4dff', 'bar_chart', 'Results', 'Before & after comparison'],
        ['#/reports', '#fff4e0', '#f9a825', 'archive', 'Older Reports', 'Completed reports by date'],
        ['#/team', '#e8eaf6', '#3f51b5', 'groups', 'Team', 'Employee logins'],
      ].map(([href, bg, fg, ic, t, s]) => `<a class="menu-card" href="${href}" style="background:${bg}">${icon(ic, '', `color:${fg}`)}<div><div class="t">${t}</div><div class="s">${s}</div></div></a>`).join('')}
      <div class="title-md" style="margin-top:24px">Active Jobs</div>
      <div id="active"><div class="spinner"></div></div>
      <p class="muted" style="font-size:11px">Signed in as ${esc(me.email)} - ${fmtDate(Date.now())}</p>
    </main>`);
  on('#menu', 'click', () => dialog(`
    <h2>${esc(me.name)}</h2><p class="muted">${esc(me.email)} · Admin</p>
    <div class="stack" style="margin-top:16px">
      <button class="btn outline left" id="pw">${icon('lock')} Change Password</button>
      <button class="btn outline left" id="out">${icon('logout')} Sign out</button>
    </div>
    <div class="actions"><button class="btn text" data-close>Close</button></div>`, (d) => {
    d.querySelector('#pw').onclick = () => { d.close(); changePassword(); };
    d.querySelector('#out').onclick = () => { d.close(); logout(); };
  }));
  try {
    const jobs = (await api('/api/jobs')).filter((j) => !j.reportGeneratedAt);
    $('#active').innerHTML = jobs.length ? jobs.map((j) => `
      <a class="card tile" href="#/job/${esc(j.id)}">
        <div class="grow"><div class="t">${esc(address(j) || j.id)}</div>
          <div class="wrap" style="margin-top:6px">${chip(j.status)}
            <span class="muted">Before ${count(j, 'before')}/8 - After ${count(j, 'after')}/8</span>
            ${j.problems?.length ? `<span class="small" style="color:#ef5350">${j.problems.length} problem(s) reported</span>` : ''}
            ${j.assignedTo ? `<span class="muted">-> ${esc(j.assignedTo)}</span>` : ''}
          </div></div></a>`).join('')
      : `<div class="card tile">${icon('inbox')}<div><div class="t" style="font-weight:400">No active jobs</div><div class="s">Use Open the Work to create one.</div></div></div>`;
  } catch (err) { $('#active').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

// ── job picker (job_picker_screen.dart) ─────────────────
async function jobPicker(kind) {
  const title = kind === 'before' ? 'How It Was Before' : 'Results';
  loading(title);
  const jobs = await api('/api/jobs');
  render(`${bar(title)}<main class="page">
    ${jobs.length ? jobs.map((j) => `
      <a class="card tile" href="#/job/${esc(j.id)}/${kind === 'before' ? 'photos/before' : 'results'}">
        <div class="grow"><div class="t">${esc(address(j) || j.id)}</div>
          <div class="wrap" style="margin-top:6px">${chip(j.status)}<span class="muted" style="font-size:11px">${esc(j.id)}</span></div></div>
        ${icon('chevron_right')}</a>`).join('')
      : '<p class="center" style="margin-top:40px">No jobs yet. Create one from Open the Work.</p>'}
  </main>`);
}

// ── open the work, step 1 (create_job_property_screen.dart) ─
function createJob() {
  const f = (id, lbl, ph, extra = '') => `<label for="${id}">${lbl}</label><input id="${id}" placeholder="${ph}" ${extra}>`;
  render(`${bar('Open the Work')}<main class="page"><form novalidate>
    <div class="title-md" style="margin-top:0">Step 1 of 3 - Property Information</div>
    ${f('houseNumber', 'House / Flat number', 'e.g. 123 or Flat 4B', 'required')}
    ${f('street', 'Street', 'e.g. Main Street', 'required')}
    ${f('town', 'Town / City', 'e.g. London', 'required')}
    ${f('postcode', 'Postcode', 'e.g. SW1A 1AA', 'required autocapitalize="characters"')}
    <div class="title-md" style="margin-top:20px">Key Safe</div>
    <label for="keySafePin">Key Safe PIN (if required)</label>
    <div class="field-wrap"><input id="keySafePin" type="password" inputmode="numeric" autocomplete="off" placeholder="Leave empty if there is no key safe"><button type="button" class="suffix icon-btn" id="eye" aria-label="Show PIN">${icon('visibility')}</button></div>
    <div class="title-md" style="margin-top:20px">Person in Charge</div>
    ${f('personName', 'Name', 'Enter full name')}
    ${f('personPhone', 'Phone', 'Enter phone number', 'type="tel"')}
    ${f('personEmail', 'Email', 'Enter email address', 'type="email"')}
    <div style="height:24px"></div>
    <button class="btn" id="next">Next: Materials</button>
  </form></main>`);
  on('#eye', 'click', (e, b) => { const p = $('#keySafePin'); p.type = p.type === 'password' ? 'text' : 'password'; b.innerHTML = icon(p.type === 'password' ? 'visibility' : 'visibility_off'); });
  on('form', 'submit', async (e) => {
    e.preventDefault();
    $$('.err').forEach((x) => x.remove());
    const empty = $$('input[required]').filter((i) => !i.value.trim());
    empty.forEach((i) => i.insertAdjacentHTML('afterend', '<div class="err">Required</div>'));
    if (empty.length) return empty[0].focus();
    const btn = $('#next'); btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const body = Object.fromEntries($$('input').map((i) => [i.id, i.value.trim()]));
      const job = await api('/api/jobs', { method: 'POST', body });
      location.replace(`#/job/${job.id}/materials?new`);
    } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Next: Materials'; }
  });
}

// ── materials (materials_screen.dart) ───────────────────
async function materials(id, isNew) {
  loading('Materials Required');
  let job = await getJob(id);
  const editable = isAdmin();
  const draw = () => {
    const open = new Set($$('details[open]').map((d) => d.dataset.area));
    render(`${bar('Materials Required')}<main class="page">
      <div class="title-md" style="margin-top:0">${editable && isNew ? 'Step 2 of 3 - Materials' : esc(address(job))}</div>
      ${editable && isNew ? `<p class="muted" style="margin-top:-6px">${esc(address(job))}</p>` : ''}
      ${MATERIAL_AREAS.map((area) => {
        const items = job.materials[area] || [];
        return `<details class="area" data-area="${esc(area)}" ${open.has(area) ? 'open' : ''}>
          <summary>${esc(area)} - ${items.length} item${items.length === 1 ? '' : 's'}</summary>
          <div class="area-body">
            ${items.length ? `<div class="mat head"><span>MATERIAL</span><span>QTY</span><span>STATUS</span><span></span></div>` + items.map((m, i) => `
              <div class="mat"><div><div class="d">${esc(m.description)}</div>${m.specification ? `<div class="muted" style="font-size:11px">${esc(m.specification)}</div>` : ''}</div>
                <span>${qty(m.quantity)} ${esc(m.unit)}</span>
                <span style="font-size:11px;color:${m.status === 'To Order' ? '#e65100' : m.status === 'Ordered' ? '#1976d2' : '#388e3c'}">${esc(m.status)}</span>
                ${editable ? `<button class="icon-btn" data-del="${i}" data-area="${esc(area)}" aria-label="Delete">${icon('delete_outline')}</button>` : '<span></span>'}
              </div>`).join('') : '<p class="muted" style="font-size:14px;margin:8px 0">No materials yet</p>'}
            ${editable ? `<button class="btn text" data-add="${esc(area)}">${icon('add')} Add Material</button>` : ''}
          </div></details>`;
      }).join('')}
      <div style="height:16px"></div>
      ${editable
        ? (isNew ? `<a class="btn" href="#/job/${esc(id)}/summary">Next: Summary</a>` : '')
        : `<a class="btn outline" href="#/job/${esc(id)}/problem?cat=${encodeURIComponent('Missing material')}">${icon('report_problem')} Report Material Problem</a>`}
    </main>`);
    const save = async (next) => {
      try { job = await patchJob(id, { materials: next }); draw(); } catch (err) { toast(err.message); }
    };
    on('[data-del]', 'click', (e, b) => {
      const next = structuredClone(job.materials);
      next[b.dataset.area].splice(Number(b.dataset.del), 1);
      save(next);
    });
    on('[data-add]', 'click', (e, b) => materialDialog((item) => {
      const next = structuredClone(job.materials);
      next[b.dataset.add].push(item);
      save(next);
    }));
  };
  draw();
}

function materialDialog(onAdd) {
  const opts = (list) => list.map((v) => `<option>${esc(v)}</option>`).join('');
  dialog(`<form method="dialog" novalidate>
    <h2>Add Material</h2>
    <label for="md">Material / Description</label><input id="md" placeholder="e.g. Paint, Tiles, Toilet">
    <label for="ms">Specification / Notes</label><input id="ms" placeholder="e.g. Dulux White Matt, 600x600">
    <label for="mq">Quantity</label><input id="mq" type="number" inputmode="decimal" min="0" step="any" value="1">
    <label for="mu">Unit</label><select id="mu">${opts(MATERIAL_UNITS)}</select>
    <label for="mst">Status</label><select id="mst">${opts(MATERIAL_STATUSES)}</select>
    <div class="actions"><button type="button" class="btn text" data-close>Cancel</button><button class="btn small" id="ok">Add</button></div>
  </form>`, (d) => {
    d.querySelector('form').addEventListener('submit', (e) => {
      const desc = d.querySelector('#md').value.trim();
      if (!desc) { e.preventDefault(); d.querySelector('#md').focus(); return; }
      onAdd({ description: desc, specification: d.querySelector('#ms').value.trim(), quantity: Number(d.querySelector('#mq').value) || 1, unit: d.querySelector('#mu').value, status: d.querySelector('#mst').value });
    });
  });
}

// ── open the work, step 3 (job_summary_screen.dart) ─────
async function summary(id) {
  loading('Job Summary');
  const [job, users] = await Promise.all([getJob(id), api('/api/users')]);
  const employees = users.filter((u) => u.active && u.role === 'employee');
  render(`${bar('Job Summary')}<main class="page">
    <div class="title-md" style="margin-top:0">Step 3 of 3 - Summary</div>
    <div class="card pad" style="padding:16px">
      <div class="kv"><span>Job ID</span><span>${esc(job.id)}</span></div>
      <div class="kv"><span>Property</span><span>${esc(address(job))}</span></div>
      <div class="kv"><span>Person in Charge</span><span>${esc(job.personName || '-')}</span></div>
      <div class="kv"><span>Materials</span><span>${materialCount(job)} items</span></div>
      <div class="kv"><span>Before Photos</span><span>${count(job, 'before') === 8 ? '8/8 complete' : 'Not completed'}</span></div>
    </div>
    <label for="assign" style="margin-top:16px">Assign to employee (email)</label>
    <input id="assign" type="email" list="emps" value="${esc(job.assignedTo)}" placeholder="e.g. maria@lcc.com (leave empty to assign later)">
    <datalist id="emps">${employees.map((u) => `<option value="${esc(u.email)}">${esc(u.name)}</option>`).join('')}</datalist>
    ${employees.length ? '' : '<p class="muted">No employees yet — add them on the Team page.</p>'}
    <div style="height:24px"></div>
    <button class="btn" id="start">${icon('play_arrow')} Start Work</button>
  </main>`);
  on('#start', 'click', async (e, btn) => {
    btn.disabled = true;
    const assignedTo = $('#assign').value.trim().toLowerCase();
    try {
      await patchJob(id, { assignedTo, status: assignedTo ? STATUS.assigned : STATUS.readyToStart });
      toast(assignedTo ? `Job ${id} assigned to ${assignedTo}` : `Job ${id} saved`);
      go(`#/job/${id}/photos/before`);
    } catch (err) { toast(err.message); btn.disabled = false; }
  });
}

// ── job details (job_details_screen.dart) ───────────────
async function jobDetails(id) {
  loading('Job');
  const job = await getJob(id);
  const admin = isAdmin();
  const b = count(job, 'before'), a = count(job, 'after'), mc = materialCount(job);
  const prog = (label, done, detail) => `<div class="info-row">${icon(done ? 'check_circle' : 'radio_button_unchecked', done ? 'ok' : 'todo')}<span class="grow">${label}</span><span class="muted">${detail}</span></div>`;
  const action = (href, ic, label) => `<a class="btn outline left" href="${href}">${icon(ic)} ${label}</a>`;
  const base = `#/job/${esc(id)}`;
  render(`${bar(job.id || 'Job')}<main class="page">
    <div class="row"><div class="grow" style="font-size:16px;font-weight:700">${esc(address(job))}</div>${chip(job.status)}</div>
    <p class="muted" style="margin:4px 0 16px">Created ${fmtDate(job.createdAt)}${job.assignedTo ? ` - Assigned to ${esc(job.assignedTo)}` : ''}</p>
    <div class="card pad"><h3>PROPERTY INFORMATION</h3>
      <div class="info-row">${icon('vpn_key')}<span class="muted" style="font-size:13px">Key Safe PIN:&nbsp;</span>
        <b id="pin">${job.keySafePin ? '****' : 'Not set'}</b>
        ${job.keySafePin ? `<button class="icon-btn" id="eye" aria-label="Show PIN" style="width:32px;height:32px">${icon('visibility')}</button>` : ''}</div>
      <div style="height:4px"></div>
      ${job.personName ? `<div class="info-row">${icon('person_outline')}${esc(job.personName)}</div>` : ''}
      ${job.personPhone ? `<div class="info-row">${icon('phone')}<a href="tel:${esc(job.personPhone)}">${esc(job.personPhone)}</a></div>` : ''}
      ${job.personEmail ? `<div class="info-row">${icon('email')}<a href="mailto:${esc(job.personEmail)}">${esc(job.personEmail)}</a></div>` : ''}
    </div>
    <div class="card pad" style="margin-top:12px"><h3>JOB PROGRESS</h3>
      ${prog('Property', true, 'recorded')}${prog('Materials', mc > 0, `${mc} items`)}
      ${prog('Before Photos', b === 8, `${b}/8`)}${prog('After Photos', a === 8, `${a}/8`)}
      ${prog('Report', !!job.reportGeneratedAt, job.reportGeneratedAt ? 'Generated' : 'Not generated')}
    </div>
    ${job.problems?.length ? `<div class="card pad" style="margin-top:12px"><h3>PROBLEMS REPORTED</h3>
      ${job.problems.map((p) => `<div class="row" style="align-items:flex-start;margin-bottom:8px">${icon('warning_amber', 'warn', 'font-size:18px')}
        <div class="grow" style="font-size:13px">${esc(p.category)}: ${esc(p.description)}
          <div class="muted" style="font-size:11px">${esc(p.createdBy)} · ${fmtDate(p.createdAt)}</div></div>
        ${p.photoPath ? `<button class="thumb sm" data-view="${esc(p.photoPath)}"><img src="${esc(p.photoPath)}" alt="" loading="lazy"></button>` : ''}</div>`).join('')}
    </div>` : ''}
    <div class="stack" style="margin-top:16px">
      ${!finished(job) && b === 8 && job.status !== STATUS.workInProgress ? `<button class="btn" id="start">${icon('play_arrow')} Start Work</button>` : ''}
      ${action(`${base}/materials`, 'inventory_2', admin ? `Materials (${mc} items) - edit` : `Materials (${mc} items)`)}
      ${action(`${base}/photos/before`, 'photo_camera', `Before Photos (${b}/8)`)}
      ${action(`${base}/photos/after`, 'add_a_photo', `After Photos (${a}/8)`)}
      ${action(`${base}/results`, 'bar_chart', 'Results - Before & After')}
      ${admin ? action(`${base}/assign`, 'person_add', job.assignedTo ? 'Reassign employee' : 'Assign employee') : action(`${base}/problem`, 'report_problem', 'Report a Problem')}
    </div>
  </main>`);
  let shown = false;
  on('#eye', 'click', (e, btn) => { shown = !shown; $('#pin').textContent = shown ? job.keySafePin : '****'; btn.innerHTML = icon(shown ? 'visibility_off' : 'visibility'); });
  on('[data-view]', 'click', (e, el) => viewPhoto(el.dataset.view));
  on('#start', 'click', async (e, btn) => {
    btn.disabled = true;
    try { await patchJob(id, { status: STATUS.workInProgress }); toast('Work started'); jobDetails(id); } catch (err) { toast(err.message); btn.disabled = false; }
  });
}

// ── photo capture (photo_capture_screen.dart) ───────────
async function photoCapture(id, type) {
  const before = type === 'before';
  const title = before ? 'How It Was Before' : 'After Photos';
  loading(title);
  let job = await getJob(id);
  const busy = new Set();
  const draw = () => {
    const n = count(job, type), miss = missing(job, type), done = n === 8;
    render(`${bar(title)}<main class="page">
      <div style="font-weight:600">${esc(address(job))}</div>
      <div style="font-weight:600;margin-top:4px" class="${done ? 'ok' : ''}">${before ? 'Before' : 'After'} Photos: ${n}/8</div>
      ${!done ? `<p class="small warn" style="margin:6px 0 0">Missing: ${miss.map(esc).join(', ')}</p>` : ''}
      <div class="grid2" style="margin-top:12px">
        ${PHOTO_ROOMS.map((room, i) => {
          const src = job.photos?.[room]?.[`${type}Path`];
          return `<div><div class="slot ${busy.has(i) ? 'busy' : ''}" role="button" tabindex="0" data-slot="${i}" aria-label="${esc(room)} ${type} photo">
              ${src ? `<img src="${esc(src)}" alt=""><button class="x" data-rm="${i}" aria-label="Remove photo">${icon('close')}</button><span class="tick">${icon('check')}</span>` : icon('photo_camera')}
            </div><div class="slot-label">${i + 1}. ${esc(room)}</div></div>`;
        }).join('')}
      </div>
      <div style="height:20px"></div>
      <button class="btn" id="cont" ${done ? '' : 'disabled'}>${done ? 'Save & Continue' : `Save & Continue (${n}/8)`}</button>
    </main>`);
    on('[data-slot]', 'click', async (e, el) => {
      if (e.target.closest('[data-rm]')) return;
      const i = Number(el.dataset.slot), room = PHOTO_ROOMS[i];
      if (busy.has(i)) return;
      if (job.photos?.[room]?.[`${type}Path`] && !confirm(`A photo for ${room} already exists. Replace it?`)) return;
      const blob = await pickPhoto();
      if (!blob) return;
      busy.add(i); draw();
      try { job = await api(`/api/jobs/${encodeURIComponent(id)}/photos/${i}/${type}`, { method: 'PUT', raw: blob }); }
      catch (err) { toast(err.message); }
      busy.delete(i); draw();
    });
    on('[data-rm]', 'click', async (e, b) => {
      e.stopPropagation();
      try { job = await api(`/api/jobs/${encodeURIComponent(id)}/photos/${b.dataset.rm}/${type}`, { method: 'DELETE' }); draw(); } catch (err) { toast(err.message); }
    });
    on('#cont', 'click', () => back(`#/job/${id}`));
  };
  draw();
}

// ── results (results_screen.dart) ───────────────────────
async function results(id) {
  loading('Results - Before & After');
  const job = await getJob(id);
  const b = count(job, 'before'), a = count(job, 'after'), ready = b === 8 && a === 8;
  const thumb = (src, after) => src
    ? `<button class="thumb" data-view="${esc(src)}"><img src="${esc(src)}" alt="" loading="lazy"></button>`
    : after ? `<a class="thumb" href="#/job/${esc(id)}/photos/after" aria-label="Take after photo">${icon('photo_camera')}</a>`
      : `<div class="thumb">${icon('image_not_supported')}</div>`;
  render(`${bar('Results - Before & After')}<main class="page">
    <div style="font-weight:600">${esc(address(job))}</div>
    <p class="muted" style="margin:4px 0 16px">Before ${b}/8 - After ${a}/8${materialCount(job) ? '' : ' - No materials recorded'}</p>
    <div class="cmp"><span></span><span class="center"><span class="pill" style="background:#ffe1e1">BEFORE</span></span><span class="center"><span class="pill" style="background:#dff3e2">AFTER</span></span></div>
    ${PHOTO_ROOMS.map((room, i) => `<div class="cmp"><span style="font-size:13px">${i + 1}. ${esc(room)}</span>
      ${thumb(job.photos?.[room]?.beforePath, false)}${thumb(job.photos?.[room]?.afterPath, true)}</div>`).join('')}
    <div style="height:12px"></div>
    <button class="btn" id="gen" ${ready ? '' : 'disabled'}>${icon('picture_as_pdf')} ${ready ? 'Complete Job &amp; Generate Report' : `Generate Report (${a}/8 after photos)`}</button>
  </main>`);
  on('[data-view]', 'click', (e, el) => viewPhoto(el.dataset.view));
  on('#gen', 'click', async (e, btn) => {
    const miss = [
      ...(address(job).trim() ? [] : ['Property address']),
      ...missing(job, 'before').map((r) => `${r} - Before photo`),
      ...missing(job, 'after').map((r) => `${r} - After photo`),
    ];
    if (miss.length) return dialog(`<h2>Job cannot be completed</h2><p>Missing:</p><ul>${miss.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><div class="actions"><button class="btn text" data-close>OK</button></div>`);
    btn.disabled = true;
    try {
      if (!job.reportGeneratedAt) await patchJob(id, { status: STATUS.completed });
      go(`#/job/${id}/report`);
    } catch (err) { toast(err.message); btn.disabled = false; }
  });
}

// ── report (report_view_screen.dart) ────────────────────
async function report(id) {
  loading('Report');
  let job = await getJob(id);
  // opening the finished report marks it generated, like the app's initState did
  if (!job.reportGeneratedAt) job = await patchJob(id, { reportGeneratedAt: new Date().toISOString(), status: STATUS.reportGenerated });
  const admin = isAdmin();
  const pdfUrl = `/api/jobs/${encodeURIComponent(id)}/pdf`;
  const kv = (k, v) => `<div class="kv sm"><span>${k}</span><span>${esc(v)}</span></div>`;
  const areas = MATERIAL_AREAS.filter((a) => job.materials?.[a]?.length);
  const thumb = (src) => src ? `<button class="thumb sm" data-view="${esc(src)}"><img src="${esc(src)}" alt="" loading="lazy"></button>` : `<div class="thumb sm">${icon('image_not_supported')}</div>`;
  render(`${bar('Report', { actions: `<button class="icon-btn" id="share2" aria-label="Share">${icon('ios_share')}</button>` })}<main class="page">
    <div class="report">
      ${logo(80)}
      <div class="center" style="font-weight:700;margin-top:8px">${COMPANY}</div>
      <div class="center" style="font-size:12px;font-weight:700;color:var(--primary)">${REPORT_TITLE}</div>
      <div style="height:16px"></div>
      ${kv('Job ID', job.id)}${kv('Date', fmtDate(job.reportGeneratedAt))}${kv('Property', address(job))}
      ${job.personName ? kv('Person in charge', job.personName + (job.personPhone ? ` (${job.personPhone})` : '')) : ''}
      ${job.assignedTo ? kv('Completed by', job.assignedTo) : ''}
      <hr><h4>MATERIALS</h4>
      ${areas.length ? areas.map((a) => `<div style="font-weight:600;font-size:12px">${esc(a)}</div>${job.materials[a].map((m) =>
        `<div style="font-size:12px;padding-left:8px">${esc(m.description)}${m.specification ? ` - ${esc(m.specification)}` : ''} - ${qty(m.quantity)} ${esc(m.unit)} (${esc(m.status)})</div>`).join('')}<div style="height:6px"></div>`).join('')
        : '<p class="muted">No materials recorded for this job.</p>'}
      <hr><h4>BEFORE &amp; AFTER COMPARISON</h4>
      ${PHOTO_ROOMS.map((r, i) => `<div class="row" style="margin-bottom:8px"><span class="grow small">${i + 1}. ${esc(r)}</span>${thumb(job.photos?.[r]?.beforePath)}${thumb(job.photos?.[r]?.afterPath)}</div>`).join('')}
    </div>
    <div class="btns" style="margin-top:16px">
      <a class="btn outline" href="${pdfUrl}?download=1" download>${icon('download')} Download PDF</a>
      <button class="btn" id="share">${icon('share')} Share Report</button>
    </div>
    <div style="margin-top:12px">
      ${!admin && !job.submittedAt ? `<button class="btn tonal" id="submit">${icon('send')} Submit to Admin</button>` : ''}
      ${admin && job.submittedAt && job.status !== STATUS.adminReviewed ? `<button class="btn tonal" id="review">${icon('verified')} Mark Reviewed</button>` : ''}
      ${job.status === STATUS.adminReviewed ? `<p class="center small" style="color:#ba68c8">${icon('verified', '', 'font-size:16px')} Reviewed by Admin</p>` : ''}
      ${!admin && job.submittedAt && job.status !== STATUS.adminReviewed ? '<p class="center muted">Submitted to Admin for review</p>' : ''}
    </div>
  </main>`);
  on('[data-view]', 'click', (e, el) => viewPhoto(el.dataset.view));
  const share = async (e, btn) => {
    btn.disabled = true;
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error("Couldn't build the PDF");
      const file = new File([await res.blob()], `lcc-report-${job.id}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${COMPANY} - ${address(job)} (${job.id})` });
      else window.open(pdfUrl, '_blank');
    } catch (err) { if (err.name !== 'AbortError') toast(err.message); }
    btn.disabled = false;
  };
  on('#share', 'click', share); on('#share2', 'click', share);
  const step = (sel, body, msg) => on(sel, 'click', async (e, btn) => {
    btn.disabled = true;
    try { await patchJob(id, body); toast(msg); report(id); } catch (err) { toast(err.message); btn.disabled = false; }
  });
  step('#submit', { submittedAt: new Date().toISOString() }, 'Submitted to Admin for review');
  step('#review', { status: STATUS.adminReviewed }, 'Marked as reviewed');
}

// ── report a problem (report_problem_screen.dart) ───────
async function problem(id, initial) {
  loading('Report a Problem');
  const job = await getJob(id);
  let photoPath = null;
  render(`${bar('Report a Problem')}<main class="page">
    <div style="font-weight:600">${esc(address(job))}</div>
    <label for="cat">Problem type</label>
    <select id="cat">${PROBLEM_CATEGORIES.map((c) => `<option ${c === initial ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <label for="desc">Description</label>
    <textarea id="desc" rows="4" placeholder="e.g. Bathroom tiles are short by 2 boxes."></textarea>
    <label>Attach a photo (optional)</label>
    <div style="width:140px"><div class="slot" id="ph" role="button" tabindex="0" style="height:110px">${icon('photo_camera')}</div></div>
    <div style="height:24px"></div>
    <button class="btn" id="send">${icon('send')} Send to Admin</button>
  </main>`);
  const slot = $('#ph');
  const drawSlot = () => {
    slot.innerHTML = photoPath ? `<img src="${esc(photoPath)}" alt=""><button class="x" id="rm" aria-label="Remove photo">${icon('close')}</button><span class="tick">${icon('check')}</span>` : icon('photo_camera');
    slot.querySelector('#rm')?.addEventListener('click', (e) => { e.stopPropagation(); photoPath = null; drawSlot(); });
  };
  slot.addEventListener('click', async () => {
    const blob = await pickPhoto();
    if (!blob) return;
    slot.classList.add('busy');
    try { photoPath = (await api(`/api/jobs/${encodeURIComponent(id)}/files/problem`, { method: 'PUT', raw: blob })).url; } catch (err) { toast(err.message); }
    slot.classList.remove('busy'); drawSlot();
  });
  on('#send', 'click', async (e, btn) => {
    if (!$('#desc').value.trim()) return toast('Please describe the problem');
    btn.disabled = true; btn.lastChild.textContent = ' Sending...';
    try {
      await api(`/api/jobs/${encodeURIComponent(id)}/problems`, { method: 'POST', body: { category: $('#cat').value, description: $('#desc').value, photoPath } });
      toast('Sent to Admin'); back(`#/job/${id}`);
    } catch (err) { toast(err.message); btn.disabled = false; btn.lastChild.textContent = ' Send to Admin'; }
  });
}

// ── older reports (older_reports_screen.dart) ───────────
async function olderReports() {
  loading('Older Reports');
  const all = (await api('/api/jobs')).filter((j) => j.reportGeneratedAt)
    .sort((a, b) => b.reportGeneratedAt.localeCompare(a.reportGeneratedAt));
  const dayKey = (d) => new Date(d).toLocaleDateString('en-CA'); // yyyy-mm-dd, local time
  const draw = (filter) => {
    const list = filter ? all.filter((j) => dayKey(j.reportGeneratedAt) === filter) : all;
    const groups = new Map();
    for (const j of list) groups.set(dayKey(j.reportGeneratedAt), [...(groups.get(dayKey(j.reportGeneratedAt)) || []), j]);
    render(`${bar('Older Reports', { actions: `<label class="icon-btn" style="margin:0;position:relative" aria-label="Filter by date">${icon('filter_alt')}<input type="date" id="date" value="${filter || ''}" style="position:absolute;inset:0;opacity:0;padding:0"></label>` })}
      <main class="page">
        ${filter ? `<button class="filter on" id="clear" style="margin-bottom:12px">${icon('filter_alt')} Filtered: ${fmtDate(filter)} ${icon('close')}</button>` : ''}
        ${list.length ? [...groups].map(([day, jobs]) => `
          <div style="font-weight:700;font-size:15px;margin-bottom:8px">${fmtDate(day)}</div>
          ${jobs.map((j) => `<a class="card tile" href="#/job/${esc(j.id)}/report">${icon('description')}
            <div class="grow"><div class="t" style="font-size:14px">${esc(address(j))}</div><div class="s">${esc(j.id)} - ${esc(j.status)}</div></div>${icon('chevron_right')}</a>`).join('')}
          <div style="height:16px"></div>`).join('')
          : `<p class="center" style="margin-top:40px">${filter ? `No reports on ${fmtDate(filter)}.` : 'No completed reports yet.'}</p>`}
      </main>`);
    on('#date', 'change', (e, el) => draw(el.value || null));
    on('#clear', 'click', () => draw(null));
  };
  draw(null);
}

// ── assign / reassign (admin, from job details) ─────────
async function assign(id) {
  loading('Assign employee');
  const [job, users] = await Promise.all([getJob(id), api('/api/users')]);
  const employees = users.filter((u) => u.active && u.role === 'employee');
  render(`${bar('Assign employee')}<main class="page">
    <div style="font-weight:600">${esc(address(job))}</div>
    <label for="assign">Employee (email)</label>
    <select id="assign"><option value="">— Not assigned —</option>
      ${employees.map((u) => `<option value="${esc(u.email)}" ${u.email === job.assignedTo ? 'selected' : ''}>${esc(u.name)} (${esc(u.email)})</option>`).join('')}
      ${job.assignedTo && !employees.some((u) => u.email === job.assignedTo) ? `<option selected value="${esc(job.assignedTo)}">${esc(job.assignedTo)}</option>` : ''}
    </select>
    <div style="height:24px"></div>
    <button class="btn" id="save">Save</button>
  </main>`);
  on('#save', 'click', async (e, btn) => {
    btn.disabled = true;
    const assignedTo = $('#assign').value;
    const body = { assignedTo };
    if ([STATUS.draft, STATUS.readyToStart, STATUS.assigned].includes(job.status)) body.status = assignedTo ? STATUS.assigned : STATUS.readyToStart;
    try { await patchJob(id, body); toast('Saved'); back(`#/job/${id}`); } catch (err) { toast(err.message); btn.disabled = false; }
  });
}

// ── team (admin): replaces adding users in the Firebase console ─
async function team() {
  loading('Team');
  const users = await api('/api/users');
  const showPassword = (email, password) => dialog(`<h2>Login details</h2>
    <p>Send these to the employee. The password is shown only once.</p>
    <div class="card pad" style="user-select:all"><div>${esc(email)}</div><div style="font-family:monospace;font-size:18px;margin-top:4px">${esc(password)}</div></div>
    <div class="actions"><button class="btn text" data-close>Done</button></div>`);
  render(`${bar('Team')}<main class="page">
    <button class="btn" id="add">${icon('person_add')} Add employee</button>
    <div style="height:16px"></div>
    ${users.map((u) => `<div class="card tile" style="${u.active ? '' : 'opacity:.55'}">
      <div class="grow"><div class="t">${esc(u.name)} ${u.role === 'admin' ? '<span class="muted">· Admin</span>' : ''}</div><div class="s">${esc(u.email)}${u.active ? '' : ' · deactivated'}</div></div>
      <button class="icon-btn" data-reset="${u.id}" data-email="${esc(u.email)}" aria-label="Reset password">${icon('lock_reset')}</button>
      ${u.id === me.id ? '' : `<button class="icon-btn" data-toggle="${u.id}" data-active="${u.active}" aria-label="${u.active ? 'Deactivate' : 'Reactivate'}">${icon(u.active ? 'person_off' : 'person')}</button>`}
    </div>`).join('')}
  </main>`);
  on('#add', 'click', () => dialog(`<form method="dialog" novalidate><h2>Add employee</h2>
      <label for="n">Name</label><input id="n" autocomplete="off">
      <label for="e">Email</label><input id="e" type="email" autocomplete="off">
      <label for="r">Role</label><select id="r"><option value="employee">Employee</option><option value="admin">Admin</option></select>
      <div class="actions"><button type="button" class="btn text" data-close>Cancel</button><button class="btn small">Add</button></div></form>`, (d) => {
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/users', { method: 'POST', body: { name: d.querySelector('#n').value, email: d.querySelector('#e').value, role: d.querySelector('#r').value } });
        d.close(); await team(); showPassword(r.email, r.password);
      } catch (err) { toast(err.message); }
    });
  }));
  on('[data-reset]', 'click', async (e, b) => {
    if (!confirm(`Reset the password for ${b.dataset.email}? They will be logged out.`)) return;
    try { const r = await api(`/api/users/${b.dataset.reset}`, { method: 'PATCH', body: { resetPassword: true } }); showPassword(b.dataset.email, r.password); } catch (err) { toast(err.message); }
  });
  on('[data-toggle]', 'click', async (e, b) => {
    try { await api(`/api/users/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.active !== 'true' } }); team(); } catch (err) { toast(err.message); }
  });
}

function changePassword() {
  dialog(`<form method="dialog" novalidate><h2>Change Password</h2>
    <label for="cur">Current password</label><input id="cur" type="password" autocomplete="current-password">
    <label for="nw">New password (8+ characters)</label><input id="nw" type="password" autocomplete="new-password" minlength="8">
    <div class="actions"><button type="button" class="btn text" data-close>Cancel</button><button class="btn small">Save</button></div></form>`, (d) => {
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api('/api/password', { method: 'POST', body: { current: d.querySelector('#cur').value, next: d.querySelector('#nw').value } }); d.close(); toast('Password changed'); }
      catch (err) { toast(err.message); }
    });
  });
}

// ── employee home (employee_home_screen.dart) ───────────
const FILTERS = {
  All: () => true,
  Assigned: (j) => [STATUS.assigned, STATUS.readyToStart, STATUS.draft].includes(j.status),
  'In Progress': (j) => [STATUS.workInProgress, STATUS.awaitingAfterPhotos].includes(j.status),
  Completed: finished,
};
const tabs = (cur) => `<nav class="tabs">${[['#/', 'work_outline', 'My Jobs'], ['#/notifications', 'notifications', 'Notifications'], ['#/profile', 'person_outline', 'Profile']]
  .map(([h, ic, l]) => `<a href="${h}" class="${cur === h ? 'on' : ''}">${icon(ic)}${l}</a>`).join('')}</nav>`;

async function myJobs() {
  render(`<div class="spinner"></div>${tabs('#/')}`);
  const jobs = await api('/api/jobs');
  let filter = sessionStorage.getItem('lcc-filter') || 'All';
  const draw = () => {
    const list = jobs.filter(FILTERS[filter] || FILTERS.All);
    render(`<div style="padding-top:env(safe-area-inset-top)"><div class="title-lg" style="padding:16px 16px 4px;margin:0">MY JOBS</div>
      <div class="filters">${Object.keys(FILTERS).map((f) => `<button class="filter ${f === filter ? 'on' : ''}" data-f="${f}">${f === filter ? icon('check', '', 'font-size:18px') : ''}${f}</button>`).join('')}</div></div>
      <main class="page tabs-pad">
        ${list.length ? list.map((j) => `<div class="card pad">
          <div class="row"><div class="grow" style="font-weight:700">${esc(address(j))}</div>${chip(j.status)}</div>
          <div class="muted" style="margin-top:6px">${fmtDate(j.createdAt, true)}</div>
          ${j.personName ? `<div class="muted">Person in charge: ${esc(j.personName)}</div>` : ''}
          <div class="small" style="margin-top:6px">Before Photos: ${count(j, 'before')}/8 &nbsp; After Photos: ${count(j, 'after')}/8</div>
          <div style="display:flex;justify-content:flex-end;margin-top:10px"><a class="btn tonal small" href="#/job/${esc(j.id)}">OPEN JOB</a></div>
        </div>`).join('') : '<p class="center" style="margin-top:40px">No jobs assigned to you yet.</p>'}
      </main>${tabs('#/')}`);
    on('[data-f]', 'click', (e, b) => { filter = b.dataset.f; sessionStorage.setItem('lcc-filter', filter); draw(); });
  };
  draw();
}

async function notifications() {
  render(`<div class="spinner"></div>${tabs('#/notifications')}`);
  const jobs = await api('/api/jobs');
  const events = jobs.flatMap((j) => [
    j.status === STATUS.assigned && `New job assigned: ${address(j)} (${j.id})`,
    j.submittedAt && `Report submitted for review: ${address(j)} (${j.id})`,
    j.status === STATUS.adminReviewed && `Admin reviewed your report: ${address(j)} (${j.id})`,
  ].filter(Boolean));
  render(`<main class="page tabs-pad" style="padding-top:calc(16px + env(safe-area-inset-top))"><div class="title-lg">NOTIFICATIONS</div>
    ${events.length ? events.map((e) => `<div class="card tile">${icon('notifications')}<span style="font-size:13px">${esc(e)}</span></div>`).join('')
      : `<div class="card tile">${icon('notifications_none')}<div><div>No notifications yet</div><div class="s">New jobs and admin messages will appear here.</div></div></div>`}
  </main>${tabs('#/notifications')}`);
}

function profile() {
  render(`<main class="page tabs-pad" style="padding-top:calc(16px + env(safe-area-inset-top))"><div class="title-lg">PROFILE</div>
    <div class="card tile"><span style="width:40px;height:40px;border-radius:50%;background:var(--tonal);display:grid;place-items:center;font-weight:600">${esc((me.name[0] || '?').toUpperCase())}</span>
      <div><div>${esc(me.name)}</div><div class="s">${esc(me.email)}<br>Employee</div></div></div>
    <div class="card" style="margin-top:12px">
      <button class="tile" id="pw">${icon('lock')} Change Password</button>
      <button class="tile" id="out">${icon('logout')} Logout</button>
    </div>
  </main>${tabs('#/profile')}`);
  on('#pw', 'click', changePassword);
  on('#out', 'click', logout);
}

// ── router ──────────────────────────────────────────────
const ROUTES = [
  [/^\/job\/([^/]+)$/, jobDetails],
  [/^\/job\/([^/]+)\/materials$/, (id, q) => materials(id, q.has('new'))],
  [/^\/job\/([^/]+)\/summary$/, summary, 'admin'],
  [/^\/job\/([^/]+)\/assign$/, assign, 'admin'],
  [/^\/job\/([^/]+)\/photos\/(before|after)$/, photoCapture],
  [/^\/job\/([^/]+)\/results$/, results],
  [/^\/job\/([^/]+)\/report$/, report],
  [/^\/job\/([^/]+)\/problem$/, (id, q) => problem(id, q.get('cat'))],
  [/^\/new$/, createJob, 'admin'],
  [/^\/pick\/(before|results)$/, jobPicker, 'admin'],
  [/^\/reports$/, olderReports, 'admin'],
  [/^\/team$/, team, 'admin'],
  [/^\/notifications$/, notifications],
  [/^\/profile$/, profile],
];

async function route() {
  if (!me) return loginScreen();
  const [path, qs = ''] = location.hash.slice(1).split('?');
  const q = new URLSearchParams(qs);
  try {
    for (const [re, fn, role] of ROUTES) {
      const m = path.match(re);
      if (m && (!role || me.role === role)) return await fn(...m.slice(1).map(decodeURIComponent), q);
    }
    return await (isAdmin() ? adminHome() : myJobs());
  } catch (err) {
    if (!me) return;
    render(`${bar('Error')}<main class="page"><p class="err" style="font-size:15px">${esc(err.message)}</p><button class="btn" id="retry">Try again</button></main>`);
    on('#retry', 'click', route);
  }
}

window.addEventListener('hashchange', route);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
me = await api('/api/me').catch(() => null);
route();
