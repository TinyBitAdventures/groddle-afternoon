/**
 * Croaking and Naraka as a feature module (see js/feature-host.js).
 *
 * Rules live in js/hell.js; this file binds them to the world: the per-frame
 * croak check, Hell One's grapes and their Squish verb, the Hell Hole drop,
 * graveside markers, Pooped physics, and the dead's travel/metabolic gates.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&helldemo=croak sets energy to zero so
 * the next frame croaks; &helldemo=squish arrives dead with 10 grapes already
 * squished; &hellautoplay=1 squishes the nearest grapes until resurrection;
 * &helldemo=dead makes you dead where you stand (no teleport), so a Naraka
 * street's doors and the Hell Bar can be walked as the dead walk them.
 */

import {
  GRAPES_REQUIRED,
  HELL_BUFFS,
  HELL_LOCATION,
  HELL_ONE_GRAPES,
  HELL_SPRITES,
  HELL_TEXT,
  checkLowEnergyWarning,
  checkPooped,
  createHellState,
  croak,
  drinkWineOfTheDead,
  enforceHellOnEnter,
  ensureHellItems,
  graveMarkerPhase,
  graveMarkerLabel,
  hellHoleFlagForStreet,
  hellNewDay,
  hellPhysics,
  isInHell,
  isInHellOne,
  metabolicGate,
  narakaStreet,
  normalizeHellState,
  noteNarakaVisit,
  onEnergyGained,
  planHellGrapes,
  recognizeDeath,
  remainingGrapes,
  resolveReloadLocation,
  resurrect,
  canTeleport,
  shouldCroak,
  squishGrape,
  wineDrinkConditions,
} from '../hell.js';
import { countItem, removeItem } from '../inventory.js?v=catalog-unified-4';
import { frameTexture, sourceFromUrl } from '../textures.js';

const GRAPE_SCALE = 0.8;
const GRAVE_GIANTS = new Set(HELL_SPRITES.graveside.giants);

let state = createHellState();
let grapeTargets = [];
let graveSprite = null;
let lastEnergy = null;
let promptTimers = [];
let autoplayAt = 0;
let holeDropping = false;

function clearPromptTimers() {
  for (const id of promptTimers) clearTimeout(id);
  promptTimers = [];
}

function grapeTexture(engine, variant) {
  const { PIXI } = engine;
  const sheet = HELL_SPRITES.grapesWorld;
  const base = sourceFromUrl(sheet.url);
  const frame = Math.max(0, Math.min(sheet.frames - 1, variant | 0));
  return frameTexture(base, new PIXI.Rectangle(frame * sheet.frameW, 0, sheet.frameW, sheet.frameH));
}

function publish(engine) {
  engine.setData('hellDead', state.isDead ? '1' : '0');
  engine.setData('hellGrapes', String(state.grapesSquished));
  engine.setData('hellGrapesRequired', String(GRAPES_REQUIRED));
  engine.setData('hellGrapesOnGround', String(grapeTargets.length));
  engine.setData('hellDeaths', String(state.totalDeaths));
  engine.setData('hellPooped', state.pooped?.kind || '');
}

/**
 * The prompt's heading. The source prompts have no title (pc.prompts_add txt
 * only), so the card names what it is about: Hell One's entry prompt
 * (location.js 315-330, is_grape_squish) or the Pooped buff that sent it
 * (catalog_buffs.js 1689-1713 on_apply). Before G192 every prompt here said
 * "You croaked!", the Pooped one too.
 */
function promptHeading(effect, buff) {
  if (effect.isGrapeSquish) return { kicker: 'Naraka', title: HELL_TEXT.croaked };
  const name = buff && HELL_BUFFS[buff]?.name;
  if (name) return { kicker: 'Energy', title: name };
  return { kicker: 'Naraka', title: HELL_TEXT.croaked };
}

/**
 * Apply a hell.js effects list in order. `prompts: false` skips the prompts,
 * for a caller that shows them once the loading card has gone (G192).
 */
function applyEffects(effects, engine, { prompts = true } = {}) {
  let buff = '';
  for (const effect of effects || []) {
    switch (effect.type) {
      case 'buff':
        buff = effect.buff || '';
        break;
      case 'sound':
        engine.playSound(effect.key === 'SQUISH_GRAPES' ? 'SQUISH_GRAPES' : 'CROAK', { volume: 1 });
        break;
      case 'activity':
        engine.pushActivity(effect.text);
        break;
      case 'metabolics':
        Object.assign(engine.pc, effect.set);
        engine.updateHud();
        break;
      case 'remove_followers':
        engine.stopFollowing();
        break;
      case 'achievement':
        engine.achievement(effect.counter, effect.amount || 1);
        break;
      case 'quest_flag':
        engine.questFlag(effect.flag);
        break;
      case 'consume_item':
        removeItem(engine.inv, effect.classTsid, effect.count || 1);
        engine.refreshPack();
        break;
      case 'remove_buff':
        // Pooped lives in the hell state (hellPhysics); drop any HUD buff of that name too.
        if (engine.hasBuff?.(effect.buff)) engine.removeBuff(effect.buff);
        break;
      case 'remove_grape': {
        const target = grapeTargets.find((t) => t.grapeId === effect.id);
        if (target) {
          grapeTargets = grapeTargets.filter((t) => t !== target);
          engine.unregister(target);
        }
        break;
      }
      case 'remove_grave_marker':
        if (graveSprite) {
          graveSprite.parent?.removeChild(graveSprite);
          graveSprite.destroy({ children: true });
          graveSprite = null;
        }
        break;
      case 'prompt': {
        if (!prompts) break;
        const delay = Math.max(0, effect.delayMs || 0);
        const heading = promptHeading(effect, buff);
        promptTimers.push(
          setTimeout(() => engine.prompt({ ...heading, text: effect.text }), delay)
        );
        break;
      }
      case 'teleport':
        // Handled by the caller once state is committed.
        break;
      default:
        break;
    }
  }
}

function teleportFrom(effects) {
  return (effects || []).find((effect) => effect.type === 'teleport') || null;
}

/**
 * Travel, then the prompts. location.js 315-330 queues Hell One's entry
 * prompt (1 s on the first visit, 30 s after) when you arrive, so the delay
 * starts once the loading card has gone, not when you croak (G192).
 */
function enterThenPrompt(engine, to, effects, after) {
  const arrived = () => {
    applyEffects((effects || []).filter((effect) => effect.type === 'prompt'), engine);
    after?.();
  };
  Promise.resolve(engine.enter(to.tsid, { spawnX: to.x, spawnY: to.y, bypassFeatureGates: true }))
    .then(() => engine.afterStreetCard?.())
    .then(arrived, arrived);
}

function croakContext(engine) {
  const home = engine.homeContext();
  const street = engine.street;
  return {
    streetTsid: engine.streetTsid,
    x: engine.player.x,
    y: engine.player.y,
    hubId: street?.hubId || '',
    label: street?.label || '',
    home: home.inHome ? home.room : null,
    giant: street?.officialGiantId || 'generic',
    pc: engine.pc,
  };
}

function doCroak(engine) {
  const result = croak(state, croakContext(engine));
  if (!result.ok) return false;
  state = result.state;
  clearPromptTimers();
  applyEffects(result.effects, engine, { prompts: false });
  engine.save();
  enterThenPrompt(engine, result.teleport, result.effects);
  publish(engine);
  return true;
}

function doResurrect(engine) {
  const result = resurrect(state, engine.pc, Date.now(), {
    streetExists: (tsid) => engine.streetExists(tsid),
  });
  if (!result.ok) return false;
  state = result.state;
  clearPromptTimers();
  applyEffects(result.effects, engine);
  engine.pushActivity('You squished your way out of Naraka. Welcome back!');
  engine.save();
  const to = teleportFrom(result.effects);
  if (to) engine.enter(to.tsid, { spawnX: to.x, spawnY: to.y, bypassFeatureGates: true });
  publish(engine);
  return true;
}

function spawnGrapes(street, engine) {
  const grapes = isInHellOne(street.tsid) ? HELL_ONE_GRAPES : planHellGrapes(street);
  for (const grape of remainingGrapes(state, grapes)) {
    const sprite = new engine.PIXI.Sprite(grapeTexture(engine, grape.variant));
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(GRAPE_SCALE);
    sprite.x = grape.x;
    sprite.y = grape.y + 2;
    sprite.zIndex = 21;
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    engine.entityLayer.addChild(sprite);
    const target = engine.register({
      classId: 'bunch_of_grapes_hell',
      featureId: 'hell',
      label: 'Bunch of Hellish Grapes',
      subtitle: HELL_TEXT.squishTooltip,
      sprite,
      grapeId: grape.id,
    });
    grapeTargets.push(target);
  }
}

function spawnGrave(street, engine) {
  const marker = state.graveMarker;
  if (!marker || marker.tsid !== street.tsid) return;
  const phase = graveMarkerPhase(state, Date.now());
  if (phase === 'gone') return;
  const giant = GRAVE_GIANTS.has(marker.giant) ? marker.giant : 'generic';
  const sheet = HELL_SPRITES.graveside;
  const { PIXI } = engine;
  const base = sourceFromUrl(sheet.urlPattern.replace('<giant>', giant));
  const frame = Math.max(0, sheet.states.indexOf(marker.state || 'none'));
  graveSprite = new PIXI.Sprite(
    frameTexture(base, new PIXI.Rectangle(frame * sheet.frameW, 0, sheet.frameW, sheet.frameH))
  );
  graveSprite.anchor.set(0.5, 1);
  graveSprite.x = marker.x;
  // The source raises the marker 29px above the croak point; anchor at the feet.
  graveSprite.y = marker.y + 29;
  graveSprite.alpha = phase === 'fading' ? 0.5 : 1;
  graveSprite.zIndex = 20;
  engine.entityLayer.addChild(graveSprite);
  engine.register({
    classId: 'graveside_marker',
    featureId: 'hell',
    label: graveMarkerLabel('you'),
    subtitle: 'Rest in peace. For now.',
    sprite: graveSprite,
  });
}

function demoSetup(engine) {
  const demo = engine.param('helldemo');
  if (demo === 'croak') {
    engine.pc.energy = 0;
  } else if (demo === 'dead' && !state.isDead) {
    // QA: dead where you stand (no croak teleport), e.g. on a Naraka street for the Hell Bar door.
    state = normalizeHellState({ ...state, isDead: true, croakedAt: Date.now(), visitId: state.visitId + 1 });
    engine.pc.energy = 0;
    engine.updateHud();
  } else if (demo === 'squish' && !state.isDead) {
    engine.pc.energy = 0;
    if (doCroak(engine)) {
      const already = HELL_ONE_GRAPES.slice(0, GRAPES_REQUIRED - 1).map((grape) => grape.id);
      state = { ...state, grapesSquished: already.length, squishedGrapeIds: already };
    }
  }
}

export const hellFeature = {
  id: 'hell',

  init(engine) {
    ensureHellItems();
    publish(engine);
  },

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeHellState(slice || {});
  },

  /** Where a reloaded game should start (dead players resume in Naraka). */
  reloadLocation(saved) {
    const decision = resolveReloadLocation(state, saved, Date.now());
    if (decision.action === 'resurrect') {
      const out = resurrect(state, { energy: 0, mood: 0 }, Date.now(), {});
      if (out.ok) state = out.state;
    }
    if (decision.action === 'none' || !decision.target) return null;
    return { tsid: decision.target.tsid, x: decision.target.x, y: decision.target.y };
  },

  ecologyOverride(street) {
    const row = narakaStreet(street.tsid);
    // Hell forbids animals; its archived spawners must not infer piggies.
    return row ? { label: row.label, sourceTsid: row.sourceTsid, counts: {}, empty: true } : null;
  },

  prepareStreet(street) {
    const row = narakaStreet(street.tsid);
    if (!row) return;
    street.label = row.label;
    street.hubId = HELL_LOCATION.hubId;
    street.hubName = HELL_LOCATION.hubName;
  },

  labelFor(tsid) {
    const row = narakaStreet(tsid);
    return row ? { street: row.label, hub: HELL_LOCATION.hubName, hubId: HELL_LOCATION.hubId } : null;
  },

  enterGate(tsid) {
    const redirect = enforceHellOnEnter(state, tsid, narakaStreet(tsid) ? HELL_LOCATION.hubId : '');
    return redirect ? { tsid: redirect.tsid, spawnX: redirect.x, spawnY: redirect.y } : null;
  },

  travelGate(tsid) {
    const gate = canTeleport(state, tsid, Date.now(), narakaStreet(tsid) ? HELL_LOCATION.hubId : '');
    return gate.ok ? null : { ok: false, msg: gate.error };
  },

  metabolicGate(stat, direction) {
    const gate = metabolicGate(state, stat, direction, Date.now());
    return gate.allowed ? null : { ok: false, msg: gate.text };
  },

  /** The Magic Rock leaves the dead alone. */
  holdQuestOffers() {
    return state.isDead ? true : null;
  },

  /** The dead walk Naraka with zero energy. */
  allowZeroEnergyMovement() {
    return state.isDead ? true : null;
  },

  physics() {
    return hellPhysics(state, Date.now());
  },

  onStreetEnter(street, engine) {
    const visit = noteNarakaVisit(state, street.tsid, street.hubId);
    state = visit.state;
    for (const event of visit.events) engine.achievement(event.counter, event.amount);
    const flag = hellHoleFlagForStreet(street.tsid);
    if (flag) {
      engine.questFlag(flag);
      // The quest event behind hell_hole's jump_hell_hole flag (js/quest-offers.js COUNTER_ROUTES, G163).
      engine.achievement('hell_hole_jumped', 1);
    }
    if (narakaStreet(street.tsid)) spawnGrapes(street, engine);
    spawnGrave(street, engine);
    demoSetup(engine);
    publish(engine);
  },

  onStreetClear() {
    grapeTargets = [];
    graveSprite = null;
    holeDropping = false;
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    if (state.isDead) {
      // The Hell Hole: falling through Hell One's only floor gap.
      const hole = HELL_LOCATION.hellHole;
      const player = engine.player;
      if (
        isInHellOne(engine.streetTsid) &&
        player.x >= hole.x1 &&
        player.x <= hole.x2 &&
        player.y >= hole.rimY - 2 &&
        !holeDropping
      ) {
        holeDropping = true;
        engine.enter(hole.destinationTsid, { bypassFeatureGates: true });
      }
      if (engine.param('hellautoplay') === '1' && now - autoplayAt > 450 && grapeTargets.length) {
        autoplayAt = now;
        const nearest = grapeTargets.reduce((best, t) =>
          Math.abs(t.sprite.x - player.x) < Math.abs(best.sprite.x - player.x) ? t : best
        );
        this.runVerb(nearest, 'squish', engine);
      }
      return;
    }
    if (engine.transientInstance() || !isFinite(engine.pc.energy)) return;
    const energy = engine.pc.energy;
    if (lastEnergy != null && energy > lastEnergy) {
      const gained = onEnergyGained(state, engine.pc, now);
      state = gained.state;
    }
    if (lastEnergy != null && energy < lastEnergy) {
      const warning = checkLowEnergyWarning(state, engine.pc, now);
      state = warning.state;
      applyEffects(warning.effects, engine);
      const pooped = checkPooped(state, engine.pc, now);
      if (pooped.applied) {
        state = pooped.state;
        applyEffects(pooped.effects, engine);
        publish(engine);
      }
    }
    lastEnergy = energy;
    if (shouldCroak(engine.pc, state, {
      streetTsid: engine.streetTsid,
      hubId: engine.street?.hubId || '',
      now,
    })) {
      lastEnergy = null;
      doCroak(engine);
    }
  },

  onNewDay(now, engine) {
    const result = hellNewDay(state, engine.pc, now, {
      streetExists: (tsid) => engine.streetExists(tsid),
    });
    state = result.state;
    applyEffects(result.effects, engine);
    const to = result.resurrection?.ok ? teleportFrom(result.effects) : null;
    if (to) engine.enter(to.tsid, { spawnX: to.x, spawnY: to.y, bypassFeatureGates: true });
    publish(engine);
  },

  verbsFor(target) {
    if (target.classId === 'graveside_marker') return [];
    if (target.classId !== 'bunch_of_grapes_hell') return null;
    return [
      {
        id: 'squish',
        label: 'squish',
        enabled: state.isDead,
        tooltip: HELL_TEXT.squishTooltip,
        reason: state.isDead ? '' : 'Only the dead have penance to squish.',
        durationMs: 600,
      },
    ];
  },

  runVerb(target, verbId, engine) {
    if (target.classId !== 'bunch_of_grapes_hell' || verbId !== 'squish') return false;
    const result = squishGrape(state, target.grapeId, Date.now());
    if (!result.ok) return true;
    state = result.state;
    applyEffects(result.effects, engine);
    engine.toast(
      result.canResurrect
        ? 'Penance paid!'
        : `${result.remaining} more bunch${result.remaining === 1 ? '' : 'es'} to squish.`,
      1800
    );
    publish(engine);
    if (result.canResurrect) setTimeout(() => doResurrect(engine), 900);
    else engine.save();
    return true;
  },

  /** items/wine_of_the_dead.js drink: the dead stop being Pooped; the living croak. */
  packVerbs(classTsid) {
    if (classTsid !== 'wine_of_the_dead') return [];
    const cond = wineDrinkConditions(state, Date.now());
    return [{ id: 'drink', label: 'Drink', enabled: cond.state === 'enabled', reason: cond.reason, tooltip: cond.tooltip }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== 'wine_of_the_dead' || verbId !== 'drink') return false;
    if (countItem(engine.inv, 'wine_of_the_dead') < 1) return true;
    const result = drinkWineOfTheDead(state, { ...croakContext(engine), now: Date.now() });
    if (!result.ok) {
      if (result.text) engine.toast(result.text, 2200);
      return true;
    }
    state = result.state;
    clearPromptTimers();
    const to = result.teleport;
    applyEffects(result.effects, engine, { prompts: !to });
    engine.save();
    // The quest event behind hell_quest's drink_wotd flag (wine_of_the_dead.js:96 sets it on every drink; G163).
    // Drinking while alive croaks you into Hell One: send it once that loading card has gone,
    // so Beelzebooze's completion card follows the card instead of covering it (G177).
    const drank = () => engine.achievement('wine_of_the_dead:drink', 1);
    if (to) {
      lastEnergy = null;
      enterThenPrompt(engine, to, result.effects, drank);
    } else {
      drank();
    }
    publish(engine);
    return true;
  },

  /**
   * Another Glitch celebrates or mourns your grave (items/graveside_marker.js
   * 37-137 -> players/player.js recognizeDeath 1430). Commits the hell state and
   * returns js/hell.js recognizeDeath's result; the caller
   * (features/hell-tickets-feature.js, G163) applies its offer / ticket effects.
   */
  recognizeGrave({ type, recognizer, questState } = {}, engine) {
    const result = recognizeDeath(state, {
      type,
      recognizer,
      questState,
      streetTsid: engine.streetTsid,
      hubId: engine.street?.hubId || '',
    });
    if (!result.ok) return result;
    state = result.state;
    engine.save();
    publish(engine);
    return result;
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  isDead() {
    return state.isDead;
  },
  inHell(tsid) {
    return isInHell(tsid);
  },
  /**
   * Resurrect right away (the Get Out of Hell Free Card,
   * upgrade_card_instant_resurrection.js): pc.resurrect() then, with
   * `full`, +999999 energy and mood, i.e. both tanks full.
   */
  resurrectNow(engine, { full = false } = {}) {
    if (!state.isDead) return false;
    if (!doResurrect(engine)) return false;
    if (full) {
      engine.pc.energy = Math.max(1, Number(engine.pc.energyMax) || 100);
      engine.pc.mood = Math.max(1, Number(engine.pc.moodMax) || 100);
      engine.updateHud();
    }
    return true;
  },
};
