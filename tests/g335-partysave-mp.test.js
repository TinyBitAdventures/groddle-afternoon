/**
 * G335 hardening (lane PARTYSAVE): parties and Party Spaces outlive a restart
 * of the realtime server (groddle-afternoon-server party_persist.go,
 * -party-file), and a spend that bought nothing (no answer came, the party
 * ended meanwhile, a space that could not come back) is given back through
 * the site's ledger (LedgerSpend.php ledger/spend/refund, trade id <spend>-r).
 * The restarts themselves are the server's Go tests (party_persist_test.go);
 * this checks the page's side of a refund (features/party-spaces-feature.js:
 * once by its id, and only when the page had applied the spend), the ids and
 * routes the three repos share, and the site's pure ledger math for a spend
 * and its refund.
 * Run: node --test tests/g335-partysave-mp.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

import { partySpacesFeature } from '../public/js/features/party-spaces-feature.js?v=g463-1';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';

const PACK = 'party_pack_toxic_moon';
const VIEW = { id: '00000000000000a1', street: 'PARTY_00000000000000A1', template: 'moon', label: 'Toxic Moon', pack: PACK, taster: false, creator: { id: 1, name: 'Ada' }, left: 3_600_000, extensions: 0, warned: false };
const TEXT = 'That Party Space could not go on, so what you spent on it was given back.';

class Node {
  constructor() {
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.classList = { toggle() {}, add() {}, remove() {} };
    this.style = {};
    this.isConnected = true;
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(n) { this.children.push(n); return n; }
  append(...n) { this.children.push(...n); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  querySelector() { return new Node(); }
  remove() {}
}

function fakeClient() {
  const listeners = new Map();
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    players: [],
    wanted: '',
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
    send() { return true; },
  };
}

describe('a spend given back reaches the page once (party-spaces-feature)', () => {
  const saved = {};
  const receipts = new Set();
  const events = [];
  let client;
  let engine;
  let saves = 0;

  before(() => {
    saved.document = globalThis.document;
    globalThis.document = { createElement: () => new Node(), getElementById: () => null, head: new Node(), body: new Node() };
    client = fakeClient();
    engine = {
      mode: 'multiplayer',
      started: true,
      streetTsid: 'GA5101HF7F429V5',
      street: { label: 'Groddle Meadow' },
      player: null,
      inv: { [PACK]: 1 },
      pc: { currants: 10000, energy: 90, energyMax: 100 },
      learnedSkills: [],
      data: {},
      query: (hook, id) => {
        if (hook === 'realtimeClient') return client;
        if (hook === 'ledgerReceipt') {
          if (receipts.has(id)) return false;
          receipts.add(id);
          return true;
        }
        return null;
      },
      param: () => null,
      transientInstance: () => false,
      homeContext: () => ({ inHome: false }),
      streetExists: () => true,
      travelGate: () => null,
      targetVerbs: () => [],
      setData: (k, v) => { engine.data[k] = v; },
      save() { saves += 1; },
      toast: (t) => events.push(`toast:${t}`),
      pushActivity: (t) => events.push(`activity:${t}`),
      achievement() {},
      prompt: () => 'p1',
      enter: () => Promise.resolve(),
      say() {},
      playSound() {},
      updateHud() {},
      refreshPack() {},
      closeMap() {},
    };
    partySpacesFeature.restore({ instructionsRead: true });
    partySpacesFeature.onTick(16, Date.now(), engine);
    client.msg({ t: 'party', party: { leader: 1, members: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] } });
  });

  after(() => {
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
    partySpacesFeature.restore({});
  });

  it('gives the pack back when the page had applied its spend, once', () => {
    const spend = 'party-00000000000000a9';
    client.msg({ t: 'party_space', space: VIEW });
    client.msg({ t: 'party_space_opened', space: VIEW, pack: PACK, spend });
    assert.equal(engine.inv[PACK] || 0, 0, 'the spend took the pack');
    client.msg({ t: 'party_space', space: null, why: 'closed' });
    const refunded = { t: 'party_space_refunded', spend, refund: `${spend}-r`, goods: { items: [{ c: PACK, n: 1 }], currants: 0 }, text: TEXT };
    const before = saves;
    client.msg(refunded);
    assert.equal(engine.inv[PACK], 1);
    assert.ok(events.includes(`toast:${TEXT}`));
    assert.ok(saves > before, 'the applied ids are saved');
    client.msg(refunded); // told again on the next connect
    assert.equal(engine.inv[PACK], 1, 'given back once');
  });

  it('gives the currants of an extension back the same way', () => {
    const spend = 'party-00000000000000b1';
    receipts.add(spend); // party_space_extended applied it: the currants went
    engine.pc.currants = 5500;
    client.msg({ t: 'party_space_refunded', spend, refund: `${spend}-r`, goods: { items: [], currants: 4500 }, text: TEXT });
    assert.equal(engine.pc.currants, 10000);
  });

  it('changes nothing for a spend the page never applied: both ids are marked and net to nothing', () => {
    const spend = 'party-00000000000000c1';
    const pack = engine.inv[PACK];
    events.length = 0;
    client.msg({ t: 'party_space_refunded', spend, refund: `${spend}-r`, goods: { items: [{ c: PACK, n: 1 }], currants: 0 }, text: TEXT });
    assert.equal(engine.inv[PACK], pack);
    assert.ok(receipts.has(spend) && receipts.has(`${spend}-r`));
    assert.deepEqual(events, [], 'nothing to tell: nothing left the pack');
  });

  it('ignores a refund that is not its spend\'s', () => {
    const pack = engine.inv[PACK];
    client.msg({ t: 'party_space_refunded', spend: 'party-00000000000000d1', refund: 'party-00000000000000e1-r', goods: { items: [{ c: PACK, n: 1 }], currants: 0 } });
    client.msg({ t: 'party_space_refunded', spend: 'party-00000000000000a9', refund: 'party-00000000000000a9-r', goods: { items: [{ c: 'gold_ingot', n: 5 }], currants: 0 } });
    assert.equal(engine.inv[PACK], pack);
    assert.equal(engine.inv.gold_ingot, undefined);
  });
});

const skipServer = HAS_SERVER ? false : 'no groddle-afternoon-server checkout';

describe('the server keeps parties and gives spends back (party_persist.go, party_spaces.go)', { skip: skipServer }, () => {
  const persist = HAS_SERVER ? readFileSync(serverPath('party_persist.go'), 'utf8') : '';
  const spaces = HAS_SERVER ? readFileSync(serverPath('party_spaces.go'), 'utf8') : '';

  it('has -party-file beside the secret, off for memory only', () => {
    assert.match(persist, /flag\.String\("party-file", "", "[^"]*\(default: realtime-party\.json beside -secret-file; off: memory only\)"\)/);
    assert.match(persist, /statePath\(partyFileForTest, partyFileFlag, "realtime-party\.json"\)/);
  });

  it('writes on shutdown and keeps what was asked of the ledger', () => {
    const party = readFileSync(serverPath('party.go'), 'utf8');
    assert.match(party, /r\.OnShutdown\(func\(\) \{ m\.save\(\) \}\)/);
    assert.match(spaces, /m\.asking\(op, id, "party_pack"\)/);
    assert.match(spaces, /m\.asking\(op, id, "party_atm"\)/);
  });

  it('names the refund as the site does: the spend\'s id and -r', () => {
    assert.match(spaces, /Refund: op \+ "-r"/);
    assert.match(spaces, /"t": "party_space_refunded"/);
    assert.ok(spaces.includes(JSON.stringify(TEXT)), 'the copy the page shows');
  });
});

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

describe('the site\'s refund (LedgerSpend.php)', { skip: skipSite }, () => {
  const php = HAS_SITE ? readFileSync(sitePath('src/LedgerSpend.php'), 'utf8') : '';

  it('is the route the server calls, signed, once per spend, never after a void', () => {
    assert.match(php, /public const REFUND = '\/groddle\/v1\/ledger\/spend\/refund';/);
    assert.match(php, /#\[Route\(Method::Post, self::REFUND/);
    assert.match(php, /\$this->signed\(\$request, self::REFUND\)/);
    assert.match(php, /return \$op \. '-r';/);
    if (HAS_SERVER) assert.match(readFileSync(serverPath('party_spaces.go'), 'utf8'), /ledgerRouteRefund = "\/groddle\/v1\/ledger\/spend\/refund"/);
    // giveBack (the void) refuses to give a refunded spend back again.
    assert.match(php.match(/private function giveBack[\s\S]*?\n {4}}\n/)[0], /refundId\(\$op\)/);
  });

  it('a spend and its refund net to nothing, applied or not, and the refund puts the pack back once', () => {
    const code = `
      foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
      use Groddle\\Minn\\LedgerMath;
      $pack = LedgerMath::goods(['items' => [['c' => 'party_pack_toxic_moon', 'n' => 1]], 'currants' => 0]);
      $none = LedgerMath::goods(['items' => [], 'currants' => 0]);
      $ledger = ['items' => ['party_pack_toxic_moon' => 1], 'currants' => 500];
      $view = LedgerMath::view($ledger, [['gave' => $pack, 'got' => $none], ['gave' => $none, 'got' => $pack]]);
      $state = ['inventory' => ['party_pack_toxic_moon' => 0], 'player' => ['currants' => 500], 'systems' => ['features' => []]];
      $entries = ['playerState' => json_encode($state)];
      $after = LedgerMath::applyTrade($entries, 'party-00000000000000a9-r', $none, $pack);
      $twice = LedgerMath::applyTrade($after, 'party-00000000000000a9-r', $none, $pack);
      $s = json_decode($twice['playerState'], true);
      echo json_encode(['view' => $view, 'inv' => $s['inventory'], 'applied' => LedgerMath::applied($twice)]);`;
    const out = JSON.parse(execFileSync('php', ['-r', code]).toString());
    assert.deepEqual(out.view, { items: { party_pack_toxic_moon: 1 }, currants: 500 });
    assert.equal(out.inv.party_pack_toxic_moon, 1);
    assert.deepEqual(out.applied, ['party-00000000000000a9-r']);
  });
});
