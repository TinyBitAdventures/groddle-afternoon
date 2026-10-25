/**
 * Regional Street Spirits (register G181). game.js spawnVendorNpc still
 * places one Street Spirit on every street whose archived location lists
 * one, selling the street's store; this feature dresses it as its region's
 * spirit (js/street-spirits.js): the Groddle, Firebog or Uralia (zutto)
 * spirit's own CC0 sheets, idle and talk clips, and talk lines. Store,
 * verbs and quests are the same for every spirit in the source, so they
 * are untouched.
 *
 * Behaviour from GameServerJS:
 * - Groddle: idle_hold, talk while speaking, back to idle_hold after
 *   (street_spirit_groddle.js onConversationEnding 366-368).
 * - Firebog: idle_move as its idle, never walks (street_spirit_firebog.js
 *   369-388).
 * - Uralia: asleep on the ground (groundIdle); a player within 250 px wakes
 *   it (raise, hoverIdle), it talks with hoverTalk, lowers when they leave,
 *   and turns to face them; "Asset is backwards" (street_spirit_zutto.js
 *   checkForPlayers 369-408, facePlayer 422-429, onInteractionStarting
 *   452-458, onTalking 488-491).
 * - Ix: idle, talk, faces the player on interaction (street_spirit_ix.js
 *   383-396). Placed on no street; QA only.
 *
 * QA: ?autostart=1&questoffer=off&streetdemo=<tsid> on a spirit street
 * (Groddle: GCR10157DMK1L0G Addingfoot Trip; Firebog: GLI57DI72HI153U
 * Somewhat Sump, Shimla Mirch; Uralia: GA910DULG012JIE Punar Grotta,
 * Ilmenskie Deeps), or &spiritdemo=groddle|firebog|zutto|ix to dress the
 * current street's spirit as that variant, &spiritlook=<look> for one look,
 * &spiritautoplay=near|far|talk to stand beside it, 330 px off, or talk to
 * it (&spiritwait=<ms> before talking, default 2500). Canvas:
 * spiritVariant, spiritLook, spiritClip, spiritStreetHub.
 *
 * Conversations (register G185, js/street-spirit-talks.js): walking up to
 * the spirit offers its region's next conversation with a call-out bubble;
 * Talk to then runs it step by step in the shared scripted dialogue, once
 * per player. With nothing offered, Talk to keeps the single lines
 * (content.js). QA: &spiritconvo=dev (the source's dev-server rules: no
 * login wait, no shrine quest, 10 s timeouts), &spiritgates=strict (the
 * unbuilt shrine gates hold), &spiritlore=<id,id> (record conversations as
 * told). Canvas: spiritConvoOffered, spiritConvoActive, spiritConvoNext,
 * spiritConvoCompleted, spiritConvoLast.
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js';
import {
  STREET_SPIRIT_ART,
  STREET_SPIRIT_VARIANTS,
  spiritAnchor,
  spiritCell,
  spiritForStreet,
  spiritSheet,
  spiritSheets,
  zuttoNear,
  zuttoNextClip,
} from '../street-spirits.js';
import {
  TALK_CLASSES,
  TALK_ORDER,
  TALK_RULES,
  SPIRIT_CONVERSATIONS,
  canOffer,
  completeTalk,
  hasCompleted,
  normalizeTalkState,
  offerBubble,
  offerNext,
  offeredFor,
  talkBeats,
} from '../street-spirit-talks.js?v=g185-1';
import { questStatus } from '../quest-offers.js';

export const STREET_SPIRITS_FEATURE_ID = 'street-spirits';
const TALK_MS = 5000; // the remake's talk bubble; the source talks until the conversation ends

let loader = null;
let generation = 0;
/** { target, variant, look, sprite, clip, done, talkUntil, near } */
let spirit = null;
/** The player's conversation ledger (saved). */
let talks = normalizeTalkState();
let sessionStart = Date.now();
/** The street's vendor spirit and its region, known before its art loads. */
let talkTarget = null;
let talkVariant = '';
let streetEnteredAt = 0;
let wasNear = false;
let nextCheckAt = 0;
/** { id, variant, target } while a conversation is open. */
let active = null;
let lastTalk = '';
let publishAt = 0;

function publish(engine) {
  engine.setData('spiritVariant', spirit?.variant || '');
  engine.setData('spiritLook', spirit?.look || '');
  engine.setData('spiritClip', spirit?.clip || '');
}

function talkCtx(engine, now) {
  return {
    now,
    dev: engine.param('spiritconvo') === 'dev',
    strict: engine.param('spiritgates') === 'strict',
    sessionStart,
    streetEnteredAt,
    shrinesDone: questStatus(engine.questState || {}, TALK_RULES.shrineQuest) === 'done',
  };
}

/** Where the region's conversations stand: the first untold one and why it waits. */
function nextStatus(engine, now) {
  const order = TALK_ORDER[talkVariant] || [];
  const id = order.find((c) => !hasCompleted(talks, c));
  if (!id) return order.length ? 'all-told' : '';
  if (offeredFor(talks, talkVariant).includes(id)) return `${id}:offered`;
  const res = canOffer(talks, id, talkCtx(engine, now));
  return `${id}:${res.ok ? 'ready' : res.reason}`;
}

function publishTalk(engine, now = Date.now()) {
  engine.setData('spiritConvoOffered', talkVariant ? offeredFor(talks, talkVariant).join(',') : '');
  engine.setData('spiritConvoActive', active?.id || '');
  engine.setData('spiritConvoNext', talkVariant ? nextStatus(engine, now) : '');
  engine.setData('spiritConvoCompleted', Object.values(talks.completed).flatMap((row) => Object.keys(row)).join(','));
  engine.setData('spiritConvoLast', lastTalk);
}

/** street_spirit onPlayerCollision: a player walking up gets the next conversation offered. */
function tickOffer(engine, now) {
  const t = talkTarget;
  const p = engine.player;
  if (!t || !p || !TALK_ORDER[talkVariant] || active || !t.sprite || t.sprite.destroyed) return;
  const near = Math.abs(p.x - t.sprite.x) <= 90 && Math.abs(p.y - t.sprite.y) <= 120;
  const dev = engine.param('spiritconvo') === 'dev';
  // Collision fires on the way in; dev QA keeps checking while the player stands there.
  const entering = near && (!wasNear || (dev && now >= nextCheckAt));
  wasNear = near;
  if (!entering) return;
  nextCheckAt = now + 1000;
  if (engine.busy?.() || engine.transientInstance?.()) return;
  const res = offerNext(talks, talkVariant, talkCtx(engine, now));
  if (!res.id) {
    lastTalk = `held:${res.reason}`;
    return;
  }
  lastTalk = `offered:${res.id}`;
  engine.say(t, offerBubble(), TALK_RULES.bubbleMs);
  engine.save();
}

/** talk_to: run the first conversation this region's spirits have offered. */
function startConversation(engine, target, now) {
  const id = offeredFor(talks, talkVariant)[0];
  if (!id || !engine.scriptedDialogue) return false;
  const def = SPIRIT_CONVERSATIONS[id];
  const variant = talkVariant;
  active = { id, variant, target };
  lastTalk = `talking:${id}`;
  if (spirit?.target === target) spirit.talkUntil = Infinity;
  engine.scriptedDialogue({
    title: def.title,
    kicker: target.state?.vendorLabel || 'Street Spirit',
    beats: talkBeats(id),
    cancelable: true,
    cancelLabel: 'Close',
    onComplete: () => {
      completeTalk(talks, variant, id, Date.now());
      lastTalk = `completed:${id}`;
      endConversation(engine);
      engine.pushActivity(`You talked to the Street Spirit: ${def.title}.`);
      engine.save();
    },
  });
  publishTalk(engine, now);
  return true;
}

/** The dialogue closed (told or not): stop the talk clip. An untold conversation stays offered. */
function endConversation(engine) {
  if (active && lastTalk === `talking:${active.id}`) lastTalk = `closed:${active.id}`;
  active = null;
  if (spirit && spirit.talkUntil === Infinity) spirit.talkUntil = Date.now();
  publishTalk(engine);
}

/** QA: &spiritlore=<id,id> records those conversations as told (any gate id, e.g. facts_of_the_giants_4). */
function seedLore(engine) {
  const ids = String(engine.param('spiritlore') || '').split(',').map((s) => s.trim()).filter((s) => /^\w+$/.test(s));
  for (const id of ids) {
    if (hasCompleted(talks, id)) continue;
    const variant = SPIRIT_CONVERSATIONS[id]?.variant;
    // Old enough that the 30-minute gap after a completion has passed.
    const at = Date.now() - TALK_RULES.offerTimeoutMs - 1000;
    if (variant) completeTalk(talks, variant, id, at);
    else (talks.completed.qa_lore ||= {})[id] = at;
  }
}

function vendorSpirit(engine) {
  return (engine.interactables || []).find(
    (it) => String(it.classId || '').startsWith('street_spirit_') && it.state?.vendorKey && it.sprite && !it.sprite.destroyed
  );
}

function setClip(s, clip) {
  const def = spiritSheet(s.variant, s.look, clip);
  const frames = def ? loader.frames(def) : [];
  if (!frames.length || s.sprite.destroyed) return;
  s.clip = clip;
  s.done = false;
  s.sprite.textures = frames;
  s.sprite.loop = !def.once;
  s.sprite.animationSpeed = pixiSpeed(def.fps);
  s.sprite.onComplete = def.once ? () => { s.done = true; } : null;
  s.sprite.gotoAndPlay(0);
}

/** Hide the stand-in body and put the region's spirit in its place, moving the badge and name above it. */
function dress(engine, target, variant, look) {
  const { PIXI } = engine;
  const g = target.sprite;
  const [body, crest, badge, label] = g.children;
  const box = spiritCell(variant, look);
  const anchor = spiritAnchor(variant, look);
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(anchor.x, anchor.y);
  spr.y = 2;
  if (body) body.visible = false;
  g.addChildAt(spr, 0);
  const h = box.crop.h;
  // The store badge sits on the spirit's shoulder, the name above its head.
  const cx = Math.max(Math.round(box.crop.w * 0.42), 30);
  const cy = -Math.round(h * 0.55);
  if (crest) crest.position.set(cx - 35, cy + 84);
  if (badge) badge.position.set(cx, cy);
  if (label) label.y = -h - 8;
  const def = STREET_SPIRIT_VARIANTS[variant];
  target.state.spiritVariant = variant;
  target.state.spiritClass = def.classTsid;
  if (def.dialogueKey !== 'street_spirit') target.state.spiritDialogue = def.dialogueKey;
  else delete target.state.spiritDialogue;
  spirit = { target, variant, look, sprite: spr, clip: '', done: false, talkUntil: 0, near: false };
  setClip(spirit, def.idle);
  return spirit;
}

function face(s, player, backwards) {
  if (!player) return;
  const right = player.x > s.target.sprite.x;
  // zutto.js facePlayer: "Asset is backwards", so it flips to face a player on the right.
  s.sprite.scale.x = (backwards ? right : !right) ? -1 : 1;
}

function tickZutto(engine, now) {
  const s = spirit;
  const talking = now < s.talkUntil;
  const near = talking || zuttoNear(s.target.sprite, engine.player);
  if (near && !s.near) face(s, engine.player, true);
  s.near = near;
  if (talking) {
    if (s.clip === 'hover' || (s.clip === 'raise' && s.done)) setClip(s, 'talk');
    return;
  }
  if (s.clip === 'talk') {
    setClip(s, 'hover');
    return;
  }
  const next = zuttoNextClip(s.clip, near, s.done);
  if (next !== s.clip) setClip(s, next);
}

function startTalk(engine, now) {
  const s = spirit;
  s.talkUntil = now + TALK_MS;
  if (s.variant === 'zutto') {
    face(s, engine.player, true);
    if (s.clip === 'hover') setClip(s, 'talk');
    return;
  }
  if (s.variant === 'ix') face(s, engine.player, false);
  setClip(s, STREET_SPIRIT_VARIANTS[s.variant].talk);
}

function autoplay(engine) {
  const mode = engine.param('spiritautoplay');
  if (!mode || !spirit || !engine.player) return;
  const g = spirit.target.sprite;
  // far: beyond the Uralia spirit's 250 px wake radius, still on screen.
  engine.player.x = g.x + (mode === 'far' ? 330 : 80);
  engine.player.y = g.y - 4;
  engine.player.vx = 0;
  engine.player.vy = 0;
  // QA for speech bubbles near the top of the view: lift the spirit by N px.
  const lift = Number(engine.param('spiritlift')) || 0;
  if (lift > 0) g.y -= lift;
  if (mode !== 'talk') return;
  setTimeout(() => {
    if (!spirit) return;
    const verb = (engine.targetVerbs(spirit.target) || []).find((v) => v.id === 'talk_to');
    if (verb) engine.beginVerb(spirit.target, verb);
  }, Math.max(0, Number(engine.param('spiritwait')) || 2500));
}

export const streetSpiritsFeature = {
  id: STREET_SPIRITS_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    sessionStart = Date.now();
    seedLore(engine);
    publish(engine);
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    spirit = null;
    if (active) endConversation(engine);
    const target = vendorSpirit(engine);
    engine.setData('spiritStreetHub', String(engine.street?.hubId || ''));
    streetEnteredAt = Date.now();
    wasNear = false;
    talkTarget = target || null;
    talkVariant = '';
    if (!target) {
      publish(engine);
      publishTalk(engine);
      return;
    }
    const forced = engine.param('spiritdemo') || '';
    const pick = spiritForStreet({ hubId: engine.street?.hubId, tsid: engine.streetTsid }, forced);
    talkVariant = TALK_CLASSES[pick.variant] ? pick.variant : '';
    publishTalk(engine);
    const wantLook = engine.param('spiritlook');
    const look = wantLook && STREET_SPIRIT_ART[pick.variant].looks[wantLook] !== undefined ? wantLook : pick.look;
    loader.loadAll(spiritSheets(pick.variant, look)).then(() => {
      if (mine !== generation || target.sprite.destroyed) return;
      // Keep the stand-in if the art did not load.
      if (!spiritSheets(pick.variant, look).every((def) => loader.ready(def))) return;
      dress(engine, target, pick.variant, look);
      autoplay(engine);
      publish(engine);
    });
  },

  onStreetClear() {
    generation += 1;
    spirit = null;
    talkTarget = null;
    talkVariant = '';
  },

  onTick(dtMs, now, engine) {
    const wall = Date.now();
    if (active && !engine.questDialogueOpen?.()) endConversation(engine);
    tickOffer(engine, wall);
    if (talkTarget && wall >= publishAt) {
      publishAt = wall + 500;
      publishTalk(engine, wall);
    }
    if (!spirit || spirit.sprite.destroyed) return;
    if (spirit.variant === 'zutto') tickZutto(engine, now);
    else if (spirit.talkUntil && now >= spirit.talkUntil) {
      spirit.talkUntil = 0;
      setClip(spirit, STREET_SPIRIT_VARIANTS[spirit.variant].idle);
    }
    publish(engine);
  },

  /**
   * Talk to the spirit: an offered conversation runs here (true); otherwise
   * play the talk clip and leave the verb to content.js's single lines (null).
   */
  runVerbOverride(target, verbId, engine) {
    if (verbId !== 'talk_to') return null;
    if (spirit && target === spirit.target) startTalk(engine, Date.now());
    if (target && target === talkTarget && !active && startConversation(engine, target, Date.now())) return true;
    return null;
  },

  save() {
    return talks;
  },

  restore(slice, engine) {
    talks = normalizeTalkState(slice);
    if (engine) seedLore(engine);
  },

  /** QA / tests. */
  _state() {
    return spirit ? { variant: spirit.variant, look: spirit.look, clip: spirit.clip } : null;
  },
  _talks() {
    return { talks, active: active?.id || '', variant: talkVariant, last: lastTalk };
  },
};
