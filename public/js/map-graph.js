/**
 * Hub map graph from original GSJS geometry (760×460 Flash coord space).
 * Multi-hub: load any hub JSON from assets/maps/hubs/ via index.
 * Pure logic — no DOM/Pixi. Click destination → travel plan via planTravel.
 */

import { listMapDestinations, planTravel, resolveLoadedTsid, tsidAliases } from './travel.js?v=7fd6e363';
import { CLASSIC_ART } from './classic/classic-art.js?v=5745e669';
import { HUB_MAP_BACKGROUNDS } from './hub-map-backgrounds.js?v=413f769b';

/** Map catalog + per-hub files. */
export const MAP_INDEX_URL = 'assets/maps/index.json';
/** Legacy single-file path (hub 56). */
export const HUB_56_MAP_URL = 'assets/maps/hub-56-groddle-forest.json';

/**
 * Midpoint of a street segment (label / you-are-here anchor).
 * @param {{ x1:number, y1:number, x2:number, y2:number }} s
 */
export function segmentMid(s) {
  return {
    x: (Number(s.x1) + Number(s.x2)) / 2,
    y: (Number(s.y1) + Number(s.y2)) / 2,
  };
}

/**
 * Resolve which hub-map street matches the player's current street tsid.
 * @param {string} currentTsid
 * @param {{ tsid: string }[]} streets
 */
export function findCurrentStreet(currentTsid, streets) {
  if (!currentTsid || !streets?.length) return null;
  const aliases = new Set(tsidAliases(currentTsid));
  return streets.find((s) => aliases.has(s.tsid)) || null;
}

/**
 * Pick hub id for a street from street payload / index meta.
 * @param {{ hubId?: string|number, hub_id?: string|number }|null} streetMeta
 * @param {string} [fallback='56']
 */
export function resolveHubId(streetMeta, fallback = '56') {
  const raw = streetMeta?.hubId ?? streetMeta?.hub_id ?? fallback;
  return String(raw || fallback);
}

/** How many streets back the Map looks for one that is drawn on a hub map. */
export const MAP_TRAIL_MAX = 12;

/**
 * Note a street the player entered on the Map's trail (newest last, no repeats in a
 * row, at most MAP_TRAIL_MAX). Returns a new array.
 * @param {{ tsid: string, hubId: string }[]} trail
 * @param {{ tsid?: string, hubId?: string|number }|null} street
 */
export function noteMapTrail(trail, street) {
  const list = Array.isArray(trail) ? trail : [];
  const tsid = String(street?.tsid || '');
  if (!tsid) return list;
  const hubId = street?.hubId == null || street.hubId === '' ? '' : String(street.hubId);
  const last = list[list.length - 1];
  if (last && last.tsid === tsid && last.hubId === hubId) return list;
  return [...list, { tsid, hubId }].slice(-MAP_TRAIL_MAX);
}

/**
 * The hub the Map opens on, and the street it marks "you" on (HubMapDialog.as start:
 * always the current location's hub; a location off the hub maps shows its parent
 * street, mapInfo.showStreet). `candidates` are tried in order (the current street, a
 * feature's own answer such as a subway stop's surface street, then the streets walked
 * before it, newest first); the first one drawn on its own hub's map wins.
 * Failing that, the first candidate whose hub has a map at all, then `fallback`.
 *
 * @param {{ tsid?: string, hubId?: string|number }[]} candidates
 * @param {(hubId: string) => boolean} hubHasMap  the hub is in the map index
 * @param {(hubId: string, tsid: string) => boolean} streetOnHub  the street is drawn on that hub's map
 * @returns {{ hubId: string, tsid: string, onMap: boolean }}
 */
export function pickMapSpot(candidates, hubHasMap, streetOnHub, fallback = '56') {
  const rows = (candidates || [])
    .filter((c) => c && c.tsid && c.hubId != null && c.hubId !== '')
    .map((c) => ({ tsid: String(c.tsid), hubId: String(c.hubId) }));
  const here = String(candidates?.find((c) => c?.tsid)?.tsid || '');
  for (const c of rows) {
    if (hubHasMap(c.hubId) && streetOnHub(c.hubId, c.tsid)) return { ...c, onMap: true };
  }
  const known = rows.find((c) => hubHasMap(c.hubId));
  if (known) return { hubId: known.hubId, tsid: here, onMap: false };
  return { hubId: String(fallback), tsid: here, onMap: false };
}

/**
 * Build a hub map view from original GSJS hub JSON + loaded street index.
 *
 * @param {object} hubData  hub-N.json shape
 * @param {string} currentTsid
 * @param {Record<string, { label: string }>} streetIndex
 */
export function buildHubMapView(hubData, currentTsid, streetIndex = {}) {
  const available = Object.keys(streetIndex || {});
  const mapW = hubData.mapW || 760;
  const mapH = hubData.mapH || 460;
  const curSeg = findCurrentStreet(currentTsid, hubData.streets || []);
  const currentResolved =
    resolveLoadedTsid(currentTsid, available) || currentTsid;

  const streets = (hubData.streets || []).map((s) => {
    const mid = segmentMid(s);
    const loadedTsid = resolveLoadedTsid(s.tsid, available);
    const isCurrent =
      !!curSeg &&
      (s.tsid === curSeg.tsid ||
        (loadedTsid && loadedTsid === currentResolved));
    return {
      tsid: s.tsid,
      name: s.name || s.tsid,
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      mx: mid.x,
      my: mid.y,
      loadedTsid,
      loaded: !!loadedTsid,
      current: isCurrent,
      travelable: !!loadedTsid && !isCurrent,
      label: loadedTsid
        ? streetIndex[loadedTsid]?.label || s.name || s.tsid
        : s.name || s.tsid,
      // The map's street icons (MapHub.as drawStreet; tools/build-map-icons.mjs).
      store: s.store || '',
      shrine: s.shrine || '',
      hasSubway: !!s.has_subway,
      // Left off the map unless you stand on it (MapHub.as drawStreet 638-640): the Start
      // streets, apartment towers and basements, machine rooms (tools/build-map-hidden.mjs).
      hidden: !!s.invisible_to_outsiders && !isCurrent,
    };
  });

  const hubs = (hubData.hubs || []).map((h) => ({
    tsid: h.tsid || '',
    hubId: String(h.hub_id || h.hubId || ''),
    hubName: h.hubName || h.label || 'Hub',
    label: h.label || (h.hubName ? `To: ${h.hubName}` : 'GO'),
    // MAPFRAME (Austin 2026-11-04): the frame is the painting itself, so a GO button at the very edge
    // (28 of 193 reached past it) steps in until its ring is whole, a few map units at most.
    x: clampGo(h.x, mapW),
    y: clampGo(h.y, mapH),
    arrow: h.arrow,
    travelable: false,
  }));

  const nodes = streets
    .filter((s) => s.loaded && !s.hidden)
    .map((s) => ({
      tsid: s.loadedTsid,
      label: s.label,
      current: s.current,
      travelable: s.travelable,
      x: s.mx / mapW,
      y: s.my / mapH,
      mapX: s.mx,
      mapY: s.my,
      segmentTsid: s.tsid,
    }));

  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push([nodes[i].tsid, nodes[i + 1].tsid]);
  }

  const bgLocal = hubData.bgLocal || '';
  const fgLocal = hubData.fgLocal || '';
  const thumbLocal = hubData.thumbLocal || '';
  // The region's painting, upscaled from its world-map thumbnail (G471,
  // tools/map-backgrounds/build.mjs): x1 for the 760 x 460 frame, x2 for Retina. A recovered
  // full painting (bgLocal) wins; a hub with neither keeps the drawn terrain.
  const soft = bgLocal ? null : HUB_MAP_BACKGROUNDS[String(hubData.hubId || '')] || null;
  const dpr = Number(globalThis.devicePixelRatio) || 1;
  const bgSoft = soft ? (dpr > 1 ? soft.x2 : soft.x1) : '';
  // MAPSIZE: the Retina file too, which a 1x screen takes once the Map draws past 760 x 460 (game.js fitMapCanvas).
  const bgSoftHi = soft ? soft.x2 : '';
  // G522: the region's painting was repainted for the remake from its thumbnail (tools/provenance/repainted-maps.json).
  const bgRepainted = Boolean(soft?.repainted);

  return {
    hubId: String(hubData.hubId || ''),
    hubName: hubData.hubName || 'Hub',
    mapW,
    mapH,
    bg: hubData.bg || '',
    fg: hubData.fg || '',
    bgLocal,
    fgLocal,
    thumbLocal,
    bgSoft,
    bgSoftHi,
    bgRepainted,
    color: hubData.color || '#5f721d',
    currentTsid: currentResolved,
    streets,
    hubs,
    nodes,
    edges,
  };
}

/**
 * Legacy-compatible graph builder.
 * @param {string} currentTsid
 * @param {Record<string, { label: string }>} streetIndex
 * @param {{ hubData?: object, edges?: [string, string][] }} [opts]
 */
export function buildMapGraph(currentTsid, streetIndex, opts = {}) {
  if (opts.hubData) {
    return buildHubMapView(opts.hubData, currentTsid, streetIndex);
  }
  const dests = listMapDestinations(currentTsid, streetIndex);
  const nodes = dests.map((d, i) => {
    const t = dests.length === 1 ? 0.5 : i / (dests.length - 1);
    return {
      tsid: d.tsid,
      label: d.label,
      current: d.current,
      travelable: d.travelable,
      x: 0.18 + t * 0.64,
      y: 0.35 + Math.sin(t * Math.PI) * 0.22 + (i % 2) * 0.08,
    };
  });
  let edges = opts.edges;
  if (!edges) {
    edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push([nodes[i].tsid, nodes[i + 1].tsid]);
    }
  }
  return {
    hubName: 'Groddle Forest',
    currentTsid: nodes.find((n) => n.current)?.tsid || currentTsid,
    nodes,
    edges,
    streets: [],
    hubs: [],
    mapW: 760,
    mapH: 460,
  };
}

/**
 * @param {string} fromTsid
 * @param {string} toTsid
 * @param {Record<string, { label: string }>} streetIndex
 */
export function mapClickTravel(fromTsid, toTsid, streetIndex) {
  return planTravel(fromTsid, toTsid, streetIndex);
}

/**
 * @param {string} s
 */
export function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The corners of rect (lx, ly, w, h) in a frame turned by rot degrees about (cx, cy), on the map. */
export function rotatedQuad(cx, cy, rot, lx, ly, w, h) {
  const r = (rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [[lx, ly], [lx + w, ly], [lx + w, ly + h], [lx, ly + h]].map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c]);
}

/** A box's corners. */
export function boxQuad(b) {
  return [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
}

/** The box around some corners. */
export function quadBox(q) {
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Do two convex quads overlap (separating axes)? Touching edges do not count. */
export function quadsOverlap(a, b) {
  for (const q of [a, b]) {
    for (let i = 0; i < q.length; i++) {
      const [x1, y1] = q[i];
      const [x2, y2] = q[(i + 1) % q.length];
      const nx = y1 - y2;
      const ny = x2 - x1;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const [x, y] of a) { const d = x * nx + y * ny; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const [x, y] of b) { const d = x * nx + y * ny; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      if (aMax <= bMin + 1e-9 || bMax <= aMin + 1e-9) return false;
    }
  }
  return true;
}

/** The corners of a street label: text centred on (x, y), its baseline at y, turned by rot. */
export function labelQuad(x, y, w, h, rot) {
  return rotatedQuad(x, y, rot, -w / 2, -h * 0.8, w, h);
}

/** The you-are-here star's box (renderHubMapSvg draws it about the street's midpoint). */
export function youBox(mx, my) {
  return { x0: mx - 14, y0: my - 14, x1: mx + 14, y1: my + 12 };
}

/**
 * The street icons' art and size (MapHub.as drawStreet; the art is Tiny Speck's CC0
 * TSEngineAssets map_icon_shop / _shrine / _subway, tools/classic-art/manifest.json).
 */
export const MAP_ICON_ART = Object.freeze({
  store: CLASSIC_ART.map_icon_shop,
  shrine: CLASSIC_ART.map_icon_shrine,
  subway: CLASSIC_ART.map_icon_subway,
});

/** MapHub.as nudges two subway icons along their street (TSIDs it hardcodes, "jed tower" and "groddle junction"). */
export const SUBWAY_ICON_NUDGE = Object.freeze({ LIF10HE4JTU1S7P: 20, LLI3272LOTD1B1F: 40 });

/** StringUtil.capitalizeFirstLetter. */
const capitalizeFirst = (s) => {
  const str = String(s || '');
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * An icon's tooltip, as the client's tipsH: "<Store> Vendor", "Shrine to <Giant>" and
 * "Subway Station". A shrine named `ti` reads Tii (Street.as updateFromAnonymous).
 * @param {'store'|'shrine'|'subway'} kind
 * @param {string} [value] the store name or the Giant's id
 */
export function mapIconTip(kind, value = '') {
  if (kind === 'store') return `${capitalizeFirst(value)} Vendor`;
  if (kind === 'shrine') return `Shrine to ${capitalizeFirst(value === 'ti' ? 'tii' : value)}`;
  return 'Subway Station';
}

/**
 * Where each street's icons sit (MapHub.as drawStreet): each in the street's own frame, at the
 * midpoint and turned with the line. The vendor sits just below the line to the right of the
 * midpoint, the shrine below it to the left, the subway station above the line, centred.
 *
 * The remake writes each street's name beside its line (layoutStreetLabels), where the client
 * wrote it on the line, so an icon that would cover a label, the you-are-here star, a GO button
 * or another icon slides along its own street (and then a little further from the line) to
 * the nearest clear spot; failing that, to the line's other side. The labels never move for
 * the icons.
 * @param {ReturnType<typeof buildHubMapView>['streets']} streets
 * @param {{ labels?: ReturnType<typeof layoutStreetLabels>, hubs?: { x:number, y:number }[] }} [around]
 * @returns {{ kind:string, tsid:string, streetName:string, tip:string, url:string,
 *   w:number, h:number, mx:number, my:number, rot:number, lx:number, ly:number, moved:boolean,
 *   quad:number[][], box:{ x0:number, y0:number, x1:number, y1:number } }[]}
 */
export function layoutStreetIcons(streets, { labels = [], hubs = [] } = {}) {
  const out = [];
  /** @type {number[][][]} */
  const taken = [
    ...labels.map((l) => rotatedQuad(l.x, l.y, l.rot, -l.w / 2 - 1.5, -l.h * 0.8 - 1, l.w + 3, l.h + 2)),
    ...(hubs || []).map((h) => boxQuad({ x0: h.x - 23, y0: h.y - 23, x1: h.x + 23, y1: h.y + 23 })),
  ];
  const you = (streets || []).find((s) => s.current);
  if (you) taken.push(boxQuad(youBox(you.mx, you.my)));
  const hits = (q) => taken.reduce((n, o) => n + (quadsOverlap(q, o) ? 1 : 0), 0);

  // The subway stations first (the fewest, and the most use when looking for one), then the rest.
  for (const pass of ['subway', 'rest']) for (const s of streets || []) {
    if (s.hidden) continue;
    const rot = (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
    const half = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 2;
    const add = (kind, value, lx0, rows, along, reach = 6) => {
      const art = MAP_ICON_ART[kind];
      const { w, h } = art;
      let pick = null;
      let least = null;
      for (const ly of rows) {
        for (let r = 0; r <= 24 && !pick; r++) {
          for (const dir of r ? [along, -along] : [0]) {
            const lx = lx0 + dir * r * 4;
            // Keep beside its own street: the icon's middle within (about) the line's length.
            if (Math.abs(lx + w / 2) > Math.max(half + reach, w)) continue;
            const quad = rotatedQuad(s.mx, s.my, rot, lx, ly, w, h);
            const n = hits(quad);
            if (!n) { pick = { lx, ly, quad }; break; }
            if (!least || n < least.n) least = { lx, ly, quad, n };
          }
        }
        if (pick) break;
      }
      // Nowhere clear (a crowded corner): the spot that covers the least.
      const crowded = !pick;
      if (!pick) pick = least || { lx: lx0, ly: rows[0], quad: rotatedQuad(s.mx, s.my, rot, lx0, rows[0], w, h) };
      taken.push(pick.quad);
      out.push({
        kind,
        tsid: s.loadedTsid || s.tsid,
        streetName: s.label || s.name || s.tsid,
        tip: mapIconTip(kind, value),
        url: art.url,
        w,
        h,
        mx: s.mx,
        my: s.my,
        rot,
        lx: pick.lx,
        ly: pick.ly,
        moved: pick.lx !== lx0 || pick.ly !== rows[0],
        crowded,
        quad: pick.quad,
        box: quadBox(pick.quad),
      });
    };
    const sw = MAP_ICON_ART.shrine.w;
    const sub = MAP_ICON_ART.subway;
    if (pass === 'rest' && s.store) add('store', s.store, 2, [10, 14, 18, 22, 26, -24, -28], 1);
    if (pass === 'rest' && s.shrine) add('shrine', s.shrine, -2 - sw, [10, 14, 18, 22, 26, -24, -28], -1);
    if (pass === 'subway' && s.hasSubway) {
      add('subway', '', Math.trunc(-sub.w / 2) + (SUBWAY_ICON_NUDGE[s.tsid] || 0), [-30, -34, -38, -42, -46, -50, 28, 32, 36, 40, 44, 48], 1, 24);
    }
  }
  return out;
}

/** Does segment (x1, y1)-(x2, y2) touch a convex quad? */
export function segmentHitsQuad(x1, y1, x2, y2, q) {
  const inside = (px, py) => {
    let sign = 0;
    for (let i = 0; i < q.length; i++) {
      const [ax, ay] = q[i];
      const [bx, by] = q[(i + 1) % q.length];
      const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if (c !== 0) {
        if (sign && Math.sign(c) !== sign) return false;
        sign = Math.sign(c);
      }
    }
    return true;
  };
  if (inside(x1, y1) || inside(x2, y2)) return true;
  const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  for (let i = 0; i < q.length; i++) {
    const [ax, ay] = q[i];
    const [bx, by] = q[(i + 1) % q.length];
    const d1 = cross(x1, y1, x2, y2, ax, ay);
    const d2 = cross(x1, y1, x2, y2, bx, by);
    const d3 = cross(ax, ay, bx, by, x1, y1);
    const d4 = cross(ax, ay, bx, by, x2, y2);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  }
  return false;
}

/** A GO button's sign: under the button, or over it where the map ends below (player report 2026-11-01). */
export function goLabelY(h, mapH = 460) {
  return h.y + 34 <= mapH - 5 ? h.y + 34 : h.y - 30;
}

/** How far a GO button's ring (and its stroke) reaches from its middle, in map units. */
const GO_REACH = 26;
/** A GO button's middle kept far enough in for its ring to draw whole inside the painting (MAPFRAME). */
function clampGo(v, size) {
  const n = Number(v) || 0;
  return size > 2 * GO_REACH ? Math.min(Math.max(n, GO_REACH), size - GO_REACH) : n;
}

/** Half a GO button's sign, in map units. */
const goSignHalf = (h) => String(h.label || '').length * 2.9 + 4;

/**
 * A GO button's sign is centred under it, slid along (never off the button) where it would run past
 * the painting's side (MAPFRAME: "To: Groddle Meadow" by Groddle Forest's left edge).
 */
export function goSignX(h, mapW = 760) {
  const half = goSignHalf(h);
  return Math.min(Math.max(h.x, half + 2), mapW - half - 2);
}

/** The room a GO button and its sign take, as a box. */
function goBox(h, mapH, mapW = 760) {
  const half = goSignHalf(h);
  const sx = goSignX(h, mapW);
  const ly = goLabelY(h, mapH);
  return { x0: Math.min(h.x - 24, sx - half), y0: Math.min(h.y - 24, ly - 9), x1: Math.max(h.x + 24, sx + half), y1: Math.max(h.y + 24, ly + 3) };
}

/**
 * Place street name labels beside their lines (player report 2026-11-01: names covered each other
 * and other streets). Each label tries spots along its own street on both sides and takes the one
 * that covers the least: another label first, then a GO button or the you-are-here star, then
 * other streets' lines, then the map's edge, then the distance from the street's middle.
 * Loaded and current streets always keep a label; a dim street's label drops where it would cover
 * another label, and at most 18 dim labels show.
 *
 * @param {Array<{ name:string, x1:number,y1:number,x2:number,y2:number,mx:number,my:number,loaded?:boolean,current?:boolean,hidden?:boolean }>} streets
 * @param {number} [mapW=760]
 * @param {number} [mapH=460]
 * @param {{ hubs?: { x:number, y:number, label?:string }[] }} [around]
 * @returns {{ name:string, x:number, y:number, rot:number, cls:string, w:number, h:number }[]}
 *   (w and h: the size the layout reckons the label takes, in map units)
 */
export function layoutStreetLabels(streets, mapW = 760, mapH = 460, { hubs = [], avoid = [] } = {}) {
  const shown = (streets || []).filter((s) => !s.hidden);
  const ordered = [...shown].sort((a, b) => {
    const rank = (s) => (s.current ? 0 : s.loaded ? 1 : 2);
    return rank(a) - rank(b);
  });
  /** @type {number[][][]} */
  const placed = [];
  const blockers = [...(hubs || []).map((h) => boxQuad(goBox(h, mapH, mapW))), ...(avoid || [])];
  const you = shown.find((s) => s.current);
  if (you) blockers.push(boxQuad(youBox(you.mx, you.my)));
  const out = [];
  let dimCount = 0;

  for (const s of ordered) {
    const strong = s.current || s.loaded;
    if (!strong && dimCount >= 18) continue;
    const angle = (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
    let rot = angle;
    if (rot > 90) rot -= 180;
    if (rot < -90) rot += 180;
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const fontW = strong ? 6.2 : 5.0;
    const w = Math.max(28, String(s.name || '').length * fontW);
    const h = strong ? 13 : 11;
    const above = strong ? 11 : 8;
    const below = -(3 + h * 0.8);

    let best = null;
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
      // Beside the line on either side, then one line further out.
      for (const [side, off] of [[0, above], [1, below], [2, above + h * 0.95], [3, below - h * 0.95]]) {
        const x = s.x1 + dx * t + nx * off;
        const y = s.y1 + dy * t + ny * off;
        const quad = labelQuad(x, y, w, h, rot);
        const pad = rotatedQuad(x, y, rot, -w / 2 - 1.5, -h * 0.8 - 1.5, w + 3, h + 3);
        let score = Math.abs(t - 0.5) * 20 + side * 3 + (side >= 2 ? 12 : 0);
        // The street's own icons sit by its middle (layoutStreetIcons): the vendor and shrine below the
        // line, the subway above it, so the name keeps to the other side there.
        if (Math.abs(t - 0.5) < 0.25 && ((side % 2 === 1 && (s.store || s.shrine)) || (side % 2 === 0 && s.hasSubway))) score += 40;
        for (const q of placed) if (quadsOverlap(pad, q)) score += 1000;
        for (const q of blockers) if (quadsOverlap(pad, q)) score += 300;
        for (const o of shown) if (o !== s && segmentHitsQuad(o.x1, o.y1, o.x2, o.y2, quad)) score += 40;
        const box = quadBox(quad);
        // MAPFRAME: the frame is the painting, so a name past its edge would be cut: the worst of all.
        if (box.x0 < 2 || box.y0 < 2 || box.x1 > mapW - 2 || box.y1 > mapH - 2) score += 5000;
        if (!best || score < best.score) best = { x, y, quad, score };
        if (score < 1) break;
      }
      if (best && best.score < 1) break;
    }
    if (!strong && best.score >= 1000) continue;
    if (!strong) dimCount += 1;
    // Ticket 66: a street under construction keeps its name, dimmed (MapStreet.as 125: TF_DIM_ALPHA for STREET_LOCKED).
    const cls = s.current ? 'map-label current' : s.loaded ? `map-label loaded${s.building ? ' building' : ''}` : 'map-label dim';
    placed.push(best.quad);
    out.push({ name: s.name, x: best.x, y: best.y, rot, cls, w, h });
  }
  return out;
}

/**
 * The labels and the street icons together: the icons find room around the labels; where an
 * icon finds none (a crowded corner), the labels are laid out again keeping clear of it, and
 * that layout is kept when it leaves fewer icons crowded.
 * @param {ReturnType<typeof buildHubMapView>} view
 */
export function layoutHubMapMarks(view) {
  const streets = view.streets || [];
  const w = view.mapW || 760;
  const h = view.mapH || 460;
  const hubs = view.hubs || [];
  let labels = layoutStreetLabels(streets, w, h, { hubs });
  let icons = layoutStreetIcons(streets, { labels, hubs });
  const crowded = (list) => list.filter((i) => i.crowded).length;
  if (crowded(icons)) {
    const labels2 = layoutStreetLabels(streets, w, h, { hubs, avoid: icons.filter((i) => i.crowded).map((i) => i.quad) });
    const icons2 = layoutStreetIcons(streets, { labels: labels2, hubs });
    if (crowded(icons2) < crowded(icons)) {
      labels = labels2;
      icons = icons2;
    }
  }
  return { labels, icons };
}

/** An art URL with its content key (js/data-urls.js groddleDataUrl); as it is in Node and on a page without the map. */
const keyedArt = (url) => (typeof globalThis.groddleDataUrl === 'function' ? globalThis.groddleDataUrl(url) : url);

/**
 * Build SVG markup for a hub map view (pure string).
 * Uses local bg/fg art when present.
 * @param {ReturnType<typeof buildHubMapView>} view
 */
/**
 * The map's viewBox [x, y, w, h]: the painted map, grown just enough to take in every GO button and
 * its sign, and any other box in `extra` ({ x0, y0, x1, y1 }: a street name or line at the edge,
 * ticket 21).
 */
export function hubMapFrame(hubs, mapW = 760, mapH = 460, extra = []) {
  let x0 = 0;
  let y0 = 0;
  let x1 = mapW;
  let y1 = mapH;
  for (const b of [...(hubs || []).map((h) => goBox(h, mapH, mapW)), ...(extra || [])]) {
    // (1e-6: a box that just meets the edge, give or take float sums, does not grow it.)
    x0 = Math.min(x0, Math.floor(b.x0 - 2 + 1e-6));
    y0 = Math.min(y0, Math.floor(b.y0 - 2 + 1e-6));
    x1 = Math.max(x1, Math.ceil(b.x1 + 2 - 1e-6));
    y1 = Math.max(y1, Math.ceil(b.y1 + 2 - 1e-6));
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

/**
 * MAPSIZE (ticket 76, Austin 2026-11-04): the Map grows with the window. The client drew it at a
 * fixed 760 x 460 (HubMapDialog.as MAP_W / MAP_ACTUAL_W); here it takes the room the window leaves
 * between the top bar and the pack (inside the side sheets and the Social drawer), keeping the
 * frame's shape, from 1 (the client's own size) up to MAP_FIT_MAX_SCALE. Street names, lines and GO
 * buttons are drawn in map units, so they grow with it.
 */
export const MAP_FIT_MAX_SCALE = 1.5;

/**
 * The Map's drawn size for the room it has (pure). `availW` x `availH` is the box the window leaves;
 * `chromeW` / `chromeH` what the window's head, lines and borders take around the map;
 * `compactChromeH` the same with the compact layout (the key hint hidden), used only when the full
 * layout would draw the map under the client's own size. `minH` is the floor the map never goes
 * under (a very short window then scrolls nothing: the map gives way inside its box).
 * Returns { w, h, scale, compact } in whole CSS pixels, or null without a frame.
 */
export function mapFitSize({ availW, availH, chromeW = 0, chromeH = 0, compactChromeH = chromeH, frameW, frameH, minH = 0, maxScale = MAP_FIT_MAX_SCALE } = {}) {
  if (!(frameW > 0 && frameH > 0) || !(availW > 0 && availH > 0)) return null;
  const fit = (ch) => Math.min((availW - chromeW) / frameW, (availH - ch) / frameH, maxScale);
  let compact = false;
  let scale = fit(chromeH);
  if (scale < 1 && compactChromeH < chromeH) {
    compact = true;
    scale = fit(compactChromeH);
  }
  scale = Math.max(scale, minH / frameH, 0);
  return { w: Math.floor(frameW * scale + 1e-6), h: Math.floor(frameH * scale + 1e-6), scale, compact };
}

/**
 * The vendor and shrine icons' glow (MapHub.as: StaticFilters.white2px40percent_GlowA, a white
 * 2 px glow at 40%, over Tiny Speck's art, which is black at 40%). That read on the soft
 * thumbnail paintings but turned into pale grey smudges on a detailed one (the Groddle Meadow
 * repaint, G522), so the remake draws the same shape stronger: a cream halo at 75% and the
 * icon's ink at 1.75 times its alpha (black at 70%), in Modern and Classic. The subway icon is
 * full colour and opaque, and keeps the client's no glow.
 */
export const MAP_ICON_GLOW = Object.freeze({ halo: '#fffbea', haloOpacity: 0.75, spread: 1.2, ink: 1.75 });
const MAP_ICON_FILTER =
  `<filter id="mapIconGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${MAP_ICON_GLOW.spread}"/>
      <feComponentTransfer result="spread"><feFuncA type="linear" slope="9"/></feComponentTransfer>
      <feFlood flood-color="${MAP_ICON_GLOW.halo}" flood-opacity="${MAP_ICON_GLOW.haloOpacity}"/>
      <feComposite in2="spread" operator="in" result="glow"/>
      <feComponentTransfer in="SourceGraphic" result="ink"><feFuncA type="linear" slope="${MAP_ICON_GLOW.ink}"/></feComponentTransfer>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="ink"/></feMerge>
    </filter>`;

export function renderHubMapSvg(view) {
  const w = view.mapW || 760;
  const h = view.mapH || 460;
  const mapH = h;
  const parts = [];

  parts.push(`<defs>
    <linearGradient id="hubTerrain" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c8b890"/>
      <stop offset="28%" stop-color="#9a8860"/>
      <stop offset="32%" stop-color="#8a9a58"/>
      <stop offset="70%" stop-color="#7a8f4a"/>
      <stop offset="88%" stop-color="#9a8860"/>
      <stop offset="100%" stop-color="#c8b890"/>
    </linearGradient>
    <filter id="labelHalo" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="1.2" flood-color="#f0e8c8" flood-opacity="0.95"/>
    </filter>
    ${MAP_ICON_FILTER}
  </defs>`);

  if (view.bgLocal) {
    parts.push(
      `<image class="map-bg" href="${escapeXml(view.bgLocal)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`
    );
  } else if (view.bgSoft) {
    // Loaded with the map that shows it (an SVG <image> fetches when drawn), keyed like the
    // game's other art (js/data-urls.js does not see an SVG href in an HTML string). The street
    // lines, labels and GO buttons read on it as they are (no wash): every street of a painted
    // region is playable, so none is drawn in the pale unvisited style.
    parts.push(
      `<image class="map-bg map-bg-soft" href="${escapeXml(keyedArt(view.bgSoft))}"${view.bgSoftHi && view.bgSoftHi !== view.bgSoft ? ` data-hi="${escapeXml(keyedArt(view.bgSoftHi))}"` : ''} x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`
    );
  } else {
    parts.push(`<rect class="map-terrain" width="${w}" height="${h}" fill="url(#hubTerrain)"/>`);
    parts.push(
      `<path class="map-hill" d="M0,120 Q120,70 240,100 T480,90 T760,110 L760,0 L0,0 Z" fill="#8a7a55" opacity="0.55"/>`
    );
    parts.push(
      `<path class="map-hill" d="M0,${h} L0,${h - 70} Q180,${h - 100} 360,${h - 60} T760,${h - 80} L760,${h} Z" fill="#8a7a55" opacity="0.5"/>`
    );
    // World-map thumb (150×91) as corner identity when full painting missing
    if (view.thumbLocal) {
      parts.push(
        `<image class="map-thumb" href="${escapeXml(view.thumbLocal)}" x="${w - 168}" y="12" width="150" height="91" opacity="0.92"/>`
      );
      parts.push(
        `<rect x="${w - 168}" y="12" width="150" height="91" fill="none" stroke="#5a5040" stroke-width="2" opacity="0.6"/>`
      );
    }
  }

  for (const s of view.streets || []) {
    if (s.loaded || s.hidden) continue;
    parts.push(
      `<line class="map-seg dim" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ` +
        `data-tsid="${escapeXml(s.tsid)}" data-name="${escapeXml(s.name)}"/>`
    );
  }
  for (const s of view.streets || []) {
    if (!s.loaded || s.hidden) continue;
    // Ticket 66: a street still under construction (`building`, the street-jobs feature) is drawn
    // fainter with construction stripes, as the client drew a locked street paler with a dimmed
    // name (MapStreet.as 16-20, 53-55, 125: STREET_LOCKED 'SL', location.js 2880-2935); its menu
    // still opens and says where to help build it.
    const building = Boolean(s.building && !s.current);
    const cls = s.current ? 'map-seg current' : `map-seg travelable${building ? ' building' : ''}`;
    const travelTsid = s.loadedTsid || s.tsid;
    parts.push(
      `<g class="map-street ${s.current ? 'current' : 'travelable'}${building ? ' building' : ''}" ` +
        `data-tsid="${escapeXml(travelTsid)}" data-label="${escapeXml(s.label)}" ` +
        // RIGHTCLICK: a street has a menu of ours (game.js openMapStreetMenu), never the browser's.
        `data-segment="${escapeXml(s.tsid)}" data-ctx="map-street"${building ? ' data-building="1"' : ''}>` +
        (building ? `<title>${escapeXml(s.label)}: under construction</title>` : '') +
        `<line class="${cls}" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"/>` +
        (building ? `<line class="map-seg-stripes" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"/>` : '') +
        `<line class="map-seg-hit" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"/>` +
        `</g>`
    );
  }

  // Labels with collision-aware placement (reduces unreadable pile-ups)
  // The street icons (vendor, shrine, subway) find room around the labels, star and GO buttons.
  const { labels, icons } = layoutHubMapMarks(view);
  for (const lab of labels) {
    parts.push(
      `<text class="${lab.cls}" x="${lab.x.toFixed(1)}" y="${lab.y.toFixed(1)}" text-anchor="middle" ` +
        `transform="rotate(${lab.rot.toFixed(1)} ${lab.x.toFixed(1)} ${lab.y.toFixed(1)})" ` +
        `filter="url(#labelHalo)">${escapeXml(lab.name)}</text>`
    );
  }

  if (view.fgLocal) {
    parts.push(
      `<image class="map-fg" href="${escapeXml(view.fgLocal)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" pointer-events="none"/>`
    );
  }

  // MapHub.as drawStreet: each icon turned with its street; the vendor and shrine get the
  // client's glow, drawn stronger so they read on any painting (MAP_ICON_GLOW), the subway none.
  // One tab stop for them all (arrow keys move between them, js/ui/map-icon-tips.js), left to right.
  const ordered = [...icons].sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0);
  if (ordered.length) {
    parts.push(`<g class="map-icons">`);
    ordered.forEach((ic, i) => {
      const f = (n) => Number(n.toFixed(2));
      parts.push(
        `<g class="map-icon map-icon-${ic.kind}" tabindex="${i === 0 ? 0 : -1}" role="img" ` +
          `aria-label="${escapeXml(`${ic.tip}, ${ic.streetName}`)}" data-tip="${escapeXml(ic.tip)}" ` +
          `data-kind="${ic.kind}" data-tsid="${escapeXml(ic.tsid)}" ` +
          `transform="translate(${f(ic.mx)} ${f(ic.my)}) rotate(${f(ic.rot)})">` +
          `<rect class="map-icon-ring" x="${ic.lx - 2}" y="${ic.ly - 2}" width="${ic.w + 4}" height="${ic.h + 4}" rx="3"/>` +
          `<image href="${escapeXml(ic.url)}" x="${ic.lx}" y="${ic.ly}" width="${ic.w}" height="${ic.h}"` +
          `${ic.kind === 'subway' ? '' : ' filter="url(#mapIconGlow)"'}/>` +
          `</g>`
      );
    });
    parts.push(`</g>`);
  }

  const you = (view.streets || []).find((s) => s.current);
  if (you) {
    const cx = you.mx;
    const cy = you.my;
    parts.push(
      `<polygon class="map-you" points="` +
        `${cx},${cy - 14} ${cx + 4},${cy - 4} ${cx + 14},${cy - 4} ${cx + 6},${cy + 2} ` +
        `${cx + 9},${cy + 12} ${cx},${cy + 6} ${cx - 9},${cy + 12} ${cx - 6},${cy + 2} ` +
        `${cx - 14},${cy - 4} ${cx - 4},${cy - 4}" />`
    );
  }

  for (const h of view.hubs || []) {
    parts.push(
      `<g class="map-hub-go" data-hub="${escapeXml(h.hubId)}" data-label="${escapeXml(h.label)}">` +
        `<circle class="map-go-ring" cx="${h.x}" cy="${h.y}" r="22"/>` +
        // The word's nudge down is in em, so it counter-scales with the word (ticket 81: style.css .map-go-text).
        `<text class="map-go-text" x="${h.x}" y="${h.y}" dy="0.09em" text-anchor="middle" dominant-baseline="middle">GO</text>` +
        `<text class="map-go-sub" x="${+goSignX(h, w).toFixed(1)}" y="${goLabelY(h, mapH)}" text-anchor="middle">${escapeXml(h.label)}</text>` +
        `</g>`
    );
  }

  // The frame would grow to take in a GO button, street name or line past the painting's edge (ticket 21:
  // Rushlane Steading's name ran past Groddle Meadow's top). MAPFRAME (Austin 2026-11-04): it no longer
  // has to: GO buttons step in, their signs slide along and names keep inside, so every public region's
  // frame is its painting (no plain bands round it; tests/map-fit.test.js). It stays as the safety net.
  const edges = labels.map((lab) => quadBox(labelQuad(lab.x, lab.y, lab.w, lab.h, lab.rot)));
  for (const s of view.streets || []) {
    if (s.hidden) continue;
    // Half its 5 unit stroke with the frame's own 2 (MAPFRAME: a line by the edge no longer pushes it out).
    edges.push({ x0: Math.min(s.x1, s.x2) - 0.5, y0: Math.min(s.y1, s.y2) - 0.5, x1: Math.max(s.x1, s.x2) + 0.5, y1: Math.max(s.y1, s.y2) + 0.5 });
  }
  const frame = hubMapFrame(view.hubs || [], w, h, edges);
  return (
    `<svg viewBox="${frame.join(' ')}" xmlns="http://www.w3.org/2000/svg" ` +
    `role="${icons.length ? 'group' : 'img'}" aria-label="${escapeXml(view.hubName)} street map" class="hub-map-svg">` +
    parts.join('\n') +
    `</svg>`
  );
}

/**
 * The regions of Ur the world map offered: GSJS config_prod.js public_hubs, the only hubs
 * get_map put in its `all` listing (locations/location.js 2869-2874). The rest of the map data
 * is test and template hubs (Abbasid, Old Groddle Forest, the POL hubs, Gentle Island) and
 * the two Jethimadh Tower hubs, which open from their GO button or when you are inside them.
 * The Tribute Blog's world maps of Nov 2012 (posts 38005474341, 45119695823, 49865657967,
 * 49872342514; reference only) draw no Abbasid and no old forest.
 */
export const PUBLIC_HUBS = Object.freeze(new Set([
  27, 40, 50, 51, 56, 58, 63, 64, 66, 71, 72, 75, 76, 78, 85, 86, 88, 89, 90, 91, 92, 93, 95, 97, 98, 99,
  100, 101, 102, 105, 106, 107, 108, 109, 110, 112, 113, 114, 116, 119, 120, 121, 123, 125, 126, 128,
  131, 133, 136, 137, 140, 141, 142, 143,
].map(String)));

/**
 * List hubs from map index for UI (name + street counts).
 * @param {object} mapIndex
 * @param {{ keep?: string|null }} [opts] a hub to list anyway (the one on show: a zone's, or
 *   a tower's opened from its GO button)
 * @returns {{ hubId: string, hubName: string, streetCount: number, hasArt: boolean, file: string }[]}
 */
export function listHubsFromIndex(mapIndex, { keep = null } = {}) {
  const hubs = mapIndex?.hubs || {};
  return Object.values(hubs)
    // A published zone's hub (spec 11; its row carries `zone`) stays off the world's list of
    // regions (spec 15, Q5): its map opens from its own streets only, as `keep`. So does a hub
    // the world map never offered (PUBLIC_HUBS).
    .filter((h) => (keep != null && String(h.hubId) === String(keep)) || (!h.zone && PUBLIC_HUBS.has(String(h.hubId))))
    .map((h) => ({
      hubId: String(h.hubId),
      hubName: h.hubName || `Hub ${h.hubId}`,
      streetCount: h.streetCount || 0,
      hasArt: !!h.hasArt || !!h.bgLocal,
      file: h.file || `assets/maps/hubs/hub-${h.hubId}.json`,
    }))
    .filter((h) => h.streetCount > 0)
    .sort((a, b) => a.hubName.localeCompare(b.hubName));
}

/**
 * The Map's street search (player report 2026-11-01): the client's map had one search for
 * regions and streets (HubMapDialog.as 197-202, LocationSearchMap.as: 8 results; picking a
 * street opened its region and flashed it, MapHub.as 785-828). One row a street of a listed
 * region, by name: { value: "street:<hubId>:<tsid>", label, hint: region }.
 * @param {Record<string, { label?: string, hubId?: string|number, hubName?: string }>} streetIndex
 * @param {{ hubId: string, hubName: string }[]} hubs the listed regions (listHubsFromIndex)
 */
export function mapSearchStreets(streetIndex, hubs) {
  const named = new Map((hubs || []).map((h) => [String(h.hubId), h.hubName]));
  const seen = new Set();
  const out = [];
  for (const [tsid, st] of Object.entries(streetIndex || {})) {
    const hubId = String(st?.hubId ?? '');
    const label = String(st?.label || '').trim();
    if (!label || !named.has(hubId)) continue;
    const key = `${hubId}|${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: `street:${hubId}:${tsid}`, label, hint: named.get(hubId) });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label) || a.hint.localeCompare(b.hint));
}

/** A street search row's value as { hubId, tsid }, or null for a region's. */
export function parseMapSearchValue(value) {
  const m = /^street:([^:]+):(.+)$/.exec(String(value || ''));
  return m ? { hubId: m[1], tsid: m[2] } : null;
}

/**
 * @param {{ x:number, y:number }} a
 * @param {{ x:number, y:number }} b
 * @param {number} [vbW=800]
 * @param {number} [vbH=420]
 */
export function edgePath(a, b, vbW = 800, vbH = 420) {
  const x1 = a.x * vbW;
  const y1 = a.y * vbH;
  const x2 = b.x * vbW;
  const y2 = b.y * vbH;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 20;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}
