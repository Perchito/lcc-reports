// Workers often write in Spanish; every client reads English. Free text that clients see (change requests, condition
// notes, the quoted work, problems, materials) gets an English copy next to it: `<field>En` plus `<field>EnOf` = the text
// it was made from, so an edit makes it stale. Translation runs through the Claude Code CLI on this box (Luis's
// subscription, same as fc-crm), Haiku model, ~5 s per text.
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

/** English version of a worker's text (unchanged if it is already English); null when translation is unavailable. */
export async function toEnglish(text) {
  text = String(text || '').trim();
  if (!text) return '';
  if (cache.has(text)) return cache.get(text);
  await slot();
  try {
    const prompt = `You translate notes written by workers of a UK bathroom renovation company for their English-speaking customers.
Translate the text inside <text> into natural British English. If it is already English, return it unchanged (fix nothing).
Keep numbers, measurements, names and line breaks. Reply with ONLY the translated text — no quotes, no notes.

<text>
${text}
</text>`;
    const out = await new Promise((resolve, reject) => {
      const p = execFile(BIN, ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--setting-sources', 'user'],
        { cwd: WORKDIR, timeout: 90_000, maxBuffer: 4 << 20 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
      p.stdin.end();
    });
    const r = JSON.parse(out);
    if (r.is_error || typeof r.result !== 'string' || !r.result.trim()) throw new Error(r.result || 'empty');
    const en = r.result.trim().replace(/^<text>\s*|\s*<\/text>$/g, '');
    cache.set(text, en);
    return en;
  } catch (e) {
    console.warn('[translate] failed:', String(e.message).slice(0, 200));
    return null;
  } finally { free(); }
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
  console.log('translate ok');
  if (process.argv[2]) console.log(await toEnglish(process.argv[2]));
}
