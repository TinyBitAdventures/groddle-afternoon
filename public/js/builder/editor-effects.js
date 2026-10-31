/**
 * LEVEL BUILDER editor: zone ambient effects (spec 15 Q12; the effects are js/street-effects.js).
 *
 *   effectInspector(ctx)  the inspector for a selected effect (an emitter): its kind, layer, place,
 *                         rate, size, height, spread, bursts (or always on), particle art, hidden
 *   rumbleSection(ctx)    the street's rumble (on or off, how often, how long, how strong, sound),
 *                         with a Shake now preview, and what the street's effects cost
 *
 * The editor places effects like geometry (js/builder/geometry-handles.js: the "Effect" button
 * adds a steam vent on the floor at the view centre; drag its ring to move it) and draws them live
 * with the game's own code. Every change is an op (emitter.set, street.set { rumble }), so undo,
 * autosave and an agent's edits work as for everything else. DOM only through ctx.el.
 */
import { EFFECT_KINDS, EFFECT_WORDS, EFFECT_DEFAULTS, EFFECT_RANGES, EFFECT_LIMITS, RUMBLE_DEFAULTS, RUMBLE_RANGES, effectsCost, normaliseEmitter, rumbleShare } from '../street-effects.js?v=e427650f';

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

/** PURE: the set for a new kind: the kind's defaults where the effect still has the old kind's. */
export function kindChange(item, kind) {
  const from = EFFECT_DEFAULTS[item.kind] || {};
  const to = EFFECT_DEFAULTS[kind] || {};
  const set = { kind };
  for (const k of ['rate', 'size', 'height', 'spread']) if (item[k] === undefined || item[k] === from[k]) set[k] = to[k];
  return set;
}

/** PURE: words for what a street's effects cost against the limits (spec 12). */
export function costWords(street) {
  const c = effectsCost(street);
  if (!c.emitters) return 'No effects on this street yet.';
  return `${c.emitters} effect${c.emitters === 1 ? '' : 's'}: at most ${c.particles} particles at once (limit ${EFFECT_LIMITS.particles}), ${c.overdraw} screens of overdraw (limit ${EFFECT_LIMITS.overdraw}).`;
}

/**
 * The inspector for one effect. ctx: { el, btn, field, numberInput, item, id, street (the street
 * JSON), layers (front first), dis, set(patch, label), unset(keys, label), remove() }.
 */
export function effectInspector(ctx) {
  const { el, field, numberInput, item, dis } = ctx;
  const n = normaliseEmitter(item);
  const R = EFFECT_RANGES;
  const num = (name, label, value, range, fn, step = '1') => field(label, numberInput(`fx-${name}`, value, (v) => fn(clamp(v, range)), { min: String(range[0]), max: String(range[1]), step, ...dis }));
  const kindPick = el('select', { name: 'fx-kind', ...dis }, ...EFFECT_KINDS.map((k) => el('option', { value: k, selected: k === n.kind ? true : null }, EFFECT_WORDS[k])));
  kindPick.addEventListener('change', () => ctx.set(kindChange(item, kindPick.value), 'effect kind'));
  const layerPick = el('select', { name: 'fx-layer', ...dis }, ...ctx.layers.map((l) => el('option', { value: l.id, selected: l.id === n.layer ? true : null }, l.name || l.id)));
  layerPick.addEventListener('change', () => ctx.set({ layer: layerPick.value }, 'effect layer'));
  const always = el('input', { type: 'checkbox', name: 'fx-always', checked: n.period ? null : true, ...dis });
  always.addEventListener('change', () => {
    if (always.checked) ctx.unset(['period', 'burst'], 'always on');
    else {
      const d = EFFECT_DEFAULTS[n.kind];
      ctx.set({ period: [...(d.period || [6, 10])], burst: d.burst ?? 2 }, 'bursts');
    }
  });
  const bursts = n.period ? el('div', { class: 'builder-grid' },
    num('period-min', 'Every (from, s)', n.period[0], R.period, (v) => ctx.set({ period: [v, Math.max(v, n.period[1])] }, 'period'), '0.5'),
    num('period-max', 'Every (to, s)', n.period[1], R.period, (v) => ctx.set({ period: [Math.min(v, n.period[0]), v] }, 'period'), '0.5'),
    num('burst', 'Burst (s)', n.burst, [R.burst[0], Math.min(R.burst[1], n.period[0])], (v) => ctx.set({ burst: round2(v) }, 'burst'), '0.1')) : null;
  const sprite = el('input', { type: 'text', name: 'fx-sprite', value: item.sprite || '', placeholder: 'built-in soft shape', spellcheck: 'false', autocomplete: 'off', ...dis });
  sprite.addEventListener('change', () => {
    const v = sprite.value.trim();
    if (v) ctx.set({ sprite: v }, 'effect art');
    else ctx.unset(['sprite'], 'effect art');
  });
  const hid = el('input', { type: 'checkbox', name: 'fx-hidden', checked: item.hidden ? true : null, ...dis });
  hid.addEventListener('change', () => (hid.checked ? ctx.set({ hidden: true }, 'hidden') : ctx.unset(['hidden'], 'hidden')));
  return el('section', { class: 'builder-fx', 'aria-label': 'Effect', 'data-builder-effect': ctx.id },
    el('div', { class: 'builder-grid' }, field('Kind', kindPick), field('Layer', layerPick)),
    el('div', { class: 'builder-grid' },
      field(n.layer === 'middleground' ? 'x' : 'x (layer)', numberInput('fx-x', item.x, (v) => ctx.set({ x: Math.round(v) }), dis)),
      field(n.layer === 'middleground' ? 'y (mouth)' : 'y (layer)', numberInput('fx-y', item.y, (v) => ctx.set({ y: Math.round(v) }), dis))),
    el('div', { class: 'builder-grid' },
      num('rate', 'Per second', n.rate, R.rate, (v) => ctx.set({ rate: round2(v) }), '0.5'),
      num('size', 'Size (px)', n.size, R.size, (v) => ctx.set({ size: Math.round(v) })),
      num('height', n.kind === 'lava' ? 'Squirt height' : 'Rises (px)', n.height, R.height, (v) => ctx.set({ height: Math.round(v) }), '10'),
      num('spread', 'Spread (deg)', n.spread, R.spread, (v) => ctx.set({ spread: Math.round(v) }))),
    el('label', { class: 'builder-check' }, always, ' Always on (no pauses)'),
    bursts,
    field('Particle art', sprite),
    el('label', { class: 'builder-check' }, hid, ' Hidden in the game'),
    el('p', { class: 'builder-sub', text: `${EFFECT_WORDS[n.kind]}: drag its ring to move it. ${n.layer === 'middleground' ? 'Street x, y of the vent\'s mouth.' : 'Layer-local x, y, as decos on that layer.'} Under reduced motion it runs at half the rate and lower.` }),
    el('p', { class: 'builder-sub', 'data-fx-cost': '', text: costWords(ctx.street) }));
}

/**
 * The street's rumble. ctx: { el, btn, field, numberInput, street, editable, commit(ops, label),
 * streetKey, preview() (shake the view once), reduced }.
 */
export function rumbleSection(ctx) {
  const { el, btn, field, numberInput, street } = ctx;
  const dis = ctx.editable ? {} : { disabled: true };
  const r = street.rumble || null;
  const R = RUMBLE_RANGES;
  const set = (rumble, label = 'rumble') => ctx.commit([{ op: 'street.set', street: ctx.streetKey, set: { rumble } }], label);
  const on = el('input', { type: 'checkbox', name: 'rumble-on', checked: r ? true : null, ...dis });
  on.addEventListener('change', () => (on.checked
    ? set({ every: [...RUMBLE_DEFAULTS.every], duration: RUMBLE_DEFAULTS.duration, strength: RUMBLE_DEFAULTS.strength }, 'rumble on')
    : ctx.commit([{ op: 'street.set', street: ctx.streetKey, set: {}, unset: ['rumble'] }], 'rumble off')));
  const kids = [
    el('h3', { class: 'builder-h3', text: 'Earthquake rumble' }),
    el('label', { class: 'builder-check' }, on, ' The ground rumbles now and then'),
  ];
  if (r) {
    const num = (name, label, value, range, fn, step = '1') => field(label, numberInput(`rumble-${name}`, value, (v) => fn(clamp(v, range)), { min: String(range[0]), max: String(range[1]), step, ...dis }));
    const sound = el('input', { type: 'checkbox', name: 'rumble-sound', checked: r.sound === false ? null : true, ...dis });
    sound.addEventListener('change', () => {
      const next = { ...r };
      if (sound.checked) delete next.sound; else next.sound = false;
      set(next, 'rumble sound');
    });
    const share = rumbleShare(r);
    const shake = btn('Shake now', { class: 'builder-mini', 'data-rumble-preview': '' });
    shake.addEventListener('click', () => ctx.preview());
    kids.push(
      el('div', { class: 'builder-grid' },
        num('every-min', 'Every (from, s)', r.every[0], R.every, (v) => set({ ...r, every: [v, Math.max(v, r.every[1])] })),
        num('every-max', 'Every (to, s)', r.every[1], R.every, (v) => set({ ...r, every: [Math.min(v, r.every[0]), v] })),
        num('duration', 'Lasts (s)', r.duration, R.duration, (v) => set({ ...r, duration: round2(v) }), '0.1'),
        num('strength', 'Strength (px)', r.strength, R.strength, (v) => set({ ...r, strength: Math.round(v) }))),
      el('label', { class: 'builder-check' }, sound, ' With its rumble sound'),
      el('div', { class: 'builder-row' }, shake),
      el('p', { class: 'builder-sub', text: `Shakes ${Math.round(share * 100)}% of the time${share > EFFECT_LIMITS.rumbleShare ? ' (more than a third wears players out)' : ''}. Effects puff harder while it shakes. ${ctx.reduced ? 'Your device asks for less motion, so the preview only puffs.' : 'Players who ask for less motion get no shake.'}` }));
  }
  kids.push(el('h3', { class: 'builder-h3', text: 'Effects' }), el('p', { class: 'builder-sub', 'data-fx-cost': '', text: costWords(street) }));
  return el('section', { class: 'builder-rumble', 'aria-label': 'Earthquake rumble and effects', 'data-builder-rumble': '' }, ...kids);
}
