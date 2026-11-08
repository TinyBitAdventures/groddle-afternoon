/**
 * #141 the one item picker: choose a stack from the pack, then how many, right under it. The Auction
 * House's Post a new auction and the Give window (and the Gift Box's Wrap) share it; before, each drew
 * small wrapping pill buttons in a 9.5rem box with no search, and Give put the count far below.
 *
 * The model is the Butler's package picker (butler-feature giveMenu): a tile grid (64 px tiles, 36 px
 * icons) with the count right under it. Here each tile carries a count badge and its name, a search
 * box filters by name (pack-row's packSearchMatch, the pack's own search), and the How many row is
 * count-chooser's step row (− [number] + Max, the shared keys) inside a .count-pop, so it looks like
 * every other How many in both skins.
 *
 * Keys: Tab reaches the search box, the tiles and the count; in the grid the arrows move between tiles,
 * Home and End go to the first and the last, Enter or Space picks. In the search box Down goes to the
 * tiles and Enter picks the first match; Esc clears a search (an empty one goes on to the window).
 * The count field takes the count keys; Enter there is the window's own action (`onConfirm`).
 *
 * Styles: style.css `.item-picker` (every skin + Modern), css/classic.css (Classic restyles in place).
 */
import { packSearchMatch } from './pack-row.js?v=65c0f180';
import { bindCountField, countFromField, countKeyValue, countStepMarkup, syncCountStep } from './count-chooser.js?v=5bc894c8';

/**
 * PURE: the items the search leaves (all of them for an empty search), in order.
 * @param {{ label: string }[]} items
 */
export function filterPickerItems(items, query) {
  const list = Array.isArray(items) ? items : [];
  if (!String(query || '').trim()) return list.slice();
  return list.filter((it) => packSearchMatch(it.label, query));
}

/**
 * PURE: the tile an arrow key moves to in a grid of `total` tiles, `cols` across, or null when the key
 * is not a grid key. Left and Right step by one, Up and Down by a row, Home and End go to the ends.
 */
export function pickerGridMove(index, key, total, cols) {
  const n = Math.max(0, Math.floor(Number(total)) || 0);
  if (!n) return null;
  const c = Math.max(1, Math.floor(Number(cols)) || 1);
  const at = Math.max(0, Math.min(n - 1, Math.floor(Number(index)) || 0));
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -c, ArrowDown: c }[key];
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  if (step == null) return null;
  const next = at + step;
  if (next < 0 || next >= n) return at;
  return next;
}

/** PURE: the words on a tile and under the grid: "Cherry" and "Cherries ×12". */
export function pickerTileText(item) {
  const count = Math.max(0, Math.floor(Number(item?.count) || 0));
  const label = String(item?.label || '');
  return { label, badge: count > 1 ? String(count) : '', title: count > 1 ? `${label} ×${count}` : label };
}

function attrs(node, map) {
  for (const [k, v] of Object.entries(map || {})) {
    if (v === false || v == null) node.removeAttribute(k);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
}

/**
 * @param {Document} doc
 * @param {{
 *   hook: string,                         data-<hook>-picker, -find, -grid, -chosen and the count's -dec, -inc, -num, -max, -of
 *   label?: string,                       the grid's name for screen readers ("Your pack")
 *   searchLabel?: string,                 the search box's placeholder
 *   emptyText?: string,                   nothing to choose
 *   countLabel?: (item) => string,        "How many?" (the row's words)
 *   countVerb?: string,                   the step buttons' words ("Give one more")
 *   countHooks?: { dec?: string, inc?: string, num?: string, max?: string, of?: string },  the site's own QA hooks
 *   onPick: (item) => void,
 *   onCount?: (n, item) => void,
 *   onConfirm?: () => void,
 * }} opts
 * Items: { key, c, label, count, icon, max, disabled, reason, attrs }. `max` > 1 shows How many.
 */
export function createItemPicker(doc, opts) {
  const hook = String(opts.hook || 'item');
  const h = (part) => `data-${hook}-${part}`;
  const el = doc.createElement('div');
  el.className = 'item-picker';
  el.setAttribute(h('picker'), '');
  const search = doc.createElement('input');
  search.type = 'search';
  search.className = 'item-picker-find';
  search.placeholder = opts.searchLabel || 'Search your pack';
  search.setAttribute('aria-label', opts.searchLabel || 'Search your pack');
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('spellcheck', 'false');
  search.setAttribute(h('find'), '');
  const grid = doc.createElement('div');
  grid.className = 'item-picker-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', opts.label || 'Your pack');
  grid.setAttribute(h('grid'), '');
  const none = doc.createElement('p');
  none.className = 'item-picker-none';
  none.setAttribute('aria-live', 'polite');
  const chosen = doc.createElement('div');
  chosen.className = 'item-picker-chosen count-pop';
  chosen.setAttribute(h('chosen'), '');
  chosen.hidden = true;
  el.append(search, grid, none, chosen);

  let items = [];
  let selected = null;
  let count = 1;
  let query = '';
  let chosenKey = '';
  const tiles = new Map();

  function shown() {
    return filterPickerItems(items, query);
  }

  function selectedItem() {
    return selected == null ? null : items.find((it) => it.key === selected) || null;
  }

  function tileFor(item) {
    let b = tiles.get(item.key);
    if (!b) {
      b = doc.createElement('button');
      b.type = 'button';
      b.className = 'item-picker-tile';
      const img = doc.createElement('img');
      img.alt = '';
      img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
      const badge = doc.createElement('span');
      badge.className = 'item-picker-badge';
      const name = doc.createElement('span');
      name.className = 'item-picker-name';
      b.append(img, badge, name);
      b.addEventListener('click', () => {
        const it = items.find((x) => x.key === b.dataset.pickerKey);
        if (it) opts.onPick?.(it);
      });
      tiles.set(item.key, b);
    }
    const t = pickerTileText(item);
    b.dataset.pickerKey = item.key;
    const img = b.querySelector('img');
    if (img.getAttribute('src') !== item.icon && item.icon) {
      img.style.visibility = '';
      img.src = item.icon;
    }
    b.querySelector('.item-picker-badge').textContent = t.badge;
    b.querySelector('.item-picker-badge').hidden = !t.badge;
    b.querySelector('.item-picker-name').textContent = t.label;
    b.title = item.reason || t.title;
    b.setAttribute('aria-label', item.reason ? `${t.title}: ${item.reason}` : t.title);
    b.setAttribute('aria-pressed', String(item.key === selected));
    b.setAttribute('aria-disabled', String(Boolean(item.disabled || item.reason)));
    attrs(b, item.attrs);
    return b;
  }

  function renderGrid() {
    const list = shown();
    const want = list.map(tileFor);
    const same = want.length === grid.children.length && want.every((b, i) => grid.children[i] === b);
    if (!same) {
      const focusKey = grid.contains(doc.activeElement) ? doc.activeElement?.dataset?.pickerKey : null;
      grid.replaceChildren(...want);
      if (focusKey && tiles.get(focusKey)?.isConnected) tiles.get(focusKey).focus({ preventScroll: true });
    }
    for (const key of [...tiles.keys()]) if (!items.some((it) => it.key === key)) tiles.delete(key);
    none.textContent = !items.length ? opts.emptyText || 'Your pack is empty.' : !list.length ? `Nothing in your pack is called “${query.trim()}”.` : '';
    none.hidden = !none.textContent;
    grid.hidden = !list.length;
  }

  function renderChosen() {
    const it = selectedItem();
    if (!it) {
      chosen.hidden = true;
      chosen.replaceChildren();
      chosenKey = '';
      return;
    }
    chosen.hidden = false;
    const max = Math.max(1, Math.floor(Number(it.max) || 1));
    count = countFromField(count, max);
    const key = `${it.key}|${max}|${it.label}`;
    if (key === chosenKey) {
      const input = chosen.querySelector('.count-pop-num');
      if (input && doc.activeElement !== input) input.value = String(count);
      if (input) syncCountStep(input, count, max);
      const of = chosen.querySelector('.count-pop-of');
      if (of) of.textContent = `${count} of ${max}`;
      return;
    }
    chosenKey = key;
    const ch = opts.countHooks || {};
    const head = doc.createElement('div');
    head.className = 'item-picker-chosen-head';
    const img = doc.createElement('img');
    img.alt = '';
    if (it.icon) img.src = it.icon;
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true });
    const name = doc.createElement('strong');
    name.className = 'item-picker-chosen-name';
    name.textContent = pickerTileText(it).title;
    head.append(img, name);
    const parts = [head];
    if (max > 1) {
      const row = doc.createElement('div');
      row.className = 'item-picker-count';
      const words = doc.createElement('span');
      words.className = 'item-picker-count-label';
      words.textContent = opts.countLabel?.(it) || 'How many?';
      row.append(words);
      row.insertAdjacentHTML('beforeend', countStepMarkup({
        value: count,
        max,
        verb: opts.countVerb || 'Choose',
        attrs: { dec: ch.dec || h('dec'), inc: ch.inc || h('inc'), num: ch.num || h('num'), max: ch.max || h('max') },
      }));
      const of = doc.createElement('output');
      of.className = 'count-pop-of';
      of.setAttribute('aria-live', 'polite');
      of.setAttribute(ch.of || h('of'), '');
      of.textContent = `${count} of ${max}`;
      row.append(of);
      parts.push(row);
    }
    chosen.replaceChildren(...parts);
    if (max <= 1) return;
    const input = chosen.querySelector('.count-pop-num');
    const set = (n, typing = false) => {
      count = countFromField(n, max);
      if (!typing) input.value = String(count);
      syncCountStep(input, count, max);
      chosen.querySelector('.count-pop-of').textContent = `${count} of ${max}`;
      opts.onCount?.(count, it);
    };
    chosen.querySelector('.count-pop-dec').addEventListener('click', () => set(count - 1));
    chosen.querySelector('.count-pop-inc').addEventListener('click', () => set(count + 1));
    chosen.querySelector('.count-pop-max').addEventListener('click', () => set(max));
    bindCountField(input, {
      max: () => max,
      set: (n) => set(n),
      preview: (n) => set(n, true),
      confirm: (n) => { set(n); opts.onConfirm?.(); },
      cancel: () => input.blur(),
    });
    chosen.querySelector('.count-pop-step').addEventListener('keydown', (e) => {
      if (e.target === input) return;
      const next = countKeyValue(e.key, count, max);
      if (next != null) {
        e.preventDefault();
        e.stopPropagation();
        set(next);
      }
    });
  }

  function columns() {
    const tpl = doc.defaultView?.getComputedStyle?.(grid)?.gridTemplateColumns || '';
    const n = tpl.split(/\s+/).filter((x) => x && x !== 'none').length;
    return n || 1;
  }

  grid.addEventListener('keydown', (e) => {
    const list = [...grid.children];
    const at = list.indexOf(doc.activeElement);
    if (at < 0) return;
    const next = pickerGridMove(at, e.key, list.length, columns());
    if (next == null) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'ArrowUp' && at < columns()) {
      search.focus({ preventScroll: true });
      return;
    }
    list[next]?.focus();
    list[next]?.scrollIntoView?.({ block: 'nearest' });
  });

  search.addEventListener('input', () => {
    query = search.value;
    renderGrid();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!search.value) return;
      e.preventDefault();
      e.stopPropagation();
      search.value = '';
      query = '';
      renderGrid();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      const first = grid.querySelector('[aria-pressed="true"]') || grid.firstElementChild;
      first?.focus();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const first = shown().find((it) => !it.disabled && !it.reason);
      if (first) opts.onPick?.(first);
      return;
    }
    // Typing stays in the box (never the avatar's keys).
    e.stopPropagation();
  });

  return {
    el,
    /** Draw `items` with `selected` (an item key, or null) and its `count`. */
    update(next = {}) {
      if (Array.isArray(next.items)) items = next.items.filter((it) => it && it.key != null);
      if ('selected' in next) selected = next.selected == null ? null : String(next.selected);
      if (next.count != null) count = Math.max(1, Math.floor(Number(next.count)) || 1);
      renderGrid();
      renderChosen();
    },
    /** The search box (a window opened from the keyboard starts there). */
    focus() {
      search.focus({ preventScroll: true });
    },
    /** Puts the focus on the count field, or the picked tile. */
    focusCount() {
      const input = chosen.querySelector('.count-pop-num');
      (input || tiles.get(selected))?.focus({ preventScroll: true });
      input?.select?.();
    },
    clearSearch() {
      search.value = '';
      query = '';
      renderGrid();
    },
    get count() { return count; },
    get query() { return query; },
  };
}
