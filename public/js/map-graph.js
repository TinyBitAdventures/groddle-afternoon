/**
 * Hub map graph from original GSJS geometry (760×460 Flash coord space).
 * Multi-hub: load any hub JSON from assets/maps/hubs/ via index.
 * Pure logic — no DOM/Pixi. Click destination → travel plan via planTravel.
 */

import { listMapDestinations, planTravel, resolveLoadedTsid, tsidAliases } from './travel.js?v=855c6c68';

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
    };
  });

  const hubs = (hubData.hubs || []).map((h) => ({
    tsid: h.tsid || '',
    hubId: String(h.hub_id || h.hubId || ''),
    hubName: h.hubName || h.label || 'Hub',
    label: h.label || (h.hubName ? `To: ${h.hubName}` : 'GO'),
    x: h.x,
    y: h.y,
    arrow: h.arrow,
    travelable: false,
  }));

  const nodes = streets
    .filter((s) => s.loaded)
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

/**
 * Place street name labels with priority + simple collision resolution.
 * Loaded/current streets always keep labels; dim streets drop if crowded.
 *
 * @param {Array<{ name:string, x1:number,y1:number,x2:number,y2:number,mx:number,my:number,loaded?:boolean,current?:boolean }>} streets
 * @param {number} [mapW=760]
 * @param {number} [mapH=460]
 * @returns {{ name:string, x:number, y:number, rot:number, cls:string }[]}
 */
export function layoutStreetLabels(streets, mapW = 760, mapH = 460) {
  const ordered = [...(streets || [])].sort((a, b) => {
    const rank = (s) => (s.current ? 0 : s.loaded ? 1 : 2);
    return rank(a) - rank(b);
  });
  /** @type {{ x:number,y:number,w:number,h:number }[]} */
  const boxes = [];
  const out = [];

  for (const s of ordered) {
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
    const offset = s.current || s.loaded ? 11 : 8;
    let x = s.mx + nx * offset;
    let y = s.my + ny * offset;

    const fontW = s.current || s.loaded ? 6.2 : 5.0;
    const w = Math.max(28, String(s.name || '').length * fontW);
    const h = s.loaded || s.current ? 13 : 11;

    let placed = false;
    for (let tryN = 0; tryN < 24; tryN++) {
      const hit = boxes.some(
        (b) => Math.abs(b.x - x) < (b.w + w) * 0.48 && Math.abs(b.y - y) < (b.h + h) * 0.55
      );
      if (!hit) {
        placed = true;
        break;
      }
      if (tryN % 2 === 0) {
        y -= h * 0.85;
        x += nx * 2;
      } else {
        x += (tryN % 4 === 1 ? 1 : -1) * (w * 0.15);
        y += ny * 2;
      }
      x = Math.max(20, Math.min(mapW - 20, x));
      y = Math.max(14, Math.min(mapH - 14, y));
    }

    if (!placed && !s.loaded && !s.current) continue;
    if (!placed) y = Math.min(mapH - 14, y + h * 2);

    // Cap dim labels so dense hubs stay readable
    if (!s.loaded && !s.current) {
      const dimCount = out.filter((o) => o.cls.includes('dim')).length;
      if (dimCount >= 18) continue;
    }

    const cls = s.current
      ? 'map-label current'
      : s.loaded
        ? 'map-label loaded'
        : 'map-label dim';

    boxes.push({ x, y, w, h });
    out.push({ name: s.name, x, y, rot, cls });
  }
  return out;
}

/**
 * Build SVG markup for a hub map view (pure string).
 * Uses local bg/fg art when present.
 * @param {ReturnType<typeof buildHubMapView>} view
 */
export function renderHubMapSvg(view) {
  const w = view.mapW || 760;
  const h = view.mapH || 460;
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
  </defs>`);

  if (view.bgLocal) {
    parts.push(
      `<image class="map-bg" href="${escapeXml(view.bgLocal)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`
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
    if (s.loaded) continue;
    parts.push(
      `<line class="map-seg dim" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" ` +
        `data-tsid="${escapeXml(s.tsid)}" data-name="${escapeXml(s.name)}"/>`
    );
  }
  for (const s of view.streets || []) {
    if (!s.loaded) continue;
    const cls = s.current ? 'map-seg current' : 'map-seg travelable';
    const travelTsid = s.loadedTsid || s.tsid;
    parts.push(
      `<g class="map-street ${s.current ? 'current' : 'travelable'}" ` +
        `data-tsid="${escapeXml(travelTsid)}" data-label="${escapeXml(s.label)}" ` +
        `data-segment="${escapeXml(s.tsid)}">` +
        `<line class="${cls}" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"/>` +
        `<line class="map-seg-hit" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"/>` +
        `</g>`
    );
  }

  // Labels with collision-aware placement (reduces unreadable pile-ups)
  for (const lab of layoutStreetLabels(view.streets || [], view.mapW || 760, view.mapH || 460)) {
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
        `<text class="map-go-text" x="${h.x}" y="${h.y + 1}" text-anchor="middle" dominant-baseline="middle">GO</text>` +
        `<text class="map-go-sub" x="${h.x}" y="${h.y + 34}" text-anchor="middle">${escapeXml(h.label)}</text>` +
        `</g>`
    );
  }

  return (
    `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" ` +
    `role="img" aria-label="${escapeXml(view.hubName)} street map" class="hub-map-svg">` +
    parts.join('\n') +
    `</svg>`
  );
}

/**
 * List hubs from map index for UI (name + street counts).
 * @param {object} mapIndex
 * @param {{ keep?: string|null }} [opts] a zone hub to list anyway (the one on show)
 * @returns {{ hubId: string, hubName: string, streetCount: number, hasArt: boolean, file: string }[]}
 */
export function listHubsFromIndex(mapIndex, { keep = null } = {}) {
  const hubs = mapIndex?.hubs || {};
  return Object.values(hubs)
    // A published zone's hub (spec 11; its row carries `zone`) stays off the world's list of
    // regions (spec 15, Q5): its map opens from its own streets only, as `keep`.
    .filter((h) => !h.zone || (keep != null && String(h.hubId) === String(keep)))
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
