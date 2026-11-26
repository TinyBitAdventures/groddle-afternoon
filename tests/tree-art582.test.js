/**
 * #582 (phone, Empty Via 4): a Paper Tree was not drawn at all, though its Tap label and its menu
 * worked ("21 paper · wants water and petting"); watering it drew it. Its art is one sheet per
 * care state (needs_pet x needs_water, paper_tree.js), loaded when the street spawns its nodes. The
 * spawn read which sheets to load before ticking the nodes, and the tick ends a tree's care 6
 * minutes after it was watered and petted (needsResetAt), which changes its sheet: a tree left
 * cared for came back needing care over a sheet never loaded, and the view recorded that frame as
 * drawn, so no refresh drew it until watering changed the sheet. Now the spawn ticks first, a view
 * whose sheet is not loaded loads it and draws it, and a sheet that fails is not asked for in a loop.
 * And every tree kind has its art for every state.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createResourceNode, getResourceNodeDef, resourceNodeFrame, tickResourceNode } from '../public/js/resource-nodes.js?v=433a3e48';
import { setTrantTables, TRANT_META } from '../public/js/trants.js?v=864ea9ff';
import { treeFrameUrl } from '../public/js/features/patches-feature.js?v=c2617f1c';
import { soilSpritePaths, DEAD_TRANT_CLASSES } from '../public/js/patches.js?v=3068579c';
import { HIRES_SPRITES } from '../public/js/sprite-hires.js?v=e96be5f1';
import { ENCHANTED_TREE_SHEETS } from '../public/js/enchanted-forests.js?v=17ac01e4';

const pub = join(import.meta.dirname, '../public');
const file = (url) => join(pub, String(url).split('?')[0]);

/** Width and height of a lossless (VP8L) or extended (VP8X) WebP. */
function webpSize(path) {
  const b = readFileSync(path);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  assert.equal(kind, 'VP8X', `${path}: ${kind}`);
  return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
}

before(() => {
  setTrantTables(JSON.parse(readFileSync(join(pub, 'assets/content/trants.json'), 'utf8')));
});

describe('#582 a Paper Tree whose care ran out while you were away is drawn', () => {
  it('its sheet changes when the care runs out (why the spawn must tick before it loads)', () => {
    const now = 1_800_000_000_000;
    const node = createResourceNode('paper_tree', { now });
    Object.assign(node, { petted: true, watered: true, needsResetAt: now - 60_000, units: 21 });
    const before = resourceNodeFrame(node, now).sheet.path;
    tickResourceNode(node, now);
    const after = resourceNodeFrame(node, now);
    assert.notEqual(after.sheet.path, before);
    assert.match(after.sheet.path, /paper-tree-pet-true-water-true\.webp$/, 'wants water and petting');
    assert.equal(after.frameIndex, 21);
  });

  it('the spawn ticks the nodes before it reads their sheets, and a view without its sheet loads it', () => {
    const src = readFileSync(join(pub, 'js/features/resource-nodes-feature.js'), 'utf8');
    const spawn = src.slice(src.indexOf('async function spawnStreet('), src.indexOf('function triggerTrap('));
    const tick = spawn.indexOf('for (const item of items) tickResourceNode(item.node, ticked);');
    assert.ok(tick > 0 && tick < spawn.indexOf('sheetsNeeded(item.node)'), 'ticked before the needs are read');
    const ground = src.slice(src.indexOf('function buildGroundView('), src.indexOf('function buildFireflyView('));
    assert.match(ground, /sheetPath: texture \? frame\?\.sheet\?\.path : null, frameIndex: texture \? frame\?\.frameIndex : null/);
    assert.match(ground, /if \(!texture && frame\?\.sheet\) refreshEntity\(engine, entity\);/);
    const refresh = src.slice(src.indexOf('function refreshEntity('), src.indexOf('// Effects'));
    assert.match(refresh, /if \(!missing\.every\(\(def\) => sheets\.has\(def\.path\)\)\) return;/, 'a failed sheet is not retried in a loop');
  });
});

describe('#582 every tree kind has its art for every state', () => {
  it('a Paper Tree: each care state and paper count has a whole sheet, 1x and 3x, and a frame in it', () => {
    const def = getResourceNodeDef('paper_tree');
    const seen = new Set();
    for (const petted of [false, true]) {
      for (const watered of [false, true]) {
        for (let units = def.stock.min; units <= def.stock.max; units += 1) {
          const node = { ...createResourceNode('paper_tree', { now: 1 }), petted, watered, units };
          const frame = resourceNodeFrame(node, 1);
          assert.ok(frame?.sheet, `petted ${petted} watered ${watered} units ${units}: no sheet`);
          assert.ok(frame.frameIndex >= 0 && frame.frameIndex < frame.sheet.frameCount, `frame ${frame.frameIndex}`);
          seen.add(frame.sheet);
        }
      }
    }
    assert.equal(seen.size, 4, 'one sheet per care state');
    for (const s of seen) {
      assert.deepEqual(webpSize(file(s.path)), [s.width, s.height], s.path);
      const hi = HIRES_SPRITES.get(s.path);
      assert.ok(hi && existsSync(file(hi)), `${s.path}: its 3x`);
      assert.deepEqual(webpSize(file(hi)), [s.width * 3, s.height * 3], hi);
    }
  });

  it('a fruit tree of each kind: every maturity and fruit level has its frame, 1x and 3x', () => {
    const kinds = Object.keys(TRANT_META);
    assert.equal(kinds.length, 6);
    for (const kind of kinds) {
      for (let maturity = 0; maturity <= 10; maturity += 1) {
        for (const fruitCount of [0, 1, 99]) {
          const url = treeFrameUrl(kind, maturity, { maturity, fruitCount, health: 10 });
          assert.ok(existsSync(file(url)), `${kind} m${maturity} fruit ${fruitCount}: ${url}`);
          assert.ok(existsSync(file(url).replace(/\.webp$/, '@3x.webp')), `${url}: its 3x`);
        }
      }
    }
  });

  it('a dead tree of each kind, the Wood Tree and the Enchanted Forest\'s have their art', () => {
    const soil = soilSpritePaths();
    for (const dead of DEAD_TRANT_CLASSES) {
      const path = soil.find((p) => p.endsWith(`${dead.replace(/_/g, '-')}.webp`));
      assert.ok(path && existsSync(file(path)), `${dead}: ${path}`);
    }
    const wood = 'assets/sprites/wood_tree_maturity_6_variant_2_x6_1_png_1354833445.webp';
    assert.deepEqual(webpSize(file(wood)), [88 * 6, 138], 'six Wood Tree stages');
    assert.ok(existsSync(file(HIRES_SPRITES.get(wood))), 'its 3x');
    for (const s of ENCHANTED_TREE_SHEETS) assert.ok(existsSync(file(s.url)), s.url);
  });
});
