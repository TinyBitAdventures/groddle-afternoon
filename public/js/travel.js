/**
 * Shared travel / map destination resolution for playable streets.
 * Pure logic — no DOM/Pixi. Used by signpost T/click and map UI.
 */

/**
 * All known aliases for a street tsid (L/G prefix variants from XML dumps).
 * @param {string} tsid
 * @returns {string[]}
 */
export function tsidAliases(tsid) {
  if (!tsid) return [];
  const out = new Set([tsid]);
  if (tsid.startsWith('L')) out.add('G' + tsid.slice(1));
  if (tsid.startsWith('G')) out.add('L' + tsid.slice(1));
  if (tsid.startsWith('LLI')) out.add('GLI' + tsid.slice(3));
  if (tsid.startsWith('GLI')) out.add('LLI' + tsid.slice(3));
  if (tsid.startsWith('LIF')) out.add('GIF' + tsid.slice(3));
  if (tsid.startsWith('GIF')) out.add('LIF' + tsid.slice(3));
  return [...out];
}

/**
 * Resolve a requested destination to a tsid present in the loaded street set.
 * @param {string} destTsid
 * @param {Set<string>|string[]} availableTsids
 * @returns {string|null}
 */
export function resolveLoadedTsid(destTsid, availableTsids) {
  const avail = availableTsids instanceof Set ? availableTsids : new Set(availableTsids);
  for (const a of tsidAliases(destTsid)) {
    if (avail.has(a)) return a;
  }
  return null;
}

/**
 * @param {object} signpost
 * @param {Set<string>|string[]} availableTsids
 * @returns {{ tsid: string, label: string, hub_id?: string }|null}
 */
export function pickConnection(signpost, availableTsids) {
  const connects = signpost?.connects || [];
  for (const c of connects) {
    const resolved = resolveLoadedTsid(c.tsid, availableTsids);
    if (resolved) {
      const out = {
        tsid: resolved,
        label: c.label || resolved,
        hub_id: c.hub_id,
      };
      // Source arrival point in the target street (build-street-navigation.mjs).
      if (c.arrive) out.arrive = c.arrive;
      return out;
    }
  }
  return null;
}

/**
 * Attempt travel from current street to a destination tsid.
 * Pure: does not load assets — returns a plan the client executes.
 * @param {string} fromTsid
 * @param {string} toTsid
 * @param {Record<string, { label: string, file?: string }>} streetIndex
 */
export function planTravel(fromTsid, toTsid, streetIndex) {
  const available = Object.keys(streetIndex || {});
  const resolved = resolveLoadedTsid(toTsid, available);
  if (!resolved) {
    return {
      ok: false,
      reason: 'not_loaded',
      fromTsid,
      toTsid,
      label: null,
    };
  }
  if (resolveLoadedTsid(fromTsid, [resolved]) === resolved || fromTsid === resolved) {
    return {
      ok: false,
      reason: 'already_here',
      fromTsid,
      toTsid: resolved,
      label: streetIndex[resolved]?.label || resolved,
    };
  }
  return {
    ok: true,
    reason: 'travel',
    fromTsid,
    toTsid: resolved,
    label: streetIndex[resolved]?.label || resolved,
  };
}

/**
 * Build map destinations for UI: all loaded streets with labels.
 * Current street marked; others are clickable travel targets.
 * @param {string} currentTsid
 * @param {Record<string, { label: string }>} streetIndex
 */
export function listMapDestinations(currentTsid, streetIndex) {
  const cur = resolveLoadedTsid(currentTsid, Object.keys(streetIndex)) || currentTsid;
  return Object.entries(streetIndex).map(([tsid, meta]) => ({
    tsid,
    label: meta.label || tsid,
    current: tsid === cur,
    travelable: tsid !== cur,
  }));
}

/**
 * Resolve travel when player uses a nearby signpost (screen X).
 * @param {import('./street-model.js').StreetData} street
 * @param {number} playerScreenX
 * @param {Set<string>|string[]} availableTsids
 * @param {number} [radius=120]
 */
export function planSignpostTravel(street, playerScreenX, availableTsids, radius = 120) {
  if (!street) {
    return { ok: false, reason: 'no_street' };
  }
  // Lazy import pattern avoided — caller passes worldToScreen helper result via signposts
  // We re-implement proximity using street.bounds (same formula as street-model)
  const { l, t } = street.bounds;
  let nearest = null;
  let bestD = radius;
  for (const s of street.signposts || []) {
    const sx = s.x - l;
    const d = Math.abs(sx - playerScreenX);
    if (d <= bestD) {
      bestD = d;
      nearest = s;
    }
  }
  if (!nearest) {
    return { ok: false, reason: 'no_signpost', radius };
  }
  const conn = pickConnection(nearest, availableTsids);
  if (!conn) {
    return {
      ok: false,
      reason: 'not_loaded',
      signpost: nearest,
      labels: (nearest.connects || []).map((c) => c.label),
    };
  }
  return {
    ok: true,
    reason: 'travel',
    fromTsid: street.tsid,
    toTsid: conn.tsid,
    label: conn.label,
    arrive: conn.arrive || null,
    signpost: nearest,
  };
}
