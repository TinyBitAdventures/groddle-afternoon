/**
 * Other Glitches as vector avatars: the baked NPC looks
 * (js/npc-glitch-sheets.js, tools/avatar-compositor/npcs.mjs) driven like
 * the player's Glitch (js/avatar-anims.js): walk, the idle4 stand loop with
 * a random idle every so often, jump lift/fall/land, climb, emotions.
 *
 * game.js makes one kit (createNpcGlitchKit) and hands actors out through
 * engine.npcGlitch(name). Callers keep their own movement, scale and facing
 * (sprite.scale.x with crowdScaleX: the art faces right) and only say what
 * the Glitch is doing (actor.setMode).
 *
 * Memory: a look's sheets load only when one of its Glitches needs them
 * (base and idle4 at once, jump/climb/emotions/random idles on first use),
 * at 1x or the 2x hires files on a sharp screen. Pixi's texture GC drops
 * the GPU copy of anything not drawn for a while; a random idle sheet nobody
 * has used for IDLE_SHEET_KEEP_MS, and every sheet of a look with no live
 * Glitch for LOOK_KEEP_MS, are freed outright.
 */
import { ANIMS, ANIM_FPS, EMOTIONS, EMOTION_MS, FALL_LOOP, IDLES_TO_RANDOM, RANDOM_IDLE_MS, RANDOM_IDLE_WAIT_MS, SHEET_FRAMES, STAND_ANIM, frameRef } from './avatar-anims.js';
import { NPC_GLITCH_HIRES, NPC_GLITCH_SHEETS } from './npc-glitch-sheets.js?v=npc-glitch-1';
import { mulberry32, nameSeed, npcIdFor, npcIdleTiming } from './npc-glitch-looks.js?v=npc-glitch-1';
import { forgetTexture, frameTexture, onLoaded, sourceFromUrl } from './textures.js';

/** Sheets loaded with the Glitch (walk/stand and the idle4 stand loop). */
export const NPC_CORE_SHEETS = Object.freeze(['base', 'idle4']);
/** Random idles that need their own sheet (idle0 and idle4 do not). */
const RANDOM_SHEETS = Object.freeze(['idle1', 'idle2', 'idle3']);
export const IDLE_SHEET_KEEP_MS = 20000;
export const LOOK_KEEP_MS = 30000;

/**
 * Modes a caller can set, as the player's states (avatarAnimState names):
 * stand idles, walk loops walk2x, lift/fall/land the jump, climb loops,
 * climbPause holds a climb frame. 'jump' = lift then fall, 'drop' = fall,
 * 'dance' = walk2x in place (party guests).
 */
export const NPC_MODES = Object.freeze(['stand', 'walk', 'dance', 'jump', 'lift', 'fall', 'drop', 'land', 'climb', 'climbPause']);

/** The source animation (and loop) a mode plays. */
export function npcAnimFor(mode) {
  switch (mode) {
    case 'walk':
    case 'dance': return { anim: 'walk2x', loop: true };
    case 'jump':
    case 'lift': return { anim: 'jumpOver_lift', loop: false, then: 'jumpOver_fall' };
    case 'fall':
    case 'drop': return { anim: 'jumpOver_fall', loop: false, then: 'fallLoop' };
    case 'land': return { anim: 'jumpOver_land', loop: false };
    case 'climb': return { anim: 'climb', loop: true };
    case 'climbPause': return { anim: 'climb', loop: false, hold: true };
    case 'idle0': return { anim: 'idle0', loop: false };
    case 'idle1': case 'idle2': case 'idle3': return { anim: mode, loop: false };
    case 'idle4':
    case 'stand': return { anim: STAND_ANIM, loop: true };
    case 'hit1': case 'hit2': case 'happy': case 'surprise': case 'angry': return { anim: mode, loop: false };
    default: return { anim: STAND_ANIM, loop: true };
  }
}

/** Swf frames of an animation (fallLoop included). */
function framesOfAnim(anim) {
  return anim === 'fallLoop' ? FALL_LOOP : ANIMS[anim] || ANIMS.idle0;
}

/** The sheet names an animation draws from. */
export function sheetsForAnim(anim) {
  return [...new Set(framesOfAnim(anim).map((fn) => frameRef(fn)?.sheet).filter(Boolean))];
}

/** The NPC look for a name (its roster look, or a stable pick by hash). */
export function npcLookFor(name) {
  return NPC_GLITCH_SHEETS[npcIdFor(name)] || null;
}

/**
 * @param {{ PIXI: any, ticker?: any, stage?: any, hires?: boolean, canvas?: HTMLCanvasElement|null, now?: () => number }} opts
 *   stage: the root container; a Glitch no longer under it for 5 s is
 *   released (street clears remove sprites without destroying them).
 *   idleWaitMs: the stand before a random idle (the client's 15 s; &idledemo
 *   shortens it), varied per Glitch by npcIdleTiming.
 */
export function createNpcGlitchKit({ PIXI, ticker = null, stage = null, hires = false, canvas = null, idleWaitMs = RANDOM_IDLE_WAIT_MS, now = () => performance.now() } = {}) {
  /** id -> { entry, sheets: { name: { source, frames, url, loaded, lastUsed } }, actors: Set, emptySince } */
  const looks = new Map();
  const actors = new Set();
  const useHires = Boolean(hires) && NPC_GLITCH_HIRES > 1;

  function lookState(entry) {
    let st = looks.get(entry.id);
    if (!st) {
      st = { entry, sheets: {}, actors: new Set(), emptySince: null };
      looks.set(entry.id, st);
    }
    return st;
  }

  /** Load (once) one sheet of a look; frames are cut at once and fill in when it arrives. */
  function ensureSheet(st, name) {
    if (st.sheets[name]) {
      st.sheets[name].lastUsed = now();
      return st.sheets[name];
    }
    const def = st.entry.sheets[name];
    if (!def) return null;
    const url = `${st.entry.dir}${useHires ? def.hires : def.file}`;
    const source = sourceFromUrl(url, { raw: true, scaleMode: 'linear' });
    const frames = [];
    for (let i = 0; i < def.cells; i += 1) {
      const c = i % def.cols;
      const r = Math.floor(i / def.cols);
      const tex = frameTexture(source, new PIXI.Rectangle(c * def.fw, r * def.fh, def.fw, def.fh));
      tex.defaultAnchor = { x: def.midX / def.fw, y: def.feetY / def.fh };
      frames.push(tex);
    }
    const sheet = { name, url, source, frames, loaded: false, lastUsed: now() };
    st.sheets[name] = sheet;
    onLoaded(source, () => {
      sheet.loaded = true;
      // Glitches showing the stand-in frame for this sheet switch to the real ones.
      for (const a of st.actors) if (a.waitingFor?.has(name)) a.refresh();
      publish();
    });
    return sheet;
  }

  function releaseSheet(st, name) {
    const sheet = st.sheets[name];
    if (!sheet) return;
    delete st.sheets[name];
    forgetTexture(sheet.url);
    for (const t of sheet.frames) t.destroy(false);
    sheet.source.destroy();
  }

  /**
   * Textures for an animation from the look's loaded sheets; a frame whose
   * sheet is not in yet shows the still stand (base cell 14, swf 801).
   */
  function texturesFor(st, anim, waiting) {
    const list = framesOfAnim(anim);
    const base = ensureSheet(st, 'base');
    return list.map((fn) => {
      const ref = frameRef(fn);
      const sheet = ref && ensureSheet(st, ref.sheet);
      if (sheet && sheet.loaded) return sheet.frames[ref.index];
      if (ref) waiting.add(ref.sheet);
      return base.frames[SHEET_FRAMES.base.indexOf(801)];
    });
  }

  function makeActor(name, { salt = 0, speed = 1 } = {}) {
    const entry = npcLookFor(name);
    if (!entry) return null;
    const st = lookState(entry);
    for (const s of NPC_CORE_SHEETS) ensureSheet(st, s);
    const timing = npcIdleTiming(name, salt, { waitMs: idleWaitMs });
    const rng = mulberry32((nameSeed(name) ^ Math.imul(salt + 7, 0x27d4eb2d)) >>> 0);
    const sprite = new PIXI.AnimatedSprite([st.sheets.base.frames[SHEET_FRAMES.base.indexOf(801)]]);
    sprite.anchor.set(0.5, 1);
    sprite.updateAnchor = true;
    sprite.facesRight = true;
    sprite.loop = true;
    sprite.npcGlitch = entry.id;
    const actor = {
      name,
      id: entry.id,
      sprite,
      scale: 1,
      facesRight: true,
      speed,
      mode: 'stand',
      state: null,
      emotion: null,
      emotionUntil: 0,
      waitingFor: null,
      nextIdleAt: 0,
      idleUntil: 0,
      randomIdle: null,
      upcoming: null,
      hadParent: false,
      orphanSince: null,
      released: false,
      /** What the Glitch is doing (NPC_MODES); idles run by themselves while standing. */
      setMode(mode) {
        const m = NPC_MODES.includes(mode) ? mode : mode === 'idle' ? 'stand' : 'stand';
        if (m === actor.mode) return;
        actor.mode = m;
        update(actor, now());
      },
      /** Play an emotion (happy | surprise | angry) or a hit for `ms`, standing. */
      emote(emotion, ms = EMOTION_MS) {
        if (!EMOTIONS.includes(emotion) && emotion !== 'hit1' && emotion !== 'hit2') return;
        actor.emotion = emotion;
        actor.emotionUntil = now() + ms;
        ensureSheet(st, emotion.startsWith('hit') ? 'base' : emotion);
        update(actor, now());
      },
      /** Re-apply the current state (a sheet just arrived). */
      refresh() {
        const s = actor.state;
        actor.state = null;
        apply(actor, s, { keepFrame: true });
      },
      release() {
        if (actor.released) return;
        actor.released = true;
        actors.delete(actor);
        st.actors.delete(actor);
        if (!st.actors.size) st.emptySince = now();
        publish();
      },
      look: st,
    };
    st.actors.add(actor);
    st.emptySince = null;
    actors.add(actor);
    // Start the stand loop somewhere different for every Glitch.
    actor.loopOffset = timing.loopOffset;
    actor.timing = timing;
    actor.rng = rng;
    update(actor, now());
    publish();
    return actor;
  }

  /**
   * Which state shows now: emotion, a moving mode, a random idle, or the
   * stand. Unlike the player's clock (reset by any step), an NPC's random
   * idle timer keeps running while it wanders, so Glitches that potter
   * about still idle now and then; a random idle waits for the next stand
   * and a step cuts one short.
   */
  function currentState(a, t) {
    if (a.emotion && t < a.emotionUntil) return a.emotion;
    a.emotion = null;
    if (!a.nextIdleAt) a.nextIdleAt = t + a.timing.firstWaitMs;
    if (a.mode !== 'stand') {
      if (a.randomIdle) {
        a.randomIdle = null;
        a.nextIdleAt = t + a.timing.waitMs;
      }
      return a.mode;
    }
    if (a.randomIdle && t >= a.idleUntil) {
      a.randomIdle = null;
      a.nextIdleAt = t + a.timing.waitMs;
    }
    // Pick the next random idle a few seconds early so its sheet can load.
    if (!a.randomIdle && !a.upcoming && t >= a.nextIdleAt - 3000) {
      a.upcoming = IDLES_TO_RANDOM[Math.floor(a.rng() * IDLES_TO_RANDOM.length) % IDLES_TO_RANDOM.length];
      if (RANDOM_SHEETS.includes(a.upcoming)) ensureSheet(a.look, a.upcoming);
    }
    if (!a.randomIdle && a.upcoming && t >= a.nextIdleAt) {
      a.randomIdle = a.upcoming;
      a.upcoming = null;
      a.idleUntil = t + RANDOM_IDLE_MS;
    }
    return a.randomIdle || 'stand';
  }

  function apply(a, state, { keepFrame = false } = {}) {
    if (a.state === state || a.sprite.destroyed) return;
    const prevFrame = a.sprite.currentFrame;
    a.state = state;
    const { anim, loop, then, hold } = npcAnimFor(state);
    const waiting = new Set();
    a.sprite.textures = texturesFor(a.look, anim, waiting);
    a.waitingFor = waiting.size ? waiting : null;
    a.sprite.animationSpeed = (ANIM_FPS / 60) * (a.speed || 1);
    a.sprite.loop = loop;
    a.sprite.onComplete = then
      ? () => {
        if (a.state !== state || a.sprite.destroyed) return;
        const w = new Set();
        a.sprite.textures = texturesFor(a.look, then, w);
        a.sprite.loop = then === 'fallLoop';
        a.sprite.onComplete = then === 'jumpOver_fall'
          ? () => {
            if (a.state !== state || a.sprite.destroyed) return;
            a.sprite.textures = texturesFor(a.look, 'fallLoop', new Set());
            a.sprite.loop = true;
            a.sprite.gotoAndPlay(0);
          }
          : null;
        a.sprite.gotoAndPlay(0);
      }
      : null;
    const n = a.sprite.textures.length;
    let start = 0;
    if (keepFrame) start = Math.min(prevFrame, n - 1);
    else if (state === 'stand') start = a.loopOffset % n;
    if (hold || n < 2) a.sprite.gotoAndStop(start);
    else a.sprite.gotoAndPlay(start);
  }

  function update(a, t) {
    apply(a, currentState(a, t));
  }

  /** Is the sprite on the stage (or, with no stage given, in any container)? */
  function attached(sprite) {
    if (!stage) return Boolean(sprite.parent);
    let p = sprite;
    while (p.parent) p = p.parent;
    return p === stage;
  }

  function sweep(t) {
    for (const a of [...actors]) {
      const s = a.sprite;
      if (s.destroyed) { a.release(); continue; }
      if (attached(s)) {
        a.hadParent = true;
        a.orphanSince = null;
      } else if (a.hadParent) {
        a.orphanSince ??= t;
        if (t - a.orphanSince > 5000) { a.release(); continue; }
      }
      update(a, t);
    }
    for (const [id, st] of looks) {
      if (!st.actors.size && st.emptySince != null && t - st.emptySince > LOOK_KEEP_MS) {
        for (const name of Object.keys(st.sheets)) releaseSheet(st, name);
        looks.delete(id);
        continue;
      }
      for (const name of RANDOM_SHEETS) {
        const sheet = st.sheets[name];
        if (!sheet) continue;
        const inUse = [...st.actors].some((a) => a.state === name || a.upcoming === name);
        if (inUse) sheet.lastUsed = t;
        else if (t - sheet.lastUsed > IDLE_SHEET_KEEP_MS) releaseSheet(st, name);
      }
    }
  }

  let lastSweep = 0;
  let lastPublish = 0;
  function tick() {
    const t = now();
    // States change on timers (idles, emotions): a few checks a second are plenty.
    if (t - lastSweep >= 100) {
      lastSweep = t;
      sweep(t);
    }
    if (t - lastPublish >= 1000) publish();
  }
  ticker?.add?.(tick);

  /** QA: live Glitches, their looks and states, loaded sheets (canvas data-npc-glitch-*). */
  function snapshot() {
    const list = [...actors].filter((a) => !a.released);
    return {
      count: list.length,
      art: `vector-npc-${useHires ? `${NPC_GLITCH_HIRES}x` : '1x'}`,
      names: list.map((a) => a.name),
      looks: list.map((a) => a.id),
      states: list.map((a) => `${a.name}:${a.state}`),
      sheets: [...looks.values()].map((st) => `${st.entry.id}:${Object.keys(st.sheets).filter((n) => st.sheets[n].loaded).join('+')}`),
    };
  }

  function publish() {
    lastPublish = now();
    if (!canvas?.dataset) return;
    const s = snapshot();
    canvas.dataset.npcGlitchCount = String(s.count);
    canvas.dataset.npcGlitchArt = s.art;
    canvas.dataset.npcGlitchNames = s.names.join(',');
    canvas.dataset.npcGlitchLooks = s.looks.join(',');
    canvas.dataset.npcGlitchStates = s.states.join(',');
    canvas.dataset.npcGlitchSheets = s.sheets.join(',');
  }

  return {
    actor: makeActor,
    snapshot,
    tick,
    /** Free every look's sheets now (tests, teardown). */
    releaseAll() {
      for (const a of [...actors]) a.release();
      for (const [id, st] of looks) {
        for (const name of Object.keys(st.sheets)) releaseSheet(st, name);
        looks.delete(id);
      }
    },
  };
}
