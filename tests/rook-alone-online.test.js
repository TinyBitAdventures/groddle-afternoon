/**
 * Ticket 19 (2026-11-01): Martial Imagination's skill page said rooks are fought alone so anyone
 * may stun, but online the Focusing Orb refused without the skill, and a lone orb never stunned
 * (an orb is only its players, inc_rook.js doOrbAttack), so a player alone could not fight a Rook.
 * Alone on the street the Rook is fought as in solo (ROOK_SOLO): anyone may start the orb and prime
 * the shrine, and the server lets the street join (groddle-afternoon-server rook.go
 * rookStreetJoiners). With others there the original rules stand (focusing_orb.js:579,
 * npc_shrine_*.js:188).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { rookAttackFeature } from '../public/js/features/rook-attack-feature.js?v=8292bb23';
import { MP_ROOK_TEXT } from '../public/js/rook-mp.js?v=6012319e';
import { SKILL_REMAKE_NOTES } from '../public/js/skill-tree.js?v=53795620';

const root = join(import.meta.dirname, '..');
const TSID = 'LIF12PMQ5121D68';

function rig() {
  const handlers = {};
  const sent = [];
  const client = { me: { id: 7 }, state: 'online', street: TSID, players: [], on: (k, fn) => { (handlers[k] ||= []).push(fn); }, send: (k, p) => { sent.push([k, p]); return true; } };
  const slots = {};
  const toasts = [];
  const engine = {
    started: true, mode: 'multiplayer', street: { tsid: TSID, hubId: '27' }, streetTsid: TSID, interactables: [], player: { x: 400, y: 800 },
    pc: { energy: 500, mood: 500 }, inv: { focusing_orb: 1 }, camera: { x: 0, y: 0, w: 1280 },
    inScene: () => false, transientInstance: () => false, homeContext: () => ({ inHome: false }), busy: () => false, acting: () => false,
    param: () => null, setData: () => {}, say: () => {}, save: () => {}, toast: (m) => toasts.push(m), pushActivity: () => {}, playSound() {},
    updateHud() {}, refreshPack() {}, achievement() {}, floatText() {},
    streetSlot: (id) => (slots[id] ||= {}), query: (k) => (k === 'realtimeClient' ? client : null), learnedSkills: [],
  };
  rookAttackFeature.onStreetClear(engine);
  let t = 10000;
  for (let i = 0; i < 10; i++) { t += 500; rookAttackFeature.onTick(500, t, engine); }
  const fire = (k, m) => (handlers[k] || []).forEach((f) => f(m));
  fire('msg:rook', { street: TSID, attack: { phase: 'build_up', health: 100, maxHealth: 100, stun: 0, maxStun: 125, crowd: 1, clock: 600000, orbs: [] }, rooked: {} });
  return { engine, client, sent, toasts };
}

const stunVerb = (engine) => rookAttackFeature.packVerbs('focusing_orb', engine).find((v) => v.id === 'rook_stun');

describe('A Rook online with no one else on the street (ticket 19)', () => {
  it('lets anyone start the stun when alone, and keeps the original rule with others there', () => {
    const { engine, client } = rig();
    const alone = stunVerb(engine);
    assert.ok(alone, 'the orb offers a stun attack');
    assert.equal(alone.enabled, true, alone.reason);
    client.players = [{ id: 8, name: 'Bo', x: 500, y: 800 }];
    const crowd = stunVerb(engine);
    assert.equal(crowd.enabled, false);
    assert.equal(crowd.reason, MP_ROOK_TEXT.needsMartial);
    engine.learnedSkills = ['martial_imagination_1'];
    assert.equal(stunVerb(engine).enabled, true);
  });

  it('the skill pages say the same, and the prime gate follows the same rule', () => {
    assert.match(SKILL_REMAKE_NOTES['Martial Imagination'].note, /alone, solo or online, anyone may stun/);
    assert.match(SKILL_REMAKE_NOTES.Piety.note, /alone, solo or online, anyone may prime/);
    const feature = readFileSync(join(root, 'public/js/features/rook-attack-feature.js'), 'utf8');
    assert.match(feature, /const pietyless = Boolean\(mp\) && !mpAlone\(\) && !engine\.learnedSkills/);
    assert.match(feature, /if \(!mpAlone\(\) && !engine\.learnedSkills\?\.includes\(MP_ROOK\.primeSkill\)\)/);
  });
});
