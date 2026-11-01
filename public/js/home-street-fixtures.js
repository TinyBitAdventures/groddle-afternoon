/**
 * The fixed things on your home street and where the Mail Dispatcher stands
 * among them (pure: no Pixi, no DOM). World x on the home street; `layout` is
 * home-cultivation.js homeStreetLayout (lotLeft, houseX, width).
 *
 * The fixtures and their drawn half widths:
 * - the signpost (GATESIGN2, Austin 2026-10-31: one post, not two): its post 70
 *   left of the lot, where locations/home.js 212-218 put the source's post
 *   (x -328). homes-feature makeHomeSignpost draws the post with its top arm,
 *   "Back to Ur", pointing left (toward the world: the way out, which replaced
 *   the code-drawn World Gate); online, home-street-mp-feature drawSignpost hangs
 *   the friends' arms below it. The right arms reach up to SIGNPOST.right; the
 *   left arms (the 2nd and 4th friend) up to SIGNPOST.left, room for a 19-letter
 *   name (the site's name rule);
 * - the Mailbox at the house's sign corner, the front door's hit area, the
 *   Magic Rock right of the door (homes-feature STREET_ROCK) and the Butler
 *   Box beyond it (butler-feature BOX_RX).
 *
 * The Mail Dispatcher (items/npc_mail_dispatcher.js). The source rebuilt it
 * with the mailbox from the street template whenever a player street changed
 * (locations/inc_upgrades.js upgrades_recreate_classes), so no player ever
 * moved it. Reimagined: it stands just outside the signpost, past its left arms (the same spot solo and online, whether or not the
 * signpost has friends on it), and in Cultivate you can move it anywhere
 * along the street that is clear of these fixtures and of your cultivations,
 * or put it back. The spot is saved with the street (cultivation state
 * `dispatcherRx`, x from the house's centre, so a left expansion carries it
 * along); a saved spot that no longer fits shows at the nearest one that does.
 *
 * PORCH (Austin 2026-11-01, "my house front is crowded"): the Mailbox and the Magic Rock
 * move the same way (MOVABLE_FIXTURES; saved as `mailboxRx` / `rockRx`). The source put both
 * by the house and no player moved them either: the Mailbox came with the street template
 * (upgrades_recreate_classes, as above) and the rock at (221, -144) right of the door
 * (inc_homes.js homes_demo_frontyard 2469-2471). Until you move one it stands where it always
 * did; a moved one keeps clear of the door and its mat, the other fixtures and your
 * cultivations, and steps aside (never the other way round) if something is in its way.
 */

/** The dispatcher art's drawn half width (dispatcher_left.png: x 8..107 around its origin 59). */
export const DISPATCHER_HALF = 52;
/** Clear ground kept between the dispatcher (and any moved fixture) and its neighbours. */
export const DISPATCHER_GAP = 12;
export const FIXTURE_GAP = DISPATCHER_GAP;
/** How close to either end of the street it may stand (homeStreetLayout minRx / maxRx). */
export const STREET_EDGE = 60;

export const SIGNPOST = Object.freeze({ lotDx: -70, left: 180, right: 70 });
export const MAILBOX_HALF = 36;
export const DOOR_HALF = 46;
export const STREET_ROCK = Object.freeze({ houseDx: 221, half: 22 });
export const BUTLER_BOX = Object.freeze({ houseDx: 300, half: 32 });

export const DISPATCHER_TEXT = Object.freeze({
  label: 'Mail Dispatcher',
  sub: 'Move it anywhere along your street that is clear of your signpost, Mailbox and door.',
  move: 'Move',
  moveTitle: 'Carry it to a new spot on your street',
  reset: 'Back to its usual spot',
  resetTitle: 'Put it back just past your signpost',
  atUsual: 'It is in its usual spot.',
  banner: 'Move Mail Dispatcher',
  bannerTitle: 'Pick up your Mail Dispatcher and set it down somewhere else on your street',
  moved: 'You moved your Mail Dispatcher.',
  resetDone: 'Your Mail Dispatcher is back in its usual spot.',
  edge: 'Not enough street there.',
  door: 'Keep the path to your front door clear.',
});

const FIXTURE_NAMES = Object.freeze({
  signpost: 'signpost',
  mailbox: 'Mailbox',
  rock: 'Magic Rock',
  butler_box: 'Butler Box',
  dispatcher: 'Mail Dispatcher',
});

/**
 * The fixtures you can move in Cultivate on your home street, in the banner's order: the
 * cultivation state key of a moved one's spot, its drawn half width and height (the hit box),
 * the interactable it is on the street.
 */
export const MOVABLE_FIXTURES = Object.freeze({
  mailbox: Object.freeze({ id: 'mailbox', key: 'mailboxRx', half: MAILBOX_HALF, tall: 146, classId: 'npc_mailbox' }),
  rock: Object.freeze({ id: 'rock', key: 'rockRx', half: STREET_ROCK.half, tall: 80, classId: 'magic_rock' }),
  dispatcher: Object.freeze({ id: 'dispatcher', key: 'dispatcherRx', half: DISPATCHER_HALF, tall: 150, classId: 'npc_mail_dispatcher' }),
});
export const MOVABLE_FIXTURE_IDS = Object.freeze(Object.keys(MOVABLE_FIXTURES));

const MOVE_TEXT = Object.freeze({
  mailbox: Object.freeze({
    label: 'Mailbox',
    sub: 'Move it anywhere along your street that is clear of your door and the other things on it.',
    resetTitle: 'Put it back by the corner of your house',
    bannerTitle: 'Pick up your Mailbox and set it down somewhere else on your street',
  }),
  rock: Object.freeze({
    label: 'Magic Rock',
    sub: 'Move it anywhere along your street that is clear of your door and the other things on it.',
    resetTitle: 'Put it back just right of your door',
    bannerTitle: 'Pick up your Magic Rock and set it down somewhere else on your street',
  }),
});

/** A movable fixture's words (the dispatcher's are DISPATCHER_TEXT). */
export function fixtureText(id) {
  if (id === 'dispatcher') return DISPATCHER_TEXT;
  const t = MOVE_TEXT[id];
  if (!t) return null;
  return {
    ...DISPATCHER_TEXT,
    ...t,
    banner: `Move ${t.label}`,
    moved: `You moved your ${t.label}.`,
    resetDone: `Your ${t.label} is back in its usual spot.`,
  };
}

/** A fixture's name in a player-facing line ("Keep it clear of your signpost."). */
export function fixtureName(id) {
  return FIXTURE_NAMES[id] || id;
}

/** The world x of the signpost's post on this street (its way out and, online, its friends). */
export function signpostX(layout) {
  return layout.lotLeft + SIGNPOST.lotDx;
}

/**
 * The fixtures' spans, [x1, x2] in world x. `at` gives the drawn Mailbox and door x
 * (they follow the house style; `doorway` the door and its mat, homes-feature houseDoorway,
 * wins over `doorX`); without them they are left out. `rockX` is where the Magic Rock stands
 * (else its usual spot), `dispatcherX` the Mail Dispatcher (left out without it).
 */
export function streetFixtures(layout, at = {}) {
  const rockX = Number.isFinite(at.rockX) ? at.rockX : layout.houseX + STREET_ROCK.houseDx;
  const rows = [
    { id: 'signpost', x1: signpostX(layout) - SIGNPOST.left, x2: signpostX(layout) + SIGNPOST.right },
    { id: 'rock', x1: rockX - STREET_ROCK.half, x2: rockX + STREET_ROCK.half },
    { id: 'butler_box', x1: layout.houseX + BUTLER_BOX.houseDx - BUTLER_BOX.half, x2: layout.houseX + BUTLER_BOX.houseDx + BUTLER_BOX.half },
  ];
  if (Number.isFinite(at.mailboxX)) rows.push({ id: 'mailbox', x1: at.mailboxX - MAILBOX_HALF, x2: at.mailboxX + MAILBOX_HALF });
  if (Number.isFinite(at.doorway?.x1) && Number.isFinite(at.doorway?.x2)) rows.push({ id: 'door', x1: at.doorway.x1, x2: at.doorway.x2 });
  else if (Number.isFinite(at.doorX)) rows.push({ id: 'door', x1: at.doorX - DOOR_HALF, x2: at.doorX + DOOR_HALF });
  if (Number.isFinite(at.dispatcherX)) rows.push({ id: 'dispatcher', x1: at.dispatcherX - DISPATCHER_HALF, x2: at.dispatcherX + DISPATCHER_HALF });
  return rows;
}

/** The usual spot, x from the house's centre: past the signpost's left arms (-674 on every street). */
export function dispatcherDefaultRx(layout) {
  return Math.round(signpostX(layout) - SIGNPOST.left - DISPATCHER_GAP - DISPATCHER_HALF - layout.houseX);
}

/** A movable fixture's saved spot (x from the house's centre), or null for the usual one. */
export function savedFixtureRx(state, id) {
  const key = MOVABLE_FIXTURES[id]?.key;
  if (!key || state?.[key] == null) return null;
  const rx = Number(state[key]);
  return Number.isFinite(rx) ? Math.round(rx) : null;
}

/** The dispatcher's saved spot (x from the house's centre), or null for the usual one. */
export function savedDispatcherRx(state) {
  return savedFixtureRx(state, 'dispatcher');
}

/**
 * Whether movable fixture `id` fits at world x: on the street, clear of every other fixture
 * (its own row is skipped) and of `items` ([{ x, half, label }], the cultivations in world x).
 */
export function fixtureFits(layout, id, x, { fixtures = streetFixtures(layout), items = [] } = {}) {
  const half = MOVABLE_FIXTURES[id]?.half ?? DISPATCHER_HALF;
  const x1 = x - half;
  const x2 = x + half;
  if (!Number.isFinite(x) || x1 < STREET_EDGE || x2 > layout.width - STREET_EDGE) return { ok: false, reason: 'edge', msg: DISPATCHER_TEXT.edge };
  for (const f of fixtures) {
    if (f.id === id) continue;
    if (x2 + FIXTURE_GAP > f.x1 && x1 - FIXTURE_GAP < f.x2) {
      if (f.id === 'door') return { ok: false, reason: 'door', msg: DISPATCHER_TEXT.door };
      return { ok: false, reason: f.id, msg: `Keep it clear of your ${FIXTURE_NAMES[f.id] || f.id}.` };
    }
  }
  for (const it of items) {
    if (Math.abs(it.x - x) < half + it.half) return { ok: false, reason: 'overlap', msg: `Too close to your ${it.label || 'cultivation'}.` };
  }
  return { ok: true };
}

/**
 * Whether the dispatcher fits at world x: on the street, clear of every fixture and
 * of `items` ([{ x, half, label }], the cultivations in world x).
 */
export function dispatcherFits(layout, x, opts = {}) {
  return fixtureFits(layout, 'dispatcher', x, opts);
}

/**
 * Where movable fixture `id` stands: `rx` (x from the house's centre), or the nearest spot
 * that fits, searching outward. Returns world x.
 */
export function fixtureSpot(layout, id, rx, opts = {}) {
  const half = MOVABLE_FIXTURES[id]?.half ?? DISPATCHER_HALF;
  const start = Math.round(layout.houseX + rx);
  for (let d = 0; d <= layout.width; d += 6) {
    for (const x of d ? [start - d, start + d] : [start]) {
      if (fixtureFits(layout, id, x, opts).ok) return x;
    }
  }
  return Math.max(STREET_EDGE + half, Math.min(layout.width - STREET_EDGE - half, start));
}

/**
 * Where the dispatcher stands: the saved spot (or the usual one), or the nearest spot
 * that fits, searching outward. Returns world x.
 */
export function dispatcherSpot(layout, rx = null, opts = {}) {
  return fixtureSpot(layout, 'dispatcher', rx ?? dispatcherDefaultRx(layout), opts);
}
