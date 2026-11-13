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
import { SOUND_ALIASES, SOUND_FILES, SOUND_KEY_COUNTS } from '../public/js/sound-keys.js?v=d6b20718';

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
    // READY left the held list on 2026-11-10: the machines play it when a job is done (tests/sound.test.js).
    assert.ok(!map.held.some((r) => r.key === 'READY'));
    assert.equal(map.files.find((r) => r.key === 'READY').zip, '1302286275-ready_30.mp3');
    // The later file of the same name is the Still's chime only.
    assert.deepEqual(map.files.filter((r) => r.zip === '1322173657-Ready_1.1.mp3').map((r) => r.key), ['STILL_READY']);
    // A name-only SFX match ships only where the game plays the key; each says where.
    for (const row of map.files.filter((r) => r.match === 'filename')) assert.ok(row.why, row.key);
  });

  it('the star notes and chords: LITTLE_STAR_1-19 and BIG_STAR_1-12 in upload order, the Uralia stars held without a key', () => {
    // 2012-06-21: 19 notes C1..C4 (C D E G A B per octave, measured C4..C7) and 12 triads CM1..CM3.
    const notes = ['C1', 'D1', 'E1', 'G1', 'A1', 'B1', 'C2', 'D2', 'E2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'G3', 'A3', 'B3', 'C4'];
    notes.forEach((n, i) => {
      assert.match(catalog[`LITTLE_STAR_${i + 1}`].zipFile, new RegExp(`^134\\d+-${n}\\.mp3$`), `LITTLE_STAR_${i + 1}`);
      assert.equal(catalog[`LITTLE_STAR_${i + 1}`].zipMatch, 'note-set');
    });
    const chords = ['CM1', 'Dm1', 'Em1', 'GM1', 'Am1', 'CM2', 'Dm2', 'Em2', 'FM2', 'GM2', 'Am2_corrected', 'CM3'];
    chords.forEach((c, i) => assert.match(catalog[`BIG_STAR_${i + 1}`].zipFile, new RegExp(`^134\\d+-${c}\\.mp3$`), `BIG_STAR_${i + 1}`));
    // The zip's uploads run in key order: each note and chord after the one before.
    const ts = (k) => Number(catalog[k].zipFile.split('-')[0]);
    for (let n = 2; n <= 19; n += 1) assert.ok(ts(`LITTLE_STAR_${n}`) > ts(`LITTLE_STAR_${n - 1}`), `LITTLE_STAR_${n}`);
    for (let n = 2; n <= 10; n += 1) assert.ok(ts(`BIG_STAR_${n}`) > ts(`BIG_STAR_${n - 1}`), `BIG_STAR_${n}`);
    // Uralia_Big_Star 1-3 are not BIG_STAR_1-3 (Radial Heights, 2012-08, plays the chords): held, no key.
    const uralia = map.held.filter((r) => /Uralia_Big_Star/.test(r.zip)).map((r) => r.key).sort();
    assert.deepEqual(uralia, ['URALIA_BIG_STAR_1', 'URALIA_BIG_STAR_2', 'URALIA_BIG_STAR_3']);
    for (const k of uralia) assert.equal(catalog[k], undefined, k);
  });

  it('COMEDIAN, INTERACT_DISPATCHER, STAND1 and CARD_DEAL1-3 ship; the client never dealt a fourth card', () => {
    assert.equal(catalog.COMEDIAN.zipFile, '1316228012-Laugh_3_.mp3');
    assert.equal(catalog.INTERACT_DISPATCHER.zipFile, '1308718626-Interact.mp3');
    assert.equal(catalog.STAND1.zipFile, '1302285923-blockmaker_base_30.mp3');
    for (const n of [1, 2, 3]) assert.match(catalog[`CARD_DEAL${n}`].zipFile, new RegExp(`card_deal_${n}\\.`));
    // ImaginationHandUI.as 493 plays CARD_DEAL<slot+1>; inc_imagination.js 497 deals three slots.
    for (const n of [4, 5, 6, 7]) assert.equal(catalog[`CARD_DEAL${n}`], undefined, `CARD_DEAL${n}`);
    // Round 8: Le Miserable's switches; the rainbow and triple jump takes match what already ships, so they wait.
    assert.equal(catalog.TEST_SOUND.zipFile, '1308092086-Test_1.1.mp3');
    for (const k of ['RAINBOW_70F', 'RAINBOW_75F', 'TRIPLE_JUMP_1_4']) assert.ok(map.held.some((r) => r.key === k), k);
    assert.equal(catalog.RAINBOW_RANDOMKINDNESS.alias, 'RAINBOW_SUPERHARVEST');
    assert.equal(catalog.TRIPLE_JUMP.file, 'assets/audio/triple_jump.mp3');
    assert.equal(catalog.OPENING_SCREEN.zipFile, '1331738581-Opening_Screen_Chimes_1.1.mp3');
  });

  it('the remake plays them where the original does', () => {
    const img = readFileSync(join(pub, 'js/features/imagination-feature.js'), 'utf8');
    assert.match(img, /CARD_DEAL\$\{slot \+ 1\}/);
    assert.doesNotMatch(img, /play\('CARD_DEAL1'\)/);
    const supply = readFileSync(join(pub, 'js/features/supply-feature.js'), 'utf8');
    assert.match(supply, /machine_stand\.js 693[^\n]*\n\s*engine\.playSound\?\.\('STAND1'\)/);
    const mail = readFileSync(join(pub, 'js/features/mail-courier-feature.js'), 'utf8');
    assert.match(mail, /playSound\?\.\('INTERACT_DISPATCHER'/);
  });
});
