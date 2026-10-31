/**
 * BUILDER: the house Decorate and yard Cultivate modes as the 2012 client drew them, over a room
 * that fills the stage. One DOM and one behaviour for both skins (style.css styles it for Modern,
 * css/classic.css for Classic); features/homes-feature.js keeps every rule and hands this module a
 * plain model to draw.
 *
 * The pieces, after Tiny Speck's client (glitch-client com/tinyspeck/engine):
 * - the banner across the top (view/ui/decorate/DecorateToolbarUI.as, view/ui/CultToolbarUI.as):
 *   "You are in Decoration Mode", "Use arrow keys to scroll • Press esc to exit", the Expand and
 *   Un-expand buttons and the close button;
 * - the tray that takes the pack's place (pack/PackTabberUI.as tabs Inventory, Furniture, Walls,
 *   Floors, Ceilings; pack/FurnitureBagUI.as tiles with their counts; pack/FurnitureBagFilterUI.as
 *   the filter row, "N furniture items" then one button per category; view/ui/TSScrollPager.as the
 *   paging arrows). In Cultivation Mode the tray is the picker (view/CultPickerUI.as): "Choose an
 *   item to see where you can add it on your street", then each choice with its iMG cost;
 * - the floating actions by a selected piece, and the Place button under what you carry
 *   (view/CultCarryUI.as: "Place (N iMG)", "Move Here"; the decorate ghost's "Place").
 *
 * Dragging: a tile pressed and moved more than DRAG_DIST (StateModel.as DRAG_DIST_REQUIRED 3, plus
 * one for touch) starts a drag the feature follows; a press that does not move is a click, so click
 * to carry still works, and so does the keyboard (each tile is a button).
 *
 * Camera: decorLook is the decorate camera's vertical range (the ceiling band under the banner, the
 * floor's front edge over the tray); edgePan is maybeScrollVPByDragging's edge test.
 */

/**
 * DecorateModel.as furniture_panesA: the furniture bag's filter categories, in the source's
 * order. `prefixes` matches class families (bag_furniture_*, trophy_*). The remake's catalog has
 * a few classes the source list predates (the small and large windows and wall decorations, the
 * painting, the plain lamp and cabinet); FAMILY puts each in the pane its family belongs to.
 */
export const FURNITURE_PANES = Object.freeze([
  { id: 'seating', label: 'seating', plural: 'seating', items: ['furniture_bench', 'furniture_loveseat', 'furniture_sofa', 'furniture_stool', 'furniture_chair', 'furniture_armchair'] },
  { id: 'beds', label: 'bed', plural: 'beds', items: ['furniture_bed'] },
  { id: 'fireplaces', label: 'fireplace', plural: 'fireplaces', items: ['furniture_fireplace'] },
  { id: 'tables', label: 'table', plural: 'tables', items: ['furniture_sidetable', 'furniture_coffeetable', 'furniture_table', 'furniture_desk', 'furniture_counter'] },
  { id: 'shelves', label: 'shelf', plural: 'shelves', items: ['furniture_shelf', 'furniture_bookcase'] },
  { id: 'storage', label: 'storage', plural: 'storage', items: [], prefixes: ['bag_furniture_'] },
  { id: 'lights', label: 'light', plural: 'lights', items: ['furniture_tablelamp', 'furniture_walllamp', 'furniture_floorlamp', 'furniture_ceilinglamp'] },
  { id: 'rugs', label: 'rug', plural: 'rugs', items: ['furniture_rug'] },
  { id: 'windows', label: 'window', plural: 'windows', items: ['furniture_window'] },
  { id: 'doors', label: 'door', plural: 'doors', items: ['furniture_door'] },
  { id: 'decorations', label: 'decoration', plural: 'decorations', items: ['furniture_walldeco', 'furniture_tabledeco', 'furniture_roomdeco', 'furniture_ceilingdeco'] },
  { id: 'trophies', label: 'trophy', plural: 'trophies', items: [], prefixes: ['trophy_'] },
]);

/** The remake's classes the source list does not name, by family (see FURNITURE_PANES). */
const FAMILY = Object.freeze([
  [/^furniture_\w*window$/, 'windows'],
  [/^furniture_\w*(deco|decor|painting)$/, 'decorations'],
  [/^furniture_\w*lamp$/, 'lights'],
  [/^furniture_\w*cabinet$/, 'storage'],
]);

/** The "All" filter (BagUI.as CATEGORY_ALL, FurnitureBagFilterUI "furniture item(s)"). */
export const ALL_PANE = Object.freeze({ id: 'all', label: 'furniture item', plural: 'furniture items' });

/** PURE: the filter category a furniture class belongs to, or null (shown under All only). */
export function furniturePane(classTsid) {
  const cls = String(classTsid || '');
  for (const pane of FURNITURE_PANES) {
    if (pane.items.includes(cls) || (pane.prefixes || []).some((p) => cls.startsWith(p))) return pane.id;
  }
  for (const [re, id] of FAMILY) if (re.test(cls)) return id;
  return null;
}

/**
 * PURE: the tray's filter row for these tiles ({ classTsid, total }): All first, then each category
 * that holds something, sorted by name as BagFilterUI lays them out, labelled "N label(s)".
 * @returns {{ id: string, count: number, label: string }[]}
 */
export function trayFilters(rows = []) {
  const counts = new Map();
  let all = 0;
  for (const row of rows) {
    const n = Math.max(0, Math.floor(Number(row?.total) || 0));
    if (!n) continue;
    all += n;
    const pane = furniturePane(row.classTsid);
    if (pane) counts.set(pane, (counts.get(pane) || 0) + n);
  }
  const label = (pane, n) => `${n} ${n === 1 ? pane.label : pane.plural}`;
  const out = [{ id: ALL_PANE.id, count: all, label: label(ALL_PANE, all) }];
  const ids = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  for (const id of ids) {
    const pane = FURNITURE_PANES.find((p) => p.id === id);
    out.push({ id, count: counts.get(id), label: label(pane, counts.get(id)) });
  }
  return out;
}

/** PURE: the tiles a filter shows (All, or a category's). */
export function filterTiles(rows = [], paneId = 'all') {
  if (!paneId || paneId === 'all') return rows.slice();
  return rows.filter((row) => furniturePane(row.classTsid) === paneId);
}

/** The words, from the client where it had them. */
export const BUILDER_TEXT = Object.freeze({
  decorateTitle: 'You are in Decoration Mode',
  decorateHint: 'Use arrow keys to scroll • Press Esc to exit',
  cultivateTitle: 'You are in Cultivation Mode',
  cultivateHint: 'Press Esc to exit',
  keys: 'Arrow keys or WASD scroll the room, Shift scrolls faster. [ and ] choose a placed piece. While you carry something, the arrow keys move it and Enter sets it down.',
  place: 'Place',
  moveHere: 'Move Here',
  dropToPickUp: 'Drop here to put it in storage',
  emptyFurniture: 'Everything is placed. Pick something up, buy furniture at the Furniture Store, or build some with a Construction Tool.',
  packNote: 'Drag things from your pack onto a shelf, a table or the floor.',
});

/** CultPickerUI.as choose_tf, for the street or (inside the house) the back yard. */
export function cultChooseText(back = false) {
  return `Choose an item to see where you can add it ${back ? 'in your yard' : 'on your street'}.`;
}

/** CultCarryUI.as invoke_bt: "Place (N iMG)". */
export function placeCostText(cost) {
  return `Place (${Math.max(0, Math.floor(Number(cost) || 0)).toLocaleString('en-US')} iMG)`;
}

/** HandOfDecorator.maybeScrollVPByKeys: the arrows and WASD, as a direction. */
const PAN_KEYS = Object.freeze({
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
});

/** PURE: [dx, dy] for a pan key (KeyboardEvent.key), or null. */
export function panKey(key) {
  return PAN_KEYS[key] || null;
}

/** World px the decorate camera moves a frame with a pan key held (Shift: faster, as getIncrement). */
export const PAN_SPEED = Object.freeze({ normal: 9, fast: 24 });

/** PURE: the held pan keys' direction, summed and cut to -1..1 per axis. */
export function panDirection(held = []) {
  let dx = 0;
  let dy = 0;
  for (const key of held) {
    const d = panKey(key);
    if (!d) continue;
    dx += d[0];
    dy += d[1];
  }
  return { dx: Math.sign(dx), dy: Math.sign(dy) };
}

/**
 * PURE: the camera centre x clamped to the room's span (world x), with `margin` past each end so
 * the house's frame shows; a room narrower than the view sits centred.
 */
export function clampRoomX(x, { left, right, view, margin = 40 }) {
  const lo = left - margin + view / 2;
  const hi = right + margin - view / 2;
  if (lo >= hi) return Math.round((left + right) / 2);
  return Math.round(Math.max(lo, Math.min(hi, Number(x) || 0)));
}

/**
 * PURE: the decorate camera's vertical range as look offsets (negative is up, as interiorLook),
 * for an avatar at `playerY` with the camera's `anchor` and a view `view` world px tall.
 * `top` is how much of the view the banner covers and `bottom` how much the tray covers (world px).
 * ceiling: the look that shows the ceiling band's top just under the banner; floor: the look that
 * shows the floor's front edge just over the tray. When the view holds both, both are the middle.
 * @returns {{ ceiling: number, floor: number, lo: number, hi: number }}
 */
export function decorLook({ playerY, anchor = 0.75, view, top = 0, bottom = 0, ceilingTop, floorFront, margin = 10 }) {
  const lookFor = (camY) => Math.round(camY - playerY + view * anchor);
  const ceiling = lookFor(ceilingTop - top - margin);
  const floor = lookFor(floorFront + bottom + margin - view);
  if (floor <= ceiling) {
    const mid = Math.round((ceiling + floor) / 2);
    return { ceiling: mid, floor: mid, lo: mid, hi: mid };
  }
  return { ceiling, floor, lo: ceiling, hi: floor };
}

/**
 * PURE: HandOfDecorator.maybeScrollVPByDragging's edge test. A point within `edge` css px of the
 * stage's left or right side, or of the top (under the banner) or the tray's top, scrolls that way.
 * `rect` is { left, top, right, bottom } of the area the room shows in.
 */
export function edgePan(x, y, rect, edge = 48) {
  if (!rect) return { dx: 0, dy: 0 };
  let dx = 0;
  let dy = 0;
  if (x < rect.left + edge) dx = -1;
  else if (x > rect.right - edge) dx = 1;
  if (y < rect.top + edge && y >= rect.top - edge * 2) dy = -1;
  else if (y > rect.bottom - edge && y <= rect.bottom) dy = 1;
  return { dx, dy };
}

/** HandOfDecorator: hold at an edge this long before it scrolls (500 ms in the source). */
export const EDGE_DELAY_MS = 500;
/** Css px a press must move before it is a drag. */
export const DRAG_DIST = 4;

// ---------------------------------------------------------------------------
// The DOM
// ---------------------------------------------------------------------------

function el(doc, tag, attrs = {}, children = []) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child != null && child !== false) node.append(child);
  return node;
}

/** A model button ({ label, onClick, disabled, title, primary, attrs }) as a DOM button. */
function button(doc, b, cls = '') {
  const node = el(doc, 'button', {
    type: 'button',
    class: [cls, b.primary ? 'primary' : '', b.className || ''].filter(Boolean).join(' ') || false,
    disabled: Boolean(b.disabled),
    title: b.title || false,
    'aria-label': b.ariaLabel || false,
    'aria-pressed': b.pressed == null ? false : String(Boolean(b.pressed)),
    ...(b.attrs || {}),
  }, b.icon ? [el(doc, 'span', { class: 'hb-btn-ic', 'aria-hidden': 'true', text: b.icon }), el(doc, 'span', { text: b.label })] : [b.label]);
  if (b.onClick) node.addEventListener('click', (e) => b.onClick(e));
  return node;
}

/**
 * The builder's DOM in `root` (#game-root). render(model) redraws the banner and the tray;
 * setPop / setPlace draw the floating actions and the Place button at a client point.
 * The section keeps the old bar's id (#homes-bar) and close class (.hb-close): game.js's Shift+D
 * finds the close button by them.
 */
export function createHomeBuilder({ root, doc = root?.ownerDocument }) {
  if (!root || !doc) return null;
  const bar = el(doc, 'section', { class: 'homes-bar hb-builder', id: 'homes-bar', hidden: true, 'aria-label': 'Home building' });
  const banner = el(doc, 'header', { class: 'hb-banner' });
  const tray = el(doc, 'div', { class: 'hb-tray', id: 'homes-tray', role: 'region' });
  const keysHelp = el(doc, 'p', { class: 'hb-sr', id: 'homes-keys-help', text: BUILDER_TEXT.keys });
  bar.append(banner, tray, keysHelp);
  const pop = el(doc, 'div', { class: 'hb-pop', id: 'homes-pop', role: 'toolbar', hidden: true });
  const place = el(doc, 'button', { type: 'button', class: 'hb-place', id: 'homes-place', hidden: true });
  root.append(bar, pop, place);
  const html = doc.documentElement;

  let model = null;
  let press = null; // a tile pressed, before it is a drag
  let suppressClick = false;

  const onWindowMove = (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_DIST) return;
      press.dragging = true;
      press.node.classList.add('is-dragging');
      bar.classList.add('is-dragging');
      press.tile.onDragStart?.(e);
    }
    e.preventDefault();
    press.tile.onDragMove?.(e);
  };
  const endPress = (e, cancelled = false) => {
    if (!press || (e && e.pointerId !== press.pointerId)) return;
    const was = press;
    press = null;
    doc.defaultView?.removeEventListener('pointermove', onWindowMove, true);
    doc.defaultView?.removeEventListener('pointerup', onWindowUp, true);
    doc.defaultView?.removeEventListener('pointercancel', onWindowCancel, true);
    was.node.classList.remove('is-dragging');
    bar.classList.remove('is-dragging');
    if (!was.dragging) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    was.tile.onDragEnd?.(e, { cancelled, overTray: !cancelled && e ? trayHit(e.clientX, e.clientY) : true });
  };
  const onWindowUp = (e) => endPress(e, false);
  const onWindowCancel = (e) => endPress(e, true);

  /** Classic hangs the banner in the header over the world: the world's centre, in window px. */
  function syncCentre() {
    const r = root.getBoundingClientRect();
    const cx = `${Math.round(r.left + r.width / 2)}px`;
    if (bar.style.getPropertyValue('--hb-cx') !== cx) bar.style.setProperty('--hb-cx', cx);
  }

  function trayHit(x, y) {
    if (bar.hidden || tray.hidden) return false;
    const r = tray.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function tileNode(t) {
    const node = el(doc, 'button', {
      type: 'button',
      class: ['hb-tile', t.on ? 'on' : '', t.kind ? `hb-tile-${t.kind}` : ''].filter(Boolean).join(' '),
      disabled: Boolean(t.disabled),
      title: t.title || false,
      'aria-label': t.ariaLabel || false,
      'aria-pressed': t.on == null ? false : String(Boolean(t.on)),
      'aria-describedby': t.describedBy || false,
      ...(t.attrs || {}),
    }, [
      t.label && t.labelTop ? el(doc, 'span', { class: 'hb-tile-name', text: t.label }) : null,
      t.swatch
        ? el(doc, 'span', { class: 'hb-swatch', style: `background-image:url(${t.swatch})`, 'aria-hidden': 'true' })
        : t.img ? el(doc, 'img', { src: t.img, alt: '', draggable: 'false' }) : null,
      t.label && !t.labelTop ? el(doc, 'span', { class: 'hb-tile-name', text: t.label }) : null,
      t.count != null ? el(doc, 'span', { class: 'hb-count', text: String(t.count), 'aria-hidden': 'true' }) : null,
      t.cost != null ? el(doc, 'span', { class: 'hb-cost', text: t.cost, 'aria-hidden': t.costHidden ? 'true' : false }) : null,
    ]);
    node.addEventListener('click', (e) => {
      if (suppressClick) {
        e.preventDefault();
        return;
      }
      t.onActivate?.({ keyboard: e.detail === 0 });
    });
    if (t.onDragStart && !t.disabled) {
      node.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || press) return;
        press = { tile: t, node, x: e.clientX, y: e.clientY, pointerId: e.pointerId, dragging: false };
        doc.defaultView?.addEventListener('pointermove', onWindowMove, true);
        doc.defaultView?.addEventListener('pointerup', onWindowUp, true);
        doc.defaultView?.addEventListener('pointercancel', onWindowCancel, true);
      });
      node.addEventListener('dragstart', (e) => e.preventDefault());
    }
    return node;
  }

  function renderBanner(m) {
    const title = el(doc, 'div', { class: 'hb-banner-text' }, [
      el(doc, 'h2', { class: 'hb-title', id: 'homes-title', text: m.title }),
      el(doc, 'p', { class: 'hb-hint', text: m.hint }),
    ]);
    const actions = el(doc, 'div', { class: 'hb-banner-actions' }, (m.bannerActions || []).map((b) => button(doc, b, 'hb-bt')));
    const close = el(doc, 'button', { type: 'button', class: 'hb-close', 'aria-label': m.closeLabel || 'Close', title: m.closeLabel || 'Close', text: '×' });
    close.addEventListener('click', () => m.onClose?.());
    banner.replaceChildren(title, actions, close);
  }

  function renderTray(m) {
    tray.dataset.tab = m.tab || '';
    tray.setAttribute('aria-label', m.trayLabel || 'Furniture');
    const parts = [];
    if (m.tabs?.length) {
      const tabs = el(doc, 'div', { class: 'hb-tabs', role: 'tablist', 'aria-label': m.tabsLabel || 'Show' }, m.tabs.map((t) => {
        const node = el(doc, 'button', {
          type: 'button',
          role: 'tab',
          class: t.id === m.tab ? 'on' : false,
          'aria-selected': String(t.id === m.tab),
          'data-home-tab': t.id,
          id: `homes-tab-${t.id}`,
          text: t.label,
        });
        node.addEventListener('click', () => m.onTab?.(t.id));
        return node;
      }));
      // Arrow keys between tabs, as a tablist.
      tabs.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const list = [...tabs.querySelectorAll('[role="tab"]')];
        const i = list.indexOf(doc.activeElement);
        if (i < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const next = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
        next.focus();
        next.click();
      });
      parts.push(tabs);
    }
    const panel = el(doc, 'div', { class: 'hb-panel', role: m.tabs?.length ? 'tabpanel' : false, 'aria-labelledby': m.tabs?.length ? `homes-tab-${m.tab}` : false, hidden: Boolean(m.panelHidden) });
    if (m.aside) {
      panel.append(el(doc, 'div', { class: 'hb-aside' }, [
        el(doc, 'p', { class: 'hb-note', text: m.aside.text }),
        m.aside.balance ? el(doc, 'p', { class: 'hb-balance', text: m.aside.balance }) : null,
      ]));
    }
    const strip = el(doc, 'div', { class: 'hb-strip', role: 'list', 'aria-label': m.stripLabel || 'Choices' });
    for (const group of m.groups || [{ tiles: m.tiles || [] }]) {
      if (group.heading) strip.append(el(doc, 'span', { class: 'hb-group', role: 'presentation', text: group.heading }));
      for (const t of group.tiles) {
        const node = tileNode(t);
        node.setAttribute('role', 'listitem');
        strip.append(node);
      }
    }
    if (m.empty) strip.append(el(doc, 'p', { class: 'hb-note hb-empty', text: m.empty }));
    const page = (dir) => {
      const step = Math.max(80, strip.clientWidth - 80);
      strip.scrollBy({ left: dir * step, behavior: doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    const prev = el(doc, 'button', { type: 'button', class: 'hb-page hb-page-prev', 'aria-label': 'Scroll left', tabindex: '-1', text: '‹' });
    const next = el(doc, 'button', { type: 'button', class: 'hb-page hb-page-next', 'aria-label': 'Scroll right', tabindex: '-1', text: '›' });
    prev.addEventListener('click', () => page(-1));
    next.addEventListener('click', () => page(1));
    const syncPager = () => {
      prev.disabled = strip.scrollLeft <= 1;
      next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
    };
    strip.addEventListener('scroll', syncPager, { passive: true });
    // A vertical wheel over the strip scrolls it sideways.
    strip.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      strip.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    const oldStrip = tray.querySelector('.hb-strip');
    const keepScroll = oldStrip && m.stripKey && oldStrip.dataset.key === m.stripKey ? oldStrip.scrollLeft : 0;
    strip.dataset.key = m.stripKey || '';
    panel.append(prev, strip, next);
    if (m.trayActions?.length) {
      panel.append(el(doc, 'div', { class: 'hb-tray-actions', role: 'group', 'aria-label': m.trayActionsLabel || false }, [
        m.trayActionsLabel ? el(doc, 'span', { class: 'hb-tray-actions-title', text: m.trayActionsLabel }) : null,
        el(doc, 'div', { class: 'hb-tray-actions-row' }, m.trayActions.map((b) => button(doc, b, 'hb-bt'))),
        m.trayActionsNote ? el(doc, 'span', { class: 'hb-note', text: m.trayActionsNote }) : null,
      ]));
    }
    parts.push(panel);
    if (m.filters?.length && !m.panelHidden) {
      parts.push(el(doc, 'div', { class: 'hb-filters', role: 'group', 'aria-label': 'Show furniture' }, m.filters.map((f) => {
        const node = el(doc, 'button', {
          type: 'button',
          class: f.id === m.filter ? 'on' : false,
          'aria-pressed': String(f.id === m.filter),
          'data-home-filter': f.id,
          text: f.label,
        });
        node.addEventListener('click', () => m.onFilter?.(f.id));
        return node;
      })));
    }
    if (m.note || m.footActions?.length || m.bannerActions?.length) {
      parts.push(el(doc, 'div', { class: 'hb-foot' }, [
        el(doc, 'p', { class: 'hb-note hb-tray-note', role: 'status', text: m.note || '' }),
        ...(m.footActions || []).map((b) => button(doc, b, 'hb-bt')),
        // The banner's buttons again, for a skin whose header has no room for them (Classic, narrow).
        ...(m.bannerActions || []).map((b) => button(doc, { ...b, attrs: { ...(b.attrs || {}), 'data-home-mirror': '1' } }, 'hb-bt hb-foot-mirror')),
      ]));
    }
    tray.replaceChildren(...parts);
    if (keepScroll) strip.scrollLeft = keepScroll;
    syncPager();
    // Keep the chosen tile in view.
    strip.querySelector('.hb-tile.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  return {
    bar,
    banner,
    tray,
    pop,
    place,
    get model() {
      return model;
    },
    /** Draw the banner and the tray for `m`, or hide everything when `m` is null. */
    render(m) {
      model = m;
      // Keep focus where it was across a redraw (the same tile, tab or button by its data hook).
      const active = doc.activeElement;
      const hook = active && bar.contains(active) ? focusHook(active) : null;
      bar.hidden = !m;
      if (!m) {
        delete html.dataset.homeBuilder;
        delete html.dataset.homeTray;
        this.setPop(null);
        this.setPlace(null);
        return;
      }
      html.dataset.homeBuilder = m.mode;
      syncCentre();
      html.dataset.homeTray = m.tab || m.mode;
      bar.dataset.homeMode = m.mode;
      bar.setAttribute('aria-labelledby', 'homes-title');
      bar.setAttribute('aria-describedby', 'homes-keys-help');
      renderBanner(m);
      renderTray(m);
      if (hook) bar.querySelector(hook)?.focus({ preventScroll: true });
    },
    /**
     * The floating actions by a selected piece: { title, sub, actions: [button models],
     * extra: [nodes] } at client point { x, y } (the top centre of the piece), or null.
     */
    setPop(p, at = null) {
      if (!p) {
        pop.hidden = true;
        pop.replaceChildren();
        pop._key = '';
        return;
      }
      const key = p.key || '';
      if (pop._key !== key || pop.hidden) {
        const keep = pop.contains(doc.activeElement) ? focusHook(doc.activeElement) : null;
        pop.setAttribute('aria-label', p.title || 'Actions');
        pop.replaceChildren(
          el(doc, 'div', { class: 'hb-pop-head' }, [
            el(doc, 'strong', { text: p.title || '' }),
            p.sub ? el(doc, 'span', { class: 'hb-pop-sub', text: p.sub }) : null,
          ]),
          el(doc, 'div', { class: 'hb-actions' }, [...(p.actions || []).map((b) => (b?.nodeType ? b : button(doc, b, 'hb-bt'))), ...(p.extra || [])]),
        );
        pop._key = key;
        pop.hidden = false;
        if (keep) pop.querySelector(keep)?.focus({ preventScroll: true });
      }
      if (at) this.movePop(at);
    },
    /** Move the floating actions to a client point (top centre of the piece); flips under it near the top. */
    movePop(at) {
      if (pop.hidden || !at) return;
      const host = root.getBoundingClientRect();
      const w = pop.offsetWidth || 0;
      const h = pop.offsetHeight || 0;
      const topLimit = (banner.getBoundingClientRect().bottom || host.top) - host.top + 8;
      let x = Math.round(at.x - host.left - w / 2);
      x = Math.max(8, Math.min(host.width - w - 8, x));
      let y = Math.round(at.y - host.top - h - 12);
      let below = false;
      if (y < topLimit && at.bottom != null) {
        y = Math.round(at.bottom - host.top + 12);
        below = true;
      }
      const trayTop = (tray.getBoundingClientRect().top || host.bottom) - host.top;
      y = Math.max(topLimit, Math.min(trayTop - h - 8, y));
      const tx = `translate(${x}px, ${y}px)`;
      if (pop.style.transform !== tx) pop.style.transform = tx;
      pop.classList.toggle('is-below', below);
    },
    /**
     * The Place button under what you carry: { label, disabled, follow, onClick } at client
     * point { x, y }, or null. `follow` (the pointer carries it) lets clicks through to the room.
     */
    setPlace(p, at = null) {
      if (!p || !at) {
        place.hidden = true;
        place.onclick = null;
        return;
      }
      if (place.textContent !== p.label) place.textContent = p.label;
      // aria-disabled, not disabled: a bad spot keeps the button focused while you walk to a good one.
      place.setAttribute('aria-disabled', String(Boolean(p.disabled)));
      place.title = p.disabled ? p.badTitle || '' : '';
      place.classList.toggle('is-following', Boolean(p.follow));
      place.tabIndex = p.follow ? -1 : 0;
      place.onclick = p.onClick ? (e) => (place.getAttribute('aria-disabled') === 'true' ? p.onRefused?.(e) : p.onClick(e)) : null;
      place.hidden = false;
      const host = root.getBoundingClientRect();
      const w = place.offsetWidth || 0;
      const x = Math.round(Math.max(4, Math.min(host.width - w - 4, at.x - host.left - w / 2)));
      const trayTop = (tray.getBoundingClientRect().top || host.bottom) - host.top;
      const y = Math.round(Math.min(trayTop - (place.offsetHeight || 0) - 6, at.y - host.top + 10));
      const tx = `translate(${x}px, ${y}px)`;
      if (place.style.transform !== tx) place.style.transform = tx;
    },
    /** True when the client point is over the tray (a drop there puts a piece away). */
    trayHit,
    /** The client rect the room shows in: under the banner, over the tray. */
    roomRect() {
      syncCentre();
      const host = root.getBoundingClientRect();
      const b = banner.getBoundingClientRect();
      const t = tray.getBoundingClientRect();
      return {
        left: host.left,
        right: host.right,
        top: bar.hidden || !b.height ? host.top : b.bottom,
        bottom: bar.hidden || !t.height ? host.bottom : t.top,
      };
    },
    /** Cancel a tile drag in progress (Escape). */
    cancelDrag() {
      if (press) endPress(null, true);
    },
    get dragging() {
      return Boolean(press?.dragging);
    },
  };
}

/** A selector that finds the same control after a redraw. */
function focusHook(node) {
  for (const a of ['data-furniture', 'data-swatch', 'data-cultivate', 'data-home-tab', 'data-home-filter', 'data-home-action', 'data-home-expand', 'data-home-unexpand', 'data-home-store', 'data-tower-expand']) {
    const v = node.getAttribute?.(a);
    if (v != null) {
      const style = a === 'data-furniture' ? node.getAttribute('data-furniture-style') : null;
      return `[${a}="${CSS.escape(v)}"]${style != null ? `[data-furniture-style="${CSS.escape(style)}"]` : ''}`;
    }
  }
  if (node.classList?.contains('hb-close')) return '.hb-close';
  return null;
}
