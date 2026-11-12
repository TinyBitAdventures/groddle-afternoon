/**
 * The Still's sounds (items/still.js): the hopper lid on Distill, its own chime on
 * Collect, its done chime when it runs dry or fills up, all Tiny Speck's server files (tools/sound/sounds-zip-map.json). The
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
import { createInventory, countItem } from '../public/js/inventory.js?v=f49c8998';
import { bindToolInventory, copyForVerb, copyTags, createToolConditionState, setCopyTag } from '../public/js/tools.js?v=62b37c51';
import { resolveSound } from '../public/js/sound-board.js?v=7ff169eb';
import { SOUND_ALIASES, SOUND_FILES } from '../public/js/sound-keys.js?v=fb6ee553';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=f4a69cd2';
import { STILL, advanceStill, createStillState, stillStopsAt } from '../public/js/machines.js?v=112d1492';

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
    // finishWorking 400-418: one Hooch made; with another's worth in the hopper and room for it the
    // Still starts again, else it is done and rings: in a house for its owner standing there, on a
    // street for everyone there. No other line of the file plays the key.
    const done = src.slice(src.indexOf('function finishWorking()'), src.indexOf('function getContentCount()'));
    assert.match(done, /if \(this\.getHopperAmount\(\) >= this\.getHoochCost\(\) && this\.getHooch\(\) < this\.getMaxHooch\(\)\) \{\s*this\.startWorking\(\);\s*\} else \{/);
    assert.match(done, /if \(owner\.get_location\(\) == this\.container\) \{\s*owner\.announce_sound\('STILL_READY'\);/);
    assert.match(done, /this\.container\.announce_sound_to_all\('STILL_READY'\);/);
    assert.equal(src.split("'STILL_READY'").length - 1, 2);
    assert.match(src, /this\.apiSetTimer\('finishWorking', \(7\.0\/3\.0\) \* 60 \* 1000\);/);
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
      ['STILL_READY', null, '1322173657-Ready_1.1.mp3', '6eed2b3d673052cf'],
    ]) {
      // Its own file again, now the server's bytes. Collect is the same bytes as the machines' key plays;
      // the ready chime is the Still's alone (the machines play their own set's file).
      assert.equal(SOUND_ALIASES[key], undefined, key);
      assert.equal(SOUND_FILES[key], `assets/audio/sfx/${key}.mp3`, key);
      assert.equal(resolveSound(key).file, `assets/audio/sfx/${key}.mp3`);
      assert.equal(catalog[key].origin, 'sounds-zip', key);
      assert.equal(catalog[key].zipFile, zip, key);
      assert.equal(catalog[key].zipMatch, 'same-take', key);
      assert.match(catalog[key].why, /this take, [\d.]+ dB louder \(r 0\.9\d+\)/, key);
      assert.ok(sha256(SOUND_FILES[key]).startsWith(sha), `${key} sha256`);
      if (target) {
        assert.equal(sha256(SOUND_FILES[key]), sha256(SOUND_FILES[target]), `${key} and ${target}`);
        assert.equal(zipMap.files.find((r) => r.key === key).md5, zipMap.files.find((r) => r.key === target).md5);
      } else {
        assert.notEqual(sha256(SOUND_FILES[key]), sha256(SOUND_FILES.READY));
      }
      // The archive.org copy is accounted for as a duplicate of the server's file.
      assert.ok(!archiveMap.files.some((f) => f.key === key), `${key} is still an archive.org install`);
      const dup = archiveMap.duplicates.find((f) => f.sameAs === (target || key) && /^still-/.test(f.file));
      assert.ok(dup, `${key}: no duplicate row`);
      assert.match(dup.evidence, /r 0\.9\d+ with the c2 file/);
    }
  });

  it('a working Still knows when it will stop: out of grain, or full', () => {
    const t0 = 1_000_000;
    const at = (seed) => stillStopsAt(createStillState({ workingSince: t0, ...seed }));
    assert.equal(STILL.workMs, 140000);
    assert.equal(stillStopsAt(createStillState({ hopper: 500, hooch: 3 })), 0, 'an idle Still');
    assert.equal(at({ hopper: 14, hooch: 0 }), t0 + STILL.workMs);
    assert.equal(at({ hopper: 27, hooch: 0 }), t0 + STILL.workMs);
    assert.equal(at({ hopper: 28, hooch: 0 }), t0 + 2 * STILL.workMs);
    assert.equal(at({ hopper: 500, hooch: 0 }), t0 + 35 * STILL.workMs);
    // Full first: two more fit, however much is in the hopper.
    assert.equal(at({ hopper: 500, hooch: 48 }), t0 + 2 * STILL.workMs);
    // The same answer as counting it out, and the same part way through.
    for (const seed of [{ hopper: 14, hooch: 0 }, { hopper: 100, hooch: 0 }, { hopper: 500, hooch: 44 }, { hopper: 600, hooch: 0 }]) {
      const state = createStillState({ workingSince: t0, ...seed });
      const stop = stillStopsAt(state);
      advanceStill(state, stop - 1);
      assert.ok(state.workingSince, `${JSON.stringify(seed)} is still working a moment before`);
      assert.equal(stillStopsAt(state), stop, JSON.stringify(seed));
      advanceStill(state, stop);
      assert.equal(state.workingSince, 0, `${JSON.stringify(seed)} has stopped`);
    }
  });

  describe('the done chime', () => {
    const tick = (engine, now) => supplyFeature.onTick(16, now, engine);
    const seed = (engine, tag, at = 0) => setCopyTag(engine.toolState, 'still', at, tag);
    const t0 = 5_000_000;
    const stop = t0 + STILL.workMs;

    it('rings once, for the holder, at the moment the Still runs dry', () => {
      supplyFeature._reset();
      const engine = stillEngine({});
      seed(engine, { hopper: 14, hooch: 0, workingSince: t0 });
      tick(engine, t0 + 1000);
      tick(engine, stop - 300);
      assert.deepEqual(engine.played, []);
      tick(engine, stop + 20);
      assert.deepEqual(engine.played, [['STILL_READY', 0.55]]);
      // Its Hooch is counted and kept on the Still.
      assert.deepEqual(copyTags(engine.toolState, 'still')[0], { hopper: 0, hooch: 1, workingSince: 0 });
      for (const later of [stop + 400, stop + 1500, stop + 60000]) tick(engine, later);
      assert.equal(engine.played.length, 1);
      supplyFeature._reset();
    });

    it('rings when the Still fills up with grain to spare, and not between Hooches', () => {
      supplyFeature._reset();
      const engine = stillEngine({});
      seed(engine, { hopper: 100, hooch: 48, workingSince: t0 });
      tick(engine, t0 + 1000);
      // The 49th: it carries on, no chime.
      tick(engine, stop + 20);
      assert.deepEqual(engine.played, []);
      tick(engine, stop + STILL.workMs - 300);
      assert.deepEqual(engine.played, []);
      // The 50th: full.
      tick(engine, stop + STILL.workMs + 20);
      assert.deepEqual(engine.played, [['STILL_READY', 0.55]]);
      assert.deepEqual(copyTags(engine.toolState, 'still')[0], { hopper: 72, hooch: 50, workingSince: 0 });
      supplyFeature._reset();
    });

    it('still rings when a menu counted the Hooch first', () => {
      supplyFeature._reset();
      const engine = stillEngine({});
      seed(engine, { hopper: 14, hooch: 0, workingSince: t0 });
      tick(engine, stop - 300);
      // What opening the Still's menu just after the stop writes back (loadStill, storeStill).
      seed(engine, { hopper: 0, hooch: 1, workingSince: 0 });
      tick(engine, stop + 60);
      assert.deepEqual(engine.played, [['STILL_READY', 0.55]]);
      tick(engine, stop + 600);
      assert.equal(engine.played.length, 1);
      supplyFeature._reset();
    });

    it('a Still that stopped while the game was closed or asleep passes in silence', () => {
      supplyFeature._reset();
      // Closed: the first look comes long after.
      const closed = stillEngine({});
      seed(closed, { hopper: 14, hooch: 0, workingSince: t0 });
      tick(closed, stop + 3600000);
      assert.deepEqual(closed.played, []);
      assert.deepEqual(copyTags(closed.toolState, 'still')[0], { hopper: 0, hooch: 1, workingSince: 0 });
      supplyFeature._reset();
      // Asleep: seen working, then nothing until well after.
      const asleep = stillEngine({});
      seed(asleep, { hopper: 14, hooch: 0, workingSince: t0 });
      tick(asleep, stop - 5000);
      tick(asleep, stop + 2500);
      assert.deepEqual(asleep.played, []);
      supplyFeature._reset();
    });

    it('more grain or a Collect moves the moment; an idle or empty Still never rings', () => {
      supplyFeature._reset();
      const engine = stillEngine({});
      seed(engine, { hopper: 14, hooch: 0, workingSince: t0 });
      tick(engine, t0 + 1000);
      // Distilled again before it ran dry: one more Hooch's worth.
      seed(engine, { hopper: 28, hooch: 0, workingSince: t0 });
      tick(engine, stop + 20);
      assert.deepEqual(engine.played, []);
      tick(engine, stop + STILL.workMs + 20);
      assert.equal(engine.played.length, 1);
      supplyFeature._reset();
      const idle = stillEngine({});
      seed(idle, { hopper: 5, hooch: 2, workingSince: 0 });
      for (const now of [t0, t0 + 1000, stop + 20]) tick(idle, now);
      seed(idle, null);
      tick(idle, stop + 2000);
      assert.deepEqual(idle.played, []);
      // No Still in the pack: nothing to watch.
      const none = stillEngine({});
      none.inv = createInventory({ grain: 14 });
      tick(none, stop + 20);
      assert.deepEqual(none.played, []);
      supplyFeature._reset();
    });

    it('two Stills done at once ring one chime; a second Still on its own time rings its own', () => {
      supplyFeature._reset();
      const engine = stillEngine({ still: 2 });
      bindToolInventory(engine.toolState, engine.inv);
      assert.equal(copyTags(engine.toolState, 'still').length, 2);
      seed(engine, { hopper: 14, hooch: 0, workingSince: t0 }, 0);
      seed(engine, { hopper: 14, hooch: 7, workingSince: t0 }, 1);
      tick(engine, t0 + 1000);
      tick(engine, stop + 20);
      assert.deepEqual(engine.played, [['STILL_READY', 0.55]]);
      assert.deepEqual(copyTags(engine.toolState, 'still'), [{ hopper: 0, hooch: 1, workingSince: 0 }, { hopper: 0, hooch: 8, workingSince: 0 }]);
      supplyFeature._reset();
      const apart = stillEngine({ still: 2 });
      bindToolInventory(apart.toolState, apart.inv);
      seed(apart, { hopper: 14, hooch: 0, workingSince: t0 }, 0);
      seed(apart, { hopper: 14, hooch: 0, workingSince: t0 + 30000 }, 1);
      tick(apart, t0 + 31000);
      tick(apart, stop + 20);
      assert.equal(apart.played.length, 1);
      tick(apart, stop + 30020);
      assert.equal(apart.played.length, 2);
      supplyFeature._reset();
    });

    it('only the Still plays STILL_READY, and it is the chime of November 2011', () => {
      const dir = join(PUB, 'js/features');
      const users = readdirSync(dir).filter((f) => /'STILL_READY'/.test(readFileSync(join(dir, f), 'utf8')));
      assert.deepEqual(users, ['supply-feature.js']);
      assert.doesNotMatch(readFileSync(join(PUB, 'game.js'), 'utf8'), /'STILL_READY'/);
      assert.equal(catalog.STILL_READY.zipFile, '1322173657-Ready_1.1.mp3');
      assert.match(catalog.STILL_READY.why, /still\.js:413/);
      assert.doesNotMatch(catalog.STILL_READY.why, /does not have yet/);
    });
  });
});
