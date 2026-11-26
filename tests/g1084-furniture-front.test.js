/**
 * G1084, #574 (R2): Puckell Peck's (GIF2I10MEOE2CRA) Visiting Stone stood behind the trunk of a
 * front conifer (middleplus heights_coniferous_4, 755 x 1342 at x 5642). Street furniture only stepped
 * off planned trees (street-furniture.js treeObstacles); the front-art check (street-ecology.js
 * hiddenBehindFront, G1007) never reached it. Planned stones, mailboxes and boards now have their art's
 * box in FRONT_BOXES and move off the front art after the plan (reseatHiddenNodes,
 * FURNITURE_FRONT_KEYS); the stones and mailboxes the 2012 snaps show stay where they are.
 *
 * Run: node --test tests/g1084-furniture-front.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyStreetIndex, loadStreetDataFromFs, setZoneStreetsShown } from '../public/js/street-loader.js?v=10376267';
import { platformsScreen, streetWidth } from '../public/js/street-model.js?v=a9a05f9d';
import {
  FRONT_BOXES,
  FRONT_HIDE_SHARE,
  ecologyForStreet,
  frontCoverShare,
  frontDecoCovers,
  planStreetPlacements,
  populationForStreet,
  setStreetEcologyCatalog,
  streetReservedSpots,
} from '../public/js/street-ecology.js?v=f1c11a2d';
import { FURNITURE_GROUPS, measuredStones } from '../public/js/street-furniture.js?v=071203fc';
import { creatureRequests, setCreatureEcology } from '../tools/build-realtime-objects.mjs';
import { census } from '../tools/furniture-front-census.mjs';

const root = join(import.meta.dirname, '..');
const streetsDir = join(root, 'public/assets/streets');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8'));
setZoneStreetsShown(false);
applyStreetIndex(JSON.parse(readFileSync(join(streetsDir, 'index.json'), 'utf8')));
setStreetEcologyCatalog(catalog);
setCreatureEcology(catalog);

const PUCKELL_PECK = 'GIF2I10MEOE2CRA';
// The stone as the canopy check sees it (street-ecology.js UNDER_CANOPY_HEIGHTS.furnitureStone).
const STONE_BOX = [81, 124];

function planOf(data) {
  const pop = populationForStreet(data.tsid, ecologyForStreet(data.tsid), {});
  return planStreetPlacements(platformsScreen(data), creatureRequests(pop, data, catalog), {
    worldW: streetWidth(data),
    seed: data.tsid,
    reserved: streetReservedSpots(data),
  });
}

describe('G1084 planned street furniture stays out from behind the front art', () => {
  it('the front check knows each piece of furniture by its own art', () => {
    assert.deepEqual(FRONT_BOXES[FURNITURE_GROUPS.visiting_stone.key], STONE_BOX);
    for (const cls of ['npc_mailbox', 'bag_notice_board']) assert.ok(FRONT_BOXES[FURNITURE_GROUPS[cls].key]?.[1] > 100, cls);
  });

  it("Puckell Peck's Visiting Stone stands clear of the front conifer and of Rock 1, by its dead end", async () => {
    const data = await loadStreetDataFromFs(PUCKELL_PECK, streetsDir);
    const fronts = frontDecoCovers(data);
    assert.equal(measuredStones(PUCKELL_PECK), null, 'no snap of this stone: it is planned');
    // Before: the planner's spot, every bit of the stone inside the conifer's box.
    assert.ok(frontCoverShare({ x: 5688, y: 796 }, ...STONE_BOX, fronts) >= FRONT_HIDE_SHARE);
    const [stone] = planOf(data).groups[FURNITURE_GROUPS.visiting_stone.key];
    assert.ok(frontCoverShare(stone, ...STONE_BOX, fronts) < FRONT_HIDE_SHARE, `${Math.round(stone.x)},${Math.round(stone.y)}`);
    // R43 (#680): the rest of its dead end (5200-6000) is under Rock 1 (5090-5220 as drawn), so it
    // stands on the nearest clear floor before it, clear of the rock's art.
    assert.ok(stone.x >= 4800 && stone.x + STONE_BOX[0] / 2 <= 5090, `${Math.round(stone.x)}: by the dead end (G853), off Rock 1`);
  });

  it('no planned stone, mailbox or board on any street is mostly behind front art (was 19 stones, 7 mailboxes)', async () => {
    const before = await census({ reseat: false });
    assert.ok((before.hidden.visiting_stone || 0) >= 15, JSON.stringify(before.hidden));
    const c = await census();
    assert.deepEqual(c.hidden, {}, c.rows.filter((r) => r[2] !== 'moved').map((r) => r.join(' ')).join('\n'));
    // Snapped stones are fixed and never planned: 96 of the 199 are planned (G853).
    assert.equal(c.planned.visiting_stone, 96);
    assert.ok(c.planned.npc_mailbox > 80 && c.planned.bag_notice_board > 0);
  });
});
