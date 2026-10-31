/**
 * LEVEL BUILDER (spec 7.1): the validator's data, loaded from the repo for Node callers (the
 * calibration run, tests, later the CLI). The editor's worker loads the same files over HTTP
 * (public/js/builder/validate-worker.js).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from '../repos.mjs';
import { DECO_TWINS } from '../../public/js/street-render.js?v=ae048a15';
import { ANIM_DECOS } from '../../public/js/deco-anim-list.js?v=ecfee655';
import { SHARP_DECOS } from '../../public/js/deco-sharp-list.js?v=14808a90';
import { compileSchema } from '../../public/js/builder/schema-check.js?v=cc9d1af4';
import { isZoneTsid, withoutZoneConnects, withoutZoneRows } from '../../public/js/zone-streets.js?v=b40010d5';
import { setStreetEcologyCatalog } from '../../public/js/street-ecology.js?v=7e30da8f';

const pub = (p) => join(GAME_DIR, 'public', p);
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * The validator's ctx (validate.js header), from this checkout (or another one, `root`). With
 * `zones: false` the world is Tiny Speck's alone: no published zone's index rows, and no arm into a
 * zone on a shipped street (tests, so a fixture validates the same whatever is published).
 */
export function loadValidatorContext({ publish = false, root = GAME_DIR, zones = true } = {}) {
  const pub = (p) => join(root, 'public', p);
  const schema = json(join(root, 'docs/level-builder/zone.schema.json'));
  const allRows = json(pub('assets/streets/index.json')).streets;
  const index = zones ? allRows : withoutZoneRows(allRows);
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
      if (!cache.has(tsid)) {
        const s = json(pub(row.file));
        if (!zones && Array.isArray(s.signposts)) s.signposts = withoutZoneConnects(s.signposts);
        cache.set(tsid, s);
      }
      return cache.get(tsid);
    },
  };
}

/** Every shipped street file: [tsid, path]. A published zone's streets (GZ) are not shipped ones. */
export function shippedStreetFiles() {
  const dir = pub('assets/streets');
  return readdirSync(dir).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f) && !isZoneTsid(f.slice(0, -5))).map((f) => [f.replace(/\.json$/, ''), join(dir, f)]);
}
