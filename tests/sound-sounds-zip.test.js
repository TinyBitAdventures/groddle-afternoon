/**
 * Sounds.zip (2026-11-02): Tiny Speck's c2.glitch.bz sound files from a fan
 * re-upload, installed byte for byte (tools/sound/install-sounds-zip.mjs) and
 * catalogued as origin sounds-zip (build-sound-keys.mjs, tools/sound/sounds-zip-map.json).
 * Run: node --test tests/sound-sounds-zip.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUND_ALIASES, SOUND_FILES, SOUND_KEY_COUNTS } from '../public/js/sound-keys.js?v=c8a66499';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const map = JSON.parse(readFileSync(join(root, 'tools/sound/sounds-zip-map.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(pub, 'assets/content/sound-keys.json'), 'utf8')).keys;
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

describe('Sounds.zip originals', () => {
  it('names its source: the Drive file, its size and md5', () => {
    assert.equal(map.source.driveId, '1saaFXUb0RipE6xqA-EDRVXGrFlwLHmlT');
    assert.equal(map.source.md5, '1cba0c7f5fe42607efaf587ac8c8ff23');
    assert.equal(map.source.bytes, 507945424);
  });

  it('ships every mapped file byte for byte, under its key (HELL is the Dirge already shipped)', () => {
    for (const row of map.files) {
      const file = row.sameAs || `assets/audio/sfx/${row.key}.mp3`;
      assert.ok(existsSync(join(pub, file)), `${row.key}: run tools/sound/install-sounds-zip.mjs`);
      assert.equal(md5(join(pub, file)), row.md5, `${row.key} is not the zip's ${row.zip}`);
      assert.equal(SOUND_FILES[row.key], file, row.key);
      assert.equal(catalog[row.key].origin, 'sounds-zip', row.key);
      assert.equal(catalog[row.key].zipFile, row.zip, row.key);
    }
    assert.equal(map.files.find((r) => r.key === 'HELL').sameAs, 'assets/audio/ambient/Dirge-of-the-Damned_1291886020.mp3');
    assert.equal(SOUND_KEY_COUNTS.soundsZip, map.files.length);
    // The Wayback counts stay what the Wayback gave.
    assert.equal(SOUND_KEY_COUNTS.recoveredWayback, 38);
  });

  it('a music_map match is the url\'s own file, timestamp and all, unless marked as the nearest take', () => {
    const nearest = [];
    for (const row of map.files.filter((r) => r.match === 'music_map')) {
      if (row.nearest) {
        nearest.push(row.key);
        assert.match(catalog[row.key].doubt, /nearest surviving take/);
      } else {
        assert.ok(catalog[row.key].url.endsWith(`/${row.zip}`), `${row.key}: ${row.zip} vs ${catalog[row.key].url}`);
      }
    }
    assert.deepEqual(nearest.sort(), ['AMBIENT_URWOK5', 'FOREST_AMBIENT4']);
    // The client's own default urls (BootStrapController.as 824, 840).
    assert.equal(catalog.OPENING_SCREEN.zipFile, '1331738581-Opening_Screen_Chimes_1.1.mp3');
    assert.equal(catalog.FIRST_STREET_LOADING.zipFile, '1331167039-00._Street_Loading_1.2.mp3');
  });

  it('keys that share a music_map file borrow it; the Snappy whistle alias keeps its doubt', () => {
    for (const [alias, target] of Object.entries(map.aliases)) {
      assert.equal(SOUND_ALIASES[alias], target, alias);
      assert.equal(SOUND_FILES[alias], undefined, alias);
      if (alias !== 'HOME_STREET_GRODDLE_WHISTLE') assert.equal(catalog[alias].url, catalog[target].url, alias);
    }
    assert.match(catalog.HOME_STREET_GRODDLE_WHISTLE.doubt, /2012-08 re-upload/);
  });

  it('held files are not shipped: doubtful or unplayed name matches, and the withheld trumpets', () => {
    for (const row of map.held) {
      assert.ok(row.why, row.key);
      if (row.key !== 'OPENING_SCREEN') assert.equal(SOUND_FILES[row.key], undefined, row.key);
      assert.ok(!existsSync(join(pub, 'assets/audio/sfx', `${row.key}.mp3`)) || row.key === 'OPENING_SCREEN', row.key);
    }
    assert.ok(map.held.some((r) => r.key === 'MUSICBLOCK_TRUMPETS'));
    assert.ok(map.held.some((r) => r.key === 'READY'));
    // A name-only SFX match ships only where the game plays the key; each says where.
    for (const row of map.files.filter((r) => r.match === 'filename')) assert.ok(row.why, row.key);
  });
});
