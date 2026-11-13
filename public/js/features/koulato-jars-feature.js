/**
 * Koulato Cluster's firefly jars (register G679; rules and sources in js/koulato-jars.js).
 *
 * Every 30th arrival on the street sets out three jars (place_jars). A Glitch standing on the ledge
 * in front of a jar lights it (jarN_on, a light pool and fireflies) and stepping off puts it out
 * (jarN_off). All three lit at once completes the street (complete, turn_off): the lights flare and go
 * out, the jars are put away, and the Firefly Jar that falls at your jar (7 Fireflies) is yours.
 * The events are the street's own, run through location-events-feature's locationEventsApi.
 *
 * Online (js/street-toys-mp.js, the server's streettoys.go) the street is everyone's, as loc.num and
 * the jars were the location's: the server counts every player's arrival, brings the jars out for
 * everyone at the 30th, lights each jar from the positions it has, and decides the completion; this
 * game only draws what it is told (toy_played, and toy_state on arrival) and counts nothing itself.
 * The three Firefly Jars are the server's ground stacks (drops.go, first pickup wins, each placed under
 * the player standing on that jar); one the server could not share comes back "own" and is put down
 * here, as before. With no socket, nothing is counted or completed online.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GIF10RP1DBU11NU&streetx=2416&streety=1100
 *   &koulatojars=place sets the jars out on arrival; &koulatojars=others also stands two pretend
 *   Glitches on jars 1 and 3 (so standing on jar 2 completes it). Canvas data: koulatoArrivals,
 *   koulatoPlaced (1 while the jars are out), koulatoLit (e.g. 010), koulatoDone (completions this visit).
 */

import { JAR_BOXES, JAR_DECOS, JAR_FLIES, countArrival, isKoulatoCluster, litJars, normalizeJarSave } from '../koulato-jars.js?v=5838b30a';
import { locationEventsApi } from './location-events-feature.js?v=f2b6c156';
import { catchUpKoulato, createToyTracker, ownJars, toyEvents, toyMessageFor } from '../street-toys-mp.js?v=9eca3893';

export const KOULATO_JARS_FEATURE_ID = 'koulato-jars';
const DATA_MS = 250;

let save = normalizeJarSave(null);
let active = false;
let lit = [false, false, false];
let done = 0;
let lastData = 0;
let client = null;
let offs = [];
let pending = false; // place_jars to run once the street's scripts are live
let server = null; // online: the server's last word on the jars ({ arrivals, out, jars })
let tsid = '';
let tracker = createToyTracker();

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  engine.setData('koulatoArrivals', server ? server.arrivals : save.arrivals);
  engine.setData('koulatoPlaced', (server ? server.out : save.placed) ? 1 : 0);
  engine.setData('koulatoLit', lit.map((v) => (v ? 1 : 0)).join(''));
  engine.setData('koulatoDone', done);
}

function liveClient(engine) {
  return engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') || null : null;
}

/** Online the server keeps the street's count and jars; listen from the first frame. */
function watch(engine) {
  const c = liveClient(engine);
  if (c === client) return;
  for (const off of offs) off?.();
  offs = [];
  client = c;
  tracker = createToyTracker();
  if (!c?.on) return;
  offs.push(c.on('roster', (msg) => tracker.roster(msg)));
  offs.push(c.on('msg:toy_state', (msg) => {
    tracker.take(msg);
    if (!active || msg?.toys !== 'koulato' || !toyMessageFor(msg, tsid)) return;
    server = tracker.stateFor(tsid);
    publish(engine, true);
  }));
  offs.push(c.on('msg:toy_played', (msg) => {
    tracker.take(msg);
    if (!active || !toyMessageFor(msg, tsid)) return;
    server = tracker.stateFor(tsid);
    if (!server) return;
    const events = toyEvents(msg);
    if (!events.includes('complete')) return; // the catch-up draws the rest
    // jarN_on for the last Glitch, then complete and turn_off, in the street's order.
    for (const name of events) {
      const m = /^jar([123])_(on|off)$/.exec(name);
      if (m) lit[Number(m[1]) - 1] = m[2] === 'on';
      locationEventsApi.fire(engine, name);
    }
    lit = [false, false, false];
    done += 1;
    for (const { n } of ownJars(msg, c.me?.id)) {
      const box = JAR_BOXES[n - 1];
      engine.dropWorldStack?.('firefly_jar', 1, box.drop.x, box.drop.y, [JAR_FLIES]);
    }
    publish(engine, true);
  }));
}

/** Online: bring the jars here to the server's last word (place_jars, put away, each jar on or off). */
function catchUp(engine) {
  if (locationEventsApi.active() == null) return;
  const step = catchUpKoulato(server, locationEventsApi.flag('jars_on'), lit);
  for (const name of step.fire) locationEventsApi.fire(engine, name);
  lit = step.lit;
}

/** Every Glitch's feet on the street: yours, the other players drawn here, and QA's pretend ones. */
function allFeet(engine) {
  const feet = [];
  if (engine.player) feet.push({ x: engine.player.x, y: engine.player.y, me: true });
  for (const r of engine.query?.('minimapPlayers') || []) feet.push({ x: r.x, y: r.y });
  if (engine.param?.('koulatojars') === 'others') feet.push({ x: JAR_BOXES[0].x, y: JAR_BOXES[0].y - 10 }, { x: JAR_BOXES[2].x, y: JAR_BOXES[2].y - 10 });
  return feet;
}

function place(engine) {
  pending = false;
  if (locationEventsApi.active() == null) return;
  locationEventsApi.fire(engine, 'place_jars');
  lit = [false, false, false];
}

/** complete + turn_off; the jar that fell where you stand is yours. */
function complete(engine, mine) {
  locationEventsApi.fire(engine, 'complete');
  locationEventsApi.fire(engine, 'turn_off');
  save.placed = false;
  done += 1;
  const box = mine >= 0 ? JAR_BOXES[mine] : null;
  if (box && engine.dropWorldStack) engine.dropWorldStack('firefly_jar', 1, box.drop.x, box.drop.y, [JAR_FLIES]);
}

export const koulatoJarsFeature = {
  id: KOULATO_JARS_FEATURE_ID,

  prepareStreet(street) {
    if (!isKoulatoCluster(street?.tsid)) return;
    const hide = new Set(JAR_DECOS);
    for (const layer of street.layers || []) for (const deco of layer.decos || []) if (deco?.id && hide.has(deco.id)) deco.hidden = true;
  },

  onStreetEnter(street, engine) {
    active = isKoulatoCluster(street?.tsid) && !engine.transientInstance?.() && !engine.homeContext?.().inHome;
    lit = [false, false, false];
    done = 0;
    pending = false;
    tsid = String(street?.tsid || '');
    watch(engine);
    // The server's word may have come while the street loaded.
    server = active ? tracker.stateFor(tsid) : null;
    if (server?.toys !== 'koulato') server = null;
    // Online the server counts every arrival (yours too) and says when the jars are out.
    if (active && engine.mode === 'multiplayer') {
      publish(engine, true);
      return;
    }
    if (active) {
      if (engine.param?.('koulatojars')) save.placed = true;
      // player_enter: count this arrival; the jars come out at 30 (or are still out from before).
      if (countArrival(save) || save.placed) pending = true;
    }
    publish(engine, true);
  },

  onStreetClear() {
    active = false;
    pending = false;
    server = null;
    lit = [false, false, false];
  },

  onTick(_dtMs, _now, engine) {
    if (engine.mode === 'multiplayer') watch(engine);
    if (!active || !engine.started) return;
    if (engine.mode === 'multiplayer') {
      catchUp(engine);
      publish(engine);
      return;
    }
    if (pending) place(engine);
    if (!save.placed) {
      publish(engine);
      return;
    }
    const feet = allFeet(engine);
    const now = litJars(feet);
    for (let i = 0; i < 3; i++) {
      if (now[i] === lit[i]) continue;
      locationEventsApi.fire(engine, `jar${i + 1}_${now[i] ? 'on' : 'off'}`);
    }
    lit = now;
    // check_done: j1 && j2 && j3 (with jars_on, which place_jars set).
    if (lit.every(Boolean) && locationEventsApi.flag('jars_on')) {
      const me = feet.find((p) => p.me);
      const mine = me ? litJars([me]).indexOf(true) : -1;
      complete(engine, mine);
    }
    publish(engine);
  },

  save() {
    return { ...save };
  },

  restore(slice) {
    save = normalizeJarSave(slice);
  },

  /** QA / tests. */
  _state() {
    return { active, save: { ...save }, lit: [...lit], done, server };
  },
};
