/**
 * The AFLC Frog and the Mail Dispatcher (G121, lane MAILNPC). Rules in
 * js/mail-courier.js; art in js/mail-npc-art.js (tools/mail-npc-art/build.mjs).
 *
 * Express mail (players/inc_mail.js, items/npc_yoga_frog.js)
 *   A letter that carries an item is express (js/mailbox.js deliverMail): it
 *   still shows in the mailbox, and an AFLC Frog also brings it to you. When
 *   it comes due (never sooner than 30 s after it is scheduled) the modal
 *   "Special delivery! A package has arrived for you." opens; OK drops a blue
 *   frog with a box 500 px to one side and 400 px up. It falls to 300 px from
 *   you, then follows (followPC: flies 100 px behind or 50 px ahead and 50 px
 *   up, settles 60 px beside you). Talk to it: "Got your mail, brah." (a
 *   third of the time one of its seven ramblings first, in turn), then each
 *   letter due in the next minute with its sender, words and stuff; Cool.
 *   hands it over (currants first, then the item, if the pack takes it; a
 *   full pack: make room and talk again, or send it to the mailbox). Then it
 *   puts the box down, does a yoga pose (tree, dancer or warrior: in, 2 s
 *   held, out) beside you and flies off. Leaving the street sends it off
 *   and the letter waits for the next call. What came due while you were
 *   away goes straight to the mailbox at load (mail_login), with the growl.
 *   In an instance, a scene or Hell the call waits three minutes
 *   (reschedule_mail); while a panel or dialog is open it waits for it.
 *
 * The Mail Dispatcher (items/npc_mail_dispatcher.js)
 *   The G.I.G.P.D.S. mail station. The final game placed none on a public
 *   street (no archived street holds one); locations/inc_upgrades.js 344
 *   rebuilt npc_mailbox and npc_mail_dispatcher from the street template
 *   whenever a player-owned lot or quarter street changed, so they stood
 *   together on the old housing streets. Here it stands on your home
 *   street just outside the signpost, past its left
 *   arms, clear of every fixture there (reimagined placement; homes-feature
 *   homeDispatcherX, the rules in js/home-street-fixtures.js). Send mail
 *   opens the mail window
 *   on a new letter (mail_dispatch_start); it plays interact while the window
 *   is open and cancel when it closes (mailStop, CANCEL_DISPATCHER). A letter
 *   that went with an item is a parcel: prepare_package (600 ms),
 *   waiting_for_frog (1 s, until the frog lands), a blue frog flies in from
 *   250 px right and 500 px up to the station, package_sent (1 s), and the
 *   frog takes the box away (doParcel 208-258, doPickup 260-292). GSJS never
 *   calls sendParcel (no caller in the 2012 snapshot); this calls it for an
 *   item letter sent from the station (reimagined trigger, source sequence).
 *   Put away (player report 153, Austin 2026-11-09): its owner can take it off
 *   the street (Put away here, or in Cultivate) and put it out again in
 *   Cultivate (homes-feature putAwayHomeDispatcher / putOutHomeDispatcher,
 *   saved as cult.dispatcherAway). Not while a parcel run or its mail window
 *   is under way. Without it nothing is lost: the Mailbox's Write mail sends
 *   letters and items as before, with no parcel run (that is only the
 *   station's), and the frog still brings express mail to you.
 *
 * Auction deliveries (ticket 74, G518; rules in js/mail-courier.js)
 *   A purchase, a cancelled or an expired listing comes 10 minutes later by
 *   a red frog (answer_mail_prompt 335-339: variant frogRed), called the
 *   same way as the blue one and in turn with it (schedule_next_delivery
 *   takes whichever is next). Talk to it: "Got your purchased auction,
 *   brah." with the stacks (ten at a time, then one of showMoreAuctionItems'
 *   lines), Thanks!, and every stack that fits goes straight into the pack
 *   ("Mail time! You got ..."), through the site's ledger online
 *   (features/auctions-feature.js mailReceive). A full pack: make room and
 *   talk again, or send them to the mailbox, where they wait to be collected
 *   at a mailbox. Remake rule: players' parcels are collected only at a
 *   mailbox (js/player-mail.js, HOMES2); auction deliveries follow the source
 *   and come to you (lane frog-auctions, 2026-11-04). A delivery the frog
 *   handed over leaves no letter behind (the source made one only for the
 *   mailbox, send_auction_to_inbox 725-776).
 *
 * Departures: MOVE_FROG / IDLE_FROG play once per change (the source loops
 * them 999 times; their stand-ins are synth ribbits); one-shot clips
 * (moveStart, poses in and out) play through before the source's next timer
 * step; the frog is your own (the source's stood on the street for everyone
 * and told others "On delivery for <name>! No time to talk, brah."); the
 * frog's 'to-mailbox' says only the growl (the source also said "...arrived
 * while you were out", send_unsent_auctions_to_inbox 800-807, though you
 * were there); give_cubimal is not offered (the remake has no
 * mini_me_mini_you yet).
 *
 * QA (solo): ?autostart=1&fresh=1&resetgame=1&questoffer=off&maildemo=courier
 *   (a Groddle Afternoon Post special delivery, 5 Awesome Stew, the frog called 1.5 s
 *   later) &mailautoplay=1 (OK, talk, hand over, yoga, leave), =talk (stops
 *   at the first line), =hold (holds the yoga pose). The red frog:
 *   &maildemo=auction (a purchased auction of 3 Cherries, no site: handed
 *   over locally), &mailauctions=N (N deliveries, mixed kinds; 11 or more
 *   shows the next-ten line), &mailautoplay as above. Dispatcher:
 *   &homedemo=home&maildemo=dispatcher&mailautoplay=1 (Send mail, an Apple
 *   to Amp, close, the parcel run); &mailautoplay=open stops with the window
 *   open; &mailautoplay=putaway puts it away from its verb (Put out is the
 *   Cultivate banner: &homedemo=cultivate). Other lanes' QA routes (any *demo / *autoplay param) never get a
 *   frog unless maildemo is set.
 *   Canvas: mailCourier (idle|due|prompt|frog), mailCourierNext (ms),
 *   mailFrog (kind:mode:clip), mailFrogX, mailFrogY, mailDispatcher (clip),
 *   mailParcels, mailCourierLast, mailCourierDelivered, mailCourierAutoplay.
 */

import { ITEM_CATALOG, itemIcon } from '../inventory.js?v=60dfc9ca';
import { frameTexture, sourceFromUrl } from '../textures.js?v=f024bd6a';
import { questRoomConverse } from './quest-instances-feature.js?v=017af198';
import { hellFeature } from './hell-feature.js?v=aa67fca8';
import { DISPATCHER_ART, FROG_ART, MAIL_NPC_ART_DIR } from '../mail-npc-art.js?v=1ed97a5d';
import { DISPATCHER_GAP, DISPATCHER_HALF, DISPATCHER_TEXT, SIGNPOST } from '../home-street-fixtures.js?v=bad831a1';
import { MAIL_POST_SENDER } from '../mailbox.js?v=a3e833ba';
import {
  AUCTION_PAGE,
  COURIER,
  COURIER_TEXT,
  FROG_EPIPHANIES,
  FROG_MORE_AUCTIONS,
  FROG_VARIANT,
  PARCEL,
  auctionGotLine,
  courierDueAt,
  dueAuctions,
  flyStep,
  handOver,
  handOverAuction,
  letterLine,
  nextAuction,
  nextExpress,
  nextRamble,
  normalizeCourierState,
  pickPose,
  sendAuctionsToMailbox,
  sendCarriedToMailbox,
  sendDueToMailbox,
} from '../mail-courier.js?v=68125101';
import { AUCTION_SENDER, mailSubject, mailText } from '../auctions.js?v=278dc46a';
import { formatStack } from '../gifts.js?v=3b8ab24e';
import { itemZ } from '../item-bands.js?v=e98b10bc';

export const MAIL_COURIER_FEATURE_ID = 'mail-courier';
const FROG_CLASS = 'npc_yoga_frog';
const DISPATCHER_CLASS = 'npc_mail_dispatcher';
const HOME_STREET_TSID = 'RH_HOME_EXT';
/** OGA sheets and the SWF timeline run at 30 fps. */
const FPS = 30;
const FROG_LOOPERS = new Set(['idle', 'move', 'talk', 'treePose', 'dancerPose', 'warriorPose']);
const DISPATCHER_LOOPERS = new Set(['idle', 'waiting_for_frog']);
/** Without the homes feature's answer: the usual spot, past the signpost's left arms (home-street-fixtures). */
const DISPATCHER_POST_DX = -SIGNPOST.left - DISPATCHER_GAP - DISPATCHER_HALF;
/** The mailbox's usual distance right of the signpost's post (lotLeft + 100 vs lotLeft - 70), when there is no post. */
const MAILBOX_POST_DX = 170;
/**
 * in_foreground (the frog) and in_background (the station): both under the avatar's 50, since the
 * client's item holders sit below the avatar holders (MiddleGroundRenderer.setupEndShapes 111-171).
 */
const FROG_Z = 40;
/** npc_mail_dispatcher is a background item, over the mailbox beside it (item-bands.js). */
const DISPATCHER_Z = itemZ(DISPATCHER_CLASS, 5);

let state = normalizeCourierState();
let frog = null;
let pickup = null;
let station = null;
let booted = false;
let nextAt = null;
let nextFor = null;
/** schedule_next_delivery's delivery_type: 'courier' (blue frog) or 'auction' (red frog). */
let nextType = 'courier';
let promptOpen = false;
let talking = false;
let last = '';
let lastPublish = 0;
let lastStationScan = 0;
let qaHoldCache = null;
let demoDone = false;
let demoAt = 0;
let autoStep = 0;
let autoAt = 0;
const sheetCache = new Map();
const rng = () => Math.random();

const now = () => Date.now();
const param = (engine, k) => String(engine.param?.(k) || '');

/* ------------------------------------------------------------------ art */

function frogFrames(engine, variant, box, label) {
  const key = `${variant}:${box ? 'box' : 'none'}:${label}`;
  if (sheetCache.has(key)) return sheetCache.get(key);
  const [cols, count] = FROG_ART.sheets[label];
  const { PIXI } = engine;
  const files = FROG_ART.variants?.[variant] || FROG_ART.files;
  const base = sourceFromUrl(`${MAIL_NPC_ART_DIR}${files[box ? 'box' : 'none']}${label}.webp`);
  const list = [];
  for (let i = 0; i < count; i += 1) {
    list.push(frameTexture(base, new PIXI.Rectangle((i % cols) * FROG_ART.cell.w, Math.floor(i / cols) * FROG_ART.cell.h, FROG_ART.cell.w, FROG_ART.cell.h)));
  }
  sheetCache.set(key, list);
  return list;
}

function dispatcherFrames(engine, label) {
  const key = `dispatcher:${label}`;
  if (sheetCache.has(key)) return sheetCache.get(key);
  const [first, count] = DISPATCHER_ART.labels[label];
  const { PIXI } = engine;
  const base = sourceFromUrl(`${MAIL_NPC_ART_DIR}${DISPATCHER_ART.file}`);
  const { w, h } = DISPATCHER_ART.cell;
  const list = [];
  for (let i = first; i < first + count; i += 1) {
    list.push(frameTexture(base, new PIXI.Rectangle((i % DISPATCHER_ART.cols) * w, Math.floor(i / DISPATCHER_ART.cols) * h, w, h)));
  }
  sheetCache.set(key, list);
  return list;
}

function setFrogClip(engine, f, clip, onDone = null) {
  if (!f?.sprite || f.sprite.destroyed || !FROG_ART.sheets[clip]) return;
  const spr = f.sprite;
  spr.textures = frogFrames(engine, f.variant, f.box, clip);
  spr.loop = FROG_LOOPERS.has(clip);
  spr.animationSpeed = FPS / 60;
  spr.onComplete = onDone;
  spr.gotoAndPlay(0);
  f.clip = clip;
}

function setStationClip(engine, s, clip, onDone = null) {
  if (!s?.sprite || s.sprite.destroyed || !DISPATCHER_ART.labels[clip]) return;
  const spr = s.sprite;
  spr.textures = dispatcherFrames(engine, clip);
  spr.loop = DISPATCHER_LOOPERS.has(clip);
  spr.animationSpeed = FPS / 60;
  spr.onComplete = onDone;
  spr.gotoAndPlay(0);
  s.clip = clip;
}

/** The art faces left: face the way it flies, or a point. */
function faceTo(f, x) {
  if (!f?.sprite || f.sprite.destroyed || !Number.isFinite(x) || Math.abs(x - f.x) < 1) return;
  f.sprite.scale.x = x > f.x ? -1 : 1;
}

/* ------------------------------------------------------------------ timers */

function later(owner, ms, fn) {
  if (!owner) return;
  owner.timers.push({ at: now() + ms, fn });
}

function runTimers(owner) {
  if (!owner?.timers.length) return;
  const t = now();
  const due = owner.timers.filter((x) => x.at <= t);
  owner.timers = owner.timers.filter((x) => x.at > t);
  for (const x of due) x.fn();
}

/* ------------------------------------------------------------------ frog */

function makeFrog(engine, kind, x, y, box) {
  const { PIXI } = engine;
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(FROG_ART.origin.x / FROG_ART.cell.w, FROG_ART.origin.y / FROG_ART.cell.h);
  spr.x = x;
  spr.y = y;
  spr.zIndex = FROG_Z;
  spr._worldHitW = 70;
  spr._worldHitH = 80;
  engine.entityLayer.addChild(spr);
  const variant = FROG_VARIANT[kind] || 'frogBlue';
  const f = {
    kind, variant, sprite: spr, target: null, x, y, box, clip: '', mode: '', move: null, timers: [],
    follow: { state: 'move', isClose: 0, flying: false, travel: '', nextAt: 0 }, moving: false,
    delivered: false, waitForSpace: false, previous: 0, pose: '', current: null, shown: 0, total: 0,
  };
  for (const label of Object.keys(FROG_ART.sheets)) frogFrames(engine, variant, box, label);
  return f;
}

function removeFrog(engine, f) {
  if (!f) return;
  if (f.target) engine.unregister?.(f.target);
  else if (f.sprite && !f.sprite.destroyed) {
    f.sprite.parent?.removeChild(f.sprite);
    f.sprite.destroy();
  }
  f.target = null;
  f.timers = [];
  f.move = null;
}

function moveTo(f, x, y, speed, then = null) {
  f.move = { x, y, speed, then };
}

/** answer_mail_prompt 328-343 (blue for courier mail, red for auctions), then fall 364-379 (onContainerChanged). */
function spawnCourier(engine, type = 'courier') {
  const p = engine.player;
  if (!p || frog) return;
  const side = rng() < 0.5 ? -1 : 1;
  const w = Number(engine.worldW) || 3000;
  const x = Math.max(-200, Math.min(w + 200, p.x + side * COURIER.spawnDx));
  frog = makeFrog(engine, type === 'auction' ? 'auction' : 'courier', x, p.y + COURIER.spawnDy, true);
  frog.target = engine.register({
    classId: FROG_CLASS,
    featureId: MAIL_COURIER_FEATURE_ID,
    label: COURIER_TEXT.label,
    subtitle: frog.kind === 'auction' ? 'Auction delivery' : 'Express mail',
    sprite: frog.sprite,
    state: {},
  });
  frog.mode = 'fall';
  setFrogClip(engine, frog, 'move');
  const tx = p.x > frog.x ? p.x - COURIER.fallDx : p.x + COURIER.fallDx;
  faceTo(frog, tx);
  moveTo(frog, tx, p.y, COURIER.fallSpeed, () => {
    frog.mode = 'follow';
    frog.follow = { state: 'move', isClose: 0, flying: false, travel: '', nextAt: 0 };
  });
  frogSound(engine, frog, true);
  last = 'frog:arrive';
  nextAt = null;
}

function frogSound(engine, f, moving) {
  if (!f || f.moving === moving) return;
  f.moving = moving;
  engine.playSound?.(moving ? 'MOVE_FROG' : 'IDLE_FROG', { volume: 0.35 });
}

/** followPC 381-455, one step. */
function followStep(engine, f) {
  const p = engine.player;
  const fl = f.follow;
  const dx = Math.abs(p.x - f.x);
  const wait = (ms) => { fl.nextAt = now() + ms; };
  if (fl.state === 'move' || fl.state === 'moveStart') {
    if (dx < COURIER.followNear) {
      if (fl.isClose === 2) {
        fl.state = 'moveEnd';
        setFrogClip(engine, f, 'moveEnd');
        return wait(COURIER.followStepMs);
      }
      fl.isClose += 1;
    } else fl.isClose = 0;
    const want = p.x < f.x ? 'left' : 'right';
    if (fl.travel && fl.travel !== want) {
      fl.travel = want;
      fl.state = 'moveEnd';
      setFrogClip(engine, f, 'moveEnd');
      return wait(COURIER.followStepMs);
    }
    fl.travel = want;
    if (fl.state !== 'move' || f.clip !== 'move') setFrogClip(engine, f, 'move');
    fl.state = 'move';
    fl.flying = true;
    // The middle of the source's flying area (COURIER.followArea).
    const tx = (f.x < p.x ? p.x + COURIER.followLeftDx : p.x + COURIER.followRightDx) + COURIER.followArea / 2;
    faceTo(f, tx);
    moveTo(f, tx, p.y + COURIER.followDy, COURIER.followSpeed);
    frogSound(engine, f, true);
    return wait(COURIER.followFlyMs);
  }
  if (fl.state === 'moveEnd') {
    if (dx < COURIER.followNear && fl.isClose === 2) {
      fl.state = 'idle';
      setFrogClip(engine, f, 'idle');
      return wait(COURIER.followFlyMs);
    }
    fl.state = 'moveStart';
    setFrogClip(engine, f, 'moveStart');
    return wait(COURIER.followStepMs);
  }
  // idle
  if (dx > COURIER.followNear) {
    fl.state = 'moveStart';
    setFrogClip(engine, f, 'moveStart');
  } else if (fl.flying) {
    fl.flying = false;
    f.move = null;
    const tx = f.x < p.x ? p.x - COURIER.followSettleDx : p.x + COURIER.followSettleDx;
    moveTo(f, tx, p.y, COURIER.followSpeed, () => { fl.nextAt = 0; });
    faceTo(f, p.x);
    fl.nextAt = Number.POSITIVE_INFINITY;
    frogSound(engine, f, false);
    return undefined;
  }
  faceTo(f, p.x);
  frogSound(engine, f, false);
  return wait(COURIER.followStepMs);
}

function tickFrog(engine, f, dtMs) {
  if (!f) return;
  runTimers(f);
  if (f !== frog && f !== pickup) return;
  if (f.move) {
    const arrived = flyStep(f, f.move, f.move.speed, dtMs);
    if (arrived) {
      const then = f.move.then;
      f.move = null;
      then?.();
    }
  }
  if (f.mode === 'follow' && !talking && now() >= f.follow.nextAt) followStep(engine, f);
  if (f.sprite && !f.sprite.destroyed) {
    f.sprite.x = f.x;
    f.sprite.y = f.y;
  }
}

/* ------------------------------------------------------------------ talk */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stuffHtml(message) {
  const bits = [];
  const item = message.attachmentsClaimed ? null : message.attachment;
  if (item) {
    const label = ITEM_CATALOG[item.classTsid]?.label || item.classTsid;
    const icon = ITEM_CATALOG[item.classTsid]?.icon || itemIcon(item.classTsid);
    bits.push(`<span style="display:inline-flex;align-items:center;gap:6px"><img src="${escapeHtml(icon)}" alt="" style="width:40px;height:40px;object-fit:contain" />${escapeHtml(`${item.count} × ${label}`)}</span>`);
  }
  if (!message.attachmentsClaimed && message.currants > 0) bits.push(`<span>◎ ${escapeHtml(message.currants)}</span>`);
  return bits.length ? `<span style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px" data-mail-courier-stuff>${bits.join('')}</span>` : '';
}

function stackLabel(classTsid, n) {
  const meta = ITEM_CATALOG[classTsid];
  return formatStack(classTsid, n, null, (c, k) => (k === 1 ? meta?.label : meta?.namePlural || meta?.label) || String(c).replace(/_/g, ' '));
}

/** mail_build_auction_rewards: the stacks the frog shows (rewards.items). */
function auctionStuffHtml(list) {
  const bits = list.map((m) => {
    const item = m.attachment;
    const label = ITEM_CATALOG[item.classTsid]?.label || item.classTsid;
    const icon = ITEM_CATALOG[item.classTsid]?.icon || itemIcon(item.classTsid);
    return `<span style="display:inline-flex;align-items:center;gap:6px"><img src="${escapeHtml(icon)}" alt="" style="width:40px;height:40px;object-fit:contain" />${escapeHtml(`${item.count} × ${label}`)}</span>`;
  });
  return bits.length ? `<span style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px" data-mail-courier-stuff>${bits.join('')}</span>` : '';
}

/** doDelivery 238-251 / showMoreAuctionItems 702-721: the next ten, and the reply's value. */
function auctionPage(f, list, rambles) {
  const page = list.slice(f.shown, f.shown + AUCTION_PAGE);
  f.shown += AUCTION_PAGE;
  const value = f.shown >= f.total ? (rambles ? 'thx' : 'bye') : 'auction-more-items';
  return { page, value };
}

/**
 * onConversation 'bye' (auction) 582-590, get_auction_mail / get_mail_items
 * 959-1058: every due stack the pack can take goes in (online through the
 * site), one at a time so each counts the room the last one left; the
 * frog's line names them all. Returns how many could not fit.
 */
async function handOverAuctions(engine, f) {
  const got = [];
  let undelivered = 0;
  for (const m of dueAuctions(engine.mailMessages?.(), now())) {
    const item = m.attachment;
    const room = engine.query?.('packRoom', item.classTsid, item.count, engine);
    if (room != null && Number(room) < Number(item.count)) {
      undelivered += 1;
      continue;
    }
    let ok = false;
    if (m.ledger) {
      ok = Boolean(await engine.query?.('mailReceive', m, engine, { quiet: true }));
    } else {
      ok = handOverAuction(m, engine.inv, { room }).ok;
    }
    if (!ok) continue;
    // The source made no letter for a delivery the frog handed over (send_auction_to_inbox only for the mailbox).
    m.attachmentsClaimed = true;
    m.read = true;
    m.deleted = true;
    got.push(stackLabel(item.classTsid, item.count));
    state.delivered += 1;
    last = `frog:handed:${item.classTsid}`;
  }
  if (got.length) {
    engine.pushActivity?.(COURIER_TEXT.mailTime(got));
    engine.playSound?.('CONFIRM_DELIVERY', { volume: 0.45 });
    engine.refreshPack?.();
    engine.updateHud?.();
    engine.save?.();
  }
  f.handed = (f.handed || 0) + got.length;
  return undelivered;
}

/** One conversation_start / conversation_reply: resolves with the chosen value (null if closed). */
async function say3(engine, html, choices) {
  if (autoplayMode(engine) === 'talk' && autoStep === 0) {
    autoStep = 1;
    engine.setData?.('mailCourierAutoplay', 'talk');
  } else if (autoplayMode(engine)) {
    setTimeout(() => clickChoice(), 700);
  }
  return questRoomConverse(engine, {
    title: COURIER_TEXT.label,
    kicker: '',
    beats: [{ text: html, response: choices[0].label }],
    choices,
  });
}

function clickChoice() {
  if (typeof document === 'undefined') return;
  const want = String(new URLSearchParams(location.search).get('mailchoice') || '');
  const buttons = [...document.querySelectorAll('#qi-dialogue [data-qi-choices] button')];
  const pick = (want && buttons.find((b) => b.textContent === want)) || buttons[0];
  pick?.click();
}

async function talkToFrog(engine) {
  const f = frog;
  if (!f || talking) return;
  if (f.delivered) {
    // talk_to 205-213.
    engine.say?.(f.target, COURIER_TEXT.offToYoga, COURIER.bubbleMs, { exact: true });
    last = 'frog:yoga-bye';
    return;
  }
  talking = true;
  f.move = null;
  f.mode = 'talk';
  setFrogClip(engine, f, 'talk');
  faceTo(f, engine.player.x);
  frogSound(engine, f, false);
  try {
    let choice;
    const auction = f.kind === 'auction';
    if (f.waitForSpace) {
      const e = FROG_EPIPHANIES[Math.floor(rng() * FROG_EPIPHANIES.length)];
      choice = await say3(engine, escapeHtml(COURIER_TEXT.epiphany + e), [{ label: COURIER_TEXT.epiphanyReply, value: 'bye' }]);
    } else if (auction) {
      // doDelivery 238-251: the first ten deliveries due, by kind.
      const list = dueAuctions(engine.mailMessages?.(), now());
      if (!list.length) {
        // Collected at a mailbox while the frog was on its way: nothing left to bring.
        finishDelivery(engine, f);
        return;
      }
      f.total = list.length;
      f.shown = 0;
      const { page, value } = auctionPage(f, list, rng() < COURIER.rambleChance);
      last = `frog:auction:${f.total}`;
      choice = await say3(engine, `${escapeHtml(auctionGotLine(page))}${auctionStuffHtml(page)}`, [{ label: COURIER_TEXT.thanks, value }]);
    } else {
      choice = await say3(engine, escapeHtml(COURIER_TEXT.gotMail), [{ label: COURIER_TEXT.thanks, value: rng() < COURIER.rambleChance ? 'thx' : 'bye' }]);
    }
    for (let guard = 0; guard < 64; guard += 1) {
      if (choice == null) break;
      if (choice === 'thx') {
        const r = nextRamble(state.order);
        state.order = r.order;
        engine.save?.();
        choice = await say3(engine, escapeHtml(r.line), [{ label: r.reply, value: 'deliver' }]);
      } else if (choice === 'deliver') {
        choice = await say3(engine, escapeHtml(COURIER_TEXT.namaste), [{ label: COURIER_TEXT.namasteReply, value: 'bye' }]);
      } else if (choice === 'auction-more-items') {
        // showMoreAuctionItems 702-721.
        const list = dueAuctions(engine.mailMessages?.(), now());
        const { page, value } = auctionPage(f, list, rng() < COURIER.rambleChance);
        const line = FROG_MORE_AUCTIONS[Math.floor(rng() * FROG_MORE_AUCTIONS.length)];
        choice = await say3(engine, `${escapeHtml(line)}${auctionStuffHtml(page)}`, [{ label: COURIER_TEXT.thanks, value }]);
      } else if (choice === 'bye' && auction) {
        // onConversation 'bye' 582-590: get_auction_mail, then deliveryFailed or finishDelivery.
        const undelivered = await handOverAuctions(engine, f);
        if (undelivered) {
          choice = await say3(engine, escapeHtml(COURIER_TEXT.packFull), [
            { label: COURIER_TEXT.makeRoom, value: 'make-room' },
            { label: COURIER_TEXT.toMailbox, value: 'to-mailbox' },
          ]);
        } else {
          finishDelivery(engine, f);
          return;
        }
      } else if (choice === 'bye') {
        const msg = nextExpress(engine.mailMessages?.(), now());
        if (!msg) {
          finishDelivery(engine, f);
          return;
        }
        f.current = msg.id;
        const stuff = stuffHtml(msg);
        const line = letterLine(f.previous, { sender: msg.sender, text: msg.text, stuff: Boolean(stuff) });
        choice = await say3(engine, `${escapeHtml(line)}${stuff}`, [{ label: COURIER_TEXT.cool, value: 'get-msg' }]);
      } else if (choice === 'get-msg') {
        const msg = (engine.mailMessages?.() || []).find((m) => m.id === f.current);
        const item = msg && !msg.attachmentsClaimed ? msg.attachment : null;
        const room = item ? engine.query?.('packRoom', item.classTsid, item.count, engine) : null;
        const res = !msg ? { ok: false } : msg.ledger ? await ledgerHandOver(engine, msg, room) : handOver(msg, engine.inv, engine.pc, { room: room == null ? null : room });
        if (res.currants || res.ok) received(engine, res);
        if (!res.ok && res.reason === 'pack_full') {
          choice = await say3(engine, escapeHtml(COURIER_TEXT.packFull), [
            { label: COURIER_TEXT.makeRoom, value: 'make-room' },
            { label: COURIER_TEXT.toMailbox, value: 'to-mailbox' },
          ]);
        } else {
          f.previous += 1;
          choice = 'bye';
        }
      } else if (choice === 'make-room') {
        choice = await say3(engine, escapeHtml(COURIER_TEXT.comeBack), [{ label: COURIER_TEXT.willDo, value: 'will-do' }]);
      } else if (choice === 'will-do') {
        f.waitForSpace = true;
        break;
      } else if (choice === 'to-mailbox') {
        // sendMailToInbox 674-682: this frog's kind of mail only.
        if (auction) sendAuctionsToMailbox(engine.mailMessages?.(), now());
        else sendCarriedToMailbox(engine.mailMessages?.(), now());
        engine.refreshPack?.();
        engine.pushActivity?.(COURIER_TEXT.growl);
        choice = await say3(engine, escapeHtml(COURIER_TEXT.karma), [{ label: COURIER_TEXT.karmaReply, value: 'take-off' }]);
      } else if (choice === 'take-off') {
        finishDelivery(engine, f);
        return;
      } else break;
    }
    // conversation_cancel or will-do: back to following (dialog_onMsg 222-236).
    if (frog === f && !f.delivered) {
      f.mode = 'follow';
      f.follow = { state: 'idle', isClose: 2, flying: false, travel: '', nextAt: 0 };
      setFrogClip(engine, f, 'idle');
    }
  } finally {
    talking = false;
  }
}

/**
 * G478: a real player's parcel is handed over through the site (the
 * mailbox's Receive, features/player-mail-feature.js mailReceive): the stack
 * and the currants together, once the pack has room (get_mail_items 976).
 */
async function ledgerHandOver(engine, msg, room) {
  const item = msg.attachmentsClaimed ? null : msg.attachment || null;
  if (item && room != null && Number(room) < Number(item.count)) return { ok: false, reason: 'pack_full', currants: 0, item };
  const currants = msg.attachmentsClaimed ? 0 : Math.max(0, Math.floor(Number(msg.currants) || 0));
  const ok = await engine.query?.('mailReceive', msg, engine, { quiet: true });
  if (!ok) return { ok: false, reason: 'missing' };
  msg.read = true;
  msg.inMailbox = true;
  msg.expedited = true;
  return { ok: true, currants, item };
}

function received(engine, res) {
  const bits = [];
  if (res.item && res.ok) bits.push(`${res.item.count}× ${ITEM_CATALOG[res.item.classTsid]?.label || res.item.classTsid}`);
  if (res.currants) bits.push(`◎ ${res.currants}`);
  if (!bits.length) return;
  engine.pushActivity?.(`Express mail received: ${bits.join(' · ')}`);
  engine.playSound?.('CONFIRM_DELIVERY', { volume: 0.45 });
  engine.refreshPack?.();
  state.delivered += res.ok ? 1 : 0;
  last = `frog:handed:${res.item?.classTsid || 'currants'}`;
}

/** finishDelivery 384-394, then doYoga 294-339 and leave 472-511. */
function finishDelivery(engine, f) {
  f.delivered = true;
  f.box = false;
  f.pose = pickPose(rng());
  engine.save?.();
  engine.refreshPack?.();
  f.mode = 'yoga';
  setFrogClip(engine, f, 'idle');
  last = `frog:delivered:${f.pose}`;
  say3(engine, escapeHtml(COURIER_TEXT.yoga), [{ label: COURIER_TEXT.yogaReply, value: 'ok-yoga' }]).then(() => doYoga(engine, f));
}

function doYoga(engine, f) {
  if (frog !== f) return;
  const p = engine.player;
  const tx = f.x < p.x ? p.x - COURIER.yogaDx : p.x + COURIER.yogaDx;
  setFrogClip(engine, f, 'move');
  faceTo(f, tx);
  moveTo(f, tx, p.y + COURIER.yogaDy, COURIER.yogaSpeed, () => {
    faceTo(f, p.x);
    engine.playSound?.(`${f.pose.toUpperCase()}_POSE_FROG`, { volume: 0.5 });
    const start = now();
    setFrogClip(engine, f, `${f.pose}PoseIn`, () => {
      later(f, Math.max(0, COURIER.yogaInMs - (now() - start)), () => {
        setFrogClip(engine, f, `${f.pose}Pose`);
        last = `frog:pose:${f.pose}`;
        if (autoplayMode(engine) === 'hold') return;
        later(f, COURIER.yogaHoldMs, () => {
          setFrogClip(engine, f, `${f.pose}PoseOut`, () => later(f, COURIER.yogaOutMs, () => leave(engine, f)));
        });
      });
    });
  });
}

function leave(engine, f) {
  if (!f) return;
  f.mode = 'leave';
  f.delivered = true;
  const dir = rng() < 0.5 ? -1 : 1;
  const dest = { x: f.x + dir * COURIER.leaveDx, y: f.y + COURIER.leaveDy };
  setFrogClip(engine, f, 'moveStart');
  faceTo(f, dest.x);
  later(f, COURIER.leaveStartMs, () => {
    f.moving = false;
    frogSound(engine, f, true);
    setFrogClip(engine, f, 'move');
    moveTo(f, dest.x, dest.y, COURIER.leaveSpeed, () => {
      moveTo(f, dest.x + dir * COURIER.leaveDx2, dest.y + COURIER.leaveDy2, COURIER.leaveSpeed2, () => {
        removeFrog(engine, f);
        if (frog === f) frog = null;
        last = 'frog:gone';
      });
    });
  });
}

/* ------------------------------------------------------------------ scheduling */

function qaHold(engine) {
  if (param(engine, 'maildemo')) return false;
  if (qaHoldCache == null) {
    const keys = typeof location === 'undefined' ? [] : [...new URLSearchParams(location.search).keys()];
    qaHoldCache = keys.some((key) => /demo$|autoplay$/.test(key));
  }
  return qaHoldCache;
}

function blockedPlace(engine) {
  if (engine.transientInstance?.()) return true;
  return Boolean(hellFeature.inHell?.(engine.streetTsid));
}

function busy(engine) {
  // At home busy() is true unless told to look past the home itself.
  return Boolean(engine.busy?.({ ignoreHome: true }) || engine.acting?.() || engine.questDialogueOpen?.() || engine.streetCardUp?.());
}

/** schedule_next_delivery + deliver_mail. */
function scheduleTick(engine) {
  const messages = engine.mailMessages?.() || [];
  if (!booted) {
    booted = true;
    // mail_login: what came due while you were away is in the mailbox now (send_unsent_mail_to_inbox 845-862: letters and auctions).
    const moved = sendDueToMailbox(messages, now()) + sendAuctionsToMailbox(messages, now()).length;
    if (moved) {
      engine.pushActivity?.(COURIER_TEXT.growl);
      engine.refreshPack?.();
      last = `login:${moved}`;
    }
  }
  if (frog || promptOpen) return;
  // schedule_next_delivery 894-953: the next pending delivery of either kind, the earlier first.
  const letter = nextExpress(messages, now(), { future: true });
  const parcel = nextAuction(messages, now(), { future: true });
  const type = parcel && (!letter || Number(parcel.deliveryAt) < Number(letter.deliveryAt)) ? 'auction' : 'courier';
  const msg = type === 'auction' ? parcel : letter;
  if (!msg) {
    nextAt = null;
    nextFor = null;
    return;
  }
  // The site may move a delivery's time (its answer is the truth, auctions-feature mailDeliveries): a new time is a new call.
  const key = `${type}:${msg.id}:${msg.deliveryAt}`;
  if (nextAt == null || nextFor !== key) {
    const demo = param(engine, 'maildemo');
    const due = demo === 'courier' || demo === 'auction' ? Math.max(Number(msg.deliveryAt) || 0, now() + 1500) : courierDueAt(msg, now());
    // A sooner call already set stays (inc_mail.js 941-943).
    nextAt = nextAt != null && nextAt > now() && nextAt < due ? nextAt : due;
    nextFor = key;
    nextType = type;
  }
  if (now() < nextAt || qaHold(engine)) return;
  if (blockedPlace(engine)) {
    nextAt = now() + COURIER.rescheduleMs;
    last = 'courier:rescheduled';
    return;
  }
  // deliver_mail 312: mail_has_deliveries(delivery_type).
  const has = nextType === 'auction' ? dueAuctions(messages, now()).length > 0 : Boolean(nextExpress(messages, now()));
  if (busy(engine) || !has) return;
  promptOpen = true;
  last = `courier:prompt${nextType === 'auction' ? ':auction' : ''}`;
  const kind = nextType;
  engine.prompt?.({
    modal: true,
    text: COURIER_TEXT.prompt,
    choices: [{ label: 'OK', value: 'ok' }],
    onChoice: () => {
      promptOpen = false;
      spawnCourier(engine, kind);
    },
  });
  if (autoplayMode(engine)) setTimeout(() => clickPrompt(), 600);
}

/** Report 153: Put away from its verb menu; homes-feature saves it with the street. */
function putAwayStation(engine) {
  if (!station) return false;
  if (stationBusy()) {
    engine.toast?.(DISPATCHER_TEXT.putAwayBusy);
    return false;
  }
  const out = engine.query?.('homeDispatcherPutAway', engine);
  if (!out?.ok) return false;
  clearStation(engine);
  last = 'dispatcher:away';
  publish(engine, true);
  return true;
}

function clickPrompt() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('quest-dialogue')?.hidden === false) document.getElementById('quest-dialogue-next')?.click();
}

/* ------------------------------------------------------------------ dispatcher */

function homeStreet(engine) {
  const ctx = engine.homeContext?.();
  return Boolean(ctx?.inHome) && engine.streetTsid === HOME_STREET_TSID;
}

function homeMailbox(engine) {
  return (engine.interactables || []).find((t) => t.classId === 'npc_mailbox' && t.sprite && !t.sprite.destroyed) || null;
}

function stationX(engine, mailbox) {
  const at = engine.query?.('homeDispatcherX', engine);
  if (Number.isFinite(at)) return Math.round(at);
  const post = (engine.interactables || []).find((t) => t.classId === 'home_return_marker' && t.sprite && !t.sprite.destroyed);
  return Math.round(post ? post.sprite.x + DISPATCHER_POST_DX : mailbox.sprite.x - MAILBOX_POST_DX + DISPATCHER_POST_DX);
}

function spawnStation(engine, mailbox) {
  const { PIXI } = engine;
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(DISPATCHER_ART.origin.x / DISPATCHER_ART.cell.w, DISPATCHER_ART.origin.y / DISPATCHER_ART.cell.h);
  spr.x = stationX(engine, mailbox);
  spr.y = mailbox.sprite.y;
  spr.zIndex = DISPATCHER_Z;
  engine.entityLayer.addChild(spr);
  const s = { sprite: spr, target: null, clip: '', timers: [], session: null, parcels: 0, parcelState: 0, busy: false };
  for (const label of Object.keys(DISPATCHER_ART.labels)) dispatcherFrames(engine, label);
  s.target = engine.register({
    classId: DISPATCHER_CLASS,
    featureId: MAIL_COURIER_FEATURE_ID,
    label: COURIER_TEXT.dispatcher,
    subtitle: 'G.I.G.P.D.S.',
    sprite: spr,
    state: {},
  });
  setStationClip(engine, s, 'idle');
  return s;
}

function outgoingParcels(engine) {
  return (engine.mailMessages?.() || []).filter((m) => m.outgoing && m.attachment).length;
}

/** sendMail 303-314: the mail window on a new letter; interact while it is open. */
function openStation(engine) {
  const s = station;
  if (!s) return;
  // On a new letter, the inbox left unread under it (ticket 86; MailManager.as start 54-61: COMPOSE).
  engine.openMailbox?.({ compose: true });
  s.session = { parcels: outgoingParcels(engine) };
  if (!s.parcels) setStationClip(engine, s, 'interact');
  engine.playSound?.('INTERACT_DISPATCHER', { volume: 0.5 });
  last = 'dispatcher:open';
}

/** mailStop 260-268 (doMailCancel), or sendParcel 316-338 for each letter that went with an item. */
function closeStation(engine) {
  const s = station;
  if (!s?.session) return;
  const sent = Math.max(0, outgoingParcels(engine) - s.session.parcels);
  s.session = null;
  if (sent) {
    const first = !s.parcels;
    s.parcels += sent;
    state.parcels += sent;
    engine.save?.();
    if (first) {
      engine.playSound?.('CONFIRM_DELIVERY', { volume: 0.5 });
      s.parcelState = 0;
      doParcel(engine);
    }
    last = `dispatcher:parcel:${sent}`;
    return;
  }
  if (s.parcels) return;
  setStationClip(engine, s, 'cancel', () => {
    if (station === s && !s.session && !s.parcels) setStationClip(engine, s, 'idle');
  });
  engine.playSound?.('CANCEL_DISPATCHER', { volume: 0.5 });
  last = 'dispatcher:cancel';
}

/** doParcel 208-258. */
function doParcel(engine) {
  const s = station;
  if (!s) return;
  switch (s.parcelState) {
    case 0:
      setStationClip(engine, s, 'prepare_package');
      s.parcelState = 1;
      later(s, PARCEL.prepareMs, () => doParcel(engine));
      engine.playSound?.('WAITING_FOR_FROG', { volume: 0.35 });
      break;
    case 1:
      setStationClip(engine, s, 'waiting_for_frog');
      s.parcelState = 2;
      later(s, PARCEL.waitingMs, () => doParcel(engine));
      break;
    case 2:
      s.parcelState = 3;
      spawnPickup(engine, s);
      break;
    case 3:
      setStationClip(engine, s, 'package_sent');
      s.parcelState = 4;
      later(s, PARCEL.sentMs, () => doParcel(engine));
      engine.playSound?.('PACKAGE_SENT', { volume: 0.5 });
      break;
    default:
      setStationClip(engine, s, 'idle');
      if (s.parcels > 0) s.parcels -= 1;
      last = 'dispatcher:sent';
      if (s.parcels) {
        s.parcelState = 0;
        later(s, PARCEL.nextMs, () => doParcel(engine));
      }
      break;
  }
}

/** doParcel case 2 + startPickup 721-728 + doPickup 260-292. */
function spawnPickup(engine, s) {
  if (pickup) removeFrog(engine, pickup);
  const sx = s.sprite.x;
  const sy = s.sprite.y;
  const f = makeFrog(engine, 'pickup', sx + PARCEL.frogDx, sy + PARCEL.frogDy, false);
  pickup = f;
  f.mode = 'pickup';
  setFrogClip(engine, f, 'move');
  faceTo(f, sx);
  moveTo(f, sx, sy + PARCEL.arriveDy, PARCEL.arriveSpeed, () => {
    doParcel(engine);
    setFrogClip(engine, f, 'moveEnd');
    later(f, PARCEL.moveEndMs, () => {
      f.box = true;
      setFrogClip(engine, f, 'idle');
      later(f, PARCEL.boxMs, () => {
        setFrogClip(engine, f, 'moveStart');
        faceTo(f, f.x + PARCEL.outDx);
        moveTo(f, f.x + PARCEL.outDx, f.y + PARCEL.outDy, PARCEL.outSpeed, () => {
          setFrogClip(engine, f, 'move');
          moveTo(f, f.x + PARCEL.awayDx, f.y + PARCEL.awayDy, PARCEL.awaySpeed, () => {
            removeFrog(engine, f);
            if (pickup === f) pickup = null;
          });
        });
      });
    });
  });
}

/** Report 153: the owner put it away (homes-feature answers on their own home street). */
function stationAway(engine) {
  return engine.query?.('homeDispatcherAway', engine) === true;
}

/** Report 153: a parcel run or the Send mail window holds it on the street (no Put away until it ends). */
function stationBusy() {
  return Boolean(station && (station.parcels > 0 || station.session || pickup));
}

function tickStation(engine) {
  const t = now();
  if (t - lastStationScan > 400) {
    lastStationScan = t;
    const home = homeStreet(engine);
    const away = home && stationAway(engine);
    const mailbox = home && !away ? homeMailbox(engine) : null;
    if (station && (!home || away || station.sprite?.destroyed)) clearStation(engine);
    if (!station && mailbox) station = spawnStation(engine, mailbox);
    // A left yard expansion moves the house and its Mailbox (homes-feature homeRoomShifted).
    if (station && mailbox) station.sprite.x = stationX(engine, mailbox);
  }
  if (!station) return;
  runTimers(station);
  if (station.session && !engine.mailboxOpen?.()) closeStation(engine);
}

function clearStation(engine) {
  if (!station) return;
  if (station.target) engine.unregister?.(station.target);
  station = null;
  if (pickup) {
    removeFrog(engine, pickup);
    pickup = null;
  }
}

/* ------------------------------------------------------------------ demo / autoplay */

function autoplayMode(engine) {
  const v = param(engine, 'mailautoplay');
  return v === '1' ? 'full' : v;
}

function demoSetup(engine) {
  if (demoDone) return;
  const demo = param(engine, 'maildemo');
  if (!demo) {
    demoDone = true;
    return;
  }
  if (!engine.started || !engine.player) return;
  if (!demoAt) demoAt = now() + 800;
  if (now() < demoAt) return;
  demoDone = true;
  if (demo === 'courier') {
    // mail_send_special_item 1543-1585 with its default words; inc_imagination.js 1574 sends 5 Awesome Stew.
    const cls = ITEM_CATALOG.awesome_stew ? 'awesome_stew' : 'apple';
    engine.deliverMail?.({ sender: MAIL_POST_SENDER, subject: 'A special delivery', text: "Here's a special delivery just for you!", deliveryAt: now(), attachment: { classTsid: cls, count: 5 } });
    booted = true;
    last = 'demo:courier';
  }
  if (demo === 'auction') {
    // Ticket 74 QA: purchased (and, with mailauctions=N, cancelled and expired) auctions, no site.
    const n = Math.max(1, Math.min(30, Math.floor(Number(param(engine, 'mailauctions')) || 1)));
    const kinds = ['purchased', 'expired', 'cancelled'];
    const classes = ['cherry', 'apple', 'potato', 'meat', 'grain'].filter((c) => ITEM_CATALOG[c]);
    for (let i = 0; i < n; i += 1) {
      const kind = i === 0 ? 'purchased' : kinds[i % kinds.length];
      engine.deliverMail?.({
        sender: AUCTION_SENDER,
        subject: mailSubject(kind),
        text: mailText(kind),
        deliveryAt: now(),
        attachment: { classTsid: classes[i % classes.length] || 'apple', count: i === 0 ? 3 : 1 + (i % 4) },
        auction: kind,
        express: true,
      });
    }
    booted = true;
    last = 'demo:auction';
  }
}

function autoplayTick(engine) {
  const mode = autoplayMode(engine);
  if (!mode || now() < autoAt) return;
  autoAt = now() + 400;
  const demo = param(engine, 'maildemo');
  if ((demo === 'courier' || demo === 'auction') && frog && !talking && !frog.delivered && frog.mode === 'follow' && frog.follow.state === 'idle' && mode !== 'talk-done') {
    if (autoStep === 0 || mode !== 'talk') talkToFrog(engine);
  }
  if (demo === 'dispatcher' && station && !autoStep && busy(engine)) {
    engine.setData?.('mailCourierAutoplay', `wait:${['busy', 'acting', 'questDialogueOpen', 'streetCardUp'].filter((k) => engine[k]?.()).join(',')}`);
  }
  if (demo === 'dispatcher' && station && !autoStep && !busy(engine) && mode === 'putaway') {
    autoStep = 1;
    putAwayStation(engine);
    return;
  }
  if (demo === 'dispatcher' && station && !autoStep && !busy(engine)) {
    autoStep = 1;
    openStation(engine);
    setTimeout(() => fillCompose(engine, mode), 700);
  }
}

function fillCompose(engine, mode) {
  if (typeof document === 'undefined') return;
  const form = document.getElementById('mail-compose-form');
  if (!form) return;
  form.querySelector('select[name="recipient"]').value = 'Amp';
  form.querySelector('textarea[name="text"]').value = 'A little something for the kettle.';
  const pick = form.querySelector('select[name="attachment"] option[value="apple"]') || form.querySelectorAll('select[name="attachment"] option')[1];
  if (pick) form.querySelector('select[name="attachment"]').value = pick.value;
  engine.setData?.('mailCourierAutoplay', 'compose');
  if (mode === 'open') return;
  form.requestSubmit?.();
  setTimeout(() => document.getElementById('mail-close')?.click(), 900);
}

/* ------------------------------------------------------------------ publish */

function publish(engine, force = false) {
  const t = now();
  if (!force && t - lastPublish < 250) return;
  lastPublish = t;
  const f = frog || pickup;
  engine.setData?.('mailCourier', frog ? 'frog' : promptOpen ? 'prompt' : nextAt != null ? 'due' : 'idle');
  engine.setData?.('mailCourierNext', nextAt == null ? '' : String(Math.max(0, nextAt - t)));
  engine.setData?.('mailFrog', f ? `${f.kind}:${f.mode}:${f.clip}` : '');
  engine.setData?.('mailFrogX', f ? String(Math.round(f.x)) : '');
  engine.setData?.('mailFrogY', f ? String(Math.round(f.y)) : '');
  engine.setData?.('mailDispatcher', station ? station.clip : '');
  engine.setData?.('mailParcels', String(state.parcels));
  engine.setData?.('mailCourierDelivered', String(state.delivered));
  engine.setData?.('mailCourierLast', last);
}

/* ------------------------------------------------------------------ feature */

export const mailCourierFeature = {
  id: MAIL_COURIER_FEATURE_ID,

  onStreetClear(engine) {
    // onPlayerExit 538-546: our player left, so the frog leaves; the letter waits for the next call.
    if (frog) {
      removeFrog(engine, frog);
      if (!frog.delivered) {
        nextAt = now() + COURIER.minLeadMs;
        last = 'frog:left-street';
      }
      frog = null;
    }
    talking = false;
    clearStation(engine);
    publish(engine, true);
  },

  onTick(dtMs, t, engine) {
    if (!engine.started || !engine.player) return;
    demoSetup(engine);
    tickStation(engine);
    tickFrog(engine, frog, dtMs);
    tickFrog(engine, pickup, dtMs);
    scheduleTick(engine);
    autoplayTick(engine);
    publish(engine);
  },

  verbsFor(target, engine) {
    if (frog?.target === target) {
      return [{ id: 'talk_to', label: 'Talk to', enabled: !talking, reason: '', tooltip: COURIER_TEXT.talkTip, durationMs: 0 }];
    }
    if (station?.target === target) {
      const parcel = station.parcels > 0;
      const held = stationBusy();
      return [
        { id: 'send_mail', label: COURIER_TEXT.sendMail, enabled: !parcel, reason: parcel ? 'Waiting for the frog.' : '', tooltip: COURIER_TEXT.sendTip, durationMs: 0 },
        // Report 153: its owner can put it away (only the owner ever sees it here).
        { id: 'put_away', label: DISPATCHER_TEXT.putAway, enabled: !held, reason: held ? DISPATCHER_TEXT.putAwayBusy : '', tooltip: DISPATCHER_TEXT.putAwayTitle, durationMs: 0 },
      ];
    }
    return null;
  },

  runVerb(target, verbId, engine) {
    if (verbId === 'talk_to' && frog?.target === target) {
      talkToFrog(engine);
      return true;
    }
    if (verbId === 'send_mail' && station?.target === target) {
      openStation(engine);
      return true;
    }
    if (verbId === 'put_away' && station?.target === target) {
      putAwayStation(engine);
      return true;
    }
    return false;
  },

  /** Report 153: homes-feature asks before Put away (a parcel run or the mail window holds it). */
  mailDispatcherBusy() {
    return stationBusy() ? true : null;
  },

  /** Report 153: homes-feature put it away or out: look again now, not at the next 400 ms scan. */
  mailDispatcherSync(engine) {
    lastStationScan = 0;
    if (engine?.started) tickStation(engine);
    publish(engine, true);
    return true;
  },

  save() {
    return { order: state.order, delivered: state.delivered, parcels: state.parcels };
  },

  restore(slice) {
    state = normalizeCourierState(slice || {});
    booted = false;
  },

  /** QA / tests. */
  _state: () => ({ state, frog, pickup, station, nextAt, promptOpen, talking, last }),
};
