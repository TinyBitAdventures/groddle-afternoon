/**
 * Who's here (report #415, register G884; Austin 2026-11-16): the Social drawer's Local tab lists
 * everyone on your street, you first, then the others in the order they came (the street roster
 * the realtime server sends, js/realtime-client.js players), with how many players are online in
 * the game (the server's presence_count, features/presence-mp-feature.js).
 *
 * Glitch: hovering the Local chat pane's title showed "People here (N): You, A and B" ("Just you!"
 * alone), every player on the street counting you (glitch-client view/ui/chat/ChatArea.as getTip
 * 795-801, port/RightSideManager.as localTooltip 1212-1255, from the location's pc_tsid_list), and
 * /who said who was here (GameServerJS main.js 1859-1862, locations/location.js get_roster_msg
 * 4095-4113). The remake shows the same people as a list: each row a name (and its face where the
 * site has one), opening that player's menu. Online only: solo has nobody else.
 *
 * Only what the street already shows: the names over the Glitches walking there. Nobody you
 * block (buddies-feature isIgnoring), as their chat, arrivals and emotes are hidden elsewhere.
 *
 * The online line is ours (Glitch's tip named only the street): the count, a link to the
 * website's /chat/, whose Who's around panel lists everyone online, in a new tab so the game
 * keeps running (#415 follow-up, Austin 2026-11-26). No count (solo, or not yet known), no line.
 */

export const WHOS_HERE_TEXT = Object.freeze({
  button: "Who's here",
  /** The button's tip and the list's name for screen readers. */
  tip: 'Everyone on this street',
  /** RightSideManager.as localTooltip: 'People here (' + total + ')', counting you. */
  head: (n) => `People here (${n})`,
  you: 'You',
  /** RightSideManager.as localTooltip: alone on the street. */
  alone: 'Just you!',
  /** The server's presence_count: the others online in the game (not you, as it counts them). */
  online: (n) => `${n} other ${n === 1 ? 'player' : 'players'} online. See who`,
  /** The website's chat, whose Who's around panel lists everyone online. */
  chatHref: '/chat/',
});

/**
 * PURE: the other players on the street the list shows, in the roster's order: each id once,
 * without you and without anyone `hidden(id)` says you block (one with no id is listed as id 0:
 * nobody to open a menu for).
 */
export function streetOthers(players = [], { meId = 0, hidden = () => false } = {}) {
  const out = [];
  const seen = new Set();
  for (const p of Array.isArray(players) ? players : []) {
    if (!p || typeof p !== 'object') continue;
    const id = Math.max(0, Math.floor(Number(p.id)) || 0);
    if (id && (id === Number(meId) || seen.has(id))) continue;
    let blocked = false;
    try {
      blocked = Boolean(hidden(id));
    } catch {
      blocked = false;
    }
    if (blocked) continue;
    if (id) seen.add(id);
    out.push({ id, name: String(p.name || '').trim() || 'Someone' });
  }
  return out;
}

/**
 * PURE: the list: its head ("People here (N)", you counted), the rows (you first, then the
 * others), the line for being alone, and the online line (with its link) when the count is known.
 */
export function whosHereView({ me = null, players = [], hidden = () => false, online = null } = {}) {
  const meId = Number(me?.id) || 0;
  const others = streetOthers(players, { meId, hidden });
  const rows = [{ id: meId, name: WHOS_HERE_TEXT.you, you: true }, ...others.map((o) => ({ ...o, you: false }))];
  const n = Number(online);
  const known = online !== null && online !== undefined && Number.isFinite(n);
  return {
    head: WHOS_HERE_TEXT.head(rows.length),
    rows,
    alone: others.length ? '' : WHOS_HERE_TEXT.alone,
    online: known ? WHOS_HERE_TEXT.online(Math.max(0, Math.floor(n))) : '',
    onlineHref: known ? WHOS_HERE_TEXT.chatHref : '',
  };
}
