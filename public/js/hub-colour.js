/**
 * PURE (#713): the one place a region's (hub's) colour becomes a CSS colour.
 *
 * Tiny Speck's hub data writes its colours both ways: most as "#7c867c", 19 of the 94 regions
 * (Firozi, Jal, Uralia, Tahli, Kloro, Nottis...) as a bare "7c867c". Glitch read them through
 * StringUtil.cssHexToUint (266-271), which drops an optional leading '#' before parsing, so both
 * forms meant the same colour (LoadingInfo.as 70-74 for the loading card's top_color /
 * btm_color, MapHubButton.as 45-53 for a GO button). A bare one handed to CSS is invalid and
 * the browser drops the whole rule, so every reader of hub colours goes through hubColour.
 */

const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * A hub colour as '#rrggbb' (lower case), with or without its '#', or a 0xRRGGBB number.
 * Anything else (a short '#rgb' too: Glitch would read 'bad' as 0x000bad) gives `fallback`.
 * @param {unknown} value
 * @param {string|null} [fallback]
 * @returns {string|null}
 */
export function hubColour(value, fallback = null) {
  if (typeof value === 'number' && Number.isFinite(value)) return `#${(value >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  const m = HEX.exec(String(value ?? '').trim());
  if (!m) return fallback;
  return `#${m[1].toLowerCase()}`;
}

/**
 * A hub data file with its colours read the Glitch way (color, top_color, btm_color and the
 * occasional bottom_color). A missing or unreadable colour is left out, so callers keep their
 * own fallbacks. Returns a new object; the rest of the hub is shared.
 * @template {object} T
 * @param {T} hub
 * @returns {T}
 */
export function withHubColours(hub) {
  if (!hub || typeof hub !== 'object') return hub;
  const out = { ...hub };
  for (const key of ['color', 'top_color', 'btm_color', 'bottom_color']) {
    if (!(key in out)) continue;
    const c = hubColour(out[key]);
    if (c) out[key] = c;
    else delete out[key];
  }
  return out;
}
