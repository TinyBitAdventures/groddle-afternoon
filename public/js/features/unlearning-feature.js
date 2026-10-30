/**
 * Unlearning skills (js/unlearning.js) as a feature module.
 *
 * With the Unlearning Ability card, every learned skill that nothing you
 * know (or are studying) depends on gets an Unlearn button in the Skills
 * panel. Unlearning takes the skill's study time (point_cost / 10 seconds;
 * Speedy Unlearning x0.75, Speedier x0.5), pauses any study, blocks new
 * study while it runs, carries on offline, and can be stopped. When it ends
 * the skill is gone, with its in-progress skill quest; nothing is refunded.
 * A study in progress can be unlearned too: it takes back only the points
 * already studied.
 *
 * Skills panel wiring (game.js renderSkillsPanel): ctx.unlearning =
 * query('skillUnlearning'), actions.unlearn / actions.cancelUnlearn =
 * query('runSkillUnlearn', id, 'start'|'cancel'); runSkillStudyAction asks
 * query('skillStudyGate', id) before starting or resuming a study.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&unlearndemo=1 grants
 *     the three Unlearning cards' first one, level 12 and Mining I-III, and
 *     opens the Skills panel on Mining III. &unlearnautoplay=1 starts
 *     unlearning Mining III (&unlearnskill=<id>), with &unlearnseconds=N
 *     shortening the clock for QA; =cancel stops it again; =study then tries
 *     to start a study (refused while unlearning). &unlearncards=2 owns
 *     Speedier Unlearning too. Canvas: unlearnActive, unlearnRemaining,
 *     unlearnDone, unlearnLast, unlearnAutoplay, unlearnLearned.
 */

import { getQuestCatalog, getSkillCatalog } from '../content-catalogs.js?v=g403-1';
import { focusSkillInPanel } from '../skills-panel.js?v=g480-2';
import { XP_FOR_LEVEL } from '../progression.js?v=progression-1';
import {
  UNLEARN_CARD,
  cancelUnlearning,
  createUnlearnState,
  startUnlearning,
  studyGate,
  tickUnlearning,
  unlearnCheck,
  unlearnSkillName,
  unlearnStatus,
} from '../unlearning.js?v=g403-1';

export const UNLEARNING_FEATURE_ID = 'unlearning';

let state = createUnlearnState();
let last = '';
let nextTick = 0;
let demoDone = false;
let autoplayAt = 0;
let autoplayStep = 0;
let openAt = 0;

const upgrades = (engine) => engine.pc?.imaginationUpgrades || [];
/** The live skill state: the same learned array and queue object game.js owns. */
const skillStateOf = (engine) => ({ learned: engine.learnedSkills || [], queue: engine.skillQueue || {} });

function publish(engine) {
  if (!engine?.setData) return;
  const s = unlearnStatus(state);
  engine.setData('unlearnActive', s ? s.classTsid : 'none');
  engine.setData('unlearnRemaining', s ? String(s.remainingSeconds) : '0');
  engine.setData('unlearnDone', state.unlearned.join(',') || 'none');
  engine.setData('unlearnLast', last || 'none');
  engine.setData('unlearnLearned', (engine.learnedSkills || []).filter((id) => /^mining_/.test(id)).join(',') || 'none');
}

function say(engine, msg, ok = true) {
  last = msg;
  engine.pushActivity?.(msg);
  engine.toast?.(msg, ok ? 3000 : 2600);
  publish(engine);
}

function run(engine, id, action) {
  if (action === 'cancel') {
    const res = cancelUnlearning(state);
    say(engine, res.msg, res.ok);
  } else {
    const secondsOverride = Number(engine.param?.('unlearnseconds'));
    const res = startUnlearning(state, skillStateOf(engine), id, {
      upgrades: upgrades(engine),
      questState: engine.questState,
      secondsOverride: secondsOverride > 0 ? secondsOverride : undefined,
    });
    if (res.ok) {
      engine.playSound?.('BEGIN_LEARNING_SKILL', { volume: 0.5 });
      for (const paused of res.paused) engine.pushActivity?.(`You paused learning ${unlearnSkillName(paused)}.`);
    }
    say(engine, res.msg, res.ok);
  }
  engine.updateHud?.();
  engine.save?.();
  return true;
}

function complete(engine, done) {
  if (!done) return;
  engine.playSound?.('SKILL_ACHIEVED', { volume: 0.6 });
  engine.achievement?.(done.counter, 1);
  say(engine, done.msg);
  if (done.quest) engine.pushActivity?.(`Your quest "${getQuestCatalog()[done.quest]?.title || done.quest.replace(/_/g, ' ')}" was removed until you learn the skill again.`);
  engine.updateHud?.();
  engine.save?.();
}

function demoSetup(engine) {
  if (demoDone || !engine.param?.('unlearndemo')) return;
  demoDone = true;
  const pc = engine.pc;
  pc.imaginationUpgrades ||= [];
  const cards = [UNLEARN_CARD, 'unlearning_time_1', 'unlearning_time_2'].slice(0, 1 + (Number(engine.param('unlearncards')) || 0));
  for (const card of cards) if (!pc.imaginationUpgrades.includes(card)) pc.imaginationUpgrades.push(card);
  if ((pc.level || 0) < 12) {
    pc.xp = Math.max(Number(pc.xp) || 0, XP_FOR_LEVEL[10] || 0);
    pc.level = 12;
  }
  for (const id of ['mining_1', 'mining_2', 'mining_3']) engine.grantSkill?.(id);
  openAt = Date.now() + 1200;
  if (engine.param('unlearnautoplay')) autoplayAt = Date.now() + 2500;
  engine.updateHud?.();
  publish(engine);
}

function autoplay(engine, now) {
  const mode = engine.param('unlearnautoplay');
  const skill = engine.param('unlearnskill') || 'mining_3';
  const step = autoplayStep;
  autoplayStep += 1;
  autoplayAt = now + 1500;
  if (step === 0) {
    run(engine, skill, 'start');
    return;
  }
  if (step === 1 && mode === 'cancel') {
    run(engine, skill, 'cancel');
  } else if (step === 1 && mode === 'study') {
    const gate = unlearningFeature.skillStudyGate('mining_4', engine);
    say(engine, gate?.msg || 'No gate', !gate);
  }
  autoplayAt = 0;
  engine.setData('unlearnAutoplay', mode || 'done');
}

export const unlearningFeature = {
  id: UNLEARNING_FEATURE_ID,

  init(engine) {
    publish(engine);
  },

  onStreetEnter(street, engine) {
    demoSetup(engine);
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (openAt && now >= openAt) {
      // QA: open the Skills panel on the demo skill once the HUD is wired.
      openAt = 0;
      focusSkillInPanel(engine.param('unlearnskill') || 'mining_3');
      document.getElementById('skills-btn')?.click();
    }
    if (autoplayAt && now >= autoplayAt) autoplay(engine, now);
    if (now < nextTick) return;
    nextTick = now + 500;
    if (!state.active) return;
    const done = tickUnlearning(state, skillStateOf(engine), { questState: engine.questState }, now);
    if (done) complete(engine, done);
    else publish(engine);
  },

  /** Skills panel context: the unlearning in progress and a per-skill check. */
  skillUnlearning(engine) {
    if (!upgrades(engine).includes(UNLEARN_CARD) && !state.active) return null;
    const skills = skillStateOf(engine);
    const active = unlearnStatus(state);
    return {
      active: active ? { ...active, name: unlearnSkillName(active.classTsid) } : null,
      check: (id) => {
        const learned = skills.learned.includes(id) || Boolean(skills.queue[id]);
        if (!learned) return { visible: false };
        if (state.active?.classTsid === id) return { visible: false };
        const res = unlearnCheck(state, skills, id, { upgrades: upgrades(engine), questState: engine.questState });
        return { visible: true, ...res };
      },
    };
  },

  runSkillUnlearn(id, action, engine) {
    return run(engine, id, action);
  },

  skillStudyGate(id, engine) {
    return studyGate(state);
  },

  save() {
    return { version: 1, ...state };
  },

  restore(slice, engine) {
    state = createUnlearnState(slice || {});
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  _reset() {
    state = createUnlearnState();
    last = '';
    nextTick = 0;
    demoDone = false;
    autoplayAt = 0;
    autoplayStep = 0;
  },
  _catalog: getSkillCatalog,
};
