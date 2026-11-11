/**
 * Hub ambient music resolution (GSJS ambient_hub_map).
 * Run: node --test tests/ambient-music.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setAmbientMusicConfig,
  resolveAmbientTheme,
  tracksForTheme,
  pickAmbientTrack,
  themeLabel,
  allAmbientTrackUrls,
  ambientPlaylist,
  SILENT_THEME,
} from '../public/js/ambient-music.js?v=274c2864';

import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js?v=fb6ee553';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GSJS_MAIN = join(__dirname, '../../glitch-GameServerJS/main.js');
const cfgPath = join(__dirname, '../public/assets/content/ambient-music.json');

before(() => {
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  setAmbientMusicConfig(cfg);
});

describe('GSJS hub → ambient theme', () => {
  it('loads config with hubMap and themes from GSJS keys', () => {
    assert.ok(existsSync(cfgPath));
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    assert.ok(cfg.hubMap['56'] === 'default' || cfg.hubMap['56']);
    assert.ok(cfg.hubMap['50'] === 'caverns');
    assert.ok(cfg.hubMap['63'] === 'firebog');
    assert.ok(cfg.hubMap['93'] === 'highlands');
    assert.ok(cfg.themes.default?.tracks?.length >= 1);
    assert.ok(cfg.themes.caverns?.gsjsKeys?.some((k) => /CAVERN/i.test(k)));
  });

  it('resolveAmbientTheme uses hubId map (main.js ambient_hub_map)', () => {
    assert.equal(resolveAmbientTheme({ hubId: 56, hubName: 'Groddle Forest' }), 'default');
    assert.equal(resolveAmbientTheme({ hubId: '50' }), 'caverns');
    assert.equal(resolveAmbientTheme({ hubId: 78 }), 'caverns');
    assert.equal(resolveAmbientTheme({ hubId: 63 }), 'firebog');
    assert.equal(resolveAmbientTheme({ hubId: 93 }), 'highlands');
    assert.equal(resolveAmbientTheme({ hubId: 86 }), 'savanna');
    assert.equal(resolveAmbientTheme({ hubId: 137 }), 'nottis');
    assert.equal(resolveAmbientTheme({ hubId: 75 }), 'bortola_muufo');
  });

  it('falls back via hub name hints when hubId unknown', () => {
    assert.equal(
      resolveAmbientTheme({ hubId: '99999', hubName: 'Ilmenskie Something' }),
      'caverns'
    );
    assert.equal(
      resolveAmbientTheme({ hubId: '99998', hubName: 'Nottis Ice' }),
      'nottis'
    );
  });

  it('pickAmbientTrack is stable for same hub, varies by hub', () => {
    const a = pickAmbientTrack('default', { hubId: 56 });
    const b = pickAmbientTrack('default', { hubId: 56 });
    assert.equal(a, b);
    assert.ok(a && a.endsWith('.mp3'));
    const c = pickAmbientTrack('caverns', { hubId: 50 });
    assert.ok(c);
    assert.ok(tracksForTheme('caverns').includes(c));
  });

  it('local ambient files exist for referenced tracks', () => {
    const urls = allAmbientTrackUrls();
    assert.ok(urls.length >= 6);
    let found = 0;
    for (const u of urls) {
      const rel = u.replace(/^assets\//, '');
      const p = join(__dirname, '../public', 'assets', rel.replace(/^assets\//, ''));
      // url is assets/audio/ambient/...
      const p2 = join(__dirname, '../public', u);
      if (existsSync(p2)) found += 1;
    }
    assert.ok(found >= 6, `expected local ambient mp3s, found ${found}`);
  });

  it('themeLabel is human readable', () => {
    assert.match(themeLabel('default'), /Forest|Groddle/i);
    assert.match(themeLabel('caverns'), /Ilmenskie|Cavern/i);
  });
});

describe('street music_file keys', () => {
  it('maps geometry music_file keys through streetMusic to recovered themes', () => {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    for (const [key, theme] of Object.entries(cfg.streetMusic || {})) {
      assert.ok(cfg.themes[theme], `${key} -> ${theme} has no theme`);
      assert.deepEqual(tracksForTheme(`street:${key}`), tracksForTheme(theme));
      for (const url of cfg.themes[theme].tracks) assert.ok(existsSync(join(__dirname, '../public', url)), url);
    }
    assert.equal(resolveAmbientTheme({ musicFile: 'TOXIC_MOON' }), 'street:TOXIC_MOON');
    // The c2 original (Also_Sprach_Zarathustra_Loop_3.2_fades), not the Moon Music stand-in.
    assert.equal(tracksForTheme('street:TOXIC_MOON')[0], 'assets/audio/sfx/TOXIC_MOON.mp3');
  });

  it('unknown music_file keys keep the default library', () => {
    assert.deepEqual(tracksForTheme('street:NO_SUCH_KEY'), tracksForTheme('default'));
  });

  it('a street whose music library is lost keeps its hub music', () => {
    // ABANDONDED_APARTMENTS2 (Upper Floors 1.2) is in no archive and not in Sounds.zip.
    assert.equal(resolveAmbientTheme({ musicFile: 'ABANDONDED_APARTMENTS2', hubId: '50' }), 'caverns');
    // XAVIER_CARNIVOROUS_PLANTS (36 streets) came back with Sounds.zip and plays its own loop.
    assert.equal(resolveAmbientTheme({ musicFile: 'XAVIER_CARNIVOROUS_PLANTS', hubId: '50' }), 'street:XAVIER_CARNIVOROUS_PLANTS');
    assert.deepEqual(tracksForTheme('street:XAVIER_CARNIVOROUS_PLANTS'), ['assets/audio/sfx/XAVIER_CARNIVOROUS_PLANTS.mp3']);
    assert.equal(themeLabel('street:XAVIER_CARNIVOROUS_PLANTS'), 'Carnivorous Plants');
  });

  it('every street music_file with a recovered recording loops that recording (location.js 481-482)', () => {
    const streetsDir = join(__dirname, '../public/assets/streets');
    const seen = new Set();
    for (const name of readdirSync(streetsDir).filter((f) => /^G[A-Z0-9]+\.json$/.test(f))) {
      const street = JSON.parse(readFileSync(join(streetsDir, name), 'utf8'));
      const key = street.musicFile;
      if (!key || key === 'NO_MUSIC' || seen.has(key)) continue;
      seen.add(key);
      const file = SOUND_FILES[key] || SOUND_FILES[SOUND_ALIASES[key]];
      if (!file) continue;
      const theme = resolveAmbientTheme(street);
      assert.deepEqual(tracksForTheme(theme), [file], `${key} on ${street.label}`);
      assert.deepEqual(ambientPlaylist(theme, { hubId: street.hubId }), { tracks: [file], start: 0, loop: true }, key);
    }
    assert.ok(seen.size >= 25);
  });

  it('NO_MUSIC streets are silent', () => {
    assert.equal(resolveAmbientTheme({ musicFile: 'NO_MUSIC', hubId: '56' }), SILENT_THEME);
    const piano = JSON.parse(readFileSync(join(__dirname, '../public/assets/streets/GA96OS42D6F3M9P.json'), 'utf8'));
    assert.equal(resolveAmbientTheme(piano), SILENT_THEME);
  });
});

describe('game wiring', () => {
  it('game.js switches ambient on street enter', () => {
    const game = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    assert.ok(game.includes('setAmbientForStreet'));
    assert.ok(game.includes('loadAmbientMusicConfig'));
    assert.ok(game.includes('resolveAmbientTheme'));
    assert.ok(game.includes('ambient-music'));
  });
});

describe('street playlists', () => {
  it('play no Musicblock tunes (Goodnight Groddle is the Musicblock lullaby, not street music)', () => {
    const cfg = JSON.parse(readFileSync(new URL('../public/assets/content/ambient-music.json', import.meta.url), 'utf8'));
    for (const [id, theme] of Object.entries(cfg.themes)) {
      if (id === 'musicblocks') continue;
      for (const track of theme.tracks || []) assert.doesNotMatch(track, /GOODNIGHT_GRODDLE|MUSICBLOCK/i, `${id}: ${track}`);
    }
  });

  it('no street music set loops the Spinning Wheel jingle (a 9 s one-shot from the downloads page)', () => {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    for (const [id, theme] of Object.entries(cfg.themes)) {
      for (const track of theme.tracks || []) assert.doesNotMatch(track, /Spinning-Wheel/i, `${id}: ${track}`);
    }
    // It stays on the Street music page as one of Tiny Speck's published tracks.
    assert.ok(cfg.downloads.some((d) => /Spinning-Wheel/.test(d.file)));
  });
});

describe('Hell keeps its own music (ticket 47)', () => {
  it('no other theme plays a Hell track: the Firebogs had seven songs of their own and Hell one (main.js 350-358, 449-451)', () => {
    // Both are the originals since Sounds.zip: HELL (Bongbong.mp3) is the Dirge byte for byte.
    const music = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/assets/content/ambient-music.json'), 'utf8'));
    const themes = music.themes || music;
    const hell = new Set(themes.hell.tracks);
    assert.deepEqual([...hell], ['assets/audio/ambient/Dirge-of-the-Damned_1291886020.mp3']);
    for (const [name, theme] of Object.entries(themes)) {
      // The Rook attack's own music (ROOK_ATTACK) may share it: an event's theme, not a place's.
      if (name === 'hell' || name === 'rook' || !Array.isArray(theme?.tracks)) continue;
      for (const track of theme.tracks) assert.ok(!hell.has(track), `${name} plays Hell's ${track}`);
    }
    assert.ok(themes.firebog.tracks.length >= 2);
    assert.deepEqual(themes.firebog.tracks, [1, 2, 3, 4, 5, 6, 7].map((n) => `assets/audio/sfx/AMBIENT_FIREBOGS${n}.mp3`));
  });
});

describe('the original libraries (Sounds.zip, 2026-11-02)', () => {
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const library = Object.entries(cfg.themes).filter(([, t]) => t.order === 'library');
  const fileOf = (key) => SOUND_FILES[key] || SOUND_FILES[SOUND_ALIASES[key]];

  it('every library theme plays its GSJS keys\' own recordings, in order', () => {
    assert.equal(library.length, 15);
    for (const [id, theme] of library) {
      assert.deepEqual(theme.tracks, theme.gsjsKeys.map(fileOf), id);
      for (const track of theme.tracks) assert.ok(existsSync(join(__dirname, '../public', track)), track);
    }
  });

  it('matches main.js ambient_library and ambient_hub_map (331-507)', { skip: !existsSync(GSJS_MAIN) && 'needs glitch-GameServerJS beside the game' }, () => {
    const main = readFileSync(GSJS_MAIN, 'utf8');
    const lib = main.slice(main.indexOf('rsp.ambient_library = {'), main.indexOf('rsp.ambient_hub_map'));
    const sets = {};
    let cur = null;
    for (const line of lib.split('\n')) {
      const set = line.match(/'(\w+)': \[/);
      if (set) sets[(cur = set[1])] = [];
      const key = line.match(/music_map\['(\w+)'\]/);
      if (key && cur) sets[cur].push(key[1]);
    }
    assert.deepEqual(Object.fromEntries(library.map(([id, t]) => [id, t.gsjsKeys])), sets);
    const hubs = main.slice(main.indexOf('rsp.ambient_hub_map = {'));
    for (const [, hub, set] of hubs.slice(0, hubs.indexOf('};')).matchAll(/'(\d+)': '(\w+)'/g)) {
      assert.equal(cfg.hubMap[hub], set, `hub ${hub}`);
    }
  });

  it('the new sets have their hubs: Roobrik and Balzare, Kloro and Haoma, Jal and Samudra', () => {
    assert.equal(resolveAmbientTheme({ hubId: 126, hubName: 'Roobrik' }), 'urwok');
    assert.equal(resolveAmbientTheme({ hubId: 128 }), 'urwok');
    assert.equal(resolveAmbientTheme({ hubId: 131 }), 'kloro_haoma');
    assert.equal(resolveAmbientTheme({ hubId: 133 }), 'kloro_haoma');
    assert.equal(resolveAmbientTheme({ hubId: 136 }), 'jal');
    assert.equal(resolveAmbientTheme({ hubId: 140 }), 'jal');
  });

  it('a library plays as a playlist from its first track; stand-ins loop one (SoundMaster.as 491, 627-639)', () => {
    assert.deepEqual(ambientPlaylist('default', { hubId: 56 }), { tracks: tracksForTheme('default'), start: 0, loop: false });
    assert.equal(ambientPlaylist('ix').tracks.length, 18);
    // One-track sets loop (Hell, Kloro and Haoma).
    assert.deepEqual(ambientPlaylist('hell'), { tracks: ['assets/audio/ambient/Dirge-of-the-Damned_1291886020.mp3'], start: 0, loop: true });
    const subway = ambientPlaylist('subway', { hubId: 89 });
    assert.equal(subway.loop, true);
    assert.deepEqual(subway.tracks, [pickAmbientTrack('subway', { hubId: 89 })]);
  });

  it('stand-ins stay only where the originals are still missing', () => {
    for (const id of ['subway', 'enchanted', 'eesti', 'party_lively', 'rook', 'meditation']) {
      assert.ok(cfg.themes[id].tracks.some((t) => t.startsWith('assets/audio/ambient/') || /ROOK_|MEDITATIVE_ARTS_01/.test(t)), id);
    }
    for (const [id, theme] of library) assert.ok(theme.tracks.every((t) => /\/sfx\/|Dirge-of-the-Damned/.test(t)), id);
    for (const party of ['party_highlands', 'party_abysmal', 'party_holiday']) {
      assert.deepEqual(cfg.themes[party].tracks, [fileOf(cfg.themes[party].gsjsKeys[0])], party);
    }
  });
});
