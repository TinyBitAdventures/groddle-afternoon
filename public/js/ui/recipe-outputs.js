/**
 * Every output of a recipe, where the Make panel shows what a recipe gives (player report #103: the
 * Grinder's Crush Beryl, Crush Dullite and Crush Sparkly looked as if they gave only Red Elements,
 * because the tile, the recipe, the making stage and the result drew outputs[0] alone).
 *
 * The Flash client drew outputs[0]'s icon on a recipe (MakingRecipeUI.as:132, MakingDetailsUI.as:310)
 * but said every output when making ended (MakingCompleteUI.as:146-168 getOutputText: "You made
 * 20 Red Elements, 2 Green Elements, and 4 Blue Elements!"), and the Grinder's own Crush said each
 * element too (ore_grinder.js:564-627 onCrushComplete). The remake shows each output, with its count,
 * on the recipe as well, because its Make panel lists the Grinder's crushes as recipes.
 *
 * Multi-output recipes in recipes.json: Crush Beryl, Crush Dullite, Crush Sparkly and Abbasidose
 * (Abbasidose and Diabolic Acid); one output keeps the single big icon.
 */

/** PURE: a recipe's outputs times a count, [{ classTsid, qty }], dropping empty rows. */
export function recipeOutputRows(recipe, times = 1) {
  const n = Math.max(1, Math.floor(Number(times)) || 1);
  return (recipe?.outputs || [])
    .filter((o) => o && o.classTsid)
    .map((o) => ({ classTsid: o.classTsid, qty: (Math.floor(Number(o.qty)) || 1) * n }));
}

/**
 * PURE: "20 Red Elements, 2 Green Elements, and 4 Blue Elements" (MakingCompleteUI getOutputText's
 * list; common.js pretty_list). `label(classTsid, qty)` names one row ("1 Red Element").
 */
export function outputsPhrase(rows, label) {
  const parts = (rows || []).filter((r) => r.qty > 0).map((r) => label(r.classTsid, r.qty));
  if (parts.length < 2) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * PURE: a row of small output icons, each with its count, for a tile, the recipe, the making stage
 * or the result: `<span class="recipe-outs {className}"><span class="recipe-out">img + count</span>…</span>`.
 * The counts read as text too (aria-label on the row; each icon's title names its item).
 * @param {{ classTsid: string, qty: number }[]} rows
 * @param {{ iconUrl: (cls: string) => string, label: (cls: string, qty: number) => string,
 *   escape: (s: string) => string, className?: string, prefix?: string }} opts
 */
export function outputIconsHtml(rows, { iconUrl, label, escape, className = '', prefix = '' }) {
  const shown = (rows || []).filter((r) => r.qty > 0);
  const phrase = outputsPhrase(shown, label);
  const items = shown.map((r) => `<span class="recipe-out" data-out="${escape(r.classTsid)}" title="${escape(label(r.classTsid, r.qty))}"><img src="${escape(iconUrl(r.classTsid))}" alt="" /><b>${prefix}${r.qty}</b></span>`).join('');
  return `<span class="recipe-outs${className ? ` ${className}` : ''}" data-outs="${shown.length}" role="img" aria-label="${escape(phrase)}">${items}</span>`;
}
