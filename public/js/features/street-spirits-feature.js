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
 * (content.js). Since G189 the ledger is the player's one conversation
 * record (js/conversations.js, saved by features/conversations-feature.js):
 * the first talk of each pair waits for real on its shrine conversation,
 * and the old saved ledger is handed over on load. A talk cut off by a
 * reload opens again at its line when the player is still by the spirit
 * (conversations_login, inc_conversations.js 192-220; G202). QA: &spiritconvo=dev or
 * &convo=dev (the source's dev-server rules: no login wait, no shrine quest,
 * 10 s timeouts), &spiritgates=strict (kept; every gate is real now),
 * &spiritlore=<id,id> (record conversations as told). Canvas:
 * spiritConvoOffered, spiritConvoActive, spiritConvoNext,
 * spiritConvoCompleted, spiritConvoLast.
 *
 * Loneliness (G185, features/spirit-loneliness-feature.js): while this
 * street's spirit is lonely it plays its cry clip (the class prop
 * loneliness_state: Groddle and Firebog idle_cry as their idle, Uralia
 * hoverCry in bursts while it hovers) and offers no conversation, as
 * onPlayerCollision runs lonelinessVisit first (street_spirit.js 541-545).
 * The loneliness feature answers engine.query('spiritCry') and
 * engine.query('spiritLonelyHere').
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=f0e432df';
import { nearestSurfaceY, walkSurfaceY } from '../walk-surface.js?v=764d5f5a';
import { STREET_SPIRIT_SPEECH_OFFSET } from '../speech-placement.js?v=7e03b1b9';
import {
  STREET_SPIRIT_ART,
  STREET_SPIRIT_VARIANTS,
  spiritAnchor,
  spiritCell,
  spiritCrySheet,
  spiritForStreet,
  spiritSheet,
  spiritSheets,
  zuttoNear,
  zuttoNextClip,
} from '../street-spirits.js?v=f9e88445';
import {
  TALK_CLASSES,
  TALK_ORDER,
  TALK_RULES,
  SPIRIT_CONVERSATIONS,
  canOffer,
  completeTalk,
  hasCompleted,
  offerBubble,
  offerNext,
  offeredFor,
  talkBeats,
} from '../street-spirit-talks.js?v=5321850f';
import { CONVERSATIONS } from '../conversations-data.js?v=f11b7e02';
import {
  adoptLegacyTalks,
  afterRecordRestore,
  clearCurrentState,
  conversationRecord,
  currentState,
  markHeard,
  resumeTarget,
  setCurrentState,
} from '../conversations.js?v=7cbdfea4';
import { questStatus } from '../quest-offers.js?v=6b6cbf22';
import { questDoneAt } from '../quests.js?v=282e1621';

export const STREET_SPIRITS_FEATURE_ID = 'street-spirits';
const TALK_MS = 5000; // the remake's talk bubble; the source talks until the conversation ends

let loader = null;
let generation = 0;
/** { target, variant, look, sprite, clip, done, talkUntil, near } */
let spirit = null;
/** The player's conversation record (js/conversations.js; the conversations feature saves it). */
const record = () => conversationRecord();
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
/** conversations_login: one try per load, for 15 s after the first street. */
let resume = { pending: true, until: 0 };
const RESUME_WINDOW_MS = 15000;

function publish(engine) {
  engine.setData('spiritVariant', spirit?.variant || '');
  engine.setData('spiritLook', spirit?.look || '');
  engine.setData('spiritClip', spirit?.clip || '');
}

/** The source's dev-server rules: ?spiritconvo=dev, or ?convo=dev for every teller. */
function devRules(engine) {
  return engine.param('spiritconvo') === 'dev' || engine.param('convo') === 'dev';
}

function talkCtx(engine, now) {
  return {
    now,
    dev: devRules(engine),
    strict: engine.param('spiritgates') === 'strict',
    sessionStart,
    streetEnteredAt,
    shrinesDone: questStatus(engine.questState || {}, TALK_RULES.shrineQuest) === 'done',
    shrinesDoneAt: questDoneAt(engine.questState || {}, TALK_RULES.shrineQuest), // inc_conversations.js 99
  };
}

/** Where the region's conversations stand: the first untold one and why it waits. */
function nextStatus(engine, now) {
  const order = TALK_ORDER[talkVariant] || [];
  const id = order.find((c) => !hasCompleted(record(), c));
  if (!id) return order.length ? 'all-told' : '';
  if (offeredFor(record(), talkVariant).includes(id)) return `${id}:offered`;
  const res = canOffer(record(), id, talkCtx(engine, now));
  return `${id}:${res.ok ? 'ready' : res.reason}`;
}

function publishTalk(engine, now = Date.now()) {
  engine.setData('spiritConvoOffered', talkVariant ? offeredFor(record(), talkVariant).join(',') : '');
  engine.setData('spiritConvoActive', active?.id || '');
  engine.setData('spiritConvoNext', talkVariant ? nextStatus(engine, now) : '');
  engine.setData('spiritConvoCompleted', Object.values(record().completed).flatMap((row) => Object.keys(row)).join(','));
  engine.setData('spiritConvoLast', lastTalk);
}

/** street_spirit onPlayerCollision: a player walking up gets the next conversation offered. */
function tickOffer(engine, now) {
  const t = talkTarget;
  const p = engine.player;
  if (!t || !p || !TALK_ORDER[talkVariant] || active || !t.sprite || t.sprite.destroyed) return;
  // G185: a lonely spirit's collision is the loneliness visit (street_spirit.js 541-545).
  if (engine.query?.('spiritLonelyHere', engine)) return;
  const near = Math.abs(p.x - t.sprite.x) <= 90 && Math.abs(p.y - t.sprite.y) <= 120;
  const dev = devRules(engine);
  // Collision fires on the way in; dev QA keeps checking while the player stands there.
  const entering = near && (!wasNear || (dev && now >= nextCheckAt));
  wasNear = near;
  if (!entering) return;
  nextCheckAt = now + 1000;
  if (engine.busy?.() || engine.transientInstance?.()) return;
  const res = offerNext(record(), talkVariant, talkCtx(engine, now));
  if (!res.id) {
    lastTalk = `held:${res.reason}`;
    return;
  }
  lastTalk = `offered:${res.id}`;
  engine.say(t, offerBubble(), TALK_RULES.bubbleMs);
  engine.save();
}

/** conversations_set_current_state: the spirit and the line the player is on. */
function saveState(engine, variant, id, target, step) {
  setCurrentState(record(), { cls: TALK_CLASSES[variant], id, step, street: engine.streetTsid || '', x: target.sprite?.x || 0, y: target.sprite?.y || 0 });
}

/** talk_to: run the first conversation this region's spirits have offered, or (resume) the saved one from its line. */
function startConversation(engine, target, now, from = null) {
  const id = from ? from.id : offeredFor(record(), talkVariant)[0];
  if (!id || !engine.scriptedDialogue || !SPIRIT_CONVERSATIONS[id]) return false;
  const def = SPIRIT_CONVERSATIONS[id];
  const variant = talkVariant;
  active = { id, variant, target };
  lastTalk = `talking:${id}`;
  // Only a state saved before this load resumes.
  resume.pending = false;
  markHeard(record(), id, now);
  if (spirit?.target === target) spirit.talkUntil = Infinity;
  const all = talkBeats(id);
  const start = from ? Math.min(Math.max(0, from.step), all.length - 1) : 0;
  saveState(engine, variant, id, target, start);
  engine.save();
  const beats = all.slice(start).map((beat, k) => {
    const i = start + k;
    if (i === all.length - 1) return beat;
    return { ...beat, onAnswer: () => {
      saveState(engine, variant, id, target, i + 1);
      engine.save();
    } };
  });
  engine.scriptedDialogue({
    title: def.title,
    kicker: target.state?.vendorLabel || 'Street Spirit',
    beats,
    cancelable: true,
    cancelLabel: 'Close',
    onComplete: () => {
      completeTalk(record(), variant, id, Date.now());
      clearCurrentState(record());
      lastTalk = `completed:${id}`;
      endConversation(engine);
      engine.pushActivity(`You talked to the Street Spirit: ${def.title}.`);
      engine.save();
    },
  });
  publishTalk(engine, now);
  return true;
}

/**
 * conversations_login 192-220, once per load: a spirit talk cut off by a
 * reload opens again at its line when this street's spirit is in range
 * (300 x 150 px). Other tellers' states are the conversations feature's.
 */
function resumeTick(engine, now) {
  if (!resume.pending || active || !engine.player || !streetEnteredAt) return;
  const st = currentState(record());
  if (!st || !Object.values(TALK_CLASSES).includes(st.cls)) {
    resume.pending = false;
    return;
  }
  if (!resume.until) resume.until = now + RESUME_WINDOW_MS;
  if (now > resume.until) {
    resume.pending = false;
    lastTalk = `kept:${st.id}:${st.step}`;
    return;
  }
  const t = talkTarget;
  if (!t?.sprite || t.sprite.destroyed || TALK_CLASSES[talkVariant] !== st.cls || SPIRIT_CONVERSATIONS[st.id]?.variant !== talkVariant) return;
  if (engine.busy?.() || engine.transientInstance?.() || engine.questDialogueOpen?.()) return;
  if (!resumeTarget(record(), { street: engine.streetTsid, player: engine.player, targets: [{ cls: st.cls, x: t.sprite.x, y: t.sprite.y }] })) return;
  resume.pending = false;
  lastTalk = `resumed:${st.id}:${st.step}`;
  if (spirit && spirit.target === t) startTalk(engine, now);
  startConversation(engine, t, now, { id: st.id, step: st.step });
}

/** The dialogue closed (told or not): stop the talk clip. An untold conversation stays offered. */
function endConversation(engine) {
  if (active && lastTalk === `talking:${active.id}`) lastTalk = `closed:${active.id}`;
  active = null;
  if (spirit && spirit.talkUntil === Infinity) spirit.talkUntil = Date.now();
  publishTalk(engine);
}

/** QA: &spiritlore=<id,id> records those conversations as told (any id, e.g. facts_of_the_giants_4, under its first teller). */
function seedLore(engine) {
  const ids = String(engine.param('spiritlore') || '').split(',').map((s) => s.trim()).filter((s) => /^\w+$/.test(s));
  const rec = record();
  for (const id of ids) {
    if (hasCompleted(rec, id)) continue;
    const variant = SPIRIT_CONVERSATIONS[id]?.variant;
    // Old enough that the 30-minute gap after a completion has passed.
    const at = Date.now() - TALK_RULES.offerTimeoutMs - 1000;
    if (variant) completeTalk(rec, variant, id, at);
    else (rec.completed[CONVERSATIONS[id]?.tellers[0] || 'qa_lore'] ||= {})[id] = at;
  }
}

function vendorSpirit(engine) {
  return (engine.interactables || []).find(
    (it) => String(it.classId || '').startsWith('street_spirit_') && it.state?.vendorKey && it.sprite && !it.sprite.destroyed
  );
}

/** G185: the cry clip loads only when a spirit is lonely; it keeps the look's ground line. */
function clipDef(s, clip) {
  return clip === 'cry' ? spiritCrySheet(s.variant, s.look) : spiritSheet(s.variant, s.look, clip);
}

function setClip(s, clip) {
  const def = clipDef(s, clip);
  const frames = def ? loader.frames(def) : [];
  if (!frames.length && def && clip === 'cry') loader.load(def);
  if (!frames.length || s.sprite.destroyed) return;
  const a = def.anchor || spiritAnchor(s.variant, s.look);
  s.sprite.anchor.set(a.x, a.y);
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
  // Speech bubbles sit over the art (game.js positionSpeechBubble), not the
  // container's bounds with the name label, nor the 170 px cap for unknown
  // sprites: the large Firebog spirit is 244 px tall. The art stands 2 px low.
  target.artHeight = h - 2;
  // Every Street Spirit's conversation_offset_x/y, 0 and 60 (street_spirit*.js
  // classProps 26-27): its bubbles point 60 px down into its art, which keeps
  // the Firebog's in view beside the player (G214, js/speech-placement.js).
  target.speechOffset = STREET_SPIRIT_SPEECH_OFFSET;
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
    if (s.clip === 'hover' || s.clip === 'cry' || (s.clip === 'raise' && s.done)) setClip(s, 'talk');
    return;
  }
  if (s.clip === 'talk') {
    setClip(s, 'hover');
    return;
  }
  // G185: zutto.js declareLoneliness 410-418: hoverCry for 5 s, only while it hovers.
  const cry = lonelyCry(engine);
  if (near && cry && s.clip === 'hover') {
    setClip(s, 'cry');
    return;
  }
  if (near && !cry && s.clip === 'cry') {
    setClip(s, 'hover');
    return;
  }
  const next = zuttoNextClip(s.clip, near, s.done);
  if (next !== s.clip) setClip(s, next);
}

/** G185: whether the loneliness feature wants this street's spirit crying now. */
function lonelyCry(engine) {
  return engine.query?.('spiritCry', engine) === true;
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

/** The QA &spiritautoplay=far offsets tried, nearest 330 first (all past the 250 px wake box). */
const FAR_DX = [330, -330, 300, -300, 380, -380, 430, -430, 280, -280];

/**
 * Where &spiritautoplay=far stands the player (G239): outside the Uralia
 * spirit's wake box (|dx| and |dy| under 250, street_spirit_zutto.js
 * checkForPlayers 377) and with the spirit still on screen. A floor at the
 * spirit's own height 280-430 px to either side wins. A spirit on a short
 * deck (Somewhat Sump's sits on a 330 px deck above the ground) has none,
 * so the player stands 330 px off on the floor nearest that height and the
 * camera is lifted (lookY, negative is up) until the spirit's head is in
 * the view (the point of this QA), but never past the player's feet at the
 * view's bottom edge. The camera follows its target at `anchor` of the
 * view's height (movement.js cameraTargetY).
 */
export function spiritFarSpot(platforms, x, y, { artHeight = 120, viewH = 408, anchor = 0.75 } = {}) {
  for (const dx of FAR_DX) {
    const sy = walkSurfaceY(platforms, x + dx, y, { up: 60, down: 60 });
    if (sy != null) return { x: x + dx, y: sy, lookY: 0 };
  }
  for (const dx of [330, -330]) {
    const sy = nearestSurfaceY(platforms, x + dx, y);
    if (sy == null) continue;
    const top = Math.max(y - artHeight - 12, sy - viewH);
    const lookY = Math.min(0, Math.round(top + anchor * viewH - sy));
    return { x: x + dx, y: sy, lookY };
  }
  return { x: x + 330, y, lookY: 0 };
}

let farLook = false;

function autoplay(engine) {
  const mode = engine.param('spiritautoplay');
  if (!mode || !spirit || !engine.player) return;
  const g = spirit.target.sprite;
  // far: beyond the Uralia spirit's 250 px wake radius, still on screen.
  const spot = mode === 'far'
    ? spiritFarSpot(engine.platforms, g.x, g.y, { artHeight: Number(spirit.target.artHeight) || 120, viewH: engine.camera?.h || 408 })
    : { x: g.x + 80, y: g.y, lookY: 0 };
  engine.player.x = spot.x;
  engine.player.y = spot.y - 4;
  engine.player.vx = 0;
  engine.player.vy = 0;
  if (spot.lookY) {
    farLook = true;
    engine.setCameraLook?.(0, spot.lookY);
  }
  engine.setData('spiritAutoplaySpot', `${Math.round(spot.x)},${Math.round(spot.y)},${spot.lookY}`);
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
    resume = { pending: true, until: 0 };
    seedLore(engine);
    // The conversations feature restores the record after this one: seed again then.
    afterRecordRestore(() => seedLore(engine));
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

  onStreetClear(engine) {
    generation += 1;
    spirit = null;
    if (farLook) {
      farLook = false;
      engine?.setCameraLook?.(0, 0);
    }
    talkTarget = null;
    talkVariant = '';
  },

  onTick(dtMs, now, engine) {
    const wall = Date.now();
    if (active && !engine.questDialogueOpen?.()) endConversation(engine);
    resumeTick(engine, wall);
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
    } else if (!spirit.talkUntil) {
      // G185: onLonelinessStart makes idle_cry its idle (street_spirit.js 493-498); onLonelinessEnd ends it.
      const cry = lonelyCry(engine);
      if (cry && spirit.clip !== 'cry') setClip(spirit, 'cry');
      else if (!cry && spirit.clip === 'cry') setClip(spirit, STREET_SPIRIT_VARIANTS[spirit.variant].idle);
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

  /** The record is saved by the conversations feature; this marks the old ledger as handed over. */
  save() {
    return { moved: 'conversations' };
  },

  /** A save from before G189 holds the ledger here: hand it to the shared record (js/conversations.js). */
  restore(slice, engine) {
    if (slice?.moved !== 'conversations') adoptLegacyTalks(slice);
    if (engine) seedLore(engine);
  },

  /** QA / tests. */
  _state() {
    return spirit ? { variant: spirit.variant, look: spirit.look, clip: spirit.clip } : null;
  },
  _talks() {
    return { talks: record(), active: active?.id || '', variant: talkVariant, last: lastTalk };
  },
};
