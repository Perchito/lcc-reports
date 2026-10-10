// Workers often write in Spanish; every client reads English. Free text that clients see (change requests, condition
// notes, the quoted work, problems, materials) gets an English copy next to it: `<field>En` plus `<field>EnOf` = the text
// it was made from, so an edit makes it stale. Translation runs through the Claude Code CLI on this box (Luis's
// subscription, same as fc-crm), Haiku model, ~5 s per call.
import { execFile } from 'node:child_process';
import { mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { en, needsEnglish } from './jobs.mjs';

const BIN = process.env.CLAUDE_BIN || join(homedir(), '.local/bin/claude');
// run from a folder only this account can write (never /tmp: anyone could plant a .claude/settings.json with hooks there)
const WORKDIR = join(homedir(), '.lcc-translate');
mkdirSync(WORKDIR, { recursive: true, mode: 0o700 }); chmodSync(WORKDIR, 0o700);
const cache = new Map(); // source text -> English
let running = 0;
const waiting = [];
const slot = () => (running < 2 ? (running++, Promise.resolve()) : new Promise((r) => waiting.push(r)).then(() => { running++; }));
const free = () => { running--; waiting.shift()?.(); };

// Lean on tokens: Claude Code's own system prompt (~6.5k tokens) is replaced by one line, thinking is off, every text a
// job needs goes in ONE call as a JSON array, and text that is plainly English never reaches the model.
const SYSTEM = 'Translator. The user sends a JSON array of notes written by Spanish-speaking workers of a UK bathroom company. Return a JSON array of the same length with each note translated into natural British English (bath, basin, tap, skirting board). Notes already in English stay as they are. Keep numbers, sizes, names and line breaks. Output only the JSON array.';
const ES_HINT = /[ñáéíóú¿¡]|\b(el|la|los|las|del|al|una|unos|unas|y|que|con|para|por|en|es|está|están|hay|muy|pero|se|lo|su|sus|de|este|esta|poner|quitar|baño|cocina|puerta|pared|techo|suelo)\b/i;
const EN_HINT = /\b(the|a|an|of|on|in|to|and|with|is|are|for|by|at|from|near|next|above|below|has|have|no|not)\b/i;
/** Plainly English (English words, nothing Spanish): no need to ask the model. */
export const looksEnglish = (t) => EN_HINT.test(t) && !ES_HINT.test(t);

/** English versions of several texts in one model call: Map(text -> English); texts that failed are left out. */
export async function toEnglishMany(texts) {
  const out = new Map(), ask = [];
  for (const raw of new Set(texts.map((t) => String(t || '').trim()).filter(Boolean))) {
    if (cache.has(raw)) out.set(raw, cache.get(raw));
    else if (looksEnglish(raw)) { cache.set(raw, raw); out.set(raw, raw); }
    else ask.push(raw);
  }
  for (let i = 0; i < ask.length; i += 25) { // keep each call small
    const batch = ask.slice(i, i + 25);
    await slot();
    try {
      const stdout = await new Promise((resolve, reject) => {
        const p = execFile(BIN, ['-p', `Translate to English: ${JSON.stringify(batch)}`, '--system-prompt', SYSTEM, '--model', 'haiku', '--effort', 'low', '--output-format', 'json',
          '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--setting-sources', 'user'],
          { cwd: WORKDIR, timeout: 90_000, maxBuffer: 4 << 20, env: { ...process.env, MAX_THINKING_TOKENS: '0' } }, (err, so) => (err ? reject(err) : resolve(so)));
        p.stdin.end();
      });
      const r = JSON.parse(stdout);
      if (r.is_error || typeof r.result !== 'string') throw new Error(r.result || 'no result');
      const list = JSON.parse(r.result.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (!Array.isArray(list) || list.length !== batch.length) throw new Error('reply did not match the texts sent');
      batch.forEach((t, k) => { const e = String(list[k] ?? '').trim(); if (e) { cache.set(t, e); out.set(t, e); } });
    } catch (e) {
      console.warn('[translate] failed:', String(e.message).slice(0, 200));
    } finally { free(); }
  }
  return out;
}
/** English version of one text (unchanged if already English); null when translation is unavailable. */
export async function toEnglish(text) {
  text = String(text || '').trim();
  if (!text) return '';
  return (await toEnglishMany([text])).get(text) ?? null;
}

// every translatable text in a job: [object, field]
export function textsOf(job) {
  const mats = Object.values(job.materials || {}).flat();
  return [
    [job, 'work'],
    ...(job.changes || []).map((c) => [c, 'description']),
    ...(job.condition || []).map((p) => [p, 'note']),
    ...(job.problems || []).map((p) => [p, 'description']),
    ...mats.flatMap((m) => [[m, 'description'], [m, 'specification']]),
  ].filter(([o, f]) => String(o[f] || '').trim());
}
export { en, needsEnglish } from './jobs.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert')).strict;
  const j = { work: 'Pintar', changes: [{ description: 'Quitar puerta', descriptionEn: 'Remove door', descriptionEnOf: 'Quitar puerta' }], condition: [{ note: '' }], materials: { Kitchen: [{ description: 'Azulejos', specification: '' }] } };
  assert.deepEqual(textsOf(j).map(([, f]) => f), ['work', 'description', 'description']);
  assert.equal(en(j.changes[0], 'description'), 'Remove door');
  assert.equal(needsEnglish(j.changes[0], 'description'), false);
  j.changes[0].description = 'Quitar dos puertas';
  assert.equal(en(j.changes[0], 'description'), 'Quitar dos puertas'); // stale translation is not shown
  assert.ok(needsEnglish(j.changes[0], 'description'));
  assert.ok(looksEnglish('Scratch on the door')); assert.ok(!looksEnglish('Poner una balda extra encima del lavabo'));
  assert.ok(!looksEnglish('Azulejo roto')); assert.ok(!looksEnglish('Mancha en el techo')); assert.ok(!looksEnglish('Tiles'));
  console.log('translate ok');
  if (process.argv[2]) console.log(await toEnglishMany(process.argv.slice(2)));
}
