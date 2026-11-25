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

const { PLACE_TEXT, giantIconsFeature } = await import('../public/js/features/giant-icons-feature.js?v=0c4c63d9');
const { GIANT_ICON_IDS, bestowCheck, createIconState, homePlaceKey, normalizeVisitIcons, shiftHomeIcons } = await import('../public/js/giant-icons.js?v=9b71adf1');
const { normalizeHomeView } = await import('../public/js/neighbours-mp.js?v=c0128a48');

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

describe('online: a visitor and the owner\'s Icons', () => {
  const visit = { owner: 7, name: 'Owner', icons: normalizeVisitIcons([{ id: 'icon1', giant: 'alph', place: 'street', x: 900, y: 600, actions: 20 }, { id: 'icon2', giant: 'mab', place: 'house', x: 300, y: 500, actions: 4 }]) };

  it('sees them on the home street and may ruminate, revere and reflect from their own save', () => {
    const engine = fresh(makeEngine({ mode: 'multiplayer', tsid: 'MPH_7', inHome: false, visit, inv: { icon_alph: 1 } }));
    // The visitor's own Icon of Alph was the last one they tithed: a visit never spends that.
    giantIconsFeature._state().tither = 'placed:icon1';
    tick(engine);
    const [t] = iconTargets(engine);
    assert.ok(t, 'drawn on the visit');
    assert.equal(iconTargets(engine).length, 1, 'only the street\'s');
    assert.match(t.subtitle, /^Owner's Icon/);
    assert.deepEqual(verbIds(engine, t), ['ruminate', 'revere', 'reflect'], 'no pick up (canPickup), no tithe (ours)');
    const energy = engine.pc.energy;
    assert.equal(giantIconsFeature.runVerb(t, 'revere', engine), true);
    assert.ok(engine.pc.energy > energy, 'the reward is the visitor\'s');
    assert.equal(giantIconsFeature._state().used['icon_alph:revere'], 1, 'once a day per Icon class, in the visitor\'s save');
    assert.equal(giantIconsFeature._state().tither, 'placed:icon1', 'the visitor\'s own tither bonus kept');
    assert.deepEqual(verbIds(engine, t), ['ruminate', 'revere!', 'reflect']);
    assert.equal(visit.icons[0].actions, 20, 'the owner\'s row as shown, not this save\'s');
    assert.equal(giantIconsFeature.runVerb(t, 'pickup', engine), false);
    assert.deepEqual(giantIconsFeature._state().placed, {}, 'nothing of the owner\'s is saved here');
    // Place in someone else's home: refused (icon_place_conditions 19-21).
    assert.equal(placeRow(engine).enabled, false);
    assert.equal(placeRow(engine).reason, PLACE_TEXT.theirHome);
  });

  it('the house\'s Icon is drawn inside, and a tithe-due one refuses with the source\'s words', () => {
    const v = { ...visit, icons: visit.icons.map((r) => (r.id === 'icon2' ? { ...r, actions: 0 } : r)) };
    const engine = fresh(makeEngine({ mode: 'multiplayer', tsid: 'MPH_7_IN', inHome: false, visit: v }));
    tick(engine);
    const [t] = engine.targets.filter((x) => x.classId === 'icon_mab');
    assert.ok(t);
    const rum = giantIconsFeature.verbsFor(t, engine).find((r) => r.id === 'ruminate');
    assert.equal(rum.enabled, false);
    assert.match(rum.reason, /requires a tithe of 121 currants/);
  });

  it('solo never draws a visit\'s Icons', () => {
    const engine = fresh(makeEngine({ mode: 'solo', tsid: 'MPH_7', inHome: false, visit }));
    tick(engine);
    assert.equal(engine.targets.length, 0);
  });

  it('a visited Icon\'s bestowment keeps its own tither key', () => {
    const s = createIconState({ tither: 'placed:icon1' });
    const row = { id: 'icon1', giant: 'alph', x: 0, y: 0, actions: 20 };
    const res = bestowCheck(s, row, { now: 1e9, level: 12, testing: true, key: 'visit:7:icon1' }, () => 0);
    assert.equal(res.kind, 'bestow');
    assert.equal(res.tither, false);
    assert.equal(s.tither, 'placed:icon1');
  });

  it('the visit answer\'s list is checked: places a visitor can reach, real Giants, icon ids', () => {
    const view = normalizeHomeView({ owner: { id: 7, name: 'Owner' }, home: { owned: true }, icons: [
      { id: 'icon1', giant: 'alph', place: 'street', x: 1, y: 2, actions: 3 },
      { id: 'icon2', giant: 'nobody', place: 'street', x: 1, y: 2, actions: 3 },
      { id: 'icon3', giant: 'mab', place: 'house:2', x: 1, y: 2 },
      { id: '<b>', giant: 'mab', place: 'street', x: 1, y: 2 },
      { id: 'icon5', giant: 'ti', place: 'tower:3', x: 1.4, y: 2, actions: -4 },
    ] });
    assert.deepEqual(view.icons, [
      { id: 'icon1', giant: 'alph', place: 'street', x: 1, y: 2, actions: 3 },
      { id: 'icon5', giant: 'ti', place: 'tower:3', x: 1, y: 2, actions: 0 },
    ]);
  });
});

describe('the site sends a visitor the owner\'s placed Icons (Neighbours::iconRows)', () => {
  const hasPhp = spawnSync('php', ['-v']).status === 0;
  const skip = !HAS_SITE ? 'no groddle-afternoon-site checkout' : !hasPhp ? 'no php' : false;
  const php = (code) => JSON.parse(execFileSync('php', ['-r', `foreach (["WordFilter", "Neighbours"] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php"; ${code}`]).toString());

  it('reads the giant-icons slice: home places only, cleaned, the house left out for anyone outside', { skip }, () => {
    const state = { systems: { features: { 'giant-icons': { placed: {
      GLI2V0UN7RD1T2J: [{ id: 'icon1', giant: 'alph', x: 10, y: 20, actions: 20 }],
      'home:street': [{ id: 'icon2', giant: 'mab', x: 470.4, y: 600, actions: 7 }, { id: 'x"', giant: 'mab', x: 1, y: 1 }],
      'home:house': [{ id: 'icon3', giant: 'ti', x: 300, y: 500, actions: 0 }],
      'home:house:2': [{ id: 'icon4', giant: 'lem', x: 1, y: 1, actions: 1 }],
      'home:tower:1': [{ id: 'icon5', giant: 'pot', x: 2, y: 2, actions: 99999 }],
    } } } } };
    const rows = php(`echo json_encode(Groddle\\Minn\\Neighbours::iconRows(json_decode(${JSON.stringify(JSON.stringify(state))})));`);
    assert.deepEqual(rows, [
      { id: 'icon2', giant: 'mab', place: 'street', x: 470, y: 600, actions: 7 },
      { id: 'icon3', giant: 'ti', place: 'house', x: 300, y: 500, actions: 0 },
      { id: 'icon5', giant: 'pot', place: 'tower:1', x: 2, y: 2, actions: 10000 },
    ]);
    assert.deepEqual(normalizeVisitIcons(rows), rows, 'the game reads what the site sends');
    const outside = php(`echo json_encode(Groddle\\Minn\\Neighbours::forVisitor(["icons" => json_decode(${JSON.stringify(JSON.stringify(rows))}, true)], false));`);
    assert.deepEqual(outside.icons.map((r) => r.id), ['icon2', 'icon5']);
    const inside = php(`echo json_encode(Groddle\\Minn\\Neighbours::forVisitor(["icons" => json_decode(${JSON.stringify(JSON.stringify(rows))}, true)], true));`);
    assert.equal(inside.icons.length, 3);
    // Every Giant the game knows, the site knows.
    assert.deepEqual(php('echo json_encode(Groddle\\Minn\\Neighbours::ICON_GIANTS);'), [...GIANT_ICON_IDS]);
  });

  it('the visit answer carries them', { skip: !HAS_SITE && 'no groddle-afternoon-site checkout' }, () => {
    const src = readFileSync(join(SITE_DIR, 'src', 'Neighbours.php'), 'utf8');
    assert.match(src, /'icons' => self::iconRows\(\$theirs\),/);
    assert.match(src, /foreach \(\['gnomes', 'stacks', 'icons'\] as \$k\)/);
  });
});
