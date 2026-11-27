/**
 * G808, Circle the spot (player idea #49, Austin 2026-11-22: build option A). A player asked to
 * mark the problem on a report's picture. Glitch had nothing like it: its bug form (BootError.as)
 * was a text box and the session details, with no picture at all. So this is the remake's own,
 * registered in tools/inventions/inventions.json (report-picture-rings).
 *
 * - In the big picture view (js/ui/picture-lightbox.js, so the game's report window and the phone
 *   companion both get it) a bar under the picture: Circle the spot, Circle (marking on or off),
 *   "N of 3", Undo, Clear, Done, and a help line.
 * - A drag draws a red ellipse round the problem, a tap drops a ring of a set size; up to 3 rings.
 *   Keys on the picture: Enter or Space drops a ring in the middle, the arrows move the chosen ring,
 *   Shift+arrows size it, Tab goes to the next ring (and on out after the last), Delete removes it,
 *   Ctrl+Z (Cmd+Z) undoes. A polite live line says where the ring is ("Ring 1, top left.").
 * - Rings are kept as shares of the picture (x, y the middle, rx, ry the half width and height),
 *   beside the untouched picture (createMarkBook). Done draws them into a JPEG (bakeMarks, through
 *   paintRings, a pure pixel painter) which the thumbnail shows and Send sends, so the site, the
 *   console and the emails get the rings as plain pixels with no change of their own. The original
 *   stays until Send, so Undo and Clear still work when the picture is opened again.
 * - A ring is red with a white edge so it shows on any street, the same on screen (an SVG over the
 *   picture) and in the JPEG (MARK_COLOURS, ringStroke).
 *
 * Styles: features/bug-report-feature.js STYLE (base and Modern), css/classic.css (Classic),
 * play/phone/phone.css (the phone companion).
 * QA hooks: [data-picture-marks] (the bar), [data-picture-marks-layer] (the picture's layer,
 * data-count), [data-picture-mark=<i>] (each ring, data-selected), [data-picture-marks-circle],
 * [data-picture-marks-undo], [data-picture-marks-clear], [data-picture-marks-done],
 * [data-picture-marks-count], [data-picture-marks-live].
 */

import { REPORT_PICTURE, base64Size } from '../reports.js?v=3c805cc4';
import { pictureAttempts } from '../report-pictures.js?v=fe05b74d';

export const MARKS = Object.freeze({
  /** The most rings one picture takes. */
  max: 3,
  /** A tapped ring's radius, a share of the picture's shorter side. */
  tap: 0.09,
  /** The smallest radius, a share of the shorter side (a drag along a line still gives a ring). */
  min: 0.025,
  /** The largest half width or height, a share of that side. */
  most: 0.75,
  /** An arrow key moves the ring this share of the picture's width or height. */
  step: 0.02,
  /** Shift+arrow grows or shrinks the ring by this share of itself. */
  grow: 0.12,
  /** A press that moves less than this (screen px) is a tap. */
  slop: 6,
  /** How many changes Undo goes back through. */
  undo: 30,
});

/** The ring's colours, on screen and in the JPEG (red with a white edge, so it shows on any street). */
export const MARK_COLOURS = Object.freeze({ ring: '#ee2222', edge: '#ffffff' });

/** The words (plain, no dashes). */
export const MARK_TEXT = Object.freeze({
  title: 'Circle the spot',
  circle: 'Circle',
  circleLabel: 'Circle the spot on the picture',
  count: (n, of = MARKS.max) => `${n} of ${of}`,
  undo: 'Undo',
  undoLabel: 'Undo the last change (Ctrl+Z)',
  clear: 'Clear',
  clearLabel: 'Take every ring off',
  done: 'Done',
  doneLabel: 'Done: keep the rings and go back',
  help: 'Drag around the problem to circle it, or tap to drop a ring. Up to 3.',
  helpKeys: 'Keys: arrows move it, Shift+arrows size it.',
  layer: 'The picture. Enter drops a ring in the middle, the arrows move it, Shift and the arrows size it, Tab goes to the next ring, Delete removes it.',
  ring: (n, where) => `Ring ${n}, ${where}.`,
  removed: (left) => (left ? `Ring removed. ${left} left.` : 'Ring removed.'),
  cleared: 'Every ring is off.',
  undone: 'Undone.',
  full: 'That is 3 rings, the most a picture takes. Undo or Clear to draw another.',
  tag: (n) => (n === 1 ? '1 mark' : `${n} marks`),
  uiCleared: 'The picture changed, so its rings were cleared.',
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** PURE: a ring kept inside the picture: its middle on the picture, its size within MARKS.min of the shorter side and MARKS.most. */
export function clampRing(ring, w = 1, h = 1) {
  const W = Math.max(1, num(w, 1));
  const H = Math.max(1, num(h, 1));
  const short = Math.min(W, H);
  const minX = Math.min(MARKS.most, (MARKS.min * short) / W);
  const minY = Math.min(MARKS.most, (MARKS.min * short) / H);
  return {
    x: clamp(num(ring?.x, 0.5), 0, 1),
    y: clamp(num(ring?.y, 0.5), 0, 1),
    rx: clamp(num(ring?.rx, minX), minX, MARKS.most),
    ry: clamp(num(ring?.ry, minY), minY, MARKS.most),
  };
}

/** PURE: a ring dropped with a tap at (x, y) (shares of the picture): a circle MARKS.tap of the shorter side. */
export function tapRing(x, y, w, h) {
  const W = Math.max(1, num(w, 1));
  const H = Math.max(1, num(h, 1));
  const r = MARKS.tap * Math.min(W, H);
  return clampRing({ x, y, rx: r / W, ry: r / H }, W, H);
}

/** PURE: the ring a drag from (x0, y0) to (x1, y1) draws (shares): the ellipse inside the box it spans. */
export function dragRing(x0, y0, x1, y1, w, h) {
  const a = { x: clamp(num(x0), 0, 1), y: clamp(num(y0), 0, 1) };
  const b = { x: clamp(num(x1), 0, 1), y: clamp(num(y1), 0, 1) };
  return clampRing({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rx: Math.abs(b.x - a.x) / 2, ry: Math.abs(b.y - a.y) / 2 }, w, h);
}

/** PURE: whether a press that moved dx, dy screen px is a tap (not a drag). */
export function isTap(dx, dy, slop = MARKS.slop) {
  return Math.hypot(num(dx), num(dy)) < slop;
}

/** PURE: where a ring is, in words: "top left", "left of centre", "in the middle". */
export function ringPlace(ring) {
  const x = num(ring?.x, 0.5);
  const y = num(ring?.y, 0.5);
  const h = x < 1 / 3 ? 'left' : x > 2 / 3 ? 'right' : '';
  const v = y < 1 / 3 ? 'top' : y > 2 / 3 ? 'bottom' : '';
  if (h && v) return `${v} ${h}`;
  if (h) return `${h} of centre`;
  if (v) return `${v} middle`;
  return 'in the middle';
}

/** PURE: the stroke for a w x h picture, in its own pixels: the red core and the white edge on each side. */
export function ringStroke(w, h) {
  const short = Math.max(1, Math.min(num(w, 1), num(h, 1)));
  const core = Math.max(3, Math.round(short / 110));
  return { core, edge: Math.max(2, Math.round(core / 2)) };
}

/** PURE: rings as they are stored and compared: numbers rounded to 4 places, at most MARKS.max. */
export function tidyRings(rings, w = 1, h = 1) {
  const r4 = (v) => Math.round(v * 10000) / 10000;
  return (Array.isArray(rings) ? rings : []).slice(0, MARKS.max).map((r) => {
    const c = clampRing(r, w, h);
    return { x: r4(c.x), y: r4(c.y), rx: r4(c.rx), ry: r4(c.ry) };
  });
}

/** PURE: two ring lists the same. */
export function sameRings(a, b) {
  return JSON.stringify(tidyRings(a)) === JSON.stringify(tidyRings(b));
}

/**
 * PURE: what a key on the picture does. `state` { rings, sel } (sel: the chosen ring, -1 none),
 * `key` the KeyboardEvent key, `mods` { shift, ctrl, meta }, the picture's w x h. Returns
 * { rings, sel, handled, change } with change one of add, move, size, select, remove, undo, full
 * or '' (not handled: the key goes on, as Tab does after the last ring).
 */
export function ringKey(state, key, mods = {}, w = 1, h = 1) {
  const rings = (state?.rings || []).map((r) => ({ ...r }));
  let sel = Number.isInteger(state?.sel) ? state.sel : -1;
  if (sel >= rings.length) sel = rings.length - 1;
  const out = (change, more = {}) => ({ rings, sel, handled: true, change, ...more });
  const none = { rings, sel, handled: false, change: '' };
  const { shift = false, ctrl = false, meta = false } = mods || {};
  if ((ctrl || meta) && (key === 'z' || key === 'Z')) return out('undo');
  if (ctrl || meta) return none;
  if (key === 'Enter' || key === ' ') {
    if (rings.length >= MARKS.max) return out('full');
    rings.push(tapRing(0.5, 0.5, w, h));
    sel = rings.length - 1;
    return out('add');
  }
  if (key === 'Tab') {
    if (!rings.length) return none;
    if (sel < 0) return { ...out('select'), sel: shift ? rings.length - 1 : 0 };
    const next = sel + (shift ? -1 : 1);
    if (next < 0 || next >= rings.length) return none;
    return { ...out('select'), sel: next };
  }
  if (key === 'Delete' || key === 'Backspace') {
    if (sel < 0 || !rings.length) return none;
    rings.splice(sel, 1);
    sel = rings.length ? Math.min(sel, rings.length - 1) : -1;
    return { rings, sel, handled: true, change: 'remove' };
  }
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!dir) return none;
  if (sel < 0) {
    if (!rings.length) return none;
    sel = 0;
  }
  const r = rings[sel];
  if (shift) {
    // Right and Up make it bigger; Left and Down smaller (across for Left and Right, up and down for the others).
    if (dir[0]) r.rx *= dir[0] > 0 ? 1 + MARKS.grow : 1 / (1 + MARKS.grow);
    else r.ry *= dir[1] < 0 ? 1 + MARKS.grow : 1 / (1 + MARKS.grow);
    rings[sel] = clampRing(r, w, h);
    return out('size');
  }
  r.x += dir[0] * MARKS.step;
  r.y += dir[1] * MARKS.step;
  rings[sel] = clampRing(r, w, h);
  return out('move');
}

/**
 * PURE: draws the rings into RGBA pixels (a canvas's ImageData data, w x h) in place: the white
 * edge, then the red core, smoothed over one pixel. Pixels away from a ring are not touched.
 * Returns how many pixels it painted.
 */
export function paintRings(data, w, h, rings, colours = MARK_COLOURS) {
  const W = Math.floor(num(w));
  const H = Math.floor(num(h));
  if (!data || W < 1 || H < 1) return 0;
  const hex = (c) => [1, 3, 5].map((i) => parseInt(String(c).slice(i, i + 2), 16));
  const red = hex(colours.ring);
  const white = hex(colours.edge);
  const { core, edge } = ringStroke(W, H);
  const half = core / 2;
  const outer = half + edge;
  let painted = 0;
  for (const ring of tidyRings(rings, W, H)) {
    const cx = ring.x * W;
    const cy = ring.y * H;
    const rx = Math.max(1, ring.rx * W);
    const ry = Math.max(1, ring.ry * H);
    const x0 = Math.max(0, Math.floor(cx - rx - outer - 1));
    const x1 = Math.min(W - 1, Math.ceil(cx + rx + outer + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - outer - 1));
    const y1 = Math.min(H - 1, Math.ceil(cy + ry + outer + 1));
    for (let py = y0; py <= y1; py++) {
      const v = (py + 0.5 - cy) / ry;
      for (let px = x0; px <= x1; px++) {
        const u = (px + 0.5 - cx) / rx;
        const d = Math.hypot(u, v);
        if (d < 1e-6) continue;
        // The distance to the ellipse in pixels, near enough for a stroke: (d - 1) over the gradient of d.
        const grad = Math.hypot(u / rx, v / ry) / d;
        const dist = Math.abs((d - 1) / grad);
        const all = clamp(outer + 0.5 - dist, 0, 1);
        if (all <= 0) continue;
        const mid = clamp(half + 0.5 - dist, 0, 1);
        const i = (py * W + px) * 4;
        for (let c = 0; c < 3; c++) {
          let p = data[i + c];
          p = p + (white[c] - p) * all;
          p = p + (red[c] - p) * mid;
          data[i + c] = Math.round(p);
        }
        data[i + 3] = 255;
        painted += 1;
      }
    }
  }
  return painted;
}

/** Loads a picture's data URL as an image the canvas can draw. */
async function loadImage(url, doc) {
  const Img = doc?.defaultView?.Image || globalThis.Image;
  const img = new Img();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

/**
 * Draws the rings into a copy of a picture ({ url (a JPEG data URL), width, height }): a JPEG
 * within the site's limits (REPORT_PICTURE), { url, width, height, bytes, rings }, or null when
 * the browser cannot. The picture itself is not changed.
 */
export async function bakeMarks(pic, rings, { doc = globalThis.document, limits = REPORT_PICTURE } = {}) {
  const list = tidyRings(rings);
  if (!pic?.url || !list.length || !doc?.createElement) return null;
  let img;
  try { img = await loadImage(pic.url, doc); } catch { return null; }
  const w = img.naturalWidth || num(pic.width);
  const h = img.naturalHeight || num(pic.height);
  if (!w || !h) return null;
  const c = doc.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  for (const a of pictureAttempts(w, h, limits)) {
    c.width = a.canvasW;
    c.height = a.canvasH;
    ctx.fillStyle = MARK_COLOURS.edge;
    ctx.fillRect(0, 0, a.canvasW, a.canvasH);
    ctx.drawImage(img, a.x, a.y, a.drawW, a.drawH);
    const px = ctx.getImageData(0, 0, a.canvasW, a.canvasH);
    paintRings(px.data, a.canvasW, a.canvasH, list);
    ctx.putImageData(px, 0, 0);
    const url = c.toDataURL(limits.type, a.quality);
    if (typeof url !== 'string' || !url.startsWith('data:image/jpeg;base64,')) return null;
    const bytes = base64Size(url.slice(url.indexOf(',') + 1));
    if (bytes <= limits.maxBytes) return { url, width: a.canvasW, height: a.canvasH, bytes, rings: list };
  }
  return null;
}

/**
 * The rings a set of pictures carry, kept beside the pictures themselves (a report's own picture,
 * the waiting ones, a phone's photos). holder(pic) is what the lightbox takes ({ rings, history,
 * save }); save draws the rings into a JPEG (bake) and calls onChange when it is ready. url(pic) is
 * what Send sends, shown(pic) what a thumbnail shows. settled() waits for any drawing.
 * `bake(pic, rings)` is bakeMarks unless a test gives its own.
 */
export function createMarkBook({ bake = (pic, rings) => bakeMarks(pic, rings), onChange = () => {} } = {}) {
  const book = new Map();
  const jobs = new Set();
  function save(pic, { rings = [], history = [] } = {}) {
    const list = tidyRings(rings, pic?.width, pic?.height);
    const was = book.get(pic);
    if (!list.length) {
      // No rings: the picture as it was, but its undo list stays (Clear, then Undo after opening it again).
      if (!was && !history.length) return;
      if (history.length) book.set(pic, { rings: [], history: history.slice(-MARKS.undo), baked: null });
      else book.delete(pic);
      onChange(pic);
      return;
    }
    if (was && sameRings(was.rings, list)) { was.history = history.slice(-MARKS.undo); return; }
    const entry = { rings: list, history: history.slice(-MARKS.undo), baked: was?.baked || null };
    book.set(pic, entry);
    const job = Promise.resolve().then(() => bake(pic, list)).catch(() => null).then((b) => {
      if (book.get(pic) === entry) entry.baked = b && typeof b.url === 'string' ? b : null;
      jobs.delete(job);
      onChange(pic);
    });
    jobs.add(job);
    onChange(pic);
  }
  return {
    /** What the lightbox takes for a picture: its rings, its undo list and save. */
    holder: (pic) => ({ rings: (book.get(pic)?.rings || []).map((r) => ({ ...r })), history: (book.get(pic)?.history || []).slice(), save: (s) => save(pic, s) }),
    save,
    rings: (pic) => (book.get(pic)?.rings || []).slice(),
    count: (pic) => book.get(pic)?.rings.length || 0,
    /** The picture with its rings drawn in (once drawn), else the picture. */
    shown: (pic) => book.get(pic)?.baked || pic,
    /** What Send sends: the picture with its rings, else the picture's own. */
    url: (pic) => book.get(pic)?.baked?.url || pic?.url || null,
    /** A picture's rings go (true when it had any). */
    drop(pic) {
      if (!book.has(pic)) return false;
      book.delete(pic);
      return true;
    },
    /** Every picture's rings go but those of `keep`. */
    keepOnly(keep = []) {
      const set = new Set(keep);
      for (const pic of [...book.keys()]) if (!set.has(pic)) book.delete(pic);
    },
    /** The drawn pictures (so a page keeps their preview addresses). */
    baked: () => [...book.values()].map((e) => e.baked).filter(Boolean),
    settled: () => Promise.all([...jobs]),
  };
}

// —— The marking bar and layer in the lightbox ——

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (text) node.textContent = text;
  return node;
}
function svgEl(doc, tag, attrs = {}) {
  const node = typeof doc.createElementNS === 'function' ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) node.setAttribute(k, String(v));
  return node;
}
const setFlag = (node, name, on) => { if (on) node.setAttribute(name, ''); else node.removeAttribute?.(name); };

let marksSeq = 0;

/**
 * The marking parts of a lightbox: the layer over the picture (in `frame`, beside the img) and the
 * bar (in `root`). `size()` gives the picture's own w x h; `setMode(on)` hears marking turn on or
 * off (the lightbox fits the picture and stops zoom and swipe); `done()` closes the lightbox.
 * show(holder) puts a picture's rings up (null hides it all); save() hands them back.
 */
export function createMarker({ doc, root, frame, size = () => ({ w: 1, h: 1 }), setMode = () => {}, done = () => {} }) {
  const T = MARK_TEXT;
  const id = `picture-marks-${++marksSeq}`;
  const e = (tag, attrs, text) => el(doc, tag, attrs, text);
  const layer = svgEl(doc, 'svg', { class: 'picture-marks-layer', role: 'application', 'aria-label': T.layer, 'aria-describedby': `${id}-help`, preserveAspectRatio: 'none', focusable: 'false', 'data-picture-marks-layer': '' });
  const bar = e('div', { class: 'picture-marks', role: 'group', 'aria-label': T.title, hidden: true, 'data-picture-marks': '' });
  const title = e('strong', { class: 'picture-marks-title' }, T.title);
  const circle = e('button', { type: 'button', class: 'picture-marks-btn picture-marks-circle', 'aria-pressed': 'false', 'aria-label': T.circleLabel, title: T.circleLabel, 'data-picture-marks-circle': '' });
  circle.append(e('span', { class: 'picture-marks-icon', 'aria-hidden': 'true' }), doc.createTextNode(T.circle));
  const count = e('span', { class: 'picture-marks-count', 'data-picture-marks-count': '' });
  const undo = e('button', { type: 'button', class: 'picture-marks-btn', 'aria-label': T.undoLabel, title: T.undoLabel, 'data-picture-marks-undo': '' }, T.undo);
  const clear = e('button', { type: 'button', class: 'picture-marks-btn', 'aria-label': T.clearLabel, title: T.clearLabel, 'data-picture-marks-clear': '' }, T.clear);
  const doneBtn = e('button', { type: 'button', class: 'picture-marks-btn is-go', title: T.doneLabel, 'data-picture-marks-done': '' }, T.done);
  const help = e('p', { id: `${id}-help`, class: 'picture-marks-help' });
  help.append(doc.createTextNode(`${T.help} `), e('span', { class: 'picture-marks-keys' }, T.helpKeys));
  const liveLine = e('p', { class: 'picture-marks-live', role: 'status', 'aria-live': 'polite', 'data-picture-marks-live': '' });
  bar.append(title, circle, count, undo, clear, doneBtn, help, liveLine);
  layer.hidden = true;
  frame.append(layer);
  root.append(bar);

  let holder = null;
  let rings = [];
  let history = [];
  let sel = -1;
  let marking = false;
  let lastChange = '';
  let press = null;
  let draft = null;

  const dims = () => {
    const s = size() || {};
    return { w: Math.max(1, num(s.w, 1)), h: Math.max(1, num(s.h, 1)) };
  };
  const say = (line) => { liveLine.textContent = line || ''; };
  const placeWords = (i) => T.ring(i + 1, ringPlace(rings[i]));

  function ringNode(r, i, { w, h }, extra = '') {
    const { core, edge } = ringStroke(w, h);
    const cx = r.x * w;
    const cy = r.y * h;
    const rx = Math.max(1, r.rx * w);
    const ry = Math.max(1, r.ry * h);
    const g = svgEl(doc, 'g', { class: `picture-mark${extra}`, 'data-picture-mark': extra ? null : String(i) });
    if (!extra && i === sel) g.setAttribute('data-selected', '');
    const gap = core / 2 + edge + Math.max(3, core);
    g.append(
      svgEl(doc, 'ellipse', { class: 'picture-mark-focus', cx, cy, rx: rx + gap, ry: ry + gap, fill: 'none', 'stroke-width': Math.max(2, core * 0.6) }),
      svgEl(doc, 'ellipse', { class: 'picture-mark-edge', cx, cy, rx, ry, fill: 'none', stroke: MARK_COLOURS.edge, 'stroke-width': core + edge * 2 }),
      svgEl(doc, 'ellipse', { class: 'picture-mark-core', cx, cy, rx, ry, fill: 'none', stroke: MARK_COLOURS.ring, 'stroke-width': core }),
    );
    return g;
  }

  function draw() {
    const d = dims();
    layer.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`);
    layer.setAttribute('data-count', String(rings.length));
    const nodes = rings.map((r, i) => ringNode(r, i, d));
    if (draft) nodes.push(ringNode(draft, -1, d, ' is-draft'));
    layer.replaceChildren(...nodes);
    count.textContent = T.count(rings.length);
    undo.disabled = !history.length;
    clear.disabled = !rings.length;
  }

  /** A change to the rings: the old ones go on the undo list (a run of moves or sizes of one ring is one step). */
  function change(next, nextSel, kind) {
    const merge = (kind === 'move' || kind === 'size') && lastChange === `${kind}:${nextSel}`;
    if (!merge) history = [...history, rings.map((r) => ({ ...r }))].slice(-MARKS.undo);
    lastChange = kind === 'move' || kind === 'size' ? `${kind}:${nextSel}` : '';
    rings = next;
    sel = nextSel;
    draw();
  }

  function add(ring) {
    if (rings.length >= MARKS.max) { say(T.full); return false; }
    const { w, h } = dims();
    change([...rings, clampRing(ring, w, h)], rings.length, 'add');
    say(placeWords(sel));
    return true;
  }
  function undoOne() {
    if (!history.length) return false;
    rings = history[history.length - 1];
    history = history.slice(0, -1);
    sel = rings.length ? Math.min(Math.max(sel, 0), rings.length - 1) : -1;
    lastChange = '';
    draw();
    say(T.undone);
    return true;
  }
  function clearAll() {
    if (!rings.length) return false;
    change([], -1, 'clear');
    say(T.cleared);
    return true;
  }

  function setMarking(on) {
    const want = Boolean(on) && Boolean(holder);
    marking = want;
    setFlag(root, 'data-marking', want);
    circle.setAttribute('aria-pressed', want ? 'true' : 'false');
    if (want) layer.setAttribute('tabindex', '0');
    else layer.removeAttribute?.('tabindex');
    setMode(want);
  }

  function show(next) {
    holder = next && typeof next.save === 'function' ? next : null;
    rings = holder ? tidyRings(holder.rings) : [];
    history = holder && Array.isArray(holder.history) ? holder.history.slice() : [];
    sel = rings.length ? 0 : -1;
    lastChange = '';
    press = null;
    draft = null;
    bar.hidden = !holder;
    layer.hidden = !holder;
    setFlag(root, 'data-markable', Boolean(holder));
    say('');
    draw();
    setMarking(Boolean(holder));
  }

  function save() {
    if (!holder) return;
    holder.save({ rings: rings.map((r) => ({ ...r })), history: history.slice() });
  }

  /** A pointer's spot on the picture, in shares. */
  function at(ev) {
    const r = layer.getBoundingClientRect?.();
    if (!r || !r.width || !r.height) return { x: 0.5, y: 0.5 };
    return { x: clamp((ev.clientX - r.left) / r.width, 0, 1), y: clamp((ev.clientY - r.top) / r.height, 0, 1) };
  }

  layer.addEventListener('pointerdown', (ev) => {
    if (!marking || (ev.button ?? 0) !== 0) return;
    ev.preventDefault?.();
    ev.stopPropagation?.();
    layer.setPointerCapture?.(ev.pointerId);
    press = { id: ev.pointerId, cx: ev.clientX, cy: ev.clientY, ...at(ev) };
    draft = null;
    layer.focus?.({ preventScroll: true });
  });
  layer.addEventListener('pointermove', (ev) => {
    if (!press || ev.pointerId !== press.id) return;
    if (!draft && isTap(ev.clientX - press.cx, ev.clientY - press.cy)) return;
    const p = at(ev);
    const { w, h } = dims();
    draft = dragRing(press.x, press.y, p.x, p.y, w, h);
    draw();
  });
  const endPress = (ev, cancel = false) => {
    if (!press || (ev && ev.pointerId !== press.id)) return;
    layer.releasePointerCapture?.(press.id);
    const p = press;
    const ring = draft;
    press = null;
    draft = null;
    if (cancel) { draw(); return; }
    const { w, h } = dims();
    if (ring) add(ring);
    else add(tapRing(p.x, p.y, w, h));
    draw();
  };
  layer.addEventListener('pointerup', (ev) => { ev.stopPropagation?.(); endPress(ev); });
  layer.addEventListener('pointercancel', (ev) => endPress(ev, true));
  layer.addEventListener('click', (ev) => ev.stopPropagation?.());
  layer.addEventListener('focus', () => {
    if (sel < 0 && rings.length) { sel = 0; draw(); }
    if (sel >= 0) say(placeWords(sel));
  });
  layer.addEventListener('keydown', (ev) => {
    if (!marking) return;
    const { w, h } = dims();
    const r = ringKey({ rings, sel }, ev.key, { shift: ev.shiftKey, ctrl: ev.ctrlKey, meta: ev.metaKey }, w, h);
    if (!r.handled) return;
    ev.preventDefault?.();
    ev.stopPropagation?.();
    if (r.change === 'undo') { undoOne(); return; }
    if (r.change === 'full') { say(T.full); return; }
    if (r.change === 'select') { sel = r.sel; lastChange = ''; draw(); say(placeWords(sel)); return; }
    change(r.rings, r.sel, r.change);
    say(r.change === 'remove' ? T.removed(rings.length) : placeWords(sel));
  });

  circle.addEventListener('click', (ev) => { ev.stopPropagation?.(); setMarking(!marking); });
  undo.addEventListener('click', (ev) => { ev.stopPropagation?.(); undoOne(); });
  clear.addEventListener('click', (ev) => { ev.stopPropagation?.(); clearAll(); });
  doneBtn.addEventListener('click', (ev) => { ev.stopPropagation?.(); done(); });
  bar.addEventListener('click', (ev) => ev.stopPropagation?.());

  return {
    bar,
    layer,
    show,
    save,
    draw,
    /** The rings shown now (copies). */
    get rings() { return rings.map((r) => ({ ...r })); },
    get selected() { return sel; },
    get marking() { return marking; },
    get markable() { return Boolean(holder); },
    setMarking,
    add,
    undo: undoOne,
    clear: clearAll,
    /** The parts Tab goes through, in order. */
    focusables: () => (holder ? [...(marking ? [layer] : []), circle, undo, clear, doneBtn].filter((n) => !n.disabled) : []),
  };
}
