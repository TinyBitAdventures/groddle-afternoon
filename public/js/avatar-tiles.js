/**
 * Picture tiles for the character builder's parts (Austin 2026-11-12), after
 * the 2012 Vanity page's features pane (glitch-client FeaturesVanityTabPane.as,
 * AbstractVanityTabPane.as, FeatureVanityButton.as): each option is a square
 * button showing the part, the worn one ringed, the name as its tooltip, and a
 * "none" button where a part may be left off.
 *
 * Vanity drew each option from the article's own clip (fillButton: the part
 * alone, hair at 0.4 scale, hair and ears tinted with the player's colours) and
 * laid the buttons out in a grid set by its vanity_layout CSS
 * (features_pane_per_page / _cols / _rows, a 347 x 288 pane under the tabs; the
 * CSS is not in the archive, and the shipped AbstractVanityTabPane put every
 * button on page 0 under the pane's mask, so the 2012 page count is unknown).
 * The remake pages them TILE_PAGE at a time with Previous / Next under the
 * grid, and draws each tile from the vector pipeline (js/avatar-compositor.js)
 * as the part on the player's own look, zoomed to the part, so skin and hair
 * colours read as they would be worn.
 *
 * Tiles paint lazily: only the page on screen asks, each look is prepared a few
 * at a time and painted within a few milliseconds a frame, and finished pictures
 * are kept (TILE_CACHE_MAX) so paging back, or picking within a page, redraws
 * from memory. While a tile's look changes (a new hair colour), it keeps its
 * last picture until the new one is ready.
 */
import { drawListFor, paintItems, prepareLook } from './avatar-compositor.js?v=8b20791a';
import { drawListBounds } from './avatar-rig.js?v=b67f0da8';
import { lookKey, resolveLook } from './avatar-looks.js?v=76eb9653';

/** Tiles on a page (six across, two down in Classic; four across, three down in Modern). */
export const TILE_PAGE = 12;
/** Finished tile pictures kept for redraws. */
export const TILE_CACHE_MAX = 180;
/** The standing frame the mirror shows at rest. */
export const TILE_FRAME = 801;
/** Types a look may go without: their first tile is None (Vanity's "none" button). */
export const NONE_TYPES = Object.freeze(['hat', 'coat', 'dress', 'skirt', 'nose', 'ears']);
/** Face parts and hair are drawn bare-headed, a top without its coat. */
const HATLESS = new Set(['hair', 'eyes', 'mouth', 'nose', 'ears']);
const COATLESS = new Set(['shirt', 'dress', 'pants', 'skirt']);
/**
 * The smallest square (rig units; a Glitch stands about 120 tall) each part is
 * framed in, so a small part shows with a little of the face round it.
 */
export const TILE_MIN_SPAN = Object.freeze({ eyes: 30, mouth: 30, nose: 28, ears: 36, hair: 48, hat: 44, shoes: 30 });

/**
 * Wear `name` as the look's `type`, dropping what it cannot be worn with
 * (a dress replaces top and trousers; a skirt replaces trousers; AvatarSwf:
 * skirt excludes dress). A new article starts in its first colourway.
 * Mutates and returns `v` (saved vector fields).
 */
export function pickPart(v, type, name) {
  v.outfit = v.outfit || {};
  v.outfit[type] = name;
  if (v.variant) delete v.variant[type];
  if (v.tint) delete v.tint[type];
  if (type === 'dress' && name !== 'none') { v.outfit.skirt = 'none'; v.outfit.pants = 'none'; v.outfit.shirt = 'none'; }
  if (type === 'skirt' && name !== 'none') { v.outfit.pants = 'none'; v.outfit.dress = 'none'; }
  if ((type === 'shirt' || type === 'pants') && name !== 'none') v.outfit.dress = 'none';
  if (type === 'pants' && name !== 'none') v.outfit.skirt = 'none';
  return v;
}

const clone = (v) => JSON.parse(JSON.stringify(v || {}));

/**
 * The saved fields a tile draws: the player's look wearing `name`, the worn
 * one in its chosen colours, without a hat over a face part or hair and
 * without a coat over a top or trousers.
 */
export function tileFields(vector, type, name, worn) {
  const v = clone(vector);
  if (name !== worn) pickPart(v, type, name);
  v.outfit = v.outfit || {};
  if (HATLESS.has(type)) v.outfit.hat = 'none';
  if (COATLESS.has(type)) v.outfit.coat = 'none';
  return v;
}

/** The resolved look and its cache key for one tile at `px` device pixels. */
export function tileJob(vector, type, name, worn, catalog, px) {
  const look = resolveLook(tileFields(vector, type, name, worn), catalog);
  return { type, name, px, look, key: `${type}:${name}@${px}|${lookKey(look)}`, family: `${type}:${name}@${px}` };
}

/** Pages for n tiles (at least one). */
export const pageCount = (n, per = TILE_PAGE) => Math.max(1, Math.ceil(n / per));

/** Options matching a search (label or article name), None kept only with no search. */
export function filterOptions(options, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return options;
  return options.filter((o) => o.name !== 'none' && (String(o.label || '').toLowerCase().includes(s) || String(o.name).toLowerCase().includes(s)));
}

/**
 * Which page to show: the asked one in range, or (when the worn part changed
 * since the last draw, as Random, Reset or a preset do) the page holding it.
 * state: { q, page, seen }, kept per type by the caller.
 */
export function pageFor(state, list, worn, per = TILE_PAGE) {
  const pages = pageCount(list.length, per);
  if (state.seen !== worn || state.page == null) {
    const i = list.findIndex((o) => o.name === worn);
    if (i >= 0) state.page = Math.floor(i / per);
    state.seen = worn;
  }
  state.page = Math.max(0, Math.min(pages - 1, Number(state.page) || 0));
  return state.page;
}

/** Flatten a draw list to the plain items one source painted (for its bounds). */
export function itemsOf(items, src, out = []) {
  for (const it of items) {
    if (it.items) itemsOf(it.items, src, out);
    else if (it.src === src) out.push(it);
  }
  return out;
}

/**
 * The square a tile shows (rig units): the part's bounds, at least
 * TILE_MIN_SPAN wide, with a little room round it; the whole look when the
 * part draws nothing.
 */
export function tileFrame(partBounds, lookBounds, type) {
  const b = partBounds || lookBounds || [-40, -120, 40, 0];
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  const span = Math.max(b[2] - b[0], b[3] - b[1], TILE_MIN_SPAN[type] || 0) * 1.14;
  return [cx - span / 2, cy - span / 2, span];
}

/** Paint a prepared look into a square canvas, framed on its `name` part. */
export function paintTile(prep, canvas, type, name) {
  const items = drawListFor(prep, TILE_FRAME);
  const part = drawListBounds(itemsOf(items, name), prep.shapeOf);
  const [x, y, span] = tileFrame(part, part ? null : drawListBounds(items, prep.shapeOf), type);
  const w = canvas.width;
  const s = w / span;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, canvas.height);
  paintItems(ctx, items, prep.sources, [s, 0, 0, s, -x * s, -y * s]);
  return canvas;
}

/**
 * The tile painter: request(canvas, job) shows the finished picture now when
 * it is kept, else the tile's last one, and queues the job. Looks are
 * prepared `concurrency` at a time; paints run on animation frames within
 * `budgetMs` (at least one a frame). A canvas taken off the page is skipped.
 */
export function createTileArt({
  prepare = prepareLook,
  paint = paintTile,
  frame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16)),
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  makeCanvas = (px) => Object.assign(document.createElement('canvas'), { width: px, height: px }),
  budgetMs = 6,
  concurrency = 3,
  max = TILE_CACHE_MAX,
  onError = (err) => console.warn('avatar tile failed', err),
} = {}) {
  const done = new Map(); // key -> canvas, oldest first
  const last = new Map(); // family -> canvas (the latest picture of a tile, any look)
  const waiting = []; // { canvas, job } still to prepare
  const ready = []; // { canvas, job, prep } to paint
  const pending = new Map(); // key -> [canvas...] asked while it was being made
  let preparing = 0;
  let pumping = false;
  const stats = { painted: 0, hits: 0, longestMs: 0, frames: 0 };

  const live = (canvas) => canvas && canvas.isConnected !== false;
  const blit = (canvas, src, state) => {
    if (canvas.width !== src.width) { canvas.width = src.width; canvas.height = src.height; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0);
    if (canvas.dataset) canvas.dataset.art = state;
  };
  const keep = (job, pic) => {
    done.delete(job.key);
    done.set(job.key, pic);
    last.set(job.family, pic);
    while (done.size > max) {
      const [k, old] = done.entries().next().value;
      done.delete(k);
      for (const [f, p] of last) if (p === old) last.delete(f);
    }
  };
  const settle = (key, fn) => {
    const list = pending.get(key) || [];
    pending.delete(key);
    for (const c of list) fn(c);
  };
  const pump = () => {
    pumping = false;
    stats.frames += 1;
    const t0 = now();
    while (ready.length) {
      const { job, prep } = ready.shift();
      if (done.has(job.key)) { settle(job.key, (c) => live(c) && blit(c, done.get(job.key), 'ready')); continue; }
      if (!(pending.get(job.key) || []).some(live)) { pending.delete(job.key); continue; }
      const t = now();
      try {
        const pic = paint(prep, makeCanvas(job.px), job.type, job.name);
        stats.longestMs = Math.max(stats.longestMs, now() - t);
        stats.painted += 1;
        keep(job, pic);
        settle(job.key, (c) => live(c) && blit(c, pic, 'ready'));
      } catch (err) {
        settle(job.key, () => {});
        onError(err);
      }
      if (now() - t0 >= budgetMs) break;
    }
    if (ready.length) schedule();
  };
  const schedule = () => {
    if (pumping) return;
    pumping = true;
    frame(pump);
  };
  const next = () => {
    while (preparing < concurrency && waiting.length) {
      const job = waiting.shift();
      if (!(pending.get(job.key) || []).some(live)) { pending.delete(job.key); continue; }
      preparing += 1;
      Promise.resolve()
        .then(() => prepare(job.look))
        .then((prep) => { ready.push({ job, prep }); schedule(); })
        .catch((err) => { settle(job.key, () => {}); onError(err); })
        .finally(() => { preparing -= 1; next(); });
    }
  };

  return {
    stats,
    /** Show `job` in `canvas` (now when kept, else soon). Returns 'ready', 'stale' or 'queued'. */
    request(canvas, job) {
      const hit = done.get(job.key);
      if (hit) {
        done.delete(job.key);
        done.set(job.key, hit);
        stats.hits += 1;
        blit(canvas, hit, 'ready');
        return 'ready';
      }
      const old = last.get(job.family);
      if (old) blit(canvas, old, 'stale');
      else if (canvas.dataset) canvas.dataset.art = 'queued';
      const list = pending.get(job.key);
      if (list) { list.push(canvas); return old ? 'stale' : 'queued'; }
      pending.set(job.key, [canvas]);
      waiting.push(job);
      next();
      return old ? 'stale' : 'queued';
    },
    /** Pictures kept (for tests and the QA hook). */
    get size() { return done.size; },
    has: (key) => done.has(key),
    clear() { done.clear(); last.clear(); },
  };
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

/**
 * One part's tiles: the search (long lists), the page of tiles, the name of
 * the one pointed at (else the worn one), and Previous / Next. Each tile is a
 * button.avatar-style-chip.avatar-tile with data-type and data-name (the QA
 * and Reimagined hooks the name chips had), its label as title and
 * aria-label, aria-pressed on the worn one.
 *
 * Keys: arrows move between tiles (past the edge of a page, onto the next
 * one), Home / End jump within the page, Page Up / Page Down turn pages,
 * Enter or Space wears the tile.
 *
 * @param {HTMLElement} box  #avatar-swatches
 * @param {{ type: string, title: string, options: { name: string, label: string }[], worn: string,
 *   state: { q?: string, page?: number, seen?: string }, onPick: (name: string) => void,
 *   draw: (canvas: HTMLCanvasElement, name: string, cssPx: number) => void, per?: number }} opts
 * @returns {HTMLElement} the tile grid (.avatar-style-row)
 */
export function renderPartTiles(box, { type, title, options, worn, state, onPick, draw, per = TILE_PAGE }) {
  const wrap = el('div', 'avatar-tiles');
  wrap.dataset.type = type;
  let search = null;
  if (options.length > per) {
    search = el('input', 'avatar-search');
    search.type = 'search';
    search.placeholder = `Search ${options.filter((o) => o.name !== 'none').length} ${title.toLowerCase()} styles`;
    search.setAttribute('aria-label', `Search ${title.toLowerCase()} styles`);
    search.value = state.q || '';
    search.dataset.type = type;
    wrap.appendChild(search);
  }
  const row = el('div', 'avatar-style-row avatar-tile-row');
  row.dataset.type = type;
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', `${title} styles`);
  const caption = el('p', 'avatar-tile-caption');
  caption.setAttribute('aria-hidden', 'true');
  const empty = el('p', 'avatar-note', 'No style matches that.');
  const pager = el('div', 'avatar-pager');
  pager.dataset.type = type;
  const prev = button('avatar-page-btn avatar-page-prev', '‹');
  prev.setAttribute('aria-label', `Previous ${title.toLowerCase()} page`);
  const label = el('span', 'avatar-page-label');
  label.setAttribute('aria-live', 'polite');
  const nextBtn = button('avatar-page-btn avatar-page-next', '›');
  nextBtn.setAttribute('aria-label', `Next ${title.toLowerCase()} page`);
  pager.append(prev, label, nextBtn);
  wrap.append(row, caption, empty, pager);
  box.appendChild(wrap);

  const wornLabel = options.find((o) => o.name === worn)?.label || '';
  const say = (text) => { caption.textContent = text || wornLabel; };
  let list = filterOptions(options, state.q);

  const fill = (focusIndex = null) => {
    list = filterOptions(options, state.q);
    const pages = pageCount(list.length, per);
    const page = pageFor(state, list, worn, per);
    row.innerHTML = '';
    const shown = list.slice(page * per, page * per + per);
    shown.forEach((o, i) => {
      const tile = button('avatar-style-chip avatar-tile');
      tile.dataset.type = type;
      tile.dataset.name = o.name;
      tile.dataset.index = String(i);
      tile.title = o.label;
      tile.setAttribute('aria-label', o.label);
      const on = o.name === worn;
      tile.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) tile.classList.add('active');
      tile.tabIndex = -1;
      if (o.name === 'none') {
        tile.classList.add('avatar-tile-none');
        tile.appendChild(el('span', 'avatar-tile-none-label', 'none'));
      } else {
        const art = el('canvas', 'avatar-tile-art');
        art.width = 2;
        art.height = 2;
        art.setAttribute('aria-hidden', 'true');
        tile.appendChild(art);
      }
      tile.addEventListener('click', () => onPick(o.name));
      tile.addEventListener('pointerenter', () => say(o.label));
      tile.addEventListener('pointerleave', () => say(''));
      tile.addEventListener('focus', () => say(o.label));
      tile.addEventListener('blur', () => say(''));
      row.appendChild(tile);
    });
    // One tile in the tab order: the worn one on this page, else the first.
    const tiles = [...row.children];
    const home = tiles.find((t) => t.classList.contains('active')) || tiles[0];
    if (home) home.tabIndex = 0;
    // Paint once layout knows the tile size (measured once a page); only this page asks.
    let cssPx = 0;
    for (const tile of tiles) {
      const art = tile.querySelector('canvas');
      if (!art) continue;
      cssPx ||= Math.round(art.clientWidth || tile.clientWidth || 56);
      draw(art, tile.dataset.name, cssPx);
    }
    row.dataset.shown = String(shown.length);
    row.dataset.page = String(page);
    row.dataset.pages = String(pages);
    label.textContent = `${page + 1} / ${pages}`;
    prev.disabled = page <= 0;
    nextBtn.disabled = page >= pages - 1;
    pager.hidden = pages < 2;
    empty.hidden = list.length > 0;
    say('');
    if (focusIndex != null && tiles.length) {
      const t = tiles[Math.max(0, Math.min(tiles.length - 1, focusIndex))];
      for (const x of tiles) x.tabIndex = -1;
      t.tabIndex = 0;
      t.focus();
    }
  };
  const turn = (delta, focusIndex = null) => {
    const pages = pageCount(list.length, per);
    const to = Math.max(0, Math.min(pages - 1, (state.page || 0) + delta));
    if (to === state.page) return false;
    state.page = to;
    fill(focusIndex);
    return true;
  };
  prev.addEventListener('click', () => turn(-1));
  nextBtn.addEventListener('click', () => turn(1));
  search?.addEventListener('input', () => {
    state.q = search.value;
    state.page = 0;
    fill();
  });
  row.addEventListener('keydown', (e) => {
    const tiles = [...row.children];
    const i = tiles.indexOf(e.target);
    if (i < 0) return;
    // Tiles across, from the grid as laid out (the interfaces set different columns).
    const tpl = typeof getComputedStyle === 'function' ? getComputedStyle(row).gridTemplateColumns : '';
    const across = Math.max(1, tpl && tpl !== 'none' ? tpl.trim().split(/\s+/).length : 1);
    let to = null;
    if (e.key === 'ArrowRight') to = i + 1;
    else if (e.key === 'ArrowLeft') to = i - 1;
    else if (e.key === 'ArrowDown') to = i + across;
    else if (e.key === 'ArrowUp') to = i - across;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tiles.length - 1;
    else if (e.key === 'PageDown') { e.preventDefault(); turn(1, 0); return; }
    else if (e.key === 'PageUp') { e.preventDefault(); turn(-1, 0); return; }
    else return;
    e.preventDefault();
    // Past the page's end or start: on to the next or previous page.
    if (to >= tiles.length) { if (turn(1, 0)) return; to = tiles.length - 1; }
    if (to < 0) { if (turn(-1, per - 1)) return; to = 0; }
    for (const t of tiles) t.tabIndex = -1;
    tiles[to].tabIndex = 0;
    tiles[to].focus();
  });
  fill();
  return row;
}

/**
 * The part switch for a tab holding more than one (Face: Eyes, Nose, Mouth,
 * Ears, in Vanity's tab order, feature_tabs_sortA; Top: Top, Dress; Bottom:
 * Trousers, Skirt), one part's tiles shown at a time.
 * @param {HTMLElement} box
 * @param {{ parts: [string, string][], active: string, onPick: (type: string) => void }} opts
 */
export function renderPartSwitch(box, { parts, active, onPick }) {
  const row = el('div', 'avatar-subtabs');
  row.setAttribute('role', 'tablist');
  for (const [type, title] of parts) {
    const b = button('avatar-subtab', title);
    b.dataset.type = type;
    b.setAttribute('role', 'tab');
    const on = type === active;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) b.classList.add('active');
    b.addEventListener('click', () => onPick(type));
    row.appendChild(b);
  }
  box.appendChild(row);
  return row;
}

/** Remember which control in the box had focus, to put it back after a redraw. */
export function focusIn(box) {
  const a = box?.ownerDocument?.activeElement;
  if (!a || !box.contains(a)) return null;
  if (a.classList.contains('avatar-tile')) return { sel: `.avatar-tile[data-type="${a.dataset.type}"][data-name="${a.dataset.name}"]` };
  if (a.classList.contains('avatar-search')) return { sel: `.avatar-search[data-type="${a.dataset.type}"]` };
  if (a.classList.contains('avatar-subtab')) return { sel: `.avatar-subtab[data-type="${a.dataset.type}"]` };
  return null;
}

/** Put focus back (see focusIn). */
export function refocus(box, saved) {
  if (!saved) return;
  const t = box.querySelector(saved.sel);
  if (!t) return;
  if (t.classList.contains('avatar-tile')) {
    for (const x of t.parentElement.children) x.tabIndex = -1;
    t.tabIndex = 0;
  }
  t.focus();
}
