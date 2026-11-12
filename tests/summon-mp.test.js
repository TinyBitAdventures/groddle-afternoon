/**
 * Summoning another player with Teleportation V (multiplayer): the summoner's
 * rules and payment (js/teleportation.js canSummon / paySummon), the menu
 * entry and words (js/summon-mp.js), the list menu keeping it, and the world
 * side (features/summon-mp-feature.js with the teleportation feature's
 * teleportSummon) driven by the server's messages through a fake client and
 * engine. The server's rules are its own tests (groddle-afternoon-server
 * summon_test.go).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SUMMONS_PER_DAY,
  SUMMON_CHECK_TEXT,
  TELEPORT_TEXT,
  canSummon,
  createTeleportState,
  maxSummons,
  paySummon,
  rollTeleportDay,
} from '../public/js/teleportation.js?v=e95cf7cb';
import { SUMMON_TEXT, SUMMON_VERB, askedText, summonRefusal, summonVerb } from '../public/js/summon-mp.js?v=42c1557d';
import { BLOCKED_PLAYER_VERBS, FROM_LIST_VERBS, playerMenuRows } from '../public/js/ui/player-menu.js?v=1b8de1ef';
import { summonMpFeature } from '../public/js/features/summon-mp-feature.js?v=6389f111';
import { teleportationFeature } from '../public/js/features/teleportation-feature.js?v=bf2b1aab';

const ROOT = join(import.meta.dirname, '..');
const V = ['teleportation_1', 'teleportation_2', 'teleportation_3', 'teleportation_4', 'teleportation_5'];
const NOW = 1_800_000_000_000;

describe('Summons: the summoner rules (inc_teleportation.js can_summon 729-835)', () => {
  const base = { learned: V, now: NOW, energy: 80, tank: 100 };

  it('is Teleportation V only, two a game day, at a tenth of the tank', () => {
    assert.equal(maxSummons(V.slice(0, 4)), 0);
    assert.equal(maxSummons(V), SUMMONS_PER_DAY);
    assert.equal(SUMMONS_PER_DAY, 2);
    assert.deepEqual(canSummon(createTeleportState(), base), { ok: true, energyCost: 10 });
    assert.equal(canSummon(createTeleportState(), { ...base, learned: V.slice(0, 4) }).error, SUMMON_CHECK_TEXT.outToday);
  });

  it('refuses in the source order with its words', () => {
    const s = createTeleportState();
    const err = (ctx, state = s) => canSummon(state, { ...base, ...ctx }).error;
    assert.equal(err({ teleporting: true, dead: true }), TELEPORT_TEXT.already);
    assert.equal(err({ dead: true, pooped: true }), 'You are dead.');
    assert.equal(err({ pooped: true }), 'You are too Pooped to teleport. Eat something first!');
    assert.equal(err({ contraband: true }), "That fragile Contraband won't survive teleportation.");
    assert.equal(err({}, { ...s, cooldownUntil: NOW + 1000 }), 'You teleported too recently.');
    assert.equal(err({ rooked: true }), 'You are still under the effects of a Rook attack.');
    assert.equal(err({ asking: true }), 'You can only summon one player at a time.');
    assert.equal(err({ place: 'here' }), "You can't summon people here.");
    assert.equal(err({ place: 'them' }), "You can't summon them here.");
    assert.equal(err({}, { ...s, summonsToday: 2 }), 'You cannot summon anymore today.');
    assert.equal(err({ energy: 10 }), "You don't have enough energy.");
  });

  it('pays one of the day, its energy and the cooldown; a Party Space sets no cooldown (678)', () => {
    const out = paySummon(createTeleportState(), base);
    assert.equal(out.ok, true);
    assert.equal(out.energyCost, 10);
    assert.equal(out.state.summonsToday, 1);
    assert.equal(out.state.cooldownUntil, NOW + 5000);
    assert.deepEqual(out.events, [{ counter: 'teleportation_others:summoner', amount: 1 }]);
    const party = paySummon(createTeleportState(), { ...base, party: true });
    assert.equal(party.state.cooldownUntil, 0);
    // The one being paid for is not "one at a time".
    assert.equal(paySummon(createTeleportState(), { ...base, asking: true }).ok, true);
    assert.equal(paySummon({ summonsToday: 2 }, base).ok, false);
  });

  it('starts over each game day (teleportation_reset_counters)', () => {
    const s = rollTeleportDay({ dayKey: 'a', summonsToday: 2 }, 'b');
    assert.equal(s.summonsToday, 0);
    assert.equal(rollTeleportDay({ dayKey: 'b', summonsToday: 2 }, 'b').summonsToday, 2);
  });
});

describe('Summons: the menu entry and the words (main.js 3661-3715, 3878-3935)', () => {
  it('offers Summon <name> with Teleportation V only, greyed with the reason', () => {
    assert.equal(summonVerb({ targetId: 2, name: 'Bo', rank: 4, check: { ok: true, energyCost: 10 } }), null);
    const on = summonVerb({ targetId: 2, name: 'Bo', rank: 5, check: { ok: true, energyCost: 10 } });
    assert.equal(on.id, SUMMON_VERB);
    assert.equal(on.label, 'Summon Bo');
    assert.equal(on.tooltip, 'Summon this player to your location. -10 energy');
    assert.equal(on.enabled, true);
    const off = summonVerb({ targetId: 2, name: 'Bo', rank: 5, check: { ok: false, error: 'You cannot summon anymore today.', energyCost: 10 } });
    assert.equal(off.enabled, false);
    assert.equal(off.reason, 'You cannot summon anymore today.');
  });

  it('uses the source strings', () => {
    assert.equal(SUMMON_TEXT.confirm(10), 'Are you sure you want to summon this player to your location. -10 energy?');
    assert.equal(SUMMON_TEXT.waiting('Bo'), 'Waiting for Bo to confirm.');
    assert.equal(askedText({ name: 'Ada', place: 'Groddle Meadow' }), 'Ada would like to summon you to Groddle Meadow. Do you accept?');
    assert.equal(askedText({ name: 'Ada', place: 'GA5', party: 'Toxic Moon' }), 'Ada would like to invite you to their party in Toxic Moon. Do you accept?');
    assert.equal(SUMMON_TEXT.onTheirWay('Bo'), 'Bo is on their way!');
    assert.equal(SUMMON_TEXT.declined('Bo'), 'Bo did not accept your summons.');
    assert.equal(SUMMON_TEXT.summoning('Bo', 10), 'Summoning Bo to your location. -10 energy');
    assert.equal(SUMMON_TEXT.oops, 'Oops. Something happened with that teleport.');
    for (const v of Object.values(SUMMON_TEXT)) {
      const text = typeof v === 'function' ? v('Bo', 'X') : v;
      assert.ok(!text.includes(String.fromCharCode(0x2014)), 'no em-dashes');
    }
  });

  it("refuses for the target's own state without a prompt (can_summon 740-759)", () => {
    assert.equal(summonRefusal({}), '');
    assert.equal(summonRefusal({ dead: true }), 'dead');
    assert.equal(summonRefusal({ busy: true }), 'busy');
    assert.equal(summonRefusal({ contraband: true, dead: true }), 'contraband');
  });

  it('keeps Summon in the list menu and drops it for a blocked player', () => {
    assert.ok(FROM_LIST_VERBS.includes(SUMMON_VERB));
    assert.ok(!BLOCKED_PLAYER_VERBS.includes(SUMMON_VERB));
    const rows = playerMenuRows([{ id: SUMMON_VERB, label: 'Summon Bo', enabled: false, reason: 'You are dead.' }, { id: 'mp_trade', label: 'Offer to Trade' }]);
    assert.deepEqual(rows.map((r) => r.id), [SUMMON_VERB]);
    assert.equal(rows[0].reason, 'You are dead.');
  });

  it('is registered as a feature', () => {
    const index = readFileSync(join(ROOT, 'public/js/features/index.js'), 'utf8');
    assert.match(index, /import \{ summonMpFeature \} from '\.\/summon-mp-feature\.js\?v=[0-9a-f]{8}'; FEATURES\.push\(summonMpFeature\);/);
  });
});

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
    send(kind, payload) { sent.push([kind, payload]); return true; },
  };
}

function fakeEngine(client, over = {}) {
  const log = { prompts: [], removed: [], activity: [], toasts: [], achievements: [], entered: [], data: {}, buffs: new Set(), party: [] };
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'GA5A',
    street: { label: 'Groddle Meadow' },
    learnedSkills: [...V],
    pc: { energy: 80 },
    player: { x: 100, y: -100, alpha: 1, height: 96 },
    dead: false,
    inQuestRoom: false,
    partySpace: { here: false, enter: true },
    log,
    PIXI: { Graphics: class { constructor() { this.destroyed = false; } clear() {} roundRect() {} circle() {} fill() {} destroy() { this.destroyed = true; } } },
    fxLayer: { addChild() {} },
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'isDead') return engine.dead;
      if (hook === 'teleportSummon') return teleportationFeature.teleportSummon(args[0], args[1], args[2]);
      if (hook === 'summonPartySpace') { log.party.push(args[0]); return engine.partySpace[args[0]]; }
      if (hook === 'labelFor') return args[0] === 'GA5B' ? { street: 'Sylvan Grove' } : null;
      return null;
    },
    prompt(opts) { log.prompts.push(opts); return `p${log.prompts.length}`; },
    removePrompt(uid) { log.removed.push(uid); },
    pushActivity(text) { log.activity.push(text); },
    toast(text) { log.toasts.push(text); },
    setData(k, v) { log.data[k] = String(v); },
    param: () => null,
    streetExists: (tsid) => /^GA5/.test(tsid),
    travelGate: () => ({ ok: true }),
    transientInstance: () => engine.inQuestRoom,
    homeContext: () => ({ inHome: false }),
    hasBuff: (id) => log.buffs.has(id),
    achievement(counter, amount) { log.achievements.push([counter, amount]); },
    closeMap() {},
    updateHud() {},
    save() {},
    enter(tsid, opts) { log.entered.push([tsid, opts]); return Promise.resolve(); },
    targetVerbs: () => [{ id: 'mp_trade', label: 'Offer to Trade' }],
    ...over,
  };
  return engine;
}

describe('Summons: the world side', () => {
  const client = fakeClient();
  const engine = fakeEngine(client);
  const bo = { classId: 'pc_remote', playerId: 2, label: 'Bo' };
  const last = () => engine.log.prompts[engine.log.prompts.length - 1];

  it('answers nothing in solo', () => {
    const solo = fakeEngine(fakeClient(), { mode: 'solo' });
    summonMpFeature.onTick(16, NOW, solo);
    assert.equal(summonMpFeature.verbOverride(bo, solo), null);
    assert.equal(globalThis.groddleSummonMp, undefined);
  });

  it('adds Summon <name> to another player and asks before sending', () => {
    teleportationFeature.restore({});
    summonMpFeature.onTick(16, NOW, engine);
    const verbs = summonMpFeature.verbOverride(bo, engine);
    assert.deepEqual(verbs.map((v) => v.id), ['mp_trade', SUMMON_VERB]);
    assert.equal(verbs[1].tooltip, 'Summon this player to your location. -10 energy');
    assert.equal(summonMpFeature.runVerbOverride(bo, SUMMON_VERB), true);
    const confirm = last();
    assert.equal(confirm.modal, true);
    assert.equal(confirm.text, 'Are you sure you want to summon this player to your location. -10 energy?');
    assert.deepEqual(confirm.choices.map((c) => c.label), ["Yes, I'm sure", 'Never mind']);
    confirm.onChoice('no');
    assert.equal(client.sent.length, 0);
    summonMpFeature.runVerbOverride(bo, SUMMON_VERB);
    last().onChoice('yes');
    assert.deepEqual(client.sent.pop(), ['summon', { id: 2 }]);
  });

  it('waits, and while waiting Summon is one at a time', () => {
    client.msg({ t: 'summon_waiting', id: 2, name: 'Bo', timeout: 30 });
    assert.equal(last().text, 'Waiting for Bo to confirm.');
    assert.equal(last().timeout, 30);
    assert.equal(engine.log.data.summonMpState, 'asking:2');
    const verb = summonMpFeature.verbOverride(bo, engine).find((v) => v.id === SUMMON_VERB);
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, 'You can only summon one player at a time.');
  });

  it('pays on their yes: energy, the day count, the cooldown, the counter and the lines', () => {
    const waitingUid = `p${engine.log.prompts.length}`;
    client.msg({ t: 'summon_pay', id: 2, name: 'Bo' });
    assert.ok(engine.log.removed.includes(waitingUid), 'the waiting prompt goes');
    assert.deepEqual(client.sent.pop(), ['summon_paid', { id: 2, ok: true }]);
    assert.equal(engine.pc.energy, 70);
    assert.equal(teleportationFeature._state().summonsToday, 1);
    assert.ok(teleportationFeature._state().cooldownUntil > Date.now());
    assert.deepEqual(engine.log.achievements.at(-1), ['teleportation_others:summoner', 1]);
    assert.equal(engine.log.activity.at(-1), 'Summoning Bo to your location. -10 energy');
    assert.equal(last().text, 'Bo is on their way!');
    assert.equal(last().timeout, 10);
    assert.equal(engine.log.data.summonMpState, 'idle');
  });

  it('cannot pay twice past the day or the cooldown: ok false, and says why', () => {
    client.msg({ t: 'summon_pay', id: 2, name: 'Bo' });
    assert.deepEqual(client.sent.pop(), ['summon_paid', { id: 2, ok: false }]);
    assert.equal(engine.log.activity.at(-1), 'You teleported too recently.');
    assert.equal(engine.pc.energy, 70);
  });

  it('says a no, a refusal and an Oops', () => {
    client.msg({ t: 'summon_declined', id: 2, name: 'Bo', text: 'Bo did not accept your summons.' });
    assert.equal(engine.log.activity.at(-1), 'Bo did not accept your summons.');
    assert.equal(last().text, 'Bo did not accept your summons.');
    client.msg({ t: 'summon_refused', id: 2, name: 'Bo', why: 'dead', text: 'They are dead.' });
    assert.equal(engine.log.toasts.at(-1), 'They are dead.');
    client.msg({ t: 'summon_failed', text: 'Oops. Something happened with that teleport.' });
    assert.equal(engine.log.activity.at(-1), 'Oops. Something happened with that teleport.');
  });

  it('asks the target with Yes and No, and answers', () => {
    client.msg({ t: 'summon_asked', from: { id: 7, name: 'Ada' }, street: 'GA5B', timeout: 30 });
    const ask = last();
    assert.equal(ask.text, 'Ada would like to summon you to Sylvan Grove. Do you accept?');
    assert.deepEqual(ask.choices.map((c) => c.label), ['Yes', 'No']);
    assert.equal(ask.timeout, 30);
    ask.onChoice('yes');
    assert.deepEqual(client.sent.pop(), ['summon_answer', { from: 7, accept: true }]);
    client.msg({ t: 'summon_asked', from: { id: 8, name: 'Cy' }, street: 'PARTY_1', party: 'Toxic Moon', timeout: 30 });
    assert.equal(last().text, 'Cy would like to invite you to their party in Toxic Moon. Do you accept?');
    last().onTimeout();
    assert.deepEqual(client.sent.pop(), ['summon_answer', { from: 8, accept: false }]);
    // An answered-elsewhere summons takes its prompt away.
    client.msg({ t: 'summon_asked', from: { id: 9, name: 'Dee' }, street: 'GA5B', timeout: 30 });
    const uid = `p${engine.log.prompts.length}`;
    client.msg({ t: 'summon_gone', from: 9 });
    assert.ok(engine.log.removed.includes(uid));
  });

  it("refuses without a prompt when the target's game holds them", () => {
    const before = engine.log.prompts.length;
    engine.dead = true;
    client.msg({ t: 'summon_asked', from: { id: 7, name: 'Ada' }, street: 'GA5B', timeout: 30 });
    assert.deepEqual(client.sent.pop(), ['summon_answer', { from: 7, accept: false, why: 'dead' }]);
    engine.dead = false;
    engine.inQuestRoom = true;
    client.msg({ t: 'summon_asked', from: { id: 7, name: 'Ada' }, street: 'GA5B', timeout: 30 });
    assert.deepEqual(client.sent.pop(), ['summon_answer', { from: 7, accept: false, why: 'busy' }]);
    engine.inQuestRoom = false;
    engine.log.buffs.add('dont_get_caught');
    client.msg({ t: 'summon_asked', from: { id: 7, name: 'Ada' }, street: 'GA5B', timeout: 30 });
    assert.deepEqual(client.sent.pop(), ['summon_answer', { from: 7, accept: false, why: 'contraband' }]);
    engine.log.buffs.delete('dont_get_caught');
    assert.equal(engine.log.prompts.length, before);
  });

  it('goes where the server says: a shimmer, then beside the summoner, counted as summonee', async () => {
    client.msg({ t: 'summon_go', from: { id: 7, name: 'Ada' }, street: 'GA5B', x: 420, y: -120, party: false });
    assert.equal(engine.log.activity.at(-1), 'Ada summoned you.');
    assert.equal(engine.log.data.teleportPhase, 'warp');
    // The shimmer runs its second (TELEPORT_HIT_ANIMATION_MS), then the landing.
    teleportationFeature.onTick(16, Date.now() + 2000, engine);
    await Promise.resolve();
    assert.deepEqual(engine.log.entered.at(-1), ['GA5B', { spawnX: 420, spawnY: -120 }]);
    globalThis.requestAnimationFrame ??= () => 0;
    teleportationFeature.onStreetEnter({ tsid: 'GA5B' }, { ...engine, floatText() {} });
    assert.deepEqual(engine.log.achievements.at(-1), ['teleportation_others:summonee', 1]);
    assert.equal(engine.log.activity.at(-1), 'You teleported to Sylvan Grove.');
  });

  it('into a Party Space it enters the space; a street it does not know is an Oops', () => {
    client.msg({ t: 'summon_go', from: { id: 7, name: 'Ada' }, street: 'PARTY_1', party: true });
    assert.equal(engine.log.party.at(-1), 'enter');
    assert.equal(engine.log.activity.at(-1), 'Ada summoned you.');
    client.msg({ t: 'summon_go', from: { id: 7, name: 'Ada' }, street: 'GZZZ', x: 0, y: 0, party: false });
    assert.equal(engine.log.activity.at(-1), 'Oops. Something happened with that teleport.');
  });

  it("a summoner in a quest room can't summon, in a Party Space can", () => {
    teleportationFeature.restore({});
    engine.inQuestRoom = true;
    let verb = summonMpFeature.verbOverride(bo, engine).find((v) => v.id === SUMMON_VERB);
    assert.equal(verb.reason, "You can't summon people here.");
    engine.partySpace.here = true;
    verb = summonMpFeature.verbOverride(bo, engine).find((v) => v.id === SUMMON_VERB);
    assert.equal(verb.enabled, true);
    engine.inQuestRoom = false;
    engine.partySpace.here = false;
  });
});
