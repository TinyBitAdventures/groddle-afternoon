/**
 * Navigation objects the first street import dropped, read from Tiny Speck's
 * archived location XML (tinyspeck/glitch-locations, CC0):
 *
 * - middleground `doors`: deco (sprite_class, w/h), x/y bottom-centre (the
 *   client's DoorView / PhysicsQuadtree.insertDoor rect is x-w/2..x+w/2,
 *   y-h..y), key_id, requires_level, is_locked, house_number, for_sale,
 *   owner, plus `connect` (objref target, arrival x/y in the target street,
 *   hidden) or `destinations` (a random pick, inc main.js doStartDoorMove).
 * - middleground `ladders`: x centre, y bottom, h up (insertLadder), and the
 *   `tiling` of the 9 that have one (both caps, every center, the pattern;
 *   js/ladder-tiling.js draws it).
 * - middleground `walls`: vertical colliders, top y, h down, with pc_perm
 *   (Wall.as: null solid both ways, 0 open, 1 open from the left, -1 open
 *   from the right). Glitch walls are not climbable.
 * - middleground `boxes`: named collision hitboxes (geo_add_hitbox), same
 *   bottom-centre rect as doors.
 * - signpost connects' `hidden` flag and arrival x/y.
 *
 * Pure: XML text in, plain objects out (world coordinates). The build script
 * (build-street-navigation.mjs) converts doors and boxes to screen space.
 */

import { parseLocationXmlTree, findChild, childValue } from './location-xml.js';

const objects = (node) => (node?.children || []).filter((c) => c.tag === 'object');
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);

/** @param {object} connect XML `connect` object node */
function readConnect(connect) {
  if (!connect) return null;
  const target = findChild(connect, 'objref', 'target');
  const tsid = target?.attrs?.tsid || '';
  if (!tsid) return null;
  return {
    tsid,
    label: target.attrs.label || tsid,
    hub_id: String(childValue(connect, 'hub_id', '') || '') || undefined,
    x: num(childValue(connect, 'x', 0)),
    y: num(childValue(connect, 'y', 0)),
    hidden: childValue(connect, 'hidden', false) === true,
  };
}

function readDoor(node) {
  const deco = findChild(node, 'object', 'deco');
  const destinationsNode = findChild(node, 'object', 'destinations');
  const destinations = destinationsNode
    ? (destinationsNode.children || []).filter((c) => c.tag === 'str' && c.text).map((c) => c.text)
    : [];
  const ownerTsid = childValue(node, 'owner_tsid', null);
  return {
    id: node.id || '',
    x: num(childValue(node, 'x', 0)),
    y: num(childValue(node, 'y', 0)),
    w: num(childValue(node, 'w', 0)),
    h: num(childValue(node, 'h', 0)),
    r: num(childValue(node, 'r', 0)),
    h_flip: childValue(node, 'h_flip', false) === true,
    sprite: deco ? String(childValue(deco, 'sprite_class', '') || '') : '',
    key_id: num(childValue(node, 'key_id', 0)),
    requires_level: num(childValue(node, 'requires_level', 0)),
    is_locked: childValue(node, 'is_locked', false) === true,
    house_number: String(childValue(node, 'house_number', '') ?? '') || '',
    for_sale: childValue(node, 'for_sale', false) === true,
    owner_label: childValue(node, 'owner_label', null) || null,
    owned: Boolean(ownerTsid && (typeof ownerTsid === 'string' || ownerTsid.tsid)),
    itemstack: Boolean(childValue(node, 'itemstack_tsid', null)),
    instance_exit: childValue(node, 'instance_exit', false) === true,
    connect: readConnect(findChild(node, 'object', 'connect')),
    destinations,
  };
}

/** One tiling piece (Tiling.as cap_0 / cap_1 / centers[i]): sprite class and box. */
function readTilePiece(node) {
  if (!node) return null;
  const sprite = String(childValue(node, 'sprite_class', '') || '');
  if (!sprite) return null;
  return { sprite, w: num(childValue(node, 'w', 0)), h: num(childValue(node, 'h', 0)) };
}

/**
 * A ladder's `tiling` (Ladder.fromAnonymous → Tiling.fromAnonymous): both caps, every center
 * (in key order: center_pattern indexes them) and the pattern. LadderView/SurfaceView.tile()
 * draws it; null when there is none.
 */
function readTiling(node) {
  if (!node) return null;
  const centers = objects(findChild(node, 'object', 'centers'))
    .map((c) => ({ key: Number(c.id), piece: readTilePiece(c) }))
    .filter((c) => c.piece)
    .sort((a, b) => a.key - b.key)
    .map((c) => c.piece);
  const out = {};
  const cap0 = readTilePiece(findChild(node, 'object', 'cap_0'));
  const cap1 = readTilePiece(findChild(node, 'object', 'cap_1'));
  if (cap0) out.cap_0 = cap0;
  if (cap1) out.cap_1 = cap1;
  if (centers.length) out.centers = centers;
  const pattern = String(childValue(node, 'center_pattern', '') ?? '');
  if (pattern) out.pattern = pattern.split(',').map((v) => num(v.trim(), 0));
  return Object.keys(out).length ? out : null;
}

/**
 * Extract every navigation object from one location XML document.
 * @param {string} xmlText
 */
export function extractLocationNavigation(xmlText) {
  const tree = parseLocationXmlTree(xmlText);
  const gameObject = tree.children.find((c) => c.tag === 'game_object');
  if (!gameObject) throw new Error('game_object not found');
  const dynamic = findChild(gameObject, 'object', 'dynamic');
  const layers = findChild(dynamic, 'object', 'layers');
  const out = {
    tsid: gameObject.attrs.tsid || '',
    bounds: {
      l: num(childValue(dynamic, 'l', 0)),
      r: num(childValue(dynamic, 'r', 0)),
      t: num(childValue(dynamic, 't', 0)),
      b: num(childValue(dynamic, 'b', 0)),
    },
    doors: [],
    ladders: [],
    walls: [],
    boxes: [],
    signposts: [],
  };
  for (const layer of objects(layers)) {
    for (const door of objects(findChild(layer, 'object', 'doors'))) out.doors.push(readDoor(door));
    for (const ladder of objects(findChild(layer, 'object', 'ladders'))) {
      const row = {
        id: ladder.id || '',
        x: num(childValue(ladder, 'x', 0)),
        y: num(childValue(ladder, 'y', 0)),
        w: num(childValue(ladder, 'w', 0)),
        h: num(childValue(ladder, 'h', 0)),
      };
      const tiling = readTiling(findChild(ladder, 'object', 'tiling'));
      if (tiling) row.tiling = tiling;
      if (row.h > 0) out.ladders.push(row);
    }
    for (const wall of objects(findChild(layer, 'object', 'walls'))) {
      const pcPerm = childValue(wall, 'pc_perm', null);
      const row = {
        id: wall.id || '',
        x: num(childValue(wall, 'x', 0)),
        y: num(childValue(wall, 'y', 0)),
        h: num(childValue(wall, 'h', 0)),
        pc_perm: [-1, 0, 1].includes(pcPerm) ? pcPerm : null,
      };
      if (row.h !== 0) out.walls.push(row);
    }
    for (const box of objects(findChild(layer, 'object', 'boxes'))) {
      out.boxes.push({
        key: box.id || '',
        id: String(childValue(box, 'id', '') || ''),
        x: num(childValue(box, 'x', 0)),
        y: num(childValue(box, 'y', 0)),
        w: num(childValue(box, 'w', 0)),
        h: num(childValue(box, 'h', 0)),
      });
    }
    for (const sign of objects(findChild(layer, 'object', 'signposts'))) {
      out.signposts.push({
        id: sign.id || '',
        connects: objects(findChild(sign, 'object', 'connects')).map(readConnect).filter(Boolean),
      });
    }
  }
  return out;
}

/** L/G (and LLI/GLI, LIF/GIF) aliases of a street tsid, as the importer wrote them. */
export function streetAliases(tsid) {
  if (!tsid) return [];
  const out = new Set([tsid]);
  if (tsid.startsWith('L')) out.add(`G${tsid.slice(1)}`);
  if (tsid.startsWith('G')) out.add(`L${tsid.slice(1)}`);
  return [...out];
}

/**
 * Platform y (world) under x nearest to y within `reach`, or null.
 * @param {{ x1:number, y1:number, x2:number, y2:number }[]} platforms world space
 */
export function platformYNear(platforms, x, y, reach = 80) {
  let best = null;
  for (const p of platforms || []) {
    const minX = Math.min(p.x1, p.x2);
    const maxX = Math.max(p.x1, p.x2);
    if (x < minX - 2 || x > maxX + 2) continue;
    const py = maxX === minX ? (p.y1 + p.y2) / 2 : p.y1 + ((x - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1);
    const d = Math.abs(py - y);
    if (d <= reach && (!best || d < best.d)) best = { y: py, d };
  }
  return best ? best.y : null;
}

/**
 * Arrival point in the target street's screen space, set on its nearest
 * platform when one is within reach (the source x/y is a feet position).
 * @param {{ bounds: object, platforms?: object[] }} target loaded target street JSON
 * @param {number} wx
 * @param {number} wy
 */
export function arrivalInTarget(target, wx, wy) {
  if (!target?.bounds) return null;
  const { l, r, t, b } = target.bounds;
  if (wx < l || wx > r || wy < t - 40 || wy > b + 200) return null;
  const ground = platformYNear(target.platforms, wx, wy);
  return {
    x: Math.round(wx - l),
    y: Math.round((ground ?? wy) - t),
    snapped: ground != null,
  };
}

/**
 * Street JSON navigation fields from extracted XML.
 * `resolve(tsid)` returns `{ key, street }` for an imported street (alias aware)
 * or null; `street` may be null when only the key is known.
 * @param {object} street street JSON (bounds)
 * @param {ReturnType<typeof extractLocationNavigation>} nav
 * @param {(tsid: string) => ({ key: string, street: object|null }|null)} resolve
 */
export function buildStreetNavigation(street, nav, resolve) {
  const { l, t } = street.bounds;
  const toScreen = (x, y) => ({ x: x - l, y: y - t });
  const target = (connect) => {
    if (!connect) return null;
    const found = resolve(connect.tsid);
    const row = {
      tsid: connect.tsid,
      label: connect.label,
      street: found?.key || null,
      x: connect.x,
      y: connect.y,
    };
    if (connect.hub_id) row.hub_id = connect.hub_id;
    const arrive = found?.street ? arrivalInTarget(found.street, connect.x, connect.y) : null;
    if (arrive) row.arrive = { x: arrive.x, y: arrive.y };
    return row;
  };
  const doors = nav.doors.map((door) => {
    const pos = toScreen(door.x, door.y);
    const row = {
      id: door.id,
      x: pos.x,
      y: pos.y,
      w: door.w,
      h: door.h,
      sprite: door.sprite,
      key_id: door.key_id,
      requires_level: door.requires_level,
      is_locked: Boolean(door.key_id || door.requires_level),
      hidden: Boolean(door.connect?.hidden),
    };
    if (door.r) row.r = door.r;
    if (door.h_flip) row.flip = true;
    if (door.house_number && door.house_number !== '0') row.house_number = door.house_number;
    if (door.for_sale) row.for_sale = true;
    if (door.owner_label) row.owner_label = door.owner_label;
    if (door.owned) row.owned = true;
    if (door.itemstack) row.itemstack = true;
    if (door.instance_exit) row.instance_exit = true;
    const connect = target(door.connect);
    if (connect) row.connect = connect;
    if (door.destinations.length) {
      row.destinations = door.destinations.map((tsid) => ({ tsid, street: resolve(tsid)?.key || null }));
    }
    return row;
  });
  const boxes = nav.boxes.map((box) => {
    const pos = toScreen(box.x, box.y);
    return { key: box.key, id: box.id, x: pos.x, y: pos.y, w: box.w, h: box.h };
  });
  // Signpost connects, matched by signpost id then connect order (the
  // importer kept only connects with a target tsid, in document order).
  const signById = new Map(nav.signposts.map((s) => [s.id, s.connects]));
  const signposts = (street.signposts || []).map((sign) => {
    const source = [...(signById.get(sign.id) || [])];
    return {
      ...sign,
      connects: (sign.connects || []).map((c) => {
        const at = source.findIndex((s) => s.tsid === c.tsid);
        const src = at >= 0 ? source.splice(at, 1)[0] : null;
        const out = { tsid: c.tsid, label: c.label };
        if (c.hub_id) out.hub_id = c.hub_id;
        if (!src) return out;
        if (src.hidden) out.hidden = true;
        const found = resolve(c.tsid);
        const arrive = found?.street ? arrivalInTarget(found.street, src.x, src.y) : null;
        if (arrive) out.arrive = { x: arrive.x, y: arrive.y };
        return out;
      }),
    };
  });
  return {
    doors,
    ladders: nav.ladders.map((row) => ({ ...row })),
    barriers: nav.walls.map((row) => ({ ...row })),
    boxes,
    signposts,
  };
}
