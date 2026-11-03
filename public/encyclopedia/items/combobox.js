/**
 * A themed combobox in place of a native <select> (Austin 2026-11-01: the OS
 * popup looked grey on the warm-paper pages). The <select> the page draws stays
 * in the DOM, hidden, as the one source of state: choosing an option sets its
 * value and fires `change`, so the page's own listeners and its address state
 * keep working, and without JavaScript the plain <select> is what you get.
 *
 *   import { combobox } from './combobox.js';
 *   const box = combobox(selectElement);   // box.sync() after setting select.value in code
 *
 * Options read their label from the <option> text ("Food (123)" shows the
 * count apart), an optional picture from `data-icon`, and the option with an
 * empty value is "All". Keyboard: type to filter, ArrowDown/ArrowUp, Home/End,
 * Enter to choose, Escape to close (and again to clear), Tab to leave.
 * ARIA: input role=combobox with aria-expanded/aria-controls/aria-activedescendant,
 * a role=listbox of role=option rows.
 */
const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let seq = 0;

export function combobox(select) {
  seq += 1;
  const id = `cbx-${seq}`;
  const label = select.closest('label');
  const labelText = label?.querySelector('span')?.textContent?.trim() || select.getAttribute('aria-label') || '';
  const opts = [...select.options].map((o, i) => {
    const m = /^(.*?)\s*\(([\d,]+)\)$/.exec(o.textContent.trim());
    return { value: o.value, text: m ? m[1] : o.textContent.trim(), count: m ? m[2] : '', icon: o.dataset.icon || '', i, key: fold(o.textContent) };
  });
  const all = opts.find((o) => o.value === '') || { value: '', text: '' };

  const wrap = document.createElement('div');
  wrap.className = 'cbx';
  wrap.innerHTML = `<input class="cbx-input" type="text" role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${esc(all.text)}" aria-label="${esc(labelText)}" /><button class="cbx-clear" type="button" tabindex="-1" aria-label="Clear ${esc(labelText.toLowerCase())}" hidden>×</button><span class="cbx-chev" aria-hidden="true"></span><ul class="cbx-list" role="listbox" id="${id}-list" aria-label="${esc(labelText)}" hidden></ul>`;
  // The <select> stays (hidden) as the state, inside its <label>; the combobox sits beside the label in one field.
  const field = document.createElement('div');
  field.className = 'cbx-field';
  if (label) {
    label.classList.add('cbx-label');
    label.replaceWith(field);
    field.append(label, wrap);
    label.addEventListener('click', (e) => { e.preventDefault(); input.focus(); });
  } else {
    select.replaceWith(field);
    field.append(wrap, select);
  }
  select.hidden = true;
  select.tabIndex = -1;

  const input = wrap.querySelector('input');
  const list = wrap.querySelector('ul');
  const clear = wrap.querySelector('.cbx-clear');
  let shown = [];
  let active = -1;

  const current = () => opts.find((o) => o.value === select.value) || all;
  const sync = () => {
    const c = current();
    input.value = c.value ? c.text : '';
    clear.hidden = !c.value;
    wrap.classList.toggle('cbx-set', Boolean(c.value));
  };
  const row = (o, n) => `<li role="option" id="${id}-o${o.i}" data-n="${n}" aria-selected="${o.value === select.value}"${o.value === '' ? ' class="cbx-all"' : ''}>${o.icon ? `<img src="${esc(o.icon)}" alt="" width="22" height="22" loading="lazy" decoding="async" />` : o.value === '' ? '' : '<span class="cbx-noic" aria-hidden="true"></span>'}<span class="cbx-text">${esc(o.text)}</span>${o.count ? `<span class="cbx-count">${esc(o.count)}</span>` : ''}</li>`;
  const setActive = (n) => {
    active = shown.length ? Math.max(0, Math.min(shown.length - 1, n)) : -1;
    for (const li of list.children) li.classList.toggle('cbx-active', Number(li.dataset.n) === active);
    const li = list.querySelector('.cbx-active');
    if (li) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  };
  const render = (query) => {
    const words = fold(query).split(' ').filter(Boolean);
    shown = words.length ? opts.filter((o) => o.value !== '' && words.every((w) => o.key.includes(w))) : opts;
    list.innerHTML = shown.length ? shown.map(row).join('') : '<li class="cbx-none" role="presentation">No match</li>';
    const sel = shown.findIndex((o) => o.value === select.value);
    setActive(words.length ? 0 : Math.max(0, sel));
  };
  const open = (query = '') => {
    render(query);
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    wrap.classList.add('cbx-open');
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    wrap.classList.remove('cbx-open');
    sync();
  };
  const choose = (o) => {
    const changed = select.value !== o.value;
    select.value = o.value;
    close();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  input.addEventListener('focus', () => { open(); input.select(); });
  input.addEventListener('click', () => { if (list.hidden) { open(); input.select(); } });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('blur', () => { if (!list.hidden) close(); });
  input.addEventListener('keydown', (e) => {
    const isOpen = !list.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) { open(); return; }
      setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if ((e.key === 'Home' || e.key === 'End') && isOpen) {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : shown.length - 1);
    } else if (e.key === 'Enter') {
      if (isOpen && shown[active]) { e.preventDefault(); choose(shown[active]); }
    } else if (e.key === 'Escape') {
      if (isOpen) { e.preventDefault(); close(); input.select(); } else if (select.value) { e.preventDefault(); choose(all); }
    } else if (e.key === 'Tab' && isOpen) close();
  });
  // pointerdown keeps the focus in the field, so blur does not close the list first.
  list.addEventListener('pointerdown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-n]');
    if (li) choose(shown[Number(li.dataset.n)]);
  });
  clear.addEventListener('pointerdown', (e) => e.preventDefault());
  clear.addEventListener('click', () => { choose(all); input.focus(); });
  wrap.querySelector('.cbx-chev').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (list.hidden) input.focus();
    else close();
  });

  sync();
  return { sync, input, list, close, open };
}
