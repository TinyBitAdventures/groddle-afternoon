/**
 * G1186, the 1200 block (Austin 2026-11-27): Marylpole Mount Quarter gets a second block. Glitch's
 * naming (groups/quarter.js generate_label 444-460: "<Name>, <x><y>00 block", houses
 * "<x><y>## <Name>"), lots numbered x5 (1205 to 1295). The blocks are one list in js/quarter.js
 * (QUARTER_BLOCKS): the grid grows with it (QuarterInfo rows and cols), Marylpole Mount's QUARTER
 * signpost offers every block (glitch-client SignpostView.as 155-238 drew the board,
 * LocationSelectorDialog.as showQuarters opened the grid of blocks on a click), each block's own
 * signpost leads back to Marylpole Mount (locations/quarter.js get_exit_position 63-84), and one
 * lot per player holds across every block (locations/inc_pols.js pols_canBuy has_other) in the
 * game, the realtime server (quarter.go) and the site (src/Quarter.php).
 * Run: node --test tests/g1186-quarter-blocks.test.js
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  QUARTER,
  QUARTER_ALL_LOTS,
  QUARTER_BLOCKS,
  QUARTER_LOT_STEP,
  QUARTER_PARENT_SIGN_ID,
  QUARTER_PARENT_SIGN_X,
  QUARTER_PARENT_TSID,
  QUARTER_TEXT,
  blockChoice,
  blockLabel,
  blockLots,
  blockOf,
  judgeClaim,
  lotLabel,
  normalizeLots,
  quarterInfo,
  quarterStreet,
} from '../public/js/quarter.js?v=a38887ca';
import { HOUSE_STYLE_IDS, houseLot } from '../public/js/home-house.js?v=3c88c47c';
import { doorSaleArt } from '../public/js/door-sign-art.js?v=69daffff';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=e9221d85';
import { addQuarterBoard } from '../public/js/street-render.js?v=c1ac1f42';
import { signpostArmRows } from '../public/js/world-context-menu.js?v=00e2eb03';
import { quarterFeature, _quarterState, _resetQuarter } from '../public/js/features/quarter-feature.js?v=611772e4';
import { quartersData } from '../tools/build-realtime-quarters.mjs';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath } from '../tools/repos.mjs';
import { Display, fakePixi } from './fake-scene.js';
import { HAS_PHP, PHP } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));
const parent = street(QUARTER_PARENT_TSID);
// Marylpole Mount Quarter's blocks (Mien Evoke Quarter's are tests/g1186-quarter-bortola.test.js's).
const MM_BLOCKS = QUARTER_BLOCKS.filter((b) => b.quarter === 'MM');
const B1100 = QUARTER_BLOCKS[0];
const B1200 = QUARTER_BLOCKS[1];

describe('two blocks, each its own street, lots and label', () => {
  it('the 1100 and 1200 blocks: Glitch\'s names, lots 1105-1195 and 1205-1295', () => {
    assert.deepEqual(MM_BLOCKS.map((b) => [b.tsid, b.x, b.y]), [['GQRMM1100BLOCK1', 1, 1], ['GQRMM1200BLOCK1', 1, 2]]);
    assert.equal(blockLabel(QUARTER.name, 1, 2), 'Marylpole Mount Quarter, 1200 block');
    assert.deepEqual(blockLots(B1200), [1205, 1215, 1225, 1235, 1245, 1255, 1265, 1275, 1285, 1295]);
    assert.equal(lotLabel(1205), '1205 Marylpole Mount Quarter');
    assert.equal(new Set(MM_BLOCKS.flatMap(blockLots)).size, 20, 'no lot number on two blocks of one quarter (the site keys a lot by street and lot)');
    assert.ok(MM_BLOCKS.flatMap(blockLots).every((lot) => QUARTER_ALL_LOTS.includes(lot)));
    const index = JSON.parse(read('public/assets/streets/index.json')).streets;
    for (const b of MM_BLOCKS) {
      const s = street(b.tsid);
      assert.equal(s.label, blockLabel(QUARTER.name, b.x, b.y));
      assert.equal(index[b.tsid].label, s.label);
      assert.deepEqual(s.quarter.lots.map((l) => l.lot), blockLots(b));
      assert.deepEqual(s.quarter.block, { x: b.x, y: b.y });
      assert.deepEqual({ cols: s.quarter.cols, rows: s.quarter.rows }, { cols: 1, rows: 2 }, 'the grid holds both');
      assert.equal(blockOf(`L${b.tsid.slice(1)}`), b);
    }
  });

  it('the 1200 block is Herring Bone Hatch\'s ground and art, built as the builder writes it', () => {
    const block = street(B1200.tsid);
    const template = street(B1200.template);
    assert.equal(template.label, 'Herring Bone Hatch');
    assert.equal(template.hubId, '28', 'one of the archived Old Groddle Forest lot streets');
    assert.deepEqual(quarterStreet(template, { parentArrive: block.signposts[0].connects[0].arrive, block: B1200 }), block);
    assert.deepEqual(block.layers, template.layers, 'its own decos (CC0)');
    assert.deepEqual(block.platforms, template.platforms);
    assert.equal(block.doors, undefined);
    // Its nine meadow houses in order, the first again for the tenth.
    const doors = [...template.doors].sort((a, b) => a.x - b.x).map((d) => d.sprite);
    assert.equal(doors.length, 9);
    assert.deepEqual(block.quarter.lots.map((l) => l.sprite), [...doors, doors[0]]);
  });

  for (const b of QUARTER_BLOCKS) {
    it(`${b.quarter} ${b.x}${b.y}00 block: every lot on the floor with its For Sale art, no two houses overlapping, all inside the street`, () => {
      const block = street(b.tsid);
      let left = 0, right = 0;
      for (const id of HOUSE_STYLE_IDS) for (const facing of [false, true]) {
        const { bounds } = houseLot(id, null, facing);
        left = Math.max(left, -bounds.l);
        right = Math.max(right, bounds.r);
      }
      const lots = block.quarter.lots;
      for (let i = 0; i < lots.length; i++) {
        const lot = lots[i];
        const at = arrivalInTarget(block, lot.x, lot.y - 4);
        assert.ok(at?.snapped && Math.abs(at.y + block.bounds.t - lot.y) <= 1, `${lot.lot} on the floor`);
        const art = doorSaleArt(lot.sprite);
        assert.ok(art && existsSync(join(root, 'public', art)), `${lot.sprite} has a For Sale sign`);
        if (i) assert.equal(lot.x - lots[i - 1].x, QUARTER_LOT_STEP);
      }
      assert.ok(left + right <= QUARTER_LOT_STEP);
      assert.ok(lots[0].x - left > block.signposts[0].x + 40, 'clear of the signpost');
      assert.ok(lots.at(-1).x + right <= block.bounds.r, 'inside the street');
    });
  }
});

describe('the QUARTER signpost on Marylpole Mount offers both blocks', () => {
  const sign = parent.signposts.find((p) => p.id === QUARTER_PARENT_SIGN_ID);

  it('its grid is one column of two rows, a connect per block; each block\'s signpost leads back beside it', () => {
    assert.deepEqual(sign.quarter, { style: 'normal', label: 'Marylpole Mount Quarter', cols: 1, rows: 2 });
    assert.deepEqual(quarterInfo(), sign.quarter);
    assert.deepEqual(sign.connects.map((c) => c.label), ['Marylpole Mount Quarter, 1100 block', 'Marylpole Mount Quarter, 1200 block']);
    sign.connects.forEach((c, i) => {
      const block = street(QUARTER_BLOCKS[i].tsid);
      assert.equal(c.tsid.slice(1), block.tsid.slice(1));
      assert.ok(arrivalInTarget(block, c.arrive.x + block.bounds.l, c.arrive.y + block.bounds.t - 4)?.snapped, `${block.label}: the arrival is on its floor`);
      assert.ok(Math.abs(c.arrive.x + block.bounds.l - block.signposts[0].x) < 120, 'beside the block\'s own signpost');
      const back = block.signposts[0].connects;
      assert.equal(back.length, 1, 'one way out: Marylpole Mount (get_exit_position)');
      assert.equal(back[0].tsid.slice(1), QUARTER_PARENT_TSID.slice(1));
      assert.ok(Math.abs(back[0].arrive.x + parent.bounds.l - QUARTER_PARENT_SIGN_X) < 120, 'lands beside the QUARTER signpost');
    });
    // The client's grid buttons: the number from the label, at the block's column and row.
    assert.deepEqual(sign.connects.map(blockChoice), [
      { tsid: 'GQRMM1100BLOCK1', label: '1100 block', col: 1, row: 1 },
      { tsid: 'GQRMM1200BLOCK1', label: '1200 block', col: 1, row: 2 },
    ]);
  });

  it('the board is one QUARTER board with a choice per block, opened as a menu titled with the quarter', () => {
    const g = new fakePixi.Container();
    g.signBoards = [];
    g.signHoverParts = { arms: [], labels: [], baseLabelFills: [] };
    const holder = new fakePixi.Container();
    addQuarterBoard(fakePixi, g, holder, sign, 246, {});
    assert.equal(g.signQuarter.blocks, 2);
    assert.equal(g.signQuarter.label, 'Marylpole Mount Quarter');
    assert.deepEqual(g.signBoards.map((b) => [b.key, b.connection.label, b.menuLabel]), [
      ['1', 'Marylpole Mount Quarter, 1100 block', '1100 block'],
      ['2', 'Marylpole Mount Quarter, 1200 block', '1200 block'],
    ]);
    assert.equal(g.signBoards[0].arm, g.signBoards[1].arm, 'both are the one board');
    const rows = signpostArmRows(g.signBoards.map((board) => ({ board })), { label: (b) => b.menuLabel, tip: (b) => `Go to ${b.connection.label}` });
    assert.deepEqual(rows.map((r) => [r.label, r.tip]), [['1100 block', 'Go to Marylpole Mount Quarter, 1100 block'], ['1200 block', 'Go to Marylpole Mount Quarter, 1200 block']]);
    // game.js: a click, Enter or a right-click on it opens the blocks (as a lift's floors), titled with the quarter's name.
    const game = read('public/game.js');
    assert.match(game, /function signMenuView\(view\) \{\n\s+return Boolean\(view\?\.signDeco \|\| view\?\.signQuarter\?\.blocks > 1\);/);
    assert.match(game, /if \(signMenuView\(at\.view\)\) \{/);
    assert.match(game, /if \(signMenuView\(signBoard\?\.view\)\) \{/);
    assert.match(game, /title: lift \? 'Lift' : quarter \? quarter\.label : 'Signpost',/);
  });
});

/* ------------------------------------------------------------------ */
/* One lot per player across blocks                                    */
/* ------------------------------------------------------------------ */

class FakeSource { constructor() { this.destroyed = false; } emit() {} resize() { return true; } update() {} on() {} once() {} off() {} }
class FakeTexture { constructor(o = {}) { this.source = o.source || new FakeSource(); this.destroyed = false; } }
const testPixi = new Proxy({ ImageSource: FakeSource, Texture: FakeTexture, Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } } }, {
  get: (t, k) => (k in t ? t[k] : fakePixi[k]),
});

function fakeEngine(block, { mode = 'solo', client = null } = {}) {
  const targets = new Set();
  const log = { toasts: [], sent: [] };
  return {
    log,
    targets,
    mode,
    started: true,
    PIXI: testPixi,
    entityLayer: new Display(),
    streetTsid: block.tsid,
    street: block,
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

describe('one lot per player across blocks (pols_canBuy has_other)', () => {
  let savedPixi;
  before(() => { savedPixi = globalThis.PIXI; globalThis.PIXI = testPixi; });
  after(() => { globalThis.PIXI = savedPixi; });
  beforeEach(() => _resetQuarter());

  it('the rule: a lot held on any block refuses a claim on another', () => {
    const empty = new Map();
    assert.equal(judgeClaim({ lots: empty, me: 7, lot: 1215, mine: 1105 }), 'have');
    assert.equal(judgeClaim({ lots: empty, me: 7, lot: 1215, mine: 0 }), null);
    assert.equal(judgeClaim({ lots: empty, me: 7, lot: 1105, mine: 1105 }), null, 'your own lot again answers the same');
    assert.deepEqual([...normalizeLots([{ lot: 1205, owner: { id: 7, name: 'Ada' } }, { lot: 1105, owner: { id: 8, name: 'Bo' } }], blockLots(B1200)).keys()], [1205], 'a block reads its own lots');
  });

  it('solo: your lot on the 1100 block greys out the 1200 block\'s For Sale lots', () => {
    const block = street(B1200.tsid);
    const engine = fakeEngine(block);
    quarterFeature.restore({ lot: 1135 }, engine);
    quarterFeature.onStreetEnter(block, engine);
    assert.equal(engine.targets.size, 10);
    assert.equal(lotTarget(engine, 1205).label, '1205 Marylpole Mount Quarter');
    const [verb] = quarterFeature.verbsFor(lotTarget(engine, 1205), engine);
    assert.equal(verb.enabled, false);
    assert.equal(verb.reason, QUARTER_TEXT.hasOther);
  });

  it('online: the site says the lot you hold on any block, and a claim on another is refused before it is sent', async () => {
    const block = street(B1200.tsid);
    const handlers = {};
    const client = { state: 'online', me: { id: 9 }, sent: [], on(kind, fn) { (handlers[kind] ||= []).push(fn); return () => {}; }, send(kind, p = {}) { this.sent.push({ t: kind, ...p }); return true; } };
    const engine = fakeEngine(block, { mode: 'multiplayer', client });
    const savedDoc = globalThis.document;
    const savedFetch = globalThis.fetch;
    globalThis.document = { baseURI: 'https://example.test/play/online/' };
    // The site's GET quarter/<street>: nobody on this block yet, and you hold 1105 on the other.
    globalThis.fetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ street: block.tsid, lots: [], mine: { street: 'GQRMM1100BLOCK1', lot: 1105 } }) });
    try {
      quarterFeature.restore(undefined, engine);
      quarterFeature.onStreetEnter(block, engine);
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(_quarterState().held, 1105);
      const [verb] = quarterFeature.verbsFor(lotTarget(engine, 1215), engine);
      assert.equal(verb.enabled, false);
      assert.equal(verb.reason, QUARTER_TEXT.hasOther);
      quarterFeature.runVerb(lotTarget(engine, 1215), 'quarter_claim', engine);
      assert.deepEqual(client.sent, [], 'not sent');
      assert.equal(engine.log.toasts.at(-1), QUARTER_TEXT.hasOther);
    } finally {
      globalThis.document = savedDoc;
      globalThis.fetch = savedFetch;
    }
  });
});

describe('the next block is data, not code', () => {
  it('the server and site name no block; the server\'s data lists both from the street JSON', () => {
    const data = quartersData();
    assert.deepEqual(Object.keys(data.streets), QUARTER_BLOCKS.map((b) => b.tsid).sort());
    assert.deepEqual(data.streets[B1200.tsid], { label: 'Marylpole Mount Quarter, 1200 block', lots: blockLots(B1200) });
    if (HAS_SERVER) {
      assert.equal(readFileSync(serverPath('data', 'quarters.json'), 'utf8'), `${JSON.stringify(data)}\n`, 'run node tools/build-realtime-quarters.mjs');
      assert.doesNotMatch(readFileSync(serverPath('quarter.go'), 'utf8'), /GQRMM\d/);
    }
    if (HAS_SITE) assert.doesNotMatch(readFileSync(join(SITE_DIR, 'src/Quarter.php'), 'utf8'), /GQRMM\d/);
    // The builder lays every block in the list.
    assert.match(read('tools/build-rebuilt-rooms.mjs'), /for \(const quarter of QUARTERS\) \{[\s\S]*for \(const block of quarter\.blocks\) \{/);
  });
});

describe('the site: one lot across blocks and the owner\'s lot (src/Quarter.php, src/HomeStreet.php)', { skip: !HAS_SITE ? 'no site checkout' : !HAS_PHP ? 'no php' : false }, () => {
  const php = (body) => JSON.parse(execFileSync(PHP, ['-r', `foreach (["Neighbours", "Quarter"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; use Groddle\\Minn\\Quarter; ${body}`]).toString());
  const lots = JSON.stringify(blockLots(B1200));

  it('a lot on the 1100 block refuses a claim on the 1200 block (has_other)', () => {
    assert.equal(php(`echo json_encode(Quarter::judgeClaim(json_decode('${lots}', true), 1215, 0, 7, 1105, true, false));`), 'have');
    assert.equal(php(`echo json_encode(Quarter::judgeClaim(json_decode('${lots}', true), 1215, 0, 7, 0, true, false));`), null);
    const json = JSON.stringify(JSON.stringify(street(B1200.tsid)));
    assert.deepEqual(php(`echo json_encode(Quarter::lotsOf(json_decode(${json}, true)));`), blockLots(B1200));
    assert.deepEqual(php('echo json_encode(Quarter::call(["op" => "quarter-00000000000000ab", "id" => 7, "street" => "GQRMM1200BLOCK1", "lot" => 1205], true));'),
      { op: 'quarter-00000000000000ab', id: 7, street: B1200.tsid, lot: 1205 });
  });

  it('the block\'s answer names your lot on any block; the home street\'s answer the owner\'s', () => {
    const q = readFileSync(join(SITE_DIR, 'src/Quarter.php'), 'utf8');
    assert.match(q, /'mine' => self::held\(\$db, \(int\) \$this->minn->reader->userId\)/);
    assert.match(q, /public static function held\(Db \$db, int \$id\): \?array/);
    assert.match(readFileSync(join(SITE_DIR, 'src/HomeStreet.php'), 'utf8'), /'quarter' => Quarter::held\(\$db, \$owner\),/);
  });
});
