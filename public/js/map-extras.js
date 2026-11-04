/**
 * The Map's Shortcuts (G192, ticket 21, SHORTCUTS 2026-11-04): the extra cards under one line beside the
 * route, opened over the map as a packed wall of cards that never runs past the Map's bottom edge.
 * DOM only (no game state), so tests/map-fit.test.js lays it out in a real browser.
 */

/**
 * G192: the Map's shortcut cards (home, puzzle streets, projects, ...) fold
 * into one Shortcuts line above the route card, so the map itself stays in
 * view; quest cards and the route card stay out. Open or shut is kept while
 * the game runs.
 *
 * Ticket 21 (Friendly: the Shortcuts and the destination squeezed the map, and the Shortcuts needed a
 * scrollbar): the Shortcuts line and the route card share one row (.map-bar), and the Shortcuts open
 * over the map at their full size; a click anywhere else on the Map shuts them.
 */
let mapExtrasOpen = false;
let mapExtrasObserver = null;

/**
 * SHORTCUTS (Austin 2026-11-04, Groddle Meadow at 1000 x 700, a route set, Teleportation II): the cards
 * sat in rows as tall as the tallest, so a short card left a hole under it and the last row ran past
 * the Map's bottom edge, where the card (overflow hidden) cut it off with no sign of more (the box
 * was capped at 72% of the window, not at the Map). Now the cards pack like a wall of notes: each
 * takes the next place in the shortest column (style.css [data-packed]: 1 px rows, dense flow, each
 * card spans its own height), the box stops above the Map's bottom edge (--map-extras-room), and when
 * they still do not fit it scrolls, its bottom fading while there is more (data-more).
 */
export function fitMapExtras(card) {
  const grid = card?.querySelector(':scope > .map-bar > .map-extras[open] > .map-extras-grid');
  if (!grid || !grid.isConnected) return;
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
  grid.dataset.packed = '1';
  for (const el of grid.children) el.style.gridRowEnd = `span ${Math.max(1, Math.ceil(el.offsetHeight + gap))}`;
  // Each card carries the gap under it, so the box's own bottom padding gives that much back.
  grid.style.paddingBottom = '';
  grid.style.paddingBottom = `${Math.max(0, (parseFloat(getComputedStyle(grid).paddingBottom) || 0) - gap)}px`;
  const room = Math.floor(card.getBoundingClientRect().bottom - grid.getBoundingClientRect().top - 8);
  grid.style.setProperty('--map-extras-room', `${Math.max(96, room)}px`);
  markMapExtrasMore(grid);
}

export function markMapExtrasMore(grid) {
  grid.dataset.more = grid.scrollHeight - grid.scrollTop - grid.clientHeight > 2 ? '1' : '0';
}

export function arrangeMapCards(panel) {
  const card = panel?.querySelector('.map-card');
  const canvas = panel?.querySelector('.map-canvas');
  if (!card || !canvas) return;
  // The row from the last open: its route card goes back in front of the map before the row is made again.
  for (const bar of card.querySelectorAll(':scope > .map-bar')) {
    for (const el of [...bar.children]) if (!el.classList.contains('map-extras')) card.insertBefore(el, bar);
    bar.remove();
  }
  card.querySelectorAll(':scope > .map-extras').forEach((el) => el.remove());
  const extras = [...card.children].filter((el) =>
    (el.classList.contains('map-home-card') || el.classList.contains('map-feature-card')) &&
    !el.matches('[data-map-route], .nx-map-card'));
  const route = card.querySelector(':scope > [data-map-route]');
  const bar = document.createElement('div');
  bar.className = 'map-bar';
  if (!extras.length) {
    if (route) {
      card.insertBefore(bar, route);
      bar.append(route);
    }
    return;
  }
  const titleOf = (el) => (el.dataset.mapTitle || el.querySelector('strong, h3, h4')?.textContent || el.firstElementChild?.textContent || '').trim().replace(/\s+/g, ' ');
  const details = document.createElement('details');
  details.className = 'map-extras';
  details.open = mapExtrasOpen;
  const summary = document.createElement('summary');
  const head = document.createElement('strong');
  head.textContent = 'Shortcuts';
  const list = document.createElement('span');
  list.textContent = extras.map(titleOf).filter(Boolean).join(' · ');
  summary.append(head, list);
  const grid = document.createElement('div');
  grid.className = 'map-extras-grid';
  grid.append(...extras);
  details.append(summary, grid);
  details.addEventListener('toggle', () => {
    mapExtrasOpen = details.open;
    if (details.open) fitMapExtras(card);
  });
  grid.addEventListener('scroll', () => markMapExtrasMore(grid), { passive: true });
  // A card that changes height (a Teleportation point's "New Teleport Point?", the window) packs again.
  mapExtrasObserver?.disconnect();
  if (typeof ResizeObserver === 'function') {
    mapExtrasObserver = new ResizeObserver(() => fitMapExtras(card));
    for (const el of extras) mapExtrasObserver.observe(el);
  }
  card.insertBefore(bar, route || canvas);
  bar.append(details);
  if (route) bar.append(route);
  if (!card.dataset.extrasShut) {
    card.dataset.extrasShut = '1';
    card.addEventListener('pointerdown', (e) => {
      const open = card.querySelector(':scope > .map-bar > .map-extras[open]');
      if (open && !open.contains(e.target)) open.open = false;
    });
  }
}
