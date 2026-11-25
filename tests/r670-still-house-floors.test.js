/**
 * Report #670: "Hooch maker that was in backyard has vanished." The site's house-floor move (G1224,
 * v0.63.0: groddle-afternoon-site src/HouseFloors.php plan/stays) took a Still out of its owner's save
 * (RH_HOME_INT, the back yard is part of it) onto the shared floor, though the game keeps a Still the
 * player's own where it works (#285, js/drops-mp.js shareReason 'works'). On the shared floor it has no
 * Distill or Collect, anyone in the house may take it, and it is drawn only while that window holds the
 * realtime connection. Glitch: a Still in a home kept working and only the owner could pick it up
 * (items/still.js canPickup 386-389).
 *
 * - The rule is one list: js/drops-mp.js KEPT_OWN, which tools/build-economy.mjs writes into the site's
 *   economy table as each class's "own", which HouseFloors::stays reads (R5).
 * - A tool stack's points line up with its first tools, the rest full (js/world-items.js pointsFor):
 *   [40] on three picks is one worn and two full, which the shared floor's one wear cannot keep.
 * - The one-time return (HouseFloors::returnKept, bin/house-floors.php return-kept) on a throwaway
 *   MariaDB database: tests/fixtures/drops/house-floors-kept.php.
 * - The game: a Still the owner picks up from the shared floor comes with its hopper and Hooch, and
 *   dropped again it goes into their own save with them (drops-mp-feature, game.js dropPackItem).
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/r670-still-house-floors.test.js (MariaDB as
 * tests/house-floors-migrate.test.js finds it).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEPT_OWN, shareReason } from '../public/js/drops-mp.js?v=499b0363';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=r670';
import { copyTags, createToolConditionState, keepsOwnStack } from '../public/js/tools.js?v=4156bba8';
import { createDroppedItemState, dropInventoryStack } from '../public/js/world-items.js?v=a5deb102';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OP = 'drop-00000000000000c7';
const WORDS = { hopper: 13, hooch: 39, workingSince: 0 };

/** A PHP that runs (the FrankenPHP wrapper's php -v fails: tests that need PHP skip there). */
function php() {
  for (const cmd of [['php'], ['php', '-d', 'extension=mysqli']]) {
    if (spawnSync(cmd[0], [...cmd.slice(1), '-r', 'exit(function_exists("mysqli_report") ? 0 : 1);']).status === 0) return cmd;
  }
  return spawnSync('php', ['-r', 'exit(0);']).status === 0 ? ['php'] : null;
}
const PHP = php();
const skipPhp = skipWithoutSite || (!PHP && 'no php');

/** HouseFloors::plan on one save (the site's, without the database). */
function plan(rows, houseX = 1650) {
  const entries = {
    droppedItems: JSON.stringify({ version: 1, nextId: 50, streets: { RH_HOME_INT: rows } }),
    playerState: JSON.stringify({ systems: { features: { homes: { houseX } } } }),
  };
  return JSON.parse(execFileSync(PHP[0], [...PHP.slice(1), join(root, 'tests/fixtures/drops/house-floors-plan.php'), SITE_DIR, '633', JSON.stringify(entries)], { encoding: 'utf8' }));
}
const still = { id: 'world-item-45', streetTsid: 'RH_HOME_INT', classTsid: 'still', count: 1, x: 418, y: 680, droppedAt: 1794788359836, points: [0], tags: [{ ...WORDS, ready: true }] };

describe('#670 a Still in the back yard stays the player\'s own', () => {
  it('the game keeps a Still (and a note) the player\'s own in their house, the back yard too', () => {
    const table = { items: { still: {}, note: {}, apple: {} } };
    assert.equal(shareReason('still', table, { street: 'HOUSE_633', ownHome: true }), 'works');
    assert.equal(shareReason('note', table, { street: 'HOUSE_633' }), 'note');
    assert.equal(shareReason('apple', table, { street: 'HOUSE_633', ownHome: true }), '');
    assert.deepEqual(KEPT_OWN, { note: 'note', still: 'works' });
  });

  it('the site\'s house-floor move leaves it in the save', { skip: skipPhp }, () => {
    const out = plan([still]);
    assert.deepEqual(out.moves.map((m) => m.c), [], `moved to the shared floor: ${JSON.stringify(out.moves)}`);
    assert.deepEqual(out.kept, { works: 1 });
  });

  it('one list: the site reads the game\'s KEPT_OWN from its economy table (R5)', { skip: skipPhp }, () => {
    assert.deepEqual(plan([]).own, KEPT_OWN, 'node tools/build-economy.mjs writes it');
    const economy = JSON.parse(readFileSync(join(SITE_DIR, 'data/economy.json'), 'utf8'));
    const own = Object.fromEntries(Object.entries(economy.items).filter(([, r]) => r.own).map(([c, r]) => [c, r.own]));
    assert.deepEqual(own, KEPT_OWN);
    const src = readFileSync(join(SITE_DIR, 'src/HouseFloors.php'), 'utf8');
    assert.doesNotMatch(src, /=== 'note'|=== 'still'/, 'no second hand-kept copy of the list');
  });

  it('what else moves: plank, earth, a script with its words; a tool stack worn unlike its full ones stays', { skip: skipPhp }, () => {
    const script = { tsid: 'LA5101HF7F429V', x: 120, y: -80, label: 'Groddle Meadow', hubId: '27', hubName: 'Groddle Meadow', imbued: false };
    const out = plan([
      { id: 'world-item-1', classTsid: 'plank', count: 4, x: 1800, y: 620 },
      { id: 'world-item-2', classTsid: 'earth', count: 2, x: 1810, y: 620 },
      { id: 'world-item-3', classTsid: 'teleportation_script', count: 1, x: 1820, y: 620, tags: [script] },
      { id: 'world-item-4', classTsid: 'pick', count: 1, x: 1830, y: 620, points: [40] },
      { id: 'world-item-5', classTsid: 'pick', count: 3, x: 1840, y: 620, points: [40] },
      { id: 'world-item-6', classTsid: 'pick', count: 2, x: 1850, y: 620, points: [40, 40] },
    ]);
    assert.deepEqual(out.moves.map((m) => [m.c, m.n, m.r]), [['plank', 4, null], ['earth', 2, null], ['teleportation_script', 1, null], ['pick', 1, 40], ['pick', 2, 40]]);
    assert.deepEqual(JSON.parse(out.moves[2].t), script, 'a script keeps its destination on the shared floor');
    assert.deepEqual(out.kept, { wear: 1 }, '[40] on three picks: one worn, two full');
  });
});

/** The database to make the throwaway one on: GRODDLE_TEST_MYSQL, else the local groddle.localhost's wp-config. */
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
const mysqli = PHP && spawnSync(PHP[0], [...PHP.slice(1), '-r', 'exit(function_exists("mysqli_report") ? 0 : 1);']).status === 0;
const reachable = db && mysqli && spawnSync(PHP[0], [...PHP.slice(1), '-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!mysqli && 'no php with mysqli')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the moved Stills go back to their owners once (HouseFloors::returnKept)', { skip: skipDb }, () => {
  let r;
  before(() => {
    r = JSON.parse(execFileSync(PHP[0], [...PHP.slice(1), join(root, 'tests/fixtures/drops/house-floors-kept.php'), engineDir, SITE_DIR, 'run', db.host, db.user, db.pass], { timeout: 120000 }).toString());
  });

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_kept_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('as v0.63.0 moved them: the Still with its words, beside apples and a script with its destination', () => {
    assert.deepEqual(r.newRule, { works: 1 }, 'today\'s rule keeps it');
    assert.equal(r.moved.ground, 9);
    assert.deepEqual(r.moved.stillWords, WORDS);
    assert.equal(r.moved.scriptWords.tsid, 'LA5101HF7F429V');
    assert.equal(r.moved.floor500, 0);
    assert.deepEqual([r.write500, r.write502], [{ items: [], currants: 0 }, { items: [], currants: 0 }]);
    assert.equal(r.take501, 'settled');
  });

  it('the dry run says what it would do, per user id, and writes nothing', () => {
    assert.deepEqual(r.dry, [
      { user: 500, back: 1, outcomes: { back: { still: 1 } } },
      { user: 501, back: 0, outcomes: { taken: { still: 1 } } },
      { user: 502, back: 0, outcomes: { spot: { still: 1 } } },
    ]);
    assert.equal(r.dryWrote, 0);
    assert.deepEqual(r.run, r.dry);
  });

  it('the Still is back in the save where it stood, its hopper and Hooch with it, and the rest as it is', () => {
    assert.deepEqual(r.after.floor, ['world-item-48:cherry', 'world-item-45:still'], 'the Cherry dropped since stays');
    assert.deepEqual(r.after.still.tags, [{ ...WORDS, ready: true }]);
    assert.deepEqual([r.after.still.x, r.after.still.y], [418, 680]);
    assert.deepEqual(r.after.stillStatus, { status: 'reverted', why: 'kept' }, 'off the shared floor');
    assert.deepEqual(r.after.shared500, ['apple', 'teleportation_script'], 'what is shared stays shared');
    assert.deepEqual(r.after.pack, { apple: 2, cherry: 0 }, 'never into the pack');
    assert.equal(r.after.version, 1);
    assert.equal(r.after.writer, '', 'a window open on the old copy is asked before it writes again');
    assert.equal(r.after.ledgerStill, 1);
    assert.equal(r.after.ledgerMatches, true);
    assert.deepEqual(r.after.write, { items: [], currants: 0 });
  });

  it('one picked up since, or with the owner\'s own Still at that spot now, is left as it is', () => {
    assert.deepEqual(r.after.still501, { status: 'taken', why: 'pickup' });
    assert.deepEqual(r.after.still502, { status: 'ground', why: '' });
    assert.equal(r.after.floor502, 1, 'one Still in 502\'s save, theirs');
  });

  it('a second run does nothing', () => {
    assert.deepEqual(r.again.map((a) => a.back), [0, 0, 0]);
    assert.deepEqual(r.again[0].outcomes, { done: { still: 1 } });
    assert.equal(r.againWrote, 0);
  });

  it('a window kept over the copy from before the move ends with the Still on its floor, words and all, not a bare one in its pack', () => {
    assert.deepEqual(r.takeover.floor, ['world-item-45:still']);
    assert.deepEqual(r.takeover.still, [{ ...WORDS, ready: true }]);
    assert.equal(r.takeover.pack.still, undefined);
    assert.deepEqual(r.takeover.write, { items: [], currants: 0 });
  });
});

describe('the command and the kept copy\'s catch-up', { skip: skipWithoutSite }, () => {
  const read = (f) => readFileSync(join(SITE_DIR, f), 'utf8');
  it('bin/house-floors.php return-kept lists by default and writes only with apply', () => {
    const bin = read('bin/house-floors.php');
    assert.match(bin, /'return-kept'/);
    assert.match(bin, /HouseFloors::returnKept\(\$db, \$ledger, \(int\) \$r\['user_id'\], time\(\), \$apply\)/);
    assert.match(bin, /\$apply = in_array\('apply', \$argv2, true\);/);
  });
  it('Ledger::applyOne puts a stack put back on a kept copy\'s floor', () => {
    assert.match(read('src/Ledger.php'), /\(\$back = HouseFloors::backOf\(\$this->db, \$user, \$p\['trade'\]\)\) !== null => HouseFloors::catchUpBack\(\$entries, \$back\)/);
  });
});

/** A realtime client as the feature sees it (js/realtime-client.js on/send). */
function fakeClient() {
  const handlers = {};
  return {
    state: 'online',
    street: 'HOUSE_7',
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}
const tick = () => new Promise((res) => setTimeout(res, 30));

describe('the game: a Still the owner picks up from the shared floor goes back into their save when dropped', () => {
  const TABLE = { items: { still: { max: 1, tag: 'still' }, apple: { max: 50 } }, untradeable: {} };
  const client = fakeClient();
  const applied = new Set();
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: 'RH_HOME_INT',
    dropTsid: 'RH_HOME_INT',
    inv: {},
    toolState: createToolConditionState(),
    player: { x: 500, y: 680 },
    query(hook, op) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'homeDropOrigin') return { owner: 7, room: 'interior', floor: 0, houseX: 1650, own: true };
      if (hook === 'ledgerReceipt') {
        if (applied.has(op)) return false;
        applied.add(op);
        return true;
      }
      return null;
    },
    redrawDroppedStacks: () => {},
    setData: () => {},
    toast: () => {},
    pushActivity: () => {},
    playSound: () => {},
    floatText: () => {},
    refreshPack: () => {},
    save: () => {},
  };

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
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('picked up: the Still comes into the pack with its hopper and Hooch', () => {
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: [{ id: OP, c: 'still', n: 1, x: 418 - 1650, y: 680, t: WORDS, by: { id: 7, name: 'Ada' }, at: 1 }] });
    const list = dropsMpFeature.sharedDroppedStacks('RH_HOME_INT', engine);
    assert.equal(list[0].x, 418, 'drawn in the back yard');
    assert.equal(dropsMpFeature.sharedPickup({ state: list[0] }, engine, 1), true);
    assert.deepEqual(client.sent.at(-1)[0], 'ground_pickup');
    client.emit('msg:ground_taken', { op: `${OP}-t`, id: OP, status: 'settled', item: { c: 'still', n: 1, t: WORDS } });
    assert.equal(engine.inv.still, 1);
    assert.deepEqual(copyTags(engine.toolState, 'still'), [WORDS]);
  });

  it('dropped again in the house it is not shared: the game puts it in the save with its words', () => {
    const sent = client.sent.length;
    assert.equal(dropsMpFeature.sharedDrop({ classTsid: 'still', count: 1, x: 418, y: 680 }, engine), null, 'game.js drops it as its own');
    assert.equal(client.sent.length, sent, 'nothing sent to the server');
    // game.js dropPackItem's own drop: the leaving copies' words, a Still on its own (leavingToolTags, keepsOwnStack).
    const ground = createDroppedItemState();
    const down = dropInventoryStack(ground, engine.inv, 'RH_HOME_INT', 'still', 1, { x: 418, y: 680 }, { tags: copyTags(engine.toolState, 'still'), merge: !keepsOwnStack('still') });
    assert.equal(down.ok, true);
    assert.deepEqual(down.stack.tags, [WORDS]);
    assert.equal(engine.inv.still, 0);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function dropPackItem('), game.indexOf('function dropPackItem(') + 4000);
    assert.ok(fn.indexOf("features.query('sharedDrop'") < fn.indexOf('dropInventoryStack('), 'the shared drop is asked first, then the own drop');
    assert.match(fn, /tags: leavingToolTags\(classTsid, count\)/);
  });
});
