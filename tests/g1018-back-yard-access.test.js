/**
 * G1018 (M28; Austin 2026-11-25): "Only key holders should be able to see inside/backyard. Well
 * and also visitors who knock and are let in." The house and the back yard go only to the owner,
 * a key-holder, or a visitor the owner let in (GameServerJS locations/inc_pols.js pols_canEnter
 * 461-532), on the site's answers (groddle-afternoon-site src/Neighbours.php forVisitor,
 * mayEnterWith, insideProof; src/HomeYard.php ?place=yard) and on the realtime server
 * (homes.go gate, home_yard.go "b:" ids from HOUSE_ only: home_backyard_test.go). Those inside use
 * the back yard's verbs as on the home street, through the same server and site route, and one
 * pile's digs are one count for owner and guests: a guest's dig the owner's game applies to its
 * own back yard (RH_HOME_INT).
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { BACK_YARD_PREFIX, bareBackYardAnswer, normalizeYardActs } from '../public/js/yard-verbs-mp.js?v=0542e3b7';
import { applyStockAct, normalizeStockView } from '../public/js/yard-stock-mp.js?v=3c2c80d3';
import { forgetInside, insideProof, insideQuery, normalizeHomeView, rememberInside, visitSceneTsid } from '../public/js/neighbours-mp.js?v=e59e6b47';
import { getResourceNodeDef } from '../public/js/resource-nodes.js?v=e2d1cbc9';
import { HAS_SERVER, HAS_SITE, SITE_DIR, serverPath, sitePath } from '../tools/repos.mjs';
import { HAS_PHP, PHP } from './php.js';

const hasPhp = HAS_PHP;
const skipSite = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
const SECRET = 'g1018-test-secret-g1018-test-secret-g1018';

function php(classes, body) {
  const code = `foreach (${JSON.stringify(classes)} as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; ${body}`;
  return JSON.parse(execFileSync(PHP, ['-r', code]).toString());
}

const b64 = (s) => Buffer.from(s).toString('base64url');
/** A token signed as homes.go insideProof signs one (and buddies.go / the site sign theirs). */
function sign(payload, secret = SECRET) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
const now = Math.floor(Date.now() / 1000);
const letIn = (sub = 9, o = 7, extra = {}) => sign({ k: 'house_in', sub, o, iat: now, exp: now + 600, ...extra });

const DIRT = { id: 4, protoClass: 'proto_dirt_pile', endClass: 'dirt_pile', rx: -300 };
/** An owner (7) whose back yard has a Dirt Pile with 3 digs in it, and nothing on the street but a Patch. */
const ownerSave = {
  systems: {
    home: { owned: true },
    features: { homes: { cult: { items: [{ id: 1, protoClass: 'proto_patch', endClass: 'patch', rx: 470 }] }, backYard: { items: [DIRT], yardLeft: 0 } } },
  },
  world: { streets: { RH_HOME_INT: { features: { 'resource-nodes': { nodes: { 'dirt_pile:0': { classTsid: 'dirt_pile', units: 3, regrowAt: 0, totalHarvests: 0 } } } } } } },
};

describe('the site sends the house and back yard only to those who may enter (Neighbours.php)', { skip: skipSite }, () => {
  const view = {
    owner: { id: 7, name: 'Ada' },
    home: { owned: true, style: 'meadow', house: null },
    homes: { cult: { items: [] }, decor: { placed: [{ classTsid: 'furniture_chair' }] }, backYard: { items: [DIRT] }, yardStyle: 'firebog_yard', streetStyle: 'meadow_street', tower: { built: true } },
    gnomes: [{ id: 'g1', place: 'street' }, { id: 'g2', place: 'house' }],
    stacks: [{ id: 's1', place: 'house' }, { id: 's2', place: 'tower:0' }],
    key: false,
  };
  const answer = (inside) => php(['Neighbours'], `use Groddle\\Minn\\Neighbours as N; $v = json_decode(${JSON.stringify(JSON.stringify(view))}, true); $v['homes'] = json_decode(json_encode($v['homes'])); echo json_encode(N::forVisitor($v, ${inside ? 'true' : 'false'}));`);
  const mayEnter = (me, key, token, secret = SECRET) => php(['Neighbours'], `use Groddle\\Minn\\Neighbours as N; echo json_encode(N::mayEnterWith(7, ${me}, ${key ? 'true' : 'false'}, ${JSON.stringify(token)}, ${secret === null ? 'null' : JSON.stringify(secret)}, ${now}));`);

  it('the access matrix: owner, key holder, let in, plain visitor, owner offline with a key holder or a plain visitor', () => {
    // The realtime server hands a proof only to someone the owner, online, let in (homes.go): offline owners give none.
    const rows = [
      ['owner', 7, false, '', true],
      ['key holder', 9, true, '', true],
      ['knocked and let in', 9, false, letIn(), true],
      ['plain visitor', 9, false, '', false],
      ['owner offline, key holder', 9, true, '', true],
      ['owner offline, plain visitor', 9, false, '', false],
    ];
    for (const [who, me, key, token, want] of rows) {
      const inside = mayEnter(me, key, token);
      assert.equal(inside, want, who);
      const a = answer(inside);
      assert.equal(a.inside, want, `${who}: inside`);
      assert.equal(Boolean(a.homes.decor), want, `${who}: the house's furniture`);
      assert.equal(Boolean(a.homes.backYard), want, `${who}: the back yard`);
      assert.equal(Boolean(a.homes.yardStyle), want, `${who}: the back yard's look`);
      assert.deepEqual(a.gnomes.map((g) => g.id), want ? ['g1', 'g2'] : ['g1'], `${who}: gnomes`);
      assert.deepEqual(a.stacks.map((s) => s.id), want ? ['s1', 's2'] : ['s2'], `${who}: stacks`);
      // The home street, the house from outside and the Tower are everyone's (inc_pols.js 448-458).
      assert.deepEqual([a.homes.streetStyle, a.homes.tower.built, a.home.style], ['meadow_street', true, 'meadow'], `${who}: the street`);
    }
  });

  it('a let-in proof is the realtime server\'s, for this visitor at this home, and fresh', () => {
    assert.equal(mayEnter(9, false, letIn()), true);
    assert.equal(mayEnter(11, false, letIn()), false, 'someone else\'s proof');
    assert.equal(mayEnter(9, false, letIn(9, 8)), false, 'another home\'s proof');
    assert.equal(mayEnter(9, false, letIn(9, 7, { k: 'home' })), false, 'a visit pass is no let-in proof');
    assert.equal(mayEnter(9, false, letIn(9, 7, { exp: now - 1 })), false, 'expired');
    assert.equal(mayEnter(9, false, letIn(9, 7, { exp: now + 7200 })), false, 'made to last past the server\'s ten minutes');
    assert.equal(mayEnter(9, false, letIn().slice(0, -2) + 'AA'), false, 'tampered');
    assert.equal(mayEnter(9, false, sign({ k: 'house_in', sub: 9, o: 7, exp: now + 600 }, 'another-secret-another-secret-another')), false, 'another secret');
    assert.equal(mayEnter(9, false, letIn(), null), false, 'no secret on this site');
  });

  it('the visit route passes ?in= and every house answer is filtered', () => {
    const src = readFileSync(sitePath('src/Neighbours.php'), 'utf8');
    assert.match(src, /\$request->query\('in'\)/);
    assert.match(src, /return self::forVisitor\(\[/);
    assert.match(readFileSync(sitePath('src/HomeMachines.php'), 'utf8'), /mayEnter\(\$request, \$owner, \$me\)/);
    assert.match(readFileSync(sitePath('src/HomeStreet.php'), 'utf8'), /mayEnter\(\$request, \$owner, \$me\)/);
    assert.match(readFileSync(sitePath('src/HomeYard.php'), 'utf8'), /\$place === 'yard' && !\(new Neighbours\(\$this->minn\)\)->mayEnter/);
  });
});

describe('the back yard\'s verbs at the site (HomeYard.php)', { skip: skipSite }, () => {
  const t = Date.now();
  const run = (body) => php(['HomePool', 'HomeYard'], `use Groddle\\Minn\\HomeYard as Y; $s = json_decode(${JSON.stringify(JSON.stringify(ownerSave))}); ${body}`);
  const view = (waiting = [], uses = {}) => run(`echo json_encode(Y::backYardView(Y::rules(), $s, json_decode(${JSON.stringify(JSON.stringify(waiting))}, true), json_decode(${JSON.stringify(JSON.stringify(uses))}, true), ${t}));`);
  const dig = (waiting = [], uses = {}, verb = 'dig') => run(`$w = json_decode(${JSON.stringify(JSON.stringify(waiting))}, true); $u = json_decode(${JSON.stringify(JSON.stringify(uses))}, true);
    echo json_encode(Y::judgeStock(Y::rules(), Y::placeState($s, 'yard'), Y::placeRows($w, 'yard'), Y::placeKeyed($u, 'yard'), [], 'node', Y::bare('b:node:dirt_pile:0'), ${JSON.stringify(verb)}, ${t}, fn ($a, $b) => $a));`);
  const act = (n, at) => ({ id: `yd-000000000000000${n}`, kind: 'node', target: 'b:node:dirt_pile:0', verb: 'dig', took: 1, at_ms: at });

  it('names: the back yard\'s rocks, nodes and Patches with "b:", never an animal', () => {
    const ok = run(`echo json_encode([Y::validId('node', 'b:node:dirt_pile:0'), Y::validId('rock', 'b:rock:0'), Y::validId('plot', 'b:patch:1'), Y::validId('animal', 'b:a1'), Y::validId('node', 'b:b:node:dirt_pile:0'), Y::validId('node', 'b:node:mortar_barnacle:999'), Y::placeOf('b:rock:0'), Y::placeOf('rock:0')]);`);
    assert.deepEqual(ok, [true, true, true, false, false, false, 'yard', 'street']);
  });

  it('the back yard as it stands: the Dirt Pile\'s real digs left, to those inside', () => {
    const v = view();
    assert.equal(v.place, 'yard');
    assert.deepEqual(v.nodes.map((n) => [n.id, n.node.units]), [['b:node:dirt_pile:0', 3]]);
    assert.deepEqual(v.patches, []);
    assert.equal(v.cult.items[0].protoClass, 'proto_dirt_pile');
  });

  it('a guest digs: one dig shared, the street\'s things untouched; the pile runs dry for everyone', () => {
    // dirt_pile.js verbs.dig 102-115: a working shovel (the guest's own game), enough dirt, three a day per player.
    assert.deepEqual(dig(), { pool: 'node:dirt_pile', took: 1, got: { earth: 2 }, left: 2 });
    const one = [act(1, t - 1000)];
    assert.deepEqual(view(one).nodes.map((n) => n.node.units), [2], 'the site\'s view after the guest\'s dig');
    assert.deepEqual(dig(one).left, 1, 'the next dig, the owner\'s or anyone\'s, starts from it');
    const two = [...one, act(2, t - 500)];
    assert.deepEqual(view(two).nodes.map((n) => n.node.units), [1]);
    assert.equal(dig(two).text, "There isn't enough dirt left to dig.", 'dirt_pile.js:113');
    // A street act on the same name is the street's, not the back yard's.
    assert.deepEqual(view([{ ...act(3, t - 100), target: 'node:dirt_pile:0' }]).nodes.map((n) => n.node.units), [3]);
  });

  it('the daily limit is each guest\'s own, per pile', () => {
    assert.equal(dig([], { 'dig:b:node:dirt_pile:0': 3 }).text, "You've dug this dirt pile enough for today.");
    assert.equal(dig([], { 'dig:node:dirt_pile:0': 3 }).pool, 'node:dirt_pile', 'three digs of a street pile are not this one');
    assert.deepEqual(view([], { 'dig:b:node:dirt_pile:0': 2, 'dig:node:dirt_pile:0': 1 }).mine, { 'dig:b:node:dirt_pile:0': 2 });
  });

  it('Wine of the Dead stays the owner\'s: no visitor verb pours it (dirt_pile.js 67)', () => {
    assert.equal(dig([], {}, 'pour').why, 'gone');
  });
});

describe('the owner\'s game and the visitor\'s copy (js)', () => {
  it('a guest\'s back-yard dig reaches the owner as a back-yard act, and depletes the owner\'s own pile', () => {
    const [act] = normalizeYardActs([{ id: 'yd-0000000000000001', kind: 'node', target: 'b:node:dirt_pile:0', verb: 'dig', took: 1, left: 1, at: Date.now() - 1000, from: { id: 9, name: 'Bo' } }]);
    assert.equal(act.back, true);
    assert.equal(act.target, 'node:dirt_pile:0');
    assert.deepEqual(normalizeYardActs([{ id: 'yd-0000000000000002', kind: 'animal', target: 'b:a1', verb: 'pet' }]), [], 'the back yard keeps no animals');
    assert.equal(normalizeYardActs([{ id: 'yd-0000000000000003', kind: 'node', target: 'node:dirt_pile:0', verb: 'dig' }])[0].back, undefined);
    // The owner's back-yard slots (RH_HOME_INT): 2 digs in it before, 1 after, below what a dig needs.
    const nodes = { 'dirt_pile:0': { classTsid: 'dirt_pile', units: 2, regrowAt: 0, totalHarvests: 0 } };
    const changed = applyStockAct({ rocks: [], nodes, items: [DIRT] }, act);
    assert.equal(changed.kind, 'node');
    assert.equal(nodes['dirt_pile:0'].units, 1);
    assert.ok(nodes['dirt_pile:0'].units < getResourceNodeDef('dirt_pile').stock.harvestableAt, 'the owner sees it dug out');
    assert.equal(nodes['dirt_pile:0'].totalHarvests, 1, 'and it wears the cultivation (homes-feature wearFromNodes)');
  });

  it('the site\'s back-yard answer, bare for the copies; never the street\'s', () => {
    const answer = { owner: 7, place: 'yard', cult: { items: [DIRT] }, rocks: [{ id: 'b:rock:0', classId: 'rock_beryl_1', rx: -500, rock: { chunksRemaining: 20 } }], nodes: [{ id: 'b:node:dirt_pile:0', classTsid: 'dirt_pile', rx: -300, dy: 0, node: { units: 3 } }], patches: [{ key: 'b:patch:0', rx: -700, plot: { stage: 'dirty' } }], mine: { 'dig:b:node:dirt_pile:0': 1, 'dig:node:dirt_pile:0': 2 } };
    const bare = bareBackYardAnswer(answer);
    assert.deepEqual(normalizeStockView(bare).nodes.map((n) => [n.id, n.key]), [['node:dirt_pile:0', 'dirt_pile:0']]);
    assert.deepEqual(normalizeStockView(bare).rocks.map((r) => r.id), ['rock:0']);
    assert.deepEqual(bare.patches.map((p) => p.key), ['patch:0']);
    assert.deepEqual(bare.mine, { 'dig:node:dirt_pile:0': 1 });
    assert.equal(bareBackYardAnswer({ ...answer, place: undefined }), null, 'a site that sent the street\'s yard');
    assert.equal(BACK_YARD_PREFIX, 'b:');
  });

  it('the let-in proof the server hands out goes with every read of that home, until it runs out', () => {
    const token = sign({ k: 'house_in', sub: 9, o: 7, exp: now + 600 });
    assert.equal(rememberInside(7, token), true);
    assert.equal(insideProof(7), token);
    assert.equal(insideQuery(7, '&'), `&in=${encodeURIComponent(token)}`);
    assert.equal(insideQuery(8), '', 'only for that home');
    assert.equal(insideProof(7, (now + 601) * 1000), '', 'run out');
    assert.equal(rememberInside(7, sign({ k: 'house_in', sub: 9, o: 7, exp: now - 5 })), false, 'already stale');
    assert.equal(rememberInside(7, 'not a proof'), false);
    rememberInside(7, token);
    forgetInside(7);
    assert.equal(insideProof(7), '', 'walked out');
    assert.equal(normalizeHomeView({ owner: { id: 7, name: 'Ada' }, home: { owned: true }, inside: false }).inside, false);
    assert.equal(normalizeHomeView({ owner: { id: 7, name: 'Ada' }, home: { owned: true } }).inside, true, 'a site from before G1018 shows everything');
  });
});

// —— The visit itself (features/yard-verbs-mp-feature.js) with a stand-in engine ——

function fakePixi() {
  class Base {
    constructor() {
      this.destroyed = false;
      this.scale = { set() {} };
      this.anchor = { set() {} };
      this.children = [];
    }
    destroy() { this.destroyed = true; }
    on() { return this; }
    once() { return this; }
    off() { return this; }
    emit() { return true; }
    addChild(c) { this.children.push(c); return c; }
  }
  class Texture extends Base {
    constructor(o = {}) { super(); this.source = o.source; this.height = 210; }
  }
  Texture.EMPTY = new Texture();
  class ImageSource extends Base { resize() { return true; } update() {} }
  class Sprite extends Base { constructor(tex) { super(); this.texture = tex; this.x = 0; this.y = 0; } }
  class AnimatedSprite extends Sprite { play() {} gotoAndPlay() {} gotoAndStop() {} }
  class Rectangle { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
  return { Texture, ImageSource, Sprite, AnimatedSprite, Container: Base, Rectangle };
}

describe('in the house, a guest gets the back yard and acts on it as "b:"; the owner applies it to the back yard', () => {
  it('visit, act, apply', async () => {
    globalThis.PIXI = fakePixi();
    globalThis.Image = class { set src(v) { this._src = v; } };
    const realDoc = globalThis.document;
    const realFetch = globalThis.fetch;
    globalThis.document = { baseURI: 'http://groddle.test/', createElement: () => ({ getContext() {} }) };
    const asked = [];
    const back = { owner: 7, name: 'Ada', place: 'yard', cult: { items: [{ id: 5, protoClass: 'proto_patch', endClass: 'patch', rx: -400 }] }, patches: [{ key: 'b:patch:0', rx: -400, plot: { stage: 'dirty', since: 0, dueAt: 0 } }], rocks: [], nodes: [], animals: [], mine: {} };
    globalThis.fetch = async (url) => {
      const u = String(url);
      asked.push(u);
      const body = /homes\/7\/yard\?place=yard/.test(u) ? back : /homes\/yard/.test(u) ? { acts: [] } : {};
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(JSON.stringify(body)), text: async () => '' };
    };
    const sent = [];
    const handlers = {};
    const client = { state: 'online', me: { id: 9 }, on: (ev, fn) => { handlers[ev] = fn; }, send: (t, m) => sent.push({ t, ...m }) };
    const slots = { RH_HOME_INT: { rocks: [], features: {} }, RH_HOME_EXT: { rocks: [], features: {} } };
    const engine = {
      mode: 'multiplayer',
      started: true,
      streetTsid: visitSceneTsid(7, 'interior'),
      PIXI: globalThis.PIXI,
      entityLayer: { addChild() {} },
      register(t) { return t; },
      unregister() {},
      query: (k) => (k === 'realtimeClient' ? client : null),
      setData() {},
      toast() {},
      pushActivity() {},
      floatText() {},
      playSound() {},
      refreshPack() {},
      achievement() {},
      save() {},
      param: () => null,
      homeContext: () => ({ inHome: false }),
      streetWorld: (tsid) => slots[tsid],
      streetSlot: (id, tsid) => {
        const st = slots[tsid];
        st.features[id] ||= {};
        return st.features[id];
      },
      inv: {},
      pc: { energy: 100 },
      learnedSkills: [],
      worldW: 3000,
    };
    const token = sign({ k: 'house_in', sub: 9, o: 7, exp: now + 600 });
    rememberInside(7, token);
    try {
      const { yardVerbsMpFeature } = await import('../public/js/features/yard-verbs-mp-feature.js?v=3751adc0');
      const { homesFeature } = await import('../public/js/features/homes-feature.js?v=e875a7e2');
      yardVerbsMpFeature.onTick(16, 1, engine);
      for (let i = 0; i < 40 && !globalThis.groddleYard?.visit; i += 1) await new Promise((r) => setTimeout(r, 5));
      const yard = globalThis.groddleYard;
      assert.ok(yard?.visit, 'the back yard is drawn in the house');
      assert.ok(asked.some((u) => u.includes(`homes/7/yard?place=yard&in=${encodeURIComponent(token)}`)), 'asked with the let-in proof');
      assert.deepEqual(yard.state().plots, { 'patch:0': 'dirty' });
      yard.qaSend('plot', 'patch:0', 'tend');
      assert.deepEqual(sent.filter((m) => m.t === 'home_yard').map((m) => `${m.kind}:${m.id}:${m.verb}`), ['plot:b:patch:0:tend'], 'the wire names the back yard\'s Patch');
      // Another guest's dig of the street's Patch is not this yard's.
      handlers['msg:home_yard_acted']({ owner: 7, from: { id: 11, name: 'Cy' }, act: { id: 'yd-0000000000000004', kind: 'plot', target: 'patch:0', verb: 'dig', took: 0, at: Date.now() } });
      assert.deepEqual(yard.state().plots, { 'patch:0': 'dirty' }, 'the street\'s act leaves the back yard\'s copy alone');
      handlers['msg:home_yard_acted']({ owner: 7, from: { id: 11, name: 'Cy' }, act: { id: 'yd-0000000000000005', kind: 'plot', target: 'b:patch:0', verb: 'tend', took: 0, at: Date.now() } });
      assert.deepEqual(yard.state().plots, { 'patch:0': 'clean' }, 'the back yard\'s act lands on the copy');

      // The owner's side: the same session as owner 9 of a back yard with a Dirt Pile.
      homesFeature.restore({ backYard: { items: [{ ...DIRT, id: 4 }] } }, engine);
      slots.RH_HOME_INT.features['resource-nodes'] = { nodes: { 'dirt_pile:0': { classTsid: 'dirt_pile', units: 2, regrowAt: 0, totalHarvests: 0 } } };
      handlers['msg:home_yard_acted']({ owner: 9, from: { id: 12, name: 'Dan' }, act: { id: 'yd-0000000000000006', kind: 'node', target: 'b:node:dirt_pile:0', verb: 'dig', took: 1, left: 1, at: Date.now() - 500 } });
      assert.equal(slots.RH_HOME_INT.features['resource-nodes'].nodes['dirt_pile:0'].units, 1, 'the owner\'s own back-yard pile is dug');
      assert.equal(slots.RH_HOME_EXT.features['resource-nodes']?.nodes?.['dirt_pile:0'], undefined, 'not the street\'s');
      assert.match(yard.state().last, /^applied:node:node:dirt_pile:0:dig/);
    } finally {
      delete globalThis.groddleYard;
      forgetInside(7);
      globalThis.fetch = realFetch;
      if (realDoc === undefined) delete globalThis.document;
      else globalThis.document = realDoc;
    }
  });
});

describe('the server keeps the back yard to those in the house (home_yard.go, homes.go)', { skip: !HAS_SERVER && 'no groddle-afternoon-server checkout' }, () => {
  it('back-yard ids from HOUSE_ only; a let-in proof for the site', () => {
    const yard = readFileSync(serverPath('home_yard.go'), 'utf8');
    assert.match(yard, /yardBackPrefix = "b:"/);
    assert.match(yard, /houseStreetPrefix\+strconv\.FormatInt\(owner, 10\)/);
    assert.doesNotMatch(yard, /\|pour\|/, 'Wine of the Dead is no visitor verb');
    assert.match(readFileSync(serverPath('homes.go'), 'utf8'), /"k": "house_in"/);
  });
});
