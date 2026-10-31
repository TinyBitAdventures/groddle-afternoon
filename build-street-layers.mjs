/**
 * Add the parallax and colour data the first street import dropped:
 * each layer's canvas size (w, h), its `filtersNEW` colour treatment
 * (brightness, contrast, saturation, tintColor, tintAmount, blur), and the
 * location's sky `gradient` (top, bottom), its `music_file` override, plus each
 * deco's `h_flip`, `hidden` and `animated` flags, each layer's `is_hidden` (as `hidden`), and
 * each platform line's `platform_item_perm` (as `item_perm`), and the location's
 * `no_map` / `fog_map` flags (as `noMap` / `fogMap`).
 * Source: tinyspeck/glitch-locations (CC0). Edits assets/streets/*.json in place; safe to re-run.
 *
 * `animated`: the client plays a placed deco's timeline only when the placement says so
 * (DecoRenderer.as 301-305: MCUtil.recursivePlay, else recursiveGotoAndStop on frame 1), at the
 * stage's 30 fps (TSEngineConstants.TARGET_FRAMERATE). js/street-render.js plays those decos from
 * the strips in assets/decos/animated/ (tools/deco-pipeline/animate.py).
 *
 * `item_perm`: what a line is for items, the twin of `pc_perm` (PlatformLine.as 349-355,
 * item_solid_from_top / item_solid_from_bottom): -1 items rest on it and pass up through it,
 * 1 an underside items fall through, 0 soft both ways, null hard both ways. Every archived
 * line carries one (an `<int>` or `<null>`); a line without one would be solid both ways in
 * the client (an unset `*` field compares unequal to 0 and 1), so it is left off here too.
 * js/street-model.js isItemSolid reads it.
 *
 * `noMap` / `fogMap` (G370, js/ui/street-minimap.js): Location.as 61-63 `no_map` hides the street
 * map entirely (show_map is false, TSFrontController.changeMiniMapVisibility); `fog_map` keeps it
 * but covers the picture with a 70% black wash and "No map: You're on your own" (MiniMapView.as
 * addGraphic 330-337). 65 archived streets set no_map (towers, basements, tutorial scenes), 2
 * set fog_map (The Drop, The Other Drop). Only `true` is written.
 *
 * Run from spike root:
 *   node build-street-layers.mjs           (write)
 *   node build-street-layers.mjs --check   (exit 1 if any street JSON would change)
 */

import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const streetsDir = join(root, 'public/assets/streets');
const xmlRoot =
  process.env.GRODDLE_LOCATION_XML ||
  decodeURIComponent(new URL('../streets/mnt/stos/location_data', import.meta.url).pathname);

const CHECK = process.argv.includes('--check');
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
      animated: /<bool id="animated">true<\/bool>/.test(deco.body),
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
let animatedDecos = 0;
let itemPerms = 0;
const itemPermCounts = new Map();
const stale = [];
let filtered = 0;
let gradients = 0;
let noMaps = 0;
let fogMaps = 0;
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
  const before = CHECK ? JSON.stringify(street) : null;

  // The location's music override (announce_music on entry), e.g. HELL.
  const music = xml.match(/<str id="music_file">([^<]+)<\/str>/)?.[1]?.trim();
  if (music) street.musicFile = music;
  else delete street.musicFile;

  // G370: the street map's own flags (only the location's top-level bools).
  const topBool = (id) => new RegExp(`\\n\\t{2}<bool id="${id}">true</bool>`).test(xml);
  if (topBool('no_map')) street.noMap = true;
  else delete street.noMap;
  if (topBool('fog_map')) street.fogMap = true;
  else delete street.fogMap;
  if (street.noMap) noMaps += 1;
  if (street.fogMap) fogMaps += 1;

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
      if (layer.id === 'middleground') {
        const lines = childObjects(body).find((c) => c.id === 'platform_lines');
        const perms = new Map();
        for (const line of lines ? childObjects(lines.body) : []) {
          const own = line.body.replace(/<object id="(start|end)">[\s\S]*?<\/object>/g, '');
          const int = own.match(/<int id="platform_item_perm">(-?\d+)<\/int>/);
          if (int) perms.set(line.id, Number(int[1]));
          else if (/<null id="platform_item_perm"\/>/.test(own)) perms.set(line.id, null);
        }
        for (const platform of street.platforms || []) {
          if (perms.has(platform.id)) {
            platform.item_perm = perms.get(platform.id);
            itemPerms += 1;
            const key = String(platform.item_perm);
            itemPermCounts.set(key, (itemPermCounts.get(key) || 0) + 1);
          } else {
            delete platform.item_perm;
          }
        }
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
        if (flag?.animated) {
          deco.animated = true;
          animatedDecos += 1;
        } else {
          delete deco.animated;
        }
      }
    }
  }
  if (CHECK) {
    if (JSON.stringify(street) !== before) stale.push(file);
  } else {
    await writeFile(path, `${JSON.stringify(street)}\n`);
  }
  updated += 1;
}
console.log(
  `${CHECK ? 'Checked' : 'Updated'} ${updated} streets: ${gradients} gradients, ${filtered} filtered layers, ` +
    `${flipped} flipped decos, ${hiddenDecos} hidden decos, ${animatedDecos} animated decos, ${hiddenLayers} hidden layers, ` +
    `${itemPerms} line item perms (${['-1', '0', '1', 'null'].map((k) => `${k}: ${itemPermCounts.get(k) || 0}`).join(', ')}), ` +
    `${noMaps} no_map, ${fogMaps} fog_map.`
);
if (CHECK && stale.length) {
  console.log(`${stale.length} street files are stale (run node build-street-layers.mjs): ${stale.slice(0, 8).join(', ')}`);
  process.exit(1);
}
