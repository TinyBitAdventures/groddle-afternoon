/**
 * Visitors' verbs on another player's home street in multiplayer (registers
 * G328 and G201). The rules, the pool amounts and their sources are in
 * js/yard-verbs-mp.js.
 *
 * - On a visit (neighbours-mp-feature's MPH_<owner> street scene) this
 *   feature draws the owner's Patches, the trees grown in them and the
 *   animals on their street, from the site's view of the owner's stored save
 *   (groddle-afternoon-site src/HomeYard.php, GET homes/<owner>/yard), and
 *   gives them the source's verbs: a Patch's dig and tend run here on a copy
 *   of the owner's plot (js/patches.js, as the patches feature runs them),
 *   and so do a Seedling's pet and planting a bean of your own (HOMES2: the
 *   planting asks the site first, which takes the bean from your ledger);
 *   trees and animals are ordinary trant / wood_tree / npc_* targets, so the
 *   game's own pet, water, harvest, nibble, massage, milk and squeeze run on
 *   a copy carrying the visitor's own uses today. What only an owner may do
 *   (set free, remove, poison, trantsform, name, capture) is left off.
 * - Each act that landed goes to the realtime server (home_yard), which
 *   checks the visitor is on HOME_<owner> and asks the site; the site checks
 *   the act against the owner's stored things and the visitor's daily
 *   limits, keeps it for the owner, adds the source's amount to the owner's
 *   Magic Rock pool (HomePool) and writes the items it can count as a ledger
 *   receipt for the visitor. A refusal puts the copy back as the site has it.
 *   The visitor's own rewards (energy, mood, iMG, items, tool wear) are their
 *   own game's, as with any verb.
 * - The owner's game applies the acts to its own home (the patches and
 *   husbandry slots of RH_HOME_EXT): at once when the server tells it
 *   (home_yard_acted), else on load and on coming home (GET homes/yard), and
 *   lists what it applied in this feature's slice, which the site reads to
 *   drop them. The owner reads a line for each ("Bo petted your Piggy.").
 *
 * - Rocks and resource nodes (MPVISIT, rules in js/yard-stock-mp.js): the
 *   owner's cultivated rocks are drawn as minable rocks and their Peat Bogs,
 *   Dirt Piles, Mortar Barnacles and Jellisacs as resource nodes, from the
 *   site's view of them now (chunks, stock). A swing or a harvest asks the
 *   server first (home_yard, after the swing has played, as shared street
 *   objects do); the site rolls the chunks, takes the stock, wears the
 *   cultivation, fills the owner's Magic Rock and credits the yield to the
 *   visitor's ledger; on its go-ahead the game's own verb runs with the
 *   site's chunks (sharedVerbGrant). The visitor's own side (pick, Mining I,
 *   energy, tools, daily limits) refuses locally first. Everyone at that
 *   home sees the rock or node change; the owner's game takes the chunks off
 *   its rock, the use off its node and the wear off its cultivation.
 *
 * Multiplayer only (engine.mode and the realtime client): solo never runs any
 * of it.
 *
 * QA: window.groddleYard in multiplayer: state(), act(what, verb) with what
 * 'plot:<key>' | 'tree:<key>' | 'animal:<id>', standNear(what), refresh();
 * act('rock:rock:0', 'mine') / act('node:node:peat_1:0', 'harvest');
 * canvas data yardVisit (owner:patches:trees:animals:rocks:nodes), yardStock
 * (rock:0=43,node:peat_1:0=3: the copies), yardLast,
 * yardApplied (acts applied to my home), yardSent (acts the site took).
 */

import { performPlotVerb, plotArtPath, plotLabel, plotStatusLabel, plotVerbs } from '../patches.js?v=5b86e3f1';
import { trantStatusLabel } from '../trants.js?v=1b3c8ae3';
import { woodTreeStatusLabel } from '../woodcutting.js?v=4fd0342b';
import { animalAnchorX, animalAnchorY, animalStatusLabel } from '../animals.js?v=18e6b180';
import { frameTexture, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js?v=3149d699';
import { homeStreetLayout, normalizeCultivationState } from '../home-cultivation.js?v=42ae453c';
import { readVisitScene } from '../neighbours-mp.js?v=cfabb4f7';
import { saveStore } from '../save-store.js?v=8839ba7b';
import { STREET_GROUND_Y, homesFeature, wearHomeCultivation } from './homes-feature.js?v=683f6dac';
import { patchesFeature, treeFrameUrl } from './patches-feature.js?v=59b03b45';
import {
  YARD_STREET,
  YARD_TEXT as T,
  YARD_VERBS_MP_ID,
  allowedVerbs,
  animalActs,
  animalUses,
  applyYardAct,
  keepApplied,
  normalizeYardActs,
  normalizeYardView,
  treeActs,
  treeSnapshot,
  visitorAnimalState,
  visitorTreeState,
} from '../yard-verbs-mp.js?v=740fbaed';
import { itemZ } from '../item-bands.js?v=e98b10bc';
import { followYardPath, stickForClass } from '../yard-wander.js?v=75cc92d0';
import { countItem, removeItem } from '../inventory.js?v=b7609342';
import { ROCK_CATALOG, rockStatusLabel, tickMineRock } from '../mining.js?v=fc28670f';
import { getResourceNodeDef, regrowDelayMs } from '../resource-nodes.js?v=b11d96b2';
import { getGameDayKey } from '../game-day.js?v=edb00566';
import { rockReady } from '../street-objects.js?v=38310175';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=5d084390';
import {
  ROCK_RESPAWN_MS,
  STOCK_NODE_VERBS,
  STOCK_TEXT,
  applyStockAct,
  normalizeStockView,
  visitorNode,
  visitorRock,
} from '../yard-stock-mp.js?v=4ef59a34';

export { YARD_VERBS_MP_ID };

const CLASS_PLOT = 'mp_yard_plot';
const WOOD_SHEET = Object.freeze({ url: 'assets/sprites/wood_tree_maturity_6_variant_2_x6_1_png_1354833445.webp', fw: 88, fh: 138, count: 6 });
const SCAN_MS = 300;
const OWN_FETCH_MS = 30000;
const ASK_MS = 8000;
const STOCK_TEXT_BUSY = 'Someone is already on it. Try again in a moment.';

/** The site's routes for this feature (the cookie with its REST nonce, refreshed once when stale). */
function createSite() {
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  let nonce = /^[0-9a-f]{10}$/.test(String(boot.nonce || '')) ? String(boot.nonce) : '';
  const api = new URL('wp-json/groddle/v1/', document.baseURI).href;
  const nonceUrl = boot.nonceUrl || new URL('wp-admin/admin-ajax.php?action=rest-nonce', document.baseURI).href;
  async function refresh() {
    try {
      const res = await fetch(nonceUrl, { credentials: 'same-origin', cache: 'no-store' });
      const text = String(await res.text()).trim();
      if (res.ok && /^[0-9a-f]{10}$/.test(text)) {
        nonce = text;
        return true;
      }
    } catch { /* the answer below stands */ }
    return false;
  }
  async function call(path) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const headers = nonce ? { 'X-WP-Nonce': nonce } : {};
      let res;
      try {
        res = await fetch(api + path, { credentials: 'same-origin', cache: 'no-store', headers });
      } catch {
        throw Object.assign(new Error(T.offline), { status: 0 });
      }
      const fresh = res.headers?.get?.('X-WP-Nonce');
      if (fresh) nonce = fresh;
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (res.status === 403 && data?.code === 'rest_cookie_invalid_nonce' && attempt === 0 && (await refresh())) continue;
      if (!res.ok) throw Object.assign(new Error(typeof data?.message === 'string' ? data.message : T.failed), { status: res.status });
      return data;
    }
    throw new Error(T.failed);
  }
  return {
    yard: (owner) => call(`homes/${Number(owner)}/yard`),
    waiting: () => call('homes/yard'),
  };
}

let session = null;
let savedApplied = [];

function createSession(engine, client) {
  const site = createSite();
  const me = () => Number(client.me?.id) || 0;
  /** The visit drawn now: { owner, name, tsid, view, plots: Map, trees: Map, animals: Map }. */
  let visit = null;
  let loading = '';
  let req = 0;
  const sent = new Map(); // req -> { owner, kind, id, verb }
  let sentOk = 0;
  let applied = keepApplied(savedApplied, []);
  let appliedCount = 0;
  let last = '';
  let lastLine = '';
  let scanAt = 0;
  let ownAt = 0;
  let ownBusy = false;
  let wasHome = false;

  function publish() {
    const v = visit;
    engine.setData?.('yardVisit', v ? `${v.owner}:${v.plots.size}:${v.trees.size}:${v.animals.size}:${v.rocks.size}:${v.nodes.size}` : '');
    engine.setData?.('yardStock', v ? stockView() : '');
    engine.setData?.('yardLast', last);
    engine.setData?.('yardApplied', String(appliedCount));
    engine.setData?.('yardSent', String(sentOk));
  }

  function notice(text, ms = 3200) {
    if (text) engine.toast?.(text, ms);
  }

  // —— Drawing the owner's yard on a visit ——

  function clearVisit() {
    if (!visit) return;
    for (const map of [visit.plots, visit.trees, visit.animals, visit.rocks]) {
      for (const e of map.values()) {
        if (e.target) engine.unregister?.(e.target);
        if (e.sprite && !e.sprite.destroyed) e.sprite.destroy();
      }
    }
    visit = null;
  }

  function houseX(view) {
    return homeStreetLayout(normalizeCultivationState(view.cult || {})).houseX;
  }

  function soilSprite(plot) {
    const { PIXI } = engine;
    const spr = new PIXI.Sprite(textureFromUrl(plotArtPath(plot)));
    spr.anchor.set(0.5, plot.stage === 'dead' ? 1 : plot.stage === 'seedling' ? 0.86 : 0.8);
    spr.zIndex = plot.stage === 'dead' ? 16 : 15;
    spr._worldHitW = 130;
    spr._worldHitH = plot.stage === 'seedling' ? 70 : 56;
    return spr;
  }

  function treeSprite(classId, maturity, direction) {
    const { PIXI } = engine;
    const isWood = classId === 'wood_tree';
    const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
    spr.anchor.set(0.5, 1);
    spr.zIndex = 16;
    spr._woodDirection = direction;
    const fit = (tex) => {
      if (spr.destroyed || !tex) return;
      spr.texture = tex;
      const s = Math.min(1, (isWood ? 190 : 210) / Math.max(1, tex.height || 210));
      spr.scale.set(direction * s, s);
    };
    if (isWood) {
      const source = sourceFromUrl(WOOD_SHEET.url);
      const m = Math.max(1, Math.min(6, Number(maturity) || 1));
      onLoaded(source, () => fit(frameTexture(source, new PIXI.Rectangle((m - 1) * WOOD_SHEET.fw, 0, WOOD_SHEET.fw, WOOD_SHEET.fh))));
    } else {
      const tex = textureFromUrl(treeFrameUrl(classId, maturity));
      onLoaded(tex.source, () => fit(tex));
    }
    return spr;
  }

  function animalSprite(classId) {
    const { PIXI } = engine;
    const t = engine.textures || {};
    const frames = classId === 'npc_piggy'
      ? (t.piggyWalk?.frames || []).slice(0, 8)
      : classId === 'npc_chicken' ? (t.chickenWalk?.frames || []).slice(0, 6) : (t.butterfly?.frames || []).slice(0, 14);
    const spr = new PIXI.AnimatedSprite(frames.length ? frames : [PIXI.Texture.EMPTY]);
    const scale = classId === 'npc_piggy' ? 0.97 : 0.7;
    // Under the animal, so it turns on the spot (js/animals.js ANIMAL_ANCHOR_X).
    spr.anchor.set(animalAnchorX(classId), classId === 'npc_butterfly' ? 0.5 : animalAnchorY(classId));
    spr.baseScale = scale;
    spr.scale.set(scale);
    spr.animationSpeed = classId === 'npc_butterfly' ? 0.25 : 0.13;
    spr.zIndex = itemZ(classId, classId === 'npc_butterfly' ? 5 : 2);
    spr.play();
    const playOnce = (key, slice, walkKey, walkSlice, speed) => (durationMs = 0) => {
      const actionFrames = (t[key]?.frames || []).slice(...slice);
      if (!actionFrames.length || spr.destroyed) return;
      spr.textures = actionFrames;
      spr.loop = false;
      spr.animationSpeed = durationMs > 0 ? Math.min(0.3, Math.max(0.025, actionFrames.length / (60 * (durationMs / 1000)))) : 0.18;
      spr.gotoAndPlay(0);
      spr.onComplete = () => {
        if (spr.destroyed) return;
        spr.loop = true;
        spr.textures = (t[walkKey]?.frames || []).slice(...walkSlice);
        spr.animationSpeed = speed;
        spr.gotoAndPlay(0);
        spr.onComplete = null;
      };
    };
    if (classId === 'npc_piggy') {
      spr.playPet = playOnce('piggyNibble', [0, 10], 'piggyWalk', [0, 8], 0.13);
      spr.playNibble = spr.playPet;
    } else if (classId === 'npc_chicken') {
      spr.playSqueeze = playOnce('chickenPeck', [0, 6], 'chickenWalk', [0, 6], 0.12);
    }
    return spr;
  }

  function treeSubtitle(classId, state) {
    return classId === 'wood_tree' ? woodTreeStatusLabel(state) : trantStatusLabel(state);
  }

  function drawPatch(p, x, i) {
    const plot = JSON.parse(JSON.stringify(p.plot));
    if (plot.stage === 'tree' && plot.tree?.state) {
      const classId = plot.tree.classId;
      const state = visitorTreeState(plot, p.key, visit.view.mine);
      if (!state) return;
      const sprite = treeSprite(classId, state.maturity, i % 2 ? -1 : 1);
      sprite.x = x;
      sprite.y = STREET_GROUND_Y + 2;
      engine.entityLayer.addChild(sprite);
      const target = engine.register({ classId, label: plotLabel(plot), subtitle: treeSubtitle(classId, state), sprite, state, yardVisit: { kind: 'tree', id: p.key } });
      visit.trees.set(p.key, { key: p.key, classId, plot, state, sprite, target, snap: treeSnapshot(state) });
      return;
    }
    const sprite = soilSprite(plot);
    sprite.x = x;
    sprite.y = STREET_GROUND_Y + 2;
    engine.entityLayer.addChild(sprite);
    const target = engine.register({ classId: CLASS_PLOT, featureId: YARD_VERBS_MP_ID, label: plotLabel(plot), subtitle: plotStatusLabel(plot, Date.now()), sprite, yardVisit: { kind: 'plot', id: p.key } });
    visit.plots.set(p.key, { key: p.key, plot, sprite, target });
  }

  function drawAnimal(row) {
    const state = visitorAnimalState(row, visit.view.mine);
    const sprite = animalSprite(row.classId);
    sprite.x = row.x;
    sprite.y = row.classId === 'npc_butterfly' ? STREET_GROUND_Y - 90 : STREET_GROUND_Y + 2;
    engine.entityLayer.addChild(sprite);
    const label = { npc_piggy: 'Piggy', npc_chicken: 'Chicken', npc_butterfly: 'Butterfly' }[row.classId];
    const target = engine.register({
      classId: row.classId,
      label: state.userName ? `${label} ${state.userName}` : label,
      subtitle: animalStatusLabel(row.classId, state),
      sprite,
      airborne: row.classId === 'npc_butterfly',
      state,
      yardVisit: { kind: 'animal', id: row.id },
    });
    // Ticket 99: its own walk, the one the owner's game draws (js/yard-wander.js: its id, spot and stick).
    const walk = { id: row.id, classId: row.classId, homeX: row.homeX ?? row.x, stick: stickForClass(visit.view.sticks, row.classId), worldW: engine.worldW };
    visit.animals.set(row.id, { id: row.id, classId: row.classId, state, sprite, target, walk, drive: { holdUntil: 0 }, snap: animalUses(row.classId, state) });
  }

  function draw(view, tsid, name) {
    clearVisit();
    visit = { owner: view.owner, name, tsid, view, plots: new Map(), trees: new Map(), animals: new Map(), rocks: new Map(), nodes: new Map() };
    const hx = houseX(view);
    view.patches.forEach((p, i) => drawPatch(p, hx + p.rx, i));
    for (const row of view.animals) drawAnimal(row);
    for (const row of view.stock.rocks) drawRock(row, hx + row.rx);
    spawnNodes(view, hx);
    publish();
  }

  // —— MPVISIT: the owner's rocks and resource nodes on a visit ——

  /** A minable rock, drawn as game.js spawnMineRock draws one (its own target: no street rock slot). */
  function drawRock(row, x) {
    const { PIXI } = engine;
    const def = ROCK_CATALOG[row.classId];
    if (!def) return;
    const rock = visitorRock(row);
    const root = new PIXI.Container();
    root.x = x;
    root.y = STREET_GROUND_Y;
    root.zIndex = itemZ(def.classTsid, 9.5);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.hitArea = new PIXI.Rectangle(-48, -90, 96, 92);
    root._mineHitW = 96;
    root._mineHitH = 90;
    const frames = engine.textures?.[def.textureKey]?.frames || [];
    const base = textureFromUrl(`${def.worldSheet}?v=exact-rock-cells-1`);
    const spr = new PIXI.Sprite(frames[0] || base);
    spr.anchor.set(0.5, 1);
    spr.scale.set(0.85);
    spr.eventMode = 'none';
    root.addChild(spr);
    Object.assign(root, { rockSprite: spr, rockFrames: frames, rockFrameW: def.frameWidth, rockFrameH: def.frameHeight, rockBaseTex: base });
    engine.entityLayer.addChild(root);
    const target = engine.register({ classId: def.classTsid, label: def.label, subtitle: rockStatusLabel(rock), sprite: root, state: { rock }, yardVisit: { kind: 'rock', id: row.id } });
    engine.refreshRock?.(target);
    visit.rocks.set(row.id, { id: row.id, classId: def.classTsid, rock, sprite: root, target });
  }

  /**
   * The owner's nodes through the resource-nodes feature, as homes-feature
   * spawns them on the owner's own street, with a slot of their own (the
   * site's stock, the visitor's own daily counts) that never reaches the
   * visitor's save.
   */
  function spawnNodes(view, hx) {
    const rows = view.stock.nodes;
    if (!rows.length) return;
    const slot = { nodes: {} };
    const dayKey = getGameDayKey(Date.now());
    const population = { resourceNodeClasses: [] };
    const points = {};
    for (const row of rows) {
      const cls = row.key.split(':')[0];
      slot.nodes[row.key] = visitorNode(row, view.mine, dayKey);
      population.resourceNodeClasses.push(row.classTsid);
      (points[`resource:${cls}`] ||= []).push({ x: hx + row.rx, y: STREET_GROUND_Y + row.dy });
      visit.nodes.set(row.id, { id: row.id, key: row.key, cls, target: null, node: null, refresh: null, ready: null });
    }
    const shim = Object.create(engine, {
      population: { value: population },
      placement: { value: (key) => points[key] || [] },
      streetSlot: { value: (id, tsid) => (id === 'resource-nodes' && tsid == null ? slot : engine.streetSlot?.(id, tsid)) },
    });
    resourceNodesFeature.onStreetEnter({ tsid: visit.tsid }, shim);
  }

  /** The node entities the resource feature drew (it may draw after its art loads): marked as this visit's. */
  function bindNodes() {
    if (!visit?.nodes.size) return;
    for (const row of resourceNodesFeature.streetResourceNodes(engine) || []) {
      const e = visit.nodes.get(`node:${row.key}`);
      if (!e || !row.target || e.target === row.target) continue;
      Object.assign(e, { target: row.target, node: row.node, refresh: row.refresh, ready: row.ready });
      row.target.yardVisit = { kind: 'node', id: e.id };
    }
  }

  /** QA: the copies (rock:0=43, node:peat_1:0=3). */
  function stockView() {
    const out = [];
    for (const r of visit.rocks.values()) out.push(`${r.id}=${r.rock.depleted ? 0 : r.rock.chunksRemaining}`);
    for (const n of visit.nodes.values()) if (n.node) out.push(`${n.id}=${n.node.units}`);
    return out.join(',');
  }

  /** A copy follows the site's word: a rock's chunks left, a node's uses left (a mined-out rock reforms). */
  function setLeft(kind, id, left, at = Date.now()) {
    if (!visit || !Number.isInteger(left)) return;
    if (kind === 'rock') {
      const r = visit.rocks.get(id);
      if (!r) return;
      r.rock.chunksRemaining = left;
      if (left <= 0) {
        if (!r.rock.depleted) r.rock.respawnAt = at + ROCK_RESPAWN_MS;
        r.rock.depleted = true;
      } else {
        r.rock.depleted = false;
        r.rock.respawnAt = 0;
      }
      engine.refreshRock?.(r.target);
      return;
    }
    const n = visit.nodes.get(id);
    if (!n?.node) return;
    n.node.units = left;
    const def = getResourceNodeDef(n.node.classTsid);
    if (def?.regrow && left < def.stock.max) n.node.regrowAt = at + regrowDelayMs(def);
    n.refresh?.();
  }

  // —— A visitor's swing or harvest asks first ——

  let grant = null;

  function askStock(target, verbId) {
    const v = target?.yardVisit;
    if (!visit || !v) return null;
    if (grant && grant.target === target && grant.verbId === verbId) return null;
    const base = String(verbId || '').split(':')[0];
    if (base === 'talk_to') return null;
    let verb;
    if (v.kind === 'rock') {
      if (base !== 'mine') return notMine();
      // The visitor's own side refuses locally, as in solo (a pick, Mining I, energy; a mined-out rock).
      if (target.state?.rock?.depleted || !rockReady(target.state?.rock, { inv: engine.inv, pc: engine.pc, learned: engine.learnedSkills || [], toolState: engine.toolState })) return null;
      verb = 'mine';
    } else {
      const e = visit.nodes.get(v.id);
      if (!e || base !== STOCK_NODE_VERBS[e.cls]) return notMine();
      if (!e.ready?.(verbId)) return null;
      verb = base;
    }
    if (client.state !== 'online') {
      notice(T.offline);
      return true;
    }
    for (const a of sent.values()) {
      if (a.stock && a.id === v.id) {
        notice(STOCK_TEXT_BUSY, 1600);
        return true;
      }
    }
    req += 1;
    sent.set(req, { owner: visit.owner, kind: v.kind, id: v.id, verb, stock: true, target, verbId, at: Date.now() });
    client.send('home_yard', { req, owner: visit.owner, kind: v.kind, id: v.id, verb });
    last = `sent:${v.kind}:${v.id}:${verb}`;
    publish();
    return true;
  }

  function notMine() {
    notice(T.notYours(visit.name), 2400);
    return true;
  }

  /** The site said yes: the game's own verb runs on the copy with the site's chunks, then the copy takes the site's word. */
  function runGranted(ask, msg) {
    const act = msg.act || {};
    const took = Math.max(0, Math.floor(Number(act.took) || 0));
    const t = ask.target;
    if (ask.kind === 'rock' && t?.state?.rock) {
      // The state the site decided from: never a refusal here for a rock the copy thought mined out.
      if (t.state.rock.depleted || t.state.rock.chunksRemaining <= 0) Object.assign(t.state.rock, { depleted: false, respawnAt: 0, chunksRemaining: Math.max(1, took) });
    } else if (ask.kind === 'node') {
      const n = visit?.nodes.get(ask.id)?.node;
      const def = getResourceNodeDef(n?.classTsid);
      if (n && def) n.units = Math.max(Number(n.units) || 0, def.stock.harvestableAt);
    }
    // HOMES2: a whistle catches the Firefly asked for and those near it (resource-nodes harvestResourceNode).
    const flies = ask.kind === 'node' && String(ask.id).startsWith('node:npc_firefly:')
      ? [...visit.nodes.values()].filter((e) => e.id !== ask.id && e.node && !e.node.depleted)
      : [];
    grant = { target: t, verbId: ask.verbId, chunks: ask.kind === 'rock' && took > 0 ? took : undefined };
    try {
      engine.executeVerb?.(t, ask.verbId, { animated: true });
    } finally {
      grant = null;
    }
    setLeft(ask.kind, ask.id, act.left, Number(act.at) || Date.now());
    // Each other Firefly the whistle took is told to the site after it (the site keeps the hive's count and the jar's pay).
    for (const e of flies) if (e.node.depleted) send('node', e.id, 'open');
  }

  async function loadVisit(tsid) {
    const scene = readVisitScene(tsid);
    if (!scene || scene.room !== 'street' || loading === tsid) return;
    loading = tsid;
    try {
      const answer = await site.yard(scene.owner);
      const view = normalizeYardView(answer);
      if (view) view.stock = normalizeStockView(answer);
      if (view && engine.streetTsid === tsid) draw(view, tsid, view.name || 'someone');
    } catch (err) {
      console.warn('[yard]', err?.message || err);
    } finally {
      loading = '';
    }
  }

  /** The site's word on the yard: every copy as the site has it now. */
  async function refreshVisit() {
    if (!visit) return;
    const tsid = visit.tsid;
    try {
      const answer = await site.yard(visit.owner);
      const view = normalizeYardView(answer);
      if (!view || !visit || visit.tsid !== tsid) return;
      view.stock = normalizeStockView(answer);
      visit.view = view;
      for (const row of view.stock.rocks) {
        const r = visit.rocks.get(row.id);
        if (!r) continue;
        Object.assign(r.rock, visitorRock(row));
        engine.refreshRock?.(r.target);
      }
      for (const row of view.stock.nodes) {
        const n = visit.nodes.get(row.id);
        if (!n?.node) continue;
        Object.assign(n.node, visitorNode(row, view.mine, getGameDayKey(Date.now())));
        n.refresh?.();
      }
      for (const p of view.patches) {
        const e = visit.plots.get(p.key);
        if (e && p.plot.stage !== 'tree') {
          Object.assign(e.plot, p.plot);
          redrawPlot(e);
        }
        const tr = visit.trees.get(p.key);
        const fresh = tr ? visitorTreeState(p.plot, p.key, view.mine) : null;
        if (tr && fresh) {
          Object.assign(tr.state, fresh);
          tr.snap = treeSnapshot(tr.state);
          tr.target.subtitle = treeSubtitle(tr.classId, tr.state);
        }
      }
      for (const row of view.animals) {
        const a = visit.animals.get(row.id);
        if (!a) continue;
        Object.assign(a.state, visitorAnimalState(row, view.mine));
        // A stick placed or taken up since: the walk follows (ticket 99).
        a.walk.homeX = row.homeX ?? row.x;
        a.walk.stick = stickForClass(view.sticks, row.classId);
        a.snap = animalUses(a.classId, a.state);
        a.target.subtitle = animalStatusLabel(a.classId, a.state);
      }
    } catch (err) {
      console.warn('[yard]', err?.message || err);
    }
  }

  function redrawPlot(e) {
    if (e.sprite && !e.sprite.destroyed) e.sprite.texture = textureFromUrl(plotArtPath(e.plot));
    e.target.label = plotLabel(e.plot);
    e.target.subtitle = plotStatusLabel(e.plot, Date.now());
  }

  // —— Sending acts ——

  function send(kind, id, verb) {
    if (!visit) return;
    if (client.state !== 'online') {
      notice(T.offline);
      refreshVisit();
      return;
    }
    req += 1;
    sent.set(req, { owner: visit.owner, kind, id, verb });
    client.send('home_yard', { req, owner: visit.owner, kind, id, verb });
    last = `sent:${kind}:${id}:${verb}`;
    publish();
  }

  /** A tree's or animal's copy changed under the game's own verbs: what changed goes to the server. */
  function scan() {
    if (!visit) return;
    for (const tr of visit.trees.values()) {
      const now = treeSnapshot(tr.state);
      for (const verb of treeActs(tr.snap, now)) send('tree', tr.key, verb);
      tr.snap = now;
    }
    for (const a of visit.animals.values()) {
      const now = animalUses(a.classId, a.state);
      for (const verb of animalActs(a.snap, now)) send('animal', a.id, verb);
      a.snap = now;
    }
  }

  // —— A Patch's verbs on a visit (js/patches.js, as features/patches-feature.js runs them) ——

  function plotCtx() {
    return {
      inv: engine.inv,
      pc: engine.pc,
      skills: engine.learnedSkills,
      upgrades: engine.pc?.imaginationUpgrades || [],
      buffs: engine.activeBuffIds?.() || [],
      toolState: engine.toolState,
      // patch.js canPlant: any bean grows on a home street ("everything is ok in new POLs").
      hubId: 'home',
      now: Date.now(),
      owner: false,
    };
  }

  function plotOf(target) {
    if (!visit || target?.yardVisit?.kind !== 'plot') return null;
    return visit.plots.get(target.yardVisit.id) || null;
  }

  function verbsFor(target) {
    const e = plotOf(target);
    if (!e) return [];
    return plotVerbs(e.plot, plotCtx())
      .filter((v) => v.id === 'tend' || v.id === 'dig' || v.id === 'pet' || v.id === 'plant' || v.id.startsWith('plant:'))
      .map((v) => ({ id: v.id, label: v.label, enabled: v.enabled, tooltip: v.tooltip, reason: v.reason, energy: v.energy || 0, durationMs: v.enabled ? v.durationMs || 0 : 0 }));
  }

  function runVerb(target, verbId) {
    const e = plotOf(target);
    if (!e) return false;
    if (String(verbId).startsWith('plant:')) return askPlant(e, verbId);
    const result = performPlotVerb(e.plot, verbId, plotCtx());
    const x = e.sprite?.x ?? 0;
    const y = e.sprite?.y ?? STREET_GROUND_Y;
    if (!result.ok) {
      notice(result.msg, 2400);
      return true;
    }
    if (result.toolUse?.broke) notice(result.toolUse.msg, 3600);
    engine.pushActivity?.(result.activity);
    let lift = 0;
    for (const out of result.outputs || []) {
      engine.floatText?.(x, y - 60 - lift, `+${out.qty} ${out.classTsid}`, 0xfff4d6);
      lift += 18;
    }
    const p = engine.player;
    if (p && result.costs?.energy) engine.floatText?.(p.x, p.y - 70, `-${result.costs.energy} energy`, 0xff8888);
    if (p && result.costs?.mood) engine.floatText?.(p.x + 20, p.y - 90, `+${result.costs.mood} mood`, 0xffe066);
    if (p && result.costs?.xp) engine.floatText?.(p.x - 20, p.y - 90, `+${result.costs.xp} iMG`, 0xb388ff);
    for (const row of result.counters || []) engine.achievement?.(row.counter, row.amount);
    if (verbId !== 'pet') engine.playSound?.(verbId === 'dig' ? 'SHOVEL' : 'HOE', { volume: 0.6, jitter: 0.05 });
    engine.refreshPack?.();
    redrawPlot(e);
    engine.save?.();
    send('plot', e.key, verbId);
    return true;
  }

  /**
   * HOMES2: planting your bean in their Patch asks the site first (the bean
   * leaves your ledger there, once); on its yes the copy becomes your
   * Seedling (js/patches.js plant, on a scratch pack: the bean leaves your
   * own pack through the receipt).
   */
  function askPlant(e, verbId) {
    const bean = String(verbId).slice(6);
    if (countItem(engine.inv, bean) < 1) return true;
    if (client.state !== 'online') {
      notice(T.offline);
      return true;
    }
    for (const a of sent.values()) if (a.plant) return true;
    req += 1;
    const ask = { owner: visit.owner, kind: 'plot', id: e.key, verb: 'plant', plant: bean, verbId, at: Date.now() };
    sent.set(req, ask);
    const n = req;
    const go = () => {
      if (sent.get(n) !== ask) return;
      client.send('home_yard', { req: n, owner: ask.owner, kind: 'plot', id: e.key, verb: 'plant', what: bean });
    };
    // The ledger counts what the last save held: write it first, then ask.
    const f = saveStore?.flush?.();
    if (f?.then) f.then(go, go);
    else go();
    last = `sent:plot:${e.key}:plant`;
    publish();
    return true;
  }

  /** A settled move of the site's (a planting's bean), once (the trade slice's applied list). */
  function applySpend(r) {
    if (!r?.op || engine.query?.('ledgerReceipt', String(r.op), engine) === false) return false;
    for (const row of Array.isArray(r.gave?.items) ? r.gave.items : []) {
      const c = String(row?.c || '');
      const n = Math.max(0, Math.floor(Number(row?.n) || 0));
      if (c && n) removeItem(engine.inv, c, Math.min(n, countItem(engine.inv, c)));
    }
    engine.refreshPack?.();
    return true;
  }

  function planted(ask, msg) {
    applySpend(msg.receipt);
    const e = visit?.plots.get(ask.id);
    if (!e) return;
    const result = performPlotVerb(e.plot, ask.verbId, { ...plotCtx(), inv: { [ask.plant]: 1 } });
    if (!result.ok) return;
    engine.pushActivity?.(result.activity);
    for (const row of result.counters || []) engine.achievement?.(row.counter, row.amount);
    engine.playSound?.('HOE', { volume: 0.6, jitter: 0.05 });
    redrawPlot(e);
    engine.save?.();
  }

  // —— The server's answers ——

  client.on('msg:home_yard_done', (msg) => {
    const ask = sent.get(Number(msg.req));
    sent.delete(Number(msg.req));
    if (ask?.plant) {
      if (msg.status === 'settled') {
        sentOk += 1;
        last = `ok:plot:${ask.id}:plant`;
        planted(ask, msg);
      } else {
        last = `no:plot:${ask.id}:plant:${msg.why || ''}`;
        notice(msg.text || T.failed);
        engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
        refreshVisit();
      }
      publish();
      return;
    }
    if (ask?.stock && visit && Number(msg.owner) === visit.owner && engine.streetTsid === visit.tsid) {
      if (msg.status === 'settled') {
        sentOk += 1;
        last = `ok:${ask.kind}:${ask.id}:${ask.verb}:${Number(msg.added) || 0}:${Number(msg.act?.took) || 0}`;
        runGranted(ask, msg);
        if (Number(msg.added) > 0 && ask.target?.sprite) engine.floatText?.(ask.target.sprite.x, ask.target.sprite.y - 130, T.pool(Number(msg.added)), 0xb388ff);
      } else {
        last = `no:${ask.kind}:${ask.id}:${ask.verb}:${msg.why || ''}`;
        notice(msg.text || T.failed);
        engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
        refreshVisit();
      }
      publish();
      return;
    }
    if (msg.status === 'settled') {
      sentOk += 1;
      last = `ok:${ask?.kind}:${ask?.id}:${ask?.verb}:${Number(msg.added) || 0}`;
      const e = visit && ask ? (visit.plots.get(ask.id) || visit.trees.get(ask.id) || visit.animals.get(ask.id)) : null;
      if (e?.sprite && Number(msg.added) > 0) engine.floatText?.(e.sprite.x, e.sprite.y - 120, T.pool(Number(msg.added)), 0xb388ff);
    } else {
      last = `no:${ask?.kind}:${ask?.id}:${ask?.verb}:${msg.why || ''}`;
      notice(msg.text || T.failed);
      refreshVisit();
    }
    publish();
  });

  client.on('msg:home_yard_acted', (msg) => {
    const act = normalizeYardActs([{ ...msg.act, from: msg.from }])[0];
    if (!act) return;
    if (Number(msg.owner) === me()) {
      applyOwn([act]);
      return;
    }
    // Someone else's act on the yard I am visiting: my copy follows.
    if (!visit || Number(msg.owner) !== visit.owner) return;
    if (act.kind === 'rock' || act.kind === 'node') {
      if (Number(msg.from?.id) !== me()) setLeft(act.kind, act.target, act.left, act.at);
      publish();
      return;
    }
    const plots = {};
    for (const [k, e] of visit.plots) plots[k] = e.plot;
    for (const [k, tr] of visit.trees) plots[k] = { stage: 'tree', tree: { classId: tr.classId, state: tr.state, resetAt: 0 } };
    const rows = [...visit.animals.values()].map((a) => ({ id: a.id, classId: a.classId, state: a.state }));
    // Another visitor's harvest is not mine: only their fruit leaves my copy.
    const changed = applyYardAct({ plots, animals: rows }, act);
    if (!changed) return;
    const pe = visit.plots.get(act.target);
    if (pe) redrawPlot(pe);
    const tr = visit.trees.get(act.target);
    if (tr) {
      tr.snap = treeSnapshot(tr.state);
      tr.target.subtitle = treeSubtitle(tr.classId, tr.state);
    }
    const a = visit.animals.get(act.target);
    if (a) a.target.subtitle = animalStatusLabel(a.classId, a.state);
  });

  // —— My own home: what visitors did ——

  function ownSlots() {
    const patches = engine.streetSlot?.('patches', YARD_STREET) || {};
    const husbandry = engine.streetSlot?.('animal-husbandry', YARD_STREET) || {};
    return { plots: patches.plots || {}, animals: Array.isArray(husbandry.animals) ? husbandry.animals : [] };
  }

  function stockEntry(kind, id) {
    if (kind === 'rock') return visit?.rocks.get(id) || null;
    if (kind === 'node') return visit?.nodes.get(id) || null;
    return null;
  }

  function onMyStreet() {
    const home = engine.homeContext?.() || {};
    return Boolean(home.inHome) && engine.streetTsid === YARD_STREET;
  }

  /** Applies acts to my home once each, tells me, and saves the ids the site drops. */
  function applyOwn(acts) {
    const fresh = acts.filter((a) => !applied.includes(a.id));
    if (!fresh.length) return 0;
    const slots = ownSlots();
    const here = onMyStreet();
    for (const act of fresh) {
      if (act.kind === 'rock' || act.kind === 'node') {
        applyOwnStock(act, here);
        continue;
      }
      const changed = applyYardAct(slots, act);
      appliedCount += 1;
      last = `applied:${act.kind}:${act.target}:${act.verb}`;
      if (!changed) continue;
      const line = changed.planted ? T.planted(act.from.name, changed.planted) : T.acted(act.from.name, act.verb, changed.what);
      lastLine = line;
      engine.pushActivity?.(line);
      if (!here) continue;
      notice(line, 3600);
      if (changed.kind === 'plot') {
        const e = patchesFeature.entityByKey?.(act.target);
        if (e?.sprite && !e.sprite.destroyed && e.plot === changed.plot) {
          e.sprite.texture = textureFromUrl(plotArtPath(e.plot));
          if (e.target) {
            e.target.label = plotLabel(e.plot);
            e.target.subtitle = plotStatusLabel(e.plot, Date.now());
          }
        }
      } else if (changed.kind === 'animal') {
        const t = (engine.interactables || []).find((it) => it.husbandryAnimal === act.target);
        if (t) t.subtitle = animalStatusLabel(changed.row.classId, changed.row.state);
      }
    }
    applied = keepApplied(applied, fresh.map((a) => a.id));
    engine.save?.();
    saveStore?.flush?.().catch?.(() => {});
    publish();
    return fresh.length;
  }

  /** MPVISIT: a visitor's swing or harvest on my street: off my rock or node, and one use off its cultivation. */
  function applyOwnStock(act, here) {
    const cult = homesFeature._state?.().cult;
    const world = engine.streetWorld?.(YARD_STREET);
    const nodesSlot = engine.streetSlot?.('resource-nodes', YARD_STREET) || {};
    if (!nodesSlot.nodes || typeof nodesSlot.nodes !== 'object') nodesSlot.nodes = {};
    appliedCount += 1;
    last = `applied:${act.kind}:${act.target}:${act.verb}`;
    if (!cult || !world) return;
    const changed = applyStockAct({ rocks: world.rocks, nodes: nodesSlot.nodes, items: cult.items }, act);
    if (!changed) return;
    // A home rock wears a use a swing, as the owner's own (homes-feature wearFromEvent); nodes wear from their harvests (wearFromNodes).
    if (changed.kind === 'rock' && changed.wearItem != null) wearHomeCultivation(engine, changed.wearItem, 1);
    const line = STOCK_TEXT.acted(act.from.name, act.verb, changed.what);
    lastLine = line;
    engine.pushActivity?.(line);
    if (!here) return;
    notice(line, 3600);
    if (changed.kind === 'rock') {
      const t = (engine.interactables || []).find((it) => it.state?.rock === changed.rock);
      if (t) engine.refreshRock?.(t);
    } else {
      const row = (resourceNodesFeature.streetResourceNodes(engine) || []).find((r) => r.node === changed.node);
      row?.refresh?.();
    }
  }

  async function loadOwn() {
    if (ownBusy) return;
    ownBusy = true;
    ownAt = Date.now();
    try {
      applyOwn(normalizeYardActs((await site.waiting())?.acts));
    } catch (err) {
      console.warn('[yard]', err?.message || err);
    } finally {
      ownBusy = false;
    }
  }

  // —— Ticking ——

  /** Mined-out rocks reform on the copy; an ask with no answer is dropped. */
  function tickStock() {
    const wall = Date.now();
    for (const [r, a] of sent) {
      if ((a.stock || a.plant) && wall - a.at > ASK_MS) {
        sent.delete(r);
        notice(T.failed, 2400);
      }
    }
    if (!visit) return;
    for (const r of visit.rocks.values()) {
      if (tickMineRock(r.rock, wall)) engine.refreshRock?.(r.target);
      else if (r.rock.depleted) r.target.subtitle = rockStatusLabel(r.rock);
    }
    publish();
  }

  function stepAnimals(dtMs) {
    if (!visit) return;
    const nowMs = Date.now();
    for (const a of visit.animals.values()) {
      const spr = a.sprite;
      if (!spr || spr.destroyed) continue;
      // The visitor at this one (its menu, a verb, its pet or squeeze playing) holds it alone.
      const held = Boolean(engine.actingOn?.(a.target)) || !spr.loop;
      a.walk.worldW = engine.worldW;
      const at = followYardPath(spr, a.drive, {
        animal: a.walk,
        nowMs,
        dtMs,
        held,
        groundAt: () => STREET_GROUND_Y,
      });
      if (a.classId !== 'npc_butterfly' && spr.loop) {
        if (at.moving && !spr.playing) spr.play?.();
        else if (!at.moving && spr.playing) spr.gotoAndStop?.(0);
      }
    }
  }

  return {
    get visit() { return visit; },
    askStock,
    grantFor(target, verbId) {
      return grant && grant.target === target && grant.verbId === verbId ? { chunks: grant.chunks } : null;
    },
    get applied() { return applied; },
    verbsFor,
    runVerb,
    tick(dtMs, now) {
      const tsid = engine.streetTsid;
      const scene = readVisitScene(tsid);
      if (visit && visit.tsid !== tsid) clearVisit();
      if (!visit && scene?.room === 'street') loadVisit(tsid);
      stepAnimals(dtMs);
      if (now - scanAt >= SCAN_MS) {
        scanAt = now;
        scan();
        bindNodes();
        tickStock();
      }
      const home = onMyStreet();
      if ((home && !wasHome) || (!ownAt && engine.started)) loadOwn();
      else if (home && now - ownAt > OWN_FETCH_MS * 4) loadOwn();
      wasHome = home;
    },
    cleared() {
      if (visit && engine.streetTsid !== visit.tsid) visit = null;
    },
    /** QA: run a verb on something drawn here ('plot:<key>', 'tree:<key>', 'animal:<id>'); no verb: the menu ids. */
    act(what, verbId) {
      const [kind, ...rest] = String(what).split(':');
      const id = rest.join(':');
      const e = stockEntry(kind, id) || (kind === 'plot' ? visit?.plots.get(id) : kind === 'tree' ? visit?.trees.get(id) : visit?.animals.get(id));
      if (!e?.target) return false;
      const verbs = engine.targetVerbs?.(e.target) || verbsFor(e.target);
      if (!verbId) return verbs.map((v) => `${v.id}${v.enabled === false ? '!' : ''}`);
      const row = verbs.find((v) => v.id === verbId);
      if (!row || row.enabled === false) return row?.reason || 'no such verb';
      return engine.beginVerb?.(e.target, row) !== false;
    },
    standNear(what) {
      const [kind, ...rest] = String(what).split(':');
      const id = rest.join(':');
      const e = stockEntry(kind, id) || (kind === 'plot' ? visit?.plots.get(id) : kind === 'tree' ? visit?.trees.get(id) : visit?.animals.get(id));
      const spr = e?.sprite || e?.target?.sprite;
      const p = engine.player;
      if (!p || !spr) return false;
      p.x = spr.x - 40;
      p.vx = 0;
      return true;
    },
    refresh: () => refreshVisit(),
    /** QA: send an act as the game would after a verb (the site and server decide). */
    qaSend: (kind, id, verb) => send(kind, id, verb),
    loadOwn: () => loadOwn(),
    state() {
      return {
        visit: visit ? { owner: visit.owner, plots: [...visit.plots.keys()], trees: [...visit.trees.keys()], animals: [...visit.animals.keys()] } : null,
        trees: visit ? Object.fromEntries([...visit.trees].map(([k, t]) => [k, treeSnapshot(t.state)])) : {},
        plots: visit ? Object.fromEntries([...visit.plots].map(([k, e]) => [k, e.plot.stage])) : {},
        animals: visit ? Object.fromEntries([...visit.animals].map(([k, a]) => [k, animalUses(a.classId, a.state)])) : {},
        // Ticket 99: where each animal is drawn now (the owner's page draws the same walk: canvas extraWalks).
        walks: visit ? Object.fromEntries([...visit.animals].map(([k, a]) => [k, { x: Math.round(a.sprite.x), y: Math.round(a.sprite.y), stick: Boolean(a.walk.stick) }])) : {},
        stock: visit ? stockView() : '',
        applied: applied.length,
        appliedCount,
        sentOk,
        last,
        lastLine,
      };
    },
  };
}

function ensure(engine) {
  if (session) return session;
  if (engine?.mode !== 'multiplayer' || typeof document === 'undefined') return null;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  session = createSession(engine, client);
  globalThis.groddleYard = session;
  return session;
}

function visitTarget(target) {
  return target?.yardVisit && session?.visit ? target.yardVisit : null;
}

export const yardVerbsMpFeature = {
  id: YARD_VERBS_MP_ID,

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    ensure(engine)?.tick(dtMs, now);
  },

  onStreetClear() {
    session?.cleared();
  },

  verbsFor(target) {
    return session ? session.verbsFor(target) : [];
  },

  runVerb(target, verbId) {
    return session ? session.runVerb(target, verbId) : false;
  },

  /** A visited tree's or animal's menu: only what a visitor may do (the owner's verbs are left off). */
  decorateVerbs(target, verbs) {
    const v = visitTarget(target);
    if (!v || v.kind === 'plot') return null;
    if (v.kind === 'rock') return verbs.filter((row) => ['mine', 'talk_to'].includes(String(row.id || '').split(':')[0]));
    if (v.kind === 'node') return verbs;
    const ok = new Set(allowedVerbs(v.kind, target.classId));
    return verbs.filter((row) => ok.has(String(row.id || '').split(':')[0]));
  },

  /** Anything else on a visited tree or animal is its owner's. */
  runVerbOverride(target, verbId, engine) {
    const v = visitTarget(target);
    if (!v || v.kind === 'plot') return null;
    // MPVISIT: a swing or a harvest asks the site first (null: the local rules answer, a talk_to or a refusal).
    if (v.kind === 'rock' || v.kind === 'node') return session.askStock(target, verbId);
    if (allowedVerbs(v.kind, target.classId).includes(String(verbId).split(':')[0])) return null;
    engine?.toast?.(T.notYours(session.visit.name), 2400);
    return true;
  },

  /** game.js runVerb / resource-nodes verbContext: the site's chunks for the swing it just allowed. */
  sharedVerbGrant(target, verbId) {
    return session ? session.grantFor(target, verbId) : null;
  },

  save() {
    const list = session ? session.applied : savedApplied;
    return list.length ? { applied: list } : undefined;
  },

  restore(slice, engine) {
    savedApplied = engine?.mode === 'multiplayer' && Array.isArray(slice?.applied) ? slice.applied.filter((id) => typeof id === 'string') : [];
  },
};
