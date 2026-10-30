/**
 * Character builder pieces kept out of game.js: the preset chips grouped
 * (Looks / Starter / Costumes) and the "Start fresh" picker
 * (js/avatar-starter.js). game.js owns the look and the preview; these
 * render into its boxes and hand changes back through callbacks.
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
