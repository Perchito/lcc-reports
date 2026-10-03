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
  return `<div class="card tip">${icon('install_mobile')}<div class="grow"><b>Install the app</b><p class="muted">Add LCC Reports to your Home Screen to use it full-screen and offline.</p>
    <button class="btn btn-text btn-sm" id="howto">Show me how</button></div><button class="icon-btn" id="tipx" aria-label="Dismiss">${icon('close')}</button></div>`;
}
// one-time card: offer push notifications when they're possible and still off
const pushCard = '<div id="pushcard"></div>';
async function offerPush(v) {
  if (safeGet('lcc-push-tip')) return;
  const st = await pushState().catch(() => 'unsupported');
  const el = v.querySelector('#pushcard');
  if (st !== 'off' || !el) return;
  el.innerHTML = `<div class="card tip">${icon('notifications_active')}<div class="grow"><b>Get notified</b><p class="muted">Know straight away when a job is assigned or a report is reviewed.</p>
    <button class="btn btn-secondary btn-sm" id="pushon">Turn on notifications</button></div><button class="icon-btn" id="pushx" aria-label="Dismiss">${icon('close')}</button></div>`;
  on(el, '#pushx', 'click', () => { safeSet('lcc-push-tip', '1'); el.innerHTML = ''; });
  on(el, '#pushon', 'click', async () => {
    try { await enablePush(); toast('Notifications on'); safeSet('lcc-push-tip', '1'); el.innerHTML = ''; }
    catch (e) { toast(e.offline ? 'You need a connection to turn this on' : e.message, 'bad'); }
  });
}
function wireTip(v) {
  offerPush(v);
  on(v, '#tipx', 'click', (e, b) => { safeSet('lcc-install-tip', '1'); b.closest('.tip').remove(); });
  on(v, '#howto', 'click', () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    sheet(`<h2>Add to Home Screen</h2>${ios ? `<ol class="help-list"><li>Open this page in <b>Safari</b>.</li><li>Tap <b>Share</b> ${icon('ios_share')}.</li><li>Choose <b>Add to Home Screen</b>.</li></ol>`
      : `<ol class="help-list"><li>Open the browser menu ${icon('more_vert')}.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li></ol>`}
      <div class="sheet-actions"><button class="btn btn-primary" data-close>OK</button></div>`);
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
      <span class="label">${started(current) ? 'Continue job' : 'Next job'}</span>
      <div class="job-card-top"><div class="grow"><h3>${esc(line1(current))}</h3><p>${esc(line2(current))}</p></div>${chip(current)}</div>
      <span class="mono">${esc(jobNo(current))}</span>
      <dl class="mini-stats"><div><dt>Before photos</dt><dd>${p.before}/8</dd></div><div><dt>Materials</dt><dd>${materialCount(current)}</dd></div>
        <div><dt>Problems</dt><dd>${current.problems?.length || 0}</dd></div><div><dt>After photos</dt><dd>${p.after}/8</dd></div></dl>
      ${progressBar(p.pct, 'Job progress')}
      <div class="continue-foot"><span>${p.pct}% complete</span><span class="cta">${started(current) ? 'Continue' : 'Open'}: ${esc(ns.label)} ${icon('arrow_forward')}</span></div></a>`;
  }
  const draft = withLocal ? `<div class="notice">${icon('save')}<div><b>Unfinished work saved on this device</b><br>${esc(line1(withLocal))} — ${store.pending(withLocal.id).length} change(s) ${store.sync.reachable ? 'syncing now' : 'will sync when you’re online'}.</div></div>` : '';
  const others = open.filter((j) => j !== current);

  return {
    title: '', tab: 'home', live: true,
    body: `${hero(me, 'LCC Property Reports')}
      ${draft}
      ${!loaded ? skeleton(1, 230) : current ? cont : `<div class="card">${empty('task_alt', 'No open jobs', "You're all caught up. New jobs will appear here.")}</div>`}
      <h3 class="section-title">Your work</h3>
      <div class="tiles-4">${tile('#/jobs?f=assigned', count('Assigned') + count('Ready to Start') + count('Draft'), 'To start')}${tile('#/jobs?f=progress', count('In Progress') + count('Awaiting After Photos'), 'In progress', 'amber')}
        ${tile('#/jobs?f=review', count('Awaiting Review'), 'Awaiting review', 'purple')}${tile('#/jobs?f=done', count('Completed') + count('Reviewed'), 'Completed', 'green')}</div>
      <h3 class="section-title">Quick actions</h3>
      <div class="quick">
        <a href="#/jobs">${icon('work_outline')}<span>View jobs</span></a>
        <a href="#/reports">${icon('description')}<span>Reports</span></a>
        <a href="#/report-problem">${icon('report_problem')}<span>Report problem</span></a>
        <a href="#/notifications">${icon('notifications')}<span>Notifications</span>${unread ? `<b class="badge">${unread}</b>` : ''}</a>
      </div>
      ${pushCard}${installTip()}
      ${others.length ? `<h3 class="section-title">Up next</h3><div class="card-list">${others.slice(0, 3).map((j) => jobCard(j, me, { compact: true })).join('')}</div>
        ${others.length > 3 ? '<a class="btn btn-text" href="#/jobs">See all jobs</a>' : ''}` : ''}`,
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
  const missingAfter = open.filter((j) => photoCount(j, 'before') === 8 && photoCount(j, 'after') < 8);
  const problems = open.reduce((n, j) => n + (j.problems?.length || 0), 0);
  const unassigned = open.filter((j) => !j.assignedTo);
  const actions = [
    awaiting.length && ['fact_check', `${awaiting.length} report${awaiting.length === 1 ? '' : 's'} awaiting review`, '#/jobs?f=review', 'purple'],
    unassigned.length && ['person_add', `${unassigned.length} job${unassigned.length === 1 ? '' : 's'} not assigned`, '#/jobs?f=unassigned', 'blue'],
    missingAfter.length && ['add_a_photo', `${missingAfter.length} job${missingAfter.length === 1 ? '' : 's'} missing after photos`, '#/jobs?f=progress', 'orange'],
    problems && ['report_problem', `${problems} problem${problems === 1 ? '' : 's'} reported on open jobs`, '#/jobs?f=problems', 'red'],
  ].filter(Boolean);
  return {
    title: 'Dashboard', tab: 'home', live: true,
    actions: `<a class="icon-btn" href="#/new" aria-label="New job">${icon('add')}</a>`,
    body: `${hero(me, 'Admin dashboard')}
      <h3 class="section-title">Overview</h3>
      ${!store.sync.loaded ? skeleton(1, 100) : `<div class="tiles-4">${tile('#/jobs?f=all', open.length, 'Active jobs')}${tile('#/jobs?f=progress', inProgress.length, 'In progress', 'amber')}
        ${tile('#/jobs?f=review', awaiting.length, 'Awaiting review', 'purple')}${tile('#/jobs?f=done', by('Completed').length + by('Reviewed').length, 'Completed', 'green')}</div>`}
      <h3 class="section-title">Action required</h3>
      ${actions.length ? `<div class="list-card">${actions.map(([ic, text, href, tone]) => `<a class="list-row" href="${href}"><span class="row-ic t-${tone}">${icon(ic)}</span><span>${text}</span>${icon('chevron_right', 'chev')}</a>`).join('')}</div>
        ${awaiting.length ? `<a class="btn btn-primary" href="${awaiting.length === 1 ? `#/reports/${esc(awaiting[0].id)}` : '#/jobs?f=review'}">${icon('fact_check')} Review now</a>` : ''}`
        : `<div class="card">${empty('task_alt', 'Nothing needs you', 'No reports waiting, no unassigned jobs, no problems.')}</div>`}
      <div class="row-between"><h3 class="section-title">Recent jobs</h3><a class="btn btn-text btn-sm" href="#/jobs">All jobs ${icon('arrow_forward')}</a></div>
      ${jobs.length ? `<div class="card-list grid-2">${jobs.slice(0, 4).map((j) => jobCard(j, me)).join('')}</div>`
        : `<div class="card">${empty('add_home_work', 'No jobs yet', 'Create the first job to get started.', '<a class="btn btn-primary" href="#/new">New job</a>')}</div>`}
      ${pushCard}${installTip()}`,
    mount: wireTip,
  };
}
