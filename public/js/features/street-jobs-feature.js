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
 * Multiplayer (G346, engine.mode 'multiplayer' with a realtime client): a
 * street's build and upgrade projects are shared. The realtime server
 * (groddle-afternoon-server projects.go) owns them: every player's items,
 * currants and work fill the same phases, an item or currant contribution
 * counts once the site's ledger has taken it out of the player's ledger
 * (project_given: then it leaves the pack here), work units go one per
 * 1.5 s, and each contributor's reward comes from the server by the
 * source's shares and top-contributor rules (project_reward: the currants
 * and items already in the ledger). Everyone at the board sees it fill; a
 * finished street opens its road for everyone (project_built). Hire a hand
 * is solo only; restorations (projectApi) stay per player. Pure half:
 * js/street-jobs-mp.js. Solo runs none of it.
 *
 * Group halls (G331, multiplayer only): the catalog's ten halls join the
 * board on the streets they came from (mergeHalls). One takes nothing until
 * someone claims it for one of their groups (project_claim: the site checks
 * the group and takes the claim's currants), the claimed phase has three
 * hours (project_expired: it all resets), and the finished hall is the
 * group's (project_built with its group). The hall's own street is not in the
 * archive, so it ends there (the server's group_halls.go header).
 *
 * Other features run their own projects through `projectApi` (the same
 * panel, contributions, work units, Hire a hand, phase settling and badges):
 * homes-feature.js registers a depleted cultivation's restoration (kind
 * 'restore', job type 5) and finishes the restore in its `onDone` hook.
 */

import { ITEM_CATALOG, addItem, countItem, ensureItem, itemIcon, removeItem } from '../inventory.js?v=85d4faba';
import { canUseTool, useToolCondition } from '../tools.js?v=9a2e7ef4';
import { ecologyForStreet } from '../street-ecology.js?v=7e30da8f';
import { worldToScreen } from '../street-model.js?v=23b926e5';
import { signArmWidth } from '../street-render.js?v=1949ea5c';
import { getSkillCatalog } from '../content-catalogs.js?v=10b118dd';
import { GIANTS } from '../shrines.js?v=01b185bc';
import { teleportationFeature } from './teleportation-feature.js?v=a79a7cea';
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
  upgradeOption,
} from '../street-jobs.js?v=3c8a3e97';
import { gainMetabolic, loseEnergy } from '../metabolics.js?v=8504134e';
import { saveStore } from '../save-store.js?v=b74a8113';
import {
  HALL_TEXT,
  MP_TEXT,
  applyWorld,
  hallClock,
  isSharedJob,
  mergeHalls,
  listsFrom,
  localTime,
  markContributed,
  migrateToShared,
  phaseShare,
  remember,
  rewardParts,
  rewardPlan,
  rowFromServer,
  sharedSlice,
  topLine,
} from '../street-jobs-mp.js?v=74c659ea';
import { grantMoodXp } from '../mood-xp.js?v=958e7680';
import { createMinnAccount } from '../minn-account.js?v=81339760';
import { normalizeGroups } from '../groups.js?v=65337c22';
import { textureFromUrl } from '../textures.js?v=01a295a1';
import { itemZ } from '../item-bands.js?v=e98b10bc';

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
/** Multiplayer (G346): the shared board's session, the ids the save has applied, the option backed per upgrade. */
let mpMode = false;
let mp = null;
let mpLists = { applied: [], rewarded: [] };
let mpMigrated = false;
const mpChoice = {};
/** Is this project the server's (multiplayer, a street's build or upgrade)? */
const shared = (jobId) => mpMode && Boolean(catalog) && isSharedJob(catalog, jobId);
/**
 * HOMES3: a home restoration's id on the realtime server (projectApi.register
 * job.wire, projects.go kind "restore") and the id it has here: the owner's
 * homes-feature keeps its own (home-proto-…), a visitor registers the wire id.
 */
const wireIds = new Map();
const localIds = new Map();
const wireOf = (jobId) => wireIds.get(jobId) || jobId;
/** HOMES3: restorations that finished here (their unregister must not give the server's job up). */
const finishedHere = new Set();
const localOf = (id) => localIds.get(String(id || '')) || String(id || '');

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
      fetch('assets/content/street-jobs.json?v=jobs-6').then((r) => r.json()),
      fetch('assets/streets/index.json').then((r) => r.json()),
    ])
      .then(([cat, idx]) => {
        catalog = cat;
        streetIndex = idx;
        // Group halls are multiplayer only (G331): solo's board never sees them.
        if (mpMode) mergeHalls(catalog);
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
  // Tiny Speck's sign_stake (neither in_background nor in_foreground): a normal item, over the trees.
  spr.zIndex = itemZ(BOARD_CLASS, 1);
  spr._worldHitW = 70;
  spr._worldHitH = 110;
  engine.entityLayer.addChild(spr);
  const head = boardHeadline(engine);
  const job = head ? jobDef(catalog, head.jobId) : null;
  const target = engine.register({
    classId: BOARD_CLASS,
    featureId: STREET_JOBS_FEATURE_ID,
    label: job?.kind === 'upgrade' ? 'Street Upgrade Project' : job?.kind === 'hall' ? 'Group Hall Project' : 'Street Project',
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
  // G289: job_complete pays mood and energy through metabolics_add_mood /
  // metabolics_add_energy, refused while dead (and energy while Super Pooped),
  // capped at the tank (inc_metabolics.js 40-53, 79-86; quests/job_cw_test.js
  // 172-173 keeps the returned change as the reward). Report what landed.
  const moodLanded = mood > 0 ? gainMetabolic(pc, 'mood', mood) : 0;
  const energyLanded = energy > 0 ? gainMetabolic(pc, 'energy', energy) : 0;
  const ledger = pc.giantFavor;
  for (const f of favor) {
    if (!f?.points || !ledger) continue;
    const giants = f.giant === 'all' ? Object.keys(GIANTS) : [f.giant === 'tii' ? 'ti' : f.giant];
    for (const g of giants) ledger[g] = Math.max(0, Number(ledger[g]) || 0) + f.points;
  }
  return { ...(rewards || {}), xp: landed, mood: moodLanded, energy: energyLanded };
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
  // A shared project's phases are settled by the server (project_reward).
  if (shared(jobId)) return;
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
      // Shared (multiplayer): your share of each phase's base cost, as the source's text said it.
      const pct = shared(jobId) ? Math.round(phaseShare(state.jobs[jobId], p.classTsid, catalog.classes[p.classTsid], jobDivisor(job)) * 100) : 100;
      return `${i + 1}. ${p.label || catalog.classes[p.classTsid]?.title || 'Phase'}: ${mine ? `You contributed ${pct}% of the work!` : 'You did not contribute.'}`;
    })
    .join(' ');
  if (job.kind === 'hall') return finishHall(engine, jobId, job, contributions, solo);
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
 * A group hall (G331): players/inc_jobs.js:484's "Hooray!", your share of each
 * phase, and whose hall it is (quest.js doJobEffects 1831-1863). The source's
 * completion promises a teleport to the new location; its street is not in
 * the archive, so there is no script and no road.
 */
function finishHall(engine, jobId, job, contributions, note) {
  const group = state.jobs[jobId]?.hall?.group?.name || 'The group';
  return {
    title: job.title,
    steps: [
      { text: `Hooray! The project ${job.title} has been completed! Your contributions: ${contributions}`, response: 'View Rewards' },
      { text: `The hall is built for ${group}. ${HALL_TEXT.noStreet}`, response: 'Continue' },
      { text: note, response: 'OK' },
    ],
  };
}

/**
 * players/inc_jobs.js jobs_familiar_job_complete_do, type 5: no
 * Teleportation Script; "The <b>title</b> restoration project on your home
 * street has completed. Since you contributed, you got N imagination."
 * The owner's hook (quest.js doJobEffects type 5) puts the item back.
 */
function finishRestore(engine, jobId, job, def, out) {
  const hooks = external.get(jobId);
  finishedHere.add(jobId);
  const where = hooks?.place || 'on your home street';
  const name = phaseTitle(job, job.phases[0], def);
  const xp = Number(out?.rewards?.xp) || 0;
  const text = `The ${name} restoration project ${where} has completed.${xp ? ` Since you contributed, you got ${xp.toLocaleString()} imagination.` : ''}`;
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
    // Shared: each unit goes to the server, and counts (energy, wear) when it answers.
    mp: shared(jobId),
    awaiting: 0,
    req: check.req,
    cls: jobDef(catalog, jobId).phases[state.jobs[jobId]?.phase || 0]?.classTsid || '',
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
  if (work.mp) {
    mpTickWork(engine, now);
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
.sj-card{width:min(600px,94vw);background:radial-gradient(circle at 92% 0%,color-mix(in srgb, var(--c-gold-83b) 18%, transparent),transparent 36%),var(--surface-card)}
.sj-kicker{font-size:var(--fs-sm);font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--c-gold-55);margin:0}
.sj-desc{margin:var(--sp-1) 0 .55rem;padding-left:var(--sp-5);border-left:4px solid var(--c-gold-79);color:var(--c-grey-45);font-size:var(--fs-md)}
.sj-phase{display:flex;align-items:center;gap:var(--sp-4);margin:.2rem 0 .45rem;font-size:var(--fs-base);font-weight:700;color:var(--c-sand-39)}
.sj-bar{flex:1;height:8px;border-radius:var(--radius-xs);background:var(--surface-sunken);overflow:hidden}
.sj-bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--c-gold-79),var(--c-gold-87))}
.sj-reqs{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-3)}
.sj-req{display:grid;grid-template-columns:34px 1fr auto;gap:var(--sp-4);align-items:center;background:color-mix(in srgb, var(--surface-bright) 86%, transparent);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--sp-3) var(--sp-4)}
.sj-req img{width:32px;height:32px;object-fit:contain}
.sj-req b{display:block;font-size:var(--fs-md);color:var(--c-sand-33)}
.sj-req small{display:block;font-size:var(--fs-sm);color:var(--c-sand-56)}
.sj-req.is-done{opacity:.6}
.sj-req.is-locked{opacity:.55;background:color-mix(in srgb, var(--surface-parchment) 80%, transparent)}
.sj-req .sj-acts{display:flex;gap:.3rem;flex-wrap:wrap;justify-content:flex-end}
.sj-req button,.sj-options button,.sj-hall button{font:inherit;font-size:var(--fs-sm);font-weight:700;border-radius:var(--radius-md);border:1px solid var(--c-gold-78);background:var(--surface-bright);color:var(--c-umber-45);padding:.3rem .55rem;cursor:pointer;white-space:nowrap}
.sj-req button.primary,.sj-hall button.primary{background:var(--c-gold-79);border-color:var(--c-gold-70);color:var(--c-umber-30)}
.sj-req button[disabled],.sj-hall button[disabled]{opacity:.45;cursor:not-allowed}
.sj-options{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin:var(--sp-1) 0 .55rem}
.sj-options button{text-align:left;white-space:normal;padding:.45rem .55rem;line-height:var(--lh-snug)}
.sj-options button.is-chosen{background:var(--c-cream-96c);border-color:var(--c-gold-79);box-shadow:0 0 0 2px color-mix(in srgb, var(--c-gold-79) 35%, transparent)}
.sj-options button span{display:block;font-weight:400;color:var(--c-sand-51b);font-size:var(--fs-xs);margin-top:var(--sp-1)}
.sj-status{margin:var(--sp-4) 0 0;font-size:var(--fs-sm);color:var(--c-sand-51b)}
.sj-others{margin:.55rem 0 0;padding:.45rem 0 0;border-top:1px dashed var(--c-sand-86);font-size:var(--fs-sm);color:var(--c-sand-51b)}
.sj-others ul{margin:.2rem 0 0;padding-left:var(--sp-9)}
.sj-map-card{margin:0 0 var(--sp-4);background:var(--c-cream-99b);border:1px solid var(--c-gold-84b);border-radius:var(--radius-md);padding:.45rem var(--sp-5);font-size:var(--fs-sm);color:var(--c-umber-41)}
.sj-map-card header{display:flex;gap:var(--sp-4);align-items:center}
.sj-map-card img{width:24px;height:38px;object-fit:contain}
.sj-map-card strong{display:block;font-size:var(--fs-md);color:var(--c-umber-33)}
.sj-map-card span{display:block}
.sj-hall{margin:var(--sp-1) 0 var(--sp-4);padding:.45rem var(--sp-5);border-radius:var(--radius-md);background:color-mix(in srgb, var(--surface-bright) 86%, transparent);border:1px solid var(--border);font-size:var(--fs-md);color:var(--c-sand-39)}
.sj-hall p{margin:var(--sp-1) 0}
.sj-hall .sj-hall-row{display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:center;margin-top:var(--sp-3)}
.sj-hall select{font:inherit;font-size:var(--fs-md);padding:.2rem .3rem;border-radius:var(--radius-sm);border:1px solid var(--c-sand-83);max-width:100%}
.sj-others button{font:inherit;font-size:var(--fs-sm);background:none;border:0;color:var(--c-blue-51);cursor:pointer;padding:0;text-decoration:underline}
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
    <div class="sj-hall" data-sj-hall hidden></div>
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
  if (jobDef(catalog, jobId)?.kind === 'hall' && mpMode && !hallGroups.loading) {
    hallGroups.list = null;
    loadHallGroups(engine);
  }
  if (panelJobId !== jobId) hallConfirm = '';
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
  const kind = external.get(jobId)?.kindLabel || { upgrade: 'Street Upgrade', restore: 'Restoration Project', hall: HALL_TEXT.kicker }[job.kind] || 'Street Project';
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
    const chosen = (shared(jobId) && mpChoice[jobId]) || row.option || up.options[0]?.id;
    for (const o of up.options) {
      const b = el('button', { type: 'button', class: o.id === chosen ? 'is-chosen' : '', dataset: { sjOption: o.id } });
      b.append(document.createTextNode(`${o.id === chosen ? '★ ' : ''}${o.name}`), el('span', {}, o.desc));
      b.disabled = status.status === 'done';
      b.addEventListener('click', () => {
        // Shared: the option you back rides on each contribution (the server counts the votes).
        if (shared(jobId)) {
          mpChoice[jobId] = o.id;
          renderPanel(engine);
          return;
        }
        chooseOption(state, catalog, jobId, o.id);
        engine.save();
        renderPanel(engine);
      });
      optBox.append(b);
    }
  }

  // A group hall: who has it, or the claim (G331).
  const hallBox = q('[data-sj-hall]');
  const hall = job.kind === 'hall' ? row.hall || null : null;
  const unclaimed = job.kind === 'hall' && !hall?.claimed && status.status !== 'done';
  hallBox.hidden = job.kind !== 'hall';
  if (job.kind === 'hall') renderHall(engine, hallBox, jobId, job, hall, status);

  const reqs = status.status === 'done' || status.status === 'built'
    ? phaseRequirements(state, catalog, jobId, job.phases.length - 1)
    : phaseRequirements(state, catalog, jobId);
  const need = reqs.reduce((s, r) => s + r.need, 0) || 1;
  const got = reqs.reduce((s, r) => s + r.got, 0);
  q('[data-sj-phase]').textContent = `Phase ${Math.min(job.phases.length, status.phase + 1)} of ${job.phases.length}: ${phaseTitle(job, pcx.phase, def)}`;
  q('[data-sj-bar]').style.width = `${Math.round((status.status === 'done' ? 1 : got / need) * 100)}%`;

  const list = q('[data-sj-reqs]');
  list.replaceChildren();
  const open = (status.status === 'active' || status.status === 'open') && !unclaimed;
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
    if (unclaimed) meta.push(HALL_TEXT.locked);
    else if (!r.done && !r.open) meta.push('opens after the earlier steps');
    if (shared(jobId) && row.held?.[r.id]) meta.push(`${row.held[r.id]} being counted`);
    text.append(el('small', {}, meta.join(' · ')));
    const acts = el('div', { class: 'sj-acts' });
    if (open && r.open) {
      if (r.type === 'item') {
        const have = countItem(engine.inv, r.classId);
        const n = Math.min(have, r.need - r.got);
        const b = el('button', { type: 'button', class: 'primary', dataset: { sjAct: 'give' } }, n ? `Add ${n}` : 'Add');
        b.disabled = !n || Boolean(mp?.giving);
        b.addEventListener('click', () => doGive(engine, jobId, r.classId, n));
        acts.append(b);
      } else if (r.type === 'currants') {
        const n = Math.min(engine.pc.currants || 0, r.need - r.got);
        const b = el('button', { type: 'button', class: 'primary', dataset: { sjAct: 'currants' } }, n ? `Give ${n.toLocaleString()}` : 'Give');
        b.disabled = !n || Boolean(mp?.giving);
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
          if (check.canHire && !shared(jobId)) {
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
  if (shared(jobId) && (status.status === 'active' || status.status === 'open')) {
    const top = topLine(row, def, jobDivisor(job));
    statusLine.textContent = `${MP_TEXT.note}${top ? ` Top contributors: ${top}.` : ' Nobody has put anything in yet.'}${work ? ` Working: ${work.units} units so far.` : ''}`;
  }
  if (job.kind === 'hall' && status.status === 'done') statusLine.textContent = `${HALL_TEXT.owned(hall?.group?.name || 'A group')} ${HALL_TEXT.noStreet}`;
  else if (unclaimed) statusLine.textContent = MP_TEXT.note;
  if (job.kind === 'restore' && (status.status === 'active' || status.status === 'open')) {
    const reward = Math.round((def.rewards?.xp || 0) * (Number(job.rewardMultiplier) || 1));
    statusLine.textContent = `${external.get(jobId)?.note || ''} Original amounts${jobDivisor(job) === 1 ? '' : ` / ${jobDivisor(job)}`}.${reward ? ` Finishing it pays up to ${reward.toLocaleString()} iMG.` : ''}${work ? ` Working: ${work.units} units so far.` : ''}`.trim();
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

/** The claim (JobIntroUI.as: the cost, a group, "Claim this project!", the confirm) or who has it and the clock. */
function renderHall(engine, box, jobId, job, hall, status) {
  box.replaceChildren();
  const claim = hall?.claim || 0;
  const minutes = hall?.minutes || job.duration || 0;
  if (status.status === 'done') {
    box.append(el('p', {}, HALL_TEXT.owned(hall?.group?.name || 'A group')));
    return;
  }
  if (hall?.claimed) {
    box.append(el('p', {}, `${HALL_TEXT.claimedBy(hall.group?.name || 'a group')} (${hall.by?.name || 'a Glitch'}).`));
    const clock = hallClock(hall);
    if (clock) box.append(el('p', { dataset: { sjHallClock: '' } }, clock));
    return;
  }
  if (hall?.claiming) {
    box.append(el('p', {}, HALL_TEXT.claiming));
    return;
  }
  box.append(el('p', {}, `${HALL_TEXT.need} ${claim.toLocaleString()} currants.`));
  const groups = hallGroups.list;
  if (!groups) {
    loadHallGroups(engine);
    box.append(el('p', {}, 'Loading your groups...'));
    return;
  }
  if (!groups.length) {
    box.append(el('p', {}, HALL_TEXT.noGroup));
    return;
  }
  const rowEl = el('div', { class: 'sj-hall-row' });
  if (hallConfirm === jobId) {
    rowEl.append(el('span', {}, HALL_TEXT.confirm(minutes)));
    const yes = el('button', { type: 'button', class: 'primary', dataset: { sjAct: 'claim-yes' } }, HALL_TEXT.yes);
    yes.addEventListener('click', () => {
      hallConfirm = '';
      mpClaim(engine, jobId, hallGroups.chosen);
    });
    const no = el('button', { type: 'button', dataset: { sjAct: 'claim-no' } }, HALL_TEXT.no);
    no.addEventListener('click', () => {
      hallConfirm = '';
      renderPanel(engine);
    });
    rowEl.append(yes, no);
  } else {
    const pick = el('select', { 'aria-label': HALL_TEXT.pickGroup, dataset: { sjHallGroup: '' } });
    for (const g of groups) {
      const o = el('option', { value: String(g.id) }, g.name);
      if (g.id === hallGroups.chosen) o.selected = true;
      pick.append(o);
    }
    if (!groups.some((g) => g.id === hallGroups.chosen)) hallGroups.chosen = groups[0].id;
    pick.addEventListener('change', () => {
      hallGroups.chosen = Number(pick.value) || 0;
    });
    const b = el('button', { type: 'button', class: 'primary', dataset: { sjAct: 'claim' } }, HALL_TEXT.claim);
    b.disabled = (engine.pc.currants || 0) < claim || Boolean(mp?.claiming);
    b.addEventListener('click', () => {
      hallConfirm = jobId;
      renderPanel(engine);
    });
    rowEl.append(el('span', {}, HALL_TEXT.pickGroup), pick, b);
  }
  box.append(rowEl);
}

/** The groups a claim may name: the caller's own (groddle/v1/groups, Groups::answer). */
const hallGroups = { list: null, chosen: 0, loading: null };
let hallConfirm = '';
function loadHallGroups(engine) {
  if (hallGroups.loading) return hallGroups.loading;
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  hallGroups.loading = account.groups()
    .then((answer) => {
      hallGroups.list = normalizeGroups(answer).groups;
    })
    .catch(() => {
      hallGroups.list = null;
    })
    .finally(() => {
      setTimeout(() => {
        hallGroups.loading = null;
      }, hallGroups.list ? 60000 : 5000);
      renderPanel(engine);
    });
  return hallGroups.loading;
}

function doGive(engine, jobId, classId, n) {
  if (shared(jobId)) return mpGive(engine, jobId, { classId, n });
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
  if (shared(jobId)) return mpGive(engine, jobId, { currants: n });
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
  if (shared(jobId)) return false;
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
/* Multiplayer: the shared board (G346, projects.go)                    */
/* ------------------------------------------------------------------ */

const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
const BLOCKED_SAVES = new Set(['conflict', 'signed-out', 'error', 'offline']);
/** A give the server has not answered is let go after this (its answer still applies when it comes). */
const GIVE_WAIT_MS = 20000;
const WORK_WAIT_MS = 6000;

/** Writes the save now and waits for it to land (as trade-feature persist): true once saved. */
async function persist(engine) {
  engine.save?.();
  if (typeof saveStore?.flush !== 'function') return true;
  for (let i = 0; i < 6; i += 1) {
    let st;
    try {
      st = await saveStore.flush();
    } catch {
      return false;
    }
    const now = saveStore.state || st;
    if (now === 'saved') return true;
    if (BLOCKED_SAVES.has(now)) return false;
  }
  return saveStore.state === 'saved';
}

function ensureMp(engine) {
  if (mp || !mpMode || !catalog || typeof document === 'undefined') return mp;
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  mergeHalls(catalog);
  if (!mpMigrated) {
    mpMigrated = true;
    // The server's rows replace any this character kept on its own (a project it finished keeps its road).
    if (migrateToShared(state, catalog)) engine.save?.();
  }
  mp = createMp(engine, client);
  globalThis.groddleProjects = mp;
  return mp;
}

function createMp(engine, client) {
  let offset = 0;
  let synced = null;
  const s = { client, giving: null, applying: new Set(), lastError: '', get offset() { return offset; } };
  const clock = (msg) => {
    if (Number(msg?.now) > 0) offset = Number(msg.now) - Date.now();
  };
  const refresh = () => {
    drawPlate(engine);
    renderPanel(engine);
    publish(engine);
  };
  s.sync = () => {
    synced = client.street || '';
    client.send('project_sync', {});
  };
  client.on('hello', () => s.sync());
  client.on('roster', ({ street } = {}) => {
    if ((street || '') !== synced) s.sync();
  });
  if (client.state === 'online') s.sync();

  client.on('msg:project_world', (msg) => {
    clock(msg);
    applyWorld(state, catalog, msg, offset);
    drawBarricades(engine);
    refresh();
  });
  client.on('msg:project_built', (msg) => {
    clock(msg);
    const jobId = String(msg.job || '');
    applyWorld(state, catalog, { built: { [jobId]: { at: msg.at, option: msg.option } }, rest: msg.rest }, offset);
    const job = jobDef(catalog, jobId);
    if (work?.jobId === jobId) stopWork(engine, '');
    // locations/inc_jobs.js jobs_modify_connections: the road opens for everyone.
    if (job?.kind === 'street' && job.connecting.includes(engine.streetTsid)) engine.toast(`The road to ${job.label} is open!`, 3200);
    if (job?.kind === 'hall' && msg.hall?.group?.name) {
      const row = state.jobs[jobId];
      if (row) row.hall = { ...(row.hall || {}), claimed: true, owned: true, group: { id: n0(msg.hall.group.id), name: String(msg.hall.group.name).slice(0, 40) } };
      if (job.connecting.includes(engine.streetTsid)) engine.toast(HALL_TEXT.built(String(msg.hall.group.name).slice(0, 40)), 3200);
    }
    drawBarricades(engine);
    refresh();
  });
  client.on('msg:project_street', (msg) => {
    clock(msg);
    for (const [wire, row] of Object.entries(msg.jobs || {})) {
      const jobId = localOf(wire);
      if (isSharedJob(catalog, jobId)) state.jobs[jobId] = rowFromServer(row, offset);
    }
    refresh();
  });
  client.on('msg:project_state', (msg) => {
    clock(msg);
    const jobId = localOf(msg.job);
    if (!isSharedJob(catalog, jobId)) return;
    // HOMES3: a home restoration its owner gave up (home_projects.go homeDrop): everything put in is lost.
    if (msg.gone === true) {
      delete state.jobs[jobId];
      if (work?.jobId === jobId) stopWork(engine, '');
      refresh();
      return;
    }
    state.jobs[jobId] = rowFromServer(msg.row, offset);
    if (work?.mp && work.jobId === jobId && !work.awaiting) {
      const req = phaseRequirements(state, catalog, jobId).find((r) => r.id === work.rid);
      if (!req || !req.open) stopWork(engine, '');
    }
    refresh();
  });
  client.on('msg:project_given', (msg) => applyGiven(msg));
  client.on('msg:project_worked', (msg) => mpWorked(engine, msg));
  client.on('msg:project_reward', (msg) => applyReward(msg));
  client.on('msg:project_expired', (msg) => applyExpired(msg));
  client.on('error', ({ code, message } = {}) => {
    if (code !== 'project' || !message) return;
    s.giving = null;
    s.claiming = null;
    s.lastError = message;
    if (work?.mp) stopWork(engine, message);
    else {
      engine.toast(message, 3200);
      engine.pushActivity(message);
    }
    renderPanel(engine);
    publish(engine);
  });

  /** project_given: the ledger took it, so it leaves the pack now (once: the id is remembered and saved). */
  async function applyGiven(msg) {
    const id = String(msg.id || '');
    if (!id) return;
    if (s.giving?.job === localOf(msg.job)) s.giving = null;
    if (s.applying.has(id)) return;
    if (mpLists.applied.includes(id)) {
      if (await persist(engine)) client.send('project_ack', { id });
      return;
    }
    s.applying.add(id);
    const jobId = localOf(msg.job);
    const items = Object.entries(msg.items && typeof msg.items === 'object' ? msg.items : {});
    for (const [c, n] of items) {
      const k = Math.min(countItem(engine.inv, c), n0(n));
      if (k > 0) removeItem(engine.inv, c, k);
    }
    const cur = Math.min(n0(msg.currants), n0(engine.pc.currants));
    if (cur > 0) engine.pc.currants = n0(engine.pc.currants) - cur;
    remember(mpLists.applied, id);
    const [c, n] = items[0] || [];
    if (msg.claim === true) {
      // A group hall's claim (G331): the currants are spent, not contributed.
      s.claiming = null;
      engine.pushActivity(HALL_TEXT.paid(n0(msg.currants)));
    } else {
      const rec = markContributed(state, jobId, String(msg.cls || ''));
      if (rec.newPhase) for (const badge of contributionBadgesReached(rec.distinctPhases)) engine.grantAchievement(badge);
      engine.pushActivity(c ? `You contributed ${n0(n)} ${itemLabel(c, n0(n))}.` : `You contributed ${n0(msg.currants).toLocaleString()} currants.`);
    }
    if (c) engine.playSound('ITEM_GIVE', { volume: 0.55 });
    lastResult = `${jobId}:given:${c || 'currants'}`;
    engine.updateHud();
    refresh();
    const ok = await persist(engine);
    s.applying.delete(id);
    if (ok) client.send('project_ack', { id });
  }

  /** project_reward: the server's share for this phase (players/inc_jobs.js); its currants and items are in the ledger already. */
  async function applyReward(msg) {
    const id = String(msg.id || '');
    if (!id || s.applying.has(id)) return;
    const plan = rewardPlan(msg, mpLists);
    if (plan.skip) {
      if (await persist(engine)) client.send('project_ack', { id });
      return;
    }
    s.applying.add(id);
    const jobId = localOf(msg.job);
    const job = jobDef(catalog, jobId);
    const index = n0(msg.phase);
    const pc = job ? phaseClass(catalog, jobId, index) : null;
    if (job && pc?.def) {
      const parts = rewardParts(msg, { ledger: plan.ledger });
      const paid = payout(engine, parts.rewards);
      const paidPerformance = payout(engine, parts.performance);
      grantItems(engine, parts.performance.items);
      // quest.js 1715-1719: the top five get a job_phase_winner count.
      if (msg.top5) {
        engine.achievement(PHASE_WINNER_COUNTER, 1);
        state.phaseWins += 1;
      }
      const out = {
        index,
        phase: pc.phase,
        def: pc.def,
        // HOMES3: a shared restoration's award names the iMG it paid (finishRestore).
        rewards: paid,
        participation: n0(msg.participation),
        finalPhase: msg.final === true,
        phaseCount: job.phases.length,
        participant: n0(msg.phases) >= 4,
        option: job.kind === 'upgrade' ? upgradeOption(catalog, job.street, msg.option) : null,
        next: job.phases[index + 1],
        readyAt: localTime(msg.readyAt, offset),
      };
      mpPhaseAward(engine, jobId, out, paid, paidPerformance, `${MP_TEXT.note} ${msg.winner ? MP_TEXT.winner : MP_TEXT.notWinner}`);
    }
    remember(mpLists.rewarded, id);
    remember(mpLists.applied, id);
    const ok = await persist(engine);
    s.applying.delete(id);
    if (ok) client.send('project_ack', { id });
  }

  /** project_expired: your hall claim ran out of time (quest.js onJobTimeout 1356-1380); everything put in is lost. */
  async function applyExpired(msg) {
    const id = String(msg.id || '');
    if (!id || s.applying.has(id)) return;
    s.applying.add(id);
    const text = plainText(String(msg.text || ''));
    const jobId = String(msg.job || '');
    if (work?.jobId === jobId) stopWork(engine, '');
    engine.pushActivity(text);
    engine.award({ kind: 'quest', title: jobDef(catalog, jobId)?.title || 'Group Hall', body: '', subtitle: '', iconUrl: BOARD_ART, steps: [{ text, response: HALL_TEXT.shucks }], primaryLabel: HALL_TEXT.shucks });
    lastResult = `${jobId}:expired`;
    refresh();
    s.applying.delete(id);
    client.send('project_ack', { id });
  }

  // QA (window.groddleProjects): the board's own actions, and the row as this page sees it.
  s.open = (jobId) => openPanel(engine, jobId);
  s.give = (jobId, classId, n) => doGive(engine, jobId, classId, n);
  s.currants = (jobId, n) => doCurrants(engine, jobId, n);
  s.work = (jobId, rid, max = Infinity) => startWork(engine, jobId, rid, max);
  s.row = (jobId) => JSON.parse(JSON.stringify(state.jobs[jobId] || null));
  s.claim = (jobId, group) => mpClaim(engine, jobId, group);
  s.lists = () => ({ applied: [...mpLists.applied], rewarded: [...mpLists.rewarded] });
  s.working = () => (work ? { jobId: work.jobId, rid: work.rid, units: work.units } : null);
  s.roadOpen = (tsid) => !roadClosure(state, catalog, tsid, [tsid], opts());
  s.tick = (now) => {
    if (s.giving && now - s.giving.at > GIVE_WAIT_MS) {
      s.giving = null;
      renderPanel(engine);
    }
    if (s.claiming && now - s.claiming.at > GIVE_WAIT_MS) {
      s.claiming = null;
      renderPanel(engine);
    }
    // A hall's clock on the open panel, once a minute.
    if (panel && !panel.hidden && jobDef(catalog, panelJobId)?.kind === 'hall' && now - (s.clockAt || 0) > 30000) {
      s.clockAt = now;
      renderPanel(engine);
    }
  };
  return s;
}

/** An item or currant contribution: asked of the server, which asks the site's ledger; the pack changes on project_given. */
function mpGive(engine, jobId, what) {
  const s = ensureMp(engine);
  if (!s) return engine.toast(MP_TEXT.offline), false;
  if (s.giving) return engine.toast(MP_TEXT.counting), false;
  const money = what.currants != null;
  const reqs = phaseRequirements(state, catalog, jobId);
  const req = money ? reqs.find((r) => r.type === 'currants' && r.open) : reqs.find((r) => r.type === 'item' && r.classId === what.classId && r.open);
  if (!req) return engine.toast(money ? 'No currants are needed right now.' : 'Nothing here needs that right now.'), false;
  const have = money ? n0(engine.pc.currants) : countItem(engine.inv, what.classId);
  const n = Math.min(n0(money ? what.currants : what.n), have, req.need - req.got - n0(state.jobs[jobId]?.held?.[req.id]));
  if (n <= 0) return engine.toast(money ? 'You do not have any currants to give.' : `You have no ${String(what.classId).replace(/_/g, ' ')} to give.`), false;
  const payload = { job: wireOf(jobId), req: req.id, option: mpChoice[jobId] || '' };
  if (money) payload.currants = n;
  else payload.n = n;
  if (!s.client.send('project_give', payload)) return engine.toast(MP_TEXT.offline), false;
  s.giving = { job: jobId, req: req.id, at: Date.now() };
  renderPanel(engine);
  publish(engine);
  return true;
}

/** Claim a group hall for one of your groups (G331): the server asks the site, which takes the currants. */
function mpClaim(engine, jobId, group) {
  const s = ensureMp(engine);
  if (!s) return engine.toast(MP_TEXT.offline), false;
  if (s.claiming) return engine.toast(MP_TEXT.counting), false;
  if (!n0(group)) return engine.toast(HALL_TEXT.noGroup), false;
  if (!s.client.send('project_claim', { job: jobId, group: n0(group) })) return engine.toast(MP_TEXT.offline), false;
  s.claiming = { job: jobId, at: Date.now() };
  renderPanel(engine);
  publish(engine);
  return true;
}

/** A shared work session: one unit sent every 1.5 s; it counts (energy, wear) when the server says so. */
function mpTickWork(engine, now) {
  if (!mp) {
    stopWork(engine, MP_TEXT.offlineWork);
    return;
  }
  if (work.awaiting) {
    if (now - work.awaiting > WORK_WAIT_MS) stopWork(engine, MP_TEXT.lostWork);
    return;
  }
  if (now < work.nextAt) return;
  const check = workCheck(state, catalog, work.jobId, work.rid, workCtx(engine));
  if (!check.ok) {
    stopWork(engine, check.msg);
    return;
  }
  if (!mp.client.send('project_work', { job: wireOf(work.jobId), req: work.rid, option: mpChoice[work.jobId] || '' })) {
    stopWork(engine, MP_TEXT.offlineWork);
    return;
  }
  work.awaiting = now;
  work.nextAt = now + WORK_UNIT_MS;
}

function mpWorked(engine, msg) {
  if (!work?.mp || localOf(msg.job) !== work.jobId || msg.req !== work.rid) return;
  work.awaiting = 0;
  const req = work.req;
  // items/include/jobs.js acceptJobWork: the unit's energy and tool wear (G289 loseEnergy).
  loseEnergy(engine.pc, req.energy);
  const wear = useToolCondition(engine.toolState, work.tool, req.wear);
  work.units += 1;
  work.energy += req.energy;
  const p = engine.player;
  engine.floatText(p.x, p.y - 118, `+1 ${req.verbPast}`, 0xf2c14e);
  if (wear?.msg) engine.pushActivity(wear.msg);
  const rec = markContributed(state, work.jobId, work.cls);
  if (rec.newPhase) for (const badge of contributionBadgesReached(rec.distinctPhases)) engine.grantAchievement(badge);
  engine.updateHud();
  drawPlate(engine);
  if (n0(msg.left) <= 0 || work.units >= work.maxUnits) {
    stopWork(engine, '');
    return;
  }
  if (panel && !panel.hidden) renderPanel(engine);
}

/** The phase award for a shared project, in the solo board's words (finishPhase) with the shared note. */
function mpPhaseAward(engine, jobId, out, paid, paidPerformance, note) {
  if (work?.jobId === jobId) stopWork(engine, '');
  const job = jobDef(catalog, jobId);
  const bits = [...rewardBits(paid), ...rewardBits(paidPerformance)];
  let title = `${job.title}: phase ${out.index + 1} of ${out.phaseCount}`;
  let steps;
  if (out.finalPhase) {
    ({ title, steps } = finishJob(engine, jobId, out, note));
  } else {
    steps = [
      {
        text: `Yay! The ${phaseOrdinal(out.index)} phase, ${phaseTitle(job, out.phase, out.def)}, of the project ${job.title} has been completed! You did ${out.participation}% of the work.`,
        response: 'View Rewards',
      },
      { text: note, response: 'Continue' },
    ];
    const upcoming = out.next;
    const mins = out.readyAt ? Math.round((out.readyAt - Date.now()) / 60000) : 0;
    steps.push({
      text: mins
        ? `${upcoming?.delayText || `The ${phaseOrdinal(out.index + 1)} phase, ${upcoming?.label || 'the next phase'}, opens in ${mins} minutes.`}`
        : `The ${phaseOrdinal(out.index + 1)} phase, ${upcoming?.label || 'the next phase'}, is ready now.`,
      response: 'OK',
    });
  }
  engine.award({ kind: 'quest', title, body: '', subtitle: bits.join(' · '), iconUrl: BOARD_ART, steps, primaryLabel: 'OK' });
  lastResult = `${jobId}:phase${out.index + 1}${out.finalPhase ? ':done' : ''}`;
  engine.pushActivity({ base: `Project phase complete: ${job.title}`, effects: { xp: paid.xp + paidPerformance.xp } });
  engine.playSound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
  engine.updateHud();
  renderPanel(engine);
  drawPlate(engine);
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
  if (!jobId || autoplay.stage === 'done' || shared(jobId)) return;
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
  if (mpMode) {
    engine.setData('streetJobShared', mp ? 'on' : 'waiting');
    engine.setData('streetJobGiving', mp?.giving ? mp.giving.req : '');
    const row = head ? state.jobs[head.jobId] : null;
    const pcx = head ? phaseClass(catalog, head.jobId, row?.phase || 0) : null;
    engine.setData('streetJobTop', row && pcx?.def ? topLine(row, pcx.def, jobDivisor(jobDef(catalog, head.jobId))) : '');
    engine.setData('streetJobMine', row ? JSON.stringify(row.mine || {}) : '');
    const hall = head && jobDef(catalog, head.jobId)?.kind === 'hall' ? row?.hall : null;
    engine.setData('streetJobHall', hall ? `${hall.owned ? 'owned' : hall.claimed ? 'claimed' : hall.claiming ? 'claiming' : 'open'}:${hall.group?.name || ''}` : '');
  }
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const streetJobsFeature = {
  id: STREET_JOBS_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    mpMode = engine?.mode === 'multiplayer';
    load();
  },

  save() {
    // Multiplayer: the shared rows are the server's; the save keeps the player's own bits and the applied ids.
    if (mpMode) return catalog ? sharedSlice(state, catalog, mpLists) : { ...state, ...mpLists };
    return state;
  },

  restore(slice, engine) {
    state = normalizeStreetJobState(slice || {});
    if (engine) mpMode = engine.mode === 'multiplayer';
    mpLists = mpMode ? listsFrom(slice) : { applied: [], rewarded: [] };
    mpMigrated = false;
    if (mp && catalog) {
      mpMigrated = true;
      migrateToShared(state, catalog);
      mp.sync();
    }
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
      if (mpMode) ensureMp(engine);
      if (engine.param('jobdemo') && !demo && !mpMode) demo = resolveDemo(engine);
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
    if (mpMode) ensureMp(engine)?.tick(now);
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
   * hooks: { onDone(engine, { jobId, out, job }) -> extra text, kicker, kindLabel, place, note, target() -> target }
   */
  register(jobId, job, hooks = {}) {
    if (!catalog) return false;
    if (!job?.phases?.every((p) => catalog.classes?.[p.classTsid])) return false;
    catalog.jobs[jobId] = { street: '', label: job.label || job.title, hub: '', connecting: [], ...job };
    external.set(jobId, hooks);
    if (typeof job.wire === 'string' && job.wire) {
      wireIds.set(jobId, job.wire);
      localIds.set(job.wire, jobId);
    }
    return true;
  },
  /** Forget a project (its saved row too when `dropRow`). */
  unregister(jobId, { dropRow = false } = {}) {
    // HOMES3: the owner giving up a shared restoration before it finished (a proto removed) tells the server.
    if (dropRow && shared(jobId) && !state.jobs[jobId]?.doneAt && !finishedHere.has(jobId)) mp?.client.send('project_home_drop', { job: wireOf(jobId) });
    finishedHere.delete(jobId);
    if (catalog?.jobs?.[jobId] && external.has(jobId)) delete catalog.jobs[jobId];
    localIds.delete(wireIds.get(jobId));
    wireIds.delete(jobId);
    if (work?.jobId === jobId && engineRef) stopWork(engineRef, '');
    external.delete(jobId);
    if (dropRow) delete state.jobs[jobId];
    if (panelJobId === jobId && panel) panel.hidden = true;
  },
  registered: (jobId) => external.has(jobId),
  /** HOMES3: the local id of a restoration the realtime server names (home_restored), or null. */
  localFor: (wire) => (localIds.has(String(wire || '')) ? localIds.get(String(wire)) : external.has(String(wire || '')) ? String(wire) : null),
  /**
   * HOMES3: the realtime server says a shared restoration finished
   * (home_restored): the owner's hook puts the item back, once. True when a
   * registered project took it.
   */
  restored(engine, wire) {
    const jobId = this.localFor(wire);
    const hooks = jobId ? external.get(jobId) : null;
    if (!hooks?.onDone) return false;
    finishedHere.add(jobId);
    try {
      hooks.onDone(engine, { jobId, out: null, job: catalog?.jobs?.[jobId] || null });
    } catch (err) {
      console.warn('restored onDone', err);
    }
    return true;
  },
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
    // HOMES3: Wine of the Dead on a shared restoration: the server forgets what was put in.
    if (shared(jobId)) mp?.client.send('project_home_drop', { job: wireOf(jobId) });
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
