/**
 * LEVEL BUILDER P7 (spec 7.3 PHY-001 and PHY-009, 8.2 arrivals --posts and set): signposts and the
 * floor under them (js/builder/posts.js). Moving a floor used to leave its signpost floating and
 * the finding named the arrival; now the finding names the post, `arrivals --posts` (and the
 * editor's "Stand it on the floor") stands it on its floor and works the arms out again, and a
 * line that moves carries the posts standing on it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postFloor, postOffFloor, settlePostOps, carryPostOps, arrivalOps, followPostOps, POST_FLOOR } from '../public/js/builder/posts.js?v=ebcf627c';
import { validateZone, RULES } from '../public/js/builder/validate.js?v=1705a409';
import { applyOps } from '../public/js/builder/ops.js?v=acf30407';
import { run } from '../tools/builder/cli.mjs';
import { loadValidatorContext } from '../tools/builder/validator-context.mjs';
import { GAME_DIR } from '../tools/repos.mjs';

const base = JSON.parse(readFileSync(join(GAME_DIR, 'tests/fixtures/builder/mossy-hollow.zone.json'), 'utf8'));
const ctx = loadValidatorContext({ publish: true, zones: false });
const zone = () => structuredClone(base);
const lane = (z) => z.streets[0].street;
const post = (z, id = 'signpost_1') => lane(z).signposts.find((p) => p.id === id);
const moveLedge = (z, y) => Object.assign(lane(z).platforms.find((p) => p.id === 'plat_2'), { y1: y, y2: y });
const findings = (z, rule) => validateZone(z, ctx).findings.filter((f) => f.rule === rule);

describe('a signpost and its floor (js/builder/posts.js)', () => {
  it('finds the floor a post stands on, and says when it floats or stands under it', () => {
    const z = zone();
    assert.deepEqual(postFloor(lane(z), post(z)), { line: 'plat_2', y: -150, gap: 0 });
    assert.equal(postOffFloor(lane(z), post(z)), null);
    moveLedge(z, -110);
    assert.deepEqual(postOffFloor(lane(z), post(z)), { why: 'floats', gap: 40, floor: { line: 'plat_2', y: -110, gap: 40 } });
    moveLedge(z, -180);
    assert.equal(postOffFloor(lane(z), post(z)).why, 'sunk');
    // Off every floor: the first floor under it, else none.
    Object.assign(post(z), { x: 1350, y: -400 });
    assert.equal(postFloor(lane(z), post(z)).line, 'plat_2');
    lane(z).platforms = lane(z).platforms.filter((p) => p.id !== 'plat_1' && p.id !== 'plat_2');
    assert.deepEqual(postOffFloor(lane(z), post(z)), { why: 'none', gap: null, floor: null });
  });

  it('a forked street keeps Tiny Speck\'s allowance (posts 1 to 47 px over their floor)', () => {
    const z = zone();
    moveLedge(z, -120);
    assert.equal(postOffFloor(lane(z), post(z)).why, 'floats');
    lane(z).source = 'groddle-builder mossy-hollow (fork of GLI2V0UN7RD1T2J)';
    assert.equal(postOffFloor(lane(z), post(z)), null);
    moveLedge(z, -150 + POST_FLOOR.forked.over + 2);
    assert.equal(postOffFloor(lane(z), post(z)).why, 'floats');
  });
});

describe('the validator names the post when the post is the problem', () => {
  it('PHY-001 on a stale arm names the floating post, not the arrival; PHY-009 waits for it', () => {
    assert.deepEqual(findings(zone(), 'PHY-009'), []);
    const z = zone();
    moveLedge(z, -110);
    const f = findings(z, 'PHY-001');
    assert.equal(f.length, 1);
    assert.equal(f[0].at, 'lane/signpost_1');
    assert.match(f[0].message, /Signpost signpost_1 floats 40 px over its floor \(plat_2\)\. The arm from end\/signpost_1 lands there/);
    assert.match(f[0].fix, /arrivals --posts/);
    assert.deepEqual(findings(z, 'PHY-009'), [], 'not named twice');
    assert.ok(RULES['PHY-009']);
  });

  it('PHY-009 names a post off its floor when the arms already land on the floor', () => {
    const z = zone();
    moveLedge(z, -110);
    applyOps(z, arrivalOps(z).ops);
    assert.deepEqual(findings(z, 'PHY-001'), []);
    const f = findings(z, 'PHY-009');
    assert.deepEqual(f.map((x) => [x.at, x.severity]), [['lane/signpost_1', 'warn']]);
  });

  it('a post on its floor with a stale arm: PHY-001 says to work the arrivals out again', () => {
    const z = zone();
    moveLedge(z, -110);
    post(z).y = -110;
    const f = findings(z, 'PHY-001');
    assert.equal(f.length, 1);
    assert.match(f[0].message, /still lands at 2850, 850, where signpost signpost_1 stood/);
  });
});

describe('standing posts on their floor, and carrying them with a line', () => {
  it('settlePostOps stands off-floor posts on the floor; arrivalOps then lands the arms there', () => {
    const z = zone();
    moveLedge(z, -110);
    const s = settlePostOps(z);
    assert.deepEqual(s, { ops: [{ op: 'signpost.set', street: 'lane', id: 'signpost_1', set: { y: -110 } }], posts: ['lane/signpost_1'], none: [] });
    applyOps(z, s.ops);
    const a = arrivalOps(z);
    assert.deepEqual(a.arms, ['end/signpost_1/0']);
    applyOps(z, a.ops);
    assert.deepEqual(validateZone(z, ctx).counts, validateZone(zone(), ctx).counts);
  });

  it('a line that moves carries the posts standing on it (followPostOps), and the arms follow', () => {
    const z = zone();
    assert.deepEqual(carryPostOps(lane(z), 'lane', 'plat_2', { y1: -120, y2: -120 }), [{ op: 'signpost.set', street: 'lane', id: 'signpost_1', set: { y: -120 } }]);
    assert.deepEqual(carryPostOps(lane(z), 'lane', 'plat_1', { y1: -40, y2: -40 }), [{ op: 'signpost.set', street: 'lane', id: 'signpost_2', set: { y: -40 } }]);
    const f = followPostOps(z, [{ op: 'platform.set', street: 'lane', id: 'plat_2', set: { y1: -120, y2: -120 } }]);
    assert.deepEqual(f.carried, ['lane/signpost_1']);
    assert.deepEqual(f.arms, ['end/signpost_1/0']);
    applyOps(z, f.ops);
    assert.equal(post(z).y, -120);
    assert.deepEqual(z.streets[1].street.signposts[0].connects[0].arrive, { x: 2850, y: 880 });
    // A line moved with its post already moved in the same batch is left as asked.
    const g = followPostOps(zone(), [{ op: 'platform.set', street: 'lane', id: 'plat_2', set: { y1: -120, y2: -120 } }, { op: 'signpost.set', street: 'lane', id: 'signpost_1', set: { y: -100 } }]);
    assert.deepEqual(g.carried, []);
  });
});

describe('the CLI: set carries posts, arrivals --posts stands them on the floor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'builder-posts-'));
  const env = { GRODDLE_BUILDER_HOME: join(dir, 'home') };
  const file = join(dir, 'zone.json');
  const cli = (...argv) => run([...argv, `file:${file}`, '--json'], { env });
  const read = () => JSON.parse(readFileSync(file, 'utf8'));

  it('set on a line carries the post standing on it and works its arm out again', async () => {
    writeFileSync(file, JSON.stringify(zone()));
    const r = await cli('set', 'lane/plat_2', 'y1=-120', 'y2=-120');
    assert.deepEqual(r.out.carried, ['lane/signpost_1']);
    assert.deepEqual(r.out.arms, ['end/signpost_1/0']);
    assert.equal(post(read()).y, -120);
    assert.deepEqual(findings(read(), 'PHY-001'), []);
  });

  it('--no-carry leaves the post; arrivals --posts then stands it on the floor and lands its arm', async () => {
    writeFileSync(file, JSON.stringify(zone()));
    const r = await cli('set', 'lane/plat_2', 'y1=-110', 'y2=-110', '--no-carry');
    assert.equal(r.out.carried, undefined);
    assert.equal(findings(read(), 'PHY-001')[0].at, 'lane/signpost_1');
    const a = await cli('arrivals', '--posts');
    assert.deepEqual(a.out.posts, ['lane/signpost_1']);
    assert.deepEqual(a.out.arms, ['end/signpost_1/0']);
    assert.equal(post(read()).y, -110);
    assert.deepEqual([...findings(read(), 'PHY-001'), ...findings(read(), 'PHY-009')], []);
    const again = await cli('arrivals', '--posts');
    assert.deepEqual(again.out, { changed: [], arms: [], posts: [], none: [] });
  });
});
