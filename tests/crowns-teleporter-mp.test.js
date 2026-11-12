/**
 * G387, the Crown Game Teleporter online: pay 50 currants and join a Game of
 * Crowns the way the shared instance manager seated a player
 * (items/game_teleporter.js onConversation 211-237,
 * groups/shared_instance_manager.js playerJoinInstance 36-87 and
 * findAvailableInstances 585-633). The pure client side (js/crowns-mp.js), the
 * multiplayer branch of crowns-feature (crownsMpTeleport, crown_paid and
 * crown_paid_back applied once), the teleporter feature's wiring, the server
 * (crowns_teleporter.go; skipped without the server repo) and the site's spend
 * route (LedgerSpend.php; skipped without the site repo or php).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import {
  CROWNS_SPEND_RE,
  CROWNS_TELEPORTER_PRICE,
  normalizeCrownsJoined,
  normalizeCrownsMatch,
  normalizeCrownsPaid,
  normalizeCrownsPaidBack,
} from '../public/js/crowns-mp.js?v=ab077bca';
import { crownsFeature, crownsMpTeleport } from '../public/js/features/crowns-feature.js?v=28e9c767';
import { GAME_TELEPORTER_PRICE, GAME_TELEPORTER_STREET, GAME_TELEPORTER_TEXT } from '../public/js/features/game-teleporter-feature.js?v=4036410a';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const GS = join(root, '../glitch-GameServerJS');
const hasGsjs = existsSync(GS);

const OPEN = {
  t: 'crown_match',
  match: '00000000000000b1',
  street: 'CROWNS_00000000000000B1',
  slot: 0,
  spawn: [1180, 243],
  players: [{ id: 7, name: 'Ada', slot: 0 }],
  open: true,
  playLine: 610,
  locks: [[255, 1230], [1030, 1576], [1640, 1040], [2400, 1034]],
  winMs: 60000,
  autoLeave: 120,
};
const SPEND = 'gtele-00000000000000c1';

describe('crowns-mp: the teleporter\'s messages', () => {
  it('a teleporter game can start with one player waiting; a ticket\'s cannot', () => {
    const m = normalizeCrownsMatch(OPEN);
    assert.equal(m.open, true);
    assert.equal(m.players.length, 1);
    assert.equal(normalizeCrownsMatch({ ...OPEN, open: false }), null);
    assert.equal(normalizeCrownsMatch({ ...OPEN, open: undefined }), null);
    const j = normalizeCrownsJoined({ match: OPEN.match, players: [...OPEN.players, { id: 8, name: 'Bo', slot: 1 }], name: 'Bo' });
    assert.deepEqual(j.players.map((p) => [p.name, p.slot]), [['Ada', 0], ['Bo', 1]]);
    assert.equal(normalizeCrownsJoined({ match: 'nope', players: OPEN.players }), null);
  });

  it('cleans a spend and its refund, never more than the price', () => {
    assert.ok(CROWNS_SPEND_RE.test(SPEND));
    assert.equal(CROWNS_TELEPORTER_PRICE, GAME_TELEPORTER_PRICE);
    assert.deepEqual(normalizeCrownsPaid({ id: SPEND, spend: SPEND, cost: 50, text: GAME_TELEPORTER_TEXT.paid }), { id: SPEND, spend: SPEND, cost: 50, text: GAME_TELEPORTER_TEXT.paid });
    assert.equal(normalizeCrownsPaid({ id: SPEND, spend: SPEND, cost: 9e9 }).cost, 50);
    assert.equal(normalizeCrownsPaid({ id: 'party-00000000000000c1', spend: 'party-00000000000000c1', cost: 50 }), null);
    assert.equal(normalizeCrownsPaid({ id: 'x', spend: SPEND, cost: 50 }), null);
    const back = normalizeCrownsPaidBack({ id: `${SPEND}-r`, spend: SPEND, refund: `${SPEND}-r`, currants: 50 });
    assert.deepEqual([back.id, back.refund, back.currants], [`${SPEND}-r`, `${SPEND}-r`, 50]);
    assert.equal(normalizeCrownsPaidBack({ id: SPEND, spend: SPEND, refund: SPEND, currants: 50 }), null);
  });
});

describe('the multiplayer branch: crownsMpTeleport', () => {
  const handlers = new Map();
  const sent = [];
  const client = {
    state: 'online',
    street: GAME_TELEPORTER_STREET,
    me: { id: 7, name: 'Ada' },
    players: [],
    on(type, fn) { handlers.set(type, fn); },
    send(kind, payload) { sent.push([kind, payload]); return true; },
    fire(kind, msg) { return handlers.get(`msg:${kind}`)?.({ t: kind, ...msg }); },
  };
  const applied = new Set();
  const log = { toasts: [], activity: [] };
  const engine = {
    mode: 'multiplayer',
    inv: {},
    pc: { currants: 120, imagination: 0, xp: 0 },
    player: { x: 0, y: 0 },
    streetTsid: GAME_TELEPORTER_STREET,
    query: (hook, id) => {
      if (hook === 'realtimeClient') return client;
      if (hook === 'ledgerReceipt') {
        if (applied.has(id)) return false;
        applied.add(id);
        return true;
      }
      return null;
    },
    toast: (t) => log.toasts.push(t),
    pushActivity: (t) => log.activity.push(t),
    achievement() {},
    updateHud() {},
    save() {},
    setData() {},
    playSound() {},
    prompt: () => 'p1',
    removePrompt() {},
  };
  crownsFeature.restore({}, engine);

  it('asks the server, takes the 50 once when it says the spend went in, and acks', async () => {
    const paid = [];
    assert.equal(crownsMpTeleport(engine, { onPaid: (p, text) => paid.push([p.spend, text]) }), true);
    assert.deepEqual(sent.at(-1), ['crown_teleport', {}]);
    assert.equal(crownsMpTeleport(engine, {}), false, 'one at a time');
    assert.equal(engine.pc.currants, 120, 'nothing comes off before the server says');
    await client.fire('crown_paid', { id: SPEND, spend: SPEND, cost: 50, text: GAME_TELEPORTER_TEXT.paid });
    assert.equal(engine.pc.currants, 70);
    assert.deepEqual(paid, [[SPEND, GAME_TELEPORTER_TEXT.paid]], 'the overlay and the words once');
    assert.deepEqual(sent.at(-1), ['crown_ack', { id: SPEND }]);
    // Sent again on a reconnect (owed until acked): already applied, acked again, nothing off.
    await client.fire('crown_paid', { id: SPEND, spend: SPEND, cost: 50 });
    assert.equal(engine.pc.currants, 70);
    assert.equal(paid.length, 1);
    assert.deepEqual(sent.at(-1), ['crown_ack', { id: SPEND }]);
  });

  it('gives a spend back once, and nets a never-applied spend to nothing', async () => {
    await client.fire('crown_paid_back', { id: `${SPEND}-r`, spend: SPEND, refund: `${SPEND}-r`, currants: 50, text: 'back' });
    assert.equal(engine.pc.currants, 120);
    assert.deepEqual(log.toasts.slice(-1), ['back']);
    assert.deepEqual(sent.at(-1), ['crown_ack', { id: `${SPEND}-r` }]);
    await client.fire('crown_paid_back', { id: `${SPEND}-r`, spend: SPEND, refund: `${SPEND}-r`, currants: 50, text: 'back' });
    assert.equal(engine.pc.currants, 120, 'never twice');
    const other = 'gtele-00000000000000c2';
    await client.fire('crown_paid_back', { id: `${other}-r`, spend: other, refund: `${other}-r`, currants: 50 });
    assert.equal(engine.pc.currants, 120, 'a spend this page never took gives nothing back');
    assert.ok(applied.has(other) && applied.has(`${other}-r`), 'both ids are applied, so the site counts neither');
  });

  it('a refusal reaches the teleporter (the poor line), and clears the way', () => {
    const refused = [];
    assert.equal(crownsMpTeleport(engine, { onRefused: (why, text) => refused.push([why, text]) }), true);
    client.fire('crown_refused', { why: 'poor', text: GAME_TELEPORTER_TEXT.poor });
    assert.deepEqual(refused, [['poor', GAME_TELEPORTER_TEXT.poor]]);
    assert.equal(crownsMpTeleport(engine, {}), true, 'free to try again');
    client.fire('crown_refused', { why: 'ledger', text: 'x' });
  });

  it('offline, nothing goes out', () => {
    client.state = 'connecting';
    const before = sent.length;
    assert.equal(crownsMpTeleport(engine, {}), false);
    assert.equal(sent.length, before);
    client.state = 'online';
  });
});

describe('the teleporter feature online', () => {
  const f = read('public/js/features/game-teleporter-feature.js');

  it('asks the same question online, and pays through the server there', () => {
    assert.match(f, /onComplete: \(\) => \(engine\.mode === 'multiplayer' \? payOnline\(engine\) : pay\(engine\)\),/);
    assert.match(f, /const sent = crownsMpTeleport\(engine, \{\s+onPaid: \(paid, text\) => paidFx\(engine, \{ text \}\),/);
    assert.ok(!/points to the ticket|Game of Crowns Ticket: activate/.test(f), 'the old pointer to the ticket is gone');
    // Solo is as it was: pay locally and start a game with the stand-ins a second later.
    assert.match(f, /paidFx\(engine, \{ holdMs \}\);\s+if \(holdMs != null\) return true;\s+setTimeout\(\(\) => \{\s+Promise\.resolve\(startCrowns\(engine, \{\}\)\)/);
  });

  it('the source joins the fullest open game, else a new one', { skip: !hasGsjs && 'no GSJS' }, () => {
    const t = readFileSync(join(GS, 'groups/shared_instance_manager.js'), 'utf8');
    assert.match(t, /Fill first: instances with the most players that are under their maximum player count/);
    assert.match(t, /No available instances\. Create one and put us in it\./);
    assert.match(t, /\/\/ Skip instances with game running/);
    const cfg = readFileSync(join(GS, 'config_prod.js'), 'utf8');
    assert.match(cfg, /it_game: \{locations: \['LHV2H026E492IAF'\], min_players: 4, max_players: 5, name: 'Game of Crowns', splash: 'games_it_game_splash', can_retry: true, min_retry_players: 3\}/);
  });
});

describe('the server (crowns_teleporter.go)', { skip: skipWithoutServer }, () => {
  const go = HAS_SERVER && existsSync(serverPath('crowns_teleporter.go')) ? readFileSync(serverPath('crowns_teleporter.go'), 'utf8') : '';

  it('takes the price through the ledger on the teleporter\'s street, and joins a second later', () => {
    assert.match(go, new RegExp(`crownsTeleporterStreet = "${GAME_TELEPORTER_STREET}"`));
    assert.match(go, new RegExp(`crownsTeleporterPrice\\s+= ${GAME_TELEPORTER_PRICE}\\b`));
    assert.match(go, /crownsTeleportJoin\s+= time\.Second/);
    assert.match(go, /crownsTeleportWhy\s+= "game_teleporter"/);
    assert.ok(go.includes(`crownsTeleportPaid   = "${GAME_TELEPORTER_TEXT.paid}"`));
    assert.ok(go.includes(`crownsTeleportPoor   = "${GAME_TELEPORTER_TEXT.poor}"`));
    assert.match(read('public/js/crowns-mp.js'), /CROWNS_SPEND_RE = \/\^gtele-\[0-9a-f\]\{16\}\$\//);
    assert.match(go, /crownsSpendRe = regexp\.MustCompile\(`\^gtele-\[0-9a-f\]\{16\}\$`\)/);
  });
});

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

describe('the site\'s spend route takes the teleporter\'s 50 (LedgerSpend.php)', { skip: skipSite }, () => {
  it('only 50 currants, no items, under its own op prefix', () => {
    const code = `
      foreach (['Economy', 'LedgerMath', 'LedgerSpend'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
      use Groddle\\Minn\\LedgerSpend;
      $r = new ReflectionClass(LedgerSpend::class);
      $fits = $r->getMethod('fits'); $op = $r->getMethod('opId'); $for = $r->getMethod('opFor');
      $c = fn ($n, $items = []) => ['items' => $items, 'currants' => $n];
      echo json_encode([
        'price' => LedgerSpend::TELEPORTER_PRICE,
        'fifty' => $fits->invoke(null, 'game_teleporter', $c(50)),
        'more' => $fits->invoke(null, 'game_teleporter', $c(51)),
        'items' => $fits->invoke(null, 'game_teleporter', $c(50, ['apple' => 1])),
        'op' => $op->invoke(null, '${SPEND}'),
        'mine' => $for->invoke(null, '${SPEND}', 'game_teleporter'),
        'party' => $for->invoke(null, 'party-00000000000000c1', 'game_teleporter'),
        'atm' => $for->invoke(null, '${SPEND}', 'party_atm'),
      ]);`;
    const out = JSON.parse(execFileSync('php', ['-r', code]).toString());
    assert.deepEqual(out, { price: 50, fifty: true, more: false, items: false, op: true, mine: true, party: false, atm: false });
    assert.match(readFileSync(sitePath('src/LedgerSpend.php'), 'utf8'), /private const WHY = \['party_pack', 'party_atm', 'game_teleporter'\];/);
  });
});
