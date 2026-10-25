/** Fox Brushing Preserves: rules (js/foxes.js) and the feature's browser-free helpers. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FOX_BRUSHING_PACKAGE,
  FOX_ITEM_DEFS,
  FOX_LICENSE,
  FOX_RANGER_STORE,
  FOX_RANGER_TEXT,
  FOX_TEXT,
  FOX_TIMING,
  baitDropPlan,
  baitIgniteGate,
  brushFox,
  canSpawnFox,
  createFox,
  ensureFoxItems,
  foxArrival,
  foxDestination,
  foxFiberRange,
  foxRangerStoreProfile,
  normalizeFoxSlice,
  noteFoxHub,
  preserveLayout,
  rangerGateReason,
  rangerGreeting,
  splitConversation,
  stepFox,
} from '../public/js/foxes.js';
import { createToolConditionState, getToolCondition } from '../public/js/tools.js';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=catalog-unified-5';
import { getAchievementCatalog, loadContentCatalogsFromDir } from '../public/js/content-catalogs.js';
import {
  inReach,
  isPreserveRow,
  preserveEcologyEntry,
} from '../public/js/features/foxes-feature.js';
import { wildlifeFor } from '../public/js/wildlife.js';
import { createFeatureHost } from '../public/js/feature-host.js';
import { foxesFeature } from '../public/js/features/foxes-feature.js';

const ecology = JSON.parse(readFileSync(new URL('../public/assets/content/street-ecology.json', import.meta.url)));

const seq = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

function brushCtx(over = {}) {
  return {
    pc: { energy: 80, mood: 50, xp: 0, imagination: 0 },
    inv: { fox_brush: 1 },
    toolState: createToolConditionState(),
    learned: [],
    licensed: true,
    nowMs: 100000,
    lastBrushMs: null,
    fox: createFox({ x: 500, y: 300 }),
    hubId: '121',
    baitsRemaining: 2,
    rng: () => 0,
    ...over,
  };
}

describe('fox source numbers', () => {
  it('keeps the fox_brushing skill package exact', () => {
    assert.deepEqual(
      { ...FOX_BRUSHING_PACKAGE.no_skill },
      { rank: -1, successRate: 100, energyCost: 5, toolWear: 2, xpBonus: 2 }
    );
    assert.deepEqual(
      { ...FOX_BRUSHING_PACKAGE.foxbrushing_1 },
      { rank: 0, successRate: 100, energyCost: 5, toolWear: 1, xpBonus: 4 }
    );
  });

  it('yields 16-24 Fiber, 26-36 with Fox Brushing', () => {
    assert.deepEqual(foxFiberRange([]), [16, 24]);
    assert.deepEqual(foxFiberRange(['foxbrushing_1']), [26, 36]);
  });

  it('sells store 22 at catalog prices and the license at 500 with a brush and five bait', () => {
    assert.equal(FOX_RANGER_STORE.storeId, 22);
    assert.deepEqual(FOX_RANGER_STORE.items.map((r) => [r.classTsid, r.cost]), [['fox_brush', 200], ['fox_bait', 30]]);
    assert.deepEqual({ ...FOX_LICENSE }, { cost: 500, brush: 1, bait: 5 });
    const profile = foxRangerStoreProfile();
    assert.deepEqual(profile.offers.map((o) => [o.classTsid, o.buyPrice]), [['fox_brush', 200], ['fox_bait', 30]]);
  });

  it('registers the Fox Brush as a 100-point tool and Fiber as a 999 stack', () => {
    ensureFoxItems();
    assert.equal(ITEM_CATALOG.fox_brush.isTool, true);
    assert.equal(ITEM_CATALOG.fox_bait.stackMax, 100);
    assert.equal(ITEM_CATALOG.fiber.stackMax, 999);
    assert.equal(FOX_ITEM_DEFS.fox_brush.baseCost, 200);
    const cond = getToolCondition(createToolConditionState(), 'fox_brush');
    assert.equal(cond.capacity, 100);
    assert.equal(cond.tracked, true);
  });

  it('uses the server timers', () => {
    assert.equal(FOX_TIMING.runSpeed, 500);
    assert.equal(FOX_TIMING.markerPauseMs, 1000);
    assert.equal(FOX_TIMING.eatResumeMs, 2500);
    assert.equal(FOX_TIMING.spawnDelayMs, 4000);
    assert.equal(FOX_TIMING.baitDropDelayMs, 2000);
    assert.equal(FOX_TIMING.baitExpireMs, 300000);
    assert.equal(FOX_TIMING.maxBrushes, 21);
  });

  it('carries every fox badge in the achievement catalog', async () => {
    await loadContentCatalogsFromDir(new URL('../public/assets/content', import.meta.url).pathname);
    const cat = getAchievementCatalog();
    for (const id of ['fox_brushing_license', 'fleet_foxer', 'happy_foxbrusher', 'delirious_foxbrusher', 'maniacal_foxbrusher', 'cunning_like_a_foxbrusher', 'fox_tourist', 'fox_flurrier']) {
      assert.ok(cat[id], id);
    }
    assert.equal(cat.happy_foxbrusher.conditions[0].num, 1009);
    assert.equal(cat.cunning_like_a_foxbrusher.conditions[0].name, 'brushed_while_moving');
  });
});

describe('brushing a fox', () => {
  it('spends 5 energy and 2 wear, grants 2 iMG and the rolled Fiber, and emits the badge counters', () => {
    const ctx = brushCtx({ rng: seq(0.5, 0) });
    const r = brushFox(ctx);
    assert.equal(r.ok, true);
    assert.equal(r.fibers, 20); // floor(0.5 * 9) + 16
    assert.equal(ctx.pc.energy, 75);
    assert.equal(ctx.pc.xp, 2);
    assert.equal(ctx.inv.fiber, 20);
    assert.equal(getToolCondition(ctx.toolState, 'fox_brush').remaining, 98);
    assert.deepEqual(r.counters, [
      { counter: 'fox:fibers_brushed', amount: 20 },
      { counter: 'fox_hubs:brushed_in_121', amount: 1 },
      { counter: 'fox:brushed_while_moving', amount: 1 },
    ]);
    assert.ok(FOX_TEXT.brushed.includes(r.response));
  });

  it('wears 1 and grants 4 iMG with Fox Brushing', () => {
    const ctx = brushCtx({ learned: ['foxbrushing_1'], rng: () => 0.999 });
    const r = brushFox(ctx);
    assert.equal(r.fibers, 36);
    assert.equal(ctx.pc.xp, 4);
    assert.equal(getToolCondition(ctx.toolState, 'fox_brush').remaining, 99);
  });

  it('refuses without a license, too fast, worn out, or tired, spending nothing', () => {
    let ctx = brushCtx({ licensed: false });
    assert.equal(brushFox(ctx).msg, FOX_TEXT.noLicense);
    ctx = brushCtx({ lastBrushMs: 99000 });
    assert.equal(brushFox(ctx).msg, FOX_TEXT.tooFast);
    ctx = brushCtx();
    ctx.toolState.condition.fox_brush = { remaining: 1, broken: false, uses: 99, repairs: 0 };
    assert.equal(brushFox(ctx).msg, FOX_TEXT.brushWorn);
    ctx = brushCtx({ pc: { energy: 5, mood: 0, xp: 0 } });
    assert.equal(brushFox(ctx).msg, FOX_TEXT.tooTired);
    assert.equal(ctx.pc.energy, 5);
    assert.equal(ctx.inv.fiber, undefined);
    assert.equal(brushFox(brushCtx({ inv: {} })).reason, 'no_brush');
  });

  it('awards Fleet Foxer for three brushes of one fox inside ten seconds', () => {
    const fox = createFox();
    const toolState = createToolConditionState();
    const pc = { energy: 100, xp: 0 };
    const inv = { fox_brush: 1 };
    const at = (s) => brushFox({ ...brushCtx(), pc, inv, toolState, fox, nowMs: s * 1000 });
    assert.equal(at(100).fleet, false);
    assert.equal(at(103).fleet, false);
    assert.equal(at(109).fleet, true);
    assert.deepEqual(fox.brushTimes, []);
    const slow = createFox();
    const brush = (s) => brushFox({ ...brushCtx(), pc, inv, toolState, fox: slow, nowMs: s * 1000 });
    brush(200);
    brush(205);
    assert.equal(brush(211).fleet, false);
  });

  it('sends the fox away after 21 brushes or when no bait remains', () => {
    const fox = createFox();
    fox.brushCount = 20;
    const r = brushFox(brushCtx({ fox }));
    assert.equal(r.leave, true);
    assert.equal(fox.leaving, true);
    assert.equal(brushFox(brushCtx({ baitsRemaining: 0 })).leave, true);
  });

  it('only counts a moving fox for Cunning like a Foxbrusher', () => {
    const fox = createFox();
    fox.state = 'pause';
    const r = brushFox(brushCtx({ fox }));
    assert.equal(r.counters.some((c) => c.counter === 'fox:brushed_while_moving'), false);
  });
});

describe('fox movement', () => {
  const world = (over = {}) => ({
    geo: { l: 0, r: 6000 },
    baits: [{ id: 'b1', x: 3000 }],
    markers: [1200, 2200, 4200],
    rangerX: 400,
    spawnerX: 660,
    ...over,
  });

  it('heads for the nearest stop marker before the bait, never past the Ranger', () => {
    const fox = createFox({ x: 660, dir: 'right' });
    assert.deepEqual(foxDestination(fox, world()), { destX: 1200, kind: 'marker' });
    const left = createFox({ x: 1000, dir: 'left' });
    assert.deepEqual(foxDestination(left, world({ markers: [] })), { destX: 400, kind: 'ranger' });
    const toBait = createFox({ x: 2300, dir: 'right' });
    assert.deepEqual(foxDestination(toBait, world()), { destX: 3000, kind: 'bait', baitId: 'b1' });
  });

  it('leaves when no bait remains and exits 500 px past the spawner', () => {
    const fox = createFox({ x: 2000, dir: 'right' });
    assert.equal(foxDestination(fox, world({ baits: [] })).kind, 'leave');
    fox.leaving = true;
    assert.deepEqual(foxDestination(fox, world()), { destX: 160, kind: 'exit' });
  });

  it('eats bait on arrival, pauses at markers, and turns at edges', () => {
    const at = (x) => createFox({ x });
    assert.deepEqual(foxArrival(at(3050), world()), { action: 'eat', baitId: 'b1', more: false });
    assert.deepEqual(foxArrival(at(2150), world()), { action: 'pause' });
    assert.deepEqual(foxArrival(at(5900), world()), { action: 'turn' });
  });

  it('runs at 500 px/s, pauses one second at a marker, then moves on', () => {
    const fox = createFox({ x: 660, y: 300, dir: 'right' });
    fox.state = 'idle';
    stepFox(fox, 16, world(), () => 0.9);
    assert.equal(fox.destX, 1200);
    stepFox(fox, 1000, world(), () => 0.9);
    assert.equal(fox.x, 1160);
    stepFox(fox, 100, world(), () => 0.9);
    assert.equal(fox.x, 1200);
    assert.equal(fox.state, 'pause');
    stepFox(fox, 999, world(), () => 0.9);
    assert.equal(fox.state, 'pause');
    stepFox(fox, 2, world(), () => 0.9);
    assert.equal(fox.state, 'run');
    assert.equal(fox.destX, 2200);
  });

  it('eats the last bait, then leaves and despawns past the spawner', () => {
    const fox = createFox({ x: 2900, y: 0, dir: 'right' });
    fox.state = 'idle';
    const w = world({ markers: [] });
    stepFox(fox, 16, w);
    const events = stepFox(fox, 400, w);
    assert.deepEqual(events.map((e) => e.type), ['eat', 'leave']);
    w.baits = [];
    for (let i = 0; i < 200 && !fox.gone; i += 1) stepFox(fox, 100, w);
    assert.equal(fox.gone, true);
    assert.equal(fox.x, 160);
  });

  it('turns around over a gap in the floor', () => {
    const fox = createFox({ x: 1000, y: 300, dir: 'right' });
    fox.state = 'idle';
    const w = world({ markers: [], surfaceY: (x) => (x > 1100 ? null : 300) });
    stepFox(fox, 16, w);
    for (let i = 0; i < 20; i += 1) stepFox(fox, 50, w);
    assert.ok(fox.x <= 1100);
    assert.equal(fox.dir, 'left');
  });
});

describe('fox bait and spawning', () => {
  it('spawns one fox per three players (one for a solo player)', () => {
    assert.equal(canSpawnFox(0, 1), true);
    assert.equal(canSpawnFox(1, 1), false);
    assert.equal(canSpawnFox(2, 9), true);
    assert.equal(canSpawnFox(3, 9), false);
  });

  it('only ignites 600 px past the Ranger and with at most four baits nearby', () => {
    const base = { inPreserve: true, rangerX: 400, facing: 'left', placedBaitXs: [] };
    assert.equal(baitIgniteGate({ ...base, playerX: 999 }).reason, FOX_TEXT.igniteTooClose);
    assert.equal(baitIgniteGate({ ...base, playerX: 1000 }).ok, true);
    assert.equal(baitIgniteGate({ ...base, facing: 'right', rangerX: 5000, playerX: 4401 }).ok, false);
    assert.equal(baitIgniteGate({ ...base, playerX: 1200, placedBaitXs: [1000, 1100, 1200, 1300, 1400] }).reason, FOX_TEXT.igniteCrowded);
    assert.equal(baitIgniteGate({ ...base, playerX: 1200, placedBaitXs: [1000, 1100, 1200, 1300] }).ok, true);
    assert.equal(baitIgniteGate({ inPreserve: false, playerX: 0 }).reason, FOX_TEXT.igniteNotPreserve);
  });

  it('drops three baits 300 px apart starting up to 400 px behind the player', () => {
    const plan = baitDropPlan(2000, () => 0.9999);
    assert.deepEqual(plan.map((b) => b.x), [1601, 1901, 2201]);
    const near = baitDropPlan(2000, () => 0);
    assert.equal(near[0].x, 2000);
    for (const row of plan) assert.ok([1, 2, 3].includes(row.variant));
  });
});

describe('Fox Ranger', () => {
  it('walks the original greeting ladder', () => {
    const base = { conversated: false, visited: false, intro: false, licensed: false, greeted: false, hasBrush: false, hasBait: false };
    assert.equal(rangerGreeting(base).key, 'firstVisit');
    assert.equal(rangerGreeting({ ...base, visited: true }).key, 'returnNoIntro');
    assert.equal(rangerGreeting({ ...base, visited: true, intro: true }).yes, 'buy-license');
    const lic = { ...base, visited: true, intro: true, licensed: true };
    assert.equal(rangerGreeting(lic).key, 'noBrush');
    assert.equal(rangerGreeting({ ...lic, hasBrush: true }).key, 'noBait');
    assert.equal(rangerGreeting({ ...lic, hasBrush: true, hasBait: true }).key, 'greetings');
    assert.equal(rangerGreeting({ ...lic, hasBrush: true, hasBait: true, greeted: true }).kind, 'none');
  });

  it('turns back the unlicensed and the brushless', () => {
    assert.equal(rangerGateReason({ licensed: false, hasBrush: true }), FOX_RANGER_TEXT.gateNoLicense);
    assert.equal(rangerGateReason({ licensed: true, hasBrush: false }), FOX_RANGER_TEXT.gateNoBrush);
    assert.equal(rangerGateReason({ licensed: true, hasBrush: true }), '');
  });

  it('splits the source conversations into stepped beats', () => {
    const beats = splitConversation(FOX_RANGER_TEXT.intro, 'Yes, I am!');
    assert.equal(beats.length, 4);
    assert.deepEqual(beats.map((b) => b.response), ['Uh huh', 'Of course', 'Sounds easy', 'Yes, I am!']);
    assert.match(beats[1].text, /regulation Fox Brushes/);
    assert.doesNotMatch(beats[1].text, /</);
    assert.equal(splitConversation(FOX_RANGER_TEXT.enter, 'Yay!').length, 5);
    assert.equal(splitConversation(FOX_RANGER_TEXT.tips).length, 4);
  });
});

describe('preserve population', () => {
  it('counts the archived wildlife exactly: 51 rangers, 278 stop markers, 93 Heli Kitties', () => {
    let rangers = 0;
    let markers = 0;
    let kitties = 0;
    for (const row of Object.values(ecology.wildlife)) {
      rangers += row.npc_fox_ranger || 0;
      markers += row.fox_stop_marker || 0;
      kitties += row.npc_kitty_chicken || 0;
    }
    assert.deepEqual([rangers, markers, kitties], [51, 278, 93]);
  });

  it('finds Gyerean Park by either alias and strips its fox spawner from roaming animals', () => {
    const row = wildlifeFor(ecology, 'GA53N05IG9S2BLR');
    assert.deepEqual(row, wildlifeFor(ecology, 'LA53N05IG9S2BLR'));
    assert.equal(isPreserveRow(row), true);
    assert.equal(row.fox_stop_marker, 6);
    const entry = ecology.streets.GA53N05IG9S2BLR;
    assert.equal(entry.spawners, 1);
    assert.equal(preserveEcologyEntry(entry, row).spawners, undefined);
    assert.equal(preserveEcologyEntry(entry, { npc_kitty_chicken: 3 }), null);
  });

  it('spans the ten regions Fox Tourist asks for', () => {
    const index = JSON.parse(readFileSync(new URL('../public/assets/streets/index.json', import.meta.url)));
    const hubs = new Set();
    for (const [tsid, row] of Object.entries(ecology.wildlife)) {
      if (row.npc_fox_ranger) hubs.add(index.streets[tsid]?.hubId);
    }
    assert.equal(hubs.size, 10);
  });

  it('lays a preserve out from its entrance: Ranger facing the entrance, markers inside', () => {
    const left = preserveLayout({ worldW: 6000, entranceX: 178, markerCount: 6, seed: 3 });
    assert.equal(left.facing, 'left');
    assert.equal(left.rangerX, 538);
    assert.ok(left.spawnerX > left.rangerX);
    assert.equal(left.markers.length, 6);
    assert.ok(left.markers.every((x) => x > left.rangerX + 600 && x < 5900));
    const right = preserveLayout({ worldW: 6000, entranceX: 5800, markerCount: 4 });
    assert.equal(right.facing, 'right');
    assert.ok(right.markers.every((x) => x < right.rangerX));
  });

  it('counts each region once toward Fox Tourist', () => {
    const slice = normalizeFoxSlice({ hubsBrushed: ['121', '121', 'bad'] });
    assert.deepEqual(slice.hubsBrushed, ['121']);
    assert.equal(noteFoxHub(slice, '121').added, false);
    for (const hub of ['123', '75', '92', '97', '98', '76', '109', '120']) noteFoxHub(slice, hub);
    assert.equal(noteFoxHub(slice, '93').tourist, true);
  });

  it('only brushes foxes in reach', () => {
    assert.equal(inReach({ x: 100, y: 300 }, { x: 390, y: 300 }), true);
    assert.equal(inReach({ x: 100, y: 300 }, { x: 420, y: 300 }), false);
  });
});

describe('fox feature registers cleanly', () => {
  it('offers Ignite only on Fox Bait and saves a normalized slice', () => {
    const host = createFeatureHost([foxesFeature]);
    assert.equal(host.get('foxes'), foxesFeature);
    assert.deepEqual(host.packVerbs('apple', {}), []);
    const saved = host.save();
    assert.deepEqual(Object.keys(saved), ['foxes']);
    host.restore({ foxes: { visited: true, intro: 'yes', hubsBrushed: ['121'] } }, {});
    assert.deepEqual(foxesFeature.save(), { visited: true, intro: false, hubsBrushed: ['121'], totalFibers: 0, totalBrushes: 0 });
  });
});
