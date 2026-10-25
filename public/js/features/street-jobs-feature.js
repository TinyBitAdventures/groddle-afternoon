/**
 * Street projects: the Job Board on a street offers the archived street's
 * collaborative projects (build a new street, upgrade this one) in the solo
 * form documented in js/street-jobs.js.
 *
 *  - Boards spawn on every street the source's Street Spirit offered a
 *    project from (catalog.byStreet), one per street, at a planner point.
 *  - Contribute items, currants, or timed work (1.5 s a unit, energy and tool
 *    wear per unit); hire a hand for work you cannot do.
 *  - Finishing a street project opens the road (the signpost into the new
 *    street, which shows a barricade until then) and hands you an imbued
 *    Teleportation Script there. Finishing an upgrade re-plans the street
 *    with the chosen option's shrine, animals, rocks, and flora.
 *  - The Map stays open to every street; only signpost roads close.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&jobdemo=<job class or job id>
 *     (&jobautoplay=1, &jobphase=N)
 *
 * Other features run their own projects through `projectApi` (the same
 * panel, contributions, work units, Hire a hand, phase settling and badges):
 * homes-feature.js registers a depleted cultivation's restoration (kind
 * 'restore', job type 5) and finishes the restore in its `onDone` hook.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, itemIcon } from '../inventory.js?v=catalog-unified-4';
import { canUseTool, useToolCondition } from '../tools.js?v=tools-5';
import { ecologyForStreet } from '../street-ecology.js?v=official-ecology-6';
import { worldToScreen } from '../street-model.js';
import { signArmWidth } from '../street-render.js?v=parallax-7';
import { getSkillCatalog } from '../content-catalogs.js';
import { GIANTS } from '../shrines.js?v=shrine-walkby-1';
import { teleportationFeature } from './teleportation-feature.js?v=teleport-1';
import {
  SOLO_DIVISOR,
  WORK_UNIT_MS,
  PHASE_WINNER_COUNTER,
  PARTICIPANT_COUNTER,
  TROPHY_FAMILIES,
  normalizeStreetJobState,
  initializeStreetJobs,
  jobDef,
  phaseClass,
  phaseRequirements,
  phaseOrdinal,
  jobStatus,
  streetJobs,
  streetHasOpenProject,
  contributeItems,
  contributeCurrants,
  workCheck,
  applyWorkUnit,
  hireQuote,
  hireWork,
  phaseIsComplete,
  settlePhase,
  chooseOption,
  roadClosure,
  closedStreets,
  appliedUpgrade,
  upgradeEcologyEntry,
  upgradeFeatures,
  contributionBadgesReached,
  jobText,
  plainText,
  isJobBuilt,
  jobInProgress,
  cancelJob,
  jobDivisor,
} from '../street-jobs.js?v=jobs-2';
import { energyMax, moodMax } from '../metabolics.js';
import { grantMoodXp } from '../mood-xp.js';
import { textureFromUrl } from '../textures.js';

export const STREET_JOBS_FEATURE_ID = 'street-jobs';
const BOARD_CLASS = 'street_job_board';
const BOARD_ART = 'assets/sprites/street-jobs/sign_stake.png';
const BARRICADE_ART = 'assets/decos/groddle/door_barricade_wood_1.png';
const FLORA_ART = Object.freeze({
  flowers: ['bling_branchflowerbrush_red_1', 'bling_branchflowerbrush_white_1', 'bling_branchflowerbrush_purple_2'],
  mushrooms: ['bling_wildmushrooms_1', 'bling_wildmushrooms_2', 'bling_mushroom_king_bolete_1'],
  bushes: ['bush_1', 'bush_2'],
});
const FLORA_COUNT = 6;
const WALK_AWAY_PX = 260;

let catalog = null;
let streetIndex = null;
let loading = null;
let state = normalizeStreetJobState({});
let generation = 0;
let board = null; // { sprite, target, plate, jobs: [jobId], demo }
let barricades = [];
let flora = [];
let work = null; // { jobId, rid, nextAt, units, energy, startedAt, toolSprite }
let panel = null;
let panelJobId = null;
let lastResult = '';
let autoplay = { stage: '', timer: 0 };
let demo = null; // { jobId, phase }
/** Projects other features own (projectApi.register): jobId -> { onDone, kicker, place, target } */
const external = new Map();
/** QA autoplay of an external project (projectApi.autoplay). */
let extAuto = null; // { jobId }

/* ------------------------------------------------------------------ */
/* Loading                                                              */
/* ------------------------------------------------------------------ */

/** A phase's name; the source's phase classes title themselves "{job_location}" (the new street's name). */
function phaseTitle(job, phase, def) {
  return jobText(phase?.label || def?.title || '', { location: job?.label });
}

function load() {
  if (catalog) return Promise.resolve(catalog);
  if (!loading) {
    loading = Promise.all([
      fetch('assets/content/street-jobs.json?v=jobs-4').then((r) => r.json()),
      fetch('assets/streets/index.json').then((r) => r.json()),
    ])
      .then(([cat, idx]) => {
        catalog = cat;
        streetIndex = idx;
        for (const [id, meta] of Object.entries(cat.items || {})) {
          ensureItem(id, { label: meta.label, desc: meta.desc, baseCost: meta.baseCost, stackMax: meta.stackMax });
        }
        return catalog;
      })
      .catch((err) => {
        console.warn('street jobs catalog', err);
        loading = null;
        return null;
      });
  }
  return loading;
}

const exemptFrom = () => (streetIndex?.default ? [streetIndex.default] : []);
// A QA demo board runs its project even when the starter street exempts it.
const opts = () => ({ exemptFrom: exemptFrom(), force: demo ? [demo.jobId] : [] });
const streetLabel = (tsid) => {
  const g = String(tsid || '').startsWith('L') ? `G${String(tsid).slice(1)}` : tsid;
  return streetIndex?.streets?.[g]?.label || g;
};
const itemLabel = (cls, n = 1) => {
  const meta = catalog?.items?.[cls];
  if (meta) return n === 1 ? meta.label : meta.namePlural || meta.label;
  const known = ITEM_CATALOG[cls];
  if (known?.label) return n === 1 ? known.label : known.labelPlural || known.namePlural || known.label;
  return String(cls || '').replace(/_/g, ' ');
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** 'mining_4' -> 'Mining IV' (the source requirement wording). */
const skillLabel = (id) => {
  const name = getSkillCatalog()?.[id]?.name || String(id).replace(/_\d+$/, '').replace(/_/g, ' ');
  const rank = Number(String(id).match(/_(\d+)$/)?.[1]);
  return rank ? `${name} ${ROMAN[rank] || rank}` : name;
};
/** The source's own requirement line without its multiplayer total. */
const reqTitle = (r) => String(r.desc || '').replace(/\s*-\s*[\d,]+ (?:units )?needed.*$/i, '').trim();

/* ------------------------------------------------------------------ */
/* Board and road markers                                               */
/* ------------------------------------------------------------------ */

function boardJobs(engine) {
  if (demo) return [demo.jobId];
  return (catalog?.byStreet?.[engine.streetTsid] || []).slice();
}

function boardHeadline(engine) {
  const ids = boardJobs(engine);
  if (!ids.length) return null;
  const rows = demo
    ? [{ jobId: demo.jobId, ...jobStatus(state, catalog, demo.jobId, Date.now(), opts()) }]
    : streetJobs(state, catalog, engine.streetTsid, Date.now(), opts());
  return rows[0] || null;
}

/** The walkable platform surface at x, nearest at or below fromY. */
function groundYAt(engine, x, fromY) {
  let best = null;
  for (const pl of engine.platforms || []) {
    const lo = Math.min(pl.x1, pl.x2);
    const hi = Math.max(pl.x1, pl.x2);
    if (x < lo || x > hi || hi === lo) continue;
    const y = pl.y1 + ((pl.y2 - pl.y1) * (x - pl.x1)) / (pl.x2 - pl.x1);
    if (y < fromY - 24) continue;
    if (best == null || y < best) best = y;
  }
  return best ?? fromY;
}

function spawnBoard(engine, point) {
  const { PIXI } = engine;
  const spr = new PIXI.Container();
  const sign = new PIXI.Sprite(textureFromUrl(BOARD_ART));
  sign.anchor.set(0.5, 1);
  spr.addChild(sign);
  const plate = new PIXI.Graphics();
  plate.y = -118;
  spr.addChild(plate);
  spr.x = point.x;
  spr.y = point.y + 2;
  spr.zIndex = 6;
  spr._worldHitW = 70;
  spr._worldHitH = 110;
  engine.entityLayer.addChild(spr);
  const head = boardHeadline(engine);
  const job = head ? jobDef(catalog, head.jobId) : null;
  const target = engine.register({
    classId: BOARD_CLASS,
    featureId: STREET_JOBS_FEATURE_ID,
    label: job?.kind === 'upgrade' ? 'Street Upgrade Project' : 'Street Project',
    subtitle: job ? job.title : 'Projects for this street',
    sprite: spr,
  });
  board = { sprite: spr, target, plate };
  drawPlate(engine);
}

/** A small progress pill above the sign: phase n/m and the phase's progress. */
function drawPlate(engine) {
  if (!board?.plate || board.plate.destroyed) return;
  const g = board.plate;
  g.clear();
  g.removeChildren().forEach((c) => c.destroy());
  const head = boardHeadline(engine);
  if (!head) return;
  const job = jobDef(catalog, head.jobId);
  const reqs = phaseRequirements(state, catalog, head.jobId);
  const need = reqs.reduce((s, r) => s + r.need, 0) || 1;
  const got = reqs.reduce((s, r) => s + r.got, 0);
  const perc = head.status === 'done' || head.status === 'built' ? 1 : got / need;
  const w = 74;
  g.roundRect(-w / 2, -12, w, 22, 9).fill({ color: 0x2d2a24, alpha: 0.82 });
  g.roundRect(-w / 2 + 5, 4, w - 10, 3, 1.5).fill({ color: 0x5c564a, alpha: 1 });
  g.roundRect(-w / 2 + 5, 4, Math.max(2, (w - 10) * perc), 3, 1.5).fill({ color: 0xf2c14e, alpha: 1 });
  const label = new engine.PIXI.Text(
    { text: head.status === 'done' || head.status === 'built'
      ? 'Complete'
      : head.status === 'delayed' || head.status === 'cooldown'
        ? 'Resting'
        : `Phase ${Math.min(job.phases.length, head.phase + 1)}/${job.phases.length}`, style: { fontFamily: 'Arial', fontSize: 10, fontWeight: '700', fill: 0xfff6dc } },
  );
  label.anchor.set(0.5, 0.5);
  label.y = -4;
  g.addChild(label);
}

function signpostTsids(street) {
  const out = [];
  for (const s of street?.signposts || []) for (const c of s.connects || []) if (c?.tsid) out.push(c.tsid);
  return out;
}

/**
 * Crossed planks over each closed arm. Arm layout mirrors street-render.js
 * buildSignpostSprite (post 246 px, arms every 28 px from 32 px below the
 * top, alternating right/left, width 18 + 9 per letter clamped 100..220,
 * holder scale 0.8, first four connections shown).
 */
const SIGN_SCALE = 0.8;
const SIGN_POST_H = 246;
function drawBarricades(engine) {
  clearBarricades();
  const street = engine.street;
  if (!street?.signposts?.length || !street.bounds) return;
  const { PIXI } = engine;
  for (const s of street.signposts) {
    const shown = (s.connects || []).filter((c) => c && (c.label || c.tsid)).slice(0, 4);
    const closed = shown.filter((c) => roadClosure(state, catalog, c.tsid, [c.tsid], opts()));
    if (!closed.length) continue;
    const pos = worldToScreen(street, s.x, s.y);
    const wrap = new PIXI.Container();
    wrap.x = pos.x;
    wrap.y = pos.y;
    wrap.zIndex = 7;
    shown.forEach((c, i) => {
      if (!closed.includes(c)) return;
      const left = Boolean(i % 2);
      const label = c.label || c.tsid || 'Somewhere';
      const armW = signArmWidth(PIXI, label);
      const art = new PIXI.Sprite(textureFromUrl(BARRICADE_ART));
      art.anchor.set(0.5, 0.5);
      art.scale.set(0.085);
      art.alpha = 0.95;
      art.rotation = ((left ? 5.5 : -5.5) * Math.PI) / 180;
      // Nailed just past the arm's tip so the street name stays readable.
      art.x = (left ? -1 : 1) * (2 + armW + 18) * SIGN_SCALE;
      art.y = (-SIGN_POST_H + i * 28 + 32) * SIGN_SCALE;
      wrap.addChild(art);
    });
    const tag = new PIXI.Text({ text: closed.length === 1 ? `${closed[0].label}: under construction` : `${closed.length} roads under construction`, style: {
      fontFamily: 'Arial',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xfff6dc,
      stroke: { color: 0x3b2f22, width: 3 },
    } });
    tag.anchor.set(0.5, 0);
    tag.y = (-SIGN_POST_H + Math.min(shown.length, 4) * 28 + 40) * SIGN_SCALE;
    // The planks say it from afar; the words only show close up, in front
    // of the avatar so its head never hides them.
    const tagWrap = new PIXI.Container();
    tagWrap.x = pos.x;
    tagWrap.y = pos.y;
    tagWrap.zIndex = 8001;
    tagWrap.visible = false;
    tagWrap.addChild(tag);
    wrap.barricadeTag = tagWrap;
    engine.entityLayer.addChild(wrap, tagWrap);
    barricades.push(wrap, tagWrap);
  }
}

function clearBarricades() {
  for (const b of barricades) if (!b.destroyed) b.destroy({ children: true });
  barricades = [];
}

function drawFlora(engine) {
  clearFlora();
  const option = appliedUpgrade(state, catalog, engine.streetTsid);
  if (!option) return;
  const kinds = upgradeFeatures(option).flora;
  if (!kinds.length) return;
  const art = kinds.flatMap((k) => FLORA_ART[k] || []);
  const points = engine.placement('street-job-flora');
  points.forEach((p, i) => {
    const spr = new engine.PIXI.Sprite(textureFromUrl(`assets/decos/groddle/${art[i % art.length]}.png`));
    spr.anchor.set(0.5, 1);
    spr.scale.set(0.55);
    spr.x = p.x;
    spr.y = p.y + 6;
    spr.zIndex = 1;
    engine.entityLayer.addChild(spr);
    flora.push(spr);
  });
}

function clearFlora() {
  for (const f of flora) if (!f.destroyed) f.destroy();
  flora = [];
}

/* ------------------------------------------------------------------ */
/* Rewards                                                              */
/* ------------------------------------------------------------------ */

/** 0 up to the player's metabolic maximum (the energy tank, also mood's). */
function clampMetabolic(v, max) {
  return Math.max(0, Math.min(max, Math.round(v)));
}

/**
 * quests/job_*.js job_complete and job_complete_performance award with
 * stats_add_xp(n, false), so the iMG takes the mood bonus. Returns the
 * rewards with the iMG that landed.
 */
function payout(engine, rewards = {}) {
  const { xp = 0, currants = 0, mood = 0, energy = 0, favor = [] } = rewards || {};
  const pc = engine.pc;
  const landed = xp ? grantMoodXp(pc, xp) : 0;
  if (currants) pc.currants = (pc.currants || 0) + currants;
  if (mood) pc.mood = clampMetabolic((pc.mood || 0) + mood, moodMax(pc));
  if (energy) pc.energy = clampMetabolic((pc.energy || 0) + energy, energyMax(pc));
  const ledger = pc.giantFavor;
  for (const f of favor) {
    if (!f?.points || !ledger) continue;
    const giants = f.giant === 'all' ? Object.keys(GIANTS) : [f.giant === 'tii' ? 'ti' : f.giant];
    for (const g of giants) ledger[g] = Math.max(0, Number(ledger[g]) || 0) + f.points;
  }
  return { ...(rewards || {}), xp: landed };
}

function rewardBits(r) {
  const bits = [];
  if (r.xp) bits.push(`+${r.xp.toLocaleString()} iMG`);
  if (r.currants) bits.push(`+${r.currants.toLocaleString()} currants`);
  if (r.mood) bits.push(`+${r.mood.toLocaleString()} mood`);
  if (r.energy) bits.push(`+${r.energy.toLocaleString()} energy`);
  for (const f of r.favor || []) {
    if (!f.points) continue;
    const who = f.giant === 'all' ? 'favor with every Giant' : `${f.giant[0].toUpperCase()}${f.giant.slice(1)} favor`;
    bits.push(`+${f.points.toLocaleString()} ${who}`);
  }
  for (const it of r.items || []) bits.push(`+${it.count} ${itemLabel(it.classTsid, it.count)}`);
  return bits;
}

function grantItems(engine, items) {
  for (const it of items) {
    if (catalog.items?.[it.classTsid]) {
      const meta = catalog.items[it.classTsid];
      ensureItem(it.classTsid, { label: meta.label, desc: meta.desc, baseCost: meta.baseCost, stackMax: meta.stackMax });
    }
    addItem(engine.inv, it.classTsid, it.count);
    // collection_street_creator_* count in_inventory pieces.
    if (/^trophy_street_creator_/.test(it.classTsid)) engine.achievement(`in_inventory:${it.classTsid}`, 1);
  }
  grantFinishedTrophies(engine);
}

/** The collection badges' item reward: the whole trophy, once. */
function grantFinishedTrophies(engine) {
  const unlocked = engine.unlockedAchievements || [];
  for (const family of TROPHY_FAMILIES) {
    const badge = `collection_street_creator_${family}`;
    if (!unlocked.includes(badge) || state.trophiesGranted.includes(family)) continue;
    state.trophiesGranted.push(family);
    const id = `trophy_street_creator_${family}`;
    grantItems(engine, [{ classTsid: id, count: 1 }]);
    engine.pushActivity(`You assembled the ${itemLabel(id)}!`);
  }
}

function afterContribution(engine, res) {
  if (res.newPhase) {
    for (const badge of contributionBadgesReached(res.distinctPhases)) engine.grantAchievement(badge);
  }
  if (res.phaseReady) finishPhase(engine, res.jobId || panelJobId);
}

/** Source completion text -> { header, pages } split on <split butt_txt="..."/>. */
function completionPages(html, vars) {
  const text = jobText(html, vars);
  const header = plainText(text.match(/^<b>([\s\S]*?)<\/b>/)?.[1] || '');
  const body = text.replace(/^<b>[\s\S]*?<\/b>(?:<br\s*\/?>)*/, '');
  const pages = [];
  const re = /<split\s+butt_txt="([^"]*)"\s*\/?>/g;
  let last = 0;
  let m;
  while ((m = re.exec(body))) {
    pages.push({ text: plainText(body.slice(last, m.index)), response: m[1] });
    last = re.lastIndex;
  }
  pages.push({ text: plainText(body.slice(last)), response: 'Continue' });
  return { header, pages: pages.filter((p) => p.text) };
}

function finishPhase(engine, jobId) {
  if (!phaseIsComplete(state, catalog, jobId)) return;
  if (work?.jobId === jobId) stopWork(engine, '');
  const job = jobDef(catalog, jobId);
  const out = settlePhase(state, catalog, jobId, Date.now());
  if (!out.ok) return;
  if ((demo && engine.param('jobautoplay')) || extAuto?.jobId === jobId) {
    // QA autoplay runs straight through the source phase delays.
    const row = state.jobs[jobId];
    if (row) row.readyAt = 0;
  }
  const paid = payout(engine, out.rewards);
  const paidPerformance = payout(engine, out.performance);
  grantItems(engine, out.performance.items);
  engine.achievement(PHASE_WINNER_COUNTER, 1);
  const bits = [...rewardBits(paid), ...rewardBits(paidPerformance)];
  const solo = job.kind === 'restore'
    ? ''
    : `Solo amounts are 1/${SOLO_DIVISOR} of the original multiplayer totals, and the phase rewards scale by the same 1/${SOLO_DIVISOR}. As the top contributor you also earned the full performance rewards.`;
  let title = `${job.title}: phase ${out.index + 1} of ${out.phaseCount}`;
  let steps;
  if (out.finalPhase) {
    ({ title, steps } = finishJob(engine, jobId, out, solo));
  } else {
    // players/inc_jobs.js jobs_familiar_turnin_do phase text.
    steps = [
      {
        text: `Yay! The ${phaseOrdinal(out.index)} phase, ${phaseTitle(job, out.phase, out.def)}, of the project ${job.title} has been completed! You did ${out.participation}% of the work.`,
        response: 'View Rewards',
      },
      { text: solo, response: 'Continue' },
    ];
    const next = out.next;
    const mins = out.readyAt ? Math.round((out.readyAt - Date.now()) / 60000) : 0;
    steps.push({
      text: mins
        ? `${next?.delayText || `The ${phaseOrdinal(out.index + 1)} phase, ${next?.label || 'the next phase'}, opens in ${mins} minutes.`}`
        : `The ${phaseOrdinal(out.index + 1)} phase, ${next?.label || 'the next phase'}, is ready now.`,
      response: 'OK',
    });
  }
  engine.award({ kind: 'quest', title, body: '', subtitle: bits.join(' · '), iconUrl: external.get(jobId)?.iconUrl || BOARD_ART, steps, primaryLabel: 'OK' });
  lastResult = `${jobId}:phase${out.index + 1}${out.finalPhase ? ':done' : ''}`;
  engine.pushActivity({ base: `Project phase complete: ${job.title}`, effects: { xp: paid.xp + paidPerformance.xp } });
  engine.playSound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
  engine.updateHud();
  engine.save();
  renderPanel(engine);
  drawPlate(engine);
}

let pendingReload = null;

function finishJob(engine, jobId, out, solo) {
  const job = jobDef(catalog, jobId);
  const def = phaseClass(catalog, jobId, 0).def;
  if (out.participant) engine.achievement(PARTICIPANT_COUNTER, 1);
  if (job.kind === 'restore') return finishRestore(engine, jobId, job, def, out);
  const contributions = job.phases
    .map((p, i) => {
      const mine = state.jobs[jobId]?.mine?.[p.classTsid];
      return `${i + 1}. ${p.label || catalog.classes[p.classTsid]?.title || 'Phase'}: ${mine ? 'You contributed 100% of the work!' : 'You did not contribute.'}`;
    })
    .join(' ');
  teleportationFeature.grantScript(engine, arrivalFor(job));
  if (job.kind === 'street') {
    const { header, pages } = completionPages(def.completion, { location: job.label, participation: out.participation });
    const steps = pages.length ? pages : [{ text: `Hooray! The project ${job.title} has been completed!`, response: 'Continue' }];
    steps.push({ text: `Your contributions: ${contributions}`, response: 'Continue' });
    const from = job.connecting.includes(engine.streetTsid) ? engine.streetTsid : job.connecting[0];
    steps.push({
      text: `You've been given a Teleportation Script to take you to ${job.label}, and the road from ${streetLabel(from)} is open. ${solo}`,
      response: 'OK',
    });
    engine.toast(`The road to ${job.label} is open!`, 3200);
    drawBarricades(engine);
    return { title: header || job.title, steps };
  }
  const option = out.option;
  const steps = [
    { text: `Hooray! The project ${job.title} has been completed! Your contributions: ${contributions}`, response: 'View Rewards' },
    { text: `${job.label} is now ${option?.name || 'upgraded'}. ${option?.desc || ''}`, response: 'Continue' },
    {
      text: `The original upgrade template geometry is not in the public archive, so ${job.label} keeps its shape and gains what the option promises that the remake can show: its shrine, more animals, mining rocks, and flowers or mushrooms. ${solo}`,
      response: 'OK',
    },
  ];
  // locations/inc_upgrades.js upgrades_move_players: reload the street once the award closes.
  pendingReload = { tsid: engine.streetTsid, x: engine.player?.x, y: engine.player?.y };
  return { title: job.title, steps };
}

/**
 * players/inc_jobs.js jobs_familiar_job_complete_do, type 5: no
 * Teleportation Script; "The <b>title</b> restoration project on your home
 * street has completed. Since you contributed, you got N imagination."
 * The owner's hook (quest.js doJobEffects type 5) puts the item back.
 */
function finishRestore(engine, jobId, job, def, out) {
  const hooks = external.get(jobId);
  const where = hooks?.place || 'on your home street';
  const name = phaseTitle(job, job.phases[0], def);
  const text = `The ${name} restoration project ${where} has completed.${out.rewards.xp ? ` Since you contributed, you got ${out.rewards.xp.toLocaleString()} imagination.` : ''}`;
  engine.pushActivity(text);
  let after = '';
  try {
    after = hooks?.onDone?.(engine, { jobId, out, job }) || '';
  } catch (err) {
    console.warn('restore onDone', err);
  }
  const steps = [{ text, response: 'View Rewards' }];
  const done = plainText(def.completion || '');
  steps.push({ text: [done, after].filter(Boolean).join(' '), response: 'OK' });
  return { title: `${name} restored`, steps };
}

function tickReload(engine) {
  if (!pendingReload) return;
  if (document.querySelector('#award-screen:not([hidden])') || engine.busy()) return;
  const r = pendingReload;
  pendingReload = null;
  if (engine.streetTsid === r.tsid) engine.enter(r.tsid, { spawnX: r.x, spawnY: r.y });
}

/** players/inc_jobs.js: the script points at an incoming signpost's arrival. */
function arrivalFor(job) {
  const meta = streetIndex?.streets?.[job.street];
  return { tsid: job.street, label: job.label, hubName: meta?.hubName || job.hub || '' };
}

/* ------------------------------------------------------------------ */
/* Work sessions                                                        */
/* ------------------------------------------------------------------ */

function workCtx(engine) {
  return {
    inv: engine.inv,
    pc: engine.pc,
    learned: engine.learnedSkills,
    energy: engine.pc.energy,
    toolOk: (tool, wear) => canUseTool(engine.toolState, tool, wear).ok,
    useTool: (tool, wear) => useToolCondition(engine.toolState, tool, wear),
  };
}

function startWork(engine, jobId, rid, maxUnits = Infinity) {
  if (work) stopWork(engine, '');
  const check = workCheck(state, catalog, jobId, rid, workCtx(engine));
  if (!check.ok) {
    engine.toast(check.msg);
    return false;
  }
  const { PIXI } = engine;
  const icon = new PIXI.Sprite(textureFromUrl(itemIcon(check.tool)));
  icon.anchor.set(0.5, 1);
  icon.scale.set(0.8);
  icon.zIndex = 40;
  engine.entityLayer.addChild(icon);
  work = {
    jobId,
    rid,
    maxUnits,
    units: 0,
    energy: 0,
    startedAt: Date.now(),
    nextAt: Date.now() + WORK_UNIT_MS,
    anchorX: engine.player.x,
    toolSprite: icon,
    tool: check.tool,
  };
  engine.pushActivity(`You start to ${check.req.verb} with your ${itemLabel(check.tool)}.`);
  // Step back to the street so the work is visible; the board reopens the panel.
  closePanel();
  return true;
}

function stopWork(engine, reason) {
  if (!work) return;
  const w = work;
  work = null;
  if (w.toolSprite && !w.toolSprite.destroyed) w.toolSprite.destroy();
  const req = phaseRequirements(state, catalog, w.jobId).find((r) => r.id === w.rid);
  if (reason) engine.prompt({ kicker: 'Street Project', title: 'Work stopped', text: reason });
  const sayTo = external.get(w.jobId)?.target?.() || board?.target;
  if (req && sayTo && w.units) {
    const remaining = req.need - req.got;
    engine.say(
      sayTo,
      `Thanks! You contributed ${w.units} units of the ${w.units + remaining} we need right now. It took ${(w.units * WORK_UNIT_MS) / 1000} seconds and used ${w.energy} energy.`,
      5000,
    );
  }
  renderPanel(engine);
}

function tickWork(engine, now) {
  if (!work) return;
  const p = engine.player;
  if (work.toolSprite && !work.toolSprite.destroyed) {
    work.toolSprite.x = p.x;
    work.toolSprite.y = p.y - 96 + Math.sin(now / 120) * 4;
  }
  if (Math.abs(p.x - work.anchorX) > WALK_AWAY_PX) {
    stopWork(engine, 'You walked away from the project.');
    return;
  }
  if (now < work.nextAt) return;
  work.nextAt += WORK_UNIT_MS;
  if (work.nextAt < now) work.nextAt = now + WORK_UNIT_MS;
  const jobId = work.jobId;
  const res = applyWorkUnit(state, catalog, jobId, work.rid, workCtx(engine));
  if (!res.ok) {
    stopWork(engine, res.msg);
    return;
  }
  work.units += 1;
  work.energy += res.energy;
  engine.floatText(p.x, p.y - 118, `+1 ${res.req.verbPast}`, 0xf2c14e);
  if (res.wear?.msg) engine.pushActivity(res.wear.msg);
  engine.updateHud();
  drawPlate(engine);
  if (res.newPhase) for (const badge of contributionBadgesReached(res.distinctPhases)) engine.grantAchievement(badge);
  if (res.phaseReady) {
    stopWork(engine, '');
    finishPhase(engine, jobId);
    return;
  }
  if (res.left <= 0 || work.units >= work.maxUnits) {
    stopWork(engine, '');
    return;
  }
  if (panel && !panel.hidden) renderPanel(engine);
}

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

const PANEL_CSS = `
.sj-card{width:min(600px,94vw);background:radial-gradient(circle at 92% 0%,rgba(242,193,78,.18),transparent 36%),#f7f4ed}
.sj-kicker{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a6d2b;margin:0}
.sj-desc{margin:.1rem 0 .55rem;padding-left:.6rem;border-left:4px solid #e0b443;color:#53534d;font-size:.84rem}
.sj-phase{display:flex;align-items:center;gap:.5rem;margin:.2rem 0 .45rem;font-size:.85rem;font-weight:700;color:#4a4336}
.sj-bar{flex:1;height:8px;border-radius:4px;background:#e4ddd0;overflow:hidden}
.sj-bar>i{display:block;height:100%;background:linear-gradient(90deg,#e8b23d,#f6d36b)}
.sj-reqs{list-style:none;margin:0;padding:0;display:grid;gap:.35rem}
.sj-req{display:grid;grid-template-columns:34px 1fr auto;gap:.5rem;align-items:center;background:rgba(255,255,255,.86);border:1px solid #e1d9c9;border-radius:8px;padding:.35rem .5rem}
.sj-req img{width:32px;height:32px;object-fit:contain}
.sj-req b{display:block;font-size:.82rem;color:#3a352c}
.sj-req small{display:block;font-size:.72rem;color:#7a7264}
.sj-req.is-done{opacity:.6}
.sj-req.is-locked{opacity:.55;background:rgba(240,236,228,.8)}
.sj-req .sj-acts{display:flex;gap:.3rem;flex-wrap:wrap;justify-content:flex-end}
.sj-req button,.sj-options button{font:inherit;font-size:.74rem;font-weight:700;border-radius:7px;border:1px solid #c9b48a;background:#fff;color:#6a4f17;padding:.3rem .55rem;cursor:pointer;white-space:nowrap}
.sj-req button.primary{background:#e8b23d;border-color:#c99525;color:#3a2a08}
.sj-req button[disabled]{opacity:.45;cursor:not-allowed}
.sj-options{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin:.1rem 0 .55rem}
.sj-options button{text-align:left;white-space:normal;padding:.45rem .55rem;line-height:1.3}
.sj-options button.is-chosen{background:#fff6dc;border-color:#e0b443;box-shadow:0 0 0 2px rgba(224,180,67,.35)}
.sj-options button span{display:block;font-weight:400;color:#6d6555;font-size:.7rem;margin-top:.15rem}
.sj-status{margin:.5rem 0 0;font-size:.78rem;color:#6d6555}
.sj-others{margin:.55rem 0 0;padding:.45rem 0 0;border-top:1px dashed #d8cfbd;font-size:.74rem;color:#6d6555}
.sj-others ul{margin:.2rem 0 0;padding-left:1.1rem}
.sj-map-card{margin:0 0 .5rem;background:#fff8e6;border:1px solid #e6cf95;border-radius:9px;padding:.45rem .6rem;font-size:.78rem;color:#5a4a2a}
.sj-map-card header{display:flex;gap:.5rem;align-items:center}
.sj-map-card img{width:24px;height:38px;object-fit:contain}
.sj-map-card strong{display:block;font-size:.82rem;color:#3a2f1a}
.sj-map-card span{display:block}
.sj-others button{font:inherit;font-size:.72rem;background:none;border:0;color:#3a6a9a;cursor:pointer;padding:0;text-decoration:underline}
@media (max-width:480px){.sj-options{grid-template-columns:1fr}.sj-req{grid-template-columns:28px 1fr}.sj-req .sj-acts{grid-column:1/-1}}
`;

function ensurePanel() {
  if (panel) return panel;
  if (!document.getElementById('sj-css')) {
    const style = document.createElement('style');
    style.id = 'sj-css';
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }
  panel = document.createElement('div');
  panel.id = 'street-job-panel';
  panel.className = 'glitch-modal street-job-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="glitch-modal-card sj-card" role="dialog" aria-modal="true" aria-labelledby="sj-title">
    <div class="glitch-modal-head"><div style="flex:1 1 auto"><p class="sj-kicker" data-sj-kicker></p><h2 id="sj-title" data-sj-title></h2></div>
    <button type="button" class="verb-menu-x" data-sj-close aria-label="Close">×</button></div>
    <p class="sj-desc" data-sj-desc></p>
    <div class="sj-options" data-sj-options hidden></div>
    <div class="sj-phase"><span data-sj-phase></span><div class="sj-bar"><i data-sj-bar></i></div></div>
    <ul class="sj-reqs" data-sj-reqs></ul>
    <p class="sj-status" data-sj-status></p>
    <div class="sj-others" data-sj-others hidden></div>
  </div>`;
  const host = document.getElementById('make-panel')?.parentElement || document.body;
  host.appendChild(panel);
  panel.addEventListener('click', (e) => {
    if (e.target === panel || e.target.closest('[data-sj-close]')) closePanel();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hidden) {
      e.stopPropagation();
      closePanel();
    }
  }, true);
  return panel;
}

let engineRef = null;

function openPanel(engine, jobId) {
  ensurePanel();
  panelJobId = jobId;
  panel.hidden = false;
  renderPanel(engine);
}

function closePanel() {
  if (panel) panel.hidden = true;
  if (engineRef) publish(engineRef);
}

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

function renderPanel(engine) {
  if (!panel || panel.hidden || !panelJobId || !catalog) return;
  if (!jobDef(catalog, panelJobId)) {
    panel.hidden = true;
    return;
  }
  const jobId = panelJobId;
  const job = jobDef(catalog, jobId);
  const status = jobStatus(state, catalog, jobId, Date.now(), { ...opts(), street: engine.streetTsid });
  const row = state.jobs[jobId] || { phase: 0 };
  const pcx = phaseClass(catalog, jobId, Math.min(status.phase, job.phases.length - 1));
  const def = pcx.def;
  const q = (s) => panel.querySelector(s);
  const kind = { upgrade: 'Street Upgrade', restore: 'Restoration Project' }[job.kind] || 'Street Project';
  q('[data-sj-kicker]').textContent = `${kind} · ${external.get(jobId)?.kicker || job.hub || streetLabel(engine.streetTsid)}`;
  q('[data-sj-title]').textContent = job.title;
  const desc = job.kind === 'street'
    ? plainText(jobText(job.desc || def.desc, { location: job.label }))
    : job.desc;
  q('[data-sj-desc]').textContent = desc;

  // Upgrade vote.
  const optBox = q('[data-sj-options]');
  optBox.replaceChildren();
  optBox.hidden = job.kind !== 'upgrade';
  if (job.kind === 'upgrade') {
    const up = catalog.upgrades[job.street];
    const chosen = row.option || up.options[0]?.id;
    for (const o of up.options) {
      const b = el('button', { type: 'button', class: o.id === chosen ? 'is-chosen' : '', dataset: { sjOption: o.id } });
      b.append(document.createTextNode(`${o.id === chosen ? '★ ' : ''}${o.name}`), el('span', {}, o.desc));
      b.disabled = status.status === 'done';
      b.addEventListener('click', () => {
        chooseOption(state, catalog, jobId, o.id);
        engine.save();
        renderPanel(engine);
      });
      optBox.append(b);
    }
  }

  const reqs = status.status === 'done' || status.status === 'built'
    ? phaseRequirements(state, catalog, jobId, job.phases.length - 1)
    : phaseRequirements(state, catalog, jobId);
  const need = reqs.reduce((s, r) => s + r.need, 0) || 1;
  const got = reqs.reduce((s, r) => s + r.got, 0);
  q('[data-sj-phase]').textContent = `Phase ${Math.min(job.phases.length, status.phase + 1)} of ${job.phases.length}: ${phaseTitle(job, pcx.phase, def)}`;
  q('[data-sj-bar]').style.width = `${Math.round((status.status === 'done' ? 1 : got / need) * 100)}%`;

  const list = q('[data-sj-reqs]');
  list.replaceChildren();
  const open = status.status === 'active' || status.status === 'open';
  const ctx = workCtx(engine);
  for (const r of reqs) {
    const li = el('li', { class: `sj-req${r.done ? ' is-done' : ''}${!r.done && !r.open ? ' is-locked' : ''}`, dataset: { sjReq: r.id } });
    const iconCls = r.type === 'currants' ? 'currant' : r.classId;
    const img = el('img', { src: r.type === 'currants' ? 'assets/sprites/street-jobs/pile_of_currants.png' : itemIcon(iconCls), alt: '' });
    img.onerror = () => {
      img.style.visibility = 'hidden';
    };
    const text = el('div');
    const toolName = itemLabel(r.classIds?.[0] || r.classId);
    const title = r.type === 'work'
      ? `Contribute work: ${r.verb} with a ${toolName}`
      : reqTitle(r) || (r.type === 'currants' ? 'Contribute currants' : `Contribute ${itemLabel(r.classId, 2)}`);
    text.append(el('b', {}, title));
    const meta = [`${r.got.toLocaleString()} / ${r.need.toLocaleString()}`];
    if (r.type === 'item') meta.push(`you have ${countItem(engine.inv, r.classId)}`);
    if (r.type === 'work') {
      meta.push(`${r.energy} energy · ${r.wear} wear a unit`);
      if (r.skill) meta.push(`needs ${skillLabel(r.skill)}`);
    }
    if (!r.done && !r.open) meta.push('opens after the earlier steps');
    text.append(el('small', {}, meta.join(' · ')));
    const acts = el('div', { class: 'sj-acts' });
    if (open && r.open) {
      if (r.type === 'item') {
        const have = countItem(engine.inv, r.classId);
        const n = Math.min(have, r.need - r.got);
        const b = el('button', { type: 'button', class: 'primary', dataset: { sjAct: 'give' } }, n ? `Add ${n}` : 'Add');
        b.disabled = !n;
        b.addEventListener('click', () => doGive(engine, jobId, r.classId, n));
        acts.append(b);
      } else if (r.type === 'currants') {
        const n = Math.min(engine.pc.currants || 0, r.need - r.got);
        const b = el('button', { type: 'button', class: 'primary', dataset: { sjAct: 'currants' } }, n ? `Give ${n.toLocaleString()}` : 'Give');
        b.disabled = !n;
        b.addEventListener('click', () => doCurrants(engine, jobId, n));
        acts.append(b);
      } else if (r.type === 'work') {
        const busy = work && work.jobId === jobId && work.rid === r.id;
        if (busy) {
          const b = el('button', { type: 'button', dataset: { sjAct: 'stop' } }, `Stop (${work.units})`);
          b.addEventListener('click', () => stopWork(engine, ''));
          acts.append(b);
        } else {
          const check = workCheck(state, catalog, jobId, r.id, ctx);
          const b = el('button', { type: 'button', class: 'primary', dataset: { sjAct: 'work' } }, 'Work');
          b.disabled = !check.ok;
          b.title = check.ok ? `${r.need - r.got} units, ${(WORK_UNIT_MS / 1000).toFixed(1)}s each` : check.msg;
          b.addEventListener('click', () => startWork(engine, jobId, r.id));
          acts.append(b);
          if (check.canHire) {
            const quote = hireQuote(state, catalog, jobId, r.id);
            const h = el('button', { type: 'button', dataset: { sjAct: 'hire' } }, `Hire a hand · ${quote.cost.toLocaleString()}c`);
            h.title = `${check.msg} A neighbour who has it does the rest for its base cost.`;
            h.disabled = (engine.pc.currants || 0) < quote.cost;
            h.addEventListener('click', () => doHire(engine, jobId, r.id));
            acts.append(h);
          }
        }
      }
    } else if (r.done) {
      acts.append(el('small', {}, '✓'));
    }
    li.append(img, text, acts);
    list.append(li);
  }

  const statusLine = q('[data-sj-status]');
  const mins = (t) => Math.max(1, Math.ceil((t - Date.now()) / 60000));
  statusLine.textContent = {
    done: `Finished. ${{ street: `The road to ${job.label} is open.`, restore: `${job.label} is restored.` }[job.kind] || `${job.label} is upgraded.`}`,
    built: `${job.label} is already built.`,
    delayed: `${pcx.phase.delayText || 'The next phase is getting ready.'} It opens in ${status.until ? mins(status.until) : 1} minutes.`,
    cooldown: `This street just finished a project. The next one opens in ${status.until ? mins(status.until) : 1} minutes.`,
    active: `Solo amounts: 1/${SOLO_DIVISOR} of the original multiplayer totals.${work ? ` Working: ${work.units} units so far.` : ''}`,
    open: `Solo amounts: 1/${SOLO_DIVISOR} of the original multiplayer totals. Every contribution counts toward this phase.`,
  }[status.status];
  if (job.kind === 'restore' && (status.status === 'active' || status.status === 'open')) {
    const reward = Math.round((def.rewards?.xp || 0) * (Number(job.rewardMultiplier) || 1));
    statusLine.textContent = `${external.get(jobId)?.note || ''} Original amounts${jobDivisor(job) === 1 ? '' : ` / ${jobDivisor(job)}`}. Finishing it pays up to ${reward.toLocaleString()} iMG.${work ? ` Working: ${work.units} units so far.` : ''}`.trim();
  }

  const others = q('[data-sj-others]');
  others.replaceChildren();
  const rows = demo ? [] : streetJobs(state, catalog, engine.streetTsid, Date.now(), opts()).filter((r) => r.jobId !== jobId);
  others.hidden = !rows.length;
  if (rows.length) {
    others.append(document.createTextNode('More projects on this street:'));
    const ul = el('ul');
    for (const r of rows) {
      const li = el('li');
      const b = el('button', { type: 'button' }, jobDef(catalog, r.jobId).title);
      b.addEventListener('click', () => openPanel(engine, r.jobId));
      li.append(b, document.createTextNode(` · ${r.status}`));
      ul.append(li);
    }
    others.append(ul);
  }
  publish(engine);
}

function doGive(engine, jobId, classId, n) {
  const res = contributeItems(state, catalog, jobId, classId, n, engine.inv);
  if (!res.ok) return engine.toast(res.msg), false;
  engine.pushActivity(`You contributed ${res.amount} ${itemLabel(classId, res.amount)}.`);
  engine.playSound('ITEM_GIVE', { volume: 0.55 });
  engine.updateHud();
  afterContribution(engine, { ...res, jobId });
  engine.save();
  renderPanel(engine);
  drawPlate(engine);
  return true;
}

function doCurrants(engine, jobId, n) {
  const res = contributeCurrants(state, catalog, jobId, n, engine.pc);
  if (!res.ok) return engine.toast(res.msg), false;
  engine.pushActivity(`You contributed ${res.amount.toLocaleString()} currants.`);
  engine.updateHud();
  afterContribution(engine, { ...res, jobId });
  engine.save();
  renderPanel(engine);
  drawPlate(engine);
  return true;
}

function doHire(engine, jobId, rid) {
  const res = hireWork(state, catalog, jobId, rid, workCtx(engine));
  if (!res.ok) return engine.toast(res.msg), false;
  engine.pushActivity(`You hired a hand for ${res.units} units of work (${res.cost.toLocaleString()} currants).`);
  engine.updateHud();
  afterContribution(engine, { ...res, jobId });
  engine.save();
  renderPanel(engine);
  drawPlate(engine);
  return true;
}

/* ------------------------------------------------------------------ */
/* QA                                                                   */
/* ------------------------------------------------------------------ */

function resolveDemo(engine) {
  const want = engine.param('jobdemo');
  if (!want || !catalog) return null;
  let jobId = catalog.jobs[want] ? want : null;
  if (!jobId) jobId = Object.keys(catalog.jobs).find((id) => catalog.jobs[id].phases.some((p) => p.classTsid === want)) || null;
  if (!jobId) {
    engine.toast(`No playable street project uses ${want}.`);
    return null;
  }
  const job = catalog.jobs[jobId];
  // Fresh demo row: not grandfathered, no cooldown, at the requested phase.
  state.grandfathered = state.grandfathered.filter((t) => t !== job.street);
  for (const t of job.connecting || [job.street]) delete state.streetDone[t];
  const byClass = job.phases.findIndex((p) => p.classTsid === want);
  const phase = Math.max(0, Math.min(job.phases.length - 1, Number(engine.param('jobphase')) || (byClass > 0 ? byClass : 0)));
  state.jobs[jobId] = { phase, got: {}, mine: {}, hired: {}, startedAt: 0, readyAt: 0, doneAt: 0, option: null };
  return { jobId, phase };
}

/** Seed one phase's needs (QA only): items, currants, a working tool + skill per work req. */
function seedPhase(engine, jobId, { realWork }) {
  const reqs = phaseRequirements(state, catalog, jobId);
  let currants = 0;
  for (const r of reqs) {
    if (r.done) continue;
    if (r.type === 'item') addItem(engine.inv, r.classId, r.need - r.got);
    if (r.type === 'currants') currants += r.need - r.got;
    if (r.type === 'work') {
      const quote = hireQuote(state, catalog, jobId, r.id);
      currants += quote.cost;
      if (realWork) {
        const tool = r.classIds?.[0] || r.classId;
        if (!countItem(engine.inv, tool)) addItem(engine.inv, tool, 1);
        if (r.skill && !engine.learnedSkills.includes(r.skill)) engine.grantSkill(r.skill);
      }
    }
  }
  engine.pc.currants = (engine.pc.currants || 0) + currants;
  engine.pc.energy = 100;
}

function autoplayStep(engine, now) {
  const jobId = extAuto?.jobId || (demo && engine.param('jobautoplay') ? demo.jobId : null);
  if (!jobId || autoplay.stage === 'done') return;
  if (now < autoplay.timer) return;
  if (engine.questDialogueOpen()) {
    engine.acceptOpenOffer();
    autoplay.timer = now + 400;
    return;
  }
  if (document.querySelector('#award-screen:not([hidden])')) {
    // jobautoplay=hold leaves the first award open for a screenshot.
    if (engine.param('jobautoplay') === 'hold' || extAuto?.hold) {
      autoplay.stage = 'award';
      publish(engine);
      return;
    }
    document.querySelector('#award-screen [data-award-next]:not([hidden]), #award-screen [data-award-close]:not([hidden])')?.click();
    autoplay.timer = now + 500;
    return;
  }
  if (work) return;
  if (!jobDef(catalog, jobId)) {
    // An external project finished and its owner dropped it.
    autoplay.stage = 'done';
    extAuto = null;
    publish(engine);
    return;
  }
  const st = jobStatus(state, catalog, jobId, Date.now(), opts());
  if (st.status === 'done') {
    autoplay.stage = 'done';
    closePanel();
    publish(engine);
    return;
  }
  if (!panel || panel.hidden) openPanel(engine, jobId);
  if (autoplay.seededPhase !== st.phase) {
    autoplay.seededPhase = st.phase;
    autoplay.worked = {};
    seedPhase(engine, jobId, { realWork: true });
    if (jobDef(catalog, jobId).kind === 'upgrade') chooseOption(state, catalog, jobId, catalog.upgrades[jobDef(catalog, jobId).street].options.at(-1).id);
    renderPanel(engine);
    autoplay.timer = now + 700;
    return;
  }
  const reqs = phaseRequirements(state, catalog, jobId).filter((r) => r.open);
  const r = reqs[0];
  if (!r) {
    autoplay.timer = now + 500;
    return;
  }
  autoplay.stage = `phase${st.phase + 1}:${r.type}`;
  if (r.type === 'item') doGive(engine, jobId, r.classId, r.need - r.got);
  else if (r.type === 'currants') doCurrants(engine, jobId, r.need - r.got);
  else if (r.type === 'work') {
    // Two real work units, then hire the rest (both source paths).
    if (!autoplay.worked[r.id] && workCheck(state, catalog, jobId, r.id, workCtx(engine)).ok && r.need - r.got > 1) {
      autoplay.worked[r.id] = true;
      startWork(engine, jobId, r.id, 2);
    } else {
      const res = hireWork(state, catalog, jobId, r.id, workCtx(engine));
      if (!res.ok) {
        // Skill/tool in hand: finish it by hand but keep QA quick.
        const row = state.jobs[jobId];
        if (row) row.got[r.id] = r.need;
        const classTsid = jobDef(catalog, jobId).phases[row.phase].classTsid;
        row.mine[classTsid] = (row.mine[classTsid] || 0) + (r.need - r.got) * r.baseCost;
        if (phaseIsComplete(state, catalog, jobId)) finishPhase(engine, jobId);
        renderPanel(engine);
      } else {
        afterContribution(engine, { ...res, jobId });
        renderPanel(engine);
      }
    }
  }
  autoplay.timer = now + 650;
}

/* ------------------------------------------------------------------ */
/* QA attributes                                                        */
/* ------------------------------------------------------------------ */

function publish(engine) {
  if (!catalog) return;
  const head = board ? boardHeadline(engine) : null;
  engine.setData('streetJobBoard', head?.jobId || '');
  engine.setData('streetJobBoardX', board?.sprite && !board.sprite.destroyed ? String(Math.round(board.sprite.x)) : '');
  engine.setData('streetJobStatus', head?.status || '');
  if (head) {
    const job = jobDef(catalog, head.jobId);
    const reqs = phaseRequirements(state, catalog, head.jobId);
    const need = reqs.reduce((s, r) => s + r.need, 0) || 1;
    const got = reqs.reduce((s, r) => s + r.got, 0);
    engine.setData('streetJobPhase', `${Math.min(job.phases.length, head.phase + 1)}/${job.phases.length}`);
    engine.setData('streetJobProgress', String(Math.round((got / need) * 100)));
  }
  engine.setData('streetJobClosedRoads', String(barricades.length));
  engine.setData('streetJobBuilt', String(Object.values(state.jobs).filter((r) => r.doneAt).length));
  engine.setData('streetJobPanel', panel && !panel.hidden ? panelJobId : '');
  engine.setData('streetJobWork', work ? `${work.rid}:${work.units}` : '');
  engine.setData('streetJobLast', lastResult);
  engine.setData('streetJobUpgrade', appliedUpgrade(state, catalog, engine.streetTsid)?.name || '');
  engine.setData('streetJobPlayable', String(catalog.counts?.playableJobs || 0));
  if (engine.param('jobautoplay') || extAuto) engine.setData('streetJobAutoplay', autoplay.stage);
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const streetJobsFeature = {
  id: STREET_JOBS_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    load();
  },

  save() {
    return state;
  },

  restore(slice) {
    state = normalizeStreetJobState(slice || {});
  },

  ecologyOverride(street) {
    if (!catalog || !street?.tsid) return null;
    const option = appliedUpgrade(state, catalog, street.tsid);
    if (!option) return null;
    return upgradeEcologyEntry(ecologyForStreet(street.tsid), option);
  },

  placementGroups(population, street) {
    if (!catalog || !street?.tsid) return [];
    const out = [];
    const tsid = street.tsid;
    if (!engineRef?.param('jobdemo') && streetHasOpenProject(state, catalog, tsid, Date.now(), opts())) {
      out.push({ key: 'street-job-board', count: 1, clearance: 110 });
    }
    const option = appliedUpgrade(state, catalog, tsid);
    if (option && upgradeFeatures(option).flora.length) out.push({ key: 'street-job-flora', count: FLORA_COUNT, clearance: 60 });
    return out;
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    load().then(() => {
      if (mine !== generation || !catalog) return;
      if (initializeStreetJobs(state, engine.visitedStreets ? engine.visitedStreets() : [])) engine.save();
      if (engine.param('jobdemo') && !demo) demo = resolveDemo(engine);
      const tsid = engine.streetTsid;
      if (demo) {
        const p = engine.player;
        const x = p.x + 110;
        spawnBoard(engine, { x, y: groundYAt(engine, x, p.y) });
      } else if (streetHasOpenProject(state, catalog, tsid, Date.now(), opts())) {
        const point = engine.placement('street-job-board')[0] || { x: engine.player.x + 220, y: engine.player.y };
        spawnBoard(engine, point);
      }
      drawBarricades(engine);
      drawFlora(engine);
      grantFinishedTrophies(engine);
      if (demo && engine.param('jobautoplay')) autoplay.timer = Date.now() + 1500;
      publish(engine);
    });
  },

  onStreetClear(engine) {
    generation += 1;
    if (work) stopWork(engine, '');
    if (panel) panel.hidden = true;
    if (board?.sprite && !board.sprite.destroyed) board.sprite.destroy({ children: true });
    board = null;
    clearBarricades();
    clearFlora();
  },

  onTick(dtMs, now, engine) {
    if (!catalog) return;
    const px = engine.player?.x;
    for (const b of barricades) {
      if (b.barricadeTag && !b.destroyed) b.barricadeTag.visible = Number.isFinite(px) && Math.abs(px - b.x) < 160;
    }
    tickWork(engine, now);
    tickReload(engine);
    autoplayStep(engine, now);
    if (board && now - (board.platedAt || 0) > 5000) {
      board.platedAt = now;
      drawPlate(engine);
      publish(engine);
    }
  },

  /**
   * Loading card (location.js getLoadingInfo): the street's finished upgrade
   * time (ts_done, ms) and whether one of its projects is under way.
   */
  streetProjectInfo(tsid) {
    if (!catalog || !tsid) return null;
    const ids = catalog.byStreet?.[String(tsid).replace(/^L/, 'G')] || [];
    let upgradedAt = 0;
    for (const jobId of ids) {
      const job = catalog.jobs?.[jobId];
      const doneAt = Number(state.jobs[jobId]?.doneAt) || 0;
      if (job?.kind === 'upgrade' && doneAt > upgradedAt) upgradedAt = doneAt;
    }
    return { upgradedAt, activeProject: ids.some((jobId) => jobInProgress(state, jobId)) };
  },

  /** Closed roads block their signposts only; the Map still goes anywhere. */
  travelGate(tsid, engine, meta = {}) {
    if (!catalog || meta?.via !== 'signpost') return null;
    const closed = roadClosure(state, catalog, tsid, signpostTsids(engine.street), opts());
    if (!closed) return null;
    const from = closed.job.connecting.find((t) => t === engine.streetTsid) || closed.job.connecting[0];
    return {
      ok: false,
      msg: `The road to ${closed.job.label} is still under construction. Help build it at the project board on ${streetLabel(from)}, or use the Map.`,
    };
  },

  verbsFor(target, engine) {
    if (target.classId !== BOARD_CLASS || !catalog) return [];
    const head = boardHeadline(engine);
    return [{ id: 'view', label: 'view project', enabled: Boolean(head), tooltip: head ? jobDef(catalog, head.jobId).title : '', durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target.classId !== BOARD_CLASS) return false;
    const head = boardHeadline(engine);
    if (head) openPanel(engine, head.jobId);
    return true;
  },

  /** Streets whose road is still closed (signposts into them are blocked): map routes go round them (G177). */
  closedRoads() {
    return catalog ? closedStreets(state, catalog, opts()) : null;
  },

  mapCards(engine) {
    if (!catalog) return [];
    const rows = streetJobs(state, catalog, engine.streetTsid, Date.now(), opts()).filter((r) => r.status !== 'built');
    if (!rows.length) return [];
    if (!document.getElementById('sj-css')) ensurePanel();
    const card = el('section', { class: 'sj-map-card' });
    const head = el('header');
    const icon = el('img', { src: BOARD_ART, alt: '' });
    const text = el('div');
    text.append(el('strong', {}, 'Street projects here'), el('span', {}, rows.map((r) => `${jobDef(catalog, r.jobId).title} (${r.status})`).join(' · ')));
    head.append(icon, text);
    card.append(head);
    return [card];
  },

  /** QA / tests. */
  _state() {
    return { state, catalog, board: Boolean(board), work, demo, barricades: barricades.length };
  },
};

export { isJobBuilt };

/**
 * Projects owned by other features (a depleted cultivation's restoration).
 * The job joins the loaded catalog under its own id (never on a street's
 * board) and keeps its row in this feature's saved state, so it counts for
 * the contribution badges like any project.
 */
export const projectApi = {
  ready: () => load(),
  catalog: () => catalog,
  /**
   * job: { kind: 'restore', title, label, desc, phases: [{ classTsid, order, delaySeconds, label }],
   *        divisor, rewardMultiplier }
   * hooks: { onDone(engine, { jobId, out, job }) -> extra text, kicker, place, note, target() -> target }
   */
  register(jobId, job, hooks = {}) {
    if (!catalog) return false;
    if (!job?.phases?.every((p) => catalog.classes?.[p.classTsid])) return false;
    catalog.jobs[jobId] = { street: '', label: job.label || job.title, hub: '', connecting: [], ...job };
    external.set(jobId, hooks);
    return true;
  },
  /** Forget a project (its saved row too when `dropRow`). */
  unregister(jobId, { dropRow = false } = {}) {
    if (catalog?.jobs?.[jobId] && external.has(jobId)) delete catalog.jobs[jobId];
    if (work?.jobId === jobId && engineRef) stopWork(engineRef, '');
    external.delete(jobId);
    if (dropRow) delete state.jobs[jobId];
    if (panelJobId === jobId && panel) panel.hidden = true;
  },
  registered: (jobId) => external.has(jobId),
  status: (jobId) => (catalog && catalog.jobs[jobId] ? jobStatus(state, catalog, jobId, Date.now(), opts()) : null),
  inProgress: (jobId) => jobInProgress(state, jobId),
  percent(jobId) {
    if (!catalog?.jobs?.[jobId]) return 0;
    const reqs = phaseRequirements(state, catalog, jobId);
    const need = reqs.reduce((sum, r) => sum + r.need, 0) || 1;
    return reqs.reduce((sum, r) => sum + r.got, 0) / need;
  },
  requirements: (jobId) => (catalog?.jobs?.[jobId] ? phaseRequirements(state, catalog, jobId) : []),
  open(engine, jobId) {
    if (!catalog?.jobs?.[jobId]) return false;
    openPanel(engine, jobId);
    return true;
  },
  /** Wine of the Dead: cancel the project (everything put in is lost). */
  cancel(engine, jobId) {
    if (work?.jobId === jobId) stopWork(engine, '');
    const ok = cancelJob(state, jobId);
    if (ok && panelJobId === jobId) renderPanel(engine);
    return ok;
  },
  /** QA: seed and run the project to completion like &jobautoplay=1 (`hold` stops on the award). */
  autoplay(engine, jobId, { hold = false } = {}) {
    extAuto = { jobId, hold };
    autoplay = { stage: '', timer: Date.now() + 600 };
  },
  autoplayStage: () => autoplay.stage,
};
