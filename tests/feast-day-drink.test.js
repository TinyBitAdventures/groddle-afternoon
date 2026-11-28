/**
 * #723: a drink laid on the Harvest Table comes back on Thanksgiving Day as a feast pile that offered
 * only Eat, and Eat said "Cannot eat that." A drink pile offers Drink (Glitch's drinks carry
 * verbs.drink, include/drink.js drink_drink), the bite goes in as the drink's own drink, and the
 * gate asked before the bite is the drink's (dead, a mood drink at full mood: drink.js 38-42), not
 * the food's (full energy, stuffed).
 * Run: node --test tests/feast-day-drink.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const { FEAST_PILE_CLASS } = await import('../public/js/feast-day.js?v=4609da69');
const { TABLE_STREET } = await import('../public/js/pot-luck-feast.js?v=971888be');
const { feastDayFeature } = await import('../public/js/features/feast-day-feature.js?v=b236c7ed');
const inventory = await import('../public/js/inventory.js?v=3be7988a');
const { stockUseVerb } = await import('../public/js/stock-use.js?v=79e103c1');

describe('#723 a drink pile at the feast offers Drink, and drinking it works', () => {
  const targets = [];
  const drunk = [];
  const engine = {
    PIXI,
    mode: 'solo',
    streetTsid: TABLE_STREET,
    street: { bounds: { l: -3000, t: -1000, r: 3000, b: 0 } },
    platforms: [],
    groundY: 0,
    started: true,
    inv: {},
    entityLayer: new PIXI.Container(),
    param: (k) => (k === 'seasondate' ? '2026-11-26' : ''),
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
    eatGate: () => ({ ok: true }),
    eatFromStock: (c) => (drunk.push(c), true),
    setData() {},
    toast() {},
    playSound() {},
    save() {},
    updateHud() {},
    // A week of nothing but Orange Juice laid (a drink: inventory.js kind 'drink').
    query: (hook) => (hook === 'feastLayCounts' ? { orange_juice: 30 } : null),
    inScene: () => false,
  };
  const piles = () => targets.filter((t) => t.classId === FEAST_PILE_CLASS);

  before(() => {
    feastDayFeature.init(engine);
    feastDayFeature.onStreetEnter({}, engine);
  });

  it('the pile’s one verb is Drink, not Eat', () => {
    const p = piles()[0];
    assert.ok(p, 'the feast is laid');
    const verbs = feastDayFeature.verbsFor(p, engine);
    assert.equal(verbs.length, 1);
    assert.equal(verbs[0].label, 'Drink');
    assert.equal(verbs[0].enabled, true);
    assert.match(verbs[0].tooltip, /^Drink/);
  });

  it('Drink takes one bite and drinks it from a stock', () => {
    const p = piles().find((t) => t.feastSpot === 2);
    const { id } = feastDayFeature.verbsFor(p, engine)[0];
    assert.equal(feastDayFeature.runVerb(p, id, engine), true);
    assert.deepEqual(drunk, ['orange_juice']);
    assert.equal(feastDayFeature.feastDayServings(engine), 89);
  });

  it('#748: the pile offers its item’s own verb (engine.stockVerb: a herb’s Munch) and that verb bites', () => {
    engine.stockVerb = () => ({ id: 'munch', label: 'Munch', kind: 'buff' });
    try {
      const p = piles().find((t) => t.feastSpot === 3);
      const verbs = feastDayFeature.verbsFor(p, engine);
      assert.deepEqual(verbs.map((v) => [v.id, v.label]), [['munch', 'Munch']]);
      assert.match(verbs[0].tooltip, /^Munch a bite of the feast, right here/);
      // Another verb's id takes no bite.
      feastDayFeature.runVerb(p, 'eat', engine);
      assert.deepEqual(drunk, ['orange_juice']);
      assert.equal(feastDayFeature.runVerb(p, 'munch', engine), true);
      assert.deepEqual(drunk, ['orange_juice', 'orange_juice']);
    } finally {
      delete engine.stockVerb;
    }
  });
});

describe('#723 game.js asks a drink’s own refusals before the bite, not the food’s', () => {
  const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
  const slice = (name) => {
    const start = game.indexOf(`function ${name}(`);
    return game.slice(start, game.indexOf('\n}\n', start) + 2);
  };
  // #748: the gate asks the item's own verb first (stockVerb, js/stock-use.js).
  const src = `${slice('stockVerb')}\n${slice('stockEatGate')}`;
  const gateWith = ({ dead = false, mood = 50, energy = 100 } = {}) => {
    const pc = { energy, mood, energyMax: 100 };
    const ctx = {
      ...inventory,
      stockUseVerb,
      features: { query: () => null, metabolicGate: () => ({ ok: true }) },
      engine: {},
      playerIsDead: () => dead,
      DEAD_CONSUME_LINE: 'You are dead :(',
      // Full energy: a food is refused (include/food.js 126-128); a drink never asks.
      canEatFood: () => (energy >= 100 ? { ok: false, reason: 'You already have full energy.' } : { ok: true }),
      foodState: {},
      pc,
      energyCap: () => 100,
    };
    vm.createContext(ctx);
    const gate = vm.runInContext(`${src}\nstockEatGate`, ctx);
    // A plain object from this realm, so deepEqual compares values, not the vm's prototypes.
    return (cls) => ({ ...gate(cls) });
  };

  it('a drink at full energy goes in (drinks never count toward fullness)', () => {
    assert.deepEqual(gateWith()('orange_juice'), { ok: true });
    assert.deepEqual(gateWith()('fruity_juice'), { ok: true });
  });

  it('a mood drink at full mood is refused before the bite, with Glitch’s line', () => {
    const r = gateWith({ mood: 100 })('orange_juice');
    assert.equal(r.ok, false);
    assert.match(r.msg, /already in a perfectly good mood/);
    // Lemon Juice takes mood away (drink_mood -5): full mood never stops it.
    assert.deepEqual(gateWith({ mood: 100 })('lemon_juice'), { ok: true });
  });

  it('nobody drinks while dead', () => {
    assert.deepEqual(gateWith({ dead: true })('orange_juice'), { ok: false, msg: 'You are dead :(' });
  });

  it('a food keeps the food’s refusals', () => {
    assert.equal(gateWith()('apple').ok, false);
    assert.deepEqual(gateWith({ energy: 40 })('apple'), { ok: true });
  });
});
