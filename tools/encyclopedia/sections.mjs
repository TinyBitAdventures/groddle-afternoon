/**
 * The encyclopedia's sections added on 2026-11-05 (Austin): Imagination
 * upgrades, Recipes (by tool), Buffs, Feats and street projects, and Giants.
 * Each lives in its own module and exports SECTION:
 *
 *   key, label, one, blurb   as data.mjs ALL_SECTIONS rows
 *   groupWord                the section list's filter label ("Kind")
 *   sample                   the entry whose picture its home card shows
 *   css                      an extra stylesheet for its pages, or ''
 *   tilePic(e)               optional: the section list's card picture as tile
 *                            options ({ pic, size, cls }), when not the icon
 *   add(ctx)                 adds its entries (ctx: data.mjs loadEncyclopedia's
 *                            add, entries, items, keyOf, nameOf, picture,
 *                            itemIcon, recipes, skills, ecology)
 *   page(e, P, o)            one entry's <header> and <main> (o.kit: build.mjs's
 *                            band, sub, paras, entryHead, verbList, learnTime)
 *
 * data.mjs and build.mjs register the list; nothing else names a section here.
 */
import { SECTION as imagination } from './imagination.mjs';
import { SECTION as recipes } from './recipes.mjs';
import { SECTION as buffs } from './buffs.mjs';
import { SECTION as feats } from './feats.mjs';
import { SECTION as giants } from './giants.mjs';

export const MORE_SECTIONS = [imagination, recipes, buffs, feats, giants];

export function addMoreSections(ctx) {
  for (const s of MORE_SECTIONS) s.add(ctx);
}

export const MORE_PAGES = Object.fromEntries(MORE_SECTIONS.map((s) => [s.key, s.page]));
