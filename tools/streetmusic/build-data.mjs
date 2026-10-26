#!/usr/bin/env node
/**
 * Writes public/street-music/data.json for the Street music page
 * (/street-music/, drawn by minn/groddle/src/StreetMusic.php).
 *
 * The tracks, their titles and their groups are Tiny Speck's own, from its
 * downloads page (assets/content/ambient-music.json "downloads"); where each
 * plays is the remake's theme map in the same file (the themes a track is in,
 * as places). Glitch's own street loops were never archived, so the remake
 * plays these published tracks in the places they fit; the entry says so.
 *
 *   node tools/streetmusic/build-data.mjs          write data.json
 *   node tools/streetmusic/build-data.mjs --check  exit 1 if data.json is stale
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pub = join(root, 'public');
const out = join(pub, 'street-music', 'data.json');

/** Tiny Speck's section headings on its downloads page, in the page's order. */
export const GROUPS = [
  { id: 'theme', title: 'Theme tracks', glow: '#9ee4ac' },
  { id: 'sketch', title: 'Theme sketches', glow: '#9cc8f5' },
  { id: 'activity', title: 'Activity music', glow: '#e0bb8a' },
  { id: 'ringtone', title: 'The Rube Song', glow: '#f5a5b5' },
];

/**
 * Each music theme of the remake as a place a reader knows, or null for a
 * theme that is no place (the Musicblocks set, a stand-in, a single loop).
 * Every theme in ambient-music.json must be here: a new one fails the build.
 */
export const PLACES = {
  default: 'the Groddle forests',
  caverns: 'Ilmenskie Caverns',
  cave: 'caves',
  firebog: 'the Firebogs',
  uralia: 'Uralia',
  savanna: 'the savanna regions',
  highlands: 'the Highlands',
  bortola_muufo: 'Bortola and Muufo',
  nottis: 'Nottis and Drifa',
  andra_kajuu: 'Andra and Kajuu',
  ix: 'Ix',
  hell: 'Hell',
  subway: 'the subway',
  rook: 'Rook attacks',
  meditation: 'meditation',
  eesti: 'the Eesti Life catalogue room',
  musicblocks: null,
  party_moon: 'the Toxic Moon party',
  party_highlands: 'the Val Holla party',
  party_abysmal: 'the Aquarius party',
  party_holiday: 'the Winter Wingding party',
  party_lively: null,
  enchanted: 'the Enchanted Wood',
  snappy: null,
  sky_plunge: 'Sky Plunge',
};

export function streetMusicData() {
  const music = JSON.parse(readFileSync(join(pub, 'assets/content/ambient-music.json'), 'utf8'));
  const missing = Object.keys(music.themes).filter((id) => !(id in PLACES));
  if (missing.length) throw new Error(`no place for theme ${missing.join(', ')} (tools/streetmusic/build-data.mjs PLACES)`);
  const placesOf = (file) => [...new Set(Object.entries(music.themes)
    .filter(([id, theme]) => PLACES[id] && theme.tracks.some((t) => t.endsWith('/' + file)))
    .map(([id]) => PLACES[id]))];
  const groups = GROUPS.map((group) => ({
    ...group,
    tracks: music.downloads.filter((d) => d.section === group.id).map((d) => {
      const audio = `assets/audio/ambient/${d.file}`;
      if (!existsSync(join(pub, audio))) throw new Error(`${d.title}: no recording at ${audio}`);
      return { title: d.title, audio: `/${audio}`, places: placesOf(d.file) };
    }),
  }));
  return { groups, counts: { tracks: groups.reduce((n, g) => n + g.tracks.length, 0) } };
}

function main() {
  const body = JSON.stringify(streetMusicData(), null, 1) + '\n';
  const now = existsSync(out) ? readFileSync(out, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (now !== body) {
      console.log('public/street-music/data.json is stale (node tools/streetmusic/build-data.mjs)');
      process.exit(1);
    }
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, body);
  const d = JSON.parse(body);
  console.log(`${d.counts.tracks} tracks: ${d.groups.map((g) => `${g.title} ${g.tracks.length}`).join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
