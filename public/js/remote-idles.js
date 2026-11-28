/**
 * #769: other players' Glitches idle as yours does. Glitch drew every avatar on screen from the
 * state its owner sent (AbstractAvatarView _animateAndOrientFromS): standing is STAND, the idle4
 * loop (AvatarAnimationState DEFAULT_IDLE_STR), and the owner's random idles (idle0 to idle4)
 * and the AFK doze come over as states of their own. The remote drew `stand` as the still frame
 * and never loaded another player's idle sheets, so others stood frozen.
 *
 * The idle sheets are big (idle4 at 3x is about 19 MB decoded, a random idle up to 25 MB) and a
 * painted look bakes its own, so they load lazily and under a cap (ours: Glitch loaded every
 * sheet it was asked for):
 * - Looks drawn from your own idle sheets (yours, or the default look's files when you wear it)
 *   cost nothing more and always idle.
 * - Up to `cap` other looks (REMOTE_IDLE_LOOKS, REMOTE_IDLE_LOOKS_PHONE on a phone or a device
 *   that reports little memory) get idle sheets, in the order their players arrived; the rest
 *   stand still as before until a slot frees.
 * - idle4 loads after a player has stood REMOTE_IDLE_STAND_MS (as your own does), the doze
 *   when they go AFK, a random idle when they start one; one load at a time across the street,
 *   and one random idle sheet at a time across the other looks.
 * - A random idle's or the doze's sheet goes when no one in that look plays it; a look that
 *   loses its slot (its players left) gives back every idle sheet.
 *
 * Pure of Pixi and game.js: `ensure(pack, name)` (a promise, game.js ensureIdleSheet) and
 * `drop(pack, name)` (game.js dropIdleSheet, which never frees a sheet your own Glitch uses)
 * come from engine.glitchIdleSheet / engine.dropGlitchIdleSheet.
 */

import { idleSheetFor } from './avatar-anims.js?v=fb921bf4';

/** Other looks that get idle sheets at once (each holds idle4, about 19 MB at 3x). */
export const REMOTE_IDLE_LOOKS = 3;
/** The same on a phone, or a device that reports under 4 GB (navigator.deviceMemory). */
export const REMOTE_IDLE_LOOKS_PHONE = 1;
/** A player stands this long before their idle4 loads (game.js IDLE_TIMING.standPreloadMs). */
export const REMOTE_IDLE_STAND_MS = 2000;
/** The sheets a look gives back as soon as no one in it plays them. */
const PASSING_SHEETS = Object.freeze(['idle1', 'idle2', 'idle3', 'idleSleepy']);
const RANDOM_SHEETS = Object.freeze(['idle1', 'idle2', 'idle3']);

/** PURE: how many other looks idle on this device. */
export function remoteIdleCap({ phone = false, deviceMemory = null } = {}) {
  if (phone || (deviceMemory != null && Number(deviceMemory) < 4)) return REMOTE_IDLE_LOOKS_PHONE;
  return REMOTE_IDLE_LOOKS;
}

/**
 * PURE: the idle sheet a Glitch in state `st` needs now (null: none), having stood `stoodMs`.
 * idle0 is the still stand frame, in the base sheet.
 */
export function remoteIdleSheet(st, stoodMs = 0, standMs = REMOTE_IDLE_STAND_MS) {
  if (st === 'stand') return stoodMs >= standMs ? 'idle4' : null;
  return idleSheetFor(st);
}

/**
 * The controller. `own()` is the pack your own Glitch is drawn with (or null). Call step(remotes,
 * now) each frame with the drawn remotes ({ pack, st }); idles(r) says whether a remote draws
 * its idles (animForState idles); onReady(pack) runs when a sheet came in (redraw from it).
 */
export function createRemoteIdles({ ensure, drop, own = () => null, cap = REMOTE_IDLE_LOOKS, standMs = REMOTE_IDLE_STAND_MS, onReady = () => {} } = {}) {
  /** Looks (by their idle loader: one loader, one source of sheets) holding a slot. */
  const slots = new Set();
  /** The packs last seen for each slotted look (two keys of one look are two packs), to give their sheets back. */
  const packsOf = new Map();
  /** Since when each remote has stood. */
  const stood = new WeakMap();
  let loading = null;
  const stats = { loads: 0, drops: 0, refused: 0 };

  const ownLoader = () => own()?.idleLoader || null;
  const shared = (pack) => Boolean(pack?.idleLoader) && pack.idleLoader === ownLoader();
  const idles = (r) => Boolean(r?.pack?.idleLoader) && (shared(r.pack) || slots.has(r.pack.idleLoader));

  function giveBack(packs, names) {
    for (const pack of packs || []) {
      for (const name of names) {
        if (!pack?.sheets?.[name]) continue;
        if (drop(pack, name)) stats.drops += 1;
      }
    }
  }

  function step(remotes, now) {
    const list = [...remotes].filter((r) => r && r.pack);
    // Slots: looks gone from the street give theirs back, then new looks fill them in arrival order.
    const inUse = new Map();
    for (const r of list) {
      const loader = r.pack.idleLoader;
      if (!loader || shared(r.pack) || r.pack.pending) continue;
      if (!inUse.has(loader)) inUse.set(loader, new Set());
      inUse.get(loader).add(r.pack);
    }
    for (const loader of [...slots]) {
      if (inUse.has(loader)) continue;
      slots.delete(loader);
      const packs = packsOf.get(loader);
      packsOf.delete(loader);
      // Now yours (you put the look on): your own Glitch keeps them.
      if (loader !== ownLoader()) giveBack(packs, ['idle4', ...PASSING_SHEETS]);
    }
    for (const [loader, packs] of inUse) {
      if (!slots.has(loader)) {
        if (slots.size >= cap) {
          stats.refused += 1;
          continue;
        }
        slots.add(loader);
      }
      packsOf.set(loader, packs);
    }
    // What each idling Glitch needs now: by pack (to load into) and by look (to keep).
    const wantPack = new Map();
    const wantLook = new Map();
    for (const r of list) {
      const st = r.st;
      if (st === 'stand') {
        if (!stood.has(r)) stood.set(r, now);
      } else stood.delete(r);
      if (!idles(r)) continue;
      const name = remoteIdleSheet(st, st === 'stand' ? now - stood.get(r) : 0, standMs);
      if (!name) continue;
      if (!wantPack.has(r.pack)) wantPack.set(r.pack, new Set());
      wantPack.get(r.pack).add(name);
      const loader = r.pack.idleLoader;
      if (!wantLook.has(loader)) wantLook.set(loader, new Set());
      wantLook.get(loader).add(name);
    }
    // Give back what no one in a slotted look plays (yours manages its own).
    for (const loader of slots) {
      const want = wantLook.get(loader) || new Set();
      giveBack(packsOf.get(loader), PASSING_SHEETS.filter((name) => !want.has(name)));
    }
    if (loading) return;
    // One random idle sheet at a time across the other looks.
    const randomHeld = [...slots].some((loader) => [...(packsOf.get(loader) || [])].some((pack) => RANDOM_SHEETS.some((name) => pack.sheets?.[name])));
    for (const [pack, names] of wantPack) {
      for (const name of names) {
        if (pack.sheets?.[name]) continue;
        if (RANDOM_SHEETS.includes(name) && !shared(pack) && randomHeld) continue;
        stats.loads += 1;
        loading = Promise.resolve(ensure(pack, name))
          .catch(() => false)
          .then((ok) => {
            loading = null;
            if (ok) onReady(pack, name);
          });
        return;
      }
    }
  }

  /** Every slot given back (leaving multiplayer, or the street emptied). */
  function clear() {
    for (const [loader, packs] of packsOf) if (loader !== ownLoader()) giveBack(packs, ['idle4', ...PASSING_SHEETS]);
    slots.clear();
    packsOf.clear();
  }

  return {
    step,
    idles,
    clear,
    get cap() {
      return cap;
    },
    stats: () => ({ ...stats, slots: slots.size, loading: Boolean(loading) }),
  };
}
