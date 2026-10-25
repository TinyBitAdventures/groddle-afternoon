/**
 * The player's account on the Groddle site (Minn, minn/groddle): who is
 * signed in, the multiplayer save, and the solo backups, over the
 * groddle/v1 REST routes (minn/groddle/src/Player.php, MultiplayerSave.php,
 * SoloBackups.php).
 *
 * Minn speaks WordPress's sign-in contract: the sign-in cookie counts on a
 * REST call only with its wp_rest nonce, which a signed-in page asks for at
 * wp-admin/admin-ajax.php?action=rest-nonce (a signed-out page gets "0"
 * with 400). Every answer hands back a fresh nonce in X-WP-Nonce, kept here.
 * On a plain static server (local QA) none of this exists and session()
 * says { minn: false }.
 *
 * This module never imports js/save-store.js: /play/online/ uses it to
 * fetch the save BEFORE the store (and game.js) loads.
 */

/** Where the account lives, from the page's base URI (the site root: play pages set <base>). */
export function minnUrls(baseUri) {
  const at = (path) => new URL(path, baseUri).href;
  return {
    nonce: at('wp-admin/admin-ajax.php?action=rest-nonce'),
    api: at('wp-json/groddle/v1/'),
    /** Sign in, then come back to `back` (an absolute URL on this site). */
    login: (back) => at(`wp-login.php?redirect_to=${encodeURIComponent(back)}`),
    /** Make an account; the page comes back to `back` after the form. */
    register: (back) => at(`wp-login.php?action=register&redirect_to=${encodeURIComponent(back)}`),
  };
}

const NONCE = /^[0-9a-f]{10}$/;

/**
 * @param {{ baseUri: string, fetch?: typeof fetch, nonce?: string }} opts
 *   nonce: a REST nonce already in hand (the multiplayer boot data), so the
 *   first call needs no admin-ajax round trip.
 */
export function createMinnAccount({ baseUri, fetch: fetchFn = globalThis.fetch?.bind(globalThis), nonce: givenNonce = '' } = {}) {
  const urls = minnUrls(baseUri);
  let nonce = NONCE.test(String(givenNonce)) ? String(givenNonce) : '';

  async function call(path, { method = 'GET', body, keepalive = false } = {}) {
    const headers = {};
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

  const failed = (what, r) => Object.assign(new Error(`${what} failed (${r.status}${r.data?.code ? ` ${r.data.code}` : ''})`), { status: r.status, code: r.data?.code || '', data: r.data });

  return {
    urls,
    get nonce() { return nonce; },

    /**
     * Who is playing: { minn, signedIn, player, backups }. minn is false when
     * the site has no Groddle account routes (a static server), or when it
     * cannot be reached ({ minn: false, offline: true }).
     */
    async session() {
      let res;
      try {
        res = await fetchFn(urls.nonce, { credentials: 'same-origin', cache: 'no-store' });
      } catch {
        return { minn: false, offline: true, signedIn: false, player: null };
      }
      const text = String(await res.text()).trim();
      nonce = res.ok && NONCE.test(text) ? text : '';
      if (!nonce && !(res.status === 400 && text === '0')) return { minn: false, signedIn: false, player: null };
      let me;
      try {
        me = await call('me');
      } catch {
        return { minn: false, offline: true, signedIn: false, player: null };
      }
      if (!me.ok || typeof me.data?.signedIn !== 'boolean') return { minn: false, signedIn: false, player: null };
      return { minn: true, signedIn: me.data.signedIn, player: me.data.player || null, backups: me.data.backups || null };
    },

    /** The multiplayer save: { version, updatedAt, data } (data null before the first write). */
    async multiplayerSave() {
      const r = await call('save');
      if (!r.ok) throw failed('Loading the multiplayer save', r);
      return r.data;
    },

    /** The solo backups: { slots, maxBytes, backups: [{ slot, madeAt, gameDay, size }] }. */
    async listBackups() {
      const r = await call('backups');
      if (!r.ok) throw failed('Listing backups', r);
      return r.data;
    },

    /** One backup with its save. */
    async readBackup(slot) {
      const r = await call(`backups/${Number(slot)}`);
      if (!r.ok) throw failed('Reading the backup', r);
      return r.data;
    },

    /** Backs a solo save (save-store soloSaveSnapshot()) up into a slot. */
    async writeBackup(slot, data, gameDay = '') {
      const r = await call(`backups/${Number(slot)}`, { method: 'PUT', body: { data, gameDay } });
      if (!r.ok) throw failed('Backing up', r);
      return r.data;
    },

    /**
     * A single-use ticket for the realtime server (multiplayer phase 3,
     * minn/groddle/src/RealtimeTicket.php): { ticket, expiresIn, path }.
     * Throws with .status: 401 signed out, 503 when the site has no realtime
     * secret, 0 when the site cannot be reached. A stale nonce is refreshed
     * once.
     */
    async realtimeTicket() {
      let r;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          r = await call('realtime', { method: 'POST' });
        } catch {
          throw Object.assign(new Error('The Groddle site is not answering'), { status: 0, code: 'offline' });
        }
        if (r.status === 403 && r.data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refreshNonce())) continue;
        break;
      }
      if (!r.ok || typeof r.data?.ticket !== 'string') throw failed('Asking for a realtime ticket', r);
      return r.data;
    },

    async deleteBackup(slot) {
      const r = await call(`backups/${Number(slot)}`, { method: 'DELETE' });
      if (!r.ok) throw failed('Deleting the backup', r);
      return r.data;
    },
  };
}
