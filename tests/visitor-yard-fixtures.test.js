/**
 * What an owner set down on their home street for their animals, seen by a visitor online
 * (js/yard-fixtures-mp.js, features/yard-verbs-mp-feature.js): the Magic Sticks stand where the
 * owner put them, to look at, with the source's refusal on Pick up, and so do the Meat
 * Collectors, Butterfly Milkers and Piggy Feeders, which the site lists for a visitor
 * (groddle-afternoon-site src/HomeYard.php machineRows) and which have no verb for one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STICK_PICKUP, YARD_FIXTURES, YARD_MACHINES_MAX, normalizeYardMachines, yardFixtureRows, yardFixtureVerbs, yardFixturesKey } from '../public/js/yard-fixtures-mp.js?v=dd022fe8';
import { normalizeYardView } from '../public/js/yard-verbs-mp.js?v=82048a76';
import { MAGIC_STICKS, REMOTE_MACHINES } from '../public/js/animal-husbandry.js?v=aa65a582';
import { STICK_SCALE } from '../public/js/features/animal-husbandry-feature.js?v=3bf44bfc';
import { GAME_DIR, HAS_SITE, SITE_DIR, sitePath } from '../tools/repos.mjs';

const read = (rel) => readFileSync(join(GAME_DIR, rel), 'utf8');
const gsjs = join(GAME_DIR, '..', 'glitch-GameServerJS');
const skipSource = !existsSync(join(gsjs, 'items', 'magic_pig_stick.js')) && 'glitch-GameServerJS is not beside the game';
const sticks = Object.entries(YARD_FIXTURES).filter(([, def]) => def.kind === 'stick');
const machines = Object.entries(YARD_FIXTURES).filter(([, def]) => def.kind === 'machine');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

function php(classes, body) {
  const code = `foreach (${JSON.stringify(classes)} as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; ${body}`;
  return JSON.parse(execFileSync('php', ['-r', code]).toString());
}

describe('a placed Magic Stick, as a visitor sees it', () => {
  it('is each stick the owner can place, named and drawn as the owner\'s game does', () => {
    assert.deepEqual(sticks.map(([cls]) => cls).sort(), Object.keys(MAGIC_STICKS).sort());
    const own = read('public/js/features/animal-husbandry-feature.js');
    for (const [cls, def] of sticks) {
      assert.equal(def.label, MAGIC_STICKS[cls].label, cls);
      assert.equal(def.scale, STICK_SCALE, cls);
      assert.ok(own.includes(`${cls}: \`\${DIR}${def.art.split('/').pop()}\``), `${cls}: the owner's art`);
      assert.ok(existsSync(join(GAME_DIR, 'public', def.art)), def.art);
      assert.ok(existsSync(join(GAME_DIR, 'public', def.art.replace('.webp', '@3x.webp'))), `${def.art} at 3x`);
    }
    // The owner's own hit box (buildPlaced).
    assert.match(own, /spr\._worldHitW = kind === 'stick' \? 50 : 70;/);
    assert.match(own, /spr\._worldHitH = kind === 'stick' \? 90 : 80;/);
    for (const [, def] of sticks) assert.deepEqual([def.hitW, def.hitH], [50, 90]);
  });

  it('refuses a pick up in the source\'s words', { skip: skipSource }, () => {
    const lines = { magic_pig_stick: 155, magic_chicken_stick: 155, magic_butterfly_stick: 167 };
    for (const [cls, def] of sticks) {
      const src = readFileSync(join(gsjs, 'items', `${cls}.js`), 'utf8').split('\n');
      assert.ok(src[lines[cls] - 1].includes(`reason:"${def.locked}"`), `${cls}.js:${lines[cls]}`);
      assert.ok(src.some((l) => l.includes(`"name"				: "${STICK_PICKUP.label}"`)), `${cls}: pick up`);
      assert.ok(src.some((l) => l.includes(`"tooltip"			: "${STICK_PICKUP.tooltip}"`)), `${cls}: its tooltip`);
    }
  });

  it('stands where the site says the owner set it', () => {
    const view = normalizeYardView({ owner: 7, name: 'Ada', sticks: [{ classTsid: 'magic_pig_stick', x: 1500.4, distance: 120 }, { classTsid: 'magic_rook_stick', x: 1 }, { classTsid: 'magic_butterfly_stick', x: 900 }] });
    const rows = yardFixtureRows(view);
    assert.deepEqual(rows.map((r) => [r.id, r.kind, r.classTsid, r.x, r.label]), [
      ['stick:0', 'stick', 'magic_pig_stick', 1500, 'Pig Stick'],
      ['stick:1', 'stick', 'magic_butterfly_stick', 900, 'Butterfly Stick'],
    ]);
    assert.equal(yardFixturesKey(rows), 'magic_pig_stick@1500,magic_butterfly_stick@900');
    assert.deepEqual(yardFixtureRows(normalizeYardView({ owner: 7 })), []);
    assert.deepEqual(yardFixtureRows(null), []);
    assert.equal(yardFixturesKey([]), '');
  });

  it('offers a visitor only a disabled Pick up', () => {
    const [row] = yardFixtureRows({ sticks: [{ classTsid: 'magic_chicken_stick', x: 10 }] });
    assert.deepEqual(yardFixtureVerbs(row), [{ id: 'pickup', label: 'pick up', tooltip: 'Put it in your pack', enabled: false, reason: 'This Chicken Stick belongs to somebody else. Get your own!' }]);
    assert.deepEqual(yardFixtureVerbs(null), []);
  });

  it('is drawn on a visit and redrawn when the owner moves one', () => {
    const visit = read('public/js/features/yard-verbs-mp-feature.js');
    assert.match(visit, /drawFixtures\(view\);\n    for \(const row of view\.stock\.rocks\)/, 'with the rest of the yard');
    assert.match(visit, /if \(yardFixturesKey\(yardFixtureRows\(view\)\) !== visit\.fixturesKey\) \{\n        drawFixtures\(view\);/, 'on a refresh');
    assert.match(visit, /clearFixtures\(\);\n    visit = null;/, 'gone with the visit');
    assert.match(visit, /if \(visit && target\?\.yardFixture\) return yardFixtureVerbs\(target\.yardFixture\);/);
    assert.match(visit, /featureId: YARD_VERBS_MP_ID,\n        label: row\.label,/, 'its menu is this feature\'s, never the owner\'s verbs');
    // Solo never runs the feature at all.
    assert.match(visit, /if \(engine\.mode !== 'multiplayer' \|\| !engine\.started\) return;\n    ensure\(engine\)\?\.tick/);
  });
});

describe('a Meat Collector, Butterfly Milker or Piggy Feeder, as a visitor sees it', () => {
  it('is each machine the owner can set down, named and drawn as the owner\'s game does', () => {
    assert.deepEqual(machines.map(([cls]) => cls).sort(), Object.keys(REMOTE_MACHINES).sort());
    const own = read('public/js/features/animal-husbandry-feature.js');
    for (const [cls, def] of machines) {
      assert.equal(def.label, REMOTE_MACHINES[cls].label, cls);
      assert.equal(def.scale, 1, cls);
      assert.deepEqual([def.hitW, def.hitH], [70, 80], cls);
      assert.ok(own.includes(`${cls}: \`\${DIR}${def.art.split('/').pop()}\``), `${cls}: the owner's art`);
      assert.ok(existsSync(join(GAME_DIR, 'public', def.art)), def.art);
      assert.ok(existsSync(join(GAME_DIR, 'public', def.art.replace('.webp', '@3x.webp'))), `${def.art} at 3x`);
    }
  });

  it('had no verb for someone without the owner\'s key in the source', { skip: skipSource }, () => {
    const src = (cls) => readFileSync(join(gsjs, 'items', `${cls}.js`), 'utf8').split('\n');
    // collect: hidden from anyone who is not the owner and holds no key (state null).
    assert.ok(src('meat_collector')[131].includes('!this.container.pols_is_owner(pc) && !this.container.acl_keys_player_has_key(pc)'));
    assert.ok(src('meat_collector')[132].includes('{state:null}'));
    assert.ok(src('butterfly_milker')[131].includes('!pc.location.pols_is_owner(pc) && !pc.location.acl_keys_player_has_key(pc)'));
    assert.ok(src('butterfly_milker')[132].includes('{state:null}'));
    // pick up: canPickup answers { ok: 0 } with no error to anyone but the owner, which hides the verb (takeable.js 20-25).
    for (const [cls, line] of [['meat_collector', 174], ['butterfly_milker', 175], ['piggy_feeder', 245]]) {
      const lines = src(cls);
      assert.ok(lines[line - 1].includes('pc.location.pols_is_pol() && !pc.location.pols_is_owner(pc)'), `${cls}.js:${line}`);
      assert.ok(lines[line].includes('return {ok:0};'), `${cls}.js:${line + 1}`);
    }
    const takeable = readFileSync(join(gsjs, 'items', 'include', 'takeable.js'), 'utf8');
    assert.match(takeable, /if \(!can_pickup\['error'\]\) return \{state:null\};/);
  });

  it('is read from the site\'s list, checked', () => {
    assert.deepEqual(normalizeYardMachines([{ classTsid: 'meat_collector', x: 1500.6, inside: 9 }, { classTsid: 'fuelmaker', x: 2 }, { classTsid: 'piggy_feeder', x: 'left' }, null, { classTsid: 'butterfly_milker', x: '1700' }, { classTsid: 'magic_pig_stick', x: 5 }]), [
      { classTsid: 'meat_collector', x: 1501 },
      { classTsid: 'butterfly_milker', x: 1700 },
    ]);
    assert.deepEqual(normalizeYardMachines(null), []);
    assert.equal(normalizeYardMachines(Array.from({ length: 80 }, (_, i) => ({ classTsid: 'piggy_feeder', x: i }))).length, YARD_MACHINES_MAX);
    const view = normalizeYardView({ owner: 7, sticks: [{ classTsid: 'magic_pig_stick', x: 1500 }], machines: [{ classTsid: 'meat_collector', x: 1620 }, { classTsid: 'piggy_feeder', x: 1700 }] });
    assert.deepEqual(view.machines, [{ classTsid: 'meat_collector', x: 1620 }, { classTsid: 'piggy_feeder', x: 1700 }]);
    assert.deepEqual(normalizeYardView({ owner: 7 }).machines, [], 'a site from before this list');
    const rows = yardFixtureRows(view);
    assert.deepEqual(rows.map((r) => [r.id, r.kind, r.classTsid, r.x, r.label]), [
      ['stick:0', 'stick', 'magic_pig_stick', 1500, 'Pig Stick'],
      ['machine:0', 'machine', 'meat_collector', 1620, 'Meat Collector'],
      ['machine:1', 'machine', 'piggy_feeder', 1700, 'Piggy Feeder'],
    ]);
    assert.equal(yardFixturesKey(rows), 'magic_pig_stick@1500,meat_collector@1620,piggy_feeder@1700');
  });

  it('has no verb for a visitor, and what it holds never reaches them', () => {
    for (const row of yardFixtureRows({ machines: machines.map(([classTsid], i) => ({ classTsid, x: i, inside: 40 })) })) {
      assert.deepEqual(yardFixtureVerbs(row), [], row.classTsid);
      assert.equal('inside' in row, false);
    }
    const visit = read('public/js/features/yard-verbs-mp-feature.js');
    assert.match(visit, /emptyMenuGrowl: T\.notYours\(visit\.name\),/, 'a click says whose it is');
  });

  it('the site lists them from the owner\'s save: class and place, nothing else', { skip: skipSite }, () => {
    const state = { world: { streets: { RH_HOME_EXT: { features: { 'animal-husbandry': { machines: [
      { classTsid: 'meat_collector', x: 1500.7, inside: 12, nextAt: 5, fullNotified: true },
      { classTsid: 'fuelmaker', x: 3 },
      'junk',
      { classTsid: 'piggy_feeder', x: '1700', inside: 80 },
      { classTsid: 'butterfly_milker' },
    ] } } } } } };
    const run = (s) => php(['HomePool', 'HomeYard'], `use Groddle\\Minn\\HomeYard as Y; echo json_encode(Y::machineRows(json_decode(${JSON.stringify(JSON.stringify(s))})));`);
    assert.deepEqual(run(state), [{ classTsid: 'meat_collector', x: 1500 }, { classTsid: 'piggy_feeder', x: 1700 }]);
    assert.deepEqual(run({}), []);
    const many = { world: { streets: { RH_HOME_EXT: { features: { 'animal-husbandry': { machines: Array.from({ length: 60 }, (_, i) => ({ classTsid: 'meat_collector', x: i })) } } } } } };
    assert.equal(run(many).length, YARD_MACHINES_MAX);
    const src = readFileSync(sitePath('src', 'HomeYard.php'), 'utf8');
    assert.match(src, /'machines' => self::machineRows\(\$state\),/);
    assert.match(src, new RegExp(`YARD_MACHINES_MAX = ${YARD_MACHINES_MAX};`));
    for (const [cls] of machines) assert.ok(src.includes(`'${cls}'`), cls);
  });
});
