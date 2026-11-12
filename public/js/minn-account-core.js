/**
 * The player's account on the Groddle site (Minn, groddle-afternoon-site): signing
 * up, in and out by email, who is signed in, the multiplayer save, and the
 * solo backups, over the groddle/v1 REST routes (groddle-afternoon-site/src/
 * PlayerAccount.php, Player.php, MultiplayerSave.php, SoloBackups.php).
 *
 * Minn speaks WordPress's sign-in contract: the sign-in cookie counts on a
 * REST call only with its wp_rest nonce, which a signed-in page asks for at
 * wp-admin/admin-ajax.php?action=rest-nonce (a signed-out page gets "0"
 * with 400). Every answer hands back a fresh nonce in X-WP-Nonce, kept here.
 * On a plain static server (local QA) none of this exists and session()
 * says { minn: false }.
 *
 * This file is what the sign-in pages and the phone companion need (js/phone/companion.js stays
 * under its 240 KB budget, tests/phone-companion.test.js). The rest of the account's calls, which
 * only the game makes, are in js/minn-account.js, which starts from this one.
 *
 * This module never imports js/save-store.js: /play/online/ uses it to
 * fetch the save BEFORE the store (and game.js) loads.
 *
 * Alternate characters (2026-11-12): every call names the character the page plays in the
 * X-Groddle-Character header (js/character-guard.js; by default the multiplayer boot data's
 * player, so each feature's account sends it with no change of its own). The site's 409
 * character_changed is announced on the page, which stops writing.
 */

import { announceCharacterChanged, characterHeaders, characterId, characterOf, isCharacterChanged } from './character-guard.js?v=510034a7';

/** Where the account lives, from the page's base URI (the site root: play pages set <base>). */
export function minnUrls(baseUri) {
  const at = (path) => new URL(path, baseUri).href;
  return {
    nonce: at('wp-admin/admin-ajax.php?action=rest-nonce'),
    /** Answers 200 signed in or out (G322: session() asks it before rest-nonce). */
    heartbeat: at('wp-admin/admin-ajax.php?action=heartbeat'),
    api: at('wp-json/groddle/v1/'),
    /** The multiplayer entry, where a signed-out player signs in (its gate holds the forms). */
    online: at('play/online/'),
  };
}

const NONCE = /^[0-9a-f]{10}$/;

/**
 * The account and what the game's own calls are built on: { account, call, post, refusal, signedIn,
 * failed, buddyCall, refreshNonce }.
 *
 * @param {{ baseUri: string, fetch?: typeof fetch, nonce?: string, character?: number }} opts
 *   nonce: a REST nonce already in hand (the multiplayer boot data), so the
 *   first call needs no admin-ajax round trip. character: the user id this page plays
 *   (X-Groddle-Character), by default the boot data's player; 0 sends none.
 */
export function accountParts({ baseUri, fetch: fetchFn = globalThis.fetch?.bind(globalThis), nonce: givenNonce = '', character: givenCharacter = characterOf(globalThis) } = {}) {
  const urls = minnUrls(baseUri);
  let nonce = NONCE.test(String(givenNonce)) ? String(givenNonce) : '';
  let character = characterId(givenCharacter);

  async function call(path, { method = 'GET', body, keepalive = false } = {}) {
    const headers = { ...characterHeaders(character) };
    if (nonce) headers['X-WP-Nonce'] = nonce;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetchFn(urls.api + path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const fresh = res.headers?.get?.('X-WP-Nonce');
    if (fresh) nonce = fresh;
    let data = null;
    try { data = await res.json(); } catch { /* not JSON: no Minn here */ }
    if (character && isCharacterChanged(res.status, data)) announceCharacterChanged(globalThis, { character, path });
    return { status: res.status, ok: res.ok, data };
  }

  /** A fresh nonce from admin-ajax (a stale one answers 403 rest_cookie_invalid_nonce). */
  async function refreshNonce() {
    try {
      const res = await fetchFn(urls.nonce, { credentials: 'same-origin', cache: 'no-store' });
      const text = String(await res.text()).trim();
      if (res.ok && NONCE.test(text)) {
        nonce = text;
        return true;
      }
    } catch { /* offline: the caller's answer stands */ }
    return false;
  }

  /**
   * A call to a route anyone may use (sign-up, sign-in): a nonce that went
   * stale with a session that ended is refused even here, so the call is
   * made again with a fresh one, or none.
   */
  async function post(path, body, method = 'POST') {
    let r;
    try {
      r = await call(path, { method, body });
      if (r.status === 403 && r.data?.code === 'rest_cookie_invalid_nonce') {
        if (!(await refreshNonce())) nonce = '';
        r = await call(path, { method, body });
      } else if (r.status === 401 && r.data?.code === 'rest_not_logged_in' && !nonce && (await refreshNonce())) {
        // Made before this helper had a nonce (the Menu and the character chip): the site saw no sign-in.
        r = await call(path, { method, body });
      }
    } catch {
      return { status: 0, ok: false, data: { code: 'offline', message: 'The Groddle site is not answering. Try again in a moment.' } };
    }
    return r;
  }

  const refusal = (r) => ({
    ok: false,
    code: r.data?.code || `http_${r.status}`,
    message: r.data?.message || 'That didn\'t work. Try again in a moment.',
    fields: r.data?.fields && typeof r.data.fields === 'object' ? r.data.fields : {},
  });

  /** A sign-up or sign-in answer; the new session's nonce is fetched before anything else is asked. */
  async function signedIn(r) {
    if (!r.ok || r.data?.signedIn !== true) return refusal(r);
    nonce = '';
    await refreshNonce();
    return { ok: true, player: r.data.player };
  }

  const failed = (what, r) => Object.assign(new Error(`${what} failed (${r.status}${r.data?.code ? ` ${r.data.code}` : ''})`), { status: r.status, code: r.data?.code || '', data: r.data });

  /** A signed-in call that refreshes a stale nonce once (as realtimeTicket does) and throws on a refusal. */
  async function buddyCall(what, path, init = {}) {
    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await call(path, init);
      } catch {
        throw Object.assign(new Error('The Groddle site is not answering'), { status: 0, code: 'offline', message: 'The Groddle site is not answering. Try again in a moment.' });
      }
      if (r.status === 403 && r.data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refreshNonce())) continue;
      // A call made before this helper had a nonce goes out signed out (401 rest_not_logged_in): fetch one and try once more.
      if (r.status === 401 && r.data?.code === 'rest_not_logged_in' && attempt === 0 && (await refreshNonce())) continue;
      break;
    }
    if (!r.ok) {
      const err = failed(what, r);
      if (typeof r.data?.message === 'string') err.message = r.data.message;
      throw err;
    }
    return r.data;
  }

  const account = {
    urls,

    get nonce() { return nonce; },

    /** The character this page's calls name (X-Groddle-Character), 0 for none. */
    get character() { return character; },

    /** Names another character on the calls from now on (the start card, once it knows who is signed in). */
    useCharacter(id) {
      character = characterId(id);
    },

    /**
     * Who is playing: { minn, signedIn, player, backups, account, admin? }. minn is false when
     * the site has no Groddle account routes (a static server), or when it
     * cannot be reached ({ minn: false, offline: true }).
     */
    async session() {
      // G322: rest-nonce answers a signed-out page "0" with 400, which the console logs (the
      // solo Account panel, the phone companion, /play/online/). admin-ajax's heartbeat answers
      // 200 to anyone: a signed-in cookie with no heartbeat nonce gets wp_ajax_heartbeat's
      // {"success":false} (its empty _nonce check), a signed-out visit wp_ajax_nopriv_heartbeat's
      // {"server_time":...}. So only a signed-in page asks rest-nonce; a signed-out one asks
      // groddle/v1/me alone (open to anyone, no nonce needed). The host serves the play pages
      // itself, so a 5xx here means PHP is down: offline, not "no accounts here".
      const offline = { minn: false, offline: true, signedIn: false, player: null };
      const none = { minn: false, signedIn: false, player: null };
      let beat = null;
      try {
        const res = await fetchFn(urls.heartbeat, { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
        if (res.status >= 500) return offline;
        beat = res.ok ? await res.json().catch(() => null) : null;
      } catch {
        return offline;
      }
      if (!beat || typeof beat !== 'object') return none;
      if (beat.success !== false) {
        let me;
        try {
          const res = await fetchFn(`${urls.api}me`, { credentials: 'same-origin', cache: 'no-store' });
          if (res.status >= 500) return offline;
          me = { ok: res.ok, data: await res.json().catch(() => null) };
        } catch {
          return offline;
        }
        if (!me.ok || typeof me.data?.signedIn !== 'boolean') return none;
        if (!me.data.signedIn) {
          nonce = '';
          return { minn: true, signedIn: false, player: null, backups: null, account: null };
        }
        // A session that began between the two asks: on to rest-nonce for its nonce.
      }
      let res;
      try {
        res = await fetchFn(urls.nonce, { credentials: 'same-origin', cache: 'no-store' });
      } catch {
        return offline;
      }
      const text = String(await res.text()).trim();
      nonce = res.ok && NONCE.test(text) ? text : '';
      if (!nonce && !(res.status === 400 && text === '0')) return none;
      let me;
      try {
        me = await call('me');
      } catch {
        return offline;
      }
      if (!me.ok || typeof me.data?.signedIn !== 'boolean') return none;
      // admin (G567): the account is an administrator (only then present); a hint for the chat's Delete line, the site checks again.
      return { minn: true, signedIn: me.data.signedIn, player: me.data.player || null, backups: me.data.backups || null, account: me.data.account || null, ...(me.data.admin === true ? { admin: true } : {}) };
    },

    /**
     * A new player (email, password, the character's name). The site holds
     * the sign-up until the emailed link is opened: { ok: true, pending:
     * true, email, name, nameHeld } (nameHeld: another sign-up waiting on its
     * link asked for the name too). A local QA address is made at once and
     * signed straight in: { ok: true, player }. A refusal is { ok: false,
     * code, message, fields } keyed by form field (email, password, name).
     */
    async signUp({ email, password, name, website = '' }) {
      const r = await post('players', { email, password, name, website });
      if (r.status === 202 && r.data?.pending === true) {
        return { ok: true, pending: true, email: String(r.data.email || email), name: String(r.data.name || name), nameHeld: r.data.nameHeld === true };
      }
      return signedIn(r);
    },

    /**
     * Opens a held sign-up's link (its token from /play/online/#verify=):
     * the account is made and signed in, { ok: true, player }. A name
     * someone got first is refused with code name_taken and fields.name;
     * send the token again with another name. Other refusals: signup_used,
     * signup_expired, signup_unknown, email_exists.
     */
    async verifySignUp({ token, name = '' }) {
      return signedIn(await post('players/verify', name ? { token, name } : { token }));
    },

    /**
     * Mails a held sign-up a new link, by its token ({ ok, email }) or by
     * email ({ ok }: the same whether or not one is waiting). Refusals:
     * signup_wait (a minute between emails), signup_spent, signup_used,
     * signup_unknown.
     */
    async resendSignUp({ token = '', email = '' } = {}) {
      const r = await post('players/resend', token ? { token } : { email });
      return r.ok ? { ok: true, ...(r.data?.email ? { email: String(r.data.email) } : {}) } : refusal(r);
    },

    /** Signs in by email; remember keeps the session for two weeks. Same answers as signUp. */
    async signIn({ email, password, remember = false }) {
      return signedIn(await post('session', { email, password, remember }));
    },

    /** Signs out (ends the session on the site). */
    async signOut() {
      const r = await post('session', undefined, 'DELETE');
      nonce = '';
      return { ok: r.ok };
    },

    /**
     * The login's characters (groddle/v1/characters): { login, current, limit, canCreate,
     * nextCreateAt, characters: [{ id, name, level, lastPlayedAt, retired, first }] }.
     * Throws with .status and .code on a refusal (401 signed out).
     */
    async characters() {
      return buddyCall('Loading your characters', 'characters');
    },

    /**
     * A new character on this login: { ok: true, character } or a refusal { ok: false, code,
     * message, fields } (422 the name, with fields.name in the sign-up's words; 409 the limit;
     * 429 one a day). It is not played yet: playCharacter(id) does that.
     */
    async createCharacter(name) {
      const r = await post('characters', { name: String(name ?? '').trim().replace(/\s+/g, ' ') });
      return r.ok && r.data?.character ? { ok: true, character: r.data.character } : { ...refusal(r), status: r.status };
    },

    /**
     * Signs this browser in as another character of the login: { ok: true } with the new
     * session's nonce in hand and the calls naming that character, or a refusal.
     */
    async playCharacter(id) {
      const r = await post(`characters/${Number(id)}/play`, {});
      if (!r.ok || r.data?.ok !== true) return { ...refusal(r), status: r.status };
      nonce = NONCE.test(String(r.data.nonce || '')) ? String(r.data.nonce) : '';
      if (!nonce) await refreshNonce();
      character = characterId(id);
      return { ok: true };
    },

    /** Retires an extra character (hidden, kept, restorable): { ok } or a refusal. */
    async retireCharacter(id) {
      const r = await post(`characters/${Number(id)}/retire`, {});
      return r.ok ? { ok: true } : refusal(r);
    },

    /** Brings a retired character back: { ok } or a refusal. */
    async restoreCharacter(id) {
      const r = await post(`characters/${Number(id)}/restore`, {});
      return r.ok ? { ok: true } : refusal(r);
    },

    /**
     * A new password for the signed-in player, the current one first. The
     * site signs this browser in again (other devices are signed out), so a
     * fresh nonce follows. Same answers as signIn.
     */
    async changePassword({ current, password }) {
      return signedIn(await post('account/password', { current, password }, 'PUT'));
    },

    /** A new sign-in email, the current password first: { ok, email } or a refusal. */
    async changeEmail({ current, email }) {
      const r = await post('account/email', { current, email }, 'PUT');
      return r.ok ? { ok: true, email: String(r.data?.email || email) } : refusal(r);
    },

    /** Mails a password reset link. { ok, message }: the same answer whether or not the address has an account. */
    async requestPasswordReset(email) {
      const r = await post('password-reset', { email });
      return r.ok ? { ok: true } : refusal(r);
    },

    /** A new password from a reset link (its key and login), then signed straight in. Same answers as signUp. */
    async confirmPasswordReset({ login, key, password }) {
      return signedIn(await post('password-reset/confirm', { login, key, password }));
    },

    /**
     * The multiplayer save: { version, updatedAt, data } (data null before the first write).
     * writer: the game page's id, which claims the save for that page (the window that
     * loads last is the one that saves, MultiplayerSave.php); peek: read only, no claim and
     * no catching up on trades (the phone companion, which never writes the save).
     */
    async multiplayerSave({ writer = '', peek = false } = {}) {
      const query = peek ? '?peek=1' : writer ? `?writer=${encodeURIComponent(writer)}` : '';
      const r = await call(`save${query}`);
      if (!r.ok) throw failed('Loading the multiplayer save', r);
      return r.data;
    },

    /**
     * Delivers the last write of the page before in this tab (js/save-claim.js takeHandoff), as
     * that page sent it: { status, data }. A refusal is an answer, not an error.
     */
    async deliverHandoff(body) {
      let parsed;
      try { parsed = JSON.parse(body); } catch { return { status: 0, data: null }; }
      const r = await call('save', { method: 'PUT', body: parsed });
      return { status: r.status, data: r.data };
    },

    /** The buddy list (the rest of the family: js/minn-account.js). */
    async buddies() {
      return buddyCall('Loading buddies', 'buddies');
    },

    /** "Appear offline" (groddle-afternoon-site, user meta groddle_appear_offline): { off }. */
    async presence() {
      return buddyCall('Checking how you show', 'account/presence');
    },

    /** Switches "Appear offline": { off, live } (live: the realtime server took it at once). */
    async setPresence(off) {
      return buddyCall('Changing how you show', 'account/presence', { method: 'PUT', body: { off: Boolean(off) } });
    },

    /** The mail between players (the rest of the family: js/minn-account.js). */
    async playerMail() {
      return buddyCall('Checking your mail', 'mail');
    },
  };

  return { account, call, post, refusal, signedIn, failed, buddyCall, refreshNonce };
}

/** The account with the calls the sign-in pages and the phone make. */
export function createMinnAccountCore(opts) {
  return accountParts(opts).account;
}
