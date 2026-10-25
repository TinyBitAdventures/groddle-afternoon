/**
 * Game mode: 'solo' or 'multiplayer', the one source of truth for which game
 * this page is running (multiplayer phase 1, Austin's plan of 2026-10-25).
 *
 * Solo is the game as it has always been: saved in this browser, no login,
 * and every marketing link, Easter egg and QA route (?questdemo= and the
 * rest) assumes it. It is the default everywhere, and no query param can turn
 * a page into a multiplayer game.
 *
 * Multiplayer is declared only by its own entry page, /play/online/: that
 * page's first inline script reads <html data-mode="multiplayer">, sets
 * window.GRODDLE_MODE and strips location.search before any game module
 * loads, so demo and QA params never reach a multiplayer game. Practice
 * copies (?practice=1, js/practice-mode.js) are always solo.
 *
 * Read it as GAME_MODE in modules or engine.mode in features; the game
 * canvas carries it as data-mode. js/save-store.js picks the save behind
 * save()/load() from it.
 */

export const SOLO = 'solo';
export const MULTIPLAYER = 'multiplayer';
export const GAME_MODES = Object.freeze([SOLO, MULTIPLAYER]);

/** The multiplayer entry page, relative to the site root (play/index.html has <base href="../">). */
export const MULTIPLAYER_ENTRY_PATH = 'play/online/';

/**
 * The mode a page declared, or solo. Only the exact string 'multiplayer'
 * set by an entry page counts; practice copies stay solo.
 * @param {object} [scope] the window (globalThis)
 * @returns {'solo'|'multiplayer'}
 */
export function resolveGameMode(scope = globalThis) {
  try {
    if (scope?.groddlePractice === true) return SOLO;
    return scope?.GRODDLE_MODE === MULTIPLAYER ? MULTIPLAYER : SOLO;
  } catch {
    return SOLO;
  }
}

/** This page's mode, fixed when the game loads. */
export const GAME_MODE = resolveGameMode();

export function isSolo(mode = GAME_MODE) {
  return mode !== MULTIPLAYER;
}

/**
 * Whether a brand-new save's start card asks Solo or Multiplayer first. Only
 * a plain solo /play/ does: any query (autostart, fresh, resetgame, practice
 * or any demo/QA param) skips the question and stays solo, as before.
 * @param {{ mode?: string, search?: string }} [opts]
 */
export function offersModeChoice({ mode = GAME_MODE, search = '' } = {}) {
  if (mode !== SOLO) return false;
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return false;
  }
  return [...params.keys()].length === 0;
}

/** Absolute URL of the multiplayer entry page from a document's base URI. */
export function multiplayerEntryUrl(baseUri) {
  return new URL(MULTIPLAYER_ENTRY_PATH, baseUri).href;
}

/** The start card's first question (plain remake copy, no em-dashes). */
export const MODE_CHOICE_HTML = `
    <p><strong>How would you like to play?</strong> Solo is your own scrap of Ur,
      saved in this browser. Multiplayer shares Ur with other Glitches and needs an account.</p>
    <div class="nx-start-row">
      <button type="button" data-mode-solo>Solo</button>
      <button type="button" class="alt" data-mode-multiplayer>Multiplayer</button>
    </div>`;

/**
 * Put the Solo / Multiplayer question in a start-card box. Solo calls
 * onSolo(), which replaces the box with the tutorial choice; Multiplayer
 * calls onMultiplayer(), which leaves for the entry page.
 * @param {{ innerHTML: string, querySelector(sel: string): any }} box
 * @param {{ onSolo: () => void, onMultiplayer: () => void }} handlers
 */
export function mountModeChoice(box, { onSolo, onMultiplayer }) {
  box.innerHTML = MODE_CHOICE_HTML;
  if (box.dataset) box.dataset.step = 'mode';
  box.querySelector('[data-mode-solo]').addEventListener('click', () => onSolo());
  box.querySelector('[data-mode-multiplayer]').addEventListener('click', () => onMultiplayer());
}
