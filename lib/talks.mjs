// Toolbox talks / refresher training. Workers read a talk in Spanish and sign it; the sign-off sheet PDF is English.
// Built-in talks (ids TB-01…) are loaded once as drafts — nothing reaches workers until an admin publishes one.
// A published talk has rounds: publishing (or the automatic refresher every refreshMonths) starts a new round,
// and everyone signs again. Signatures live in talk_signs (talk_id, email, round).

export const DEFAULT_REFRESH = 12; // months; 0 = never repeats
export const DUE_DAYS = 14; // default time to sign

import { LIBRARY_TEXT } from './talks-library.mjs';
export const LIBRARY = Object.entries(LIBRARY_TEXT).map(([id, { es, en }]) => ({ id, title: es.title, body: es.body, titleEn: en.title, bodyEn: en.body, refreshMonths: DEFAULT_REFRESH, builtin: true }));

const bad = (status, message) => Object.assign(new Error(message), { status });
const text = (v, max) => String(v ?? '').trim().slice(0, max);
/** Fields an admin may set on a talk. */
export function cleanTalk(b, partial = false) {
  const out = {};
  if (!partial || 'title' in b) { out.title = text(b.title, 140); if (!out.title) throw bad(400, 'Falta el título'); }
  if (!partial || 'body' in b) { out.body = text(b.body, 8000); if (!out.body) throw bad(400, 'Falta el texto de la charla'); }
  if (!partial || 'refreshMonths' in b) {
    const m = Number(b.refreshMonths ?? DEFAULT_REFRESH);
    if (!Number.isInteger(m) || m < 0 || m > 60) throw bad(400, 'Repetición no válida');
    out.refreshMonths = m;
  }
  return out;
}
/** When a published talk is due for its refresher round (null = never). */
export function refreshAt(talk) {
  if (!talk.round || !talk.refreshMonths || !talk.publishedAt) return null;
  const d = new Date(talk.publishedAt);
  d.setMonth(d.getMonth() + talk.refreshMonths);
  return d;
}
export const dueIn = (days = DUE_DAYS) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert')).strict;
  assert.equal(LIBRARY.length, 10);
  assert.ok(LIBRARY.every((x) => x.title && x.body && x.titleEn && x.bodyEn));
  assert.throws(() => cleanTalk({ title: '', body: 'x' }));
  assert.equal(cleanTalk({ title: 'a', body: 'b' }).refreshMonths, 12);
  assert.deepEqual(cleanTalk({ refreshMonths: 0 }, true), { refreshMonths: 0 });
  assert.equal(refreshAt({ round: 1, refreshMonths: 12, publishedAt: '2026-01-15T10:00:00Z' }).toISOString().slice(0, 7), '2027-01');
  assert.equal(refreshAt({ round: 0, refreshMonths: 12, publishedAt: null }), null);
  console.log('talks ok');
}
