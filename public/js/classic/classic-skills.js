/**
 * Classic Skills navigation (Classic only; the Skills panel's Modern look and keys are untouched).
 * The 2012 client kept Skills inside the imagination menu, so it stepped back one level at a time:
 *
 * - The hub's Skills cloud shows up to five of the skills you could learn, three to a row, and
 *   "N available" under the cloud (ImgMenuSkills.as 109-160; the order is the client's,
 *   NCMsgHandler.as 2450-2454: shortest first, then by name). classic-hub.js draws it with
 *   skillsCloud() below.
 * - A skill picked from the grid opens its own details view, cross-faded in over .3 s, with "Back to
 *   Skills" at the top left, the skill's picture under it and "Start learning this skill" below the
 *   text (ImaginationSkillDetailsUI.as 60-119; ImaginationSkillsUI.as showSkillDetails 376-399).
 *   Starting to learn goes back to the grid (ImaginationSkillDetailsUI.as onAPIComplete 333-336).
 *   The details are the Modern row's own open body (js/skills-panel.js), one row open at a time
 *   (openOnlySkillInPanel), so the buttons, links and checks are the panel's.
 * - The skills screen opens on a grid of cards (ImaginationSkillsUI.as showSkills 526-632;
 *   ImaginationSkillElementUI.as): 205 wide, three to a row, each the skill's picture, its name and
 *   its learning time; every skill you could learn, then locked ones ("Can't learn", greyed, with a
 *   lock) up to eleven, the one in study left out, and "...And N More. See full skill table" after
 *   them (skillsGrid below). A card opens the details.
 * - The full skill table, from that tile and from the face menu's Skills (PlayerInfoButtons.as:30;
 *   both opened the web site's Skills page, TSFrontController.openSkillsPage): one column per skill
 *   family, ranks stacked downward, each tile showing learned, can learn, learning now or locked.
 *   The page is not in the client source; its layout is our reading of a 2011 photo (skillTable below).
 * - Esc steps back one level: details to the grid or the table they came from, the table to the
 *   grid, the grid to the hub (ImgMenuView.as onEscKey 653-666), and the hub's own Esc closes it.
 *   Every way into Skills was the menu's Skills cloud in the client (TSMainView.as shiftSKeyHandler
 *   892-912, PlayerSkillBookUI.as onClick), so the grid always steps back to the hub; the window's
 *   close button still closes it outright.
 * - The header of the grid is one full-width bar: "Learning <name>" over the bar and the time left
 *   under it, the accelerated bar gold with its arrows, unlearning teal and filling from the right
 *   with a Cancel that asks first; with nothing in study it reads "Select a skill..."
 *   (ImaginationSkillsUI.as 120-215, updateSkillTraining 401-460, onUnlearningCancelClick 657-669).
 *
 * The parts added here are hidden unless Classic is on (hidden attributes, kept in step with the
 * interface), and the rules for them are in css/classic.css's "Classic skills" block.
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=f1f33f66';
import { focusSkillInPanel, openOnlySkillInPanel, skillPanelUiState } from '../skills-panel.js?v=4de079e9';
import { formatStudyTime } from '../skills.js?v=4542bdf9';
import { SKILL_CATEGORIES, SKILL_CATEGORY_ORDER } from '../skill-tree.js?v=faa54b90';
import { skillArtFor } from '../familiar.js?v=5fd83250';
import { CARD_ART_LAYERS } from '../imagination-data.js?v=4a85e7fe';
import { WINDOW_SELECTOR } from '../window-stack.js?v=a7104f02';
import { classicArtUrl } from './classic-art.js?v=5f713e7d';

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

/**
 * PURE: where Esc goes from the Skills screen, one level at a time (ImgMenuView.as onEscKey 653-666):
 * details back to where they were opened from (the grid or the table), the table to the grid, the
 * grid to the menu.
 */
export function skillsEscStep(view, from = 'grid') {
  if (view === 'detail') return from === 'table' ? 'table' : 'grid';
  if (view === 'table') return 'grid';
  return 'hub';
}

/* ---------------------------------------------------------------- the card grid (A1) */

/** The cards: 205 wide, three to a row, 7 apart and 12 between rows (ImaginationSkillElementUI.as 22; ImaginationSkillsUI.as showSkills 527-529). */
export const CARD_W = 205;
export const GRID_COLS = 3;
/** Past the learnable skills, locked ones fill the grid up to this many (MAX_TO_SHOW, ImaginationSkillsUI.as 64, 553-556). */
export const GRID_MAX = 11;
/** A card's name is cut at 22 letters with "..." (MAX_CHARS, ImaginationSkillElementUI.as 30, 133; StringUtil.truncate 28-40). */
export const CARD_NAME_MAX = 22;

/** PURE: StringUtil.truncate (28-40). */
export function cardName(name, max = CARD_NAME_MAX) {
  const s = String(name || '');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/**
 * PURE: a card's learning time, StringUtil.formatTime(seconds, true, true, 2) (StringUtil.as 177-212):
 * the short words (sec, min, hr; day keeps its plural), the two largest parts, and "~" when a part
 * was dropped.
 */
export function cardTime(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  const s = sec % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600) % 24;
  const d = Math.floor(sec / 86400);
  const parts = [];
  if (d > 0) parts.push(`${d.toLocaleString('en-US')} ${d === 1 ? 'day' : 'days'}`);
  if (h > 0) parts.push(`${h} hr`);
  if (m > 0) parts.push(`${m} min`);
  if (s > 0) parts.push(`${s} sec`);
  const shown = parts.slice(0, 2);
  return `${parts.length > 2 ? '~' : ''}${shown.join(' ')}`;
}

/**
 * PURE: the skills screen's grid (ImaginationSkillsUI.as showSkills 526-632). `skills` is every skill
 * not yet learned, each with canLearn (skills_can_learn with include_unlearned:
 * NetOutgoingSkillsCanLearnVO.as; inc_skills.js skills_learnable_list 1815-1849), in the client's order
 * (learnableOrder). Every learnable skill gets a card, then locked ones until eleven (553-556); the
 * skill in study is left out (557-561). Past the first row comes the "more" tile: "...And N More.
 * See full skill table" while skills are left over, else "See all skills in the full skill table"
 * (588-612); it spans the rest of its row (more_w, 590-600), and with one card's room its two parts
 * break onto two lines (607).
 * Returns { cards, more: { lead, link, span, br } | null, total }.
 */
export function skillsGrid({ skills = [], learning = null, cols = GRID_COLS } = {}) {
  const rows = learnableOrder(skills);
  const training = learning?.classTsid || null;
  const cards = [];
  let total = rows.length;
  let i = 0;
  let skipped = false;
  for (; i < rows.length; i += 1) {
    const r = rows[i];
    const canLearn = r.canLearn !== false;
    if (!canLearn && i >= GRID_MAX) break;
    if (training && r.classTsid === training) { skipped = true; continue; }
    cards.push({
      classTsid: r.classTsid,
      name: r.name || r.classTsid,
      label: cardName(r.name || r.classTsid),
      time: canLearn ? cardTime(r.seconds) : 'Can\'t learn',
      canLearn,
    });
  }
  let more = null;
  // The client adds it only once the cards run past one row (`total && next_y`, 588).
  if (total && cards.length > cols) {
    if (skipped) total -= 1;
    const left = cards.length % cols;
    const span = left === 0 ? cols : cols - left;
    const leftover = i < total;
    more = {
      lead: leftover ? `...And ${total - i} More.` : 'See all skills in',
      link: leftover ? 'See full skill table' : 'the full skill table',
      span,
      br: span === 1,
    };
  }
  return { cards, more, total };
}

/**
 * The web site's words for an empty list, from the Skills page in Emdot's photo of 2011-06-26 (Flickr
 * photo 5947049425: "No skills to learn right now..."). The client's grid had no words of its
 * own: with nothing learnable it showed the locked skills, and with every skill learned nothing at all.
 */
export const NOTHING_TO_LEARN = 'No skills to learn right now...';

/* ---------------------------------------------------------------- the full skill table (A5) */

/** The categories left to right, as the panel orders them (skill-tree.js SKILL_CATEGORY_ORDER), each with its tile tint. */
export const TABLE_CATEGORY_KEYS = Object.freeze({ 6: 'alchemy', 8: 'cooking', 11: 'industrial', 14: 'animals', 16: 'gathering', 17: 'growing', 19: 'intellectual' });

/**
 * PURE: a family's letters, as the 2012 skill icons carried them (the photo's AK, SA, LGT, EZC, JH):
 * the first letter of each word, and a word already in capitals (EZ) whole. OUR READING: the icons
 * were painted, not derived, and a few one-word families had two letters (HK); we take initials.
 */
export function skillAbbr(family) {
  return String(family || '').split(/[\s-]+/).filter(Boolean)
    .map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w[0].toUpperCase())).join('');
}

/** PURE: a tile's state: learned, learnable, studying (in study), unlearning, locked. */
export function tableTileState(status, classTsid, { learning = null, unlearning = null } = {}) {
  if (unlearning?.classTsid === classTsid) return 'unlearning';
  if (status === 'learned') return 'learned';
  if (status === 'studying' || learning?.classTsid === classTsid) return 'studying';
  if (status === 'available' || status === 'paused') return 'learnable';
  return 'locked';
}

const TILE_STATE_WORDS = { learned: 'learned', learnable: 'can learn', studying: 'learning now', unlearning: 'unlearning', locked: 'locked' };

/**
 * PURE: the "Table o' skills" (the web site's Skills page; PlayerInfoButtons.as:30 and
 * ImaginationSkillsUI.as onMoreClick 685-688 opened it, TSFrontController.openSkillsPage). It is not
 * in the client source, so the layout is OUR READING of Emdot's photo (Flickr photo 5947049425,
 * "Shamatta and the Magic Rock June 26, 11"): square letter tiles, a family's ranks stacked downward
 * in one column, the families side by side and grouped by kind; a learned tile carries a green tick, one you could learn now a cyan
 * ring, a locked one is faded. Ours: one column per family (the photo sometimes stacks two short
 * families in one column), the families of a category ordered by how deep their first rank sits in
 * the prerequisites, then by name (the photo reads that way: Animal Kinship before Herdkeeping before
 * Animal Husbandry), and a category name over each group, which the photo has not.
 * rows: engine.skillsAll() ({ classTsid, name, family, level, categoryId, reqs, status }).
 * Returns [{ id, key, name, families: [{ name, abbr, tiles: [{ classTsid, name, abbr, sup, state, words }] }] }].
 */
export function skillTable(rows = [], study = {}) {
  const byId = new Map(rows.map((r) => [r.classTsid, r]));
  const depthMemo = new Map();
  const depth = (id, seen = new Set()) => {
    if (depthMemo.has(id)) return depthMemo.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const reqs = (byId.get(id)?.reqs || []).filter((r) => byId.has(r));
    const d = reqs.length ? 1 + Math.max(...reqs.map((r) => depth(r, seen))) : 0;
    depthMemo.set(id, d);
    return d;
  };
  const groups = new Map();
  for (const r of rows) {
    const cat = Number(r.categoryId);
    if (!groups.has(cat)) groups.set(cat, new Map());
    const fams = groups.get(cat);
    const fam = r.family || r.name;
    if (!fams.has(fam)) fams.set(fam, []);
    fams.get(fam).push(r);
  }
  const order = [...SKILL_CATEGORY_ORDER, ...[...groups.keys()].filter((c) => !SKILL_CATEGORY_ORDER.includes(c)).sort((a, b) => a - b)];
  return order.filter((c) => groups.has(c)).map((c) => {
    const families = [...groups.get(c).entries()].map(([name, list]) => {
      const ranks = [...list].sort((a, b) => (a.level || 0) - (b.level || 0));
      const abbr = skillAbbr(name);
      return {
        name,
        abbr,
        first: Math.min(...ranks.map((r) => depth(r.classTsid))),
        tiles: ranks.map((r) => {
          const state = tableTileState(r.status, r.classTsid, study);
          return { classTsid: r.classTsid, name: r.name || r.classTsid, abbr, sup: r.level > 0 ? String(r.level) : '', state, words: TILE_STATE_WORDS[state] };
        }),
      };
    }).sort((a, b) => (a.first - b.first) || a.name.localeCompare(b.name));
    return { id: c, key: TABLE_CATEGORY_KEYS[c] || 'other', name: SKILL_CATEGORIES[c] || 'Other', families: families.map(({ first, ...f }) => f) };
  });
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

  // The header bar, over the grid.
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
  // The grid of cards (ImaginationSkillsUI.as showSkills) and the full skill table.
  const grid = el(doc, 'div', { class: 'classic-skills-grid', hidden: true });
  const table = el(doc, 'div', { class: 'classic-skills-table', hidden: true });
  // The details view's back button, with the skill's picture under it on the left (ImaginationSkillDetailsUI.as 60-99).
  const back = el(doc, 'div', { class: 'classic-skill-back', hidden: true });
  const backBtn = el(doc, 'button', { type: 'button', class: 'classic-skill-back-btn' }, 'Back to Skills');
  const aside = el(doc, 'div', { class: 'classic-skill-aside' });
  const icon = el(doc, 'img', { class: 'classic-skill-icon', alt: '', width: '96', height: '96' });
  aside.append(icon);
  back.append(backBtn, aside);
  const meta = doc.getElementById('skills-meta');
  card.insertBefore(study, meta || body);
  card.insertBefore(grid, meta || body);
  card.insertBefore(table, meta || body);
  card.insertBefore(back, body);

  /** 'grid' | 'table' | 'detail'; details remember where they were opened from. */
  let view = 'grid';
  let from = 'grid';
  let detail = null;
  let pendingStart = null;
  let openTo = null;
  let gridSig = '';
  let tableSig = '';
  let header = null;
  let timer = 0;
  const scrolls = { grid: 0, table: 0 };
  const isOpen = () => !panel.hidden;
  const scroller = () => (view === 'table' ? table : view === 'grid' ? grid : body);

  function setView() {
    const on = classic();
    study.hidden = !on || view === 'detail';
    grid.hidden = !on || view !== 'grid';
    table.hidden = !on || view !== 'table';
    back.hidden = !on || view !== 'detail';
    if (on) panel.dataset.classicSkills = view;
    else delete panel.dataset.classicSkills;
  }

  function studyNow() {
    try { return engine?.skillStudyNow?.() || { learning: null, unlearning: null }; } catch { return { learning: null, unlearning: null }; }
  }
  function allSkills() {
    try { return engine?.skillsAll?.() || []; } catch { return []; }
  }

  function paintHeader() {
    const h = studyHeader(studyNow());
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

  /** The cards, redrawn only when what they show changes (so focus and hover stay put). */
  function renderGrid(force = false) {
    const skills = allSkills().filter((r) => r.status !== 'learned')
      .map((r) => ({ ...r, canLearn: r.status === 'available' || r.status === 'studying' || r.status === 'paused' }));
    const shown = skillsGrid({ skills, learning: studyNow().learning });
    const sig = JSON.stringify(shown);
    if (!force && sig === gridSig) return shown;
    gridSig = sig;
    const nodes = shown.cards.map((c) => {
      const b = el(doc, 'button', {
        type: 'button',
        class: 'classic-skills-card',
        'data-skill': c.classTsid,
        'data-can': c.canLearn ? 'yes' : 'no',
        'aria-label': `${c.name}, ${c.time}`,
        title: c.label !== c.name ? c.name : null,
      });
      const pic = el(doc, 'span', { class: 'classic-skills-card-icon' });
      pic.append(el(doc, 'img', { src: skillIconUrl(c.classTsid), alt: '' }));
      // Can't learn: the small lock over the icon's corner (lock_small, ImaginationSkillElementUI.as 125-131).
      if (!c.canLearn) pic.append(el(doc, 'img', { class: 'classic-skills-card-lock', src: classicArtUrl('lock_small'), alt: '' }));
      const words = el(doc, 'span', { class: 'classic-skills-card-words' });
      words.append(el(doc, 'span', { class: 'classic-skills-card-name' }, c.label), el(doc, 'span', { class: 'classic-skills-card-time' }, c.time));
      b.append(pic, words);
      return b;
    });
    if (!shown.cards.length) nodes.push(el(doc, 'p', { class: 'classic-skills-empty' }, NOTHING_TO_LEARN));
    // OURS: with no cards the client showed nothing; the table stays one click away.
    const more = shown.more || (!shown.cards.length ? { lead: 'See all skills in', link: 'the full skill table', span: GRID_COLS, br: false } : null);
    if (more) {
      const m = el(doc, 'button', { type: 'button', class: 'classic-skills-more', 'data-br': more.br ? 'yes' : 'no' });
      m.style.setProperty('--span', String(more.span));
      m.append(el(doc, 'span', { class: 'classic-skills-more-lead' }, more.lead), el(doc, 'span', { class: 'classic-skills-more-link' }, more.link));
      nodes.push(m);
    }
    grid.replaceChildren(...nodes);
    return shown;
  }

  /** The table, redrawn when a tile's state changes; the tile in study shows its progress. */
  function renderTable(force = false) {
    const now = studyNow();
    const groups = skillTable(allSkills(), now);
    const sig = JSON.stringify(groups);
    if (force || sig !== tableSig) {
      tableSig = sig;
      const head = el(doc, 'div', { class: 'classic-skills-table-head' });
      const tableBack = el(doc, 'button', { type: 'button', class: 'classic-skill-back-btn classic-skills-table-back' }, 'Back to Skills');
      head.append(tableBack, el(doc, 'h3', { class: 'classic-skills-table-title' }, 'Table o\' skills'));
      const cats = groups.map((g) => {
        const cat = el(doc, 'section', { class: 'classic-skills-cat', 'data-cat': g.key, 'aria-label': `${g.name} skills` });
        const cols = el(doc, 'div', { class: 'classic-skills-cols' });
        for (const f of g.families) {
          const col = el(doc, 'div', { class: 'classic-skills-col', role: 'group', 'aria-label': f.name });
          for (const t of f.tiles) {
            const tile = el(doc, 'button', {
              type: 'button',
              class: 'classic-skills-tile',
              'data-skill': t.classTsid,
              'data-state': t.state,
              'aria-label': `${t.name}, ${t.words}`,
              title: `${t.name} (${t.words})`,
            });
            // The family's own Tiny Speck picture, which carries its letters as the photo's tiles do
            // (LGT, SA, AK); the letters alone where there is none (art_brain is the stand-in).
            const art = skillIconUrl(t.classTsid);
            if (!/art_brain\.svg$/.test(art)) {
              tile.dataset.art = 'yes';
              tile.append(el(doc, 'img', { class: 'classic-skills-tile-art', src: art, alt: '' }));
            } else tile.append(doc.createTextNode(t.abbr));
            if (t.sup) tile.append(el(doc, 'sup', {}, t.sup));
            col.append(tile);
          }
          cols.append(col);
        }
        cat.append(el(doc, 'p', { class: 'classic-skills-cat-name' }, g.name), cols);
        return cat;
      });
      const focused = doc.activeElement?.closest?.('.classic-skills-tile')?.dataset.skill;
      table.replaceChildren(head, ...cats);
      if (focused) table.querySelector(`.classic-skills-tile[data-skill="${focused}"]`)?.focus({ preventScroll: true });
    }
    const studying = table.querySelector('.classic-skills-tile[data-state="studying"]');
    if (studying) studying.style.setProperty('--p', String(Math.max(0, Math.min(1, Number(now.learning?.progress) || 0))));
    return groups;
  }

  function tick() {
    if (!classic() || !isOpen()) return;
    const h = paintHeader();
    if (view === 'grid') renderGrid();
    if (view === 'table') renderTable();
    // Started learning from the details: back to where they came from (onAPIComplete).
    if (pendingStart && h.kind !== 'none' && h.kind !== 'unlearn' && h.classTsid === pendingStart) {
      pendingStart = null;
      showFrom();
    }
  }

  const click = () => { try { engine?.playSound?.('CLICK_SUCCESS', { volume: 0.4 }); } catch { /* audio off */ } };

  function showDetail(classTsid, { fromLink = false, sound = true, origin = null } = {}) {
    if (!classTsid) return;
    if (view !== 'detail') {
      scrolls[view] = scroller().scrollTop;
      from = origin || view;
    }
    view = 'detail';
    detail = classTsid;
    pendingStart = null;
    // A link already opened its skill (with the filters reset, as Modern does); a card opens it here.
    if (!fromLink) openOnlySkillInPanel(classTsid, body);
    // Hidden by the panel's search or a filter (the header's name, a skill picked elsewhere): clear them, as a link does.
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

  /** Back to a card or a tile: the one the details were showing gets the focus. */
  function focusSkill(box, selector, was) {
    const node = was ? box.querySelector(`${selector}[data-skill="${was}"]`) : null;
    if (node) {
      node.focus({ preventScroll: true });
      node.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function showGrid({ focus = true } = {}) {
    const was = detail;
    if (view === 'table') scrolls.table = table.scrollTop;
    view = 'grid';
    detail = null;
    pendingStart = null;
    openOnlySkillInPanel(null, body);
    renderGrid(true);
    setView();
    paintHeader();
    grid.scrollTop = scrolls.grid;
    if (focus) focusSkill(grid, '.classic-skills-card', was);
  }

  function showTable({ focus = true } = {}) {
    const was = detail;
    if (view === 'grid') scrolls.grid = grid.scrollTop;
    const fresh = view === 'grid';
    view = 'table';
    detail = null;
    pendingStart = null;
    openOnlySkillInPanel(null, body);
    renderTable(true);
    setView();
    paintHeader();
    table.scrollTop = fresh ? 0 : scrolls.table;
    if (!focus) return;
    if (was) focusSkill(table, '.classic-skills-tile', was);
    else table.querySelector('.classic-skills-table-back')?.focus({ preventScroll: true });
  }

  const showFrom = () => (from === 'table' ? showTable() : showGrid());

  // The grid: a card opens its details (a locked one too: the client showed its info, ImaginationSkillElementUI.as 165-173);
  // the "more" tile opens the full table (onMoreClick 685-688).
  grid.addEventListener('click', (e) => {
    const c = e.target?.closest?.('.classic-skills-card');
    if (c) { showDetail(c.dataset.skill, { origin: 'grid' }); return; }
    if (e.target?.closest?.('.classic-skills-more')) { click(); showTable(); }
  });
  table.addEventListener('click', (e) => {
    const t = e.target?.closest?.('.classic-skills-tile');
    if (t) { showDetail(t.dataset.skill, { origin: 'table' }); return; }
    if (e.target?.closest?.('.classic-skills-table-back')) { click(); showGrid({ focus: false }); }
  });
  // In the details, the open row's name does not fold it away.
  body.addEventListener('click', (e) => {
    if (!classic()) return;
    const head = e.target?.closest?.('.skill-row-head');
    if (head) {
      e.stopPropagation();
      e.preventDefault();
      if (view !== 'detail') showDetail(head.closest('.skill-row')?.dataset.skill);
      return;
    }
    // Start learning (or resume) from the details: back to the grid or the table once it starts.
    const action = e.target?.closest?.('.skill-action');
    const startable = action?.closest('.skill-row')?.classList;
    if (detail && action && !action.disabled && (startable?.contains('is-available') || startable?.contains('is-paused'))) pendingStart = detail;
  }, true);
  // A skill link in the details (Requires, Path, Leads to): its own details. Modern's handler (which
  // stops the click there) adds it to the open rows (focusSkillInPanel); then only it stays open.
  body.addEventListener('click', (e) => {
    if (!classic() || !detail || !e.target?.closest?.('.skill-link')) return;
    const was = detail;
    win.setTimeout(() => {
      if (detail !== was) return;
      const open = skillPanelUiState().expanded.filter((id) => id !== was);
      const next = open[open.length - 1];
      if (!next) return;
      openOnlySkillInPanel(next, body);
      showDetail(next, { fromLink: true });
    }, 0);
  }, true);
  backBtn.addEventListener('click', () => {
    click();
    showFrom();
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

  // The face menu's Skills opened the web site's skill table (PlayerInfoButtons.as:30,
  // TSFrontController.openSkillsPage): in Classic it opens the table here. Its button clicks Skills
  // open; with Skills already open that would close it, so the table is shown and the menu closed here.
  doc.addEventListener('click', (e) => {
    if (!classic()) return;
    const b = e.target?.closest?.('#player-menu .pm-buttons button');
    if (!b || b.textContent.trim() !== 'Skills') return;
    if (!isOpen()) { openTo = 'table'; return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    doc.getElementById('player-menu-btn')?.click();
    showTable();
  }, true);

  // Opened: a skill already picked for it (focusSkillInPanel: a link, the familiar, Unlearning)
  // shows in its details; the face menu's Skills shows the table; otherwise the grid. Closed: back
  // to the grid for next time.
  let wasOpen = isOpen();
  new win.MutationObserver(() => {
    const open = isOpen();
    if (open === wasOpen) return;
    wasOpen = open;
    if (open) {
      win.clearInterval(timer);
      timer = win.setInterval(tick, 500);
      const to = openTo;
      openTo = null;
      if (!classic()) return;
      const picked = skillPanelUiState().expanded;
      view = 'grid';
      from = 'grid';
      detail = null;
      scrolls.grid = 0;
      scrolls.table = 0;
      if (to === 'table') showTable();
      else if (picked.length) { renderGrid(true); showDetail(picked[picked.length - 1], { sound: false, origin: 'grid' }); }
      else showGrid({ focus: false });
      paintHeader();
    } else {
      win.clearInterval(timer);
      timer = 0;
      if (detail) openOnlySkillInPanel(null, body);
      view = 'grid';
      detail = null;
      pendingStart = null;
      setView();
    }
  }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });

  onUiModeChange(() => {
    if (!classic()) { view = 'grid'; detail = null; }
    setView();
    if (classic() && isOpen()) { paintHeader(); if (view === 'grid') renderGrid(true); }
  });
  setView();

  api = {
    view: () => view,
    from: () => from,
    detail: () => detail,
    header: () => header,
    showDetail,
    showGrid,
    showTable,
    onEscape(e) {
      if (!classic() || !isOpen() || e.repeat || hub?.isOpen?.()) return;
      if (typingIn(e.target) || typingIn(doc.activeElement)) return;
      // Only when Skills is the window on top: a dialog over it takes its own Esc.
      if (topWindow(doc, win) !== panel) return;
      const step = skillsEscStep(view, from);
      if (step === 'grid' || step === 'table') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (step === 'table') showTable();
        else showGrid();
        return;
      }
      // The grid: the game closes it (after anything it closes first), then the menu comes back.
      win.setTimeout(() => {
        if (classic() && !isOpen() && hub && !hub.isOpen()) hub.open();
      }, 0);
    },
  };
  win.groddleClassicSkills = api;
  return api;
}
