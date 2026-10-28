/**
 * Player home ownership and travel.
 *
 * Sources:
 * - GameServerJS/players/inc_houses.js
 * - GameServerJS/locations/inc_pols.js
 * - GameServerJS/items/homestreet_ticket.js
 * - GameServerJS/items/homestreet_ticket_dispenser.js
 *
 * G208: homes follow the 2012 game. houses_go_to_new_house
 * (players/inc_houses.js 807-914) made the house and home street on demand,
 * for free: no currants and no Your Papers (those belonged to the older
 * real-estate sale, pols_buyHouse in locations/inc_pols.js 45-49, not to the
 * 2012 home streets). New players picked the street's
 * style with the Magic Rock's free Home Street Ticket
 * (locations/newxp_training2.js 714-746); js/home-ticket.js is that ticket.
 * The remake's old 1,000-currant deed is retired; saves that bought one keep
 * their home (`owned` is read as before).
 */

export const HOME_STREET_TSID = 'RH_HOME_EXT';
export const HOME_INTERIOR_TSID = 'RH_HOME_INT';

// The three home styles; no blurbs (Austin, desk STYLECOPY): the Selection Machine had none
// (homestreet_ticket_dispenser.js description is empty), only "Pick <Style> Style".
export const HOME_STYLES = Object.freeze({
  meadow: Object.freeze({
    id: 'meadow',
    label: 'Meadow',
    accent: '#74b957',
  }),
  firebog: Object.freeze({
    id: 'firebog',
    label: 'Firebog',
    accent: '#d06d55',
  }),
  uralia: Object.freeze({
    id: 'uralia',
    label: 'Uralia',
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

/**
 * houses_go_to_new_house (players/inc_houses.js 807-914): the home street and
 * house are imagined, free, in the chosen style. `purchasedAt` keeps its old
 * save name: it is when the home was made.
 */
export function imagineHome(state, style = 'meadow', now = Date.now()) {
  const home = normalizeHomeState(state);
  if (home.owned) return { ok: false, reason: 'already_owned' };
  if (!HOME_STYLES[style]) return { ok: false, reason: 'unknown_style' };
  Object.assign(state, {
    owned: true,
    style,
    purchasedAt: finiteInt(now),
    visits: 0,
    inHome: false,
    room: 'street',
    returnLocation: null,
  });
  return { ok: true, style, styleLabel: HOME_STYLES[style].label };
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
    hubName: 'Homes',
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
  return { ok: true, tsid: HOME_INTERIOR_TSID, label: 'Your House', hubName: 'Homes' };
}

export function leaveHomeInterior(state) {
  const home = normalizeHomeState(state);
  if (!home.owned || !home.inHome) return { ok: false, reason: 'not_home' };
  if (home.room !== 'interior') return { ok: false, reason: 'already_outside' };
  Object.assign(state, home, { room: 'street' });
  return { ok: true, tsid: HOME_STREET_TSID, label: 'Your Home Street', hubName: 'Homes' };
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

