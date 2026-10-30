/**
 * The modern skin's top bar (phase 2, Warm paper; the HUD mock is the spec): three
 * floating pills over the world instead of the old full-width bar.
 *
 * - Left: energy, mood and level as rings with the number inside (low and very low
 *   from js/vitals.js: amber under 20%, red with a slow pulse under 10%), a "Low
 *   energy" pill that opens the same "Something to eat" menu, then iMG, currants,
 *   favor with the street's Giant, and the day's quoins.
 * - Centre: the street nameplate (#street-nameplate in #game-root, restyled, not copied).
 * - Right: Quests (Q), Make (N), Map (M), Imagination (X), Mail with its unread
 *   badge, Sound (Effects and Music sliders, Mute) and the Menu, regrouped into Me,
 *   World, Social (multiplayer only) and Settings.
 *
 * Tooltips with key caps replace the bar's native titles. Everything here is
 * scoped to <html data-ui="modern"> in style.css, and the game state stays in
 * game.js: it calls renderTopBar() from updateHud and installTopBar() once.
 * The pure helpers below are tested without a DOM (tests/topbar.test.js).
 */
import { vitalLevel, vitalTitle } from '../vitals.js?v=g458-2';

/** The Menu's groups, in the mock's order; Social shows only when something is in it. */
export const MENU_GROUPS = Object.freeze([
  { id: 'me', label: 'Me' },
  { id: 'world', label: 'World' },
  { id: 'social', label: 'Social' },
  { id: 'settings', label: 'Settings' },
]);

/**
 * Where each Menu row goes and its key cap: the rows the play page holds and the ones
 * features add to #more-list (buddies, groups, auctions, trade, keys and snaps in
 * multiplayer; Multiplayer, Account and Sign out from account-backup-feature.js).
 * A row not listed lands in World. `rank` orders a group as the mock does.
 */
export const MENU_ROWS = Object.freeze({
  'player-card-btn': { group: 'me', rank: 0, key: 'Z' },
  'skills-btn': { group: 'me', rank: 1, key: 'K' },
  // Upgrades opens the imagination panel at its first view (U opens the upgrade cards); X is the
  // Imagination hub now (js/ui/imagination-hub.js), whose Upgrades tile is this row.
  'img-btn': { group: 'me', rank: 2, key: 'U' },
  'achieve-btn': { group: 'me', rank: 3, key: 'B' },
  'buffs-btn': { group: 'me', rank: 4, key: 'Y' },
  'avatar-btn': { group: 'me', rank: 5, key: 'L' },
  'home-btn': { group: 'world', rank: 0 },
  'feat-btn': { group: 'world', rank: 1, key: 'H' },
  'vendor-btn': { group: 'world', rank: 2, key: 'V' },
  'snaps-btn': { group: 'world', rank: 3 },
  'buddies-btn': { group: 'social', rank: 0 },
  'groups-btn': { group: 'social', rank: 1 },
  'auctions-btn': { group: 'social', rank: 2 },
  'trade-request-btn': { group: 'social', rank: 3 },
  'keys-btn': { group: 'social', rank: 4, mod: 'Shift', key: 'K' },
  'multiplayer-btn': { group: 'settings', rank: 0 },
  'account-btn': { group: 'settings', rank: 1 },
  'signout-btn': { group: 'settings', rank: 2 },
});

/** A Menu row's place: { group, rank, key?, mod? } (unknown rows go last in World). */
export function menuRowFor(id) {
  return MENU_ROWS[id] || { group: 'world', rank: 99 };
}

/** A ring's stroke-dasharray for a share of 0..1 (pathLength 100). */
export function ringDash(share) {
  const n = Number(share);
  const pct = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) * 100 : 0;
  return `${Number(pct.toFixed(1))} 100`;
}

const whole = (n) => Math.round(Number(n) || 0);
const fmt = (n) => whole(n).toLocaleString('en-US');

/**
 * What an energy or mood ring shows: the number inside, the state (js/vitals.js), the
 * tooltip and its second line, and the accessible name (vitalTitle: the numbers, the
 * state in words and the click).
 */
export function vitalRing(stat, now, max) {
  const level = vitalLevel(now, max);
  const text = `${whole(now)}/${whole(max)}`;
  const name = stat === 'mood' ? 'Mood' : 'Energy';
  let sub;
  if (stat === 'mood') sub = level === 'ok' ? 'Click for something to lift it' : `${level === 'critical' ? 'Very low' : 'Low'}: click for something to lift it`;
  else sub = level === 'ok' ? 'Click for something to eat' : `${level === 'critical' ? 'Very low' : 'Low'}: click to eat`;
  return {
    level,
    num: String(whole(now)),
    dash: ringDash(Number(max) > 0 ? Number(now) / Number(max) : 0),
    tip: `${name} ${text}`,
    sub,
    label: vitalTitle(stat, text, level),
  };
}

/** The low-energy pill's words, or '' when energy is fine. */
export function lowEnergyText(level) {
  return level === 'critical' ? 'Very low energy' : level === 'low' ? 'Low energy' : '';
}

/** The level ring: the level inside, progress round it, the XP in words. */
export function levelRing(info) {
  const level = whole(info?.level) || 1;
  if (info?.atCap) {
    return { num: String(level), dash: ringDash(1), tip: `Level ${level}`, sub: 'The top level', label: `Level ${level}, the top level. Your player card (Z)` };
  }
  const xp = `${fmt(info?.earned)} / ${fmt(info?.needed)} XP`;
  return {
    num: String(level),
    dash: ringDash(info?.progress),
    tip: `Level ${level}`,
    sub: `${xp} to level ${level + 1}`,
    label: `Level ${level}, ${fmt(info?.earned)} of ${fmt(info?.needed)} XP to level ${level + 1}. Your player card (Z)`,
  };
}

/** Favor with a Giant: the number and its tooltip, or null without a Giant. */
export function favorChip(favor) {
  if (!favor?.name) return null;
  const points = whole(favor.points);
  // No favor yet: the chip waits for the first donation or reward (it would only say 0).
  if (points <= 0) return null;
  const target = whole(favor.target);
  return {
    num: fmt(points),
    tip: `Favor with ${favor.name}`,
    sub: target > 0 ? `${fmt(points)} of ${fmt(target)} for an emblem` : '',
    label: `Favor with ${favor.name}: ${fmt(points)}${target > 0 ? ` of ${fmt(target)}` : ''}`,
  };
}

/** The mail button's tooltip second line and accessible name for an unread count. */
export function mailText(unread) {
  const n = Math.max(0, whole(unread));
  return {
    sub: n ? `${n} unread` : 'No new mail',
    label: n ? `Mail, ${n} unread` : 'Mail',
  };
}

/** A volume level 0..100 from anything (default 100). */
export function volumeLevel(v, fallback = 100) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

// --------------------------------------------------------------------- DOM

/** The mood ring's face for a level: content, flat, sad. */
const FACE = {
  ok: '<circle cx="4" cy="4.8" r=".9" fill="currentColor"/><circle cx="8" cy="4.8" r=".9" fill="currentColor"/><path d="M3.6 7.4c1.3 1.4 3.5 1.4 4.8 0" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
  low: '<circle cx="4" cy="4.8" r=".9" fill="currentColor"/><circle cx="8" cy="4.8" r=".9" fill="currentColor"/><path d="M3.8 8h4.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  critical: '<circle cx="4" cy="4.8" r=".9" fill="currentColor"/><circle cx="8" cy="4.8" r=".9" fill="currentColor"/><path d="M3.6 8.6c1.3-1.4 3.5-1.4 4.8 0" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
};

const setAttr = (el, name, value) => {
  if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
};
const setText = (el, value) => {
  if (el && el.textContent !== value) el.textContent = value;
};

/** A ring's number, with its digit count so three digits ("100") take the smaller size (style.css). */
function drawNum(el, text) {
  if (!el) return;
  setText(el, text);
  const digits = String(Math.min(4, text.length));
  if (el.dataset.digits !== digits) el.dataset.digits = digits;
}

function drawVital(doc, stat, now, max) {
  const pill = doc.querySelector(`.top-bar .meta-pill.${stat}`);
  if (!pill) return 'ok';
  const r = vitalRing(stat, now, max);
  pill.dataset.vital = r.level;
  setAttr(pill.querySelector('.ring-fill'), 'stroke-dasharray', r.dash);
  drawNum(pill.querySelector('.ring-num'), r.num);
  setAttr(pill, 'data-tip', r.tip);
  setAttr(pill, 'data-sub', r.sub);
  setAttr(pill, 'aria-label', r.label);
  if (stat === 'mood') {
    const face = pill.querySelector('.ring-glyph svg');
    if (face && face.dataset.face !== r.level) {
      face.innerHTML = FACE[r.level] || FACE.ok;
      face.dataset.face = r.level;
    }
  }
  return r.level;
}

/**
 * Draws the left pill from game state (game.js updateHud):
 * { energy: [now, max], mood: [now, max], level: levelInfoForXp(), favor: { name, giant, points, target, icon } }.
 * iMG, currants and quoins are written by updateHud into their own ids as before.
 */
export function renderTopBar(doc, state = {}) {
  if (!doc?.querySelector) return;
  if (state.mood) drawVital(doc, 'mood', state.mood[0], state.mood[1]);
  const energy = state.energy ? drawVital(doc, 'energy', state.energy[0], state.energy[1]) : null;
  const stats = doc.getElementById('hud-stats');
  if (stats && energy) stats.dataset.energy = energy;
  const low = doc.getElementById('low-energy-btn');
  if (low && energy) {
    const words = lowEnergyText(energy);
    low.hidden = !words;
    setText(low.querySelector('span'), words);
    setAttr(low, 'aria-label', words ? `${words}: something to eat` : 'Something to eat');
  }
  if (state.level) {
    const ring = doc.getElementById('player-menu-btn');
    const r = levelRing(state.level);
    if (ring?.classList.contains('ring')) {
      setAttr(ring.querySelector('.ring-fill'), 'stroke-dasharray', r.dash);
      drawNum(ring.querySelector('.ring-num'), r.num);
      setAttr(ring, 'data-tip', r.tip);
      setAttr(ring, 'data-sub', r.sub);
      setAttr(ring, 'aria-label', r.label);
    }
  }
  const chip = doc.getElementById('favor-stat');
  if (chip && 'favor' in state) {
    const f = favorChip(state.favor);
    chip.hidden = !f;
    if (f) {
      setText(doc.getElementById('stat-favor'), f.num);
      setAttr(chip, 'data-tip', f.tip);
      setAttr(chip, 'data-sub', f.sub);
      setAttr(chip, 'aria-label', f.label);
      const img = chip.querySelector('img');
      if (img && state.favor.icon && img.getAttribute('src') !== state.favor.icon) img.setAttribute('src', state.favor.icon);
    }
  }
  if ('unread' in state) {
    const mail = doc.getElementById('mail-btn');
    const m = mailText(state.unread);
    setAttr(mail, 'data-sub', m.sub);
    setAttr(mail, 'aria-label', m.label);
  }
}

/** Opens and closes one popover under its button: Esc, a click away or the button again closes it. */
function popover(doc, btn, pop, { onOpen } = {}) {
  if (!btn || !pop) return { close() {}, isOpen: () => false };
  const isOpen = () => !pop.hidden;
  const place = () => {
    const bar = pop.offsetParent?.getBoundingClientRect?.() || { left: 0, top: 0, right: doc.documentElement.clientWidth };
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const right = Math.min(bar.right, doc.documentElement.clientWidth);
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(bar.left + 4, Math.min(right - w - 4, left));
    pop.style.left = `${Math.round(left - bar.left)}px`;
  };
  const close = (focusBack = false) => {
    if (!isOpen()) return;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (focusBack) btn.focus();
  };
  const open = () => {
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    place();
    onOpen?.();
    pop.querySelector('input, button')?.focus();
  };
  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  doc.addEventListener('pointerdown', (e) => {
    if (isOpen() && !pop.contains(e.target) && !btn.contains(e.target)) close();
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    e.stopPropagation();
    close(true);
  });
  return { close, isOpen, open };
}

/** The Menu: rows into their groups (features keep appending to #more-list), key caps, arrow keys. */
function installMenu(doc) {
  const list = doc.getElementById('more-list');
  if (!list) return;
  const groups = new Map();
  for (const g of MENU_GROUPS) {
    let box = list.querySelector(`[data-menu-group="${g.id}"]`);
    if (!box) {
      box = doc.createElement('div');
      box.className = 'menu-group';
      box.dataset.menuGroup = g.id;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', g.label);
      box.innerHTML = `<div class="menu-group-label" aria-hidden="true">${g.label}</div>`;
      list.append(box);
    }
    groups.set(g.id, box);
  }
  const sync = () => {
    for (const btn of list.querySelectorAll('button')) {
      const row = menuRowFor(btn.id);
      if (btn.dataset.menuRank !== String(row.rank)) btn.dataset.menuRank = String(row.rank);
      if (row.key && btn.dataset.key !== row.key) btn.dataset.key = row.key;
      if (row.mod && btn.dataset.keyMod !== row.mod) btn.dataset.keyMod = row.mod;
      const box = groups.get(row.group) || groups.get('world');
      if (btn.parentElement !== box) box.append(btn);
    }
    for (const box of groups.values()) {
      const rows = [...box.querySelectorAll(':scope > button')];
      const sorted = [...rows].sort((x, y) => Number(x.dataset.menuRank) - Number(y.dataset.menuRank));
      if (sorted.some((btn, i) => btn !== rows[i])) for (const btn of sorted) box.append(btn);
      const empty = rows.length === 0;
      if (box.hidden !== empty) box.hidden = empty;
    }
  };
  sync();
  new MutationObserver(sync).observe(list, { childList: true, subtree: true });
  list.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const rows = [...list.querySelectorAll('button')].filter((b) => b.getClientRects().length && !b.disabled);
    if (!rows.length) return;
    e.preventDefault();
    e.stopPropagation();
    const i = rows.indexOf(doc.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    rows[next].focus();
  });
  // Opened from the keyboard: the first row takes focus.
  const btn = doc.getElementById('more-btn');
  btn?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown') return;
    e.preventDefault();
    if (list.hidden) btn.click();
    list.querySelector('button')?.focus();
  });
}

/** One tooltip for the bar: data-tip, data-sub and data-key (a "Shift K" key shows two caps). */
function installTooltips(doc, scopes) {
  const tip = doc.createElement('div');
  tip.id = 'hud-tip';
  tip.className = 'hud-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  doc.body.append(tip);
  let timer = 0;
  let current = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hide = () => {
    clearTimeout(timer);
    current = null;
    tip.hidden = true;
    tip.classList.remove('is-on');
  };
  const show = (el) => {
    const text = el.dataset.tip;
    if (!text || el.getAttribute('aria-expanded') === 'true' || !el.getClientRects().length) return;
    const keys = (el.dataset.key || '').split(' ').filter(Boolean);
    tip.innerHTML = `<span>${esc(text)}${el.dataset.sub ? ` <span class="hud-tip-sub">· ${esc(el.dataset.sub)}</span>` : ''}</span>${keys.map((k) => `<span class="kcap">${esc(k)}</span>`).join('')}`;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    const x = Math.max(6, Math.min(vw - tip.offsetWidth - 6, r.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(r.bottom + 8)}px`;
    tip.classList.add('is-on');
    current = el;
  };
  const schedule = (el, ms = 280) => {
    clearTimeout(timer);
    if (current && current !== el) hide();
    timer = setTimeout(() => show(el), ms);
  };
  for (const scope of scopes) {
    if (!scope) continue;
    scope.addEventListener('pointerover', (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el && scope.contains(el) && el !== current && !el.closest('.hud-pop, .more-list, .player-menu, .vitals-menu')) schedule(el);
    });
    scope.addEventListener('pointerout', (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el && !el.contains(e.relatedTarget)) hide();
    });
    scope.addEventListener('focusin', (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el && e.target.matches?.(':focus-visible') && !el.closest('.hud-pop, .more-list, .player-menu, .vitals-menu')) schedule(el, 120);
    });
    scope.addEventListener('focusout', hide);
    scope.addEventListener('pointerdown', hide);
    scope.addEventListener('click', hide);
  }
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  }, true);
  return { hide };
}

/**
 * The bar's own titles become its tooltips: a title written on a pill's control (the game
 * sets some, features others) moves to data-tip, so the native tooltip never doubles it.
 */
function adoptTitles(root) {
  const adopt = (el) => {
    if (!el.hasAttribute?.('title') || el.closest('.more-list, .hud-pop, .player-menu, .vitals-menu')) return;
    const t = el.getAttribute('title');
    el.removeAttribute('title');
    // A control the bar already names keeps its tooltip; a title on any other becomes one.
    if (t && !el.dataset.tip) el.dataset.tip = t;
  };
  for (const el of root.querySelectorAll('[title]')) adopt(el);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') adopt(m.target);
      else for (const n of m.addedNodes) if (n.nodeType === 1) { adopt(n); for (const c of n.querySelectorAll?.('[title]') || []) adopt(c); }
    }
  }).observe(root, { attributes: true, attributeFilter: ['title'], subtree: true, childList: true });
}

/**
 * The nameplate's street and region: game.js writes "Street · Hub" as one text (ten places);
 * the street is drawn heavier and the region can give way on a narrow window. The text stays
 * the same, so everything that reads it still does.
 */
function shapeStreetName(doc) {
  const el = doc.getElementById('street-name');
  if (!el) return;
  const shape = () => {
    if (el.firstElementChild) return;
    const text = el.textContent || '';
    const at = text.indexOf(' · ');
    const street = doc.createElement('b');
    street.className = 'street-name-street';
    street.textContent = at < 0 ? text : text.slice(0, at);
    el.replaceChildren(street);
    if (at >= 0) {
      const hub = doc.createElement('span');
      hub.className = 'street-name-hub';
      hub.textContent = text.slice(at);
      el.append(hub);
    }
  };
  shape();
  new MutationObserver(shape).observe(el, { childList: true, characterData: true, subtree: true });
}

/**
 * The nameplate sits centred on the window as in the mock, unless a pill is in the way: then it
 * moves into the room between the pills, and past that it gives way (ellipsis). It lives in
 * #game-root (the notices, the Qurazy banner and speech bubbles measure it there).
 */
export function nameplateLeft({ rootLeft = 0, rootW, plateW, left, right, gap = 8 }) {
  const min = left - rootLeft + gap;
  const max = right - rootLeft - gap - plateW;
  const ideal = (rootW - plateW) / 2;
  const room = right - left - 2 * gap;
  return { x: Math.round(Math.max(min, Math.min(ideal, max))), room: Math.max(0, Math.floor(room)) };
}

function trackPillWidths(doc) {
  const leftPill = doc.getElementById('hud-stats');
  const rightPill = doc.querySelector('.top-bar .top-actions');
  const plate = doc.getElementById('street-nameplate');
  const root = doc.getElementById('game-root');
  if (!leftPill || !rightPill || !plate || !root || typeof ResizeObserver !== 'function') return;
  let busy = false;
  const sync = () => {
    if (busy) return;
    busy = true;
    const rr = root.getBoundingClientRect();
    const l = leftPill.getBoundingClientRect();
    const r = rightPill.getBoundingClientRect();
    plate.style.maxWidth = '';
    const spot = nameplateLeft({ rootLeft: rr.left, rootW: rr.width, plateW: plate.offsetWidth, left: l.right, right: r.left });
    plate.style.setProperty('--plate-room', `${spot.room}px`);
    plate.style.setProperty('--plate-x', `${spot.x}px`);
    plate.classList.add('is-placed');
    busy = false;
  };
  const ro = new ResizeObserver(() => requestAnimationFrame(sync));
  for (const el of [leftPill, rightPill, plate, root]) ro.observe(el);
  sync();
}

/** Effects and Music sliders and Mute (the game's #mute-btn, moved into the Sound popover). */
function installSound(doc, audio) {
  const btn = doc.getElementById('sound-btn');
  const pop = doc.getElementById('sound-pop');
  if (!btn || !pop) return;
  const rows = [['effects', doc.getElementById('sfx-volume')], ['music', doc.getElementById('music-volume')]];
  const draw = () => {
    const v = audio?.levels?.() || {};
    for (const [kind, input] of rows) {
      if (!input) continue;
      const level = volumeLevel(v[kind]);
      if (doc.activeElement !== input) input.value = String(level);
      setText(input.parentElement.querySelector('output'), String(level));
      input.setAttribute('aria-valuetext', `${level}%`);
    }
  };
  for (const [kind, input] of rows) {
    input?.addEventListener('input', () => {
      audio?.setLevel?.(kind, volumeLevel(input.value));
      draw();
    });
  }
  popover(doc, btn, pop, { onOpen: draw });
  draw();
}

/**
 * Wires the bar once (game.js main): tooltips, the Menu's groups, the Sound popover, the
 * low-energy pill, the nameplate's shape and the pills' widths. `opts`:
 *   audio: { levels(): { effects, music }, setLevel(kind, 0..100) }
 *   onImagination(), onMail(), onPlayerCard(): what those controls open.
 */
export function installTopBar(doc, opts = {}) {
  const bar = doc?.querySelector?.('header.top-bar');
  if (!bar || bar.dataset.topbar === 'on') return null;
  bar.dataset.topbar = 'on';
  // A focused control's Enter or Space is its own (never the game's verbs or a jump).
  bar.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button, [role="button"], input')) e.stopPropagation();
  });
  installMenu(doc);
  installSound(doc, opts.audio);
  const tips = installTooltips(doc, [bar]);
  adoptTitles(bar);
  shapeStreetName(doc);
  trackPillWidths(doc);
  doc.getElementById('low-energy-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    doc.querySelector('.top-bar .meta-pill.energy')?.click();
  });
  doc.getElementById('imagination-btn')?.addEventListener('click', () => opts.onImagination?.());
  doc.getElementById('mail-btn')?.addEventListener('click', () => opts.onMail?.());
  doc.getElementById('player-card-btn')?.addEventListener('click', () => opts.onPlayerCard?.());
  return { hideTip: tips.hide };
}
