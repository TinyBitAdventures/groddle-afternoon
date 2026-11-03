/**
 * A picture over the game (Austin 2026-11-03: a report's picture, "Open the picture full size",
 * opened in a whole new browser tab; he wants it in the game). The Report a bug window's picture
 * opens here (js/ui/reports-sheet.js, lightboxLink); any picture link can.
 *
 * - The picture fitted to the window (at most 92% of its width and 88% of its height, its shape
 *   kept; a smaller picture at its own size) on a dim backdrop, with a close button, + / - (fit or
 *   actual size) and Open in a new tab for anyone who wants the browser's own view.
 * - Zoom: a click on the picture (or + / -, or the + and - keys) switches between fitted and actual
 *   size, keeping the spot you clicked in view. At actual size it scrolls: drag it, the wheel or
 *   trackpad, or the arrow keys. A picture that already fits shows no zoom.
 * - Closing: Esc (only the picture: the window behind it stays), the close button, or a click on
 *   the backdrop. Focus goes back the shared way (js/ui/focus-return.js focusBackTarget): to the
 *   picture after a keyboard open and close, otherwise to the window behind (`fallback`), never to
 *   the world while that window stays open.
 * - role=dialog, aria-modal, labelled (`label`); Tab stays inside; every key stops here, so
 *   nothing walks, jumps or reaches the window behind while it is open.
 * - The link itself keeps its href and target: Cmd, Ctrl, Shift or a middle click still open a
 *   tab (as the site's console does, groddle-afternoon-site console/console.js openPicture).
 *
 * Styles: features/bug-report-feature.js STYLE (base and Modern), css/classic.css (Classic).
 * QA hooks: [data-picture-lightbox] (data-zoomable, data-zoomed), [data-picture-lightbox-img],
 * [data-picture-lightbox-stage], [data-picture-lightbox-zoom], [data-picture-lightbox-tab],
 * [data-picture-lightbox-close].
 */

import { focusBackTarget, lastInput, pressedBy } from './focus-return.js?v=da190597';

export const LIGHTBOX_TEXT = Object.freeze({
  label: 'Picture',
  close: 'Close the picture (Esc)',
  zoomIn: 'Actual size (+)',
  zoomOut: 'Fit to the window (-)',
  newTab: 'Open in a new tab',
});

/** The share of the window a fitted picture may take (Austin 2026-11-03: about 92vw by 88vh). */
export const LIGHTBOX_FIT = Object.freeze({ w: 0.92, h: 0.88 });

/** How far an arrow key moves a picture at actual size (px). */
export const LIGHTBOX_PAN_STEP = 60;

/** A fitted picture this close to its own size (scale) offers no zoom: a 1% step is no zoom. */
export const LIGHTBOX_ZOOM_MIN = 0.97;

/** A drag shorter than this is still a click (px). */
const DRAG_SLOP = 4;

/**
 * PURE: a picture of natW x natH fitted to a viewW x viewH window: its size, the scale (never
 * above 1: a small picture keeps its own size) and whether actual size is enough bigger than
 * that to offer zoom (LIGHTBOX_ZOOM_MIN).
 */
export function fitPicture(natW, natH, viewW, viewH, fit = LIGHTBOX_FIT) {
  const w = Math.max(0, Number(natW) || 0);
  const h = Math.max(0, Number(natH) || 0);
  const vw = Math.max(0, Number(viewW) || 0);
  const vh = Math.max(0, Number(viewH) || 0);
  if (!w || !h || !vw || !vh) return { width: w, height: h, scale: 1, zoomable: false };
  const scale = Math.min(1, (vw * fit.w) / w, (vh * fit.h) / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale, zoomable: scale < LIGHTBOX_ZOOM_MIN };
}

/**
 * PURE: the scroll that puts the spot under the pointer (rx, ry: 0 to 1 across the picture) in
 * the middle of a viewW x viewH view once the picture is natW x natH, inside the picture.
 */
export function zoomScroll(rx, ry, natW, natH, viewW, viewH) {
  const clamp = (v, max) => Math.max(0, Math.min(Math.max(0, max), v));
  const x = Math.max(0, Math.min(1, Number.isFinite(rx) ? rx : 0.5));
  const y = Math.max(0, Math.min(1, Number.isFinite(ry) ? ry : 0.5));
  return {
    left: Math.round(clamp(x * natW - viewW / 2, natW - viewW)),
    top: Math.round(clamp(y * natH - viewH / 2, natH - viewH)),
  };
}

/**
 * PURE: where focus goes when the picture closes: 'opener' (the picture link, after a keyboard
 * open and close) or 'window' (the window behind: a pointer open or close). The shared rule of
 * js/ui/focus-return.js, with the open window standing in for the world.
 */
export function lightboxFocusTarget({ openerPressed = '', last = '' } = {}) {
  return focusBackTarget({ opener: true, openerPressed, last }) === 'opener' ? 'opener' : 'window';
}

/** PURE: a plain left click (Cmd, Ctrl, Shift, Alt or another button leave the link to the browser). */
export function plainClick(ev) {
  return Boolean(ev) && (ev.button ?? 0) === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey;
}

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (text) node.textContent = text;
  return node;
}

const live = (node) => Boolean(node && node.isConnected !== false && typeof node.focus === 'function');
const pick = (x) => (typeof x === 'function' ? x() : x) || null;

/**
 * Opens a picture over the page. `host` holds it (the window it belongs to, so it goes with it),
 * `opener` is the picture link (or a function giving it: a redraw may replace it), `fallback` the
 * place in the window behind that gets focus after a pointer open or close.
 * @param {{ doc?: Document, host?: HTMLElement, src: string, width?: number, height?: number, alt?: string,
 *   label?: string, opener?: HTMLElement|(() => HTMLElement|null), fallback?: HTMLElement|(() => HTMLElement|null),
 *   onClose?: (to: string) => void, win?: Window }} opts
 */
export function openLightbox({ doc = globalThis.document, host = doc?.body, src, width = 0, height = 0, alt = '', label = LIGHTBOX_TEXT.label, opener = null, fallback = null, onClose = () => {}, win = doc?.defaultView || globalThis.window } = {}) {
  const T = LIGHTBOX_TEXT;
  const e = (tag, attrs, text) => el(doc, tag, attrs, text);
  // One at a time in a host: a second open replaces the first.
  host?.__lightbox?.close({ focus: false });

  const root = e('div', { class: 'picture-lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1', 'data-picture-lightbox': '' });
  const stage = e('div', { class: 'picture-lightbox-stage', 'data-picture-lightbox-stage': '' });
  const img = e('img', { class: 'picture-lightbox-img', src, alt, width: Number(width) || null, height: Number(height) || null, draggable: 'false', 'data-picture-lightbox-img': '' });
  stage.append(img);
  const bar = e('div', { class: 'picture-lightbox-bar' });
  const zoomBtn = e('button', { type: 'button', class: 'picture-lightbox-btn picture-lightbox-zoom', 'aria-pressed': 'false', 'aria-label': T.zoomIn, title: T.zoomIn, hidden: true, 'data-picture-lightbox-zoom': '' }, '+');
  const tab = e('a', { class: 'picture-lightbox-tab', href: src, target: '_blank', rel: 'noopener', 'data-picture-lightbox-tab': '' }, T.newTab);
  const x = e('button', { type: 'button', class: 'picture-lightbox-btn picture-lightbox-x', 'aria-label': T.close, title: T.close, 'data-picture-lightbox-close': '' }, '×');
  bar.append(zoomBtn, tab, x);
  root.append(stage, bar);

  let natW = Number(width) || 0;
  let natH = Number(height) || 0;
  let zoomable = false;
  let zoomed = false;
  let open = true;
  let drag = null;
  let dragged = false;

  function measure() {
    if (img.naturalWidth && img.naturalHeight) { natW = img.naturalWidth; natH = img.naturalHeight; }
    const fit = fitPicture(natW, natH, win?.innerWidth, win?.innerHeight);
    zoomable = fit.zoomable;
    zoomBtn.hidden = !zoomable;
    if (zoomable) root.setAttribute('data-zoomable', '');
    else root.removeAttribute?.('data-zoomable');
    if (!zoomable && zoomed) zoom(false);
  }

  /** Fit (false) or actual size (true); `at` is the spot to keep in view (0-1 across the picture). */
  function zoom(on, at = null) {
    const want = Boolean(on) && zoomable;
    if (want === zoomed) return zoomed;
    zoomed = want;
    if (zoomed) {
      root.setAttribute('data-zoomed', '');
      img.style.width = `${natW}px`;
      img.style.height = `${natH}px`;
    } else {
      root.removeAttribute?.('data-zoomed');
      img.style.width = '';
      img.style.height = '';
    }
    zoomBtn.textContent = zoomed ? '−' : '+';
    zoomBtn.setAttribute('aria-pressed', zoomed ? 'true' : 'false');
    zoomBtn.setAttribute('aria-label', zoomed ? T.zoomOut : T.zoomIn);
    zoomBtn.setAttribute('title', zoomed ? T.zoomOut : T.zoomIn);
    if (zoomed) {
      const s = zoomScroll(at?.x ?? 0.5, at?.y ?? 0.5, natW, natH, stage.clientWidth || 0, stage.clientHeight || 0);
      stage.scrollLeft = s.left;
      stage.scrollTop = s.top;
    } else {
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
    }
    return zoomed;
  }

  function focusables() {
    return [zoomBtn, tab, x].filter((n) => !n.hidden);
  }

  function close({ focus = true } = {}) {
    if (!open) return '';
    open = false;
    root.remove?.();
    if (host && host.__lightbox === api) host.__lightbox = null;
    win?.removeEventListener?.('resize', measure);
    let to = '';
    if (focus) {
      const link = pick(opener);
      to = lightboxFocusTarget({ openerPressed: link ? pressedBy(link, doc) : '', last: lastInput(doc) });
      if (to === 'opener' && !live(link)) to = 'window';
      const target = to === 'opener' ? link : pick(fallback);
      if (live(target)) target.focus({ preventScroll: true });
    }
    onClose(to);
    return to;
  }

  // Every key stays here: nothing walks or jumps, and the window behind never hears Esc.
  for (const kind of ['keydown', 'keyup', 'keypress']) {
    root.addEventListener(kind, (ev) => {
      ev.stopPropagation();
      if (kind !== 'keydown') return;
      const k = ev.key;
      if (k === 'Escape') { ev.preventDefault(); close(); return; }
      // A held Enter that opened the picture must not press the close button it lands on.
      if (k === 'Enter' && ev.repeat) { ev.preventDefault(); return; }
      if (k === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        ev.preventDefault();
        const i = list.indexOf(doc.activeElement);
        const next = ev.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i < 0 || i === list.length - 1 ? 0 : i + 1);
        list[next].focus();
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (k === '+' || k === '=') { ev.preventDefault(); zoom(true); return; }
      if (k === '-' || k === '_') { ev.preventDefault(); zoom(false); return; }
      const pan = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (pan) {
        ev.preventDefault();
        if (zoomed) {
          stage.scrollLeft = (stage.scrollLeft || 0) + pan[0] * LIGHTBOX_PAN_STEP;
          stage.scrollTop = (stage.scrollTop || 0) + pan[1] * LIGHTBOX_PAN_STEP;
        }
        return;
      }
      // Space on the dialog itself scrolls nothing behind it.
      if (k === ' ' && ev.target === root) ev.preventDefault();
    });
  }

  // At actual size the picture drags; a drag is not a click.
  img.addEventListener('pointerdown', (ev) => {
    if (!zoomed || (ev.button ?? 0) !== 0) return;
    ev.preventDefault?.();
    drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, left: stage.scrollLeft || 0, top: stage.scrollTop || 0 };
    dragged = false;
    img.setPointerCapture?.(ev.pointerId);
    root.setAttribute('data-dragging', '');
  });
  img.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP) dragged = true;
    stage.scrollLeft = drag.left - dx;
    stage.scrollTop = drag.top - dy;
  });
  const endDrag = (ev) => {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    img.releasePointerCapture?.(drag.id);
    drag = null;
    root.removeAttribute?.('data-dragging');
  };
  img.addEventListener('pointerup', endDrag);
  img.addEventListener('pointercancel', endDrag);

  img.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (dragged) { dragged = false; return; }
    if (!zoomable) return;
    let at = null;
    const r = img.getBoundingClientRect?.();
    if (r && r.width && r.height && Number.isFinite(ev.clientX)) at = { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    zoom(!zoomed, at);
  });
  img.addEventListener('load', measure);

  // The backdrop: a click beside the picture closes (not a drag that ended there, not the scrollbars).
  root.addEventListener('click', (ev) => {
    if (dragged) { dragged = false; return; }
    if (ev.target !== root && ev.target !== stage) return;
    if (ev.target === stage && (ev.offsetX >= (stage.clientWidth || Infinity) || ev.offsetY >= (stage.clientHeight || Infinity))) return;
    close();
  });
  zoomBtn.addEventListener('click', () => zoom(!zoomed));
  x.addEventListener('click', () => close());
  win?.addEventListener?.('resize', measure);

  const api = {
    root,
    close,
    zoom,
    get open() { return open; },
    get zoomed() { return zoomed; },
    get zoomable() { return zoomable; },
  };
  if (host) {
    host.append(root);
    host.__lightbox = api;
  }
  measure();
  // Focus moves in, on the dialog itself: a stray Space or Enter (a jump, a habit) presses nothing,
  // Esc closes, Tab reaches the buttons.
  root.focus({ preventScroll: true });
  return api;
}

/**
 * Makes a picture link open the lightbox: a plain click, Enter (the link's own click) or Space.
 * Modified and middle clicks keep the link's new tab. `opts` go to openLightbox (src from the href);
 * onOpen(box) hears each open. Returns a function that opens it.
 */
export function lightboxLink(link, { onOpen = () => {}, ...opts } = {}) {
  const show = () => {
    const box = openLightbox({ src: link.getAttribute('href'), opener: link, doc: link.ownerDocument || globalThis.document, ...opts });
    onOpen(box);
    return box;
  };
  link.addEventListener('click', (ev) => {
    if (!plainClick(ev)) return;
    ev.preventDefault();
    show();
  });
  // Space is a button's key, not a link's: opened on its release, so the release cannot press the close button.
  link.addEventListener('keydown', (ev) => { if (ev.key === ' ') ev.preventDefault(); });
  link.addEventListener('keyup', (ev) => {
    if (ev.key !== ' ') return;
    ev.preventDefault();
    show();
  });
  return show;
}
