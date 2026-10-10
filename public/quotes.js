// Quotes (Presupuestos): a site visit for a new client before any job exists — client details, the work and price,
// and photos of the property's condition that the client signs (here or by link), so LCC can't be blamed later for
// damage that was already there. "Convertir en trabajo" turns it into a normal job that keeps the photos and signature.
// The condition screens also serve jobs made from a quote (#/jobs/<id>/condition).
import { esc, icon, on, $, $$, toast, sheet, confirmSheet, empty, skeleton, viewer, pickPhoto, photoImg, fmtDate, ago, tr, signaturePad } from './ui.js?v=__V__';
import * as store from './store.js?v=__V__';
import { address, isQuote, money, PHOTO_ROOMS, CONDITION_DECLARATION } from './jobs.mjs?v=__V__';
import { downloadPdf, sharePdf, shareSignLink } from './job.js?v=__V__';
import { employees, assignSelect } from './admin.js?v=__V__';

const enc = encodeURIComponent;
async function getQuote(id) {
  const j = store.job(id) || (await store.loadJob(id));
  if (!j) throw store.sync.reachable ? Object.assign(new Error('No se encontró este presupuesto.'), { status: 404 }) : new store.Offline();
  return j;
}
const home = (j) => (isQuote(j) ? `#/quotes/${enc(j.id)}` : `#/jobs/${enc(j.id)}`);
const signState = (j) => (j.conditionSign?.signedAt ? ['done', 'verified', 'Firmado por el cliente'] : j.conditionSign ? ['part', 'schedule', 'Enlace enviado — esperando firma'] : ['todo', 'gesture', 'Sin firmar']);

// ── list ────────────────────────────────────────────────
const quoteCard = (j) => {
  const [st, ic, label] = signState(j), n = j.condition?.length || 0;
  return `<a class="card job-card" href="#/quotes/${esc(j.id)}">
    <div class="job-card-top"><div class="grow"><h3>${esc(j.personName || j.id)}</h3><p>${esc(address(j) || 'Sin dirección')}</p></div>
      ${j.convertedTo ? `<span class="chip chip-green">${icon('task_alt')}Trabajo</span>` : `<span class="chip chip-${st === 'done' ? 'green' : st === 'part' ? 'amber' : 'neutral'}">${icon(ic)}${st === 'done' ? 'Firmado' : st === 'part' ? 'Esperando' : 'Sin firmar'}</span>`}</div>
    <div class="job-meta"><span class="mono">${esc(j.pendingCreate ? 'Nº al sincronizar' : j.id)}</span><span>${icon('photo_camera')}${n} foto${n === 1 ? '' : 's'}</span>
      ${j.price != null ? `<span>${icon('payments')}${esc(money(j.price))}</span>` : ''}<span>${icon('event')}${fmtDate(j.createdAt)}</span></div>
  </a>`;
};
function list(q, me) {
  const all = store.quotes();
  const open = all.filter((j) => !j.convertedTo), done = all.filter((j) => j.convertedTo);
  return {
    title: 'Presupuestos', tab: 'quotes', live: true,
    actions: `<a class="icon-btn" href="#/quotes/new" aria-label="Nuevo presupuesto">${icon('add')}</a>`,
    body: !store.sync.loaded ? skeleton(3, 110)
      : all.length ? `${open.length ? `<div class="card-list">${open.map(quoteCard).join('')}</div>` : ''}
        ${done.length ? `<h3 class="section-title">Convertidos en trabajo <span>${done.length}</span></h3><div class="card-list">${done.map(quoteCard).join('')}</div>` : ''}`
      : empty('request_quote', 'Aún no hay presupuestos', 'En la visita a un cliente nuevo: apunta sus datos, haz fotos del estado de la vivienda y que lo firme. Así nadie nos puede culpar de lo que ya estaba roto.'),
    footer: `<a class="btn btn-primary btn-lg" href="#/quotes/new">${icon('add')} Nuevo presupuesto</a>`,
  };
}

// ── new / edit ──────────────────────────────────────────
const FIELDS = [
  ['Cliente', [['personName', 'Nombre del cliente', 'Nombre y apellidos', 'text', 'off', true], ['personPhone', 'Teléfono', '', 'tel', 'off'], ['personEmail', 'Correo', '', 'email', 'off']]],
  ['Dirección', [['houseNumber', 'Número / piso', 'p. ej. 12 o Flat 4B', 'text', 'address-line1'], ['street', 'Calle', '', 'text', 'address-line2'], ['town', 'Ciudad', '', 'text', 'address-level2'], ['postcode', 'Código postal', '', 'text', 'postal-code']]],
];
async function quoteForm(id) {
  const j = id ? await getQuote(id) : null;
  const draftKey = 'quote:new', draft = j ? {} : (await store.getDraft(draftKey)) || {};
  const val = (k) => (j ? j[k] ?? '' : draft[k] ?? '');
  const input = ([k, label, ph, type, ac, req]) => `<label class="field"><span>${label}${req ? '' : ' <small>(opcional)</small>'}</span>
    <input id="${k}" type="${type}" placeholder="${ph}" value="${esc(val(k))}" autocomplete="${ac}" ${k === 'postcode' ? 'autocapitalize="characters"' : ''}></label>`;
  const keys = [...FIELDS.flatMap(([, f]) => f.map((x) => x[0])), 'work', 'price'];
  return {
    title: j ? 'Editar presupuesto' : 'Nuevo presupuesto', back: j ? `#/quotes/${enc(id)}` : '#/quotes',
    body: `${FIELDS.map(([title, f]) => `<section class="form-section"><h3 class="section-title">${title}</h3>${f.map(input).join('')}</section>`).join('')}
      <section class="form-section"><h3 class="section-title">Trabajo</h3>
        <label class="field"><span>Qué hay que hacer <small>(opcional)</small></span><textarea id="work" rows="4" placeholder="Write it in English for the client's PDF — e.g. Strip out and refit the main bathroom.">${esc(val('work'))}</textarea></label>
        <label class="field"><span>Precio en £ <small>(opcional)</small></span><input id="price" inputmode="decimal" placeholder="p. ej. 2500" value="${esc(val('price') ?? '')}"></label></section>
      <p class="form-error" id="err" role="alert" hidden></p>`,
    footer: `<button class="btn btn-primary btn-lg" id="save">${icon(j ? 'check' : 'arrow_forward')} ${j ? 'Guardar' : 'Crear y hacer fotos'}</button>`,
    mount(v, f) {
      const read = () => Object.fromEntries(keys.map((k) => [k, $(`#${k}`, v).value.trim()]));
      if (!j) on(v, 'input, textarea', 'input', () => store.saveDraft(draftKey, read()));
      on(f, '#save', 'click', () => {
        const vals = read(), err = $('#err', v);
        const price = vals.price.replace(/[£,\s]/g, '');
        const miss = !vals.personName ? 'Escribe el nombre del cliente.' : price && !(Number(price) >= 0) ? 'El precio tiene que ser un número, p. ej. 2500.' : '';
        if (miss) { err.hidden = false; err.textContent = miss; return; }
        vals.price = price === '' ? null : Number(price);
        if (j) {
          const changed = Object.fromEntries(Object.entries(vals).filter(([k, x]) => (j[k] ?? '') !== (x ?? '')));
          if (Object.keys(changed).length) store.patch(id, changed);
          toast('Presupuesto guardado');
          location.replace(`#/quotes/${enc(id)}`);
        } else {
          const newId = store.createJob({ ...vals, kind: 'quote' });
          store.clearDraft(draftKey);
          location.replace(`#/quotes/${enc(newId)}/condition`);
        }
      });
    },
  };
}

// ── detail ──────────────────────────────────────────────
async function detail(id, q, me) {
  const j = await getQuote(id);
  if (!isQuote(j)) return { redirect: `#/jobs/${enc(id)}` };
  const n = j.condition?.length || 0, [st, sic, slabel] = signState(j), base = `#/quotes/${esc(id)}`;
  const step = (href, ic, title, value, state) => `<a class="flow-card st-${state}" href="${href}">
      <span class="flow-ic">${icon(state === 'done' ? 'check_circle' : state === 'part' ? 'timelapse' : ic)}</span>
      <span class="grow"><b>${title}</b><small>${value}</small></span>${icon('chevron_right', 'chev')}</a>`;
  const done = !!j.convertedTo;
  return {
    title: 'Presupuesto', back: '#/quotes', live: true, side: 'quotes',
    actions: done ? '' : `<a class="icon-btn" href="${base}/edit" aria-label="Editar presupuesto">${icon('edit')}</a>`,
    body: `
      <section class="job-hero"><h2>${esc(j.personName || '—')}</h2><p>${esc(address(j) || 'Sin dirección')}</p>
        <div class="job-meta"><span class="mono">${esc(j.pendingCreate ? 'Nº al sincronizar' : j.id)}</span><span>${icon('event')}${fmtDate(j.createdAt)}</span><span>${icon('person')}${esc(j.createdBy || '')}</span></div></section>
      ${done ? `<a class="notice" href="#/jobs/${esc(j.convertedTo)}">${icon('task_alt')}<span>Convertido en el trabajo <b>${esc(j.convertedTo)}</b> — las fotos y la firma están allí.</span></a>` : ''}
      ${j.pendingCreate ? `<p class="notice">${icon('schedule_send')}<span>Guardado en este móvil. Recibirá su número cuando vuelvas a tener conexión.</span></p>` : ''}
      <section class="flow">
        ${step(`${base}/condition`, 'photo_camera', 'Fotos del estado', n ? `${n} foto${n === 1 ? '' : 's'}` : 'Aún ninguna — haz fotos de todo antes de empezar', n ? 'done' : 'todo')}
        ${step(`${base}/sign`, sic, 'Firma del cliente', slabel, st)}
      </section>
      <section class="card info-card"><h3 class="label">Trabajo</h3>
        <p class="pre">${j.work ? esc(j.work) : '<span class="muted">Sin descripción todavía</span>'}</p>
        ${j.price != null ? `<p class="big-price">${esc(money(j.price))}</p>` : ''}
        ${done ? '' : `<a class="btn btn-text btn-sm" href="${base}/edit">${icon('edit')} Editar datos, trabajo y precio</a>`}</section>
      ${j.personPhone || j.personEmail ? `<section class="card info-card"><h3 class="label">Cliente</h3><div class="btn-row">
        ${j.personPhone ? `<a class="btn btn-secondary" href="tel:${esc(j.personPhone)}">${icon('call')} Llamar</a>` : ''}${j.personEmail ? `<a class="btn btn-secondary" href="mailto:${esc(j.personEmail)}">${icon('mail')} Correo</a>` : ''}</div></section>` : ''}
      <div class="btn-row"><button class="btn btn-secondary" id="dl">${icon('download')} PDF</button><button class="btn btn-secondary" id="share">${icon('ios_share')} Compartir</button></div>`,
    footer: done ? `<a class="btn btn-primary btn-lg" href="#/jobs/${esc(j.convertedTo)}">${icon('arrow_forward')} Abrir trabajo ${esc(j.convertedTo)}</a>`
      : `<button class="btn btn-primary btn-lg" id="convert">${icon('add_home_work')} Convertir en trabajo</button>`,
    mount(v, f) {
      const pdf = (fn) => async () => { try { await fn(store.job(id), {}); } catch (e) { toast(e.offline ? 'El PDF necesita conexión' : e.message, 'bad'); } };
      on(v, '#dl', 'click', pdf(downloadPdf));
      on(v, '#share', 'click', pdf(sharePdf));
      on(f, '#convert', 'click', () => convert(store.job(id), me));
    },
  };
}

async function convert(j, me) {
  if (!['houseNumber', 'street', 'town', 'postcode'].every((k) => String(j[k] || '').trim())) {
    if (await confirmSheet({ title: 'Falta la dirección', text: 'Un trabajo necesita número, calle, ciudad y código postal.', ok: 'Añadir dirección' })) location.hash = `#/quotes/${enc(j.id)}/edit`;
    return;
  }
  if (store.pending(j.id).length || j.pendingCreate) return toast('Espera a que el presupuesto se sincronice y vuelve a intentarlo', 'bad');
  const admin = me.role === 'admin', users = admin ? await employees() : null;
  const d = sheet(`<h2>Convertir en trabajo</h2>
    <p class="muted">Se crea un trabajo nuevo con los datos del cliente${j.condition?.length ? `, las ${j.condition.length} fotos del estado` : ''}${j.conditionSign?.signedAt ? ' y la firma' : ''}.${j.conditionSign?.signedAt ? '' : ' <b>El cliente aún no ha firmado el estado.</b>'}</p>
    ${admin ? `<label class="field"><span>Asignar a</span>${assignSelect(users, '')}</label>` : '<p class="muted">El trabajo se te asignará a ti.</p>'}
    <div class="sheet-actions"><button class="btn btn-primary btn-lg" data-go>${icon('add_home_work')} Crear trabajo</button><button class="btn btn-secondary" data-close>Cancelar</button></div>`);
  const go = $('[data-go]', d);
  go.onclick = async () => {
    go.disabled = true; go.innerHTML = '<span class="spin" aria-hidden="true"></span> Creando…';
    try {
      const { jobId } = await store.api(`/api/jobs/${enc(j.id)}/convert`, { method: 'POST', body: admin ? { assignedTo: $('#assignedTo', d)?.value || '' } : {} });
      await store.refresh();
      d.close(); toast(`Trabajo ${jobId} creado`);
      location.hash = `#/jobs/${enc(jobId)}`;
    } catch (e) { toast(e.offline ? 'Convertir necesita conexión' : e.message, 'bad'); go.disabled = false; go.innerHTML = `${icon('add_home_work')} Crear trabajo`; }
  };
}

// ── condition photos (quote or job) ─────────────────────
const AREAS = [...PHOTO_ROOMS.map((r) => r.replace(/ \(Side \d\)$/, '')).filter((r, i, a) => a.indexOf(r) === i), 'Hallway', 'Stairs', 'Garden', 'Whole property'];
const areaPick = new Map(); // job id -> the area new photos go under (kept while the app is open)
function noteSheet(j, p) {
  const d = sheet(`<h2>Nota de la foto</h2><p class="muted">¿Qué se ve? p. ej. “Azulejo roto junto a la bañera”. Escríbelo en inglés si puedes — sale en el PDF del cliente.</p>
    <label class="field"><span>Nota</span><textarea id="note" rows="3">${esc(p.note || '')}</textarea></label>
    <div class="sheet-actions"><button class="btn btn-primary" data-save>Guardar</button><button class="btn btn-secondary" data-close>${p.note ? 'Cancelar' : 'Sin nota'}</button></div>`);
  const t = $('#note', d); setTimeout(() => t.focus(), 50);
  $('[data-save]', d).onclick = () => { const note = t.value.trim(); if (note !== (p.note || '')) store.editCondition(j.id, p.id, { note }); d.close(); };
}
async function condition(id) {
  const j = await getQuote(id);
  const list = j.condition || [], locked = !!j.conditionSign?.signedAt, closed = !!j.convertedTo;
  const used = [...new Set(list.map((p) => p.area).filter(Boolean))];
  const areas = [...new Set([...AREAS, ...used])];
  const area = areaPick.get(id) ?? '';
  const signHref = isQuote(j) ? `#/quotes/${enc(id)}/sign` : `#/jobs/${enc(id)}/condition/sign`;
  return {
    title: 'Fotos del estado', back: home(j), live: true,
    body: `<p class="lead">${esc(j.personName || '')}${j.personName && address(j) ? ' · ' : ''}${esc(address(j))}</p>
      ${closed ? `<p class="notice">${icon('task_alt')}<span>Este presupuesto ya es el trabajo <b>${esc(j.convertedTo)}</b>. Las fotos están allí.</span></p>`
        : locked ? `<p class="notice">${icon('verified')}<span>Firmado por <b>${esc(j.conditionSign.customerName)}</b> el ${fmtDate(j.conditionSign.signedAt)} — las fotos ya no se pueden cambiar.</span></p>`
        : `<p class="muted">Fotografía todo lo que ya esté roto, rayado, manchado o suelto — y también lo que esté bien. Elige la zona y haz las fotos.</p>
          <div class="chips wrap" role="radiogroup" aria-label="Zona">${areas.map((a) => `<button type="button" class="chip-btn ${a === area ? 'on' : ''}" data-area="${esc(a)}" aria-pressed="${a === area}">${esc(tr(a))}</button>`).join('')}
            <button type="button" class="chip-btn" id="other">${icon('add')} Otra</button></div>`}
      ${list.length ? `<div class="cond-grid">${list.map((p, k) => `<article class="cond-card">
          <button class="cond-img" data-view="${k}" aria-label="Ver foto ${k + 1}">${photoImg(p.path, `Foto ${k + 1}`)}${p.area ? `<span class="cond-area">${esc(tr(p.area))}</span>` : ''}
            ${store.conditionPending(id, p.id) ? `<span class="cond-wait">${icon('schedule')}</span>` : ''}</button>
          <div class="cond-body">${p.note ? `<p>${esc(p.note)}</p>` : ''}
            <small class="muted">${k + 1} · ${p.at ? ago(p.at) : ''}</small>
            ${locked || closed ? '' : `<div class="cond-actions"><button class="btn btn-text btn-sm" data-note="${esc(p.id)}">${icon('edit_note')} ${p.note ? 'Nota' : 'Añadir nota'}</button>
              <button class="icon-btn danger" data-del="${esc(p.id)}" aria-label="Borrar foto ${k + 1}">${icon('delete')}</button></div>`}</div></article>`).join('')}</div>`
        : empty('photo_camera', 'Aún no hay fotos', 'Haz fotos de cada habitación y de cualquier daño antes de empezar.')}
      ${list.length && !locked && !closed ? `<a class="btn btn-secondary" href="${signHref}">${icon('gesture')} ${j.conditionSign ? 'Firma del cliente: esperando' : 'Que el cliente lo firme'}</a>` : ''}`,
    footer: locked || closed ? '' : `<div class="btn-row"><button class="btn btn-secondary btn-lg icon-only" id="lib" aria-label="Elegir de la fototeca">${icon('photo_library')}</button>
      <button class="btn btn-primary btn-lg grow" id="cam">${icon('photo_camera')} Hacer foto${area ? ` · ${esc(tr(area))}` : ''}</button></div>`,
    mount(v, f) {
      const pick = (a) => { areaPick.set(id, a); window.dispatchEvent(new Event('lcc:redraw')); };
      on(v, '[data-area]', 'click', (e, b) => pick(area === b.dataset.area ? '' : b.dataset.area));
      on(v, '#other', 'click', () => {
        const d = sheet(`<form novalidate><h2>Otra zona</h2><label class="field"><span>Nombre</span><input id="an" placeholder="p. ej. Garage, Loft, Front door" autocomplete="off"></label>
          <div class="sheet-actions"><button class="btn btn-primary">Usar</button><button type="button" class="btn btn-secondary" data-close>Cancelar</button></div></form>`);
        setTimeout(() => $('#an', d).focus(), 50);
        $('form', d).onsubmit = (e) => { e.preventDefault(); const a = $('#an', d).value.trim().slice(0, 60); d.close(); if (a) pick(a); };
      });
      const take = async (camera) => {
        const blobs = camera ? [await pickPhoto({ camera })].filter(Boolean) : await pickPhoto({ camera, multiple: true });
        if (!blobs.length) return;
        let xid;
        for (const blob of blobs) { xid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); await store.conditionPhoto(id, blob, { area }, xid); }
        if (camera) noteSheet(j, { id: xid, note: '' }); // straight after a camera shot: what's in it?
        else toast(`${blobs.length} foto${blobs.length === 1 ? '' : 's'} añadida${blobs.length === 1 ? '' : 's'}`);
      };
      on(f, '#cam', 'click', () => take(true));
      on(f, '#lib', 'click', () => take(false));
      const cur = () => store.job(id)?.condition || [];
      on(v, '[data-view]', 'click', (e, b) => viewer(cur().map((p, k) => ({ src: p.path, label: `${k + 1}. ${p.area ? tr(p.area) : ''}${p.note ? ` — ${p.note}` : ''}` })), Number(b.dataset.view)));
      on(v, '[data-note]', 'click', (e, b) => { const p = cur().find((x) => x.id === b.dataset.note); if (p) noteSheet(j, p); });
      on(v, '[data-del]', 'click', async (e, b) => { if (await confirmSheet({ title: '¿Borrar foto?', ok: 'Borrar foto', danger: true })) store.deleteCondition(id, b.dataset.del); });
    },
  };
}

// ── the client signs the condition photos ───────────────
async function sign(id) {
  const j = await getQuote(id);
  const list = j.condition || [], s = j.conditionSign, back = isQuote(j) ? `#/quotes/${enc(id)}` : `#/jobs/${enc(id)}/condition`;
  // every photo with its area and note, so the client sees what they sign; tap one for full screen (swipe through them)
  const signedIds = s?.photoIds;
  const shown = signedIds ? list.filter((p) => signedIds.includes(p.id)) : list;
  const thumbs = `<button class="btn btn-secondary" data-view="0">${icon('fullscreen')} Ver las ${shown.length} fotos en grande</button>
    <div class="cond-grid">${shown.map((p, k) => `<article class="cond-card"><button class="cond-img" data-view="${k}" aria-label="Ver foto ${k + 1} en grande">${photoImg(p.path, `Foto ${k + 1}`)}${p.area ? `<span class="cond-area">${esc(tr(p.area))}</span>` : ''}</button>
      ${p.note ? `<div class="cond-body"><p>${esc(p.note)}</p></div>` : ''}</article>`).join('')}</div>`;
  const wireView = (v) => on(v, '[data-view]', 'click', (e, b) => viewer(shown.map((p, k) => ({ src: p.path, label: `${k + 1}. ${p.area ? tr(p.area) : ''}${p.note ? ` — ${p.note}` : ''}` })), Number(b.dataset.view)));
  if (s?.signedAt) return {
    title: 'Firma del cliente', back, live: true,
    body: `<div class="state-card success">${icon('verified')}<h2>Firmado</h2><p>${esc(s.customerName)} · ${fmtDate(s.signedAt)}${s.signedVia === 'link' ? ' · por enlace' : ''}</p></div>
      ${thumbs}<div class="card sig-card" lang="en"><p class="sig-decl">${esc(CONDITION_DECLARATION)}</p><div class="sig-box"><img src="${esc(s.signature)}" alt="Firma de ${esc(s.customerName)}"></div>
      <small class="muted">${(s.photoIds || list).length} fotos firmadas</small></div>`,
    mount: wireView,
  };
  if (!list.length) return { redirect: isQuote(j) ? `#/quotes/${enc(id)}/condition` : `#/jobs/${enc(id)}/condition` };
  let how = s ? 'link' : 'here', sig = null, saved = false;
  return {
    title: 'Firma del cliente', back,
    body: `<p class="lead">${list.length} foto${list.length === 1 ? '' : 's'} del estado de la vivienda</p>${thumbs}
      ${s ? `<div class="notice warn">${icon('schedule')}<div><b>Enlace enviado — esperando la firma</b><br>Si el cliente lo pierde, envíalo otra vez. También puede firmar aquí.
        <div class="btn-row"><button class="btn btn-secondary btn-sm" id="resend">${icon('ios_share')} Enviar enlace otra vez</button></div></div></div>` : ''}
      <fieldset class="field"><legend>¿Cómo firma el cliente?</legend><div class="tiles">
        <label class="tile"><input type="radio" name="how" value="here" ${how === 'here' ? 'checked' : ''}><span>${icon('gesture')}Aquí, en mi móvil</span></label>
        <label class="tile"><input type="radio" name="how" value="link" ${how === 'link' ? 'checked' : ''}><span>${icon('send_to_mobile')}Enviarle un enlace</span></label></div></fieldset>
      <div id="here" ${how === 'here' ? '' : 'hidden'}><p class="muted">Dale el móvil al cliente para que mire las fotos, lea y firme.</p>
        <div class="card sig-card" lang="en"><p class="sig-decl">${esc(CONDITION_DECLARATION)}</p>
          <label class="field"><span>Customer name</span><input id="cname" autocomplete="off" value="${esc(s?.customerName || j.personName || '')}"></label>
          <div class="field"><span class="field-label">Signature</span><canvas id="sig" class="sig-pad" aria-label="Firma del cliente"></canvas>
            <button type="button" class="btn btn-text btn-sm" id="clear">${icon('restart_alt')} Borrar firma</button></div></div></div>
      <p class="muted" id="linkinfo" ${how === 'link' ? '' : 'hidden'}>Se abrirá el menú para compartir (WhatsApp, SMS, correo…). El cliente ve las fotos en su móvil y firma. Te avisaremos cuando firme.</p>
      <p class="form-error" id="err" role="alert" hidden></p>`,
    footer: `<button class="btn btn-primary btn-lg" id="go"></button>`,
    dirty: () => sig?.inked() && !saved,
    mount(v, f) {
      wireView(v);
      const label = () => { $('#go', f).innerHTML = how === 'link' ? `${icon('send_to_mobile')} ${s ? 'Enviar enlace otra vez' : 'Crear y enviar enlace'}` : `${icon('gesture')} Firmar y guardar`; };
      label();
      sig = signaturePad($('#sig', v));
      on(v, '#clear', 'click', sig.fit);
      on(v, 'input[name=how]', 'change', (e, el) => { how = el.value; $('#here', v).hidden = how !== 'here'; $('#linkinfo', v).hidden = how !== 'link'; label(); if (how === 'here') sig.fit(); });
      const what = 'the photos of the condition of your property before we start';
      on(v, '#resend', 'click', () => shareSignLink(store.job(id), store.job(id).conditionSign, what));
      on(f, '#go', 'click', () => {
        const cur = store.job(id);
        if (how === 'link') {
          if (cur.conditionSign?.signCode) return shareSignLink(cur, cur.conditionSign, what);
          const signCode = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 32);
          store.signCondition(id, { remote: true, signCode, customerName: cur.personName || '' });
          shareSignLink(cur, { signCode }, what); // straight from the tap, so iPhone allows the share sheet
          if (!store.sync.reachable) toast('Sin conexión: el enlace funcionará en cuanto llegue al servidor', 'bad');
          saved = true; location.replace(back);
          return;
        }
        const customerName = $('#cname', v).value.trim(), err = $('#err', v);
        const miss = !customerName ? 'Escribe el nombre del cliente.' : !sig.inked() ? 'Falta la firma del cliente.' : '';
        if (miss) { err.hidden = false; err.textContent = miss; return; }
        store.signCondition(id, { customerName, signature: sig.png() });
        saved = true;
        toast(store.sync.reachable ? 'Firmado y guardado' : 'Firma guardada — se enviará cuando tengas conexión');
        location.replace(back);
      });
    },
  };
}

export const ROUTES = [
  [/^\/quotes$/, list],
  [/^\/quotes\/new$/, () => quoteForm(null)],
  [/^\/quotes\/([^/]+)$/, detail],
  [/^\/quotes\/([^/]+)\/edit$/, (id) => quoteForm(id)],
  [/^\/quotes\/([^/]+)\/condition$/, condition],
  [/^\/quotes\/([^/]+)\/sign$/, sign],
  [/^\/jobs\/([^/]+)\/condition$/, condition],
  [/^\/jobs\/([^/]+)\/condition\/sign$/, sign],
];
