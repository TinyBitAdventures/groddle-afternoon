/**
 * Graves online (register G1022, report #505). Rules and source notes: js/graves-mp.js; the
 * realtime server keeps the graves and decides who was first (groddle-afternoon-server graves.go).
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')): solo, nothing here runs and
 * the grave stays the player's own (features/hell-feature.js draws it, the companions of
 * features/hell-tickets-feature.js visit it).
 *
 * - Your croak on a street others share puts your grave there for them (grave_set at the croak's
 *   player:deaths event, while you still stand on it; again after each reconnect while you are dead).
 *   A croak in a private place (a home, an instance) stays your own. A companion mourning first is
 *   reported, so nobody else can. Resurrected: grave_clear.
 * - Other players' graves on your street are drawn with their state (none, mourned, celebrated),
 *   labelled "Here Lies <name>", with celebrate, mourn and inspect (graveside_marker.js verbs).
 *   Celebrate or mourn asks the server; the first wins. Yours: the source's activity line and 5
 *   favor with the grave's Giant (none for the generic one), added here. Inspect reads the sign.
 * - Someone mourned or celebrated yours: the server's grave_mourned (now, or at your next connect)
 *   runs recognizeDeath through hell-tickets-feature (a Hell quest offer or a Diabolical Drink
 *   Ticket). The Drink Ticket and favor are not the site ledger's (no_trade, and favor never is),
 *   so the server's word is what grants them; your game never grants one on its own word online.
 *
 * QA canvas data: gravesMpOnStreet (others' graves drawn here), gravesMpShared (your grave's croak
 * the server was told about, or ''), gravesMpLast (the last answer or event).
 */

import {
  GRAVE_ACT,
  GRAVE_CLEAR,
  GRAVE_SET,
  GRAVE_TEXT,
  applyGraveMessage,
  graveAlpha,
  graveDoneText,
  graveFrame,
  graveInspectText,
  graveLabel,
  graveMessageFor,
  graveSetMessage,
  graveVerbs,
  normalizeGraveDone,
  normalizeGraveMourned,
} from '../graves-mp.js?v=46171d14';
import { HELL_SPRITES } from '../hell.js?v=0dba5774';
import { publicStreet } from '../shared-street.js?v=dce5694b';
import { frameTexture, sourceFromUrl } from '../textures.js?v=8bb43102';
import { standOnFeet } from '../sprite-feet.js?v=1c6452d9';
import { hellFeature } from './hell-feature.js?v=2071e737';
import { hellTicketsFeature } from './hell-tickets-feature.js?v=22a6041b';

export const GRAVES_MP_FEATURE_ID = 'graves-mp';
const CLASS_ID = 'graveside_marker';
const INSPECT_MS = 5000; // graveside_marker.js 173 sendBubble(rsp, 5000)

/** Your own grave as shared: { croak, street } (saved, so a reload while dead puts it back). */
let mine = { croak: 0, street: '' };
let sentState = '';
let client = null;
let offs = [];
let wasOnline = false;
/** Others' graves on the street the socket stands on, by owner. */
let known = new Map();
let knownStreet = '';
let dirty = true;
/** Drawn: owner -> { target, grave }. */
let drawn = new Map();
/** Your mourn / celebrate waiting on the server: owner -> sent at. */
let pending = new Map();
let last = '';

function liveClient(engine) {
  return engine?.mode === 'multiplayer' ? engine.query?.('realtimeClient') || null : null;
}

function publish(engine) {
  engine.setData?.('gravesMpOnStreet', String(drawn.size));
  engine.setData?.('gravesMpShared', mine.croak ? String(mine.croak) : '');
  engine.setData?.('gravesMpLast', last);
}

function note(engine, text) {
  last = text;
  publish(engine);
}

/* —— Your own grave —— */

function sendSet(engine, c) {
  const msg = graveSetMessage(hellFeature._state(), mine.street);
  if (!msg || msg.croak !== mine.croak || !c?.send(GRAVE_SET, msg)) return false;
  sentState = msg.state;
  return true;
}

/** The croak's moment: you still stand on the street it happened on. */
function croaked(engine) {
  const c = liveClient(engine);
  if (!c) return;
  const hs = hellFeature._state();
  const street = publicStreet(engine);
  if (!hs.isDead || !hs.graveMarker || !street) {
    mine = { croak: 0, street: '' };
    return;
  }
  mine = { croak: hs.visitId, street };
  sentState = '';
  if (c.state === 'online') sendSet(engine, c);
  engine.save?.();
  note(engine, `croak:${mine.croak}`);
}

function ownTick(engine, c, online) {
  if (!mine.croak) return;
  const hs = hellFeature._state();
  if (!hs.isDead || !hs.graveMarker || hs.visitId !== mine.croak) {
    // Resurrected (resurrect 1338 removes the marker): the street's grave goes too.
    if (online) c.send(GRAVE_CLEAR, {});
    mine = { croak: 0, street: '' };
    sentState = '';
    engine.save?.();
    note(engine, 'cleared');
    return;
  }
  if (!online) return;
  // Back online (a reconnect, a restarted server), or the grave's state changed here (a companion).
  if (!wasOnline || (hs.graveMarker.state || 'none') !== sentState) sendSet(engine, c);
}

/* —— Others' graves —— */

function clearDrawn(engine, { destroy = true } = {}) {
  if (destroy) for (const d of drawn.values()) engine.unregister?.(d.target);
  drawn = new Map();
}

function drawGrave(engine, g) {
  const { PIXI } = engine;
  const sheet = HELL_SPRITES.graveside;
  const base = sourceFromUrl(sheet.urlPattern.replace('<giant>', g.giant));
  const sprite = new PIXI.Sprite(frameTexture(base, new PIXI.Rectangle(graveFrame(g) * sheet.frameW, 0, sheet.frameW, sheet.frameH)));
  standOnFeet(sprite);
  sprite.x = g.x;
  // The source raises the marker 29 px above the croak point (hell-feature spawnGrave).
  sprite.y = g.y + 29;
  sprite.alpha = graveAlpha(g);
  sprite.zIndex = 20;
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  const target = engine.register({
    classId: CLASS_ID,
    featureId: GRAVES_MP_FEATURE_ID,
    label: graveLabel(g),
    subtitle: GRAVE_TEXT.subtitle,
    sprite,
    graveOwner: g.owner,
  });
  return { target, grave: g };
}

/** Bring the drawn graves to what the server last said, on this street only. */
function sync(engine) {
  const c = client;
  const here = c && c.state === 'online' && graveMessageFor({ street: knownStreet }, engine.streetTsid);
  const want = here ? known : new Map();
  for (const [owner, d] of drawn) {
    const g = want.get(owner);
    if (!g || g.state !== d.grave.state || g.x !== d.grave.x || g.y !== d.grave.y) {
      engine.unregister?.(d.target);
      drawn.delete(owner);
    }
  }
  for (const [owner, g] of want) if (!drawn.has(owner)) drawn.set(owner, drawGrave(engine, g));
  dirty = false;
  publish(engine);
}

function fadeTick(now) {
  for (const d of drawn.values()) {
    const a = graveAlpha(d.grave, now);
    if (d.target?.sprite && !d.target.sprite.destroyed && d.target.sprite.alpha !== a) d.target.sprite.alpha = a;
  }
}

function take(engine, msg) {
  const meId = Number(client?.me?.id) || 0;
  if (msg.t === 'graves') knownStreet = String(msg.street || '');
  const next = applyGraveMessage(known, msg, { street: knownStreet, me: meId, now: Date.now() });
  if (next !== known) {
    known = next;
    dirty = true;
  }
}

function done(engine, msg) {
  const d = normalizeGraveDone(msg);
  if (!d) return;
  pending.delete(d.owner);
  if (!d.ok) {
    engine.toast?.(d.text, 2600);
    note(engine, `refused:${d.text}`);
    return;
  }
  // stats_add_favor_points(giant, 5): what landed (capped at the emblem target) names the line.
  let gained = 0;
  if (d.favor > 0 && typeof engine.pc?.addGiantFavor === 'function') gained = Number(engine.pc.addGiantFavor(d.giant, d.favor)) || 0;
  const text = graveDoneText(d, gained);
  engine.pushActivity?.(text);
  engine.save?.();
  note(engine, `${d.verb}:${d.owner}:${gained}`);
}

function mourned(engine, msg) {
  const m = normalizeGraveMourned(msg);
  if (!m) return;
  const taken = hellTicketsFeature.remoteRecognition?.(engine, m) === true;
  note(engine, `${taken ? 'mourned' : 'mourned-late'}:${m.type}:${m.recognizer}`);
}

function watch(engine) {
  const c = liveClient(engine);
  if (c === client) return;
  for (const off of offs) off?.();
  offs = [];
  client = c;
  known = new Map();
  knownStreet = '';
  dirty = true;
  wasOnline = false;
  if (!c?.on) return;
  offs.push(c.on('roster', (msg) => {
    if (!msg?.street || graveMessageFor(msg, knownStreet)) return;
    knownStreet = String(msg.street);
    known = new Map();
    dirty = true;
  }));
  for (const kind of ['graves', 'grave', 'grave_gone']) offs.push(c.on(`msg:${kind}`, (msg) => take(engine, msg)));
  offs.push(c.on('msg:grave_done', (msg) => done(engine, msg)));
  offs.push(c.on('msg:grave_mourned', (msg) => mourned(engine, msg)));
}

export const gravesMpFeature = {
  id: GRAVES_MP_FEATURE_ID,

  init(engine) {
    watch(engine);
    publish(engine);
  },

  save() {
    return { ...mine };
  },

  restore(slice) {
    const s = slice && typeof slice === 'object' ? slice : {};
    const croak = Math.max(0, Math.floor(Number(s.croak) || 0));
    mine = croak && typeof s.street === 'string' && s.street ? { croak, street: s.street.slice(0, 64) } : { croak: 0, street: '' };
    sentState = '';
  },

  onEvent(counter, _amount, engine) {
    if (counter === 'player:deaths') croaked(engine);
  },

  onStreetEnter(_street, engine) {
    dirty = true;
    publish(engine);
  },

  onStreetClear() {
    // The street's entities are destroyed with it.
    clearDrawn(null, { destroy: false });
    dirty = true;
  },

  onTick(_dtMs, now, engine) {
    if (!engine.started) return;
    watch(engine);
    const c = client;
    if (!c) return;
    const online = c.state === 'online';
    ownTick(engine, c, online);
    wasOnline = online;
    if (dirty) sync(engine);
    else fadeTick(now);
    const wait = Math.max(5000, Number(c.answerWaitMs) || 0);
    for (const [owner, at] of pending) if (now - at > wait) pending.delete(owner);
  },

  verbsFor(target) {
    if (target.classId !== CLASS_ID || target.featureId !== GRAVES_MP_FEATURE_ID) return null;
    const g = drawn.get(target.graveOwner)?.grave;
    if (!g) return [];
    return graveVerbs(g, { meName: String(client?.me?.name || ''), pending: pending.has(g.owner) });
  },

  runVerb(target, verbId, engine) {
    if (target.classId !== CLASS_ID || target.featureId !== GRAVES_MP_FEATURE_ID) return false;
    const g = drawn.get(target.graveOwner)?.grave;
    if (!g) return true;
    if (verbId === 'inspect') {
      engine.say?.(target, graveInspectText(g), INSPECT_MS);
      return true;
    }
    if (verbId !== 'mourn' && verbId !== 'celebrate') return false;
    if (g.state !== 'none' || pending.has(g.owner)) return true;
    if (client?.send(GRAVE_ACT, { owner: g.owner, verb: verbId })) {
      pending.set(g.owner, Date.now());
      note(engine, `asked:${verbId}:${g.owner}`);
    }
    return true;
  },

  /** QA / tests. */
  _state() {
    return { mine: { ...mine }, known: [...known.values()], drawn: [...drawn.keys()], pending: [...pending.keys()], last };
  },
  _reset() {
    for (const off of offs) off?.();
    offs = [];
    client = null;
    mine = { croak: 0, street: '' };
    sentState = '';
    wasOnline = false;
    known = new Map();
    knownStreet = '';
    dirty = true;
    drawn = new Map();
    pending = new Map();
    last = '';
  },
};
