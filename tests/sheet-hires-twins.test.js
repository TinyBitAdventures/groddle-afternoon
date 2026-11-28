/**
 * G957: every sprite sheet the game slices has art for high-density screens, or a reason it does
 * not. The second and third rock shapes (rock_<kind>_2 / _3, added 2026-11-12) shipped without the
 * 3x twin the first shape has, and nothing failed, so a Retina screen upscaled the 1x Metal Rock
 * next to the sharp Glitch. This test reads every grid sheet tests/sheet-sources.js collects (game.js
 * SHEETS, feature and quest-room tables, kit calls, animals, NPCs, vendors, trees, rocks, tools,
 * overlays) and passes a 1x sheet only when one of these covers it:
 *  - a twin in js/sprite-hires.js (HIRES_SPRITES, SPLIT_SPRITES) or js/sprite-dense.js;
 *  - 3x atlases drawn only while on screen, on computers (js/sprite-onscreen.js, G961: the Scion);
 *  - an NPC Glitch's own @2x sheet (js/npc-glitch-sheets.js `hires`);
 *  - an overlay's SVG frames, drawn at the screen's density (overlays.json `vector`);
 *  - art already 2x or more inside the 1x file, drawn scaled down (POTION_ART and the Door Drink
 *    portal's `scale`), or an @Nx name of 2 or more;
 *  - a pack icon's @3x (js/icon-hires.js).
 * Anything else must be in ALLOWED_1X with its reason. The list may only shrink: an entry that is
 * now covered or no longer drawn fails, and so does a new entry past ALLOWED_1X_MAX.
 * Street decos have their own records (tools/deco-pipeline/plan.json `no_hires`, tests/deco-sharp.test.js).
 * Run: node --test tests/sheet-hires-twins.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSheets, gameSheetTable } from './sheet-sources.js';
import { HIRES_SPRITES, SPLIT_SPRITES } from '../public/js/sprite-hires.js?v=6a4569c4';
import { DENSE_SPRITES } from '../public/js/sprite-dense.js?v=67101472';
import { ONSCREEN_SPRITES } from '../public/js/sprite-onscreen.js?v=cdeffc77';
import { HIRES_ICONS } from '../public/js/icon-hires.js?v=60e2474b';
import { NPC_GLITCH_SHEETS } from '../public/js/npc-glitch-sheets.js?v=1163dc99';
import { POTION_ART } from '../public/js/potion-art.js?v=9d731b38';
import { PORTAL_SHEET } from '../public/js/door-drink.js?v=15add3b8';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const POWDER_WHY = 'js/powder-shakers.js: the jar is fitted to 60 px, so a 48 x 160 cell is drawn at 18 x 60, under its own size (3x renders matched 0.91-0.98 but were 17 MB nobody would see)';
/** 1x sheets with no high-density art, each with why. Only shrinks (see the header). */
export const ALLOWED_1X = new Map([
  ['assets/sprites/butler/butler_v10_idle0.webp', 'BUTLER_FALLBACK: shown only until js/butler-rig.js (bag_butler.swf vectors, painted at the screen\'s density) has loaded'],
  ['assets/sprites/butler/butler_v10_walk4.webp', 'BUTLER_FALLBACK: shown only until js/butler-rig.js (bag_butler.swf vectors, painted at the screen\'s density) has loaded'],
  ['assets/sprites/overlays/rainbow_winner@1.25x.webp', 'nothing draws it: js/race-render.js drawWinnerRainbow has no caller (desk decision), so it has no SVG frames (tests/overlays.test.js)'],
  ['assets/sprites/powders/extremely_hallowed_shrine_powder-tool.webp', POWDER_WHY],
  ['assets/sprites/powders/fairly_hallowed_shrine_powder-tool.webp', POWDER_WHY],
  ['assets/sprites/powders/fertilidust-tool.webp', POWDER_WHY],
  ['assets/sprites/powders/fertilidust_lite-tool.webp', POWDER_WHY],
  ['assets/sprites/powders/no_no_powder-tool.webp', POWDER_WHY],
  ['assets/sprites/powders/powder_of_mild_fecundity-tool.webp', POWDER_WHY],
  ['assets/sprites/powders/powder_of_startling_fecundity-tool.webp', POWDER_WHY],
  ['assets/sprites/powders/sneezing_powder-tool.webp', POWDER_WHY],
  ['assets/sprites/powders/sparkle_powder-tool.webp', POWDER_WHY],
  ['assets/sprites/quest-rooms/an_autumn_day/bird_red.webp', 'one-colour silhouette (G308: rook_fly_forward.swf flattened red) drawn at scale 0.5; a twin needs the flatten step on a vector render, which tools/vector-sprites has not got'],
  ['assets/sprites/quest-rooms/an_autumn_day/crow.webp', 'one-colour silhouette (G308: rook_fly_side.swf flattened) drawn at scale 0.42 in An Autumn Day and 0.2 over Rook Woods; a twin needs the flatten step on a vector render'],
  ['assets/sprites/quest-rooms/esquibeth/conch_decoy.webp', 'tools/vector-sprites rejected the render: mean frame score 0.884 under its 0.9 bar (results.json)'],
]);
/** ALLOWED_1X's size (17 when G957 closed, 15 once G961 drew the Scion). Lower it as entries go; never raise it. */
export const ALLOWED_1X_MAX = 15;

const clean = (p) => String(p).split('?')[0];
const atDensity = (p) => Number(/@(\d+(?:\.\d+)?)x\./.exec(p)?.[1] || 1);

function coverage() {
  const npcHires = new Set();
  for (const look of Object.values(NPC_GLITCH_SHEETS)) {
    for (const s of Object.values(look.sheets)) if (s.hires && atDensity(s.hires) >= 2) npcHires.add(`${look.dir}${s.file}`);
  }
  const overlays = JSON.parse(readFileSync(join(pub, 'assets/sprites/overlays/overlays.json'), 'utf8'));
  const vector = new Set(Object.values(overlays).filter((m) => m.kind === 'sheet' && m.vector).map((m) => `assets/sprites/overlays/${m.file}`));
  // Art drawn at `scale` below 1 holds 1/scale texels per world pixel in the 1x file.
  const inline = new Map([...Object.values(POTION_ART).map((a) => [a.url, 1 / a.scale]), [PORTAL_SHEET.url, 1 / PORTAL_SHEET.scale]]);
  const iconId = (p) => /^assets\/sprites\/icons\/([^/@]+)\.(webp|png)$/.exec(p)?.[1];
  return (path) => {
    if (HIRES_SPRITES.has(path) || SPLIT_SPRITES.has(path) || DENSE_SPRITES.has(path)) return 'twin';
    if (ONSCREEN_SPRITES.has(path)) return 'on-screen 3x';
    if (npcHires.has(path)) return 'npc @2x';
    if (vector.has(path)) return 'svg frames';
    if ((inline.get(path) || 0) >= 2 - 1e-3) return 'dense file';
    if (atDensity(path) >= 2 && !path.startsWith('assets/sprites/overlays/')) return 'dense file';
    if (HIRES_ICONS.has(iconId(path))) return 'icon @3x';
    return null;
  };
}

async function sheets1x() {
  const rows = [...(await collectSheets()), ...gameSheetTable().map((r) => ({ ...r, density: atDensity(r.path) }))];
  const out = new Map();
  for (const r of rows) {
    const path = clean(r.path);
    // NPC Glitch @2x rows and other @Nx files are the twins themselves, not sheets needing one.
    if (r.name.endsWith(' hires') || (atDensity(path) > 1 && !path.startsWith('assets/sprites/overlays/'))) continue;
    if (!out.has(path)) out.set(path, r.name);
  }
  return out;
}

describe('G957: hi-res twins for every sheet the game draws', () => {
  it('every 1x sheet has high-density art, or an allowlisted reason', async () => {
    const covered = coverage();
    const sheets = await sheets1x();
    assert.ok(sheets.size > 700, `collected ${sheets.size} sheets`);
    const missing = [...sheets].filter(([path]) => !covered(path) && !ALLOWED_1X.has(path)).map(([path, name]) => `${path} (${name})`);
    assert.deepEqual(missing, [], 'render a twin (tools/vector-sprites) or, with a reason, allowlist it');
  });

  it('G961: the Scion of Purple\'s two sheets are drawn sharp on screen, off the allowlist', async () => {
    const sheets = await sheets1x();
    for (const p of ['assets/sprites/potions/scion_of_purple.webp', 'assets/sprites/potions/scion_of_purple_fade.webp']) {
      assert.ok(sheets.has(p), p);
      assert.equal(coverage()(p), 'on-screen 3x', p);
      assert.ok(!ALLOWED_1X.has(p), p);
    }
  });

  it('the rock shapes (the sheets G957 found) all have 3x twins', async () => {
    const sheets = await sheets1x();
    const rocks = [...sheets.keys()].filter((p) => p.startsWith('assets/sprites/mining/rock_'));
    assert.equal(rocks.length, 12);
    for (const p of rocks) assert.equal(HIRES_SPRITES.get(p), p.replace('.webp', '@3x.webp'), p);
  });

  it('the allowlist only shrinks: each entry is still drawn, still has no twin, and has a reason', async () => {
    const covered = coverage();
    const sheets = await sheets1x();
    assert.ok(ALLOWED_1X.size <= ALLOWED_1X_MAX, `ALLOWED_1X grew to ${ALLOWED_1X.size} (max ${ALLOWED_1X_MAX})`);
    for (const [path, why] of ALLOWED_1X) {
      assert.ok(sheets.has(path), `${path}: no longer drawn, drop it from ALLOWED_1X and lower ALLOWED_1X_MAX`);
      assert.equal(covered(path), null, `${path}: now covered, drop it from ALLOWED_1X and lower ALLOWED_1X_MAX`);
      assert.ok(why.length > 30, path);
    }
  });
});
