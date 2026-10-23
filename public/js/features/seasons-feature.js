/**
 * Seasonal calendar (js/seasons.js) as a feature: whichever holiday the
 * player's real-world date falls in dresses the streets, stocks the shops,
 * and switches on its items, verbs, quests and badges.
 *
 * Zilloween (source): two or three talking Jack-O-Lanterns per street (Trick
 * or treat once a game day), a faint ghost in the sky; Carve a Pumpkin with a
 * Pick and a Knife & Board (5 Pepitas, a Clump of Jellisac and one of five
 * faces), Light it with a full Firefly Jar, Smash it, Place it at home and
 * Teach it phrases; candy gives a Sugar Rush (11 a day, then toothache);
 * give candy to Piggies, Chickens, Butterflies and Street Spirits for the
 * Tricksy-Treater badges. Carved pumpkins rot when Zilloween ends.
 * Glitchmas (source): light snow and candy canes by the signposts; the Toy
 * Vendor stocks Crackers (pull one with a nearby critter's help) and Cards
 * (sign, read, mail); Egg Nog; "A Holiday Thing" (say "yay" for a Present
 * with a Collectors' Edition Yeti inside); the Yeti's cracker letter from
 * December 24.
 * Egg Hunt (reconstructed): a chocolate egg hidden on about half the streets;
 * all five for the Egg Hunter Trophy.
 * Pi Day (source): Pi's Estimate verb.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&season=zilloween
 *     (glitchmas | egg_hunt | pi_day | none), &seasondate=2026-12-24 previews a
 *     date, &seasonautoplay=1 runs the event's loop (=hold stops before the
 *     end), &seasondemo=1 stocks the pack for it. Canvas: seasonActive,
 *     seasonVia, seasonDecor, seasonLast, seasonAutoplay, seasonCandy,
 *     seasonGiftees, seasonFaces, seasonCrackers, seasonEggs, seasonPlaced.
 */

import { addItem, countItem, ensureItem, removeItem, registerItemUse, ITEM_CATALOG } from '../inventory.js?v=catalog-unified-3';
import { dametimeParts, getGameDayKey } from '../game-day.js?v=dametime-1';
import { setSeasonalSeedCheck as setGardenSeasonGate } from '../garden.js?v=catalog-unified-2';
import { setSeasonalSeedCheck as setMasterGardenSeasonGate } from '../garden.js';
import { setSeasonalRecipeCheck } from '../making.js?v=making-g14-1';
import { getToolCondition } from '../tools.js';
import { landingY, nearestSurfaceY } from '../walk-surface.js';
import { isBatterflyHabitat } from '../animal-husbandry.js';
import { emblemCostFor } from '../shrines.js';
import { rollDropTable } from '../drop-tables.js';
import { openNoteView, noteViewOpen } from '../note-view.js';
import { payDrop } from './drops-feature.js?v=drops-1';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=resource-nodes-2';
import { SEASON_DATA } from '../seasons-data.js';
import {
  CANDY_CLASSES,
  CARVE,
  CARVED_CLASSES,
  CRACKER,
  EGG_CLASSES,
  LIGHT,
  LIT_CLASSES,
  NOG,
  PUMPKIN_CLASSES,
  PUMPKIN_SPEECH,
  SEASONAL_ITEMS,
  SEASONAL_STOCK,
  SEASONS,
  SOURCE_LINES,
  STREET_LANTERN_LINES,
  TREATER_BOOST,
  YETI_DOLLS,
  activeSeasons,
  candyEatGate,
  carveCheck,
  carveOutcome,
  createSeasonState,
  crackerNote,
  dailyRow,
  daysLeft,
  eggForStreet,
  eggFound,
  estimatePi,
  faceOf,
  isCandyLover,
  isLitPumpkin,
  lightCheck,
  litClass,
  nogCheck,
  parseSeasonDate,
  pieEatGate,
  placeCheck,
  pumpkinTreat,
  recordCandyEaten,
  recordCandyGiven,
  recordCarvedFace,
  recordEggFound,
  saysYay,
  seasonYearKey,
  smashOutcome,
  speechMs,
  syncCards,
  teachPhrase,
  yetiMailDue,
  yetiQuote,
} from '../seasons.js';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js';

export const SEASONS_FEATURE_ID = 'seasons';
const LANTERN_GROUP = 'seasons:lantern';
const EGG_GROUP = 'seasons:egg';
const HOME_TSIDS = new Set(['RH_HOME_EXT', 'RH_HOME_INT']);
const TALK_SIZE = { 1: [49, 47], 2: [49, 47], 3: [50, 47], 4: [48, 47], 5: [50, 55] };
const TALK_COLS = 19;
const TALK_FRAMES = 74;
// The talk sheets, egg 4 and the cracker have 3x renders from their SWFs
// (tools/vector-sprites/seasons.json, routed by js/sprite-hires.js). Eggs 1,
// 2, 3 and 5 look in the world exactly like their pack icon (same OGA pixels),
// so they draw the icon and get its 3x file from js/icon-hires.js.
const eggWorldUrl = (n) => (n === 4 ? 'assets/sprites/seasons/egghunt_egg_4_world.png' : `assets/sprites/icons/egghunt_egg_${n}.png`);
const GIVE_RANGE = 260;
const HELPER_NAMES = { npc_piggy: 'Piggy', npc_chicken: 'Chicken', npc_butterfly: 'Butterfly' };
const RECIPIENT_LINES = Object.freeze({
  npc_piggy: ['The Piggy crunches the candy, wrapper and all.', 'The Piggy snuffles the candy down in one go.'],
  npc_chicken: ['The Chicken pecks the candy into a hundred pieces, then eats every one.'],
  npc_butterfly: ['The Butterfly sips politely at the candy. Then less politely.'],
  street_spirit: ['The Street Spirit pops the candy in its mouth. "Ooh, zingy."'],
});

let state = createSeasonState();
let season = { ids: [], primary: null, via: 'none' };
let lastCheck = 0;
let last = '';
let spawnedFor = null;
let decor = []; // { kind, sprite, target?, glow?, t, ... }
let fx = [];
let snow = null;
let chip = null;
let carving = null; // { until, step, face?, toolSprite }
let cracker = null; // { waitingSince, sprite }
let pendingBoosts = []; // { at, candy, recipient }
let questOfferAt = 0;
let autoplayAt = 0;
let autoplayStep = 0;
let autoplayLog = [];
let demoDone = false;
let engineRef = null;
const textures = new Map();

const dayKey = () => getGameDayKey(Date.now());
const isOn = (id) => season.ids.includes(id);
const nowForCalendar = (engine) => parseSeasonDate(engine?.param?.('seasondate')) ?? Date.now();
const sleepyRng = Math.random;

/* --------------------------------------------------------------- helpers */

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('seasonActive', season.ids.join(',') || 'none');
  engine.setData('seasonVia', season.via);
  engine.setData('seasonDecor', decor.map((d) => d.kind).join(',') || 'none');
  engine.setData('seasonLast', last || 'none');
  engine.setData('seasonCandy', String(state.daily?.candy || 0));
  engine.setData('seasonGiftees', String(state.giftees.length));
  engine.setData('seasonFaces', state.carvedFaces.join(',') || 'none');
  engine.setData('seasonCrackers', String(state.crackersOpened));
  engine.setData('seasonEggs', Object.values(state.eggsFound).reduce((n, list) => n + list.length, 0));
  engine.setData('seasonPlaced', state.placed.map((r) => `${r.cls}@${r.tsid}`).join(',') || 'none');
}

function say(engine, msg, ok = true, effects = null) {
  last = String(msg || '').trim();
  if (effects && Object.keys(effects).length) engine.pushActivity?.({ base: last.replace(/\.$/, ''), effects });
  else engine.pushActivity?.(last);
  engine.toast?.(last, ok ? 3200 : 2600);
  engine.refreshPack?.();
  publish(engine);
}

function grant(engine, stat, amount) {
  const pc = engine.pc;
  if (!pc || !amount) return 0;
  if (stat === 'xp') {
    pc.xp = (pc.xp || 0) + amount;
    pc.imagination = (pc.imagination || 0) + amount;
    engine.updateHud?.();
    return amount;
  }
  const cap = stat === 'energy' ? Math.max(100, Number(pc.energyMax) || 100) : 100;
  const before = Math.max(0, Number(pc[stat]) || 0);
  pc[stat] = Math.max(0, Math.min(cap, before + amount));
  engine.updateHud?.();
  return Math.round(pc[stat] - before);
}

function grantAll(engine, effects) {
  const out = {};
  for (const [stat, amount] of Object.entries(effects || {})) {
    const got = grant(engine, stat, amount);
    if (got) out[stat] = got;
  }
  return out;
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

function tex(engine, url) {
  if (!textures.has(url)) textures.set(url, textureFromUrl(url));
  return textures.get(url);
}

function talkFrames(engine, face) {
  const key = `talk:${face}`;
  if (textures.has(key)) return textures.get(key);
  const [w, h] = TALK_SIZE[face] || TALK_SIZE[1];
  const base = sourceFromUrl(`assets/sprites/seasons/pumpkin_lit_${face}_talk.png`);
  const frames = [];
  for (let i = 0; i < TALK_FRAMES; i += 1) {
    const x = (i % TALK_COLS) * w;
    const y = Math.floor(i / TALK_COLS) * h;
    frames.push(frameTexture(base, new engine.PIXI.Rectangle(x, y, w, h)));
  }
  textures.set(key, frames);
  return frames;
}

function hasWorkingTool(engine, id) {
  if (countItem(engine.inv, id) < 1) return false;
  const c = getToolCondition(engine.toolState, id);
  return !c.tracked || !c.broken;
}

function jarFlies() {
  return Number(resourceNodesFeature.save()?.jar?.flies) || 0;
}

function emptyJar(engine) {
  const slice = resourceNodesFeature.save();
  resourceNodesFeature.restore({ ...slice, jar: { ...(slice.jar || {}), flies: 0 } }, engine);
}

function outdoors(engine) {
  const street = engine.street || {};
  if (HOME_TSIDS.has(engine.streetTsid) && engine.streetTsid !== 'RH_HOME_EXT') return false;
  if (engine.transientInstance?.() && engine.streetTsid !== 'RH_HOME_EXT') return false;
  if (street.physics?.setting?.jetpack || street.physics?.jetpack) return false;
  return !isBatterflyHabitat(street);
}

function nearestLover(engine, range = GIVE_RANGE) {
  const p = engine.player;
  if (!p) return null;
  let best = null;
  let bestD = range;
  for (const t of engine.interactables || []) {
    if (!t?.sprite || t.sprite.destroyed || t.sprite.visible === false) continue;
    if (!isCandyLover(t.classId) || t.rooked) continue;
    const d = Math.hypot((t.sprite.x || 0) - p.x, ((t.sprite.y || 0) - p.y) * 0.5);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

const loverKind = (t) => (/^street_spirit/.test(t.classId) ? 'street_spirit' : t.classId);
const loverName = (t) => (/^street_spirit/.test(t.classId) ? 'Street Spirit' : HELPER_NAMES[t.classId] || t.label || 'friend');
const loverKey = (engine, t) => `${engine.streetTsid}:${t.classId}:${Math.round(t.sprite?.baseX ?? t.sprite?.x ?? 0)}`;

/* ------------------------------------------------------------ season state */

function refreshSeason(engine, force = false) {
  const now = Date.now();
  if (!force && now - lastCheck < 2000) return false;
  lastCheck = now;
  const calendarNow = nowForCalendar(engine);
  const next = activeSeasons(calendarNow, {
    override: engine.param?.('season') || '',
    dametime: dametimeParts(now),
  });
  const before = season.ids.join(',');
  season = next;
  if (before === next.ids.join(',') && !force) return false;
  const was = state.lastActive || [];
  for (const id of next.ids) {
    if (!was.includes(id) && engine.started) say(engine, `${SEASONS[id].label} has come to Ur!`);
  }
  if (was.includes('zilloween') && !next.ids.includes('zilloween')) rotPumpkins(engine);
  state.lastActive = [...next.ids];
  renderChip(engine);
  return true;
}

function rotPumpkins(engine) {
  const inv = engine.inv;
  let any = false;
  for (const cls of PUMPKIN_CLASSES) {
    const n = countItem(inv, cls);
    if (!n) continue;
    removeItem(inv, cls, n);
    for (const [id, qty] of smashOutcome(cls).items) addItem(inv, id, qty * n);
    any = true;
  }
  for (const row of state.placed) {
    for (const [id, qty] of smashOutcome(row.cls).items) addItem(inv, id, qty);
    any = true;
  }
  state.placed = [];
  state.pumpkinPhrases = {};
  if (any) {
    clearDecor(engine, (d) => d.kind === 'placed');
    say(engine, SOURCE_LINES.rot);
    engine.save?.();
  }
}

/* --------------------------------------------------------------- season chip */

function renderChip(engine) {
  if (typeof document === 'undefined') return;
  const plate = document.getElementById('street-nameplate');
  if (!plate) return;
  if (!chip) {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'season-chip';
    chip.addEventListener('click', () => openSeasonCard(engineRef));
    if (!document.getElementById('season-chip-style')) {
      const style = document.createElement('style');
      style.id = 'season-chip-style';
      style.textContent = `
.season-chip { display: inline-flex; align-items: center; gap: 0.3rem; margin-left: 0.45rem; padding: 0.05rem 0.5rem 0.05rem 0.2rem; border: 1px solid #e0c88f; border-radius: 999px; background: #fff6e0; color: #7a4a12; font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer; vertical-align: middle; }
.season-chip[data-season="glitchmas"] { background: #eef8ff; border-color: #a9cde8; color: #1f5a82; }
.season-chip[data-season="egg_hunt"] { background: #f7f0ff; border-color: #cdb7ec; color: #5b3a8a; }
.season-chip[data-season="pi_day"] { background: #eefaf0; border-color: #a7d6b0; color: #2f6a3a; }
.season-chip img { width: 18px; height: 18px; object-fit: contain; }
.season-chip:hover { filter: brightness(1.04); }
@media (max-width: 640px) { .season-chip span { display: none; } .season-chip { padding-right: 0.2rem; } }
.season-card-list { margin: 0.4rem 0 0; padding-left: 1.1rem; font-size: 0.86rem; line-height: 1.45; color: #4a3f2a; }
`;
      document.head.appendChild(style);
    }
    plate.appendChild(chip);
  }
  const id = season.primary;
  chip.hidden = !id;
  if (!id) return;
  const def = SEASONS[id];
  const left = daysLeft(id, nowForCalendar(engine));
  chip.dataset.season = id;
  chip.title = `${def.label}${season.via === 'dametime' ? ' (Dametime)' : ''}${left != null ? `: ${left === 0 ? 'last day' : `${left} day${left === 1 ? '' : 's'} left`}` : ''}. Click for what is on.`;
  chip.innerHTML = `<img src="assets/sprites/icons/${def.icon}.png" alt=""><span>${def.label}</span>`;
}

function seasonTodo(id) {
  if (id === 'zilloween') {
    return [
      'Trick or treat at a street Jack-O-Lantern once a day.',
      'Carve a Pumpkin from your pack (Pick and Knife & Board, 15 energy): 5 Pepitas, a Clump of Jellisac and a face.',
      'Light a carved pumpkin with a full Firefly Jar, then Place it at home.',
      'Eat candy for a Sugar Rush (eleven a day before the toothache).',
      'Give candy to Piggies, Chickens, Butterflies and Street Spirits.',
      'Pumpkin Seeds only grow now. Carved pumpkins rot when Zilloween ends.',
    ];
  }
  if (id === 'glitchmas') {
    return [
      'The Toy Vendor stocks Glitchmas Crackers and Glitchmas Cards.',
      'Pull a cracker next to a Piggy, Chicken, Butterfly or Street Spirit.',
      'Sign a card and mail it. Nog an Egg once a day for 11 iMG.',
      'Somebody would like to hear you say "yay" in local chat.',
    ];
  }
  if (id === 'egg_hunt') return ['Chocolate eggs are hidden on about half the streets.', 'Find all five kinds for the Egg Hunter Trophy.', 'Each egg gives a Chocolate High (and a Sugar Crash after).'];
  if (id === 'pi_day') return ['Cook Pi with a Frying Pan.', 'Estimate Pi from your pack: the year\'s first estimate pays favor with Tii.'];
  return [];
}

function openSeasonCard(engine) {
  const id = season.primary;
  if (!id || !engine) return;
  const def = SEASONS[id];
  const sourceNote = def.source === 'source'
    ? 'Recovered from the original game.'
    : def.source === 'reconstructed'
      ? 'The original items survive; how the hunt worked was lost, so this is a rebuild.'
      : 'Written for this remake.';
  const wrap = openNoteView({
    kicker: 'Holiday',
    title: def.label,
    body: `${def.blurb}\n\nOn ${def.window}.`,
    byline: sourceNote,
  });
  const body = wrap?.querySelector?.('.note-body');
  if (body) {
    const list = document.createElement('ul');
    list.className = 'season-card-list';
    for (const line of seasonTodo(id)) {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    }
    body.after(list);
  }
}

/* ------------------------------------------------------------- decorations */

function clearDecor(engine, pred = () => true) {
  const keep = [];
  for (const d of decor) {
    if (!pred(d)) {
      keep.push(d);
      continue;
    }
    if (d.target) engine.unregister?.(d.target);
    else if (d.sprite && !d.sprite.destroyed) d.sprite.destroy({ children: true });
    if (d.glow && !d.glow.destroyed) d.glow.destroy();
    if (d.extra && !d.extra.destroyed) d.extra.destroy({ children: true });
  }
  decor = keep;
}

function clearSnow() {
  if (snow?.root && !snow.root.destroyed) snow.root.destroy({ children: true });
  snow = null;
}

function groundAt(engine, x, refY) {
  return landingY(engine.platforms, x, (refY ?? engine.groundY) - 60)
    ?? nearestSurfaceY(engine.platforms, x, refY ?? engine.groundY)
    ?? engine.groundY;
}

function makeGlow(engine, x, y, color = 0xffb347, radius = 46) {
  const g = new engine.PIXI.Graphics();
  for (let i = 5; i >= 1; i -= 1) {
    g.circle(0, 0, (radius * i) / 5).fill({ color: color, alpha: 0.05 + (5 - i) * 0.012 });
  }
  g.x = x;
  g.y = y;
  g.blendMode = 'add';
  g.zIndex = 4;
  engine.entityLayer.addChild(g);
  return g;
}

function lanternCount(engine) {
  const w = engine.worldW || 2000;
  return Math.max(1, Math.min(3, Math.round(w / 1300)));
}

function spawnLantern(engine, pt, index) {
  const { PIXI } = engine;
  const face = ((index + String(engine.streetTsid).length) % 5) + 1;
  const y = groundAt(engine, pt.x, pt.y);
  const spr = new PIXI.AnimatedSprite(talkFrames(engine, face));
  spr.anchor.set(0.5, 1);
  spr.x = pt.x;
  spr.y = y + 3;
  spr.zIndex = 6;
  spr.animationSpeed = 0.5;
  spr.loop = true;
  spr.gotoAndStop(0);
  spr._worldHitW = 70;
  spr._worldHitH = 70;
  engine.entityLayer.addChild(spr);
  const glow = makeGlow(engine, spr.x, y - 22);
  const target = engine.register({
    classId: litClass(face),
    featureId: SEASONS_FEATURE_ID,
    label: 'Jack-O-Lantern',
    subtitle: dailyRow(state, dayKey()).treats[engine.streetTsid] ? 'Already treated you today' : 'Trick or treat?',
    sprite: spr,
    seasonDecor: 'lantern',
  });
  decor.push({ kind: 'lantern', sprite: spr, target, glow, t: index * 1.7, face, talkUntil: 0, nextTalk: Date.now() + 4000 + index * 2500 });
}

function spawnGhost(engine) {
  const { PIXI } = engine;
  const spr = new PIXI.Sprite(textureFromUrl('assets/decos/groddle/background_ghost_transparent.png'));
  spr.anchor.set(0.5, 1);
  spr.scale.set(0.42);
  spr.alpha = 0.16;
  const w = engine.worldW || 2000;
  spr.x = w * (0.3 + ((String(engine.streetTsid).charCodeAt(3) || 7) % 5) * 0.1);
  spr.y = (engine.groundY || 600) - 260;
  spr.zIndex = 1;
  engine.entityLayer.addChild(spr);
  decor.push({ kind: 'ghost', sprite: spr, t: 0, baseX: spr.x, baseY: spr.y });
}

function spawnCandyCanes(engine) {
  const street = engine.street || {};
  const posts = street.signposts || [];
  const l = street.bounds?.l || 0;
  const t = street.bounds?.t || 0;
  posts.slice(0, 6).forEach((post, i) => {
    const sx = post.x - l + (i % 2 ? 58 : -58);
    const sy = groundAt(engine, sx, post.y - t);
    const spr = new engine.PIXI.Sprite(textureFromUrl('assets/decos/groddle/bling_candycane_1.png'));
    spr.anchor.set(0.5, 1);
    spr.scale.set(0.3);
    if (i % 2) spr.scale.x = -0.3;
    spr.x = sx;
    spr.y = sy + 4;
    spr.zIndex = 3;
    engine.entityLayer.addChild(spr);
    decor.push({ kind: 'candycane', sprite: spr, t: i });
  });
}

function startSnow(engine) {
  clearSnow();
  const { PIXI } = engine;
  const root = new PIXI.Container();
  root.eventMode = 'none';
  const cam = engine.camera || { w: 960, h: 408 };
  const flakes = [];
  for (let i = 0; i < 46; i += 1) {
    const g = new PIXI.Graphics();
    const r = 1.2 + Math.random() * 2.2;
    g.setFillStyle({ color: 0xffffff, alpha: 0.55 + Math.random() * 0.35 });
    g.circle(0, 0, r).fill();
    g.x = Math.random() * cam.w;
    g.y = Math.random() * cam.h;
    root.addChild(g);
    flakes.push({ g, vy: 18 + r * 9, sway: Math.random() * 6.28, amp: 6 + Math.random() * 10 });
  }
  const stage = engine.stage;
  if (!stage) return;
  stage.addChild(root);
  snow = { root, flakes, w: cam.w, h: cam.h };
}

function tickSnow(dtMs) {
  if (!snow) return;
  const dt = Math.min(0.1, dtMs / 1000);
  for (const f of snow.flakes) {
    f.sway += dt * 1.3;
    f.g.y += f.vy * dt;
    f.g.x += Math.sin(f.sway) * f.amp * dt;
    if (f.g.y > snow.h + 6) {
      f.g.y = -6;
      f.g.x = Math.random() * snow.w;
    }
    if (f.g.x < -6) f.g.x = snow.w + 4;
    if (f.g.x > snow.w + 6) f.g.x = -4;
  }
}

function spawnEgg(engine, cls, pt) {
  const { PIXI } = engine;
  const n = EGG_CLASSES.indexOf(cls) + 1;
  const y = groundAt(engine, pt.x, pt.y);
  const spr = new PIXI.Sprite(textureFromUrl(eggWorldUrl(n)));
  spr.anchor.set(0.5, 1);
  spr.x = pt.x;
  spr.y = y + 2;
  spr.zIndex = 9;
  spr._worldHitW = 46;
  spr._worldHitH = 40;
  engine.entityLayer.addChild(spr);
  const sparkle = new PIXI.Graphics();
  for (const [dx, dy] of [[0, -9], [7, 0], [0, 9], [-7, 0]]) {
    sparkle.moveTo(0, 0);
    sparkle.lineTo(dx * 0.25 + dy * 0.12, dy * 0.25 + dx * 0.12);
    sparkle.lineTo(dx, dy);
    sparkle.lineTo(dx * 0.25 - dy * 0.12, dy * 0.25 - dx * 0.12);
  }
  sparkle.fill({ color: 0xfff6b0, alpha: 0.9 });
  sparkle.x = spr.x + 10;
  sparkle.y = spr.y - 22;
  sparkle.zIndex = 10;
  engine.entityLayer.addChild(sparkle);
  const target = engine.register({
    classId: cls,
    featureId: SEASONS_FEATURE_ID,
    label: ITEM_CATALOG[cls]?.label || 'Chocolate Egg',
    subtitle: 'Something sweet in the grass',
    sprite: spr,
    seasonDecor: 'egg',
  });
  decor.push({ kind: 'egg', sprite: spr, target, extra: sparkle, t: 0, cls });
}

function spawnPlaced(engine, row) {
  const { PIXI } = engine;
  const lit = isLitPumpkin(row.cls);
  const y = groundAt(engine, row.x, row.y);
  const spr = lit ? new PIXI.AnimatedSprite(talkFrames(engine, faceOf(row.cls))) : new PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${row.cls}.png`));
  spr.anchor.set(0.5, 1);
  spr.x = row.x;
  spr.y = y + 3;
  spr.zIndex = 6;
  if (lit) {
    spr.animationSpeed = 0.5;
    spr.gotoAndStop(0);
  }
  engine.entityLayer.addChild(spr);
  const glow = lit ? makeGlow(engine, spr.x, y - 22) : null;
  const target = engine.register({
    classId: row.cls,
    featureId: SEASONS_FEATURE_ID,
    label: ITEM_CATALOG[row.cls]?.label || 'Pumpkin',
    subtitle: lit ? `${(row.phrases || []).length} phrase${(row.phrases || []).length === 1 ? '' : 's'} learned` : 'Carved for Zilloween',
    sprite: spr,
    placedId: row.id,
  });
  decor.push({ kind: 'placed', sprite: spr, target, glow, t: Math.random() * 6, row, talkUntil: 0, lastMessage: 0 });
}

function spawnAll(engine) {
  spawnedFor = engine.streetTsid;
  clearDecor(engine);
  clearSnow();
  if (!engine.street) return publish(engine);
  const inHome = HOME_TSIDS.has(engine.streetTsid);
  // Interiors (the Jethimadh Tower Base corridors and rooms) and source-empty
  // streets (the Stoot memorial, puzzle courses) get no lanterns, eggs or canes.
  const bare = Boolean(engine.population?.interior || engine.population?.sourceEmpty);
  const blocked = (engine.transientInstance?.() || bare) && !inHome;
  if (!blocked && !inHome) {
    if (isOn('zilloween')) {
      const points = engine.placement(LANTERN_GROUP) || [];
      const n = lanternCount(engine);
      const pts = points.length ? points.slice(0, n) : fallbackPoints(engine, n);
      pts.forEach((pt, i) => spawnLantern(engine, pt, i));
      if (outdoors(engine)) spawnGhost(engine);
    }
    if (isOn('glitchmas')) {
      spawnCandyCanes(engine);
      if (outdoors(engine)) startSnow(engine);
    }
    if (isOn('egg_hunt')) {
      const yearKey = seasonYearKey('egg_hunt', nowForCalendar(engine));
      // &seasonegg=1..5 hides that egg here for QA.
      const forced = Number(engine.param?.('seasonegg')) || 0;
      const cls = forced >= 1 && forced <= 5 ? EGG_CLASSES[forced - 1] : eggForStreet(engine.streetTsid, yearKey);
      if (cls && !eggFound(state, yearKey, engine.streetTsid)) {
        const pt = (engine.placement(EGG_GROUP) || [])[0] || fallbackPoints(engine, 1)[0];
        if (pt) spawnEgg(engine, cls, pt);
      }
    }
  }
  if (inHome && isOn('glitchmas') && engine.streetTsid === 'RH_HOME_EXT') startSnow(engine);
  for (const row of state.placed) if (row.tsid === engine.streetTsid) spawnPlaced(engine, row);
  previewAt(engine);
  publish(engine);
}

/** QA: &seasonpreview=lantern|ghost|candycane|egg|placed stands the avatar beside that decoration once. */
let previewDone = false;
function previewAt(engine) {
  const kind = engine.param?.('seasonpreview');
  if (!kind || previewDone || !engine.player) return;
  const d = decor.find((x) => x.kind === kind);
  if (!d?.sprite) return;
  previewDone = true;
  engine.player.x = d.sprite.x - 90;
  engine.player.y = groundAt(engine, engine.player.x, d.sprite.y) - 2;
  engine.player.vx = 0;
  engine.player.vy = 0;
  engine.snapCamera?.();
}

function fallbackPoints(engine, n) {
  const w = engine.worldW || 2000;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const x = Math.round(w * ((i + 1) / (n + 1)) + 37);
    out.push({ x, y: groundAt(engine, x, engine.groundY) });
  }
  return out;
}

/* ---------------------------------------------------------------- pumpkins */

function startCarve(engine) {
  const check = carveCheck({
    zilloween: isOn('zilloween'),
    carving: Boolean(carving),
    hasPick: hasWorkingTool(engine, 'pick') || hasWorkingTool(engine, 'fancy_pick'),
    hasKnife: hasWorkingTool(engine, 'knife_and_board'),
    energy: engine.pc?.energy,
  });
  if (!check.ok) return say(engine, check.msg, false), true;
  if (countItem(engine.inv, 'pumpkin') < 1) return say(engine, 'You need a Pumpkin to carve.', false), true;
  const pick = hasWorkingTool(engine, 'pick') ? 'pick' : 'fancy_pick';
  const fast = engine.param?.('seasonautoplay') ? 0.35 : 1;
  carving = { step: 0, until: Date.now() + CARVE.stepMs[0] * fast, fast, tool: pick, toolSprite: null };
  showToolOverHead(engine, pick);
  engine.playSound?.('PICK', { volume: 0.5 });
  say(engine, 'You start carving the pumpkin.');
  return true;
}

function showToolOverHead(engine, tool) {
  if (carving?.toolSprite && !carving.toolSprite.destroyed) carving.toolSprite.destroy();
  const spr = new engine.PIXI.Sprite(textureFromUrl(`assets/sprites/icons/${tool}.png`));
  spr.anchor.set(0.5);
  spr.zIndex = 40;
  engine.fxLayer?.addChild(spr);
  if (carving) carving.toolSprite = spr;
}

function tickCarve(engine, now) {
  if (!carving) return;
  const p = engine.player;
  const spr = carving.toolSprite;
  if (spr && !spr.destroyed && p) {
    spr.x = p.x + 6;
    spr.y = (p.y || 0) - 120 + Math.sin(now / 90) * 4;
    spr.rotation = Math.sin(now / 70) * 0.5;
  }
  if (now < carving.until) return;
  if (carving.step === 0) {
    carving.step = 1;
    carving.until = now + CARVE.stepMs[1] * carving.fast;
    showToolOverHead(engine, 'knife_and_board');
    engine.playSound?.('KNIFE_AND_BOARD', { volume: 0.5 });
    return;
  }
  if (carving.toolSprite && !carving.toolSprite.destroyed) carving.toolSprite.destroy();
  carving = null;
  if (countItem(engine.inv, 'pumpkin') < 1) return;
  const out = carveOutcome(sleepyRng);
  removeItem(engine.inv, 'pumpkin', 1);
  for (const [id, qty] of out.outputs) addItem(engine.inv, id, qty);
  const effects = grantAll(engine, out.effects);
  if (isOn('zilloween')) {
    engine.achievement?.(out.counter, 1);
    if (recordCarvedFace(state, out.face)) engine.grantAchievement?.('pumpkin_carver');
  }
  state.stats.carved = (state.stats.carved || 0) + 1;
  burst(engine, 0xffa53a);
  say(engine, out.growl, true, effects);
  engine.save?.();
}

function lightPumpkin(engine, cls) {
  const check = lightCheck(jarFlies());
  if (!check.ok) return say(engine, check.msg, false), true;
  if (countItem(engine.inv, cls) < 1) return true;
  removeItem(engine.inv, cls, 1);
  const lit = litClass(faceOf(cls));
  addItem(engine.inv, lit, 1);
  emptyJar(engine);
  const effects = grantAll(engine, { energy: -LIGHT.energy, mood: LIGHT.mood, xp: LIGHT.xp });
  engine.achievement?.(`VERB:light:${cls}`, 1);
  burst(engine, 0xffe27a);
  say(engine, `You lit ${ITEM_CATALOG[cls]?.label || 'the pumpkin'} with seven Fireflies.`, true, effects);
  engine.save?.();
  return true;
}

function smashPumpkin(engine, cls) {
  const out = smashOutcome(cls);
  if (!out || countItem(engine.inv, cls) < 1) return true;
  removeItem(engine.inv, cls, 1);
  for (const [id, qty] of out.items) addItem(engine.inv, id, qty);
  if (isLitPumpkin(cls)) delete state.pumpkinPhrases[cls];
  engine.playSound?.('ITEM_DROP', { volume: 0.5 });
  burst(engine, 0xff9a2a);
  say(engine, out.line);
  engine.save?.();
  return true;
}

function placePumpkin(engine, cls) {
  const ctx = engine.homeContext?.() || {};
  const check = placeCheck({ inHome: ctx.inHome || HOME_TSIDS.has(engine.streetTsid), partySpace: false });
  if (!check.ok) return say(engine, check.msg, false), true;
  if (countItem(engine.inv, cls) < 1) return true;
  const p = engine.player;
  const x = Math.round((p?.x || 0) + 80 * (p?.scale?.x < 0 ? -1 : 1));
  const row = {
    id: `pk${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    cls,
    tsid: engine.streetTsid,
    x,
    y: Math.round(p?.y || engine.groundY),
    phrases: isLitPumpkin(cls) ? [...(state.pumpkinPhrases[cls] || [])] : [],
  };
  removeItem(engine.inv, cls, 1);
  if (isLitPumpkin(cls)) delete state.pumpkinPhrases[cls];
  state.placed.push(row);
  spawnPlaced(engine, row);
  if (isOn('zilloween')) engine.achievement?.(`pumpkins_placed:${isLitPumpkin(cls) ? 'lit' : 'carved'}`, 1);
  engine.playSound?.('ITEM_DROP', { volume: 0.5 });
  say(engine, `You placed ${ITEM_CATALOG[cls]?.label || 'the pumpkin'}.`);
  engine.save?.();
  return true;
}

function teachDialog(engine, phrases, onDone) {
  const list = phrases;
  const forget = list.map((phrase, i) => ({
    label: `Forget "${phrase.length > 20 ? `${phrase.slice(0, 20)}...` : phrase}"`,
    onClick: () => {
      list.splice(i, 1);
      onDone();
      say(engine, SOURCE_LINES.forgot);
      teachDialog(engine, list, onDone);
    },
  }));
  openNoteView({
    kicker: 'Jack-O-Lantern',
    title: list.length >= 3 ? SOURCE_LINES.teachFull : list.length ? SOURCE_LINES.teachMore : SOURCE_LINES.teachAsk,
    body: list.length ? list.map((p) => `"${p}"`).join('\n') : 'It does not know any phrases yet.',
    editable: list.length < 3,
    editTitle: 'A witty phrase',
    editBody: '',
    maxTitle: 30,
    maxBody: 150,
    extra: forget,
    onSave: (_title, body) => {
      const res = teachPhrase(list, body);
      if (!res.ok) return res.msg || 'Type a phrase first.';
      onDone();
      say(engine, res.msg);
      return true;
    },
  });
}

/* ------------------------------------------------------------------ candy */

function giveCandy(engine, cls) {
  const lover = nearestLover(engine);
  if (!lover) return say(engine, 'Nobody nearby to give candy to. Find a Piggy, Chicken, Butterfly or Street Spirit.', false), true;
  if (countItem(engine.inv, cls) < 1) return true;
  removeItem(engine.inv, cls, 1);
  const name = loverName(lover);
  if (isOn('zilloween')) {
    const res = recordCandyGiven(state, loverKey(engine, lover));
    if (res.fresh) engine.achievement?.(`zilloween_candy_given:${loverKey(engine, lover)}`, 1);
    for (const id of res.badges) engine.grantAchievement?.(id);
  }
  pendingBoosts.push({ at: Date.now() + 1400, candy: cls, recipient: lover, name });
  engine.say?.(lover, 'Ooh! Candy!', 1600);
  say(engine, `You gave ${ITEM_CATALOG[cls]?.label || 'candy'} to a ${name}.`);
  engine.save?.();
  return true;
}

function tickBoosts(engine, now) {
  if (!pendingBoosts.length) return;
  const due = pendingBoosts.filter((b) => b.at <= now);
  pendingBoosts = pendingBoosts.filter((b) => b.at > now);
  for (const b of due) {
    const pool = RECIPIENT_LINES[loverKind(b.recipient)] || RECIPIENT_LINES.npc_piggy;
    if (b.recipient?.sprite && !b.recipient.sprite.destroyed) engine.say?.(b.recipient, '*munch munch*', 1800);
    // zilloweenBoostCheck: eaten inside 30 seconds of the gift.
    const effects = { mood: grant(engine, 'mood', TREATER_BOOST.mood) };
    say(engine, `${pool[Math.floor(Math.random() * pool.length)]} ${SOURCE_LINES.candyEaten}`, true, effects);
  }
}

/* -------------------------------------------------------------- Glitchmas */

function syncNotes(engine) {
  state.notes ||= [];
  for (const cls of ['glitchmas_cracker_joke', 'glitchmas_cracker_factoid']) {
    const have = countItem(engine.inv, cls);
    const rows = state.notes.filter((n) => n.cls === cls);
    while (rows.length > have) {
      const r = rows.pop();
      state.notes.splice(state.notes.indexOf(r), 1);
    }
    while (rows.length < have) {
      const n = crackerNote(cls === 'glitchmas_cracker_joke' ? () => 0.1 : () => 0.9);
      const row = { cls, title: n.title, body: n.body };
      rows.push(row);
      state.notes.push(row);
    }
  }
}

function pullCracker(engine) {
  if (cracker) return say(engine, SOURCE_LINES.crackerAlready, false), true;
  if (countItem(engine.inv, 'glitchmas_cracker') < 1) return true;
  const helper = nearestLover(engine, CRACKER.helpRange);
  cracker = { waitingSince: Date.now(), sprite: null };
  const spr = new engine.PIXI.Sprite(textureFromUrl('assets/sprites/seasons/glitchmas_cracker_world.png'));
  spr.anchor.set(0.5);
  spr.zIndex = 40;
  engine.fxLayer?.addChild(spr);
  cracker.sprite = spr;
  if (helper) return popCracker(engine, helper), true;
  say(engine, SOURCE_LINES.crackerWait);
  return true;
}

function stopWaiting(engine) {
  if (cracker?.sprite && !cracker.sprite.destroyed) cracker.sprite.destroy();
  cracker = null;
  say(engine, SOURCE_LINES.crackerAway);
  return true;
}

function popCracker(engine, helper) {
  if (!cracker) return;
  cracker.helper = helper;
  cracker.popAt = Date.now() + (engine.param?.('seasonautoplay') ? 500 : 1100);
  engine.say?.(helper, 'One, two, three... PULL!', 1400);
}

function tickCracker(engine, now) {
  if (!cracker) return;
  const p = engine.player;
  const spr = cracker.sprite;
  if (spr && !spr.destroyed && p) {
    const h = cracker.helper?.sprite;
    if (h && !h.destroyed) {
      spr.x = (p.x + h.x) / 2;
      spr.y = Math.min(p.y, h.y) - 70 + Math.sin(now / 60) * 3;
      spr.rotation = Math.sin(now / 45) * 0.15;
    } else {
      spr.x = p.x;
      spr.y = (p.y || 0) - 140;
    }
  }
  if (!cracker.helper) {
    const helper = nearestLover(engine, 150);
    if (helper) popCracker(engine, helper);
    return;
  }
  if (now < cracker.popAt) return;
  const helper = cracker.helper;
  if (spr && !spr.destroyed) spr.destroy();
  cracker = null;
  if (!removeItem(engine.inv, 'glitchmas_cracker', 1)) return;
  engine.playSound?.('GLITCHMAS_CRACKER', { volume: 0.7 });
  burst(engine, 0xff5a5a, 22);
  burst(engine, 0x7ad37a, 12);
  // crackerPull: the helper gets the joke or fun fact (a critter cannot read, so it hands it to you); the owner gets the toy.
  const note = crackerNote(sleepyRng);
  addItem(engine.inv, note.classTsid, 1);
  state.notes ||= [];
  state.notes.push({ cls: note.classTsid, title: note.title, body: note.body });
  const name = loverName(helper);
  engine.say?.(helper, 'POP!', 1600);
  const result = rollDropTable(CRACKER.table, sleepyRng);
  const paid = payDrop(engine, result, { source: 'glitchmas_cracker' });
  state.crackersOpened += 1;
  engine.achievement?.(CRACKER.counter, 1);
  say(engine, `POP! The ${name} helped pull your Glitchmas Cracker and handed you the ${note.classTsid === 'glitchmas_cracker_joke' ? 'joke' : 'fun fact'}.${paid.lines?.length ? ' Merry Glitchmas!' : ''}`);
  engine.save?.();
}

function readNote(engine, cls) {
  syncNotes(engine);
  const row = state.notes.find((n) => n.cls === cls);
  if (!row) return true;
  openNoteView({
    kicker: ITEM_CATALOG[cls]?.label || 'Glitchmas Cracker',
    title: row.title,
    body: row.body,
    byline: cls === 'glitchmas_cracker_joke' ? 'Found in a Glitchmas Cracker' : 'Found in a Glitchmas Cracker. Possibly even true.',
  });
  return true;
}

function cardRow(engine) {
  syncCards(state, countItem(engine.inv, 'glitchmas_card'));
  return state.cards.find((c) => !c.signed) || state.cards[0] || null;
}

function readCard(engine) {
  syncCards(state, countItem(engine.inv, 'glitchmas_card'));
  const card = state.cards.find((c) => c.signed) || state.cards[0];
  if (!card) return true;
  const poem = SEASON_DATA.cardPoems[card.poem] || SEASON_DATA.cardPoems[0];
  openNoteView({
    kicker: 'Glitchmas Card',
    title: poem.title,
    body: `${poem.contents}${card.message ? `\n\n${card.message}` : ''}`,
    byline: card.signed ? `Signed by ${card.from || 'you'}` : 'Not signed yet',
  });
  return true;
}

function signCard(engine) {
  const card = cardRow(engine);
  if (!card) return true;
  const poem = SEASON_DATA.cardPoems[card.poem] || SEASON_DATA.cardPoems[0];
  openNoteView({
    kicker: 'Glitchmas Card · Sign',
    title: poem.title,
    body: poem.contents,
    editable: true,
    startEdit: false,
    editTitle: poem.title,
    editBody: '',
    maxBody: 300,
    onSave: (_title, body) => {
      card.message = String(body || '').trim().slice(0, 300);
      card.signed = true;
      card.from = engine.pc?.name || 'you';
      say(engine, 'You signed the Glitchmas Card. Mail it to someone nice.');
      engine.save?.();
      return true;
    },
  });
  return true;
}

function offerHolidayQuest(engine) {
  const key = seasonYearKey('glitchmas', nowForCalendar(engine));
  if (state.holidayQuest[key]) return false;
  const q = SEASON_DATA.holidayQuest;
  const [beat1, beat2] = String(q.offer).split(/<split butt_txt="([^"]*)"\s*\/?>/).filter((_, i) => i !== 1);
  const response = String(q.offer).match(/<split butt_txt="([^"]*)"/)?.[1] || 'OK …';
  engine.offerQuestDialogue?.({
    title: q.title,
    kicker: 'Magic Rock',
    beats: [{ text: beat1, response }, { text: beat2, response: 'Yay?' }],
    acceptLabel: 'Yay?',
    declineLabel: 'Not right now',
    onAccept: () => {
      state.holidayQuest[key] = 'offered';
      say(engine, `${q.title}: ${q.desc}`);
      engine.save?.();
    },
    onDecline: () => {
      questOfferAt = Date.now() + 10 * 60 * 1000;
    },
  });
  return true;
}

function completeHolidayQuest(engine) {
  const key = seasonYearKey('glitchmas', nowForCalendar(engine));
  if (state.holidayQuest[key] !== 'offered') return false;
  state.holidayQuest[key] = 'done';
  const q = SEASON_DATA.holidayQuest;
  const mood = grant(engine, 'mood', q.rewards.mood);
  addItem(engine.inv, 'glitchmas_present', 1);
  engine.playSound?.('QUEST_COMPLETE', { volume: 0.6 });
  engine.prompt?.({ title: q.title, kicker: 'Quest complete', text: q.completion });
  say(engine, `${q.title} complete`, true, { mood });
  engine.save?.();
  return true;
}

function onChatSubmit(event) {
  const form = event.target;
  if (!form || form.id !== 'local-chat-form' || !engineRef) return;
  const text = document.getElementById('local-chat-input')?.value || '';
  if (isOn('glitchmas') && saysYay(text)) setTimeout(() => completeHolidayQuest(engineRef), 300);
}

/* ------------------------------------------------------------------- misc */

function burst(engine, color, n = 14) {
  const p = engine.player;
  if (!p || !engine.fxLayer) return;
  const { PIXI } = engine;
  for (let i = 0; i < n; i += 1) {
    const g = new PIXI.Graphics();
    g.circle(0, 0, 2 + Math.random() * 3).fill({ color: color, alpha: 0.95 });
    g.x = p.x;
    g.y = (p.y || 0) - 70;
    engine.fxLayer.addChild(g);
    const a = Math.random() * Math.PI * 2;
    const v = 1.5 + Math.random() * 3.5;
    fx.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.5, life: 900 });
  }
}

function tickFx(dtMs) {
  if (!fx.length) return;
  const k = dtMs / 16.67;
  for (const f of fx) {
    f.life -= dtMs;
    f.g.x += f.vx * k;
    f.g.y += f.vy * k;
    f.vy += 0.15 * k;
    f.g.alpha = Math.max(0, f.life / 900);
    if (f.life <= 0 && !f.g.destroyed) f.g.destroy();
  }
  fx = fx.filter((f) => f.life > 0);
}

function lanternSpeak(engine, d, text, now) {
  d.talkUntil = now + speechMs(text);
  if (d.sprite && !d.sprite.destroyed && d.sprite.play) {
    d.sprite.gotoAndPlay(0);
  }
  if (d.target) engine.say?.(d.target, text, speechMs(text) + 250);
}

function tickDecor(engine, dtMs, now) {
  const p = engine.player;
  for (const d of decor) {
    d.t += dtMs / 1000;
    if (d.glow && !d.glow.destroyed) d.glow.alpha = 0.75 + Math.sin(d.t * 7.3) * 0.12 + Math.sin(d.t * 13.1) * 0.08;
    if (d.kind === 'ghost' && d.sprite && !d.sprite.destroyed) {
      d.sprite.x = d.baseX + Math.sin(d.t * 0.21) * 160;
      d.sprite.y = d.baseY + Math.sin(d.t * 0.9) * 10;
      d.sprite.alpha = 0.1 + (Math.sin(d.t * 0.35) + 1) * 0.05;
    }
    if (d.kind === 'egg' && d.extra && !d.extra.destroyed) {
      const s = 0.6 + Math.max(0, Math.sin(d.t * 2.4)) * 0.7;
      d.extra.scale.set(s);
      d.extra.alpha = 0.3 + Math.max(0, Math.sin(d.t * 2.4)) * 0.7;
    }
    if ((d.kind === 'lantern' || d.kind === 'placed') && d.sprite?.stop && d.talkUntil && now > d.talkUntil) {
      d.talkUntil = 0;
      d.sprite.gotoAndStop(0);
    }
    // Home scenes always count as busy(), so only a verb, menu or dialogue pauses the chatter.
    if (!p || engine.acting?.() || engine.questDialogueOpen?.() || noteViewOpen() || !d.sprite || d.sprite.destroyed) continue;
    const near = Math.abs(p.x - d.sprite.x) < 200 && Math.abs((p.y || 0) - d.sprite.y) < 150;
    // Street lanterns mutter as you pass; placed lit pumpkins say what you taught them (every 6 s).
    if (d.kind === 'lantern' && near && now >= d.nextTalk) {
      d.nextTalk = now + PUMPKIN_SPEECH.everyMs * 2 + Math.random() * 6000;
      lanternSpeak(engine, d, STREET_LANTERN_LINES[Math.floor(Math.random() * STREET_LANTERN_LINES.length)], now);
    }
    if (d.kind === 'placed' && isLitPumpkin(d.row.cls) && (d.row.phrases || []).length && near && now - d.lastMessage > PUMPKIN_SPEECH.everyMs) {
      d.lastMessage = now;
      lanternSpeak(engine, d, d.row.phrases[Math.floor(Math.random() * d.row.phrases.length)], now);
    }
  }
}

/* ----------------------------------------------------------------------- QA */

function demoSetup(engine) {
  const demo = engine.param?.('seasondemo') || engine.param?.('seasonautoplay');
  if (demoDone || !demo) return;
  demoDone = true;
  const inv = engine.inv;
  const need = (id, n) => {
    if (countItem(inv, id) < n) addItem(inv, id, n - countItem(inv, id));
  };
  const pc = engine.pc;
  pc.energy = Math.max(Number(pc.energy) || 0, 80);
  pc.mood = Math.min(Number(pc.mood) || 0, 60);
  if (isOn('zilloween')) {
    need('pumpkin', 3);
    need('pick', 1);
    need('knife_and_board', 1);
    need('birch_candy', 4);
    need('corn_syrup_squares', 2);
    const slice = resourceNodesFeature.save();
    resourceNodesFeature.restore({ ...slice, jar: { ...(slice.jar || {}), flies: 7 } }, engine);
    need('firefly_jar', 1);
  }
  if (isOn('glitchmas')) {
    need('glitchmas_cracker', 2);
    need('glitchmas_card', 1);
    need('egg_plain', 2);
  }
  if (isOn('pi_day')) need('pi', 1);
  if (isOn('egg_hunt') && engine.param?.('seasonautoplay') === 'trophy') {
    // Four of the five eggs already found, so the street's egg completes the set.
    for (const cls of EGG_CLASSES.slice(0, 4)) {
      need(cls, 1);
      engine.achievement?.(`in_inventory:${cls}`, 1);
    }
  }
  engine.refreshPack?.();
  if (engine.param?.('seasonautoplay')) autoplayAt = Date.now() + 1800;
  publish(engine);
}

const AUTOPLAY = {
  zilloween: [['carve'], ['wait', 1600], ['carve'], ['wait', 1600], ['light'], ['eat'], ['eat'], ['give'], ['wait', 1800], ['treat'], ['hold'], ['home'], ['wait', 2600], ['place'], ['teach'], ['wait', 7000], ['done']],
  glitchmas: [['nog'], ['quest'], ['yay'], ['wait', 800], ['unwrap'], ['yeti'], ['card'], ['crack'], ['wait', 1500], ['read'], ['done']],
  egg_hunt: [['egg'], ['done']],
  pi_day: [['pi'], ['wait', 9000], ['done']],
};

function autoplay(engine, now) {
  const steps = AUTOPLAY[season.primary] || [['done']];
  const step = steps[autoplayStep];
  const mode = engine.param?.('seasonautoplay');
  if (!step || step[0] === 'done' || (step[0] === 'hold' && mode === 'hold')) {
    engine.setData('seasonAutoplay', step?.[0] === 'hold' ? 'hold' : 'done');
    engine.setData('seasonSteps', autoplayLog.join('|'));
    autoplayAt = 0;
    return;
  }
  autoplayStep += 1;
  autoplayAt = now + 700;
  const run = (cls, verb) => seasonsFeature.runPackVerb(cls, verb, engine);
  const lantern = decor.find((d) => d.kind === 'lantern');
  switch (step[0]) {
    case 'wait':
      autoplayAt = now + step[1];
      break;
    case 'carve':
      run('pumpkin', 'carve');
      autoplayAt = now + 2000;
      break;
    case 'light': {
      const cls = CARVED_CLASSES.find((c) => countItem(engine.inv, c) > 0);
      if (cls) run(cls, 'light');
      break;
    }
    case 'eat':
      seasonsFeature._eat(engine, 'birch_candy');
      break;
    case 'give': {
      const lover = nearestLover(engine, 5000);
      if (lover && engine.player) engine.player.x = lover.sprite.x - 40;
      run('corn_syrup_squares', 'give');
      break;
    }
    case 'treat':
      if (lantern && engine.player) {
        engine.player.x = lantern.sprite.x - 30;
        seasonsFeature.runVerb(lantern.target, 'treat', engine);
      }
      break;
    case 'home':
      engine.enter?.('RH_HOME_EXT', { spawnX: 900 });
      autoplayAt = now + 2500;
      break;
    case 'place': {
      const cls = LIT_CLASSES.find((c) => countItem(engine.inv, c) > 0) || CARVED_CLASSES.find((c) => countItem(engine.inv, c) > 0);
      if (cls) run(cls, 'place');
      break;
    }
    case 'teach': {
      const d = decor.find((x) => x.kind === 'placed' && isLitPumpkin(x.row.cls));
      if (d) {
        teachPhrase(d.row.phrases, 'Happy Zilloween from Groddle!');
        if (engine.player) engine.player.x = d.sprite.x - 20;
      }
      break;
    }
    case 'nog':
      run('egg_plain', 'nog');
      break;
    case 'quest':
      offerHolidayQuest(engine);
      setTimeout(() => engine.acceptOpenOffer?.(), 400);
      break;
    case 'yay':
      completeHolidayQuest(engine);
      setTimeout(() => engine.acceptOpenOffer?.(), 500);
      break;
    case 'unwrap':
      run('glitchmas_present', 'unwrap');
      break;
    case 'yeti':
      run('collectors_edition_2010_glitchmas_yeti', 'pull_string');
      break;
    case 'card': {
      const card = cardRow(engine);
      if (card) {
        card.signed = true;
        card.message = 'Happy Glitchmas from Groddle!';
      }
      break;
    }
    case 'crack': {
      const lover = nearestLover(engine, 5000);
      if (lover && engine.player) engine.player.x = lover.sprite.x - 50;
      run('glitchmas_cracker', 'pull');
      autoplayAt = now + 1200;
      break;
    }
    case 'read': {
      const cls = ['glitchmas_cracker_joke', 'glitchmas_cracker_factoid'].find((c) => countItem(engine.inv, c) > 0);
      if (cls) run(cls, 'read');
      break;
    }
    case 'egg': {
      const egg = decor.find((d) => d.kind === 'egg');
      if (egg) {
        if (engine.player) engine.player.x = egg.sprite.x - 30;
        seasonsFeature.runVerb(egg.target, 'pickup', engine);
      }
      break;
    }
    case 'pi':
      run('pi', 'estimate');
      break;
    default:
      break;
  }
  autoplayLog.push(`${step[0]}:${last.slice(0, 26)}`);
  engine.setData('seasonSteps', autoplayLog.join('|'));
  publish(engine);
}

/* ---------------------------------------------------------------- feature */

export const seasonsFeature = {
  id: SEASONS_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    for (const [id, meta] of Object.entries(SEASON_DATA.items)) {
      if (ITEM_CATALOG[id] && !PUMPKIN_CLASSES.includes(id)) continue;
      ensureItem(id, {
        label: meta.label,
        namePlural: meta.namePlural,
        desc: meta.desc,
        baseCost: meta.baseCost,
        stackMax: meta.stackMax,
        sellable: !['glitchmas_present', 'trophy_egghunt', 'collectors_edition_2010_glitchmas_yeti'].includes(id),
        tags: meta.tags,
      });
    }
    // egghunt eggs: food, base_cost 150 x energy_factor 0.33.
    for (const id of EGG_CLASSES) {
      const meta = SEASON_DATA.items[id];
      registerItemUse(id, { kind: 'food', verb: 'Eat', energy: Math.round(meta.baseCost * (meta.energyFactor || 0.33)), source: `items/${id}.js base_cost ${meta.baseCost} x energy_factor ${meta.energyFactor}` }, { label: meta.label });
    }
    const gate = (seedId, seasonId) => isOn(seasonId);
    setGardenSeasonGate(gate);
    setMasterGardenSeasonGate(gate);
    setSeasonalRecipeCheck((seasonId) => isOn(seasonId));
    if (typeof document !== 'undefined') document.addEventListener('submit', onChatSubmit, true);
    refreshSeason(engine, true);
    publish(engine);
  },

  placementGroups(population, street) {
    // Indoor hubs (street-ecology.js INTERIOR_HUBS) and source-empty streets get no street decor.
    if (!street?.tsid || !engineRef || population?.interior || population?.sourceEmpty) return [];
    refreshSeason(engineRef, true);
    const groups = [];
    if (isOn('zilloween')) groups.push({ key: LANTERN_GROUP, count: lanternCount({ worldW: (street.bounds?.r || 0) - (street.bounds?.l || 0) || 2000 }), clearance: 110 });
    if (isOn('egg_hunt')) groups.push({ key: EGG_GROUP, count: 1, clearance: 70 });
    return groups;
  },

  /** Seasonal stock in and out of the Toy Vendor. */
  vendorProfile(profile) {
    if (!profile?.offers) return null;
    const extra = [];
    for (const [id, stores] of Object.entries(SEASONAL_STOCK)) {
      if (!isOn(id)) continue;
      for (const o of stores[profile.key] || []) {
        extra.push({ classTsid: o.classTsid, label: o.label, buyPrice: o.cost, sellPrice: Math.max(1, Math.floor(o.cost * 0.66)) });
      }
    }
    const offers = profile.offers.filter((o) => !SEASONAL_ITEMS[o.classTsid] || isOn(SEASONAL_ITEMS[o.classTsid]));
    const have = new Set(offers.map((o) => o.classTsid));
    for (const o of extra) if (!have.has(o.classTsid)) offers.push(o);
    if (offers.length === profile.offers.length && !extra.length) return null;
    return { ...profile, offers };
  },

  /** Daily limits the source put on eating: candy 11, pumpkin pie 5. */
  packUseGate(classTsid) {
    if (CANDY_CLASSES.includes(classTsid)) return candyEatGate(state, dayKey());
    if (classTsid === 'pumpkin_pie') return pieEatGate(state, dayKey());
    return null;
  },

  onStreetEnter(street, engine) {
    refreshSeason(engine, true);
    demoSetup(engine);
    spawnAll(engine);
  },

  onStreetClear(engine) {
    for (const d of decor) {
      if (d.glow && !d.glow.destroyed) d.glow.destroy();
      if (d.extra && !d.extra.destroyed) d.extra.destroy({ children: true });
    }
    decor = [];
    clearSnow();
    for (const f of fx) if (!f.g.destroyed) f.g.destroy();
    fx = [];
    if (cracker?.sprite && !cracker.sprite.destroyed) cracker.sprite.destroy();
    if (cracker) cracker.sprite = null;
    if (carving?.toolSprite && !carving.toolSprite.destroyed) carving.toolSprite.destroy();
    if (carving) carving.toolSprite = null;
    spawnedFor = null;
    pendingBoosts = [];
    if (engine) engine.setData?.('seasonDecor', 'none');
  },

  onNewDay(now, engine) {
    dailyRow(state, dayKey());
    if (engine) publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (refreshSeason(engine) && engine.street) spawnAll(engine);
    if (engine.street && spawnedFor !== engine.streetTsid) spawnAll(engine);
    if (autoplayAt && now >= autoplayAt) autoplay(engine, now);
    tickCarve(engine, now);
    tickCracker(engine, now);
    tickBoosts(engine, now);
    tickDecor(engine, dtMs, now);
    tickSnow(dtMs);
    tickFx(dtMs);
    if (isOn('glitchmas') && engine.started) {
      const key = yetiMailDue(state, nowForCalendar(engine));
      if (key && SEASON_DATA.yetiMail) {
        state.yetiMail.push(key);
        engine.deliverMail?.({ sender: 'Tiny Speck', text: SEASON_DATA.yetiMail, deliveryAt: Date.now(), attachment: { classTsid: 'glitchmas_cracker', count: 1 } });
        say(engine, 'You have mail: a box from the Glitchmas Yeti.');
        engine.save?.();
      }
      const qKey = seasonYearKey('glitchmas', nowForCalendar(engine));
      if (!state.holidayQuest[qKey] && !autoplayAt && !engine.param?.('seasonautoplay') && engine.param?.('questoffer') !== 'off') {
        if (!questOfferAt) questOfferAt = now + 20_000;
        if (now >= questOfferAt && !engine.busy?.() && !engine.questOffersHeld?.()) {
          questOfferAt = now + 10 * 60 * 1000;
          offerHolidayQuest(engine);
        }
      }
    }
  },

  /** Native Eat side effects (the generic pack Eat already paid the energy). */
  onEvent(counter, amount, engine) {
    const m = String(counter).match(/^([a-z0-9_]+):eat$/);
    if (!m) return;
    seasonsFeature._afterEat(engine, m[1]);
  },

  _afterEat(engine, cls) {
    const day = dayKey();
    if (CANDY_CLASSES.includes(cls)) {
      const res = recordCandyEaten(state, day, { zilloween: isOn('zilloween'), hasRush: engine.hasBuff?.('sugar_rush') });
      if (res.counter) engine.achievement?.(res.counter, 1);
      if (res.toothache) {
        const lost = -grant(engine, 'mood', -10);
        say(engine, SOURCE_LINES.toothache(lost), false);
      } else if (res.rush === 'apply') engine.applyBuff?.('sugar_rush');
      else if (res.rush === 'extend') engine.applyBuff?.('sugar_rush', { extendMs: 120_000 });
    } else if (cls === 'pepitas') {
      engine.applyBuff?.('smug_healthy_glow');
    } else if (cls === 'pumpkin_pie') {
      dailyRow(state, day).pies += 1;
      engine.applyBuff?.('full_of_pie');
    } else if (EGG_CLASSES.includes(cls)) {
      engine.applyBuff?.('chocolate_high');
    } else return;
    engine.save?.();
    publish(engine);
  },

  /** QA: eat one item through the same path as the pack's Eat button. */
  _eat(engine, cls) {
    const gate = seasonsFeature.packUseGate(cls);
    if (gate && gate.ok === false) return say(engine, gate.msg, false);
    if (countItem(engine.inv, cls) < 1) return null;
    removeItem(engine.inv, cls, 1);
    grant(engine, 'energy', Number(ITEM_CATALOG[cls]?.baseCost) || 5);
    seasonsFeature._afterEat(engine, cls);
    last = `ate ${cls}`;
    return true;
  },

  packVerbs(classTsid, engine) {
    const rows = [];
    const z = isOn('zilloween');
    if (classTsid === 'pumpkin') {
      const check = carveCheck({
        zilloween: z,
        carving: Boolean(carving),
        hasPick: hasWorkingTool(engine, 'pick') || hasWorkingTool(engine, 'fancy_pick'),
        hasKnife: hasWorkingTool(engine, 'knife_and_board'),
        energy: engine.pc?.energy,
      });
      rows.push({ id: 'carve', label: 'Carve', enabled: check.ok, reason: check.msg || '', tooltip: 'Carve a pumpkin', primary: check.ok });
    } else if (CARVED_CLASSES.includes(classTsid)) {
      const check = lightCheck(jarFlies());
      rows.push({ id: 'light', label: 'Light', enabled: check.ok, reason: check.msg || '', tooltip: 'Light this pumpkin', primary: check.ok });
      rows.push({ id: 'smash', label: 'Smash', enabled: true, tooltip: 'Smash it' });
      rows.push({ id: 'place', label: 'Place', enabled: true, tooltip: 'Drop it on the ground' });
    } else if (LIT_CLASSES.includes(classTsid)) {
      rows.push({ id: 'teach', label: 'Teach', enabled: true, tooltip: 'Teach me a new phrase', primary: true });
      rows.push({ id: 'smash', label: 'Smash', enabled: true, tooltip: 'Smash it' });
      rows.push({ id: 'place', label: 'Place', enabled: true, tooltip: 'Drop it on the ground' });
    } else if (classTsid === 'seed_pumpkin' && !z) {
      rows.push({ id: 'lament', label: 'Lament', enabled: true, tooltip: SOURCE_LINES.lamentTooltip });
    } else if (CANDY_CLASSES.includes(classTsid)) {
      const lover = nearestLover(engine);
      rows.push({
        id: 'give',
        label: lover ? `Give to ${loverName(lover)}` : 'Give',
        enabled: Boolean(lover),
        reason: 'Stand next to a Piggy, Chicken, Butterfly or Street Spirit.',
        tooltip: z ? 'Trick or treat! Give candy away for the Tricksy-Treater badges' : 'Give candy away',
      });
    } else if (classTsid === 'glitchmas_cracker') {
      if (cracker) rows.push({ id: 'stop_waiting', label: 'Stop waiting', enabled: true, tooltip: '' });
      else rows.push({ id: 'pull', label: 'Pull', enabled: true, tooltip: 'Open the cracker!', primary: true });
    } else if (classTsid === 'glitchmas_card') {
      const unsigned = cardRow(engine);
      if (unsigned && !unsigned.signed) rows.push({ id: 'sign', label: 'Sign', enabled: true, tooltip: 'Sign your name (and add a personal message if you want)', primary: true });
      rows.push({ id: 'read', label: 'Read', enabled: true, tooltip: 'Who is it from? What does it say?' });
    } else if (classTsid === 'glitchmas_cracker_joke' || classTsid === 'glitchmas_cracker_factoid') {
      rows.push({ id: 'read', label: 'Read', enabled: true, tooltip: 'Read it', primary: true });
    } else if (classTsid === 'glitchmas_present') {
      rows.push({ id: 'unwrap', label: 'Unwrap', enabled: true, tooltip: 'I wonder what it is! I wonder what it is!', primary: true });
    } else if (YETI_DOLLS.includes(classTsid)) {
      rows.push({ id: 'pull_string', label: 'Pull string', enabled: true, tooltip: 'You suspect the doll might say something', primary: true });
    } else if (classTsid === 'egg_plain' && isOn('glitchmas')) {
      const check = nogCheck(state, dayKey());
      rows.push({ id: 'nog', label: 'Nog', enabled: check.ok, reason: check.msg || '', tooltip: 'Nog the Egg' });
    } else if (classTsid === 'pi' && isOn('pi_day')) {
      const done = dailyRow(state, dayKey()).pi >= 1;
      rows.push({ id: 'estimate', label: 'Estimate', enabled: !done, reason: SOURCE_LINES.piAlready, tooltip: 'Estimate Pi', primary: !done });
    }
    return rows;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid === 'pumpkin' && verbId === 'carve') return startCarve(engine);
    if (verbId === 'light' && CARVED_CLASSES.includes(classTsid)) return lightPumpkin(engine, classTsid);
    if (verbId === 'smash' && PUMPKIN_CLASSES.includes(classTsid)) return smashPumpkin(engine, classTsid);
    if (verbId === 'place' && PUMPKIN_CLASSES.includes(classTsid)) return placePumpkin(engine, classTsid);
    if (verbId === 'teach' && LIT_CLASSES.includes(classTsid)) {
      state.pumpkinPhrases[classTsid] ||= [];
      teachDialog(engine, state.pumpkinPhrases[classTsid], () => engine.save?.());
      return true;
    }
    if (verbId === 'lament' && classTsid === 'seed_pumpkin') {
      if (countItem(engine.inv, 'seed_pumpkin') < 1) return true;
      removeItem(engine.inv, 'seed_pumpkin', 1);
      const xp = grant(engine, 'xp', 2);
      say(engine, SOURCE_LINES.lament, true, { xp });
      engine.save?.();
      return true;
    }
    if (verbId === 'give' && CANDY_CLASSES.includes(classTsid)) return giveCandy(engine, classTsid);
    if (classTsid === 'glitchmas_cracker') return verbId === 'stop_waiting' ? stopWaiting(engine) : pullCracker(engine);
    if (classTsid === 'glitchmas_card') return verbId === 'sign' ? signCard(engine) : readCard(engine);
    if (verbId === 'read' && /^glitchmas_cracker_(joke|factoid)$/.test(classTsid)) return readNote(engine, classTsid);
    if (classTsid === 'glitchmas_present' && verbId === 'unwrap') {
      if (countItem(engine.inv, 'glitchmas_present') < 1) return true;
      removeItem(engine.inv, 'glitchmas_present', 1);
      addItem(engine.inv, 'collectors_edition_2010_glitchmas_yeti', 1);
      burst(engine, 0xd94a4a);
      engine.playSound?.('DISCOVER_USEFUL_NEW_ITEM', { volume: 0.6 });
      say(engine, `${SOURCE_LINES.unwrap} It's a Collectors' Edition 2010 Glitchmas Yeti!`);
      engine.save?.();
      return true;
    }
    if (YETI_DOLLS.includes(classTsid) && verbId === 'pull_string') {
      const quote = yetiQuote(classTsid, sleepyRng);
      if (engine.player) engine.floatText?.(engine.player.x, (engine.player.y || 0) - 120, `"${quote}"`, 0xffffff);
      say(engine, `The doll starts to speak: "${quote}"`);
      return true;
    }
    if (classTsid === 'egg_plain' && verbId === 'nog') {
      const check = nogCheck(state, dayKey());
      if (!isOn('glitchmas') || !check.ok) return say(engine, check.msg || 'Not now.', false), true;
      dailyRow(state, dayKey()).nog += 1;
      const xp = grant(engine, 'xp', NOG.xp);
      say(engine, SOURCE_LINES.nog, true, { xp });
      engine.save?.();
      return true;
    }
    if (classTsid === 'pi' && verbId === 'estimate') return estimate(engine);
    return false;
  },

  verbsFor(target, engine) {
    const d = decor.find((x) => x.target === target);
    if (!d) return [];
    if (d.kind === 'lantern') {
      const done = dailyRow(state, dayKey()).treats[engine.streetTsid];
      return [
        { id: 'treat', label: 'Trick or treat', enabled: !done, reason: 'Already treated you today', tooltip: 'Knock knock', durationMs: 0 },
        { id: 'talk', label: 'Talk to', enabled: true, tooltip: 'It has opinions', durationMs: 0 },
      ];
    }
    if (d.kind === 'egg') return [{ id: 'pickup', label: 'Pick up', enabled: true, tooltip: 'Put it in your pack', durationMs: 0 }];
    if (d.kind === 'placed') {
      const rows = [{ id: 'pickup', label: 'Pick up', enabled: true, tooltip: 'Put it in your pack', durationMs: 0 }];
      if (isLitPumpkin(d.row.cls)) rows.unshift({ id: 'teach', label: 'Teach', enabled: true, tooltip: 'Teach me a new phrase', durationMs: 0 });
      return rows;
    }
    return [];
  },

  runVerb(target, verbId, engine) {
    const d = decor.find((x) => x.target === target);
    if (!d) return false;
    const now = Date.now();
    if (d.kind === 'lantern' && verbId === 'talk') {
      lanternSpeak(engine, d, STREET_LANTERN_LINES[Math.floor(Math.random() * STREET_LANTERN_LINES.length)], now);
      return true;
    }
    if (d.kind === 'lantern' && verbId === 'treat') {
      const res = pumpkinTreat(state, engine.streetTsid, dayKey(), sleepyRng);
      if (!res.ok) return say(engine, res.msg, false), true;
      target.subtitle = 'Already treated you today';
      if (res.kind === 'treat') {
        addItem(engine.inv, res.candy, 1);
        lanternSpeak(engine, d, 'Treat!', now);
        engine.playSound?.('ITEM_PICKUP', { volume: 0.5 });
        say(engine, `${res.line} You got ${ITEM_CATALOG[res.candy]?.label || 'candy'}.`);
      } else {
        lanternSpeak(engine, d, 'TRICK! MWA-HA-HA!', now);
        const effects = grantAll(engine, { mood: res.mood || 0, energy: res.energy || 0 });
        say(engine, res.line, true, effects);
      }
      engine.save?.();
      return true;
    }
    if (d.kind === 'egg' && verbId === 'pickup') {
      const yearKey = seasonYearKey('egg_hunt', nowForCalendar(engine));
      recordEggFound(state, yearKey, engine.streetTsid);
      addItem(engine.inv, d.cls, 1);
      engine.achievement?.(`in_inventory:${d.cls}`, 1);
      engine.playSound?.('DISCOVER_USEFUL_NEW_ITEM', { volume: 0.6 });
      clearDecor(engine, (x) => x === d);
      const kinds = EGG_CLASSES.filter((c) => countItem(engine.inv, c) > 0).length;
      say(engine, `You found a ${ITEM_CATALOG[d.cls]?.label || 'chocolate egg'}! (${kinds} of 5 kinds in your pack)`);
      if ((engine.unlockedAchievements || []).includes('collection_egg_hunter') && !state.trophyGiven) {
        state.trophyGiven = true;
        addItem(engine.inv, 'trophy_egghunt', 1);
        say(engine, 'You got the Egg Hunter Trophy!');
      }
      engine.save?.();
      return true;
    }
    if (d.kind === 'placed') {
      if (verbId === 'teach') {
        teachDialog(engine, d.row.phrases ||= [], () => {
          target.subtitle = `${d.row.phrases.length} phrase${d.row.phrases.length === 1 ? '' : 's'} learned`;
          engine.save?.();
        });
        return true;
      }
      if (verbId === 'pickup') {
        state.placed = state.placed.filter((r) => r !== d.row);
        addItem(engine.inv, d.row.cls, 1);
        if (isLitPumpkin(d.row.cls) && d.row.phrases?.length) state.pumpkinPhrases[d.row.cls] = [...d.row.phrases];
        clearDecor(engine, (x) => x === d);
        say(engine, `You picked up ${ITEM_CATALOG[d.row.cls]?.label || 'the pumpkin'}.`);
        engine.save?.();
        return true;
      }
    }
    return false;
  },

  save() {
    return state;
  },

  restore(slice, engine) {
    state = createSeasonState(slice || {});
    state.notes = Array.isArray(slice?.notes) ? slice.notes.filter((n) => n && typeof n.cls === 'string') : [];
    if (engine) publish(engine);
  },

  /** QA / tests. */
  _state() {
    return { state, season, decor: decor.map((d) => d.kind) };
  },
  _reset() {
    state = createSeasonState();
    season = { ids: [], primary: null, via: 'none' };
    decor = [];
    carving = null;
    cracker = null;
    pendingBoosts = [];
    demoDone = false;
    autoplayAt = 0;
    autoplayStep = 0;
    autoplayLog = [];
  },
};

function estimate(engine) {
  if (!isOn('pi_day')) return say(engine, 'You can only estimate Pi on Pi Day.', false), true;
  const row = dailyRow(state, dayKey());
  if (row.pi >= 1) return say(engine, SOURCE_LINES.piAlready, false), true;
  row.pi += 1;
  const year = String(new Date(nowForCalendar(engine)).getUTCFullYear());
  const favor = !state.piYears.includes(year);
  if (favor) state.piYears.push(year);
  const res = estimatePi(sleepyRng, { favor });
  say(engine, SOURCE_LINES.piStart);
  let total = 0;
  res.digits.forEach((digit, i) => {
    setTimeout(() => {
      const got = favor ? grantFavor(engine, 'ti', digit) : grant(engine, 'mood', digit);
      total += got;
      if (engine.player) engine.floatText?.(engine.player.x, (engine.player.y || 0) - 110 - (i % 4) * 14, String(digit), 0x9be3a8);
      engine.pushActivity?.(favor ? `You gain ${got} favor with Tii.` : `You gain ${got} mood.`);
      if (i === res.digits.length - 1) {
        say(engine, `${SOURCE_LINES.piDone} You gained a total of ${total} ${favor ? 'favor with Tii' : 'mood'}.`);
        engine.save?.();
      }
    }, 500 * (i + 1));
  });
  return true;
}
