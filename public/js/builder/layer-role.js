/**
 * LEVEL BUILDER (spec 6.4, 9.2): a layer's role, the name the deco catalog, the picker's facets
 * and the style rules group layers by. Tiny Speck's layer names are free text ("bg_1", "bg 2",
 * "mtns", "foreground dark", "T_1303509543155"), so the role comes from the name where it says
 * one and from the layer's depth against the middleground where it does not:
 *
 * - middleground: the layer with id "middleground" (the world-space plane);
 * - in front of it (z above): "foreground" when the name says fore/fg, else "middleplus";
 * - behind it: "sky" when the name says sky, cloud, star or infinity, or when it is the
 *   street's deepest layer; else "bg".
 */

export const LAYER_ROLES = Object.freeze(['sky', 'bg', 'middleground', 'middleplus', 'foreground']);

/**
 * PURE: the role of `layer` in `street`.
 * @param {{ id?: string, name?: string, z?: number }} layer
 * @param {{ layers?: { id?: string, z?: number }[] }} [street]
 * @returns {'sky'|'bg'|'middleground'|'middleplus'|'foreground'}
 */
export function layerRole(layer, street = null) {
  if (!layer) return 'bg';
  if (layer.id === 'middleground') return 'middleground';
  const layers = street?.layers || [];
  const middle = layers.find((l) => l.id === 'middleground');
  const mz = Number.isFinite(middle?.z) ? middle.z : 0;
  const z = Number.isFinite(layer.z) ? layer.z : 0;
  const name = `${layer.name || ''} ${layer.id || ''}`.toLowerCase();
  if (z > mz) return /fore|(^|[\s_])fg/.test(name) ? 'foreground' : 'middleplus';
  if (/sky|cloud|star|infinity/.test(name)) return 'sky';
  const deepest = layers.reduce((m, l) => Math.min(m, Number.isFinite(l.z) ? l.z : 0), Infinity);
  if (layers.length > 1 && z === deepest && z < mz) return 'sky';
  return 'bg';
}
