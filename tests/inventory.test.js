/**
 * The restoration inventory (tools/inventory/): the emission scanner, the
 * detectors and the SQLite writer, on small fixtures (never the real 15k rows).
 * The regression case is the subway: with the counter removed from the scan
 * input, Subwayfarer must come out unreachable.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildIndex, contextLiterals, inventoryWrites, liveFiles, matchPattern, prefixLabels, scanEmissions } from '../tools/inventory/scan.mjs';
import { judgeAchievements, judgeBuffs, judgeLocations, judgeItems, judgeSkills, conditionReach, dropTableReach, assemblyConversions, conversionFixpoint, gsjsItemRefs } from '../tools/inventory/detectors.mjs';
import { readTsidRefs, tsidRefsFromText } from '../tools/inventory/gsjs-data.mjs';
import { REMAKE_EMITTERS, GSJS_EMITTERS, assemblySites, dropRollEmissions, emissionsByTag, itemGrantReach, locationBuilders, openDb, writeDb, lastDiff, summary, blockerRows } from '../tools/inventory/build.mjs';
import { CHECKLIST } from '../tools/restoration/checklist.mjs';
import { ARTIFACT_MAP, ARTIFACT_NECKLACES } from '../public/js/artifacts.js?v=fc419ecf';
import { DROP_TABLES } from '../public/js/drop-tables-data.js?v=c51a6400';
import { SKILL_PACKAGES } from '../public/js/skill-packages-data.js?v=cb4e9ab3';

const SUBWAY_JS = `export const RIDE_COUNTER = 'transit:subways_entered';\nexport const OTHER = 'x';\n`;
const FEATURE_JS = `import { RIDE_COUNTER } from '../subway.js?v=play-1';\nfunction board(engine) { engine.achievement(RIDE_COUNTER, 1); }\n`;
const FEATURE_NO_COUNTER_JS = `function board(engine) { engine.setData('subwayRide', 1); }\n`;

const SUBWAYFARER = { id: 'subwayfarer', name: 'Subwayfarer', desc: 'Rode the subway rails 23 times', category: 'exploring', isSecret: false, conditions: [{ type: 'counter', group: 'transit', name: 'subways_entered', num: 23 }] };

function remakeScan(files) {
  const index = buildIndex(files.map(([path, text]) => ({ path: `/fixture/public/${path}`, text })), { root: '/fixture/public' });
  return emissionsByTag(index, REMAKE_EMITTERS).by;
}
function gsjsScan(files) {
  const index = buildIndex(files.map(([path, text]) => ({ path: `/fixture/gsjs/${path}`, text })), { root: '/fixture/gsjs', sourceType: 'script' });
  return emissionsByTag(index, GSJS_EMITTERS, { qaRe: null }).by;
}
const side = (by) => ({ counters: by.counter || [], grants: by.grant || [] });

const GSJS_TRANSIT = [['locations/inc_transit.js', "function transit_schedule_departure(pc){ pc.achievements_increment('transit', 'subways_entered'); }\n"]];

describe('inventory scanner', () => {
  it('follows an imported constant into engine.achievement', () => {
    const by = remakeScan([['js/subway.js', SUBWAY_JS], ['js/features/subway-feature.js', FEATURE_JS]]);
    assert.deepEqual(by.counter.map((e) => e.text), ['transit:subways_entered']);
    assert.equal(by.counter[0].file, 'js/features/subway-feature.js');
  });

  it('reads counters pushed onto an array after its declaration (G147: resource-node counters)', () => {
    const by = remakeScan([
      ['js/nodes.js', `export function harvest(node) {\n  const achievementCounters = [];\n  if (node.kind === 'jellisac') achievementCounters.push({ counter: 'jellisac:scoop', amount: 1 });\n  achievementCounters.push(...[{ counter: 'dust_trap:trigger', amount: 1 }]);\n  return { ok: true, achievementCounters };\n}\n`],
      ['js/features/nodes-feature.js', `import { harvest } from '../nodes.js';\nfunction perform(engine, entity) {\n  const result = harvest(entity.node);\n  for (const c of result.achievementCounters || []) engine.achievement(c.counter, c.amount);\n}\n`],
    ]);
    const texts = by.counter.map((e) => e.text);
    assert.ok(texts.includes('jellisac:scoop'), texts.join(', '));
    assert.ok(texts.includes('dust_trap:trigger'), texts.join(', '));
  });

  it('lets a regex-guarded wildcard claim only a group its regexes can spell (G147: artifact badges)', () => {
    const wild = { wild: true, cons: { strings: new Set(), regexes: [/^(pet|feed)$/] } };
    assert.equal(prefixLabels([wild, ':feed'], 'artifacts_made:') instanceof Set, true);
    assert.equal(prefixLabels([wild, ':feed'], 'artifacts_made:').size, 0);
    assert.deepEqual([...prefixLabels([wild, ':x'], 'pet:')], ['x']);
  });

  it('binds wrapper params to their callers and templates to their parts', () => {
    const by = remakeScan([['js/f.js', `
      const GROUP = 'trants_petted';
      function emit(engine, counter, n = 1) { engine.achievement(counter, n); }
      export function pet(engine, t) { emit(engine, \`\${GROUP}:\${t.classId}\`); }
      export function row(c) { return { counter: 'player:deaths', amount: 1 }; }
      export function die(engine) { for (const { counter } of [row()]) engine.achievement(counter); }
    `]]);
    const texts = by.counter.map((e) => e.text).sort();
    assert.ok(texts.includes('trants_petted:*'), texts.join(' '));
    assert.ok(texts.includes('player:deaths'), texts.join(' '));
  });

  it('constrains an unbindable parameter to the guards of its own function', () => {
    const by = remakeScan([['js/a.js', `
      export function verbCounters(classTsid, verbId) {
        if (/^npc_(?:piggy|chicken)$/.test(classTsid) && ['pet', 'squeeze'].includes(verbId)) return [{ counter: \`\${classTsid}:\${verbId}\` }];
        return [];
      }
    `], ['game.js', `
      import { verbCounters } from './js/a.js';
      function run(target, verb) { for (const e of verbCounters(target.classId, verb)) applyAchievementProgress(state, e.counter, 1); }
    `]]);
    const pats = by.counter.map((e) => e.pattern);
    assert.ok(pats.some((p) => matchPattern(p, 'npc_piggy:pet')));
    assert.ok(!pats.some((p) => matchPattern(p, 'npc_fox:pet')));
  });

  it('reads GSJS this.class_tsid, this.method() returns and getClassProp', () => {
    const by = gsjsScan([
      ['items/emblem_alph.js', "function get_giant(){ return this.class_tsid.replace('emblem_', ''); }\nfunction getUnlock(pc){ var a = 'emblem_skill_unlock_'+this.get_giant()+'_1'; return a; }\nfunction go(pc){ pc.achievements_grant(this.getUnlock(pc)); }\n"],
      ['items/rookswort.js', "var classProps = { \"herb_buff\": \"rookswort\" };\nfunction munch(pc){ pc.buffs_apply(this.getClassProp('herb_buff')); }\n"],
    ]);
    assert.deepEqual(by.grant.map((e) => e.text), ['emblem_skill_unlock_alph_1']);
    assert.deepEqual(by.buff.map((e) => e.text), ['rookswort']);
  });
});

describe('inventory scanner: unresolved arguments', () => {
  const scan = (files) => {
    const index = buildIndex(files.map(([path, text]) => ({ path: `/fixture/public/${path}`, text })), { root: '/fixture/public' });
    return scanEmissions(index, REMAKE_EMITTERS);
  };

  it('skips a wrapper emitter that forwards its own parameter (its callers count)', () => {
    const r = scan([['game.js', `
      function applyAchievementProgressRaw(state, counter, amount) { return [counter, amount]; }
      function applyAchievementProgress(state, counter, amount = 1) { return applyAchievementProgressRaw(state, counter, amount); }
      const engine = { achievement(counter, amount = 1) { applyAchievementProgress(null, counter, amount); } };
      export function pet() { engine.achievement('npc_piggy:pet', 1); }
    `]]);
    assert.deepEqual(r.emissions.filter((e) => e.tag === 'counter').map((e) => `${e.callee} ${e.text}`), ['achievement npc_piggy:pet']);
    assert.equal(r.unresolved.length, 0);
    assert.deepEqual(r.passThrough.map((p) => p.callee).sort(), ['applyAchievementProgress', 'applyAchievementProgressRaw']);
  });

  it('does not report a literal empty counter as unresolved', () => {
    const r = scan([['js/a.js', "export function f(engine, row) { engine.achievement(row.label || '', 1); }"]]);
    assert.equal(r.unresolved.filter((u) => u.text === '').length, 0);
  });
});

describe('location detector: places rebuilt as scenes', () => {
  const street = (tsid, name) => ({ tsid, name, hubId: '61', hubName: 'Simple Level Quests' });
  const cats = (...ids) => new Map(ids.map((id) => [id, 'instance-template-no-geometry']));
  const rooms = { questRooms: { mental_block: 'mental_block', fall_quest: 'falling' }, builtRooms: ['mental_block', 'rainbow_run'], modulePath: (r) => `./${r.replace(/_/g, '-')}.js` };

  it('reads quest locations blocks, template literals, instance ids and config keys from GSJS text', () => {
    const quest = tsidRefsFromText('quests/mental_block.js', `var locations = {\n\t"mental_block"\t: {\n\t\t"dev_tsid"\t: "LDEV00000000001",\n\t\t"prod_tsid"\t: "LIF3NLRNBBA3HD2"\n\t}\n};\n`);
    assert.deepEqual(quest.map((r) => [r.tsid, r.quest, r.key, r.env]), [['LDEV00000000001', 'mental_block', 'mental_block', 'dev'], ['LIF3NLRNBBA3HD2', 'mental_block', 'mental_block', 'prod']]);
    const main = tsidRefsFromText('main.js', "function f(pc){\n\tif (x) {\n\t\tpc.events_add({ callback: 'instances_create_delayed', tsid: 'LIF9NRCLF273JBA', instance_id: 'rainbow_run', x: 816 }, 0.1);\n\t}\n}\n");
    assert.equal(main[0].instanceId, 'rainbow_run');
    const config = tsidRefsFromText('config_prod.js', "var paradise_locations = {\n\tsky_plunge: {template_tsid: 'LHFO01RM7I238UN', name: 'Sky Plunge'},\n};\n");
    assert.deepEqual([config[0].configVar, config[0].configKey], ['paradise_locations', 'sky_plunge']);
  });

  it('counts a built quest room, its instance id, a live TSID constant and a built config id as rebuilt', () => {
    const gsjsRefs = new Map([
      ['LIF3NLRNBBA3HD2', [{ tsid: 'LIF3NLRNBBA3HD2', file: 'quests/mental_block.js', line: 23, quest: 'mental_block', key: 'mental_block', env: 'prod' }]],
      ['LIF9NRCLF273JBA', [{ tsid: 'LIF9NRCLF273JBA', file: 'main.js', line: 1867, instanceId: 'rainbow_run' }]],
      ['LHF12N7BER53E0U', [{ tsid: 'LHF12N7BER53E0U', file: 'config_prod.js', line: 1314, configVar: 'paradise_locations', configKey: 'beam_me_down' }]],
    ]);
    const builders = new Map([['LLI1AD8LUCH109E', [{ file: 'js/rook-woods.js', line: 18, ctx: 'VariableDeclarator' }]]]);
    const remakeIds = new Map([['beam_me_down', [{ file: 'js/puzzle-scenes.js', line: 130, ctx: 'prop:id' }]]]);
    const ids = ['LIF3NLRNBBA3HD2', 'LIF9NRCLF273JBA', 'LLI1AD8LUCH109E', 'LHF12N7BER53E0U', 'LZZZ000000000001'];
    const rows = judgeLocations({ mapStreets: ids.map((t) => street(t, t)), index: {}, categories: cats(...ids), gsjsRefs, rooms, builders, remakeIds });
    assert.deepEqual(rows.map((r) => [r.status, r.detector]), [
      ['rebuilt', 'location-quest-room'], ['rebuilt', 'location-instance'], ['rebuilt', 'location-builder'], ['rebuilt', 'location-config-id'], ['missing', 'location-category'],
    ]);
    assert.match(rows[0].evidence, /js\/quest-rooms\/mental-block\.js/);
  });

  it('keeps a room missing when its quest room is not built, its builder is switched off or its category is excluded', () => {
    const gsjsRefs = new Map([['LFALL0000000001', [{ tsid: 'LFALL0000000001', file: 'quests/fall_quest.js', line: 9, quest: 'fall_quest', key: 'falling' }]]]);
    const declaredOff = new Map([['LA5FPUNAI7P2NVF', [{ file: 'js/hell.js', line: 256, ctx: 'prop:sourceTsid', off: true }]]]);
    const builders = new Map([['LSANDBOX0000001', [{ file: 'js/x.js', line: 1, ctx: 'VariableDeclarator' }]]]);
    const categories = new Map([['LFALL0000000001', 'instance-template-no-geometry'], ['LA5FPUNAI7P2NVF', 'live-region-other'], ['LSANDBOX0000001', 'wip-dev-hub']]);
    const rows = judgeLocations({ mapStreets: [street('LFALL0000000001', 'Fall'), street('LA5FPUNAI7P2NVF', 'Hell Bar'), street('LSANDBOX0000001', 'Sandbox')], index: {}, categories, gsjsRefs, rooms, builders, declaredOff, codeRefs: new Map([['LA5FPUNAI7P2NVF', ['js/hell.js']]]) });
    assert.deepEqual(rows.map((r) => r.status), ['missing', 'missing', 'excluded']);
    assert.match(rows[1].evidence, /switched off at js\/hell\.js:256/);
  });

  it('calls a quest room the remake plays on a stand-in street partial', () => {
    const gsjsRefs = new Map([['LIFH2AKJ5I735SV', [{ tsid: 'LIFH2AKJ5I735SV', file: 'quests/winter_walk.js', line: 28, quest: 'winter_walk', key: 'level_quest_winter_walk' }]]]);
    const [r] = judgeLocations({ mapStreets: [street('LIFH2AKJ5I735SV', 'Winter Walk')], index: {}, categories: cats('LIFH2AKJ5I735SV'), gsjsRefs, rooms, questStatus: new Map([['winter_walk', 'source']]) });
    assert.equal(r.status, 'partial');
    assert.equal(r.detector, 'location-quest-standin');
  });

  it('links a config_prod.js room to the quest that looks its key up', () => {
    const refs = readTsidRefs([
      { rel: 'config_prod.js', text: "var newxp_locations = {\n\tezcooking_1: 'LIFII3UBRFB3KBE',\n};\n" },
      { rel: 'quests/ezcooking_1.js', text: "function onStarted(pc){ pc.teleportToLocationDelayed(config.newxp_locations['ezcooking_1'], 123, -958); }\n" },
    ]);
    assert.deepEqual(refs.get('LIFII3UBRFB3KBE')[0].configQuests, ['ezcooking_1']);
    const [r] = judgeLocations({ mapStreets: [street('LIFII3UBRFB3KBE', "Breezy, EZ Cookin'")], index: {}, categories: cats('LIFII3UBRFB3KBE'), gsjsRefs: refs, rooms, questStatus: new Map([['ezcooking_1', 'source']]) });
    assert.equal(r.status, 'partial');
    assert.match(r.evidence, /quest ezcooking_1 looks up/);
  });

  it('takes builders only from live modules, leaves catalogs and comparisons out, and skips ambiguous config ids', () => {
    const index = buildIndex([
      ['game.js', "import { ROOK } from './js/rook-woods.js?v=rook-woods-9';\nexport { N } from './js/features/f.js';\nimport('./js/later.js');\nexport const x = ROOK;\n"],
      ['js/rook-woods.js', "export const ROOK = 'LLI1AD8LUCH109E';\nexport const SCENES = { beam: { id: 'beam_me_down' }, skill: { id: 'ezcooking_1' } };\n"],
      ['js/later.js', "export const HELL_BAR = Object.freeze({ sourceTsid: 'LA5FPUNAI7P2NVF', available: false });\nexport function here(t) { return t === 'LCHECK000000001'; }\n"],
      ['js/dead.js', "export const OLD = 'LDEAD0000000001';\n"],
      ['js/hub-maps-data.js', "export const M = { a: 'LMAPS0000000001' };\n"],
      ['js/features/f.js', "import { M } from '../hub-maps-data.js';\nexport const N = M;\n"],
    ].map(([path, text]) => ({ path: `/fixture/public/${path}`, text })), { root: '/fixture/public' });
    const live = liveFiles(index, ['game.js']);
    assert.deepEqual([...live].sort(), ['game.js', 'js/features/f.js', 'js/hub-maps-data.js', 'js/later.js', 'js/rook-woods.js']);
    const { builders, declaredOff, remakeIds } = locationBuilders({ ctx: contextLiterals(index), live, otherIds: new Set(['ezcooking_1']) });
    assert.deepEqual([...builders.keys()], ['LLI1AD8LUCH109E']);
    assert.deepEqual([...declaredOff.keys()], ['LA5FPUNAI7P2NVF']);
    assert.deepEqual([...remakeIds.keys()], ['beam_me_down']);
  });
});

describe('skill detector: partial', () => {
  const skill = { id: 'botany_1', name: 'Botany', level: 1, reqSkills: [], reqAchievements: [], reqQuests: [], reqUpgrades: [] };
  const base = {
    skills: [skill], audit: new Map([['botany_1', { status: 'live' }]]), statusOf: () => 'source',
    unlocks: new Map([['botany_1', [{ file: 'items/tree_poison.js', item: 'tree_poison' }, { file: 'items/bean_seasoner.js', item: 'bean_seasoner' }]]]),
    itemReachable: (id) => id !== 'tree_poison', remakeMentions: new Map([['botany_1', 3]]),
  };

  it('does not call a skill partial because it gates an item the remake lacks', () => {
    const [r] = judgeSkills(base);
    assert.equal(r.status, 'source');
    assert.match(r.evidence, /gates items the remake lacks \(judged as items\): tree_poison/);
  });

  it('calls it partial when a recipe the remake has drops the skill gate, or the audit says so', () => {
    assert.equal(judgeSkills({ ...base, gateGaps: new Map([['botany_1', ['recipe 99 Tree Poison']]]) })[0].status, 'partial');
    assert.equal(judgeSkills({ ...base, audit: new Map([['botany_1', { status: 'partial' }]]) })[0].status, 'partial');
  });
});

describe('achievement detector', () => {
  it('earns Subwayfarer when the ride counter is scanned', () => {
    const remake = side(remakeScan([['js/subway.js', SUBWAY_JS], ['js/features/subway-feature.js', FEATURE_JS]]));
    const original = side(gsjsScan(GSJS_TRANSIT));
    const [row] = judgeAchievements({ achievements: [SUBWAYFARER], remake, original });
    assert.equal(row.status, 'source');
    assert.match(row.evidence, /subway-feature\.js/);
  });

  it('regression: with the subway counter removed from the scan, Subwayfarer is unreachable', () => {
    const remake = side(remakeScan([['js/subway.js', SUBWAY_JS.replace("'transit:subways_entered'", "'transit:other'")], ['js/features/subway-feature.js', FEATURE_NO_COUNTER_JS]]));
    const original = side(gsjsScan(GSJS_TRANSIT));
    const [row] = judgeAchievements({ achievements: [SUBWAYFARER], remake, original });
    assert.equal(row.status, 'missing');
    assert.equal(row.blocker, 'transit');
    assert.match(row.evidence, /transit:subways_entered incremented nowhere/);
  });

  it('marks a badge the original never wired as unbuilt_original', () => {
    const remake = side(remakeScan([['js/x.js', 'export const A = 1;']]));
    const original = side(gsjsScan([['items/x.js', "function f(pc){ pc.achievements_increment('other', 'thing'); }"]]));
    const [row] = judgeAchievements({ achievements: [SUBWAYFARER], remake, original });
    assert.equal(row.status, 'unbuilt_original');
  });

  it('counts distinct labels for group_count and honours item vetoes', () => {
    const em = remakeScan([['js/x.js', "export function f(engine){ engine.achievement('hubs:a'); engine.achievement('hubs:b'); engine.achievement(`in_inventory:${engine.cls}`); }"]]).counter;
    assert.equal(conditionReach({ type: 'group_count', group: 'hubs', num: 2 }, em).ok, true);
    assert.equal(conditionReach({ type: 'group_count', group: 'hubs', num: 3 }, em).ok, false);
    const veto = (g, n) => (g === 'in_inventory' && n === 'rare' ? 'rare cannot be obtained' : null);
    assert.equal(conditionReach({ type: 'counter', group: 'in_inventory', name: 'apple', num: 1 }, em, veto).ok, true);
    assert.equal(conditionReach({ type: 'counter', group: 'in_inventory', name: 'rare', num: 1 }, em, veto).ok, false);
  });
});

describe('other detectors', () => {
  it('flags unreleased-category streets as unknown and imported ones as source', () => {
    const rows = judgeLocations({
      mapStreets: [{ tsid: 'LAAA', name: 'Main', hubId: '1', hubName: 'H' }, { tsid: 'LBBB', name: 'X Subway Station', hubId: '1', hubName: 'H' }, { tsid: 'LCCC', name: 'Sandbox', hubId: '2', hubName: 'WIP' }],
      index: { GAAA: { label: 'Main' } },
      categories: new Map([['LBBB', 'subway-unreleased'], ['LCCC', 'wip-dev-hub']]),
    });
    assert.deepEqual(rows.map((r) => r.status), ['source', 'unknown', 'excluded']);
  });

  it('tells a remake gap from an idea GSJS never applied, for buffs', () => {
    const rows = judgeBuffs({ ids: ['a', 'b', 'admin_x'], remake: [], original: [{ pattern: ['a'], text: 'a', file: 'f.js', line: 1 }] });
    assert.deepEqual(rows.map((r) => r.status), ['missing', 'unbuilt_original', 'excluded']);
  });

  it('does not count a catalog mention as a way to get an item', () => {
    const rows = judgeItems({
      items: [{ id: 'widget', label: 'Widget', tags: [], parents: ['takeable'], takeable: true, hidden: false, verbs: [] }],
      reach: new Map(), present: new Map(),
      codeCtx: new Map([['widget', [{ file: 'js/store-catalog.js', ctx: 'key', line: 1 }]]]),
      gsjsRefs: new Map([['widget', new Set(['items/catalog_stores.js'])]]),
    });
    assert.equal(rows[0].status, 'missing');
  });

  it('maps every system override to a real checklist item or gives it a status', () => {
    const overrides = JSON.parse(readFileSync(new URL('../tools/inventory/overrides.json', import.meta.url), 'utf8'));
    const ids = new Set(CHECKLIST.map((c) => c.id));
    for (const [k, v] of Object.entries(overrides)) {
      if (!k.startsWith('system:')) continue;
      assert.ok(v.status || [].concat(v.checklist).every((id) => ids.has(id)), `${k} -> ${v.checklist}`);
    }
  });
});

describe('item detector: items nobody can get (G125)', () => {
  const item = (id, extra = {}) => ({ id, label: id, tags: [], parents: [id, 'takeable'], takeable: true, hidden: false, verbs: [], ...extra });
  const judge = (items, { reach = new Map(), present = new Map(), refs = {} } = {}) => judgeItems({
    items, reach, present, codeCtx: new Map(),
    gsjsRefs: new Map(items.map((it) => [it.id, gsjsItemRefs(it.id, refs[it.id] || [])])),
  });

  it('does not count the Craftybot catalog or the item list as a use', () => {
    const refs = { beachball: ['items/beachball.js', 'items/catalog.js', 'items/catalog_craftytasking.js', 'eleven-gsjs/items/catalog_craftytasking.js'] };
    assert.equal(judge([item('beachball')], { refs })[0].status, 'unbuilt_original');
    refs.beachball.push('items/catalog_stores.js');
    assert.equal(judge([item('beachball')], { refs })[0].status, 'missing');
  });

  it('judges an item proxy variant with its base', () => {
    const rows = judge([item('rock_x_1'), item('rock_x_2', { proxy: 'rock_x_1' })], {
      present: new Map([['rock_x_1', 'street-ecology.json']]),
      refs: { rock_x_2: ['items/proto_rock.js'] },
    });
    assert.deepEqual(rows.map((r) => r.status), ['source', 'partial']);
  });

  it('excludes retired items, requirement icons and the item list itself', () => {
    const rows = judge([item('brick', { retiredTo: 'grade_aa_earth_block' }), item('quest_req_icon_x', { takeable: false, parents: [] }), item('catalog', { takeable: false, parents: [] })], {
      refs: { brick: ['quests/job_x.js'], quest_req_icon_x: ['quests/q.js'], catalog: ['items/a.js'] },
    });
    assert.deepEqual(rows.map((r) => r.status), ['excluded', 'excluded', 'excluded']);
    assert.match(rows[0].evidence, /grade_aa_earth_block/);
  });

  it('counts a quest room handing an item over (ctx.give) as a grant', () => {
    const by = remakeScan([
      ['js/quest-rooms/camp.js', "export function start(ctx) { ctx.give('juju_trowel', 1); }\n"],
      ['js/other.js', "export function f(ctx) { ctx.give('not_a_grant', 1); }\n"],
    ]);
    assert.deepEqual((by.item || []).map((e) => e.text), ['juju_trowel']);
  });
});

describe('item detector: taking an item is not a way to get it (G176)', () => {
  /** What the remake's pack grants reach, as build.mjs collect() computes it: Map id -> why. */
  const grantsOf = (files, itemIds) => {
    const index = buildIndex(files.map(([path, text]) => ({ path: `/fixture/public/${path}`, text })), { root: '/fixture/public' });
    const { by, unresolved } = emissionsByTag(index, REMAKE_EMITTERS);
    const w = inventoryWrites(index);
    return new Map(itemGrantReach({ index, emissions: [...(by.item || []), ...w.emissions], unresolved: [...unresolved, ...w.unresolved], itemIds: new Set(itemIds) }));
  };

  it('does not count a QA demo that reads params with engine.param?.() as a grant (item-verbs-more-feature.js setupDemo)', () => {
    const reach = grantsOf([
      ['js/demo.js', `import { addItem } from './inventory.js';
        const DEMO_ITEMS = ['butterfly_net'];
        export function setupDemo(engine) {
          if (engine.param?.('packverbdemo') !== '1') return;
          for (const cls of DEMO_ITEMS) addItem(engine.inv, cls, 1);
        }`],
    ], ['butterfly_net']);
    assert.equal(reach.has('butterfly_net'), false);
  });

  it('does not count a consumed item as a grant (hell-bar-feature.js and drink_ticket)', () => {
    const reach = grantsOf([
      ['js/hell.js', `export const TICKET_CLASS = 'drink_ticket';
        export function buyWine(state) {
          return { ok: true, effects: [{ type: 'consume_item', classTsid: 'drink_ticket', count: 1 }, { type: 'grant_item', classTsid: 'wine_of_the_dead', count: 1 }, { type: 'quest_flag', flag: 'buy_wotd' }] };
        }`],
      ['js/features/hell-bar-feature.js', `import { addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
        import { buyWine, TICKET_CLASS } from '../hell.js?v=g335-1';
        const TICKET = 'drink_ticket';
        function applyGrant(engine, result) {
          for (const e of result.effects) {
            if (e.type === 'consume_item') removeItem(engine.inv, e.classTsid, e.count);
            else if (e.type === 'grant_item') addItem(engine.inv, e.classTsid, e.count);
          }
        }
        export function buy(engine) { if (countItem(engine.inv, TICKET) < 1) return; applyGrant(engine, buyWine(engine.hell)); }
        export function talk(engine) { return countItem(engine.inv, TICKET_CLASS) > 0 ? 'ticket' : 'none'; }`],
    ], ['drink_ticket', 'wine_of_the_dead']);
    assert.ok(reach.has('wine_of_the_dead'), [...reach.keys()].join(','));
    assert.ok(!reach.has('drink_ticket'), reach.get('drink_ticket'));
  });

  it('does not let a dynamic grant claim the ids its file only removes, counts, compares or labels', () => {
    const reach = grantsOf([
      ['js/features/carve-feature.js', `import { addItem, countItem, removeItem, ensureItem } from '../inventory.js';
        ensureItem('homestreet_ticket', { label: 'Home Street Ticket' });
        export function carve(engine, out) {
          if (countItem(engine.inv, 'pumpkin') < 1) return { ok: false, reason: 'missing' };
          removeItem(engine.inv, 'pumpkin', 1);
          if (engine.demo === 'ball') engine.toast('ball');
          for (const [id, qty] of out.outputs) addItem(engine.inv, id, qty);
          return { ok: true };
        }`],
    ], ['pumpkin', 'ball', 'missing', 'homestreet_ticket']);
    assert.deepEqual([...reach.keys()], []);
  });

  it('follows a grant through a constant, a computed key and an imported constant', () => {
    const reach = grantsOf([
      ['js/small-items.js', `export const PLATE_OF_BEANS = 'plate_of_beans';
        export function chatCommand(text) { return text === '/beans' ? { command: 'beans', give: { [PLATE_OF_BEANS]: 1 } } : null; }`],
      ['js/features/small-items-feature.js', `import { addItem } from '../inventory.js';
        import { chatCommand } from '../small-items.js';
        export function runChatCommand(engine, text) {
          const cmd = chatCommand(text);
          if (!cmd) return null;
          for (const [cls, n] of Object.entries(cmd.give)) addItem(engine.inv, cls, n);
          return cmd;
        }`],
      ['js/hell-tickets.js', "export const TICKET_CLASS = 'drink_ticket';\n"],
      ['js/features/hell-tickets-feature.js', "import { addItem } from '../inventory.js';\nimport { TICKET_CLASS } from '../hell-tickets.js';\nfunction grantTicket(engine) { addItem(engine.inv, TICKET_CLASS, 1); }\nexport function onGrave(engine) { grantTicket(engine); }\n"],
    ], ['plate_of_beans', 'drink_ticket']);
    assert.match(reach.get('plate_of_beans') || '', /small-items-feature\.js/);
    assert.match(reach.get('drink_ticket') || '', /hell-tickets-feature\.js/);
  });

  it('counts a data table the dynamic grant reads, and not one it never touches', () => {
    const reach = grantsOf([
      ['js/cubimals.js', `import { addItem, removeItem } from './inventory.js';
        function cubimal(slug, cutoff) { return Object.freeze({ classTsid: \`npc_cubimal_\${slug}\`, slug, cutoff }); }
        const SERIES = { 1: [cubimal('piggy', 50), cubimal('fox', 100)] };
        const PRIZES = Object.freeze([{ classTsid: 'apple', w: 3 }, { classTsid: 'cherry', w: 1 }]);
        export const QUEST_NPCS = ['npc_piggy', 'magic_rock'];
        function selectCubimal(roll) { return SERIES[1].find((row) => roll <= row.cutoff); }
        export function openPackage(inv, roll) { if (!removeItem(inv, 'cubimal_package', 1)) return null; const prize = selectCubimal(roll); addItem(inv, prize.classTsid, 1); return prize; }
        export function rollPrize(inv, r) { const p = PRIZES.find((x) => x.w > r); addItem(inv, p.classTsid, 1); }`],
      ['game.js', "import { openPackage, rollPrize } from './js/cubimals.js';\nexport function open(inv) { openPackage(inv, Math.random() * 100); rollPrize(inv, 2); }\n"],
    ], ['npc_cubimal_piggy', 'npc_cubimal_fox', 'apple', 'cherry', 'npc_piggy', 'magic_rock', 'cubimal_package']);
    for (const id of ['npc_cubimal_piggy', 'npc_cubimal_fox', 'apple', 'cherry']) assert.ok(reach.has(id), `${id}: ${[...reach.keys()].join(',')}`);
    for (const id of ['npc_piggy', 'magic_rock', 'cubimal_package']) assert.ok(!reach.has(id), `${id}: ${reach.get(id)}`);
  });

  it('counts pack writes that add, skips ones that take, QA seeding and functions nothing calls', () => {
    const reach = grantsOf([
      ['js/rube.js', `export function trade(inv, give, take) { inv[take] = (Number(inv[take]) || 0) - 1; inv[give] = (Number(inv[give]) || 0) + 1; }
        export function swap(inv) { trade(inv, 'rube_gift', 'cherry'); }`],
      ['js/musicblocks.js', `import { addItem } from './inventory.js';
        const CATALOG = { musicblock_x: { classTsid: 'musicblock_x' } };
        export function collectMusicblock(inv, classTsid) { if (!CATALOG[classTsid]) return false; addItem(inv, classTsid, 1); return true; }`],
      ['js/features/tutorial-feature.js', `import { addItem } from '../inventory.js';
        export async function runTraining(engine, until) {
          await until(() => true, { help: () => engine.param('style') });
          addItem(engine.inv, 'homestreet_ticket', 1);
        }
        export function seed(engine) { const n = Number(engine.param('tickets')); if (n) addItem(engine.inv, 'drink_ticket', n); }`],
    ], ['rube_gift', 'cherry', 'musicblock_x', 'homestreet_ticket', 'drink_ticket']);
    assert.match(reach.get('rube_gift') || '', /inv\[id\] \+= at js\/rube\.js/);
    assert.ok(!reach.has('cherry'), reach.get('cherry'));
    assert.ok(!reach.has('musicblock_x'), reach.get('musicblock_x'));
    assert.ok(reach.has('homestreet_ticket'), 'a real grant beside a QA help callback');
    assert.ok(!reach.has('drink_ticket'), reach.get('drink_ticket'));
  });
});

describe('item detector: drop tables the remake rolls (G183)', () => {
  const TABLES = {
    cracker: { rows: [[50, [{ item: 'taster' }]], [100, [{ table: 'pieces' }]]] },
    pieces: { rows: [[100, [{ item: 'piece_1' }, { currants: 5 }]]] },
    package_table: { rows: [[100, [{ item: 'musicblock_x' }]]] },
    card_table: { rows: [[100, [{ item: 'flaming_x' }]]] },
    never_rolled: { rows: [[100, [{ item: 'orphan' }]]] },
    qa_only: { rows: [[100, [{ item: 'qa_prize' }]]] },
    own_helper: { rows: [[100, [{ item: 'wrong_table' }]]] },
  };
  const PACKAGES = {
    peat_harvest: { skills: { no_skill: { rank: 0, drop_class_id: 'package_table' } }, img_upgrades: { card: { rank: '1', drop_class_id: 'card_table' } } },
    unused_pkg: { skills: { no_skill: { rank: 0, drop_class_id: 'never_rolled' } } },
  };
  const reachOf = (files) => {
    const index = buildIndex(files.map(([path, text]) => ({ path: `/fixture/public/${path}`, text })), { root: '/fixture/public' });
    return new Map(dropTableReach({ emissions: dropRollEmissions(index), tables: TABLES, packages: PACKAGES }));
  };
  const FILES = [
    ['js/seasons.js', "export const CRACKER = { table: 'cracker' };\n"],
    ['js/features/seasons-feature.js', "import { rollDropTable } from '../drop-tables.js';\nimport { CRACKER } from '../seasons.js';\nexport function pull(rng) { return rollDropTable(CRACKER.table, rng); }\nfunction demo(engine) { return rollDropTable(engine.param('dropdemo') || 'qa_only'); }\n"],
    ['js/features/drops-feature.js', "import { rollPackageDrop } from '../drop-tables.js';\nexport function rollDropFor(engine, packageId) { return rollPackageDrop(packageId, {}); }\nexport function onPeat(engine) { return rollDropFor(engine, 'peat_harvest'); }\n"],
    ['js/resource-nodes.js', "function rollDropTable(id) { return []; }\nexport function trap() { return rollDropTable('own_helper'); }\n"],
  ];

  it('counts a table rolled through a constant, nested tables included, with the table as evidence', () => {
    const reach = reachOf(FILES);
    assert.match(reach.get('taster'), /^drop table cracker \(rolled at js\/features\/seasons-feature\.js:3\)$/);
    assert.match(reach.get('piece_1'), /drop table cracker .* via pieces$/);
  });

  it('follows a skill package to its drop tables, imagination overlays included', () => {
    const reach = reachOf(FILES);
    assert.match(reach.get('musicblock_x'), /drop table package_table \(skill package peat_harvest, rolled at js\/features\/drops-feature\.js:3\)/);
    assert.ok(reach.has('flaming_x'));
  });

  it('skips QA rolls, tables nothing rolls and a private helper of the same name', () => {
    const reach = reachOf(FILES);
    for (const id of ['orphan', 'qa_prize', 'wrong_table']) assert.ok(!reach.has(id), `${id}: ${reach.get(id)}`);
  });

  it('regression: without the cracker roll, the taster is not reachable', () => {
    const reach = reachOf(FILES.map(([p, t]) => [p, p.endsWith('seasons-feature.js') ? 'export function pull() { return null; }\n' : t]));
    assert.ok(!reach.has('taster'));
  });
});

describe('item detector: artifact and necklace assembly (G187)', () => {
  const ART = {
    nose: { artifact: 'artifact_nose', pieces: ['nose_piece1', 'nose_piece2'] },
    cube: { artifact: 'artifact_cube', pieces: ['cube_piece1', 'cube_piece2'] },
  };
  const NECK = { bead_x: { required: 17, produces: 'necklace_x' }, bead_y: { required: 19, produces: 'necklace_y' } };
  const GAME = "import { artifactsFeature } from './js/features/artifacts-feature.js?v=g403-1';\n";
  const FEATURE = "import { addItem } from '../inventory.js';\nimport { assemblyFor, consumeForAssembly } from '../artifacts.js';\n"
    + "function assemble(engine, plan) {\n  if (!consumeForAssembly(engine.inv, plan)) return false;\n  addItem(engine.inv, plan.artifact, 1);\n}\nexport const artifactsFeature = { assemble };\n";
  const sitesOf = (files) => assemblySites(buildIndex(files.map(([path, text]) => ({ path: `/fixture/public/${path}`, text })), { root: '/fixture/public' }));
  const LIVE = [['game.js', GAME], ['js/features/artifacts-feature.js', FEATURE], ['js/artifacts.js', 'export function consumeForAssembly(inv, plan) { return true; }\n']];
  const reached = (sites, have) => conversionFixpoint(new Map(have.map((id) => [id, 'drop table'])), assemblyConversions({ artifacts: ART, necklaces: NECK, sites }));

  it('finds the live assembly call site, not the rules module', () => {
    assert.deepEqual(sitesOf(LIVE), ['js/features/artifacts-feature.js:4']);
  });

  it('makes an artifact reachable only when every piece is, with the assembly and its pieces as evidence', () => {
    const reach = reached(sitesOf(LIVE), ['nose_piece1', 'nose_piece2', 'cube_piece1', 'bead_x']);
    assert.equal(reach.get('artifact_nose'), 'artifact assembly nose from nose_piece1 + nose_piece2 (js/artifacts.js ARTIFACT_MAP, assembled at js/features/artifacts-feature.js:4)');
    assert.ok(!reach.has('artifact_cube'), 'cube_piece2 is not reachable');
    assert.match(reach.get('necklace_x'), /^necklace assembly from 17 bead_x \(js\/artifacts\.js ARTIFACT_NECKLACES, assembled at /);
    assert.ok(!reach.has('necklace_y'));
  });

  it('regression: a feature that never assembles (or is not loaded, or only in QA) makes nothing', () => {
    const noCall = LIVE.map(([p, t]) => [p, p.endsWith('artifacts-feature.js') ? "import { assemblyFor } from '../artifacts.js';\nexport const artifactsFeature = {};\n" : t]);
    const unloaded = LIVE.map(([p, t]) => [p, p === 'game.js' ? 'export {};\n' : t]);
    const qaOnly = LIVE.map(([p, t]) => [p, p.endsWith('artifacts-feature.js') ? t.replace('if (!consumeForAssembly', "if (engine.param('artdemo') && !consumeForAssembly") : t]);
    for (const files of [noCall, unloaded, qaOnly]) {
      const sites = sitesOf(files);
      assert.deepEqual(sites, []);
      assert.ok(!reached(sites, ['nose_piece1', 'nose_piece2', 'bead_x']).has('artifact_nose'));
    }
  });

  it('follows the real tables in js/artifacts.js: 10 artifacts and 5 necklaces', () => {
    const rows = assemblyConversions({ artifacts: ARTIFACT_MAP, necklaces: ARTIFACT_NECKLACES, sites: ['x:1'] });
    assert.equal(rows.length, 15);
    const spork = rows.find((r) => r.outputs[0] === 'artifact_platinumium_spork');
    assert.deepEqual(spork.inputs, ['artifact_platinumium_spork_piece1', 'artifact_platinumium_spork_piece2']);
  });
});

describe('item detector: the SWFs really drop (G187)', () => {
  // GSJS catalog_drop_tables.js 335-365: barnacle_scraping rows 92/96/100 nest swfs_1/2/3 (2342-2362), as do
  // gardening_small/large, jellisac_scooping, light_green_thumb_small/large and tree_watering_small/large.
  // The scraping package's live imagination card barnacle_scraping_drop_1 drops from barnacle_scraping, and
  // resource-nodes-feature.js -> drops-feature.js rollResourceNodeDrop rolls it, so swf_1-3 land in the pack.
  const FILES = [
    ['js/features/drops-feature.js', "import { rollPackageDrop } from '../drop-tables.js';\nexport function rollDropFor(engine, packageId) { return rollPackageDrop(packageId, {}); }\n"
      + "export const RESOURCE_NODE_DROP_PACKAGES = Object.freeze({ 'mortar_barnacle:scrape': 'scraping' });\n"
      + "export function rollResourceNodeDrop(engine, result) {\n  const pkg = RESOURCE_NODE_DROP_PACKAGES[`${result.classTsid}:${result.verbId}`];\n  return pkg ? rollDropFor(engine, pkg) : null;\n}\n"],
  ];
  const reachOf = (files) => {
    const index = buildIndex(files.map(([path, text]) => ({ path: `/fixture/public/${path}`, text })), { root: '/fixture/public' });
    return new Map(dropTableReach({ emissions: dropRollEmissions(index), tables: DROP_TABLES, packages: SKILL_PACKAGES }));
  };

  it('reaches swf_1-3 through the scraping package and barnacle_scraping, naming the nested table', () => {
    const reach = reachOf(FILES);
    for (const n of [1, 2, 3]) assert.match(reach.get(`swf_${n}`), new RegExp(`^drop table barnacle_scraping \\(skill package scraping, rolled at js/features/drops-feature\\.js:6\\) via swfs_${n}$`));
  });

  it('nothing rolls swfs_1 by its own id: without a package roll the SWFs are not reached', () => {
    const reach = reachOf([['js/features/drops-feature.js', "export const RESOURCE_NODE_DROP_PACKAGES = { 'mortar_barnacle:scrape': 'scraping' };\n"]]);
    for (const n of [1, 2, 3]) assert.ok(!reach.has(`swf_${n}`));
  });
});

describe('inventory database', () => {
  it('records status changes between builds with the commit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inventory-'));
    try {
      const db = openDb(join(dir, 'inv.sqlite'));
      const e = (status) => ({ kind: 'achievement', id: 'subwayfarer', name: 'Subwayfarer', status, detector: 't', evidence: '', blocker: status === 'missing' ? 'transit' : undefined });
      const first = writeDb(db, { entities: [e('missing')], commits: [{ hash: 'abc1234', date: '2026-10-24', type: 'NEW', subject: '📦 NEW: The subway', register_rows: 'G115' }] }, { commit: 'aaa', at: '2026-10-24T00:00:00Z' });
      assert.equal(first.firstBuild, true);
      assert.deepEqual(blockerRows([e('missing')]).map((b) => [b.blocker, b.count]), [['transit', 1]]);
      const second = writeDb(db, { entities: [e('source')] }, { commit: 'bbb', at: '2026-10-24T01:00:00Z' });
      assert.deepEqual(second.changes, [{ kind: 'achievement', id: 'subwayfarer', from: 'missing', to: 'source' }]);
      const diff = lastDiff(db);
      assert.equal(diff.changes.length, 1);
      assert.equal(diff.changes[0].commit, 'bbb');
      assert.equal(summary(db).achievement.reachable, 1);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
