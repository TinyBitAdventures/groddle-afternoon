/**
 * Street doors: pure rules (no DOM/Pixi). Data comes from
 * build-street-navigation.mjs (`street.doors`, screen space, bottom-centre).
 *
 * Sources (glitch-GameServerJS, CC0):
 * - main.js doStartDoorMove: no connect -> "This door is not working!";
 *   `destinations` doors pick a random street; arrival is the door's own
 *   connect x/y (not the matching return door).
 * - locations/inc_locked_doors.js: a door is locked when requires_level or
 *   key_id is set; level first, then the key; entering consumes one key
 *   (apiConsume(1)) every time, and the door stays locked.
 * - players/inc_items.js has_key: key_id N opens door_key_N.
 * - items/door_key_1..12.js labels; keys 1-6 drop from Dust Traps
 *   (catalog_drop_tables.js), key 1 also from Corridor One's key_drop box
 *   once per game day (locations/location.js); keys 7-12 had no source.
 * - client DoorView / LocationRenderer: hidden connects are not drawn; the
 *   hover tip is the destination label plus "Owned by <owner_label>".
 */

export const DOOR_TEXT = Object.freeze({
  broken: 'This door is not working!',
  needKey: 'You need the correct key to unlock this door.',
  needLevel: (level) => `You must be level ${level} or higher to pass through this door.`,
  foundKey: 'You found a door key!',
});

/** items/door_key_N.js name_single and description. */
export const DOOR_KEYS = Object.freeze({
  1: { label: 'Yellow-Purple Triangle Key', desc: "As purple as it is yellow, this tri-pointed key has never met a door it didn't like." },
  2: { label: 'Green-White Circle Key', desc: 'Green and white and shaped like your melon, this little key will take you to the other side. Well, the other side of a door, anyway.' },
  3: { label: 'Orange-Blue Square Key', desc: "Does this orange and blue square key smell funny to you? This probably won't affect its door-opening abilities. Though you might want to wash your hands later." },
  4: { label: 'Teal-Red Hexagon Key', desc: 'Hexagonally shaped keys have more fun. Especially the teal and red ones, which seem to glide into keyholes with more eagerness than one would expect from an average key.' },
  5: { label: 'Red-Green Triangle Key', desc: "There's nothing a red-green triangle key loves more than a good door-opening. Nothing." },
  6: { label: 'Purple-Orange Circle Key', desc: 'Purple, orange and circular, this key has everything you could want in a key. Especially since it actually opens doors.' },
  7: { label: 'Yellow-Teal Square Key', desc: 'Yellow, teal and square are good qualities in a key with door-opening aspirations.' },
  8: { label: 'Blue-White Hexagon Key', desc: "It's been said that hexagonal keys have more fun. Usually this is the case, except when said key is blue and white. These are serious keys for serious door openings." },
  9: { label: 'Teal-White Triangle Key', desc: "Some say teal and white keys are nothing but trouble. They've never tried one of the triangular variety." },
  10: { label: 'Blue-Yellow Circle Key', desc: "POW! Right in the keyhole! That's what this blue and yellow circular key would say if it could speak. Which it can't." },
  11: { label: 'Purple-Red Square Key', desc: "Purple, red and square, this key is a door's best friend. A friend with benefits. Door-opening benefits." },
  12: { label: 'Green-Orange Hexagon Key', desc: "This key's greenness and orangeosity is matched only by its hexagonaliciousness." },
});
export const DOOR_KEY_BASE_COST = 50;
export const DOOR_KEY_STACK = 10;

/** Corridor One (hub 77) and its key_drop box: one Yellow-Purple key a day. */
export const KEY_DROP = Object.freeze({ street: 'GIF1QBNPP7123J0', box: 'key_drop', key: 1 });

export function doorKeyClass(keyId) {
  return `door_key_${Number(keyId)}`;
}

/** Doors the client draws: hidden connects are invisible and inert. */
export function visibleDoors(street) {
  return (street?.doors || []).filter((door) => door && !door.hidden);
}

/**
 * Where a door leads, among imported streets.
 * @param {object} door
 * @param {{ current?: string, rng?: () => number }} [opts]
 * @returns {{ street: string, label: string, arrive: {x:number,y:number}|null, random?: boolean }|null}
 */
export function doorDestination(door, { current = '', rng = Math.random } = {}) {
  if (door?.connect?.street) {
    return { street: door.connect.street, label: door.connect.label || door.connect.street, arrive: door.connect.arrive || null };
  }
  const options = (door?.destinations || []).filter((d) => d.street && d.street !== current);
  if (options.length) {
    const pick = options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
    // geo_get_teleport_point used the target's Teleport Marker, which is lost.
    return { street: pick.street, label: '', arrive: null, random: true };
  }
  return null;
}

/** Hover / verb tooltip: the destination label, plus the owner like the client tip. */
export function doorTooltip(door) {
  const label = door?.connect?.label || (door?.destinations?.length ? 'Somewhere else' : 'A door');
  const owner = door?.owner_label;
  return owner && !label.includes(owner) ? `${label} · Owned by ${owner}` : label;
}

/** A short status line for the verb menu subtitle. */
export function doorSubtitle(door, { hasKey = () => false } = {}) {
  const bits = [];
  if (door?.house_number) bits.push(`No. ${door.house_number}`);
  if (door?.requires_level) bits.push(`Level ${door.requires_level}+`);
  if (door?.key_id) {
    const key = DOOR_KEYS[door.key_id];
    bits.push(`${hasKey(doorKeyClass(door.key_id)) ? 'Unlock with' : 'Locked: needs'} a ${key?.label || 'door key'}`);
  }
  return bits.join(' · ');
}

/**
 * The source door-move checks, in order: a destination, the level gate,
 * then the key.
 * @param {object} door
 * @param {{ level?: number, hasKey?: (classTsid: string) => boolean, destination?: object|null }} ctx
 * @returns {{ ok: true, consumeKey: string|null } | { ok: false, code: string, msg: string }}
 */
export function checkDoorEntry(door, { level = 1, hasKey = () => false, destination = null } = {}) {
  if (!door || door.hidden || !destination) return { ok: false, code: 'not_working', msg: DOOR_TEXT.broken };
  if (door.requires_level && door.requires_level > level) {
    return { ok: false, code: 'level', msg: DOOR_TEXT.needLevel(door.requires_level) };
  }
  if (door.key_id) {
    const keyClass = doorKeyClass(door.key_id);
    if (!hasKey(keyClass)) return { ok: false, code: 'key', msg: DOOR_TEXT.needKey };
    return { ok: true, consumeKey: keyClass };
  }
  return { ok: true, consumeKey: null };
}

/** Whether feet (x, y) are inside a bottom-centre rect { x, y, w, h } with slack. */
export function insideBottomRect(rect, x, y, pad = 0) {
  if (!rect) return false;
  const half = Math.max(1, Number(rect.w) || 50) / 2 + pad;
  return x >= rect.x - half && x <= rect.x + half && y >= rect.y - (Number(rect.h) || 0) - pad && y <= rect.y + pad;
}

/** The visible door the avatar stands in front of, nearest centre first. */
export function doorAt(doors, x, y, pad = 24) {
  let best = null;
  for (const door of doors || []) {
    if (door.hidden || !insideBottomRect(door, x, y, pad)) continue;
    const d = Math.abs(door.x - x);
    if (!best || d < best.d) best = { door, d };
  }
  return best?.door || null;
}

/**
 * Corridor One's key_drop collision (location.js): one door_key_1 per game
 * day, only when none is in the pack.
 * @param {{ keyDropDay?: string }} state
 * @param {{ street: string, boxes?: object[], x: number, y: number, day: string, hasKey: boolean }} ctx
 */
export function keyDropDue(state, { street, boxes = [], x, y, day, hasKey }) {
  if (street !== KEY_DROP.street || hasKey || state?.keyDropDay === day) return false;
  const box = boxes.find((b) => b.id === KEY_DROP.box);
  return Boolean(box && insideBottomRect(box, x, y));
}

export function normalizeDoorState(raw = {}) {
  return {
    keyDropDay: typeof raw?.keyDropDay === 'string' ? raw.keyDropDay : '',
    entered: Number.isFinite(raw?.entered) ? Math.max(0, Math.floor(raw.entered)) : 0,
    keysUsed: Number.isFinite(raw?.keysUsed) ? Math.max(0, Math.floor(raw.keysUsed)) : 0,
  };
}

/** A plain drawn stand-in for a door deco with no recovered art: tone from the name. */
export function drawnDoorStyle(sprite = '') {
  const name = String(sprite).toLowerCase();
  if (name.includes('cave') || name.includes('hole')) return { kind: 'arch', fill: 0x2a2018, frame: 0x5b4a38 };
  const tones = [
    ['yellow', 0xd9b440], ['green', 0x6f9a52], ['maroon', 0x7a2f34], ['tan', 0xc2a06e],
    ['gray', 0x8a8d90], ['red', 0xa8483c], ['blue', 0x4f74a0],
  ];
  const tone = tones.find(([k]) => name.includes(k));
  return { kind: 'door', fill: tone ? tone[1] : 0x8a5a32, frame: 0x4a3220 };
}
