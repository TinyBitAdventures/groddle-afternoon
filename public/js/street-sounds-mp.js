/**
 * Street sounds online (#715): a note one player plays on a street's own scripts (a Piano Party key or
 * star bumped, a Gaare Grims stone) is heard by everyone there, as in Glitch, where play_sound with
 * all_players went to every active player on the location (GameServerJS locations/inc_events.js
 * 399-404 and events_runSoundAction 531-538), whoever's Collision-triggered Event Box fired it
 * (items/cteb.js onEvent, broadcastLocationEvents).
 *
 *   send  {t:'street_sound', event}                      after this game ran one of the street's shared events
 *   get   {t:'street_sound', street, event, by}          another player's, to run as an echo here
 *
 * The realtime server (groddle-afternoon-server streetsounds.go) relays it to everyone else on the street,
 * once a player per STREET_SOUND_EVERY_MS, and only an event its table (data/street-sounds.json, built
 * from these rules by tools/build-realtime-street-sounds.mjs) lists for that street. The sender already
 * heard its own. Each other game runs the event as an echo (location-events.js runLocationEvent
 * ctx.echo): the all-player sounds and the light that flashes and goes out, never the flags or the
 * puzzle. Pure: location-events-feature sends and plays.
 */

import { sharedSoundEvents, streetOwner } from './location-events.js?v=48938c8f';
import { streetToysFor } from './street-toys.js?v=09630452';

export const STREET_SOUND = 'street_sound';

/** The server's limit per player (streetsounds.go streetSoundEvery), as its toy clicks (streettoys.go). */
export const STREET_SOUND_EVERY_MS = 200;

const sameTsid = (a, b) => Boolean(a) && Boolean(b) && String(a).slice(1) === String(b).slice(1);

/**
 * The events a street shares this way (sorted), or [] for a street another system runs (party
 * spaces, Paradise, A Summer's Day: location-events.js OWNED_STREETS) or a toy street (Lotha Harte's
 * notes go through street-toys-mp, which keeps the street's order on the server).
 */
export function streetSoundsFor(tsid, events) {
  if (!tsid || streetOwner(tsid) || streetToysFor(tsid)) return [];
  return sharedSoundEvents(events);
}

/** The event a street_sound message asks this street to echo ('' when it is not one for `tsid`). */
export function streetSoundEvent(msg, tsid) {
  if (!msg || typeof msg !== 'object' || msg.t !== STREET_SOUND || !sameTsid(msg.street, tsid)) return '';
  const name = typeof msg.event === 'string' ? msg.event : '';
  return /^[A-Za-z0-9_]{1,64}$/.test(name) ? name : '';
}
