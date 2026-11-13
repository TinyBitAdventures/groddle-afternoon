/**
 * Street projects: the Street Spirit on a street offers the archived street's
 * collaborative projects (build a new street, upgrade this one) in the solo
 * form documented in js/street-jobs.js.
 *
 *  - Every street the source's Street Spirit offered a project from
 *    (catalog.byStreet) offers it from its spirit (talk to, and the
 *    clickable bubble over it: js/job-indicator.js). A street whose archived
 *    location has no spirit, and a group hall, get a Job Board (sign_stake)
 *    at a planner point with the same bubble.
 *  - Contribute items, currants, or timed work (1.5 s a unit, energy and tool
 *    wear per unit); hire a hand for work you cannot do.
 *  - Finishing a street project opens the road (the signpost into the new
 *    street, which shows a barricade until then) and hands you an imbued
 *    Teleportation Script there. Finishing an upgrade re-plans the street
 *    with the chosen option's shrine, animals, rocks, and flora.
 *  - A street still being built is shut to signposts, doors and teleports
 *    (travelGate), and the Map draws it as the client drew a locked street,
 *    a row of dots with a dimmed name, with no destination or teleport
 *    (streetUnderConstruction; js/map-graph.js, MapStreet.as 51-64, 125).
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

import { pluralize } from '../words.js?v=ee4e72f8';
import { ITEM_CATALOG, addItem, countItem, ensureItem, itemIcon, packStamp, removeItem } from '../inventory.js?v=f49c8998';
import { canUseTool, useToolCondition } from '../tools.js?v=48542c24';
import { ecologyForStreet } from '../street-ecology.js?v=64dcdacc';
import { worldToScreen } from '../street-model.js?v=b6cb6a4e';
import { signArmWidth } from '../street-render.js?v=9b11451f';
import { getSkillCatalog } from '../content-catalogs.js?v=10b118dd';
import { GIANTS } from '../shrines.js?v=7260fa28';
import { giantDisplayName } from '../giant-names.js?v=0e295891';
import { teleportationFeature } from './teleportation-feature.js?v=1468e2c0';
import {
  SOLO_DIVISOR,
  WORK_UNIT_MS,
  PHASE_WINNER_COUNTER,
  PARTICIPANT_COUNTER,
  TROPHY_PIECES,
  planStreetTrophies,
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
  closedRoadText,
  noteArrival,
  openRoadsWanted,
  openWayHome,
  SUBWAY_STREETS,
  wayHomeTerms,
  closedStreets,
  appliedUpgrade,
  upgradeEcologyEntry,
  upgradeFeatures,
  contributionBadgesReached,
  contributionsText,
  jobText,
  phaseName,
  plainText,
  isJobBuilt,
  jobInProgress,
  cancelJob,
  jobDivisor,
  upgradeOption,
  findWork,
  countsForBadges,
  sharePercent,
  percentCompleteText,
  jobRewardsText,
} from '../street-jobs.js?v=ba02a385';
import { PAPERS_BADGE } from '../subway.js?v=44d1a09f';
import { gainMetabolic, loseEnergy } from '../metabolics.js?v=1383e6fd';
import { closuresInTheWay, holdNote, nearestReached, placeIndex, questHold, questStoryKey, reachableStreets } from '../quest-reach.js?v=e7b68f54';
import { getQuestCatalog as questCatalog } from '../content-catalogs.js?v=10b118dd';
import { saveStore, savedThrough } from '../save-store.js?v=04420633';
import {
  HALL_TEXT,
  MP_TEXT,
  applyWorld,
  contributedKey as mpContributedKey,
  giveAfterSave,
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
  leaderboard,
} from '../street-jobs-mp.js?v=930d8534';
import { grantMoodXp } from '../mood-xp.js?v=22648ec0';
import { createMinnAccount } from '../minn-account.js?v=c15f0ecf';
import { normalizeGroups } from '../groups.js?v=c9635d96';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js?v=814d7926';
import { createJobIndicator, jobIndicatorTip, jobIndicatorView, jobPerc } from '../job-indicator.js?v=05498227';
import { LOT_ART, LOT_CLASS, LOT_PLACEMENT, LOT_SIGN_BLOCKERS, LOT_SIGN_X, LOT_TEXT, floorYAt, lotFit, lotHeadline, lotVerb } from '../group-hall-lot.js?v=23e8fbd9';
import { JOB_WORK_OVERLAY, jobWorkFloatPoint, jobWorkSoundKey, jobWorkToolScale, jobWorkToolSheet } from '../job-work-fx.js?v=e16ca80f';
import { itemZ } from '../item-bands.js?v=e98b10bc';
import { SIGN_ARMS, routeGraph } from '../map-routes.js?v=c7e7dc80';
import { TELEPORTERS } from '../hidden-floors.js?v=732a2610';
import { WINTRY_PORTAL_TELEPORTERS } from '../wintry-portal.js?v=1437deda';
import { PROJECTS_TEXT, contributedJobs, mineTotal, projectEntry, projectList } from '../projects-tracker.js?v=30bdd34d';
import { PROJECTS_PANEL_ID, buildProjectsPanel, renderProjects } from '../ui/projects-sheet.js?v=f97f2319';
import { SIDE_SHEET_IDS } from '../ui/panel-shell.js?v=06a0d3fe';
import { trophyGotText } from '../home-trophies.js?v=2020b29b';
import { FEATURED_TEXT, featuredChanged, featuredFromServer, featuredNeedsLine } from '../featured-project.js?v=4210bead';
import { renderFeaturedLine, renderFeaturedRow } from '../ui/featured-project.js?v=46bffa44';
import { GEM_HINTS, isGem } from '../gem-hints.js?v=4b65f7ac';

export const STREET_JOBS_FEATURE_ID = 'street-jobs';
const BOARD_CLASS = 'street_job_board';
const BOARD_ART = 'assets/sprites/street-jobs/sign_stake.webp';
const BARRICADE_ART = 'assets/decos/groddle/door_barricade_wood_1.png';
const FLORA_ART = Object.freeze({
  flowers: ['bling_branchflowerbrush_red_1', 'bling_branchflowerbrush_white_1', 'bling_branchflowerbrush_purple_2'],
  mushrooms: ['bling_wildmushrooms_1', 'bling_wildmushrooms_2', 'bling_mushroom_king_bolete_1'],
  bushes: ['bush_1', 'bush_2'],
});
const FLORA_COUNT = 6;
/** items/include/jobs.js acceptJobWork 369-373: work stops only when you leave the street. */
const LEFT_TEXT = 'You left the location.';
/** quest.js onJobComplete 1652-1656: these type 5 jobs count no cultivation_projects_restored. */
const NOT_A_RESTORATION = (cls) => cls === 'job_proto_door' || cls === 'job_cult_tower' || String(cls || '').startsWith('job_tower_floor_');

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
  return phaseName(job, phase, def);
}

/** The next phase's name in a phase card ("the next phase" when it has none). */
function nextPhaseName(job, next) {
  return (next && phaseTitle(job, next, catalog?.classes?.[next.classTsid])) || 'the next phase';
}

/**
 * Every way between streets, for openWayHome (ticket 50, Wintry Place): signposts and doors a
 * closure can hold (assets/content/signpost-graph.json, as the Map reads it), and the ways none
 * holds: the subway between its streets and the Collision-triggered Teleporters.
 */
let ways = null;
function loadWays() {
  ways ||= fetch('assets/content/signpost-graph.json?v=g198-1')
    .then((r) => r.json())
    .then((json) => {
      const free = {};
      const rails = {};
      const add = (a, b) => (free[a] ||= []).push(b);
      for (const a of SUBWAY_STREETS) for (const b of SUBWAY_STREETS) if (a !== b) { add(a, b); (rails[a] ||= []).push(b); }
      const g = (t) => String(t || '').replace(/^L/, 'G');
      for (const t of [...TELEPORTERS, ...WINTRY_PORTAL_TELEPORTERS]) add(g(t.from), g(t.to));
      waysReady = { graph: routeGraph(json).graph, free, rails };
      return waysReady;
    })
    .catch(() => null);
  return ways;
}
let waysReady = null;

/**
 * Quests on hold (Austin, 2026-11-03; js/quest-reach.js): the streets the roads as they stand
 * let you reach, worked out again only when the roads change (a project built here or in the
 * shared world, a street opened by arriving on it), so asking for every quest costs a lookup.
 * The starts: the starter street, where you stand and every street already open to you.
 */
let reachCache = { key: '', reach: null, shut: null, starts: [], holds: new Map() };
let placeIdx = null;
function roadsKey(engine) {
  let done = 0;
  for (const row of Object.values(state.jobs)) if (row?.doneAt) done += 1;
  return `${state.grandfathered.length}|${done}|${engine?.streetTsid || ''}|${demo?.jobId || ''}`;
}
function questReach(engine) {
  if (!catalog || !streetIndex) return null;
  if (!waysReady) {
    loadWays();
    return null;
  }
  const key = roadsKey(engine);
  if (reachCache.key !== key) {
    placeIdx ||= placeIndex(streetIndex);
    const shut = new Set(closedStreets(state, catalog, opts()));
    const starts = [streetIndex.default, engine?.streetTsid, ...state.grandfathered].filter(Boolean);
    reachCache = { key, shut, starts, reach: reachableStreets({ ...waysReady, shut, starts }), holds: new Map() };
  }
  return reachCache;
}
/**
 * Live report 212 (2026-11-12): the open world, the streets the starter street reaches by the roads
 * as they stand (never from where you stand, which may be a pocket the roads have not reached), and
 * the street of it nearest `tsid`. Teleports that pick a street from Glitch's lists (the Ancestral
 * Lands' do_baqala_boot) ask it, so they never set you down past a road still being built.
 * `skipHubs`: hubs that will not do as a landing (the kick never lands in the Savanna it sends
 * you from). Null while the roads load.
 */
let openWorldCache = { key: '', reach: null, free: null };
function openStreetNear(tsid, engine, { skipHubs = [] } = {}) {
  if (!catalog || !streetIndex?.default) return null;
  if (!waysReady) {
    loadWays();
    return null;
  }
  const papers = (engine?.unlockedAchievements || []).includes(PAPERS_BADGE);
  let done = 0;
  for (const row of Object.values(state.jobs)) if (row?.doneAt) done += 1;
  const key = `${state.grandfathered.length}|${done}|${papers ? 1 : 0}|${demo?.jobId || ''}`;
  if (openWorldCache.key !== key) {
    const terms = wayHomeTerms({ starter: streetIndex.default, free: waysReady.free, rails: waysReady.rails, papers });
    const shut = new Set(closedStreets(state, catalog, opts()));
    openWorldCache = { key, free: terms.free, reach: reachableStreets({ graph: waysReady.graph, free: terms.free, shut, starts: [streetIndex.default] }) };
  }
  const hubs = new Set((skipHubs || []).map(String));
  const skip = hubs.size ? (t) => hubs.has(String(streetIndex.streets?.[t]?.hubId ?? '')) : null;
  return nearestReached({ graph: waysReady.graph, free: openWorldCache.free, reach: openWorldCache.reach, from: tsid, skip });
}

/** Each project street's board streets (street-jobs.json connecting), G tsids. */
let boardsMap = null;
function boardsOf() {
  if (boardsMap) return boardsMap;
  boardsMap = {};
  for (const job of Object.values(catalog?.jobs || {})) {
    if (job.kind !== 'street') continue;
    (boardsMap[job.street] ||= []).push(...(job.connecting || []).map((t) => String(t).replace(/^L/, 'G')));
  }
  return boardsMap;
}
let lastRoadsCheck = 0;
let lastRoadsKey = '';
/**
 * QA &openroad=<job id>[,<job id>] or for:<quest> (every street project on the way to that
 * quest's street, the chain its On hold note starts), &openroadms=<ms> (default 8000): those
 * projects count as built once the wait is up, as when they are finished (solo) or the shared
 * world builds them (online, project_built), so a quest on hold comes back. Nothing goes to the server.
 */
let qaRoadOpened = false;
function qaOpenRoad(engine, now) {
  const want = qaRoadOpened ? '' : String(engine.param?.('openroad') || '');
  if (!want || !waysReady) return;
  qaOpenAt ||= now + Math.max(0, Number(engine.param('openroadms')) || 8000);
  if (now < qaOpenAt) return;
  qaRoadOpened = true;
  let ids = want.split(',');
  if (want.startsWith('for:')) {
    const r = questReach(engine);
    const hold = r && questHold(questCatalog()?.[want.slice(4)], r.reach, placeIdx);
    const chain = hold ? closuresInTheWay({ ...waysReady, shut: r.shut, starts: r.starts, targets: hold.streets, boards: boardsOf() }) : [];
    ids = chain.map(({ street }) => Object.keys(catalog.jobs).find((id) => catalog.jobs[id].kind === 'street' && catalog.jobs[id].street === street));
  }
  const opened = [];
  for (const jobId of ids) {
    if (!jobId || !jobDef(catalog, jobId)) continue;
    (state.jobs[jobId] ||= normalizeStreetJobState({ jobs: { [jobId]: {} } }).jobs[jobId]).doneAt = now;
    opened.push(jobId);
  }
  engine.setData?.('openRoad', opened.join(','));
  drawBarricades(engine);
  publish(engine);
}
let qaOpenAt = 0;

/** Why a quest waits for a road, with the project that opens it, or null (cached per roads). */
function questHoldFor(classTsid, engine) {
  const r = questReach(engine);
  const def = r && questCatalog()?.[classTsid];
  if (!def) return null;
  // #145: Notice the Unnoticeable's per-player cold spots join the hold (quest-reach questStoryNeeds).
  const storyKey = questStoryKey(classTsid, engine?.questState);
  const cacheKey = storyKey ? `${classTsid}|${storyKey}` : classTsid;
  if (r.holds.has(cacheKey)) return r.holds.get(cacheKey);
  let out = null;
  const hold = questHold(def, r.reach, placeIdx, engine?.questState);
  if (hold) {
    const first = closuresInTheWay({ ...waysReady, shut: r.shut, starts: r.starts, targets: hold.streets, boards: boardsOf() })[0] || null;
    const jobId = first ? Object.keys(catalog.jobs || {}).find((id) => catalog.jobs[id].kind === 'street' && catalog.jobs[id].street === first.street) || '' : '';
    const job = jobId ? catalog.jobs[jobId] : null;
    out = { ...hold, street: first?.street || '', jobId, building: job ? job.label || streetLabel(first.street) : '', board: first?.board ? streetLabel(first.board) : '' };
    out.note = holdNote(out, { building: out.building, board: out.board, giver: first?.board && jobId ? giverNoun(first.board, jobId) : '' });
  }
  r.holds.set(cacheKey, out);
  return out;
}

/** No closed road may cut this street off from the rest of the world: open the fewest that would. */
function keepWayHome(engine, mine) {
  loadWays().then((w) => {
    if (!w || mine !== generation || !catalog || demo) return;
    // The subway is a way home only for a player it will carry (report #162: no papers, turned back at Alakol's gate).
    const papers = (engine.unlockedAchievements || []).includes(PAPERS_BADGE);
    const terms = wayHomeTerms({ starter: streetIndex?.default, free: w.free, rails: w.rails, papers });
    const opened = openWayHome(state, catalog, { graph: w.graph, free: terms.free, here: engine.streetTsid, homes: terms.homes, opts: opts() });
    engine.setData('streetJobWayHomeBy', papers ? 'subway' : 'road');
    engine.setData('streetJobWayHome', opened.join(','));
    if (!opened.length) return;
    engine.save();
    drawBarricades(engine);
    publish(engine);
  });
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
// QA ?openroads=1 (street-jobs.js openRoadsWanted): every road open this session, solo only, never saved.
const openRoads = () => openRoadsWanted(engineRef?.param?.('openroads') ?? null, { multiplayer: mpMode, path: globalThis.location?.pathname || '' });
const opts = () => ({ exemptFrom: exemptFrom(), force: demo ? [demo.jobId] : [], open: openRoads() });
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

/** The street's projects, best first (offerJobs order), or the QA demo's one. */
function headRows(engine) {
  return demo
    ? [{ jobId: demo.jobId, ...jobStatus(state, catalog, demo.jobId, Date.now(), opts()) }]
    : streetJobs(state, catalog, engine.streetTsid, Date.now(), opts());
}

function boardHeadline(engine) {
  const ids = boardJobs(engine);
  if (!ids.length) return null;
  // Gap 3: what the street's spirit gives is not the board's; gap 1: nor is a hall, its lot's.
  return headRows(engine).filter((r) => !(giver && spiritOffers(r.jobId)) && !lotOffers(r.jobId))[0] || null;
}

/*
 * Gap 3 (research/street-projects-audit-2026-11-11.md): the Street Spirit gives the street's
 * projects. Glitch's projects came from the spirit on the connecting street (the job's `connecting`
 * street, catalog.byStreet): items/include/street_spirits.js 1 includes jobs.js, and its talk_to
 * (items/street_spirit.js 279-315, sort_on 53, tooltip "See what's up with this spirit") offers
 * them first (hasJobs -> offerJobs). A spirit offers job types 1, 2 and 4 (jobs.js canOffer 101-103);
 * a group hall (type 3) came from its lot marker (104-106), drawn as the lot (gap 1, below). The board
 * (sign_stake) stays only where no spirit stands in the archive (the Baqala and Ajaya Bliss streets
 * and others: their location XML lists no street_spirit).
 */
export const SPIRIT_PROJECT_VERB = Object.freeze({ id: 'talk_to', label: 'talk to', tooltip: "See what's up with this spirit" });
/** The bubble's tip above its giver's top: clear of the Enter hint (12 px up, 22 px tall) with 4 px to spare. */
const INDICATOR_LIFT = 38;
let giver = null; // { target, indicator }: the street's spirit, when it gives a project here
let boardIndicator = null;

const spiritOffers = (jobId) => {
  const kind = jobDef(catalog, jobId)?.kind;
  return kind === 'street' || kind === 'upgrade';
};

/** The street's selling spirit (game.js spawnVendorNpc; street-spirits-feature vendorSpirit). */
function streetSpirit(engine) {
  return (engine.interactables || []).find(
    (it) => /^street_spirit_/.test(String(it.classId || '')) && it.state?.vendorKey && it.sprite && !it.sprite.destroyed
  ) || null;
}

/** The spirit's headline: its best project not built (offerJobs: given, then open). */
function giverHeadline(engine) {
  if (!giver) return null;
  return headRows(engine).filter((r) => spiritOffers(r.jobId))[0] || null;
}

/** hasJobs (jobs.js 91-96): a project open or under way, not resting between phases or after a build. */
function giverHasJobs(engine) {
  const head = giverHeadline(engine);
  return Boolean(head && (head.status === 'active' || head.status === 'open'));
}

/** Who gives this job on this street: the spirit, else the board. */
function giverFor(jobId) {
  if (lot && lotOffers(jobId)) return lot;
  return giver && spiritOffers(jobId) ? giver : board;
}

/** Does this street need the Job Board: a project not built that no spirit here gives (halls, spirit-less streets)? */
function boardNeeded(tsid, spiritHere) {
  return streetJobs(state, catalog, tsid, Date.now(), opts()).some(
    (r) => r.status !== 'done' && r.status !== 'built' && !(spiritHere && spiritOffers(r.jobId)) && !lotOffers(r.jobId)
  );
}

/** Gap 3: who gives this job on a street, in words ("the Street Spirit"), or '' for the project board. */
const upperFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
function giverNoun(tsid, jobId) {
  if (!catalog || !spiritOffers(jobId)) return '';
  return Number(ecologyForStreet(String(tsid || '').replace(/^L/, 'G'))?.counts?.street_spirit) > 0 ? 'the Street Spirit' : '';
}

function openGiver(engine, from) {
  const head = from === 'board' ? boardHeadline(engine) : giverHeadline(engine);
  if (head) openPanel(engine, head.jobId);
}

/**
 * Report #231: the modern top bar's pills (stats, nameplate with the featured project's line, buttons) as
 * boxes in view px, none where they do not show (Classic draws its chrome outside the world).
 * Measured at most twice a second.
 */
let topBarAt = -Infinity;
let topBarBoxes = [];
function topBarViewBoxes(engine, now = Date.now()) {
  if (now - topBarAt < 500) return topBarBoxes;
  topBarAt = now;
  topBarBoxes = [];
  const canvas = engine.renderer?.canvas;
  if (typeof document === 'undefined' || !canvas?.getBoundingClientRect) return topBarBoxes;
  const c = canvas.getBoundingClientRect();
  if (!c.width) return topBarBoxes;
  const scale = (engine.viewWidth || c.width) / c.width;
  for (const node of document.querySelectorAll('.top-bar > .hud-pill, #street-nameplate')) {
    if (node.offsetParent === null || node.hidden) continue;
    const r = node.getBoundingClientRect();
    if (r.height > 0) topBarBoxes.push({ left: (r.left - c.left) * scale, right: (r.right - c.left) * scale, bottom: (r.bottom - c.top) * scale });
  }
  return topBarBoxes;
}

/** The first view row clear of the top bar over the view columns left..right (0 with nothing there). */
export function topClearOver(boxes, left, right) {
  let y = 0;
  for (const b of boxes || []) if (b.left < right && b.right > left) y = Math.max(y, b.bottom);
  return y;
}

function spawnGiver(engine, target) {
  const ind = createJobIndicator(engine.PIXI, { onClick: () => openGiver(engine, 'spirit'), textureFor: textureFromUrl });
  ind.root.label = 'job-indicator-spirit';
  (engine.fxLayer || engine.entityLayer).addChild(ind.root);
  giver = { target, indicator: ind };
  tickIndicators(engine);
}

/** The bubble's view for a headline (JobManager.as 100-125). */
function indicatorView(head, now) {
  if (!head) return null;
  const job = jobDef(catalog, head.jobId);
  const reqs = phaseRequirements(state, catalog, head.jobId);
  return jobIndicatorView(head, { phases: job?.phases?.length || 1, perc: jobPerc(reqs), now, featured: Boolean(featured && featured.jobId === head.jobId) });
}

/** Each frame: the bubbles' text (the countdown ticks each second), their flip, and the spirit's over its head. */
function tickIndicators(engine, now = Date.now()) {
  if (giver) {
    const spr = giver.target?.sprite;
    const root = giver.indicator.root;
    if (spr && !spr.destroyed && !root.destroyed) {
      const v = indicatorView(giverHeadline(engine), now);
      giver.indicator.update(v, now);
      // Over the spirit's head and its name (ActionIndicatorView worldDisposableSpriteChangeHandler:
      // y above the display, less the bubble's height), and over our Enter hint, which sits on
      // the same top (game.js: box.top - 12, a 22 px chip), so the two never cover each other.
      root.x = spr.x;
      const want = spr.y - Math.abs(spr._worldHitH || spr.height || 0) - INDICATOR_LIFT;
      // Report #231: down into the view, under the top bar, when the head is too near its top.
      const cam = engine.camera;
      const hit = root.hitArea;
      if (cam && hit && v) {
        const left = spr.x + hit.x - cam.x;
        const clear = topClearOver(topBarViewBoxes(engine, now), left, left + hit.width);
        root.y = jobIndicatorTip({ tip: want, height: -hit.y + 2, viewTop: cam.y + clear + 6, feet: spr.y });
      } else root.y = want;
      giver.bubble = v ? v.main.join(' ') : '';
    }
  }
  if (boardIndicator && !boardIndicator.root.destroyed) {
    const v = indicatorView(boardHeadline(engine), now);
    boardIndicator.update(v, now);
    if (board) board.bubble = v ? v.main.join(' ') : '';
  }
}

function spawnBoard(engine, point) {
  const { PIXI } = engine;
  const spr = new PIXI.Container();
  const sign = new PIXI.Sprite(textureFromUrl(BOARD_ART));
  sign.anchor.set(0.5, 1);
  spr.addChild(sign);
  // Gap 4: the board where no spirit stands carries the same bubble.
  boardIndicator = createJobIndicator(PIXI, { onClick: () => openGiver(engine, 'board'), textureFor: textureFromUrl });
  boardIndicator.root.y = -110 - INDICATOR_LIFT;
  const plate = boardIndicator.root;
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

/** Gap 4: the givers' bubbles, after a change (each frame keeps them too: tickIndicators). */
function drawPlate(engine) {
  tickIndicators(engine);
}

/*
 * Gap 1 (research/street-projects-audit-2026-11-11.md): the Group Hall lot. A hall (job type 3) is
 * offered by its group_hall_lot_marker, not the spirit or a board (items/include/jobs.js canOffer
 * 104-106): the roped plot and its sign (group_hall_lot_marker.swf, js/group-hall-lot.js), the sign
 * being what you click (its interaction_target) with the job bubble over it (jobs.js onPlayerEnter,
 * items/group_hall_lot_marker.js 63-98, sends the status as the spirit's does). A finished hall
 * hides the lot (quest.js 1838 'visible:false'). Halls are multiplayer only (G331, mergeHalls),
 * so the lot is too.
 */
let lot = null; // { jobId, plot, sign, target, indicator, bubble }

/** Does the lot give this job (a group hall)? */
const lotOffers = (jobId) => jobDef(catalog, jobId)?.kind === 'hall';

/** The hall the street's lot offers, or null when it shows none (no hall here, or all built). */
function lotHead(engine) {
  if (!mpMode || demo || !catalog) return null;
  return lotHeadline(streetJobs(state, catalog, engine.streetTsid, Date.now(), opts()), catalog);
}

function spawnLot(engine, at, head) {
  const { PIXI } = engine;
  const z = itemZ(LOT_CLASS);
  // The sign clear of the shrine, trees and the rest (lotFit): slid along its floor, or facing the other way.
  const planned = {};
  for (const key of Object.keys(LOT_SIGN_BLOCKERS)) planned[key] = engine.placement(key);
  const fit = lotFit(at, planned);
  const side = fit.side;
  const point = { x: fit.x, y: fit.x === at.x ? at.y : floorYAt(engine.platforms, fit.x, at.y) };
  // The plot: in_background (group_hall_lot_marker.js 134), behind everyone in the line along the rope.
  const plot = new PIXI.Sprite(textureFromUrl(LOT_ART.plot.url));
  plot.label = 'group-hall-lot-plot';
  plot.x = point.x + side * LOT_ART.plot.x;
  plot.y = point.y + LOT_ART.plot.y;
  plot.scale.x = side;
  plot.zIndex = z;
  // The sign (DefineSprite 3, interaction_target): its post's foot at the item's origin line.
  const sign = new PIXI.Container();
  sign.label = 'group-hall-lot-sign';
  const art = new PIXI.Sprite(textureFromUrl(LOT_ART.sign.url));
  art.x = -LOT_ART.sign.w / 2;
  art.y = -LOT_ART.sign.h;
  sign.addChild(art);
  sign.x = point.x + side * LOT_SIGN_X;
  sign.y = point.y;
  sign.zIndex = itemZ(LOT_CLASS, 0.01);
  sign._worldHitW = Math.ceil(LOT_ART.sign.w);
  sign._worldHitH = Math.ceil(LOT_ART.sign.h);
  engine.entityLayer.addChild(plot, sign);
  const target = engine.register({ classId: LOT_CLASS, featureId: STREET_JOBS_FEATURE_ID, label: LOT_TEXT.label, subtitle: LOT_TEXT.desc, sprite: sign });
  const indicator = createJobIndicator(PIXI, { onClick: () => openLot(engine), textureFor: textureFromUrl });
  indicator.root.label = 'job-indicator-lot';
  indicator.root.x = sign.x;
  indicator.root.y = sign.y - LOT_ART.sign.h - 4;
  (engine.fxLayer || engine.entityLayer).addChild(indicator.root);
  lot = { jobId: head.jobId, plot, sign, target, indicator, bubble: '', x: point.x, side };
  engine.setData('streetJobLot', head.jobId);
  engine.setData('streetJobLotX', String(Math.round(point.x)));
}

function clearLot(engine) {
  if (!lot) return;
  lot.indicator.destroy();
  if (engine?.unregister) engine.unregister(lot.target);
  else if (!lot.sign.destroyed) lot.sign.destroy({ children: true });
  if (!lot.plot.destroyed) lot.plot.destroy();
  lot = null;
  engine?.setData('streetJobLot', '');
  engine?.setData('streetJobLotX', '');
}

/** offerJobs (jobs.js 124-158): the lot's hall, given or open. */
function openLot(engine) {
  const head = lotHead(engine);
  if (head) openPanel(engine, head.jobId);
}

/** Each frame: the bubble; a hall built while you watch takes its lot away (quest.js 1838). */
function tickLot(engine, now) {
  if (!lot) return;
  const head = lotHead(engine);
  if (!head) return clearLot(engine);
  lot.jobId = head.jobId;
  const v = indicatorView(head, now);
  lot.indicator.update(v, now);
  lot.bubble = v ? v.main.join(' ') : '';
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
    const shown = (s.connects || []).filter((c) => c && (c.label || c.tsid)).slice(0, SIGN_ARMS);
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
    // stats_add_favor_points: capped at the emblem target with its prompt (pc.addGiantFavor, inc_stats.js 975-996).
    if (typeof pc.addGiantFavor === 'function') pc.addGiantFavor(f.giant === 'all' ? 'all' : giants[0], f.points);
    else for (const g of giants) ledger[g] = Math.max(0, Number(ledger[g]) || 0) + f.points;
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
    const who = f.giant === 'all' ? 'favor with every Giant' : `${giantDisplayName(f.giant)} favor`;
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

/**
 * The collection badges' trophy (planStreetTrophies): one of each piece goes, the whole trophy
 * comes, once a family.
 */
function grantFinishedTrophies(engine) {
  if (!engine?.inv) return;
  const plans = planStreetTrophies(state, engine.unlockedAchievements, (cls) => countItem(engine.inv, cls));
  for (const plan of plans) {
    state.trophiesGranted.push(plan.family);
    // Guard (report 99): one trophy a class. A save holding it, in the pack or at home, with no record of
    // giving it is only recorded: it keeps its pieces and gets no second.
    if (countItem(engine.inv, plan.trophy) + (Number(engine.query?.('homeFurnitureHeld', plan.trophy)) || 0) > 0) continue;
    for (const cls of plan.take) removeItem(engine.inv, cls, 1);
    grantItems(engine, [{ classTsid: plan.trophy, count: 1 }]);
    const name = itemLabel(plan.trophy);
    engine.pushActivity(trophyGotText(plan.take.length === 5 ? `Your five pieces became the ${name}!` : `You got the ${name}!`));
  }
  if (plans.length) {
    piecesOwned = new Set(TROPHY_PIECES.filter((cls) => countItem(engine.inv, cls) > 0));
    engine.refreshPack?.();
    engine.save?.();
  }
}

/**
 * Report 97: pieces reach the pack from a project's reward (solo, or online through the site's
 * ledger, which puts a reward settled while you were away straight into the save), a trade, a
 * gift, mail or the ground, so the pack is watched, as for the Egg Hunter's eggs: each piece counts
 * for its badge the first time it shows up (and every piece held at the first look, so a save
 * that already holds all five gets its trophy on load). Then the trophy exchange runs.
 */
let piecesOwned = null;
let piecesCheckAt = 0;
function tickTrophyPieces(engine, now) {
  if (!engine?.inv || now < piecesCheckAt) return;
  piecesCheckAt = now + 1000;
  const owned = TROPHY_PIECES.filter((cls) => countItem(engine.inv, cls) > 0);
  const fresh = piecesOwned ? owned.filter((cls) => !piecesOwned.has(cls)) : owned;
  piecesOwned = new Set(owned);
  for (const cls of fresh) engine.achievement?.(`in_inventory:${cls}`, 1);
  grantFinishedTrophies(engine);
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
  // quest.js 1671, 1715-1719: a type 5 job (restore) has no top five.
  if (countsForBadges(job)) engine.achievement(PHASE_WINNER_COUNTER, 1);
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
        ? `${next?.delayText ? `${plainText(jobText(next.delayText, { location: job.label }))} It opens in ${pluralize(mins, 'minute')}.` : `The ${phaseOrdinal(out.index + 1)} phase, ${nextPhaseName(job, next)}, opens in ${pluralize(mins, 'minute')}.`}`
        : `The ${phaseOrdinal(out.index + 1)} phase, ${nextPhaseName(job, next)}, is ready now.`,
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
  // Shared (multiplayer): your share of each phase's base cost, as the source's text said it. The
  // phase that just finished takes the server's own figure (project_reward participation): by the
  // last phase the project's row may already be gone, and ticket 190's card said "You did not
  // contribute" after the phase card had said 49%. An earlier phase also counts as yours when this
  // player's own record has it (markContributed).
  // The server's project_reward / completion names your share of every phase (shares, two decimals as
  // quest.js expandText 261 printed {job_participation}); an older message falls back to the row.
  const sharedShare = (p) => {
    const named = out.shares?.[p.classTsid];
    if (named != null) return Math.max(0, Number(named) || 0);
    if (out.phase?.classTsid === p.classTsid && Number(out.participation) > 0) return Number(out.participation);
    return sharePercent(phaseShare(state.jobs[jobId], p.classTsid, catalog.classes[p.classTsid], jobDivisor(job)));
  };
  const contributions = contributionsText(job, catalog, {
    mine: (p) =>
      shared(jobId)
        ? (out.shares ? out.shares[p.classTsid] != null : sharedShare(p) > 0 || (state.phasesContributed || []).includes(mpContributedKey(jobId, p.classTsid)))
        : Boolean(state.jobs[jobId]?.mine?.[p.classTsid]),
    share: (p) => (shared(jobId) ? sharedShare(p) : 100),
  });
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
  const cls = job.phases[0]?.classTsid;
  // quest.js 1652-1656: the player whose contribution finished a restoration (not the Door, the Tower or a
  // Tower floor) counts one cultivation_projects_restored (Cultivation Nurturer, Restorer of Stuff, Make Do
  // and Mender). Online the server names that player (finisher).
  if (!NOT_A_RESTORATION(cls) && (!shared(jobId) || out?.finisher === true)) engine.achievement(`cultivation_projects_restored:${jobId}`, 1);
  const text = `The ${name} restoration project ${where} has completed.${xp ? ` Since you contributed, you got ${xp.toLocaleString()} imagination.` : ''}`;
  // quest.js 1734: the Door's Build a New Floor sends no completion line.
  if (cls !== 'job_proto_door') engine.pushActivity(text);
  let after = '';
  try {
    after = hooks?.onDone?.(engine, { jobId, out, job }) || '';
  } catch (err) {
    console.warn('restore onDone', err);
  }
  const done = plainText(def.completion || '');
  if (cls === 'job_proto_door') return { title: name, steps: [{ text: [done, after].filter(Boolean).join(' ') || name, response: 'OK' }] };
  const steps = [{ text, response: 'View Rewards' }];
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
    itemName: (cls) => itemLabel(cls),
    skillName: (id) => skillLabel(id),
  };
}

/**
 * The tool overlay while working (items/include/jobs.js startJobWork 293-305: a pc_overlay in a
 * bubble, 40x40, the tool's tool_animation, delta_y -110), drawn in front of the street on the fx
 * layer like the Focusing Orb's meditation (meditation-feature zIndex 40). js/job-work-fx.js.
 */
function toolBubble(engine, tool, label) {
  const { PIXI } = engine;
  const root = new PIXI.Container();
  root.zIndex = 40;
  root.label = label;
  const { width: w, height: h } = JOB_WORK_OVERLAY;
  const r = Math.round(Math.max(w, h) / 2 + 9);
  const bubble = new PIXI.Graphics();
  // The client's overlay bubble: a round white balloon with a small tail toward the player.
  bubble.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.94 }).stroke({ color: 0x8c7a5b, width: 1.5, alpha: 0.7 });
  bubble.poly([-6, r - 2, 6, r - 2, 0, r + 9]).fill({ color: 0xffffff, alpha: 0.94 });
  root.addChild(bubble);
  const sheet = jobWorkToolSheet(tool);
  let art;
  if (sheet) {
    const base = sourceFromUrl(sheet.url);
    const frames = [];
    for (let i = 0; i < sheet.frames; i += 1) {
      frames.push(frameTexture(base, new PIXI.Rectangle((i % sheet.cols) * sheet.fw, Math.floor(i / sheet.cols) * sheet.fh, sheet.fw, sheet.fh)));
    }
    art = new PIXI.AnimatedSprite(frames);
    art.animationSpeed = sheet.fps / 60;
    art.loop = true;
    art.scale.set(jobWorkToolScale(sheet));
    art.play();
  } else {
    art = new PIXI.Sprite(textureFromUrl(itemIcon(tool)));
    art.width = w;
    art.height = h;
  }
  art.anchor.set(0.5);
  root.addChild(art);
  return root;
}

/** Your own tool bubble, over your avatar for the run of units. */
function workToolFx(engine, tool) {
  const root = toolBubble(engine, tool, 'job-work-tool');
  root.x = engine.player.x;
  root.y = engine.player.y + JOB_WORK_OVERLAY.deltaY;
  (engine.fxLayer || engine.entityLayer).addChild(root);
  engine.setData?.('jobWorkTool', `${tool}:${jobWorkToolSheet(tool) ? 'animation' : 'icon'}`);
  return root;
}

/*
 * The other workers' tool bubbles (gap 2, research/street-projects-audit-2026-11-11.md). Glitch sent
 * each worker's pc_overlay to everyone else on the street (items/include/jobs.js startJobWork 293-307,
 * apiSendAnnouncementX(anncx, pc)) and took it down the same way (cancelJobWork 435-438). The tool's
 * sound went to the worker alone (pc.announce_sound, jobs.js 308), so the street sees these and hears
 * nothing. The realtime server relays one start and one stop per run (projects_crew.go project_working,
 * and project_workers on arriving).
 */
/** Over the remote avatar's name plate, as the meditation bubble (meditation-feature.js 483 BUBBLE_DY). */
const CREW_BUBBLE_DY = -186;
let crewToolSet = null;

/** The tools the catalog's work asks for (workGear): the only classes a remote bubble draws. */
function crewTools() {
  if (crewToolSet || !catalog) return crewToolSet || new Set();
  crewToolSet = new Set();
  for (const cls of Object.values(catalog.classes || {})) {
    for (const r of cls.requirements || []) {
      if (r.type !== 'work') continue;
      for (const t of r.classIds?.length ? r.classIds : [r.classId]) if (t) crewToolSet.add(String(t));
    }
  }
  return crewToolSet;
}

function crewNote(engine) {
  engine.setData?.('jobCrewTools', [...(mp?.crew?.entries() || [])].map(([id, c]) => `${id}:${c.tool}`).join(','));
}

function crewSet(engine, id, tool) {
  if (!mp?.crew || !id || id === n0(mp.client.me?.id)) return;
  const was = mp.crew.get(id);
  if (was && was.tool === tool) return;
  crewDrop(id);
  if (tool && crewTools().has(tool)) mp.crew.set(id, { tool, sprite: null });
  crewNote(engine);
}

function crewDrop(id) {
  const c = mp?.crew?.get(id);
  if (!c) return;
  if (c.sprite && !c.sprite.destroyed) c.sprite.destroy({ children: true });
  mp.crew.delete(id);
}

/** Each frame: a bubble over each remote worker, made when its avatar is here, following it. */
function tickCrew(engine) {
  if (!mp?.crew?.size || !engine.PIXI) return;
  const remotes = globalThis.groddleRealtime?.remotes;
  const layer = engine.fxLayer || engine.entityLayer;
  for (const [id, c] of mp.crew) {
    const root = remotes?.get?.(id)?.root;
    const live = c.sprite && !c.sprite.destroyed && c.sprite.parent === layer;
    if (!root || root.destroyed) {
      if (live) c.sprite.destroy({ children: true });
      c.sprite = null;
      continue;
    }
    if (!live) {
      c.sprite = toolBubble(engine, c.tool, 'job-crew-tool');
      layer.addChild(c.sprite);
    }
    c.sprite.x = root.x;
    c.sprite.y = root.y + CREW_BUBBLE_DY;
  }
}

/** A work unit's float, beside the bubble and away from the board's Enter hint. */
function workFloat(engine, text) {
  const boardX = (external.get(work?.jobId)?.target?.() || giverFor(work?.jobId)?.target)?.sprite?.x;
  const at = jobWorkFloatPoint(engine.player, Number.isFinite(boardX) ? boardX : null);
  engine.floatText(at.x, at.y, text, 0xf2c14e);
}

function startWork(engine, jobId, rid, maxUnits = Infinity) {
  if (work) stopWork(engine, '');
  const check = workCheck(state, catalog, jobId, rid, workCtx(engine));
  if (!check.ok) {
    engine.toast(check.msg);
    return false;
  }
  const fx = workToolFx(engine, check.tool);
  work = {
    jobId,
    rid,
    maxUnits,
    units: 0,
    energy: 0,
    startedAt: Date.now(),
    nextAt: Date.now() + WORK_UNIT_MS,
    street: engine.streetTsid,
    toolSprite: fx,
    sound: jobWorkSoundKey(check.tool) ? engine.playSoundLoop?.(jobWorkSoundKey(check.tool), { volume: 0.5 }) || null : null,
    tool: check.tool,
    // Shared: each unit goes to the server, and counts (energy, wear) when it answers.
    mp: shared(jobId),
    awaiting: 0,
    req: check.req,
    cls: jobDef(catalog, jobId).phases[state.jobs[jobId]?.phase || 0]?.classTsid || '',
  };
  // Gap 2: the street sees your bubble for the run (projects_crew.go), one start and one stop.
  if (work.mp) mp?.client?.send?.('project_work_start', { job: wireOf(jobId), req: rid, tool: check.tool });
  engine.pushActivity(`You start to ${check.req.verb} with your ${itemLabel(check.tool)}.`);
  // Step back to the street so the work is visible; the board reopens the panel.
  closePanel();
  return true;
}

/**
 * Stop the work. `left` is what the requirement still needs after the last unit when the caller
 * knows it (the server's project_worked, applyWorkUnit's answer); else the board's copy is read.
 * Report 111: online the server answers project_worked before its row (projects.go 993 then 996),
 * so the copy had not counted the last unit yet and the bubble said "2 of the 3" for a need of 2.
 * Glitch counted the unit before it spoke (items/include/jobs.js 453).
 */
function stopWork(engine, reason, left = null, { quiet = false } = {}) {
  if (!work) return;
  const w = work;
  work = null;
  if (w.toolSprite && !w.toolSprite.destroyed) w.toolSprite.destroy({ children: true });
  if (w.mp) mp?.client?.send?.('project_work_stop');
  w.sound?.stop?.();
  const req = phaseRequirements(state, catalog, w.jobId).find((r) => r.id === w.rid);
  if (reason) engine.prompt({ kicker: 'Street Project', title: 'Work stopped', text: reason });
  const sayTo = external.get(w.jobId)?.target?.() || giverFor(w.jobId)?.target;
  const known = Number.isFinite(left);
  // quiet: items/include/jobs.js cancelJobWork 434-435 thanks only while a step for the tool is left.
  if (!quiet && (req || known) && sayTo && w.units) {
    const remaining = known ? Math.max(0, left) : Math.max(0, req.need - req.got);
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
    // items/include/jobs.js 293-305: the overlay rides the player at delta_y -110.
    work.toolSprite.x = p.x;
    work.toolSprite.y = p.y + JOB_WORK_OVERLAY.deltaY;
  }
  if (work.street && engine.streetTsid !== work.street) {
    stopWork(engine, LEFT_TEXT, null, { quiet: true });
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
  if (!retargetWork()) return;
  const res = applyWorkUnit(state, catalog, jobId, work.rid, workCtx(engine));
  if (!res.ok) {
    stopWork(engine, res.msg);
    return;
  }
  work.units += 1;
  work.energy += res.energy;
  workFloat(engine, `+1 ${res.req.verbPast}`);
  if (res.wear?.msg) engine.pushActivity(res.wear.msg);
  engine.updateHud();
  drawPlate(engine);
  if (res.newPhase) for (const badge of contributionBadgesReached(res.distinctPhases)) engine.grantAchievement(badge);
  if (res.phaseReady) {
    stopWork(engine, '', res.left);
    finishPhase(engine, jobId);
    return;
  }
  // items/include/jobs.js acceptJobWork 340-344: the run ends at its count; a step done before then
  // hands the next unit to the next open step for the same tool (find_work).
  if (work.units >= work.maxUnits || (res.left <= 0 && !findWork(state, catalog, jobId, work.tool))) {
    stopWork(engine, '', res.left);
    return;
  }
  if (panel && !panel.hidden) renderPanel(engine);
}

/**
 * items/include/jobs.js acceptJobWork 355-360 and quest.js find_work 1501-1514: each unit goes to the
 * first open step of the phase that takes the tool you work with; when none is left (someone else
 * finished it) the work stops without a word. False when it stopped.
 */
function retargetWork() {
  if (!work) return false;
  const rid = findWork(state, catalog, work.jobId, work.tool);
  if (!rid) {
    if (engineRef) stopWork(engineRef, '', null, { quiet: true });
    else work = null;
    return false;
  }
  if (rid !== work.rid) {
    work.rid = rid;
    work.req = phaseRequirements(state, catalog, work.jobId).find((r) => r.id === rid) || work.req;
  }
  return true;
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
.sj-map-card .sj-map-mine{margin-top:var(--sp-3);font:inherit;font-size:var(--fs-sm);font-weight:700;border-radius:var(--radius-md);border:1px solid var(--c-gold-78);background:var(--surface-bright);color:var(--c-umber-45);padding:.25rem .55rem;cursor:pointer}
.sj-map-card .sj-map-mine:hover,.sj-map-card .sj-map-mine:focus-visible{background:var(--c-cream-96c)}
.sj-hall{margin:var(--sp-1) 0 var(--sp-4);padding:.45rem var(--sp-5);border-radius:var(--radius-md);background:color-mix(in srgb, var(--surface-bright) 86%, transparent);border:1px solid var(--border);font-size:var(--fs-md);color:var(--c-sand-39)}
.sj-hall p{margin:var(--sp-1) 0}
.sj-hall .sj-hall-row{display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:center;margin-top:var(--sp-3)}
.sj-hall :is(select,.combo-input){font:inherit;font-size:var(--fs-md);padding:.2rem .3rem;border-radius:var(--radius-sm);border:1px solid var(--c-sand-83);max-width:100%}
.sj-hall .combo{width:calc(var(--combo-longest,12) * .6em + 2.6rem);max-width:100%}
.sj-hall .combo .combo-toggle{border:0;background:transparent;padding:0;border-radius:var(--radius-round)}
.sj-hall .combo-input{padding-right:1.9rem;background:var(--surface-bright);color:inherit;box-shadow:none}
.sj-others button{font:inherit;font-size:var(--fs-sm);background:none;border:0;color:var(--c-blue-51);cursor:pointer;padding:0;text-decoration:underline}
.sj-perc{font-size:var(--fs-sm);font-weight:400;color:var(--c-sand-51b);white-space:nowrap}
.sj-qty{display:flex;align-items:center;gap:.2rem;flex-wrap:wrap;justify-content:flex-end}
.sj-qty label{font-size:var(--fs-xs);color:var(--c-sand-56);margin-right:.15rem}
.sj-qty input{width:4.2em;font:inherit;font-size:var(--fs-sm);padding:.2rem .25rem;border-radius:var(--radius-sm);border:1px solid var(--c-sand-83);background:var(--surface-bright);color:inherit;text-align:center}
.sj-req .sj-qty button[data-sj-qty-step]{padding:.15rem .4rem;min-width:1.7em}
.sj-req small.sj-but{color:var(--c-umber-45)}
.sj-rewards{margin:var(--sp-4) 0 0;font-size:var(--fs-sm);color:var(--c-sand-39)}
.sj-rewards b{color:var(--c-sand-33)}
.sj-board{margin:var(--sp-4) 0 0;font-size:var(--fs-sm);color:var(--c-sand-39)}
.sj-board b{display:block;color:var(--c-sand-33)}
.sj-board ol{margin:.15rem 0 0;padding-left:var(--sp-9)}
.sj-board li.is-me,.sj-board p.is-me{font-weight:700;color:var(--c-umber-41)}
.sj-board p{margin:.15rem 0 0}
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
    <div class="sj-phase"><span data-sj-phase></span><div class="sj-bar"><i data-sj-bar></i></div><small class="sj-perc" data-sj-perc></small></div>
    <ul class="sj-reqs" data-sj-reqs></ul>
    <p class="sj-rewards" data-sj-rewards hidden></p>
    <div class="sj-board" data-sj-board hidden></div>
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
  // JobDetailsUI.as 131: the picker starts at 1 each time it shows.
  if (panelJobId !== jobId || panel.hidden) pickQty.clear();
  panelJobId = jobId;
  panel.hidden = false;
  renderPanel(engine);
}

/** What the "How many?" pickers hold while the panel is open: `${jobId}:${rid}` -> count. */
const pickQty = new Map();

/**
 * JobDetailsUI.as's QuantityPicker (63-75: min 1, a Max button) and its Contribute button: from 1 to
 * `max` (what you have and the step still needs, 216), starting at 1 (131). `go(n)` contributes n.
 * Nothing to give (max 0) shows the picker greyed out and Contribute off.
 */
function qtyPicker({ jobId, rid, act, max, busy, go }) {
  const key = `${jobId}:${rid}`;
  const top = Math.max(0, Math.floor(Number(max) || 0));
  const box = el('span', { class: 'sj-qty', dataset: { sjQty: act } });
  const label = el('label', {}, 'How many?');
  const input = el('input', { type: 'number', min: '1', max: String(Math.max(1, top)), inputmode: 'numeric', 'aria-label': 'How many?' });
  const minus = el('button', { type: 'button', 'aria-label': 'Fewer', dataset: { sjQtyStep: '-' } }, '−');
  const plus = el('button', { type: 'button', 'aria-label': 'More', dataset: { sjQtyStep: '+' } }, '+');
  const maxBtn = el('button', { type: 'button', dataset: { sjQtyMax: act } }, 'Max');
  const goBtn = el('button', { type: 'button', class: 'primary', dataset: { sjAct: act } }, 'Contribute');
  const set = (v) => {
    const n = top ? Math.max(1, Math.min(top, Math.floor(Number(v)) || 1)) : 1;
    pickQty.set(key, n);
    input.value = String(n);
    minus.disabled = !top || n <= 1;
    plus.disabled = !top || n >= top;
    return n;
  };
  set(pickQty.get(key) || 1);
  input.disabled = maxBtn.disabled = !top;
  goBtn.disabled = !top || busy;
  minus.addEventListener('click', () => set((pickQty.get(key) || 1) - 1));
  plus.addEventListener('click', () => set((pickQty.get(key) || 1) + 1));
  maxBtn.addEventListener('click', () => set(top));
  input.addEventListener('change', () => set(input.value));
  goBtn.addEventListener('click', () => {
    const n = set(input.value || pickQty.get(key) || 1);
    pickQty.set(key, 1);
    go(n);
  });
  box.append(label, minus, input, plus, maxBtn, goBtn);
  return box;
}

/**
 * The dialog's rewards (JobDialog.as showRewards 713-742) and Leaderboard (763-770, LeaderboardUI.as;
 * items/include/jobs.js getJobLeaderboard 524-560: the top ten, two-decimal shares, your place). A
 * restoration or the house's floor shows neither (JobDialog.as 348-357, 715), a group hall no rewards.
 */
function renderRewardsAndBoard(engine, jobId, job, def, row, status) {
  const rewardsBox = panel.querySelector('[data-sj-rewards]');
  const boardBox = panel.querySelector('[data-sj-board]');
  rewardsBox.replaceChildren();
  boardBox.replaceChildren();
  const live = status.status === 'active' || status.status === 'open';
  const words = live ? jobRewardsText(job, def, { giant: giantDisplayName, drop: (id) => catalog.drops?.[id]?.name || id }) : null;
  rewardsBox.hidden = !words?.all && !words?.top;
  if (words?.all) rewardsBox.append(el('span', {}, words.all));
  if (words?.top) rewardsBox.append(el('br'), el('span', {}, words.top));
  const divisor = jobDivisor(job);
  let board = null;
  if (live && job.kind !== 'restore') {
    if (shared(jobId)) board = leaderboard(row, def, divisor, n0(mp?.client?.me?.id));
    else {
      const mine = n0(row.mine?.[def && job.phases[row.phase || 0]?.classTsid]);
      board = leaderboard(mine ? { top: [{ id: 1, name: 'You', cost: mine }] } : {}, def, divisor, 1);
    }
  }
  boardBox.hidden = !board?.top?.length;
  if (!board?.top?.length) return;
  boardBox.append(el('b', {}, 'Leaderboard'));
  const ol = el('ol');
  for (const t of board.top) {
    const li = el('li', { class: board.me?.position === t.position ? 'is-me' : '' }, `${t.name} ${t.contributions}%`);
    ol.append(li);
  }
  boardBox.append(ol);
  if (board.me && board.me.position > board.top.length) boardBox.append(el('p', { class: 'is-me' }, `You: ${board.me.position}. ${board.me.contributions}%`));
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
  // JobDialog.as updateProgress 655-661 and quest.js 1012: by base cost, "N.N% complete".
  const perc = status.status === 'done' ? 1 : jobPerc(reqs);
  q('[data-sj-phase]').textContent = `Phase ${Math.min(job.phases.length, status.phase + 1)} of ${job.phases.length}: ${phaseTitle(job, pcx.phase, def)}`;
  q('[data-sj-bar]').style.width = `${Math.round(perc * 1000) / 10}%`;
  q('[data-sj-perc]').textContent = percentCompleteText(perc);

  const list = q('[data-sj-reqs]');
  list.replaceChildren();
  const open = (status.status === 'active' || status.status === 'open') && !unclaimed;
  const ctx = workCtx(engine);
  for (const r of reqs) {
    const li = el('li', { class: `sj-req${r.done ? ' is-done' : ''}${!r.done && !r.open ? ' is-locked' : ''}`, dataset: { sjReq: r.id } });
    const iconCls = r.type === 'currants' ? 'currant' : r.classId;
    const img = el('img', { src: r.type === 'currants' ? 'assets/sprites/street-jobs/pile_of_currants.webp' : itemIcon(iconCls), alt: '' });
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
    // G617: how gems are found, under a gem ask still open (the remake's own line; no source).
    if (r.type === 'item' && isGem(r.classId) && !r.done) text.append(el('small', { class: 'sj-hint', dataset: { sjHint: 'gems' } }, GEM_HINTS.project));
    const acts = el('div', { class: 'sj-acts' });
    // JobDetailsUI.as 63-75, 131, 216: "How many?", from 1 to what you have and the step still needs, 1 to start, Max.
    const left = Math.max(0, r.need - r.got - (shared(jobId) ? n0(row.held?.[r.id]) : 0));
    if (open && r.open) {
      if (r.type === 'item') {
        const max = Math.min(countItem(engine.inv, r.classId), left);
        acts.append(qtyPicker({ jobId, rid: r.id, act: 'give', max, busy: Boolean(mp?.giving), go: (n) => doGive(engine, jobId, r.classId, n) }));
      } else if (r.type === 'currants') {
        const max = Math.min(n0(engine.pc.currants), left);
        acts.append(qtyPicker({ jobId, rid: r.id, act: 'currants', max, busy: Boolean(mp?.giving), go: (n) => doCurrants(engine, jobId, n) }));
      } else if (r.type === 'work') {
        const busy = work && work.jobId === jobId && work.rid === r.id;
        if (busy) {
          const b = el('button', { type: 'button', dataset: { sjAct: 'stop' } }, `Stop (${work.units})`);
          b.addEventListener('click', () => stopWork(engine, ''));
          acts.append(b);
        } else {
          const check = workCheck(state, catalog, jobId, r.id, ctx);
          const picker = qtyPicker({ jobId, rid: r.id, act: 'work', max: check.ok ? left : 0, busy: false, go: (n) => startWork(engine, jobId, r.id, n) });
          picker.title = check.ok ? `${left} units, ${(WORK_UNIT_MS / 1000).toFixed(1)}s each` : check.msg;
          acts.append(picker);
          // JobDetailsUI.as 165-167: "But! <the reason>" when you can't do this work.
          if (!check.ok) text.append(el('small', { class: 'sj-but', dataset: { sjBut: r.id } }, `But! ${check.msg}`));
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

  renderRewardsAndBoard(engine, jobId, job, def, row, status);

  const statusLine = q('[data-sj-status]');
  const mins = (t) => Math.max(1, Math.ceil((t - Date.now()) / 60000));
  statusLine.textContent = {
    done: `Finished. ${{ street: `The road to ${job.label} is open.`, restore: `${job.label} is restored.` }[job.kind] || `${job.label} is upgraded.`}`,
    built: `${job.label} is already built.`,
    delayed: `${pcx.phase.delayText || 'The next phase is getting ready.'} It opens in ${pluralize(status.until ? mins(status.until) : 1, 'minute')}.`,
    cooldown: `This street just finished a project. The next one opens in ${pluralize(status.until ? mins(status.until) : 1, 'minute')}.`,
    active: `Solo amounts: 1/${SOLO_DIVISOR} of the original multiplayer totals.${work ? ` Working: ${work.units} units so far.` : ''}`,
    open: `Solo amounts: 1/${SOLO_DIVISOR} of the original multiplayer totals. Every contribution counts toward this phase.`,
  }[status.status];
  if (shared(jobId) && (status.status === 'active' || status.status === 'open')) {
    // The Leaderboard below names the contributors (items/include/jobs.js getJobLeaderboard).
    statusLine.textContent = `${MP_TEXT.note}${row.top?.length ? '' : ' Nobody has put anything in yet.'}${work ? ` Working: ${work.units} units so far.` : ''}`;
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
    box.append(el('p', {}, `${HALL_TEXT.claimedBy(hall.group?.name || 'a group')}${hall.by?.name ? ` (${hall.by.name})` : ''}.`));
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
/** A give the server has not answered is let go after this (its answer still applies when it comes). */
const GIVE_WAIT_MS = 20000;
const WORK_WAIT_MS = 6000;

/**
 * Writes the save now and waits for a write holding this change to land: true once the site has
 * accepted one (the ack of a project_given / project_reward waits on it, so the server keeps
 * sending the message until its effect is in a stored save). Not "saved": a player whose game
 * keeps changing never sees that state, and their acks never went (2026-11-11, 68 owed).
 */
async function persist(engine) {
  engine.save?.();
  return savedThrough(saveStore);
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
    // Ticket 81: with the Projects panel open, the answer brings your projects too (project_mine).
    if (pj.open) pj.asked = Date.now();
    client.send('project_sync', pj.open ? { mine: true } : {});
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
  // Ticket 81: the answer to project_sync with mine: every project of yours, anywhere (the whole list).
  client.on('msg:project_mine', (msg) => {
    clock(msg);
    mineRows.clear();
    for (const [wire, row] of Object.entries(msg.jobs || {})) {
      const jobId = localOf(wire);
      if (isSharedJob(catalog, jobId)) mineRows.set(jobId, rowFromServer(row, offset));
    }
    pj.answered = true;
    projectsChanged(engine);
  });
  client.on('msg:project_built', (msg) => {
    clock(msg);
    const jobId = String(msg.job || '');
    applyWorld(state, catalog, { built: { [jobId]: { at: msg.at, option: msg.option } }, rest: msg.rest }, offset);
    if (mineRows.has(jobId)) mineRows.get(jobId).doneAt = localTime(msg.at, offset) || 1;
    if (pj.open) askMine();
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
      if (mineRows.has(jobId) || mineTotal(state.jobs[jobId]) > 0) mineRows.set(jobId, state.jobs[jobId]);
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
      mineRows.delete(jobId);
      refresh();
      return;
    }
    state.jobs[jobId] = rowFromServer(msg.row, offset);
    // Ticket 81: the Projects panel follows the board for a project of yours.
    if (mineRows.has(jobId) || mineTotal(state.jobs[jobId]) > 0) mineRows.set(jobId, state.jobs[jobId]);
    // Someone else finished the step you work on: the next open one for your tool, else a quiet stop (retargetWork).
    if (work?.mp && work.jobId === jobId && !work.awaiting) retargetWork();
    refresh();
  });
  // G656: the world's featured street project (projects_featured.go), on every sync and when it changes or moves.
  client.on('msg:project_featured', (msg) => {
    clock(msg);
    const next = featuredFromServer(msg, offset);
    if (next) next.jobId = localOf(next.jobId);
    const first = !s.featuredSeen;
    s.featuredSeen = true;
    const changed = featuredChanged(featured, next);
    featured = next;
    // A new one while you play is said once (the first sync only shows it).
    if (changed && !first && featured) {
      engine.toast(FEATURED_TEXT.toast(featured.label), 4200);
      engine.pushActivity(FEATURED_TEXT.toast(featured.label));
    }
    drawFeatured(engine);
    drawPlate(engine);
    projectsChanged(engine);
  });
  client.on('msg:project_given', (msg) => applyGiven(msg));
  client.on('msg:project_worked', (msg) => mpWorked(engine, msg));
  client.on('msg:project_reward', (msg) => {
    applyReward(msg);
    if (pj.open) askMine();
  });
  client.on('msg:project_expired', (msg) => applyExpired(msg));
  // Gap 2: the other workers' tool bubbles (tickCrew).
  s.crew = new Map(); // id -> { tool, sprite }
  client.on('msg:project_working', (msg) => crewSet(engine, n0(msg.id), String(msg.tool || '')));
  client.on('msg:project_workers', (msg) => {
    for (const row of Array.isArray(msg.list) ? msg.list : []) crewSet(engine, n0(row?.id), String(row?.tool || ''));
  });
  client.on('roster', ({ players } = {}) => {
    const here = new Set((players || []).map((p) => n0(p?.id)));
    for (const id of [...s.crew.keys()]) if (!here.has(id)) crewDrop(id);
    crewNote(engine);
  });
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
      // quest.js 1434: a restoration (type 5) adds no job_contributions.
      const rec = countsForBadges(jobDef(catalog, jobId)) ? markContributed(state, jobId, String(msg.cls || '')) : { newPhase: false };
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
      // quest.js 1715-1719: the top five get a job_phase_winner count (1671: never for a restoration).
      if (msg.top5 && countsForBadges(job)) {
        engine.achievement(PHASE_WINNER_COUNTER, 1);
        state.phaseWins += 1;
      }
      const out = {
        index,
        phase: pc.phase,
        def: pc.def,
        // HOMES3: a shared restoration's award names the iMG it paid (finishRestore).
        rewards: paid,
        participation: Math.max(0, Number(msg.participation) || 0),
        // Your share of every phase (projects.go shares), and whether your contribution finished it (finisher).
        shares: msg.shares && typeof msg.shares === 'object' ? msg.shares : null,
        finisher: msg.finisher === true,
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
    tickCrew(engine);
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
  if (n <= 0) return engine.toast(money ? 'You do not have any currants to give.' : "You don't have any."), false;
  const payload = { job: wireOf(jobId), req: req.id, option: mpChoice[jobId] || '' };
  if (money) payload.currants = n;
  else payload.n = n;
  // #105: the save lands first, so the ledger has what was made with the window open.
  const giving = { job: jobId, req: req.id, at: Date.now() };
  s.giving = giving;
  renderPanel(engine);
  publish(engine);
  giveAfterSave({ persist: () => persist(engine), send: () => s.client.send('project_give', payload), still: () => s.giving === giving }).then((sent) => {
    if (sent || s.giving !== giving) return;
    s.giving = null;
    engine.toast(MP_TEXT.offline);
    renderPanel(engine);
    publish(engine);
  });
  return true;
}

/** Claim a group hall for one of your groups (G331): the server asks the site, which takes the currants. */
function mpClaim(engine, jobId, group) {
  const s = ensureMp(engine);
  if (!s) return engine.toast(MP_TEXT.offline), false;
  if (s.claiming) return engine.toast(MP_TEXT.counting), false;
  if (!n0(group)) return engine.toast(HALL_TEXT.noGroup), false;
  // The claim's currants come out of the ledger too (#105): the save lands first.
  const claiming = { job: jobId, at: Date.now() };
  s.claiming = claiming;
  renderPanel(engine);
  publish(engine);
  giveAfterSave({ persist: () => persist(engine), send: () => s.client.send('project_claim', { job: jobId, group: n0(group) }), still: () => s.claiming === claiming }).then((sent) => {
    if (sent || s.claiming !== claiming) return;
    s.claiming = null;
    engine.toast(MP_TEXT.offline);
    renderPanel(engine);
    publish(engine);
  });
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
  if (!retargetWork()) return;
  const check = workCheck(state, catalog, work.jobId, work.rid, { ...workCtx(engine), tick: true });
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
  // Ticket 242: the tool this unit uses (the first one may have broken and a requirement that
  // takes both variants goes on with the other), so its wear lands on that tool.
  work.unitTool = check.tool;
}

function mpWorked(engine, msg) {
  if (!work?.mp || localOf(msg.job) !== work.jobId || msg.req !== work.rid) return;
  work.awaiting = 0;
  const req = work.req;
  // items/include/jobs.js acceptJobWork: the unit's energy and tool wear (G289 loseEnergy).
  loseEnergy(engine.pc, req.energy);
  const wear = useToolCondition(engine.toolState, work.unitTool || work.tool, req.wear);
  work.units += 1;
  work.energy += req.energy;
  workFloat(engine, `+1 ${req.verbPast}`);
  if (wear?.msg) engine.pushActivity(wear.msg);
  const rec = countsForBadges(jobDef(catalog, work.jobId)) ? markContributed(state, work.jobId, work.cls) : { newPhase: false };
  if (rec.newPhase) for (const badge of contributionBadgesReached(rec.distinctPhases)) engine.grantAchievement(badge);
  engine.updateHud();
  drawPlate(engine);
  // The row may not have counted this unit yet (report 111), so a finished step is passed over by id.
  const next = n0(msg.left) <= 0 ? findWork(state, catalog, work.jobId, work.tool, work.rid) : work.rid;
  if (work.units >= work.maxUnits || !next) {
    stopWork(engine, '', n0(msg.left));
    return;
  }
  if (next !== work.rid) {
    work.rid = next;
    work.req = phaseRequirements(state, catalog, work.jobId).find((r) => r.id === next) || work.req;
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
        ? `${upcoming?.delayText ? `${plainText(jobText(upcoming.delayText, { location: job.label }))} It opens in ${pluralize(mins, 'minute')}.` : `The ${phaseOrdinal(out.index + 1)} phase, ${nextPhaseName(job, upcoming)}, opens in ${pluralize(mins, 'minute')}.`}`
        : `The ${phaseOrdinal(out.index + 1)} phase, ${nextPhaseName(job, upcoming)}, is ready now.`,
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
  // Gap 3: the spirit's project first, else the board's.
  const head = (giver ? giverHeadline(engine) : null) || (board ? boardHeadline(engine) : null);
  const giving = head ? giverFor(head.jobId) : null;
  const giverSprite = giving === giver ? giver?.target?.sprite : board?.sprite;
  engine.setData('streetJobBoard', head?.jobId || '');
  engine.setData('streetJobBoardX', giverSprite && !giverSprite.destroyed ? String(Math.round(giverSprite.x)) : '');
  engine.setData('streetJobGiver', !head ? '' : giving === giver ? 'spirit' : 'board');
  engine.setData('streetJobBubble', (giving === giver ? giver?.bubble : board?.bubble) || '');
  engine.setData('streetJobStatus', head?.status || '');
  // G656: the giver's bubble carries the featured project's star.
  engine.setData('streetJobFeatured', head && featured?.jobId === head.jobId ? '1' : '');
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
  projectsChanged(engine);
}

/* ------------------------------------------------------------------ */
/* Projects panel (ticket 81)                                           */
/* ------------------------------------------------------------------ */

/*
 * Ticket 81 (G520): the Projects panel lists every street project you have put something into
 * (js/projects-tracker.js has the data and the source notes, js/ui/projects-sheet.js the panel).
 * Solo reads the save's rows. Online asks the realtime server for your rows on every street
 * (project_sync with mine: project_mine, projects.go), keeps them in `mineRows`, and follows the
 * board messages for them; a server without it answers the sync as before, and the panel shows
 * what this page knows. Opened from the Menu (Projects), P, and the Map's "Street projects here".
 * A project that finished since you last opened the panel has a quiet dot on the Menu row and the
 * Menu button, and a New mark in the panel until it closes (state.trackerSeen); nothing else is said.
 */
const mineRows = new Map();
/** G656: the featured street project (js/featured-project.js featuredFromServer), online only; null in solo. */
let featured = null;
const pj = { panel: null, btn: null, dot: null, open: false, sessionSeen: 0, sig: '', badge: -1, asked: 0, answered: false, openNeeds: new Set(), last: '', pack: '', packAt: 0 };

/** The rows the panel reads: the save's in solo; online the server's list, then this page's live board rows. */
function trackerRows() {
  if (!mpMode) return state.jobs;
  const rows = {};
  for (const [id, row] of mineRows) rows[id] = row;
  for (const [id, row] of Object.entries(state.jobs || {})) {
    if (rows[id] || !isSharedJob(catalog, id)) continue;
    // A finished project the world told of (project_world: when, not who): partial, its share unknown.
    rows[id] = mineTotal(row) > 0 ? row : { ...row, partial: true };
  }
  return rows;
}

/** A street's name, region and map hub (assets/streets/index.json). */
const streetMeta = (tsid) => {
  const g = String(tsid || '').replace(/^L/, 'G');
  const meta = streetIndex?.streets?.[g];
  return { tsid: g, label: meta?.label || g, hubId: String(meta?.hubId || ''), hubName: meta?.hubName || '' };
};

/** What the Projects panel reads from you for its can-do marks (js/projects-tracker.js needCan). */
function projectsCtx(engine) {
  if (!engine?.inv) return null;
  const ctx = workCtx(engine);
  return { inv: ctx.inv, learned: ctx.learned || [], toolOk: ctx.toolOk, currants: engine.pc?.currants || 0, have: (cls) => countItem(engine.inv, cls) };
}

function trackerList(engine, seenAt) {
  if (!catalog) return { active: [], done: [], fresh: 0 };
  const rows = trackerRows();
  const known = {};
  // Only rows the board would read: a world-only row (doneAt, no share) still lists a job you joined.
  for (const [id, row] of Object.entries(rows)) known[id] = row?.partial && !row.doneAt ? null : row;
  const list = projectList(state, catalog, known, {
    now: Date.now(),
    opts: opts(),
    seenAt,
    closed: closedStreets(state, catalog, opts()),
    labels: { item: (cls, n) => itemLabel(cls, n), skill: skillLabel, icon: itemIcon },
    // Ticket 81: each need says whether you can do it now (the board's rules: workCheck's tool and skill, what you carry).
    ctx: projectsCtx(engine),
  });
  list.featured = featuredEntry(engine, seenAt);
  for (const e of [...list.active, ...list.done, ...(list.featured ? [list.featured] : [])]) {
    if (known[e.jobId]?.partial) e.known = false;
    const where = streetMeta(e.place);
    e.placeLabel = where.label;
    e.placeTip = e.finished ? `A guided path to ${where.label}` : `A guided path to ${giverNoun(e.place, e.jobId) || 'the project board'} on ${where.label}`;
  }
  return list;
}

/**
 * G656: the featured project's card for the Projects panel, whether or not you have put anything
 * in: the server's row from project_featured (what it still needs, anywhere), with your own share
 * from your list or this street's board.
 */
function featuredEntry(engine, seenAt) {
  if (!mpMode || !featured || !catalog || !jobDef(catalog, featured.jobId)) return null;
  const id = featured.jobId;
  const own = mineRows.get(id) || state.jobs[id] || null;
  const row = featured.row ? { ...rowFromServer(featured.row, mp?.offset || 0), mine: own?.mine || {} } : own;
  const e = projectEntry(state, catalog, id, row, {
    now: Date.now(),
    opts: opts(),
    seenAt,
    closed: closedStreets(state, catalog, opts()),
    labels: { item: (cls, n) => itemLabel(cls, n), skill: skillLabel, icon: itemIcon },
    ctx: projectsCtx(engine),
  });
  if (e) e.featured = true;
  return e;
}

/** G656: the line in the street name bubble and the Feat panel's row (js/ui/featured-project.js), multiplayer only. */
function drawFeatured(engine) {
  if (typeof document === 'undefined' || !document.getElementById) return;
  const f = mpMode ? featured : null;
  const onOpen = () => openFeatured(engine);
  // Ticket 240: the row (and the line's tip) say what is left, from the Projects panel's own entry.
  const needs = f && engine ? featuredNeedsLine(featuredEntry(engine, Number(state.trackerSeen) || 0)) : '';
  renderFeaturedLine(document, f, { onOpen, now: Date.now(), needs });
  renderFeaturedRow(document, f, { onOpen, now: Date.now(), needs });
  engine?.setData?.('featuredNeeds', needs);
  engine?.setData?.('featuredJob', f?.jobId || '');
  engine?.setData?.('featuredPercent', f ? String(f.percent) : '');
  engine?.setData?.('featuredLabel', f?.label || '');
}

/** A click on the line or the row: the Projects panel on the featured project, its way there one click on. */
function openFeatured(engine) {
  if (!featured) return;
  // The Feat panel is a side sheet too: the Projects panel takes its place.
  const feat = document.getElementById('feat-panel');
  if (feat && !feat.hidden) document.getElementById('feat-close')?.click();
  // Ticket 240: its needs open, so what is left shows without another click.
  pj.openNeeds.add(featured.jobId);
  pj.sig = '';
  if (!pj.open) openProjects(engine);
  else renderProjectsPanel(engine);
  const card = pj.panel?.querySelector(`[data-featured="1"]`);
  card?.scrollIntoView?.({ block: 'nearest' });
  card?.querySelector('[data-pj-act="route"]')?.focus?.();
  engine.setData?.('featuredOpened', featured.jobId);
}

/** How many projects of yours finished since you last looked (the Menu's dot). */
function freshCount() {
  if (!catalog) return 0;
  const seen = Number(state.trackerSeen) || 0;
  const rows = trackerRows();
  let n = 0;
  for (const id of contributedJobs(state, catalog, rows)) {
    const at = Number(rows[id]?.doneAt || state.jobs[id]?.doneAt) || 0;
    if (at > seen) n += 1;
  }
  return n;
}

function mountProjects(engine) {
  if (pj.panel || typeof document === 'undefined' || !document.getElementById) return;
  const root = document.getElementById('game-root');
  if (!root) return;
  pj.panel = buildProjectsPanel(document, root);
  pj.panel.querySelector('#projects-close')?.addEventListener('click', () => closeProjects(engine));
  engine.panelShell?.add?.({ id: PROJECTS_PANEL_ID, close: () => closeProjects(engine) });
  // Classic has no panel shell: one 2012 window at a time, as opening Quests closes the rest there.
  if (typeof MutationObserver === 'function') {
    const watch = new MutationObserver(() => {
      if (!pj.open || engine.panelShell) return;
      if (SIDE_SHEET_IDS.some((id) => id !== PROJECTS_PANEL_ID && document.getElementById(id) && !document.getElementById(id).hidden)) closeProjects(engine);
    });
    for (const id of SIDE_SHEET_IDS) {
      const node = document.getElementById(id);
      if (node) watch.observe(node, { attributes: true, attributeFilter: ['hidden'] });
    }
  }
  const menu = document.getElementById('more-list');
  if (menu && !document.getElementById('projects-btn')) {
    pj.btn = document.createElement('button');
    pj.btn.id = 'projects-btn';
    pj.btn.type = 'button';
    pj.btn.className = 'chrome-btn';
    pj.btn.title = 'Your street projects (P)';
    pj.btn.textContent = PROJECTS_TEXT.title;
    pj.dot = document.createElement('span');
    pj.dot.className = 'pj-dot';
    pj.dot.dataset.projectsNew = '';
    pj.dot.hidden = true;
    pj.dot.setAttribute('aria-hidden', 'true');
    pj.btn.append(pj.dot);
    pj.btn.addEventListener('click', () => {
      document.getElementById('more-list')?.setAttribute('hidden', '');
      document.getElementById('more-btn')?.setAttribute('aria-expanded', 'false');
      toggleProjects(engine);
    });
    menu.append(pj.btn);
  }
}

/** Online: ask the server for your projects (at most every 2 s; the answer is project_mine). */
function askMine(force = false) {
  if (!mp?.client) return false;
  const now = Date.now();
  if (!force && now - pj.asked < 2000) return false;
  pj.asked = now;
  return mp.client.send('project_sync', { mine: true });
}

function openProjects(engine) {
  if (!catalog) {
    load().then(() => catalog && openProjects(engine));
    return;
  }
  mountProjects(engine);
  if (!pj.panel) return;
  if (!engine.panelShell) engine.closeContentPanels?.();
  pj.open = true;
  // The New marks hold while the panel is open; the dot goes now.
  pj.sessionSeen = Number(state.trackerSeen) || 0;
  state.trackerSeen = Date.now();
  engine.save?.();
  pj.sig = '';
  pj.panel.hidden = false;
  if (mpMode) {
    ensureMp(engine);
    askMine(true);
  }
  renderProjectsPanel(engine);
  syncProjectsBadge(engine);
}

function closeProjects(engine) {
  if (!pj.panel || pj.panel.hidden) {
    pj.open = false;
    return false;
  }
  pj.panel.hidden = true;
  pj.open = false;
  // Anything that finished while it was open was seen.
  state.trackerSeen = Date.now();
  engine?.save?.();
  syncProjectsBadge(engine);
  engine?.setData?.('projectsOpen', '');
  return true;
}

function toggleProjects(engine) {
  if (pj.open && pj.panel && !pj.panel.hidden) closeProjects(engine);
  else openProjects(engine);
}

/** The Teleport button: the Map's Teleport Here rule, else a Teleportation Script to the street; hidden with neither. */
function projectTeleport(engine, e) {
  if (!e.place || e.place === engine.streetTsid) return null;
  const target = streetMeta(e.place);
  // The Map's Teleport Here needs Teleportation IV (js/teleportation.js canMapTeleport); without it only a script can.
  const rank4 = (engine.learnedSkills || []).some((id) => /^teleportation_[45]$/.test(id));
  const map = rank4 ? engine.query?.('mapTeleport', 'check', target, engine) || null : null;
  if (map?.ok) return { show: true, ok: true, how: 'map', label: map.energyCost ? `${PROJECTS_TEXT.teleport} · ${map.energyCost} energy` : PROJECTS_TEXT.teleport, tip: map.tooltip || '' };
  const script = engine.query?.('teleportScriptTo', 'check', e.place, engine) || null;
  if (script) return { show: true, ok: script.ok, how: 'script', label: script.energyCost ? `Read Script · ${script.energyCost} energy` : 'Read Script', reason: script.error, tip: `Your Teleportation Script to ${target.label}` };
  // No Teleportation IV and no script: no button (the Map greys its row, the panel leaves it out).
  if (!map) return null;
  return { show: true, ok: false, how: 'map', label: PROJECTS_TEXT.teleport, reason: map.error || '' };
}

function projectAction(engine, act, e) {
  const where = streetMeta(e.place);
  pj.last = `${act}:${e.jobId}:${where.tsid}`;
  engine.setData?.('projectsLast', pj.last);
  if (act === 'map') {
    closeProjects(engine);
    if (where.hubId) engine.openMap?.(where.hubId, { find: where.tsid });
    else engine.openMap?.();
    return;
  }
  if (act === 'teleport') {
    const tp = projectTeleport(engine, e);
    if (!tp?.ok) {
      if (tp?.reason) engine.toast(tp.reason, 3200);
      return;
    }
    const went = tp.how === 'script'
      ? engine.query?.('teleportScriptTo', 'go', e.place, engine)
      : engine.query?.('mapTeleport', 'go', where, engine);
    if (went) closeProjects(engine);
    return;
  }
  if (act === 'route') {
    if (where.tsid === engine.streetTsid) {
      engine.toast(e.finished ? `You are on ${where.label}.` : `${upperFirst(giverNoun(e.place, e.jobId) || 'the project board')} is here on ${where.label}.`, 2600);
      return;
    }
    const res = engine.query?.('mapRoute', 'set', { to: where.tsid, source: 'player' }, engine);
    if (res && res.ok === false) {
      // Routes never go through a closed road (js/map-routes.js findRoute): say which street is in the way.
      const through = (Array.isArray(res.through) ? res.through : []).map((t) => streetJobsFeature.streetUnderConstruction(t, engine)).find(Boolean);
      engine.toast(through ? `No open road leads to ${where.label} yet: the way runs through ${through.label}, which is still under construction. ${through.note}` : res.error || 'No path to there.', 6000);
      return;
    }
    engine.pushActivity(`Destination set: ${where.label}.`);
    engine.toast(`Destination set: ${where.label}.`, 2600);
  }
}

function renderProjectsPanel(engine) {
  if (!pj.panel || pj.panel.hidden || !catalog) return;
  const list = trackerList(engine, pj.sessionSeen);
  const tps = new Map();
  const teleport = (e) => {
    if (!tps.has(e.jobId)) tps.set(e.jobId, projectTeleport(engine, e));
    return tps.get(e.jobId);
  };
  let meta = mpMode ? PROJECTS_TEXT.online : PROJECTS_TEXT.solo;
  if (mpMode && (!mp || mp.client?.state !== 'online')) meta = PROJECTS_TEXT.offline;
  else if (mpMode && !pj.answered && list.active.some((e) => !e.known)) meta = PROJECTS_TEXT.loading;
  // Redraw only when something shown changed: a redraw would take the focus off a button.
  const sig = JSON.stringify([
    meta,
    list.featured ? `f:${list.featured.jobId}` : '',
    ...[...(list.featured ? [list.featured] : []), ...list.active, ...list.done].map((e) => [e.jobId, e.status, e.phase, Math.round(e.progress * 1000), e.known, e.isNew, e.doneAt ? agoMinute(e.doneAt) : 0, e.needs.map((n) => `${n.id}:${n.left}:${n.open}:${n.can}:${n.mark}`).join(','), e.shares.map((s) => Math.round(s.share * 100)).join(','), JSON.stringify(teleport(e)), e.place]),
  ]);
  if (sig !== pj.sig) {
    pj.sig = sig;
    renderProjects(document, list, { meta, teleport, onAction: (act, e) => projectAction(engine, act, e), openNeeds: pj.openNeeds });
  }
  engine.setData?.('projectsOpen', '1');
  engine.setData?.('projectsCount', `${list.active.length}/${list.done.length}`);
  engine.setData?.('projectsNewShown', String(list.fresh));
  engine.setData?.('projectsSource', mpMode ? (pj.answered ? 'server' : 'local') : 'solo');
}

/**
 * Ticket 81: the open panel follows your pack and skills (its can-do marks), as the board follows
 * "you have N" (inventory.js packStamp). Checked once a second; the panel redraws only when what it
 * shows changed (renderProjectsPanel's signature).
 */
function tickProjectsPack(engine, now) {
  if (!pj.open || now - (pj.packAt || 0) < 1000) return;
  pj.packAt = now;
  const stamp = `${packStamp(engine.inv, { currants: engine.pc?.currants }, engine.toolState)}|${(engine.learnedSkills || []).length}`;
  if (stamp === pj.pack) return;
  pj.pack = stamp;
  renderProjectsPanel(engine);
}

/** Minutes since a time, for the redraw check ("5 min ago" moves on). */
const agoMinute = (t) => Math.floor((Date.now() - t) / 60000);

function syncProjectsBadge(engine) {
  const n = pj.open ? 0 : freshCount();
  if (n === pj.badge) return;
  pj.badge = n;
  if (pj.dot) pj.dot.hidden = n === 0;
  if (pj.btn) pj.btn.setAttribute('aria-label', n ? `${PROJECTS_TEXT.title}, ${n} finished since you last looked` : PROJECTS_TEXT.title);
  engine?.setData?.('projectsNew', String(n));
}

/** After any change to the board's state: the badge, and the open panel when it shows something new. */
function projectsChanged(engine) {
  if (!engine || !catalog) return;
  syncProjectsBadge(engine);
  if (pj.open) renderProjectsPanel(engine);
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

export const streetJobsFeature = {
  id: STREET_JOBS_FEATURE_ID,

  /** The work bubble sits over the player: no Enter hint over it while the work runs (game.js quietEnterHint). */
  quietEnterHint() {
    return work ? true : null;
  },

  init(engine) {
    engineRef = engine;
    mpMode = engine?.mode === 'multiplayer';
    if (state.trackerSeen == null) state.trackerSeen = Date.now();
    mountProjects(engine);
    load().then(() => projectsChanged(engine));
    // G656: the Feat panel draws its own box when it opens; the featured row goes back under it.
    const feat = mpMode && typeof document !== 'undefined' ? document.getElementById?.('feat-panel') : null;
    if (feat && typeof MutationObserver === 'function') {
      new MutationObserver(() => {
        if (!feat.hidden) drawFeatured(engine);
      }).observe(feat, { attributes: true, attributeFilter: ['hidden'] });
    }
  },

  save() {
    // Multiplayer: the shared rows are the server's; the save keeps the player's own bits and the applied ids.
    if (mpMode) return catalog ? sharedSlice(state, catalog, mpLists) : { ...state, ...mpLists };
    return state;
  },

  restore(slice, engine) {
    state = normalizeStreetJobState(slice || {});
    // Ticket 81: a save from before the Projects panel counts what finished before as seen.
    if (state.trackerSeen == null) state.trackerSeen = Date.now();
    mineRows.clear();
    // A save loaded: its pieces are looked at afresh (tickTrophyPieces).
    piecesOwned = null;
    pj.answered = false;
    pj.badge = -1;
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
    if (!engineRef?.param('jobdemo') && boardNeeded(tsid, Boolean(population?.vendor))) {
      out.push({ key: 'street-job-board', count: 1, clearance: 110 });
    }
    // Gap 1: the hall's lot wants a floor run as wide as its rope (the archive kept no x/y).
    if (mpMode && lotHeadline(streetJobs(state, catalog, tsid, Date.now(), opts()), catalog)) out.push({ ...LOT_PLACEMENT });
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
      // Ticket 50: a street you stand on opens its roads, so none of them can cut you off from here,
      // and if closed roads further on still stand between here and the rest of the world, the
      // fewest of them open too (keepWayHome).
      if (!demo && noteArrival(state, catalog, engine.streetTsid, opts())) engine.save();
      if (!demo && !engine.param('jobdemo')) keepWayHome(engine, mine);
      if (mpMode) ensureMp(engine);
      if (engine.param('jobdemo') && !demo && !mpMode) demo = resolveDemo(engine);
      const tsid = engine.streetTsid;
      // Gap 3: the street's spirit gives its projects (a QA demo's too, when one stands here).
      const spiritHere = streetSpirit(engine);
      if (spiritHere && (demo ? spiritOffers(demo.jobId) : streetJobs(state, catalog, tsid, Date.now(), opts()).some((r) => spiritOffers(r.jobId) && r.status !== 'built' && r.status !== 'done'))) {
        spawnGiver(engine, spiritHere);
      }
      if (demo && !giver) {
        const p = engine.player;
        const x = p.x + 110;
        spawnBoard(engine, { x, y: floorYAt(engine.platforms, x, p.y) });
      } else if (!demo && boardNeeded(tsid, Boolean(spiritHere))) {
        const point = engine.placement('street-job-board')[0] || { x: engine.player.x + 220, y: engine.player.y };
        spawnBoard(engine, point);
      }
      const hall = lotHead(engine);
      if (hall) spawnLot(engine, engine.placement(LOT_PLACEMENT.key)[0] || { x: engine.player.x + 360, y: engine.player.y }, hall);
      drawBarricades(engine);
      drawFlora(engine);
      grantFinishedTrophies(engine);
      if (demo && engine.param('jobautoplay')) autoplay.timer = Date.now() + 1500;
      publish(engine);
    });
  },

  onStreetClear(engine) {
    generation += 1;
    if (work) stopWork(engine, LEFT_TEXT, null, { quiet: true });
    if (panel) panel.hidden = true;
    if (board?.sprite && !board.sprite.destroyed) board.sprite.destroy({ children: true });
    board = null;
    boardIndicator = null;
    // Gap 3: the spirit is the street's (game.js clears it); only its bubble is ours.
    giver?.indicator.destroy();
    giver = null;
    clearLot(engine);
    // Gap 2: the bubbles go with the street; who works stays until the roster says otherwise (tickCrew redraws).
    for (const c of mp?.crew?.values() || []) {
      if (c.sprite && !c.sprite.destroyed) c.sprite.destroy({ children: true });
      c.sprite = null;
    }
    clearBarricades();
    clearFlora();
  },

  /** game.js refreshPackPanels: the pack, currants or energy changed, so the open panel's "you have", Add and Work follow it. */
  packChanged(engine) {
    if (panel && !panel.hidden) renderPanel(engine);
  },

  onTick(dtMs, now, engine) {
    if (!catalog) return;
    if (mpMode) ensureMp(engine)?.tick(now);
    // A road opened (a project built, here or in the shared world): held quests come back now.
    if (now - lastRoadsCheck > 1000) {
      lastRoadsCheck = now;
      const key = roadsKey(engine);
      if (lastRoadsKey && key !== lastRoadsKey && questReach(engine)) engine.updateHud?.();
      lastRoadsKey = key;
    }
    qaOpenRoad(engine, now);
    tickTrophyPieces(engine, now);
    const px = engine.player?.x;
    for (const b of barricades) {
      if (b.barricadeTag && !b.destroyed) b.barricadeTag.visible = Number.isFinite(px) && Math.abs(px - b.x) < 160;
    }
    tickWork(engine, now);
    tickProjectsPack(engine, now);
    tickReload(engine);
    autoplayStep(engine, now);
    // Gap 4: the bubbles each frame (the countdown and the flip); the QA data every 5 s.
    tickIndicators(engine, Date.now());
    tickLot(engine, Date.now());
    const giving = board || giver;
    if (giving && now - (giving.platedAt || 0) > 5000) {
      giving.platedAt = now;
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

  /**
   * A street still being built cannot be reached (ticket 37 follow-up): its signpost arms and doors
   * (locations/inc_jobs.js jobs_modify_connections 578-603) and teleports there
   * (players/inc_teleportation.js 219-223) are refused, each saying which project board builds it
   * (js/street-jobs.js closedRoadText). Other ways in (quests, instances) are not roads and pass.
   */
  travelGate(tsid, engine, meta = {}) {
    const via = meta?.via;
    if (!catalog || !['signpost', 'door', 'teleport'].includes(via)) return null;
    const closed = roadClosure(state, catalog, tsid, via === 'signpost' ? signpostTsids(engine.street) : [tsid], opts());
    if (!closed) return null;
    return { ok: false, msg: closedRoadText(state, catalog, closed, { here: engine.streetTsid, via, label: streetLabel, giver: (t) => giverNoun(t, closed.jobId), opts: opts() }) };
  },

  /**
   * The Map's street menu (game.js openMapStreetMenu): a street still being built is no destination
   * and no teleport target (location.js 2915-2935 not_a_destination; InteractionMenuController.as
   * 151-153, 206-208). Returns the note the greyed entries show, or null when its road is open.
   */
  /**
   * Austin 2026-11-03 (js/quest-reach.js): a quest whose requirement needs a street no open road
   * reaches yet: { place, note, building, board } (quest-offers.js holds its offer, game.js shows
   * an accepted one On hold), or null. Derived from the roads every time; nothing is stored.
   */
  questHold(classTsid, engine) {
    return questHoldFor(classTsid, engine);
  },

  /**
   * #145: every street the roads as they stand let this player reach (a Set of G tsids, the
   * reach questHold uses), or null while the ways are still loading. Notice the Unnoticeable
   * picks its cold spots from these.
   */
  streetsReachable(engine) {
    return questReach(engine)?.reach || null;
  },

  /** Report 212: the open-world street nearest `tsid` (itself when open), or null while the roads load. */
  openStreetNear(tsid, engine, options) {
    return openStreetNear(tsid, engine, options);
  },

  streetUnderConstruction(tsid, engine) {
    if (!catalog || !tsid) return null;
    const closed = roadClosure(state, catalog, tsid, [tsid], opts());
    if (!closed) return null;
    const text = (via) => closedRoadText(state, catalog, closed, { here: engine?.streetTsid, via, label: streetLabel, giver: (t) => giverNoun(t, closed.jobId), opts: opts() });
    return { tsid: closed.job.street, label: closed.job.label || streetLabel(closed.job.street), note: text('map'), road: text('signpost') };
  },

  /**
   * Gap 3: the spirit's talk to while it has a project (street_spirit.js talk_to 279-315: its
   * tooltip, and offerJobs first). Its place in the menu stays after Browse goods (and reminisce),
   * as the source's sort_on 53 follows buy/sell 52 and reminisce 51.
   */
  decorateVerbs(target, verbs, engine) {
    if (!giver || target !== giver.target || !giverHasJobs(engine) || !Array.isArray(verbs)) return null;
    const at = verbs.findIndex((v) => v?.id === SPIRIT_PROJECT_VERB.id);
    if (at < 0) return null;
    const out = verbs.slice();
    out[at] = { ...out[at], tooltip: SPIRIT_PROJECT_VERB.tooltip, enabled: true };
    return out;
  },

  /** street-spirits-feature runVerbOverride: talk to on a spirit with a project opens it (offerJobs). */
  spiritOfferJobs(target, engine) {
    if (!giver || target !== giver.target || !giverHasJobs(engine)) return null;
    openGiver(engine, 'spirit');
    return true;
  },

  /** street-spirits-feature tickOffer: a spirit with a project offers no conversation (street_spirit.js 547). */
  spiritHasJobs(target, engine) {
    if (!giver || target !== giver.target) return null;
    return giverHasJobs(engine) || null;
  },

  verbsFor(target, engine) {
    // Gap 1: the lot's talk_to (group_hall_lot_marker.js 39-61).
    if (target.classId === LOT_CLASS) return catalog ? [lotVerb(lotHead(engine))] : [];
    if (target.classId !== BOARD_CLASS || !catalog) return [];
    const head = boardHeadline(engine);
    return [{ id: 'view', label: 'view project', enabled: Boolean(head), tooltip: head ? jobDef(catalog, head.jobId).title : '', durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target.classId === LOT_CLASS) {
      openLot(engine);
      return true;
    }
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
    // Ticket 81: every project of yours, from here.
    const mine = el('button', { type: 'button', class: 'sj-map-mine', dataset: { sjMine: '' } }, 'Your projects (P)');
    mine.addEventListener('click', () => {
      engine.closeMap?.();
      openProjects(engine);
    });
    card.append(mine);
    return [card];
  },

  /**
   * Ticket 81: the Projects panel ('open' | 'close' | 'toggle' | 'isOpen'), for game.js's P key,
   * Escape and the panel closers.
   */
  projectsPanel(action, engine) {
    if (action === 'open') return openProjects(engine), true;
    if (action === 'toggle') return toggleProjects(engine), true;
    if (action === 'close') return closeProjects(engine);
    if (action === 'isOpen') return Boolean(pj.open && pj.panel && !pj.panel.hidden);
    return null;
  },

  /** QA / tests. */
  _state() {
    return { state, catalog, board: Boolean(board), giver: Boolean(giver), lot: lot ? { jobId: lot.jobId, x: Math.round(lot.x), side: lot.side, signX: Math.round(lot.sign.x) } : null, bubble: { spirit: giver?.bubble || '', board: board?.bubble || '', lot: lot?.bubble || '', at: giver?.indicator.root.getGlobalPosition?.() || null }, work, demo, barricades: barricades.length };
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
  /** quest.js get_status 1012: how far along by base cost, as the bubble and the dialog's bar read it. */
  percent(jobId) {
    if (!catalog?.jobs?.[jobId]) return 0;
    return jobPerc(phaseRequirements(state, catalog, jobId));
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
