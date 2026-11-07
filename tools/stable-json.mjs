/**
 * PURE: `value` with each key where `was` had it; a new key goes at the end, a gone one goes.
 * A builder that deletes and re-adds fields writes through this, so a rerun changes only what
 * really changed (build-street-events.mjs).
 */
export function inOriginalOrder(value, was) {
  if (Array.isArray(value)) return value.map((v, i) => inOriginalOrder(v, Array.isArray(was) ? was[i] : undefined));
  if (!value || typeof value !== 'object') return value;
  const keys = was && typeof was === 'object' && !Array.isArray(was)
    ? [...Object.keys(was).filter((k) => k in value), ...Object.keys(value).filter((k) => !(k in was))]
    : Object.keys(value);
  return Object.fromEntries(keys.map((k) => [k, inOriginalOrder(value[k], was?.[k])]));
}
