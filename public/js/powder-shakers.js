/**
 * A powder's own jar, puffing: pure rules and the sheets (features/powders-feature.js plays them
 * through js/item-overlay.js; tests/small-animations.test.js).
 *
 * Source: glitch-GameServerJS items/<powder>.js (CC0), the same block in each of the nine, e.g.
 * fertilidust.js 415-486: when a powder is used and its verb is not 'apply' (none of these is), a
 * pc_overlay on the one who used it for 3000 ms, item_class the powder, state tool_animation,
 * delta_y -120, width and height 60. Everyone else sees a 40 x 40 bubble over them. The charge
 * goes after it (488), and each powder's own effect runs from the same call.
 *
 * The art: Tiny Speck's OGA `<powder>__x1_tool_animation` sheets (CC0), measured. Eight are 864
 * px wide: 18 x 5 cells of 48 px (160 to 169 high), all 90 drawn, the 90 frames of their SWF's
 * scene: one puff from the jar in the overlay's 3 s at 30 frames a second. (Read as 9 x 5 cells
 * of 96 px they show two jars side by side.) No-No Powder is 996 x 171: 12 x 3 cells of 83 x 57,
 * 35 drawn, its scene's 35 frames, looping as every tool_animation does.
 * There are no 3x twins, on purpose: the jar is fitted to 60 px, so a 48 x 160 cell is drawn at 18 x
 * 60, well under its own size, and the nine 3x renders (they match the SWFs, 0.91 to 0.98) came to
 * 17 MB of fine powder nobody would see.
 * Until 2026-11-10 a powder showed only its effect.
 */

import { PACKED_SHEETS } from './packed-sheets-data.js?v=32023e3a';

/** The pc_overlay: 3000 ms, 120 px over the feet, fitted to 60 px. */
export const POWDER_SHAKE = Object.freeze({ ms: 3000, deltaY: -120, wh: 60 });

/** A powder's packed tool_animation sheet, or null (Krazy Salts has none). */
export function powderShakerSheet(classTsid) {
  return PACKED_SHEETS.powders?.[String(classTsid || '')] || null;
}
