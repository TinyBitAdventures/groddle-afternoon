/**
 * The Magic Rock familiar, final 2012 form (G211, G218, G219, G220).
 *
 * The final client had no rock in the HUD (research/wayback/G210-G211.md:
 * the header rock left between November 2011 and June 2012). The familiar
 * lives inside its dialogs, and this module holds what they share:
 *
 * - the `pet_rock` art: the CC0 OGA sheets
 *   (opengameart/extracted_instances/being_watched/glitch-assets/pet_rock/,
 *   idle = 193 frames of 81 x 102 at 30 fps, 12 per row), drawn the way the
 *   client's ItemIconView('pet_rock', wh) fits the rock into a wh box;
 * - the rays, drawn as vector from the source FLAs (not exported art):
 *   Rays.SCENE_THICK_SLOW at scale 0.3 behind urgent quest offers
 *   (QuestConversationUI.as 41, 71-72, 147-153; glitch-client
 *   TSEngineAssets/level_up_rays.fla, LIBRARY/raysThickSlowAnim.xml and
 *   raysThickSlow.xml) and the pet_rock_rays overlay of the tutorial voice
 *   (glitch-overlays/pet_rock_rays.fla, LIBRARY/lightRayAnim.xml,
 *   lightRays.xml, Pet_Rock.xml). Both are six 30 degree wedges (0-30,
 *   60-90, ... clockwise from 3 o'clock) filled with a white radial gradient,
 *   turning 60 degrees per loop, so the loop is seamless;
 * - the quest card look picker, the learned-skill panel model and the
 *   easeOutBounce the achievement drop uses.
 *
 * Pure helpers are exported for tests; the DOM helpers check for `document`.
 */

/** Flash frame rate of the familiar art and both ray FLAs (DOMDocument frameRate="30"). */
export const FAMILIAR_FPS = 30;

/**
 * pet_rock sheets (pet_rock__x1_<state>_png_*.png). `bbox` is the union of
 * every frame's opaque pixels inside its 81 x 102 cell, so a fitted rock
 * never moves between frames.
 */
export const PET_ROCK_SHEETS = Object.freeze({
  idle: Object.freeze({
    src: 'assets/sprites/pet-rock/pet_rock_idle.png',
    cols: 12,
    frames: 193,
    cellW: 81,
    cellH: 102,
    sheetW: 972,
    sheetH: 1734,
    bbox: Object.freeze({ x: 23, y: 18, w: 36, h: 51 }),
  }),
});

/** QuestConversationUI.as 34: ROCK_WH = 80 (the card rock). */
export const QUEST_ROCK_WH = 80;
/** QuestConversationUI.as 35: BUBBLE_W = 462. */
export const QUEST_BUBBLE_W = 462;
/** QuestsDialog.as 335-360: an emergency offer sits centred, 80 px under the header. */
export const QUEST_CARD_TOP = 80;
/** AchievementView.as 48: FAMILIAR_WH = 68. */
export const ACHIEVEMENT_ROCK_WH = 68;
/** FamiliarDialog.as 500-509: centred, header bottom + 30. */
export const FAMILIAR_DIALOG_TOP = 30;

/**
 * Background geometry for one frame of a pet_rock sheet fitted into a
 * `size` x `size` box (ItemIconView keeps the aspect and centres the art).
 */
export function petRockFrameStyle(frame = 0, size = QUEST_ROCK_WH, state = 'idle') {
  const sheet = PET_ROCK_SHEETS[state] || PET_ROCK_SHEETS.idle;
  const i = ((Math.floor(Number(frame) || 0) % sheet.frames) + sheet.frames) % sheet.frames;
  const scale = size / Math.max(sheet.bbox.w, sheet.bbox.h);
  const offX = (size - sheet.bbox.w * scale) / 2;
  const offY = (size - sheet.bbox.h * scale) / 2;
  const col = i % sheet.cols;
  const row = Math.floor(i / sheet.cols);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    frame: i,
    scale: round(scale),
    backgroundSize: `${round(sheet.sheetW * scale)}px ${round(sheet.sheetH * scale)}px`,
    backgroundPosition: `${round(offX - (col * sheet.cellW + sheet.bbox.x) * scale)}px ${round(offY - (row * sheet.cellH + sheet.bbox.y) * scale)}px`,
  };
}

/** Source ray sets, read from the FLA XML (twips / 20 = px). */
export const RAY_SETS = Object.freeze({
  // level_up_rays.fla raysThickSlowAnim: radius 5425 twips (271 px), gradient
  // matrix a=0.3344 (274 px), stops 0.66 / 0.32 at 0.31 / 0; raysThickSlow
  // turns it 59.5 degrees over 178 frames. QuestConversationUI scales it 0.3.
  quest: Object.freeze({
    radius: 271.25 * 0.3,
    stops: Object.freeze([[0, 0.66], [0.31, 0.32], [1, 0]]),
    loopFrames: 179,
  }),
  // pet_rock_rays.fla lightRayAnim: radius 1408 twips (70.4 px) in a
  // 145 x 141 document, stops 0.66 / 0; lightRays (the Pet_Rock layer)
  // turns it 59.5 degrees over 95 frames.
  vog: Object.freeze({
    radius: 70.4,
    stops: Object.freeze([[0, 0.66], [1, 0]]),
    loopFrames: 96,
  }),
});

/** pet_rock_rays.fla DOMDocument: 145 x 141, the rock and rays centred. */
export const VOG_ART_W = 145;

/** Seconds for one seamless 60 degree turn of a ray set. */
export function raySpinSeconds(kind = 'quest') {
  const set = RAY_SETS[kind] || RAY_SETS.quest;
  return Math.round((set.loopFrames / FAMILIAR_FPS) * 1000) / 1000;
}

/** The six wedge paths of a ray set, centred on (r, r) in an SVG of side 2r. */
export function rayWedgePaths(radius = 100) {
  const r = Number(radius) || 100;
  const pt = (deg) => {
    const a = (deg * Math.PI) / 180;
    return `${Math.round((r + r * Math.cos(a)) * 100) / 100} ${Math.round((r + r * Math.sin(a)) * 100) / 100}`;
  };
  const out = [];
  for (let k = 0; k < 6; k += 1) {
    const a0 = k * 60;
    out.push(`M${r} ${r}L${pt(a0)}A${r} ${r} 0 0 1 ${pt(a0 + 30)}Z`);
  }
  return out;
}

/** Inline SVG markup for a ray set at `radius` px (white radial fill). */
export function raysSvg(kind = 'quest', radius = RAY_SETS[kind]?.radius || 80, id = `fam-rays-${kind}`) {
  const set = RAY_SETS[kind] || RAY_SETS.quest;
  const r = Math.round(radius * 100) / 100;
  const stops = set.stops
    .map(([at, alpha]) => `<stop offset="${at}" stop-color="#fff" stop-opacity="${alpha}"/>`)
    .join('');
  const paths = rayWedgePaths(r).map((d) => `<path d="${d}"/>`).join('');
  return `<svg class="fam-rays-svg" viewBox="0 0 ${2 * r} ${2 * r}" width="${2 * r}" height="${2 * r}" aria-hidden="true">` +
    `<defs><radialGradient id="${id}" cx="${r}" cy="${r}" r="${r}" gradientUnits="userSpaceOnUse">${stops}</radialGradient></defs>` +
    `<g fill="url(#${id})">${paths}</g></svg>`;
}

/**
 * Which look the shared quest card takes. `familiar`: the Magic Rock speaks
 * (its quest offers, story offers from the quest log, its other lines):
 * QuestConversationUI. `vog`: a tutorial voice-of-rock overlay
 * (inc_announcements.js bubble_familiar). Anything else keeps the plain card.
 */
export function familiarLook({ look = '', kicker = '', mode = '' } = {}) {
  if (look === 'vog' || look === 'familiar' || look === 'plain') return look;
  if (mode === 'offer') return 'familiar';
  if (String(kicker).trim() === 'Magic Rock') return 'familiar';
  return 'plain';
}

/** QuestConversationUI.as 86: the header of an offer card. */
export function familiarCardHeading({ offer = false, kicker = '' } = {}) {
  return offer ? 'New Quest' : String(kicker || 'Magic Rock');
}

/** Robert Penner easeOutBounce (TSTweener 'easeOutBounce'), t in [0, 1]. */
export function easeOutBounce(t) {
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) {
    const y = x - 1.5 / d;
    return n * y * y + 0.75;
  }
  if (x < 2.5 / d) {
    const y = x - 2.25 / d;
    return n * y * y + 0.9375;
  }
  const y = x - 2.625 / d;
  return n * y * y + 0.984375;
}

/** AchievementView.as 466-480, 552: the drop timings and the bubble text. */
export const ACHIEVEMENT_DROP = Object.freeze({ delayMs: 1000, durationMs: 1000, bubbleAfterMs: 400 });

export function achievementBubbleText({ status = '', name = '' } = {}) {
  // inc_achievements.js 310-311: status_text, or 'You got the <name> badge!'.
  const line = String(status || '').trim() || (name ? `You got the ${name} badge!` : '');
  return { head: 'New Achievement!', line };
}

/**
 * FamiliarDialog SKILL_LEARNED model (FamiliarDialog.as 139-205, 353-439):
 * 2 columns, 3 past 8 skills (BREAK_COUNT), labels cut at 15 characters in 3
 * columns (StringUtil.truncate: 12 characters and '...').
 */
export const SKILL_BREAK_COUNT = 8;
export const SKILL_LABEL_MAX = 15;

export function skillLearnedModel({ classTsid = '', name = '', learned = '', next = [] } = {}) {
  const list = (Array.isArray(next) ? next : []).filter((s) => s && s.classTsid && s.classTsid !== classTsid);
  const cols = list.length > SKILL_BREAK_COUNT ? 3 : 2;
  return {
    classTsid,
    header: 'Woohoo! New skill learned...',
    name: String(name || classTsid),
    learned: String(learned || ''),
    chooseLabel: 'Choose a Skill to Learn Next',
    // The client's link opened the web skill tree in a new window; here it
    // opens the Skills panel, so the "(opens in new window)" note is dropped.
    treeLabel: 'View Full Skill Tree',
    cols,
    skills: list.map((s) => ({
      classTsid: s.classTsid,
      name: String(s.name || s.classTsid),
      label: cols === 3 ? truncateLabel(s.name || s.classTsid, SKILL_LABEL_MAX) : String(s.name || s.classTsid),
    })),
  };
}

/** StringUtil.truncate: past `max`, the first max - 3 characters and '...'. */
export function truncateLabel(text, max = SKILL_LABEL_MAX) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/** CC0 skill picture for a skill class (imagination card art layers). */
export function skillArtFor(classTsid, layers = []) {
  const family = String(classTsid || '').replace(/_\d+$/, '').replace(/_/g, '');
  const name = `art_skill_${family}`;
  return layers.includes(name) ? `assets/imagination/cards/${name}.svg` : 'assets/imagination/cards/art_brain.svg';
}

/** Activity line for a finished skill (inc_skills.js 1442-1444). */
export function skillLearnedActivity(name, learned = '', { offline = false } = {}) {
  const lead = offline ? `While you were away, you finished learning ${name}.` : `You finished learning ${name}.`;
  return learned ? `${lead} ${learned}` : lead;
}

/* ------------------------------------------------------------------ DOM */

const rocks = new Set();
let rockTimer = 0;

function tickRocks() {
  for (const rock of rocks) {
    if (!rock.el.isConnected) {
      rocks.delete(rock);
      continue;
    }
    // Only advance rocks that are on screen (hidden dialogs keep their frame).
    if (rock.el.offsetParent === null) continue;
    rock.frame = (rock.frame + 1) % (PET_ROCK_SHEETS[rock.state] || PET_ROCK_SHEETS.idle).frames;
    paintRock(rock);
  }
  if (!rocks.size) {
    clearInterval(rockTimer);
    rockTimer = 0;
  }
}

function paintRock(rock) {
  const st = petRockFrameStyle(rock.frame, rock.size, rock.state);
  rock.el.style.backgroundSize = st.backgroundSize;
  rock.el.style.backgroundPosition = st.backgroundPosition;
}

/**
 * Turn `el` into an animated pet_rock (idle by default) fitted in `size` px.
 * Calling it again resizes the same rock. Returns the element.
 */
export function mountPetRock(el, { size = QUEST_ROCK_WH, state = 'idle' } = {}) {
  if (!el) return el;
  const sheet = PET_ROCK_SHEETS[state] || PET_ROCK_SHEETS.idle;
  let rock = [...rocks].find((r) => r.el === el);
  if (!rock) {
    rock = { el, frame: 0, size, state };
    rocks.add(rock);
  }
  rock.size = size;
  rock.state = state;
  el.classList.add('pet-rock');
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.backgroundImage = `url("${sheet.src}")`;
  el.style.backgroundRepeat = 'no-repeat';
  paintRock(rock);
  if (!rockTimer && typeof setInterval === 'function') rockTimer = setInterval(tickRocks, 1000 / FAMILIAR_FPS);
  return el;
}

/**
 * The rock (with optional rays) as one block: `.fam-rock` > `.fam-rays` +
 * `.pet-rock`. Built once per host; `rays` toggles the ray set.
 */
export function ensureFamiliarRock(host, { size = QUEST_ROCK_WH, rays = 'quest', raysRadius } = {}) {
  if (!host || typeof document === 'undefined') return null;
  let wrap = host.querySelector(':scope > .fam-rock');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'fam-rock';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<div class="fam-rays"></div><div class="fam-rock-art"></div>';
    host.prepend(wrap);
  }
  const art = wrap.querySelector('.fam-rock-art');
  mountPetRock(art, { size });
  wrap.style.setProperty('--fam-rock-size', `${size}px`);
  const raysEl = wrap.querySelector('.fam-rays');
  const kind = rays === 'vog' ? 'vog' : 'quest';
  const radius = raysRadius || RAY_SETS[kind].radius;
  const key = `${kind}:${Math.round(radius)}`;
  if (raysEl.dataset.key !== key) {
    raysEl.innerHTML = raysSvg(kind, radius, `fam-rays-${kind}-${Math.round(radius)}`);
    raysEl.dataset.key = key;
    raysEl.style.setProperty('--fam-ray-spin', `${raySpinSeconds(kind)}s`);
    raysEl.style.width = raysEl.style.height = `${Math.round(radius * 2)}px`;
  }
  return wrap;
}

/**
 * Dress a `.quest-dialogue` modal for a look: sets data-look / data-urgent,
 * builds the rock (and its rays) when the look needs one, and for the voice
 * overlay sizes the art from the viewport (inc_announcements.js 189-218:
 * size 40% of the smaller side, x 50%, y 15%; the bubble at top_y 25%).
 */
export function applyFamiliarLook(modal, { look = 'plain', urgent = false, width = 0 } = {}) {
  if (!modal) return;
  modal.dataset.look = look;
  modal.dataset.urgent = urgent ? 'true' : 'false';
  const card = modal.querySelector('.quest-dialogue-card');
  if (!card) return;
  if (look === 'familiar') {
    ensureFamiliarRock(card, { size: QUEST_ROCK_WH, rays: 'quest' });
  } else if (look === 'vog') {
    const w = modal.clientWidth || 800;
    const h = modal.clientHeight || 600;
    const box = 0.4 * Math.min(w, h);
    const scale = box / VOG_ART_W;
    const rockSize = Math.round(PET_ROCK_SHEETS.idle.bbox.h * scale);
    ensureFamiliarRock(card, { size: rockSize, rays: 'vog', raysRadius: RAY_SETS.vog.radius * scale });
    card.style.setProperty('--vog-w', `${width || 500}px`);
    // The card's top sits at 25% + the 12 px pointer; the rock's centre at 15%.
    card.style.setProperty('--vog-dy', `${-Math.round(0.1 * h + 12)}px`);
  }
}
