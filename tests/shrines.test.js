import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DAILY_DONATION_XP_LIMIT,
  GIANTS,
  canClaimEmblem,
  claimShrineEmblem,
  createShrineState,
  donateToShrine,
  emblemCostFor,
  giantForStreet,
  inEmblemHitbox,
  listShrineDonationOptions,
  normalizeShrineState,
  quoteShrineDonation,
  resetShrineDay,
} from '../public/js/shrines.js?v=01b185bc';

const publicRoot = join(import.meta.dirname, '..', 'public');

describe('official Giant shrine donation economy', () => {
  it('ships all eleven Giants and assigns forest streets to Spriggan', () => {
    assert.equal(Object.keys(GIANTS).length, 11);
    assert.equal(giantForStreet({ hubName: 'Groddle Forest' }).id, 'spriggan');
    assert.equal(giantForStreet({ hubName: 'Salatu' }).id, 'lem');
    assert.equal(giantForStreet({ hubName: 'Ilmenskie Caverns' }).id, 'zille');
    assert.equal(
      giantForStreet({ hubId: '42' }).id,
      giantForStreet({ hubId: '42' }).id,
      'fallback assignment should be stable'
    );
  });

  it('quotes the GSJS 20% iMG, 10% mood, and 10% favor formula', () => {
    const state = createShrineState();
    const quote = quoteShrineDonation(state, 'spriggan', { sammich: 2 }, 'sammich', 2);
    assert.equal(quote.ok, true);
    assert.equal(quote.baseCost, 58);
    assert.equal(quote.xp, 12);
    assert.equal(quote.mood, 6);
    assert.equal(quote.favor, 6);
  });

  it('donates atomically and applies rewards to both iMG balances', () => {
    const state = createShrineState();
    const inv = { sammich: 2 };
    const pc = { mood: 90, xp: 5000, imagination: 5000 };
    const result = donateToShrine(state, 'spriggan', inv, pc, 'sammich', 2, { rng: () => 0.5 });
    assert.equal(result.ok, true);
    assert.equal(inv.sammich, 0);
    assert.equal(pc.xp, 5012);
    assert.equal(pc.imagination, 5012);
    assert.equal(pc.mood, 96);
    assert.equal(state.favor.spriggan, 6);
    assert.equal(state.dailyFavor.spriggan, 6);
    assert.equal(state.donationsByGiant.spriggan, 1);
    assert.equal(state.donations, 1);
  });

  it('does not mutate when the item is missing or is a tool', () => {
    const state = createShrineState();
    const inv = { sammich: 0, pick: 1 };
    const pc = { mood: 50, xp: 10, imagination: 10 };
    assert.equal(donateToShrine(state, 'spriggan', inv, pc, 'sammich', 1).ok, false);
    assert.equal(quoteShrineDonation(state, 'spriggan', inv, 'pick', 1).reason, 'not_donatable');
    assert.deepEqual(inv, { sammich: 0, pick: 1 });
    assert.equal(pc.xp, 10);
  });

  it('caps daily favor and donation iMG without blocking a donation', () => {
    const state = createShrineState({
      favor: { spriggan: 998 },
      dailyFavor: { spriggan: 999 },
      dailyXp: DAILY_DONATION_XP_LIMIT - 2,
    });
    const quote = quoteShrineDonation(state, 'spriggan', { musicblock_d_green_02: 1 }, 'musicblock_d_green_02', 1);
    assert.equal(quote.rawFavor, 40);
    assert.equal(quote.favor, 1);
    assert.equal(quote.rawXp, 80);
    assert.equal(quote.xp, 2);
  });

  it('supports the official rare and super donation bonuses', () => {
    const huge = donateToShrine(
      createShrineState(), 'spriggan', { sammich: 1 },
      { mood: 0, xp: 0, imagination: 0 }, 'sammich', 1, { rng: () => 0.005 }
    );
    assert.equal(huge.bonus, 'huge');
    assert.equal(huge.xp, 18);
    const superResult = donateToShrine(
      createShrineState(), 'spriggan', { sammich: 1 },
      { mood: 0, xp: 0, imagination: 0 }, 'sammich', 1, { rng: () => 0 }
    );
    assert.equal(superResult.bonus, 'super');
    assert.equal(superResult.xp, 35);
  });

  it('claims emblems and raises the next official favor target by 100', () => {
    const state = createShrineState({ favor: { spriggan: 1000 } });
    const inv = {};
    assert.equal(canClaimEmblem(state, 'spriggan'), true);
    const result = claimShrineEmblem(state, 'spriggan', inv);
    assert.equal(result.ok, true);
    assert.equal(inv.emblem_spriggan, 1);
    assert.equal(state.emblems.spriggan, 1);
    assert.equal(state.favor.spriggan, 0);
    assert.equal(emblemCostFor(state, 'spriggan'), 1100);
  });

  it('normalizes storage, lists valuable pack goods first, and resets only daily caps', () => {
    const state = normalizeShrineState({
      favor: { spriggan: 12.9, fake: 99 },
      emblems: { spriggan: -5 },
      dailyFavor: { spriggan: 7 },
      dailyXp: 999999,
      donations: -1,
    });
    assert.equal(state.favor.spriggan, 12);
    assert.equal(state.favor.fake, undefined);
    assert.equal(state.emblems.spriggan, 0);
    // The cap is level-based (donationXpLimit), applied when donating.
    assert.equal(state.dailyXp, 999999);
    const rows = listShrineDonationOptions(state, 'spriggan', { grain: 4, sammich: 1, pick: 1 });
    assert.deepEqual(rows.map((row) => row.classTsid), ['sammich', 'grain']);
    resetShrineDay(state);
    assert.equal(state.favor.spriggan, 12);
    assert.equal(state.dailyFavor.spriggan, 0);
    assert.equal(state.dailyXp, 0);
  });
});

describe('shrine official art and client wiring', () => {
  it('ships open/close animation sheets and emblem art for every Giant', () => {
    for (const giant of Object.keys(GIANTS)) {
      assert.ok(existsSync(join(publicRoot, 'assets', 'sprites', 'shrines', `${giant}_open.png`)));
      assert.ok(existsSync(join(publicRoot, 'assets', 'sprites', 'shrines', `${giant}_close.png`)));
      assert.ok(existsSync(join(publicRoot, 'assets', 'sprites', 'icons', `emblem_${giant}.png`)));
    }
  });

  it('wires shrine verbs, panel, world spawning, animation, and persistence', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const content = readFileSync(join(publicRoot, 'content.js'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    assert.match(content, /classId\.startsWith\('npc_shrine_'\)/);
    assert.match(game, /spawnShrine/);
    assert.match(game, /playShrineDonation/);
    assert.match(game, /donateToShrine/);
    assert.match(game, /shrines: shrineState/);
    assert.match(html, /id="shrine-panel"/);
  });

  it('follows the source donation rules: level cap, capped bonus, favor accounting, emblem iMG', async () => {
    const { donationXpLimit, EMBLEM_XP } = await import('../public/js/shrines.js?v=01b185bc');
    const { XP_FOR_LEVEL } = await import('../public/js/progression.js?v=33462eaa');
    // stats_donation_xp_limit: 250 to level 5, 500 to 10, then a share of the level's interval.
    assert.equal(donationXpLimit(0), 250);
    assert.equal(donationXpLimit(XP_FOR_LEVEL[6]), 500); // level 8
    const l20 = XP_FOR_LEVEL[18]; // reaching level 20
    assert.equal(donationXpLimit(l20), Math.round((XP_FOR_LEVEL[19] - XP_FOR_LEVEL[18]) * (0.2 - 9 * 0.005)));
    // A lucky bonus counts toward the cap (bonus added before apiInc).
    const capped = createShrineState({ dailyXp: 250 });
    const huge = donateToShrine(capped, 'spriggan', { sammich: 1 }, { mood: 0, xp: 0, imagination: 0 }, 'sammich', 1, { rng: () => 0.005 });
    assert.equal(huge.bonus, 'huge');
    assert.equal(huge.xp, 0);
    // Daily favor takes its own room; total favor caps after (evalDonate).
    const near = createShrineState({ favor: { spriggan: 990 } });
    const res = donateToShrine(near, 'spriggan', { musicblock_d_green_02: 1 }, { mood: 0, xp: 0, imagination: 0 }, 'musicblock_d_green_02', 1, { rng: () => 0.5 });
    assert.equal(res.favor, 10);
    assert.equal(near.dailyFavor.spriggan, 40);
    // Emblems after the first pay 50 iMG.
    const st = createShrineState({ favor: { spriggan: 2200 } });
    const pc = { xp: 0, imagination: 0 };
    assert.equal(claimShrineEmblem(st, 'spriggan', {}, pc).xp, 0);
    assert.equal(claimShrineEmblem(st, 'spriggan', {}, pc).xp, EMBLEM_XP);
    assert.equal(pc.imagination, 50);
  });
});


describe('emblem hitbox (2012-09-22: a waiting emblem is given as you walk past)', () => {
  it('matches npc_shrine_base apiAddHitBox("emblem", 400, 400) around the shrine', () => {
    const shrine = { x: 1000, y: 500 };
    assert.equal(inEmblemHitbox(shrine, 1000, 500), true);
    assert.equal(inEmblemHitbox(shrine, 1200, 500), true);
    assert.equal(inEmblemHitbox(shrine, 801, 500), true);
    assert.equal(inEmblemHitbox(shrine, 1201, 500), false);
    assert.equal(inEmblemHitbox(shrine, 1000, 100), true);
    assert.equal(inEmblemHitbox(shrine, 1000, 99), false);
    assert.equal(inEmblemHitbox(shrine, 1000, 540), false);
    assert.equal(inEmblemHitbox(null, 1000, 500), false);
  });

  it('game.js grants on entering the hitbox through the same claim path as the panel', () => {
    const src = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    assert.match(src, /function updateShrineWalkBy\(\)/);
    assert.match(src, /entered && !isScreenFxBlocking\(\) && canClaimEmblem\(shrineState, target\.state\?\.giantId\)/);
    assert.match(src, /physics\(dt\);\n\s+tickAvatarAfk\(\);\n\s+updateShrineWalkBy\(\);/);
  });
});
