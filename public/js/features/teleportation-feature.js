/**
 * Teleportation as a feature module (see js/feature-host.js).
 *
 * Rules live in js/teleportation.js; this file binds them to the world:
 * - A Teleportation card in the Map panel (host mapCards hook) lists the
 *   player's 1-3 points, with Set here and Teleport buttons, the energy cost
 *   and the cooldown.
 * - Teleportation Scripts in the pack: Read, and one Teleport button per
 *   script destination (host packVerbs hook). Paper gains Create
 *   Teleportation Script at Teleportation IV with Penpersonship and a Quill.
 * - Every jump asks the host travelGate first, so the Hell feature's rules
 *   hold: the dead only move within Naraka, nobody teleports into Naraka, and
 *   Pooped blocks teleporting. Transient quest rooms keep their own exits.
 * - The jump plays a one-second shimmer (the source hit1 animation before
 *   teleportToLocationDelayed), then engine.enter() lands on the saved x/y.
 *
 * Source gaps: Teleportation Tokens were a paid web currency, so token map
 * teleports, imbuing and summons are not offered. The remake's Map already
 * travels freely between loaded streets, so Teleportation IV's map teleports
 * add nothing there; IV's new power here is writing scripts. The script's
 * free-text note is not collected.
 *
 * QA: ?autostart=1&teleportdemo=1 (optional &teleportrank=1..5) learns
 * Teleportation, sets point 1 on the first street, walks you to Sylvan Grove
 * and opens the Map; &teleportautoplay=1 then teleports home.
 * ?teleportdemo=script learns Teleportation IV + Penpersonship with a Quill and
 * Paper and stays put (click Paper in the pack); &teleportautoplay=1 writes a
 * script, travels away and reads it home.
 * &teleportfx=hold freezes the departure shimmer for a screenshot.
 * Canvas data: teleportRank, teleportPoints, teleportCooldown, teleportPhase,
 * teleportLast, teleportScripts, teleportEnergyCost.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-6';
import { getGameDayKey } from '../game-day.js?v=dametime-1';
import { canUseTool, useToolCondition } from '../tools.js?v=woodcutting-test-2';
import {
  PAPER_CLASS,
  QUILL_CLASS,
  QUILL_ITEM,
  SCRIPT_CLASS,
  SCRIPT_ITEM,
  TELEPORT_HIT_ANIMATION_MS,
  canCreateScript,
  createScript,
  listTargets,
  maxTargets,
  normalizeTeleportState,
  reconcileScripts,
  rollTeleportDay,
  scriptLabel,
  scriptTitle,
  setTarget,
  teleportEnergyCost,
  teleportRank,
  teleportToPoint,
  useScript,
} from '../teleportation.js';
import { loseEnergy } from '../metabolics.js';

export const TELEPORT_FEATURE_ID = 'teleportation';
const TANK = 100;
const NARAKA_HUB_ID = '40';
const DEMO_AWAY_STREET = 'GCR10NQRPKJ16H6'; // Sylvan Grove, Groddle Forest
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const NO_EXIT = 'This place has its own way out. Teleporting will have to wait.';

let state = normalizeTeleportState();
let pending = null; // { target, events, label, startedAt, fx }
let arrival = null; // { target, events, label } while engine.enter() runs
let engineRef = null;
let lastReconcile = 0;
let demo = { stage: 'idle', at: 0 };

const dayKey = () => getGameDayKey(Date.now());

function learned(engine) {
  return engine.learnedSkills || [];
}

function here(engine) {
  const street = engine.street || {};
  return {
    tsid: engine.streetTsid,
    x: Math.round(engine.player?.x || 0),
    y: Math.round(engine.player?.y || 0),
    label: street.label || engine.streetTsid,
    hubId: String(street.hubId || ''),
    hubName: street.hubName || '',
  };
}

function placeLabel(target) {
  if (!target) return '';
  return `${target.label || target.tsid}${target.hubName ? `, ${target.hubName}` : ''}`;
}

function unsavable(engine) {
  const home = engine.homeContext();
  return Boolean(
    engine.transientInstance() || home.inHome || String(engine.street?.hubId || '') === NARAKA_HUB_ID
  );
}

function quillWorking(engine) {
  return countItem(engine.inv, QUILL_CLASS) > 0 && canUseTool(engine.toolState, QUILL_CLASS, 1).ok;
}

function jumpCtx(engine) {
  return {
    learned: learned(engine),
    now: Date.now(),
    energy: engine.pc.energy,
    tank: TANK,
    currentTsid: engine.streetTsid,
    fromHubId: String(engine.street?.hubId || ''),
    exists: (tsid) => engine.streetExists(tsid),
    teleporting: Boolean(pending || arrival),
  };
}

function publish(engine) {
  engine.setData('teleportRank', String(teleportRank(learned(engine))));
  engine.setData(
    'teleportPoints',
    listTargets(state, learned(engine)).map((row) => `${row.id}:${row.target?.tsid || '-'}`).join(',')
  );
  engine.setData('teleportCooldown', String(Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000))));
  engine.setData('teleportPhase', pending ? 'warp' : arrival ? 'arriving' : 'idle');
  engine.setData('teleportScripts', state.scripts.map((s) => s.destination.tsid).join(','));
  engine.setData('teleportEnergyCost', String(teleportEnergyCost(learned(engine), TANK) ?? 0));
  if (engine.param('teleportdemo')) engine.setData('teleportDemo', demo.stage);
}

/* ------------------------------------------------------------------ */
/* Warp visuals                                                        */
/* ------------------------------------------------------------------ */

function buildWarpFx(engine, inbound = false) {
  const { PIXI } = engine;
  const g = new PIXI.Graphics();
  g.zIndex = 42;
  engine.fxLayer.addChild(g);
  return { g, inbound, born: Date.now() };
}

function drawWarpFx(engine, fx, now, duration) {
  const player = engine.player;
  if (!fx || !player || fx.g.destroyed) return;
  const raw = Math.min(1, (now - fx.born) / duration);
  const p = fx.inbound ? 1 - raw : raw;
  const h = Math.max(70, Math.min(150, Number(player.height) || 96));
  const g = fx.g;
  g.clear();
  // A soft beam: stacked capsules, wide and faint to narrow and bright.
  const width = 18 + p * 46;
  for (const [k, color, alpha] of [[1, 0xd9c8ff, 0.07], [0.72, 0xe4d9ff, 0.1], [0.46, 0xf3eeff, 0.14], [0.22, 0xffffff, 0.22]]) {
    const w = width * k;
    g.roundRect(player.x - w / 2, player.y - h - 60 + (1 - k) * 20, w, h + 66 - (1 - k) * 20, w / 2);
    g.fill({ color: color, alpha: alpha * (0.5 + p * 1.5) });
  }
  for (let i = 0; i < 18; i += 1) {
    const life = ((now - fx.born) / 900 + i / 18) % 1;
    const angle = i * 2.4 + life * 6;
    const r = (1 - p * 0.6) * (22 + (i % 5) * 6);
    g.circle(player.x + Math.cos(angle) * r, player.y - life * (h + 50), 1.6 + (i % 3));
    g.fill({ color: i % 3 ? 0xe9e2ff : 0xfff3c4, alpha: Math.sin(life * Math.PI) * (0.4 + p * 0.6) });
  }
  player.alpha = 1 - p * 0.85;
}

function destroyWarpFx(engine, fx) {
  if (engine?.player) engine.player.alpha = 1;
  if (!fx || fx.g.destroyed) return;
  fx.g.parent?.removeChild(fx.g);
  fx.g.destroy();
}

/* ------------------------------------------------------------------ */
/* Jumps                                                               */
/* ------------------------------------------------------------------ */

/** Shared checks before any jump: quest rooms, then the host travel gate. */
function preflight(engine, target) {
  if (pending || arrival) return { ok: false, msg: 'You are already teleporting.' };
  if (engine.transientInstance()) return { ok: false, msg: NO_EXIT };
  if (target?.tsid) {
    const gate = engine.travelGate(target.tsid);
    if (!gate.ok) return { ok: false, msg: gate.msg || 'You cannot teleport right now.' };
  }
  return { ok: true };
}

function launch(engine, out, how) {
  state = out.state;
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  if (out.energyCost) loseEnergy(engine.pc, out.energyCost);
  engine.updateHud();
  engine.closeMap();
  engine.pushActivity(
    `You begin to teleport to ${placeLabel(out.target)}.${out.energyCost ? ` -${out.energyCost} energy` : ''}`
  );
  engine.setData('teleportLast', `${how}:${out.target.tsid}:e${out.energyCost || 0}`);
  pending = { target: out.target, events: out.events, label: placeLabel(out.target), startedAt: Date.now() };
  pending.fx = buildWarpFx(engine);
  engine.save();
  publish(engine);
}

function teleportPoint(engine, id) {
  const target = state.targets[id];
  const pre = preflight(engine, target);
  if (!pre.ok) return engine.toast(pre.msg), false;
  const out = teleportToPoint(state, id, jumpCtx(engine));
  if (!out.ok) return engine.toast(out.error), false;
  launch(engine, out, `point${id}`);
  return true;
}

function setPoint(engine, id) {
  const out = setTarget(state, id, here(engine), { learned: learned(engine), unsavable: unsavable(engine) });
  if (!out.ok) return engine.toast(out.error), false;
  state = out.state;
  for (const event of out.events) engine.achievement(event.counter, event.amount);
  engine.pushActivity(`Teleportation Point ${id} set: ${placeLabel(out.target)}.`);
  engine.toast(`Teleportation Point ${id} saved here.`, 2200);
  engine.save();
  publish(engine);
  return true;
}

function readScripts(engine) {
  const lines = state.scripts.map((script) => `• ${script.title || scriptLabel(script)}`);
  const unknown = Math.max(0, countItem(engine.inv, SCRIPT_CLASS) - state.scripts.length);
  if (unknown) lines.push(`• ${unknown} with ink too smudged to read`);
  engine.prompt({
    kicker: 'Teleportation Script',
    title: 'Where does it go?',
    text: lines.length
      ? `${lines.join('\n')}\n\nOne way, one use each. Without Teleportation I you can't read the incantation aloud.`
      : 'A blank Teleportation Script.',
  });
}

function writeScript(engine) {
  const ctx = {
    learned: learned(engine),
    paper: countItem(engine.inv, PAPER_CLASS),
    quillWorking: quillWorking(engine),
    unsavable: unsavable(engine),
    now: Date.now(),
  };
  const out = createScript(state, here(engine), ctx);
  if (!out.ok) return engine.toast(out.error || 'You cannot write a script here.'), false;
  removeItem(engine.inv, PAPER_CLASS, out.costs.paper);
  const wear = useToolCondition(engine.toolState, QUILL_CLASS, out.costs.quillWear);
  loseEnergy(engine.pc, out.costs.energy); // G289 loss gate
  state = out.state;
  addItem(engine.inv, SCRIPT_CLASS, 1);
  for (const event of out.events) engine.achievement(event.counter, event.amount);
  engine.pushActivity(`${out.script.title}. ${out.message} -1 energy`);
  if (wear?.msg) engine.pushActivity(wear.msg);
  // items/teleportation_script.js 434-441: prompts_add timeout 15, no timeout_value (G198).
  engine.prompt({ kicker: 'Teleportation Script', title: out.script.title, text: out.message, timeout: 15 });
  engine.updateHud();
  engine.save();
  publish(engine);
  return true;
}

function readAloud(engine, scriptId) {
  const script = state.scripts.find((row) => row.id === scriptId);
  const pre = preflight(engine, script?.destination);
  if (!pre.ok) return engine.toast(pre.msg), false;
  const out = useScript(state, scriptId, jumpCtx(engine));
  if (!out.ok) return engine.toast(out.error), false;
  removeItem(engine.inv, SCRIPT_CLASS, 1);
  if (out.vanished) {
    state = out.state;
    engine.pc.imagination = (engine.pc.imagination || 0) + out.refundImg;
    engine.pc.xp = (engine.pc.xp || 0) + out.refundImg;
    engine.pushActivity(out.message);
    engine.updateHud();
    engine.save();
    return true;
  }
  launch(engine, out, 'script');
  return true;
}

async function land(engine) {
  const warp = pending;
  pending = null;
  destroyWarpFx(engine, warp.fx);
  arrival = warp;
  publish(engine);
  try {
    await engine.enter(warp.target.tsid, { spawnX: warp.target.x, spawnY: warp.target.y });
  } catch (err) {
    console.error(err);
    arrival = null;
    engine.toast('The teleport fizzled.');
    publish(engine);
  }
}

/* ------------------------------------------------------------------ */
/* Map card                                                            */
/* ------------------------------------------------------------------ */

const CARD_CSS = `
.tp-map-card{margin:10px 18px 14px;padding:11px 13px;border:2px solid #b9a3d6;border-radius:12px;
  background:radial-gradient(circle at 10% 15%,rgba(255,255,255,.75),transparent 30%),linear-gradient(135deg,#f1eafb,#e1d5f2);color:#4f3b66}
.tp-map-card header{display:flex;align-items:center;gap:10px}
.tp-map-card header img{width:30px;height:30px;object-fit:contain}
.tp-map-card header strong{display:block;font-size:14px}
.tp-map-card header span{display:block;font-size:11px;color:#7a6a8c}
.tp-map-card ol{list-style:none;margin:9px 0 0;padding:0;display:grid;gap:6px}
.tp-map-card li{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;background:rgba(255,255,255,.55)}
.tp-map-card li b{display:block;font-size:12px}
.tp-map-card li span{display:block;font-size:11px;color:#7a6a8c;overflow-wrap:anywhere}
.tp-map-card button{margin:0;white-space:nowrap}
.tp-map-card .tp-set{background:#fff;border:1px solid #b9a3d6;color:#5c4578;border-radius:8px;padding:5px 9px;font:inherit;font-size:12px;cursor:pointer}
.tp-map-card button[disabled]{opacity:.5;cursor:not-allowed}
@media (max-width:480px){.tp-map-card li{grid-template-columns:1fr 1fr}.tp-map-card li>div{grid-column:1/-1}}
`;

function ensureCss() {
  if (document.getElementById('tp-map-card-css')) return;
  const style = document.createElement('style');
  style.id = 'tp-map-card-css';
  style.textContent = CARD_CSS;
  document.head.appendChild(style);
}

function buildMapCard(engine) {
  const skills = learned(engine);
  const rank = teleportRank(skills);
  if (!rank) return null;
  ensureCss();
  const cost = teleportEnergyCost(skills, TANK);
  const cooling = Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
  const card = document.createElement('section');
  card.className = 'tp-map-card';
  card.dataset.teleportCard = '1';
  const head = document.createElement('header');
  const icon = document.createElement('img');
  icon.src = 'assets/sprites/icons/teleportation_script.png';
  icon.alt = '';
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `Teleportation ${ROMAN[rank]}`;
  const sub = document.createElement('span');
  sub.textContent = `${cost} energy a jump${cooling ? ` · recharging ${cooling}s` : ' · ready'} · ${maxTargets(skills)} ${maxTargets(skills) === 1 ? 'point' : 'points'}`;
  text.append(title, sub);
  head.append(icon, text);
  const list = document.createElement('ol');
  const savable = !unsavable(engine);
  for (const { id, target } of listTargets(state, skills)) {
    const row = document.createElement('li');
    const info = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = `Point ${id}`;
    const where = document.createElement('span');
    where.textContent = target ? placeLabel(target) : 'Not set yet. Stand somewhere you love and set it.';
    info.append(name, where);
    const set = document.createElement('button');
    set.type = 'button';
    set.className = 'tp-set';
    set.textContent = target ? 'Move here' : 'Set here';
    set.disabled = !savable;
    if (!savable) set.title = "You can't save this location as a Teleportation Point.";
    set.addEventListener('click', () => {
      if (setPoint(engine, id)) engine.openMap();
    });
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'content-action-btn';
    go.textContent = 'Teleport';
    go.dataset.teleportPoint = String(id);
    const blocked = !target || target.tsid === engine.streetTsid || engine.pc.energy <= cost || cooling > 0;
    go.disabled = blocked;
    if (blocked) {
      go.title = !target
        ? "You don't have a destination."
        : target.tsid === engine.streetTsid
          ? 'You are already in that location.'
          : cooling > 0
            ? 'You teleported too recently.'
            : "You don't have enough energy.";
    }
    go.addEventListener('click', () => teleportPoint(engine, id));
    row.append(info, set, go);
    list.appendChild(row);
  }
  card.append(head, list);
  return card;
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function demoStep(engine, now) {
  const mode = engine.param('teleportdemo');
  if (!mode || demo.stage === 'done' || now < demo.at || pending || arrival) return;
  // The open Map counts as busy; only the first hop waits for a quiet world.
  if (demo.stage === 'ready-to-leave' && engine.busy()) return;
  const auto = engine.param('teleportautoplay') === '1';
  if (demo.stage === 'ready-to-leave') {
    demo = { stage: 'away', at: now + 1 };
    engine.enter(DEMO_AWAY_STREET);
  } else if (demo.stage === 'away-map') {
    engine.openMap();
    demo = auto ? { stage: 'go', at: now + 1800 } : { stage: 'done', at: 0 };
  } else if (demo.stage === 'go') {
    demo = { stage: 'done', at: 0 };
    if (mode === 'script') readAloud(engine, state.scripts[0]?.id);
    else teleportPoint(engine, 1);
  }
}

function demoOnEnter(engine) {
  const mode = engine.param('teleportdemo');
  if (!mode) return;
  if (demo.stage === 'idle') {
    const rank = Math.max(1, Math.min(5, Number(engine.param('teleportrank')) || (mode === 'script' ? 4 : 1)));
    engine.grantSkill('meditativearts_1');
    for (let r = 1; r <= rank; r += 1) engine.grantSkill(`teleportation_${r}`);
    state = { ...state, cooldownUntil: 0 };
    engine.pc.energy = Math.max(engine.pc.energy, 90);
    if (mode === 'script') {
      engine.grantSkill('penmanship_1');
      if (countItem(engine.inv, QUILL_CLASS) < 1) addItem(engine.inv, QUILL_CLASS, 1);
      if (countItem(engine.inv, PAPER_CLASS) < 3) addItem(engine.inv, PAPER_CLASS, 3);
      if (engine.param('teleportautoplay') === '1' && !state.scripts.length) writeScript(engine);
      engine.closeMap();
    } else if (engine.streetTsid !== DEMO_AWAY_STREET) {
      setPoint(engine, 1);
    }
    engine.updateHud();
    const leave = engine.streetTsid !== DEMO_AWAY_STREET;
    if (mode === 'script' && engine.param('teleportautoplay') !== '1') demo = { stage: 'done', at: 0 };
    else demo = leave ? { stage: 'ready-to-leave', at: Date.now() + 1200 } : { stage: 'away-map', at: Date.now() + 1200 };
  } else if (demo.stage === 'away' && engine.streetTsid === DEMO_AWAY_STREET) {
    demo = { stage: 'away-map', at: Date.now() + 1500 };
  }
}

export const teleportationFeature = {
  id: TELEPORT_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    ensureItem(SCRIPT_CLASS, { ...SCRIPT_ITEM });
    ensureItem(QUILL_CLASS, {
      label: QUILL_ITEM.label,
      desc: QUILL_ITEM.desc,
      isTool: true,
      baseCost: QUILL_ITEM.baseCost,
      stackMax: QUILL_ITEM.stackMax,
    });
    publish(engine);
  },

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeTeleportState(slice || {});
  },

  onNewDay() {
    state = rollTeleportDay(state, dayKey());
  },

  onStreetEnter(street, engine) {
    if (arrival) {
      const done = arrival;
      arrival = null;
      const fx = buildWarpFx(engine, true);
      const born = Date.now();
      const step = () => {
        const now = Date.now();
        drawWarpFx(engine, fx, now, 900);
        if (now - born < 900) requestAnimationFrame(step);
        else destroyWarpFx(engine, fx);
      };
      requestAnimationFrame(step);
      engine.floatText(engine.player.x, engine.player.y - 110, `✦ ${done.target.label || 'Teleported'}`, 0xd9c8ff);
      engine.pushActivity(`You teleported to ${done.label}.`);
      for (const event of done.events || []) engine.achievement(event.counter, event.amount);
      engine.save();
    }
    demoOnEnter(engine);
    publish(engine);
  },

  onStreetClear(engine) {
    if (pending) {
      destroyWarpFx(engine || engineRef, pending.fx);
      pending.fx = null;
    }
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    if (now - lastReconcile > 400) {
      lastReconcile = now;
      const out = reconcileScripts(state, countItem(engine.inv, SCRIPT_CLASS));
      if (out.changed) state = out.state;
      publish(engine);
    }
    if (pending) {
      engine.player.vx = 0;
      // QA: &teleportfx=hold freezes the shimmer at 60% for a screenshot.
      if (engine.param('teleportfx') === 'hold') pending.fx.born = now - TELEPORT_HIT_ANIMATION_MS * 0.6;
      drawWarpFx(engine, pending.fx, now, TELEPORT_HIT_ANIMATION_MS);
      if (engine.param('teleportfx') !== 'hold' && now - pending.startedAt >= TELEPORT_HIT_ANIMATION_MS) land(engine);
    }
    demoStep(engine, now);
  },

  mapCards(engine) {
    const card = buildMapCard(engine);
    return card ? [card] : [];
  },

  /**
   * G221: Shift+T, the saved teleport points. TSMainView.as shiftTKeyHandler
   * 915-923 opens the map area's Teleport tab; MapChatArea.as 330-347 shows it
   * when you have Teleportation, or else the teleportation_1 skill info. Here
   * the points are the Map's Teleportation card, so the Map opens with that
   * card shown; without the skill the Skills panel opens on Teleportation I.
   * Canvas data teleportKey: points | skill.
   */
  teleportPointsKey(engine) {
    if (!teleportRank(learned(engine))) {
      engine.setData('teleportKey', 'skill');
      engine.openSkillTree?.('teleportation_1');
      return true;
    }
    engine.setData('teleportKey', 'points');
    Promise.resolve(engine.openMap()).then(() => {
      if (typeof document === 'undefined') return;
      const card = document.querySelector('#map-panel [data-teleport-card]');
      if (!card) return;
      // G192 folds the Map's extra cards into Shortcuts: open it on this card.
      const fold = card.closest('details');
      if (fold && !fold.open) fold.open = true;
      card.scrollIntoView?.({ block: 'nearest' });
    });
    return true;
  },

  packVerbs(classTsid, engine) {
    if (classTsid === SCRIPT_CLASS) {
      const ctx = jumpCtx(engine);
      const verbs = [{ id: 'read', label: 'Read', enabled: true, tooltip: 'Where does it go?' }];
      for (const script of state.scripts.slice(0, 6)) {
        const check = useScript(state, script.id, ctx);
        const reason = engine.transientInstance() ? NO_EXIT : check.ok ? '' : check.error;
        const cost = script.imbued ? 0 : teleportEnergyCost(ctx.learned, TANK) || 0;
        verbs.push({
          id: `use:${script.id}`,
          label: `Teleport to ${script.destination.label || script.destination.tsid}${cost ? ` · ${cost} energy` : ''}`,
          enabled: !reason,
          reason,
          tooltip: scriptLabel(script),
          primary: true,
        });
      }
      return verbs;
    }
    if (classTsid === PAPER_CLASS) {
      const check = canCreateScript(state, {
        learned: learned(engine),
        paper: countItem(engine.inv, PAPER_CLASS),
        quillWorking: quillWorking(engine),
        unsavable: unsavable(engine),
      });
      if (check.hidden) return null;
      return [{
        id: 'create_script',
        label: 'Create Teleportation Script',
        enabled: check.ok,
        reason: check.error || '',
        tooltip: 'Turn into a Teleportation Script. Costs 1 energy',
      }];
    }
    return null;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid === SCRIPT_CLASS) {
      if (verbId === 'read') readScripts(engine);
      else if (verbId.startsWith('use:')) readAloud(engine, verbId.slice(4));
      else return false;
      return true;
    }
    if (classTsid === PAPER_CLASS && verbId === 'create_script') {
      writeScript(engine);
      return true;
    }
    return false;
  },

  /**
   * Hand the player an imbued script to `destination` ({ tsid, x, y, label,
   * hubName }), e.g. street project rewards (players/inc_jobs.js
   * jobs_familiar_job_complete_do). Imbued scripts need no skill or energy.
   */
  grantScript(engine, destination) {
    if (!destination?.tsid) return null;
    const s = normalizeTeleportState(state);
    const script = {
      id: `tps${s.nextScriptId}`,
      destination,
      imbued: true,
      title: scriptTitle(destination),
      createdAt: Date.now(),
    };
    s.nextScriptId += 1;
    s.scripts.push(script);
    state = normalizeTeleportState(s);
    addItem(engine.inv, SCRIPT_CLASS, 1);
    publish(engine);
    return script;
  },

  /** QA / tests. */
  _state() {
    return state;
  },
};
