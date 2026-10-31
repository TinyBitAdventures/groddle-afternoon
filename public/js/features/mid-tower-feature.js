/**
 * Jethimadh Tower: Mid as a feature module (see js/feature-host.js). The
 * Stairs and the Mezzanine are street JSON (js/tower-mid-rooms.js, written by
 * tools/build-tower-rooms.mjs); tower-rooms-feature gives them their interior
 * ecology and door plaques. This file adds what a street JSON cannot carry:
 *
 * - Greeterbot Sentry G-42 in the Mezzanine (GSJS npc_quest_giver_widget,
 *   widgetWood art from its own SWF). Talk to follows its doTalk:
 *   - It's Educational (rook_hall_start) or It's Educational II (rook_hall)
 *     under way: the museum (engine.startRookMuseum, the same instance as
 *     ?questdemo=rookmuseum; the Greeterbot's welcome plays inside, as
 *     enterHall did after the turn-in);
 *   - rook_hall done: the hall_repeat conversation ("Would you like to return
 *     to the Museum of the Rook ...?" Yes / No);
 *   - otherwise its no_quest_text ("One must be called to do so.").
 * - The museum door ("enter the door to the Rook museum", beta recap
 *   2011-08-19) goes the Greeterbot's way: its Enter runs the same check.
 * - The teleporter under the floorboards (Mezzanine box mezz_stoot_teleporter:
 *   jump at the crawlspace's left end) to unnnn, the Stoot Shrine, and unnnn's
 *   way back (STOOT_RETURN: walk into its left end).
 * - The Hall of Rejected Concepts (js/hall-rejected-concepts.js), behind the
 *   Mezzanine's Hall door: its fourteen exhibits (CC0 museum_* art on
 *   museum_stand_1 plinths) and a Wall Button each (items/wall_button.js:
 *   Press, in for reset_timer 1000 ms, nothing past `distance` 1000 px). A
 *   press raises the client's in-window announcement ("Click anywhere...",
 *   Enter / Space / Escape too) naming the exhibit, as the recordings show.
 *   By the first window a widget hovers (widgetWood, its idle loop at 3x):
 *   npc_widget has no player verbs outside its tower_quest, so a click gets
 *   the client's empty-menu growl "I have nothing for you!" (game.js
 *   openVerbMenu: a target's emptyMenuGrowl). The wall tiles take
 *   HALL.wallTint (olive-gold, sampled from the Snaps).
 *
 * QA (real input): ?autostart=1&questoffer=off&doordemo=GIF5UU8FO3029OK&doorautoplay=1
 *   enters the tower from Tower St West; or &streetdemo=GIFGJ2246R72LJL for the
 *   Mezzanine, &streetdemo=GA9L33D5CNE3I0J (&streetx=<screen x>) for the Hall.
 *   &midtowerquest=start puts It's Educational in the quest log
 *   (=done marks both parts done, for the repeat conversation).
 *   &hallpress=<exhibit id> presses that exhibit's button on arrival in the Hall.
 * Canvas data: midTowerRoom, greeterbot (waiting | museum | repeat |
 * declined | refused), midTowerLast, midTowerTeleports, hallExhibits,
 * hallButton (last exhibit pressed), hallPresses, hallSeen, hallOverlay
 * (the announcement's text while it is up), hallWidget (its variant),
 * hallWallTint (hex, once the wall tiles are tinted).
 */

import { insideBottomRect } from '../doors.js?v=eb9510b1';
import { assignQuest } from '../quests.js?v=282e1621';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js?v=db2ce452';
import { pixiSpeed } from '../sprite-sheets.js?v=ec7b4119';
import {
  GREETERBOT,
  MEZZANINE_TSID,
  MUSEUM_DOOR_ID,
  STOOT_RETURN,
  boxToScreen,
  midTowerRoomByTsid,
} from '../tower-mid-rooms.js?v=15143f80';
import { CLICK_ANYWHERE, HALL, HALL_ART, HALL_ART_ROOT, HALL_BUTTON_CLASS, HALL_WIDGET, WALL_BUTTON } from '../hall-rejected-concepts.js?v=fc452e86';

export const MID_TOWER_FEATURE_ID = 'mid-tower';
export const ROOK_HALL_START = 'rook_hall_start';
export const ROOK_HALL = 'rook_hall';
const MUSEUM_VERB = 'mid_tower_museum_enter';
const TELEPORT_CHECK_MS = 120;
const ARRIVAL_GRACE_MS = 800;

let views = [];
let greeter = null;
let teleportBoxes = [];
let teleporting = false;
let lastCheck = 0;
let enteredAt = 0;
let teleports = 0;
let hallButtons = [];
let hallStreet = null;
let hallPresses = 0;
let hallWidget = null;
const hallSeen = new Set();
let overlayEl = null;
let overlayDone = null;

function clear(engine) {
  if (greeter && engine) engine.unregister(greeter);
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy();
  }
  views = [];
  greeter = null;
  teleportBoxes = [];
  for (const b of hallButtons) if (b.timer) clearTimeout(b.timer);
  hallButtons = [];
  hallStreet = null;
  if (hallWidget && engine) engine.unregister(hallWidget);
  hallWidget = null;
  closeOverlay();
}

/**
 * What the Greeterbot does for this quest log (npc_quest_giver_widget.doTalk):
 * 'repeat' once rook_hall is done, 'museum' while either part is under way
 * (or part one is done and part two never finished), else 'refuse'.
 */
export function greeterAction(questState) {
  const done = questState?.completed || [];
  const active = questState?.active || {};
  if (done.includes(ROOK_HALL)) return 'repeat';
  if (active[ROOK_HALL_START] || active[ROOK_HALL] || done.includes(ROOK_HALL_START)) return 'museum';
  return 'refuse';
}

function enterMuseum(engine) {
  engine.setData('greeterbot', 'museum');
  engine.setData('midTowerLast', 'museum');
  engine.startRookMuseum?.();
}

/** Talk to the Greeterbot (or Enter the museum door, which asks the same). */
export function greet(engine, speaker) {
  const action = greeterAction(engine.questState);
  if (action === 'museum') {
    enterMuseum(engine);
    return true;
  }
  if (action === 'repeat') {
    engine.setData('greeterbot', 'repeat');
    engine.scriptedDialogue?.({
      title: 'Museum of the Rook',
      kicker: GREETERBOT.label,
      beats: [{ text: GREETERBOT.repeatQuestion, response: GREETERBOT.repeatYes }],
      cancelable: true,
      primaryLabel: GREETERBOT.repeatYes,
      cancelLabel: GREETERBOT.repeatNo,
      onComplete: () => enterMuseum(engine),
      onCancel: () => {
        engine.setData('greeterbot', 'declined');
        engine.scriptedDialogue?.({
          title: 'Museum of the Rook',
          kicker: GREETERBOT.label,
          beats: [{ text: GREETERBOT.repeatDeclined, response: GREETERBOT.repeatDeclinedResponse }],
        });
      },
    });
    return true;
  }
  engine.setData('greeterbot', 'refused');
  engine.setData('midTowerLast', 'refused');
  engine.say(speaker || greeter, GREETERBOT.noQuestText, 6000);
  return true;
}

function drawGreeter(engine, room, street) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(textureFromUrl(GREETERBOT.art));
  sprite.anchor.set(0.5, 1);
  sprite.x = room.greeterbot.x - street.bounds.l;
  sprite.y = room.greeterbot.y - street.bounds.t;
  sprite.zIndex = 30;
  engine.entityLayer.addChild(sprite);
  views.push(sprite);
  greeter = engine.register({
    classId: GREETERBOT.classId,
    featureId: MID_TOWER_FEATURE_ID,
    label: GREETERBOT.label,
    subtitle: 'Museum docent',
    sprite,
  });
  return greeter;
}

/* ------------------------------------------------------------------ */
/* The Hall of Rejected Concepts                                        */
/* ------------------------------------------------------------------ */

function artSprite(engine, art, x, y, street, z, size = {}) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(textureFromUrl(`${HALL_ART_ROOT}${HALL_ART[art].file}`));
  sprite.anchor.set(0.5, 1);
  sprite.x = x - street.bounds.l;
  sprite.y = y - street.bounds.t;
  if (size.w) sprite.width = size.w;
  if (size.h) sprite.height = size.h;
  sprite.zIndex = z;
  sprite.eventMode = 'none';
  engine.entityLayer.addChild(sprite);
  views.push(sprite);
  return sprite;
}

/** The exhibits, their plinths and buttons, behind the avatar (zIndex below 0). */
function drawHall(engine, room, street) {
  const { PIXI } = engine;
  hallStreet = street;
  for (const ex of room.exhibits) {
    if (ex.plinth) artSprite(engine, 'museum_stand_1', ex.plinth.x, ex.plinth.y, street, -12, { w: ex.plinth.w, h: ex.plinth.h });
    for (const p of ex.pieces) artSprite(engine, p.art, p.x, p.y, street, -11);
    const c = new PIXI.Container();
    const out = new PIXI.Sprite(textureFromUrl(WALL_BUTTON.artOut));
    const inn = new PIXI.Sprite(textureFromUrl(WALL_BUTTON.artIn));
    for (const s of [out, inn]) {
      s.anchor.set(0.5, 0.5);
      s.width = WALL_BUTTON.w;
      s.height = WALL_BUTTON.h;
      c.addChild(s);
    }
    inn.visible = false;
    c.x = ex.button.x - street.bounds.l;
    c.y = ex.button.y - street.bounds.t;
    c.zIndex = -10;
    engine.entityLayer.addChild(c);
    views.push(c);
    const target = engine.register({
      classId: HALL_BUTTON_CLASS,
      featureId: MID_TOWER_FEATURE_ID,
      label: WALL_BUTTON.label,
      subtitle: ex.label,
      sprite: c,
      hallExhibit: ex.id,
    });
    hallButtons.push({ ex, target, out, inn, timer: 0 });
  }
  if (room.widget) drawHallWidget(engine, room.widget, street);
  tintHallWall(engine);
  engine.setData('hallExhibits', room.exhibits.length);
  engine.setData('hallPresses', hallPresses);
  engine.setData('hallSeen', hallSeen.size);
}

/** The widget by the first window: widgetWood's idle loop (npc_widget.swf frames 1-23, 24 fps). */
function drawHallWidget(engine, w, street) {
  const { PIXI } = engine;
  const source = sourceFromUrl(w.sheet);
  const frames = [];
  for (let i = 0; i < w.frames; i += 1) {
    frames.push(frameTexture(source, new PIXI.Rectangle((i % w.cols) * w.frameW, Math.floor(i / w.cols) * w.frameH, w.frameW, w.frameH)));
  }
  const sprite = new PIXI.AnimatedSprite(frames);
  sprite.anchor.set(0.5, 1);
  sprite.x = w.x - street.bounds.l;
  sprite.y = w.y - street.bounds.t;
  sprite.zIndex = -9;
  sprite.animationSpeed = pixiSpeed(w.fps);
  sprite.loop = true;
  sprite.play();
  engine.entityLayer.addChild(sprite);
  views.push(sprite);
  hallWidget = engine.register({
    classId: w.classId,
    featureId: MID_TOWER_FEATURE_ID,
    label: w.label,
    sprite,
    // game.js openVerbMenu: no verbs -> this growl instead of a menu (InteractionMenu.as present()).
    emptyMenuGrowl: w.growl,
  });
  engine.setData('hallWidget', w.variant);
}

/** Multiply HALL.wallTint into the wall tiles (street decos hall_wall_<n>). */
function tintHallWall(engine) {
  const decos = engine.decoViews;
  if (!decos) return;
  let n = 0;
  for (const [id, spr] of decos) {
    if (!id.startsWith('hall_wall_') || spr.destroyed) continue;
    spr.tint = HALL.wallTint;
    n += 1;
  }
  if (n) engine.setData('hallWallTint', HALL.wallTint.toString(16));
}

function setPressed(b, pressed) {
  if (b.out.destroyed || b.inn.destroyed) return;
  b.out.visible = !pressed;
  b.inn.visible = pressed;
}

/** wall_switch press in "resetting" mode: in, its on_press_down event (the announcement), out again after reset_timer. */
export function pressHallButton(engine, target) {
  const b = hallButtons.find((row) => row.target === target);
  if (!b) return false;
  const p = engine.player;
  if (p && hallStreet) {
    const bx = b.ex.button.x - hallStreet.bounds.l;
    const by = b.ex.button.y - hallStreet.bounds.t;
    if (Math.hypot(p.x - bx, p.y - by) > WALL_BUTTON.distance) {
      engine.setData('midTowerLast', `hall_far:${b.ex.id}`);
      return true;
    }
  }
  setPressed(b, true);
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => {
    b.timer = 0;
    setPressed(b, false);
  }, WALL_BUTTON.resetMs);
  hallPresses += 1;
  hallSeen.add(b.ex.id);
  engine.setData('hallButton', b.ex.id);
  engine.setData('hallPresses', hallPresses);
  engine.setData('hallSeen', hallSeen.size);
  engine.setData('midTowerLast', `hall:${b.ex.id}`);
  announce(engine, b.ex.caption || b.ex.label);
  return true;
}

function overlayHost() {
  return document.getElementById('rook-woods-hud')?.parentElement || document.getElementById('game-root') || document.body;
}

function closeOverlay() {
  if (overlayDone) overlayDone();
}

/** The client's in-window announcement: big white lines over the world, "Click anywhere..." under them. */
function announce(engine, text) {
  engine.pushActivity(text);
  if (typeof document === 'undefined') return;
  closeOverlay();
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.className = 'hall-announcement';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-live', 'polite');
    overlayEl.style.cssText = 'position:absolute;inset:0;z-index:86;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;text-align:center;padding:0 16px';
    overlayEl.innerHTML = `<p style="margin:0;max-width:520px;font:900 clamp(1.4rem,4vw,2.3rem)/1.15 Nunito,'Trebuchet MS',sans-serif;color:#fff;text-shadow:0 2px 0 #2a2a2a,0 0 14px rgba(0,0,0,.6)"></p>
      <span style="font:800 .8rem Nunito,sans-serif;color:#fff;text-shadow:0 1px 2px #000">&#9656; ${CLICK_ANYWHERE}</span>`;
    overlayHost().appendChild(overlayEl);
  }
  overlayEl.querySelector('p').textContent = text;
  overlayEl.style.display = 'flex';
  engine.setData('hallOverlay', text);
  const onKey = (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      done();
    }
  };
  const done = () => {
    if (overlayDone !== done) return;
    overlayDone = null;
    overlayEl.style.display = 'none';
    overlayEl.removeEventListener('click', done);
    window.removeEventListener('keydown', onKey, true);
    engine.setData('hallOverlay', '');
  };
  overlayDone = done;
  // The click that pressed the button must not also dismiss the announcement.
  setTimeout(() => {
    if (overlayDone !== done) return;
    overlayEl.addEventListener('click', done);
    window.addEventListener('keydown', onKey, true);
  }, 250);
}

/** Teleporter boxes for the current street, screen space: { box, street, arrive, label }. */
function boxesFor(street) {
  const out = [];
  for (const b of street?.boxes || []) {
    if (b.teleport?.street && b.teleport.arrive) out.push({ id: b.id, box: b, street: b.teleport.street, arrive: b.teleport.arrive, label: b.teleport.label });
  }
  if (street?.tsid === STOOT_RETURN.tsid) {
    const to = midTowerRoomByTsid(STOOT_RETURN.to.tsid);
    out.push({
      id: 'stoot_return',
      box: boxToScreen(STOOT_RETURN.bounds, STOOT_RETURN.box),
      street: STOOT_RETURN.to.tsid,
      arrive: { x: STOOT_RETURN.to.x - to.bounds.l, y: STOOT_RETURN.to.y - to.bounds.t },
      label: to.label,
    });
  }
  return out;
}

async function teleport(engine, row) {
  const gate = engine.travelGate(row.street, { via: 'teleporter' });
  if (gate && gate.ok === false) return;
  teleporting = true;
  try {
    teleports += 1;
    engine.setData('midTowerTeleports', teleports);
    engine.setData('midTowerLast', `teleport:${row.id}`);
    engine.playSound?.('TELEPORT_AWAY', { volume: 0.5 });
    await engine.enter(row.street, { spawnX: row.arrive.x, spawnY: row.arrive.y });
    engine.pushActivity(row.street === MEZZANINE_TSID ? 'You slipped back under the Mezzanine floorboards.' : `You slipped through to ${row.label}.`);
    engine.save();
  } finally {
    teleporting = false;
  }
}

export const midTowerFeature = {
  id: MID_TOWER_FEATURE_ID,

  onStreetEnter(street, engine) {
    clear(engine);
    enteredAt = Date.now();
    const room = midTowerRoomByTsid(street?.tsid);
    engine.setData('midTowerRoom', room ? room.tsid : '');
    teleportBoxes = boxesFor(street);
    if (room?.exhibits) {
      drawHall(engine, room, street);
      const press = engine.param('hallpress');
      const row = press && hallButtons.find((b) => b.ex.id === press);
      if (row) setTimeout(() => pressHallButton(engine, row.target), 600);
    }
    if (room?.greeterbot) {
      drawGreeter(engine, room, street);
      engine.setData('greeterbot', 'waiting');
      const quest = engine.param('midtowerquest');
      const qs = engine.questState;
      if (quest === 'start' && qs) {
        assignQuest(qs, ROOK_HALL_START, { ignorePrereq: true });
      } else if (quest === 'done' && qs) {
        for (const id of [ROOK_HALL_START, ROOK_HALL]) if (!qs.completed.includes(id)) qs.completed.push(id);
      }
    }
  },

  onStreetClear(engine) {
    clear(engine);
  },

  verbsFor(target) {
    if (target && target === hallWidget) return [];
    if (target?.classId === HALL_BUTTON_CLASS && hallButtons.some((b) => b.target === target)) {
      return [{ id: WALL_BUTTON.verb, label: WALL_BUTTON.verbLabel, sort: 50, tooltip: WALL_BUTTON.tooltip, enabled: true, reason: '', durationMs: 0 }];
    }
    if (target?.classId !== GREETERBOT.classId || target !== greeter) return null;
    return [{ id: 'talk_to', label: 'Talk to', sort: 50, tooltip: 'Listen to what they have to say', enabled: true, reason: '', durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target && target === hallWidget) return true;
    if (target?.classId === HALL_BUTTON_CLASS) {
      if (verbId === WALL_BUTTON.verb) pressHallButton(engine, target);
      return true;
    }
    if (target !== greeter) return false;
    if (verbId === 'talk_to') greet(engine, target);
    return true;
  },

  /** The museum door is a street door (doors-feature draws it); its Enter asks the Greeterbot. */
  verbOverride(target) {
    if (target?.classId !== 'street_door' || target.door?.id !== MUSEUM_DOOR_ID) return null;
    return [{ id: MUSEUM_VERB, label: 'Enter', enabled: true, durationMs: 0, tooltip: 'Enter the Museum of the Rook' }];
  },

  runVerbOverride(target, verbId, engine) {
    if (verbId !== MUSEUM_VERB) return null;
    greet(engine, greeter || target);
    return true;
  },

  onTick(_dtMs, now, engine) {
    if (!teleportBoxes.length || teleporting || now - lastCheck < TELEPORT_CHECK_MS || !engine.player) return;
    lastCheck = now;
    if (Date.now() - enteredAt < ARRIVAL_GRACE_MS || engine.acting() || engine.questDialogueOpen()) return;
    const row = teleportBoxes.find((r) => insideBottomRect(r.box, engine.player.x, engine.player.y));
    if (row) teleport(engine, row);
  },

  /** QA / tests. */
  _state() {
    return {
      greeter: Boolean(greeter),
      boxes: teleportBoxes.map((r) => ({ id: r.id, street: r.street, box: r.box, arrive: r.arrive })),
      teleports,
      hall: hallButtons.map((b) => ({ id: b.ex.id, target: b.target, pressed: b.inn.visible === true })),
      hallPresses,
      hallSeen: [...hallSeen],
      widget: hallWidget,
    };
  },
};
