/**
 * Player slash commands in Local chat (register row G160): pure rules, no DOM.
 *
 * Source: glitch-GameServerJS main.js doLocalChat (:1697-1706) sends every
 * line that starts with "/" to doChatCommand (:1842), which splits it on
 * spaces and checks words[0] in this order:
 *   /makegod  (:1850-1858) "Don't go getting delusions of grandeur on us now..."
 *   /who      (:1859-1863) location.js get_roster_msg (:4095-4112)
 *   /xyzzy    (:1865-1871) gods only start the Rainbow Run; everyone else "Nothing happens"
 *   /home, /house (:1873-1884) inc_houses.js houses_go_to_new_house (:807-918),
 *             /house with go_inside; errors go to the activity log
 *   /tower    (:1885-1895) houses_go_to_tower (:920-931)
 *   /leave    (:1896-1905) houses_leave (:1290-1307)
 *   /butler   (:1906-1912) the Butler IMs a normalClickResponseList line
 *             plus clickHelpAddition (butler_strings.js has no clickHelpAddition,
 *             so getTextString returns "" for it, butler_data.js:15-19)
 *   /beans    (:1913-1916) a Plate of Beans: features/small-items-feature.js
 * then (:1928-1934) anyone who is not a god, a helper or a guide on duty gets
 * "Unknown command: " + the line (utils.filter_chat escapes it for the Flash
 * chat; the remake's activity log and toast show plain text). The helper tier
 * (/max, /half, /buffless, /link), the dev-only /gentle_island_exit and the
 * god-only commands are left out: a solo player is never staff, so they get
 * the same "Unknown command" a regular player got.
 *
 * Remake mapping: Home is the Home panel's travel (game.js teleportHome /
 * switchHomeRoom / returnFromHome, exposed as engine.homeTravel); the Tower is
 * features/home-tower-feature.js towerApi; the Butler is
 * features/butler-feature.js butlerApi. The source built a home on the spot
 * (inc_houses.js houses_go_to_new_house 807-914); the remake's home comes from
 * the free Home Street Ticket (js/home-ticket.js), so /home and /house without
 * one open the Home panel (teleportHome's own answer), where the Magic Rock
 * hands over the ticket and the Selection Machine takes it.
 *
 * /stuck is the remake's own (Austin 2026-11-01; the source had no such
 * command: a stuck player asked a guide, whose /link and god teleports are
 * staff-only above). It puts you back where you arrived on the street you
 * are on (the signpost or door you came through, else the street's own
 * arrival), or at the door at home. Once every 5 minutes; not in a race, a
 * timed quest room or a Paradise course (they have Leave), not while dead
 * (Hell's grapes are the way out, items/bunch_of_grapes_hell.js), not in the
 * middle of something. It never moves you anywhere you had not already been
 * on that street, so it skips nothing the street gates.
 */

/** main.js doChatCommand, inc_houses.js and location.js lines, verbatim. */
export const SLASH_TEXT = Object.freeze({
  /** main.js:1855. */
  makegod: "Don't go getting delusions of grandeur on us now. We need you to keep a level head!",
  /** main.js:1870. */
  xyzzy: 'Nothing happens',
  /** location.js:4106, :4108, :4111. */
  whoNobody: 'You are the only person here.',
  whoOne: '$name is here',
  whoMany: '$names are here',
  /** inc_houses.js:921. */
  noTower: "You don't have a tower!",
  /** inc_houses.js:903, :923 (the player is in a skill quest instance). */
  finishQuest: "Just finish the quest first! It's easy!",
  /** inc_houses.js:1039. */
  dead: 'You are dead.',
  /** inc_houses.js:1041. */
  busy: "You need to finish up what you're working on first.",
  /** inc_houses.js:1291. */
  leaveNotHome: 'To leave, you must first go /home',
  /** main.js:1931 (and :1970). */
  unknown: 'Unknown command: ',
});

/** /stuck's words (the remake's own, no source line). */
export const STUCK_TEXT = Object.freeze({
  done: "You're back where you arrived on this street.",
  doneHome: "You're back at the door.",
  leave: "/stuck doesn't work here. Use Leave to get out.",
  dead: "You are dead. Squish Hellish Grapes to get out of Naraka.",
  /** The cooldown's time left, in whole minutes (seconds under one). */
  wait: (ms) => {
    const s = Math.max(1, Math.ceil(ms / 1000));
    if (s < 60) return `You can use /stuck again in ${s} ${s === 1 ? 'second' : 'seconds'}.`;
    const m = Math.ceil(s / 60);
    return `You can use /stuck again in ${m} ${m === 1 ? 'minute' : 'minutes'}.`;
  },
});

/** /stuck once every 5 minutes (Austin 2026-11-01). */
export const STUCK_COOLDOWN_MS = 5 * 60 * 1000;

/** The remake's own commands, with what they do: the slash-command help. */
export const REMAKE_COMMANDS = Object.freeze({
  '/stuck': 'Back to where you arrived on this street (or your door at home), once every 5 minutes.',
});

/** The commands a regular player could use (main.js:1850-1916), in source order. */
export const PLAYER_COMMANDS = Object.freeze(['/makegod', '/who', '/xyzzy', '/home', '/house', '/tower', '/leave', '/butler', '/beans']);

/** Left out, with why: they answer "Unknown command" for a solo player, as for any regular player. */
export const STAFF_COMMANDS = Object.freeze({
  '/gentle_island_exit': 'main.js:1918-1923: config.is_dev only (a dev teleport off Gentle Island)',
  '/max': 'main.js:1941-1946: gods, helpers and guides on duty (fills energy and mood)',
  '/half': 'main.js:1947-1952: gods, helpers and guides on duty (halves energy and mood)',
  '/buffless': 'main.js:1953-1956: gods, helpers and guides on duty (removes every buff)',
  '/link': 'main.js:1957-1961: gods, helpers and guides on duty (a jump.php link to this spot)',
  god: 'main.js:1974-2910: 88 god-only admin commands (/create item, /kill stack, /newday, ...)',
});

/**
 * CMDHELP (Austin 2026-11-03): the chat command list players see, on the hold-? sheet
 * (js/client-hotkeys.js) and in chat for "/" or "/help" on its own (features/slash-commands-feature.js).
 * The source had no list and no /help (main.js doChatCommand 1842-1934 has neither): both are ours.
 * One plain line each, in the words of what the command does here (slashPlan above), solo and online.
 */
export const COMMAND_HELP = Object.freeze([
  Object.freeze(['/home', 'Go to your home street']),
  Object.freeze(['/house', 'Go inside your house']),
  Object.freeze(['/tower', 'Go to your tower, once it is built']),
  Object.freeze(['/leave', 'Leave your home and go back to where you were in Ur']),
  Object.freeze(['/stuck', 'Go back to where you arrived on this street (once every 5 minutes)']),
  Object.freeze(['/who', 'See who is here with you']),
  Object.freeze(['/butler', 'Talk to your Butler, if you have one']),
]);

/** Player commands the list leaves out, with why (they still work when typed). */
export const COMMAND_HELP_LEFT_OUT = Object.freeze({
  '/makegod': "a joke: it only answers main.js:1855's line and does nothing",
  '/xyzzy': 'an easter egg: "Nothing happens" for a player (main.js:1865-1871; gods start the Rainbow Run)',
  '/beans': 'an easter egg: a free Plate of Beans every time (main.js:1913-1916)',
});

/** The list's first line: where commands go. */
export const COMMAND_HELP_INTRO = 'Chat commands go at the start of a message:';

/** What shows the list in chat: "/" on its own, "/help" or "/?". */
export function isCommandHelp(text) {
  const t = String(text || '').trim().toLowerCase();
  return t === '/' || t === '/help' || t === '/?';
}

/** The list as chat lines: the intro, then "/home  Go to your home street" and so on. */
export function commandHelpLines() {
  return [COMMAND_HELP_INTRO, ...COMMAND_HELP.map(([cmd, what]) => `${cmd}  ${what}`)];
}

/** The hint under a message that ends with a known command ("aaaa/leave" went out as chat). */
export const commandHint = (cmd) => `Commands go at the start of a message: ${cmd}`;

/**
 * The listed command a chat line ends with when it does not start with it, or ''.
 * "aaaa/leave" and "how do I /home" answer it; "/leave" (a command), "and/or" and
 * a link (".../home" after "://") do not.
 */
export function misplacedCommand(text) {
  const t = String(text || '').trim();
  if (!t || t.startsWith('/') || t.includes('://')) return '';
  const m = /(\/[a-z]+)[.!?]*$/.exec(t);
  return m && COMMAND_HELP.some(([cmd]) => cmd === m[1]) ? m[1] : '';
}

/** main.js:1844: words = txt.split(" "). */
export function slashWords(text) {
  return String(text || '').trim().split(' ');
}

/** common.js pretty_list(list, joiner). */
export function prettyList(list, joiner) {
  const items = [...list];
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  const last = items.pop();
  return `${items.join(', ')}${joiner}${last}`;
}

/** location.js get_roster_msg: the active players here, the speaker among them. */
export function rosterLine(names = []) {
  const list = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (list.length === 1) return SLASH_TEXT.whoOne.replace('$name', list[0]);
  if (list.length > 1) return SLASH_TEXT.whoMany.replace('$names', prettyList(list, ' and '));
  return SLASH_TEXT.whoNobody;
}

/** main.js:1931: what a regular player sees for any other slash line. */
export function unknownLine(text) {
  return `${SLASH_TEXT.unknown}${String(text || '').trim()}`;
}

/** inc_houses.js houses_teleport_to (:1037-1061) checks, before any home travel. */
function travelBlock(ctx) {
  if (ctx.instance) return SLASH_TEXT.finishQuest;
  if (ctx.dead) return SLASH_TEXT.dead;
  if (ctx.busy) return SLASH_TEXT.busy;
  return '';
}

/**
 * What one slash line does. `ctx` is the remake's state:
 *   { who: string[], home: { owned, inHome, room }, onTowerFloor, towerBuilt,
 *     dead, busy, instance, butlerOwned }
 * ctx.stuckWaitMs: what is left of /stuck's cooldown (0 when it is ready).
 * Returns null for a line this module does not answer (/beans and unknown
 * lines), else one of
 *   { command, say }                 a line for the activity log (sendActivity)
 *   { command, travel: [...steps] }  steps: 'teleport' | 'teleport-inside' |
 *                                    'inside' | 'outside' | 'return' |
 *                                    'house-from-tower' | 'tower'
 *   { command, butler: true }        the Butler IMs you
 *   { command, stuck: 'arrival' | 'home-door' | 'tower-door' }  /stuck's move
 *   { command, silent: true }        the source returns without a word
 */
export function slashPlan(text, ctx = {}) {
  const command = slashWords(text)[0];
  const home = ctx.home || {};
  switch (command) {
    case '/makegod':
      return { command, say: SLASH_TEXT.makegod };
    case '/who':
      return { command, say: rosterLine(ctx.who) };
    case '/xyzzy':
      return { command, say: SLASH_TEXT.xyzzy };
    case '/home':
    case '/house': {
      const inside = command === '/house';
      if (!home.owned) return { command, travel: ['teleport'] };
      const block = travelBlock(ctx);
      if (block) return { command, say: block };
      if (!home.inHome) return { command, travel: [inside ? 'teleport-inside' : 'teleport'] };
      // At home already: the source teleports to the landing spot again; the remake moves between rooms.
      if (inside) {
        if (ctx.onTowerFloor) return { command, travel: ['house-from-tower'] };
        return home.room === 'interior' ? { command, silent: true } : { command, travel: ['inside'] };
      }
      return home.room === 'interior' ? { command, travel: ['outside'] } : { command, silent: true };
    }
    case '/tower': {
      if (!ctx.towerBuilt) return { command, say: SLASH_TEXT.noTower };
      const block = travelBlock(ctx);
      if (block) return { command, say: block };
      return { command, travel: home.inHome ? ['tower'] : ['teleport', 'tower'] };
    }
    case '/leave':
      if (!home.inHome) return { command, say: SLASH_TEXT.leaveNotHome };
      return { command, travel: ['return'] };
    case '/butler':
      return ctx.butlerOwned ? { command, butler: true } : { command, silent: true };
    case '/stuck': {
      if (ctx.instance) return { command, say: STUCK_TEXT.leave };
      if (ctx.dead) return { command, say: STUCK_TEXT.dead };
      if (ctx.busy) return { command, say: SLASH_TEXT.busy };
      if (ctx.stuckWaitMs > 0) return { command, say: STUCK_TEXT.wait(ctx.stuckWaitMs) };
      if (home.inHome) return { command, stuck: ctx.onTowerFloor ? 'tower-door' : 'home-door' };
      return { command, stuck: 'arrival' };
    }
    default:
      return null;
  }
}
