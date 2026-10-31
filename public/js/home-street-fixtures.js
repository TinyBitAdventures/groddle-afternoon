/**
 * The fixed things on your home street and where the Mail Dispatcher stands
 * among them (pure: no Pixi, no DOM). World x on the home street; `layout` is
 * home-cultivation.js homeStreetLayout (lotLeft, houseX, width).
 *
 * The fixtures and their drawn half widths:
 * - the World Gate (homes-feature makeGateSprite): its post at the lot's left
 *   edge + 40, its board 140 wide;
 * - the friends' signpost (multiplayer, home-street-mp-feature drawSignpost):
 *   its post 70 left of the lot, where locations/home.js 212-218 put the
 *   source's post (x -328) by the gate. Its right arms reach over the gate's
 *   board on purpose; its left arms (the 2nd and 4th friend) reach up to
 *   SIGNPOST.left, room for a 19-letter name (the site's name rule);
 * - the Mailbox at the house's sign corner, the front door's hit area, the
 *   Magic Rock right of the door (homes-feature STREET_ROCK) and the Butler
 *   Box beyond it (butler-feature BOX_RX).
 *
 * The Mail Dispatcher (items/npc_mail_dispatcher.js). The source rebuilt it
 * with the mailbox from the street template whenever a player street changed
 * (locations/inc_upgrades.js upgrades_recreate_classes), so no player ever
 * moved it. Reimagined: it stands just outside the World Gate, past the
 * signpost's left arms (the same spot solo and online, whether or not the
 * signpost has friends on it), and in Cultivate you can move it anywhere
 * along the street that is clear of these fixtures and of your cultivations,
 * or put it back. The spot is saved with the street (cultivation state
 * `dispatcherRx`, x from the house's centre, so a left expansion carries it
 * along); a saved spot that no longer fits shows at the nearest one that does.
 */

/** The dispatcher art's drawn half width (dispatcher_left.png: x 8..107 around its origin 59). */
export const DISPATCHER_HALF = 52;
/** Clear ground kept between the dispatcher and its neighbours. */
export const DISPATCHER_GAP = 12;
/** How close to either end of the street it may stand (homeStreetLayout minRx / maxRx). */
export const STREET_EDGE = 60;

export const GATE = Object.freeze({ lotDx: 40, half: 70 });
export const SIGNPOST = Object.freeze({ lotDx: -70, left: 180, right: 70 });
export const MAILBOX_HALF = 36;
export const DOOR_HALF = 46;
export const STREET_ROCK = Object.freeze({ houseDx: 221, half: 22 });
export const BUTLER_BOX = Object.freeze({ houseDx: 300, half: 32 });

export const DISPATCHER_TEXT = Object.freeze({
  label: 'Mail Dispatcher',
  sub: 'Move it anywhere along your street that is clear of your gate, signpost, Mailbox and door.',
  move: 'Move',
  moveTitle: 'Carry it to a new spot on your street',
  reset: 'Back to its usual spot',
  resetTitle: 'Put it back just outside the World Gate',
  atUsual: 'It is in its usual spot.',
  banner: 'Move Mail Dispatcher',
  bannerTitle: 'Pick up your Mail Dispatcher and set it down somewhere else on your street',
  moved: 'You moved your Mail Dispatcher.',
  resetDone: 'Your Mail Dispatcher is back in its usual spot.',
  edge: 'Not enough street there.',
  door: 'Keep the path to your front door clear.',
});

const FIXTURE_NAMES = Object.freeze({
  gate: 'World Gate',
  signpost: 'signpost',
  mailbox: 'Mailbox',
  rock: 'Magic Rock',
  butler_box: 'Butler Box',
});

/** The world x of the gate's and the signpost's posts on this street. */
export function gateX(layout) {
  return layout.lotLeft + GATE.lotDx;
}

export function signpostX(layout) {
  return layout.lotLeft + SIGNPOST.lotDx;
}

/**
 * The fixtures' spans, [x1, x2] in world x. `at` gives the drawn Mailbox and door x
 * (they follow the house style); without them they are left out.
 */
export function streetFixtures(layout, at = {}) {
  const rows = [
    { id: 'gate', x1: gateX(layout) - GATE.half, x2: gateX(layout) + GATE.half },
    { id: 'signpost', x1: signpostX(layout) - SIGNPOST.left, x2: signpostX(layout) + SIGNPOST.right },
    { id: 'rock', x1: layout.houseX + STREET_ROCK.houseDx - STREET_ROCK.half, x2: layout.houseX + STREET_ROCK.houseDx + STREET_ROCK.half },
    { id: 'butler_box', x1: layout.houseX + BUTLER_BOX.houseDx - BUTLER_BOX.half, x2: layout.houseX + BUTLER_BOX.houseDx + BUTLER_BOX.half },
  ];
  if (Number.isFinite(at.mailboxX)) rows.push({ id: 'mailbox', x1: at.mailboxX - MAILBOX_HALF, x2: at.mailboxX + MAILBOX_HALF });
  if (Number.isFinite(at.doorX)) rows.push({ id: 'door', x1: at.doorX - DOOR_HALF, x2: at.doorX + DOOR_HALF });
  return rows;
}

/** The usual spot, x from the house's centre: past the signpost's left arms (-674 on every street). */
export function dispatcherDefaultRx(layout) {
  return Math.round(signpostX(layout) - SIGNPOST.left - DISPATCHER_GAP - DISPATCHER_HALF - layout.houseX);
}

/** The saved spot (x from the house's centre), or null for the usual one. */
export function savedDispatcherRx(state) {
  const rx = Number(state?.dispatcherRx);
  return state?.dispatcherRx != null && Number.isFinite(rx) ? Math.round(rx) : null;
}

/**
 * Whether the dispatcher fits at world x: on the street, clear of every fixture and
 * of `items` ([{ x, half, label }], the cultivations in world x).
 */
export function dispatcherFits(layout, x, { fixtures = streetFixtures(layout), items = [] } = {}) {
  const x1 = x - DISPATCHER_HALF;
  const x2 = x + DISPATCHER_HALF;
  if (!Number.isFinite(x) || x1 < STREET_EDGE || x2 > layout.width - STREET_EDGE) return { ok: false, reason: 'edge', msg: DISPATCHER_TEXT.edge };
  for (const f of fixtures) {
    if (x2 + DISPATCHER_GAP > f.x1 && x1 - DISPATCHER_GAP < f.x2) {
      if (f.id === 'door') return { ok: false, reason: 'door', msg: DISPATCHER_TEXT.door };
      return { ok: false, reason: f.id, msg: `Keep it clear of your ${FIXTURE_NAMES[f.id] || f.id}.` };
    }
  }
  for (const it of items) {
    if (Math.abs(it.x - x) < DISPATCHER_HALF + it.half) return { ok: false, reason: 'overlap', msg: `Too close to your ${it.label || 'cultivation'}.` };
  }
  return { ok: true };
}

/**
 * Where the dispatcher stands: the saved spot (or the usual one), or the nearest spot
 * that fits, searching outward. Returns world x.
 */
export function dispatcherSpot(layout, rx = null, opts = {}) {
  const start = Math.round(layout.houseX + (rx ?? dispatcherDefaultRx(layout)));
  for (let d = 0; d <= layout.width; d += 6) {
    for (const x of d ? [start - d, start + d] : [start]) {
      if (dispatcherFits(layout, x, opts).ok) return x;
    }
  }
  return Math.max(STREET_EDGE + DISPATCHER_HALF, Math.min(layout.width - STREET_EDGE - DISPATCHER_HALF, start));
}
