/**
 * G1022 (report #505): graves are shared online, as in Glitch. Another player sees your grave on
 * the street, may mourn or celebrate it once (graveside_marker.js 37-137), and you get what
 * recognizeDeath gave (player.js 1430-1477): a Hell quest offer or a Diabolical Drink Ticket.
 * js/graves-mp.js, features/graves-mp-feature.js, the remote visit in js/hell-tickets.js, and the
 * server's graves.go texts (skipped without the server repo).
 * Run: node --test tests/graves-mp.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadPixi() {
  const g = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, performance };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(readFileSync(join(ROOT, 'public/vendor/pixi/pixi-8.23.0.min.js'), 'utf8'), g);
  return g.PIXI;
}
class FakeImage {
  constructor() {
    this.naturalWidth = 90;
    this.naturalHeight = 88;
    this.width = 90;
    this.height = 88;
  }
}
const PIXI = loadPixi();
globalThis.PIXI = PIXI;
globalThis.Image = FakeImage;
const { installPixiFixes } = await import('../public/js/pixi-fixes.js?v=0f42b75e');
installPixiFixes(PIXI);

const {
  GRAVE_ACT,
  GRAVE_TEXT,
  applyGraveMessage,
  graveDoneText,
  graveInspectText,
  graveSetMessage,
  graveVerbs,
  normalizeGraveDone,
  normalizeGraveMourned,
} = await import('../public/js/graves-mp.js?v=46171d14');
const { createHellState, croak, resurrect } = await import('../public/js/hell.js?v=0dba5774');
const { normalizeHellTicketsState, remoteGraveVisit } = await import('../public/js/hell-tickets.js?v=33bd7064');
const { createQuestState } = await import('../public/js/quests.js?v=f68437db');
const { hellFeature } = await import('../public/js/features/hell-feature.js?v=8679fcab');
const { hellTicketsFeature } = await import('../public/js/features/hell-tickets-feature.js?v=8f47f82c');
const { gravesMpFeature } = await import('../public/js/features/graves-mp-feature.js?v=bbc41e90');
const { FEATURES } = await import('../public/js/features/index.js?v=67ceb41d');

const STREET = 'GLI2V0UN7RD1T2J';
const HELL_ONE = 'GA5PPFP86NF2FOS';

function deadState(now = Date.now()) {
  return croak(createHellState(), { streetTsid: STREET, x: 100, y: 200, giant: 'alph', now }).state;
}

function fakeClient({ id = 7, name = 'Ada' } = {}) {
  const listeners = new Map();
  return {
    state: 'online',
    me: { id, name },
    answerWaitMs: 5000,
    sent: [],
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    send(kind, payload) {
      if (this.state !== 'online') return false;
      this.sent.push({ t: kind, ...payload });
      return true;
    },
    emit(type, msg) {
      for (const fn of listeners.get(type) || []) fn(msg);
    },
  };
}

function fakeEngine(client, { streetTsid = STREET, hubId = '' } = {}) {
  const log = { prompts: [], activity: [], toasts: [], offers: [], said: [] };
  const registered = [];
  const engine = {
    started: true,
    mode: 'multiplayer',
    PIXI,
    entityLayer: new PIXI.Container(),
    pc: { level: 5, energy: 50, mood: 50, favorAdded: [], addGiantFavor(g, n) { this.favorAdded.push([g, n]); return n; } },
    inv: {},
    questState: createQuestState(),
    streetTsid,
    street: { tsid: streetTsid, hubId, label: 'Street', bounds: { l: 0, t: 0 } },
    player: { x: 100, y: 200, vx: 0, vy: 0 },
    interactables: registered,
    log,
    data: {},
    query: (name) => (name === 'realtimeClient' ? client : null),
    param: () => null,
    setData(k, v) { engine.data[k] = v; },
    busy: () => false,
    questDialogueOpen: () => false,
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
    register(t) { registered.push(t); return t; },
    unregister(t) { const i = registered.indexOf(t); if (i >= 0) registered.splice(i, 1); t?.sprite?.parent?.removeChild(t.sprite); },
    save() {},
    refreshPack() {},
    playSound() {},
    achievement() {},
    pushActivity: (t) => log.activity.push(t),
    toast: (t) => log.toasts.push(t),
    prompt: (p) => log.prompts.push(p),
    say: (target, text) => log.said.push(text),
    offerQuestDialogue: (o) => log.offers.push(o),
  };
  return engine;
}

describe('graves-mp: the messages and the grave\'s verbs (graveside_marker.js)', () => {
  const grave = { owner: 7, name: 'Ada', x: 120, y: -80, giant: 'alph', state: 'none', by: '', age: 1000 };

  it('keeps the street\'s graves by owner, never your own, never another street\'s', () => {
    let map = new Map();
    map = applyGraveMessage(map, { t: 'graves', street: 'LA1', graves: [grave, { ...grave, owner: 9, name: 'Me' }] }, { street: 'GA1', me: 9, now: 5000 });
    assert.deepEqual([...map.keys()], [7]);
    assert.equal(map.get(7).croakedAt, 4000, 'its age on arrival dates the croak on this clock');
    assert.equal(applyGraveMessage(map, { t: 'grave', street: 'GA2', grave: { ...grave, owner: 8 } }, { street: 'GA1' }), map);
    map = applyGraveMessage(map, { t: 'grave', street: 'GA1', grave: { ...grave, state: 'mourn', by: 'Bo' } }, { street: 'GA1' });
    assert.equal(map.get(7).state, 'mourn');
    map = applyGraveMessage(map, { t: 'grave_gone', street: 'GA1', owner: 7 }, { street: 'GA1' });
    assert.equal(map.size, 0);
  });

  it('celebrate, mourn, inspect; the first recognition closes it with the source\'s reasons', () => {
    const open = graveVerbs({ ...grave, state: 'none' });
    assert.deepEqual(open.map((v) => [v.id, v.enabled]), [['celebrate', true], ['mourn', true], ['inspect', true]]);
    assert.equal(open[0].tooltip, 'Celebrate the full and meaningful life of this Glitch');
    const other = graveVerbs({ ...grave, state: 'mourn', by: 'Bo' }, { meName: 'Cy' });
    assert.deepEqual(other.map((v) => v.enabled), [false, false, true]);
    assert.equal(other[1].reason, 'Someone else has already recognized the passing of this Glitch.');
    assert.equal(graveVerbs({ ...grave, state: 'mourn', by: 'Bo' }, { meName: 'Bo' })[0].reason, GRAVE_TEXT.self);
    assert.match(graveInspectText({ ...grave, state: 'celebrate', by: 'Bo', croakedAt: Date.now() }), /^Ada croaked at this spot, on .+\. R\.I\.P\. Their life was celebrated by Bo\.$/);
  });

  it('the recognizer\'s line names the favor that landed; the generic Giant gives none', () => {
    const d = normalizeGraveDone({ t: 'grave_done', owner: 7, verb: 'mourn', ok: true, name: 'Ada', giant: 'alph', favor: 5 });
    assert.equal(graveDoneText(d, 5), 'You mourn the passing of Ada. They have departed from this vale of tears only too soon, and we will not see their like again. You receive 5 favor with Alph, who is pleased by the respect you have shown.');
    const g = normalizeGraveDone({ t: 'grave_done', owner: 7, verb: 'celebrate', ok: true, name: 'Ada', giant: 'generic', favor: 5 });
    assert.equal(g.favor, 0);
    assert.equal(graveDoneText(g), 'You celebrate the life of Ada. They were a good Glitch, a kind Glitch, and they left this world a better place than they found it.');
    assert.equal(normalizeGraveDone({ verb: 'mourn', ok: false, text: GRAVE_TEXT.other }).text, GRAVE_TEXT.other);
    assert.deepEqual(normalizeGraveMourned({ verb: 'celebrate', by: 'Bo', croak: 2 }), { type: 'celebrate', recognizer: 'Bo', croak: 2 });
    assert.equal(normalizeGraveMourned({ verb: 'dance', by: 'Bo', croak: 2 }), null);
  });

  it('the owner shares the grave of a croak on a shared street only', () => {
    const hs = deadState(1000);
    const msg = graveSetMessage(hs, STREET, 4000);
    assert.deepEqual(msg, { croak: hs.visitId, street: STREET, x: 100, y: 171, giant: 'alph', age: 3000, state: 'none', by: '' });
    assert.equal(graveSetMessage(hs, ''), null, 'a private place keeps it your own');
    assert.equal(graveSetMessage({ ...hs, isDead: false }, STREET), null);
  });
});

describe('hell-tickets: a real player\'s recognition is a remote visit', () => {
  it('only for this croak\'s open grave, with the player\'s name', () => {
    const hs = deadState();
    const v = remoteGraveVisit({}, hs, { type: 'mourn', recognizer: 'Bo Bo', croak: hs.visitId, now: 50 });
    assert.deepEqual(v.visit, { visitId: hs.visitId, at: 50, type: 'mourn', recognizer: 'Bo Bo', remote: true });
    assert.equal(normalizeHellTicketsState(v).visit.recognizer, 'Bo Bo', 'a save keeps the real name (companions only otherwise)');
    assert.equal(normalizeHellTicketsState({ visit: { ...v.visit, remote: false } }).visit.recognizer, 'Amp');
    assert.equal(remoteGraveVisit({}, hs, { type: 'mourn', recognizer: 'Bo', croak: hs.visitId + 1 }), null, 'another croak');
    assert.equal(remoteGraveVisit({}, { ...hs, graveMarker: { ...hs.graveMarker, state: 'celebrate' } }, { type: 'mourn', recognizer: 'Bo', croak: hs.visitId }), null, 'a companion was first');
    assert.equal(remoteGraveVisit({}, { ...hs, isDead: false }, { type: 'mourn', croak: hs.visitId }), null);
  });
});

describe('graves-mp-feature (fake engine and socket)', () => {
  beforeEach(() => {
    gravesMpFeature._reset();
    hellTicketsFeature._reset();
    hellTicketsFeature.restore({});
    hellFeature.restore({});
  });

  it('is registered after hell-tickets', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('graves-mp') && ids.indexOf('hell-tickets') < ids.indexOf('graves-mp'));
  });

  it('the dead player: the grave goes to the server at the croak, a mourner\'s word brings the ticket, resurrection clears it', () => {
    const client = fakeClient({ id: 7, name: 'Ada' });
    const engine = fakeEngine(client);
    // Both Hell quests done: recognizeDeath's third branch, the ticket and the prompt.
    engine.questState.completed = ['hell_hole', 'hell_quest'];
    gravesMpFeature.init(engine);
    hellTicketsFeature.init(engine);
    gravesMpFeature.onTick(16, Date.now(), engine);
    // The croak: hell-feature commits the state, then its player:deaths event reaches features.
    hellFeature.restore(deadState());
    gravesMpFeature.onEvent('player:deaths', 1, engine);
    const set = client.sent.find((m) => m.t === 'grave_set');
    assert.equal(set.street, STREET);
    assert.equal(set.croak, hellFeature._state().visitId);
    assert.equal(set.giant, 'alph');

    // In Hell One, the companions' dice say no; then Bo mourns online.
    engine.streetTsid = HELL_ONE;
    engine.street = { ...engine.street, tsid: HELL_ONE, hubId: '40' };
    hellTicketsFeature.restore({ plannedVisitId: hellFeature._state().visitId });
    client.emit('msg:grave_mourned', { t: 'grave_mourned', verb: 'mourn', by: 'Bo', croak: hellFeature._state().visitId });
    assert.equal(hellTicketsFeature._state().visit.recognizer, 'Bo');
    hellTicketsFeature.onTick(16, Date.now() + 10, engine);
    assert.equal(Number(engine.inv.drink_ticket) || 0, 1, 'recognizeDeath: a Diabolical Drink Ticket');
    hellTicketsFeature.onTick(16, Date.now() + 3000, engine);
    assert.equal(engine.log.prompts.at(-1).text, 'Bo has mourned your passing, you received a drink ticket for Wine of the Dead.');
    assert.equal(hellFeature._state().graveMarker.state, 'mourn');

    // A second word for the same grave does nothing.
    client.emit('msg:grave_mourned', { t: 'grave_mourned', verb: 'celebrate', by: 'Cy', croak: hellFeature._state().visitId });
    assert.equal(hellTicketsFeature._state().visit, null);

    // A reconnect sends the grave again, with its state.
    client.state = 'offline';
    gravesMpFeature.onTick(16, Date.now(), engine);
    client.state = 'online';
    client.sent.length = 0;
    gravesMpFeature.onTick(16, Date.now(), engine);
    assert.deepEqual(client.sent.map((m) => [m.t, m.state]), [['grave_set', 'mourn']]);

    // Resurrected: the street's grave goes.
    hellFeature.restore(resurrect(hellFeature._state(), engine.pc, Date.now(), {}).state);
    client.sent.length = 0;
    gravesMpFeature.onTick(16, Date.now(), engine);
    assert.deepEqual(client.sent.map((m) => m.t), ['grave_clear']);
    assert.equal(gravesMpFeature._state().mine.croak, 0);
  });

  it('a croak in a private place is never shared', () => {
    const client = fakeClient();
    const engine = fakeEngine(client);
    engine.homeContext = () => ({ inHome: true });
    gravesMpFeature.init(engine);
    hellFeature.restore(deadState());
    gravesMpFeature.onEvent('player:deaths', 1, engine);
    assert.equal(client.sent.length, 0);
  });

  it('another player\'s grave is drawn on your street; mourning asks the server, and its answer brings the favor', () => {
    const client = fakeClient({ id: 9, name: 'Bo' });
    const engine = fakeEngine(client);
    gravesMpFeature.init(engine);
    client.emit('roster', { street: STREET, players: [] });
    client.emit('msg:graves', { t: 'graves', street: STREET, graves: [{ owner: 7, name: 'Ada', x: 120, y: -80, giant: 'alph', state: 'none', by: '', age: 0 }] });
    gravesMpFeature.onTick(16, Date.now(), engine);
    const target = engine.interactables.find((t) => t.featureId === 'graves-mp');
    assert.equal(target.label, 'Here Lies Ada');
    assert.equal(target.subtitle, 'Someone died here.');
    assert.deepEqual(gravesMpFeature.verbsFor(target, engine).map((v) => v.id), ['celebrate', 'mourn', 'inspect']);

    gravesMpFeature.runVerb(target, 'mourn', engine);
    assert.deepEqual(client.sent.at(-1), { t: GRAVE_ACT, owner: 7, verb: 'mourn' });
    assert.equal(gravesMpFeature.verbsFor(target, engine)[1].enabled, false, 'waiting on the answer');
    gravesMpFeature.runVerb(target, 'mourn', engine);
    assert.equal(client.sent.filter((m) => m.t === GRAVE_ACT).length, 1, 'one ask');
    assert.equal(engine.pc.favorAdded.length, 0, 'nothing before the server says so');

    client.emit('msg:grave_done', { t: 'grave_done', owner: 7, verb: 'mourn', ok: true, name: 'Ada', giant: 'alph', favor: 5 });
    assert.deepEqual(engine.pc.favorAdded, [['alph', 5]]);
    assert.match(engine.log.activity.at(-1), /^You mourn the passing of Ada\..* You receive 5 favor with Alph/);

    client.emit('msg:grave', { t: 'grave', street: STREET, grave: { owner: 7, name: 'Ada', x: 120, y: -80, giant: 'alph', state: 'mourn', by: 'Bo', age: 10 } });
    gravesMpFeature.onTick(16, Date.now(), engine);
    const after = engine.interactables.find((t) => t.featureId === 'graves-mp');
    assert.equal(gravesMpFeature.verbsFor(after, engine)[1].reason, GRAVE_TEXT.self);
    gravesMpFeature.runVerb(after, 'inspect', engine);
    assert.match(engine.log.said.at(-1), /They were mourned by Bo\.$/);

    client.emit('msg:grave_done', { t: 'grave_done', owner: 7, verb: 'celebrate', ok: false, text: GRAVE_TEXT.other });
    assert.equal(engine.log.toasts.at(-1), GRAVE_TEXT.other);

    client.emit('msg:grave_gone', { t: 'grave_gone', street: STREET, owner: 7 });
    gravesMpFeature.onTick(16, Date.now(), engine);
    assert.equal(engine.interactables.filter((t) => t.featureId === 'graves-mp').length, 0);
  });

  it('solo: nothing is sent and no grave of anyone else is drawn', () => {
    const engine = fakeEngine(null);
    engine.mode = 'solo';
    gravesMpFeature.init(engine);
    hellFeature.restore(deadState());
    gravesMpFeature.onEvent('player:deaths', 1, engine);
    gravesMpFeature.onTick(16, Date.now(), engine);
    assert.equal(gravesMpFeature._state().mine.croak, 0);
  });
});

const skipGraves = skipWithoutServer || (existsSync(serverPath('graves.go')) ? false : 'the server repo has no graves.go yet');
describe('the server says the same words (graves.go)', { skip: skipGraves }, () => {
  it('its refusals are the source\'s, and the client\'s', () => {
    const go = readFileSync(serverPath('graves.go'), 'utf8');
    for (const text of [GRAVE_TEXT.self, GRAVE_TEXT.other]) assert.ok(go.includes(`"${text}"`), text);
    assert.match(go, /graveFavor\s+= 5/);
    assert.match(go, /graveLife\s+= 60 \* time\.Minute/);
  });
});

