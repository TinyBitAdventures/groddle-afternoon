/**
 * A Glitch's animation pack: the sheets a look has in memory, and every source animation
 * (js/avatar-anims.js ANIMS) as frames cut from them. game.js builds the packs
 * (animPackFromSheets) and the sprites play pack.anims[name].
 *
 * A look that is not the default is painted in the browser (js/avatar-compositor.js), six
 * sheets at 3x. Only the base sheet (stand and walk) is painted when the look first shows
 * (G614, Austin 2026-11-09: "paint only a visitor's walk sheet when they arrive, and the rest
 * when first needed"). The other five (LATE_SHEETS: jump, climb and the three emotions) are
 * painted the first time an animation that draws from them is asked for (ensureLateSheet,
 * through the pack's lateLoader), the way the idle sheets always were.
 *
 * Until a sheet is in, every frame that belongs to it shows a stand-in (fillPackAnims), so
 * nothing is ever missing. The stand-ins are the original client's, which loaded an avatar's
 * sheet images the same way (AvatarSSManager.recordAnim: "we do not have it loaded yet"): each
 * animation's standin_frame from the base sheet (AvatarAnimationDefinitions.as: the walk's
 * stride 107 for a jump, the stand 801 for an emotion or an idle), and for the climb, whose
 * standin_frame is 0 "so it falls back to placeholder instead of showing a frame from the side
 * view", the placeholder avatar's own climb frames (here the default look's, pack.placeholder).
 * So a visitor's first jump holds a stride for a beat. When the sheet arrives the frame lists
 * are refilled in place: a sprite keeps the list it was given and its place in it, and shows
 * the real frames from its next step on (redrawFrame shows the one it is on at once). Every
 * sheet is anchored on the standing feet (avatar-compositor sheetLayout), so the Glitch does
 * not move when the frames swap.
 *
 * The player's own look is never drawn from a pack that is still missing sheets
 * (packComplete): game.js paints all of them before the look goes on, so your own jump never
 * holds a frame.
 */

import { AFK_SEQUENCE, ANIMS, CORE_SHEETS, FALL_LOOP, frameRef } from './avatar-anims.js?v=fb921bf4';

/** The sheets a painted look leaves for later, in the order the player's own look paints them. */
export const LATE_SHEETS = Object.freeze(CORE_SHEETS.filter((name) => name !== 'base'));

/** Every animation a pack holds: the source's, the fall's settle loop and the AFK doze. */
const ANIM_FRAMES = Object.freeze({ ...ANIMS, fallLoop: FALL_LOOP, afk: AFK_SEQUENCE });

/** The still stand (swf frame 801, in the base sheet): the stand-in when an animation names no other. */
const STAND = frameRef(801);
/**
 * AvatarAnimationDefinitions.as standin_frame ("must be in base sheet!"): the base-sheet frame an
 * animation shows while its own sheet is not in. The jumps hold the walk's stride 107; every
 * other animation with one holds the stand 801. fallLoop is the tail of the source's
 * jumpOver_fall.
 */
const STAND_IN_FRAMES = Object.freeze({ jumpOver_lift: 107, jumpOver_fall: 107, jumpOver_land: 107, fallLoop: 107 });
/** standin_frame 0: no base frame will do (a side view on a ladder), so the placeholder avatar's own frames show. */
const PLACEHOLDER_ANIMS = Object.freeze(['climb']);

/** The swf frame an animation holds from the base sheet until its own sheet is in. */
export function standInFrame(anim) {
  return STAND_IN_FRAMES[anim] || 801;
}

const ANIM_SHEETS = Object.freeze(Object.fromEntries(Object.entries(ANIM_FRAMES).map(([name, list]) => [
  name,
  Object.freeze([...new Set(list.map((fn) => frameRef(fn)?.sheet).filter(Boolean))]),
])));

/** The sheets an animation draws from ('jumpOver_lift' -> ['jump']). */
export function sheetsForAnim(anim) {
  return ANIM_SHEETS[anim] || [];
}

/** The painted-later sheets an animation draws from (none for the stand and the walk). */
export function lateSheetsForAnim(anim) {
  return sheetsForAnim(anim).filter((name) => LATE_SHEETS.includes(name));
}

/** Give a sheet's frames its feet anchor (def: the sheet's layout, feetY and midX in cell px). */
export function anchorSheetFrames(sheet, def) {
  for (const tex of sheet?.frames || []) tex.defaultAnchor = { x: def.midX / def.fw, y: def.feetY / def.fh };
}

/**
 * Every animation as textures from the pack's sheets; a frame on a sheet that is not in yet
 * (an idle sheet, a late sheet) shows the animation's stand-in: its base-sheet frame, or for
 * the climb the placeholder's own frame (pack.placeholder: { sheets } of the default look,
 * when the pack has one). Fills pack.anims in place and keeps each animation's list object,
 * so a sprite playing a list sees new sheets as they come.
 */
export function fillPackAnims(pack) {
  const { sheets } = pack;
  const base = sheets[STAND.sheet].frames;
  const other = pack.placeholder?.sheets || null;
  for (const [name, list] of Object.entries(ANIM_FRAMES)) {
    const out = pack.anims[name] || (pack.anims[name] = []);
    const standIn = base[frameRef(standInFrame(name)).index] || base[STAND.index];
    const borrow = other && PLACEHOLDER_ANIMS.includes(name);
    for (let i = 0; i < list.length; i++) {
      const ref = frameRef(list[i]);
      out[i] = (ref && sheets[ref.sheet]?.frames?.[ref.index]) || (borrow && ref && other[ref.sheet]?.frames?.[ref.index]) || standIn;
    }
    out.length = list.length;
  }
  return pack;
}

/**
 * True when a sprite playing `anim` from this pack shows a stand-in: `tex` is not a frame of
 * the late sheet the animation draws from (QA: a jump, climb or emotion that is holding).
 */
export function showsStandIn(pack, anim, tex) {
  const late = lateSheetsForAnim(anim);
  if (!late.length || !tex) return false;
  return !late.some((name) => pack?.sheets?.[name]?.frames?.includes(tex));
}

/** True when a pack has every sheet a moving Glitch needs (the default look always; a painted look once its late sheets are in). */
export function packComplete(pack) {
  if (!pack?.sheets?.base) return false;
  return !pack.lateLoader || LATE_SHEETS.every((name) => Boolean(pack.sheets[name]));
}

/**
 * Paint one late sheet into a pack the first time it is needed. pack.lateLoader(name) resolves
 * { def, frames } (or null when the look was freed meanwhile). Resolves true once the frames
 * are in pack.anims, after onReady(pack, name) has let the sprites drawn from it show them.
 * One paint per sheet however many ask; a failed paint may be asked for again.
 */
export function ensureLateSheet(pack, name, { onReady = null, warn = null } = {}) {
  if (!pack?.sheets || !LATE_SHEETS.includes(name)) return Promise.resolve(false);
  if (pack.sheets[name]) return Promise.resolve(true);
  if (!pack.lateLoader || !pack.lateLoading) return Promise.resolve(false);
  if (pack.lateLoading.has(name)) return pack.lateLoading.get(name);
  const job = Promise.resolve()
    .then(() => pack.lateLoader(name))
    .then((sheet) => {
      if (!sheet?.frames?.length) return false;
      if (sheet.def) pack.av.sheets[name] = sheet.def;
      anchorSheetFrames(sheet, pack.av.sheets[name]);
      pack.sheets[name] = sheet;
      fillPackAnims(pack);
      onReady?.(pack, name, sheet);
      return true;
    })
    .catch((err) => {
      pack.lateLoading.delete(name);
      (warn || console.warn)('avatar sheet failed', name, err);
      return false;
    });
  pack.lateLoading.set(name, job);
  return job;
}

/** Ask for every late sheet an animation draws from (nothing to do for a complete pack). */
export function ensureAnimSheets(pack, anim, opts) {
  if (!pack?.lateLoader) return;
  for (const name of lateSheetsForAnim(anim)) if (!pack.sheets[name]) ensureLateSheet(pack, name, opts);
}

/**
 * Show the frame a sprite is on again from its frame list (the list was refilled in place),
 * keeping its place and whether it plays. True when the picture changed.
 */
export function redrawFrame(sprite) {
  const list = sprite?.textures;
  if (!list?.length || sprite.destroyed) return false;
  const tex = list[Math.min(sprite.currentFrame || 0, list.length - 1)];
  if (!tex || sprite.texture === tex) return false;
  sprite.texture = tex;
  if (sprite.updateAnchor && tex.defaultAnchor) sprite.anchor.copyFrom(tex.defaultAnchor);
  return true;
}

/**
 * Frames a freed sheet's texture stays drawable for (G655). Pixi keeps each batch's list of
 * textures until the render group's draw list is rebuilt, and a sprite moved to a texture whose
 * source is already in its batch (a freed idle frame swapped for its stand-in from the base sheet)
 * only updates in place (BatcherPipe checkAndUpdateTexture), so the batch still binds the freed
 * source on the next render. Destroyed there, it threw "Cannot read properties of null (reading
 * 'addressModeU')" (GlTextureSystem.updateStyle on the destroyed source's style). game.js marks the
 * draw lists to be rebuilt and destroys the sheet only after this many frames.
 */
export const RETIRE_FRAMES = 2;

/**
 * A queue of releases that run `frames` ticks after they were added (game.js ticks it once a
 * frame, before that frame's render). A release that throws is reported and dropped.
 */
export function createRetireQueue({ frames = RETIRE_FRAMES, warn = null } = {}) {
  const rows = [];
  return {
    add(release) {
      if (typeof release === 'function') rows.push({ release, left: Math.max(1, frames) });
    },
    tick() {
      const due = [];
      for (let i = rows.length - 1; i >= 0; i--) {
        rows[i].left -= 1;
        if (rows[i].left <= 0) due.push(...rows.splice(i, 1));
      }
      for (const row of due.reverse()) {
        try {
          row.release();
        } catch (err) {
          (warn || console.warn)('texture release failed', err);
        }
      }
      return due.length;
    },
    get size() {
      return rows.length;
    },
  };
}
