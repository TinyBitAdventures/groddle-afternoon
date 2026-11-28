/**
 * The vendor finder (G774, report #351): the currants in the top bar open a small panel of the
 * vendors near you by what they sell (js/ui/topbar.js installCurrants), and a row sets the nearest
 * one as your destination, as the favor panel's Giants find their closest Shrine (#258). Rules and
 * words: js/vendor-finder.js. The route is the Map's (features/map-routes-feature.js): 'find' for
 * the rows, 'set' for a click, so a street under construction is passed over when an open one has
 * the same vendor (G780).
 *
 * Hooks (game.js passes them to the top bar): query('vendorFinderRows', engine) -> rows with
 * `where` (the street and how far), query('vendorFinderFind', key, engine) -> the route's answer.
 * QA canvas data: vendorFinder (`<key>@<street>`, `<key>@here`, `<key>:<error>`).
 */
import { getStreetEcologyCatalog } from '../street-ecology.js?v=36fd044b';
import { STREET_INDEX } from '../street-loader.js?v=23555e53';
import { VENDOR_FINDER_TEXT, sameStreet, vendorFinderRows, vendorKinds, vendorRowWhere } from '../vendor-finder.js?v=7fbfc51d';

export const VENDOR_FINDER_FEATURE_ID = 'vendor-finder';

let kindsCache = null;
let kindsFrom = null;

/** The kinds of vendor and their streets, once the street catalog is in. */
function kinds() {
  const eco = getStreetEcologyCatalog();
  if (!eco?.streets || !Object.keys(eco.streets).length) return [];
  if (kindsFrom !== eco) {
    kindsCache = vendorKinds(eco, STREET_INDEX);
    kindsFrom = eco;
  }
  return kindsCache;
}

function streetLabel(tsid) {
  const t = String(tsid || '');
  return (STREET_INDEX.streets?.[t] || STREET_INDEX.streets?.[t.replace(/^L/, 'G')])?.label || '';
}

export const vendorFinderFeature = {
  id: VENDOR_FINDER_FEATURE_ID,

  vendorFinderRows(engine) {
    const rows = vendorFinderRows(kinds(), {
      here: engine?.streetTsid || '',
      find: (streets) => engine?.query?.('mapRoute', 'find', { to: streets }, engine) || null,
    });
    return rows.map((r) => ({ ...r, where: vendorRowWhere(r, streetLabel), tip: VENDOR_FINDER_TEXT.rowTip(r.label) }));
  },

  vendorFinderFind(key, engine) {
    const kind = kinds().find((k) => k.key === key);
    if (!kind || !engine) return null;
    const say = (line, ms = 4000) => {
      engine.toast?.(line, ms);
      return line;
    };
    if (kind.streets.some((t) => sameStreet(t, engine.streetTsid))) {
      say(VENDOR_FINDER_TEXT.hereLine(kind), 3200);
      engine.setData?.('vendorFinder', `${key}@here`);
      return { ok: true, here: true };
    }
    const res = engine.query?.('mapRoute', 'set', { to: kind.streets, source: 'player' }, engine);
    if (!res || res.ok === false) {
      say(res?.error || VENDOR_FINDER_TEXT.none(kind));
      engine.setData?.('vendorFinder', `${key}:${res?.error || 'none'}`);
      return res || { ok: false };
    }
    const to = res.route?.destination || '';
    const street = streetLabel(to);
    const line = street ? VENDOR_FINDER_TEXT.found(kind, street) : VENDOR_FINDER_TEXT.set(kind);
    say(line);
    engine.pushActivity?.(line);
    engine.setData?.('vendorFinder', `${key}@${to || 'pending'}`);
    return res;
  },

  /** Tests: forget the kinds worked out from the catalog. */
  _reset() {
    kindsCache = null;
    kindsFrom = null;
  },
};
