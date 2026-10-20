/**
 * Giant Icons: iconize, emblem and icon verbs, tithes, bestowments,
 * conversations, and the feature's pack verbs.
 * Run: node --test tests/giant-icons.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GIANT_ICON_DATA,
  GIANT_ICON_IDS,
  adoreIcon,
  bestowChance,
  bestowCheck,
  bestowMessage,
  completeConversation,
  createIconState,
  iconConversation,
  iconize,
  pickUpIcon,
  placeIcon,
  rewardRange,
  rollIconDay,
  syncPackIcons,
  titheCost,
  titheIcon,
  useEmblem,
} from '../public/js/giant-icons.js';
import { remakeStatus } from '../public/js/imagination-remake.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const seq = (...vals) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

describe('giant icon catalog', () => {
  it('has all eleven icons with source text, 20 actions and art', () => {
    assert.equal(GIANT_ICON_IDS.length, 11);
    assert.equal(GIANT_ICON_DATA.ti.iconClass, 'icon_tii');
    assert.equal(GIANT_ICON_DATA.ti.label, 'Icon of Tii');
    for (const def of Object.values(GIANT_ICON_DATA)) {
      assert.equal(def.capacity, 20);
      assert.match(def.desc, /Icon of/);
      assert.ok(existsSync(join(root, 'assets/sprites/icons', `${def.iconClass}.png`)), def.iconClass);
      assert.ok(existsSync(join(root, 'assets/sprites/giant-icons', `${def.iconClass}.png`)), def.iconClass);
      assert.ok(def.conversations.length >= 1);
      assert.equal(def.conversations[0].level, 10);
      assert.equal(def.conversations[0].xp, 111);
    }
    assert.equal(GIANT_ICON_DATA.alph.conversations[0].beats[0].text, '*Click* ... Welcome to the Icon of Alph. Please enter your request after the tone.');
    assert.equal(GIANT_ICON_DATA.alph.conversations[0].beats[0].response, 'What?');
    assert.equal(GIANT_ICON_DATA.zille.conversations[1].after, 'icon_zille_1');
  });
});

describe('iconize and emblem verbs', () => {
  it('needs 11 emblems, consumes them and makes a 20-action icon', () => {
    const state = createIconState();
    const inv = { emblem_ti: 10 };
    assert.equal(iconize(state, inv, 'ti').ok, false);
    inv.emblem_ti = 12;
    const res = iconize(state, inv, 'ti');
    assert.equal(res.ok, true);
    assert.equal(res.msg, '*Zap!* 11 Emblems of Tii combined to form an Icon of Tii.');
    assert.equal(inv.emblem_ti, 1);
    assert.equal(inv.icon_tii, 1);
    assert.deepEqual(state.pack.ti, [20]);
    assert.equal(res.first, true);
    assert.equal(res.giantLover, false);
  });

  it('flags Giant Lover at icons of all eleven Giants', () => {
    const state = createIconState();
    const inv = {};
    let res;
    for (const g of GIANT_ICON_IDS) {
      inv[GIANT_ICON_DATA[g].emblemClass] = 11;
      res = iconize(state, inv, g);
    }
    assert.equal(res.giantLover, true);
    assert.equal(state.iconized.length, 11);
  });

  it('caress/consider/contemplate give 25 mood, 20 energy, 30 iMG once a game day', () => {
    const state = createIconState();
    rollIconDay(state, 'd1');
    assert.deepEqual([useEmblem(state, 'alph', 'caress').amount, useEmblem(state, 'alph', 'consider').amount, useEmblem(state, 'alph', 'contemplate').amount], [25, 20, 30]);
    const again = useEmblem(state, 'alph', 'caress');
    assert.equal(again.ok, false);
    assert.equal(again.msg, "You've already caressed an Emblem of Alph today.");
    assert.equal(useEmblem(state, 'mab', 'caress').ok, true, 'per emblem class');
    rollIconDay(state, 'd2');
    assert.equal(useEmblem(state, 'alph', 'caress').ok, true);
  });
});

describe('icon verbs', () => {
  it('ruminate/revere/reflect: 25-100 scaled above level 20, one action, once a day', () => {
    assert.deepEqual(rewardRange(10), [25, 100]);
    assert.deepEqual(rewardRange(30), [75, 300]);
    assert.deepEqual(rewardRange(30, true), [100, 300]);
    const state = createIconState();
    rollIconDay(state, 'd1');
    syncPackIcons(state, { icon_alph: 1 });
    const res = adoreIcon(state, { giant: 'alph' }, 'ruminate', { level: 10 }, () => 0.999);
    assert.equal(res.ok, true);
    assert.equal(res.stat, 'mood');
    assert.equal(res.amount, 100);
    assert.equal(res.msg, 'You ruminated on an Icon of Alph.');
    assert.equal(state.pack.alph[0], 19);
    const again = adoreIcon(state, { giant: 'alph' }, 'ruminate', { level: 10 });
    assert.equal(again.msg, "You've already ruminated on an Icon of Alph today.");
    const piety = adoreIcon(state, { giant: 'alph' }, 'revere', { level: 10, skills: ['piety_1'] }, () => 0);
    assert.equal(piety.amount, 30, '25 x 1.2');
  });

  it('an empty icon needs a tithe; tithing adds 5 actions and doubles your next gift', () => {
    const state = createIconState({ pack: { mab: [0] } });
    rollIconDay(state, 'd1');
    const blocked = adoreIcon(state, { giant: 'mab' }, 'reflect', { level: 21 });
    assert.equal(blocked.msg, 'This Icon requires a tithe of 154 currants to become operational.');
    const pc = { currants: 1000 };
    assert.equal(titheIcon(state, { giant: 'mab' }, pc, { level: 4 }).msg, 'Only the truly penitent Glitch may tithe. Come back in a few levels.');
    const paid = titheIcon(state, { giant: 'mab' }, pc, { level: 21 });
    assert.equal(paid.ok, true);
    assert.equal(paid.cost, 154);
    assert.equal(pc.currants, 846);
    assert.equal(paid.msg, 'You tithed 154 currants to an Icon of Mab. Your generous donation will contribute to the upkeep of the Icon.');
    assert.equal(state.pack.mab[0], 5);
    const gift = adoreIcon(state, { giant: 'mab' }, 'reflect', { level: 10 }, () => 0);
    assert.equal(gift.amount, 50, 'tither double');
    assert.equal(gift.tither, true);
    state.pack.mab[0] = 11;
    assert.equal(titheIcon(state, { giant: 'mab' }, pc, { level: 21 }).msg, 'This Icon does not require a tithe.');
  });

  it('tithe cost: 121, +33 a level above 20, Pious Patron discounts', () => {
    assert.equal(titheCost(5), 121);
    assert.equal(titheCost(30), 451);
    assert.equal(titheCost(5, ['icon_tithe_1']), 117);
    assert.equal(titheCost(5, ['icon_tithe_2']), 115);
    assert.equal(titheCost(5, ['icon_tithe_3']), 109);
    assert.equal(titheCost(5, ['icon_tithe_1', 'icon_tithe_4']), 97);
  });
});

describe('placed icons', () => {
  it('place and pick up keep the action counter; street icons cannot be adored', () => {
    const state = createIconState({ pack: { alph: [7] } });
    const inv = { icon_alph: 1 };
    const placed = placeIcon(state, inv, 'alph', 'GSTREET', 100, 200);
    assert.equal(placed.ok, true);
    assert.equal(inv.icon_alph, undefined);
    assert.equal(state.placed.GSTREET[0].actions, 7);
    assert.equal(adoreIcon(state, { placedId: placed.row.id }, 'ruminate', { level: 10 }).hidden, true);
    const back = pickUpIcon(state, inv, 'GSTREET', placed.row.id);
    assert.equal(back.ok, true);
    assert.equal(inv.icon_alph, 1);
    assert.deepEqual(state.pack.alph, [7]);
  });

  it('bestows once a minute per Giant at 5% (Giants\' Beloved up to 6.5%)', () => {
    assert.deepEqual([bestowChance([]), bestowChance(['icon_bestow_chance_1']), bestowChance(['icon_bestow_chance_2']), bestowChance(['icon_bestow_chance_3'])], [5, 5.5, 6, 6.5]);
    const state = createIconState();
    const row = { id: 'i1', giant: 'alph', actions: 20 };
    // roll randInt(1,1000) = 50 passes 5%; type index 2 of [mood, energy, xp, favor] = xp; amount 100.
    const res = bestowCheck(state, row, { now: 100_000, level: 10, favor: 0, favorMax: 1000 }, seq(0.0491, 0.6, 0.999));
    assert.equal(res.kind, 'bestow');
    assert.equal(res.roll, 50);
    assert.equal(res.type, 'xp');
    assert.equal(res.amount, 100);
    assert.equal(bestowCheck(state, row, { now: 130_000, level: 10 }, () => 0), null, 'one check a minute');
    const miss = bestowCheck(state, row, { now: 170_000, level: 10 }, () => 0.06);
    assert.equal(miss.kind, 'miss');
    assert.equal(bestowMessage('ti', 'favor', 25), 'The Icon of Tii has bestowed 25 favor upon you.');
    assert.equal(bestowMessage('alph', 'mood', 0), "The Icon of Alph tried to bestow mood upon you, but you didn't need any.");
  });

  it('no favor near the cap; favor is 25 (+5 x level above 20); out of actions asks for a tithe', () => {
    const state = createIconState();
    const row = { id: 'i1', giant: 'lem', actions: 20 };
    const near = bestowCheck(state, row, { now: 0 + 60_000, level: 10, favor: 995, favorMax: 1000, testing: true }, seq(0.5, 0.999, 0.5));
    assert.notEqual(near.type, 'favor');
    const s2 = createIconState();
    const fav = bestowCheck(s2, row, { now: 60_000, level: 22, favor: 0, favorMax: 1000, testing: true }, seq(0.5, 0.999));
    assert.equal(fav.type, 'favor');
    assert.equal(fav.amount, 25 + 5 * 22);
    const empty = bestowCheck(createIconState(), { id: 'i2', giant: 'pot', actions: 0 }, { now: 60_000 });
    assert.equal(empty.bubble, 'A tithe is due. Insert currants to continue.');
  });
});

describe('icon conversations', () => {
  it('level 10, then the chain, 111 iMG once', () => {
    const state = createIconState();
    assert.equal(iconConversation(state, 'humbaba', 9), null);
    const first = iconConversation(state, 'humbaba', 10);
    assert.equal(first.id, 'icon_humbaba_1');
    assert.equal(completeConversation(state, first.id).xp, 111);
    assert.equal(iconConversation(state, 'humbaba', 10).id, 'icon_humbaba_2');
    assert.equal(completeConversation(state, first.id).ok, false);
  });
});

describe('imagination cards', () => {
  it('Pious Patron and Giants\' Beloved are live', () => {
    for (const id of ['icon_tithe_1', 'icon_tithe_4', 'icon_bestow_chance_1', 'icon_bestow_chance_3']) assert.equal(remakeStatus(id).status, 'live', id);
  });
});

describe('giant icons feature', () => {
  it('offers the source pack verbs and iconizes through the engine', async () => {
    const { giantIconsFeature } = await import('../public/js/features/giant-icons-feature.js');
    giantIconsFeature._reset();
    const events = [];
    const granted = [];
    const engine = {
      inv: { emblem_alph: 11 },
      pc: { level: 12, currants: 500, mood: 10, energy: 10, xp: 0, imagination: 0, imaginationUpgrades: [] },
      learnedSkills: [],
      streetTsid: 'GTEST',
      setData() {},
      pushActivity() {},
      toast() {},
      refreshPack() {},
      updateHud() {},
      save() {},
      param: () => null,
      playSound() {},
      achievement: (c, n) => events.push(`${c}=${n}`),
      grantAchievement: (id) => granted.push(id),
    };
    giantIconsFeature.init(engine);
    const verbs = giantIconsFeature.packVerbs('emblem_alph', engine).map((v) => v.id);
    assert.deepEqual(verbs, ['iconize', 'caress', 'consider', 'contemplate']);
    assert.equal(giantIconsFeature.runPackVerb('emblem_alph', 'iconize', engine), true);
    assert.equal(engine.inv.icon_alph, 1);
    assert.ok(events.includes('icons_created=1'));
    assert.deepEqual(giantIconsFeature.packVerbs('icon_alph', engine).map((v) => v.id), ['tithe', 'ruminate', 'revere', 'reflect', 'place']);
    giantIconsFeature.runPackVerb('icon_alph', 'revere', engine);
    assert.ok(engine.pc.energy > 10);
    assert.equal(giantIconsFeature._state().pack.alph[0], 19);
  });
});
