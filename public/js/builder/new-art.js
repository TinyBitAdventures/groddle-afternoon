/**
 * LEVEL BUILDER (spec 4, 9.1, 10; phase P5): new art in a draft. A `gz_` sprite is a picture that
 * came in through asset intake (the site's POST builder/assets, groddle-afternoon-site
 * src/BuilderIntake.php), not one of Tiny Speck's library decos. This module holds:
 *
 * - LICENCE_POLICY: the publish policy, the same as tools/builder/licence-policy.json (a test
 *   holds the two, and the site's BuilderIntake::LICENCES, together). Everything ships as CC0 1.0;
 *   new art is own work or AI-generated, dedicated CC0 1.0, with its provenance recorded, and its
 *   inputs are library decos or Austin's own work.
 * - provenanceProblems(name, row): what is wrong or missing in an assets{} row (AST-004 uses it).
 * - provenanceRows / provenanceSection: the inspector's few lines on who or what made a gz_ sprite.
 * - withNewArt / newArtUrl / installNewArt: how the editor draws gz_ sprites with the game's own
 *   renderer. The renderer asks for assets/decos/groddle/<name>.png like any deco; a URL route sends
 *   a gz_ name to the site's /builder-art/<sha256> (the re-encoded 2x WebP, administrators only).
 *
 * All pure but installNewArt (it registers a route in js/textures.js) and provenanceSection (it
 * builds DOM with the element helper it is given).
 */

export const LICENCE_POLICY = Object.freeze({
  licences: Object.freeze({
    'CC0-1.0': Object.freeze({ origin: 'tinyspeck-cc0', label: "CC0 1.0, Tiny Speck's library", requires: Object.freeze(['source']) }),
    'own-work-CC0': Object.freeze({ origin: 'new', label: 'Own work, dedicated CC0 1.0', requires: Object.freeze(['author', 'sha256', 'intake']), prefix: 'gz_', notPrefix: 'gz_ai_' }),
    'ai-generated': Object.freeze({ origin: 'new', label: 'AI-generated, dedicated CC0 1.0', requires: Object.freeze(['author', 'tool', 'prompt', 'sha256', 'intake']), prefix: 'gz_ai_' }),
  }),
  newArtName: '^gz_[a-z0-9]+(_[a-z0-9]+)*$',
  newArtNameMax: 96,
  inputsMax: 20,
});

const NAME = new RegExp(LICENCE_POLICY.newArtName);
const INPUT = /^(deco:[A-Za-z0-9_.-]{1,96}|own:.{1,200})$/;

/** PURE: is this a new-art sprite name (gz_ and lowercase words joined by _)? */
export function isNewArtName(name) {
  return typeof name === 'string' && name.length <= LICENCE_POLICY.newArtNameMax && NAME.test(name);
}

const filled = (v) => (typeof v === 'string' ? v.trim() !== '' : v != null);

/**
 * PURE: what is wrong with one assets{} row under the licence policy, as [{ code, message }]
 * (empty when it is fine). `library` (a Set or Map of library deco names) lets a `deco:` input be
 * checked; without it, deco inputs are taken on trust.
 * Codes: licence (not a CC0 1.0 dedication), origin (licence and origin disagree), missing
 * (a field the licence requires), name (the prefix rule: gz_ for own work, gz_ai_ for AI art),
 * inputs (an input that is not a library deco or Austin's own work).
 * @param {string} name
 * @param {object} row
 * @param {{ library?: { has: (n: string) => boolean } }} [opts]
 * @returns {{ code: string, message: string }[]}
 */
export function provenanceProblems(name, row, { library = null } = {}) {
  const out = [];
  if (!row || typeof row !== 'object') return [{ code: 'missing', message: `${name} has no provenance row.` }];
  const rule = LICENCE_POLICY.licences[row.licence];
  if (!rule) {
    out.push({ code: 'licence', message: `${name}: the licence ${JSON.stringify(row.licence ?? null)} is not a CC0 1.0 dedication (CC0-1.0, own-work-CC0 or ai-generated).` });
    return out;
  }
  if (row.origin !== rule.origin) out.push({ code: 'origin', message: `${name}: a ${row.licence} row has origin ${rule.origin}, not ${row.origin ?? 'none'}.` });
  const missing = rule.requires.filter((k) => !filled(row[k]));
  if (missing.length) out.push({ code: 'missing', message: `${name}: provenance is missing ${missing.join(', ')}.` });
  if (rule.origin === 'new') {
    if (!isNewArtName(name) || !name.startsWith(rule.prefix) || (rule.notPrefix && name.startsWith(rule.notPrefix))) {
      out.push({ code: 'name', message: row.licence === 'ai-generated' ? `${name}: AI-generated art is named gz_ai_…` : `${name}: own work is named gz_… (not gz_ai_…).` });
    }
  }
  const inputs = row.inputs ?? [];
  if (!Array.isArray(inputs) || inputs.length > LICENCE_POLICY.inputsMax) {
    out.push({ code: 'inputs', message: `${name}: inputs is a list of at most ${LICENCE_POLICY.inputsMax}.` });
  } else {
    for (const i of inputs) {
      if (typeof i !== 'string' || !INPUT.test(i)) out.push({ code: 'inputs', message: `${name}: the input ${JSON.stringify(i)} is neither a library deco (deco:<name>) nor Austin's own work (own:<what>).` });
      else if (library && i.startsWith('deco:') && !library.has(i.slice(5))) out.push({ code: 'inputs', message: `${name}: the input ${i} is not a library deco.` });
    }
  }
  return out;
}

/**
 * PURE: the inspector's lines for a gz_ sprite's row: [{ label, value }]. Who or what made it,
 * from what, and under which licence; the prompt is cut to 160 characters (the row keeps it all).
 */
export function provenanceRows(name, row) {
  if (!row) return [{ label: 'Provenance', value: 'None recorded. Bring the art in through asset intake.' }];
  const rule = LICENCE_POLICY.licences[row.licence];
  const rows = [{ label: 'Licence', value: rule ? rule.label : String(row.licence ?? 'none') }];
  if (row.author) rows.push({ label: row.licence === 'ai-generated' ? 'Made by (person)' : 'Made by', value: row.author });
  if (row.tool) rows.push({ label: row.licence === 'ai-generated' ? 'Model' : 'Tool', value: row.tool });
  if (row.prompt) rows.push({ label: 'Prompt', value: row.prompt.length > 160 ? `${row.prompt.slice(0, 159)}…` : row.prompt });
  const inputs = Array.isArray(row.inputs) ? row.inputs : [];
  rows.push({ label: 'Made from', value: inputs.length ? inputs.map((i) => (i.startsWith('deco:') ? `library deco ${i.slice(5)}` : i.startsWith('own:') ? `own work: ${i.slice(4)}` : i)).join('; ') : 'nothing named' });
  if (row.w && row.h) rows.push({ label: 'Art file', value: `${row.w} by ${row.h}` });
  if (row.sha256) rows.push({ label: 'sha256', value: row.sha256.slice(0, 16) });
  return rows;
}

/**
 * The inspector's provenance section for a gz_ sprite (or null for a library deco): a heading, the
 * rows as a definition list, and any policy problems. `h` is the editor's element helper
 * (tag, attrs, ...kids). Read-only: provenance is set at intake and the site refuses an edit to it.
 */
export function provenanceSection(h, name, row, opts = {}) {
  if (!isNewArtName(name) && row?.origin !== 'new') return null;
  const list = h('dl', { class: 'builder-prov', 'data-builder-provenance': name });
  for (const { label, value } of provenanceRows(name, row)) list.append(h('dt', { text: label }), h('dd', { text: value }));
  const problems = row ? provenanceProblems(name, row, opts) : [];
  return h('section', { class: 'builder-prov-wrap', 'aria-label': 'Provenance' },
    h('h3', { class: 'builder-h3', text: 'New art' }), list,
    ...problems.map((p) => h('p', { class: 'builder-sub builder-warn', role: 'note', text: p.message })));
}

/** PURE: the library names plus the zone's gz_ sprites that have a stored file (a new Set). */
export function withNewArt(available, assets) {
  const out = new Set(available || []);
  for (const [name, row] of Object.entries(assets || {})) if (isNewArtName(name) && row?.origin === 'new' && /^[0-9a-f]{64}$/.test(row.sha256 || '')) out.add(name);
  return out;
}

const DECO_FILE = /(?:^|\/)assets\/decos\/groddle\/(gz_[a-z0-9_]+?)(?:@[\d.]+x)?\.(?:png|webp)(?:[?#].*)?$/;

/** PURE: the site URL for a deco URL naming a gz_ sprite with a stored file, else null. */
export function newArtUrl(url, assets) {
  const m = DECO_FILE.exec(String(url || ''));
  if (!m) return null;
  const sha = assets?.[m[1]]?.sha256;
  return /^[0-9a-f]{64}$/.test(sha || '') ? `/builder-art/${sha}` : null;
}

/** Routes gz_ deco URLs to /builder-art/<sha> in js/textures.js; `assets()` gives the open zone's assets{}. */
export function installNewArt(textures, assets) {
  // raw: back layers load their 2x files raw (street-render.js farUrl), and new art lives at /builder-art/ either way.
  if (typeof textures?.addUrlRoute === 'function') textures.addUrlRoute('builder-new-art', (url) => newArtUrl(url, assets()), { raw: true });
}
