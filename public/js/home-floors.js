/**
 * House floors and the Door that adds them (pure rules: no Pixi, no DOM).
 * features/homes-feature.js draws the floors and runs the verbs; the Build a
 * New Floor project runs through features/street-jobs-feature.js projectApi.
 *
 * Source (glitch-GameServerJS, CC0):
 *  - items/furniture_door.js: "Door", base_cost 2,500, placement_set
 *    bookshelf, can_flip 0, job_class_id job_proto_door. canDropAt (526-529):
 *    only where the location can add a door. onContainerChanged (564-592):
 *    set down in your house (not one the house made itself, no_job) it opens
 *    the project (in_order 1, delay_seconds 60) and the door shows its job
 *    frame (getDefaultUpgradeConfig 536-543: door_up_job). verbs.create
 *    (464-487, tooltip "Add a floor") offers the project while it has one.
 *    canPickup (531-534): "You can't pick up placed doors." once the project
 *    has started, or once the floor is built. onJobComplete (594-598):
 *    homes_add_floor_at(this.x, this).
 *  - main.js doFurnitureMove (7051-7106): a placed Door still moves. "Don't
 *    move doors from their y position" (msg.y = item.y), its own geo door
 *    moves to the new x, and the Door on the other floor now leads to it
 *    (target_door.connect.x = msg.x). The client keeps the drag on the
 *    Door's own plat (HandOfDecorator.as 1269-1273 door_plat_id, 1089-1100).
 *    inc_homes.js 741-788 builds each pair: floor_N_up stands at
 *    doors_up[N-1].x and leads to doors_down[N].x, floor_N_down the other
 *    way, so the two Doors of a pair keep their own x (report #634).
 *  - quests/job_proto_door.js: "Build a New Floor", "Build a new floor in
 *    your home!", "Contribute Planks - 100 needed!", completion "You built a
 *    new floor in your home!".
 *  - locations/inc_homes.js homes_can_add_door (418-428): never in a Tower,
 *    only on the top floor, only while homes_can_add_floor (319-322: floors
 *    left under MAX_FLOORS, no unfinished job_proto_door,
 *    home_has_active_expansion). homes_add_floor_at (189-219): the new floor
 *    is as long as the others, the placed door becomes the way up and a
 *    'down' door is made at the same x on the new floor; every wall of the new
 *    floor takes the old top floor's first wall segment paper, and its floor
 *    and ceiling the old top floor's. homes_extend (133-150) adds a segment
 *    to every floor; homes_get_expand_costs (2511-2622) charges num_floors
 *    Wall Segments a segment (with Urth Blocks and Girders on two and three
 *    floors) and refunds num_floors times on un-expand; houses_extend refuses
 *    while a floor is being built (busy_adding_floor).
 *  - config_base.js home_limits MAX_FLOORS 3 ("R2: 2, R3: 3").
 *
 * Remake decisions:
 *  - Each floor is its own room, one at a time (as the Tower's floors are):
 *    the Door is the way between them. The source stacked the floors in one
 *    tall location. The house outside does not grow.
 *  - Words the source has none for (why a Door cannot go somewhere, why a
 *    wall cannot be added while building) are short and ours.
 *
 * R5, every floor of the house is the house (G1313, Austin 2026-11-25: "as
 * Glitch: key holders and let-in visitors go upstairs; upper floors shared
 * like the ground floor"). In the source the floors were one location and its
 * Doors had no verb that asked who you were (furniture_door.js), so whoever
 * pols_canEnter let into the house walked every floor, and whatever stood on
 * one was there for them as on the ground floor. Online each floor is a place
 * of its own, "house" (the ground floor, HOUSE_<id> on the realtime server)
 * and "house:1" / "house:2" (HOUSE_<id>_<floor>): housePlace names it,
 * isHousePlace says a place is one of them, and everything a visitor shares on
 * the ground floor (drops, machines, Icons, gnomes, the owner's locked
 * stacks) is shared on every floor through it.
 */

import { HOME_LIMITS } from './homes-catalog.js?v=0367f90f';
import { floorRestY, moveFurniture, normalizeHomeDecorState, quoteInteriorUnexpand, unexpandInterior, expandInterior, wallSlots } from './home-decor.js?v=69523fb6';

export const DOOR_CLASS = 'furniture_door';
export const DOOR_JOB = 'job_proto_door';
export const MAX_FLOORS = HOME_LIMITS.MAX_FLOORS;
/** onContainerChanged: job_class_ids { in_order: 1, delay_seconds: 60 }. */
export const DOOR_JOB_PHASES = Object.freeze([Object.freeze({ classTsid: DOOR_JOB, order: 1, delaySeconds: 60, label: 'Build a New Floor' })]);

export const DOOR_TEXT = Object.freeze({
  cantPickUp: "You can't pick up placed doors.",
  createLabel: 'Add a floor',
  createTooltip: 'Add a floor',
  built: 'You built a new floor in your home!',
  // Ours (the client's ghost simply would not drop there):
  tower: 'A Door adds a floor to your house, not to a Tower.',
  notTop: 'A Door can only go on the top floor of your house.',
  full: `Your house has all ${MAX_FLOORS} floors it can have.`,
  busy: 'You are already building a new floor.',
  // Ours (houses_extend busy_adding_floor):
  locked: 'Finish building your new floor first.',
});

const whole = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d);

/**
 * The floors above the ground floor and how they join.
 *   upper    decor states for floors 2 and 3 (the ground floor is the house's own decor)
 *   links    [{ floor, up, down, upX, downX }]: floor `floor`'s Door `up` (standing at upX) leads
 *            to floor+1's Door `down` (at downX); each Door keeps its own x (inc_homes.js 741-788)
 *   pending  { floor, id } | null: a Door set down to build the next floor
 *   at       the floor the player is on (0 is the ground floor)
 */
export function createFloorsState(seed = {}, ground = null) {
  const segments = ground?.wallSegments;
  const upper = (Array.isArray(seed?.upper) ? seed.upper : [])
    .slice(0, MAX_FLOORS - 1)
    .map((row) => normalizeHomeDecorState({ ...row, layout: 'house', starterKit: true, ...(segments ? { wallSegments: segments } : {}) }));
  const floors = 1 + upper.length;
  const links = [];
  for (const row of Array.isArray(seed?.links) ? seed.links : []) {
    const floor = whole(row?.floor, -1);
    if (floor < 0 || floor >= floors - 1 || links.some((l) => l.floor === floor)) continue;
    // Saves from before #634 held one x for both Doors: each end starts there, so nothing moves.
    const x = Math.round(Number(row.x) || 0);
    const upX = Number.isFinite(Number(row.upX)) ? Math.round(Number(row.upX)) : x;
    const downX = Number.isFinite(Number(row.downX)) ? Math.round(Number(row.downX)) : x;
    links.push({ floor, up: whole(row.up), down: whole(row.down), upX, downX });
  }
  let pending = null;
  if (seed?.pending && whole(seed.pending.floor, -1) === floors - 1 && floors < MAX_FLOORS) {
    pending = { floor: floors - 1, id: whole(seed.pending.id) };
  }
  const at = Math.max(0, Math.min(floors - 1, whole(seed?.at, 0)));
  return { upper, links, pending, at };
}

/** R5: a floor of the house as a place: "house" (0, the ground floor), "house:1", "house:2". */
export function housePlace(floor) {
  const f = Math.max(0, Math.min(MAX_FLOORS - 1, Math.floor(Number(floor) || 0)));
  return f ? `house:${f}` : 'house';
}

/** R5: any floor of the house. */
export const HOUSE_PLACE_RE = /^house(:[12])?$/;
export const isHousePlace = (place) => HOUSE_PLACE_RE.test(String(place || ''));

/** R5: the floor a house place names (0 the ground floor), or -1 for any other place. */
export function housePlaceFloor(place) {
  if (!isHousePlace(place)) return -1;
  return place === 'house' ? 0 : Number(String(place).slice(6));
}

export function floorCount(fs) {
  return 1 + (fs?.upper?.length || 0);
}

/** The decor state of floor `index` (0: the ground floor's `ground`). */
export function floorDecor(fs, ground, index) {
  if (!index) return ground;
  return fs.upper[index - 1] || null;
}

/** homes_can_add_floor: floors left and no floor already being built. */
export function canAddFloor(fs) {
  if (floorCount(fs) >= MAX_FLOORS) return { ok: false, reason: 'full', msg: DOOR_TEXT.full };
  if (fs.pending) return { ok: false, reason: 'busy', msg: DOOR_TEXT.busy };
  return { ok: true };
}

/** canDropAt -> homes_can_add_door(y): where a Door may be set down. */
export function doorPlaceCheck(fs, { floor = 0, tower = false } = {}) {
  if (tower) return { ok: false, reason: 'tower', msg: DOOR_TEXT.tower };
  const can = canAddFloor(fs);
  if (!can.ok) return can;
  if (floor !== floorCount(fs) - 1) return { ok: false, reason: 'not_top', msg: DOOR_TEXT.notTop };
  return { ok: true };
}

/** What a placed Door on `floor` is: 'pending' (building), 'up', 'down', or null (not one of ours). */
export function doorRole(fs, floor, id) {
  const n = whole(id);
  if (fs.pending && fs.pending.floor === floor && fs.pending.id === n) return 'pending';
  if (fs.links.some((l) => l.floor === floor && l.up === n)) return 'up';
  if (fs.links.some((l) => l.floor + 1 === floor && l.down === n)) return 'down';
  return null;
}

/** getDefaultUpgradeConfig: door_<direction>[_job]. */
export function doorArtKey(role) {
  if (role === 'down') return 'down';
  if (role === 'pending') return 'up_job';
  return 'up';
}

/** Where a Door leads: { floor, x } on the other floor, x the other Door's own (connect.x), or null. */
export function doorDestination(fs, floor, id) {
  const n = whole(id);
  const up = fs.links.find((l) => l.floor === floor && l.up === n);
  if (up) return { floor: floor + 1, x: up.downX, via: up.down, dir: 'up' };
  const down = fs.links.find((l) => l.floor + 1 === floor && l.down === n);
  if (down) return { floor: down.floor, x: down.upX, via: down.up, dir: 'down' };
  return null;
}

/**
 * doFurnitureMove for a Door (main.js 7058-7062): where a carried Door may go is `at`'s x on
 * the plat it stands on, at its own y ("Don't move doors from their y position").
 */
export function doorMoveAt(door, at = {}) {
  return { x: Number(at?.x), y: door.y, ...(door.plat ? { plat: door.plat } : {}) };
}

/**
 * doFurnitureMove (main.js 7051-7106): a placed Door on floor `floor` (decor `state`) slides to
 * `at`'s x along its own floor, inside the walls (the same clamp as any piece), its y kept; the
 * link end it is follows (door.x / target_door.connect.x), the other Door stays where it is.
 * Pick-up stays refused (doorLiftCheck). Returns { ok, item, link? } or { ok: false, msg }.
 */
export function slideDoor(fs, state, floor, id, at = {}) {
  const n = whole(id);
  const door = state?.placed?.find((row) => row.id === n);
  if (!door || door.classTsid !== DOOR_CLASS) return { ok: false, reason: 'missing' };
  const y = door.y;
  const plat = door.plat;
  const res = moveFurniture(state, n, doorMoveAt(door, at));
  if (!res.ok) return res;
  door.y = y;
  if (plat) door.plat = plat;
  door.on = null;
  const link = noteDoorMoved(fs, floor, n, door.x);
  return { ok: true, item: door, ...(link ? { link: { ...link } } : {}) };
}

/** A Door on `floor` now stands at x: its end of the link takes it. Returns the link, or null. */
export function noteDoorMoved(fs, floor, id, x) {
  const n = whole(id);
  const at = Math.round(Number(x) || 0);
  const up = fs.links.find((l) => l.floor === floor && l.up === n);
  if (up) {
    up.upX = at;
    return up;
  }
  const down = fs.links.find((l) => l.floor + 1 === floor && l.down === n);
  if (down) {
    down.downX = at;
    return down;
  }
  return null;
}

/** canPickup: only a Door whose project has not started (it goes back to storage, project and all). */
export function doorLiftCheck(fs, floor, id, { inProgress = false } = {}) {
  const role = doorRole(fs, floor, id);
  if (!role) return { ok: true, role: null };
  if (role === 'pending' && !inProgress) return { ok: true, role };
  return { ok: false, role, msg: DOOR_TEXT.cantPickUp };
}

/** onContainerChanged: the Door just set down on `floor` starts a floor project. */
export function noteDoorPlaced(fs, floor, id) {
  const check = doorPlaceCheck(fs, { floor });
  if (!check.ok) return check;
  fs.pending = { floor, id: whole(id) };
  return { ok: true, pending: { ...fs.pending } };
}

/** The pending Door left (picked up before its project started). */
export function clearPendingDoor(fs) {
  const was = fs.pending;
  fs.pending = null;
  return was;
}

/** One id per floor project, so a new Door is a new project. */
export function doorJobId(fs) {
  return fs.pending ? `home_floor_${fs.pending.floor + 1}_${fs.pending.id}` : null;
}

/**
 * onJobComplete -> homes_add_floor_at(x, door): the next floor, its 'down'
 * Door at the same x, and the link. `ground` is the ground floor's decor.
 */
export function addFloor(fs, ground) {
  if (!fs.pending) return { ok: false, reason: 'no_door' };
  const top = floorDecor(fs, ground, fs.pending.floor);
  const door = top?.placed.find((row) => row.id === fs.pending.id);
  if (!door || floorCount(fs) >= MAX_FLOORS) return { ok: false, reason: 'gone' };
  // wallpaper[floors-2][1]: the old top floor's first wall segment, on every wall.
  const paper = (Array.isArray(top.walls) && top.walls[1]) || top.wall;
  const next = normalizeHomeDecorState({
    layout: 'house',
    starterKit: true,
    wallSegments: ground.wallSegments,
    wall: paper,
    walls: Array(wallSlots(ground)).fill(paper),
    floor: top.floor,
    ceiling: top.ceiling,
  });
  const down = { id: next.nextId++, classTsid: DOOR_CLASS, slot: 'floor', x: door.x, y: floorRestY(DOOR_CLASS), facingRight: true, z: 1, on: null };
  next.placed.push(down);
  fs.upper.push(next);
  const link = { floor: fs.pending.floor, up: door.id, down: down.id, upX: door.x, downX: down.x };
  fs.links.push(link);
  fs.pending = null;
  return { ok: true, floor: link.floor + 1, link: { ...link }, decor: next };
}

/**
 * homes_get_expand_costs `wall`: num_floors Wall Segments for the next
 * segment; on two floors also an Urth Block and, every fourth wall, a
 * Girder; on three floors three Urth Blocks and two Girders every fourth
 * wall (three every eighth). `innerWalls` is cfg.floors[0].length (the
 * segments between the end caps).
 */
export function wallExpandItems(floors, innerWalls) {
  const items = { wall_segment: floors };
  const next = innerWalls + 1;
  if (floors === 2) {
    items.grade_aa_earth_block = 1;
    if (next % 4 === 0) items.girder = 1;
  }
  if (floors === 3) {
    items.grade_aa_earth_block = 3;
    if (next % 4 === 0) items.girder = 2;
    if (next % 8 === 0) items.girder = 3;
  }
  return items;
}

/** houses_extend on every floor: quote, then (ok) the items it takes. */
export function quoteHouseExpansion(fs, ground, inv = {}) {
  const floors = floorCount(fs);
  const items = wallExpandItems(floors, ground.wallSegments - 2);
  if (fs.pending) return { ok: false, reason: 'locked', items, msg: DOOR_TEXT.locked };
  if (HOME_LIMITS.MAX_WALL_SEGMENTS - ground.wallSegments <= 0) return { ok: false, reason: 'max', items, msg: 'Your house is as wide as a house can be.' };
  const short = Object.entries(items).find(([cls, n]) => (Number(inv?.[cls]) || 0) < n);
  if (short) return { ok: false, reason: 'need_items', items, msg: floors === 1 ? 'Expanding a wall takes one Wall Segment.' : `Expanding a wall here takes ${itemsText(items)}.` };
  return { ok: true, items, floors };
}

/**
 * #687 (Austin 2026-11-25 chose the original's dialog): Decoration Mode's Expand always opened
 * HouseExpandDialog (DecorateToolbarUI.as 319-320), whether or not the player could pay. Its words:
 * the title (HouseExpandDialog.as 248, the widest house's 400), the button (109, disabled with the
 * tips at 581 and 584), "Okay" once the house can grow no more (120), the count line under it
 * (446-452), and per item a row "Nx", its name and "Need N more" or "Got 'em" (HouseExpandReqUI.as
 * 86, 132, 135) counting what sits in bags (pc.hasHowManyItems, PC.as:332). `made` is the remake's
 * (report #182): the client linked each row to its item's info window, which named the recipe
 * (catalog_recipes.js 261).
 */
export const EXPAND_DIALOG = Object.freeze({
  title: 'The next expansion will cost:',
  max: 'Your house is already sooo wide!',
  button: 'Use these items to expand your house',
  okay: 'Okay',
  needTip: 'You need the materials first!',
  lockedTip: 'You need to finish up your floor project first!',
  got: 'Got \u2019em',
  unexpand: 'You can also un-expand your house.',
  made: 'A Wall Segment is made with a Construction Tool.',
});

/** HouseExpandDialog setCountText, TYPE_WALL: how many more times the house can grow. */
export function expandCountText(count) {
  return count > 0 ? `This building can be expanded ${count} more ${count === 1 ? 'time' : 'times'}.` : 'This building can\u2019t be expanded anymore.';
}

/**
 * What HouseExpandDialog shows for the house as it stands (every floor grows together):
 * { maxed, title, rows: [{ classTsid, label, count, have, need }], button: { label, disabled, tip },
 * count, unexpand, made, ok }. `inv` counts what the player holds, bags included.
 */
export function houseExpandView(fs, ground, inv = {}) {
  const quote = quoteHouseExpansion(fs, ground, inv);
  const left = Math.max(0, HOME_LIMITS.MAX_WALL_SEGMENTS - ground.wallSegments);
  const unexpand = quoteInteriorUnexpand(ground).ok === true;
  const count = expandCountText(left);
  if (quote.reason === 'max' || !left) {
    return { maxed: true, ok: false, title: EXPAND_DIALOG.max, rows: [], button: { label: EXPAND_DIALOG.okay, disabled: false, tip: '' }, count, unexpand, made: '' };
  }
  const rows = Object.entries(quote.items || {}).map(([cls, n]) => {
    const have = Math.max(0, Math.floor(Number(inv?.[cls]) || 0));
    return { classTsid: cls, label: (NAMES[cls] || [cls, cls])[0], count: n, have, need: Math.max(0, n - have) };
  });
  const short = rows.some((r) => r.need > 0);
  const locked = quote.reason === 'locked';
  const tip = short ? EXPAND_DIALOG.needTip : locked ? EXPAND_DIALOG.lockedTip : '';
  return {
    maxed: false,
    ok: quote.ok === true,
    title: EXPAND_DIALOG.title,
    rows,
    button: { label: EXPAND_DIALOG.button, disabled: !quote.ok, tip },
    count,
    unexpand,
    made: rows.some((r) => r.classTsid === 'wall_segment' && r.need > 0) ? EXPAND_DIALOG.made : '',
  };
}

/** A row's status line: "Need N more" while short, else "Got 'em" (HouseExpandReqUI.as 132, 135). */
export function expandRowStatus(row) {
  return row.need > 0 ? `Need ${row.need} more` : EXPAND_DIALOG.got;
}

/** homes_extend: one segment on every floor, the items taken once. */
export function expandHouseFloors(fs, ground, inv = {}) {
  const quote = quoteHouseExpansion(fs, ground, inv);
  if (!quote.ok) return quote;
  for (const [cls, n] of Object.entries(quote.items)) inv[cls] -= n;
  for (const state of [ground, ...fs.upper]) expandInterior(state, { wall_segment: 1 });
  return { ok: true, items: quote.items, wallSegments: ground.wallSegments };
}

/** homes_get_expand_costs `unexpand`: the one-floor refund, num_floors times. */
export function quoteHouseUnexpand(fs, ground) {
  if (fs.pending) return { ok: false, reason: 'locked', items: {}, msg: DOOR_TEXT.locked };
  const one = quoteInteriorUnexpand(ground);
  if (!one.ok) return one;
  const floors = floorCount(fs);
  const items = Object.fromEntries(Object.entries(one.items).map(([cls, n]) => [cls, n * floors]));
  return { ...one, items, floors };
}

/**
 * homes_unexpand on every floor: each loses its last segment (what stands in
 * its last 300 px moves 150 px left, Doors too; each end of a link follows its own Door).
 */
export function unexpandHouseFloors(fs, ground, inv = {}) {
  const quote = quoteHouseUnexpand(fs, ground);
  if (!quote.ok) return quote;
  let out = null;
  for (const state of [ground, ...fs.upper]) {
    const res = unexpandInterior(state, inv);
    if (state === ground) out = res;
  }
  // Each end of a link follows its own Door (#634: the two Doors may stand at different x).
  for (const link of fs.links) {
    const up = floorDecor(fs, ground, link.floor)?.placed.find((row) => row.id === link.up);
    if (up) link.upX = up.x;
    const down = floorDecor(fs, ground, link.floor + 1)?.placed.find((row) => row.id === link.down);
    if (down) link.downX = down.x;
  }
  return { ...out, items: quote.items };
}

const NAMES = Object.freeze({
  wall_segment: ['Wall Segment', 'Wall Segments'],
  grade_aa_earth_block: ['Urth Block', 'Urth Blocks'],
  girder: ['Girder', 'Girders'],
});

/** "2 Wall Segments, 1 Earth Block and 1 Girder". */
export function itemsText(items) {
  const parts = Object.entries(items).map(([cls, n]) => `${n} ${(NAMES[cls] || [cls, cls])[n === 1 ? 0 : 1]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join('');
}
