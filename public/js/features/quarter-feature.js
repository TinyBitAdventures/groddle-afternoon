/**
 * The Quarter's house lots (register G1186; rules, sources and the remake's choices in
 * js/quarter.js). On a block street (`street.quarter`) each lot is drawn as:
 * - claimed: the house its owner chose for their home street (G796, homes-feature
 *   houseContainer), with its number over the door. Clicking it takes you to the owner's home
 *   street through the visit (G328: features/neighbours-mp-feature.js visitHome, the player
 *   menu's "Visit Home Street"); your own takes you home.
 * - for sale: the lot's meadow house deco with its For Sale sign (door-sign-art.js, the deco's
 *   `sign` clip, DoorView.as 228-232) and its number, and "Claim this lot" (free, one each).
 *
 * Online the claims are everyone's: the realtime server (groddle-afternoon-server quarter.go)
 * checks a claim and asks the site (src/Quarter.php), which keeps it; every player on the block
 * hears `quarter_lots` and reads the owners' houses from the site (GET groddle/v1/quarter/<tsid>).
 * Solo: your own lot (the feature's save slice) and For Sale houses, nobody else.
 *
 * QA: canvas data quarterLots ("1105:7,1115:9"), quarterMine (your lot), quarterLast (the last
 * line); window.groddleQuarter { claim(lot), release(), refresh(), state } on a local host.
 * Solo demo: ?autostart=1&questoffer=off&streetdemo=GQRMM1100BLOCK1 (&quarterlot=1135 claims
 * that lot for you first).
 */

import { anchorBottomCentre } from '../sprite-feet.js?v=849541a8';
import { doorSaleArt } from '../door-sign-art.js?v=69daffff';
import { textureFromUrl, isLoaded, onLoaded } from '../textures.js?v=b8e38103';
import { WORLD_FONT_FAMILY } from '../world-text.js?v=6b49f88c';
import { createMinnAccount } from '../minn-account.js?v=7e3d7279';
import { exposeQA } from '../qa-gate.js?v=f4e2cd82';
import { houseLot } from '../home-house.js?v=3c88c47c';
import { houseContainer, houseOf } from './homes-feature.js?v=e9bdb84e';
import {
  QUARTER_TEXT,
  isQuarterLot,
  isQuarterTsid,
  judgeClaim,
  lotLabel,
  lotOf,
  lotsKey,
  normalizeLots,
  normalizeQuarterSlice,
  refusalText,
} from '../quarter.js?v=6eb35ef4';

export const QUARTER_FEATURE_ID = 'quarter';
const DECO_BASE = 'assets/decos/groddle/';
const HOUSE_Z = 2;
const PLATE_Z = 4;
const REFRESH_GAP_MS = 1500;

let slice = normalizeQuarterSlice(null);
/** The claimed lots now: Map lot -> { owner, house, style }. */
let lots = new Map();
let views = [];
let generation = 0;
let last = '';
/** Online: { client, account, off: [unsubscribe] }. */
let online = null;
let fetching = null;
let fetchedAt = 0;
let pending = '';
let qaExposed = false;

const multiplayer = (engine) => engine?.mode === 'multiplayer' && typeof document !== 'undefined';

function myId(engine) {
  if (!multiplayer(engine)) return -1; // solo: your lot is the slice's
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  return Number(online?.client?.me?.id) || Math.floor(Number(boot.player?.id) || 0);
}

function publish(engine) {
  engine.setData?.('quarterLots', lotsKey(lots));
  engine.setData?.('quarterMine', String(lotOf(lots, myId(engine)) || 0));
  engine.setData?.('quarterLast', last);
}

function tell(engine, line, ms = 3600) {
  if (!line) return;
  last = line;
  engine.toast?.(line, ms);
  engine.pushActivity?.(line);
  publish(engine);
}

/** Solo: the table is your own lot, if any, with your own house. */
function soloLots(engine) {
  const out = new Map();
  if (slice.lot) {
    const home = engine.homeContext?.() || {};
    out.set(slice.lot, { owner: { id: -1, name: engine.pc?.name || 'You' }, house: home.house || null, style: home.style || 'meadow' });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function clearViews(engine) {
  for (const v of views) {
    if (v.target) engine.unregister(v.target);
    for (const child of [v.art, v.plate]) {
      if (!child) continue;
      if (child.parent) child.parent.removeChild(child);
      if (!child.destroyed) child.destroy({ children: true });
    }
  }
  views = [];
}

function plateText(PIXI, text) {
  const plate = new PIXI.Text({ text: String(text), style: {
    fontFamily: WORLD_FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
    fill: 0xfff6dc,
    stroke: { color: 0x3a2a18, width: 3 },
  } });
  anchorBottomCentre(plate, 'text');
  plate.zIndex = PLATE_Z;
  plate.eventMode = 'none';
  return plate;
}

function lotView(engine, at) {
  const { PIXI } = engine;
  // The lots are in world space; the entity layer is in screen space (x - bounds.l, y - bounds.t), as doors are.
  const B = engine.street?.bounds || { l: 0, t: 0 };
  const spot = { ...at, x: at.x - B.l, y: at.y - B.t };
  const row = lots.get(spot.lot) || null;
  let art;
  let plateY;
  let plateX = spot.x;
  if (row) {
    const house = houseOf(row.house || row.style || 'cottage');
    art = houseContainer(PIXI, house);
    const lot = houseLot(house.chassis, house.config, house.facingRight);
    art._worldHitW = Math.max(120, Math.round(lot.bounds.w));
    art._worldHitH = Math.max(120, Math.round(-lot.bounds.t));
    // The number over the house's own door (home-house.js houseLot: the door piece's middle and top).
    plateX = spot.x + lot.door.x;
    plateY = spot.y + lot.door.top - 6;
  } else {
    const sale = doorSaleArt(spot.sprite);
    const tex = textureFromUrl(sale || `${DECO_BASE}${spot.sprite}.png`);
    art = new PIXI.Sprite(tex);
    anchorBottomCentre(art, 'deco');
    const fit = () => {
      if (art.destroyed) return;
      art.width = spot.w;
      art.height = spot.h;
    };
    fit();
    if (!isLoaded(tex.source)) onLoaded(tex.source, fit);
    art._worldHitW = spot.w;
    art._worldHitH = spot.h;
    art.roundPixels = true;
    plateY = spot.y - spot.h - 4;
  }
  art.x = spot.x;
  art.y = spot.y;
  art.zIndex = HOUSE_Z;
  engine.entityLayer.addChild(art);
  const plate = plateText(PIXI, spot.lot);
  plate.x = plateX;
  plate.y = plateY;
  engine.entityLayer.addChild(plate);
  const view = { spot: at, row, art, plate, target: null };
  view.target = engine.register({
    classId: 'quarter_lot',
    featureId: QUARTER_FEATURE_ID,
    label: lotLabel(spot.lot),
    subtitle: row ? QUARTER_TEXT.owned(row.owner.name) : QUARTER_TEXT.forSale,
    sprite: art,
    quarterLot: spot.lot,
  });
  views.push(view);
  return view;
}

function draw(engine) {
  const street = engine.street;
  clearViews(engine);
  if (!street?.quarter || !isQuarterTsid(street.tsid)) return;
  for (const spot of street.quarter.lots || []) lotView(engine, spot);
  publish(engine);
}

/* ------------------------------------------------------------------ */
/* Online                                                              */
/* ------------------------------------------------------------------ */

function onBlock(engine) {
  return Boolean(engine.street?.quarter && isQuarterTsid(engine.street.tsid));
}

/** The owners and their houses from the site, then redrawn. */
async function refresh(engine, { force = false } = {}) {
  if (!online || !onBlock(engine)) return null;
  if (fetching) return fetching;
  if (!force && Date.now() - fetchedAt < REFRESH_GAP_MS) return null;
  const tsid = engine.street.tsid;
  const mine = generation;
  fetching = (async () => {
    try {
      const answer = await online.account.quarter(tsid);
      fetchedAt = Date.now();
      if (mine !== generation || engine.street?.tsid !== tsid) return null;
      lots = normalizeLots(answer?.lots);
      draw(engine);
    } catch (err) {
      console.warn('[quarter]', err?.message || err);
    } finally {
      fetching = null;
    }
    return lots;
  })();
  return fetching;
}

function ensureOnline(engine) {
  if (online || !multiplayer(engine)) return online;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  const off = [];
  const listen = (kind, fn) => {
    const stop = client.on?.(`msg:${kind}`, fn);
    if (typeof stop === 'function') off.push(stop);
  };
  online = { client, account, off };
  // Everyone on the block: the owners changed (a claim or a give-up anywhere on it).
  listen('quarter_lots', (msg) => {
    if (!onBlock(engine) || !isQuarterTsid(msg?.street) || msg.street.slice(1) !== engine.street.tsid.slice(1)) return;
    const next = normalizeLots(msg.lots);
    if (lotsKey(next) !== lotsKey(lots)) refresh(engine, { force: true });
  });
  const answered = (msg) => {
    pending = '';
    if (msg?.status === 'settled') {
      const lot = Number(msg.lot) || 0;
      tell(engine, msg.t === 'quarter_released' ? QUARTER_TEXT.released(lotLabel(lot)) : QUARTER_TEXT.claimed(lotLabel(lot)));
      refresh(engine, { force: true });
    } else {
      tell(engine, msg?.text || refusalText(msg?.why));
      if (msg?.why === 'taken' || msg?.why === 'have') refresh(engine, { force: true });
    }
  };
  listen('quarter_claimed', answered);
  listen('quarter_released', answered);
  return online;
}

/* ------------------------------------------------------------------ */
/* Claiming, giving up, visiting                                       */
/* ------------------------------------------------------------------ */

function claimWhy(engine, lot) {
  const home = engine.homeContext?.() || {};
  const all = (engine.street?.quarter?.lots || []).map((s) => s.lot);
  return judgeClaim({ lots, me: myId(engine), lot, hasHome: home.owned === true, all });
}

function claim(engine, lot) {
  const why = claimWhy(engine, lot);
  if (why) return tell(engine, refusalText(why));
  if (!multiplayer(engine)) {
    slice = { lot };
    lots = soloLots(engine);
    engine.save?.();
    draw(engine);
    return tell(engine, QUARTER_TEXT.claimed(lotLabel(lot)));
  }
  if (!ensureOnline(engine)) return tell(engine, QUARTER_TEXT.off);
  if (pending) return tell(engine, QUARTER_TEXT.busy);
  if (online.client.send?.('quarter_claim', { lot }) === false) return tell(engine, QUARTER_TEXT.off);
  pending = 'claim';
  return true;
}

function release(engine) {
  const lot = lotOf(lots, myId(engine));
  if (!lot) return tell(engine, QUARTER_TEXT.none);
  if (!multiplayer(engine)) {
    slice = { lot: 0 };
    lots = soloLots(engine);
    engine.save?.();
    draw(engine);
    return tell(engine, QUARTER_TEXT.released(lotLabel(lot)));
  }
  if (!ensureOnline(engine)) return tell(engine, QUARTER_TEXT.off);
  if (pending) return tell(engine, QUARTER_TEXT.busy);
  if (online.client.send?.('quarter_release', {}) === false) return tell(engine, QUARTER_TEXT.off);
  pending = 'release';
  return true;
}

/** The front's click: the owner's home street through the visit (G328), or your own home. */
function visit(engine, row) {
  if (!row) return false;
  if (!multiplayer(engine) || row.owner.id === myId(engine)) {
    engine.homeTravel?.('teleport');
    return true;
  }
  if (engine.query?.('visitHome', row.owner.id, row.owner.name, engine) == null) tell(engine, QUARTER_TEXT.off);
  return true;
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const quarterFeature = {
  id: QUARTER_FEATURE_ID,

  /** Solo only: online the lot is the site's (restore leaves the slice empty there). */
  save() {
    return slice.lot ? { lot: slice.lot } : undefined;
  },

  restore(saved, engine) {
    slice = multiplayer(engine) ? normalizeQuarterSlice(null) : normalizeQuarterSlice(saved);
  },

  onStreetEnter(street, engine) {
    generation += 1;
    clearViews(engine);
    pending = '';
    if (!street?.quarter || !isQuarterTsid(street.tsid)) return;
    // QA: &quarterlot=<lot> claims that lot (solo) before the block is drawn.
    const want = Number(engine.param?.('quarterlot'));
    if (!multiplayer(engine) && isQuarterLot(want, (street.quarter.lots || []).map((s) => s.lot)) && !slice.lot) slice = { lot: want };
    if (multiplayer(engine)) {
      // What the last visit knew until the site answers (empty the first time: all For Sale).
      ensureOnline(engine);
      draw(engine);
      refresh(engine, { force: true });
    } else {
      lots = soloLots(engine);
      draw(engine);
    }
    if (!qaExposed) {
      qaExposed = true;
      exposeQA('groddleQuarter', {
        claim: (lot) => claim(engine, Number(lot)),
        release: () => release(engine),
        refresh: () => refresh(engine, { force: true }),
        get state() { return { slice: { ...slice }, lots: lotsKey(lots), last }; },
      });
    }
  },

  onStreetClear(engine) {
    generation += 1;
    clearViews(engine);
  },

  verbsFor(target, engine) {
    const lot = target?.quarterLot;
    if (!lot) return [];
    const row = lots.get(lot);
    if (!row) {
      const why = claimWhy(engine, lot);
      return [{ id: 'quarter_claim', label: QUARTER_TEXT.claimVerb, tooltip: QUARTER_TEXT.claimTip, enabled: !why && !pending, reason: why ? refusalText(why) : '', durationMs: 0 }];
    }
    if (row.owner.id === myId(engine)) {
      return [
        { id: 'quarter_visit', label: QUARTER_TEXT.homeVerb, tooltip: QUARTER_TEXT.homeVerb, enabled: true, durationMs: 0 },
        { id: 'quarter_release', label: QUARTER_TEXT.giveUpVerb, tooltip: QUARTER_TEXT.giveUpVerb, enabled: !pending, durationMs: 0 },
      ];
    }
    // The player menu's verb for another player (InteractionMenuController.as 622-628).
    return [{ id: 'quarter_visit', label: 'Visit Home Street', tooltip: `Visit ${row.owner.name}'s home street`, enabled: true, durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    const lot = target?.quarterLot;
    if (!lot) return false;
    if (verbId === 'quarter_claim') return claim(engine, lot) || true;
    if (verbId === 'quarter_release') return release(engine) || true;
    if (verbId === 'quarter_visit') return visit(engine, lots.get(lot));
    return false;
  },
};

/** For tests: the module's state. */
export function _quarterState() {
  return { slice: { ...slice }, lots, views: views.length, pending, last };
}

export function _resetQuarter() {
  slice = normalizeQuarterSlice(null);
  lots = new Map();
  views = [];
  online = null;
  pending = '';
  last = '';
}
