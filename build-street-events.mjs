/**
 * Add per-street physics and location event scripts the first street import
 * dropped (rules in public/js/location-events.js):
 *
 *   physics      { delta, setting }: the G*.xml `<object id="physics">`
 *                block (setting = full PhysicsSetting, delta = fields that
 *                differ from config_base.js physics_configs.normal).
 *   events       { [name]: action[] } from the L*.xml `events` hash, actions
 *                in run order; code actions parsed into teleport / activity /
 *                quest_flag steps or marked unsupported with a reason;
 *                teleports gain `street` (imported key) and `arrive` (target
 *                screen space, on its platform); play_sound gains `url` when
 *                the sound file is in assets/audio.
 *   eventBoxes   recovered Collision-triggered Event Boxes, screen space
 *                bottom-centre (x, y, w, h) with onEnter/onExit event names.
 *   deco ids     every deco an event shows or hides gets its XML `id`, so
 *                street-render's decoViews can find it.
 *
 * Source: tinyspeck/glitch-locations G*.xml + L*.xml (CC0). Edits
 * assets/streets/*.json in place; safe to re-run (after build-street-layers.mjs
 * and build-street-navigation.mjs).
 *
 * Run from spike root:
 *   node build-street-events.mjs
 */

import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrivalInTarget, streetAliases } from './public/js/location-navigation.js';
import {
  buildStreetEvents,
  childObjects,
  directScalars,
  eventDecoIds,
  eventStats,
  objectBodyById,
  parseLocationEvents,
  parseStreetPhysics,
  physicsDelta,
  streetOwner,
} from './public/js/location-events.js';

const root = dirname(fileURLToPath(import.meta.url));
const streetsDir = join(root, 'public/assets/streets');
const audioDir = join(root, 'public/assets/audio');
const xmlRoot =
  process.env.GRODDLE_LOCATION_XML ||
  decodeURIComponent(new URL('../streets/mnt/stos/location_data', import.meta.url).pathname);

async function readable(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readXml(tsid) {
  const path = join(xmlRoot, `${tsid}.xml`);
  return (await readable(path)) ? readFile(path, 'utf8') : '';
}

const index = JSON.parse(await readFile(join(streetsDir, 'index.json'), 'utf8'));
const files = (await readdir(streetsDir)).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f));
const streets = new Map();
for (const file of files) {
  const street = JSON.parse(await readFile(join(streetsDir, file), 'utf8'));
  streets.set(street.tsid || file.slice(0, -5), { file, street });
}

function resolveKey(tsid) {
  for (const alias of streetAliases(tsid)) if (index.streets[alias]) return alias;
  return null;
}

function resolveArrival(tsid, x, y) {
  const key = resolveKey(tsid);
  if (!key) return { street: null };
  const target = streets.get(key)?.street;
  const arrive = target ? arrivalInTarget(target, x, y) : null;
  return { street: key, arrive: arrive ? { x: arrive.x, y: arrive.y } : null };
}

const sfxFiles = new Set((await readdir(join(audioDir, 'sfx')).catch(() => [])).map((f) => f.toLowerCase()));
const audioFiles = new Set((await readdir(audioDir).catch(() => [])).map((f) => f.toLowerCase()));
const sfxNames = new Map((await readdir(join(audioDir, 'sfx')).catch(() => [])).map((f) => [f.toLowerCase(), f]));
function soundUrl(name) {
  const lower = `${String(name).toLowerCase()}.mp3`;
  if (sfxFiles.has(lower)) return `assets/audio/sfx/${sfxNames.get(lower)}`;
  if (audioFiles.has(lower)) return `assets/audio/${lower}`;
  return null;
}

/** XML decos by id: { layer, sprite, x, y }. */
function xmlDecos(gXml) {
  const out = new Map();
  const layers = objectBodyById(gXml, 'layers');
  if (layers == null) return out;
  for (const layer of childObjects(layers)) {
    const decos = childObjects(layer.body).find((c) => c.id === 'decos');
    for (const deco of decos ? childObjects(decos.body) : []) {
      const s = directScalars(deco.body);
      out.set(deco.id, { layer: layer.id, sprite: s.sprite_class, x: s.x, y: s.y });
    }
  }
  return out;
}

const totals = {
  physicsStreets: 0,
  physicsChanged: 0,
  physicsOwned: 0,
  jetpack: 0,
  lowGravity: 0,
  scaled: 0,
  noTriple: 0,
  eventStreets: 0,
  eventsOwned: 0,
  events: 0,
  actions: 0,
  arrivalEvents: 0,
  arrivalReachable: 0,
  boxStreets: 0,
  boxes: 0,
  ctebObjrefs: 0,
  decoIdsTagged: 0,
  decoIdsMissing: 0,
  teleports: 0,
  teleportsImported: 0,
  soundsWithUrl: 0,
  soundsMissing: 0,
  types: {},
};
const missingSounds = new Map();

for (const [tsid, { file, street }] of streets) {
  const gXml = await readXml(`G${tsid.slice(1)}`);
  const lXml = await readXml(`L${tsid.slice(1)}`);
  delete street.physics;
  delete street.events;
  delete street.eventBoxes;
  const setting = gXml ? parseStreetPhysics(gXml) : null;
  const events = lXml ? parseLocationEvents(lXml) : {};
  const ctebCount = (lXml.match(/label="Collision-triggered Event Box"/g) || []).length;
  if (!setting && !Object.keys(events).length) continue;

  for (const actions of Object.values(events)) {
    for (const act of actions) {
      if (act.type !== 'play_sound') continue;
      const url = soundUrl(act.name);
      if (url) {
        act.url = url;
        totals.soundsWithUrl += 1;
      } else {
        totals.soundsMissing += 1;
        missingSounds.set(act.name, (missingSounds.get(act.name) || 0) + 1);
      }
    }
  }

  const built = buildStreetEvents({ setting, events, ctebCount, street, resolveArrival });
  const owner = streetOwner(tsid);
  if (built.physics) {
    street.physics = built.physics;
    totals.physicsStreets += 1;
    const delta = physicsDelta(setting);
    if (Object.keys(delta).length) totals.physicsChanged += 1;
    if (owner) totals.physicsOwned += 1;
    if (setting.jetpack) totals.jetpack += 1;
    if (setting.gravity < 1190) totals.lowGravity += 1;
    if (setting.pc_scale !== 1) totals.scaled += 1;
    if (setting.multiplier_3_jump === 0) totals.noTriple += 1;
  }
  if (built.events) {
    street.events = built.events;
    totals.eventStreets += 1;
    if (owner) totals.eventsOwned += 1;
    totals.ctebObjrefs += ctebCount;
    const stats = eventStats(built.events);
    totals.events += stats.events;
    totals.actions += stats.actions;
    totals.arrivalEvents += stats.arrival;
    totals.arrivalReachable += stats.arrivalReachable;
    for (const [k, v] of Object.entries(stats.types)) totals.types[k] = (totals.types[k] || 0) + v;
    for (const actions of Object.values(built.events)) {
      for (const act of actions) {
        const steps = act.code?.type === 'steps' ? act.code.steps : act.code ? [act.code] : [];
        for (const step of steps) {
          if (step.type !== 'teleport') continue;
          totals.teleports += 1;
          if (step.street) totals.teleportsImported += 1;
        }
      }
    }
    // Tag the decos events show/hide with their XML ids.
    const wanted = eventDecoIds(built.events);
    if (wanted.size && gXml) {
      const byId = xmlDecos(gXml);
      for (const id of wanted) {
        const src = byId.get(id);
        const layer = src && (street.layers || []).find((l) => l.id === src.layer);
        const deco = layer?.decos?.find((d) => d.sprite === src.sprite && d.x === src.x && d.y === src.y && (!d.id || d.id === id));
        if (deco) {
          deco.id = id;
          totals.decoIdsTagged += 1;
        } else {
          totals.decoIdsMissing += 1;
        }
      }
    }
  }
  if (built.eventBoxes) {
    street.eventBoxes = built.eventBoxes;
    totals.boxStreets += 1;
    totals.boxes += built.eventBoxes.length;
  }
  await writeFile(join(streetsDir, file), `${JSON.stringify(street)}\n`);
}

console.log(JSON.stringify(totals, null, 1));
if (missingSounds.size) {
  console.log('sounds without a recovered file:', [...missingSounds.keys()].sort().join(' '));
}
