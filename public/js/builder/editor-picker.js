/**
 * LEVEL BUILDER deco picker (spec 6.4, phase P3): the left panel's picker over the whole library
 * (assets/content/deco-catalog.json) and the zone's own new art, with the upload form for new art
 * (the site's POST admin/builder/assets, spec 9.1 and 10). Search, ranking and facets are
 * js/builder/deco-search.js (pure); this module is the DOM.
 *
 * Placing: click (or Enter) on a result places it at the view centre on the active layer; dragging
 * a result onto the canvas places it where it is dropped. The new deco takes the median drawn size
 * (deco-search.js drawnSize). The editor does the placing (ctx.place).
 *
 *   mountPicker(ctx) -> { section, open(), refresh(), results() }
 *   ctx: { el, btn, field, catalog: () => Promise<Map>, assets: () => object|null, hub: () => string,
 *          role: () => string, editable: () => boolean, draft: () => string,
 *          place: (row, at | null) => void, upload: (body) => Promise<object>, say }
 */
import { ROLES, SIZES, NEW_ART_BUNDLE, searchDecos, facetCounts, newArtRows, thumbUrl, drawnSize } from './deco-search.js?v=fda9b16b';

export const PICK_MIME = 'application/x-groddle-deco';
const PAGE = 48;
const ROLE_WORDS = Object.freeze({ sky: 'Sky', bg: 'Back layers', middleground: 'Middleground', middleplus: 'Near (middleplus)', foreground: 'Foreground' });

/** PURE: a file's bytes as base64 (no data: prefix). */
export function base64Of(bytes) {
  let s = '';
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}

/** PURE: the intake body from the upload form's values (spec 9.1; P5's route). */
export function intakeBody(v) {
  const body = { draft: v.draft, name: String(v.name || '').trim(), file2: v.file2, licence: v.licence, author: String(v.author || '').trim() };
  if (v.file3) body.file3 = v.file3;
  if (v.licence === 'ai-generated') {
    body.tool = String(v.tool || '').trim();
    body.prompt = String(v.prompt || '').trim();
  } else if (String(v.tool || '').trim()) body.tool = String(v.tool).trim();
  const inputs = String(v.inputs || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (inputs.length) body.inputs = inputs;
  if (v.role) body.role = v.role;
  return body;
}

export function mountPicker(ctx) {
  const { el, btn, field } = ctx;
  const state = { query: '', role: '', bundle: '', inHub: false, animated: false, size: '', neverPlaced: false, shown: PAGE, rows: [], grey: null };
  const search = el('input', { type: 'search', name: 'picker-search', 'aria-label': 'Search decos', placeholder: 'Search decos: bush, tree, cave', autocomplete: 'off', spellcheck: 'false', 'data-builder-picker-search': '' });
  const roleSel = el('select', { name: 'picker-role', 'aria-label': 'Layer role' });
  const bundleSel = el('select', { name: 'picker-bundle', 'aria-label': 'Art set' });
  const sizeSel = el('select', { name: 'picker-size', 'aria-label': 'Size' });
  const box = (name, label) => {
    const input = el('input', { type: 'checkbox', name });
    const words = el('span', { text: ` ${label}` });
    return { input, words, label: el('label', { class: 'builder-check' }, input, words) };
  };
  const inHub = box('picker-hub', 'Used in this hub');
  const animated = box('picker-animated', 'Animated');
  const never = box('picker-never', 'Never placed');
  const grey = el('input', { type: 'range', name: 'picker-grey', min: '0', max: '255', step: '1', value: '128', 'aria-label': 'Thumbnail background grey' });
  const checker = el('input', { type: 'checkbox', name: 'picker-checker', checked: true });
  const count = el('p', { class: 'builder-sub', role: 'status', 'aria-live': 'polite', 'data-builder-picker-count': '' });
  const grid = el('ul', { class: 'builder-picker-grid', 'aria-label': 'Decos found', 'data-builder-picker-results': '' });
  const more = btn('Show more', { class: 'builder-mini', hidden: true });
  const uploadBtn = btn('Add new art', { class: 'builder-mini', 'aria-haspopup': 'dialog', 'data-builder-upload': '', title: 'Bring in your own art or AI art (CC0 1.0, with where it came from)' });
  const facets = el('div', { class: 'builder-picker-facets' },
    field('Layer', roleSel), field('Art set', bundleSel), field('Size', sizeSel),
    el('div', { class: 'builder-row builder-wrap' }, inHub.label, animated.label, never.label),
    el('div', { class: 'builder-row builder-wrap' }, el('label', { class: 'builder-check' }, checker, ' Checkerboard'), el('label', { class: 'builder-field builder-grey' }, el('span', { text: 'Grey' }), grey)));
  const section = el('details', { class: 'builder-picker', 'data-builder-picker': '' },
    el('summary', { class: 'builder-h', text: 'Deco picker (D)' }),
    search, facets, count, grid, el('div', { class: 'builder-row' }, more, uploadBtn),
    el('p', { class: 'builder-sub', text: 'Click or press Enter to place at the view centre on the active layer; drag onto the street to place it there.' }));

  async function rows() {
    const cat = await ctx.catalog();
    return [...newArtRows(ctx.assets()), ...cat.values()];
  }
  function opts() {
    return { hub: ctx.hub(), role: state.role, bundle: state.bundle, inHub: state.inHub, animated: state.animated, size: state.size, neverPlaced: state.neverPlaced };
  }
  function fillFacets(all) {
    const c = facetCounts(all, state.query, opts());
    const keep = (sel, items, value) => {
      sel.replaceChildren(...items.map(([v, label]) => el('option', { value: v, selected: v === value ? true : null }, label)));
    };
    keep(roleSel, [['', 'Any layer'], ...ROLES.map((r) => [r, `${ROLE_WORDS[r]} (${c.role[r]})`])], state.role);
    keep(bundleSel, [['', 'Any art set'], ...c.bundle.map(([b, n]) => [b, `${b} (${n})`]), ...(state.bundle && !c.bundle.some(([b]) => b === state.bundle) ? [[state.bundle, `${state.bundle} (0)`]] : [])], state.bundle);
    keep(sizeSel, [['', 'Any size'], ...SIZES.map((s) => [s.id, `${s.label} (${c.size[s.id]})`])], state.size);
    inHub.words.textContent = ` Used in this hub (${c.inHub})`;
    inHub.input.disabled = !ctx.hub();
    animated.words.textContent = ` Animated (${c.animated})`;
    never.words.textContent = ` Never placed (${c.neverPlaced})`;
  }
  let token = 0;
  async function refresh() {
    const mine = ++token;
    let all;
    try { all = await rows(); } catch { count.textContent = 'The deco list did not load.'; return; }
    if (mine !== token) return;
    const found = searchDecos(all, state.query, opts());
    state.rows = found;
    fillFacets(all);
    count.textContent = `${found.length.toLocaleString('en')} decos${state.query ? ` for "${state.query}"` : ''}${found.length > state.shown ? `, showing ${state.shown}` : ''}.`;
    const hub = ctx.hub();
    grid.style.setProperty('--pick-grey', `rgb(${state.grey ?? 128} ${state.grey ?? 128} ${state.grey ?? 128})`);
    grid.dataset.checker = checker.checked ? '1' : '0';
    grid.replaceChildren(...found.slice(0, state.shown).map(({ row, hub: inThisHub }) => {
      const size = drawnSize(row);
      const where = row.bundle === NEW_ART_BUNDLE ? 'new art in this draft' : `placed ${Number(row.placements || 0).toLocaleString('en')} times${hub && inThisHub ? `, ${inThisHub} in this hub` : ''}`;
      const b = el('button', {
        type: 'button',
        class: 'builder-pick',
        draggable: 'true',
        'data-pick': row.name,
        title: `${row.name}: ${size.w} by ${size.h}, ${where}`,
        'aria-label': `${row.name}, ${size.w} by ${size.h}, ${where}`,
        onclick: () => ctx.place(row, null),
      }, el('img', { src: thumbUrl(row), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }), el('span', { text: row.name }));
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData(PICK_MIME, row.name);
        e.dataTransfer.setData('text/plain', row.name);
        e.dataTransfer.effectAllowed = 'copy';
      });
      return el('li', {}, b);
    }));
    more.hidden = found.length <= state.shown;
  }
  let typing = 0;
  search.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.query = search.value; state.shown = PAGE; refresh(); }, 120);
  });
  search.addEventListener('keydown', (e) => {
    // Enter in the box places the best match; Down moves into the results.
    if (e.key === 'Enter') {
      e.preventDefault();
      state.query = search.value;
      refresh().then(() => { const best = state.rows[0]?.row; if (best) ctx.place(best, null); });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      grid.querySelector('button')?.focus();
    }
  });
  grid.addEventListener('keydown', (e) => {
    const all = [...grid.querySelectorAll('button')];
    const i = all.indexOf(document.activeElement);
    if (i < 0) return;
    const across = Math.max(1, Math.round(grid.clientWidth / (all[0]?.offsetWidth || 1)));
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: across, ArrowUp: -across }[e.key];
    if (!step) return;
    e.preventDefault();
    if (i + step < 0) { search.focus(); return; }
    all[Math.max(0, Math.min(all.length - 1, i + step))]?.focus();
  });
  for (const [sel, key] of [[roleSel, 'role'], [bundleSel, 'bundle'], [sizeSel, 'size']]) sel.addEventListener('change', () => { state[key] = sel.value; state.shown = PAGE; refresh(); });
  for (const [b, key] of [[inHub, 'inHub'], [animated, 'animated'], [never, 'neverPlaced']]) b.input.addEventListener('change', () => { state[key] = b.input.checked; state.shown = PAGE; refresh(); });
  grey.addEventListener('input', () => { state.grey = Number(grey.value); grid.style.setProperty('--pick-grey', `rgb(${state.grey} ${state.grey} ${state.grey})`); });
  checker.addEventListener('change', () => { grid.dataset.checker = checker.checked ? '1' : '0'; });
  more.addEventListener('click', () => { state.shown += PAGE; refresh(); });
  section.addEventListener('toggle', () => { if (section.open) refresh(); });

  // —— New art (spec 9.1, 10): the upload form ——
  const f = {
    file2: el('input', { type: 'file', name: 'art-file2', accept: 'image/png,image/webp', required: true }),
    file3: el('input', { type: 'file', name: 'art-file3', accept: 'image/png,image/webp' }),
    name: el('input', { type: 'text', name: 'art-name', required: true, maxlength: '96', pattern: 'gz_[a-z0-9]+(_[a-z0-9]+)*', placeholder: 'gz_mossy_stone', autocomplete: 'off', spellcheck: 'false' }),
    licence: el('select', { name: 'art-licence' }, el('option', { value: 'own-work-CC0' }, 'My own work, dedicated CC0 1.0'), el('option', { value: 'ai-generated' }, 'AI-generated, dedicated CC0 1.0')),
    author: el('input', { type: 'text', name: 'art-author', required: true, maxlength: '120', autocomplete: 'name' }),
    tool: el('input', { type: 'text', name: 'art-tool', maxlength: '120', placeholder: 'Model and version, or the drawing tool' }),
    prompt: el('textarea', { name: 'art-prompt', rows: '3', maxlength: '4000' }),
    inputs: el('textarea', { name: 'art-inputs', rows: '2', placeholder: 'deco:bush_3\nown:my pencil sketch of a stone' }),
    role: el('select', { name: 'art-role' }, el('option', { value: '' }, 'Not said'), ...ROLES.map((r) => el('option', { value: r }, ROLE_WORDS[r]))),
  };
  const report = el('div', { class: 'builder-report', role: 'status', 'aria-live': 'polite', 'data-builder-intake-report': '' });
  const promptRow = field('Prompt (AI art)', f.prompt);
  const form = el('form', { class: 'builder-form' },
    el('p', { class: 'builder-sub', text: 'New art ships under CC0 1.0 like the rest of the art. PNG or WebP with transparency, drawn at twice its size in the street (the 2x file). Own work is named gz_..., AI art gz_ai_...' }),
    field('2x file', f.file2), field('3x file (optional, 1.5 times the 2x)', f.file3), field('Name', f.name), field('Licence', f.licence),
    field('Made by', f.author), field('Tool or model', f.tool), promptRow,
    field('Made from (one per line: deco:<library name> or own:<what>)', f.inputs), field('Meant for the layer', f.role),
    report,
    el('div', { class: 'builder-row' }, el('button', { type: 'submit', class: 'builder-btn builder-primary', text: 'Bring it in' }), el('button', { type: 'button', class: 'builder-btn', text: 'Close', onclick: () => dialog.close() })));
  const dialog = el('dialog', { class: 'builder-dialog', 'aria-labelledby': 'builder-art-title', 'data-builder-art-dialog': '' }, el('h2', { id: 'builder-art-title', text: 'Add new art' }), form);
  const syncLicence = () => {
    const ai = f.licence.value === 'ai-generated';
    f.prompt.required = ai;
    f.tool.required = ai;
    promptRow.hidden = !ai;
    if (ai && f.name.value && !f.name.value.startsWith('gz_ai_')) f.name.value = f.name.value.replace(/^gz_/, 'gz_ai_');
    if (!ai && f.name.value.startsWith('gz_ai_')) f.name.value = f.name.value.replace(/^gz_ai_/, 'gz_');
  };
  f.licence.addEventListener('change', syncLicence);
  f.file2.addEventListener('change', () => {
    if (f.name.value) return;
    const base = String(f.file2.files?.[0]?.name || '').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (base) f.name.value = `${f.licence.value === 'ai-generated' ? 'gz_ai_' : 'gz_'}${base.replace(/^gz_(ai_)?/, '')}`.slice(0, 96);
  });
  const readFile = async (input) => {
    const file = input.files?.[0];
    return file ? base64Of(new Uint8Array(await file.arrayBuffer())) : null;
  };
  function showReport(r, err) {
    const findings = r?.findings || [];
    report.replaceChildren(
      el('p', { class: err ? 'builder-warn' : 'builder-sub', text: err ? err : `Taken as ${r?.name || ''}.` }),
      ...(findings.length ? [el('ul', { class: 'builder-report-list' }, ...findings.map((x) => el('li', { 'data-severity': x.severity || '' }, el('b', { text: `${x.severity || ''}: ` }), el('span', { text: x.message || '' }))))] : []));
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ctx.editable()) return ctx.say('Open a draft street first: new art belongs to a draft.', 'bad');
    report.replaceChildren(el('p', { class: 'builder-sub', text: 'Checking the art...' }));
    try {
      const body = intakeBody({ draft: ctx.draft(), name: f.name.value, file2: await readFile(f.file2), file3: await readFile(f.file3), licence: f.licence.value, author: f.author.value, tool: f.tool.value, prompt: f.prompt.value, inputs: f.inputs.value, role: f.role.value });
      if (!body.file2) throw new Error('Choose the 2x file.');
      const r = await ctx.upload(body);
      showReport(r.report);
      ctx.say(`${r.report?.name || body.name} is in this draft's art. Find it at the top of the picker.`);
      state.query = '';
      search.value = '';
      refresh();
    } catch (err) {
      showReport(err?.data?.report || null, err?.message || 'That art was not taken.');
    }
  });
  uploadBtn.addEventListener('click', () => {
    if (!ctx.editable()) return ctx.say('Open a draft street first: new art belongs to a draft.', 'bad');
    report.replaceChildren();
    syncLicence();
    dialog.showModal();
    f.file2.focus();
  });

  return {
    section,
    dialog,
    /** Open the picker and put the keyboard in its search box (the D key). */
    open() {
      section.open = true;
      refresh();
      search.focus();
      search.select();
    },
    refresh: () => (section.open ? refresh() : Promise.resolve()),
    results: () => state.rows.map(({ row, score, hub }) => ({ name: row.name, score, hub, placements: row.placements || 0 })),
    find: (name) => state.rows.find((r) => r.row.name === name)?.row || null,
  };
}
