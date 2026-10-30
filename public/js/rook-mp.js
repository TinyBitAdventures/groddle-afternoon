/**
 * Group Rook attacks in multiplayer (phase 4): the pure half of the client.
 * No DOM, no Pixi. js/features/rook-attack-feature.js uses it only in
 * multiplayer, where the realtime server (groddle-afternoon-server/rook.go, protocol in its
 * header) owns each street's attack: phase, health, stun, orbs, the primed
 * shrine, wing beats and the rooked things left behind. This module turns the
 * server's messages into the attack and rooked rows the feature's existing
 * Rook UI draws, and each player's own share (rook_you) into what lands on
 * their own save.
 *
 * Multiplayer uses the source rules where real players exist (Austin's call,
 * 2026-10-25): no ROOK_SOLO here. Costs are the source's full values
 * (focusing_orb.js stun_attack 607: 50 energy; onOverlayClicked 1720: 25;
 * npc_shrine_*.js prime 216: 10; include/rook.js 15-21: 20 energy and 20 mood a
 * wing beat; doReviveComplete 187-188: 25 and 25), Rook Armor halves energy and
 * spares mood where the source says so, starting an orb needs Martial
 * Imagination I and priming needs Piety I (focusing_orb.js:577-580,
 * npc_shrine_*.js:186-190), orbs gather real players only, a shrine strike is
 * 10% of the offering's base cost (250 per emblem of the shrine's own Giant)
 * with no solo crowd multiplier, and each player gives one revive dose.
 */

import { ROOK_SOURCE, ROOK_TEXT, isRookableClass, strikeDamageFor } from './rook-attack.js?v=c06c0537';

/** The server's limits (groddle-afternoon-server/rook.go). */
export const MP_ROOK = Object.freeze({
  maxSyncKeys: 64,
  joinEnergy: 25,
  joinXp: 10,
  stunSkill: 'martial_imagination_1',
  primeSkill: 'piety_1',
  orbWindowMs: 15000,
});

export const MP_ROOK_TEXT = Object.freeze({
  needsMartial: 'You need to know Martial Imagination to start stun attacks, or team up with someone who does.', // focusing_orb.js:579
  needsPiety: 'You need to know Piety I to prime Shrines during Rook Attacks.', // npc_shrine_*.js:188
  joinTired: 'You do not have enough energy to contribute to this stun attack.', // focusing_orb.js:1715
  joined: (energy, xp) => `You focus your thoughts on the orb. You lose ${energy} energy${xp ? ` and gain ${xp} iMG` : ''}.`, // 1722-1725
  broke: (xp, mood) => `The orb was pushed past the breaking point! You gain ${xp} iMG${mood ? ` but you lose ${mood} mood` : ''}.`, // inc_rook.js:799
  joinHint: (name) => `${name} started a stun attack. Click the orb over them to focus your imagination on it.`, // inc_rook.js:491
  orbClick: 'Click to focus your imagination on the orb.', // inc_rook.js:491
  primedBy: (name) => `${name} primed the shrine. Strike the Rook with an offering!`,
  primedYou: 'The shrine is primed. Strike the Rook with an offering!',
  stronger: 'More Glitches arrive, and the Rook grows stronger.',
  wingBeat: (energy, mood) => `The Rook attacks! You lose ${energy} energy${mood ? ` and ${mood} mood` : ''}.`,
});

const KEY_RE = /^([a-z_]{1,24}):(\d{1,3})$/;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const PHASES = new Set(['herald', 'build_up', 'angry', 'stunned', 'dead', 'departed']);

/** The rookable keys this client has on the street, as the server takes them (at most 64). */
/**
 * The shared tree behind each tree key (js/street-objects.js treeId), for
 * rook_sync's objs: the server strips a rooked tree's fruit and health for
 * everyone and holds its harvest until it is revived (groddle-afternoon-server
 * rook.go, objects.go rookTree).
 */
export function syncObjs(entries) {
  const out = {};
  const keys = new Set(syncKeys(entries));
  for (const e of entries || []) {
    const index = e?.target?.treeIndex;
    if (keys.has(e.key) && Number.isInteger(index) && index >= 0) out[e.key] = `tree:${index}`;
  }
  return out;
}

export function syncKeys(entries) {
  const out = [];
  for (const e of entries || []) {
    const key = String(e?.key || '');
    const m = KEY_RE.exec(key);
    if (!m || !isRookableClass(m[1])) continue;
    out.push(key);
    if (out.length >= MP_ROOK.maxSyncKeys) break;
  }
  return out;
}

/**
 * The server's Attack (rook.go attackState) as the feature's attack object:
 * the fields js/rook-attack.js state machines use, with the server's
 * clock turned into this client's own timestamps. Null when there is none.
 */
export function attackFromServer(raw, tsid, nowMs) {
  if (!raw || typeof raw !== 'object' || !PHASES.has(raw.phase)) return null;
  const clock = Math.max(0, num(raw.clock));
  const at = clock > 0 ? nowMs + clock : null;
  const phase = raw.phase;
  const a = {
    mp: true,
    tsid: String(tsid || ''),
    phase,
    angryState: phase === 'angry' ? String(raw.angry || 'angry1') : '',
    health: Math.max(0, Math.floor(num(raw.health))),
    maxHealth: Math.max(1, Math.floor(num(raw.maxHealth, 1))),
    stun: Math.max(0, Math.floor(num(raw.stun))),
    maxStun: Math.max(1, Math.floor(num(raw.maxStun, ROOK_SOURCE.maxStun))),
    crowd: Math.max(1, Math.floor(num(raw.crowd, 1))),
    wingBeats: Math.max(0, Math.floor(num(raw.wingBeats))),
    // js/rook-attack.js rookClockS reads these.
    attackAt: phase === 'herald' ? at : null,
    wingBeatAt: phase === 'build_up' || phase === 'angry' ? at : null,
    recoveryAt: phase === 'stunned' ? at : null,
    clearAt: phase === 'dead' || phase === 'departed' ? at : null,
    // The herald dims the sky over its 30 s (rook-attack-feature onTick).
    startedAt: phase === 'herald' && at ? at - 30000 : nowMs,
    orbs: [],
    primed: null,
    shrine: null,
  };
  for (const o of Array.isArray(raw.orbs) ? raw.orbs : []) {
    const by = num(o?.by, 0);
    if (!by) continue;
    const joiners = (Array.isArray(o.joiners) ? o.joiners : []).map((id) => num(id, 0)).filter(Boolean);
    a.orbs.push({ by, name: String(o.name || ''), joiners, fireAt: nowMs + Math.max(0, num(o.in)) });
  }
  if (raw.primed && typeof raw.primed === 'object' && num(raw.primed.by, 0)) {
    a.primed = { by: num(raw.primed.by), name: String(raw.primed.name || ''), until: nowMs + Math.max(0, num(raw.primed.in)) };
  }
  if (raw.shrine && typeof raw.shrine === 'object') {
    a.shrine = { x: num(raw.shrine.x), y: num(raw.shrine.y), giant: String(raw.shrine.giant || '') };
  }
  return a;
}

/** The server's rooked map as the feature's slot rows ({ classId, doses, by, at }). */
export function rookedFromServer(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, row] of Object.entries(raw)) {
    const m = KEY_RE.exec(key);
    const classId = String(row?.class || m?.[1] || '');
    if (!m || !isRookableClass(classId)) continue;
    const by = (Array.isArray(row?.by) ? row.by : []).map((id) => num(id, 0)).filter(Boolean);
    out[key] = { classId, doses: Math.max(0, Math.min(ROOK_SOURCE.reviveHealers - 1, Math.floor(num(row?.doses)))), by, at: 0 };
  }
  return out;
}

/** The orb a player is in (their own or one they joined), or null. */
export function orbOf(attack, playerId) {
  for (const o of attack?.orbs || []) {
    if (o.by === playerId || o.joiners.includes(playerId)) return o;
  }
  return null;
}

/**
 * One rook_you message as what lands on this player: xp, energy, mood and
 * favor after Rook Armor (the player's own buff, so the client applies it).
 * focusing_orb.js:590/609 and npc_shrine_*.js:216 halve the stun and prime
 * energy; include/rook.js 15-21 halves the wing beat's energy and spares its
 * mood (its comment's intent: the code's test is inverted); inc_rook.js:794
 * spares a failed orb's mood.
 */
export function shareOf(msg, { armor = false } = {}) {
  const why = String(msg?.why || '');
  let energy = Math.min(0, Math.round(num(msg?.energy)));
  let mood = Math.min(0, Math.round(num(msg?.mood)));
  if (armor) {
    if (why === 'orb_start' || why === 'prime') energy = Math.round(energy / 2);
    if (why === 'wing_beat') {
      energy = Math.round(energy / 2);
      mood = 0;
    }
    if (why === 'stun_fail') mood = 0;
  }
  return {
    why,
    xp: Math.max(0, Math.round(num(msg?.xp))),
    energy,
    mood,
    favor: Math.max(0, Math.round(num(msg?.favor))),
  };
}

/** The activity line for this player's own share (GSJS copy where the source has it). */
export function shareLine(msg, landed) {
  const why = String(msg?.why || '');
  const xp = Math.max(0, Math.round(num(landed?.xp)));
  const energy = Math.abs(Math.round(num(landed?.energy)));
  const mood = Math.abs(Math.round(num(landed?.mood)));
  switch (why) {
    case 'orb_start': return ROOK_TEXT.stunStarted(energy);
    case 'orb_join': return MP_ROOK_TEXT.joined(energy, xp);
    case 'stun_lead': return ROOK_TEXT.stunInitiatorXp(xp);
    case 'stun_assist': return ROOK_TEXT.stunStruck(Math.round(num(msg?.damage)), xp);
    case 'stun_fail': return msg?.broke ? MP_ROOK_TEXT.broke(xp, mood) : ROOK_TEXT.stunFailed(xp, mood);
    case 'wing_beat': return MP_ROOK_TEXT.wingBeat(energy, mood);
    case 'prime': return `You primed the shrine. You lose ${energy} energy.`;
    case 'prime_done': return ROOK_TEXT.primeDone(xp, Math.round(num(msg?.damage)));
    case 'strike': return ROOK_TEXT.strikeHit(Math.round(num(msg?.damage)), xp);
    case 'defeat_help': return ROOK_TEXT.defeatHelp(xp);
    case 'defeat_witness': return ROOK_TEXT.defeatWitness(xp);
    default: return '';
  }
}

/**
 * Whether a primed shrine takes this item (items/npc_shrine_*.js donate_to
 * drop_ok_code 318-330: no bags, machines, no_donate items or emblems but the
 * shrine's own; tools are never offered), as tools/build-realtime-rook.mjs
 * lists it for the server.
 */
export function offerAllowed(classTsid, meta, giantId) {
  const id = String(classTsid || '');
  if (!meta || meta.isTool || meta.donatable === false) return false;
  if (id === `emblem_${giantId}`) return true;
  const tags = meta.tags || [];
  return !(tags.includes('emblem') || tags.includes('machine') || tags.includes('no_donate') || id.startsWith('emblem_') || id.startsWith('bag_'));
}

/** A shrine strike's damage in multiplayer: the source formula, no solo crowd (rook.go strikeDamage). */
export function strikeDamage({ baseCost = 0, count = 1, emblem = false, primeBonus = 0 } = {}) {
  return strikeDamageFor({ baseCost, count, emblem, primeBonus, solo: false });
}

/** The Shrine On card level the server takes with rook_prime (0, 1 or 2). */
export function primeBonusLevel(bonus) {
  const b = num(bonus);
  return b >= 0.5 ? 2 : b >= 0.25 ? 1 : 0;
}
