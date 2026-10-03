// The branded LCC property condition / completion report — same layout as the
// Flutter app's pdf_service.dart. Photos come in as Buffers keyed "<room>|before|after".
import PDFDocument from 'pdfkit';
import { PHOTO_ROOMS, MATERIAL_AREAS, address } from './jobs.mjs';

export const COMPANY = 'LCC Bathrooms & Services Ltd';
const CYAN = '#00838f', GREY = '#616161', LINE = '#bdbdbd';

const day = (d) => new Date(d || Date.now()).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric' });
const qty = (q) => (Number(q) % 1 === 0 ? String(Math.trunc(q)) : String(q));

export function reportPdf(job, images) {
  const doc = new PDFDocument({ size: 'A4', margin: 32, info: { Title: `LCC Report ${job.id}`, Author: COMPANY } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const left = doc.page.margins.left, width = doc.page.width - left - doc.page.margins.right;
  const ensure = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#000').text(COMPANY.toUpperCase(), { align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor(GREY).text('Since 2024', { align: 'center' });
  doc.moveDown(0.3).font('Helvetica-Bold').fontSize(13).fillColor(CYAN).text('PROPERTY CONDITION / COMPLETION REPORT', { align: 'center' });
  doc.moveDown(0.8).font('Helvetica').fontSize(11).fillColor('#000');
  doc.text(`Job ID: ${job.id}`).text(`Date: ${day(job.reportGeneratedAt)}`).text(`Property: ${address(job)}`);
  if (job.personName) doc.text(`Person in charge: ${job.personName} (${job.personPhone || ''})`);
  if (job.assignedTo) doc.text(`Completed by: ${job.assignedTo}`);
  doc.moveDown(1);

  const section = (title) => {
    ensure(40);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(CYAN).text(title, left);
    doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.moveDown(0.6).fillColor('#000');
  };

  section('Materials');
  const areas = MATERIAL_AREAS.filter((a) => job.materials?.[a]?.length);
  if (!areas.length) doc.font('Helvetica').fontSize(10).text('No materials recorded for this job.');
  for (const area of areas) {
    ensure(30);
    doc.font('Helvetica-Bold').fontSize(11).text(area, left);
    for (const m of job.materials[area]) {
      const spec = m.specification ? ` - ${m.specification}` : '';
      doc.font('Helvetica').fontSize(9).text(`${m.description}${spec} - ${qty(m.quantity)} ${m.unit} (${m.status})`, left + 10, doc.y, { width: width - 10 });
    }
    doc.moveDown(0.4);
  }
  doc.moveDown(0.6);

  section('Before & After Comparison');
  const cellW = 220, cellH = 120, gap = 16;
  const cell = (img, x, y, label) => {
    doc.rect(x, y, cellW, cellH).strokeColor(LINE).lineWidth(1).stroke();
    if (img) {
      doc.save().rect(x, y, cellW, cellH).clip();
      try { doc.image(img, x, y, { cover: [cellW, cellH], align: 'center', valign: 'center' }); } catch { /* unreadable image: leave the empty box */ }
      doc.restore();
    } else doc.font('Helvetica').fontSize(9).fillColor('#9e9e9e').text('No photo', x, y + cellH / 2 - 5, { width: cellW, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#000').text(label, x, y + cellH + 4, { width: cellW, align: 'center' });
  };
  PHOTO_ROOMS.forEach((room, i) => {
    ensure(cellH + 50);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(`${i + 1}. ${room}`, left, doc.y + 6);
    const y = doc.y + 4;
    cell(images[`${room}|before`], left, y, 'Before');
    cell(images[`${room}|after`], left + cellW + gap, y, 'After');
    doc.x = left; doc.y = y + cellH + 20;
  });

  doc.end();
  return done;
}

export const pdfFilename = (job) => `lcc-report-${job.id}.pdf`;
