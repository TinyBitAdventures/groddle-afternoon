// Every animal clip is stored at least as finely as the game draws it (Austin, 2026-11-01: the Piggy
// went pixelated and soft after a feed, next to the sharp avatar and props: its rooting look_screen
// clip was the one Piggy sheet left at 1x). Each Piggy, Chicken, Butterfly, Batterfly and Heli Kitty
// sheet the js/ modules slice (tests/sheet-sources.js) must have its 3x twin from Tiny Speck's vector
// SWF (tools/vector-sprites/animals.json, js/sprite-hires.js), and that 3x must cover the animal's
// largest draw scale: its world scale times the stage scale at Original zoom on a 2560 x 1440 monitor.
import { test } from 'node:test';
import { imageSize } from '../tools/image-size.mjs';
import { pngBufferToWebp } from '../tools/webp-lossless.mjs';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

/** Which animal a sheet path draws (null: not one of the five). Rook sheets are the animal's own clip. */
function animalOf(path) {
  if (/npc_piggy__|piggy-rooked/.test(path)) return 'piggy';
  if (/npc_chicken|chicken-rooked/.test(path)) return 'chicken';
  if (/npc_butterfly__|butterfly-(fly|rest)-rooked/.test(path)) return 'butterfly';
  if (/npc_batterfly_/.test(path)) return 'batterfly';
  if (/kitties\/kitty-|rooks\/kitty-sad/.test(path)) return 'kitty';
  return null;
}

async function animalSheets() {
  const { collectSheets, gameSheetTable } = await import('./sheet-sources.js');
  const rows = [...await collectSheets(), ...gameSheetTable().map((r) => ({ ...r, density: 1 }))];
  const out = new Map();
  for (const r of rows) {
    const animal = animalOf(r.path);
    if (animal && !out.has(r.path)) out.set(r.path, { ...r, animal });
  }
  return [...out.values()];
}

/** World px per art px for each animal, read from the modules that draw them. */
async function worldScales() {
  const { moduleConsts } = await import('./sheet-sources.js');
  const entity = moduleConsts('game.js').get('ENTITY_SCALE');
  return {
    piggy: entity.piggy,
    chicken: entity.chicken,
    butterfly: Math.max(entity.butterfly, entity.butterflyFly),
    // js/features/animal-husbandry-feature.js buildBatterfly: spr.scale.set(0.82).
    batterfly: 0.82,
    kitty: moduleConsts('js/features/heli-kitties-feature.js').get('KITTY_SCALE'),
  };
}

test('every animal sheet the game slices is found, the Piggy rooting look among them', async () => {
  const rows = await animalSheets();
  const by = (a) => rows.filter((r) => r.animal === a).length;
  assert.ok(by('piggy') >= 7, `piggy sheets ${by('piggy')}`);
  assert.ok(by('chicken') >= 5, `chicken sheets ${by('chicken')}`);
  assert.ok(by('butterfly') >= 4, `butterfly sheets ${by('butterfly')}`);
  assert.ok(by('batterfly') >= 2, `batterfly sheets ${by('batterfly')}`);
  assert.ok(by('kitty') >= 11, `kitty sheets ${by('kitty')}`);
  assert.ok(rows.some((r) => r.path === 'assets/sprites/npc_piggy__x1_look_screen_png_1354829434.webp'));
});

test('every animal sheet has a 3x twin from the vector SWF, exactly three times its 1x pixels', async () => {
  const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=abaf3d5a');
  const missing = [];
  for (const r of await animalSheets()) {
    if (r.density >= 3) continue;
    const twin = HIRES_SPRITES.get(r.path);
    if (!twin || !existsSync(join(pub, twin))) missing.push(`${r.name}: ${r.path}`);
  }
  assert.deepEqual(missing, [], 'animal sheets drawn from a 1x raster');
});

test('each animal sheet stores at least as many pixels as its largest draw scale', async () => {
  const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=abaf3d5a');
  const { stageFor } = await import('../public/js/location-view.js?v=f1f922b4');
  // Original zoom on a 2560 x 1440 monitor (the game area under the top bar), CSS px per world px.
  const stage = stageFor({ width: 2560, height: 1360, sceneWidth: 4000, sceneHeight: 1000, zoom: 1 }).scale;
  assert.ok(stage > 2 && stage < 3, `stage ${stage}`);
  const scales = await worldScales();
  const soft = [];
  for (const r of await animalSheets()) {
    const density = HIRES_SPRITES.has(r.path) ? 3 : r.density;
    const draw = scales[r.animal] * stage;
    if (density < draw) soft.push(`${r.name}: stored ${density}x, drawn ${draw.toFixed(2)}x`);
  }
  assert.deepEqual(soft, []);
});

// Signposts (Austin, 2026-11-01, Groddle Forest Junction: "Does the sign post look slightly blurry?").
// Their words are drawn by Pixi at SIGN_TEXT_RESOLUTION; the woods are Tiny Speck's PNGs, which
// exist only as 1x rasters (glitch-client TSEngineAssets/src/Assets.as embeds signpost_post.png,
// signpost_arm.png and signpost_shadow.png; SignpostView.as 83 drew them at holder scale 0.8, so
// the 2012 client never magnified them). No vector source shipped, so each has a 3x twin rendered
// from a hand trace of the 1x PNG (tools/signpost-art, G509), loaded wherever the 1x URL is used.
const SIGN_RASTERS = Object.freeze({
  'assets/ui/signpost/signpost_post.webp': { w: 43, h: 246 },
  'assets/ui/signpost/signpost_arm.webp': { w: 260, h: 30 },
  'assets/ui/signpost/signpost_shadow.webp': { w: 87, h: 26 },
});

/** Device px per signpost art px: holder 0.8 x the stage at Original zoom x a 2x screen. */
async function signDrawScale(width, height) {
  const { stageFor } = await import('../public/js/location-view.js?v=f1f922b4');
  const { moduleConsts } = await import('./sheet-sources.js');
  const sign = moduleConsts('js/street-render.js').get('SIGNPOST');
  return sign.scale * stageFor({ width, height, sceneWidth: 4000, sceneHeight: 1000, zoom: 1 }).scale * 2;
}

test('signpost words are rendered at least as finely as a 2x screen draws them at Original zoom', async () => {
  const { moduleConsts } = await import('./sheet-sources.js');
  const resolution = moduleConsts('js/street-render.js').get('SIGN_TEXT_RESOLUTION');
  // A 13 to 16 inch laptop, full screen, under the top bar.
  for (const [w, h] of [[1280, 740], [1512, 880], [1728, 1010]]) {
    const draw = await signDrawScale(w, h);
    assert.ok(resolution >= draw, `${w} x ${h}: words at ${resolution}x, drawn ${draw.toFixed(2)}x`);
  }
});

test('signpost woods keep Tiny Speck\'s own 1x pictures (their pixels, as lossless WebP) for 1x screens', async () => {
  const { readFileSync } = await import('node:fs');
  const client = join(root, '../glitch-client/TSEngineAssets/src/assets/graphics');
  for (const [path, size] of Object.entries(SIGN_RASTERS)) {
    const b = readFileSync(join(pub, path));
    assert.deepEqual({ w: imageSize(b).w, h: imageSize(b).h }, size, path);
    if (existsSync(client)) assert.ok(b.equals(pngBufferToWebp(readFileSync(join(client, path.split('/').pop().replace(/\.webp$/, '.png'))))), `${path} is the client's picture`);
  }
});

test('signpost woods have a sharp 3x copy, finer than a 2x screen draws them at Original zoom', async () => {
  const { readFileSync } = await import('node:fs');
  const { HIRES_SPRITES, hiresSpriteUrl } = await import('../public/js/sprite-hires.js?v=abaf3d5a');
  const soft = [];
  for (const [path, size] of Object.entries(SIGN_RASTERS)) {
    const twin = HIRES_SPRITES.get(path);
    if (!twin || !existsSync(join(pub, twin))) {
      soft.push(`${path}: no 3x copy`);
      continue;
    }
    assert.match(twin, /@3x\.(png|webp)$/, twin);
    assert.equal(hiresSpriteUrl(`./${path}?v=1`), `${twin}?v=1`, 'loaded wherever the 1x URL is used');
    const b = readFileSync(join(pub, twin));
    const kind = b.toString('ascii', 12, 16);
    const three = b.readUInt32BE(0) === 0x89504e47
      ? { w: imageSize(b).w, h: imageSize(b).h }
      : kind === 'VP8X'
        ? { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 }
        : { w: (b.readUInt32LE(21) & 0x3fff) + 1, h: ((b.readUInt32LE(21) >> 14) & 0x3fff) + 1 };
    assert.deepEqual(three, { w: size.w * 3, h: size.h * 3 }, twin);
  }
  assert.deepEqual(soft, []);
  // A 13 to 16 inch laptop, full screen, under the top bar: the 3x copy covers every draw scale.
  for (const [w, h] of [[1280, 740], [1512, 880], [1728, 1010]]) {
    const draw = await signDrawScale(w, h);
    assert.ok(draw > 1.5 && draw <= 3, `${w} x ${h}: signpost drawn ${draw.toFixed(2)}x, stored 3x`);
  }
});
