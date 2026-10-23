/**
 * Levels Tiny Speck's own level designers recorded, each with a link that
 * opens the remake's rebuild directly. tools/build-restoration.mjs copies this
 * list (plus screenshot paths) into data.json for the "Play the designers'
 * levels" section of /restoration/.
 *
 * Designers: Ian Passmore uploaded his run-throughs in 2015 ("a level I
 * designed for the MMORPG, Glitch"); LT_IndieGameDev is Lisa Trac, a Tiny
 * Speck level designer and scripter (her portfolio lists Glitch). Ids and
 * notes: research/video/README.md. The recordings are reference only.
 *
 * Links open a practice copy (?practice=1, public/js/practice-mode.js) that
 * never touches the player's saved game. If the game ever gets a shared
 * multiplayer world, these direct links stay solo-only and never count toward
 * shared play.
 *
 * shot: a key in tools/restoration/shots.mjs (room:<id> or level:<id>).
 */
const BASE = '?autostart=1&fresh=1&resetgame=1&questoffer=off&';

export const DESIGNERS = Object.freeze([
  { id: 'passmore', name: 'Ian Passmore', about: 'Level designer at Tiny Speck. Uploaded his own run-throughs in 2015.' },
  { id: 'trac', name: 'Lisa Trac', about: 'Level designer and scripter at Tiny Speck. Posted as LT_IndieGameDev on YouTube in 2012.' },
]);

const level = (id, designer, title, kind, query, video, shot, note = '', extra = null) =>
  Object.freeze({ id, designer, title, kind, route: `${BASE}${query}`, video, shot, note, extra });

export const DESIGNER_LEVELS = Object.freeze([
  // Ian Passmore
  level('radial_heights', 'passmore', 'Radial Heights', 'Ticket to Paradise', 'paradise=radial_heights', 'QMVkLBBeymA', 'level:radial_heights',
    'He also recorded the easter egg he hid in it.', { video: 'Y_rABBmdAqc', label: 'Watch the easter egg' }),
  level('arbor_hollow', 'passmore', 'Arbor Hollow', 'Ticket to Paradise', 'paradise=arbor_hollow', 'ELtkACMJkNU', 'level:arbor_hollow'),
  level('abysmal_thrill', 'passmore', 'Abysmal Thrill', 'Ticket to Paradise', 'paradise=abysmal_thrill', '9ZnoxQLVNsc', 'level:abysmal_thrill'),
  level('le_miserable', 'passmore', 'Le Misérable', 'Quest room', 'questdemo=le_miserable', 'qzj6oHxwrcw', 'room:le_miserable'),
  level('join_club', 'passmore', 'Join the Club', 'Quest room', 'questdemo=join_club', 'q6VVOR5PVns', 'room:clubhouse'),
  level('esquibeth', 'passmore', 'The Last Pilgrimage of Esquibeth', 'Quest room', 'questdemo=last_pilgrimage_of_esquibeth', 'BgRgIaeaj9Q', 'room:esquibeth'),
  level('orangian', 'passmore', 'Orangian', 'Puzzle street', 'puzzledemo=GHVCKEPHO403BN5', 'pRFUG9YxpQ0', 'level:orangian'),
  level('blooian', 'passmore', 'Blooian', 'Puzzle street', 'puzzledemo=GHVP8TCLT40336S', 'aPs9HUHwtMg', 'level:blooian'),
  // Lisa Trac
  level('aerial_boost', 'trac', 'Aerial Boost', 'Ticket to Paradise', 'paradise=aerial_boost', 'SlXjnIYvqtc', 'level:aerial_boost',
    'Known only from her recording.'),
  level('mountain_scaling', 'trac', 'Mountain Scaling', 'Ticket to Paradise', 'paradise=mountain_scaling', 'qjZT5cPUcnM', 'level:mountain_scaling'),
  level('starlit_night', 'trac', 'Starlit Night', 'Ticket to Paradise', 'paradise=starlit_night', 'SrwP--bBO0s', 'level:starlit_night'),
  level('slip_n_slide', 'trac', 'Slip ’N Slide', 'Ticket to Paradise', 'paradise=slip_n_slide', 'KKo6VHicdA4', 'level:slip_n_slide'),
  level('beam_me_down', 'trac', 'Beam Me Down', 'Ticket to Paradise', 'scenedemo=beam_me_down', 'JyE3RpWp9nc', 'level:beam_me_down'),
  level('constellation', 'trac', 'Constellation', 'Bonus level', 'scenedemo=constellation', '-iW1b8ix3W8', 'level:constellation'),
  level('winter_walk', 'trac', 'Winter Walk', 'Story quest', 'questdemo=winter', 'WlAMZpSGPgQ', 'level:winter_walk'),
  level('greedy', 'trac', 'The Greedy Street Spirit', 'Story quest', 'questdemo=greedy', 'hn9J_fDveXI', 'level:greedy'),
  level('radiant_glare', 'trac', 'Radiant Glare', 'Quest room', 'questdemo=radiant_glare', 'ZQQydNM9THI', 'room:radiant_glare'),
  level('picto_pattern', 'trac', 'Picto-Pattern', 'Quest room', 'questdemo=picto_pattern', 'UryaMaICZFg', 'room:picto_pattern'),
  level('mental_block', 'trac', 'Mental Block', 'Quest room', 'questdemo=mental_block', 'mgsdduCR_Gc', 'room:mental_block'),
  level('color_unblocking', 'trac', 'Color Unblocking', 'Quest room', 'questdemo=puzzle_level_color_blockage', 'b_oNR5Qzf_I', 'room:color_unblocking'),
  level('light_perspective', 'trac', 'Walk Toward the Light', 'Quest room', 'questdemo=puzzle_level_light_perspective', 'Et0RkY43A5Q', 'room:light_perspective'),
  level('griinolyza', 'trac', 'Griinolyza', 'Puzzle street', 'puzzledemo=GHVOD0F3T403694', 'VxAyiFj2gVU', 'level:griinolyza'),
  level('purplysa', 'trac', 'Purplysa', 'Puzzle street', 'puzzledemo=GHVP7QOKT403F5Q', '2j0v9FgQPig', 'level:purplysa'),
  level('amberlyza', 'trac', 'Amberlyza', 'Puzzle street', 'puzzledemo=GHVDKQ2O6S23LVJ', 'YvRCmwdipuo', 'level:amberlyza'),
]);

/** Courses with no designer footage, rebuilt from text (shown after the designers). */
export const TEXT_LEVELS = Object.freeze([
  level('sky_plunge', null, 'Sky Plunge', 'Ticket to Paradise', 'paradise=sky_plunge', null, 'level:sky_plunge',
    'Rebuilt from the upgrade card and players’ forum posts; no recording is known.'),
  level('updraft', null, 'Updraft', 'Ticket to Paradise', 'paradise=updraft', null, 'level:updraft',
    'Tiny Speck built this course, but it may never have reached players.'),
  level('drafty_uplift', null, 'Drafty Uplift', 'Ticket to Paradise', 'paradise=drafty_uplift', null, 'level:drafty_uplift',
    'Tiny Speck built this course, but it may never have reached players.'),
]);
