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

export const STREET_SPIRITS_FEATURE_ID = 'street-spirits';
const TALK_MS = 5000; // the remake's talk bubble; the source talks until the conversation ends

let loader = null;
let generation = 0;
/** { target, variant, look, sprite, clip, done, talkUntil, near } */
let spirit = null;

function publish(engine) {
  engine.setData('spiritVariant', spirit?.variant || '');
  engine.setData('spiritLook', spirit?.look || '');
  engine.setData('spiritClip', spirit?.clip || '');
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
    publish(engine);
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    spirit = null;
    const target = vendorSpirit(engine);
    engine.setData('spiritStreetHub', String(engine.street?.hubId || ''));
    if (!target) {
      publish(engine);
      return;
    }
    const forced = engine.param('spiritdemo') || '';
    const pick = spiritForStreet({ hubId: engine.street?.hubId, tsid: engine.streetTsid }, forced);
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
  },

  onTick(dtMs, now, engine) {
    if (!spirit || spirit.sprite.destroyed) return;
    if (spirit.variant === 'zutto') tickZutto(engine, now);
    else if (spirit.talkUntil && now >= spirit.talkUntil) {
      spirit.talkUntil = 0;
      setClip(spirit, STREET_SPIRIT_VARIANTS[spirit.variant].idle);
    }
    publish(engine);
  },

  /** Peek at verbs on the spirit to play its talk clip; never handles them. */
  runVerbOverride(target, verbId, engine) {
    if (spirit && target === spirit.target && verbId === 'talk_to') startTalk(engine, Date.now());
    return null;
  },

  /** QA / tests. */
  _state() {
    return spirit ? { variant: spirit.variant, look: spirit.look, clip: spirit.clip } : null;
  },
};
