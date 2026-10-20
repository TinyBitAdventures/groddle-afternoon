/**
 * Player home ownership and travel.
 *
 * Sources:
 * - GameServerJS/players/inc_houses.js
 * - GameServerJS/locations/inc_pols.js
 * - GameServerJS/items/homestreet_ticket_dispenser.js
 *
 * The old real-estate system used a per-location currant cost (1,000 was the
 * server fallback), while the later homestreet ticket selected one of three
 * visual styles. The remake combines those two source-backed flows into one
 * clear deed purchase.
 */

export const HOME_PURCHASE_COST = 1_000;
export const HOME_STREET_TSID = 'RH_HOME_EXT';
export const HOME_INTERIOR_TSID = 'RH_HOME_INT';

export const HOME_STYLES = Object.freeze({
  meadow: Object.freeze({
    id: 'meadow',
    label: 'Meadow',
    description: 'Soft Groddle grass, open sky, and a very optimistic fence.',
    accent: '#74b957',
  }),
  firebog: Object.freeze({
    id: 'firebog',
    label: 'Firebog',
    description: 'Warm peat, luminous spores, and pleasantly unreasonable roots.',
    accent: '#d06d55',
  }),
  uralia: Object.freeze({
    id: 'uralia',
    label: 'Uralia',
    description: 'Dusky stone, purple scrub, and a mysterious amount of moss.',
    accent: '#8667b5',
  }),
});

function finiteInt(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function cleanTsid(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80);
}

function cleanText(value, fallback = '') {
  const text = String(value || '').trim().slice(0, 120);
  return text || fallback;
}

function normalizeReturn(seed = {}) {
  const tsid = cleanTsid(seed?.tsid);
  if (!tsid || tsid === HOME_STREET_TSID || tsid === HOME_INTERIOR_TSID) return null;
  return {
    tsid,
    label: cleanText(seed?.label, tsid),
    hubName: cleanText(seed?.hubName),
    x: Number.isFinite(Number(seed?.x)) ? Number(seed.x) : null,
    y: Number.isFinite(Number(seed?.y)) ? Number(seed.y) : null,
  };
}

export function normalizeHomeState(seed = {}) {
  const style = HOME_STYLES[seed?.style] ? seed.style : 'meadow';
  const owned = seed?.owned === true;
  return {
    owned,
    style,
    purchasedAt: owned ? finiteInt(seed?.purchasedAt) : 0,
    visits: owned ? finiteInt(seed?.visits) : 0,
    inHome: owned && seed?.inHome === true,
    room: seed?.room === 'interior' ? 'interior' : 'street',
    returnLocation: normalizeReturn(seed?.returnLocation),
  };
}

export function createHomeState(seed = {}) {
  return normalizeHomeState(seed);
}

export function quoteHomePurchase(state, player, style = 'meadow') {
  const home = normalizeHomeState(state);
  if (home.owned) {
    return { ok: false, reason: 'already_owned', cost: 0, shortfall: 0 };
  }
  if (!HOME_STYLES[style]) {
    return { ok: false, reason: 'unknown_style', cost: HOME_PURCHASE_COST, shortfall: 0 };
  }
  const currants = finiteInt(player?.currants);
  if (currants < HOME_PURCHASE_COST) {
    return {
      ok: false,
      reason: 'no_money',
      cost: HOME_PURCHASE_COST,
      shortfall: HOME_PURCHASE_COST - currants,
    };
  }
  return { ok: true, reason: '', cost: HOME_PURCHASE_COST, shortfall: 0 };
}

export function purchaseHome(state, player, style = 'meadow', now = Date.now()) {
  const quote = quoteHomePurchase(state, player, style);
  if (!quote.ok) return quote;
  player.currants = finiteInt(player.currants) - quote.cost;
  Object.assign(state, {
    owned: true,
    style,
    purchasedAt: finiteInt(now),
    visits: 0,
    inHome: false,
    room: 'street',
    returnLocation: null,
  });
  return {
    ok: true,
    cost: quote.cost,
    style,
    styleLabel: HOME_STYLES[style].label,
    remainingCurrants: player.currants,
  };
}

export function beginHomeVisit(state, location = {}) {
  const home = normalizeHomeState(state);
  if (!home.owned) return { ok: false, reason: 'not_owned' };
  if (home.inHome) return { ok: false, reason: 'already_home' };
  const returnLocation = normalizeReturn(location);
  Object.assign(state, home, {
    inHome: true,
    room: 'street',
    visits: home.visits + 1,
    returnLocation: returnLocation || home.returnLocation,
  });
  return {
    ok: true,
    tsid: HOME_STREET_TSID,
    label: 'Your Home Street',
    hubName: 'Home',
    style: home.style,
    returnLocation: state.returnLocation,
  };
}

export function enterHomeInterior(state) {
  const home = normalizeHomeState(state);
  if (!home.owned) return { ok: false, reason: 'not_owned' };
  if (!home.inHome) return { ok: false, reason: 'not_home' };
  if (home.room === 'interior') return { ok: false, reason: 'already_inside' };
  Object.assign(state, home, { room: 'interior' });
  return { ok: true, tsid: HOME_INTERIOR_TSID, label: 'Your House', hubName: 'Home' };
}

export function leaveHomeInterior(state) {
  const home = normalizeHomeState(state);
  if (!home.owned || !home.inHome) return { ok: false, reason: 'not_home' };
  if (home.room !== 'interior') return { ok: false, reason: 'already_outside' };
  Object.assign(state, home, { room: 'street' });
  return { ok: true, tsid: HOME_STREET_TSID, label: 'Your Home Street', hubName: 'Home' };
}

export function endHomeVisit(state) {
  const home = normalizeHomeState(state);
  if (!home.inHome) return { ok: false, reason: 'not_home' };
  const returnLocation = home.returnLocation;
  Object.assign(state, home, {
    inHome: false,
    room: 'street',
    returnLocation: null,
  });
  return { ok: true, returnLocation };
}

