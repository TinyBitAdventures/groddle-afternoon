/**
 * G1301 (#696, Austin 2026-11-25): a finished Group Hall shows whose it is. "We finished a group
 * project on Archimedes and nothing happened": the hall only toasted, hid its lot and said its
 * street was not in the archive. Glitch hid the lot, named the hall's location after the group
 * ("A Private Group" for a private one), made the group its owner and opened a members-only
 * signpost (GameServerJS quests/quest.js 1831-1863); no hall street survives (G331), so for now:
 *
 * - Menu > Groups: a group that owns a hall names it on its row and in its details ("Group Hall:
 *   Archimedes Acres"), from the site's card (src/Groups.php `hall`, the LedgerHall row once
 *   built; tests/fixtures/groups/group-halls.php on a throwaway database) and the hall's street
 *   (js/group-hall-lot.js HALL_STREETS). The panel's DOM test is in tests/groups.test.js.
 * - On the hall's street the lot stays, Tiny Speck's roped plot and sign with "<group>'s Group
 *   Hall" over it (the server's row: hall.owned and the group's shown name), and visiting it says
 *   the street is not open yet.
 * - The finish dialog and the toast say the hall is the group's and its street opens later.
 *
 * Run: GRODDLE_SITE_DIR=<site checkout> node --test tests/g1301-group-hall-owned.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { streetJobsFeature, projectApi } from '../public/js/features/street-jobs-feature.js?v=3dd8fb24';
import { HALL_STREETS, LOT_CLASS, LOT_PLACEMENT, LOT_SIGN_X, OWNED_TEXT, hallStreetName, lotOwner, ownedVerb } from '../public/js/group-hall-lot.js?v=045c799a';
import { HALL_TEXT } from '../public/js/street-jobs-mp.js?v=1ccfc0c0';
import { hallOf, normalizeGroup, normalizeGroups } from '../public/js/groups.js?v=c5e35964';
import { Display, FakeEl, fakePixi } from './fake-scene.js';
import { GAME_DIR, HAS_SITE, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const catalog = JSON.parse(read('assets/content/street-jobs.json'));
const index = JSON.parse(read('assets/streets/index.json'));
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const ARCHIMEDES = 'GLI32N0F1UD114O'; // hall job 692, the one in #696

describe('the hall streets (js/group-hall-lot.js HALL_STREETS)', () => {
  it('names each of the ten halls by the street its lot stands on, as the catalog and the street index do', () => {
    assert.deepEqual(Object.keys(HALL_STREETS).sort(), Object.keys(catalog.halls.jobs).sort());
    for (const [id, job] of Object.entries(catalog.halls.jobs)) {
      assert.equal(HALL_STREETS[id].tsid, job.connecting[0], id);
      assert.equal(HALL_STREETS[id].name, index.streets[job.connecting[0]].label, id);
    }
    assert.equal(hallStreetName('692'), 'Archimedes Acres');
    assert.equal(hallStreetName(692), 'Archimedes Acres');
    assert.equal(hallStreetName('86'), '', 'not a hall');
  });

  it('words a finished hall plainly, with no em dash', () => {
    assert.equal(OWNED_TEXT.name('Experimental Builder'), "Experimental Builder's Group Hall");
    assert.equal(OWNED_TEXT.name('A Private Group'), "A Private Group's Group Hall");
    assert.equal(OWNED_TEXT.row('Archimedes Acres'), 'Group Hall: Archimedes Acres');
    for (const t of [OWNED_TEXT.name('X'), OWNED_TEXT.row('Y'), OWNED_TEXT.details('Y'), OWNED_TEXT.closed, HALL_TEXT.noStreet, HALL_TEXT.owned('X'), HALL_TEXT.built('X', 'Y'), HALL_TEXT.finished('X', 'Y')]) {
      assert.ok(!t.includes('—'), t);
      assert.ok(!/public archive|never made one/.test(t), t);
    }
    assert.equal(HALL_TEXT.built('Experimental Builder', 'Archimedes Acres'), 'Experimental Builder owns the Group Hall on Archimedes Acres! Its street will open in a later update.');
    assert.equal(HALL_TEXT.finished('Experimental Builder', 'Archimedes Acres'), 'The Group Hall belongs to Experimental Builder now. Its street will open in a later update. Until then, its lot on Archimedes Acres and Menu > Groups show whose hall it is.');
  });
});

describe('the owner from the rows (lotOwner)', () => {
  const cat = { jobs: { 692: { kind: 'hall' }, 86: { kind: 'street' } } };
  it('is the group of a finished hall the server says is owned, else nobody', () => {
    const owned = { 692: { hall: { owned: true, group: { id: 3, name: 'Experimental Builder' } } } };
    assert.deepEqual(lotOwner([{ jobId: '692', status: 'done' }], cat, owned), { jobId: '692', group: 'Experimental Builder' });
    assert.equal(lotOwner([{ jobId: '692', status: 'open' }], cat, owned), null, 'still on offer');
    assert.equal(lotOwner([{ jobId: '692', status: 'done' }], cat, { 692: { hall: { owned: false, group: { name: 'G' } } } }), null, 'the site has not settled it');
    assert.equal(lotOwner([{ jobId: '692', status: 'done' }], cat, {}), null, 'no row yet');
    assert.equal(lotOwner([{ jobId: '86', status: 'done' }], cat, { 86: { hall: { owned: true, group: { name: 'G' } } } }), null, 'not a hall');
  });

  it('visiting it is one verb, named for the hall', () => {
    assert.deepEqual(ownedVerb({ group: 'G' }), { id: 'visit', label: 'visit', enabled: true, tooltip: "G's Group Hall", durationMs: 0 });
  });
});

describe('the site\'s card (js/groups.js normalizeGroup)', () => {
  it('reads the hall a group owns, and nothing for a group without one or an unknown job', () => {
    assert.deepEqual(normalizeGroup({ id: 3, name: 'Experimental Builder', hall: { job: '692' } }).hall, { job: '692', street: 'Archimedes Acres' });
    assert.equal(normalizeGroup({ id: 3, name: 'X', hall: null }).hall, null);
    assert.equal(normalizeGroup({ id: 3, name: 'X' }).hall, null);
    assert.equal(hallOf({ job: '86' }), null, 'not a hall');
    assert.equal(hallOf({ job: '<b>692' }).job, '692');
    const list = normalizeGroups({ groups: [{ id: 3, name: 'A', hall: { job: '694' } }], invites: [{ id: 4, name: 'B', hall: { job: '692' } }] });
    assert.equal(list.groups[0].hall.street, 'Addingfoot Trip');
    assert.equal(list.invites[0].hall.street, 'Archimedes Acres');
  });
});

describe('the lot on the hall\'s street (multiplayer)', () => {
  let engine;
  let client;
  const data = {};
  const toasts = [];
  const awards = [];
  const saved = {};
  const listeners = new Map();
  const emit = (msg) => { for (const fn of listeners.get(`msg:${msg.t}`) || []) fn(msg); };
  // The server's row for hall 692 (projects.go rowJSON, group_halls.go hallJSON), finished and owned.
  const ownedRow = (name) => ({ phase: 1, got: {}, mine: {}, held: {}, votes: {}, top: [], count: 2, started: 1, ready: 0, done: Date.now() - 1000, option: '', hall: { claim: 200, minutes: 180, claimed: true, claiming: false, owned: true, until: 0, by: { id: 7, name: 'Bo' }, group: { id: 3, name } } });

  before(async () => {
    for (const k of ['document', 'window', 'fetch', 'PIXI']) saved[k] = globalThis[k];
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body: new FakeEl('body'), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      const rel = String(url).split('?')[0].replace(/^\//, '');
      try {
        return { ok: true, status: 200, json: async () => JSON.parse(read(rel)) };
      } catch {
        return { ok: false, status: 404, json: async () => null };
      }
    };
    client = {
      state: 'online',
      me: { id: 1, name: 'Bo' },
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      // The world says hall 692 is built (project_world); the street's row comes after it (project_street).
      send(t) { if (t === 'project_sync') queueMicrotask(() => emit({ t: 'project_world', now: Date.now(), built: { 692: { at: Date.now() - 1000, option: '' } }, rest: {} })); return true; },
    };
    engine = {
      mode: 'multiplayer',
      started: true,
      PIXI: fakePixi,
      entityLayer: new Display(),
      fxLayer: new Display(),
      streetTsid: ARCHIMEDES,
      street: { tsid: ARCHIMEDES },
      player: { x: 500, y: 800 },
      interactables: [],
      inv: {},
      pc: { level: 10, energy: 500, mood: 100, currants: 0 },
      learnedSkills: [],
      unlockedAchievements: ['you_have_papers'],
      param: () => null,
      placement: (key) => (key === LOT_PLACEMENT.key ? [{ x: 1400, y: 900 }] : []),
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      register: (t) => t,
      unregister: (t) => t.sprite?.destroy?.(),
      say() {},
      setData: (k, v) => { data[k] = v; },
      toast: (t) => toasts.push(t),
      award: (a) => awards.push(a),
      playSound() {},
      prompt() {},
      pushActivity() {},
      floatText() {},
      updateHud() {},
      refreshPack() {},
      save() {},
      achievement() {},
      grantAchievement() {},
      visitedStreets: () => [ARCHIMEDES],
    };
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    await projectApi.ready();
  });

  after(() => {
    streetJobsFeature.onStreetClear(engine);
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  const enter = async () => {
    streetJobsFeature.onStreetClear(engine);
    streetJobsFeature.onStreetEnter(engine.street, engine);
    await wait(5);
  };
  const owner = () => engine.entityLayer.children.find((c) => c.label === 'group-hall-lot-owner' && !c.destroyed);

  it('names the group over the lot once the server\'s row says it owns the hall', async () => {
    await enter();
    assert.equal(streetJobsFeature._state().lot, null, 'built, the owner not known yet: no offer');
    emit({ t: 'project_street', now: Date.now(), jobs: { 692: ownedRow('Experimental Builder') } });
    streetJobsFeature.onTick(16, Date.now(), engine);
    const lot = streetJobsFeature._state().lot;
    assert.deepEqual(lot, { jobId: '692', x: 1400, side: 1, signX: Math.round(1400 + LOT_SIGN_X), owner: 'Experimental Builder', label: "Experimental Builder's Group Hall", plate: true });
    assert.ok(engine.entityLayer.children.some((c) => c.label === 'group-hall-lot-plot' && !c.destroyed), 'Tiny Speck\'s roped plot stays');
    assert.ok(engine.entityLayer.children.some((c) => c.label === 'group-hall-lot-sign' && !c.destroyed), 'and its sign');
    assert.ok(owner(), 'the name over the sign');
    assert.ok(!engine.fxLayer.children.some((c) => c.label === 'job-indicator-lot' && !c.destroyed), 'no project bubble: it offers nothing');
    assert.ok(streetJobsFeature.placementGroups({}, { tsid: ARCHIMEDES }).some((g) => g.key === LOT_PLACEMENT.key), 'the next visit keeps its floor run');
  });

  it('G1312: its street is built, so the lot\'s one verb is enter (tests/g1312-group-hall-street.test.js), and it opens no project', () => {
    const target = { classId: LOT_CLASS, featureId: 'street-jobs', sprite: new Display() };
    const verbs = streetJobsFeature.verbsFor(target, engine);
    assert.deepEqual(verbs.map((v) => [v.id, v.label, v.tooltip, v.enabled]), [['enter', 'enter', "Go into Experimental Builder's Group Hall", true]]);
    data.streetJobPanel = '';
    assert.equal(streetJobsFeature.runVerb(target, 'enter', engine), true);
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.ok(!data.streetJobPanel, 'no panel');
  });

  it('stays on the next visit, and a private group\'s hall is "A Private Group\'s Group Hall"', async () => {
    await enter();
    assert.equal(streetJobsFeature._state().lot?.owner, 'Experimental Builder');
    emit({ t: 'project_street', now: Date.now(), jobs: { 692: ownedRow('A Private Group') } });
    streetJobsFeature.onTick(16, Date.now(), engine);
    assert.equal(streetJobsFeature._state().lot.label, "A Private Group's Group Hall");
    assert.equal(engine.entityLayer.children.filter((c) => c.label === 'group-hall-lot-owner' && !c.destroyed).length, 1, 'one name, redrawn');
  });

  it('the toast says whose hall it is and (G1312, its street built) that its members go in from the lot', () => {
    toasts.length = 0;
    emit({ t: 'project_built', now: Date.now(), job: '692', at: Date.now(), option: '', rest: {}, hall: { group: { id: 3, name: 'Experimental Builder' } } });
    assert.ok(toasts.includes('Experimental Builder owns the Group Hall on Archimedes Acres! Its members can go in from the lot.'), toasts.join(' | '));
  });

  it('the finish dialog says the hall belongs to the group and (G1312) where its members go in', async () => {
    const job = catalog.halls.jobs['692'];
    const [p0, p1] = job.phases.map((p) => p.classTsid);
    awards.length = 0;
    emit({
      t: 'project_reward', id: 'job-r-692-1-g1301-1', job: '692', phase: 1, cls: p1, final: true, share: 0, participation: 0,
      rewards: { xp: 0, currants: 0, mood: 0, energy: 0, favor: [] }, performance: { xp: 0, mood: 0, energy: 0, currants: 0, items: [], favor: [] },
      winner: false, top5: false, phases: 1, option: '', readyAt: 0, count: 3, cost: 0, total: 100, finisher: false, shares: { [p0]: 50, [p1]: 50 }, complete: true,
    });
    await wait(5);
    const text = JSON.stringify(awards);
    assert.match(text, /The Group Hall belongs to Experimental Builder now\. Its members can go in from its lot on Archimedes Acres\./);
    assert.doesNotMatch(text, /public archive|never made one/);
  });
});

// —— The site (src/Groups.php) on a throwaway database ——
function mysql() {
  const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
  if (env) {
    const [host, user, ...pass] = env.split(/\s+/);
    return { host, user, pass: pass.join(' ') };
  }
  const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
  if (!existsSync(cfg)) return null;
  const text = readFileSync(cfg, 'utf8');
  const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
  const host = def('DB_HOST');
  const user = def('DB_USER');
  return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
}
const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
const hasPhp = HAS_PHP;
const phpArgs = hasPhp && spawnSync(PHP, ['-r', 'exit(class_exists("mysqli") ? 0 : 1);']).status !== 0 ? ['-d', 'extension=mysqli'] : [];
const db = mysql();
const reachable = db && hasPhp && spawnSync(PHP, [...phpArgs, '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = (!HAS_SITE && 'no site repo')
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the site\'s groups say which hall each owns (Groups.php, a throwaway database)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [...phpArgs, join(GAME_DIR, 'tests/fixtures/groups/group-halls.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 60000 }).toString());
  });

  it('Menu > Groups: a built hall is the group\'s; a claim under way, one that ran out and one lost are not', () => {
    assert.equal(r.mine.status, 200, r.mine.error);
    assert.deepEqual(r.mine.halls, { 'Zz Builders': { job: '692' }, 'Zz Hopefuls': null, 'Zz Late Ones': null, 'Zz Quiet Ones': { job: '694' } });
  });

  it('an invitation and Find Groups carry it too', () => {
    assert.deepEqual(r.invites, { 'Zz Quiet Ones': { job: '694' } });
    assert.deepEqual(r.search, { 'Zz Late Ones': null, 'Zz Hopefuls': null, 'Zz Builders': { job: '692' } }, 'the public groups only');
  });

  it('a group\'s details carry it, to whoever may see the group', () => {
    assert.deepEqual(r.show, {
      'builders by Cy': { status: 200, hall: { job: '692' } },
      'quiet by Ada': { status: 200, hall: { job: '694' } },
      'quiet by Cy (invited)': { status: 200, hall: { job: '694' } },
      'quiet by Di (outside)': { status: 404, hall: null },
      'hopeful by Cy': { status: 200, hall: null },
    });
  });
});
