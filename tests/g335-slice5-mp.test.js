/**
 * G335 slice 5: the shared acts the realtime server used to believe the
 * client about. Food that sates a street Piggy, a Rook Balm's full revive and
 * Sneezing and Sparkle Powder are used through the site's signed ledger/use
 * (src/LedgerUse.php) before anyone else sees them; a Piggy no longer eats
 * food only one player sees; the tool behind a shared take is confirmed
 * through ledger/has; a use whose answer was lost is given back
 * (ledger/use/void). The server side is groddle-afternoon-server
 * objects_uses.go, objects_tools.go, objects_pigs.go, rook.go, hi.go and
 * proofs.go (its Go tests); the design is glitch-audit
 * research/coverage/g335-economy.md (section 9, slice 5 as built).
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVER_DIR, SITE_DIR, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';
import { actMessage } from '../public/js/street-objects.js?v=fe7ee133';
import { powdersFeature } from '../public/js/features/powders-feature.js?v=9c281316';
import { tradeTable } from '../tools/build-realtime-trade.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || !hasPhp;
const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function php(op, args) {
  const code = `
    foreach (['Economy', 'LedgerMath', 'LedgerCredits', 'Ledger', 'LedgerUse'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{Economy, LedgerMath, LedgerCredits, Ledger, LedgerUse};
    $in = json_decode(stream_get_contents(STDIN), true);
    $a = $in['args'];
    $out = match ($in['op']) {
      'savedLeft' => LedgerUse::savedLeft($a[0], $a[1]),
      'catchUp' => LedgerUse::catchUp($a[0], ['trade' => $a[1], 'gave' => $a[2], 'got' => ['items' => [], 'currants' => 0]]),
      'usable' => LedgerUse::usable($a[0], $a[1]),
      'held' => LedgerUse::held($a[0], $a[1]),
      'classes' => LedgerUse::CLASSES,
    };
    echo json_encode($out);`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args }) })));
}

/** A save's entries with this pack and these feature slices. */
function save(inv = {}, features = {}) {
  return { playerState: JSON.stringify({ version: 7, inventory: inv, player: { currants: 0 }, systems: { features } }) };
}

describe('the ledger uses the new jars and whole items (LedgerUse)', { skip }, () => {
  it('knows Sneezing and Sparkle Powder and the Rook Balm, five charges each', () => {
    const classes = php('classes', []);
    assert.deepEqual(classes.sneezing_powder, [5, 'powders', 'charges']);
    assert.deepEqual(classes.sparkle_powder, [5, 'powders', 'charges']);
    assert.deepEqual(classes.potion_rook_balm, [5, 'rook-attack', 'balmPoints', true]);
    // GSJS: maxCharges 5 for both powders, points_capacity 5 for the balm.
    const gsjs = join(root, '..', 'glitch-GameServerJS', 'items');
    for (const [file, re] of [['sneezing_powder.js', /"maxCharges"\s*:\s*"5"/], ['sparkle_powder.js', /"maxCharges"\s*:\s*"5"/], ['potion_rook_balm.js', /"points_capacity"\s*:\s*"5"/]]) {
      try { assert.match(readFileSync(join(gsjs, file), 'utf8'), re, file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  });

  it('reads the open Rook Balm from the rook slice\'s one number, 0 meaning none open', () => {
    assert.equal(php('savedLeft', [save({ potion_rook_balm: 1 }, { 'rook-attack': { balmPoints: 3 } }), 'potion_rook_balm']), 3);
    assert.equal(php('savedLeft', [save({ potion_rook_balm: 1 }, { 'rook-attack': { balmPoints: 0 } }), 'potion_rook_balm']), null);
    assert.equal(php('savedLeft', [save({ sparkle_powder: 1 }, { powders: { charges: { sparkle_powder: 2 } } }), 'sparkle_powder']), 2);
  });

  it('a load applies an emptied balm: out of the pack, the tube closed, the op applied', () => {
    const entries = save({ potion_rook_balm: 2 }, { 'rook-attack': { balmPoints: 1, stats: { balms: 4 } }, trade: { applied: [] } });
    const out = php('catchUp', [entries, 'use-00000000000000a1', { items: { potion_rook_balm: 1 }, currants: 0 }]);
    const s = JSON.parse(out.playerState);
    assert.equal(s.inventory.potion_rook_balm, 1);
    assert.equal(s.systems.features['rook-attack'].balmPoints, 0);
    assert.equal(s.systems.features['rook-attack'].stats.balms, 4);
    assert.ok(s.systems.features.trade.applied.includes('use-00000000000000a1'));
  });

  it('whole items take any tradeable class; a charge only a class with charges', () => {
    assert.equal(php('usable', ['apple', 2]), true);
    assert.equal(php('usable', ['apple', 0]), false, 'apples have no charges');
    assert.equal(php('usable', ['sparkle_powder', 0]), true);
    assert.equal(php('usable', ['play_cube', 1]), false, 'not tradeable');
    assert.equal(php('usable', ['apple', 10000]), false);
    assert.equal(php('usable', ['apple', '2']), false);
  });

  it('says which tools are held, in the order asked', () => {
    assert.deepEqual(php('held', [{ pick: 1, hatchet: 0, watering_can: 2 }, ['pick', 'fancy_pick', 'hatchet', 'watering_can', 'pick']]), ['pick', 'watering_can']);
    assert.deepEqual(php('held', [[], ['pick']]), []);
  });

  it('a lost answer is given back, and an applied one stays used (the void route\'s rules)', () => {
    const src = readFileSync(join(SITE_DIR, 'src/LedgerUse.php'), 'utf8');
    const body = src.slice(src.indexOf('private function giveBack('), src.indexOf('public static function observe('));
    assert.match(body, /a_applied_at'\] !== null\) \{\s*return \['status' => 'settled'\];/, 'a load applied it: it stays used');
    assert.match(body, /UPDATE \{\$t\} SET status = 'void' WHERE trade_id = \?/, 'the spend turns void');
    assert.match(body, /SET n = LEAST\(n \+ 1, \?\)/, 'a charge goes back into the open one');
    assert.match(body, /INSERT INTO \{\$o\} .* VALUES \(\?, \?, 'use', \?, '', \?\)", \[\$op, \$id, \$void/, 'a use that never came is recorded void, so a late copy uses nothing');
  });
});

describe('which foods sate a street Piggy is the server\'s data (build-realtime-trade)', { skip: skipWithoutServer }, () => {
  it('marks food of base cost 5 or more, from the source item files', () => {
    const t = tradeTable();
    assert.equal(t.items.apple.sates, true, 'apple base_cost 5');
    assert.equal(t.items.abbasid_ribs.sates, true);
    assert.equal(t.items.cherry.sates, undefined, 'cherry base_cost 1');
    assert.equal(t.items.pick.sates, undefined, 'not food');
    for (const [c, it] of Object.entries(t.items)) if (it.sates) assert.equal(it.food, true, c);
    const server = JSON.parse(readFileSync(join(SERVER_DIR, 'data/trade.json'), 'utf8'));
    assert.deepEqual(Object.keys(server.items).filter((c) => server.items[c].sates).sort(), Object.keys(t.items).filter((c) => t.items[c].sates).sort());
  });
});

describe('the page names what it feeds and follows the ledger (street-objects)', () => {
  it('a feed carries the food and how many; other verbs do not', () => {
    assert.deepEqual(actMessage({ req: 3, id: 'pig:2', verb: 'feed', perks: ['sate'], c: 'apple', n: 2 }), { req: 3, id: 'pig:2', verb: 'feed', perks: ['sate'], c: 'apple', n: 2 });
    assert.deepEqual(actMessage({ req: 4, id: 'rock:0', verb: 'mine' }), { req: 4, id: 'rock:0', verb: 'mine' });
    assert.equal(actMessage({ req: 5, id: 'pig:2', verb: 'feed', c: 'Apple!', n: 2 }).c, undefined);
    assert.equal(actMessage({ req: 5, id: 'pig:2', verb: 'feed', c: 'apple', n: 0 }).n, 1);
  });

  it('the feed applies the ledger\'s op once, and a shared Piggy eats only a shared tree\'s fruit', () => {
    const src = read('public/js/features/street-objects-feature.js');
    assert.match(src, /if \(grant\.use\?\.spent && grant\.use\.n && String\(p\.verbId\)\.startsWith\('feed:'\)\) engine\.query\?\.\('ledgerReceipt'/);
    assert.match(src, /if \(!isStreetTree\(onTarget\) \|\| !TRANT_META\[onTarget\.classId\]\) return null;/);
    const mood = read('public/js/features/animal-mood-feature.js');
    const arrive = mood.slice(mood.indexOf('function arriveShared('), mood.indexOf('function arriveShared(') + 1600);
    assert.doesNotMatch(arrive, /consumeStack/, 'a shared Piggy leaves a stack only this player sees');
  });

  it('a balm revive follows the ledger\'s points (rook-attack-feature)', () => {
    const src = read('public/js/features/rook-attack-feature.js');
    assert.match(src, /save\.balmPoints = ledger\.spent \? 1 : Math\.min\(ROOK_SOURCE\.balmPoints - 1, left\) \+ 1;/);
    assert.match(src, /ledger\.spent && engine\.query\?\.\('ledgerReceipt', String\(ledger\.op \|\| ''\), engine\) === false/);
  });
});

describe('a powder spread follows the ledger\'s word (powders-feature)', () => {
  beforeEach(() => powdersFeature._reset());

  function mpEngine(classTsid) {
    const calls = { sent: [], receipts: [], said: [] };
    const handlers = {};
    const client = { state: 'online', me: { id: 1 }, on: (ev, fn) => { handlers[ev] = fn; }, send: (kind, msg) => (calls.sent.push([kind, msg]), true) };
    const engine = {
      mode: 'multiplayer',
      inv: { [classTsid]: 1 },
      pc: { energy: 50, mood: 50, energyMax: 100, moodMax: 100 },
      player: { x: 500, y: 400 },
      interactables: [],
      hasBuff: () => false,
      applyBuff: () => ({ ok: true }),
      removeBuff: () => {},
      achievement: () => {},
      playSound: () => {},
      pushActivity: (t) => calls.said.push(t),
      toast: (t) => calls.said.push(t),
      refreshPack: () => {},
      updateHud: () => {},
      save: () => {},
      setData: () => {},
      param: () => null,
      floatText: () => {},
      dropWorldStack: () => {},
      query(hook, ...args) {
        if (hook === 'realtimeClient') return client;
        if (hook === 'ledgerReceipt') return (calls.receipts.push(args[0]), true);
        return null;
      },
    };
    powdersFeature._attachMp(engine, client);
    return { engine, calls, emit: (ev, msg) => handlers[ev](msg) };
  }

  it('the go-ahead runs the jar with the charges the ledger left', () => {
    const { engine, calls, emit } = mpEngine('sparkle_powder');
    powdersFeature.runPackVerb('sparkle_powder', 'sprinkle', engine);
    assert.deepEqual(calls.sent, [['powder_spread', { cls: 'sparkle_powder' }]]);
    emit('msg:powder_spread', { cls: 'sparkle_powder', ok: true, players: 1, use: { op: 'use-00000000000000b1', c: 'sparkle_powder', left: 2, spent: false } });
    assert.equal(powdersFeature._state().charges.sparkle_powder, 2);
    assert.equal(engine.inv.sparkle_powder, 1);
  });

  it('an emptied jar leaves the pack once; a refusal says the ledger\'s words and uses nothing', () => {
    const { engine, calls, emit } = mpEngine('sneezing_powder');
    powdersFeature.runPackVerb('sneezing_powder', 'scatter', engine);
    emit('msg:powder_spread', { cls: 'sneezing_powder', ok: false, why: 'no_item', message: "You don't have enough of that item." });
    assert.ok(calls.said.includes("You don't have enough of that item."));
    assert.equal(powdersFeature._state().charges.sneezing_powder, undefined);
    powdersFeature.runPackVerb('sneezing_powder', 'scatter', engine);
    emit('msg:powder_spread', { cls: 'sneezing_powder', ok: true, players: 0, use: { op: 'use-00000000000000b2', c: 'sneezing_powder', left: 0, spent: true } });
    assert.deepEqual(calls.receipts, ['use-00000000000000b2']);
    assert.equal(engine.inv.sneezing_powder || 0, 0);
  });
});
