/**
 * Paced waits (js/pace.js PACED_WAITS, R21): one row each, and every copy of the wait reads it.
 *
 * rock_respawn (#521, Austin 2026-11-19): a mined-out rock reforms 8 min on in Glitch
 * (items/include/mining.js 422, apiSetTimerX('onRespawn', 1000 * 60 * (8 + extra_time))); the remake
 * takes 0.3 of that, 144 s. Five places use it across the three repos: solo mining (js/mining.js
 * mineRock), a visited home's rocks (js/yard-stock-mp.js), help-mining crews
 * (js/features/help-mine-feature.js), the realtime server (objects.go, from data/objects.json
 * rules.rockRespawnMs) and the site (src/HomeYard.php, from data/yard-verbs.json respawnMs, and its
 * fallback). This fails when any of them disagrees with the row.
 *
 * rock_respawn_extra (Austin 2026-11-19): Glitch added a random 0-16 min once more than 80 chunks were
 * taken since the rock reformed (mining.js 415-417), which in the remake is a 150-chunk mega rock; at
 * 0.3 that is 0-288 s more. Solo mining, help-mining crews (both js/mining.js crumbleRock) and the
 * realtime server (objects.go rockRespawnAfter, from rules.rockRespawnExtra) add it; a visited home
 * and the site have no mega rocks.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { PACED_WAITS, ROCK_RESPAWN_EXTRA_AFTER, ROCK_RESPAWN_EXTRA_MS, ROCK_RESPAWN_MS, pacedWaitMs, rockRespawnMs } from '../public/js/pace.js?v=c07dfbd8';
import { createMineRock, crumbleRock, mineRock, rockChunksTaken, tickMineRock } from '../public/js/mining.js?v=29eaf67f';
import { ROCK_RESPAWN_MS as YARD_ROCK_RESPAWN_MS, applyStockAct } from '../public/js/yard-stock-mp.js?v=59fb1980';
import { createInventory } from '../public/js/inventory.js?v=6414dbdc';
import { ruleTables } from '../tools/build-realtime-objects.mjs';
import { serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const game = (rel) => readFileSync(new URL(`../public/js/${rel}`, import.meta.url), 'utf8');

describe('paced waits read one row (js/pace.js PACED_WAITS)', () => {
  it('the rock row: Glitch 480 s at 0.3 is 144 s, ruled by Austin for #521', () => {
    assert.deepEqual({ ...PACED_WAITS.rock_respawn }, { glitchMs: 480000, factor: 0.3, ruling: 'Austin 2026-11-19, #521' });
    assert.equal(pacedWaitMs('rock_respawn'), 144000);
    assert.equal(ROCK_RESPAWN_MS, 144000);
    assert.throws(() => pacedWaitMs('no_such_wait'));
  });

  it('solo mining: a cleared rock reforms ROCK_RESPAWN_MS on, not a ms sooner', () => {
    const rock = createMineRock('rock_sparkly_1', { chunksRemaining: 3 });
    const r = mineRock(rock, createInventory({ pick: 1 }), { energy: 100, imagination: 0, xp: 0 }, {
      learned: ['mining_1'], requireSkill: true, rng: () => 0.99, now: 1000,
    });
    assert.equal(r.cleared, true);
    assert.equal(rock.respawnAt, 1000 + ROCK_RESPAWN_MS);
    assert.equal(tickMineRock(rock, 1000 + ROCK_RESPAWN_MS - 1), false);
    assert.equal(tickMineRock(rock, 1000 + ROCK_RESPAWN_MS), true);
    assert.doesNotMatch(game('mining.js'), /respawnAt\s*=\s*[^;\n]*\b\d{4,}\b/, 'no hand-typed respawn time in mining.js');
  });

  it('a visited home\'s rock and a help-mining crew take the same number', () => {
    assert.equal(YARD_ROCK_RESPAWN_MS, ROCK_RESPAWN_MS);
    const rocks = [{ classId: 'rock_metal_1', rock: { classTsid: 'rock_metal_1', chunksRemaining: 3, chunksMax: 50, depleted: false, respawnAt: 0 } }];
    const items = [{ id: 1, protoClass: 'proto_metal_rock', endClass: 'rock_metal_2', rx: -300, wear: 0 }];
    const b = applyStockAct({ rocks, nodes: {}, items }, { kind: 'rock', target: 'rock:0', verb: 'mine', took: 3, at: 2000 }, 2000);
    assert.equal(b.rock.depleted, true);
    assert.equal(b.rock.respawnAt, 2000 + ROCK_RESPAWN_MS);
    assert.match(game('yard-stock-mp.js'), /import \{ ROCK_RESPAWN_MS \} from '\.\/pace\.js/);
    const help = game('features/help-mine-feature.js');
    // A crew's last bonus empties the rock as a swing does: js/mining.js crumbleRock.
    assert.match(help, /crumbleRock\(rock, engine\.pc\?\.imaginationUpgrades \|\| \[\]\);/);
    assert.doesNotMatch(help, /respawnAt\s*=/, 'help-mine-feature.js sets no respawn time of its own');
    assert.doesNotMatch(help, /RESPAWN_MS\s*=\s*\d/, 'no hand-typed respawn time in help-mine-feature.js');
  });

  it('the mega rock row: Glitch 0-960 s more at 0.3 is 0-288 s, past 80 chunks taken', () => {
    assert.deepEqual({ ...PACED_WAITS.rock_respawn_extra }, { glitchMs: 960000, factor: 0.3, ruling: 'Austin 2026-11-19' });
    assert.equal(ROCK_RESPAWN_EXTRA_MS, 288000);
    assert.equal(ROCK_RESPAWN_EXTRA_AFTER, 80);
    const never = () => assert.fail('an ordinary rock draws no roll for the extra');
    assert.equal(rockRespawnMs(80, never), ROCK_RESPAWN_MS);
    assert.equal(rockRespawnMs(54, never), ROCK_RESPAWN_MS);
    assert.equal(rockRespawnMs(81, () => 0), ROCK_RESPAWN_MS);
    assert.equal(rockRespawnMs(150, () => 0.5), ROCK_RESPAWN_MS + 144000);
    assert.equal(rockRespawnMs(150, () => 0.999999), ROCK_RESPAWN_MS + 288000);
  });

  it('solo mining: a mega rock mined out waits the extra, a plain one does not', () => {
    const rolls = (...xs) => () => xs.shift();
    // A mega rock (150, rock.mega) down to its last 3: a swing of 3 + 4 * 0.5 = 5 clears it, 152 taken.
    const mega = createMineRock('rock_sparkly_1', { chunksRemaining: 3 });
    mega.mega = true;
    assert.equal(rockChunksTaken(mega), 147);
    // Rolls (Mining I has no gem roll): chunks 0.5, next mega 0.99 (no), the extra 0.25 (72 s).
    const r = mineRock(mega, createInventory({ pick: 1 }), { energy: 100 }, {
      learned: ['mining_1'], requireSkill: true, rng: rolls(0.5, 0.99, 0.25), now: 1000,
    });
    assert.equal(r.cleared, true);
    assert.equal(mega.respawnAt, 1000 + ROCK_RESPAWN_MS + 72000);
    assert.equal(tickMineRock(mega, mega.respawnAt - 1), false);
    assert.equal(tickMineRock(mega, mega.respawnAt), true);
    assert.equal(mega.mega, false, 'it came back plain');
    // The same last swing on a plain 50-chunk rock: 52 taken, no roll for the extra.
    const plain = createMineRock('rock_sparkly_1', { chunksRemaining: 3 });
    mineRock(plain, createInventory({ pick: 1 }), { energy: 100 }, {
      learned: ['mining_1'], requireSkill: true, rng: rolls(0.5, 0.99), now: 1000,
    });
    assert.equal(plain.respawnAt, 1000 + ROCK_RESPAWN_MS);
    // A crew's bonus that empties a mega rock: crumbleRock, the same wait.
    const crew = createMineRock('rock_beryl_1', { chunksRemaining: -2 });
    crew.mega = true;
    crumbleRock(crew, [], { now: 5, rng: rolls(0.99, 1) });
    assert.equal(crew.respawnAt, 5 + ROCK_RESPAWN_MS + ROCK_RESPAWN_EXTRA_MS);
    assert.equal(crew.chunksRemaining, 0);
  });

  it('the realtime server reads rules.rockRespawnMs, which is the pace row', { skip: skipWithoutServer }, () => {
    const trants = JSON.parse(readFileSync(new URL('../public/assets/content/trants.json', import.meta.url), 'utf8'));
    assert.equal(ruleTables(trants).rockRespawnMs, ROCK_RESPAWN_MS);
    const objects = JSON.parse(readFileSync(serverPath('data', 'objects.json'), 'utf8'));
    assert.equal(objects.rules.rockRespawnMs, ROCK_RESPAWN_MS, 'data/objects.json is stale: node tools/build-realtime-objects.mjs');
    const go = readFileSync(serverPath('objects.go'), 'utf8');
    assert.doesNotMatch(go, /\brockRespawn\s*=/, 'no hand-typed rockRespawn constant');
    assert.match(go, /o\.schedule\(street, ob, o\.w\.rockRespawnAfter\(sinceReformed, o\.roll\), o\.respawnRock\)/);
    assert.deepEqual(ruleTables(trants).rockRespawnExtra, { ms: ROCK_RESPAWN_EXTRA_MS, after: ROCK_RESPAWN_EXTRA_AFTER });
    assert.deepEqual(objects.rules.rockRespawnExtra, { ms: ROCK_RESPAWN_EXTRA_MS, after: ROCK_RESPAWN_EXTRA_AFTER }, 'data/objects.json is stale');
    // objects_test.go pins the same number so a pace change shows up in the server's own tests.
    const goTest = readFileSync(serverPath('objects_test.go'), 'utf8');
    const pinned = Number(goTest.match(/rockRespawn\(\); got != (\d+)\*time\.Second/)?.[1]) * 1000;
    assert.equal(pinned, ROCK_RESPAWN_MS);
    // ... and the mega rock's extra: roll 1 at 81 chunks is the whole of it.
    const pinnedMax = Number(goTest.match(/rockRespawnAfter\(81, func\(\) float64 \{ return 1 \}\); got != (\d+)\*time\.Second/)?.[1]) * 1000;
    assert.equal(pinnedMax, ROCK_RESPAWN_MS + ROCK_RESPAWN_EXTRA_MS);
  });

  it('the site reads respawnMs from data/yard-verbs.json, and its fallback is the same', { skip: skipWithoutSite }, () => {
    const verbs = JSON.parse(readFileSync(sitePath('data', 'yard-verbs.json'), 'utf8'));
    assert.equal(verbs.respawnMs, ROCK_RESPAWN_MS, 'data/yard-verbs.json is stale: node tools/build-yard-verbs.mjs');
    const php = readFileSync(sitePath('src', 'HomeYard.php'), 'utf8');
    const fallbacks = [...php.matchAll(/\$rules\['respawnMs'\]\s*\?\?\s*(\d+)/g)].map((m) => Number(m[1]));
    assert.deepEqual(fallbacks, [ROCK_RESPAWN_MS]);
  });
});
