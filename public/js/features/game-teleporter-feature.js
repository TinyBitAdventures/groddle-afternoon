/**
 * The Crown Game Teleporter (G387, items/game_teleporter.js, CC0): the one
 * archived copy stands on The forgotten floor (LDOOSA8V29J24I3.xml objref
 * "Crown Game Teleporter"; its picture is the street's crown_game_teleporter
 * deco, GDOOSA8V29J24I3.xml x 164, y -159, 180 x 203). The objref keeps no
 * x/y, so the remake puts the item on that deco.
 *
 * - Activate (sort 50, "Play a sporrrrrrrrrrrrrrts", 177-205):
 *   ACTIVATE_GAME_TELEPORTER, then "Do you want to play <b>Game of Crowns</b>
 *   for <b>50c</b>?" with Sounds fun! / Maybe another time.
 * - Sounds fun! (onConversation 211-237): 50 currants go; the
 *   game_teleporter_overlay plays at the avatar for 2 s (pc_overlay, width 300,
 *   delta_y 20), the avatar takes hit1 for 3 s, PAY_FIFTY_CURRANTS sounds,
 *   "You are transported to a mystical land of fun and adventure!", and 1 s
 *   later the player joins Game of Crowns (playerJoinInstance it_game: solo,
 *   crowns-feature startCrowns without a ticket). Short of 50: "Oh dear, you
 *   don't have enough currants to play!".
 * - Online (G387) the same question; Sounds fun! asks the realtime server
 *   (crowns-feature crownsMpTeleport, groddle-afternoon-server
 *   crowns_teleporter.go), which takes the 50 currants through the site's
 *   ledger and a second later seats the player in the fullest open game, or
 *   a new one, as the shared instance manager's playerJoinInstance did
 *   (shared_instance_manager.js 36-87, 585-633). The game starts once three
 *   are ready and nobody is still to click (instance.js can_start_game
 *   579-602). The overlay and the words wait for the server's crown_paid.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=GDOOSA8V29J24I3&streetx=1060&streety=600
 *   (&teleporterautoplay=ask stops on the question, =1 pays and goes in;
 *   &teleportercurrants=N sets the purse; &teleporterhold=<ms> freezes the
 *   overlay at that moment and stays). Canvas data: gameTeleporter,
 *   gameTeleporterLast.
 */

import { OVERLAY_USES, playOverlay } from '../overlays.js?v=4e81f749';
import { crownsMpTeleport, startCrowns } from './crowns-feature.js?v=28e9c767';

export const GAME_TELEPORTER_FEATURE_ID = 'game-teleporter';
export const GAME_TELEPORTER_CLASS = 'game_teleporter';
/** The forgotten floor: the street the one archived teleporter stands on. */
export const GAME_TELEPORTER_STREET = 'GDOOSA8V29J24I3';
/** The crown_game_teleporter deco (world x, y = its bottom centre, w, h). */
export const GAME_TELEPORTER_DECO = Object.freeze({ x: 164, y: -159, w: 180, h: 203 });
/** onConversation 213: the price. */
export const GAME_TELEPORTER_PRICE = 50;
/** onConversation 230: join the it_game instance 1 s after paying. */
export const GAME_TELEPORTER_JOIN_MS = 1000;
/** onConversation 226: playHitAnimation('hit1', 3000). */
export const GAME_TELEPORTER_HIT_MS = 3000;

export const GAME_TELEPORTER_TEXT = Object.freeze({
  label: 'Crown Game Teleporter',
  verb: 'Activate',
  tooltip: 'Play a sporrrrrrrrrrrrrrts',
  question: 'Do you want to play <b>Game of Crowns</b> for <b>50c</b>?',
  yes: 'Sounds fun!',
  no: 'Maybe another time',
  paid: 'You are transported to a mystical land of fun and adventure!',
  poor: "Oh dear, you don't have enough currants to play!",
});

/** The teleporter's screen position on a street with these bounds. */
export function teleporterPoint(bounds) {
  return { x: GAME_TELEPORTER_DECO.x - (bounds?.l ?? 0), y: GAME_TELEPORTER_DECO.y - (bounds?.t ?? 0) };
}

/** Pay for one game (onConversation 213): { ok, currants } with the purse after. */
export function payForCrowns(pc) {
  const have = Math.floor(Number(pc?.currants) || 0);
  if (have < GAME_TELEPORTER_PRICE) return { ok: false, currants: have };
  pc.currants = have - GAME_TELEPORTER_PRICE;
  return { ok: true, currants: pc.currants };
}

let target = null;
let sprite = null;
let last = '';
let autoplayDone = false;

function publish(engine) {
  engine.setData?.('gameTeleporter', target ? `${Math.round(sprite.x)},${Math.round(sprite.y)}` : '');
  engine.setData?.('gameTeleporterLast', last);
}

function spawn(engine, street) {
  const { PIXI } = engine;
  const p = teleporterPoint(street.bounds);
  // The picture is the street's own deco; this is its click area (no art of its own).
  const spr = new PIXI.Container();
  spr.x = p.x;
  spr.y = p.y;
  spr._worldHitW = GAME_TELEPORTER_DECO.w;
  spr._worldHitH = GAME_TELEPORTER_DECO.h;
  spr.hitArea = new PIXI.Rectangle(-GAME_TELEPORTER_DECO.w / 2, -GAME_TELEPORTER_DECO.h, GAME_TELEPORTER_DECO.w, GAME_TELEPORTER_DECO.h);
  spr.eventMode = 'static';
  spr.cursor = 'pointer';
  engine.entityLayer.addChild(spr);
  sprite = spr;
  target = engine.register({
    classId: GAME_TELEPORTER_CLASS,
    featureId: GAME_TELEPORTER_FEATURE_ID,
    label: GAME_TELEPORTER_TEXT.label,
    subtitle: GAME_TELEPORTER_TEXT.tooltip,
    sprite: spr,
  });
}

/** onConversation 235-236: conversation_reply with the poor line. */
function poor(engine) {
  last = 'poor';
  engine.scriptedDialogue({ title: GAME_TELEPORTER_TEXT.label, kicker: '', beats: [{ text: GAME_TELEPORTER_TEXT.poor, response: 'OK' }] });
  publish(engine);
}

/** What paying looks like (onConversation 215-231): the overlay at the avatar, hit1, the sound and the line. */
function paidFx(engine, { holdMs = null, text = GAME_TELEPORTER_TEXT.paid } = {}) {
  const use = OVERLAY_USES.game_teleporter_overlay;
  const player = engine.player;
  playOverlay(engine.PIXI, 'game_teleporter_overlay', {
    layer: engine.fxLayer,
    at: () => ({ x: player.x + use.dx, y: player.y + use.dy }),
    wh: use.wh,
    durationMs: use.durationMs,
    loop: use.loop,
    holdMs,
  });
  engine.playHit?.('hit1', GAME_TELEPORTER_HIT_MS);
  engine.playSound?.(use.sound);
  engine.pushActivity({ base: text || GAME_TELEPORTER_TEXT.paid, effects: { currants: -GAME_TELEPORTER_PRICE } });
  engine.updateHud?.();
  engine.save?.();
  last = 'paid';
  publish(engine);
}

function pay(engine, { holdMs = null } = {}) {
  const res = payForCrowns(engine.pc);
  if (!res.ok) {
    poor(engine);
    return false;
  }
  paidFx(engine, { holdMs });
  if (holdMs != null) return true;
  setTimeout(() => {
    Promise.resolve(startCrowns(engine, {})).then((ok) => {
      last = ok ? 'joined' : 'busy';
      publish(engine);
    });
  }, GAME_TELEPORTER_JOIN_MS);
  return true;
}

/**
 * Sounds fun! online: the server decides there were 50 currants (the ledger) and
 * seats the player; the overlay plays when it says the spend went through.
 */
function payOnline(engine) {
  if ((Number(engine.pc?.currants) || 0) < GAME_TELEPORTER_PRICE) {
    poor(engine);
    return false;
  }
  const sent = crownsMpTeleport(engine, {
    onPaid: (paid, text) => paidFx(engine, { text }),
    onRefused: (why, text) => {
      if (why === 'poor') poor(engine);
      else {
        last = `refused:${why}`;
        if (text) engine.toast?.(text, 3200);
        publish(engine);
      }
    },
  });
  last = sent ? 'paying' : 'offline';
  publish(engine);
  return sent;
}

function activate(engine) {
  engine.playSound?.('ACTIVATE_GAME_TELEPORTER');
  last = 'asked';
  publish(engine);
  engine.scriptedDialogue({
    title: GAME_TELEPORTER_TEXT.label,
    kicker: '',
    beats: [{ text: GAME_TELEPORTER_TEXT.question, response: GAME_TELEPORTER_TEXT.yes }],
    cancelable: true,
    cancelLabel: GAME_TELEPORTER_TEXT.no,
    onComplete: () => (engine.mode === 'multiplayer' ? payOnline(engine) : pay(engine)),
    onCancel: () => {
      last = 'declined';
      publish(engine);
    },
  });
}

function autoplay(engine) {
  const mode = engine.param?.('teleporterautoplay');
  if (!mode || autoplayDone || !target) return;
  autoplayDone = true;
  const purse = engine.param?.('teleportercurrants');
  if (purse != null && purse !== '') {
    engine.pc.currants = Math.max(0, Math.floor(Number(purse) || 0));
    engine.updateHud?.();
  }
  setTimeout(() => {
    if (mode === 'ask') activate(engine);
    else if (mode === '1') {
      const hold = engine.param?.('teleporterhold');
      pay(engine, { holdMs: hold ? Number(hold) || 0 : null });
    }
  }, 900);
}

export const gameTeleporterFeature = {
  id: GAME_TELEPORTER_FEATURE_ID,

  onStreetEnter(street, engine) {
    if (engine.streetTsid === GAME_TELEPORTER_STREET && street?.bounds) {
      spawn(engine, street);
      autoplay(engine);
    }
    publish(engine);
  },

  onStreetClear(engine) {
    if (target) engine.unregister?.(target);
    if (sprite && !sprite.destroyed) sprite.destroy();
    target = null;
    sprite = null;
  },

  verbsFor(t) {
    if (t?.classId !== GAME_TELEPORTER_CLASS) return [];
    return [{ id: 'activate', label: GAME_TELEPORTER_TEXT.verb, sort: 50, enabled: true, tooltip: GAME_TELEPORTER_TEXT.tooltip, durationMs: 0 }];
  },

  runVerb(t, verbId, engine) {
    if (t?.classId !== GAME_TELEPORTER_CLASS || verbId !== 'activate') return false;
    activate(engine);
    return true;
  },
};
