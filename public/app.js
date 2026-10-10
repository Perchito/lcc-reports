// App shell + router. Every screen returns a description
//   { title, back, tab, actions, body, footer, live, mount(view), dirty() }
// and the shell draws it the same way: safe-area header, content, optional fixed
// bottom action, bottom tabs on phones (Home · Jobs · Reports · Quotes · More) or a sidebar on desktop.
import { esc, icon, $, $$, on, toast, sheet, confirmSheet, hydrate, setLocalResolver, logo, ago, fmtTime } from './ui.js?v=__V__';
import * as store from './store.js?v=__V__';
import { notifications } from './lists.js?v=__V__';
import { ROUTES as JOB_ROUTES } from './job.js?v=__V__';
import { ROUTES as LIST_ROUTES } from './lists.js?v=__V__';
import { ROUTES as ADMIN_ROUTES } from './admin.js?v=__V__';
import { ROUTES as QUOTE_ROUTES } from './quotes.js?v=__V__';
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
window.addEventListener('lcc:logged-out', () => { if (me) { me = null; safeSet('lcc-me', null); loginScreen('Tu sesión ha terminado — vuelve a iniciar sesión.'); } });

async function logout() {
  const waiting = store.pendingCount();
  const ok = await confirmSheet(waiting
    ? { title: '¿Cerrar sesión?', text: `${waiting === 1 ? 'Hay 1 cambio pendiente' : `Hay ${waiting} cambios pendientes`} de sincronizar que se perderán en este móvil. Sincroniza antes si puedes.`, ok: 'Cerrar sesión igualmente', danger: true }
    : { title: '¿Cerrar sesión?', ok: 'Cerrar sesión' });
  if (!ok) return;
  await disablePush(); // this phone stops getting this person's notifications
  await store.api('/api/logout', { method: 'POST' }).catch(() => {});
  await store.reset();
  globalThis.caches?.delete('lcc-photos').catch(() => {});
  me = null; safeSet('lcc-me', null);
  history.replaceState(null, '', '#/home');
  loginScreen();
}

// ── login ───────────────────────────────────────────────
function loginScreen(message = '') {
  document.body.className = 'is-login';
  $app.innerHTML = `
    <main class="login">
      <div class="login-brand">${logo(112)}<h1>LCC<span>Informes de obra</span></h1></div>
      <form class="login-form" novalidate>
        ${message ? `<p class="notice">${icon('info')}${esc(message)}</p>` : ''}
        <label class="field"><span>Correo electrónico</span><input id="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(safeGet('lcc-email') || '')}"></label>
        <label class="field"><span>Contraseña</span><span class="input-wrap"><input id="pw" type="password" autocomplete="current-password" required>
          <button type="button" class="icon-btn" id="eye" aria-label="Mostrar contraseña">${icon('visibility')}</button></span></label>
        <p class="form-error" id="err" role="alert" hidden></p>
        <button class="btn btn-primary btn-lg" id="go">Iniciar sesión</button>
        <button type="button" class="btn btn-text" id="forgot">¿Olvidaste tu contraseña?</button>
      </form>
      <p class="login-foot">LCC Bathrooms &amp; Services Ltd</p>
    </main>`;
  const pw = $('#pw'), err = $('#err');
  if (!$('#email').value) $('#email').focus();
  on($app, '#eye', 'click', (e, b) => { pw.type = pw.type === 'password' ? 'text' : 'password'; b.innerHTML = icon(pw.type === 'password' ? 'visibility' : 'visibility_off'); b.setAttribute('aria-label', pw.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña'); });
  on($app, '#forgot', 'click', () => sheet(`<h2>¿Olvidaste tu contraseña?</h2><p class="muted">Pide al administrador de LCC que te la restablezca. Puede hacerlo desde la página Equipo y darte una nueva al momento.</p><div class="sheet-actions"><button class="btn btn-primary" data-close>Entendido</button></div>`));
  on($app, 'form', 'submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    if (!email || !pw.value) { err.hidden = false; err.textContent = 'Escribe tu correo y tu contraseña.'; return; }
    const btn = $('#go'); btn.disabled = true; btn.textContent = 'Entrando…'; err.hidden = true;
    try {
      await store.api('/api/login', { method: 'POST', body: { email, password: pw.value } });
      safeSet('lcc-email', email);
      if (!location.hash || location.hash === '#/') history.replaceState(null, '', '#/home');
      await boot();
    } catch (ex) {
      err.hidden = false; err.textContent = ex.offline ? 'Sin conexión. Necesitas internet para iniciar sesión.' : ex.message;
      pw.value = ''; pw.focus(); btn.disabled = false; btn.textContent = 'Iniciar sesión';
    }
  });
}

// ── shell ───────────────────────────────────────────────
const TABS = [['home', '#/home', 'home', 'Inicio'], ['jobs', '#/jobs', 'work_outline', 'Trabajos'], ['reports', '#/reports', 'description', 'Informes'], ['quotes', '#/quotes', 'request_quote', 'Presupuestos'], ['more', '#/more', 'menu', 'Más']];
function shell() {
  const admin = me.role === 'admin';
  $app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Main">
        <div class="side-brand">${logo(40)}<div><b>LCC Informes</b><small>${admin ? 'Administración' : 'App de campo'}</small></div></div>
        <nav class="side-nav">
          ${TABS.slice(0, 4).map(([k, h, ic, l]) => `<a href="${h}" data-tab="${k}">${icon(ic)}<span>${k === 'home' && admin ? 'Panel' : l}</span></a>`).join('')}
          ${admin ? `<a href="#/new" data-tab="new">${icon('add_home_work')}<span>Nuevo trabajo</span></a><a href="#/team" data-tab="team">${icon('groups')}<span>Equipo</span></a>` : ''}
          <a href="#/notifications" data-tab="notifications">${icon('notifications')}<span>Notificaciones</span><b class="badge" data-badge hidden></b></a>
          <a href="#/more" data-tab="more">${icon('settings')}<span>Ajustes</span></a>
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
    if (current?.dirty?.() && !(await confirmSheet({ title: '¿Descartar cambios?', text: 'Se perderá lo que has escrito aquí.', ok: 'Descartar', danger: true }))) e.preventDefault();
  }));
  paintSync();
}

function paintSync() {
  if (!me) return;
  const s = store.sync, n = store.pendingCount(), failed = store.pending().filter((o) => o.state === 'failed').length;
  const [cls, ic, text] = failed ? ['bad', 'error', `${failed} sin enviar`]
    : !s.reachable ? ['off', 'cloud_off', n ? `Sin conexión · ${n} pendientes` : 'Sin conexión']
    : s.flushing && n ? ['busy', 'sync', 'Sincronizando…']
    : n ? ['busy', 'upload', `${n} pendientes`]
    : ['ok', 'cloud_done', 'Sincronizado'];
  $$('[data-sync]').forEach((b) => { b.className = `${b.classList.contains('side-sync') ? 'side-sync' : 'sync-pill'} s-${cls}`; b.innerHTML = `${icon(ic)}<span>${text}</span>`; b.setAttribute('aria-label', `Estado de sincronización: ${text}. Abrir detalles`); });
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
const ROUTES = [...CORE, ...LIST_ROUTES, ...JOB_ROUTES, ...QUOTE_ROUTES, ...ADMIN_ROUTES];

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
  put($('#hdr-back'), s.back ? `<button class="icon-btn back" aria-label="Atrás">${icon('arrow_back_ios_new')}</button>` : '');
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
    if (current?.dirty?.() && !(await confirmSheet({ title: '¿Descartar cambios?', text: 'Se perderá lo que has escrito aquí.', ok: 'Descartar', danger: true }))) return;
    if (stack.length > 1) history.back(); else location.replace(s.back);
  };
  s.mount?.(view, $('#footer'));
  hydrate(view);
  window.scrollTo(0, scroll);
  if (fresh) document.title = s.title ? `${s.title} · LCC Informes` : 'LCC Informes';
  paintSync();
}
const rerender = () => { if (drawFn) draw(drawFn, false); };
window.addEventListener('lcc:redraw', rerender);

function errorScreen(e) {
  return {
    title: 'Algo salió mal', back: '#/home',
    body: `<div class="state-card">${icon(e.offline ? 'cloud_off' : 'error')}<h2>${e.offline ? 'Sin conexión' : 'No se pudo abrir'}</h2>
      <p>${esc(e.offline ? 'Esto necesita internet y aún no está en este móvil. Puedes seguir con los trabajos que ya has abierto.' : e.message)}</p>
      <button class="btn btn-primary" data-retry>Reintentar</button></div>`,
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
    title: 'Más', tab: 'more',
    body: `
      <section class="profile-card"><span class="avatar lg">${esc((me.name[0] || '?').toUpperCase())}</span>
        <div><h2>${esc(me.name)}</h2><p>${esc(me.email)}</p><span class="role-tag">${admin ? 'Administrador' : 'Empleado'}</span></div></section>
      ${admin ? `<h3 class="section-title">Administración</h3><div class="list-card">
        ${row('#/home', 'space_dashboard', 'Panel de administración')}${row('#/jobs', 'work_outline', 'Gestión de trabajos')}
        ${row('#/new', 'add_home_work', 'Nuevo trabajo')}${row('#/team', 'groups', 'Equipo')}</div>` : ''}
      <h3 class="section-title">Aplicación</h3>
      <div class="list-card">
        ${row('#/notifications', 'notifications', 'Notificaciones', '<b class="badge" data-badge hidden></b>')}
        <button class="list-row" id="push">${icon('notifications_active')}<span>Notificaciones push</span><span class="row-meta" id="push-state">…</span></button>
        ${row('#/sync', 'sync', 'Sincronización y sin conexión', `<span class="row-meta">${store.pendingCount() ? `${store.pendingCount()} pendientes` : ''}</span>`)}
        ${btnRow('pw', 'lock', 'Cambiar contraseña')}
        ${standalone() ? '' : btnRow('install', 'install_mobile', 'Añadir a pantalla de inicio')}
        ${btnRow('help', 'help_outline', 'Ayuda')}
        ${btnRow('about', 'info', 'Acerca de')}
      </div>
      <div class="list-card">${btnRow('out', 'logout', 'Cerrar sesión', 'danger')}</div>`,
    mount(v) {
      on(v, '#pw', 'click', changePassword);
      const PUSH_TEXT = { on: 'Activadas', off: 'Desactivadas', denied: 'Bloqueadas', install: 'Instala la app primero', unsupported: 'No disponibles' };
      const paintPush = async () => { const st = await pushState(); const el = $('#push-state', v); if (el) { el.textContent = PUSH_TEXT[st]; el.dataset.state = st; } };
      paintPush();
      on(v, '#push', 'click', async () => {
        const st = $('#push-state', v)?.dataset.state;
        if (st === 'install') return installHelp();
        if (st === 'denied') return sheet(`<h2>Notificaciones bloqueadas</h2><p class="muted">Actívalas en Ajustes del móvil → Notificaciones → LCC Informes y vuelve aquí.</p><div class="sheet-actions"><button class="btn btn-primary" data-close>Entendido</button></div>`);
        if (st === 'unsupported') return toast('Este navegador no puede mostrar notificaciones', 'bad');
        try {
          if (st === 'on') { await disablePush(); toast('Notificaciones desactivadas'); } else { await enablePush(); toast('Notificaciones activadas'); }
        } catch (e) { toast(e.offline ? 'Necesitas conexión para cambiar esto' : e.message, 'bad'); }
        paintPush();
      });
      on(v, '#install', 'click', installHelp);
      on(v, '#out', 'click', logout);
      on(v, '#help', 'click', () => sheet(`<h2>Ayuda</h2>
        <ol class="help-list"><li><b>Abre tu trabajo</b> desde Inicio o Trabajos y pulsa <b>Empezar trabajo</b>.</li>
        <li>Haz las <b>fotos antes</b> — una por zona; la app te guía. ¿Falta una zona? Añádela en la pantalla de fotos.</li>
        <li>Anota los <b>materiales</b> y <b>comunica problemas</b> mientras trabajas.</li>
        <li>Haz las <b>fotos después</b> desde las mismas zonas.</li><li><b>Revisa</b> y <b>envía</b>. El administrador recibe tu informe.</li></ol>
        <p class="muted">¿Sin cobertura? Sigue trabajando — todo se guarda en tu móvil y se envía solo cuando vuelva la conexión. Mira <b>Sincronización y sin conexión</b> para ver lo pendiente.</p>
        <div class="sheet-actions"><button class="btn btn-primary" data-close>Entendido</button></div>`));
      on(v, '#about', 'click', () => sheet(`<div class="center">${logo(80)}</div><h2 class="center">LCC Informes de obra</h2>
        <p class="muted center">Trabajos, fotos de antes y después e informes del estado de la vivienda para LCC Bathrooms &amp; Services Ltd.</p>
        <p class="muted center small">Versión ${esc(document.querySelector('script[type=module]')?.src.split('v=')[1] || '')}</p>
        <div class="sheet-actions"><button class="btn btn-secondary" data-close>Cerrar</button></div>`));
    },
  };
}

export function installHelp() {
  if (installEvent) { installEvent.prompt(); installEvent = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  sheet(`<h2>Añadir a pantalla de inicio</h2>
    <p class="muted">Instala LCC Informes para que se abra a pantalla completa como una app y funcione sin conexión.</p>
    ${ios ? `<ol class="help-list"><li>Abre esta página en <b>Safari</b>.</li><li>Pulsa el botón <b>Compartir</b> ${icon('ios_share')}.</li><li>Elige <b>Añadir a pantalla de inicio</b> y luego <b>Añadir</b>.</li></ol>`
      : `<ol class="help-list"><li>Abre el menú del navegador ${icon('more_vert')}.</li><li>Elige <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</li></ol>`}
    <div class="sheet-actions"><button class="btn btn-primary" data-close>Entendido</button></div>`);
}

function changePassword() {
  sheet(`<form novalidate><h2>Cambiar contraseña</h2>
    <label class="field"><span>Contraseña actual</span><input id="cur" type="password" autocomplete="current-password" required></label>
    <label class="field"><span>Contraseña nueva</span><input id="nw" type="password" autocomplete="new-password" minlength="8" required><small>Al menos 8 caracteres</small></label>
    <p class="form-error" id="err" role="alert" hidden></p>
    <div class="sheet-actions"><button class="btn btn-primary">Guardar contraseña</button><button type="button" class="btn btn-secondary" data-close>Cancelar</button></div></form>`, {
    wire: (d) => $('form', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#err', d);
      try { await store.api('/api/password', { method: 'POST', body: { current: $('#cur', d).value, next: $('#nw', d).value } }); d.close(); toast('Contraseña cambiada'); }
      catch (ex) { err.hidden = false; err.textContent = ex.message; }
    }),
  });
}

// ── Sync & offline ──────────────────────────────────────
function syncScreen() {
  const s = store.sync, list = store.pending();
  const photos = list.filter((o) => o.kind === 'photo' || o.kind === 'photoX' || o.kind === 'condX' || (o.kind === 'problem' && o.blobKey)).length;
  const failed = list.filter((o) => o.state === 'failed');
  return {
    title: 'Sincronización', back: '#/more', live: true, side: 'more',
    body: `
      <div class="stat-list card">
        <div><span>Conexión</span><b class="${s.reachable ? 'ok-text' : 'warn-text'}">${s.reachable ? `${icon('wifi')} Conectado` : `${icon('cloud_off')} ${navigator.onLine ? 'Servidor no disponible' : 'Sin conexión'}`}</b></div>
        <div><span>Última sincronización</span><b>${s.lastSynced ? `${fmtTime(s.lastSynced)} · ${ago(s.lastSynced)}` : 'Todavía no'}</b></div>
        <div><span>Fotos pendientes</span><b>${photos}</b></div>
        <div><span>Otros cambios pendientes</span><b>${list.length - photos}</b></div>
      </div>
      ${s.error ? `<p class="notice warn">${icon('warning')}${esc(s.error)}</p>` : ''}
      ${failed.length ? `<h3 class="section-title">No se pudieron enviar</h3>${failed.map((o) => `
        <div class="card failed-op"><div><b>${store.OP_LABEL[o.kind]}</b> · ${esc(o.jobId)}<p class="muted">${esc(o.error)}</p></div>
          <div class="btn-row"><button class="btn btn-secondary btn-sm" data-retry="${esc(o.id)}">Reintentar</button><button class="btn btn-text btn-sm danger" data-discard="${esc(o.id)}">Descartar</button></div></div>`).join('')}` : ''}
      ${list.length ? `<h3 class="section-title">Pendiente de enviar</h3><div class="list-card">${list.filter((o) => o.state !== 'failed').map((o) => `
        <div class="list-row static">${icon(['photo', 'photoX', 'condX'].includes(o.kind) ? 'photo_camera' : 'edit')}<span>${store.OP_LABEL[o.kind]} · ${esc(o.jobId)}</span><span class="row-meta">${store.sync.sendingId === o.id ? 'Enviando…' : 'En cola'}</span></div>`).join('')}</div>`
        : `<div class="state-card small">${icon('cloud_done')}<h2>Todo sincronizado</h2><p>Tu trabajo está a salvo en el servidor.</p></div>`}
      <p class="muted small">Lo que hagas sin cobertura se guarda en este móvil y se envía solo cuando vuelva la conexión.</p>`,
    footer: `<button class="btn btn-primary btn-lg" id="now">${icon('sync')} Sincronizar ahora</button>`,
    mount(v, f) {
      on(f, '#now', 'click', async (e, b) => { b.disabled = true; await store.syncNow(); toast(store.sync.reachable ? (store.pendingCount() ? 'Aún enviando…' : 'Sincronizado') : 'Sigues sin conexión', store.sync.reachable ? '' : 'bad'); });
      on(v, '[data-retry]', 'click', (e, b) => store.retry(b.dataset.retry));
      on(v, '[data-discard]', 'click', async (e, b) => { if (await confirmSheet({ title: '¿Descartar este cambio?', text: 'No ha llegado al servidor y se perderá.', ok: 'Descartar', danger: true })) store.discard(b.dataset.discard); });
    },
  };
}

// ── Notifications ───────────────────────────────────────
const NOTE = { assigned: ['assignment_ind', 'Nuevo trabajo', 'Asignado a ti', 'Abrir trabajo'], submitted: ['send', 'Informe enviado', 'Pendiente de revisión', 'Abrir informe'],
  reviewed: ['verified', 'Informe revisado', 'Tu informe ha sido revisado', 'Abrir informe'], problem: ['report_problem', 'Problema comunicado', '', 'Abrir trabajo'],
  change: ['gesture', 'Cambio firmado por el cliente', '', 'Ver cambios'] };
function notificationsScreen() {
  const seen = Number(safeGet(`lcc-seen:${me.id}`) || 0);
  const events = notifications(me);
  safeSet(`lcc-seen:${me.id}`, String(Date.now()));
  return {
    title: 'Notificaciones', back: '#/more', side: 'notifications', live: true,
    body: events.length ? events.map((e) => {
      const [ic, title, text, cta] = NOTE[e.type];
      return `<a class="card note ${e.at > seen ? 'unread' : ''}" href="${e.href}">
        <span class="note-ic t-${e.type}">${icon(ic)}</span>
        <div class="grow"><div class="note-top"><b>${title}</b><time>${ago(e.at)}</time></div>
          <div class="note-addr">${esc(e.address)}</div><p class="muted">${esc(e.text || text)}</p><span class="link">${cta} ${icon('arrow_forward')}</span></div></a>`;
    }).join('') : `<div class="state-card">${icon('notifications_none')}<h2>Sin notificaciones</h2><p>Aquí aparecerán los trabajos nuevos y las novedades de los informes.</p></div>`,
  };
}

// ── start ───────────────────────────────────────────────
window.addEventListener('hashchange', route);
// a job created offline got its real Job ID: move the address bar (and back stack) over to it
window.addEventListener('lcc:job-id', ({ detail: { tempId, realId } }) => {
  for (let k = 0; k < stack.length; k++) stack[k] = stack[k].replace(tempId, realId);
  sessionStorage.setItem('lcc-stack', JSON.stringify(stack));
  if (location.hash.includes(tempId)) { currentKey = location.hash.replace(tempId, realId); history.replaceState(null, '', currentKey); }
  toast(`${realId.startsWith("Q-") ? "Presupuesto" : "Trabajo"} ${realId} creado`);
  rerender();
});
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.go) location.href = e.data.go; }); // tapped a notification
navigator.serviceWorker?.register('/sw.js').catch(() => {}); // missing in iPhone Lockdown Mode

// a newer version has been deployed: offer a reload (like FC Staff Hub). Unsent changes stay safe in IndexedDB;
// without it (Lockdown Mode) they only live in memory, so wait until they have gone.
window.addEventListener('lcc:new-version', () => {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = `${icon('system_update')}<span>Hay una versión nueva de la app.</span><button class="btn btn-sm">Actualizar</button>`;
  bar.querySelector('button').onclick = async () => {
    if (store.pendingCount() && !(await store.deviceStorage())) return toast('Espera a que se suban los cambios pendientes y vuelve a tocar Actualizar.');
    location.reload();
  };
  document.body.append(bar);
});
boot();
