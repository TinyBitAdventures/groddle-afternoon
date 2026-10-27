/**
 * The furniture style picker (G358): glitch-client FurnUpgradeDialog.as with
 * FurnUpgradeChooserUI / FurnUpgradeButton. "Choose a new style": the piece's
 * preview and name on the left, every style on the right (the current one
 * first), and the save button whose words follow the chosen style (see
 * furniture-upgrades.js saveButtonText). Choosing a style previews it on the
 * piece in the room (FurnUpgradeController.setChosenUpgrade); Cancel puts the
 * old look back (cancel), Escape is Cancel.
 *
 * DOM only; the rules are js/furniture-upgrades.js and the homes feature
 * applies the choice.
 */

import { listUpgrades, saveButtonText, UPGRADE_TEXT } from './furniture-upgrades.js?v=furnup-1';

const CSS = `
.furn-upgrade{position:absolute;left:50%;top:56px;transform:translateX(-50%);z-index:46;width:min(572px,calc(100% - 20px));max-height:calc(100% - 150px);display:flex;flex-direction:column;background:#fffdf7;border-radius:14px;box-shadow:0 12px 32px rgba(40,30,20,.28);border:1px solid rgba(90,70,40,.18);font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;color:#2b2a33;overflow:hidden}
.furn-upgrade[hidden]{display:none}
.furn-upgrade header{display:flex;align-items:center;gap:8px;padding:9px 12px 7px;background:linear-gradient(180deg,#f7ecd6,#efe1c4);border-bottom:1px solid rgba(90,70,40,.15)}
.furn-upgrade header h3{margin:0;font-size:15px;flex:1}
.furn-upgrade .fu-close{border:none;background:transparent;font-size:18px;cursor:pointer;color:#6a5a45;line-height:1}
.furn-upgrade .fu-main{flex:1;display:flex;gap:10px;min-height:0;padding:10px 12px}
.furn-upgrade .fu-prev{flex:0 0 150px;display:flex;flex-direction:column;align-items:center;gap:6px}
.furn-upgrade .fu-prev .fu-box{width:150px;height:150px;border-radius:10px;background:#efe6d4;display:flex;align-items:center;justify-content:center}
.furn-upgrade .fu-prev img{max-width:138px;max-height:138px;object-fit:contain}
.furn-upgrade .fu-prev strong{font-size:13px;text-align:center}
.furn-upgrade .fu-grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;align-content:start}
.furn-upgrade .fu-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;border:2px solid transparent;background:#f6efe2;border-radius:10px;padding:5px 4px;cursor:pointer;font:inherit;font-size:11px;line-height:1.15;color:#3b3328;text-align:center}
.furn-upgrade .fu-tile:hover{border-color:#e0a84a}
.furn-upgrade .fu-tile.on{border-color:#d08a2a;background:#fff3d8}
.furn-upgrade .fu-tile.locked img{opacity:.55;filter:saturate(.5)}
.furn-upgrade .fu-tile img{width:64px;height:64px;object-fit:contain}
.furn-upgrade .fu-tile .fu-label{font-weight:700}
.furn-upgrade .fu-tile .fu-price{color:#6d6252}
.furn-upgrade .fu-tile.locked .fu-price{color:#7a4fb5;font-weight:700}
.furn-upgrade .fu-tile .fu-new{position:absolute;left:4px;top:3px;font-size:9px;font-weight:700;background:#e07a3d;color:#fff;border-radius:6px;padding:0 4px}
.furn-upgrade footer{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px 10px;border-top:1px solid rgba(90,70,40,.12)}
.furn-upgrade footer button{border:1px solid rgba(90,70,40,.2);background:#fff;border-radius:8px;padding:6px 11px;font-size:12.5px;font-weight:700;color:#4a3a28;cursor:pointer}
.furn-upgrade footer button.primary{background:#4a90c8;border-color:#4a90c8;color:#fff}
.furn-upgrade footer button:disabled{opacity:.45;cursor:not-allowed}
.furn-upgrade .fu-note{flex-basis:100%;margin:0;font-size:12px;color:#a0522d}
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
 * opts: { piece, baseLabel, baseArt (path), onPreview(upgradeId|null), onSave(optionId), onClose() }
 */
export function openUpgradePicker(opts) {
  if (!ensureRoot()) return false;
  const options = listUpgrades(opts.piece, opts.baseLabel);
  current = { ...opts, options, chosen: options.find((row) => row.current) || null };
  render();
  root.hidden = false;
  return true;
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

/** The save button (tryToSave). */
export function saveUpgrade() {
  if (!current) return false;
  const button = saveButtonText(current.piece, current.chosen);
  if (button.disabled) return false;
  const { chosen, onSave } = current;
  closeUpgradePicker(false);
  onSave?.(chosen.id);
  return true;
}

function artPath(option) {
  return option.art?.path || current.baseArt || '';
}

function render() {
  if (!current || !root) return;
  const chosen = current.chosen;
  const button = saveButtonText(current.piece, chosen);
  const header = el('header', {}, [
    el('h3', { text: UPGRADE_TEXT.title }),
    el('button', { type: 'button', class: 'fu-close', 'aria-label': 'Close', text: '×', onclick: () => closeUpgradePicker(true) }),
  ]);
  const preview = el('div', { class: 'fu-prev' }, [
    el('div', { class: 'fu-box' }, [el('img', { src: chosen ? artPath(chosen) : current.baseArt || '', alt: '' })]),
    el('strong', { text: chosen?.label || current.baseLabel }),
  ]);
  const grid = el('div', { class: 'fu-grid' }, current.options.map((option) => el('button', {
    type: 'button',
    class: `fu-tile${chosen?.id === option.id ? ' on' : ''}${option.locked ? ' locked' : ''}`,
    title: option.label,
    'data-upgrade': option.id,
    onclick: () => chooseUpgrade(option.id),
  }, [
    option.isNew ? el('span', { class: 'fu-new', text: 'NEW' }) : null,
    el('img', { src: artPath(option), alt: '', loading: 'lazy' }),
    el('span', { class: 'fu-label', text: option.label }),
    el('span', { class: 'fu-price', text: option.text }),
  ])));
  const footer = el('footer', {}, [
    el('button', { type: 'button', class: 'primary', 'data-upgrade-save': '1', disabled: button.disabled, text: button.text, onclick: () => saveUpgrade() }),
    el('button', { type: 'button', text: UPGRADE_TEXT.cancel, onclick: () => closeUpgradePicker(true) }),
    button.tip ? el('p', { class: 'fu-note', text: button.tip }) : null,
  ]);
  root.replaceChildren(header, el('div', { class: 'fu-main' }, [preview, grid]), footer);
}
