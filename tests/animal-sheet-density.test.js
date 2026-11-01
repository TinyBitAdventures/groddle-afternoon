// Every animal clip is stored at least as finely as the game draws it (Austin, 2026-11-01: the Piggy
// went pixelated and soft after a feed, next to the sharp avatar and props: its rooting look_screen
// clip was the one Piggy sheet left at 1x). Each Piggy, Chicken, Butterfly, Batterfly and Heli Kitty
// sheet the js/ modules slice (tests/sheet-sources.js) must have its 3x twin from Tiny Speck's vector
// SWF (tools/vector-sprites/animals.json, js/sprite-hires.js), and that 3x must cover the animal's
// largest draw scale: its world scale times the stage scale at Original zoom on a 2560 x 1440 monitor.
import { test } from 'node:test';
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
  assert.ok(rows.some((r) => r.path === 'assets/sprites/npc_piggy__x1_look_screen_png_1354829434.png'));
});

test('every animal sheet has a 3x twin from the vector SWF, exactly three times its 1x pixels', async () => {
  const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=17562829');
  const missing = [];
  for (const r of await animalSheets()) {
    if (r.density >= 3) continue;
    const twin = HIRES_SPRITES.get(r.path);
    if (!twin || !existsSync(join(pub, twin))) missing.push(`${r.name}: ${r.path}`);
  }
  assert.deepEqual(missing, [], 'animal sheets drawn from a 1x raster');
});

test('each animal sheet stores at least as many pixels as its largest draw scale', async () => {
  const { HIRES_SPRITES } = await import('../public/js/sprite-hires.js?v=17562829');
  const { stageFor } = await import('../public/js/location-view.js?v=5a0d5c0b');
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
