/**
 * The Still's sounds (items/still.js): the hopper lid on Distill, its own chime on
 * Collect, both Tiny Speck's server files (tools/sound/sounds-zip-map.json). The
 * Still's two keys used to play archive.org copies of the same takes; they now
 * play the server's own files, and the copies are listed as duplicates.
 * Run: node --test tests/still-sounds.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventory, countItem } from '../public/js/inventory.js?v=60dfc9ca';
import { copyForVerb, createToolConditionState, setCopyTag } from '../public/js/tools.js?v=5f482998';
import { resolveSound } from '../public/js/sound-board.js?v=1a35b1da';
import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js?v=df36f0cf';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=b16b4654';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const STILL_JS = join(ROOT, '..', 'glitch-GameServerJS', 'items', 'still.js');
const skipWithoutSource = existsSync(STILL_JS) ? false : 'needs tinyspeck/glitch-GameServerJS beside the game';
const zipMap = JSON.parse(readFileSync(join(ROOT, 'tools/sound/sounds-zip-map.json'), 'utf8'));
const archiveMap = JSON.parse(readFileSync(join(ROOT, 'tools/sound/archiveorg-sfx-map.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(PUB, 'assets/content/sound-keys.json'), 'utf8')).keys;
const sha256 = (rel) => createHash('sha256').update(readFileSync(join(PUB, rel))).digest('hex');

function stillEngine(items, skills = ['distilling_1']) {
  const played = [];
  return {
    played,
    inv: createInventory({ still: 1, ...items }),
    pc: { energy: 100, imaginationUpgrades: [] },
    toolState: createToolConditionState(),
    learnedSkills: skills,
    param: () => null,
    playSound: (key, opts) => played.push([key, opts?.volume]),
  };
}

describe('the Still\'s sounds', () => {
  it('Distill opens the hopper lid; Collect rings the Still\'s chime', () => {
    supplyFeature._reset();
    const engine = stillEngine({ grain: 14 });
    assert.equal(supplyFeature.runPackVerb('still', 'distill:grain', engine), true);
    assert.equal(countItem(engine.inv, 'grain'), 0);
    assert.deepEqual(engine.played, [['FUELMAKER_LOAD_OPEN', undefined]]);
    // Nothing to collect yet: no chime.
    supplyFeature.runPackVerb('still', 'collect', engine);
    assert.equal(engine.played.length, 1);
    // A Still with three Hooch waiting (kept on the Still's own copy, as the feature keeps it).
    supplyFeature._reset();
    const ready = stillEngine({});
    setCopyTag(ready.toolState, 'still', copyForVerb(ready.toolState, 'still', null), { hopper: 0, hooch: 3, workingSince: 0 });
    assert.equal(supplyFeature.runPackVerb('still', 'collect', ready), true);
    assert.equal(countItem(ready.inv, 'hooch'), 3);
    assert.deepEqual(ready.played, [['STILL_COLLECT', 0.6]]);
    supplyFeature._reset();
  });

  it('a Distill that does not happen makes no sound', () => {
    supplyFeature._reset();
    const engine = stillEngine({ grain: 14 }, []);
    supplyFeature.runPackVerb('still', 'distill:grain', engine);
    assert.equal(countItem(engine.inv, 'grain'), 14);
    assert.deepEqual(engine.played, []);
    supplyFeature._reset();
  });

  it('the source plays those keys at those moments (items/still.js)', { skip: skipWithoutSource }, () => {
    const src = readFileSync(STILL_JS, 'utf8');
    const verb = (name) => src.slice(src.indexOf(`verbs.${name} = {`), src.indexOf('\n};', src.indexOf(`verbs.${name} = {`)));
    assert.match(verb('distill'), /pc\.announce_sound\('FUELMAKER_LOAD_OPEN'\)/);
    assert.match(verb('collect'), /pc\.announce_sound\('STILL_COLLECT'\)/);
    assert.match(src, /function finishWorking\(\)[\s\S]*?announce_sound\('STILL_READY'\)/);
  });

  it('the hopper lid is the server\'s own file, byte for byte', () => {
    const row = zipMap.files.find((r) => r.key === 'FUELMAKER_LOAD_OPEN');
    assert.equal(row.zip, '1302286163-fuelmaker_loadopen_30.mp3');
    assert.match(row.why, /still\.js:370/);
    assert.equal(SOUND_FILES.FUELMAKER_LOAD_OPEN, 'assets/audio/sfx/FUELMAKER_LOAD_OPEN.mp3');
    assert.ok(sha256(SOUND_FILES.FUELMAKER_LOAD_OPEN).startsWith('e0377d87901cb282'));
    assert.equal(catalog.FUELMAKER_LOAD_OPEN.origin, 'sounds-zip');
  });

  it('the Still\'s collect and ready keys play the server\'s own takes, not the archive.org copies', () => {
    for (const [key, target, zip, sha] of [
      ['STILL_COLLECT', 'COLLECT', '1322173667-Collect_1.3.mp3', 'c699227f04c1cd1f'],
      ['STILL_READY', 'READY', '1322173657-Ready_1.1.mp3', '6eed2b3d673052cf'],
    ]) {
      // Its own file again, now the server's bytes: the same bytes as the machines' key plays.
      assert.equal(SOUND_ALIASES[key], undefined, key);
      assert.equal(SOUND_FILES[key], `assets/audio/sfx/${key}.mp3`, key);
      assert.equal(resolveSound(key).file, `assets/audio/sfx/${key}.mp3`);
      assert.equal(catalog[key].origin, 'sounds-zip', key);
      assert.equal(catalog[key].zipFile, zip, key);
      assert.equal(catalog[key].zipMatch, 'same-take', key);
      assert.match(catalog[key].why, /this take, [\d.]+ dB louder \(r 0\.9\d+\)/, key);
      assert.ok(sha256(SOUND_FILES[key]).startsWith(sha), `${key} sha256`);
      assert.equal(sha256(SOUND_FILES[key]), sha256(SOUND_FILES[target]), `${key} and ${target}`);
      assert.equal(zipMap.files.find((r) => r.key === key).md5, zipMap.files.find((r) => r.key === target).md5);
      // The archive.org copy is accounted for as a duplicate of the server's file.
      assert.ok(!archiveMap.files.some((f) => f.key === key), `${key} is still an archive.org install`);
      const dup = archiveMap.duplicates.find((f) => f.sameAs === target && /^still-/.test(f.file));
      assert.ok(dup, `${key}: no duplicate row`);
      assert.match(dup.evidence, /r 0\.9\d+ with the c2 file/);
    }
  });

  it('STILL_READY has no moment yet: the remake\'s Still never announces that it is done', () => {
    const dir = join(PUB, 'js/features');
    const users = readdirSync(dir).filter((f) => /'STILL_READY'/.test(readFileSync(join(dir, f), 'utf8')));
    assert.deepEqual(users, []);
    assert.doesNotMatch(readFileSync(join(PUB, 'game.js'), 'utf8'), /'STILL_READY'/);
  });
});
