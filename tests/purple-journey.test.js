/**
 * G150 the Purple Journey (js/purple-journey.js,
 * js/features/purple-journey-feature.js, js/purple-journey-scene.js):
 * Essence of Purple's Imbibe, begin_purple_journey's countdown, Le Voyage
 * Violet's Scions and quoins, the two buffs and Elementary Penguin, checked
 * against GameServerJS.
 * Run: node --test tests/purple-journey.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMPEROR,
  HURRY,
  JOURNEY_COUNTER,
  PURPLE_TEXT,
  SCION,
  SCION_QUOTES,
  VOYAGE_ARRIVAL,
  VOYAGE_GEO,
  VOYAGE_TSID,
  emperorPosition,
  emperorQuoin,
  imbibe,
  imbibeButton,
  purpleTimeline,
  scionFact,
  scionWords,
} from '../public/js/purple-journey.js';
import { VOYAGE_FLOOR, VOYAGE_OFFSET } from '../public/js/purple-journey-scene.js';
import { purpleJourneyFeature } from '../public/js/features/purple-journey-feature.js?v=g419-1';
import { createAchievementState, applyAchievementProgress } from '../public/js/achievements.js?v=g403-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';

const here = dirname(fileURLToPath(import.meta.url));
const GSJS = join(here, '../../glitch-GameServerJS');
const read = (p) => readFileSync(join(GSJS, p), 'utf8');
const special = read('players/inc_special_locations.js');
const essence = read('items/essence_of_purple.js');
const apparition = read('items/purple_apparition.js');
const emperor = read('items/purple_emperor.js');
const buffs = read('items/catalog_buffs.js');

before(async () => {
  await loadContentCatalogsFromDir(join(here, '../public/assets/content'));
});

beforeEach(() => purpleJourneyFeature._reset());

function fakeEngine(over = {}) {
  const calls = { said: [], toasts: [], achievements: [], buffs: [], removed: [], emotes: [], data: {} };
  const buffSet = new Set(over.buffs || []);
  const engine = {
    started: true,
    inv: {},
    pc: { mood: 50, moodMax: 100 },
    player: { x: 500, y: 400 },
    streetTsid: 'GTEST',
    unlockedAchievements: [],
    hasBuff: (id) => buffSet.has(id),
    applyBuff: (id) => {
      buffSet.add(id);
      calls.buffs.push(id);
      return { ok: true };
    },
    removeBuff: (id) => {
      if (buffSet.delete(id)) calls.removed.push(id);
    },
    achievement: (counter, amount = 1) => calls.achievements.push(`${counter}=${amount}`),
    pushActivity: (t) => calls.said.push(t),
    toast: (t) => calls.toasts.push(t),
    playEmotion: (e) => calls.emotes.push(e),
    playSound: () => {},
    refreshPack: () => {},
    save: () => {},
    setData: (k, v) => {
      calls.data[k] = v;
    },
    param: () => null,
    metabolicGate: () => ({ ok: true }),
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
    busy: () => false,
    ...over,
  };
  return { engine, calls, buffSet };
}

describe('Essence of Purple: Imbibe', () => {
  it('refuses with the source lines: dead, journeying, Purpled Out', () => {
    for (const text of [PURPLE_TEXT.dead, PURPLE_TEXT.purpledOut, PURPLE_TEXT.tooltip, PURPLE_TEXT.wasted, PURPLE_TEXT.sip]) {
      assert.ok(essence.includes(text.replace(/'/g, "'")), text);
    }
    assert.ok(essence.includes(PURPLE_TEXT.journeying));
    assert.equal(imbibeButton({ dead: true, journeying: true }).reason, PURPLE_TEXT.dead);
    assert.equal(imbibeButton({ journeying: true, purpledOut: true }).reason, PURPLE_TEXT.journeying);
    assert.equal(imbibeButton({ purpledOut: true }).reason, PURPLE_TEXT.purpledOut);
    assert.equal(imbibeButton({}).enabled, true);
  });

  it('the first sip starts the journey 15 s later; a second sip before it is wasted', () => {
    assert.deepEqual(imbibe({ takenPurple: false }), { ok: true, started: true, message: 'Hm… tastes strangely woody, and a little sour.', delayMs: 15_000 });
    assert.deepEqual(imbibe({ takenPurple: true }), { ok: true, started: false, message: 'Nope, nothing.' });
    assert.ok(essence.includes("apiSetTimerX('begin_purple_journey', 15 * 1000, 0)"));
    const { engine, calls } = fakeEngine();
    engine.inv.essence_of_purple = 2;
    purpleJourneyFeature.runPackVerb('essence_of_purple', 'imbibe', engine);
    purpleJourneyFeature.runPackVerb('essence_of_purple', 'imbibe', engine);
    assert.equal(engine.inv.essence_of_purple || 0, 0);
    assert.deepEqual(calls.said, ['Hm… tastes strangely woody, and a little sour.', 'Nope, nothing.']);
    assert.equal(purpleJourneyFeature._state().taken, true);
    assert.ok(calls.achievements.includes('essence_of_purple:imbibe=1'));
  });
});

describe('begin_purple_journey', () => {
  const timeline = purpleTimeline();

  it('runs stages 0-12 on the source timers, with stage 7 falling into 8 and two chains after', () => {
    const at = (stage) => timeline.filter((r) => r.stage === stage && !r.enter).map((r) => r.at);
    assert.deepEqual(at(0), [0]);
    assert.deepEqual(at(1), [15_000]);
    assert.deepEqual(at(2), [30_000]);
    assert.deepEqual(at(3), [37_500]);
    assert.deepEqual(at(4), [42_500]);
    assert.deepEqual(at(5), [44_500]);
    assert.deepEqual(at(6), [45_500]);
    assert.deepEqual(at(7), [46_500]);
    assert.deepEqual(at(8), [47_000]);
    assert.deepEqual(at(9), [46_750, 47_250]);
    assert.deepEqual(at(10), [46_850, 47_350]);
    assert.deepEqual(at(11), [47_850, 48_350]);
    assert.deepEqual(timeline.filter((r) => r.enter).map((r) => r.at), [49_850, 50_350]);
    // Stage 7 shows stage 8's line: case 7 has no break.
    assert.equal(timeline.find((r) => r.stage === 7).vog.uid, 'purple_4');
    assert.ok(!timeline.some((r) => r.vog?.uid === 'purple_3'));
    assert.match(special, /case 7:[\s\S]*?apiSetTimerX\('begin_purple_journey', 500, 8\);\s*case 8:/);
  });

  it('every line and mood change is the source\'s', () => {
    const moods = timeline.filter((r) => r.mood).map((r) => `${r.stage}:${r.mood}`);
    assert.deepEqual(moods, ['2:5', '3:10', '5:-5', '6:-10']);
    for (const row of timeline) {
      if (row.activity) assert.ok(special.includes(row.activity.replace("it's its", "it's its")), row.activity);
      if (row.vog) assert.ok(special.includes(`vogText = "${row.vog.text}"`), row.vog.text);
    }
    assert.equal(timeline.find((r) => r.stage === 11).vog.big, true);
    assert.equal(timeline.find((r) => r.stage === 10).haze[1].secs, 0.75);
    assert.equal(timeline.find((r) => r.stage === 9).haze[1].secs, 0.25);
    assert.ok(special.includes("instance_id: 'purple_journey', x: 0, y: -61}, 2.0)"));
    assert.ok(special.includes(VOYAGE_TSID));
  });

  it('the feature plays the countdown (lines, mood, the surprise emote) and waits for a street to enter', () => {
    const { engine, calls } = fakeEngine({ transientInstance: () => true });
    engine.inv.essence_of_purple = 1;
    purpleJourneyFeature.runPackVerb('essence_of_purple', 'imbibe', engine);
    const start = purpleJourneyFeature._state().startedAt;
    purpleJourneyFeature.onTick(16, start + 15_000 + 44_600, engine);
    assert.deepEqual(calls.said.slice(1), timeline.filter((r) => r.activity).map((r) => r.activity));
    assert.equal(engine.pc.mood, 50 + 5 + 10 - 5);
    assert.deepEqual(calls.emotes, ['surprise']);
    purpleJourneyFeature.onTick(16, start + 15_000 + 60_000, engine);
    const s = purpleJourneyFeature._state();
    assert.equal(s.run, null, 'not entered inside another instance');
    assert.equal(s.taken, false, 'stage 12 cleared taken_purple');
    assert.ok(s.startedAt > 0, 'the room is still due');
  });
});

describe('Le Voyage Violet', () => {
  it('arrives at the source point on the floor', () => {
    assert.deepEqual(VOYAGE_ARRIVAL, { x: 0, y: -61 });
    assert.equal(VOYAGE_FLOOR, VOYAGE_ARRIVAL.y + VOYAGE_OFFSET.y);
  });

  it('purple_emperor timers: 5 Scions from 3 s every 12-17 s, quoins from 6 s every 10-20 s, finish at 85 s', () => {
    assert.ok(emperor.includes("this.apiSetTimer('manifestStrangeness', 3 * 1000);"));
    assert.ok(emperor.includes("this.apiSetTimer('manifestQuoin', 6 * 1000);"));
    assert.ok(emperor.includes("this.apiSetTimer('finishUp', 85* 1000);"));
    assert.ok(emperor.includes('(Math.random() * 5 + 12) * 1000'));
    assert.ok(emperor.includes('(Math.random() * 10 + 10) * 1000'));
    assert.ok(emperor.includes('if (this.spawn_count < 5)'));
    assert.deepEqual(EMPEROR, { firstScionMs: 3000, scionEveryMs: [12000, 17000], scions: 5, firstQuoinMs: 6000, quoinEveryMs: [10000, 20000], bigQuoinChance: 0.05, finishMs: 85000 });
    assert.ok(emperor.includes(PURPLE_TEXT.feelingBetter));
    assert.ok(apparition.includes("this.apiSetTimer('speak', 1000);") && apparition.includes("this.apiSetTimer('vanish', 10500);"));
    assert.deepEqual(SCION, { speakMs: 1000, bubbleMs: 9000, talkMs: 3000, idleAfterTalkMs: 4500, vanishMs: 10500, dieMs: 12000 });
  });

  it('getRandomPosition: around the player, inside the walls, 100-500 px up', () => {
    assert.deepEqual(emperorPosition({ x: 0, y: -61 }, VOYAGE_GEO, () => 0.5), { x: 0, y: -100 });
    assert.deepEqual(emperorPosition({ x: 1590, y: -61 }, VOYAGE_GEO, () => 1), { x: 1500, y: -100 });
    assert.deepEqual(emperorPosition({ x: -1590, y: -900 }, VOYAGE_GEO, () => 0), { x: -1500, y: -500 });
  });

  it('manifestQuoin: small random 2-6, or 25 one time in twenty', () => {
    assert.deepEqual(emperorQuoin(() => 0.01), { type: 'mood', amount: 25, big: true });
    const seq = [0.5, 0.99, 0.0];
    let i = 0;
    assert.deepEqual(emperorQuoin(() => seq[i++]), { type: 'currants', amount: 2, big: false });
    for (let n = 0; n < 50; n += 1) {
      const q = emperorQuoin();
      assert.ok(['mood', 'energy', 'xp', 'currants'].includes(q.type));
      assert.ok(q.big ? q.amount === 25 : q.amount >= 2 && q.amount <= 6);
    }
  });

  it('the Scion\'s 22 quotes are the source\'s', () => {
    assert.equal(SCION_QUOTES.length, 22);
    const flat = (t) => t.replace(/\s+/g, ' ').replace(/[“”"]/g, '"').trim();
    const src = flat(apparition.replace(/\\n/g, ' ').replace(/"\s*\+\s*tab\s*\+\s*"/g, ' ').replace(/"\s*\+\s*"/g, '').replace(/\\"/g, '"').replace(/\\“/g, '“').replace(/\\”/g, '”'));
    for (const q of SCION_QUOTES) {
      // Verbatim, the source's two em-dashes included (Tiny Speck's words stay exact).
      const want = flat(q);
      assert.ok(src.includes(want), want.slice(0, 50));
    }
  });

  it('the Scion\'s facts read your pack, the catalog, your house, badges and streets', () => {
    const ctx = {
      pack: [{ single: 'Cherry', plural: 'Cherries', count: 3 }],
      catalog: [{ plural: 'Pigs' }],
      house: [{ single: 'Rug', plural: 'Rugs', count: 1 }],
      badges: ['Elementary Penguin'],
      streets: ['Hechey Track'],
    };
    const rng = () => 0;
    assert.equal(scionFact(0, ctx, rng), "Your Cherries love you very much, but can't find the words.");
    assert.equal(scionFact(1, ctx, rng), 'The Pigs are waging an endless and bloody war against the Pigs.');
    assert.equal(scionFact(1, {}, rng), 'The Magic Beans are waging an endless and bloody war against the Flamingo Eyedrops.');
    assert.equal(scionFact(4, ctx, rng), 'The Rug in your home feels neglected. Please hug it.');
    assert.equal(scionFact(3, {}, rng), 'HURRY UP PLEASE ITS TIME');
    assert.equal(scionFact(6, ctx, rng), 'Your Cherries are cursed. They are the source of all your problems.');
    assert.equal(scionFact(10, ctx, rng), 'The Elementary Penguin badge is grape-flavoured.');
    assert.equal(scionFact(11, ctx, rng), 'Do you ever miss Hechey Track? You can go back there, but you can never really go back there.');
    assert.equal(scionFact(8, {}, rng), '', 'no badge: ask again instead of "undefined"');
    for (let t = 0; t <= 13; t += 1) {
      const line = scionFact(t, ctx, rng);
      const stem = line.replace(/Cherries|Pigs|Rug|Elementary Penguin|Hechey Track|Magic Beans|Flamingo Eyedrops/g, '').slice(0, 12);
      assert.ok(apparition.includes(stem.split(' ').slice(0, 2).join(' ')) || line === 'HURRY UP PLEASE ITS TIME', line);
    }
    assert.equal(scionWords({}, () => 0).text, HURRY);
  });
});

describe('the buffs and Elementary Penguin', () => {
  it('purple_journey 90 s, purpled_out 120 s, and the delayed journeys_taken counter', () => {
    assert.match(buffs, /"purple_journey" : \{[\s\S]*?duration\t: 90,/);
    assert.match(buffs, /"purpled_out" : \{[\s\S]*?duration\t: 120,/);
    assert.ok(buffs.includes("pc.events_add({callback: 'achievements_increment_delayed', group: 'essence_of_purple', label: 'journeys_taken'}, 2);"));
    assert.ok(read('players/inc_achievements.js').includes('function achievements_increment_delayed(args) {'));
  });

  it('the journey ending gives Purpled Out and, 2 s later, one journey on the counter', () => {
    const { engine, calls, buffSet } = fakeEngine();
    buffSet.add('purple_journey');
    purpleJourneyFeature.onTick(16, 1000, engine);
    buffSet.delete('purple_journey');
    purpleJourneyFeature.onTick(16, 2000, engine);
    assert.ok(calls.buffs.includes('purpled_out'));
    const at = purpleJourneyFeature._state().counterAt;
    assert.ok(at > 0);
    assert.equal(calls.achievements.length, 0);
    purpleJourneyFeature.onTick(16, at + 1, engine);
    assert.deepEqual(calls.achievements, [`${JOURNEY_COUNTER}=1`]);
  });

  it('Elementary Penguin at three journeys', () => {
    const state = createAchievementState();
    const pc = { imagination: 0, xp: 0, currants: 0, giantFavor: {} };
    applyAchievementProgress(state, JOURNEY_COUNTER, 1, pc);
    applyAchievementProgress(state, JOURNEY_COUNTER, 1, pc);
    assert.equal(state.unlocked.includes('elementary_penguin'), false);
    applyAchievementProgress(state, JOURNEY_COUNTER, 1, pc);
    assert.ok(state.unlocked.includes('elementary_penguin'));
  });

  it('Purple Flower refuses while Purpled Out (purple_flower.js canMunch)', () => {
    assert.ok(read('items/purple_flower.js').includes(`reason: '${PURPLE_TEXT.noMunch}'`));
    const { engine } = fakeEngine({ buffs: ['purpled_out'] });
    assert.deepEqual(purpleJourneyFeature.packUseGate('purple_flower', engine), { ok: false, msg: 'No. Not even a little bit.' });
    assert.equal(purpleJourneyFeature.packUseGate('purple_flower', fakeEngine().engine), null);
    assert.equal(purpleJourneyFeature.packUseGate('spinach', engine), null);
  });
});
