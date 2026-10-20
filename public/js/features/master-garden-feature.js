/**
 * Master Gardener garden potions (js/master-garden.js) as a feature module.
 *
 * With Master Gardener learned, Pour from the pack works the nearest garden
 * bed (350 px) all at once: Soak-All Solution waters every plot, Liquid
 * Super-Hoe clears every dirty plot, Seed-Dibber Libation plants every clean
 * plot with the seed you pick, Manyharvest Cordial harvests every ripe plot
 * (with Master Gardener's own super-harvest odds), Dung-Kicker Drops
 * fertilizes every seeded plot (seeds jump to shoots, shoots finish in a
 * tenth of the time). Each bottle pours five times. Watering, planting and
 * clearing a garden of 4/8/15+ plots may also turn up the Master Gardener
 * drop tables (18/36/67%). The cauldron already makes all five potions
 * (recipes 308-313).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&mastergardendemo=1
 *     (=herb for an herb bed) teaches Master Gardener, puts every potion
 *     and seeds in the pack, and makes every plot of the nearest bed dirty.
 *     &mastergardenautoplay=1 pours Super-Hoe, Seed-Dibber, Soak-All and
 *     Dung-Kicker, ripens the bed (QA only), then Manyharvest
 *     (=hold stops before the harvest). Canvas: mgGarden, mgLast, mgUses,
 *     mgPlots, mgAutoplay, mgDrop.
 */

import { ITEM_CATALOG, countItem, ensureItem } from '../inventory.js?v=catalog-unified-3';
import { SEED_CATALOG, listPlantableSeeds } from '../garden.js';
import {
  GARDEN_POTIONS,
  MASTER_GARDENER,
  POUR_MS,
  POUR_RANGE,
  canPour,
  createPotionState,
  plotsFor,
  potionTendGarden,
  potionUsesLeft,
  usePotion,
} from '../master-garden.js';
import { rollDropTable } from '../drop-tables.js';
import { payDrop } from './drops-feature.js?v=drops-1';

export const MASTER_GARDEN_FEATURE_ID = 'master-garden';

let potions = createPotionState();
let last = '';
let pouring = null;
let demoDone = false;
let autoplayAt = 0;
let autoplayStep = 0;

function learned(engine) {
  return engine.learnedSkills || [];
}

function upgrades(engine) {
  return engine.pc?.imaginationUpgrades || [];
}

/** findCloseStack(is_garden, 350): the nearest garden bed target. */
function nearestGarden(engine, range = POUR_RANGE) {
  const p = engine.player;
  if (!p) return null;
  let best = null;
  let bestD = Infinity;
  for (const t of engine.interactables || []) {
    if (t.classId !== 'garden_new' || !t.state?.garden || !t.sprite) continue;
    const d = Math.hypot(t.sprite.x - p.x, (t.sprite.y - p.y) * 0.6);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best && bestD <= range ? best : null;
}

function publish(engine) {
  if (!engine?.setData) return;
  const g = nearestGarden(engine, 5000);
  const garden = g?.state?.garden;
  engine.setData('mgGarden', garden ? `${garden.gardenType}:${Object.keys(garden.plots).length}` : 'none');
  engine.setData('mgPlots', garden ? Object.values(garden.plots).map((p) => `${p.state}${p.wet ? 'w' : ''}${p.fertilized ? 'f' : ''}`).join(',') : 'none');
  engine.setData('mgLast', last || 'none');
  engine.setData('mgUses', Object.keys(GARDEN_POTIONS).map((id) => `${id.replace('potion_garden_', '')}:${potionUsesLeft(potions, id, engine.inv)}`).join(','));
}

function say(engine, msg, ok = true) {
  last = msg;
  engine.pushActivity?.(msg);
  engine.toast?.(msg, ok ? 3200 : 2600);
  publish(engine);
}

function ctxFor(engine, seedId) {
  const buffs = engine.activeBuffIds?.() || [];
  return {
    learned: learned(engine),
    upgrades: upgrades(engine),
    energy: engine.pc?.energy || 0,
    inv: engine.inv,
    seedId,
    rubeweed: buffs.includes('rubeweed'),
    maxLuck: buffs.includes('max_luck'),
    pluralOf: (id) => ITEM_CATALOG[id]?.namePlural,
  };
}

/* ------------------------------------------------------------ pour FX */

function pourFx(engine, potionClass, target) {
  const { PIXI } = engine;
  const p = engine.player;
  if (!PIXI || !p || !engine.fxLayer) return null;
  const root = new PIXI.Container();
  const bottle = PIXI.Sprite.from(ITEM_CATALOG[potionClass]?.icon || `assets/sprites/icons/${potionClass}.png`);
  bottle.anchor.set(0.5);
  bottle.x = p.x;
  bottle.y = (p.y || 0) - 135;
  root.addChild(bottle);
  const drops = new PIXI.Graphics();
  root.addChild(drops);
  engine.fxLayer.addChild(root);
  const plots = (target?.state?.plotTargets || []).map((pt) => ({ x: pt.sprite.x, y: pt.sprite.y - 18 }));
  return { root, bottle, drops, plots, age: 0, color: { water: 0x6cc4ff, plant: 0xc9a46a, pick: 0xffe066, hoe: 0xb08850, fertilize: 0x9bd36a }[GARDEN_POTIONS[potionClass].action] };
}

function tickFx(fx, dtMs) {
  if (!fx || fx.root.destroyed) return;
  fx.age += dtMs;
  const k = Math.min(1, fx.age / POUR_MS);
  fx.bottle.rotation = Math.sin(fx.age / 140) * 0.35 - 0.6 * Math.min(1, k * 3);
  fx.bottle.scale.set(1 + 0.08 * Math.sin(fx.age / 90));
  fx.drops.clear();
  fx.plots.forEach((pt, i) => {
    const t = (fx.age / 600 + i * 0.37) % 1;
    fx.drops.beginFill(fx.color, 0.85 * (1 - t));
    fx.drops.drawCircle(pt.x + Math.sin(i * 2.1) * 6, pt.y - 40 + t * 40, 3.2);
    fx.drops.drawCircle(pt.x - 7 + Math.cos(i) * 4, pt.y - 30 + ((t + 0.5) % 1) * 30, 2.4);
    fx.drops.endFill();
  });
  fx.root.alpha = k > 0.85 ? (1 - k) / 0.15 : 1;
}

/* ------------------------------------------------------------ pour */

function startPour(engine, potionClass, seedId = null) {
  if (pouring) return say(engine, 'You are already pouring a potion.', false), true;
  const potion = GARDEN_POTIONS[potionClass];
  const target = nearestGarden(engine);
  const garden = target?.state?.garden;
  const check = canPour(potionClass, garden, ctxFor(engine, seedId));
  if (!check.ok) return say(engine, check.msg, false), true;
  engine.playSound?.('POTION_GENERIC', { volume: 0.6 });
  pouring = { potionClass, seedId, target, at: Date.now(), fx: pourFx(engine, potionClass, target) };
  engine.setData?.('mgPouring', potion.action);
  return true;
}

function finishPour(engine) {
  const { potionClass, seedId, target, fx } = pouring;
  pouring = null;
  if (fx && !fx.root.destroyed) fx.root.destroy({ children: true });
  engine.setData?.('mgPouring', 'none');
  const potion = GARDEN_POTIONS[potionClass];
  const garden = target?.state?.garden;
  if (!garden) return say(engine, 'Oops, there aren\'t any gardens here.', false);
  const ctx = ctxFor(engine, seedId);
  const before = Object.fromEntries(Object.entries(garden.plots).map(([k, p]) => [k, { ...p }]));
  const res = potionTendGarden(garden, potion.action, engine.inv, engine.pc, { ...ctx, now: Date.now() });
  if (!res.ok) {
    engine.playSound?.('CLICK_FAILURE', { volume: 0.5 });
    return say(engine, `You tried to pour a ${potion.label}. ${res.msg}`, false);
  }
  const used = usePotion(potions, potionClass, engine.inv);
  // onPourComplete: "You poured a Soak-All Solution." then the garden growl.
  engine.pushActivity?.(`You poured a ${potion.label}.`);
  if (used.emptied) engine.pushActivity?.(`Your ${potion.label} is all used up.`);
  const sound = { water: 'WATERING_CAN', hoe: 'HOE', plant: 'GARDEN_PLANT', pick: 'HARVEST', fertilize: 'FERTILIDUST' }[potion.action];
  // croppery_herbalism_watering_time / _clearing_time: one pass of the sound instead of two.
  const fast = (potion.action === 'water' && upgrades(engine).includes('croppery_herbalism_watering_time'))
    || (potion.action === 'hoe' && upgrades(engine).includes('croppery_herbalism_clearing_time'));
  if (sound) {
    engine.playSound?.(sound, { volume: 0.55 });
    if (!fast && (potion.action === 'water' || potion.action === 'hoe')) setTimeout(() => engine.playSound?.(sound, { volume: 0.5 }), 450);
  }
  say(engine, res.msg);
  if (res.superHarvest) engine.pushActivity?.('Super Harvest!');
  engine.refreshGarden?.(target);
  engine.updateHud?.();
  // achievements_increment per plot, labelled by the garden.
  const label = `${engine.streetTsid || 'street'}_${garden.gardenType}`;
  const changed = Object.entries(garden.plots).filter(([k, p]) => JSON.stringify(p) !== JSON.stringify(before[k]));
  const counter = {
    water: 'garden_plots_watered',
    hoe: 'garden_plots_hoed',
    plant: garden.gardenType === 'herb' ? 'garden_herb_plots_planted' : 'garden_plots_planted',
    pick: 'garden_plots_picked',
    fertilize: 'garden_plots_fertilized',
  }[potion.action];
  const n = potion.action === 'water' ? changed.filter(([k]) => !before[k].wet && ['seeds', 'shoots'].includes(before[k].state)).length : res.count;
  if (n) engine.achievement?.(`${counter}:${label}`, n);
  engine.achievement?.(`potions_used:${potionClass}`, 1);
  for (const [cropId, qty] of Object.entries(res.items || {})) {
    engine.achievement?.(`${garden.gardenType === 'herb' ? 'herb_harvest' : 'garden_harvest'}:${cropId}`, qty);
  }
  if (res.drop) {
    engine.setData?.('mgDrop', `${res.drop.table}@${Math.round(res.drop.chance * 100)}%:${res.drop.hit ? 'hit' : 'miss'}`);
    if (res.drop.hit) payDrop(engine, rollDropTable(res.drop.table), { source: 'master_gardener' });
  }
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
}

/* ------------------------------------------------------------ QA */

function demoSetup(engine) {
  const demo = engine.param?.('mastergardendemo');
  if (demoDone || !demo) return;
  demoDone = true;
  for (const id of ['croppery_1', 'herbalism_1', MASTER_GARDENER]) engine.grantSkill?.(id);
  const inv = engine.inv;
  for (const id of Object.keys(GARDEN_POTIONS)) inv[id] = Math.max(1, Number(inv[id]) || 0);
  const herb = demo === 'herb';
  const seedId = herb ? 'herb_seed_rookswort' : 'seed_spinach';
  if (SEED_CATALOG[seedId]) inv[seedId] = Math.max(12, Number(inv[seedId]) || 0);
  engine.pc.energy = Math.max(engine.pc.energy || 0, 95);
  let target = null;
  for (const t of engine.interactables || []) {
    if (t.classId === 'garden_new' && (t.state?.garden?.gardenType === 'herb') === herb) target = t;
  }
  const p = engine.player;
  if (target && p) {
    p.x = target.sprite.x - 60;
    p.y = target.sprite.y;
  } else if (p) {
    target = engine.spawnGarden?.({ x: p.x + 120, y: p.y + 2, gardenType: herb ? 'herb' : 'default' });
  }
  const garden = target?.state?.garden;
  if (garden) {
    for (const plot of Object.values(garden.plots)) {
      plot.state = 'dirty';
      plot.seed = null;
      plot.wet = false;
      plot.fertilized = false;
    }
    engine.refreshGarden?.(target);
  }
  engine.refreshPack?.();
  engine.updateHud?.();
  if (engine.param('mastergardenautoplay')) autoplayAt = Date.now() + 1500;
  publish(engine);
}

function autoplay(engine, now) {
  const herb = engine.param('mastergardendemo') === 'herb';
  const seedId = herb ? 'herb_seed_rookswort' : 'seed_spinach';
  const steps = [
    ['potion_garden_clear'],
    ['potion_garden_plant', `plant:${seedId}`],
    ['potion_garden_water'],
    ['potion_garden_fertilize'],
    ['ripen'],
    ['potion_garden_harvest'],
  ];
  if (pouring) {
    autoplayAt = now + 400;
    return;
  }
  const step = steps[autoplayStep];
  if (!step || (step[0] === 'potion_garden_harvest' && engine.param('mastergardenautoplay') === 'hold')) {
    autoplayAt = 0;
    engine.setData('mgAutoplay', 'done');
    return;
  }
  autoplayStep += 1;
  autoplayAt = now + 600;
  if (step[0] === 'ripen') {
    // QA only: let the fertilized shoots finish now.
    const garden = nearestGarden(engine)?.state?.garden;
    for (const plot of Object.values(garden?.plots || {})) {
      if (plot.state === 'shoots' || plot.state === 'seeds') {
        plot.state = 'crop';
        plot.stageStartedAt = now;
      }
    }
    engine.refreshGarden?.(nearestGarden(engine));
    publish(engine);
    return;
  }
  masterGardenFeature.runPackVerb(step[0], step[1] || 'pour', engine);
}

/* ------------------------------------------------------------ feature */

export const masterGardenFeature = {
  id: MASTER_GARDEN_FEATURE_ID,

  init(engine) {
    for (const [id, p] of Object.entries(GARDEN_POTIONS)) {
      ensureItem(id, { label: p.label, namePlural: p.plural, desc: p.desc, baseCost: p.baseCost, stackMax: 1 });
    }
    publish(engine);
  },

  onStreetEnter(street, engine) {
    demoSetup(engine);
    publish(engine);
  },

  onStreetClear() {
    if (pouring?.fx && !pouring.fx.root.destroyed) pouring.fx.root.destroy({ children: true });
    pouring = null;
  },

  onTick(dtMs, now, engine) {
    if (pouring) {
      tickFx(pouring.fx, dtMs);
      if (now - pouring.at >= POUR_MS) finishPour(engine);
    }
    if (autoplayAt && now >= autoplayAt) autoplay(engine, now);
  },

  packVerbs(classTsid, engine) {
    const potion = GARDEN_POTIONS[classTsid];
    if (!potion) return [];
    const target = nearestGarden(engine);
    const garden = target?.state?.garden;
    const uses = `${potionUsesLeft(potions, classTsid, engine.inv)} pours left in this bottle`;
    if (potion.action === 'plant') {
      const seeds = garden ? listPlantableSeeds(engine.inv, garden.gardenType) : [];
      if (!seeds.length) {
        const check = canPour(classTsid, garden, ctxFor(engine, null));
        return [{ id: 'pour', label: 'Pour', enabled: false, reason: check.msg, tooltip: potion.tooltip }];
      }
      return seeds.slice(0, 6).map((seed, i) => {
        const check = canPour(classTsid, garden, ctxFor(engine, seed.seedId));
        const free = plotsFor(garden, 'plant').length;
        return {
          id: `plant:${seed.seedId}`,
          label: `Pour: ${seed.label} (${Math.min(free, countItem(engine.inv, seed.seedId))})`,
          enabled: check.ok,
          reason: check.msg || '',
          tooltip: `${potion.tooltip} · ${uses}`,
          primary: check.ok && i === 0,
        };
      });
    }
    const check = canPour(classTsid, garden, ctxFor(engine, null));
    return [{ id: 'pour', label: 'Pour', enabled: check.ok, reason: check.msg || '', tooltip: `${potion.tooltip} · ${uses}`, primary: check.ok }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (!GARDEN_POTIONS[classTsid]) return false;
    const seedId = String(verbId).startsWith('plant:') ? String(verbId).slice(6) : null;
    return startPour(engine, classTsid, seedId);
  },

  save() {
    return { version: 1, ...potions };
  },

  restore(slice) {
    potions = createPotionState(slice || {});
  },

  /** QA / tests. */
  _state() {
    return { potions, pouring, last };
  },
  _reset() {
    potions = createPotionState();
    last = '';
    pouring = null;
    demoDone = false;
    autoplayAt = 0;
    autoplayStep = 0;
  },
  _finish: finishPour,
};
