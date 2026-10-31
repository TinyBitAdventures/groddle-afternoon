/**
 * LEVEL BUILDER new zones (spec 6.3, phase P3): the editor's dialogs and panels for
 *
 * - a new draft (a zone): a title and id, then a new hub (an id from 900, a name, Groddle Meadow's
 *   map colours) or an existing hub;
 * - a new street from a template (js/builder/templates.js), with its line on the hub map;
 * - the hub map editor: the 760 x 460 map, each zone street a line you drag (or type), exits to
 *   other hubs, the map's colours (hubmap.set);
 * - the street's population (population.set) for the ecology planner;
 * - the zone panel: the hub and the zone's ways in from shipped streets (edits[]).
 *
 * The editor gives each a context (ctx) with its helpers and its state; nothing here keeps the
 * draft itself. Every change is an op the editor commits (one undo step).
 */
import { TEMPLATES, WIDTH, HEIGHT, MAP_W, MAP_H, templateOf, newStreet, newStreetOps, newHub, nextHubId, mapWithStreet } from './templates.js?v=008481d2';
import { streetKeyFrom, POPULATION_CLASSES } from './zone.js?v=6a3db28e';

/** Plain words for the population classes (street-ecology.json counts). */
export const POPULATION_WORDS = Object.freeze({
  street_spirit: 'Street spirit (a vendor)', trant_fruit: 'Fruit tree', trant_bean: 'Bean tree', trant_bubble: 'Bubble tree', trant_egg: 'Egg plant',
  trant_gas: 'Gas plant', trant_spice: 'Spice plant', wood_tree: 'Wood tree', paper_tree: 'Paper tree', rock_metal_1: 'Metal rock',
  rock_beryl_1: 'Beryl rock', rock_dullite_1: 'Dullite rock', rock_sparkly_1: 'Sparkly rock', dirt_pile: 'Dirt pile', dust_trap: 'Dust trap',
  peat_1: 'Peat bog', mortar_barnacle: 'Barnacle', jellisac: 'Jellisac', ice_knob: 'Ice knob', npc_piggy: 'Piggy', npc_chicken: 'Chicken',
  npc_butterfly: 'Butterfly', npc_salmon: 'Salmon', npc_firefly: 'Firefly', npc_sloth: 'Sloth', garden: 'Garden plot',
});

/** PURE: a population with one class's count changed (0 removes it), keys in the classes' order. */
export function populationWith(pop, cls, n) {
  const counts = { ...(pop?.counts || {}) };
  if (n > 0) counts[cls] = Math.max(0, Math.min(12, Math.round(n)));
  else delete counts[cls];
  const ordered = Object.fromEntries(POPULATION_CLASSES.filter((c) => c in counts).map((c) => [c, counts[c]]));
  return { ...(pop || {}), counts: ordered };
}

/** PURE: the spots the planner gives a street's population (js/street-ecology.js, as game.js plans them). */
export function plannedSpots({ street, population, platformsScreen, worldToScreen, populationForStreet, planStreetPlacements, placementRequests, worldW }) {
  if (!street || !population) return [];
  const pop = populationForStreet(street.tsid, { ...population, counts: population.counts || {} });
  const reserved = (street.signposts || []).map((s, i) => ({ ...worldToScreen(street, s.x, s.y), key: `signpost:${i}`, clearance: 100 }));
  const plan = planStreetPlacements(platformsScreen(street), placementRequests(pop), { worldW, seed: street.tsid, reserved });
  const out = [];
  for (const [key, points] of Object.entries(plan.groups || {})) for (const p of points) out.push({ key, x: p.x, y: p.y });
  return out;
}

/** The planner's groups as the overlay colours them. */
export const SPOT_GROUPS = Object.freeze([
  Object.freeze({ id: 'player', label: 'Where a player starts', colour: 0xffffff, keys: Object.freeze(['player']) }),
  Object.freeze({ id: 'plants', label: 'Trees and plants', colour: 0x3fae49, keys: Object.freeze(['trees', 'gardens']) }),
  Object.freeze({ id: 'rocks', label: 'Rocks', colour: 0x9aa3ad, keys: Object.freeze(['rocks']) }),
  Object.freeze({ id: 'animals', label: 'Animals', colour: 0xf28fb5, keys: Object.freeze(['piggies', 'chickens', 'butterflies', 'flyingButterflies']) }),
  Object.freeze({ id: 'quoins', label: 'Quoins', colour: 0xf5c518, keys: Object.freeze(['quoins']) }),
  Object.freeze({ id: 'other', label: 'Vendor, shrine, apples, music blocks', colour: 0x4a90e2, keys: Object.freeze(['vendor', 'shrine', 'apples', 'musicblocks']) }),
]);
export function spotGroup(key) {
  return SPOT_GROUPS.find((g) => g.keys.includes(key)) || SPOT_GROUPS[SPOT_GROUPS.length - 1];
}

// —— New draft ——

/**
 * The New draft dialog. ctx: { el, btn, field, root, api, drafts(), hubList(): Promise<[{id, name}]>,
 * onCreated(id) }.
 */
export function newDraftDialog(ctx) {
  const { el, field } = ctx;
  const title = el('input', { type: 'text', name: 'zone-title', maxlength: '80', required: true, autocomplete: 'off', placeholder: 'Mossy Hollow' });
  const id = el('input', { type: 'text', name: 'zone-id', maxlength: '48', required: true, pattern: '[a-z][a-z0-9\\-]{2,47}', autocomplete: 'off', spellcheck: 'false', placeholder: 'mossy-hollow' });
  const isNew = el('input', { type: 'radio', name: 'zone-hub-kind', value: 'new', checked: true });
  const isOld = el('input', { type: 'radio', name: 'zone-hub-kind', value: 'old' });
  const hubName = el('input', { type: 'text', name: 'zone-hub-name', maxlength: '40', autocomplete: 'off', placeholder: 'Mossy Hollow' });
  const hubId = el('input', { type: 'text', name: 'zone-hub-id', readonly: true, 'aria-describedby': 'builder-zone-hubid-note' });
  const oldHub = el('select', { name: 'zone-hub-old', disabled: true });
  const words = el('p', { class: 'builder-sub', role: 'status', 'aria-live': 'polite' });
  const form = el('form', { class: 'builder-form' },
    field('Title', title), field('Id (lowercase, for addresses and the CLI)', id),
    el('fieldset', { class: 'builder-fieldset' }, el('legend', { text: 'Hub' }),
      el('label', { class: 'builder-check' }, isNew, ' A new hub'),
      field('Hub name', hubName), field('Hub id', hubId),
      el('p', { class: 'builder-sub', id: 'builder-zone-hubid-note', text: 'New hubs take ids from 900 (Tiny Speck\'s run 1 to 143). New zones stay off the world map.' }),
      el('label', { class: 'builder-check' }, isOld, ' An existing hub'),
      field('Existing hub', oldHub)),
    words,
    el('div', { class: 'builder-row' }, el('button', { type: 'submit', class: 'builder-btn builder-primary', text: 'Make the draft' }), el('button', { type: 'button', class: 'builder-btn', text: 'Cancel', onclick: () => dialog.close() })));
  const dialog = el('dialog', { class: 'builder-dialog', 'aria-labelledby': 'builder-zone-title', 'data-builder-new-draft': '' }, el('h2', { id: 'builder-zone-title', text: 'New draft' }), form);
  ctx.root.append(dialog);
  let idTouched = false;
  let nameTouched = false;
  title.addEventListener('input', () => {
    if (!idTouched) id.value = streetKeyFrom(title.value).slice(0, 48);
    if (!nameTouched) hubName.value = title.value.slice(0, 40);
  });
  id.addEventListener('input', () => { idTouched = true; });
  hubName.addEventListener('input', () => { nameTouched = true; });
  const sync = () => {
    hubName.disabled = !isNew.checked;
    oldHub.disabled = isNew.checked;
  };
  isNew.addEventListener('change', sync);
  isOld.addEventListener('change', sync);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hub = isNew.checked
      ? newHub({ id: hubId.value, name: hubName.value.trim() || title.value.trim() })
      : (() => { const o = oldHub.selectedOptions[0]; return o?.value ? { id: o.value, name: o.dataset.name } : null; })();
    if (!hub) { words.textContent = 'Pick the hub.'; return; }
    words.textContent = 'Making the draft...';
    try {
      await ctx.api.create(id.value.trim(), title.value.trim(), hub);
      dialog.close();
      await ctx.onCreated(id.value.trim());
    } catch (err) {
      words.textContent = err?.message || 'That did not work.';
    }
  });
  return {
    dialog,
    async open() {
      title.value = '';
      id.value = '';
      hubName.value = '';
      idTouched = false;
      nameTouched = false;
      isNew.checked = true;
      words.textContent = '';
      const taken = (ctx.drafts() || []).map((d) => d.hub?.id).filter((x) => Number(x) >= 900);
      hubId.value = nextHubId(taken) || '';
      try {
        const hubs = await ctx.hubList();
        oldHub.replaceChildren(el('option', { value: '' }, 'Pick a hub'), ...hubs.map((h) => el('option', { value: h.id, 'data-name': h.name }, `${h.name} (${h.id})`)));
      } catch { oldHub.replaceChildren(el('option', { value: '' }, 'The hub list did not load')); }
      sync();
      dialog.showModal();
      title.focus();
    },
  };
}

// —— New street ——

/**
 * The New street dialog. ctx: { el, btn, field, root, session(), profiles(): Promise<object>,
 * catalog(): Promise<Map>, commit(ops, label), openStreet(key) }.
 */
export function newStreetDialog(ctx) {
  const { el, field } = ctx;
  const label = el('input', { type: 'text', name: 'street-label', maxlength: '48', required: true, autocomplete: 'off', placeholder: 'Mossy Lane' });
  const key = el('input', { type: 'text', name: 'street-key', maxlength: '32', required: true, pattern: '[a-z][a-z0-9\\-]{0,31}', autocomplete: 'off', spellcheck: 'false' });
  const width = el('input', { type: 'number', name: 'street-width', min: String(WIDTH.min), max: String(WIDTH.max), step: '100', value: String(WIDTH.default), required: true });
  const height = el('input', { type: 'number', name: 'street-height', min: String(HEIGHT.min), max: String(HEIGHT.max), step: '100', value: '1000', required: true });
  const picks = TEMPLATES.map((t, i) => {
    const r = el('input', { type: 'radio', name: 'street-template', value: t.id, checked: i === 0 ? true : null });
    r.addEventListener('change', () => { if (r.checked) height.value = String(t.height); });
    return el('label', { class: 'builder-check builder-template' }, r, el('span', {}, el('b', { text: ` ${t.name}` }), el('span', { class: 'builder-sub', text: ` ${t.words}` })));
  });
  const words = el('p', { class: 'builder-sub', role: 'status', 'aria-live': 'polite' });
  const form = el('form', { class: 'builder-form' },
    field('Street name', label), field('Key (lowercase, for the CLI)', key),
    el('fieldset', { class: 'builder-fieldset' }, el('legend', { text: 'Template' }), ...picks),
    el('div', { class: 'builder-grid' }, field(`Width (${WIDTH.min.toLocaleString('en')} to ${WIDTH.max.toLocaleString('en')})`, width), field('Height', height)),
    el('p', { class: 'builder-sub', text: 'Each template has a floor line across the street and a sky, with layers sized and coloured from Tiny Speck\'s streets.' }),
    words,
    el('div', { class: 'builder-row' }, el('button', { type: 'submit', class: 'builder-btn builder-primary', text: 'Add the street' }), el('button', { type: 'button', class: 'builder-btn', text: 'Cancel', onclick: () => dialog.close() })));
  const dialog = el('dialog', { class: 'builder-dialog', 'aria-labelledby': 'builder-street-title', 'data-builder-new-street': '' }, el('h2', { id: 'builder-street-title', text: 'New street' }), form);
  ctx.root.append(dialog);
  let keyTouched = false;
  label.addEventListener('input', () => { if (!keyTouched) key.value = streetKeyFrom(label.value, (ctx.session()?.zone.streets || []).map((s) => s.key)); });
  key.addEventListener('input', () => { keyTouched = true; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const session = ctx.session();
    const zone = session?.zone;
    if (!zone) return;
    if (!zone.hub) { words.textContent = 'This draft has no hub yet. Make a new draft with a hub, or fork a street into this one.'; return; }
    const k = key.value.trim();
    if (zone.streets.some((s) => s.key === k)) { words.textContent = `This draft already has a street "${k}".`; return; }
    const template = form.querySelector('[name="street-template"]:checked')?.value || 'meadow';
    let profiles = null;
    try { profiles = await ctx.profiles(); } catch { profiles = null; }
    let catalog = null;
    try { catalog = await ctx.catalog(); } catch { catalog = null; }
    const row = newStreet({ zoneId: zone.id, key: k, label: label.value.trim(), template, width: Number(width.value), height: Number(height.value), hub: zone.hub, profiles, catalog });
    ctx.commit(newStreetOps(zone, row, catalog), 'new street');
    dialog.close();
    ctx.openStreet(k);
    ctx.say?.(`${row.street.label} added from the ${templateOf(template).name} template. Place decos from the picker (D), draw lines (Q) and signposts (S).`);
  });
  return {
    dialog,
    open() {
      label.value = '';
      key.value = '';
      keyTouched = false;
      width.value = String(WIDTH.default);
      form.querySelector('[name="street-template"]').checked = true;
      height.value = String(TEMPLATES[0].height);
      words.textContent = '';
      dialog.showModal();
      label.focus();
    },
  };
}

// —— The hub map editor ——

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  return n;
};
const clampMap = (v, max) => Math.round(Math.max(0, Math.min(max, v)));

/** PURE: a map line moved: one end ('a' or 'b') or the whole line ('line'), kept on the map. */
export function moveMapLine(line, part, dx, dy) {
  const out = { ...line };
  if (part === 'a' || part === 'line') { out.x1 = clampMap(line.x1 + dx, MAP_W); out.y1 = clampMap(line.y1 + dy, MAP_H); }
  if (part === 'b' || part === 'line') { out.x2 = clampMap(line.x2 + dx, MAP_W); out.y2 = clampMap(line.y2 + dy, MAP_H); }
  return out;
}

/** PURE: the map with exactly the zone's streets drawn (missing lines added, others dropped; NAV-006). */
export function mapForStreets(map, streets) {
  let next = { ...(map || {}), streets: (map?.streets || []).filter((x) => streets.some((s) => s.tsid === x.tsid)) };
  for (const s of streets) next = mapWithStreet(next, s);
  return next;
}

/**
 * The hub map editor dialog. ctx: { el, btn, field, root, session(), commit(ops, label), hubList(),
 * hubStreets(hubId): [{tsid, label}], say }.
 */
export function hubMapDialog(ctx) {
  const { el, btn, field } = ctx;
  const W = MAP_W;
  const H = MAP_H;
  const drawing = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'builder-hubmap', role: 'group', 'aria-label': 'Hub map: drag a street\'s line or its ends; drag an exit', 'data-builder-hubmap': '' });
  const side = el('div', { class: 'builder-hubmap-side' });
  const words = el('p', { class: 'builder-sub', role: 'status', 'aria-live': 'polite' });
  const dialog = el('dialog', { class: 'builder-dialog builder-dialog-wide', 'aria-labelledby': 'builder-hubmap-title', 'data-builder-hubmap-dialog': '' },
    el('h2', { id: 'builder-hubmap-title', text: 'Hub map' }),
    el('p', { class: 'builder-sub', text: 'The 760 by 460 map players see for this hub. Each street is a line: drag it, or drag its ends. Exits lead to other hubs. Arrow keys move the focused end or exit (Shift: 20).' }),
    el('div', { class: 'builder-hubmap-wrap' }, drawing, side), words,
    el('form', { method: 'dialog', class: 'builder-row' }, el('button', { class: 'builder-btn', text: 'Close' })));
  ctx.root.append(dialog);
  let map = null; // the map being shown (the draft's, with a drag on top)
  let drag = null;

  const hub = () => ctx.session()?.zone.hub || null;
  const zoneLines = () => (ctx.session()?.zone.streets || []).map((s) => ({ tsid: s.street.tsid, name: s.street.label }));
  function save(next, label = 'hub map') {
    ctx.commit([{ op: 'hubmap.set', map: next }], label);
    map = JSON.parse(JSON.stringify(ctx.session()?.zone.hub?.map || next));
    render();
  }
  function toMap(e) {
    const m = drawing.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function handle(kind, i, part, x, y, label) {
    const c = svg('circle', { cx: x, cy: y, r: part === 'exit' ? 10 : 8, class: `builder-hubmap-handle is-${part}`, tabindex: '0', role: 'button', 'aria-label': label, 'data-hubmap': `${kind}:${i}:${part}` });
    return c;
  }
  function render() {
    drawing.replaceChildren();
    if (!map) return;
    const defs = svg('defs');
    const grad = svg('linearGradient', { id: 'builder-hubmap-sky', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svg('stop', { offset: '0', 'stop-color': map.top_color || '#989cb6' }), svg('stop', { offset: '1', 'stop-color': map.btm_color || '#6a6d7f' }));
    defs.append(grad);
    drawing.append(defs, svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#builder-hubmap-sky)' }));
    (map.streets || []).forEach((s, i) => {
      const g = svg('g', { class: 'builder-hubmap-street', 'data-street': s.tsid });
      const line = svg('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, class: 'builder-hubmap-line', stroke: map.color || '#1d3a80', 'data-hubmap': `street:${i}:line` });
      const text = svg('text', { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 - 12, class: 'builder-hubmap-label', 'text-anchor': 'middle' });
      text.textContent = s.name;
      g.append(line, text, handle('street', i, 'a', s.x1, s.y1, `${s.name}: one end, at ${s.x1}, ${s.y1}`), handle('street', i, 'b', s.x2, s.y2, `${s.name}: other end, at ${s.x2}, ${s.y2}`));
      drawing.append(g);
    });
    (map.hubs || []).forEach((x, i) => {
      const g = svg('g', { class: 'builder-hubmap-exit' });
      const text = svg('text', { x: x.x, y: x.y - 16, class: 'builder-hubmap-label', 'text-anchor': 'middle' });
      text.textContent = x.label;
      g.append(handle('exit', i, 'exit', x.x, x.y, `${x.label}, at ${x.x}, ${x.y}`), text);
      drawing.append(g);
    });
    renderSide();
  }
  function num(name, value, onCommit, max) {
    const input = el('input', { type: 'number', name, value: String(value), min: '0', max: String(max), step: '1' });
    input.addEventListener('change', () => { const n = Number(input.value); if (Number.isFinite(n)) onCommit(clampMap(n, max)); });
    return input;
  }
  function renderSide() {
    const streets = map.streets || [];
    const want = zoneLines();
    const missing = want.filter((s) => !streets.some((x) => x.tsid === s.tsid));
    const extra = streets.filter((x) => !want.some((s) => s.tsid === x.tsid));
    const syncBtn = btn('Draw the zone\'s streets', { class: 'builder-mini', 'data-builder-hubmap-sync': '', disabled: !missing.length && !extra.length ? true : null, title: 'Add a line for each street not on the map, and take off lines for streets not in the zone' });
    syncBtn.addEventListener('click', () => save(mapForStreets(map, want), 'hub map streets'));
    const colour = (name, label) => {
      const input = el('input', { type: 'color', name: `hubmap-${name}`, value: map[name] || '#000000' });
      input.addEventListener('change', () => save({ ...map, [name]: input.value }, 'hub map colour'));
      return field(label, input);
    };
    const exitHub = el('select', { name: 'hubmap-exit-hub', 'aria-label': 'Hub the exit leads to' });
    const exitStreet = el('select', { name: 'hubmap-exit-street', 'aria-label': 'Street in that hub' });
    const addExit = btn('Add the exit', { class: 'builder-mini', 'data-builder-hubmap-add-exit': '' });
    ctx.hubList().then((hubs) => {
      exitHub.replaceChildren(el('option', { value: '' }, 'Exit to a hub...'), ...hubs.filter((h) => h.id !== hub()?.id).map((h) => el('option', { value: h.id, 'data-name': h.name }, h.name)));
    }).catch(() => {});
    exitHub.addEventListener('change', () => {
      exitStreet.replaceChildren(...ctx.hubStreets(exitHub.value).map((s) => el('option', { value: s.tsid }, s.label)));
    });
    addExit.addEventListener('click', () => {
      const o = exitHub.selectedOptions[0];
      if (!o?.value || !exitStreet.value) return ctx.say?.('Pick a hub and the street the exit leads to.', 'bad');
      const n = (map.hubs || []).length;
      save({ ...map, hubs: [...(map.hubs || []), { tsid: exitStreet.value, hub_id: o.value, hubName: o.dataset.name, label: `To: ${o.dataset.name}`, x: W - 60, y: clampMap(60 + n * 60, H), arrow: 90 }] }, 'hub map exit');
    });
    // replaceChildren writes a null as the text "null": leave the absent parts out.
    side.replaceChildren(...[
      el('h3', { class: 'builder-h3', text: `Streets (${streets.length})` }),
      missing.length || extra.length ? el('p', { class: 'builder-sub builder-warn', text: `${missing.length ? `Not on the map: ${missing.map((s) => s.name).join(', ')}. ` : ''}${extra.length ? `On the map but not in the zone: ${extra.map((s) => s.name).join(', ')}.` : ''}` }) : null,
      syncBtn,
      ...streets.map((s, i) => el('fieldset', { class: 'builder-fieldset', 'data-hubmap-street': s.tsid }, el('legend', { text: s.name }),
        el('div', { class: 'builder-grid builder-grid-4' },
          ...[['x1', W], ['y1', H], ['x2', W], ['y2', H]].map(([k, max]) => field(k, num(`hubmap-${i}-${k}`, s[k], (n) => save({ ...map, streets: streets.map((x, j) => (j === i ? { ...x, [k]: n } : x)) }), max)))))),
      el('h3', { class: 'builder-h3', text: `Exits to other hubs (${(map.hubs || []).length})` }),
      ...(map.hubs || []).map((x, i) => {
        const drop = btn('Remove', { class: 'builder-mini' });
        drop.addEventListener('click', () => save({ ...map, hubs: map.hubs.filter((_, j) => j !== i) }, 'hub map exit'));
        return el('fieldset', { class: 'builder-fieldset' }, el('legend', { text: x.label }),
          el('div', { class: 'builder-grid' }, field('x', num(`hubmap-exit-${i}-x`, x.x, (n) => save({ ...map, hubs: map.hubs.map((h, j) => (j === i ? { ...h, x: n } : h)) }), W)), field('y', num(`hubmap-exit-${i}-y`, x.y, (n) => save({ ...map, hubs: map.hubs.map((h, j) => (j === i ? { ...h, y: n } : h)) }), H))),
          drop);
      }),
      el('div', { class: 'builder-row builder-wrap' }, exitHub, exitStreet, addExit),
      el('h3', { class: 'builder-h3', text: 'Colours' }),
      el('div', { class: 'builder-grid' }, colour('color', 'Streets'), colour('top_color', 'Top'), colour('btm_color', 'Bottom')),
    ].filter((k) => k != null));
  }
  function partOf(target) {
    const k = target?.getAttribute?.('data-hubmap');
    if (!k) return null;
    const [kind, i, part] = k.split(':');
    return { kind, i: Number(i), part };
  }
  function moved(p, dx, dy) {
    if (p.kind === 'street') {
      return { ...map, streets: map.streets.map((s, j) => (j === p.i ? moveMapLine(s, p.part, dx, dy) : s)) };
    }
    return { ...map, hubs: map.hubs.map((h, j) => (j === p.i ? { ...h, x: clampMap(h.x + dx, W), y: clampMap(h.y + dy, H) } : h)) };
  }
  drawing.addEventListener('pointerdown', (e) => {
    const p = partOf(e.target);
    if (!p || !map) return;
    e.preventDefault();
    drawing.setPointerCapture(e.pointerId);
    drag = { p, from: toMap(e), base: map };
  });
  drawing.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const at = toMap(e);
    map = drag.base;
    map = moved(drag.p, Math.round(at.x - drag.from.x), Math.round(at.y - drag.from.y));
    const keep = drag;
    render();
    drag = keep;
  });
  const end = () => {
    if (!drag) return;
    const changed = JSON.stringify(map) !== JSON.stringify(drag.base);
    drag = null;
    if (changed) save(map);
  };
  drawing.addEventListener('pointerup', end);
  drawing.addEventListener('pointercancel', end);
  drawing.addEventListener('keydown', (e) => {
    const p = partOf(e.target);
    const step = e.shiftKey ? 20 : 5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!p || !d) return;
    e.preventDefault();
    const focus = e.target.getAttribute('data-hubmap');
    save(moved(p, d[0], d[1]));
    drawing.querySelector(`[data-hubmap="${focus}"]`)?.focus();
  });
  return {
    dialog,
    open() {
      const h = hub();
      if (!h) return ctx.say?.('This draft has no hub yet.', 'bad');
      if (!h.isNew) return ctx.say?.(`${h.name} is one of Tiny Speck's hubs; its map is not edited here. New zones stay off the world map.`);
      map = JSON.parse(JSON.stringify(h.map || { streets: [] }));
      words.textContent = '';
      render();
      dialog.showModal();
      drawing.querySelector('circle')?.focus();
    },
    /** The editor calls this after any change to the draft, so an open map shows it. */
    refresh() {
      if (!dialog.open || drag) return;
      map = JSON.parse(JSON.stringify(hub()?.map || { streets: [] }));
      render();
    },
    /** QA: the map as shown. */
    map: () => JSON.parse(JSON.stringify(map)),
  };
}

// —— Population (population.set) ——

/**
 * The inspector's population section for the street on screen. ctx: { el, btn, field, row (the
 * zone's street row), editable, commit(ops, label), spotsShown, toggleSpots(on), planned: n }.
 */
export function populationSection(ctx) {
  const { el, btn, field, row } = ctx;
  const pop = row.population || null;
  const dis = ctx.editable ? {} : { disabled: true };
  const set = (next, label = 'population') => ctx.commit([{ op: 'population.set', street: row.key, population: next }], label);
  const counts = pop?.counts || {};
  const items = Object.entries(counts).map(([cls, n]) => {
    const input = el('input', { type: 'number', name: `pop-${cls}`, min: '0', max: '12', step: '1', value: String(n), ...dis });
    input.addEventListener('change', () => set(populationWith(pop, cls, Number(input.value) || 0)));
    return field(POPULATION_WORDS[cls] || cls, input);
  });
  const addSel = el('select', { name: 'pop-add', 'aria-label': 'Add to the population', ...dis },
    el('option', { value: '' }, 'Add...'), ...POPULATION_CLASSES.filter((c) => !(c in counts)).map((c) => el('option', { value: c }, POPULATION_WORDS[c] || c)));
  addSel.addEventListener('change', () => { if (addSel.value) set(populationWith(pop, addSel.value, 1)); });
  const quoins = el('input', { type: 'number', name: 'pop-quoins', min: '0', max: '40', step: '1', value: pop && Number.isInteger(pop.quoins) ? String(pop.quoins) : '', placeholder: '8 (the outdoor usual)', ...dis });
  quoins.addEventListener('change', () => {
    const next = { ...(pop || { counts: {} }) };
    if (quoins.value === '') delete next.quoins; else next.quoins = Math.max(0, Math.min(40, Math.round(Number(quoins.value) || 0)));
    set(next);
  });
  const interior = el('input', { type: 'checkbox', name: 'pop-interior', checked: pop?.interior ? true : null, ...dis });
  interior.addEventListener('change', () => {
    const next = { ...(pop || { counts: {} }) };
    if (interior.checked) next.interior = true; else delete next.interior;
    set(next);
  });
  const spots = el('input', { type: 'checkbox', name: 'pop-spots', checked: ctx.spotsShown ? true : null });
  spots.addEventListener('change', () => ctx.toggleSpots(spots.checked));
  return el('section', { class: 'builder-pop', 'aria-label': 'Population', 'data-builder-population': '' },
    el('h3', { class: 'builder-h3', text: 'Population' }),
    el('p', { class: 'builder-sub', text: 'What the planner places here: trees, rocks, animals and quoins, on floors that hold items. Players never see this list, only what grows from it.' }),
    items.length ? el('div', { class: 'builder-grid' }, ...items) : el('p', { class: 'builder-sub', text: 'Nothing chosen yet: an outdoor street still gets apples, a music block and quoins.' }),
    addSel,
    el('div', { class: 'builder-grid' }, field('Quoins', quoins)),
    el('label', { class: 'builder-check' }, interior, ' Indoors (exactly this list, nothing added)'),
    el('label', { class: 'builder-check' }, spots, ` Show the planner's spots${ctx.spotsShown ? ` (${ctx.planned})` : ''}`));
}

// —— The zone panel: the hub and the ways in ——

/**
 * The inspector's zone section (draft mode, nothing selected). ctx: { el, btn, zone, labelOf(tsid),
 * editable, commit, openHubMap(), openShipped(tsid) }.
 */
export function zoneSection(ctx) {
  const { el, btn, zone } = ctx;
  const hub = zone.hub;
  const edits = Array.isArray(zone.edits) ? zone.edits : [];
  const mapBtn = btn('Hub map', { class: 'builder-mini', 'data-builder-hubmap-open': '', disabled: !hub?.isNew ? true : null });
  mapBtn.addEventListener('click', () => ctx.openHubMap());
  return el('section', { class: 'builder-zone', 'aria-label': 'Zone', 'data-builder-zone': '' },
    el('h3', { class: 'builder-h3', text: `Zone: ${zone.title}` }),
    el('p', { class: 'builder-sub', text: hub ? `Hub ${hub.name} (${hub.id})${hub.isNew ? ', new' : ''}; ${zone.streets.length} streets.` : 'No hub yet.' }),
    el('div', { class: 'builder-row' }, mapBtn),
    el('h3', { class: 'builder-h3', text: `Ways in from the world (${edits.length})` }),
    edits.length ? el('ul', { class: 'builder-edits' }, ...edits.map((e, at) => {
      const to = e.connect || e.newSignpost?.connects?.[0] || {};
      const open = btn(`Open ${ctx.labelOf(e.tsid) || e.tsid}`, { class: 'builder-mini' });
      open.addEventListener('click', () => ctx.openShipped(e.tsid));
      const drop = btn('Remove', { class: 'builder-mini', disabled: !ctx.editable ? true : null, 'data-builder-edit-remove': String(at) });
      drop.addEventListener('click', () => ctx.commit([{ op: 'edit.remove', at }], 'way in'));
      return el('li', { 'data-builder-edit': String(at) },
        el('span', { text: `${ctx.labelOf(e.tsid) || e.tsid}${e.signpost ? ` (${e.signpost})` : ' (a new signpost)'} to ${to.label || to.tsid || '?'}${to.arrive ? `, arriving at ${to.arrive.x}, ${to.arrive.y}` : ', no arrival yet'}` }),
        el('span', { class: 'builder-row' }, open, drop));
    })) : el('p', { class: 'builder-sub', text: 'Nothing in the shipped world leads here yet. Open a shipped street, pick a signpost and add a way into this draft. The shipped file is never changed; publishing adds the arm.' }));
}
