/**
 * G1117 (#592): on a slow laptop the loading card (#boot-loader, play/index.html) sat for a long time
 * saying only "Gathering a little scrap of Ur…", so it looked stuck. It now says which step of the
 * start it is on, in plain words, with a bar: first the game's code (every file the browser has
 * fetched so far, counted as they arrive), then each load game.js main() already waits for (the
 * renderer, pictures, sounds, the catalogs, the world map, your street, your look).
 *
 * The page loads this module ahead of game.js (play/index.html, and play/online/index.html built
 * from it), so it runs while the rest of the game's code is still downloading; game.js imports the
 * same instance and calls bootStep() as main() goes. Nothing here is needed for the game to run: with
 * no card on the page, or no PerformanceObserver, every call does nothing.
 *
 * #745: it also starts What's new (js/whats-new.js), the newest update's lines the card shows on every
 * load, so they come up as early as the card does.
 */
import { startWhatsNew } from './whats-new.js?v=c410d2ba';

export const BOOT_STEPS = Object.freeze(['code', 'screen', 'pictures', 'sounds', 'catalogs', 'recipes', 'world', 'street', 'look']);

export const BOOT_TEXT = Object.freeze({
  code: "Loading the game's code",
  screen: 'Getting the screen ready',
  pictures: 'Loading pictures',
  sounds: 'Loading sounds',
  catalogs: 'Reading items, quests and skills',
  recipes: 'Reading recipes',
  world: 'Reading the world map',
  street: 'Drawing your street',
  look: 'Getting your look ready',
  files: (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'file' : 'files'}`,
  of: (i, n) => `step ${i} of ${n}`,
  bar: 'Loading',
});

/**
 * PURE: the card's words for a step: "Loading sounds · step 4 of 9", and while the code loads
 * "Loading the game's code · 214 files · step 1 of 9". { text, step, of, fraction }; an unknown key
 * is null.
 */
export function bootStepText(key, { files = 0 } = {}) {
  const i = BOOT_STEPS.indexOf(key);
  if (i < 0) return null;
  const n = BOOT_STEPS.length;
  const count = key === 'code' && files > 0 ? ` · ${BOOT_TEXT.files(files)}` : '';
  return { text: `${BOOT_TEXT[key]}${count} · ${BOOT_TEXT.of(i + 1, n)}`, step: i + 1, of: n, fraction: i / n };
}

/** PURE: a fetched resource the code step counts (the game's scripts and modules, its style sheets). */
export function countsAsCode(entry) {
  const name = String(entry?.name || '').split(/[?#]/)[0];
  return /\.(?:m?js|css)$/.test(name);
}

let current = '';
let files = 0;
let observer = null;
let drawAt = 0;
let drawTimer = 0;

function nodes(doc) {
  const loader = doc?.getElementById?.('boot-loader');
  if (!loader) return null;
  return { loader, copy: doc.getElementById('boot-loader-copy'), bar: doc.getElementById('boot-loader-bar') };
}

function draw(doc) {
  const n = nodes(doc);
  const words = bootStepText(current, { files });
  if (!n || !words || n.loader.classList?.contains('is-error')) return;
  if (n.copy) n.copy.textContent = words.text;
  n.loader.dataset.bootStep = current;
  if (n.bar) {
    n.bar.hidden = false;
    n.bar.setAttribute('aria-valuenow', String(words.step));
    n.bar.setAttribute('aria-valuemax', String(words.of));
    n.bar.style.setProperty('--boot-progress', `${Math.round(((words.step - 0.5) / words.of) * 100)}%`);
  }
}

/** The file count moves fast: redraw it at most four times a second. */
function drawSoon(doc) {
  const now = Date.now();
  if (now - drawAt >= 250) {
    drawAt = now;
    draw(doc);
    return;
  }
  if (!drawTimer) {
    drawTimer = setTimeout(() => {
      drawTimer = 0;
      drawAt = Date.now();
      draw(doc);
    }, 250);
  }
}

function stopCounting() {
  try {
    observer?.disconnect();
  } catch {
    /* gone already */
  }
  observer = null;
  clearTimeout(drawTimer);
  drawTimer = 0;
}

/** The card shows this step. Steps only move forward; the code step's count stops once it is left. */
export function bootStep(key, doc = globalThis.document) {
  const at = BOOT_STEPS.indexOf(key);
  if (at < 0 || at < BOOT_STEPS.indexOf(current)) return;
  if (current === 'code' && key !== 'code') stopCounting();
  current = key;
  draw(doc);
}

/** The first step: the code, counted as the browser fetches it (PerformanceObserver, buffered). */
export function startBootProgress(doc = globalThis.document, PO = globalThis.PerformanceObserver) {
  if (current || !nodes(doc)) return false;
  bootStep('code', doc);
  if (typeof PO !== 'function') return true;
  try {
    observer = new PO((list) => {
      if (current !== 'code') return;
      const add = list.getEntries().filter(countsAsCode).length;
      if (!add) return;
      files += add;
      drawSoon(doc);
    });
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    observer = null;
  }
  return true;
}

if (typeof document !== 'undefined') {
  startBootProgress(document);
  startWhatsNew(document);
}
