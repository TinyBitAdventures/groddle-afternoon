/**
 * The familiar's skill-learned panel (G218): FamiliarDialog SKILL_LEARNED.
 *
 * Source (glitch-client): FamiliarDialog.as 47-50 (min height 220, 410 wide
 * with the skill list, X_OFFSET 140), 85-95 (bg 0x0a181d at 0.9, no border,
 * close X 8 px from the top right, padding 20), 139-176 (header "Woohoo! New
 * skill learned...", title, learned text, "Choose a Skill to Learn Next",
 * "View Full Skill Tree"), 178-205 (the skill's sound plays), 253-268 (end:
 * shrink back to the header centre, 0.3 s easeOutCubic), 330-343 (start:
 * scale 0.02 at the header centre, then 0.3 s easeInCubic to its place),
 * 353-439 (learnable skills, 2 columns or 3 past 8), 477-509 (_jigger, _place:
 * centred, header bottom + 30, corner radius 10). TSFrontController.as
 * 2037-2056 and 2307-2309: finished skills queue and show one after another.
 * YouDisplayManager.as 400-428: hidden while the AchievementView is up and
 * while moving between streets.
 *
 * G364: while an award, new-day or Giant screen shows, the panel waits and
 * grows as it closes. The client's skill panel is not on the 2134
 * screen_view_open gate (that is startFamiliarConversationWithPayload, the
 * familiar's talk: game.js familiarWaitsForScreen); it opens at once but stays
 * hidden while the AchievementView is on stage (changeTeleportDialogVisibility
 * 420, called as the view animates in and when its done tween completes,
 * AchievementView.as 307, 449), and the other screens draw over it. The
 * queue's own fam_dialog_open gate (3394) only counts a panel that has grown.
 *
 * game.js emits `skill_learned:<class>` for every finished skill (online or
 * caught up offline); this feature queues it. While the panel is up the
 * Magic Rock holds its quest offers (the familiar is busy talking).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&familiardemo=skill
 *     (&familiarskill=<class>, default animalkinship_1; =<a>,<b> queues two)
 *     shows the panel; &familiardemo=award grants a real badge
 *     (&familiarbadge=<id>, default betterthanlousy_douser) so the rock drops
 *     in beside it (G219). The voice-of-rock overlay (G220):
 *     &questdemo=high_jump (the High Jumper's tree-top line).
 *     Canvas: familiarPanel (open class or ''), familiarQueue, familiarLast,
 *     familiarHeld ('screen' while a screen holds the panel).
 */

import { CARD_ART_LAYERS } from '../imagination-data.js';
import { skillArtFor, skillLearnedModel } from '../familiar.js?v=g225-1';

/** FamiliarDialog grow / shrink: 0.3 s (start 340-343, end 253-268). */
export const FAMILIAR_GROW_MS = 300;

/** How often a panel held by a screen looks again (ours: the client shows it as the screen's tween ends). */
export const FAMILIAR_SCREEN_POLL_MS = 100;

/** Resolves once no award, new-day or Giant screen is showing (engine.screenViewOpen). */
export function afterScreens(engine, { pollMs = FAMILIAR_SCREEN_POLL_MS, setTimer = (fn, ms) => setTimeout(fn, ms) } = {}) {
  return new Promise((resolve) => {
    const check = () => {
      let up = false;
      try {
        up = engine?.screenViewOpen?.() === true;
      } catch {
        up = false;
      }
      engine?.setData?.('familiarHeld', up ? 'screen' : '');
      if (up) setTimer(check, pollMs);
      else resolve();
    };
    check();
  });
}

const queue = [];
let open = null; // { classTsid }
let root = null;
let closing = false;

function setData(engine) {
  engine.setData?.('familiarPanel', open?.classTsid || '');
  engine.setData?.('familiarQueue', String(queue.length));
}

function buildRoot() {
  if (root || typeof document === 'undefined') return root;
  const host = document.getElementById('quest-dialogue')?.parentNode || document.getElementById('game-root') || document.body;
  root = document.createElement('section');
  root.id = 'familiar-dialog';
  root.className = 'familiar-dialog';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'familiar-dialog-title');
  root.innerHTML = `
    <button type="button" class="fam-close" data-fam-close aria-label="Close"></button>
    <div class="fam-learned">
      <img class="fam-learned-icon" data-fam-icon alt="" width="100" height="100" />
      <div class="fam-learned-copy">
        <p class="fam-learned-header" data-fam-header></p>
        <h2 class="fam-learned-title" id="familiar-dialog-title" data-fam-title></h2>
        <p class="fam-learned-desc" data-fam-desc></p>
      </div>
    </div>
    <p class="fam-learn-next" data-fam-next-label><span></span></p>
    <div class="fam-skill-list" data-fam-skills></div>
    <button type="button" class="fam-tree-link" data-fam-tree></button>`;
  host.appendChild(root);
  return root;
}

function render(engine, info) {
  const model = skillLearnedModel(info);
  const el = buildRoot();
  if (!el) return;
  el.dataset.skill = model.classTsid;
  el.querySelector('[data-fam-icon]').src = skillArtFor(model.classTsid, CARD_ART_LAYERS);
  el.querySelector('[data-fam-header]').textContent = model.header;
  el.querySelector('[data-fam-title]').textContent = model.name;
  el.querySelector('[data-fam-desc]').textContent = model.learned;
  const nextLabel = el.querySelector('[data-fam-next-label]');
  nextLabel.querySelector('span').textContent = model.chooseLabel;
  nextLabel.hidden = !model.skills.length;
  const list = el.querySelector('[data-fam-skills]');
  list.replaceChildren();
  list.dataset.cols = String(model.cols);
  for (const skill of model.skills) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fam-skill';
    b.dataset.skill = skill.classTsid;
    if (skill.label !== skill.name) b.title = skill.name;
    const icon = document.createElement('img');
    icon.src = skillArtFor(skill.classTsid, CARD_ART_LAYERS);
    icon.alt = '';
    icon.width = 20;
    icon.height = 20;
    const label = document.createElement('span');
    label.textContent = skill.label;
    b.append(icon, label);
    // FamiliarDialog onSkillClick: the skill's details (here, the Skills panel on it).
    b.addEventListener('click', () => openTree(engine, skill.classTsid));
    list.appendChild(b);
  }
  el.querySelector('[data-fam-tree]').textContent = model.treeLabel;
}

function openTree(engine, classTsid = '') {
  close(engine, { all: false, quick: true });
  engine.openSkillTree?.(classTsid);
}

async function showNext(engine) {
  if (open || closing || !queue.length) return;
  const classTsid = queue.shift();
  const info = engine.skillLearnedInfo?.(classTsid);
  if (!info) {
    setData(engine);
    showNext(engine);
    return;
  }
  open = { classTsid };
  render(engine, info);
  setData(engine);
  // Like the client's interval while the familiar is hidden: wait for the loading card,
  // then (G364) for any screen showing, then the card again if a street change came meanwhile.
  await engine.afterStreetCard?.();
  await afterScreens(engine);
  await engine.afterStreetCard?.();
  if (open?.classTsid !== classTsid) return;
  engine.playSound?.('SKILL_ACHIEVED', { volume: 0.7 });
  engine.setData?.('familiarLast', classTsid);
  grow(root);
}

function grow(el) {
  if (!el) return;
  el.hidden = false;
  el.classList.remove('is-shrinking');
  el.classList.remove('is-grown');
  // Restart the grow animation (scale 0.02 at the header centre to 1).
  void el.offsetWidth;
  el.classList.add('is-grown');
  el.querySelector('[data-fam-close]')?.focus?.({ preventScroll: true });
}

function close(engine, { quick = false } = {}) {
  if (!open || !root) return;
  open = null;
  // TSFrontController endFamiliarConversation 2307-2309: the next queued skill takes the open panel.
  if (queue.length && !quick) {
    setData(engine);
    showNext(engine);
    return;
  }
  if (quick) queue.length = 0;
  closing = true;
  root.classList.remove('is-grown');
  root.classList.add('is-shrinking');
  setData(engine);
  setTimeout(() => {
    closing = false;
    if (!open && root) {
      root.hidden = true;
      root.classList.remove('is-shrinking');
    }
    showNext(engine);
  }, quick ? 0 : FAMILIAR_GROW_MS);
}

/** Queue a finished skill for the panel (also the QA demo's entry point). */
export function queueSkillLearned(engine, classTsid) {
  if (!classTsid) return;
  if (open?.classTsid === classTsid || queue.includes(classTsid)) return;
  queue.push(classTsid);
  setData(engine);
  showNext(engine);
}

export function familiarDialogOpen() {
  return Boolean(open);
}

let demo = '';

export const familiarDialogFeature = {
  id: 'familiar-dialog',

  init(engine) {
    queue.length = 0;
    open = null;
    closing = false;
    const el = buildRoot();
    if (el && !el.dataset.wired) {
      el.dataset.wired = '1';
      el.querySelector('[data-fam-close]').addEventListener('click', () => close(engine));
      el.querySelector('[data-fam-tree]').addEventListener('click', () => openTree(engine));
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close(engine);
        }
      });
    }
    demo = String(engine.param?.('familiardemo') || '');
    setData(engine);
  },

  onEvent(counter, amount, engine) {
    const c = String(counter || '');
    if (c.startsWith('skill_learned:')) queueSkillLearned(engine, c.slice('skill_learned:'.length));
  },

  /** The familiar is busy talking: the Magic Rock's next offer waits. */
  holdQuestOffers() {
    return open ? true : null;
  },

  onTick(dtMs, now, engine) {
    if (!demo || !engine.started) return;
    const mode = demo;
    demo = '';
    setTimeout(() => runDemo(engine, mode), 600);
  },
};

/* ------------------------------------------------------------------ QA */

function runDemo(engine, mode) {
  if (mode === 'skill') {
    const ids = String(engine.param?.('familiarskill') || 'animalkinship_1').split(',').filter(Boolean);
    for (const id of ids) {
      engine.grantSkill?.(id);
      queueSkillLearned(engine, id);
    }
    return;
  }
  if (mode === 'award') {
    // A real badge through the real award path (inc_achievements.js grant).
    engine.grantAchievement?.(String(engine.param?.('familiarbadge') || 'betterthanlousy_douser'));
  }
}

/** Hidden helper for tests: reset module state. */
export function _resetFamiliarDialog() {
  queue.length = 0;
  open = null;
  closing = false;
  root = null;
}

