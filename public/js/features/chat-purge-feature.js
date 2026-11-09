/**
 * Taking a moderator's purge out of the Social drawer (rules in js/chat-purge.js; the site's half is
 * groddle-afternoon-site src/Moderation.php, the server's groddle-afternoon-server moderation.go).
 * Multiplayer only: in solo this feature does nothing, draws nothing and saves nothing.
 *
 * chat_purged: every line the player said since then leaves the drawer (every conversation and
 * thread); groups-feature's channels and player-im-feature's conversations drop them with their own
 * handlers. Nothing here reports an IM or reads one (Austin 2026-11-09: IM reports were scrapped).
 *
 * QA: canvas data modPurged (player:since:n).
 */

import { purgeOf, purged } from '../chat-purge.js?v=6c41f62d';

export const CHAT_PURGE_FEATURE_ID = 'chat-purge';

let session = null;

function createSession(engine, client) {
  const social = engine.social;
  const me = () => Number(client.me?.id) || 0;
  client.on('msg:chat_purged', (msg) => {
    const p = purgeOf(msg);
    if (!p) return;
    const opts = { ...p, me: me() };
    const n = social?.purge?.((l) => purged(l, opts)) || 0;
    engine.setData?.('modPurged', `${p.player}:${p.since}:${n}`);
  });
  return {};
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client || !engine.social) return null;
  session = createSession(engine, client);
  return session;
}

export const chatPurgeFeature = {
  id: CHAT_PURGE_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started || session) return;
    ensure(engine);
  },
};
