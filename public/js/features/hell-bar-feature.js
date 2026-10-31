/**
 * The Hell Bar as a feature module (see js/feature-host.js). The room is
 * ordinary street JSON written by tools/build-hell-bar.mjs from js/hell-bar.js
 * (floor, stool seats, end walls, the way out to Panka Surazu; Panka's door
 * leads in through doors-feature). This file adds what a street JSON cannot
 * carry:
 * - the room's art (hellBarArt: the tools/room-art `hell_bar` set and two
 *   street decos), drawn behind the avatar;
 * - Hell's Bartender (items/hell_bartender.js): idle1/idle2 and talk_left/
 *   talk_right/talk_right_out from the OGA sheets; Talk to and Buy wine; the
 *   first touch of his hit box per visit runs a conversation; chit-chat every
 *   30 s while you are in the bar and outside his hit box;
 * - the Diabolical Drink Ticket's own "Buy wine" pack verb (items/drink_ticket.js:
 *   a bartender within 200 px);
 * - an interior ecology (nothing archived: no animals, fruit or quoins).
 *
 * Wine of the Dead's drink verb lives in features/hell-feature.js (it croaks the
 * living and needs the croak state).
 *
 * QA (the bar is reached through Panka Surazu's door, see doors-feature):
 *   /play/?autostart=1&fresh=1&resetgame=1&questoffer=off&doordemo=GA5RPAFK9OE28GN&doorautoplay=1
 *   &hellbarticket=N   put N Diabolical Drink Tickets in the pack on arrival in the bar
 *   &hellbarautoplay=talk|buy|buyask|walk   talk to him / buy a wine (clicks through the
 *                      conversation; buyask leaves it open) / walk into his hit box, once,
 *                      when the loading card has cleared
 *   &hellbarquest=todo|done   pretend hell_quest is in progress / done (bartender lines only)
 * Canvas data: hellBar, hellBarArt, hellBarState, hellBarTalk, hellBarConversation,
 * hellBarTickets, hellBarWine, hellBarLast.
 */

import { addItem, countItem, removeItem } from '../inventory.js?v=85d4faba';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js?v=db2ce452';
import { pixiSpeed } from '../sprite-sheets.js?v=1b2de668';
import { ensureHellItems, HELL_BARTENDER, HELL_SPRITES } from '../hell.js?v=454c9f42';
import { questFlagsFeature } from './quest-flags-feature.js?v=17c6ef48';
import {
  BARTENDER,
  BARTENDER_TEXT,
  HELL_BAR_LABEL,
  HELL_BAR_SOURCE_TSID,
  bartenderTalkOptions,
  buyWineConditions,
  buyWinePlan,
  collisionConversation,
  grantWine,
  hellBarArt,
  inBartenderHitBox,
  isHellBarTsid,
  pickBartenderLine,
  talkStateFor,
} from '../hell-bar.js?v=6b7c50e8';

export const HELL_BAR_FEATURE_ID = 'hell-bar';
const CLASS = 'hell_bartender';
const TICKET = 'drink_ticket';
const WINE = 'wine_of_the_dead';
const SHEETS = Object.freeze({
  idle1: HELL_SPRITES.bartender.idle1,
  idle2: HELL_SPRITES.bartender.idle2,
  talkLeft: HELL_SPRITES.bartender.talkLeft,
  talkRight: HELL_SPRITES.bartender.talkRight,
  talkRightOut: HELL_SPRITES.bartender.talkRightOut,
});

let views = [];
let bartender = null; // { sprite, target, state, frames: {}, timers }
let talked = false;
let inHitBox = false;
let chitChatAt = 0;
let idleSwitchAt = 0;
let stopTalkAt = 0;
let lastTalk = '';
let autoplayDone = false;

const stripTags = (text) => String(text || '').replace(/<[^>]+>/g, '');

function clear() {
  for (const v of views) {
    if (v.parent) v.parent.removeChild(v);
    if (!v.destroyed) v.destroy({ children: true });
  }
  views = [];
  bartender = null;
  talked = false;
  inHitBox = false;
  stopTalkAt = 0;
  autoplayDone = false;
}

function questStatus(engine) {
  const param = engine.param('hellbarquest');
  if (param === 'todo' || param === 'done') return param;
  const qs = engine.questState;
  if (qs?.completed?.includes?.('hell_quest')) return 'done';
  if (qs?.active?.hell_quest) return 'todo';
  return 'none';
}

const buyFlag = () => questFlagsFeature.has('buy_wotd');
const hasTicket = (engine) => countItem(engine.inv, TICKET) > 0;
const hasWine = (engine) => countItem(engine.inv, WINE) > 0;

function publish(engine) {
  engine.setData('hellBarTickets', String(countItem(engine.inv, TICKET)));
  engine.setData('hellBarWine', String(countItem(engine.inv, WINE)));
  engine.setData('hellBarState', bartender?.state || '');
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

/** Art rows (world space, bottom-centre anchors, negative z behind doors, items and the avatar). */
function drawArt(engine, street) {
  const { PIXI } = engine;
  const { l, t } = street.bounds;
  let n = 0;
  for (const a of hellBarArt()) {
    let view;
    if (a.fill != null) {
      view = new PIXI.Graphics();
      view.rect(a.x1 - l, a.y1 - t, a.x2 - a.x1, a.y2 - a.y1).fill({ color: a.fill, alpha: a.alpha ?? 1 });
    } else {
      view = new PIXI.Sprite(textureFromUrl(a.src));
      view.anchor.set(0.5, 1);
      view.x = a.x - l;
      view.y = a.y - t;
      view.width = a.w;
      view.height = a.h;
      if (a.flip) view.scale.x = -Math.abs(view.scale.x);
      if (a.r) view.angle = a.r;
    }
    view.zIndex = a.z;
    view.eventMode = 'none';
    engine.entityLayer.addChild(view);
    views.push(view);
    n += 1;
  }
  return n;
}

function sheetFrames(engine, sheet) {
  const { PIXI } = engine;
  const source = sourceFromUrl(sheet.url);
  const fw = HELL_SPRITES.bartender.frameW;
  const fh = HELL_SPRITES.bartender.frameH;
  const out = [];
  for (let i = 0; i < sheet.frames; i += 1) {
    out.push(frameTexture(source, new PIXI.Rectangle((i % sheet.cols) * fw, Math.floor(i / sheet.cols) * fh, fw, fh)));
  }
  return out;
}

function setState(state) {
  if (!bartender || bartender.state === state) return;
  const frames = bartender.frames[state];
  if (!frames?.length) return;
  bartender.state = state;
  bartender.sprite.textures = frames;
  bartender.sprite.loop = state !== 'talkRightOut';
  bartender.sprite.gotoAndPlay(0);
}

function drawBartender(engine, street) {
  const { PIXI } = engine;
  const frames = Object.fromEntries(Object.entries(SHEETS).map(([k, sheet]) => [k, sheetFrames(engine, sheet)]));
  const sprite = new PIXI.AnimatedSprite(frames.idle1);
  sprite.anchor.set(0.5, 1);
  sprite.x = BARTENDER.x - street.bounds.l;
  sprite.y = BARTENDER.y - street.bounds.t;
  sprite.zIndex = -49;
  sprite.animationSpeed = pixiSpeed(BARTENDER.fps);
  sprite.loop = true;
  sprite.play();
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  engine.entityLayer.addChild(sprite);
  views.push(sprite);
  const target = engine.register({
    classId: CLASS,
    featureId: HELL_BAR_FEATURE_ID,
    label: BARTENDER_TEXT.label,
    subtitle: BARTENDER_TEXT.subtitle,
    sprite,
  });
  bartender = { sprite, target, state: 'idle1', frames };
}

/* ------------------------------------------------------------------ */
/* Behaviour                                                           */
/* ------------------------------------------------------------------ */

/** speakTo(pc, duration): face the player; after `durationMs` stopTalking. */
function speakTo(engine, durationMs = 0) {
  if (!bartender) return;
  const px = engine.player.x + engine.street.bounds.l;
  setState(talkStateFor(px, BARTENDER.x));
  stopTalkAt = durationMs ? performance.now() + durationMs : 0;
}

function say(engine, text, durationMs = 5000) {
  if (!bartender) return;
  engine.say(bartender.target, stripTags(text), durationMs);
  engine.setData('hellBarTalk', stripTags(text));
}

/** talk_to: a line from the pool for the player's quest status and pack. */
function talkTo(engine) {
  const options = bartenderTalkOptions({ questStatus: questStatus(engine), hasWine: hasWine(engine), hasTicket: hasTicket(engine) });
  const text = pickBartenderLine(options, lastTalk);
  lastTalk = text;
  speakTo(engine, 3000);
  say(engine, text, 5000);
}

function applyGrant(engine, result) {
  for (const e of result.effects) {
    if (e.type === 'consume_item') removeItem(engine.inv, e.classTsid, e.count);
    else if (e.type === 'grant_item') addItem(engine.inv, e.classTsid, e.count);
    else if (e.type === 'quest_flag') engine.questFlag(e.flag);
  }
  if (result.bubble) {
    speakTo(engine, 3000);
    say(engine, result.bubble, 5000);
  }
  for (const line of result.activity) engine.pushActivity(line);
  // The quest event behind hell_quest's buy_wotd flag (js/quest-offers.js COUNTER_ROUTES, G163).
  if (result.ok) engine.achievement('vendor_bought:wine_of_the_dead', 1);
  engine.refreshPack();
  engine.save();
  engine.setData('hellBarLast', result.ok ? 'bought' : 'refused');
  publish(engine);
}

/** A source conversation (HELL_BARTENDER.conversations) as a scripted dialogue. */
function converse(engine, id, onComplete) {
  const beats = HELL_BARTENDER.conversations[id];
  if (!beats) return;
  engine.setData('hellBarConversation', id);
  speakTo(engine);
  engine.scriptedDialogue({
    title: BARTENDER_TEXT.label,
    kicker: HELL_BAR_LABEL,
    beats: beats.map((b) => ({ text: stripTags(b.text), response: b.response })),
    onComplete: () => {
      // onConversationEnding / onConversationReply: back to idle.
      setState('idle1');
      onComplete?.();
    },
    onCancel: () => setState('idle1'),
  });
}

/** buy_wine handler: the first-purchase conversation (unless flagged), then grantWine. */
function buyWine(engine) {
  const status = questStatus(engine);
  const plan = buyWinePlan({ hasTicket: hasTicket(engine), questStatus: status, buyFlag: buyFlag() });
  if (!plan.ok) {
    for (const line of plan.activity) engine.pushActivity(line);
    engine.setData('hellBarLast', 'no_ticket');
    return;
  }
  const grant = () => applyGrant(engine, grantWine({ hasTicket: hasTicket(engine), packFull: false, questStatus: status, buyFlag: buyFlag() }));
  if (plan.conversation) converse(engine, plan.conversation, grant);
  else grant();
}

/** onPlayerCollision: once per visit. */
function onCollision(engine) {
  if (talked) return;
  talked = true;
  const id = collisionConversation({ questStatus: questStatus(engine), hasTicket: hasTicket(engine), buyFlag: buyFlag() });
  engine.setData('hellBarCollision', id || 'none');
  if (id === 'buy') buyWine(engine);
  else if (id) converse(engine, id);
}

function bartenderNear(engine, range) {
  if (!bartender || !isHellBarTsid(engine.streetTsid)) return false;
  return Math.abs(engine.player.x + engine.street.bounds.l - BARTENDER.x) <= range;
}

function autoplay(engine) {
  const mode = engine.param('hellbarautoplay');
  if (!mode || autoplayDone || !bartender || engine.busy()) return;
  autoplayDone = true;
  if (mode === 'walk') {
    engine.player.x = BARTENDER.x - 60 - engine.street.bounds.l;
    return;
  }
  // Stand by him without touching the hit box's conversation, so the verb is what runs.
  talked = true;
  engine.player.x = BARTENDER.x - 120 - engine.street.bounds.l;
  if (mode === 'talk') talkTo(engine);
  if (mode === 'buyask') buyWine(engine);
  if (mode === 'buy') {
    buyWine(engine);
    // Click through the conversation (QA only).
    const click = () => {
      const btn = document.querySelector('#quest-dialogue:not([hidden]) #quest-dialogue-next');
      if (btn) btn.click();
    };
    for (const ms of [900, 1800, 2700, 3600]) setTimeout(click, ms);
  }
}

export const hellBarFeature = {
  id: HELL_BAR_FEATURE_ID,

  init(engine) {
    ensureHellItems();
    engine.setData('hellBar', '');
  },

  /** Indoors: nothing archived, so no animals, fruit, Musicblocks or quoins. */
  ecologyOverride(street) {
    if (!isHellBarTsid(street?.tsid)) return null;
    return { label: HELL_BAR_LABEL, sourceTsid: HELL_BAR_SOURCE_TSID, counts: {}, interior: true, empty: true, quoins: 0 };
  },

  onStreetEnter(street, engine) {
    clear();
    const here = isHellBarTsid(street?.tsid);
    engine.setData('hellBar', here ? '1' : '');
    if (!here) return;
    engine.setData('hellBarArt', String(drawArt(engine, street)));
    drawBartender(engine, street);
    const now = performance.now();
    // onPlayerEnter: idle1, switchIdle in 4-10 s, chitChat in 30 s.
    idleSwitchAt = now + 4000 + Math.random() * 6000;
    chitChatAt = now + BARTENDER.chitChatMs;
    const tickets = Number(engine.param('hellbarticket'));
    if (Number.isFinite(tickets) && tickets > 0 && countItem(engine.inv, TICKET) < tickets) {
      addItem(engine.inv, TICKET, tickets - countItem(engine.inv, TICKET));
      engine.refreshPack();
    }
    publish(engine);
  },

  onStreetClear() {
    clear();
  },

  verbsFor(target, engine) {
    if (target?.classId !== CLASS) return null;
    const cond = buyWineConditions({ hasTicket: hasTicket(engine) });
    return [
      { id: 'buy_wine', label: 'Buy wine', sort: 50, tooltip: BARTENDER_TEXT.buyTooltip, enabled: cond.state === 'enabled', reason: cond.reason, durationMs: 0 },
      { id: 'talk_to', label: 'Talk to', sort: 51, tooltip: BARTENDER_TEXT.talkTooltip, enabled: true, reason: '', durationMs: 0 },
    ];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId !== CLASS) return false;
    if (verbId === 'talk_to') talkTo(engine);
    else if (verbId === 'buy_wine') buyWine(engine);
    return true;
  },

  /** items/drink_ticket.js buy_wine: proxies to a bartender within 200 px. */
  packVerbs(classTsid, engine) {
    if (classTsid !== TICKET || !isHellBarTsid(engine.streetTsid)) return [];
    const near = bartenderNear(engine, BARTENDER.ticketRange);
    return [{ id: 'buy_wine', label: 'Buy wine', enabled: near, reason: near ? '' : BARTENDER_TEXT.noOne, tooltip: BARTENDER_TEXT.ticketTooltip }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== TICKET || verbId !== 'buy_wine') return false;
    if (!bartenderNear(engine, BARTENDER.ticketRange)) {
      engine.pushActivity(BARTENDER_TEXT.noOne);
      return true;
    }
    buyWine(engine);
    return true;
  },

  onTick(_dtMs, now, engine) {
    if (!bartender || !isHellBarTsid(engine.streetTsid)) return;
    const t = performance.now();
    autoplay(engine);
    // stopTalking: talk_right winds down through talk_right_out (800 ms), else back to idle1.
    if (stopTalkAt && t >= stopTalkAt) {
      if (bartender.state === 'talkRight') {
        setState('talkRightOut');
        stopTalkAt = t + 800;
      } else {
        setState('idle1');
        stopTalkAt = 0;
      }
    }
    // switchIdle: idle1 -> idle2 for 3 s -> idle1 for 4-10 s.
    if (t >= idleSwitchAt) {
      if (bartender.state === 'idle1') {
        setState('idle2');
        idleSwitchAt = t + 3000;
      } else {
        if (bartender.state === 'idle2') setState('idle1');
        idleSwitchAt = t + 4000 + Math.random() * 6000;
      }
    }
    const { l, t: top } = engine.street.bounds;
    const inside = inBartenderHitBox(engine.player.x + l, engine.player.y + top);
    // onPlayerCollision (once per visit; held while a panel, card or dialogue is up).
    if (inside && !talked && !engine.busy()) onCollision(engine);
    // onPlayerLeavingCollisionArea: chitChat again in 30 s.
    if (!inside && inHitBox) chitChatAt = t + BARTENDER.chitChatMs;
    inHitBox = inside;
    if (!inside && t >= chitChatAt) {
      chitChatAt = t + BARTENDER.chitChatMs;
      if (!engine.busy()) talkTo(engine);
    }
    engine.setData('hellBarState', bartender.state);
  },

  /** QA / tests. */
  _state() {
    return { talked, inHitBox, state: bartender?.state || '', lastTalk };
  },
};
