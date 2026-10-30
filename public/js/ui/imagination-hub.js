/**
 * The modern skin's Imagination hub on X (phase 2, Warm paper; the HUD mock is the spec):
 * six round tiles in an arc over the avatar, the world dimmed around it, and a pill with the
 * iMG there is to spend. It is the client's Imagination menu (ImgMenuView.as: the clouds for
 * Skills, Quests, Upgrades, Your Looks, Teleport and Home, opened with X) drawn the modern way.
 *
 * Keys while it is open (ImgMenuView.as 498-524 listened for its own letters and the arrows):
 * S, Q, U, L, T and H open their tile; the arrows (and Tab) move between tiles; Enter or Space
 * opens the focused one; Esc and X close it. It has the keyboard while it is up, so no key
 * reaches the avatar or the game's own hotkeys.
 *
 * Each tile opens what the game opens today (game.js passes `actions`): Upgrades is what X
 * opened before the hub (the upgrade cards), the others what their own keys or buttons open.
 * The art is the game's own imagination card art (assets/imagination/cards).
 *
 * Everything here is the modern skin's; Classic has its own hub. style.css scopes the look to
 * <html data-ui="modern">. The pure helpers below are tested without a DOM
 * (tests/imagination-hub.test.js).
 */

const ART = 'assets/imagination/cards/';

/** The tiles in the arc, left to right (the mock's order). */
export const HUB_TILES = Object.freeze([
  Object.freeze({ id: 'skills', label: 'Skills', key: 'S', art: `${ART}art_brain.svg` }),
  Object.freeze({ id: 'quests', label: 'Quests', key: 'Q', art: `${ART}art_questbook.svg` }),
  Object.freeze({ id: 'upgrades', label: 'Upgrades', key: 'U', art: `${ART}art_keepable_reshuffle.svg` }),
  Object.freeze({ id: 'looks', label: 'Looks', key: 'L', art: `${ART}art_avatar_walking.svg` }),
  Object.freeze({ id: 'teleport', label: 'Teleport', key: 'T', art: `${ART}art_skill_teleportation.svg` }),
  Object.freeze({ id: 'home', label: 'Home', key: 'H', art: `${ART}art_map.svg` }),
]);

/** The mock's arc: radius 205 px, 1.3 times as wide as it is tall, tiles 92 px wide. */
export const HUB_RADIUS = 205;
export const HUB_RADIUS_MIN = 150;
export const HUB_WIDEN = 1.3;
const TILE_HALF_W = 46;
const TILE_HALF_H = 50;
const EDGE = 8;

const plain = (e) => Boolean(e) && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;

/** The tile a plain letter opens, or null. */
export function hubTileForKey(e, tiles = HUB_TILES) {
  if (!plain(e) || typeof e.key !== 'string' || e.key.length !== 1) return null;
  const k = e.key.toUpperCase();
  return tiles.find((t) => t.key === k) || null;
}

/** True for the keys that close the hub: Esc, and X (the key that opened it). */
export function isHubCloseKey(e) {
  if (!e) return false;
  if (e.key === 'Escape') return true;
  return plain(e) && (e.key === 'x' || e.key === 'X');
}

/** The focus step for an arrow or Tab key (-1, +1), or 0. */
export function hubStep(e) {
  if (!e) return 0;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return 1;
  if (e.key === 'Tab') return e.shiftKey ? -1 : 1;
  return 0;
}

/**
 * Where everything sits, in #game-root px. `head` and `feet` are the avatar's on screen; `root`
 * is { w, h }; `top` is the HUD's floor at the top (the top bar), `bottom` the pack's top, and
 * `right` the Social drawer's width. The arc's centre sits halfway down the avatar (the mock:
 * head + 84 of a 165 px avatar), the radius shrinks on a short window, and the whole arc moves
 * in to stay on screen.
 * Returns { cx, cy, r, tiles: [{ x, y }], pill: { x, y } }.
 */
export function hubLayout({ head, feet, root, top = 56, bottom = null, right = 0, count = HUB_TILES.length } = {}) {
  const w = Math.max(0, Number(root?.w) || 0);
  const h = Math.max(0, Number(root?.h) || 0);
  const floor = Number.isFinite(bottom) ? Math.min(h, bottom) : h;
  const r = Math.round(Math.max(HUB_RADIUS_MIN, Math.min(HUB_RADIUS, (h - 120) / 3)));
  const halfW = r * HUB_WIDEN + TILE_HALF_W;
  const hx = Number.isFinite(head?.x) ? head.x : w / 2;
  const hy = Number.isFinite(head?.y) ? head.y : h / 2;
  const fy = Number.isFinite(feet?.y) ? feet.y : hy + 150;
  let cx = hx;
  let cy = (hy + fy) / 2;
  const minX = EDGE + halfW;
  const maxX = w - Math.max(0, right) - EDGE - halfW;
  cx = maxX >= minX ? Math.min(maxX, Math.max(minX, cx)) : (minX + maxX) / 2;
  cy = Math.max(top + r + TILE_HALF_H, cy);
  const pillY = Math.min(floor - 44, Math.max(cy + 24, fy + 16));
  cy = Math.min(cy, pillY - 24);
  const tiles = [];
  for (let i = 0; i < count; i++) {
    const a = count > 1 ? Math.PI - (i * Math.PI) / (count - 1) : Math.PI / 2;
    tiles.push({ x: Math.round(cx + Math.cos(a) * r * HUB_WIDEN), y: Math.round(cy - Math.sin(a) * r) });
  }
  return { cx: Math.round(cx), cy: Math.round(cy), r, tiles, pill: { x: Math.round(cx), y: Math.round(pillY) } };
}

/** The pill's words for a balance of iMG. */
export function hubPillText(imagination) {
  const n = Math.max(0, Math.floor(Number(imagination) || 0));
  return `${n.toLocaleString('en-US')} iMG to spend`;
}

function reducedMotion(win) {
  try {
    return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * Mounts the hub in `root` (#game-root). Options:
 * - actions: { skills, quests, upgrades, looks, teleport, home }: what each tile opens.
 * - canOpen(): false while the game is busy (a panel, a verb, a screen), as X was before.
 * - anchor(): { head: {x, y}, feet: {x, y} } in #game-root px, the avatar on screen.
 * - imagination(): the iMG to spend.
 * - setData(key, value): the canvas QA attributes (hubOpen, hubLast).
 * - onOpenChange(open): the top bar's button state.
 * Returns { open, close, toggle, isOpen, pick, el }.
 */
export function mountImaginationHub(doc, { root, actions = {}, canOpen = () => true, anchor = () => null, imagination = () => 0, setData = () => {}, onOpenChange = () => {} } = {}) {
  if (!doc || !root) return null;
  const win = doc.defaultView || globalThis.window;
  const el = doc.createElement('div');
  el.id = 'imagination-hub';
  el.className = 'imagination-hub';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Imagination');
  el.innerHTML =
    '<div class="hub-scrim" data-hub-scrim></div>' +
    HUB_TILES.map((t, i) =>
      `<button type="button" class="hub-tile" data-hub-tile="${t.id}" style="--hub-i:${i}" aria-keyshortcuts="${t.key}">` +
      `<span class="hub-art" style="background-image:url('${t.art}')" aria-hidden="true"></span>` +
      `<span class="hub-label"><span class="kcap" aria-hidden="true">${t.key}</span>${t.label}</span></button>`).join('') +
    '<div class="hub-pill" data-hub-pill><img src="assets/imagination/ui/imagination_button.png" alt="" />' +
    '<span data-hub-img></span><span class="kcap" aria-hidden="true">Esc</span></div>';
  root.appendChild(el);
  const tiles = [...el.querySelectorAll('[data-hub-tile]')];
  const pillEl = el.querySelector('[data-hub-pill]');
  const imgEl = el.querySelector('[data-hub-img]');
  let opener = null;
  let last = '';

  function place() {
    const rr = root.getBoundingClientRect();
    const a = anchor() || {};
    let top = 56;
    const bar = doc.querySelector('.top-bar');
    if (bar) {
      const b = bar.getBoundingClientRect();
      if (b.height) top = b.bottom - rr.top + 8;
    }
    const pack = doc.getElementById('pack-bar');
    const pr = pack && !pack.hidden ? pack.getBoundingClientRect() : null;
    const right = Number.parseFloat(win?.getComputedStyle?.(root).getPropertyValue('--inset-r')) || 0;
    const lay = hubLayout({ head: a.head, feet: a.feet, root: { w: rr.width, h: rr.height }, top, bottom: pr?.height ? pr.top - rr.top : null, right });
    el.style.setProperty('--hub-x', `${lay.cx}px`);
    el.style.setProperty('--hub-y', `${lay.cy}px`);
    lay.tiles.forEach((p, i) => {
      const t = tiles[i];
      t.style.left = `${p.x}px`;
      t.style.top = `${p.y}px`;
      // The tile flies out from the centre (the mock's --fx/--fy: 60% of the way back).
      t.style.setProperty('--hub-fx', `${Math.round((lay.cx - p.x) * 0.6)}px`);
      t.style.setProperty('--hub-fy', `${Math.round((lay.cy - p.y) * 0.6)}px`);
    });
    pillEl.style.left = `${lay.pill.x}px`;
    pillEl.style.top = `${lay.pill.y}px`;
    return lay;
  }

  function focusTile(i) {
    const n = tiles.length;
    tiles[((i % n) + n) % n].focus({ preventScroll: true });
  }

  function onKey(e) {
    if (el.hidden) return;
    const t = e.target;
    // A text field outside the hub (the online chat box) keeps its keys.
    if (t?.closest?.('input, textarea, select, [contenteditable="true"]') && !el.contains(t)) return;
    e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;
    if (isHubCloseKey(e)) {
      e.preventDefault();
      if (!e.repeat) close();
      return;
    }
    const tile = hubTileForKey(e);
    if (tile) {
      e.preventDefault();
      if (!e.repeat) pick(tile.id);
      return;
    }
    const step = hubStep(e);
    if (step) {
      e.preventDefault();
      const i = tiles.indexOf(doc.activeElement);
      focusTile(i < 0 ? (step > 0 ? 0 : tiles.length - 1) : i + step);
      return;
    }
    if (plain(e) && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (e.repeat) return;
      const i = tiles.indexOf(doc.activeElement);
      if (i >= 0) pick(tiles[i].dataset.hubTile);
      return;
    }
    // Everything else stays away from the avatar and the hotkeys while the hub is up.
    if (e.key?.length === 1) e.preventDefault();
  }

  function publish() {
    setData('hubOpen', el.hidden ? 'no' : 'yes');
    setData('hubLast', last);
  }

  function open() {
    if (!el.hidden) return true;
    if (!canOpen()) return false;
    opener = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
    imgEl.textContent = hubPillText(imagination());
    el.classList.toggle('is-still', reducedMotion(win));
    el.hidden = false;
    place();
    win?.addEventListener?.('keydown', onKey, true);
    win?.addEventListener?.('keypress', onKey, true);
    focusTile(0);
    onOpenChange(true);
    publish();
    return true;
  }

  function close({ restoreFocus = true } = {}) {
    if (el.hidden) return false;
    el.hidden = true;
    win?.removeEventListener?.('keydown', onKey, true);
    win?.removeEventListener?.('keypress', onKey, true);
    const back = opener;
    opener = null;
    if (restoreFocus && back?.isConnected) back.focus?.({ preventScroll: true });
    else if (el.contains(doc.activeElement)) doc.activeElement.blur?.();
    onOpenChange(false);
    publish();
    return true;
  }

  /** Closes the hub and opens a tile's panel (what the game opens for it today). */
  function pick(id) {
    const action = actions[id];
    if (!action) return false;
    last = id;
    close({ restoreFocus: false });
    action();
    return true;
  }

  for (const t of tiles) t.addEventListener('click', () => pick(t.dataset.hubTile));
  el.querySelector('[data-hub-scrim]').addEventListener('click', () => close());
  win?.addEventListener?.('resize', () => {
    if (!el.hidden) place();
  });
  publish();

  return {
    el,
    open,
    close: () => close(),
    toggle: () => (el.hidden ? open() : close()),
    isOpen: () => !el.hidden,
    pick,
    layout: () => (el.hidden ? null : place()),
  };
}
