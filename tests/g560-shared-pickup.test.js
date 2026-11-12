/**
 * Register G560 (report 137, the shared part): Pick up how many on a stack
 * shared with a public street online. The same chooser as everywhere else
 * (js/ui/count-chooser.js, starting on the whole stack) asks; only that many
 * (cut to what fits the pack) go to the picker and the rest stays on the
 * ground for everyone, its count updated on the street (drops.go
 * ground_left). As the source: main.js 3227-3240 splits the stack to the
 * count asked, takeable_pickup 53-102 adds what fits (addItemStack's
 * remainder stays), and the split part's rest goes back on the ground.
 *
 * The site (groddle-afternoon-site src/LedgerDrop.php) records each part
 * once as <drop>-t<from>, from being the count the realtime server held: a
 * retried ask answers as recorded, a count that is no longer there is
 * refused as stale, and two pickers at once never take more than lies there.
 * tests/fixtures/drops/ledger-drop-take.php runs that on a throwaway MariaDB
 * database (as tests/home-storage-ledger.test.js does), the race in two
 * processes. The server's side is drops_test.go.
 *
 * Run: GRODDLE_SITE_DIR=<site> node --test tests/g560-shared-pickup.test.js
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTakeOp, normalizeGroundStack, normalizeMine, pickupAsk, stackLeft } from '../public/js/drops-mp.js?v=ec6a135d';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?v=2fd8dcb9';
import { pickupCountToAsk } from '../public/js/world-items.js?v=b4795798';
import { HAS_SERVER, SITE_DIR, serverPath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const OP = 'drop-00000000000000a1';
const STREET = 'LA5101HF7F429V';

describe('the rules', () => {
  it('a shared stack of more than one asks how many, up to the whole stack', () => {
    const stack = normalizeGroundStack({ id: OP, c: 'cherry', n: 10, x: 0, y: 0 }, STREET);
    assert.equal(stack.shared, true);
    assert.equal(pickupCountToAsk(stack), 10);
    assert.equal(pickupCountToAsk(normalizeGroundStack({ id: OP, c: 'cherry', n: 1 }, STREET)), 0, 'one is one press');
  });

  it('sends a count only for a part: all of it, more, or none takes the whole stack as before', () => {
    assert.equal(pickupAsk(10, 4), 4);
    assert.equal(pickupAsk(10, 1), 1);
    for (const n of [10, 12, Infinity, undefined, 0, -3, Number.NaN]) assert.equal(pickupAsk(10, n), null, String(n));
    assert.equal(pickupAsk(1, 1), null);
  });

  it('a part\'s op is the stack\'s id, -t and the count it was taken from', () => {
    assert.equal(isTakeOp(`${OP}-t`, OP), true);
    assert.equal(isTakeOp(`${OP}-t10`, OP), true);
    assert.equal(isTakeOp(`${OP}-t9999`, OP), true);
    for (const op of [`${OP}-t0`, `${OP}-t01`, `${OP}-t10000`, `${OP}-tx`, `${OP}-t-1`, OP, 'drop-00000000000000a2-t10']) assert.equal(isTakeOp(op, OP), false, op);
    const part = normalizeMine({ op: `${OP}-t10`, side: 'took', id: OP, item: { c: 'cherry', n: 4 }, why: 'pickup' });
    assert.deepEqual(part, { op: `${OP}-t10`, id: OP, side: 'took', item: { c: 'cherry', n: 4 } });
    assert.equal(normalizeMine({ op: `${OP}-t10x`, id: OP, item: { c: 'cherry', n: 4 } }), null);
  });

  it('the rest keeps its dropper and says how many are left', () => {
    const s = normalizeGroundStack({ id: OP, c: 'cherry', n: 10, by: { id: 7, name: 'Ada' } }, STREET);
    const left = stackLeft(s, 6);
    assert.equal(left.count, 6);
    assert.equal(left.subtitle, 'Dropped by Ada · 6 in this pile');
    assert.equal(stackLeft(s, 0), null);
  });

  it('game.js sends the count chosen, cut to the pack\'s room, and drags still take the whole stack', () => {
    const game = read('public/game.js');
    const fn = game.slice(game.indexOf('function pickupDroppedWorldItem('), game.indexOf('function quoinFrames('));
    // The room check comes first, so a full pack refuses and a part that fits is all that is asked.
    assert.ok(fn.indexOf("features.query('packRoom', wantClass, wantCount, engine)") < fn.indexOf("features.query('sharedPickup'"));
    assert.match(fn, /features\.query\('sharedPickup', target, engine, room != null && room < wantCount \? room : wantCount\)/);
    // The menu's chooser leads here with "pickup:<n>"; anything else (a drag, one press) asks for Infinity: the whole stack.
    assert.match(game, /pickupDroppedWorldItem\(target, pickCount \? Number\(pickCount\) : Infinity\);/);
    assert.match(game, /const wantCount = Math\.min\(stackCount, Math\.max\(1, Math\.floor\(Number\(requested\)\) \|\| stackCount\)\);/);
  });
});

/** A realtime client as the feature sees it (js/realtime-client.js on/send). */
function fakeClient() {
  const handlers = {};
  return {
    state: 'online',
    street: STREET,
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
  };
}

describe('the feature online', () => {
  const client = fakeClient();
  const applied = new Set();
  const log = { toasts: [], redraws: 0 };
  let mine = [];
  const engine = {
    mode: 'multiplayer',
    started: true,
    streetTsid: STREET,
    dropTsid: STREET,
    inv: {},
    player: { x: 0, y: 0 },
    query(hook, op) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'ledgerReceipt') {
        if (applied.has(op)) return false;
        applied.add(op);
        return true;
      }
      return null;
    },
    redrawDroppedStacks: () => { log.redraws += 1; },
    setData: () => {},
    toast: (m) => log.toasts.push(m),
    pushActivity: () => {},
    playSound: () => {},
    floatText: () => {},
    refreshPack: () => {},
    save: () => {},
  };

  before(() => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const u = String(url);
      const body = u.includes('trade-items.json') ? { items: { cherry: {} }, untradeable: {} } : u.includes('groddle/v1/drops') ? { drops: mine } : {};
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    dropsMpFeature.init(engine);
    dropsMpFeature.onTick(16, 0, engine);
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  const shown = () => dropsMpFeature.sharedDroppedStacks(STREET, engine) || [];

  it('asks the server for the part chosen, and the whole stack with no count', () => {
    client.emit('msg:ground_state', { street: STREET, stacks: [{ id: OP, c: 'cherry', n: 10, x: 100, y: -20, by: { id: 7, name: 'Ada' } }] });
    assert.equal(shown()[0].count, 10);
    assert.equal(dropsMpFeature.sharedPickup({ state: { id: OP } }, engine, 4), true);
    assert.deepEqual(client.sent.at(-1), ['ground_pickup', { id: OP, n: 4 }]);
    assert.equal(globalThis.groddleDrops.picking.n, 4);
  });

  it('the picker gets that many once; the rest stays with its new count', () => {
    const taken = { t: 'ground_taken', op: `${OP}-t10`, id: OP, status: 'settled', item: { c: 'cherry', n: 4 } };
    client.emit('msg:ground_taken', taken);
    client.emit('msg:ground_left', { street: STREET, id: OP, n: 6, by: { id: 9, name: 'Bo' } });
    assert.equal(engine.inv.cherry, 4);
    assert.equal(shown()[0].count, 6);
    assert.equal(shown()[0].subtitle, 'Dropped by Ada · 6 in this pile');
    // The same answer again (a resend) moves nothing.
    client.emit('msg:ground_taken', taken);
    assert.equal(engine.inv.cherry, 4);
    // Another street's count is not this one's.
    client.emit('msg:ground_left', { street: 'LIF102FDNU11314', id: OP, n: 1 });
    assert.equal(shown()[0].count, 6);
  });

  it('all of what is left, or more, goes as the whole stack', () => {
    assert.equal(dropsMpFeature.sharedPickup({ state: { id: OP } }, engine, 6), true);
    assert.deepEqual(client.sent.at(-1), ['ground_pickup', { id: OP }]);
    client.emit('msg:ground_taken', { t: 'ground_taken', id: OP, status: 'refused', why: 'stale', text: 'That stack changed. Have another look.' });
    assert.equal(log.toasts.at(-1), 'That stack changed. Have another look.');
    assert.equal(engine.inv.cherry, 4, 'a refusal moves nothing');
  });

  it('a part the save missed comes from the site\'s list once, the one it has is not applied again', async () => {
    mine = [
      { op: `${OP}-t10`, side: 'took', id: OP, item: { c: 'cherry', n: 4 }, why: 'pickup' },
      { op: `${OP}-t6`, side: 'took', id: OP, item: { c: 'cherry', n: 2 }, why: 'pickup' },
    ];
    await globalThis.groddleDrops.sync();
    assert.equal(engine.inv.cherry, 6);
    await globalThis.groddleDrops.sync();
    assert.equal(engine.inv.cherry, 6);
  });

  it('the last of a stack leaves the street', () => {
    client.emit('msg:ground_left', { street: STREET, id: OP, n: 0 });
    assert.equal(shown().length, 0);
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
const hasPhp = spawnSync('php', ['-v']).status === 0;
const db = mysql();
const reachable = db && hasPhp && spawnSync('php', ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
const skipDb = skipWithoutSite
  || (!hasPhp && 'no php')
  || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
  || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

describe('the site records each part once (LedgerDrop)', { skip: skipDb }, () => {
  let r;
  before(() => {
    const out = execFileSync('php', [join(root, 'tests/fixtures/drops/ledger-drop-take.php'), engineDir, SITE_DIR, 'run', db.host, db.user, db.pass], { timeout: 90000 }).toString();
    r = JSON.parse(out);
  });
  const DROPPER = '7';
  const ADA = '9';
  const BO = '11';

  it('ran on its own database and dropped it', () => {
    assert.equal(r.error, undefined, r.error);
    assert.match(r.db, /^test_groddle_drops_[0-9a-f]{8}$/);
    assert.equal(r.dropped, true);
  });

  it('a part goes into the picker\'s ledger as <drop>-t<from>; the rest stays on the ground', () => {
    assert.equal(r.drop.status, 'settled');
    assert.deepEqual(r.afterDrop, { [DROPPER]: 10, [ADA]: 0, [BO]: 0 });
    assert.deepEqual(r.part, { status: 'settled', op: `${r.op}-t10`, item: { n: 4, c: 'cherry' }, n: 6 });
    assert.equal(r.afterPart.ledger[ADA], 4);
    assert.deepEqual([r.afterPart.row.count, r.afterPart.row.status], [6, 'ground']);
  });

  it('asked again (a retry, a lost answer) it answers as recorded and nothing more moves', () => {
    assert.deepEqual(r.retry, r.part);
    assert.equal(r.afterRetry.newTrades, 0);
    assert.deepEqual(r.afterRetry.ledger, r.afterPart.ledger);
    assert.equal(r.afterRetry.row.count, 6);
  });

  it('a count no longer there is refused as stale with the count there is, for anyone', () => {
    assert.deepEqual(r.staleSame, { status: 'refused', why: 'stale', n: 6 }, 'someone else cannot claim that part');
    assert.deepEqual(r.staleOther, { status: 'refused', why: 'stale', n: 6 });
    assert.equal(r.afterStale.newTrades, 0);
    assert.deepEqual(r.afterStale.ledger, r.afterPart.ledger);
  });

  it('two pickers at once asking 4 of the 6: one gets them, the other is told it changed', () => {
    const settled = r.race.filter((x) => x.status === 'settled');
    const stale = r.race.filter((x) => x.status === 'refused' && x.why === 'stale');
    assert.equal(settled.length, 1, JSON.stringify(r.race));
    assert.equal(stale.length, 1, JSON.stringify(r.race));
    assert.equal(settled[0].op, `${r.op}-t6`);
    assert.equal(stale[0].n, 2);
    assert.equal(r.afterRace.row.count, 2);
    assert.equal(r.afterRace.ledger[ADA] + r.afterRace.ledger[BO], 8);
  });

  it('a part and the whole at once on the last 2: never more than lay there', () => {
    assert.equal(r.afterRace2.ledger[ADA] + r.afterRace2.ledger[BO], 10, JSON.stringify(r.race2));
    assert.equal(r.afterRace2.ledger[DROPPER], 10, 'the dropper\'s ledger gave them up once, at the drop');
    assert.equal(r.afterRace2.row.status, 'taken');
    const whole = r.race2.find((x) => x.taker === Number(BO));
    assert.equal(whole.status, 'settled');
    assert.equal(whole.op, `${r.op}-t`);
    const part = r.race2.find((x) => x.taker === Number(ADA));
    // Either the part came first (1, then the whole took the 1 left) or the whole did (the part found it gone).
    if (part.status === 'settled') {
      assert.deepEqual([part.op, part.item.n, whole.item.n], [`${r.op}-t2`, 1, 1]);
      assert.equal(r.late.op, `${r.op}-t2`, 'asked again: as recorded');
    } else {
      assert.deepEqual([part.why, whole.item.n], ['gone', 2]);
      assert.equal(r.late.why, 'gone');
    }
  });

  it('a save that missed its parts gets each once from the list, and its load matches the ledger', () => {
    const ops = r.unappliedAda.map((e) => e.op);
    assert.ok(ops.includes(`${r.op}-t10`));
    assert.ok(r.unappliedAda.every((e) => e.side === 'took' && e.why === 'pickup' && e.id === r.op));
    assert.equal(r.unappliedAda.find((e) => e.op === `${r.op}-t10`).item.n, 4);
    for (const e of [...r.unappliedAda, ...r.unappliedBo]) assert.ok(normalizeMine(e), e.op);
    assert.equal(r.caughtUp.changed, true);
    assert.equal(r.caughtUp.cherry, r.afterRace2.ledger[ADA]);
    assert.deepEqual(r.caughtUp.applied.sort(), ops.sort());
    assert.deepEqual(r.adaWrite, { items: [], currants: 0 }, 'nothing to correct');
  });

  it('a stack already on the ground before parts: a part keeps the wear, then the rest goes home whole', () => {
    assert.equal(r.oldPart.status, 'settled');
    assert.match(r.oldPart.op, /-t3$/);
    assert.deepEqual(r.oldPart.item, { n: 1, c: 'pick', r: 40 });
    assert.equal(r.oldPart.n, 2);
    assert.deepEqual(r.oldReturnPart.item, { c: 'pick', n: 2, r: 40 });
    assert.deepEqual([r.oldRow.status, r.oldRow.why, r.oldRow.taker_id], ['taken', 'return', 7]);
    assert.deepEqual(r.oldUnappliedBo.map((e) => [e.side, e.why, e.item.n]), [['took', 'pickup', 1]], 'a part stays a pickup');
    assert.deepEqual(r.oldUnappliedDropper.map((e) => [e.side, e.why, e.item.n]), [['took', 'return', 2]]);
  });
});

describe('the site and the server agree on the words and the ids', () => {
  it('LedgerDrop takes a part only as a pickup of fewer than the stack holds', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
    const code = `require ${JSON.stringify(SITE_DIR)} . "/src/LedgerDrop.php"; use Groddle\\Minn\\LedgerDrop; echo json_encode([
      LedgerDrop::part('pickup', null, null), LedgerDrop::part('return', null, null), LedgerDrop::part('pickup', 4, 10),
      LedgerDrop::part('pickup', 10, 10), LedgerDrop::part('pickup', 0, 10), LedgerDrop::part('return', 4, 10), LedgerDrop::part('pickup', 4, null), LedgerDrop::part('pickup', 4, 10000),
      LedgerDrop::isTake('${OP}-t'), LedgerDrop::isTake('${OP}-t10'), LedgerDrop::isTake('${OP}-t0'), LedgerDrop::isTake('${OP}-t01'), LedgerDrop::isTake('${OP}'),
    ]);`;
    assert.deepEqual(JSON.parse(execFileSync('php', ['-r', code]).toString()), [true, true, true, false, false, false, false, false, true, true, false, false, false]);
  });

  it('drops.go sends the count and the street hears what is left', { skip: HAS_SERVER ? false : 'no server checkout' }, () => {
    const go = readFileSync(serverPath('drops.go'), 'utf8');
    assert.match(go, /\{"t":"ground_pickup","id":"drop-…","n":3\}/);
    assert.match(go, /"t": "ground_left", "street": s\.Street, "id": s\.ID, "n": left, "by": by/);
    assert.match(go, /call\["n"\], call\["from"\] = n, from/);
  });
});
