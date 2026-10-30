/**
 * G122: artifacts, necklace beads and petrified rocks
 * (js/artifacts.js + features/artifacts-feature.js).
 * Source: glitch-GameServerJS players/inc_artifacts.js, players/inc_items.js
 * items_added, items/petrified_rock_*.js, items/catalog_drop_tables.js,
 * achievements/student_of_artifactology.js and friends.
 * Run: node --test tests/artifacts.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_ARTIFACT_CLASSES,
  ARTIFACT_MAP,
  ARTIFACT_NECKLACES,
  CRACK_STEPS,
  CRACK_TOOLS,
  EXTRA_ITEMS,
  assemblyCounter,
  assemblyFor,
  canCrack,
  consumeForAssembly,
  crackMessage,
  crackStartMessage,
  isArtifactPiece,
  normalizeArtifactState,
  pieceOdds,
  rollCrack,
  stackMaxFor,
} from '../public/js/artifacts.js?v=fc419ecf';
import { artifactsFeature, finishCrack } from '../public/js/features/artifacts-feature.js?v=39c17a5f';
import { FEATURES } from '../public/js/features/index.js?v=a57a5976';
import { DROP_ITEMS, DROP_TABLES, rollDropTable } from '../public/js/drop-tables.js?v=0f922478';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=85d4faba';
import { createToolConditionState, getToolCondition } from '../public/js/tools.js?v=9a2e7ef4';
import { HIRES_ICONS } from '../public/js/icon-hires.js?v=5357d4b4';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'players/inc_artifacts.js'));
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

function makeEngine(inv = {}) {
  const log = { activity: [], counters: [], sounds: [] };
  const engine = {
    inv,
    pc: { currants: 0 },
    toolState: createToolConditionState(),
    player: null,
    pushActivity: (m) => log.activity.push(m),
    toast: () => {},
    achievement: (c, n) => log.counters.push([c, n]),
    playSound: (k) => log.sounds.push(k),
    refreshPack: () => {},
    save: () => {},
    setData: () => {},
    param: () => null,
  };
  return { engine, log };
}

describe('the recipes come from inc_artifacts.js', () => {
  it('has the ten artifact_map artifacts and five necklaces with their source counts', () => {
    assert.equal(Object.keys(ARTIFACT_MAP).length, 10);
    assert.deepEqual(
      Object.fromEntries(Object.entries(ARTIFACT_MAP).map(([k, v]) => [k, v.pieces.length])),
      { butterfly_hair_clip: 4, chicken_brick: 5, glove_metal_finger: 3, magical_pendant: 3, mirror_with_scribbles: 5, mysterious_cube: 5, nose_of_china: 2, platinumium_spork: 2, torn_manuscript: 4, wooden_apple: 4 }
    );
    assert.deepEqual(Object.values(ARTIFACT_NECKLACES).map((n) => n.required), [17, 17, 19, 19, 23]);
  });

  it('matches the source file line for line', { skip: !hasGsjs }, () => {
    const src = readFileSync(join(GSJS, 'players/inc_artifacts.js'), 'utf8');
    for (const [type, def] of Object.entries(ARTIFACT_MAP)) {
      assert.ok(src.includes(`'${type}':{`), type);
      assert.ok(src.includes(`'artifact': '${def.artifact}'`), def.artifact);
      for (const p of def.pieces) assert.ok(src.includes(`'${p}'`), p);
    }
    for (const [bead, def] of Object.entries(ARTIFACT_NECKLACES)) {
      assert.match(src, new RegExp(`'${bead}': \\{\\s*required: ${def.required},\\s*produces: '${def.produces}'`));
    }
    assert.match(src, /apiSetTimerX\('createArtifact', 1\*1000/);
    assert.match(src, /duration: 5000/);
    assert.match(src, /createItemFromGround', 5000/);
  });

  it('uses the live hair clip pieces, which the drop table hands out (the butterlfy files are orphans)', () => {
    const rows = DROP_TABLES.artifact_pieces_butterlfy_hair_clip.rows.flatMap(([, es]) => es.map((e) => e.item));
    assert.deepEqual(rows, ARTIFACT_MAP.butterfly_hair_clip.pieces);
    assert.ok(!ALL_ARTIFACT_CLASSES.some((id) => id.includes('butterlfy')));
  });

  it('every piece and bead is in some drop table, every artifact has art', () => {
    const dropped = new Set(Object.values(DROP_TABLES).flatMap((t) => t.rows.flatMap(([, es]) => es.map((e) => e.item).filter(Boolean))));
    for (const id of [...Object.values(ARTIFACT_MAP).flatMap((a) => a.pieces), ...Object.keys(ARTIFACT_NECKLACES)]) assert.ok(dropped.has(id), id);
    for (const id of ALL_ARTIFACT_CLASSES) {
      assert.ok(existsSync(join(ROOT, `public/assets/sprites/icons/${id}.png`)), `${id} icon`);
      assert.ok(HIRES_ICONS.has(id), `${id} 3x icon`);
    }
  });

  it('copies item text from the source', { skip: !hasGsjs }, () => {
    for (const [id, meta] of Object.entries(EXTRA_ITEMS)) {
      const src = readFileSync(join(GSJS, `items/${id}.js`), 'utf8');
      assert.ok(src.includes(`var description = ${JSON.stringify(meta.desc)};`), id);
      assert.ok(src.includes(`var name_plural = "${meta.plural}";`), id);
      assert.ok(src.includes(`var stackmax = ${meta.stackMax};`), id);
    }
    assert.equal(stackMaxFor('artifact_necklace_imperial_piece'), 23);
    assert.equal(stackMaxFor('artifact_chicken_brick_piece3'), 5);
    assert.equal(stackMaxFor('artifact_chicken_brick'), 1);
  });
});

describe('assembly (artifactPieceAdded / createArtifact)', () => {
  it('finds nothing until the set is whole', () => {
    const inv = { artifact_nose_of_china_piece1: 1 };
    assert.equal(assemblyFor(inv, 'artifact_nose_of_china_piece1'), null);
    inv.artifact_nose_of_china_piece2 = 1;
    const plan = assemblyFor(inv, 'artifact_nose_of_china_piece2');
    assert.equal(plan.kind, 'artifact');
    assert.equal(plan.artifact, 'artifact_nose_of_china');
    assert.equal(assemblyCounter(plan), 'artifacts_made:artifact_nose_of_china');
    assert.ok(consumeForAssembly(inv, plan));
    assert.deepEqual(inv, { artifact_nose_of_china_piece1: 0, artifact_nose_of_china_piece2: 0 });
    assert.equal(consumeForAssembly(inv, plan), false);
  });

  it('threads a necklace only at the full bead count and uses exactly that many', () => {
    const inv = { artifact_necklace_onyx_piece: 18 };
    assert.equal(assemblyFor(inv, 'artifact_necklace_onyx_piece'), null);
    inv.artifact_necklace_onyx_piece = 21;
    const plan = assemblyFor(inv, 'artifact_necklace_onyx_piece');
    assert.deepEqual([plan.kind, plan.required, plan.produces], ['necklace', 19, 'artifact_necklace_onyx']);
    assert.equal(assemblyCounter(plan), 'necklaces_made:artifact_necklace_onyx');
    consumeForAssembly(inv, plan);
    assert.equal(inv.artifact_necklace_onyx_piece, 2);
  });

  it('tags pieces and beads, not finished artifacts or rocks', () => {
    assert.ok(isArtifactPiece('artifact_torn_manuscript_piece3'));
    assert.ok(isArtifactPiece('artifact_necklace_rhyolite_piece'));
    assert.ok(!isArtifactPiece('artifact_torn_manuscript'));
    assert.ok(!isArtifactPiece('petrified_rock_small'));
  });
});

describe('the feature: watcher, overlay, arrival, badges', () => {
  beforeEach(() => artifactsFeature._reset());

  it('is in the registry and registers every class with source names', () => {
    assert.ok(FEATURES.some((f) => f.id === artifactsFeature.id));
    const { engine } = makeEngine();
    artifactsFeature.init(engine);
    assert.equal(ITEM_CATALOG.petrified_rock_large.label, 'Large Petrified Rock');
    assert.equal(ITEM_CATALOG.artifact_necklace_imperial.label, 'Ouzian Necklace');
    assert.equal(ITEM_CATALOG.artifact_wooden_apple_piece2.namePlural, 'Pieces of Wooden Apple');
    assert.equal(ITEM_CATALOG.artifact_wooden_apple.donatable, false);
  });

  it('assembles 1 s after the last piece arrives, locks for 5 s and delivers 5 s later', () => {
    const pieces = ARTIFACT_MAP.chicken_brick.pieces;
    const inv = Object.fromEntries(pieces.slice(0, 4).map((p) => [p, 1]));
    const { engine, log } = makeEngine(inv);
    artifactsFeature.init(engine);
    const t0 = 1_000_000;
    artifactsFeature.onTick(16, t0, engine); // first look: snapshot only
    inv[pieces[4]] = 1;
    artifactsFeature.onTick(16, t0 + 300, engine);
    assert.equal(artifactsFeature._state().pending.size, 1);
    assert.equal(inv[pieces[0]], 1, 'nothing used during the 1 s wait');
    // Real clock for the overlay/arrival; drive with Date.now-based ticks.
    const now = Date.now();
    artifactsFeature._state().pending.get('artifact_chicken_brick').at = now - 1;
    artifactsFeature.onTick(16, now, engine);
    assert.deepEqual(pieces.map((p) => inv[p]), [0, 0, 0, 0, 0]);
    assert.equal(artifactsFeature._state().overlay.text, "You've combined all the artifact pieces to make a Chicken-Shaped Brick!");
    assert.deepEqual(artifactsFeature.physics(), { speed: 0, jump: 0 });
    assert.deepEqual(log.counters, [['artifacts_made:artifact_chicken_brick', 1]]);
    assert.equal(inv.artifact_chicken_brick, undefined, 'arrives later');
    artifactsFeature.onTick(16, now + 5001, engine);
    assert.equal(inv.artifact_chicken_brick, 1);
    assert.equal(artifactsFeature._state().overlay, null);
    assert.equal(artifactsFeature.physics(), null);
    assert.deepEqual(artifactsFeature.save().made, { artifact_chicken_brick: 1 });
  });

  it('threads a necklace from beads with the source count in the overlay', () => {
    const inv = { artifact_necklace_imperial_piece: 22 };
    const { engine, log } = makeEngine(inv);
    artifactsFeature.init(engine);
    artifactsFeature.onTick(16, 10, engine);
    inv.artifact_necklace_imperial_piece = 23;
    artifactsFeature.onTick(16, 400, engine);
    const now = Date.now();
    artifactsFeature._state().pending.get('artifact_necklace_imperial').at = now - 1;
    artifactsFeature.onTick(16, now, engine);
    assert.equal(artifactsFeature._state().overlay.text, "You've combined 23 beads to make a Ouzian Necklace!");
    assert.equal(inv.artifact_necklace_imperial_piece, 0);
    assert.deepEqual(log.counters, [['necklaces_made:artifact_necklace_imperial', 1]]);
  });

  it('skips a set that stopped being whole during the wait', () => {
    const inv = { artifact_platinumium_spork_piece1: 1 };
    const { engine, log } = makeEngine(inv);
    artifactsFeature.onTick(16, 10, engine);
    inv.artifact_platinumium_spork_piece2 = 1;
    artifactsFeature.onTick(16, 400, engine);
    inv.artifact_platinumium_spork_piece1 = 0;
    artifactsFeature._state().pending.get('artifact_platinumium_spork').at = 0;
    artifactsFeature.onTick(16, Date.now(), engine);
    assert.equal(artifactsFeature._state().overlay, null);
    assert.deepEqual(log.counters, []);
  });

  it('the badges count different artifacts (group_count) and necklaces', { skip: !hasGsjs }, () => {
    const read = (id) => readFileSync(join(GSJS, `achievements/${id}.js`), 'utf8');
    assert.match(read('student_of_artifactology'), /type\s*: "group_count",\s*group\s*: "artifacts_made",\s*value\s*: "3"/);
    assert.match(read('qualified_artifactologist'), /group\s*: "artifacts_made",\s*value\s*: "10"/);
    assert.match(read('bead_threader'), /group\s*: "necklaces_made",\s*value\s*: "1"/);
    assert.match(read('threader_of_renown'), /group\s*: "necklaces_made",\s*value\s*: "5"/);
  });
});

describe('petrified rocks (petrified_rock_base crack, onCrack)', () => {
  beforeEach(() => artifactsFeature._reset());

  it('follows each size\'s onCrack steps', { skip: !hasGsjs }, () => {
    for (const size of ['small', 'medium', 'large']) {
      const src = readFileSync(join(GSJS, `items/petrified_rock_${size}.js`), 'utf8');
      const body = src.slice(src.indexOf('function onCrack'), src.indexOf('if (results.length)', src.indexOf('function onCrack')));
      const calls = [...body.matchAll(/runDropTable\("([a-z_]+)"/g)].map((m) => m[1]);
      const steps = CRACK_STEPS[`petrified_rock_${size}`].map((s) => s.table || s.tableMissing).filter(Boolean);
      assert.deepEqual(steps, calls, size);
    }
    assert.ok(!DROP_TABLES.petrified_rock_small, 'the large rock asks for a table that does not exist');
  });

  it('accepts the ten valid_tools, needs a working one', { skip: !hasGsjs }, () => {
    const src = readFileSync(join(GSJS, 'items/petrified_rock_small.js'), 'utf8');
    const list = src.slice(src.indexOf('var valid_tools = ['), src.indexOf('];', src.indexOf('var valid_tools = [')));
    assert.deepEqual([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...CRACK_TOOLS]);
    assert.deepEqual(canCrack({ petrified_rock_small: 1 }, 'petrified_rock_small'), { ok: false, msg: "You don't have anything to crack it with." });
    assert.deepEqual(canCrack({ petrified_rock_small: 1, hoe: 1, pick: 1 }, 'petrified_rock_small').tools, ['hoe', 'pick']);
    assert.deepEqual(canCrack({ petrified_rock_small: 1, hoe: 1, pick: 1 }, 'petrified_rock_small', (id) => id !== 'hoe').tools, ['pick']);
  });

  it('a medium rock gives two artifact pieces and currants, with the combined line', () => {
    // rolls: piece table 0 -> chicken brick, sub 0 -> piece1; again; gem chance 0.9 (miss); currants 0.
    const rng = seq(0, 0, 0, 0, 0.9, 0);
    const out = rollCrack('petrified_rock_medium', { rng, rollTable: (id, g) => rollDropTable(id, g), meta: (id) => DROP_ITEMS[id] });
    assert.deepEqual(out.items, [['artifact_chicken_brick_piece1', 1], ['artifact_chicken_brick_piece1', 1]]);
    assert.ok(out.currants > 0);
    assert.equal(crackMessage(out.lines), `You got 1 Piece of Chicken-Shaped Brick, 1 Piece of Chicken-Shaped Brick, and ${out.currants} currants!`);
    assert.equal(crackMessage(['50 currants']), 'You got 50 currants!');
    assert.equal(crackMessage(['a', 'b']), 'You got a, and b!');
    assert.equal(crackStartMessage('petrified_rock_medium'), 'You cracked a Medium Petrified Rock.');
  });

  it('the large rock\'s 5% call on a missing table loses the message, the 2% grants two rocks', () => {
    const rng = () => 0.01; // every chance hits
    const out = rollCrack('petrified_rock_large', { rng, rollTable: (id, g) => rollDropTable(id, g), meta: (id) => DROP_ITEMS[id] });
    assert.equal(out.messageLost, true);
    assert.equal(crackMessage(out.lines, out.messageLost), '');
    assert.deepEqual(out.items.slice(-2), [['petrified_rock_small', 1], ['petrified_rock_medium', 1]]);
    assert.equal(out.items.filter(([id]) => /_piece\d$/.test(id)).length, 4, 'three pieces and the 20% fourth');
  });

  it('small rocks give an artifact piece 21% of the time, otherwise beads', () => {
    const t = DROP_TABLES.petrified_rock_small_crack;
    assert.equal(t.rows[0][1][0].table, 'artifact_pieces');
    assert.equal(t.rows[0][0], 20);
    const beads = new Set(t.rows.slice(1).flatMap(([, es]) => es.map((e) => e.item)));
    assert.deepEqual([...beads].sort(), Object.keys(ARTIFACT_NECKLACES).sort());
    // Chicken-Shaped Brick is the most common set, the Mysterious Cube the rarest.
    assert.ok(pieceOdds(DROP_TABLES, 'artifact_chicken_brick_piece1') > pieceOdds(DROP_TABLES, 'artifact_mysterious_cube_piece1'));
  });

  it('cracking uses the rock, one tool use, pays out and counts the verb', () => {
    const inv = { petrified_rock_medium: 2, pick: 1 };
    const { engine, log } = makeEngine(inv);
    artifactsFeature.init(engine);
    const verbs = artifactsFeature.packVerbs('petrified_rock_medium', engine);
    assert.deepEqual(verbs.map((v) => [v.id, v.label, v.enabled]), [['crack:pick', 'Crack', true]]);
    assert.ok(artifactsFeature.runPackVerb('petrified_rock_medium', 'crack:pick', engine));
    assert.equal(getToolCondition(engine.toolState, 'pick').remaining, 99);
    assert.deepEqual(log.sounds, ['PETRIFIED_ROCK']);
    assert.equal(log.activity[0], 'You cracked a Medium Petrified Rock.');
    assert.deepEqual(artifactsFeature.physics(), { speed: 0, jump: 0 });
    assert.equal(inv.petrified_rock_medium, 2, 'the rock goes at onCrack');
    artifactsFeature._setRng(seq(0, 0, 0.5, 0.5, 0.9, 0.3));
    const crack = artifactsFeature._state().crack;
    artifactsFeature.onTick(16, crack.at + 1, engine);
    assert.equal(inv.petrified_rock_medium, 1);
    assert.ok(engine.pc.currants > 0);
    assert.match(log.activity[1], /^You got 1 Piece of .+, 1 Piece of .+, and \d+ currants!$/);
    assert.deepEqual(log.counters.slice(0, 2), [['petrified_rock_medium:crack', 1], ['VERB:crack:petrified_rock_medium', 1]]);
    assert.deepEqual(artifactsFeature.save().cracked, { petrified_rock_medium: 1 });
  });

  it('offers one Crack per working tool, disabled with the source reason when none', () => {
    const { engine } = makeEngine({ petrified_rock_small: 1, hoe: 1, shovel: 1 });
    assert.deepEqual(artifactsFeature.packVerbs('petrified_rock_small', engine).map((v) => v.label), ['Crack with Hoe', 'Crack with Shovel']);
    const bare = makeEngine({ petrified_rock_small: 1 }).engine;
    const [v] = artifactsFeature.packVerbs('petrified_rock_small', bare);
    assert.deepEqual([v.enabled, v.reason], [false, "You don't have anything to crack it with."]);
    assert.deepEqual(artifactsFeature.packVerbs('artifact_wooden_apple', bare), []);
  });

  it('a crack that completes a set feeds the assembly watcher', () => {
    const pieces = ARTIFACT_MAP.nose_of_china.pieces;
    const inv = { [pieces[0]]: 1, petrified_rock_medium: 1 };
    const { engine } = makeEngine(inv);
    artifactsFeature.onTick(16, 1, engine);
    // Force the drop: nose_of_china is the 80-87 band of artifact_pieces, piece2 the upper half.
    const out = finishCrack(engine, 'petrified_rock_medium', { rng: seq(0.85, 0.99, 0.85, 0.99, 0.9, 0) });
    assert.ok(out.items.some(([id]) => id === pieces[1]));
    artifactsFeature.onTick(16, 400, engine);
    assert.ok(artifactsFeature._state().pending.has('artifact_nose_of_china'));
  });

  it('normalizes the saved slice', () => {
    assert.deepEqual(normalizeArtifactState({ cracked: { petrified_rock_small: 2.7, 'bad key': 3 }, made: { artifact_fan: -1 } }), { version: 1, cracked: { petrified_rock_small: 2 }, made: {} });
  });
});
