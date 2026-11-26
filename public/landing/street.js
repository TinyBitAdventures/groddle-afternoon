// The home page's street (Austin 2026-11-25, mockup A): a slice of Hechey Track drawn with the game's
// own sprites and decos. The markup (index.html, .street-hero) holds every picture, so the asset keys
// stay in the HTML; this module only moves things:
// - parallax: each .sh-layer shifts by its --d as the pointer moves over the street;
// - quoins: a click collects one (+n pop, the iMG pill counts), and it comes back after a while;
// - talk: a click on a piggy, chicken, butterfly, tree or the Magic Rock shows its next line from
//   Tiny Speck's own dialogue (js/dialogue.js), in the game's cream bubble;
// - the light: the sky, stars and tint follow Ur's clock, the game's own Dametime and daylight
//   keyframes (js/game-day.js daylightState), and the clock pill shows the time.
// With reduced motion the CSS stops the walking and drifting; clicks still work.
import { dialoguePool } from '../js/dialogue.js?v=fcfed1af';
import { daylightState, dametimeParts } from '../js/game-day.js?v=beeaa24b';

/** The Magic Rock's two hellos, items/magic_rock.js 499 and 989 (pc.label as "friend", like quest copy). */
export const MAGIC_ROCK_LINES = Object.freeze([
  'Hey friend! Come over here to talk to me.',
  'Hey, friend! I have something for you that I think is worth your time.',
]);

/** Bubble lines must fit a bubble over the street; the long story lines stay in the game. */
export const MAX_LINE = 150;

/** The lines one speaker cycles through: its dialogue pool, short lines only. */
export function streetLines(speaker) {
  const pool = speaker === 'magic_rock' ? MAGIC_ROCK_LINES : dialoguePool(speaker) || [];
  return pool.filter((line) => line.length <= MAX_LINE);
}

/** Sky colours per daylight phase (top, middle, horizon), lighter than the game's tint so the art reads. */
export const SKY = Object.freeze({
  night: ['#14204a', '#2c3d6e', '#45507a'],
  dawn: ['#f5b98e', '#f9dcc0', '#c3e6e6'],
  day: ['#bfe8f6', '#d4f2fb', '#b4ece2'],
  dusk: ['#5f5aa0', '#e8907a', '#f6c590'],
});

/** Everything the street paints for one moment: phase, sky, star opacity, tint, and the clock's text. */
export function streetLight(now = Date.now()) {
  const light = daylightState(now);
  const p = dametimeParts(now);
  const h12 = ((p.hour24 + 11) % 12) + 1;
  return {
    phase: light.phase,
    sky: SKY[light.phase],
    stars: light.phase === 'night' ? 0.9 : light.phase === 'dusk' ? 0.2 : 0,
    // The game's own world tint: its colour over the street at its opacity (at most 0.3, at night).
    tint: light.cssColor,
    tintOpacity: light.opacity,
    clock: `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour24 < 12 ? 'AM' : 'PM'}`,
  };
}

/** Where a bubble goes: above the speaker (its bottom at `above`) when its height fits under the
 * hero's top with 8 px to spare, else under the speaker (its top at `below`). */
export function bubblePlacement(above, height, below) {
  return above - height - 14 >= 8 ? { under: false, top: above } : { under: true, top: below };
}

/** The stage's scale for a hero this wide: the 1200 px street fills it, never below 0.72 (phones crop the middle). */
export function stageScale(width) {
  return Math.max(0.72, width / 1200);
}

function paint(root, now) {
  const l = streetLight(now);
  root.dataset.phase = l.phase;
  root.style.setProperty('--sky-top', l.sky[0]);
  root.style.setProperty('--sky-mid', l.sky[1]);
  root.style.setProperty('--sky-low', l.sky[2]);
  root.style.setProperty('--stars', l.stars);
  root.style.setProperty('--tint', l.tint);
  root.style.setProperty('--tint-o', l.tintOpacity.toFixed(3));
  const clock = root.querySelector('[data-street-clock]');
  if (clock) clock.textContent = l.clock;
}

export function mountStreet(root = document.getElementById('street-hero')) {
  if (!root) return null;
  const stage = root.querySelector('.sh-stage');
  const scene = root.querySelector('.sh-scene');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fit = () => { if (scene) stage.style.setProperty('--s', stageScale(scene.clientWidth).toFixed(3)); };
  fit();
  addEventListener('resize', fit);

  paint(root, Date.now());
  setInterval(() => paint(root, Date.now()), 10_000);

  if (!reduce) {
    scene.addEventListener('pointermove', (e) => {
      const r = scene.getBoundingClientRect();
      scene.style.setProperty('--px', ((((e.clientX - r.left) / r.width) - 0.5) * 40).toFixed(1));
      scene.style.setProperty('--py', ((((e.clientY - r.top) / r.height) - 0.5) * 30).toFixed(1));
    });
    scene.addEventListener('pointerleave', () => { scene.style.setProperty('--px', 0); scene.style.setProperty('--py', 0); });
  }

  // Talk: one bubble at a time, over the speaker, gone after a few seconds.
  const turns = {};
  let bubble = null;
  let bubbleTimer = 0;
  const live = root.querySelector('[data-street-said]');
  root.querySelectorAll('[data-talk]').forEach((el) => el.addEventListener('click', () => {
    const lines = streetLines(el.dataset.talk);
    if (!lines.length) return;
    turns[el.dataset.talk] = ((turns[el.dataset.talk] ?? -1) + 1) % lines.length;
    const line = lines[turns[el.dataset.talk]];
    bubble?.remove();
    clearTimeout(bubbleTimer);
    // The bubble lives on the hero (over the words and the street) and hangs below the speaker
    // when there is no room above it inside the hero.
    const rb = root.getBoundingClientRect();
    const rt = el.getBoundingClientRect();
    bubble = document.createElement('p');
    bubble.className = 'sh-bubble';
    const who = document.createElement('b');
    who.textContent = el.dataset.name || '';
    bubble.append(who, line);
    const x = Math.max(140, Math.min(rb.width - 140, rt.left + rt.width / 2 - rb.left));
    bubble.style.left = `${x}px`;
    root.append(bubble);
    const above = rt.top - rb.top - 6;
    const below = bubblePlacement(above, bubble.offsetHeight, rt.bottom - rb.top + 14);
    bubble.classList.toggle('is-below', below.under);
    bubble.style.top = `${below.top}px`;
    if (live) live.textContent = `${who.textContent}: ${line}`;
    bubbleTimer = setTimeout(() => { bubble?.remove(); bubble = null; }, 5200);
  }));

  // Quoins: collect, pop, count, come back.
  let img = 0;
  const count = root.querySelector('[data-street-img]');
  const pill = count?.closest('.sh-pill');
  root.querySelectorAll('[data-quoin]').forEach((q) => q.addEventListener('click', () => {
    if (q.classList.contains('is-got')) return;
    q.classList.add('is-got');
    q.setAttribute('aria-disabled', 'true');
    const rb = scene.getBoundingClientRect();
    const rq = q.getBoundingClientRect();
    const pop = document.createElement('span');
    pop.className = 'sh-pop';
    pop.textContent = q.dataset.quoin;
    pop.style.left = `${rq.left + rq.width / 2 - rb.left}px`;
    pop.style.top = `${rq.top - rb.top - 8}px`;
    scene.append(pop);
    setTimeout(() => pop.remove(), 1300);
    img += Number(q.dataset.img || 0);
    if (count) count.textContent = img.toLocaleString('en-US');
    if (pill) { pill.classList.remove('is-bump'); void pill.offsetWidth; pill.classList.add('is-bump'); }
    setTimeout(() => { q.classList.remove('is-got'); q.removeAttribute('aria-disabled'); }, 7000);
  }));

  return { fit };
}
