// The branded LCC property condition / completion report (pdfkit). Stays in English.
// Photos (spot photos and problem photos) come in as Buffers keyed by their photo path.
import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { address, roomsOf, photosOf, materialList, displayStatus } from './jobs.mjs';

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

// opts: { materials, problems } — false leaves that section (and its summary tile) out of the PDF
export function reportPdf(job, images, opts = {}) {
  const show = { materials: opts.materials !== false, problems: opts.problems !== false };
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 56, left: 44, right: 44 }, bufferPages: true, info: { Title: `LCC Report ${job.id} — ${address(job)}`, Author: COMPANY } });
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
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEAL).text('PROPERTY CONDITION & COMPLETION REPORT', hx, 40, { width: hw, align: 'right', characterSpacing: 1.2 });
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(address(job) || job.id, hx, 58, { width: hw, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${job.id}  ·  ${day(job.reportGeneratedAt || job.submittedAt || Date.now())}`, hx, doc.y + 4, { width: hw, align: 'right' });
  doc.y = Math.max(doc.y, 138) + 14;

  // ── details card ──
  const details = [
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
  const rooms = roomsOf(job), mats = materialList(job), problems = job.problems || [];
  const count = (t) => rooms.reduce((n, r) => n + photosOf(job, r, t).length, 0);
  const tiles = [['Photo spots', rooms.length], ['Before photos', count('before')], ['After photos', count('after')],
    ...(show.materials ? [['Materials', mats.length]] : []), ...(show.problems ? [['Problems', problems.length]] : [])];
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
      const h = Math.max(hasPhoto ? 104 : 0, doc.heightOfString(p.description || '', { width: tw2 }) + 54);
      ensure(h + 10);
      const y = doc.y;
      doc.roundedRect(left, y, width, h, 10).lineWidth(0.75).strokeColor(LINE).stroke();
      doc.rect(left, y + 10, 3, h - 20).fill(RED);
      let x = left + 16 + pill(String(p.category).toUpperCase(), left + 16, y + 12, ['#fef3f2', RED]) + 6;
      if (p.area) pill(String(p.area).toUpperCase(), x, y + 12, [SOFT, MUTED]);
      doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(p.description || '', left + 16, y + 32, { width: tw2 });
      doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(`${p.createdBy || ''}${p.createdAt ? `  ·  ${stamp(p.createdAt)}` : ''}`, left + 16, y + h - 18, { width: tw2 });
      if (hasPhoto) photo(p.photoPath, left + width - 130, y + 10, 120, h - 20);
      doc.x = left; doc.y = y + h + 10;
    }
  }

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

export const pdfFilename = (job) => `LCC-Report-${job.id}.pdf`;
