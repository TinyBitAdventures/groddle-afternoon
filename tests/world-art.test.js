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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WORLD_ART } from '../public/js/world-art-list.js?v=df42115a';
import { FALLBACK_MAX, artIdOf, worldArtFor, worldStateFor } from '../public/js/world-art.js?v=df476660';
import { surfaceHeight, stackSurfaceAt, createHomeDecorState } from '../public/js/home-decor.js?v=d03413ec';
import { FURNITURE_UPGRADES } from '../public/js/furniture-upgrades-data.js?v=1b84f5f7';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');
const items = join(root, '../glitch-items');

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

  // Player report 35: a put-down Card-Carrying Qualification drew its badge. glitch-items/achievements
  // holds the badges, and 11 share a file name with an item; the render took the first file of a
  // name, the badge's.
  it("every state is drawn from the item's own SWF, never a badge (report 35)", () => {
    const art = JSON.parse(readFileSync(join(root, 'tools/world-art/art.json'), 'utf8'));
    assert.deepEqual(Object.keys(art).sort(), Object.keys(WORLD_ART).sort());
    const wrong = [];
    for (const [id, row] of Object.entries(art)) {
      const swf = String(row.swf || '');
      const parts = swf.split('/');
      if (parts[0] === 'achievements' || parts.at(-1) !== `${id}.swf`) wrong.push(`${id}: ${swf || 'no swf'}`);
    }
    assert.deepEqual(wrong, []);
    assert.equal(art.card_carrying_qualification.swf, 'misc/card_carrying_qualification/card_carrying_qualification.swf');
    for (const id of ['artifact_magical_pendant', 'artifact_mirror_with_scribbles', 'artifact_platinumium_spork', 'artifact_torn_manuscript']) {
      assert.equal(art[id].swf, `artifacts/${id}/${id}.swf`, id);
    }
    // The card lies flat at its own 58 x 16, not the 172 x 172 badge.
    assert.deepEqual(WORLD_ART.card_carrying_qualification, { 1: [58, 16] });
  });

  it('each SWF named in art.json is the one rendered (its hash), when glitch-items is beside the repo', { skip: !existsSync(items) && 'needs glitch-items beside the repo' }, () => {
    const art = JSON.parse(readFileSync(join(root, 'tools/world-art/art.json'), 'utf8'));
    const stale = [];
    for (const [id, row] of Object.entries(art)) {
      const path = join(items, row.swf);
      const digest = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16) : 'missing';
      if (digest !== row.sha) stale.push(`${id}: ${row.swf} ${digest} vs ${row.sha}`);
    }
    assert.deepEqual(stale, []);
    // And no item folder holds a SWF of the same name the render passed over for another one.
    const seen = new Map();
    const walk = (dir, top) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, top ?? e.name);
        else if (e.name.endsWith('.swf') && top !== 'achievements') {
          const id = e.name.slice(0, -4);
          if (art[id]) seen.set(id, [...(seen.get(id) || []), p.slice(items.length + 1)]);
        }
      }
    };
    walk(items, null);
    const twins = [...seen].filter(([, paths]) => paths.length > 1).map(([id, paths]) => `${id}: ${paths.join(', ')}`);
    assert.deepEqual(twins, []);
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
