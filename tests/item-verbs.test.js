/**
 * G134 single-counter badges: each GameServerJS increment emitted from the
 * matching remake action (js/item-verbs.js, js/features/item-verbs-feature.js,
 * js/achievements.js, js/buffs.js), then the badge at its threshold.
 * Run: node --test tests/item-verbs.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GARLIC_EAT_COUNTER,
  ITEM_VERBS,
  crunchIce,
  itemVerbButton,
  runItemVerb,
} from '../public/js/item-verbs.js?v=item-verbs-4';
import {
  HAIRBALL_DASH_MIN,
  homeTrophyCount,
  isTrophyClass,
  itemVerbsFeature,
} from '../public/js/features/item-verbs-feature.js?v=g448-1';
import { homesFeature } from '../public/js/features/homes-feature.js?v=g448-1';
import {
  applyAchievementProgress,
  createAchievementState,
  getAchievementProgress,
  makingOutputAchievementCounters,
  resetAchievementCounter,
  seedAchievementNearCompletion,
  worldVerbAchievementCounters,
} from '../public/js/achievements.js?v=g403-1';
import { applyBuff, buffPhysics, createBuffState, getBuffItemInfo, tickBuffs } from '../public/js/buffs.js?v=g403-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '../public');

before(async () => {
  await loadContentCatalogsFromDir(join(publicRoot, 'assets/content'));
});

const pcFor = () => ({ imagination: 0, xp: 0, currants: 0, giantFavor: {} });
const apply = (state, rows) => rows.flatMap((row) => applyAchievementProgress(state, row.counter, row.amount, pcFor()));

/** The rows of one action move the badge, and finish it from `gap` short. */
function assertEarns(id, rows, gap = 1) {
  const fresh = createAchievementState();
  apply(fresh, rows);
  assert.ok(getAchievementProgress(fresh, id).conditions.some((c) => c.current >= 1), `${id} counted`);
  const near = createAchievementState();
  seedAchievementNearCompletion(near, id, gap);
  assert.equal(near.unlocked.includes(id), false, `${id} not yet`);
  apply(near, rows);
  assert.ok(near.unlocked.includes(id), `${id} at its threshold`);
}

/** An engine that writes badge counters into a real achievement state. */
function badgeEngine(over = {}) {
  const state = createAchievementState();
  const buffs = new Set();
  const log = { said: [], buffs: [], removed: [] };
  const engine = {
    inv: {},
    pc: { energy: 100, mood: 100, energyMax: 100, moodMax: 100, imaginationUpgrades: [] },
    player: { x: 0, y: 400 },
    interactables: [],
    get unlockedAchievements() {
      return state.unlocked;
    },
    achievement: (counter, amount = 1) => applyAchievementProgress(state, counter, amount, pcFor()),
    resetAchievementCounter: (counter) => resetAchievementCounter(state, counter),
    hasBuff: (id) => buffs.has(id),
    applyBuff: (id) => {
      buffs.add(id);
      log.buffs.push(id);
    },
    removeBuff: (id) => {
      if (buffs.delete(id)) log.removed.push(id);
    },
    pushActivity: (text) => log.said.push(text),
    toast: () => {},
    updateHud: () => {},
    refreshPack: () => {},
    save: () => {},
    setData: () => {},
    param: () => null,
    homeContext: () => ({ inHome: false }),
    droppedItems: { streets: {} },
    ...over,
  };
  return { engine, state, buffs, log };
}

beforeEach(() => itemVerbsFeature._reset());

describe('Spice Examiner and Mad Gasser: the items\' own verbs (notifyVerb)', () => {
  it('every spice and gas verb, with its source effects', () => {
    const pepper = ITEM_VERBS.find((v) => v.classTsid === 'black_pepper');
    const pc = { energy: 10, mood: 10, imagination: 0, xp: 0 };
    const out = runItemVerb(pepper, pc);
    assert.equal(out.ok, true);
    // +3 iMG at 10% mood: the mood bonus is x0.5, rounding to 2 (G148).
    assert.deepEqual([pc.energy, pc.imagination, out.consume], [8, 2, true]);
    assert.deepEqual(out.achievementCounters, [{ counter: 'black_pepper:sniff', amount: 1 }, { counter: 'VERB:sniff:black_pepper', amount: 1 }]);
    const mustard = ITEM_VERBS.find((v) => v.classTsid === 'mustard');
    const pc2 = { energy: 10, mood: 10 };
    runItemVerb(mustard, pc2);
    assert.deepEqual([pc2.energy, pc2.mood], [20, 6]);
    // conditions: energy / mood gates, and gone once the badge is owned.
    assert.equal(itemVerbButton(pepper, { energy: 2, mood: 50 }).reason, "You don't have enough energy to do this.");
    assert.equal(itemVerbButton(ITEM_VERBS.find((v) => v.classTsid === 'hot_pepper'), { energy: 50, mood: 5 }).reason, 'You are too depressed to do this.');
    assert.equal(itemVerbButton(ITEM_VERBS.find((v) => v.classTsid === 'laughing_gas'), { energy: 2, mood: 50 }).reason, 'You are too exhausted for laughter.');
    assert.equal(itemVerbButton(pepper, { energy: 50, mood: 50, unlocked: ['spice_examiner'] }), null);
  });

  it('all fifteen spice verbs plus Garlic\'s Eat earn Spice Examiner; the six gases Mad Gasser', () => {
    const { engine, state } = badgeEngine();
    for (const def of ITEM_VERBS) {
      engine.inv[def.classTsid] = 1;
      engine.pc.energy = 100;
      engine.pc.mood = 100;
      itemVerbsFeature.runPackVerb(def.classTsid, def.verb, engine);
    }
    assert.ok(state.unlocked.includes('mad_gasser'));
    assert.equal(state.unlocked.includes('spice_examiner'), false, 'garlic still to go');
    itemVerbsFeature.onEvent('items_eaten:garlic', 1, engine);
    assert.ok(state.unlocked.includes('spice_examiner'));
    assert.equal(GARLIC_EAT_COUNTER, 'garlic:eat');
    assert.equal(engine.inv.black_pepper || 0, 0, 'apiDelete');
    assert.equal(engine.inv.curry, 1, 'curry keeps');
  });
});

describe('Ice: Holy Zamboni and The Walking Frozed (ice.js:30-100)', () => {
  it('crunching counts cubes, costs 3 energy and pays 3 iMG; 10% freeze the brain', () => {
    const pc = { energy: 50, mood: 20, imagination: 0, xp: 0 };
    const out = crunchIce(pc, 1, { rng: () => 0.5 });
    // ice.js pays the iMG before the mood: 3 at 20% mood is x0.75, 2 (G148).
    assert.deepEqual([pc.energy, pc.mood, pc.imagination], [47, 26, 2]);
    assert.deepEqual(out.achievementCounters.map((r) => r.counter), ['ice:cubes_crunched', 'ice:crunch', 'VERB:crunch:ice']);
    const cold = { energy: 50, mood: 20, imagination: 0, xp: 0 };
    const frozen = crunchIce(cold, 1, { rng: () => 0.05 });
    assert.equal(cold.mood, 0);
    assert.ok(frozen.achievementCounters.some((r) => r.counter === 'brain:frozen'));
    // The cubes count before the energy check, as in the source.
    const tired = crunchIce({ energy: 1, mood: 0 }, 1);
    assert.equal(tired.ok, false);
    assert.deepEqual(tired.achievementCounters, [{ counter: 'ice:cubes_crunched', amount: 1 }]);
    assertEarns('ice_cruncher', out.achievementCounters);
    assertEarns('walking_frozed', frozen.achievementCounters);
  });
});

describe('Butterfly Whisperer, Spin Doctor and String Practitioner', () => {
  it('a massage counts butterflies:massaged (npc_butterfly.js:1124)', () => {
    const rows = worldVerbAchievementCounters('npc_butterfly', 'massage');
    assert.deepEqual(rows.map((r) => r.counter), ['npc_butterfly:massage', 'butterflies:massaged']);
    assertEarns('butterfly_whisperer', rows);
  });

  it('spindle.js:431-438: String from the Giants, and a spin of 2,051 Fiber or more', () => {
    const thread = [{ classTsid: 'thread', qty: 1 }];
    assert.deepEqual(makingOutputAchievementCounters('spindle', thread, { unitIndex: 1, batchQty: 3, string: true }), [{ counter: 'spun:straight_to_string', amount: 1 }]);
    assert.deepEqual(makingOutputAchievementCounters('spindle', thread, { unitIndex: 2, batchQty: 3, string: true }), []);
    assert.deepEqual(makingOutputAchievementCounters('splendid_spindle', thread, { unitIndex: 292, batchQty: 292 }), []);
    const big = makingOutputAchievementCounters('splendid_spindle', thread, { unitIndex: 293, batchQty: 293 });
    assert.deepEqual(big, [{ counter: 'spun:two_thousand_fiber', amount: 1 }]);
    assertEarns('spin_doctor', big);
    assertEarns('string_practicioner', makingOutputAchievementCounters('spindle', thread, { unitIndex: 1, batchQty: 1, string: true }));
  });
});

describe('Perseverating Dipsomaniac: ten straight buzzed minutes (catalog_buffs.js buff_buzzed)', () => {
  it('beer restarts the buzz; each minute counts; fading starts over', () => {
    const { engine, state, log } = badgeEngine();
    itemVerbsFeature.onEvent('beer:drink', 1, engine);
    assert.deepEqual(log.buffs, ['buff_buzzed']);
    for (let i = 0; i < 9; i++) itemVerbsFeature.onEvent('buff_tick:buff_buzzed', 1, engine);
    itemVerbsFeature.onEvent('beer:drink', 1, engine);
    assert.deepEqual(log.removed, ['buff_buzzed'], 'restarted, not faded');
    assert.equal(state.unlocked.includes('perseverating_dipsomaniac'), false);
    itemVerbsFeature.onEvent('buff_expired:buff_buzzed', 1, engine);
    itemVerbsFeature.onEvent('buff_tick:buff_buzzed', 1, engine);
    assert.equal(state.unlocked.includes('perseverating_dipsomaniac'), false, 'the fade reset the nine minutes');
    for (let i = 0; i < 9; i++) itemVerbsFeature.onEvent('buff_tick:buff_buzzed', 1, engine);
    assert.ok(state.unlocked.includes('perseverating_dipsomaniac'));
    assert.ok(log.said.includes('That is a nice buzz you got going on.'));
    assert.ok(log.said.includes('You feel your buzz fading.'));
  });

  it('buzzed minutes: +3 mood, -7 energy', () => {
    const buffs = createBuffState();
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    const t0 = 1_800_000_000_000;
    applyBuff(buffs, 'buff_buzzed', pc, t0);
    tickBuffs(buffs, pc, t0 + 60_000);
    assert.deepEqual([pc.energy, pc.mood], [43, 53]);
  });
});

describe('Hairball Gonzales: Essence of Hairball and the dash (players/inc_buffs.js:660-700)', () => {
  it('Imbibe is the buff item; the dash is 1.25x speed and -5 energy every 15 s', () => {
    const info = getBuffItemInfo('essence_of_hairball');
    assert.equal(info.buffId, 'hairball_dash');
    assert.equal(info.durationSeconds, 60);
    assert.ok(!/—/.test(info.message));
    const buffs = createBuffState();
    const pc = { energy: 50, mood: 50, energyMax: 100, moodMax: 100 };
    const t0 = 1_800_000_000_000;
    applyBuff(buffs, 'hairball_dash', pc, t0);
    assert.equal(buffPhysics(buffs, t0 + 1).speed, 1.25);
    tickBuffs(buffs, pc, t0 + 15_000);
    assert.equal(pc.energy, 45);
  });

  it('the distance between start and end on each street; over 14,000 sets distance_dashed', () => {
    const { engine, state } = badgeEngine();
    engine.hasBuff = (id) => id === 'hairball_dash';
    engine.player.x = 100;
    itemVerbsFeature.onEvent('essence_of_hairball:use', 1, engine);
    engine.player.x = 9100;
    itemVerbsFeature.onStreetClear(engine);
    engine.player.x = 200;
    itemVerbsFeature.onStreetEnter({ tsid: 'X' }, engine);
    engine.player.x = 5300;
    itemVerbsFeature.onEvent('buff_expired:hairball_dash', 1, engine);
    assert.ok(9000 + 5100 > HAIRBALL_DASH_MIN);
    assert.ok(state.unlocked.includes('hairball_gonzales'));
    const short = badgeEngine();
    itemVerbsFeature.onEvent('essence_of_hairball:use', 1, short.engine);
    short.engine.player.x = 13_000;
    itemVerbsFeature.onEvent('buff_expired:hairball_dash', 1, short.engine);
    assert.equal(short.state.unlocked.includes('hairball_gonzales'), false);
  });
});

describe('Noise-Bringer: Making Metal near a Sloth (metalmaker.js:925-934)', () => {
  it('each Sloth within 250 px counts, only with the metalmaking_music card', () => {
    const sloths = [{ classId: 'npc_sloth', sprite: { x: 200 } }, { classId: 'npc_sloth', sprite: { x: 400 } }];
    const off = badgeEngine({ interactables: sloths });
    itemVerbsFeature.onEvent('making_tool:metalmaker', 1, off.engine);
    assert.equal(off.state.unlocked.includes('noisebringer'), false);
    const on = badgeEngine({ interactables: sloths });
    on.engine.pc.imaginationUpgrades = ['metalmaking_music'];
    itemVerbsFeature.onEvent('making_tool:metalmaker', 1, on.engine);
    assert.ok(on.state.unlocked.includes('noisebringer'));
  });
});

describe('Self-sufficientiser and Humble Bragger: your home (home.js:20-52)', () => {
  it('cultivated items on your home street set cultivation_items:has', () => {
    const cult = homesFeature._state().cult;
    const saved = cult.items;
    cult.items = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, protoClass: 'proto_patch', rx: i * 100 }));
    try {
      const { engine, state } = badgeEngine({ homeContext: () => ({ inHome: true, owned: true, room: 'street' }) });
      itemVerbsFeature.onTick(16, 10_000, engine);
      assert.ok(state.unlocked.includes('self_sufficientiser'));
      // achievements_set: six after seven counts six, not thirteen.
      const again = badgeEngine({ homeContext: () => ({ inHome: true, owned: true, room: 'street' }) });
      cult.items = cult.items.slice(0, 6);
      itemVerbsFeature._reset();
      itemVerbsFeature.onTick(16, 10_000, again.engine);
      itemVerbsFeature._reset();
      itemVerbsFeature.onTick(16, 20_000, again.engine);
      assert.equal(getAchievementProgress(again.state, 'self_sufficientiser').conditions[0].current, 6);
    } finally {
      cult.items = saved;
    }
  });

  it('eleven trophies on your home street and in your house set trophy:placed_eleven', () => {
    assert.equal(isTrophyClass('trophy_gem'), true);
    assert.equal(isTrophyClass('trophy_street_creator_dirt_piece1'), false);
    const row = (classTsid, i) => ({ id: `s${i}`, classTsid, count: 1, x: i * 10, y: 0 });
    const ten = { streets: { RH_HOME_EXT: Array.from({ length: 6 }, (_, i) => row('trophy_gem', i)), RH_HOME_INT: Array.from({ length: 4 }, (_, i) => row('trophy_fruit', i)) } };
    assert.equal(homeTrophyCount(ten), 10);
    const { engine, state } = badgeEngine({ droppedItems: ten, homeContext: () => ({ inHome: true, owned: true, room: 'interior' }) });
    itemVerbsFeature.onTick(16, 10_000, engine);
    assert.equal(state.unlocked.includes('humble_bragger'), false);
    ten.streets.RH_HOME_INT.push(row('trophy_spice', 9), row('trophy_street_creator_wood_piece2', 10));
    itemVerbsFeature.onTick(16, 20_000, engine);
    assert.ok(state.unlocked.includes('humble_bragger'));
  });
});

describe('game.js wiring for G134', () => {
  it('buff events reach features, shrine powders reach donations, the spindle passes its spin', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    assert.match(game, /features\.event\(`buff_\$\{event\.type\}:\$\{event\.classTsid\}`, 1, engine\)/);
    assert.match(game, /donateToShrine\(shrineState, giantId, inv, pc, shrineSelected, shrineQty, shrinePowderOpts\(\)\)/);
    assert.match(game, /shrinePowderAchievementCounters\(result\.powderConsumed, result\.baseCost\)/);
    assert.match(game, /makingOutputAchievementCounters\(record\.recipe\.tool, record\.recipe\.outputs, spin\)/);
    assert.match(game, /resetAchievementCounter: \(counter\) => resetAchievementCounter\(achieveState, counter\)/);
    assert.match(game, /refreshTreeVisual\(target\) \{/);
    const registry = readFileSync(join(publicRoot, 'js/features/index.js'), 'utf8');
    // Later lanes (G137) bump these.
    assert.match(registry, /powders-feature\.js\?v=g\d+-\d+'; FEATURES\.push\(powdersFeature\)/);
    assert.match(registry, /item-verbs-feature\.js\?v=g\d+-\d+'; FEATURES\.push\(itemVerbsFeature\)/);
    // Lanes after this one bump the registry further.
    assert.ok(Number(game.match(/features\/index\.js\?v=registry-(\d+)'/)?.[1]) >= 48, 'registry key at 48 or later');
  });
});
