/**
 * The Fire Dragon (js/fire-dragon.js, features/fire-dragon-feature.js): the first animal made
 * for Groddle Afternoon, placed by the level builder's population. Its art is AI-generated,
 * dedicated CC0 1.0, and every file under assets/sprites/made/ is listed with its bytes in
 * tools/provenance/made-sprites.json.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIRE_DRAGON_CLASS,
  FIRE_DRAGON_MAX,
  FIRE_DRAGON_PLACEMENT_KEY,
  FIRE_DRAGON_SHEET,
  FIRE_DRAGON_WALK,
  fireDragonCount,
  fireDragonPlacementGroups,
  fireDragonRoamTarget,
  fireDragonVerbs,
  fireDragonWalkSpeed,
  petFireDragon,
} from '../public/js/fire-dragon.js?fresh=fire-dragon';
import { featureCountsFrom, populationForStreet, FEATURE_CLASSES } from '../public/js/street-ecology.js?fresh=fire-dragon';
import { POPULATION_CLASSES, populationFrom } from '../public/js/builder/zone.js?fresh=fire-dragon';
import { POPULATION_WORDS } from '../public/js/builder/editor-zone.js?fresh=fire-dragon';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

describe('Fire Dragon rules', () => {
  it('a street gets the dragons its population asks for, at most three', () => {
    assert.equal(fireDragonCount(null), 0);
    assert.equal(fireDragonCount({ featureCounts: {} }), 0);
    assert.equal(fireDragonCount({ featureCounts: { npc_fire_dragon: 2 } }), 2);
    assert.equal(fireDragonCount({ featureCounts: { npc_fire_dragon: 9 } }), FIRE_DRAGON_MAX);
    assert.deepEqual(fireDragonPlacementGroups({ featureCounts: {} }), []);
    assert.deepEqual(fireDragonPlacementGroups({ featureCounts: { npc_fire_dragon: 1 } }), [{ key: FIRE_DRAGON_PLACEMENT_KEY, count: 1, clearance: 140 }]);
  });

  it('the ecology row carries the count through to the population features read', () => {
    assert.ok(FEATURE_CLASSES.includes(FIRE_DRAGON_CLASS));
    assert.deepEqual(featureCountsFrom({ npc_fire_dragon: 2, npc_piggy: 3 }), { npc_fire_dragon: 2 });
    const row = { counts: { npc_fire_dragon: 2, rock_beryl_1: 2 }, quoins: 6 };
    assert.deepEqual(populationForStreet('GZTEST', row).featureCounts, { npc_fire_dragon: 2 });
    assert.deepEqual(populationForStreet('GZTEST', { ...row, exact: true }).featureCounts, { npc_fire_dragon: 2 });
    assert.deepEqual(populationForStreet('nowhere', null).featureCounts, {});
    assert.equal(fireDragonCount(populationForStreet('GZTEST', row)), 2);
  });

  it('roams inside the street, at a walking pace', () => {
    const bounds = { l: 0, r: 2400 };
    for (const r of [0, 0.5, 0.999]) {
      const s = fireDragonWalkSpeed(() => r);
      assert.ok(s >= FIRE_DRAGON_WALK.speedMin && s <= FIRE_DRAGON_WALK.speedMax, String(s));
      const right = fireDragonRoamTarget(1000, 'right', bounds, () => r);
      assert.ok(right.distance >= 220 && right.distance <= 380);
      const left = fireDragonRoamTarget(1000, 'left', bounds, () => r);
      assert.ok(left.distance <= -220 && left.distance >= -380);
    }
    assert.equal(fireDragonRoamTarget(2280, 'right', bounds, () => 0.5).x, 2300, 'stops at the edge');
    assert.equal(fireDragonRoamTarget(150, 'left', bounds, () => 0.5).x, 100);
    assert.equal(fireDragonRoamTarget(2350, 'right', bounds, () => 0.5).distance, 0, 'past the edge: no walk, it turns');
  });

  it('can be petted once a game day', () => {
    const day = '2026-11-02';
    assert.deepEqual(fireDragonVerbs({}, day).map((v) => [v.id, v.enabled]), [['dragon_pet', true]]);
    const first = petFireDragon({}, day);
    assert.ok(first.mood > 0);
    assert.equal(first.memory.pettedDay, day);
    assert.equal(petFireDragon(first.memory, day), null);
    assert.equal(fireDragonVerbs(first.memory, day)[0].enabled, false);
    assert.ok(petFireDragon(first.memory, '2026-11-03'));
    // Player words: no em dashes, never the old game's name.
    for (const text of [first.message, fireDragonVerbs(first.memory, day)[0].reason]) {
      assert.doesNotMatch(text, /—|Glitch/);
    }
  });
});

describe('Fire Dragon art and provenance', () => {
  it('the walk sheet is 8 cells of 120x76 at 3x', () => {
    const file = join(pub, FIRE_DRAGON_SHEET.path);
    assert.ok(existsSync(file), FIRE_DRAGON_SHEET.path);
    assert.match(FIRE_DRAGON_SHEET.path, /@3x\.webp$/);
    const buf = readFileSync(file);
    // WebP VP8X canvas size: 24-bit width-1 and height-1 at bytes 24 and 27.
    assert.equal(buf.toString('ascii', 12, 16), 'VP8X');
    const w = buf.readUIntLE(24, 3) + 1;
    const h = buf.readUIntLE(27, 3) + 1;
    assert.deepEqual([w, h], [FIRE_DRAGON_SHEET.fw * FIRE_DRAGON_SHEET.cols * 3, FIRE_DRAGON_SHEET.fh * 3]);
    assert.equal(FIRE_DRAGON_SHEET.frames, 8);
  });

  it('every made sprite is listed with its bytes, maker, prompt and CC0 inputs', () => {
    const ledger = JSON.parse(readFileSync(join(root, 'tools/provenance/made-sprites.json'), 'utf8'));
    const policy = JSON.parse(readFileSync(join(root, 'tools/builder/licence-policy.json'), 'utf8'));
    const byFile = new Map(Object.values(ledger.sprites).map((r) => [r.file, r]));
    const walk = (d, out = []) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else out.push(relative(root, p));
      }
      return out;
    };
    const files = walk(join(pub, 'assets/sprites/made'));
    assert.ok(files.length >= 1);
    for (const f of files) {
      const row = byFile.get(f);
      assert.ok(row, `${f}: no provenance row`);
      assert.equal(createHash('sha256').update(readFileSync(join(root, f))).digest('hex'), row.sha256, `${f}: not the bytes its provenance names`);
    }
    for (const [name, row] of Object.entries(ledger.sprites)) {
      assert.equal(policy.licences[row.licence]?.origin, 'new', name);
      assert.ok(row.author && row.tool && row.prompt, `${name}: maker`);
      assert.ok(row.inputs.length && row.inputs.every((i) => /^(sprite:|deco:|made:|own:)/.test(i)), `${name}: inputs`);
      assert.ok(existsSync(join(root, row.file)), row.file);
      assert.doesNotMatch(JSON.stringify(row), /\/Users\//);
    }
  });
});

describe('Fire Dragon in the level builder and the game', () => {
  it('the builder can place it: zone.js, both schema copies and the editor words agree', () => {
    assert.ok(POPULATION_CLASSES.includes(FIRE_DRAGON_CLASS));
    assert.ok(POPULATION_WORDS[FIRE_DRAGON_CLASS]);
    for (const p of ['docs/level-builder/zone.schema.json', 'public/assets/content/zone.schema.json']) {
      const schema = JSON.parse(readFileSync(join(root, p), 'utf8'));
      const counts = schema.$defs.population.properties.counts;
      const names = counts.propertyNames?.enum || counts.additionalProperties?.enum || JSON.stringify(counts).match(/"enum":\[[^\]]*\]/)?.[0];
      assert.ok(JSON.stringify(names).includes(FIRE_DRAGON_CLASS), p);
    }
    assert.deepEqual(populationFrom({ counts: { npc_fire_dragon: 2 } }).counts, { npc_fire_dragon: 2 });
  });

  it('the feature is registered', () => {
    const index = readFileSync(join(pub, 'js/features/index.js'), 'utf8');
    assert.match(index, /import \{ fireDragonFeature \} from '\.\/fire-dragon-feature\.js(\?v=[0-9a-f]{8})?'; FEATURES\.push\(fireDragonFeature\);/);
  });
});
