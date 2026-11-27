/**
 * FLASH (Austin's iPhone, upright: a bag opening or closing flashed the street black for about a
 * frame): the renderer's resize spread over two frames on Safari's engine.
 *
 * An open or closed bag refits the street's band (js/ui/phone-layout.js), so the view changes and
 * the renderer resizes: the canvas's pixel (backing store) size changes, its on-screen (CSS) size
 * with it. WebKit paints a WebGL canvas opaque black for the whole frame in which its backing
 * store changed size, even with a redraw straight after in the same task (checked in Playwright's
 * WebKit, tools/qa/resize-flash.mjs: the backing store alone, with the CSS size held still, went
 * black too, so putting the CSS size and the backing store in separate frames does not help).
 * Chrome never does.
 *
 * So on WebKit a resize keeps the old picture on screen for that frame: it draws the street once
 * more, copies it into a plain 2D canvas laid over the game's canvas at the new CSS size (the old
 * picture scaled by a few px), resizes the backing store and draws at once beneath it, and lifts
 * the copy two frames later, once the canvas has painted at its new size. Every resize goes this
 * way (a bag, a sheet, the Social drawer, a turned phone, the phone zoom's lift, a Mac's Safari
 * window). Elsewhere the resize stays one step, so a computer's window resize in Chrome gets no
 * frame of lag and no copy.
 *
 *   const sizer = createStageResize({ resize, render, cover, split: true });
 *   sizer.request(w, h, res)   the renderer's new size ({ w, h } view px at `res`)
 *   sizer.target()             the size asked last ({ w, h, res }); null before any
 *   sizer.covered              true while the copy is up
 *   sizer.split                whether resizes go through the copy
 *
 * `cover` is { show(): boolean, hide() } (createCanvasCover for the page). Requests while the
 * copy is up resize at once beneath it and keep it up two frames past the last one.
 */

/**
 * Safari's engine: Safari, and every iPhone and iPad browser (Chrome on iOS is WebKit too), but
 * not Chrome, Edge, Opera or Samsung's browser, which say AppleWebKit for history (pure).
 * @param {string} [ua] navigator.userAgent
 */
export function appleWebKit(ua = '') {
  const s = String(ua || '');
  return /AppleWebKit\//.test(s) && !/\b(Chrome|Chromium|HeadlessChrome|Edg|OPR|SamsungBrowser)\//.test(s);
}

/**
 * Whether this page resizes the renderer under a copy: `?resizesplit=1` or `0` (QA) decides,
 * otherwise Safari's engine does (pure).
 * @param {{ ua?: string, param?: string|null }} [env]
 */
export function splitStageResize({ ua = '', param = null } = {}) {
  if (param === '1') return true;
  if (param === '0') return false;
  return appleWebKit(ua);
}

/** Frames the copy stays up after the last resize: the resize's own frame, then one drawn at the new size. */
export const COVER_FRAMES = 2;

/**
 * @param {{
 *   resize: (w: number, h: number, res: number) => void,
 *   render?: () => void,
 *   cover?: { show: () => boolean, hide: () => void } | null,
 *   split?: boolean,
 *   frame?: (cb: () => void) => any,
 *   initial?: { w: number, h: number, res: number } | null,
 * }} opts `initial` is the size the renderer already has.
 */
export function createStageResize({ resize, render = () => {}, cover = null, split = false, frame = (cb) => globalThis.requestAnimationFrame(cb), initial = null }) {
  let applied = initial ? { w: initial.w, h: initial.h, res: initial.res } : null;
  let covered = false;
  // Frames still to pass before the copy lifts; a frame callback is in flight while it is above 0.
  let left = 0;
  const same = (a, b) => Boolean(a && b) && a.w === b.w && a.h === b.h && a.res === b.res;
  function tick() {
    left -= 1;
    if (left > 0) {
      frame(tick);
      return;
    }
    covered = false;
    cover?.hide();
  }
  return {
    request(w, h, res) {
      const size = { w, h, res };
      if (same(size, applied)) return 'same';
      if (!split || !cover) {
        applied = size;
        resize(w, h, res);
        return 'now';
      }
      // The street as it stands, copied over the canvas before its backing store changes.
      if (!covered) {
        render();
        covered = Boolean(cover.show());
      } else cover.show();
      applied = size;
      resize(w, h, res);
      render();
      if (!covered) return 'now';
      const running = left > 0;
      left = COVER_FRAMES;
      if (!running) frame(tick);
      return 'covered';
    },
    target() {
      return applied;
    },
    get covered() {
      return covered;
    },
    get split() {
      return Boolean(split && cover);
    },
  };
}

/**
 * The copy for createStageResize on a page: a plain 2D canvas in a box laid over `canvas` (after
 * it, in its parent), the size the canvas shows now. show() copies the canvas's current picture
 * (call it straight after a draw, while WebGL's buffer still holds it) the first time and
 * follows the canvas's box after; hide() takes it away. Returns false (and shows nothing) when
 * the copy fails.
 * @param {HTMLCanvasElement} canvas
 */
export function createCanvasCover(canvas) {
  const doc = canvas.ownerDocument;
  let up = false;
  const pin = (el, props) => {
    for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v, 'important');
  };
  // Made now, with its 2D context: a copy whose canvas and context were first made in the frame a
  // phone turned still showed black for that frame (WebKit), later ones did not.
  const box = doc.createElement('div');
  box.className = 'stage-resize-cover';
  box.setAttribute('aria-hidden', 'true');
  // Its own composited layer: as a plain box WebKit could stack the WebGL canvas's layer over it
  // for a frame while a turned phone's layers were rebuilt (the black frame again).
  pin(box, { visibility: 'hidden', position: 'absolute', margin: '0', padding: '0', 'pointer-events': 'none', overflow: 'hidden', 'will-change': 'transform' });
  const copy = doc.createElement('canvas');
  copy.width = 1;
  copy.height = 1;
  pin(copy, { display: 'block', width: '100%', height: '100%', margin: '0' });
  box.append(copy);
  const ctx = copy.getContext('2d');
  // In place from the start when the canvas is (game.js makes the sizer once the canvas is in the root).
  if (canvas.parentElement) canvas.after(box);
  function place() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const r = canvas.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    pin(box, {
      left: `${(r.left - p.left - parent.clientLeft + parent.scrollLeft).toFixed(2)}px`,
      top: `${(r.top - p.top - parent.clientTop + parent.scrollTop).toFixed(2)}px`,
      width: `${r.width.toFixed(2)}px`,
      height: `${r.height.toFixed(2)}px`,
    });
  }
  return {
    show() {
      if (up) {
        place();
        return true;
      }
      if (!ctx || !canvas.parentElement || !canvas.width || !canvas.height) return false;
      try {
        if (copy.width !== canvas.width) copy.width = canvas.width;
        if (copy.height !== canvas.height) copy.height = canvas.height;
        ctx.clearRect(0, 0, copy.width, copy.height);
        ctx.drawImage(canvas, 0, 0);
      } catch {
        return false;
      }
      if (box.previousElementSibling !== canvas) canvas.after(box);
      place();
      pin(box, { visibility: 'visible' });
      up = true;
      return true;
    },
    hide() {
      if (!up) return;
      up = false;
      // Hidden, not taken out: its layer stays made for the next resize (a layer made in a turned
      // phone's frame came late, WebKit), and the copy drops to 1 px so it holds no memory.
      pin(box, { visibility: 'hidden' });
      copy.width = 1;
      copy.height = 1;
    },
    get up() {
      return up;
    },
  };
}
