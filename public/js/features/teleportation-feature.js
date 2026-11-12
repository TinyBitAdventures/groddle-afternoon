/**
 * Teleportation as a feature module (see js/feature-host.js).
 *
 * Rules live in js/teleportation.js; this file binds them to the world:
 * - A Teleportation card in the Map panel (host mapCards hook) lists the
 *   player's 1-3 points, with Set here and Teleport buttons, the energy cost
 *   and the cooldown.
 * - Teleportation Scripts in the pack: each is its own copy with its own
 *   destination (js/tools.js row.tags, kind "script"), one to a slot and named
 *   for its street; Read and Teleport act on the one picked (host packVerbs
 *   hook). Paper gains Create Teleportation Script at Teleportation IV with
 *   Penpersonship and a Quill.
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
 * teleportLast, teleportScripts (each copy's street, - for one with none), teleportEnergyCost.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=5be47371';
import { getGameDayKey } from '../game-day.js?v=84569fa2';
import { canUseTool, copyForVerb, copyTag, copyTags, setCopyTag, takeToolCopy, useToolCondition } from '../tools.js?v=5f482998';
import {
  PAPER_CLASS,
  QUILL_CLASS,
  QUILL_ITEM,
  SCRIPT_CLASS,
  SCRIPT_ITEM,
  TELEPORT_HIT_ANIMATION_MS,
  adoptScripts,
  canCreateScript,
  canMapTeleport,
  createScript,
  listTargets,
  mapTeleport,
  maxTargets,
  normalizeTeleportState,
  rollTeleportDay,
  scriptFromTag,
  scriptLabel,
  scriptTag,
  setTarget,
  teleportEnergyCost,
  teleportRank,
  teleportToPoint,
  useScript,
} from '../teleportation.js?v=1050225e';
import { loseEnergy } from '../metabolics.js?v=8504134e';

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

/** Every script's own words, in pack order (none held: no row is made for them). */
function heldTags(engine) {
  return engine.toolState && countItem(engine.inv, SCRIPT_CLASS) > 0 ? copyTags(engine.toolState, SCRIPT_CLASS) : [];
}

/** The script a verb is about: the one picked in the pack, else the first. -1 when none is held. */
function scriptCopy(engine, copy = null) {
  return engine.toolState ? copyForVerb(engine.toolState, SCRIPT_CLASS, copy) : -1;
}

function scriptAt(engine, at) {
  return at >= 0 ? scriptFromTag(copyTag(engine.toolState, SCRIPT_CLASS, at)) : null;
}

/** A script just made or given: the new copy (the last) takes its words. */
function addScript(engine, script) {
  addItem(engine.inv, SCRIPT_CLASS, 1);
  setCopyTag(engine.toolState, SCRIPT_CLASS, countItem(engine.inv, SCRIPT_CLASS) - 1, scriptTag(script));
}

/**
 * Destinations from before each script kept its own (js/teleportation.js adoptScripts): a script
 * with none takes one, on load and whenever one comes back up from where an older save left it.
 */
function settleScripts(engine) {
  if (!engine?.toolState || (!state.scripts.length && !state.looseScripts.length)) return;
  const held = heldTags(engine);
  const out = adoptScripts(state, held);
  state = out.state;
  out.tags.forEach((tag, i) => {
    if (tag !== held[i]) setCopyTag(engine.toolState, SCRIPT_CLASS, i, tag);
  });
}

function publish(engine) {
  engine.setData('teleportRank', String(teleportRank(learned(engine))));
  engine.setData(
    'teleportPoints',
    listTargets(state, learned(engine)).map((row) => `${row.id}:${row.target?.tsid || '-'}`).join(',')
  );
  engine.setData('teleportCooldown', String(Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000))));
  engine.setData('teleportPhase', pending ? 'warp' : arrival ? 'arriving' : 'idle');
  engine.setData('teleportScripts', heldTags(engine).map((t) => t?.tsid || '-').join(','));
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
    // via 'teleport': teleportation_can_teleport (players/inc_teleportation.js 126, 219-223) refuses a street still being built.
    const gate = engine.travelGate(target.tsid, { via: 'teleport' });
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

/** The Map's street menu: a street you clicked, with what the map knows of it. */
function mapTarget(opts = {}) {
  return { tsid: String(opts.tsid || ''), label: opts.label || '', hubId: String(opts.hubId || ''), hubName: opts.hubName || '' };
}

function mapCtx(engine, target) {
  return { ...jumpCtx(engine), visited: (engine.visitedStreets?.() || []).includes(target.tsid) };
}

/** "Teleport Here" from the Map (teleportation_map_teleport). */
function teleportFromMap(engine, opts) {
  const target = mapTarget(opts);
  const pre = preflight(engine, target);
  if (!pre.ok) return engine.toast(pre.msg), false;
  const out = mapTeleport(state, target, mapCtx(engine, target));
  if (!out.ok) return engine.toast(out.error), false;
  launch(engine, out, 'map');
  return true;
}

function setPoint(engine, id) {
  const out = setTarget(state, id, here(engine), { learned: learned(engine), unsavable: unsavable(engine) });
  if (!out.ok) return engine.toast(out.error), false;
  state = out.state;
  for (const event of out.events) engine.achievement(event.counter, event.amount);
  engine.pushActivity(`Teleportation Point ${id} set: ${placeLabel(out.target)}.`);
  engine.toast(`Teleportation location set to ${placeLabel(out.target)}`, 2200); // TeleportationManager.as 78
  engine.save();
  publish(engine);
  return true;
}

/** teleportation_script.js readScript: the one picked. */
function readScript(engine, copy = null) {
  const script = scriptAt(engine, scriptCopy(engine, copy));
  engine.prompt({
    kicker: 'Teleportation Script',
    title: script ? script.title : 'Where does it go?',
    text: !script
      ? 'The ink on this one is too smudged to read.'
      : script.imbued
        ? 'One way, one use. Someone already paid for this ride: no energy, and no skill needed.'
        : "One way, one use. Without Teleportation I you can't read the incantation aloud.",
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
  addScript(engine, out.script);
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

function readAloud(engine, copy = null) {
  const at = scriptCopy(engine, copy);
  const script = scriptAt(engine, at);
  const pre = preflight(engine, script?.destination);
  if (!pre.ok) return engine.toast(pre.msg), false;
  const out = useScript(state, script, jumpCtx(engine));
  if (!out.ok) return engine.toast(out.error), false;
  // This one leaves from its own slot, and its destination with it (the others keep theirs).
  engine.query?.('packTakeUnit', SCRIPT_CLASS, at, 1, engine);
  takeToolCopy(engine.toolState, SCRIPT_CLASS, { copy: at });
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
.tp-map-card{margin:var(--sp-5) var(--sp-9) var(--sp-7);padding:11px 13px;border:2px solid var(--c-violet-75);border-radius:var(--radius-xl);
  background:radial-gradient(circle at 10% 15%,color-mix(in srgb, var(--surface-bright) 75%, transparent),transparent 30%),linear-gradient(135deg,var(--surface-lilac),var(--c-mauve-89));color:var(--c-violet-39)}
.tp-map-card header{display:flex;align-items:center;gap:var(--sp-5)}
.tp-map-card header img{width:30px;height:30px;object-fit:contain}
.tp-map-card header strong{display:block;font-size:var(--fs-base)}
.tp-map-card header span{display:block;font-size:var(--fs-xs);color:var(--c-violet-55)}
.tp-map-card ol{list-style:none;margin:9px 0 0;padding:0;display:grid;gap:var(--sp-3)}
.tp-map-card li{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-3) var(--sp-4);padding:var(--sp-3) var(--sp-4);border-radius:var(--radius-md);background:color-mix(in srgb, var(--surface-bright) 55%, transparent)}
.tp-map-card li>div:first-child{flex:1 1 11rem;min-width:min(100%,9rem)}
.tp-map-card li b{display:block;font-size:var(--fs-sm)}
.tp-map-card li span{display:block;font-size:var(--fs-xs);color:var(--c-violet-55);overflow-wrap:break-word}
.tp-map-card .tp-actions{display:flex;flex:0 1 auto;align-items:center;gap:var(--sp-3);max-width:100%}
.tp-map-card .tp-actions>.tp-set{flex:0 1 auto;min-width:0}
.tp-map-card .tp-actions>.content-action-btn{flex:none}
.tp-map-card button{margin:0;white-space:nowrap}
.tp-map-card .tp-set{background:var(--surface-bright);border:1px solid var(--c-violet-75);color:var(--c-violet-44);border-radius:var(--radius-md);padding:5px 9px;font:inherit;font-size:var(--fs-sm);cursor:pointer}
.tp-map-card button[disabled]{opacity:.5;cursor:not-allowed}
.tp-map-card li .tp-set{white-space:normal;text-align:center}
.tp-map-card ol[hidden]{display:none}
.tp-map-card .tp-confirm{margin-top:9px;padding:var(--sp-4);border-radius:var(--radius-md);background:color-mix(in srgb, var(--surface-bright) 55%, transparent)}
.tp-map-card .tp-confirm strong{display:block}
.tp-map-card .tp-confirm p{margin:var(--sp-2) 0 var(--sp-4);font-size:var(--fs-sm)}
.tp-map-card .tp-confirm-actions{display:flex;gap:var(--sp-3);flex-wrap:wrap}
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
  icon.src = 'assets/sprites/icons/teleportation_script.webp';
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
    // Ticket 91: the client's labels, "Edit" on a set point and "Set this location as Teleport Point"
    // on an empty one (TeleportationDialog.as 283-305), and a press only asks (confirmSetPoint): "Move
    // here" beside "Teleport" saved over a point on one click.
    const set = document.createElement('button');
    set.type = 'button';
    set.className = 'tp-set';
    set.dataset.teleportSet = String(id);
    set.textContent = target ? 'Edit' : 'Set this location as Teleport Point';
    if (target) set.setAttribute('aria-label', `Edit Point ${id}`);
    set.disabled = !savable;
    if (!savable) set.title = "You can't save this location as a Teleportation Point.";
    set.addEventListener('click', () => confirmSetPoint(engine, card, id));
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
    // SHORTCUTS (Austin 2026-11-04, Groddle Meadow at 1000 x 700): the point's name and its line keep a
    // readable width and the two buttons stay together, beside them when the card is wide and under
    // them when it is not (CARD_CSS li, .tp-actions); three columns squeezed the words to one a line.
    const actions = document.createElement('div');
    actions.className = 'tp-actions';
    actions.append(set, go);
    row.append(info, actions);
    list.appendChild(row);
  }
  card.append(head, list);
  return card;
}

/**
 * "New Teleport Point?" (TeleportationDialog.as onTeleportSetClick 381-401, onConfirmClick 403-415):
 * the card's points give way to the question, and only "Save this point" sets it; Cancel (or Esc)
 * brings the points back, unchanged.
 */
function confirmSetPoint(engine, card, id) {
  const list = card.querySelector('ol');
  card.querySelector('[data-teleport-confirm]')?.remove();
  const pane = document.createElement('div');
  pane.className = 'tp-confirm';
  pane.dataset.teleportConfirm = String(id);
  pane.setAttribute('role', 'group');
  const title = document.createElement('strong');
  title.id = `tp-confirm-title-${id}`;
  title.textContent = 'New Teleport Point?';
  pane.setAttribute('aria-labelledby', title.id);
  const body = document.createElement('p');
  const place = placeLabel(here(engine));
  body.append('Make a teleport point to ');
  const where = document.createElement('b');
  where.textContent = place || 'your current position';
  body.append(where, "? When you teleport, you'll arrive here.");
  const actions = document.createElement('div');
  actions.className = 'tp-confirm-actions';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'content-action-btn';
  save.dataset.teleportSave = String(id);
  save.textContent = 'Save this point';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'tp-set';
  cancel.dataset.teleportCancel = String(id);
  cancel.textContent = 'Cancel';
  actions.append(save, cancel);
  pane.append(title, body, actions);
  const back = () => {
    pane.remove();
    if (list) list.hidden = false;
    card.querySelector(`[data-teleport-set="${id}"]`)?.focus({ preventScroll: true });
  };
  save.addEventListener('click', () => {
    if (setPoint(engine, id)) engine.openMap();
    else back();
  });
  cancel.addEventListener('click', back);
  pane.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    back();
  });
  if (list) list.hidden = true;
  card.append(pane);
  save.focus({ preventScroll: true });
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
    if (mode === 'script') readAloud(engine, 0);
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
      if (engine.param('teleportautoplay') === '1' && !countItem(engine.inv, SCRIPT_CLASS)) writeScript(engine);
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

  restore(slice, engine) {
    state = normalizeTeleportState(slice || {});
    settleScripts(engine || engineRef);
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
      settleScripts(engine);
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

  /**
   * The Map's street menu asks here (engine.query('mapTeleport', action, opts, engine)):
   * 'check' -> { ok, error, energyCost, tooltip } for the Teleport Here entry, 'go' teleports.
   */
  mapTeleport(action, opts, engine) {
    const target = mapTarget(opts);
    if (action === 'check') {
      const pre = preflight(engine, target);
      if (!pre.ok) return { ok: false, error: pre.msg };
      return canMapTeleport(state, target, mapCtx(engine, target));
    }
    if (action === 'go') return teleportFromMap(engine, opts);
    return null;
  },

  /**
   * Ticket 81 (the Projects panel's Teleport): a Teleportation Script in the pack that goes to
   * `tsid` (an imbued one from a finished project, or one you wrote), read as its pack verb reads it.
   * 'check' -> null when you hold none, else { ok, error, copy, imbued, energyCost }; 'go' reads it.
   */
  teleportScriptTo(action, tsid, engine) {
    const want = String(tsid || '').replace(/^L/, 'G');
    const at = want ? heldTags(engine).findIndex((t) => String(t?.tsid || '').replace(/^L/, 'G') === want) : -1;
    if (at < 0) return null;
    if (action === 'go') return readAloud(engine, at);
    if (action !== 'check') return null;
    const script = scriptAt(engine, at);
    const pre = preflight(engine, script.destination);
    if (!pre.ok) return { ok: false, error: pre.msg, copy: at, imbued: script.imbued };
    const ctx = jumpCtx(engine);
    const check = useScript(state, script, ctx);
    const energyCost = script.imbued ? 0 : teleportEnergyCost(ctx.learned, TANK) || 0;
    return { ok: check.ok, error: check.ok ? '' : check.error, copy: at, imbued: script.imbued, energyCost };
  },

  /**
   * teleportation_script.js getLabel 254-260: a script goes by where it goes, in the pack from its copy
   * and on the ground from its stack's first (`tag`). One with no destination keeps the plain name.
   */
  itemDisplayName(classTsid, copy = null, engine = null, tag = undefined) {
    if (classTsid !== SCRIPT_CLASS) return null;
    const eng = engine || engineRef;
    const script = tag !== undefined ? scriptFromTag(tag) : eng?.toolState ? scriptAt(eng, scriptCopy(eng, copy)) : null;
    return script ? { label: scriptLabel(script), kind: script.imbued ? 'Free one-way trip' : 'One-way trip', one: true, wrap: true } : null;
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

  packVerbs(classTsid, engine, opts = {}) {
    if (classTsid === SCRIPT_CLASS) {
      const ctx = jumpCtx(engine);
      const verbs = [{ id: 'read', label: 'Read', enabled: true, tooltip: 'Where does it go?' }];
      const script = scriptAt(engine, scriptCopy(engine, opts.copy));
      if (script) {
        const check = useScript(state, script, ctx);
        const reason = engine.transientInstance() ? NO_EXIT : check.ok ? '' : check.error;
        const cost = script.imbued ? 0 : teleportEnergyCost(ctx.learned, TANK) || 0;
        verbs.push({
          id: 'use',
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

  runPackVerb(classTsid, verbId, engine, opts = {}) {
    if (classTsid === SCRIPT_CLASS) {
      if (verbId === 'read') readScript(engine, opts.copy);
      else if (verbId === 'use') readAloud(engine, opts.copy);
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
    const script = { destination, imbued: true };
    if (!scriptTag(script)) return null;
    addScript(engine, script);
    publish(engine);
    return scriptFromTag(scriptTag(script));
  },

  /** QA / tests. */
  _state() {
    return state;
  },
};
