/**
 * Small items with their own verbs (register row G155), as a feature module
 * (see js/feature-host.js). Rules and source lines live in js/small-items.js.
 *
 * - Fortune Cookie: "Add a note" puts a written Note from the pack inside
 *   (street-furniture-feature's carried notes), "Break" turns the cookie into
 *   a Fortune that keeps the note's text. The pack card reads "Cookie with
 *   Fortune" / "Empty Fortune Cookie" (itemDisplayName).
 * - Fortune: "Read" opens the note card titled "A fortune!".
 * - Plate of Beans: `/beans` in Local chat (the chatCommand hook game.js asks
 *   before saying a line) gives one; "Overthink" asks, and asks again after
 *   1, 2, 4, 8... seconds with one more "really" each time.
 * - Ball: one on Plexus and one on Nandu Pitha; E -> Hit knocks it 200 px
 *   away from you with a bounce (reimagined motion, see small-items.js).
 *   Where it lands is kept in the street slot.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&smallitemdemo=fortune|beans|ball|axe
 *     (&smallitemautoplay=1 runs add note -> break -> read / /beans -> overthink
 *     Yes! twice / one hit; axe swaps the Hatchet for a Class Axe, pair it with
 *     &wooddemo=1&woodmaturity=6&woodreset=1). The real balls: &streetdemo=GHVDIELDQQ7228K (Plexus)
 *     or GA9DURMSIAA2S1T (Nandu Pitha). Canvas data: smallItemsLast,
 *     smallItemsCookies, smallItemsFortunes, smallItemsThink, smallItemsBall,
 *     smallItemsBallX.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=85d4faba';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=f0e432df';
import { nearestSurfaceY } from '../walk-surface.js?v=764d5f5a';
import { openNoteView, openNotePicker } from '../note-view.js?v=21c55475';
import { giveCarriedNote, takeCarriedNote, writtenCarriedNotes } from './street-furniture-feature.js?v=97605809';
import {
  BALL,
  BALL_HIT,
  BEANS_TEXT,
  FORTUNE,
  FORTUNE_COOKIE,
  FORTUNE_TEXT,
  PLATE_OF_BEANS,
  addNoteToCookie,
  ballHitPose,
  ballStreet,
  breakCookie,
  chatCommand,
  cookieLabel,
  cookieVerbs,
  fortuneView,
  normalizeFortuneState,
  overthinkAnswer,
  overthinkPrompt,
  planBallHit,
  reconcileFortunes,
} from '../small-items.js?v=78d0056a';
import { itemZ } from '../item-bands.js?v=e98b10bc';

export const SMALL_ITEMS_FEATURE_ID = 'small-items';
const BALL_GROUP = 'smallItemsBall';
const BALL_SHEET = Object.freeze({ path: BALL_HIT.art.url, fw: BALL_HIT.art.fw, fh: BALL_HIT.art.fh, cols: BALL_HIT.art.cols, frames: BALL_HIT.art.frames });

let fortunes = normalizeFortuneState({});
let thinkCount = 0;
let thinkTimer = null;
let last = '';
let loader = null;
let ball = null; // { sprite, target, x, y, plan, frame, slot }
let demoDone = false;

function ensureItems() {
  // fortune_cookie.js description (the store row had a placeholder).
  ensureItem(FORTUNE_COOKIE, { desc: 'Comes with or without a note inside. Add your own and give it to a friend!', tags: ['cookie', 'toys'] });
  ensureItem(FORTUNE, {
    label: 'Fortune',
    desc: 'For those who believe their fate is predetermined, this fortune holds your destiny.\n\nPlus, your lucky lottery numbers!',
    baseCost: 0,
    stackMax: 1,
    tags: ['fortune', 'toys', 'no_auction', 'no_trade'],
    namePlural: 'Fortunes',
    sellable: false,
  });
  ensureItem(PLATE_OF_BEANS, {
    label: 'Plate of Beans',
    desc: 'Just a plate of beans, as you can see.',
    baseCost: 0,
    stackMax: 1,
    tags: ['no_rube', 'no_trade'],
    namePlural: 'Plates of Beans',
    sellable: false,
  });
}

const COOKIE_ICONS = Object.freeze({
  iconic: 'assets/sprites/icons/fortune_cookie.png',
  // OGA fortune_cookie__x1_withnote_iconic (buildState 'withnote_iconic').
  withnote: 'assets/sprites/icons/fortune_cookie_withnote.png',
});

function sync(engine) {
  fortunes = reconcileFortunes(fortunes, countItem(engine.inv, FORTUNE_COOKIE), countItem(engine.inv, FORTUNE));
  const icon = cookieLabel(fortunes) === FORTUNE_TEXT.withNote ? COOKIE_ICONS.withnote : COOKIE_ICONS.iconic;
  if (ITEM_CATALOG[FORTUNE_COOKIE] && ITEM_CATALOG[FORTUNE_COOKIE].icon !== icon) ITEM_CATALOG[FORTUNE_COOKIE].icon = icon;
}

function publish(engine) {
  const c = fortunes.cookies;
  engine.setData?.('smallItemsLast', last);
  engine.setData?.('smallItemsCookies', `${c.filter(Boolean).length}/${c.length}`);
  engine.setData?.('smallItemsFortunes', String(fortunes.fortunes.length));
  engine.setData?.('smallItemsThink', String(thinkCount));
  engine.setData?.('smallItemsBall', ball ? 'placed' : '');
  engine.setData?.('smallItemsBallX', ball ? String(Math.round(ball.x)) : '');
}

function say(engine, text) {
  if (!text) return;
  engine.pushActivity?.(text);
  engine.toast?.(text, 3200);
}

function changed(engine) {
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
}

/* ------------------------------------------------------------ fortunes */

/** fortune_cookie.js add_note: pick a written note, move its text inside. */
export function addNote(engine, noteId = null) {
  sync(engine);
  const notes = writtenCarriedNotes(engine);
  if (!notes.length) {
    say(engine, FORTUNE_TEXT.noNotes);
    return false;
  }
  const put = (id) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return false;
    const out = addNoteToCookie(fortunes, note);
    if (!out.ok) {
      if (out.msg) say(engine, out.msg);
      return false;
    }
    takeCarriedNote(engine, id);
    fortunes = out.state;
    sync(engine);
    say(engine, out.msg);
    last = 'fortune_cookie:add_note';
    changed(engine);
    return true;
  };
  if (noteId || notes.length === 1) return put(noteId || notes[0].id);
  openNotePicker({ kicker: FORTUNE_TEXT.addLabel, title: 'Which note?', notes: notes.map((n) => ({ id: n.id, title: n.title })), onPick: put });
  return true;
}

/** fortune_cookie.js break_it -> replaceWith('fortune'). */
export function breakFortuneCookie(engine) {
  sync(engine);
  const out = breakCookie(fortunes);
  if (!out.ok) return false;
  removeItem(engine.inv, FORTUNE_COOKIE, 1);
  addItem(engine.inv, FORTUNE, 1);
  fortunes = out.state;
  sync(engine);
  say(engine, out.msg);
  last = 'fortune_cookie:break_it';
  changed(engine);
  return true;
}

/** fortune.js read: one card per Fortune, the newest first when there are several. */
export function readFortune(engine) {
  sync(engine);
  const list = fortunes.fortunes;
  const open = (i) => {
    const view = fortuneView(list[i]);
    openNoteView({ kicker: 'Fortune', title: view.title, body: view.body, byline: `Written by ${view.author}`, reason: view.reason, editable: false });
    engine.pushActivity?.(FORTUNE_TEXT.read);
    last = 'fortune:read';
    publish(engine);
  };
  if (!list.length) {
    openNoteView({ kicker: 'Fortune', title: FORTUNE_TEXT.readTitle, body: '', reason: FORTUNE_TEXT.readReason, editable: false });
    last = 'fortune:read';
    publish(engine);
    return true;
  }
  if (list.length === 1) open(0);
  else openNotePicker({ kicker: 'Fortune', title: 'Which fortune?', notes: list.map((f, i) => ({ id: String(i), title: f.text.slice(0, 40) })), onPick: (id) => open(Number(id)) });
  return true;
}

/* ---------------------------------------------------------------- beans */

function askOverthink(engine, prompt) {
  engine.scriptedDialogue({
    title: 'Plate of Beans',
    kicker: 'Plate of Beans',
    beats: [{ text: prompt.text, response: prompt.yes }],
    cancelable: true,
    primaryLabel: prompt.yes,
    cancelLabel: prompt.no,
    onComplete: () => answerOverthink(engine, 'ok'),
    onCancel: () => answerOverthink(engine, 'cancel'),
  });
  last = `plate_of_beans:ask:${thinkCount}`;
  publish(engine);
}

/** plate_of_beans.js modal_callback. */
export function answerOverthink(engine, value) {
  const out = overthinkAnswer(thinkCount, value);
  thinkCount = out.count;
  clearTimeout(thinkTimer);
  thinkTimer = null;
  if (out.next) {
    thinkTimer = setTimeout(() => {
      thinkTimer = null;
      if (countItem(engine.inv, PLATE_OF_BEANS) < 1) return;
      askOverthink(engine, out.next);
    }, out.next.delayMs);
  }
  last = `plate_of_beans:${value === 'ok' ? 'yes' : 'no'}:${thinkCount}`;
  publish(engine);
  return out;
}

export function overthink(engine) {
  if (countItem(engine.inv, PLATE_OF_BEANS) < 1) return false;
  clearTimeout(thinkTimer);
  thinkTimer = null;
  askOverthink(engine, overthinkPrompt());
  return true;
}

/** main.js /beans: pc.createItemFromFamiliar('plate_of_beans', 1). */
export function runChatCommand(engine, text) {
  const cmd = chatCommand(text);
  if (!cmd) return null;
  for (const [cls, n] of Object.entries(cmd.give)) addItem(engine.inv, cls, n);
  const p = engine.player;
  if (p) engine.floatText?.(p.x, p.y - 100, '+1 Plate of Beans', 0xffd36b);
  last = `chat:${cmd.command}`;
  changed(engine);
  return true;
}

/* ----------------------------------------------------------------- ball */

function clearBall(engine) {
  if (!ball) return;
  engine?.unregister?.(ball.target);
  if (ball.sprite && !ball.sprite.destroyed) ball.sprite.destroy();
  ball = null;
}

function groundAt(engine, x, refY) {
  const y = nearestSurfaceY(engine.platforms, x, refY);
  return Number.isFinite(y) ? y : refY;
}

function spawnBall(engine, point, { persist = true } = {}) {
  const { PIXI } = engine;
  if (!PIXI || !engine.entityLayer || !point) return;
  loader ||= createSheetLoader(PIXI);
  // A QA ball (smallitemdemo=ball) lives in a throwaway slot.
  const slot = persist ? engine.streetSlot(SMALL_ITEMS_FEATURE_ID) : {};
  // The first placement sticks (the street slot), so the Ball waits where you left it.
  if (slot.ballX == null || !Number.isFinite(Number(slot.ballX))) {
    slot.ballX = Math.round(point.x);
    slot.ballY = Math.round(point.y);
    if (persist) engine.save?.();
  }
  const x = Number(slot.ballX);
  const y = groundAt(engine, x, Number(slot.ballY));
  const sprite = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  sprite.anchor.set(0.5, 1);
  sprite.x = x;
  sprite.y = y - BALL_HIT.draw.lift;
  sprite.width = BALL_HIT.draw.w;
  sprite.height = BALL_HIT.draw.h;
  sprite.zIndex = itemZ(BALL, 2);
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  const target = engine.register({ classId: BALL, featureId: SMALL_ITEMS_FEATURE_ID, label: 'Ball', sprite });
  ball = { sprite, target, x, y, plan: null, frame: 0, slot };
  loader.load(BALL_SHEET).then(() => {
    if (!ball || ball.sprite !== sprite || sprite.destroyed) return;
    const frames = loader.frames(BALL_SHEET);
    if (!frames.length) return;
    sprite.textures = frames;
    sprite.width = BALL_HIT.draw.w;
    sprite.height = BALL_HIT.draw.h;
    sprite.animationSpeed = pixiSpeed(24);
    sprite.play();
  });
}

/** ball.js verbs.hit. */
export function hitBall(engine) {
  if (!ball || ball.plan) return false;
  const plan = planBallHit(ball.x, engine.player?.x, { minX: 40, maxX: (engine.worldW || ball.x + 400) - 40 });
  ball.plan = plan;
  ball.frame = 0;
  ball.fromY = ball.y;
  ball.toY = groundAt(engine, plan.to, ball.y);
  last = `ball:hit:${plan.dir > 0 ? 'right' : 'left'}`;
  publish(engine);
  return true;
}

function tickBall(dtMs, engine) {
  if (!ball?.plan || ball.sprite.destroyed) return;
  ball.frame += Math.max(0.25, Math.min(3, dtMs / (1000 / 60)));
  const pose = ballHitPose(ball.plan, ball.frame);
  const t = Math.min(1, ball.frame / ball.plan.frames);
  const restY = ball.fromY + (ball.toY - ball.fromY) * t;
  ball.sprite.x = pose.x;
  ball.sprite.y = restY - BALL_HIT.draw.lift - pose.lift;
  if (pose.done) {
    ball.x = ball.plan.to;
    ball.y = ball.toY;
    ball.plan = null;
    ball.slot.ballX = Math.round(ball.x);
    ball.slot.ballY = Math.round(ball.y);
    engine.save?.();
    publish(engine);
  }
}

/* ----------------------------------------------------------------- demo */

function setupDemo(engine) {
  const demo = engine.param?.('smallitemdemo');
  if (demoDone || !demo) return;
  demoDone = true;
  const auto = engine.param?.('smallitemautoplay') === '1';
  if (demo === 'fortune') {
    addItem(engine.inv, FORTUNE_COOKIE, 1);
    giveCarriedNote(engine, { title: 'For you', body: 'You will find a Piggy where you least expect one.', lastEditor: 'player' });
    sync(engine);
    changed(engine);
    if (auto) {
      setTimeout(() => addNote(engine), 900);
      setTimeout(() => breakFortuneCookie(engine), 1800);
      setTimeout(() => readFortune(engine), 2700);
    }
  } else if (demo === 'beans') {
    if (auto) {
      setTimeout(() => {
        const input = document.getElementById('local-chat-input');
        const form = document.getElementById('local-chat-form');
        if (input && form) {
          input.value = BEANS_TEXT.command;
          form.requestSubmit();
        } else runChatCommand(engine, BEANS_TEXT.command);
      }, 900);
      setTimeout(() => overthink(engine), 1600);
      setTimeout(() => answerOverthink(engine, 'ok'), 2400);
    }
  } else if (demo === 'axe') {
    // Class Axe QA (pair with &wooddemo=1&woodreset=1): only the axe in the pack.
    setTimeout(() => {
      engine.inv.hatchet = 0;
      engine.inv.class_axe = Math.max(1, engine.inv.class_axe || 0);
      last = 'class_axe:demo';
      changed(engine);
    }, 400);
  } else if (demo === 'ball') {
    const p = engine.player;
    clearBall(engine);
    if (p) spawnBall(engine, { x: p.x + 120, y: p.y }, { persist: false });
    if (auto) setTimeout(() => hitBall(engine), 1500);
  }
}

/* -------------------------------------------------------------- feature */

export const smallItemsFeature = {
  id: SMALL_ITEMS_FEATURE_ID,

  placementGroups(population, street) {
    if (!street || !ballStreet(street.tsid)) return [];
    return [{ key: BALL_GROUP, count: 1, clearance: 60 }];
  },

  onStreetEnter(street, engine) {
    ensureItems();
    clearBall(engine);
    if (street && ballStreet(street.tsid) && !engine.transientInstance?.()) {
      spawnBall(engine, engine.placement(BALL_GROUP)[0]);
    }
    sync(engine);
    setupDemo(engine);
    publish(engine);
  },

  onStreetClear(engine) {
    clearBall(engine);
  },

  onTick(dtMs, now, engine) {
    tickBall(dtMs, engine);
  },

  verbsFor(target) {
    if (target?.classId !== BALL || target.featureId !== SMALL_ITEMS_FEATURE_ID) return null;
    return [{ id: 'hit', label: BALL_HIT.label, tooltip: BALL_HIT.tooltip, enabled: !ball?.plan, reason: ball?.plan ? 'The Ball is still rolling.' : '' }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== BALL || target.featureId !== SMALL_ITEMS_FEATURE_ID) return false;
    if (verbId === 'hit') hitBall(engine);
    return true;
  },

  packVerbs(classTsid, engine) {
    if (classTsid === FORTUNE_COOKIE) {
      if (countItem(engine.inv, FORTUNE_COOKIE) < 1) return [];
      sync(engine);
      return cookieVerbs(fortunes, writtenCarriedNotes(engine).length);
    }
    if (classTsid === FORTUNE) {
      return [{ id: 'read', label: FORTUNE_TEXT.readLabel, tooltip: FORTUNE_TEXT.readTooltip, enabled: true, reason: '', primary: true }];
    }
    if (classTsid === PLATE_OF_BEANS) {
      return [{ id: 'overthink', label: BEANS_TEXT.label, tooltip: BEANS_TEXT.tooltip, enabled: true, reason: '' }];
    }
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid === FORTUNE_COOKIE && verbId === 'break_it') return breakFortuneCookie(engine) || true;
    if (classTsid === FORTUNE_COOKIE && verbId === 'add_note') return addNote(engine) || true;
    if (classTsid === FORTUNE && verbId === 'read') return readFortune(engine);
    if (classTsid === PLATE_OF_BEANS && verbId === 'overthink') return overthink(engine) || true;
    return false;
  },

  /** fortune_cookie.js getLabel. */
  itemDisplayName(classTsid) {
    if (classTsid !== FORTUNE_COOKIE) return null;
    const label = cookieLabel(fortunes);
    return label ? { label, kind: 'Fortune Cookie' } : null;
  },

  /** game.js local chat: a slash command a feature answers (main.js doChatCommand). */
  chatCommand(text, engine) {
    return runChatCommand(engine, text);
  },

  save() {
    return { version: 1, cookies: fortunes.cookies, fortunes: fortunes.fortunes };
  },

  restore(slice) {
    fortunes = normalizeFortuneState(slice || {});
  },

  /** Tests. */
  _state() {
    return { fortunes, thinkCount, last, ball };
  },
  _reset() {
    fortunes = normalizeFortuneState({});
    thinkCount = 0;
    clearTimeout(thinkTimer);
    thinkTimer = null;
    last = '';
    ball = null;
    demoDone = false;
  },
};
