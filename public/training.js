// Toolbox talks / refresher training (lib/talks.mjs on the server).
// Workers: read, tick "He leído y entendido", sign. Admins: publish talks (built-in library or their own),
// see who has signed, the sign-off sheet PDF and each worker's record. Needs signal (not in the offline outbox).
import { esc, icon, on, $, toast, empty, fmtDate, signaturePad, saveFiles, confirmSheet } from './ui.js?v=__V__';
import * as store from './store.js?v=__V__';

const enc = encodeURIComponent;
const today = () => new Date().toLocaleDateString('en-CA');
const dueText = (due) => (due ? fmtDate(`${due}T12:00:00`) : '');
const overdue = (t) => !t.mySignedAt && t.due && t.due < today();
const bodyHtml = (text) => {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  let html = '', list = false;
  for (const l of lines) {
    const bullet = /^[-•]/.test(l);
    if (bullet && !list) { html += '<ul class="talk-list">'; list = true; }
    if (!bullet && list) { html += '</ul>'; list = false; }
    html += bullet ? `<li>${esc(l.replace(/^[-•]\s*/, ''))}</li>` : `<p>${esc(l)}</p>`;
  }
  return html + (list ? '</ul>' : '');
};
const refreshText = (m) => (m ? `Se repite cada ${m} mes${m === 1 ? '' : 'es'}` : 'No se repite');

// ── list ────────────────────────────────────────────────
async function list(q, me) {
  const talks = await store.api('/api/talks');
  const admin = me.role === 'admin';
  if (!admin) {
    const pending = talks.filter((t) => !t.mySignedAt), done = talks.filter((t) => t.mySignedAt);
    const row = (t) => `<a class="card safety-card" href="#/training/${esc(t.id)}"><div class="row-between"><b>${esc(t.title)}</b>
      ${t.mySignedAt ? `<span class="pill-ok">${icon('task_alt')} Firmada</span>` : overdue(t) ? `<span class="pill-bad">${icon('schedule')} Vencida</span>` : `<span class="pill-warn">${icon('draw')} Por firmar</span>`}</div>
      <p class="small muted">${t.mySignedAt ? `Firmada el ${fmtDate(t.mySignedAt)}` : `Fírmala antes del ${dueText(t.due)}`}</p></a>`;
    return {
      title: 'Formación', back: '#/more',
      body: `<p class="lead">Charlas de seguridad (toolbox talks). Léelas y fírmalas antes de la fecha.</p>
        ${pending.length ? `<h3 class="section-title">Por firmar</h3><div class="card-list">${pending.map(row).join('')}</div>` : `<div class="card">${empty('task_alt', 'Todo al día', 'No tienes ninguna formación pendiente.')}</div>`}
        ${done.length ? `<h3 class="section-title">Firmadas</h3><div class="card-list">${done.map(row).join('')}</div>` : ''}`,
    };
  }
  const live = talks.filter((t) => t.round), drafts = talks.filter((t) => !t.round);
  const row = (t) => `<a class="card safety-card" href="#/training/${esc(t.id)}"><div class="row-between"><b>${esc(t.title)}</b>
    ${t.round ? `<span class="${t.signed >= t.total ? 'pill-ok' : t.due < today() ? 'pill-bad' : 'pill-warn'}">${t.signed}/${t.total} firmadas</span>` : '<span class="pill-warn">Borrador</span>'}</div>
    <p class="small muted">${t.round ? `Ronda ${t.round} · fecha límite ${dueText(t.due)} · ${refreshText(t.refreshMonths)}` : `${t.builtin ? 'De la biblioteca' : 'Creada por el administrador'} · sin publicar`}</p></a>`;
  return {
    title: 'Formación', back: '#/more', side: 'training',
    body: `<p class="lead">Charlas de seguridad para el equipo. Al publicar una, todos los empleados la reciben y deben firmarla.</p>
      <h3 class="section-title">Publicadas</h3>${live.length ? `<div class="card-list">${live.map(row).join('')}</div>` : '<p class="muted">Aún no has publicado ninguna. Empieza por una de la biblioteca.</p>'}
      ${drafts.length ? `<h3 class="section-title">Biblioteca y borradores</h3><div class="card-list">${drafts.map(row).join('')}</div>` : ''}`,
    footer: `<a class="btn btn-primary btn-lg" href="#/training/new">${icon('add')} Nueva charla</a>`,
  };
}

// ── one talk ────────────────────────────────────────────
async function talk(id, q, me) {
  const t = await store.api(`/api/talks/${enc(id)}`);
  return me.role === 'admin' ? adminTalk(t) : workerTalk(t, me);
}
function workerTalk(t, me) {
  const head = `<section class="card info-card"><h2 class="talk-title">${esc(t.title)}</h2><div class="talk-body">${bodyHtml(t.body)}</div></section>`;
  if (t.mySignedAt) return { title: 'Formación', back: '#/training', body: `${head}<p class="notice">${icon('task_alt')}<span>Firmada el ${fmtDate(t.mySignedAt)}. ¡Gracias!</span></p>` };
  let sig;
  return {
    title: 'Formación', back: '#/training',
    body: `${head}
      ${overdue(t) ? `<p class="notice bad">${icon('schedule')}<span>La fecha límite era el ${dueText(t.due)}. Fírmala ya.</span></p>` : `<p class="small muted">Fírmala antes del ${dueText(t.due)}.</p>`}
      <label class="list-card list-row switch-row" style="margin:16px 0"><span class="grow"><b>He leído y entendido esta charla</b></span>
        <input type="checkbox" role="switch" id="read"><span class="switch" aria-hidden="true"></span></label>
      <section class="form-section"><h3 class="section-title">Tu firma</h3>
        <div class="sig-wrap"><canvas id="sig" class="sig-pad" aria-label="Firma aquí con el dedo"></canvas><button type="button" class="btn btn-text btn-sm" id="clear">${icon('ink_eraser')} Borrar firma</button></div></section>
      <p class="form-error" id="err" role="alert" hidden></p>`,
    footer: `<button class="btn btn-primary btn-lg" id="sign">${icon('gesture')} Firmar</button>`,
    dirty: () => sig?.inked(),
    mount(v, f) {
      sig = signaturePad($('#sig', v));
      on(v, '#clear', 'click', sig.fit);
      on(f, '#sign', 'click', async (e, b) => {
        const err = $('#err', v);
        const msg = !$('#read', v).checked ? 'Confirma que la has leído y entendido.' : !sig.inked() ? 'Falta tu firma.' : '';
        if (msg) { err.hidden = false; err.textContent = msg; return; }
        b.disabled = true;
        try {
          await store.api(`/api/talks/${enc(t.id)}/sign`, { method: 'POST', body: { read: true, signature: sig.png() } });
          sig = null; store.refreshTalks(); toast('Formación firmada');
          location.replace('#/training');
        } catch (ex) { err.hidden = false; err.textContent = ex.offline ? 'Sin conexión — fírmala cuando tengas cobertura.' : ex.message; b.disabled = false; }
      });
    },
  };
}
function adminTalk(t) {
  const signed = t.roster.filter((r) => r.signedAt), pending = t.roster.filter((r) => !r.signedAt);
  const person = (r) => `<div class="check ${r.signedAt ? 'ok' : 'todo'}">${icon(r.signedAt ? 'check_circle' : 'schedule')}<span><b>${esc(r.name)}</b><small>${r.signedAt ? `Firmada el ${fmtDate(r.signedAt)}` : 'Sin firmar'}</small></span></div>`;
  return {
    title: 'Formación', back: '#/training',
    body: `<section class="card info-card"><h2 class="talk-title">${esc(t.title)}</h2>
        <p class="small muted">${t.id} · ${refreshText(t.refreshMonths)}${t.round ? ` · ronda ${t.round}, publicada el ${fmtDate(t.publishedAt)}, fecha límite ${dueText(t.due)}` : ' · borrador'}</p>
        <div class="talk-body">${bodyHtml(t.body)}</div>
        <a class="btn btn-text btn-sm" href="#/training/${esc(t.id)}/edit">${icon('edit')} Editar</a></section>
      ${t.round ? `<h3 class="section-title">Firmas · ${signed.length}/${t.roster.length}</h3>
        <section class="card list-card">${[...pending, ...signed].map(person).join('') || '<p class="muted" style="padding:14px">Aún no hay empleados.</p>'}</section>
        <button class="btn btn-secondary" id="pdf" style="margin-top:12px">${icon('picture_as_pdf')} Hoja de firmas (PDF)</button>` : ''}
      <section class="form-section" style="margin-top:20px"><h3 class="section-title">${t.round ? 'Pedir firma otra vez' : 'Publicar'}</h3>
        <p class="small muted" style="margin-bottom:10px">${t.round ? 'Empieza una ronda nueva: todos los empleados la tienen que volver a firmar.' : 'Todos los empleados la recibirán (con aviso) y deberán firmarla antes de la fecha.'}</p>
        <label class="field"><span>Fecha límite</span><input type="date" id="due" value="${new Date(Date.now() + 14 * 864e5).toLocaleDateString('en-CA')}" min="${today()}"></label></section>`,
    footer: `<button class="btn btn-primary btn-lg" id="publish">${icon('campaign')} ${t.round ? 'Nueva ronda de firmas' : 'Publicar a todos'}</button>`,
    mount(v, f) {
      on(f, '#publish', 'click', async (e, b) => {
        if (!(await confirmSheet({ title: t.round ? '¿Pedir firma otra vez?' : '¿Publicar esta charla?', text: 'Todos los empleados recibirán un aviso y tendrán que firmarla.', ok: t.round ? 'Nueva ronda' : 'Publicar' }))) return;
        b.disabled = true;
        try { await store.api(`/api/talks/${enc(t.id)}/publish`, { method: 'POST', body: { due: $('#due', v).value } }); toast('Publicada'); window.dispatchEvent(new Event('lcc:redraw')); }
        catch (ex) { toast(ex.message, 'bad'); b.disabled = false; }
      });
      on(v, '#pdf', 'click', async (e, b) => {
        b.disabled = true;
        try {
          const res = await fetch(`/api/talks/${enc(t.id)}/pdf`).catch(() => null);
          if (!res) throw new Error('Sin conexión');
          if (!res.ok) throw new Error('No se pudo generar la hoja');
          const name = `LCC-Formacion-${t.id}-ronda${t.round}.pdf`;
          await saveFiles([new File([await res.blob()], name, { type: 'application/pdf' })], { title: 'PDF listo', hint: `${name}. Toca Guardar y elige “Guardar en Archivos”.` });
        } catch (ex) { toast(ex.message, 'bad'); } finally { b.disabled = false; }
      });
    },
  };
}

// ── new / edit (admin) ──────────────────────────────────
async function edit(id) {
  const t = id ? await store.api(`/api/talks/${enc(id)}`) : { title: '', body: '', refreshMonths: 12 };
  return {
    title: id ? 'Editar charla' : 'Nueva charla', back: id ? `#/training/${enc(id)}` : '#/training',
    body: `<form id="f" novalidate>
      <label class="field"><span>Título</span><input id="title" value="${esc(t.title)}" maxlength="140" placeholder="p. ej. Uso seguro de la radial"></label>
      <label class="field"><span>Texto de la charla</span><textarea id="body" rows="12" placeholder="Escribe la charla. Empieza una línea con “- ” para hacer una lista.">${esc(t.body)}</textarea></label>
      <label class="field"><span>Repetir (refresco)</span><select id="refresh">${[[0, 'No se repite'], [6, 'Cada 6 meses'], [12, 'Cada 12 meses'], [24, 'Cada 24 meses']].map(([m, l]) => `<option value="${m}" ${Number(t.refreshMonths) === m ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${id && t.builtin ? '<p class="small muted">Si cambias el texto, la hoja de firmas en inglés se traducirá automáticamente.</p>' : ''}
      <p class="form-error" id="err" role="alert" hidden></p></form>`,
    footer: `<button class="btn btn-primary btn-lg" id="save">${icon('save')} Guardar</button>`,
    mount(v, f) {
      on(f, '#save', 'click', async (e, b) => {
        const body = { title: $('#title', v).value, body: $('#body', v).value, refreshMonths: Number($('#refresh', v).value) };
        if (id) { if (body.title === t.title) delete body.title; if (body.body === t.body) delete body.body; }
        b.disabled = true;
        try {
          const saved = await store.api(id ? `/api/talks/${enc(id)}` : '/api/talks', { method: id ? 'PATCH' : 'POST', body });
          toast('Guardada'); location.replace(`#/training/${enc(saved.id)}`);
        } catch (ex) { const err = $('#err', v); err.hidden = false; err.textContent = ex.offline ? 'Sin conexión' : ex.message; b.disabled = false; }
      });
    },
  };
}

// ── one worker's training record (admin, from Equipo) ──
async function record(email) {
  const [rows, users] = await Promise.all([store.api(`/api/training?email=${enc(email)}`), store.api('/api/users')]);
  const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  return {
    title: 'Formación', back: '#/team',
    body: `<p class="lead"><b>${esc(u?.name || email)}</b> · ${esc(email)}</p>
      ${rows.length ? `<section class="card list-card">${rows.map((r) => `<a class="check ok" href="#/training/${esc(r.talkId)}" style="text-decoration:none;color:inherit">${icon('task_alt')}<span><b>${esc(r.title)}</b><small>Ronda ${r.round} · firmada el ${fmtDate(r.signedAt)}${r.current ? '' : ' · hay una ronda más nueva'}</small></span></a>`).join('')}</section>`
        : empty('school', 'Sin formación firmada', 'Las charlas que firme aparecerán aquí.')}`,
  };
}

export const ROUTES = [
  [/^\/training$/, list],
  [/^\/training\/new$/, () => edit(null), 'admin'],
  [/^\/training\/person\/(.+)$/, record, 'admin'],
  [/^\/training\/([^/]+)\/edit$/, edit, 'admin'],
  [/^\/training\/([^/]+)$/, talk],
];
