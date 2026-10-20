/**
 * The Rube: spawn odds, offers, trades, the lure, and the catalog build.
 * Run: node --test tests/rube.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RUBE_TEXT,
  createRubeState,
  createRubeVisit,
  imbibeCheck,
  imbibeRubeweed,
  makeRubeOffer,
  rollRubeDay,
  rubeAccept,
  rubeEntryCheck,
  rubeMinBaseCost,
  rubeOfferText,
  rubeRedo,
  rubeSpawnChance,
  rubeTalk,
  streetCanHostRube,
  tradeablePack,
} from '../public/js/rube.js';
import { remakeStatus } from '../public/js/imagination-remake.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const CATALOG = JSON.parse(readFileSync(join(root, 'assets/content/rube-catalog.json'), 'utf8')).items;
const HOUR = 3600_000;

function lcg(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe('rube catalog', () => {
  it('holds only source-tradeable items (base cost, no no_rube) and marks art', () => {
    assert.ok(Object.keys(CATALOG).length > 300);
    assert.equal(CATALOG.essence_of_rubeweed, undefined, 'no_rube');
    assert.equal(CATALOG.icon_alph, undefined, 'icons are no_rube');
    assert.equal(CATALOG.pick.baseCost, 500);
    assert.equal(CATALOG.cherry.plural, 'Cherries');
    assert.equal(CATALOG.cubimal_package.special, true);
    for (const [id, row] of Object.entries(CATALOG)) {
      if (row.art) assert.ok(existsSync(join(root, 'assets/sprites/icons', `${id}.png`)), id);
    }
  });
});

describe('rube spawning', () => {
  it('0.5% a visit, x2 rubeweed, x2 after 10 game days, Rube Radar 1%', () => {
    const now = 100 * 4 * HOUR;
    assert.equal(rubeSpawnChance({ lastTrade: now - HOUR * 2, now }), 0.005);
    assert.equal(rubeSpawnChance({ rubeweed: true, lastTrade: now - HOUR * 2, now }), 0.01);
    assert.equal(rubeSpawnChance({ lastTrade: now - 40 * HOUR, now }), 0.01);
    assert.equal(rubeSpawnChance({ rubeweed: true, lastTrade: 0, now }), 0.02);
    assert.equal(rubeSpawnChance({ lastTrade: now - HOUR * 2, now, upgrades: ['rube_chance_to_meet'] }), 0.01);
    assert.equal(rubeSpawnChance({ rubeweed: true, lastTrade: 0, now, upgrades: ['rube_chance_to_meet'] }), 0.02, 'radar only raises below 1%');
  });

  it('respects banned hubs, daily trades, the hour cooldown, and a tradeable pack', () => {
    assert.equal(streetCanHostRube({ hubId: '96' }), false);
    assert.equal(streetCanHostRube({ instance: true }), false);
    assert.equal(streetCanHostRube({ hubId: '58' }), true);
    const state = createRubeState();
    const ctx = { street: { hubId: '58' }, inv: { cherry: 3 }, catalog: CATALOG, now: 10 * HOUR };
    assert.equal(rubeEntryCheck(state, ctx, () => 0).spawn, true);
    assert.equal(rubeEntryCheck(state, ctx, () => 0.006).reason, 'roll');
    assert.equal(rubeEntryCheck(state, { ...ctx, inv: { icon_alph: 1 } }, () => 0).reason, 'pack');
    state.lastTrade = ctx.now - HOUR / 2;
    assert.equal(rubeEntryCheck(state, ctx, () => 0).reason, 'cooldown');
    state.lastTrade = 0;
    state.tradesToday = 2;
    assert.equal(rubeEntryCheck(state, ctx, () => 0).reason, 'trades');
    assert.equal(rubeEntryCheck(state, { ...ctx, lure: true }, () => 0.9).spawn, true);
    rollRubeDay(state, 'next');
    assert.equal(state.tradesToday, 0);
  });
});

describe('rube offers', () => {
  it('level floor 1/10/20/30/50/100, Rube\'s Favorite adds 10 levels', () => {
    assert.deepEqual([5, 15, 25, 35, 45, 55].map((l) => rubeMinBaseCost(l)), [1, 10, 20, 30, 50, 100]);
    assert.equal(rubeMinBaseCost(5, ['rube_better_items']), 10);
  });

  it('pairs a pricier gift with a pack item worth 1/6 to 1/2 of it', () => {
    const inv = { cherry: 20, plank: 10, meat: 5, hatchet: 1 };
    for (let seed = 1; seed < 40; seed += 1) {
      const visit = createRubeVisit();
      const ok = makeRubeOffer(visit, { inv, catalog: CATALOG, level: 12 }, lcg(seed));
      if (!ok) continue;
      const give = CATALOG[visit.offerGive];
      const take = CATALOG[visit.offerReceive];
      assert.ok(inv[visit.offerReceive] > 0);
      assert.ok(give.art);
      assert.ok(give.baseCost > 10 || take.baseCost <= give.baseCost, `${visit.offerGive} ${give.baseCost}`);
      assert.ok(take.baseCost <= give.baseCost);
      assert.ok(take.baseCost < 2500);
    }
  });

  it('five offers at most, with the source patience notes', () => {
    const inv = { cherry: 20, plank: 10, meat: 5, bun: 4, butterfly_lotion: 2, hatchet: 1, grain: 9 };
    const visit = createRubeVisit();
    const rng = lcg(3);
    const ctx = { inv, catalog: CATALOG, level: 3 };
    assert.equal(rubeTalk(visit, ctx, rng).ok, true);
    let res;
    const texts = [];
    for (let i = 0; i < 4; i += 1) {
      res = rubeRedo(visit, ctx, rng);
      texts.push(res.text);
      if (!res.ok) break;
    }
    if (visit.offerCount === 5) {
      assert.match(texts[2], /I only have so much patience! \(4\/5\)$/);
      assert.match(texts[3], /Last chance! \(5\/5\)$/);
      const over = rubeRedo(visit, ctx, rng);
      assert.equal(over.ok, false);
      assert.equal(over.text, RUBE_TEXT.nothingElse);
    }
    const v = createRubeVisit();
    v.offerGive = 'pick';
    v.offerReceive = 'cherry';
    v.offerCount = 1;
    assert.equal(rubeOfferText(v, CATALOG), "I'll give you a Pick for one of your Cherries. OK?");
  });

  it('accepting swaps one item and counts the trade; a missing item is "Brigand!"', () => {
    const state = createRubeState();
    const inv = { cherry: 2 };
    const v = createRubeVisit();
    v.offerGive = 'pick';
    v.offerReceive = 'cherry';
    const res = rubeAccept(v, state, inv, 5 * HOUR);
    assert.equal(res.text, 'Great deal, great deal!');
    assert.deepEqual(inv, { cherry: 1, pick: 1 });
    assert.equal(state.tradesToday, 1);
    assert.equal(state.lastTrade, 5 * HOUR);
    const v2 = createRubeVisit();
    v2.offerGive = 'pick';
    v2.offerReceive = 'meat';
    assert.equal(rubeAccept(v2, state, inv).text, 'Brigand!');
  });

  it('nothing to trade ends the visit with a source no-deal line', () => {
    const visit = createRubeVisit();
    const res = rubeTalk(visit, { inv: {}, catalog: CATALOG, level: 1 }, () => 0);
    assert.equal(res.ok, false);
    assert.ok(RUBE_TEXT.noDeals.includes(res.text));
    assert.equal(visit.done, true);
  });
});

describe('essence of rubeweed', () => {
  it('lures once a game day, not after 3 trades or within 30 minutes of one', () => {
    const state = createRubeState();
    const inv = { essence_of_rubeweed: 2 };
    const street = { hubId: '58' };
    assert.equal(imbibeRubeweed(state, inv, { street }).msg, RUBE_TEXT.imbibe);
    assert.equal(state.lureActive, true);
    assert.equal(imbibeCheck(state, { street }).msg, 'You are already under the effects of Essence of Rubeweed.');
    state.lureActive = false;
    assert.equal(imbibeCheck(state, { street }).msg, RUBE_TEXT.reek);
    const s2 = createRubeState({ lastTrade: 10 * HOUR });
    assert.equal(imbibeCheck(s2, { street, now: 10 * HOUR + 10 * 60_000 }).msg, RUBE_TEXT.welcome);
    assert.equal(imbibeCheck(createRubeState(), { street: { hubId: '122' } }).msg, RUBE_TEXT.cantFind);
  });
});

describe('rube cards', () => {
  it('Rube\'s Favorite and Rube Radar are live', () => {
    assert.equal(remakeStatus('rube_better_items').status, 'live');
    assert.equal(remakeStatus('rube_chance_to_meet').status, 'live');
  });
});
