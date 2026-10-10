// Home: the employee's field dashboard, or the admin's overview.
import { esc, icon, on, greeting, line1, line2, jobNo, progressBar, skeleton, empty, chip, sheet } from './ui.js?v=__V__';
import * as store from './store.js?v=__V__';
import { progress, nextStep, displayStatus, isOpen, photoCount, materialCount } from './jobs.mjs?v=__V__';
import { jobCard, notifications } from './lists.js?v=__V__';
import { pushState, enablePush } from './push.js?v=__V__';
import { toast } from './ui.js?v=__V__';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const mobile = () => matchMedia('(max-width: 1023px)').matches;

function hero(me, sub) {
  return `<section class="hero"><p class="hero-hi">${greeting()},</p><h2>${esc(me.name.split(' ')[0])}</h2><p class="hero-sub">${sub}</p></section>`;
}
const tile = (href, n, label, tone = '') => `<a class="tile-stat ${tone}" href="${href}"><b>${n}</b><span>${label}</span></a>`;

function installTip() {
  if (standalone() || !mobile() || safeGet('lcc-install-tip')) return '';
  return `<div class="card tip">${icon('install_mobile')}<div class="grow"><b>Instala la app</b><p class="muted">Añade LCC Informes a tu pantalla de inicio para usarla a pantalla completa y sin conexión.</p>
    <button class="btn btn-text btn-sm" id="howto">Ver cómo</button></div><button class="icon-btn" id="tipx" aria-label="Cerrar">${icon('close')}</button></div>`;
}
// one-time card: offer push notifications when they're possible and still off
const pushCard = '<div id="pushcard"></div>';
async function offerPush(v) {
  if (safeGet('lcc-push-tip')) return;
  const st = await pushState().catch(() => 'unsupported');
  const el = v.querySelector('#pushcard');
  if (st !== 'off' || !el) return;
  el.innerHTML = `<div class="card tip">${icon('notifications_active')}<div class="grow"><b>Recibe avisos</b><p class="muted">Entérate al momento cuando te asignen un trabajo o revisen un informe.</p>
    <button class="btn btn-secondary btn-sm" id="pushon">Activar notificaciones</button></div><button class="icon-btn" id="pushx" aria-label="Cerrar">${icon('close')}</button></div>`;
  on(el, '#pushx', 'click', () => { safeSet('lcc-push-tip', '1'); el.innerHTML = ''; });
  on(el, '#pushon', 'click', async () => {
    try { await enablePush(); toast('Notificaciones activadas'); safeSet('lcc-push-tip', '1'); el.innerHTML = ''; }
    catch (e) { toast(e.offline ? 'Necesitas conexión para activarlas' : e.message, 'bad'); }
  });
}
function wireTip(v) {
  offerPush(v);
  on(v, '#tipx', 'click', (e, b) => { safeSet('lcc-install-tip', '1'); b.closest('.tip').remove(); });
  on(v, '#howto', 'click', () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    sheet(`<h2>Añadir a pantalla de inicio</h2>${ios ? `<ol class="help-list"><li>Abre esta página en <b>Safari</b>.</li><li>Pulsa <b>Compartir</b> ${icon('ios_share')}.</li><li>Elige <b>Añadir a pantalla de inicio</b>.</li></ol>`
      : `<ol class="help-list"><li>Abre el menú del navegador ${icon('more_vert')}.</li><li>Elige <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</li></ol>`}
      <div class="sheet-actions"><button class="btn btn-primary" data-close>Entendido</button></div>`);
  });
}

export function home(me) {
  return me.role === 'admin' ? dashboard(me) : employeeHome(me);
}

// ── employee ────────────────────────────────────────────
function employeeHome(me) {
  const loaded = store.sync.loaded;
  const jobs = store.jobs();
  const open = jobs.filter(isOpen);
  const started = (j) => j.status === 'Work In Progress' || photoCount(j, 'before') > 0;
  // the job to continue: one with work saved on this phone, else the furthest-along started job, else the next assigned one
  const withLocal = open.find((j) => store.pending(j.id).length);
  const current = withLocal || open.filter(started).sort((a, b) => progress(b).pct - progress(a).pct)[0] || open[0];
  const count = (s) => jobs.filter((j) => displayStatus(j) === s).length;
  const unread = notifications(me).filter((e) => e.at > Number(safeGet(`lcc-seen:${me.id}`) || 0)).length;

  let cont = '';
  if (current) {
    const p = progress(current), ns = nextStep(current);
    cont = `<a class="card continue" href="#/jobs/${esc(current.id)}">
      <span class="label">${started(current) ? 'Continuar trabajo' : 'Siguiente trabajo'}</span>
      <div class="job-card-top"><div class="grow"><h3>${esc(line1(current))}</h3><p>${esc(line2(current))}</p></div>${chip(current)}</div>
      <span class="mono">${esc(jobNo(current))}</span>
      <dl class="mini-stats"><div><dt>Fotos antes</dt><dd>${p.before}/${p.photos}</dd></div><div><dt>Materiales</dt><dd>${materialCount(current)}</dd></div>
        <div><dt>Problemas</dt><dd>${current.problems?.length || 0}</dd></div><div><dt>Fotos después</dt><dd>${p.after}/${p.photos}</dd></div></dl>
      ${progressBar(p.pct, 'Progreso del trabajo')}
      <div class="continue-foot"><span>${p.pct}% completado</span><span class="cta">${started(current) ? 'Continuar' : 'Abrir'}: ${esc(ns.label)} ${icon('arrow_forward')}</span></div></a>`;
  }
  const draft = withLocal ? `<div class="notice">${icon('save')}<div><b>Trabajo sin terminar guardado en este móvil</b><br>${esc(line1(withLocal))} — ${store.pending(withLocal.id).length} cambio(s) ${store.sync.reachable ? 'sincronizándose ahora' : 'se sincronizarán cuando tengas conexión'}.</div></div>` : '';
  const others = open.filter((j) => j !== current);

  return {
    title: '', tab: 'home', live: true,
    body: `${hero(me, 'LCC Informes de obra')}
      ${draft}
      ${!loaded ? skeleton(1, 230) : current ? cont : `<div class="card">${empty('task_alt', 'No hay trabajos abiertos', 'Lo tienes todo al día. Los trabajos nuevos aparecerán aquí.')}</div>`}
      <h3 class="section-title">Tu trabajo</h3>
      <div class="tiles-4">${tile('#/jobs?f=assigned', count('Assigned') + count('Ready to Start') + count('Draft'), 'Por empezar')}${tile('#/jobs?f=progress', count('In Progress') + count('Awaiting After Photos'), 'En curso', 'amber')}
        ${tile('#/jobs?f=review', count('Awaiting Review'), 'Pendiente de revisión', 'purple')}${tile('#/jobs?f=done', count('Completed') + count('Reviewed'), 'Completados', 'green')}</div>
      <h3 class="section-title">Accesos rápidos</h3>
      <div class="quick">
        <a href="#/jobs">${icon('work_outline')}<span>Ver trabajos</span></a>
        <a href="#/quotes/new">${icon('request_quote')}<span>Nuevo presupuesto</span></a>
        <a href="#/report-problem">${icon('report_problem')}<span>Comunicar problema</span></a>
        <a href="#/notifications">${icon('notifications')}<span>Avisos</span>${unread ? `<b class="badge">${unread}</b>` : ''}</a>
      </div>
      ${pushCard}${installTip()}
      ${others.length ? `<h3 class="section-title">Próximos</h3><div class="card-list">${others.slice(0, 3).map((j) => jobCard(j, me, { compact: true })).join('')}</div>
        ${others.length > 3 ? '<a class="btn btn-text" href="#/jobs">Ver todos los trabajos</a>' : ''}` : ''}`,
    mount: wireTip,
  };
}

// ── admin dashboard ─────────────────────────────────────
function dashboard(me) {
  const jobs = store.jobs();
  const by = (s) => jobs.filter((j) => displayStatus(j) === s);
  const open = jobs.filter(isOpen);
  const awaiting = by('Awaiting Review');
  const inProgress = [...by('In Progress'), ...by('Awaiting After Photos')];
  const missingAfter = open.filter((j) => { const p = progress(j); return p.photos && p.before === p.photos && p.after < p.photos; });
  const problems = open.reduce((n, j) => n + (j.problems?.length || 0), 0);
  const unassigned = open.filter((j) => !j.assignedTo);
  const actions = [
    awaiting.length && ['fact_check', `${awaiting.length} informe${awaiting.length === 1 ? '' : 's'} pendiente${awaiting.length === 1 ? '' : 's'} de revisión`, '#/jobs?f=review', 'purple'],
    unassigned.length && ['person_add', `${unassigned.length} trabajo${unassigned.length === 1 ? '' : 's'} sin asignar`, '#/jobs?f=unassigned', 'blue'],
    missingAfter.length && ['add_a_photo', `${missingAfter.length} trabajo${missingAfter.length === 1 ? '' : 's'} sin fotos después`, '#/jobs?f=progress', 'orange'],
    problems && ['report_problem', `${problems} problema${problems === 1 ? '' : 's'} en trabajos abiertos`, '#/jobs?f=problems', 'red'],
  ].filter(Boolean);
  return {
    title: 'Panel', tab: 'home', live: true,
    actions: `<a class="icon-btn" href="#/new" aria-label="Nuevo trabajo">${icon('add')}</a>`,
    body: `${hero(me, 'Panel de administración')}
      <h3 class="section-title">Resumen</h3>
      ${!store.sync.loaded ? skeleton(1, 100) : `<div class="tiles-4">${tile('#/jobs?f=all', open.length, 'Trabajos activos')}${tile('#/jobs?f=progress', inProgress.length, 'En curso', 'amber')}
        ${tile('#/jobs?f=review', awaiting.length, 'Pendiente de revisión', 'purple')}${tile('#/jobs?f=done', by('Completed').length + by('Reviewed').length, 'Completados', 'green')}</div>`}
      <h3 class="section-title">Requiere atención</h3>
      ${actions.length ? `<div class="list-card">${actions.map(([ic, text, href, tone]) => `<a class="list-row" href="${href}"><span class="row-ic t-${tone}">${icon(ic)}</span><span>${text}</span>${icon('chevron_right', 'chev')}</a>`).join('')}</div>
        ${awaiting.length ? `<a class="btn btn-primary" href="${awaiting.length === 1 ? `#/reports/${esc(awaiting[0].id)}` : '#/jobs?f=review'}">${icon('fact_check')} Revisar ahora</a>` : ''}`
        : `<div class="card">${empty('task_alt', 'Nada pendiente', 'Sin informes por revisar, trabajos sin asignar ni problemas.')}</div>`}
      <div class="row-between"><h3 class="section-title">Trabajos recientes</h3><a class="btn btn-text btn-sm" href="#/jobs">Todos ${icon('arrow_forward')}</a></div>
      ${jobs.length ? `<div class="card-list grid-2">${jobs.slice(0, 4).map((j) => jobCard(j, me)).join('')}</div>`
        : `<div class="card">${empty('add_home_work', 'Aún no hay trabajos', 'Crea el primer trabajo para empezar.', '<a class="btn btn-primary" href="#/new">Nuevo trabajo</a>')}</div>`}
      ${pushCard}${installTip()}`,
    mount: wireTip,
  };
}
