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

import { buildIndex, contextLiterals, liveFiles, matchPattern, scanEmissions } from '../tools/inventory/scan.mjs';
import { judgeAchievements, judgeBuffs, judgeLocations, judgeItems, judgeSkills, conditionReach, gsjsItemRefs } from '../tools/inventory/detectors.mjs';
import { readTsidRefs, tsidRefsFromText } from '../tools/inventory/gsjs-data.mjs';
import { REMAKE_EMITTERS, GSJS_EMITTERS, emissionsByTag, locationBuilders, openDb, writeDb, lastDiff, summary, blockerRows } from '../tools/inventory/build.mjs';
import { CHECKLIST } from '../tools/restoration/checklist.mjs';

const SUBWAY_JS = `export const RIDE_COUNTER = 'transit:subways_entered';\nexport const OTHER = 'x';\n`;
const FEATURE_JS = `import { RIDE_COUNTER } from '../subway.js?v=2';\nfunction board(engine) { engine.achievement(RIDE_COUNTER, 1); }\n`;
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
      ['game.js', "import { ROOK } from './js/rook-woods.js?v=2';\nexport { N } from './js/features/f.js';\nimport('./js/later.js');\nexport const x = ROOK;\n"],
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
