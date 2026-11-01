/**
 * Mada Tamaha's pit (player report 2026-11-01, ticket 21: "stuck after you drop
 * down", even with spinach). The street's geometry is Tiny Speck's own (the
 * same 42 lines and 8 walls as GA524M0OMOE2OGT.xml, no ladders): a 375 px
 * drop into a closed pit no jump climbs out of. The original got you out
 * with Collision-triggered Teleporters (four on the street, LA524M0OMOE2OGT.xml;
 * items/teleporter.js 55-77), whose instances were never archived; footage
 * (1qsoo4vYM74 2:44) shows the right end of the pit floor putting you on the
 * floor above (js/hell.js NARAKA_TELEPORTERS). The level builder's reach
 * check (105 px jump) proves the pit is a trap without them and that every
 * exit is reachable from every arrival with them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=3602d09e';
import { MADA_TAMAHA_TSID, NARAKA_TELEPORTERS, narakaTeleportersOn } from '../public/js/hell.js?v=eb2a5cc4';
import { inTeleporter } from '../public/js/hidden-floors.js?v=5ce87a04';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${MADA_TAMAHA_TSID}.json`), 'utf8'));
const xmlDir = join(spike, '../streets/mnt/stos/location_data');
const game = readFileSync(join(spike, 'public/js/features/hidden-floors-feature.js'), 'utf8');

/** Shipped arrivals: Ratna Vitteha's and Valuka Himsa's arms into Mada Tamaha. */
function arrivals() {
  const out = [];
  for (const tsid of ['GA5Q57C99OE2GNU', 'GA5S44RM9OE2416']) {
    const s = JSON.parse(readFileSync(join(spike, 'public/assets/streets', `${tsid}.json`), 'utf8'));
    for (const post of s.signposts) for (const c of post.connects || []) if (c.tsid?.slice(1) === MADA_TAMAHA_TSID.slice(1)) out.push({ ...c.arrive, from: `${tsid}/${post.id}` });
  }
  return out;
}

/** Whether a reach run stands anywhere inside a teleporter's box. */
const reachesBox = (r, row) => r.surfaces.some((s) => s.reached && [[s.x1, s.y1], [s.x2, s.y2], [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2]].some(([x, y]) => inTeleporter(row, x, y)));

describe('Mada Tamaha: the pit and its way out', () => {
  const arr = arrivals();
  const posts = street.signposts.map((p) => p.id);

  it('the arrivals are the two signposts\' arms', () => {
    assert.equal(arr.length, 2);
  });

  it('the shipped geometry is the original\'s: no ladders, no doors, and four teleporters on the street', { skip: !existsSync(xmlDir) && 'locations dump not beside this worktree' }, () => {
    const geo = readFileSync(join(xmlDir, `${MADA_TAMAHA_TSID}.xml`), 'utf8');
    assert.match(geo, /<object id="ladders">\s*<\/object>/);
    assert.match(geo, /<object id="doors">\s*<\/object>/);
    assert.equal((geo.match(/<object id="plat_\d+">/g) || []).length, street.platforms.length);
    const items = readFileSync(join(xmlDir, `L${MADA_TAMAHA_TSID.slice(1)}.xml`), 'utf8');
    assert.equal(new Set(items.match(/tsid="\w+" label="Collision-triggered Teleporter"/g)).size, 4);
  });

  it('without the teleporters the pit is a trap and neither exit is reachable from the other side (the report)', () => {
    const r = reachStreet(street, arr);
    assert.ok(r.traps.some((t) => t.line === 'plat_1318991020499'), 'the pit floor');
    for (const t of r.targets) assert.ok(t.reachedFrom.some((x) => !x), `${t.id} is cut off from one arrival`);
  });

  it('with them every exit is reached from every arrival, through the pit', () => {
    const rows = narakaTeleportersOn(MADA_TAMAHA_TSID);
    assert.equal(rows.length, 2);
    // Places you can be: each arrival, and each teleporter's landing once its box is reached.
    const runs = new Map();
    const run = (p) => {
      const key = `${p.x},${p.y}`;
      if (!runs.has(key)) runs.set(key, reachStreet(street, [{ ...p, from: key }]));
      return runs.get(key);
    };
    for (const a of arr) {
      const seen = new Set();
      const todo = [a];
      const exits = new Set();
      while (todo.length) {
        const p = todo.pop();
        const r = run(p);
        assert.ok(r.arrivals[0].stands, `${p.x}, ${p.y} stands on a floor`);
        for (const t of r.targets) if (t.reachedFrom[0]) exits.add(t.id);
        for (const row of rows) {
          if (seen.has(row.id) || !reachesBox(r, row)) continue;
          seen.add(row.id);
          todo.push(row.arrive);
        }
      }
      assert.deepEqual([...exits].sort(), [...posts].sort(), `from ${a.from}`);
      assert.deepEqual([...seen].sort(), ['mada_pit_left', 'mada_pit_right'], `${a.from} falls into the pit and walks to both ends`);
    }
  });

  it('each landing is clear of every teleporter box (no bounce back)', () => {
    for (const row of NARAKA_TELEPORTERS) for (const other of NARAKA_TELEPORTERS) assert.equal(inTeleporter(other, row.arrive.x, row.arrive.y), false, `${row.id} lands in ${other.id}`);
  });

  it('the feature moves you on the same street with no travel gate, Modern and Classic alike (no UI)', () => {
    assert.match(game, /boxes = \[\.\.\.teleportersOn\(street\.tsid\), \.\.\.narakaTeleportersOn\(street\.tsid\)[,\]]/);
    const fn = game.slice(game.indexOf('async function teleport('));
    assert.ok(fn.indexOf('if (row.same)') < fn.indexOf('engine.travelGate('), 'in-street first, before the travel gate');
  });
});
