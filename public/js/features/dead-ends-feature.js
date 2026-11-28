/**
 * G888: the exit on a street with no road back to Ur when nothing runs there (rules in
 * js/dead-ends.js).
 *
 * - Dead end: a street of the index the signpost graph (plus every feature's `urRoads()`, the ways
 *   out it runs itself, such as the hidden floors' teleporters) never leads to Hechey Track from.
 * - deadEndActive(engine): a held instance or scene (engine.transientInstance), else the first
 *   feature whose `deadEndRun(engine)` answers (a reason word, or true): quest-instances-feature (a
 *   quest room's run), puzzles-feature (a colour level taken from the Map card), newxp-feature (the
 *   tutorial's island and practice streets), hell-feature (the dead), subway-feature (the car),
 *   interrogation-room-feature (its own Leave door). A new instance answers the same hook.
 * - A dead end with nothing active shows the wooden EXIT arrow near where you arrived (where you
 *   stand once landed, SETTLE_MS). It is a door, not a walk-in box (walking past it does nothing,
 *   so exploring Umbra, hub 28 or a party space never sends you out by accident): its Enter verb
 *   (Enter, E, the phone's Act or a click, with the Enter chip naming it as at a street door) leaves by the street owner's own way out when it has one (questRoomLeave:
 *   a quest room's street, a puzzle street), else to the last ordinary street
 *   (quest-instances-feature safeWayOut). It comes and goes as the check changes (a run ending
 *   shows it, one starting hides it), and a reload on a dead end stays there with the exit, in
 *   place of G886/G887's move out.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=<a dead end>; &deadendautoplay=1 stands you at the exit
 * a moment after it shows and uses it
 * (=stand only stands you there, to see its Enter chip). Canvas data: deadEnd ('' off a dead end, 'loading' before the graph,
 * 'exit' with the exit up, 'active:<reason>' while something runs there), deadEndExit ('x,y' screen
 * space of its foot, '' without it), deadEndLast ('left:<tsid>' after using it).
 */

import { DEAD_END_EXIT, DEAD_END_TEXT, deadEndExitSpot, isDeadEndTsid, urReach } from '../dead-ends.js?v=18f7df29';
import { STREET_INDEX, isDraftStreet, resolveIndexTsid } from '../street-loader.js?v=b8ea30df';
import { strayWayOut } from '../quest-instance.js?v=bb5d53fd';
import { loadStreetGraph, worldRoads } from '../street-graph.js?v=92206051';
import { isLoaded, onLoaded, textureFromUrl } from '../textures.js?v=71c5d2dc';
import { anchorBottomCentre } from '../sprite-feet.js?v=6319b91a';
import { WORLD_FONT_FAMILY } from '../world-text.js?v=6b49f88c';

export const DEAD_ENDS_FEATURE_ID = 'dead-ends';
export const DEAD_END_EXIT_CLASS = 'dead_end_exit';

const CHECK_MS = 250;
// Where you arrived is where you stand once landed: a spawn in the air (or over a puzzle street's
// platforms that its events bring in a moment later) settles first, at most this long.
const SETTLE_MS = 600;
const SETTLE_MAX_MS = 4000;
const EXIT_Z = 3;

let reach = null;
let loading = null;
let graph = null;
let roadsKey = '';
let exit = null; // { target, view, spot, tsid, name }
let arrival = null; // { tsid, x, y }: where this street was entered (where you stood once landed)
let enteredAt = 0;
let settled = false;
let lastCheck = 0;
let leaving = false;
let status = '';
let last = '';
let autoplayAt = 0;
let autoplayStood = false;

/** A street of the index, not a builder draft (js/street-loader.js). */
const known = (tsid) => Boolean(resolveIndexTsid(tsid)) && !isDraftStreet(tsid);

/**
 * What runs on this street and owns its way out, as a reason word ('' when nothing): a held
 * instance or scene, else the first feature's `deadEndRun(engine)` answer.
 */
export function deadEndActive(engine) {
  if (engine?.transientInstance?.()) return 'instance';
  const r = engine?.query?.('deadEndRun', engine);
  if (r == null || r === false || r === '') return '';
  return r === true ? 'active' : String(r);
}

/** This street is a dead end (false until the graph is in, at home, in a scene). */
export function onDeadEnd(engine, tsid = engine?.streetTsid) {
  if (!tsid || engine?.homeContext?.()?.inHome || engine?.inScene?.()) return false;
  return isDeadEndTsid(tsid, reach, { known });
}

/** The roads features run themselves (hidden-floors-feature, mid-tower-feature urRoads). */
function featureRoads(engine) {
  const rows = engine?.collect?.('urRoads', engine) || [];
  return rows.filter((r) => r?.from && r?.to);
}

function rebuild(engine) {
  if (!graph) return;
  const roads = featureRoads(engine);
  roadsKey = roads.map((r) => `${r.from}>${r.to}`).join(',');
  reach = urReach(graph, roads);
}

function loadReach(engine) {
  if (reach || loading || typeof fetch !== 'function' || typeof window === 'undefined') return;
  // The street graph (js/street-graph.js, fetched once for every feature); a dead end is geography,
  // so the walk counts roads still being built (streetsLeadingTo).
  loading = loadStreetGraph().then((ok) => {
    if (!ok) {
      loading = null;
      return;
    }
    graph = worldRoads();
    rebuild(engine);
  });
}

/** Where the exit leads now ({ tsid, x, y }), for its words and its own way out. */
function wayOut(engine) {
  // G1139: a street's owner may name its own (subway-feature deadEndWayOut: a stranded car's platform).
  return engine?.query?.('deadEndWayOut', engine) || engine?.query?.('safeWayOut', engine, {}) || strayWayOut({});
}

function placeName(tsid) {
  const key = resolveIndexTsid(tsid);
  return (key && STREET_INDEX.streets?.[key]?.label) || '';
}

function publish(engine) {
  engine.setData?.('deadEnd', status);
  engine.setData?.('deadEndExit', exit ? `${exit.spot.x},${exit.spot.y}` : '');
  engine.setData?.('deadEndLast', last);
}

/* ------------------------------------------------------------------ */
/* The sign                                                            */
/* ------------------------------------------------------------------ */

function clearExit(engine) {
  if (!exit) return;
  if (exit.target) {
    try { engine.unregister?.(exit.target); } catch { /* gone */ }
  }
  for (const v of [exit.view]) {
    if (v && !v.destroyed) {
      v.parent?.removeChild(v);
      v.destroy({ children: true });
    }
  }
  exit = null;
}

/** The arrow hung on the wall over `spot` (screen space, a spot on the floor), the word on the board. */
function buildView(engine, spot) {
  const { PIXI } = engine;
  const e = DEAD_END_EXIT;
  const root = new PIXI.Container();
  root.x = spot.x;
  root.y = spot.y;
  root.zIndex = EXIT_Z;
  const tex = textureFromUrl(e.art);
  const board = new PIXI.Sprite(tex);
  anchorBottomCentre(board, 'held');
  board.x = 0;
  board.y = -e.hang;
  const size = () => {
    board.width = e.w;
    board.height = e.h;
    // It points the way out: toward the street's end it stands nearer to.
    if (spot.side < 0) board.scale.x = -Math.abs(board.scale.x);
  };
  size();
  if (!isLoaded(tex.source)) onLoaded(tex.source, () => !board.destroyed && size());
  root.addChild(board);
  const word = new PIXI.Text({ text: e.word, style: {
    fontFamily: WORLD_FONT_FAMILY,
    fontSize: e.wordSize,
    fontWeight: '900',
    fill: 0xf6e7b8,
    letterSpacing: 1,
    stroke: { color: 0x5a3a1c, width: 3, join: 'round' },
  } });
  word.resolution = 3;
  word.anchor.set(0.5, 0.5);
  word.x = spot.side < 0 ? -e.wordDx : e.wordDx;
  word.y = board.y - e.h / 2 + 2;
  word.eventMode = 'none';
  root.addChild(word);
  const hitW = e.w;
  const hitH = e.h + e.hang;
  root._worldHitW = hitW;
  root._worldHitH = hitH;
  root.hitArea = new PIXI.Rectangle(-hitW / 2, -hitH, hitW, hitH);
  root.eventMode = 'static';
  root.cursor = 'pointer';
  engine.entityLayer.addChild(root);
  return root;
}

function showExit(engine) {
  const street = engine.street;
  const bounds = street?.bounds || {};
  const width = Number(engine.worldW) || (Number(bounds.r) - Number(bounds.l)) || 0;
  const here = arrival?.tsid === engine.streetTsid ? arrival : null;
  const spot = deadEndExitSpot({ platforms: engine.platforms || [], arrival: here, width });
  const view = buildView(engine, spot);
  const to = wayOut(engine);
  const name = placeName(to?.tsid);
  const target = engine.register({
    classId: DEAD_END_EXIT_CLASS,
    featureId: DEAD_ENDS_FEATURE_ID,
    label: DEAD_END_TEXT.label,
    subtitle: DEAD_END_TEXT.subtitle(name),
    sprite: view,
  });
  exit = { target, view, spot, tsid: engine.streetTsid, name };
  if (['1', 'stand'].includes(engine.param?.('deadendautoplay'))) {
    autoplayAt = Date.now() + 1500;
    autoplayStood = false;
  }
}

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

/**
 * Through the exit: the street owner's own way out when it has one (quest-instances-feature and
 * puzzles-feature questRoomLeave: a quest room's or puzzle street's, back where you came in), else
 * the last ordinary street. Never while something runs here.
 */
async function useExit(engine) {
  if (leaving || !exit || deadEndActive(engine)) return false;
  leaving = true;
  const from = engine.streetTsid;
  try {
    const owned = engine.query?.('questRoomLeave', engine, {});
    let ok = false;
    if (owned != null) ok = (await owned) !== false;
    else {
      const to = wayOut(engine);
      // R46: false when the trip failed (it said so); the exit stays for another go.
      ok = (await engine.enter(to.tsid, {
        ...(Number.isFinite(to.x) ? { spawnX: to.x } : {}),
        ...(Number.isFinite(to.y) ? { spawnY: to.y } : {}),
        quiet: true,
        bypassFeatureGates: true,
        useTransition: true,
      })) !== false;
    }
    if (ok && engine.streetTsid !== from) {
      last = `left:${engine.streetTsid}`;
      engine.save?.();
    }
    publish(engine);
    return ok;
  } catch (err) {
    console.warn('dead end exit', err);
    return false;
  } finally {
    leaving = false;
  }
}

/* ------------------------------------------------------------------ */
/* Each check                                                          */
/* ------------------------------------------------------------------ */

/** The arrival, once you have landed on this street (SETTLE_MS, or SETTLE_MAX_MS at most). */
function settleArrival(engine, now) {
  if (settled) return true;
  const p = engine.player;
  const waited = now - enteredAt;
  if (p && waited < SETTLE_MS) return false;
  if (p && waited < SETTLE_MAX_MS && (p.onGround === false || Math.abs(Number(p.vy) || 0) > 1)) return false;
  if (p) arrival = { tsid: engine.streetTsid, x: Number(p.x), y: Number(p.y) };
  settled = true;
  return true;
}

function check(engine, now = Date.now()) {
  if (!engine.started && engine.started !== undefined) return;
  // A feature's roads that came after the graph (none today) rebuild the reach once.
  if (graph && featureRoads(engine).map((r) => `${r.from}>${r.to}`).join(',') !== roadsKey) rebuild(engine);
  let next = '';
  let want = false;
  if (engine.streetTsid && !engine.homeContext?.()?.inHome && !engine.inScene?.()) {
    if (!reach) next = indexShapedHere(engine) ? 'loading' : '';
    else if (onDeadEnd(engine)) {
      const why = deadEndActive(engine);
      next = why ? `active:${why}` : 'exit';
      want = !why;
    }
  }
  const had = Boolean(exit);
  if (exit && (!want || exit.tsid !== engine.streetTsid || !exit.view || exit.view.destroyed || !exit.view.parent)) clearExit(engine);
  if (want && !exit && engine.entityLayer && engine.PIXI && settleArrival(engine, now)) showExit(engine);
  if (next !== status || had !== Boolean(exit)) {
    status = next;
    publish(engine);
  }
}

const indexShapedHere = (engine) => known(engine.streetTsid);

export const deadEndsFeature = {
  id: DEAD_ENDS_FEATURE_ID,

  init(engine) {
    loadReach(engine);
  },

  onStreetEnter(street, engine) {
    clearExit(engine);
    const p = engine.player;
    arrival = { tsid: street?.tsid || engine.streetTsid, x: Number(p?.x), y: Number(p?.y) };
    enteredAt = Date.now();
    settled = false;
    autoplayAt = 0;
    lastCheck = 0;
    loadReach(engine);
    check(engine, enteredAt);
    publish(engine);
  },

  onStreetClear(engine) {
    clearExit(engine);
  },

  onTick(_dt, now, engine) {
    if (now - lastCheck >= CHECK_MS) {
      lastCheck = now;
      check(engine, now);
    }
    if (!exit || leaving) return;
    // QA (&deadendautoplay=1): stand at it, then use it as its Enter verb does.
    const p = engine.player;
    if (!p || !autoplayAt || now < autoplayAt) return;
    if (!autoplayStood) {
      Object.assign(p, { x: exit.spot.x, y: exit.spot.y, vx: 0, vy: 0 });
      autoplayStood = true;
      autoplayAt = now + 1200;
      return;
    }
    autoplayAt = 0;
    if (engine.param?.('deadendautoplay') === '1') useExit(engine);
  },

  verbsFor(t) {
    if (t?.classId !== DEAD_END_EXIT_CLASS) return [];
    return [{ id: 'enter', label: DEAD_END_TEXT.verb, sort: 50, enabled: !leaving, durationMs: 0, tooltip: DEAD_END_TEXT.tip(exit?.name) }];
  },

  runVerb(t, verbId, engine) {
    if (t?.classId !== DEAD_END_EXIT_CLASS || verbId !== 'enter') return false;
    useExit(engine);
    return true;
  },

  /** Tests: the reach as loaded (graph, roads) and the exit on screen. */
  _setGraph(g, engine) {
    graph = g;
    rebuild(engine);
  },
  _state: () => ({ reach, exit, status, last, arrival }),
  _reset() {
    reach = null;
    loading = null;
    graph = null;
    roadsKey = '';
    exit = null;
    arrival = null;
    enteredAt = 0;
    settled = false;
    lastCheck = 0;
    leaving = false;
    status = '';
    last = '';
    autoplayAt = 0;
  },
};
