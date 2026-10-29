// G372-G396: more of Tiny Speck's overlay animations (tools/overlays/build.mjs -> overlays-more.json,
// played by public/js/overlays.js). The build matches the FLAs, the sheets stay lean, every
// placement matches the GSJS line it cites, and the players place and time them the way
// the client did. Browser pieces are stubbed (fetch, Image, canvas, requestAnimationFrame, PIXI).
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const manifest = JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays/overlays-more.json'), 'utf8'));
const read = (p) => readFileSync(join(pub, p), 'utf8');
const src = (p) => readFileSync(join(gsjs, p), 'utf8');
const hasGsjs = existsSync(join(gsjs, 'players/player.js'));

/** The announcement block around a GSJS line that names `key` (the `{ ... }` it sits in). */
function block(file, key, nth = 0) {
  const text = src(file);
  let at = -1;
  for (let i = 0; i <= nth; i += 1) at = text.indexOf(key, at + 1);
  assert.ok(at >= 0, `${key} in ${file}`);
  return text.slice(Math.max(0, at - 700), at + 500);
}

const saved = {};
let rafQueue = [];

class FakeSprite {
  constructor(texture) { this.texture = texture; this.visible = true; this.alpha = 1; }
  destroy() { this.destroyed = true; }
}
const FAKE_PIXI = {
  ImageSource: class { constructor(o) { Object.assign(this, o); } resize() { return true; } update() {} emit() {} },
  Texture: class { constructor(o) { Object.assign(this, o); } once() {} },
  Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } },
  Sprite: FakeSprite,
};

before(() => {
  for (const k of ['fetch', 'document', 'Image', 'requestAnimationFrame', 'PIXI', 'performance']) saved[k] = globalThis[k];
  globalThis.fetch = async (url) => (String(url).includes('overlays-more.json')
    ? { ok: true, json: async () => manifest }
    : { ok: false, status: 404, json: async () => null });
  globalThis.Image = class { set src(v) { this._src = v; queueMicrotask(() => this.onload?.()); } };
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, dataset: {}, style: { setProperty() {} }, isConnected: false, getContext: () => ({ clearRect() {}, drawImage() {} }), remove() { this.isConnected = false; } }),
    getElementById: () => null,
  };
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  globalThis.PIXI = FAKE_PIXI;
});

after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
});

const overlays = () => import('../public/js/overlays.js?v=g446-2');
const flush = async (n = 3) => {
  for (let i = 0; i < n; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    const q = rafQueue;
    rafQueue = [];
    for (const fn of q) fn(performance.now());
  }
};

describe('tools/overlays/build.mjs', () => {
  it('--check: the manifest matches the config, the FLAs beside the game and the sheets', async () => {
    const { checkOverlays, OVERLAYS } = await import('../tools/overlays/build.mjs');
    assert.deepEqual(checkOverlays(), []);
    assert.deepEqual(Object.keys(manifest).sort(), Object.keys(OVERLAYS).sort());
  });

  it('every sheet is a WebP from a CC0 glitch-overlays FLA, lean enough to ship', async () => {
    const { webpSize } = await import('../tools/overlays/build.mjs');
    let total = 0;
    for (const [key, m] of Object.entries(manifest)) {
      assert.match(m.src, /^glitch-overlays\/[a-z0-9_]+\.fla$/, key);
      assert.match(m.fla, /^[0-9a-f]{40}$/, key);
      const buf = readFileSync(join(pub, 'assets/sprites/overlays', m.file));
      const [w, h] = webpSize(buf);
      assert.ok(w <= 4096 && h <= 16383, `${key} ${w}x${h}`);
      assert.ok(buf.length <= 1_600_000, `${key} is ${buf.length} bytes`);
      // @Nx names carry the scale (textures.js resolutionOfUrl), so the logical size is the stage box.
      if (m.scale !== 1) assert.match(m.file, new RegExp(`@${m.scale}x\\.webp$`), key);
      total += buf.length;
    }
    // 14.2 MB as built (the six rainbows are 1.25-1.35 MB each at 30 fps, as overlay-art's are).
    assert.ok(total < 15_000_000, `${total} bytes in all`);
  });

  it('is not one of the overlay-art keys (two manifests, no overlap)', () => {
    const first = JSON.parse(read('assets/sprites/overlays/overlays.json'));
    for (const key of Object.keys(manifest)) assert.ok(!first[key], key);
  });
});

describe('OVERLAY_USES against GSJS', { skip: !hasGsjs && 'glitch-GameServerJS is not beside the game' }, () => {
  it('show_rainbow is a 400 x 400 pc_overlay for 4 s (player.js 3014-3029)', async () => {
    const { RAINBOW, OVERLAY_USES } = await overlays();
    const b = block('players/player.js', 'function show_rainbow');
    assert.match(b, /var duration = 4000;/);
    assert.match(b, /width: 400,\s*height: 400/);
    assert.deepEqual({ ...RAINBOW }, { wh: 400, durationMs: 4000 });
    for (const key of ['rainbow_100coinstoday', 'rainbow_150coinstoday', 'rainbow_maxrelax', 'rainbow_superharvest', 'rainbow_spindoctor', 'rainbow_superdonation', 'charades_gameover']) {
      assert.equal(OVERLAY_USES[key].wh, 400, key);
      assert.equal(OVERLAY_USES[key].durationMs, 4000, key);
      assert.ok(manifest[key], key);
    }
    assert.match(src('players/inc_stats.js'), /top == 150\)\{\s*this\.show_rainbow\('rainbow_150coinstoday'\);\s*\}else\{\s*this\.show_rainbow\('rainbow_100coinstoday'\);/);
    assert.match(src('items/include/trants.js'), /show_rainbow\('rainbow_superharvest', 1000\)/);
    assert.equal(OVERLAY_USES.rainbow_superharvest.delayMs, 1000);
    assert.match(src('items/npc_spinning_wheel.js'), /if \(currants >= 500\) targetPC\.show_rainbow\('rainbow_spindoctor'\)/);
    assert.match(src('items/include/shrines.js'), /if \(is_chance\(0\.01\) \|\| pc\.buffs_has\("max_luck"\)\)\{\s*pc\.show_rainbow\('rainbow_superdonation'\)/);
    assert.match(src('items/catalog_buffs.js'), /pc\.show_rainbow\('charades_gameover'\)/);
    // The sounds the switch pairs (3038-3065).
    assert.match(b + src('players/player.js'), /case 'rainbow_maxrelax':\s*this\.announce_sound\('RAINBOW_MAXRELAX'/);
    assert.equal(OVERLAY_USES.rainbow_150coinstoday.sound, undefined);
  });

  it('fox_bait_ignite: 150 px, delta_x 60 toward the facing, delta_y -80, 4 s (fox_bait.js 115-138)', async () => {
    const { OVERLAY_USES } = await overlays();
    const b = block('items/fox_bait.js', "overlay_key_to_url('fox_bait_ignite')");
    assert.match(b, /delta_x = -60;[\s\S]*delta_x = 60;/);
    assert.match(b, /duration: 4000/);
    assert.match(b, /delta_y: -80,\s*width: 150,\s*height: 150,\s*locking: true/);
    assert.deepEqual([OVERLAY_USES.fox_bait_ignite.wh, OVERLAY_USES.fox_bait_ignite.dx, OVERLAY_USES.fox_bait_ignite.dy, OVERLAY_USES.fox_bait_ignite.durationMs], [150, 60, -80, 4000]);
  });

  it('321_countdown: a 350 px vp_overlay at x 50%, top_y 50%, for 4 s (shared_instance_manager.js 672-683, inc_race.js 200-211)', async () => {
    const { OVERLAY_USES } = await overlays();
    for (const [file, key] of [['groups/shared_instance_manager.js', "overlay_key_to_url('321_countdown')"], ['locations/inc_race.js', "overlay_key_to_url('321_countdown')"]]) {
      const b = block(file, key);
      assert.match(b, /duration: 4000/);
      assert.match(b, /width: 350/);
    }
    assert.match(block('groups/shared_instance_manager.js', "overlay_key_to_url('321_countdown')"), /x: '50%',\s*top_y: '50%'/);
    const u = OVERLAY_USES['321_countdown'];
    assert.deepEqual([u.wh, u.durationMs, u.x, u.topY], [350, 4000, 0.5, 0.5]);
  });

  it('rook feathers: 3 s after 1 s, 220 px over the attacker (inc_rook.js 746-755), 200 over the shrine (shrines.js 1078-1087)', async () => {
    const { OVERLAY_USES } = await overlays();
    const b = block('locations/inc_rook.js', "swf_url:overlay_key_to_url('rook_feathers_falling')", 2);
    assert.match(b, /y: pc\.y - 220,[\s\S]*duration:3000,\s*delay_ms:1000/);
    assert.match(block('items/include/shrines.js', "overlay_key_to_url('rook_feathers_falling')"), /y: this\.y - 200/);
    const u = OVERLAY_USES.rook_feathers_falling;
    assert.deepEqual([u.dy, u.durationMs, u.delayMs], [-220, 3000, 1000]);
    assert.match(read('js/features/rook-attack-feature.js'), /featherFall\(engine, spr, -200\)/);
  });

  it('dice: two 56 px dice at delta_x -20 and 20, delta_y -120, 6 s, left lands at 1 s, right at 2 s; the 12-sided die at 2 s', async () => {
    const { OVERLAY_USES } = await overlays();
    const d = src('items/dice.js');
    assert.match(d, /state: 'spin',\s*duration: 6000/);
    assert.match(d, /delta_x: -20,\s*delta_y: -120,\s*width: 56,\s*height: 56/);
    assert.match(d, /rsp\.delta_x = 20;/);
    assert.match(d, /'onDiceRollCompleteLeft', 1000\);\s*this\.apiSetTimer\('onDiceRollCompleteRight', 2000\)/);
    const t = src('items/dice_12sided.js');
    assert.match(t, /'onDiceRollLand', 2000\)/);
    assert.match(t, /state: 'roll_'\+giant/);
    assert.deepEqual([...OVERLAY_USES.dice_overlay.rollAfterMs], [1000, 2000]);
    assert.deepEqual([...OVERLAY_USES.twelve_sided_die.rollAfterMs], [2000]);
    // Every giant the source can roll has a state (dice_12sided.js choices).
    for (const g of ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille', 'rook']) {
      assert.ok(manifest.twelve_sided_die.states[`roll_${g}`], g);
    }
    for (let n = 1; n <= 6; n += 1) assert.ok(manifest.dice_overlay.states[`roll${n}`], n);
  });

  it('the rest: musicblock notes, petrified rock, powders, shrine power-up, glow, hell hole arrow, crown indicators', async () => {
    const { OVERLAY_USES: U } = await overlays();
    assert.match(block('items/musicblock_b_brown_01.js', "overlay_key_to_url('musicblock_notes')"), /delta_x: 140,\s*delta_y: -100,\s*width: 180,\s*height: 180/);
    assert.deepEqual([U.musicblock_notes.dx, U.musicblock_notes.dy, U.musicblock_notes.wh], [140, -100, 180]);
    assert.match(block('items/petrified_rock_small.js', "overlay_key_to_url('petrified_rock_open_overlay')"), /duration: 2000,[\s\S]*delta_y: -115/);
    assert.deepEqual([U.petrified_rock_open_overlay.durationMs, U.petrified_rock_open_overlay.dy], [2000, -115]);
    assert.match(block('items/fertilidust.js', "overlay_key_to_url('target_effect_powder_extreme')"), /duration: 5400,\s*delay_ms: 2000,\s*delta_x: 25,\s*delta_y: 200,\s*width: 300/);
    assert.match(block('items/fertilidust_lite.js', "overlay_key_to_url('target_effect_powder_mild')"), /duration: 4300,[\s\S]*delta_x: 75,\s*delta_y: 200,\s*width: 300/);
    assert.deepEqual([U.target_effect_powder_extreme.durationMs, U.target_effect_powder_extreme.dx, U.target_effect_powder_mild.durationMs, U.target_effect_powder_mild.dx], [5400, 25, 4300, 75]);
    assert.match(block('items/include/shrines.js', "swf_url:overlay_key_to_url('shrine_power_up')"), /x: this\.x - 40,\s*y: this\.y \+ 10,\s*delay_ms: 1000,\s*duration: 10000/);
    assert.deepEqual([U.shrine_power_up.dx, U.shrine_power_up.dy, U.shrine_power_up.delayMs, U.shrine_power_up.durationMs], [-40, 10, 1000, 10000]);
    assert.match(src('locations/inc_rook.js'), /this\.sendGlowMsg\(pc\.tsid, pc\.tsid, true\);/);
    assert.match(block('quests/hell_hole.js', "overlay_key_to_url('right_arrow')"), /x: '50%',\s*top_y: '15%',\s*width: 75/);
    assert.deepEqual([U.right_arrow.wh, U.right_arrow.x, U.right_arrow.topY], [75, 0.5, 0.15]);
    assert.match(block('players/inc_games.js', "overlay_key_to_url('crown_game_indicator_you')"), /width: 140,\s*y: '88%',\s*x: 70,/);
    assert.match(block('players/inc_games.js', "overlay_key_to_url('crown_game_indicator_someone_else')"), /width: 100,\s*y: '91%',\s*x: '94%',/);
    assert.deepEqual([U.crown_game_indicator_you.wh, U.crown_game_indicator_you.xPx, U.crown_game_indicator_you.y], [140, 70, 0.88]);
    assert.deepEqual([U.crown_game_indicator_someone_else.wh, U.crown_game_indicator_someone_else.x, U.crown_game_indicator_someone_else.y], [100, 0.94, 0.91]);
    assert.match(block('groups/shared_instance_manager.js', "overlay_key_to_url('game_of_crowns_throbber')"), /width: 200,\s*y: '50%',\s*x: '50%'/);
    assert.match(block('items/glitchmas_cracker.js', "'crackerPull', 3167"), /state: 'grab'/);
    // The grab clip runs 96 frames at 30 fps, about the 3167 ms until the pop.
    const grab = manifest.glitchmas_cracker.states.grab;
    assert.ok(Math.abs((grab.frames * 1000) / manifest.glitchmas_cracker.fps - 3167) < 100);
  });

  it('the skill-package words are not built: word_progress wins over swf_url for the actor (inc_skill_packages.js 256-310)', () => {
    const sp = src('players/inc_skill_packages.js');
    assert.match(sp, /word_progress: args\.word_progress/);
    for (const key of ['pig_pet', 'pig_nibble', 'chicken_squeeze', 'butterfly_milk', 'butterfly_massage', 'trant_harvest', 'trant_pet', 'jellisac_scoop', 'rooked_revive']) {
      assert.ok(!manifest[key], key);
    }
    const client = join(root, '..', 'glitch-client/com/tinyspeck/engine/view/gameoverlay/InLocationAnnouncementOverlay.as');
    if (existsSync(client)) assert.match(readFileSync(client, 'utf8'), /\} else if \(annc\.word_progress\) \{\s*_art_view = word_progress_bar;\s*\}\s*else if \(annc\.swf_url\)/);
  });
});

describe('js/overlays.js players', () => {
  it('playOverlay stands the art on its point (center_bottom), fits wh, fades, then ends', async () => {
    const { playOverlay } = await overlays();
    const added = [];
    const layer = { destroyed: false, addChild: (s) => added.push(s) };
    const h = playOverlay(FAKE_PIXI, 'rainbow_maxrelax', { layer, at: () => ({ x: 500, y: 300 }), wh: 400, durationMs: 4000, loop: false, holdMs: 2000 });
    await flush(4);
    const s = added[0];
    assert.ok(s, 'a sprite');
    const m = manifest.rainbow_maxrelax;
    const k = 400 / Math.max(...m.stage);
    assert.ok(Math.abs(s.width - m.box[2] * k) < 0.01);
    assert.ok(Math.abs(s.x - (500 - (m.stage[0] * k) / 2 + m.box[0] * k)) < 0.01);
    assert.ok(Math.abs(s.y - (300 - m.stage[1] * k + m.box[1] * k)) < 0.01);
    assert.equal(s.alpha, 1);
    h.stop();
    await flush(2);
    assert.equal(await h.done, false);
    assert.ok(s.destroyed);
  });

  it('the dice: two overlays spin, then each lands on its own roll state', async () => {
    const { playDice } = await overlays();
    const layer = { destroyed: false, addChild() {} };
    const [left, right] = playDice(FAKE_PIXI, { layer, at: () => ({ x: 0, y: 0 }), values: [3, 5], rollAfterMs: [0, 5] });
    assert.equal(left.state, 'spin');
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(left.state, 'roll3');
    assert.equal(right.state, 'roll5');
    const [twelve] = playDice(FAKE_PIXI, { layer, at: () => ({ x: 0, y: 0 }), values: 'rook', twelve: true, holdMs: 2500 });
    assert.equal(twelve.state, 'roll_rook');
    for (const h of [left, right, twelve]) h.stop();
  });

  it('windowPlacement: top_y puts the stage top edge at that fraction (InWindowAnnouncementOverlay.as 286-295)', async () => {
    const { windowPlacement } = await overlays();
    const m = manifest['321_countdown'];
    const rect = { width: 960, height: 400, scale: 1 };
    const at = windowPlacement(m, rect, { wh: 350, x: 0.5, topY: 0.5 });
    const k = 350 / Math.max(...m.stage);
    assert.ok(Math.abs(at.top - (200 + m.box[1] * k)) < 0.01);
    assert.ok(Math.abs(at.left - (480 - (m.stage[0] * k) / 2 + m.box[0] * k)) < 0.01);
  });

  it('moreFrameAt: a state plays its own frames; a non-looping timeline holds its last frame', async () => {
    const { moreFrameAt } = await overlays();
    const c = manifest.glitchmas_cracker;
    assert.equal(moreFrameAt(c, 0, { state: 'grab' }), c.states.grab.from);
    assert.equal(moreFrameAt(c, 60_000, { state: 'grab' }), c.states.grab.from + c.states.grab.frames - 1);
    assert.ok(moreFrameAt(c, 60_000, { state: 'waiting' }) < c.states.waiting.frames);
    const r = manifest.rainbow_superharvest;
    assert.equal(moreFrameAt(r, 60_000, { loop: false }), r.frames - 1);
  });
});

describe('G441: the super harvest arc drawn from its SVG frames on dense screens', () => {
  const r = manifest.rainbow_superharvest;
  const vfile = join(pub, 'assets/sprites/overlays', r.vector.file);

  it('the build keeps the arc\'s SVG frames beside the sheet, one per unique frame, lean', () => {
    assert.equal(r.vector.file, 'rainbow_superharvest.frames.json');
    assert.equal(r.vector.order.length, r.frames);
    const data = JSON.parse(readFileSync(vfile, 'utf8'));
    assert.equal(data.frames.length, r.vector.frames);
    // 0.82 MB as built (about 100 KB gzipped), under the 1.3 MB sheet.
    assert.ok(readFileSync(vfile).length < 1_000_000);
    // G446: every 400 px rainbow (and the charades arc), nothing else.
    for (const [key, m] of Object.entries(manifest)) assert.equal(Boolean(m.vector), /^rainbow_|^charades_gameover$/.test(key), key);
  });

  it('vectorDensity: the sheet on a 1x screen, the SVG frames from 1.5 device px per stage px, capped', async () => {
    const { overlayDensity, vectorDensity, VECTOR_MAX_SIDE } = await overlays();
    const at = (resolution) => vectorDensity(r, overlayDensity(r, { wh: 400, resolution }));
    assert.equal(at(1), 0);
    assert.equal(at(1.2), 0);
    assert.equal(at(2), Math.ceil((400 / 330) * 2 * 4) / 4);
    assert.ok(at(3.3) >= (400 / 330) * 3.3);
    assert.ok(at(40) * Math.max(r.box[2], r.box[3]) <= VECTOR_MAX_SIDE + 1);
    assert.equal(vectorDensity(manifest.trading, 4), 0, 'no SVG frames: the sheet');
  });

  it('vectorFrameSvgs: each frame carries only the shared shapes it uses, sized to the canvas', async () => {
    const { vectorFrameSvgs } = await overlays();
    const data = JSON.parse(readFileSync(vfile, 'utf8'));
    const svgs = vectorFrameSvgs(data, 755, 473);
    assert.equal(svgs.length, data.frames.length);
    for (const svg of svgs) {
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="755" height="473" viewBox="/);
      const ids = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
      for (const m of svg.matchAll(/#(_[a-z]+\d+)/g)) assert.ok(ids.has(m[1]), `${m[1]} defined`);
      assert.ok(svg.length < data.defs.length, 'not the whole shared set');
    }
  });

  it('playOverlay draws the SVG frames on a dense screen and the sheet on a 1x one, at the same size', async () => {
    const { playOverlay } = await overlays();
    const savedFetch = globalThis.fetch;
    const savedImage = globalThis.Image;
    const draws = [];
    const vtext = readFileSync(vfile, 'utf8');
    globalThis.fetch = async (url) => (String(url).includes(r.vector.file) ? { ok: true, json: async () => JSON.parse(vtext) } : savedFetch(url));
    globalThis.Image = class { constructor() { this.complete = true; } async decode() {} };
    const pixi = {
      ...FAKE_PIXI,
      CanvasSource: class { constructor(o) { Object.assign(this, o); this.updates = 0; } update() { this.updates += 1; } },
      Texture: class { constructor(o) { Object.assign(this, o); } once() {} destroy() { this.destroyed = true; } },
    };
    const savedDoc = globalThis.document;
    globalThis.document = { ...savedDoc, createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage: (img, x, y, w, h) => draws.push([w, h]) }) }) };
    try {
      const play = async (resolution) => {
        const added = [];
        const layer = { destroyed: false, addChild: (s) => added.push(s) };
        const h = playOverlay(pixi, 'rainbow_superharvest', { layer, at: () => ({ x: 500, y: 300 }), wh: 400, durationMs: 4000, loop: false, holdMs: 2000, resolution });
        await flush(6);
        h.stop();
        await flush(2);
        await h.done;
        return { h, s: added[0] };
      };
      const dense = await play(3.3);
      assert.equal(dense.h.art, 'vector');
      assert.ok(dense.s.texture.source instanceof pixi.CanvasSource);
      assert.ok(dense.s.texture.source.resolution >= (400 / 330) * 3.3);
      assert.ok(draws.length >= 1 && draws[0][0] >= r.box[2] * 4, 'drawn at the screen\'s density');
      assert.ok(dense.s.texture.destroyed, 'the canvas texture goes with the sprite');
      const flat = await play(1);
      assert.equal(flat.h.art, 'sheet');
      assert.ok(Math.abs(dense.s.width - flat.s.width) < 0.01 && Math.abs(dense.s.y - flat.s.y) < 0.01);
    } finally {
      globalThis.fetch = savedFetch;
      globalThis.Image = savedImage;
      globalThis.document = savedDoc;
    }
  });

  it('G446: the other rainbows keep SVG frames too, each under 1 MB, and their callers pass the resolution', () => {
    for (const key of ['rainbow_100coinstoday', 'rainbow_150coinstoday', 'rainbow_maxrelax', 'rainbow_spindoctor', 'rainbow_superdonation', 'charades_gameover']) {
      const m = manifest[key];
      assert.equal(m.vector.file, `${key}.frames.json`, key);
      assert.equal(m.vector.order.length, m.frames, key);
      const data = readFileSync(join(pub, 'assets/sprites/overlays', m.vector.file));
      assert.equal(data.length, m.vector.bytes, key);
      assert.ok(data.length < 1_000_000, key);
    }
    assert.match(read('js/features/meditation-feature.js'), /showRainbow\(engine\.PIXI, 'rainbow_maxrelax', \{[^}]*\}\), resolution: engine\.resolution \|\| 1 \}\)/);
    assert.match(read('js/features/player-verbs-mp-feature.js'), /showRainbow\(engine\.PIXI, 'charades_gameover', \{[^}]*\}\), resolution: engine\.resolution \|\| 1 \}\)/);
  });

  it('G446: overlay-art\'s rainbows (you did it, fully revived, secret spot) keep SVG frames; playSheetOverlay draws them on a dense screen', async () => {
    const art = JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays/overlays.json'), 'utf8'));
    for (const key of ['rainbow_youdidit', 'rainbow_fullyrevived', 'rainbow_secretspot']) {
      assert.equal(art[key].vector.file, `${key}.frames.json`, key);
      assert.equal(art[key].vector.order.length, art[key].frames, key);
    }
    // Nothing shows the race winner's rainbow (desk decisions), so it has no SVG frames.
    assert.ok(!art.rainbow_winner.vector);
    for (const f of ['player-verbs-mp-feature', 'rook-attack-feature', 'secret-spots-feature']) assert.match(read(`js/features/${f}.js`), /resolution: engine\.resolution \|\| 1/, f);
    const oa = await import('../public/js/overlay-art.js?v=g446-2');
    const ov = await overlays();
    assert.equal(ov.vectorDensity, oa.vectorDensity, 'one vector path');
    const y = art.rainbow_youdidit;
    const vtext = readFileSync(join(pub, 'assets/sprites/overlays', y.vector.file), 'utf8');
    const savedFetch = globalThis.fetch;
    const savedImage = globalThis.Image;
    const savedDoc = globalThis.document;
    const draws = [];
    globalThis.fetch = async (url) => {
      if (String(url).includes('overlays.json')) return { ok: true, json: async () => art };
      if (String(url).includes(y.vector.file)) return { ok: true, json: async () => JSON.parse(vtext) };
      return savedFetch(url);
    };
    globalThis.Image = class { constructor() { this.complete = true; } async decode() {} };
    globalThis.document = { ...savedDoc, createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage: (img, x, yy, w, h) => draws.push([w, h]) }) }) };
    const pixi = {
      ...FAKE_PIXI,
      CanvasSource: class { constructor(o) { Object.assign(this, o); } update() {} },
      Texture: class { constructor(o) { Object.assign(this, o); } once() {} destroy() { this.destroyed = true; } },
    };
    try {
      const play = async (resolution) => {
        const added = [];
        const layer = { destroyed: false, addChild: (sp) => added.push(sp) };
        const h = oa.playSheetOverlay(pixi, 'rainbow_youdidit', { layer, at: () => ({ x: 500, y: 300 }), wh: 400, durationMs: 4000, loop: false, holdMs: 2000, resolution });
        await flush(6);
        h.stop();
        await flush(2);
        await h.done;
        return { h, sp: added[0] };
      };
      const dense = await play(3.3);
      assert.equal(dense.h.art, 'vector');
      assert.ok(dense.sp.texture.source instanceof pixi.CanvasSource);
      assert.ok(draws.length >= 1 && draws[0][0] >= y.box[2] * 4);
      assert.ok(dense.sp.texture.destroyed);
      const flat = await play(1);
      assert.equal(flat.h.art, 'sheet');
      assert.ok(Math.abs(dense.sp.width - flat.sp.width) < 0.01 && Math.abs(dense.sp.y - flat.sp.y) < 0.01);
    } finally {
      globalThis.fetch = savedFetch;
      globalThis.Image = savedImage;
      globalThis.document = savedDoc;
    }
  });

  it('game.js hands the renderer\'s resolution to the rainbows', () => {
    const game = read('game.js');
    assert.match(game, /showRainbow\(PIXI, key, \{.*resolution: app\?\.renderer\?\.resolution \|\| 1 \}\)/);
    assert.match(game, /dataset\.superHarvestArt = h\.art/);
    // G446: features read it from the engine.
    assert.match(game, /get resolution\(\) \{\n\s+return app\?\.renderer\?\.resolution \|\| 1;/);
  });
});

describe('wiring', () => {
  const game = read('game.js');
  it('game.js: quoin limit, super harvest, wheel and donation rainbows; musicblock notes; the phantom; the solo Hog Haul countdown', () => {
    assert.match(game, /import \{[^}]*showRainbow[^}]*\} from '\.\/js\/overlays\.js\?v=g446-2'/);
    assert.match(game, /playerRainbow\(result\.dailyLimit === 150 \? 'rainbow_150coinstoday' : 'rainbow_100coinstoday'\)/);
    assert.match(game, /if \(!paradiseRun\) playerRainbow/);
    assert.match(game, /playerRainbow\('rainbow_superharvest'/);
    assert.match(game, /playerRainbow\('rainbow_spindoctor'\)/);
    assert.match(game, /if \(result\.bonus\) playerRainbow\('rainbow_superdonation'\)/);
    assert.match(game, /playOverlay\(PIXI, 'musicblock_notes'/);
    assert.match(game, /playOverlay\(PIXI, 'phantom_glitch'/);
    assert.match(game, /playCountdownArt\(countdown\)/);
  });

  it('features: max relax, charades, fox bait, feathers, glow, prime, crack, powders, countdowns, logos, crowns, cracker, arrow, trading', () => {
    const f = (n) => read(`js/features/${n}-feature.js`);
    assert.match(f('meditation'), /showRainbow\(engine\.PIXI, 'rainbow_maxrelax'/);
    assert.match(f('player-verbs-mp'), /showRainbow\(engine\.PIXI, 'charades_gameover'/);
    assert.match(f('foxes'), /playOverlay\(engine\.PIXI, 'fox_bait_ignite'/);
    const rook = f('rook-attack');
    for (const k of ['rook_feathers_falling', 'avatar_power_up', 'shrine_power_up', 'click_to_donate']) assert.match(rook, new RegExp(`'${k}'`));
    assert.match(f('artifacts'), /'petrified_rock_open_overlay'/);
    assert.match(f('powders'), /powderBurst\(engine, 'target_effect_powder_extreme', trees\)/);
    assert.match(f('powders'), /powderBurst\(engine, 'target_effect_powder_mild'/);
    for (const n of ['races', 'crowns', 'hog-haul-mp']) assert.match(f(n), /playCountdownArt\(hud\.countdown\)/, n);
    assert.match(f('races'), /grabemgood_logo' : 'race_logo'/);
    assert.match(f('crowns'), /game_of_crowns_logo@1\.5x\.webp/);
    assert.match(f('hog-haul-mp'), /thegreathoghaul_logo@1\.5x\.webp/);
    assert.match(read('play/index.html'), /thegreathoghaul_logo@1\.5x\.webp/);
    assert.match(f('crowns'), /crown_game_indicator_you/);
    assert.match(f('crowns'), /'game_of_crowns_throbber'/);
    assert.match(f('seasons'), /playOverlay\(engine\.PIXI, 'glitchmas_cracker'/);
    assert.match(f('seasons'), /setState\('grab'\)/);
    assert.match(f('hell-tickets'), /playWindowOverlay\('right_arrow'/);
    assert.match(f('trade'), /playOverlay\(engine\.PIXI, 'trading'/);
    // Every key a module plays is built.
    for (const n of ['meditation', 'player-verbs-mp', 'foxes', 'rook-attack', 'artifacts', 'powders', 'seasons', 'hell-tickets', 'trade', 'crowns']) {
      for (const m of f(n).matchAll(/play(?:Overlay|WindowOverlay)\((?:engine\.PIXI, )?'([a-z0-9_]+)'/g)) assert.ok(manifest[m[1]], `${n}: ${m[1]}`);
    }
  });

  it('style.css hides the words under the countdown picture; the link carries the overlays key', () => {
    assert.match(read('style.css'), /\.hog-haul-countdown\.has-art,\s*\.hog-haul-countdown\.has-throbber \{ color: transparent; text-shadow: none; \}/);
    assert.match(read('play/index.html'), /style\.css\?[^"]*&amp;overlays=g392-1(?:&amp;[^"]*)?"/);
  });
});
