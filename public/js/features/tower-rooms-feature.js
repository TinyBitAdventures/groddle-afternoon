/**
 * Room 15 and the Ventilation Room of the Jethimadh Tower Base as a feature
 * module (see js/feature-host.js). The rooms themselves are ordinary street
 * JSON written by tools/build-tower-rooms.mjs from js/tower-rooms.js, so
 * doors, platforms, walls and the TowerSpot boxes (features/home-tower-feature.js)
 * need nothing here. This file adds what a street JSON cannot carry:
 * - an empty ecology (the tower is all corridor: counts {} like C1-C6);
 * - the door plaques' painted text ("Way Out", "Tower St South"), drawn from
 *   the decos' signText the way the source's firebog_sign_blank sign_txt was;
 * - Room 15's Purple-Orange Circle Key (door_key_6, Room 16's key): one per
 *   game day when none is in the pack, by walking onto it (the rule of
 *   Corridor One's key_drop box, location.js).
 *
 * QA (rooms are reached through their real corridor doors, see doors-feature):
 *   ?autostart=1&questoffer=off&doordemo=GTJ10K7P3812R8F&doorindex=0&doorkey=4&doorautoplay=1
 *       C4E's locked door into Room 15
 *   ?autostart=1&questoffer=off&doordemo=GTJ110817812KO4&doorindex=2&doorautoplay=1
 *       C6W's door into the top of the Ventilation Room
 *   &towerroomspinach=1  eat a Spinach (High Jumper, 7 s) on arrival in a rebuilt room;
 *                        =hold keeps it up while you are in one
 * Canvas data: towerRoom, towerRoomSigns, towerRoomKey, towerRoomKeyDay.
 */

import { addItem, countItem } from '../inventory.js?v=catalog-unified-3';
import { getGameDayKey } from '../game-day.js?v=dametime-1';
import { DOOR_TEXT, doorKeyClass, insideBottomRect } from '../doors.js';
import { textureFromUrl } from '../textures.js';
import { towerRoomByTsid } from '../tower-rooms.js?v=tower-rooms-1';

export const TOWER_ROOMS_FEATURE_ID = 'tower-rooms';
const KEY_CHECK_MS = 250;

let state = { v: 1, keyDay: '' };
let views = [];
let keyView = null;
let lastKeyCheck = 0;

function clear() {
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy();
  }
  views = [];
  keyView = null;
}

function keyBox(street) {
  return (street?.boxes || []).find((b) => Number(b.key) > 0) || null;
}

function keyDue(engine, box) {
  return Boolean(box) && state.keyDay !== getGameDayKey(Date.now()) && countItem(engine.inv, doorKeyClass(box.key)) < 1;
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
  if (!keyDue(engine, box)) return;
  state.keyDay = getGameDayKey(Date.now());
  addItem(engine.inv, doorKeyClass(box.key), 1);
  engine.pushActivity(DOOR_TEXT.foundKey);
  engine.floatText(engine.player.x, engine.player.y - 90, DOOR_TEXT.foundKey, 0xffe08a);
  engine.playSound?.('ITEM_PICKUP', { volume: 0.5 });
  engine.refreshPack();
  engine.save();
  engine.setData('towerRoomKey', 'taken');
  engine.setData('towerRoomKeyDay', state.keyDay);
  keyView.visible = false;
}

export const towerRoomsFeature = {
  id: TOWER_ROOMS_FEATURE_ID,

  save() {
    return { ...state };
  },

  restore(slice) {
    state = { v: 1, keyDay: typeof slice?.keyDay === 'string' ? slice.keyDay : '' };
  },

  /** The corridors have counts {} in the ecology catalog; so do their rooms. */
  ecologyOverride(street) {
    const room = towerRoomByTsid(street?.tsid);
    if (!room) return null;
    return { label: room.label, sourceTsid: room.sourceTsid, counts: {}, spawners: 1 };
  },

  onStreetEnter(street, engine) {
    clear();
    const room = towerRoomByTsid(street?.tsid);
    engine.setData('towerRoom', room ? room.tsid : '');
    if (!room) return;
    engine.setData('towerRoomSigns', drawSigns(engine, street));
    const box = keyBox(street);
    if (box) {
      const due = keyDue(engine, box);
      if (due) keyView = drawKey(engine, box);
      engine.setData('towerRoomKey', due ? 'waiting' : 'taken');
    }
    if (['1', 'hold'].includes(engine.param('towerroomspinach'))) engine.applyBuff('high_jumper');
  },

  onStreetClear() {
    clear();
  },

  onTick(_dtMs, now, engine) {
    if (keyView) checkKey(engine, now);
    if (engine.param('towerroomspinach') === 'hold' && towerRoomByTsid(engine.streetTsid) && !engine.hasBuff('high_jumper')) engine.applyBuff('high_jumper');
  },
};
