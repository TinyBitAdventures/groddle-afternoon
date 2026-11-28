/**
 * G1186, a quarter in Bortola (Austin 2026-11-28: players asked for a place in Bortola). Mien Evoke
 * Quarter, 1100 block, off Mien Evoke (hub 75): Glitch's naming (groups/quarter.js generate_label
 * 444-460, generate_pol_label 462-476), its QUARTER signpost on Mien Evoke (glitch-client
 * SignpostView.as 211-238, Tiny Speck's signpost_quarter art), its block's signpost back beside it
 * (locations/quarter.js get_exit_position 63-84), ten lots 1105 to 1195. Bortola's six quarter
 * templates are lost, so the block is composed from Mien Evoke's own CC0 art on one flat floor
 * (js/quarter.js composeBlockBase; inventions bortola-quarter-block). The quarters are one list
 * (QUARTERS); one lot per player across every block of every quarter (locations/inc_pols.js
 * pols_canBuy has_other), and since both quarters have an 1105 a lot is its street and its number.
 * The home street's quarter arm names the quarter the lot is in.
 * Run: node --test tests/g1186-quarter-bortola.test.js
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MEADOW_HOUSES,
  QUARTERS,
  QUARTER_BLOCKS,
  QUARTER_LOT_STEP,
  QUARTER_PARENT_SIGN_ID,
  QUARTER_TEXT,
  blockChoice,
  blockLabel,
  blockLots,
  blockOf,
  blockOfLot,
  composeBlockBase,
  groundYAt,
  homeArm,
  judgeClaim,
  lotArrival,
  lotName,
  normalizeHeld,
  normalizeQuarterSlice,
  quarterInfo,
  quarterOfStreet,
  quarterSignpost,
  quarterStreet,
} from '../public/js/quarter.js?v=a38887ca';
import { doorSaleArt } from '../public/js/door-sign-art.js?v=69daffff';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=e9221d85';
import { addQuarterBoard } from '../public/js/street-render.js?v=e7e9dfda';
import { quarterFeature, _quarterState, _resetQuarter } from '../public/js/features/quarter-feature.js?v=5fca1317';
import { quartersData } from '../tools/build-realtime-quarters.mjs';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';
import { Display, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));

const MM = QUARTERS.find((q) => q.id === 'MM');
const ME = QUARTERS.find((q) => q.id === 'ME');
const BLOCK = ME.blocks[0];
const MIEN_EVOKE = 'GHVLCNLR783251B';
const parent = street(MIEN_EVOKE);
const block = street(BLOCK.tsid);
const sign = parent.signposts.find((p) => p.id === QUARTER_PARENT_SIGN_ID);

describe('Mien Evoke Quarter: one more entry in the quarters list', () => {
  it('its parent street, hub, block and lots: Glitch\'s names, 1105 to 1195', () => {
    assert.deepEqual(QUARTERS.map((q) => q.name), ['Marylpole Mount Quarter', 'Mien Evoke Quarter']);
    assert.equal(ME.parent, MIEN_EVOKE);
    assert.equal(parent.label, 'Mien Evoke');
    assert.equal(parent.hubId, '75');
    assert.deepEqual([ME.hubId, ME.hubName, ME.parentLabel], ['75', 'Bortola', 'Mien Evoke']);
    assert.deepEqual([BLOCK.tsid, BLOCK.x, BLOCK.y, BLOCK.quarter], ['GQRME1100BLOCK1', 1, 1, 'ME']);
    assert.ok(QUARTER_BLOCKS.includes(BLOCK), 'every block of every quarter is in QUARTER_BLOCKS');
    assert.equal(block.label, 'Mien Evoke Quarter, 1100 block');
    assert.equal(blockLabel(ME.name, 1, 1), block.label);
    assert.deepEqual(block.quarter.lots.map((l) => l.lot), [1105, 1115, 1125, 1135, 1145, 1155, 1165, 1175, 1185, 1195]);
    assert.deepEqual(block.quarter.lots.map((l) => l.lot), blockLots(BLOCK));
    assert.deepEqual([block.hubId, block.hubName], ['75', 'Bortola']);
    assert.equal(quarterOfStreet(`L${BLOCK.tsid.slice(1)}`), ME);
    assert.equal(lotName(1135, BLOCK.tsid), '1135 Mien Evoke Quarter');
    assert.equal(lotName(1135, 'GQRMM1100BLOCK1'), '1135 Marylpole Mount Quarter');
    const index = JSON.parse(read('public/assets/streets/index.json')).streets;
    assert.equal(index[BLOCK.tsid].label, block.label);
    assert.equal(index[BLOCK.tsid].hubId, '75');
  });

  it('a quarter\'s grid holds only its own blocks', () => {
    assert.deepEqual(quarterInfo(ME), { style: 'normal', label: 'Mien Evoke Quarter', cols: 1, rows: 1 });
    assert.deepEqual(quarterInfo(MM), { style: 'normal', label: 'Marylpole Mount Quarter', cols: 1, rows: 2 });
    assert.deepEqual(quarterInfo(), quarterInfo(MM), 'Marylpole Mount\'s by default, as before');
    assert.deepEqual({ cols: block.quarter.cols, rows: block.quarter.rows, parent: block.quarter.parent }, { cols: 1, rows: 1, parent: MIEN_EVOKE });
  });
});

describe('the block street, composed from Mien Evoke on one flat floor (ours)', () => {
  const base = street(MIEN_EVOKE);
  const composed = composeBlockBase(base, BLOCK);
  const baseSprites = (name) => new Set((base.layers.find((l) => l.name === name)?.decos || []).map((d) => d.sprite));

  it('is what the builder writes from Mien Evoke', () => {
    assert.deepEqual(quarterStreet(composed, { parentArrive: block.signposts[0].connects[0].arrive, block: BLOCK }), block);
    assert.match(block.source, /composed from Mien Evoke's sky, layers, filters and decos \(GHVLCNLR783251B/);
    assert.match(block.why.geometry, /\(ours\)/);
  });

  it('keeps Mien Evoke\'s sky, layers and filters, its art only, 6000 px wide', () => {
    assert.deepEqual(block.gradient, base.gradient, 'the sky gradient');
    assert.deepEqual(block.layers.map((l) => [l.name, l.z, l.filters]), base.layers.map((l) => [l.name, l.z, l.filters]));
    assert.deepEqual(block.bounds, { l: -3000, r: 3000, t: base.bounds.t, b: base.bounds.b });
    for (const layer of block.layers) {
      const was = base.layers.find((l) => l.name === layer.name);
      const sprites = baseSprites(layer.name);
      for (const d of layer.decos) assert.ok(sprites.has(d.sprite), `${layer.name}: ${d.sprite} is one of Mien Evoke's own`);
      // Each layer grows with the street (parallax as before): 6000 / 5000.
      assert.equal(layer.w, Math.round((was.w * 6000) / 5000), `${layer.name} grows in proportion`);
      if (layer.name !== 'middleground') {
        for (const d of was.decos) assert.ok(layer.decos.some((n) => n.sprite === d.sprite && n.y === d.y && n.w === d.w), `${layer.name}: ${d.sprite} kept as it was`);
      }
    }
  });

  it('one flat floor end to end, no raised mounds, the ground band along it', () => {
    assert.deepEqual(block.platforms, [{ id: 'plat_quarter_floor', x1: -3000, y1: -120, x2: 3000, y2: -120, pc_perm: -1, item_perm: -1 }]);
    const mid = block.layers.find((l) => l.name === 'middleground');
    for (const sprite of BLOCK.compose.drop) assert.ok(!mid.decos.some((d) => d.sprite === sprite), `no ${sprite}: its platform is not kept`);
    // The dirt strips cover the floor from end to end.
    const strips = mid.decos.filter((d) => d.sprite === 'dirt_platform_long' && d.y === -120 + 39).sort((a, b) => a.x - b.x);
    assert.ok(strips[0].x - strips[0].w / 2 <= -3000 && strips.at(-1).x + strips.at(-1).w / 2 >= 3000);
    for (let i = 1; i < strips.length; i++) assert.ok(strips[i].x - strips[i].w / 2 < strips[i - 1].x + strips[i - 1].w / 2, 'no gap between strips');
    assert.equal(block.ladders, undefined);
    assert.equal(block.doors, undefined);
  });

  it('ten lots 565 px apart on the floor, each one of Tiny Speck\'s meadow houses with its For Sale sign', () => {
    const lots = block.quarter.lots;
    assert.equal(lots.length, 10);
    assert.deepEqual(lots.map((l) => l.sprite), BLOCK.compose.houses);
    assert.equal(new Set(BLOCK.compose.houses).size, 10, 'ten different houses');
    lots.forEach((lot, i) => {
      assert.equal(lot.y, -120);
      if (i) assert.equal(lot.x - lots[i - 1].x, QUARTER_LOT_STEP);
      assert.deepEqual([lot.w, lot.h], MEADOW_HOUSES[lot.sprite]);
      const art = doorSaleArt(lot.sprite);
      assert.ok(art && existsSync(join(root, 'public', art)), `${lot.sprite} has a For Sale sign`);
      assert.ok(arrivalInTarget(block, lot.x, lot.y - 4)?.snapped, `${lot.lot} stands on the floor`);
    });
  });
});

describe('the QUARTER signpost on Mien Evoke', () => {
  it('stands on Mien Evoke\'s floor and leads to the block; the block\'s signpost leads back beside it', () => {
    assert.ok(sign, 'Mien Evoke has a QUARTER signpost');
    assert.equal(sign.x, ME.parentSignX);
    assert.deepEqual(sign.quarter, quarterInfo(ME));
    assert.ok(Math.abs(sign.y - groundYAt(parent.platforms, sign.x)) <= 2, 'on the floor');
    assert.deepEqual(sign.connects.map((c) => [c.label, c.hub_id]), [['Mien Evoke Quarter, 1100 block', '75']]);
    assert.deepEqual(sign, quarterSignpost({ y: sign.y, arrives: [sign.connects[0].arrive], quarter: ME }));
    const c = sign.connects[0];
    assert.equal(c.tsid.slice(1), BLOCK.tsid.slice(1));
    assert.ok(arrivalInTarget(block, c.arrive.x + block.bounds.l, c.arrive.y + block.bounds.t - 4)?.snapped, 'arrives on the block\'s floor');
    assert.ok(Math.abs(c.arrive.x + block.bounds.l - block.signposts[0].x) < 120, 'beside the block\'s own signpost');
    const back = block.signposts[0].connects;
    assert.deepEqual(back.map((b) => [b.label, b.hub_id]), [['Mien Evoke', '75']], 'one way out: Mien Evoke (get_exit_position)');
    assert.equal(back[0].tsid.slice(1), MIEN_EVOKE.slice(1));
    assert.ok(Math.abs(back[0].arrive.x + parent.bounds.l - ME.parentSignX) < 120, 'lands beside the QUARTER signpost');
    assert.deepEqual(blockChoice(c), { tsid: BLOCK.tsid, label: '1100 block', col: 1, row: 1 });
    // Marylpole Mount's signpost still offers its own two blocks only.
    const mm = street(MM.parent).signposts.find((p) => p.id === QUARTER_PARENT_SIGN_ID);
    assert.deepEqual(mm.connects.map((x) => x.label), ['Marylpole Mount Quarter, 1100 block', 'Marylpole Mount Quarter, 1200 block']);
  });

  it('is one QUARTER board with the quarter\'s name, taken at once (one block)', () => {
    const g = new fakePixi.Container();
    g.signBoards = [];
    g.signHoverParts = { arms: [], labels: [], baseLabelFills: [] };
    addQuarterBoard(fakePixi, g, new fakePixi.Container(), sign, 246, {});
    assert.deepEqual(g.signQuarter.label, 'Mien Evoke Quarter');
    assert.equal(g.signQuarter.blocks, 1, 'a quarter of one block takes it at once (game.js signMenuView: more than one opens a menu)');
    assert.equal(g.signBoards[0].connection.label, 'Mien Evoke Quarter, 1100 block');
  });
});

/* ------------------------------------------------------------------ */
/* One lot per player across quarters                                  */
/* ------------------------------------------------------------------ */

class FakeSource { constructor() { this.destroyed = false; } emit() {} resize() { return true; } update() {} on() {} once() {} off() {} }
class FakeTexture { constructor(o = {}) { this.source = o.source || new FakeSource(); this.destroyed = false; } }
const testPixi = new Proxy({ ImageSource: FakeSource, Texture: FakeTexture, Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } } }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});

function fakeEngine(where, { mode = 'solo', client = null } = {}) {
  const targets = new Set();
  const log = { toasts: [] };
  return {
    log,
    targets,
    mode,
    started: true,
    PIXI: testPixi,
    entityLayer: new Display(),
    streetTsid: where.tsid,
    street: where,
    pc: { name: 'Ur' },
    setData() {},
    param: () => null,
    save() {},
    toast: (t) => log.toasts.push(t),
    pushActivity() {},
    homeContext: () => ({ owned: true, style: 'meadow', house: { chassis: 'frog', config: {}, facingRight: false } }),
    homeTravel: () => Promise.resolve(true),
    register(t) { targets.add(t); return t; },
    unregister(t) { targets.delete(t); },
    query: (hook) => (hook === 'realtimeClient' ? client : null),
  };
}
const lotTarget = (engine, lot) => [...engine.targets].find((t) => t.quarterLot === lot);

describe('one lot per player across every quarter (pols_canBuy has_other)', () => {
  let savedPixi;
  before(() => { savedPixi = globalThis.PIXI; globalThis.PIXI = testPixi; });
  after(() => { globalThis.PIXI = savedPixi; });
  beforeEach(() => _resetQuarter());

  it('the rule: Marylpole Mount Quarter\'s 1105 refuses Mien Evoke Quarter\'s 1105 (same number, another lot)', () => {
    const empty = new Map();
    const mine = { street: 'GQRMM1100BLOCK1', lot: 1105 };
    assert.equal(judgeClaim({ lots: empty, me: 7, lot: 1105, mine, street: BLOCK.tsid }), 'have');
    assert.equal(judgeClaim({ lots: empty, me: 7, lot: 1105, mine, street: 'LQRMM1100BLOCK1' }), null, 'your own lot again answers the same');
    assert.equal(judgeClaim({ lots: empty, me: 7, lot: 1105, mine: { street: '', lot: 0 }, street: BLOCK.tsid }), null);
  });

  it('a lot is its street and number; a save from before holds Marylpole Mount Quarter\'s', () => {
    assert.deepEqual(normalizeHeld({ street: 'LQRME1100BLOCK1', lot: 1135 }), { street: BLOCK.tsid, lot: 1135 });
    assert.deepEqual(normalizeHeld({ street: BLOCK.tsid, lot: 1205 }), null, 'no 1205 on Mien Evoke Quarter');
    assert.equal(blockOfLot(1105, BLOCK.tsid), BLOCK);
    assert.equal(blockOfLot(1105).tsid, 'GQRMM1100BLOCK1', 'no street: Marylpole Mount Quarter\'s, as before');
    assert.deepEqual(normalizeQuarterSlice({ lot: 1135 }), { street: 'GQRMM1100BLOCK1', lot: 1135 }, 'an old solo save');
    assert.deepEqual(normalizeQuarterSlice({ street: BLOCK.tsid, lot: 1135 }), { street: BLOCK.tsid, lot: 1135 });
    assert.deepEqual(normalizeQuarterSlice(null), { street: '', lot: 0 });
  });

  it('solo: your Marylpole Mount lot 1135 is not Mien Evoke Quarter\'s 1135, whose For Sale houses are greyed out', () => {
    const engine = fakeEngine(block);
    quarterFeature.restore({ street: 'GQRMM1100BLOCK1', lot: 1135 }, engine);
    quarterFeature.onStreetEnter(block, engine);
    assert.equal(engine.targets.size, 10);
    assert.equal(_quarterState().lots.size, 0, 'nobody holds a lot on this block');
    const t = lotTarget(engine, 1135);
    assert.equal(t.label, '1135 Mien Evoke Quarter');
    assert.equal(t.subtitle, QUARTER_TEXT.forSale);
    const [verb] = quarterFeature.verbsFor(t, engine);
    assert.equal(verb.id, 'quarter_claim');
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, QUARTER_TEXT.hasOther);
  });

  it('solo: claim and give up on Mien Evoke Quarter, the lot saved with its street', () => {
    const engine = fakeEngine(block);
    quarterFeature.restore(undefined, engine);
    quarterFeature.onStreetEnter(block, engine);
    quarterFeature.runVerb(lotTarget(engine, 1145), 'quarter_claim', engine);
    assert.equal(engine.log.toasts.at(-1), QUARTER_TEXT.claimed('1145 Mien Evoke Quarter'));
    assert.deepEqual(quarterFeature.save(), { street: BLOCK.tsid, lot: 1145 });
    assert.deepEqual(quarterFeature.verbsFor(lotTarget(engine, 1145), engine).map((v) => v.id), ['quarter_visit', 'quarter_release']);
    // On Marylpole Mount Quarter's 1100 block the same number is For Sale, and greyed out.
    const mm = street('GQRMM1100BLOCK1');
    const there = fakeEngine(mm);
    quarterFeature.onStreetEnter(mm, there);
    assert.equal(lotTarget(there, 1145).subtitle, QUARTER_TEXT.forSale);
    assert.equal(quarterFeature.verbsFor(lotTarget(there, 1145), there)[0].reason, QUARTER_TEXT.hasOther);
    // Back on Mien Evoke Quarter, give it up.
    quarterFeature.onStreetEnter(block, engine);
    quarterFeature.runVerb(lotTarget(engine, 1145), 'quarter_release', engine);
    assert.equal(engine.log.toasts.at(-1), QUARTER_TEXT.released('1145 Mien Evoke Quarter'));
    assert.equal(quarterFeature.save(), undefined);
  });

  it('online: the site names your lot on the other quarter, and a claim of the same number here is refused before it is sent', async () => {
    const handlers = {};
    const client = { state: 'online', me: { id: 9 }, sent: [], on(kind, fn) { (handlers[kind] ||= []).push(fn); return () => {}; }, send(kind, p = {}) { this.sent.push({ t: kind, ...p }); return true; } };
    const engine = fakeEngine(block, { mode: 'multiplayer', client });
    const savedDoc = globalThis.document;
    const savedFetch = globalThis.fetch;
    globalThis.document = { baseURI: 'https://example.test/play/online/' };
    let mine = { street: 'GQRMM1100BLOCK1', lot: 1105 };
    globalThis.fetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ street: block.tsid, lots: [], mine }) });
    try {
      quarterFeature.restore(undefined, engine);
      quarterFeature.onStreetEnter(block, engine);
      await new Promise((r) => setTimeout(r, 20));
      assert.deepEqual([_quarterState().held, _quarterState().heldStreet], [1105, 'GQRMM1100BLOCK1']);
      const [verb] = quarterFeature.verbsFor(lotTarget(engine, 1105), engine);
      assert.equal(verb.enabled, false, '1105 here is not the 1105 you hold');
      assert.equal(verb.reason, QUARTER_TEXT.hasOther);
      quarterFeature.runVerb(lotTarget(engine, 1105), 'quarter_claim', engine);
      assert.deepEqual(client.sent, [], 'not sent');
      // With no lot anywhere, the claim goes to the server and its answer names this quarter.
      mine = null;
      _resetQuarter();
      quarterFeature.restore(undefined, engine);
      quarterFeature.onStreetEnter(block, engine);
      await new Promise((r) => setTimeout(r, 20));
      quarterFeature.runVerb(lotTarget(engine, 1105), 'quarter_claim', engine);
      assert.deepEqual(client.sent.at(-1), { t: 'quarter_claim', lot: 1105 });
      for (const fn of handlers['msg:quarter_claimed'] || []) fn({ t: 'quarter_claimed', lot: 1105, status: 'settled' });
      assert.equal(engine.log.toasts.at(-1), QUARTER_TEXT.claimed('1105 Mien Evoke Quarter'));
    } finally {
      globalThis.document = savedDoc;
      globalThis.fetch = savedFetch;
    }
  });
});

describe('the home street\'s quarter arm names the quarter the lot is in', () => {
  it('"1135 Mien Evoke Quarter", leading to that lot on its block', () => {
    assert.deepEqual(homeArm({ street: BLOCK.tsid, lot: 1135 }), { label: '1135 Mien Evoke Quarter', tsid: BLOCK.tsid, lot: 1135 });
    assert.equal(homeArm({ street: 'GQRMM1100BLOCK1', lot: 1135 }).label, '1135 Marylpole Mount Quarter');
    const at = lotArrival(block, 1135);
    const spot = block.quarter.lots.find((l) => l.lot === 1135);
    assert.deepEqual(at, { tsid: BLOCK.tsid, spawnX: spot.x - block.bounds.l, spawnY: spot.y - block.bounds.t });
    assert.equal(QUARTER_TEXT.armVerb(homeArm({ street: BLOCK.tsid, lot: 1135 }).label), 'Go to 1135 Mien Evoke Quarter');
  });
});

describe('the second quarter is data: the server and site name no block', () => {
  it('the server\'s data lists Mien Evoke Quarter\'s block from the street JSON', () => {
    const data = quartersData();
    assert.deepEqual(data.streets[BLOCK.tsid], { label: 'Mien Evoke Quarter, 1100 block', lots: blockLots(BLOCK) });
    assert.deepEqual(Object.keys(data.streets), QUARTER_BLOCKS.map((b) => b.tsid).sort());
    if (HAS_SERVER) {
      assert.equal(readFileSync(serverPath('data', 'quarters.json'), 'utf8'), `${JSON.stringify(data)}\n`, 'run node tools/build-realtime-quarters.mjs');
      assert.doesNotMatch(readFileSync(serverPath('quarter.go'), 'utf8'), /GQRM[EM]\d/);
    }
    if (HAS_SITE) {
      const q = readFileSync(join(SITE_DIR, 'src/Quarter.php'), 'utf8');
      assert.doesNotMatch(q, /GQRM[EM]\d/);
      // A held lot elsewhere is told apart by its street and number (two quarters share 1105).
      assert.match(q, /\(string\) \$mine\['street'\] === \$call\['street'\] && \(int\) \$mine\['lot'\] === \$call\['lot'\]/);
    }
    assert.equal(blockOf('GQRME1100BLOCK1'), BLOCK);
  });

  it('the composition is registered as ours', () => {
    const reg = JSON.parse(read('tools/inventions/inventions.json')).entries.find((e) => e.id === 'bortola-quarter-block');
    assert.ok(reg, 'inventions bortola-quarter-block');
    assert.match(reg.why, /Ours: the block street is composed from Mien Evoke \(GHVLCNLR783251B, CC0\)/);
    assert.ok(reg.where.some((w) => w.file === 'public/assets/streets/GQRME1100BLOCK1.json'));
  });
});
