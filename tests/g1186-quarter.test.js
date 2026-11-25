/**
 * G1186 (Austin 2026-11-23, option A): the Quarter, a shared street of player house lots.
 * js/quarter.js (names, numbers, the claim rules and the street builder),
 * features/quarter-feature.js (the lots, claiming, the visit), the street JSON
 * (tools/build-rebuilt-rooms.mjs) and the QUARTER signpost on Marylpole Mount, the realtime
 * server's data (tools/build-realtime-quarters.mjs, quarter.go has its own Go tests) and the
 * site's rules (src/Quarter.php through php -r).
 * Run: node --test tests/g1186-quarter.test.js
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  QUARTER_LOTS,
  QUARTER_LOT_STEP,
  QUARTER_PARENT_SIGN_ID,
  QUARTER_PARENT_TSID,
  QUARTER_TEMPLATE_TSID,
  QUARTER_TEXT,
  QUARTER_TSID,
  blockLabel,
  judgeClaim,
  lotLabel,
  lotNumber,
  lotOf,
  normalizeLots,
  quarterStreet,
  refusalText,
} from '../public/js/quarter.js?v=6eb35ef4';
import { HOUSE_STYLE_IDS, houseLot } from '../public/js/home-house.js?v=3c88c47c';
import { doorSaleArt } from '../public/js/door-sign-art.js?v=69daffff';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=e9221d85';
import { quarterFeature, _quarterState, _resetQuarter } from '../public/js/features/quarter-feature.js?v=7f8fda8f';
import { quartersData } from '../tools/build-realtime-quarters.mjs';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';
import { Display, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const read = (p) => readFileSync(join(root, p), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const block = street(QUARTER_TSID);
const parent = street(QUARTER_PARENT_TSID);
const line = (file, n) => readFileSync(join(gsjs, file), 'utf8').split('\n')[n - 1];

describe('Glitch\'s quarter conventions (GameServerJS)', { skip: !existsSync(gsjs) && 'no glitch-GameServerJS' }, () => {
  it('a block is "<Name>, <x><y>00 block" and a house "<x><y>## <Name>" (groups/quarter.js 447, 464)', () => {
    assert.match(line('groups/quarter.js', 447), /this\.name \+ ', '\+x\+y\+'00 block'/);
    assert.match(line('groups/quarter.js', 464), /''\+x\+y\+'## '\+this\.name/);
    assert.equal(blockLabel(), 'Marylpole Mount Quarter, 1100 block');
    assert.equal(lotNumber(5), 1105);
    assert.equal(lotLabel(1195), '1195 Marylpole Mount Quarter');
    assert.deepEqual(QUARTER_LOTS, [1105, 1115, 1125, 1135, 1145, 1155, 1165, 1175, 1185, 1195]);
  });

  it('the familiar\'s words at a house with no owner (players/inc_houses.js 336, 344)', () => {
    assert.match(line('players/inc_houses.js', 336), new RegExp(QUARTER_TEXT.forSale));
    assert.match(line('players/inc_houses.js', 344), /You already own a location, which you'll need to sell before you can buy a new one/);
    assert.match(QUARTER_TEXT.hasOther, /You already own a location, which you'll need to give up before you can claim a new one/);
  });

  it('one house per player and not one with an owner (locations/inc_pols.js pols_canBuy)', () => {
    assert.match(line('locations/inc_pols.js', 27), /'owned'/);
    assert.match(line('locations/inc_pols.js', 34), /'has_other'/);
  });
});

describe('the claim rules (js/quarter.js judgeClaim)', () => {
  const lots = normalizeLots([{ lot: 1105, owner: { id: 7, name: 'Ada' } }, { lot: 1999, owner: { id: 8, name: 'X' } }, { lot: 1115, owner: { id: 0 } }]);
  it('reads only the block\'s claimed lots', () => {
    assert.deepEqual([...lots.keys()], [1105]);
    assert.equal(lotOf(lots, 7), 1105);
    assert.equal(lotOf(lots, 9), 0);
  });
  it('refuses a lot someone else holds and a second lot', () => {
    assert.equal(judgeClaim({ lots, me: 9, lot: 1105 }), 'taken');
    assert.equal(judgeClaim({ lots, me: 7, lot: 1115 }), 'have');
    assert.equal(judgeClaim({ lots, me: 7, lot: 1105 }), null, 'your own lot again answers the same');
    assert.equal(judgeClaim({ lots, me: 9, lot: 1115 }), null);
    assert.equal(judgeClaim({ lots, me: 9, lot: 1100 }), 'lot');
    assert.equal(judgeClaim({ lots, me: 9, lot: 1115, hasHome: false }), 'no_home');
    assert.equal(judgeClaim({ lots, me: 9, lot: 1115, tutorial: true }), 'newxp');
    assert.equal(refusalText('have'), QUARTER_TEXT.hasOther);
  });
});

describe('the block street (tools/build-rebuilt-rooms.mjs)', () => {
  it('is Whipping Cross Crossing\'s ground and art with ten lots, built as the builder writes it', () => {
    const template = street(QUARTER_TEMPLATE_TSID);
    const signArrive = parent.signposts.find((p) => p.id === QUARTER_PARENT_SIGN_ID);
    assert.ok(signArrive, 'Marylpole Mount has the QUARTER signpost');
    const built = quarterStreet(template, { parentArrive: block.signposts[0].connects[0].arrive });
    assert.deepEqual(built, block);
    assert.deepEqual(block.layers, template.layers, 'the archived street\'s own decos (CC0)');
    assert.equal(block.doors, undefined, 'the lots are the feature\'s, not doors');
    assert.equal(block.quarter.lots.length, 10);
    assert.deepEqual(block.quarter.lots.map((l) => l.sprite), [...template.doors].sort((a, b) => a.x - b.x).map((d) => d.sprite));
    const index = JSON.parse(read('public/assets/streets/index.json')).streets;
    assert.equal(index[QUARTER_TSID].label, 'Marylpole Mount Quarter, 1100 block');
  });

  it('every lot stands on the ground with its For Sale art', () => {
    for (const lot of block.quarter.lots) {
      const at = arrivalInTarget(block, lot.x, lot.y - 4);
      assert.ok(at?.snapped && Math.abs(at.y + block.bounds.t - lot.y) <= 1, `${lot.lot} on the floor`);
      const art = doorSaleArt(lot.sprite);
      assert.ok(art && existsSync(join(root, 'public', art)), `${lot.sprite} has a For Sale sign`);
    }
  });

  it('no two players\' houses overlap, whichever way they face (home-house.js houseLot)', () => {
    let left = 0, right = 0;
    for (const id of HOUSE_STYLE_IDS) for (const facing of [false, true]) {
      const { bounds } = houseLot(id, null, facing);
      left = Math.max(left, -bounds.l);
      right = Math.max(right, bounds.r);
    }
    assert.ok(left + right <= QUARTER_LOT_STEP, `${left} + ${right} fits in ${QUARTER_LOT_STEP}`);
    const lots = block.quarter.lots;
    assert.ok(lots[0].x - left > block.signposts[0].x + 40, 'clear of the signpost');
    assert.ok(lots.at(-1).x + right <= block.bounds.r, 'inside the street');
  });

  it('a QUARTER signpost on Marylpole Mount leads in, and the block\'s signpost leads back beside it', () => {
    const sign = parent.signposts.find((p) => p.id === QUARTER_PARENT_SIGN_ID);
    assert.deepEqual(sign.quarter, { style: 'normal', label: 'Marylpole Mount Quarter', cols: 1, rows: 1 });
    assert.equal(sign.connects.length, 1);
    assert.equal(sign.connects[0].tsid.slice(1), QUARTER_TSID.slice(1));
    assert.equal(sign.connects[0].label, blockLabel());
    const back = block.signposts[0].connects[0];
    assert.equal(back.tsid.slice(1), QUARTER_PARENT_TSID.slice(1));
    assert.ok(Math.abs(back.arrive.x + parent.bounds.l - sign.x) < 120, 'lands beside the QUARTER signpost');
    assert.ok(arrivalInTarget(block, sign.connects[0].arrive.x + block.bounds.l, sign.connects[0].arrive.y + block.bounds.t - 4)?.snapped);
  });

  it('the zone schema knows both (docs copy and editor copy equal)', () => {
    const doc = read('docs/level-builder/zone.schema.json');
    assert.equal(doc, read('public/assets/content/zone.schema.json'));
    const s = JSON.parse(doc).$defs;
    assert.ok(s.signpost.properties.quarter && s.street.properties.quarter);
  });

  it('the QUARTER board art is Tiny Speck\'s (TSEngineAssets, CC0)', () => {
    for (const f of ['signpost_quarter_arm.webp', 'signpost_quarter_grid.webp']) assert.ok(existsSync(join(root, 'public/assets/ui/quarter', f)), f);
    assert.match(read('public/js/street-render.js'), /addQuarterBoard\(PIXI, g, holder, signpost, postH, tex\)/);
  });
});

/* ------------------------------------------------------------------ */
/* The feature, solo and online                                        */
/* ------------------------------------------------------------------ */

class FakeSource { constructor() { this.destroyed = false; } emit() {} resize() { return true; } update() {} on() {} once() {} off() {} }
class FakeTexture { constructor(o = {}) { this.source = o.source || new FakeSource(); this.destroyed = false; } }
const testPixi = new Proxy({ ImageSource: FakeSource, Texture: FakeTexture, Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } } }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});

function fakeEngine({ mode = 'solo', owned = true, client = null } = {}) {
  const targets = new Set();
  const log = { toasts: [], home: [], visits: [], sent: [], data: {} };
  const engine = {
    log,
    targets,
    mode,
    started: true,
    PIXI: testPixi,
    entityLayer: new Display(),
    streetTsid: QUARTER_TSID,
    street: block,
    pc: { name: 'Ur' },
    setData: (k, v) => { log.data[k] = v; },
    param: () => null,
    save() { log.saved = (log.saved || 0) + 1; },
    toast: (t) => log.toasts.push(t),
    pushActivity() {},
    homeContext: () => ({ owned, style: 'meadow', house: { chassis: 'frog', config: {}, facingRight: false } }),
    homeTravel: (a) => { log.home.push(a); return Promise.resolve(true); },
    register(t) { targets.add(t); return t; },
    unregister(t) { targets.delete(t); },
    query: (hook, ...args) => {
      if (hook === 'realtimeClient') return client;
      // neighbours-mp-feature visitHome(id, name, engine) answers null without the engine, as the real hook does.
      if (hook === 'visitHome') { if (!args[2]) return null; log.visits.push(args.slice(0, 2)); return true; }
      return null;
    },
  };
  return engine;
}
const lotTarget = (engine, lot) => [...engine.targets].find((t) => t.quarterLot === lot);

let savedPixi;
before(() => { savedPixi = globalThis.PIXI; globalThis.PIXI = testPixi; });
after(() => { globalThis.PIXI = savedPixi; });
beforeEach(() => _resetQuarter());

describe('solo: your own lot and For Sale houses (features/quarter-feature.js)', () => {
  it('draws ten For Sale lots, claims one, refuses a second, and its front goes home', () => {
    const engine = fakeEngine();
    quarterFeature.restore(undefined, engine);
    quarterFeature.onStreetEnter(block, engine);
    assert.equal(engine.targets.size, 10);
    const t = lotTarget(engine, 1135);
    assert.equal(t.label, '1135 Marylpole Mount Quarter');
    assert.equal(t.subtitle, QUARTER_TEXT.forSale);
    const [verb] = quarterFeature.verbsFor(t, engine);
    assert.equal(verb.id, 'quarter_claim');
    assert.equal(verb.enabled, true);
    assert.equal(quarterFeature.runVerb(t, 'quarter_claim', engine), true);
    assert.deepEqual(quarterFeature.save(), { lot: 1135 });
    assert.match(engine.log.toasts.at(-1), /1135 Marylpole Mount Quarter is yours/);
    // Redrawn: the lot now shows your house, owned.
    assert.match(lotTarget(engine, 1135).subtitle, /^Owned by /);
    // No invented neighbours: every other lot is still for sale.
    assert.equal([...engine.targets].filter((x) => /^Owned/.test(x.subtitle)).length, 1);
    const other = quarterFeature.verbsFor(lotTarget(engine, 1145), engine)[0];
    assert.equal(other.enabled, false);
    assert.equal(other.reason, QUARTER_TEXT.hasOther);
    const mine = quarterFeature.verbsFor(lotTarget(engine, 1135), engine).map((v) => v.id);
    assert.deepEqual(mine, ['quarter_visit', 'quarter_release']);
    quarterFeature.runVerb(lotTarget(engine, 1135), 'quarter_visit', engine);
    assert.deepEqual(engine.log.home, ['teleport']);
    quarterFeature.runVerb(lotTarget(engine, 1135), 'quarter_release', engine);
    assert.equal(quarterFeature.save(), undefined);
    assert.match(engine.log.toasts.at(-1), /It is for sale again/);
  });

  it('needs a home street to claim (the front leads there)', () => {
    const engine = fakeEngine({ owned: false });
    quarterFeature.onStreetEnter(block, engine);
    const [verb] = quarterFeature.verbsFor(lotTarget(engine, 1105), engine);
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, QUARTER_TEXT.noHome);
  });

  it('a saved lot comes back with the save', () => {
    const engine = fakeEngine();
    quarterFeature.restore({ lot: 1175 }, engine);
    quarterFeature.onStreetEnter(block, engine);
    assert.equal(_quarterState().slice.lot, 1175);
    assert.match(lotTarget(engine, 1175).subtitle, /^Owned by Ur/);
  });
});

describe('online: claims are the server\'s and the site\'s', () => {
  function fakeClient() {
    const handlers = {};
    return {
      handlers,
      sent: [],
      state: 'online',
      me: { id: 9 },
      on(kind, fn) { (handlers[kind] ||= []).push(fn); return () => {}; },
      // The realtime client's own shape (online-client send(kind, payload)): a message object is refused, as the real one does.
      send(kind, payload = {}) { if (typeof kind !== 'string') return false; this.sent.push({ t: kind, ...payload }); return true; },
      emit(kind, msg) { for (const fn of handlers[kind] || []) fn(msg); },
    };
  }

  it('asks the server to claim, and another\'s front visits their home street', async () => {
    const client = fakeClient();
    const engine = fakeEngine({ mode: 'multiplayer', client });
    globalThis.document = { baseURI: 'https://example.test/play/online/' };
    try {
      quarterFeature.restore(undefined, engine);
      quarterFeature.onStreetEnter(block, engine);
      quarterFeature.runVerb(lotTarget(engine, 1155), 'quarter_claim', engine);
      assert.deepEqual(client.sent, [{ t: 'quarter_claim', lot: 1155 }]);
      assert.equal(quarterFeature.save(), undefined, 'online the lot is never in the save');
      // The server refuses: the site's words reach the player.
      client.emit('msg:quarter_claimed', { t: 'quarter_claimed', lot: 1155, status: 'refused', why: 'taken', text: QUARTER_TEXT.taken });
      assert.equal(engine.log.toasts.at(-1), QUARTER_TEXT.taken);
      // A front someone holds: Visit Home Street through the visit hook (neighbours-mp-feature visitHome).
      const st = _quarterState();
      st.lots.set(1105, { owner: { id: 7, name: 'Ada' }, house: null, style: 'meadow' });
      const verbs = quarterFeature.verbsFor({ quarterLot: 1105 }, engine);
      assert.deepEqual(verbs.map((v) => v.label), ['Visit Home Street']);
      quarterFeature.runVerb({ quarterLot: 1105 }, 'quarter_visit', engine);
      assert.deepEqual(engine.log.visits, [[7, 'Ada']]);
      assert.deepEqual(engine.log.home, [], 'not your own home');
      assert.equal(judgeClaim({ lots: st.lots, me: 9, lot: 1105 }), 'taken');
    } finally {
      delete globalThis.document;
    }
  });
});

describe('the realtime server\'s data (tools/build-realtime-quarters.mjs)', { skip: !HAS_SERVER && 'no server checkout' }, () => {
  it('data/quarters.json is current', () => {
    assert.equal(readFileSync(serverPath('data', 'quarters.json'), 'utf8'), `${JSON.stringify(quartersData())}\n`, 'run node tools/build-realtime-quarters.mjs');
    assert.deepEqual(quartersData().streets[QUARTER_TSID].lots, QUARTER_LOTS);
  });
});

const hasPhp = spawnSync('php', ['-v']).status === 0;
describe('the site keeps the claims (src/Quarter.php)', { skip: !HAS_SITE ? 'no site checkout' : !hasPhp ? 'no php' : false }, () => {
  const php = (body) => JSON.parse(execFileSync('php', ['-r', `foreach (["Neighbours", "Quarter"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\Quarter; ${body}`]).toString());
  const all = JSON.stringify(QUARTER_LOTS);
  const judge = (lot, owner, me, mine, home = true, tut = false) => php(`echo json_encode(Quarter::judgeClaim(json_decode('${all}', true), ${lot}, ${owner}, ${me}, ${mine}, ${home}, ${tut}));`);

  it('refuses a second lot and a lot someone else holds, as the game and server do', () => {
    assert.equal(judge(1105, 7, 9, 0), 'taken');
    assert.equal(judge(1115, 0, 7, 1105), 'have');
    assert.equal(judge(1105, 7, 7, 0), null);
    assert.equal(judge(1100, 0, 7, 0), 'lot');
    assert.equal(judge(1115, 0, 7, 0, 'false'), 'no_home');
    assert.equal(judge(1115, 0, 7, 0, 'true', 'true'), 'newxp');
    assert.equal(php('echo json_encode(Quarter::text("have"));'), QUARTER_TEXT.hasOther);
  });

  it('reads a block\'s lots from the game\'s street JSON and checks the server\'s calls', () => {
    const json = JSON.stringify(JSON.stringify(block));
    assert.deepEqual(php(`echo json_encode(Quarter::lotsOf(json_decode(${json}, true)));`), QUARTER_LOTS);
    assert.deepEqual(php('echo json_encode(Quarter::call(["op" => "quarter-00000000000000ab", "id" => 7, "street" => "GQRMM1100BLOCK1", "lot" => 1105], true));'),
      { op: 'quarter-00000000000000ab', id: 7, street: QUARTER_TSID, lot: 1105 });
    assert.equal(php('echo json_encode(Quarter::call(["op" => "nope", "id" => 7], false));'), null);
    assert.equal(php('echo json_encode(Quarter::call(["op" => "quarter-00000000000000ab", "id" => 7, "street" => "x", "lot" => 1105], true));'), null);
  });

  it('one lot per player and one owner per lot are the table\'s own keys', () => {
    const t = JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8')).tables.groddle_quarter_lots;
    assert.ok(t.includes('PRIMARY KEY  (street,lot)') && t.includes('UNIQUE KEY user_id (user_id)'));
    const src = readFileSync(join(SITE_DIR, 'src/Quarter.php'), 'utf8');
    for (const route of ['/groddle/v1/ledger/quarter/lots', '/groddle/v1/ledger/quarter/claim', '/groddle/v1/ledger/quarter/release', '/groddle/v1/quarter/{street']) assert.ok(src.includes(route), route);
    assert.match(readFileSync(join(SITE_DIR, 'src/Extension.php'), 'utf8'), /new Quarter\(\$minn\)/);
  });
});
