/**
 * The Collision-triggered Teleporter census and Yellow Yawning's way back (js/collision-teleporters.js, register G681).
 * Run: node --test tests/collision-teleporters.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHIM_SHIRI_TSID, TELEPORTER_CENSUS, WIRED_TELEPORTERS, YELLOW_YAWNING_TSID, collisionTeleportersOn } from '../public/js/collision-teleporters.js?v=b1214a65';
import { inTeleporter } from '../public/js/hidden-floors.js?v=732a2610';
import { STREET_TRAPS } from '../public/js/street-traps-data.js?v=b2911c49';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const dump = join(spike, '../streets/mnt/stos/location_data');
const street = (tsid) => JSON.parse(readFileSync(join(pub, 'assets/streets', `${tsid}.json`), 'utf8'));
const index = JSON.parse(readFileSync(join(pub, 'assets/streets/index.json'), 'utf8')).streets;
/** The walkable floor under a street x (the highest line there), or null. */
const floorAt = (s, x) => {
  const ys = s.platforms
    .filter((p) => p.pc_perm !== 1 && p.pc_perm !== null && Math.min(p.x1, p.x2) <= x && Math.max(p.x1, p.x2) >= x)
    .map((p) => p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / ((p.x2 - p.x1) || 1));
  return ys.length ? Math.min(...ys) : null;
};

describe('G681: every Collision-triggered Teleporter is accounted for', () => {
  it('the census is the location files\' list, street by street, with their counts', { skip: !existsSync(dump) && 'locations dump not beside this worktree' }, () => {
    const found = {};
    for (const f of readdirSync(dump)) {
      if (!/^L.*\.xml$/.test(f)) continue;
      const n = (readFileSync(join(dump, f), 'utf8').match(/label="Collision-triggered Teleporter"/g) || []).length;
      if (n) found[`G${f.slice(1, -4)}`] = n;
    }
    assert.equal(Object.keys(found).length, 35);
    assert.deepEqual(Object.fromEntries(TELEPORTER_CENSUS.map((r) => [r.tsid, r.count])), found);
  });

  it('each row says what it is, and a wired row names a module that exists', () => {
    for (const r of TELEPORTER_CENSUS) {
      assert.ok(['wired', 'here', 'stand-in', 'inert'].includes(r.state), r.label);
      assert.ok(r.note.length > 20, r.label);
      assert.ok(!/—/.test(r.note), `${r.label}: no em-dash`);
      for (const m of r.note.matchAll(/js\/[\w/-]+\.js/g)) assert.ok(existsSync(join(pub, m[0])), `${r.label}: ${m[0]}`);
      if (r.state === 'here') assert.ok(collisionTeleportersOn(r.tsid).length, `${r.label} wired here`);
    }
    const by = (state) => TELEPORTER_CENSUS.filter((r) => r.state === state).length;
    assert.deepEqual([by('wired'), by('stand-in'), by('here'), by('inert')], [19, 3, 1, 12]);
  });

  it('no inert one sits on a street a plain jump can get stuck on', () => {
    for (const r of TELEPORTER_CENSUS.filter((x) => x.state === 'inert')) assert.ok(!STREET_TRAPS[r.tsid], r.label);
  });
});

describe("G681: Yellow Yawning's end goes back to Shim Shiri", () => {
  const yy = street(YELLOW_YAWNING_TSID);
  const [row] = WIRED_TELEPORTERS;
  const sx = (x) => x - yy.bounds.l;
  const sy = (y) => y - yy.bounds.t;

  it('its Shim Shiri post is buried under the passage floor, its Hazy Gate 3 post is not', () => {
    const post = yy.signposts.find((p) => p.connects.some((c) => c.label === 'Shim Shiri'));
    const floor = floorAt(yy, post.x);
    assert.ok(post.y - floor > 150, `post ${post.y} under floor ${floor}`);
    const left = yy.signposts.find((p) => p.connects.some((c) => c.label === 'Hazy Gate 3'));
    assert.ok(Math.abs(left.y - floorAt(yy, left.x)) < 20);
    assert.deepEqual({ ...row.arrive }, post.connects.find((c) => c.label === 'Shim Shiri').arrive);
  });

  it('the box stands on the passage floor in front of the post, out to the street\'s end', () => {
    assert.equal(row.from, YELLOW_YAWNING_TSID);
    assert.equal(row.to, SHIM_SHIRI_TSID);
    assert.ok(index[SHIM_SHIRI_TSID]);
    const post = yy.signposts.find((p) => p.connects.some((c) => c.label === 'Shim Shiri'));
    for (const x of [2870, post.x, 2995]) assert.ok(inTeleporter(row, sx(x), sy(floorAt(yy, x))), `feet at ${x}`);
    assert.ok(row.box.x + row.box.w / 2 >= sx(yy.bounds.r));
    // Shim Shiri's yellow beam lands you at (2269, -345), well clear of it.
    assert.ok(!inTeleporter(row, sx(2269), sy(-345)));
    assert.ok(!inTeleporter(row, sx(2700), sy(floorAt(yy, 2700))));
  });

  it('the hidden-floors feature runs it with the other teleporters', () => {
    const src = readFileSync(join(pub, 'js/features/hidden-floors-feature.js'), 'utf8');
    assert.match(src, /\.\.\.collisionTeleportersOn\(street\.tsid\)/);
    assert.deepEqual(collisionTeleportersOn('LA9UIKNQ7LD3SN0').map((r) => r.id), ['yellow_yawning_to_shim_shiri']);
    assert.deepEqual(collisionTeleportersOn(SHIM_SHIRI_TSID), []);
  });
});
