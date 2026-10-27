/**
 * Following another real player in multiplayer (registers G329's left-outs
 * and G334): the words and menu entries (js/follow-mp.js), the world side
 * (features/follow-mp-feature.js) driven by the server's messages through a
 * fake client and engine, Three's a Cloud moving into the multiplayer quests
 * with its credit, and that solo is untouched. The server's rules are its own
 * tests (groddle-afternoon-server follow_test.go).
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FOLLOW_COUNTERS,
  FOLLOW_STOP_VERB,
  FOLLOW_TEXT,
  FOLLOW_TRAIL_DISTANCE,
  FOLLOW_VERB,
  GLITCH_TRAIN_LENGTH,
  STALKER_ACHIEVEMENT_ID,
  endedText,
  followArrival,
  followVelocity,
  followVerbs,
  isFollowInputKey,
  listNames,
  refusedText,
  teleportCounters,
  teleportKindOf,
} from '../public/js/follow-mp.js?v=follow-1';
import { followMpFeature } from '../public/js/features/follow-mp-feature.js?v=follow-1';
import { COMPANION_FOLLOW_TRAIL_DISTANCE } from '../public/js/local-companions.js?v=street-players-4';
import { loadContentCatalogsFromDir, getQuestCatalog, getAchievementCatalog } from '../public/js/content-catalogs.js';
import { createQuestState } from '../public/js/quests.js';
import { pendingQuestOffers } from '../public/js/quest-offers.js';
import { MULTIPLAYER_QUESTS, MULTIPLAYER_QUESTS_LEFT_OUT, creditedMultiplayerQuests } from '../public/js/quests-mp.js?v=g329-5';
import { questsMpFeature } from '../public/js/features/quests-mp-feature.js?v=g329-5';
import { economyCredits } from '../tools/build-economy.mjs';
import { tradeTable } from '../tools/build-realtime-trade.mjs';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const CLOUD = 'teleportation_teleport_with_followers';

before(async () => {
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

function fakeClient(me = 1) {
  const listeners = new Map();
  const sent = [];
  return {
    me: { id: me, name: 'Ada' },
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    send(kind, payload) { sent.push([kind, payload]); return true; },
  };
}

/** A window that only collects key listeners (the feature listens for input). */
const keyListeners = [];
globalThis.window ??= { addEventListener: (type, fn) => { if (type === 'keydown') keyListeners.push(fn); } };
const press = (key) => { for (const fn of keyListeners) fn({ key, target: null }); };

function fakeEngine(client, over = {}) {
  const log = { prompts: [], removed: [], activity: [], toasts: [], travels: [], achievements: [], flags: [], granted: [], buffs: new Set(), resets: [], data: {} };
  const remotes = new Map();
  globalThis.groddleRealtime = { remotes };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GA5A',
    player: { x: 100, y: -100, vx: 0, vxMax: 4.4 },
    unlockedAchievements: [],
    log,
    remotes,
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'followReady') return followMpFeature.followReady(...args);
      return null;
    },
    prompt(opts) { log.prompts.push(opts); return `p${log.prompts.length}`; },
    removePrompt(uid) { log.removed.push(uid); },
    pushActivity(text) { log.activity.push(text); },
    toast(text) { log.toasts.push(text); },
    setData(k, v) { log.data[k] = String(v); },
    streetExists: (tsid) => /^GA5/.test(tsid),
    travel(tsid, meta) { log.travels.push([tsid, meta]); engine.streetTsid = tsid; return Promise.resolve({ ok: true }); },
    achievement(counter, amount) { log.achievements.push([counter, amount]); },
    questFlag(flag) { log.flags.push(flag); },
    grantAchievement(id) { log.granted.push(id); engine.unlockedAchievements.push(id); return true; },
    hasBuff: (id) => log.buffs.has(id),
    applyBuff(id) { log.buffs.add(id); return { ok: true }; },
    removeBuff(id) { log.buffs.delete(id); return { ok: true }; },
    resetAchievementCounter(c) { log.resets.push(c); },
    targetVerbs: () => [{ id: 'mp_trade', label: 'Offer to Trade' }],
    acting: () => false,
    save() {},
    ...over,
  };
  return engine;
}

describe('G334 follow: solo is untouched', () => {
  it('answers nothing in solo and makes no session', () => {
    const engine = fakeEngine(fakeClient(), { mode: 'solo' });
    followMpFeature.onTick(16, Date.now(), engine);
    followMpFeature.onEvent('teleportation_self:plain', 1, engine);
    assert.equal(followMpFeature.verbOverride({ classId: 'pc_remote', playerId: 2, label: 'Bo' }, engine), null);
    assert.equal(followMpFeature.followReady(engine), null);
    assert.equal(globalThis.groddleFollowMp, undefined);
    assert.deepEqual(engine.log.data, {});
  });

  it('leaves the solo follow of the recorded Glitches as it was', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    assert.match(game, /companionFollowVelocity\(player\.x, followee\.sprite\.x, player\.vx, \{ maxSpeed: max \}\)/);
    assert.equal(FOLLOW_TRAIL_DISTANCE, COMPANION_FOLLOW_TRAIL_DISTANCE, 'the same trailing gap');
  });

  it('is registered before street-objects', () => {
    const index = readFileSync(join(PUBLIC, 'js/features/index.js'), 'utf8');
    const a = index.indexOf("from './follow-mp-feature.js?v=follow-1'");
    const b = index.indexOf("from './street-objects-feature.js");
    assert.ok(a > 0 && a < b, 'follow-mp before street-objects');
  });
});

describe('G334 follow: the words and the menu', () => {
  it('uses the source strings', () => {
    assert.equal(FOLLOW_TEXT.asked('Bo'), 'Bo would like to follow you.');
    assert.equal(FOLLOW_TEXT.waiting('Ada'), 'Waiting for Ada to confirm...');
    assert.equal(refusedText('self'), "You can't follow yourself!");
    assert.equal(refusedText('busy', 'Ada'), 'Ada is too busy to be followed...');
    assert.equal(refusedText('declined', 'Ada'), 'Ada declined to be followed.');
    assert.equal(refusedText('far', 'Ada'), 'You were too far away to follow Ada.');
    assert.equal(FOLLOW_TEXT.tooFar('Bo'), 'Bo is too far away to follow you.');
    assert.equal(FOLLOW_TEXT.started('Ada'), 'You started following Ada.');
    assert.equal(refusedText('street'), 'You must be in the same location!');
    assert.equal(refusedText('already', 'Ada'), 'You are already following Ada');
    assert.equal(endedText('private', 'Ada'), "Ada went somewhere you can't follow.");
    assert.equal(endedText('stopped', 'Ada'), 'You stopped following Ada.');
  });

  it('has no em-dashes in anything a player reads', () => {
    const lines = [];
    for (const v of Object.values(FOLLOW_TEXT)) lines.push(typeof v === 'function' ? v('Ada', 'Bo') : v);
    for (const why of ['self', 'street', 'already', 'busy', 'blocked', 'declined', 'far', 'gone']) lines.push(refusedText(why, 'Ada'));
    for (const why of ['stopped', 'offline', 'private', 'left', 'reset']) lines.push(endedText(why, 'Ada'));
    for (const l of lines) assert.ok(!/[—–]/.test(l), l);
  });

  it('names followers briefly', () => {
    assert.equal(listNames(['Ada']), 'Ada');
    assert.equal(listNames(['Ada', 'Bo']), 'Ada and Bo');
    assert.equal(listNames(['Ada', 'Bo', 'Cy']), 'Ada, Bo and Cy');
    assert.equal(listNames(['Ada', 'Bo', 'Cy', 'Di', 'Ed']), 'Ada, Bo and 3 more');
  });

  it('offers Follow, Stop following, or Follow disabled with the source reason (InteractionMenuController.as 592-614)', () => {
    assert.deepEqual(followVerbs({ targetId: 2 }).map((v) => [v.id, v.label, v.enabled, v.sort]), [[FOLLOW_VERB, 'Follow', true, 900]]);
    assert.deepEqual(followVerbs({ targetId: 2, followingId: 2, followingName: 'Bo' }).map((v) => [v.id, v.label, v.tooltip]), [[FOLLOW_STOP_VERB, 'Stop following', 'Stop following this person.']]);
    const off = followVerbs({ targetId: 3, followingId: 2, followingName: 'Bo' })[0];
    assert.equal(off.enabled, false);
    assert.equal(off.reason, 'You are already following Bo');
  });

  it('stops on the movement keys and Space only', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'D', 'w', 's']) assert.ok(isFollowInputKey(k), k);
    for (const k of ['Enter', 'Escape', '/', 'm', 'Shift']) assert.ok(!isFollowInputKey(k), k);
  });

  it('walks to the trailing gap behind the leader and lands it behind them', () => {
    assert.ok(followVelocity(0, 500, 0) > 0, 'toward a leader on the right');
    assert.ok(followVelocity(1000, 500, 0) < 0, 'toward a leader on the left');
    assert.equal(followVelocity(500 - FOLLOW_TRAIL_DISTANCE, 500, 0), 0, 'at the gap it stands');
    assert.deepEqual(followArrival({ x: 400, y: -90, dir: 1 }), { x: 400 - FOLLOW_TRAIL_DISTANCE, y: -90 });
    assert.deepEqual(followArrival({ x: 400, y: -90, dir: -1 }), { x: 400 + FOLLOW_TRAIL_DISTANCE, y: -90 });
    assert.equal(followArrival({}), null);
  });

  it('counts a teleport with followers as the source did (inc_teleportation.js 404-414, 1054)', () => {
    assert.deepEqual(teleportCounters({ kind: 'plain', followers: 1, complete: 1 }), { kind: 'plain', one: true, five: false, eleven: false, cloud: false });
    assert.deepEqual(teleportCounters({ kind: 'map', followers: 5, complete: 3 }), { kind: 'map', one: true, five: true, eleven: false, cloud: true });
    assert.deepEqual(teleportCounters({ kind: 'odd', followers: 11, complete: 2 }), { kind: 'plain', one: true, five: true, eleven: true, cloud: false });
    assert.equal(teleportCounters({ followers: 0, complete: 0 }).one, false);
    assert.equal(teleportKindOf('teleportation_self:map'), 'map');
    assert.equal(teleportKindOf('teleportation_self:script'), '');
    assert.equal(teleportKindOf('teleported'), '');
  });

  it('names badges and a buff the catalogs hold', () => {
    const badges = getAchievementCatalog();
    assert.ok(badges[STALKER_ACHIEVEMENT_ID]);
    assert.equal(badges.glitch_train.conditions[0].group, FOLLOW_COUNTERS.train);
    assert.equal(badges.licenced_teleporter_pfft_class.conditions[0].group, FOLLOW_COUNTERS.withFollowers);
    assert.equal(badges.licensed_teleporter_gee_class.conditions[0].group, FOLLOW_COUNTERS.withFollowers5);
    assert.equal(badges.licensed_super_gragarious_glitch_beamer.conditions[0].group, FOLLOW_COUNTERS.withFollowers11);
    assert.equal(GLITCH_TRAIN_LENGTH, 20);
  });
});

describe('G334 follow: the world side, from the server', () => {
  const client = fakeClient(1);
  const engine = fakeEngine(client);
  before(() => {
    followMpFeature.onTick(16, Date.now(), engine);
  });

  it('adds Follow to another player and asks the server', () => {
    const verbs = followMpFeature.verbOverride({ classId: 'pc_remote', playerId: 2, label: 'Bo' }, engine);
    assert.deepEqual(verbs.map((v) => v.id), ['mp_trade', FOLLOW_VERB]);
    assert.equal(followMpFeature.runVerbOverride({ classId: 'pc_remote', playerId: 2 }, FOLLOW_VERB, engine), true);
    assert.deepEqual(client.sent.at(-1), ['follow_start', { id: 2 }]);
    assert.equal(followMpFeature.runVerbOverride({ classId: 'pc_remote', playerId: 2 }, 'mp_trade', engine), null);
  });

  it('shows the leader the ask and answers with the choice', () => {
    client.msg({ t: 'follow_asked', id: 9, name: 'Cy' });
    const p = engine.log.prompts.at(-1);
    assert.equal(p.text, 'Cy would like to follow you.');
    assert.deepEqual(p.choices.map((c) => c.label), ['OK', 'No thanks']);
    assert.equal(p.timeout, 30);
    assert.equal(p.timeoutValue, 'decline');
    p.onChoice('accept');
    assert.deepEqual(client.sent.at(-1), ['follow_answer', { id: 9, accept: true }]);
    client.msg({ t: 'follow_list', followers: [{ id: 9, name: 'Cy' }], added: 9 });
    assert.equal(engine.log.activity.at(-1), 'Cy is following you.');
    assert.equal(engine.log.data.followMpState, 'leading:1');
    client.msg({ t: 'follow_list', followers: [], removed: 9, why: 'stopped' });
    assert.equal(engine.log.activity.at(-1), 'Cy stopped following you.');
  });

  it('waits, starts, walks after the leader and goes where the leader went', async () => {
    client.msg({ t: 'follow_waiting', id: 2, name: 'Bo' });
    assert.equal(engine.log.prompts.at(-1).text, 'Waiting for Bo to confirm...');
    assert.equal(engine.log.data.followMpState, 'asking:2');
    client.msg({ t: 'follow_started', id: 2, name: 'Bo', streets: 1 });
    assert.ok(engine.log.removed.length > 0, 'the waiting prompt closed');
    assert.equal(engine.log.activity.at(-1), 'You started following Bo.');
    assert.equal(engine.log.data.followMpState, 'following:2');
    // The leader's Glitch, as realtime-feature draws it.
    engine.remotes.set(2, { root: { x: 600, destroyed: false } });
    globalThis.groddleRealtime = { remotes: engine.remotes };
    followMpFeature.onTick(16, Date.now(), engine);
    assert.ok(engine.player.vx > 0, 'walks toward the leader');
    const verbs = followMpFeature.verbOverride({ classId: 'pc_remote', playerId: 2, label: 'Bo' }, engine);
    assert.ok(verbs.some((v) => v.id === FOLLOW_STOP_VERB));
    client.msg({ t: 'follow_go', id: 2, name: 'Bo', street: 'GA5B', x: 300, y: -80, dir: 1, via: 'walk' });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(engine.log.travels.at(-1), ['GA5B', { via: 'follow', arrive: { x: 300 - FOLLOW_TRAIL_DISTANCE, y: -80 } }]);
    assert.equal(engine.log.activity.at(-1), 'Following Bo.');
    client.msg({ t: 'follow_go', id: 7, street: 'GA5C', x: 0, y: 0 });
    await new Promise((r) => setImmediate(r));
    assert.equal(engine.log.travels.at(-1)[0], 'GA5B', 'a go from someone else is ignored');
  });

  it('grants Stalker at the third street the server counted (main.js:1479-1484)', () => {
    client.msg({ t: 'follow_arrived', id: 2, street: 'GA5B', streets: 2 });
    assert.deepEqual(engine.log.granted, []);
    client.msg({ t: 'follow_arrived', id: 2, street: 'GA5C', streets: 3 });
    assert.deepEqual(engine.log.granted, [STALKER_ACHIEVEMENT_ID]);
    client.msg({ t: 'follow_arrived', id: 2, street: 'GA5D', streets: 4 });
    assert.deepEqual(engine.log.granted, [STALKER_ACHIEVEMENT_ID], 'once');
  });

  it('stops on any input and reads the server line', () => {
    press('ArrowLeft');
    assert.deepEqual(client.sent.at(-1), ['follow_stop', {}]);
    const vx = (engine.player.vx = 0);
    followMpFeature.onTick(16, Date.now(), engine);
    assert.equal(engine.player.vx, vx, 'the walk stopped at once');
    client.msg({ t: 'follow_ended', id: 2, name: 'Bo', why: 'stopped' });
    assert.equal(engine.log.activity.at(-1), 'You stopped following Bo.');
    assert.equal(engine.log.data.followMpState, 'idle');
    const sends = client.sent.length;
    press('ArrowLeft');
    assert.equal(client.sent.length, sends, 'nothing to stop');
  });

  it('says a teleport to the server, and counts what the server confirmed', () => {
    client.msg({ t: 'follow_list', followers: [{ id: 3, name: 'C' }, { id: 4, name: 'D' }, { id: 5, name: 'E' }], added: 5 });
    engine.streetTsid = 'GA5T';
    followMpFeature.onEvent('teleportation_self:map', 1, engine);
    assert.deepEqual(client.sent.at(-1), ['follow_teleport', { street: 'GA5T', kind: 'map' }]);
    client.msg({ t: 'follow_teleported', street: 'GA5T', kind: 'map', followers: 3, complete: 3 });
    assert.deepEqual(engine.log.achievements.slice(-2), [['teleportation_self_withfollowers:map', 1], ['teleportation_self_withfollowers_3', 1]]);
    assert.deepEqual(engine.log.flags, ['teleportation_self_withfollowers_3']);
  });

  it('rides the Glitch Train while the server says it is on, and starts over when off', () => {
    client.msg({ t: 'follow_train', street: 'GA5T', chain: 20, on: true });
    assert.deepEqual(engine.log.achievements.at(-1), ['glitch_train:GA5T', 1]);
    assert.ok(engine.log.buffs.has('glitch_train'));
    client.msg({ t: 'follow_train', street: 'GA5T', chain: 19, on: false });
    assert.deepEqual(engine.log.resets, ['glitch_train']);
    assert.ok(!engine.log.buffs.has('glitch_train'));
  });

  it('forgets every follow when the socket drops', () => {
    client.emit('state', { state: 'offline' });
    assert.equal(engine.log.data.followMpState, 'idle');
  });
});

describe("G334 follow: Three's a Cloud between real players", () => {
  it('moves out of the left-outs into the multiplayer quests, needing follow', () => {
    assert.equal(CLOUD in MULTIPLAYER_QUESTS_LEFT_OUT, false);
    assert.deepEqual(MULTIPLAYER_QUESTS[CLOUD].needs, ['follow']);
    assert.equal(getQuestCatalog()[CLOUD].requirements[0].name, FOLLOW_COUNTERS.cloudFlag);
  });

  it('is offered at Teleportation III once following works, never in solo', () => {
    const qs = createQuestState();
    const offered = (ctx) => pendingQuestOffers(qs, null, ctx).map((r) => r.classTsid);
    const mp = (over) => ({ multiplayer: true, mpFacts: {}, mpReady: {}, level: 20, skills: ['teleportation_3'], ...over });
    assert.ok(!offered(mp()).includes(CLOUD), 'not before follow is live');
    assert.ok(offered(mp({ mpReady: { follow: true } })).includes(CLOUD));
    assert.ok(!offered(mp({ skills: [], mpReady: { follow: true } })).includes(CLOUD), 'Teleportation III first');
    assert.ok(!offered({ level: 20, skills: ['teleportation_3'] }).includes(CLOUD), 'never solo');
  });

  it('tells the quest offers when following is live', () => {
    const client = fakeClient(1);
    const engine = fakeEngine(client);
    engine.query = (hook, ...args) => {
      if (hook === 'realtimeClient') return client;
      if (hook === 'followReady') return true;
      return null;
    };
    assert.equal(questsMpFeature.questsMpContext(engine).ready.follow, true);
  });

  it('is credited once by the ledger (350 currants, the quest file)', () => {
    const credits = economyCredits(new Set(Object.keys(tradeTable().items)));
    assert.deepEqual(credits.quests[CLOUD], { c: 350 });
    assert.ok(creditedMultiplayerQuests().includes(CLOUD));
  });
});
