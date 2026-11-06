/**
 * The player's account on the Groddle site: every call the game makes. js/minn-account-core.js has
 * the sign-in, the save and what the phone companion reads; the calls below are the game's alone
 * and start from it, so the phone (tests/phone-companion.test.js, 240 KB) never loads them.
 * createMinnAccount() answers one object with both.
 */
import { accountParts, minnUrls } from './minn-account-core.js?v=e15cf456';

export { minnUrls };

/**
 * @param {{ baseUri: string, fetch?: typeof fetch, nonce?: string }} opts
 *   nonce: a REST nonce already in hand (the multiplayer boot data), so the
 *   first call needs no admin-ajax round trip.
 */
export function createMinnAccount(opts = {}) {
  const { account, call, failed, buddyCall, refreshNonce } = accountParts(opts);

  // Assigned onto the account, not spread: its nonce is a live getter.
  return Object.assign(account, {
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
    // buddies() is in js/minn-account-core.js: the phone reads it.

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

    /** The home street as a layout (js/home-layout.js), drawn on the profile as a diorama. */
    async uploadHomeLayout({ key, layout }) {
      return buddyCall('Saving your home street', 'profile/home-layout', { method: 'PUT', body: { key, layout } });
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

    // Ticket 112: the Butler's gift stock and visits on the site (src/ButlerGifts.php).
    async butlerStock() {
      return buddyCall('Asking your Butler', 'butler/stock');
    },

    async butlerGive({ op, c, n, keep }) {
      return buddyCall('Giving the Butler a gift', 'butler/stock', { method: 'POST', body: { op: String(op), c: String(c), n: Math.floor(Number(n) || 0), keep: keep === true } });
    },

    async butlerAdopt() {
      return buddyCall('Asking your Butler', 'butler/stock/adopt', { method: 'POST' });
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
     * Notice Boards shared online (groddle-afternoon-site/src/LedgerBoard.php):
     * { boards: [{ op, side: pinned|took, id, note: { id, title, body, author, remake, at } }] },
     * the pins and takes the site settled that this save has not applied yet.
     */
    async boards() {
      return buddyCall('Checking your notice board notes', 'boards/mine');
    },

    /**
     * A chat's lines before a line (groddle-afternoon-site src/ChatHistory.php): key global, help,
     * trade or group-<id>; { lines: [{ lid, id, name, text, at, web, r }] newest first, more }.
     */
    async chatEarlier(key, before, limit = 50) {
      return buddyCall('Loading earlier messages', `chat/channels/${encodeURIComponent(key)}?before=${Math.max(0, Math.floor(Number(before)) || 0)}&limit=${limit}`);
    },

    /** An IM conversation's lines before a time (ms): { lines: [{ id, from, text, at, r }] newest first, more, blocked }. */
    async imEarlier(withId, beforeAt, limit = 50) {
      return buddyCall('Loading earlier messages', `chat/ims/${Math.floor(Number(withId)) || 0}?before_at=${Math.max(0, Math.floor(Number(beforeAt)) || 0)}&limit=${limit}`);
    },

    /**
     * A channel line's thread as the site keeps it (ChatHistory, every reply): key global, help, trade or
     * group-<id>; { parent: Line|null, lines: [{ lid, id, name, text, at, web, r }] oldest first, now }.
     */
    async chatThread(key, lid) {
      return buddyCall('Loading the replies', `chat/channels/${encodeURIComponent(key)}/threads/${Math.max(0, Math.floor(Number(lid)) || 0)}`);
    },

    /** An IM line's thread (the two players only): { lines: [{ id, from, text, at, r, parent }] oldest first, blocked }. */
    async imThread(withId, lineId) {
      return buddyCall('Loading the replies', `chat/ims/${Math.floor(Number(withId)) || 0}/threads/${Math.max(0, Math.floor(Number(lineId)) || 0)}`);
    },

    /**
     * The Community boards' notices the game's Activity has not shown (groddle-afternoon-site
     * src/Community.php, POST community/notices/game): { notices: [{ id, kind, count, from, thread, url, at, text }] };
     * each comes once.
     */
    async communityNotices() {
      return buddyCall('Checking the Community boards', 'community/notices/game', { method: 'POST' });
    },

    /** Report a note on a notice board: { status: reported|already, ticket? }; a refusal throws with the site's words. */
    async reportBoardNote(id, why = '') {
      return buddyCall('Reporting that note', `boards/notes/${encodeURIComponent(id)}/report`, { method: 'POST', body: { why } });
    },

    /**
     * A bug report from the game's header (groddle-afternoon-site src/BugReports.php):
     * { status: sent, id }. A refusal (an empty message, too many just now) throws with the site's words.
     */
    async reportBug(message, context = {}) {
      return buddyCall('Sending your bug report', 'feedback', { method: 'POST', body: { message, context } });
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

    /**
     * Mail between players (register G478, groddle-afternoon-site/src/LedgerMail.php).
     * playerMail() { letters, sent, next, receipts, rules, now };
     * sendMail({ id, to, text, item: { c, n, r? } | null, currants, reply }) { status: sent, letter, receipt, tell };
     * collectMail(id) { status: collected | done, receipt, letter }.
     * A refusal throws with the site's { status: refused, why, text } as err.data.
     */
    // playerMail() is in js/minn-account-core.js: the phone reads it.

    async sendMail(letter) {
      return buddyCall('Sending your letter', 'mail', { method: 'POST', body: letter });
    },

    async collectMail(id) {
      return buddyCall('Collecting your mail', `mail/${encodeURIComponent(String(id))}/collect`, { method: 'POST' });
    },

    /**
     * Starter bags for a character made before bags (G152, groddle-afternoon-site
     * src/LedgerStarter.php): { status: granted, trade, got, text, again? } |
     * { status: none } | { status: refused, why: new | nosave, text }. Once per
     * character: asking again answers as the site decided.
     */
    async starterBags() {
      return buddyCall('Checking for starter bags', 'ledger/starter-bags', { method: 'POST' });
    },

    async deleteBackup(slot) {
      const r = await call(`backups/${Number(slot)}`, { method: 'DELETE' });
      if (!r.ok) throw failed('Deleting the backup', r);
      return r.data;
    },

    /**
     * Snaps (G332, groddle-afternoon-site src/Snaps.php): snaps() your album
     * { snaps, max, captionMax }; saveSnap({ image, caption, street, x, y })
     * { snap, ...album }; deleteSnap(id); randomSnap(exclude) the Camera's
     * { snap: { id, url, street, x, y, caption, owner: { id, name } } | null }.
     */
    async snaps() {
      return buddyCall('Loading your snaps', 'snaps');
    },

    async saveSnap(snap) {
      return buddyCall('Saving the snap', 'snaps', { method: 'POST', body: snap });
    },

    async deleteSnap(id) {
      return buddyCall('Deleting the snap', `snaps/${Number(id)}`, { method: 'DELETE' });
    },

    async randomSnap(exclude = '') {
      const q = exclude ? `?exclude=${encodeURIComponent(String(exclude))}` : '';
      return buddyCall('Finding a snap', `snaps/random${q}`);
    },
  });
}
