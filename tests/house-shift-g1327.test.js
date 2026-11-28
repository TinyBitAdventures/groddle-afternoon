/**
 * G1327 (R50, from #728): do the shared house stacks (G1190: the realtime server's and the site's) move
 * with the house as the save's own stacks do?
 *
 * - The back yard growing (homes-feature growYard, syncHouseShift): not reproduced. drops.go keeps a
 *   house stack's x from the house's left end (dropOrigin, the "ox" every game sends since 001f410 /
 *   3b091e2a9b8), and every game draws it from the house's x as it draws it now (drops-mp-feature
 *   placeOf, home-street-mp-feature dropOrigin: the scene's houseX, houseX0), so a shared stack keeps its
 *   place beside the house exactly as syncHouseShift keeps the save's own (shiftInteriorRows). The yard
 *   never shrinks (home-cultivation expandYard only adds). The first group pins that down.
 * - Un-expanding the house: reproduced. homes_unexpand (GameServerJS locations/inc_homes.js 154-183) moved
 *   every item in the last 300 px of the house 150 px left (166-172), the ground stacks too. The game moved
 *   only the furniture (home-decor.js unexpandInterior); the save's own stacks were clamped inside the new
 *   wall (keepStacksInHouse, ground floor only) and the shared ones stayed where they were, so a stack by
 *   the old right wall (where the Door is: you arrive there) lay past the new one, out of sight and out of
 *   reach, and the owner's own stacks at home never go back (drops.go dropKeep). Now the save's own stacks
 *   on every floor move 150 px left with the furniture (shiftUnexpandedStacks, shiftRowsFrom) and the game
 *   tells the server (ground_shift), which moves the shared ones on every floor of the house (or on the
 *   Tower floor) through the site in one transaction, once (drops_shift.go, LedgerDrop::shiftStacks: the
 *   last group runs it on a throwaway database). A game or server from before leaves them where they were.
 *
 * Run: node --test tests/house-shift-g1327.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { shiftInteriorRows, shiftRowsFrom } from '../public/js/features/homes-feature.js?v=6c2d961d';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=g1327';
import { shiftAnswerWaitMs } from '../public/js/online-request.js?v=5fa7a635';
import { GAME_DIR, SITE_DIR } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const read = (p) => readFileSync(join(GAME_DIR, p), 'utf8');
const OP_A = 'drop-00000000000000a1';
const OP_B = 'drop-00000000000000b2';
const TABLE = { items: { cherry: { food: true }, apple: {} }, untradeable: {} };

function fakeClient(street) {
  const handlers = {};
  return {
    state: 'online',
    street,
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 30));
const stack = (id, c, x) => ({ id, c, n: 1, x, y: 620, by: { id: 7, name: 'Ada' }, at: 1 });

const client = fakeClient('HOUSE_7');
let origin = { owner: 7, room: 'interior', floor: 0, houseX: 750, own: true };
const engine = {
  mode: 'multiplayer',
  started: true,
  streetTsid: 'RH_HOME_INT',
  dropTsid: 'RH_HOME_INT',
  inv: {},
  player: { x: 900, y: 620 },
  data: {},
  query(hook) {
    if (hook === 'realtimeClient') return client;
    if (hook === 'homeDropOrigin') return origin;
    return null;
  },
  collect(hook, tsid) {
    return hook === 'sharedDroppedStacks' ? dropsMpFeature.sharedDroppedStacks(tsid, engine) || [] : [];
  },
  redrawDroppedStacks: () => {},
  setData(k, v) { this.data[k] = v; },
  toast: () => {},
  pushActivity: () => {},
  playSound: () => {},
  refreshPack: () => {},
  save: () => {},
};
const drawnX = (id) => dropsMpFeature.sharedDroppedStacks('RH_HOME_INT', engine)?.find((s) => s.id === id)?.x;
const shiftsSent = () => client.sent.filter(([k]) => k === 'ground_shift');

before(async () => {
  globalThis.document = { baseURI: 'https://groddle.localhost/' };
  globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
  globalThis.fetch = async (url) => {
    const body = String(url).includes('trade-items.json') ? TABLE : { drops: [] };
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  dropsMpFeature.init(engine);
  dropsMpFeature.onTick(16, 0, engine);
  await tick();
  // The server's stacks in the house, x from the house's left end: one mid-room, one by the right wall.
  client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(OP_A, 'apple', 1000), stack(OP_B, 'cherry', 1900)] });
});
after(() => {
  delete globalThis.document;
  delete globalThis.GRODDLE_MP_BOOT;
  delete globalThis.fetch;
  delete globalThis.groddleDrops;
});

describe('the back yard grows: shared stacks already keep their place beside the house (not reproduced)', () => {
  it('a yard segment more moves the house 150 px right, and the shared stack with it, as syncHouseShift moves the save\'s own', () => {
    assert.equal(drawnX(OP_A), 1750, 'drawn from the house\'s left end (750)');
    const own = [{ id: 'world-item-1', x: 1750 }];
    // growYard: yardLeft + 1; houseX0 is homeStreetLayout(backCult).houseX, 150 px more (tests/back-yard.test.js).
    origin = { ...origin, houseX: 900 };
    shiftInteriorRows(own, 150);
    assert.equal(drawnX(OP_A), 1900);
    assert.equal(own[0].x, 1900, 'the save\'s own stack at the same spot');
    assert.equal(drawnX(OP_A) - origin.houseX, 1000, 'still 1000 px into the house');
    origin = { ...origin, houseX: 750 };
  });

  it('the house\'s x the stacks are drawn from is the scene\'s houseX, the back yard\'s width now (houseX0)', () => {
    const mp = read('public/js/features/home-street-mp-feature.js');
    assert.match(mp, /house: \{ roomX: st\?\.scene\?\.background\?\.houseX \|\| 0/);
    assert.match(mp, /if \(w === 'house'\) return \{ owner: me\(\), room: 'interior', floor: 0, houseX: ownGeometry\(\)\.house\.roomX, own: true \}/);
    const homes = read('public/js/features/homes-feature.js');
    assert.match(homes, /const x0 = opts\.yard \? houseX0\(\) : 0;/);
    assert.match(homes, /function houseX0\(\) \{\n {2}return homeStreetLayout\(backCult\)\.houseX;/);
  });
});

describe('un-expanding the house moves what lies in its last 300 px 150 px left (homes_unexpand 166-172)', () => {
  it('the save\'s own stacks: those at the stretch\'s start or right of it move, the rest stay', () => {
    const rows = [{ x: 2499 }, { x: 2500 }, { x: 2650 }, { x: 'x' }];
    assert.equal(shiftRowsFrom(rows, 2500, -150), 2);
    assert.deepEqual(rows.map((r) => r.x), [2499, 2350, 2500, 'x']);
    assert.equal(shiftRowsFrom(rows, NaN, -150), 0);
    assert.equal(shiftRowsFrom(null, 0, -150), 0);
  });

  it('un-expand moves the save\'s own stacks on every floor of the house (or the Tower floor) and tells the shared floor', () => {
    const homes = read('public/js/features/homes-feature.js');
    const un = homes.slice(homes.indexOf('function unexpandHouse(engine)'), homes.indexOf('function growYard('));
    assert.match(un, /shiftUnexpandedStacks\(engine, result\.edge\);/);
    const fn = homes.slice(homes.indexOf('function shiftUnexpandedStacks('), homes.indexOf('/** DecorateToolbarUI Un-expand'));
    assert.match(fn, /\[towerDropTsid\(scene\.tower\), 0\]/, 'a Tower floor: its own stacks, from its own 0');
    assert.match(fn, /\[HOME_INTERIOR_TSID, savedHouseX \?\? houseX0\(\)\]/, 'the ground floor: from the house\'s left end the rows were saved against');
    assert.match(fn, /floors\.upper\.map\(\(_, i\) => \[`\$\{HOUSE_FLOOR_DROP_PREFIX\}\$\{i \+ 1\}`, 0\]\)/, 'each upper floor, from its own 0');
    assert.match(fn, /shiftRowsFrom\(ownGroundRows\(engine, tsid\), x0 \+ edge, -SEGMENT_W\)/);
    assert.match(fn, /engine\.query\?\.\('homeStacksShifted', \{ from: edge, dx: -SEGMENT_W \}, engine\)/);
  });

  it('the owner\'s game tells the server the shift once, and the stacks move when the server says where they are', () => {
    client.sent.length = 0;
    assert.equal(dropsMpFeature.homeStacksShifted({ from: 1750, dx: -150 }, engine), true);
    assert.deepEqual(shiftsSent(), [['ground_shift', { from: 1750, dx: -150 }]]);
    // A second un-expand before the answer waits its turn.
    assert.equal(dropsMpFeature.homeStacksShifted({ from: 1600, dx: -150 }, engine), true);
    assert.equal(shiftsSent().length, 1);
    // Never sent twice on a timer (the server may have applied it).
    dropsMpFeature.onTick(16, 0, engine);
    assert.equal(shiftsSent().length, 1);
    client.emit('msg:ground_shifted', { op: 'shift-0000000000000001', status: 'settled', n: 1 });
    assert.equal(engine.data.dropShift, 'settled:1');
    assert.deepEqual(shiftsSent().at(-1), ['ground_shift', { from: 1600, dx: -150 }], 'then the next');
    // Refused as busy (another shift still waiting there): asked again after a moment, not applied twice.
    client.emit('msg:ground_shifted', { status: 'refused', why: 'busy', n: 0 });
    assert.equal(shiftsSent().length, 2);
    assert.equal(globalThis.groddleDrops.shifts.length, 1);
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [stack(OP_A, 'apple', 1000), stack(OP_B, 'cherry', 1750)] });
    assert.equal(drawnX(OP_B), 2500, 'the stack by the old wall, 150 px left, as everyone there sees it');
    assert.equal(drawnX(OP_A), 1750);
  });

  it('only for the owner, at their own house or Tower floor, and only homes_unexpand\'s 150', () => {
    const was = origin;
    client.sent.length = 0;
    origin = { ...was, own: false };
    assert.equal(dropsMpFeature.homeStacksShifted({ from: 1750, dx: -150 }, engine), null, 'a visitor');
    origin = was;
    assert.equal(dropsMpFeature.homeStacksShifted({ from: 1750, dx: -300 }, engine), null);
    assert.equal(dropsMpFeature.homeStacksShifted({ from: 'x', dx: -150 }, engine), null);
    assert.equal(shiftsSent().length, 0);
  });

  it('R26: a shift sent waits as long as the server can take, on js/online-request.js, and a late answer stays its own', () => {
    const realNow = Date.now;
    let t = realNow() + 2000;
    Date.now = () => t;
    try {
      client.sent.length = 0;
      // The 1600 shift refused as busy above goes again after its moment.
      dropsMpFeature.onTick(16, 0, engine);
      assert.deepEqual(shiftsSent(), [['ground_shift', { from: 1600, dx: -150 }]]);
      // drops_shift.go can take 10 s, then 21 site calls with 20 pauses of 15 s: over 6 minutes is not given up.
      t += 6 * 60 * 1000 + 1;
      dropsMpFeature.onTick(16, 0, engine);
      assert.equal(globalThis.groddleDrops.shifts.length, 1, 'still waiting on its answer');
      assert.notEqual(engine.data.dropShift, 'no-answer');
      t += shiftAnswerWaitMs() - 6 * 60 * 1000;
      dropsMpFeature.onTick(16, 0, engine);
      assert.equal(globalThis.groddleDrops.shifts.length, 0);
      assert.equal(engine.data.dropShift, 'no-answer');
      // The next un-expand goes; a busy refusal (at once, no op) is its own, the site's late word the old one's.
      assert.equal(dropsMpFeature.homeStacksShifted({ from: 1450, dx: -150 }, engine), true);
      assert.deepEqual(shiftsSent().at(-1), ['ground_shift', { from: 1450, dx: -150 }]);
      client.emit('msg:ground_shifted', { status: 'refused', why: 'busy', n: 0 });
      assert.equal(globalThis.groddleDrops.shifts[0]?.from, 1450);
      assert.equal(globalThis.groddleDrops.shifts[0]?.sent, false, 'asked again after a moment');
      client.emit('msg:ground_shifted', { op: 'shift-0000000000000002', status: 'settled', n: 2 });
      assert.equal(engine.data.dropShift, 'settled:2');
      assert.equal(globalThis.groddleDrops.shifts[0]?.from, 1450, 'the late answer does not settle the next one');
      t += 1001;
      dropsMpFeature.onTick(16, 0, engine);
      client.emit('msg:ground_shifted', { op: 'shift-0000000000000003', status: 'settled', n: 0 });
      assert.equal(globalThis.groddleDrops.shifts.length, 0);
      assert.equal(engine.data.dropShift, 'settled:0');
    } finally {
      Date.now = realNow;
    }
  });
});

/** The database to make the throwaway one on (as tests/floor-merge.test.js). */
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
const db = mysql();
const reachable = db && HAS_PHP && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = (!existsSync(join(SITE_DIR, 'src/LedgerDrop.php')) && 'no site repo')
  || phpSkip('mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the site moves the shared stacks of the owner\'s floors at once, once (LedgerDrop::shiftStacks)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP, [join(GAME_DIR, 'tests/fixtures/drops/ledger-drop-shift.php'), engineDir, SITE_DIR, 'run', db.host, db.user, db.pass], { timeout: 90000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.equal(r.dropped, true);
  });

  it('only homes_unexpand\'s shift, of the owner\'s own floors, each named once', () => {
    assert.deepEqual(r.call.streets, ['HOUSE-7', 'HOUSE-7-1', 'HOUSE-7-2']);
    assert.deepEqual(r.bad, { dx: null, op: null, street: null, twice: null, from: null });
    assert.deepEqual(r.other, { status: 'refused', why: 'place' }, 'another player names her floors');
    assert.deepEqual(r.afterOther, r.before);
  });

  it('a transaction that fails moves nothing and records nothing', () => {
    assert.deepEqual(r.afterFailed, r.before);
  });

  it('every stack on the ground at x >= from on the house\'s floors moves 150 px left; nothing else', () => {
    const want = { ...r.before, 'drop-00000000000000a1': 1750, 'drop-00000000000000c3': 1650, 'drop-0000000000000017': 1600 };
    assert.deepEqual(r.afterFirst, want);
    assert.deepEqual(r.first, { status: 'settled', moved: [{ id: 'drop-0000000000000017', x: 1600 }, { id: 'drop-00000000000000a1', x: 1750 }, { id: 'drop-00000000000000c3', x: 1650 }] });
  });

  it('asked again (its answer lost): nothing moves twice, the same answer', () => {
    assert.deepEqual(r.retry, r.first);
    assert.deepEqual(r.afterRetry, r.afterFirst);
    assert.equal(r.logged, 1);
  });
});
