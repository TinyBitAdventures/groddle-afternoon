/**
 * G1138: after the house change (G796) an unmoved Mailbox stood on a saved herb garden. Its usual
 * spot is just off the house art's left corner (home-house.js houseLot `sign`), so it moved with
 * the new chassis, and an unmoved Mailbox skipped the clear-of-gardens check. Glitch's Mailbox came
 * from the street template (locations/inc_upgrades.js 344) and never moved with the house, so it
 * never landed on a garden. Now an unmoved Mailbox steps aside like a moved one: on every house
 * chassis, wherever saved gardens lie, it stands clear of them.
 * Run: node --test tests/g1138-mailbox-gardens.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fixtureObstacles,
  fixtureRx,
  footprint,
  homeStreetLayout,
  normalizeCultivationState,
} from '../public/js/home-cultivation.js?v=122d6f45';
import { MOVABLE_FIXTURES, fixtureFits } from '../public/js/home-street-fixtures.js?v=d4e5b56a';
import { HOUSE_STYLE_KEYS, houseDoorway, houseFixtureX } from '../public/js/features/homes-feature.js?v=f4bffb8d';

const atFor = (layout, style) => {
  const house = houseFixtureX(layout, style);
  return { mailboxX: Math.round(house.signX), doorX: house.doorX, doorway: houseDoorway(layout, style) };
};
const MAIL_HALF = MOVABLE_FIXTURES.mailbox.half;
const GARDENS = ['proto_herb_garden_small', 'proto_herb_garden_medium', 'proto_crop_garden_large'];

/** A saved street (the gardens set down under an older house, never re-checked). */
function savedStreet(items) {
  return normalizeCultivationState({
    yardLeft: 2,
    yardRight: 2,
    items: items.map((row, i) => ({ id: i + 1, protoClass: row.protoClass, endClass: row.protoClass, rx: row.rx })),
  });
}

function assertClear(st, at, label) {
  const layout = homeStreetLayout(st);
  const x = layout.houseX + fixtureRx(st, 'mailbox', { at });
  for (const row of st.items) {
    const gap = Math.abs(x - (layout.houseX + row.rx));
    assert.ok(gap >= footprint(row.protoClass) + MAIL_HALF, `${label}: the Mailbox at ${x} stands on the ${row.protoClass} at ${layout.houseX + row.rx}`);
  }
  assert.equal(fixtureFits(layout, 'mailbox', x, fixtureObstacles(st, 'mailbox', { at })).ok, true, `${label}: stands somewhere clear`);
}

describe('G1138: an unmoved Mailbox never lands on a saved garden', () => {
  it('every house chassis, a garden saved anywhere around the Mailbox\'s usual spot', () => {
    for (const style of HOUSE_STYLE_KEYS) {
      for (const protoClass of GARDENS) {
        const probe = savedStreet([]);
        const layout = homeStreetLayout(probe);
        const at = atFor(layout, style);
        const usualRx = at.mailboxX - layout.houseX;
        const reach = footprint(protoClass) + MAIL_HALF;
        for (let d = -reach; d <= reach; d += 15) {
          assertClear(savedStreet([{ protoClass, rx: usualRx + d }]), at, `${style} ${protoClass} ${d}`);
        }
      }
    }
  });

  it('every house chassis, a row of saved herb gardens along the yard left of the house', () => {
    for (const style of HOUSE_STYLE_KEYS) {
      const probe = savedStreet([]);
      const layout = homeStreetLayout(probe);
      const at = atFor(layout, style);
      const half = footprint('proto_herb_garden_small');
      const items = [];
      // Side by side from the yard's left edge up to just past the Mailbox's usual spot.
      for (let rx = layout.minRx + half; rx <= at.mailboxX - layout.houseX + half; rx += 2 * half + 4) {
        items.push({ protoClass: 'proto_herb_garden_small', rx });
      }
      assert.ok(items.length > 1);
      assertClear(savedStreet(items), at, style);
    }
  });

  it('with nothing in the way it keeps its usual spot', () => {
    for (const style of HOUSE_STYLE_KEYS) {
      const st = savedStreet([]);
      const layout = homeStreetLayout(st);
      const at = atFor(layout, style);
      assert.equal(layout.houseX + fixtureRx(st, 'mailbox', { at }), at.mailboxX, style);
    }
  });
});
