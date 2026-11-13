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
 *   badge, Sound (Effects and Music sliders, Mute, and the world Zoom) and the Menu,
 *   regrouped into Me, World, Social (multiplayer only) and Settings (with Zoom and Night tint).
 *
 * On a phone (html.touch-phone, Modern; Austin 2026-11-12) the right pill holds only Quests,
 * Report a problem and the Menu: the skill being learned, Make, Mail and Sound open from the
 * Menu's first rows (installPhoneRows), and the Menu button rings the study's progress.
 *
 * Tooltips with key caps replace the bar's native titles. Everything here is
 * scoped to <html data-ui="modern"> in style.css, and the game state stays in
 * game.js: it calls renderTopBar() from updateHud and installTopBar() once.
 * The pure helpers below are tested without a DOM (tests/topbar.test.js).
 */
import { vitalLevel, vitalTitle } from '../vitals.js?v=85a51302';
import { loadAudioRestore, saveAudioRestore } from '../audio-pref.js?v=6fe817bc';
import { PHONE_ZOOM_ENDS, PHONE_ZOOM_HINT, ZOOM_FIXED_NOTE, ZOOM_KEYS_HINT, clampZoom, phoneZoomLabel, phoneZoomValueText, zoomLabel, zoomValueText } from '../world-zoom.js?v=ec0aa8a1';
import { NIGHT_TINT_HINT, NIGHT_TINT_LABEL } from '../night-tint.js?v=1dfc9c89';
import { STREET_MAP_HINT, STREET_MAP_LABEL } from './street-minimap.js?v=6c530941';
import { focusBack } from './focus-return.js?v=da190597';

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
  // A narrow window (fitTopActions): the bar's Quests, Make and Map, when they no longer fit on it.
  // `phone`: where the row goes on a phone instead (PHONE_MENU_GROUP, installPhoneRows).
  'menu-quest-btn': { group: 'world', rank: -3, key: 'Q' },
  'menu-make-btn': { group: 'world', rank: -2, key: 'N', phone: { group: 'now', rank: 1 } },
  'menu-map-btn': { group: 'world', rank: -1, key: 'M' },
  // A narrow window (style.css, under 760 px: every phone): the bar has no room for Mail and
  // Imagination, so the Menu carries them (installNarrowRows).
  'menu-imagination-btn': { group: 'me', rank: -1, key: 'X' },
  'menu-mail-btn': { group: 'world', rank: -4, phone: { group: 'now', rank: 2 } },
  // A phone only (installPhoneRows): the skill being learned (or how many are ready), and Sound.
  'menu-study-btn': { group: 'now', rank: 0, key: 'K' },
  'menu-sound-btn': { group: 'now', rank: 3 },
  // A phone only (js/ui/featured-project.js renderFeaturedMenuRow): the featured street project, in place of its pill.
  'menu-featured-btn': { group: 'now', rank: 4 },
  'home-btn': { group: 'world', rank: 0 },
  'feat-btn': { group: 'world', rank: 1, key: 'H' },
  // Ticket 81: the Projects panel (features/street-jobs-feature.js).
  'projects-btn': { group: 'world', rank: 2, key: 'P' },
  'snaps-btn': { group: 'world', rank: 3 },
  // ENCYC (js/encyclopedia-links.js): the Encyclopedia's home page in its own tab; I opens it on what you look at.
  'encyclopedia-btn': { group: 'world', rank: 4, key: 'I' },
  // A link, not a button: the site's /contribute/ page (GitHub Sponsors) in its own tab, last in
  // World (after rows with no place of their own, such as Interface, at 99).
  'support-btn': { group: 'world', rank: 100 },
  'buddies-btn': { group: 'social', rank: 0 },
  'groups-btn': { group: 'social', rank: 1 },
  'auctions-btn': { group: 'social', rank: 2 },
  'trade-request-btn': { group: 'social', rank: 3 },
  'keys-btn': { group: 'social', rank: 4, mod: 'Shift', key: 'K' },
  'multiplayer-btn': { group: 'settings', rank: 0 },
  'account-btn': { group: 'settings', rank: 1 },
  // Alternate characters (2026-11-12): beside Sign out.
  'switch-character-btn': { group: 'settings', rank: 2 },
  'signout-btn': { group: 'settings', rank: 3 },
});

/** A Menu row's place: { group, rank, key?, mod? } (unknown rows go last in World); `phone` takes a row's phone place. */
export function menuRowFor(id, { phone = false } = {}) {
  const row = MENU_ROWS[id] || { group: 'world', rank: 99 };
  if (!row.phone) return row;
  const { phone: there, ...rest } = row;
  return phone ? { ...rest, ...there } : rest;
}

/** A phone's first Menu group (installMenu adds it there only): the study, Make, Mail and Sound. */
export const PHONE_MENU_GROUP = Object.freeze({ id: 'now', label: 'Now' });

/** The phone bar: the phone gate's device (game.js adds html.touch-phone) in the Modern skin. */
export function phoneBar(doc) {
  const root = doc?.documentElement;
  return Boolean(root?.classList?.contains('touch-phone') && root.dataset?.ui === 'modern');
}

/**
 * PURE: the phone Menu's study row (Austin 2026-11-12): "learning <name> · 1:53" while a skill is
 * learned, "5 available" with skills ready, nothing else. `chip` is what the bar's study pill
 * holds (game.js paintStudyChip): { hidden, skill, name, short }.
 */
export function studyRowDetail({ hidden = true, skill = '', name = '', short = '' } = {}) {
  const left = String(short).trim();
  if (hidden || !left) return '';
  if (skill) return `learning ${name || 'a skill'} · ${left}`;
  return `${left} available`;
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

/** The favor display's mark where no Giant's shrine stands: Tiny Speck's favor star (glitch-client graphics/slug_favor_pos.png). */
export const FAVOR_NEUTRAL_ICON = 'assets/classic/slug_favor_pos.webp';

/**
 * The favor display: the number and its tooltip, or null when it hides.
 * It shows whenever any Giant has favor (`favor.any`; report #170, G631), so the Favor with the
 * Giants panel can be opened from every street: the street's Giant and its favor, 0 included,
 * or with no Giant to read (no name: js/shrines.js favorDisplayGiant, a place with no shrine)
 * the favor star alone, with no number (`neutral`).
 * With no favor anywhere it hides (it would only say 0, and the panel would be all zeros).
 */
export function favorChip(favor) {
  if (!favor) return null;
  const points = favor.name ? whole(favor.points) : 0;
  const any = 'any' in favor ? Boolean(favor.any) : points > 0;
  if (!any && points <= 0) return null;
  if (!favor.name) {
    return {
      num: '',
      neutral: true,
      tip: 'Favor with the Giants',
      sub: 'No Giant has a shrine here',
      label: 'Favor with the Giants. No Giant has a shrine here',
    };
  }
  const target = whole(favor.target);
  return {
    num: fmt(points),
    neutral: false,
    tip: `Favor with ${favor.name}`,
    sub: target > 0 ? `${fmt(points)} of ${fmt(target)} for an emblem` : '',
    label: `Favor with ${favor.name}: ${fmt(points)}${target > 0 ? ` of ${fmt(target)}` : ''}`,
  };
}

/**
 * The mail button's tooltip second line and accessible name for an unread
 * count, and (HOMES2, multiplayer) the parcels waiting to be collected at a
 * mailbox.
 */
export function mailText(unread, parcels = 0) {
  const n = Math.max(0, whole(unread));
  const p = Math.max(0, whole(parcels));
  const box = p ? `${p === 1 ? 'A parcel waits' : `${p} parcels wait`} at any mailbox` : '';
  return {
    sub: [n ? `${n} unread` : p ? '' : 'No new mail', box].filter(Boolean).join(' · '),
    label: [n ? `Mail, ${n} unread` : 'Mail', box].filter(Boolean).join(', '),
  };
}

/** A volume level 0..100 from anything (default 100). */
export function volumeLevel(v, fallback = 100) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

/**
 * PURE: clicking a channel's name (Effects, Music). A channel that plays goes to 0 and remembers
 * its level; a silent one goes back to the level it remembered (100 if none).
 * Returns { level, restore } (restore: what to remember next).
 */
export function soundChannelToggle(level, restore) {
  const now = volumeLevel(level, 0);
  if (now > 0) return { level: 0, restore: now };
  const back = volumeLevel(restore, 100);
  return { level: back > 0 ? back : 100, restore: back > 0 ? back : 100 };
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
      // No Giant on this street: the favor star alone, no number (G631).
      if (f.neutral) setAttr(chip, 'data-neutral', '');
      else if (chip.hasAttribute?.('data-neutral')) chip.removeAttribute('data-neutral');
      const img = chip.querySelector('img');
      const icon = f.neutral ? FAVOR_NEUTRAL_ICON : state.favor.icon;
      if (img && icon && img.getAttribute('src') !== icon) img.setAttribute('src', icon);
    }
  }
  // The open favor panel follows the game (a donation, an emblem claimed); it closes with its chip.
  favorPanel?.sync();
  if ('unread' in state) {
    const mail = doc.getElementById('mail-btn');
    const m = mailText(state.unread, state.parcels);
    setAttr(mail, 'data-sub', m.sub);
    setAttr(mail, 'aria-label', m.label);
  }
}

/**
 * PURE: a popover's left edge. Centred under its button at `center`, kept inside the bar
 * (`lo` to `hi`, the popover's left edge) and, with `clearL` / `clearR` given, clear of an open
 * side sheet and the Social drawer, so neither hides the other's rows (the lifted bar,
 * --z-hud-pop, is drawn over both). Where the free width is narrower than the popover it stays
 * clear of the sheet and laps over the drawer's edge.
 */
export function popoverLeft({ center, w, lo, hi, clearL = null, clearR = null }) {
  let min = lo;
  let max = hi;
  if (clearL != null) min = Math.max(min, clearL);
  if (clearR != null) max = Math.min(max, clearR - w);
  if (max < min) {
    min = Math.min(min, Math.max(lo, hi));
    max = min;
  }
  return Math.max(min, Math.min(max, center - w / 2));
}

/** Opens and closes one popover under its button: Esc, a click away or the button again closes it. */
function popover(doc, btn, pop, { onOpen, clear = false } = {}) {
  if (!btn || !pop) return { close() {}, isOpen: () => false };
  const isOpen = () => !pop.hidden;
  // A button the bar does not draw (Sound on a phone, opened from the Menu): under the Menu button.
  const anchor = () => (btn.getClientRects().length ? btn : doc.getElementById('more-btn') || btn);
  /** With `clear`: the free width between an open side sheet (--inset-l) and the Social drawer (--inset-r). */
  const free = () => {
    const root = clear ? doc.getElementById('game-root') : null;
    const box = root?.getBoundingClientRect?.();
    if (!box) return {};
    const css = doc.defaultView?.getComputedStyle?.(root);
    const px = (name) => Number.parseFloat(css?.getPropertyValue(name)) || 0;
    const l = px('--inset-l');
    const r = px('--inset-r');
    return { clearL: l > 0 ? box.left + l : null, clearR: r > 0 ? box.right - r : null };
  };
  const place = () => {
    const bar = pop.offsetParent?.getBoundingClientRect?.() || { left: 0, top: 0, right: doc.documentElement.clientWidth };
    const r = anchor().getBoundingClientRect();
    const w = pop.offsetWidth;
    const right = Math.min(bar.right, doc.documentElement.clientWidth);
    const left = popoverLeft({ center: r.left + r.width / 2, w, lo: bar.left + 4, hi: right - w - 4, ...free() });
    pop.style.left = `${Math.round(left - bar.left)}px`;
  };
  const close = (back = false) => {
    if (!isOpen()) return;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    // Esc: back to the button after a keyboard open, to the world after a click (focus-return.js).
    if (back) focusBack(anchor(), { doc });
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
  return { close, isOpen, open, place };
}

/** The installed favor panel (installFavor), for renderTopBar: { sync() } or null. */
let favorPanel = null;

/** One row of the favor panel: the Giant, a meter, favor of what the next emblem needs, and the ready mark. */
export function favorRowText(row) {
  const count = `${fmt(row.points)} / ${fmt(row.target)}`;
  return {
    count,
    mark: row.ready ? 'Emblem ready' : '',
    label: `${row.name}: ${fmt(row.points)} of ${fmt(row.target)} favor${row.ready ? '. Emblem ready' : ''}${row.here ? '. The Giant of this street' : ''}`,
  };
}

/**
 * Report #170: a click on the favor display (or Enter or Space when it has the keys) opens a
 * small panel of all eleven Giants: favor against what the next emblem needs, and a mark on
 * any Giant whose emblem is ready. The display itself keeps showing the street's Giant. Esc,
 * a click away or the display again closes it. `favor.rows()` gives js/shrines.js favorPanelRows.
 */
function installFavor(doc, favor) {
  const chip = doc.getElementById('favor-stat');
  const bar = chip?.closest('header.top-bar');
  if (!chip || !bar || !favor?.rows || doc.getElementById('favor-pop')) return null;
  const pop = doc.createElement('div');
  pop.id = 'favor-pop';
  pop.className = 'hud-pop favor-pop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Favor with the Giants');
  bar.append(pop);
  chip.setAttribute('role', 'button');
  chip.setAttribute('aria-haspopup', 'dialog');
  chip.setAttribute('aria-controls', 'favor-pop');
  chip.setAttribute('aria-expanded', 'false');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const draw = () => {
    const rows = favor.rows() || [];
    const key = rows.map((r) => `${r.id}:${r.points}/${r.target}${r.ready ? '!' : ''}${r.here ? '@' : ''}`).join(',');
    if (pop.dataset.key === key) return;
    pop.dataset.key = key;
    pop.dataset.ready = String(rows.filter((r) => r.ready).length);
    pop.innerHTML = `<h3 class="hud-pop-title">Favor with the Giants</h3><ul class="favor-list">${rows.map((r) => {
      const t = favorRowText(r);
      // Report #258: each Giant finds its closest Shrine (FavorProgressUI.as 129: the button's tip).
      const find = favor.find ? ` role="button" tabindex="0" title="${esc(`Find the closest Shrine to ${r.name}`)}"` : '';
      return `<li class="favor-row" data-giant="${esc(r.id)}"${r.ready ? ' data-ready' : ''}${r.here ? ' data-here' : ''}${find} aria-label="${esc(t.label)}">`
        + `<img src="${esc(r.icon)}" alt="" width="18" height="24" />`
        + `<span class="favor-name">${esc(r.name)}</span>`
        + `<span class="favor-meter" aria-hidden="true"><i style="width: ${Math.round(r.share * 100)}%"></i></span>`
        + (r.ready ? `<b class="favor-ready">${esc(t.mark)}</b>` : `<span class="favor-count">${esc(t.count)}</span>`)
        + '</li>';
    }).join('')}</ul>`;
  };
  // Clear of an open side sheet (Make, Quests, Skills and the rest) and the Social drawer.
  const p = popover(doc, chip, pop, { onOpen: draw, clear: true });
  const findFrom = (e) => {
    const li = e.target?.closest?.('.favor-row[data-giant]');
    if (!li || !favor.find) return;
    e.preventDefault();
    e.stopPropagation();
    p.close();
    favor.find(li.dataset.giant);
  };
  pop.addEventListener('click', findFrom);
  pop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') findFrom(e); });
  chip.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Not the game's Enter (verbs) or Space (jump).
    e.preventDefault();
    e.stopPropagation();
    chip.click();
  });
  return {
    sync() {
      if (!p.isOpen()) return;
      if (chip.hidden) p.close();
      else {
        draw();
        // A sheet opened or closed by its key while the panel is up: it steps clear again.
        p.place();
      }
    },
  };
}

/** The Menu: rows into their groups (features keep appending to #more-list), key caps, arrow keys. */
function installMenu(doc) {
  const list = doc.getElementById('more-list');
  if (!list) return;
  // A row is a button or a link (Support the game opens a page in its own tab).
  const ROW = 'button, a[href]';
  const groups = new Map();
  const phone = Boolean(doc.documentElement?.classList?.contains('touch-phone'));
  for (const g of phone ? [PHONE_MENU_GROUP, ...MENU_GROUPS] : MENU_GROUPS) {
    let box = list.querySelector(`[data-menu-group="${g.id}"]`);
    if (!box) {
      box = doc.createElement('div');
      box.className = 'menu-group';
      box.dataset.menuGroup = g.id;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', g.label);
      box.innerHTML = `<div class="menu-group-label" aria-hidden="true">${g.label}</div>`;
      if (g === PHONE_MENU_GROUP) list.prepend(box);
      else list.append(box);
    }
    groups.set(g.id, box);
  }
  const sync = () => {
    const onPhone = phoneBar(doc);
    for (const btn of list.querySelectorAll(ROW)) {
      const row = menuRowFor(btn.id, { phone: onPhone });
      if (btn.dataset.menuRank !== String(row.rank)) btn.dataset.menuRank = String(row.rank);
      if (row.key && btn.dataset.key !== row.key) btn.dataset.key = row.key;
      if (row.mod && btn.dataset.keyMod !== row.mod) btn.dataset.keyMod = row.mod;
      const box = groups.get(row.group) || groups.get('world');
      if (btn.parentElement !== box) box.append(btn);
    }
    for (const box of groups.values()) {
      const rows = [...box.querySelectorAll(':scope > :is(button, a[href])')];
      const sorted = [...rows].sort((x, y) => Number(x.dataset.menuRank) - Number(y.dataset.menuRank));
      if (sorted.some((btn, i) => btn !== rows[i])) for (const btn of sorted) box.append(btn);
      // A group can hold a control that is not a button (Settings' Zoom slider).
      const empty = rows.length === 0 && !box.querySelector(':scope > [data-menu-control]');
      if (box.hidden !== empty) box.hidden = empty;
    }
  };
  sync();
  new MutationObserver(sync).observe(list, { childList: true, subtree: true });
  // A phone switching skins moves Make and Mail between Now and World.
  if (phone) new MutationObserver(sync).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-ui'] });
  list.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const rows = [...list.querySelectorAll(ROW + ', input[type="range"], input[type="checkbox"]')].filter((b) => b.getClientRects().length && !b.disabled);
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
    list.querySelector(ROW)?.focus();
  });
}

/** One tooltip for the bar: data-tip, data-sub and data-key (a "Shift K" key shows two caps); data-tip-icon puts a picture first (the study pill's skill). */
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
    // data-tip-only="modern": the control draws its own hover in the other skin (Classic's mood share, energy line, study card).
    if (el.dataset.tipOnly && el.dataset.tipOnly !== doc.documentElement.dataset.ui) return;
    const keys = (el.dataset.key || '').split(' ').filter(Boolean);
    const icon = el.dataset.tipIcon ? `<img class="hud-tip-icon" src="${esc(el.dataset.tipIcon)}" alt="" width="40" height="40">` : '';
    tip.innerHTML = `${icon}<span>${esc(text)}${el.dataset.sub ? ` <span class="hud-tip-sub">· ${esc(el.dataset.sub)}</span>` : ''}</span>${keys.map((k) => `<span class="kcap">${esc(k)}</span>`).join('')}`;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    const x = Math.max(6, Math.min(vw - tip.offsetWidth - 6, r.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = `${Math.round(x)}px`;
    // Below the control, or above it where the window ends (report #208: never past the viewport).
    const vh = doc.documentElement.clientHeight;
    const below = r.bottom + 8;
    const y = below + tip.offsetHeight > vh - 6 ? Math.max(6, r.top - 8 - tip.offsetHeight) : below;
    tip.style.top = `${Math.round(y)}px`;
    tip.classList.add('is-on');
    current = el;
  };
  const schedule = (el, ms = 280) => {
    clearTimeout(timer);
    if (current && current !== el) hide();
    timer = setTimeout(() => show(el), ms);
  };
  // The mobile QA (2026-11-12): on a touch screen a tap's hover and focus left a tooltip standing
  // through later taps. A screen with no hover (a phone, a tablet) shows none.
  const noHover = () => Boolean(globalThis.matchMedia?.('(hover: none)').matches);
  for (const scope of scopes) {
    if (!scope) continue;
    scope.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch' || noHover()) return;
      const el = e.target.closest?.('[data-tip]');
      if (el && scope.contains(el) && el !== current && !el.closest('.hud-pop, .more-list, .player-menu, .vitals-menu')) schedule(el);
    });
    scope.addEventListener('pointerout', (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el && !el.contains(e.relatedTarget)) hide();
    });
    scope.addEventListener('focusin', (e) => {
      if (noHover()) return;
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

/** The words the street name's link says (ticket 60): its tooltip and its accessible name. */
export const LOCATION_LINK = Object.freeze({ tip: 'Open the Map', key: 'M' });

/** PURE: the street name's accessible name, "Hechey Track · Groddle Forest. Open the Map". */
export function locationLinkLabel(text) {
  const where = String(text || '').replace(/\s+/g, ' ').trim().replace(/^…$/, '');
  return where ? `${where}. ${LOCATION_LINK.tip}` : LOCATION_LINK.tip;
}

/**
 * Ticket 60: the street name (and its region, the same line) opens the Map, as the client's
 * Current location did (CurrentLocationUI.as 129-141: onClick toggled the hub map); the clock beside
 * it keeps its own click (the hi sign board in multiplayer, DateTimeUI.as 71-74). It goes through
 * the Map button, so it opens and closes the Map wherever M does, and not where the Map is hidden
 * (Gentle Island's nx-hide-map; canOpenMap 119-127 refused while the hub map was off). A pointer,
 * a hover line and a tooltip show it can be clicked; Tab reaches it and Enter or Space opens it.
 * In Classic the whole "Current location" block (its map icon and label) is the link, as in 2012.
 */
function installLocationLink(doc) {
  const plate = doc.getElementById('street-nameplate');
  const name = doc.getElementById('street-name');
  if (!plate || !name || plate.dataset.locationLink === 'on') return;
  plate.dataset.locationLink = 'on';
  name.setAttribute('role', 'button');
  name.setAttribute('tabindex', '0');
  name.setAttribute('aria-keyshortcuts', LOCATION_LINK.key);
  name.dataset.tip = LOCATION_LINK.tip;
  name.dataset.key = LOCATION_LINK.key;
  name.dataset.locationLink = '';
  const label = () => {
    const next = locationLinkLabel(name.textContent);
    if (name.getAttribute('aria-label') !== next) name.setAttribute('aria-label', next);
  };
  label();
  new MutationObserver(label).observe(name, { childList: true, characterData: true, subtree: true });
  const classic = () => doc.documentElement?.dataset?.ui === 'classic';
  const open = () => {
    const btn = doc.getElementById('map-btn');
    if (!btn || btn.disabled || doc.body?.classList.contains('nx-hide-map')) return false;
    // A Map button the bar does not show (a quest place's chrome) is not one to press.
    if (!btn.getClientRects().length && !classic()) return false;
    btn.click();
    return true;
  };
  plate.addEventListener('click', (e) => {
    if (plate.classList.contains('is-quest')) return;
    if (e.target?.closest?.('#dametime-clock, .season-chip, .quest-plate')) return;
    if (!classic() && !e.target?.closest?.('#street-name')) return;
    open();
  });
  name.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    open();
  });
}

/**
 * The nameplate sits centred on the window as in the mock, unless a pill is in the way: then it
 * moves into the room between the pills, and past that it gives way (ellipsis). It lives in
 * #game-root (the notices, the Qurazy banner and speech bubbles measure it there).
 */
export function nameplateLeft({ rootLeft = 0, rootW, plateW, left, right, gap = 8, naturalW = plateW }) {
  const min = left - rootLeft + gap;
  const max = right - rootLeft - gap - plateW;
  const ideal = (rootW - plateW) / 2;
  const room = right - left - 2 * gap;
  // A phone held sideways (Austin's iPhone in Chrome, 2026-11-12, about 812 px): the room between the
  // pills was 96 px and the plate read "H... · 2:19". Squeezed under PLATE_UNDER_ROOM it drops under
  // the pills instead, centred, as a narrow window's does (style.css .street-nameplate.is-under).
  const under = room < PLATE_UNDER_ROOM && Number(naturalW) > room;
  return { x: Math.round(Math.max(min, Math.min(ideal, max))), room: Math.max(0, Math.floor(room)), under };
}

/** Less room than this between the pills, and a plate that does not fit it, drops under them (px). */
export const PLATE_UNDER_ROOM = 200;

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
    // Its own width, not the width the room left it last time.
    plate.style.setProperty('--plate-room', `${Math.round(rr.width)}px`);
    const naturalW = plate.offsetWidth;
    const spot = nameplateLeft({ rootLeft: rr.left, rootW: rr.width, plateW: naturalW, left: l.right, right: r.left, naturalW });
    plate.style.setProperty('--plate-room', `${spot.room}px`);
    plate.style.setProperty('--plate-x', `${spot.x}px`);
    plate.classList.add('is-placed');
    if (plate.classList.contains('is-under') !== spot.under) plate.classList.toggle('is-under', spot.under);
    busy = false;
  };
  const ro = new ResizeObserver(() => requestAnimationFrame(sync));
  for (const el of [leftPill, rightPill, plate, root]) ro.observe(el);
  sync();
}

/**
 * A narrow window (390 px, Modern): the actions pill ran off the right edge, the Make hammer and
 * the study pill's "16 available" cut off. What does not fit gives way in this order: the study
 * pill shows only its number or time (`chip`), then Map, Make and Quests move from the bar into
 * the Menu's World group (Map also opens from the street name and the street map). Report a
 * problem, Sound and the Menu itself always stay on the bar.
 */
export const TOP_OVERFLOW_STEPS = Object.freeze(['chip', 'map', 'make', 'quest']);
const OVERFLOW_BUTTONS = Object.freeze({ quest: 'quest-btn', make: 'make-btn', map: 'map-btn' });
const OVERFLOW_ROWS = Object.freeze({ quest: ['menu-quest-btn', 'Quests'], make: ['menu-make-btn', 'Make'], map: ['menu-map-btn', 'Map'] });

/**
 * PURE: the fewest steps of TOP_OVERFLOW_STEPS, taken in order, for which `fits(steps)` is
 * true (all of them when nothing fits).
 */
export function pickTopOverflow(fits, steps = TOP_OVERFLOW_STEPS) {
  for (let n = 0; n <= steps.length; n += 1) {
    const taken = steps.slice(0, n);
    if (fits(taken)) return taken;
  }
  return [...steps];
}

/** Whether the actions pill fits: no content past its box, its box inside the window. */
function actionsFit(doc, pill) {
  const win = doc.defaultView;
  const right = (win?.innerWidth || doc.documentElement.clientWidth) - 4;
  return pill.scrollWidth <= pill.clientWidth + 1 && pill.getBoundingClientRect().right <= right;
}

function fitTopActions(doc) {
  const bar = doc.querySelector('header.top-bar');
  const pill = doc.querySelector('.top-bar .top-actions');
  const world = doc.querySelector('#more-list [data-menu-group="world"]');
  if (!bar || !pill) return;
  for (const [step, [id, label]] of Object.entries(OVERFLOW_ROWS)) {
    if (doc.getElementById(id) || !world) continue;
    const row = doc.createElement('button');
    row.type = 'button';
    row.id = id;
    row.className = 'chrome-btn menu-overflow-row';
    row.textContent = label;
    row.hidden = true;
    row.addEventListener('click', () => {
      doc.getElementById('more-btn')?.click();
      doc.getElementById(OVERFLOW_BUTTONS[step])?.click();
    });
    world.append(row);
  }
  const apply = (steps) => {
    const value = steps.join(' ');
    if ((bar.dataset.overflow || '') !== value) {
      if (value) bar.dataset.overflow = value;
      else delete bar.dataset.overflow;
    }
    for (const [step, [id]] of Object.entries(OVERFLOW_ROWS)) {
      const row = doc.getElementById(id);
      if (row && row.hidden !== !steps.includes(step)) row.hidden = !steps.includes(step);
    }
  };
  // Classic lays its own bar out (classic.css): nothing moves there.
  if (doc.documentElement.dataset.ui !== 'modern') return apply([]);
  // A phone: Quests stays on the bar; the study, Map and Make are always in the Menu (style.css).
  if (phoneBar(doc)) return apply(['chip', 'map', 'make']);
  apply(pickTopOverflow((steps) => {
    apply(steps);
    return actionsFit(doc, pill);
  }));
}

/**
 * Mail, Imagination and the currants on a narrow window (the mobile QA, 2026-11-12: under 760 px
 * style.css takes Mail and Imagination off the bar, under 560 the currants too, and nothing else
 * reached Mail). The Menu carries a row for each bar button that is not drawn (Mail with its
 * unread count, the bar's Menu button with a dot while mail waits), and under 560 px a currants
 * line at the top of Me. Each row clicks the bar's own button, so the game's handlers stay one.
 */
export const NARROW_ROWS = Object.freeze({ 'mail-btn': ['menu-mail-btn', 'Mail'], 'imagination-btn': ['menu-imagination-btn', 'Imagination'] });

function installNarrowRows(doc) {
  const bar = doc.querySelector('header.top-bar');
  const list = doc.getElementById('more-list');
  if (!bar || !list) return;
  const rows = {};
  for (const [barId, [id, label]] of Object.entries(NARROW_ROWS)) {
    let row = doc.getElementById(id);
    if (!row) {
      row = doc.createElement('button');
      row.type = 'button';
      row.id = id;
      row.className = 'chrome-btn menu-narrow-row';
      row.innerHTML = `<span>${label}</span>`;
      row.hidden = true;
      row.addEventListener('click', () => {
        doc.getElementById('more-btn')?.click();
        doc.getElementById(barId)?.click();
      });
      list.append(row);
    }
    rows[barId] = row;
  }
  const me = list.querySelector('[data-menu-group="me"]');
  let cur = doc.getElementById('menu-currants');
  if (me && !cur) {
    cur = doc.createElement('div');
    cur.id = 'menu-currants';
    cur.className = 'menu-currants';
    cur.dataset.menuControl = 'currants';
    cur.setAttribute('role', 'status');
    cur.innerHTML = '<span>Currants</span><strong></strong>';
    // The bar's own currants picture (its keyed URL).
    const pic = doc.querySelector('.top-bar .hud-cur.currants img')?.cloneNode(true);
    if (pic) {
      pic.alt = '';
      cur.prepend(pic);
    }
    me.querySelector('.menu-group-label')?.after(cur);
  }
  const badge = doc.getElementById('mail-unread-badge');
  const sync = () => {
    for (const [barId, row] of Object.entries(rows)) {
      const onBar = Boolean(doc.getElementById(barId)?.getClientRects().length);
      if (row.hidden !== onBar) row.hidden = onBar;
    }
    const mailRow = rows['mail-btn'];
    const unread = badge && !badge.hidden ? String(badge.textContent || '').trim() : '';
    let count = mailRow.querySelector('.menu-row-count');
    if (unread && !count) {
      count = doc.createElement('span');
      count.className = 'menu-row-count';
      mailRow.append(count);
    }
    if (count) {
      if (unread) count.textContent = unread;
      else count.remove();
    }
    if (mailRow.hidden || !unread) delete bar.dataset.mailWaits;
    else bar.dataset.mailWaits = unread;
    const amount = doc.getElementById('stat-currants')?.textContent || '';
    const strong = cur?.querySelector('strong');
    if (strong && strong.textContent !== amount) strong.textContent = amount;
  };
  sync();
  doc.defaultView?.addEventListener('resize', sync);
  // Opening the Menu measures again (a sheet or a zoom can change what the bar draws).
  doc.getElementById('more-btn')?.addEventListener('click', sync, true);
  const watch = [badge, doc.getElementById('stat-currants')].filter(Boolean);
  if (watch.length && typeof MutationObserver === 'function') {
    const mo = new MutationObserver(sync);
    for (const el of watch) mo.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
  }
}

/**
 * PHONEBAR (Austin 2026-11-12, his iPhone): the right pill holds Quests, Report a problem and the
 * Menu (style.css), so the Menu's first rows carry the rest: "Skills · learning <name> · 1:53"
 * (or "Skills · 5 available", or Skills) opening Skills, then Make and Mail (their narrow rows,
 * moved to Now by menuRowFor) and Sound, which opens the Sound popover under the Menu button.
 * A thin ring round the Menu button shows the study's progress (game.js data-progress on the
 * study pill). Rows click the bar's own buttons, so the game's handlers stay one.
 */
function installPhoneRows(doc) {
  const list = doc.getElementById('more-list');
  const now = list?.querySelector('[data-menu-group="now"]');
  const more = doc.getElementById('more-btn');
  if (!now || !more) return;
  const chip = doc.getElementById('study-chip');
  const sound = doc.getElementById('sound-btn');
  const row = (id, html, click) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'chrome-btn menu-phone-row';
    b.innerHTML = html;
    b.addEventListener('click', () => {
      more.click();
      click();
    });
    now.append(b);
    return b;
  };
  const study = row('menu-study-btn', '<span class="menu-study-name">Skills</span><span class="menu-study-detail"></span>', () => doc.getElementById('skills-btn')?.click());
  const soundRow = row('menu-sound-btn', '<span>Sound</span><span class="menu-row-note" hidden>Off</span>', () => sound?.click());
  const ring = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('class', 'menu-study-ring');
  ring.setAttribute('viewBox', '0 0 36 36');
  ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = '<circle class="msr-track" cx="18" cy="18" r="16.5" /><circle class="msr-fill" cx="18" cy="18" r="16.5" pathLength="100" stroke-dasharray="0 100" />';
  more.append(ring);
  const sync = () => {
    const on = phoneBar(doc);
    const learning = Boolean(on && chip && !chip.hidden && chip.dataset.skill);
    const detail = on && chip ? studyRowDetail({
      hidden: chip.hidden,
      skill: chip.dataset.skill || '',
      name: chip.dataset.tip || '',
      short: chip.querySelector('.study-chip-short')?.textContent || '',
    }) : '';
    setText(study.querySelector('.menu-study-detail'), detail);
    study.classList.toggle('is-studying', learning);
    const label = detail ? `Skills, ${detail}` : 'Skills';
    if (study.getAttribute('aria-label') !== label) study.setAttribute('aria-label', label);
    const muted = sound?.dataset.muted === 'true';
    const note = soundRow.querySelector('.menu-row-note');
    if (note.hidden === muted) note.hidden = !muted;
    // Off a phone (Classic, a skin switch) the rows go: the bar draws the pill and Sound there.
    if (study.hidden === on) study.hidden = !on;
    if (soundRow.hidden === on) soundRow.hidden = !on;
    const share = learning ? Number(chip.dataset.progress) : NaN;
    const showRing = learning && Number.isFinite(share);
    if (showRing) ring.querySelector('.msr-fill').setAttribute('stroke-dasharray', ringDash(share));
    if (showRing) more.dataset.studyRing = '';
    else delete more.dataset.studyRing;
    const tip = learning ? `Menu. Learning ${chip.dataset.tip || 'a skill'}, ${chip.querySelector('.study-chip-short')?.textContent || ''} left` : 'Menu';
    if (more.getAttribute('aria-label') !== tip) more.setAttribute('aria-label', tip);
  };
  sync();
  if (typeof MutationObserver === 'function') {
    const mo = new MutationObserver(sync);
    if (chip) mo.observe(chip, { attributes: true, childList: true, characterData: true, subtree: true });
    if (sound) mo.observe(sound, { attributes: true, attributeFilter: ['data-muted'] });
    mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-ui'] });
  }
}

function installTopOverflow(doc) {
  const bar = doc.querySelector('header.top-bar');
  const pill = doc.querySelector('.top-bar .top-actions');
  if (!bar || !pill) return;
  let queued = false;
  let lastChip = '';
  const fit = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fitTopActions(doc);
    });
  };
  fit();
  doc.defaultView?.addEventListener('resize', fit);
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(bar);
  // The study pill's words change as a skill counts down; a new length can need a new fit.
  const chip = doc.getElementById('study-chip');
  if (chip && typeof MutationObserver === 'function') {
    new MutationObserver(() => {
      const text = `${chip.hidden}:${chip.textContent.length}`;
      if (text !== lastChip) { lastChip = text; fit(); }
    }).observe(chip, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  }
  new MutationObserver(fit).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-ui'] });
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
  // The level each channel goes back to when its name is clicked again (js/audio-pref.js, kept across reloads).
  const restore = loadAudioRestore();
  const keep = () => saveAudioRestore(restore);
  const names = () => {
    const v = audio?.levels?.() || {};
    for (const [kind] of rows) {
      const name = pop.querySelector(`[data-sound-toggle="${kind}"]`);
      if (!name) continue;
      const off = volumeLevel(v[kind]) === 0;
      const word = name.textContent.toLowerCase();
      name.setAttribute('aria-pressed', String(off));
      name.title = off ? `Turn ${word} back on` : `Turn ${word} off`;
    }
  };
  for (const [kind, input] of rows) {
    input?.addEventListener('input', () => {
      audio?.setLevel?.(kind, volumeLevel(input.value));
      draw();
      names();
    });
    pop.querySelector(`[data-sound-toggle="${kind}"]`)?.addEventListener('click', (e) => {
      e.preventDefault();
      const next = soundChannelToggle(audio?.levels?.()?.[kind], restore[kind]);
      restore[kind] = next.restore;
      keep();
      audio?.setLevel?.(kind, next.level);
      draw();
      names();
    });
  }
  // It only sets things: a click on Mute, a channel or a slider gives the world the keys (focus-return.js).
  pop.dataset.clickReleases = '';
  popover(doc, btn, pop, { onOpen: () => { draw(); names(); } });
  names();
  draw();
}

/**
 * ZOOM: one Zoom slider (Wide 0 to Original 100, js/world-zoom.js) with its live label
 * and the keys under it (ZOOM_KEYS_HINT). On a street that looks the same at every zoom
 * (`zoom.fixed()`, #149) the slider is disabled and the line under it says so (ZOOM_FIXED_NOTE).
 * `where` names it for QA (data-zoom-control). Returns the row and a draw().
 * PHONE ZOOM: a phone's zoom (`zoom.phone`, js/world-zoom.js phoneZoom) goes from the whole street to
 * the closest, and the line under it says to pinch (a phone has no keys).
 */
export function zoomSlider(doc, zoom, { id, where, className = 'hud-slider hud-zoom' }) {
  const phone = Boolean(zoom?.phone);
  const hint = phone ? PHONE_ZOOM_HINT : ZOOM_KEYS_HINT;
  const row = doc.createElement('div');
  row.className = className;
  row.dataset.zoomControl = where;
  const label = doc.createElement('label');
  label.htmlFor = id;
  label.textContent = 'Zoom';
  const input = doc.createElement('input');
  Object.assign(input, { id, type: 'range', min: '0', max: '100', step: '1' });
  input.setAttribute('aria-describedby', `${id}-ends ${id}-keys`);
  const out = doc.createElement('output');
  out.htmlFor = id;
  const ends = doc.createElement('span');
  ends.id = `${id}-ends`;
  ends.className = 'hud-zoom-ends';
  const [near, far] = phone ? PHONE_ZOOM_ENDS : ['Wide', 'Original'];
  ends.innerHTML = `<span>${near}</span><span>${far}</span>`;
  // The keys that do the same from anywhere in the game (world-zoom.js zoomKeyAction).
  const keys = doc.createElement('p');
  keys.id = `${id}-keys`;
  keys.className = 'hud-zoom-keys';
  keys.textContent = hint;
  row.append(label, input, out, ends, keys);
  const draw = () => {
    const z = clampZoom(zoom?.get?.());
    const fixed = Boolean(zoom?.fixed?.());
    if (doc.activeElement !== input) input.value = String(Math.round(z * 100));
    setText(out, phone ? phoneZoomLabel(z) : zoomLabel(z));
    input.setAttribute('aria-valuetext', phone ? phoneZoomValueText(z) : zoomValueText(z));
    input.disabled = fixed;
    if (fixed) row.dataset.zoomFixed = '';
    else delete row.dataset.zoomFixed;
    setText(keys, fixed ? ZOOM_FIXED_NOTE : hint);
  };
  input.addEventListener('input', () => {
    zoom?.set?.(clampZoom(Number(input.value) / 100));
    draw();
  });
  // Arrow keys and Home/End move the slider, never the avatar or a menu row.
  input.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) e.stopPropagation();
  });
  zoom?.onChange?.(draw);
  zoom?.onFixedChange?.(draw);
  draw();
  return { row, input, draw };
}

/** ZOOM: the slider in the Sound popover and in the Menu's Settings group. */
function installZoom(doc, zoom) {
  if (!zoom) return;
  const pop = doc.getElementById('sound-pop');
  if (pop && !doc.getElementById('sound-zoom')) {
    const { row } = zoomSlider(doc, zoom, { id: 'sound-zoom', where: 'sound' });
    pop.append(row);
    const btn = doc.getElementById('sound-btn');
    if (btn) {
      btn.dataset.tip = 'Sound and zoom';
      btn.dataset.sub = 'Effects, music, mute and how close the world is';
    }
  }
  const settings = doc.querySelector('#more-list [data-menu-group="settings"]');
  if (settings && !doc.getElementById('menu-zoom')) {
    const { row } = zoomSlider(doc, zoom, { id: 'menu-zoom', where: 'menu', className: 'hud-slider hud-zoom menu-zoom' });
    row.dataset.menuControl = 'zoom';
    settings.querySelector('.menu-group-label')?.after(row);
    settings.hidden = false;
  }
}

/**
 * NIGHT TINT (js/night-tint.js): one switch, "Night tint", on while the world darkens with
 * the game clock. `where` names it for QA (data-night-tint-control). Returns the row, the
 * input and a draw().
 */
export function nightTintToggle(doc, setting, { id, where, className = 'hud-toggle' }) {
  const row = doc.createElement('label');
  row.className = className;
  row.htmlFor = id;
  row.dataset.nightTintControl = where;
  const input = doc.createElement('input');
  Object.assign(input, { id, type: 'checkbox' });
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-describedby', `${id}-hint`);
  const words = doc.createElement('span');
  words.textContent = NIGHT_TINT_LABEL;
  const hint = doc.createElement('small');
  hint.id = `${id}-hint`;
  hint.textContent = NIGHT_TINT_HINT;
  row.append(input, words, hint);
  const draw = () => {
    const on = Boolean(setting?.get?.());
    input.checked = on;
    input.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  input.addEventListener('change', () => {
    setting?.set?.(input.checked);
    draw();
  });
  // Enter or Space on the switch is its own (never a verb or a jump).
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.click();
    }
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  });
  setting?.onChange?.(draw);
  draw();
  return { row, input, draw };
}

/** NIGHT TINT: the switch in the Menu's Settings group, under Zoom. */
function installNightTint(doc, setting) {
  if (!setting) return;
  const settings = doc.querySelector('#more-list [data-menu-group="settings"]');
  if (!settings || doc.getElementById('menu-night-tint')) return;
  const { row } = nightTintToggle(doc, setting, { id: 'menu-night-tint', where: 'menu', className: 'hud-toggle menu-night-tint' });
  row.dataset.menuControl = 'night-tint';
  const zoom = settings.querySelector('[data-menu-control="zoom"]');
  if (zoom) zoom.after(row);
  else settings.querySelector('.menu-group-label')?.after(row);
  settings.hidden = false;
}

/**
 * MINIMAP (G370, js/ui/street-minimap.js): the "Street map" switch in the Menu's Settings group,
 * under Night tint. `setting` is { get, set, onChange }.
 */
function installStreetMap(doc, setting) {
  if (!setting) return;
  const settings = doc.querySelector('#more-list [data-menu-group="settings"]');
  if (!settings || doc.getElementById('menu-street-map')) return;
  const id = 'menu-street-map';
  const row = doc.createElement('label');
  row.className = 'hud-toggle menu-street-map';
  row.htmlFor = id;
  row.dataset.menuControl = 'street-map';
  row.dataset.streetMapControl = 'menu';
  const input = doc.createElement('input');
  Object.assign(input, { id, type: 'checkbox' });
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-describedby', `${id}-hint`);
  const words = doc.createElement('span');
  words.textContent = STREET_MAP_LABEL;
  const hint = doc.createElement('small');
  hint.id = `${id}-hint`;
  hint.textContent = STREET_MAP_HINT;
  row.append(input, words, hint);
  const draw = () => {
    const on = Boolean(setting.get?.());
    input.checked = on;
    input.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  input.addEventListener('change', () => {
    setting.set?.(input.checked);
    draw();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.click();
    }
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  });
  setting.onChange?.(draw);
  draw();
  const after = settings.querySelector('[data-menu-control="night-tint"]') || settings.querySelector('[data-menu-control="zoom"]');
  if (after) after.after(row);
  else settings.querySelector('.menu-group-label')?.after(row);
  settings.hidden = false;
}

/**
 * Wires the bar once (game.js main): tooltips, the Menu's groups, the Sound popover, the
 * low-energy pill, the nameplate's shape and the pills' widths. `opts`:
 *   audio: { levels(): { effects, music }, setLevel(kind, 0..100) }
 *   zoom: { get(), set(0..1), onChange(fn) } (js/world-zoom.js)
 *   nightTint: { get(), set(bool), onChange(fn) } (js/night-tint.js)
 *   streetMap: { get(), set(bool), onChange(fn) } (js/ui/street-minimap.js)
 *   favor: { rows() } the favor panel's eleven Giants (js/shrines.js favorPanelRows)
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
  installZoom(doc, opts.zoom);
  installNightTint(doc, opts.nightTint);
  installStreetMap(doc, opts.streetMap);
  favorPanel = installFavor(doc, opts.favor);
  const tips = installTooltips(doc, [bar, doc.getElementById('street-nameplate')]);
  adoptTitles(bar);
  shapeStreetName(doc);
  installLocationLink(doc);
  trackPillWidths(doc);
  installTopOverflow(doc);
  installNarrowRows(doc);
  installPhoneRows(doc);
  doc.getElementById('low-energy-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    doc.querySelector('.top-bar .meta-pill.energy')?.click();
  });
  doc.getElementById('imagination-btn')?.addEventListener('click', () => opts.onImagination?.());
  doc.getElementById('mail-btn')?.addEventListener('click', () => opts.onMail?.());
  doc.getElementById('player-card-btn')?.addEventListener('click', () => opts.onPlayerCard?.());
  return { hideTip: tips.hide };
}
