// The branded LCC property condition / completion report (pdfkit). Stays in English: what workers wrote is shown
// through en() (the English copy, see translate.mjs), and a signed text exactly as the client signed it.
// Photos (spot photos and problem photos) come in as Buffers keyed by their photo path.
import PDFDocument from 'pdfkit';
import { en } from './translate.mjs';
import { readFileSync } from 'node:fs';
import { address, roomsOf, photosOf, materialList, displayStatus, CHANGE_DECLARATION, CONDITION_DECLARATION, money } from './jobs.mjs';

export const COMPANY = 'LCC Bathrooms & Services Ltd';
const LOGO = readFileSync(new URL('../public/img/logo.png', import.meta.url)); // official artwork, white background
const INK = '#0f1f24', MUTED = '#5b6b70', FAINT = '#9aa8ac', LINE = '#dfe6e8', SOFT = '#f4f8f9';
const TEAL = '#00838f', SKY = '#5ab8cf'; // app brand + the logo's blue
const RED = '#b42318', GREEN = '#067647';
const PILL = { 'To Order': ['#fef3f2', RED], Ordered: ['#fffaeb', '#b54708'], Received: ['#eff8ff', '#175cd3'], Installed: ['#ecfdf3', GREEN] };

const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const stamp = (d) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const qty = (q) => (Number(q) % 1 === 0 ? String(Math.trunc(q)) : String(q));
const isImage = (b) => b && b.length > 4 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50));

// opts: { materials, problems, changes } — false leaves that section (and its summary tile) out of the PDF
// A quote (kind 'quote') gets its own layout: client, proposed work + price, and the signed condition photos.
export function reportPdf(job, images, opts = {}) {
  const quote = job.kind === 'quote', cond = job.condition || [];
  const show = { materials: opts.materials !== false, problems: opts.problems !== false, changes: opts.changes !== false };
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 56, left: 44, right: 44 }, bufferPages: true, info: { Title: `LCC ${quote ? 'Quote' : 'Report'} ${job.id} — ${address(job) || job.personName || ''}`, Author: COMPANY } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const W = doc.page.width, left = doc.page.margins.left, width = W - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };

  // running header on every page after the first
  doc.on('pageAdded', () => {
    doc.image(LOGO, left, 20, { height: 30 });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(address(job), left + 40, 26, { width: width - 160, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(job.id, left, 26, { width, align: 'right' });
    doc.moveTo(left, 58).lineTo(left + width, 58).strokeColor(LINE).lineWidth(0.75).stroke();
    doc.x = left; doc.y = 74;
  });

  // ── cover header ──
  doc.rect(0, 0, W, 6).fill(TEAL);
  doc.rect(W * 0.62, 0, W * 0.38, 6).fill(SKY);
  doc.image(LOGO, left - 6, 26, { height: 104 });
  const hx = left + 120, hw = width - 120;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEAL).text(quote ? 'QUOTE & PROPERTY CONDITION REPORT' : 'PROPERTY CONDITION & COMPLETION REPORT', hx, 40, { width: hw, align: 'right', characterSpacing: 1.2 });
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(quote ? job.personName || job.id : address(job) || job.id, hx, 58, { width: hw, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${job.id}  ·  ${day(quote ? job.createdAt : job.reportGeneratedAt || job.submittedAt || Date.now())}`, hx, doc.y + 4, { width: hw, align: 'right' });
  doc.y = Math.max(doc.y, 138) + 14;

  // ── details card ──
  const contact = [job.personPhone, job.personEmail].filter(Boolean).join(' · ');
  const details = quote ? [
    ['Client', job.personName || '—'], ['Quote ID', job.id],
    ['Property', address(job) || '—'], ['Date', day(job.createdAt)],
    ['Contact', contact || '—'], ['Prepared by', job.createdBy || '—'],
  ] : [
    ['Property', address(job) || '—'], ['Job ID', job.id],
    ['Completed by', job.assignedTo || '—'], ['Status', displayStatus(job)],
    ['Contact', job.personName ? `${job.personName}${job.personPhone ? ` · ${job.personPhone}` : ''}` : '—'], ['Report date', day(job.reportGeneratedAt || job.submittedAt || Date.now())],
  ];
  const colW = (width - 40) / 2, rowH = 34, cardY = doc.y;
  const cardH = Math.ceil(details.length / 2) * rowH + 16;
  doc.roundedRect(left, cardY, width, cardH, 10).fill(SOFT);
  details.forEach(([k, v], i) => {
    const x = left + 16 + (i % 2) * (colW + 8), y = cardY + 12 + Math.floor(i / 2) * rowH;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(FAINT).text(k.toUpperCase(), x, y, { width: colW, characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(v, x, y + 11, { width: colW, lineBreak: false, ellipsis: true });
  });
  doc.y = cardY + cardH + 14;

  // ── summary tiles ──
  const rooms = roomsOf(job), mats = materialList(job).map((m) => ({ ...m, description: en(m, 'description'), specification: en(m, 'specification') })), problems = job.problems || [], changes = job.changes || [];
  const count = (t) => rooms.reduce((n, r) => n + photosOf(job, r, t).length, 0);
  const signedTile = ['Client signature', job.conditionSign?.signedAt ? 'Signed' : job.conditionSign ? 'Pending' : '—'];
  const tiles = quote ? [['Condition photos', cond.length], ['Quoted price', money(job.price) || '—'], signedTile] : [['Photo spots', rooms.length], ['Before photos', count('before')], ['After photos', count('after')],
    ...(show.materials ? [['Materials', mats.length]] : []), ...(show.problems ? [['Problems', problems.length]] : []), ...(show.changes ? [['Changes', changes.length]] : [])];
  const tg = 8, tw = (width - tg * (tiles.length - 1)) / tiles.length, ty = doc.y;
  tiles.forEach(([k, v], i) => {
    const x = left + i * (tw + tg);
    doc.roundedRect(x, ty, tw, 52, 8).lineWidth(0.75).strokeColor(LINE).stroke();
    doc.font('Helvetica-Bold').fontSize(18).fillColor(k === 'Problems' && v ? RED : INK).text(String(v), x, ty + 10, { width: tw, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(k.toUpperCase(), x, ty + 33, { width: tw, align: 'center', characterSpacing: 0.6 });
  });
  doc.x = left; doc.y = ty + 52 + 26;

  const section = (title, sub = '') => {
    ensure(70);
    const y = doc.y;
    doc.rect(left, y + 1, 3, 13).fill(SKY);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(title, left + 11, y, { continued: !!sub });
    if (sub) doc.font('Helvetica').fontSize(10).fillColor(FAINT).text(`  ${sub}`);
    doc.moveTo(left, doc.y + 6).lineTo(left + width, doc.y + 6).strokeColor(LINE).lineWidth(0.75).stroke();
    doc.x = left; doc.y += 16;
  };
  const pill = (text, x, y, [bg, fg], size = 7) => {
    doc.font('Helvetica-Bold').fontSize(size);
    const w = doc.widthOfString(text, { characterSpacing: 0.5 }) + 12;
    doc.roundedRect(x, y, w, size + 7, (size + 7) / 2).fill(bg);
    doc.fillColor(fg).text(text, x + 6, y + 3.5, { lineBreak: false, characterSpacing: 0.5 });
    return w;
  };
  const photo = (path, x, y, w, h) => {
    const img = images[path];
    if (img && isImage(img)) {
      doc.save().roundedRect(x, y, w, h, 8).clip();
      try { doc.image(img, x, y, { cover: [w, h], align: 'center', valign: 'center' }); } catch { /* unreadable: leave blank */ }
      doc.restore();
      return true;
    }
    doc.roundedRect(x, y, w, h, 8).fill(SOFT);
    doc.font('Helvetica').fontSize(9).fillColor(FAINT).text('No photo', x, y + h / 2 - 5, { width: w, align: 'center' });
    return false;
  };

  // signature line under a declaration: the image (or "awaiting"), the name, when / how / by whom
  const time = (d) => `${day(d)}, ${new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`;
  const SIGN_H = 64;
  const signArea = (c, x, y, w) => {
    const sig = Buffer.from(String(c.signature || '').split(',')[1] || '', 'base64');
    if (isImage(sig)) doc.image(sig, x, y, { fit: [180, 56] });
    else doc.font('Helvetica-Bold').fontSize(9).fillColor(RED).text('AWAITING CUSTOMER SIGNATURE', x, y + 40, { width: 200 });
    doc.moveTo(x, y + 60).lineTo(x + 200, y + 60).strokeColor(FAINT).lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(c.customerName || '', x + 220, y + 26, { width: w - 220 });
    const who = c.witnessedBy || c.sentBy || c.createdBy || '';
    const by = !c.signedAt ? `Sent for signature by ${who}  ·  ${time(c.sentAt || c.createdAt)}`
      : c.signedVia === 'link' ? `Signed remotely via secure link ${time(c.signedAt)}${c.signedIp ? `  ·  IP ${c.signedIp}` : ''}  ·  sent by ${who}`
      : `Signed ${time(c.signedAt)}  ·  witnessed by ${who}`;
    doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(by, x + 220, doc.y + 2, { width: w - 220 });
  };

  // ── property condition: photos (with where + note) the client signed before any work ──
  const conditionSection = () => {
    section(quote ? 'Property condition' : 'Property condition before work', `${cond.length} photo${cond.length === 1 ? '' : 's'}${job.fromQuote ? `  ·  from quote ${job.fromQuote}` : ''}`);
    if (!cond.length) { doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No condition photos taken yet.', left); doc.y += 24; return; }
    const g = 12, w2 = (width - g) / 2, h2 = w2 * 0.7;
    for (let i = 0; i < cond.length; i += 2) {
      const pair = cond.slice(i, i + 2);
      doc.font('Helvetica').fontSize(8.5);
      const note = (p) => job.conditionSign?.signedNotes?.[p.id] ?? en(p, 'note');
      const textH = Math.max(...pair.map((p) => (note(p) ? doc.heightOfString(note(p), { width: w2 }) + 4 : 0)));
      ensure(h2 + textH + 22);
      const y = doc.y;
      pair.forEach((p, k) => {
        const x = left + k * (w2 + g);
        if (photo(p.path, x, y, w2, h2) && p.area) pill(String(p.area).toUpperCase(), x + 8, y + 8, ['#fff', INK]);
        if (note(p)) doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(note(p), x, y + h2 + 5, { width: w2 });
        doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(`${i + k + 1}  ·  ${stamp(p.at)}${p.by ? `  ·  ${p.by}` : ''}`, x, y + h2 + 5 + textH, { width: w2 });
      });
      doc.x = left; doc.y = y + h2 + textH + 22;
    }
    const c = job.conditionSign;
    if (c) {
      doc.font('Helvetica-Oblique').fontSize(8.5);
      const dh = doc.heightOfString(CONDITION_DECLARATION, { width: width - 32 });
      const h = 16 + dh + 10 + SIGN_H + 12;
      ensure(h + 10);
      const y = doc.y;
      doc.roundedRect(left, y, width, h, 10).lineWidth(0.75).strokeColor(LINE).stroke();
      doc.rect(left, y + 10, 3, h - 20).fill(TEAL);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(CONDITION_DECLARATION, left + 16, y + 14, { width: width - 32 });
      if (c.photoIds && c.photoIds.length !== cond.length) doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(`Signed for photos 1–${c.photoIds.length}.`, left + 16, doc.y + 2);
      signArea(c, left + 16, y + 16 + dh + 10, width - 32);
      doc.x = left; doc.y = y + h + 10;
    }
    doc.y += 14;
  };

  if (quote) {
    section('Proposed work');
    doc.font('Helvetica').fontSize(10).fillColor(job.work ? INK : MUTED).text(en(job, 'work') || 'No description of the work yet.', left, doc.y, { width });
    if (job.price != null) {
      doc.y += 10;
      doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(`Quoted price: ${money(job.price)}`, left, doc.y, { width });
    }
    doc.y += 24;
    conditionSection();
  } else {
  if (cond.length || job.conditionSign) conditionSection();

  // ── before & after ──
  section('Before & After', `${rooms.length} spot${rooms.length === 1 ? '' : 's'}`);
  if (!rooms.length) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No photo spots on this job.', left);
  const gap = 12, cw = (width - gap) / 2, ch = cw * 0.62;
  rooms.forEach((room, i) => {
    // row n pairs the n-th before photo with the n-th after photo
    const b = photosOf(job, room, 'before'), a = photosOf(job, room, 'after');
    const rows = Math.max(1, b.length, a.length);
    for (let n = 0; n < rows; n++) {
      ensure(ch + (n ? 26 : 50));
      if (!n) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(SKY).text(String(i + 1).padStart(2, '0'), left, doc.y, { continued: true })
          .fillColor(INK).fontSize(11).text(`   ${room}`, { continued: rows > 1 })
          .font('Helvetica').fontSize(9).fillColor(FAINT).text(rows > 1 ? `   ${rows} pairs` : '');
        doc.y += 6;
      }
      const y = doc.y;
      [[b[n], 'BEFORE', ['#fff', RED]], [a[n], 'AFTER', ['#fff', GREEN]]].forEach(([p, label, colors], k) => {
        const x = left + k * (cw + gap);
        if (!p && n) return; // extra rows: an empty side stays blank
        if (photo(p?.path, x, y, cw, ch)) pill(rows > 1 ? `${label} ${n + 1}` : label, x + 8, y + 8, colors);
        const when = stamp(p?.at);
        if (when) doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(when, x, y + ch + 4, { width: cw });
      });
      doc.x = left; doc.y = y + ch + 20;
    }
    doc.y += 6;
  });

  // ── materials ──
  if (show.materials) {
    doc.y += 4;
    section('Materials', `${mats.length} item${mats.length === 1 ? '' : 's'}`);
    if (!mats.length) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No materials recorded for this job.', left);
    else {
      const cols = [['Item', 0, width * 0.46], ['Area', width * 0.46, width * 0.2], ['Qty', width * 0.66, width * 0.14], ['Status', width * 0.8, width * 0.2]];
      const head = () => {
        const y = doc.y;
        doc.rect(left, y, width, 20).fill(INK);
        cols.forEach(([c, x, w]) => doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#fff').text(c.toUpperCase(), left + x + 8, y + 7, { width: w - 16, characterSpacing: 0.6 }));
        doc.y = y + 20;
      };
      head();
      mats.forEach((m, i) => {
        const text = m.specification ? `${m.description}\n${m.specification}` : m.description;
        doc.font('Helvetica').fontSize(9);
        const h = Math.max(24, doc.heightOfString(text, { width: cols[0][2] - 16 }) + 12);
        if (doc.y + h > bottom()) { doc.addPage(); head(); }
        const y = doc.y;
        if (i % 2) doc.rect(left, y, width, h).fill(SOFT);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(m.description, left + 8, y + 7, { width: cols[0][2] - 16 });
        if (m.specification) doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(m.specification, { width: cols[0][2] - 16 });
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(m.area, left + cols[1][1] + 8, y + 7, { width: cols[1][2] - 16 });
        doc.fillColor(INK).text(`${qty(m.quantity)} ${m.unit}`, left + cols[2][1] + 8, y + 7, { width: cols[2][2] - 16 });
        pill(String(m.status).toUpperCase(), left + cols[3][1] + 8, y + 6, PILL[m.status] || [SOFT, MUTED]);
        doc.x = left; doc.y = y + h;
      });
      doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(LINE).lineWidth(0.75).stroke();
    }
    doc.y += 24;
  }

  // ── problems ──
  if (show.problems) {
    section('Problems reported', `${problems.length}`);
    if (!problems.length) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No problems were reported on this job.', left);
    for (const p of problems) {
      const hasPhoto = p.photoPath && isImage(images[p.photoPath]);
      const tw2 = width - 32 - (hasPhoto ? 130 : 0);
      doc.font('Helvetica').fontSize(9.5);
      const h = Math.max(hasPhoto ? 104 : 0, doc.heightOfString(en(p, 'description'), { width: tw2 }) + 54);
      ensure(h + 10);
      const y = doc.y;
      doc.roundedRect(left, y, width, h, 10).lineWidth(0.75).strokeColor(LINE).stroke();
      doc.rect(left, y + 10, 3, h - 20).fill(RED);
      let x = left + 16 + pill(String(p.category).toUpperCase(), left + 16, y + 12, ['#fef3f2', RED]) + 6;
      if (p.area) pill(String(p.area).toUpperCase(), x, y + 12, [SOFT, MUTED]);
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(en(p, 'description'), left + 16, y + 32, { width: tw2 });
      doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(`${p.createdBy || ''}${p.createdAt ? `  ·  ${stamp(p.createdAt)}` : ''}`, left + 16, y + h - 18, { width: tw2 });
      if (hasPhoto) photo(p.photoPath, left + width - 130, y + 10, 120, h - 20);
      doc.x = left; doc.y = y + h + 10;
    }
    doc.y += 14;
  }

  // ── customer change requests (signed) ──
  if (show.changes) {
    section('Customer change requests', `${changes.length}`);
    if (!changes.length) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('The customer did not request any changes to the agreed work.', left);
    for (const c of changes) {
      const tw2 = width - 32;
      doc.font('Helvetica').fontSize(9.5);
      const text = c.signedDescription ?? en(c, 'description');
      const dh = doc.heightOfString(text, { width: tw2 });
      doc.font('Helvetica-Oblique').fontSize(8);
      const declH = doc.heightOfString(CHANGE_DECLARATION, { width: tw2 });
      const h = 40 + dh + 10 + declH + 72;
      ensure(h + 10);
      const y = doc.y;
      doc.roundedRect(left, y, width, h, 10).lineWidth(0.75).strokeColor(LINE).stroke();
      doc.rect(left, y + 10, 3, h - 20).fill(TEAL);
      pill(c.type === 'Remove' ? 'REMOVE' : 'ADD', left + 16, y + 12, c.type === 'Remove' ? ['#fef3f2', RED] : ['#ecfdf3', GREEN]);
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(text, left + 16, y + 32, { width: tw2 });
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text(CHANGE_DECLARATION, left + 16, doc.y + 8, { width: tw2 });
      signArea(c, left + 16, doc.y + 8, tw2);
      doc.x = left; doc.y = y + h + 10;
    }
  }

  } // end of the job-only sections

  // ── footer on every page ──
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const fy = doc.page.height - 36;
    doc.page.margins.bottom = 0; // writing inside the bottom margin must not add a page
    doc.moveTo(left, fy - 8).lineTo(left + width, fy - 8).strokeColor(LINE).lineWidth(0.75).stroke();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text(COMPANY, left, fy, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(`${job.id}  ·  Page ${i + 1} of ${range.count}`, left, fy, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

export const pdfFilename = (job) => `LCC-${job.kind === 'quote' ? 'Quote' : 'Report'}-${job.id}.pdf`;
