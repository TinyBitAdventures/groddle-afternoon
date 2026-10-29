/**
 * World crabs (register G154, see js/crabs.js for the rules and sources).
 *
 * One npc_crab roams each of the eight archived crab streets. Walk into its
 * 500x200 hit box carrying a Musicblock and it calls out for a tune
 * (onPlayerCollision); pick one and it listens through its CrabPod
 * Headphones for 4 s, then reacts (blockListenCallback) and, 3 or 5 s later,
 * pays out or takes the block (blockPlayCallback). It asks once per game
 * day, and "Never mind" (or 30 s of silence) quiets it for the day. Its
 * menu has flatter, hug (Crabato Juice once a day after flattering), insult
 * and pinch. Make a Crab Happy is granted when, with at least 24 tunes in
 * its memory, it hears the one it heard least recently.
 *
 * Each crab's memory (blocks_played and the day-keyed maps) lives in its
 * street's feature slot, so it persists with the world.
 *
 * The source plays no Musicblock audio for the crab: the tune goes into the
 * crab's headphones (its listen clip), the player hears nothing.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&crabdemo=1 stands a
 * crab beside the player on any street (or &streetdemo=<a crab street>).
 * &crabblocks=all|<n> puts every Musicblock (or the first n) in the pack.
 * &crabseed=<n> fills the crab's memory with the first n catalog tunes,
 * oldest first (24 sets up Make a Crab Happy). &crabautoplay= runs steps
 * after &crabwait=<ms> (default 2500), comma separated: goto (stand in the
 * hit box, which opens the call-out), play:<classTsid>|oldest|newest|first
 * (answer "Play a tune" and pick that block), nevermind, flatter, hug,
 * insult, pinch, drink (drink a Crabato Juice), hold (freeze the reaction
 * clips for screenshots). &crabsom=1 starts in a Crab State of Mind.
 * Canvas: crabs, crabLast, crabClip, crabOutcome, crabMemory, crabTalk.
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=g446-3';
import { addItem, countItem, ensureItem, registerItemUse, removeItem } from '../inventory.js?v=catalog-unified-7';
import { MUSICBLOCK_CATALOG, ensureMusicblockItems } from '../musicblocks.js?v=g403-1';
import { energyMax, loseMood, metabolicGain, moodMax, shiftMetabolic } from '../metabolics.js';
import { grantMoodXp } from '../mood-xp.js';
import { slugsFromEffects } from '../speech-slugs.js?v=g412-1';
import { getGameDayKey } from '../game-day.js';
import { cleanQuestMarkup } from '../quests.js?v=item-buffs-7';
import { walkSurfaceY } from '../walk-surface.js?v=g442-6';
import {
  CRAB_CLASS,
  CRAB_COPY,
  CRAB_FEATURE_ID,
  CRAB_ITEMS,
  CRAB_LISTEN_SEC,
  CRAB_OFFER_TIMEOUT_MS,
  CRAB_PLACEMENT_KEY,
  CRAB_REPLY_MS,
  CRAB_RESUME_MS,
  CRAB_STATE_OF_MIND,
  CRAB_WALK,
  CRABATO_JUICE,
  CRABATO_JUICE_USE,
  CRABPHONES,
  crabHearBlock,
  crabPlacementGroups,
  crabRoamTarget,
  crabSettle,
  crabVerb,
  crabVerbMessage,
  crabVerbs,
  crabWalkSpeed,
  keepsRepeatedBlock,
  crabWantsMusic,
  ignoreToday,
  inCrabHitBox,
  musicblocksInPack,
  normalizeCrabMemory,
  playToday,
} from '../crabs.js?v=g403-1';

const ART = 'assets/sprites/crabs/';
/** OGA npc_crab sheets: 131x129 cells, 6 columns; populated counts measured. */
const SHEETS = Object.freeze({
  idle1: { path: `${ART}npc_crab_idle1.webp`, fw: 131, fh: 129, cols: 6, frames: 30 },
  idle2: { path: `${ART}npc_crab_idle2.webp`, fw: 131, fh: 129, cols: 6, frames: 30 },
  walk: { path: `${ART}npc_crab_walk.webp`, fw: 131, fh: 129, cols: 6, frames: 24 },
  listen: { path: `${ART}npc_crab_listen.webp`, fw: 131, fh: 129, cols: 6, frames: 24 },
  like_on: { path: `${ART}npc_crab_like_on.webp`, fw: 131, fh: 129, cols: 6, frames: 24 },
  like_off: { path: `${ART}npc_crab_like_off.webp`, fw: 131, fh: 129, cols: 6, frames: 24 },
  dislike_on: { path: `${ART}npc_crab_dislike_on.webp`, fw: 131, fh: 129, cols: 6, frames: 22 },
  dislike_off: { path: `${ART}npc_crab_dislike_off.webp`, fw: 131, fh: 129, cols: 6, frames: 22 },
});
const LOOPING = new Set(['idle1', 'idle2', 'walk', 'listen', 'like_on', 'dislike_on']);
/** The Colour Unblocking crab's world scale (quest-rooms/color-unblocking.js). */
const CRAB_SCALE = 0.62;
/** Feet sit 2 px above the cell bottom. */
const FEET_PAD = 2;

let loader = null;
let generation = 0;
/** { key, memory, sprite, target, mode, goDir, speed, destX, waitUntil, clip } */
let crabs = [];
/** Scheduled listen/settle callbacks: { at, kind, crab, memory, streetTsid, block, heard }. */
let pending = [];
/** The open call-out: { crab, step, timeoutAt }. */
let talk = null;
let talkEl = null;
let last = '';
let lastOutcome = '';
let demoUsed = false;
let strayChecked = false;
let holdClips = false;

const now = () => Date.now();
const dayKey = () => getGameDayKey(now());

// —— Memory ————————————————————————————————————————————————————————————

function memoryFor(engine, key, tsid = engine.streetTsid) {
  const slot = engine.streetSlot(CRAB_FEATURE_ID, tsid);
  slot.crabs ||= {};
  const mem = normalizeCrabMemory(slot.crabs[key]);
  // Normalise in place: a listen still pending from an earlier visit keeps writing here.
  const row = slot.crabs[key] && typeof slot.crabs[key] === 'object' ? slot.crabs[key] : {};
  for (const k of Object.keys(row)) delete row[k];
  slot.crabs[key] = Object.assign(row, mem);
  return row;
}

// —— Sprites ———————————————————————————————————————————————————————————

function setClip(crab, state) {
  const def = SHEETS[state];
  const frames = def ? loader.frames(def) : [];
  if (!frames.length || !crab.sprite || crab.sprite.destroyed) return;
  crab.clip = state;
  crab.sprite.textures = frames;
  crab.sprite.loop = LOOPING.has(state);
  crab.sprite.animationSpeed = pixiSpeed(30);
  crab.sprite.onComplete = LOOPING.has(state)
    ? null
    : () => {
        // A one-shot reaction (like_off / dislike_off) settles back to its pose.
        if (crab.sprite.destroyed || holdClips) return;
        setClip(crab, crab.mode === 'walk' ? 'walk' : crab.idleClip);
      };
  crab.sprite.gotoAndPlay(0);
}

function stopMoving(crab, waitMs) {
  // npc_crab stopMoving: idle1 or idle2.
  crab.mode = 'idle';
  crab.idleClip = Math.random() < 0.5 ? 'idle1' : 'idle2';
  crab.waitUntil = waitMs == null ? Infinity : now() + waitMs;
  setClip(crab, crab.idleClip);
}

function hold(crab) {
  crab.mode = 'busy';
  crab.waitUntil = Infinity;
}

function resume(crab, waitMs) {
  if (crab.sprite?.destroyed) return;
  crab.mode = 'idle';
  crab.waitUntil = now() + waitMs;
  if (!holdClips && !crab.sprite.playing) setClip(crab, crab.idleClip || 'idle1');
}

function spawn(engine, key, point) {
  const { PIXI } = engine;
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 1);
  spr.scale.set(CRAB_SCALE);
  spr.x = point.x;
  spr.y = point.y + FEET_PAD * CRAB_SCALE;
  spr.zIndex = 40;
  spr._worldHitW = Math.round(110 * CRAB_SCALE);
  spr._worldHitH = Math.round(90 * CRAB_SCALE);
  engine.entityLayer.addChild(spr);
  const crab = {
    key,
    memory: memoryFor(engine, key),
    sprite: spr,
    target: null,
    mode: 'idle',
    goDir: 'left', // parent_onCreate
    speed: crabWalkSpeed(),
    destX: point.x,
    waitUntil: now() + 1500,
    clip: '',
    idleClip: 'idle1',
  };
  crab.target = engine.register({
    classId: CRAB_CLASS,
    featureId: CRAB_FEATURE_ID,
    label: CRAB_COPY.label,
    subtitle: 'Loves a good tune',
    sprite: spr,
    crab: true,
  });
  stopMoving(crab, 1500);
  crabs.push(crab);
  return crab;
}

// —— Walking (npc_walkable roam) ——————————————————————————————————————

function startMoving(engine, crab) {
  const t = crabRoamTarget(crab.sprite.x, crab.goDir, { l: 0, r: engine.worldW || 0 });
  if (!t.distance) return onStuck(crab);
  crab.mode = 'walk';
  crab.destX = t.x;
  setClip(crab, 'walk');
}

function onStuck(crab) {
  // onStuck: turnAround, startMoving after 1 s.
  crab.goDir = crab.goDir === 'left' ? 'right' : 'left';
  stopMoving(crab, CRAB_WALK.stuckWaitMs);
}

function walk(engine, crab, dtMs) {
  const spr = crab.sprite;
  const dir = Math.sign(crab.destX - spr.x);
  const step = Math.min(Math.abs(crab.destX - spr.x), (crab.speed * dtMs) / 1000);
  const nx = spr.x + dir * step;
  const feet = spr.y - FEET_PAD * CRAB_SCALE;
  // npc_can_climb / jump / fall are false: a gap or a wall ends the walk.
  const y = walkSurfaceY(engine.platforms, nx, feet, { up: 24, down: 40 });
  if (y == null) return onStuck(crab);
  spr.x = nx;
  spr.y = y + FEET_PAD * CRAB_SCALE;
  if (Math.abs(crab.destX - spr.x) < 0.5) {
    // onPathing arrived: stopMoving, turnAround, startMoving after 10 s.
    crab.goDir = crab.goDir === 'left' ? 'right' : 'left';
    stopMoving(crab, CRAB_WALK.arriveWaitMs);
  }
}

// —— The call-out (onPlayerCollision / onConversation) ————————————————————

const CSS = `
#crab-talk { position: fixed; left: 50%; bottom: 22%; transform: translateX(-50%); z-index: 40; width: min(420px, calc(100vw - 32px)); background: #fffdf8; color: #3b2f22; border: 2px solid #e0b9a2; border-radius: 14px; box-shadow: 0 6px 22px rgba(60, 30, 10, 0.25); font: inherit; }
#crab-talk[hidden] { display: none; }
#crab-talk .ct-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem 0.85rem 0; font-weight: 700; color: #a2412b; }
#crab-talk .ct-text { margin: 0.35rem 0.85rem 0.5rem; line-height: 1.4; }
#crab-talk .ct-choices { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: flex-end; padding: 0 0.85rem 0.8rem; max-height: 40vh; overflow: auto; }
#crab-talk .ct-btn { font: inherit; border: 1px solid #e0d3bb; border-radius: 9px; padding: 0.35rem 0.75rem; background: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; color: inherit; }
#crab-talk .ct-btn img { width: 22px; height: 22px; object-fit: contain; }
#crab-talk .ct-btn:hover, #crab-talk .ct-btn:focus-visible { background: #f6efe1; }
#crab-talk .ct-btn.primary { border-color: #e39a7f; background: #fbe9e1; font-weight: 700; }
@media (prefers-color-scheme: dark) {
  #crab-talk { background: #2b241d; color: #f2e6d6; border-color: #8a4b38; }
  #crab-talk .ct-btn { background: #382f26; border-color: #5a4a3a; }
  #crab-talk .ct-btn:hover, #crab-talk .ct-btn:focus-visible { background: #45392d; }
  #crab-talk .ct-btn.primary { background: #5a3326; border-color: #a2584a; }
}
`;

function ensureTalk() {
  if (talkEl || typeof document === 'undefined') return talkEl;
  if (!document.getElementById('crab-talk-css')) {
    const style = document.createElement('style');
    style.id = 'crab-talk-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  talkEl = document.createElement('div');
  talkEl.id = 'crab-talk';
  talkEl.hidden = true;
  talkEl.setAttribute('role', 'dialog');
  talkEl.setAttribute('aria-label', 'The Crab');
  talkEl.innerHTML = '<div class="ct-head">Crab</div><p class="ct-text" data-ct-text></p><div class="ct-choices" data-ct-choices></div>';
  (document.getElementById('game-root') || document.body).appendChild(talkEl);
  // dont_take_focus: the conversation never steals the keyboard.
  talkEl.addEventListener('keydown', (e) => e.stopPropagation());
  return talkEl;
}

function renderTalk(engine, text, choices) {
  const el = ensureTalk();
  if (!el) return;
  el.querySelector('[data-ct-text]').textContent = text;
  const box = el.querySelector('[data-ct-choices]');
  box.innerHTML = '';
  for (const c of choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ct-btn${c.primary ? ' primary' : ''}`;
    b.dataset.crabChoice = c.value;
    if (c.icon) {
      const img = document.createElement('img');
      img.src = c.icon;
      img.alt = '';
      b.appendChild(img);
    }
    b.appendChild(document.createTextNode(c.txt));
    b.addEventListener('click', () => answer(engine, c.value));
    box.appendChild(b);
  }
  el.hidden = false;
  engine.setData('crabTalk', talk?.step || '');
}

function closeTalk(engine) {
  talk = null;
  if (talkEl) talkEl.hidden = true;
  engine?.setData?.('crabTalk', '');
}

function openOffer(engine, crab) {
  hold(crab);
  setClip(crab, crab.idleClip);
  talk = { crab, step: 'offer', timeoutAt: now() + CRAB_OFFER_TIMEOUT_MS };
  renderTalk(engine, cleanQuestMarkup(CRAB_COPY.offer), [
    { value: 'play-music-yes', txt: CRAB_COPY.playTune, primary: true },
    { value: 'play-music-no', txt: CRAB_COPY.neverMind },
  ]);
  last = 'offer';
}

function openPick(engine) {
  const blocks = musicblocksInPack(engine.inv);
  talk.step = 'pick';
  talk.timeoutAt = Infinity; // play-music-yes cancels timeoutRequest
  renderTalk(engine, CRAB_COPY.pick, [
    ...blocks.map((b) => ({ value: b.classTsid, txt: b.label, icon: MUSICBLOCK_CATALOG[b.classTsid]?.icon })),
    { value: 'play-music-no', txt: CRAB_COPY.neverMind },
  ]);
  last = 'pick';
}

function answer(engine, value) {
  if (!talk) return;
  const crab = talk.crab;
  engine.playSound?.('CLICK_SUCCESS', { volume: 0.45 });
  if (value === 'play-music-yes') return openPick(engine);
  if (value === 'play-music-no') {
    // "IF you never mind him THEN he will not bug you again that day."
    ignoreToday(crab.memory, dayKey());
    closeTalk(engine);
    startMoving(engine, crab);
    last = 'nevermind';
    engine.save();
    return;
  }
  closeTalk(engine);
  if (!MUSICBLOCK_CATALOG[value] || countItem(engine.inv, value) < 1) {
    engine.say(crab.target, CRAB_COPY.notSure, CRAB_REPLY_MS);
    startMoving(engine, crab);
    last = 'not-sure';
    return;
  }
  // onConversation: playToday, the CrabPod Headphones, the listen clip, 4 s.
  playToday(crab.memory, dayKey());
  addItem(engine.inv, CRABPHONES, 1);
  hold(crab);
  setClip(crab, 'listen');
  pending.push({ at: now() + CRAB_LISTEN_SEC * 1000, kind: 'listen', crab, memory: crab.memory, streetTsid: engine.streetTsid, block: value });
  engine.refreshPack();
  engine.save();
  last = `play:${value}`;
}

// —— blockListenCallback / blockPlayCallback ————————————————————————————

function live(row) {
  return row.crab && crabs.includes(row.crab) && !row.crab.sprite.destroyed;
}

function onListen(engine, row) {
  const heard = crabHearBlock(row.memory, row.block, now());
  lastOutcome = heard.outcome;
  if (heard.achievement) engine.grantAchievement(heard.achievement);
  // npc_crab.js blockListenCallback 465 / 482+495 / 495 / 509: animal_love
  // +1 a repeat, +8 Make a Crab Happy, +3 a known tune, +5 a new one (G143).
  const featPoints = { repeat: 1, happy: 8, liked: 3, fresh: 5 }[heard.outcome] || 0;
  if (featPoints) engine.featsIncrement?.('animal_love', featPoints);
  if (live(row)) setClip(row.crab, heard.state);
  pending.push({ ...row, at: now() + heard.delaySec * 1000, kind: 'settle', heard });
  engine.save();
  last = `heard:${heard.outcome}`;
}

function onSettle(engine, row) {
  const pc = engine.pc;
  const inv = engine.inv;
  // Multiplayer keeps the source rule: a repeated tune costs the block (Austin 2026-10-26, G196).
  const settled = crabSettle(row.heard, { crabStateOfMind: engine.hasBuff(CRAB_STATE_OF_MIND), keepRepeatedBlock: keepsRepeatedBlock(engine.mode) });
  const effects = { items: {} };
  if (countItem(inv, CRABPHONES) > 0) {
    removeItem(inv, CRABPHONES, 1);
    effects.items[CRAB_ITEMS[CRABPHONES].label] = -1;
  }
  if (settled.moodLoss) {
    const before = pc.mood || 0;
    // npc_crab.js 527: metabolics_lose_mood(20) (G300: nothing while dead).
    loseMood(pc, settled.moodLoss);
    effects.mood = (pc.mood || 0) - before;
  }
  if (settled.destroyBlock && countItem(inv, settled.destroyBlock) > 0) {
    removeItem(inv, settled.destroyBlock, 1);
    effects.items[MUSICBLOCK_CATALOG[settled.destroyBlock]?.label || settled.destroyBlock] = -1;
  }
  const r = settled.rewards;
  // G227: rewards go through metabolics_add_mood / _energy, refused while dead
  // or (energy) Super Pooped (inc_metabolics.js 40-53, 79-86; js/metabolics.js).
  if (r.mood > 0 && metabolicGain('mood').ok) {
    const before = pc.mood || 0;
    pc.mood = Math.min(moodMax(pc), before + r.mood);
    effects.mood = (effects.mood || 0) + (pc.mood - before);
  }
  if (r.energy > 0 && metabolicGain('energy').ok) {
    const before = pc.energy || 0;
    pc.energy = Math.min(energyMax(pc), before + r.energy);
    effects.energy = pc.energy - before;
  }
  // stats_add_xp(xp, false): the mood bonus applies.
  if (r.xp) effects.xp = grantMoodXp(pc, r.xp);
  if (r.currants) {
    pc.currants = (pc.currants || 0) + r.currants;
    effects.items.currants = r.currants;
  }
  if (live(row)) {
    setClip(row.crab, row.heard.settleState);
    // npc_crab.js 535-548: sendBubble(reply, 4000, pc, rewards), the mood, energy, iMG and currants that landed.
    engine.say(row.crab.target, row.heard.reply, CRAB_REPLY_MS, {
      slugs: slugsFromEffects({ mood: effects.mood, energy: effects.energy, xp: effects.xp, currants: r.currants }),
    });
    resume(row.crab, CRAB_RESUME_MS);
  }
  engine.pushActivity({ base: `The Crab: "${row.heard.reply}"`, effects });
  engine.updateHud();
  engine.refreshPack();
  engine.save();
  last = `settled:${row.heard.outcome}`;
}

function runPending(engine) {
  if (!pending.length) return;
  const t = now();
  const due = pending.filter((row) => row.at <= t);
  if (!due.length) return;
  pending = pending.filter((row) => row.at > t);
  for (const row of due) (row.kind === 'listen' ? onListen : onSettle)(engine, row);
}

// —— Verbs ——————————————————————————————————————————————————————————————

function runCrabVerb(engine, crab, verb) {
  const result = crabVerb(crab.memory, verb, dayKey());
  if (!result) return;
  const pc = engine.pc;
  const effects = { items: {} };
  // G227: a rise asks the metabolic gate (dead, Super Pooped).
  // G300: and a fall goes through metabolics_lose_* (npc_crab.js 237, 250, 296
  // lose_energy; 340, 384 the pinch's lose_mood).
  const mood = shiftMetabolic(pc, 'mood', result.mood);
  if (mood) effects.mood = mood;
  const energy = shiftMetabolic(pc, 'energy', result.energy);
  if (energy) effects.energy = energy;
  for (const [id, n] of Object.entries(result.items)) {
    addItem(engine.inv, id, n);
    effects.items[CRAB_ITEMS[id]?.label || id] = n;
  }
  // onInteractionStarting -> onWaitStart stops it; onWaitEnd walks on after 1.5 s.
  stopMoving(crab, CRAB_WALK.menuWaitMs);
  if (result.state) setClip(crab, result.state);
  engine.pushActivity({ base: crabVerbMessage(result), effects });
  // npc_crab.js 227-231 hug, 309-313 flatter, 353-357 pinch, 395-399 insult:
  // animal_love +1, once per crab (one crab per street) per player (G143).
  if (!result.failed) engine.featsIncrement?.('animal_love', 1, { cap: { key: `crab:${engine.streetTsid}:${verb}`, max: 1 } });
  engine.updateHud();
  engine.refreshPack();
  engine.save();
  last = `${verb}:${result.failed ? 'failed' : 'ok'}`;
}

// —— Ticks ———————————————————————————————————————————————————————————————

function tickCrabs(engine, dtMs) {
  const t = now();
  const p = engine.player;
  for (const crab of crabs) {
    if (crab.sprite.destroyed) continue;
    if (crab.mode === 'walk') walk(engine, crab, Math.min(dtMs, 100));
    else if (crab.mode === 'idle' && t >= crab.waitUntil) startMoving(engine, crab);
    if (talk || !p || crab.mode === 'busy' || engine.busy()) continue;
    if (!inCrabHitBox({ x: crab.sprite.x, y: crab.sprite.y }, p)) continue;
    if (pending.some((row) => row.crab === crab)) continue;
    const want = crabWantsMusic(crab.memory, { inv: engine.inv, dayKey: dayKey(), offering: false });
    if (want.ok) openOffer(engine, crab);
  }
  if (talk && t >= talk.timeoutAt) {
    // timeoutRequest: ignoreToday, conversation_cancel, startMoving.
    const crab = talk.crab;
    ignoreToday(crab.memory, dayKey());
    closeTalk(engine);
    startMoving(engine, crab);
    engine.save();
    last = 'timeout';
  }
}

/** A save closed mid-listen keeps the borrowed headphones; give them back. */
function returnStrayCrabphones(engine) {
  if (strayChecked || !engine.inv) return;
  strayChecked = true;
  const n = countItem(engine.inv, CRABPHONES);
  if (n > 0 && !pending.length) {
    removeItem(engine.inv, CRABPHONES, n);
    engine.refreshPack();
  }
}

// —— QA ———————————————————————————————————————————————————————————————

function seedMemory(crab, n) {
  const ids = Object.keys(MUSICBLOCK_CATALOG).slice(0, Math.max(0, Math.min(27, n)));
  const base = now() - ids.length * 60_000;
  crab.memory.blocksPlayed = {};
  ids.forEach((id, i) => {
    crab.memory.blocksPlayed[id] = base + i * 60_000;
  });
  crab.memory.played = null;
  crab.memory.ignored = null;
}

function pickBlock(crab, which, inv) {
  const owned = musicblocksInPack(inv).map((b) => b.classTsid);
  if (MUSICBLOCK_CATALOG[which]) return which;
  const heard = Object.entries(crab.memory.blocksPlayed).filter(([id]) => owned.includes(id)).sort((a, b) => a[1] - b[1]);
  if (which === 'oldest') return heard[0]?.[0] || owned[0];
  if (which === 'newest') return heard[heard.length - 1]?.[0] || owned[0];
  return owned[0];
}

function setupDemo(engine) {
  const demo = engine.param('crabdemo');
  if (demo && !demoUsed) {
    demoUsed = true;
    const p = engine.player;
    if (p && !crabs.length) spawn(engine, 'demo', { x: p.x + 260, y: p.y });
    const blocks = engine.param('crabblocks');
    if (blocks) {
      ensureMusicblockItems();
      const ids = Object.keys(MUSICBLOCK_CATALOG);
      const n = blocks === 'all' ? ids.length : Math.max(0, Math.min(ids.length, Number(blocks) || 0));
      for (const id of ids.slice(0, n)) if (countItem(engine.inv, id) < 1) addItem(engine.inv, id, 1);
      engine.refreshPack();
    }
    const seed = Number(engine.param('crabseed'));
    if (crabs[0] && Number.isFinite(seed) && seed > 0) seedMemory(crabs[0], seed);
    if (engine.param('crabsom') === '1') engine.applyBuff(CRAB_STATE_OF_MIND);
    holdClips = engine.param('crabautoplay')?.split(',').includes('hold') || false;
  }
  const auto = engine.param('crabautoplay');
  if (!auto || !crabs.length) return;
  const crab = crabs[0];
  const steps = auto.split(',');
  const wait = Math.max(0, Number(engine.param('crabwait')) || 2500);
  let at = wait;
  const later = (fn, gap = 900) => {
    setTimeout(() => {
      fn();
      publish(engine);
    }, at);
    at += gap;
  };
  for (const step of steps) {
    if (step === 'goto') {
      later(() => {
        crab.mode = 'idle';
        crab.waitUntil = Infinity;
        // Stand on the crab's own floor, beside it where the floor goes on.
        const feet = crab.sprite.y - FEET_PAD * CRAB_SCALE;
        const dx = [140, -140, 70, -70, 0].find((d) => walkSurfaceY(engine.platforms, crab.sprite.x + d, feet, { up: 24, down: 24 }) != null) ?? 0;
        engine.player.x = crab.sprite.x + dx;
        engine.player.y = (walkSurfaceY(engine.platforms, crab.sprite.x + dx, feet, { up: 24, down: 24 }) ?? feet) - 4;
        engine.player.vx = 0;
        engine.player.vy = 0;
      }, 1500);
    } else if (step.startsWith('play')) {
      const which = step.split(':')[1] || 'first';
      later(() => {
        if (talk?.step === 'offer') answer(engine, 'play-music-yes');
      }, 900);
      later(() => {
        if (talk?.step === 'pick') answer(engine, pickBlock(crab, which, engine.inv));
      }, 900);
    } else if (step === 'nevermind') {
      later(() => talk && answer(engine, 'play-music-no'));
    } else if (['flatter', 'hug', 'insult', 'pinch'].includes(step)) {
      later(() => runCrabVerb(engine, crab, step), 1200);
    } else if (step === 'drink') {
      later(() => engine.usePackItem(CRABATO_JUICE), 1200);
    }
  }
}

function publish(engine) {
  engine.setData('crabs', String(crabs.length));
  engine.setData('crabLast', last);
  engine.setData('crabClip', crabs[0]?.clip || '');
  engine.setData('crabOutcome', lastOutcome);
  engine.setData('crabMemory', String(crabs[0] ? Object.keys(crabs[0].memory.blocksPlayed).length : 0));
  const c = crabs[0]?.sprite;
  const p = engine.player;
  engine.setData('crabPos', c && p ? `${Math.round(c.x)},${Math.round(c.y)} player ${Math.round(p.x)},${Math.round(p.y)}` : '');
}

export const crabsFeature = {
  id: CRAB_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    for (const [id, meta] of Object.entries(CRAB_ITEMS)) ensureItem(id, meta);
    registerItemUse(CRABATO_JUICE, CRABATO_JUICE_USE, { label: CRAB_ITEMS[CRABATO_JUICE].label });
    publish(engine);
  },

  placementGroups(population, street) {
    return crabPlacementGroups(street?.tsid);
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    const groups = crabPlacementGroups(engine.streetTsid);
    const demo = engine.param('crabdemo');
    if (!groups.length && !(demo && !demoUsed)) return;
    loader.loadAll(Object.values(SHEETS)).then(() => {
      if (mine !== generation) return;
      const points = engine.placement(CRAB_PLACEMENT_KEY);
      points.forEach((p, i) => spawn(engine, String(i), p));
      setupDemo(engine);
      publish(engine);
    });
  },

  onStreetClear(engine) {
    generation += 1;
    if (talk) {
      // Walking off mid-call-out: timeoutRequest would have quieted it for the day.
      if (talk.step === 'offer') ignoreToday(talk.crab.memory, dayKey());
      closeTalk(engine);
    }
    crabs = [];
  },

  onTick(dtMs, t, engine) {
    returnStrayCrabphones(engine);
    runPending(engine);
    if (crabs.length) tickCrabs(engine, dtMs);
    publish(engine);
  },

  /** crabato_juice.js verbs.drink: buffs_apply('crab_state_of_mind') restarts the buff. */
  onEvent(counter, amount, engine) {
    if (counter !== `${CRABATO_JUICE}:drink`) return;
    if (engine.hasBuff(CRAB_STATE_OF_MIND)) engine.removeBuff(CRAB_STATE_OF_MIND);
    engine.applyBuff(CRAB_STATE_OF_MIND);
    last = 'crab-state-of-mind';
  },

  /*
   * G230 (Austin 2026-10-28): Enter while the call-out is up does what the client's
   * did. npc_crab.js onPlayerCollision 737 opens it with dont_take_focus, and the
   * client's ChoicesDialog then never takes the keys (ChoicesDialog.as
   * _actuallyPresent 527-543: mouse only, no requestFocus), so Enter still reached
   * LocationInputHandler.as enterKeyHandler 193-207 -> _beginInteractionAfterEnterKey
   * 209-237: startInteractionWith the crab (its verb menu, beside the bubble) or the
   * disambiguator when several things are in reach. So the crab holds no Enter
   * (no holdsEnter): Enter opens its menu as anywhere else, and the call-out stays up.
   */

  verbsFor(target) {
    const crab = crabs.find((c) => c.target === target);
    return crab ? crabVerbs(crab.memory, dayKey()) : [];
  },

  runVerb(target, verbId, engine) {
    const crab = crabs.find((c) => c.target === target);
    if (crab && verbId.startsWith('crab_')) runCrabVerb(engine, crab, verbId.slice(5));
    publish(engine);
    return true;
  },

  /** QA / tests. */
  _state() {
    return {
      crabs: crabs.map((c) => ({ key: c.key, x: c.sprite.x, y: c.sprite.y, clip: c.clip, mode: c.mode, memory: c.memory })),
      pending: pending.map((row) => ({ kind: row.kind, block: row.block, at: row.at })),
      talk: talk ? talk.step : null,
      last,
      lastOutcome,
    };
  },
};
