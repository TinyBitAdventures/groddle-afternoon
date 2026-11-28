/**
 * Solo Feats as a feature module (register G143; rules in js/solo-feats.js).
 *
 * Ten of the fifteen production Feats (inc_data_feats_prod.js) run as
 * personal goals: nine new ones plus the Last Feat chain's own Feat. Each
 * one completed gives one Small Petrified Rock (main.js 7692 doBreakIt
 * reward item), which the artifacts feature cracks.
 *
 * Where the increments come from:
 *  - pc.feats_increment(id, amount) call sites the remake owns elsewhere call
 *    engine.featsIncrement(id, amount, { cap }) (game.js engine), which asks
 *    this feature's featsIncrement hook: the Last Feat chain (game.js
 *    handleFeatResult), Sparkly shrine donations (game.js
 *    performShrineDonation), crab hugs / flattery / pinches / insults /
 *    tunes (crabs-feature), hi signs that land (hi-signs-feature), Heli
 *    Kitty pets (heli-kitties-feature), Cubimal races of 5 planks or more
 *    (cubimal-race-feature).
 *  - Game events the remake already emits (onEvent, EVENT_RULES): animal
 *    verbs, tree care, harvests, meditation minutes, Emotional Bear actions,
 *    Cubimals set free; since G173 also Salmon pockets (resource-nodes.js
 *    npc_salmon:pocket), Fertilidust and the fecundity powders (powders
 *    feature notifyVerb), and the Spinning Wheel's Cubimal boxes (game.js
 *    updateSpinningWheel drop_table_spinning_wheel_<item>); since G178 the
 *    Pocket Salmon's Release (resource-nodes-feature salmon:release) and
 *    Fertilidust only when living trees take it (fertilidust:trees_grown).
 *  - Piggy and Batterfly feeds count 3 per animal (npc_piggy.js 734-739,
 *    npc_batterfly.js 830-840): the feed event's detail names the animal
 *    (game.js world verbs, animal-husbandry-feature), and solo-feats.js
 *    featEventIncrements keeps the count in state.caps.
 *  - Counts this feature watches (onTick): completed quests
 *    (questState.completed) and qurazy quoins (quoinState.qurazyFound).
 *  - Streaking (location.js 1041-1055) and "… And Ask Nothing in Return"
 *    (feats_get_for_commit on leaving the location) run on street enter /
 *    clear here.
 *
 * UI: a "Your Feats" list inside the Feat panel (H, or Menu > Feat), under
 * the Last Feat chain. A finished Feat shows Done and when it opens again:
 * one game week (8 game days, 32 real hours) after it was finished, for
 * another Small rock (G171, Austin 2026-10-25; solo-feats.js WEEKLY FEATS).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&featdemo=<feat id>
 *     sets that Feat one short of its goal (&featprogress=<n> for another
 *     value; pet_only also takes &featpending=<n>). One real action then
 *     completes it, e.g. &featdemo=animal_love&animaldemo=piggy&animalreset=1
 *     and E > Pet. &featautoplay=1 sends one increment through the
 *     featsIncrement hook 1.5 s in (for screenshots). &featopen=1 opens the
 *     Feat panel. &featreset=1 clears solo Feat progress.
 *     G173 verbs: &featdemo=animal_love&resdemo=npc_salmon&resautoplay=1
 *     (pocket a Salmon; 1 in 10 is a boot and does not count);
 *     &featdemo=streaking&featprogress=0&stootdemo=1&wheelautoplay=1&wheelroll=0.995
 *     (a Cubimal Series 1 Box, +5; 0.985 gives Series 2);
 *     &featdemo=pet_only&featprogress=0&powderdemo=1&powderautoplay=fertilidust
 *     (+3 waiting, on a street with trees; fertilidust_lite gives +1), and
 *     &featdemo=pet_only&featpending=5&powderdemo=1&powderautoplay=powder_of_mild_fecundity
 *     (the pile is lost).
 *     G178: &featdemo=animal_love&featprogress=0&animaldemo=piggy&animalreset=1&featfeedautoplay=4
 *     feeds the nearest Piggy a Cherry 4 times, 2.5 s apart (only 3 count);
 *     &animaldemo=batterfly&featfeedautoplay=4&featfeedanimal=batterfly does the
 *     same to the Batterfly.
 *     Release: see resource-nodes-feature (&resrelease=1).
 *     G171 weekly Feats: &featdemo=<id>&featweekago=1 marks that Feat finished
 *     one game week (and a minute) ago, so it opens again as the game loads
 *     (back to 0, with &featprogress=<n> applied after); &featdoneago=<game
 *     days> marks it finished that long ago and still Done (e.g. 2 shows
 *     "Opens again in 5 game days"). &featruns=<n> sets how many times it
 *     was finished before (default 1).
 *
 * Multiplayer (G345, engine.mode 'multiplayer' with a realtime client): the
 * personal goals give way to the one shared Feat the realtime server runs
 * for everyone (feats.go; the rules, goals, schedule and pace in
 * js/feats-mp.js). The same increments are reported to the server
 * (feat_add), today's Feat only; the panel shows "Today's Feat" with the
 * shared bar, its three goals, your amount and place and the top
 * contributors. The first contribution's badges come as feat_first and the
 * day's rewards as feat_reward (its currants are in the ledger already;
 * the rest, the rocks and the top_26 / Cigar badges are applied here once,
 * the ids remembered in this slice's `applied` / `rewarded`). Solo never
 * reaches any of it.
 *
 * Canvas: soloFeats (id:value/goal,...), soloFeatLast, soloFeatRocks,
 *   soloFeatCompleted, soloFeatPending, soloFeatStreak, soloFeatDemo,
 *   soloFeatWired, soloFeatUnwired, soloFeatRuns (id:runs for every Feat
 *   finished at least once), soloFeatReopens (id:ms until it opens again).
 *   Multiplayer: mpFeat (feat:total/goal:mine:place), mpFeatLast (the last
 *   server message), mpFeatRewards (ids applied), mpFeatOwed (reports the
 *   server has not answered yet, G968), mpFeatQurazyOwed (of them, Qurazys,
 *   G754), mpFeatQuestOwed (quests left to count, G896); window.groddleFeats (QA).
 *
 * Owed reports (G968, root R10): every count reported to the server goes
 * through one queue (js/feat-owed.js) kept in this slice as `owed`: held until
 * the server answers it, asked again after a failed send, a dropped socket or
 * a pace refusal, under an id the server remembers so nothing counts twice.
 * A per-animal cap is spent when the server accepts. The Qurazy and quest
 * owed lists (qurazyOwed, questOwed) of older saves are read into it once.
 */

import { addItem } from '../inventory.js?v=3be7988a';
import { GAME_DAY_MS, getGameDayKey } from '../game-day.js?v=57fecfcb';
import {
  CAP_OWNERS,
  COMPLETE_BUTTON,
  COMPLETE_TITLE,
  FEAT_BY_ID,
  GAME_WEEK_MS,
  LOST_COMMIT_TEXT,
  REWARD_ITEM,
  REWARD_LABEL,
  SOLO_FEATS_ID,
  UNWIRED_FEATS,
  WIRED_FEATS,
  addPending,
  completionText,
  createSoloFeatState,
  eventIncrements,
  featEventIncrements,
  featRows,
  featSummary,
  incrementFeat,
  isFeatComplete,
  normalizeSoloFeatState,
  reopenDueFeats,
  reopenText,
  reopensAt,
  resetPending,
  streakCheck,
  takePending,
} from '../solo-feats.js?v=2224a7a6';
import { saveStore, savedThrough } from '../save-store.js?v=1ccb1d6b';
import {
  capHeld,
  createOwed,
  nextReport,
  oweReport,
  owedAnswer,
  owedCount,
  owedOffline,
  owedReconnected,
  owedRestore,
  owedSave,
  owedSent,
  placeOwed,
  runKey,
} from '../feat-owed.js?v=ac100a70';
import { gainMetabolic } from '../metabolics.js?v=48f784bf';
import { grantMoodXp } from '../mood-xp.js?v=e311b45c';
import { GIANTS } from '../shrines.js?v=b063e857';
import {
  MP_DONATIONS,
  MP_TEXT,
  donationOp,
  endedLine,
  endsText,
  goalLine,
  goalStatus,
  appliedFrom,
  remember,
  reportFor,
  rewardBits,
  rewardParts,
  runAt,
  runFromServer,
  vogFor,
  youLine,
} from '../feats-mp.js?v=e1fc8239';

const POLL_MS = 500;
/** How often an open panel redraws its "Opens again in" lines. */
const COUNTDOWN_MS = 30_000;
/**
 * The Feat Completed card's rock: a 498 px render of Tiny Speck's vector SWF (assets/sprites/moment,
 * tools/icon-hires/hires.py --moment), not the 60 px pack icon the card stretched (lane momentart).
 */
const ROCK_ICON = 'assets/sprites/moment/petrified_rock_small.webp';
/** Archived street TSIDs (assets/streets/index.json): homes, neighbours and instances use other ids. */
const REAL_STREET = /^G[A-Z0-9]{12,14}$/;
/** G754: the Ramble's Qurazys (feats.go add, act quoin with the street it was found on). */
const QURAZY_FEAT = 'qurazy_quoin_collecting';
/** The most Qurazys an older save's qurazyOwed held. */
const QURAZY_OWED_MAX = 50;
const OWED_STREET = /^[A-Za-z0-9_-]{1,32}$/;
/** G896 (#428): Questing and Contesting's quests. */
const QUEST_FEAT = 'reminscequests';
const QUEST_RUN = /^reminscequests:\d{1,12}$/;

let state = createSoloFeatState();
let last = '';
let pollAt = 0;
let streetTsid = '';
let entry = null;
let demo = null;
let demoDone = false;
let autoplayAt = 0;
let panelObserver = null;
let feedAutoplay = null;
let countdownAt = 0;
/** Multiplayer (G345): the shared Feat's session, the ids applied, the run whose caps are in state. */
let mpMode = false;
let mp = null;
let mpLists = { applied: [], rewarded: [], run: '' };
/** Multiplayer (G968): every counted report the server has not answered yet (saved as owed; js/feat-owed.js). */
let owed = createOwed();
/** The owed queue changed: saved at the next poll (a save per pet would serialize the whole game each time). */
let owedDirty = false;
/** An older save's questOwed run (G896: measured against the server's count of yours), read once that count is known. */
let legacyQuest = null;
/** The completed quests last seen (G896): ids and finish times, so a repeat taken again cannot hide a finish. */
let questSeen = null;

function nekkid(engine) {
  return typeof engine.hasBuff === 'function' && engine.hasBuff('nekkid') === true;
}

function playerPoint(engine) {
  const p = engine.player;
  return p ? { x: Number(p.x) || 0, y: Number(p.y) || 0 } : null;
}

function realStreet(engine, tsid) {
  return REAL_STREET.test(String(tsid || '')) && !(typeof engine.inScene === 'function' && engine.inScene());
}

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('soloFeats', featSummary(state));
  engine.setData('soloFeatLast', last || 'none');
  engine.setData('soloFeatRocks', state.rocks);
  engine.setData('soloFeatCompleted', WIRED_FEATS.filter((f) => isFeatComplete(state, f.id)).map((f) => f.id).join(',') || 'none');
  engine.setData('soloFeatPending', state.pending);
  engine.setData('soloFeatStreak', entry ? `${Math.round(entry.x)},${Math.round(entry.y)}` : 'none');
  engine.setData('soloFeatDemo', demo ? demo.featId : 'none');
  engine.setData('soloFeatWired', WIRED_FEATS.length);
  engine.setData('soloFeatUnwired', UNWIRED_FEATS.map((f) => f.id).join(','));
  const now = Date.now();
  engine.setData('soloFeatRuns', WIRED_FEATS.filter((f) => state.progress[f.id]?.runs).map((f) => `${f.id}:${state.progress[f.id].runs}`).join(',') || 'none');
  if (mpMode) {
    const run = mp?.run;
    engine.setData('mpFeat', run ? `${run.feat}:${run.total}/${run.goal}:${run.mine}:${run.place}` : 'none');
    engine.setData('mpFeatRewards', mpLists.rewarded.join(',') || 'none');
    engine.setData('mpFeatSent', mp?.sent || 0);
    engine.setData('mpFeatOwed', owed.list.length);
    engine.setData('mpFeatQurazyOwed', owedCount(owed, QURAZY_FEAT).reports);
    engine.setData('mpFeatQuestOwed', owedCount(owed, QUEST_FEAT).amount);
  }
  engine.setData('soloFeatReopens', WIRED_FEATS.filter((f) => reopensAt(state, f.id)).map((f) => `${f.id}:${Math.max(0, reopensAt(state, f.id) - now)}`).join(',') || 'none');
}

/** G171: open again every finished Feat whose game week is up, and say so. */
function reopenDue(engine, now = Date.now()) {
  if (mpMode) return [];
  const ids = reopenDueFeats(state, now);
  if (!ids.length) return ids;
  for (const id of ids) {
    const line = `The Feat "${FEAT_BY_ID[id].title}" is open again, for another ${REWARD_LABEL}.`;
    engine.pushActivity?.(line);
    engine.toast?.(line, 4200);
  }
  last = `reopened:${ids.join('+')}`;
  render();
  engine.save?.();
  publish(engine);
  return ids;
}

// —— Increments ———————————————————————————————————————————————————————————

/** Announce one incrementFeat result: badges, vog_text, the rock. */
function settle(engine, res) {
  if (!res.counted) return 0;
  const f = FEAT_BY_ID[res.featId];
  last = `${res.featId}:+${res.amount}:${res.value}/${res.goal}${res.completed ? ':complete' : ''}`;
  if (res.vogText) {
    engine.pushActivity?.(res.vogText);
    // The Last Feat chain already toasts its own first contribution (game.js handleFeatResult).
    if (!res.completed && !f.contributionCountedElsewhere) engine.toast?.(res.vogText, 5200);
  }
  if (res.completed) {
    // main.js 7714: the reward item, delivered with the completion conversation.
    addItem(engine.inv, REWARD_ITEM, 1);
    engine.refreshPack?.();
    engine.playSound?.('PETRIFIED_ROCK', { volume: 0.6 });
    const body = completionText(f.title);
    engine.pushActivity?.(`${body} 1 ${REWARD_LABEL}.`);
    // G171: it opens again a game week later.
    engine.pushActivity?.(`"${f.title}" opens again in a game week, for another ${REWARD_LABEL}.`);
    engine.award?.({
      kind: 'feat',
      title: COMPLETE_TITLE,
      body,
      subtitle: `+1 ${REWARD_LABEL}`,
      iconUrl: ROCK_ICON,
      primaryLabel: COMPLETE_BUTTON,
    });
  }
  // Badges after the Feat's own screen, so the award queue shows it first.
  for (const { counter, amount } of res.counters) engine.achievement?.(counter, amount);
  for (const id of res.grants) engine.grantAchievement?.(id);
  render();
  engine.save?.();
  publish(engine);
  return res.amount;
}

function increment(engine, featId, amount, opts = {}) {
  // Multiplayer: today's shared Feat, counted by the server (feats.go).
  if (mpMode) return mpReport(engine, featId, amount, opts);
  const now = Date.now();
  reopenDue(engine, now);
  return settle(engine, incrementFeat(state, featId, amount, opts, now));
}

function onFeatEvent(engine, counter, amount, detail) {
  // Before the caps are read: a reopened Feat frees its own.
  reopenDue(engine);
  // Multiplayer (G968): a capped row's cap (three feeds an animal) is spent when the server accepts the report, not here.
  const rows = mpMode ? eventIncrements(counter, amount, detail) : featEventIncrements(state, counter, amount, detail);
  for (const row of rows) {
    if (row.mode === 'direct') {
      // The Lucky Streak's one event rule is the Spinning Wheel's Cubimal box (feats-mp.js MP_ACTS wheel).
      const opts = row.featId === 'streaking' ? { act: 'wheel' } : {};
      increment(engine, row.featId, row.amount, row.cap ? { ...opts, cap: row.cap } : opts);
    } else if (row.mode === 'commit') {
      // Multiplayer: kindnesses wait for leaving the street only while "… And Ask Nothing in Return" is today's Feat.
      if (mpMode && mp?.run?.feat !== 'pet_only') continue;
      // The pile is the game's own (feats.to_commit), so its cap is spent as it grows (the pile is owed once committed).
      if (mpMode && row.cap?.key) {
        if ((state.caps[row.cap.key] || 0) + capHeld(owed, row.cap.key) >= row.cap.max) continue;
        state.caps[row.cap.key] = (state.caps[row.cap.key] || 0) + 1;
      }
      if (addPending(state, row.amount, Date.now())) {
        last = `pending:+${row.amount}:${state.pending}`;
        render();
        publish(engine);
      }
    } else if (row.mode === 'reset' && state.pending > 0) {
      resetPending(state);
      last = 'pending:lost';
      engine.pushActivity?.(LOST_COMMIT_TEXT);
      engine.toast?.(LOST_COMMIT_TEXT, 4200);
      render();
      publish(engine);
    }
  }
}

/** questState.completed and quoinState.qurazyFound only grow; count the growth. */
function poll(engine) {
  const t = Date.now();
  reopenDue(engine, t);
  if (t >= countdownAt) {
    countdownAt = t + COUNTDOWN_MS;
    const panel = typeof document !== 'undefined' ? document.getElementById('feat-panel') : null;
    if (panel && !panel.hidden) render();
  }
  const d = questsFinished(engine.questState);
  // Multiplayer (G896, G968): owed until the server counts them.
  if (d > 0) increment(engine, QUEST_FEAT, d);
  const qurazy = Number(engine.quoinState?.qurazyFound);
  if (Number.isFinite(qurazy)) {
    if (state.qurazyBase == null || qurazy < state.qurazyBase) state.qurazyBase = qurazy;
    else if (qurazy > state.qurazyBase) {
      const d = qurazy - state.qurazyBase;
      state.qurazyBase = qurazy;
      if (mpMode) {
        // Multiplayer (G754, G968): one report each, for the street it was found on (the server counts a street once).
        const street = String(streetTsid || engine.streetTsid || '');
        if (OWED_STREET.test(street)) for (let i = 0; i < d; i += 1) increment(engine, QURAZY_FEAT, 1, { act: 'quoin', street });
      } else increment(engine, QURAZY_FEAT, d, { act: 'quoin', street: engine.streetTsid });
    }
  }
  if (mpMode && owed.list.length) flushOwed(engine, t);
  if (owedDirty) {
    owedDirty = false;
    engine.save?.();
  }
}

function questSnapshot(qs) {
  const doneAt = {};
  for (const [id, at] of Object.entries(qs.doneAt || {})) doneAt[id] = Number(at) || 0;
  return { ref: qs, ids: new Set(qs.completed), doneAt };
}

/**
 * Quests finished since the last look (G896): one newly in questState.completed, or one whose
 * finish time moved on (completeQuest's doneAt), so a repeat finished and taken again within one
 * poll (quest-offers.js acceptOffer drops it from completed) still counts. The first look after a
 * load counts the growth since the saved questBase, as before.
 */
function questsFinished(qs) {
  if (!Array.isArray(qs?.completed)) return 0;
  const n = qs.completed.length;
  let d = 0;
  if (questSeen?.ref === qs) {
    const counted = new Set();
    for (const id of qs.completed) {
      if (questSeen.ids.has(id) || counted.has(id)) continue;
      counted.add(id);
      d += 1;
    }
    for (const [id, at] of Object.entries(qs.doneAt || {})) {
      if (!counted.has(id) && (Number(at) || 0) > (questSeen.doneAt[id] || 0)) d += 1;
    }
  } else if (state.questBase != null && n > state.questBase) {
    d = n - state.questBase;
  }
  questSeen = questSnapshot(qs);
  state.questBase = n;
  return d;
}

// —— Panel ———————————————————————————————————————————————————————————————

const STYLE = `
.solo-feats { margin-top: var(--sp-6); padding-top: var(--sp-5); border-top: 1px solid color-mix(in srgb, var(--c-umber-37) 18%, transparent); }
.solo-feats-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-4); }
.solo-feats-head h4 { margin: 0; font-size: var(--fs-base); }
.solo-feats-head small { opacity: 0.75; font-size: var(--fs-xs); }
.solo-feats-copy { margin: var(--sp-2) 0 var(--sp-4); font-size: var(--fs-xs); opacity: 0.8; }
.solo-feats-list { display: grid; gap: var(--sp-3); }
.solo-feat { display: grid; grid-template-columns: 1fr auto; gap: var(--sp-1) var(--sp-4); padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-bright) 55%, transparent); }
.solo-feat b { font-size: var(--fs-sm); }
.solo-feat span { font-size: var(--fs-xs); opacity: 0.78; grid-column: 1 / -1; }
.solo-feat em { font-style: normal; font-size: var(--fs-xs); font-variant-numeric: tabular-nums; white-space: nowrap; }
.solo-feat i { grid-column: 1 / -1; height: 5px; border-radius: var(--radius-xs); background: color-mix(in srgb, var(--c-umber-37) 14%, transparent); overflow: hidden; }
.solo-feat i::after { content: ''; display: block; height: 100%; width: var(--p, 0%); background: var(--status-warn); }
.solo-feat.done { background: color-mix(in srgb, var(--c-lime-92) 75%, transparent); }
.solo-feat.done i::after { background: var(--c-lime-68); }
.solo-feat small { grid-column: 1 / -1; font-size: var(--fs-2xs); color: var(--c-umber-51); }
.solo-feat.done small { color: var(--c-green-51); }
.world-feat { margin: 0 0 var(--sp-6); padding: 0 0 var(--sp-5); border-top: 0; border-bottom: 1px solid color-mix(in srgb, var(--c-umber-37) 18%, transparent); }
.world-feat .solo-feat i { position: relative; height: 8px; overflow: visible; }
.world-feat .solo-feat i::after { border-radius: var(--radius-xs); max-width: 100%; }
.world-feat .solo-feat i b { position: absolute; top: -3px; width: 2px; height: 14px; background: color-mix(in srgb, var(--c-umber-37) 55%, transparent); }
.world-feat ol { grid-column: 1 / -1; margin: var(--sp-2) 0 0; padding-left: var(--sp-10); font-size: var(--fs-xs); }
.world-feat ol li { font-variant-numeric: tabular-nums; }
.world-feat ol li.me { font-weight: 700; }
`;

function ensurePanel() {
  if (typeof document === 'undefined') return null;
  const card = document.querySelector('#feat-panel .feat-card');
  if (!card) return null;
  let box = card.querySelector('.solo-feats');
  // A box drawn before the mode was known is the other kind: draw it again.
  if (box && box.classList.contains('world-feat') !== mpMode) {
    box.remove();
    box = null;
  }
  if (box) return box;
  if (!document.getElementById('solo-feats-style')) {
    const style = document.createElement('style');
    style.id = 'solo-feats-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  box = document.createElement('section');
  box.className = 'solo-feats';
  box.id = 'solo-feats';
  if (mpMode) {
    // G345: the shared Feat sits first in the panel, over the Last Feat chain.
    box.classList.add('world-feat');
    box.setAttribute('aria-label', MP_TEXT.heading);
    box.innerHTML = `<div class="solo-feats-head"><h4>${MP_TEXT.heading}</h4><small data-world-feat-ends></small></div>`
      + `<p class="solo-feats-copy">${MP_TEXT.copy}</p>`
      + '<div class="solo-feats-list" data-world-feat></div>';
    // MPANELS: the modern sheet's body scrolls under its head (index.html .ui-sheet-body).
    const body = card.querySelector('.ui-sheet-body');
    const head = card.querySelector('.side-head');
    if (body) body.prepend(box);
    else if (head) head.after(box);
    else card.prepend(box);
  } else {
    box.setAttribute('aria-label', 'Your Feats');
    box.innerHTML = '<div class="solo-feats-head"><h4>Your Feats</h4><small data-solo-feat-rocks></small></div>'
      + '<p class="solo-feats-copy">The old Feats, as goals of your own. Finish one for a Small Petrified Rock. A finished Feat opens again a game week later.</p>'
      + '<div class="solo-feats-list" data-solo-feat-list></div>';
    (card.querySelector('.ui-sheet-body') || card).appendChild(box);
  }
  const panel = document.getElementById('feat-panel');
  if (panel && typeof MutationObserver === 'function' && !panelObserver) {
    panelObserver = new MutationObserver(() => {
      if (!panel.hidden) render();
    });
    panelObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }
  return box;
}

function render() {
  const box = ensurePanel();
  if (!box) return;
  if (mpMode) {
    renderWorld(box);
    return;
  }
  const done = WIRED_FEATS.filter((f) => isFeatComplete(state, f.id)).length;
  const rocks = box.querySelector('[data-solo-feat-rocks]');
  if (rocks) rocks.textContent = `${done} of ${WIRED_FEATS.length} done`;
  const list = box.querySelector('[data-solo-feat-list]');
  if (!list) return;
  list.textContent = '';
  const now = Date.now();
  for (const row of featRows(state)) {
    const el = document.createElement('div');
    el.className = `solo-feat${row.complete ? ' done' : ''}`;
    el.dataset.feat = row.id;
    const title = document.createElement('b');
    title.textContent = row.title;
    const count = document.createElement('em');
    count.textContent = row.complete ? 'Done' : `${row.value} / ${row.goal}`;
    const what = document.createElement('span');
    what.textContent = row.what;
    const bar = document.createElement('i');
    bar.style.setProperty('--p', `${Math.round((row.value / row.goal) * 100)}%`);
    el.append(title, count, what, bar);
    if (row.pending && !row.complete) {
      const note = document.createElement('small');
      note.textContent = `${row.pending} waiting: leave the street to count them.`;
      el.append(note);
    }
    if (!row.complete && row.runs && !row.pending) {
      const note = document.createElement('small');
      note.textContent = row.runs === 1 ? 'You have finished it once. Finish it again for another rock.' : `You have finished it ${row.runs} times. Finish it again for another rock.`;
      el.append(note);
    }
    if (row.complete && row.reopensAt) {
      const note = document.createElement('small');
      note.dataset.featReopens = String(row.reopensAt);
      note.textContent = reopenText(row.reopensAt, now);
      el.append(note);
    }
    list.appendChild(el);
  }
}

// —— QA ——————————————————————————————————————————————————————————————————

const FEED_CLASSES = /^npc_(?:piggy|batterfly)$/;

/** The Piggy or Batterfly nearest the avatar (&featfeedanimal=piggy|batterfly picks one kind). */
function nearestFeedable(engine) {
  const p = engine.player;
  if (!p) return null;
  const only = String(engine.param?.('featfeedanimal') || '');
  let best = null;
  for (const t of engine.interactables || []) {
    if (!FEED_CLASSES.test(String(t?.classId)) || !t.sprite || t.sprite.destroyed) continue;
    if (only && t.classId !== `npc_${only}`) continue;
    const d = Math.abs((Number(t.sprite.x) || 0) - p.x);
    if (!best || d < best.d) best = { t, d };
  }
  return best?.t || null;
}

/** &featfeedautoplay=<n>: one Cherry at a time through the animal's own feed verb (engine.beginVerb). */
function runFeedAutoplay(engine, now) {
  if (!feedAutoplay || now < feedAutoplay.at) return;
  const target = nearestFeedable(engine);
  feedAutoplay.at = now + 2500;
  if (!target || engine.busy?.()) return;
  addItem(engine.inv, 'cherry', 1);
  const id = target.classId === 'npc_batterfly' ? 'feed:cherry:1' : 'feed:cherry';
  engine.beginVerb?.(target, { id, label: 'feed Cherry', ...(target.featureId ? { durationMs: 0 } : {}) });
  feedAutoplay.left -= 1;
  engine.setData?.('soloFeatFeeds', `${target.classId}:${feedAutoplay.left}`);
  if (feedAutoplay.left <= 0) feedAutoplay = null;
}

function readDemo(engine) {
  const featId = String(engine.param?.('featdemo') || '').trim();
  const f = FEAT_BY_ID[featId];
  if (!f?.wired) return null;
  const raw = engine.param?.('featprogress');
  const value = raw == null || raw === '' ? f.goal - 1 : Math.max(0, Math.min(f.goal - 1, Math.floor(Number(raw) || 0)));
  const pending = Math.max(0, Math.floor(Number(engine.param?.('featpending')) || 0));
  // G171: finished some game days ago (featweekago=1 is a week and a minute).
  let doneAgoMs = null;
  if (engine.param?.('featweekago') === '1') doneAgoMs = GAME_WEEK_MS + 60_000;
  else {
    const days = Number(engine.param?.('featdoneago'));
    if (engine.param?.('featdoneago') != null && Number.isFinite(days) && days >= 0) doneAgoMs = Math.round(days * GAME_DAY_MS);
  }
  const runs = Math.max(1, Math.min(99, Math.floor(Number(engine.param?.('featruns')) || 1)));
  return { featId, value, pending, doneAgoMs, runs, rawProgress: raw, autoplay: engine.param?.('featautoplay') === '1' };
}

function applyDemo(engine) {
  if (demoDone) return;
  demoDone = true;
  if (!state.openedAt) state.openedAt = Date.now();
  if (engine.param?.('featreset') === '1') state = normalizeSoloFeatState({ openedAt: Date.now() });
  demo = readDemo(engine);
  if (demo) {
    const now = Date.now();
    const f = FEAT_BY_ID[demo.featId];
    if (demo.doneAgoMs != null) {
      const at = now - demo.doneAgoMs;
      state.progress[demo.featId] = { value: f.goal, contributedAt: at - 60_000, completedAt: at, runs: demo.runs };
      // A week up: open it again now, then apply &featprogress if given.
      if (reopenDueFeats(state, now, demo.featId).length) {
        demo.value = demo.rawProgress == null || demo.rawProgress === '' ? 0 : demo.value;
        state.progress[demo.featId].value = demo.value;
        if (demo.featId === 'pet_only') state.pending = demo.pending;
        engine.pushActivity?.(`The Feat "${f.title}" is open again, for another ${REWARD_LABEL}.`);
      } else {
        demo.value = f.goal;
      }
    } else {
      state.progress[demo.featId] = { value: demo.value, contributedAt: demo.value ? now : 0, completedAt: 0, runs: 0 };
      if (demo.featId === 'pet_only') state.pending = demo.pending;
    }
    if (demo.autoplay) autoplayAt = now + 1500;
    last = `demo:${demo.featId}:${demo.value}`;
  }
  const feeds = Math.min(10, Math.floor(Number(engine.param?.('featfeedautoplay')) || 0));
  if (feeds > 0) feedAutoplay = { left: feeds, at: Date.now() + 2500 };
  if (engine.param?.('featopen') === '1' && typeof document !== 'undefined') {
    setTimeout(() => {
      const panel = document.getElementById('feat-panel');
      if (panel) {
        panel.hidden = false;
        render();
        document.getElementById('solo-feats')?.scrollIntoView({ block: 'nearest' });
      }
    }, 600);
  }
  render();
  publish(engine);
}

// —— Multiplayer: the shared Feat (G345) ———————————————————————————————————

const ROCK_ICONS = Object.freeze({
  petrified_rock_small: 'assets/sprites/moment/petrified_rock_small.webp',
  petrified_rock_medium: 'assets/sprites/moment/petrified_rock_medium.webp',
  petrified_rock_large: 'assets/sprites/moment/petrified_rock_large.webp',
});

/** Writes the save now and waits for it to land (savedThrough, R28): true once a write holding it is in. */
export async function persist(engine, store = saveStore) {
  engine.save?.();
  return savedThrough(store);
}

/**
 * pc.feats_increment in multiplayer: today's Feat only, counted by the server. Owed until it answers
 * (G968, js/feat-owed.js); made before the server names today's Feat, it is held and counts if that
 * Feat is today's. Returns 0 (the answer comes as feat_counted).
 */
function mpReport(engine, featId, amount, opts = {}) {
  if (!FEAT_BY_ID[featId]) return 0;
  const s = ensureMp(engine);
  const run = s?.synced ? s.run : null;
  if (run && run.feat !== featId) return 0;
  // An act the server takes (feats-mp.js MP_ACTS), checked as the report will be sent.
  if (!reportFor(run || { feat: featId }, featId, amount, opts)) return 0;
  // G786 (#361): a donation goes through the ledger: its spend id, marked applied with the trades
  // as the items have just left the pack (trade-feature ledgerReceipt), so the ledger counts them
  // once and the realtime server can count every one (feats-mp.js MP_DONATIONS).
  let op = '';
  if (run && MP_DONATIONS[featId]) {
    const id = donationOp();
    if (engine.query?.('ledgerReceipt', id, engine) === true) op = id;
  }
  // The source's per-animal limits (hugged_for_feat and the rest), kept here as in solo (incrementFeat
  // opts.cap): spent when the server accepts (owedAccepted); one owed for that key holds its place.
  const cap = opts?.cap?.key ? { key: String(opts.cap.key).slice(0, 120), max: Math.max(1, Math.floor(Number(opts.cap.max)) || 1) } : null;
  if (cap && (state.caps[cap.key] || 0) + capHeld(owed, cap.key) >= cap.max) return 0;
  if (!oweReport(owed, { feat: featId, n: amount, act: opts.act, street: opts.street, op, cap }, run)) return 0;
  owedDirty = true;
  flushOwed(engine);
  publish(engine);
  return 0;
}

/**
 * Sends the next owed report once the server has named today's Feat on this connection: one at a
 * time, at the server's pace (js/feat-owed.js nextReport). Reports for another Feat's day are dropped.
 */
function flushOwed(engine, now = Date.now()) {
  const s = ensureMp(engine);
  if (!s?.synced || !s.run) return;
  if (legacyQuest) {
    // G896's questOwed: what it held above the server's count of yours.
    if (legacyQuest.run === runKey(s.run)) oweReport(owed, { feat: QUEST_FEAT, n: legacyQuest.done - s.run.mine }, s.run, now);
    legacyQuest = null;
    owedDirty = true;
  }
  if (placeOwed(owed, s.run)) owedDirty = true;
  const next = nextReport(owed, s.run, now);
  if (next) {
    if (s.client.send('feat_add', next.report)) {
      s.sent += 1;
      owedSent(owed, next.entry, now);
      owedDirty = true;
    } else {
      s.lastReason = 'offline';
      owedOffline(owed, now);
    }
  }
  publish(engine);
}

/** feat_counted for an owed report: settled, or asked again later; the cap is spent once accepted. */
function owedAnswered(engine, msg) {
  const ans = owedAnswer(owed, msg);
  if (!ans) return;
  const cap = ans.entry.cap;
  if (ans.accepted && cap && !ans.entry.capSpent) {
    ans.entry.capSpent = true;
    state.caps[cap.key] = (state.caps[cap.key] || 0) + 1;
  }
  owedDirty = true;
  flushOwed(engine);
}

function ensureMp(engine) {
  if (!mpMode) return null;
  const client = engine.query?.('realtimeClient');
  if (mp && (!client || mp.client === client)) return mp;
  if (!client) return null;
  mp = createMp(engine, client);
  globalThis.groddleFeats = mp;
  return mp;
}

/** A new run of a Feat drops the caps that Feat owns (the source's *_for_feat maps belonged to one run). */
function startedRun(run) {
  const key = `${run.feat}:${run.run}`;
  if (mpLists.run === key) return false;
  mpLists.run = key;
  for (const owner of CAP_OWNERS) {
    if (!owner.feats.includes(run.feat)) continue;
    for (const k of Object.keys(state.caps)) if (k.startsWith(owner.prefix)) delete state.caps[k];
  }
  if (run.feat !== 'pet_only') state.pending = 0;
  return true;
}

function createMp(engine, client) {
  let offset = 0;
  // synced: this connection has heard today's Feat (feat_state); owed reports wait for it (G968).
  const s = { client, run: null, last: null, sent: 0, lastReason: '', applying: new Set(), synced: false, get offset() { return offset; } };
  const clock = (msg) => {
    if (Number(msg?.now) > 0) offset = Number(msg.now) - Date.now();
  };
  const seen = (kind) => {
    last = `mp:${kind}`;
    engine.setData?.('mpFeatLast', kind);
  };
  const refresh = () => {
    render();
    publish(engine);
  };
  s.sync = () => client.send('feat_sync', {});
  client.on('hello', () => {
    // A new connection: what was asked on the old one is asked again (same ids) once today's Feat is known.
    s.synced = false;
    owedReconnected(owed);
    s.sync();
  });
  if (client.state === 'online') s.sync();

  client.on('msg:feat_state', (msg) => {
    clock(msg);
    const run = runFromServer(msg, offset);
    if (!run) return;
    s.run = run;
    if (msg.last && typeof msg.last === 'object') s.last = msg.last;
    if (startedRun(run)) engine.save?.();
    seen('feat_state');
    refresh();
    s.synced = true;
    flushOwed(engine);
  });
  client.on('msg:feat_progress', (msg) => {
    if (!s.run || Number(msg.run) !== s.run.run || msg.feat !== s.run.feat) return;
    // #683: the server tells each player their own amount and place with it (feats.go progressToEach), so a
    // place moves as others pass you; an older server's progress without them keeps the last ones.
    const own = 'place' in msg;
    const next = runFromServer({ ...msg, start: 0, end: 0, goal: s.run.goal, bonus: s.run.bonus, super: s.run.super, mine: own ? msg.mine : s.run.mine, place: own ? msg.place : s.run.place }, offset);
    s.run = { ...next, start: s.run.start, end: s.run.end };
    seen('feat_progress');
    refresh();
  });
  client.on('msg:feat_counted', (msg) => {
    s.lastReason = String(msg.reason || '');
    if (s.run && Number(msg.run) === s.run.run && msg.feat === s.run.feat) {
      s.run.total = Math.max(s.run.total, Number(msg.total) || 0);
      s.run.mine = Number(msg.mine) || s.run.mine;
      s.run.place = Number(msg.place) || s.run.place;
    }
    owedAnswered(engine, msg);
    if (Number(msg.n) > 0) {
      // inc_feats.js 104-106: every contribution grants Down to the Wire (once).
      engine.grantAchievement?.('down_to_the_wire');
      last = `${msg.feat}:+${Number(msg.n)}:${Number(msg.mine)}`;
    }
    engine.setData?.('mpFeatReason', s.lastReason || 'none');
    refresh();
  });
  client.on('msg:feat_goal', (msg) => {
    const f = FEAT_BY_ID[msg.feat];
    if (!f) return;
    const tier = Math.max(1, Math.min(3, Number(msg.tier) || 1));
    const line = `The Feat "${f.title}" met its ${[MP_TEXT.goal, MP_TEXT.bonus, MP_TEXT.super][tier - 1].toLowerCase()}!`;
    engine.pushActivity?.(line);
    engine.toast?.(line, 4200);
    if (s.run && Number(msg.run) === s.run.run) s.run.total = Math.max(s.run.total, Number(msg.total) || 0);
    seen('feat_goal');
    refresh();
  });
  client.on('msg:feat_ended', (msg) => {
    s.last = msg;
    const line = endedLine(msg);
    if (line) {
      engine.pushActivity?.(line);
      engine.toast?.(line, 5200);
    }
    seen('feat_ended');
    refresh();
  });
  client.on('msg:feat_first', (msg) => applyFirst(engine, s, msg));
  client.on('msg:feat_reward', (msg) => applyReward(engine, s, msg));

  s.report = (featId, n, opts) => mpReport(engine, featId, n, opts);
  s.lists = () => ({ applied: [...mpLists.applied], rewarded: [...mpLists.rewarded], run: mpLists.run });
  s.open = () => {
    const panel = typeof document !== 'undefined' ? document.getElementById('feat-panel') : null;
    if (panel) panel.hidden = false;
    render();
  };
  return s;
}

/** feat_first (inc_feats.js 53-84): the first contribution's badges and the vog_text, applied once. */
async function applyFirst(engine, s, msg) {
  const id = String(msg.id || '');
  if (!/^feat-f-[a-z0-9-]{1,32}$/.test(id) || s.applying.has(id)) return;
  if (mpLists.applied.includes(id)) {
    if (await persist(engine)) s.client.send('feat_ack', { id });
    return;
  }
  s.applying.add(id);
  const parts = rewardParts({ counters: msg.counters, grants: msg.grants });
  const remaining = Number(msg.remaining);
  if (FEAT_BY_ID[msg.feat] && Number.isFinite(remaining) && remaining >= 0) {
    const text = vogFor(msg.feat, remaining);
    engine.pushActivity?.(text);
    engine.toast?.(text, 5200);
  }
  for (const { counter, amount } of parts.counters) engine.achievement?.(counter, amount);
  for (const g of parts.grants) engine.grantAchievement?.(g);
  remember(mpLists.applied, id);
  engine.setData?.('mpFeatLast', 'feat_first');
  publish(engine);
  const ok = await persist(engine);
  s.applying.delete(id);
  if (ok) s.client.send('feat_ack', { id });
}

/** iMG, mood, energy and favor as feats_gather_rewards pays them (inc_feats.js 259-264). */
function payout(engine, r) {
  const pc = engine.pc;
  if (!pc) return r;
  const xp = r.xp ? grantMoodXp(pc, r.xp) : 0;
  if (r.currants) pc.currants = (Number(pc.currants) || 0) + r.currants;
  const mood = r.mood > 0 ? gainMetabolic(pc, 'mood', r.mood) : 0;
  const energy = r.energy > 0 ? gainMetabolic(pc, 'energy', r.energy) : 0;
  const ledger = pc.giantFavor;
  for (const f of r.favor || []) {
    if (!ledger) break;
    const giants = f.giant === 'all' ? Object.keys(GIANTS) : [f.giant === 'tii' ? 'ti' : f.giant];
    // stats_add_favor_points: capped at the emblem target (pc.addGiantFavor, inc_stats.js 975-976).
    if (typeof pc.addGiantFavor === 'function') pc.addGiantFavor(f.giant === 'all' ? 'all' : giants[0], f.points);
    else for (const g of giants) ledger[g] = Math.max(0, Number(ledger[g]) || 0) + f.points;
  }
  return { ...r, xp, mood, energy };
}

/** feat_reward (inc_feats.js 129-151, 164-283): the day's reward, applied once; its currants are in the ledger already. */
async function applyReward(engine, s, msg) {
  const id = String(msg.id || '');
  if (!/^feat-r-[a-z0-9-]{1,32}$/.test(id) || s.applying.has(id)) return;
  if (mpLists.rewarded.includes(id)) {
    if (await persist(engine)) s.client.send('feat_ack', { id });
    return;
  }
  s.applying.add(id);
  const f = FEAT_BY_ID[msg.feat];
  // A load that applied the ledger's part lists the id already (Ledger::catchUp): then the currants are in the save.
  const parts = rewardParts(msg, { ledger: !mpLists.applied.includes(id) });
  const paid = payout(engine, parts.rewards);
  for (const it of parts.items) addItem(engine.inv, it.classTsid, it.count);
  if (parts.items.length) {
    engine.refreshPack?.();
    engine.playSound?.('PETRIFIED_ROCK', { volume: 0.6 });
  }
  const shown = { ...paid, currants: Number(msg.rewards?.currants) || 0 };
  const bits = rewardBits(shown, parts.items);
  const place = Number(msg.place) || 0;
  const body = completionText(f?.title || 'Feat');
  engine.pushActivity?.(`${body} ${bits.join(', ')}.`);
  if (place) engine.pushActivity?.(`You placed ${youPlace(place, Number(msg.count) || 0)}.`);
  const big = parts.items.find((it) => it.classTsid !== REWARD_ITEM) || parts.items[0];
  engine.award?.({
    kind: 'feat',
    title: COMPLETE_TITLE,
    body,
    subtitle: bits.join(' · '),
    iconUrl: ROCK_ICONS[big?.classTsid] || ROCK_ICON,
    primaryLabel: COMPLETE_BUTTON,
  });
  for (const { counter, amount } of parts.counters) engine.achievement?.(counter, amount);
  for (const g of parts.grants) engine.grantAchievement?.(g);
  state.rocks += parts.items.reduce((n, it) => n + it.count, 0);
  remember(mpLists.applied, id);
  remember(mpLists.rewarded, id);
  last = `reward:${msg.feat}:${place}`;
  engine.updateHud?.();
  engine.setData?.('mpFeatLast', 'feat_reward');
  publish(engine);
  const ok = await persist(engine);
  s.applying.delete(id);
  if (ok) s.client.send('feat_ack', { id });
}

function youPlace(place, count) {
  const t = place % 100;
  const sfx = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] || 'th');
  return count ? `${place}${sfx} of ${count}` : `${place}${sfx}`;
}

/** The panel's "Today's Feat": the shared bar with its three goals, you, the top five, and yesterday's. */
function renderWorld(box) {
  const list = box.querySelector('[data-world-feat]');
  const ends = box.querySelector('[data-world-feat-ends]');
  if (!list) return;
  list.textContent = '';
  const run = mp?.run || null;
  if (ends) ends.textContent = run ? endsText(run.end) : '';
  if (!run) {
    const el = document.createElement('div');
    el.className = 'solo-feat';
    el.textContent = mp ? MP_TEXT.waiting : MP_TEXT.offline;
    list.appendChild(el);
    return;
  }
  const f = FEAT_BY_ID[run.feat];
  const g = goalStatus(run);
  const el = document.createElement('div');
  el.className = `solo-feat${g.tier ? ' done' : ''}`;
  el.dataset.feat = run.feat;
  el.dataset.featRun = String(run.run);
  const title = document.createElement('b');
  title.textContent = run.title;
  const count = document.createElement('em');
  count.textContent = `${run.total.toLocaleString()} / ${run.goal.toLocaleString()}`;
  const what = document.createElement('span');
  what.textContent = f?.what || '';
  // One bar to the supermegabonus, marks at the minimum and bonus goals.
  const bar = document.createElement('i');
  const top = Math.max(1, run.super || run.goal);
  bar.style.setProperty('--p', `${Math.min(100, Math.round((run.total / top) * 100))}%`);
  for (const n of [run.goal, run.bonus]) {
    if (!n) continue;
    const mark = document.createElement('b');
    mark.style.left = `${Math.round((n / top) * 100)}%`;
    bar.appendChild(mark);
  }
  const goals = document.createElement('span');
  goals.textContent = `${MP_TEXT.goal} ${run.goal.toLocaleString()} · ${MP_TEXT.bonus} ${run.bonus.toLocaleString()} · ${MP_TEXT.super} ${run.super.toLocaleString()} ${f?.unit || ''}`.trim();
  const status = document.createElement('small');
  status.dataset.worldFeatStatus = String(g.tier);
  status.textContent = goalLine(run);
  const you = document.createElement('span');
  you.dataset.worldFeatYou = String(run.mine);
  you.textContent = youLine(run);
  el.append(title, count, what, bar, status, goals, you);
  if (run.top.length) {
    const ol = document.createElement('ol');
    const me = mp?.client?.me?.id;
    for (const c of run.top) {
      const li = document.createElement('li');
      li.textContent = `${c.name}: ${c.n.toLocaleString()}`;
      if (me && c.id === me) li.className = 'me';
      ol.appendChild(li);
    }
    el.appendChild(ol);
  }
  list.appendChild(el);
  if (mp?.last?.feat && FEAT_BY_ID[mp.last.feat] && Number(mp.last.run) !== run.run) {
    const prev = document.createElement('div');
    prev.className = `solo-feat${Number(mp.last.tier) ? ' done' : ''}`;
    const t = document.createElement('span');
    t.textContent = endedLine(mp.last);
    prev.appendChild(t);
    list.appendChild(prev);
  }
}

/**
 * The owed queue from a save (G968). A save from before it kept two lists: qurazyOwed (G754, the
 * streets of Qurazys not answered) and questOwed (G896: held quests, and a run's count of yours to
 * reach); they are read into the queue once, held until the server names today's Feat.
 */
function restoreOwed(slice) {
  owed = owedRestore(slice?.owed);
  owedDirty = false;
  legacyQuest = null;
  if (!slice || Array.isArray(slice.owed)) return;
  const now = Date.now();
  if (Array.isArray(slice.qurazyOwed)) {
    for (const street of slice.qurazyOwed.filter((k) => typeof k === 'string' && OWED_STREET.test(k)).slice(-QURAZY_OWED_MAX)) {
      oweReport(owed, { feat: QURAZY_FEAT, n: 1, act: 'quoin', street }, null, now);
    }
  }
  const qo = slice.questOwed;
  if (qo && typeof qo === 'object') {
    const held = Math.min(Math.max(0, Math.floor(Number(qo.held)) || 0), 1000);
    if (held) oweReport(owed, { feat: QUEST_FEAT, n: held }, null, now);
    const done = Math.min(Math.max(0, Math.floor(Number(qo.done)) || 0), 1e6);
    if (QUEST_RUN.test(String(qo.run || '')) && done) legacyQuest = { run: String(qo.run), done };
  }
  owedDirty = owed.list.length > 0 || Boolean(legacyQuest);
}

// —— Feature ————————————————————————————————————————————————————————————

export const soloFeatsFeature = {
  id: SOLO_FEATS_ID,

  init(engine) {
    mpMode = engine?.mode === 'multiplayer';
    render();
    publish(engine);
  },

  /**
   * TODAYCARD (features/start-today-feature.js, js/start-today.js featTile): the start card's Feat tile.
   * Online, today's shared Feat: the realtime session starts only after Start (realtime-feature onTick),
   * so on the card it is the server's schedule worked out here (runAt; live runs no shift, feats.go
   * 658-661), its name and end without the count, and the server's run with the count once one is in.
   * Solo, the personal Feat with the most of its way done that is still open.
   */
  startCardFeat() {
    if (mpMode) {
      const run = mp?.run;
      if (run) return { mode: 'world', title: run.title, what: FEAT_BY_ID[run.feat]?.what || '', total: run.total, goal: run.goal, end: run.end };
      const due = runAt(Date.now());
      const f = FEAT_BY_ID[due.feat];
      return f ? { mode: 'world', title: f.title, what: f.what || '', end: due.end } : { mode: 'world', waiting: true };
    }
    const open = featRows(state).filter((r) => !r.complete && r.goal > 0);
    if (!open.length) return { mode: 'solo', allDone: true };
    open.sort((a, b) => b.value / b.goal - a.value / a.goal || a.goal - b.goal);
    const best = open[0];
    return { mode: 'solo', id: best.id, title: best.title, what: best.what, value: best.value, goal: best.goal };
  },

  /**
   * G800 (features/calendar-feature.js, js/calendar.js): the Feats for the Calendar. Online, today's
   * shared run as the server sent it (its feat and start anchor the turns after it), or null before
   * it has; solo, your own Feats, each open or Done with when it opens again.
   */
  calendarFeats() {
    if (mpMode) {
      const run = mp?.run;
      return { mode: 'world', run: run ? { feat: run.feat, start: run.start, end: run.end } : null };
    }
    return { mode: 'solo', rows: featRows(state).map((r) => ({ id: r.id, title: r.title, complete: r.complete, reopensAt: r.reopensAt })) };
  },

  /** engine.featsIncrement(featId, amount, opts): pc.feats_increment. */
  featsIncrement(featId, amount, opts, engine) {
    if (!engine || !FEAT_BY_ID[featId]) return null;
    return increment(engine, featId, amount, opts || {});
  },

  /** detail (feature-host event): { animal } on Piggy and Batterfly feeds. */
  onEvent(counter, amount, engine, detail) {
    onFeatEvent(engine, counter, amount, detail);
  },

  onStreetEnter(street, engine) {
    if (mpMode) ensureMp(engine);
    else applyDemo(engine);
    streetTsid = String(street?.tsid || engine.streetTsid || '');
    // location.js:723 onPlayerEnter: a nekkid arrival marks where you came in.
    entry = nekkid(engine) ? playerPoint(engine) : null;
    publish(engine);
  },

  onStreetClear(engine) {
    // G754: a Qurazy picked up just before leaving is owed for the street it was found on.
    if (mpMode) poll(engine);
    // location.js 1041-1055 onPlayerExit.
    const res = streakCheck(state, {
      tsid: streetTsid,
      dayKey: getGameDayKey(Date.now()),
      entry,
      exit: playerPoint(engine),
      nekkid: nekkid(engine),
      realStreet: realStreet(engine, streetTsid),
    });
    if (res.ok) increment(engine, 'streaking', 1, { act: 'streak', street: streetTsid });
    entry = null;
    // feats_get_for_commit: the kindnesses on the street you just left.
    const pending = takePending(state);
    if (pending) {
      const counted = increment(engine, 'pet_only', pending);
      if (counted && !last.includes('complete')) engine.pushActivity?.(`${counted} more toward "… And Ask Nothing in Return".`);
    }
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (!engine.started) return;
    // catalog_buffs.js nekkid on_apply / on_remove: the streak starts where you strip.
    const bare = nekkid(engine);
    if (bare && !entry) entry = playerPoint(engine);
    else if (!bare && entry) entry = null;
    if (autoplayAt && now >= autoplayAt && demo) {
      autoplayAt = 0;
      if (demo.featId === 'pet_only') {
        addPending(state, 1, Date.now());
        last = `pending:+1:${state.pending}`;
      } else {
        increment(engine, demo.featId, 1);
      }
      publish(engine);
    }
    runFeedAutoplay(engine, now);
    if (now < pollAt) return;
    pollAt = now + POLL_MS;
    poll(engine);
  },

  save() {
    // Multiplayer: the ids applied (the site's LedgerMath::FEAT_SLICE) and the run whose caps are in state. Solo saves what it always did.
    if (mpMode) return { ...state, applied: [...mpLists.applied], rewarded: [...mpLists.rewarded], mpRun: mpLists.run, owed: owedSave(owed) };
    return state;
  },

  restore(slice, engine) {
    if (engine) mpMode = engine.mode === 'multiplayer';
    mpLists = mpMode ? { applied: appliedFrom(slice), rewarded: appliedFrom({ applied: slice?.rewarded }), run: String(slice?.mpRun || '').slice(0, 24) } : { applied: [], rewarded: [], run: '' };
    state = normalizeSoloFeatState(slice || {});
    restoreOwed(mpMode ? slice : null);
    questSeen = null;
    // When the Feats first opened to this save (quick_on_your_feat).
    if (!state.openedAt) state.openedAt = Date.now();
    demoDone = false;
    entry = null;
    // Poll at the next tick: a Feat whose week ran out while away opens then.
    pollAt = 0;
    render();
  },
};
