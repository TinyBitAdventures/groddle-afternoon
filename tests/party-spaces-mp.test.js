/**
 * G334: Party Spaces between real players. The pure client side
 * (js/party-spaces-mp.js), the multiplayer branch of
 * features/party-spaces-feature.js on a fake realtime client, the hub
 * street a space's members share (realtimeStreet, shared quoins), the
 * server's tables and copy against the game's (party_spaces.go in
 * groddle-afternoon-server; skips without it), the site's spend route
 * (LedgerSpend.php; skips without the site or php), and that solo is
 * untouched.
 * Run: node --test tests/party-spaces-mp.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { MP_PARTY_TEXT, MP_SPACE_STREET_RE, kickVerb, mpActivationBlock, normalizeSpace, partyFromSpace } from '../public/js/party-spaces-mp.js?v=g403-1';
import { PARTY_PACKS, PARTY_SPACES, PARTY_TEXT, normalizePartyRecord } from '../public/js/party-spaces.js?v=g403-1';
import { partySpacesFeature } from '../public/js/features/party-spaces-feature.js?v=party-15';
import { sharedStreet } from '../public/js/features/realtime-feature.js?v=g409-1';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const STREET = 'PARTY_00000000000000A1';
const VIEW = { id: '00000000000000a1', street: STREET, template: 'moon', label: 'Toxic Moon', pack: 'party_pack_toxic_moon', taster: false, creator: { id: 1, name: 'Ada' }, left: 3_600_000, extensions: 0, warned: false };

describe('party-spaces-mp: what the server sends', () => {
  it('keeps a space on the local clock from the server\'s time left', () => {
    const s = normalizeSpace(VIEW, 1000);
    assert.equal(s.street, STREET);
    assert.equal(s.expiresAt, 1000 + 3_600_000);
    assert.equal(s.creatorId, 1);
    assert.equal(s.pack, 'party_pack_toxic_moon');
    assert.equal(normalizeSpace({ ...VIEW, street: 'GDOBUP8IR8E2IPH' }), null, 'only a PARTY_ hub street');
    assert.equal(normalizeSpace({ ...VIEW, template: 'halloween' }), null);
    assert.equal(normalizeSpace(null), null);
    assert.ok(MP_SPACE_STREET_RE.test(STREET));
  });

  it('turns a space into the feature\'s party record, keeping what this page knows of the same space', () => {
    const s = normalizeSpace(VIEW, 1000);
    const first = partyFromSpace(s, null, 1000);
    assert.equal(first.template, 'moon');
    assert.equal(first.mp.street, STREET);
    assert.equal(first.inside, false);
    first.inside = true;
    first.returnTo = { tsid: 'GA5101HF7F429V5', label: '', x: 1, y: 2 };
    const later = partyFromSpace(normalizeSpace({ ...VIEW, left: 60_000, extensions: 1 }, 5000), first, 5000);
    assert.equal(later.inside, true);
    assert.equal(later.returnTo.tsid, 'GA5101HF7F429V5');
    assert.equal(later.expiresAt, 65_000);
    const other = partyFromSpace(normalizeSpace({ ...VIEW, id: 'b', street: 'PARTY_00000000000000B2' }, 5000), first, 5000);
    assert.equal(other.inside, false, 'another space starts afresh');
  });

  it('saves the space a party is and drops a bad one', () => {
    const now = 1_000;
    const rec = normalizePartyRecord({ party: { ...partyFromSpace(normalizeSpace(VIEW, now), null, now) } }, now);
    assert.deepEqual(rec.party.mp, { id: VIEW.id, street: STREET, creatorId: 1, creatorName: 'Ada' });
    const bad = normalizePartyRecord({ party: { ...rec.party, mp: { street: 'GA5101HF7F429V5' } } }, now);
    assert.equal(bad.party.mp, undefined);
  });

  it('needs a party to activate once the instructions are read (party_pack.js verbs.activate)', () => {
    assert.equal(mpActivationBlock({ inParty: false, instructionsRead: false }), '');
    assert.equal(mpActivationBlock({ inParty: false, instructionsRead: true }), "You must be in a party to activate. Didn't you read the instructions?");
    assert.equal(mpActivationBlock({ inParty: true, instructionsRead: true }), '');
    assert.equal(mpActivationBlock({ inParty: true, instructionsRead: true, pending: true }), MP_PARTY_TEXT.activating);
  });

  it('gives only the creator, in the space, a Kick out for someone else there (main.js:3730-3739)', () => {
    const space = { creatorId: 1 };
    assert.deepEqual(kickVerb({ me: 1, space, onSpaceStreet: true, target: { id: 2, name: 'Bo' } }),
      { id: 'party_space_kick', label: 'Kick out Bo', enabled: true, tooltip: 'Kick this player out of your Party Space' });
    assert.equal(kickVerb({ me: 2, space, onSpaceStreet: true, target: { id: 3, name: 'Cy' } }), null);
    assert.equal(kickVerb({ me: 1, space, onSpaceStreet: false, target: { id: 2, name: 'Bo' } }), null);
    assert.equal(kickVerb({ me: 1, space, onSpaceStreet: true, target: { id: 1, name: 'Ada' } }), null);
  });
});

// —— The feature on a fake realtime client ——

class FakeNode {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.parts = new Map();
    this.listeners = {};
    this.classList = { toggle() {}, add() {}, remove() {} };
    this.style = {};
    this.hidden = false;
    this.isConnected = true;
    this.textContent = '';
    this.innerHTML = '';
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(n) { this.children.push(n); return n; }
  append(...n) { this.children.push(...n); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn(); }
  querySelector(sel) {
    if (sel === '[data-party-modal-buttons]') {
      if (!this.parts.has(sel)) {
        const box = new FakeNode();
        Object.defineProperty(box, 'innerHTML', { set() { box.children = []; }, get() { return ''; } });
        this.parts.set(sel, box);
      }
      return this.parts.get(sel);
    }
    const m = /^\[data-party-choice="(.+)"\]$/.exec(sel);
    if (m) return this.all().find((n) => n.attrs['data-party-choice'] === m[1]) || null;
    if (!this.parts.has(sel)) this.parts.set(sel, new FakeNode());
    return this.parts.get(sel);
  }
  all() { return [this, ...[...this.parts.values(), ...this.children].flatMap((c) => (c instanceof FakeNode ? c.all() : []))]; }
}

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    players: [{ id: 2, name: 'Bo' }],
    wanted: '',
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return this.state === 'online'; },
    take(kind) { const out = sent.filter((m) => m.t === kind); sent.length = 0; return out; },
  };
}

describe('party spaces feature in multiplayer (features/party-spaces-feature.js)', () => {
  const saved = {};
  let client;
  let engine;
  const events = [];
  const receipts = new Set();
  const PACK = 'party_pack_toxic_moon';

  before(() => {
    for (const k of ['document', 'groddleParty']) saved[k] = globalThis[k];
    globalThis.document = { createElement: (t) => new FakeNode(t), getElementById: () => null, head: new FakeNode('head'), body: new FakeNode('body') };
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
      query: (hook, ...args) => {
        if (hook === 'realtimeClient') return client;
        if (hook === 'ledgerReceipt') {
          const [id] = args;
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
      targetVerbs: () => [{ id: 'party_invite', label: 'Invite to Party' }],
      setData: (k, v) => { engine.data[k] = v; },
      save() {},
      toast: (t) => events.push(`toast:${t}`),
      pushActivity: (t) => events.push(`activity:${t}`),
      achievement: (c, n) => events.push(`achievement:${c}:${n}`),
      prompt: (p) => { events.push(`prompt:${p.text}`); engine.lastPrompt = p; return 'p1'; },
      enter: (tsid) => { events.push(`enter:${tsid}`); return Promise.resolve(); },
      say() {},
      playSound() {},
      updateHud() {},
      refreshPack() {},
      closeMap() {},
    };
    partySpacesFeature.restore({ instructionsRead: true });
    partySpacesFeature.onTick(16, Date.now(), engine);
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    partySpacesFeature.restore({});
  });

  it('needs a party, then asks the server and keeps the pack until it answers', () => {
    let [verb] = partySpacesFeature.packVerbs(PACK, engine);
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, MP_PARTY_TEXT.noParty);
    client.msg({ t: 'party', party: { leader: 1, members: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }] } });
    [verb] = partySpacesFeature.packVerbs(PACK, engine);
    assert.equal(verb.enabled, true);
    assert.equal(partySpacesFeature.runPackVerb(PACK, 'activate', engine), true);
    assert.deepEqual(client.take('party_space_start'), [{ t: 'party_space_start', pack: PACK }]);
    assert.equal(engine.inv[PACK], 1, 'the pack stays until the server says the ledger took it');
    [verb] = partySpacesFeature.packVerbs(PACK, engine);
    assert.equal(verb.reason, MP_PARTY_TEXT.activating);
  });

  it('opens the space when the server says so: the pack goes once, the street is the party\'s', () => {
    const opened = { t: 'party_space_opened', space: VIEW, pack: PACK, spend: 'party-00000000000000a9' };
    client.msg({ t: 'party_space', space: VIEW });
    client.msg(opened);
    assert.equal(engine.inv[PACK] || 0, 0);
    client.msg(opened);
    assert.equal(engine.inv[PACK] || 0, 0);
    const st = partySpacesFeature._state();
    assert.equal(st.record.party.mp.street, STREET);
    assert.equal(st.record.partiesThrown, 1);
    assert.ok(events.includes('toast:Ada made us a new Party Space!'));
    assert.equal(partySpacesFeature.realtimeStreet(engine), null, 'not in it yet');
    engine.streetTsid = PARTY_SPACES.moon.streetTsid;
    assert.equal(partySpacesFeature.realtimeStreet(engine), STREET);
    assert.equal(partySpacesFeature.sharedQuoinStreet(engine), STREET);
    assert.equal(sharedStreet({ ...engine, player: { x: 0, y: 0 }, query: (h, e) => (h === 'realtimeStreet' ? partySpacesFeature.realtimeStreet(e) : null) }), STREET);
    // G363: a party space is an instance (groups/party.js 560 instances_create), and getLoadingInfo
    // sends an instance no hub_name (locations/location.js 3311): no hub line, solo street or shared.
    assert.deepEqual(partySpacesFeature.labelFor(STREET), { street: 'Toxic Moon', hub: '', hubId: '108' });
    assert.deepEqual(partySpacesFeature.labelFor(PARTY_SPACES.moon.streetTsid), { street: 'Toxic Moon', hub: '', hubId: '108' });
  });

  it('shows the server\'s warning, and the ATM spends the payer\'s currants once', () => {
    client.msg({ t: 'party_space', space: { ...VIEW, left: 200_000, warned: true } });
    assert.ok(events.includes(`toast:${PARTY_TEXT.warning}`));
    partySpacesFeature.runVerb({ classId: 'party_atm' }, 'extend', engine);
    const ext = { t: 'party_space_extended', minutes: 10, cost: 4500, spend: 'party-00000000000000b1', text: PARTY_TEXT.atmOk };
    client.msg(ext);
    client.msg(ext);
    assert.equal(engine.pc.currants, 5500);
  });

  it('gives the creator Kick out <name> for someone in the space, after a confirmation', () => {
    const target = { classId: 'pc_remote', playerId: 2, label: 'Bo' };
    const verbs = partySpacesFeature.verbOverride(target, engine);
    assert.deepEqual(verbs.map((v) => v.label), ['Invite to Party', 'Kick out Bo']);
    assert.equal(partySpacesFeature.runVerbOverride(target, 'party_space_kick', engine), true);
    engine.lastPrompt.onChoice(true);
    assert.deepEqual(client.take('party_space_kick'), [{ t: 'party_space_kick', id: 2 }]);
    client.me = { id: 9, name: 'Zed' };
    assert.equal(partySpacesFeature.verbOverride(target, engine), null, 'only the creator');
    client.me = { id: 1, name: 'Ada' };
  });

  it('sends everyone home when the space expires', () => {
    events.length = 0;
    client.msg({ t: 'party_space', space: null, why: 'expired' });
    assert.equal(partySpacesFeature._state().record.party, null);
    assert.ok(events.includes(`toast:${PARTY_TEXT.expired}`));
    assert.ok(events.some((e) => e.startsWith('enter:')));
    assert.equal(partySpacesFeature.realtimeStreet(engine), null);
  });

  it('offers a member the teleporter for the teleport energy, and a kicked member goes home', () => {
    engine.streetTsid = 'GA5101HF7F429V5';
    client.msg({ t: 'party_space_prompt', space: { ...VIEW, creator: { id: 7, name: 'Cy' } }, pcs: ['Cy'] });
    assert.equal(engine.data.partyModal, 'invite');
    const before = engine.pc.energy;
    globalThis.document.getElementById = () => null;
    // The modal's "Teleport" button pays the energy (rejoin; no avatar here, so no portal is drawn).
    const modalEl = globalThis.document.body.children.at(-1);
    modalEl.querySelector('[data-party-choice="go"]').click();
    assert.equal(engine.pc.energy, before - 40);
    engine.streetTsid = PARTY_SPACES.moon.streetTsid;
    events.length = 0;
    client.msg({ t: 'party_space_kicked', by: { id: 7, name: 'Cy' }, text: 'Cy removed you from their Party Space.' });
    assert.ok(events.includes('toast:Cy removed you from their Party Space.'));
    assert.ok(events.some((e) => e.startsWith('enter:')));
    assert.equal(partySpacesFeature._state().record.party, null);
  });

  it('a refused street (kicked, over, a restart) drops the space', () => {
    engine.streetTsid = 'GA5101HF7F429V5';
    client.msg({ t: 'party_space', space: VIEW });
    client.wanted = STREET;
    client.emit('error', { code: 'private_street', message: 'That Party Space is private.' });
    assert.equal(partySpacesFeature._state().record.party, null);
    client.wanted = '';
  });
});

describe('party spaces in solo', () => {
  it('answers none of the multiplayer hooks', () => {
    const solo = { mode: 'solo', streetTsid: PARTY_SPACES.moon.streetTsid, query: () => null };
    assert.equal(partySpacesFeature.realtimeStreet(solo), null);
    assert.equal(partySpacesFeature.sharedQuoinStreet(solo), null);
    assert.equal(partySpacesFeature.verbOverride({ classId: 'pc_remote', playerId: 2 }, solo), null);
  });

  it('keeps its stand-in dancers and its own clock (only a server space skips them)', () => {
    const src = read('public/js/features/party-spaces-feature.js');
    assert.match(src, /if \(!p\.mp\) PARTY_GUESTS\.forEach/);
    assert.match(src, /if \(p\.mp\) spaceGone\(engine, 'expired'\);\n\s*else expire\(engine\);/);
  });

  it('is wired after the realtime client exists, with fresh keys', () => {
    const idx = read('public/js/features/index.js');
    assert.ok(idx.includes("import { partySpacesFeature } from './party-spaces-feature.js?v=party-15';"));
    assert.ok(idx.includes("shared-quoins-feature.js?v=mp4-2"));
    assert.ok(idx.includes("trade-feature.js?v=g403-1"));
  });
});

const skipServer = HAS_SERVER ? false : 'no groddle-afternoon-server checkout';

describe('the server\'s Party Spaces (party_spaces.go)', { skip: skipServer }, () => {
  const go = HAS_SERVER ? readFileSync(serverPath('party_spaces.go'), 'utf8') : '';

  it('has the game\'s templates, labels and ATM prices (config_prod.js:1298-1307)', () => {
    for (const [id, s] of Object.entries(PARTY_SPACES)) {
      const row = new RegExp(`"${id}":\\s*\\{"${s.label.replace(/'/g, "'")}", "${s.streetTsid}", ([a-zA-Z]+|map\\[int\\]int64\\{[^}]+\\})\\}`).exec(go);
      assert.ok(row, `template ${id}`);
      let prices = row[1];
      if (!prices.startsWith('map')) prices = new RegExp(`${prices}\\s*=\\s*(map\\[int\\]int64\\{[^}]+\\})`).exec(go)[1];
      const got = Object.fromEntries([...prices.matchAll(/(\d+): (\d+)/g)].map((m) => [m[1], Number(m[2])]));
      assert.deepEqual(got, { ...s.prices }, `prices ${id}`);
    }
  });

  it('knows every pack the game sells and their themes', () => {
    for (const pack of Object.values(PARTY_PACKS)) {
      const slug = pack.classTsid.replace(/^party_pack_(taster_)?/, '');
      assert.match(go, new RegExp(`"${slug}":\\s*"${pack.template}"`), pack.classTsid);
    }
  });

  it('says what the game says', () => {
    for (const k of ['warning', 'expired', 'atmOk', 'atmBroke', 'atmTooLate', 'alreadyGoing']) {
      assert.ok(go.includes(JSON.stringify(PARTY_TEXT[k])), k);
    }
    assert.ok(go.includes(JSON.stringify(MP_PARTY_TEXT.noParty)));
    assert.ok(go.includes(JSON.stringify(MP_PARTY_TEXT.privateSpace)));
  });

  it('handles every kind the feature sends, and sends every kind it hears', () => {
    const src = read('public/js/features/party-spaces-feature.js');
    const sent = new Set([...src.matchAll(/send\('(party_space_[a-z]+)'/g)].map((m) => m[1]));
    const heard = new Set([...src.matchAll(/on\('msg:(party_space[a-z_]*)'/g)].map((m) => m[1]));
    for (const k of sent) assert.ok(go.includes(`r.Handle("${k}"`), `server handles ${k}`);
    for (const k of heard) assert.ok(go.includes(`"t": "${k}"`), `server sends ${k}`);
    assert.ok(sent.has('party_space_start') && sent.has('party_space_extend') && sent.has('party_space_kick'));
  });

  it('shares a space\'s quoins on its hub street (quoins.go spotsOf)', () => {
    const q = readFileSync(serverPath('quoins.go'), 'utf8');
    assert.match(q, /ProvidedLocked\("party\.spaceStreet"\)/);
    assert.match(go, /r\.Provide\("party\.spaceStreet"/);
  });
});

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;

describe('the site\'s spend route (LedgerSpend.php)', { skip: skipSite }, () => {
  it('is registered and signed like the trade routes', () => {
    const ext = readFileSync(sitePath('src/Extension.php'), 'utf8');
    assert.match(ext, /new LedgerSpend\(\$minn\)/);
    const php = readFileSync(sitePath('src/LedgerSpend.php'), 'utf8');
    assert.match(php, /ServiceCall::verify/);
    assert.match(php, /'\/groddle\/v1\/ledger\/spend'/);
    const go = HAS_SERVER ? readFileSync(serverPath('party_spaces.go'), 'utf8') : '';
    if (go) assert.match(go, /ledgerRouteSpend\s+= "\/groddle\/v1\/ledger\/spend"/);
  });

  it('reads a spend the save has not applied as the pack still held, and applies it once', () => {
    const code = `
      foreach (['Economy', 'LedgerMath'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
      use Groddle\\Minn\\LedgerMath;
      $gave = LedgerMath::goods(['items' => [['c' => 'party_pack_toxic_moon', 'n' => 1]], 'currants' => 0]);
      $got = LedgerMath::goods(['items' => [], 'currants' => 0]);
      $ledger = ['items' => [], 'currants' => 500];
      $view = LedgerMath::view($ledger, [['gave' => $gave, 'got' => $got]]);
      $state = ['inventory' => ['party_pack_toxic_moon' => 1], 'player' => ['currants' => 500], 'systems' => ['features' => []]];
      $entries = ['playerState' => json_encode($state)];
      $after = LedgerMath::applyTrade($entries, 'party-00000000000000a9', $gave, $got);
      $twice = LedgerMath::applyTrade($after, 'party-00000000000000a9', $gave, $got);
      $s = json_decode($twice['playerState'], true);
      echo json_encode(['view' => $view, 'inv' => $s['inventory'], 'applied' => LedgerMath::applied($twice)]);`;
    const out = JSON.parse(execFileSync('php', ['-r', code]).toString());
    assert.deepEqual(out.view, { items: { party_pack_toxic_moon: 1 }, currants: 500 });
    // The pack keeps a class it ran out of at 0, as the game does (G335 slice 2, LedgerMath::applyTrade).
    assert.equal(out.inv.party_pack_toxic_moon || 0, 0);
    assert.deepEqual(out.applied, ['party-00000000000000a9']);
  });
});
