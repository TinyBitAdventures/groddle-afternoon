/**
 * A stack put down in a place (the floor, a shelf, a table, a street) looks the
 * way the original drew it (Austin 2026-11-01: a diamond on a shelf was big and
 * floating): the scene named by its count from the item's SWF (glitch-client
 * ItemstackState.as getDefaultStrForStack 202-209, AbstractItemstackView.as
 * animateMC 339-356) at its own size, its bottom on the line, lying still
 * (LocationItemstackView.as 853-854, bob_amt 0 by default 228). The art is
 * tools/world-art/render.py's; js/world-art.js picks it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WORLD_ART } from '../public/js/world-art-list.js?v=d1252eef';
import { FALLBACK_MAX, artIdOf, worldArtFor, worldStateFor } from '../public/js/world-art.js?v=f9ece277';
import { surfaceHeight, stackSurfaceAt, createHomeDecorState } from '../public/js/home-decor.js?v=d03413ec';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js?v=1b84f5f7';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');

describe('world art (tools/world-art/render.py)', () => {
  it('lists exactly the rendered files, one per state', () => {
    const dir = join(pub, 'assets/sprites/world');
    const listed = new Set();
    for (const [id, states] of Object.entries(WORLD_ART)) {
      for (const [state, [w, h]] of Object.entries(states)) {
        assert.ok(w > 0 && h > 0, `${id} ${state}`);
        listed.add(`${id}/${state}@3x.webp`);
      }
    }
    const files = new Set();
    for (const id of readdirSync(dir)) for (const f of readdirSync(join(dir, id))) files.add(`${id}/${f}`);
    assert.deepEqual([...files].sort(), [...listed].sort());
    assert.ok(listed.size > 1500, `${listed.size} states`);
  });

  it('draws the diamond lying down at its own 23 x 26, not its 41 x 34 pack icon', () => {
    assert.deepEqual(WORLD_ART.gem_diamond, { 1: [23, 26] });
    const art = worldArtFor('gem_diamond', 1, 'assets/sprites/icons/gem_diamond.png');
    assert.equal(art.url, 'assets/sprites/world/gem_diamond/1@3x.webp');
    assert.deepEqual([art.w, art.h], [23, 26]);
  });

  it("plays the count's own scene, else the highest numbered one (MCUtil.getHighestCountSceneName)", () => {
    const apple = WORLD_ART.apple;
    assert.equal(worldStateFor(apple, 1), '1');
    assert.equal(worldStateFor(apple, 3), '3');
    assert.equal(worldStateFor(apple, 40), '4');
    assert.equal(worldStateFor(null, 7), '1');
    assert.equal(worldArtFor('apple', 2).url, 'assets/sprites/world/apple/2@3x.webp');
  });

  it('goes by the icon file, and a class with no SWF keeps its icon at the fallback size', () => {
    assert.equal(artIdOf('x', 'assets/sprites/icons/plank@3x.png'), 'plank');
    assert.equal(artIdOf('plank', ''), 'plank');
    assert.equal(worldArtFor('no_such_thing', 1), null);
    assert.ok(FALLBACK_MAX >= 24 && FALLBACK_MAX <= 48);
  });

  it('leaves out things that never lie in a place (no drop verb: furniture, trees, rocks)', () => {
    for (const id of ['furniture_shelf', 'trant_bean', 'rock_metal_1', 'bag_cabinet_ok_4_4']) assert.equal(WORLD_ART[id], undefined, id);
    assert.ok(WORLD_ART.bag_generic && WORLD_ART.pick && WORLD_ART.plank);
  });

  it('game.js draws a dropped stack from it, still, at its own size', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    const spawn = game.slice(game.indexOf('function spawnDroppedItemStack('), game.indexOf('function droppedStacksTsid('));
    assert.match(spawn, /worldArtFor\(stack\.classTsid, stack\.count, item\.icon\)/);
    assert.doesNotMatch(spawn, /\.bob\b/);
    assert.doesNotMatch(game, /for \(const stack of droppedItemSprites\) \{\s*stack\.bob/);
    const size = game.slice(game.indexOf('function sizeDroppedItemSprite('), game.indexOf('function placeDroppedCount('));
    assert.match(size, /spr\.scale\.set\(1\)/);
    assert.match(size, /WORLD_ART_FALLBACK_MAX/);
  });
});

describe('what is set on a shelf rests on its plank', () => {
  it("an upgraded wall shelf's plat counts from the SWF stage's bottom, under its art (art.foot)", () => {
    for (const [id, row] of Object.entries(FURNITURE_UPGRADES.furniture_shelf.upgrades)) {
      if (!row.art) continue;
      assert.ok(Number.isFinite(row.art.foot), id);
      const h = surfaceHeight('furniture_shelf', id);
      assert.ok(h > 0 && h <= row.art.h, `${id}: ${h} on ${row.art.h}`);
    }
    // Basic Wooden Shelf (94): plat 52 over a stage bottom 19 px under its 49 px art: 33 up, on the plank.
    assert.equal(FURNITURE_UPGRADES.furniture_shelf.upgrades['94'].art.foot, 19);
    assert.equal(surfaceHeight('furniture_shelf', '94'), 33);
  });

  it('leaves tables and the base shelf as they were', () => {
    assert.equal(surfaceHeight('furniture_shelf', ''), 40);
    assert.equal(surfaceHeight('furniture_table', '59'), 52);
  });

  it("a stack dragged onto an upgraded shelf lands on the shelf's plank", () => {
    const state = createHomeDecorState({});
    state.placed.push({ id: 99, classTsid: 'furniture_shelf', upgradeId: '94', x: 700, y: 300, z: 50, slot: 'wall' });
    const at = stackSurfaceAt(state, 700, 250);
    assert.equal(at.on, 99);
    assert.equal(at.y, 267);
  });
});
