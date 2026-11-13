/**
 * Street toys (register G679; rules and sources in js/street-toys.js): the Clickable Broadcasters of
 * Lotha Harte (three icicles that play three notes; the right order lights the heart) and Icicle
 * Dangles (three lights that go out and on).
 *
 * Each toy is an invisible hit box hung on the deco it plays and moved with that deco's parallax every
 * frame. A left click runs click_broadcast at once (Glitch's one-click item, world-context-menu.js
 * GLITCH_ONE_CLICK): within 1000 px of the toy each of its events runs on the street's own scripts
 * (location-events-feature's locationEventsApi), and Lotha Harte's note order is kept here, as the
 * street's loc.noteN code kept it.
 *
 * The notes, the heart and the lights were the street's (all_players, the location's flags and
 * hidden_decos), heard and seen by everyone there. Online (js/street-toys-mp.js) a click goes to the
 * realtime server, which keeps the street's order and locks and sends everyone there what the street
 * runs (toy_played); each frame this game brings its heart and lights to the server's last word
 * (toy_state on arrival), so a player arriving mid-state sees it too. With no socket, solo's rules.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GHV88RQU60B3Q0G&streetx=5480 (the icicles above the Ice
 *   Nubbin); &streettoys=play clicks note 1, 2, 3 a second apart. Canvas data: streetToys (toys on
 *   the street), streetToyLast (last toy clicked), streetToyNotes (loc.note1-3 as 0/1), streetToyLit
 *   (1 while the heart's lock is set), streetToyAt (id:x,y,w,h of each hit box in world space, x, y its middle).
 */

import { BROADCAST_DISTANCE, createNoteState, inBroadcastReach, lothaNote, prepareToyStreet, streetToysFor, toyDecoId, toyHitBox } from '../street-toys.js?v=09630452';
import { locationEventsApi } from './location-events-feature.js?v=f2b6c156';
import { TOY_CLICK, catchUpDangles, catchUpLotha, toyEvents, toyMessageFor, toyServerState } from '../street-toys-mp.js?v=ba23095f';

export const STREET_TOYS_FEATURE_ID = 'street-toys';
const CLASS_ID = 'clickable_broadcaster';
const DATA_MS = 250;

let def = null;
let toys = []; // { toy, target, sprite, deco }
let notes = createNoteState();
let last = '';
let lastData = 0;
let demo = null;
// Online: the realtime client watched, the server's last word on this street, and whether the heart
// is shown here (correct_order run, light_fade not yet).
let client = null;
let offs = [];
let server = null;
let heartShown = false;
let tsid = '';

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  engine.setData('streetToys', toys.length);
  engine.setData('streetToyLast', last);
  engine.setData('streetToyNotes', [notes.note1, notes.note2, notes.note3].map((v) => (v ? 1 : 0)).join(''));
  engine.setData('streetToyLit', def?.script === 'lotha-notes' && locationEventsApi.flag('lock') ? 1 : 0);
  // Each toy's hit box in world space: middle x, y, then w, h (QA converts with cameraX/cameraY/viewWidth).
  engine.setData('streetToyAt', toys.map((t) => {
    const s = t.sprite;
    if (!s || s.destroyed) return `${t.toy.id}:`;
    const h = s._worldHitH || 0;
    return `${t.toy.id}:${Math.round(s.x)},${Math.round(s.y - h / 2)},${Math.round(s._worldHitW || 0)},${Math.round(h)}`;
  }).join('|'));
}

function clear(engine) {
  for (const t of toys) {
    if (t.target) engine?.unregister?.(t.target);
    if (t.sprite && !t.sprite.destroyed) t.sprite.destroy();
  }
  toys = [];
  demo = null;
}

/** The toy's hit box in entity space (where its deco is drawn now), or null. */
function placeToy(engine, t) {
  const view = engine.decoViews?.get(toyDecoId(t.toy));
  const layer = view?.parent;
  if (!view || view.destroyed || !layer || !engine.entityLayer) return null;
  const box = toyHitBox(t.toy, { x: view.x, y: view.y, w: t.deco?.w, h: t.deco?.h });
  const P = engine.PIXI;
  const foot = engine.entityLayer.toLocal(layer.toGlobal(new P.Point(box.x, box.y)));
  const top = engine.entityLayer.toLocal(layer.toGlobal(new P.Point(box.x, box.y - box.h)));
  const h = Math.max(20, foot.y - top.y);
  const k = box.h > 0 ? h / box.h : 1;
  return { x: foot.x, y: foot.y, w: Math.max(20, box.w * k), h };
}

function sync(engine, t) {
  const at = placeToy(engine, t);
  if (!at || !t.sprite || t.sprite.destroyed) return;
  t.sprite.x = at.x;
  t.sprite.y = at.y;
  t.sprite.scale.set(at.w, at.h);
  t.sprite._worldHitW = at.w;
  t.sprite._worldHitH = at.h;
}

function spawn(engine, street) {
  const { PIXI } = engine;
  if (!PIXI || !engine.entityLayer) return;
  for (const toy of def.toys) {
    const deco = (street.layers || []).flatMap((l) => l.decos || []).find((d) => d?.id === toyDecoId(toy));
    if (!deco) continue;
    // A unit box (bottom-centre at 0, 0) scaled to the hit size each frame; all but invisible.
    const sprite = new PIXI.Graphics().rect(-0.5, -1, 1, 1).fill({ color: 0xffffff, alpha: 0.001 });
    sprite.zIndex = 940;
    engine.entityLayer.addChild(sprite);
    const t = { toy, sprite, deco, target: null };
    sync(engine, t);
    t.target = engine.register({
      featureId: STREET_TOYS_FEATURE_ID,
      classId: CLASS_ID,
      label: '',
      subtitle: '',
      sprite,
      clickOnly: true,
      streetToy: toy.id,
    });
    toys.push(t);
  }
}

function liveClient(engine) {
  return engine.mode === 'multiplayer' ? engine.query?.('realtimeClient') || null : null;
}

/** Online and standing on this street with the server: the toys are the street's. */
function shared(engine) {
  const c = def ? liveClient(engine) : null;
  return c && c.state === 'online' && toyMessageFor({ street: c.street }, tsid) ? c : null;
}

/** Run one event the server sent; a lock the street keeps here never stops what it decided. */
function runShared(engine, name) {
  if (/^shroom_light_[123]_(on|off)$/.test(name)) locationEventsApi.setFlag(`light${name[13]}`, false);
  locationEventsApi.fire(engine, name);
  if (name === 'correct_order') {
    heartShown = true;
    locationEventsApi.cancel('light_fade');
  } else if (name === 'light_fade') heartShown = false;
}

/** Listen from the first frame online (a toy_state may come before the street's first tick). */
function watch(engine) {
  const c = liveClient(engine);
  if (c === client) return;
  for (const off of offs) off?.();
  offs = [];
  client = c;
  if (!c?.on) return;
  offs.push(c.on('msg:toy_state', (msg) => {
    if (!def || !toyMessageFor(msg, tsid)) return;
    server = toyServerState(msg, null);
  }));
  offs.push(c.on('msg:toy_played', (msg) => {
    if (!def || !toyMessageFor(msg, tsid)) return;
    server = toyServerState(msg, server);
    if (typeof msg.toy === 'string' && msg.toy) last = msg.toy;
    for (const name of toyEvents(msg)) {
      // A heart never shown here (an arrival after it lit, before the catch-up) has nothing to fade.
      if (name === 'light_fade' && !heartShown) continue;
      runShared(engine, name);
    }
    publish(engine, true);
  }));
}

/** Bring the heart and the lights here to the server's last word (an arrival mid-state, a missed message). */
function catchUp(engine) {
  if (!server || locationEventsApi.active() == null) return;
  const heart = catchUpLotha(server, heartShown);
  if (heart) for (const name of heart.fire) runShared(engine, name);
  for (const step of catchUpDangles(server, locationEventsApi.flag)) runShared(engine, step.fire);
}

/** click_broadcast: within distance, each event in order; Lotha Harte's notes keep their order. */
export function broadcast(engine, toyId) {
  const t = toys.find((x) => x.toy.id === toyId);
  if (!t || !def) return false;
  const p = engine.player;
  if (p && !inBroadcastReach(p.x, p.y, t.sprite.x, t.sprite.y, BROADCAST_DISTANCE)) return true;
  // Online the street keeps the order: the server sends everyone (you too) what it runs.
  const c = shared(engine);
  if (c && c.send(TOY_CLICK, { toy: toyId })) return true;
  last = toyId;
  for (const name of t.toy.events) {
    locationEventsApi.fire(engine, name);
    // The note's flag_has_exit('lock') stops its code while the heart is lit.
    if (def.script === 'lotha-notes' && !locationEventsApi.flag('lock') && lothaNote(notes, name)) {
      locationEventsApi.fire(engine, 'correct_order');
    }
  }
  publish(engine, true);
  return true;
}

function demoStep(engine, now) {
  if (!demo || now < demo.at || !toys.length) return;
  const next = demo.queue.shift();
  if (!next) {
    demo = null;
    return;
  }
  broadcast(engine, next);
  demo.at = now + 1000;
}

export const streetToysFeature = {
  id: STREET_TOYS_FEATURE_ID,

  prepareStreet(street) {
    const d = streetToysFor(street?.tsid);
    if (d) prepareToyStreet(street, d);
  },

  onStreetEnter(street, engine) {
    clear(engine);
    notes = createNoteState();
    last = '';
    server = null;
    heartShown = false;
    tsid = String(street?.tsid || '');
    def = streetToysFor(street?.tsid);
    if (def && (engine.transientInstance?.() || engine.homeContext?.().inHome)) def = null;
    watch(engine);
    if (def) {
      spawn(engine, street);
      if (engine.param?.('streettoys') === 'play') demo = { at: Date.now() + 2500, queue: def.toys.map((t) => t.id) };
    }
    publish(engine, true);
  },

  onStreetClear(engine) {
    clear(engine);
    def = null;
    server = null;
  },

  onTick(_dtMs, now, engine) {
    if (!def || !toys.length) return;
    watch(engine);
    catchUp(engine);
    for (const t of toys) sync(engine, t);
    demoStep(engine, Date.now());
    publish(engine);
  },

  verbsFor(target) {
    if (target?.featureId !== STREET_TOYS_FEATURE_ID) return null;
    return [{ id: 'click_broadcast', label: 'Click', enabled: true, durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target?.featureId !== STREET_TOYS_FEATURE_ID || verbId !== 'click_broadcast') return false;
    return broadcast(engine, target.streetToy);
  },

  /** QA / tests. */
  _state() {
    return { street: def?.name || '', toys: toys.map((t) => t.toy.id), notes: { ...notes }, last, server, heartShown };
  },
};
