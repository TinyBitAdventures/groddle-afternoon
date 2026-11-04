/**
 * A type-to-filter combobox that stands in front of a native <select>, and every select in the
 * game is fronted by one (watchSelects, SEATSELECT); createSuggestBox is the same list over a
 * free-text field (the online letter's To).
 *
 * The select stays in the DOM (hidden) as the source of truth: its options
 * fill the list, and choosing a row sets `select.value` and dispatches
 * `change`, so existing listeners and QA scripts keep working. It follows the
 * select's options, value, `hidden` and `disabled` as the page changes them
 * (`refresh()` still redraws it at once).
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

/** Each select a combobox stands in front of, and its handle (createCombobox called again returns it). */
const FRONTED = new WeakMap();

/** The words of a select's <label> (its text without the select's own options), or ''. */
function labelWords(select) {
  const label = select.labels?.[0];
  if (!label) return '';
  let text = '';
  for (const node of label.childNodes) {
    if (node.nodeType === 3) text += node.textContent;
    else if (node.nodeType === 1 && node !== select && !node.contains(select) && !node.classList?.contains('combo')) text += node.textContent;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The list half of a combobox, shared by the select picker (createCombobox) and the free-text
 * field with suggestions (createSuggestBox): an input with role combobox over a listbox in the
 * top layer. `source` gives the options ({ value, label, hint, icon, count, searchOnly }), the
 * current value and what choosing does; `free` keeps what was typed (no row is picked until
 * you move to one, and Enter with none sends the form as a text field does).
 */
function buildCombo(wrap, input, source, opts) {
  const id = input.id.replace(/-input$/, '');
  const free = Boolean(opts.free);
  input.classList.add('combo-input');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-list`);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'combo-toggle';
  toggle.tabIndex = -1;
  toggle.innerHTML = '<svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const list = document.createElement('ul');
  list.className = 'combo-list';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  // The top layer, where there is one: no card's overflow or transform clips or moves it.
  const layered = typeof list.showPopover === 'function';
  if (layered) list.setAttribute('popover', 'manual');
  wrap.append(toggle, list);

  let options = [];
  let shown = [];
  let active = -1;
  let label = '';

  function setLabel(text) {
    label = String(text || '').trim();
    if (label) {
      input.setAttribute('aria-label', label);
      list.setAttribute('aria-label', label);
    }
    toggle.setAttribute('aria-label', label ? `Show all ${label.toLowerCase()}` : 'Show all');
  }

  function setActive(index) {
    active = shown.length && index >= 0 ? Math.max(0, Math.min(shown.length - 1, index)) : -1;
    [...list.children].forEach((li, i) => {
      const on = i === active;
      li.classList.toggle('is-active', on);
      if (li.getAttribute('role') === 'option') li.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    });
    if (active < 0) input.removeAttribute('aria-activedescendant');
  }

  function render(query) {
    options = source.options();
    shown = shownOptions(options, query);
    list.innerHTML = '';
    const q = norm(query).trim();
    const current = source.current();
    shown.forEach((opt, i) => {
      const li = document.createElement('li');
      li.id = `${id}-opt-${i}`;
      li.className = 'combo-option';
      li.setAttribute('role', 'option');
      li.dataset.value = opt.value;
      if (!free && opt.value === current) li.classList.add('is-current');
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
    if (!shown.length && !free) {
      const empty = document.createElement('li');
      empty.className = 'combo-empty';
      empty.textContent = 'No matches';
      list.append(empty);
    }
    // A free field picks no row until you move to one (Enter keeps what you typed).
    const currentIndex = free ? -1 : q ? 0 : shown.findIndex((o) => o.value === current);
    setActive(free ? -1 : currentIndex >= 0 ? currentIndex : 0);
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
    if (input.disabled) return;
    render(query);
    // A free field with no suggestions to show opens nothing (an empty box under a name field).
    if (free && !shown.length) {
      close({ restore: false });
      return;
    }
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
    if (restore && !free) input.value = source.currentLabel();
  }

  let choosing = false;
  function choose(opt) {
    close({ restore: false });
    input.value = opt.label;
    // The events choosing sends (a free field's own `input`) must not open the list again.
    choosing = true;
    try {
      source.choose(opt);
    } finally {
      choosing = false;
    }
    if (!free) input.blur();
  }

  input.addEventListener('focus', () => {
    // A search box (opts.search) empties for typing, so its placeholder shows; leaving it puts the
    // current value back (close restores it).
    if (opts.search && !free) input.value = '';
    else if (!free) input.select();
    open(free ? input.value : '');
  });
  // Ticket 76 (Safari): a search box that kept the focus with its list shut (the chevron shut it,
  // which puts the current value back) showed the region's name again, and a click in it sent no
  // new focus, so it never emptied for the search; typing went on after the name. A press in it, or
  // a key typed into it, while its list is shut empties it the way a fresh focus does.
  const emptyForSearch = () => {
    if (!opts.search || free || !list.hidden || document.activeElement !== input) return false;
    input.value = '';
    return true;
  };
  input.addEventListener('pointerdown', () => { if (emptyForSearch()) open(''); });
  input.addEventListener('input', () => { if (!choosing) open(input.value); });
  input.addEventListener('blur', () => close());
  input.addEventListener('keydown', (e) => {
    // A letter typed into a shut search box replaces the region's name (its input event opens the list).
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && input.value === source.currentLabel()) emptyForSearch();
    const isOpen = !list.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) open(free ? input.value : '');
      else setActive(active < 0 && e.key === 'ArrowUp' ? shown.length - 1 : active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      if (isOpen) {
        e.preventDefault();
        setActive(active + (e.key === 'PageDown' ? 8 : -8));
      }
    } else if ((e.key === 'Home' || e.key === 'End') && isOpen && !free) {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : shown.length - 1);
    } else if (e.key === 'Enter') {
      if (free) {
        // A name field: Enter takes the row you moved to, else sends the form as it would.
        if (isOpen && shown[active]) {
          e.preventDefault();
          choose(shown[active]);
        } else close({ restore: false });
      } else {
        // Never the form's submit (a native select does not send a form on Enter either).
        e.preventDefault();
        if (isOpen && shown[active]) choose(shown[active]);
        else if (!isOpen) open('');
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        close();
        if (!free) input.blur();
      }
    } else if (e.key === 'Tab') {
      close();
    }
    // Typing here must never reach the game's movement / hotkeys; Esc with the list shut goes on
    // to the panel, as from a native select.
    if (!(e.key === 'Escape' && !isOpen)) e.stopPropagation();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  toggle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (input.disabled) return;
    if (list.hidden) {
      if (document.activeElement === input) open('');
      else input.focus();
    } else close();
  });

  return { open, close, position, render, setLabel, list, toggle, isOpen: () => !list.hidden };
}

/**
 * @param {HTMLSelectElement} select
 * @param {{ placeholder?: string, label?: string, className?: string, minListWidth?: number, search?: boolean }} [opts]
 *   className: an extra class on the wrap (a look of its own, e.g. 'combo-pick' in Decoration Mode);
 *   search: a magnifier at the field's start, and the field empties when focused so its placeholder
 *   asks for a search (the Map's region box, ticket 21); leaving it shows the current value again;
 *   minListWidth: the list may be wider than a narrow field.
 *   Called again on a select it already stands in front of, it takes the new options and returns
 *   the same handle.
 *
 * The select keeps the page's say over the field (SEATSELECT, Austin 2026-11-02: "swap all normal
 * selects"): the field follows its `hidden` and `disabled`, its options as they change, and a
 * value set by code (`select.value = ...`, `selectedIndex`, a form reset); `select.focus()` focuses
 * the field; its <label> (or aria-label, or title) names the field, and a click on the label
 * focuses it.
 */
export function createCombobox(select, opts = {}) {
  const had = FRONTED.get(select);
  if (had) {
    had.configure(opts);
    had.refresh();
    return had;
  }
  const id = `combo-${(uid += 1)}`;
  const wrap = document.createElement('div');
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `${id}-input`;
  wrap.append(input);
  let options = [];
  const currentLabel = () => options.find((o) => o.value === select.value)?.label || '';
  function readOptions() {
    options = [...select.options].map((o) => ({ value: o.value, label: o.textContent || '', hint: o.dataset.hint || '', icon: o.dataset.icon || '', count: o.dataset.count || '', searchOnly: o.dataset.searchOnly === '1' }));
    return options;
  }
  const combo = buildCombo(wrap, input, {
    options: readOptions,
    current: () => select.value,
    currentLabel,
    choose(opt) {
      if (opt.value === select.value) return;
      setValue(opt.value);
      // As a native select does: `input`, then `change` (a form may listen for either).
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
  }, opts);
  // The select stays in the page as the value (a form sends it, listeners hear its change), out of sight.
  select.classList.add('combo-native');
  select.style.setProperty('display', 'none', 'important');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.insertAdjacentElement('afterend', wrap);

  // A value set by code shows in the field (the Map's region when it opens on another hub).
  const proto = Object.getPrototypeOf(select);
  const props = {};
  for (const prop of ['value', 'selectedIndex']) {
    let d = null;
    for (let p = proto; p && !d; p = Object.getPrototypeOf(p)) d = Object.getOwnPropertyDescriptor(p, prop);
    if (!d?.set) continue;
    props[prop] = d;
    Object.defineProperty(select, prop, {
      configurable: true,
      enumerable: true,
      get() { return d.get.call(select); },
      set(v) {
        d.set.call(select, v);
        syncSoon();
      },
    });
  }
  function setValue(v) {
    if (props.value) props.value.set.call(select, v);
    else select.value = v;
  }
  let syncQueued = false;
  function syncSoon() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(() => {
      syncQueued = false;
      sync();
    });
  }
  function sync() {
    wrap.hidden = select.hidden;
    input.disabled = select.disabled;
    combo.toggle.disabled = select.disabled;
    wrap.classList.toggle('is-disabled', select.disabled);
    if (select.disabled && combo.isOpen()) combo.close();
    if (!opts.label) combo.setLabel(select.getAttribute('aria-label') || select.title || labelWords(select));
    refresh();
  }
  const watch = new MutationObserver(syncSoon);
  watch.observe(select, { attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-label', 'title'], childList: true, subtree: true, characterData: true });
  select.addEventListener('change', syncSoon);
  select.form?.addEventListener('reset', () => setTimeout(sync, 0));
  select.focus = (o) => input.focus(o);

  function configure(next = {}) {
    Object.assign(opts, next);
    wrap.className = ['combo', opts.search ? 'combo-search' : '', opts.className || select.dataset.comboClass || ''].filter(Boolean).join(' ');
    // A search box shows a magnifier at its start (ticket 21: the Map's region box searches too).
    if (opts.search && !wrap.querySelector('.combo-mag')) {
      const mag = document.createElement('span');
      mag.className = 'combo-mag';
      mag.setAttribute('aria-hidden', 'true');
      mag.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M10.3 10.3l3.9 3.9" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';
      wrap.prepend(mag);
    }
    input.placeholder = opts.placeholder || select.dataset.comboPlaceholder || (select.options.length > 12 ? 'Search…' : '');
    if (!opts.minListWidth && select.dataset.comboWidth) opts.minListWidth = Number(select.dataset.comboWidth) || 0;
    combo.setLabel(opts.label || select.getAttribute('aria-label') || select.title || labelWords(select));
  }

  function refresh() {
    readOptions();
    // The longest option's length, so a field can be as wide as its select was (CSS --combo-longest).
    wrap.style.setProperty('--combo-longest', String(Math.min(40, Math.max(4, ...options.map((o) => o.label.length)))));
    if (document.activeElement === input && combo.isOpen()) combo.render(input.value === currentLabel() ? '' : input.value);
    else input.value = currentLabel();
  }

  configure();
  // A click on the select's <label> focuses the field.
  for (const label of select.labels || []) label.htmlFor = input.id;
  sync();
  const api = { input, list: combo.list, refresh, open: combo.open, close: combo.close, position: combo.position, element: wrap, configure };
  FRONTED.set(select, api);
  return api;
}

/**
 * A free-text field with suggestions (SEATSELECT: the online letter's To, a player's name with
 * your buddies offered, MailComposeUI.as 384-411), in place of an <input list> and its
 * <datalist>: any name may be typed; the list offers the suggestions that match, Up/Down move to
 * one and Enter or a click puts it in the field. Nothing is picked until you move to a row, so
 * Enter on a typed name sends the form as before.
 * @param {HTMLInputElement} input
 * @param {{ suggestions: string[] | (() => string[]), label?: string, className?: string, minListWidth?: number }} opts
 */
export function createSuggestBox(input, opts) {
  const had = FRONTED.get(input);
  if (had) return had;
  // buildCombo names its list and rows after the input's id.
  if (!input.id) input.id = `combo-${(uid += 1)}-input`;
  const wrap = document.createElement('div');
  wrap.className = ['combo', 'combo-free', opts.className || ''].filter(Boolean).join(' ');
  input.insertAdjacentElement('beforebegin', wrap);
  wrap.append(input);
  const list = input.getAttribute('list');
  if (list) {
    input.removeAttribute('list');
    input.ownerDocument.getElementById(list)?.remove();
  }
  const read = () => (typeof opts.suggestions === 'function' ? opts.suggestions() : opts.suggestions || []).filter(Boolean).map((name) => ({ value: String(name), label: String(name), hint: '', icon: '', count: '', searchOnly: false }));
  const combo = buildCombo(wrap, input, {
    options: read,
    current: () => input.value,
    currentLabel: () => input.value,
    choose() {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
  }, { ...opts, free: true });
  combo.setLabel(opts.label || input.getAttribute('aria-label') || labelWords(input));
  for (const label of input.labels || []) label.htmlFor = input.id;
  const api = { input, list: combo.list, open: combo.open, close: combo.close, position: combo.position, element: wrap };
  FRONTED.set(input, api);
  return api;
}

/** Selects left native on purpose (none in the game yet): a <select multiple> or with size > 1 is a list, not a menu. */
function wantsCombo(select) {
  return !FRONTED.has(select) && !select.multiple && !(select.size > 1) && !select.closest('[data-native-select]');
}

/**
 * Front every <select> under `root` with a combobox, now and as they are added (SEATSELECT,
 * Austin 2026-11-02: "Short filter menus: yes let's swap all normal selects with the new
 * autocomplete UI"). A select may name its look with data-combo-class, its placeholder with
 * data-combo-placeholder and its list's least width with data-combo-width; `defaults` apply to
 * the rest. Returns a function that stops watching.
 * @param {ParentNode & Node} root
 * @param {{ className?: string, minListWidth?: number }} [defaults]
 */
export function watchSelects(root, defaults = {}) {
  const front = (select) => {
    if (wantsCombo(select)) createCombobox(select, { className: select.dataset.comboClass || defaults.className || '', minListWidth: defaults.minListWidth || 0 });
  };
  const sweep = (node) => {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'SELECT') front(node);
    else node.querySelectorAll?.('select').forEach(front);
  };
  sweep(root.nodeType === 9 ? root.documentElement : root);
  const watch = new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) sweep(node);
  });
  watch.observe(root, { childList: true, subtree: true });
  return () => watch.disconnect();
}
