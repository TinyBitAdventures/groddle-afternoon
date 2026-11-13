/**
 * The quest pill (player report 37; rules and sources in js/quest-plate.js).
 *
 * While one of the quest cards (QUEST_PLATE_CARDS) is up, the street nameplate
 * shows the quest on one line instead of the street, the card itself folds away,
 * and its step or narration shows once as a caption under the pill. The pill
 * opens the card under it; Escape or a click elsewhere closes it. Its Leave is the
 * card's own Leave. Nothing about the quests changes: each owner keeps drawing
 * its card as before, and this reads it.
 *
 * Where the nameplate is not shown (the new-player scenes hide it) the card stays
 * as it was.
 *
 * Canvas data: questPlate (the adopted card's id), questPlateOpen, questCaption.
 */
import { DOT_DONE, QUEST_PLATE_CARDS, captionMs, compactCount, dotCount, nextCaption, tidy } from '../quest-plate.js?v=691cad9e';

export const QUEST_PLATE_FEATURE_ID = 'quest-plate';
const SYNC_MS = 150;
const CAPTION_ZONE = 'quest-caption';
const GAP = 6;

let engineRef = null;
let ui = null; // { plate, open, icon, title, stage, timer, progress, leave, caption }
let adopted = null; // { cfg, card }
let seen = { step: '', line: '' };
let caption = { text: '', until: 0, shown: false };
let isOpen = false;
let lastSync = 0;
let zoneKey = '';

const doc = () => (typeof document === 'undefined' ? null : document);

function setData(key, value) {
  engineRef?.setData?.(key, value);
}

function build() {
  const d = doc();
  if (ui || !d) return ui;
  const plateHost = d.getElementById('street-nameplate');
  if (!plateHost) return null;
  const plate = d.createElement('div');
  plate.id = 'quest-plate';
  plate.className = 'quest-plate';
  plate.setAttribute('role', 'group');
  plate.setAttribute('aria-label', 'Quest');
  plate.hidden = true;
  plate.innerHTML = `
    <button type="button" class="qp-open" aria-expanded="false" title="Show the quest card">
      <span class="qp-icon" aria-hidden="true"></span>
      <span class="qp-title"></span>
      <span class="qp-stage"></span>
      <time class="qp-timer" hidden></time>
      <span class="qp-progress" hidden></span>
    </button>
    <button type="button" class="qp-leave">Leave</button>`;
  plateHost.appendChild(plate);
  const cap = d.createElement('p');
  cap.id = 'quest-caption';
  cap.className = 'quest-caption';
  cap.setAttribute('role', 'status');
  cap.setAttribute('aria-live', 'polite');
  cap.hidden = true;
  (d.getElementById('game-root') || d.body).appendChild(cap);
  ui = {
    plateHost,
    plate,
    open: plate.querySelector('.qp-open'),
    icon: plate.querySelector('.qp-icon'),
    title: plate.querySelector('.qp-title'),
    stage: plate.querySelector('.qp-stage'),
    timer: plate.querySelector('.qp-timer'),
    progress: plate.querySelector('.qp-progress'),
    leave: plate.querySelector('.qp-leave'),
    caption: cap,
  };
  // The nameplate's own click (Classic opens the Map) stays the street's.
  plate.addEventListener('click', (e) => e.stopPropagation());
  ui.open.addEventListener('click', () => setOpen(!isOpen));
  ui.leave.addEventListener('click', () => {
    const leave = adopted ? adopted.card.querySelector(adopted.cfg.leave) : null;
    setOpen(false);
    leave?.click();
  });
  d.addEventListener('keydown', (e) => {
    if (!isOpen || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    ui.open.focus?.({ preventScroll: true });
  }, true);
  d.addEventListener('pointerdown', (e) => {
    if (!isOpen || !adopted) return;
    if (adopted.card.contains(e.target) || plate.contains(e.target)) return;
    setOpen(false);
  }, true);
  return ui;
}

/** A visible element (not hidden, laid out). */
function shown(el) {
  if (!el || el.hidden || !el.isConnected) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true });
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

/** The quest card that is up now: its owner shows it (no hidden attribute). */
function currentCard() {
  const d = doc();
  for (const cfg of QUEST_PLATE_CARDS) {
    const card = d.getElementById(cfg.id);
    if (card && !card.hidden && card.isConnected) return { cfg, card };
  }
  return null;
}

/** A conversation, award or other modal is up: the caption waits under it. */
function modalUp() {
  const d = doc();
  for (const m of d.querySelectorAll('[aria-modal="true"]')) if (shown(m)) return true;
  return Boolean(d.querySelector('#award-screen.is-visible:not([hidden])'));
}

function read(card, sel) {
  return sel ? card.querySelector(sel) : null;
}

function setOpen(on) {
  isOpen = Boolean(on && adopted);
  if (ui) ui.open.setAttribute('aria-expanded', String(isOpen));
  if (adopted) {
    adopted.card.classList.toggle('qp-open', isOpen);
    if (isOpen) placeCard();
  }
  setData('questPlateOpen', isOpen ? '1' : '0');
}

/** The pill's box (in Modern it fills the nameplate; Classic puts it in the middle of the header). */
function plateRect() {
  const r = ui.plate.getBoundingClientRect();
  return r.width ? r : ui.plateHost.getBoundingClientRect();
}

/** The open card sits under the pill, centred on it, inside its own host. */
function placeCard() {
  if (!adopted || !ui) return;
  const host = adopted.card.offsetParent || adopted.card.parentElement;
  if (!host) return;
  const hr = host.getBoundingClientRect();
  const pr = plateRect();
  const w = adopted.card.offsetWidth || 0;
  const cx = pr.left + pr.width / 2 - hr.left;
  const left = Math.max(8, Math.min(cx - w / 2, hr.width - w - 8));
  const top = Math.max(8, pr.bottom - hr.top + GAP + 2);
  adopted.card.style.setProperty('--qp-left', `${Math.round(left)}px`);
  adopted.card.style.setProperty('--qp-top', `${Math.round(top)}px`);
}

function release() {
  if (adopted) {
    adopted.card.classList.remove('qp-card', 'qp-open');
    adopted.card.style.removeProperty('--qp-left');
    adopted.card.style.removeProperty('--qp-top');
  }
  adopted = null;
  isOpen = false;
  seen = { step: '', line: '' };
  if (ui) {
    ui.plate.hidden = true;
    ui.plateHost.classList.remove('is-quest');
    ui.open.setAttribute('aria-expanded', 'false');
    hideCaption();
  }
  setData('questPlate', '');
  setData('questPlateOpen', '0');
}

function adopt(found) {
  release();
  adopted = found;
  found.card.classList.add('qp-card');
  ui.open.setAttribute('aria-controls', found.cfg.id);
  ui.icon.dataset.key = '';
  setData('questPlate', found.cfg.id);
}

function fillIcon(card, cfg) {
  const src = read(card, cfg.icon);
  let key = '';
  if (src?.tagName === 'IMG' && src.getAttribute('src') && !src.hidden) key = `img:${src.getAttribute('src')}`;
  else if (src && tidy(src.textContent)) key = `txt:${tidy(src.textContent)}`;
  if (ui.icon.dataset.key === key) return;
  ui.icon.dataset.key = key;
  ui.icon.textContent = '';
  if (key.startsWith('img:')) {
    const img = doc().createElement('img');
    img.alt = '';
    img.src = src.src;
    ui.icon.appendChild(img);
  } else if (key) ui.icon.textContent = key.slice(4);
  ui.icon.hidden = !key;
}

function fillProgress(card, cfg) {
  const p = ui.progress;
  let html = '';
  if (cfg.dots) {
    const dots = [...card.querySelectorAll(cfg.dots)];
    const done = (d) => DOT_DONE.some((c) => d.classList.contains(c));
    const { done: n, total } = dotCount(dots.map((d) => ({ classes: [...d.classList] })));
    if (total) {
      html = total <= 8
        ? `<span class="qp-dots" role="img" aria-label="${n} of ${total}">${dots.map((d) => `<i${done(d) ? ' class="is-done"' : ''}></i>`).join('')}</span>`
        : `${n}/${total}`;
    }
  } else if (cfg.count) {
    html = escapeHtml(compactCount(read(card, cfg.count)?.textContent, cfg.unit));
    const note = cfg.countNote ? read(card, cfg.countNote) : null;
    if (html && note && !note.hidden && note.dataset.short) html += ` · ${escapeHtml(note.dataset.short)}`;
  } else if (cfg.progress) {
    html = escapeHtml(compactCount(read(card, cfg.progress)?.textContent));
  }
  if (p.dataset.html !== html) {
    p.dataset.html = html;
    p.innerHTML = html;
  }
  p.hidden = !html;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fillPlate() {
  const { card, cfg } = adopted;
  fillIcon(card, cfg);
  const title = tidy(read(card, cfg.title)?.textContent);
  const stage = tidy(read(card, cfg.stage)?.textContent);
  if (ui.title.textContent !== title) ui.title.textContent = title;
  // A kicker that only repeats the title (An Autumn Day / AN AUTUMN DAY) is left out.
  const stageText = stage && stage.toLowerCase() !== title.toLowerCase() ? stage : '';
  if (ui.stage.textContent !== stageText) ui.stage.textContent = stageText;
  ui.stage.hidden = !stageText;
  const t = read(card, cfg.timer);
  const timerOn = Boolean(t && !t.hidden && tidy(t.textContent));
  ui.timer.hidden = !timerOn;
  if (timerOn) {
    const txt = tidy(t.textContent);
    if (ui.timer.textContent !== txt) ui.timer.textContent = txt;
    ui.timer.classList.toggle('is-low', t.classList.contains('is-low'));
  }
  fillProgress(card, cfg);
  const leave = read(card, cfg.leave);
  const leaveText = tidy(leave?.textContent) || 'Leave';
  ui.leave.hidden = !leave || leave.hidden;
  if (ui.leave.textContent !== leaveText) ui.leave.textContent = leaveText;
  ui.leave.disabled = Boolean(leave?.disabled);
  ui.plate.setAttribute('aria-label', [title, stageText].filter(Boolean).join(', '));
  ui.plate.hidden = false;
  ui.plateHost.classList.add('is-quest');
}

function showCaption(text) {
  caption = { text, until: 0, shown: false };
  setData('questCaption', text);
}

function hideCaption() {
  caption = { text: '', until: 0, shown: false };
  if (ui?.caption) {
    ui.caption.classList.remove('is-on');
    ui.caption.hidden = true;
  }
  if (zoneKey) {
    engineRef?.reserveZone?.(CAPTION_ZONE, null);
    zoneKey = '';
  }
  setData('questCaption', '');
}

/** The caption under the pill: waits while a conversation is up, then shows for captionMs. */
function tickCaption(now) {
  const el = ui.caption;
  if (!caption.text) return;
  if (modalUp()) {
    if (caption.shown) caption.until = Math.max(caption.until, now + 1200);
    el.classList.remove('is-on');
    return;
  }
  if (!caption.shown) {
    caption.shown = true;
    caption.until = now + captionMs(caption.text);
    if (el.textContent !== caption.text) el.textContent = caption.text;
    el.hidden = false;
  }
  if (now >= caption.until) {
    hideCaption();
    return;
  }
  // Under the pill, centred on it, inside the view.
  const host = el.offsetParent || el.parentElement;
  if (!host) return;
  const hr = host.getBoundingClientRect();
  const pr = plateRect();
  const w = el.offsetWidth || 0;
  const cx = pr.left + pr.width / 2 - hr.left;
  const left = Math.round(Math.max(8, Math.min(cx - w / 2, hr.width - w - 8)));
  const top = Math.round(Math.max(8, pr.bottom - hr.top + GAP));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.classList.add('is-on');
  // A notify zone: the notices go under the caption, not over it (js/notify-view.js).
  const key = `${left},${top},${w},${el.offsetHeight}`;
  if (key !== zoneKey) {
    zoneKey = key;
    engineRef?.reserveZone?.(CAPTION_ZONE, { left, top, right: left + w, bottom: top + el.offsetHeight });
  }
}

function sync(now = Date.now()) {
  if (!build()) return;
  const found = currentCard();
  // The nameplate is the pill's place; where it is hidden (new-player scenes) the card stays as it was.
  if (!found || !shown(ui.plateHost)) {
    if (adopted) release();
    return;
  }
  const first = !adopted || adopted.card !== found.card;
  if (first) adopt(found);
  // An owner that rewrites its card's classes drops ours: put them back.
  found.card.classList.add('qp-card');
  found.card.classList.toggle('qp-open', isOpen);
  fillPlate();
  const read2 = {
    step: tidy(read(found.card, found.cfg.step)?.textContent),
    line: tidy(read(found.card, found.cfg.line)?.textContent),
  };
  const text = nextCaption(seen, read2, { first });
  seen = read2;
  if (text) showCaption(text);
  tickCaption(now);
  if (isOpen) placeCard();
}

export const questPlateFeature = {
  id: QUEST_PLATE_FEATURE_ID,

  init(engine) {
    engineRef = engine;
  },

  onTick(_dt, _now, engine) {
    engineRef = engine || engineRef;
    const now = Date.now();
    if (now - lastSync < SYNC_MS) return;
    lastSync = now;
    sync(now);
  },

  /** QA and tests: sync now. */
  questPlateSync() {
    lastSync = Date.now();
    sync(lastSync);
    return adopted?.cfg.id || '';
  },
};
