/**
 * HERDCAP (Austin 2026-11-09): an owner's home-street animals as anyone else
 * is shown them. The owner's save is their own game's (G335) and only that
 * game keeps the crowding limit (config_prod.js population_controls
 * 1205-1221, animal_sadness.js getSadnessMax 126-151), so the site's
 * src/HomeYard.php animalRows and the visitor's js/yard-verbs-mp.js
 * normalizeYardView keep at most the limit of each class (js/animal-crowding.js
 * yardClassCap, capYardAnimals), and a visitor's verb on one past it is refused.
 * The saves here are made up.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CROWD_CARDS,
  POPULATION_CONTROLS,
  YARD_CAP_OURS,
  YARD_CAP_SCAN,
  capYardAnimals,
  sadnessMax,
  yardClassCap,
} from '../public/js/animal-crowding.js?v=78ad8fa9';
import { normalizeYardView, visitorHerdCap, yardStreetWidth } from '../public/js/yard-verbs-mp.js?v=76bac0a5';
import { homeStreetLayout, normalizeCultivationState } from '../public/js/home-cultivation.js?v=9571e110';
import { normalizeHusbandrySlot } from '../public/js/features/animal-husbandry-feature.js?v=1b6de9c7';
import { HAS_SITE, SITE_DIR, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(body) {
  const code = `foreach (["HomePool", "HomeYard"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\HomeYard as Y; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code], { maxBuffer: 64 * 1024 * 1024 }).toString());
}

const row = (n, classId) => ({ id: `a${n}`, classId, x: 100 + n, homeX: 100 + n, state: {} });
const herd = (classId, ids) => ids.map((n) => row(n, classId));
const ids = (rows) => rows.map((r) => r.id);
/** A made-up owner's save with these yard animals, street cultivation and cards. */
function ownerSave(animals, { cult = {}, upgrades = [] } = {}) {
  return {
    player: { imaginationUpgrades: upgrades },
    systems: { home: { owned: true }, features: { homes: { cult: { items: [], ...cult } } } },
    world: { streets: { RH_HOME_EXT: { features: { 'animal-husbandry': { animals } } } } },
  };
}

describe('the cap per class is the source limit for the home street (POL, not halved)', () => {
  it('the street is as wide as the owner\'s game draws it', () => {
    for (const cult of [{}, { yardLeft: 4 }, { yardLeft: 17, yardRight: 12 }, { yardLeft: 2, yardRight: 9 }]) {
      assert.equal(yardStreetWidth(cult), homeStreetLayout(normalizeCultivationState(cult)).width);
    }
    // Expansions past the owner's game's limits count as its limits; junk counts as none.
    assert.equal(yardStreetWidth({ yardLeft: 9999, yardRight: -5 }), homeStreetLayout(normalizeCultivationState({ yardLeft: 9999, yardRight: -5 })).width);
    assert.equal(yardStreetWidth({ yardLeft: [5], yardRight: 'lots' }), yardStreetWidth({}));
  });
  it('a new home street: 18 Piggies, 8 Chickens, 8 Butterflies; the widest 40 / 20 / 20', () => {
    const w = yardStreetWidth({});
    assert.equal(w, 2370);
    assert.deepEqual(['npc_piggy', 'npc_chicken', 'npc_butterfly'].map((c) => yardClassCap(c, { width: w })), [18, 8, 8]);
    const wide = yardStreetWidth({ yardLeft: 17, yardRight: 12 });
    assert.deepEqual(['npc_piggy', 'npc_chicken', 'npc_butterfly'].map((c) => yardClassCap(c, { width: wide })), [40, 20, 20]);
    assert.equal(yardClassCap('npc_piggy', { width: w }), sadnessMax('npc_piggy', { width: w, pol: true }));
    assert.equal(sadnessMax('npc_piggy', { width: w }), 9, 'a public street halves it; a home street does not');
  });
  it('the owner\'s herdkeeping cards: +10% / +20%, the best one; a reader who cannot see them allows +20%', () => {
    const wide = yardStreetWidth({ yardLeft: 17, yardRight: 12 });
    assert.equal(yardClassCap('npc_piggy', { width: wide, upgrades: ['herdkeeping_animal_sadness_1'] }), 44);
    assert.equal(yardClassCap('npc_piggy', { width: wide, upgrades: ['herdkeeping_animal_sadness_1', 'herdkeeping_animal_sadness_2'] }), 48);
    assert.equal(yardClassCap('npc_chicken', { width: wide, upgrades: ['herdkeeping_animal_sadness_2'] }), 24);
    assert.equal(yardClassCap('npc_chicken', { width: wide, ceiling: true }), 24);
    assert.equal(visitorHerdCap({})('npc_piggy'), 22, '18 + round(3.6)');
  });
  it('Batterflies (no limit in the source), the babies and any other class: ours, 40', () => {
    for (const c of ['npc_batterfly', 'piglet', 'chick', 'caterpillar', 'npc_fox']) {
      assert.equal(yardClassCap(c, { width: 6720, upgrades: ['herdkeeping_animal_sadness_2'] }), YARD_CAP_OURS);
    }
    assert.equal(YARD_CAP_OURS, 40);
  });
});

describe('which animals are kept (js/animal-crowding.js capYardAnimals)', () => {
  const caps = (c) => yardClassCap(c, { width: 2370 });
  it('a save under the cap is shown as it is', () => {
    const rows = [...herd('npc_piggy', [3, 1, 7]), ...herd('npc_chicken', [2, 5]), row(4, 'npc_butterfly')];
    assert.deepEqual(capYardAnimals(rows, caps), rows);
    assert.deepEqual(capYardAnimals([], caps), []);
    assert.deepEqual(capYardAnimals(null, caps), []);
  });
  it('over the cap: the lowest ids of each class, in their saved order, whatever order the save holds them in', () => {
    const piggies = herd('npc_piggy', Array.from({ length: 30 }, (_, i) => i + 1));
    const chickens = herd('npc_chicken', Array.from({ length: 12 }, (_, i) => 100 + i));
    const shuffled = [...piggies, ...chickens].sort((a, b) => ((Number(a.id.slice(1)) * 7919) % 101) - ((Number(b.id.slice(1)) * 7919) % 101));
    const kept = capYardAnimals(shuffled, caps);
    assert.equal(kept.filter((r) => r.classId === 'npc_piggy').length, 18);
    assert.equal(kept.filter((r) => r.classId === 'npc_chicken').length, 8);
    assert.deepEqual(ids(kept.filter((r) => r.classId === 'npc_piggy')).sort(), ids(piggies.slice(0, 18)).sort());
    assert.deepEqual(ids(kept.filter((r) => r.classId === 'npc_chicken')).sort(), ids(chickens.slice(0, 8)).sort());
    assert.deepEqual(ids(kept), ids(shuffled.filter((r) => kept.includes(r))), 'saved order');
    assert.deepEqual(ids(capYardAnimals(shuffled, caps)), ids(kept), 'the same every load');
  });
  it('babies and Batterflies stop at our 40', () => {
    const rows = [...herd('piglet', Array.from({ length: 50 }, (_, i) => i + 1)), ...herd('npc_batterfly', Array.from({ length: 45 }, (_, i) => 200 + i))];
    const kept = capYardAnimals(rows, caps);
    assert.equal(kept.filter((r) => r.classId === 'piglet').length, 40);
    assert.equal(kept.filter((r) => r.classId === 'npc_batterfly').length, 40);
    assert.equal(kept.at(-1).id, 'a239');
  });
  it('a repeated id counts once (the first); rows with no a<n> id or class go', () => {
    const rows = [row(1, 'npc_piggy'), { ...row(1, 'npc_piggy'), x: 9 }, { id: 'b2', classId: 'npc_piggy' }, { id: 'a3' }, 'a4', null, row(5, 'npc_piggy')];
    assert.deepEqual(capYardAnimals(rows, caps).map((r) => [r.id, r.x]), [['a1', 101], ['a5', 105]]);
  });
  it(`only the first ${YARD_CAP_SCAN} rows are read; 10,000 rows cost next to nothing`, () => {
    const big = herd('npc_piggy', Array.from({ length: 10000 }, (_, i) => 10000 - i));
    const t0 = performance.now();
    const kept = capYardAnimals(big, caps);
    const ms = performance.now() - t0;
    assert.equal(kept.length, 18);
    assert.equal(kept.at(-1).id, 'a9701', 'the lowest ids of the first 300 rows');
    assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
  });
});

describe('a visitor\'s game draws no more than the cap (normalizeYardView)', () => {
  const answer = (animals, cult = {}) => ({ owner: 7, name: 'Pemberly', cult, patches: [], animals, sticks: [], mine: {} });
  it('under the cap: every animal', () => {
    const rows = herd('npc_piggy', [1, 2, 3, 4]);
    assert.deepEqual(ids(normalizeYardView(answer(rows)).animals), ['a1', 'a2', 'a3', 'a4']);
  });
  it('over: the Super Happy Animals ceiling of the owner\'s street, oldest first', () => {
    const rows = [...herd('npc_piggy', Array.from({ length: 60 }, (_, i) => 60 - i)), ...herd('npc_butterfly', Array.from({ length: 30 }, (_, i) => 100 + i))];
    const view = normalizeYardView(answer(rows));
    assert.equal(view.animals.filter((a) => a.classId === 'npc_piggy').length, 22);
    assert.equal(view.animals.filter((a) => a.classId === 'npc_butterfly').length, 10);
    assert.deepEqual(ids(view.animals.filter((a) => a.classId === 'npc_piggy')).sort(), Array.from({ length: 22 }, (_, i) => `a${i + 1}`).sort());
    const wide = normalizeYardView(answer(rows, { yardLeft: 17, yardRight: 12 }));
    assert.equal(wide.animals.filter((a) => a.classId === 'npc_piggy').length, 48);
  });
});

describe('the owner\'s own home is untouched', () => {
  it('the owner\'s game keeps every animal of its own save (no cap on the owner\'s path)', () => {
    const rows = herd('npc_piggy', Array.from({ length: 30 }, (_, i) => i + 1));
    assert.equal(normalizeHusbandrySlot({ animals: rows.map((r) => ({ ...r })) }).animals.length, 30);
  });
  it('only the visitor paths call the cap', () => {
    const feature = readFileSync(join(root, 'public/js/features/animal-husbandry-feature.js'), 'utf8');
    assert.doesNotMatch(feature, /capYardAnimals/);
    const verbs = readFileSync(join(root, 'public/js/yard-verbs-mp.js'), 'utf8');
    assert.match(verbs, /const animals = capYardAnimals\(answer\.animals, visitorHerdCap\(plain\(answer\.cult\)\)\)/);
  });
});

describe('the site caps first (src/HomeYard.php animalRows)', { skip: skipSite }, () => {
  it('data/yard-verbs.json "crowd" carries the game\'s numbers', () => {
    assert.equal(spawnSync('node', ['tools/build-yard-verbs.mjs', '--check'], { cwd: root }).status, 0);
    const crowd = JSON.parse(readFileSync(sitePath('data', 'yard-verbs.json'), 'utf8')).crowd;
    for (const [c, v] of Object.entries(POPULATION_CONTROLS)) assert.deepEqual(crowd.controls[c], [v.perWidth, v.minMax, v.maxMax]);
    assert.deepEqual(crowd.cards, CROWD_CARDS.map((c) => [c.id, c.share]));
    assert.equal(crowd.ours, YARD_CAP_OURS);
    assert.equal(crowd.scan, YARD_CAP_SCAN);
  });
  const rowsOf = (save) => php(`$s = json_decode(${JSON.stringify(JSON.stringify(save))}); echo json_encode(array_map(fn ($r) => $r->id, Y::animalRows($s)));`);
  it('under the cap: every animal, in its saved order', () => {
    const rows = [...herd('npc_piggy', [3, 1, 7]), ...herd('npc_chicken', [2, 5]), row(4, 'npc_butterfly')];
    assert.deepEqual(rowsOf(ownerSave(rows)), ids(rows));
  });
  it('over the cap: the same animals the game keeps, from the owner\'s street width and cards', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    const classes = ['npc_piggy', 'npc_chicken', 'npc_butterfly'];
    for (const [cult, upgrades] of [[{}, []], [{ yardLeft: 9 }, ['herdkeeping_animal_sadness_1']], [{ yardLeft: 17, yardRight: 12 }, ['herdkeeping_animal_sadness_2']], [{ yardLeft: 'x', yardRight: 99 }, []]]) {
      const rows = Array.from({ length: 160 }, () => row(1 + Math.floor(rand() * 400), classes[Math.floor(rand() * 3)]));
      const width = yardStreetWidth(cult);
      const want = ids(capYardAnimals(rows, (c) => yardClassCap(c, { width, upgrades })));
      assert.deepEqual(rowsOf(ownerSave(rows, { cult, upgrades })), want, JSON.stringify(cult));
    }
    const piggies = herd('npc_piggy', Array.from({ length: 60 }, (_, i) => 60 - i));
    assert.equal(rowsOf(ownerSave(piggies)).length, 18);
    assert.equal(rowsOf(ownerSave(piggies, { upgrades: ['herdkeeping_animal_sadness_2'] })).length, 22);
    assert.equal(rowsOf(ownerSave(piggies, { cult: { yardLeft: 17, yardRight: 12 }, upgrades: ['herdkeeping_animal_sadness_2'] })).length, 48);
  });
  it('Batterflies and babies are not yard animals a visitor meets; the site still reads them under its cap', () => {
    const out = php(`$rows = []; for ($i = 1; $i <= 50; $i++) { $rows[] = (object) ["id" => "a$i", "classId" => "chick"]; } echo json_encode(count(Y::capAnimals($rows, Y::crowd(), fn ($c) => Y::herdCap(Y::crowd(), $c, 2370.0, []))));`);
    assert.equal(out, 40);
    assert.deepEqual(rowsOf(ownerSave([row(1, 'chick'), row(2, 'npc_batterfly'), row(3, 'npc_piggy')])), ['a3']);
  });
  it('a 10,000-row save: 18 Piggies after reading 300 rows, quickly', () => {
    const out = php(`$a = []; for ($i = 10000; $i >= 1; $i--) { $a[] = ["id" => "a$i", "classId" => "npc_piggy", "x" => $i, "state" => (object) []]; }
      $s = json_decode(json_encode(["systems" => ["home" => ["owned" => true]], "world" => ["streets" => ["RH_HOME_EXT" => ["features" => ["animal-husbandry" => ["animals" => $a]]]]]]));
      $t = microtime(true); $rows = Y::animalRows($s); $ms = (microtime(true) - $t) * 1000;
      echo json_encode(["n" => count($rows), "last" => end($rows)->id, "ms" => $ms]);`);
    assert.equal(out.n, 18);
    assert.equal(out.last, 'a9701');
    assert.ok(out.ms < 50, `${out.ms.toFixed(1)} ms`);
  });
  it('a visitor\'s verb on an animal past the cap is refused; on a kept one it lands', () => {
    const piggies = herd('npc_piggy', Array.from({ length: 30 }, (_, i) => i + 1));
    const judge = (id) => php(`$s = json_decode(${JSON.stringify(JSON.stringify(ownerSave(piggies)))}); echo json_encode(Y::judge(Y::rules(), $s, [], [], [], "animal", ${JSON.stringify(id)}, "pet", ${Date.now()}));`);
    assert.deepEqual(judge('a18'), { pool: 'npc_piggy:pet', got: [] });
    assert.deepEqual(judge('a19'), { why: 'gone', text: 'That is not there any more.' });
    assert.equal(judge('a30').why, 'gone');
  });
});
