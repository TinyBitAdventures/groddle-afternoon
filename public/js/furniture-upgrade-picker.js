/**
 * The furniture style picker (G358): glitch-client FurnUpgradeDialog.as with
 * FurnUpgradeChooserUI / FurnUpgradeButton. "Choose a new style": the piece's
 * preview and name on the left, every style on the right (the current one
 * first), and the save button whose words follow the chosen style (see
 * furniture-upgrades.js saveButtonText). Choosing a style previews it on the
 * piece in the room (FurnUpgradeController.setChosenUpgrade); Cancel puts the
 * old look back (cancel), Escape is Cancel. A style that cost credits is
 * bought with currants (lane FURNSELL): the footer shows the purse, "You have
 * N currants" (the dialog's credits_holder, red when short), and the button
 * reads "Change style for N currants", off with "You need more currants"
 * when the purse is short.
 *
 * Ticket 52: for a piece standing in the room the picker is the original's
 * in-place one (FurnUpgradeDialog.as, _loc_mode with new_furn_up on: 336):
 * the piece in the room is the preview, so the dialog is a narrow column
 * (_w 572 - 250 - 10 - 20 = 292, 643-646) with no preview box and a 2-wide
 * chooser (365), centred in the view's height (419) and set beside the piece,
 * to its right (421-427: the piece's half width + 50 past its centre), or to
 * its left where the right has no room. The homes feature moves the camera so
 * the piece and the column both fit (388-409) and keeps the column beside the
 * piece while the camera eases (placeUpgradePicker).
 *
 * DOM only; the rules are js/furniture-upgrades.js and the homes feature
 * applies the choice.
 */

import { listHasPaid, listUpgrades, purseText, saveButtonText, UPGRADE_TEXT } from './furniture-upgrades.js?v=a3788c0d';

/** The in-place column's width (FurnUpgradeDialog.as 643-646: 572 - 250 - 10 - 20). */
export const DOCK_W = 292;
/** Its gap from the piece (FurnUpgradeDialog.as 421-427: half the piece's width + 50 from its centre). */
export const DOCK_GAP = 50;
/** Below this view width the picker keeps its bottom sheet (the CSS media rule). */
export const DOCK_MIN_VIEW = 640;

/**
 * PURE: where the in-place column goes ({ x, y, h, side }, in the area's own px): beside the
 * piece's rect, right first, else left, else whichever side has more room (overlapping the
 * piece's edge rather than leaving the view); vertically centred in the free area.
 * piece / area: { left, right, top, bottom }; w, h: the column's size.
 */
export function dockedPickerSpot({ piece, area, w = DOCK_W, h = 0, gap = DOCK_GAP, margin = 8 } = {}) {
  if (!piece || !area) return null;
  const roomRight = area.right - margin - (piece.right + gap);
  const roomLeft = piece.left - gap - (area.left + margin);
  let side = 'right';
  if (roomRight < w) side = roomLeft >= w || roomLeft > roomRight ? 'left' : 'right';
  let x = side === 'right' ? piece.right + gap : piece.left - gap - w;
  x = Math.max(area.left + margin, Math.min(area.right - margin - w, x));
  const maxH = Math.max(120, area.bottom - area.top - 2 * margin);
  const height = Math.min(h || maxH, maxH);
  const y = Math.round(area.top + (area.bottom - area.top - height) / 2);
  return { x: Math.round(x), y, h: Math.round(maxH), side };
}

const CSS = `
.furn-upgrade{position:absolute;left:50%;top:56px;transform:translateX(-50%);z-index:calc(var(--z-panel) + 11);width:min(572px,calc(100% - 20px));max-height:calc(100% - 150px);display:flex;flex-direction:column;background:var(--surface-card);border-radius:var(--radius-2xl);box-shadow:0 12px 32px color-mix(in srgb, var(--c-sand-24) 28%, transparent);border:1px solid color-mix(in srgb, var(--c-umber-41) 18%, transparent);font-family:var(--font-ui);color:var(--text);overflow:hidden}
.furn-upgrade[hidden]{display:none}
.furn-upgrade header{display:flex;align-items:center;gap:var(--sp-4);padding:9px var(--sp-6) 7px;background:linear-gradient(180deg,var(--surface-parchment),var(--c-cream-91));border-bottom:1px solid color-mix(in srgb, var(--c-umber-41) 15%, transparent)}
.furn-upgrade header h3{margin:0;font-size:var(--fs-base);flex:1}
.furn-upgrade .fu-close{border:none;background:transparent;font-size:var(--fs-xl);cursor:pointer;color:var(--c-sand-48);line-height:var(--lh-none)}
.furn-upgrade .fu-main{flex:1;display:flex;gap:var(--sp-5);min-height:0;padding:var(--sp-5) var(--sp-6)}
.furn-upgrade .fu-prev{flex:0 0 150px;display:flex;flex-direction:column;align-items:center;gap:var(--sp-3)}
.furn-upgrade .fu-prev .fu-box{width:150px;height:150px;border-radius:var(--radius-lg);background:var(--surface-parchment);display:flex;align-items:center;justify-content:center}
.furn-upgrade .fu-prev img{max-width:138px;max-height:138px;object-fit:contain}
.furn-upgrade .fu-prev strong{font-size:var(--fs-md);text-align:center}
.furn-upgrade .fu-grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:var(--sp-3);align-content:start}
.furn-upgrade .fu-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;border:2px solid transparent;background:var(--surface-parchment);border-radius:var(--radius-lg);padding:5px var(--sp-2);cursor:pointer;font:inherit;font-size:var(--fs-xs);line-height:var(--lh-tight);color:var(--c-sand-33);text-align:center}
.furn-upgrade .fu-tile:hover{border-color:var(--mood)}
.furn-upgrade .fu-tile.on{border-color:var(--c-orange-69);background:var(--status-warn-soft)}
.furn-upgrade .fu-tile img{width:64px;height:64px;object-fit:contain}
.furn-upgrade .fu-tile .fu-label{font-weight:700}
.furn-upgrade .fu-tile .fu-price{color:var(--c-sand-51b)}
.furn-upgrade .fu-tile.paid .fu-price{color:var(--c-umber-49);font-weight:700}
.furn-upgrade .fu-tile .fu-new{position:absolute;left:4px;top:3px;font-size:var(--fs-2xs);font-weight:700;background:var(--accent);color:var(--text-inverse);border-radius:var(--radius-sm);padding:0 var(--sp-2)}
.furn-upgrade footer{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-4);padding:var(--sp-4) var(--sp-6) var(--sp-5);border-top:1px solid color-mix(in srgb, var(--c-umber-41) 12%, transparent)}
.furn-upgrade footer button{border:1px solid color-mix(in srgb, var(--c-umber-41) 20%, transparent);background:var(--surface-bright);border-radius:var(--radius-md);padding:var(--sp-3) 11px;font-size:var(--fs-sm);font-weight:700;color:var(--text-brown);cursor:pointer}
.furn-upgrade footer button.primary{background:var(--c-blue-63);border-color:var(--c-blue-63);color:var(--text-inverse)}
.furn-upgrade footer button:disabled{opacity:.45;cursor:not-allowed}
.furn-upgrade .fu-note{flex-basis:100%;margin:0;font-size:var(--fs-sm);color:var(--c-brown-53)}
.furn-upgrade .fu-purse{margin-left:auto;font-size:var(--fs-sm);font-weight:700;color:var(--c-umber-41)}
.furn-upgrade .fu-purse.low{color:var(--c-red-54)}
.furn-upgrade .fu-chosen{display:none;margin:0;padding:var(--sp-3) var(--sp-6) 0;font-weight:700;font-size:var(--fs-sm)}
.furn-upgrade.is-docked{left:0;top:0;transform:none;width:${DOCK_W}px;max-height:none}
.furn-upgrade.is-docked .fu-prev{display:none}
.furn-upgrade.is-docked .fu-chosen{display:block}
.furn-upgrade.is-docked .fu-main{padding:var(--sp-4) var(--sp-5)}
.furn-upgrade.is-docked .fu-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.furn-upgrade.is-docked footer{padding:var(--sp-4) var(--sp-5)}
@media (max-width:640px){.furn-upgrade{top:auto;bottom:106px;max-height:60%}.furn-upgrade .fu-prev{display:none}.furn-upgrade .fu-grid{grid-template-columns:repeat(auto-fill,minmax(84px,1fr))}}
`;

let root = null;
let current = null;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function ensureRoot() {
  if (root || typeof document === 'undefined') return root;
  const host = document.getElementById('game-root') || document.body;
  if (!document.getElementById('furn-upgrade-css')) {
    document.head.append(el('style', { id: 'furn-upgrade-css', text: CSS }));
  }
  root = el('div', { class: 'furn-upgrade', hidden: true, role: 'dialog', 'aria-label': UPGRADE_TEXT.title, 'data-furn-upgrade': '1' });
  host.append(root);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current) {
      event.stopPropagation();
      closeUpgradePicker(true);
    }
  }, true);
  return root;
}

export function upgradePickerOpen() {
  return Boolean(current);
}

/** The open picker's piece id and chosen option id (QA canvas data). */
export function upgradePickerState() {
  return current ? { pieceId: current.piece.id, chosen: current.chosen?.id ?? null } : null;
}

/**
 * Open the picker for a placed piece.
 * opts: { piece, baseLabel, baseArt (path), currants() (the purse, read at
 * each render), onPreview(upgradeId|null), onSave(optionId), onClose(),
 * anchor() / area() (ticket 52: the piece's and the room's client rects, for
 * the in-place column; see placeUpgradePicker) }
 */
export function openUpgradePicker(opts) {
  if (!ensureRoot()) return false;
  const options = listUpgrades(opts.piece, opts.baseLabel);
  current = { ...opts, options, chosen: options.find((row) => row.current) || null };
  render();
  root.hidden = false;
  placeUpgradePicker();
  return true;
}

/**
 * Ticket 52: set the in-place column beside its piece (opts.anchor() the piece's client rect,
 * opts.area() the room's free client rect: under the banner, over the tray). Without an anchor,
 * or on a narrow view, the picker keeps its centred / bottom-sheet place. Returns the spot.
 */
export function placeUpgradePicker() {
  if (!current || !root || root.hidden) return null;
  const host = root.parentElement?.getBoundingClientRect?.();
  const piece = current.anchor?.();
  const area = current.area?.() || host;
  const docked = Boolean(host && piece && area && host.width > DOCK_MIN_VIEW);
  root.classList.toggle('is-docked', docked);
  if (!docked) {
    root.style.left = root.style.top = root.style.maxHeight = '';
    root.dataset.side = '';
    return null;
  }
  const rel = (r) => ({ left: r.left - host.left, right: r.right - host.left, top: r.top - host.top, bottom: r.bottom - host.top });
  const spot = dockedPickerSpot({ piece: rel(piece), area: rel(area), w: root.offsetWidth || DOCK_W, h: root.scrollHeight });
  if (!spot) return null;
  const left = `${spot.x}px`;
  const top = `${spot.y}px`;
  const maxHeight = `${spot.h}px`;
  if (root.style.left !== left) root.style.left = left;
  if (root.style.top !== top) root.style.top = top;
  if (root.style.maxHeight !== maxHeight) root.style.maxHeight = maxHeight;
  root.dataset.side = spot.side;
  return spot;
}

/** The open picker's box on screen (QA), or null. */
export function upgradePickerRect() {
  if (!current || !root || root.hidden) return null;
  const r = root.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, docked: root.classList.contains('is-docked'), side: root.dataset.side || '' };
}

/** Close; `cancel` puts the piece's old look back (FurnUpgradeController.cancel). */
export function closeUpgradePicker(cancel = false) {
  if (!current) return;
  const was = current;
  current = null;
  if (root) root.hidden = true;
  if (cancel) was.onPreview?.(null);
  was.onClose?.();
}

/** Choose an option by id (a click on its button; QA autoplay too). */
export function chooseUpgrade(id) {
  if (!current) return false;
  const option = current.options.find((row) => row.id === String(id));
  if (!option) return false;
  current.chosen = option;
  current.onPreview?.(option.id);
  render();
  return true;
}

function purse() {
  return Math.max(0, Number(current?.currants?.()) || 0);
}

/** The save button (tryToSave). */
export function saveUpgrade() {
  if (!current) return false;
  const button = saveButtonText(current.piece, current.chosen, { currants: purse() });
  if (button.disabled) return false;
  const { chosen, onSave } = current;
  closeUpgradePicker(false);
  onSave?.(chosen.id);
  return true;
}

function artPath(option) {
  return option.art?.path || current.baseArt || '';
}

/**
 * An <img>'s src, with a density srcset for a style's `@3x` file (G448), so it
 * lays out at `zoom` times the piece's 1x size whatever the file's density.
 * The preview draws styles at zoom 2, as it did when they were `@2x` files.
 */
export function artImgAttrs(src, zoom = 1) {
  const m = /@(\d+(?:\.\d+)?)x\.[a-z0-9]+$/i.exec(String(src || '').split('?')[0]);
  return m ? { src, srcset: `${src} ${+(Number(m[1]) / zoom).toFixed(3)}x` } : { src };
}

function render() {
  if (!current || !root) return;
  const chosen = current.chosen;
  const button = saveButtonText(current.piece, chosen, { currants: purse() });
  const header = el('header', {}, [
    el('h3', { text: UPGRADE_TEXT.title }),
    el('button', { type: 'button', class: 'fu-close', 'aria-label': 'Close', text: '×', onclick: () => closeUpgradePicker(true) }),
  ]);
  const preview = el('div', { class: 'fu-prev' }, [
    el('div', { class: 'fu-box' }, [el('img', { ...artImgAttrs(chosen ? artPath(chosen) : current.baseArt || '', 2), alt: '' })]),
    el('strong', { text: chosen?.label || current.baseLabel }),
  ]);
  const grid = el('div', { class: 'fu-grid' }, current.options.map((option) => el('button', {
    type: 'button',
    class: `fu-tile${chosen?.id === option.id ? ' on' : ''}${option.paid ? ' paid' : ''}`,
    title: option.label,
    'data-upgrade': option.id,
    onclick: () => chooseUpgrade(option.id),
  }, [
    option.isNew ? el('span', { class: 'fu-new', text: 'NEW' }) : null,
    el('img', { ...artImgAttrs(artPath(option)), alt: '', loading: 'lazy' }),
    el('span', { class: 'fu-label', text: option.label }),
    el('span', { class: 'fu-price', text: option.text }),
  ])));
  const footer = el('footer', {}, [
    el('button', { type: 'button', class: 'primary', 'data-upgrade-save': '1', disabled: button.disabled, text: button.text, onclick: () => saveUpgrade() }),
    el('button', { type: 'button', text: UPGRADE_TEXT.cancel, onclick: () => closeUpgradePicker(true) }),
    listHasPaid(current.options) ? el('span', { class: `fu-purse${button.short ? ' low' : ''}`, 'data-upgrade-purse': '1', text: purseText(purse()) }) : null,
    button.tip ? el('p', { class: 'fu-note', text: button.tip }) : null,
  ]);
  // Ticket 52: a choice keeps the chooser where it was scrolled to (the tile you clicked stays in view).
  const scrolled = root.querySelector('.fu-grid')?.scrollTop || 0;
  // In place (ticket 52) the piece itself is the preview: the chosen style's name stands over the chooser.
  const chosenName = el('p', { class: 'fu-chosen', 'aria-live': 'polite', text: chosen?.label || current.baseLabel });
  root.replaceChildren(header, chosenName, el('div', { class: 'fu-main' }, [preview, grid]), footer);
  if (scrolled) grid.scrollTop = scrolled;
  placeUpgradePicker();
}
