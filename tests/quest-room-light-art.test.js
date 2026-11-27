/**
 * The light-puzzle rooms' made art (lane art01, 2026-11-16): Walk Toward the Light and Radiant Glare
 * draw their dish platforms, lamp shades, striped poles, stone ledges, wall spotlights, caged bulbs
 * and pipe knobs from pictures made for Groddle (js/quest-rooms/light-rig-art.js), each recorded in
 * tools/provenance/made-decos.json (research/art-briefs/quest-rooms-2026-11-16, outside git).
 * Run: node --test tests/quest-room-light-art.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIG_ART } from '../public/js/quest-rooms/light-rig-art.js?v=c4582b4f';
import { webpSize } from '../tools/made-art/build-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const made = JSON.parse(readFileSync(join(root, 'tools/provenance/made-decos.json'), 'utf8')).art;
const decoFile = (name, three = false) => join(root, 'public/assets/decos/groddle', `${name}${three ? '@1.5x' : ''}.webp`);

describe('the light rig\'s made art and its provenance', () => {
  it('every piece ships at 2 and 3 px a unit, at the size its provenance row and the kit name', () => {
    assert.equal(Object.keys(RIG_ART).length, 11);
    for (const [key, piece] of Object.entries(RIG_ART)) {
      const row = made[piece.name];
      assert.ok(row, `${key}: ${piece.name} has a provenance row`);
      assert.match(piece.name, key.startsWith('spot') || key.startsWith('bulb') || key === 'knob' ? /^gz_ai_rg_/ : /^gz_ai_lp_/);
      assert.deepEqual([row.w, row.h], [piece.w, piece.h], piece.name);
      assert.deepEqual(webpSize(readFileSync(decoFile(piece.name))), { w: piece.w * 2, h: piece.h * 2 }, `${piece.name} 2x`);
      assert.deepEqual(webpSize(readFileSync(decoFile(piece.name, true))), { w: piece.w * 3, h: piece.h * 3 }, `${piece.name} 3x`);
    }
  });

  it('records the model, the prompt, the five files given (snaps reference only) and the intake, dedicated CC0 1.0', () => {
    for (const { name } of Object.values(RIG_ART)) {
      const row = made[name];
      assert.equal(row.licence, 'ai-generated');
      assert.equal(row.model, 'GPT Image 2.6 Sunburst');
      assert.match(row.tool, /T3 Chat/);
      assert.match(row.prompt, /Glitch/);
      assert.equal(row.inputFiles.length, 5);
      assert.match(row.inputFiles[0].source, /our own measurement drawing/);
      for (const f of row.inputFiles.slice(1, 4)) assert.match(f.source, /reference only.*never copied into the repo/, `${name}: ${f.file}`);
      assert.match(row.inputFiles[4].source, /^Tiny Speck, CC0 1\.0/);
      assert.match(row.source.drop, /^research\/art-briefs\/quest-rooms-2026-11-16\/0[12]-[a-z-]+\/drop\/[A-G]-[a-z-]+\.png$/);
      assert.match(row.source.encode, /-q 82 -m 4 -sharp_yuv -alpha_q 100 -alpha_filter best/);
      assert.ok(row.intake?.on === '2026-11-16' && row.chosen?.by, name);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The rooms build with the made art, and still solve                   */
/* ------------------------------------------------------------------ */

const textures = await import('../public/js/textures.js?v=b8e38103');
const kit = await import('../public/js/quest-rooms/kit.js?v=3bd05cd3');
const { Display, FakeEl, fakePixi } = await import('./fake-scene.js');
const { playRoomAutoplay } = await import('../public/js/autoplay-log.js?v=55bb4823');

class FakeSource { constructor() { this.destroyed = false; } emit() {} on() {} once() {} resize() { return true; } update() {} }
class FakeTexture { constructor(o = {}) { this.source = o.source; this.destroyed = false; } static from() { return new FakeTexture({ source: new FakeSource() }); } }
const testPixi = new Proxy({ ImageSource: FakeSource, Texture: FakeTexture, Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } } }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});

/** Every image URL the drawing asks js/textures.js for. */
const asked = new Set();
// Set up at load, for the rest of this file's process (root hooks would run around the suites above, which start during the awaits).
globalThis.PIXI = testPixi;
globalThis.document = { createElement: (tag) => new FakeEl(tag) };
textures.addUrlRoute('light-art-test', (url) => {
  asked.add(String(url));
  return null;
});

/** A quest-room context with a real kit and fake Pixi; place() moves the player, wait() is instant. */
function fakeCtx() {
  const log = { progress: [], solved: 0, left: 0 };
  const ctx = {
    PIXI: testPixi,
    kit,
    data: {},
    log,
    player: { x: 0, y: 0, vy: 0 },
    engine: { platforms: [] },
    param: () => null,
    add: (spr) => spr,
    quoinSprite: () => new Display(),
    collectQuoin: () => ({}),
    register: (t) => t,
    place(x, y) { ctx.player.x = x; ctx.player.y = y; },
    wait: async () => {},
    sound: () => {},
    toast: () => {},
    floatText: () => {},
    setData: () => {},
    near: (x, y, r) => Math.hypot(ctx.player.x - x, ctx.player.y - y) <= r,
    progress: (flag) => log.progress.push(flag),
    solve: () => { log.solved += 1; },
    leave: () => { log.left += 1; },
    fx: () => null,
    run: { status: 'active' },
    step: (name, ok = true) => Boolean(ok),
  };
  ctx.solve = () => { log.solved += 1; ctx.run.status = 'solved'; };
  ctx.leave = () => { log.left += 1; ctx.run.outcome = ctx.run.status === 'solved' ? 'complete' : 'abandoned'; ctx.run.status = 'left'; };
  return ctx;
}

/** The made decos a build asked for, by name. */
const madeAsked = () => new Set([...asked].map((u) => /assets\/decos\/groddle\/(gz_ai_[a-z_]+)(@1\.5x)?\.(png|webp)/.exec(u)?.[1]).filter(Boolean));

describe('Walk Toward the Light draws the made art', () => {
  it('builds with every lp piece, the bulbs and the knobs, and no vector dish, pole or rock left', async () => {
    const { room } = await import('../public/js/quest-rooms/light-perspective.js?v=f7e8f74f');
    asked.clear();
    const ctx = fakeCtx();
    const built = room.build(ctx);
    assert.equal(built.label, 'Walk Toward the Light');
    room.enter(ctx);
    const names = madeAsked();
    for (const k of ['dish', 'shade', 'pole', 'poleCap', 'ledgeLeft', 'ledgeMid', 'ledgeRight', 'bulbOff', 'bulbLit', 'knob']) assert.ok(names.has(RIG_ART[k].name), k);
    assert.ok(!names.has(RIG_ART.spotlight.name), 'no wall spotlight in this room');
    const src = readFileSync(join(root, 'public/js/quest-rooms/light-perspective.js'), 'utf8');
    assert.doesNotMatch(src, /function drawPole\(|bezierCurveTo|0x56545e/, 'the vector pole, dish and rock edge are gone');
  });

  it('still solves: the intended run lights the way, and the exit door sets solved_puzzle', async () => {
    const { room } = await import('../public/js/quest-rooms/light-perspective.js?v=f7e8f74f');
    const ctx = fakeCtx();
    room.build(ctx);
    room.enter(ctx);
    for (let i = 0; i < 3; i++) room.tick(ctx);
    const played = await playRoomAutoplay(room, ctx, 'exit');
    assert.equal(played.word, 'exited', played.summary);
    assert.deepEqual(played.missing, [], 'G971: every orb, bulb and lit surface of the solution, the door and the exit');
    assert.ok(played.done.filter((d) => d.startsWith('bulb:')).length >= 5);
    assert.deepEqual(ctx.log.progress, ['solved_puzzle']);
    assert.equal(ctx.log.solved, 1);
    // The panel bulbs swap to their lit picture when picked.
    const lit = ctx.data.bulbs.filter((b) => b.spr.body.lit.visible).map((b) => `${b.panel}:${b.color}`);
    assert.deepEqual(lit.sort(), Object.entries(ctx.data.state.picks).filter(([, c]) => c).map(([p, c]) => `${p}:${c}`).sort());
  });
});

describe('Radiant Glare draws the made art', () => {
  it('builds with the spotlights, dishes, ledges, bulbs and knobs', async () => {
    const { room } = await import('../public/js/quest-rooms/radiant-glare.js?v=d99c3f2b');
    asked.clear();
    const ctx = fakeCtx();
    const built = room.build(ctx);
    assert.equal(built.label, 'Radiant Glare');
    room.enter(ctx);
    const names = madeAsked();
    for (const k of ['spotlight', 'dish', 'ledgeLeft', 'ledgeMid', 'ledgeRight', 'bulbOff', 'bulbLit', 'knob']) assert.ok(names.has(RIG_ART[k].name), k);
    // One spotlight per wall lamp, mirrored on the left wall.
    assert.equal(Object.keys(ctx.data.lampSprites).length, ctx.data.layout.lamps.length);
    const src = readFileSync(join(root, 'public/js/quest-rooms/radiant-glare.js'), 'utf8');
    assert.doesNotMatch(src, /Scalloped underside|lens\.ellipse|g\.roundRect\(-9, -13/, 'the vector lamp, disc and mix lamp are gone');
  });

  it('still solves: lamps, the green mix, the totem\'s purple, then the EXIT sets solved_puzzle', async () => {
    const { room } = await import('../public/js/quest-rooms/radiant-glare.js?v=d99c3f2b');
    const ctx = fakeCtx();
    room.build(ctx);
    room.enter(ctx);
    ctx.place(150, 3240);
    room.tick(ctx);
    const played = await playRoomAutoplay(room, ctx, 'exit');
    assert.equal(played.word, 'exited', played.summary);
    assert.deepEqual(played.missing, [], 'G971: the lamps, the mixes, the discs, the EXIT');
    assert.deepEqual(ctx.log.progress, ['solved_puzzle']);
    room.tick(ctx);
    // The mix lamps show the mixes in their lit picture.
    assert.equal(ctx.data.mixLamps.totem.children[1].lit.visible, true);
  });
});
