/**
 * Hi signs with your Butler, against players/inc_emotes.js,
 * items/include/butler_emotes.js, items/include/butler_hints.js,
 * groups/hi_variants_tracker.js, config_base.js and the client's Missile.as.
 * Run: node --test tests/hi-signs.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HI,
  HI_ART,
  HI_ART_CELLS,
  HI_EVASION_BADGES,
  HI_TEXT,
  HI_VARIANTS,
  HI_VARIANT_COLORS,
  HI_VARIANT_NAMES,
  MISSILE,
  butlerHiResponse,
  butlerHiResponseDue,
  butlerSaysHi,
  countHeldDailyRecords,
  createMissile,
  evasionActivity,
  evasionBadges,
  expirePlayerHi,
  hiArtSheet,
  hiColor,
  hiDay,
  hiHintDue,
  hidesChatBubble,
  maybeSetEvasionRecord,
  missileMaxSpeed,
  missileSeconds,
  normalizeButlerHi,
  normalizeEvasionRecords,
  normalizePlayerHi,
  playerButlerBonusCounters,
  playerHiVariant,
  playerSaysHi,
  rememberDailyRecord,
  setButlerHiVariant,
  setPlayerHiVariant,
  stepMissile,
} from '../public/js/hi-signs.js';
import { GAME_DAY_MS, GAME_EPOCH_MS } from '../public/js/game-day.js';
import { hiSignsFeature } from '../public/js/features/hi-signs-feature.js?v=g458-3';
import { getAchievementCatalog, loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const NOW = 1_800_000_000_000;
const DAY_START = GAME_EPOCH_MS + hiDay(NOW) * GAME_DAY_MS;
const T = DAY_START + 60_000; // a minute into a game day
const NEXT = DAY_START + GAME_DAY_MS + 60_000; // the next game day
const at = (r) => () => r;

const fresh = () => ({ p: normalizePlayerHi({}), b: normalizeButlerHi({}) });

describe('config (config_base.js 434-464)', () => {
  it('has the eleven variants, their colours and names, and the two moods', () => {
    assert.deepEqual(HI_VARIANTS, ['bats', 'birds', 'butterflies', 'cubes', 'flowers', 'hands', 'hearts', 'hi', 'pigs', 'rocketships', 'stars']);
    assert.equal(HI_VARIANT_COLORS.hearts, '#840607');
    assert.equal(HI_VARIANT_COLORS.stars, '#ffd205');
    assert.equal(HI_VARIANT_NAMES.rocketships, 'Rockets');
    assert.equal(HI_VARIANT_NAMES.hi, 'HI');
    assert.equal(hiColor('butterflies'), 0xce42ab);
    assert.equal(HI.BASE_MOOD, 5);
    assert.equal(HI.BONUS_MOOD, 10);
    assert.equal(HI.RADIUS, 400);
    assert.equal(HI.THROTTLE_MS, 2000);
  });

  it('keeps the Butler lines word for word', () => {
    assert.equal(HI_TEXT.match, 'Neato, we match today!');
    assert.equal(HI_TEXT.responses.length, 6);
    assert.match(HI_TEXT.hint, /^Do you like saying 'Hi'\? It's as easy as pressing '5'/);
  });
});

describe('you say hi to your Butler (doEmote)', () => {
  it('rolls your daily sign the first time, without a Butler near', () => {
    const { p, b } = fresh();
    const out = playerSaysHi(p, b, { now: T, rand: at(0.6), butlerNear: false });
    assert.equal(out.variant, 'hearts');
    assert.equal(out.gotRandomly, true);
    assert.equal(out.butlerTarget, false);
    assert.equal(out.respond, false);
    assert.equal(out.activity, 'You got the daily hi sign "Hearts"!');
    assert.equal(p.count, 1);
    // A second hi the same day keeps the sign and says nothing.
    const again = playerSaysHi(p, b, { now: T + 1000, rand: at(0), butlerNear: false });
    assert.equal(again.variant, 'hearts');
    assert.equal(again.activity, '');
  });

  it('passes your sign to a Butler that has none (no mood for a Butler target)', () => {
    const { p, b } = fresh();
    const out = playerSaysHi(p, b, { now: T, rand: at(0.6), butlerNear: true, butlerLabel: 'Jeeves' });
    assert.equal(out.butlerTarget, true);
    assert.equal(out.infectedButler, true);
    assert.equal(b.variant, 'hearts');
    assert.equal(b.gtDay, hiDay(T));
    assert.equal(out.bonus, false);
    assert.equal(out.respond, true);
    assert.equal(out.activity, 'You got the daily hi sign "Hearts", and passed it on to Jeeves!');
    assert.deepEqual(out.counters, [['infected_butler:hearts', 1], ['hi_variants_butler:hearts', 1]]);
    // Once per sign: the next hi has no target but the Butler still hears it.
    const again = playerSaysHi(p, b, { now: T + 5000, butlerNear: true });
    assert.equal(again.butlerTarget, false);
    assert.equal(again.respond, true);
    assert.deepEqual(again.counters, []);
  });

  it('says "you just passed" when you already had a sign', () => {
    const { p, b } = fresh();
    setPlayerHiVariant(p, 'cubes', T);
    const out = playerSaysHi(p, b, { now: T, butlerNear: true });
    assert.equal(out.activity, 'You just passed your hi sign to Butler, now they have "Cubes"!');
  });

  it('gets the bonus when the Butler said hi to you with the same sign', () => {
    const { p, b } = fresh();
    const said = butlerSaysHi(b, p, { now: T, rand: at(0) });
    assert.equal(said.variant, 'bats');
    const out = playerSaysHi(p, b, { now: T + 3000, butlerNear: true });
    assert.equal(out.variant, 'bats');
    assert.equal(out.bonus, true);
    assert.equal(out.bonusMood, 10);
    assert.equal(out.activity, 'You and Butler have the same hi sign "Bats". Bonus time!');
    assert.deepEqual(playerButlerBonusCounters(), [['hi_jackpot_butler:butler', 1]]);
  });

  it('gets no bonus for a different sign, or when the Butler has not said hi', () => {
    const a = fresh();
    setButlerHiVariant(a.b, 'stars', T);
    setPlayerHiVariant(a.p, 'stars', T);
    assert.equal(playerSaysHi(a.p, a.b, { now: T, butlerNear: true }).bonus, false);
    const c = fresh();
    butlerSaysHi(c.b, c.p, { now: T, rand: at(0) });
    c.p.variant = 'pigs';
    c.p.butlers = {};
    assert.equal(playerSaysHi(c.p, c.b, { now: T, butlerNear: true }).bonus, false);
  });
});

describe('the Butler says hi (doSayHi)', () => {
  it('passes its sign to you, gives 5 mood and remembers you for the game day', () => {
    const { p, b } = fresh();
    const out = butlerSaysHi(b, p, { now: T, rand: at(0.95) });
    assert.equal(out.said, true);
    assert.equal(out.variant, 'stars');
    assert.equal(out.infectedPlayer, true);
    assert.equal(playerHiVariant(p, T), 'stars');
    assert.equal(out.mood, 5);
    assert.equal(out.bonus, false);
    assert.deepEqual(out.counters, [['infected_by_butler:stars', 1]]);
    assert.equal(butlerSaysHi(b, p, { now: T + 60_000 }).reason, 'today');
    assert.equal(butlerSaysHi(b, p, { now: T, busy: true }).reason, 'busy');
  });

  it('keeps your own sign and gives the 15-mood bonus after you said hi with the same one', () => {
    const { p, b } = fresh();
    playerSaysHi(p, b, { now: T, rand: at(0.6), butlerNear: true });
    const out = butlerSaysHi(b, p, { now: T + 2250, rand: at(0) });
    assert.equal(out.infectedPlayer, false);
    assert.equal(out.bonus, true);
    assert.equal(out.mood, 0);
    assert.equal(out.bonusMood, 15);
  });

  it('takes a new sign on a new game day', () => {
    const { p, b } = fresh();
    butlerSaysHi(b, p, { now: T, rand: at(0) });
    assert.equal(b.variant, 'bats');
    const out = butlerSaysHi(b, p, { now: NEXT, rand: at(0.7) });
    assert.equal(out.said, true);
    assert.equal(b.variant, 'hi');
    assert.equal(b.gtDay, hiDay(NEXT));
    // Yesterday's sign is gone, so you catch today's.
    assert.equal(out.infectedPlayer, true);
    assert.equal(playerHiVariant(p, NEXT), 'hi');
    assert.deepEqual(Object.keys(b.pcsYesterday), ['pc']);
  });

  it('answers your hi once per game day, matching or with one of six lines', () => {
    const { p, b } = fresh();
    assert.equal(butlerHiResponseDue(b, T), true);
    assert.equal(butlerHiResponseDue(b, T + 1000), false);
    assert.equal(butlerHiResponseDue(b, NEXT), true);
    setButlerHiVariant(b, 'pigs', T);
    setPlayerHiVariant(p, 'pigs', T);
    assert.equal(butlerHiResponse(b, p, { now: T }), 'Neato, we match today!');
    p.variant = 'rocketships';
    assert.equal(butlerHiResponse(b, p, { now: T, rand: at(0), label: 'friend' }), 'Oh, thank you friend.');
    // The source prints the variant id, not its name.
    assert.equal(butlerHiResponse(b, p, { now: T, rand: at(0.2) }), "Ah, you have rocketships today. That's auspicious!");
    assert.equal(butlerHiResponse(b, p, { now: T, rand: at(0.99) }), 'Hello, Hi-master.');
  });

  it('hints about the 5 key only to someone who never said hi', () => {
    const { p, b } = fresh();
    assert.equal(hiHintDue(p), true);
    playerSaysHi(p, b, { now: T });
    assert.equal(hiHintDue(p), false);
  });
});

describe('daily rotation (doNewDay, setHiEmoteVariant)', () => {
  it('your sign ends at the game-day boundary', () => {
    const { p } = fresh();
    setPlayerHiVariant(p, 'flowers', T);
    assert.equal(playerHiVariant(p, DAY_START + GAME_DAY_MS - 1), 'flowers');
    assert.equal(playerHiVariant(p, DAY_START + GAME_DAY_MS), '');
    assert.equal(expirePlayerHi(p, NEXT), true);
    assert.equal(p.variant, '');
  });

  it('a new sign starts the targets over and keeps yesterday’s', () => {
    const { p, b } = fresh();
    playerSaysHi(p, b, { now: T, butlerNear: true });
    assert.ok(p.butlers.butler);
    const out = playerSaysHi(p, b, { now: NEXT, rand: at(0.1), butlerNear: true });
    assert.equal(out.gotRandomly, true);
    assert.equal(out.butlerTarget, true);
    assert.ok(p.butlersYesterday.butler);
  });

  it('round-trips both states and repairs bad values', () => {
    const p = normalizePlayerHi({ variant: 'bats', variantDay: 7, butlers: { butler: 5, 'x y': 'z' }, count: 3, records: [{ day: 7, tsid: 'RH_HOME_EXT' }, { day: 'q' }], bestEvasion: 12 });
    assert.deepEqual(normalizePlayerHi(JSON.parse(JSON.stringify(p))), p);
    assert.deepEqual(p.butlers, { butler: 5 });
    assert.equal(p.records.length, 1);
    assert.equal(normalizePlayerHi({ variant: 'dongs' }).variant, '');
    assert.deepEqual(normalizeButlerHi(undefined), { variant: '', gtDay: -1, pcs: {}, pcsYesterday: {}, responseDay: -1 });
  });
});

describe('the missile (Missile.as, ALGO_VERSION 10)', () => {
  it('starts at 250 px/s, adds 40 a second after the first, up to vx_max + 190', () => {
    assert.equal(MISSILE.ALGO_VERSION, 10);
    const m = createMissile({ x: 0, y: 0 });
    const far = { x: 1e9, y: 0 };
    const speeds = [];
    for (let i = 1; i <= 1000; i += 1) {
      stepMissile(m, 10, far, { vxMax: 335 });
      if (i % 100 === 50) speeds.push(Math.round(m.pxPerSec));
    }
    // Sampled half way through seconds 0-9: no add-in until two whole seconds have run.
    assert.deepEqual(speeds, [250, 250, 290, 330, 370, 410, 450, 490, 525, 525]);
    assert.equal(missileMaxSpeed(m, { vxMax: 335 }), 525);
  });

  it('slows while its target jumps up, never under 250', () => {
    const m = createMissile({ x: 0, y: 0 });
    m.ms = 8000;
    let y = 0;
    for (let i = 0; i < 30; i += 1) {
      y -= 8;
      stepMissile(m, 17, { x: 1e9, y }, { vxMax: 335 });
    }
    assert.ok(m.slow > 100);
    assert.ok(m.pxPerSec >= 250 && m.pxPerSec < 525);
    for (let i = 0; i < 200; i += 1) stepMissile(m, 17, { x: 1e9, y }, { vxMax: 335 });
    assert.ok(m.slow < 5);
  });

  it('lands on a still target and counts the seconds it flew', () => {
    const m = createMissile({ x: 0, y: 0 });
    let n = 0;
    while (!m.arrived && n < 1000) {
      stepMissile(m, 1000 / 60, { x: 300, y: 0 }, { vxMax: 335 });
      n += 1;
    }
    assert.equal(m.arrived, true);
    assert.equal(missileSeconds(m), 1);
    assert.equal(missileSeconds({ ms: 10_500 }), 11);
  });
});

describe('evasion (doHiEmoteMissileHit, maybe_set_evasion_record, the tracker)', () => {
  it('grants the four evasion badges at 11, 61, 151 and 311 seconds', () => {
    assert.deepEqual(HI_EVASION_BADGES.map((b) => [b.secs, b.id]), [[11, 'hi_flyer'], [61, 'hi_speed_chase'], [151, 'hi_as_a_kite'], [311, 'hi_velocity']]);
    assert.deepEqual(evasionBadges(10), []);
    assert.deepEqual(evasionBadges(11), ['hi_flyer']);
    assert.deepEqual(evasionBadges(400), ['hi_flyer', 'hi_speed_chase', 'hi_as_a_kite', 'hi_velocity']);
  });

  it('sets, then breaks or ties the records, the daily message winning', () => {
    const slot = normalizeEvasionRecords({});
    const first = maybeSetEvasionRecord(slot, { secs: 12, label: 'you', now: T });
    assert.equal(first.status, 'set_daily');
    assert.equal(first.alltime, true);
    assert.equal(first.msg, "12 seconds set today's hi sign evasion record for this location!");
    assert.equal(slot.alltime.secs, 12);
    const tie = maybeSetEvasionRecord(slot, { secs: 12, label: 'you', now: T + 1000 });
    assert.equal(tie.status, 'tied_daily');
    assert.equal(maybeSetEvasionRecord(slot, { secs: 11, now: T + 2000 }).status, 'fail');
    // The next day: no daily record yet, so it is set even below the all-time one.
    const next = maybeSetEvasionRecord(slot, { secs: 10, label: 'you', now: NEXT });
    assert.equal(next.status, 'set_daily');
    assert.equal(next.alltime, false);
    assert.equal(slot.alltime.secs, 12);
    const broke = maybeSetEvasionRecord(slot, { secs: 20, label: 'you', now: NEXT + 1000 });
    assert.equal(broke.msg, "20 seconds broke today's hi sign evasion record of 10 seconds for this location, set by you!");
    assert.equal(slot.alltime.secs, 20);
    assert.equal(maybeSetEvasionRecord(slot, { secs: 30, version: 9 }).status, 'fail');
  });

  it('words the evasion line like the source', () => {
    assert.equal(evasionActivity(4, null), '');
    assert.equal(evasionActivity(7, null), 'You evaded that hi sign for 7 seconds!');
    assert.equal(evasionActivity(12, { status: 'set_daily', msg: "12 seconds set the <b>ALL TIME</b> record" }, 'Your'), 'Your 12 seconds set the ALL TIME record');
  });

  it('counts the daily records you held in the last four game days at your new day', () => {
    const p = normalizePlayerHi({});
    rememberDailyRecord(p, 'RH_HOME_EXT', T);
    rememberDailyRecord(p, 'RH_HOME_EXT', T + 1000);
    assert.equal(p.records.length, 1);
    // At the next day the tracker keeps that day and the three before it.
    p.records.push({ day: hiDay(T) - 2, tsid: 'RH_HOME_EXT' }, { day: hiDay(T) - 3, tsid: 'RH_HOME_EXT' });
    assert.equal(countHeldDailyRecords(p, NEXT), 2);
    assert.equal(p.records.length, 0);
  });

  it('names badges the catalog has, with their source rewards', async () => {
    await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
    const cat = getAchievementCatalog();
    assert.deepEqual(cat.hi_flyer.rewards, { xp: 200, favor: { giant: 'lem', points: 20 } });
    assert.equal(cat.hi_as_a_kite.name, 'Hi Velocity');
    assert.equal(cat.hi_velocity.name, 'The Motorboat');
    for (const id of ['daily_hi_skipper', 'social_hi_skipper', 'antisocial_hi_skipper', 'long_distance_hi_skipper', 'endurance_hi_skipper']) {
      assert.equal(cat[id].conditions[0].group, 'daily_evasion_record');
      assert.equal(cat[id].conditions[0].name, 'held');
    }
  });
});

describe('art (CC0 OGA hi_overlays)', () => {
  const webpSize = (file) => {
    const b = readFileSync(file);
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
    }
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  };

  it('ships the overlay, icon and 2x sheet of every variant, cut to their cells', () => {
    for (const v of HI_VARIANTS) {
      for (const kind of ['hi', 'still', 'bonus']) {
        const s = hiArtSheet(v, kind);
        const file = join(PUBLIC, s.url);
        assert.ok(existsSync(file), file);
        const [w, h] = webpSize(file);
        assert.equal(w, s.w * s.cols, `${v} ${kind} width`);
        assert.ok(h >= s.h * Math.ceil(s.frames / s.cols) && h % s.h === 0, `${v} ${kind} height ${h}`);
      }
      assert.ok(HI_ART_CELLS[v][2] > 0 && HI_ART_CELLS[v][3] > 0);
    }
    assert.equal(HI_ART.HI_FRAMES, 65);
    assert.equal(HI_ART.BONUS_FRAMES, 37);
  });
});

describe('hi-signs feature', () => {
  it('saves your sign and counts held daily records at the new day', () => {
    hiSignsFeature._reset();
    hiSignsFeature.restore({ variant: 'bats', variantDay: hiDay(T), count: 2, records: [{ day: hiDay(T), tsid: 'RH_HOME_EXT' }] });
    assert.equal(hiSignsFeature.save().count, 2);
    const calls = [];
    const engine = { achievement: (c, n) => calls.push([c, n]), save() {}, setData() {}, pc: { mood: 0 } };
    hiSignsFeature.onNewDay(NEXT, engine);
    assert.deepEqual(calls, [['daily_evasion_record:held', 1]]);
    assert.equal(hiSignsFeature.save().variant, '');
    assert.equal(hiSignsFeature.save().records.length, 0);
  });

  it('is registered with one import line and binds the 5 key', () => {
    const index = readFileSync(join(PUBLIC, 'js/features/index.js'), 'utf8');
    assert.match(index, /import \{ hiSignsFeature \} from '\.\/hi-signs-feature\.js\?v=g458-3'; FEATURES\.push\(hiSignsFeature\);/);
    const src = readFileSync(join(PUBLIC, 'js/features/hi-signs-feature.js'), 'utf8');
    assert.match(src, /e\.code === 'Digit5' \|\| e\.code === 'Numpad5'/);
    assert.match(src, /butler-feature\.js\?v=g458-3/);
  });
});

describe('a chat line that is just "hi" (RightSideManager.as 232-235, Emotes.as 53-54)', () => {
  const CLIENT = join(ROOT, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'port');

  it('hides the bubble for "hi" in any case, trimmed like the server echo', () => {
    for (const line of ['hi', 'Hi', 'HI', 'hI', ' hi ', '\thi']) assert.equal(hidesChatBubble(line), true, JSON.stringify(line));
    for (const line of ['hi!', 'hi.', 'hii', 'hi there', 'h i', 'hey', 'hello', '', null]) assert.equal(hidesChatBubble(line), false, JSON.stringify(line));
  });

  it('keeps the hi sign and only drops the bubble over the speaker in game.js', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    assert.match(game, /import \{ hidesChatBubble \} from '\.\/js\/hi-signs\.js\?v=hi-signs-4';/);
    const say = game.slice(game.indexOf('function sayLocalChat('), game.indexOf('function finishAssistedFeatChain('));
    assert.ok(say.indexOf('showLocalChatBubble(') < say.indexOf('hidesChatBubble(text)'), 'the Local chat dock (the pane) keeps the line');
    assert.match(say, /if \(hidesChatBubble\(text\)\) \{[^}]*\} else if \(participant === 'Ur'\) \{\s*showSpeechBubble/);
    const feature = readFileSync(join(PUBLIC, 'js/features/hi-signs-feature.js'), 'utf8');
    assert.match(feature, /String\(input\?\.value \|\| ''\)\.toLowerCase\(\) === 'hi'\) sayHi\(eng\)/, 'the hi itself still goes');
  });

  it('matches the client source', { skip: !existsSync(CLIENT) && 'glitch-client not present' }, () => {
    const rsm = readFileSync(join(CLIENT, 'RightSideManager.as'), 'utf8');
    assert.match(rsm, /if \(txt\.toLowerCase\(\) != 'hi'\) \{\s*avatar\.chatBubbleManager\.showBubble/);
    const emotes = readFileSync(join(CLIENT, 'Emotes.as'), 'utf8');
    assert.match(emotes, /txt\.toLowerCase\(\) == EMOTE_TYPE_HI/);
  });
});
