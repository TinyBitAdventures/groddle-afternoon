/**
 * G1061 (#555's class, root R2): planned Street Spirits, shrines and mailboxes stood in trees'
 * crowns (eight on the shared streets: Senna Karup's and Mossystep's vendor, six mailboxes such as
 * Lotha Harte's on a ledge up a tree). Glitch set them down by hand from the street XML, never in a
 * tree; the remake plans them where the archive has no position, and now they keep out of a planned
 * tree's canopy by their art (street-ecology.js UNDER_CANOPY_HEIGHTS / UNDER_CANOPY_WIDTHS), the rule
 * the resource nodes, the Visiting Stone and the Race Ticket Dispenser follow (#256, #555).
 *
 * tools/canopy-placements.mjs lays out every shared street (and each street upgrade) as game.js does
 * and lists the planned ones still drawn in a crown: none may be. Mossystep's vendor had no clear spot
 * but one floor steeper than the planner allows; Austin's ruling (2026-11-20) allows that one spot
 * (street-ecology.js SLOPE_RULINGS), pinned below.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BIG_THING_MAX_SLOPE,
  PLACEMENT_FOOTPRINTS,
  PLACEMENT_HEIGHTS,
  SLOPE_RULINGS,
  UNDER_CANOPY_HEIGHTS,
  UNDER_CANOPY_WIDTHS,
  slopeRuled,
} from '../public/js/street-ecology.js?v=dde3c62d';
import { groundAt } from '../public/js/street-arrival.js?v=6c405286';
import { CROWN_KINDS, crownOverlaps, crownOverlapsInPlan, streetPlans } from '../tools/canopy-placements.mjs';

const MOSSYSTEP = 'GCR15ST40FM1M1I';

describe('G1061: planned vendors, shrines and mailboxes keep out of trees', () => {
  it('each keeps out of a canopy by its own art', () => {
    for (const [key, box] of Object.entries(CROWN_KINDS)) {
      assert.equal(UNDER_CANOPY_HEIGHTS[key], box.h, `${key} height`);
      assert.equal(UNDER_CANOPY_WIDTHS[key] || PLACEMENT_FOOTPRINTS[key], box.w, `${key} width`);
    }
    assert.equal(CROWN_KINDS.vendor.h, PLACEMENT_HEIGHTS.vendor);
    assert.equal(CROWN_KINDS.shrine.h, PLACEMENT_HEIGHTS.shrine);
  });

  it('on every shared street, none is drawn in a crown', () => {
    const { overlaps, planned } = crownOverlaps();
    assert.ok(planned.vendor > 800 && planned.shrine > 500 && planned.furnitureMailbox > 80, JSON.stringify(planned));
    const hits = overlaps.map((o) => `${o.label} (${o.tsid}${o.upgrade ? `, upgrade ${o.upgrade}` : ''}): ${o.key} ${o.index} at ${o.x},${o.y} in tree ${o.tree} at ${o.tx},${o.ty}`);
    assert.deepEqual(hits, []);
  });

  it('Mossystep\'s vendor stands on the ground at its ruled slope spot, clear of the Bean Trees', () => {
    // The one ruling: this street, the vendor, one spot.
    assert.deepEqual(Object.keys(SLOPE_RULINGS), [MOSSYSTEP]);
    assert.deepEqual(Object.keys(SLOPE_RULINGS[MOSSYSTEP]), ['vendor']);
    assert.equal(SLOPE_RULINGS[MOSSYSTEP].vendor.length, 1);
    const spot = { x: 704, y: 810.75, slope: 0.316 };
    assert.ok(spot.slope > BIG_THING_MAX_SLOPE);
    assert.ok(slopeRuled(MOSSYSTEP, 'vendor', spot));
    assert.ok(!slopeRuled(MOSSYSTEP, 'shrine', spot), 'only the vendor');
    assert.ok(!slopeRuled('GCR15ST40FM1M1X', 'vendor', spot), 'only Mossystep');
    assert.ok(!slopeRuled(MOSSYSTEP, 'vendor', { ...spot, x: 760 }), 'only that spot');
    assert.ok(!slopeRuled(MOSSYSTEP, 'vendor', { ...spot, slope: 0.4 }), 'no steeper floor');

    const street = streetPlans(MOSSYSTEP);
    for (const { upgrade, plan } of street.plans) {
      const [vendor] = plan.groups.vendor;
      assert.equal(plan.groups.vendor.length, 1, `upgrade ${upgrade}`);
      assert.equal(Math.round(vendor.x), 704, `upgrade ${upgrade}`);
      assert.equal(Math.round(vendor.y), 811, `upgrade ${upgrade}`);
      // On the street's reached ground there, not a ledge above it or over air.
      assert.ok(Math.abs(groundAt(street.platforms, vendor.x, { tsid: MOSSYSTEP }) - vendor.y) < 1, `upgrade ${upgrade}`);
      assert.deepEqual(crownOverlapsInPlan(plan).filter((o) => o.key === 'vendor'), []);
      assert.ok(!plan.blocked.some((b) => b.key === 'vendor'), 'covers nothing');
      assert.ok(!plan.steep.some((s) => s.key === 'vendor'), 'the ruled slope is not listed as steep');
    }
  });
});
