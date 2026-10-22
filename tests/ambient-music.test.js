/**
 * Hub ambient music resolution (GSJS ambient_hub_map).
 * Run: node --test tests/ambient-music.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setAmbientMusicConfig,
  resolveAmbientTheme,
  tracksForTheme,
  pickAmbientTrack,
  themeLabel,
  allAmbientTrackUrls,
  SILENT_THEME,
} from '../public/js/ambient-music.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
    assert.match(tracksForTheme('street:TOXIC_MOON')[0], /moon_music/);
  });

  it('unknown music_file keys keep the default library', () => {
    assert.deepEqual(tracksForTheme('street:NO_SUCH_KEY'), tracksForTheme('default'));
  });

  it('a street whose music library is lost keeps its hub music', () => {
    // XAVIER_CARNIVOROUS_PLANTS (36 streets) was never recovered.
    assert.equal(resolveAmbientTheme({ musicFile: 'XAVIER_CARNIVOROUS_PLANTS', hubId: '50' }), resolveAmbientTheme({ hubId: '50' }));
    assert.equal(resolveAmbientTheme({ musicFile: 'XAVIER_CARNIVOROUS_PLANTS', hubId: '50' }), 'caverns');
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
