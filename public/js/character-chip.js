/**
 * The character chip (alternate characters, Austin 2026-11-12): in multiplayer a small round
 * face of the character playing sits in the bottom-left corner at all times, the tutorial and
 * Classic included (the tutorial hides the Menu, so Menu > Switch character cannot be reached
 * there). Its name shows on hover and focus. A click opens a small popover: the login's
 * characters (groddle/v1/characters; the one playing marked, each with its level), Switch on the
 * others, Start a fresh character (the start card's own form) and Manage characters (the start
 * card, where extras are retired and restored). It shows for every multiplayer player, one
 * character or three: the popover is also where a second character starts.
 *
 * Switch saves first (as Menu > Switch character and Sign out do: engine.save, then the store
 * flushed twice), asks the site to sign in as the one picked (characters/{id}/play), and loads
 * /play/online/ again as it. The start card's other ways go through the card itself.
 *
 * The face is the character's own look drawn standing (engine.lookPortrait, the still the home
 * card and Classic's face draw), its head filling the circle; the name's first letter until it
 * is drawn. Placement lives in one block of STYLE ("Placement") so the phone HUD can move it.
 * Closed it sits under panels; open, over the pack (pack-bar is --z-panel + 10).
 */
import { CHARACTER_COPY, FRESH_HASH, characterChoices } from './online-boot.js?v=52b9027b';

/** The chip's words (plain remake copy, no em-dashes). */
export const CHIP_COPY = Object.freeze({
  label: (name) => (name ? `Playing as ${name}. Your characters` : 'Your characters'),
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
export function chipChoices(list, player) {
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
/* == Character chip (js/character-chip.js). Placement: one block, so the phone HUD can move it. == */
.character-chip { position: fixed; left: calc(var(--hud-inset) + env(safe-area-inset-left, 0px)); bottom: calc(var(--hud-inset) + env(safe-area-inset-bottom, 0px)); z-index: calc(var(--z-overlay) + 2); }
.character-chip-pop { left: 0; bottom: calc(100% + var(--sp-4)); }
.character-chip[data-open] { z-index: calc(var(--z-panel) + 11); }
:root[data-ui="classic"] .character-chip { left: calc(var(--sp-3) + env(safe-area-inset-left, 0px)); bottom: calc(var(--sp-3) + env(safe-area-inset-bottom, 0px)); }
@media (pointer: coarse) { .character-chip-btn { --chip-size: 44px; } }
/* == end placement == */
.character-chip { font: var(--fs-base)/var(--lh-normal) var(--font-system); }
.character-chip-btn { --chip-size: 40px; position: relative; display: block; width: var(--chip-size); height: var(--chip-size); padding: 0; border: 2px solid var(--surface-bright); border-radius: var(--radius-round); cursor: pointer;
  background: var(--surface-moss); box-shadow: var(--shadow-1); color: var(--text-moss); font: inherit; font-weight: 800; font-size: var(--fs-lg); }
.character-chip-btn:focus-visible { outline: 3px solid var(--c-orange-68); outline-offset: 2px; }
.character-chip-face { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; border-radius: var(--radius-round); }
.character-chip-face[data-face="avatar"] { color: transparent; background: var(--chip-face) 50% 14% / 140% auto no-repeat, var(--surface-moss); }
.character-chip-name { position: absolute; left: calc(100% + var(--sp-4)); top: 50%; transform: translateY(-50%); padding: var(--sp-2) var(--sp-5); border-radius: var(--radius-pill); white-space: nowrap; pointer-events: none;
  background: var(--surface-raised); color: var(--text); box-shadow: var(--shadow-1); font-size: var(--fs-md); font-weight: 700; opacity: 0; transition: opacity 0.12s; }
.character-chip-btn:hover .character-chip-name, .character-chip-btn:focus-visible .character-chip-name, .character-chip-btn[aria-expanded="true"] .character-chip-name { opacity: 1; }
.character-chip-btn[aria-expanded="true"] .character-chip-name { display: none; }
.character-chip-pop { position: absolute; width: min(18rem, calc(100vw - 2 * var(--hud-inset))); box-sizing: border-box; padding: var(--sp-6) var(--sp-7); border-radius: var(--radius-xl);
  background: var(--surface-raised); color: var(--text); box-shadow: var(--shadow-2); }
.character-chip-pop[hidden] { display: none; }
.character-chip-pop h2 { margin: 0 0 var(--sp-4); font-size: var(--fs-lg); }
.character-chip-pop ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-3); }
.character-chip-pop li { display: flex; align-items: center; gap: var(--sp-4); min-height: 2rem; }
.character-chip-who { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; font-weight: 700; }
.character-chip-who small { display: block; font-weight: 600; font-size: var(--fs-sm); color: var(--text-moss); }
.character-chip-mark { flex: none; padding: var(--sp-1) var(--sp-4); border-radius: var(--radius-pill); font-size: var(--fs-sm); font-weight: 700; color: var(--text-moss); background: var(--surface-moss); }
.character-chip-pop button { font: inherit; font-weight: 700; cursor: pointer; border: 0; border-radius: var(--radius-md); }
.character-chip-switch { flex: none; padding: var(--sp-3) var(--sp-6); color: var(--text); background: linear-gradient(180deg, var(--c-orange-76), var(--c-orange-68)); box-shadow: 0 2px 0 var(--c-orange-57); }
.character-chip-more { display: grid; gap: var(--sp-3); margin-top: var(--sp-6); padding-top: var(--sp-5); border-top: 1px solid color-mix(in srgb, var(--c-green-42) 20%, transparent); }
.character-chip-more button { padding: var(--sp-4) var(--sp-6); color: var(--text-moss); background: var(--surface-moss); box-shadow: inset 0 0 0 2px var(--c-lime-85); }
.character-chip-note { margin: 0; font-size: var(--fs-md); font-weight: 600; color: var(--text-moss); }
.character-chip-note:empty { display: none; }
.character-chip-note[data-tone="bad"] { color: var(--text-danger); }
.character-chip-pop button:disabled { opacity: 0.6; cursor: default; }
:root[data-ui="classic"] .character-chip { font-family: var(--font-classic-body); }
:root[data-ui="classic"] .character-chip-pop { border-radius: var(--radius-sm); }
:root[data-ui="classic"] .character-chip-pop h2 { font-family: var(--font-classic-title); }
`;

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/**
 * Puts the chip on the page. account: the multiplayer account (characters, playCharacter, urls);
 * player: { id, name } playing (the multiplayer boot data's); save(): writes the game and flushes the store (resolves when the
 * last write is in); markContinued(id|false): the tab's character (online-boot); face(): the
 * look's still as a data URL, or null. Returns { open, close, refreshFace, root }.
 */
export function installCharacterChip({ doc = globalThis.document, win = globalThis, account, player = globalThis.GRODDLE_MP_BOOT?.player || null, save = async () => {}, markContinued = () => {}, face = async () => null, engine = null } = {}) {
  if (!doc?.body || !account || doc.querySelector('[data-character-chip]')) return null;
  if (!doc.getElementById('character-chip-css')) {
    const style = el(doc, 'style', { id: 'character-chip-css' });
    style.textContent = STYLE;
    doc.head.append(style);
  }
  const name = String(player?.name || '');
  const root = el(doc, 'div', { class: 'character-chip', 'data-character-chip': '' });
  const btn = el(doc, 'button', { type: 'button', class: 'character-chip-btn', 'aria-label': CHIP_COPY.label(name), 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'character-chip-pop', 'data-character-chip-button': '' });
  const pic = el(doc, 'span', { class: 'character-chip-face', 'aria-hidden': 'true' }, (name[0] || '?').toUpperCase());
  btn.append(pic, el(doc, 'span', { class: 'character-chip-name', 'aria-hidden': 'true' }, name));
  const pop = el(doc, 'div', { id: 'character-chip-pop', class: 'character-chip-pop', role: 'dialog', 'aria-label': CHIP_COPY.title, 'data-character-chip-pop': '' });
  pop.hidden = true;
  root.append(btn, pop);
  doc.body.append(root);

  const note = () => pop.querySelector('[data-character-chip-note]');
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
    say(CHIP_COPY.saving);
    try { await save(); } catch { /* the card loads what the site has */ }
    markContinued(false);
    engine?.setData?.('accountSession', 'switching');
    goToCard(href, { win });
  }

  async function switchTo(row) {
    busy(true);
    say(CHIP_COPY.saving);
    try { await save(); } catch { /* the site has the last write that went in */ }
    say(CHIP_COPY.switching(row.name));
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
    const choices = chipChoices(list, player);
    pop.replaceChildren(el(doc, 'h2', {}, CHIP_COPY.title));
    const ul = el(doc, 'ul', { 'data-character-chip-list': '' });
    for (const row of choices.rows) {
      const li = el(doc, 'li', { 'data-character-chip-row': String(row.id) });
      const who = el(doc, 'span', { class: 'character-chip-who' }, row.name);
      if (row.level) who.append(el(doc, 'small', {}, CHARACTER_COPY.level(row.level)));
      li.append(who);
      if (row.current) {
        li.setAttribute('aria-current', 'true');
        li.append(el(doc, 'span', { class: 'character-chip-mark' }, CHIP_COPY.playing));
      } else {
        const sw = el(doc, 'button', { type: 'button', class: 'character-chip-switch', 'aria-label': CHIP_COPY.switchLabel(row.name), 'data-character-chip-switch': String(row.id) }, CHIP_COPY.switchTo);
        sw.addEventListener('click', () => switchTo(row));
        li.append(sw);
      }
      ul.append(li);
    }
    pop.append(ul);
    const more = el(doc, 'div', { class: 'character-chip-more' });
    if (choices.fresh?.can) {
      const fresh = el(doc, 'button', { type: 'button', 'data-character-chip-fresh': '' }, CHIP_COPY.fresh);
      fresh.addEventListener('click', () => leaveFor(cardUrl(account.urls.online, { fresh: true, base: win.location.href })));
      more.append(fresh);
    } else if (choices.fresh?.note) {
      more.append(el(doc, 'p', { class: 'character-chip-note', 'data-character-chip-fresh-note': '' }, choices.fresh.note));
    }
    const manage = el(doc, 'button', { type: 'button', 'data-character-chip-manage': '' }, CHIP_COPY.manage);
    manage.addEventListener('click', () => leaveFor(cardUrl(account.urls.online, { base: win.location.href })));
    more.append(manage, el(doc, 'p', { class: 'character-chip-note', role: 'status', 'aria-live': 'polite', 'data-character-chip-note': '' }));
    pop.append(more);
    if (!list) say(CHIP_COPY.failed, true);
  }

  let loads = 0;
  async function open() {
    if (!pop.hidden) return;
    refreshFace();
    pop.hidden = false;
    root.dataset.open = '';
    btn.setAttribute('aria-expanded', 'true');
    engine?.setData?.('characterChip', 'open');
    const mine = ++loads;
    pop.replaceChildren(el(doc, 'h2', {}, CHIP_COPY.title), el(doc, 'p', { class: 'character-chip-note', role: 'status' }, CHIP_COPY.loading));
    const list = await account.characters().catch(() => null);
    if (mine !== loads || pop.hidden) return;
    draw(list);
    (pop.querySelector('[data-character-chip-switch]') || pop.querySelector('button'))?.focus();
  }
  function close({ focus = true } = {}) {
    if (pop.hidden) return;
    loads += 1;
    pop.hidden = true;
    delete root.dataset.open;
    btn.setAttribute('aria-expanded', 'false');
    engine?.setData?.('characterChip', 'closed');
    if (focus) btn.focus();
  }
  btn.addEventListener('click', () => (pop.hidden ? open() : close()));
  // The game's keys stay out of the chip; Escape closes the popover.
  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  doc.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !root.contains(e.target)) close({ focus: false });
  }, true);

  let faceUrl = '';
  async function refreshFace() {
    let url = '';
    try { url = (await face()) || ''; } catch { url = ''; }
    if (url === faceUrl) return;
    faceUrl = url;
    if (url) {
      pic.style.setProperty('--chip-face', `url("${url}")`);
      pic.dataset.face = 'avatar';
    } else {
      pic.style.removeProperty('--chip-face');
      delete pic.dataset.face;
    }
  }
  refreshFace();
  return { root, open, close, refreshFace };
}
