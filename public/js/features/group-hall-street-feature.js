/**
 * Group Hall streets (G1312, js/group-hall-street.js): a finished hall's own street, for its group's
 * members. Multiplayer only, as the halls are (G331).
 *
 * - The way in: the lot on the hall's public street (features/street-jobs-feature.js openLot) calls
 *   enterHall, which checks what the game knows (pols_canEnter, locations/inc_pols.js 286-349: the
 *   group owns the hall and the site's groups list has you in it) and walks you in beside the hall's
 *   signpost. Any other trip into the hall (the Map, a teleport) meets the same check (travelGate).
 *   The realtime server decides (group_hall_streets.go): a join it refuses ("hall_members") or a
 *   member it walks out after they leave the group ("hall_out") sends you back out to the lot with
 *   its words. On a new socket the join can come before the groups list does, so one refusal while
 *   the game counts you a member waits for the list (groups_status) and joins again.
 * - The name: "<group>'s Group Hall" ("A Private Group's Group Hall"), from the server's hall row
 *   (prepareStreet); quest.js 1849-1854 renamed the hall's location after its group.
 * - The way out: the hall's one signpost, to the lot street, where you are stood in front of the lot
 *   once it is placed. A reload in the hall starts there too (the owner's row comes after the
 *   street is drawn, so the hall cannot be checked at boot).
 * - Nothing grows or lives there (ecologyOverride: no ecology row survives).
 *
 * QA (solo, the street only): ?autostart=1&questoffer=off&streetdemo=GA51318ODPB2UF7&streetx=2600&streety=745.
 * Canvas data: groupHall (the job id on a hall street, else ''), groupHallLast (entered:<job> |
 * refused:<why> | out:<job> | lot:<job>).
 */

import { HALL_STREET_JOBS, HALL_STREET_TEXT, hallEntry, hallLabel, hallStreetEcology, hallStreetJob, hallStreetOf } from '../group-hall-street.js?v=fa1921ad';

export const GROUP_HALL_STREET_FEATURE_ID = 'group-hall-street';

/** How long the lot street waits for its lot to be placed before you stay where you landed. */
const LOT_WAIT_MS = 8000;

let last = '';
let toLot = null; // { job, until }: stand at the lot once it is placed (after leaving the hall)
let bound = null; // the realtime client the handlers are on
let retry = false; // one join refused before the groups list came: join again when it does

const mp = (engine) => engine?.mode === 'multiplayer';

function client(engine) {
  return mp(engine) ? engine.query?.('realtimeClient') || null : null;
}

/** The game's view of whether you may go into hall `job` (js/group-hall-street.js hallEntry). */
export function hallEntryFor(engine, job) {
  const c = client(engine);
  return hallEntry({
    mp: mp(engine),
    online: c?.state === 'online',
    owner: engine.query?.('groupHallOwner', job) || null,
    myGroups: engine.query?.('myGroupIds', engine) ?? null,
  });
}

function publish(engine) {
  engine.setData?.('groupHall', hallStreetJob(engine.streetTsid));
  engine.setData?.('groupHallLast', last);
}

/** The lot's verb once its hall has a street (street-jobs-feature verbsFor). */
export function enterVerb(group) {
  return { id: 'enter', label: HALL_STREET_TEXT.enter, enabled: true, tooltip: HALL_STREET_TEXT.enterTip(group), durationMs: 0 };
}

/** Into hall `job` from its lot: beside the hall's signpost, or the words why not. */
export function enterHall(engine, job) {
  const hall = hallStreetOf(job);
  if (!hall) return false;
  const entry = hallEntryFor(engine, job);
  if (!entry.ok) {
    last = `refused:${entry.why}`;
    publish(engine);
    engine.toast?.(entry.text, 3600);
    return false;
  }
  const owner = engine.query?.('groupHallOwner', job);
  engine.travel?.(hall.tsid, { label: hallLabel(owner?.group?.name), arrive: { ...hall.inside }, via: 'door' });
  return true;
}

/** Out of the hall to its lot street, in front of the lot, saying why when the server sent you. */
function leaveHall(engine, job, text = '') {
  const hall = hallStreetOf(job);
  if (!hall) return;
  if (text) engine.toast?.(text, 4200);
  toLot = { job: String(job), until: Date.now() + LOT_WAIT_MS };
  engine.enter?.(hall.lot, { spawnX: hall.lotOut.x, spawnY: hall.lotOut.y });
}

function bind(engine) {
  const c = client(engine);
  if (!c || bound === c) return;
  bound = c;
  c.on('error', ({ code, message }) => {
    if (code !== 'hall_members') return;
    const job = hallStreetJob(engine.streetTsid);
    if (!job) return;
    // A new socket's join can beat the groups list: once, wait for it while the game counts you in.
    if (!retry && hallEntryFor(engine, job).ok) {
      retry = true;
      return;
    }
    retry = false;
    last = `out:${job}`;
    leaveHall(engine, job, String(message || ''));
    publish(engine);
  });
  c.on('msg:groups_status', () => {
    if (!retry) return;
    const job = hallStreetJob(engine.streetTsid);
    if (!job || !engine.player || !c.wanted) {
      retry = false;
      return;
    }
    c.join({ street: c.wanted, x: engine.player.x, y: engine.player.y, dir: engine.player.facing === 'left' ? -1 : 1, anim: engine.player.glitchState || 'stand', look: { v: 1, vector: engine.playerAppearance?.vector || {} } });
  });
  c.on('msg:hall_out', (msg) => {
    const job = String(msg?.job || '');
    if (!job || hallStreetJob(engine.streetTsid) !== job) return;
    last = `out:${job}`;
    leaveHall(engine, job, String(msg.text || ''));
    publish(engine);
  });
}

export const groupHallStreetFeature = {
  id: GROUP_HALL_STREET_FEATURE_ID,

  ecologyOverride(street) {
    return hallStreetEcology(street?.tsid);
  },

  /** The hall's name from its group (the server's row); "A Group Hall" until it is known. */
  prepareStreet(street, engine) {
    const job = hallStreetJob(street?.tsid);
    if (!job) return;
    street.label = hallLabel(engine.query?.('groupHallOwner', job)?.group?.name);
  },

  /** Every way into a hall street (the Map, a teleport, the lot) asks the same as the lot does. */
  travelGate(tsid, engine) {
    const job = hallStreetJob(tsid);
    if (!job) return null;
    const entry = hallEntryFor(engine, job);
    return entry.ok ? null : { ok: false, msg: entry.text };
  },

  /** Before the street changes: out of a hall by its signpost to the lot street, stand at the lot there. */
  enterGate(tsid, engine) {
    const job = hallStreetJob(engine?.streetTsid);
    const hall = hallStreetOf(job);
    if (hall && String(tsid || '').slice(1) === hall.lot.slice(1)) toLot = { job, until: Date.now() + LOT_WAIT_MS };
    return null;
  },

  /** A reload in a hall starts on its lot street, at the lot (the hall is checked again from there). */
  reloadLocation(saved) {
    const job = hallStreetJob(saved?.tsid);
    if (!job) return null;
    const hall = HALL_STREET_JOBS[job];
    toLot = { job, until: Date.now() + LOT_WAIT_MS };
    return { tsid: hall.lot, x: hall.lotOut.x, y: hall.lotOut.y };
  },

  onStreetEnter(street, engine) {
    const job = hallStreetJob(street?.tsid);
    if (job) {
      last = `entered:${job}`;
      retry = false;
    }
    if (toLot && street?.tsid !== hallStreetOf(toLot.job)?.lot) toLot = null;
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (mp(engine)) bind(engine);
    if (!toLot) return;
    if (Date.now() > toLot.until) {
      toLot = null;
      return;
    }
    const spot = engine.query?.('groupHallLotSpot', toLot.job);
    if (!spot || !engine.player) return;
    engine.player.x = spot.x;
    engine.player.y = spot.y;
    engine.player.vx = 0;
    engine.player.vy = 0;
    engine.snapCamera?.();
    last = `lot:${toLot.job}`;
    toLot = null;
    publish(engine);
  },
};

/** Tests: reset the module's state. */
export function resetGroupHallStreet() {
  last = '';
  toLot = null;
  bound = null;
  retry = false;
}
