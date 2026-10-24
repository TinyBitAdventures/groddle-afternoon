/**
 * Quest instances: the shared runtime for the rebuilt quest rooms
 * (architecture step 3). Rules live in js/quest-instance.js; each room is one
 * module under js/quest-rooms/ (loaded on demand), listed with its quests in
 * js/quest-rooms/catalog.js.
 *
 * Flow (players/inc_quests.js questInstanceLocation, quests/*.js onStarted):
 *  - The Magic Rock offers the quest through the ordinary offer engine. Once
 *    it is accepted this feature starts it: saves the return point, freezes
 *    travel, enters the room (a feature scene via engine.enterScene, or an
 *    imported street held with engine.instanceHold) and shows the room HUD.
 *  - The room drives the quest's requirement flags (ctx.progress). Leaving a
 *    solved room sets the `leave` flag and returns home, where a complete
 *    quest turns in with its source completion text and rewards.
 *  - Leaving early, running out of time or reloading inside fails the run:
 *    progress resets and the quest's giver (catalog.js questGiver: the Magic
 *    Rock, the Butler, Gwendolyn, the Play Cube …) asks "Want another go?"
 *    later (the source failQuest left it restartable from the quest log).
 *
 * Room module contract (all optional except id/title/build or street):
 *   { id, title, kicker, icon, theme, durationMs | durationFor(questId),
 *     firstStage, stageLabel(stage), loadingLabel(stage) (the loading card's line, else stageLabel),
 *     build(ctx, stage) -> { width, height, background, platforms, walls,
 *                            barriers, spawn: {x,y}, label, hubName }
 *     street(ctx, stage) -> { tsid, x, y }      (an imported street instead)
 *     enter(ctx, stage), tick(ctx, dtMs, now), clear(ctx),
 *     verbs(ctx, target) -> verbs, runVerb(ctx, target, verbId) -> true,
 *     objective(ctx) -> { text, stats: [[label, value]] },
 *     physics(ctx), onLeave(ctx, outcome) -> { keepQuest }, onExpire(ctx),
 *     autoplay(ctx, mode) -> Promise,
 *     world: { onStreetEnter(wctx, street), onTick(wctx, dt, now),
 *              verbs(wctx, target), runVerb(wctx, target, verb),
 *              packVerbs(wctx, cls), runPackVerb(wctx, cls, verb),
 *              verbOverride(wctx, target), runVerbOverride(wctx, target, verb) } }
 *   `world` hooks run on ordinary streets while one of the room's quests is
 *   active (Carry That Weight's dig sites).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questdemo=<quest_id> accepts the quest
 * (prereqs skipped) and enters its room; &questautoplay=1 (or a room mode)
 * plays it through; &questfx=0 skips the loading crossfade;
 * &questdemoflow=accept only accepts it, so the ordinary start hook enters the
 * room (the path a Magic Rock offer takes). Canvas data:
 * qiQuest, qiRoom, qiStage, qiStatus, qiRemaining, qiObjective, qiOutcome,
 * qiTurnedIn, qiRetry, qiRetryGiver, qiAutoplay, plus each room's own keys.
 */

import {
  LOW_TIME_MS,
  changeInstanceStage,
  createQuestInstance,
  extendQuestInstance,
  finishQuestInstance,
  formatInstanceClock,
  instanceRemainingMs,
  isQuestSceneTsid,
  normalizeInstanceSave,
  questSceneTsid,
  reloadTarget,
  runFlag,
  setRunFlag,
  solveQuestInstance,
  stepQuestInstance,
} from '../quest-instance.js?v=qi-1';
import { FAMILIAR_GATES, QUEST_ROOMS, REMINISCE_ITEMS, ROOM_ITEMS, isBuiltRoom, questGiver, roomModulePath } from '../quest-rooms/catalog.js?v=qi-2';
import * as kit from '../quest-rooms/kit.js?v=qi-1';
import { locationEventsApi } from './location-events-feature.js?v=location-events-1';
import {
  acceptOffer,
  ensureQuestOfferState,
  npcQuestOffers,
  questAwardPayload,
  turnInQuest,
} from '../quest-offers.js';
import { parseQuestConversation } from '../quests.js';
import { getQuestCatalog } from '../content-catalogs.js';
import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-3';
import { runStreetTransition } from '../screen-fx.js';
import { collectQuoin, QUOIN_SHEET, QUOIN_TYPES } from '../quoins.js';
import { sourceFromUrl } from '../textures.js';

let quoinFrames = null;
function quoinTexture(PIXI, type) {
  if (!quoinFrames) {
    const base = sourceFromUrl(QUOIN_SHEET.url);
    quoinFrames = {};
    for (const def of Object.values(QUOIN_TYPES)) {
      quoinFrames[def.id] = new PIXI.Texture(
        { source: base, frame: new PIXI.Rectangle(0, def.row * QUOIN_SHEET.frameHeight, QUOIN_SHEET.frameWidth, QUOIN_SHEET.frameHeight) },
      );
    }
  }
  return quoinFrames[type] || quoinFrames.xp;
}

export const QUEST_INSTANCES_FEATURE_ID = 'quest-instances';
const RETRY_CHECK_MS = 30_000;
const RETRY_SNOOZE_MS = 5 * 60_000;
const START_DELAY_MS = 1_400;
const HOUR_MS = 60 * 60 * 1000;

let save = normalizeInstanceSave();
let run = null; // js/quest-instance.js run
let room = null; // loaded room module for `run`
let ctx = null; // room context for `run`
let entering = false;
let hud = null;
let dialog = null;
const loaded = new Map(); // roomId -> room module (or null on failure)
const loading = new Map();
let engineRef = null;
let nextRetryAt = 0;
let pendingStart = null; // { questId, at }
let demo = { quest: '', mode: '', stage: 'idle' };
let lastData = 0;
let worldCtx = null;
let rubeTraded = false;

/* ------------------------------------------------------------------ */
/* Room loading                                                         */
/* ------------------------------------------------------------------ */

function loadRoom(roomId) {
  if (loaded.has(roomId)) return Promise.resolve(loaded.get(roomId));
  if (!loading.has(roomId)) {
    const path = roomModulePath(roomId).replace(/^\.\//, '../quest-rooms/');
    loading.set(
      roomId,
      import(`${path}?v=qi-1`)
        .then((mod) => {
          const def = mod.room || mod.default || null;
          loaded.set(roomId, def);
          return def;
        })
        .catch((err) => {
          console.warn('quest room', roomId, err);
          loaded.set(roomId, null);
          return null;
        })
    );
  }
  return loading.get(roomId);
}

const questDef = (id) => getQuestCatalog()?.[id] || null;

/** Who offered a room's quest (the Butler, Gwendolyn, the Play Cube … or the Magic Rock). */
function giverFor(engine, id) {
  const gate = FAMILIAR_GATES[id];
  const familiar = Boolean(gate) && engine?.questCustomPrereq?.(id, { condition: 'custom_code', value: gate }) === true;
  return questGiver(questDef(id), { familiar });
}
const roomQuests = () => Object.keys(QUEST_ROOMS).filter((id) => isBuiltRoom(QUEST_ROOMS[id]) || demo.quest === id);

/* ------------------------------------------------------------------ */
/* Quest progress                                                       */
/* ------------------------------------------------------------------ */

function questCtx(engine) {
  return {
    level: engine.pc.level,
    xp: engine.pc.xp,
    skills: engine.learnedSkills,
    achievements: engine.unlockedAchievements,
    inv: engine.inv,
    pc: engine.pc,
    hub: engine.street?.hubId || '',
    now: Date.now(),
    addItem,
    removeItem,
    countItem,
    customPrereq: (id, p) => customPrereq(id, p, engine),
  };
}

function activeQuest(engine, questId) {
  return engine.questState?.active?.[questId] || null;
}

/** Set (flag) or add to (counter) one requirement of an active quest. */
function progress(engine, questId, name, amount = 1) {
  const quest = activeQuest(engine, questId);
  const def = questDef(questId);
  if (!quest || !def) return false;
  const req = (def.requirements || []).find((r) => r.name === name);
  if (!req) return false;
  quest.progress ||= {};
  const before = Number(quest.progress[name]) || 0;
  const next = req.type === 'flag' ? 1 : Math.min(Number(req.num) || 1, before + Math.max(1, Number(amount) || 1));
  quest.progress[name] = next;
  if (next !== before) engine.updateHud();
  return next !== before;
}

function requirementsMet(engine, questId) {
  const quest = activeQuest(engine, questId);
  const def = questDef(questId);
  if (!quest || !def) return false;
  return (def.requirements || []).every((req) => {
    if (req.type === 'item') return countItem(engine.inv, req.classId) >= (Number(req.num) || 1);
    const v = Number(quest.progress?.[req.name]) || 0;
    return req.type === 'flag' ? v > 0 : v >= (Number(req.num) || 1);
  });
}

function resetProgress(engine, questId) {
  const quest = activeQuest(engine, questId);
  if (!quest) return;
  for (const key of Object.keys(quest.progress || {})) quest.progress[key] = 0;
  engine.updateHud();
}

/** Turn in a complete quest: completion text + rewards. Resolves after the award closes. */
async function turnIn(engine, questId, opts = {}) {
  if (!activeQuest(engine, questId)) return false;
  if (!opts.force && !requirementsMet(engine, questId)) return false;
  const done = turnInQuest(engine.questState, questId, engine.pc, { ...questCtx(engine), force: opts.force === true });
  if (!done.ok) return false;
  const mem = (save.memory[questId] ||= {});
  mem.doneAt = Date.now();
  mem.completions = (Number(mem.completions) || 0) + 1;
  delete mem.started;
  delete save.retry[questId];
  engine.setData('qiTurnedIn', questId);
  engine.playSound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
  engine.pushActivity(`Quest complete: ${done.def.title}`);
  engine.refreshPack();
  engine.updateHud();
  engine.save();
  const payload = { ...questAwardPayload(done.def, done.rewards || {}), ...(opts.payload || {}) };
  await engine.award(payload);
  return true;
}

/** GSJS failQuest: progress resets; the quest's giver offers a retry later. */
function failQuest(engine, questId) {
  resetProgress(engine, questId);
  const mem = (save.memory[questId] ||= {});
  mem.failedAt = Date.now();
  delete mem.started;
  if (activeQuest(engine, questId)) save.retry[questId] = Date.now();
}

/** custom_code prerequisites from catalog.js OFFER_OVERRIDES. */
function customPrereq(questId, prereq, engine) {
  const value = String(prereq?.value || '');
  const now = Date.now();
  if (value.startsWith('hour_after:')) {
    const other = value.slice('hour_after:'.length);
    const mine = save.memory[questId] || {};
    const theirs = save.memory[other] || {};
    if (mine.doneAt && now - mine.doneAt < HOUR_MS) return false;
    if (mine.failedAt && now - mine.failedAt < HOUR_MS) return false;
    if (other !== questId && theirs.doneAt && now - theirs.doneAt < HOUR_MS) return false;
    return true;
  }
  // canOffer waits of several hours (hours_after:4:<quest>: Esquibeth's reminisce, a game day).
  const hours = value.match(/^hours_after:(\d+(?:\.\d+)?):(.+)$/);
  if (hours) {
    const ms = Number(hours[1]) * HOUR_MS;
    const mine = save.memory[questId] || {};
    const theirs = save.memory[hours[2]] || {};
    if (mine.doneAt && now - mine.doneAt < ms) return false;
    if (mine.failedAt && now - mine.failedAt < ms) return false;
    if (hours[2] !== questId && theirs.doneAt && now - theirs.doneAt < ms) return false;
    return true;
  }
  if (value.startsWith('upgrades:')) {
    const have = new Set(engine.pc?.imaginationUpgrades || []);
    return value.slice('upgrades:'.length).split(',').every((id) => have.has(id));
  }
  if (value === 'rube_traded') return rubeTraded;
  return false;
}

/* ------------------------------------------------------------------ */
/* Dialogue                                                             */
/* ------------------------------------------------------------------ */

const DIALOG_STYLE = `
.qi-hud{position:absolute;z-index:79;top:66px;left:50%;width:min(650px,calc(100% - 32px));padding:10px 14px 11px;transform:translateX(-50%);
 color:#3b3a33;border:2px solid rgba(255,255,255,.85);border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(238,244,250,.95));
 box-shadow:0 10px 30px rgba(31,48,66,.28),inset 0 0 0 1px rgba(160,180,200,.35);backdrop-filter:blur(7px);pointer-events:none;font-family:inherit}
.qi-hud[hidden]{display:none}
.qi-hud.is-covered{visibility:hidden}
.qi-hud-heading{display:grid;grid-template-columns:38px 1fr auto auto;align-items:center;gap:9px}
.qi-hud-heading img{width:34px;height:34px;object-fit:contain}
.qi-hud-heading strong,.qi-hud-heading span{display:block}
.qi-hud-heading strong{font-size:.95rem;letter-spacing:.02em;color:#26313b}
.qi-hud-heading span{margin-top:1px;color:#6f8090;font-size:.71rem;font-weight:800;text-transform:uppercase}
.qi-hud-heading time{min-width:54px;padding:4px 8px;font-size:.9rem;font-weight:900;text-align:center;border-radius:999px;color:#fff;background:#5a7894;box-shadow:inset 0 0 0 1px rgba(255,255,255,.24)}
.qi-hud-heading time.is-low{background:#b2463c;animation:qi-pulse 1s ease-in-out infinite}
.qi-hud-heading time[hidden]{display:none}
.qi-hud-heading button{padding:5px 11px;font:inherit;font-size:.72rem;font-weight:800;color:#3d4955;border:1px solid rgba(120,140,160,.45);border-radius:999px;background:#fff;cursor:pointer;pointer-events:auto}
.qi-hud>p{margin:7px 0 6px;color:#4c5966;font-size:.8rem;font-style:italic;text-align:center}
.qi-hud-stats{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 22px;color:#7c8a97;font-size:.7rem;font-weight:800;text-transform:uppercase}
.qi-hud-stats b{color:#2f6f9f;font-size:.84rem}
.qi-hud.theme-dark{color:#f1e7c8;border-color:rgba(215,203,168,.72);background:linear-gradient(180deg,rgba(38,42,34,.97),rgba(19,24,21,.97))}
.qi-hud.theme-dark .qi-hud-heading strong{color:#fff5d4}.qi-hud.theme-dark .qi-hud-heading span{color:#b7aa84}
.qi-hud.theme-dark>p{color:#d3c7a7}.qi-hud.theme-dark .qi-hud-stats{color:#9f967d}.qi-hud.theme-dark .qi-hud-stats b{color:#e0ba73}
.qi-hud.theme-dark .qi-hud-heading time{background:rgba(113,83,49,.76)}
.qi-hud.theme-warm{border-color:rgba(255,226,176,.9);background:linear-gradient(180deg,rgba(255,248,232,.96),rgba(250,232,204,.96))}
.qi-hud.theme-warm .qi-hud-heading time{background:#b8742f}.qi-hud.theme-warm .qi-hud-stats b{color:#a85a1f}
.qi-hud.theme-lab{color:#e6eef5;border-color:rgba(160,190,215,.75);background:linear-gradient(180deg,rgba(40,52,64,.96),rgba(24,32,40,.96))}
.qi-hud.theme-lab .qi-hud-heading strong{color:#f4f9ff}.qi-hud.theme-lab .qi-hud-heading span{color:#9fb6c9}
.qi-hud.theme-lab>p{color:#c8d6e2}.qi-hud.theme-lab .qi-hud-stats{color:#8ea3b5}.qi-hud.theme-lab .qi-hud-stats b{color:#8fe08a}
@keyframes qi-pulse{50%{transform:scale(1.07)}}
@media (max-width:640px){.qi-hud{top:58px;padding:7px 10px}.qi-hud-heading{grid-template-columns:30px 1fr auto auto;gap:6px}.qi-hud>p{font-size:.72rem}}
`;

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  if (html) node.innerHTML = html;
  return node;
}

function buildChrome(engine) {
  if (hud || typeof document === 'undefined') return;
  if (!document.getElementById('quest-instances-style')) {
    const style = el('style', { id: 'quest-instances-style' });
    style.textContent = DIALOG_STYLE;
    document.head.appendChild(style);
  }
  const host = document.getElementById('rook-woods-hud')?.parentElement || document.getElementById('game-root') || document.body;
  const bar = el('section', { id: 'quest-instance-hud', class: 'qi-hud', hidden: true, 'aria-live': 'polite' }, `
    <div class="qi-hud-heading">
      <img data-qi-icon alt="" />
      <div><strong data-qi-title></strong><span data-qi-stage></span></div>
      <time data-qi-timer>5:00</time>
      <button type="button" data-qi-leave>Leave</button>
    </div>
    <p data-qi-objective></p>
    <div class="qi-hud-stats" data-qi-stats></div>`);
  host.appendChild(bar);
  bar.querySelector('[data-qi-leave]').addEventListener('click', () => confirmLeave(engine));
  const dlgHost = document.getElementById('quest-dialogue')?.parentNode || document.body;
  const modal = el('div', { id: 'qi-dialogue', class: 'quest-dialogue glitch-modal', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qi-dialogue-title' }, `
    <div class="quest-dialogue-shade"></div>
    <div class="quest-dialogue-card">
      <div class="quest-dialogue-orb" aria-hidden="true">✦</div>
      <p class="mr-kicker" data-qi-kicker></p>
      <h2 id="qi-dialogue-title" data-qi-dtitle></h2>
      <p class="quest-dialogue-copy" data-qi-copy></p>
      <div data-qi-choices style="display:flex;flex-direction:column;gap:6px;align-items:center"></div>
    </div>`);
  dlgHost.appendChild(modal);
  hud = {
    bar,
    icon: bar.querySelector('[data-qi-icon]'),
    title: bar.querySelector('[data-qi-title]'),
    stage: bar.querySelector('[data-qi-stage]'),
    timer: bar.querySelector('[data-qi-timer]'),
    objective: bar.querySelector('[data-qi-objective]'),
    stats: bar.querySelector('[data-qi-stats]'),
    leave: bar.querySelector('[data-qi-leave]'),
  };
  dialog = {
    modal,
    kicker: modal.querySelector('[data-qi-kicker]'),
    title: modal.querySelector('[data-qi-dtitle]'),
    copy: modal.querySelector('[data-qi-copy]'),
    choices: modal.querySelector('[data-qi-choices]'),
    resolve: null,
  };
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const first = dialog.choices.querySelector('button');
      first?.click();
    }
  });
}

/**
 * A conversation in the quest dialogue card. `text` may carry the source
 * `<split butt_txt="..."/>` beats; `choices` replaces the last beat's button
 * with several ([{ label, value }]). Resolves with the chosen value.
 */
function converse(engine, { title = '', kicker = '', text = '', beats = null, choices = null } = {}) {
  buildChrome(engine);
  const pages = beats || parseQuestConversation(text);
  if (!pages.length) pages.push({ text, response: 'OK' });
  let index = 0;
  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.modal.hidden = true;
      dialog.resolve = null;
      engine.setData('qiDialog', '');
      resolve(value);
    };
    dialog.resolve = finish;
    const render = () => {
      const page = pages[index];
      dialog.kicker.textContent = kicker;
      dialog.title.textContent = title;
      dialog.copy.innerHTML = String(page.text || '').replace(/\n/g, '<br>');
      dialog.choices.innerHTML = '';
      const last = index === pages.length - 1;
      const opts = last && choices?.length ? choices : [{ label: page.response || (last ? 'OK' : 'Continue'), value: last ? 'ok' : null }];
      opts.forEach((opt, i) => {
        const b = el('button', { type: 'button', class: i === 0 ? 'btn-glitch-primary' : 'quest-dialogue-cancel' });
        b.textContent = opt.label;
        b.addEventListener('click', () => {
          if (!last) {
            index += 1;
            render();
          } else finish(opt.value ?? 'ok');
        });
        dialog.choices.appendChild(b);
      });
      engine.setData('qiDialog', `${title}:${index + 1}/${pages.length}`);
      dialog.modal.hidden = false;
      dialog.choices.querySelector('button')?.focus?.();
    };
    render();
  });
}

/** QA: press the first button of the open conversation. */
function advanceDialog() {
  if (!dialog || dialog.modal.hidden) return false;
  dialog.choices.querySelector('button')?.click();
  return true;
}

const dialogOpen = () => Boolean(dialog && !dialog.modal.hidden);

let cardEl = null;
let countEl = null;
function showCard(engine, { kicker = '', title = '', detail = '', button = 'OK', icon = '', loss = false } = {}) {
  buildChrome(engine);
  if (!cardEl) {
    const host = document.getElementById('rook-woods-hud')?.parentElement || document.body;
    cardEl = el('div', { class: 'hog-haul-screen glitch-modal qi-card', hidden: true, role: 'dialog', 'aria-modal': 'true' });
    host.appendChild(cardEl);
  }
  cardEl.innerHTML = `<div class="hog-haul-screen-shade"></div>
    <div class="${loss ? 'hog-haul-result-card is-loss' : 'hog-haul-ready-card'}">
      ${icon ? `<img src="${icon}" alt="" />` : ''}
      <p>${kicker}</p><h2>${title}</h2>${detail ? `<p class="race-ready-hint">${detail}</p>` : ''}
      <button type="button" class="btn-glitch-primary">${button}</button></div>`;
  cardEl.hidden = false;
  engine.setData('qiCard', title);
  return new Promise((resolve) => {
    const b = cardEl.querySelector('button');
    b.focus?.();
    b.addEventListener('click', () => {
      cardEl.hidden = true;
      engine.setData('qiCard', '');
      resolve(true);
    }, { once: true });
  });
}

async function showCountdown(engine, beats = ['3', '2', '1', 'GO!'], ms = 900) {
  buildChrome(engine);
  if (!countEl) {
    const host = document.getElementById('rook-woods-hud')?.parentElement || document.body;
    countEl = el('div', { class: 'hog-haul-countdown qi-countdown', hidden: true, 'aria-live': 'assertive' });
    host.appendChild(countEl);
  }
  for (const [i, beat] of beats.entries()) {
    countEl.textContent = beat;
    countEl.classList.toggle('is-go', i === beats.length - 1);
    countEl.hidden = false;
    engine.setData('qiCountdown', beat);
    engine.playSound(i === beats.length - 1 ? 'RACE_GO' : 'RACE_COUNTDOWN', { volume: 0.5 });
    await new Promise((r) => setTimeout(r, ms));
  }
  countEl.hidden = true;
  engine.setData('qiCountdown', '');
}

/* ------------------------------------------------------------------ */
/* Room context                                                         */
/* ------------------------------------------------------------------ */

function makeContext(engine) {
  const c = {
    engine,
    PIXI: engine.PIXI,
    kit,
    get run() { return run; },
    get questId() { return run?.questId || null; },
    get stage() { return run?.stage || null; },
    get def() { return questDef(run?.questId); },
    get player() { return engine.player; },
    data: {},
    targets: [],
    sprites: [],
    param: (name) => engine.param(name),
    fx: () => engine.param('questfx') !== '0',
    now: () => Date.now(),
    /** Requirement progress for the running quest (flag or counter). */
    progress: (name, amount = 1) => (run ? progress(engine, run.questId, name, amount) : false),
    /** Another quest the room hands out or finishes in place (Le Misérable II inside Le Misérable). */
    quest: (questId) => ({
      active: () => Boolean(activeQuest(engine, questId)),
      progress: (name, amount = 1) => progress(engine, questId, name, amount),
      complete: () => requirementsMet(engine, questId),
      turnIn: (opts) => turnIn(engine, questId, opts),
      fail: () => failQuest(engine, questId),
    }),
    offerQuest: (questId, opts) => offerInRoom(engine, questId, opts),
    /** The held street's own location events (rooms with streetEvents: true). */
    events: {
      fire: (name) => locationEventsApi.fire(engine, name),
      flag: (name) => locationEventsApi.flag(name),
      has: (name) => locationEventsApi.has(name),
    },
    hasProgress: (name) => Number(activeQuest(engine, run?.questId)?.progress?.[name]) > 0,
    flag: (name) => (run ? setRunFlag(run, name) : false),
    hasFlag: (name) => runFlag(run, name),
    solve: () => (run ? solveQuestInstance(run) : false),
    extend: (ms) => (run ? extendQuestInstance(run, ms) : 0),
    remaining: () => (run ? instanceRemainingMs(run) : 0),
    /** Turn in now (quests that complete inside the room). */
    turnIn: (opts) => (run ? turnIn(engine, run.questId, opts) : Promise.resolve(false)),
    complete: () => (run ? requirementsMet(engine, run.questId) : false),
    leave: (opts) => leaveInstance(engine, opts),
    gotoStage: (stage, opts) => gotoStage(engine, stage, opts),
    converse: (opts) => converse(engine, opts),
    advanceDialog,
    dialogOpen,
    /** Add a display object to the world entity layer (removed on clear). */
    add(obj, z = 20) {
      if (obj.zIndex == null || obj.zIndex === 0) obj.zIndex = z;
      engine.entityLayer.addChild(obj);
      c.sprites.push(obj);
      return obj;
    },
    /** Register an interactable owned by this room. */
    register(target) {
      engine.entityLayer.addChild(target.sprite);
      const t = engine.register({ ...target, featureId: QUEST_INSTANCES_FEATURE_ID, qiRoom: room?.id });
      c.targets.push(t);
      return t;
    },
    unregister(target) {
      c.targets = c.targets.filter((t) => t !== target);
      engine.unregister(target);
    },
    setData: (key, value) => engine.setData(key, value),
    toast: (text, ms) => engine.toast(text, ms),
    activity: (text) => engine.pushActivity(text),
    floatText: (x, y, text, color) => engine.floatText(x, y, text, color),
    sound: (key, opts) => engine.playSound(key, opts),
    say: (target, text, ms) => engine.say(target, text, ms),
    give: (classTsid, count = 1, meta) => {
      if (meta) ensureItem(classTsid, meta);
      addItem(engine.inv, classTsid, count);
      engine.refreshPack();
      return true;
    },
    take: (classTsid, count = 1) => {
      const ok = removeItem(engine.inv, classTsid, count) !== false;
      engine.refreshPack();
      return ok;
    },
    count: (classTsid) => countItem(engine.inv, classTsid),
    near: (x, y, r = 60) => kit.distanceTo(engine.player, x, y) <= r,
    /** Put the avatar at a point (falls, respawns). */
    place(x, y) {
      const p = engine.player;
      if (!p) return;
      p.x = x;
      p.y = y;
      p.vx = 0;
      p.vy = 0;
      engine.snapCamera();
    },
    /** Temporarily scale the avatar (shrink rooms); restored on leave. */
    scalePlayer(factor) {
      const p = engine.player;
      if (!p) return;
      c.data._scale ||= { base: p.baseScale ?? Math.abs(p.scale.y) };
      const base = c.data._scale.base;
      p.baseScale = base * factor;
      p.scale.set(Math.sign(p.scale.x || 1) * base * factor, base * factor);
    },
    /** A quoin sprite (QUOIN_SHEET row for the type), not yet added. */
    quoinSprite(type, x, y, scale = 0.6) {
      const spr = new engine.PIXI.Sprite(quoinTexture(engine.PIXI, type));
      spr.anchor.set(0.5, 0.5);
      spr.scale.set(scale);
      spr.x = x;
      spr.y = y;
      spr.baseY = y;
      spr.phase = (x % 97) / 15;
      return spr;
    },
    /** Pay one quoin through the normal economy (ignoreLimit: Paradise-style bypass). */
    collectQuoin(type, x, y, opts = {}) {
      const state = engine.quoinState;
      let result;
      if (opts.ignoreLimit && state) {
        const limit = state.dailyLimit;
        const today = state.collectedToday;
        state.dailyLimit = Infinity;
        result = collectQuoin(state, type, engine.pc, opts);
        state.dailyLimit = limit;
        state.collectedToday = today;
      } else {
        result = collectQuoin(state, type, engine.pc, opts);
      }
      const lab = QUOIN_TYPES[result.resolvedTypeId || type]?.label || 'iMG';
      if (result.ok) {
        if (result.amount) engine.floatText(x, y - 16, `+${result.amount} ${lab}`, '#ffffff');
        engine.playSound(`QUOIN_${String(result.typeId || 'xp').toUpperCase()}`, { volume: 0.5 });
      } else {
        engine.floatText(x, y - 16, 'Daily quoin limit', '#ffe7a8');
        engine.playSound('QUOIN_XP', { volume: 0.3 });
      }
      engine.updateHud();
      return result;
    },
    /** Step the room card aside (a full-view page such as a finale); cleared with the run. */
    coverHud(on = true) {
      c.data._hudCovered = Boolean(on);
      renderHud(engine);
    },
    /** A ready/result card (the race cards' look). Resolves when clicked. */
    card: (opts) => showCard(engine, opts),
    /** Big countdown beats, e.g. ['3', '2', '1', 'GO!']. */
    countdown: (beats, ms) => showCountdown(engine, beats, ms),
    /** QA: press the open award screen's OK/next button (true when pressed). */
    advanceAward() {
      const next = typeof document !== 'undefined' ? document.querySelector('#award-screen [data-award-next]:not([hidden])') : null;
      if (!next || next.closest('[hidden]')) return false;
      next.click();
      return true;
    },
    cardOpen: () => Boolean(cardEl && !cardEl.hidden),
    clickCard: () => {
      if (!cardEl || cardEl.hidden) return false;
      cardEl.querySelector('button')?.click();
      return true;
    },
    memory: (key) => (save.memory[`room:${room?.id}:${key}`] ||= {}),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  return c;
}

function clearContextEntities(engine) {
  if (!ctx) return;
  for (const t of ctx.targets) {
    try { engine.unregister(t); } catch { /* gone */ }
  }
  for (const s of ctx.sprites) {
    if (s && !s.destroyed) {
      s.parent?.removeChild(s);
      s.destroy?.({ children: true });
    }
  }
  ctx.targets = [];
  ctx.sprites = [];
}

function restorePlayerScale(engine) {
  const base = ctx?.data?._scale?.base;
  const p = engine.player;
  if (base && p) {
    p.baseScale = base;
    p.scale.set(Math.sign(p.scale.x || 1) * base, base);
  }
  if (ctx?.data) delete ctx.data._scale;
}

/* ------------------------------------------------------------------ */
/* Entering, stages, leaving                                            */
/* ------------------------------------------------------------------ */

const LOADING_COLORS = {
  memory: ['#f5f9ff', '#dfe9f5'],
  dark: ['#26302a', '#121714'],
  warm: ['#f6dfb6', '#c47d3c'],
  lab: ['#33414f', '#151c23'],
};

async function withTransition(engine, label, hubName, theme, work) {
  const fx = typeof document !== 'undefined' ? document.getElementById('screen-transition') : null;
  if (!fx || engine.param('questfx') === '0') {
    await work();
    return;
  }
  const [top, bottom] = LOADING_COLORS[theme] || LOADING_COLORS.memory;
  await runStreetTransition(fx, {
    fromLabel: engine.street?.label || '',
    fromHub: engine.street?.hubName || '',
    toLabel: label,
    toHub: hubName || '',
    topColor: top,
    bottomColor: bottom,
    onMid: work,
  });
}

async function buildStage(engine, stage) {
  clearContextEntities(engine);
  const street = room.street?.(ctx, stage);
  if (street?.tsid) {
    engine.instanceHold = street.hold === false ? null : QUEST_INSTANCES_FEATURE_ID;
    ctx.data._awaitStreet = { tsid: street.tsid, stage };
    await engine.enter(street.tsid, {
      spawnX: street.x,
      spawnY: street.y,
      quiet: true,
      bypassFeatureGates: true,
      useTransition: false,
    });
    return;
  }
  const scene = room.build(ctx, stage);
  engine.instanceHold = null;
  engine.enterScene({
    tsid: questSceneTsid(room.id, stage),
    label: scene.label || room.title,
    hubName: scene.hubName ?? room.hubName ?? 'A quiet place beyond Ur',
    width: scene.width,
    height: scene.height,
    background: scene.background,
    platforms: scene.platforms || [],
    walls: scene.walls || [],
    spawn: scene.spawn,
    returnTo: run.returnTo,
    // A room (or one stage) with its own authored light: the Dametime tint stays off.
    ownLight: Boolean(scene.ownLight ?? room.ownLight),
  });
  if (engine.street) engine.street.barriers = scene.barriers || [];
  room.enter?.(ctx, stage);
  renderHud(engine, true);
}

async function startInstance(engine, questId, opts = {}) {
  if (run || entering) return false;
  const roomId = QUEST_ROOMS[questId];
  if (!roomId) return false;
  entering = true;
  try {
    const def = await loadRoom(roomId);
    if (!def) return false;
    room = def;
    const returnTo = isQuestSceneTsid(engine.streetTsid) || engine.homeContext?.().inHome
      ? save.returnTo
      : { tsid: engine.streetTsid, x: Math.round(engine.player?.x || 0), y: Math.round(engine.player?.y || 0) };
    const durationMs = typeof room.durationFor === 'function' ? room.durationFor(questId) : room.durationMs;
    run = createQuestInstance({
      questId,
      roomId,
      durationMs: durationMs ?? undefined,
      returnTo,
      stage: typeof room.firstStage === 'function' ? room.firstStage(questId) : room.firstStage || 'main',
      repeat: (save.memory[questId]?.completions || 0) > 0,
    });
    save.returnTo = run.returnTo;
    save.questId = questId;
    save.roomId = roomId;
    delete save.retry[questId];
    (save.memory[questId] ||= {}).started = Date.now();
    engine.save();
    ctx = makeContext(engine);
    buildChrome(engine);
    engine.stopFollowing?.();
    engine.closeMap?.();
    room.start?.(ctx);
    const label = room.loadingLabel?.(run.stage, ctx) || room.stageLabel?.(run.stage, ctx) || room.title;
    await withTransition(engine, label, room.hubName || 'A quiet place beyond Ur', room.theme, () => buildStage(engine, run.stage));
    engine.setData('qiStatus', run.status);
    publish(engine, true);
    if (opts.autoplay) runAutoplay(engine, opts.autoplay);
    return true;
  } finally {
    entering = false;
  }
}

async function gotoStage(engine, stage, opts = {}) {
  if (!run || !room) return false;
  if (!changeInstanceStage(run, stage)) return false;
  const label = room.loadingLabel?.(stage, ctx) || room.stageLabel?.(stage, ctx) || room.title;
  const work = () => buildStage(engine, stage);
  if (opts.transition === false) await work();
  else await withTransition(engine, label, room.hubName || 'A quiet place beyond Ur', room.theme, work);
  publish(engine, true);
  return true;
}

function confirmLeave(engine) {
  if (!run) return;
  if (run.status === 'solved' || room?.leaveWithoutConfirm) {
    leaveInstance(engine);
    return;
  }
  converse(engine, {
    title: room?.title || 'Leave?',
    kicker: 'Leave this place?',
    text: room?.leaveText || 'If you leave now you will have to start over. Leave anyway?',
    choices: [
      { label: 'Stay', value: 'stay' },
      { label: 'Leave', value: 'leave' },
    ],
  }).then((choice) => {
    if (choice === 'leave') leaveInstance(engine);
  });
}

async function leaveInstance(engine, opts = {}) {
  if (!run || run.status === 'left' || ctx?.data?._leaving) return false;
  ctx.data._leaving = true;
  const questId = run.questId;
  const result = finishQuestInstance(run);
  const hook = room?.onLeave?.(ctx, result.outcome) || {};
  if (result.outcome === 'complete') {
    if (hook.leaveFlag !== false) progress(engine, questId, hook.leaveFlag || 'leave');
  } else if (!hook.keepQuest) {
    failQuest(engine, questId);
    engine.pushActivity(
      result.outcome === 'expired'
        ? `${room?.title || 'The quest'}: time ran out. Ask the ${giverFor(engine, questId).label} to try again.`
        : `You left ${room?.title || 'the quest'} early. You can try again later.`
    );
  } else if (save.memory[questId]) {
    delete save.memory[questId].started;
  }
  restorePlayerScale(engine);
  room?.clear?.(ctx);
  clearContextEntities(engine);
  const back = result.returnTo || save.returnTo;
  run = null;
  const leftRoom = room;
  room = null;
  ctx = null;
  save.returnTo = null;
  save.questId = null;
  save.roomId = null;
  engine.instanceHold = null;
  if (hud) hud.bar.hidden = true;
  engine.save();
  engine.setData('qiStatus', 'left');
  engine.setData('qiOutcome', result.outcome);
  const go = async () => {
    if (back?.tsid) await engine.enter(back.tsid, { spawnX: back.x, spawnY: back.y, quiet: true, bypassFeatureGates: true, useTransition: false });
  };
  if (opts.transition === false) await go();
  else await withTransition(engine, '', '', leftRoom?.theme, go);
  publish(engine, true);
  if (activeQuest(engine, questId) && requirementsMet(engine, questId) && !hook.noTurnIn) {
    await turnIn(engine, questId);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* HUD + QA data                                                        */
/* ------------------------------------------------------------------ */

function renderHud(engine, force = false) {
  if (!hud) return;
  if (!run || !room || room.hud === false) {
    hud.bar.hidden = true;
    return;
  }
  hud.bar.hidden = false;
  // The bar sits in the game root's stacking context, above the dialogue host:
  // step aside while a conversation or award is up.
  const covered = (dialog && !dialog.modal.hidden)
    || Boolean(ctx?.data?._hudCovered)
    || (typeof document !== 'undefined' && Boolean(document.querySelector('#award-screen.is-visible:not([hidden])')));
  hud.bar.className = `qi-hud${room.theme ? ` theme-${room.theme}` : ''}${covered ? ' is-covered' : ''}`;
  if (force || hud.icon.dataset.src !== room.icon) {
    hud.icon.dataset.src = room.icon || '';
    if (room.icon) hud.icon.src = room.icon;
    hud.icon.hidden = !room.icon;
  }
  hud.title.textContent = room.hudTitle?.(ctx) || questDef(run.questId)?.title || room.title;
  hud.stage.textContent = room.stageLabel?.(run.stage, ctx) || room.kicker || '';
  const clock = room.clock?.(ctx);
  const remaining = clock ?? instanceRemainingMs(run);
  hud.timer.hidden = !Number.isFinite(remaining);
  hud.timer.textContent = formatInstanceClock(remaining);
  hud.timer.classList.toggle('is-low', Number.isFinite(remaining) && remaining <= (room.lowMs ?? LOW_TIME_MS) && remaining > 0 && run.status === 'active');
  hud.leave.textContent = run.status === 'solved' ? (room.doneLabel || 'Go back') : 'Leave';
  const obj = room.objective?.(ctx) || {};
  hud.objective.textContent = obj.text || '';
  const stats = (obj.stats || []).map(([lab, value]) => `<span><b>${value}</b> ${lab}</span>`).join('');
  if (hud.stats.innerHTML !== stats) hud.stats.innerHTML = stats;
}

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now - lastData < 250) return;
  lastData = now;
  engine.setData('qiQuest', run?.questId || '');
  engine.setData('qiRoom', run?.roomId || '');
  engine.setData('qiStage', run?.stage || '');
  engine.setData('qiStatus', run?.status || (engine.param('questdemo') ? 'idle' : ''));
  const remaining = run ? room?.clock?.(ctx) ?? instanceRemainingMs(run) : 0;
  engine.setData('qiRemaining', Number.isFinite(remaining) ? Math.round(remaining) : 'none');
  engine.setData('qiObjective', run && room ? room.objective?.(ctx)?.text || '' : '');
  engine.setData('qiRetry', Object.keys(save.retry).join(','));
  if (run && room?.publish) room.publish(ctx);
}

/* ------------------------------------------------------------------ */
/* Autoplay (QA)                                                        */
/* ------------------------------------------------------------------ */

async function runAutoplay(engine, mode) {
  if (!room?.autoplay) {
    engine.setData('qiAutoplay', 'none');
    return;
  }
  engine.setData('qiAutoplay', `running:${mode}`);
  try {
    // Close the room's opening conversation, if any, before driving.
    const result = await room.autoplay(ctx, mode);
    engine.setData('qiAutoplay', result || 'done');
  } catch (err) {
    console.warn('quest autoplay', err);
    engine.setData('qiAutoplay', `error:${err?.message || err}`);
  }
}

function handleDemo(engine) {
  if (demo.stage !== 'idle' || !engine.started || !engine.streetTsid) return;
  const id = demo.quest;
  if (!QUEST_ROOMS[id]) {
    demo.stage = 'none';
    return;
  }
  demo.stage = 'starting';
  const qs = engine.questState;
  ensureQuestOfferState(qs);
  qs.completed = (qs.completed || []).filter((q) => q !== id);
  if (!qs.active?.[id]) acceptOffer(qs, id, questCtx(engine));
  else resetProgress(engine, id);
  for (const dep of engine.param('questdone')?.split(',') || []) {
    if (dep && !qs.completed.includes(dep)) qs.completed.push(dep);
  }
  delete save.retry[id];
  engine.updateHud();
  if (engine.param('questdemoflow') === 'accept') {
    // QA of the real path: the quest is accepted; the normal start hook takes it from here.
    demo = { quest: '', mode: '', stage: 'accepted' };
    engine.setData('qiStatus', 'accepted');
    return;
  }
  const mode = engine.param('questautoplay') || '';
  loadRoom(QUEST_ROOMS[id]).then((def) => {
    if (def?.world && !def.build && !def.street) {
      // A world-only quest (no room to enter first).
      demo.stage = 'world';
      worldDemo(engine, def, id, mode);
      return;
    }
    setTimeout(() => {
      startInstance(engine, id, { autoplay: mode || null }).then(() => {
        demo.stage = 'started';
      });
    }, 300);
  });
}

async function worldDemo(engine, def, questId, mode) {
  if (mode && def.world?.autoplay) {
    engine.setData('qiAutoplay', `running:${mode}`);
    try {
      const out = await def.world.autoplay(worldContext(engine), questId, mode);
      engine.setData('qiAutoplay', out || 'done');
    } catch (err) {
      engine.setData('qiAutoplay', `error:${err?.message || err}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* World hooks (quests that continue on ordinary streets)               */
/* ------------------------------------------------------------------ */

function worldContext(engine) {
  if (!worldCtx) {
    worldCtx = makeContext(engine);
    worldCtx.world = true;
    worldCtx.startInstance = (questId, opts) => startInstance(engine, questId, opts);
    worldCtx.turnInQuest = (questId, opts) => turnIn(engine, questId, opts);
    worldCtx.progressQuest = (questId, name, amount) => progress(engine, questId, name, amount);
    worldCtx.questActive = (questId) => Boolean(activeQuest(engine, questId));
    worldCtx.questProgress = (questId, name) => Number(activeQuest(engine, questId)?.progress?.[name]) || 0;
    worldCtx.questMemory = (questId) => (save.memory[questId] ||= {});
    worldCtx.save = () => engine.save();
  }
  return worldCtx;
}

function activeWorldRooms(engine) {
  const out = [];
  const seen = new Set();
  for (const id of Object.keys(engine.questState?.active || {})) {
    const roomId = QUEST_ROOMS[id];
    if (!roomId || seen.has(roomId)) continue;
    const def = loaded.get(roomId);
    if (def === undefined) {
      if (isBuiltRoom(roomId) || demo.quest === id) loadRoom(roomId);
      continue;
    }
    if (def?.world) {
      seen.add(roomId);
      out.push(def);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Starting accepted quests, retry prompts                              */
/* ------------------------------------------------------------------ */

function questsWaitingToStart(engine) {
  const out = [];
  const offers = ensureQuestOfferState(engine.questState);
  for (const id of roomQuests()) {
    if (!activeQuest(engine, id) || !offers.managed[id]) continue;
    if (save.retry[id] || save.memory[id]?.started) continue;
    out.push(id);
  }
  return out;
}

function maybeStartAccepted(engine, now) {
  if (run || entering || demo.quest) return;
  const waiting = questsWaitingToStart(engine);
  if (!waiting.length) {
    pendingStart = null;
    return;
  }
  const id = waiting[0];
  const roomDef = loaded.get(QUEST_ROOMS[id]);
  if (roomDef === undefined) {
    loadRoom(QUEST_ROOMS[id]);
    return;
  }
  if (!roomDef) return;
  if (roomDef.startsInRoom === false) {
    // World quests start on the street (no room to enter).
    (save.memory[id] ||= {}).started = Date.now();
    roomDef.world?.onAccept?.(worldContext(engine), id);
    engine.save();
    return;
  }
  if (!pendingStart || pendingStart.questId !== id) pendingStart = { questId: id, at: now + START_DELAY_MS };
  if (now < pendingStart.at || engine.busy() || dialogOpen()) return;
  pendingStart = null;
  startInstance(engine, id);
}

function maybeOfferRetry(engine, now) {
  if (run || entering || demo.quest || now < nextRetryAt) return;
  nextRetryAt = now + RETRY_CHECK_MS;
  if (engine.busy() || dialogOpen() || engine.questOffersHeld?.()) return;
  const id = Object.keys(save.retry)
    .filter((q) => activeQuest(engine, q) && QUEST_ROOMS[q])
    .sort((a, b) => save.retry[a] - save.retry[b])[0];
  for (const q of Object.keys(save.retry)) if (!activeQuest(engine, q)) delete save.retry[q];
  if (!id || now - save.retry[id] < 20_000) return;
  const def = questDef(id);
  const giver = giverFor(engine, id);
  engine.setData('qiRetryGiver', giver.npc);
  converse(engine, {
    title: def?.title || 'Try again?',
    kicker: giver.label,
    text: `Want another go at ${def?.title || 'that'}? I can take you back whenever you like.`,
    choices: [
      { label: 'Take me there', value: 'go' },
      { label: 'Not right now', value: 'later' },
    ],
  }).then((choice) => {
    if (choice === 'go') startInstance(engine, id);
    else {
      save.retry[id] = Date.now() + RETRY_SNOOZE_MS - 20_000;
      engine.save();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const questInstancesFeature = {
  id: QUEST_INSTANCES_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    // Rooms on archived streets may run the street's own event scripts (streetEvents: true).
    locationEventsApi.register({
      instance: (street) => Boolean(run && room?.streetEvents && ctx?.data?._awaitStreet?.tsid === street?.tsid),
    });
    // quest-offers-feature asks the engine for custom_code prerequisites.
    engine.questCustomPrereq = (id, prereq) => customPrereq(id, prereq, engine);
    for (const [classTsid, meta] of Object.entries(ROOM_ITEMS)) ensureItem(classTsid, meta);
    const want = String(engine.param('questdemo') || '');
    if (QUEST_ROOMS[want]) {
      demo = { quest: want, mode: engine.param('questautoplay') || '', stage: 'idle' };
      engine.setData('qiStatus', 'idle');
    }
    nextRetryAt = Date.now() + 15_000;
  },

  save() {
    return { ...save, rubeTraded };
  },

  restore(slice) {
    save = normalizeInstanceSave(slice || {});
    rubeTraded = slice?.rubeTraded === true;
    // A run open at save time was lost with the page: fail it, offer a retry.
    if (save.questId) {
      const id = save.questId;
      if (save.memory[id]) delete save.memory[id].started;
      save.retry[id] = Date.now() - 15_000;
      save.memory[id] = { ...(save.memory[id] || {}), failedAt: Date.now(), interrupted: true };
    }
  },

  /** A reload inside a room resumes on the street the player came from. */
  reloadLocation(saved) {
    const target = reloadTarget(save, saved);
    if (target) {
      save.questId = null;
      save.roomId = null;
      save.returnTo = null;
    }
    return target;
  },

  holdQuestOffers() {
    return run || entering ? true : null;
  },

  travelGate(tsid, engine, meta = {}) {
    if (!run || meta?.bypass) return null;
    return { ok: false, msg: room?.travelText || "You can't travel from here. Use Leave to go back." };
  },

  /** Street-based rooms keep only what the room spawns (no fallback animals). */
  ecologyOverride(street) {
    const wait = ctx?.data?._awaitStreet;
    if (!run || !wait || !street || street.tsid !== wait.tsid) return null;
    return { label: room?.title || street.label, sourceTsid: street.tsid, counts: {}, empty: true };
  },

  prepareStreet(street) {
    const wait = ctx?.data?._awaitStreet;
    if (!run || !wait || !street || street.tsid !== wait.tsid) return;
    const label = room?.stageLabel?.(wait.stage, ctx) || room?.title;
    if (label) street.label = label;
    street.hubName = room?.hubName || street.hubName || '';
  },

  physics(engine) {
    if (!run || !room?.physics) return null;
    return room.physics(ctx) || null;
  },

  onStreetEnter(street, engine) {
    buildChrome(engine);
    if (run && ctx?.data?._awaitStreet && street?.tsid) {
      const wait = ctx.data._awaitStreet;
      delete ctx.data._awaitStreet;
      room.enter?.(ctx, wait.stage, street);
      renderHud(engine, true);
    } else if (!run) {
      if (hud) hud.bar.hidden = true;
      for (const def of activeWorldRooms(engine)) def.world.onStreetEnter?.(worldContext(engine), street);
    }
    handleDemo(engine);
    publish(engine, true);
  },

  onStreetClear(engine) {
    if (run && ctx) {
      room?.clear?.(ctx);
      ctx.targets = [];
      ctx.sprites = [];
    }
    if (worldCtx) {
      for (const def of loaded.values()) def?.world?.onStreetClear?.(worldCtx);
      worldCtx.targets = [];
      worldCtx.sprites = [];
    }
  },

  onEvent(counter, amount, engine) {
    if (String(counter).startsWith('rube_trades:') && !rubeTraded) {
      rubeTraded = true;
      engine.save();
    }
    if (!run) for (const def of activeWorldRooms(engine)) def.world.onEvent?.(worldContext(engine), counter, amount);
    else room?.onEvent?.(ctx, counter, amount);
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    handleDemo(engine);
    if (run && room && ctx && !entering) {
      const { expired } = stepQuestInstance(run, now);
      if (expired) {
        room.onExpire?.(ctx);
        engine.toast(room.expireText || 'Time is up!', 2600);
        leaveInstance(engine);
        return;
      }
      if (!ctx.data._awaitStreet) room.tick?.(ctx, dtMs, now);
      renderHud(engine);
      publish(engine);
      return;
    }
    if (!run && !entering) {
      for (const def of activeWorldRooms(engine)) def.world.onTick?.(worldContext(engine), dtMs, now);
      maybeStartAccepted(engine, now);
      maybeOfferRetry(engine, now);
    }
    publish(engine);
  },

  verbsFor(target, engine) {
    if (run && room?.verbs && target.qiRoom === room.id) return room.verbs(ctx, target) || [];
    const def = loaded.get(target.qiRoom);
    if (def?.world?.verbs) return def.world.verbs(worldContext(engine), target) || [];
    return null;
  },

  runVerb(target, verbId, engine) {
    if (run && room?.runVerb && target.qiRoom === room.id) return room.runVerb(ctx, target, verbId) === true;
    const def = loaded.get(target.qiRoom);
    if (def?.world?.runVerb) return def.world.runVerb(worldContext(engine), target, verbId) === true;
    return false;
  },

  /** World rooms may take over another feature's target (a subway door while a quest needs it). */
  verbOverride(target, engine) {
    if (run || entering) return null;
    for (const def of activeWorldRooms(engine)) {
      const verbs = def.world.verbOverride?.(worldContext(engine), target);
      if (verbs) return verbs;
    }
    return null;
  },

  runVerbOverride(target, verbId, engine) {
    if (run || entering) return null;
    for (const def of activeWorldRooms(engine)) {
      if (def.world.runVerbOverride?.(worldContext(engine), target, verbId) === true) return true;
    }
    return null;
  },

  packVerbs(classTsid, engine) {
    const out = [];
    if (REMINISCE_ITEMS[classTsid]) {
      const offers = npcQuestOffers(engine.questState, REMINISCE_ITEMS[classTsid], engine.pc, questCtx(engine))
        .offered.filter((card) => QUEST_ROOMS[card.classTsid] && isBuiltRoom(QUEST_ROOMS[card.classTsid]));
      out.push({
        id: 'reminisce',
        label: 'Reminisce',
        primary: true,
        enabled: offers.length > 0 && !run,
        reason: run ? 'Not here.' : offers.length ? '' : 'Nothing to reminisce about right now.',
        tooltip: 'Relive a puzzle you have solved',
      });
    }
    for (const def of itemRooms(engine, classTsid)) {
      for (const verb of def.itemVerbs(worldContext(engine), classTsid) || []) out.push(verb);
    }
    if (!run) {
      for (const def of activeWorldRooms(engine)) {
        for (const verb of def.world.packVerbs?.(worldContext(engine), classTsid) || []) out.push(verb);
      }
    }
    return out;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (REMINISCE_ITEMS[classTsid] && verbId === 'reminisce') {
      openReminisce(engine, classTsid);
      return true;
    }
    for (const def of itemRooms(engine, classTsid)) {
      if (def.runItemVerb?.(worldContext(engine), classTsid, verbId) === true) return true;
    }
    for (const def of activeWorldRooms(engine)) {
      if (def.world.runPackVerb?.(worldContext(engine), classTsid, verbId) === true) return true;
    }
    return false;
  },

  mapCards(engine) {
    if (run || typeof document === 'undefined') return [];
    const ids = Object.keys(save.retry).filter((id) => activeQuest(engine, id));
    if (!ids.length) return [];
    const card = el('div', { class: 'map-feature-card qi-map-card', style: 'padding:8px 10px;border-radius:10px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.12);margin:0 0 8px' });
    card.innerHTML = `<strong style="display:block;font-size:.85rem">Unfinished quest places</strong>`;
    for (const id of ids) {
      const b = el('button', { type: 'button', class: 'btn-glitch-primary', style: 'margin:6px 6px 0 0;font-size:.75rem' });
      b.textContent = `Go back: ${questDef(id)?.title || id}`;
      b.addEventListener('click', () => {
        engine.closeMap?.();
        startInstance(engine, id);
      });
      card.appendChild(b);
    }
    return [card];
  },

  /** Tests / QA. */
  _state() {
    return { run, room: room?.id || null, save, demo };
  },
};

/**
 * Rooms that own pack verbs for an item class whether or not a quest is
 * running (the Conch's Play and Blow): the rooms of the quests that item
 * offers (offerTriggers npc), loaded on first use, with `itemVerbs`.
 */
function itemRooms(engine, classTsid) {
  if (!REMINISCE_ITEMS[classTsid]) return [];
  const out = [];
  const seen = new Set();
  for (const [questId, roomId] of Object.entries(QUEST_ROOMS)) {
    if (seen.has(roomId)) continue;
    const triggers = questDef(questId)?.offerTriggers || [];
    if (!triggers.some((t) => t?.type === 'npc' && t.npc === classTsid)) continue;
    seen.add(roomId);
    const def = loaded.get(roomId);
    if (def === undefined) loadRoom(roomId);
    else if (def?.itemVerbs && (def.itemClasses || []).includes(classTsid)) out.push(def);
  }
  return out;
}

function openReminisce(engine, itemClass) {
  const offers = npcQuestOffers(engine.questState, REMINISCE_ITEMS[itemClass], engine.pc, questCtx(engine))
    .offered.filter((card) => QUEST_ROOMS[card.classTsid] && isBuiltRoom(QUEST_ROOMS[card.classTsid]));
  if (!offers.length) return;
  const card = offers[0];
  const pick = offers.length > 1
    ? converse(engine, {
        title: 'Reminisce',
        kicker: itemClass === 'conch' ? 'Conch' : 'Play Cube',
        text: 'Which memory?',
        choices: [...offers.map((o) => ({ label: o.title, value: o.classTsid })), { label: 'Never mind', value: '' }],
      })
    : Promise.resolve(card.classTsid);
  pick.then((id) => {
    const chosen = offers.find((o) => o.classTsid === id);
    if (!chosen) return;
    converse(engine, {
      title: chosen.title,
      kicker: itemClass === 'conch' ? 'Conch' : 'Play Cube',
      beats: chosen.beats,
      choices: [
        { label: chosen.acceptLabel || "Ok, I'll do it!", value: 'yes' },
        { label: 'Not right now', value: 'no' },
      ],
    }).then((answer) => {
      if (answer !== 'yes') return;
      const result = acceptOffer(engine.questState, chosen.classTsid, questCtx(engine));
      if (!result.ok) return;
      engine.pushActivity(`New quest: ${chosen.title}`);
      engine.save();
    });
  });
}

/** Exposed for rooms that hand out a follow-up quest in place (an NPC offer). */
export async function offerInRoom(engine, questId, { kicker = '' } = {}) {
  const def = questDef(questId);
  if (!def) return false;
  const answer = await converse(engine, {
    title: def.title,
    kicker,
    text: def.offer || def.desc,
    choices: [
      { label: def.acceptLabel || "Ok, I'll do it!", value: 'yes' },
      { label: def.declineLabel || 'Not right now', value: 'no' },
    ],
  });
  if (answer !== 'yes') return false;
  const result = acceptOffer(engine.questState, questId, questCtx(engine));
  if (result.ok) {
    (save.memory[questId] ||= {}).started = Date.now();
    engine.pushActivity(`New quest: ${def.title}`);
    engine.save();
  }
  return result.ok;
}

export { converse as questRoomConverse };
