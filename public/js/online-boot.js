/**
 * /play/online/ (multiplayer phase 2): sign the player in, load the whole
 * multiplayer save from Minn into window.GRODDLE_MP_BOOT, and only then load
 * game.js, whose save store (js/save-store.js) serves the game from that copy
 * and writes it back. A signed-out player is offered Log in or Create an
 * account, each coming back here; a page with no Groddle site behind it (a
 * static server) says multiplayer needs one. The save state shows in a pill.
 *
 * Load order matters: this module must not import js/save-store.js (the store
 * reads GRODDLE_MP_BOOT once, when it first loads), so game.js is added as a
 * module script after the save is in place. The page is generated from
 * play/index.html by tools/play-online/build.mjs.
 */

import { createMinnAccount } from './minn-account.js?v=mp2-1';

const PILL_TEXT = {
  saved: 'Saved',
  pending: 'Saving soon',
  saving: 'Saving…',
  offline: 'Offline, retrying',
  conflict: 'Saved somewhere else. Reload',
  'signed-out': 'Signed out. Log in again',
  error: 'Not saved',
};

/** The gate's words for each state (plain remake copy, no em-dashes). */
export const GATE_COPY = {
  checking: { title: 'Finding your account', body: ['Checking whether you are signed in…'] },
  'signed-out': {
    title: 'Sign in to play with others',
    body: ['Multiplayer keeps your character on the Groddle site, so it is the same on every device.', 'Your solo game is still right here. It saves in this browser and needs no account.'],
  },
  registered: {
    title: 'Check your email',
    body: ['We sent you a link to set your password. Set it, then log in here to start your multiplayer character.'],
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
export function gateFor(session, { registered = false } = {}) {
  if (session?.offline) return 'offline';
  if (!session?.minn) return 'no-server';
  if (!session.signedIn) return registered ? 'registered' : 'signed-out';
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

function showGate(gate, state, { urls, back }) {
  const copy = GATE_COPY[state] || GATE_COPY.checking;
  gate.dataset.online = state;
  const card = gate.querySelector('.card');
  const keep = card.querySelector('img');
  card.replaceChildren(...(keep ? [keep] : []));
  card.append(el('h2', {}, copy.title));
  for (const line of copy.body) card.append(el('p', {}, line));
  if (state === 'signed-out' || state === 'registered') {
    card.append(el('a', { class: 'online-play', href: urls.login(back), 'data-online-login': '' }, 'Log in'));
    if (state === 'signed-out') card.append(el('a', { class: 'online-alt', href: urls.register(back), 'data-online-register': '' }, 'Create an account'));
  }
  if (state === 'offline' || state === 'load-failed') {
    const retry = el('button', { type: 'button', class: 'online-play', 'data-online-retry': '' }, 'Try again');
    retry.addEventListener('click', () => location.reload());
    card.append(retry);
  }
  if (state !== 'checking') {
    card.append(el('a', { class: state === 'signed-out' || state === 'registered' ? 'online-home' : 'online-play', href: 'play/' }, 'Play solo'));
    card.append(el('a', { class: 'online-home', href: './' }, 'Back to Groddle Afternoon'));
  }
}

function mountSavePill(player, urls, back) {
  const pill = el('div', { id: 'save-pill', class: 'save-pill', role: 'status', 'aria-live': 'polite', 'data-state': 'saved' });
  pill.append(el('span', { class: 'save-pill-who' }, player?.name ? `Playing as ${player.name}` : 'Multiplayer'), el('span', { class: 'save-pill-state' }, PILL_TEXT.saved));
  document.body.append(pill);
  window.addEventListener('groddle:save-state', (e) => {
    const s = e.detail?.state || 'saved';
    pill.dataset.state = s;
    // A conflict or an ended session needs the player: the words become the way out.
    const href = s === 'conflict' ? location.pathname : s === 'signed-out' ? urls.login(back) : '';
    const text = PILL_TEXT[s] || s;
    pill.lastChild.replaceWith(href ? el('a', { class: 'save-pill-state', href }, text) : el('span', { class: 'save-pill-state' }, text));
  });
}

async function boot() {
  const gate = document.getElementById('online-gate');
  const script = document.getElementById('online-boot');
  const account = createMinnAccount({ baseUri: document.baseURI });
  const back = new URL(location.pathname, location.origin).href;
  const registered = /[?&]action=register\b/.test(document.referrer || '');
  showGate(gate, 'checking', { urls: account.urls, back });
  const session = await account.session();
  const state = gateFor(session, { registered });
  if (state !== 'ready') {
    showGate(gate, state, { urls: account.urls, back });
    return;
  }
  let save;
  try {
    save = await account.multiplayerSave();
    window.GRODDLE_MP_BOOT = bootDataFrom({ account, session, save });
  } catch (err) {
    console.warn('[online] save did not load', err);
    showGate(gate, err?.status === 401 ? 'signed-out' : 'load-failed', { urls: account.urls, back });
    return;
  }
  gate.hidden = true;
  gate.dataset.online = 'ready';
  document.body.classList.remove('online-gated');
  mountSavePill(session.player, account.urls, back);
  const game = document.createElement('script');
  game.type = 'module';
  game.src = script.dataset.game;
  document.body.append(game);
}

if (typeof document !== 'undefined' && document.getElementById('online-boot')) boot();
