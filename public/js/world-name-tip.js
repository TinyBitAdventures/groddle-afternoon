/**
 * A name by the pointer for a thing on the street that has no menu (#320, Austin 2026-11-14: the
 * Swoonerfly shows its name on hover, still with no actions). Glitch drew no tooltip for
 * not_selectable items (items/npc_swoonerfly.js itemDef :104); this is the remake's one addition,
 * so a player who finds one lying on the ground knows what it is.
 *
 * wireNameTip(sprite, label): hover shows the label by the pointer and follows it; a tap (phones
 * have no hover) shows it for TAP_MS. The sprite stays out of the target list: no glow, no menu.
 * One tip element for the whole page (`.world-name-tip`, style.css), hidden on leave.
 */

export const TAP_MS = 1800;

let tipEl = null;
let hideTimer = 0;

function tipFor(doc) {
  if (tipEl && tipEl.isConnected) return tipEl;
  tipEl = doc.createElement('div');
  tipEl.className = 'world-name-tip';
  tipEl.id = 'world-name-tip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.hidden = true;
  doc.body.appendChild(tipEl);
  return tipEl;
}

/** Shows `label` by the pointer at client (x, y); flips left near the window's right edge. */
export function showNameTip(label, x, y, doc = globalThis.document) {
  if (!doc?.body) return null;
  clearTimeout(hideTimer);
  const el = tipFor(doc);
  el.textContent = String(label || '');
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  const w = doc.defaultView?.innerWidth || 0;
  el.classList.toggle('is-left', Boolean(w) && x > w - 160);
  el.hidden = false;
  return el;
}

export function hideNameTip() {
  clearTimeout(hideTimer);
  if (tipEl) tipEl.hidden = true;
}

/** Hover and tap handlers on a Pixi display object; the cursor stays the arrow (nothing to click). */
export function wireNameTip(sprite, label) {
  if (!sprite) return sprite;
  sprite.eventMode = 'static';
  sprite.cursor = 'default';
  const at = (e) => [e?.clientX ?? e?.global?.x ?? 0, e?.clientY ?? e?.global?.y ?? 0];
  sprite.on('pointerover', (e) => { if (e?.pointerType !== 'touch') showNameTip(label, ...at(e)); });
  sprite.on('pointermove', (e) => { if (e?.pointerType !== 'touch' && tipEl && !tipEl.hidden) showNameTip(label, ...at(e)); });
  sprite.on('pointerout', (e) => { if (e?.pointerType !== 'touch') hideNameTip(); });
  sprite.on('pointertap', (e) => {
    if (e?.pointerType !== 'touch') return;
    showNameTip(label, ...at(e));
    hideTimer = setTimeout(hideNameTip, TAP_MS);
  });
  return sprite;
}
