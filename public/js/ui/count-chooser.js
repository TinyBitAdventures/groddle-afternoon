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
 * Wire a count field: Enter takes what was typed and presses OK, the arrows step it (not the field's own
 * spin), Esc goes back. `set(n)` redraws with the new count; `confirm(n)` is OK; `cancel()` is back.
 */
export function bindCountField(input, { max, set, confirm, cancel }) {
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
  input.addEventListener('change', () => set(countFromField(input.value, max())));
}
