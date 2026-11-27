/**
 * #725 (G1323): Ice Nubbins in Nottis stood on the path. In Glitch they were set by hand on the icy
 * walls (ice_knob.js obey_physics false), in clusters, some high enough to jump for (the reporter's
 * 2012 snap of Joklin Seddin; 19 measured on five streets' pictures,
 * assets/content/ice-nubbin-picture-spots.json). The location files only count them (144 on 17
 * streets), so the planner stood every one on a floor. Now each takes its picture's spot, else a
 * spot on a snow skirt by js/ice-nubbin-walls.js, and every one is in reach: standing, or with a
 * plain jump for the Enter key (the client's touch rule), and within the scrape's 300 px click range.
 * The layout checked is the shared one (tools/build-realtime-objects.mjs streetObjectLayout: what the
 * realtime server's data/objects.json holds and what a page plans, tests/client-server-placement).
 * Run: node --test tests/g1323-ice-nubbin-walls.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformsScreen, isStandable } from '../public/js/street-model.js?v=a9a05f9d';
import { avatarHitBox, boxesTouch } from '../public/js/reach.js?v=456da8a8';
import { jumpApex } from '../public/js/avatar-step.js?v=8415ee96';
import { DEFAULT_VERB_RANGE, verbRange } from '../public/js/walk-over.js?v=277ab977';
import { ecologyForStreet, populationForStreet, setStreetEcologyCatalog } from '../public/js/street-ecology.js?v=f6185033';
import { resourcePlacementGroups, resourceSpawnPlan } from '../public/js/features/resource-nodes-feature.js?v=f8383888';
import { getResourceNodeDef } from '../public/js/resource-nodes.js?v=c2eb46b1';
import { ICE_REACH_MAX, STAND_TOUCH, iceNubbinReach, iceWallUnder } from '../public/js/ice-nubbin-walls.js?v=f541620c';
import { ICE_NUBBIN_SPOTS } from '../public/js/ice-nubbin-spots-data.js?v=9a2eedc4';
import { streetObjectLayout } from '../tools/build-realtime-objects.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const ecology = read('public/assets/content/street-ecology.json');
const index = read('public/assets/streets/index.json').streets;
const masks = read('tools/ice-nubbin-wall-masks.json').masks;
const pictures = read('public/assets/content/ice-nubbin-picture-spots.json').streets;
setStreetEcologyCatalog(ecology);

const NOTTIS = Object.entries(ecology.streets)
  .filter(([tsid, row]) => row?.counts?.ice_knob > 0 && index[tsid]?.hubId === '137')
  .map(([tsid, row]) => ({ tsid, count: row.counts.ice_knob, street: read(`public/${index[tsid].file}`) }));

/** The art's box (the frame cell, its bottom centre on the spot). */
function artBox(x, y, variant) {
  const sheet = getResourceNodeDef('ice_knob').sprite.sheets[variant];
  return { left: x - sheet.frameWidth / 2, right: x + sheet.frameWidth / 2, top: y - sheet.frameHeight, bottom: y };
}

/** Each street's Ice Nubbins as the shared layout has them: { key, x, y } (the node's spot, data/objects.json less its 2 px). */
const layouts = new Map(NOTTIS.map(({ tsid, street }) => [tsid, streetObjectLayout(street).nodes
  .filter(([, cls]) => cls === 'ice_knob')
  .map(([key, , x, y]) => ({ key, x, y: y - 2 }))]));

describe('#725 Ice Nubbins on Nottis\'s icy walls, not on the path', () => {
  it('17 streets, 144 nubbins, every one the file names', () => {
    assert.equal(NOTTIS.length, 17);
    assert.equal(NOTTIS.reduce((n, s) => n + s.count, 0), 144);
    for (const { tsid, count } of NOTTIS) assert.equal(layouts.get(tsid).length, count, tsid);
  });

  it('none stands on a floor: each hangs 30 px or more over the floor in front, with nothing between', () => {
    const onPath = [];
    for (const { tsid, street } of NOTTIS) {
      for (const n of layouts.get(tsid)) {
        const r = iceNubbinReach(street, n.x, n.y);
        if (!r || r.lift < 30 || r.between) onPath.push(`${street.label} ${n.key} ${Math.round(n.x)},${Math.round(n.y)} lift ${r?.lift}`);
      }
    }
    assert.deepEqual(onPath, []);
  });

  it('every one the rule places sits on a snow skirt\'s drawn art with nothing drawn over it', () => {
    const off = [];
    for (const { tsid, street } of NOTTIS) {
      for (const [x, y, , tier] of ICE_NUBBIN_SPOTS[tsid]) {
        if (tier === 0) continue; // measured on a picture: where Glitch had it
        const wall = iceWallUnder(street, x, y, masks);
        if (!wall || wall.tier !== 1) off.push(`${street.label} ${x},${y}`);
      }
    }
    assert.deepEqual(off, []);
  });

  it('every one is in reach: standing or with a plain jump (Enter touches it), and within the scrape\'s click range', () => {
    const apex = jumpApex(1);
    assert.ok(ICE_REACH_MAX <= STAND_TOUCH + apex, 'the highest allowed is touched at the top of a plain jump');
    assert.equal(verbRange('ice_knob', 'scrape'), DEFAULT_VERB_RANGE);
    let high = 0;
    let total = 0;
    const bad = [];
    for (const { tsid, street } of NOTTIS) {
      const variants = new Map(resourceSpawnPlan(populationForStreet(tsid, ecologyForStreet(tsid)), () => []).map((r) => [r.key, r.variant]));
      for (const n of layouts.get(tsid)) {
        total += 1;
        const r = iceNubbinReach(street, n.x, n.y);
        const box = artBox(n.x, n.y, variants.get(n.key));
        const standing = avatarHitBox(n.x, r.floorY);
        const jumping = avatarHitBox(n.x, r.floorY - apex);
        if (!r.reachable) bad.push(`${street.label} ${n.key}: floor not reached or ${r.lift} px up`);
        else if (!boxesTouch(jumping, box) && !boxesTouch(standing, box)) bad.push(`${street.label} ${n.key}: not touched even at a jump's top (${r.lift} px up)`);
        else if (r.floorY - box.bottom > DEFAULT_VERB_RANGE) bad.push(`${street.label} ${n.key}: past the click range`);
        if (!boxesTouch(standing, box)) high += 1;
      }
    }
    assert.deepEqual(bad, []);
    // A few high enough to jump for (the pictures: 7 of 19), most within reach as you stand.
    assert.ok(high >= total * 0.2 && high <= total * 0.4, `${high} of ${total} need a jump`);
  });

  it('in clusters: most have another within 160 px across', () => {
    let near = 0;
    let total = 0;
    for (const { tsid } of NOTTIS) {
      const spots = layouts.get(tsid);
      for (const a of spots) {
        total += 1;
        if (spots.some((b) => b !== a && Math.abs(b.x - a.x) <= 160)) near += 1;
      }
    }
    assert.ok(near >= total * 0.8, `${near} of ${total} in a cluster`);
  });

  it('wall-drawn, keyed left to right, the pictures\' spots kept, none planned', () => {
    for (const { tsid, count } of NOTTIS) {
      const pop = populationForStreet(tsid, ecologyForStreet(tsid));
      assert.ok(!resourcePlacementGroups(pop).some((g) => g.key === 'resource:ice_knob'), tsid);
      const plan = resourceSpawnPlan(pop, () => []).filter((r) => r.classTsid === 'ice_knob');
      assert.deepEqual(plan.map((r) => r.key), Array.from({ length: count }, (_, i) => `ice_knob:${i}`));
      assert.ok(plan.every((r) => r.wall === true && /^knob[1-4]$/.test(r.variant)), tsid);
      assert.deepEqual(plan.map((r) => r.x), [...plan.map((r) => r.x)].sort((a, b) => a - b));
      for (const [x, y] of pictures[tsid]?.spots || []) assert.ok(plan.some((r) => r.x === x && r.y === y), `${tsid} ${x},${y}`);
    }
  });

  it('Joklin Seddin (the report\'s snap): its three on the skirt over the path, as the snap shows', () => {
    const street = NOTTIS.find((s) => s.tsid === 'GHVDH0710RA3812').street;
    for (const [x, y] of pictures.GHVDH0710RA3812.spots) {
      const r = iceNubbinReach(street, x, y);
      assert.ok(r.lift >= 45 && r.lift <= 120, `${x},${y} ${r.lift}`);
      assert.ok(layouts.get('GHVDH0710RA3812').some((n) => n.x === x && n.y === y));
    }
    // The path under them is a floor a Glitch walks.
    const plats = platformsScreen(street).filter(isStandable);
    assert.ok(plats.length > 0);
  });

  it('the spots data is current', () => {
    execFileSync(process.execPath, [join(root, 'tools/build-ice-nubbin-spots.mjs'), '--check'], { stdio: 'pipe' });
  });
});
