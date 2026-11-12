/**
 * Level-ups told to the street online (rules-b, 2026-11-12). GameServerJS players/inc_stats.js 374:
 * everyone else in the location reads "<name> just reached level N!" in their activity log
 * (sendLocationActivity, players/player.js 472-500), except players the leveller ignores. The
 * realtime server (groddle-afternoon-server levels.go) passes {"t":"level_up","level":N} on to
 * the street and leaves out anyone blocked either way; this feature sends your own level-ups (the
 * game's levelling, js/progression.js, raises engine.pc.level) and shows everyone else's.
 *
 * The source's pc_level_up to the players who hold you as a buddy (inc_stats.js 427-434) is not
 * sent: the 2012 client never showed it (NCMsgHandler.as type_to_func[PC_LEVEL_UP] = null).
 *
 * Multiplayer only (engine.mode and engine.query('realtimeClient')).
 */

export const LEVEL_UP_MP_FEATURE_ID = 'level-up-mp';

/** inc_stats.js 374 (the name is the player's own label). */
export function levelUpStreetLine(name, level) {
  return `${name} just reached level ${level}!`;
}

let client = null;
let known = 0;

function ensure(engine) {
  if (client) return client;
  const c = engine.query?.('realtimeClient');
  if (!c) return null;
  client = c;
  client.on('msg:level_up', (msg) => {
    const level = Math.floor(Number(msg?.level) || 0);
    const name = String(msg?.name || '').trim();
    if (!name || level < 2) return;
    if (engine.query?.('realtimeHidden', Number(msg.id) || 0) === true) return;
    engine.pushActivity?.(levelUpStreetLine(name, level));
  });
  return client;
}

export const levelUpMpFeature = {
  id: LEVEL_UP_MP_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine?.mode !== 'multiplayer' || !engine.started) return;
    const c = ensure(engine);
    const level = Math.floor(Number(engine.pc?.level) || 0);
    if (!known) {
      known = level;
      return;
    }
    if (level <= known) return;
    known = level;
    if (c?.state === 'online') c.send('level_up', { level });
  },

  /** Tests. */
  _reset() {
    client = null;
    known = 0;
  },
};
