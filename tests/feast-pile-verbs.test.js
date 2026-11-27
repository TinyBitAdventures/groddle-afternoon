/**
 * #748: every class the Harvest Table accepts (a crop a garden seed grows, a dish a cooking tool
 * makes, Harvest Stuffing) comes back on Thanksgiving Day as a feast pile, and the pile's one verb
 * has to work. The bite's gate (game.js stockEatGate) knew only food and drink, so the seven herbs
 * (herb_base: no Eat, include/food.js 8-11; Munch, verbs.munch) and the six Sno Cones (sno_cone_base
 * verbs.eat: iMG, no energy) were refused with "This item is kept for recipes, quests, or trading."
 * Now a pile offers its item's own pack verb (js/stock-use.js) and that verb does what it does in
 * the pack, on a one-item stock that never enters the pack.
 *
 * The class check walks the table's whole accepted list: each pile's verb is found, its gate lets a
 * hungry, living, level 60 player use it, and using it works with the pack untouched.
 * Run: node --test tests/feast-pile-verbs.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const making = await import('../public/js/making.js?v=dc595568');
const { SEED_CATALOG } = await import('../public/js/garden.js?v=fefa7bcd');
const { loadContentCatalogsFromDir } = await import('../public/js/content-catalogs.js?v=c9b84764');
const inventory = await import('../public/js/inventory.js?v=3be7988a');
const buffs = await import('../public/js/buffs.js?v=09184e60');
const { stockUseVerb } = await import('../public/js/stock-use.js?v=6b422ccf');
const { createFeatureHost } = await import('../public/js/feature-host.js?v=b87e2cbc');
const { FEATURES } = await import('../public/js/features/index.js?v=80f5a7bb');
const { snoConesFeature } = await import('../public/js/features/sno-cones-feature.js?v=aea8620b');
const { cropClasses, dishClasses, layableKind, STUFFING, STUFFING_ITEM } = await import('../public/js/pot-luck-feast.js?v=971888be');
const { FEAST_DAY_LINES } = await import('../public/js/feast-day.js?v=29d69db5');

/** The herbs (items/<herb>.js parent herb_base) and the Sno Cones (parent sno_cone_base). */
const HERBS = ['gandlevery', 'hairball_flower', 'purple_flower', 'rookswort', 'rubeweed', 'silvertongue', 'yellow_crumb_flower'];
const CONES = ['sno_cone_blue', 'sno_cone_green', 'sno_cone_orange', 'sno_cone_purple', 'sno_cone_rainbow', 'sno_cone_red'];

const STUDY = Object.freeze({ learning: true, atMaxAcceleration: false });

/** game.js's stockVerb, stockEatGate and eatFromStock, run with the real modules and features. */
function gameStock() {
  snoConesFeature._reset(); // a fresh game day: no cones eaten yet (no brain freeze)
  const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
  const fn = (name) => {
    const start = game.indexOf(`function ${name}(`);
    assert.ok(start > 0, `game.js has ${name}`);
    return game.slice(start, game.indexOf('\n}\n', start) + 2);
  };
  const applied = [];
  const pc = { energy: 30, mood: 80, level: 60, xp: 0, imagination: 0, energyMax: 100 };
  const buffState = buffs.createBuffState();
  const engine = {
    pc,
    inv: {},
    started: true,
    hasBuff: () => false,
    applyBuff: (id) => applied.push(id),
    metabolicGate: () => ({ ok: true }),
    achievement() {},
    toast() {},
    pushActivity() {},
    playSound() {},
    floatText() {},
    refreshPack() {},
    updateHud() {},
    save() {},
    setData() {},
    param: () => '',
    query: () => null,
  };
  const features = createFeatureHost(FEATURES);
  const used = [];
  const ctx = {
    ...inventory,
    stockUseVerb,
    buffItemRefusal: buffs.buffItemRefusal,
    features,
    engine,
    pc,
    buffState,
    // Studying (a Yellow Crumb Flower is munched only while learning a skill: yellow_crumb_flower.js).
    studyBuffContext: () => STUDY,
    playerIsDead: () => false,
    DEAD_CONSUME_LINE: 'You are dead :(',
    canEatFood: () => ({ ok: true }),
    foodState: {},
    energyCap: () => 100,
    // usePackItem's own split (game.js): a buff item activates (activateBuffItem), anything else is
    // the pack's Eat or Drink (useItem), both on the stock it is handed.
    usePackItem: (cls, count, stock) => {
      const buff = buffs.getBuffItemInfo(cls);
      const r = buff?.def ? buffs.activateBuffItem(buffState, stock, pc, cls, Date.now(), { study: STUDY }) : inventory.useItem(stock, pc, cls);
      used.push({ cls, count, stock: { ...stock }, ok: r.ok, kind: buff?.def ? 'buff' : 'pack' });
      return r.ok ? true : undefined;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${fn('stockVerb')}\n${fn('stockEatGate')}\n${fn('eatFromStock')}`, ctx);
  return { ctx, pc, buffState, engine, applied, used };
}

describe('#748 every class the Harvest Table accepts has a pile verb that works', () => {
  let accepted = [];

  before(async () => {
    await loadContentCatalogsFromDir(join(ROOT, 'public/assets/content'));
    await making.loadRecipeCatalogFromFile(join(ROOT, 'public/assets/content/recipes.json'));
    // Harvest Stuffing's Eat, as pot-luck-feast-feature init registers it.
    inventory.ensureItem(STUFFING, { ...STUFFING_ITEM, tags: [...STUFFING_ITEM.tags] });
    inventory.registerItemUse(STUFFING, { kind: 'food', verb: 'Eat', energy: STUFFING_ITEM.baseCost }, { label: STUFFING_ITEM.label });
    const crops = cropClasses(SEED_CATALOG);
    const dishes = dishClasses(making.RECIPE_CATALOG);
    accepted = [...new Set([...crops, ...dishes])].filter((c) => layableKind(c, crops, dishes)).sort();
  });

  it('the list is the whole table: crops, dishes, the herbs and the Sno Cones', () => {
    assert.ok(accepted.length > 150, `${accepted.length} classes`);
    for (const c of [...HERBS, ...CONES, STUFFING, 'pumpkin_pie', 'corn']) assert.ok(accepted.includes(c), c);
  });

  it('every accepted class: a verb, the gate lets it in, and using it works without the pack', () => {
    const bad = [];
    for (const c of accepted) {
      const g = gameStock();
      const verb = g.ctx.stockVerb(c);
      if (!verb) {
        bad.push(`${c}: no verb`);
        continue;
      }
      const gate = { ...g.ctx.stockEatGate(c) };
      if (!gate.ok) {
        bad.push(`${c} (${verb.label}): refused "${gate.msg}"`);
        continue;
      }
      const before = { energy: g.pc.energy, mood: g.pc.mood, xp: g.pc.xp };
      if (g.ctx.eatFromStock(c) !== true) {
        bad.push(`${c} (${verb.label}): did not go in`);
        continue;
      }
      if (Object.keys(g.engine.inv).length) bad.push(`${c}: the pack changed`);
      // It did something: energy, mood or iMG, or a buff (a herb's) applied or waiting.
      const moved = g.pc.energy !== before.energy || g.pc.mood !== before.mood || g.pc.xp !== before.xp;
      const buffed = g.applied.length > 0 || buffs.listActiveBuffs(g.buffState).length + buffs.listPendingBuffs(g.buffState).length > 0;
      if (!moved && !buffed) bad.push(`${c} (${verb.label}): no effect`);
    }
    assert.deepEqual(bad, []);
  });

  it('the herbs are Munched (herb_base verbs.munch), with their own buff', () => {
    for (const c of HERBS) {
      const g = gameStock();
      const verb = g.ctx.stockVerb(c);
      assert.equal(verb?.label, 'Munch', c);
      assert.equal(g.ctx.eatFromStock(c), true, c);
      if (c === 'gandlevery') assert.deepEqual(g.applied, ['gandlevery']);
      else {
        const buffId = buffs.getBuffItemInfo(c).buffId;
        assert.ok(buffs.hasBuff(g.buffState, buffId), `${c} applies ${buffId}`);
        assert.deepEqual(g.used.map((u) => [u.cls, u.kind, u.ok, u.stock[c]]), [[c, 'buff', true, 0]]);
      }
    }
  });

  it('purple flower (#748): Munch, and a second one while the buff is on is refused with the herb’s line', () => {
    const g = gameStock();
    assert.deepEqual({ ...g.ctx.stockEatGate('purple_flower') }, { ok: true });
    assert.equal(g.ctx.eatFromStock('purple_flower'), true);
    const again = { ...g.ctx.stockEatGate('purple_flower') };
    assert.equal(again.ok, false);
    assert.doesNotMatch(again.msg, /kept for recipes/);
  });

  it('the Sno Cones are their own Eat: iMG, never energy, and the level check asked first', () => {
    for (const c of CONES) {
      const g = gameStock();
      const verb = g.ctx.stockVerb(c);
      assert.equal(verb?.label, 'Eat', c);
      assert.equal(verb.kind, 'feature', c);
      const energy = g.pc.energy;
      assert.equal(g.ctx.eatFromStock(c), true, c);
      assert.ok(g.pc.xp > 0, `${c} gives iMG`);
      assert.equal(g.pc.energy, energy, `${c} gives no energy`);
    }
    const g = gameStock();
    g.pc.level = 1;
    assert.equal(g.ctx.eatFromStock('sno_cone_blue'), false, 'not eaten below its level');
    const low = { ...g.ctx.stockEatGate('sno_cone_blue') };
    assert.deepEqual(low, { ok: false, msg: 'You must be at least level 2 to eat this sno cone.' });
  });

  it('a food is still Eat and a drink still Drink (#723)', () => {
    const g = gameStock();
    assert.deepEqual([g.ctx.stockVerb('pumpkin_pie')?.label, g.ctx.stockVerb('orange_juice')?.label], ['Eat', 'Drink']);
    assert.equal(FEAST_DAY_LINES.tip('Munch'), 'Munch a bite of the feast, right here');
  });
});
