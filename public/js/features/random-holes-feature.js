/**
 * Glitch's Random Hole (items/random_hole.js; rules and source notes in js/random-holes.js).
 * Touch one and you are teleported to a Random Hole on the same street picked at random (the one
 * you touched among them), 120 px over it, and thrown upward for 1.1 s (gravity -2), then fall.
 * The move is a teleport within the street (js/within-street.js), as the walk-in teleporters that
 * land on their own street: online the next move frame carries it and the others see you there.
 *
 * No street the remake has places one (none was archived), so the feature only runs holes a QA
 * link puts down. The link works solo, and online only on a local host (js/qa-gate.js).
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=<tsid>&randomholedemo=<tsid>[@x1,x2,...]
 *   (`here` for whatever street you are on; with no x's, four holes at 20, 40, 60 and 80% of the
 *   street's width, each on the ground under that x). Canvas data: randomHoles (id:x,y;...),
 *   randomHoleHops, randomHoleLast (from>to@x,y, where the hop stood you), randomHoleRise (1 while
 *   the upward throw lasts).
 */

import {
  DEMO_HOLE_ART,
  RANDOM_HOLE_PHYSICS,
  demoHoles,
  demoWantsStreet,
  holeCheck,
  hopPhysics,
  hopSpot,
  parseHoleDemo,
  pickHole,
} from '../random-holes.js?v=e979c4ae';
import { teleportWithinStreet } from '../within-street.js?v=5ce33cdf';
import { groundAt } from '../street-arrival.js?v=2dfe79ac';
import { streetWidth } from '../street-model.js?v=a9a05f9d';
import { AVATAR_BODY_H } from '../avatar-step.js?v=8415ee96';
import { isLoaded, onLoaded, textureFromUrl } from '../textures.js?v=8bb43102';
import { qaHandlesAllowed } from '../qa-gate.js?v=f4e2cd82';

export const RANDOM_HOLES_FEATURE_ID = 'random-holes';

/** No touch for this long after coming onto the street (a hole under an arrival point). */
const ARRIVAL_GRACE_MS = 800;
const DATA_MS = 250;
/** Under the avatar and the street's items, over the ground's art. */
const HOLE_Z = 1;

let holes = [];
let views = [];
let inside = new Set();
let prev = null;
let enteredAt = 0;
let riseUntil = 0;
let hops = 0;
let last = '';
let lastData = 0;
let random = Math.random;

function clear() {
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy();
  }
  views = [];
  holes = [];
  inside = new Set();
  prev = null;
  riseUntil = 0;
}

function publish(engine, now = Date.now(), force = false) {
  if (!force && now - lastData < DATA_MS) return;
  lastData = now;
  engine.setData?.('randomHoles', holes.map((h) => `${h.id}:${h.x},${h.y}`).join(';'));
  engine.setData?.('randomHoleHops', hops);
  engine.setData?.('randomHoleLast', last);
  engine.setData?.('randomHoleRise', riseUntil > now ? 1 : 0);
}

/** The demo's picture of one hole, flat on the floor at its x. */
function drawHole(engine, hole) {
  const { PIXI } = engine;
  if (!PIXI?.Sprite || !engine.entityLayer) return;
  const tex = textureFromUrl(DEMO_HOLE_ART.url);
  const spr = new PIXI.Sprite(tex);
  spr.anchor?.set?.(0.5, 0.5);
  spr.x = hole.x;
  spr.y = hole.y + 2;
  spr.zIndex = HOLE_Z;
  spr.eventMode = 'none';
  const size = () => {
    spr.width = DEMO_HOLE_ART.w;
    spr.height = DEMO_HOLE_ART.h;
  };
  size();
  if (tex?.source && !isLoaded(tex.source)) onLoaded(tex.source, () => !spr.destroyed && size());
  engine.entityLayer.addChild(spr);
  views.push(spr);
}

/** onPlayerCollision: to a hole picked at random, 120 px over it, thrown upward for 1.1 s. */
function hop(engine, from, now) {
  const to = pickHole(holes, random);
  if (!to) return;
  const spot = hopSpot(to);
  if (!teleportWithinStreet(engine, spot.x, spot.y)) return;
  riseUntil = now + RANDOM_HOLE_PHYSICS.durationMs;
  hops += 1;
  last = `${from.id}>${to.id}@${spot.x},${spot.y}`;
  prev = { x: spot.x, y: spot.y };
  inside = new Set();
  publish(engine, now, true);
}

const noHoles = (street, engine) => !street || engine?.transientInstance?.() || engine?.homeContext?.().inHome;

export const randomHolesFeature = {
  id: RANDOM_HOLES_FEATURE_ID,

  onStreetEnter(street, engine) {
    clear();
    enteredAt = Date.now();
    const demo = qaHandlesAllowed() ? parseHoleDemo(engine.param?.('randomholedemo')) : null;
    if (!noHoles(street, engine) && demoWantsStreet(demo, street.tsid)) {
      const platforms = engine.platforms || [];
      holes = demoHoles(demo, streetWidth(street), (x) => groundAt(platforms, x, { tsid: street.tsid }));
      for (const hole of holes) drawHole(engine, hole);
    }
    publish(engine, enteredAt, true);
  },

  onStreetClear() {
    clear();
  },

  onTick(_dtMs, _now, engine) {
    if (!holes.length || !engine.started || !engine.player) return;
    const t = Date.now();
    const p = engine.player;
    const cur = { x: p.x, y: p.y };
    if (t - enteredAt >= ARRIVAL_GRACE_MS && !engine.acting?.() && !engine.questDialogueOpen?.()) {
      const check = holeCheck(holes, prev, cur, inside, AVATAR_BODY_H);
      inside = check.inside;
      if (check.touched) {
        hop(engine, check.touched, t);
        return;
      }
    }
    prev = cur;
    publish(engine, t);
  },

  /** addCTPCPhysics({ gravity: -2, duration_ms: 1100 }) while the throw lasts. */
  physics() {
    return hopPhysics(riseUntil, Date.now());
  },

  /** QA / tests. */
  _state() {
    return { holes: holes.map((h) => ({ ...h })), hops, last, riseUntil };
  },
  /** Tests: the picker's random source (Math.random when unset). */
  _setRandom(fn) {
    random = typeof fn === 'function' ? fn : Math.random;
  },
};
