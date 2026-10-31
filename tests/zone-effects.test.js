/**
 * Zone ambient effects (docs/level-builder/spec.md 15 Q12; public/js/street-effects.js): steam
 * vents, lava squirts and embers placed on a zone street like decos, and the street's earthquake
 * rumble.
 *
 * - The pure half: defaults and ranges, the cost the validator caps (spec 12), the rumble's clock
 *   (seeded, so a render is the same twice; nothing shakes under reduced motion).
 * - The view on a stand-in Pixi: every sprite made once (the pool), none made per frame, an
 *   emitter off screen stops, reduced motion halves the pool, `always` makes a still.
 * - The game's feature: zone streets only, solo only; the camera shakes through nudgeCamera and
 *   the rumble's sound plays as each rumble starts.
 * - The CLI's effect, rumble and effects commands on a zone file, and `set`/`rm` by fx_ id.
 * - The play-test draws a draft's new art (draft-play.js useDraftArt; the site's bundle `art`).
 * - The minimap: zone streets from templates no longer carry noMap (Q11).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { GAME_DIR, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';
import {
  EFFECT_KINDS, EFFECT_DEFAULTS, EFFECT_LIMITS, RUMBLE_SOUND, normaliseEmitter, calmEmitter, emitterPool, effectsCost,
  createRumbleClock, rumbleShare, rumbleEnvelope, createStreetEffects, seededRandom,
} from '../public/js/street-effects.js?v=e427650f';
import { zoneEffectsFeature } from '../public/js/features/zone-effects-feature.js?v=6b079a9c';
import { useDraftArt } from '../public/js/builder/draft-play.js?v=d00d21ba';
import { run, effectOps, rumbleOps, effectsReport, placeOps, ladderTiling, LADDER_TILINGS } from '../tools/builder/cli.mjs';
import * as textures from '../public/js/textures.js?v=db2ce452';
import { installNewArt } from '../public/js/builder/new-art.js?v=29f0b13e';
import { newStreet } from '../public/js/builder/templates.js?v=008481d2';
import { kindChange, costWords } from '../public/js/builder/editor-effects.js?v=85f32fd1';

const json = (p) => JSON.parse(readFileSync(join(GAME_DIR, p), 'utf8'));
const hasPhp = spawnSync('php', ['-v']).status === 0;
const php = (code, input) => execFileSync('php', ['-r', code], { input: JSON.stringify(input) }).toString();
const street = (extra = {}) => ({ tsid: 'GZTEST000000001', label: 'Cinder Steps', bounds: { l: -1500, r: 1500, t: -2400, b: 0 }, platforms: [{ id: 'plat_1', x1: -1480, y1: -60, x2: 1480, y2: -60, pc_perm: -1 }], layers: [{ id: 'sky', z: -3, w: 2200, h: 1800, decos: [] }, { id: 'middleground', z: 0, decos: [] }], ...extra });

/** A stand-in Pixi with just what the effects view touches; it counts the sprites it makes. */
function fakePixi() {
  const made = { sprites: 0, containers: 0 };
  class Container {
    constructor() { made.containers += 1; this.children = []; this.x = 0; this.y = 0; this.visible = true; this.destroyed = false; this.zIndex = 0; this.parent = null; }
    addChild(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return kids[0]; }
    destroy() { this.destroyed = true; for (const c of this.children) c.destroy?.(); }
  }
  class Sprite {
    constructor(texture) { made.sprites += 1; this.texture = texture; this.anchor = { set() {} }; this.scale = { x: 1, y: 1, set(a, b) { this.x = a; this.y = b; } }; this.visible = true; this.alpha = 1; this.rotation = 0; this.x = 0; this.y = 0; }
    destroy() { this.destroyed = true; }
  }
  const WHITE = { width: 16, height: 16 };
  return { PIXI: { Container, Sprite, Texture: { WHITE, from: () => WHITE } }, made };
}

function fakeView(PIXI, s) {
  const root = new PIXI.Container();
  const layerContainers = s.layers.map((l) => { const lc = new PIXI.Container(); lc.label = l.id; lc.zIndex = l.z * 10; root.addChild(lc); return lc; });
  return { root, layerContainers };
}

describe('zone effects: the pure half (js/street-effects.js)', () => {
  it('fills an emitter in from its kind\'s defaults and keeps it in range', () => {
    for (const kind of EFFECT_KINDS) {
      const n = normaliseEmitter({ id: 'fx_1', kind, x: 1, y: -60 });
      assert.equal(n.rate, EFFECT_DEFAULTS[kind].rate);
      assert.equal(n.layer, 'middleground');
    }
    const n = normaliseEmitter({ id: 'fx_2', kind: 'lava', x: 0, y: 0, rate: 900, size: -5, period: [9, 3], burst: 30 });
    assert.equal(n.rate, 40);
    assert.equal(n.size, 4);
    assert.deepEqual(n.period, [3, 9]);
    assert.equal(n.burst, 3, 'a burst is at most the shortest period');
    assert.equal(normaliseEmitter({ kind: 'nope' }).kind, 'steam');
  });

  it('reduced motion: half the particles and a lower plume', () => {
    const n = normaliseEmitter({ id: 'fx_1', kind: 'steam', x: 0, y: 0, rate: 10, height: 300 });
    const calm = calmEmitter(n);
    assert.equal(calm.rate, 5);
    assert.ok(calm.height < n.height);
    assert.ok(emitterPool(calm) < emitterPool(n));
  });

  it('a street\'s cost: emitters, the most particles alive at once, and overdraw in Wide views', () => {
    assert.deepEqual(effectsCost(street()), { emitters: 0, particles: 0, overdraw: 0 });
    const s = street({ emitters: [{ id: 'fx_1', kind: 'steam', x: 0, y: -60 }, { id: 'fx_2', kind: 'lava', x: 0, y: -60 }, { id: 'fx_3', kind: 'embers', x: 0, y: -60, hidden: true }] });
    const c = effectsCost(s);
    assert.equal(c.emitters, 3);
    assert.equal(c.particles, emitterPool(normaliseEmitter(s.emitters[0])) + emitterPool(normaliseEmitter(s.emitters[1])), 'a hidden one costs nothing');
    assert.ok(c.particles < EFFECT_LIMITS.particles && c.overdraw < EFFECT_LIMITS.overdraw);
  });

  it('the rumble\'s clock: seeded, first rumble soon, quiet between, no shake under reduced motion', () => {
    const r = { every: [10, 20], duration: 2, strength: 8 };
    const trace = (opts) => {
      const c = createRumbleClock(r, 'GZTEST', opts);
      const out = [];
      for (let i = 0; i < 60 * 60; i += 1) { const o = c.step(1 / 60); out.push([o.started, Math.round(o.dx * 100), Math.round(o.dy * 100), o.active]); }
      return out;
    };
    const a = trace();
    assert.deepEqual(a, trace(), 'the same seed shakes the same way');
    const starts = a.map((x, i) => (x[0] ? i : -1)).filter((i) => i >= 0);
    assert.equal(starts[0], 300, 'the first after half the shortest gap (5 s)');
    assert.ok(starts.length >= 2 && starts.length <= 6, String(starts.length));
    for (let i = 1; i < starts.length; i += 1) assert.ok(starts[i] - starts[i - 1] >= (10 + 2) * 60 - 2, 'at least the shortest gap after one ends');
    assert.ok(a.some((x) => x[1] !== 0), 'it shakes');
    assert.ok(a.every((x) => x[3] || (x[1] === 0 && x[2] === 0)), 'still between rumbles');
    assert.ok(a.every((x) => Math.abs(x[1]) <= 800 && Math.abs(x[2]) <= 800), 'never past its strength');
    const calm = trace({ reduced: true });
    assert.ok(calm.every((x) => x[1] === 0 && x[2] === 0), 'no shake under reduced motion');
    assert.deepEqual(calm.map((x) => x[0]), a.map((x) => x[0]), 'the rumble still comes (its sound plays)');
    assert.equal(rumbleShare(r), 0.2);
    assert.equal(rumbleEnvelope(0), 0);
    assert.equal(rumbleEnvelope(0.15), 1);
    assert.equal(rumbleEnvelope(1), 0);
    assert.equal(createRumbleClock(null, 'x').step(1).dx, 0);
  });

  it('seeded random is deterministic per seed', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    assert.equal(a(), b());
    assert.notEqual(seededRandom('y')(), seededRandom('x')());
  });
});

describe('zone effects: the view (pooled sprites)', () => {
  const s = street({
    emitters: [
      { id: 'fx_1', kind: 'steam', x: -1000, y: -60, period: [4, 6], burst: 2 },
      { id: 'fx_2', kind: 'lava', x: 1000, y: -60, rate: 10, height: 240 },
      { id: 'fx_3', kind: 'embers', layer: 'sky', x: 600, y: 1700 },
      { id: 'fx_4', kind: 'steam', layer: 'gone', x: 0, y: 0 },
      { id: 'fx_5', kind: 'steam', x: 0, y: -60, hidden: true },
    ],
  });

  it('makes every sprite once, as many as can be alive, and none per frame', () => {
    const { PIXI, made } = fakePixi();
    const view = fakeView(PIXI, s);
    const fx = createStreetEffects(s, PIXI, view, { reduced: false });
    const pooled = fx.stats().pooled;
    assert.equal(fx.stats().emitters, 3, 'a missing layer and a hidden effect make nothing');
    assert.equal(pooled, [0, 1, 2].reduce((n, i) => n + emitterPool(normaliseEmitter(s.emitters[i])), 0));
    const sprites = made.sprites;
    const cam = { x: 0, y: 0, w: 3000, h: 2400 };
    for (let i = 0; i < 600; i += 1) fx.update(1000 / 60, cam);
    assert.equal(made.sprites, sprites, 'no sprite made after the first');
    assert.ok(fx.stats().live > 0 && fx.stats().live <= pooled);
    // Each emitter's box sits beside its layer's container, just above it.
    const boxes = view.root.children.filter((c) => String(c.label || '').startsWith('fx:'));
    assert.deepEqual(boxes.map((b) => b.label).sort(), ['fx:fx_1', 'fx:fx_2', 'fx:fx_3']);
    assert.equal(boxes.find((b) => b.label === 'fx:fx_1').zIndex, 5, 'just above the middleground (z 0)');
    assert.equal(boxes.find((b) => b.label === 'fx:fx_3').zIndex, -25, 'just above the sky (z -3)');
    fx.destroy();
    assert.ok(boxes.every((b) => b.destroyed));
  });

  it('an emitter off screen stops; reduced motion makes a smaller pool; always makes a still', () => {
    const { PIXI } = fakePixi();
    const fx = createStreetEffects(s, PIXI, fakeView(PIXI, s), { reduced: false });
    for (let i = 0; i < 240; i += 1) fx.update(1000 / 60, { x: 0, y: 0, w: 900, h: 600 });
    assert.equal(fx.stats().running, 0, 'nothing near a view at the top-left corner');
    assert.equal(fx.stats().live, 0);
    const calm = createStreetEffects(s, PIXI, fakeView(PIXI, s), { reduced: true });
    assert.ok(calm.stats().pooled < fx.stats().pooled);
    assert.equal(calm.stats().reduced, true);
    const still = createStreetEffects(s, PIXI, fakeView(PIXI, s), { reduced: false, always: true });
    still.simulate(2.2);
    assert.ok(still.emitters.every((em) => em.live > 0), 'every emitter puffing in a still');
  });

  it('a rumble boosts the emitters while it shakes, and comes back as the frame\'s offset', () => {
    const { PIXI } = fakePixi();
    const r = street({ emitters: [{ id: 'fx_1', kind: 'steam', x: 0, y: -60, rate: 2, period: [100, 120], burst: 0.5 }], rumble: { every: [6, 8], duration: 2, strength: 6 } });
    const fx = createStreetEffects(r, PIXI, fakeView(PIXI, r), { reduced: false });
    let shook = 0;
    let started = 0;
    for (let i = 0; i < 60 * 5; i += 1) {
      const o = fx.update(1000 / 60, { x: 0, y: 0, w: 3000, h: 2400 });
      if (o.dx || o.dy) shook += 1;
      if (o.started) started += 1;
    }
    assert.equal(started, 1);
    assert.ok(shook > 60, String(shook));
    assert.ok(fx.stats().live > 0, 'the rumble shook some steam loose outside its burst');
  });
});

describe('zone effects: the game (js/features/zone-effects-feature.js)', () => {
  const engine = (calls, s) => {
    const { PIXI } = fakePixi();
    return { PIXI, streetView: fakeView(PIXI, s), camera: { x: 0, y: 0, w: 3000, h: 2400 }, nudgeCamera: (dx, dy) => calls.nudges.push([dx, dy]), playSound: (k) => calls.sounds.push(k), setData: () => {} };
  };
  it('a zone street\'s rumble shakes the camera and plays its sound; a shipped street gets nothing', () => {
    const s = street({ rumble: { every: [6, 8], duration: 1, strength: 6 } });
    const calls = { nudges: [], sounds: [] };
    const e = engine(calls, s);
    zoneEffectsFeature.onStreetEnter(s, e);
    for (let i = 0; i < 60 * 4; i += 1) zoneEffectsFeature.onTick(1000 / 60, i * 16, e);
    assert.deepEqual(calls.sounds, [RUMBLE_SOUND]);
    assert.ok(calls.nudges.length > 30);
    zoneEffectsFeature.onStreetClear(e);
    const shipped = { ...s, tsid: 'GLI2V0UN7RD1T2J' };
    const quiet = { nudges: [], sounds: [] };
    const e2 = engine(quiet, shipped);
    zoneEffectsFeature.onStreetEnter(shipped, e2);
    for (let i = 0; i < 60 * 4; i += 1) zoneEffectsFeature.onTick(1000 / 60, i * 16, e2);
    assert.deepEqual(quiet, { nudges: [], sounds: [] });
  });
  it('no shipped street carries effects', () => {
    const index = json('public/assets/streets/index.json').streets;
    for (const tsid of Object.keys(index).slice(0, 400)) {
      const f = index[tsid].file;
      if (!f) continue;
      const text = readFileSync(join(GAME_DIR, 'public', f), 'utf8');
      assert.ok(!text.includes('"emitters"') && !text.includes('"rumble"'), tsid);
    }
  });
});

describe('zone effects: the CLI (tools/builder/cli.mjs)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zone-fx-'));
  const file = join(dir, 'zone.json');
  writeFileSync(file, readFileSync(join(GAME_DIR, 'tests/fixtures/builder/mossy-hollow.zone.json')));
  const env = { GRODDLE_BUILDER_HOME: join(dir, 'home') };
  const cli = (...argv) => run([...argv, `file:${file}`, '--json'], { env });

  it('effect, set and rm by fx_ id, rumble on and off, effects', async () => {
    let r = await cli('effect', '--street', 'lane', '--kind', 'steam', '--x', '0', '--y', '-60');
    assert.equal(r.out.id, 'lane/fx_1');
    r = await cli('effect', '--street', 'lane', '--kind', 'lava', '--x', '300', '--y', '-60', '--period', '5,3', '--burst', '1', '--sprite', 'bush_3');
    assert.equal(r.out.id, 'lane/fx_2');
    r = await cli('effect', '--street', 'lane', '--kind', 'embers', '--x', '0', '--y', '-60', '--always');
    await cli('set', 'lane/fx_1', 'rate=3', 'period=[4,9]');
    await cli('rumble', '--street', 'lane', '--every', '12,25', '--strength', '5');
    let zone = JSON.parse(readFileSync(file, 'utf8'));
    const s = zone.streets.find((x) => x.key === 'lane').street;
    assert.deepEqual(s.emitters.map((e) => [e.id, e.kind, e.period || null]), [['fx_1', 'steam', [4, 9]], ['fx_2', 'lava', [3, 5]], ['fx_3', 'embers', null]]);
    assert.equal(s.emitters[0].rate, 3);
    assert.deepEqual(s.rumble, { every: [12, 25], duration: 1.6, strength: 5 });
    assert.ok(zone.assets.bush_3, 'a library particle sprite brings its provenance row');
    const rep = (await cli('effects', '--street', 'lane')).out;
    assert.equal(rep[0].emitters.length, 3);
    assert.equal(rep[0].rumble.share, 0.13);
    await cli('rm', 'lane/fx_3');
    await cli('rumble', '--street', 'lane', '--off');
    zone = JSON.parse(readFileSync(file, 'utf8'));
    const s2 = zone.streets.find((x) => x.key === 'lane').street;
    assert.equal(s2.emitters.length, 2);
    assert.equal(s2.rumble, undefined);
    const v = await cli('validate');
    assert.equal(v.out.counts.fatal + v.out.counts.error, 0, JSON.stringify(v.out.findings.filter((f) => f.severity !== 'info')));
  });

  it('refuses a kind or a layer the street does not have', () => {
    const zone = JSON.parse(readFileSync(join(GAME_DIR, 'tests/fixtures/builder/mossy-hollow.zone.json'), 'utf8'));
    assert.throws(() => effectOps(zone, { street: 'lane', kind: 'smoke', x: 0, y: 0 }), /--kind/);
    assert.throws(() => effectOps(zone, { street: 'lane', kind: 'steam', layer: 'nope', x: 0, y: 0 }), /no layer "nope"/);
    assert.deepEqual(rumbleOps(zone, 'lane', { off: true }), [{ op: 'street.set', street: 'lane', set: {}, unset: ['rumble'] }]);
    assert.deepEqual(effectsReport(zone, 'lane')[0].cost, { emitters: 0, particles: 0, overdraw: 0 });
  });
});

describe('zone effects: the editor\'s helpers (js/builder/editor-effects.js)', () => {
  it('a new kind takes its defaults where the effect still had the old kind\'s', () => {
    assert.deepEqual(kindChange({ kind: 'steam', rate: EFFECT_DEFAULTS.steam.rate, size: 99 }, 'lava'), { kind: 'lava', rate: EFFECT_DEFAULTS.lava.rate, height: EFFECT_DEFAULTS.lava.height, spread: EFFECT_DEFAULTS.lava.spread });
    assert.match(costWords(street()), /No effects/);
    assert.match(costWords(street({ emitters: [{ id: 'fx_1', kind: 'steam', x: 0, y: -60 }] })), /^1 effect: at most \d+ particles/);
  });
});

describe('the play-test draws a draft\'s new art (draft-play.js useDraftArt)', () => {
  it('adds each gz_ name to the renderer\'s set and routes its URL to /builder-art/', async () => {
    const routes = [];
    const set = new Set(['bush_3']);
    const sha = 'a'.repeat(64);
    const names = await useDraftArt({ gz_ai_basalt_ledge_small: { sha256: sha }, gz_bad: { sha256: 'nope' }, bush_9: { sha256: sha } }, { textures: { addUrlRoute: (name, fn) => routes.push([name, fn]) }, manifest: async () => set });
    assert.deepEqual(names, ['gz_ai_basalt_ledge_small']);
    assert.ok(set.has('gz_ai_basalt_ledge_small'));
    assert.equal(routes.length, 1);
    assert.equal(routes[0][1]('assets/decos/groddle/gz_ai_basalt_ledge_small.png'), `/builder-art/${sha}`);
    assert.deepEqual(await useDraftArt(null, { textures: {}, manifest: async () => set }), []);
  });
});

describe('the site keeps effects and hands the play-test its art (groddle-afternoon-site)', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
  const zone = () => {
    const z = json('tests/fixtures/builder/mossy-hollow.zone.json');
    z.streets[0].street.emitters = [{ id: 'fx_1', kind: 'steam', x: 0, y: -60 }];
    z.streets[0].street.rumble = { every: [14, 30], duration: 1.6, strength: 6 };
    return z;
  };
  it('the store\'s check passes effects and refuses a bad one', () => {
    const check = (z) => JSON.parse(php(`require ${JSON.stringify(SITE_DIR)} . '/src/BuilderOpError.php'; require ${JSON.stringify(SITE_DIR)} . '/src/BuilderOps.php'; echo json_encode(Groddle\\Minn\\BuilderOps::check(json_decode(stream_get_contents(STDIN), false), 'mossy-hollow'));`, z));
    assert.deepEqual(check(zone()), []);
    const bad = zone();
    bad.streets[0].street.emitters.push({ id: 'fx_2', kind: 'smoke', x: 0, y: 0 });
    bad.streets[0].street.rumble = { every: 5 };
    const words = JSON.stringify(check(bad));
    assert.match(words, /An effect has a kind/);
    assert.match(words, /A rumble has every/);
  });
  it('the play bundle carries the zone\'s new art by name and sha256, nothing else', () => {
    const z = zone();
    z.assets.gz_ai_basalt_ledge_small = { origin: 'new', licence: 'ai-generated', sha256: 'b'.repeat(64), author: 'x' };
    const out = JSON.parse(php(`require ${JSON.stringify(SITE_DIR)} . '/src/AdminBuilder.php'; echo json_encode(Groddle\\Minn\\AdminBuilder::bundle(json_decode(stream_get_contents(STDIN), false)));`, z));
    assert.deepEqual(out.art, { gz_ai_basalt_ledge_small: { sha256: 'b'.repeat(64) } });
    assert.deepEqual(out.streets[z.streets[0].street.tsid].rumble, z.streets[0].street.rumble);
  });
});

describe('fixes found building Mount Ashomel', () => {
  it('a draft\'s new art reaches /builder-art/ on raw loads too (the layers behind the middleground)', () => {
    const sha = 'c'.repeat(64);
    textures.addUrlRoute('test-3x', (u) => (u.endsWith('.png') ? u.replace('.png', '@3x.png') : null));
    installNewArt(textures, () => ({ gz_ai_basalt_ridge: { origin: 'new', sha256: sha } }));
    assert.equal(textures.routeUrl('assets/decos/groddle/gz_ai_basalt_ridge.webp', { raw: true }), `/builder-art/${sha}`);
    assert.equal(textures.routeUrl('assets/decos/groddle/bush_3.png', { raw: true }), 'assets/decos/groddle/bush_3.png', 'a raw load skips the resolution routes');
    assert.equal(textures.routeUrl('assets/decos/groddle/bush_3.png'), 'assets/decos/groddle/bush_3@3x.png');
  });
  it('cli ladder tiles by default (a bare ladder draws nothing); place sizes zone art from its intake row', async () => {
    assert.deepEqual(Object.keys(LADDER_TILINGS), ['wood', 'stone']);
    assert.equal(ladderTiling('none'), null);
    assert.ok(ladderTiling().centers.length);
    assert.throws(() => ladderTiling('gold'), /--tiling/);
    const zone = json('tests/fixtures/builder/mossy-hollow.zone.json');
    zone.assets.gz_ai_rock = { origin: 'new', licence: 'ai-generated', sha256: 'd'.repeat(64), w: 420, h: 302 };
    const { ops } = placeOps(zone, { street: 'lane', sprite: 'gz_ai_rock', x: 0, y: -60 }, []);
    assert.deepEqual([ops[0].deco.w, ops[0].deco.h], [210, 151]);
  });
});

describe('a zone street shows its street map (spec 15 Q11)', () => {
  it('templates no longer set noMap', () => {
    const s = newStreet({ zoneId: 'zz', key: 'lane', label: 'Cinder Steps', template: 'tall', hub: { id: '900', name: 'Mount Emberlee' }, profiles: json('public/assets/content/style-profiles.json'), tsid: 'GZTEST000000001', catalog: new Map() });
    assert.equal(s.street.noMap, undefined);
  });
});
