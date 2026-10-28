/**
 * Add the parallax and colour data the first street import dropped:
 * each layer's canvas size (w, h), its `filtersNEW` colour treatment
 * (brightness, contrast, saturation, tintColor, tintAmount, blur), and the
 * location's sky `gradient` (top, bottom), its `music_file` override, plus each
 * deco's `h_flip` and
 * `hidden` flags, and each layer's `is_hidden` (as `hidden`). Source: tinyspeck/glitch-locations
 * (CC0). Edits assets/streets/*.json in place; safe to re-run.
 *
 * Run from spike root:
 *   node build-street-layers.mjs
 */

import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const streetsDir = join(root, 'public/assets/streets');
const xmlRoot =
  process.env.GRODDLE_LOCATION_XML ||
  decodeURIComponent(new URL('../streets/mnt/stos/location_data', import.meta.url).pathname);

const FILTER_KEYS = ['brightness', 'contrast', 'saturation', 'tintColor', 'tintAmount', 'blur'];

async function readable(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Return the body of the object with `id` that starts at `from`, matching nesting. */
function objectBody(xml, from) {
  const open = /<object id="[^"]*">|<\/object>/g;
  open.lastIndex = from;
  let depth = 0;
  let start = -1;
  let m;
  while ((m = open.exec(xml))) {
    if (m[0].startsWith('<object')) {
      if (depth === 0) start = m.index + m[0].length;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) return xml.slice(start, m.index);
    }
  }
  return '';
}

/** Direct children objects of a body: [{ id, body }]. */
function childObjects(body) {
  const out = [];
  const tag = /<object id="([^"]*)">|<\/object>/g;
  let depth = 0;
  let m;
  let current = null;
  let start = 0;
  while ((m = tag.exec(body))) {
    if (m[0].startsWith('<object')) {
      if (depth === 0) {
        current = m[1];
        start = m.index + m[0].length;
      }
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && current != null) {
        out.push({ id: current, body: body.slice(start, m.index) });
        current = null;
      }
    }
  }
  return out;
}

/** Scalars that are direct children of a body (skips nested objects). */
function directScalars(body) {
  const flat = childObjects(body).reduce(
    (text, child) => text.replace(child.body, ''),
    body
  );
  const out = {};
  for (const m of flat.matchAll(/<(int|dbl|str) id="([^"]+)">([^<]*)<\/\1>/g)) {
    out[m[2]] = m[1] === 'str' ? m[3] : Number(m[3]);
  }
  return out;
}

function parseFilters(body) {
  const filters = {};
  for (const child of childObjects(body)) {
    if (!FILTER_KEYS.includes(child.id)) continue;
    const value = Number(child.body.match(/<(?:int|dbl) id="value">([^<]*)</)?.[1]);
    if (Number.isFinite(value) && value !== 0) filters[child.id] = value;
  }
  return Object.keys(filters).length ? filters : null;
}

const files = (await readdir(streetsDir)).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f));
/** XML deco flags keyed by sprite/x/y, in document order per key. */
function decoFlags(layerBody) {
  const decos = childObjects(layerBody).find((c) => c.id === 'decos');
  const byKey = new Map();
  for (const deco of decos ? childObjects(decos.body) : []) {
    const scalars = directScalars(deco.body);
    const key = `${scalars.sprite_class}|${scalars.x}|${scalars.y}`;
    const flags = {
      flip: /<bool id="h_flip">true<\/bool>/.test(deco.body),
      hidden: /<bool id="hidden">true<\/bool>/.test(deco.body),
    };
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(flags);
  }
  return byKey;
}

let updated = 0;
let flipped = 0;
let hiddenDecos = 0;
let hiddenLayers = 0;
let filtered = 0;
let gradients = 0;
for (const file of files) {
  const path = join(streetsDir, file);
  const street = JSON.parse(await readFile(path, 'utf8'));
  const tsid = street.tsid || file.slice(0, -5);
  const candidates = [tsid, `G${tsid.slice(1)}`, `L${tsid.slice(1)}`].map((id) => join(xmlRoot, `${id}.xml`));
  let xmlPath = null;
  for (const candidate of candidates) {
    if (await readable(candidate)) {
      xmlPath = candidate;
      break;
    }
  }
  if (!xmlPath) continue;
  const xml = await readFile(xmlPath, 'utf8');

  // The location's music override (announce_music on entry), e.g. HELL.
  const music = xml.match(/<str id="music_file">([^<]+)<\/str>/)?.[1]?.trim();
  if (music) street.musicFile = music;
  else delete street.musicFile;

  const gradientAt = xml.indexOf('<object id="gradient">');
  if (gradientAt >= 0) {
    const g = directScalars(objectBody(xml, gradientAt));
    if (/^[0-9a-f]{6}$/i.test(g.top || '') && /^[0-9a-f]{6}$/i.test(g.bottom || '')) {
      street.gradient = { top: g.top.toUpperCase(), bottom: g.bottom.toUpperCase() };
      gradients += 1;
    }
  }

  const layersAt = xml.indexOf('<object id="layers">');
  if (layersAt >= 0) {
    const byId = new Map(childObjects(objectBody(xml, layersAt)).map((c) => [c.id, c.body]));
    for (const layer of street.layers || []) {
      const body = byId.get(layer.id);
      if (!body) continue;
      const scalars = directScalars(body);
      if (Number.isFinite(scalars.w) && scalars.w > 0) layer.w = scalars.w;
      if (Number.isFinite(scalars.h) && scalars.h > 0) layer.h = scalars.h;
      // A layer the editors hid: the regular client splices it from Location.layers
      // (Location.as 541, all but the middleground), so it never draws.
      const ownText = childObjects(body).reduce((text, child) => text.replace(child.body, ''), body);
      if (layer.id !== 'middleground' && /<bool id="is_hidden">true<\/bool>/.test(ownText)) {
        layer.hidden = true;
        hiddenLayers += 1;
      } else {
        delete layer.hidden;
      }
      const filterChild = childObjects(body).find((c) => c.id === 'filtersNEW');
      const filters = filterChild ? parseFilters(filterChild.body) : null;
      if (filters) {
        layer.filters = filters;
        filtered += 1;
      } else {
        delete layer.filters;
      }
      const flags = layer.id === 'middleground'
        ? decoFlags(body.replace(/<object id="(platform_lines|walls|ladders|signposts|boxes|targets|doors)">[\s\S]*?\n\t{4}<\/object>/g, ''))
        : decoFlags(body);
      for (const deco of layer.decos || []) {
        const queue = flags.get(`${deco.sprite}|${deco.x}|${deco.y}`);
        const flag = queue?.shift();
        if (flag?.flip) {
          deco.flip = true;
          flipped += 1;
        } else {
          delete deco.flip;
        }
        if (flag?.hidden) {
          deco.hidden = true;
          hiddenDecos += 1;
        } else {
          delete deco.hidden;
        }
      }
    }
  }
  await writeFile(path, `${JSON.stringify(street)}\n`);
  updated += 1;
}
console.log(
  `Updated ${updated} streets: ${gradients} gradients, ${filtered} filtered layers, ` +
    `${flipped} flipped decos, ${hiddenDecos} hidden decos, ${hiddenLayers} hidden layers.`
);
