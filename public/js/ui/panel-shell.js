/**
 * VERBS (phase 2, Warm paper; the HUD mock's "one panel shell"): the frame the game's panels share
 * in the modern skin. A side sheet is 360 px wide (--sheet-w), always on the left under the top
 * pills, with a header (icon, title, key cap, close), tabs where the panel has them, a body that
 * scrolls and a footer line. The Map is the centred size of the same shell.
 *
 * The panels keep their own elements, ids and open/close functions in game.js (openQuestPanel,
 * openMakePanel, openMap and the rest); this module only watches them:
 * - one side sheet at a time: a sheet that opens closes the one that was open (its closer);
 * - while a side sheet is open, --inset-l on the root is the width it takes plus its gap, as the
 *   Social drawer sets --inset-r, so the pack and the notices centre in the width that is left;
 *   the root has data-sheet="<id>" (the pinned quest tracker hides then);
 * - a sheet that opens takes focus on its title, and gives it back to what opened it on close;
 * - tabs (role=tab in a role=tablist) move with the arrow keys, Home and End.
 *
 * QA: canvas data uiSheet (the open side sheet's id, or ""), uiSheetInset (its --inset-l px).
 */

/**
 * @param {{ root: HTMLElement, sheets: { id: string, kind?: 'side'|'center', close?: () => void }[],
 *   setData?: (key: string, value: string) => void, onChange?: (open: string) => void, gap?: number }} opts
 */
export function mountPanelShell({ root, sheets, setData = () => {}, onChange = () => {}, gap = 8 } = {}) {
  const doc = root?.ownerDocument || globalThis.document;
  const list = (sheets || []).map((s) => ({ kind: 'side', ...s }));
  const byId = new Map(list.map((s) => [s.id, s]));
  const el = (id) => doc.getElementById(id);
  const shown = (id) => {
    const e = el(id);
    return Boolean(e && !e.hidden);
  };
  let openSide = '';
  let inset = 0;
  const openers = new Map();

  function measureInset(id) {
    const e = el(id);
    if (!e || !root) return 0;
    // offsetLeft and offsetWidth leave out the opening slide's transform: where it is going.
    let left = 0;
    for (let n = e; n && n !== root; n = n.offsetParent) left += n.offsetLeft || 0;
    const w = e.offsetWidth || 0;
    return w ? Math.round(left + w + gap) : 0;
  }

  function syncInset() {
    const v = `${inset}px`;
    if (root && root.style.getPropertyValue('--inset-l') !== v) root.style.setProperty('--inset-l', v);
    setData('uiSheetInset', String(inset));
  }

  function focusTitle(id) {
    const e = el(id);
    const title = e?.querySelector('.ui-sheet-title, h2');
    if (!title) return;
    if (!title.hasAttribute('tabindex')) title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }

  function onShown(id) {
    const s = byId.get(id);
    if (!s) return;
    const active = doc.activeElement;
    if (active && active !== doc.body && !el(id)?.contains(active)) openers.set(id, active);
    if (s.kind === 'side') {
      // One side sheet at a time: the one already open closes.
      for (const other of list) {
        if (other.id !== id && other.kind === 'side' && shown(other.id)) other.close?.();
      }
      openSide = id;
    }
    // After the panel has drawn (its open function fills it after showing it).
    globalThis.requestAnimationFrame?.(() => {
      if (shown(id)) focusTitle(id);
    });
  }

  function onHidden(id) {
    const opener = openers.get(id);
    openers.delete(id);
    const e = el(id);
    const active = doc.activeElement;
    if (opener?.isConnected && (!active || active === doc.body || e?.contains(active))) {
      opener.focus?.({ preventScroll: true });
    }
    if (openSide === id) openSide = '';
  }

  const was = new Map(list.map((s) => [s.id, shown(s.id)]));
  function sync() {
    for (const s of list) {
      const now = shown(s.id);
      if (now === was.get(s.id)) continue;
      was.set(s.id, now);
      if (now) onShown(s.id);
      else onHidden(s.id);
    }
    if (openSide && !shown(openSide)) openSide = '';
    if (!openSide) openSide = list.find((s) => s.kind === 'side' && shown(s.id))?.id || '';
    inset = openSide ? measureInset(openSide) : 0;
    syncInset();
    if (root) {
      if (openSide) root.dataset.sheet = openSide;
      else delete root.dataset.sheet;
    }
    setData('uiSheet', openSide);
    onChange(openSide);
  }

  const mo = typeof MutationObserver === 'function' ? new MutationObserver(() => sync()) : null;
  if (mo) {
    for (const s of list) {
      const e = el(s.id);
      if (e) mo.observe(e, { attributes: true, attributeFilter: ['hidden'] });
    }
  }
  globalThis.addEventListener?.('resize', () => sync());
  sync();

  return {
    /** The open side sheet's id, or "". */
    open: () => openSide,
    /** The width the open side sheet takes on the left, with its gap (0 when none is open, and in a
     *  skin that pins --inset-l, as Classic does: its panels sit in the world cell). */
    insetLeft: () => {
      if (!inset || !root) return 0;
      try {
        const v = parseFloat(globalThis.getComputedStyle(root).getPropertyValue('--inset-l'));
        return Number.isFinite(v) ? v : inset;
      } catch {
        return inset;
      }
    },
    sync,
    /** MPANELS: watch a panel a feature builds after the shell mounted (Upgrades). */
    add(sheet) {
      const e = el(sheet?.id);
      if (!e || byId.has(sheet.id)) return false;
      const s = { kind: 'side', ...sheet };
      list.push(s);
      byId.set(s.id, s);
      was.set(s.id, shown(s.id));
      mo?.observe(e, { attributes: true, attributeFilter: ['hidden'] });
      sync();
      return true;
    },
  };
}

/**
 * Tabs: role=tab buttons in a role=tablist. Arrow keys, Home and End move and select (the tab
 * follows focus); a click selects. `onSelect(id)` gets the tab's data-tab.
 */
export function bindTabs(tablist, { onSelect = () => {} } = {}) {
  if (!tablist || tablist.dataset.tabsBound) return;
  tablist.dataset.tabsBound = '1';
  const tabs = () => [...tablist.querySelectorAll('[role="tab"]')].filter((t) => !t.hidden);
  const pick = (tab, focus = false) => {
    if (!tab) return;
    for (const t of tabs()) {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    }
    if (focus) tab.focus({ preventScroll: true });
    onSelect(tab.dataset.tab);
  };
  tablist.addEventListener('click', (e) => {
    const tab = e.target?.closest?.('[role="tab"]');
    if (tab && tablist.contains(tab)) pick(tab);
  });
  tablist.addEventListener('keydown', (e) => {
    const all = tabs();
    const at = all.indexOf(e.target?.closest?.('[role="tab"]'));
    if (at < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % all.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (at - 1 + all.length) % all.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    if (next < 0) return;
    e.preventDefault();
    e.stopPropagation();
    pick(all[next], true);
  });
}

/** Select a tab by its data-tab without a click (a redraw that keeps the player's tab). */
export function selectTab(tablist, id) {
  if (!tablist) return;
  for (const t of tablist.querySelectorAll('[role="tab"]')) {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    t.tabIndex = on ? 0 : -1;
  }
}

/**
 * The panels that sit beside the world rather than over it: the side sheets (and, in Classic, the
 * same panels as its 2012 windows). They are not modal: the avatar walks, jumps and acts on the
 * world while one is open. The Map, Upgrades, the How many chooser, conversations, screens and the
 * prompts stay modal.
 */
export const SIDE_SHEET_IDS = Object.freeze(['quest-panel', 'make-panel', 'achieve-panel', 'skills-panel', 'buffs-panel', 'feat-panel', 'vendor-panel']);

/** True for an element that is one of the side sheets (or inside one). */
export function inSideSheet(el) {
  const sheet = el?.closest?.(SIDE_SHEET_IDS.map((id) => `#${id}`).join(', '));
  return Boolean(sheet && !sheet.hidden);
}

/**
 * PURE: with a side sheet open (and nothing modal), does a keydown go on to the world? A text field
 * in the sheet already has the keys (game.js stops at an input). Walking (the arrows, W A S D) always
 * goes through; Space, Enter and E go through unless a button in the sheet has focus (then they press
 * it); the number keys go through unless focus is inside the sheet; other letters (the panels' own
 * keys, the sheet's shortcuts) stay with the panels.
 * @param {{ key: string, shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} e
 * @param {{ focusInSheet?: boolean, focusOnControl?: boolean }} where
 */
export function sheetKeyToWorld(e, { focusInSheet = false, focusOnControl = false } = {}) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = String(e.key || '');
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return true;
  if (!e.shiftKey && ['w', 'a', 's', 'd'].includes(k.toLowerCase())) return true;
  if (k === ' ' || k === 'Enter' || (!e.shiftKey && k.toLowerCase() === 'e')) return !focusOnControl;
  if (/^[0-9]$/.test(k)) return !focusInSheet;
  return false;
}
