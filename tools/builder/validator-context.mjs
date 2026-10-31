/**
 * LEVEL BUILDER (spec 7.1): the validator's data, loaded from the repo for Node callers (the
 * calibration run, tests, later the CLI). The editor's worker loads the same files over HTTP
 * (public/js/builder/validate-worker.js).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from '../repos.mjs';
import { DECO_TWINS } from '../../public/js/street-render.js?v=3bcef6a7';
import { ANIM_DECOS } from '../../public/js/deco-anim-list.js?v=ecfee655';
import { SHARP_DECOS } from '../../public/js/deco-sharp-list.js?v=14808a90';
import { compileSchema } from '../../public/js/builder/schema-check.js?v=cc9d1af4';
import { setStreetEcologyCatalog } from '../../public/js/street-ecology.js?v=7e30da8f';

const pub = (p) => join(GAME_DIR, 'public', p);
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** The validator's ctx (validate.js header), from this checkout. */
export function loadValidatorContext({ publish = false } = {}) {
  const schema = json(join(GAME_DIR, 'docs/level-builder/zone.schema.json'));
  const index = json(pub('assets/streets/index.json')).streets;
  const catalog = new Map(json(pub('assets/content/deco-catalog.json')).decos.map((d) => [d.name, d]));
  setStreetEcologyCatalog(json(pub('assets/content/street-ecology.json')));
  const cache = new Map();
  return {
    schema,
    schemaCheck: compileSchema(schema),
    index,
    library: new Set(json(pub('assets/decos/manifest.json'))),
    catalog,
    twins: DECO_TWINS,
    animated: new Set(ANIM_DECOS.keys()),
    sharp: new Set(SHARP_DECOS.keys()),
    profiles: json(pub('assets/content/style-profiles.json')),
    publish,
    streetFor(tsid) {
      const row = index[tsid];
      if (!row?.file) return null;
      if (!cache.has(tsid)) cache.set(tsid, json(pub(row.file)));
      return cache.get(tsid);
    },
  };
}

/** Every shipped street file: [tsid, path]. */
export function shippedStreetFiles() {
  const dir = pub('assets/streets');
  return readdirSync(dir).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f)).map((f) => [f.replace(/\.json$/, ''), join(dir, f)]);
}
