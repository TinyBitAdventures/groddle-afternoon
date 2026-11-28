/**
 * #697 (G1302): Giant Icons in your own home. Glitch's home is a POL (locations/inc_pols.js 731):
 * icon_place_conditions (items/include/icon.js 18-24) refuses Place only in someone else's POL, and
 * in your own it drops the Icon with no "picked up by anyone" prompt (icon_place 27-45); in a POL
 * only its owner picks it up (canPickup 1-12) and ruminate / revere / reflect work on it (52, 118,
 * 183: container.pols_is_pol()). Online a visitor sees the owner's Icons (the site's
 * Neighbours::iconRows with the visit) and may ruminate, revere and reflect on them from their own
 * save. The feature draws with the vendored Pixi in a vm.
 * Run: node --test tests/giant-icons-home.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { HAS_PHP, PHP } from './php.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = process.env.GRODDLE_SITE_DIR || join(ROOT, '..', 'groddle-afternoon-site');
const HAS_SITE = existsSync(join(SITE_DIR, 'src', 'Neighbours.php'));

function loadPixi() {
  const g = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' }, performance };
  g.window = g;
  g.self = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(readFileSync(join(ROOT, 'public/vendor/pixi/pixi-8.23.0.min.js'), 'utf8'), g);
  return g.PIXI;
}
class FakeImage {
  constructor() {
    this.naturalWidth = 40;
    this.naturalHeight = 30;
    this.width = 40;
    this.height = 30;
  }
}
const PIXI = loadPixi();
globalThis.PIXI = PIXI;
globalThis.Image = FakeImage;
const { installPixiFixes } = await import('../public/js/pixi-fixes.js?v=0f42b75e');
installPixiFixes(PIXI);

const { PLACE_TEXT, giantIconsFeature } = await import('../public/js/features/giant-icons-feature.js?v=471a3c04');
const { GIANT_ICON_IDS, applyIconAct, bestowCheck, createIconState, homePlaceKey, normalizeVisitIcons, pickUpIcon, placeIcon, shiftHomeIcons } = await import('../public/js/giant-icons.js?v=d21e4a37');
const { normalizeHomeView } = await import('../public/js/neighbours-mp.js?v=de82fd7d');

const HOME_STREET = 'RH_HOME_EXT';
const HOME_HOUSE = 'RH_HOME_INT';
let clock = 1_000_000;

function makeEngine({ mode = 'solo', tsid = HOME_STREET, inHome = true, room = 'street', visit = null, inv = { icon_alph: 1 } } = {}) {
  const targets = [];
  const engine = {
    PIXI,
    mode,
    started: true,
    inv,
    player: { x: 400, y: 600, scale: { x: 1 } },
    platforms: [],
    groundY: 600,
    pc: { level: 12, currants: 0, mood: 10, energy: 10, maxMood: 100, maxEnergy: 100, xp: 0, imagination: 0, imaginationUpgrades: [] },
    learnedSkills: [],
    streetTsid: tsid,
    entityLayer: new PIXI.Container(),
    targets,
    offered: [],
    said: [],
    setData(k, v) { (engine.data ||= {})[k] = v; },
    pushActivity: (m) => engine.said.push(typeof m === 'string' ? m : m.base),
    toast() {},
    refreshPack() {},
    updateHud() {},
    save() {},
    param: () => null,
    playSound() {},
    achievement() {},
    grantAchievement() {},
    transientInstance: () => !inHome && Boolean(visit),
    homeContext: () => ({ inHome, owned: true, room }),
    offerQuestDialogue: (d) => engine.offered.push(d),
    query: (hook) => (hook === 'homeVisitIcons' ? visit : null),
    register(t) {
      const target = { ...t };
      targets.push(target);
      return target;
    },
    unregister(t) {
      const i = targets.indexOf(t);
      if (i >= 0) targets.splice(i, 1);
      t.sprite?.destroy?.();
    },
  };
  return engine;
}

/** One poll of the feature's tick (the home room's Icons are drawn from it). */
function tick(engine) {
  clock += 1000;
  giantIconsFeature.onTick(16, clock, engine);
}

function fresh(engine) {
  giantIconsFeature._reset();
  giantIconsFeature.init(engine);
  return engine;
}

const placeRow = (engine) => giantIconsFeature.packVerbs('icon_alph', engine).find((v) => v.id === 'place');
const iconTargets = (engine) => engine.targets.filter((t) => t.classId === 'icon_alph');
const verbIds = (engine, t) => giantIconsFeature.verbsFor(t, engine).map((v) => `${v.id}${v.enabled === false ? '!' : ''}`);

describe('#697 Place on your own home street (the reproduction)', () => {
  for (const mode of ['solo', 'multiplayer']) {
    it(`${mode}: Place is enabled on your own home street and in your house`, () => {
      const engine = fresh(makeEngine({ mode }));
      assert.equal(placeRow(engine).enabled, true, `locked with: "${placeRow(engine).reason}"`);
      engine.streetTsid = HOME_HOUSE;
      engine.homeContext = () => ({ inHome: true, owned: true, room: 'interior' });
      assert.equal(placeRow(engine).enabled, true, `locked in the house with: "${placeRow(engine).reason}"`);
    });
  }
});

describe('an Icon placed at home', () => {
  it('goes down at once (no "picked up by anyone" prompt), is drawn, saved and drawn again', () => {
    const engine = fresh(makeEngine());
    tick(engine);
    assert.equal(giantIconsFeature.runPackVerb('icon_alph', 'place', engine), true);
    assert.deepEqual(engine.offered, [], 'no prompt in a POL (icon_place 42-44)');
    assert.equal(engine.inv.icon_alph, undefined, 'out of the pack');
    const slice = JSON.parse(JSON.stringify(giantIconsFeature.save()));
    assert.deepEqual(Object.keys(slice.placed), [homePlaceKey('street')]);
    assert.equal(slice.placed['home:street'][0].x, 470, 'beside the player, as on a street');
    assert.equal(iconTargets(engine).length, 1, 'drawn in the home scene');
    assert.equal(engine.data.iconHere, 'home:street');
    assert.equal(engine.data.iconPlaced, 'alph:20');

    // A reload: the save restores it and the home scene draws it again (no street hook runs there).
    giantIconsFeature._reset();
    const again = makeEngine({ inv: {} });
    giantIconsFeature.init(again);
    giantIconsFeature.restore(slice);
    tick(again);
    assert.equal(iconTargets(again).length, 1);
    // The house is its own place: the street's Icon is not drawn indoors.
    giantIconsFeature.onStreetClear(again);
    again.streetTsid = HOME_HOUSE;
    again.homeContext = () => ({ inHome: true, owned: true, room: 'interior' });
    again.targets.length = 0;
    tick(again);
    assert.equal(iconTargets(again).length, 0);
    assert.equal(again.data.iconHere, 'home:house');
  });

  it('shows Ruminate, Revere and Reflect at home (a POL) and only its owner picks it up', () => {
    const engine = fresh(makeEngine());
    tick(engine);
    giantIconsFeature.runPackVerb('icon_alph', 'place', engine);
    const [t] = iconTargets(engine);
    assert.deepEqual(verbIds(engine, t), ['tithe!', 'ruminate', 'revere', 'reflect', 'pickup']);
    const mood = engine.pc.mood;
    assert.equal(giantIconsFeature.runVerb(t, 'ruminate', engine), true);
    assert.ok(engine.pc.mood > mood, 'the mood is yours');
    assert.match(engine.said.at(-1), /You ruminated on an Icon of Alph/);
    assert.deepEqual(verbIds(engine, t), ['tithe!', 'ruminate!', 'revere', 'reflect', 'pickup']);
    assert.equal(engine.data.iconPlaced, 'alph:19', 'one of its 20 actions');
    assert.equal(giantIconsFeature.runVerb(t, 'pickup', engine), true);
    assert.equal(engine.inv.icon_alph, 1);
    assert.equal(iconTargets(engine).length, 0);
    assert.deepEqual(giantIconsFeature._state().placed, {});
  });

  it('on a public street the menu stays the source\'s (no adoration verbs) and the prompt still comes', () => {
    const engine = fresh(makeEngine({ tsid: 'GLI2V0UN7RD1T2J', inHome: false }));
    giantIconsFeature.runPackVerb('icon_alph', 'place', engine);
    assert.match(engine.offered[0].beats[0].text, /picked up by anyone/);
    engine.offered[0].onAccept();
    const [t] = iconTargets(engine);
    assert.deepEqual(verbIds(engine, t), ['tithe!', 'pickup']);
    assert.equal(engine.data.iconHere, '');
  });

  it('moves with the house when the home street grows (homeRoomShifted), as a Garden Gnome does', () => {
    const engine = fresh(makeEngine());
    tick(engine);
    giantIconsFeature.runPackVerb('icon_alph', 'place', engine);
    assert.equal(giantIconsFeature.homeRoomShifted('street', 300, engine), null);
    assert.equal(giantIconsFeature._state().placed['home:street'][0].x, 770);
    assert.equal(Math.round(iconTargets(engine)[0].sprite.x), 770);
    // An upper floor or another room never moves.
    const s = createIconState({ placed: { 'home:house:1': [{ id: 'icon9', giant: 'mab', x: 10, y: 0, actions: 3 }] } });
    assert.deepEqual(shiftHomeIcons(s, 'interior', 50), []);
    assert.equal(s.placed['home:house:1'][0].x, 10);
  });
});

/**
 * A stand-in for the site's HomeIcons route and the realtime client: one shared count per Icon,
 * spent with the site's own rule (applyIconAct mirrors HomeIcons::apply), the proof sent on.
 */
function fakeNet(rows, me) {
  const kept = new Map(rows.map((r) => [r.id, { id: r.id, place: r.place, actions: r.actions, tither: r.tither ?? null }]));
  const sent = [];
  const asked = [];
  const handlers = {};
  const client = { me: { id: me }, state: 'online', send: (t, m) => (sent.push([t, m]), true), on: (k, fn) => { handlers[k] = fn; } };
  const account = {
    async iconAct(owner, body, inside) {
      asked.push({ owner, ...body, inside });
      const icon = kept.get(body.icon);
      if (!icon) throw Object.assign(new Error('That Icon is not here any more.'), { code: 'groddle_icon_gone' });
      const res = applyIconAct(icon, body.act, me);
      if (!res.ok) return { ok: false, code: res.code, text: res.code === 'no_tithe' ? 'This Icon does not require a tithe.' : 'x', icon: { ...icon } };
      Object.assign(icon, res.row);
      return { ok: true, icon: { ...icon }, tither: res.tither, tell: `proof-${asked.length}` };
    },
    async homeIcons() {
      return { icons: [...kept.values()].map((r) => ({ ...r })) };
    },
  };
  return { client, account, sent, asked, kept, handlers };
}
const settle = () => new Promise((r) => setImmediate(r));

describe('online: a visitor and the owner\'s Icons (shared, as Glitch)', () => {
  const visitOf = () => ({ owner: 7, name: 'Owner', icons: normalizeVisitIcons([{ id: 'icon1', giant: 'alph', place: 'street', x: 900, y: 600, actions: 11, tither: null }, { id: 'icon2', giant: 'mab', place: 'house', x: 300, y: 500, actions: 4 }]) });

  it('a visitor\'s use spends one of the Icon\'s actions at the site; the day\'s use and the reward are the visitor\'s', async () => {
    const visit = visitOf();
    const engine = fresh(makeEngine({ mode: 'multiplayer', tsid: 'MPH_7', inHome: false, visit, inv: { icon_alph: 1 } }));
    const n = fakeNet(visit.icons, 9);
    giantIconsFeature._setNet(engine, n.client, n.account);
    // The visitor's own pack Icon of Alph was the last one they tithed: a visit never spends that.
    giantIconsFeature._state().tither = 'pack:alph:0';
    tick(engine);
    const [t] = iconTargets(engine);
    assert.equal(iconTargets(engine).length, 1, 'only the street\'s');
    assert.match(t.subtitle, /^Owner's Icon. 11 actions/);
    assert.deepEqual(verbIds(engine, t), ['tithe!', 'ruminate', 'revere', 'reflect'], 'no pick up (canPickup); Tithe shows (above 10: disabled)');
    const energy = engine.pc.energy;
    assert.equal(giantIconsFeature.runVerb(t, 'revere', engine), true);
    await settle();
    assert.deepEqual(n.asked[0], { owner: 7, icon: 'icon1', place: 'street', act: 'revere', inside: '' });
    assert.ok(engine.pc.energy > energy, 'the reward is the visitor\'s');
    assert.equal(giantIconsFeature._state().used['icon_alph:revere'], 1, 'once a day per Icon class, in the visitor\'s save (canUse 352-356)');
    assert.equal(giantIconsFeature._state().tither, 'pack:alph:0');
    assert.equal(visit.icons[0].actions, 10, 'the Icon\'s one count, as the site says it');
    assert.match(t.subtitle, /10 actions/);
    assert.deepEqual(n.sent.at(-1), ['home_icon_tell', { token: 'proof-1' }]);
    assert.deepEqual(verbIds(engine, t), ['tithe!', 'ruminate', 'revere!', 'reflect'], 'at 10 a tithe is open to anyone with the currants');
    assert.match(giantIconsFeature.verbsFor(t, engine)[0].reason, /You need 121 currants/);
    assert.equal(giantIconsFeature.runVerb(t, 'pickup', engine), false);
    assert.deepEqual(giantIconsFeature._state().placed, {}, 'nothing of the owner\'s is saved here');
    assert.equal(placeRow(engine).reason, PLACE_TEXT.theirHome);
  });

  it('a visitor tithes it (icon_tithe): pays, +5 actions, and their next use is doubled and spends the double', async () => {
    const visit = visitOf();
    const engine = fresh(makeEngine({ mode: 'multiplayer', tsid: 'MPH_7', inHome: false, visit, inv: {} }));
    engine.pc.currants = 500;
    const n = fakeNet(visit.icons, 9);
    giantIconsFeature._setNet(engine, n.client, n.account);
    n.kept.get('icon1').actions = 10;
    visit.icons[0].actions = 10;
    tick(engine);
    const [t] = iconTargets(engine);
    giantIconsFeature.runVerb(t, 'tithe', engine);
    await settle();
    assert.equal(engine.pc.currants, 500 - 121, 'the payer\'s currants (to nobody: stats_try_remove_currants)');
    assert.deepEqual([visit.icons[0].actions, visit.icons[0].tither], [15, 9]);
    assert.match(engine.said.at(-1), /You tithed 121 currants to an Icon of Alph. Your generous donation/);
    // The double: the site said this visitor was the tither.
    const realRandom = Math.random;
    Math.random = () => 0; // randInt(25, 100) -> 25
    try {
      const mood = engine.pc.mood;
      giantIconsFeature.runVerb(t, 'ruminate', engine);
      await settle();
      assert.equal(engine.pc.mood - mood, 50, 'x2 for the last tither');
    } finally {
      Math.random = realRandom;
    }
    assert.deepEqual([visit.icons[0].actions, visit.icons[0].tither ?? null], [14, null], 'the double spent on the Icon, for everyone');
  });

  it('two players at once: the site\'s answer wins, a use with none left refuses with the payer\'s cost', async () => {
    const visit = visitOf();
    const engine = fresh(makeEngine({ mode: 'multiplayer', tsid: 'MPH_7', inHome: false, visit }));
    const n = fakeNet(visit.icons, 9);
    giantIconsFeature._setNet(engine, n.client, n.account);
    tick(engine);
    const [t] = iconTargets(engine);
    // Someone else took the last action a moment ago; this copy still shows 11.
    n.kept.get('icon1').actions = 0;
    giantIconsFeature.runVerb(t, 'reflect', engine);
    await settle();
    assert.match(engine.said.at(-1), /requires a tithe of 121 currants/);
    assert.equal(visit.icons[0].actions, 0);
    assert.equal(giantIconsFeature._state().used['icon_alph:reflect'], undefined, 'a refused use is not the day\'s');
    assert.deepEqual(n.sent, [], 'nothing to tell');
  });

  it('home_iconed brings a visitor\'s copy and the owner\'s own Icon the new count', async () => {
    const visit = visitOf();
    const engine = fresh(makeEngine({ mode: 'multiplayer', tsid: 'MPH_7', inHome: false, visit }));
    const n = fakeNet(visit.icons, 9);
    giantIconsFeature._setNet(engine, n.client, n.account);
    tick(engine);
    n.handlers['msg:home_iconed']({ owner: 7, from: { id: 11, name: 'Cy' }, act: { i: 'icon1', pl: 'street', a: 'tithe', n: 16, t: 11 } });
    assert.deepEqual([visit.icons[0].actions, visit.icons[0].tither], [16, 11]);
    assert.match(iconTargets(engine)[0].subtitle, /16 actions/);

    // The owner at home: their row takes the count, and coming home reads what was spent away.
    const owner = fresh(makeEngine({ mode: 'multiplayer' }));
    const on = fakeNet([], 7);
    giantIconsFeature._setNet(owner, on.client, on.account);
    tick(owner);
    giantIconsFeature.runPackVerb('icon_alph', 'place', owner);
    const row = giantIconsFeature._state().placed['home:street'][0];
    on.handlers['msg:home_iconed']({ owner: 7, from: { id: 9, name: 'Bo' }, act: { i: row.id, pl: 'street', a: 'ruminate', n: 19, t: null } });
    assert.equal(row.actions, 19);
    on.kept.set(row.id, { id: row.id, place: 'street', actions: 12, tither: 9 });
    giantIconsFeature.onStreetClear(owner);
    tick(owner);
    await settle();
    assert.deepEqual([row.actions, row.tither], [12, 9], 'the uses made while away');
    // The owner's own use goes through the site too.
    const [t] = iconTargets(owner);
    giantIconsFeature.runVerb(t, 'revere', owner);
    await settle();
    assert.deepEqual(on.asked.at(-1), { owner: 7, icon: row.id, place: 'street', act: 'revere', inside: '' });
    assert.equal(row.actions, 11);
  });

  it('the house\'s Icon is drawn inside and carries the let-in proof; solo never draws a visit', async () => {
    const visit = visitOf();
    const engine = fresh(makeEngine({ mode: 'multiplayer', tsid: 'MPH_7_IN', inHome: false, visit }));
    const n = fakeNet(visit.icons, 9);
    giantIconsFeature._setNet(engine, n.client, n.account);
    tick(engine);
    const [t] = engine.targets.filter((x) => x.classId === 'icon_mab');
    assert.ok(t);
    giantIconsFeature.runVerb(t, 'ruminate', engine);
    await settle();
    assert.equal(n.asked[0].place, 'house');
    const solo = fresh(makeEngine({ mode: 'solo', tsid: 'MPH_7', inHome: false, visit }));
    tick(solo);
    assert.equal(solo.targets.length, 0);
  });

  it('solo at home the tither is kept on the Icon (0 is you) and a bestowment spends its double', () => {
    const s = createIconState({ pack: { alph: [8] }, tither: 'pack:alph:0' });
    const inv = { icon_alph: 1 };
    const placed = placeIcon(s, inv, 'alph', homePlaceKey('street'), 0, 0, { me: 0 });
    assert.deepEqual([placed.row.tither, s.tither], [0, null], 'the pack tither moves onto the Icon');
    const res = bestowCheck(s, placed.row, { now: 1e9, level: 12, testing: true, shared: true, me: 0 }, () => 0);
    assert.equal(res.tither, true);
    assert.equal(res.amount, 2 * res.base);
    assert.equal(placed.row.tither, 0, 'not spent by the check: the caller spends it');
    assert.equal(bestowCheck(s, placed.row, { now: 2e9, level: 12, testing: true, shared: true, me: 9 }, () => 0).tither, false, 'someone else\'s double');
    const back = pickUpIcon(s, inv, homePlaceKey('street'), placed.row.id, { me: 0 });
    assert.ok(back.ok);
    assert.equal(s.tither, 'pack:alph:0', 'picked up, the tither is the pack\'s again');
  });

  it('the client\'s rule and the site\'s are one (applyIconAct and HomeIcons::apply on the same cases)', () => {
    const cases = [
      [{ actions: 11, tither: null }, 'ruminate', 9],
      [{ actions: 0, tither: null }, 'revere', 9],
      [{ actions: 10, tither: 11 }, 'tithe', 9],
      [{ actions: 11, tither: null }, 'tithe', 9],
      [{ actions: 5, tither: 9 }, 'reflect', 9],
      [{ actions: 5, tither: 11 }, 'bestow', 9],
      [{ actions: 5, tither: 9 }, 'bestow', 9],
    ];
    const js = cases.map(([row, act, me]) => {
      const r = applyIconAct({ id: 'icon1', place: 'street', ...row }, act, me);
      return r.ok ? { ok: true, actions: r.row.actions, tither: r.row.tither, was: r.tither } : { ok: false, code: r.code };
    });
    if (!HAS_SITE || !HAS_PHP) return;
    const php = JSON.parse(execFileSync(PHP, ['-r', `require ${JSON.stringify(SITE_DIR)} . "/src/HomeIcons.php"; $out = []; foreach (json_decode(${JSON.stringify(JSON.stringify(cases))}, true) as [$row, $act, $me]) { $r = Groddle\\Minn\\HomeIcons::apply(['id' => 'icon1', 'place' => 'street', 'actions' => $row['actions'], 'tither' => $row['tither']], $act, $me); $out[] = $r['ok'] ? ['ok' => true, 'actions' => $r['icon']['actions'], 'tither' => $r['icon']['tither'], 'was' => $r['tither']] : ['ok' => false, 'code' => $r['code']]; } echo json_encode($out);`]).toString());
    assert.deepEqual(php, js);
    assert.deepEqual(js.map((r) => (r.ok ? `${r.actions}/${r.tither}/${r.was}` : r.code)), ['10/null/false', 'tithe_due', '15/9/false', 'no_tithe', '4/null/true', 'not_tither', '5/null/true']);
  });

  it('the visit answer\'s list is checked: places a visitor can reach, real Giants, icon ids', () => {
    const view = normalizeHomeView({ owner: { id: 7, name: 'Owner' }, home: { owned: true }, icons: [
      { id: 'icon1', giant: 'alph', place: 'street', x: 1, y: 2, actions: 3, tither: 9 },
      { id: 'icon2', giant: 'nobody', place: 'street', x: 1, y: 2, actions: 3 },
      { id: 'icon3', giant: 'mab', place: 'house:2', x: 1, y: 2 },
      { id: '<b>', giant: 'mab', place: 'street', x: 1, y: 2 },
      { id: 'icon5', giant: 'ti', place: 'tower:3', x: 1.4, y: 2, actions: -4, tither: 'x' },
    ] });
    assert.deepEqual(view.icons, [
      { id: 'icon1', giant: 'alph', place: 'street', x: 1, y: 2, actions: 3, tither: 9 },
      // R5 (G1313): an upper floor of the house is a place a visitor can reach.
      { id: 'icon3', giant: 'mab', place: 'house:2', x: 1, y: 2, actions: 0, tither: null },
      { id: 'icon5', giant: 'ti', place: 'tower:3', x: 1, y: 2, actions: 0, tither: null },
    ]);
  });
});

describe('the site sends a visitor the owner\'s placed Icons (Neighbours::iconRows)', () => {
  const hasPhp = HAS_PHP;
  const skip = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
  const php = (code) => JSON.parse(execFileSync(PHP, ['-r', `foreach (["WordFilter", "Neighbours"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; ${code}`]).toString());

  it('reads the giant-icons slice: home places only, cleaned, the house left out for anyone outside', { skip }, () => {
    const state = { systems: { features: { 'giant-icons': { placed: {
      GLI2V0UN7RD1T2J: [{ id: 'icon1', giant: 'alph', x: 10, y: 20, actions: 20 }],
      'home:street': [{ id: 'icon2', giant: 'mab', x: 470.4, y: 600, actions: 7, tither: 9 }, { id: 'x"', giant: 'mab', x: 1, y: 1 }],
      'home:house': [{ id: 'icon3', giant: 'ti', x: 300, y: 500, actions: 0 }],
      'home:house:2': [{ id: 'icon4', giant: 'lem', x: 1, y: 1, actions: 1 }],
      'home:tower:1': [{ id: 'icon5', giant: 'pot', x: 2, y: 2, actions: 99999 }],
    } } } } };
    const rows = php(`echo json_encode(Groddle\\Minn\\Neighbours::iconRows(json_decode(${JSON.stringify(JSON.stringify(state))})));`);
    assert.deepEqual(rows, [
      { id: 'icon2', giant: 'mab', place: 'street', x: 470, y: 600, actions: 7, tither: 9 },
      { id: 'icon3', giant: 'ti', place: 'house', x: 300, y: 500, actions: 0, tither: null },
      // R5 (G1313): an upper floor's, for whoever may enter.
      { id: 'icon4', giant: 'lem', place: 'house:2', x: 1, y: 1, actions: 1, tither: null },
      { id: 'icon5', giant: 'pot', place: 'tower:1', x: 2, y: 2, actions: 10000, tither: null },
    ]);
    assert.deepEqual(normalizeVisitIcons(rows), rows, 'the game reads what the site sends');
    const outside = php(`echo json_encode(Groddle\\Minn\\Neighbours::forVisitor(["icons" => json_decode(${JSON.stringify(JSON.stringify(rows))}, true)], false));`);
    assert.deepEqual(outside.icons.map((r) => r.id), ['icon2', 'icon5']);
    const inside = php(`echo json_encode(Groddle\\Minn\\Neighbours::forVisitor(["icons" => json_decode(${JSON.stringify(JSON.stringify(rows))}, true)], true));`);
    assert.equal(inside.icons.length, 4);
    // Every Giant the game knows, the site knows.
    assert.deepEqual(php('echo json_encode(Groddle\\Minn\\Neighbours::ICON_GIANTS);'), [...GIANT_ICON_IDS]);
  });

  it('the visit answer carries them', { skip: !HAS_SITE && 'no groddle-afternoon-site checkout' }, () => {
    const src = readFileSync(join(SITE_DIR, 'src', 'Neighbours.php'), 'utf8');
    assert.match(src, /'icons' => HomeIcons::overlay\(\$db, \$owner, self::iconRows\(\$theirs\)\),/);
    assert.match(src, /foreach \(\['gnomes', 'stacks', 'icons'\] as \$k\)/);
  });
});
