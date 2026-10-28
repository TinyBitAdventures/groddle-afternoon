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

import { createMinnAccount } from './minn-account.js?v=nbhome-10';
import { mountAccountForms, resetLinkFrom, verifyLinkFrom } from './account-forms.js?v=g399-1';

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
  // The administrators' console banned this account (groddle-afternoon-site src/AdminConsole.php).
  suspended: {
    title: 'Account suspended',
    body: ['This account is suspended.', 'It cannot play with others. Solo play in this browser still works.'],
  },
  'load-failed': {
    title: 'Your character did not load',
    body: ['The site answered, but your multiplayer save could not be read. Try again in a moment.'],
  },
};

/**
 * Who is playing, as account.session() answers, without the console's 400 on a signed-out visit
 * (G322). session() asks admin-ajax rest-nonce first, and a signed-out page gets "0" with 400.
 * admin-ajax's heartbeat answers 200 to anyone: with no heartbeat nonce a signed-in cookie gets
 * wp_ajax_heartbeat's {"success":false} (its empty _nonce check), a signed-out visit
 * wp_ajax_nopriv_heartbeat's {"server_time":…}. So only a signed-in page goes on to session();
 * a signed-out one asks groddle/v1/me alone (open to anyone, no nonce needed).
 */
export async function quietSession(account, { fetch: fetchFn = globalThis.fetch?.bind(globalThis), baseUri = globalThis.document?.baseURI } = {}) {
  const offline = { minn: false, offline: true, signedIn: false, player: null };
  const none = { minn: false, signedIn: false, player: null };
  let beat = null;
  try {
    const res = await fetchFn(new URL('wp-admin/admin-ajax.php?action=heartbeat', baseUri).href, { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    beat = res.ok ? await res.json().catch(() => null) : null;
  } catch {
    return offline;
  }
  if (!beat || typeof beat !== 'object') return none;
  if (beat.success === false) return account.session();
  let me;
  try {
    const res = await fetchFn(`${account.urls.api}me`, { credentials: 'same-origin', cache: 'no-store' });
    me = { ok: res.ok, data: await res.json().catch(() => null) };
  } catch {
    return offline;
  }
  if (!me.ok || typeof me.data?.signedIn !== 'boolean') return none;
  // A session that began between the two asks still has no nonce here: session() fetches it.
  if (me.data.signedIn) return account.session();
  return { minn: true, signedIn: false, player: null, backups: null, account: null };
}

/**
 * Whether the signed-in account is suspended (groddle/v1/me "suspended", the
 * administrators' console's ban). account.session() does not carry it, so the
 * gate asks once more before it offers Play as <name>; a failed ask is false
 * (the save route refuses a suspended account anyway, and enter() says so).
 */
export async function suspendedNow(account, { fetch: fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  try {
    const res = await fetchFn(`${account.urls.api}me`, { credentials: 'same-origin', cache: 'no-store', headers: account.nonce ? { 'X-WP-Nonce': account.nonce } : {} });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return data?.signedIn === true && data.suspended === true;
  } catch {
    return false;
  }
}

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
  const pill = el('div', { id: 'save-pill', class: 'save-pill', role: 'status', 'aria-live': 'polite', 'data-state': 'saved' });
  pill.append(el('span', { class: 'save-pill-who' }, player?.name ? `Playing as ${player.name}` : 'Multiplayer'), el('span', { class: 'save-pill-state' }, PILL_TEXT.saved));
  // In the pack's own corner under its hint, so it never covers the slots and the award and
  // new-day screens cover it with the rest of the game; the window's corner when there is no pack.
  const hint = document.querySelector('.pack-hint');
  if (hint?.parentNode) {
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
    pill.dataset.state = s;
    // A conflict or an ended session needs the player: the words become the way out.
    // Reloading /play/online/ shows the gate's sign-in when the session is gone.
    const href = s === 'conflict' || s === 'signed-out' ? location.pathname : '';
    const text = PILL_TEXT[s] || s;
    pill.lastChild.replaceWith(href ? el('a', { class: 'save-pill-state', href }, text) : el('span', { class: 'save-pill-state' }, text));
  };
  window.addEventListener('groddle:save-state', (e) => {
    const s = e.detail?.state || 'saved';
    clearTimeout(slowTimer);
    if (s === 'saving') slowTimer = setTimeout(() => show(pillStateFor('saving', { slow: true })), SAVING_SHOWN_AFTER_MS);
    show(pillStateFor(s));
  });
}

async function boot() {
  const gate = document.getElementById('online-gate');
  const script = document.getElementById('online-boot');
  const account = createMinnAccount({ baseUri: document.baseURI });
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
