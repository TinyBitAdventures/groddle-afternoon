/**
 * The Vine Radio (register G1245, report #661; Austin's rulings 2026-11-24). Ours: Glitch had no
 * jukebox, record player or radio a player could own (glitch-GameServerJS items: none). A home
 * owner earns it from the crabs, stands it on their home street in Cultivate (like the Mail
 * Dispatcher, js/home-street-fixtures.js) and picks the music the street plays, for them and their
 * visitors. Only music the game already ships: the region libraries and the downloads page's theme
 * tracks (assets/content/ambient-music.json) and the musicblocks (js/musicblocks.js). The party's
 * "lively stand-in" set is left out.
 *
 * Pure: no Pixi, no DOM. features/vine-radio-feature.js draws it, runs its menu and the Choose
 * music sheet and asks game.js to play; js/home-cultivation.js keeps its spot and its choice with
 * the home street (cult.radioRx, cult.radioOut, cult.radio), so a visitor reads them from the
 * owner's save.
 *
 * - Getting it: the crabs' quest, Tunes for Crabs (RADIO_QUEST). Each crab hears one tune from you a
 *   game day (npc_crab.js played map, js/crabs.js hasPlayedToday). Austin asked for 10 tunes from the
 *   8 crabs, fewer if crabs sit where players cannot go. On the open world (js/open-roads.js
 *   openWorld from the starter street) 5 of the 8 can be reached: Uplands Verge is a street project
 *   still closed, and the Firozi pair (Ambu Jal, Venkate Kate) lie past closed roads. The goal keeps
 *   the design's pace on the crabs players can reach: 10 tunes for 8 crabs, so 6 for 5
 *   (radioTuneGoal), still more than one game day's worth, as 10 for 8 was.
 * - What unlocks: a region by visiting it (the hubs_visited counter, js/exploration.js); a theme track
 *   by hearing it where the game plays it, and the ones the game never plays come with the radio;
 *   musicblocks by owning them, played as a medley of the owned tunes, each once with a short gap.
 * - Street only: it plays on its owner's home street; the house and the Tower floors keep the home's
 *   own music (js/homes.js homeMusicFile).
 * - Louder near it: on the home street its music fades up as you walk towards it and down as you walk
 *   away (radioNearLevel), never below RADIO_FALLOFF.floor. It is street music on the Music channel,
 *   so each player's Music slider and Mute apply; it has no volume of its own.
 */

export const RADIO_CLASS = 'vine_radio';
export const RADIO_FEATURE_ID = 'vine-radio';
export const RADIO_PANEL_ID = 'vine-radio-panel';
/** The vine radio decoration (Tiny Speck, CC0, glitch-locations Ix set): 160 x 208, its feet at the bottom middle. */
export const RADIO_ART = Object.freeze({ url: 'assets/decos/groddle/vine_radio.webp', w: 160, h: 208, scale: 0.6 });
/** Drawn half width and height on the street (about the Mailbox's width), for Cultivate's hit box and pad. */
export const RADIO_HALF = 44;
export const RADIO_TALL = 125;

/** The cultivation state keys (js/home-cultivation.js): its spot, whether it stands out, and its choice. */
export const RADIO_RX_KEY = 'radioRx';
export const RADIO_OUT_KEY = 'radioOut';
export const RADIO_STATE_KEY = 'radio';

/** How the radio's music falls off with distance on the home street (world px from the radio). */
export const RADIO_FALLOFF = Object.freeze({ full: 200, far: 1400, floor: 0.3 });

/** The medley's quiet between two musicblock tunes. */
export const MEDLEY_GAP_SEC = 2;
/** Listen in the Choose music sheet: a short sample, for the owner only. */
export const PREVIEW_MS = 20_000;

/** Every word the radio shows (plain, short, no em dashes). */
export const RADIO_TEXT = Object.freeze({
  name: 'Vine Radio',
  examine: 'A radio that grew out of the ground on a crab\'s say-so. It plays the music of the places you have been, for you and everyone who visits your street. Its leaves twitch to the beat.',
  stop: 'Stop',
  play: 'Play',
  choose: 'Choose music',
  next: 'Next track',
  examineVerb: 'Examine',
  streetInstead: 'Hear street music instead',
  hearRadio: 'Hear the radio',
  streetInsteadTip: 'Just for you, on this street. The radio comes back on your next visit.',
  hearRadioTip: 'Back to the radio\'s music.',
  chooseFirst: 'Choose music first.',
  oneTrack: 'This music is one track.',
  stopped: 'Stopped',
  streetStyle: 'Street style music',
  streetStyleSub: 'Your street style\'s own music, the default',
  sheetLead: 'Your street plays this for you and your visitors.',
  tabs: Object.freeze({ regions: 'Regions', themes: 'Theme tracks', blocks: 'Musicblocks' }),
  heard: 'Heard on your travels',
  notHeard: 'Not heard yet',
  comesWith: 'Came with the radio',
  playOnStreet: 'Play on my street',
  useStreetStyle: 'Use street style music',
  listen: 'Listen',
  listening: 'Listening',
  medley: 'Play my musicblocks',
  noBlocks: 'Carry a musicblock to add its tune.',
  placed: 'You put your Vine Radio out on your street.',
  putAway: 'Put away',
  putAwayTitle: 'Take it off your street. It keeps its music for when you put it out again.',
  putAwayDone: 'You put your Vine Radio away. Put it out again any time in Cultivate.',
  putOut: 'Put out Vine Radio',
  putOutTitle: 'Stand your Vine Radio on your street',
  putOutDone: 'Your Vine Radio is on your street. Click it to choose its music.',
  nowPlaying: (label) => `Your radio is playing ${label}.`,
  stoppedLine: 'You stopped your radio. Your street plays its own music again.',
  streetStyleLine: 'Your radio plays your street style music.',
  optedOut: 'You hear the street\'s own music here for now.',
  optedIn: 'You hear the radio again.',
});

/* ------------------------------------------------------------------ regions */

/**
 * The regions the Choose music sheet lists, each by the name the game's data gives its hub
 * (assets/streets/index.json hubName), with the music library it plays (ambient-music.json hubMap,
 * else hubNameHints, js/ambient-music.js resolveAmbientTheme). Austin 2026-11-24: where several
 * regions share one library, each is listed by its own name and plays that library. The regions are
 * the World Map's (js/map-views-data.js WORLD_MAP.regions) and the hubs with a library of their own
 * that the World Map leaves off (the Ilmenskie Caverns and Deeps, Jethimadh Tower's Base). Left out:
 * Naraka (Hell's one track is a theme track here), the archived and quest-only hubs.
 * tests/vine-radio.test.js checks every row against the data.
 */
export const RADIO_REGIONS = Object.freeze([
  ['76', 'Alakol', 'highlands'], ['89', 'Andra', 'andra_kajuu'], ['101', 'Aranna', 'default'], ['128', 'Balzare', 'urwok'],
  ['86', 'Baqala', 'savanna'], ['98', 'Besara', 'default'], ['75', 'Bortola', 'bortola_muufo'], ['112', 'Brillah', 'bortola_muufo'],
  ['107', 'Callopee', 'cave'], ['120', 'Cauda', 'default'], ['72', 'Chakra Phool', 'firebog'], ['90', 'Choru', 'savanna'],
  ['141', 'Drifa', 'nottis'], ['123', 'Fenneq', 'default'], ['114', 'Firozi', 'highlands'], ['119', 'Folivoria', 'andra_kajuu'],
  ['56', 'Groddle Forest', 'default'], ['64', 'Groddle Heights', 'default'], ['58', 'Groddle Meadow', 'default'], ['131', 'Haoma', 'kloro_haoma'],
  ['116', 'Haraiva', 'bortola_muufo'], ['50', 'Ilmenskie Caverns', 'caverns'], ['78', 'Ilmenskie Deeps', 'caverns'], ['27', 'Ix', 'ix'],
  ['136', 'Jal', 'jal'], ['71', 'Jethimadh', 'firebog'], ['77', 'Jethimadh Tower: Base', 'firebog'], ['85', 'Kajuu', 'andra_kajuu'],
  ['99', 'Kalavana', 'firebog'], ['88', 'Karnata', 'bortola_muufo'], ['133', 'Kloro', 'kloro_haoma'], ['105', 'Lida', 'andra_kajuu'],
  ['110', 'Massadoe', 'cave'], ['97', 'Muufo', 'bortola_muufo'], ['137', 'Nottis', 'nottis'], ['102', 'Ormonos', 'andra_kajuu'],
  ['106', 'Pollokoo', 'cave'], ['109', 'Rasana', 'highlands'], ['126', 'Roobrik', 'urwok'], ['93', 'Salatu', 'highlands'],
  ['140', 'Samudra', 'jal'], ['63', 'Shimla Mirch', 'firebog'], ['121', 'Sura', 'default'], ['113', 'Tahli', 'andra_kajuu'],
  ['92', 'Tamila', 'savanna'], ['51', 'Uralia', 'uralia'], ['100', 'Vantalu', 'default'], ['143', 'Vortex of Random', 'default'],
  ['95', 'Xalanga', 'savanna'], ['91', 'Zhambu', 'savanna'],
].map(([hubId, name, theme]) => Object.freeze({ hubId, name, theme })));

const REGION_BY_HUB = new Map(RADIO_REGIONS.map((r) => [r.hubId, r]));

export function radioRegion(hubId) {
  return REGION_BY_HUB.get(String(hubId ?? '')) || null;
}

/* ------------------------------------------------------------------ theme tracks */

/**
 * The downloads-page tracks the game plays somewhere, by id (the file's name), and where: hearing one
 * there unlocks it. Street music: the Enchanted Wood's music_file (ENCHANTED_WOOD), Naraka's library
 * (Hell's one track). Sounds and cues: meditating (js/meditation.js
 * MEDITATION_MUSIC), a running Metalmaker (METALMAKER), the Spinning Wheel (SPINNING_WHEEL) and the
 * Rube (features/rube-feature.js SONG). The game never plays the other eighteen (Eesti's hub has no
 * street, the Rook's attack picks ROOK_ATTACK, the party's lively stand-in is left out: Austin
 * 2026-11-24; #674, 2026-11-25: the subway stations play their region's music, as the 2012 client
 * did, so the three subway tracks play nowhere), so they come with the radio.
 * tests/vine-radio.test.js checks every row against the data.
 */
export const HEARD_WHERE = Object.freeze({
  'enchanted_woods_1344997332': 'Heard in the Enchanted Wood',
  'Dirge-of-the-Damned_1291886020': 'Heard in Naraka',
  'meditation1_1344997850': 'Heard while you meditate',
  'meditation2_1344997844': 'Heard while you meditate',
  'meditation3_1344997842': 'Heard while you meditate',
  'metalmaker_1344997841': 'Heard from a Metalmaker at work',
  'Spinning-Wheel_1292034939': 'Heard when a Spinning Wheel spins',
  'The_Rube_Song_1290596637': 'Heard when the Rube comes by',
});
const AMBIENT_DIR = 'assets/audio/ambient/';

const stem = (file) => String(file || '').replace(/\.mp3$/i, '');

/**
 * The Theme tracks tab: every downloads-page track (theme tracks, sketches, activity music, the Rube
 * Song), in the page's order. `played` says whether the game plays it somewhere (then hearing it
 * there unlocks it, `where` says where); the rest come with the radio.
 */
export function radioThemeTracks(config) {
  return (config?.downloads || []).map((d) => {
    const id = stem(d.file);
    return Object.freeze({
      id,
      title: String(d.title || ''),
      section: String(d.section || ''),
      url: `${AMBIENT_DIR}${d.file}`,
      played: Boolean(HEARD_WHERE[id]),
      where: HEARD_WHERE[id] || '',
    });
  });
}

/** A theme track by id, or null. */
export function radioThemeTrack(config, id) {
  return radioThemeTracks(config).find((t) => t.id === id) || null;
}

/** The track id a played URL counts as (a downloads-page file), or null. */
export function heardTrackId(config, url) {
  const file = String(url || '').split('?')[0].split('/').pop();
  if (!file) return null;
  const row = (config?.downloads || []).find((d) => d.file === file);
  return row ? stem(row.file) : null;
}

/* ------------------------------------------------------------------ choice and unlocks */

/**
 * The saved choice (cult.radio): `on` (playing, or stopped by its owner), `pick` (what it plays:
 * '' street style music, 'region:<hubId>', 'track:<id>', 'blocks'), and `blocks` (the medley's tunes,
 * the owner's musicblocks when last looked, so a visitor hears the same). Anything unknown is ''.
 */
export function normalizeRadioState(seed = {}) {
  const src = seed && typeof seed === 'object' ? seed : {};
  const pick = cleanPick(src.pick);
  const out = { on: src.on === true && pick !== '', pick };
  const blocks = Array.isArray(src.blocks) ? src.blocks.map((b) => String(b || '')).filter((b) => /^musicblock_[a-z0-9_]+$/.test(b)) : [];
  if (pick === 'blocks' && blocks.length) out.blocks = [...new Set(blocks)].slice(0, 40);
  return out;
}

export function cleanPick(raw) {
  const s = String(raw || '').trim();
  if (s === 'blocks') return s;
  if (/^region:\d+$/.test(s) && radioRegion(s.slice(7))) return s;
  if (/^track:[A-Za-z0-9_.-]+$/.test(s)) return s;
  return '';
}

/** Is the radio playing its own music (on, with a pick)? */
export function radioPlaying(state) {
  const st = normalizeRadioState(state);
  return st.on && st.pick !== '';
}

/**
 * What the owner may pick now. `hubs` the regions visited (hub ids), `heard` the theme track ids
 * heard where the game plays them, `blocks` the musicblock classes owned.
 */
export function radioUnlocks({ config, hubs = [], heard = [], blocks = [] } = {}) {
  const visited = new Set([...hubs].map(String));
  const heardSet = new Set(heard);
  const regions = RADIO_REGIONS.map((r) => ({ ...r, open: visited.has(r.hubId), tracks: (config?.themes?.[r.theme]?.tracks || []).length }));
  const tracks = radioThemeTracks(config).map((t) => ({ ...t, open: !t.played || heardSet.has(t.id), withRadio: !t.played }));
  return { regions, tracks, blocks: [...blocks] };
}

/** Can the owner pick this? */
export function pickOpen(pick, unlocks) {
  const p = cleanPick(pick);
  if (!p) return true;
  if (p === 'blocks') return (unlocks?.blocks || []).length > 0;
  if (p.startsWith('region:')) return Boolean(unlocks?.regions?.find((r) => `region:${r.hubId}` === p)?.open);
  return Boolean(unlocks?.tracks?.find((t) => `track:${t.id}` === p)?.open);
}

/**
 * What a pick plays: { key, label, tracks, loop, gapSec }. A region plays its library as Glitch
 * played one: each track once, then the next, round again (SoundMaster.as changeAmbientSet,
 * onSoundComplete); a theme track loops, as a street's own music did; the medley plays each owned
 * tune once with a short gap, then starts over. Null for street style music or nothing to play.
 * `blockAudio(classTsid)` gives a musicblock's file.
 */
export function radioPlaylist(pick, { config, blocks = [], blockAudio = () => '' } = {}) {
  const p = cleanPick(pick);
  if (!p) return null;
  if (p === 'blocks') {
    const tracks = blocks.map((b) => blockAudio(b)).filter(Boolean);
    return tracks.length ? { key: `blocks:${blocks.join(',')}`, label: 'My musicblocks', tracks, loop: false, gapSec: MEDLEY_GAP_SEC } : null;
  }
  if (p.startsWith('region:')) {
    const region = radioRegion(p.slice(7));
    const tracks = (config?.themes?.[region?.theme]?.tracks || []).filter(Boolean);
    return region && tracks.length ? { key: p, label: region.name, tracks, loop: tracks.length === 1, gapSec: 0 } : null;
  }
  const track = radioThemeTrack(config, p.slice(6));
  return track ? { key: p, label: track.title, tracks: [track.url], loop: true, gapSec: 0 } : null;
}

/** The label over the radio and in its menu: "Highlands" and "track 2 of 7". */
export function radioLabel(list, index = 0) {
  if (!list) return '';
  return list.tracks.length > 1 ? `${list.label} · ${index + 1} of ${list.tracks.length}` : list.label;
}

/** The menu's line under the radio's name. */
export function radioSubtitle(list, index = 0, { optedOut = false } = {}) {
  if (!list) return RADIO_TEXT.stopped;
  const where = list.tracks.length > 1 ? `, track ${index + 1} of ${list.tracks.length}` : '';
  return `${optedOut ? 'The radio plays' : 'Playing'} ${list.label}${where}`;
}

/* ------------------------------------------------------------------ louder near it */

/**
 * The radio's level at `distance` world px from it, 0..1 of the street music's own: full within
 * RADIO_FALLOFF.full, easing down (smoothstep) to RADIO_FALLOFF.floor at RADIO_FALLOFF.far and
 * beyond, so the home street is never silent.
 */
export function radioNearLevel(distance, falloff = RADIO_FALLOFF) {
  const d = Math.abs(Number(distance));
  if (!Number.isFinite(d) || d <= falloff.full) return 1;
  if (d >= falloff.far) return falloff.floor;
  const t = (d - falloff.full) / (falloff.far - falloff.full);
  const s = t * t * (3 - 2 * t);
  return falloff.floor + (1 - falloff.floor) * (1 - s);
}

/* ------------------------------------------------------------------ the crabs' quest */

/**
 * The crab streets players can reach on the open world (js/open-roads.js openWorld from the starter
 * street, no project built; tests/vine-radio.test.js works it out again from the street data).
 */
export const RADIO_REACHABLE_CRABS = Object.freeze(['GLICFILAMTI11QV', 'GIF101NCNU112O2', 'GLI14TT8T921J21', 'GLI2V0UN7RD1T2J', 'GM416LNIKVLM1']);

/** The world crabs (js/crabs.js CRAB_STREETS: eight streets, one crab each). */
export const WORLD_CRABS = 8;

/** Austin's 10 tunes for the 8 world crabs, scaled to the crabs players can reach. */
export function radioTuneGoal(reachable = RADIO_REACHABLE_CRABS.length, crabs = WORLD_CRABS) {
  return Math.max(1, Math.round((10 * reachable) / Math.max(1, crabs)));
}

export const RADIO_QUEST_ID = 'vine_radio_crab_tunes';
export const RADIO_QUEST_TUNES = radioTuneGoal();
/** The counter a crab hearing a tune emits (features/crabs-feature.js; js/quest-offers.js routes it). */
export const CRAB_TUNES_COUNTER = 'crab_tunes_heard';

/**
 * Tunes for Crabs: a crab offers it after it hears a tune from a home owner; the radio is the reward
 * (owning it is having done this quest, radioOwned). In the quest log like any other, and it turns
 * in by itself on the last tune (no end NPC: quest-offers-feature finish). Our own words, in the
 * crab's voice (npc_crab.js: "Hey! Hey! {pc_label}!").
 */
export const RADIO_QUEST = Object.freeze({
  classTsid: RADIO_QUEST_ID,
  title: 'Tunes for Crabs',
  desc: `Play ${RADIO_QUEST_TUNES} tunes for crabs. Each crab hears one tune from you a day. Crabs roam Groddle Forest, the Ilmenskie Caverns and Ix.`,
  offer: `Hey! Hey! {pc_label}! You have taste. For a non-crab.<split butt_txt="Thanks, I think?" />Me and my crab pals are starved for tunes. Play us ${RADIO_QUEST_TUNES}, one per crab per day, and you get something special.<split butt_txt="Like what?" />A Vine Radio! It grows right out of your home street and plays the music of every place you have been. Deal?`,
  completion: `${RADIO_QUEST_TUNES === 6 ? 'Six' : RADIO_QUEST_TUNES} tunes! The crabs are still bopping. Here is your Vine Radio, as promised. Put it out on your home street in Cultivate and let the music grow.`,
  requirements: Object.freeze([Object.freeze({ id: 'rvr1', type: 'counter', name: CRAB_TUNES_COUNTER, num: RADIO_QUEST_TUNES, classId: 'npc_crab', desc: `Play ${RADIO_QUEST_TUNES} tunes for crabs` })]),
  // #705: the radio never goes in the pack, so the award card and Activity say where it waits.
  rewards: Object.freeze({ xp: 300, mood: 100, unlock: Object.freeze({ label: 'Vine Radio', icon: RADIO_ART.url, where: 'Cultivate on your home street' }) }),
  prereqQuests: Object.freeze([]),
  isJob: false,
  autoComplete: false,
  isRepeatable: false,
  isEmergency: false,
  isMultiplayer: false,
  hideQuestlog: false,
  familiarTurnin: false,
  silentComplete: false,
  showAlert: false,
  acceptLabel: 'Deal!',
  prerequisites: Object.freeze([]),
  endNpcs: Object.freeze([]),
  locations: Object.freeze([]),
  instanced: false,
  needsStart: false,
  hasCanOffer: false,
  offerTriggers: Object.freeze([Object.freeze({ type: 'npc', npc: 'npc_crab' })]),
  offerNote: 'ours (G1245): a crab offers it to a home owner after hearing a tune',
  solo: true,
  ours: true,
});

/**
 * The quest catalog with Tunes for Crabs (js/content-catalogs.js, as the skill catalog gets Better
 * Learning): quests.json stays Tiny Speck's mined quests only.
 */
export function withOursQuests(catalog) {
  if (!catalog || typeof catalog !== 'object' || catalog[RADIO_QUEST_ID]) return catalog;
  return { ...catalog, [RADIO_QUEST_ID]: JSON.parse(JSON.stringify(RADIO_QUEST)) };
}

/** Does this player own the radio (the crabs' quest is done)? */
export function radioOwned(questState) {
  return Array.isArray(questState?.completed) && questState.completed.includes(RADIO_QUEST_ID);
}

/**
 * A visited home street's radio (neighbours-mp-feature, from the owner's saved street): null unless
 * it stands out, else { owner, ownerId, state } (its music choice).
 */
export function visitRadio(cult, { owner = '', ownerId = '' } = {}) {
  if (cult?.radioOut !== true) return null;
  return { owner: String(owner || ''), ownerId: String(ownerId ?? ''), state: normalizeRadioState(cult.radio) };
}
