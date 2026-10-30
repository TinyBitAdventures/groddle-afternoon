/**
 * Overworld Juju Bandits as a feature module (see js/feature-host.js;
 * rules and copy in js/juju-bandits.js).
 *
 * A Dust Trap that pays out in a Savanna hub (Baqala, Choru, Zhambu,
 * Xalanga) may bring a Juju Bandit 1 s later (dust_trap.js, juju_bandit_curse):
 * while Carry That Weight is new, half the time, and that Juju wants your help
 * rather than your stuff. It appears 250 px away ("One of the notorious Juju
 * Bandits has appeared, and he… needs your help?"), declares, follows once you
 * move, and when it reaches you (50 x 50 px) offers the quest. Accept and it
 * shrinks away; say no and it rage quits ("You haven't seen the last of the
 * Juju Bandits!", juju_bandits/escaped). Leaving the street mid-chase counts
 * as an escape too (onPlayerExit -> rageQuit).
 *
 * Otherwise the Juju is a thief (the same chase, then one item taken, or a
 * rage quit when you stand by a signpost), and its chance comes from the
 * Ancestral Lands clock (baqala_times, js/juju-bandits.js): none under 3 min,
 * 10% rising to 35% by 8 min, every payout from 9 min. The clock counts real
 * play time in the Savanna hubs, loses half the time you spend away when you
 * come back, clamps 600+ s to 585 s on entry, and survives a reload (the
 * source kept it on the player; a reload in the Savanna is a relog, so no
 * decay).
 *
 * G39 / G151 (Austin 2026-10-27, reversing 10-22): the visit is limited again
 * (js/ancestral-nostalgia.js). Entering the Savanna applies Overwhelming
 * Ancestral Nostalgia with the source's activity line; the buff's time left
 * is its full length (10 min, 11 with Prepared For Ancestral Nostalgia I, 12
 * with II) minus the clock, so the cards, the Dust Trap remnants
 * (give_baqala_time 10 to 60 s) and Ancestral Spirits (300 s, once a visit)
 * move both. When it runs out in the Savanna: Overwhelmed by Ancestral
 * Nostalgia (30 min, counts while away), the clock starts over, and you are
 * sent to one of the 26 do_baqala_boot streets at a signpost or door that
 * leads there; the first time, the "Overwhelmed!" prompt explains. Coming back
 * while overwhelmed shows the other "Overwhelmed!" prompt and sends you away
 * again. The kick waits while you are in a quest room or scene, a dialogue
 * or a verb (the source sent you mid-anything).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&streetdemo=<Savanna street>
 *   &jujudemo=offer|steal   a Juju appears 1 s after load (offer needs the quest new)
 *   &jujuroll=0..1          the dust_trap.js roll for real Dust Trap triggers
 *   &jujutime=<seconds>     preset the Ancestral Lands clock on the first street
 *   &jujuitem=<class>       the item a stealing Juju wants (default: the first it finds)
 *   &jujuautoplay=accept|decline  answer the offer
 *   &nostalgiademo=<seconds>  Ancestral Nostalgia has this long left on the first
 *                           Savanna street (1 = 20 s); =overwhelmed starts you
 *                           overwhelmed (the entry prompt, then the kick)
 *   &nostalgiadest=<tsid>   where the kick sends you (one of the 26)
 * Canvas data: jujuState, jujuMode, jujuItem, jujuLast, jujuEscaped, jujuX,
 *   jujuAncestralSeconds, jujuAncestralInside, jujuStealChance (the curve now;
 *   0 outside the Savanna), nostalgiaState (''|inside|overwhelmed|booting),
 *   nostalgiaLeft (seconds), nostalgiaLimit, nostalgiaKicks, nostalgiaLast,
 *   nostalgiaPotion (1 once Ancestral Spirits is used this visit).
 */

import { addItem, removeItem, countItem } from '../inventory.js?v=85d4faba';
import { acceptOffer, npcQuestOffers, questStatus } from '../quest-offers.js?v=6b6cbf22';
import { groundBeneath, platformYAt, platformsScreen } from '../street-model.js?v=77584eff';
import { sheetFrames } from '../quest-rooms/kit.js?v=fd1eb817';
import {
  JUJU_BANDIT,
  JUJU_QUEST,
  JUJU_SHEETS,
  JUJU_PLAYER_LABEL,
  JUJU_SHEET_COLS,
  JUJU_TEXT,
  ancestralClock,
  ancestralEnter,
  ancestralLeave,
  ancestralSeconds,
  ancestralTick,
  isSavannaHub,
  jujuAnchor,
  jujuCurse,
  jujuLine,
  jujuSheetUrl,
  jujuSpawnPoint,
  jujuWants,
  nearSignpost,
  redeclareDelay,
  stealChanceForSeconds,
  withinReach,
} from '../juju-bandits.js?v=6cf92f4f';
import {
  NOSTALGIA_BUFF,
  NOSTALGIA_TEXT,
  OVERWHELMED_BUFF,
  NOSTALGIA,
  buffLeftSeconds,
  giveBaqalaTime,
  nostalgiaLimitSeconds,
  pickBootTarget,
  resetBaqalaTimes,
} from '../ancestral-nostalgia.js?v=5adf3c9d';
import { NOSTALGIA_BOOT_STREETS } from '../ancestral-nostalgia-data.js?v=0adb9184';
import { itemZ } from '../item-bands.js?v=e98b10bc';

export const JUJU_FEATURE_ID = 'juju-bandits';
/** npc_juju_bandit is a foreground item (item-bands.js). */
const Z = itemZ('npc_juju_bandit', 4);
const FPS_SPEED = 0.5; // 30 fps sheets on a 60 fps ticker
/** The tallest lip it walks up (it never jumps; apiFindPath had npc_can_jump false). */
const STEP_UP = 30;

let bandit = null;
let pendingCurseAt = 0;
let escaped = 0;
let last = '';
let demoDone = false;
let platforms = [];
let demoMode = null;
/** baqala_times: the Ancestral Lands clock. */
let clock = ancestralClock();
/** The save said we were inside: the first street is a login (region_login), not a walk in. */
let relog = false;
let presetDone = false;
let lastTickAt = 0;
let publishedSecond = -1;
/**
 * Ancestral Nostalgia (js/ancestral-nostalgia.js), saved beside the clock:
 * kicks, the once-only exit prompt (too_much_nostalgia_prompt: the source
 * never clears it, since overwhelmed_prompt_callback tests the flag the wrong
 * way round, inc_special_locations.js 242-246), overwhelmed (so
 * too_much_nostalgia's on_remove runs even when it ran out while away) and
 * potion_used (Ancestral Spirits once a visit).
 */
let nostalgia = freshNostalgia();
/** A kick waiting for a free moment: { reason: 'expired'|'overwhelmed', nextAt }. */
let pendingBoot = null;
/** on_overwhelmed_prompt: the entry prompt is up. */
let enterPromptUp = false;
let nostalgiaLast = '';
let nostalgiaPresetDone = false;
let publishedLeft = null;
/** start_baqala_buff's sendActivity, due at this time (0: none). */
let warnAt = 0;
const WARN_DELAY_MS = 1500;

function freshNostalgia() {
  return { kicks: 0, exitPromptShown: false, overwhelmed: false, potionUsed: false };
}

const pcLabel = () => JUJU_PLAYER_LABEL;

function questCtx(engine) {
  return {
    level: engine.pc.level,
    xp: engine.pc.xp,
    skills: engine.learnedSkills,
    achievements: engine.unlockedAchievements,
    inv: engine.inv,
    pc: engine.pc,
    hub: engine.street?.hubId || '',
    now: Date.now(),
  };
}

function publish(engine) {
  engine.setData('jujuState', bandit ? bandit.state : '');
  engine.setData('jujuMode', bandit ? bandit.mode : '');
  engine.setData('jujuItem', bandit?.itemClass || '');
  engine.setData('jujuLast', last);
  engine.setData('jujuEscaped', escaped);
  engine.setData('jujuX', bandit ? Math.round(bandit.x) : '');
  engine.setData('jujuY', bandit ? Math.round(bandit.y) : '');
  publishClock(engine);
}

/** The steal chance dust_trap.js would roll right now (0 outside the Savanna). */
const stealChanceNow = () => (clock.inside ? stealChanceForSeconds(ancestralSeconds(clock)) : 0);

function publishClock(engine) {
  const sec = Math.floor(ancestralSeconds(clock));
  publishedSecond = sec;
  engine.setData('jujuAncestralSeconds', sec);
  engine.setData('jujuAncestralInside', clock.inside ? 1 : 0);
  engine.setData('jujuStealChance', stealChanceNow());
  publishNostalgia(engine);
}

/* ------------------------------------------------------------------ */
/* Ancestral Nostalgia (js/ancestral-nostalgia.js)                      */
/* ------------------------------------------------------------------ */

/** The buff tray shows no icon for it: no item_class and not a debuff (BuffUI.as setIcon 156-173). */
const NOSTALGIA_ICON = 'assets/ui/buff-none.svg';
const HELD_BY = 'ancestral-lands';
const RETRY_MS = 3000;

const ownedCards = (engine) => (Array.isArray(engine?.pc?.imaginationUpgrades) ? engine.pc.imaginationUpgrades : []);
const buffOn = (engine, id) => (typeof engine?.hasBuff === 'function' ? Boolean(engine.hasBuff(id)) : false);
const inSavanna = (engine) => isSavannaHub(engine?.street?.hubId);
const nostalgiaLeft = (engine) => buffLeftSeconds(ancestralSeconds(clock), ownedCards(engine));

function nostalgiaState(engine) {
  if (pendingBoot) return 'booting';
  if (buffOn(engine, OVERWHELMED_BUFF)) return 'overwhelmed';
  return clock.inside && inSavanna(engine) ? 'inside' : '';
}

function publishNostalgia(engine) {
  const left = clock.inside ? Math.max(0, Math.ceil(nostalgiaLeft(engine))) : '';
  publishedLeft = left;
  engine.setData('nostalgiaState', nostalgiaState(engine));
  engine.setData('nostalgiaLeft', left);
  engine.setData('nostalgiaLimit', nostalgiaLimitSeconds(ownedCards(engine)));
  engine.setData('nostalgiaKicks', nostalgia.kicks);
  engine.setData('nostalgiaLast', nostalgiaLast);
  engine.setData('nostalgiaPotion', nostalgia.potionUsed ? 1 : 0);
}

/**
 * Keep the tray's Overwhelming Ancestral Nostalgia on the clock: its time
 * left is the full length minus the clock (never under a second, so the
 * tray's own expiry never beats the kick), and it cannot be ended by hand.
 */
function syncNostalgiaBuff(engine, now, { quiet = true } = {}) {
  if (typeof engine?.applyBuff !== 'function') return;
  const left = nostalgiaLeft(engine);
  if (left <= 0) return;
  if (!buffOn(engine, NOSTALGIA_BUFF)) engine.applyBuff('ancestral_nostalgia', { quiet });
  const row = engine.buffRow?.(NOSTALGIA_BUFF);
  if (!row) return;
  row.expiresAt = now + Math.max(1000, Math.round(left * 1000));
  row.heldBy = HELD_BY;
  row.iconUrl = NOSTALGIA_ICON;
}

function holdOverwhelmed(engine) {
  const row = engine?.buffRow?.(OVERWHELMED_BUFF);
  if (row) row.heldBy = HELD_BY;
}

/** too_much_nostalgia on_remove: reset_baqala_times (also when it ran out while you were away). */
function syncOverwhelmed(engine) {
  if (!nostalgia.overwhelmed || typeof engine?.hasBuff !== 'function') return;
  if (engine.hasBuff(OVERWHELMED_BUFF)) {
    holdOverwhelmed(engine);
    return;
  }
  nostalgia.overwhelmed = false;
  if (!clock.inside) resetBaqalaTimes(clock);
  nostalgiaLast = 'recovered';
}

/** check_baqala_boot / the entry prompt's OK: send you away at the next free moment. */
function requestBoot(reason) {
  if (!pendingBoot) pendingBoot = { reason, nextAt: 0 };
}

/** Never mid-room, mid-dialogue or mid-verb (the source teleported you whatever you were doing). */
function canBootNow(engine) {
  if (!engine?.street || !inSavanna(engine)) return false;
  if (engine.inScene?.() || engine.transientInstance?.()) return false;
  if (engine.questDialogueOpen?.() || engine.acting?.()) return false;
  return true;
}

function bootTarget(engine) {
  const forced = engine.param?.('nostalgiadest');
  const rows = forced ? NOSTALGIA_BOOT_STREETS.filter((r) => r.tsid === forced || r.source === forced) : [];
  const exists = (tsid) => (typeof engine?.streetExists === 'function' ? engine.streetExists(tsid) : true);
  return pickBootTarget(rows.length ? rows : NOSTALGIA_BOOT_STREETS, { exists });
}

function showNostalgiaPrompt(engine, text, onChoice = null) {
  if (typeof engine?.prompt !== 'function') {
    onChoice?.('ok');
    return;
  }
  engine.prompt({
    modal: true,
    title: NOSTALGIA_TEXT.title,
    text,
    choices: [{ value: 'ok', label: NOSTALGIA_TEXT.ok }],
    onChoice,
  });
}

/**
 * do_baqala_boot: too_much_nostalgia (check_baqala_boot applies it when the
 * buff ran out), reset_baqala_times, then a teleport to one of the 26
 * streets at a signpost or door that leads there. The first time, the exit
 * prompt (savanna_on_exit) once you land.
 */
function boot(engine, now) {
  const { reason } = pendingBoot;
  const target = bootTarget(engine);
  if (!target) {
    pendingBoot = null;
    nostalgiaLast = 'boot:no_target';
    return;
  }
  if (reason !== 'retry') {
    resetBaqalaTimes(clock);
    publishedSecond = -1;
    if (buffOn(engine, NOSTALGIA_BUFF)) engine.removeBuff?.(NOSTALGIA_BUFF);
    if (!buffOn(engine, OVERWHELMED_BUFF)) engine.applyBuff?.('too_much_nostalgia');
    holdOverwhelmed(engine);
    nostalgia.overwhelmed = true;
    nostalgia.potionUsed = false;
    nostalgia.kicks += 1;
  }
  pendingBoot = { reason: 'retry', nextAt: Infinity };
  nostalgiaLast = `boot:${reason}:${target.tsid}`;
  engine.save?.();
  publishNostalgia(engine);
  Promise.resolve(engine.travel?.(target.tsid, { arrive: target.arrive, label: target.label, via: 'nostalgia' }))
    .then((res) => {
      if (res && res.ok === false) {
        // Still in the Savanna (a travel gate, a failed load): try again shortly.
        pendingBoot = { reason: 'retry', nextAt: Date.now() + RETRY_MS };
        nostalgiaLast = `boot:failed:${res.reason || ''}`;
        publishNostalgia(engine);
        return;
      }
      pendingBoot = null;
      nostalgiaLast = `kicked:${target.tsid}`;
      if (!nostalgia.exitPromptShown) {
        nostalgia.exitPromptShown = true;
        showNostalgiaPrompt(engine, NOSTALGIA_TEXT.kicked);
      }
      engine.save?.();
      publishNostalgia(engine);
    }, () => {
      pendingBoot = { reason: 'retry', nextAt: Date.now() + RETRY_MS };
    });
}

/** QA presets on the first street: &jujutime, &nostalgiademo. */
function applyPresets(engine, savanna) {
  const preset = engine.param('jujutime');
  if (!presetDone && preset !== null && Number.isFinite(Number(preset))) {
    clock.spent = Math.max(0, Number(preset));
    clock.exitAt = null;
  }
  presetDone = true;
  const demo = engine.param('nostalgiademo');
  if (nostalgiaPresetDone || demo === null || !savanna || !clock.inside) return;
  nostalgiaPresetDone = true;
  const leftWanted = demo === '1' || demo === '' ? 20 : Number(demo);
  if (Number.isFinite(leftWanted) && leftWanted > 0) {
    clock.spent = Math.max(0, nostalgiaLimitSeconds(ownedCards(engine)) - leftWanted);
    clock.exitAt = null;
  }
}

/** region_on_enter / region_login for the Savanna (locations/inc_regions.js, savanna.js). */
function trackRegion(street, engine, now) {
  const savanna = isSavannaHub(street?.hubId);
  const wasInside = clock.inside;
  const login = relog;
  // QA: start overwhelmed (as after a kick, with its prompt already seen).
  if (!nostalgiaPresetDone && engine.param('nostalgiademo') === 'overwhelmed') {
    nostalgiaPresetDone = true;
    if (!buffOn(engine, OVERWHELMED_BUFF)) engine.applyBuff?.('too_much_nostalgia', { quiet: true });
    resetBaqalaTimes(clock);
    relog = false;
    nostalgia.overwhelmed = true;
    nostalgia.exitPromptShown = true;
  }
  syncOverwhelmed(engine);
  const overwhelmed = buffOn(engine, OVERWHELMED_BUFF);
  if (relog) {
    relog = false;
    // Logged out in the Savanna (leave_savanna(true)): logging back in there
    // starts again without decay; landing anywhere else counts as walking out now.
    if (savanna && !overwhelmed) ancestralEnter(clock, now);
    else if (!savanna) {
      clock.loggedOut = false;
      clock.exitAt = now;
    }
  } else if (savanna && !clock.inside && !overwhelmed) ancestralEnter(clock, now);
  else if (!savanna && clock.inside) ancestralLeave(clock, now, false);
  applyPresets(engine, savanna);
  lastTickAt = now;

  if (savanna && overwhelmed) {
    // savanna_on_enter 6-18: "Oh, this is too much!" and OK sends you away (no clock, no buff).
    nostalgiaLast = 'overwhelmed';
    if (!enterPromptUp && !pendingBoot) {
      enterPromptUp = true;
      showNostalgiaPrompt(engine, NOSTALGIA_TEXT.tooMuch, () => {
        enterPromptUp = false;
        requestBoot('overwhelmed');
      });
    }
  } else if (savanna && (!wasInside || login)) {
    // start_baqala_buff: the buff (shortened by the clock) and its line.
    if (nostalgiaLeft(engine) > 0) syncNostalgiaBuff(engine, now, { quiet: login });
    // The line lands after the travel's own "Arrived:" line, so it stays in view.
    warnAt = now + WARN_DELAY_MS;
    nostalgiaLast = login ? 'login' : 'entered';
  } else if (!savanna) {
    if (wasInside) {
      // leave_savanna: the buff goes and potion_used is forgotten.
      nostalgia.potionUsed = false;
      nostalgiaLast = 'left';
    }
    // Out of the Savanna, a kick still waiting is moot (not the one under way).
    if (pendingBoot && pendingBoot.nextAt !== Infinity) pendingBoot = null;
    if (buffOn(engine, NOSTALGIA_BUFF)) engine.removeBuff?.(NOSTALGIA_BUFF);
  }
}

/* ------------------------------------------------------------------ */
/* View                                                                 */
/* ------------------------------------------------------------------ */

function setState(engine, name) {
  if (!bandit) return;
  bandit.state = name;
  const def = JUJU_SHEETS[name];
  const url = jujuSheetUrl(bandit.variant, bandit.bandana, name);
  const sheet = (bandit.sheets[name] ||= sheetFrames(engine.PIXI, url, JUJU_SHEET_COLS, Math.ceil(def.frames / JUJU_SHEET_COLS), def.frames));
  const spr = bandit.sprite;
  const a = jujuAnchor(name);
  const apply = () => {
    if (!bandit || bandit.sprite !== spr || spr.destroyed || bandit.state !== name || !sheet.frames.length) return;
    spr.anchor.set(a.x, a.y);
    spr.textures = sheet.frames;
    spr.loop = def.loop;
    spr.onComplete = null;
    if (def.loop && def.loopFrom) {
      // npc_juju_bandit.as loop_froms: the walk loops back to frame 8.
      spr.onFrameChange = (f) => { if (f === def.frames - 1) spr.gotoAndPlay(def.loopFrom); };
    } else spr.onFrameChange = null;
    spr.gotoAndPlay(0);
  };
  if (sheet.frames.length) apply();
  else bandit.waiting = { name, apply, sheet };
  publish(engine);
  engine.setData('jujuState', name);
}

function dropView() {
  if (!bandit) return;
  for (const obj of [bandit.sprite, bandit.hit]) {
    if (obj && !obj.destroyed) {
      obj.parent?.removeChild(obj);
      obj.destroy({ children: true });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Behaviour (npc_juju_bandit.js)                                       */
/* ------------------------------------------------------------------ */

function say(engine, text, ms = 4000) {
  if (bandit?.hit) engine.say(bandit.talker, text, ms);
}

function spawn(engine, { mode, itemClass, now = Date.now() }) {
  const { PIXI } = engine;
  const p = engine.player;
  const street = engine.street;
  const width = street.bounds.r - street.bounds.l;
  platforms = platformsScreen(street);
  // apiGetPointOnTheClosestPlatformLineBelow(x, pc.y - 800), then apiFindPath to
  // the player. The remake's Juju only walks and drops (no pathfinder), so it
  // appears on the floor nearest your own level (falling back to the source
  // point), and only where it can walk to you: jujuSpawnPoint skips ledges.
  const feet = { x: p.x, y: groundBeneath(platforms, p.x, p.y, 6)?.y ?? p.y };
  const spot = jujuSpawnPoint(feet, width, {
    spawnFloor: (sx) => (floorNear(platforms, sx, feet.y) || groundBeneath(platforms, sx, feet.y - JUJU_BANDIT.spawnSearchUp, 0))?.y ?? null,
    groundAhead: (gx, gy) => groundBeneath(platforms, gx, gy, STEP_UP)?.y ?? null,
    stepUp: STEP_UP,
  });
  if (!spot) {
    last = 'no-juju:no-reachable-spot';
    publish(engine);
    return false;
  }
  const { x } = spot;
  const ground = { y: spot.y };
  const variant = JUJU_BANDIT.variants[Math.floor(Math.random() * 3)];
  const bandana = JUJU_BANDIT.bandanas[Math.floor(Math.random() * 3)];
  const sprite = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  sprite.animationSpeed = FPS_SPEED;
  sprite.zIndex = Z;
  sprite.x = x;
  sprite.y = ground.y;
  engine.entityLayer.addChild(sprite);
  // A body-sized stand-in so bubbles sit on the Juju, not its 254 px frame.
  const hit = new PIXI.Container();
  hit.x = x;
  hit.y = ground.y;
  hit.eventMode = 'none';
  const g = new PIXI.Graphics();
  g.rect(-28, -76, 56, 76).fill({ color: 0xffffff, alpha: 0.001 });
  hit.addChild(g);
  engine.entityLayer.addChild(hit);
  bandit = {
    mode,
    itemClass,
    variant,
    bandana,
    x,
    y: ground.y,
    dir: p.x < x ? -1 : 1,
    sprite,
    hit,
    talker: { sprite: hit, label: JUJU_BANDIT.label },
    sheets: {},
    state: '',
    spawning: true,
    playerStartX: p.x,
    readyToSteal: false,
    done: false,
    walkTo: null,
    at: { alert: now + JUJU_BANDIT.alertMs, declare: now + JUJU_BANDIT.declareMs, follow: 0, escape: 0, gone: 0 },
  };
  sprite.scale.x = bandit.dir;
  setState(engine, 'spawn');
  engine.playSound?.('JUJU_BANDIT_SPAWN', { volume: 0.5 });
  last = `appeared:${mode}`;
  publish(engine);
  return true;
}

/** The platform at x whose top is nearest feet height y (within 160 px), or null. */
function floorNear(list, x, y) {
  let best = null;
  for (const p of list) {
    const py = platformYAt(p, x, 0);
    if (py == null || Math.abs(py - y) > 160) continue;
    if (!best || Math.abs(py - y) < Math.abs(best.y - y)) best = { y: py, platform: p };
  }
  return best;
}

function stopMoving(engine) {
  if (!bandit) return;
  bandit.walkTo = null;
  setState(engine, bandit.state === 'walk' ? 'walk_end' : 'idle1');
}

function escape(engine, now) {
  if (!bandit) return;
  bandit.at = { alert: 0, declare: 0, follow: 0, escape: 0, gone: now + JUJU_BANDIT.shrinkMs };
  bandit.walkTo = null;
  setState(engine, 'shrink');
  engine.playSound?.('JUJU_BANDIT_SHRINK', { volume: 0.5 });
}

function rageQuit(engine, now, reason = 'declined') {
  if (!bandit) return;
  say(engine, JUJU_TEXT.rageQuit, 3500);
  bandit.done = true;
  bandit.walkTo = null;
  bandit.at = { alert: 0, declare: 0, follow: 0, escape: now + JUJU_BANDIT.rageQuitMs, gone: 0 };
  escaped += 1;
  engine.achievement('juju_bandits:escaped', 1);
  setState(engine, 'idle2');
  last = `rage_quit:${reason}`;
  engine.save();
}

function giveQuest(engine, now) {
  if (!bandit?.readyToSteal || bandit.done) return;
  bandit.done = true;
  bandit.at.follow = 0;
  bandit.at.declare = 0;
  stopMoving(engine);
  const card = npcQuestOffers(engine.questState, JUJU_BANDIT.classTsid, engine.pc, questCtx(engine)).offered.find((c) => c.classTsid === JUJU_QUEST);
  if (!card) {
    rageQuit(engine, now, 'no_offer');
    return;
  }
  last = 'offering';
  publish(engine);
  let answered = false;
  const finish = (accepted) => {
    if (answered) return;
    answered = true;
    if (bandit) bandit.offerOpen = false;
    const t = Date.now();
    if (accepted) {
      const result = acceptOffer(engine.questState, JUJU_QUEST, questCtx(engine));
      if (result.ok) {
        engine.pushActivity(`New quest: ${card.def.title}`);
        engine.refreshPack();
        engine.save();
        last = 'accepted';
        escape(engine, t);
        publish(engine);
        return;
      }
    }
    // onConversationEnding with no quest: rageQuit.
    rageQuit(engine, t);
    publish(engine);
  };
  bandit.offerOpen = true;
  engine.offerQuestDialogue({
    title: card.def.title,
    kicker: JUJU_BANDIT.label,
    beats: card.beats,
    acceptLabel: card.acceptLabel,
    declineLabel: card.declineLabel,
    onAccept: () => finish(true),
    onDecline: () => finish(false),
  });
  bandit.finishOffer = finish;
  const auto = engine.param('jujuautoplay');
  if (auto === 'accept') setTimeout(() => engine.acceptOpenOffer(), 600);
  if (auto === 'decline') setTimeout(() => finish(false), 600);
}

function stealItem(engine, now) {
  if (!bandit?.readyToSteal || bandit.done) return;
  const p = engine.player;
  const street = engine.street;
  const signposts = (street.signposts || []).map((s) => ({ x: s.x - street.bounds.l, y: s.y - street.bounds.t }));
  if (nearSignpost(p.x, p.y, signposts)) {
    rageQuit(engine, now, 'signpost');
    return;
  }
  // takeItemsFromBag: none left -> switchTargets (a ground stack) -> rageQuit.
  if (countItem(engine.inv, bandit.itemClass) < 1) {
    rageQuit(engine, now, 'nothing');
    return;
  }
  removeItem(engine.inv, bandit.itemClass, 1);
  engine.refreshPack();
  bandit.done = true;
  bandit.walkTo = null;
  bandit.at = { alert: 0, declare: 0, follow: 0, escape: now + JUJU_BANDIT.stealEscapeMs, gone: 0 };
  engine.pushActivity(jujuLine(JUJU_TEXT.stolen, pcLabel(engine), bandit.itemClass));
  setState(engine, 'swipe');
  say(engine, JUJU_TEXT.gotIt, 3000);
  last = `stole:${bandit.itemClass}`;
  engine.save();
}

function act(engine, now) {
  if (bandit.mode === 'offer') giveQuest(engine, now);
  else stealItem(engine, now);
}

function makeDeclaration(engine, now) {
  bandit.at.follow = 0;
  stopMoving(engine);
  const p = engine.player;
  if (withinReach(p, bandit) && !bandit.spawning) {
    act(engine, now);
    return;
  }
  const pool = bandit.mode === 'offer' ? JUJU_TEXT.offerLines : JUJU_TEXT.stealLines;
  say(engine, jujuLine(pool[Math.floor(Math.random() * pool.length)], pcLabel(engine), bandit.itemClass));
  bandit.at.follow = now + JUJU_BANDIT.followAfterDeclareMs;
  bandit.at.declare = now + redeclareDelay();
}

function targetFollow(engine, now) {
  bandit.readyToSteal = true;
  const p = engine.player;
  if (bandit.spawning) {
    if (Math.abs(p.x - bandit.playerStartX) <= JUJU_BANDIT.spawnMoveTolerance) {
      bandit.at.follow = now + JUJU_BANDIT.spawnRetryMs;
      return;
    }
    bandit.spawning = false;
  }
  if (withinReach(p, bandit)) {
    act(engine, now);
    return;
  }
  bandit.walkTo = p.x;
  bandit.at.follow = now + JUJU_BANDIT.followMs;
}

function walk(engine, dtMs) {
  if (bandit.walkTo == null) return;
  const dx = bandit.walkTo - bandit.x;
  if (Math.abs(dx) < 4) {
    stopMoving(engine);
    return;
  }
  const dir = Math.sign(dx);
  const step = Math.min(Math.abs(dx), (JUJU_BANDIT.walkSpeed * dtMs) / 1000) * dir;
  const nx = bandit.x + step;
  // npc_can_climb / can_fall, no jumping: follow the ground, stop at a wall of a step.
  const ground = groundBeneath(platforms, nx, bandit.y, STEP_UP);
  if (!ground || ground.y < bandit.y - STEP_UP) {
    stopMoving(engine);
    return;
  }
  bandit.x = nx;
  bandit.y = ground.y;
  if (bandit.dir !== dir) {
    bandit.dir = dir;
    bandit.sprite.scale.x = dir;
  }
  if (bandit.state !== 'walk') setState(engine, 'walk');
}

/** Every frame: the buff on the clock, the kick when it runs out, too_much_nostalgia's end. */
function tickNostalgia(engine, now) {
  if (warnAt && now >= warnAt) {
    warnAt = 0;
    if (clock.inside && inSavanna(engine)) engine.pushActivity?.(NOSTALGIA_TEXT.enter);
  }
  if (clock.inside) {
    if (nostalgiaLeft(engine) > 0) syncNostalgiaBuff(engine, now);
    else if (inSavanna(engine)) requestBoot('expired');
    else {
      // Out of time in a quest room or scene: the tray holds at a second until you are back.
      const row = engine.buffRow?.(NOSTALGIA_BUFF);
      if (row) row.expiresAt = now + 1000;
    }
  }
  syncOverwhelmed(engine);
  if (pendingBoot && now >= pendingBoot.nextAt && canBootNow(engine)) boot(engine, now);
  if (clock.inside && Math.max(0, Math.ceil(nostalgiaLeft(engine))) !== publishedLeft) publishNostalgia(engine);
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

function curse(engine, mode = null) {
  const status = questStatus(engine.questState, JUJU_QUEST);
  const roll = Number(engine.param('jujuroll'));
  const forced = mode || null;
  const result = forced
    ? { ok: true, mode: forced, itemClass: engine.param('jujuitem') || jujuWants(engine.inv)[0] || 'paper' }
    : jujuCurse({
      hubId: engine.street?.hubId,
      inv: engine.inv,
      questStatus: status,
      pursued: Boolean(bandit),
      roll: Number.isFinite(roll) && engine.param('jujuroll') !== null ? roll : Math.random(),
      stealChance: stealChanceNow(),
    });
  // QA: a demo thief needs something to take.
  if (forced === 'steal' && countItem(engine.inv, result.itemClass) < 1) {
    addItem(engine.inv, result.itemClass, 3);
    engine.refreshPack();
  }
  if (!result.ok) {
    last = `no-juju:${result.reason}`;
    publish(engine);
    return false;
  }
  return spawn(engine, { mode: result.mode, itemClass: result.itemClass });
}

export const jujuBanditsFeature = {
  id: JUJU_FEATURE_ID,

  save() {
    return { escaped, ancestral: { ...clock }, nostalgia: { ...nostalgia } };
  },

  restore(slice) {
    escaped = Math.max(0, Math.floor(Number(slice?.escaped) || 0));
    clock = ancestralClock(slice?.ancestral);
    presetDone = false;
    const n = slice?.nostalgia || {};
    nostalgia = {
      kicks: Math.max(0, Math.floor(Number(n.kicks) || 0)),
      exitPromptShown: Boolean(n.exitPromptShown),
      overwhelmed: Boolean(n.overwhelmed),
      // leave_savanna(logout) forgets potion_used, so a reload does too.
      potionUsed: false,
    };
    pendingBoot = null;
    enterPromptUp = false;
    warnAt = 0;
    nostalgiaLast = '';
    nostalgiaPresetDone = false;
    publishedLeft = null;
    // A reload is a logout and login (region_logout -> leave_savanna(true)).
    relog = clock.inside;
    if (relog) ancestralLeave(clock, Date.now(), true);
  },

  onStreetEnter(street, engine) {
    bandit = null;
    pendingCurseAt = 0;
    trackRegion(street, engine, Date.now());
    platforms = platformsScreen(street);
    const demo = engine.param('jujudemo');
    if (!demoDone && (demo === 'offer' || demo === 'steal')) {
      demoDone = true;
      pendingCurseAt = Date.now() + JUJU_BANDIT.curseDelayMs;
      demoMode = demo;
    }
    publish(engine);
  },

  onStreetClear(engine) {
    // onPlayerExit: a Juju still after you rage quits (one more escape).
    if (bandit && !bandit.done) {
      escaped += 1;
      engine?.achievement?.('juju_bandits:escaped', 1);
      last = 'left_street';
    }
    dropView();
    bandit = null;
    pendingCurseAt = 0;
  },

  /**
   * give_baqala_time (engine.query): a Dust Trap remnant's 10 / 20 / 40 / 60 s
   * (dust_trap.js 51-74). Only under the buff; returns the seconds given.
   */
  giveBaqalaTime(seconds, engine) {
    const given = giveBaqalaTime(clock, seconds, { active: clock.inside && nostalgiaLeft(engine) > 0 });
    if (given) {
      publishedSecond = -1;
      syncNostalgiaBuff(engine, Date.now());
      publishClock(engine);
    }
    return given;
  },

  /** potion_ancestral_spirits.js canQuaff: under the buff, once a visit (engine.query). */
  ancestralSpiritsState(engine) {
    return { nostalgia: clock.inside && inSavanna(engine) && buffOn(engine, NOSTALGIA_BUFF), usedThisVisit: nostalgia.potionUsed };
  },

  /** potion_ancestral_spirits.js onQuaff: give_baqala_time(300) and potion_used (engine.query). */
  ancestralSpiritsQuaff(engine) {
    const state = this.ancestralSpiritsState(engine);
    if (!state.nostalgia || state.usedThisVisit) return null;
    const given = this.giveBaqalaTime(NOSTALGIA.potionSeconds, engine);
    nostalgia.potionUsed = true;
    publishNostalgia(engine);
    return given;
  },

  /** dust_trap.js doDrop: every payout may bring a Juju (pc.juju_bandit_curse after 1 s). */
  onEvent(counter, _amount, engine) {
    if (counter !== 'dust_trap:trigger' || bandit || pendingCurseAt) return;
    pendingCurseAt = Date.now() + JUJU_BANDIT.curseDelayMs;
  },

  onTick(dtMs, now, engine) {
    // Real play time: wall-clock frame gaps, capped so a paused ticker adds nothing.
    if (clock.inside) {
      ancestralTick(clock, lastTickAt ? now - lastTickAt : 0);
      if (Math.floor(ancestralSeconds(clock)) !== publishedSecond) publishClock(engine);
    }
    lastTickAt = now;
    tickNostalgia(engine, now);
    if (pendingCurseAt && now >= pendingCurseAt) {
      pendingCurseAt = 0;
      const mode = demoMode;
      demoMode = null;
      if (!bandit && engine.player && engine.street) curse(engine, mode);
    }
    if (!bandit) return;
    // The offer closed with Escape: "Not right now".
    if (bandit.offerOpen && bandit.finishOffer && !engine.questDialogueOpen()) {
      bandit.offerOpen = false;
      bandit.finishOffer(false);
    }
    if (!bandit) return;
    if (bandit.waiting && bandit.waiting.sheet.frames.length) {
      const w = bandit.waiting;
      bandit.waiting = null;
      w.apply();
    }
    const at = bandit.at;
    if (at.gone && now >= at.gone) {
      dropView();
      bandit = null;
      last = last === 'accepted' ? 'gone:accepted' : `gone:${last}`;
      publish(engine);
      return;
    }
    if (at.escape && now >= at.escape) {
      at.escape = 0;
      escape(engine, now);
    }
    if (!bandit.done) {
      if (at.alert && now >= at.alert) {
        at.alert = 0;
        engine.pushActivity(bandit.mode === 'offer' ? JUJU_TEXT.alertOffer : JUJU_TEXT.alertSteal);
      }
      if (at.declare && now >= at.declare) makeDeclaration(engine, now);
      if (bandit && !bandit.done && at.follow && now >= at.follow) targetFollow(engine, now);
      if (bandit && !bandit.done) {
        walk(engine, dtMs);
        // onPlayerCollision: the 50 x 50 hit box.
        if (bandit.readyToSteal && withinReach(engine.player, bandit)) act(engine, now);
      }
    }
    if (bandit && now - (bandit.publishedAt || 0) > 500) {
      bandit.publishedAt = now;
      publish(engine);
    }
    if (bandit && !bandit.sprite.destroyed) {
      bandit.sprite.x = bandit.x;
      bandit.sprite.y = bandit.y;
      bandit.hit.x = bandit.x;
      bandit.hit.y = bandit.y;
    }
  },

  /** QA / tests. */
  _state() {
    return {
      bandit,
      escaped,
      last,
      clock: { ...clock },
      stealChance: stealChanceNow(),
      nostalgia: { ...nostalgia },
      pendingBoot: pendingBoot ? { ...pendingBoot } : null,
      nostalgiaLast,
      enterPromptUp,
    };
  },
};

