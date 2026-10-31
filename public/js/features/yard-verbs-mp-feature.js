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
 *   of the owner's plot (js/patches.js, as the patches feature runs them);
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
 * Multiplayer only (engine.mode and the realtime client): solo never runs any
 * of it.
 *
 * QA: window.groddleYard in multiplayer: state(), act(what, verb) with what
 * 'plot:<key>' | 'tree:<key>' | 'animal:<id>', standNear(what), refresh();
 * canvas data yardVisit (owner:patches:trees:animals), yardLast,
 * yardApplied (acts applied to my home), yardSent (acts the site took).
 */

import { performPlotVerb, plotArtPath, plotLabel, plotStatusLabel, plotVerbs } from '../patches.js?v=3996c344';
import { trantStatusLabel } from '../trants.js?v=9c2e8c0f';
import { woodTreeStatusLabel } from '../woodcutting.js?v=4e140315';
import { animalStatusLabel } from '../animals.js?v=e857d0af';
import { frameTexture, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js?v=db2ce452';
import { homeStreetLayout, normalizeCultivationState } from '../home-cultivation.js?v=9d3a8ec3';
import { readVisitScene } from '../neighbours-mp.js?v=31a75688';
import { saveStore } from '../save-store.js?v=b74a8113';
import { STREET_GROUND_Y } from './homes-feature.js?v=fd5fe91c';
import { patchesFeature, treeFrameUrl } from './patches-feature.js?v=9cf66cf0';
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
} from '../yard-verbs-mp.js?v=40912008';
import { itemZ } from '../item-bands.js?v=e98b10bc';

export { YARD_VERBS_MP_ID };

const CLASS_PLOT = 'mp_yard_plot';
const WOOD_SHEET = Object.freeze({ url: 'assets/sprites/wood_tree_maturity_6_variant_2_x6_1_png_1354833445.png', fw: 88, fh: 138, count: 6 });
const SCAN_MS = 300;
const OWN_FETCH_MS = 30000;

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
    engine.setData?.('yardVisit', v ? `${v.owner}:${v.plots.size}:${v.trees.size}:${v.animals.size}` : '');
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
    for (const map of [visit.plots, visit.trees, visit.animals]) {
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
    spr.anchor.set(0.5, classId === 'npc_butterfly' ? 0.5 : 1);
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
    visit.animals.set(row.id, { id: row.id, classId: row.classId, state, sprite, target, baseX: row.x, vx: row.id.length % 2 ? 0.45 : -0.45, phase: 0, snap: animalUses(row.classId, state) });
  }

  function draw(view, tsid, name) {
    clearVisit();
    visit = { owner: view.owner, name, tsid, view, plots: new Map(), trees: new Map(), animals: new Map() };
    const hx = houseX(view);
    view.patches.forEach((p, i) => drawPatch(p, hx + p.rx, i));
    for (const row of view.animals) drawAnimal(row);
    publish();
  }

  async function loadVisit(tsid) {
    const scene = readVisitScene(tsid);
    if (!scene || scene.room !== 'street' || loading === tsid) return;
    loading = tsid;
    try {
      const view = normalizeYardView(await site.yard(scene.owner));
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
      const view = normalizeYardView(await site.yard(visit.owner));
      if (!view || !visit || visit.tsid !== tsid) return;
      visit.view = view;
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
      hubId: null,
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
      .filter((v) => v.id === 'tend' || v.id === 'dig')
      .map((v) => ({ id: v.id, label: v.label, enabled: v.enabled, tooltip: v.tooltip, reason: v.reason, energy: v.energy || 0, durationMs: v.enabled ? v.durationMs || 0 : 0 }));
  }

  function runVerb(target, verbId) {
    const e = plotOf(target);
    if (!e) return false;
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
    engine.playSound?.(verbId === 'dig' ? 'SHOVEL' : 'HOE', { volume: 0.6, jitter: 0.05 });
    engine.refreshPack?.();
    redrawPlot(e);
    engine.save?.();
    send('plot', e.key, verbId);
    return true;
  }

  // —— The server's answers ——

  client.on('msg:home_yard_done', (msg) => {
    const ask = sent.get(Number(msg.req));
    sent.delete(Number(msg.req));
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
      const changed = applyYardAct(slots, act);
      appliedCount += 1;
      last = `applied:${act.kind}:${act.target}:${act.verb}`;
      if (!changed) continue;
      const line = T.acted(act.from.name, act.verb, changed.what);
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

  function stepAnimals(dtMs) {
    if (!visit) return;
    for (const a of visit.animals.values()) {
      const spr = a.sprite;
      if (!spr || spr.destroyed || !spr.loop) continue;
      const left = a.baseX - 110;
      const right = a.baseX + 110;
      if (a.classId === 'npc_butterfly') {
        a.phase += dtMs / 1000;
        spr.x = a.baseX + Math.sin(a.phase * 0.5) * 110;
        spr.y = STREET_GROUND_Y - 90 + Math.sin(a.phase * 1.3) * 14;
      } else {
        spr.x += a.vx * (dtMs / 16.67);
        if (spr.x < left || spr.x > right) {
          spr.x = Math.min(right, Math.max(left, spr.x));
          a.vx *= -1;
        }
        spr.scale.x = Math.abs(spr.baseScale) * (a.vx > 0 ? -1 : 1);
      }
    }
  }

  return {
    get visit() { return visit; },
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
      const e = kind === 'plot' ? visit?.plots.get(id) : kind === 'tree' ? visit?.trees.get(id) : visit?.animals.get(id);
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
      const e = kind === 'plot' ? visit?.plots.get(id) : kind === 'tree' ? visit?.trees.get(id) : visit?.animals.get(id);
      const p = engine.player;
      if (!p || !e?.sprite) return false;
      p.x = e.sprite.x - 40;
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
    const ok = new Set(allowedVerbs(v.kind, target.classId));
    return verbs.filter((row) => ok.has(String(row.id || '').split(':')[0]));
  },

  /** Anything else on a visited tree or animal is its owner's. */
  runVerbOverride(target, verbId, engine) {
    const v = visitTarget(target);
    if (!v || v.kind === 'plot') return null;
    if (allowedVerbs(v.kind, target.classId).includes(String(verbId).split(':')[0])) return null;
    engine?.toast?.(T.notYours(session.visit.name), 2400);
    return true;
  },

  save() {
    const list = session ? session.applied : savedApplied;
    return list.length ? { applied: list } : undefined;
  },

  restore(slice, engine) {
    savedApplied = engine?.mode === 'multiplayer' && Array.isArray(slice?.applied) ? slice.applied.filter((id) => typeof id === 'string') : [];
  },
};
