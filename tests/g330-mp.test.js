/**
 * G330: Transcendental Radiation, the Transcendental cards and the Meditative
 * Arts distraction cards between real players. The pure client side
 * (js/radiance-mp.js) against the source's numbers, the multiplayer branch of
 * features/meditation-feature.js on a fake realtime client (the radiator pays
 * each pulse once, a receiver gains each pulse once, the end, the quest flag,
 * a chat line breaking a meditation, meditating together), the cards dealt in
 * multiplayer, the server's and the site's halves (radiance.go, Radiance.php;
 * skip without them), and that solo is untouched.
 * Run: node --test tests/g330-mp.test.js
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RADIANCE_TEXT,
  TR_COST_TANK_BANDS,
  burstLines,
  chatInterrupts,
  playersInRange,
  pulseCost,
  pulseGain,
  pulseKey,
  radId,
  radiateEnergyNeeded,
  radiationDistance,
  radiationRank,
  radiatorEnd,
  radiatorLine,
  trCostSkillMultiplier,
  trCostTankMultiplier,
  trSkillMultiplier,
} from '../public/js/radiance-mp.js?v=e3590470';
import { meditationFeature } from '../public/js/features/meditation-feature.js?v=b1d02c1c';
import { createInventory } from '../public/js/inventory.js?v=85d4faba';
import { createToolConditionState } from '../public/js/tools.js?v=9a2e7ef4';
import { HAS_SERVER, HAS_SITE, serverPath, sitePath } from '../tools/repos.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const HAS_GSJS = existsSync(join(GSJS, 'items/focusing_orb.js'));
const orb = () => readFileSync(join(GSJS, 'items/focusing_orb.js'), 'utf8');

const fixed = (v) => () => v;
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    players: [{ id: 2, name: 'Bo', x: 700 }],
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return this.state === 'online'; },
    take(kind) { const out = sent.filter((m) => m.t === kind); return out; },
    clear() { sent.length = 0; },
  };
}

function fakeEngine({ mode = 'multiplayer', client = null, learned = [], upgrades = [], pc = {} } = {}) {
  const calls = { activity: [], toasts: [], events: [], flags: [], floats: [] };
  const data = {};
  const engine = {
    mode,
    started: true,
    pc: { energy: 80, mood: 50, xp: 0, imagination: 0, energyMax: 100, imaginationUpgrades: upgrades, ...pc },
    inv: createInventory({ focusing_orb: 1 }),
    toolState: createToolConditionState(),
    learnedSkills: learned,
    player: { x: 500, y: 400, vx: 0, vy: 0, onGround: true, pivot: { y: 0 }, height: 96, facing: 'right' },
    street: { label: 'Hechey Track' },
    streetTsid: 'GLI2V0UN7RD1T2J',
    query: (name) => (name === 'realtimeClient' ? client : null),
    param: () => null,
    setData: (k, v) => { data[k] = v; },
    toast: (msg) => calls.toasts.push(msg),
    pushActivity: (t) => calls.activity.push(t),
    floatText: (x, y, t) => calls.floats.push(t),
    updateHud() {},
    save() {},
    achievement: (counter, amount) => calls.events.push([counter, amount]),
    questFlag: (f) => calls.flags.push(f),
    transientInstance: () => false,
    acting: () => false,
    busy: () => false,
    playCue: () => Promise.resolve(() => {}),
  };
  return { engine, calls, data };
}

let fetched = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ rank: 1, cards: [], watch: { token: 'tok.sig', expiresIn: 900 } }) };
  };
  meditationFeature._mpReset();
  meditationFeature.restore({});
});
afterEach(() => {
  globalThis.fetch = realFetch;
  meditationFeature._mpReset();
});

describe('radiance-mp: the source numbers', () => {
  it('prices a pulse and its gain from the tank and the rank (focusing_orb.js 1525-1706)', () => {
    assert.equal(TR_COST_TANK_BANDS.length, 19);
    assert.equal(trCostTankMultiplier(100), 0.015);
    assert.equal(trCostTankMultiplier(200), 0.012);
    assert.ok(Math.abs(trCostTankMultiplier(150) - 0.0135) < 1e-12);
    assert.equal(trCostTankMultiplier(20000), 0.0018);
    assert.deepEqual([1, 2, 3].map(trCostSkillMultiplier), [1.0, 1.2, 1.35]);
    assert.deepEqual([1, 2, 3].map(trSkillMultiplier), [1.0, 1.25, 1.5]);
    assert.equal(pulseCost(100, 1), 5); // round(0.015 x 100 x 1 x 3 = 4.5)
    assert.equal(pulseCost(100, 3), 6); // 6.075
    assert.equal(pulseGain(100, 1), 2); // 0.0075 x 100 x 1 x 3 = 2.25
    assert.equal(pulseGain(100, 3), 3); // 3.375
    assert.equal(pulseGain(400, 2), 7); // 0.0048 x 400 x 1.25 x 3 = 7.2
    // verbs.radiate 490-496: the whole session's cost under the energy, plus 2.
    assert.equal(radiateEnergyNeeded(100, 1), 0.015 * 100 * 18 + 2);
  });

  it('reads the rank, the range and the menu hint', () => {
    assert.equal(radiationRank([]), 0);
    assert.equal(radiationRank(['transcendental_radiation_1', 'transcendental_radiation_2']), 2);
    assert.equal(radiationDistance(1), 400);
    assert.equal(radiationDistance(3), 1500);
    assert.equal(radiationDistance(1, ['transcendental_radius_1']), 600);
    assert.equal(radiationDistance(2, ['transcendental_radius_1', 'transcendental_radius_2']), 1600);
    assert.equal(radiationDistance(1, ['transcendental_radius_3']), -1);
    const players = [{ x: 100 }, { x: 600 }, { x: 1500 }];
    assert.equal(playersInRange(players, 500, 400), 2);
    assert.equal(playersInRange(players, 500, -1), 3);
    assert.equal(playersInRange(players, 500, 0), 0);
  });

  it('lines up the burst lines the radiator reads, one a pulse (2141-2172)', () => {
    let i = 0;
    const cycle = () => ((i++ * 0.37) % 1);
    const lines = burstLines(5, 18000, cycle);
    assert.deepEqual(lines.slice(0, 3), ['Each pulse takes 5 Mood and 5 Energy.', 'Click (almost) anywhere or move to stop radiating.', 'You emit a burst. -5 Mood -5 Energy']);
    assert.equal(lines.length, 9); // round(18 / 3) + 3
    for (let i = 1; i < lines.length; i++) assert.notEqual(lines[i], lines[i - 1]);
  });

  it('works out the radiator end bonus (1186-1253)', () => {
    // Full: bonus = round(bonus_amount% x effect), energy only when the pulses took some.
    const full = radiatorEnd({ full: true, effectSeconds: 6 }, { rank: 1, tank: 100, mood: 40, spentEnergy: -10, rng: fixed(0.9) });
    assert.equal(full.effect, 0.0075 * 100 * 6);
    assert.equal(full.img, Math.round(0.06 * 4.5));
    assert.equal(full.energyBonus, full.img);
    assert.equal(full.imgBonus, 0);
    const big = radiatorEnd({ full: true, effectSeconds: 30 }, { rank: 3, tank: 1000, mood: 40, spentEnergy: -1, bonusAmount: 30, rng: fixed(0.9) });
    assert.equal(big.img, Math.round(0.3 * 0.0036 * 1000 * 1.5 * 30));
    const none = radiatorEnd({ full: true, effectSeconds: 6 }, { rank: 1, tank: 100, mood: 40, spentEnergy: 0 });
    assert.equal(none.energyBonus, 0);
    const part = radiatorEnd({ full: false, effectSeconds: 3 }, { rank: 1, tank: 100, spentEnergy: -5 });
    assert.equal(part.img, 0);
    assert.equal(part.energyBonus, 0);
    // Transcendental Highway: 5%, half when the radiator's mood is 0.
    const hw = radiatorEnd({ full: false, effectSeconds: 30 }, { rank: 3, tank: 1000, mood: 0, upgrades: ['transcendental_imagination'], rng: fixed(0.01) });
    assert.equal(hw.imgBonus, Math.round(0.0036 * 1000 * 1.5 * 30 * 0.5));
    assert.equal(radiatorEnd({ effectSeconds: 30 }, { rank: 3, tank: 1000, mood: 9, upgrades: ['transcendental_imagination'], rng: fixed(0.06) }).imgBonus, 0);
  });

  it('builds the radiator line as the source does (1256-1271)', () => {
    assert.equal(radiatorLine({ img: 3, reached: true }, fixed(0)), 'Darn. Got distracted. That was relaxing. +3 iMG Everyone around you gains some mood and energy.');
    assert.equal(radiatorLine({ energy: 2, img: 3 }, fixed(0.5)), 'Whoops. There it goes. That was relaxing. +2 energy, +3 iMG');
    assert.equal(radiatorLine({ energy: -8 }, fixed(0.99)), 'Ah, lost it. That was relaxing.');
    assert.match(radiatorLine({ imgBonus: 7 }, fixed(0)), / Your "Transcendental Highway" upgrade got you an extra 7 iMG!$/);
  });

  it('lets Mantra Meditation keep your own chat from breaking a meditation', () => {
    assert.equal(chatInterrupts([]), true);
    assert.equal(chatInterrupts(['meditative_arts_less_distraction']), true);
    assert.equal(chatInterrupts(['meditative_arts_less_distraction', 'meditative_arts_less_distraction_2']), false);
  });

  it('keeps ids and pulse keys to what the server sends', () => {
    assert.equal(radId('7-3'), '7-3');
    assert.equal(radId('7-x'), '');
    assert.equal(pulseKey('7-3', 2), '7-3:2');
    assert.equal(pulseKey('7-3', 0), '');
  });

  it('quotes the source copy word for word', { skip: HAS_GSJS ? false : 'needs glitch-GameServerJS beside the game' }, () => {
    const src = orb();
    assert.match(src, /"startTRString"\s*: "You feel calmness radiating from pc\. "/);
    assert.ok(src.includes('You feel somewhat transcended by radiation from '));
    assert.ok(src.includes('You feel transcended by radiation from '));
    assert.ok(src.includes('pc.sendActivity("You begin to radiate.");'));
    assert.ok(src.includes(RADIANCE_TEXT.everyone.trim()));
    assert.ok(src.includes("\"There's nobody near enough for you to radiate.\""));
    assert.ok(src.includes("You're givin' it, soul2soul. Yeah. -"));
    assert.ok(src.includes('pc.buffs_apply(\'meditation_cooldown\', {duration: 120});'));
    const player = readFileSync(join(GSJS, 'players/player.js'), 'utf8');
    assert.ok(player.includes('meditation_ok_copy.push("local_chat", "local_chat_start", "party_chat", "groups_chat", "groups_chat_leave", "groups_chat_join", "global_chat", "im_send");'));
    assert.ok(player.includes('meditation_ok_copy.push("im_recv"); // only one incoming type that distracts'));
  });
});

describe('meditation-feature in multiplayer: radiating', () => {
  async function radiate(over = {}) {
    const client = fakeClient();
    const t = fakeEngine({ client, learned: ['meditativearts_2', 'transcendental_radiation_1'], ...over });
    const verbs = meditationFeature.packVerbs('focusing_orb', t.engine);
    const r = verbs.find((v) => v.id === 'radiate');
    assert.equal(r.enabled, true, 'Bo is 200 px off: in range for the menu');
    meditationFeature.runPackVerb('focusing_orb', 'radiate', t.engine);
    await tick();
    await tick();
    return { client, ...t };
  }

  it('asks the site for the signed skill, then the server', async () => {
    const { client } = await radiate();
    assert.ok(fetched.some((u) => u.endsWith('/wp-json/groddle/v1/radiance')));
    // The token asked for on attaching is still on its way: Radiate waits for it, then starts.
    assert.deepEqual(client.sent.map((m) => m.t), ['radiance_watch', 'radiate_start']);
    assert.equal(client.sent[0].token, 'tok.sig');
    assert.equal(client.take('radiate_start')[0].moodless, false);
  });

  it('pays each pulse once, stops when tired, and works out the end', async () => {
    const { client, engine, calls, data } = await radiate({ pc: { energy: 40, mood: 50 } });
    client.msg({ t: 'radiate_started', rad: '1-1', rank: 1, duration: 18000, durationMax: 18000, dist: 400, recipients: 1 });
    const s = meditationFeature._session();
    assert.equal(s.kind, 'transcendental');
    assert.equal(calls.activity.at(-1), 'You begin to radiate.');
    client.msg({ t: 'radiate_burst', rad: '1-1', n: 1, recipients: 1 });
    client.msg({ t: 'radiate_burst', rad: '1-1', n: 1, recipients: 1 });
    client.msg({ t: 'radiate_burst', rad: '9-9', n: 2, recipients: 1 });
    assert.equal(engine.pc.energy, 35);
    assert.equal(engine.pc.mood, 45);
    assert.equal(calls.activity.at(-1), 'Each pulse takes 5 Mood and 5 Energy.');
    // Down to 9 energy: the next pulse (5) would still leave some; at 5 it would not.
    engine.pc.energy = 10;
    client.msg({ t: 'radiate_burst', rad: '1-1', n: 2, recipients: 1 });
    assert.equal(engine.pc.energy, 5);
    assert.equal(meditationFeature._session(), null, 'stopped: the next pulse would leave no energy');
    assert.deepEqual(client.take('radiate_stop').map((m) => m.why), ['tired']);
    assert.ok(meditationFeature._state().cooldownUntil > Date.now() + 119_000);
    client.msg({ t: 'radiate_done', rad: '1-1', why: 'tired', seconds: 7, full: false, maxRelax: false, effectSeconds: 6, pulses: 2, recipients: 1, crowd: 6, flags: ['transcendence_5players'] });
    assert.match(calls.activity.at(-1), /That was relaxing\. Everyone around you gains some mood and energy\.$/);
    assert.deepEqual(calls.flags, ['transcendence_5players']);
    assert.deepEqual(calls.events.filter(([c]) => c !== 'focusing_orb:meditation_time'), [['meditation_seconds', 7], ['transcendence_5players', 1]]);
    assert.equal(meditationFeature._state().totalSeconds, 7);
    assert.match(data.radianceLast, /^done:1-1:tired:7s:part:p2:r1/);
    // A second done for the same radiation does nothing.
    client.msg({ t: 'radiate_done', rad: '1-1', why: 'timer', seconds: 9, full: true, effectSeconds: 9, flags: [] });
    assert.equal(meditationFeature._state().totalSeconds, 7);
  });

  it('tells the server when your mood runs out and stops on a move or a verb', async () => {
    const { client, engine } = await radiate({ pc: { energy: 80, mood: 5 } });
    client.msg({ t: 'radiate_started', rad: '1-2', rank: 1, duration: 9000, durationMax: 18000, recipients: 1 });
    client.msg({ t: 'radiate_burst', rad: '1-2', n: 1, recipients: 1 });
    assert.equal(engine.pc.mood, 0);
    assert.deepEqual(client.take('radiate_mood'), [{ t: 'radiate_mood', moodless: true }]);
    engine.player.x += 20;
    meditationFeature.onTick(16, Date.now(), engine);
    assert.equal(meditationFeature._session(), null);
    assert.deepEqual(client.take('radiate_stop').map((m) => m.why), ['moved']);
  });

  it('refuses at once without the energy for the whole session', () => {
    const client = fakeClient();
    const { engine, calls } = fakeEngine({ client, learned: ['transcendental_radiation_1'], pc: { energy: 29 } });
    const r = meditationFeature.packVerbs('focusing_orb', engine).find((v) => v.id === 'radiate');
    assert.equal(r.enabled, false);
    assert.equal(r.reason, "You don't have enough energy to do that.");
    meditationFeature.runPackVerb('focusing_orb', 'radiate', engine);
    assert.deepEqual(calls.toasts, ["You don't have enough energy to do that."]);
    assert.equal(client.take('radiate_start').length, 0);
  });

  it('shows the server refusal', async () => {
    const { client, calls } = await radiate();
    client.emit('error', { code: 'radiance', message: "There's nobody near enough for you to radiate." });
    assert.deepEqual(calls.toasts, ["There's nobody near enough for you to radiate."]);
  });
});

describe('meditation-feature in multiplayer: receiving', () => {
  it('gains each pulse once from its own tank and the radiator rank, then is told the total', () => {
    const client = fakeClient();
    const { engine, calls, data } = fakeEngine({ client, pc: { energy: 50, mood: 99, energyMax: 400 } });
    meditationFeature.onTick(16, Date.now(), engine); // attaches
    client.msg({ t: 'radiate_felt', rad: '2-1', from: { id: 2, name: 'Bo' } });
    assert.equal(calls.activity.at(-1), 'You feel calmness radiating from Bo.');
    client.msg({ t: 'radiate_pulse', rad: '2-1', from: { id: 2, name: 'Bo' }, rank: 2, mood: true, n: 1 });
    client.msg({ t: 'radiate_pulse', rad: '2-1', from: { id: 2, name: 'Bo' }, rank: 2, mood: true, n: 1 });
    assert.equal(engine.pc.energy, 57); // 0.0048 x 400 x 1.25 x 3 = 7.2 -> 7
    assert.equal(engine.pc.mood, 106);
    client.msg({ t: 'radiate_pulse', rad: '2-1', from: { id: 2, name: 'Bo' }, rank: 2, mood: false, n: 2 });
    assert.equal(engine.pc.energy, 64);
    assert.equal(engine.pc.mood, 106, 'no mood while the radiator has none');
    assert.equal(data.radianceGot, '2-1:2:e14:m7');
    client.msg({ t: 'radiate_ended', rad: '2-1', from: { id: 2, name: 'Bo' }, complete: true });
    assert.equal(calls.activity.at(-1), 'You feel transcended by radiation from Bo. +14 energy, +7 mood');
    client.msg({ t: 'radiate_pulse', rad: '3-1', from: { id: 3, name: 'Cy' }, rank: 1, mood: true, n: 1 });
    client.msg({ t: 'radiate_ended', rad: '3-1', from: { id: 3, name: 'Cy' }, complete: false });
    assert.match(calls.activity.at(-1), /^You feel somewhat transcended by radiation from Cy\. \+\d+ energy, \+\d+ mood$/);
  });
});

describe('meditation-feature in multiplayer: meditating with others', () => {
  it('breaks a radiation on your own chat line, not on others\', and never with Mantra Meditation', () => {
    const run = (upgrades, say) => {
      meditationFeature._mpReset();
      meditationFeature.restore({});
      const client = fakeClient();
      const { engine } = fakeEngine({ client, upgrades });
      meditationFeature.onTick(16, Date.now(), engine);
      client.msg({ t: 'radiate_started', rad: '1-5', rank: 1, duration: 9000, durationMax: 18000, recipients: 1 });
      assert.equal(meditationFeature._session()?.kind, 'transcendental');
      say(client);
      return { ended: meditationFeature._session() === null, why: client.take('radiate_stop').map((m) => m.why) };
    };
    assert.deepEqual(run([], (c) => c.emit('said', { mine: false, text: 'hi' })), { ended: false, why: [] });
    assert.deepEqual(run([], (c) => c.emit('said', { mine: true, text: 'hi' })), { ended: true, why: ['chat'] });
    assert.deepEqual(run([], (c) => c.msg({ t: 'party_said', id: 1, text: 'hi' })), { ended: true, why: ['chat'] });
    assert.deepEqual(run([], (c) => c.msg({ t: 'channel_said', channel: 'global', id: 1, text: 'hi' })), { ended: true, why: ['chat'] });
    assert.deepEqual(run(['meditative_arts_less_distraction'], (c) => c.emit('said', { mine: true })), { ended: true, why: ['chat'] });
    assert.deepEqual(run(['meditative_arts_less_distraction', 'meditative_arts_less_distraction_2'], (c) => c.emit('said', { mine: true })), { ended: false, why: [] });
  });

  it('chatInterrupts drives the feature: said (mine), party_said and channel_said', () => {
    const src = read('public/js/features/meditation-feature.js');
    assert.match(src, /c\.on\('said', \(m\) => \{ if \(m\?\.mine\) chatSaid\(engine\); \}\);/);
    assert.match(src, /c\.on\('msg:party_said'/);
    assert.match(src, /c\.on\('msg:channel_said'/);
    assert.match(src, /function chatSaid\(engine\) \{\n  if \(!session \|\| !chatInterrupts\(upgrades\(engine\)\)\) return;\n  end\(engine, 'chat'\);/);
    assert.match(src, /mp\.client\.send\('meditate_start', \{ kind \}\);/);
    assert.match(src, /engine\.achievement\('meditated_together', mp\.peak\)/);
  });

  it('remembers who meditates on the street for the orb bubble', () => {
    const client = fakeClient();
    const { engine, data } = fakeEngine({ client });
    meditationFeature.onTick(16, Date.now(), engine);
    client.msg({ t: 'meditators', list: [{ id: 2, kind: 'standing' }, { id: 1, kind: 'focused' }] });
    client.msg({ t: 'meditating', id: 3, kind: 'transcendental' });
    assert.equal(data.meditatorsHere, '2,3', 'not yourself');
    client.msg({ t: 'meditating', id: 2, kind: '' });
    assert.equal(data.meditatorsHere, '3');
    client.emit('roster', { street: 'G', players: [{ id: 2 }] });
    assert.deepEqual([...meditationFeature._mp().meditators.keys()], []);
    client.msg({ t: 'meditate_together', n: 4 });
    assert.equal(data.meditationTogether, '4');
  });
});

describe('solo is untouched', () => {
  it('Radiate still says nobody is near, and nothing is sent or fetched', () => {
    const client = fakeClient();
    const { engine, calls } = fakeEngine({ mode: 'solo', client, learned: ['meditativearts_2', 'transcendental_radiation_1'] });
    const verbs = meditationFeature.packVerbs('focusing_orb', engine);
    assert.equal(verbs.find((v) => v.id === 'radiate').enabled, false);
    meditationFeature.runPackVerb('focusing_orb', 'radiate', engine);
    meditationFeature.onTick(16, Date.now(), engine);
    assert.deepEqual(calls.toasts, ["There's nobody near enough for you to radiate."]);
    assert.equal(client.sent.length, 0);
    assert.equal(fetched.length, 0);
  });

  it('the cards stay out of the solo shop', () => {
    const src = read('public/js/features/imagination-feature.js');
    assert.match(src, /offerable: engine\?\.mode === 'multiplayer' \? offeredInMultiplayer : isOfferedInRemake/);
    for (const id of ['transcendental_radius_1', 'transcendental_radius_2', 'transcendental_radius_3', 'transcendental_benefits_1', 'transcendental_benefits_2', 'transcendental_imagination', 'meditative_arts_less_distraction', 'meditative_arts_less_distraction_2']) {
      assert.match(src, new RegExp(`MULTIPLAYER_OFFERS = new Set\\(\\[[^\\]]*'${id}'`), id);
    }
  });

  it('mood decay skips while radiating, as energy decay does (player.js:799, 2361)', () => {
    assert.match(read('public/js/features/mood-decay-feature.js'), /transcendental: meditationFeature\._session\?\.\(\)\?\.kind === 'transcendental'/);
    assert.match(read('public/js/features/energy-decay-feature.js'), /transcendental: meditationFeature\._session\?\.\(\)\?\.kind === 'transcendental'/);
  });
});

describe('the server and the site', () => {
  it('radiance.go keeps the source rules and the messages the game reads', { skip: HAS_SERVER ? false : 'needs the realtime server repo' }, () => {
    const go = readFileSync(serverPath('radiance.go'), 'utf8');
    for (const kind of ['radiance_watch', 'radiate_start', 'radiate_mood', 'radiate_stop', 'meditate_start', 'meditate_stop']) assert.ok(go.includes(`r.Handle("${kind}"`), kind);
    for (const kind of ['radiance_status', 'radiate_started', 'radiate_felt', 'radiate_pulse', 'radiate_burst', 'radiate_ended', 'radiate_done', 'meditating', 'meditators', 'meditate_together']) assert.ok(go.includes(`"t": "${kind}"`), kind);
    assert.match(go, /radPackages = map\[int\]\[2\]int\{1: \{6000, 18000\}, 2: \{9000, 21000\}, 3: \{12000, 30000\}\}/);
    assert.match(go, /map\[int\]float64\{1: 400, 2: 800, 3: 1500\}/);
    assert.match(go, /radCooldown\s+= 120 \* time\.Second/);
    assert.match(go, /radCrowdFlag\s+= 6/);
    assert.ok(go.includes(RADIANCE_TEXT.alone));
  });

  it('Radiance.php signs the rank and the cards from the save', { skip: HAS_SITE ? false : 'needs the site repo' }, () => {
    const php = readFileSync(sitePath('src/Radiance.php'), 'utf8');
    assert.match(php, /#\[Route\(Method::Get, '\/groddle\/v1\/radiance', policy: new Policy\(Access::SignedIn\)\)\]/);
    assert.match(php, /'k' => 'radiance', 'sub' => \$me, 'r' => \$rank, 'u' => implode\(',', \$cards\)/);
    assert.match(php, /\$state\['systems'\]\['skills'\]\['learned'\]/);
    assert.match(php, /\$state\['player'\]\['imaginationUpgrades'\]/);
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new Radiance\(\$minn\)/);
    assert.match(read('public/js/minn-account.js'), /async radiance\(\) \{\n      return buddyCall\('Checking your radiance', 'radiance'\);/);
  });
});
