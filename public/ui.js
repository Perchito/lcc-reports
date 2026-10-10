// LCC design system: small HTML helpers + the few interactive pieces every screen shares
// (bottom sheets, confirmations, photo viewer, toasts, skeletons, status chips, photo capture).
import { displayStatus, tr } from './jobs.mjs?v=__V__';

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

// ── no accidental page zoom on phones ──────────────────
// iOS ignores user-scalable=no, so block its pinch gesture and two-finger moves here; double-tap zoom is
// off via `touch-action: manipulation` in CSS. The photo viewer has its own pinch zoom on the image.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// Spanish labels for stored values live in lib/jobs.mjs (shared with the server)
export { tr };

// ── dates ───────────────────────────────────────────────
const TZ = { timeZone: 'Europe/London' };
const LOCALE = 'es-ES';
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(LOCALE, { ...TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d) => new Date(d).toLocaleTimeString(LOCALE, { ...TZ, hour: '2-digit', minute: '2-digit' });
export function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'ahora mismo';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) { const n = Math.floor(s / 86400); return `hace ${n} día${n === 1 ? '' : 's'}`; }
  return fmtDate(d);
}
export const greeting = () => { const h = Number(new Date().toLocaleString('en-GB', { ...TZ, hour: 'numeric', hour12: false })); return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; };

// ── address lines ───────────────────────────────────────
export const line1 = (j) => [j.houseNumber, j.street].filter(Boolean).join(' ') || j.id;
/** what to show as the Job ID: a job made offline has no number until it syncs */
export const jobNo = (j) => (j.pendingCreate ? 'Nº al sincronizar' : j.id);
export const line2 = (j) => [j.town, j.postcode].filter(Boolean).join(' ');

// ── status chips: colour + icon + text, never colour alone ──
const STATUS_STYLE = {
  Draft: ['neutral', 'edit_note'], 'Ready to Start': ['neutral', 'schedule'], Assigned: ['blue', 'assignment_ind'],
  'In Progress': ['amber', 'construction'], 'Awaiting After Photos': ['orange', 'add_a_photo'],
  'Awaiting Review': ['purple', 'hourglass_top'], Completed: ['green', 'task_alt'], Reviewed: ['teal', 'verified'],
};
export function chip(job) {
  const s = displayStatus(job), [tone, ic] = STATUS_STYLE[s] || STATUS_STYLE.Draft;
  return `<span class="chip chip-${tone}">${icon(ic)}${esc(tr(s))}</span>`;
}

// ── pieces ──────────────────────────────────────────────
export const empty = (ic, title, text, action = '') => `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
export const skeleton = (n = 3, h = 120) => Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join('');
export const progressBar = (pct, label = '') => `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(label || 'Progreso')}"><span style="transform:scaleX(${pct / 100})"></span></div>`;

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
export function confirmSheet({ title, text = '', ok = 'Confirmar', danger = false, detail = '' }) {
  return new Promise((resolve) => {
    let answer = false;
    const d = sheet(`<h2>${esc(title)}</h2>${detail}${text ? `<p class="muted">${esc(text)}</p>` : ''}
      <div class="sheet-actions"><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>
      <button class="btn btn-secondary" data-close>Cancelar</button></div>`);
    $('[data-ok]', d).addEventListener('click', () => { answer = true; d.close(); });
    d.addEventListener('close', () => resolve(answer));
  });
}

// ── full-screen photo viewer: swipe/arrow between photos, double-tap to zoom ──
export function viewer(items, start = 0) {
  let i = start;
  const d = document.createElement('dialog');
  d.className = 'viewer';
  d.innerHTML = `<div class="viewer-top"><span class="viewer-label"></span><button class="icon-btn" data-x aria-label="Cerrar">${icon('close')}</button></div>
    <div class="viewer-stage"><img alt=""></div>
    ${items.length > 1 ? `<button class="icon-btn viewer-prev" aria-label="Foto anterior">${icon('chevron_left')}</button><button class="icon-btn viewer-next" aria-label="Foto siguiente">${icon('chevron_right')}</button>` : ''}
    <div class="viewer-count"></div>`;
  document.body.append(d);
  const img = $('img', d), stage = $('.viewer-stage', d);
  // zoom lives on the photo only (the page itself never zooms): pinch, double-tap, drag to pan
  let s = 1, tx = 0, ty = 0;
  const apply = (animate) => { img.style.transition = animate ? '' : 'none'; img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };
  const reset = () => { s = 1; tx = ty = 0; apply(true); };
  const zoomTo = (ns, cx, cy) => { // keep the point under the finger where it is
    const r = stage.getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
    tx = ox - ((ox - tx) * ns) / s; ty = oy - ((oy - ty) * ns) / s; s = ns;
    if (s <= 1.01) { s = 1; tx = ty = 0; }
  };
  const show = async () => {
    const it = items[i];
    reset();
    img.src = it.src.startsWith('local:') ? (await localUrl(it.src.slice(6))) || '' : it.src;
    $('.viewer-label', d).textContent = it.label || '';
    $('.viewer-count', d).textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
  };
  const step = (n) => { i = (i + n + items.length) % items.length; show(); };
  $('[data-x]', d).onclick = () => d.close();
  $('.viewer-prev', d)?.addEventListener('click', () => step(-1));
  $('.viewer-next', d)?.addEventListener('click', () => step(1));
  d.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); });

  let g = null, lastTap = 0;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  stage.addEventListener('touchstart', (e) => {
    const t = e.touches;
    g = t.length === 2 ? { pinch: true, d0: dist(t), s0: s, moved: true } : { x: t[0].clientX, y: t[0].clientY, tx0: tx, ty0: ty, moved: false };
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (!g) return;
    e.preventDefault();
    const t = e.touches;
    if (g.pinch && t.length === 2) { const [cx, cy] = mid(t); zoomTo(Math.min(4, Math.max(1, (g.s0 * dist(t)) / g.d0)), cx, cy); apply(false); return; }
    if (!g.pinch && t.length === 1) {
      const dx = t[0].clientX - g.x, dy = t[0].clientY - g.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
      if (s > 1) { tx = g.tx0 + dx; ty = g.ty0 + dy; apply(false); }
    }
  }, { passive: false });
  stage.addEventListener('touchend', (e) => {
    if (!g || e.touches.length) return;
    const t = e.changedTouches[0];
    if (!g.pinch && !g.moved) { // a tap: two quick taps toggle zoom
      if (Date.now() - lastTap < 300) { if (s > 1) reset(); else { zoomTo(2.5, t.clientX, t.clientY); apply(true); } lastTap = 0; } else lastTap = Date.now();
    } else if (!g.pinch && s === 1) { const dx = t.clientX - g.x; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); } // swipe between photos
    g = null;
  });
  img.addEventListener('dblclick', (e) => { if (s > 1) reset(); else { zoomTo(2.5, e.clientX, e.clientY); apply(true); } }); // mouse
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
// `multiple` (library only): resolves to an array of blobs, possibly empty
// The input is put in the page until the photo comes back: an iPhone can throw away a detached file input while
// the camera is open, so the first photo of a visit was lost and only a second try worked.
let picking = null;
export function pickPhoto({ camera = true, multiple = false } = {}) {
  return new Promise((resolve) => {
    picking?.remove();
    const input = picking = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: multiple && !camera });
    input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0'; // off screen, not display:none (some iPhones won't open those from code)
    if (camera) input.setAttribute('capture', 'environment');
    const done = (v) => { input.remove(); if (picking === input) picking = null; resolve(v); };
    input.addEventListener('change', async () => {
      const out = [];
      for (const file of input.files) {
        try { out.push(await compress(file)); } catch { toast('No se pudo leer una foto — inténtalo de nuevo', 'bad'); }
      }
      done(multiple ? out : out[0] || null);
    }, { once: true });
    input.addEventListener('cancel', () => done(multiple ? [] : null), { once: true });
    document.body.append(input);
    input.click();
  });
}
// photo -> JPEG, longest side 1920px. createImageBitmap first; an <img> decode if this phone's browser can't
async function compress(file) {
  let img, url;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    url = URL.createObjectURL(file);
    img = new Image(); img.src = url;
    await img.decode();
  }
  try {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const scale = Math.min(1, 1920 / Math.max(w, h));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(w * scale), height: Math.round(h * scale) });
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('encode'))), 'image/jpeg', 0.82));
  } finally { img.close?.(); if (url) URL.revokeObjectURL(url); }
}

// ── logo (official LCC artwork, white background) ───────
export const logo = (size) => `<img class="logo" src="/img/logo.png" style="--s:${size}px" alt="LCC Bathrooms &amp; Services Ltd">`;

// ── signature pad: plain canvas + pointer events (finger, pen or mouse) ──
// fit() sizes it to its box (call again once a hidden pad is shown) and clears it.
export function signaturePad(pad) {
  const ctx = pad.getContext('2d');
  let inked = false, drawing = false;
  const fit = () => {
    const d = Math.min(devicePixelRatio || 1, 2);
    pad.width = pad.offsetWidth * d; pad.height = pad.offsetHeight * d;
    ctx.scale(d, d); Object.assign(ctx, { lineWidth: 2.5, lineCap: 'round', lineJoin: 'round', strokeStyle: '#0f1f24' });
    inked = false;
  };
  const at = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * (pad.offsetWidth / r.width), (e.clientY - r.top) * (pad.offsetHeight / r.height)]; };
  pad.onpointerdown = (e) => { drawing = true; pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...at(e)); ctx.lineTo(...at(e)); ctx.stroke(); inked = true; };
  pad.onpointermove = (e) => { if (drawing) { ctx.lineTo(...at(e)); ctx.stroke(); } };
  pad.onpointerup = pad.onpointercancel = () => { drawing = false; };
  fit();
  return { fit, inked: () => inked, png: () => pad.toDataURL('image/png') };
}
