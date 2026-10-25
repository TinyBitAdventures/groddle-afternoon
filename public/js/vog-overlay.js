/**
 * G228: a location event's VOG ("voice of Glitch") overlay.
 *
 * Sources:
 * - glitch-GameServerJS locations/inc_events.js 448-456 sends each pc_vog
 *   action to events_VOGPlayer 556-600: the text split on '//', one
 *   '<p align="center"><span class="nuxp_vog">' line each, as a vp_overlay
 *   with duration 0, locking, width 500, x '50%', y '50%', click_to_advance,
 *   click_to_advance_bottom, background_color '#000000' at background_alpha
 *   0.3, and the next_event as its done_payload.
 * - glitch-client view/gameoverlay/InWindowAnnouncementOverlay.as refresh
 *   347-374: a VP_OVERLAY covers the location viewport (gutter_w, header_h,
 *   loc_vp_w x loc_vp_h) and fills it with background_color at
 *   background_alpha; placeNormally 260-305: x/y '50%' put the text's centre
 *   in the middle of that view; showText 378-457: the text is annc.width wide
 *   and click_to_advance_bottom hangs the "Click anywhere..." button
 *   (advance_button_bottom 71-85: advancer triangle on the left, a grey drop
 *   button 30 px tall, not itself clickable) centred under the text.
 *   at_bottom is a layering flag for location overlays (Announcement.as 136),
 *   not a position.
 * - AbstractAnnouncementOverlay.as onFadeInComplete 482-525: with
 *   click_to_advance and locking, a click on the overlay or the game view and
 *   any key (allKeyHandler 612-627: not WASD, arrows or Space) shows the next
 *   line (advance 295-322), and after the last one the overlay finishes. The
 *   overlay holds the focus, so the avatar stands still meanwhile.
 *   Announcement.as 149: fade_in_sec .2.
 * - TSMainView.as moveMoveStarted 1612: AnnouncementController
 *   cancelAllOverlaysWeCan, so a street change drops it (no done_payload).
 */

export const VOG_WIDTH = 500;
export const VOG_FADE_COLOR = '#000000';
export const VOG_FADE_ALPHA = 0.3;
export const VOG_ADVANCE_LABEL = 'Click anywhere...';
export const VOG_FADE_MS = 200;
/** Location viewport width the 500 px text width is measured against (game.js VIEW_W). */
export const VOG_VIEW_W = 960;

/** pc_vog text: one line per '//' (events_VOGPlayer 560). */
export function vogLines(text) {
  if (Array.isArray(text)) return text.map((s) => String(s ?? '').trim()).filter(Boolean);
  return String(text ?? '').split('//').map((s) => s.trim()).filter(Boolean);
}

const HOLD_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar',
  'w', 'W', 'a', 'A', 's', 'S', 'd', 'D',
]);
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS']);

/**
 * What a key does while a VOG is up (allKeyHandler 612-627): movement keys and
 * Space neither move the avatar nor advance; other keys advance. Keys typed
 * into a field (chat) and browser shortcuts pass through.
 * @returns {'pass'|'hold'|'advance'}
 */
export function vogKeyAction(event) {
  if (!event) return 'pass';
  if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return 'pass';
  if (event.metaKey || event.ctrlKey || event.altKey) return 'pass';
  if (MODIFIER_KEYS.has(event.key)) return 'hold';
  if (HOLD_KEYS.has(event.key)) return 'hold';
  if (event.repeat) return 'hold';
  return 'advance';
}

const CSS = `
.vog-overlay{position:absolute;z-index:88;display:flex;align-items:center;justify-content:center;box-sizing:border-box;
  pointer-events:auto;cursor:pointer;opacity:0;transition:opacity ${VOG_FADE_MS}ms ease-out}
.vog-overlay[hidden]{display:none!important}
.vog-overlay.is-shown{opacity:1}
.vog-overlay .vog-box{display:flex;flex-direction:column;align-items:center;gap:2px;
  width:clamp(min(100% - 32px, 280px), ${((VOG_WIDTH / VOG_VIEW_W) * 100).toFixed(2)}%, 100% - 32px)}
.vog-overlay .vog-line{margin:0;text-align:center;color:#fff;
  font:900 clamp(0.85rem,2.2vw + 0.3rem,1.75rem)/1.25 Nunito,'Trebuchet MS',sans-serif;
  text-shadow:0 2px 0 #24303a,0 0 3px #24303a,0 0 14px rgba(0,0,0,.45)}
.vog-overlay .vog-advance{display:inline-flex;align-items:center;gap:8px;height:30px;box-sizing:border-box;margin-top:2px;
  padding:0 14px 0 10px;border-radius:6px;pointer-events:none;
  font:700 13px/1 'Trebuchet MS',Nunito,sans-serif;color:#4a4f52;
  background:linear-gradient(#fbfbfb,#dcdfe0);box-shadow:0 2px 0 #9aa1a3,0 3px 6px rgba(0,0,0,.25)}
.vog-overlay .vog-advance::before{content:'';width:0;height:0;margin-top:1px;
  border-left:8px solid #6b7275;border-top:5px solid transparent;border-bottom:5px solid transparent}
html[data-street-cards] .vog-overlay{visibility:hidden}
@media (prefers-reduced-motion: reduce){.vog-overlay{transition:none}}
`;

/**
 * The overlay. One at a time; a VOG that arrives while one is up waits its
 * turn (each event sends its own announcement).
 * @param {{
 *   document: Document,
 *   mount?: () => Element | null,
 *   rect?: () => { left: number, top: number, width: number, height: number } | null,
 *   setData?: (key: string, value: string) => void,
 *   win?: Window,
 * }} opts
 */
export function createVogOverlay(opts) {
  const doc = opts.document;
  const win = opts.win || doc.defaultView;
  const setData = opts.setData || (() => {});
  let root = null;
  let box = null;
  let line = null;
  let current = null; // { lines, index, onComplete }
  const queue = [];

  function build() {
    if (root) return;
    if (!doc.getElementById('vog-overlay-css')) {
      const style = doc.createElement('style');
      style.id = 'vog-overlay-css';
      style.textContent = CSS;
      doc.head.appendChild(style);
    }
    root = doc.createElement('div');
    root.id = 'vog-overlay';
    root.className = 'vog-overlay';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-label', 'Announcement');
    box = doc.createElement('div');
    box.className = 'vog-box';
    line = doc.createElement('p');
    line.className = 'vog-line';
    const advanceLabel = doc.createElement('span');
    advanceLabel.className = 'vog-advance';
    advanceLabel.textContent = VOG_ADVANCE_LABEL;
    box.appendChild(line);
    box.appendChild(advanceLabel);
    root.appendChild(box);
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      advance();
    });
    (opts.mount?.() || doc.body).appendChild(root);
  }

  function place() {
    if (!root || root.hidden) return;
    const r = opts.rect?.();
    if (!r) {
      Object.assign(root.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
    } else {
      Object.assign(root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
  }

  function onKey(e) {
    if (!current) return;
    const act = vogKeyAction(e);
    if (act === 'pass') return;
    // Locking: the overlay has the focus, so no key reaches the street.
    e.stopImmediatePropagation();
    e.preventDefault();
    if (act === 'advance') advance();
  }

  function showLine() {
    line.textContent = current.lines[current.index];
    setData('vogOverlay', `${current.index + 1}/${current.lines.length}:${current.lines[current.index]}`);
  }

  function start(next) {
    build();
    current = next;
    root.style.background = `${hexToRgba(next.fadeColor, next.fadeAlpha)}`;
    box.style.width = '';
    if (next.width && next.width !== VOG_WIDTH) {
      box.style.width = `clamp(min(100% - 32px, 280px), ${((next.width / VOG_VIEW_W) * 100).toFixed(2)}%, 100% - 32px)`;
    }
    showLine();
    root.hidden = false;
    place();
    root.classList.remove('is-shown');
    win.requestAnimationFrame?.(() => { if (current === next) root.classList.add('is-shown'); });
    win.addEventListener('keydown', onKey, { capture: true });
    win.addEventListener('resize', place);
  }

  function hide() {
    win.removeEventListener('keydown', onKey, { capture: true });
    win.removeEventListener('resize', place);
    if (!root) return;
    root.classList.remove('is-shown');
    root.hidden = true;
    setData('vogOverlay', '');
  }

  function advance() {
    if (!current) return false;
    if (current.index < current.lines.length - 1) {
      current.index += 1;
      showLine();
      return true;
    }
    const done = current.onComplete;
    current = null;
    hide();
    setData('vogLast', 'done');
    if (typeof done === 'function') done();
    if (!current && queue.length) start(queue.shift());
    return true;
  }

  return {
    /** Show a VOG: { lines | text, onComplete, width, fadeColor, fadeAlpha }. */
    show({ lines, text, onComplete, width = VOG_WIDTH, fadeColor = VOG_FADE_COLOR, fadeAlpha = VOG_FADE_ALPHA } = {}) {
      const list = vogLines(lines ?? text);
      if (!list.length) {
        if (typeof onComplete === 'function') onComplete();
        return false;
      }
      const next = { lines: list, index: 0, onComplete, width, fadeColor, fadeAlpha };
      if (current) queue.push(next);
      else start(next);
      return true;
    },
    advance,
    /** A street change: drop the one up and any waiting, without their next events. */
    cancel() {
      const had = Boolean(current) || queue.length > 0;
      current = null;
      queue.length = 0;
      hide();
      if (had) setData('vogLast', 'cancelled');
      return had;
    },
    isOpen: () => Boolean(current),
    text: () => (current ? current.lines[current.index] : ''),
    place,
  };
}

function hexToRgba(color, alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha)));
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color || ''));
  if (!m) return `rgba(0, 0, 0, ${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
