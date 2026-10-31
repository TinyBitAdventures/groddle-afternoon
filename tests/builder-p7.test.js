/**
 * LEVEL BUILDER P7 (spec 7.4, 8.2, 8.4, 14.1 "P7 follow-ups"): the follow-ups the VOLCANO run
 * found, apart from posts (tests/builder-posts.test.js) and the art route (builder-keys, zones):
 * - the reach model's run-up and keyboard-player landings (js/builder/reach-graph.js), and the
 *   PHY-006 they feed;
 * - routes to play back in the game (reachRoutes) and the scripted play-test (tools/builder/playtest.mjs);
 * - a draft play-test holds quest offers;
 * - the CLI's batch intake, connect --a-at/--a-floor, and the note on filtered layers;
 * - the worker says when its code changed (GET /health, X-Builder-Worker-Stale) and --restart.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reachStreet, reachRoutes, runUpSpeed, jumpArc, streetWorld, LANDING_TRIES, AIR_JUMP_TRIES, LANDING_SHARE, REACH_LIMITS } from '../public/js/builder/reach-graph.js?v=0eb97168';
import { validateShippedStreet } from '../public/js/builder/validate.js?v=faa3883f';
import { NORMAL_BUFF, WALK_MAX } from '../public/js/avatar-step.js?v=c04c7c76';
import { run, connectOps, floorAt, newArtFilterNote } from '../tools/builder/cli.mjs';
import { createWorker, staleFiles } from '../tools/builder/worker.mjs';
import { signWorker } from '../tools/builder/sign.mjs';
import { atExit, installKeyboard } from '../tools/builder/playtest.mjs';
import { GAME_DIR } from '../tools/repos.mjs';
import { builderGuide } from '../tools/builder/guide.mjs';

const read = (p) => readFileSync(join(GAME_DIR, p), 'utf8');
const mossy = () => JSON.parse(read('tests/fixtures/builder/mossy-hollow.zone.json'));

/** A street with a ledge A you arrive on, and a ledge B with a post (screen y = world y + 1500). */
function bay({ A, B, ceiling = null }) {
  const platforms = [
    { id: 'pit', x1: 10, y1: -10, x2: 2990, y2: -10, pc_perm: -1 },
    { id: 'A', x1: A[0], y1: A[2], x2: A[1], y2: A[2], pc_perm: -1 },
    { id: 'B', x1: B[0], y1: B[2], x2: B[1], y2: B[2], pc_perm: -1 },
  ];
  if (ceiling) platforms.push({ id: 'C', x1: ceiling[0], y1: ceiling[2], x2: ceiling[1], y2: ceiling[2], pc_perm: 1 });
  return { tsid: 'GZTESTBAY000001', label: 'Bay', bounds: { l: 0, r: 3000, t: -1500, b: 0 }, platforms, layers: [], signposts: [{ id: 'signpost_1', x: B[1], y: B[2], w: 150, h: 200, connects: [{ tsid: 'GX', label: 'x' }] }] };
}
const target = (street) => reachStreet(street, [{ x: 420, y: 700, from: 'a' }]).targets[0];

describe('the reach model: run-ups and a keyboard player\'s landings (P7)', () => {
  it('a run reaches the speed its run-up gives room for (the game\'s own steering)', () => {
    assert.equal(runUpSpeed(NORMAL_BUFF, 0), 0);
    assert.ok(runUpSpeed(NORMAL_BUFF, 8) < WALK_MAX);
    assert.equal(runUpSpeed(NORMAL_BUFF, 40), WALK_MAX);
    const w = streetWorld(bay({ A: [100, 2900, -800], B: [2950, 2960, -1400] }));
    const slow = jumpArc(w, { x: 700, y: 700 }, { dir: 1, run: true, speed: runUpSpeed(NORMAL_BUFF, 6) });
    const full = jumpArc(w, { x: 700, y: 700 }, { dir: 1, run: true });
    assert.ok(full.landed.x - slow.landed.x > 2, 'a short run-up jumps shorter (airborne, holding toward, it catches up most of it)');
  });

  it('the tries: eight takeoffs over 12 px either way, an air jump 1 to 3 frames off; under 60% landing is tight', () => {
    assert.deepEqual([...LANDING_TRIES], [-12, -8.5, -5, -1.5, 1.5, 5, 8.5, 12]);
    assert.deepEqual([...AIR_JUMP_TRIES], [-3, -2, -1, 1, 2, 3]);
    assert.equal(LANDING_SHARE, 0.6);
    assert.ok(REACH_LIMITS.some((l) => /keyboard player/.test(l)));
  });

  it('VOLCANO\'s 30 px overlaps: comfortable, because a jump held toward the ledge lands well on it', () => {
    for (const overlap of [0, 30, 90]) {
      const t = target(bay({ A: [400, 700, -800], B: [700 - overlap, 1000 - overlap, -890] }));
      assert.ok(t.reached && t.margin >= 1, `overlap ${overlap}: ${t.margin}`);
    }
  });

  it('a ledge reached only by a straight-up jump at the very end of a ledge under a low roof is a tight landing (PHY-006)', () => {
    const street = bay({ A: [400, 700, -800], B: [704, 764, -870], ceiling: [400, 700, -920] });
    const t = target(street);
    assert.ok(t.reached);
    assert.ok(t.margin < 1, `score ${t.margin}`);
    assert.equal(t.tight.dir, 0);
    assert.ok(t.tight.share < LANDING_SHARE);
    const f = validateShippedStreet(street, [{ x: 420, y: 700, from: 'a' }], { rules: ['PHY-006'] }).findings;
    assert.equal(f.length, 1);
    assert.equal(f[0].data.kind, 'landing');
    assert.match(f[0].message, /needs a landing a keyboard player often misses \(the jump from 700, 700 to 70\d, 630\): of takeoffs up to 12 px early or late, 4 in 8 land on B/);
  });

  it('a jump with little height to spare still says so (PHY-006 by height)', () => {
    const t = target(bay({ A: [400, 700, -800], B: [760, 1100, -898] }));
    assert.ok(t.reached && t.margin < 1);
    assert.ok(Number.isFinite(t.tight.rise) && t.tight.rise < 8);
  });
});

describe('routes to play back, and the scripted play-test (tools/builder/playtest.mjs)', () => {
  it('reachRoutes walks and jumps to each exit, preferring walking to hops along one floor', () => {
    const z = mossy();
    const lane = z.streets[0].street;
    const r = reachRoutes(lane, { x: 150, y: 940 });
    const post1 = r.routes.find((x) => x.id === 'signpost_1');
    assert.deepEqual(post1.steps.map((s) => s.kind), ['walk', 'jump', 'walk']);
    assert.equal(post1.steps[1].toY, 850);
    assert.deepEqual(r.routes.find((x) => x.id === 'signpost_2').steps.map((s) => s.kind), ['walk']);
    const none = reachRoutes(bay({ A: [400, 700, -800], B: [1500, 1800, -1000] }), { x: 420, y: 700 });
    assert.equal(none.routes[0].steps, null);
  });

  it('counts an exit reached as the validator does, and puts its keyboard player in the page', () => {
    assert.equal(atExit({ x: 2800, y: 850, onGround: true }, { kind: 'signpost', x: 2850, y: 850 }), true);
    assert.equal(atExit({ x: 2600, y: 850, onGround: true }, { kind: 'signpost', x: 2850, y: 850 }), false);
    assert.equal(atExit({ x: 2850, y: 850, onGround: false }, { kind: 'signpost', x: 2850, y: 850 }), false);
    const src = String(installKeyboard);
    for (const word of ['groddleQA.idleState', 'groddleQA.placeAvatar', "new KeyboardEvent(type, { key: k", 'requestAnimationFrame']) assert.ok(src.includes(word), word);
    const tool = read('tools/builder/playtest.mjs');
    assert.match(tool, /questoffer=off&draft=/);
    // The agent's guide carries the same (spec 8.6).
    const guide = JSON.parse(read('tools/builder/guide.mjs').length ? JSON.stringify(builderGuide()) : '{}');
    assert.ok(guide.playtest.hooks['groddleQA.placeAvatar(x, y)']);
    assert.match(guide.playtest.words, /questoffer=now/);
    assert.equal(guide.reach.keyboard.tightUnder, LANDING_SHARE);
    assert.match(guide.posts.cli.join(' '), /arrivals --posts/);
    assert.match(tool, /openBrowser\(/);
  });

  it('a draft play-test holds quest offers unless ?questoffer=now (they are never part of a zone)', () => {
    assert.match(read('public/js/features/quest-offers-feature.js'), /const draft = Boolean\(engine\.param\('draft'\)\);\s*quiet = mode === 'off' \|\| \(\(qaRoute \|\| draft\) && mode !== 'now'\);/);
    // Other features' offers (quest instances, resource nodes, seasons) wait on engine.questOffersHeld, which asks every feature's holdQuestOffers.
    assert.match(read('public/js/features/quest-offers-feature.js'), /holdQuestOffers\(engine\) \{\s*return Boolean\(engine\.param\?\.\('draft'\)\) && engine\.param\('questoffer'\) !== 'now';/);
    assert.match(read('public/game.js'), /questOffersHeld: \(\) => startHeld\(\) \|\| features\.query\('holdQuestOffers', engine\) === true/);
  });
});

describe('the CLI\'s smaller VOLCANO items', () => {
  it('connect places posts at an x and on a floor (--a-at, --b-floor)', () => {
    const z = mossy();
    const lane = z.streets[0].street;
    assert.equal(floorAt(lane, 1350), -150);
    assert.equal(floorAt(lane, 1350, 'lowest'), -60);
    assert.equal(floorAt(lane, 1350, 'plat_1'), -60);
    assert.equal(floorAt(lane, 0, 'plat_2'), null);
    const c = connectOps(z, 'lane', 'end', { aAt: 1350, aFloor: 'lowest', bAt: 0 });
    const posts = c.ops.filter((o) => o.op === 'signpost.add').map((o) => [o.street, o.signpost.x, o.signpost.y]);
    assert.deepEqual(posts, [['lane', 1350, -60], ['end', 0, -60]]);
    assert.throws(() => connectOps(z, 'lane', 'end', { aAt: 0, aFloor: 'plat_2' }), /does not run under x 0/);
  });

  it('placing new art on a filtered layer says how to soften the filters', () => {
    const z = mossy();
    z.streets[0].street.layers.unshift({ id: 'sky', name: 'sky', z: -4, w: 2250, h: 1000, filters: { brightness: -14, contrast: -18, saturation: -43 }, decos: [] });
    assert.match(newArtFilterNote(z, 'lane', 'sky', 'gz_ai_ash_cloud'), /layer sky carries brightness -14, contrast -18, saturation -43.*set lane\/sky filters='\{"brightness":-7,"contrast":-9,"saturation":-21\}'/);
    assert.equal(newArtFilterNote(z, 'lane', 'sky', 'bush_3'), null);
    assert.equal(newArtFilterNote(z, 'lane', 'middleground', 'gz_ai_ash_cloud'), null);
  });

  it('asset add takes several files: one intake call each, then one batch of asset.set ops', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'builder-p7-'));
    const art = readFileSync(join(GAME_DIR, 'tests/fixtures/builder/gz_moss_mound.webp'));
    for (const f of ['ash_cone.webp', 'ash_cone@1.5x.webp', 'Lava Pool.webp']) writeFileSync(join(dir, f), art);
    const env = { GRODDLE_BUILDER_HOME: join(dir, 'home'), GRODDLE_BUILDER_URL: 'https://example.invalid', GRODDLE_BUILDER_KEY: `${'a'.repeat(16)}.${'b'.repeat(64)}` };
    const zone = { ...mossy(), id: 'p7-batch', rev: 3 };
    const calls = [];
    const fetchImpl = async (url, init) => {
      const u = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method, path: u.pathname.replace('/wp-json/groddle/v1/admin/builder', ''), body });
      if (init.method === 'POST' && u.pathname.endsWith('/assets')) {
        const asset = { origin: 'new', licence: body.licence, sha256: 'ab'.repeat(32), name: body.name };
        return new Response(JSON.stringify({ report: { findings: [] }, asset, op: { op: 'asset.set', name: body.name, asset } }), { status: 201 });
      }
      if (init.method === 'GET') return new Response(JSON.stringify(zone), { status: 200, headers: { ETag: `"${zone.rev}"` } });
      return new Response(JSON.stringify({ rev: 4, changed: body.ops.map((o) => `asset:${o.name}`) }), { status: 200 });
    };
    const r = await run(['asset', 'add', join(dir, 'ash_cone.webp'), join(dir, 'Lava Pool.webp'), '--draft', 'p7-batch', '--licence', 'ai-generated', '--author', 'Claude', '--tool', 'code', '--json'], { env, fetchImpl });
    const intake = calls.filter((c) => c.method === 'POST' && c.path === '/assets');
    assert.deepEqual(intake.map((c) => c.body.name), ['gz_ai_ash_cone', 'gz_ai_lava_pool']);
    assert.ok(intake[0].body.file3, 'the @1.5x file beside it is its 3x');
    assert.ok(!intake[1].body.file3);
    const ops = calls.filter((c) => c.path.endsWith('/ops'));
    assert.equal(ops.length, 1);
    assert.deepEqual(ops[0].body.ops.map((o) => o.name), ['gz_ai_ash_cone', 'gz_ai_lava_pool']);
    assert.deepEqual(r.out.assets.map((a) => a.name), ['gz_ai_ash_cone', 'gz_ai_lava_pool']);
    await assert.rejects(run(['asset', 'add', join(dir, 'ash_cone.webp'), join(dir, 'Lava Pool.webp'), '--names', 'gz_a', '--draft', 'p7-batch', '--licence', 'ai-generated', '--author', 'C'], { env, fetchImpl }), /--names gives 1 names for 2 files/);
  });
});

describe('the builder worker says when its code changed (P7)', () => {
  it('staleFiles lists changed, new and gone files', () => {
    const a = new Map([['x.js', 1], ['y.js', 2]]);
    assert.deepEqual(staleFiles(a, new Map([['x.js', 1], ['y.js', 3], ['z.js', 1]])), ['y.js', 'z.js']);
    assert.deepEqual(staleFiles(a, new Map([['x.js', 1]])), ['y.js']);
    assert.deepEqual(staleFiles(a, a), []);
  });

  it('GET /health and every answer say so; --restart and node --watch are documented', async () => {
    let changed = [];
    const secret = 'c'.repeat(64);
    const server = createWorker({ secret, handlers: { guide: () => ({ ok: 1 }) }, stale: () => changed });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    try {
      const fresh = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
      assert.equal(fresh.stale, false);
      changed = ['public/js/builder/validate.js'];
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.headers.get('x-builder-worker-stale'), '1');
      assert.deepEqual((await res.json()).changed, changed);
      const call = await fetch(`http://127.0.0.1:${port}/guide`, { method: 'POST', headers: { 'X-Groddle-Worker': signWorker({ secret, method: 'POST', route: '/guide', body: '{}' }) }, body: '{}' });
      assert.equal(call.status, 200);
      assert.equal(call.headers.get('x-builder-worker-stale'), '1');
    } finally {
      server.close();
    }
    const src = read('tools/builder/worker.mjs');
    assert.match(src, /--restart/);
    assert.match(src, /node --watch tools\/builder\/worker\.mjs/);
  });
});
