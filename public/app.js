// App shell + router. Every screen returns a description
//   { title, back, tab, actions, body, footer, live, mount(view), dirty() }
// and the shell draws it the same way: safe-area header, content, optional fixed
// bottom action, bottom tabs on phones (Home · Jobs · Reports · More) or a sidebar on desktop.
import { esc, icon, $, $$, on, toast, sheet, confirmSheet, hydrate, setLocalResolver, logo, ago, fmtTime } from './ui.js?v=__V__';
import * as store from './store.js?v=__V__';
import { notifications } from './lists.js?v=__V__';
import { ROUTES as JOB_ROUTES } from './job.js?v=__V__';
import { ROUTES as LIST_ROUTES } from './lists.js?v=__V__';
import { ROUTES as ADMIN_ROUTES } from './admin.js?v=__V__';
import { home } from './home.js?v=__V__';
import { pushState, enablePush, disablePush, refreshPush } from './push.js?v=__V__';

setLocalResolver(store.localUrl);
const $app = document.getElementById('app');
const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

// ── session ─────────────────────────────────────────────
let me = null;
async function boot() {
  try { me = await store.api('/api/me'); safeSet('lcc-me', JSON.stringify(me)); }
  catch (e) { me = e.offline ? JSON.parse(safeGet('lcc-me') || 'null') : null; } // offline: open with the last signed-in user
  if (!me) return loginScreen();
  await store.start(me);
  shell();
  route();
  refreshPush();
}
window.addEventListener('lcc:logged-out', () => { if (me) { me = null; safeSet('lcc-me', null); loginScreen('Your session ended — please sign in again.'); } });

async function logout() {
  const waiting = store.pendingCount();
  const ok = await confirmSheet(waiting
    ? { title: 'Sign out?', text: `${waiting} change${waiting === 1 ? ' is' : 's are'} still waiting to sync and will be lost on this device. Sync first if you can.`, ok: 'Sign out anyway', danger: true }
    : { title: 'Sign out?', ok: 'Sign out' });
  if (!ok) return;
  await disablePush(); // this phone stops getting this person's notifications
  await store.api('/api/logout', { method: 'POST' }).catch(() => {});
  await store.reset();
  caches.delete('lcc-photos').catch(() => {});
  me = null; safeSet('lcc-me', null);
  history.replaceState(null, '', '#/home');
  loginScreen();
}

// ── login ───────────────────────────────────────────────
function loginScreen(message = '') {
  document.body.className = 'is-login';
  $app.innerHTML = `
    <main class="login">
      <div class="login-brand">${logo(112)}<h1>LCC<span>Property Reports</span></h1></div>
      <form class="login-form" novalidate>
        ${message ? `<p class="notice">${icon('info')}${esc(message)}</p>` : ''}
        <label class="field"><span>Email</span><input id="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(safeGet('lcc-email') || '')}"></label>
        <label class="field"><span>Password</span><span class="input-wrap"><input id="pw" type="password" autocomplete="current-password" required>
          <button type="button" class="icon-btn" id="eye" aria-label="Show password">${icon('visibility')}</button></span></label>
        <p class="form-error" id="err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg" id="go">Sign in</button>
        <button type="button" class="btn btn-text" id="forgot">Forgot password?</button>
      </form>
      <p class="login-foot">LCC Bathrooms &amp; Services Ltd</p>
    </main>`;
  const pw = $('#pw'), err = $('#err');
  if (!$('#email').value) $('#email').focus();
  on($app, '#eye', 'click', (e, b) => { pw.type = pw.type === 'password' ? 'text' : 'password'; b.innerHTML = icon(pw.type === 'password' ? 'visibility' : 'visibility_off'); b.setAttribute('aria-label', pw.type === 'password' ? 'Show password' : 'Hide password'); });
  on($app, '#forgot', 'click', () => sheet(`<h2>Forgot your password?</h2><p class="muted">Ask your LCC admin to reset it. They can do it from the Team page and give you a new one straight away.</p><div class="sheet-actions"><button class="btn btn-primary" data-close>OK</button></div>`));
  on($app, 'form', 'submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    if (!email || !pw.value) { err.hidden = false; err.textContent = 'Enter your email and password.'; return; }
    const btn = $('#go'); btn.disabled = true; btn.textContent = 'Signing in…'; err.hidden = true;
    try {
      await store.api('/api/login', { method: 'POST', body: { email, password: pw.value } });
      safeSet('lcc-email', email);
      if (!location.hash || location.hash === '#/') history.replaceState(null, '', '#/home');
      await boot();
    } catch (ex) {
      err.hidden = false; err.textContent = ex.offline ? 'No connection. You need internet to sign in.' : ex.message;
      pw.value = ''; pw.focus(); btn.disabled = false; btn.textContent = 'Sign in';
    }
  });
}

// ── shell ───────────────────────────────────────────────
const TABS = [['home', '#/home', 'home', 'Home'], ['jobs', '#/jobs', 'work_outline', 'Jobs'], ['reports', '#/reports', 'description', 'Reports'], ['more', '#/more', 'menu', 'More']];
function shell() {
  const admin = me.role === 'admin';
  $app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Main">
        <div class="side-brand">${logo(40)}<div><b>LCC Reports</b><small>${admin ? 'Admin' : 'Field app'}</small></div></div>
        <nav class="side-nav">
          ${TABS.slice(0, 3).map(([k, h, ic, l]) => `<a href="${h}" data-tab="${k}">${icon(ic)}<span>${k === 'home' && admin ? 'Dashboard' : l}</span></a>`).join('')}
          ${admin ? `<a href="#/new" data-tab="new">${icon('add_home_work')}<span>New job</span></a><a href="#/team" data-tab="team">${icon('groups')}<span>Team</span></a>` : ''}
          <a href="#/notifications" data-tab="notifications">${icon('notifications')}<span>Notifications</span><b class="badge" data-badge hidden></b></a>
          <a href="#/more" data-tab="more">${icon('settings')}<span>Settings</span></a>
        </nav>
        <button class="side-sync" data-sync></button>
        <div class="side-user"><span class="avatar">${esc((me.name[0] || '?').toUpperCase())}</span><div><b>${esc(me.name)}</b><small>${esc(me.email)}</small></div></div>
      </aside>
      <div class="main">
        <header class="app-header">
          <div class="hdr-side" id="hdr-back"></div>
          <h1 id="hdr-title"></h1>
          <div class="hdr-side hdr-right"><span id="hdr-actions"></span><button class="sync-pill" data-sync></button></div>
        </header>
        <div id="banner"></div>
        <main id="view" class="view" tabindex="-1"></main>
        <div id="footer" class="action-bar"></div>
      </div>
      <nav class="bottom-nav" aria-label="Main">
        ${TABS.map(([k, h, ic, l]) => `<a href="${h}" data-tab="${k}">${icon(ic)}<span>${l}</span>${k === 'more' ? '<b class="badge" data-badge hidden></b>' : ''}</a>`).join('')}
      </nav>
    </div>`;
  $$('[data-sync]').forEach((b) => b.addEventListener('click', () => go('#/sync')));
  $$('.bottom-nav a, .side-nav a').forEach((a) => a.addEventListener('click', async (e) => {
    if (current?.dirty?.() && !(await confirmSheet({ title: 'Discard changes?', text: "What you've typed here will be lost.", ok: 'Discard', danger: true }))) e.preventDefault();
  }));
  paintSync();
}

function paintSync() {
  if (!me) return;
  const s = store.sync, n = store.pendingCount(), failed = store.pending().filter((o) => o.state === 'failed').length;
  const [cls, ic, text] = failed ? ['bad', 'error', `${failed} not sent`]
    : !s.reachable ? ['off', 'cloud_off', n ? `Offline · ${n} waiting` : 'Offline']
    : s.flushing && n ? ['busy', 'sync', 'Syncing…']
    : n ? ['busy', 'upload', `${n} waiting`]
    : ['ok', 'cloud_done', 'Synced'];
  $$('[data-sync]').forEach((b) => { b.className = `${b.classList.contains('side-sync') ? 'side-sync' : 'sync-pill'} s-${cls}`; b.innerHTML = `${icon(ic)}<span>${text}</span>`; b.setAttribute('aria-label', `Sync status: ${text}. Open sync details`); });
  const unread = notifications(me).filter((e) => e.at > Number(safeGet(`lcc-seen:${me.id}`) || 0)).length;
  $$('[data-badge]').forEach((b) => { b.hidden = !unread; b.textContent = unread > 9 ? '9+' : unread; });
}
store.onChange(() => { paintSync(); if (current?.live && !sheetOpen()) rerender(); });
const sheetOpen = () => !!document.querySelector('dialog[open]');

// ── router ──────────────────────────────────────────────
const go = (h) => { location.hash = h; };
const LEGACY = [ // routes from the first version of the app → new ones
  [/^\/$/, '/home'], [/^\/job\/([^/]+)$/, '/jobs/$1'], [/^\/job\/([^/]+)\/(materials|photos\/before|photos\/after)$/, '/jobs/$1/$2'],
  [/^\/job\/([^/]+)\/(results|report)$/, '/reports/$1'], [/^\/job\/([^/]+)\/problem$/, '/jobs/$1/problems/new'],
  [/^\/job\/([^/]+)\/(summary|assign)$/, '/jobs/$1/edit'], [/^\/pick\/.*$/, '/jobs'], [/^\/profile$/, '/more'],
];
const CORE = [
  [/^\/home$/, () => home(me)],
  [/^\/more$/, () => more()],
  [/^\/sync$/, () => syncScreen()],
  [/^\/notifications$/, () => notificationsScreen()],
];
const ROUTES = [...CORE, ...LIST_ROUTES, ...JOB_ROUTES, ...ADMIN_ROUTES];

// a small in-app history so "Back" returns where you came from, or to the screen's parent
const stack = JSON.parse(sessionStorage.getItem('lcc-stack') || '[]');
let current = null, currentKey = '';

async function route() {
  if (!me) return;
  let path = location.hash.slice(1).split('?')[0] || '/home';
  for (const [re, to] of LEGACY) if (re.test(path)) { history.replaceState(null, '', `#${path.replace(re, to)}`); path = path.replace(re, to); break; }
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  const h = location.hash || '#/home';
  if (stack.at(-2) === h) stack.pop(); else if (stack.at(-1) !== h) stack.push(h);
  if (stack.length > 30) stack.splice(0, stack.length - 30);
  sessionStorage.setItem('lcc-stack', JSON.stringify(stack));

  let screen = null;
  for (const [re, fn, role] of ROUTES) {
    const m = path.match(re);
    if (m && (!role || role === me.role)) { screen = () => fn(...m.slice(1).map(decodeURIComponent), query, me); break; }
  }
  if (!screen) { history.replaceState(null, '', '#/home'); return route(); }
  currentKey = h;
  await draw(screen, true);
}

let drawFn = null;
async function draw(fn, fresh) {
  drawFn = fn;
  const key = currentKey;
  const view = $('#view');
  let s;
  try { s = await fn(); } catch (e) { s = errorScreen(e); }
  if (key !== currentKey || !s) return; // navigated away while loading
  if (s.redirect) { history.replaceState(null, '', s.redirect); return route(); }
  const scroll = fresh ? 0 : window.scrollY;
  document.body.className = [s.tab ? 'has-nav' : 'focused', s.footer ? 'has-footer' : '', me.role === 'admin' ? 'is-admin' : ''].join(' ');
  // live redraws only touch what changed, so a button never disappears under a finger mid-tap
  const put = (el, html) => { if (fresh || el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; return true; } return false; };
  $('#hdr-title').textContent = s.title ?? '';
  put($('#hdr-back'), s.back ? `<button class="icon-btn back" aria-label="Back">${icon('arrow_back_ios_new')}</button>` : '');
  put($('#hdr-actions'), s.actions || '');
  const footChanged = put($('#footer'), s.footer || '');
  const bodyChanged = put(view, s.body);
  if (!fresh && !footChanged && !bodyChanged) return; // nothing changed: keep the existing DOM and its handlers
  current?.unmount?.();
  current = s;
  if (fresh) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
  $$('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === s.tab || a.dataset.tab === s.side));
  $$('[data-tab]').forEach((a) => a.toggleAttribute('aria-current', a.classList.contains('on')));
  const backBtn = $('#hdr-back .back');
  if (backBtn) backBtn.onclick = async () => {
    if (current?.dirty?.() && !(await confirmSheet({ title: 'Discard changes?', text: "What you've typed here will be lost.", ok: 'Discard', danger: true }))) return;
    if (stack.length > 1) history.back(); else location.replace(s.back);
  };
  s.mount?.(view, $('#footer'));
  hydrate(view);
  window.scrollTo(0, scroll);
  if (fresh) document.title = s.title ? `${s.title} · LCC Reports` : 'LCC Property Reports';
  paintSync();
}
const rerender = () => { if (drawFn) draw(drawFn, false); };
window.addEventListener('lcc:redraw', rerender);

function errorScreen(e) {
  return {
    title: 'Something went wrong', back: '#/home',
    body: `<div class="state-card">${icon(e.offline ? 'cloud_off' : 'error')}<h2>${e.offline ? 'No connection' : "Couldn't open this"}</h2>
      <p>${esc(e.offline ? 'This needs the internet and it isn’t on this device yet. You can keep working on jobs you’ve already opened.' : e.message)}</p>
      <button class="btn btn-primary" data-retry>Try again</button></div>`,
    mount: (v) => on(v, '[data-retry]', 'click', rerender),
  };
}

// ── More ────────────────────────────────────────────────
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });

function more() {
  const admin = me.role === 'admin';
  const row = (href, ic, label, extra = '') => `<a class="list-row" href="${href}">${icon(ic)}<span>${label}</span>${extra}${icon('chevron_right', 'chev')}</a>`;
  const btnRow = (id, ic, label, cls = '') => `<button class="list-row ${cls}" id="${id}">${icon(ic)}<span>${label}</span></button>`;
  return {
    title: 'More', tab: 'more',
    body: `
      <section class="profile-card"><span class="avatar lg">${esc((me.name[0] || '?').toUpperCase())}</span>
        <div><h2>${esc(me.name)}</h2><p>${esc(me.email)}</p><span class="role-tag">${admin ? 'Admin' : 'Employee'}</span></div></section>
      ${admin ? `<h3 class="section-title">Admin</h3><div class="list-card">
        ${row('#/home', 'space_dashboard', 'Admin dashboard')}${row('#/jobs', 'work_outline', 'Job management')}
        ${row('#/new', 'add_home_work', 'New job')}${row('#/team', 'groups', 'Team')}</div>` : ''}
      <h3 class="section-title">App</h3>
      <div class="list-card">
        ${row('#/notifications', 'notifications', 'Notifications', '<b class="badge" data-badge hidden></b>')}
        <button class="list-row" id="push">${icon('notifications_active')}<span>Push notifications</span><span class="row-meta" id="push-state">…</span></button>
        ${row('#/sync', 'sync', 'Sync &amp; offline', `<span class="row-meta">${store.pendingCount() ? `${store.pendingCount()} waiting` : ''}</span>`)}
        ${btnRow('pw', 'lock', 'Change password')}
        ${standalone() ? '' : btnRow('install', 'install_mobile', 'Add to Home Screen')}
        ${btnRow('help', 'help_outline', 'Help')}
        ${btnRow('about', 'info', 'About')}
      </div>
      <div class="list-card">${btnRow('out', 'logout', 'Sign out', 'danger')}</div>`,
    mount(v) {
      on(v, '#pw', 'click', changePassword);
      const PUSH_TEXT = { on: 'On', off: 'Off', denied: 'Blocked', install: 'Install app first', unsupported: 'Not available' };
      const paintPush = async () => { const st = await pushState(); const el = $('#push-state', v); if (el) { el.textContent = PUSH_TEXT[st]; el.dataset.state = st; } };
      paintPush();
      on(v, '#push', 'click', async () => {
        const st = $('#push-state', v)?.dataset.state;
        if (st === 'install') return installHelp();
        if (st === 'denied') return sheet(`<h2>Notifications are blocked</h2><p class="muted">Turn them on in your phone's Settings → Notifications → LCC Reports, then come back here.</p><div class="sheet-actions"><button class="btn btn-primary" data-close>OK</button></div>`);
        if (st === 'unsupported') return toast('This browser can’t show notifications', 'bad');
        try {
          if (st === 'on') { await disablePush(); toast('Notifications off'); } else { await enablePush(); toast('Notifications on'); }
        } catch (e) { toast(e.offline ? 'You need a connection to change this' : e.message, 'bad'); }
        paintPush();
      });
      on(v, '#install', 'click', installHelp);
      on(v, '#out', 'click', logout);
      on(v, '#help', 'click', () => sheet(`<h2>Help</h2>
        <ol class="help-list"><li><b>Open your job</b> from Home or Jobs and tap <b>Start job</b>.</li>
        <li>Take the <b>8 before photos</b> — one per room, the app walks you through them.</li>
        <li>Record <b>materials</b> and <b>report problems</b> as you work.</li>
        <li>Take the <b>8 after photos</b> from the same spots.</li><li><b>Review</b> and <b>submit</b>. The admin gets your report.</li></ol>
        <p class="muted">No signal? Keep going — everything is saved on your phone and sends itself when you're back online. Check <b>Sync &amp; offline</b> to see what's waiting.</p>
        <div class="sheet-actions"><button class="btn btn-primary" data-close>Got it</button></div>`));
      on(v, '#about', 'click', () => sheet(`<div class="center">${logo(80)}</div><h2 class="center">LCC Property Reports</h2>
        <p class="muted center">Jobs, before &amp; after photos and property condition reports for LCC Bathrooms &amp; Services Ltd.</p>
        <p class="muted center small">Version ${esc(document.querySelector('script[type=module]')?.src.split('v=')[1] || '')}</p>
        <div class="sheet-actions"><button class="btn btn-secondary" data-close>Close</button></div>`));
    },
  };
}

export function installHelp() {
  if (installEvent) { installEvent.prompt(); installEvent = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  sheet(`<h2>Add to Home Screen</h2>
    <p class="muted">Install LCC Reports so it opens full-screen like an app and works offline.</p>
    ${ios ? `<ol class="help-list"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button ${icon('ios_share')}.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>`
      : `<ol class="help-list"><li>Open the browser menu ${icon('more_vert')}.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li></ol>`}
    <div class="sheet-actions"><button class="btn btn-primary" data-close>OK</button></div>`);
}

function changePassword() {
  sheet(`<form novalidate><h2>Change password</h2>
    <label class="field"><span>Current password</span><input id="cur" type="password" autocomplete="current-password" required></label>
    <label class="field"><span>New password</span><input id="nw" type="password" autocomplete="new-password" minlength="8" required><small>At least 8 characters</small></label>
    <p class="form-error" id="err" role="alert" hidden></p>
    <div class="sheet-actions"><button class="btn btn-primary">Save password</button><button type="button" class="btn btn-secondary" data-close>Cancel</button></div></form>`, {
    wire: (d) => $('form', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#err', d);
      try { await store.api('/api/password', { method: 'POST', body: { current: $('#cur', d).value, next: $('#nw', d).value } }); d.close(); toast('Password changed'); }
      catch (ex) { err.hidden = false; err.textContent = ex.message; }
    }),
  });
}

// ── Sync & offline ──────────────────────────────────────
function syncScreen() {
  const s = store.sync, list = store.pending();
  const photos = list.filter((o) => o.kind === 'photo' || (o.kind === 'problem' && o.blobKey)).length;
  const failed = list.filter((o) => o.state === 'failed');
  return {
    title: 'Sync status', back: '#/more', live: true, side: 'more',
    body: `
      <div class="stat-list card">
        <div><span>Connection</span><b class="${s.reachable ? 'ok-text' : 'warn-text'}">${s.reachable ? `${icon('wifi')} Online` : `${icon('cloud_off')} ${navigator.onLine ? 'Server unreachable' : 'Offline'}`}</b></div>
        <div><span>Last synced</span><b>${s.lastSynced ? `${fmtTime(s.lastSynced)} · ${ago(s.lastSynced)}` : 'Not yet'}</b></div>
        <div><span>Photos waiting</span><b>${photos}</b></div>
        <div><span>Other changes waiting</span><b>${list.length - photos}</b></div>
      </div>
      ${s.error ? `<p class="notice warn">${icon('warning')}${esc(s.error)}</p>` : ''}
      ${failed.length ? `<h3 class="section-title">Couldn't be sent</h3>${failed.map((o) => `
        <div class="card failed-op"><div><b>${store.OP_LABEL[o.kind]}</b> · ${esc(o.jobId)}<p class="muted">${esc(o.error)}</p></div>
          <div class="btn-row"><button class="btn btn-secondary btn-sm" data-retry="${esc(o.id)}">Retry</button><button class="btn btn-text btn-sm danger" data-discard="${esc(o.id)}">Discard</button></div></div>`).join('')}` : ''}
      ${list.length ? `<h3 class="section-title">Waiting to send</h3><div class="list-card">${list.filter((o) => o.state !== 'failed').map((o) => `
        <div class="list-row static">${icon(o.kind === 'photo' ? 'photo_camera' : 'edit')}<span>${store.OP_LABEL[o.kind]} · ${esc(o.jobId)}</span><span class="row-meta">${store.sync.sendingId === o.id ? 'Sending…' : 'Queued'}</span></div>`).join('')}</div>`
        : `<div class="state-card small">${icon('cloud_done')}<h2>Everything is synced</h2><p>Your work is safely on the server.</p></div>`}
      <p class="muted small">Work you do with no signal is saved on this phone and sent automatically when the connection comes back.</p>`,
    footer: `<button class="btn btn-primary btn-lg" id="now">${icon('sync')} Sync now</button>`,
    mount(v, f) {
      on(f, '#now', 'click', async (e, b) => { b.disabled = true; await store.syncNow(); toast(store.sync.reachable ? (store.pendingCount() ? 'Still sending…' : 'Synced') : 'Still offline', store.sync.reachable ? '' : 'bad'); });
      on(v, '[data-retry]', 'click', (e, b) => store.retry(b.dataset.retry));
      on(v, '[data-discard]', 'click', async (e, b) => { if (await confirmSheet({ title: 'Discard this change?', text: "It hasn't reached the server and will be lost.", ok: 'Discard', danger: true })) store.discard(b.dataset.discard); });
    },
  };
}

// ── Notifications ───────────────────────────────────────
const NOTE = { assigned: ['assignment_ind', 'New job', 'Assigned to you', 'Open job'], submitted: ['send', 'Report submitted', 'Waiting for review', 'Open report'],
  reviewed: ['verified', 'Report reviewed', 'Your report has been reviewed', 'Open report'], problem: ['report_problem', 'Problem reported', '', 'Open job'] };
function notificationsScreen() {
  const seen = Number(safeGet(`lcc-seen:${me.id}`) || 0);
  const events = notifications(me);
  safeSet(`lcc-seen:${me.id}`, String(Date.now()));
  return {
    title: 'Notifications', back: '#/more', side: 'notifications', live: true,
    body: events.length ? events.map((e) => {
      const [ic, title, text, cta] = NOTE[e.type];
      return `<a class="card note ${e.at > seen ? 'unread' : ''}" href="${e.href}">
        <span class="note-ic t-${e.type}">${icon(ic)}</span>
        <div class="grow"><div class="note-top"><b>${title}</b><time>${ago(e.at)}</time></div>
          <div class="note-addr">${esc(e.address)}</div><p class="muted">${esc(e.text || text)}</p><span class="link">${cta} ${icon('arrow_forward')}</span></div></a>`;
    }).join('') : `<div class="state-card">${icon('notifications_none')}<h2>No notifications</h2><p>New jobs and report updates will appear here.</p></div>`,
  };
}

// ── start ───────────────────────────────────────────────
window.addEventListener('hashchange', route);
// a job created offline got its real Job ID: move the address bar (and back stack) over to it
window.addEventListener('lcc:job-id', ({ detail: { tempId, realId } }) => {
  for (let k = 0; k < stack.length; k++) stack[k] = stack[k].replace(tempId, realId);
  sessionStorage.setItem('lcc-stack', JSON.stringify(stack));
  if (location.hash.includes(tempId)) { currentKey = location.hash.replace(tempId, realId); history.replaceState(null, '', currentKey); }
  toast(`Job ${realId} created`);
  rerender();
});
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.go) location.href = e.data.go; }); // tapped a notification
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
