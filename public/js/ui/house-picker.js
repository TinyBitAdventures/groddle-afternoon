/**
 * The house picker (G796): the Customize window for your house on your home street, as the
 * client's ChassisManager ran it for a furniture_chassis (glitch-client port/ChassisManager.as,
 * view/ChassisPickerUI.as, data/house/ConfigOption.as). The window docks at the side with no
 * dimming and the street shows every change on the house at once (ChassisManager start(),
 * scaleVP); a card per house style (ChassisPickerUI: the styles of the furniture_upgrade_start
 * list, each drawn facing the way the house does, ChassisPickerUI.as 294), then one row per
 * part with its label, a dot per choice and back / next buttons that wrap round
 * (ConfiggerChoiceElementUI), then Flip and Randomize (ConfiggerUI "toss in the flip").
 *
 * The window draws nothing on the street and keeps no state: `getHouse()` gives the house as
 * it stands ({ chassis, config, facingRight }) and `apply(next, change)` makes a change (the
 * homes feature saves it, redraws the street and tells visitors). Classic's look for it is in
 * css/classic.css (.house-picker).
 */

import {
  HOUSE_ART_DIR,
  HOUSE_STYLES,
  HOUSE_STYLE_IDS,
  composeHouse,
  defaultHouseConfig,
  flipHouse,
  houseBounds,
  houseConfigRows,
  houseLabel,
  normalizeHouse,
  randomHouseConfig,
  setHouseStyle,
  stepHouseConfig,
} from '../home-house.js?v=3c88c47c';
import { CHASSIS_ICONS } from '../chassis-icons.js?v=1a19ac08';

export const HOUSE_PICKER_TEXT = Object.freeze({
  title: 'Customize your house',
  // ChassisManager.start(): "You are in House Changing Mode".
  mode: 'You are in House Changing Mode',
  flip: 'Flip',
  flipTip: 'Turn it around',
  random: 'Randomize',
  note: 'Every house and every part is free here. In the original most houses cost credits.',
});

const CSS = `
.house-picker{position:fixed;inset:0;z-index:var(--z-panel);display:flex;justify-content:flex-start;align-items:flex-start;padding:var(--sp-4);pointer-events:none}
.house-picker[hidden]{display:none}
.house-picker .hp-card{pointer-events:auto;width:min(390px,94vw);max-height:100%;overflow:auto;isolation:isolate;display:flex;flex-direction:column;gap:var(--sp-3);padding:var(--sp-5);border-radius:var(--radius-md);background:var(--surface-card);border:1px solid var(--border);box-shadow:var(--shadow-2);color:var(--text)}
.house-picker .hp-head{display:flex;align-items:flex-start;gap:var(--sp-3)}
.house-picker .hp-head>div{flex:1 1 auto}
.house-picker .hp-kicker{margin:0;font-size:var(--fs-sm);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--c-gold-55)}
.house-picker h2{margin:0;font-size:var(--fs-lg)}
.house-picker button{font:inherit;font-size:var(--fs-sm);font-weight:700;border-radius:var(--radius-md);border:1px solid var(--c-gold-78);background:var(--surface-bright);color:var(--c-umber-45);padding:.3rem var(--sp-4);cursor:pointer}
.house-picker .hp-x{border:0;background:transparent;font-size:var(--fs-xl);line-height:var(--lh-none);padding:0 var(--sp-2);color:var(--text-muted)}
.house-picker .hp-body{isolation:isolate}
.house-picker .hp-styles{isolation:isolate;display:grid;grid-template-columns:repeat(5,1fr);gap:var(--sp-2)}
.house-picker .hp-style{display:flex;flex-direction:column;align-items:center;gap:var(--sp-1);padding:var(--sp-2) var(--sp-1);white-space:normal;font-size:var(--fs-xs);line-height:var(--lh-tight)}
.house-picker .hp-style[aria-pressed="true"]{background:var(--c-cream-96c);border-color:var(--c-gold-79);box-shadow:0 0 0 2px color-mix(in srgb, var(--c-gold-79) 35%, transparent)}
.house-picker .hp-thumb{position:relative;display:block;width:100%;height:52px;overflow:hidden}
.house-picker .hp-thumb>i{position:absolute;left:50%;bottom:0;display:block}
.house-picker .hp-thumb img{position:absolute;max-width:none}
.house-picker .hp-rows{display:grid;gap:var(--sp-2)}
.house-picker .hp-row{display:grid;grid-template-columns:1fr auto 30px 30px;gap:var(--sp-3);align-items:center;padding:var(--sp-2) .45rem;border:1px solid var(--border);border-radius:var(--radius-md);background:color-mix(in srgb, var(--surface-bright) 86%, transparent)}
.house-picker .hp-row b{display:block;font-size:var(--fs-md)}
.house-picker .hp-row small{font-size:var(--fs-xs);color:var(--text-muted)}
.house-picker .hp-row button{padding:var(--sp-1) 0;font-size:var(--fs-lg);line-height:var(--lh-none)}
.house-picker .hp-dots{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}
.house-picker .hp-dots i{width:6px;height:6px;border-radius:var(--radius-round);background:var(--c-slate-74);opacity:.4}
.house-picker .hp-dots i.is-on{opacity:1}
.house-picker .hp-special{display:flex;justify-content:center;gap:var(--sp-5)}
.house-picker .hp-special button{display:inline-flex;align-items:center;gap:var(--sp-2)}
.house-picker .hp-special button>i{display:block;background:var(--hp-icon) center/contain no-repeat;opacity:.4}
.house-picker .hp-special button:hover>i,.house-picker .hp-special button:focus-visible>i{background-image:var(--hp-icon-hover);opacity:1}
.house-picker [data-hp-flip]>i{width:20px;height:16px}
.house-picker [data-hp-random]>i{width:18px;height:14px}
.house-picker .hp-note{margin:0;font-size:var(--fs-sm);color:var(--text-muted)}
@media (max-width:480px){.house-picker .hp-styles{grid-template-columns:repeat(4,1fr)}}
:root.touch-phone .house-picker{z-index:calc(var(--z-panel) + 2)}
:root.touch-phone .house-picker .hp-card{gap:var(--sp-2);padding:var(--sp-3);box-shadow:var(--shadow-3)}
:root.touch-phone .house-picker .hp-kicker{font-size:var(--fs-xs)}
:root.touch-phone .house-picker h2{font-size:var(--fs-md)}
:root.touch-phone .house-picker .hp-styles{display:flex;gap:var(--sp-2);overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding-bottom:2px;flex:none}
:root.touch-phone .house-picker .hp-style{flex:0 0 74px;scroll-snap-align:start;padding:var(--sp-1)}
:root.touch-phone .house-picker .hp-thumb{height:40px}
:root.touch-phone .house-picker .hp-body{display:flex;flex-direction:column;gap:var(--sp-2);min-height:0;overflow:auto;overscroll-behavior:contain}
:root.touch-phone .house-picker .hp-row{padding:var(--sp-1) var(--sp-2)}
:root.touch-phone .house-picker .hp-row b{font-size:var(--fs-sm)}
:root.touch-phone .house-picker .hp-row button{min-height:32px}
:root.touch-phone[data-ui="modern"]:has(#house-picker:not([hidden])) :is(.pack-bar,.touch-controls){visibility:hidden}
@media (orientation:portrait){
:root.touch-phone .house-picker{align-items:flex-end;padding:0}
:root.touch-phone .house-picker .hp-card{width:100%;height:min(44dvh,380px);max-height:none;overflow:hidden;border-radius:var(--radius-md) var(--radius-md) 0 0;border-bottom:0;padding-bottom:calc(var(--sp-3) + var(--safe-b,0px));padding-left:calc(var(--sp-3) + var(--safe-l,0px));padding-right:calc(var(--sp-3) + var(--safe-r,0px))}
}
@media (orientation:landscape){
:root.touch-phone .house-picker{align-items:stretch;padding:calc(var(--hud-h,44px) + var(--sp-2) + var(--safe-t,0px)) 0 calc(var(--sp-2) + var(--safe-b,0px)) calc(var(--sp-2) + var(--safe-l,0px))}
:root.touch-phone .house-picker .hp-card{width:min(300px,40vw);max-height:none;overflow:hidden}
}
`;

let panel = null;
let opts = null;

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

/**
 * A small picture of a house: its pieces as images (composeHouse), scaled to fit `h` px tall
 * and `w` wide, standing on the box's bottom middle. PURE apart from the DOM it returns.
 */
export function houseThumb(house, { w = 64, h = 52 } = {}) {
  const ops = composeHouse(house.chassis, house.config, house.facingRight);
  const b = houseBounds(ops);
  const k = Math.min(h / Math.max(1, b.h), w / Math.max(1, b.w));
  const box = el('span', { class: 'hp-thumb', 'aria-hidden': 'true' });
  const stage = el('i');
  stage.style.width = `${Math.round(b.w * k)}px`;
  stage.style.height = `${Math.round(b.h * k)}px`;
  stage.style.marginLeft = `${-Math.round((b.w * k) / 2)}px`;
  for (const op of ops) {
    const img = el('img', { src: `${HOUSE_ART_DIR}${op.file}`, alt: '', loading: 'lazy' });
    const sx = Math.abs(op.scaleX) * k;
    const sy = Math.abs(op.scaleY) * k;
    // The piece's left / top in the box: its registration point at (x, y), drawn mirrored when scaleX < 0.
    const left = op.scaleX < 0 ? op.x - (1 - op.anchorX) * op.w * Math.abs(op.scaleX) : op.x - op.anchorX * op.w * op.scaleX;
    const top = op.y - op.anchorY * op.h * op.scaleY;
    img.style.left = `${((left - b.l) * k).toFixed(1)}px`;
    img.style.top = `${((top - b.t) * k).toFixed(1)}px`;
    img.style.width = `${(op.w * sx).toFixed(1)}px`;
    img.style.height = `${(op.h * sy).toFixed(1)}px`;
    if (op.scaleX < 0) img.style.transform = 'scaleX(-1)';
    stage.append(img);
  }
  box.append(stage);
  return box;
}

function ensurePanel() {
  if (panel || typeof document === 'undefined') return panel;
  if (!document.getElementById('hp-css')) {
    const style = document.createElement('style');
    style.id = 'hp-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  panel = el('div', { class: 'house-picker', id: 'house-picker', hidden: true });
  panel.innerHTML = `<div class="hp-card" role="dialog" aria-labelledby="hp-title">
    <div class="hp-head"><div><p class="hp-kicker" data-hp-kicker></p><h2 id="hp-title"></h2></div>
    <button type="button" class="hp-x" data-hp-close aria-label="Close">×</button></div>
    <div class="hp-body" data-hp-body></div>
  </div>`;
  panel.querySelector('#hp-title').textContent = HOUSE_PICKER_TEXT.title;
  (document.getElementById('make-panel')?.parentElement || document.body).appendChild(panel);
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-hp-close]')) closeHousePicker();
  });
  // G1178: turning the phone moves the sheet (bottom upright, left sideways): the street follows.
  window.addEventListener('resize', () => {
    if (panel && !panel.hidden) syncDock();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hidden) {
      e.stopPropagation();
      closeHousePicker();
    }
  }, true);
  return panel;
}

/**
 * PURE (G1178, report #625): the room the window takes off the street on a phone, docked as Glitch
 * docked its configger beside the house (ChassisManager.as scaleVP): upright a sheet along the
 * bottom (its height from its top to the screen's bottom), sideways a column at the left (its width
 * from the screen's left to its right edge). `card` and `root` are rects (the card's and #game-root's);
 * null when the card is not laid out.
 * @returns {{ side: 'bottom' | 'left', css: number } | null}
 */
export function housePickerDockOf(card, root, upright) {
  if (!card || !root || !(card.width > 0) || !(card.height > 0)) return null;
  const css = upright ? Math.round(root.bottom - card.top) : Math.round(card.right - root.left);
  return css > 0 ? { side: upright ? 'bottom' : 'left', css } : null;
}

/** The window's dock on a phone now (housePickerDockOf), null on a computer or when it is shut. */
export function housePickerDock() {
  if (!panel || panel.hidden || typeof document === 'undefined') return null;
  if (!document.documentElement.classList.contains('touch-phone')) return null;
  const card = panel.querySelector('.hp-card')?.getBoundingClientRect();
  const root = (document.getElementById('game-root') || document.documentElement).getBoundingClientRect();
  const upright = Boolean(window.matchMedia?.('(orientation: portrait)')?.matches);
  return housePickerDockOf(card, root, upright);
}

let lastDock = '';
/** Tell the homes feature where the window sits (opts.onDock), once per change. */
function syncDock() {
  if (!opts?.onDock) return;
  const dock = housePickerDock();
  const key = dock ? `${dock.side}:${dock.css}` : '';
  if (key === lastDock) return;
  lastDock = key;
  opts.onDock(dock);
}

function change(next, what) {
  opts?.apply?.(normalizeHouse(next), what);
  render();
}

function render() {
  if (!panel || panel.hidden || !opts) return;
  const house = normalizeHouse(opts.getHouse());
  panel.querySelector('[data-hp-kicker]').textContent = houseLabel(house);
  const body = panel.querySelector('[data-hp-body]');
  body.replaceChildren();
  // ChassisPickerUI: every style, each pictured facing the way your house does.
  const grid = el('div', { class: 'hp-styles', role: 'group', 'aria-label': 'House styles' });
  for (const id of HOUSE_STYLE_IDS) {
    const style = HOUSE_STYLES[id];
    const b = el('button', { type: 'button', class: 'hp-style', 'aria-pressed': house.chassis === id ? 'true' : 'false', title: style.name, dataset: { hpStyle: id } });
    b.append(houseThumb({ chassis: id, config: defaultHouseConfig(id), facingRight: house.facingRight }), el('span', {}, style.name));
    b.addEventListener('click', () => {
      if (house.chassis === id) return;
      const next = { ...house };
      setHouseStyle(next, id);
      change(next, 'style');
    });
    grid.append(b);
  }
  body.append(grid);
  const rows = el('div', { class: 'hp-rows', dataset: { hpRows: house.chassis } });
  for (const row of houseConfigRows(house.chassis)) {
    const cur = house.config[row.key];
    const line = el('div', { class: 'hp-row', dataset: { hpPart: row.key } });
    const label = el('div');
    const dots = el('span', { class: 'hp-dots', 'aria-hidden': 'true' });
    for (let i = 1; i <= row.choices; i += 1) dots.append(el('i', { class: i === cur ? 'is-on' : '' }));
    label.append(el('b', {}, row.label), dots);
    const step = (dir) => change({ ...house, config: stepHouseConfig(house.chassis, house.config, row.key, dir) }, 'part');
    const prev = el('button', { type: 'button', 'aria-label': `Previous ${row.label}`, dataset: { hpStep: `${row.key}:-1` } }, '‹');
    const next = el('button', { type: 'button', 'aria-label': `Next ${row.label}`, dataset: { hpStep: `${row.key}:1` } }, '›');
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    line.append(label, el('small', {}, `${cur} of ${row.choices}`), prev, next);
    rows.append(line);
  }
  body.append(rows);
  const tools = el('div', { class: 'hp-special' });
  const iconButton = (text, data, icon, hover, title) => {
    const b = el('button', { type: 'button', dataset: data, title });
    const i = el('i', { 'aria-hidden': 'true' });
    i.style.setProperty('--hp-icon', `url("${icon}")`);
    i.style.setProperty('--hp-icon-hover', `url("${hover}")`);
    b.append(i, el('span', {}, text));
    return b;
  };
  const flip = iconButton(HOUSE_PICKER_TEXT.flip, { hpFlip: house.facingRight ? 'right' : 'left' }, CHASSIS_ICONS.chassis_flip, CHASSIS_ICONS.chassis_flip_hover, HOUSE_PICKER_TEXT.flipTip);
  flip.addEventListener('click', () => {
    const next = { ...house };
    flipHouse(next);
    change(next, 'flip');
  });
  const random = iconButton(HOUSE_PICKER_TEXT.random, { hpRandom: '1' }, CHASSIS_ICONS.chassis_randomize, CHASSIS_ICONS.chassis_randomize_hover, '');
  random.addEventListener('click', () => change({ ...house, config: randomHouseConfig(house.chassis) }, 'random'));
  tools.append(flip, random);
  body.append(tools, el('p', { class: 'hp-note' }, HOUSE_PICKER_TEXT.note));
  syncDock();
}

/**
 * Open the window: { getHouse, apply(next, change), onClose, onDock(dock) }. `onDock` hears where
 * the window docks on a phone (housePickerDock) on opening and whenever that changes, and null on
 * closing.
 */
export function openHousePicker(options) {
  if (!ensurePanel()) return false;
  opts = options;
  lastDock = '';
  panel.hidden = false;
  render();
  return true;
}

export function closeHousePicker() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  const done = opts?.onClose;
  if (lastDock) opts?.onDock?.(null);
  lastDock = '';
  opts = null;
  done?.();
}

export function housePickerOpen() {
  return Boolean(panel && !panel.hidden);
}

/** Redraw the window after the house changed from outside it. */
export function refreshHousePicker() {
  render();
}
