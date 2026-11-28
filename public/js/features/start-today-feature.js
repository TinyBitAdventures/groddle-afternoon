/**
 * TODAYCARD (Austin 2026-11-20: "Let's go with the Today in Ur direction"; report #568's ideas,
 * welcome card ideas page layout A). The start card for a returning player:
 *
 *  - The keys panel gives way to a "Today" panel: what you are learning and the time left (or a Start
 *    learning button that opens Skills), the Feat (online today's shared Feat from the realtime server,
 *    solo your nearest personal Feat, with How to help / See Feats opening the Feat panel), and a tip
 *    that changes each visit. Every key stays one Hold ? away (the line under the actions).
 *  - "Today's goals" becomes one personal nudge (js/start-today.js pickNudge): a badge you are close to
 *    ("An idea pops into your head") or your newest quest's next step ("A Giant whispers to you").
 *  - A brand-new save (newxp's tutorial choice on the card, or a new multiplayer character) keeps the
 *    first-steps goal and the full key list, as before.
 *
 *  - G1206: online, the featured street project (js/start-today.js projectTile) as this browser last
 *    saw it: the realtime session starts only after Start, so the card cannot ask the server. See the
 *    project starts the game and opens the Projects panel on it once the server names it (R11 made the
 *    featured project always one you can reach, v0.54.1).
 *
 * The words are pure (js/start-today.js); this file reads the game and draws them while the card is up,
 * the tiles once a second on its own timer (features do not tick before Start): the skill's time, a
 * Feat the server names after the card showed.
 * Canvas: startToday (today|new), startNudge (badge:<id>|quest:<id>|none), startSkillTile
 * (learning|idle), startFeatTile (world|waiting|solo|done|none), startProjectTile (<job id>|none), startTip.
 * QA: &todaytip=<n> picks the tip.
 */

import { androidBrowser, badgeCandidates, featTile, pickNudge, pickTip, projectTile, skillTile, START_TIPS, tipText } from '../start-today.js?v=e73894d1';
import { listQuestTracker } from '../quests.js?v=4c8f3a10';
import { skillArtFor } from '../familiar.js?v=b9597cd3';
import { CARD_ART_LAYERS } from '../imagination-data.js?v=4a85e7fe';

export const START_TODAY_ID = 'start-today';

const FEAT_ICON = 'assets/sprites/feat_badge_small.webp';
const IDLE_SKILL_ICON = 'assets/imagination/cards/art_brain.svg';
const PROJECT_ICON = 'assets/sprites/icons/construction_tool.webp';

let mode = '';
let tip = '';
let nudgeKey = '';
/** The page's own goal (play/index.html), put back when no nudge is left. */
const FIRST_STEPS = { head: 'First steps', text: 'Gather grain or meat, then make flour and sammiches.' };
let timer = null;

function cardShown(doc) {
  const overlay = doc.getElementById('overlay');
  return Boolean(overlay && !overlay.classList.contains('hidden'));
}

/** Start the game as Start exploring does, then run `then` once it has started (beginGame is async). */
function startThen(engine, then) {
  const btn = document.getElementById('start-btn');
  if (!btn) return;
  btn.click();
  const t0 = Date.now();
  const wait = () => {
    if (engine.started) {
      setTimeout(() => then(), 60);
      return;
    }
    if (Date.now() - t0 < 4000) setTimeout(wait, 50);
  };
  wait();
}

/** One tile's DOM, made once and updated in place. */
function tileEl(doc, list, key, onAct) {
  let el = list.querySelector(`[data-tile="${key}"]`);
  if (el) return el;
  el = doc.createElement('div');
  el.className = 'start-tile';
  el.dataset.tile = key;
  el.innerHTML = '<img class="start-tile-icon" alt="" width="40" height="40"><div class="start-tile-copy"><strong></strong><small></small><span class="start-tile-meter" hidden><i></i></span></div><button type="button" class="start-tile-act" hidden></button>';
  el.querySelector('.start-tile-act').addEventListener('click', onAct);
  list.appendChild(el);
  return el;
}

function paintTile(el, { icon, title, sub, progress, action }) {
  const img = el.querySelector('.start-tile-icon');
  if (img.getAttribute('src') !== icon) img.setAttribute('src', icon);
  el.querySelector('strong').textContent = title;
  el.querySelector('small').textContent = sub || '';
  const meter = el.querySelector('.start-tile-meter');
  meter.hidden = progress == null;
  if (progress != null) meter.firstChild.style.width = `${Math.round(progress * 100)}%`;
  const act = el.querySelector('.start-tile-act');
  act.hidden = !action;
  act.textContent = action || '';
}

function paintTiles(engine, doc) {
  const list = doc.getElementById('start-tiles');
  if (!list) return;
  // What you are learning, or how many skills are ready.
  const now = Date.now();
  const learning = engine.skillStudyNow?.(now)?.learning || null;
  const available = learning ? 0 : (engine.skillsLearnable?.(now) || []).filter((s) => s.status === 'available').length;
  const skill = skillTile(learning, available);
  paintTile(tileEl(doc, list, 'skill', () => startThen(engine, () => engine.openSkillTree?.())), {
    ...skill,
    icon: skill.classTsid ? skillArtFor(skill.classTsid, CARD_ART_LAYERS) : IDLE_SKILL_ICON,
  });
  engine.setData?.('startSkillTile', skill.state);
  // The Feat.
  const summary = engine.query?.('startCardFeat', engine) || null;
  const feat = featTile(summary, now);
  const featEl = tileEl(doc, list, 'feat', () => startThen(engine, () => document.getElementById('feat-btn')?.click()));
  featEl.hidden = !feat;
  if (feat) paintTile(featEl, { ...feat, icon: FEAT_ICON });
  engine.setData?.('startFeatTile', !summary ? 'none' : summary.waiting ? 'waiting' : summary.allDone ? 'done' : summary.mode);
  // G1206: the featured street project, online, as this browser last saw it.
  const memo = engine.query?.('startCardProject', engine) || null;
  const project = projectTile(memo);
  const projectEl = tileEl(doc, list, 'project', () => startThen(engine, () => engine.query?.('openFeaturedProject', engine)));
  projectEl.hidden = !project;
  if (project) paintTile(projectEl, { ...project, icon: PROJECT_ICON });
  engine.setData?.('startProjectTile', project ? memo.jobId : 'none');
}

function paintNudge(engine, doc) {
  const head = doc.getElementById('start-goal-title');
  const text = doc.getElementById('start-goal-text');
  if (!head || !text) return;
  const badges = badgeCandidates(engine.achievementRows?.() || []);
  const quests = engine.questState ? listQuestTracker(engine.questState, 3) : [];
  const nudge = pickNudge({ badges, quests });
  const key = nudge ? `${nudge.kind}:${nudge.id}:${nudge.after}` : 'none';
  if (key === nudgeKey) return;
  nudgeKey = key;
  engine.setData?.('startNudge', nudge ? `${nudge.kind}:${nudge.id}` : 'none');
  if (!nudge) {
    // The first-steps goal, as the page has it.
    head.textContent = FIRST_STEPS.head;
    text.textContent = FIRST_STEPS.text;
    return;
  }
  head.textContent = nudge.kicker;
  text.textContent = '';
  const name = doc.createElement('strong');
  name.textContent = nudge.name;
  text.append(nudge.lead, name, nudge.after);
}

function paint(engine) {
  if (typeof document === 'undefined') return;
  const doc = document;
  const card = doc.querySelector('#overlay .start-card');
  if (!card || !cardShown(doc)) return;
  // A new save: newxp put its tutorial choice on the card (it may do so after this ran: checked each paint).
  const next = doc.getElementById('newxp-start') || engine.newPlayer ? 'new' : 'today';
  if (next !== mode) {
    mode = next;
    card.dataset.startMode = mode;
    const today = doc.getElementById('start-today');
    const keys = card.querySelector('.start-keys');
    const hint = doc.getElementById('start-keyhint');
    if (today) today.hidden = mode !== 'today';
    if (keys) keys.hidden = mode === 'today';
    if (hint) hint.hidden = mode !== 'today';
    engine.setData?.('startToday', mode);
    if (mode === 'new' && nudgeKey) {
      // The tutorial choice came in after a nudge was drawn: the first-steps goal again.
      nudgeKey = '';
      const head = doc.getElementById('start-goal-title');
      const text = doc.getElementById('start-goal-text');
      if (head) head.textContent = FIRST_STEPS.head;
      if (text) text.textContent = FIRST_STEPS.text;
    }
    if (mode === 'today') {
      const pick = Number(engine.param?.('todaytip'));
      const touch = doc.documentElement.classList.contains('touch-phone');
      // G1150: the Android install tip in an Android browser only, never in the installed app.
      let standalone = false;
      try { standalone = Boolean(globalThis.matchMedia?.('(display-mode: standalone)')?.matches); } catch { /* no media queries */ }
      const android = androidBrowser(globalThis.navigator?.userAgent, standalone);
      tip = Number.isInteger(pick) && START_TIPS[pick] ? START_TIPS[pick] : pickTip(Math.random, { touch, android });
      const tipEl = doc.getElementById('start-tip-text');
      if (tipEl) tipEl.textContent = tipText(tip, { touch });
      engine.setData?.('startTip', String(START_TIPS.indexOf(tip)));
    }
  }
  if (mode === 'today') {
    // Every second: a badge or quest counted after the card showed (QA seeds, a skill finished at boot).
    paintNudge(engine, doc);
    paintTiles(engine, doc);
  }
}

export const startTodayFeature = {
  id: START_TODAY_ID,

  onStreetEnter(street, engine) {
    if (engine.started) return;
    paint(engine);
    // Features do not tick before Start (game.js gameFrame), so the card keeps its own second.
    if (timer || typeof setInterval !== 'function') return;
    timer = setInterval(() => {
      if (engine.started) {
        clearInterval(timer);
        timer = null;
        return;
      }
      paint(engine);
    }, 1000);
  },
};

/** Tests: forget what was drawn. */
export function _resetStartToday() {
  mode = '';
  tip = '';
  nudgeKey = '';
  if (timer) clearInterval(timer);
  timer = null;
}
