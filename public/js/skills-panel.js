/**
 * Skills panel DOM for the full 105-skill tree: search, status filters,
 * category picker, category/family grouping with rank pips, expandable
 * skill rows (description, what it does in this remake, prerequisite
 * checklist, path, what it leads to) and the study/emblem actions.
 *
 * Rules live in skill-tree.js and skills.js; game.js only passes state,
 * context and action callbacks. The toolbar is built once and kept across
 * the periodic re-renders so typing and focus survive the study ticker.
 */

import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_ORDER,
  filterSkillTree,
  skillTreeCounts,
  skillTitle,
} from './skill-tree.js';
import { formatStudyTime, listStudyQueue } from './skills.js';
import { getSkillCatalog } from './content-catalogs.js';

const ui = {
  query: '',
  filter: 'all',
  category: 'all',
  expanded: new Set(),
  focus: null,
};

const FILTERS = [
  ['all', 'All'],
  ['available', 'Ready'],
  ['learning', 'Learning'],
  ['learned', 'Learned'],
  ['locked', 'Locked'],
];

const STATUS_LABEL = {
  learned: 'Learned',
  studying: 'Studying',
  paused: 'Paused',
  available: 'Ready to study',
  locked: 'Locked',
};

const REASON_TEXT = {
  level: (need) => `Reach level ${need}`,
  req_skill: (need) => `Learn ${skillTitle(getSkillCatalog()[need]) || need} first`,
  req_quest: () => 'Finish its quest first',
  req_achievement: () => 'Earn its badge first',
  req_upgrade: () => 'Needs an imagination upgrade',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Current UI filter state (exposed for QA attributes). */
export function skillPanelUiState() {
  return { query: ui.query, filter: ui.filter, category: ui.category, expanded: [...ui.expanded] };
}

/** Open the panel focused on one skill (QA routes, prerequisite links). */
export function focusSkillInPanel(classTsid) {
  if (!getSkillCatalog()[classTsid]) return;
  ui.query = '';
  ui.filter = 'all';
  ui.category = 'all';
  ui.expanded.add(classTsid);
  ui.focus = classTsid;
}

function buildToolbar(box, rerender) {
  const bar = el('div', 'skill-tree-toolbar');
  const search = el('input', 'skill-tree-search');
  search.type = 'search';
  search.placeholder = 'Search skills';
  search.setAttribute('aria-label', 'Search skills');
  search.value = ui.query;
  search.addEventListener('input', () => {
    ui.query = search.value;
    rerender();
  });
  bar.appendChild(search);

  const category = el('select', 'skill-tree-category');
  category.setAttribute('aria-label', 'Skill category');
  category.appendChild(new Option('All categories', 'all'));
  for (const id of SKILL_CATEGORY_ORDER) category.appendChild(new Option(SKILL_CATEGORIES[id], String(id)));
  category.value = String(ui.category);
  category.addEventListener('change', () => {
    ui.category = category.value;
    rerender();
  });
  bar.appendChild(category);

  const chips = el('div', 'skill-tree-filters');
  chips.setAttribute('role', 'tablist');
  for (const [id, label] of FILTERS) {
    const chip = el('button', 'skill-tree-chip');
    chip.type = 'button';
    chip.dataset.filter = id;
    chip.setAttribute('role', 'tab');
    chip.innerHTML = `${label} <b></b>`;
    chip.addEventListener('click', () => {
      ui.filter = id;
      rerender();
    });
    chips.appendChild(chip);
  }
  bar.appendChild(chips);
  box.appendChild(bar);
  return bar;
}

function rankPips(family, state) {
  const pips = el('span', 'skill-pips');
  for (const entry of family.allEntries) {
    const pip = el('i', `skill-pip is-${entry.status}`);
    pip.title = `${entry.title}: ${STATUS_LABEL[entry.status]}`;
    pips.appendChild(pip);
  }
  return pips;
}

/**
 * ImaginationSkillDetailsUI.as setLearnButton 222-232: while another skill is
 * studying, starting or resuming this one pauses it, and an accelerated study
 * warns that the speed goes with it. The original showed this as the learn
 * button's tooltip; here it sits above the button and is its title too.
 */
export function switchStudyNote(entry, active) {
  if (!active || active.classTsid === entry.classTsid) return null;
  if (entry.status !== 'available' && entry.status !== 'paused') return null;
  if (active.isAccelerated) {
    return {
      kind: 'accelerated',
      lines: ["You're learning at an accelerated rate.", 'Switching to start this skill will lose that speed!'],
    };
  }
  const name = skillTitle(getSkillCatalog()[active.classTsid]) || active.classTsid;
  return { kind: 'paused', lines: [`Your progress on ${name} will be paused`] };
}

/**
 * G222: the learn button's own words (ImaginationSkillDetailsUI.as
 * setLearnButton 203-246): "Start learning this skill" (210); with another
 * skill studying, "Switch to start/resume learning this instead" (225) and
 * the switch note above; a paused skill with nothing else studying,
 * "Resume learning this skill" with the tip "You've got this skill on pause
 * at the moment" (234-236).
 */
export function learnButtonText(entry, active) {
  const paused = entry?.status === 'paused';
  const other = active && active.classTsid !== entry?.classTsid ? active : null;
  if (other) {
    return {
      label: `Switch to ${paused ? 'resume' : 'start'} learning this instead`,
      note: switchStudyNote(entry, other),
    };
  }
  if (paused) {
    return { label: 'Resume learning this skill', note: { kind: 'on-pause', lines: ["You've got this skill on pause at the moment"] } };
  }
  return { label: 'Start learning this skill', note: null };
}

/**
 * G222: the study bar's look (ImaginationSkillsUI.as updateSkillTraining
 * 401-460, colours 200-211, buildArrows 241-263, drawArrowsMask 501-506,
 * animateArrows 508-517). Learning is the green bar; accelerated learning is the yellow bar with the gold arrows
 * scrolling across its filled part (a 17x25 arrow every 24 px, one step in
 * 0.4 s, masked to the bar); paused studies (never drawn by the client, which
 * showed only the one in training) keep the green, dimmed; unlearning is the
 * client's teal bar filling from the right (unlearn_pb 0x75c1c2 to
 * 0x42a5a8, tip 0x4d9899 to 0x4e989a, DIRECTION_RIGHT_TO_LEFT:
 * ImaginationSkillsUI.as 208-211, 449-450; G230; style.css).
 */
export function studyBarKind(study) {
  if (!study) return 'learn';
  if (study.isPaused) return 'paused';
  return study.isAccelerated ? 'fast' : 'learn';
}

function studyBar(progress, kind) {
  const bar = el('div', `q-bar skill-study-bar is-${kind}`);
  bar.dataset.barKind = kind;
  const fill = el('i');
  fill.style.width = `${Math.round((Number(progress) || 0) * 100)}%`;
  if (kind === 'fast') fill.appendChild(el('span', 'skill-study-arrows'));
  bar.appendChild(fill);
  return bar;
}

function switchNoteNode(note) {
  const node = el('div', `skill-switch-note is-${note.kind}`);
  node.dataset.switchNote = note.kind;
  note.lines.forEach((line, index) => {
    if (index) node.appendChild(document.createElement('br'));
    node.appendChild(document.createTextNode(line));
  });
  return node;
}

function actionButton(entry, ctx, actions, active = null) {
  const btn = el('button', 'content-action-btn skill-action');
  btn.type = 'button';
  if (entry.status === 'learned') return null;
  if (entry.status === 'studying') {
    btn.textContent = 'Pause study';
    btn.addEventListener('click', () => actions.pause(entry.classTsid));
    return btn;
  }
  if (entry.status === 'paused') {
    btn.textContent = learnButtonText(entry, active).label;
    btn.classList.add('btn-glitch-primary');
    btn.addEventListener('click', () => actions.resume(entry.classTsid));
    return btn;
  }
  if (entry.status === 'available') {
    btn.textContent = learnButtonText(entry, active).label;
    btn.classList.add('btn-glitch-primary');
    btn.addEventListener('click', () => actions.start(entry.classTsid));
    return btn;
  }
  // Locked: offer the emblem spend when that is the missing piece.
  const emblemRow = entry.prerequisites.find((row) => row.kind === 'emblem' && !row.met);
  if (emblemRow && entry.emblem && (ctx.emblemCount?.(entry.emblem.giant) || 0) > 0) {
    btn.textContent = `Spend an Emblem of ${ctx.giantName?.(entry.emblem.giant) || entry.emblem.giant}`;
    btn.classList.add('skill-emblem-btn');
    btn.addEventListener('click', () => actions.spendEmblem(entry.classTsid));
    return btn;
  }
  const reason = entry.check?.reason;
  const text = REASON_TEXT[reason]?.(entry.check?.need) || 'Locked';
  btn.textContent = text;
  btn.disabled = true;
  return btn;
}

/**
 * The skill's Giants from inc_data_skills.js `giants` (primary first): favor
 * spent at a primary Giant's shrine buys 10 s of study a point, a secondary
 * Giant 7 s, any other 5 s (get_skill_info).
 */
export function studyGiantsLine(def, ctx = {}) {
  const rows = Object.entries(def?.giants || {});
  if (!rows.length) return '';
  const name = (id) => ctx.giantName?.(id) || id;
  const primary = rows.filter(([, g]) => Math.trunc(Number(g?.primary) || 0)).map(([id]) => name(id));
  const secondary = rows.filter(([, g]) => !Math.trunc(Number(g?.primary) || 0)).map(([id]) => name(id));
  const parts = [];
  if (primary.length) parts.push(`Primary Giant: ${primary.join(', ')}`);
  if (secondary.length) parts.push(`also ${secondary.join(', ')}`);
  return `${parts.join(' · ')}. Spend favor at a shrine to learn faster.`;
}

function prereqList(entry, rerender) {
  const list = el('ul', 'skill-prereqs');
  for (const row of entry.prerequisites) {
    const item = el('li', row.met ? 'is-met' : 'is-missing');
    item.dataset.kind = row.kind;
    const mark = el('span', 'skill-prereq-mark', row.met ? '✓' : '•');
    mark.setAttribute('aria-hidden', 'true');
    item.appendChild(mark);
    if (row.kind === 'skill') {
      const link = el('button', 'skill-link', row.label);
      link.type = 'button';
      link.addEventListener('click', (event) => {
        event.stopPropagation();
        focusSkillInPanel(row.id);
        rerender();
      });
      item.appendChild(link);
    } else {
      item.appendChild(el('span', '', row.label));
    }
    item.appendChild(el('span', 'skill-sr', row.met ? ' (done)' : ' (needed)'));
    list.appendChild(item);
  }
  return list;
}

function skillLinks(ids, rerender) {
  const wrap = el('span', 'skill-links');
  ids.forEach((id, index) => {
    if (index) wrap.appendChild(document.createTextNode(' → '));
    const def = getSkillCatalog()[id];
    const link = el('button', 'skill-link', skillTitle(def) || id);
    link.type = 'button';
    link.addEventListener('click', (event) => {
      event.stopPropagation();
      focusSkillInPanel(id);
      rerender();
    });
    wrap.appendChild(link);
  });
  return wrap;
}

/** One short line under a row's name: what blocks it, or that it is not here yet. */
function rowHint(entry) {
  if (entry.status === 'locked') {
    const missing = entry.prerequisites.find((row) => !row.met);
    if (missing) {
      const text = missing.kind === 'skill'
        ? `Needs ${missing.label}`
        : missing.kind === 'level'
          ? `Needs ${missing.label}`
          : missing.kind === 'emblem'
            ? missing.label
            : missing.kind === 'quest'
              ? `Quest: ${missing.label}`
              : missing.kind === 'upgrade'
                ? 'Needs an upgrade'
                : `Needs the ${missing.label} badge`;
      return { kind: 'locked', text };
    }
  }
  if (entry.remake.status === 'later' || entry.remake.status === 'multiplayer') {
    return { kind: entry.remake.status, text: entry.remake.label };
  }
  return null;
}

function skillRow(entry, ctx, actions, rerender, active = null) {
  const open = ui.expanded.has(entry.classTsid);
  const row = el('div', `skill-row is-${entry.status}${open ? ' is-open' : ''}`);
  row.dataset.skill = entry.classTsid;
  const head = el('button', 'skill-row-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(open));
  const label = el('span', 'skill-row-label');
  label.appendChild(el('span', 'skill-row-name', entry.title));
  const why = rowHint(entry);
  if (why) label.appendChild(el('span', `skill-row-why is-${why.kind}`, why.text));
  head.appendChild(label);
  const badge = el('span', `skill-badge is-${entry.status}`, STATUS_LABEL[entry.status]);
  head.appendChild(badge);
  const time = entry.status === 'studying' || entry.status === 'paused'
    ? `${formatStudyTime(entry.study.remainingSeconds)} left`
    : entry.status === 'learned'
      ? ''
      : formatStudyTime(entry.seconds);
  head.appendChild(el('span', 'skill-row-time', time));
  head.addEventListener('click', () => {
    if (ui.expanded.has(entry.classTsid)) ui.expanded.delete(entry.classTsid);
    else ui.expanded.add(entry.classTsid);
    rerender();
  });
  row.appendChild(head);

  if (entry.status === 'studying' || entry.status === 'paused') {
    row.appendChild(studyBar(entry.study.progress, studyBarKind(entry.study)));
  }

  if (!open) return row;
  const body = el('div', 'skill-row-body');
  body.appendChild(el('p', 'skill-desc', entry.def.description || ''));
  const remake = el('div', `skill-remake is-${entry.remake.status}`);
  remake.appendChild(el('span', 'skill-remake-label', entry.remake.label));
  remake.appendChild(el('span', 'skill-remake-note', entry.remake.note));
  body.appendChild(remake);
  if (entry.prerequisites.length) {
    body.appendChild(el('div', 'skill-sub', 'Requires'));
    body.appendChild(prereqList(entry, rerender));
  }
  if (entry.chain.length > 1) {
    const path = el('div', 'skill-path');
    path.appendChild(el('span', 'skill-sub', 'Path '));
    path.appendChild(skillLinks(entry.chain, rerender));
    body.appendChild(path);
  }
  if (entry.unlocks.length) {
    const next = el('div', 'skill-path');
    next.appendChild(el('span', 'skill-sub', 'Leads to '));
    const links = el('span', 'skill-links');
    entry.unlocks.forEach((id, index) => {
      if (index) links.appendChild(document.createTextNode(', '));
      const link = el('button', 'skill-link', skillTitle(getSkillCatalog()[id]) || id);
      link.type = 'button';
      link.addEventListener('click', (event) => {
        event.stopPropagation();
        focusSkillInPanel(id);
        rerender();
      });
      links.appendChild(link);
    });
    next.appendChild(links);
    body.appendChild(next);
  }
  const meta = [`${(entry.def.pointCost || 0).toLocaleString()} points`];
  const giants = Object.entries(entry.def.giants || {})
    .sort((a, b) => (b[1]?.primary || 0) - (a[1]?.primary || 0))
    .map(([id, g]) => `${ctx.giantName?.(id) || id}${g?.primary ? ' (primary)' : ''}`);
  if (giants.length) meta.push(giants.join(', '));
  body.appendChild(el('div', 'skill-meta', meta.join(' · ')));
  const btn = actionButton(entry, ctx, actions, active);
  const note = btn && !btn.disabled && (entry.status === 'available' || entry.status === 'paused')
    ? learnButtonText(entry, active).note
    : null;
  if (note) {
    body.appendChild(switchNoteNode(note));
    btn.title = note.lines.join('\n');
    btn.dataset.switchNote = note.kind;
  }
  if (btn) body.appendChild(btn);
  const unlearn = unlearnButton(entry, ctx, actions, rerender);
  if (unlearn) body.appendChild(unlearn);
  row.appendChild(body);
  return row;
}

/**
 * Unlearn (players/inc_skills.js skills_unlearn) for a learned or queued
 * skill, when the Unlearning Ability card is owned. Two clicks: the first
 * spells out the time and that nothing is refunded.
 */
function unlearnButton(entry, ctx, actions, rerender) {
  const check = ctx.unlearning?.check?.(entry.classTsid);
  if (!check?.visible || typeof actions.unlearn !== 'function') return null;
  const btn = el('button', 'content-action-btn skill-unlearn-btn');
  btn.type = 'button';
  btn.dataset.unlearn = entry.classTsid;
  if (!check.ok) {
    btn.textContent = 'Unlearn';
    btn.disabled = true;
    btn.title = check.msg || '';
    return btn;
  }
  const time = formatStudyTime(check.seconds);
  if (ui.confirmUnlearn === entry.classTsid) {
    btn.textContent = `Really unlearn? ${time}, no refund`;
    btn.classList.add('is-confirm');
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      ui.confirmUnlearn = null;
      actions.unlearn(entry.classTsid);
      rerender();
    });
  } else {
    btn.textContent = `Unlearn · ${time}`;
    btn.title = check.quest ? 'Its skill quest in your log will be removed too.' : 'Forget this skill to free up your brain.';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      ui.confirmUnlearn = entry.classTsid;
      rerender();
    });
  }
  return btn;
}

/**
 * Render (or refresh) the Skills panel.
 * @param {{ box: HTMLElement, meta?: HTMLElement|null, state: object, ctx: object, actions: { start: Function, pause: Function, resume: Function, spendEmblem: Function } }} args
 */
export function renderSkillTreePanel({ box, meta, state, ctx, actions, now = Date.now() }) {
  if (!box) return;
  const rerender = () => renderSkillTreePanel({ box, meta, state, ctx, actions, now: Date.now() });
  let study = box.querySelector(':scope > .skill-tree-study');
  let toolbar = box.querySelector(':scope > .skill-tree-toolbar');
  let list = box.querySelector(':scope > .skill-tree-list');
  if (!study || !toolbar || !list) {
    box.innerHTML = '';
    study = el('div', 'skill-tree-study');
    box.appendChild(study);
    toolbar = buildToolbar(box, rerender);
    list = el('div', 'skill-tree-list');
    box.appendChild(list);
  }

  const counts = skillTreeCounts(state, ctx, now);
  if (meta) {
    meta.textContent = `${counts.learned} learned · ${counts.available} ready · ${counts.learning} learning · ${counts.locked} locked · ${counts.all} skills`;
  }
  for (const chip of toolbar.querySelectorAll('.skill-tree-chip')) {
    const id = chip.dataset.filter;
    chip.classList.toggle('is-active', id === ui.filter);
    chip.setAttribute('aria-selected', String(id === ui.filter));
    const n = id === 'all' ? counts.all : counts[id] ?? 0;
    chip.querySelector('b').textContent = String(n);
  }
  const search = toolbar.querySelector('.skill-tree-search');
  if (search && search.value !== ui.query && document.activeElement !== search) search.value = ui.query;
  const category = toolbar.querySelector('.skill-tree-category');
  if (category && category.value !== String(ui.category)) category.value = String(ui.category);

  // Active and paused studies stay pinned above the tree.
  study.innerHTML = '';
  const unlearning = ctx.unlearning?.active;
  if (unlearning) {
    const card = el('div', 'skill-study-card unlearning');
    card.dataset.unlearning = unlearning.classTsid;
    const title = el('div', 'skill-study-title');
    title.appendChild(el('b', '', unlearning.name || unlearning.classTsid));
    title.appendChild(el('span', '', 'Unlearning'));
    card.appendChild(title);
    card.appendChild(el('div', 'skill-study-time', `${formatStudyTime(unlearning.remainingSeconds)} remaining · ${Math.round(unlearning.progress * 100)}%`));
    card.appendChild(studyBar(unlearning.progress, 'unlearn'));
    if (typeof actions.cancelUnlearn === 'function') {
      const stop = el('button', 'content-action-btn', 'Stop unlearning');
      stop.type = 'button';
      stop.addEventListener('click', () => actions.cancelUnlearn(unlearning.classTsid));
      card.appendChild(stop);
    }
    study.appendChild(card);
  }
  const queueRows = listStudyQueue(state, now);
  const active = queueRows.find((row) => !row.isPaused) || null;
  for (const row of queueRows) {
    const def = getSkillCatalog()[row.classTsid];
    if (!def) continue;
    const card = el('div', `skill-study-card ${row.isPaused ? 'paused' : 'studying'}`);
    const title = el('div', 'skill-study-title');
    title.appendChild(el('b', '', skillTitle(def)));
    title.appendChild(el('span', '', row.isPaused ? 'Paused' : row.isAccelerated ? 'Accelerated!' : 'Studying'));
    card.appendChild(title);
    // imagination_skills_time_fast: the accelerated time has its own style (ImaginationSkillsUI.as 440-441).
    card.appendChild(el('div', `skill-study-time${row.isAccelerated ? ' is-fast' : ''}`, `${formatStudyTime(row.remainingSeconds)} remaining · ${Math.round(row.progress * 100)}%`));
    card.appendChild(studyBar(row.progress, studyBarKind(row)));
    if (!row.isPaused) {
      const giants = studyGiantsLine(def, ctx);
      if (giants) {
        const line = el('div', 'skill-study-time skill-study-giants', giants);
        // items/include/shrines.js giant_tips[3] (its dash made a comma, house style)
        line.title = 'Spending favor with any Giant speeds up skill learning, but spending favor with the Primary Giant of a given skill will speed it up the most.';
        card.appendChild(line);
      }
    }
    // G222: a paused card's button uses the learn button's words (setLearnButton 225, 236).
    const btn = el('button', 'content-action-btn', row.isPaused ? learnButtonText({ classTsid: row.classTsid, status: 'paused' }, active).label : 'Pause study');
    btn.type = 'button';
    btn.addEventListener('click', () => (row.isPaused ? actions.resume(row.classTsid) : actions.pause(row.classTsid)));
    card.appendChild(btn);
    study.appendChild(card);
  }

  const tree = filterSkillTree(state, { query: ui.query, filter: ui.filter, category: ui.category }, ctx, now);
  list.innerHTML = '';
  if (!tree.total) {
    list.appendChild(el('div', 'skill-tree-empty', 'No skills match. Try another word or filter.'));
  }
  for (const group of tree.groups) {
    const section = el('section', 'skill-cat');
    section.dataset.category = String(group.id);
    section.appendChild(el('h3', 'skill-cat-title', group.name));
    for (const family of group.families) {
      const single = family.allEntries.length === 1;
      const fam = el('div', `skill-family${single ? ' is-single' : ''}`);
      if (!single) {
        const head = el('div', 'skill-family-head');
        head.appendChild(el('span', 'skill-family-name', family.name));
        head.appendChild(rankPips(family, state));
        fam.appendChild(head);
      }
      for (const entry of family.entries) fam.appendChild(skillRow(entry, ctx, actions, rerender, active));
      section.appendChild(fam);
    }
    list.appendChild(section);
  }

  if (ui.focus) {
    const target = list.querySelector(`[data-skill="${ui.focus}"]`);
    ui.focus = null;
    target?.scrollIntoView?.({ block: 'nearest' });
  }
  box.dataset.skillFilter = ui.filter;
  box.dataset.skillQuery = ui.query;
  box.dataset.skillShown = String(tree.total);
}
