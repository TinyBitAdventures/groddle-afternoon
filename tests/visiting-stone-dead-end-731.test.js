/**
 * #731 (G1330, R2): East Spice's (GM413SQ6LRN58) Visiting Stone stood at x 4301 of 6000. Glitch had it
 * at the far end, about x 5900 (the 2012 "East Spice - Full Street" snap), in the dead end where
 * Visiting Stones "can typically be found" (visiting_stone.js 202). The planner put it there (x 5692,
 * street-furniture.js stoneDeadEndZone), then reseatHiddenNodes (street-ecology.js) moved it out from
 * behind the two front gear trees' boxes. Austin's rulings: a stone stays in its dead end (#731), and it
 * never stands where a tree hides it (#574). So when the art's boxes cover the whole dead end, the
 * stone takes the spot there the art's drawn pixels leave seen (frontArtShare, STONE_SEEN_SHARE):
 * East Spice's stood behind thin branches in the 2012 snap. Four more planned stones had been moved
 * out of their dead ends the same way.
 *
 * Run: node --test tests/visiting-stone-dead-end-731.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=23555e53';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  FRONT_BOXES,
  STONE_SEEN_SHARE,
  ecologyForStreet,
  frontArtShare,
  frontDecoCovers,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=36fd044b';
import { FURNITURE_GROUPS, stoneDeadEndZone } from '../public/js/street-furniture.js?v=071203fc';
import { creatureRequests, setCreatureEcology } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8'));
setStreetEcologyCatalog(catalog);
setCreatureEcology(catalog);
setZoneStreetsShown(false);
applyStreetIndex(index);

const STONE = FURNITURE_GROUPS.visiting_stone.key;

async function stoneOf(tsid) {
  const data = await loadStreetDataFromFs(tsid, streetsDir);
  const pop = populationForStreet(tsid, ecologyForStreet(tsid), { starter: tsid === index.default });
  const plan = planStreetPlacements(platformsScreen(data), creatureRequests(pop, data, catalog), {
    worldW: streetWidth(data),
    seed: tsid,
    reserved: streetReservedSpots(data),
  });
  return { data, stone: plan.groups[STONE]?.[0], zone: stoneDeadEndZone(data), plan };
}

const seenShare = (data, stone) => frontArtShare(stone, ...FRONT_BOXES[STONE], frontDecoCovers(data));

describe('#731 a Visiting Stone stays in its dead end behind the front art', () => {
  it('the front art masks are current (tools/build-stone-front-masks.mjs --check)', () => {
    execFileSync(process.execPath, [join(root, 'tools/build-stone-front-masks.mjs'), '--check'], { stdio: 'pipe' });
  });

  it("East Spice's stone stands at the far end, where Glitch had it, and is mostly seen", async () => {
    const { data, stone, zone } = await stoneOf('GM413SQ6LRN58');
    assert.equal(streetWidth(data), 6000);
    assert.deepEqual(zone, { lo: 5200, hi: 6000 });
    assert.ok(stone.x >= zone.lo && stone.x <= zone.hi, `stone at x ${Math.round(stone.x)} of 6000 (Glitch: about 5900)`);
    // The planner's own spot there (5692) is behind a gear tree's trunk.
    assert.ok(frontArtShare({ x: 5692, y: 1696 }, ...FRONT_BOXES[STONE], frontDecoCovers(data)) >= STONE_SEEN_SHARE);
    const share = seenShare(data, stone);
    assert.ok(share < STONE_SEEN_SHARE, `${Math.round(share * 100)}% of the stone behind the front art`);
  });

  it('the five stones moved out from behind the front art are back in their dead ends, where the art leaves them seen', async () => {
    // Was: Patchouli Preamble 1083 px out, East Spice 899, Chuff Chase 1 754, Konka Brink 231, Puckell Peck 191.
    for (const tsid of ['GA9Q4AL8DI82H2M', 'GM413SQ6LRN58', 'GA5138OK0J526HB', 'GIF1GTHPO9V14NG', 'GIF2I10MEOE2CRA']) {
      const { data, stone, zone } = await stoneOf(tsid);
      assert.ok(zone, `${data.label}: has a dead end`);
      assert.ok(stone.x >= zone.lo && stone.x <= zone.hi, `${data.label}: stone at ${Math.round(stone.x)}, dead end ${zone.lo}-${zone.hi}`);
      const share = seenShare(data, stone);
      assert.ok(share < STONE_SEEN_SHARE, `${data.label}: ${Math.round(share * 100)}% of the stone behind the front art`);
    }
  });

  it('a deco is measured by its drawn art: bare branches leave a spot seen, a trunk hides it', () => {
    const tree = { x: 500, y: 1000, key: 'front:t:0', front: true, block: { l: 300, r: 700, t: 600, b: 1000 }, art: { sprite: 'test_tree', w: 400, h: 400, r: 0, flip: false } };
    // A 4 x 4 mask: the trunk is the second column, the rest bare.
    const mask = { w: 4, h: 4, d: Buffer.from([0b01000100, 0b01000100]).toString('base64') };
    const box = FRONT_BOXES[STONE];
    assert.ok(frontArtShare({ x: 450, y: 1000 }, ...box, [tree], { test_tree: mask }) > 0.9, 'on the trunk');
    assert.equal(frontArtShare({ x: 620, y: 1000 }, ...box, [tree], { test_tree: mask }), 0, 'by the branches');
    // Unmeasured: the box counts; no art: nothing.
    assert.equal(frontArtShare({ x: 620, y: 1000 }, ...box, [tree], {}), 1);
    assert.equal(frontArtShare({ x: 620, y: 1000 }, ...box, [tree], { test_tree: null }), 0);
  });
});
