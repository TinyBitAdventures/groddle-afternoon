/**
 * Character builder pieces kept out of game.js: the preset chips grouped
 * (Looks / Starter / Costumes), the "Start fresh" picker
 * (js/avatar-starter.js), and from the 2012 Vanity page the face sliders,
 * the mirror's four emote tests and the unsaved-changes question.
 * game.js owns the look and the preview; these render into its boxes and
 * hand changes back through callbacks.
 */
import {
  STARTER_BREAKS,
  STARTER_CHOICE_COUNT,
  STARTER_DEFAULT_CHOICES,
  STARTER_SLOTS,
  applyStarterChoice,
  randomStarterChoices,
  starterChoicesOf,
  starterFields,
} from './avatar-starter.js?v=2ba02b11';
import { FACE_DIMS } from './avatar-looks.js?v=76eb9653';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function button(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

/**
 * Preset chips in groups, one group shown at a time behind a small switch,
 * so a phone sees a dozen chips, not thirty.
 * @param {HTMLElement} root  #avatar-presets
 * @param {{ presets: object[], groups: { id: string, label: string }[], onPick: (preset: object) => void }} opts
 */
export function renderPresetGroups(root, { presets, groups, onPick }) {
  const inGroup = (g) => presets.filter((p) => (p.group || groups[0].id) === g);
  const shown = groups.filter((g) => inGroup(g.id).length);
  if (!root.dataset.group || !shown.some((g) => g.id === root.dataset.group)) {
    const active = presets.find((p) => p.id === root.dataset.active);
    root.dataset.group = active?.group || shown[0]?.id || '';
  }
  root.innerHTML = '';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Preset looks');
  const switcher = el('div', 'avatar-preset-groups');
  for (const g of shown) {
    const b = button('avatar-preset-group', g.label);
    b.dataset.group = g.id;
    b.setAttribute('aria-pressed', String(g.id === root.dataset.group));
    if (g.id === root.dataset.group) b.classList.add('active');
    b.addEventListener('click', () => {
      root.dataset.group = g.id;
      renderPresetGroups(root, { presets, groups, onPick });
    });
    switcher.appendChild(b);
  }
  const row = el('div', 'avatar-preset-row');
  row.dataset.group = root.dataset.group;
  for (const p of inGroup(root.dataset.group)) {
    const chip = button('avatar-preset-chip', p.label);
    chip.dataset.preset = p.id;
    if (p.id === root.dataset.active) chip.classList.add('active');
    chip.addEventListener('click', () => {
      root.dataset.active = p.id;
      row.querySelectorAll('.avatar-preset-chip').forEach((c) => c.classList.toggle('active', c === chip));
      onPick(p);
    });
    row.appendChild(chip);
  }
  root.append(switcher, row);
}

/** No preset chip lit (the look was edited by hand). */
export function clearPresetActive(root) {
  if (!root) return;
  delete root.dataset.active;
  root.querySelectorAll('.avatar-preset-chip.active').forEach((c) => c.classList.remove('active'));
}

/**
 * "Start fresh": Tiny Speck's new-player picker. Nine rows in the original
 * order and groups; arrows cycle each through its four choices.
 * @param {HTMLElement} box  #avatar-swatches
 * @param {{ fields: object, onChange: (fields: object) => void, rng?: () => number }} opts
 */
export function renderStarterPicker(box, { fields, onChange, rng = Math.random }) {
  box.dataset.mode = 'parts';
  const current = starterChoicesOf(fields);
  const wrap = el('div', 'avatar-starter');
  wrap.appendChild(el('p', 'avatar-note', 'Tiny Speck’s new-player picker: four choices for each part.'));
  const actions = el('div', 'avatar-starter-actions');
  const fresh = button('avatar-style-chip', 'Start fresh');
  fresh.dataset.starterAction = 'fresh';
  fresh.addEventListener('click', () => onChange(starterFields(STARTER_DEFAULT_CHOICES)));
  const shuffle = button('avatar-style-chip', 'Randomize');
  shuffle.dataset.starterAction = 'random';
  shuffle.addEventListener('click', () => onChange(starterFields(randomStarterChoices(rng))));
  actions.append(fresh, shuffle);
  wrap.appendChild(actions);
  let group = el('div', 'avatar-starter-group');
  STARTER_SLOTS.forEach(({ id, label }, index) => {
    const choice = current[id];
    const row = el('div', 'avatar-starter-row');
    row.dataset.slot = id;
    row.dataset.choice = String(choice);
    const name = el('span', 'avatar-starter-label', label);
    const pick = (i) => onChange(applyStarterChoice(fields, id, i));
    const prev = button('avatar-starter-arrow', '‹');
    prev.setAttribute('aria-label', `Previous ${label}`);
    prev.dataset.step = '-1';
    prev.addEventListener('click', () => pick(choice < 0 ? STARTER_CHOICE_COUNT - 1 : (choice + STARTER_CHOICE_COUNT - 1) % STARTER_CHOICE_COUNT));
    const next = button('avatar-starter-arrow', '›');
    next.setAttribute('aria-label', `Next ${label}`);
    next.dataset.step = '1';
    next.addEventListener('click', () => pick(choice < 0 ? 0 : (choice + 1) % STARTER_CHOICE_COUNT));
    const dots = el('span', 'avatar-starter-dots');
    for (let i = 0; i < STARTER_CHOICE_COUNT; i += 1) {
      const dot = button('avatar-starter-dot');
      dot.dataset.choice = String(i);
      dot.setAttribute('aria-label', `${label} ${i + 1} of ${STARTER_CHOICE_COUNT}`);
      dot.setAttribute('aria-pressed', String(i === choice));
      if (i === choice) dot.classList.add('active');
      dot.addEventListener('click', () => pick(i));
      dots.appendChild(dot);
    }
    row.append(name, prev, dots, next);
    group.appendChild(row);
    if (STARTER_BREAKS.includes(index) || index === STARTER_SLOTS.length - 1) {
      wrap.appendChild(group);
      group = el('div', 'avatar-starter-group');
    }
  });
  box.appendChild(wrap);
}

/**
 * Size / Height / Width per feature (Vanity's DimsPane.as): a range for each
 * FACE_DIMS setting, grouped by part. Built once into `root`, then each call
 * sets the values from `face`. Heights run inverted (VanityModel ranges were
 * set max-first for them, DimsPane.as 119-123): more is higher on the face.
 * @param {HTMLElement} root  #avatar-dims
 * @param {{ face?: object, onChange: (key: string, value: number) => void }} opts
 */
export function renderFaceDims(root, { face = {}, onChange }) {
  if (!root.dataset.ready) {
    root.dataset.ready = '1';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Face shape');
    for (const group of FACE_DIMS) {
      const part = el('div', 'avatar-dims-part');
      part.dataset.part = group.part;
      const sliders = el('div', 'avatar-dims-sliders');
      for (const d of group.settings) {
        const invert = d.key.endsWith('_height');
        const label = el('label', 'avatar-dim');
        const input = el('input', 'avatar-dim-range');
        input.type = 'range';
        input.dataset.dim = d.key;
        input.min = String(invert ? -d.max : d.min);
        input.max = String(invert ? -d.min : d.max);
        input.step = String(d.step);
        input.setAttribute('aria-label', `${group.label} ${d.label.toLowerCase()}`);
        input.addEventListener('input', () => {
          const n = Number(input.value);
          onChange(d.key, invert ? -n : n);
        });
        label.append(input, el('span', 'avatar-dim-label', d.label));
        sliders.appendChild(label);
      }
      part.append(sliders, el('span', 'avatar-dims-name', group.label));
      root.appendChild(part);
    }
  }
  for (const group of FACE_DIMS) {
    for (const d of group.settings) {
      const input = root.querySelector(`[data-dim="${d.key}"]`);
      if (!input) continue;
      const n = Number(face?.[d.key]);
      const v = Math.max(d.min, Math.min(d.max, Number.isFinite(n) ? n : d.def));
      const shown = String(d.key.endsWith('_height') ? -v : v);
      if (input.value !== shown) input.value = shown;
    }
  }
}

/**
 * The mirror's four test buttons (VanityMirror.as 31-36, 89-117): surprise,
 * angry and happy, and idle3 on the sleepy face. Line faces drawn here, in
 * currentColor.
 */
export const EMOTE_TESTS = Object.freeze([
  Object.freeze({ id: 'surprise', label: 'Surprised', anim: 'surprise', face: '<circle cx="7" cy="8.5" r="1.4"/><circle cx="13" cy="8.5" r="1.4"/><circle cx="10" cy="13.6" r="2" fill="none" stroke-width="1.4"/>' }),
  Object.freeze({ id: 'angry', label: 'Angry', anim: 'angry', face: '<path d="M5 6.2 8.6 7.6M15 6.2l-3.6 1.4M6.6 14.6q3.4-2.6 6.8 0" fill="none" stroke-width="1.4" stroke-linecap="round"/><circle cx="7.3" cy="9.6" r="1.2"/><circle cx="12.7" cy="9.6" r="1.2"/>' }),
  Object.freeze({ id: 'happy', label: 'Happy', anim: 'happy', face: '<circle cx="7" cy="8.4" r="1.3"/><circle cx="13" cy="8.4" r="1.3"/><path d="M5.8 11.6q4.2 5 8.4 0" fill="none" stroke-width="1.4" stroke-linecap="round"/>' }),
  Object.freeze({ id: 'sleepy', label: 'Sleepy', anim: 'idle3', face: '<path d="M5.4 8.8q1.6 1.6 3.2 0M11.4 8.8q1.6 1.6 3.2 0M8.6 13.8h2.8" fill="none" stroke-width="1.4" stroke-linecap="round"/>' }),
]);

/**
 * The emote test row by the mirror.
 * @param {HTMLElement} root  .avatar-emotes
 * @param {{ onPlay: (anim: string) => void }} opts
 */
export function renderEmoteTests(root, { onPlay }) {
  root.innerHTML = '';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Test an emote');
  for (const t of EMOTE_TESTS) {
    const b = button('avatar-emote');
    b.dataset.emote = t.id;
    b.title = t.label;
    b.setAttribute('aria-label', `Test ${t.label.toLowerCase()}`);
    b.innerHTML = `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="currentColor" stroke="currentColor"><circle cx="10" cy="10" r="8.6" fill="none" stroke-width="1.3"/>${t.face}</svg>`;
    b.addEventListener('click', () => onPlay(t.anim));
    root.appendChild(b);
  }
}

/** LeavingVanityDialog.as makeForUnsaved, and its Stay here button. */
export const LEAVING_TEXT = Object.freeze({
  title: 'You have unsaved changes',
  body: 'If you leave now, you’ll lose your changes!',
  stay: 'Stay here',
  save: 'Save Changes',
  leave: 'Leave without saving',
});

/**
 * The unsaved-changes question over the builder (Vanity.as areChanges,
 * showLeavingOverlay): Stay here (the default, and Esc), Save Changes, or
 * leave without saving. One box over the builder, shown again on each ask.
 * @param {HTMLElement} host  #avatar-panel
 * @param {{ onStay: () => void, onSave: () => void, onLeave: () => void }} opts
 * @returns {HTMLElement}
 */
export function showLeavingDialog(host, { onStay, onSave, onLeave }) {
  let box = host.querySelector('.avatar-leaving');
  if (!box) {
    box = el('div', 'avatar-leaving');
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'avatar-leaving-title');
    box.setAttribute('aria-describedby', 'avatar-leaving-body');
    const inner = el('div', 'avatar-leaving-card');
    const h = el('h3', 'avatar-leaving-title', LEAVING_TEXT.title);
    h.id = 'avatar-leaving-title';
    const p = el('p', 'avatar-leaving-body', LEAVING_TEXT.body);
    p.id = 'avatar-leaving-body';
    const row = el('div', 'avatar-leaving-actions');
    const stay = button('btn-glitch-back avatar-leaving-stay', LEAVING_TEXT.stay);
    stay.dataset.leaving = 'stay';
    const save = button('btn-glitch-primary avatar-leaving-save', LEAVING_TEXT.save);
    save.dataset.leaving = 'save';
    const leave = button('btn-glitch-back avatar-leaving-leave', LEAVING_TEXT.leave);
    leave.dataset.leaving = 'leave';
    row.append(stay, save, leave);
    inner.append(h, p, row);
    box.appendChild(inner);
    host.appendChild(box);
  }
  const hide = () => { box.hidden = true; };
  box.querySelector('[data-leaving="stay"]').onclick = () => { hide(); onStay(); };
  box.querySelector('[data-leaving="save"]').onclick = () => { hide(); onSave(); };
  box.querySelector('[data-leaving="leave"]').onclick = () => { hide(); onLeave(); };
  box.hidden = false;
  box.querySelector('[data-leaving="stay"]').focus?.();
  return box;
}

/** The question is up (Esc then means Stay here). */
export function leavingDialogOpen(host) {
  const box = host?.querySelector?.('.avatar-leaving');
  return Boolean(box && !box.hidden);
}
