/**
 * A type-to-filter combobox that stands in front of a native <select>.
 *
 * The select stays in the DOM (hidden) as the source of truth: its options
 * fill the list, and choosing a row sets `select.value` and dispatches
 * `change`, so existing listeners and QA scripts keep working. Call
 * `refresh()` after repopulating the select.
 *
 * Keyboard: type to filter, Up/Down to move, Enter to choose, Esc to close
 * the list (and restore the current value) without closing the panel behind.
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
 * @param {HTMLSelectElement} select
 * @param {{ placeholder?: string, label?: string }} [opts]
 */
export function createCombobox(select, opts = {}) {
  const id = `combo-${(uid += 1)}`;
  const wrap = document.createElement('div');
  wrap.className = 'combo';
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
  list.hidden = true;
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
    options = [...select.options].map((o) => ({ value: o.value, label: o.textContent || '' }));
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
    shown = filterOptions(options, query);
    list.innerHTML = '';
    const q = norm(query).trim();
    shown.forEach((opt, i) => {
      const li = document.createElement('li');
      li.id = `${id}-opt-${i}`;
      li.className = 'combo-option';
      li.setAttribute('role', 'option');
      li.dataset.value = opt.value;
      if (opt.value === select.value) li.classList.add('is-current');
      // Bold the matched part; the trailing "(N)" count reads lighter.
      const m = /^(.*?)(\s*\(\d+\))?$/.exec(opt.label);
      const name = m[1];
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
      if (m[2]) {
        const count = document.createElement('span');
        count.className = 'combo-count';
        count.textContent = m[2].trim().replace(/[()]/g, '');
        li.append(count);
      }
      li.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // keep focus in the input
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

  function open(query = '') {
    render(query);
    list.hidden = false;
    wrap.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
  }

  function close({ restore = true } = {}) {
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
      if (!isOpen) return;
      e.preventDefault();
      setActive(active + (e.key === 'PageDown' ? 8 : -8));
    } else if (e.key === 'Enter') {
      if (isOpen && shown[active]) {
        e.preventDefault();
        choose(shown[active]);
      }
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
  return { input, list, refresh, open, close, element: wrap };
}
