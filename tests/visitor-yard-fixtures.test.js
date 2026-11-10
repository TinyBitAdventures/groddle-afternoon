/**
 * What an owner set down on their home street for their animals, seen by a visitor online
 * (js/yard-fixtures-mp.js, features/yard-verbs-mp-feature.js): the Magic Sticks stand where the
 * owner put them, to look at, with the source's refusal on Pick up.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STICK_PICKUP, YARD_FIXTURES, yardFixtureRows, yardFixtureVerbs, yardFixturesKey } from '../public/js/yard-fixtures-mp.js?v=ba2a2fe5';
import { normalizeYardView } from '../public/js/yard-verbs-mp.js?v=6b210e26';
import { MAGIC_STICKS } from '../public/js/animal-husbandry.js?v=2d933bd6';
import { STICK_SCALE } from '../public/js/features/animal-husbandry-feature.js?v=d1976ddb';
import { GAME_DIR } from '../tools/repos.mjs';

const read = (rel) => readFileSync(join(GAME_DIR, rel), 'utf8');
const gsjs = join(GAME_DIR, '..', 'glitch-GameServerJS');
const skipSource = !existsSync(join(gsjs, 'items', 'magic_pig_stick.js')) && 'glitch-GameServerJS is not beside the game';
const sticks = Object.entries(YARD_FIXTURES).filter(([, def]) => def.kind === 'stick');

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
