/**
 * "Play it" links for /restoration/: every system, quest room and designer
 * level opens the game straight on it, in practice mode (?practice=1, see
 * public/js/practice-mode.js), so a fan's saved game is never touched.
 *
 * Most links come from the screenshot routes in shots.mjs (each one is
 * captured, so it is known to open). playRoute() turns a capture route into a
 * player route: it drops what only a camera needs (autoplay, preview and hold
 * freezes, skipped intro effects, fixed camera looks, mid-quest stages).
 * PLAY_ROUTES covers systems with no screenshot; NO_PLAY lists ones with
 * nothing to open (lost systems need other players).
 */
import { SHOTS } from './shots.mjs';

const BASE = '?autostart=1&fresh=1&resetgame=1&questoffer=off';

/** Query keys that only make sense for a screenshot. */
const CAMERA_ONLY = /^(?:.*autoplay|.*preview|.*hold|.*fx|cameralook|esqstage|raceassist|racerivalseconds|growx|growstate|growtier|subwayfast)$/;

/** Systems without a screenshot route, by checklist id. */
export const PLAY_ROUTES = Object.freeze({
  dametime: `${BASE}&timedemo=dusk`,
  map: `${BASE}`,
  music: `${BASE}&soundtest=1`,
  avatar: `${BASE}`,
  newxp: '?autostart=1&resetgame=1&questoffer=off&newxp=1',
  secrets: `${BASE}&secretdemo=1`,
  // West of Ilmenskie's cave mouth with Big 'Un Triple Jump: run right, hop onto the slope, the mushroom cap, and Triple Jump off it.
  'hidden-floors': `${BASE}&streetdemo=GIF102FDNU11314&streetx=4800&streety=810&jumpdemo=big`,
  chickens: `${BASE}&animaldemo=chicken&animalrank=7`,
  ecology: `${BASE}&streetdemo=GCR10K3BPJK1U6F`,
  machines: `${BASE}&supplydemo=1`,
  powders: `${BASE}&powderdemo=1`,
  'bureaucratic-halls': `${BASE}&doordemo=GA5I10NJDL52TKD`,
  resources: `${BASE}&resdemo=peat_1`,
  tools: `${BASE}&tooldemo=pick&toolremaining=94`,
  vendors: `${BASE}&vendor=toys`,
  levels: `${BASE}&leveldemo=1`,
  feats: `${BASE}&companiondemo=feat`,
  seasons: `${BASE}&season=zilloween&seasondemo=1`,
  mail: `${BASE}&homedemo=mail`,
  tower: `${BASE}&homedemo=home&towerdemo=built&towerfloors=5`,
  craftybot: `${BASE}&homedemo=home&craftybotdemo=bot`,
  artifacts: `${BASE}&artifactdemo=rocks`,
  'door-drink': `${BASE}&doordrinkdemo=1`,
});

/** Nothing to open: lost systems, and the quest-rooms row (the rooms section links each room). */
export const NO_PLAY = new Set(['auctions', 'chat', 'snaps', 'quest-rooms']);

/** A capture route with the camera-only parameters removed. */
export function playRoute(route) {
  const params = new URLSearchParams(String(route).replace(/^\?/, ''));
  for (const key of [...params.keys()]) {
    if (CAMERA_ONLY.test(key) || params.get(key) === 'hold') params.delete(key);
  }
  return `?${params.toString()}`;
}

/** The page-relative play link for a route: the game at /play/, in practice mode. */
export function playHref(route) {
  const params = new URLSearchParams(String(route).replace(/^\?/, ''));
  params.set('practice', '1');
  return `../play/?${params.toString()}`;
}

/** The play link for a checklist item or a shots.mjs key (room:<id>, level:<id>), or null. */
export function playFor(key) {
  if (NO_PLAY.has(key)) return null;
  if (PLAY_ROUTES[key]) return playHref(PLAY_ROUTES[key]);
  const shot = SHOTS[key];
  return shot ? playHref(playRoute(shot.route)) : null;
}
