"""Build the London address file for the quote form's postcode lookup (served by lib/address-lookup.mjs).

Input:  an OpenStreetMap extract (.osm.pbf), e.g. Geofabrik's greater-london-latest.osm.pbf, which is already cut to the
        Greater London boundary. Data (c) OpenStreetMap contributors, ODbL.
Output: a TSV sorted by postcode, one real OSM address per line:
        postcode  houseNumber  street  town  uprn  flats  inferred
        `inferred` = 1 when OSM had no postcode on that object and it was taken from the two nearest addresses on the
        same street (both within 60 m, both the same postcode). Nothing else is made up: no flats are expanded, no UPRN
        is guessed, a missing town is only filled from other OSM addresses with the same postcode.

Usage: python3 import-addresses.py <in.osm.pbf> <out.tsv>     (needs `pip install osmium`; scripts/import-addresses.sh does it all)
"""
import collections, math, os, re, sys
import osmium

PC_RE = re.compile(r'^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$')
UPRN_RE = re.compile(r'^[0-9]{1,12}$')


def postcode(raw):
    c = re.sub(r'\s+', '', raw or '').upper()
    return f'{c[:-3]} {c[-3:]}' if PC_RE.match(c) else ''


def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()[:120]


rows = []


class Row:  # __slots__: ~600k of these, dicts would need ~2x the RAM
    __slots__ = ('pc', 'line1', 'street', 'town', 'uprn', 'flats', 'inferred', 'lat', 'lon')

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


class Reader(osmium.SimpleHandler):
    def add(self, t, lat, lon):
        number, name = clean(t.get('addr:housenumber')), clean(t.get('addr:housename'))
        street = clean(t.get('addr:street') or t.get('addr:place'))
        if not (number or name) or not street:
            return
        unit = clean(t.get('addr:unit'))
        parts = [unit, name, number]
        parts = [p for i, p in enumerate(parts) if p and p not in parts[:i]]  # "Unit B, Unit B" → once
        uprn = clean(t.get('ref:GB:uprn'))
        rows.append(Row(
            pc=postcode(t.get('addr:postcode')), line1=', '.join(parts), street=sys.intern(street),
            town=sys.intern(clean(t.get('addr:city'))), uprn=uprn if UPRN_RE.match(uprn) else '',
            flats=clean(t.get('addr:flats'))[:40], inferred=0, lat=lat, lon=lon))

    def node(self, n):
        if 'addr:housenumber' in n.tags or 'addr:housename' in n.tags:
            self.add(n.tags, n.location.lat, n.location.lon)

    def way(self, w):
        if not ('addr:housenumber' in w.tags or 'addr:housename' in w.tags):
            return
        try:
            pts = [(n.lat, n.lon) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if pts:
            self.add(w.tags, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def metres(a, b):  # equirectangular is plenty at 60 m in London
    return math.hypot((a.lat - b.lat) * 111_200, (a.lon - b.lon) * 111_200 * math.cos(math.radians(a.lat)))


def infer_postcodes():
    by_street = collections.defaultdict(list)
    for r in rows:
        if r.pc:
            by_street[r.street.lower()].append(r)
    n = 0
    for r in rows:
        if r.pc:
            continue
        near = sorted((metres(r, o), o.pc) for o in by_street.get(r.street.lower(), ()))[:2]
        if len(near) == 2 and near[1][0] <= 60 and near[0][1] == near[1][1]:
            r.pc, r.inferred = near[0][1], 1
            n += 1
    return n


def fill_towns():
    towns = collections.defaultdict(collections.Counter)
    for r in rows:
        if r.pc and r.town:
            towns[r.pc][r.town] += 1
    for r in rows:
        if r.pc and not r.town and towns[r.pc]:
            r.town = towns[r.pc].most_common(1)[0][0]


def natural(s):
    return [int(x) if x.isdigit() else x for x in re.split(r'(\d+)', s.lower())]


def main(src, out):
    Reader().apply_file(src, locations=True, idx=f'sparse_file_array,{out}.nodes')  # node index on disk: low RAM
    os.remove(f'{out}.nodes')
    total = len(rows)
    inferred = infer_postcodes()
    fill_towns()
    seen, kept = set(), []
    # tagged postcodes first so a duplicate keeps the real one; a node + building with the same address count once
    for r in sorted((r for r in rows if r.pc), key=lambda r: r.inferred):
        key = (r.pc, r.line1.lower(), r.street.lower())
        if key in seen:
            continue
        seen.add(key)
        kept.append(r)
    kept.sort(key=lambda r: (r.pc, r.street.lower(), natural(r.line1)))
    with open(out, 'w', encoding='utf-8') as f:
        for r in kept:
            f.write('\t'.join([r.pc, r.line1, r.street, r.town, r.uprn, r.flats, str(r.inferred)]) + '\n')
    print(f'{total} OSM addresses, {inferred} postcodes inferred from neighbours, {len(kept)} written '
          f'({len({r.pc for r in kept})} postcodes) -> {out}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
