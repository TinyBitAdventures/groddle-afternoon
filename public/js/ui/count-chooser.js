/**
 * MPANELS (phase 2, Warm paper): the How many chooser's shared parts. Feed (and Incubate, Deposit:
 * #feed-picker-qty), Eat more and Drop (the pack's second levels, #pack-popover) and Buy and Sell at a
 * vendor (#vendor-detail) each ask for a count where they were asked from; game.js keeps what each
 * does with it. They share:
 *
 * - the step row: − [a number field] + Max, and the OK button that says the count ("Feed 3");
 * - the keys: the arrows and - / + step by one, Page Up / Page Down by ten, Home and End go to one and
 *   to the most; digits type into the field; Enter is OK, Esc goes back (countKeyValue);
 * - the modern look: a compact popover in the verb menu's paper (style.css .count-pop).
 *
 * A stack's Pick up (the street's verb menu, Decoration Mode) asks with createCountChooser, the same
 * parts with the count kept here.
 */

/** The keys that step a count, and by how much. */
export const COUNT_KEYS = Object.freeze({
  ArrowLeft: -1,
  ArrowDown: -1,
  '-': -1,
  ArrowRight: 1,
  ArrowUp: 1,
  '+': 1,
  '=': 1,
  PageDown: -10,
  PageUp: 10,
});

/**
 * PURE: the count a key gives (one to `max`), or null when the key is not a count key.
 * @param {string} key KeyboardEvent.key
 */
export function countKeyValue(key, value, max, min = 1) {
  const hi = Math.max(min, Math.floor(Number(max)) || min);
  const clamp = (n) => Math.max(min, Math.min(hi, Math.floor(Number(n)) || min));
  if (key === 'Home') return min;
  if (key === 'End') return hi;
  const step = COUNT_KEYS[key];
  return step ? clamp((Math.floor(Number(value)) || min) + step) : null;
}

/** PURE: a typed count, cut to one to `max` (an empty or broken field is one). */
export function countFromField(text, max, min = 1) {
  const n = Math.floor(Number(String(text ?? '').trim()));
  const hi = Math.max(min, Math.floor(Number(max)) || min);
  return Number.isFinite(n) ? Math.max(min, Math.min(hi, n)) : min;
}

/** A finger's first press: the OK button takes the focus, so the phone's keyboard stays down until the field is pressed. */
function coarsePointer() {
  return Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The step row's markup: − [number] + Max. `attrs` names each control's data attribute (the site's own
 * hooks, which its click handlers find): { dec, inc, num, max }.
 */
export function countStepMarkup({ value, max, min = 1, verb = 'Choose', attrs }) {
  const n = Math.max(min, Math.min(max, Math.floor(Number(value)) || min));
  return `<div class="count-pop-step">
          <button type="button" class="count-pop-dec" ${attrs.dec} aria-label="${esc(verb)} one fewer" ${n <= min ? 'disabled' : ''}>−</button>
          <input type="number" class="count-pop-num" ${attrs.num} min="${min}" max="${max}" value="${n}" inputmode="numeric" aria-label="How many" />
          <button type="button" class="count-pop-inc" ${attrs.inc} aria-label="${esc(verb)} one more" ${n >= max ? 'disabled' : ''}>+</button>
          <button type="button" class="count-pop-max" ${attrs.max} ${n >= max ? 'aria-pressed="true"' : ''}>Max</button>
        </div>`;
}

/**
 * PURE: the count a field shows while it is being typed in, or null when there is none yet (an empty
 * field, or a number not finished: "" as a number field reports it). Cut to one to `max`.
 */
export function typedCount(text, max, min = 1) {
  const t = String(text ?? '').trim();
  if (!t || !Number.isFinite(Number(t))) return null;
  return countFromField(t, max, min);
}

/**
 * The step row's ends as a count says (countStepMarkup's −, + and Max), without a redraw: − off at the
 * least, + off and Max pressed at the most.
 */
export function syncCountStep(input, n, max, min = 1) {
  const row = input?.closest?.('.count-pop-step');
  if (!row) return;
  const dec = row.querySelector('.count-pop-dec');
  const inc = row.querySelector('.count-pop-inc');
  const most = row.querySelector('.count-pop-max');
  if (dec) dec.disabled = n <= min;
  if (inc) inc.disabled = n >= max;
  if (most) {
    if (n >= max) most.setAttribute('aria-pressed', 'true');
    else most.removeAttribute('aria-pressed');
  }
}

/**
 * Wire a count field: Enter takes what was typed and presses OK, the arrows step it (not the field's own
 * spin), Esc goes back. `set(n)` redraws with the new count; `confirm(n)` is OK; `cancel()` is back.
 *
 * `preview(n)` (ticket 92): what follows the count as it is typed ("Buy: 1 for 11" while the field
 * says 1), called on every `input` with the typed count, cut to one to the most; it updates the words
 * in place and never redraws the field, so the typing goes on. Leaving the field (`change`) then
 * redraws only when the field shows something else (a count past the most, an empty field): a
 * redraw under a pressed OK button would drop the press.
 */
export function bindCountField(input, { max, set, confirm, cancel, preview = null }) {
  if (!input || input.dataset.countBound) return;
  input.dataset.countBound = '1';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      confirm(countFromField(input.value, max()));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }
    const next = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key) ? countKeyValue(e.key, input.value, max()) : null;
    if (next != null) {
      e.preventDefault();
      e.stopPropagation();
      set(next);
      return;
    }
    // Typing: the keys stay in the field (never the avatar or the street's own keys).
    e.stopPropagation();
  });
  let previewed = null;
  input.addEventListener('input', () => {
    if (typeof preview !== 'function') return;
    const most = max();
    const n = typedCount(input.value, most);
    if (n == null) return;
    previewed = n;
    syncCountStep(input, n, most);
    preview(n);
  });
  input.addEventListener('change', () => {
    const n = countFromField(input.value, max());
    // Already shown as typed: nothing to redraw (and the OK button being pressed stays put).
    if (typeof preview === 'function' && n === previewed && String(input.value).trim() === String(n)) return;
    set(n);
  });
}

/**
 * A chooser that keeps its own count and redraws in place, for a menu that isn't redrawn around it (a
 * stack's Pick up: the world's verb menu, Decoration Mode's actions): the title, the step row, "3 of 5"
 * and OK, all with the shared keys. `hook` names the data attributes (`data-<hook>-panel`, -dec, -inc,
 * -num, -max, -of, -confirm, -back); `back` is a Back button's words, for a menu with no back row of
 * its own. `change(n)` follows the count, `confirm(n)` is OK, `cancel()` is Esc or Back.
 * Returns { panel, focus, count }: the caller puts the panel where it goes.
 */
export function createCountChooser(doc, { title, max, start = max, verb, hook, back = '', change = null, confirm, cancel }) {
  const most = Math.max(1, Math.floor(Number(max)) || 1);
  let n = countFromField(start, most);
  const attr = (part) => `data-${hook}-${part}`;
  const panel = doc.createElement('div');
  panel.className = 'count-pop';
  panel.setAttribute(attr('panel'), '');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', String(title ?? ''));
  panel.innerHTML = `<p class="count-pop-title">${esc(title)}</p>
        ${countStepMarkup({ value: n, max: most, verb, attrs: { dec: attr('dec'), inc: attr('inc'), num: attr('num'), max: attr('max') } })}
        <output class="count-pop-of" ${attr('of')} aria-live="polite">${n} of ${most}</output>
        <div class="count-pop-actions">
          <span class="count-pop-esc mp-modern-only"><span class="kcap">Esc</span> back</span>
          ${back ? `<button type="button" class="count-pop-back" ${attr('back')}>${esc(back)}</button>` : ''}
          <button type="button" class="count-pop-go" ${attr('confirm')}>${esc(verb)} ${n}</button>
        </div>`;
  const q = (part) => panel.querySelector(`[${attr(part)}]`);
  const input = q('num');
  /** `typing`: the field already says it, and rewriting it would break the typing. */
  const show = (next, typing = false) => {
    n = countFromField(next, most);
    if (!typing) input.value = String(n);
    syncCountStep(input, n, most);
    q('of').textContent = `${n} of ${most}`;
    q('confirm').textContent = `${verb} ${n}`;
    change?.(n);
  };
  q('dec').addEventListener('click', () => show(n - 1));
  q('inc').addEventListener('click', () => show(n + 1));
  q('max').addEventListener('click', () => show(most));
  q('confirm').addEventListener('click', () => confirm(n));
  q('back')?.addEventListener('click', () => cancel());
  bindCountField(input, {
    max: () => most,
    set: (v) => show(v),
    preview: (v) => show(v, true),
    confirm: (v) => confirm(v),
    cancel: () => cancel(),
  });
  panel.addEventListener('keydown', (e) => {
    if (e.target === input) return;
    const next = countKeyValue(e.key, n, most);
    if (next != null) {
      e.preventDefault();
      e.stopPropagation();
      show(next);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
    }
  });
  return {
    panel,
    get count() { return n; },
    focus() {
      if (coarsePointer()) {
        q('confirm').focus({ preventScroll: true });
        return;
      }
      input.focus({ preventScroll: true });
      input.select?.();
    },
  };
}
