/**
 * Ticket 51 (G404): the windows of a house's storage, DOM only (the rules are
 * js/home-storage.js, the game side features/home-storage-feature.js).
 *
 * - The cabinet's grid (glitch-client CabinetDialog.as): cols x rows slots
 *   (50 x 52, 4 px apart) on shelves, rows_display rows shown and the rest
 *   scrolled, the cabinet's own art beside it, Done under it. A pack stack
 *   dragged over a slot that takes it lights it with "Move Here"
 *   (findDropTarget 571-599: an empty slot, or the same class under its
 *   stackmax); a stack dragged out onto the pack comes out; a stack dragged to
 *   another slot moves. A slot's click opens its Take out row (the verb menu's
 *   count, for touch and keys); a right-click, Shift+F10 or the Menu key on a
 *   full slot opens the same row (RIGHTCLICK, right-click audit later batch item
 *   7: the same as the click, as the pack's stacks do; it never closes it). The window leaves the pack bar uncovered, as
 *   the original's blocker covered only the location.
 * - The Storage Display Box's pricer (set_selling_price: "Price per <name>",
 *   "Quantity: N", Set price), its store (StoreBuyUI.as: the item, "N for
 *   sale", "Price N", "You have N of these.", the count and "Buy: N for X"),
 *   and the count and item choosers its remove and deposit ask with.
 *
 * Modern is the default skin; Classic (:root[data-ui="classic"]) wears the
 * original's dark blocker colour (CabinetDialog blocker 0x213036).
 */

import { bindCountField, countKeyValue, countStepMarkup } from './count-chooser.js?v=893305c8';
import { bindContextTrigger } from './context-menu.js?v=e2993b1c';

const CSS = `
.hst-win { position: fixed; z-index: calc(var(--z-panel) - 1); left: 50%; top: max(64px, 9vh); transform: translateX(-50%);
  max-width: calc(100vw - 24px); max-height: calc(100vh - 230px); display: flex; flex-direction: column; overflow: hidden;
  background: var(--surface-card); color: var(--text); border-radius: var(--radius-2xl); box-shadow: var(--shadow-3);
  border: 1px solid color-mix(in srgb, var(--c-umber-41) 18%, transparent); font-family: var(--font-ui); }
.hst-win[hidden] { display: none; }
.hst-win header { display: flex; align-items: center; gap: var(--sp-4); padding: 9px var(--sp-6) 7px;
  background: linear-gradient(180deg, var(--surface-parchment), var(--c-cream-91)); border-bottom: 1px solid color-mix(in srgb, var(--c-umber-41) 15%, transparent); }
.hst-win header h2 { flex: 1; margin: 0; font-size: var(--fs-lg); font-weight: 800; }
.hst-win header small { color: var(--text-muted); font-weight: 700; }
.hst-win .hst-x { border: 0; background: transparent; color: inherit; font-size: var(--fs-2xl); line-height: 1; cursor: pointer; padding: 0 var(--sp-2); }
.hst-body { display: flex; gap: var(--sp-6); align-items: center; padding: var(--sp-6) var(--sp-7); overflow: auto; }
.hst-art { flex: none; width: 96px; display: grid; place-items: center; }
.hst-art img { max-width: 96px; max-height: 150px; image-rendering: auto; }
.hst-grid-wrap { overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
.hst-grid { display: grid; grid-template-columns: repeat(var(--cols), 50px); column-gap: 4px; row-gap: 18px; padding: 8px 18px 12px; }
.hst-shelf { grid-column: 1 / -1; height: 0; }
.hst-slot { position: relative; width: 50px; height: 52px; box-sizing: border-box; border-radius: var(--radius-md); display: grid; place-items: center;
  background: color-mix(in srgb, var(--surface-sunken) 75%, transparent); border: 2px solid transparent; padding: 0; cursor: default; font: inherit; color: inherit; }
.hst-slot::after { content: ''; position: absolute; left: -4px; right: -4px; bottom: -9px; height: 5px; border-radius: var(--radius-xs);
  background: linear-gradient(180deg, color-mix(in srgb, var(--c-brown-43) 65%, var(--c-cream-91)), var(--c-brown-43)); box-shadow: var(--shadow-1); }
.hst-slot.is-full { cursor: grab; background: var(--surface-bright); }
.hst-slot img { width: 40px; height: 40px; object-fit: contain; pointer-events: none; }
.hst-slot b { position: absolute; right: 3px; bottom: 1px; font-size: var(--fs-xs); font-weight: 800; color: var(--text-inverse); text-shadow: 0 0 3px var(--c-sand-30), 0 0 2px var(--c-sand-30); pointer-events: none; }
.hst-slot .hst-wear { position: absolute; left: 6px; right: 6px; bottom: 3px; height: 3px; border-radius: var(--radius-xs); background: color-mix(in srgb, var(--c-sand-30) 20%, transparent); pointer-events: none; }
.hst-slot .hst-wear i { display: block; height: 100%; border-radius: var(--radius-xs); background: var(--c-lime-80); }
.hst-slot.is-over { border-color: var(--c-green-83); background: color-mix(in srgb, var(--c-green-83) 22%, var(--surface-bright)); }
.hst-slot.is-no { border-color: var(--text-danger); }
.hst-slot.is-picked { border-color: var(--c-orange-69); }
.hst-slot:focus-visible { outline: 3px solid var(--c-orange-69); outline-offset: 1px; }
.hst-tip { position: fixed; z-index: var(--z-notice); pointer-events: none; padding: 3px var(--sp-4); border-radius: var(--radius-md); font: 700 var(--fs-sm) var(--font-ui);
  background: var(--c-sand-30); color: var(--text-inverse); transform: translate(-50%, -140%); white-space: nowrap; }
.hst-tip[hidden] { display: none; }
.hst-foot { display: flex; flex-wrap: wrap; gap: var(--sp-4); align-items: center; justify-content: space-between; padding: var(--sp-4) var(--sp-7) var(--sp-6);
  border-top: 1px solid color-mix(in srgb, var(--c-umber-41) 12%, transparent); }
.hst-foot .hst-note { flex: 1 1 12rem; margin: 0; min-height: 1.2em; color: var(--text-muted); font-size: var(--fs-sm); font-weight: 700; }
.hst-foot .hst-note.is-bad { color: var(--text-danger); }
.hst-pick { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-4); padding: var(--sp-4) var(--sp-7); background: var(--surface-parchment); }
.hst-pick[hidden] { display: none; }
.hst-pick img { width: 32px; height: 32px; object-fit: contain; }
.hst-pick .hst-pick-name { font-weight: 800; }
.hst-btn { font: inherit; font-weight: 800; border: 1px solid color-mix(in srgb, var(--c-umber-41) 25%, transparent); border-radius: var(--radius-pill);
  padding: var(--sp-3) var(--sp-8); background: var(--surface-raised); color: var(--text); cursor: pointer; }
.hst-btn:disabled { opacity: .55; cursor: default; }
.hst-btn.btn-glitch-primary { background: var(--surface-moss); color: var(--text-moss); border-color: color-mix(in srgb, var(--text-moss) 30%, transparent); }
.hst-btn.btn-glitch-primary:not(:disabled):hover { filter: brightness(1.05); }
.hst-dialog { width: min(24rem, calc(100vw - 24px)); }
.hst-dialog .hst-body { display: block; padding: var(--sp-6) var(--sp-7); }
.hst-dialog .hst-sub { margin: 0 0 var(--sp-4); color: var(--text-muted); font-weight: 700; }
.hst-dialog .hst-price-row { display: flex; align-items: center; gap: var(--sp-3); margin: var(--sp-3) 0; font-weight: 800; }
.hst-dialog .hst-price-row input { width: 9rem; font: inherit; font-weight: 800; padding: 6px 8px; border-radius: var(--radius-md); border: 2px solid var(--c-sand-86); background: var(--surface-bright); color: var(--text); }
.hst-dialog .hst-actions { display: flex; justify-content: flex-end; gap: var(--sp-4); margin-top: var(--sp-6); flex-wrap: wrap; }
.hst-store-item { display: flex; gap: var(--sp-5); align-items: center; }
.hst-store-item img { width: 56px; height: 56px; object-fit: contain; flex: none; }
.hst-store-item h3 { margin: 0; font-size: var(--fs-lg); }
.hst-store-item .hst-count { display: block; color: var(--text-muted); font-weight: 700; font-size: var(--fs-sm); }
.hst-store .hst-price { margin: var(--sp-4) 0 var(--sp-2); font-weight: 800; }
.hst-store .hst-have { margin: 0 0 var(--sp-4); color: var(--text-muted); }
.hst-store .count-pop-step { justify-content: flex-start; margin: var(--sp-3) 0; }
.hst-store .hst-buy { width: 100%; margin-top: var(--sp-3); }
.hst-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-2); max-height: 50vh; overflow: auto; }
.hst-list button { width: 100%; display: flex; align-items: center; gap: var(--sp-4); padding: 6px 10px; text-align: left; font: inherit; font-weight: 700;
  border: 0; border-radius: var(--radius-md); background: var(--surface-parchment); color: inherit; cursor: pointer; }
.hst-list button:hover, .hst-list button:focus-visible { background: var(--surface-hover); }
.hst-list img { width: 28px; height: 28px; object-fit: contain; }
.hst-list .hst-n { margin-left: auto; color: var(--text-muted); }
:root[data-ui="classic"] .hst-win { background: var(--c-navy-30); color: var(--c-grey-94); border-color: var(--c-navy-20); border-radius: 20px; }
:root[data-ui="classic"] .hst-win header { background: var(--c-navy-34b); border-bottom-color: var(--c-navy-20); }
:root[data-ui="classic"] .hst-win header small, :root[data-ui="classic"] .hst-foot .hst-note, :root[data-ui="classic"] .hst-dialog .hst-sub,
:root[data-ui="classic"] .hst-store .hst-have, :root[data-ui="classic"] .hst-store-item .hst-count, :root[data-ui="classic"] .hst-list .hst-n { color: var(--c-grey-87); }
:root[data-ui="classic"] .hst-slot { background: var(--c-navy-34b); }
:root[data-ui="classic"] .hst-slot.is-full { background: color-mix(in srgb, var(--c-navy-34b) 80%, var(--c-grey-94)); }
:root[data-ui="classic"] .hst-pick, :root[data-ui="classic"] .hst-list button { background: var(--c-navy-34b); color: var(--c-grey-94); }
:root[data-ui="classic"] .hst-btn { background: var(--c-grey-94); color: var(--c-navy-30); border-color: var(--c-grey-87); }
:root[data-ui="classic"] .hst-btn.btn-glitch-primary { background: var(--c-lime-80); color: var(--text-inverse); border-color: var(--c-lime-64); }
:root[data-ui="classic"] .hst-dialog .hst-price-row input { background: var(--c-grey-94); color: var(--c-navy-30); }
`;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (text) node.textContent = text;
  return node;
}

function ensureCss() {
  if (document.getElementById('hst-css')) return;
  const style = el('style', { id: 'hst-css' });
  style.textContent = CSS;
  document.head.append(style);
}

let open = null; // the one storage window open now: { kind, root, close }

/** The storage window open now ('cabinet' | 'price' | 'store' | 'count' | 'pick'), or ''. */
export function storageWindowKind() {
  return open?.kind || '';
}

export function closeStorageWindow() {
  open?.close?.();
}

function frame(kind, title, sub, { dialog = true, onClose } = {}) {
  ensureCss();
  closeStorageWindow();
  const root = el('section', { class: `hst-win${dialog ? ' hst-dialog' : ''}`, role: 'dialog', 'aria-label': title, 'data-hst': kind });
  const head = el('header');
  head.append(el('h2', {}, title));
  if (sub) head.append(el('small', {}, sub));
  const x = el('button', { type: 'button', class: 'hst-x', 'aria-label': 'Close', 'data-hst-close': '' }, '×');
  head.append(x);
  root.append(head);
  const host = document.getElementById('game-root') || document.body;
  host.append(root);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handle.close();
    } else if (e.key !== 'Tab') e.stopPropagation();
  };
  root.addEventListener('keydown', onKey);
  const cleanups = [];
  const handle = {
    kind,
    root,
    closed: false,
    onCleanup: (fn) => cleanups.push(fn),
    close() {
      if (handle.closed) return;
      handle.closed = true;
      for (const fn of cleanups) fn();
      root.remove();
      if (open === handle) open = null;
      onClose?.();
    },
  };
  x.addEventListener('click', () => handle.close());
  open = handle;
  return handle;
}

/** A note line under a window (role status): its words, bad when it refuses. */
function noteLine(parent) {
  const p = el('p', { class: 'hst-note', role: 'status' });
  parent.append(p);
  return (text, bad = false) => {
    p.textContent = text || '';
    p.classList.toggle('is-bad', Boolean(bad && text));
  };
}

/**
 * CabinetDialog: the grid. `slots` are null or { classTsid, count, points? };
 * callbacks answer what each gesture does (each may return a promise):
 *   accepts(cls) -> null | words why not      a pack stack may go in here
 *   put({ cls, count, copy, slot })            a pack stack dropped on a slot
 *   take(slot, n)                              a slot's stack (n of it) to the pack
 *   move(from, to)                             a stack dragged to another slot
 *   item(cls) -> { label, plural, icon, wear(points) }
 */
export function openCabinetWindow(opts) {
  const { title, sub = '', art = '', cols, rowsDisplay, item, accepts, put, take, move, onClose } = opts;
  const h = frame('cabinet', title, sub, { dialog: false, onClose });
  const body = el('div', { class: 'hst-body' });
  if (art) {
    const a = el('div', { class: 'hst-art' });
    a.append(el('img', { src: art, alt: '' }));
    body.append(a);
  }
  const wrap = el('div', { class: 'hst-grid-wrap' });
  const grid = el('div', { class: 'hst-grid', role: 'grid', 'aria-label': title, 'data-hst-grid': '' });
  grid.style.setProperty('--cols', String(cols));
  wrap.append(grid);
  body.append(wrap);
  h.root.append(body);
  const pick = el('div', { class: 'hst-pick', hidden: true, 'data-hst-pickrow': '' });
  h.root.append(pick);
  const foot = el('div', { class: 'hst-foot' });
  const note = noteLine(foot);
  const done = el('button', { type: 'button', class: 'hst-btn', 'data-hst-done': '' }, 'Done');
  done.addEventListener('click', () => h.close());
  foot.append(done);
  h.root.append(foot);
  const tip = el('div', { class: 'hst-tip', hidden: true }, opts.moveHere || 'Move Here');
  document.body.append(tip);
  h.onCleanup(() => tip.remove());

  let slots = [];
  let picked = null;
  let packDrag = null; // a pack stack being dragged: { cls, count, copy }
  let slotDrag = null; // a cabinet slot being dragged: index

  // Rows shown at once: rows_display slots tall (52 + 18 apart), the rest scrolled.
  wrap.style.maxHeight = `${rowsDisplay * 52 + (rowsDisplay - 1) * 18 + 24}px`;

  function draw() {
    grid.replaceChildren();
    slots.forEach((s, i) => {
      const b = el('button', { type: 'button', class: `hst-slot${s ? ' is-full' : ''}${picked === i ? ' is-picked' : ''}`, role: 'gridcell', 'data-hst-slot': String(i),
        'aria-label': s ? `${item(s.classTsid).label} × ${s.count}` : `Empty slot ${i + 1}`, draggable: s ? 'true' : 'false' });
      // RIGHTCLICK: a full slot's right-click is the game's (its Take out row), never the browser's.
      if (s) {
        b.dataset.ctx = 'storage';
        b.setAttribute('aria-keyshortcuts', 'Shift+F10');
      }
      if (s) {
        const meta = item(s.classTsid);
        b.append(el('img', { src: meta.icon, alt: '' }));
        if (s.count > 1) b.append(el('b', {}, String(s.count)));
        const wear = meta.wear?.(s.points);
        if (wear != null) {
          const bar = el('span', { class: 'hst-wear' });
          const fill = el('i');
          fill.style.width = `${Math.round(wear * 100)}%`;
          bar.append(fill);
          b.append(bar);
        }
        b.dataset.cls = s.classTsid;
      }
      grid.append(b);
    });
    drawPick();
  }

  function drawPick() {
    pick.replaceChildren();
    const s = picked != null ? slots[picked] : null;
    // QA: the slot whose Take out row shows ('' for none).
    h.root.dataset.hstPicked = s ? String(picked) : '';
    if (!s) {
      pick.hidden = true;
      return;
    }
    pick.hidden = false;
    const meta = item(s.classTsid);
    let n = s.count;
    const render = () => {
      pick.replaceChildren();
      pick.append(el('img', { src: meta.icon, alt: '' }), el('span', { class: 'hst-pick-name' }, `${meta.label} × ${s.count}`));
      if (s.count > 1) {
        const step = el('div', { class: 'count-pop' });
        step.innerHTML = countStepMarkup({ value: n, max: s.count, verb: 'Take out', attrs: { dec: 'data-hst-dec', inc: 'data-hst-inc', num: 'data-hst-num', max: 'data-hst-max' } });
        pick.append(step);
        step.querySelector('[data-hst-dec]')?.addEventListener('click', () => { n = Math.max(1, n - 1); render(); });
        step.querySelector('[data-hst-inc]')?.addEventListener('click', () => { n = Math.min(s.count, n + 1); render(); });
        step.querySelector('[data-hst-max]')?.addEventListener('click', () => { n = s.count; render(); });
        bindCountField(step.querySelector('[data-hst-num]'), { max: () => s.count, set: (v) => { n = v; render(); }, confirm: (v) => { n = v; go(); }, cancel: () => { picked = null; draw(); } });
      }
      const out = el('button', { type: 'button', class: 'hst-btn btn-glitch-primary', 'data-hst-take': '' }, opts.takeLabel || 'Take out');
      out.addEventListener('click', () => go());
      pick.append(out);
    };
    const go = async () => {
      const at = picked;
      picked = null;
      await take(at, n);
    };
    render();
  }

  // —— Dragging from the pack (game.js pack slots are HTML5 drags with their class and count on the slot) ——
  const onDragStart = (e) => {
    const slot = e.target?.closest?.('.pack-slot');
    if (!slot || !slot.dataset.tsid || h.root.contains(slot)) return;
    packDrag = { cls: slot.dataset.tsid, count: Math.max(1, Math.floor(Number(slot.dataset.packCount) || 1)), copy: slot.dataset.packCopy != null ? Number(slot.dataset.packCopy) : null, bag: slot.dataset.packBag || '' };
  };
  const onDragEnd = () => {
    packDrag = null;
    slotDrag = null;
    tip.hidden = true;
    for (const b of grid.querySelectorAll('.is-over, .is-no')) b.classList.remove('is-over', 'is-no');
  };
  document.addEventListener('dragstart', onDragStart, true);
  document.addEventListener('dragend', onDragEnd, true);
  h.onCleanup(() => {
    document.removeEventListener('dragstart', onDragStart, true);
    document.removeEventListener('dragend', onDragEnd, true);
  });

  /** findDropTarget: an empty slot, or the same class under its stackmax. */
  function slotTakes(i, cls) {
    const s = slots[i];
    if (!s) return true;
    return s.classTsid === cls && s.count < (opts.stackmax?.(cls) ?? Infinity);
  }

  grid.addEventListener('dragover', (e) => {
    const b = e.target?.closest?.('[data-hst-slot]');
    for (const x of grid.querySelectorAll('.is-over, .is-no')) if (x !== b) x.classList.remove('is-over', 'is-no');
    if (!b) return;
    const i = Number(b.dataset.hstSlot);
    let ok = false;
    let why = '';
    if (packDrag) {
      why = accepts(packDrag.cls) || '';
      ok = !why && slotTakes(i, packDrag.cls);
    } else if (slotDrag != null) ok = i !== slotDrag;
    else return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = ok ? 'move' : 'none';
    b.classList.toggle('is-over', ok);
    b.classList.toggle('is-no', !ok && Boolean(packDrag));
    tip.textContent = ok ? (opts.moveHere || 'Move Here') : why;
    tip.hidden = !tip.textContent;
    tip.style.left = `${e.clientX}px`;
    tip.style.top = `${e.clientY}px`;
  });
  grid.addEventListener('dragleave', (e) => {
    if (!grid.contains(e.relatedTarget)) tip.hidden = true;
  });
  grid.addEventListener('drop', async (e) => {
    const b = e.target?.closest?.('[data-hst-slot]');
    if (!b) return;
    e.preventDefault();
    const i = Number(b.dataset.hstSlot);
    const was = packDrag;
    const from = slotDrag;
    onDragEnd();
    if (was) {
      const why = accepts(was.cls);
      if (why) return note(why, true);
      if (!slotTakes(i, was.cls)) return undefined;
      await put({ ...was, slot: i });
    } else if (from != null && from !== i) await move(from, i);
    return undefined;
  });

  // —— Dragging a slot out (onto the pack: it comes out) or to another slot ——
  grid.addEventListener('dragstart', (e) => {
    const b = e.target?.closest?.('[data-hst-slot]');
    if (!b || !slots[Number(b.dataset.hstSlot)]) return;
    e.stopPropagation();
    slotDrag = Number(b.dataset.hstSlot);
    packDrag = null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-groddle-cabinet', String(slotDrag));
      e.dataTransfer.setData('text/plain', b.dataset.cls || '');
    }
  });
  const packBar = () => document.getElementById('pack-bar');
  const onPackOver = (e) => {
    if (slotDrag == null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  };
  const onPackDrop = async (e) => {
    if (slotDrag == null) return;
    e.preventDefault();
    e.stopPropagation();
    const at = slotDrag;
    onDragEnd();
    await take(at, slots[at]?.count || 0);
  };
  const bar = packBar();
  bar?.addEventListener('dragover', onPackOver, true);
  bar?.addEventListener('drop', onPackDrop, true);
  h.onCleanup(() => {
    bar?.removeEventListener('dragover', onPackOver, true);
    bar?.removeEventListener('drop', onPackDrop, true);
  });

  grid.addEventListener('click', (e) => {
    const b = e.target?.closest?.('[data-hst-slot]');
    if (!b) return;
    const i = Number(b.dataset.hstSlot);
    picked = slots[i] && picked !== i ? i : null;
    draw();
    if (picked != null) pick.querySelector('[data-hst-take]')?.focus({ preventScroll: true });
  });
  // RIGHTCLICK: a right-click (Shift+F10, the Menu key) on a full slot opens its Take out row, as a
  // click does, and leaves it open when it already is.
  bindContextTrigger(grid, {
    rowOf: (t) => {
      const b = t?.closest?.('[data-hst-slot]');
      return b && slots[Number(b.getAttribute('data-hst-slot'))] ? b : null;
    },
    open: (b) => {
      picked = Number(b.getAttribute('data-hst-slot'));
      draw();
      pick.querySelector('[data-hst-take]')?.focus({ preventScroll: true });
    },
  });
  grid.addEventListener('keydown', (e) => {
    const b = e.target?.closest?.('[data-hst-slot]');
    if (!b) return;
    const i = Number(b.dataset.hstSlot);
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (step) {
      e.preventDefault();
      e.stopPropagation();
      const next = grid.querySelector(`[data-hst-slot="${Math.max(0, Math.min(slots.length - 1, i + step))}"]`);
      next?.focus();
    }
  });

  h.update = (next, text = '', bad = false) => {
    slots = Array.isArray(next) ? next : [];
    if (picked != null && !slots[picked]) picked = null;
    draw();
    note(text, bad);
  };
  h.note = note;
  h.update(opts.slots);
  setTimeout(() => grid.querySelector('.hst-slot')?.focus({ preventScroll: true }), 0);
  return h;
}

/** set_selling_price's input (bag_furniture_sdb.js 241-260): Price per <name>, Quantity, Set price. */
export function openPriceDialog({ title, single, qty, value, help = '', submit = 'Set price', cancel = 'Cancel', onSet, onClose }) {
  const h = frame('price', title, '', { onClose });
  const body = el('div', { class: 'hst-body' });
  body.append(el('p', { class: 'hst-sub' }, qty));
  const row = el('label', { class: 'hst-price-row' });
  const input = el('input', { type: 'text', inputmode: 'numeric', maxlength: '7', 'aria-label': single, 'data-hst-price': '' });
  input.value = String(value ?? 1);
  input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, '').slice(0, 7); });
  row.append(input, document.createTextNode('currants'));
  body.append(row);
  if (help) body.append(el('p', { class: 'hst-sub' }, help));
  const foot = el('div', { class: 'hst-actions' });
  const no = el('button', { type: 'button', class: 'hst-btn' }, cancel);
  no.addEventListener('click', () => h.close());
  const ok = el('button', { type: 'button', class: 'hst-btn btn-glitch-primary', 'data-hst-setprice': '' }, submit);
  const note = noteLine(body);
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    const why = await onSet(input.value);
    ok.disabled = false;
    if (why) note(why, true);
    else h.close();
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
  foot.append(no, ok);
  body.append(foot);
  h.root.append(body);
  setTimeout(() => { input.focus(); input.select(); }, 0);
  return h;
}

/**
 * The store window for one box (StoreBuyUI.as): `item` { label, plural, icon,
 * cost, count }, `have` how many the buyer holds, `max()` the most they can
 * buy now (their currants, the stock, their pack). onBuy(n) answers the words
 * to show, or '' when it went through.
 */
export function openStoreDialog({ title, sub = '', item, have, max, text, onBuy, onClose }) {
  const h = frame('store', title, sub, { onClose });
  h.root.classList.add('hst-store');
  const body = el('div', { class: 'hst-body' });
  h.root.append(body);
  let n = 1;
  let busy = false;
  let cur = { ...item };
  let say = null;
  function render(msg = '', bad = false) {
    body.replaceChildren();
    const top = el('div', { class: 'hst-store-item' });
    top.append(el('img', { src: cur.icon, alt: '' }));
    const name = el('div');
    name.append(el('h3', {}, cur.label));
    name.append(el('span', { class: 'hst-count', 'data-hst-stock': String(cur.count) }, text.forSaleCount(cur.count)));
    top.append(name);
    body.append(top);
    body.append(el('p', { class: 'hst-price', 'data-hst-cost': String(cur.cost) }, `${text.priceEach(cur.cost)} ◎`));
    body.append(el('p', { class: 'hst-have' }, text.youHave(have())));
    const most = max(cur);
    n = Math.max(1, Math.min(n, Math.max(1, most)));
    const step = el('div', { class: 'count-pop' });
    step.innerHTML = countStepMarkup({ value: n, max: Math.max(1, most), verb: 'Buy', attrs: { dec: 'data-hst-dec', inc: 'data-hst-inc', num: 'data-hst-num', max: 'data-hst-max' } });
    body.append(step);
    const buy = el('button', { type: 'button', class: 'hst-btn btn-glitch-primary hst-buy', 'data-hst-buy': '' }, text.buyButton(n, n * cur.cost));
    buy.disabled = busy || most < 1;
    if (most < 1) buy.title = cur.count < 1 ? text.allOut : text.notEnough;
    body.append(buy);
    const p = el('p', { class: 'hst-note', role: 'status' });
    body.append(p);
    say = (t, b) => {
      p.textContent = t || (most < 1 ? (cur.count < 1 ? text.allOut : text.notEnough) : '');
      p.classList.toggle('is-bad', Boolean(b || (!t && most < 1)));
    };
    say(msg, bad);
    const set = (v) => { n = Math.max(1, Math.min(Math.max(1, most), v)); render(); };
    step.querySelector('[data-hst-dec]')?.addEventListener('click', () => set(n - 1));
    step.querySelector('[data-hst-inc]')?.addEventListener('click', () => set(n + 1));
    step.querySelector('[data-hst-max]')?.addEventListener('click', () => set(most));
    bindCountField(step.querySelector('[data-hst-num]'), { max: () => Math.max(1, most), set, confirm: (v) => { set(v); body.querySelector('[data-hst-buy]')?.click(); }, cancel: () => h.close() });
    body.onkeydown = (e) => {
      if (e.target?.matches?.('[data-hst-num]')) return;
      const next = countKeyValue(e.key, n, Math.max(1, most));
      if (next != null) {
        e.preventDefault();
        set(next);
      }
    };
    buy.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      render();
      const why = await onBuy(n, cur);
      busy = false;
      render(why || '', Boolean(why));
    });
  }
  h.update = (next, msg = '', bad = false) => {
    cur = { ...cur, ...next };
    render(msg, bad);
  };
  h.say = (t, bad) => say?.(t, bad);
  h.item = () => cur;
  render();
  setTimeout(() => body.querySelector('[data-hst-buy]')?.focus({ preventScroll: true }), 0);
  return h;
}

/** The verb menu's How many (InteractionMenuController.as 1352-1355: "Remove how many Apples?"). */
export function openCountDialog({ title, icon = '', label = '', max, value = null, verb, onOk, onClose }) {
  const h = frame('count', title, '', { onClose });
  const body = el('div', { class: 'hst-body' });
  h.root.append(body);
  let n = Math.max(1, Math.min(max, value ?? max));
  function render() {
    body.replaceChildren();
    if (icon || label) {
      const top = el('div', { class: 'hst-store-item' });
      if (icon) top.append(el('img', { src: icon, alt: '' }));
      if (label) top.append(el('h3', {}, label));
      body.append(top);
    }
    const step = el('div', { class: 'count-pop' });
    step.innerHTML = countStepMarkup({ value: n, max, verb, attrs: { dec: 'data-hst-dec', inc: 'data-hst-inc', num: 'data-hst-num', max: 'data-hst-max' } });
    body.append(step);
    const ok = el('button', { type: 'button', class: 'hst-btn btn-glitch-primary hst-buy', 'data-hst-ok': '' }, `${verb} ${n}`);
    body.append(ok);
    const set = (v) => { n = Math.max(1, Math.min(max, v)); render(); };
    step.querySelector('[data-hst-dec]')?.addEventListener('click', () => set(n - 1));
    step.querySelector('[data-hst-inc]')?.addEventListener('click', () => set(n + 1));
    step.querySelector('[data-hst-max]')?.addEventListener('click', () => set(max));
    bindCountField(step.querySelector('[data-hst-num]'), { max: () => max, set, confirm: (v) => { n = Math.max(1, Math.min(max, v)); go(); }, cancel: () => h.close() });
    ok.addEventListener('click', () => go());
  }
  const go = () => {
    h.close();
    onOk(n);
  };
  render();
  setTimeout(() => body.querySelector('[data-hst-ok]')?.focus({ preventScroll: true }), 0);
  return h;
}

/** deposit's valid_items (bag_furniture_sdb.js 672-710): which pack item goes in. */
export function openPickDialog({ title, items, onPick, onClose }) {
  const h = frame('pick', title, '', { onClose });
  const body = el('div', { class: 'hst-body' });
  const ul = el('ul', { class: 'hst-list', 'data-hst-items': '' });
  for (const it of items) {
    const li = el('li');
    const b = el('button', { type: 'button', 'data-hst-item': it.cls });
    b.append(el('img', { src: it.icon, alt: '' }), el('span', {}, it.label), el('span', { class: 'hst-n' }, `× ${it.count}`));
    b.addEventListener('click', () => {
      h.close();
      onPick(it.cls);
    });
    li.append(b);
    ul.append(li);
  }
  body.append(ul);
  h.root.append(body);
  setTimeout(() => ul.querySelector('button')?.focus({ preventScroll: true }), 0);
  return h;
}
