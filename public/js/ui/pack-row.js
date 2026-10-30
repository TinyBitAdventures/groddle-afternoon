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
 * bag carries the bag's icon. Enter opens the first match's actions.
 *
 * QA: canvas data packSearch ("" or the query), packSearchHits, packItemOverflow,
 * packItemScrollLeft, packItemScrollMax (as the old items row had).
 */

import { packPageTarget, packPagerState } from '../pack-pager.js?v=original-pager-1';

/** The search field's words (the mock's; the client's label was "Search inventory for:"). */
export const PACK_SEARCH_LABEL = 'Search pack and bags';
/** The pack's help line (was the visible hint beside the rows). */
export const PACK_HELP = 'Click for actions · Shift-click to quick use';

/**
 * The band's free width for what floats over the row (the tray, the tooltip, a stack's card): inside
 * its padding, which a drawer or sheet sets through --inset-l / --inset-r, so nothing slides under them.
 * Returns { min, max } in band px for a box of width `w`.
 */
export function packBandRange(band, w = 0) {
  const width = band?.getBoundingClientRect?.().width || 0;
  const cs = band && globalThis.getComputedStyle ? globalThis.getComputedStyle(band) : null;
  const padL = parseFloat(cs?.paddingLeft) || 8;
  const padR = parseFloat(cs?.paddingRight) || 8;
  const min = padL;
  return { min, max: Math.max(min, width - padR - w) };
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

/** How many columns a bag's tray grid has for `count` cells: 4 to 8 (the mock). */
export function trayColumns(count) {
  return Math.max(4, Math.min(8, Math.floor(Number(count) || 0)));
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

/** The count's words: "10/16" and what it means. */
export function packCountText({ used = 0, capacity = 16, bagFree = 0, bags = 0 } = {}) {
  const text = `${used}/${capacity}`;
  const label = `${used} of ${capacity} pack slots used${bags ? `, your bags hold ${bagFree} more` : ''}`;
  return { text, label };
}

/** The tooltip for a slot: its name and count, and what a click does. */
export function packSlotTip({ label = '', count = 1, tool = false, bag = null, quickVerb = '', inBag = '' } = {}) {
  if (bag) {
    return { title: bag.label || label, sub: `${bag.used} of ${bag.capacity} slots · Click to ${bag.open ? 'close' : 'open'}` };
  }
  const title = `${label}${count > 1 ? ` x${count}` : ''}`;
  const parts = [];
  if (inBag) parts.push(`In ${inBag}`);
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
 * }} opts
 */
export function createPackRow({ document: doc = globalThis.document, setData = () => {}, onQuery = () => {}, onScroll = () => {}, tipFor = () => null } = {}) {
  const $ = (id) => doc?.getElementById?.(id) || null;
  let query = '';
  let searching = false;
  let tipTimer = 0;
  let tipFrom = null;

  const bar = () => $('pack-bar');
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
    if (input) input.value = '';
    setSearching(false);
    setData('packSearch', '');
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
  function placeTray(tray, bagEl) {
    const band = bar();
    if (!tray || !band) return;
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
    row.setAttribute('aria-label', `${bag.label}, ${bag.used} of ${bag.capacity} slots used`);
    row.textContent = '';
    const head = doc.createElement('div');
    head.className = 'pack-bag-head';
    const icon = doc.createElement('img');
    icon.src = bag.icon;
    icon.alt = '';
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
    head.append(icon, name, fill, options, close);
    const slots = doc.createElement('div');
    slots.className = 'pack-slots pack-bag-slots';
    slots.setAttribute('role', 'list');
    slots.dataset.packContainer = bag.key;
    slots.style.setProperty('--pack-tray-cols', String(trayColumns(bag.cells)));
    row.append(head, slots);
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

  /** "Nothing called ..." in the row when a search finds nothing. */
  function markNoMatches(box, q) {
    if (!box || box.querySelector('.pack-search-empty')) return;
    const none = doc.createElement('span');
    none.className = 'pack-search-empty';
    none.setAttribute('role', 'listitem');
    none.textContent = `Nothing called "${q}"`;
    box.append(none);
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
    $('pack-search-btn')?.addEventListener('click', () => openSearch());
    $('pack-search-close')?.addEventListener('click', () => closeSearch());
    input?.addEventListener('input', () => {
      query = input.value;
      setData('packSearch', query.trim());
      onQuery(query);
    });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
      } else if (e.key === 'Enter') {
        // InventorySearch.as onElementSelect: the first match's menu.
        e.preventDefault();
        e.stopPropagation();
        const first = items()?.querySelector('.pack-slot[data-tsid]');
        if (first) { first.focus(); first.click(); }
      } else if (e.key === 'ArrowDown') {
        const first = items()?.querySelector('.pack-slot[data-tsid]');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
    $('pack-pager')?.addEventListener('click', page);
    const box = items();
    box?.addEventListener('scroll', () => { refreshPager(); hideTip(); onScroll(); }, { passive: true });
    box?.addEventListener('wheel', (event) => {
      const state = packPagerState(box);
      if (!state.overflow || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      box.scrollBy({ left: event.deltaY, behavior: 'auto' });
    }, { passive: false });
    // The tooltip: on hover after a moment, at once for a keyboard focus.
    band.addEventListener('pointerover', (e) => { const el = tipTarget(e.target); if (el) queueTip(el); });
    band.addEventListener('pointerout', (e) => { const el = tipTarget(e.target); if (el && !el.contains(e.relatedTarget)) hideTip(); });
    band.addEventListener('focusin', (e) => { const el = tipTarget(e.target); if (el && e.target.matches?.(':focus-visible')) queueTip(el, 0); });
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
    hideTip,
    showTip,
  };
}
