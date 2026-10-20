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
  listShrineDonationOptions,
  normalizeShrineState,
  quoteShrineDonation,
  resetShrineDay,
} from '../public/js/shrines.js';

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
    assert.equal(state.dailyXp, DAILY_DONATION_XP_LIMIT);
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
    const html = readFileSync(join(publicRoot, 'index.html'), 'utf8');
    assert.match(content, /classId\.startsWith\('npc_shrine_'\)/);
    assert.match(game, /spawnShrine/);
    assert.match(game, /playShrineDonation/);
    assert.match(game, /donateToShrine/);
    assert.match(game, /shrines: shrineState/);
    assert.match(html, /id="shrine-panel"/);
  });
});

