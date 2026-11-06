/**
 * VERBS (phase 2, Warm paper; the HUD mock's compact verb menu): the view for the menus that
 * list what you can do with a thing. The world's verb menu (#verb-menu: a piggy, a tree, an
 * apple on the ground, furniture, a door) and a pack stack's menu (#pack-popover) both draw
 * their rows with it:
 *
 * - one line per verb: a 1-9 key cap, the verb, and its energy cost (or what it gives, or a
 *   chevron when it opens a second level, a check on a second level's current choice, or a lock
 *   when it can't be done now);
 * - the explanation of the row under the pointer or focus, or why it can't be done, in one
 *   footer line, so the rows stay one line high;
 * - a tail that points at the thing; the menu sits above it and flips below when there is no
 *   room, and steps sideways to keep clear of the avatar (placeVerbMenu);
 * - keys: Up/Down or W/S move, Enter picks, 1-9 pick a row, 0 or Backspace go back from a
 *   second level (Feed, Eat more, Drop some, a bag's Sort), Esc closes (game.js);
 * - a verb that takes a thing from the pack (Feed what?) shows the things as pictures in a grid
 *   (makePickTile, the original's target-item menu), walked with the arrows.
 *
 * game.js keeps the verbs, their order and what each does (menuVerbsFor, renderPackPopover):
 * this module only draws rows and moves between them. Rows are buttons with class vm-row;
 * a row that can't be done now has aria-disabled (it still takes focus, so its reason can be
 * read) and its click is stopped here. A row's explanation is data-vm-tip, its reason
 * data-vm-reason; the back row has data-vm-back.
 */

const SVG = (body, cls) => `<svg class="${cls}" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
/** The energy bolt beside a cost. */
export const BOLT_ICON = '<svg class="vm-bolt" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M7.2.6 1.9 7h3.2l-.9 4.4L9.8 5H6.5z"/></svg>';
export const CHEVRON_ICON = SVG('<path d="m6 4 4 4-4 4"/>', 'vm-chev');
export const LOCK_ICON = SVG('<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>', 'vm-lock');
export const BACK_ICON = SVG('<path d="M10 4 6 8l4 4"/>', 'vm-backicon');
/** A second level's current choice (a bag's sort): it stands in for the lock on that row. */
export const CHECK_ICON = SVG('<path d="m3.5 8.5 3 3 6-7"/>', 'vm-check');

/** The highest number key a row can have. */
export const MAX_KEYED_ROWS = 9;

export function escapeText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Markup in a tooltip or reason (a verb's <b>, a quest link) as the plain words the footer shows. */
export function plainWords(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
}

/**
 * A row's inner markup: the key cap, the words and what sits on the right.
 * @param {{ key?: string, label: string, cost?: number, gain?: string, count?: string,
 *   next?: boolean, back?: boolean, disabled?: boolean, current?: boolean }} row
 */
export function verbRowInner(row) {
  const key = row.key ? `<span class="vm-key kcap" aria-hidden="true">${escapeText(row.key)}</span>` : '<span class="vm-key vm-key-none" aria-hidden="true"></span>';
  const back = row.back ? BACK_ICON : '';
  const label = `<span class="vm-label">${escapeText(row.label)}</span>`;
  let end = '';
  if (row.current) end = CHECK_ICON;
  else if (row.disabled) end = LOCK_ICON;
  else if (Number(row.cost) > 0) end = `<span class="vm-cost" aria-label="${Number(row.cost)} energy">${BOLT_ICON}${Number(row.cost)}</span>`;
  else if (row.gain) end = `<span class="vm-cost vm-gain">${escapeText(row.gain)}</span>`;
  else if (row.count) end = `<span class="vm-cost vm-count">${escapeText(row.count)}</span>`;
  else if (row.next) end = CHEVRON_ICON;
  return `${key}${back}${label}${end}`;
}

/** The row's attributes as markup (for menus drawn as one string, like the pack's). */
export function verbRowAttrs({ tip = '', reason = '', disabled = false, back = false, current } = {}) {
  return [
    // A level of choices (a bag's sorts: `current` true or false on each) is a radio group.
    typeof current === 'boolean' ? `role="menuitemradio" aria-checked="${current}"` : 'role="menuitem"',
    disabled ? 'aria-disabled="true"' : '',
    tip ? `data-vm-tip="${escapeText(plainWords(tip))}"` : '',
    disabled && reason ? `data-vm-reason="${escapeText(plainWords(reason))}"` : '',
    back ? 'data-vm-back' : '',
  ].filter(Boolean).join(' ');
}

/** The key caps for a list of rows: a back row is 0, the others 1-9 in order (none past 9). */
export function verbRowKeys(rows) {
  let n = 0;
  return rows.map((row) => {
    if (row.back) return '0';
    n += 1;
    return n <= MAX_KEYED_ROWS ? String(n) : '';
  });
}

/** A row button for a DOM-built menu (the world's), with its explanation and reason. */
export function makeVerbRow(doc, row) {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = `vm-row${row.back ? ' vm-back' : ''}${row.className ? ` ${row.className}` : ''}`;
  // A level of choices (`current` true or false on each) is a radio group, as verbRowAttrs says.
  if (typeof row.current === 'boolean') {
    btn.setAttribute('role', 'menuitemradio');
    btn.setAttribute('aria-checked', String(row.current));
  } else {
    btn.setAttribute('role', 'menuitem');
  }
  if (row.disabled) btn.setAttribute('aria-disabled', 'true');
  if (row.tip) btn.dataset.vmTip = plainWords(row.tip);
  if (row.disabled && row.reason) btn.dataset.vmReason = plainWords(row.reason);
  if (row.back) btn.dataset.vmBack = '';
  btn.innerHTML = verbRowInner(row);
  // The words a screen reader says: the verb, its cost and why it can't be done.
  const said = [row.label];
  if (Number(row.cost) > 0) said.push(`${Number(row.cost)} energy`);
  else if (row.gain) said.push(row.gain);
  else if (row.count) said.push(row.count);
  if (row.disabled && row.reason) said.push(plainWords(row.reason));
  btn.setAttribute('aria-label', said.join(', '));
  return btn;
}

/**
 * The picture level's columns (InteractionMenu.as buildTargetItemCUIs 487-493): up to 7 choices
 * sit in one row; more fill a grid of max(4, floor(sqrt(n)) + 4) columns.
 */
export function pickGridCols(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  if (count > 7) return Math.max(4, Math.floor(Math.sqrt(count)) + 4);
  return Math.max(1, Math.min(7, count));
}

/**
 * Where an arrow goes in the picture grid, the client's way (InteractionMenu.as focusLeftChoice,
 * focusRightChoice, focusUpChoice, focusDownChoice 2031-2098): Left and Right wrap inside the row,
 * Up and Down wrap inside the column. `i` is the tile's index among `n` tiles. Returns the new
 * index, or -1 for Up off the top row and Down off the bottom row, where this menu's Back row sits.
 * @param {number} i @param {number} n @param {number} cols @param {'left'|'right'|'up'|'down'} dir
 */
export function pickGridStep(i, n, cols, dir) {
  if (n < 1) return -1;
  const c = Math.max(1, cols);
  const rows = Math.ceil(n / c);
  const col = i % c;
  const row = Math.floor(i / c);
  if (dir === 'left') return col === 0 ? Math.min(n - 1, i + c - 1) : i - 1;
  if (dir === 'right') {
    if (col === c - 1) return Math.max(0, i - (c - 1));
    return i + 1 > n - 1 ? c * (rows - 1) : i + 1;
  }
  if (dir === 'up') return row === 0 ? -1 : i - c;
  if (dir === 'down') {
    if (row === rows - 1) return -1;
    return i + c > n - 1 ? -1 : i + c;
  }
  return i;
}

/**
 * A choice in a verb's picture level (Feed what?, Incubate what?, Deposit what?): the original
 * drew the target items as pictures with no names (InteractionMenu.as 560-578, `label = ''`, an
 * ItemIconView 40 px in a 50 px button), the name and how many you have in the one desc line
 * under them (1891-1916: "Grain (you have 5)"). Here the count also sits on the picture the way
 * the pack draws it (none for one), and the name is the tooltip and what a screen reader says.
 * @param {Document} doc
 * @param {{ key?: string, label: string, have: number, icon: string, verb?: string, food?: string, verbLabel?: string, tip?: string }} pick (tip: the footer line, when not the name and count)
 */
export function makePickTile(doc, pick) {
  const have = Math.max(0, Math.floor(Number(pick.have) || 0));
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = `vm-row vm-pick${have < 2 ? ' is-single' : ''}`;
  btn.setAttribute('role', 'menuitem');
  btn.dataset.vmTip = pick.tip || `${pick.label} (you have ${have})`;
  if (pick.food) btn.dataset.food = pick.food;
  if (pick.verb) btn.dataset.verb = pick.verb;
  btn.title = pick.label;
  btn.setAttribute('aria-label', `${pick.verbLabel ? `${pick.verbLabel} ` : ''}${pick.label}, ${have} in your pack`);
  if (pick.key) btn.setAttribute('aria-keyshortcuts', pick.key);
  const key = pick.key ? `<span class="vm-key kcap" aria-hidden="true">${escapeText(pick.key)}</span>` : '';
  const count = have > 1 ? `<span class="count" aria-hidden="true">${have}</span>` : '';
  btn.innerHTML = `${key}<img class="vm-pick-icon" src="${escapeText(pick.icon)}" alt="" draggable="false" />${count}`;
  return btn;
}

/** Every row in a menu, in order. */
export function menuRows(el) {
  return el ? [...el.querySelectorAll('.vm-row')].filter((r) => !r.hidden && r.getClientRects?.().length !== 0) : [];
}

/** The words the footer shows for a row: its reason when it can't be done, else its explanation. */
export function rowDetail(row) {
  if (!row) return { text: '', bad: false };
  if (row.getAttribute('aria-disabled') === 'true' && row.dataset.vmReason) return { text: row.dataset.vmReason, bad: true };
  if (row.hasAttribute('data-vm-back')) return { text: row.dataset.vmTip || 'Back', bad: false };
  return { text: row.dataset.vmTip || '', bad: false };
}

function setDetail(el, row) {
  const detail = el.querySelector('.vm-detail');
  if (!detail) return;
  const { text, bad } = row ? rowDetail(row) : { text: el.dataset.vmDefault || '', bad: false };
  const shown = text || el.dataset.vmDefault || '';
  if (detail.textContent !== shown) detail.textContent = shown;
  detail.classList.toggle('bad', bad);
  // A locked menu keeps its footer's room even when a row has nothing to say (lockVerbMenuSize).
  detail.hidden = !shown && !el.dataset.vmLock;
  for (const r of menuRows(el)) r.classList.toggle('cur', r === row);
}

function shake(el) {
  const detail = el.querySelector('.vm-detail');
  if (!detail || typeof detail.animate !== 'function') return;
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  detail.animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 180 });
}

/**
 * Wire a menu once: the footer follows the row under the pointer or focus, and a row that
 * can't be done now says why instead of acting.
 */
export function bindVerbMenu(el) {
  if (!el || el.dataset.vmBound) return;
  el.dataset.vmBound = '1';
  const rowOf = (t) => t?.closest?.('.vm-row');
  // The pointer's row, when the pointer really moved (a redraw under a still pointer is not a hover,
  // so the keys keep the footer).
  let lastXY = '';
  el.addEventListener('pointermove', (e) => {
    const xy = `${e.clientX},${e.clientY}`;
    if (xy === lastXY) return;
    lastXY = xy;
    const row = rowOf(e.target);
    if (row && el.contains(row) && !row.classList.contains('cur')) setDetail(el, row);
  });
  el.addEventListener('focusin', (e) => {
    const row = rowOf(e.target);
    if (row && el.contains(row)) setDetail(el, row);
  });
  el.addEventListener('pointerleave', () => {
    const focused = rowOf(el.ownerDocument?.activeElement);
    setDetail(el, focused && el.contains(focused) ? focused : null);
  });
  el.addEventListener('click', (e) => {
    const row = rowOf(e.target);
    if (!row || row.getAttribute('aria-disabled') !== 'true') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setDetail(el, row);
    shake(el);
  }, true);
}

/** Point the footer and focus at a row (by index, or the first one that can be done). */
export function focusVerbRow(el, index = null, { focus = true } = {}) {
  const rows = menuRows(el);
  if (!rows.length) {
    setDetail(el, null);
    return null;
  }
  let row = null;
  if (index == null) row = rows.find((r) => r.getAttribute('aria-disabled') !== 'true' && !r.hasAttribute('data-vm-back')) || rows.find((r) => !r.hasAttribute('data-vm-back')) || rows[0];
  else row = rows[(index + rows.length) % rows.length];
  if (focus) row.focus({ preventScroll: true });
  // A capped rows box (fitVerbMenuRows) brings the row into sight; the page itself never scrolls.
  if (row.closest?.('.vm-scroll')) row.scrollIntoView?.({ block: 'nearest' });
  setDetail(el, row);
  return row;
}

/** Refresh the footer for whatever row has focus (after a redraw). */
export function syncVerbDetail(el) {
  const doc = el?.ownerDocument;
  const row = doc?.activeElement?.closest?.('.vm-row');
  setDetail(el, row && el.contains(row) ? row : null);
}

/**
 * Give a menu's footer the height of its tallest line, once. The footer
 * follows the row under the pointer, so a card sized to the current line changed size as the
 * pointer moved; it hangs from its bottom edge, so the rows slid under the still pointer and
 * picked another row, another line, back and forth (Austin 2026-10-30). Locked, it never
 * changes height while it is open. Cheap to call again: it re-measures only when the rows change.
 * The card's width is fixed by the skin; the footer wraps inside it.
 * @param {HTMLElement} el the bound menu (bindVerbMenu): its rows, footer and default line
 */
export function lockVerbMenuSize(el) {
  const detail = el?.querySelector?.('.vm-detail');
  if (!detail) return;
  const rows = menuRows(el);
  const lines = [...new Set([el.dataset.vmDefault || '', ...rows.map((r) => rowDetail(r).text)])];
  const key = `${rows.length}|${lines.join('\u0001')}`;
  if (el.dataset.vmLock === key) return;
  const was = { text: detail.textContent, hidden: detail.hidden };
  detail.style.minHeight = '';
  let h = 0;
  for (const text of lines) {
    detail.textContent = text;
    detail.hidden = false;
    h = Math.max(h, detail.offsetHeight);
  }
  // Not laid out yet (hidden, or a skin without the footer): measure again next time.
  if (h > 0) {
    detail.style.minHeight = `${Math.ceil(h)}px`;
    el.dataset.vmLock = key;
  }
  detail.textContent = was.text;
  detail.hidden = was.hidden && !lines.some(Boolean);
}

/**
 * A key in an open menu. Returns true when the menu used it (the caller then stops it):
 * ArrowUp/ArrowDown and W/S move, 1-9 pick that row, 0 and Backspace pick the back row.
 * Enter and Space are left to the focused button.
 */
export function verbMenuKey(el, e) {
  if (!el || e.altKey || e.ctrlKey || e.metaKey) return false;
  const rows = menuRows(el);
  if (!rows.length) return false;
  const k = e.key;
  const doc = el.ownerDocument;
  const at = rows.indexOf(doc?.activeElement?.closest?.('.vm-row'));
  // The picture level: the arrows (and W A S D) walk its grid; Up off the top row and Down off the
  // bottom row land on Back, and from Back they step into the grid again.
  const grid = el.querySelector('.vm-picks');
  const tiles = grid ? rows.filter((r) => r.classList.contains('vm-pick')) : [];
  if (tiles.length && !e.shiftKey) {
    const dir = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' }[k];
    if (dir) {
      const cur = rows[at];
      const ti = tiles.indexOf(cur);
      const cols = Math.max(1, Number(grid.dataset.cols) || pickGridCols(tiles.length));
      let next = null;
      if (ti >= 0) {
        const to = pickGridStep(ti, tiles.length, cols, dir);
        next = to < 0 ? rows.find((r) => r.hasAttribute('data-vm-back')) || null : tiles[to];
      } else if (dir === 'down' || dir === 'right') next = tiles[0];
      else if (dir === 'up' || dir === 'left') next = tiles[tiles.length - 1];
      if (next) focusVerbRow(el, rows.indexOf(next));
      return true;
    }
  }
  if (k === 'ArrowDown' || k === 'ArrowUp' || (!e.shiftKey && (k === 's' || k === 'S' || k === 'w' || k === 'W'))) {
    const down = k === 'ArrowDown' || k === 's' || k === 'S';
    focusVerbRow(el, at < 0 ? (down ? 0 : rows.length - 1) : at + (down ? 1 : -1));
    return true;
  }
  if (k === 'Home' || k === 'End') {
    focusVerbRow(el, k === 'Home' ? 0 : rows.length - 1);
    return true;
  }
  if (k === '0' || k === 'Backspace') {
    const back = rows.find((r) => r.hasAttribute('data-vm-back'));
    if (!back) return k === 'Backspace';
    back.click();
    return true;
  }
  if (/^[1-9]$/.test(k) && !e.shiftKey) {
    const keyed = rows.filter((r) => !r.hasAttribute('data-vm-back'));
    const row = keyed[Number(k) - 1];
    if (!row) return true;
    row.focus({ preventScroll: true });
    setDetail(el, row);
    row.click();
    return true;
  }
  return false;
}

/**
 * Where the menu goes (all in the root's px). Above the thing, its tail at the thing's centre;
 * when the thing's top is too high the tail points at the highest part of it that leaves room,
 * and when none does the menu flips below it. It moves sideways to keep clear of `avoid` (the
 * avatar) when the tail can still reach, and stays inside the free width (the insets) and
 * above the floor (the pack).
 * @param {{ anchor: {left:number, top:number, right:number, bottom:number},
 *   size: {w:number, h:number}, room: {w:number, h:number, top?:number, floor?:number, left?:number, right?:number},
 *   avoid?: {left:number, top:number, right:number, bottom:number}|null, gap?: number }} o
 * @returns {{ x: number, y: number, below: boolean, tail: number|null }}
 */
export function placeVerbMenu({ anchor, size, room, avoid = null, gap = 12 }) {
  const w = Math.max(0, size.w);
  const h = Math.max(0, size.h);
  const minX = Math.max(0, room.left ?? 8);
  const maxX = Math.max(minX, room.w - (room.right ?? 8) - w);
  const top = room.top ?? 52;
  const floor = Math.min(room.h, room.floor ?? room.h);
  const cx = (anchor.left + anchor.right) / 2;
  let x = Math.min(maxX, Math.max(minX, cx - w / 2));
  // Above: at the thing's top, or (a tall tree) at the highest part of it that leaves room.
  const needTop = top + h + gap;
  let below = false;
  let y;
  if (anchor.top >= needTop) y = anchor.top - gap - h;
  else if (anchor.bottom >= needTop) y = needTop - gap - h;
  else {
    below = true;
    y = anchor.bottom + gap;
  }
  if (avoid) {
    const hit = (L) => L < avoid.right && L + w > avoid.left && y < avoid.bottom && y + h > avoid.top;
    if (hit(x)) {
      const r = avoid.right + 6;
      const l = avoid.left - 6 - w;
      if (cx - r >= 12 && r <= maxX) x = r;
      else if (cx - l <= w - 12 && l >= minX) x = l;
    }
  }
  // Never under the floor (the pack) or over the top band: then it sits where it fits, tail-less.
  let tail = Math.max(12, Math.min(w - 28, cx - x - 8));
  if (y + h > floor - 4) {
    y = Math.max(top, floor - 4 - h);
    tail = null;
  }
  if (y < top) y = top;
  if (cx < x + 6 || cx > x + w - 6) tail = null;
  return { x: Math.round(x), y: Math.round(y), below, tail: tail == null ? null : Math.round(tail) };
}

/**
 * PURE (ticket 134): where a menu goes when its thing has nothing on screen to hang from (a Piglet in
 * the pack): the middle of the free room, under the top band, tail-less.
 * @param {{ size: {w:number, h:number}, room: {w:number, h:number, top?:number, floor?:number, left?:number, right?:number} }} o
 * @returns {{ x: number, y: number, below: boolean, tail: null }}
 */
export function centerVerbMenu({ size, room }) {
  const w = Math.max(0, size.w);
  const h = Math.max(0, size.h);
  const minX = Math.max(0, room.left ?? 8);
  const maxX = Math.max(minX, room.w - (room.right ?? 8) - w);
  const top = room.top ?? 52;
  const floor = Math.min(room.h, room.floor ?? room.h);
  return {
    x: Math.round(Math.min(maxX, Math.max(minX, (room.w - w) / 2))),
    y: Math.round(Math.max(top, top + (floor - 4 - top - h) / 2)),
    below: true,
    tail: null,
  };
}

/** The least a capped rows box keeps (about three rows), so a menu never shrinks to nothing. */
export const MIN_ROWS_BOX = 96;

/**
 * PURE (ticket 87): the most a menu's rows may take so its card, `card` px tall with rows `rows`
 * px tall, fits in `room` px; null when it fits as it is. The head and the footer keep their size:
 * the rows scroll inside the card instead of the card running off the top of the screen.
 */
export function menuRowsCap({ card, rows, room, min = MIN_ROWS_BOX }) {
  const c = Number(card) || 0;
  const r = Number(rows) || 0;
  const space = Number(room);
  if (!(space > 0) || c <= space || r <= 0) return null;
  return Math.max(Math.min(r, min), Math.floor(r - (c - space)));
}

/**
 * Fit a menu in `room` px of height (ticket 87: Very Stinky Cheese's menu, many verbs and a long
 * description, ran off the top): its rows box (`rowsEl`) gets a max-height and scrolls when the
 * card is too tall, and loses both when it fits again. Returns the cap, or null.
 * @param {HTMLElement} card the card that is placed
 * @param {HTMLElement} rowsEl the rows box inside it
 * @param {number} room the height it may take
 */
export function fitVerbMenuRows(card, rowsEl, room) {
  if (!card || !rowsEl) return null;
  rowsEl.style.maxHeight = '';
  rowsEl.style.overflowY = '';
  const cap = menuRowsCap({ card: card.offsetHeight, rows: rowsEl.offsetHeight, room });
  if (cap != null) {
    rowsEl.style.maxHeight = `${cap}px`;
    rowsEl.style.overflowY = 'auto';
  }
  rowsEl.classList.toggle('vm-scroll', cap != null);
  return cap;
}

/** A row that can't be done (now): its reason in the footer, with a shake. */
export function refuseVerbRow(el, row) {
  if (!el || !row) return;
  row.focus?.({ preventScroll: true });
  setDetail(el, row);
  shake(el);
}
