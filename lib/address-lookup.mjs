// Postcode → address lookup for the quote form (GET /api/address-lookup). Free and self-hosted: the data is a file built
// from OpenStreetMap by scripts/import-addresses.sh (Greater London only, ODbL), kept out of the jobs database.
// A provider is just `{ lookup(postcode) → results[] }`, so another source can replace this one without touching the
// endpoint or the form. Every result is a real record from the source — nothing is invented here.
import { readFileSync, statSync } from 'node:fs';

const PC_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;
export const MAX_RESULTS = 100;
export const ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

/** "w52nu " → "W5 2NU"; null when it isn't a full UK postcode. */
export function normPostcode(s) {
  const c = String(s ?? '').toUpperCase().replace(/\s+/g, '');
  return c.length <= 7 && PC_RE.test(c) ? `${c.slice(0, -3)} ${c.slice(-3)}` : null;
}

/** The TSV made by scripts/import-addresses.py (sorted by postcode), indexed in memory as postcode → byte range.
 *  ~21 MB for London; re-read when the file changes (checked at most once a minute), so a refresh needs no restart. */
export function osmFileProvider(path) {
  let buf = null, index = new Map(), mtime = 0, checked = 0;
  function load() {
    if (Date.now() - checked < 60_000 && buf) return;
    checked = Date.now();
    let st;
    try { st = statSync(path); } catch { buf = null; return; }
    if (st.mtimeMs === mtime && buf) return;
    const b = readFileSync(path), idx = new Map();
    for (let start = 0; start < b.length;) {
      let end = b.indexOf(10, start); if (end < 0) end = b.length;
      const pc = b.toString('latin1', start, b.indexOf(9, start));
      const r = idx.get(pc);
      if (r) r[1] = end; else idx.set(pc, [start, end]);
      start = end + 1;
    }
    buf = b; index = idx; mtime = st.mtimeMs;
  }
  return {
    lookup(postcode) {
      load();
      if (!buf) throw Object.assign(new Error('La búsqueda de direcciones no está disponible ahora — escribe la dirección a mano.'), { status: 503 });
      const r = index.get(postcode);
      if (!r) return [];
      return buf.toString('utf8', r[0], r[1]).split('\n').map((line) => {
        const [pc, addressLine1, street, town, uprn, flats, inferred] = line.split('\t');
        return { addressLine1, street, town, postcode: pc, uprn: uprn || null, flats: flats || null, postcodeInferred: inferred === '1', source: 'openstreetmap' };
      });
    },
  };
}

/** What the endpoint returns: validated postcode, de-duplicated and capped results from the provider. */
export function lookupAddresses(provider, raw) {
  const postcode = normPostcode(raw);
  if (!postcode) throw Object.assign(new Error('Código postal no válido — p. ej. W5 2NU'), { status: 400 });
  const seen = new Set();
  const results = provider.lookup(postcode).filter((a) => {
    const k = `${a.addressLine1}|${a.street}`.toLowerCase();
    return !seen.has(k) && seen.add(k);
  });
  return { postcode, results: results.slice(0, MAX_RESULTS), truncated: results.length > MAX_RESULTS, attribution: ATTRIBUTION };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert')).strict;
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  // postcode rules
  assert.equal(normPostcode(' w52nu '), 'W5 2NU');
  assert.equal(normPostcode('SW1A 1AA'), 'SW1A 1AA');
  assert.equal(normPostcode('ec1a1bb'), 'EC1A 1BB');
  for (const bad of ['', 'W5', 'W5 2N', '12345', 'W5 2NUU', 'W5\t2NU;drop', '../etc/passwd', 'Q', null]) assert.equal(normPostcode(bad), null, String(bad));
  // fixture file (test data only — never the real one)
  const dir = mkdtempSync(join(tmpdir(), 'addr-')), file = join(dir, 'fixture.tsv');
  writeFileSync(file, [
    'AA1 1AA\t1\tTest Road\tTesttown\t100000000001\t\t0',
    'ZZ9 9ZZ\tFlat 1, Fixture House, 2\tSample Street\tExampleton\t\t\t0',
    'ZZ9 9ZZ\tFlat 2, Fixture House, 2\tSample Street\tExampleton\t\t\t0',
    'ZZ9 9ZZ\tFlat 2, Fixture House, 2\tSample Street\tExampleton\t\t\t1', // duplicate
    'ZZ9 9ZZ\tFixture Court\tSample Street\tExampleton\t\t1-12\t1',
  ].join('\n'));
  const p = osmFileProvider(file);
  const one = lookupAddresses(p, 'aa11aa');
  assert.deepEqual(one.results, [{ addressLine1: '1', street: 'Test Road', town: 'Testtown', postcode: 'AA1 1AA', uprn: '100000000001', flats: null, postcodeInferred: false, source: 'openstreetmap' }]);
  const many = lookupAddresses(p, 'ZZ9 9ZZ');
  assert.deepEqual(many.results.map((a) => a.addressLine1), ['Flat 1, Fixture House, 2', 'Flat 2, Fixture House, 2', 'Fixture Court'], 'flats listed, duplicate dropped');
  assert.equal(many.results[2].flats, '1-12'); assert.ok(many.results[2].postcodeInferred);
  assert.equal(many.attribution, ATTRIBUTION);
  assert.deepEqual(lookupAddresses(p, 'BB2 2BB').results, [], 'valid postcode, nothing there');
  assert.throws(() => lookupAddresses(p, 'not a postcode'), { status: 400 });
  // a big postcode is capped
  writeFileSync(file, Array.from({ length: 150 }, (_, i) => `CC3 3CC\t${i + 1}\tLong Road\tT\t\t\t0`).join('\n'));
  const big = lookupAddresses(osmFileProvider(file), 'CC3 3CC');
  assert.equal(big.results.length, MAX_RESULTS); assert.ok(big.truncated);
  // provider down (no data file) → 503, so the form falls back to typing the address
  assert.throws(() => lookupAddresses(osmFileProvider(join(dir, 'missing.tsv')), 'AA1 1AA'), { status: 503 });
  rmSync(dir, { recursive: true });
  console.log('address lookup ok');
}
