/**
 * Giant Icons (js/giant-icons.js) as a feature module.
 *
 *  - Emblems in the pack: Iconize (11 of one Giant), Caress (+25 mood),
 *    Consider (+20 energy), Contemplate (+30 iMG), each once a game day.
 *  - Icons in the pack: Ruminate (mood), Revere (energy), Reflect (iMG), each
 *    once a game day and one of the Icon's 20 actions; Tithe (121 currants,
 *    +5 actions at 10 or fewer, doubles your next gift from it); Place.
 *  - Placed on a street, an Icon checks once a minute per Giant as you walk
 *    past and, 5% of the time, bestows Giant Love (mood, energy, iMG or
 *    favor) with the ICON_GIANT_LOVE sound and a heart burst; out of actions
 *    it asks for a tithe. From level 10 it calls out and offers its
 *    recorded "Voices of the Giants" message (111 iMG) by the source's
 *    conversation rules; Talk to then tells it (G202: the shared record,
 *    js/conversations.js, and features/conversations-feature.js, which owns
 *    the verb). Pick it back up any time.
 *  - The first Icon completes "Loyalty's Rich Reward" (icons_created, offered
 *    by the Magic Rock once a Giant has given you four emblems); Icons of
 *    all eleven Giants grant Giant Lover.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&icondemo=1 grants 11
 *     Emblems of Alph, an Icon of Mab down to 3 actions, level 20 and 2,000
 *     currants. &iconautoplay=1 iconizes, caresses/considers/contemplates,
 *     ruminates/reveres/reflects, tithes the Mab icon, places the Alph icon,
 *     walks into it with the source testing flag (always bestows), waits for
 *     its conversation offer, talks to it, answers every line and picks it
 *     up (add &convo=dev for the source's dev-server offer rules, otherwise
 *     the offer waits 5 minutes after load and on donate_to_all_shrines).
 *     &icontesting=1 alone keeps placed icons in testing
 *     mode; &iconlover=1 adds 11 emblems of every Giant. Canvas: iconPack,
 *     iconPlaced, iconLast, iconBestowed, iconAutoplay, iconActions.
 */

import { addItem, countItem, ensureItem } from '../inventory.js?v=catalog-unified-4';
import { getGameDayKey } from '../game-day.js?v=dametime-1';
import { XP_FOR_LEVEL } from '../progression.js?v=progression-1';
import { emblemCostFor } from '../shrines.js';
import { landingY } from '../walk-surface.js';
import {
  EMBLEM_VERBS,
  GIANT_ICON_DATA,
  GIANT_ICON_IDS,
  GIANT_LOVER,
  GIANT_LOVE_MS,
  ICON_VERBS,
  ICONIZE_COUNT,
  adoreCheck,
  adoreIcon,
  bestowCheck,
  bestowMessage,
  createIconState,
  emblemVerbCheck,
  giantForEmblem,
  giantForIcon,
  iconize,
  legacyIconTalks,
  pickUpIcon,
  placeIcon,
  rollIconDay,
  syncPackIcons,
  titheCheck,
  titheCost,
  titheIcon,
  useEmblem,
} from '../giant-icons.js';
import { textureFromUrl } from '../textures.js';
import { verticalTextGradient } from '../text-gradient.js';
import { grantMoodXp } from '../mood-xp.js';
import { CONVERSATION_RULES, adoptLegacyTalks, conversationRecord, hasCompleted, toldRecord } from '../conversations.js?v=g202-1';

export const ICONS_FEATURE_ID = 'giant-icons';
const WORLD_ART = (iconClass) => `assets/sprites/giant-icons/${iconClass}.png`;
const COLLIDE_W = 150; // apiSetHitBox(300, 250) is centred on the icon
const COLLIDE_H = 250;

let state = createIconState();
let last = '';
let views = [];
let fx = [];
let demoDone = false;
let autoplayAt = 0;
let autoplayStep = 0;
let autoplayLog = [];
let autoplayTalkUntil = 0;

const dayKey = () => getGameDayKey(Date.now());
const owned = (engine) => engine.pc?.imaginationUpgrades || [];
const level = (engine) => Math.max(1, Number(engine.pc?.level) || 1);
const ctxFor = (engine) => ({ level: level(engine), upgrades: owned(engine), skills: engine.learnedSkills || [] });

function publish(engine) {
  if (!engine?.setData) return;
  const inv = engine.inv || {};
  engine.setData('iconPack', GIANT_ICON_IDS.filter((g) => countItem(inv, GIANT_ICON_DATA[g].iconClass) > 0).map((g) => `${g}:${(state.pack[g] || []).join('/')}`).join(',') || 'none');
  engine.setData('iconPlaced', (state.placed[engine.streetTsid] || []).map((r) => `${r.giant}:${r.actions}`).join(',') || 'none');
  engine.setData('iconLast', last || 'none');
  engine.setData('iconBestowed', String(state.bestowed));
  engine.setData('iconIconized', state.iconized.join(',') || 'none');
  const v = views[views.length - 1];
  engine.setData('iconSprite', v ? `${Math.round(v.sprite.x)},${Math.round(v.baseY)},${v.sprite.texture?.width || 0}x${v.sprite.texture?.height || 0},player=${Math.round(engine.player?.x || 0)},${Math.round(engine.player?.y || 0)}` : 'none');
}

function say(engine, msg, ok = true, effects = null) {
  last = String(msg || '').trim();
  if (effects) engine.pushActivity?.({ base: last.replace(/\.$/, ''), effects });
  else engine.pushActivity?.(last);
  engine.toast?.(last, ok ? 2800 : 2400);
  engine.refreshPack?.();
  publish(engine);
}

/** Pay a metabolic/iMG reward the way other features do; returns what actually landed. */
function grant(engine, stat, amount) {
  const pc = engine.pc;
  if (stat === 'xp') {
    // include/icon.js 230, 455 and emblem_*.js: stats_add_xp(n, false) takes the mood bonus.
    const landed = grantMoodXp(pc, amount);
    engine.updateHud?.();
    return landed;
  }
  const cap = stat === 'energy' ? Math.max(100, Number(pc.energyMax) || 100) : 100;
  const before = Math.max(0, Number(pc[stat]) || 0);
  pc[stat] = Math.min(cap, before + amount);
  engine.updateHud?.();
  return Math.round(pc[stat] - before);
}

function grantFavor(engine, giant, amount) {
  const shrine = engine.shrineState;
  const favor = shrine?.favor || engine.pc?.giantFavor;
  if (!favor) return 0;
  const cap = shrine ? emblemCostFor(shrine, giant) : Infinity;
  const before = favor[giant] || 0;
  favor[giant] = Math.min(cap, before + amount);
  engine.updateHud?.();
  return Math.round(favor[giant] - before);
}

/* ---------------------------------------------------------- pack verbs */

function emblemPackVerbs(giant, engine) {
  const inv = engine.inv;
  const def = GIANT_ICON_DATA[giant];
  const rows = [];
  if (countItem(inv, def.emblemClass) >= ICONIZE_COUNT) {
    rows.push({ id: 'iconize', label: 'Iconize', enabled: true, tooltip: `Combine 11 Emblems of ${giant.charAt(0).toUpperCase() + giant.slice(1)} to form an Icon`, primary: true });
  }
  for (const [verb, v] of Object.entries(EMBLEM_VERBS)) {
    const check = emblemVerbCheck(state, giant, verb);
    rows.push({ id: verb, label: verb.charAt(0).toUpperCase() + verb.slice(1), enabled: check.ok, reason: check.msg || '', tooltip: v.tooltip });
  }
  return rows;
}

function iconPackVerbs(giant, engine) {
  syncPackIcons(state, engine.inv);
  const ctx = ctxFor(engine);
  const rows = [];
  const tithe = titheCheck(state, { giant }, { ...ctx, currants: engine.pc.currants });
  const cost = titheCost(ctx.level, ctx.upgrades);
  rows.push({ id: 'tithe', label: `Tithe ${cost}c`, enabled: tithe.ok, reason: tithe.msg || '', tooltip: `Insert ${cost} currants to support the Icon`, primary: tithe.ok });
  for (const [verb, v] of Object.entries(ICON_VERBS)) {
    const check = adoreCheck(state, { giant }, verb, ctx);
    rows.push({ id: verb, label: v.label, enabled: check.ok, reason: check.msg || '', tooltip: `${v.label}: ${v.stat === 'xp' ? 'iMG' : v.stat} from the Icon (${(state.pack[giant] || [])[0] ?? 0} actions left)` });
  }
  rows.push({ id: 'place', label: 'Place', enabled: !engine.transientInstance?.() && !engine.homeContext?.().inHome, reason: 'Icons can only be placed on a street.', tooltip: 'Place this Icon on the ground' });
  return rows;
}

function runEmblemVerb(giant, verbId, engine) {
  if (verbId === 'iconize') {
    const res = iconize(state, engine.inv, giant);
    if (!res.ok) return say(engine, res.msg, false), true;
    engine.playSound?.('DONATION_RECIEVE_EMBLEM', { volume: 0.6 });
    say(engine, res.msg);
    // quests_inc_counter('icons_created') + achievements VERB:iconize.
    engine.achievement?.('icons_created', 1);
    engine.achievement?.(`VERB:iconize:${GIANT_ICON_DATA[giant].emblemClass}`, 1);
    if (res.giantLover) engine.grantAchievement?.(GIANT_LOVER);
    engine.save?.();
    return true;
  }
  const res = useEmblem(state, giant, verbId);
  if (!res.ok) return say(engine, res.msg, false), true;
  const actual = grant(engine, res.stat, res.amount);
  say(engine, res.msg, true, { [res.stat]: actual });
  engine.save?.();
  return true;
}

function runIconVerb(giant, verbId, engine, ref = { giant }) {
  const ctx = ctxFor(engine);
  if (verbId === 'tithe') {
    const res = titheIcon(state, ref, engine.pc, ctx);
    if (!res.ok) return say(engine, res.msg, false), true;
    engine.playSound?.('PAY_50_CURRANTS', { volume: 0.6 });
    say(engine, res.msg);
    engine.save?.();
    return true;
  }
  if (verbId === 'place') {
    const p = engine.player;
    const x = (p?.x || 0) + 70 * (p?.scale?.x < 0 ? -1 : 1);
    const y = landingY(engine.platforms, x, (p?.y || engine.groundY) - 40) ?? p?.y ?? engine.groundY;
    const res = placeIcon(state, engine.inv, giant, engine.streetTsid, x, y);
    if (!res.ok) return say(engine, res.msg, false), true;
    spawnIcon(engine, res.row);
    engine.playSound?.('ITEM_DROP', { volume: 0.5 });
    say(engine, res.msg);
    engine.save?.();
    return true;
  }
  if (ICON_VERBS[verbId]) {
    const res = adoreIcon(state, ref, verbId, ctx);
    if (!res.ok) return say(engine, res.msg, false), true;
    const actual = grant(engine, res.stat, res.amount);
    say(engine, res.msg, true, { [res.stat]: actual });
    engine.save?.();
    return true;
  }
  return false;
}

function confirmPlace(giant, engine) {
  // icon_place on a public street: "it can be picked up by anyone. Proceed?"
  if (engine.param?.('iconautoplay')) return runIconVerb(giant, 'place', engine);
  engine.offerQuestDialogue?.({
    title: GIANT_ICON_DATA[giant].label,
    kicker: 'Place',
    beats: [{ text: 'If you place this icon here, it can be picked up by anyone. Proceed?', response: 'Yes' }],
    acceptLabel: 'Yes',
    declineLabel: 'No',
    onAccept: () => runIconVerb(giant, 'place', engine),
  });
  return true;
}

/* -------------------------------------------------------------- world */

function spawnIcon(engine, row) {
  const { PIXI } = engine;
  const def = GIANT_ICON_DATA[row.giant];
  const spr = new PIXI.Sprite(textureFromUrl(WORLD_ART(def.iconClass)));
  spr.anchor.set(0.5, 1);
  spr.x = row.x;
  spr.y = row.y + 2;
  spr.zIndex = 7;
  spr._worldHitW = 90;
  spr._worldHitH = 110;
  engine.entityLayer.addChild(spr);
  const target = engine.register({
    classId: def.iconClass,
    featureId: ICONS_FEATURE_ID,
    label: def.label,
    subtitle: row.actions > 0 ? `${row.actions} actions before a tithe` : 'A tithe is due',
    sprite: spr,
    iconId: row.id,
  });
  views.push({ row, sprite: spr, target, baseY: spr.y, t: Math.random() * 6 });
  publish(engine);
}

function viewFor(id) {
  return views.find((v) => v.row.id === id) || null;
}

function removeView(engine, id) {
  const v = viewFor(id);
  if (!v) return;
  engine.unregister?.(v.target);
  views = views.filter((x) => x !== v);
}

/** The icon_giant_love overlay (an XFL timeline of rays, a heart and GIANT LOVE letters), drawn in Pixi. */
function giantLoveFx(engine, giant) {
  const { PIXI } = engine;
  const p = engine.player;
  if (!PIXI || !p || !engine.fxLayer) return;
  for (const old of fx) if (!old.root.destroyed) old.root.destroy({ children: true });
  fx = [];
  const root = new PIXI.Container();
  root.x = p.x;
  root.y = (p.y || engine.groundY) - 185;
  const rays = new PIXI.Graphics();
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    rays.moveTo(0, 0);
    rays.lineTo(Math.cos(a - 0.12) * 120, Math.sin(a - 0.12) * 120);
    rays.lineTo(Math.cos(a + 0.12) * 120, Math.sin(a + 0.12) * 120);
    rays.fill({ color: i % 2 ? 0xffe27a : 0xffb3d4, alpha: 0.32 });
  }
  const heart = new PIXI.Graphics();
  heart.moveTo(0, 26);
  heart.bezierCurveTo(-48, -6, -30, -46, 0, -22);
  heart.bezierCurveTo(30, -46, 48, -6, 0, 26);
  heart.fill(0xff4d7d).stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
  const text = new PIXI.Text({ text: 'GIANT LOVE!', style: {
    fontFamily: 'Arial Black, Arial, sans-serif',
    fontSize: 26,
    fontWeight: '900',
    fill: verticalTextGradient([0xfff27a, 0xff8fc0]),
    stroke: { color: 0x5a2a7a, width: 6 },
  } });
  text.anchor.set(0.5);
  text.y = 52;
  root.addChild(rays, heart, text);
  engine.fxLayer.addChild(root);
  fx.push({ root, rays, heart, text, age: 0, ttl: GIANT_LOVE_MS });
}

function bestowFor(engine, view, now) {
  const shrine = engine.shrineState;
  const giant = view.row.giant;
  const favorGiant = giant;
  const res = bestowCheck(state, view.row, {
    now,
    level: level(engine),
    skills: engine.learnedSkills || [],
    upgrades: owned(engine),
    favor: shrine?.favor?.[favorGiant] || engine.pc?.giantFavor?.[favorGiant] || 0,
    favorMax: shrine ? emblemCostFor(shrine, favorGiant) : 1000,
    testing: engine.param?.('icontesting') === '1' || view.testing === true,
  });
  if (!res) return;
  if (res.kind === 'tithe') {
    engine.say?.(view.target, res.bubble, 4000);
    return;
  }
  engine.setData?.('iconRoll', `${res.roll}/${10 * res.chance}`);
  if (res.kind !== 'bestow') return;
  engine.playSound?.('ICON_GIANT_LOVE', { volume: 0.7 });
  giantLoveFx(engine, giant);
  const actual = res.type === 'favor' ? grantFavor(engine, res.favorGiant, res.amount) : grant(engine, res.type, res.amount);
  say(engine, bestowMessage(giant, res.type, actual));
  engine.save?.();
}

/* --------------------------------------------------------------- QA */

function demoSetup(engine) {
  const demo = engine.param?.('icondemo');
  if (demoDone || !demo) return;
  demoDone = true;
  const pc = engine.pc;
  const lvl = Math.max(20, Number(engine.param('iconlevel')) || 20);
  pc.xp = Math.max(Number(pc.xp) || 0, XP_FOR_LEVEL[Math.min(XP_FOR_LEVEL.length, lvl) - 2] || 0);
  pc.level = lvl;
  pc.currants = Math.max(pc.currants || 0, 2000);
  pc.mood = Math.min(pc.mood || 0, 40);
  pc.energy = Math.min(pc.energy || 0, 60);
  const inv = engine.inv;
  const need = (id, n) => {
    if (countItem(inv, id) < n) addItem(inv, id, n - countItem(inv, id));
  };
  need('emblem_alph', ICONIZE_COUNT);
  if (engine.param('iconlover')) for (const g of GIANT_ICON_IDS) need(GIANT_ICON_DATA[g].emblemClass, ICONIZE_COUNT);
  if (countItem(inv, 'icon_mab') < 1) {
    addItem(inv, 'icon_mab', 1);
    syncPackIcons(state, inv);
    state.pack.mab[state.pack.mab.length - 1] = 3;
  }
  syncPackIcons(state, inv);
  engine.updateHud?.();
  if (engine.param('iconautoplay')) autoplayAt = Date.now() + 1500;
  publish(engine);
}

const AUTOPLAY = [
  ['pack', 'emblem_alph', 'iconize'],
  ['pack', 'icon_alph', 'ruminate'],
  ['pack', 'icon_alph', 'revere'],
  ['pack', 'icon_alph', 'reflect'],
  ['pack', 'icon_mab', 'tithe'],
  ['pack', 'icon_mab', 'ruminate'],
  ['pack', 'icon_alph', 'place'],
  ['walk'],
  ['wait'],
  ['talk'],
  ['answer'],
  ['pick'],
];

function autoplay(engine, now) {
  const step = AUTOPLAY[autoplayStep];
  if (!step) {
    engine.setData('iconAutoplay', 'done');
    engine.setData('iconSteps', autoplayLog.join('|'));
    autoplayAt = 0;
    return;
  }
  if (engine.param('iconautoplay') === 'place' && step[0] === 'walk') {
    autoplayStep = AUTOPLAY.length;
    return autoplay(engine, now);
  }
  autoplayStep += 1;
  autoplayAt = now + 900;
  if (step[0] === 'pack') {
    giantIconsFeature.runPackVerb(step[1], step[2], engine);
    autoplayLog.push(`${step[2]}:${last.slice(0, 28)}`);
    if (step[2] === 'iconize') {
      for (const v of Object.keys(EMBLEM_VERBS)) giantIconsFeature.runPackVerb('emblem_alph', v, engine);
    }
  } else if (step[0] === 'walk') {
    const v = views[views.length - 1];
    if (v) {
      v.testing = true;
      engine.player.x = v.sprite.x - 20;
    }
    autoplayLog.push('walk');
  } else if (step[0] === 'wait') {
    autoplayAt = now + 2500;
  } else if (step[0] === 'talk') {
    // The conversations feature offers on collision (its rules) and owns Talk to.
    const v = views[views.length - 1];
    const verb = v && (engine.targetVerbs?.(v.target) || []).find((r) => r.id === 'convo_talk');
    if (v && !verb && !autoplayTalkUntil) autoplayTalkUntil = now + 30_000;
    if (v && !verb && now < autoplayTalkUntil) {
      autoplayStep -= 1;
      autoplayAt = now + 500;
      return publish(engine);
    }
    if (verb) engine.beginVerb?.(v.target, verb);
    autoplayLog.push(verb ? 'talk' : 'talk:none');
    autoplayAt = now + 800;
  } else if (step[0] === 'answer') {
    if (engine.questDialogueOpen?.()) {
      if (typeof document !== 'undefined') document.getElementById('quest-dialogue-next')?.click();
      autoplayStep -= 1;
      autoplayAt = now + 500;
      return publish(engine);
    }
    const v = views[views.length - 1];
    const id = GIANT_ICON_DATA[v?.row.giant]?.conversations[0]?.id;
    autoplayLog.push(`told:${id && hasCompleted(conversationRecord(), id) ? id : 'none'}`);
  } else if (step[0] === 'pick') {
    const v = views[views.length - 1];
    if (v && engine.param('iconautoplay') !== 'hold') giantIconsFeature.runVerb(v.target, 'pickup', engine);
    autoplayLog.push(`pick:${last.slice(0, 20)}`);
  }
  publish(engine);
}

/* ------------------------------------------------------------ feature */

export const giantIconsFeature = {
  id: ICONS_FEATURE_ID,

  init(engine) {
    for (const g of GIANT_ICON_IDS) {
      const def = GIANT_ICON_DATA[g];
      ensureItem(def.iconClass, {
        label: def.label,
        namePlural: def.namePlural,
        desc: def.desc,
        baseCost: 0,
        stackMax: 1,
        sellable: false,
        donatable: false,
        tags: ['no_rube', 'no_vendor', 'no_donate', 'icon', 'emblems_icons'],
      });
    }
    rollIconDay(state, dayKey());
    publish(engine);
  },

  onStreetEnter(street, engine) {
    rollIconDay(state, dayKey());
    syncPackIcons(state, engine.inv);
    demoSetup(engine);
    if (!engine.transientInstance?.()) for (const row of state.placed[engine.streetTsid] || []) spawnIcon(engine, row);
    publish(engine);
  },

  onStreetClear() {
    views = [];
    for (const f of fx) if (!f.root.destroyed) f.root.destroy({ children: true });
    fx = [];
  },

  onNewDay() {
    rollIconDay(state, dayKey());
  },

  onTick(dtMs, now, engine) {
    if (autoplayAt && now >= autoplayAt) autoplay(engine, now);
    const p = engine.player;
    for (const v of views) {
      v.t += dtMs / 1000;
      v.sprite.y = v.baseY - 3 - Math.sin(v.t * 1.6) * 3;
      if (!p || engine.busy?.()) continue;
      if (Math.abs(p.x - v.sprite.x) <= COLLIDE_W && Math.abs((p.y || 0) - v.baseY) <= COLLIDE_H) bestowFor(engine, v, now);
    }
    for (const f of fx) {
      f.age += dtMs;
      const k = Math.min(1, f.age / f.ttl);
      f.rays.rotation += dtMs * 0.0012;
      const pop = k < 0.15 ? k / 0.15 : 1;
      f.heart.scale.set(1.35 * pop * (1 + Math.sin(f.age / 120) * 0.08));
      f.root.alpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      f.root.y -= dtMs * 0.01;
      if (k >= 1 && !f.root.destroyed) f.root.destroy({ children: true });
    }
    fx = fx.filter((f) => !f.root.destroyed);
  },

  packVerbs(classTsid, engine) {
    rollIconDay(state, dayKey());
    const emblem = giantForEmblem(classTsid);
    if (emblem) return emblemPackVerbs(emblem, engine);
    const icon = giantForIcon(classTsid);
    if (icon) return iconPackVerbs(icon, engine);
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    rollIconDay(state, dayKey());
    const emblem = giantForEmblem(classTsid);
    if (emblem && (verbId === 'iconize' || EMBLEM_VERBS[verbId])) return runEmblemVerb(emblem, verbId, engine);
    const icon = giantForIcon(classTsid);
    if (!icon) return false;
    syncPackIcons(state, engine.inv);
    if (verbId === 'place') return confirmPlace(icon, engine);
    return runIconVerb(icon, verbId, engine);
  },

  verbsFor(target, engine) {
    const v = viewFor(target.iconId);
    if (!v) return [];
    const ctx = ctxFor(engine);
    const tithe = titheCheck(state, { placedId: v.row.id }, { ...ctx, currants: engine.pc.currants });
    const cost = titheCost(ctx.level, ctx.upgrades);
    // Talk to (verbs.talk_to, icon_alph.js 269-308) is added by the conversations feature while one is offered.
    const rows = [];
    rows.push({ id: 'tithe', label: `Tithe ${cost}c`, enabled: tithe.ok, reason: tithe.msg || '', tooltip: `Insert ${cost} currants to support the Icon`, durationMs: 0 });
    rows.push({ id: 'pickup', label: 'Pick up', enabled: true, tooltip: 'Put it in your pack', durationMs: 0 });
    return rows;
  },

  runVerb(target, verbId, engine) {
    const v = viewFor(target.iconId);
    if (!v) return false;
    if (verbId === 'pickup') {
      const res = pickUpIcon(state, engine.inv, engine.streetTsid, v.row.id);
      if (res.ok) removeView(engine, v.row.id);
      say(engine, res.msg, res.ok);
      engine.save?.();
      return true;
    }
    if (verbId === 'tithe') {
      runIconVerb(v.row.giant, 'tithe', engine, { placedId: v.row.id });
      target.subtitle = v.row.actions > 0 ? `${v.row.actions} actions before a tithe` : 'A tithe is due';
      return true;
    }
    return false;
  },

  /** version 2: the conversations told live in the shared record (G202), not here. */
  save() {
    return { version: 2, ...state };
  },

  /**
   * A version 1 save's `talked` list is handed to the shared record once
   * (in either restore order, js/conversations.js adoptLegacyTalks), told
   * long enough ago that no offer waits on it.
   */
  restore(slice) {
    state = createIconState(slice || {});
    const told = legacyIconTalks(slice);
    if (told.length) adoptLegacyTalks(toldRecord(told, Date.now() - CONVERSATION_RULES.offerTimeoutMs - 60_000));
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  _reset() {
    state = createIconState();
    last = '';
    views = [];
    fx = [];
    demoDone = false;
    autoplayAt = 0;
    autoplayStep = 0;
    autoplayLog = [];
    autoplayTalkUntil = 0;
  },
};
