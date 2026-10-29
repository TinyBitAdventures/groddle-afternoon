/**
 * The non-modal prompt stack (register row G294): the source's prompts,
 * docked in the bottom right of the location view, stacked, each with its
 * own buttons and timeout. Before G294 every engine.prompt showed as the
 * centre dimming quest card; only the race's "Ready to leave?" (G291) was
 * drawn this way.
 *
 * What the source does (tinyspeck/glitch-client and glitch-GameServerJS, CC0):
 * - players/inc_prompts.js prompts_add 58-80 sends { uid, txt, choices,
 *   timeout, timeout_value, icon_buttons, is_modal, sound } (prompts_get_msg
 *   124-142); prompts_add_simple 37-52 is text and one OK; prompts_remove
 *   97-108 takes one away with no answer; prompts_choice 144+ runs the
 *   prompt's callback with the value chosen.
 * - data/prompt/Prompt.as 7-11: timeout, icon_buttons and timeout_value are
 *   ignored when modal; a title is only drawn when modal.
 * - view/gameoverlay/PromptView.as:
 *   - 38-39 7 px padding, 300 px wide; refresh 417-419 docks the stack 30 px
 *     in from the location view's bottom right; 420 hides it while moving.
 *   - addPrompt 210-355: the text alone (prompt_default, drop shadow 0x333333
 *     up-left 1 px, StaticFilters.as 132-141), the buttons to its right in
 *     choice order (286-322), moved under the text when they are wider than
 *     MAX_BUTTON_WIDTHS 100 (324-335); two icon_buttons choices are a check
 *     and an X (253-282, prompt_check.png / prompt_x.png); a sound if sent
 *     (338); fades in over 0.1 s (345-346); a new prompt goes on top of the
 *     stack (347 addChildAt 0) and the stack grows upward (reflow 377-392,
 *     7 px apart); the timeout starts when it is shown (350-354).
 *   - drawNotification 365-375: 0x393b32 at 0.9, rounded 12 (6 px corners).
 *   - checkForNewPrompts 432-479: a normal prompt only shows while the stack
 *     is under half the location view's height (474); the rest wait, and
 *     show when one goes (removePrompt 206) or on the 5 s check (61).
 *   - clickHandler 131-151: CLICK_SUCCESS and the choice's value; a button
 *     on a prompt already fading out plays CLICK_FAILURE and does nothing.
 *   - removePrompt 198-208: fades out over 0.1 s, gone after 0.2 s.
 *   - Hover holds expired prompts until 2 s after the pointer leaves
 *     (onRollOver/onRollOut 116-129, removePromptIfNotOver 153-159):
 *     js/prompt-timeout.js, with the stack as the hover area.
 *   - sendChoice 168-189: an expired prompt sends its timeout_value, or
 *     nothing when it has none.
 *
 * Remake: the prompts take no keyboard focus when they appear (the client's
 * never did), so walking and jumping go on; each prompt is role="dialog"
 * (not modal), so a button you Tab to takes Enter and Space (game.js
 * focusedDialogButton). Modal prompts (is_modal, ConfirmationDialog) stay on
 * the remake's centre card (game.js engine.prompt with modal: true).
 */

import { armPromptTimeout, promptTimeoutMs } from './prompt-timeout.js?v=g405-1';

export const PROMPT_WIDTH = 300; // PromptView.as 39 overall_w
export const PROMPT_PAD = 7; // PromptView.as 38 padd
export const PROMPT_DOCK = 30; // PromptView.as refresh 418-419
export const PROMPT_MAX_BUTTON_WIDTHS = 100; // PromptView.as 35
export const PROMPT_FADE_MS = 100; // PromptView.as 200, 346
export const PROMPT_REMOVE_MS = 200; // PromptView.as 201-207
export const PROMPT_RECHECK_MS = 5000; // PromptView.as 61
export const PROMPT_ICON_CHECK = 'assets/ui/prompt/prompt_check.png';
export const PROMPT_ICON_X = 'assets/ui/prompt/prompt_x.png';

/** prompts_add_simple 37-52: one OK when no choices are sent. */
export const DEFAULT_PROMPT_CHOICES = Object.freeze([Object.freeze({ label: 'OK', value: 'ok' })]);

/** The choices a prompt shows: labelled ones, else one OK. */
export function promptChoices(choices) {
  const list = (Array.isArray(choices) ? choices : [])
    .filter((c) => c && c.label)
    .map((c, i) => ({ label: String(c.label), value: c.value === undefined ? String(i) : c.value }));
  return list.length ? list : DEFAULT_PROMPT_CHOICES.map((c) => ({ ...c }));
}

/** PromptView.as 253: icon buttons only for exactly two choices. */
export function usesIconButtons(prompt) {
  return Boolean(prompt?.iconButtons) && promptChoices(prompt.choices).length === 2;
}

/** A tiny button's width before layout (about 7 px a letter plus 14 px of padding, 34 px at least). */
export function estimateButtonWidth(label) {
  return Math.max(34, Math.round(String(label || '').length * 7 + 14));
}

/** PromptView.as 324-335: buttons wider than 100 px in all go under the text. */
export function buttonsBelowText(widths) {
  const total = (widths || []).reduce((sum, w) => sum + (Number(w) || 0), 0);
  return total > PROMPT_MAX_BUTTON_WIDTHS;
}

/** PromptView.as 474: room for another normal prompt while the stack is under half the view. */
export function promptStackHasRoom(stackHeight, viewHeight) {
  const view = Number(viewHeight) || 0;
  if (view <= 0) return true;
  return (Number(stackHeight) || 0) < view / 2;
}

/** A prompt as the stack keeps it. */
export function normalizePrompt(opts = {}, uid = '') {
  return {
    uid: String(opts.uid || uid),
    text: String(opts.text ?? opts.txt ?? ''),
    choices: promptChoices(opts.choices),
    iconButtons: Boolean(opts.iconButtons ?? opts.icon_buttons),
    timeoutMs: promptTimeoutMs({ timeout: opts.timeout, timeoutMs: opts.timeoutMs }),
    timeoutValue: opts.timeoutValue ?? opts.timeout_value ?? null,
    sound: opts.sound ? String(opts.sound) : '',
    onChoice: typeof opts.onChoice === 'function' ? opts.onChoice : null,
    onTimeout: typeof opts.onTimeout === 'function' ? opts.onTimeout : null,
  };
}

export const PROMPT_STACK_CSS = `
.prompt-stack { position: absolute; z-index: 95; right: ${PROMPT_DOCK}px; bottom: calc(var(--pack-live-height, 112px) + ${PROMPT_DOCK}px);
  width: min(${PROMPT_WIDTH}px, calc(100% - 32px)); display: flex; flex-direction: column; gap: ${PROMPT_PAD}px; pointer-events: none; }
.prompt-stack:empty { display: none; }
html[data-street-cards] .prompt-stack { visibility: hidden; }
.prompt-stack .game-prompt { pointer-events: auto; box-sizing: border-box; width: 100%; padding: ${PROMPT_PAD}px; border-radius: 6px;
  background: rgba(57,59,50,.9); color: #fff; display: flex; align-items: flex-end; gap: ${PROMPT_PAD * 2}px;
  font: 700 14px/1.35 Nunito, 'Trebuchet MS', sans-serif; box-shadow: 0 2px 6px rgba(0,0,0,.25);
  opacity: 1; transition: opacity ${PROMPT_FADE_MS}ms linear; }
.prompt-stack .game-prompt.is-entering, .prompt-stack .game-prompt.is-leaving { opacity: .1; }
.prompt-stack .game-prompt.is-leaving { opacity: 0; }
.prompt-stack .game-prompt.is-below { flex-direction: column; align-items: stretch; gap: ${PROMPT_PAD}px; }
.prompt-stack .game-prompt p { flex: 1 1 auto; min-width: 0; margin: 0; padding: 0 0 2px 2px; white-space: pre-line; overflow-wrap: anywhere;
  text-shadow: -1px -1px 0 #333; }
.prompt-stack .game-prompt-choices { flex: none; display: flex; align-self: flex-end; }
.prompt-stack .game-prompt-choices button { min-width: 34px; height: 25px; padding: 0 12px; border: 1px solid rgba(255,255,255,.28); border-radius: 0;
  font: 800 13px/1 Nunito, 'Trebuchet MS', sans-serif; color: #fff; cursor: pointer; background: linear-gradient(#7aa83f, #4f7d22); }
.prompt-stack .game-prompt-choices button + button { border-left: 1px solid #838383; box-shadow: inset 1px 0 0 #fff; }
.prompt-stack .game-prompt-choices button:first-child { border-top-left-radius: 4px; border-bottom-left-radius: 4px; }
.prompt-stack .game-prompt-choices button:last-child { border-top-right-radius: 4px; border-bottom-right-radius: 4px; }
.prompt-stack .game-prompt-choices button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
.prompt-stack .game-prompt-choices.is-icons button { width: 24px; min-width: 24px; padding: 0; display: grid; place-items: center; }
.prompt-stack .game-prompt-choices.is-icons img { display: block; image-rendering: auto; }
@media (max-width: 620px) { .prompt-stack { right: 16px; } }
`;

/**
 * The stack.
 *   document, mount() -> host element (#game-root), viewHeight() -> the
 *   location view's height (for the half-height rule), playSound(key),
 *   setData(key, value), timer(fn, ms) -> cancel (prompt timeouts; screen-fx
 *   cardPausedTimeout by default), later(fn, ms) / every(fn, ms) -> cancel
 *   (fades and the 5 s check; tests pass fakes), held() -> true while nothing may show
 *   (STARTCARD: the start card is up; the prompts wait in the queue, timers not armed).
 * Returns { add(opts) -> uid, remove(uid), has(uid), shown(), queued(), flush(), clear(), root }.
 */
export function createPromptStack(opts = {}) {
  const doc = opts.document;
  const win = opts.win || doc?.defaultView || globalThis;
  const setData = opts.setData || (() => {});
  const playSound = opts.playSound || (() => {});
  const later = opts.later || ((fn, ms) => { const id = win.setTimeout(fn, ms); return () => win.clearTimeout(id); });
  const every = opts.every || ((fn, ms) => { const id = win.setInterval(fn, ms); return () => win.clearInterval(id); });
  const timer = opts.timer; // undefined: armPromptTimeout's cardPausedTimeout
  let seq = 0;
  let root = null;
  /** Shown prompts, newest first (the DOM order). */
  const shown = [];
  /** Prompts waiting for room, oldest first. */
  const queue = [];
  let stopRecheck = null;

  function ensureRoot() {
    if (root?.isConnected) return root;
    if (!doc.getElementById('prompt-stack-style')) {
      const style = doc.createElement('style');
      style.id = 'prompt-stack-style';
      style.textContent = PROMPT_STACK_CSS;
      doc.head?.appendChild(style);
    }
    root = doc.getElementById('prompt-stack');
    if (!root) {
      root = doc.createElement('div');
      root.id = 'prompt-stack';
      root.className = 'prompt-stack';
      root.setAttribute('aria-live', 'polite');
      (opts.mount?.() || doc.body).appendChild(root);
    }
    return root;
  }

  function stackHeight() {
    if (opts.measure) return opts.measure(root);
    return root?.getBoundingClientRect?.().height || 0;
  }

  function publish() {
    setData('promptStack', String(shown.filter((p) => !p.leaving).length));
    setData('promptQueued', String(queue.length));
  }

  function buildEl(p) {
    const box = doc.createElement('div');
    box.className = 'game-prompt is-entering';
    box.dataset.promptUid = p.uid;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    const text = doc.createElement('p');
    text.textContent = p.text;
    box.appendChild(text);
    const row = doc.createElement('div');
    const icons = usesIconButtons(p);
    row.className = `game-prompt-choices${icons ? ' is-icons' : ''}`;
    p.choices.forEach((choice, i) => {
      const bt = doc.createElement('button');
      bt.type = 'button';
      bt.dataset.promptChoice = String(i);
      if (icons) {
        const img = doc.createElement('img');
        img.src = i === 0 ? PROMPT_ICON_CHECK : PROMPT_ICON_X;
        img.alt = '';
        bt.appendChild(img);
        bt.title = choice.label; // the tip (PromptView.as 261-264)
        bt.setAttribute('aria-label', choice.label);
      } else bt.textContent = choice.label;
      bt.addEventListener('click', (event) => {
        event.stopPropagation?.();
        choose(p, i);
      });
      row.appendChild(bt);
    });
    box.appendChild(row);
    // 324-335: buttons wider than 100 px in all sit under the text.
    const widths = icons
      ? p.choices.map(() => 24)
      : [...row.children].map((bt, i) => bt.getBoundingClientRect?.().width || estimateButtonWidth(p.choices[i].label));
    box.classList.toggle('is-below', !icons && buttonsBelowText(widths));
    return box;
  }

  function show(p) {
    ensureRoot();
    p.el = buildEl(p);
    root.prepend(p.el); // 347: addChildAt(sp, 0), the newest on top
    shown.unshift(p);
    if (!usesIconButtons(p)) {
      // Measure again now the buttons are laid out.
      const widths = [...p.el.querySelectorAll('[data-prompt-choice]')].map((bt) => bt.getBoundingClientRect?.().width || 0);
      if (widths.every((w) => w > 0)) p.el.classList.toggle('is-below', buttonsBelowText(widths));
    }
    later(() => p.el?.classList.remove('is-entering'), 16);
    if (p.sound) playSound(p.sound);
    setData('promptLast', p.text);
    if (p.timeoutMs) {
      p.handle = armPromptTimeout({
        ms: p.timeoutMs,
        timeoutValue: p.timeoutValue,
        hoverEl: root,
        timer,
        onExpire: (choice) => {
          setData('promptTimeout', `expired:${choice ?? ''}`);
          drop(p);
          if (p.onTimeout) p.onTimeout(choice);
          else if (choice !== null) p.onChoice?.(choice);
        },
      });
      setData('promptTimeout', `armed:${p.timeoutMs}`);
    }
  }

  function fill() {
    while (queue.length && !opts.held?.() && promptStackHasRoom(stackHeight(), opts.viewHeight?.() || 0)) show(queue.shift());
    if (queue.length && !stopRecheck) stopRecheck = every(fill, PROMPT_RECHECK_MS);
    if (!queue.length && stopRecheck) {
      stopRecheck();
      stopRecheck = null;
    }
    publish();
  }

  /** removePrompt 198-208: fade, then gone, then the waiting ones. */
  function drop(p) {
    if (p.leaving) return;
    p.leaving = true;
    p.handle?.cancel();
    p.el?.classList.add('is-leaving');
    publish();
    later(() => {
      const at = shown.indexOf(p);
      if (at >= 0) shown.splice(at, 1);
      p.el?.remove();
      p.el = null;
      fill();
    }, PROMPT_REMOVE_MS);
  }

  function choose(p, index) {
    if (p.leaving) {
      playSound('CLICK_FAILURE');
      return;
    }
    playSound('CLICK_SUCCESS');
    const choice = p.choices[index];
    setData('promptChoice', String(choice?.value ?? ''));
    drop(p);
    p.onChoice?.(choice?.value);
  }

  return {
    get root() {
      return root;
    },
    /** prompts_add: the new prompt's uid ('' when it has no text, 58). */
    add(prompt = {}) {
      const p = normalizePrompt(prompt, `prompt-${(seq += 1)}`);
      if (!p.text) return '';
      ensureRoot();
      queue.push(p);
      fill();
      return p.uid;
    },
    /** prompts_remove 97-108: take a prompt away (shown or waiting) with no answer. */
    remove(uid) {
      const key = String(uid || '');
      const q = queue.findIndex((p) => p.uid === key);
      if (q >= 0) {
        queue.splice(q, 1);
        fill();
        return true;
      }
      const p = shown.find((row) => row.uid === key && !row.leaving);
      if (!p) return false;
      drop(p);
      return true;
    },
    has(uid) {
      const key = String(uid || '');
      return queue.some((p) => p.uid === key) || shown.some((p) => p.uid === key && !p.leaving);
    },
    shown: () => shown.filter((p) => !p.leaving).map((p) => ({ uid: p.uid, text: p.text })),
    queued: () => queue.map((p) => ({ uid: p.uid, text: p.text })),
    /** Show what waited (held() has just gone false) without waiting for the 5 s check. */
    flush() {
      fill();
    },
    /** Click a shown prompt's choice by index (QA). */
    choose(uid, index = 0) {
      const p = shown.find((row) => row.uid === String(uid));
      if (!p) return false;
      choose(p, index);
      return true;
    },
    clear() {
      queue.length = 0;
      for (const p of [...shown]) drop(p);
      fill();
    },
  };
}
