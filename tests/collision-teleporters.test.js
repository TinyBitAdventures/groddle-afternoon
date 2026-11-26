/**
 * The Collision-triggered Teleporter census, Yellow Yawning's way back and the Vortex of Random's back doors
 * (js/collision-teleporters.js, register G620, G681; reports #707, #708).
 * Run: node --test tests/collision-teleporters.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AINT_THAT_DRY_TSID, CHITI_TIGA_TSID, HARRISA_HARA_TSID, SHIM_SHIRI_TSID, SNOWED_IN_TSID, TELEPORTER_CENSUS, WIRED_TELEPORTERS, YELLOW_YAWNING_TSID, collisionTeleportersOn } from '../public/js/collision-teleporters.js?v=73c97f41';
import { SNOWED_IN_TSID as REBUILT_SNOWED_IN_TSID } from '../public/js/rebuilt-rooms.js?v=5ef5618f';
import { reachStreet } from '../public/js/builder/reach-graph.js?v=467ca20f';
import { inTeleporter } from '../public/js/hidden-floors.js?v=18714dfa';
import { STREET_TRAPS } from '../public/js/street-traps-data.js?v=f6eb19ad';

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
    assert.deepEqual([by('wired'), by('stand-in'), by('here'), by('inert')], [19, 3, 5, 8]);
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

describe("#707 #708: the Vortex of Random's back doors (Ain't That Dry, Chiti Tiga, Harrisa Hara, Snowed In)", () => {
  // [id, from, to]: Austin 2026-11-26, all four legs.
  const LEGS = [
    ['aint_that_dry_to_chiti_tiga', AINT_THAT_DRY_TSID, CHITI_TIGA_TSID],
    ['chiti_tiga_to_aint_that_dry', CHITI_TIGA_TSID, AINT_THAT_DRY_TSID],
    ['harrisa_hara_to_snowed_in', HARRISA_HARA_TSID, SNOWED_IN_TSID],
    ['snowed_in_to_harrisa_hara', SNOWED_IN_TSID, HARRISA_HARA_TSID],
  ];
  const leg = (id) => WIRED_TELEPORTERS.find((r) => r.id === id);
  /** The street's beam: its Teleporter_Base deco (world, bottom-centre), in screen space. */
  const beamOf = (s) => {
    const d = s.layers.flatMap((l) => (l.name === 'middleground' ? l.decos || [] : [])).find((x) => x.sprite === 'Teleporter_Base');
    return { x: d.x - s.bounds.l };
  };
  const lowestFloorAt = (s, x) => Math.max(...s.platforms
    .filter((p) => p.pc_perm !== 1 && p.pc_perm !== null && Math.min(p.x1, p.x2) <= x && Math.max(p.x1, p.x2) >= x)
    .map((p) => p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / ((p.x2 - p.x1) || 1)));

  it('Snowed In is the rebuilt room off Abbasid River', () => {
    assert.equal(SNOWED_IN_TSID, REBUILT_SNOWED_IN_TSID);
  });

  for (const [id, from, to] of LEGS) {
    describe(id, () => {
      const row = leg(id);
      const src = street(from);
      const dst = street(to);

      it('is wired from its street to its partner, and runs on that street', () => {
        assert.ok(row, `${id} wired`);
        assert.equal(row.from, from);
        assert.equal(row.to, to);
        assert.ok(index[from] && index[to]);
        assert.ok(collisionTeleportersOn(from).some((r) => r.id === id));
        assert.ok(WIRED_TELEPORTERS.some((r) => r.from === to && r.to === from), 'the partner beam leads back');
      });

      it('walking into its beam triggers it: the box covers the floor under the beam', () => {
        const beam = beamOf(src);
        assert.ok(Math.abs(row.box.x - beam.x) <= 5, `box ${row.box.x} at the beam ${beam.x}`);
        for (const dx of [-row.box.w / 2 + 2, -25, 0, 25, row.box.w / 2 - 2]) {
          const sx = row.box.x + dx;
          const wx = sx + src.bounds.l;
          assert.ok(inTeleporter(row, sx, floorAt(src, wx) - src.bounds.t), `feet on the floor at world ${wx}`);
        }
        // On a ledge, the ground floor under it does not teleport.
        const low = lowestFloorAt(src, beam.x + src.bounds.l);
        if (low - floorAt(src, beam.x + src.bounds.l) > 60) assert.ok(!inTeleporter(row, beam.x, low - src.bounds.t), 'not from the floor under the ledge');
      });

      it('lands on a floor line beside the partner beam, clear of its box, and walks to the exits', () => {
        const wx = row.arrive.x + dst.bounds.l;
        const floor = floorAt(dst, wx);
        assert.ok(floor !== null, `a floor under world ${wx}`);
        assert.ok(Math.abs(row.arrive.y - (floor - dst.bounds.t)) <= 2, `arrive y ${row.arrive.y} on the floor ${floor - dst.bounds.t}`);
        for (const back of collisionTeleportersOn(to)) assert.ok(!inTeleporter(back, row.arrive.x, row.arrive.y), `clear of ${back.id}`);
        const d = Math.abs(row.arrive.x - beamOf(dst).x);
        assert.ok(d > 0 && d <= 200, `beside the partner beam (${d} px)`);
        const r = reachStreet(dst, [{ x: row.arrive.x, y: row.arrive.y, from: id }]);
        assert.ok(r.arrivals[0].stands, 'stands where it lands');
        for (const t of r.targets) assert.ok(t.reached, `${t.label} reached on foot`);
      });
    });
  }
});
