/**
 * Lane RACES3 (G334 leftovers): The Great Hog Haul's quest between real
 * players (quests/hogtie_piggy.js, logged by a Great Hog Haul Ticket's
 * challenge as the other quest races are, js/quests-mp.js), the dead do not
 * race (race_ticket.js:119; location.js onPlayerEnter 85-89; the server's
 * races.go / crowns.go inNaraka), a reload during a Game of Crowns is a
 * logout (instance.js player_logout 380-394: out of the game, the rest play
 * on) with a spent ticket's fate asked of the server (crown_pending), and a
 * crowns win the server decided survives its restart (crowns.go
 * -crowns-file). Solo is unchanged.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadContentCatalogsFromDir, getQuestCatalog } from '../public/js/content-catalogs.js';
import { createQuestState } from '../public/js/quests.js';
import { pendingQuestOffers } from '../public/js/quest-offers.js';
import { MP_RACE_QUESTS, MULTIPLAYER_QUESTS, offerableMultiplayerQuest } from '../public/js/quests-mp.js?v=g358-1';
import { questOffersFeature } from '../public/js/features/quest-offers-feature.js?v=g390-1';
import { HUB_MAP_STREETS } from '../public/js/hub-maps-data.js';
import { HELL_LOCATION } from '../public/js/hell.js';
import { HOG_MP_COURSE } from '../public/js/hog-haul-mp.js?v=g334-hog-1';
import { CROWNS_TICKET } from '../public/js/game-of-crowns.js?v=crowns-2';
import { economyCredits } from '../tools/build-economy.mjs';
import { tradeTable } from '../tools/build-realtime-trade.mjs';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const PUBLIC = join(root, 'public');

before(async () => {
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

function fakeClient(me = 1) {
  const handlers = new Map();
  return {
    state: 'online',
    street: 'GA5',
    me: { id: me, name: 'Ada' },
    players: [{ id: 8, name: 'Bo', x: 0, y: 0 }],
    sent: [],
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },
    send(kind, payload) {
      this.sent.push({ kind, ...payload });
      return true;
    },
    fire(type, msg) {
      for (const fn of handlers.get(type) || []) fn(msg);
    },
    msg(m) { this.fire(`msg:${m.t}`, m); },
  };
}

describe('The Great Hog Haul quest in multiplayer (quests/hogtie_piggy.js)', () => {
  it('is a quest race, logged by the ticket\'s challenge and never offered by the familiar', () => {
    assert.equal(HOG_MP_COURSE, 'hogtie_piggy');
    assert.ok(MP_RACE_QUESTS.includes('hogtie_piggy'));
    assert.equal(MULTIPLAYER_QUESTS.hogtie_piggy.offer, 'challenge');
    const def = getQuestCatalog().hogtie_piggy;
    assert.equal(def.isMultiplayer, true);
    assert.equal(def.isRepeatable, true);
    assert.deepEqual(def.requirements.map((r) => r.name), ['multiplayer_quest_win', 'race_leave']);
    assert.equal(offerableMultiplayerQuest('hogtie_piggy', { multiplayer: true }), null);
    const all = pendingQuestOffers(createQuestState(), null, { multiplayer: true, mpFacts: {}, mpReady: {}, level: 60, skills: [] }).map((r) => r.classTsid);
    assert.ok(!all.includes('hogtie_piggy'));
  });

  it('pays nothing, so the ledger has no row for it (rewards {})', () => {
    const credits = economyCredits(new Set(Object.keys(tradeTable().items)));
    assert.equal(credits.quests.hogtie_piggy, undefined);
  });

  it('logs for the challenger, completes on the server\'s win and leaving, fails on a loss', async () => {
    const { questsMpFeature: feature } = await import('../public/js/features/quests-mp-feature.js?v=races3-test-2');
    const client = fakeClient(1);
    const calls = { activity: [], awards: [] };
    const engine = {
      mode: 'multiplayer',
      started: true,
      inv: {},
      pc: { xp: 0, level: 20, currants: 0, mood: 10, energy: 10, giantFavor: {} },
      questState: createQuestState(),
      learnedSkills: [],
      unlockedAchievements: [],
      streetTsid: 'LA5101HF7F429V',
      street: { label: 'Somewhere', hubId: '' },
      inScene: () => false,
      activeBuffIds: () => [],
      query: (name) => (name === 'realtimeClient' ? client : null),
      achievement: (counter, amount) => questOffersFeature.onEvent(counter, amount, engine),
      award: (a) => calls.awards.push(a),
      pushActivity: (t) => calls.activity.push(t),
      playSound() {}, refreshPack() {}, updateHud() {}, save() {}, toast() {},
      setData() {},
      param: () => null,
      busy: () => true,
    };
    feature.restore(undefined, engine);
    feature.onTick(16, Date.now(), engine);
    const qs = engine.questState;
    client.msg({ t: 'race_waiting', from: 2, course: 'hogtie_piggy' });
    assert.equal(qs.active.hogtie_piggy, undefined, 'only the challenger holds it');
    client.msg({ t: 'race_waiting', from: 1, course: 'hogtie_piggy' });
    assert.ok(qs.active.hogtie_piggy);
    assert.ok(calls.activity.includes('New quest: The Great Hog Haul'));
    client.msg({ t: 'race_match', match: '00000000000000b1', course: 'hogtie_piggy', kind: 'pigs' });
    // Into the haul's cave (not a RACE_ street id): no race_leave before the win.
    engine.streetTsid = 'GHVJQH26ERF3VMJ';
    feature.onStreetEnter({}, engine);
    assert.equal(qs.active.hogtie_piggy.progress.race_leave, 0);
    client.msg({ t: 'race_end', match: '00000000000000b1', course: 'hogtie_piggy', winner: { id: 1, name: 'Ada' }, why: 'won' });
    assert.equal(qs.active.hogtie_piggy.progress.multiplayer_quest_win, 1);
    engine.streetTsid = 'LA5101HF7F429V';
    feature.onStreetEnter({}, engine);
    assert.equal(qs.active.hogtie_piggy, undefined);
    assert.ok(qs.completed.includes('hogtie_piggy'));
    assert.ok(calls.awards.some((a) => a.classTsid === 'hogtie_piggy'));
    // Repeatable: the next ticket logs it again; Bo winning fails it (inc_race.js 183-189).
    client.msg({ t: 'race_waiting', from: 1, course: 'hogtie_piggy' });
    assert.ok(qs.active.hogtie_piggy);
    client.msg({ t: 'race_match', match: '00000000000000b2', course: 'hogtie_piggy', kind: 'pigs' });
    client.msg({ t: 'race_end', match: '00000000000000b2', course: 'hogtie_piggy', winner: { id: 2, name: 'Bo' }, why: 'won' });
    assert.equal(qs.active.hogtie_piggy, undefined);
    // Nobody came: failed (quests_multiplayer_invite_timeout).
    client.msg({ t: 'race_waiting', from: 1, course: 'hogtie_piggy' });
    client.msg({ t: 'race_failed', course: 'hogtie_piggy', refund: true });
    assert.equal(qs.active.hogtie_piggy, undefined);
  });

  it('counts the source\'s hogtie_piggy:won / :lost from the server\'s race_end (inc_games.js 2136, 2149)', () => {
    const src = read('public/js/features/hog-haul-mp-feature.js');
    assert.match(src, /engine\.achievement\?\.\('hogtie_piggy:won', 1\)/);
    assert.match(src, /engine\.achievement\?\.\('hogtie_piggy:lost', 1\)/);
  });

  it('keeps solo\'s bot race to solo (game.js)', () => {
    const game = read('public/game.js');
    assert.match(game, /if \(isSolo\(\) && p\.active && p\.def\.classTsid === HOG_HAUL_QUEST_ID && !hogHaulIsInstanced\(\)\) \{/);
    assert.match(game, /if \(classTsid === HOG_HAUL_QUEST_ID\) return isSolo\(\) && !hogHaulIsInstanced\(\);/);
  });
});

describe('the dead do not race', () => {
  it('the server\'s Naraka is the game\'s hub 40, Hell One among it', { skip: skipWithoutServer }, () => {
    const go = readFileSync(serverPath('races.go'), 'utf8');
    const block = go.slice(go.indexOf('var narakaStreets'), go.indexOf('}', go.indexOf('var narakaStreets')));
    const ids = [...block.matchAll(/"([A-Z0-9]+)": true/g)].map((m) => m[1]).sort();
    assert.deepEqual(ids, [...HUB_MAP_STREETS['40']].sort());
    assert.ok(ids.includes(HELL_LOCATION.tsid));
    assert.match(go, /raceTooDead {2}= "You are too dead to be racing around\."/);
    const crowns = readFileSync(serverPath('crowns.go'), 'utf8');
    assert.match(crowns, /if inNaraka\(oc\.Street\(\)\) \{/);
    assert.match(crowns, /flag\.String\("crowns-file"/);
  });

  it('a race_match that reaches a dead page is left at once (races-feature)', async () => {
    const { racesFeature } = await import('../public/js/features/races-feature.js?v=races3-test-1');
    const client = fakeClient(7);
    const toasts = [];
    const engine = {
      mode: 'multiplayer',
      inv: {},
      pc: { currants: 0 },
      player: { x: 100, y: 500 },
      streetTsid: HELL_LOCATION.tsid,
      started: false,
      query: (hook) => (hook === 'realtimeClient' ? client : hook === 'isDead' ? true : null),
      toast(t) { toasts.push(t); },
      updateHud() {}, save() {}, setData() {}, pushActivity() {}, prompt() { return 'p1'; }, removePrompt() {}, playSound() {},
      placement: () => [], transientInstance: () => false, homeContext: () => ({ inHome: false }), travelGate: () => null, param: () => null, inScene: () => false,
    };
    racesFeature.restore({ pendingTicket: 'race_ticket_canyon_run' });
    racesFeature.onStreetEnter({ tsid: HELL_LOCATION.tsid }, engine);
    client.fire('msg:race_match', { t: 'race_match', match: '00000000000000c1', street: 'RACE_00000000000000C1', course: 'canyon_run', kind: 'finish', game: 'race', slot: 0, spawn: [0, 500], players: [{ id: 7, name: 'Ada', slot: 0 }, { id: 8, name: 'Bo', slot: 1 }], finish: [900, 400] });
    assert.ok(client.sent.some((m) => m.kind === 'race_leave' && m.match === '00000000000000c1'));
    assert.ok(toasts.includes('You are too dead to be racing around.'));
    assert.equal(racesFeature._state().record.pendingTicket, null, 'a match was made: spent');
    assert.equal(engine.inv.race_ticket_canyon_run || 0, 0);
  });
});

describe('a Game of Crowns reload asks the server, and the dead stay out (crowns-feature)', () => {
  async function setup({ dead = false } = {}) {
    const { crownsFeature } = await import(`../public/js/features/crowns-feature.js?v=races3-test-${dead ? 'd' : 'a'}`);
    const client = fakeClient(7);
    const log = { toasts: [], activity: [] };
    const engine = {
      mode: 'multiplayer',
      inv: {},
      pc: { currants: 0, imagination: 0, xp: 0 },
      player: { x: 0, y: 0 },
      streetTsid: 'GA5',
      instanceHold: null,
      query: (hook) => (hook === 'realtimeClient' ? client : hook === 'isDead' ? dead : null),
      toast: (t) => log.toasts.push(t),
      pushActivity: (t) => log.activity.push(t),
      achievement() {}, updateHud() {}, save() {}, setData() {}, playSound() {}, prompt: () => 'p1', removePrompt() {},
      param: () => null,
    };
    return { crownsFeature, client, engine, log };
  }

  it('a restored spent ticket is never refunded by a street change: the page asks (crown_pending)', async () => {
    const { crownsFeature, client, engine, log } = await setup();
    crownsFeature.restore({ pendingTicket: CROWNS_TICKET }, engine);
    crownsFeature.onStreetEnter({ tsid: 'GA5' }, engine);
    assert.equal(engine.inv[CROWNS_TICKET] || 0, 0);
    assert.equal(client.sent.filter((m) => m.kind === 'crown_pending').length, 1, 'asked once');
    crownsFeature.onStreetEnter({ tsid: 'GA5' }, engine);
    assert.equal(client.sent.filter((m) => m.kind === 'crown_pending').length, 1, 'once until it hears');
    client.msg({ t: 'crown_ticket', refund: false });
    assert.equal(crownsFeature._state().record.pendingTicket, null, 'spent: a game was made');
    assert.equal(engine.inv[CROWNS_TICKET] || 0, 0);
    crownsFeature.restore({ pendingTicket: CROWNS_TICKET }, engine);
    client.fire('hello', {});
    assert.equal(client.sent.filter((m) => m.kind === 'crown_pending').length, 2, 'asked again on a reconnect');
    client.msg({ t: 'crown_ticket', refund: true, text: 'Your game never started, so your ticket was returned.' });
    assert.equal(engine.inv[CROWNS_TICKET], 1);
    client.msg({ t: 'crown_ticket', refund: true });
    assert.equal(engine.inv[CROWNS_TICKET], 1, 'never twice');
    assert.ok(log.toasts.includes('Your game never started, so your ticket was returned.'));
    // Out of the arena by a reload: told the game goes on without you.
    client.msg({ t: 'crown_left', match: '00000000000000a1', round: 1, seconds: 3 });
    assert.ok(log.activity.includes('You left the Game of Crowns.'));
  });

  it('a crown_match that reaches a dead page is left at once', async () => {
    const { crownsFeature, client, engine, log } = await setup({ dead: true });
    crownsFeature.restore({ pendingTicket: CROWNS_TICKET }, engine);
    crownsFeature.onTick(16, 0, engine);
    client.msg({ t: 'crown_match', match: '00000000000000a2', street: 'CROWNS_00000000000000A2', slot: 0, spawn: [0, 0], players: [{ id: 7, name: 'Ada', slot: 0 }, { id: 8, name: 'Bo', slot: 1 }, { id: 9, name: 'Cy', slot: 2 }], playLine: 610, locks: [[1, 2]], winMs: 60000 });
    assert.ok(client.sent.some((m) => m.kind === 'crown_leave' && m.match === '00000000000000a2'));
    assert.ok(log.toasts.includes('You are too dead to be racing around.'));
    assert.equal(crownsFeature._state().mp, null);
    assert.equal(crownsFeature._state().record.pendingTicket, null);
  });

  it('a page reloaded out of the arena is told once that it left (instance.js player_logout)', async () => {
    const { crownsFeature, client, engine, log } = await setup();
    const { CROWNS_STREET } = await import('../public/js/game-of-crowns.js?v=crowns-2');
    crownsFeature.restore({ returnTo: { tsid: 'GA5', x: 1, y: 2 } }, engine);
    assert.deepEqual(crownsFeature.reloadLocation({ tsid: CROWNS_STREET }, engine), { tsid: 'GA5', x: 1, y: 2 });
    crownsFeature.onStreetEnter({ tsid: 'GA5' }, engine);
    client.msg({ t: 'crown_left', match: '00000000000000a3', round: 1, seconds: 0 });
    assert.equal(log.activity.filter((t) => t === 'You left the Game of Crowns.').length, 1);
  });

  it('solo still gives a ticket back on a street change', async () => {
    const { crownsFeature } = await import('../public/js/features/crowns-feature.js?v=races3-test-s');
    const engine = { mode: 'solo', inv: {}, query: () => null, toast() {}, updateHud() {}, param: () => null, instanceHold: null, setData() {} };
    crownsFeature.restore({ pendingTicket: CROWNS_TICKET }, engine);
    crownsFeature.onStreetEnter({ tsid: 'GA5' }, engine);
    assert.equal(engine.inv[CROWNS_TICKET], 1);
  });
});
