/**
 * The Map's world and subway views (G471), beside the region map in the same window.
 *
 * The client's map window (HubMapDialog.as) had three buttons at its top left: back to your own
 * region, the world map (world_map_in_bt / world_map_out_bt) and the transit map (transit_bt).
 *
 * World map (HubMapDialog.as 267-388; Tiny Speck's CC0 glitch-overlays/world_map.fla, read by
 * tools/map-views/build.mjs into js/map-views-data.js): the sketched chart, the painted chart
 * showing through round every region the player may open (worldMapSetRegions: the hubs of the
 * search locations, the public regions with streets), the regions' sketched frames, a star on
 * the centre of the player's region (showYouOnWorld), and on hover the region's card (its
 * thumbnail and hand-lettered name, the clip's "over" state). A click opens the region's map
 * (worldMapClickHandler -> goToHubFromClick). On a touch screen, which has no hover, the first
 * tap shows the card and a second tap on it opens the map.
 *
 * Subway map (MapTransit.as; GSJS location.js get_map 3043-3093): the 12 stations at their
 * config_prod.js map_pos on the client's 760 x 460 frame, the Red Line and the Blue Line (one track
 * run either way), the station you are at or nearest to marked. The client drew them over two
 * pictures (config_prod.js 668: subway_map_bg_59215.jpg, the paper both lines share, and
 * subway_red_line_fg_59215.png with its blue twin), none ever archived. The paper is recreated
 * (2026-11-13, SUBWAY_PAPER: twelve cream sheets on sage where the 2012 window had them, made for
 * the remake, dedicated CC0 1.0, tools/provenance/subway-map-paper.json); the line stays drawn here
 * as a smooth curve through the stations in their order, so it always sits on them. A station opens
 * the same menu a street does on the region map (Set as Destination, Teleport Here) for its street
 * above ground; its region's name opens that region's map with the street found.
 */
import { WORLD_MAP } from './map-views-data.js?v=bf881f35';
import { LINE_COLOURS, STATIONS, SUBWAY_ART, SUBWAY_ART_BASE, lineName } from './subway.js?v=e6995db8';

export const MAP_VIEWS = Object.freeze(['hub', 'world', 'subway']);
/** The window's title in each view (the client's: the region's name, "World Map", "Subway System"). */
export const MAP_VIEW_TITLES = Object.freeze({ world: 'World Map', subway: 'Subway System' });

/** An art URL with its content key (js/data-urls.js groddleDataUrl), as js/map-graph.js keys a region's painting. */
const keyedArt = (url) => (typeof globalThis.groddleDataUrl === 'function' ? globalThis.groddleDataUrl(url) : url);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f1 = (v) => Math.round(v * 10) / 10;

/** The star the region map draws for "you" (map-graph.js renderHubMapSvg), centred on (cx, cy). */
export function youStarPoints(cx, cy) {
  return [
    [cx, cy - 14], [cx + 4, cy - 4], [cx + 14, cy - 4], [cx + 6, cy + 2], [cx + 9, cy + 12],
    [cx, cy + 6], [cx - 9, cy + 12], [cx - 6, cy + 2], [cx - 14, cy - 4], [cx - 4, cy - 4],
  ].map((p) => p.map(f1).join(',')).join(' ');
}

// ------------------------------------------------------------------ world

/** How far the painted chart shows past a region's frame, and how soft its edge (map units). */
export const WORLD_REVEAL = Object.freeze({ grow: 9, blur: 8 });

/**
 * The world map's regions as the view draws them: { hubId, name, quad, centre, card, open }.
 * `open`: the region may be clicked (the client's allowed_hub_ids: a public region with streets).
 */
export function worldRegionList(mapIndex, publicHubs, world = WORLD_MAP) {
  return Object.entries(world.regions)
    .map(([hubId, r]) => {
      const row = mapIndex?.hubs?.[hubId];
      return {
        hubId,
        name: row?.hubName || `Region ${hubId}`,
        quad: r.quad,
        centre: r.centre,
        card: r.card,
        open: Boolean(publicHubs?.has?.(hubId) && (row?.streetCount || 0) > 0),
      };
    })
    .sort((a, b) => a.centre[1] - b.centre[1] || a.centre[0] - b.centre[0]);
}

/** A region's frame grown by `d` round its centre, as polygon points. */
function grownQuad(quad, centre, d) {
  return quad.map(([x, y]) => [x + Math.sign(x - centre[0]) * d, y + Math.sign(y - centre[1]) * d].map(f1).join(',')).join(' ');
}

/**
 * The two charts as renderWorldMapSvg draws them: { locked, unlocked, lockedHi, unlockedHi } (unkeyed).
 * Tiny Speck's charts exist only at 760 x 460; their 1520 x 920 twins are sharpened copies
 * (tools/provenance/world-map-2x.json). As the Subway paper (subwayPaper): the Retina files on a
 * Retina screen, or when `hi` says so (js/map-bg-preload.js prepareWorldCharts: a 1x screen whose
 * Map last drew past 760 x 460); else the 760 files, with the twins as data-hi for game.js
 * fitMapCanvas and js/map-zoom.js to swap in once the map draws larger.
 */
export function worldCharts({ dpr = Number(globalThis.devicePixelRatio) || 1, hi = null, world = WORLD_MAP } = {}) {
  const big = hi === null ? dpr > 1 : Boolean(hi);
  return {
    locked: big && world.lockedHi ? world.lockedHi : world.locked,
    unlocked: big && world.unlockedHi ? world.unlockedHi : world.unlocked,
    lockedHi: world.lockedHi || '',
    unlockedHi: world.unlockedHi || '',
  };
}

/** A chart's href, and its Retina twin as data-hi when that is another file (keyed, escaped). */
function chartHref(href, hi) {
  return `href="${esc(keyedArt(href))}"${hi && hi !== href ? ` data-hi="${esc(keyedArt(hi))}"` : ''}`;
}

/**
 * The world map as SVG (760 x 460 map units). youHubId: the region to star (none when the
 * player's region is not on the world map: the client's getRegion found none and drew no star).
 * charts: worldCharts()'s answer (the files only; every frame, card and the star stay in map units).
 */
export function renderWorldMapSvg(regions, { youHubId = '', world = WORLD_MAP, charts = worldCharts({ world }) } = {}) {
  const { w, h } = world;
  const you = regions.find((r) => r.hubId === String(youHubId || ''));
  const reveal = regions.filter((r) => r.open).map((r) => `<polygon points="${grownQuad(r.quad, r.centre, WORLD_REVEAL.grow)}"/>`).join('');
  const hits = regions.map((r) => {
    const cls = `world-region${r.open ? ' is-open' : ''}${r === you ? ' is-you' : ''}`;
    const attrs = r.open
      ? ` tabindex="0" role="button" aria-label="${esc(`${r.name}: open its map`)}"`
      : ` aria-hidden="true"`;
    return `<g class="${cls}" data-hub="${esc(r.hubId)}" data-label="${esc(r.name)}"${attrs}><title>${esc(r.name)}</title>`
      + `<polygon class="world-region-hit" points="${r.quad.map((p) => p.join(',')).join(' ')}"/></g>`;
  }).join('');
  const star = you ? `<polygon class="map-you world-you" points="${youStarPoints(you.centre[0], you.centre[1])}"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="world-map-svg" role="group" aria-label="World map">`
    + `<defs><filter id="world-reveal-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${WORLD_REVEAL.blur}"/></filter>`
    + `<mask id="world-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/>`
    + `<g fill="white" filter="url(#world-reveal-soft)">${reveal}</g></mask></defs>`
    + `<image class="world-chart world-chart-locked" ${chartHref(charts.locked, charts.lockedHi)} width="${w}" height="${h}" preserveAspectRatio="none"/>`
    + `<image class="world-chart world-chart-open" ${chartHref(charts.unlocked, charts.unlockedHi)} width="${w}" height="${h}" preserveAspectRatio="none" mask="url(#world-reveal)"/>`
    + `<image class="world-frames" href="${esc(world.frames)}" width="${w}" height="${h}" preserveAspectRatio="none" pointer-events="none"/>`
    + `<g class="world-regions">${hits}</g>${star}<g class="world-card-layer" pointer-events="none"></g></svg>`;
}

/**
 * Hover cards and clicks on a drawn world map. onOpen(hubId) opens a region's map. touch: the
 * first tap on a region shows its card, a second opens it. onPreview(hubId, how) runs when a card
 * shows (how: 'pointer' a hover, 'focus' the keyboard, 'tap' a phone's first tap) and onPreview('')
 * when it goes (MAPLOAD: game.js fetches the region's painting ahead of the click,
 * js/map-bg-preload.js). QA: canvas data worldCard <hub id>.
 */
export function bindWorldMap(canvas, { onOpen, onPreview, touch = false, regions = WORLD_MAP.regions } = {}) {
  const svg = canvas?.querySelector('svg.world-map-svg');
  if (!svg) return null;
  const layer = svg.querySelector('.world-card-layer');
  const star = svg.querySelector('.world-you');
  let shown = '';
  let lastPointer = 'mouse';
  // A phone has no hover at all (some report a tap as a mouse's pointer): every tap goes card first.
  const tapFirst = () => touch || lastPointer === 'touch';
  let shownBy = '';
  const show = (id, by = 'pointer') => {
    const card = regions[id]?.card;
    if (!card || shown === id) return;
    shown = id;
    shownBy = by;
    const [x, y, cw, ch] = card.box;
    layer.innerHTML = `<image class="world-card" href="${esc(keyedArt(card.href))}" x="${x}" y="${y}" width="${cw}" height="${ch}" transform="matrix(${card.m.join(' ')})"/>`;
    // The client faded the star while its region's card was up (worldMapHoverHandler 357-366).
    if (star) star.classList.toggle('is-hidden', svg.querySelector(`.world-region[data-hub="${id}"]`)?.classList.contains('is-you') || false);
    canvas.dataset.worldCard = id;
    onPreview?.(id, by);
  };
  const hide = (id) => {
    if (id && shown !== id) return;
    shown = '';
    shownBy = '';
    layer.innerHTML = '';
    star?.classList.remove('is-hidden');
    delete canvas.dataset.worldCard;
    onPreview?.('');
  };
  // A tap or click on the sea or a closed region puts the card away.
  svg.addEventListener('click', (e) => { if (!e.target?.closest?.('.world-region.is-open')) hide(); });
  delete canvas.dataset.worldCard;
  for (const g of svg.querySelectorAll('.world-region.is-open')) {
    const id = g.getAttribute('data-hub');
    g.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || lastPointer; });
    g.addEventListener('pointerenter', (e) => { if (!touch && e.pointerType !== 'touch') show(id); });
    g.addEventListener('pointerleave', (e) => { if (!touch && e.pointerType !== 'touch') hide(id); });
    // Keyboard focus shows the card; the focus a tap or click brings must not (it would count as the first tap).
    g.addEventListener('focus', () => { if (g.matches?.(':focus-visible')) show(id, 'focus'); });
    // Only a card focus brought goes with the focus (the game takes focus back after a tap).
    g.addEventListener('blur', () => { if (shownBy === 'focus') hide(id); });
    g.addEventListener('click', () => {
      if (tapFirst() && shown !== id) {
        show(id, 'tap');
        return;
      }
      onOpen?.(id);
    });
    g.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onOpen?.(id);
    });
  }
  return { show, hide, shown: () => shown };
}

// ------------------------------------------------------------------ subway

/**
 * Where each station's name sits from its dot, as on the Subway System map (Tribute Blog post
 * 38013353380, reference only): [dx, dy, text-anchor] of the name's baseline; its region's name
 * goes under it.
 */
export const SUBWAY_LABELS = Object.freeze({
  1: [16, -4, 'start'], 2: [14, -12, 'start'], 3: [-14, 2, 'end'], 4: [-16, -2, 'end'],
  5: [16, -4, 'start'], 6: [16, -6, 'start'], 7: [16, -2, 'start'], 8: [10, -24, 'end'],
  9: [16, 4, 'start'], 10: [-14, -16, 'end'], 11: [-12, -18, 'end'], 12: [-14, 4, 'end'],
});

/**
 * The Subway System map's paper, recreated (Tiny Speck's subway_map_bg_59215.jpg is lost): 760 x 460
 * and its Retina twin, the same picture in the light and dark themes, as the region paintings are.
 */
export const SUBWAY_PAPER = Object.freeze({
  x1: 'assets/maps/art/subway/subway-map-paper.webp',
  x2: 'assets/maps/art/subway/subway-map-paper@2x.webp',
  w: 760,
  h: 460,
});

/**
 * The paper as renderSubwayMapSvg draws it: { href, hi, wait } (unkeyed). The Retina file on a
 * Retina screen (as js/map-graph.js picks a region's painting); a 1x screen gets the 760 x 460 file and
 * the Retina twin as `hi`, which game.js fitMapCanvas and js/map-zoom.js swap in once the map draws
 * past 760 x 460. js/map-bg-preload.js prepareSubwayPaper answers for the screen and the loader instead.
 */
export function subwayPaper({ dpr = Number(globalThis.devicePixelRatio) || 1, wait = false, paper = SUBWAY_PAPER } = {}) {
  return { href: dpr > 1 ? paper.x2 : paper.x1, hi: paper.x2, wait: Boolean(wait) };
}

/** The Red Line's stations in order as [x, y] (config_prod.js map_pos; the Blue Line runs them backwards). */
export function subwayPoints(stations = STATIONS) {
  return stations.map((s) => [s.map_pos[0], s.map_pos[1]]);
}

/**
 * A closed Catmull-Rom curve through the points, as cubic Bezier segments
 * [[p0, c1, c2, p1], ...] (one a pair of neighbouring stations).
 */
export function subwaySegments(pts) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    out.push([p1, c1, c2, p2]);
  }
  return out;
}

/** A cubic's point and direction (radians) at t. */
export function cubicAt([p0, c1, c2, p1], t) {
  const u = 1 - t;
  const x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0];
  const y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1];
  const dx = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p1[0] - c2[0]);
  const dy = 3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p1[1] - c2[1]);
  return { x, y, angle: Math.atan2(dy, dx) };
}

/**
 * The station to mark (MapTransit.as setPlayerLocation, there only on the line itself): the one you
 * stand at or above, else the one in your region, else the one whose region lies nearest yours on
 * the world map (centre to centre), else none. spot: { tsid, hubId } (game.js playerMapSpot).
 * Returns { station, how: 'here' | 'region' | 'near' } or null.
 */
export function nearestStation(spot, stations = STATIONS, regions = WORLD_MAP.regions) {
  const tsid = String(spot?.tsid || '');
  const hubId = String(spot?.hubId || '');
  const at = stations.find((s) => tsid && (s.surfaceStreetTsid === tsid || s.streetTsid === tsid));
  if (at) return { station: at, how: 'here' };
  const inRegion = stations.find((s) => String(s.surfaceHubId) === hubId);
  if (inRegion) return { station: inRegion, how: 'region' };
  const mine = regions[hubId]?.centre;
  if (!mine) return null;
  let best = null;
  for (const s of stations) {
    const c = regions[String(s.surfaceHubId)]?.centre;
    if (!c) continue;
    const d = Math.hypot(c[0] - mine[0], c[1] - mine[1]);
    if (!best || d < best.d) best = { station: s, d };
  }
  return best ? { station: best.station, how: 'near' } : null;
}

/**
 * The subway map as SVG on the client's 760 x 460 frame. here: nearestStation()'s answer. paper:
 * subwayPaper()'s answer; the plain sage rect stays under the picture, the colour on show while it
 * loads (with `wait` it starts hidden and fades in when it arrives: js/map-bg-preload.js watchMapBg,
 * style.css .subway-map-svg .map-bg-soft).
 */
export function renderSubwayMapSvg({ direction = 'forwards', here = null, stations = STATIONS, paper = subwayPaper() } = {}) {
  const W = 760;
  const H = 460;
  const colour = LINE_COLOURS[direction] || LINE_COLOURS.forwards;
  const segs = subwaySegments(subwayPoints(stations));
  const d = `M${segs[0][0].map(f1).join(',')}` + segs.map(([, c1, c2, p1]) => ` C${c1.map(f1).join(',')} ${c2.map(f1).join(',')} ${p1.map(f1).join(',')}`).join('') + ' Z';
  // One arrow a stretch, half way along it, pointing the way this line runs.
  const arrows = segs.map((seg) => {
    const m = cubicAt(seg, 0.5);
    const deg = (m.angle * 180) / Math.PI + (direction === 'backwards' ? 180 : 0);
    return `<path class="subway-arrow" d="M-6,-5 L6,0 L-6,5 Z" transform="translate(${f1(m.x)} ${f1(m.y)}) rotate(${f1(deg)})"/>`;
  }).join('');
  const mark = here?.station || null;
  const stops = stations.map((s) => {
    const [x, y] = s.map_pos;
    const [dx, dy, anchor] = SUBWAY_LABELS[s.id] || [14, -4, 'start'];
    const isHere = mark && mark.id === s.id;
    const label = `${s.name}, ${s.hubName}`;
    return `<g class="subway-stop${isHere ? ' is-here' : ''}" data-station="${s.id}" data-tsid="${esc(s.surfaceStreetTsid)}" data-hub="${esc(s.surfaceHubId)}" data-label="${esc(s.surfaceLabel)}">`
      + `<g class="subway-stop-hit" tabindex="0" role="button" aria-label="${esc(`${label}: set a destination or teleport`)}">`
      + `<circle class="subway-stop-pad" cx="${x}" cy="${y}" r="14"/><circle class="subway-stop-ring" cx="${x}" cy="${y}" r="6"/><circle class="subway-stop-dot" cx="${x}" cy="${y}" r="2.6"/>`
      + `<text class="subway-stop-name" x="${x + dx}" y="${y + dy}" text-anchor="${anchor}">${esc(s.name)}</text></g>`
      + `<text class="subway-stop-hub" x="${x + dx}" y="${y + dy + 15}" text-anchor="${anchor}" tabindex="0" role="link" aria-label="${esc(`${s.hubName} map`)}">${esc(s.hubName)}</text></g>`;
  }).join('');
  const art = mark ? SUBWAY_ART[direction === 'backwards' ? 'subway_map_current_station_blue' : 'subway_map_current_station_red'] : null;
  const you = mark && art
    ? `<image class="map-you subway-you" href="${esc(SUBWAY_ART_BASE + art[0])}" x="${mark.map_pos[0] - art[1] / 2}" y="${mark.map_pos[1] - art[2] / 2 - 1}" width="${art[1]}" height="${art[2]}" pointer-events="none"/>`
    : '';
  // The line buttons at the top right (MapTransit.as build: each line's name over a stroke of its colour).
  const buttons = ['forwards', 'backwards'].map((dir, i) => {
    const on = dir === direction;
    const x = 586 + i * 86;
    return `<g class="subway-line-btn${on ? ' is-on' : ''}" data-dir="${dir}" tabindex="0" role="button" aria-pressed="${on}" style="--line-c: ${LINE_COLOURS[dir]}">`
      + `<rect x="${x}" y="8" width="80" height="24" rx="5"/><line x1="${x + 8}" y1="20" x2="${x + 72}" y2="20"/>`
      + `<text x="${x + 40}" y="24.5" text-anchor="middle">${esc(lineName(dir))}</text></g>`;
  }).join('');
  // The paper, under the track and every name; its own class keeps the region painting's load and
  // Retina swap (game.js fitMapCanvas, js/map-zoom.js: image.map-bg-soft[data-hi]).
  const hi = paper?.hi && paper.hi !== paper.href ? ` data-hi="${esc(keyedArt(paper.hi))}"` : '';
  const paperArt = paper?.href
    ? `<image class="subway-paper-art map-bg-soft${paper.wait ? ' is-waiting' : ''}" href="${esc(keyedArt(paper.href))}"${hi} x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" pointer-events="none"/>`
    : '';
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="subway-map-svg" role="group" aria-label="Subway System, ${esc(lineName(direction))}" style="--line-c: ${colour}">`
    + `<rect class="subway-paper" width="${W}" height="${H}"/>${paperArt}`
    + `<path class="subway-track" d="${d}"/>${arrows}${stops}${you}${buttons}</svg>`;
}

/**
 * Clicks on a drawn subway map: onStop(event, station) a station, onHub(station) its region's name,
 * onLine(direction) a line button.
 */
export function bindSubwayMap(canvas, { onStop, onHub, onLine, stations = STATIONS } = {}) {
  const svg = canvas?.querySelector('svg.subway-map-svg');
  if (!svg) return null;
  const byId = (g) => stations.find((s) => String(s.id) === g.closest('.subway-stop')?.getAttribute('data-station')) || null;
  const keyed = (el, fn) => {
    el.addEventListener('click', fn);
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      fn({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, preventDefault() {} });
    });
  };
  for (const hit of svg.querySelectorAll('.subway-stop-hit')) {
    keyed(hit, (e) => { const s = byId(hit); if (s) onStop?.(e, s); });
    hit.addEventListener('contextmenu', (e) => { e.preventDefault(); const s = byId(hit); if (s) onStop?.(e, s); });
  }
  for (const t of svg.querySelectorAll('.subway-stop-hub')) keyed(t, () => { const s = byId(t); if (s) onHub?.(s); });
  for (const b of svg.querySelectorAll('.subway-line-btn')) keyed(b, () => onLine?.(b.getAttribute('data-dir')));
  return svg;
}

/** The quiet line under the map in each view. */
export function mapViewSubtitle(view, { touch = false, regions = [], here = null, direction = 'forwards' } = {}) {
  const verb = touch ? 'tap' : 'click';
  if (view === 'world') {
    const open = regions.filter((r) => r.open).length;
    return touch
      ? `${open} regions · tap a region to see it, tap again to open its map · red star = you`
      : `${open} regions · ${verb} a region to open its map · red star = you`;
  }
  if (view === 'subway') {
    const near = here?.station
      ? `${here.how === 'here' ? 'You are at' : 'Nearest station:'} ${here.station.name} (${here.station.hubName})`
      : 'No station near you';
    return `${STATIONS.length} stations · ${lineName(direction)} · ${near} · ${verb} a station to set a destination or teleport`;
  }
  return '';
}
