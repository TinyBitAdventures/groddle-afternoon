/**
 * A type-to-filter combobox that stands in front of a native <select>.
 *
 * The select stays in the DOM (hidden) as the source of truth: its options
 * fill the list, and choosing a row sets `select.value` and dispatches
 * `change`, so existing listeners and QA scripts keep working. Call
 * `refresh()` after repopulating the select.
 *
 * An <option> may carry data-icon (an item's icon, drawn at the row's start),
 * data-count (a count pill; else a trailing "(N)" or " ×N" in its text is one)
 * and data-hint.
 *
 * Keyboard: type to filter, Up/Down to move, PageUp/PageDown, Home/End, Enter
 * to choose, Esc to close the list (and restore the current value) without
 * closing the panel behind.
 *
 * The list opens in the top layer (the popover API, where the browser has it)
 * at the field's place, under it or above it when there is no room below, and
 * no taller than the room there is, so a picker in a small card by a piece of
 * furniture (DECOPOLISH: the Storage Display Box's Display list) is never cut
 * off by the card or the window. A row is chosen on click, so a finger can
 * scroll the list on a touch screen without choosing.
 */

const norm = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

let uid = 0;

/** Rank matches: name starts with the query, then a word starts with it, then anywhere. */
export function filterOptions(options, query) {
  const q = norm(query).trim();
  if (!q) return options.slice();
  const ranked = [];
  for (const opt of options) {
    const text = norm(opt.label);
    const at = text.indexOf(q);
    if (at < 0) continue;
    const rank = at === 0 ? 0 : /[\s(:'-]/.test(text[at - 1]) ? 1 : 2;
    ranked.push({ opt, rank, at });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.opt.label.localeCompare(b.opt.label));
  return ranked.map((r) => r.opt);
}

/**
 * What the list shows: every option for an empty query; for a query, the matches, of which at
 * most `searchLimit` are search-only options (data-search-only on the <option>: the Map's
 * streets, listed only when you type, as the client's LocationSearchMap showed 8).
 */
export function shownOptions(options, query, { searchLimit = 8 } = {}) {
  if (!norm(query).trim()) return options.filter((o) => !o.searchOnly);
  let extra = 0;
  return filterOptions(options, query).filter((o) => !o.searchOnly || (extra += 1) <= searchLimit);
}

/** A trailing count in an option's text: "Allspice (21)" or "Grain ×6" -> { name, count }. */
export function splitCount(label) {
  const m = /^(.*?)(?:\s*\((\d[\d,]*)\)|\s*×\s*(\d[\d,]*))?$/.exec(String(label || ''));
  return { name: m[1], count: m[2] || m[3] || '' };
}

/** Margin kept between the open list and the window's edge, and the gap to its field. */
export const LIST_MARGIN = 8;
export const LIST_GAP = 6;

/**
 * Where the open list goes (PURE): under the field when it fits (or there is more room there),
 * else above it; never taller than the room on that side, never past the window's sides.
 * `field` is the field's client rect, `want` the list's natural height, `max` its tallest.
 * @returns {{ left: number, width: number, top?: number, bottom?: number, maxHeight: number, above: boolean }}
 */
export function placeList(field, want, view, { max = 304, minWidth = 0 } = {}) {
  const below = view.height - field.bottom - LIST_GAP - LIST_MARGIN;
  const aboveRoom = field.top - LIST_GAP - LIST_MARGIN;
  const need = Math.min(want, max);
  const above = need > below && aboveRoom > below;
  const maxHeight = Math.max(80, Math.min(max, above ? aboveRoom : below));
  const width = Math.min(Math.max(field.width, minWidth), view.width - 2 * LIST_MARGIN);
  const left = Math.max(LIST_MARGIN, Math.min(view.width - LIST_MARGIN - width, field.left));
  return above
    ? { left, width, bottom: view.height - field.top + LIST_GAP, maxHeight, above }
    : { left, width, top: field.bottom + LIST_GAP, maxHeight, above };
}

/**
 * @param {HTMLSelectElement} select
 * @param {{ placeholder?: string, label?: string, className?: string, minListWidth?: number }} [opts]
 *   className: an extra class on the wrap (a look of its own, e.g. 'combo-pick' in Decoration Mode);
 *   minListWidth: the list may be wider than a narrow field.
 */
export function createCombobox(select, opts = {}) {
  const id = `combo-${(uid += 1)}`;
  const wrap = document.createElement('div');
  wrap.className = opts.className ? `combo ${opts.className}` : 'combo';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'combo-input';
  input.id = `${id}-input`;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = opts.placeholder || 'Search…';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-list`);
  if (opts.label) input.setAttribute('aria-label', opts.label);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'combo-toggle';
  toggle.tabIndex = -1;
  toggle.setAttribute('aria-label', opts.label ? `Show all ${opts.label.toLowerCase()}` : 'Show all');
  toggle.innerHTML = '<svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const list = document.createElement('ul');
  list.className = 'combo-list';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  if (opts.label) list.setAttribute('aria-label', opts.label);
  list.hidden = true;
  // The top layer, where there is one: no card's overflow or transform clips or moves it.
  const layered = typeof list.showPopover === 'function';
  if (layered) list.setAttribute('popover', 'manual');
  wrap.append(input, toggle, list);
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.insertAdjacentElement('afterend', wrap);

  let options = [];
  let shown = [];
  let active = -1;

  const currentLabel = () => options.find((o) => o.value === select.value)?.label || '';

  function readOptions() {
    options = [...select.options].map((o) => ({ value: o.value, label: o.textContent || '', hint: o.dataset.hint || '', icon: o.dataset.icon || '', count: o.dataset.count || '', searchOnly: o.dataset.searchOnly === '1' }));
  }

  function setActive(index) {
    active = shown.length ? Math.max(0, Math.min(shown.length - 1, index)) : -1;
    [...list.children].forEach((li, i) => {
      const on = i === active;
      li.classList.toggle('is-active', on);
      li.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    });
    if (active < 0) input.removeAttribute('aria-activedescendant');
  }

  function render(query) {
    shown = shownOptions(options, query);
    list.innerHTML = '';
    const q = norm(query).trim();
    shown.forEach((opt, i) => {
      const li = document.createElement('li');
      li.id = `${id}-opt-${i}`;
      li.className = 'combo-option';
      li.setAttribute('role', 'option');
      li.dataset.value = opt.value;
      if (opt.value === select.value) li.classList.add('is-current');
      // Bold the matched part; the trailing count reads lighter, as a pill.
      const parts = splitCount(opt.label);
      const name = opt.count ? opt.label : parts.name;
      const countText = opt.count || parts.count;
      if (opt.icon) {
        const icon = document.createElement('img');
        icon.className = 'combo-icon';
        icon.src = opt.icon;
        icon.alt = '';
        icon.width = 24;
        icon.height = 24;
        icon.loading = 'lazy';
        icon.decoding = 'async';
        li.append(icon);
      } else if (options.some((o) => o.icon)) {
        const gap = document.createElement('span');
        gap.className = 'combo-icon';
        li.append(gap);
      }
      const at = q ? norm(name).indexOf(q) : -1;
      const nameEl = document.createElement('span');
      nameEl.className = 'combo-name';
      if (at >= 0) {
        nameEl.append(name.slice(0, at));
        const b = document.createElement('mark');
        b.textContent = name.slice(at, at + q.length);
        nameEl.append(b, name.slice(at + q.length));
      } else {
        nameEl.textContent = name;
      }
      li.append(nameEl);
      if (opt.hint) {
        const hint = document.createElement('span');
        hint.className = 'combo-count combo-hint';
        hint.textContent = opt.hint;
        li.append(hint);
      }
      if (countText) {
        const count = document.createElement('span');
        count.className = 'combo-count';
        count.textContent = countText;
        li.append(count);
      }
      // Keep focus in the input; choose on the click, so a finger scrolling the list chooses nothing.
      li.addEventListener('pointerdown', (e) => e.preventDefault());
      li.addEventListener('mousedown', (e) => e.preventDefault());
      li.addEventListener('click', (e) => {
        e.preventDefault();
        choose(opt);
      });
      li.addEventListener('pointermove', () => { if (active !== i) setActive(i); });
      list.append(li);
    });
    if (!shown.length) {
      const empty = document.createElement('li');
      empty.className = 'combo-empty';
      empty.textContent = 'No matches';
      list.append(empty);
    }
    const currentIndex = q ? 0 : shown.findIndex((o) => o.value === select.value);
    setActive(currentIndex >= 0 ? currentIndex : 0);
  }

  /** Put the open list by its field, inside the window (placeList). */
  function position() {
    if (list.hidden) return;
    if (!input.isConnected) {
      close({ restore: false }); // its card was redrawn without it
      return;
    }
    const f = input.getBoundingClientRect();
    const view = { width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight };
    list.style.maxHeight = '';
    const at = placeList(f, list.scrollHeight, view, { minWidth: opts.minListWidth || 0, max: Math.min(304, Math.round(view.height * 0.55)) });
    wrap.classList.toggle('is-above', at.above);
    list.classList.toggle('is-above', at.above);
    list.style.maxHeight = `${Math.round(at.maxHeight)}px`;
    if (!layered) return; // in the page: CSS puts it under (or, .is-above, over) the field
    list.style.position = 'fixed';
    list.style.left = `${Math.round(at.left)}px`;
    list.style.width = `${Math.round(at.width)}px`;
    list.style.right = 'auto';
    list.style.top = at.top != null ? `${Math.round(at.top)}px` : 'auto';
    list.style.bottom = at.bottom != null ? `${Math.round(at.bottom)}px` : 'auto';
  }

  const onViewChange = () => position();

  function open(query = '') {
    render(query);
    const was = list.hidden;
    list.hidden = false;
    if (layered && !list.matches(':popover-open')) {
      try {
        list.showPopover();
      } catch {}
    }
    position();
    const current = list.querySelector('.is-active');
    if (current) current.scrollIntoView({ block: 'nearest' });
    wrap.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
    if (was) {
      window.addEventListener('resize', onViewChange);
      window.addEventListener('scroll', onViewChange, true);
    }
  }

  function close({ restore = true } = {}) {
    if (layered && list.matches(':popover-open')) {
      try {
        list.hidePopover();
      } catch {}
    }
    window.removeEventListener('resize', onViewChange);
    window.removeEventListener('scroll', onViewChange, true);
    list.hidden = true;
    wrap.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (restore) input.value = currentLabel();
  }

  function choose(opt) {
    close({ restore: false });
    input.value = opt.label;
    if (opt.value !== select.value) {
      select.value = opt.value;
      // As a native select does: `input`, then `change` (a form may listen for either).
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    input.blur();
  }

  input.addEventListener('focus', () => {
    input.select();
    open('');
  });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('blur', () => close());
  input.addEventListener('keydown', (e) => {
    const isOpen = !list.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) open('');
      else setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      if (isOpen) {
        e.preventDefault();
        setActive(active + (e.key === 'PageDown' ? 8 : -8));
      }
    } else if ((e.key === 'Home' || e.key === 'End') && isOpen) {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : shown.length - 1);
    } else if (e.key === 'Enter') {
      // Never the form's submit (a native select does not send a form on Enter either).
      e.preventDefault();
      if (isOpen && shown[active]) choose(shown[active]);
      else if (!isOpen) open('');
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        close();
        input.blur();
      }
    } else if (e.key === 'Tab') {
      close();
    }
    // Typing here must never reach the game's movement / hotkeys.
    e.stopPropagation();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  toggle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (list.hidden) input.focus();
    else close();
  });

  function refresh() {
    readOptions();
    if (document.activeElement === input && !list.hidden) render(input.value === currentLabel() ? '' : input.value);
    else input.value = currentLabel();
  }

  refresh();
  return { input, list, refresh, open, close, position, element: wrap };
}
