/**
 * LEVEL BUILDER (spec 7.1): the validator in a Web Worker for the editor. A module worker:
 *
 *   const { WORKER_URL } = await import('./validate-worker.js');   // keyed, so the URL is too
 *   const w = new Worker(WORKER_URL, { type: 'module' });
 *   w.postMessage({ id, zone, rules?, urls?, shipped? });   // -> { id, report } or { id, error }
 *   (urls: VALIDATOR_DATA paths -> their content-keyed URLs, from the page's groddleDataUrl;
 *   shipped: { tsid: street JSON } for every shipped street the zone's arms and edits name, so the
 *   NAV rules can look at them: the page has them already)
 *
 * Imported on the page it only gives its URL; it listens for messages only inside a worker.
 *
 * It loads the validator's data once, over HTTP from the built game (the page's <base> is the
 * site root, so paths are the game's own): the street index, the deco manifest and catalog, the
 * ecology rows, the style profiles and the zone schema (assets/content/zone.schema.json, a copy of
 * docs/level-builder/zone.schema.json that tests/builder-validate.test.js keeps equal).
 */
import { validateZone } from './validate.js?v=89d70464';
import { compileSchema } from './schema-check.js?v=cc9d1af4';
import { DECO_TWINS } from '../street-render.js?v=ae048a15';
import { ANIM_DECOS } from '../deco-anim-list.js?v=ecfee655';
import { SHARP_DECOS } from '../deco-sharp-list.js?v=14808a90';
import { setStreetEcologyCatalog } from '../street-ecology.js?v=7e30da8f';

/** Where the game's files are, from this module's own URL (js/builder/ -> the game root). */
const ROOT = new URL('../../', import.meta.url);
/** The data files the validator reads. The page keys them (js/data-urls.js groddleDataUrl) and sends the URLs. */
export const VALIDATOR_DATA = Object.freeze([
  'assets/streets/index.json', 'assets/decos/manifest.json', 'assets/content/deco-catalog.json',
  'assets/content/street-ecology.json', 'assets/content/zone.schema.json', 'assets/content/style-profiles.json',
]);
let urls = {};
const get = async (path) => {
  const r = await fetch(urls[path] || new URL(path, ROOT));
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

let ctx = null;
async function context() {
  if (ctx) return ctx;
  const [index, manifest, catalog, ecology, schema, profiles] = await Promise.all([
    get('assets/streets/index.json'),
    get('assets/decos/manifest.json'),
    get('assets/content/deco-catalog.json'),
    get('assets/content/street-ecology.json'),
    get('assets/content/zone.schema.json').catch(() => null),
    get('assets/content/style-profiles.json').catch(() => null),
  ]);
  setStreetEcologyCatalog(ecology);
  ctx = {
    schema,
    schemaCheck: schema ? compileSchema(schema) : null,
    index: index.streets,
    library: new Set(manifest),
    catalog: new Map(catalog.decos.map((d) => [d.name, d])),
    twins: DECO_TWINS,
    animated: new Set(ANIM_DECOS.keys()),
    sharp: new Set(SHARP_DECOS.keys()),
    profiles,
  };
  return ctx;
}

/** This module's own URL, content key included (tools/module-keys keys the import that loads it). */
export const WORKER_URL = import.meta.url;

const inWorker = typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope;
if (inWorker) self.addEventListener('message', async (e) => {
  const { id, zone, rules = null, shipped = null } = e.data || {};
  if (e.data?.urls && !ctx) urls = e.data.urls;
  try {
    const c = await context();
    const report = validateZone(zone, shipped ? { ...c, rules, streetFor: (tsid) => shipped[tsid] || null } : { ...c, rules });
    self.postMessage({ id, report });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
});
