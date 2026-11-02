/**
 * The source's askPlayer input box for a name (items/bag_bigger.js verbs.rename
 * 501-519: a title, an input label, cancelable, focused, input_max_chars and
 * input_restrict, the current name filled in), drawn as a verb-menu card. The
 * Elemental Pouch's Rename box, now shared by every bag (features/bags-feature.js).
 *
 * openNamePrompt({ title, label, value, maxChars, restrict, onSubmit }) shows it
 * (one at a time); OK or Enter calls onSubmit(the typed value), Cancel, the x and
 * Escape close it. restrict: a RegExp of the characters typing may not add
 * (input_restrict; the answer is cleaned again by whoever takes it).
 */

let open = null;

export function closeNamePrompt() {
  if (open?.parentElement) open.parentElement.removeChild(open);
  open = null;
}

export function namePromptOpen() {
  return Boolean(open?.isConnected);
}

export function openNamePrompt({ title = '', label = '', value = '', maxChars = 32, restrict = null, onSubmit = () => {} } = {}) {
  closeNamePrompt();
  if (typeof document === 'undefined') return null;
  const host = document.getElementById('verb-menu')?.parentElement || document.body;
  const wrap = document.createElement('div');
  wrap.className = 'verb-menu name-prompt';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="verb-menu-card">
      <div class="verb-menu-head">
        <div class="verb-menu-title"></div>
        <button type="button" class="verb-menu-x" aria-label="Cancel">×</button>
      </div>
      <form style="padding:0.2rem 0.85rem 0.85rem;display:grid;gap:0.55rem">
        <label style="font-size:0.82rem;opacity:0.75"></label>
        <input type="text" autocomplete="off" spellcheck="false"
          style="font:inherit;padding:0.45rem 0.6rem;border:1px solid #d9ccb3;border-radius:8px;background:#fff" />
        <div style="display:flex;gap:0.5rem;justify-content:flex-end">
          <button type="button" data-cancel class="verb-choice" style="width:auto;border:1px solid #e4d9c4;border-radius:8px;padding:0.35rem 0.8rem">Cancel</button>
          <button type="submit" class="verb-choice" style="width:auto;border:1px solid #9cc47a;border-radius:8px;padding:0.35rem 0.8rem;background:#e8f0dc;font-weight:700">OK</button>
        </div>
      </form>
    </div>`;
  const id = `name-prompt-input-${Date.now().toString(36)}`;
  wrap.querySelector('.verb-menu-title').textContent = title;
  wrap.setAttribute('aria-label', title);
  const lab = wrap.querySelector('label');
  lab.textContent = label;
  lab.htmlFor = id;
  const input = wrap.querySelector('input');
  input.id = id;
  input.maxLength = maxChars;
  input.value = String(value || '').slice(0, maxChars);
  if (restrict instanceof RegExp) {
    input.addEventListener('input', () => {
      const clean = input.value.replace(restrict, '');
      if (clean !== input.value) input.value = clean;
    });
  }
  wrap.querySelector('.verb-menu-x').addEventListener('click', closeNamePrompt);
  wrap.querySelector('[data-cancel]').addEventListener('click', closeNamePrompt);
  wrap.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const typed = input.value;
    closeNamePrompt();
    onSubmit(typed);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNamePrompt();
    }
  });
  host.appendChild(wrap);
  open = wrap;
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
  return wrap;
}
