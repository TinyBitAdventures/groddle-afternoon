// #733 follow-up (tidyk2, 2026-11-27): while a window waits on Play here (another window took over,
// 'replaced', or it slept, 'asleep': js/online-request.js PLAY_HERE_STATES), the verb menu greys what a
// feature would refuse now (game.js playHereVerbs asks verbRefusedNow). A Rooked Piggy's Revive (and
// Apply Balm) asks the street's Rook (rook_revive), but rook-attack-feature had no verbRefusedNow, so
// Revive stayed usable there while every other shared verb was greyed, and the ask went to a socket
// that was gone. Glitch asked for a reload after a long silence (NetController.as 596-603), so nothing
// could be pressed meanwhile.
// Run: node --test tests/play-here-rook-revive.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { OFFLINE_LINE, PLAY_HERE_STATES } from '../public/js/online-request.js?v=5fa7a635';

const featureCopy = async (name) => (await import(`../public/js/features/rook-attack-feature.js?fresh=play-here-rook-${name}`)).rookAttackFeature;
const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const playHereBody = game.match(/function playHereVerbs\(target, verbs\) \{([\s\S]*?)\n\}/)[1];

const TSID = 'GA5215DAMMR2G95';
const ME = 500;

function sprite(x) {
  return { x, y: 800, visible: true, destroyed: false, scale: { x: 1, set() {} }, textures: [{}], gotoAndPlay() {}, play() {} };
}

function onlineEngine(interactables, sent) {
  const handlers = {};
  const client = {
    me: { id: ME },
    state: 'online',
    street: TSID,
    players: [],
    on: (k, fn) => { (handlers[k] ||= []).push(fn); },
    send: (k, p) => { sent.push([k, p]); return true; },
  };
  const engine = {
    started: true,
    mode: 'multiplayer',
    street: { tsid: TSID, hubId: '58', hubName: 'Uralia' },
    streetTsid: TSID,
    interactables,
    player: { x: 300, y: 800 },
    pc: { energy: 500, mood: 500 },
    inv: {},
    camera: { x: 0, y: 0, w: 1280 },
    platforms: [],
    inScene: () => false,
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    busy: () => false,
    acting: () => false,
    param: () => null,
    setData: () => {},
    say: () => {},
    save: () => {},
    toast: () => {},
    pushActivity: () => {},
    playSound: () => {},
    updateHud: () => {},
    refreshPack: () => {},
    achievement: () => {},
    floatText: () => {},
    streetSlot: () => ({}),
    query: (k) => (k === 'realtimeClient' ? client : null),
    learnedSkills: [],
  };
  const fire = (k, m) => (handlers[k] || []).forEach((f) => f(m));
  return { engine, client, fire };
}

describe('#733 follow-up: a Rooked Piggy\'s Revive while the window waits on Play here', () => {
  it('is greyed with "You need to be online to do that." in the Play here states, usable online', async () => {
    const feature = await featureCopy('a');
    const piggy = { classId: 'npc_piggy', label: 'Piggy', classIndex: 0, sprite: sprite(320), state: {}, name: 'piggy 0' };
    const sent = [];
    const { engine, client, fire } = onlineEngine([piggy], sent);
    feature.onStreetClear(engine);
    let clock = 50_000;
    for (let i = 0; i < 8; i += 1) { clock += 500; feature.onTick(500, clock, engine); }
    fire('msg:rook', { street: TSID, snap: true, attack: null, rooked: { 'npc_piggy:0': { class: 'npc_piggy', doses: 0, by: [] } } });
    assert.equal(feature.targetRooked(piggy, engine), true);

    const host = createFeatureHost([feature]);
    // game.js's features: realtime-feature answers realtimeClient, the rest are the features' own answers.
    const features = { query: (hook, ...a) => (hook === 'realtimeClient' ? client : host.query(hook, ...a)) };
    const menu = () => new Function('features', 'engine', 'PLAY_HERE_STATES', 'target', 'verbs', playHereBody)(
      features, engine, PLAY_HERE_STATES, piggy, feature.verbOverride(piggy, engine),
    );
    const revive = () => menu().find((v) => v.id === 'rook_revive');
    assert.equal(revive().enabled, true, 'online: Revive is offered');
    assert.equal(host.query('verbRefusedNow', piggy, 'rook_revive', engine) ?? null, null, 'online: not refused');

    for (const state of PLAY_HERE_STATES) {
      client.state = state;
      client.street = '';
      fire('state', { state });
      const r = revive();
      assert.equal(r.enabled, false, `${state}: Revive is greyed`);
      assert.equal(r.reason, OFFLINE_LINE, `${state}: with the line it would be refused with`);
    }
    feature.onStreetClear(engine);
  });

  it('solo: a Rooked Piggy is never refused by it (no realtime client)', async () => {
    const feature = await featureCopy('solo');
    assert.equal(feature.verbRefusedNow?.({ classId: 'npc_piggy' }, 'rook_revive', { mode: 'solo' }) ?? null, null);
  });
});
