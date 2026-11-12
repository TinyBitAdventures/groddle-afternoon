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
  shrineFillQty,
} from '../public/js/shrines.js?v=15cd8b43';
import { GIANT_NAMES, giantDisplayName } from '../public/js/giant-names.js?v=0e295891';

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
      assert.ok(existsSync(join(publicRoot, 'assets', 'sprites', 'shrines', `${giant}_open.webp`)));
      assert.ok(existsSync(join(publicRoot, 'assets', 'sprites', 'shrines', `${giant}_close.webp`)));
      assert.ok(existsSync(join(publicRoot, 'assets', 'sprites', 'icons', `emblem_${giant}.webp`)));
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
    const { donationXpLimit, EMBLEM_XP } = await import('../public/js/shrines.js?v=15cd8b43');
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
    // The movement runs in sub-steps (js/avatar-step.js frameSteps); the walk-by check after them.
    assert.match(src, /physics\(step\);\n\s+\}\n\s+tickAvatarAfk\(\);\n\s+updateShrineWalkBy\(\);/);
  });
});

describe('Giant names players read (report #102)', () => {
  it('giant-names.js has every shrine Giant under the same name as GIANTS, and Ti reads Tii', () => {
    for (const [id, giant] of Object.entries(GIANTS)) assert.equal(GIANT_NAMES[id], giant.name, id);
    assert.equal(GIANTS.ti.name, 'Tii');
    assert.equal(giantDisplayName('ti'), 'Tii');
    assert.equal(giantDisplayName('tii'), 'Tii');
    assert.equal(giantDisplayName('Ti'), 'Tii');
    assert.equal(giantDisplayName('humbaba'), 'Humbaba');
    assert.equal(giantDisplayName('rook'), 'Rook');
    assert.equal(giantDisplayName(''), '');
  });

  it('no message capitalizes a giant id itself (the way "Ti" reached the loading card)', () => {
    const files = [
      'js/exploration.js', 'js/drop-tables.js', 'js/hell.js', 'js/puzzle-triggers.js', 'js/secret-spots.js',
      'js/item-verbs-more.js', 'js/giant-icons.js', 'js/features/rook-attack-feature.js',
      'js/features/street-jobs-feature.js', 'js/features/giant-icons-feature.js', 'js/quests.js', 'js/feats-mp.js', 'game.js',
    ];
    const capitalized = /(?:\bcapitalize(?:First)?\((?:street\.shrineGiant|f\.giant|giant|giantId|face)\)|\b(?:giant|giantId|f\.giant|id)(?:\.charAt\(0\)|\[0\])\.toUpperCase\(\)|\$\{(?:f\.giant|rewardDef\.giantId)(?: \|\| '\w+')?\} favor)/;
    for (const file of files) {
      const src = readFileSync(join(publicRoot, file), 'utf8');
      assert.doesNotMatch(src, capitalized, file);
    }
  });

  it('the favor, dice, grave and emblem lines say Tii', async () => {
    const { capitalizeGiant } = await import('../public/js/secret-spots.js?v=59a37384');
    const { dieOutcome } = await import('../public/js/item-verbs-more.js?v=f495e9e8');
    const { graveRecognitionText } = await import('../public/js/hell.js?v=6a0c61bf');
    const { emblemVerbCheck } = await import('../public/js/giant-icons.js?v=0d6b4965');
    assert.equal(capitalizeGiant('ti'), 'Tii');
    assert.equal(dieOutcome({ mood: 100, energy: 100 }, 'ti').line, 'rolled "Tii"');
    assert.match(graveRecognitionText('mourn', 'Someone', 'ti', 5), /favor with Tii, who is pleased/);
    const { GIANT_ICON_DATA } = await import('../public/js/giant-icons-data.js?v=5026b09c');
    const used = { used: { [`${GIANT_ICON_DATA.ti.emblemClass}:caress`]: 1 } };
    assert.equal(emblemVerbCheck(used, 'ti', 'caress').msg, "You've already caressed an Emblem of Tii today.");
  });
});

describe('the donation window opens with the count filled in (G630, report #168)', () => {
  // ShrineDonateDialog.as tryToFillFavor 242-264: min(how many you hold, floor(favor to the emblem /
  // one item's favor), floor(favor left today / one item's favor)); the picker's least is 1 (101).
  it('opens at what fills the emblem when you hold more than that', () => {
    // A Sammich is worth 29, so 2.9 favor each: floor(1000 / 2.9) = 344.
    assert.equal(shrineFillQty(createShrineState(), 'spriggan', { sammich: 500 }, 'sammich'), 344);
    assert.equal(shrineFillQty(createShrineState({ favor: { spriggan: 900 } }), 'spriggan', { sammich: 500 }, 'sammich'), 34);
  });

  it('opens at all you hold when that is fewer than needed', () => {
    assert.equal(shrineFillQty(createShrineState(), 'spriggan', { sammich: 5 }, 'sammich'), 5);
  });

  it("the day's favor limit counts when it is nearer than the emblem", () => {
    const state = createShrineState({ favor: { spriggan: 100 }, dailyFavor: { spriggan: 950 } });
    assert.equal(shrineFillQty(state, 'spriggan', { sammich: 500 }, 'sammich'), 17, 'floor(50 / 2.9)');
  });

  it('an item worth more than the favor left, or a full meter, opens at 1', () => {
    assert.equal(shrineFillQty(createShrineState({ favor: { spriggan: 999 } }), 'spriggan', { sammich: 40 }, 'sammich'), 1);
    assert.equal(shrineFillQty(createShrineState({ favor: { spriggan: 1000 } }), 'spriggan', { sammich: 40 }, 'sammich'), 1);
    assert.equal(shrineFillQty(createShrineState({ dailyFavor: { spriggan: 1000 } }), 'spriggan', { sammich: 40 }, 'sammich'), 1);
  });

  it('a later emblem costs more, and a hallowed powder makes each item count for more', () => {
    assert.equal(emblemCostFor(createShrineState({ emblems: { spriggan: 1 } }), 'spriggan'), 1100);
    assert.equal(shrineFillQty(createShrineState({ emblems: { spriggan: 1 } }), 'spriggan', { sammich: 500 }, 'sammich'), 379, 'floor(1100 / 2.9)');
    assert.equal(shrineFillQty(createShrineState(), 'spriggan', { sammich: 500 }, 'sammich', { powderBonus: 3 }), 114, 'floor(1000 / 8.7)');
  });

  it('never more than 9,999, the most the picker took (ShrineDonateDialog.as 284)', () => {
    assert.equal(shrineFillQty(createShrineState(), 'spriggan', { cherry: 20000 }, 'cherry'), 9999);
  });

  it('the prefilled count is one the quote accepts, and gives no more favor than the meter holds', () => {
    const state = createShrineState({ favor: { spriggan: 900 } });
    const inv = { sammich: 500 };
    const n = shrineFillQty(state, 'spriggan', inv, 'sammich');
    const quote = quoteShrineDonation(state, 'spriggan', inv, 'sammich', n);
    assert.equal(quote.qty, n);
    assert.ok(quote.favor <= 100 && quote.favor > 100 - 3, String(quote.favor));
  });

  it('the window fills it in when it opens and when another stack is chosen; Max is still all you hold', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const open = game.slice(game.indexOf('function openShrinePanel('), game.indexOf('function renderShrinePanel('));
    assert.match(open, /shrineQty = null;/);
    const draw = game.slice(game.indexOf('function renderShrinePanel('), game.indexOf('function performShrineDonation('));
    assert.match(draw, /if \(shrineQty == null\) \{\n\s+shrineQty = shrineSelected \? shrineFillQty\(shrineState, giantId, inv, shrineSelected, \{ \.\.\.shrinePowderOpts\(\), \.\.\.shrineToolOpts\(\) \}\) : 1;/);
    assert.equal(draw.match(/shrineQty = null;/g).length, 2, 'the first stack, and a stack clicked');
    // QuantityPicker.as 114-122, 150-152: the original's Max button set all you hold too.
    assert.match(draw, /\[data-shrine-max\]'\)\?\.addEventListener\('click', \(\) => setQty\(quote\.maxQty\)\);/);
    // The window still closes after each donation (ShrineManager.as 109-114).
    const give = game.slice(game.indexOf('function performShrineDonation('), game.indexOf('function shrineToolOpts('));
    assert.match(give, /closeShrinePanel\(\);/);
  });
});
