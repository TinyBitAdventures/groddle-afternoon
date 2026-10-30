/**
 * The Classic top bar (classic-spec spec §2-§6): the 2012 "ear" in the viewport's top-left corner
 * with the mood face, the energy arc, the iMG cloud button and its count; the currants in the
 * viewport's bottom-left corner; the street as "Current location" at the viewport's top right; and
 * the header cluster over the chat column (the game's buttons, help, volume, the date and time).
 *
 * Everything is the modern top bar's own elements (js/ui/topbar.js) moved and painted by
 * css/classic.css, so every id, slug target (#bar-energy, #bar-mood, #stat-img, #stat-currants),
 * click and key keeps working. This module only adds what the 2012 chrome draws that the modern
 * bar has no element for, all hidden under Modern:
 * - the energy arc SVG inside .meta-pill.energy (EnergyBar.as 18-156), filled to the energy share
 *   and coloured from the 11-stop ramp (energy_mood_gradient.png), read from the ring the game
 *   already fills (#bar-energy's stroke-dasharray), so no new game hook;
 * - the mood face's state (PlayerFaceUI.as 37-45, 232-252: 90, 80, 70 and 20%) from #bar-mood;
 * - the "{cur}/{max} Energy" line from the ring's own tooltip;
 * - the three-line date block (DateTimeUI.as 49-74) from #dametime-clock;
 * - the help button (GameHeaderUI.as 72-82: it shows the hotkey sheet);
 * - the volume icon's frame (AudioControl.as 214-229) from the Sound sliders and mute;
 * - the day's quoins as a row in the player menu (open question 9);
 * - the face's avatar, and the player's name over it online.
 */
import { uiState, onUiModeChange } from './ui-mode.js?v=g476-1';
import { classicArtUrl } from './classic-art.js?v=g468-9';

/** PURE: a ring's share 0..1 from its stroke-dasharray ("63.5 100"). */
export function shareFromDash(dash) {
  const n = parseFloat(String(dash || '').trim().split(/[\s,]+/)[0]);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : 0;
}

/** PURE: the energy ramp stop 0..10 (energy_mood_gradient.png sampled at floor(pct * 200)). */
export function rampStop(share) {
  return Math.max(0, Math.min(10, Math.floor(Number(share) * 10.9999)));
}

/** PURE: the face's mood state (PlayerFaceUI.as 232-252, tested in order). */
export function moodState(share) {
  const s = Number(share) || 0;
  if (s >= 0.9) return 'sun';
  if (s >= 0.8) return 'glow';
  if (s >= 0.7) return 'fair';
  if (s >= 0.2) return 'meh';
  return 'low';
}

/** PURE: the volume icon's frame (AudioControl.as 214-229): 0 loud .. 3 silent, by the louder channel. */
export function volumeFrame(effects, music, muted) {
  if (muted) return 3;
  const v = Math.max(Number(effects) || 0, Number(music) || 0);
  if (v >= 65) return 0;
  if (v >= 33) return 1;
  if (v >= 1) return 2;
  return 3;
}

/** PURE: the date block's three lines from the clock's aria-label ("12:30 PM, Twoday, the 28th of Primuary, year 3"). */
export function dateLines(label, fallbackTime = '') {
  const m = /^\s*(\d{1,2}:\d{2})\s*(AM|PM),\s*([^,]+),\s*the\s+([^,]+?)(?:,\s*year\s+\d+)?\s*$/i.exec(String(label || ''));
  if (!m) return { day: '', time: String(fallbackTime || '').toLowerCase(), date: '' };
  return { day: m[3].trim(), time: `${m[1]} ${m[2].toLowerCase()}`, date: m[4].trim() };
}

/** PURE: "80/100" from the energy ring's tooltip ("Energy 80/100"). */
export function energyText(tip) {
  const m = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/.exec(String(tip || ''));
  return m ? `${m[1]}/${m[2]}` : '';
}

// The arc (EnergyBar.as 48-156, classic-spec §2): the foot, the 13 px band and the top cap, 77 x 64.
const ARC_SHAPE = 'M0,64 Q0,57.5 15,51 Q62,51 64,6 L64,5 Q64,0 69,0 L72,0 Q77,0 77,5 L77,6 Q73,62 15,64 Z';
const ARC_LINE = 'M0,62 L15,57.5 Q67.5,56.5 70.5,6 L70.5,0';

function svgArc(doc) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'classic-arc');
  svg.setAttribute('viewBox', '0 0 77 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = `<defs><clipPath id="classic-arc-clip"><path d="${ARC_SHAPE}"/></clipPath></defs>`
    + `<path class="classic-arc-track" d="${ARC_SHAPE}"/>`
    + `<path class="classic-arc-fill" d="${ARC_LINE}" pathLength="100" clip-path="url(#classic-arc-clip)" stroke-dasharray="0 100"/>`
    + `<path class="classic-arc-shine" d="M15,52 Q62.5,52 64.5,6"/>`;
  return svg;
}

function el(doc, tag, attrs = {}, text = '') {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (text) node.textContent = text;
  return node;
}

/** PURE: the name over the face, at most 11 characters (PlayerInfoUI.as 672-694), or '' (solo has none). */
export function faceName(name, max = 11) {
  const n = String(name || '').trim();
  if (!n) return '';
  return [...n].length > max ? `${[...n].slice(0, max - 1).join('')}…` : n;
}

export function installClassicTopbar({ doc = globalThis.document, win = globalThis, avatarPortrait = null } = {}) {
  const energyBtn = doc.querySelector('.top-bar .meta-pill.energy');
  const moodBtn = doc.querySelector('.top-bar .meta-pill.mood');
  const actions = doc.querySelector('.top-bar .hud-actions');
  const added = [];

  // The arc and the energy line, inside the energy ring button.
  let arc = null;
  let energyLine = null;
  if (energyBtn) {
    arc = svgArc(doc);
    energyLine = el(doc, 'span', { class: 'classic-energy-text', 'aria-hidden': 'true' });
    energyBtn.append(arc, energyLine);
    added.push(arc, energyLine);
  }

  // The date block and the help button, in the header cluster before the sound button.
  const date = el(doc, 'div', { id: 'classic-date', class: 'classic-date', 'aria-hidden': 'true' });
  date.append(el(doc, 'span', { class: 'classic-date-day' }), el(doc, 'span', { class: 'classic-date-time' }), el(doc, 'span', { class: 'classic-date-date' }));
  const help = el(doc, 'button', { id: 'classic-help-btn', type: 'button', class: 'chrome-btn classic-help-btn', 'aria-label': 'Need help? The hotkeys', 'data-tip': 'Need help?', 'data-sub': 'The hotkeys (hold ?)' });
  help.append(el(doc, 'img', { src: classicArtUrl('help_icon'), alt: '', width: '20', height: '21' }));
  if (actions) {
    const sound = doc.getElementById('sound-btn');
    actions.insertBefore(help, sound || null);
    actions.append(date);
  }
  added.push(date, help);

  // Help: the hold-? sheet (the game shows it on a ? keydown and hides it on the keyup).
  let sheetUp = false;
  const hideSheet = () => {
    if (!sheetUp) return;
    sheetUp = false;
    win.dispatchEvent(new win.KeyboardEvent('keyup', { key: '?', code: 'Slash', shiftKey: true, bubbles: true }));
  };
  help.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sheetUp) return hideSheet();
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true, bubbles: true }));
    sheetUp = Boolean(doc.getElementById('hotkeys-shade') && !doc.getElementById('hotkeys-shade').hidden);
  });
  doc.addEventListener('pointerdown', (e) => { if (sheetUp && !help.contains(e.target)) hideSheet(); }, true);
  doc.addEventListener('keydown', () => hideSheet(), true);

  // Current location: a click opens the Map (CurrentLocationUI.as 21-142 toggled the hub map).
  const plate = doc.getElementById('street-nameplate');
  plate?.addEventListener('click', () => {
    if (uiState().mode === 'classic') doc.getElementById('map-btn')?.click();
  });

  const classic = () => uiState().mode === 'classic';

  function syncVitals() {
    if (!classic()) return;
    const e = shareFromDash(doc.getElementById('bar-energy')?.getAttribute('stroke-dasharray'));
    if (arc) {
      arc.querySelector('.classic-arc-fill').setAttribute('stroke-dasharray', `${(e * 100).toFixed(1)} 100`);
      const stop = String(rampStop(e));
      if (energyBtn.dataset.classicRamp !== stop) energyBtn.dataset.classicRamp = stop;
    }
    if (energyLine) {
      const t = energyText(energyBtn.dataset.tip || energyBtn.getAttribute('aria-label'));
      if (energyLine.textContent !== t) energyLine.textContent = t;
    }
    if (moodBtn) {
      const m = shareFromDash(doc.getElementById('bar-mood')?.getAttribute('stroke-dasharray'));
      const state = moodState(m);
      if (moodBtn.dataset.classicMood !== state) moodBtn.dataset.classicMood = state;
      const pct = `${Math.round(m * 100)}%`;
      if (moodBtn.dataset.classicPct !== pct) moodBtn.dataset.classicPct = pct;
    }
  }

  function syncDate() {
    if (!classic()) return;
    const clock = doc.getElementById('dametime-clock');
    const lines = dateLines(clock?.getAttribute('aria-label'), clock?.textContent);
    const [day, time, when] = date.children;
    if (day.textContent !== lines.day) day.textContent = lines.day;
    if (time.textContent !== lines.time) time.textContent = lines.time;
    if (when.textContent !== lines.date) when.textContent = lines.date;
  }

  function syncVolume() {
    const btn = doc.getElementById('sound-btn');
    if (!btn || !classic()) return;
    const f = String(volumeFrame(doc.getElementById('sfx-volume')?.value, doc.getElementById('music-volume')?.value, btn.dataset.muted === 'true'));
    if (btn.dataset.classicVolume !== f) btn.dataset.classicVolume = f;
  }

  function syncQuoins() {
    const menu = doc.getElementById('player-menu');
    const stats = menu?.querySelector('.pm-stats');
    if (!stats || !classic() || stats.querySelector('[data-classic-quoins]')) return;
    const q = doc.querySelector('#quoin-stat strong')?.textContent?.trim();
    if (!q) return;
    const dt = el(doc, 'dt', { 'data-classic-quoins': '' }, 'Quoins today');
    const dd = el(doc, 'dd', { 'data-classic-quoins': '' });
    dd.append(el(doc, 'b', {}, q));
    stats.append(dt, dd);
  }

  const sync = () => { syncVitals(); syncDate(); syncVolume(); };

  if (typeof win.MutationObserver === 'function') {
    const mo = new win.MutationObserver(sync);
    for (const id of ['bar-energy', 'bar-mood', 'dametime-clock', 'sound-btn']) {
      const n = doc.getElementById(id);
      if (n) mo.observe(n, { attributes: true, characterData: true, childList: true, subtree: true });
    }
    if (energyBtn) mo.observe(energyBtn, { attributes: true, attributeFilter: ['data-tip', 'aria-label'] });
    const menu = doc.getElementById('player-menu');
    if (menu) new win.MutationObserver(syncQuoins).observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  for (const id of ['sfx-volume', 'music-volume']) doc.getElementById(id)?.addEventListener('input', syncVolume);

  // The face: your avatar (game.js ownerPortraitUrl, the still the home card draws), the head in the
  // circle as PlayerFaceUI drew it (the avatar at .8, masked to the circle). Redrawn when the look
  // changes (the Look builder closing) and now and then; the still is cached by look.
  let faceUrl = '';
  async function syncFace() {
    if (!moodBtn || !classic() || typeof avatarPortrait !== 'function') return;
    let url = '';
    try { url = (await avatarPortrait()) || ''; } catch { url = ''; }
    if (url === faceUrl) return;
    faceUrl = url;
    if (url) {
      moodBtn.style.setProperty('--classic-face', `url("${url}")`);
      moodBtn.dataset.classicFace = 'avatar';
    } else {
      moodBtn.style.removeProperty('--classic-face');
      delete moodBtn.dataset.classicFace;
    }
  }
  // The name over the face online; the level solo (no player name there).
  function syncName() {
    const btn = doc.getElementById('player-menu-btn');
    if (!btn) return;
    const name = classic() ? faceName(globalThis.GRODDLE_MP_BOOT?.player?.name) : '';
    if (name) btn.dataset.classicName = name;
    else delete btn.dataset.classicName;
  }
  const avatarPanel = doc.getElementById('avatar-panel');
  if (avatarPanel && typeof win.MutationObserver === 'function') {
    new win.MutationObserver(() => { if (avatarPanel.hidden) syncFace(); }).observe(avatarPanel, { attributes: true, attributeFilter: ['hidden'] });
  }
  win.setInterval?.(syncFace, 20000);

  const show = (state) => {
    const on = state.mode === 'classic';
    // Inline display, not [hidden]: an SVG has no hidden property, and Modern has no rule for these.
    for (const n of added) n.style.display = on ? '' : 'none';
    syncName();
    if (on) {
      sync();
      syncFace();
    }
  };
  onUiModeChange(show);
  show(uiState());
  return { sync };
}
