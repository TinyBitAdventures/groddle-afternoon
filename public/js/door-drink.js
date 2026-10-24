/**
 * Door Drink and the Hyperspacetime Portal Door: pure rules (G123, config
 * portal_group). js/features/door-drink-feature.js binds them to the world.
 *
 * Source map (GameServerJS, Dec 2012):
 *  - items/potion_chris.js: a three-use potion (points_capacity 3) whose only
 *    verb is Pour ("Open a door to adventure"); canPour refuses POLs (homes),
 *    instances and Hell with "You can't pour this potion here."; onPour asks
 *    the portal group for a new portal at the avatar. potion_base: a 2.5 s
 *    locking pour, then use(1) and potions_used:potion_chris; an empty bottle
 *    is used up and the next one in the stack starts full.
 *  - config_prod.js portal_group 'RIFQS6N3PLH2TL4', groups/portal.js: one
 *    world-wide chain. create_portal nudges the door 100 px off a signpost
 *    (toward the street's middle); set_active_portal makes the new door the
 *    active one, points it at the previous active door, points every other
 *    door at the new one, and deletes doors older than the previous active one
 *    10 s after they were made.
 *  - items/portal.js: Enter (key E) opens the door (0.3 s) and teleports to
 *    its target; a door with no target yet says "This portal's destination
 *    has yet to be created."; the door closes 2 s after the last use.
 *    Frames from glitch-items/misc/portal/portal.swf: closed 1, opening 30,
 *    open 40, closing 70.
 *
 * Solo reading: the chain was shared by everyone, so a new door led to
 * wherever the last Glitch in Ur had poured one. With one player the chain is
 * your own: your first door waits for a destination, and each new door pairs
 * with the one before it, two ways.
 */

export const DOOR_DRINK = 'potion_chris';
export const PORTAL_CLASS = 'portal';
/** potion_chris.js points_capacity. */
export const DOOR_DRINK_USES = 3;
/** potion_base pour overlay duration and apiSetTimerX('onPourComplete', 2500). */
export const POUR_MS = 2500;
/** portal.js openDoor: doorOpened after 0.3 s; closeDoor 2 s after; doorClosed 0.3 s later. */
export const OPEN_MS = 300;
export const CLOSE_AFTER_MS = 2000;
/** groups/portal.js set_active_portal: older doors go 10 s after they were made. */
export const DELETE_AFTER_MS = 10_000;
/** groups/portal.js bump_drop_location. */
export const SIGNPOST_CLEARANCE = 100;

export const DOOR_DRINK_COPY = Object.freeze({
  // potion_chris.js classProps pour_tooltip
  pourTooltip: 'Open a door to adventure',
  // potion_chris.js canPour
  cantPour: "You can't pour this potion here.",
  // potion_base verbs.pour conditions
  dead: "This is no time to be messing about with potions. You're dead!",
  // portal.js verbs.enter
  enterTooltip: 'Enter the portal',
  noDestination: "This portal's destination has yet to be created.",
  // potion_base onPourComplete -> buildVerbMessage(1, 'pour', 'poured')
  poured: 'You poured a Door Drink.',
});

export const PORTAL_LABEL = 'Hyperspacetime Portal Door';

export function createPortalGroup(seed = {}) {
  return normalizePortalGroup(seed);
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const tsidOk = (t) => typeof t === 'string' && /^[A-Z0-9]{5,24}$/.test(t);

function normalizeTarget(t) {
  if (!t || !tsidOk(t.tsid)) return null;
  return { tsid: t.tsid, x: Math.round(num(t.x)), y: Math.round(num(t.y)) };
}

/** Saved state: { active, seq, portals: { id: { tsid, x, y, createdAt, deleteAt, target } }, bottleUses }. */
export function normalizePortalGroup(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const portals = {};
  for (const [id, p] of Object.entries(s.portals || {})) {
    if (!/^p\d{1,9}$/.test(id) || !p || !tsidOk(p.tsid)) continue;
    portals[id] = {
      tsid: p.tsid,
      x: Math.round(num(p.x)),
      y: Math.round(num(p.y)),
      createdAt: num(p.createdAt),
      deleteAt: p.deleteAt ? num(p.deleteAt) : 0,
      target: normalizeTarget(p.target),
    };
  }
  const active = portals[s.active] ? s.active : null;
  const uses = Math.floor(num(s.bottleUses, DOOR_DRINK_USES));
  return {
    version: 1,
    active,
    seq: Math.max(0, Math.floor(num(s.seq))),
    portals,
    bottleUses: uses >= 1 && uses <= DOOR_DRINK_USES ? uses : DOOR_DRINK_USES,
  };
}

/**
 * potion_chris.js canPour (+ potion_base's dead check).
 * ctx: { inHome, inInstance, inHell, dead }
 */
export function canPour(ctx = {}) {
  if (ctx.dead) return { ok: false, msg: DOOR_DRINK_COPY.dead };
  if (ctx.inHome || ctx.inInstance || ctx.inHell) return { ok: false, msg: DOOR_DRINK_COPY.cantPour };
  return { ok: true };
}

/**
 * groups/portal.js bump_drop_location in source street coordinates (x = 0 is
 * the street's middle): a door within 100 px of a signpost moves to 100 px
 * beside it, on the side toward the middle.
 */
export function bumpDropLocation(x, y, signposts = []) {
  let bx = x;
  for (const sp of signposts) {
    if (Math.abs(bx - sp.x) < SIGNPOST_CLEARANCE && Math.abs(y - sp.y) < SIGNPOST_CLEARANCE) {
      bx = bx > 0 ? sp.x - SIGNPOST_CLEARANCE : sp.x + SIGNPOST_CLEARANCE;
    }
  }
  return { x: bx, y };
}

/**
 * create_portal + set_active_portal. Mutates the group; returns the new
 * portal's id. The new door targets the previous active door; every other
 * door now targets the new one; doors other than those two are deleted
 * 10 s after they were made.
 */
export function addPortal(group, { tsid, x, y }, now = Date.now()) {
  group.seq += 1;
  const id = `p${group.seq}`;
  const oldActive = group.active && group.portals[group.active] ? group.active : null;
  const old = oldActive ? group.portals[oldActive] : null;
  group.portals[id] = {
    tsid,
    x: Math.round(x),
    y: Math.round(y),
    createdAt: now,
    deleteAt: 0,
    target: old ? { tsid: old.tsid, x: old.x, y: old.y } : null,
  };
  group.active = id;
  for (const [pid, p] of Object.entries(group.portals)) {
    if (pid === id) continue;
    p.target = { tsid, x: Math.round(x), y: Math.round(y) };
    if (pid !== oldActive && !p.deleteAt) p.deleteAt = p.createdAt + DELETE_AFTER_MS;
  }
  return id;
}

/** delete_portal for every door whose time came. Returns the ids removed. */
export function prunePortals(group, now = Date.now()) {
  const gone = [];
  for (const [id, p] of Object.entries(group.portals)) {
    if (p.deleteAt && now >= p.deleteAt) {
      delete group.portals[id];
      gone.push(id);
    }
  }
  if (group.active && !group.portals[group.active]) group.active = null;
  return gone;
}

export function portalsOn(group, tsid) {
  return Object.entries(group.portals).filter(([, p]) => p.tsid === tsid).map(([id, p]) => ({ id, ...p }));
}

/** portal.js verbs.enter conditions. */
export function canEnter(portal) {
  if (!portal?.target) return { ok: false, msg: DOOR_DRINK_COPY.noDestination };
  return { ok: true, target: portal.target };
}

/**
 * potion_base onPourComplete: use(1); an empty bottle is used up and the
 * next in the stack starts full. Mutates inv and group.bottleUses.
 * Returns { ok, consumed, usesLeft }.
 */
export function useDoorDrink(group, inv) {
  if (!((Number(inv?.[DOOR_DRINK]) || 0) >= 1)) return { ok: false, consumed: false, usesLeft: 0 };
  group.bottleUses -= 1;
  let consumed = false;
  if (group.bottleUses <= 0) {
    inv[DOOR_DRINK] -= 1;
    consumed = true;
    group.bottleUses = DOOR_DRINK_USES;
  }
  return { ok: true, consumed, usesLeft: (Number(inv[DOOR_DRINK]) || 0) > 0 ? group.bottleUses : 0 };
}

/** Frames of the packed sheet (assets/sprites/door-drink/portal_sheet.webp, 8 columns of 274 x 333 at 2x). */
export const PORTAL_SHEET = Object.freeze({
  url: 'assets/sprites/door-drink/portal_sheet.webp',
  cols: 8,
  cellW: 274,
  cellH: 333,
  scale: 0.5,
  // SWF frames 1, 30-39, 40-68 (every other), 70-80.
  closed: [0],
  opening: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  open: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  closing: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36],
});
