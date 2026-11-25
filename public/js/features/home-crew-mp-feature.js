/**
 * Crews on a home street in multiplayer (G929, G947; shared-play audit M3; report #464): help
 * mine at a rock and help dig at a Dirt Pile on someone's home street, for the owner and their
 * visitors, as on a public street. Rules and sources in js/home-crew-mp.js; the realtime server's
 * home_crew.go keeps the crews.
 *
 * help-mine-feature asks the same queries it asks street-objects-feature on a public street, and
 * on a home street this feature answers them (street-objects-feature leaves home streets alone):
 *   - sharedMiners / sharedDiggers: who is at the rock or pile now (the server's home_crews);
 *   - sharedMineSwing / sharedDigSwing: a swing or dig starts or is cancelled (home_crew), and the
 *     server answers home_crew_ok { helping } (help-mine-feature counts I Me Mine by it);
 *   - homeCrewId: the crew id of a target here (help-mine-feature matches the answer by it);
 *   - homeCrewLand: the owner's own swing or dig landed (it ran in the owner's game on the owner's
 *     own rock or pile): a promise of the server's help ({ bonus, by } or { n, items, class, loam,
 *     by }), or null when nobody helped. A visitor's landing goes through home_yard instead, where
 *     the site takes and credits the bonus, and the help comes with yard-verbs-mp-feature's grant.
 *
 * Multiplayer only, and only on a home street (HOME_<owner>): everywhere else every query here
 * answers null and nothing is sent.
 *
 * QA: canvas data homeCrew ("rock:0=7+9|node:dirt_pile:0=9", "none"), homeCrewLast.
 */

import { HOME_CREW_ID, homeCrewId, homeCrewOwner, normalizeHomeCrews } from '../home-crew-mp.js?v=fc0ea4d5';

export const HOME_CREW_MP_ID = 'home-crew-mp';

/** How long the owner's landing waits for the server's answer before it counts as no help. */
const LAND_WAIT_MS = 4000;

let client = null;
let owner = 0;
let crews = new Map();
/** The rocks my own swing is at now (started, not yet landed or cancelled). */
const swinging = new Set();
let req = 0;
const landing = new Map();
let unbind = [];
let engineRef = null;

function publish() {
  const rows = [...crews].map(([id, ids]) => `${id}=${ids.join('+')}`);
  engineRef?.setData?.('homeCrew', rows.join('|') || 'none');
}

function bind(engine) {
  const c = engine.query?.('realtimeClient');
  if (c === client) return;
  for (const off of unbind) off?.();
  unbind = [];
  client = c || null;
  if (!client?.on) return;
  unbind.push(client.on('msg:home_crews', (msg) => {
    const next = normalizeHomeCrews(msg, here());
    if (!next) return;
    crews = next;
    publish();
  }));
  unbind.push(client.on('msg:home_crew_help', (msg) => {
    const wait = landing.get(Number(msg.req));
    if (!wait) return;
    landing.delete(Number(msg.req));
    clearTimeout(wait.timer);
    const help = msg.help && typeof msg.help === 'object' ? msg.help : null;
    engineRef?.setData?.('homeCrewLast', help ? `help:${msg.id}:${Number(help.bonus ?? help.items) || 0}` : `alone:${msg.id}`);
    wait.resolve(help);
  }));
}

/** The home street the player stands on now (its owner), or 0; a new street forgets the last crews. */
function here() {
  const now = client?.street ? homeCrewOwner(client.street) : 0;
  if (now !== owner) {
    owner = now;
    crews = new Map();
    swinging.clear();
    publish();
  }
  return owner;
}

function me() {
  return Number(client?.me?.id) || 0;
}

function idOf(target) {
  if (!client || !here()) return null;
  return homeCrewId(target, { owner, me: me() });
}

function swing(target, what, kind) {
  if (what !== 'start' && what !== 'stop') return null;
  const id = idOf(target);
  if (!id || !id.startsWith(kind)) return null;
  if (what === 'start') swinging.add(id);
  else swinging.delete(id);
  return client.send('home_crew', { owner, id, do: what }) !== false;
}

export const homeCrewMpFeature = {
  id: HOME_CREW_MP_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer') return;
    engineRef = engine;
    bind(engine);
  },

  onStreetClear() {
    crews = new Map();
    swinging.clear();
  },

  /**
   * yard-verbs-mp-feature: my swing at this home rock started while it had chunks (a crew's rock
   * another has emptied since still lands: include/mining.js 215-217, 293-383), or null.
   */
  homeCrewSwinging(target) {
    const id = idOf(target);
    return id && swinging.has(id) ? true : null;
  },

  /** The swing landed (game.js, after help-mine-feature's own rockMined): it is off the rock. */
  rockMined(target) {
    const id = idOf(target);
    if (id) swinging.delete(id);
    return undefined;
  },

  homeCrewId(target) {
    return idOf(target);
  },

  sharedMiners(target) {
    const id = idOf(target);
    return id?.startsWith('rock:') ? [...(crews.get(id) || [])] : null;
  },

  sharedMineSwing(target, what) {
    return swing(target, what, 'rock:');
  },

  sharedDiggers(target) {
    const id = idOf(target);
    return id?.startsWith('node:') ? [...(crews.get(id) || [])] : null;
  },

  sharedDigSwing(target, what) {
    return swing(target, what, 'node:');
  },

  /** The owner's own landed swing or dig at home: a promise of the crew's help, or null when it is not one. */
  homeCrewLand(target) {
    const id = idOf(target);
    if (!id || !HOME_CREW_ID.test(id) || owner !== me()) return null;
    req += 1;
    const n = req;
    if (client.send('home_crew', { owner, id, do: 'land', req: n }) === false) return null;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        landing.delete(n);
        resolve(null);
      }, LAND_WAIT_MS);
      landing.set(n, { resolve, timer });
    });
  },

  /** Tests. */
  _reset() {
    for (const off of unbind) off?.();
    unbind = [];
    client = null;
    owner = 0;
    crews = new Map();
    swinging.clear();
    for (const w of landing.values()) clearTimeout(w.timer);
    landing.clear();
    req = 0;
    engineRef = null;
  },
};
