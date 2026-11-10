/**
 * A painted look's sheets on demand (G614): only the base sheet (stand and walk) is painted
 * when a look first shows; jump, climb and the emotions are painted the first time an
 * animation needs them. Until then their frames hold the original client's stand-ins (the
 * walk's stride for a jump, the stand for an emotion, the placeholder avatar's climb), and
 * they fill in place.
 * js/avatar-pack.js (the pack rules), js/avatar-compositor.js (bakeSheet, bakeLook's `sheets`),
 * and the wiring in game.js and the realtime feature.
 * Run: node --test tests/avatar-pack.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LATE_SHEETS, anchorSheetFrames, ensureAnimSheets, ensureLateSheet, fillPackAnims, lateSheetsForAnim, packComplete, redrawFrame, sheetsForAnim, showsStandIn, standInFrame,
} from '../public/js/avatar-pack.js?v=d8fba962';
import { ANIMS, CORE_SHEETS, FALL_LOOP, SHEET_FRAMES, animForState, frameRef } from '../public/js/avatar-anims.js?v=fb921bf4';
import { SHEET_ORDER, bakeLook, bakeSheet } from '../public/js/avatar-compositor.js?v=02e642c7';
import { expandRig, lookMatrices, slotAssignments } from '../public/js/avatar-rig.js?v=b67f0da8';
import { expandCatalog, resolveLook } from '../public/js/avatar-looks.js?v=64fab53e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const read = (rel, optional = false) => { try { return readFileSync(join(root, rel), 'utf8'); } catch (e) { if (optional) return null; throw e; } };
const json = (rel) => JSON.parse(read(rel));

/** The body of `function name(` in `src`, up to the next top-level function. */
function fnBody(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is in the source`);
  return src.slice(at, src.indexOf('\n}\n', at));
}

/** A sheet of stand-in frames: each knows its sheet and cell, as a texture would. */
const fakeSheet = (name) => ({ frames: SHEET_FRAMES[name].map((fn, index) => ({ sheet: name, index, fn })) });
const DEF = { fw: 100, fh: 200, midX: 40, feetY: 190 };
/** A pack as game.js animPackFromSheets makes it for a painted look: the base sheet only. */
function basePack(lateLoader = null, placeholder = null) {
  const pack = { key: 'k', sheets: { base: fakeSheet('base') }, av: { sheets: { base: DEF } }, idleLoader: null, idleLoading: new Map(), lateLoader, lateLoading: new Map(), placeholder, anims: {} };
  anchorSheetFrames(pack.sheets.base, DEF);
  return fillPackAnims(pack);
}
const isStand = (tex) => tex.sheet === 'base' && tex.fn === 801;
/** The walk's stride the original client held for a jump (standin_frame 107). */
const isStride = (tex) => tex.sheet === 'base' && tex.fn === 107;
/** The placeholder avatar's sheets (the default look's), told apart by `who`. */
const placeholderLook = () => ({ sheets: { climb: { frames: SHEET_FRAMES.climb.map((fn, index) => ({ who: 'placeholder', sheet: 'climb', index, fn })) } } });

describe('which sheet an animation draws from', () => {
  it('the late sheets are every core sheet but the base, the ones the compositor paints', () => {
    assert.deepEqual([...LATE_SHEETS].sort(), SHEET_ORDER.filter((n) => n !== 'base').sort());
    assert.deepEqual([...LATE_SHEETS], CORE_SHEETS.filter((n) => n !== 'base'));
    assert.ok(!LATE_SHEETS.includes('base'));
  });

  it('the stand and the walk need only the base sheet', () => {
    for (const st of ['stand', 'idle0', 'walk1x', 'walk2x', 'hit1', 'hit2']) {
      const { anim } = animForState(st, { idles: false });
      assert.deepEqual(sheetsForAnim(anim), ['base'], st);
      assert.deepEqual(lateSheetsForAnim(anim), [], st);
    }
  });

  it('a jump, a climb and each emotion name their sheet', () => {
    for (const st of ['lift', 'fall', 'land']) assert.deepEqual(lateSheetsForAnim(animForState(st).anim), ['jump'], st);
    assert.deepEqual(lateSheetsForAnim('fallLoop'), ['jump']);
    for (const st of ['climb', 'climbPause']) assert.deepEqual(lateSheetsForAnim(animForState(st).anim), ['climb'], st);
    for (const e of ['happy', 'surprise', 'angry']) assert.deepEqual(lateSheetsForAnim(e), [e]);
    // The idles draw from the idle sheets (their own on-demand loader), never a late sheet.
    for (const a of ['idle1', 'idle2', 'idle3', 'idle4', 'afk', 'idleSleepyEnd']) assert.deepEqual(lateSheetsForAnim(a), [], a);
    assert.deepEqual(sheetsForAnim('no such animation'), []);
  });
});

describe('a pack with only its base sheet', () => {
  it('has every animation, each frame a real texture: the walk its own, the rest a stand-in from the base sheet', () => {
    const pack = basePack();
    for (const [name, list] of Object.entries({ ...ANIMS, fallLoop: FALL_LOOP })) {
      assert.equal(pack.anims[name].length, list.length, name);
      list.forEach((fn, i) => {
        const tex = pack.anims[name][i];
        assert.ok(tex, `${name}[${i}] is never missing`);
        assert.equal(tex.sheet, 'base', `${name}[${i}] is a base frame`);
        if (frameRef(fn).sheet === 'base') assert.equal(tex.fn, fn, `${name}[${i}]`);
        else assert.equal(tex.fn, standInFrame(name), `${name}[${i}] holds its stand-in`);
      });
    }
    assert.ok(pack.anims.afk.length > 0 && pack.anims.afk.every(Boolean));
    assert.ok(isStand(pack.anims.idle0[0]) && pack.anims.idle0[0].index === 14);
    assert.equal(packComplete(pack), true, 'no late loader: the default look, complete as it is');
    assert.equal(packComplete(basePack(async () => null)), false, 'a painted look with only its base');
    assert.equal(packComplete(null), false);
  });

  it('every frame carries the feet anchor of its own sheet', () => {
    const pack = basePack();
    assert.deepEqual(pack.anims.walk2x[0].defaultAnchor, { x: 0.4, y: 0.95 });
  });

  it('holds the stand-ins the original client held (AvatarAnimationDefinitions.as standin_frame)', () => {
    // The jumps: the walk's stride 107. The emotions and the idles: the stand 801.
    for (const a of ['jumpOver_lift', 'jumpOver_fall', 'jumpOver_land', 'fallLoop']) assert.equal(standInFrame(a), 107, a);
    for (const a of ['happy', 'surprise', 'angry', 'idle1', 'idle2', 'idle3', 'idle4', 'idleSleepyStart', 'idleSleepyLoop', 'idleSleepyEnd', 'climb']) assert.equal(standInFrame(a), 801, a);
    const pack = basePack(async () => null);
    assert.ok(pack.anims.jumpOver_lift.every(isStride) && pack.anims.jumpOver_land.every(isStride) && pack.anims.fallLoop.every(isStride));
    for (const e of ['happy', 'surprise', 'angry']) assert.ok(pack.anims[e].every(isStand), e);
    assert.ok(pack.anims.idle4.every(isStand));
    // Every stand-in frame is in the base sheet ("must be in base sheet!").
    for (const a of Object.keys(ANIMS)) assert.equal(frameRef(standInFrame(a)).sheet, 'base', a);
    // The source reads its numbers the same way.
    const defs = read('../glitch-client/com/tinyspeck/core/data/AvatarAnimationDefinitions.as', true);
    if (defs) {
      const standin = (anim) => Number(new RegExp(`'${anim}': \\{[^}]*?standin_frame: (\\d+)`).exec(defs)?.[1]);
      for (const a of ['jumpOver_lift', 'jumpOver_fall', 'jumpOver_land']) assert.equal(standin(a), 107, a);
      for (const a of ['happy', 'surprise', 'angry', 'idle1', 'idle4']) assert.equal(standin(a), 801, a);
      assert.equal(standin('climb'), 0, 'the climb has no base stand-in: the placeholder shows');
    }
  });

  it('a climb shows the placeholder avatar climbing, not a side view, until its own sheet is in', async () => {
    const def = { fw: 120, fh: 240, midX: 60, feetY: 180 };
    const pack = basePack(async (name) => ({ def, frames: fakeSheet(name).frames }), placeholderLook());
    const climb = pack.anims.climb;
    assert.deepEqual(climb.map((t) => [t.who, t.fn]), ANIMS.climb.map((fn) => ['placeholder', fn]), 'the placeholder look, frame for frame');
    // Only the climb borrows: a jump and an emotion hold frames of the look's own base sheet.
    assert.ok(pack.anims.jumpOver_lift.every(isStride) && pack.anims.happy.every(isStand));
    assert.equal(showsStandIn(pack, 'climb', climb[3]), true);
    await ensureLateSheet(pack, 'climb');
    assert.equal(pack.anims.climb, climb, 'the same list');
    assert.ok(climb.every((t) => t.sheet === 'climb' && !t.who), 'the look\'s own climb');
    assert.equal(showsStandIn(pack, 'climb', climb[3]), false);
    // With no placeholder to borrow from (the default sheets never loaded) it holds the stand.
    assert.ok(basePack(async () => null).anims.climb.every(isStand));
  });

  it('showsStandIn tells a held frame from a real one', async () => {
    const def = { fw: 120, fh: 240, midX: 60, feetY: 180 };
    const pack = basePack(async (name) => ({ def, frames: fakeSheet(name).frames }));
    assert.equal(showsStandIn(pack, 'jumpOver_lift', pack.anims.jumpOver_lift[2]), true);
    assert.equal(showsStandIn(pack, 'walk2x', pack.anims.walk2x[2]), false, 'the walk never holds');
    assert.equal(showsStandIn(pack, 'idle0', pack.anims.idle0[0]), false);
    assert.equal(showsStandIn(pack, 'happy', null), false);
    await ensureLateSheet(pack, 'jump');
    assert.equal(showsStandIn(pack, 'jumpOver_lift', pack.anims.jumpOver_lift[2]), false);
    assert.equal(showsStandIn(pack, 'happy', pack.anims.happy[2]), true);
  });
});

describe('painting a late sheet when first needed', () => {
  const jumpDef = { fw: 120, fh: 240, midX: 60, feetY: 180 };

  it('one paint however many ask, and the frames fill in place', async () => {
    let paints = 0;
    let release;
    const gate = new Promise((r) => { release = r; });
    const pack = basePack(async (name) => { paints += 1; await gate; return { def: jumpDef, frames: fakeSheet(name).frames }; });
    const lift = pack.anims.jumpOver_lift;
    const walk = pack.anims.walk2x;
    const ready = [];
    const opts = { onReady: (p, name) => ready.push([name, p.anims.jumpOver_lift[0].sheet]) };
    const a = ensureLateSheet(pack, 'jump', opts);
    const b = ensureLateSheet(pack, 'jump', opts);
    ensureAnimSheets(pack, 'jumpOver_fall', opts);
    ensureAnimSheets(pack, 'walk2x', opts);
    assert.equal(a, b, 'the same job');
    assert.ok(lift.every(isStride), 'the stride is held while it paints');
    release();
    assert.deepEqual(await Promise.all([a, b]), [true, true]);
    assert.equal(paints, 1);
    // The same list objects a sprite was given now hold the jump's frames, in order.
    assert.equal(pack.anims.jumpOver_lift, lift);
    assert.equal(pack.anims.walk2x, walk);
    assert.deepEqual(lift.map((t) => [t.sheet, t.fn]), ANIMS.jumpOver_lift.map((fn) => ['jump', fn]));
    assert.ok(pack.anims.fallLoop.every((t) => t.sheet === 'jump'));
    assert.ok(pack.anims.climb.every(isStand), 'the climb still waits for its own sheet');
    // The new frames are anchored on the standing feet of their own sheet, so nothing moves.
    assert.deepEqual(lift[0].defaultAnchor, { x: 0.5, y: 0.75 });
    assert.equal(pack.av.sheets.jump, jumpDef);
    // The hook ran once, after the frames were in.
    assert.deepEqual(ready, [['jump', 'jump']]);
    assert.equal(await ensureLateSheet(pack, 'jump', opts), true);
    assert.equal(paints, 1, 'a sheet in the pack is never painted again');
  });

  it('asking for an animation paints exactly the sheets it draws from', async () => {
    const asked = [];
    const pack = basePack(async (name) => { asked.push(name); return { def: jumpDef, frames: fakeSheet(name).frames }; });
    ensureAnimSheets(pack, 'walk2x');
    ensureAnimSheets(pack, 'idle0');
    await Promise.resolve();
    assert.deepEqual(asked, []);
    ensureAnimSheets(pack, 'happy');
    ensureAnimSheets(pack, 'climb');
    await Promise.all([...pack.lateLoading.values()]);
    assert.deepEqual(asked, ['happy', 'climb']);
    assert.equal(packComplete(pack), false);
    await Promise.all(LATE_SHEETS.map((n) => ensureLateSheet(pack, n)));
    assert.equal(packComplete(pack), true);
    assert.deepEqual(asked.slice().sort(), [...LATE_SHEETS].sort());
    for (const [name, list] of Object.entries(ANIMS)) list.forEach((fn, i) => { if (CORE_SHEETS.includes(frameRef(fn).sheet)) assert.equal(pack.anims[name][i].fn, fn, name); });
  });

  it('a look freed while its sheet painted leaves the pack as it was', async () => {
    const ready = [];
    const pack = basePack(async () => null);
    assert.equal(await ensureLateSheet(pack, 'climb', { onReady: () => ready.push(1) }), false);
    assert.equal(pack.sheets.climb, undefined);
    assert.ok(pack.anims.climb.every(isStand));
    assert.deepEqual(ready, []);
  });

  it('a failed paint is warned about, holds the stand, and may be asked for again', async () => {
    let n = 0;
    const warned = [];
    const pack = basePack(async (name) => { n += 1; if (n === 1) throw new Error('no canvas'); return { def: jumpDef, frames: fakeSheet(name).frames }; });
    const opts = { warn: (...a) => warned.push(a[1]) };
    assert.equal(await ensureLateSheet(pack, 'angry', opts), false);
    assert.deepEqual(warned, ['angry']);
    assert.ok(pack.anims.angry.every(isStand));
    assert.equal(await ensureLateSheet(pack, 'angry', opts), true);
    assert.ok(pack.anims.angry.every((t) => t.sheet === 'angry'));
  });

  it('nothing is asked of a pack without a loader, or for a sheet that is not a late one', async () => {
    const pack = basePack();
    assert.equal(await ensureLateSheet(pack, 'jump'), false);
    assert.equal(await ensureLateSheet(basePack(async () => { throw new Error('never'); }), 'idle4'), false);
    assert.equal(await ensureLateSheet(basePack(async () => { throw new Error('never'); }), 'base'), false);
    assert.equal(await ensureLateSheet(null, 'jump'), false);
    ensureAnimSheets(null, 'happy');
    ensureAnimSheets(pack, 'happy');
    assert.equal(pack.lateLoading.size, 0);
  });
});

describe('a sprite on a refilled frame list', () => {
  const sprite = (textures, currentFrame) => ({ textures, currentFrame, texture: textures[currentFrame], updateAnchor: true, playing: true, anchor: { at: null, copyFrom(a) { this.at = a; } } });

  it('shows the frame it is on from the new sheet, keeps its place, and takes that sheet\'s anchor', async () => {
    const def = { fw: 120, fh: 240, midX: 60, feetY: 180 };
    const pack = basePack(async (name) => ({ def, frames: fakeSheet(name).frames }));
    const s = sprite(pack.anims.jumpOver_lift, 5);
    assert.ok(isStride(s.texture));
    assert.equal(redrawFrame(s), false, 'nothing new yet');
    await ensureLateSheet(pack, 'jump');
    assert.equal(redrawFrame(s), true);
    assert.equal(s.texture.fn, ANIMS.jumpOver_lift[5]);
    assert.equal(s.currentFrame, 5);
    assert.equal(s.playing, true);
    assert.deepEqual(s.anchor.at, { x: 0.5, y: 0.75 });
    assert.equal(redrawFrame(s), false, 'already showing it');
  });

  it('leaves a destroyed or empty sprite alone', () => {
    assert.equal(redrawFrame(null), false);
    assert.equal(redrawFrame({ textures: [], currentFrame: 0 }), false);
    assert.equal(redrawFrame({ textures: [{}], currentFrame: 0, destroyed: true, texture: null }), false);
  });
});

describe('the compositor paints one sheet at a time with the same drawing as a whole look', () => {
  const A = join(pub, 'assets/avatar');
  const rig = expandRig(JSON.parse(readFileSync(join(A, 'base.json'), 'utf8')));
  const catalog = expandCatalog(JSON.parse(readFileSync(join(A, 'catalog.json'), 'utf8')));

  /**
   * Every 2D call on every canvas, hashed in order: the same hash is the same picture. The
   * compositor keeps its blend layers between bakes, so the canvases outlive a run and write
   * to whichever run is recording.
   */
  let sink = null;
  const show = (v) => {
    if (typeof v === 'number') return v.toFixed(3);
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') return v.key || v.constructor?.name || 'o';
    return String(v);
  };
  function recordingCanvas() {
    const c = { width: 0, height: 0, key: 'canvas' };
    const ctx = new Proxy({ canvas: c }, {
      get: (o, k) => (k in o ? o[k] : (...args) => { sink.calls += 1; sink.hash.update(`${String(k)}(${args.map(show).join(',')});`); return { key: `${String(k)}#`, addColorStop() {}, setTransform() {} }; }),
      set: (o, k, v) => { o[k] = v; sink.hash.update(`${String(k)}=${show(v)};`); return true; },
    });
    c.getContext = () => ctx;
    return c;
  }

  function prepFor(look) {
    const articles = new Map();
    for (const [type, a] of Object.entries(look.outfit)) articles.set(a.name, json(`public/assets/avatar/articles/${type}/${a.name}.json`));
    const sources = new Map([['base', { shapes: rig.shapes, bitmaps: new Map() }]]);
    for (const [name, data] of articles) sources.set(name, { shapes: data.shapes, bitmaps: new Map() });
    const ctx = {
      rig,
      sources,
      look: { assign: slotAssignments(look.outfit, { hatAllowsHair: (h, r) => Boolean(catalog.hatHair[h.name]?.includes(r.name)) }), articles, matrices: lookMatrices(look), face: look.face || {} },
      standSoleRow: 0,
    };
    ctx.shapeOf = (src, id) => sources.get(src)?.shapes?.[id];
    return ctx;
  }

  /** Run `fn` with a recording canvas standing in for the browser's; resolves what was drawn. */
  async function drawn(fn) {
    const before = { document: globalThis.document, Path2D: globalThis.Path2D, DOMMatrix: globalThis.DOMMatrix };
    sink = { hash: createHash('sha256'), calls: 0 };
    globalThis.document = { createElement: recordingCanvas };
    globalThis.Path2D = class { constructor(d) { this.key = `path:${d ? createHash('sha1').update(String(d)).digest('hex').slice(0, 12) : ''}`; } addPath(p, m) { this.key += `+${p.key}@${(m?.v || []).map((x) => x.toFixed(3)).join(' ')}`; } rect(...a) { this.key += `rect${a.join(' ')}`; } };
    globalThis.DOMMatrix = class { constructor(v) { this.v = v; this.key = `m:${v.map((x) => x.toFixed(3)).join(' ')}`; } };
    try {
      const out = await fn();
      return { out, digest: sink.hash.digest('hex'), calls: sink.calls };
    } finally {
      globalThis.document = before.document;
      globalThis.Path2D = before.Path2D;
      globalThis.DOMMatrix = before.DOMMatrix;
    }
  }

  const look = resolveLook({ outfit: { hair: 'Buzzcut' } }, catalog);

  it('bakeLook with sheets: [base] paints the base sheet only, the same as the whole look\'s', async () => {
    const whole = await drawn(() => bakeLook(prepFor(look), 3, { sheets: ['base'] }));
    const order = [];
    const sliced = await drawn(() => bakeLook(prepFor(look), 3, { sheets: ['base'], budgetMs: 1e-9, onSheet: (name) => order.push(name) }));
    assert.deepEqual(Object.keys(whole.out.sheets), ['base']);
    assert.deepEqual(order, ['base']);
    assert.deepEqual(sliced.out.sheets.base.def, whole.out.sheets.base.def);
    assert.ok(whole.calls > 1000, 'the recorder saw the painting');
    // Without the two warm-up paints of the stand (a 1 px canvas), the slices draw what one go draws.
    const all = await drawn(() => bakeLook(prepFor(look), 3));
    assert.deepEqual(Object.keys(all.out.sheets), [...SHEET_ORDER], 'no sheets named: all six, as the offline build paints them');
    assert.deepEqual(all.out.sheets.base.def, whole.out.sheets.base.def);
    assert.equal(all.out.sheets.base.canvas.width, whole.out.sheets.base.canvas.width);
  });

  it('bakeSheet draws a late sheet call for call as bakeLook draws it', async () => {
    for (const name of LATE_SHEETS) {
      const whole = await drawn(() => bakeLook(prepFor(look), 3, { sheets: [name] }));
      const late = await drawn(() => bakeSheet(prepFor(look), name, 3, { budgetMs: 1e-9 }));
      assert.deepEqual(late.out.def, whole.out.sheets[name].def, name);
      assert.equal(late.out.canvas.width, whole.out.sheets[name].canvas.width, name);
      assert.equal(late.out.canvas.height, whole.out.sheets[name].canvas.height, name);
      assert.equal(late.digest, whole.digest, `${name}: the same calls in the same order`);
      assert.equal(late.out.stats.slices, SHEET_FRAMES[name].length, `${name}: a slice a frame at a budget no frame fits in`);
      assert.ok(late.calls > 1000, name);
    }
  });
});

describe('game wiring (G614)', () => {
  const game = read('public/game.js');
  const realtime = read('public/js/features/realtime-feature.js');

  it('a painted look paints only its base sheet first, in slices, and the rest through the pack\'s late loader', () => {
    const body = fnBody(game, 'vectorAnimPack');
    assert.match(body, /bakeLook\(prep, scale, \{ budgetMs: VECTOR_BAKE_BUDGET_MS, sheets: \['base'\], stats: baseStats \}\)/);
    assert.match(body, /bakeSheet\(bake\.prep, name, scale, \{ budgetMs: VECTOR_BAKE_BUDGET_MS \}\)/);
    assert.match(body, /animPackFromSheets\(lk, \{ base: \{ frames: base\.frames \} \}, \{ sheets: \{ base: base\.def \} \}, idleLoader, lateLoader, climb \? \{ sheets: \{ climb \} \} : null\)/);
    // The placeholder is the default look's climb sheet (prerendered, never freed), anchored on its feet.
    assert.match(body, /const climb = textures\.vectorAvatarClimb\?\.frames\?\.length \? textures\.vectorAvatarClimb : null;\s*if \(climb\) anchorSheetFrames\(climb, VECTOR_AVATAR\.sheets\.climb\);/);
    // One late sheet at a time for a look, and a look freed meanwhile takes nothing.
    assert.match(body, /const job = bake\.late\.then\(async \(\) => \{\s*if \(vectorBakes\.get\(lk\) !== bake\) return null;/);
    assert.match(body, /bake\.late = job\.catch\(\(\) => \{\}\);/);
    assert.equal(body.match(/if \(vectorBakes\.get\(lk\) !== bake\) return null;/g).length, 2, 'checked before and after the paint');
  });

  it('every canvas a look paints is the bake\'s to free, and a freed look frees them all', () => {
    const body = fnBody(game, 'vectorAnimPack');
    assert.match(body, /const adopt = [\s\S]*?new PIXI\.CanvasSource\(\{ resource: canvas, resolution: scale, scaleMode: 'linear' \}\);\s*bake\.bases\.push\(base\);/);
    assert.match(body, /const sheet = adopt\(name, canvas, def, at, stats\);/);
    const trim = fnBody(game, 'trimVectorBakes');
    assert.match(trim, /for \(const base of bake\.bases\) base\.destroy\(\);\s*vectorBakes\.delete\(lk\);/);
    // Never the player's own look (worn or still painting), a look another player is drawn with, or one just asked for.
    assert.match(trim, /bake\.finishing \|\| bake\.ownKeys\.size \|\| player\?\.anims === bake\.pack\.anims \|\| heldGlitchAnims\.has\(bake\.pack\.anims\)/);
    assert.match(trim, /performance\.now\(\) - bake\.askedAt < VECTOR_BAKE_ASKED_MS/);
  });

  it('the player\'s own look goes on only with every sheet painted (no held frame on your own jump)', () => {
    assert.match(fnBody(game, 'makePlayer'), /getAppearanceTextures\(playerAppearance, \{ full: true \}\)/);
    assert.match(fnBody(game, 'applyPlayerAppearance'), /swapPlayerPack\(getAppearanceTextures\(playerAppearance, \{ full: true \}\)\)/);
    assert.equal(game.match(/getAppearanceTextures\(playerAppearance\b[^)]*\)/g).every((m) => /full: true/.test(m)), true, 'no other way onto the player');
    const get = fnBody(game, 'getAppearanceTextures');
    assert.match(get, /if \(cached && \(!full \|\| packComplete\(cached\)\)\) return cached;/);
    const pack = fnBody(game, 'vectorAnimPack');
    assert.match(pack, /if \(bake\?\.pack && \(!full \|\| packComplete\(bake\.pack\)\)\) return \{ \.\.\.bake\.pack, key \};/);
    assert.match(pack, /if \(full\) \{\s*bake\.ownKeys\.add\(key\);\s*finishOwnBake\(bake\);/);
    const finish = fnBody(game, 'finishOwnBake');
    assert.match(finish, /Promise\.all\(LATE_SHEETS\.map\(\(name\) => ensureLateSheet\(bake\.pack, name, LATE_SHEET_OPTS\)\)\)/);
    assert.match(finish, /if \(!packComplete\(bake\.pack\)\) return;[\s\S]*applyPlayerAppearance\(\);/);
  });

  it('other players\' looks come back with the base sheet alone (engine.glitchPack asks for no more)', () => {
    assert.match(game, /glitchPack\(look\) \{\s*return getAppearanceTextures\(normalizeAppearance\(\{ vector: [^}]*\} \}\)\);/);
    assert.match(game, /needGlitchAnim\(pack, anim\) \{\s*ensureAnimSheets\(pack, anim, LATE_SHEET_OPTS\);/);
    assert.match(fnBody(game, 'lateSheetReady'), /features\.collect\('glitchFramesReady', pack\.anims, engine\)/);
  });

  it('the realtime feature asks for an animation\'s sheet before it plays it, and redraws when it is in', () => {
    const apply = fnBody(realtime, 'applyAnim');
    const need = apply.indexOf('engine.needGlitchAnim?.(r.pack, anim)');
    assert.ok(need > 0 && need < apply.indexOf('r.body.textures = frames'), 'asked before the frames go on the sprite');
    assert.match(realtime, /glitchFramesReady\(anims\) \{\s*session\?\.framesReady\(anims\);/);
    assert.match(fnBody(realtime, 'framesReady'), /redrawFrame\(r\.body\)/);
  });

  it('game.js keeps no copy of the pack rules', () => {
    assert.doesNotMatch(game, /function fillPackAnims\(|function anchorSheetFrames\(/);
    assert.match(game, /import \{[^}]*\bfillPackAnims\b[^}]*\} from '\.\/js\/avatar-pack\.js/);
  });
});
