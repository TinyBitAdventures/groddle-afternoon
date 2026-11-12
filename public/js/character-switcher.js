/**
 * Your characters, from the save cloud (alternate characters, Austin 2026-11-12: "maybe we
 * consolidate the new avatar switcher into the existing cloud/save icon"). In multiplayer the
 * save cloud (js/online-boot.js mountSavePill, the pack row's last button) opens a small popover
 * above it: the save state the cloud's dot shows ("Saved", "Saving…", a problem) at the top, then
 * the login's characters (groddle/v1/characters; the one playing marked, each with its level),
 * Switch on the others, Start a fresh character (the start card's own form) and Manage characters
 * (the start card, where extras are retired and restored). It shows for every multiplayer player,
 * one character or three: the popover is also where a second character starts. Solo has no
 * cloud and no switcher.
 *
 * The tutorial hides the pack row (and the Menu, so Menu > Switch character cannot be reached
 * there): the cloud alone stays on screen where the row sits (STYLE, "Tutorial").
 *
 * Switch saves first (as Menu > Switch character and Sign out do: engine.save, then the store
 * flushed twice), asks the site to sign in as the one picked (characters/{id}/play), and loads
 * /play/online/ again as it. The start card's other ways go through the card itself.
 *
 * The popover lives on the body (fixed, placed from the cloud's box) so the pack row's band, its
 * hidden tutorial state and Classic's restyled band never clip or hide it.
 */
import { CHARACTER_COPY, FRESH_HASH, characterChoices } from './online-boot.js?v=4ea71073';

/** The switcher's words (plain remake copy, no em-dashes). */
export const SWITCHER_COPY = Object.freeze({
  label: (tip) => (tip ? `${tip}. Your characters` : 'Your characters'),
  title: 'Your characters',
  playing: 'Playing',
  switchTo: 'Switch',
  switchLabel: (name) => `Switch to ${name}`,
  saving: 'Saving…',
  switching: (name) => `Switching to ${name}…`,
  fresh: CHARACTER_COPY.fresh,
  manage: 'Manage characters',
  loading: 'Loading your characters…',
  failed: "Your characters didn't load. Manage characters shows them all.",
});

/**
 * The popover's rows for a groddle/v1/characters answer (pure): the one playing first and marked,
 * then the others (retired ones are left to Manage characters), and the fresh character's offer
 * or the plain reason it cannot be made now (null with no list).
 * @returns {{ rows: Array<{ id: number, name: string, level: number|null, current: boolean }>, fresh: null | { can: boolean, note: string } }}
 */
export function switcherChoices(list, player) {
  const c = characterChoices(list, player ? { player } : null);
  return {
    rows: c.rows.map(({ id, name, level, current }) => ({ id, name, level, current })),
    fresh: c.create ? { can: c.create.can, note: c.create.note } : null,
  };
}

/** The address of the start card, opening its fresh character form (#fresh) when asked. */
export function cardUrl(online, { fresh = false, base = globalThis.location?.href } = {}) {
  const url = new URL(online, base);
  url.hash = fresh ? FRESH_HASH : '';
  return url.href;
}

/**
 * Where the popover goes (pure, CSS px): above the cloud with `gap` between, its right edge on the
 * cloud's right edge, held `margin` inside the window; never taller than the room above the cloud.
 * anchor: the cloud's box ({ top, right }); width: the popover's; view: the window's size.
 */
export function popoverPlace(anchor, { width, viewW, viewH, margin = 8, gap = 8 }) {
  const w = Math.min(width, viewW - 2 * margin);
  const left = Math.max(margin, Math.min(anchor.right - w, viewW - margin - w));
  return { left: Math.round(left), bottom: Math.round(viewH - anchor.top + gap), maxHeight: Math.max(160, Math.round(anchor.top - gap - margin)) };
}

/** Goes to the start card: a reload when only the hash would change (a hash alone never reloads). */
function goToCard(href, { win = globalThis } = {}) {
  const to = new URL(href);
  const here = new URL(win.location.href);
  if (to.origin === here.origin && to.pathname === here.pathname && to.search === here.search) {
    win.history.replaceState(win.history.state, '', to.href);
    win.location.reload();
    return;
  }
  win.location.href = to.href;
}

export const STYLE = `
/* == Your characters (js/character-switcher.js): the save cloud's popover, placed by its script. == */
.character-switcher { position: fixed; z-index: calc(var(--z-panel) + 11); width: min(18rem, calc(100vw - 2 * var(--hud-inset))); box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain;
  padding: var(--sp-6) var(--sp-7); border-radius: var(--radius-xl); background: var(--surface-raised); color: var(--text); box-shadow: var(--shadow-2);
  font: var(--fs-base)/var(--lh-normal) var(--font-system); }
.character-switcher[hidden] { display: none; }
.character-switcher h2 { margin: 0 0 var(--sp-4); font-size: var(--fs-lg); }
.character-switcher-save { display: flex; align-items: center; gap: var(--sp-3); margin: 0 0 var(--sp-5); padding-bottom: var(--sp-4); border-bottom: 1px solid color-mix(in srgb, var(--c-green-42) 20%, transparent);
  font-size: var(--fs-md); font-weight: 700; color: var(--text-moss); }
.character-switcher-save::before { content: ''; flex: none; width: 8px; height: 8px; border-radius: var(--radius-round); background: var(--c-lime-67); }
.character-switcher-save:is([data-state="pending"], [data-state="saving"])::before { background: var(--c-gold-76); }
.character-switcher-save:is([data-state="offline"], [data-state="error"], [data-state="conflict"], [data-state="signed-out"])::before { background: var(--c-red-59); }
.character-switcher-save:is([data-state="offline"], [data-state="error"], [data-state="conflict"], [data-state="signed-out"]) { color: var(--text-danger); }
.character-switcher ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-3); }
.character-switcher li { display: flex; align-items: center; gap: var(--sp-4); min-height: 2rem; }
.character-switcher-who { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; font-weight: 700; }
.character-switcher-who small { display: block; font-weight: 600; font-size: var(--fs-sm); color: var(--text-moss); }
.character-switcher-mark { flex: none; padding: var(--sp-1) var(--sp-4); border-radius: var(--radius-pill); font-size: var(--fs-sm); font-weight: 700; color: var(--text-moss); background: var(--surface-moss); }
.character-switcher button { font: inherit; font-weight: 700; cursor: pointer; border: 0; border-radius: var(--radius-md); }
.character-switcher button:focus-visible { outline: 3px solid var(--c-orange-68); outline-offset: 2px; }
.character-switcher-switch { flex: none; padding: var(--sp-3) var(--sp-6); color: var(--text); background: linear-gradient(180deg, var(--c-orange-76), var(--c-orange-68)); box-shadow: 0 2px 0 var(--c-orange-57); }
.character-switcher-more { display: grid; gap: var(--sp-3); margin-top: var(--sp-6); padding-top: var(--sp-5); border-top: 1px solid color-mix(in srgb, var(--c-green-42) 20%, transparent); }
.character-switcher-more button { padding: var(--sp-4) var(--sp-6); color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85); }
.character-switcher-note { margin: 0; font-size: var(--fs-md); font-weight: 600; color: var(--text-moss); }
.character-switcher-note:empty { display: none; }
.character-switcher-note[data-tone="bad"] { color: var(--text-danger); }
.character-switcher button:disabled { opacity: 0.6; cursor: default; }
@media (pointer: coarse) { .character-switcher :is(.character-switcher-switch, .character-switcher-more button) { min-height: 44px; } }
:root[data-ui="classic"] .character-switcher { border-radius: var(--radius-sm); font-family: var(--font-classic-body); }
:root[data-ui="classic"] .character-switcher h2 { font-family: var(--font-classic-title); }
/* The save cloud as the popover's button (it stays the save state's tooltip for a mouse). */
#save-pill .save-pill-btn[aria-expanded] { cursor: pointer; }
.save-pill:has(.save-pill-btn[aria-expanded="true"])::after { display: none; }
/* Tutorial: the pack row is hidden (newxp nx-hide-pack) but the cloud stays where it sits, on its own
   card, so Your characters can be reached before the pack is shown. Not over the start card or a builder.
   Classic's card is in css/classic.css (its palette lives there). */
:root:not([data-home-builder]) body.nx-hide-pack:not(:has(#overlay:not(.hidden))) #pack-row > .save-pill.in-row { visibility: visible; }
:root:not([data-home-builder]) body.nx-hide-pack:not(:has(#overlay:not(.hidden))) #pack-row > .save-pill.in-row:not([data-state="conflict"]):not([data-state="signed-out"]) { background: var(--surface-card); box-shadow: var(--shadow-2), 0 0 0 1px var(--border); }
`;

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/**
 * Hangs Your characters on the save cloud. pill: the save pill (#save-pill, its .save-pill-btn the
 * cloud); account: the multiplayer account (characters, playCharacter, urls); player: { id, name }
 * playing (the multiplayer boot data's); save(): writes the game and flushes the store (resolves
 * when the last write is in); markContinued(id|false): the tab's character (online-boot).
 * Returns { open, close, pop } or null (no cloud: solo, or a page without the pill).
 */
export function installCharacterSwitcher({ doc = globalThis.document, win = globalThis, pill = globalThis.document?.getElementById('save-pill'), account, player = globalThis.GRODDLE_MP_BOOT?.player || null, save = async () => {}, markContinued = () => {}, engine = null } = {}) {
  const btn = pill?.querySelector?.('.save-pill-btn');
  if (!doc?.body || !account || !btn || doc.getElementById('character-switcher')) return null;
  if (!doc.getElementById('character-switcher-css')) {
    const style = el(doc, 'style', { id: 'character-switcher-css' });
    style.textContent = STYLE;
    doc.head.append(style);
  }
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'character-switcher');
  const pop = el(doc, 'div', { id: 'character-switcher', class: 'character-switcher', role: 'dialog', 'aria-label': SWITCHER_COPY.title, 'data-character-switcher-pop': '' });
  pop.hidden = true;
  doc.body.append(pop);

  // The save state, as the cloud shows it: its tooltip's words name the button, and the popover's top line.
  const saveLine = el(doc, 'p', { class: 'character-switcher-save', 'data-character-switcher-save': '' });
  const readSave = () => {
    btn.setAttribute('aria-label', SWITCHER_COPY.label(pill.dataset.tip || ''));
    saveLine.dataset.state = pill.dataset.state || 'saved';
    saveLine.textContent = pill.querySelector('.save-pill-state')?.textContent || '';
  };
  readSave();
  if (typeof win.MutationObserver === 'function') {
    new win.MutationObserver(readSave).observe(pill, { attributes: true, attributeFilter: ['data-tip', 'data-state'], childList: true, subtree: true, characterData: true });
  }

  const note = () => pop.querySelector('[data-character-switcher-note]');
  const say = (text, bad = false) => {
    const n = note();
    if (!n) return;
    n.textContent = text;
    if (bad) n.dataset.tone = 'bad';
    else delete n.dataset.tone;
  };
  const busy = (on) => {
    for (const b of pop.querySelectorAll('button')) b.disabled = on;
  };

  async function leaveFor(href) {
    busy(true);
    say(SWITCHER_COPY.saving);
    try { await save(); } catch { /* the card loads what the site has */ }
    markContinued(false);
    engine?.setData?.('accountSession', 'switching');
    goToCard(href, { win });
  }

  async function switchTo(row) {
    busy(true);
    say(SWITCHER_COPY.saving);
    try { await save(); } catch { /* the site has the last write that went in */ }
    say(SWITCHER_COPY.switching(row.name));
    const r = await account.playCharacter(row.id);
    if (!r?.ok) {
      busy(false);
      say(r?.message || CHARACTER_COPY.failed, true);
      return;
    }
    markContinued(row.id);
    engine?.setData?.('accountSession', 'switching');
    goToCard(cardUrl(account.urls.online, { base: win.location.href }), { win });
  }

  function draw(list) {
    const choices = switcherChoices(list, player);
    pop.replaceChildren(saveLine, el(doc, 'h2', {}, SWITCHER_COPY.title));
    const ul = el(doc, 'ul', { 'data-character-switcher-list': '' });
    for (const row of choices.rows) {
      const li = el(doc, 'li', { 'data-character-switcher-row': String(row.id) });
      const who = el(doc, 'span', { class: 'character-switcher-who' }, row.name);
      if (row.level) who.append(el(doc, 'small', {}, CHARACTER_COPY.level(row.level)));
      li.append(who);
      if (row.current) {
        li.setAttribute('aria-current', 'true');
        li.append(el(doc, 'span', { class: 'character-switcher-mark' }, SWITCHER_COPY.playing));
      } else {
        const sw = el(doc, 'button', { type: 'button', class: 'character-switcher-switch', 'aria-label': SWITCHER_COPY.switchLabel(row.name), 'data-character-switcher-switch': String(row.id) }, SWITCHER_COPY.switchTo);
        sw.addEventListener('click', () => switchTo(row));
        li.append(sw);
      }
      ul.append(li);
    }
    pop.append(ul);
    const more = el(doc, 'div', { class: 'character-switcher-more' });
    if (choices.fresh?.can) {
      const fresh = el(doc, 'button', { type: 'button', 'data-character-switcher-fresh': '' }, SWITCHER_COPY.fresh);
      fresh.addEventListener('click', () => leaveFor(cardUrl(account.urls.online, { fresh: true, base: win.location.href })));
      more.append(fresh);
    } else if (choices.fresh?.note) {
      more.append(el(doc, 'p', { class: 'character-switcher-note', 'data-character-switcher-fresh-note': '' }, choices.fresh.note));
    }
    const manage = el(doc, 'button', { type: 'button', 'data-character-switcher-manage': '' }, SWITCHER_COPY.manage);
    manage.addEventListener('click', () => leaveFor(cardUrl(account.urls.online, { base: win.location.href })));
    more.append(manage, el(doc, 'p', { class: 'character-switcher-note', role: 'status', 'aria-live': 'polite', 'data-character-switcher-note': '' }));
    pop.append(more);
    if (!list) say(SWITCHER_COPY.failed, true);
  }

  function place() {
    if (pop.hidden) return;
    const r = btn.getBoundingClientRect();
    const view = doc.documentElement;
    const at = popoverPlace(r, { width: pop.offsetWidth, viewW: view.clientWidth || win.innerWidth, viewH: view.clientHeight || win.innerHeight });
    pop.style.left = `${at.left}px`;
    pop.style.bottom = `${at.bottom}px`;
    pop.style.maxHeight = `${at.maxHeight}px`;
  }

  let loads = 0;
  async function open() {
    if (!pop.hidden) return;
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    engine?.setData?.('characterSwitcher', 'open');
    const mine = ++loads;
    pop.replaceChildren(saveLine, el(doc, 'h2', {}, SWITCHER_COPY.title), el(doc, 'p', { class: 'character-switcher-note', role: 'status' }, SWITCHER_COPY.loading));
    place();
    const list = await account.characters().catch(() => null);
    if (mine !== loads || pop.hidden) return;
    draw(list);
    place();
    (pop.querySelector('[data-character-switcher-switch]') || pop.querySelector('button'))?.focus();
  }
  function close({ focus = true } = {}) {
    if (pop.hidden) return;
    loads += 1;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    engine?.setData?.('characterSwitcher', 'closed');
    if (focus) btn.focus();
  }
  btn.addEventListener('click', () => (pop.hidden ? open() : close()));
  // Enter and Space press the cloud, not the game (chat, jump); the popover keeps every key; Escape closes it.
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    if (e.key === 'Escape' && !pop.hidden) {
      e.stopPropagation();
      close();
    }
  });
  pop.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  doc.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close({ focus: false });
  }, true);
  win.addEventListener?.('resize', place);
  return { open, close, pop };
}
