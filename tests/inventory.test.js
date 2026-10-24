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

import { buildIndex, matchPattern, scanEmissions } from '../tools/inventory/scan.mjs';
import { judgeAchievements, judgeBuffs, judgeLocations, judgeItems, conditionReach } from '../tools/inventory/detectors.mjs';
import { REMAKE_EMITTERS, GSJS_EMITTERS, emissionsByTag, openDb, writeDb, lastDiff, summary, blockerRows } from '../tools/inventory/build.mjs';
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
