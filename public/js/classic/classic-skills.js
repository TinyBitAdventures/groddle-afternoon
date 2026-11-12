/**
 * Classic Skills navigation (Classic only; the Skills panel's Modern look and keys are untouched).
 * The 2012 client kept Skills inside the imagination menu, so it stepped back one level at a time:
 *
 * - The hub's Skills cloud shows up to five of the skills you could learn, three to a row, and
 *   "N available" under the cloud (ImgMenuSkills.as 109-160; the order is the client's,
 *   NCMsgHandler.as 2450-2454: shortest first, then by name). classic-hub.js draws it with
 *   skillsCloud() below.
 * - A skill picked from the list opens its own details view, cross-faded in over .3 s, with "Back to
 *   Skills" at the top left, the skill's picture under it and "Start learning this skill" below the
 *   text (ImaginationSkillDetailsUI.as 60-119; ImaginationSkillsUI.as showSkillDetails 376-399).
 *   Starting to learn goes back to the list (ImaginationSkillDetailsUI.as onAPIComplete 333-336).
 *   The details are the Modern row's own open body (js/skills-panel.js), one row open at a time
 *   (openOnlySkillInPanel), so the buttons, links and checks are the panel's.
 * - Esc steps back: details to the list, the list to the hub (ImgMenuView.as onEscKey 653-666), and
 *   the hub's own Esc closes it. Every way into Skills was the menu's Skills cloud in the client
 *   (TSMainView.as shiftSKeyHandler 892-912, PlayerSkillBookUI.as onClick), so the list always
 *   steps back to the hub; the window's close button still closes it outright.
 * - The header of the list is one full-width bar: "Learning <name>" over the bar and the time left
 *   under it, the accelerated bar gold with its arrows, unlearning teal and filling from the right
 *   with a Cancel that asks first; with nothing in study it reads "Select a skill..."
 *   (ImaginationSkillsUI.as 120-215, updateSkillTraining 401-460, onUnlearningCancelClick 657-669).
 *
 * The parts added here are hidden unless Classic is on (hidden attributes, kept in step with the
 * interface), and the rules for them are in css/classic.css's "Classic skills" block.
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=11da9030';
import { focusSkillInPanel, openOnlySkillInPanel, skillPanelUiState } from '../skills-panel.js?v=4de079e9';
import { formatStudyTime } from '../skills.js?v=4542bdf9';
import { skillArtFor } from '../familiar.js?v=5fd83250';
import { CARD_ART_LAYERS } from '../imagination-data.js?v=4a85e7fe';
import { WINDOW_SELECTOR } from '../window-stack.js?v=a7104f02';

/** The Skills cloud's icons: five at most, three to a row (ImgMenuSkills.as 120-136). */
export const CLOUD_ICONS_MAX = 5;
export const CLOUD_ICONS_ROW = 3;

/** PURE: the client's order for learnable skills (NCMsgHandler.as 2451-2454: can_learn, then seconds, then name). */
export function learnableOrder(rows) {
  return [...(rows || [])].sort((a, b) =>
    (Number(b.canLearn !== false) - Number(a.canLearn !== false))
    || (Number(a.seconds) || 0) - (Number(b.seconds) || 0)
    || String(a.name || '').toLowerCase().localeCompare(String(b.name || '').toLowerCase()));
}

/**
 * PURE: what the hub's Skills cloud shows ({ icons: classTsids, sub }): up to five learnable skills
 * in the client's order and "N available" (ImgMenuSkills.as 120-151). With nothing to learn but a
 * skill in study or being unlearned, its icon alone, so the cloud still shows it (152-163).
 */
export function skillsCloud({ learnable = [], learning = null, unlearning = null } = {}) {
  const rows = learnableOrder(learnable);
  const icons = rows.slice(0, CLOUD_ICONS_MAX).map((r) => r.classTsid);
  const current = learning || unlearning;
  if (!rows.length && current?.classTsid) icons.push(current.classTsid);
  return { icons, sub: `${rows.length} available` };
}

/**
 * PURE: the header bar (ImaginationSkillsUI.as updateSkillTraining 401-460). The skill in study
 * comes first, then the one being unlearned; the time reads "any second now!" at 0 (412).
 * kind: 'none' | 'learn' | 'fast' | 'unlearn'; progress 0-1 (an unlearning bar fills from the right).
 */
export function studyHeader({ learning = null, unlearning = null } = {}) {
  const current = learning || unlearning;
  if (!current) return { kind: 'none', select: 'Select a skill...' };
  const left = Math.max(0, Number(current.remainingSeconds) || 0);
  const kind = learning ? (learning.isAccelerated ? 'fast' : 'learn') : 'unlearn';
  return {
    kind,
    verb: learning ? 'Learning' : 'Unlearning',
    classTsid: current.classTsid,
    name: current.name || current.classTsid,
    time: left > 0 ? `${formatStudyTime(left)} left` : 'any second now!',
    progress: Math.max(0, Math.min(1, Number(current.progress) || 0)),
    cancel: kind === 'unlearn',
  };
}

/** PURE: the Cancel's question (ImaginationSkillsUI.as 220-226, 661). */
export function unlearnCancelPrompt(name) {
  return {
    title: 'Cancel Unlearning?',
    text: `Are you sure you'd like to cancel unlearning ${name}? Your unlearning progress will not be saved!`,
    yes: 'Yes, cancel unlearning',
    no: 'Nevermind!',
  };
}

/** PURE: where Esc goes from the Skills screen (ImgMenuView.as onEscKey 653-666): details, then the list, then the menu. */
export function skillsEscStep(view) {
  return view === 'detail' ? 'list' : 'hub';
}

/** The skill's picture: its imagination card art, cut to the tile (as the study chip's card). */
export function skillIconUrl(classTsid) {
  return skillArtFor(classTsid, CARD_ART_LAYERS);
}

const typingIn = (t) => Boolean(t?.matches?.('input, textarea, select, [contenteditable="true"]'));

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
  if (text) node.textContent = text;
  return node;
}

/** The open window drawn on top (the highest z-index among the shown ones), or null. */
function topWindow(doc, win) {
  let top = null;
  let topZ = -Infinity;
  for (const w of doc.querySelectorAll(WINDOW_SELECTOR)) {
    if (w.hidden || w.closest('[hidden]') || !w.getClientRects().length) continue;
    const z = Number.parseInt(win.getComputedStyle?.(w).zIndex, 10);
    const zv = Number.isFinite(z) ? z : 0;
    if (zv >= topZ) { top = w; topZ = zv; }
  }
  return top;
}

let api = null;

// Registered when the module loads (before the game's own key listener, as classic-hub.js is).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (api && e.key === 'Escape') api.onEscape(e);
  }, true);
}

export function installClassicSkills({ doc = globalThis.document, win = globalThis, engine = null, hub = null } = {}) {
  const panel = doc.getElementById('skills-panel');
  const card = panel?.querySelector(':scope > .side-card');
  const body = doc.getElementById('skills-body');
  if (!panel || !card || !body) return null;
  const classic = () => uiState().mode === 'classic';

  // The header bar, over the list.
  const study = el(doc, 'div', { class: 'classic-skills-study', 'data-study': 'none', hidden: true });
  const select = el(doc, 'p', { class: 'classic-skills-select' }, 'Select a skill...');
  const bar = el(doc, 'div', { class: 'classic-skills-bar' });
  const fill = el(doc, 'i', { class: 'classic-skills-fill' });
  fill.append(el(doc, 'span', { class: 'classic-skills-arrows' }));
  const line = el(doc, 'p', { class: 'classic-skills-name' });
  const verb = el(doc, 'span', { class: 'classic-skills-verb' });
  const nameBtn = el(doc, 'button', { type: 'button', class: 'classic-skills-link' });
  line.append(verb, doc.createTextNode(' '), nameBtn);
  const cancel = el(doc, 'button', { type: 'button', class: 'classic-skills-cancel' }, 'Cancel');
  bar.append(fill, line, cancel);
  const time = el(doc, 'p', { class: 'classic-skills-time' });
  study.append(select, bar, time);
  // The details view's back button, with the skill's picture under it on the left (ImaginationSkillDetailsUI.as 60-99).
  const back = el(doc, 'div', { class: 'classic-skill-back', hidden: true });
  const backBtn = el(doc, 'button', { type: 'button', class: 'classic-skill-back-btn' }, 'Back to Skills');
  const aside = el(doc, 'div', { class: 'classic-skill-aside' });
  const icon = el(doc, 'img', { class: 'classic-skill-icon', alt: '', width: '96', height: '96' });
  aside.append(icon);
  back.append(backBtn, aside);
  card.insertBefore(study, doc.getElementById('skills-meta') || body);
  card.insertBefore(back, body);

  let detail = null;
  let pendingStart = null;
  let listScroll = 0;
  let header = null;
  let timer = 0;
  const isOpen = () => !panel.hidden;

  function setView() {
    const on = classic();
    study.hidden = !on || Boolean(detail);
    back.hidden = !on || !detail;
    if (on) panel.dataset.classicSkills = detail ? 'detail' : 'list';
    else delete panel.dataset.classicSkills;
  }

  function paintHeader() {
    let now = { learning: null, unlearning: null };
    try { now = engine?.skillStudyNow?.() || now; } catch { /* keep none */ }
    const h = studyHeader(now);
    header = h;
    study.dataset.study = h.kind;
    select.hidden = h.kind !== 'none';
    bar.hidden = h.kind === 'none';
    time.hidden = h.kind === 'none';
    if (h.kind === 'none') return h;
    if (verb.textContent !== h.verb) verb.textContent = h.verb;
    if (nameBtn.textContent !== h.name) nameBtn.textContent = h.name;
    nameBtn.dataset.skill = h.classTsid;
    fill.style.width = `${(h.progress * 100).toFixed(2)}%`;
    if (time.textContent !== h.time) time.textContent = h.time;
    cancel.hidden = !h.cancel;
    return h;
  }

  function tick() {
    if (!classic() || !isOpen()) return;
    const h = paintHeader();
    // Started learning from the details: back to the list (onAPIComplete).
    if (pendingStart && h.kind !== 'none' && h.kind !== 'unlearn' && h.classTsid === pendingStart) {
      pendingStart = null;
      showList();
    }
  }

  const click = () => { try { engine?.playSound?.('CLICK_SUCCESS', { volume: 0.4 }); } catch { /* audio off */ } };

  function showDetail(classTsid, { fromLink = false, sound = true } = {}) {
    if (!classTsid) return;
    if (!detail) listScroll = body.scrollTop;
    detail = classTsid;
    pendingStart = null;
    // A link already opened its skill (with the filters reset, as Modern does); a row opens it here.
    if (!fromLink) openOnlySkillInPanel(classTsid, body);
    // Hidden by the search or a filter (the header's name, a skill picked elsewhere): clear them, as a link does.
    if (!body.querySelector(`.skill-row[data-skill="${classTsid}"]`)) {
      focusSkillInPanel(classTsid);
      openOnlySkillInPanel(classTsid, body);
    }
    icon.src = skillIconUrl(classTsid);
    setView();
    body.scrollTop = 0;
    backBtn.focus({ preventScroll: true });
    if (sound) click();
  }

  function showList({ focusRow = true } = {}) {
    const was = detail;
    detail = null;
    pendingStart = null;
    openOnlySkillInPanel(null, body);
    setView();
    paintHeader();
    body.scrollTop = listScroll;
    if (focusRow && was) {
      const head = body.querySelector(`.skill-row[data-skill="${was}"] .skill-row-head`);
      head?.focus({ preventScroll: true });
      head?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  // A row's name opens its details instead of opening in place.
  body.addEventListener('click', (e) => {
    if (!classic()) return;
    const head = e.target?.closest?.('.skill-row-head');
    if (head) {
      e.stopPropagation();
      e.preventDefault();
      if (!detail) showDetail(head.closest('.skill-row')?.dataset.skill);
      return;
    }
    // Start learning (or resume) from the details: back to the list once it starts.
    const action = e.target?.closest?.('.skill-action');
    const startable = action?.closest('.skill-row')?.classList;
    if (detail && action && !action.disabled && (startable?.contains('is-available') || startable?.contains('is-paused'))) pendingStart = detail;
  }, true);
  // A skill link in the details (Requires, Path, Leads to): its own details. Modern's handler (which
  // stops the click there) adds it to the open rows (focusSkillInPanel); then only it stays open.
  body.addEventListener('click', (e) => {
    if (!classic() || !detail || !e.target?.closest?.('.skill-link')) return;
    const from = detail;
    win.setTimeout(() => {
      if (detail !== from) return;
      const open = skillPanelUiState().expanded.filter((id) => id !== from);
      const next = open[open.length - 1];
      if (!next) return;
      openOnlySkillInPanel(next, body);
      showDetail(next, { fromLink: true });
    }, 0);
  }, true);
  backBtn.addEventListener('click', () => {
    click();
    showList();
  });
  nameBtn.addEventListener('click', () => { if (nameBtn.dataset.skill) showDetail(nameBtn.dataset.skill); });
  cancel.addEventListener('click', () => {
    const h = header;
    if (!h?.cancel) return;
    const words = unlearnCancelPrompt(h.name);
    const stop = () => engine?.query?.('runSkillUnlearn', h.classTsid, 'cancel', engine);
    if (typeof engine?.scriptedDialogue !== 'function') { stop(); return; }
    engine.scriptedDialogue({
      title: words.title,
      kicker: 'Skills',
      cancelable: true,
      primaryLabel: words.yes,
      cancelLabel: words.no,
      beats: [{ text: words.text, response: words.yes }],
      onComplete: () => { stop(); paintHeader(); },
    });
  });

  // Opened: a skill already picked for it (focusSkillInPanel: a link, the familiar, Unlearning)
  // shows in its details; otherwise the list. Closed: back to the list for next time.
  let wasOpen = isOpen();
  new win.MutationObserver(() => {
    const open = isOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) {
      win.clearInterval(timer);
      timer = win.setInterval(tick, 500);
      if (!classic()) return;
      const picked = skillPanelUiState().expanded;
      detail = null;
      listScroll = 0;
      if (picked.length) showDetail(picked[picked.length - 1], { sound: false });
      else { openOnlySkillInPanel(null, body); setView(); }
      paintHeader();
    } else {
      win.clearInterval(timer);
      timer = 0;
      if (detail) { detail = null; openOnlySkillInPanel(null, body); }
      pendingStart = null;
      setView();
    }
  }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });

  onUiModeChange(() => {
    if (!classic() && detail) detail = null;
    setView();
    if (classic() && isOpen()) paintHeader();
  });
  setView();

  api = {
    view: () => (detail ? 'detail' : 'list'),
    detail: () => detail,
    header: () => header,
    showDetail,
    showList,
    onEscape(e) {
      if (!classic() || !isOpen() || e.repeat || hub?.isOpen?.()) return;
      if (typingIn(e.target) || typingIn(doc.activeElement)) return;
      // Only when Skills is the window on top: a dialog over it takes its own Esc.
      if (topWindow(doc, win) !== panel) return;
      if (skillsEscStep(api.view()) === 'list') {
        e.preventDefault();
        e.stopImmediatePropagation();
        showList();
        return;
      }
      // The list: the game closes it (after anything it closes first), then the menu comes back.
      win.setTimeout(() => {
        if (classic() && !isOpen() && hub && !hub.isOpen()) hub.open();
      }, 0);
    },
  };
  win.groddleClassicSkills = api;
  return api;
}
