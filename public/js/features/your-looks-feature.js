/**
 * Your looks (ticket 59): the looks you have worn, as pictures in the
 * character builder, to switch back to in one click or remove, as the
 * original's Your looks (glitch-client ImaginationYourLooksUI.as, the rules
 * in js/your-looks.js).
 *
 * - The record is this feature's save slice (systems.features['your-looks']),
 *   so it goes wherever the character's save goes: the browser in solo, the
 *   site in multiplayer. It holds each look's parts and colours, never a
 *   picture.
 * - A look goes on file after five minutes worn (counted while the game
 *   runs, onTick, on the look worn on the street: engine.wornLook, not the
 *   builder's draft). A save from before Your looks starts with the look it
 *   wears on file ("All we have on file is your current look").
 * - The pictures are the game's own: the look standing still, drawn by the
 *   avatar compositor (engine.lookPortrait, the home card's portrait path)
 *   at the client's 100x144 (AvatarLookUI.as 26-27), one after another when
 *   the list shows, and kept for the session.
 * - Click a picture (Enter or Space on it) to wear it; Remove asks first
 *   (the client's ConfirmationDialog words), No being the default and Esc.
 * - Shift+L opens the builder at Your looks (TSMainView.as shiftLKeyHandler
 *   980-994 opened the client's Your looks).
 *
 * QA: canvas data yourLooks (looks on file), yourLooksPast (shown),
 * yourLooksWearing (ms of the worn look so far), yourLooksLast;
 * window.groddleYourLooks: { state(), keepNow(), wear(i), remove(i) };
 * &yourlooksdemo=N puts N sample looks on file (the builder's presets).
 */
import {
  YOUR_LOOKS_KEEP_MS, YOUR_LOOKS_TEXT, cleanLook, createYourLooks, normalizeYourLooks, noteWear, pastLooks,
  recordLook, removeLook, totalLine, wearLook,
} from '../your-looks.js?v=fd9949a4';
import { APPEARANCE_PRESETS } from '../character-builder.js?v=3c78a868';

export const YOUR_LOOKS_FEATURE_ID = 'your-looks';

/** AvatarLookUI.as WIDTH/HEIGHT: the picture's size, in CSS px. */
export const LOOK_TILE = Object.freeze({ w: 100, h: 144 });

let state = createYourLooks();
let ui = null;
let engineRef = null;
let last = '';
let publishedAt = 0;

const STYLE = `
.your-looks { margin: var(--sp-6) 0 0; padding: var(--sp-5) 0 0; border-top: 1px solid var(--border-strong); }
.your-looks[hidden], .your-looks [hidden] { display: none !important; }
.your-looks-head { display: flex; align-items: baseline; gap: var(--sp-4); flex-wrap: wrap; }
.your-looks-title { margin: 0; font-size: var(--fs-md); font-weight: 800; }
.your-looks-total { margin: 0; color: var(--text-muted); font-size: var(--fs-sm); }
.your-looks-row { display: flex; gap: var(--sp-4); margin: var(--sp-4) 0 0; padding: var(--sp-2) var(--sp-1) var(--sp-4); overflow-x: auto; scroll-snap-type: x proximity; list-style: none; }
.your-look { flex: none; display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); scroll-snap-align: start; }
.your-look-wear { display: block; width: 100px; height: 144px; margin: 0; padding: 0; border: 2px solid var(--border-strong); border-radius: var(--radius-lg); background: radial-gradient(ellipse at 50% 72%, var(--surface-moss) 0%, var(--c-lime-85c) 72%, var(--c-lime-76b) 100%); cursor: pointer; overflow: hidden; }
.your-look-wear:hover { border-color: var(--status-good); }
.your-look-wear:focus-visible, .your-look-remove:focus-visible, .your-looks-confirm button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.your-look-wear img { display: block; width: 100%; height: 100%; object-fit: contain; }
.your-look-wear.is-loading img { visibility: hidden; }
.your-look-remove { margin: 0; padding: var(--sp-1) var(--sp-4); border: 1px solid var(--border-strong); border-radius: var(--radius-pill); background: var(--surface-card); color: var(--text); font: inherit; font-size: var(--fs-xs); font-weight: 700; cursor: pointer; }
.your-look-remove:hover { border-color: var(--c-red-55); color: var(--c-red-55); }
.your-looks-note { margin: var(--sp-2) 0 0; color: var(--text-muted); font-size: var(--fs-xs); }
.your-looks-confirm { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-3) var(--sp-6); align-items: center; margin: var(--sp-4) 0 0; padding: var(--sp-5); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); background: var(--surface-parchment); }
.your-looks-confirm img { grid-row: span 3; width: 70px; height: 101px; object-fit: contain; }
.your-looks-confirm h4 { margin: 0; font-size: var(--fs-md); }
.your-looks-confirm p { margin: 0; font-size: var(--fs-sm); }
.your-looks-confirm-actions { display: flex; gap: var(--sp-4); flex-wrap: wrap; }
`;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function setData(engine, key, value) {
  engine?.setData?.(key, String(value));
}

function publish(engine) {
  const past = pastLooks(state, engine?.wornLook || {});
  setData(engine, 'yourLooks', state.list.length);
  setData(engine, 'yourLooksPast', past.length);
  setData(engine, 'yourLooksWearing', Math.round(state.wearing.ms));
  setData(engine, 'yourLooksLast', last);
}

function panel() {
  return typeof document === 'undefined' ? null : document.getElementById('avatar-panel');
}

function panelOpen() {
  const p = panel();
  return Boolean(p && !p.hidden);
}

/** The section, once, after the builder's layout in its card. */
function mount(engine) {
  if (ui || typeof document === 'undefined') return ui;
  const host = panel();
  const card = host?.querySelector('.avatar-card');
  if (!card) return null;
  const style = el('style');
  style.id = 'your-looks-css';
  style.textContent = STYLE;
  document.head.append(style);
  const box = el('section', 'your-looks');
  box.id = 'avatar-your-looks';
  box.setAttribute('aria-labelledby', 'your-looks-title');
  box.dataset.yourLooks = '';
  const head = el('div', 'your-looks-head');
  const title = el('h3', 'your-looks-title', YOUR_LOOKS_TEXT.title);
  title.id = 'your-looks-title';
  title.tabIndex = -1;
  const total = el('p', 'your-looks-total');
  total.dataset.yourLooksTotal = '';
  head.append(title, total);
  const row = el('ul', 'your-looks-row');
  row.dataset.yourLooksRow = '';
  row.setAttribute('aria-label', YOUR_LOOKS_TEXT.title);
  const note = el('p', 'your-looks-note', `${YOUR_LOOKS_TEXT.auto} ${YOUR_LOOKS_TEXT.removeNote}`);
  const confirm = el('div', 'your-looks-confirm');
  confirm.hidden = true;
  confirm.setAttribute('role', 'alertdialog');
  confirm.setAttribute('aria-labelledby', 'your-looks-confirm-title');
  confirm.setAttribute('aria-describedby', 'your-looks-confirm-text');
  confirm.dataset.yourLooksConfirm = '';
  box.append(head, row, note, confirm);
  const layout = card.querySelector('.avatar-builder-layout');
  if (layout) layout.after(box);
  else card.append(box);
  // Esc in the question is its No (ConfirmationDialogVO escape_value false), not the builder's close.
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !confirm.hidden) {
      e.preventDefault();
      e.stopPropagation();
      closeConfirm(true);
    }
    // A focused picture's Enter or Space is its own, never the street's verbs or a jump.
    if ((e.key === 'Enter' || e.key === ' ') && e.target?.closest?.('button')) e.stopPropagation();
  });
  ui = { box, title, total, row, confirm, pending: null };
  // Drawn again whenever the builder opens.
  new MutationObserver(() => { if (panelOpen()) render(engine); }).observe(host, { attributes: true, attributeFilter: ['hidden'] });
  return ui;
}

/** Pictures one after another, so opening the builder never stalls on 36 drawings. */
let drawQueue = Promise.resolve();
function drawInto(engine, img, button, look) {
  button.classList.add('is-loading');
  drawQueue = drawQueue.then(async () => {
    if (!img.isConnected) return;
    const url = await Promise.resolve(engine.lookPortrait?.(look, LOOK_TILE, 6)).catch(() => null);
    if (url && img.isConnected) img.src = url;
    button.classList.remove('is-loading');
  }).catch(() => {});
}

function render(engine) {
  if (!mount(engine)) return;
  const past = pastLooks(state, engine.wornLook || {});
  ui.total.textContent = totalLine(past.length);
  ui.row.replaceChildren();
  ui.row.hidden = past.length === 0;
  past.forEach((entry, i) => {
    const li = el('li', 'your-look');
    li.dataset.yourLook = String(i);
    const wear = el('button', 'your-look-wear');
    wear.type = 'button';
    wear.title = YOUR_LOOKS_TEXT.switchTip;
    wear.setAttribute('aria-label', `${YOUR_LOOKS_TEXT.switchTip} (${i + 1} of ${past.length})`);
    wear.dataset.yourLookWear = String(i);
    const img = el('img');
    img.alt = '';
    img.width = LOOK_TILE.w;
    img.height = LOOK_TILE.h;
    img.draggable = false;
    wear.append(img);
    wear.addEventListener('click', () => wearAt(engine, i));
    const remove = el('button', 'your-look-remove', YOUR_LOOKS_TEXT.remove);
    remove.type = 'button';
    remove.title = YOUR_LOOKS_TEXT.removeTip;
    remove.setAttribute('aria-label', `${YOUR_LOOKS_TEXT.removeTip} (${i + 1} of ${past.length})`);
    remove.dataset.yourLookRemove = String(i);
    remove.addEventListener('click', () => askRemove(engine, i, img.src));
    li.append(wear, remove);
    ui.row.append(li);
    drawInto(engine, img, wear, entry.look);
  });
  if (ui.pending && !past.some((e) => JSON.stringify(e.look) === ui.pending)) closeConfirm(false);
  publish(engine);
}

function wearAt(engine, i) {
  const entry = pastLooks(state, engine.wornLook || {})[i];
  if (!entry) return false;
  const look = cleanLook(entry.look);
  // The look you leave goes on file if you kept it five minutes (noteWear already did), else not.
  wearLook(state, look, Date.now());
  engine.wearLook?.(look);
  last = `wear:${i}`;
  engine.toast?.(YOUR_LOOKS_TEXT.switching, 2200);
  engine.save?.();
  render(engine);
  ui?.row.querySelector('.your-look-wear')?.focus({ preventScroll: true });
  return true;
}

function askRemove(engine, i, picture = '') {
  const entry = pastLooks(state, engine.wornLook || {})[i];
  if (!entry || !ui) return false;
  ui.pending = JSON.stringify(entry.look);
  const c = ui.confirm;
  c.replaceChildren();
  const img = el('img');
  img.alt = '';
  if (picture) img.src = picture;
  const h = el('h4', '', YOUR_LOOKS_TEXT.confirmTitle);
  h.id = 'your-looks-confirm-title';
  const p = el('p', '', YOUR_LOOKS_TEXT.confirmText);
  p.id = 'your-looks-confirm-text';
  const actions = el('div', 'your-looks-confirm-actions');
  const no = el('button', 'btn-glitch-back', YOUR_LOOKS_TEXT.confirmNo);
  no.type = 'button';
  no.dataset.yourLooksNo = '';
  const yes = el('button', 'btn-glitch-primary', YOUR_LOOKS_TEXT.confirmYes);
  yes.type = 'button';
  yes.dataset.yourLooksYes = '';
  no.addEventListener('click', () => closeConfirm(true));
  yes.addEventListener('click', () => {
    const id = ui.pending;
    const gone = state.list.find((e) => JSON.stringify(e.look) === id);
    if (gone) removeLook(state, gone.look);
    last = `remove:${i}`;
    ui.pending = null;
    c.hidden = true;
    engine.save?.();
    render(engine);
    (ui.row.querySelector(`[data-your-look-wear="${Math.min(i, ui.row.children.length - 1)}"]`) || ui.title).focus({ preventScroll: true });
  });
  actions.append(no, yes);
  c.append(img, h, p, actions);
  c.hidden = false;
  setData(engine, 'yourLooksConfirm', 'open');
  no.focus({ preventScroll: true });
  c.scrollIntoView?.({ block: 'nearest' });
  return true;
}

function closeConfirm(focusBack) {
  if (!ui) return;
  const was = ui.pending;
  ui.pending = null;
  ui.confirm.hidden = true;
  setData(engineRef, 'yourLooksConfirm', 'closed');
  if (focusBack && was) {
    const past = pastLooks(state, engineRef?.wornLook || {});
    const i = past.findIndex((e) => JSON.stringify(e.look) === was);
    (ui.row.querySelector(`[data-your-look-remove="${i}"]`) || ui.title).focus({ preventScroll: true });
  }
}

/** &yourlooksdemo=N: N of the builder's presets on file, an hour apart, the newest first (QA). */
function demo(engine) {
  const n = Math.max(0, Math.min(36, Math.floor(Number(engine.param?.('yourlooksdemo')) || 0)));
  if (!n) return;
  const presets = Object.values(APPEARANCE_PRESETS).map((p) => p.appearance?.vector).filter(Boolean);
  const now = Date.now();
  for (let i = n - 1; i >= 0; i -= 1) recordLook(state, presets[i % presets.length], now - (i + 1) * 3600_000);
  last = `demo:${n}`;
}

export const yourLooksFeature = {
  id: YOUR_LOOKS_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    demo(engine);
    mount(engine);
    if (typeof window !== 'undefined') {
      window.groddleYourLooks = {
        state: () => JSON.parse(JSON.stringify(state)),
        keepNow: () => { const r = noteWear(state, engine.wornLook || {}, YOUR_LOOKS_KEEP_MS, Date.now()); engine.save?.(); if (panelOpen()) render(engine); return r; },
        wear: (i) => wearAt(engine, i),
        remove: (i) => askRemove(engine, i),
      };
    }
    publish(engine);
  },

  save() {
    return JSON.parse(JSON.stringify(state));
  },

  restore(slice, engine) {
    if (slice && typeof slice === 'object') {
      state = normalizeYourLooks(slice);
    } else {
      // A save from before Your looks (or a new game): its look is the one on file.
      state = createYourLooks();
      const worn = engine?.wornLook;
      if (worn) {
        recordLook(state, worn, Date.now());
        state.wearing = { id: JSON.stringify(cleanLook(worn)), ms: YOUR_LOOKS_KEEP_MS };
      }
    }
    if (engine) {
      demo(engine);
      if (panelOpen()) render(engine);
      publish(engine);
    }
  },

  onTick(dtMs, now, engine) {
    if (!engine?.started) return;
    const kept = noteWear(state, engine.wornLook || {}, dtMs, now);
    if (kept) {
      last = 'kept';
      engine.save?.();
      if (panelOpen()) render(engine);
      publish(engine);
      return;
    }
    // The count saves with the game (the slice's wearing), so a reload goes on from it; QA data now and then.
    if (now - publishedAt > 5000) {
      publishedAt = now;
      publish(engine);
    }
  },

  /** Shift+L (game.js clientShortcutKey): the builder at Your looks. */
  showYourLooks(engine) {
    if (!mount(engine) || !panelOpen()) return null;
    render(engine);
    const first = ui.row.querySelector('.your-look-wear');
    (first || ui.title).focus({ preventScroll: true });
    ui.box.scrollIntoView?.({ block: 'nearest' });
    return true;
  },
};
