/**
 * G327: the viral Hi between real players, the Hi sign leaderboard and the
 * powders that spread. The pure client side (js/hi-signs-mp.js), the
 * multiplayer branches of features/hi-signs-feature.js and
 * features/powders-feature.js on a fake realtime client, the badges the
 * server's counters earn, the server's tables and copy against the game's
 * (hi.go in groddle-afternoon-server; skips without it), and that solo is
 * untouched.
 * Run: node --test tests/g327-mp.test.js
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BOARD_TEXT,
  POWDER_MP_TEXT,
  SPREAD_POWDERS,
  boardRows,
  counterRows,
  grantIds,
  normalizeHiState,
  normalizeWinner,
  powderCaughtLine,
  powderRefusedLine,
  powderRefusedSound,
  recordLine,
  yesterdayLine,
  yourSignLine,
} from '../public/js/hi-signs-mp.js?v=g327-1';
import { HI_VARIANTS, HI_VARIANT_COLORS, HI_VARIANT_NAMES, hiDay } from '../public/js/hi-signs.js';
import { hiSignsFeature } from '../public/js/features/hi-signs-feature.js?v=g446-1';
import { powdersFeature, runPowder } from '../public/js/features/powders-feature.js?v=g441-1';
import { addItem, countItem } from '../public/js/inventory.js?v=catalog-unified-7';
import { applyAchievementProgress, createAchievementState, getAchievementProgress, seedAchievementNearCompletion } from '../public/js/achievements.js?v=g403-1';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';
import { HAS_SERVER, serverPath } from '../tools/repos.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

before(async () => {
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    players: [{ id: 2, name: 'Bo' }],
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return this.state === 'online'; },
    take(kind) { const out = sent.filter((m) => m.t === kind); sent.length = 0; return out; },
  };
}

/** The bits of game.js's engine the two features touch, in multiplayer or solo. */
function fakeEngine({ mode = 'multiplayer', client = null, ...over } = {}) {
  const calls = { activity: [], achievements: [], grants: [], sounds: [], buffs: [], drops: [], toasts: [] };
  const data = {};
  const buffs = new Set();
  const engine = {
    mode,
    started: true,
    inv: {},
    pc: { energy: 50, mood: 40, energyMax: 100, moodMax: 100 },
    player: { x: 500, y: 400 },
    interactables: [],
    unlockedAchievements: [],
    query: (name, ...args) => (name === 'realtimeClient' ? client : name === 'realtimeHidden' ? false : null),
    hasBuff: (id) => buffs.has(id),
    applyBuff: (id) => { buffs.add(id); calls.buffs.push(id); return { ok: true }; },
    removeBuff: (id) => buffs.delete(id),
    achievement: (counter, amount = 1) => calls.achievements.push([counter, amount]),
    grantAchievement: (id) => calls.grants.push(id),
    playSound: (key) => calls.sounds.push(key),
    pushActivity: (text) => calls.activity.push(text),
    toast: (text) => calls.toasts.push(text),
    refreshPack() {},
    updateHud() {},
    save() {},
    setData: (k, v) => { data[k] = v; },
    param: () => null,
    floatText() {},
    dropWorldStack: (classTsid, count, x, y) => calls.drops.push({ classTsid, count, x, y }),
    ...over,
  };
  return { engine, calls, data, buffs };
}

const pcFor = () => ({ imagination: 0, xp: 0, currants: 0, giantFavor: {} });
function earns(id, rows) {
  const near = createAchievementState();
  seedAchievementNearCompletion(near, id, 1);
  assert.equal(near.unlocked.includes(id), false, `${id} not yet`);
  for (const [c, n] of rows) applyAchievementProgress(near, c, n, pcFor());
  return near.unlocked.includes(id);
}

describe('hi-signs-mp: what the server sends', () => {
  it('keeps a hi_state to the signs, the board and yesterday', () => {
    const st = normalizeHiState({ day: 7, variant: 'bats', butler: 'nope', board: { bats: 2, dongs: 5 }, yesterday: { variant: 'pigs', count: 4, top: { id: 9, name: 'Bo\u0007', count: 3, variant: 'pigs' } }, held: 2 });
    assert.equal(st.variant, 'bats');
    assert.equal(st.butler, '', 'not a sign');
    assert.equal(st.board.bats, 2);
    assert.equal(st.board.dongs, undefined);
    assert.equal(Object.keys(st.board).length, 11);
    assert.deepEqual(st.yesterday.top, { id: 9, name: 'Bo', count: 3, variant: 'pigs' });
    assert.equal(st.held, 2);
    assert.equal(normalizeHiState(null).variant, '');
  });

  it('orders the board as HiLeaderboard.as does: most first, then by sign', () => {
    const rows = boardRows({ stars: 3, bats: 3, pigs: 5 });
    assert.deepEqual(rows.slice(0, 4).map((r) => `${r.variant}:${r.count}`), ['pigs:5', 'bats:3', 'stars:3', 'birds:0']);
    assert.equal(rows.length, 11);
    assert.equal(rows.find((r) => r.variant === 'rocketships').name, 'Rockets');
  });

  it('words the panel from HiLeaderboard.as (with only the 5 key)', () => {
    assert.equal(BOARD_TEXT.title, 'Hi sign leaderboard');
    assert.equal(yourSignLine('hi'), 'Your daily hi sign: HI');
    assert.equal(yourSignLine(''), "You don't have a daily hi sign yet!");
    assert.equal(yesterdayLine({ variant: 'pigs', count: 4, top: { id: 9, name: 'Bo', count: 3, variant: 'pigs' } }), 'Yesterday: Top spreader: Bo (3 pigs)');
    assert.equal(yesterdayLine({ variant: 'pigs', count: 4 }), 'Yesterday: Pigs');
    assert.equal(yesterdayLine({}), 'There was no winner yesterday!');
    assert.equal(normalizeWinner({ top: { id: 0 } }).top, null);
    assert.doesNotMatch(BOARD_TEXT.desc + BOARD_TEXT.instruct, /"H"/);
  });

  it('reads the record line the street hears (feature_report_hi_records)', () => {
    assert.equal(recordLine('Bo', '12 seconds set the <b>ALL TIME</b> hi sign evasion record for this location!'), "Bo's 12 seconds set the ALL TIME hi sign evasion record for this location!");
  });

  it('only takes counters and badges that look like ones', () => {
    assert.deepEqual(counterRows([['hi_variants:bats', 1], ['hi_jackpot:12', 1], ['bad', 1], ['x:y', -1], 'no']), [['hi_variants:bats', 1], ['hi_jackpot:12', 1]]);
    assert.deepEqual(grantIds(['hi_and_mighty', '<script>']), ['hi_and_mighty']);
  });

  it('words the powders as the item code does', () => {
    assert.deepEqual([...SPREAD_POWDERS], ['sneezing_powder', 'sparkle_powder']);
    assert.equal(powderCaughtLine('sneezing_powder', 'Ada'), 'Ada scattered a sneezing powder. How hilarious.');
    assert.match(powderCaughtLine('sparkle_powder', 'Ada', 20), /^Ada sprinkled a Sparkle Powder\. The air fills with energizing.* assails you\. You \+20 Mood\.$/);
    assert.equal(powderRefusedLine('sneezing_powder', 'crowd'), 'Really? Really?! Why be SUCH a jerk??');
    assert.equal(powderRefusedLine('sparkle_powder', 'crowd'), "There ain't enough sparkle in the jar for this many people.");
    assert.equal(powderRefusedSound('sneezing_powder', 'crowd'), 'HORRIBLE_SOUND');
    assert.equal(powderRefusedSound('sparkle_powder', 'crowd'), 'CLICK_FAILURE');
    assert.equal(powderRefusedSound('sparkle_powder', 'slow'), '');
  });
});

describe('the badges the server counts toward', () => {
  it('hi_jackpot (one per Mega-Hi) earns Hi Baller, Hi Priest, Master of the Hi Coup', () => {
    for (const id of ['hi_baller', 'hi_priest', 'master_of_the_hi_coup']) assert.ok(earns(id, [['hi_jackpot:42', 1]]), id);
  });

  it('hi_variants (one per sign greeted with) earns Member of Hi Society at all eleven', () => {
    const st = createAchievementState();
    for (const v of HI_VARIANTS) applyAchievementProgress(st, `hi_variants:${v}`, 1, pcFor());
    assert.ok(st.unlocked.includes('member_of_hi_society'));
    const ten = createAchievementState();
    for (const v of HI_VARIANTS.slice(0, 10)) applyAchievementProgress(ten, `hi_variants:${v}`, 1, pcFor());
    assert.equal(ten.unlocked.includes('member_of_hi_society'), false);
    assert.ok(getAchievementProgress(ten, 'member_of_hi_society'));
  });

  it('powders:sneezeorama and powders:sparkle_buddy earn their badges', () => {
    assert.ok(earns('sneezeorama', [['powders:sneezeorama', 1]]));
    assert.ok(earns('sparkle_buddy', [['powders:sparkle_buddy', 1]]));
  });
});

describe('hi signs in multiplayer (features/hi-signs-feature.js)', () => {
  let client;
  let f;
  beforeEach(() => {
    hiSignsFeature._reset();
    client = fakeClient();
    f = fakeEngine({ client });
    hiSignsFeature._attachMp(f.engine, client);
  });

  it('asks for the day on attach and takes the server\'s signs, acking held records', () => {
    assert.equal(client.take('hi_sync').length, 1);
    client.msg({ t: 'hi_state', day: hiDay(Date.now()), variant: 'cubes', butler: 'stars', board: { cubes: 4 }, yesterday: {}, held: 2 });
    assert.equal(hiSignsFeature.save().variant, 'cubes');
    assert.deepEqual(f.calls.achievements, [['daily_evasion_record:held', 2]]);
    assert.deepEqual(client.take('hi_ack'), [{ t: 'hi_ack', held: 2 }]);
    assert.equal(hiSignsFeature._mp().mp.butler, 'stars');
    assert.equal(f.data.hiBoard, 'cubes:4');
  });

  it('sends hi_say on the 5 key and never rolls a sign itself', () => {
    client.take('hi_sync');
    assert.equal(hiSignsFeature._sayHi(f.engine, { force: true }), 'hi:asked');
    assert.deepEqual(client.take('hi_say'), [{ t: 'hi_say' }]);
    assert.equal(hiSignsFeature.save().variant, '', 'the sign waits for the server');
    client.msg({ t: 'hi_said', variant: 'birds', random: true, target: { id: 2, name: 'Bo' }, infected: true, bonus: false, mood: 5,
      counters: [['infected_pc:birds', 1], ['hi_variants:birds', 1]], grant: ['social_butterfly'], activity: 'You got the daily hi sign "Birds", and passed it on to Bo!' });
    assert.equal(hiSignsFeature.save().variant, 'birds');
    assert.equal(hiSignsFeature.save().count, 1);
    assert.deepEqual(f.calls.achievements, [['infected_pc:birds', 1], ['hi_variants:birds', 1]]);
    assert.deepEqual(f.calls.grants, ['social_butterfly']);
    assert.deepEqual(f.calls.activity, ['You got the daily hi sign "Birds", and passed it on to Bo!']);
    assert.ok(f.calls.sounds.includes('HI_FLOWERS'), 'a shard flies');
    assert.equal(f.data.hiLast, 'hi:birds:random:pc:2:infected');
  });

  it('says it cannot while offline', () => {
    client.state = 'offline';
    assert.equal(hiSignsFeature._sayHi(f.engine, { force: true }), 'hi:offline');
    assert.equal(client.take('hi_say').length, 0);
    assert.equal(f.calls.toasts.length, 1);
  });

  it('takes the sign and the mood a hi brings, and reports its missile when it lands', () => {
    client.msg({ t: 'hi_got', from: { id: 2, name: 'Bo' }, variant: 'pigs', infected: true, bonus: false, mood: 5,
      counters: [['infected_by_pc:pigs', 1]], activity: 'Bo just passed their daily hi sign to you: you\'ve got "Pigs"! Say "hi" back with the "5" key and get a bonus!' });
    assert.equal(hiSignsFeature.save().variant, 'pigs');
    assert.equal(f.engine.pc.mood, 45);
    assert.deepEqual(f.calls.achievements, [['infected_by_pc:pigs', 1]]);
    assert.equal(hiSignsFeature._mp().mp.moodFrom.get(2), 5);
  });

  it('adds the bonus mood and counts the jackpot', () => {
    client.msg({ t: 'hi_bonus', variant: 'bats', color: '#353535', other: { id: 2, name: 'Bo' }, mood: 15, counters: [['hi_jackpot:2', 1]], grant: ['hi_and_mighty'] });
    assert.equal(f.engine.pc.mood, 55);
    assert.deepEqual(f.calls.achievements, [['hi_jackpot:2', 1]]);
    assert.deepEqual(f.calls.grants, ['hi_and_mighty']);
  });

  it('grants the evasion badges the server checked and reads its lines', () => {
    client.msg({ t: 'hi_evaded', secs: 12, grant: ['hi_flyer'], record: 'set_daily' });
    client.msg({ t: 'hi_record', id: 1, name: 'Ada', msg: "12 seconds set today's hi sign evasion record for this location!" });
    assert.deepEqual(f.calls.grants, ['hi_flyer']);
    assert.deepEqual(f.calls.activity, ["Ada's 12 seconds set today's hi sign evasion record for this location!"]);
  });

  it('keeps the board and yesterday\'s winner as they come', () => {
    client.msg({ t: 'hi_board', board: { hearts: 3, bats: 1 } });
    assert.equal(f.data.hiBoard, 'bats:1,hearts:3');
    client.msg({ t: 'hi_winner', yesterday: { variant: 'hearts', count: 3, top: null } });
    assert.equal(f.data.hiYesterday, 'Yesterday: Hearts');
  });
});

describe('hi signs in solo are untouched', () => {
  it('rolls the sign itself and sends nothing', () => {
    hiSignsFeature._reset();
    const client = fakeClient();
    const f = fakeEngine({ mode: 'solo', client });
    const out = hiSignsFeature._sayHi(f.engine, { force: true });
    assert.match(out, /^hi:[a-z]+:random$/);
    assert.equal(client.sent.length, 0);
    assert.ok(HI_VARIANTS.includes(hiSignsFeature.save().variant));
  });
});

describe('powders that spread in multiplayer (features/powders-feature.js)', () => {
  let client;
  let f;
  beforeEach(() => {
    powdersFeature._reset();
    client = fakeClient();
    f = fakeEngine({ client });
    powdersFeature._attachMp(f.engine, client);
  });

  it('asks the server before Sprinkle, then runs the jar and counts Sparkle Buddy', () => {
    addItem(f.engine.inv, 'sparkle_powder', 1);
    assert.equal(runPowder(f.engine, 'sparkle_powder'), 'sparkle_powder:asked');
    assert.deepEqual(client.take('powder_spread'), [{ t: 'powder_spread', cls: 'sparkle_powder' }]);
    assert.equal(f.engine.pc.energy, 50, 'nothing used yet');
    assert.equal(runPowder(f.engine, 'sparkle_powder'), null, 'one ask at a time');
    client.msg({ t: 'powder_spread', cls: 'sparkle_powder', ok: true, players: 7, counters: [['powders:sparkle_buddy', 1]] });
    assert.equal(f.engine.pc.energy, 30);
    assert.equal(f.engine.pc.mood, 50);
    assert.deepEqual(f.calls.achievements.filter(([c]) => c === 'powders:sparkle_buddy'), [['powders:sparkle_buddy', 1]]);
    assert.equal(powdersFeature.save().charges.sparkle_powder, 4);
  });

  it('refuses in a crowd with the source\'s words, using nothing, and splanks for sneezing', () => {
    addItem(f.engine.inv, 'sneezing_powder', 1);
    runPowder(f.engine, 'sneezing_powder');
    client.msg({ t: 'powder_spread', cls: 'sneezing_powder', ok: false, why: 'crowd' });
    assert.deepEqual(f.calls.activity, [POWDER_MP_TEXT.crowdSneeze]);
    assert.ok(f.calls.sounds.includes('HORRIBLE_SOUND'));
    assert.equal(countItem(f.engine.inv, 'sneezing_powder'), 1);
    assert.equal(powdersFeature.save().charges.sneezing_powder, undefined);
    powdersFeature._flush();
    assert.equal(f.engine.pc.mood, 10, 'three drops of 10');
  });

  it('catches another player\'s powders: the Sneezing buff, or +20 mood', () => {
    client.msg({ t: 'powder_caught', cls: 'sneezing_powder', from: { id: 2, name: 'Bo' } });
    assert.deepEqual(f.calls.buffs, ['sneezing']);
    assert.deepEqual(f.calls.activity, ['Bo scattered a sneezing powder. How hilarious.']);
    client.msg({ t: 'powder_caught', cls: 'sparkle_powder', from: { id: 2, name: 'Bo' } });
    assert.equal(f.engine.pc.mood, 60);
    assert.match(f.calls.activity[1], /^Bo sprinkled a Sparkle Powder\..* You \+20 Mood\.$/);
  });

  it('sneezes when the server says, and the last one drops the bean', () => {
    client.msg({ t: 'powder_sneeze', id: 1, last: false });
    assert.deepEqual(f.calls.activity, [POWDER_MP_TEXT.sneeze]);
    client.msg({ t: 'powder_sneeze', id: 1, last: true });
    assert.equal(f.calls.activity[1], POWDER_MP_TEXT.lastSneeze);
    assert.deepEqual(f.calls.drops, [{ classTsid: 'bean_plain', count: 1, x: 500, y: 399 }]);
    assert.equal(f.calls.sounds.filter((s) => s === 'SNEEZING_AHCHOO').length, 2);
    client.msg({ t: 'powder_sneeze', id: 2, last: true });
    assert.equal(f.calls.drops.length, 1, 'another player\'s bean is theirs');
  });

  it('in solo, Sprinkle runs at once and asks nobody', () => {
    powdersFeature._reset();
    const solo = fakeEngine({ mode: 'solo', client });
    addItem(solo.engine.inv, 'sparkle_powder', 1);
    assert.equal(runPowder(solo.engine, 'sparkle_powder'), 'sparkle_powder:sprinkle');
    assert.equal(client.take('powder_spread').length, 0);
  });
});

const skipServer = HAS_SERVER ? false : 'no groddle-afternoon-server checkout';

describe('hi.go agrees with the game', { skip: skipServer }, () => {
  const go = HAS_SERVER ? readFileSync(serverPath('hi.go'), 'utf8') : '';

  it('has the same eleven signs, names and colours (config_base.js 435-461)', () => {
    const list = /var hiVariants = \[\]string\{([^}]*)\}/.exec(go)[1].match(/"([a-z]+)"/g).map((s) => s.slice(1, -1));
    assert.deepEqual(list, HI_VARIANTS);
    for (const v of HI_VARIANTS) {
      assert.match(go, new RegExp(`"${v}": "${HI_VARIANT_NAMES[v]}"`), `${v} name`);
      assert.match(go, new RegExp(`"${v}": "${HI_VARIANT_COLORS[v]}"`), `${v} colour`);
    }
  });

  it('keeps the source\'s numbers and lines', () => {
    for (const re of [/hiBaseMood\s+= 5\b/, /hiBonusMood\s+= 10\b/, /hiRadius\s+= 400\.0/, /hiButterflyCount = 53\b/, /hiMightyCount\s+= 17\b/,
      /powderSneezeMax\s+= 15\b/, /powderSparkleMax\s+= 10\b/, /powderSneezeRama\s+= 5\b/, /powderSparkleBud\s+= 7\b/]) assert.match(go, re);
    assert.match(go, /"You evaded that hi sign for " \+ strconv\.Itoa\(msg\.Secs\) \+ " seconds!"/);
    assert.match(go, /\{11, "hi_flyer"\}, \{61, "hi_speed_chase"\}, \{151, "hi_as_a_kite"\}, \{311, "hi_velocity"\}/);
    assert.match(go, / have the same hi sign "` \+ name \+ `"\. Bonus time!/);
  });

  it('registers itself and lists its kinds in its header', () => {
    assert.match(go, /func init\(\) \{ modules = append\(modules, newHi\) \}/);
    for (const kind of ['hi_sync', 'hi_say', 'hi_caught', 'hi_hit', 'hi_ack', 'hi_board', 'powder_spread']) {
      assert.match(go, new RegExp(`r\\.Handle\\("${kind}"`), kind);
      assert.match(go, new RegExp(`\\{"t":"${kind}"`), `${kind} in the header`);
    }
    for (const kind of ['hi_state', 'hi_said', 'hi_emoted', 'hi_got', 'hi_bonus', 'hi_board', 'hi_winner', 'hi_evaded', 'hi_record', 'powder_caught', 'powder_sneeze']) {
      assert.match(go, new RegExp(`"t": "${kind}"`), `${kind} sent`);
      const feature = kind.startsWith('powder') ? read('public/js/features/powders-feature.js') : read('public/js/features/hi-signs-feature.js');
      assert.match(feature, new RegExp(`msg:${kind}`), `${kind} heard`);
    }
  });
});
