/**
 * Other Glitches as vector avatars: the NPC look set (js/npc-glitch-looks.js),
 * its baked sheets (js/npc-glitch-sheets.js, tools/avatar-compositor/npcs.mjs),
 * the runtime rig (js/npc-glitch.js) against a small Pixi stand-in, and that
 * every place another Glitch is drawn goes through engine.npcGlitch.
 * Run: node --test tests/npc-glitches.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogItem, expandCatalog } from '../public/js/avatar-looks.js';
import {
  NPC_GLITCH_ROSTER,
  buildNpcLooks,
  colourwayColor,
  colorDistance,
  hasSkippedArticle,
  looksDistinct,
  nameSeed,
  npcIdFor,
  npcIdleTiming,
  npcLookFields,
} from '../public/js/npc-glitch-looks.js';
import { NPC_GLITCH_HIRES, NPC_GLITCH_SHEETS } from '../public/js/npc-glitch-sheets.js';
import { IDLES_TO_RANDOM, SHEET_FRAMES } from '../public/js/avatar-anims.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const catalog = expandCatalog(JSON.parse(read('assets/avatar/catalog.json')));
const NPC_SHEETS = ['base', 'jump', 'climb', 'happy', 'surprise', 'angry', 'idle4', 'idle1', 'idle2', 'idle3'];

describe('NPC look generation (js/npc-glitch-looks.js)', () => {
  it('is deterministic for a fixed seed', () => {
    assert.deepEqual(buildNpcLooks(catalog), buildNpcLooks(catalog));
    const a = npcLookFields(catalog, { seed: 1234 });
    assert.deepEqual(npcLookFields(catalog, { seed: 1234 }), a);
    assert.notDeepEqual(npcLookFields(catalog, { seed: 98765 }).fields, a.fields);
  });

  it('matches the baked looks, so every name keeps its look across sessions and builds', () => {
    const built = buildNpcLooks(catalog).map(({ id, name, seed, fields }) => ({ id, name, seed, fields }));
    const baked = Object.values(NPC_GLITCH_SHEETS).map(({ id, name, seed, fields }) => ({ id, name, seed, fields }));
    assert.deepEqual(baked, built, 'js/npc-glitch-sheets.js is stale: rerun node tools/avatar-compositor/npcs.mjs');
    assert.deepEqual(Object.keys(NPC_GLITCH_SHEETS), NPC_GLITCH_ROSTER.map((r) => r.id));
  });

  it('uses only real GSJS articles, colourways and palette colours, and no costume pieces', () => {
    const skin = new Set(catalog.palettes.skin.map((p) => p.id));
    const hair = new Set(catalog.palettes.hair.map((p) => p.id));
    for (const look of Object.values(NPC_GLITCH_SHEETS)) {
      const f = look.fields;
      for (const [type, name] of Object.entries(f.outfit)) {
        if (name === 'none') continue;
        const item = catalogItem(catalog, type, name);
        assert.ok(item, `${look.name}: ${type}/${name} is in the catalog`);
        if (f.variant[type] !== undefined) assert.ok(f.variant[type] < (item.variants || []).length, `${look.name}: ${type} colourway exists`);
      }
      assert.ok(skin.has(f.skinColor), `${look.name}: skin palette colour`);
      assert.ok(hair.has(f.hairColor), `${look.name}: hair palette colour`);
      assert.equal(hasSkippedArticle(f), false, `${look.name}: no costume pieces`);
      assert.deepEqual(f.tint, {}, `${look.name}: colourways only, no custom tints`);
      if (f.outfit.hat && f.outfit.hat !== 'none') assert.ok(catalog.hatHair[f.outfit.hat]?.includes(f.outfit.hair), `${look.name}: hat allows the hair`);
    }
  });

  it('gives every Glitch its own look, distinct from the player default and each other', () => {
    const looks = Object.values(NPC_GLITCH_SHEETS).map((l) => l.fields);
    const d = catalog.defaultLook;
    const player = { outfit: d.outfit, skinColor: d.skinColor, hairColor: d.hairColor };
    for (const [i, a] of looks.entries()) {
      assert.ok(looksDistinct(a, player), `look ${i} differs from the player's default`);
      for (const b of looks.slice(i + 1)) assert.ok(looksDistinct(a, b));
    }
  });

  it("steers each top to its name's colour where a real colourway is close", () => {
    let matched = 0;
    for (const r of NPC_GLITCH_ROSTER) {
      const f = NPC_GLITCH_SHEETS[r.id].fields;
      const type = f.outfit.dress && f.outfit.dress !== 'none' ? 'dress' : 'shirt';
      const item = catalogItem(catalog, type, f.outfit[type]);
      const main = colourwayColor(item?.variants?.[f.variant[type] ?? 0]?.colors);
      if (main && colorDistance(main, r.color) <= 70) matched += 1;
    }
    assert.ok(matched >= 3, `${matched} of ${NPC_GLITCH_ROSTER.length} tops match their colour`);
  });

  it('maps names to roster looks: named ones their own, others a stable pick', () => {
    for (const r of NPC_GLITCH_ROSTER) {
      assert.equal(npcIdFor(r.name), r.id);
      assert.equal(npcIdFor(r.id), r.id);
    }
    const other = npcIdFor('Somebody Else');
    assert.ok(NPC_GLITCH_SHEETS[other]);
    assert.equal(npcIdFor('Somebody Else'), other);
    assert.equal(nameSeed('Amp'), nameSeed('Amp'));
  });

  it('offsets idle timing per Glitch so a group never idles in step', () => {
    const t = NPC_GLITCH_ROSTER.map((r) => npcIdleTiming(r.name));
    assert.deepEqual(npcIdleTiming('Amp'), t[0]);
    assert.equal(new Set(t.map((x) => x.loopOffset)).size, t.length, 'different idle4 start frames');
    assert.equal(new Set(t.map((x) => x.firstWaitMs)).size, t.length, 'different first random idle');
    for (const x of t) {
      assert.ok(x.loopOffset >= 0 && x.loopOffset < 51);
      assert.ok(x.firstWaitMs >= 5000 && x.firstWaitMs <= 19000);
      assert.ok(x.waitMs >= 12000 && x.waitMs <= 21000);
    }
    assert.notDeepEqual(npcIdleTiming('Amp', 0), npcIdleTiming('Amp', 1), 'salt varies the same name');
  });
});

describe('baked NPC sheets (js/npc-glitch-sheets.js)', () => {
  it('lists every sheet at 1x and 2x, with the files on disk', () => {
    assert.equal(NPC_GLITCH_HIRES, 2);
    for (const look of Object.values(NPC_GLITCH_SHEETS)) {
      assert.match(look.dir, /^assets\/sprites\/avatar\/npc\/[a-z-]+\/$/);
      assert.deepEqual(Object.keys(look.sheets).sort(), [...NPC_SHEETS].sort());
      for (const [name, s] of Object.entries(look.sheets)) {
        assert.equal(s.cells, SHEET_FRAMES[name].length, `${look.id}/${name} cells`);
        assert.ok(s.cols * s.rows >= s.cells);
        assert.ok(s.feetY > s.fh * 0.85 && s.feetY <= s.fh, `${look.id}/${name} feet near the bottom`);
        assert.ok(s.midX > 0 && s.midX < s.fw);
        assert.match(s.hires, /@2x\.webp$/);
        for (const f of [s.file, s.hires]) assert.ok(existsSync(join(PUBLIC, look.dir, f)), `${look.dir}${f}`);
      }
    }
  });

  it('draws no Wayback player pixels: the old crowd sheets are gone', () => {
    assert.equal(existsSync(join(PUBLIC, 'assets/sprites/avatar/crowd')), false);
  });
});

// ---- runtime rig against a Pixi stand-in ----------------------------------
class Emitter {
  constructor() { this.handlers = new Map(); }
  on(ev, fn, ctx) { (this.handlers.get(ev) || this.handlers.set(ev, []).get(ev)).push([fn, ctx]); return this; }
  emit(ev, ...a) { for (const [fn, ctx] of this.handlers.get(ev) || []) fn.apply(ctx, a); return this; }
}
class ImageSource extends Emitter {
  constructor({ resource, label, resolution = 1 }) {
    super();
    Object.assign(this, { resource, label, resolution, width: 1, height: 1, destroyed: false });
  }
  resize(w, h, res) { Object.assign(this, { width: w, height: h, resolution: res }); return true; }
  update() {}
  destroy() { this.destroyed = true; }
}
class Texture {
  constructor({ source, frame }) { Object.assign(this, { source, frame }); }
  destroy() { this.destroyed = true; }
}
class Rectangle { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
class AnimatedSprite {
  constructor(textures) {
    this.textures = textures;
    this.anchor = { set() {} };
    this.scale = { set() {}, x: 1, y: 1 };
    this.currentFrame = 0;
    this.playing = false;
    this.parent = null;
    this.destroyed = false;
  }
  gotoAndPlay(i) { this.currentFrame = i; this.playing = true; }
  gotoAndStop(i) { this.currentFrame = i; this.playing = false; }
}
class FakeImage {
  set src(url) {
    this._src = url;
    setTimeout(() => { this.naturalWidth = 100; this.naturalHeight = 100; this.onload?.(); }, 1);
  }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
}

describe('NPC Glitch rig (js/npc-glitch.js)', () => {
  let K;
  const saved = {};
  const PIXI = { ImageSource, Texture, Rectangle, AnimatedSprite };
  before(async () => {
    for (const k of ['PIXI', 'Image', 'document']) saved[k] = globalThis[k];
    globalThis.PIXI = PIXI;
    globalThis.Image = FakeImage;
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
    K = await import('../public/js/npc-glitch.js');
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });
  const settle = () => new Promise((r) => setTimeout(r, 10));

  it('maps every mode to sheets an NPC look has', () => {
    for (const mode of [...K.NPC_MODES, ...IDLES_TO_RANDOM, 'happy', 'angry', 'surprise', 'hit1']) {
      const { anim, then } = K.npcAnimFor(mode);
      for (const a of [anim, then].filter(Boolean)) {
        for (const sheet of K.sheetsForAnim(a)) assert.ok(NPC_SHEETS.includes(sheet), `${mode}: ${a} draws from ${sheet}`);
      }
    }
    assert.deepEqual(K.sheetsForAnim(K.npcAnimFor('stand').anim), ['idle4']);
    assert.deepEqual(K.sheetsForAnim(K.npcAnimFor('walk').anim), ['base']);
    assert.deepEqual(K.sheetsForAnim(K.npcAnimFor('jump').anim), ['jump']);
    assert.deepEqual(K.sheetsForAnim(K.npcAnimFor('climb').anim), ['climb']);
  });

  it('loads base + idle4 (2x on a sharp screen), anchors on the feet, and stands in idle4', async () => {
    let t = 0;
    const kit = K.createNpcGlitchKit({ PIXI, hires: true, now: () => t });
    const a = kit.actor('Bumbishfish');
    assert.equal(a.id, 'bumbishfish');
    assert.equal(a.scale, 1);
    assert.equal(a.sprite.facesRight, true);
    assert.equal(a.sprite.updateAnchor, true);
    const sheets = a.look.sheets;
    assert.deepEqual(Object.keys(sheets).sort(), ['base', 'idle4']);
    assert.match(sheets.base.url, /npc\/bumbishfish\/base@2x\.webp$/);
    assert.equal(sheets.base.source.resolution, 2);
    const def = NPC_GLITCH_SHEETS.bumbishfish.sheets.base;
    assert.deepEqual(sheets.base.frames[0].defaultAnchor, { x: def.midX / def.fw, y: def.feetY / def.fh });
    await settle();
    t += 100;
    kit.tick();
    assert.equal(a.state, 'stand');
    assert.equal(a.sprite.textures.length, 51 + 18 + 25 + 2, 'the idle4 loop (all its frames)');
    assert.equal(a.sprite.textures[0], sheets.idle4.frames[0]);
    assert.equal(a.sprite.loop, true);
    kit.releaseAll();
  });

  it('walks, jumps, climbs and plays emotions, then returns to the stand', async () => {
    let t = 0;
    const kit = K.createNpcGlitchKit({ PIXI, now: () => t });
    const a = kit.actor('Amp');
    assert.match(a.look.sheets.base.url, /npc\/amp\/base\.webp$/, '1x on a normal screen');
    a.setMode('walk');
    assert.equal(a.state, 'walk');
    assert.equal(a.sprite.textures.length, 12);
    a.setMode('jump');
    assert.equal(a.state, 'jump');
    assert.ok(a.look.sheets.jump, 'jump sheet loads on first jump');
    a.setMode('climb');
    assert.ok(a.look.sheets.climb);
    a.setMode('stand');
    a.emote('happy', 3000);
    assert.equal(a.state, 'happy');
    t += 3100;
    kit.tick();
    assert.equal(a.state, 'stand');
    kit.releaseAll();
  });

  it('plays a random idle after the stand, offset per Glitch, and frees unused idle sheets', async () => {
    let t = 0;
    const kit = K.createNpcGlitchKit({ PIXI, now: () => t });
    const a = kit.actor('Lily Linguistic');
    const b = kit.actor('Gomez Addams');
    const seen = { a: new Set(), b: new Set() };
    const firstA = [];
    for (let i = 0; i < 1200; i += 1) {
      t += 100;
      kit.tick();
      seen.a.add(a.state);
      seen.b.add(b.state);
      if (a.state !== 'stand' && !firstA.length) firstA.push(t);
    }
    assert.ok(seen.a.size > 1 && seen.b.size > 1, 'random idles play');
    for (const s of [...seen.a, ...seen.b]) assert.ok(['stand', ...IDLES_TO_RANDOM].includes(s), s);
    assert.equal(firstA[0] >= npcIdleTiming('Lily Linguistic').firstWaitMs, true);
    assert.notEqual(a.loopOffset, b.loopOffset, 'idle4 loops start apart');
    // A random idle sheet nobody uses for a while is freed.
    t += K.IDLE_SHEET_KEEP_MS + 7000;
    a.setMode('walk');
    b.setMode('walk');
    t += K.IDLE_SHEET_KEEP_MS + 1000;
    kit.tick();
    for (const st of [a.look, b.look]) for (const n of ['idle1', 'idle2', 'idle3']) assert.equal(st.sheets[n], undefined, `${n} freed`);
    kit.releaseAll();
  });

  it('still idles now and then while pottering about (walk 1.5 s, stand 3.3 s)', () => {
    let t = 0;
    const kit = K.createNpcGlitchKit({ PIXI, now: () => t });
    const a = kit.actor('Lily Linguistic');
    const seen = new Set();
    for (let i = 0; i < 600; i += 1) {
      t += 100;
      a.setMode(i % 48 < 15 ? 'walk' : 'stand');
      kit.tick();
      seen.add(a.state);
    }
    assert.ok([...seen].some((s) => IDLES_TO_RANDOM.includes(s)), `random idles while wandering: ${[...seen]}`);
    kit.releaseAll();
  });

  it('frees a look once its Glitches are gone', () => {
    let t = 0;
    const stage = { parent: null };
    const kit = K.createNpcGlitchKit({ PIXI, stage, now: () => t });
    const a = kit.actor('Amp');
    a.sprite.parent = { parent: stage };
    t += 200;
    kit.tick();
    assert.equal(kit.snapshot().count, 1);
    const base = a.look.sheets.base;
    a.sprite.parent = null; // street cleared: removed, not destroyed
    t += 200;
    kit.tick();
    assert.equal(kit.snapshot().count, 1, 'kept for a moment (a re-add in the same street survives)');
    t += 5200;
    kit.tick();
    assert.equal(kit.snapshot().count, 0);
    t += K.LOOK_KEEP_MS + 200;
    kit.tick();
    assert.equal(base.source.destroyed, true);
  });
});

describe('every NPC Glitch path uses the vector rig', () => {
  const game = read('game.js');
  const body = (src, name) => {
    const at = src.indexOf(`function ${name}(`);
    assert.ok(at >= 0, name);
    return src.slice(at, src.indexOf('\n}\n', at));
  };

  it('local companions (street, Feats, Emotional Bear, The Last Feat follow) and the Hog Haul rival', () => {
    assert.match(body(game, 'makeLocalCompanion'), /engine\.npcGlitch\(profile\.name\)/);
    assert.match(body(game, 'setLocalCompanionAnim'), /body\.npc\.setMode\(/);
    assert.match(body(game, 'spawnHogHaulRival'), /engine\.npcGlitch\(/);
    assert.match(body(game, 'updateHogHaulRival'), /rival\.npc\.setMode\('walk'\)/);
    assert.match(game, /npcGlitch\(name, opts = \{\}\) \{\n\s+return npcGlitches\?\.actor\(/);
    assert.match(game, /createNpcGlitchKit\(\{ PIXI, ticker: app\.ticker, stage: app\.stage/);
  });

  it('race and Game of Crowns rivals and party guests', () => {
    const races = read('js/features/races-feature.js');
    const crowns = read('js/features/crowns-feature.js');
    const party = read('js/features/party-spaces-feature.js');
    assert.match(races, /engine\.npcGlitch\?\.\(run\.rivalName/);
    assert.match(races, /rivalSprite\.npc\.setMode\(/);
    // Desk RAINBOW (G305): no end-of-race emotes on ticket races (tests/desk-decisions.test.js).
    assert.doesNotMatch(races, /rivalSprite\?\.npc\?\.emote\(/);
    assert.match(crowns, /engine\.npcGlitch\?\.\(r\.name\)/);
    assert.match(crowns, /a\.sprite\.npc\.setMode\(/);
    assert.match(party, /engine\.npcGlitch\?\.\(guest\.name, \{ salt: index/);
    assert.match(party, /npc\.setMode\('dance'\)/);
  });

  it('leaves no raster crowd path behind', () => {
    const files = [
      'game.js',
      'js/avatar-anims.js',
      ...readdirSync(join(PUBLIC, 'js/features')).filter((f) => f.endsWith('.js')).map((f) => `js/features/${f}`),
    ];
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /glitchCrowd|GLITCH_CROWD|crowdIndexFor|avatar\/crowd/, f);
    }
  });
});
