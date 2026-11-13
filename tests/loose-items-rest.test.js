/**
 * Loose things on a street rest on the ground (Austin 2026-11-02: "the various floating apples
 * around the world, can we have them placed or resting instead?", Hechey Track's two Apples).
 *
 * In the original every one of these is an item stack, and an item stack on a street lies still
 * on the line under it:
 * - the client draws a stack with its art's bottom centre on the stack's point
 *   (LocationItemstackView.as _positionViewDO 853-854) and bobs it only for a class whose CSS
 *   names a bob_amt (215-229, default 0); apple.js names none;
 * - a stack put in a place obeys physics (obey_physics, true for takeables, apple.js 315): it goes
 *   in at the point the server gives it (takeable.js takeable_drop 164-167: pc.y - 20) and falls
 *   to the first line that holds items (PlatformLine.as 127 getPlatsSolidFromTopForItems).
 *
 * The remake's ambient Apples (4 a street) bobbed 3 px up and down around a point 2 px under
 * their line: 4,984 of them on 1,246 streets moved, none lay still. Stacks that features made
 * went in 74 px over the ground and stayed there (a dead Piggy's Meat, a dead tree's Planks, a
 * dropped SWF), and a stack the realtime server put in at the dropper's feet - 20 (drops.go,
 * takeable.js 166-167) stayed 20 px up. Now every drawn and created stack comes to rest on the
 * line under it (walk-surface.js stackRestY, game.js restingStackY), except in a home's rooms,
 * where homes-feature sets each stack on the shelf, table or seat that holds it.
 *
 * The sweep: every street in the index, laid out as tools/build-realtime-objects.mjs lays it out
 * for solo and the realtime server; each planned Apple and Musicblock must sit on a line that
 * holds items, its drawn bottom within 2 px of it.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STACK_SINK_PX, landingY, stackRestY } from '../public/js/walk-surface.js?v=106bfdc5';
import { placementRequests } from '../tools/build-realtime-objects.mjs';
import { STREET_INDEX, applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=18b181ad';
import { ecologyForStreet, planStreetPlacements, populationForStreet, setStreetEcologyCatalog, streetReservedSpots } from '../public/js/street-ecology.js?v=4922aff5';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=b6cb6a4e';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** The text of game.js `function name(` up to the next top-level function. */
function fnText(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `game.js has ${name}`);
  const next = src.slice(at + 10).search(/\n(?:async )?function /);
  return src.slice(at, next < 0 ? undefined : at + 10 + next);
}

describe('stackRestY: where a stack set down comes to rest', () => {
  const floor = { x1: 0, y1: 900, x2: 2000, y2: 900, pcPerm: -1, itemPerm: -1 };
  const shelf = { x1: 400, y1: 700, x2: 600, y2: 700, pcPerm: 0, itemPerm: -1 };
  const soft = { x1: 800, y1: 600, x2: 1000, y2: 600, pcPerm: 0, itemPerm: 0 };
  const ceiling = { x1: 1200, y1: 500, x2: 1400, y2: 500, pcPerm: 1, itemPerm: 1 };
  const lines = [floor, shelf, soft, ceiling];

  it('a stack in the air falls to the floor under it', () => {
    assert.equal(stackRestY(lines, 100, 900 - 74), 900);
    assert.equal(stackRestY(lines, 100, 900 - 20), 900);
  });

  it('one on its line stays, and one a few px into it comes up onto it', () => {
    assert.equal(stackRestY(lines, 100, 900), 900);
    assert.equal(stackRestY(lines, 100, 902), 900);
    assert.equal(stackRestY(lines, 100, 900 + STACK_SINK_PX), 900);
  });

  it('a shelf that holds items catches it (players walk through it, items rest on it)', () => {
    assert.equal(stackRestY(lines, 500, 650), 700);
    assert.equal(stackRestY(lines, 500, 700), 700);
  });

  it('a line soft to items and an underside let it through to the floor', () => {
    assert.equal(stackRestY(lines, 900, 550), 900);
    assert.equal(stackRestY(lines, 1300, 450), 900);
  });

  it('with no line under it, null (the game keeps it where it was put)', () => {
    assert.equal(stackRestY(lines, 2500, 800), null);
    assert.equal(stackRestY([], 100, 800), null);
  });
});

describe('the game draws loose street things at rest', () => {
  const src = read('public/game.js');

  it('an Apple lies still on its planned point: no bob, no lift', () => {
    const spawn = fnText(src, 'spawnApples');
    assert.doesNotMatch(spawn, /\.bob\b|Math\.sin/, 'spawnApples sets no bob');
    assert.match(spawn, /spr\.x = p\.x;\n\s+spr\.y = p\.y;/, 'its bottom centre on the point');
    assert.match(src, /apples = spawnApples\(placement\('apples'\)\);/);
    assert.doesNotMatch(src, /for \(const a of apples\)/, 'the frame loop moves no apple');
  });

  it('every dropped or created stack rests on the line under it', () => {
    const rest = fnText(src, 'restingStackY');
    assert.match(rest, /stackRestY\(streetPlatforms, x, y\) \?\? y/);
    assert.match(rest, /homeIsInstanced\(\) && currentStreetTsid === HOME_INTERIOR_TSID\) return y/, 'home rooms keep their furniture tops');
    const spawn = fnText(src, 'spawnDroppedItemStack');
    assert.match(spawn, /spr\.baseY = restingStackY\(stack\.x, stack\.y\);\n\s+spr\.y = spr\.baseY;/, 'drawn at rest (shared stacks too)');
    assert.match(src, /dropWorldStack\(classTsid, count, x, y, points = undefined, tags = undefined\) \{[^}]*y = restingStackY\(x, y\);/, 'created stacks fall to the line');
    assert.match(fnText(src, 'dropPackItem'), /landingY\(streetPlatforms, x, player\.y - 20\)/, 'a player drop lands (takeable.js 166-167)');
  });

  it('no feature puts a stack in 74 px over the ground any more', () => {
    for (const rel of ['public/js/features/animal-husbandry-feature.js', 'public/js/features/elemental-pouch-feature.js', 'public/js/features/swf-feature.js', 'public/js/features/tree-death-feature.js']) {
      assert.doesNotMatch(read(rel), /dropWorldStack\??\.?\([^\n]*- 74\)/, rel);
    }
  });
});

describe('every planned Apple and Musicblock sits on a line that holds items, on every street', () => {
  const streets = [];
  before(async () => {
    setZoneStreetsShown(false);
    const index = JSON.parse(read('public/assets/streets/index.json'));
    applyStreetIndex(index);
    setStreetEcologyCatalog(JSON.parse(read('public/assets/content/street-ecology.json')));
    for (const tsid of Object.keys(index.streets).sort()) {
      try {
        streets.push(await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets')));
      } catch {
        // a street with no file is not drawn
      }
    }
  });

  it('none floats more than 2 px over its line or lies off one', () => {
    let apples = 0;
    let musicblocks = 0;
    const bad = [];
    for (const data of streets) {
      const population = populationForStreet(data.tsid, ecologyForStreet(data.tsid), { starter: data.tsid === STREET_INDEX.default });
      const platforms = platformsScreen(data);
      const plan = planStreetPlacements(platforms, placementRequests(population), { worldW: streetWidth(data), seed: data.tsid, reserved: streetReservedSpots(data) });
      // game.js spawnApples: y = p.y; spawnMusicblockDrop: y = point.y (the first point).
      const drawn = [
        ...(plan.groups.apples || []).map((p) => ['apple', p]),
        ...(plan.groups.musicblocks || []).slice(0, 1).map((p) => ['musicblock', p]),
      ];
      for (const [kind, p] of drawn) {
        if (kind === 'apple') apples += 1;
        else musicblocks += 1;
        const rest = stackRestY(platforms, p.x, p.y);
        const line = landingY(platforms, p.x, p.y);
        if (rest == null || Math.abs(rest - p.y) > 2 || line == null) bad.push(`${data.tsid} ${data.label} ${kind} at ${Math.round(p.x)},${Math.round(p.y)}: rests at ${rest == null ? 'nothing' : Math.round(rest)}`);
      }
    }
    assert.ok(streets.length > 1000, `swept ${streets.length} streets`);
    assert.ok(apples > 4000 && musicblocks > 1000, `${apples} apples, ${musicblocks} Musicblocks`);
    assert.deepEqual(bad.slice(0, 20), [], `${bad.length} loose things off their line`);
  });
});
