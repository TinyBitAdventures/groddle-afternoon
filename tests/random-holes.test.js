/**
 * Glitch's Random Hole (items/random_hole.js; Austin 2026-11-27, from report #669's search for
 * things you could fall through). Touch one and you come out 120 px over a Random Hole on the same
 * street picked at random, thrown upward (gravity -2) for 1.1 s. No archived street places one, so
 * the remake runs only the holes a QA link puts down (&randomholedemo=<street>).
 *
 * The reproduction is the browser part: on main, walking onto a demo hole leaves you where you
 * walked (there is no Random Hole and no randomholedemo).
 * Run: node --test tests/random-holes.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import {
  DEMO_HOLE_ART,
  RANDOM_HOLE_HIT,
  RANDOM_HOLE_PHYSICS,
  RANDOM_HOLE_POP_ABOVE,
  demoHoles,
  demoWantsStreet,
  holeCheck,
  hopPhysics,
  hopSpot,
  parseHoleDemo,
  pickHole,
  sweptTouch,
  touchesHole,
} from '../public/js/random-holes.js?v=e979c4ae';
import { randomHolesFeature } from '../public/js/features/random-holes-feature.js?v=0060cfc7';
import { teleportWithinStreet } from '../public/js/within-street.js?v=5ce33cdf';
import { FEATURES } from '../public/js/features/index.js?v=f7b25ee2';
import { createTrack, pushSample, sampleTrack, INTERP_DELAY_MS, MOVE_EVERY_MS } from '../public/js/realtime-client.js?v=7e402304';
import { AVATAR_BODY_H, NORMAL_BUFF, stepAvatar } from '../public/js/avatar-step.js?v=8415ee96';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = [join(root, '../glitch-GameServerJS'), join(homedir(), 'Documents/glitch-audit/glitch-GameServerJS')].find((d) => existsSync(join(d, 'items/random_hole.js')));
const STREETS = [join(root, '../streets'), join(homedir(), 'Documents/glitch-audit/streets')].find((d) => existsSync(join(d, 'mnt/stos/location_data')));
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const hole = (id, x, y = 900, extra = {}) => ({ id, classTsid: 'random_hole', x, y, ...extra });

describe('Random Hole: what items/random_hole.js says', () => {
  it('a 10 x 10 hit box; out 120 px over the hole picked; gravity -2 for 1100 ms; no art of its own', { skip: !GSJS && 'no GSJS' }, () => {
    const src = readFileSync(join(GSJS, 'items/random_hole.js'), 'utf8');
    assert.match(src, /var hitBox = \{\n\tw: 10,\n\th: 10,\n\};/);
    assert.deepEqual(RANDOM_HOLE_HIT, { w: 10, h: 10 });
    assert.match(src, /var hole = choose_one_hash\(this\.holes\);\n\tpc\.teleportToLocation\(this\.container\.tsid, hole\.x, hole\.y-120\);/);
    assert.equal(RANDOM_HOLE_POP_ABOVE, 120);
    assert.match(src, /pc\.addCTPCPhysics\(\{gravity: -2, duration_ms: 1100\}, this\.class_tsid\);/);
    assert.deepEqual(RANDOM_HOLE_PHYSICS, { gravity: -2, durationMs: 1100 });
    // findHoles keeps every item of the class in the location, the touched one too.
    assert.match(src, /if \(item\.class_tsid == this\.class_tsid\)\{\n\t\t\tthis\.holes\[item\.tsid\] = item;/);
    // Hidden, not selectable, no verbs, the missing.swf placeholder: nothing of its own shows.
    assert.match(src, /var is_hidden = true;/);
    assert.match(src, /not_selectable\t: true/);
    assert.match(src, /var verbs = \{\};/);
    assert.match(src, /items\\\/missing\.swf/);
  });

  it('no archived street places one', { skip: !STREETS && 'no streets dump' }, () => {
    const dir = join(STREETS, 'mnt/stos/location_data');
    let n = 0;
    for (const f of readdirSync(dir)) if (/\.xml$/.test(f) && /random_hole/.test(readFileSync(join(dir, f), 'utf8'))) n += 1;
    assert.equal(n, 0);
  });

  it('the demo draws a Tiny Speck deco that ships with the game', () => {
    assert.ok(existsSync(join(root, 'public', DEMO_HOLE_ART.url)), DEMO_HOLE_ART.url);
  });
});

describe('Random Hole: the touch', () => {
  it('the feet inside the 10 px box, the body over its 10 px height', () => {
    const h = hole('a', 500, 900);
    assert.equal(touchesHole(h, 500, 900), true);
    assert.equal(touchesHole(h, 505, 900), true);
    assert.equal(touchesHole(h, 506, 900), false);
    // 120 px over it (where a hop stands you) the body is clear of it.
    assert.equal(touchesHole(h, 500, 780, AVATAR_BODY_H), false);
    assert.equal(touchesHole(h, 500, 1000, AVATAR_BODY_H), false);
    // An instance's own width and height props.
    assert.equal(touchesHole({ ...h, w: 60 }, 525, 900), true);
  });

  it('a walk crosses the box between two frames: the swept path still touches it', () => {
    const h = hole('a', 500, 900);
    assert.equal(touchesHole(h, 490, 900) || touchesHole(h, 512, 900), false);
    assert.equal(sweptTouch(h, { x: 490, y: 900 }, { x: 512, y: 900 }), true);
    assert.equal(sweptTouch(h, { x: 400, y: 900 }, { x: 480, y: 900 }), false);
    // A teleport across it (a door, a pit, a QA move) skips it; one onto it touches it.
    assert.equal(sweptTouch(h, { x: 100, y: 900 }, { x: 900, y: 900 }), false);
    assert.equal(sweptTouch(h, { x: 100, y: 900 }, { x: 500, y: 900 }), true);
  });

  it('fires when a touch starts, not while it lasts', () => {
    const holes = [hole('a', 500), hole('b', 900)];
    const first = holeCheck(holes, { x: 480, y: 900 }, { x: 500, y: 900 }, new Set());
    assert.equal(first.touched?.id, 'a');
    const again = holeCheck(holes, { x: 500, y: 900 }, { x: 502, y: 900 }, first.inside);
    assert.equal(again.touched, null);
    assert.deepEqual([...again.inside], ['a']);
  });

  it('picks any hole on the street, the touched one too (choose_one_hash)', () => {
    const holes = [hole('a', 100), hole('b', 200), hole('c', 300)];
    assert.equal(pickHole(holes, () => 0).id, 'a');
    assert.equal(pickHole(holes, () => 0.5).id, 'b');
    assert.equal(pickHole(holes, () => 0.9999).id, 'c');
    assert.equal(pickHole([], () => 0), null);
    assert.deepEqual(hopSpot(hole('b', 200, 900)), { x: 200, y: 780 });
  });

  it('the throw: gravity -2 at the normal terminal speed for 1.1 s, then nothing', () => {
    assert.deepEqual(hopPhysics(2100, 1000), { gravity: -2, vyMax: 1 });
    assert.equal(hopPhysics(2100, 2100), null);
    // With nothing over it, the avatar rises from the spot, then falls back as usual.
    const body = { x: 500, y: 780, vx: 0, vy: 0, onGround: false };
    const world = { platforms: [], worldW: 2000, ground: () => 900 };
    let top = body.y;
    for (let f = 0; f < 66; f++) {
      stepAvatar(body, { ...world, buff: { ...NORMAL_BUFF, gravity: -2, vyMax: 1 } });
      top = Math.min(top, body.y);
    }
    assert.ok(top < 780 - 300, `rose to ${top}`);
    for (let f = 0; f < 600 && !body.onGround; f++) stepAvatar(body, { ...world, buff: NORMAL_BUFF });
    assert.equal(body.y, 900);
  });
});

describe('Random Hole: the QA demo', () => {
  it('reads <street>[@x,...], here or 1', () => {
    assert.deepEqual(parseHoleDemo('GLI2V0UN7RD1T2J'), { street: 'GLI2V0UN7RD1T2J', xs: [] });
    assert.deepEqual(parseHoleDemo('here@1200, 2400,x'), { street: '', xs: [1200, 2400] });
    assert.deepEqual(parseHoleDemo('1'), { street: '', xs: [] });
    assert.equal(parseHoleDemo(''), null);
    assert.equal(parseHoleDemo(null), null);
    assert.equal(demoWantsStreet(parseHoleDemo('LLI2V0UN7RD1T2J'), 'GLI2V0UN7RD1T2J'), true);
    assert.equal(demoWantsStreet(parseHoleDemo('GLI2V0UN7RD1T2J'), 'GA5101HF7F429V5'), false);
    assert.equal(demoWantsStreet(parseHoleDemo('here'), 'GA5101HF7F429V5'), true);
    assert.equal(demoWantsStreet(null, 'GA5101HF7F429V5'), false);
  });

  it('four holes along the street on the ground, or one at each x named; none over no floor', () => {
    const ground = (x) => (x < 100 ? null : 900 - x / 100);
    const four = demoHoles(parseHoleDemo('here'), 6000, ground);
    assert.deepEqual(four.map((h) => [h.id, h.x, h.y]), [['hole1', 1200, 888], ['hole2', 2400, 876], ['hole3', 3600, 864], ['hole4', 4800, 852]]);
    const named = demoHoles(parseHoleDemo('here@3000,50,1000'), 6000, ground);
    assert.deepEqual(named.map((h) => [h.id, h.x]), [['hole1', 1000], ['hole2', 3000]]);
  });

  it('the feature is registered, and no street of the game places a hole', () => {
    assert.ok(FEATURES.includes(randomHolesFeature));
    assert.doesNotMatch(read('public/assets/streets/index.json'), /random_hole/);
  });
});

/** A stand-in engine: one street, the avatar, the URL's params. */
function fakeEngine(params = {}) {
  const data = {};
  return {
    data,
    started: true,
    player: { x: 0, y: 900, vx: 0, vy: 0, onGround: true },
    platforms: [{ x1: 0, y1: 900, x2: 6000, y2: 900, pc_perm: -1 }],
    snaps: 0,
    snapCamera() { this.snaps += 1; },
    setData(k, v) { data[k] = String(v); },
    param: (k) => params[k] ?? null,
    acting: () => false,
    questDialogueOpen: () => false,
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
  };
}
const STREET = { tsid: 'GLI2V0UN7RD1T2J', bounds: { l: -3000, r: 3000, t: -1000, b: 0 } };

describe('Random Hole: the feature on a street', () => {
  it('walking onto a hole stands you 120 px over the hole picked and throws you upward for 1.1 s', async () => {
    const engine = fakeEngine({ randomholedemo: 'GLI2V0UN7RD1T2J@1000,3000' });
    randomHolesFeature._setRandom(() => 0.9);
    try {
      randomHolesFeature.onStreetEnter(STREET, engine);
      assert.equal(engine.data.randomHoles, 'hole1:1000,900;hole2:3000,900');
      // Past the arrival grace, walk right over hole1 in steps a frame apart.
      await new Promise((r) => setTimeout(r, 850));
      for (let x = 960; x <= 1040 && engine.data.randomHoleHops === '0'; x += 7) {
        engine.player.x = x;
        randomHolesFeature.onTick(16, 0, engine);
      }
      assert.equal(engine.data.randomHoleHops, '1');
      assert.equal(engine.data.randomHoleLast, 'hole1>hole2@3000,780');
      assert.deepEqual([engine.player.x, engine.player.y, engine.player.vy, engine.player.onGround], [3000, 780, 0, false]);
      assert.equal(engine.snaps, 1);
      assert.deepEqual(randomHolesFeature.physics(engine), { gravity: -2, vyMax: 1 });
      assert.equal(engine.data.randomHoleRise, '1');
      // Standing over the hole it came out of does not hop again.
      randomHolesFeature.onTick(16, 0, engine);
      assert.equal(engine.data.randomHoleHops, '1');
    } finally {
      randomHolesFeature._setRandom(null);
      randomHolesFeature.onStreetClear();
    }
  });

  it('only on the street the link names, never in a home, and nothing without the link', () => {
    for (const [params, street, extra, want] of [
      [{ randomholedemo: 'GA5101HF7F429V5' }, STREET, {}, ''],
      [{}, STREET, {}, ''],
      [{ randomholedemo: 'here' }, STREET, { homeContext: () => ({ inHome: true }) }, ''],
      [{ randomholedemo: 'here' }, STREET, {}, 'hole1:1200,900;hole2:2400,900;hole3:3600,900;hole4:4800,900'],
    ]) {
      const engine = Object.assign(fakeEngine(params), extra);
      randomHolesFeature.onStreetEnter(street, engine);
      assert.equal(engine.data.randomHoles, want);
      randomHolesFeature.onStreetClear();
    }
  });

  it('the hop is the within-street teleport the pits use (one path, online too)', () => {
    const feature = read('public/js/features/random-holes-feature.js');
    const floors = read('public/js/features/hidden-floors-feature.js');
    assert.match(feature, /teleportWithinStreet\(engine, spot\.x, spot\.y\)/);
    assert.match(floors, /if \(row\.same\) \{\n\s+teleportWithinStreet\(engine, row\.arrive\.x, row\.arrive\.y\);/);
    const engine = fakeEngine();
    assert.equal(teleportWithinStreet(engine, 10, 20), true);
    assert.deepEqual([engine.player.x, engine.player.y, engine.player.onGround, engine.snaps], [10, 20, false, 1]);
  });

  it('online, another player draws you at the hole you came out of (the next move frame)', () => {
    // Before the hop at hole1's edge, then the frame after it 2000 px on: drawn there, no glide.
    const track = createTrack({ x: 995, y: 900, dir: 1, anim: 'walk' }, 0);
    pushSample(track, { x: 3000, y: 780, dir: 1, anim: 'stand' }, MOVE_EVERY_MS);
    const seen = sampleTrack(track, MOVE_EVERY_MS + INTERP_DELAY_MS);
    assert.deepEqual([seen.x, seen.y], [3000, 780]);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('Random Hole in Chrome at 1352x802: walking onto a demo hole on Hechey Track', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const TSID = 'GLI2V0UN7RD1T2J';
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'random holes test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  it('you come out 120 px over one of the street\'s holes and rise from it', { timeout: 120_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const ctx = await chrome.browser.newContext({ viewport: { width: 1352, height: 802 } });
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(e.message));
    const data = () => tab.evaluate(() => ({ ...document.querySelector('canvas').dataset }));
    const player = () => tab.evaluate(() => window.groddleQA.snapshot().player);
    try {
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&fresh=1&resetgame=1&streetdemo=${TSID}&randomholedemo=${TSID}`);
      await tab.waitForFunction(() => document.querySelector('canvas')?.dataset.randomHoles, null, { timeout: 60_000 });
      await tab.waitForTimeout(1200);
      const holes = (await data()).randomHoles.split(';').map((s) => {
        const [id, at] = s.split(':');
        const [x, y] = at.split(',').map(Number);
        return { id, x, y };
      });
      assert.equal(holes.length, 4);
      const [first] = holes;
      // Stand left of the first hole, then walk right onto it.
      await tab.evaluate(([x, y]) => window.groddleQA.placeAvatar(x, y), [first.x - 100, first.y - 4]);
      await tab.waitForTimeout(900);
      assert.equal((await data()).randomHoleHops, '0');
      await tab.keyboard.down('ArrowRight');
      try {
        await tab.waitForFunction(() => Number(document.querySelector('canvas').dataset.randomHoleHops) > 0, null, { timeout: 8000, polling: 'raf' });
      } catch {
        assert.fail(`walking onto the hole at x ${first.x} left you at x ${Math.round((await player()).x)}`);
      } finally {
        await tab.keyboard.up('ArrowRight');
      }
      const m = /^hole1>(hole\d)@(-?\d+),(-?\d+)$/.exec((await data()).randomHoleLast);
      assert.ok(m, (await data()).randomHoleLast);
      const to = holes.find((h) => h.id === m[1]);
      assert.deepEqual([Number(m[2]), Number(m[3])], [to.x, to.y - 120]);
      // Thrown upward: within the throw the feet are well over where the hop stood you.
      await tab.waitForTimeout(500);
      const p = await player();
      assert.ok(p.y < to.y - 120 - 60, `feet at ${Math.round(p.y)}, the hop stood you at ${to.y - 120}`);
      assert.ok(Math.abs(p.x - to.x) < 40, `x ${Math.round(p.x)} by the hole at ${to.x}`);
      assert.deepEqual(errors, []);
    } finally {
      await ctx.close();
    }
  });
});
