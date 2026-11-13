/**
 * The Map's world view (G471), beside the region map in the same window.
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
 */
import { WORLD_MAP } from './map-views-data.js?v=8e7d7094';

export const MAP_VIEWS = Object.freeze(['hub', 'world']);
/** The window's title in each view (the client's: the region's name, "World Map"). */
export const MAP_VIEW_TITLES = Object.freeze({ world: 'World Map' });

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
 * The world map as SVG (760 x 460 map units). youHubId: the region to star (none when the
 * player's region is not on the world map: the client's getRegion found none and drew no star).
 */
export function renderWorldMapSvg(regions, { youHubId = '', world = WORLD_MAP } = {}) {
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
    + `<image class="world-chart world-chart-locked" href="${esc(world.locked)}" width="${w}" height="${h}" preserveAspectRatio="none"/>`
    + `<image class="world-chart world-chart-open" href="${esc(world.unlocked)}" width="${w}" height="${h}" preserveAspectRatio="none" mask="url(#world-reveal)"/>`
    + `<image class="world-frames" href="${esc(world.frames)}" width="${w}" height="${h}" preserveAspectRatio="none" pointer-events="none"/>`
    + `<g class="world-regions">${hits}</g>${star}<g class="world-card-layer" pointer-events="none"></g></svg>`;
}

/**
 * Hover cards and clicks on a drawn world map. onOpen(hubId) opens a region's map. touch: the
 * first tap on a region shows its card, a second opens it. QA: canvas data worldCard <hub id>.
 */
export function bindWorldMap(canvas, { onOpen, touch = false, regions = WORLD_MAP.regions } = {}) {
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
    layer.innerHTML = `<image class="world-card" href="${esc(card.href)}" x="${x}" y="${y}" width="${cw}" height="${ch}" transform="matrix(${card.m.join(' ')})"/>`;
    // The client faded the star while its region's card was up (worldMapHoverHandler 357-366).
    if (star) star.classList.toggle('is-hidden', svg.querySelector(`.world-region[data-hub="${id}"]`)?.classList.contains('is-you') || false);
    canvas.dataset.worldCard = id;
  };
  const hide = (id) => {
    if (id && shown !== id) return;
    shown = '';
    shownBy = '';
    layer.innerHTML = '';
    star?.classList.remove('is-hidden');
    delete canvas.dataset.worldCard;
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
        show(id);
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

/** The quiet line under the map in each view. */
export function mapViewSubtitle(view, { touch = false, regions = [] } = {}) {
  const verb = touch ? 'tap' : 'click';
  if (view === 'world') {
    const open = regions.filter((r) => r.open).length;
    return touch
      ? `${open} regions · tap a region to see it, tap again to open its map · red star = you`
      : `${open} regions · ${verb} a region to open its map · red star = you`;
  }
  return '';
}
