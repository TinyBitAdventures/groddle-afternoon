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
 * This module never imports js/save-store.js: /play/online/ uses it to
 * fetch the save BEFORE the store (and game.js) loads.
 */

/** Where the account lives, from the page's base URI (the site root: play pages set <base>). */
export function minnUrls(baseUri) {
  const at = (path) => new URL(path, baseUri).href;
  return {
    nonce: at('wp-admin/admin-ajax.php?action=rest-nonce'),
    api: at('wp-json/groddle/v1/'),
    /** The multiplayer entry, where a signed-out player signs in (its gate holds the forms). */
    online: at('play/online/'),
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
      break;
    }
    if (!r.ok) {
      const err = failed(what, r);
      if (typeof r.data?.message === 'string') err.message = r.data.message;
      throw err;
    }
    return r.data;
  }

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
      return { minn: true, signedIn: me.data.signedIn, player: me.data.player || null, backups: me.data.backups || null, account: me.data.account || null };
    },

    /**
     * A new player (email, password, the character's name): signed straight
     * in. { ok: true, player } or { ok: false, code, message, fields } with
     * the refusals keyed by form field (email, password, name).
     */
    async signUp({ email, password, name, website = '' }) {
      return signedIn(await post('players', { email, password, name, website }));
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
     * groddle-afternoon-site/src/RealtimeTicket.php): { ticket, expiresIn, path }.
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

    /**
     * Buddies (register G325, groddle-afternoon-site/src/Buddies.php): each
     * call answers the whole list, { limit, group, buddies, reverse,
     * ignoring, watch: { token, expiresIn } }, the token being what the
     * realtime server watches (buddies_watch). addBuddy also answers told,
     * the proof for buddy_tell. A refusal throws with .status, .code and the
     * site's .message.
     */
    async buddies() {
      return buddyCall('Loading buddies', 'buddies');
    },

    async addBuddy(id) {
      return buddyCall('Adding a buddy', 'buddies', { method: 'POST', body: { id: Number(id) } });
    },

    async removeBuddy(id) {
      return buddyCall('Removing a buddy', `buddies/${Number(id)}`, { method: 'DELETE' });
    },

    async ignorePlayer(id) {
      return buddyCall('Blocking', 'buddies/ignores', { method: 'POST', body: { id: Number(id) } });
    },

    async unignorePlayer(id) {
      return buddyCall('Un-blocking', `buddies/ignores/${Number(id)}`, { method: 'DELETE' });
    },

    /**
     * Groups (register G326, groddle-afternoon-site/src/Groups.php): groups()
     * and every change answer the caller's { max, count, groups, invites,
     * channels: { global, help, trade, silenced }, watch: { token,
     * expiresIn } }, the token being what the realtime server lets the
     * socket open group chat and the channels with (groups_watch).
     * searchGroups answers { q, groups } (public ones), group(id) one group
     * with its people. A refusal throws with .status, .code and the site's
     * .message (and .data.fields for a create).
     */
    async groups() {
      return buddyCall('Loading groups', 'groups');
    },

    async searchGroups(q = '') {
      return buddyCall('Finding groups', `groups/search?q=${encodeURIComponent(String(q).slice(0, 32))}`);
    },

    async group(id) {
      return buddyCall('Loading the group', `groups/${Number(id)}`);
    },

    async createGroup({ name, description = '', mode = 'public' }) {
      return buddyCall('Making a group', 'groups', { method: 'POST', body: { name: String(name ?? ''), description: String(description ?? ''), mode: String(mode) } });
    },

    async joinGroup(id) {
      return buddyCall('Joining the group', `groups/${Number(id)}/members`, { method: 'POST' });
    },

    async leaveGroup(id) {
      return buddyCall('Leaving the group', `groups/${Number(id)}/members`, { method: 'DELETE' });
    },

    async inviteToGroup(id, playerId) {
      return buddyCall('Inviting', `groups/${Number(id)}/invites`, { method: 'POST', body: { id: Number(playerId) } });
    },

    async declineGroupInvite(id) {
      return buddyCall('Declining', `groups/${Number(id)}/invites`, { method: 'DELETE' });
    },

    /**
     * The player's profile (register G338, groddle-afternoon-site/src/Profiles.php):
     * { id, name, url, about, aboutMax, avatar: { key, at, url } | null,
     * home: { key, at, url } | null }. Each write answers the same. Pictures
     * are base64 PNGs (the site checks and re-encodes them). A refusal
     * throws with .status, .code and the site's .message.
     */
    async profile() {
      return buddyCall('Loading your profile', 'profile');
    },

    async saveAbout(about) {
      return buddyCall('Saving your profile', 'profile', { method: 'PUT', body: { about: String(about ?? '') } });
    },

    async uploadAvatar({ key, avatar, tile }) {
      return buddyCall('Saving your avatar picture', 'profile/avatar', { method: 'PUT', body: { key, avatar, tile } });
    },

    async uploadHome({ key, home }) {
      return buddyCall('Saving your home picture', 'profile/home', { method: 'PUT', body: { key, home } });
    },

    /**
     * Homes and house keys (register G328, groddle-afternoon-site/src/Neighbours.php).
     * home(id) and visitRandom() answer { owner: { id, name }, home: { owned,
     * style }, homes: <the owner's homes slice>, key, pass: { token,
     * expiresIn } } (the pass the realtime server lets you onto their home
     * with); visitors() / optInVisitors() / optOutVisitors() answer { allow,
     * can: { ok, error, reason } } (and the source's text on a change);
     * houseKeys() and each key change answer { given, received: [{ id, name,
     * at }], houseLimit, playerLimit, hasHouse }, a change also `told` (the
     * proof the realtime server tells the holder with). A refusal throws
     * with .status, .code and the site's .message.
     */
    async home(id) {
      return buddyCall('Finding their home', `homes/${Number(id)}`);
    },

    async visitRandom() {
      return buddyCall('Finding a home', 'homes/random', { method: 'POST' });
    },

    async visitors() {
      return buddyCall('Loading your visitors', 'homes/visitors');
    },

    async optInVisitors() {
      return buddyCall('Opting in', 'homes/visitors', { method: 'POST' });
    },

    async optOutVisitors() {
      return buddyCall('Opting out', 'homes/visitors', { method: 'DELETE' });
    },

    async houseKeys() {
      return buddyCall('Loading your keys', 'keys');
    },

    async giveKey(id) {
      return buddyCall('Giving a key', 'keys', { method: 'POST', body: { id: Number(id) } });
    },

    async revokeKey(id) {
      return buddyCall('Revoking the key', `keys/${Number(id)}`, { method: 'DELETE' });
    },

    /**
     * G328 slice 2 (groddle-afternoon-site src/ButlerParcels.php,
     * src/HomeTending.php): butlerParcels() answers { parcels: [{ id, from:
     * { id, name }, item: { c, n } | null, text, at }] } the owner's Butler
     * holds; takeParcel(id) { status: taken | done, id, credit, item };
     * tend(owner, acts) { acts: [{ ok, id | text, plot }], tell }; tending()
     * { acts } a key-holder did that the owner's save has not applied.
     */
    async butlerParcels() {
      return buddyCall('Asking your Butler', 'butler');
    },

    async takeParcel(id) {
      return buddyCall('Taking the package', `butler/${encodeURIComponent(String(id))}/take`, { method: 'POST' });
    },

    async tend(owner, acts) {
      return buddyCall('Tending', `homes/${Number(owner)}/tend`, { method: 'POST', body: { acts } });
    },

    async tending() {
      return buddyCall('Checking your gardens', 'homes/tending');
    },

    /**
     * Transcendental Radiation (register G330, groddle-afternoon-site/src/Radiance.php):
     * { rank, cards, watch: { token, expiresIn } }, the skill and cards the save holds,
     * signed for the realtime server (radiance_watch).
     */
    async radiance() {
      return buddyCall('Checking your radiance', 'radiance');
    },

    /**
     * Gifts between players (register G332, groddle-afternoon-site/src/LedgerGift.php):
     * { gifts: [{ op, side: gave|got, with: { id, name }, items, box, note, ref?, at }] },
     * the gives the site settled that this save has not applied yet.
     */
    async gifts() {
      return buddyCall('Checking your gifts', 'gifts');
    },

    /**
     * Stacks dropped for everyone (register G332, groddle-afternoon-site/src/LedgerDrop.php):
     * { drops: [{ op, side: dropped|took, id, item: { c, n, r? }, why? }] }, the drops and
     * pickups the site settled that this save has not applied yet.
     */
    async drops() {
      return buddyCall('Checking your drops', 'drops');
    },

    /**
     * The Auction House (register G333, groddle-afternoon-site/src/LedgerAuction.php).
     * auctions({ q, cat, c, seller, sort, page }) { auctions, total, page, per, cats, rules };
     * myAuctions() { active, ended, deliveries, receipts, listable, rules, now };
     * listAuction({ id, c, n, cost, r? }) { status: listed, auction, receipt };
     * buyAuction(id) { status: bought, auction, receipt, delivery };
     * cancelAuction(id) { status: cancelled, auction, delivery };
     * collectAuction(id) { status: collected | done, receipt, delivery }.
     * A refusal throws with the site's { status: refused, why, text } as err.data.
     */
    async auctions(params = {}) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
      const query = q.toString();
      return buddyCall('Browsing the auctions', `auctions${query ? `?${query}` : ''}`);
    },

    async myAuctions() {
      return buddyCall('Checking your auctions', 'auctions/mine');
    },

    async listAuction(listing) {
      return buddyCall('Posting the auction', 'auctions', { method: 'POST', body: listing });
    },

    async buyAuction(id) {
      return buddyCall('Buying', `auctions/${encodeURIComponent(String(id))}/buy`, { method: 'POST' });
    },

    async cancelAuction(id) {
      return buddyCall('Cancelling the auction', `auctions/${encodeURIComponent(String(id))}/cancel`, { method: 'POST' });
    },

    async collectAuction(id) {
      return buddyCall('Collecting the delivery', `auctions/${encodeURIComponent(String(id))}/collect`, { method: 'POST' });
    },

    async deleteBackup(slot) {
      const r = await call(`backups/${Number(slot)}`, { method: 'DELETE' });
      if (!r.ok) throw failed('Deleting the backup', r);
      return r.data;
    },
  };
}
