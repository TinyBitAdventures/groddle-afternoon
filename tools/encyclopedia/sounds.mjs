/**
 * The encyclopedia's Music and sounds section (Austin 2026-11-03: "a good way
 * for contributors to see what we've managed to recover vs what is still
 * missing from the original game"): one entry per sound key of the sound
 * catalog (assets/content/sound-keys.json, written by build-sound-keys.mjs)
 * and per street music key of assets/content/ambient-music.json, read through
 * the model the sound compare report uses (tools/sound/sound-model.mjs), each
 * with its status, what plays now, the original's name and where it came from,
 * and where it plays in the game, linked to the encyclopedia's items,
 * creatures, people, quests and places. Everything is read at build time, so
 * the counts follow the catalog. Spec: docs/encyclopedia.md "Music and sounds".
 *
 * addSounds(d) runs inside loadEncyclopedia once the blank stubs are known, so
 * a sound never keeps a stub and never links to one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GSJS, readGsjsItem } from '../catalog/build.mjs';
import { keyState, loadSoundData, originalOf, streetMusicKeys, streetStatus } from '../sound/sound-model.mjs';

const root = join(import.meta.dirname, '..', '..');

/** The section's statuses (parts.mjs STATUS has their badge words). */
export const SOUND_STATUS = ['snd_original', 'snd_standin', 'snd_synth', 'snd_silent', 'snd_missing'];
const FROM_MODEL = { original: 'snd_original', 'stand-in': 'snd_standin', synth: 'snd_synth', silent: 'snd_silent', missing: 'snd_missing', absent: 'snd_missing' };

/** The groups, in the index's order. */
export const SOUND_GROUPS = [
  { key: 'region', label: 'Region music', blurb: 'The tunes each region played as you walked its streets, a set per region, one after another.' },
  { key: 'street', label: 'Street music', blurb: 'Streets with a tune of their own, looped while you are there.' },
  { key: 'event', label: 'Party and event music', blurb: 'Music for parties, games, quests and special places.' },
  { key: 'musicblock', label: 'Musicblocks', blurb: 'The collectible blocks that each play a short tune.' },
  { key: 'world', label: 'UI and the world', blurb: 'Menus, rewards, travel, quoins and everyday things.' },
  { key: 'creature', label: 'Creatures and trees', blurb: 'Animals, trees and the things they do.' },
  { key: 'tool', label: 'Tools and verbs', blurb: 'Tools at work and powders.' },
  { key: 'machine', label: 'Machines and making', blurb: 'Machines, cooking and making things.' },
  { key: 'quest', label: 'Quests, games and puzzles', blurb: 'Quests, races, puzzles, rooms and events.' },
  { key: 'voice', label: 'Voices', blurb: 'Spoken lines.' },
  { key: 'remake', label: 'New in the remake', blurb: 'Moments the remake added a sound to. The original had no sound here, so nothing is missing.' },
];
const GROUP_OF_CATEGORY = {
  ui: 'world', travel: 'world', item: 'world', reward: 'world', quoin: 'world', downloads: 'world',
  animal: 'creature', nature: 'creature', tool: 'tool', powder: 'tool', making: 'machine',
  event: 'quest', recovered: 'quest', voice: 'voice', remake: 'remake', music: 'event',
};

/** Where an original came from, in player words (the catalog's `origin`). */
export const ORIGIN_WORDS = {
  'archiveorg-sfx': 'Tiny Speck’s sound sets, kept on the Internet Archive',
  'wayback-c2': 'the game’s own servers, saved by web archives',
  'sounds-zip': 'a fan’s copy of the game server’s sound folder',
  'overlay-fla': 'Tiny Speck’s own animation files',
  'slack-mirror': 'the copy of Tiny Speck’s sounds that Slack kept',
  'downloads-best-fit': 'Tiny Speck’s downloads page',
};

/** The parts of Tiny Speck's server that played a sound, in player words (players/, locations/, groups/). */
const SYSTEM_WORDS = {
  'players/inc_eleven_secrets': 'The Eleven Secret Locations', 'players/inc_achievements': 'Earning an achievement',
  'players/inc_making': 'Making things', 'players/player': 'You, as you play', 'players/inc_items': 'Finding a new item',
  'players/inc_stats': 'Levelling up', 'players/inc_houses': 'Homes', 'players/inc_quests': 'Finishing a quest',
  'players/inc_skills': 'Learning a skill', 'players/inc_party': 'Party spaces', 'players/inc_games': 'Races and games',
  'locations/location': 'Streets', 'locations/inc_transit': 'The subway', 'groups/shared_instance_manager': 'Races and games',
  'groups/global_game': 'Game of Crowns', main: 'The whole world', admin: 'The whole world',
};
/** The parts of Tiny Speck's game screen that played a sound (the client's classes), in player words. */
const SCREEN_WORDS = {
  SkillInfoUI: 'The skills panel', CameraMan: 'The camera', SnapTravelView: 'The camera', ImaginationHandUI: 'Imagination cards',
  ImgCardUI: 'Imagination cards', LocationSelectorDialog: 'Choosing a floor', HubMapDialog: 'The map', QuestQueue: 'The quest log',
  QuestsDialog: 'The quest log', LoadingLocationView: 'Arriving on a street', NetController: 'Doors', TSMainView: 'Loading the game',
  AnnouncementController: 'Hi signs', MissileController: 'Hi signs', RightSideManager: 'Chat', RightSideView: 'Chat',
  BootStrapController: 'The opening screen', LateralLoader: 'The opening screen', ImaginationButton: 'The Imagination button',
  TSFrontController: 'Zooming the view', TradeDialog: 'Trading', AvatarPhysicsHandler: 'Jumping',
  ImaginationPurchaseUpgradeUI: 'Buying an upgrade', HandOfDecorator: 'Decorating', ImgMenuView: 'The Imagination menu',
};

/** Names Tiny Speck's keys spell in capitals: the words keep their capital letter. */
const PROPER = new Set(['ix', 'andra', 'kajuu', 'rook', 'piggy', 'groddle', 'uralia', 'esquibeth', 'zutto', 'jal', 'kloro', 'haoma', 'urwok',
  'firebog', 'firebogs', 'hell', 'rube', 'juju', 'craftybot', 'asslandia', 'cloudhopolis', 'xavier', 'mike', 'tyson', 'wilhelm',
  'tubamaphone', 'blooian', 'butler', 'stoot', 'imagination', 'eesti', 'giants', 'pot', 'savanna', 'highlands', 'caverns']);
const WORDS = { xp: 'iMG', goc: 'Game of Crowns', vo: 'voice-over', ui: 'UI', pol: 'POL', mb: 'Musicblock', wm: 'WM', ii: 'II', iii: 'III' };
/** Keys whose plain name would read wrong. */
const NAMES = {
  GLITCHMAS_PARTY_LOCATION: 'Winter Wingding party', BLUE__WHITE: 'Blue and White', DE_EMBIGGENIFY: 'De-Embiggenify',
  ABANDONDED_APARTMENTS2: 'Abandoned apartments 2', Prisencolinensinainciusol: 'Prisencolinensinainciusol', trumpet: 'Trumpet',
  NO_MUSIC: 'No music', QUORAZY_QUOIN: 'Qurazy quoin', TEST: 'Test tune',
};

/** A plain name from a key: ROOK_CAW is "Rook caw". */
export function plainName(key) {
  if (NAMES[key]) return NAMES[key];
  const bw = /^BW_([A-G]\d)$/.exec(key);
  if (bw) return `Waterfall bell ${bw[1]}`;
  const doll = /^STEWARTDOLL(\d+)$/.exec(key);
  if (doll) return `Stoot doll line ${doll[1]}`;
  const words = key.toLowerCase().split(/_+/).filter(Boolean)
    .flatMap((w) => (w.length > 2 ? w.replace(/^([a-z]+)(\d+)$/, '$1 $2').split(' ') : [w]))
    .map((w) => WORDS[w] || (PROPER.has(w) ? w[0].toUpperCase() + w.slice(1) : w));
  const s = words.join(' ');
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * The catalog's moment in player words, or '' when it is a developer note
 * (a file and line, a music_map row, a downloads-page file name).
 */
export function playerMoment(moment) {
  let s = String(moment || '').trim();
  if (!s || /^street:|\b[GL][A-Z0-9]{14}\b|\.(?:js|as|html|fla|xml)\b|music_map|:\d|\bkey\b.*\bborrows\b/i.test(s)) {
    if (!/^Recovered c2 file/.test(s)) return '';
  }
  s = s.replace(/^Recovered c2 file with no surviving key; /, '').replace(/^Recovered c2 /, '')
    .replace(/, so [A-Z_]+ borrows it$/, '').replace(/ \((?:client|client UI)\)$/, '').replace(/, \d+ ms after entering \(client\)$/, '')
    .replace(/ \(synth stand-in for [A-Z_]+\)$/, '').replace(/ \(quotes [^)]*\)$/, '').replace(/ \(remake: [^)]*\)$/, '')
    .replace(/\s*\(\d{4}-\d{2}[^)]*\)/, '').replace(/ \d{4}-\d{2} /, ' ').replace(/, \d+ ms after entering$/, '')
    .replace('Your Glitch croaks', 'You croak').replace('an item class', 'a kind of item');
  if (/\b(?:c2|GSJS|client)\b|[A-Z]{3,}_[A-Z]|\bGlitch\b/.test(s)) return '';
  // "iMG quoin" keeps its small i.
  return s && !/^[a-z][A-Z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s;
}

const base = (u) => decodeURIComponent(String(u || '').split('/').pop());

/** The original recording's own name: the file Tiny Speck's game played, or the downloads-page title. */
function originalName(row) {
  if (!row) return '';
  if (row.origin === 'downloads-best-fit') return row.fit || '';
  if (row.archiveFile) return row.archiveFile;
  if (row.zipFile) return row.zipFile;
  if (row.mirrorFile) return base(row.mirrorFile);
  if (row.overlaySource) return /([^/]+\.mp3)/.exec(row.overlaySource)?.[1] || '';
  return base(row.url);
}

/**
 * Adds a `sounds:<id>` entry for every sound to `d.entries` (ids are the keys in
 * lower case) and returns the section's facts for the pages: { groups, regions,
 * stubs }. `d` is loadEncyclopedia's state: entries, items, keyOf, stubKey,
 * stubs, nameOf.
 */
export function addSounds(d, { picture }) {
  const { keys, music } = loadSoundData(root);
  const streets = streetMusicKeys(music, root);
  const streetIndex = JSON.parse(readFileSync(join(root, 'public/assets/streets/index.json'), 'utf8')).streets;
  const places = [...d.entries.values()].filter((e) => e.section === 'places');
  /** A street's G tsid -> { place, anchor, name } on the Places pages. */
  const streetAt = new Map();
  for (const p of places) for (const st of p.streets) streetAt.set(`G${st.tsid.slice(1)}`, { place: p.key, anchor: st.tsid, name: st.name });
  const hubPlace = new Map(places.map((p) => [String(p.hubId), p]));

  /* Themes: which keys belong to which music set, and where each set plays. */
  const themeOf = new Map(); // key -> [{ id, i }]
  for (const [id, t] of Object.entries(music.themes)) (t.gsjsKeys || []).forEach((k, i) => { if (!themeOf.has(k)) themeOf.set(k, []); themeOf.get(k).push({ id, i }); });
  const hubsOf = (themeId) => Object.entries(music.hubMap).filter(([, th]) => th === themeId).map(([h]) => h);
  const regionThemes = Object.entries(music.themes).filter(([id, t]) => t.order === 'library' && (hubsOf(id).length || id === music.defaultTheme)).map(([id]) => id);
  const regionTheme = (k) => (themeOf.get(k) || []).find((t) => regionThemes.includes(t.id)) || null;
  const regions = regionThemes.map((id) => {
    const t = music.themes[id];
    const mapped = hubsOf(id).map((h) => hubPlace.get(h)).filter(Boolean).map((p) => p.key);
    // Regions with no set of their own play the default set (sound-model streetState).
    const others = id === music.defaultTheme ? places.filter((p) => !music.hubMap[String(p.hubId)]).map((p) => p.key) : [];
    return { id, label: t.label, tracks: (t.gsjsKeys || []).length, places: [...new Set(mapped)], others };
  });
  const regionById = new Map(regions.map((r) => [r.id, r]));

  /** Who owns a file the remake plays: a sound key, a downloads-page title, or just its name. */
  const ownerOf = new Map();
  for (const [k, r] of Object.entries(keys)) if (r.file && !ownerOf.has(r.file)) ownerOf.set(r.file, k);
  const downloads = new Map((music.downloads || []).map((x) => [x.file, x.title]));
  const fileName = (f) => {
    const owner = ownerOf.get(f);
    if (owner) return { key: owner };
    const title = downloads.get(base(f));
    return title ? { title, downloads: true } : { title: base(f).replace(/\.mp3$/, '') };
  };

  /* Where a sound plays, from the catalog's sources. */
  const gsjsName = (cls) => {
    if (/^(?:catalog_|inc_)/.test(cls) || !existsSync(join(GSJS, 'items', `${cls}.js`))) return null;
    return readGsjsItem(cls).name;
  };
  const whereOf = (row) => {
    const things = [];
    const streetsHere = [];
    const systems = [];
    for (const s of row.sources || []) {
      let m;
      if ((m = /^gsjs:items\/([a-z0-9_]+)\.js/.exec(s))) {
        const cls = m[1];
        const k = d.keyOf(cls);
        if (k) things.push({ key: k });
        else {
          const stub = d.stubKey(cls);
          const name = stub ? d.nameOf(stub) : gsjsName(cls);
          if (name) things.push({ key: null, name });
        }
      } else if ((m = /^gsjs:quests\/([a-z0-9_]+)\.js/.exec(s))) {
        if (d.entries.has(`quests:${m[1]}`)) things.push({ key: `quests:${m[1]}` });
      } else if ((m = /^street:(G[A-Z0-9]+)/.exec(s))) {
        const at = streetAt.get(m[1]);
        streetsHere.push(at ? { ...at } : { place: null, name: streetIndex[m[1]]?.label || '' });
      } else if ((m = /^gsjs:((?:players|locations|groups)\/[a-z_]+|main|admin)\.js/.exec(s))) {
        if (SYSTEM_WORDS[m[1]]) systems.push(SYSTEM_WORDS[m[1]]);
      } else if ((m = /^client:.*?([A-Za-z]+)\.as\b/.exec(s))) {
        const w = SCREEN_WORDS[m[1]];
        if (w) systems.push(w);
        else if (!/^(?:AdminDialog|HandOfGod|Assets)/.test(m[1])) systems.push('The game’s screen and menus');
      }
    }
    const uniq = (list, f) => list.filter((x, i, a) => a.findIndex((y) => f(y) === f(x)) === i);
    return {
      things: uniq(things, (x) => x.key || x.name),
      streets: uniq(streetsHere.filter((x) => x.name), (x) => `${x.place}#${x.anchor || x.name}`),
      systems: [...new Set(systems)],
    };
  };

  /* One entry per key, and per street music key the catalog does not list. */
  const all = new Set([...Object.keys(keys), ...streets.keys(), ...themeOf.keys()]);
  const stubs = [];
  const made = [];
  for (const key of [...all].sort((a, b) => a.localeCompare(b))) {
    const row = keys[key] || null;
    const street = streets.get(key) || null;
    // A key the catalog does not list is Tiny Speck's when a music set names it, else the remake's own (PARTY_LIVELY).
    const remakeOnly = row ? row.category === 'remake' : !themeOf.has(key);
    const orig = row ? originalOf(keys, key) : null;
    const origRow = orig ? keys[orig.via] : null;
    const region = regionTheme(key);
    // The Musicblocks set lists every block's tune: no stand-in for one block.
    const themes = (themeOf.get(key) || []).filter((t) => !regionThemes.includes(t.id) && t.id !== 'musicblocks');

    // What plays now. A street's music_file is what the street plays; a key in a
    // music set the remake plays the set's track in its place.
    let state = row ? keyState(keys, key) : { status: 'absent', file: null };
    let files = state.file ? [state.file] : [];
    let via = 'key';
    if (state.status !== 'original' && state.status !== 'silent') {
      if (street) {
        const st = streetStatus(music, keys, key, street.hubId);
        state = { status: st.status === 'stand-in' ? 'stand-in' : st.status, theme: st.theme };
        files = st.tracks;
        via = 'street';
      } else if (region || themes.length) {
        const t = region || themes[0];
        const th = music.themes[t.id];
        const lined = th.order === 'library' && th.tracks.length === th.gsjsKeys.length;
        files = lined ? [th.tracks[t.i]] : th.tracks;
        state = { status: files.length ? 'stand-in' : 'missing', theme: t.id };
        via = 'theme';
      }
    }
    files = [...new Set(files.filter(Boolean))];
    const status = FROM_MODEL[state.status] || 'snd_missing';
    const standins = status === 'snd_standin' ? files.map((f) => ({ file: f, ...fileName(f) })) : [];

    // Group.
    let group;
    if (region) group = 'region';
    else if (/^MUSICBLOCK_/.test(key)) group = 'musicblock';
    else if (remakeOnly) group = 'remake';
    else if (street) group = 'street';
    else if (!row || row.category === 'music' || themes.length) group = 'event';
    else group = GROUP_OF_CATEGORY[row.category] || 'quest';

    const where = row ? whereOf(row) : { things: [], streets: [], systems: [] };
    if (street) {
      for (const st of street.streets) {
        const at = streetAt.get(st.tsid);
        where.streets.push(at ? { ...at, music: true } : { place: null, name: st.label, music: true });
      }
    }
    const moment = playerMoment(row?.moment);
    const themeWords = themes.filter((t) => t.id !== 'musicblocks').map((t) => music.themes[t.id].label.replace(/^Party: /, '').replace(/\s*\([^)]*\)$/, '')).filter((l) => !/stand-in/.test(l));
    const id = key.toLowerCase();
    // A tool or a Musicblock playing its own class name: the item's own name (ACE_OF_SPADES is "Ace of Spades").
    const regionKeys = region ? music.themes[region.id].gsjsKeys : [];
    const name = region
      ? (regionKeys.length === 1 ? music.themes[region.id].label : `${music.themes[region.id].label} track ${region.i + 1}`)
      : d.items.get(id)?.name || plainName(key);
    const entry = {
      section: 'sounds', id, name, group: SOUND_GROUPS.find((g) => g.key === group).label, groupKey: group, status,
      sound: {
        key, row, remakeOnly, moment, themeWords, region: region ? { id: region.id, n: region.i + 1 } : null,
        original: orig ? { file: orig.file, from: ORIGIN_WORDS[orig.origin] || '', name: originalName(origRow), bestFit: orig.origin === 'downloads-best-fit', shared: orig.via !== key ? orig.via : null } : null,
        lostName: !orig && row?.url ? base(row.url) : '',
        files, standins, recipe: status === 'snd_synth' ? state.recipe : null, via, dead: Boolean(row?.dead),
        where, streetCount: street?.n || 0,
      },
    };
    // isBlankStub, as the other sections: nothing plays, no original, no name of the original, no use known.
    const blank = status === 'snd_missing' && !orig && !entry.sound.lostName && !moment && !where.things.length && !where.streets.length && !where.systems.length;
    if (blank) { stubs.push({ key: `sounds:${id}`, section: 'sounds', id, name, status }); continue; }
    made.push(entry);
  }

  for (const e of made) {
    const key = `sounds:${e.id}`;
    const refs = [];
    for (const t of e.sound.where.things) if (t.key) refs.push({ to: t.key, rel: 'plays-in' });
    for (const s of e.sound.where.streets) if (s.place) refs.push({ to: s.place, rel: s.music ? 'street-music' : 'plays-in', anchor: s.anchor });
    if (e.sound.region) {
      const r = regionById.get(e.sound.region.id);
      for (const p of [...r.places, ...r.others]) refs.push({ to: p, rel: 'region-music' });
    }
    // The picture: the thing or place it belongs to, else a Musicblock for music.
    const firstThing = e.sound.where.things.find((t) => t.key && (t.key.startsWith('item:') ? d.items.get(t.key.slice(5))?.icon : d.entries.get(t.key)?.icon));
    const thingIcon = firstThing ? (firstThing.key.startsWith('item:') ? d.items.get(firstThing.key.slice(5)).icon : d.entries.get(firstThing.key).icon) : null;
    const placeKey = refs.find((r) => r.rel === 'region-music' || r.rel === 'street-music')?.to;
    const placeIcon = placeKey ? d.entries.get(placeKey)?.icon : null;
    const musical = ['region', 'street', 'event', 'musicblock'].includes(e.groupKey);
    const icon = (e.groupKey === 'musicblock' && d.items.get(e.id)?.icon) || thingIcon || placeIcon || (musical ? picture('assets/sprites/icons/musicblock_d_green_01.png', 'Shown as a Musicblock') : null);
    d.entries.set(key, { key, refs: refs.filter((r, i, a) => a.findIndex((x) => x.to === r.to && x.rel === r.rel && x.anchor === r.anchor) === i), icon, register: '', ...e });
  }
  return { groups: SOUND_GROUPS, regions, stubs };
}
