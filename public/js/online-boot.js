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
 */

import { createMinnAccount } from './minn-account.js?v=nbhome-6';
import { mountAccountForms, resetLinkFrom } from './account-forms.js?v=g337-1';

const PILL_TEXT = {
  saved: 'Saved',
  pending: 'Saving soon',
  saving: 'Saving…',
  offline: 'Offline, retrying',
  conflict: 'Saved somewhere else. Reload',
  'signed-out': 'Signed out. Sign in again',
  error: 'Not saved',
};

/** The solo choice under the sign-in (plain remake copy, no em-dashes). */
export const SOLO_COPY = {
  title: 'Or play solo',
  body: 'Your own scrap of Ur, saved in this browser. No account needed.',
  button: 'Play solo',
};

/** Set when the player picks Play as <name> in this tab, so a reload goes straight in. */
const CONTINUE_KEY = 'groddle-online-continue';

function continuedHere() {
  try {
    return sessionStorage.getItem(CONTINUE_KEY) === '1';
  } catch {
    return false;
  }
}

function markContinued(on = true) {
  try {
    if (on) sessionStorage.setItem(CONTINUE_KEY, '1');
    else sessionStorage.removeItem(CONTINUE_KEY);
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
  offline: {
    title: 'The Groddle site is not answering',
    body: ['Multiplayer saves live on the site, so it has to be reachable to play. Try again in a moment.'],
  },
  'load-failed': {
    title: 'Your character did not load',
    body: ['The site answered, but your multiplayer save could not be read. Try again in a moment.'],
  },
};

/** Which gate a session answer leads to; 'ready' boots the game. */
export function gateFor(session) {
  if (session?.offline) return 'offline';
  if (!session?.minn) return 'no-server';
  if (!session.signedIn) return 'signed-out';
  return 'ready';
}

/** The boot data the multiplayer store reads (js/save-store.js createMultiplayerSaveStore). */
export function bootDataFrom({ account, session, save }) {
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
  };
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

function showGate(gate, state, { account, onSignedIn, onSignedOut = onSignedIn, session = null, onPlay = null }) {
  const copy = GATE_COPY[state] || GATE_COPY.checking;
  gate.dataset.online = state;
  const card = gate.querySelector('.card');
  const keep = card.querySelector('img');
  card.replaceChildren(...(keep ? [keep] : []));
  const name = session?.player?.name || '';
  card.append(el('h2', {}, state === 'choose' && name ? `${copy.title}, ${name}` : copy.title));
  for (const line of copy.body) card.append(el('p', {}, line));
  if (state === 'choose') {
    const play = el('button', { type: 'button', class: 'online-play', 'data-online-continue': '' }, name ? `Play as ${name}` : 'Play');
    play.addEventListener('click', () => onPlay?.());
    card.append(play, el('a', { class: 'online-alt', href: 'play/', 'data-online-solo': '' }, SOLO_COPY.button));
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
    return;
  }
  if (state === 'signed-out') {
    const host = el('div', { class: 'online-account' });
    card.append(host);
    // A link from the site can open the gate on New player (/play/online/#new); a reset email opens it on a new password.
    mountAccountForms(host, { account, start: location.hash === '#new' ? 'signup' : 'signin', reset: resetLinkFrom(location.hash), onSignedIn });
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

function mountSavePill(player) {
  const pill = el('div', { id: 'save-pill', class: 'save-pill', role: 'status', 'aria-live': 'polite', 'data-state': 'saved' });
  pill.append(el('span', { class: 'save-pill-who' }, player?.name ? `Playing as ${player.name}` : 'Multiplayer'), el('span', { class: 'save-pill-state' }, PILL_TEXT.saved));
  document.body.append(pill);
  window.addEventListener('groddle:save-state', (e) => {
    const s = e.detail?.state || 'saved';
    pill.dataset.state = s;
    // A conflict or an ended session needs the player: the words become the way out.
    // Reloading /play/online/ shows the gate's sign-in when the session is gone.
    const href = s === 'conflict' || s === 'signed-out' ? location.pathname : '';
    const text = PILL_TEXT[s] || s;
    pill.lastChild.replaceWith(href ? el('a', { class: 'save-pill-state', href }, text) : el('span', { class: 'save-pill-state' }, text));
  });
}

async function boot() {
  const gate = document.getElementById('online-gate');
  const script = document.getElementById('online-boot');
  const account = createMinnAccount({ baseUri: document.baseURI });
  // Signed in from the gate's forms: the same steps again, now with a session, straight into the game.
  const onSignedIn = () => { markContinued(); boot(); };
  const onSignedOut = () => { boot(); };
  showGate(gate, 'checking', { account, onSignedIn });
  const session = await account.session();
  const state = gateFor(session);
  if (state !== 'ready') {
    showGate(gate, state, { account, onSignedIn });
    return;
  }
  // Signed in already: Play as <name> or Play solo, once a tab.
  if (!continuedHere()) {
    showGate(gate, 'choose', { account, onSignedIn, onSignedOut, session, onPlay: () => { markContinued(); enter(gate, script, account, session, onSignedIn); } });
    return;
  }
  await enter(gate, script, account, session, onSignedIn);
}

/** Loads the signed-in player's save, then the game. */
async function enter(gate, script, account, session, onSignedIn) {
  let save;
  try {
    save = await account.multiplayerSave();
    window.GRODDLE_MP_BOOT = bootDataFrom({ account, session, save });
  } catch (err) {
    console.warn('[online] save did not load', err);
    showGate(gate, err?.status === 401 ? 'signed-out' : 'load-failed', { account, onSignedIn });
    return;
  }
  gate.hidden = true;
  gate.dataset.online = 'ready';
  document.body.classList.remove('online-gated');
  mountSavePill(session.player);
  // The reset key is spent once signed in: it leaves the address bar too.
  if (location.hash === '#new' || location.hash.startsWith('#reset=')) history.replaceState(history.state, '', location.pathname);
  const game = document.createElement('script');
  game.type = 'module';
  game.src = script.dataset.game;
  document.body.append(game);
}

if (typeof document !== 'undefined' && document.getElementById('online-boot')) {
  boot();
  // A reset link opened in a tab already on the gate changes only the hash: show its form.
  window.addEventListener('hashchange', () => {
    if (document.getElementById('online-gate')?.dataset.online === 'signed-out' && resetLinkFrom(location.hash)) boot();
  });
}
