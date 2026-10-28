/**
 * One entry point for every sound effect: playSound(key).
 *
 * A key plays its recovered file when js/sound-keys.js lists one (loaded
 * lazily, decoded once, cached), otherwise its Web Audio recipe from
 * js/synth-sfx.js. While a file is still loading, a key with a recipe plays
 * the recipe instead of arriving late; voice and music keys (no recipe) play
 * when their file is ready. All SFX run through one bus under the game's
 * mute gain. The client defaulted SFX and music both to 0.6
 * (SoundManager.DEFAULT_SFX_VOLUME); the remake's BGM sits at 0.26, so the SFX
 * bus defaults to 0.7 to keep the same balance (?sfxvol=0..1 overrides).
 */

import { SOUND_ALIASES, SOUND_CATEGORIES, SOUND_FILES } from './sound-keys.js?v=g388-1';
import { playSynthRecipe, recipeForKey } from './synth-sfx.js?v=g388-1';
import { legacySoundKey } from './sound-moments.js';

export const DEFAULT_SFX_VOLUME = 0.7;
const LATE_FILE_MS = 350;
const VOICE_LATE_MS = 6000;
const MIN_REPEAT_MS = 35;
const MAX_VOICES = 14;

/**
 * Resolve a key (or legacy id) to what would play.
 * @param {string} name
 * @returns {{ key: string, file: string|null, recipe: string|null, category: string }}
 */
export function resolveSound(name) {
  const key = legacySoundKey(name);
  const category = SOUND_CATEGORIES[key] || '';
  const file = SOUND_FILES[key] || SOUND_FILES[SOUND_ALIASES[key]] || null;
  return { key, file, recipe: recipeForKey(key, category), category };
}

/**
 * @param {{
 *   getContext: () => AudioContext|null,
 *   getDestination: () => AudioNode|null,
 *   isMuted?: () => boolean,
 *   fetchImpl?: typeof fetch,
 *   volume?: number,
 *   now?: () => number,
 *   onPlayed?: (last: string) => void,
 * }} host
 */
export function createSoundBoard(host) {
  const fetchImpl = host.fetchImpl || ((...args) => fetch(...args));
  const now = host.now || (() => performance.now());
  const buffers = new Map(); // url → AudioBuffer
  const pending = new Map(); // url → Promise<AudioBuffer|null>
  const failed = new Set();
  const lastPlayed = new Map();
  const voices = new Set();
  let bus = null;
  let busCtx = null;
  let busDestination = null;
  let volume = Number.isFinite(host.volume) ? host.volume : DEFAULT_SFX_VOLUME;
  const stats = { file: 0, synth: 0, skipped: 0, last: '' };

  function output() {
    const ctx = host.getContext();
    const destination = host.getDestination();
    if (!ctx || !destination) return null;
    if (!bus || busCtx !== ctx || busDestination !== destination) {
      bus = ctx.createGain();
      bus.gain.value = volume;
      bus.connect(destination);
      busCtx = ctx;
      busDestination = destination;
    }
    return { ctx, bus };
  }

  function load(url) {
    if (buffers.has(url)) return Promise.resolve(buffers.get(url));
    if (failed.has(url)) return Promise.resolve(null);
    if (pending.has(url)) return pending.get(url);
    const ctx = host.getContext();
    if (!ctx) return Promise.resolve(null);
    const promise = fetchImpl(url)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((bytes) => (bytes ? ctx.decodeAudioData(bytes) : null))
      .then((buffer) => {
        pending.delete(url);
        if (buffer) buffers.set(url, buffer);
        else failed.add(url);
        return buffer;
      })
      .catch(() => {
        pending.delete(url);
        failed.add(url);
        return null;
      });
    pending.set(url, promise);
    return promise;
  }

  function track(handle, seconds) {
    voices.add(handle);
    // unref: a looping voice (600 s) must not hold a Node test runner open.
    setTimeout(() => voices.delete(handle), Math.ceil((seconds + 0.3) * 1000))?.unref?.();
    return handle;
  }

  function voiceGain(ctx, volumeScale) {
    const out = output();
    if (!out) return null;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(2, volumeScale));
    g.connect(out.bus);
    return g;
  }

  function stopper(ctx, gain, src) {
    return () => {
      try {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
        if (src) src.stop(t + 0.1);
      } catch { /* already stopped */ }
    };
  }

  function playBuffer(resolved, buffer, opts) {
    const ctx = host.getContext();
    const gain = voiceGain(ctx, opts.volume ?? 0.8);
    if (!gain) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.max(0.25, Math.min(4, opts.rate ?? 1));
    if (opts.loop) src.loop = true;
    src.connect(gain);
    src.start(0);
    if (opts.maxSeconds) {
      // Fade the last 120 ms so a capped long take does not click.
      const end = ctx.currentTime + opts.maxSeconds;
      gain.gain.setValueAtTime(gain.gain.value, Math.max(ctx.currentTime, end - 0.12));
      gain.gain.linearRampToValueAtTime(0.0001, end);
      src.stop(end + 0.02);
    }
    src.onended = () => { try { gain.disconnect(); } catch { /* */ } };
    stats.file += 1;
    stats.last = `${resolved.key}:file`;
    host.onPlayed?.(stats.last);
    const seconds = opts.loop ? 600 : buffer.duration / (opts.rate ?? 1);
    return track({ key: resolved.key, kind: 'file', stop: stopper(ctx, gain, src) }, seconds);
  }

  function playRecipe(resolved, opts) {
    const ctx = host.getContext();
    if (!resolved.recipe) return null;
    const gain = voiceGain(ctx, 1);
    if (!gain) return null;
    const seconds = playSynthRecipe(ctx, gain, resolved.recipe, {
      volume: opts.volume ?? 0.8,
      rate: opts.rate ?? 1,
      variant: opts.variant,
      seed: opts.seed ?? Math.floor(Math.random() * 1000),
    });
    setTimeout(() => { try { gain.disconnect(); } catch { /* */ } }, Math.ceil((seconds + 0.5) * 1000));
    stats.synth += 1;
    stats.last = `${resolved.key}:synth:${resolved.recipe}`;
    host.onPlayed?.(stats.last);
    return track({ key: resolved.key, kind: 'synth', recipe: resolved.recipe, stop: stopper(ctx, gain, null) }, seconds);
  }

  /**
   * Play a sound key (or legacy id).
   * @param {string} name
   * @param {{ volume?: number, rate?: number, jitter?: number, variant?: number, seed?: number,
   *   allowMultiple?: boolean, loop?: boolean, maxSeconds?: number, synth?: boolean }} [opts]
   */
  function play(name, opts = {}) {
    if (host.isMuted?.()) return null;
    const out = output();
    if (!out) return null;
    const resolved = resolveSound(name);
    if (!resolved.file && !resolved.recipe) {
      stats.skipped += 1;
      return null;
    }
    const t = now();
    if (!opts.allowMultiple && lastPlayed.has(resolved.key) && t - lastPlayed.get(resolved.key) < MIN_REPEAT_MS) return null;
    if (voices.size >= MAX_VOICES) {
      stats.skipped += 1;
      return null;
    }
    lastPlayed.set(resolved.key, t);
    const jitter = Number(opts.jitter) || 0;
    const rate = (opts.rate ?? 1) * (jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1);
    const playOpts = { ...opts, rate };
    if (resolved.file && !opts.synth) {
      const buffer = buffers.get(resolved.file);
      if (buffer) return playBuffer(resolved, buffer, playOpts);
      const requested = now();
      const late = resolved.recipe ? LATE_FILE_MS : VOICE_LATE_MS;
      let fallback = null;
      load(resolved.file).then((loaded) => {
        if (!loaded || fallback || now() - requested > late || host.isMuted?.()) return;
        playBuffer(resolved, loaded, playOpts);
      });
      if (!resolved.recipe) return { key: resolved.key, kind: 'loading', stop() {} };
      // Cold file with a recipe: give the fetch a moment, then fall back to
      // the recipe rather than arriving late. The file is warm next time.
      setTimeout(() => {
        if (buffers.has(resolved.file) || host.isMuted?.()) return;
        fallback = playRecipe(resolved, playOpts);
      }, LATE_FILE_MS);
      return { key: resolved.key, kind: 'loading', stop() { fallback?.stop(); } };
    }
    return playRecipe(resolved, playOpts);
  }

  /**
   * Repeat a key while an action runs. Files loop natively; recipes re-fire
   * every intervalMs. A cold file ticks its recipe until the file arrives, then
   * hands over to the native loop. Returns a handle whose stop() ends the loop.
   */
  function loop(name, { intervalMs = 650, durationMs = 0, volume = 0.6, rate = 1, jitter = 0.04 } = {}) {
    const resolved = resolveSound(name);
    if (!resolved.file && !resolved.recipe) return { stop() {} };
    let stopped = false;
    let current = null;
    let timer = null;
    const endAt = durationMs > 0 ? now() + durationMs : Infinity;
    if (resolved.file && buffers.has(resolved.file)) {
      current = play(resolved.key, { volume, rate, loop: true, allowMultiple: true, maxSeconds: durationMs ? durationMs / 1000 : 0 });
    } else {
      if (resolved.file) load(resolved.file);
      const tick = () => {
        if (stopped || now() >= endAt) return;
        if (resolved.file && buffers.has(resolved.file)) {
          const left = endAt === Infinity ? 0 : (endAt - now()) / 1000;
          current = play(resolved.key, { volume, rate, loop: true, allowMultiple: true, maxSeconds: left });
          return;
        }
        current = resolved.recipe
          ? play(resolved.key, { volume, rate, jitter, allowMultiple: true, synth: true, seed: Math.floor(Math.random() * 1000) })
          : null;
        timer = setTimeout(tick, resolved.recipe ? intervalMs : 120);
      };
      tick();
    }
    return {
      key: resolved.key,
      stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        if (current?.kind === 'file') current.stop();
      },
    };
  }

  function preload(names = []) {
    return Promise.all(names.map((n) => resolveSound(n).file).filter(Boolean).map((url) => load(url)));
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (bus) bus.gain.value = volume;
  }

  function stopAll() {
    for (const v of voices) v.stop?.();
    voices.clear();
  }

  return {
    play,
    loop,
    preload,
    resolve: resolveSound,
    setVolume,
    stopAll,
    get volume() { return volume; },
    get stats() { return { ...stats, voices: voices.size, cached: buffers.size }; },
  };
}

/**
 * Play open/close sounds whenever a panel's `hidden` attribute flips, so
 * panels need no per-function sound calls.
 * @param {Document} doc
 * @param {(key: string, opts?: object) => unknown} playSound
 * @param {(id: string, open: boolean) => string} keyFor
 */
export function watchPanelSounds(doc, playSound, keyFor, selector = '.side-panel, .glitch-modal, .home-panel, .mail-panel, .map-panel') {
  if (!doc || typeof MutationObserver === 'undefined') return null;
  let lastOpenAt = 0;
  const observer = new MutationObserver((records) => {
    const opened = [];
    const closed = [];
    for (const r of records) {
      const el = r.target;
      if (!(el instanceof Element) || !el.matches(selector)) continue;
      const wasHidden = r.oldValue !== null;
      const isHidden = el.hidden;
      if (wasHidden && !isHidden) opened.push(el.id);
      else if (!wasHidden && isHidden) closed.push(el.id);
    }
    const t = performance.now();
    if (opened.length) {
      lastOpenAt = t;
      playSound(keyFor(opened[opened.length - 1], true), { volume: 0.55 });
    } else if (closed.length && t - lastOpenAt > 60) {
      playSound(keyFor(closed[closed.length - 1], false), { volume: 0.45 });
    }
  });
  doc.querySelectorAll(selector).forEach((el) => {
    observer.observe(el, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
  });
  return observer;
}

/**
 * Soft CLICK_SUCCESS on enabled buttons inside panels and dialogs, and
 * CLICK_FAILURE when a disabled one is pressed (client ImgCardUI etc).
 */
export function watchButtonClicks(doc, playSound, selector = '.side-panel, .glitch-modal, .home-panel, .mail-panel, .map-panel, .pack-popover, .award-screen, #quest-offer, .quest-offer') {
  if (!doc) return;
  doc.addEventListener('pointerdown', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button || !button.closest(selector)) return;
    const disabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
    playSound(disabled ? 'CLICK_FAILURE' : 'CLICK_SUCCESS', { volume: disabled ? 0.4 : 0.32 });
  }, true);
}
