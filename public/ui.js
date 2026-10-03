// LCC design system: small HTML helpers + the few interactive pieces every screen shares
// (bottom sheets, confirmations, photo viewer, toasts, skeletons, status chips, photo capture).
import { displayStatus } from './jobs.mjs?v=__V__';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const icon = (name, cls = '') => `<span class="i ${cls}" aria-hidden="true">${name}</span>`;
export const go = (hash) => { location.hash = hash; };
/** ask the shell to redraw the current screen (local UI state changed) */
export const redraw = () => window.dispatchEvent(new Event('lcc:redraw'));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
// Handlers are set as properties (el.onclick = …), so running a screen's mount() again after a
// partial redraw replaces the handler instead of stacking a second one on an unchanged button.
export function on(root, sel, ev, fn) { $$(sel, root).forEach((el) => { el[`on${ev}`] = (e) => fn(e, el); }); }

// ── dates ───────────────────────────────────────────────
const TZ = { timeZone: 'Europe/London' };
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { ...TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { ...TZ, hour: '2-digit', minute: '2-digit' });
export function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(d);
}
export const greeting = () => { const h = Number(new Date().toLocaleString('en-GB', { ...TZ, hour: 'numeric', hour12: false })); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// ── address lines ───────────────────────────────────────
export const line1 = (j) => [j.houseNumber, j.street].filter(Boolean).join(' ') || j.id;
/** what to show as the Job ID: a job made offline has no number until it syncs */
export const jobNo = (j) => (j.pendingCreate ? 'Job ID on sync' : j.id);
export const line2 = (j) => [j.town, j.postcode].filter(Boolean).join(' ');

// ── status chips: colour + icon + text, never colour alone ──
const STATUS_STYLE = {
  Draft: ['neutral', 'edit_note'], 'Ready to Start': ['neutral', 'schedule'], Assigned: ['blue', 'assignment_ind'],
  'In Progress': ['amber', 'construction'], 'Awaiting After Photos': ['orange', 'add_a_photo'],
  'Awaiting Review': ['purple', 'hourglass_top'], Completed: ['green', 'task_alt'], Reviewed: ['teal', 'verified'],
};
export function chip(job) {
  const s = displayStatus(job), [tone, ic] = STATUS_STYLE[s] || STATUS_STYLE.Draft;
  return `<span class="chip chip-${tone}">${icon(ic)}${esc(s)}</span>`;
}

// ── pieces ──────────────────────────────────────────────
export const empty = (ic, title, text, action = '') => `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
export const skeleton = (n = 3, h = 120) => Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join('');
export const progressBar = (pct, label = '') => `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label || 'Progress')}"><span style="transform:scaleX(${pct / 100})"></span></div>`;

/** <img> for a photo path: server URLs load directly, `local:<key>` ones (not yet uploaded) are filled by hydrate(). */
export const photoImg = (path, alt = '') => path?.startsWith('local:')
  ? `<img data-local="${esc(path.slice(6))}" alt="${esc(alt)}">`
  : `<img src="${esc(path)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;

let toastTimer;
export function toast(msg, tone = '') {
  const t = document.getElementById('toast');
  t.className = `toast show ${tone}`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── bottom sheet (native <dialog>, rounded top, safe-area + keyboard aware) ──
export function sheet(html, { wire, className = '' } = {}) {
  const d = document.createElement('dialog');
  d.className = `sheet ${className}`;
  d.innerHTML = `<div class="sheet-grab" aria-hidden="true"></div>${html}`;
  document.body.append(d);
  d.addEventListener('close', () => setTimeout(() => d.remove(), 200));
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // tap outside
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
  // drag the grab handle down to dismiss
  const grab = $('.sheet-grab', d);
  let y0 = null;
  grab.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  grab.addEventListener('touchmove', (e) => { if (y0 != null) d.style.transform = `translateY(${Math.max(0, e.touches[0].clientY - y0)}px)`; }, { passive: true });
  grab.addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80) d.close(); d.style.transform = ''; y0 = null; });
  d.showModal();
  wire?.(d);
  return d;
}

/** Confirmation sheet; resolves true when confirmed. */
export function confirmSheet({ title, text = '', ok = 'Confirm', danger = false, detail = '' }) {
  return new Promise((resolve) => {
    let answer = false;
    const d = sheet(`<h2>${esc(title)}</h2>${detail}${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <div class="sheet-actions"><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>
      <button class="btn btn-secondary" data-close>Cancel</button></div>`);
    $('[data-ok]', d).addEventListener('click', () => { answer = true; d.close(); });
    d.addEventListener('close', () => resolve(answer));
  });
}

// ── full-screen photo viewer: swipe/arrow between photos, double-tap to zoom ──
export function viewer(items, start = 0) {
  let i = start, zoom = false;
  const d = document.createElement('dialog');
  d.className = 'viewer';
  d.innerHTML = `<div class="viewer-top"><span class="viewer-label"></span><button class="icon-btn" data-x aria-label="Close">${icon('close')}</button></div>
    <div class="viewer-stage"><img alt=""></div>
    ${items.length > 1 ? `<button class="icon-btn viewer-prev" aria-label="Previous photo">${icon('chevron_left')}</button><button class="icon-btn viewer-next" aria-label="Next photo">${icon('chevron_right')}</button>` : ''}
    <div class="viewer-count"></div>`;
  document.body.append(d);
  const img = $('img', d);
  const show = async () => {
    const it = items[i];
    zoom = false; img.style.transform = '';
    img.src = it.src.startsWith('local:') ? (await localUrl(it.src.slice(6))) || '' : it.src;
    $('.viewer-label', d).textContent = it.label || '';
    $('.viewer-count', d).textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
  };
  const step = (n) => { i = (i + n + items.length) % items.length; show(); };
  $('[data-x]', d).onclick = () => d.close();
  $('.viewer-prev', d)?.addEventListener('click', () => step(-1));
  $('.viewer-next', d)?.addEventListener('click', () => step(1));
  d.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); });
  let x0 = null;
  img.addEventListener('touchstart', (e) => { if (e.touches.length === 1) x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener('touchend', (e) => { if (x0 != null && !zoom) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); } x0 = null; });
  img.addEventListener('dblclick', (e) => {
    zoom = !zoom;
    const r = img.getBoundingClientRect();
    img.style.transformOrigin = `${e.clientX - r.left}px ${e.clientY - r.top}px`;
    img.style.transform = zoom ? 'scale(2.2)' : '';
  });
  d.addEventListener('close', () => d.remove());
  d.showModal();
  show();
}

// local (not yet uploaded) photos: resolved through the store, set once after each render
let localUrl = async () => null;
export const setLocalResolver = (fn) => { localUrl = fn; };
export async function hydrate(root) {
  for (const el of $$('img[data-local]', root)) {
    const url = await localUrl(el.dataset.local);
    if (url) el.src = url; else el.replaceWith(Object.assign(document.createElement('span'), { className: 'i', textContent: 'image_not_supported' }));
  }
}

// ── photos: native camera / library, then resized for the report ──
// 1920px long edge at JPEG 0.82 keeps detail for evidence and the PDF at ~0.4–0.8 MB.
export function pickPhoto({ camera = true } = {}) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    if (camera) input.setAttribute('capture', 'environment');
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      try { resolve(await compress(file)); } catch { toast("Couldn't read that photo — try again", 'bad'); resolve(null); }
    }, { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
async function compress(file) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1920 / Math.max(img.width, img.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('encode'))), 'image/jpeg', 0.82));
}

// ── logo (hexagon mark) ─────────────────────────────────
// below ~72px the full lockup is unreadable, so small marks show just "LCC" + the bath
export const logo = (size) => `
  <div class="logo ${size < 72 ? 'compact' : ''}" style="--s:${size}px" aria-label="LCC Bathrooms &amp; Services Ltd" role="img">
    <svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,2 91.6,26 91.6,74 50,98 8.4,74 8.4,26" fill="none" stroke="currentColor" stroke-width="${size < 72 ? 4 : 2}" stroke-linejoin="round"/></svg>
    <div class="logo-in"><b>LCC</b>${icon('bathtub')}${size < 72 ? '' : '<small>BATHROOMS &amp;<br>SERVICES LTD</small>'}</div>
  </div>`;
