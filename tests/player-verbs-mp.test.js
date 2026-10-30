/**
 * What one player does to another in multiplayer (Track M, lane VERBS): the
 * rules and copy (js/player-verbs-mp.js), the world side
 * (features/player-verbs-mp-feature.js) driven by the server's messages
 * through a fake client and engine, Blocks That Rock and Super Soaker moving
 * into the multiplayer quests, the badges the counters reach, and that solo
 * is untouched. The server's rules are its own tests
 * (groddle-afternoon-server verbs_test.go).
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CHARADES_TEXT,
  INFLUENCE_BUFFS,
  PLAYER_VERBS,
  VERB_TEXT,
  cleanCharadesWord,
  doerCounters,
  doerSide,
  emoteMenu,
  energyRefusal,
  hearMusicblock,
  isVerbRaceStreet,
  targetSide,
  underTheInfluence,
} from '../public/js/player-verbs-mp.js?v=verbs-1';
import { playerVerbsMpFeature } from '../public/js/features/player-verbs-mp-feature.js?v=g458-1';
import { loadContentCatalogsFromDir, getQuestCatalog } from '../public/js/content-catalogs.js?v=g403-1';
import { createQuestState } from '../public/js/quests.js';
import { pendingQuestOffers, acceptOffer } from '../public/js/quest-offers.js?v=g403-1';
import { MULTIPLAYER_QUESTS, MULTIPLAYER_QUESTS_LEFT_OUT, MP_FACTS, offerableMultiplayerQuest } from '../public/js/quests-mp.js?v=g358-1';
import { createAchievementState, applyAchievementProgress } from '../public/js/achievements.js?v=g403-1';
import { economyCredits } from '../tools/build-economy.mjs';
import { tradeTable } from '../tools/build-realtime-trade.mjs';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');

before(async () => {
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

function fakeClient(me = 1) {
  const listeners = new Map();
  const sent = [];
  return {
    me: { id: me, name: 'Ada' },
    state: 'online',
    players: [{ id: 2, name: 'Bo', x: 10, y: 0 }],
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    send(kind, payload) { sent.push([kind, payload]); return true; },
  };
}

function fakeEngine(client, over = {}) {
  const log = { activity: [], toasts: [], achievements: [], sounds: [], buffs: new Map(), data: {}, feats: [] };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GA5A',
    player: { x: 0, y: 0 },
    pc: { energy: 100, mood: 50, maxEnergy: 100, maxMood: 100, xp: 0, imagination: 0, currants: 0, level: 12 },
    inv: { emotional_bear: 1, plank: 3, watering_can: 1, musicblock_d_green_01: 1, potion_charades: 1 },
    questState: createQuestState(),
    log,
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      return null;
    },
    pushActivity(text) { log.activity.push(text); },
    toast(text) { log.toasts.push(text); },
    setData(k, v) { log.data[k] = String(v); },
    playSound(k) { log.sounds.push(k); },
    floatText() {},
    achievement(counter, amount) { log.achievements.push([counter, amount]); },
    featsIncrement(id, n) { log.feats.push([id, n]); return 1; },
    hasBuff: (id) => log.buffs.has(id),
    applyBuff(id, opts) { log.buffs.set(id, opts); return { ok: true }; },
    removeBuff(id) { log.buffs.delete(id); return { ok: true }; },
    activeBuffIds: () => [...log.buffs.keys()],
    emotionalBearUpgrades: () => ['kiss'],
    musicblockHeard: () => engine.heard,
    heard: {},
    playMusicblockAudio: (c) => (c === 'musicblock_d_green_01' ? 'Musicblock DG-1' : ''),
    targetVerbs: () => [{ id: 'mp_trade', label: 'Offer to Trade' }],
    updateHud() {},
    refreshPack() {},
    save() {},
    ...over,
  };
  return engine;
}

describe('player verbs: solo is untouched', () => {
  it('answers nothing in solo and makes no session', () => {
    const engine = fakeEngine(fakeClient(), { mode: 'solo' });
    playerVerbsMpFeature.init(engine);
    playerVerbsMpFeature.onTick(16, Date.now(), engine);
    assert.equal(playerVerbsMpFeature.verbOverride({ classId: 'pc_remote', playerId: 2, label: 'Bo' }, engine), null);
    assert.equal(playerVerbsMpFeature.packVerbs('watering_can', engine), null);
    assert.equal(playerVerbsMpFeature.charadesCheck(engine), null);
    assert.equal(playerVerbsMpFeature.charadesQuaff(engine), null);
    assert.equal(playerVerbsMpFeature.playerVerbsReady(engine), null);
    assert.equal(globalThis.groddlePlayerVerbs, undefined);
    assert.equal(playerVerbsMpFeature.save(), undefined);
  });

  it('keeps solo Charades refused and the bear on its companions', () => {
    const potions = readFileSync(join(PUBLIC, 'js/features/potions-feature.js'), 'utf8');
    assert.match(potions, /return engine\.query\?\.\('charadesCheck', engine\) \|\| charadesCheck\(\{ players: 1 \}\);/);
    assert.match(potions, /potion_charades: \(engine\) => engine\.query\?\.\('charadesQuaff', engine\) \|\| \{ ok: false \},/);
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    assert.match(game, /for \(const companion of EMOTIONAL_BEAR_COMPANIONS\)/);
  });

  it('is registered before street-objects', () => {
    const index = readFileSync(join(PUBLIC, 'js/features/index.js'), 'utf8');
    const a = index.indexOf("from './player-verbs-mp-feature.js?v=g458-1'");
    const b = index.indexOf("from './street-objects-feature.js");
    assert.ok(a > 0 && a < b, 'player-verbs-mp before street-objects');
  });
});

describe('player verbs: the rules and the words', () => {
  it('cleans a secret word as potion_charades.js:520 (and verbs.go) does', () => {
    assert.equal(cleanCharadesWord('  Big Apple! '), 'big apple');
    assert.equal(cleanCharadesWord('sn@ke-Pit 9'), 'snke-pit 9');
    assert.equal(cleanCharadesWord('!!!'), '');
    assert.equal(cleanCharadesWord('a'.repeat(40)), 'a'.repeat(32));
    assert.equal(cleanCharadesWord('!'.repeat(31) + 'ab'), 'a');
    assert.equal(CHARADES_TEXT.inputLabel, "It's Charades! Choose a secret word for others to guess:");
  });

  it('lists the pack emotes for another player as the source menu does', () => {
    const menu = emoteMenu({ inv: { emotional_bear: 1, plank: 1 }, upgrades: ['moon'] });
    assert.deepEqual(menu.map((v) => v.label), ['Splank', 'Hug', 'High five', 'Moon']);
    assert.ok(menu.every((v) => v.enabled));
    assert.deepEqual(emoteMenu({ inv: {} }), []);
    const race = emoteMenu({ inv: { emotional_bear: 1, plank: 1 }, race: true });
    assert.equal(race.find((v) => v.verb === 'splank').reason, 'That would be unsportspersonlike of you.');
    assert.equal(race.find((v) => v.verb === 'hug').reason, "You're in a race! Save your emotional outbursts for later.");
    assert.ok(race.every((v) => !v.enabled));
    assert.equal(isVerbRaceStreet('RACE_X1'), true);
    assert.equal(isVerbRaceStreet('CROWNS_X1'), true);
    assert.equal(isVerbRaceStreet('HOUSE_7'), false);
  });

  it('keeps the source energy checks (energy <= cost refuses; garlic kisses need 5)', () => {
    assert.equal(energyRefusal('hug', { energy: 5, name: 'Bo' }), "You tried to hug Bo, but you just don't have the energy.");
    assert.equal(energyRefusal('hug', { energy: 6, name: 'Bo' }), '');
    assert.equal(energyRefusal('high_five', { energy: 10, name: 'Bo' }), "You tried to high five Bo, but you just don't have the energy.");
    assert.equal(energyRefusal('kiss', { energy: 6, garlic: true, name: 'Bo' }), '');
    assert.equal(energyRefusal('kiss', { energy: 6, name: 'Bo' }), "You tried to kiss Bo, but you just don't have the energy.");
    assert.equal(energyRefusal('splank', { energy: 0 }), '', 'plank.js has no energy check');
  });

  it('has each side of each act as the source', () => {
    assert.deepEqual(doerSide('hug', { name: 'Bo' }), { energy: 5, mood: 2, text: 'You hugged Bo. Energy -5, Mood +2' });
    assert.equal(doerSide('soak', { name: 'Bo' }).mood, 5);
    assert.equal(doerSide('kiss', { name: 'Bo', garlic: true }).text, "You kissed Bo. Hopefully they don't notice your garlic breath. -5 energy, +5 mood");
    assert.equal(targetSide('hug', { from: 'Ada' }).text, 'Ada hugged you! Mood +2');
    assert.equal(targetSide('high_five', { from: 'Ada' }).mood, 10);
    assert.deepEqual([targetSide('soak').mood, targetSide('soak').energy], [-3, 5]);
    assert.deepEqual([targetSide('kiss', { garlic: true }).mood, targetSide('kiss', { garlic: true }).xp], [-3, 2]);
    assert.equal(targetSide('splank', { from: 'Ada' }).mood, 0, 'plank.js:64 leaves the target mood out');
    assert.equal(targetSide('splank', { from: 'Ada' }).overlay.ms, 10000);
    assert.equal(targetSide('moon', { from: 'Ada' }).text, 'Ada mooned you! Mood +10');
    assert.equal(VERB_TEXT.gotSoak('Ada'), 'Ada dumps water all over you. You are soaked!');
  });

  it('names the doer counters by target', () => {
    assert.deepEqual(doerCounters('splank', { to: 9 }).achievements, ['players_splanked:9']);
    assert.deepEqual(doerCounters('soak', { to: 9 }).quests, [{ quest: 'watering_time', counter: 'players_soaked', label: '9' }]);
    const play = doerCounters('play_for', { to: 9, block: 'musicblock_d_green_01' });
    assert.deepEqual(play.achievements, ['musicblocks_played:musicblock_d_green_01']);
    assert.equal(play.quests[0].counter, 'musicblock_d_green_01_played');
    assert.deepEqual(doerCounters('kiss', { to: 9, garlic: true }).achievements, ['players_garlic_kissed:9', 'kissed:9']);
  });

  it('hears a block as musicblock_*.js play_for does', () => {
    const day = (t) => Math.floor(t / 14_400_000);
    const now = 1_800_000_000_000;
    const heard = {};
    assert.equal(hearMusicblock(heard, 'musicblock_d_green_01', { now, from: 'Ada', dayOf: day }).xp, 50);
    assert.equal(hearMusicblock(heard, 'musicblock_d_green_01', { now: now + 60_000, dayOf: day }).xp, 0, 'stale within four hours');
    const later = hearMusicblock(heard, 'musicblock_d_green_01', { now: now + 5 * 3600_000, dayOf: day });
    assert.ok(later.xp === 10 || later.xp === 5);
    assert.equal(hearMusicblock({ musicblock_d_green_01: now - 40 * 86400_000 }, 'musicblock_d_green_01', { now, dayOf: day }).xp, 100);
  });

  it('knows the party buffs home.js:207 counts', () => {
    assert.deepEqual([...INFLUENCE_BUFFS], ['buff_buzzed', 'buff_smashed', 'purple_flower', 'no_no_powder']);
    assert.equal(underTheInfluence(['buff_smashed', 'x']), true);
    assert.equal(underTheInfluence(['buff_garlic_breath']), false);
  });
});

describe('player verbs: between two players (fake server)', () => {
  const client = fakeClient(1);
  const engine = fakeEngine(client);

  it('makes a session in multiplayer and adds the emotes to a player menu', () => {
    playerVerbsMpFeature.init(engine);
    playerVerbsMpFeature.restore(null, engine);
    playerVerbsMpFeature.onTick(16, 1000, engine);
    assert.ok(globalThis.groddlePlayerVerbs);
    const verbs = playerVerbsMpFeature.verbOverride({ classId: 'pc_remote', playerId: 2, label: 'Bo' }, engine);
    assert.deepEqual(verbs.map((v) => v.label), ['Offer to Trade', 'Splank', 'Hug', 'High five', 'Kiss']);
    assert.equal(playerVerbsMpFeature.playerVerbsReady(engine), true);
    assert.equal(playerVerbsMpFeature.playerVerbsSoakReady(engine), true);
    assert.deepEqual(client.sent.at(-1), ['verbs_influence', { on: false }]);
  });

  it('asks the server and charges only on its word', () => {
    client.sent.length = 0;
    playerVerbsMpFeature.runVerbOverride({ classId: 'pc_remote', playerId: 2, label: 'Bo' }, 'pverb_splank', engine);
    const [kind, payload] = client.sent[0];
    assert.equal(kind, 'verb_do');
    assert.equal(payload.verb, 'splank');
    assert.equal(payload.to, 2);
    assert.equal(engine.pc.energy, 100, 'nothing spent before the answer');
    client.msg({ t: 'verb_done', verb: 'splank', ref: payload.ref, status: 'refused', text: 'That player is too far away. Try moving a little closer.' });
    assert.equal(engine.pc.energy, 100);
    assert.equal(engine.log.toasts.at(-1), 'That player is too far away. Try moving a little closer.');
    client.msg({ t: 'verb_done', verb: 'splank', ref: payload.ref, status: 'ok', id: 'v-1', to: { id: 2, name: 'Bo' } });
    assert.equal(engine.pc.energy, 90);
    assert.ok(engine.log.achievements.some(([c]) => c === 'players_splanked:2'));
    assert.equal(engine.log.activity.at(-1), 'You splanked Bo. Energy -10');
  });

  it('applies what another player did once per act', () => {
    engine.pc.mood = 50;
    client.msg({ t: 'verb_got', verb: 'hug', id: 'v-9', from: { id: 2, name: 'Bo' } });
    client.msg({ t: 'verb_got', verb: 'hug', id: 'v-9', from: { id: 2, name: 'Bo' } });
    assert.equal(engine.pc.mood, 52);
    assert.ok(engine.log.sounds.includes('EMO_BEAR_HUG'));
    assert.equal(engine.log.activity.at(-1), 'Bo hugged you! Mood +2');
    client.msg({ t: 'verb_got', verb: 'soak', id: 'v-10', from: { id: 2, name: 'Bo' } });
    assert.equal(engine.pc.mood, 49);
    client.msg({ t: 'verb_got', verb: 'play_for', id: 'v-11', from: { id: 2, name: 'Bo' }, block: 'musicblock_d_green_01' });
    assert.equal(engine.pc.mood, 51);
    assert.ok(engine.pc.xp > 0, 'fresh tunes (50 before the mood scaling)');
    assert.ok(engine.heard.musicblock_d_green_01 > 0);
    assert.match(engine.log.activity.at(-1), /^You heard Musicblock DG-1\. Totally fresh tunes! Rad! It was generous of Bo to share some new music!/);
  });

  it('counts Super Soaker once per player while it runs', () => {
    const qs = engine.questState;
    assert.ok(acceptOffer(qs, 'watering_time', { inv: engine.inv, pc: engine.pc, managedOnly: true }).ok);
    const soak = (ref, id) => {
      playerVerbsMpFeature.runPackVerb('watering_can', 'pverb_soak', engine); // no DOM: no picker
      globalThis.groddlePlayerVerbs.act('soak', { id, name: 'P' });
      const p = client.sent.at(-1)[1];
      client.msg({ t: 'verb_done', verb: 'soak', ref: p.ref, status: 'ok', id: ref, to: { id, name: 'P' } });
    };
    engine.log.achievements.length = 0;
    soak('v-20', 2);
    soak('v-21', 2);
    soak('v-22', 3);
    assert.deepEqual(engine.log.achievements.filter(([c]) => c === 'players_soaked'), [['players_soaked', 1], ['players_soaked', 1]]);
  });

  it('plays Charades through the server', () => {
    assert.deepEqual(playerVerbsMpFeature.charadesCheck(engine), { ok: true });
    assert.deepEqual(playerVerbsMpFeature.charadesQuaff(engine), { ok: true, noUse: true, tag: 'charades_ask' });
    const s = globalThis.groddlePlayerVerbs;
    assert.equal(s.submitWord('abc'), false, 'four characters at least');
    assert.equal(s.submitWord('Ginger Root'), true);
    assert.deepEqual(client.sent.at(-1), ['charades_start', { word: 'Ginger Root' }]);
    client.msg({ t: 'charades_started', status: 'ok', word: 'ginger root', ends: Date.now() + 120_000 });
    assert.ok(!engine.inv.potion_charades, 'the potion is gone');
    assert.ok(engine.log.buffs.has('charades'));
    assert.ok(engine.log.achievements.some(([c]) => c === 'potions_used:potion_charades'));
    assert.equal(engine.log.activity.at(-2), 'The secret word is: "ginger root"');
    assert.deepEqual(playerVerbsMpFeature.charadesCheck(engine), { ok: false, error: 'You are already playing charades.' });
    client.msg({ t: 'charades_end', why: 'guessed', word: 'ginger root', winner: { id: 2, name: 'Bo' } });
    assert.equal(engine.log.buffs.has('charades'), false);
    assert.ok(engine.log.sounds.includes('RAINBOW_YOUDIDIT'));
    client.players = [];
    assert.equal(playerVerbsMpFeature.charadesCheck(engine).error, 'You need other people around to play Charades. Trying to play with yourself is grossly inappropriate.');
    client.players = [{ id: 2, name: 'Bo' }];
  });

  it('pays a winning guess and counts a blowout', () => {
    const before = engine.pc.currants;
    client.msg({ t: 'charades_won', from: { id: 2, name: 'Bo' }, xp: 50, currants: 250, text: 'Ada guessed correctly! +50 iMG, +250 currants' });
    assert.equal(engine.pc.currants, before + 250);
    client.msg({ t: 'party_blowout', owner: 7 });
    assert.ok(engine.log.achievements.some(([c]) => c === 'attended_party:blowout'));
  });

  it('tells the server when a party buff comes on', () => {
    engine.log.buffs.set('buff_buzzed', {});
    playerVerbsMpFeature.onTick(16, 10_000, engine);
    assert.deepEqual(client.sent.at(-1), ['verbs_influence', { on: true }]);
  });
});

describe('player verbs: quests and badges', () => {
  it('offers Blocks That Rock and Super Soaker only in multiplayer, once the verbs work', () => {
    for (const id of ['play_musicblocks', 'watering_time']) {
      assert.equal(MULTIPLAYER_QUESTS[id].offer, 'ours');
      assert.equal(MULTIPLAYER_QUESTS_LEFT_OUT[id], undefined);
      assert.equal(offerableMultiplayerQuest(id, {}), null, 'solo');
      assert.equal(offerableMultiplayerQuest(id, { multiplayer: true, mpReady: {} }), null, 'verbs not live');
    }
    assert.match(MULTIPLAYER_QUESTS_LEFT_OUT.zero_mood, /is_god/);
    const qs = createQuestState();
    const pc = { level: 12, xp: 999_999 };
    const ids = (ctx) => pendingQuestOffers(qs, pc, ctx).map((r) => r.classTsid);
    assert.ok(!ids({ level: 12 }).includes('play_musicblocks'));
    const ctx = { level: 12, multiplayer: true, mpReady: { verbs: true }, mpFacts: {} };
    assert.ok(ids(ctx).includes('play_musicblocks'));
    assert.ok(!ids(ctx).includes('watering_time'));
    assert.ok(ids({ ...ctx, mpFacts: { [MP_FACTS.soakReady]: 1 } }).includes('watering_time'));
    assert.equal(getQuestCatalog().play_musicblocks.timer.buff, 'play_musicblocks');
  });

  it("credits Super Soaker's 500 currants online", () => {
    assert.equal(economyCredits(new Set(Object.keys(tradeTable().items))).quests.watering_time?.c, 500);
  });

  it('reaches Hanky Splanky with 23 different players and Epic Blowout with one party', () => {
    const state = createAchievementState();
    const pc = { level: 12 };
    let unlocked = [];
    for (let i = 1; i <= 23; i++) unlocked.push(...applyAchievementProgress(state, `players_splanked:${i}`, 1, pc).filter((u) => u.unlocked).map((u) => u.classTsid));
    applyAchievementProgress(state, 'players_splanked:3', 1, pc);
    assert.deepEqual(unlocked, ['hanky_splanky']);
    unlocked = applyAchievementProgress(state, 'attended_party:blowout', 1, pc).filter((u) => u.unlocked).map((u) => u.classTsid);
    assert.deepEqual(unlocked, ['epic_blowout']);
    assert.equal(PLAYER_VERBS.splank.counter, 'players_splanked');
  });
});
