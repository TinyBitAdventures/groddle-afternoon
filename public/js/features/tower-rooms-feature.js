/**
 * The rebuilt Jethimadh Tower Base rooms as a feature module (see
 * js/feature-host.js): Room 15 and the Ventilation Room (js/tower-rooms.js),
 * Rooms 4, 8 and 16 (js/tower-challenge-rooms.js), and the Mid tower's Stairs
 * and Mezzanine (js/tower-mid-rooms.js; their Greeterbot and teleporters are
 * features/mid-tower-feature.js). The rooms themselves are
 * ordinary street JSON written by tools/build-tower-rooms.mjs, so doors,
 * platforms, walls, ladders and the TowerSpot boxes
 * (features/home-tower-feature.js) need nothing here. This file adds what a
 * street JSON cannot carry:
 * - an interior ecology (nothing archived: no animals, fruit, Musicblocks or quoins);
 * - the door plaques' painted text ("Way Out", "Tower St South"), drawn from
 *   the decos' signText the way the source's firebog_sign_blank sign_txt was;
 * - each room's key (Room 15 Purple-Orange Circle, Room 8 Teal-Red Hexagon,
 *   Room 16 Red-Green Triangle): one per game day when none is in the pack,
 *   by walking onto it (the rule of Corridor One's key_drop box, location.js);
 * - Room 4's garden (4 spinach plots, empty ones replanted once a game day)
 *   and its six drinks, and Room 16's Spinach: floor items you pick up, each
 *   back once a game day;
 * - a room's `art` rows (Room 4's wardrobia felt meadow, G72: its art lives
 *   in assets/sprites/tower-rooms/, outside the street deco set), drawn
 *   behind the avatar in row order, with any painted signText.
 *
 * QA (rooms are reached through their real corridor doors, see doors-feature):
 *   ?autostart=1&questoffer=off&doordemo=GTJ10K7P3812R8F&doorindex=0&doorkey=4&doorautoplay=1
 *       C4E's locked door into Room 15
 *   ?autostart=1&questoffer=off&doordemo=GTJ110817812KO4&doorindex=2&doorautoplay=1
 *       C6W's door into the top of the Ventilation Room
 *   ?autostart=1&questoffer=off&doordemo=GIF1Q3IQM7122SP&doorindex=0&doorkey=1&doorautoplay=1
 *       C2's locked door into Room 4
 *   ?autostart=1&questoffer=off&doordemo=GTJ10K7P3812R8F&doorindex=2&doorkey=3&doorautoplay=1
 *       C4W's locked door into Room 8 (its way out leads on to C4E)
 *   ?autostart=1&questoffer=off&doordemo=GTJ110817812KO4&doorindex=3&doorkey=6&doorautoplay=1
 *       C6W's locked door into Room 16
 *   &towerroomspinach=1  eat a Spinach (High Jumper, 7 s) on arrival in a rebuilt room;
 *                        =hold keeps it up while you are in one
 * Canvas data: towerRoom, towerRoomArt, towerRoomSigns, towerRoomKey, towerRoomKeyDay,
 * towerRoomItems, towerRoomGarden, towerRoomLast.
 */

import { addItem, countItem } from '../inventory.js?v=catalog-unified-3';
import { getGameDayKey } from '../game-day.js?v=dametime-1';
import { DOOR_TEXT, doorKeyClass, insideBottomRect } from '../doors.js';
import { textureFromUrl } from '../textures.js';
import { ROOM_15_TSID } from '../tower-rooms.js?v=tower-rooms-1';
import { anyTowerRoomByTsid as baseRoomByTsid } from '../tower-challenge-rooms.js?v=challenge-rooms-3';
import { midTowerRoomByTsid } from '../tower-mid-rooms.js?v=mid-tower-3';

const anyTowerRoomByTsid = (tsid) => baseRoomByTsid(tsid) || midTowerRoomByTsid(tsid);

export const TOWER_ROOMS_FEATURE_ID = 'tower-rooms';
const KEY_CHECK_MS = 250;
const ITEM_CLASS = 'tower_room_item';

const fresh = () => ({ v: 2, keyDays: {}, taken: {}, gardenDays: {} });
let state = fresh();
let views = [];
let keyView = null;
let itemRows = [];
let lastKeyCheck = 0;

const today = () => getGameDayKey(Date.now());
const strMap = (m) => Object.fromEntries(Object.entries(m && typeof m === 'object' ? m : {}).filter(([, v]) => typeof v === 'string'));

function clear() {
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy();
  }
  views = [];
  keyView = null;
  itemRows = [];
}

function keyBox(street) {
  return (street?.boxes || []).find((b) => Number(b.key) > 0) || null;
}

function keyDue(engine, tsid, box) {
  return Boolean(box) && state.keyDays[tsid] !== today() && countItem(engine.inv, doorKeyClass(box.key)) < 1;
}

/** Plaque text, centred on its sign (decos are bottom-centre, world space). */
function drawSigns(engine, street) {
  const { PIXI } = engine;
  const mg = (street.layers || []).find((l) => l.id === 'middleground');
  let n = 0;
  for (const d of mg?.decos || []) {
    if (!d.signText) continue;
    const t = new PIXI.Text({ text: d.signText, style: {
      fontFamily: '"Trebuchet MS", sans-serif',
      fontSize: d.signText.length > 10 ? 15 : 19,
      fontWeight: '700',
      fill: 0xf3e2b8,
      stroke: { color: 0x2b1a0e, width: 3 },
      align: 'center',
    } });
    t.resolution = 3;
    t.anchor.set(0.5, 0.5);
    t.x = d.x - street.bounds.l;
    t.y = d.y - street.bounds.t - d.h / 2 + 4;
    t.zIndex = 1;
    t.eventMode = 'none';
    engine.entityLayer.addChild(t);
    views.push(t);
    n += 1;
  }
  return n;
}

/** Sign text in the plaques' style, centred at (x, y) in street-screen space. */
function signLabel(engine, text, x, y, z, fill = 0xf3e2b8, stroke = 0x2b1a0e) {
  const t = new engine.PIXI.Text({ text, style: {
    fontFamily: '"Trebuchet MS", sans-serif',
    fontSize: text.length > 10 ? 15 : 19,
    fontWeight: '700',
    fill,
    stroke: { color: stroke, width: 3 },
    align: 'center',
  } });
  t.resolution = 3;
  t.anchor.set(0.5, 0.5);
  t.x = x;
  t.y = y;
  t.zIndex = z;
  t.eventMode = 'none';
  engine.entityLayer.addChild(t);
  views.push(t);
  return t;
}

/**
 * A room's `art` rows (world space, bottom-centre anchors, negative z so they
 * stay behind doors, items and the avatar): a sprite from `src`, or a `fill`
 * rectangle. Returns the number drawn.
 */
function drawArt(engine, room, street) {
  const { PIXI } = engine;
  const { l, t } = street.bounds;
  let n = 0;
  for (const a of room.art || []) {
    if (a.fill != null) {
      const g = new PIXI.Graphics();
      g.rect(a.x1 - l, a.y1 - t, a.x2 - a.x1, a.y2 - a.y1).fill(a.fill);
      g.zIndex = a.z;
      g.eventMode = 'none';
      engine.entityLayer.addChild(g);
      views.push(g);
      n += 1;
      continue;
    }
    const s = new PIXI.Sprite(textureFromUrl(a.src));
    s.anchor.set(0.5, 1);
    s.x = a.x - l;
    s.y = a.y - t;
    s.width = a.w;
    s.height = a.h;
    if (a.flip) s.scale.x = -Math.abs(s.scale.x);
    if (a.r) s.angle = a.r;
    s.zIndex = a.z;
    s.eventMode = 'none';
    engine.entityLayer.addChild(s);
    views.push(s);
    n += 1;
    if (a.signText) signLabel(engine, a.signText, s.x - (a.flip ? -1 : 1) * a.w * 0.08, s.y - a.h / 2, a.z + 0.5, 0xffffff, 0x3b5fa8);
  }
  return n;
}

function drawKey(engine, box) {
  const { PIXI } = engine;
  const s = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${doorKeyClass(box.key)}.png`));
  s.anchor.set(0.5, 1);
  s.x = box.x;
  s.y = box.y - 32; // the box bottom sits 30 px under the shelf top
  s.zIndex = 4;
  s.eventMode = 'none';
  engine.entityLayer.addChild(s);
  views.push(s);
  return s;
}

function checkKey(engine, now) {
  if (!keyView || now - lastKeyCheck < KEY_CHECK_MS || !engine.player) return;
  lastKeyCheck = now;
  const box = keyBox(engine.street);
  if (!box) return;
  keyView.y = box.y - 32 - Math.abs(Math.sin(now / 420)) * 6;
  if (!insideBottomRect(box, engine.player.x, engine.player.y)) return;
  const tsid = engine.streetTsid;
  if (!keyDue(engine, tsid, box)) return;
  state.keyDays[tsid] = today();
  addItem(engine.inv, doorKeyClass(box.key), 1);
  engine.pushActivity(DOOR_TEXT.foundKey);
  engine.floatText(engine.player.x, engine.player.y - 90, DOOR_TEXT.foundKey, 0xffe08a);
  engine.playSound?.('ITEM_PICKUP', { volume: 0.5 });
  engine.refreshPack();
  engine.save();
  engine.setData('towerRoomKey', 'taken');
  engine.setData('towerRoomKeyDay', state.keyDays[tsid]);
  engine.setData('towerRoomLast', `key:${doorKeyClass(box.key)}`);
  keyView.visible = false;
}

/* ------------------------------------------------------------------ */
/* Floor items (Room 4's drinks, Room 16's Spinach)                     */
/* ------------------------------------------------------------------ */

const takenKey = (tsid, item) => `${tsid}:${item.id}`;
const itemsWaiting = () => itemRows.filter((r) => !r.picked).length;

function drawItem(engine, street, item) {
  const { PIXI } = engine;
  const box = new PIXI.Container();
  const spr = new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${item.cls}.png`));
  spr.anchor.set(0.5, 1);
  spr.scale.set(0.8);
  box.addChild(spr);
  box.x = item.x - street.bounds.l;
  box.y = item.y - street.bounds.t;
  box.zIndex = 28;
  engine.entityLayer.addChild(box);
  views.push(box);
  const target = engine.register({
    classId: ITEM_CLASS,
    featureId: TOWER_ROOMS_FEATURE_ID,
    label: item.count > 1 ? `${item.label} ×${item.count}` : item.label,
    sprite: box,
    towerItem: item.id,
  });
  const row = { item, target, sprite: box, picked: false };
  itemRows.push(row);
  return row;
}

function pickUp(engine, row) {
  if (!row || row.picked) return false;
  row.picked = true;
  const { item } = row;
  state.taken[takenKey(engine.streetTsid, item)] = today();
  addItem(engine.inv, item.cls, item.count);
  engine.unregister(row.target);
  row.sprite.visible = false;
  engine.refreshPack();
  engine.playSound?.('ITEM_PICKUP', { volume: 0.5 });
  engine.pushActivity(`You picked up ${item.count > 1 ? `${item.count} ` : ''}${item.label}.`);
  engine.setData('towerRoomItems', itemsWaiting());
  engine.setData('towerRoomLast', `item:${item.cls}`);
  engine.save();
  return true;
}

/* ------------------------------------------------------------------ */
/* Room 4's garden                                                      */
/* ------------------------------------------------------------------ */

/** Replant every empty plot (clean or dirty, no seed) with the room's crop, ready to harvest. */
export function restockGarden(garden, seed, now = Date.now()) {
  let n = 0;
  for (const plot of Object.values(garden?.plots || {})) {
    if (plot.seed || !['clean', 'dirty'].includes(plot.state)) continue;
    plot.state = 'crop';
    plot.seed = seed;
    plot.wet = false;
    plot.wetAt = null;
    plot.stageStartedAt = now;
    plot.growthMs = 0;
    n += 1;
  }
  return n;
}

function spawnGarden(engine, room, street) {
  const g = room.garden;
  if (!g || typeof engine.spawnGarden !== 'function') return null;
  const entity = engine.spawnGarden({ x: g.x - street.bounds.l, y: g.y - street.bounds.t + 2, cols: g.cols, rows: g.rows, label: 'Spinach' });
  const garden = entity?.state?.garden;
  if (!garden) return null;
  if (state.gardenDays[room.tsid] !== today()) {
    state.gardenDays[room.tsid] = today();
    if (restockGarden(garden, g.seed)) engine.refreshGarden?.(entity);
    engine.save();
  }
  const crops = Object.values(garden.plots || {}).filter((p) => p.state === 'crop').length;
  engine.setData('towerRoomGarden', `${crops}/${Object.keys(garden.plots || {}).length}`);
  return entity;
}

export const towerRoomsFeature = {
  id: TOWER_ROOMS_FEATURE_ID,

  save() {
    return { v: 2, keyDays: { ...state.keyDays }, taken: { ...state.taken }, gardenDays: { ...state.gardenDays } };
  },

  restore(slice) {
    state = fresh();
    if (!slice || typeof slice !== 'object') return;
    state.keyDays = strMap(slice.keyDays);
    state.taken = strMap(slice.taken);
    state.gardenDays = strMap(slice.gardenDays);
    // v1 saves held Room 15's key day only.
    if (typeof slice.keyDay === 'string' && slice.keyDay && !state.keyDays[ROOM_15_TSID]) state.keyDays[ROOM_15_TSID] = slice.keyDay;
  },

  /**
   * The rooms are indoors like the corridors (street-ecology.js INTERIOR_HUBS,
   * hub 77): nothing archived, so no animals, apples, Musicblocks, quoins or
   * seasonal street decor; their keys, spinach and drinks come from here.
   */
  ecologyOverride(street) {
    const room = anyTowerRoomByTsid(street?.tsid);
    if (!room) return null;
    return { label: room.label, sourceTsid: room.sourceTsid, counts: {}, interior: true, quoins: 0 };
  },

  onStreetEnter(street, engine) {
    clear();
    const room = anyTowerRoomByTsid(street?.tsid);
    engine.setData('towerRoom', room ? room.tsid : '');
    if (!room) return;
    engine.setData('towerRoomArt', drawArt(engine, room, street));
    engine.setData('towerRoomSigns', drawSigns(engine, street));
    const box = keyBox(street);
    if (box) {
      const due = keyDue(engine, room.tsid, box);
      if (due) keyView = drawKey(engine, box);
      engine.setData('towerRoomKey', due ? 'waiting' : 'taken');
    } else {
      engine.setData('towerRoomKey', '');
    }
    const day = today();
    for (const item of room.items || []) {
      if (state.taken[takenKey(room.tsid, item)] === day) continue;
      drawItem(engine, street, item);
    }
    engine.setData('towerRoomItems', itemsWaiting());
    if (!room.garden) engine.setData('towerRoomGarden', '');
    spawnGarden(engine, room, street);
    if (['1', 'hold'].includes(engine.param('towerroomspinach'))) engine.applyBuff('high_jumper');
  },

  onStreetClear() {
    clear();
  },

  verbsFor(target) {
    if (target?.classId !== ITEM_CLASS) return null;
    return [{ id: 'pickup', label: 'Pick up', sort: 55, tooltip: 'Put it in your pack', enabled: true, reason: '', durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== ITEM_CLASS) return false;
    if (verbId === 'pickup') pickUp(engine, itemRows.find((r) => r.target === target));
    return true;
  },

  onTick(_dtMs, now, engine) {
    if (keyView) checkKey(engine, now);
    if (engine.param('towerroomspinach') === 'hold' && anyTowerRoomByTsid(engine.streetTsid) && !engine.hasBuff('high_jumper')) engine.applyBuff('high_jumper');
  },

  /** QA / tests. */
  _state() {
    return { state, items: itemRows.map((r) => ({ id: r.item.id, picked: r.picked })) };
  },
};
