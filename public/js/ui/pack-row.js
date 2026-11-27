/**
 * The modern pack (phase 2, Warm paper; the HUD mock's one-row pack): one
 * centred floating row instead of the two full-width rows. In order: the bag
 * buttons, each with a fill bar; a divider; the stacks (items, then tools);
 * one ghost slot "+N" for the free slots; a pager that shows only when the
 * row overflows; the slot count; search.
 *
 * game.js still draws every slot (renderPackRow: click for actions,
 * Shift-click to quick use, the drags to bags, vendors, players and the
 * world) and the open bag (renderOpenBagRow, now a tray over the row anchored
 * to its bag). This module is the view around them: the search field, the
 * pager, the count, the tray's place and the slots' tooltip.
 *
 * Search is the client's Inventory Search (TSMainView.as 654-655: Shift+F and
 * the backquote key, shiftFKeyHandler 846-855; hotkeys.png "Inventory Search:
 * Shift+F"; InventorySearch.as onElementSelect 148-166: picking a stack opens
 * its menu). It finds stacks in the pack and inside every bag; a stack in a
 * bag carries the bag's icon. From the second letter a results list over the row names every match
 * with its icon, count and bag (G881, #413: the client's result_scroller); Up, Down and Enter pick
 * from it, and a pick opens that stack's actions (in its bag's tray when it is in a bag).
 *
 * QA: canvas data packSearch ("" or the query), packSearchHits, packSearchResults (rows, "" when no
 * list), packSearchActive (the lit row), packItemOverflow, packItemScrollLeft, packItemScrollMax.
 */

import { packPageTarget, packPagerState } from '../pack-pager.js?v=ef8d9e49';

/** The search field's words (the mock's; the client's label was "Search inventory for:"). */
export const PACK_SEARCH_LABEL = 'Search pack and bags';
/** The pack's help line (was the visible hint beside the rows). */
export const PACK_HELP = 'Click for actions · Shift-click to quick use';

/**
 * The band's free width for what floats over the row (the tray, the tooltip, a stack's card): clear of
 * a left sheet's --inset-l and the drawer's --inset-r (8 px at least) whether or not the row itself
 * moved for them (packRowClearance), so nothing that rises above the row slides under them.
 * Returns { min, max } in band px for a box of width `w`.
 */
export function packBandRange(band, w = 0) {
  const width = band?.getBoundingClientRect?.().width || 0;
  const cs = band && globalThis.getComputedStyle ? globalThis.getComputedStyle(band) : null;
  const inset = (name) => parseFloat(cs?.getPropertyValue?.(name)) || 0;
  const min = Math.max(8, inset('--inset-l'));
  const padR = Math.max(8, inset('--inset-r'));
  return { min, max: Math.max(min, width - padR - w) };
}

/**
 * PURE: how far the row itself steps aside for a left sheet and the drawer. The row stays centred in
 * the window, and takes a side's inset only when that side's box reaches below the row's top (a short
 * window, a tall sheet, a drawer down to the floor); a sheet or drawer that ends above the row leaves it
 * where it is. `left` / `right`: { inset, bottom } (px, the same frame as rowTop) or null.
 * @returns {{ left: number, right: number }}
 */
export function packRowClearance({ rowTop, left = null, right = null }) {
  const need = (o) => (o && Number(o.inset) > 0 && Number(o.bottom) > rowTop ? Math.round(Number(o.inset)) : 0);
  return { left: need(left), right: need(right) };
}

/**
 * Keeps the band's --pack-clear-l / --pack-clear-r (its padding, style.css) on packRowClearance from
 * the real rects: the open side sheet (the root's data-sheet) with --inset-l, the drawer with --inset-r.
 * It follows the insets, the sheet, the drawer and the row as they change (resize, open, close).
 * The pack bar uses it (band the bar, row the row), and so does Decoration and Cultivation Mode's tray
 * (band and row the tray, js/ui/home-builder.js, #743): one rule for both.
 */
export function mountPackClearance({ root, band, row, drawer = () => null, setData = () => {} } = {}) {
  if (!root || !band || !row) return { sync() {} };
  const doc = root.ownerDocument || globalThis.document;
  // The computed insets: a skin that pins one (Classic's --inset-l) has the last word.
  const px = (name) => {
    try {
      return parseFloat(globalThis.getComputedStyle(root).getPropertyValue(name)) || 0;
    } catch {
      return parseFloat(root.style.getPropertyValue(name)) || 0;
    }
  };
  const shown = (e) => Boolean(e && !e.hidden && e.getClientRects?.().length);
  let frame = 0;
  let last = '';
  function sync() {
    frame = 0;
    const rowRect = row.getBoundingClientRect();
    if (!rowRect?.height) return;
    const sheet = root.dataset.sheet ? doc.getElementById(root.dataset.sheet) : null;
    const side = drawer();
    const box = (e, inset) => (shown(e) && inset > 0 ? { inset, bottom: e.getBoundingClientRect().bottom } : null);
    const out = packRowClearance({ rowTop: rowRect.top, left: box(sheet, px('--inset-l')), right: box(side, px('--inset-r')) });
    const key = `${out.left},${out.right}`;
    if (key === last) return;
    last = key;
    band.style.setProperty('--pack-clear-l', `${out.left}px`);
    band.style.setProperty('--pack-clear-r', `${out.right}px`);
    setData('packClear', key);
  }
  const soon = () => {
    if (!frame) frame = (globalThis.requestAnimationFrame || ((f) => setTimeout(f, 16)))(sync);
  };
  if (typeof MutationObserver === 'function') {
    new MutationObserver(soon).observe(root, { attributes: true, attributeFilter: ['style', 'data-sheet', 'data-ui'] });
  }
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(soon);
    ro.observe(row);
    ro.observe(root);
    for (const e of root.querySelectorAll('.ui-sheet, #achieve-panel, #skills-panel, #buffs-panel')) ro.observe(e);
    const d = drawer();
    if (d) ro.observe(d);
  }
  globalThis.addEventListener?.('resize', soon);
  sync();
  return { sync };
}

/**
 * Where a pack tooltip goes (band px): centred over its control, inside the band's range, 8px above it.
 * With a bag's tray open, the open bag's own tip is not shown (the tray's head says its name and fill),
 * and a tip from inside the tray, or one that would cross it, goes above the tray instead of over its text.
 * @returns {{ hide: true } | { left: number, floor: number }} floor: the top edge the tip sits 8px above
 */
export function packTipPlacement({ anchor, tipWidth = 0, min = 8, max = 8, tray = null, inTray = false, openBag = false }) {
  if (openBag) return { hide: true };
  const left = Math.max(min, Math.min(anchor.left + anchor.width / 2 - tipWidth / 2, max));
  let floor = anchor.top;
  if (tray && (inTray || (left < tray.right && left + tipWidth > tray.left))) floor = Math.min(floor, tray.top);
  return { left, floor };
}

/**
 * How many columns a bag's tray grid has for `count` cells: 4 to 8 (the mock), and (#635, an Android
 * phone 360 px wide: the Red Toolbox's 8th column ran past the tray's right edge) no more than fit
 * `{ roomW }`, the width the tray may take, with its padding and border (`chrome`), the slot and the gap.
 */
export const TRAY_CHROME = 18;
export function trayColumns(count, opts = null) {
  const base = Math.max(4, Math.min(8, Math.floor(Number(count) || 0)));
  const o = opts && typeof opts === 'object' ? opts : {};
  const room = Number(o.roomW);
  if (!(room > 0)) return base;
  const slot = Number(o.slot) > 0 ? Number(o.slot) : 44;
  const gap = Number.isFinite(Number(o.gap)) ? Number(o.gap) : 2;
  const chrome = Number.isFinite(Number(o.chrome)) ? Number(o.chrome) : TRAY_CHROME;
  const fit = Math.floor((room - chrome + gap) / (slot + gap));
  return Math.max(1, Math.min(base, fit));
}

/** True when a stack's shown name matches the search (case and spacing ignored). */
export function packSearchMatch(label, query) {
  const q = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return false;
  return String(label || '').toLowerCase().replace(/\s+/g, ' ').includes(q);
}

/**
 * The search results: the pack's stacks first, then each bag's, in order.
 * @param {{ label: string }[]} entries pack and bag stacks (not the bags themselves)
 */
export function packSearchEntries(entries, query, labelOf = (e) => e.label) {
  return (entries || []).filter((e) => packSearchMatch(labelOf(e), query));
}

/**
 * G881 (#413): the results list under the search, as the client's (InventorySearch.as result_scroller,
 * SuperSearch.as). It searches from the second letter (SuperSearch.as set type 972-979; WorldModel.as
 * searchItemstacks 470) and shows three rows before it scrolls (InventorySearch.as 46: init(TYPE_INVENTORY, 3)).
 */
export const PACK_RESULTS_MIN_CHARS = 2;
export const PACK_RESULTS_ROWS = 3;

const searchWords = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * PURE: the result rows for a query (WorldModel.as searchItemstacks 460-495, SuperSearch.as searchInventory
 * 801-886). Names that start with the query first, then names that hold it, each in name order (then pack
 * order: the pack, then each bag). Stacks of one item side by side in one container are one row with their
 * counts added; a bag is always its own row. Each row says where it is: "3 in your pack", "2 in Bigger Bag".
 * @param {{ classTsid: string, label: string, count?: number, icon?: string, container?: string, index?: number,
 *   bag?: { key: string }, inBag?: { label: string } }[]} entries the pack's stacks and bags and every bag's stacks
 * @returns {{ key: string, classTsid: string, label: string, count: number, icon: string, container: string,
 *   index: number, bagKey: string, where: string, sub: string }[]}
 */
export function packSearchResults(entries, query, labelOf = (e) => e.label) {
  const q = searchWords(query);
  if (q.length < PACK_RESULTS_MIN_CHARS) return [];
  const starts = [];
  const holds = [];
  (entries || []).forEach((e, order) => {
    const label = String(labelOf(e) || e.label || '');
    const name = searchWords(label);
    if (name.startsWith(q)) starts.push({ e, label, name, order });
    else if (name.includes(q)) holds.push({ e, label, name, order });
  });
  const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.order - b.order);
  const rows = [];
  for (const r of [...starts.sort(byName), ...holds.sort(byName)]) {
    const e = r.e;
    const container = String(e.container ?? 'pack');
    const last = rows[rows.length - 1];
    if (last && !e.bag && !last.bagKey && last.classTsid === e.classTsid && last.container === container && last.label === r.label) {
      last.count += Number(e.count) || 1;
      last.sub = `${last.count} in ${last.where}`;
      continue;
    }
    const count = Number(e.count) || 1;
    const where = e.inBag?.label || 'your pack';
    rows.push({
      key: `${container}:${e.index ?? rows.length}`,
      classTsid: e.classTsid,
      label: r.label,
      count,
      icon: e.icon || '',
      container,
      index: Number(e.index ?? -1),
      bagKey: e.bag?.key || '',
      where,
      sub: `${count} in ${where}`,
    });
  }
  return rows;
}

/**
 * PURE: a result's name cut where the query matches, every match (StringUtil.as colorCharacters 612-626,
 * which SuperSearchElement.as setNameText 112-119 runs the name through). [[text, matched], ...]
 */
export function packSearchMarks(label, query) {
  const text = String(label || '');
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [[text, false]];
  const lower = text.toLowerCase();
  const out = [];
  let at = 0;
  for (let i = lower.indexOf(q); i >= 0; i = lower.indexOf(q, i + q.length)) {
    if (i > at) out.push([text.slice(at, i), false]);
    out.push([text.slice(i, i + q.length), true]);
    at = i + q.length;
  }
  if (at < text.length) out.push([text.slice(at), false]);
  return out.length ? out : [[text, false]];
}

/** The count's words: "10/16" and what it means. */
export function packCountText({ used = 0, capacity = 16, bagFree = 0, bags = 0 } = {}) {
  const text = `${used}/${capacity}`;
  const label = `${used} of ${capacity} pack slots used${bags ? `, your bags hold ${bagFree} more` : ''}`;
  return { text, label };
}

/**
 * The tooltip for a slot: its name and count, and what a click does. A sorted bag's tip says what it
 * is sorted for on its own line (`note`, G1246: bag.sortLine, "Sorted for food", with bag.sortIcon).
 */
export function packSlotTip({ label = '', count = 1, tool = false, bag = null, quickVerb = '', inBag = '', note = '' } = {}) {
  if (bag) {
    const sub = `${bag.used} of ${bag.capacity} slots · Click to ${bag.open ? 'close' : 'open'}`;
    return { title: bag.label || label, ...(bag.sortLine ? { note: bag.sortLine, noteIcon: bag.sortIcon || '' } : {}), sub };
  }
  const title = `${label}${count > 1 ? ` x${count}` : ''}`;
  const parts = [];
  if (inBag) parts.push(`In ${inBag}`);
  // A feature's line about the item (#503: a Hoe's aggressive hoeing mode).
  if (note) parts.push(note);
  parts.push(quickVerb && !tool ? `Click for actions · Shift-click to ${quickVerb.toLowerCase()}` : 'Click for actions');
  return { title, sub: parts.join(' · ') };
}

/**
 * @param {{
 *   document?: Document,
 *   setData?: (key: string, value: string) => void,
 *   onQuery?: (query: string) => void,
 *   onScroll?: () => void,
 *   tipFor?: (el: Element) => ({ title: string, sub?: string } | null),
 *   onPick?: (result: object, how: { keys: boolean }) => void,
 * }} opts
 */
export function createPackRow({ document: doc = globalThis.document, setData = () => {}, onQuery = () => {}, onScroll = () => {}, tipFor = () => null, onPick = () => {} } = {}) {
  const $ = (id) => doc?.getElementById?.(id) || null;
  let query = '';
  let searching = false;
  let tipTimer = 0;
  let tipFrom = null;
  // G859 (#413): the redraw a typed letter asks for, waiting until the letter has painted.
  let redrawOwed = false;

  const bar = () => $('pack-bar');

  /** Draws the hits now if a letter's redraw is still waiting (Enter and Down pick from the drawn row). */
  function flushQuery() {
    if (!redrawOwed) return;
    redrawOwed = false;
    onQuery(query);
  }

  /**
   * G859 (#413): a letter redraws the row after it has painted, not before. The redraw (game.js
   * renderPackBar: every stack in the pack and its bags, filtered and drawn again) ran inside the
   * input event, so on a phone the first letters showed late; letters typed before it runs share
   * one redraw. The next frame, then a task: the letter is painted between them.
   */
  function queueQuery() {
    if (redrawOwed) return;
    redrawOwed = true;
    const raf = globalThis.requestAnimationFrame;
    const later = () => globalThis.setTimeout(flushQuery, 0);
    if (typeof raf === 'function') raf(later);
    else later();
  }
  const items = () => $('pack-items');

  function setSearching(on) {
    searching = on;
    const row = $('pack-row');
    const field = $('pack-search');
    const btn = $('pack-search-btn');
    row?.classList.toggle('is-searching', on);
    if (field) field.hidden = !on;
    if (btn) {
      btn.hidden = on;
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
  }

  function openSearch() {
    const input = $('pack-search-input');
    if (!input) return false;
    hideTip();
    if (!searching) setSearching(true);
    input.focus();
    input.select?.();
    return true;
  }

  function closeSearch({ focusButton = true } = {}) {
    if (!searching) return;
    const input = $('pack-search-input');
    const had = query;
    query = '';
    redrawOwed = false;
    if (input) input.value = '';
    setSearching(false);
    setData('packSearch', '');
    drawResults(null);
    if (had) onQuery('');
    if (focusButton) $('pack-search-btn')?.focus();
  }

  function refreshPager() {
    const box = items();
    const pager = $('pack-pager');
    if (!box) return;
    const state = packPagerState(box);
    if (pager) pager.hidden = !state.overflow;
    box.classList.toggle('is-over', state.overflow && state.canForward);
    box.classList.toggle('is-scrolled', state.overflow && state.canBack);
    box.dataset.packOverflow = state.overflow ? '1' : '0';
    box.dataset.packScrollLeft = String(Math.round(state.left));
    box.dataset.packScrollMax = String(Math.round(state.max));
    for (const [key, value] of [['Overflow', state.overflow ? '1' : '0'], ['ScrollLeft', String(Math.round(state.left))], ['ScrollMax', String(Math.round(state.max))]]) {
      setData(`packItem${key}`, value);
    }
    refreshScrollEdges();
  }

  /**
   * PACKSCROLL (a phone, style.css): the bags and stacks scroll together in #pack-scroll, so its
   * edges fade where there is more (is-over: more to the right; is-scrolled: more to the left).
   */
  function refreshScrollEdges() {
    const box = $('pack-scroll');
    if (!box) return;
    const state = packPagerState(box);
    box.classList.toggle('is-over', state.overflow && state.canForward);
    box.classList.toggle('is-scrolled', state.overflow && state.canBack);
    box.dataset.packOverflow = state.overflow ? '1' : '0';
  }

  function slotStep(box) {
    const slots = [...box.querySelectorAll('.pack-slot')];
    if (slots.length > 1) {
      const measured = slots[1].offsetLeft - slots[0].offsetLeft;
      if (measured > 0) return measured;
    }
    return (slots[0]?.getBoundingClientRect().width || 44) + 2;
  }

  /** The mock's pager: a page on, and back to the start from the end. */
  function page() {
    const box = items();
    if (!box) return;
    const state = packPagerState(box);
    const target = state.canForward ? packPageTarget(box, 1, slotStep(box)) : 0;
    box.scrollTo({ left: target, behavior: 'smooth' });
    globalThis.setTimeout?.(refreshPager, 260);
  }

  /** Where the open bag's tray sits: over the row, its left edge by its bag, inside the band. */
  /** #635: the tray's columns for the room the band leaves it (its max-width: the band less 16 px). */
  function fitTrayColumns(tray, band) {
    const slots = tray.querySelector('.pack-bag-slots');
    if (!slots) return;
    const cs = globalThis.getComputedStyle?.(slots);
    const slot = parseFloat(cs?.getPropertyValue('--pack-slot')) || 44;
    const gap = parseFloat(cs?.columnGap) || 2;
    const cols = String(trayColumns(Number(slots.dataset.cells) || 0, { roomW: band.getBoundingClientRect().width - 16, slot, gap }));
    if (slots.style.getPropertyValue('--pack-tray-cols') !== cols) slots.style.setProperty('--pack-tray-cols', cols);
  }

  function placeTray(tray, bagEl) {
    const band = bar();
    if (!tray || !band) return;
    fitTrayColumns(tray, band);
    const b = band.getBoundingClientRect();
    const w = tray.offsetWidth || 0;
    const range = packBandRange(band, w);
    let left = range.min;
    if (bagEl) left = bagEl.getBoundingClientRect().left - b.left - 8;
    left = Math.max(range.min, Math.min(left, range.max));
    tray.style.left = `${Math.round(left)}px`;
  }

  /**
   * The open bag's tray (#pack-bag): its head (icon, name, fill, Options, close) and an empty grid that
   * game.js fills with renderPackRow. `bag` null hides it. Returns null when hidden, { row, slots: null }
   * when the same bag with the same stacks is already drawn, else { row, slots, opening, focus }.
   */
  function drawTray(bag) {
    const band = bar();
    if (!band) return null;
    let row = $('pack-bag');
    if (!row) {
      row = doc.createElement('div');
      row.id = 'pack-bag';
      row.className = 'pack-bag-row';
      row.setAttribute('role', 'dialog');
      row.setAttribute('aria-modal', 'false');
      row.hidden = true;
      band.insertBefore(row, $('pack-tip'));
    }
    if (!bag) {
      row.hidden = true;
      row.textContent = '';
      delete row.dataset.packBag;
      delete row.dataset.packSig;
      return null;
    }
    const opening = row.hidden || row.dataset.packBag !== bag.key;
    if (!opening && row.dataset.packSig === bag.sig) return { row, slots: null, opening: false };
    // A redraw while a tray control has focus keeps the focus on that stack or button.
    const focused = row.contains(doc.activeElement) ? doc.activeElement : null;
    const focus = { tsid: focused?.dataset?.tsid || '', role: focused?.dataset?.packTrayButton || '' };
    row.dataset.packSig = bag.sig;
    row.hidden = false;
    row.dataset.packBag = bag.key;
    row.dataset.packContainer = bag.key;
    row.setAttribute('aria-label', `${bag.label}${bag.sort?.words ? `, sorted for ${bag.sort.words}` : ''}, ${bag.used} of ${bag.capacity} slots used`);
    row.textContent = '';
    const head = doc.createElement('div');
    head.className = 'pack-bag-head';
    const icon = doc.createElement('img');
    icon.src = bag.icon;
    icon.alt = '';
    // G1246: a sorted bag's head repeats its badge on the bag's picture (its own box, so the head's
    // img and span rules leave it alone).
    let pic = icon;
    if (bag.sort?.icon) {
      pic = doc.createElement('i');
      pic.className = 'pack-bag-head-pic';
      const badge = doc.createElement('b');
      badge.className = 'pack-bag-sort';
      badge.style.setProperty('--pack-sort-icon', `url("${bag.sort.icon}")`);
      badge.setAttribute('aria-hidden', 'true');
      pic.append(icon, badge);
    }
    const name = doc.createElement('strong');
    name.textContent = bag.label;
    const fill = doc.createElement('span');
    fill.textContent = `${bag.used}/${bag.capacity}`;
    const button = (cls, role, label, svg, onClick) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.dataset.packTrayButton = role;
      b.setAttribute('aria-label', label);
      b.innerHTML = svg;
      b.addEventListener('click', onClick);
      return b;
    };
    const options = button('pack-bag-options', 'options', `${bag.optionsLabel} for ${bag.label}`,
      '<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="4.5" cy="10" r="1.7"/><circle cx="10" cy="10" r="1.7"/><circle cx="15.5" cy="10" r="1.7"/></svg>',
      () => bag.onOptions?.());
    options.dataset.packTip = bag.optionsLabel;
    options.setAttribute('aria-haspopup', 'dialog');
    const close = button('pack-bag-close', 'close', `Close ${bag.label}`,
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
      () => bag.onClose?.());
    head.append(pic, name, fill, options, close);
    const slots = doc.createElement('div');
    slots.className = 'pack-slots pack-bag-slots';
    slots.setAttribute('role', 'list');
    slots.dataset.packContainer = bag.key;
    slots.dataset.cells = String(bag.cells || 0);
    slots.style.setProperty('--pack-tray-cols', String(trayColumns(bag.cells)));
    row.append(head);
    // G1246: on a phone there is no hover, so the head says what the bag is sorted for, in the Sort menu's words.
    if (bag.sort?.line) {
      const line = doc.createElement('p');
      line.className = 'pack-bag-sort-line';
      const mark = doc.createElement('i');
      mark.setAttribute('aria-hidden', 'true');
      mark.style.setProperty('--pack-sort-icon', `url("${bag.sort.icon}")`);
      const words = doc.createElement('span');
      const lead = doc.createElement('b');
      lead.textContent = bag.sort.line;
      words.append(lead);
      if (bag.sort.takes) words.append(` · ${bag.sort.takes}`);
      line.append(mark, words);
      row.append(line);
    }
    row.append(slots);
    if (!bag.used) {
      const empty = doc.createElement('p');
      empty.className = 'pack-bag-empty';
      empty.textContent = 'This bag is empty. Drag things here to put them in.';
      row.append(empty);
    }
    return { row, slots, opening, focus };
  }

  /** After the tray's stacks are drawn: its place by its bag, and the focus (kept, or into it on open). */
  function settleTray(tray, bagEl, { focusOnOpen = false } = {}) {
    placeTray(tray.row, bagEl);
    if (!tray.slots) return;
    const { tsid, role } = tray.focus || {};
    const esc = globalThis.CSS?.escape || ((v) => v);
    const again = (tsid && tray.row.querySelector(`.pack-slot[data-tsid="${esc(tsid)}"]`))
      || (role && tray.row.querySelector(`[data-pack-tray-button="${role}"]`));
    if (again) again.focus();
    else if (tray.opening && focusOnOpen) (tray.row.querySelector('.pack-slot[data-tsid]') || tray.row.querySelector('.pack-bag-close'))?.focus();
  }

  /**
   * "Nothing called ..." in the row when a search finds nothing, unless the results list is showing:
   * its own "No results for:" line says it there (G881 follow-up: one line, not two).
   */
  function markNoMatches(box, q) {
    if (!box || box.querySelector('.pack-search-empty')) return;
    const list = resultsBox();
    if (list && !list.hidden) return;
    const none = doc.createElement('span');
    none.className = 'pack-search-empty';
    none.setAttribute('role', 'listitem');
    none.textContent = `Nothing called "${q}"`;
    box.append(none);
  }

  /*
   * G881 (#413): the results list (#pack-search-results), over the row by the search field, as the
   * client's result_scroller rose above its box (InventorySearch.as 46: DIRECTION_UP). The field keeps the
   * keys (a combobox): Up and Down move the lit row (SuperSearch.as changeSelection 485-507, no wrap), Enter
   * picks it (onKeyDown 629-634), a click picks (onElementClick 663-669), a mouse over a row lights it
   * (onElementOver 671-679). The lit row's stack is lit in the pack (InventorySearch.as onElementChanged
   * 131-147: setFocusedSlot).
   */
  let results = [];
  let activeResult = -1;
  let resultsSig = '';
  let resultsQuery = '';

  function resultsBox(create = false) {
    let box = $('pack-search-results');
    const band = bar();
    if (!box && create && band && doc.createElement) {
      box = doc.createElement('div');
      box.id = 'pack-search-results';
      box.className = 'pack-search-results';
      box.setAttribute('role', 'listbox');
      box.setAttribute('aria-label', 'Search results');
      box.hidden = true;
      band.insertBefore(box, $('pack-tip'));
      // A press on a row keeps the keys in the field (the client's input kept its focus).
      box.addEventListener('mousedown', (e) => e.preventDefault());
      box.addEventListener('click', (e) => {
        const row = e.target?.closest?.('[data-pack-result]');
        if (row) pickResult(Number(row.dataset.packResult), { keys: false });
      });
      box.addEventListener('pointermove', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const row = e.target?.closest?.('[data-pack-result]');
        if (row && Number(row.dataset.packResult) !== activeResult) setActiveResult(Number(row.dataset.packResult), { scroll: false });
      });
    }
    return box;
  }

  function slotOf(r) {
    if (!r || r.index < 0) return null;
    const esc = globalThis.CSS?.escape || ((v) => String(v).replace(/["\\]/g, '\\$&'));
    return bar()?.querySelector?.(`.pack-slot[data-pack-container="${esc(r.container)}"][data-pack-index="${r.index}"]`) || null;
  }

  /** The lit row's stack lit in the pack, the others not (setFocusedSlot / blurFocusedSlot). */
  function lightSlot() {
    for (const el of bar()?.querySelectorAll?.('.pack-slot.is-search-lit') || []) el.classList.remove('is-search-lit');
    slotOf(results[activeResult])?.classList.add('is-search-lit');
  }

  function setActiveResult(i, { scroll = true } = {}) {
    const box = resultsBox();
    const input = $('pack-search-input');
    activeResult = results.length ? Math.max(0, Math.min(results.length - 1, i)) : -1;
    let lit = null;
    for (const row of box?.querySelectorAll?.('[data-pack-result]') || []) {
      const on = Number(row.dataset.packResult) === activeResult;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) lit = row;
    }
    if (lit) input?.setAttribute('aria-activedescendant', lit.id);
    else input?.removeAttribute?.('aria-activedescendant');
    if (lit && scroll && box) {
      // changeSelection 503-505: the scroller follows the lit row.
      const top = lit.offsetTop;
      const bottom = top + lit.offsetHeight;
      if (top < box.scrollTop) box.scrollTop = top;
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    }
    setData('packSearchActive', String(activeResult));
    lightSlot();
  }

  /** Over the row, its right edge by the search field, inside the band; above an open bag's tray it would cross. */
  function placeResults() {
    const box = resultsBox();
    const band = bar();
    const row = $('pack-row');
    if (!box || box.hidden || !band || !row) return;
    const b = band.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const field = ($('pack-search') && !$('pack-search').hidden ? $('pack-search') : row).getBoundingClientRect();
    const w = box.offsetWidth || 0;
    const range = packBandRange(band, w);
    const left = Math.max(range.min, Math.min(field.right - b.left - w, range.max));
    let floor = r.top - b.top;
    const tray = $('pack-bag');
    if (tray && !tray.hidden) {
      const t = tray.getBoundingClientRect();
      if (left < t.right - b.left && left + w > t.left - b.left) floor = Math.min(floor, t.top - b.top);
    }
    box.style.left = `${Math.round(left)}px`;
    box.style.bottom = `${Math.round(b.height - floor + 8)}px`;
    // Room above it for the rows on a short window (a phone held sideways): never over the top bar.
    const room = Math.floor(b.top + floor - 8 - 56);
    box.style.maxHeight = room > 0 ? `min(var(--psr-max), ${room}px)` : '';
  }

  /**
   * The list for the drawn search: `list` from packSearchResults (game.js renderPackBar), or null to hide it.
   * Hidden under two letters; an empty list says "No results for" (SuperSearchElementNoResult.as 30-36).
   */
  function drawResults(list, q = query) {
    const box = resultsBox(Boolean(list));
    const input = $('pack-search-input');
    const words = String(q || '').trim();
    if (!list || !searching || searchWords(words).length < PACK_RESULTS_MIN_CHARS) {
      const had = results.length || activeResult >= 0 || (box && !box.hidden);
      results = [];
      activeResult = -1;
      resultsSig = '';
      if (box) { box.hidden = true; box.textContent = ''; }
      input?.setAttribute?.('aria-expanded', 'false');
      input?.removeAttribute?.('aria-activedescendant');
      if (had) {
        setData('packSearchResults', '');
        setData('packSearchActive', '-1');
        lightSlot();
      }
      return;
    }
    if (!box) return;
    // G881 follow-up: while the list shows, its line is the only "nothing found" (the row's goes).
    items()?.querySelector?.('.pack-search-empty')?.remove?.();
    const sig = JSON.stringify([words, list.map((r) => [r.key, r.classTsid, r.label, r.count, r.icon, r.sub])]);
    if (sig === resultsSig && !box.hidden) {
      lightSlot();
      placeResults();
      return;
    }
    // A new query lights the first row (onInputChange 425); the same query after the pack changed keeps
    // the lit stack when it is still there (onPackChange 169-173 searched again).
    const keep = words === resultsQuery ? results[activeResult]?.key : null;
    resultsSig = sig;
    resultsQuery = words;
    results = list;
    box.textContent = '';
    list.forEach((r, i) => {
      const row = doc.createElement('div');
      row.id = `pack-search-result-${i}`;
      row.className = 'pack-search-result';
      row.setAttribute('role', 'option');
      row.dataset.packResult = String(i);
      row.dataset.resultTsid = r.classTsid;
      row.dataset.resultContainer = r.container;
      row.setAttribute('aria-label', `${r.label}, ${r.sub}`);
      const icon = doc.createElement('img');
      icon.src = r.icon;
      icon.alt = '';
      icon.loading = 'lazy';
      const text = doc.createElement('span');
      text.className = 'pack-search-result-text';
      const name = doc.createElement('span');
      name.className = 'pack-search-result-name';
      for (const [part, hit] of packSearchMarks(r.label, words)) {
        if (hit) {
          const mark = doc.createElement('mark');
          mark.textContent = part;
          name.append(mark);
        } else name.append(part);
      }
      const sub = doc.createElement('span');
      sub.className = 'pack-search-result-sub';
      sub.textContent = r.sub;
      text.append(name, sub);
      row.append(icon, text);
      box.append(row);
    });
    if (!list.length) {
      const none = doc.createElement('div');
      none.className = 'pack-search-result is-none';
      none.setAttribute('role', 'option');
      none.setAttribute('aria-disabled', 'true');
      none.textContent = `No results for: \u201c${words}\u201d`;
      box.append(none);
    }
    // A slot's tooltip would sit over the rows.
    if (box.hidden) hideTip();
    box.hidden = false;
    box.scrollTop = 0;
    input?.setAttribute?.('aria-expanded', 'true');
    setData('packSearchResults', String(list.length));
    const again = keep ? list.findIndex((r) => r.key === keep) : -1;
    setActiveResult(again >= 0 ? again : 0);
    placeResults();
  }

  /** Picking a row: the search goes, then its stack's menu opens (InventorySearch.as onElementSelect 149-167). */
  function pickResult(i, { keys = false } = {}) {
    const r = results[i];
    if (!r) return false;
    closeSearch({ focusButton: false });
    onPick(r, { keys });
    return true;
  }

  function hideTip() {
    globalThis.clearTimeout?.(tipTimer);
    tipFrom = null;
    const tip = $('pack-tip');
    if (tip) tip.hidden = true;
  }

  function showTip(el) {
    const tip = $('pack-tip');
    const band = bar();
    const info = el && tipFor(el);
    if (!tip || !band || !info?.title) return;
    tip.textContent = '';
    const title = doc.createElement('span');
    title.className = 'pack-tip-title';
    title.textContent = info.title;
    tip.append(title);
    // G1246: a sorted bag's tip stacks its name, "Sorted for food" with the sort's icon, and its slots line.
    tip.classList.toggle('has-note', Boolean(info.note));
    if (info.note) {
      const note = doc.createElement('span');
      note.className = 'pack-tip-note';
      if (info.noteIcon) {
        const mark = doc.createElement('i');
        mark.setAttribute('aria-hidden', 'true');
        mark.style.setProperty('--pack-sort-icon', `url("${info.noteIcon}")`);
        note.append(mark);
      }
      note.append(info.note);
      tip.append(note);
    }
    if (info.sub) {
      const sub = doc.createElement('span');
      sub.className = 'pack-tip-sub';
      sub.textContent = info.sub;
      tip.append(sub);
    }
    const trayEl = $('pack-bag');
    const trayOpen = Boolean(trayEl && !trayEl.hidden);
    const openBag = trayOpen && el.classList?.contains('pack-bag') && el.dataset.packBag === trayEl.dataset.packBag;
    if (openBag) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    const b = band.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const range = packBandRange(band, w);
    const t = trayOpen ? trayEl.getBoundingClientRect() : null;
    const at = packTipPlacement({
      anchor: { left: r.left - b.left, width: r.width, top: r.top - b.top },
      tipWidth: w,
      min: range.min,
      max: range.max,
      tray: t ? { left: t.left - b.left, right: t.right - b.left, top: t.top - b.top } : null,
      inTray: trayOpen && trayEl.contains(el),
    });
    tip.style.left = `${Math.round(at.left)}px`;
    tip.style.bottom = `${Math.round(b.height - at.floor + 8)}px`;
  }

  function tipTarget(target) {
    return target?.closest?.('#pack-bar [data-pack-tip], #pack-bar .pack-slot[data-tsid], #pack-bar .pack-slot.pack-ghost') || null;
  }

  function queueTip(el, delay = 280) {
    if (el === tipFrom) return;
    hideTip();
    tipFrom = el;
    tipTimer = globalThis.setTimeout?.(() => { if (tipFrom === el && el.isConnected) showTip(el); }, delay);
  }

  function install() {
    const band = bar();
    if (!band || band.dataset.packRowReady === '1') return;
    band.dataset.packRowReady = '1';
    const input = $('pack-search-input');
    // G881: the field and its results list are a combobox (the list is made now, shown from two letters).
    if (input && resultsBox(true)) {
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-controls', 'pack-search-results');
      input.setAttribute('aria-expanded', 'false');
    }
    // #635: a turned phone or a resized window refits an open tray's columns and its place by its bag.
    globalThis.addEventListener?.('resize', () => {
      const tray = $('pack-bag');
      if (!tray || tray.hidden) return;
      const key = tray.querySelector('.pack-bag-slots')?.dataset.packContainer;
      const esc = globalThis.CSS?.escape || ((v) => v);
      placeTray(tray, key ? doc.querySelector(`#pack-bags [data-pack-bag="${esc(key)}"]`) : null);
    });
    $('pack-search-btn')?.addEventListener('click', () => openSearch());
    $('pack-search-close')?.addEventListener('click', () => closeSearch());
    input?.addEventListener('input', () => {
      query = input.value;
      setData('packSearch', query.trim());
      queueQuery();
    });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
      } else if (e.key === 'Enter') {
        // InventorySearch.as onElementSelect: the lit result's menu (G881), else the first match's.
        e.preventDefault();
        e.stopPropagation();
        flushQuery();
        if (pickResult(activeResult, { keys: true })) return;
        const first = items()?.querySelector('.pack-slot[data-tsid]');
        if (first) { first.focus(); first.click(); }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        flushQuery();
        // G881: Up and Down move through the results list; with no list (one letter) Down goes to the row.
        if (results.length) {
          e.preventDefault();
          setActiveResult(activeResult + (e.key === 'ArrowDown' ? 1 : -1));
          return;
        }
        if (e.key === 'ArrowUp') return;
        const first = items()?.querySelector('.pack-slot[data-tsid]');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
    $('pack-pager')?.addEventListener('click', page);
    const box = items();
    box?.addEventListener('scroll', () => { refreshPager(); hideTip(); onScroll(); }, { passive: true });
    // Decoration Mode's Pack tab scrolls the bags and stacks together (#pack-scroll, js/ui/home-builder.js
    // renderDock): the tooltip goes and a stack's menu follows its slot, as on the row's own scroll.
    $('pack-scroll')?.addEventListener('scroll', () => { hideTip(); onScroll(); }, { passive: true });
    // PACKSCROLL (a phone): its edges fade where there is more.
    $('pack-scroll')?.addEventListener('scroll', refreshScrollEdges, { passive: true });
    box?.addEventListener('wheel', (event) => {
      const state = packPagerState(box);
      if (!state.overflow || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      box.scrollBy({ left: event.deltaY, behavior: 'auto' });
    }, { passive: false });
    // The tooltip: on hover after a moment, at once for a keyboard focus.
    // None on a screen with no hover (the mobile QA, 2026-11-12: "Search pack" stayed up through later taps).
    const noHover = () => Boolean(globalThis.matchMedia?.('(hover: none)').matches);
    band.addEventListener('pointerover', (e) => { if (e.pointerType === 'touch' || noHover()) return; const el = tipTarget(e.target); if (el) queueTip(el); });
    band.addEventListener('pointerout', (e) => { const el = tipTarget(e.target); if (el && !el.contains(e.relatedTarget)) hideTip(); });
    band.addEventListener('focusin', (e) => { if (noHover()) return; const el = tipTarget(e.target); if (el && e.target.matches?.(':focus-visible')) queueTip(el, 0); });
    band.addEventListener('focusout', hideTip);
    band.addEventListener('pointerdown', hideTip);
    band.addEventListener('dragstart', hideTip);
  }

  return {
    install,
    query: () => (searching ? query.trim() : ''),
    isSearching: () => searching,
    openSearch,
    closeSearch,
    refreshPager,
    placeTray,
    drawTray,
    settleTray,
    markNoMatches,
    drawResults,
    placeResults,
    pickResult,
    hideTip,
    showTip,
  };
}
