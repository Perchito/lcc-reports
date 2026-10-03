// Jobs, Reports and notification events — the list screens and the shared job card.
import { esc, icon, on, chip, tr, empty, skeleton, progressBar, line1, line2, jobNo, fmtDate, $ } from './ui.js?v=__V__';
import * as store from './store.js?v=__V__';
import { displayStatus, progress, photoCount, materialCount, address, isOpen } from './jobs.mjs?v=__V__';
import { pdfActions, wirePdfActions } from './job.js?v=__V__';

const safeGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };

// ── job card (Home, Jobs) ───────────────────────────────
export function jobCard(j, me, { compact = false } = {}) {
  const p = progress(j), waiting = store.pending(j.id).length;
  const stat = (label, value, ok) => `<div class="stat ${ok ? 'is-ok' : ''}"><span>${label}</span><b>${value}</b></div>`;
  return `<a class="card job-card" href="#/jobs/${esc(j.id)}">
    <div class="job-card-top"><div class="grow"><h3>${esc(line1(j))}</h3><p>${esc(line2(j))}</p></div>${chip(j)}</div>
    <div class="job-meta"><span class="mono">${esc(jobNo(j))}</span>${me.role === 'admin' ? `<span>${icon('person')}${esc(j.assignedTo || 'Sin asignar')}</span>` : ''}
      ${waiting ? `<span class="pending-dot">${icon('upload')}${waiting} pendientes</span>` : ''}</div>
    ${compact ? '' : `<div class="stats">${stat('Antes', `${p.before}/${p.photos}`, p.photos && p.before === p.photos)}${stat('Materiales', materialCount(j))}${stat('Problemas', j.problems?.length || 0)}${stat('Después', `${p.after}/${p.photos}`, p.photos && p.after === p.photos)}</div>`}
    <div class="job-card-foot">${progressBar(p.pct, `Progreso de ${line1(j)}`)}<span class="pct">${p.pct}%</span><span class="open">Abrir ${icon('arrow_forward')}</span></div>
  </a>`;
}

// ── filters ─────────────────────────────────────────────
const GROUP = {
  Draft: 'assigned', 'Ready to Start': 'assigned', Assigned: 'assigned', 'In Progress': 'progress', 'Awaiting After Photos': 'progress',
  'Awaiting Review': 'review', Completed: 'done', Reviewed: 'done',
};
const JOB_FILTERS = [['all', 'Todos'], ['assigned', 'Asignados'], ['progress', 'En curso'], ['review', 'Pendientes de revisión'], ['done', 'Completados']];
const ADMIN_FILTERS = [['unassigned', 'Sin asignar'], ['problems', 'Con problemas']];
function jobMatches(j, f) {
  if (f === 'all') return true;
  if (f === 'unassigned') return !j.assignedTo && isOpen(j);
  if (f === 'problems') return (j.problems?.length || 0) > 0 && isOpen(j);
  return GROUP[displayStatus(j)] === f;
}
const searchText = (j) => [address(j), j.id, j.assignedTo, j.personName, j.postcode].join(' ').toLowerCase();

function chips(list, cur, attr = 'data-f') {
  return `<div class="chips" role="tablist">${list.map(([k, l]) => `<button class="chip-btn ${k === cur ? 'on' : ''}" ${attr}="${k}" role="tab" aria-selected="${k === cur}">${l}</button>`).join('')}</div>`;
}

// ── Jobs ────────────────────────────────────────────────
const SORTS = { created: (j) => j.createdAt, id: (j) => j.id, address: (j) => address(j).toLowerCase(), employee: (j) => j.assignedTo || '~', status: (j) => displayStatus(j), progress: (j) => progress(j).pct };
function jobsScreen(query, me) {
  const admin = me.role === 'admin';
  let f = query.get('f') || safeGet('lcc-jobs-f') || 'all', q = safeGet('lcc-jobs-q') || '';
  let [sortKey, dir] = (safeGet('lcc-jobs-sort') || 'created:desc').split(':');
  const filters = admin ? [...JOB_FILTERS, ...ADMIN_FILTERS] : JOB_FILTERS;
  if (!filters.some(([k]) => k === f)) f = 'all';
  let off;

  const list = () => {
    const all = store.jobs();
    if (!store.sync.loaded) return skeleton(4, 150);
    const items = all.filter((j) => jobMatches(j, f) && (!q || searchText(j).includes(q.toLowerCase())));
    const key = SORTS[sortKey] || SORTS.created;
    items.sort((a, b) => (dir === 'asc' ? 1 : -1) * String(key(a)).localeCompare(String(key(b)), undefined, { numeric: true }));
    if (!items.length) return all.length
      ? empty('search_off', 'Ningún trabajo coincide', q ? `Nada coincide con “${q}”.` : 'No hay trabajos en esta vista.', '<button class="btn btn-secondary" data-clear>Ver todos los trabajos</button>')
      : empty('work_off', 'Aún no hay trabajos', admin ? 'Crea el primer trabajo para empezar.' : 'Lo tienes todo al día. Aquí aparecerán los trabajos que te asignen.', admin ? '<a class="btn btn-primary" href="#/new">Nuevo trabajo</a>' : '');
    const th = (k, l) => `<th><button data-sort="${k}" aria-label="Ordenar por ${l}">${l}${sortKey === k ? icon(dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : ''}</button></th>`;
    return `<p class="count">${items.length} trabajo${items.length === 1 ? '' : 's'}</p>
      <div class="card-list">${items.map((j) => jobCard(j, me)).join('')}</div>
      ${admin ? `<div class="table-wrap"><table class="table"><thead><tr>${th('id', 'Nº trabajo')}${th('address', 'Vivienda')}${th('employee', 'Empleado')}${th('status', 'Estado')}${th('progress', 'Progreso')}${th('created', 'Creado')}</tr></thead>
        <tbody>${items.map((j) => `<tr data-href="#/jobs/${esc(j.id)}" tabindex="0"><td class="mono">${esc(jobNo(j))}</td><td><b>${esc(line1(j))}</b><br><small>${esc(line2(j))}</small></td>
          <td>${esc(j.assignedTo || '—')}</td><td>${chip(j)}</td><td><div class="table-progress">${progressBar(progress(j).pct)}<span>${progress(j).pct}%</span></div></td><td>${fmtDate(j.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  };

  return {
    title: 'Trabajos', tab: 'jobs',
    actions: admin ? `<a class="icon-btn" href="#/new" aria-label="Nuevo trabajo">${icon('add')}</a>` : '',
    body: `<div class="search">${icon('search')}<input type="search" id="q" placeholder="Buscar trabajos, direcciones o nº…" value="${esc(q)}" aria-label="Buscar trabajos" enterkeyhint="search"></div>
      ${chips(filters, f)}<div id="list" class="${admin ? 'admin-list' : ''}">${list()}</div>`,
    mount(v) {
      const paint = () => { $('#list', v).innerHTML = list(); wire(); };
      const wire = () => {
        on(v, '[data-clear]', 'click', () => { f = 'all'; q = ''; $('#q', v).value = ''; safeSet('lcc-jobs-f', f); safeSet('lcc-jobs-q', q); v.querySelectorAll('[data-f]').forEach((c) => c.classList.toggle('on', c.dataset.f === f)); paint(); });
        on(v, '[data-sort]', 'click', (e, b) => { if (sortKey === b.dataset.sort) dir = dir === 'asc' ? 'desc' : 'asc'; else { sortKey = b.dataset.sort; dir = 'asc'; } safeSet('lcc-jobs-sort', `${sortKey}:${dir}`); paint(); });
        on(v, 'tr[data-href]', 'click', (e, r) => { location.hash = r.dataset.href; });
        on(v, 'tr[data-href]', 'keydown', (e, r) => { if (e.key === 'Enter') location.hash = r.dataset.href; });
      };
      on(v, '#q', 'input', (e, el) => { q = el.value.trim(); safeSet('lcc-jobs-q', q); paint(); });
      on(v, '[data-f]', 'click', (e, b) => { f = b.dataset.f; safeSet('lcc-jobs-f', f); v.querySelectorAll('[data-f]').forEach((c) => { c.classList.toggle('on', c === b); c.setAttribute('aria-selected', c === b); }); paint(); });
      wire();
      off = store.onChange(paint); // keep the list fresh without stealing focus from the search box
    },
    unmount: () => off?.(),
  };
}

// ── Reports ─────────────────────────────────────────────
const REPORT_FILTERS = [['all', 'Todos'], ['draft', 'Borrador'], ['review', 'Pendientes de revisión'], ['done', 'Revisados']];
const reportState = (j) => (displayStatus(j) === 'Reviewed' ? 'done' : j.submittedAt ? 'review' : 'draft');
const REPORT_LABEL = { draft: ['edit_note', 'Sin enviar'], review: ['hourglass_top', 'Pendiente de revisión'], done: ['verified', 'Revisado'] };
function reportsScreen(query, me) {
  let f = query.get('f') || safeGet('lcc-rep-f') || 'all', q = safeGet('lcc-rep-q') || '', day = safeGet('lcc-rep-day') || '';
  let off;
  const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const list = () => {
    if (!store.sync.loaded) return skeleton(3, 170);
    const all = store.jobs().filter((j) => j.reportGeneratedAt || j.submittedAt)
      .sort((a, b) => String(b.submittedAt || b.reportGeneratedAt).localeCompare(String(a.submittedAt || a.reportGeneratedAt)));
    const items = all.filter((j) => (f === 'all' || reportState(j) === f) && (!q || searchText(j).includes(q.toLowerCase())) && (!day || dayKey(j.reportGeneratedAt || j.submittedAt) === day));
    if (!items.length) return all.length ? empty('search_off', 'Ningún informe coincide', day ? `No hay informes del ${fmtDate(day)}.` : 'Prueba con otro filtro.', '<button class="btn btn-secondary" data-clear>Ver todos los informes</button>')
      : empty('description', 'Aún no hay informes', 'Aquí aparecerán los informes terminados.');
    return `<p class="count">${items.length} informe${items.length === 1 ? '' : 's'}</p><div class="card-list">${items.map((j) => {
      const [ic, label] = REPORT_LABEL[reportState(j)];
      return `<article class="card report-card">
        <a href="#/reports/${esc(j.id)}" class="report-card-main"><div class="grow"><h3>${esc(line1(j))}</h3><p>${esc(line2(j))}</p>
          <div class="job-meta"><span class="mono">${esc(jobNo(j))}</span>${me.role === 'admin' && j.assignedTo ? `<span>${icon('person')}${esc(j.assignedTo)}</span>` : ''}</div></div>
          <div class="report-state r-${reportState(j)}">${icon(ic)}<span>${label}</span><small>${fmtDate(j.submittedAt || j.reportGeneratedAt)}</small></div></a>
        <div class="report-card-actions"><a class="btn btn-secondary btn-sm" href="#/reports/${esc(j.id)}">Ver informe ${icon('arrow_forward')}</a>${pdfActions(j, true)}</div>
      </article>`;
    }).join('')}</div>`;
  };
  return {
    title: 'Informes', tab: 'reports',
    body: `<div class="search-row"><div class="search">${icon('search')}<input type="search" id="q" placeholder="Buscar informes…" value="${esc(q)}" aria-label="Buscar informes" enterkeyhint="search"></div>
        <label class="date-btn ${day ? 'on' : ''}" aria-label="Filtrar por fecha">${icon('event')}<input type="date" id="day" value="${esc(day)}"></label></div>
      ${day ? `<button class="chip-btn on filter-tag" data-clearday>${icon('event')} ${fmtDate(day)} ${icon('close')}</button>` : ''}
      ${chips(REPORT_FILTERS, f)}<div id="list">${list()}</div>`,
    mount(v) {
      const paint = () => { $('#list', v).innerHTML = list(); wire(); };
      const wire = () => {
        wirePdfActions(v);
        on(v, '[data-clear]', 'click', () => { safeSet('lcc-rep-f', 'all'); safeSet('lcc-rep-q', ''); safeSet('lcc-rep-day', ''); window.dispatchEvent(new Event('lcc:redraw')); });
      };
      on(v, '#q', 'input', (e, el) => { q = el.value.trim(); safeSet('lcc-rep-q', q); paint(); });
      on(v, '#day', 'change', (e, el) => { safeSet('lcc-rep-day', el.value); window.dispatchEvent(new Event('lcc:redraw')); });
      on(v, '[data-clearday]', 'click', () => { safeSet('lcc-rep-day', ''); window.dispatchEvent(new Event('lcc:redraw')); });
      on(v, '[data-f]', 'click', (e, b) => { f = b.dataset.f; safeSet('lcc-rep-f', f); v.querySelectorAll('[data-f]').forEach((c) => c.classList.toggle('on', c === b)); paint(); });
      wire();
      off = store.onChange(paint);
    },
    unmount: () => off?.(),
  };
}

// ── notification events, derived from job data ──────────
export function notifications(me) {
  const events = [];
  for (const j of store.jobs()) {
    const base = { address: address(j), id: j.id };
    if (me.role === 'admin') {
      if (j.submittedAt && displayStatus(j) !== 'Reviewed') events.push({ ...base, type: 'submitted', at: Date.parse(j.submittedAt), href: `#/reports/${j.id}`, text: `Enviado por ${j.assignedTo || 'el empleado'}` });
      for (const p of j.problems || []) if (isOpen(j)) events.push({ ...base, type: 'problem', at: Date.parse(p.createdAt), href: `#/jobs/${j.id}/problems`, text: `${tr(p.category)}${p.area ? ` · ${tr(p.area)}` : ''} — ${p.description}` });
    } else {
      if (j.assignedTo && !photoCount(j, 'before') && isOpen(j)) events.push({ ...base, type: 'assigned', at: Date.parse(j.assignedAt || j.createdAt), href: `#/jobs/${j.id}` });
      if (j.reviewedAt || displayStatus(j) === 'Reviewed') events.push({ ...base, type: 'reviewed', at: Date.parse(j.reviewedAt || j.submittedAt || j.createdAt), href: `#/reports/${j.id}` });
    }
  }
  return events.filter((e) => e.at).sort((a, b) => b.at - a.at);
}

// ── pick a job to report a problem on (Home quick action / manifest shortcut) ──
function pickJobForProblem(query, me) {
  const open = store.jobs().filter(isOpen);
  if (open.length === 1) return { redirect: `#/jobs/${open[0].id}/problems/new` };
  return {
    title: 'Comunicar un problema', back: '#/home',
    body: `<p class="lead">¿En qué trabajo está el problema?</p>${open.length ? `<div class="card-list">${open.map((j) => jobCard(j, me, { compact: true })
      .replace(`href="#/jobs/${esc(j.id)}"`, `href="#/jobs/${esc(j.id)}/problems/new"`)).join('')}</div>` : empty('work_off', 'No hay trabajos abiertos', 'Los problemas se comunican en un trabajo en el que estés.')}`,
  };
}

export const ROUTES = [
  [/^\/jobs$/, (q, me) => jobsScreen(q, me)],
  [/^\/reports$/, (q, me) => reportsScreen(q, me)],
  [/^\/report-problem$/, (q, me) => pickJobForProblem(q, me)],
];
