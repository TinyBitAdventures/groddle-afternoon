/**
 * /play/online/ (multiplayer phase 2), where the site's Play links lead
 * (Austin 2026-10-26: Play shows the sign-in or a button to play solo). A
 * signed-out player signs in, makes a character or picks Play solo; a
 * signed-in one picks Play as <name> or Play solo, once a tab (a reload goes
 * straight back in). Then: sign the player in, load the whole
 * multiplayer save from Minn into window.GRODDLE_MP_BOOT, and only then load
 * game.js, whose save store (js/save-store.js) serves the game from that copy
 * and writes it back. A signed-out player signs in or makes a new character
 * right here, by email (js/account-forms.js), and the game starts without
 * leaving the page; a page with no Groddle site behind it (a static server)
 * says multiplayer needs one. The save state shows in a pill.
 *
 * Load order matters: this module must not import js/save-store.js (the store
 * reads GRODDLE_MP_BOOT once, when it first loads), so game.js is added as a
 * module script after the save is in place. The page is generated from
 * play/index.html by tools/play-online/build.mjs.
 *
 * Alternate characters (Austin's rulings of 2026-11-12): a login has up to three characters.
 * Signed in, the card lists them from groddle/v1/characters (Play as <name>, Level N, the
 * one signed in first), then Start a fresh character, Play solo and Not <name>? Sign out.
 * Playing another one signs this browser in as it (characters/{id}/play) and boots again.
 * An extra character that is not the one signed in has a small Retire on its row: a plain
 * confirmation in the card, then characters/{id}/retire, and it waits under Retired
 * characters to come back (characters/{id}/restore). The tab remembers which character it played, so a reload after another tab switched
 * shows the card instead of walking in as someone else. Menu > Switch character in the
 * game (js/features/account-backup-feature.js) saves and comes back here.
 */

import { createMinnAccountCore } from './minn-account-core.js?v=63758d34';
import { FORM_COPY, characterNameProblem, mountAccountForms, resetLinkFrom, verifyLinkFrom } from './account-forms.js?v=318b6815';
import { claimCharacter, newWriterId, takeHandoff } from './save-claim.js?v=30cf5250';
import { gateFor, quietSession, suspendedNow } from './online-session.js?v=6f1348c8';

// The gate's session check lives in js/online-session.js, so the phone companion loads it without this card.
export { gateFor, quietSession, suspendedNow };

const PILL_TEXT = {
  saved: 'Saved',
  pending: 'Saving soon',
  saving: 'Saving…',
  offline: 'Offline, retrying',
  conflict: 'Saved somewhere else. Reload',
  elsewhere: 'Playing in another window',
  'signed-out': 'Signed out. Sign in again',
  error: 'Not saved',
};

/**
 * What a stopped save says over the game (js/save-store.js SAVE_STOPPED), so the
 * player always knows this window is not saving and what each way out keeps
 * (ticket 21, 2026-11-01: a stopped save used to show only in the pack's corner).
 * Plain remake copy, no em dashes.
 */
export const SAVE_ALERT_COPY = {
  conflict: {
    title: 'Saved somewhere else',
    body: 'Your character was saved somewhere else after this window loaded it, so this window stopped saving. Choose which game to keep.',
  },
  elsewhere: {
    title: 'Playing in another window',
    body: 'Your character was opened in another window or on another device, so this window stopped saving. Choose which game to keep.',
  },
  yielded: {
    title: 'Playing in another tab',
    body: 'You opened your character in another tab, so this tab saved your game and stopped. Play there, or come back here.',
  },
  // Another window of this browser switched character (the site's 409 character_changed): nothing more saves here.
  character: {
    title: 'Playing in another window',
    body: 'This browser switched to another character in another window, so this window stopped saving.',
  },
  error: {
    title: 'Your game is not being saved',
    body: 'The Groddle site did not take the last save.',
  },
  'signed-out': {
    title: 'You are signed out',
    body: 'Your game is not being saved while you are signed out. Sign in again to carry on.',
  },
  load: 'Load the other save',
  keep: "Keep this window's game",
  keepNote: "Keep this window's game replaces the other save with this one.",
  here: 'Play here',
  choose: 'Choose a character',
  retry: 'Try again',
  signIn: 'Sign in again',
  lastSaved: (at) => `This window last saved at ${at}.`,
  otherSaved: (at) => `The other save is from ${at}.`,
};

function clockTime(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  try {
    return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * The alert's words and buttons for a save state and its event detail, or null when
 * the save is fine. Buttons: load (reload: the saved game), keep (this window's game
 * over the other), retry, signIn (reload: the gate signs in).
 */
export function saveAlertFor(state, detail = {}) {
  const C = SAVE_ALERT_COPY;
  if (state === 'elsewhere' && detail.by === 'window') return { ...C.yielded, lines: [], buttons: [['load', C.here]] };
  if (state === 'elsewhere' && detail.by === 'character') {
    const mine = clockTime(detail.confirmedAt);
    return { ...C.character, lines: mine ? [C.lastSaved(mine)] : [], buttons: [['choose', C.choose]] };
  }
  if (state === 'conflict' || state === 'elsewhere') {
    const lines = [];
    const mine = clockTime(detail.confirmedAt);
    const other = clockTime(detail.otherUpdatedAt);
    if (mine) lines.push(C.lastSaved(mine));
    if (other && detail.otherUpdatedAt !== detail.confirmedAt) lines.push(C.otherSaved(other));
    lines.push(C.keepNote);
    return { ...C[state], lines, buttons: [['load', C.load], ['keep', C.keep]] };
  }
  if (state === 'error') return { ...C.error, lines: detail.message ? [String(detail.message)] : [], buttons: [['retry', C.retry]] };
  if (state === 'signed-out') return { ...C['signed-out'], lines: [], buttons: [['signIn', C.signIn]] };
  return null;
}

/** The solo choice under the sign-in (plain remake copy, no em-dashes). */
export const SOLO_COPY = {
  title: 'Or play solo',
  body: 'Your own scrap of Ur, saved in this browser. No account needed.',
  button: 'Play solo',
};

/**
 * Set when the player picks a character in this tab, so a reload goes straight in: the
 * character's id, or '*' (just signed in: whoever the site signed in). A reload signed in as
 * another character (another tab switched) shows the card again.
 */
export const CONTINUE_KEY = 'groddle-online-continue';

/** Whether this tab goes straight in as a character (the stored value, pure). */
export function continuesAs(stored, id) {
  const v = String(stored ?? '');
  return v === '*' || (v !== '' && v === String(Number(id) || ''));
}

function continuedHere(id) {
  try {
    return continuesAs(sessionStorage.getItem(CONTINUE_KEY), id);
  } catch {
    return false;
  }
}

/** Remembers the character this tab plays (true: whoever is signed in next), or forgets it (false). */
export function markContinued(on = true) {
  try {
    if (on === false) sessionStorage.removeItem(CONTINUE_KEY);
    else sessionStorage.setItem(CONTINUE_KEY, on === true ? '*' : String(Number(on) || '*'));
  } catch {
    // Private windows: the card shows again on a reload, nothing worse.
  }
}

/** The gate's words for each state (plain remake copy, no em-dashes). */
export const GATE_COPY = {
  checking: { title: 'Finding your account', body: ['Checking whether you are signed in…'] },
  'signed-out': {
    title: 'Play Groddle Afternoon',
    body: ['Sign in, or make a character, to share Ur with other players. Your character lives on the Groddle site, the same on every device.'],
  },
  choose: {
    title: 'Welcome back',
    body: ['Carry on with other players, or play your solo game.'],
  },
  'no-server': {
    title: 'Multiplayer needs the Groddle site',
    body: ['This copy of the game has no accounts behind it, so it can only play solo.'],
  },
  // Tiny Speck's own server-trouble page (the Juju Boss's one public job): Wayback glitch.com capture of
  // 2012-08-13, research/wayback/raw/glitchcom-locations-live/pages-census/GIFNU7T73U722U5-20120813184746.html 144-148.
  offline: {
    title: 'Oh no!',
    body: [
      'Oh dear, we seem to be having trouble talking to the game servers. Perhaps the bad joojoos have run amok.',
      "There's a good chance that the problem you're experiencing is intermittent. Wait a few seconds and then try again.",
    ],
  },
  // The administrators' console banned this account (groddle-afternoon-site src/AdminConsole.php).
  suspended: {
    title: 'Account suspended',
    body: ['This account is suspended.', 'It cannot play with others. Solo play in this browser still works.'],
  },
  'load-failed': {
    title: 'Oh no!',
    body: [
      'Your character did not load: the site answered, but your multiplayer save could not be read. Perhaps the bad joojoos have run amok.',
      'Try again in a moment.',
    ],
  },
};

/** The gates that mean the servers are in trouble: the Juju Boss stands on them (assets/sprites/juju_boss, CC0). */
export const JUJU_BOSS_GATES = Object.freeze(['offline', 'load-failed']);

/** The start card's words for a login's characters (plain remake copy, no em-dashes). */
export const CHARACTER_COPY = Object.freeze({
  play: (name) => `Play as ${name}`,
  level: (n) => `Level ${n}`,
  fresh: 'Start a fresh character',
  freshTitle: 'A fresh character',
  freshBody: 'A new Glitch on this account, starting from the beginning. Your other characters stay as they are.',
  nameLabel: 'Character name',
  nameHelp: FORM_COPY.signup.nameHelp,
  make: 'Make and play',
  cancel: 'Cancel',
  making: 'Making your character…',
  switching: (name) => `Switching to ${name}…`,
  tomorrow: 'You can make another character tomorrow.',
  atLimit: (n) => `You have ${n} characters.`,
  retired: 'Retired characters',
  restore: (name) => `Restore ${name}`,
  retire: 'Retire',
  retireLabel: (name) => `Retire ${name}`,
  retireAsk: (name) => `Retire ${name}? They'll be hidden from this list. You can bring them back from Retired characters, and their name stays theirs for 30 days.`,
  retiring: (name) => `Retiring ${name}…`,
  failed: "That didn't work. Try again in a moment.",
});

/** The start card opened on its fresh character form (js/character-switcher.js Start a fresh character). */
export const FRESH_HASH = '#fresh';

/** The most characters a login has when the site does not say (Austin 2026-11-12). */
export const CHARACTER_LIMIT = 3;

function positiveId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * What the card offers for a groddle/v1/characters answer (pure): rows to play (the signed-in
 * character first, then the rest as the site lists them; retired ones apart), and whether a fresh
 * character can be made now, or the plain reason it cannot. With no answer (an older site, or it
 * failed) the card offers the signed-in character alone and no fresh one. A row is retirable when
 * the site says it is an extra character (first: false) and it is not the one signed in (Austin
 * 2026-11-12: never the first, never the one playing; the site checks again).
 * @returns {{ rows: Array<{ id, name, level, current, retirable }>, retired: Array<{ id, name, level, current, retirable }>, create: null | { can: boolean, note: string, limit: number } }}
 */
export function characterChoices(list, session) {
  const me = session?.player || null;
  const current = positiveId(list?.current) || positiveId(me?.id);
  const all = Array.isArray(list?.characters) ? list.characters.filter((c) => positiveId(c?.id) && typeof c.name === 'string' && c.name) : [];
  if (!all.length) {
    return { rows: me ? [{ id: positiveId(me.id), name: String(me.name || ''), level: null, current: true, retirable: false }] : [], retired: [], create: null };
  }
  const row = (c) => {
    const level = Math.floor(Number(c.level));
    const mine = positiveId(c.id) === current;
    return { id: positiveId(c.id), name: c.name, level: level > 0 ? level : null, current: mine, retirable: !mine && c.first === false && c.retired !== true };
  };
  const live = all.filter((c) => c.retired !== true).map(row);
  const limit = Number.isInteger(list.limit) && list.limit > 0 ? list.limit : CHARACTER_LIMIT;
  const can = list.canCreate === true;
  const note = can ? '' : all.length >= limit ? CHARACTER_COPY.atLimit(limit) : CHARACTER_COPY.tomorrow;
  return {
    rows: [...live.filter((r) => r.current), ...live.filter((r) => !r.current)],
    retired: all.filter((c) => c.retired === true).map(row),
    create: { can, note, limit },
  };
}

/** The words for a refused new character (account.createCharacter): the name's own words, the limit, or one a day. */
export function createRefusalText(r, limit = CHARACTER_LIMIT) {
  if (r?.status === 422 || r?.fields?.name) return String(r?.fields?.name || r?.message || CHARACTER_COPY.failed);
  if (r?.status === 409) return CHARACTER_COPY.atLimit(limit);
  if (r?.status === 429) return CHARACTER_COPY.tomorrow;
  return String(r?.message || CHARACTER_COPY.failed);
}

/** The boot data the multiplayer store reads (js/save-store.js createMultiplayerSaveStore). */
export function bootDataFrom({ account, session, save, writer = '' }) {
  const data = save?.data;
  if (data && (data.kind !== 'groddle-multiplayer' || data.format !== 1)) throw new Error('The server sent a save that is not a multiplayer save');
  return {
    saveUrl: `${account.urls.api}save`,
    nonceUrl: account.urls.nonce,
    nonce: account.nonce,
    version: Number.isInteger(save?.version) ? save.version : 0,
    updatedAt: save?.updatedAt || null,
    entries: data?.entries && typeof data.entries === 'object' ? { ...data.entries } : {},
    player: session.player,
    writer,
    // G567: an administrator's game draws Delete line on channel lines (groups-feature); the site's route checks again.
    ...(session.admin === true ? { admin: true } : {}),
  };
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/**
 * An extra character's Retire (Austin 2026-11-12): a small link beside its row opens a plain
 * confirmation in the card (never window.confirm); Retire <name> asks the site
 * (characters/{id}/retire), then onRetired() shows the card again with it under Retired
 * characters. A refusal is said in the site's own words, in the confirmation.
 */
function appendRetire(li, c, { account, busy, onRetired }) {
  li.classList.add('online-character-row');
  const open = el('button', { type: 'button', class: 'online-retire-open', 'aria-label': CHARACTER_COPY.retireLabel(c.name), 'aria-expanded': 'false', 'data-online-retire-open': String(c.id) }, CHARACTER_COPY.retire);
  const askId = `online-retire-ask-${c.id}`;
  const box = el('div', { class: 'online-retire-confirm', role: 'group', 'aria-labelledby': askId, 'data-online-retire-confirm': String(c.id) });
  box.hidden = true;
  const yes = el('button', { type: 'button', class: 'online-retire-yes', 'data-online-retire': String(c.id) }, CHARACTER_COPY.retireLabel(c.name));
  const no = el('button', { type: 'button', class: 'online-home online-retire-no' }, CHARACTER_COPY.cancel);
  const note = el('p', { class: 'online-retire-note', role: 'status', 'aria-live': 'polite', 'data-online-retire-note': '' });
  const actions = el('div', { class: 'online-retire-actions' });
  actions.append(yes, no);
  box.append(el('p', { id: askId, class: 'online-retire-ask' }, CHARACTER_COPY.retireAsk(c.name)), actions, note);
  const shut = () => {
    box.hidden = true;
    open.hidden = false;
    open.setAttribute('aria-expanded', 'false');
    note.textContent = '';
    delete note.dataset.tone;
    open.focus();
  };
  open.addEventListener('click', () => {
    open.hidden = true;
    open.setAttribute('aria-expanded', 'true');
    box.hidden = false;
    no.focus();
  });
  no.addEventListener('click', shut);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !yes.disabled) shut();
  });
  yes.addEventListener('click', async () => {
    busy(true);
    note.textContent = CHARACTER_COPY.retiring(c.name);
    delete note.dataset.tone;
    const r = await account.retireCharacter(c.id);
    if (r.ok) {
      onRetired?.(c.id);
      return;
    }
    busy(false);
    note.textContent = r.message || CHARACTER_COPY.failed;
    note.dataset.tone = 'bad';
    yes.focus();
  });
  li.append(open, box);
}

/**
 * The signed-in card's characters: a row each (Play as <name>, Level N; an extra one not signed
 * in has a small Retire), Start a fresh character (a name, then made and played) and, small, the
 * retired ones to restore. onPlay plays the signed-in one; onSwitched(id) boots again once the
 * site signed this browser in as another; onRetired() shows the card again after a retire.
 */
function appendCharacters(card, { account, session, characters, onPlay, onSwitched, onRetired, fresh: startFresh = false }) {
  const choices = characterChoices(characters, session);
  const status = el('p', { class: 'online-characters-status', role: 'status', 'aria-live': 'polite', 'data-online-characters-status': '' });
  const busy = (on) => {
    for (const b of card.querySelectorAll('button, input')) b.disabled = on;
  };
  const say = (text, bad = false) => {
    status.textContent = text;
    if (bad) status.dataset.tone = 'bad';
    else delete status.dataset.tone;
  };
  async function switchTo(id, name) {
    busy(true);
    say(CHARACTER_COPY.switching(name));
    const r = await account.playCharacter(id);
    if (r.ok) {
      onSwitched?.(id);
      return;
    }
    busy(false);
    say(r.message || CHARACTER_COPY.failed, true);
  }
  const list = el('ul', { class: 'online-characters', 'data-online-characters': '' });
  choices.rows.forEach((c, i) => {
    const b = el('button', { type: 'button', class: `${i === 0 ? 'online-play' : 'online-alt'} online-character`, 'data-online-character': String(c.id) });
    if (c.current) b.setAttribute('data-online-continue', '');
    b.append(el('span', { class: 'online-character-name' }, c.name ? CHARACTER_COPY.play(c.name) : 'Play'));
    // A space between: the button's name reads "Play as Ada Level 12" (the flex row drops it on screen).
    if (c.level) b.append(' ', el('span', { class: 'online-character-level' }, CHARACTER_COPY.level(c.level)));
    b.addEventListener('click', () => (c.current ? onPlay?.() : switchTo(c.id, c.name)));
    const li = el('li');
    li.append(b);
    if (c.retirable) appendRetire(li, c, { account, busy, onRetired });
    list.append(li);
  });
  card.append(list);
  if (choices.create) {
    const fresh = el('section', { class: 'online-fresh', 'data-online-fresh': '' });
    if (!choices.create.can) {
      fresh.append(el('p', { class: 'online-fresh-note', 'data-online-fresh-note': '' }, choices.create.note));
    } else {
      const open = el('button', { type: 'button', class: 'online-alt', 'data-online-new-character': '' }, CHARACTER_COPY.fresh);
      const form = el('form', { class: 'online-fresh-form', novalidate: '', 'data-online-fresh-form': '' });
      form.hidden = true;
      const input = el('input', { id: 'online-fresh-name', name: 'name', type: 'text', autocomplete: 'off', maxlength: '19', autocapitalize: 'words', spellcheck: 'false', required: '', 'aria-describedby': 'online-fresh-help online-fresh-error' });
      const error = el('span', { class: 'online-fresh-error', id: 'online-fresh-error', 'aria-live': 'polite', 'data-online-fresh-error': '' });
      const make = el('button', { type: 'submit', class: 'online-play' }, CHARACTER_COPY.make);
      const cancel = el('button', { type: 'button', class: 'online-home' }, CHARACTER_COPY.cancel);
      form.append(
        el('h3', {}, CHARACTER_COPY.freshTitle),
        el('p', {}, CHARACTER_COPY.freshBody),
        el('label', { for: 'online-fresh-name' }, CHARACTER_COPY.nameLabel),
        input,
        el('small', { id: 'online-fresh-help' }, CHARACTER_COPY.nameHelp),
        error,
        make,
        cancel,
      );
      const refuse = (text) => {
        error.textContent = text;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
      };
      open.addEventListener('click', () => {
        open.hidden = true;
        form.hidden = false;
        input.focus();
      });
      cancel.addEventListener('click', () => {
        form.hidden = true;
        open.hidden = false;
        error.textContent = '';
        input.removeAttribute('aria-invalid');
        open.focus();
      });
      input.addEventListener('input', () => {
        error.textContent = '';
        input.removeAttribute('aria-invalid');
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = input.value.trim().replace(/\s+/g, ' ');
        const problem = characterNameProblem(name);
        if (problem) return refuse(problem);
        busy(true);
        say(CHARACTER_COPY.making);
        const made = await account.createCharacter(name);
        if (!made.ok) {
          busy(false);
          say('');
          return refuse(createRefusalText(made, choices.create.limit));
        }
        const id = positiveId(made.character?.id);
        if (!id) {
          busy(false);
          return say(CHARACTER_COPY.failed, true);
        }
        busy(false);
        await switchTo(id, String(made.character.name || name));
      });
      fresh.append(open, form);
      // The character chip's Start a fresh character (#fresh): the form open, ready for a name.
      if (startFresh) {
        open.hidden = true;
        form.hidden = false;
        queueMicrotask(() => input.focus());
      }
    }
    card.append(fresh);
  }
  card.append(status);
  return choices;
}

/** The retired characters, small, under the rest: each can come back (extras only, the site decides). */
function appendRetired(card, { account, choices, onChanged }) {
  if (!choices.retired.length) return;
  const box = el('details', { class: 'online-retired', 'data-online-retired': '' });
  box.append(el('summary', {}, CHARACTER_COPY.retired));
  const note = el('p', { class: 'online-characters-status', role: 'status', 'aria-live': 'polite' });
  for (const c of choices.retired) {
    const b = el('button', { type: 'button', class: 'online-home', 'data-online-restore': String(c.id) }, CHARACTER_COPY.restore(c.name));
    b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await account.restoreCharacter(c.id);
      if (r.ok) {
        onChanged?.();
        return;
      }
      b.disabled = false;
      note.textContent = r.message || CHARACTER_COPY.failed;
      note.dataset.tone = 'bad';
    });
    box.append(b);
  }
  box.append(note);
  card.append(box);
}

function showGate(gate, state, { account, onSignedIn, onSignedOut = onSignedIn, session = null, onPlay = null, characters = null, onSwitched = null, onRefresh = null }) {
  const copy = GATE_COPY[state] || GATE_COPY.checking;
  gate.dataset.online = state;
  const card = gate.querySelector('.card');
  const keep = card.querySelector('img');
  card.replaceChildren(...(keep ? [keep] : []));
  const name = session?.player?.name || '';
  card.append(el('h2', {}, state === 'choose' && name ? `${copy.title}, ${name}` : copy.title));
  if (JUJU_BOSS_GATES.includes(state)) card.prepend(el('div', { class: 'online-boss', role: 'img', 'aria-label': 'The Juju Boss, shaking both fists' }));
  for (const line of copy.body) card.append(el('p', {}, line));
  if (state === 'choose') {
    // One row per character (the signed-in one alone when the site has no list), then a fresh one.
    const fresh = location.hash === FRESH_HASH;
    if (fresh) history.replaceState(history.state, '', location.pathname + location.search);
    const choices = appendCharacters(card, { account, session, characters, onPlay, onSwitched, onRetired: onRefresh, fresh });
    card.append(el('a', { class: 'online-alt', href: 'play/', 'data-online-solo': '' }, SOLO_COPY.button));
    const out = el('button', { type: 'button', class: 'online-home online-signout', 'data-online-signout': '' }, name ? `Not ${name}? Sign out` : 'Sign out');
    out.addEventListener('click', async () => {
      out.disabled = true;
      markContinued(false);
      try {
        await account.signOut();
      } finally {
        onSignedOut();
      }
    });
    card.append(out);
    appendRetired(card, { account, choices, onChanged: onRefresh });
    return;
  }
  if (state === 'signed-out') {
    const host = el('div', { class: 'online-account' });
    card.append(host);
    // A link from the site can open the gate on New player (/play/online/#new); a reset email opens it on a new
    // password; a sign-up email (#verify=<token>) finishes the character.
    mountAccountForms(host, { account, start: location.hash === '#new' ? 'signup' : 'signin', reset: resetLinkFrom(location.hash), verify: verifyLinkFrom(location.hash), onSignedIn });
  }
  if (state === 'suspended') {
    const out = el('button', { type: 'button', class: 'online-home online-signout', 'data-online-signout': '' }, 'Sign out');
    out.addEventListener('click', async () => {
      out.disabled = true;
      markContinued(false);
      try {
        await account.signOut();
      } finally {
        onSignedOut();
      }
    });
    card.append(out);
  }
  if (state === 'offline' || state === 'load-failed') {
    const retry = el('button', { type: 'button', class: 'online-play', 'data-online-retry': '' }, 'Try again');
    retry.addEventListener('click', () => location.reload());
    card.append(retry);
  }
  if (state === 'signed-out') {
    const solo = el('section', { class: 'online-solo', 'aria-labelledby': 'online-solo-title' });
    solo.append(el('h3', { id: 'online-solo-title' }, SOLO_COPY.title), el('p', {}, SOLO_COPY.body), el('a', { class: 'online-alt', href: 'play/', 'data-online-solo': '' }, SOLO_COPY.button));
    card.append(solo);
  } else if (state !== 'checking') {
    card.append(el('a', { class: 'online-play', href: 'play/', 'data-online-solo': '' }, SOLO_COPY.button));
  }
  if (state !== 'checking') card.append(el('a', { class: 'online-home', href: './' }, 'Back to Groddle Afternoon'));
}

/** A save taking longer than this shows "Saving…"; a routine autosave stays "Saved" (Austin 2026-10-28). */
export const SAVING_SHOWN_AFTER_MS = 1500;

/**
 * The quiet states: the wait before an autosave and a quick save read as Saved. Problems
 * (offline, not saved, a conflict, signed out) show at once.
 */
export function pillStateFor(state, { slow = false } = {}) {
  if (state === 'pending') return 'saved';
  if (state === 'saving') return slow ? 'saving' : 'saved';
  return state || 'saved';
}

function mountSavePill(player) {
  const who = player?.name ? `Playing as ${player.name}` : 'Multiplayer';
  const pill = el('div', { id: 'save-pill', class: 'save-pill', role: 'status', 'aria-live': 'polite', 'data-state': 'saved' });
  // In the pack only the cloud shows (its dot is the state) and the words are its tooltip: words
  // that changed length ("Saved", "Saving…") made the whole pack row change width (Austin 2026-10-30).
  // The cloud is a button: in multiplayer it opens Your characters (js/character-switcher.js, Austin 2026-11-12).
  const cloud = el('button', { type: 'button', class: 'save-pill-btn' });
  const icon = el('span', { class: 'save-pill-icon', 'aria-hidden': 'true' });
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z"/></svg>';
  cloud.append(icon);
  pill.append(cloud, el('span', { class: 'save-pill-who' }, who), el('span', { class: 'save-pill-state' }, PILL_TEXT.saved));
  const tip = (text) => {
    pill.dataset.tip = `${who} · ${text}`;
    cloud.setAttribute('aria-label', pill.dataset.tip);
  };
  tip(PILL_TEXT.saved);
  // In the pack's own corner under its hint, so it never covers the slots and the award and
  // new-day screens cover it with the rest of the game; the window's corner when there is no pack.
  const hint = document.querySelector('.pack-hint');
  const row = document.getElementById('pack-row');
  if (row && hint?.parentNode === row) {
    // The one-row pack: the cloud is the row's last button, beside search (Austin 2026-10-30).
    row.insertBefore(pill, hint);
    pill.classList.add('in-pack', 'in-row');
  } else if (hint?.parentNode) {
    const side = el('div', { class: 'pack-side' });
    hint.parentNode.insertBefore(side, hint);
    side.append(hint, pill);
    pill.classList.add('in-pack');
  } else {
    document.body.append(pill);
  }
  let shown = 'saved';
  let slowTimer = 0;
  const show = (s) => {
    if (s === shown) return;
    shown = s;
    // Elsewhere looks like a conflict in the pack (its words show, not just the cloud).
    pill.dataset.state = s === 'elsewhere' ? 'conflict' : s;
    // A conflict or an ended session needs the player: the words become the way out.
    // Reloading /play/online/ shows the gate's sign-in when the session is gone.
    const href = s === 'conflict' || s === 'signed-out' ? location.pathname : '';
    const text = PILL_TEXT[s] || s;
    tip(text);
    pill.lastChild.replaceWith(href ? el('a', { class: 'save-pill-state', href }, text) : el('span', { class: 'save-pill-state' }, text));
  };
  const alert = mountSaveAlert();
  window.addEventListener('groddle:save-state', (e) => {
    const s = e.detail?.state || 'saved';
    clearTimeout(slowTimer);
    if (s === 'saving') slowTimer = setTimeout(() => show(pillStateFor('saving', { slow: true })), SAVING_SHOWN_AFTER_MS);
    show(pillStateFor(s));
    alert(s, e.detail || {});
  });
}

/** The card over the game while the save is stopped; its buttons answer the store (groddle:save-choice) or reload. */
function mountSaveAlert() {
  const box = el('section', { class: 'save-alert', role: 'alertdialog', 'aria-live': 'assertive', 'aria-labelledby': 'save-alert-title', 'data-save-alert': '' });
  box.hidden = true;
  document.body.append(box);
  return (state, detail) => {
    const said = saveAlertFor(state, detail);
    box.hidden = !said;
    box.dataset.state = said ? state : '';
    if (!said) {
      box.replaceChildren();
      return;
    }
    const buttons = el('div', { class: 'save-alert-buttons' });
    for (const [choice, label] of said.buttons) {
      const b = el('button', { type: 'button', [`data-save-${choice === 'signIn' ? 'signin' : choice}`]: '' }, label);
      b.addEventListener('click', () => {
        if (choice === 'load' || choice === 'signIn' || choice === 'choose') {
          // Choose a character: this tab forgets its character, so the reload shows the card.
          if (choice === 'choose') markContinued(false);
          location.reload();
          return;
        }
        for (const x of buttons.querySelectorAll('button')) x.disabled = true;
        window.dispatchEvent(new CustomEvent('groddle:save-choice', { detail: { choice } }));
      });
      buttons.append(b);
    }
    box.replaceChildren(el('h2', { id: 'save-alert-title' }, said.title), el('p', {}, said.body), ...said.lines.map((l) => el('p', { class: 'save-alert-note' }, l)), buttons);
  };
}

async function boot({ account = createMinnAccountCore({ baseUri: document.baseURI }) } = {}) {
  const gate = document.getElementById('online-gate');
  const script = document.getElementById('online-boot');
  // Signed in from the gate's forms: the same steps again, now with a session, straight into the game.
  // A sign-up link is spent once used: it leaves the address bar before the gate looks at it again.
  const onSignedIn = () => {
    markContinued();
    if (verifyLinkFrom(location.hash)) history.replaceState(history.state, '', location.pathname);
    boot();
  };
  const onSignedOut = () => { boot(); };
  showGate(gate, 'checking', { account, onSignedIn });
  const session = await quietSession(account);
  const state = gateFor(session);
  // A sign-up link opened in a browser signed in already (as anyone): the link still finishes its character.
  if (state === 'ready' && verifyLinkFrom(location.hash)) {
    showGate(gate, 'signed-out', { account, onSignedIn });
    return;
  }
  if (state !== 'ready') {
    showGate(gate, state, { account, onSignedIn });
    return;
  }
  if (await suspendedNow(account)) {
    markContinued(false);
    showGate(gate, 'suspended', { account, onSignedIn, onSignedOut, session });
    return;
  }
  // Every call from here names this character (js/character-guard.js).
  account.useCharacter(session.player?.id);
  // Signed in already: a character to play, a fresh one or Play solo, once a tab (and again when another tab switched).
  if (!continuedHere(session.player?.id)) {
    const characters = await account.characters().catch(() => null);
    showGate(gate, 'choose', {
      account,
      onSignedIn,
      onSignedOut,
      session,
      characters,
      onPlay: () => { markContinued(session.player?.id); enter(gate, script, account, session, onSignedIn); },
      // The site signed this browser in as another character: boot again as that one, with the nonce in hand.
      onSwitched: (id) => { markContinued(id); boot({ account }); },
      onRefresh: () => { boot({ account }); },
    });
    return;
  }
  await enter(gate, script, account, session, onSignedIn);
}

/** How long the page waits on the page before's last write (a hung site must not hold the game). */
export const HANDOFF_WAIT_MS = 6000;

/**
 * A reload: the last write of the page before in this tab goes in before this page reads, so its
 * last seconds are in the copy this page loads, however late its own keepalive lands (ticket 21).
 */
export async function deliverHandoff(account, player, { scope = globalThis, waitMs = HANDOFF_WAIT_MS } = {}) {
  const handoff = takeHandoff({ scope, player });
  if (!handoff) return null;
  let timer;
  try {
    return await Promise.race([
      account.deliverHandoff(handoff.body).catch(() => null),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), waitMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Loads the signed-in player's save, then the game. */
async function enter(gate, script, account, session, onSignedIn) {
  let save;
  // This page's name on the save: another tab playing this character saves and stands down first
  // (js/save-claim.js), then the read claims the save for this page (MultiplayerSave.php).
  const writer = newWriterId();
  try {
    await deliverHandoff(account, session.player?.id);
    await claimCharacter({ player: session.player?.id, writer });
    save = await account.multiplayerSave({ writer });
    window.GRODDLE_MP_BOOT = bootDataFrom({ account, session, save, writer });
    markContinued(session.player?.id);
  } catch (err) {
    console.warn('[online] save did not load', err);
    showGate(gate, err?.status === 401 ? 'signed-out' : err?.code === 'groddle_suspended' ? 'suspended' : 'load-failed', { account, onSignedIn, onSignedOut: () => { boot(); } });
    return;
  }
  gate.hidden = true;
  gate.dataset.online = 'ready';
  document.body.classList.remove('online-gated');
  mountSavePill(session.player);
  // The reset key is spent once signed in: it leaves the address bar too.
  if (location.hash === '#new' || location.hash.startsWith('#reset=') || location.hash.startsWith('#verify=')) history.replaceState(history.state, '', location.pathname);
  const game = document.createElement('script');
  game.type = 'module';
  game.src = script.dataset.game;
  document.body.append(game);
}

if (typeof document !== 'undefined' && document.getElementById('online-boot')) {
  boot();
  // A reset or sign-up link opened in a tab already on the gate changes only the hash: show its form.
  window.addEventListener('hashchange', () => {
    if (document.getElementById('online-gate')?.dataset.online === 'signed-out' && (resetLinkFrom(location.hash) || verifyLinkFrom(location.hash))) boot();
  });
}
