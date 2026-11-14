/**
 * Region map backgrounds (G471, round 5): each region's 150 x 91 thumbnail from Tiny Speck's CC0
 * world-map file (glitch-overlays/world_map.fla), upscaled and softened into a painting behind the
 * street lines (tools/map-backgrounds/build.mjs). The real 760 x 460 paintings are lost; the
 * Tribute Blog's region maps (reference only) were the look to match.
 *
 * G522: a region in tools/provenance/repainted-maps.json carries a painting repainted for the
 * remake from its thumbnail instead (Groddle Meadow first, Austin 2026-11-05); the builder keeps it.
 * G569 (2026-11-13): four regions the world map drew no thumbnail for (Naraka, Ilmenskie Caverns,
 * Ilmenskie Deeps, The Seams) carry a repaint made from their street layouts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readThumbs, regionThumbs, repaints } from '../tools/map-backgrounds/build.mjs';
import { HUB_MAP_BACKGROUNDS } from '../public/js/hub-map-backgrounds.js?v=d6a23c90';
import { buildHubMapView, hubMapRefusal, isPlaceholderMap, PLACEHOLDER_MAP_COLOURS, PUBLIC_HUBS, renderHubMapSvg } from '../public/js/map-graph.js?v=31437f5b';
import { hubMapArtNote } from '../public/js/panel-copy.js?v=85c3e029';
import { CHECKLIST } from '../tools/restoration/checklist.mjs';
import { MAP_ART_NOTE } from '../tools/encyclopedia/streets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const MANIFEST = JSON.parse(read('public/assets/maps/art/bg/backgrounds.json'));
const INDEX = JSON.parse(read('public/assets/maps/index.json'));
const hub = (id) => JSON.parse(read(`public/assets/maps/hubs/hub-${id}.json`));
const STREETS = JSON.parse(read('public/assets/streets/index.json')).streets;
const REPAINTS = JSON.parse(read('tools/provenance/repainted-maps.json'));
const POLICY = JSON.parse(read('tools/builder/licence-policy.json'));

/** WebP size from the VP8/VP8L/VP8X header. */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error(`webp chunk ${chunk}`);
}

describe('region map backgrounds (tools/map-backgrounds/build.mjs)', () => {
  it('--check: the manifest, the module and every file are current', () => {
    execFileSync(process.execPath, ['tools/map-backgrounds/build.mjs', '--check'], { cwd: root, stdio: 'pipe' });
  });

  it('every public region with a thumbnail has a background, at 1x and 2x', () => {
    const regions = regionThumbs();
    assert.ok(Object.keys(regions).length >= 45, `${Object.keys(regions).length} regions`);
    for (const [id, { hubName }] of Object.entries(regions)) {
      const bg = HUB_MAP_BACKGROUNDS[id];
      assert.ok(bg, `${id} ${hubName} has a background`);
      for (const [rel, size] of [[bg.x1, [760, 460]], [bg.x2, [1520, 920]]]) {
        const p = join(root, 'public', rel);
        assert.ok(existsSync(p), rel);
        const buf = readFileSync(p);
        assert.deepEqual(webpSize(buf), size, rel);
        // A repaint has real detail: it may weigh more, still well under a street's art.
        // One restored from Tiny Speck's 2012 picture (method 'restored') keeps the original's full grain and weighs more again.
        const cap = /^restored/.test(REPAINTS.regions[id]?.method || '') ? 384 * 1024 : bg.repainted ? 256 * 1024 : 120 * 1024;
        assert.ok(buf.length < cap, `${rel} stays light (${buf.length} bytes)`);
      }
    }
    // Only regions: the test, tower and POL hubs that share a region's thumb keep the plain map.
    for (const id of Object.keys(HUB_MAP_BACKGROUNDS)) assert.ok(PUBLIC_HUBS.has(id), `${id} is a region`);
    for (const id of ['28', '77', '96', '70', '26']) assert.equal(HUB_MAP_BACKGROUNDS[id], undefined, id);
    for (const [id, name] of [['56', 'groddleforest'], ['58', 'groddlemeadow'], ['97', 'muufo'], ['101', 'aranna'], ['27', 'ix']]) {
      assert.match(HUB_MAP_BACKGROUNDS[id]?.x1 || '', new RegExp(`/${name}\\.webp$`), INDEX.hubs[id].hubName);
    }
  });

  it('provenance: each comes from its thumbnail in the CC0 world-map FLA, byte for byte', () => {
    const { thumbs, flaSha256 } = readThumbs();
    assert.equal(MANIFEST.source.fla, 'glitch-overlays/world_map.fla');
    assert.equal(MANIFEST.source.sha256, flaSha256);
    assert.match(MANIFEST.license, /CC0/);
    for (const [id, r] of Object.entries(MANIFEST.regions)) {
      // A region with no thumbnail has only its repaint (G569).
      if (r.thumb === null) {
        assert.equal(r.repainted, 'tools/provenance/repainted-maps.json', id);
        assert.equal(INDEX.hubs[id].thumbLocal, '', id);
        continue;
      }
      const t = thumbs.get(r.symbol.replace(/^.*\//, ''));
      assert.ok(t, `${id} ${r.symbol}`);
      assert.equal(r.sha256, t.sha256);
      assert.equal(r.thumbMatches, true, `${r.thumb} is the FLA's ${r.symbol}`);
      assert.equal(INDEX.hubs[id].thumbLocal, r.thumb);
      assert.match(r.sourceFile, /sm_[a-z]+\.jpg$/);
    }
  });

  it('a repainted region keeps its painting, at the right sizes, with its provenance (G522)', () => {
    assert.equal(REPAINTS.format, 'groddle-repainted-maps/1');
    const ids = Object.keys(REPAINTS.regions);
    assert.deepEqual(Object.keys(repaints()), ids);
    assert.ok(ids.includes('58'), 'Groddle Meadow is repainted');
    const regions = regionThumbs();
    const sha = (buf) => createHash('sha256').update(buf).digest('hex');
    const needs = POLICY.licences['ai-generated'].requires.filter((k) => !['sha256', 'intake'].includes(k));
    for (const id of ids) {
      const r = REPAINTS.regions[id];
      const name = `${id} ${r.hubName}`;
      // A region with a thumbnail, or one of the four the world map drew none for (G569).
      const noThumb = !INDEX.hubs[id].thumbLocal;
      assert.equal(noThumb ? INDEX.hubs[id].hubName : regions[id]?.hubName, r.hubName, `${name} is a region`);
      assert.equal(Boolean(HUB_MAP_BACKGROUNDS[id].noThumb), noThumb, name);
      // The game, the build manifest and the provenance name the same two files.
      assert.equal(HUB_MAP_BACKGROUNDS[id].repainted, true, name);
      assert.equal(MANIFEST.regions[id].repainted, 'tools/provenance/repainted-maps.json', name);
      for (const [d, size] of [['x1', [760, 460]], ['x2', [1520, 920]]]) {
        assert.equal(r[d].file, HUB_MAP_BACKGROUNDS[id][d], `${name} ${d}`);
        assert.deepEqual([r[d].w, r[d].h], size, `${name} ${d}`);
        const buf = readFileSync(join(root, 'public', r[d].file));
        assert.deepEqual(webpSize(buf), size, r[d].file);
        assert.equal(buf.length, r[d].bytes, r[d].file);
        assert.equal(sha(buf), r[d].sha256, `${r[d].file} is the file its provenance names`);
        assert.equal(MANIFEST.regions[id][`${d}Sha256`], r[d].sha256, `${r[d].file} in backgrounds.json`);
      }
      // CC0 1.0 with its provenance: who and what made it, the full prompt, the inputs, who chose it.
      assert.equal(r.licence, 'ai-generated', name);
      assert.ok(POLICY.licences[r.licence], name);
      for (const k of [...needs, 'model', 'made', 'prompt', 'inputs', 'chosen']) assert.ok(r[k], `${name}: ${k}`);
      assert.match(r.made, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(r.prompt.length > 500, `${name}: the full prompt`);
      assert.ok(r.chosen.by && /^\d{4}-\d{2}-\d{2}$/.test(r.chosen.on), `${name}: who chose it and when`);
      assert.ok(r.inputs.length >= 1 && r.inputs.length <= POLICY.inputs.max, name);
      for (const i of r.inputs) {
        assert.ok(i.file && i.what && i.source, `${name}: input ${i.n}`);
        assert.match(i.sha256, /^[0-9a-f]{64}$/, `${name}: input ${i.n}`);
      }
      // Its own thumbnail is the first input, byte for byte; with none, the street layout from its map data.
      if (noThumb) assert.match(`${r.inputs[0].what} ${r.inputs[0].source}`, new RegExp(`streets[\\s\\S]*hub-${id}\\.json`), `${name}: input 1 is its street layout`);
      // One restored from 2012 takes Tiny Speck's own 2012 Encyclopedia picture of it instead (regions-restore pack).
      else if (/^restored/.test(r.method || '')) {
        assert.match(r.inputs[0].source, /c1\.glitch\.bz\/img\/maps_encyclopedia\/[a-z_]+_\d+\.jpg/, `${name}: input 1 is its 2012 picture`);
        assert.ok(r.replaces?.x2?.sha256 && r.replaces.made, `${name}: names the painting it replaces`);
      } else assert.equal(r.inputs[0].sha256, MANIFEST.regions[id].sha256, `${name}: input 1 is its thumbnail`);
      // A restore is kept as delivered: its record says how it was cropped and aligned instead of a toning step.
      if (/^restored/.test(r.method || '')) assert.match(r.source.crop, /Lanczos to 1520 x 920/, `${name}: the crop`);
      else assert.match(r.source.toning, /^magick /, `${name}: the toning step`);
      // Player captures and footage are named as reference only, never as inputs.
      for (const i of r.inputs) assert.doesNotMatch(`${i.what} ${i.source}`, /wiki|footage|youtube|video|capture/i, `${name}: input ${i.n}`);
      for (const ref of r.references || []) assert.match(ref, /reference only/, name);
    }
    assert.match(read('public/assets/maps/SOURCE.txt'), /Repainted region maps \(G522/);
    // The map says so in its QA note, the restoration report and the encyclopedia in words.
    assert.equal(hubMapArtNote(buildHubMapView(hub(58), '', STREETS)), 'repainted painting');
    const blurb = CHECKLIST.find((c) => c.id === 'map').blurb;
    assert.match(blurb, /map paintings are lost, so each region’s map shows their small thumbnail of it, enlarged/);
    for (const id of ids) assert.ok(blurb.includes(`${REPAINTS.regions[id].hubName}’s`), `the report names ${REPAINTS.regions[id].hubName}`);
    assert.match(MAP_ART_NOTE.repainted, /repainted for the remake/);
    assert.match(MAP_ART_NOTE.thumbnail, /thumbnail of it, enlarged/);
    assert.match(MAP_ART_NOTE.layout, /no thumbnail of it; this one was painted for the remake from its streets/);
    assert.match(blurb, /Naraka’s, Ilmenskie Caverns’s, The Seams’s and Ilmenskie Deeps’s had no thumbnail, so they are painted for the remake from the streets alone/);
    for (const note of [blurb, ...Object.values(MAP_ART_NOTE)]) assert.doesNotMatch(note, /—|Glitch/, 'player words: no em-dash, no trademark');
  });

  it('the map draws it under the streets, labels, GO buttons and star', () => {
    const view = buildHubMapView(hub(97), 'GA5101HF7F429V5', STREETS);
    assert.equal(view.bgSoft, HUB_MAP_BACKGROUNDS['97'].x1, 'the 1x file in Node (no devicePixelRatio)');
    const svg = renderHubMapSvg(view);
    const at = svg.indexOf('class="map-bg map-bg-soft"');
    assert.ok(at > 0);
    // MAPSIZE (ticket 76): with the Retina file beside it, for a 1x screen once the Map draws larger.
    assert.match(svg, /<image class="map-bg map-bg-soft" href="assets\/maps\/art\/bg\/muufo\.webp" data-hi="assets\/maps\/art\/bg\/muufo@2x\.webp" x="0" y="0" width="760" height="460" preserveAspectRatio="none"\/>/);
    for (const cls of ['class="map-seg', 'class="map-label', 'class="map-hub-go"', 'class="map-icons"']) {
      assert.ok(svg.indexOf(cls) > at, `${cls} draws on top`);
    }
    assert.doesNotMatch(svg, /map-terrain|map-hill|map-thumb/, 'no drawn terrain or corner thumb under it');
    // The pale unvisited street style would fade into a painting (no wash is drawn): every street
    // of a painted region is playable. A new map-only street there needs a contrast pass first.
    for (const id of Object.keys(HUB_MAP_BACKGROUNDS)) {
      const dim = buildHubMapView(hub(id), '', STREETS).streets.filter((s) => !s.loaded && !s.hidden);
      assert.deepEqual(dim.map((s) => s.name), [], `${id} ${INDEX.hubs[id].hubName}`);
    }
    assert.equal(hubMapArtNote(view), 'repainted painting');
    // A region still on its blown-up thumbnail, while any is left (G522).
    const soft = Object.keys(HUB_MAP_BACKGROUNDS).map((id) => buildHubMapView(hub(id), '', STREETS)).find((v) => v.bgSoft && !v.bgRepainted);
    if (soft) assert.equal(hubMapArtNote(soft), 'thumbnail painting');
  });

  it('Retina screens get the 2x file', () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
    globalThis.devicePixelRatio = 2;
    try {
      const view = buildHubMapView(hub(101), '', STREETS);
      assert.equal(view.bgSoft, 'assets/maps/art/bg/aranna@2x.webp');
      assert.match(renderHubMapSvg(view), /href="assets\/maps\/art\/bg\/aranna@2x\.webp"/);
    } finally {
      if (had) Object.defineProperty(globalThis, 'devicePixelRatio', had);
      else delete globalThis.devicePixelRatio;
    }
  });

  it('the image URL gets its content key like the rest of the art', () => {
    const had = globalThis.groddleDataUrl;
    globalThis.groddleDataUrl = (u) => `${u}?v=abcd1234`;
    try {
      assert.match(renderHubMapSvg(buildHubMapView(hub(58), '', STREETS)), /href="assets\/maps\/art\/bg\/groddlemeadow\.webp\?v=abcd1234"/);
    } finally {
      if (had) globalThis.groddleDataUrl = had;
      else delete globalThis.groddleDataUrl;
    }
  });

  it('regions without one keep the drawn terrain', () => {
    for (const id of ['77']) {
      const view = buildHubMapView(hub(id), '', STREETS);
      assert.equal(view.bgSoft, '');
      const svg = renderHubMapSvg(view);
      assert.match(svg, /class="map-terrain"/);
      assert.doesNotMatch(svg, /map-bg/);
      assert.equal(hubMapArtNote(view), 'geometry only');
    }
    // A builder zone (its own hub id) and a hub with no data.
    const bare = renderHubMapSvg(buildHubMapView({ hubId: 'zone-x', hubName: 'Bare', streets: [] }, '', STREETS));
    assert.match(bare, /class="map-terrain"/);
    // A recovered full painting would win over the thumbnail.
    const painted = buildHubMapView({ ...hub(97), bgLocal: 'assets/maps/art/muufo_bg.jpg' }, '', STREETS);
    assert.equal(painted.bgSoft, '');
    assert.match(renderHubMapSvg(painted), /<image class="map-bg" href="assets\/maps\/art\/muufo_bg\.jpg"/);
  });

  it('G569: hubs whose source map was the lost placeholder draw its grey until we paint them', () => {
    assert.deepEqual({ ...PLACEHOLDER_MAP_COLOURS }, { top: '#8a9297', bottom: '#606669' });
    const ids = Object.keys(INDEX.hubs).filter((id) => isPlaceholderMap(hub(id).bg));
    assert.equal(ids.length, 40, 'the 40 hubs that shared map_fake_island_45490.jpg');
    for (const id of ids) {
      const data = hub(id);
      // The grey is the one the hub data records for that map.
      assert.equal(data.top_color, PLACEHOLDER_MAP_COLOURS.top, id);
      assert.equal(data.btm_color, PLACEHOLDER_MAP_COLOURS.bottom, id);
      const view = buildHubMapView(data, '', STREETS);
      const painted = Boolean(view.bgLocal || view.bgSoft);
      assert.equal(view.bgPlaceholder, !painted, `${id} ${data.hubName}`);
      if (painted) continue;
      const svg = renderHubMapSvg(view);
      assert.match(svg, /<rect class="map-terrain map-terrain-placeholder" [^>]*fill="url\(#hubPlaceholder\)"/, id);
      assert.match(svg, /<stop offset="0%" stop-color="#8a9297"\/><stop offset="100%" stop-color="#606669"\/>/, id);
      assert.doesNotMatch(svg, /map-hill|map-thumb|map-bg/, `${id}: no made-up hills or corner thumbnail`);
      assert.equal(hubMapArtNote(view), 'placeholder grey');
    }
    for (const name of ['Underground Puzzles', 'Abbasid', 'Old Groddle Forest', 'Party Locations', 'Homes', 'NewXP']) {
      assert.ok(ids.some((id) => hub(id).hubName === name), name);
    }
    // A painting of ours wins over the grey: a recovered one, or a region painting.
    const withArt = buildHubMapView({ ...hub(26), bgLocal: 'assets/maps/art/abbasid_bg.jpg' }, '', STREETS);
    assert.equal(withArt.bgPlaceholder, false);
    assert.doesNotMatch(renderHubMapSvg(withArt), /hubPlaceholder/);
    assert.equal(buildHubMapView(hub(97), '', STREETS).bgPlaceholder, false, 'a painted region');
    // A real map that was lost (Jethimadh Tower: Base) is not the placeholder.
    assert.equal(isPlaceholderMap(hub(77).bg), false);
    assert.equal(buildHubMapView(hub(77), '', STREETS).bgPlaceholder, false);
  });

  /**
   * G569 follow-up (Austin 2026-11-07: "Check the source first, then grey them if they used the
   * placeholder"). The unpainted hubs left after G569 each had a painting of their own in the
   * original, so none goes grey: they keep the drawn terrain until a painting turns up. What the
   * original did, per hub (GSJS inc_data_maps_prod.js maps_get_hubs_<id>; client HubMapDialog.as;
   * street flags from the archived G*.xml; the 2012 encyclopedia copies are in
   * research/wayback/raw/c1-img/maps_encyclopedia, reference only, never shipped).
   * Naraka (40), Ilmenskie Caverns (50), Ilmenskie Deeps (78) and The Seams (66) left this list on
   * 2026-11-13: repainted from their street layouts (tools/provenance/repainted-maps.json). The
   * Seams' encyclopedia copy and a 2012 wiki capture do survive (hunt 2026-11-04), reference only.
   */
  const OWN_LOST_MAPS = Object.freeze({
    // + an fg. No thumbnail, copy or footage (research/zone-art/map-jethimadh-tower-base/pack.md).
    77: { name: 'Jethimadh Tower: Base', file: 'map_bg_jethimadh_tower_base_45753.jpg' },
    // No copy or footage. The tutorial hid the map until the Mappery card (newbie_island.js 250, 298).
    129: { name: 'Gentle Island', file: 'gentle_island_bg_1343348721.jpg' },
    // An isometric patchwork of coloured tiles (encyclopedia moshi_moshi_oshilatis_123487.jpg), but all
    // seven streets set no_hubmap, so the map window never opened there ("The map is not available
    // in this location", HubMapDialog.as 468-471).
    142: { name: 'Moshi Moshi Oshilatis', file: 'moshi_moshi_oshilatis_bg_1352509438.jpg' },
  });

  it('G569: the four lost maps with no thumbnail are repainted from their streets', () => {
    for (const [id, name, key] of [['40', 'Naraka', 'naraka'], ['50', 'Ilmenskie Caverns', 'ilmenskiecaverns'], ['78', 'Ilmenskie Deeps', 'ilmenskiedeeps'], ['66', 'The Seams', 'theseams']]) {
      assert.equal(INDEX.hubs[id].thumbLocal, '', `${name} has no thumbnail`);
      assert.deepEqual({ ...HUB_MAP_BACKGROUNDS[id] }, { x1: `assets/maps/art/bg/${key}.webp`, x2: `assets/maps/art/bg/${key}@2x.webp`, repainted: true, noThumb: true }, name);
      assert.equal(REPAINTS.regions[id].hubName, name);
      assert.equal(MANIFEST.regions[id].thumb, null, name);
      const view = buildHubMapView(hub(id), '', STREETS);
      assert.equal(view.bgSoft, `assets/maps/art/bg/${key}.webp`, name);
      assert.equal(view.thumbLocal || '', '', `${name}: no thumb to stand in while it loads`);
      assert.equal(hubMapArtNote(view), 'repainted painting', name);
    }
  });

  it('Naraka\'s map is only for the dead (HubMapDialog.as 475-484)', () => {
    assert.equal(hubMapRefusal('40'), 'You can only see the map of Naraka when you\'re dead.');
    assert.equal(hubMapRefusal(40, { dead: false }), 'You can only see the map of Naraka when you\'re dead.');
    assert.equal(hubMapRefusal('40', { dead: true }), '');
    for (const id of ['56', '50', '66', '78', '', null]) assert.equal(hubMapRefusal(id), '', String(id));
    // game.js openMap asks before it shows a picked hub, and keeps the map on show.
    const game = read('public/game.js');
    const open = game.slice(game.indexOf('async function openMap('), game.indexOf('mapPanelStreetTsid = currentStreetTsid;', game.indexOf('async function openMap(')));
    assert.match(open, /hubMapRefusal\(targetHub, \{ dead: playerIsDead\(\) \}\)/);
    assert.ok(open.indexOf('hubMapRefusal(') < open.indexOf('mapPanelHubId = hubId ? targetHub'), 'refused before the picked hub is kept');
  });

  it('G569: the unpainted hubs with a lost map of their own stay drawn, not placeholder grey', () => {
    const gsjsPath = join(root, '../glitch-GameServerJS/inc_data_maps_prod.js');
    const gsjs = existsSync(gsjsPath) ? readFileSync(gsjsPath, 'utf8') : '';
    for (const [id, { name, file }] of Object.entries(OWN_LOST_MAPS)) {
      const data = hub(id);
      assert.equal(data.hubName, name, id);
      assert.ok(data.bg.endsWith(`/${file}`), `${name}: its own map ${file}, not ${data.bg}`);
      assert.equal(isPlaceholderMap(data.bg), false, name);
      assert.notEqual(data.top_color, PLACEHOLDER_MAP_COLOURS.top, `${name} records its own colours`);
      if (gsjs) {
        const block = gsjs.match(new RegExp(`function maps_get_hubs_${id}\\(\\)\\{[\\s\\S]*?\\n\\t\\}`))?.[0] || '';
        assert.ok(block.includes(file), `${name}: GSJS names ${file}`);
        assert.ok(!block.includes('map_fake_island'), `${name}: GSJS is not the placeholder`);
      }
      const view = buildHubMapView(data, '', STREETS);
      assert.equal(view.bgPlaceholder, false, name);
      if (view.bgLocal || view.bgSoft) continue; // a painting of ours, once one exists, wins
      const svg = renderHubMapSvg(view);
      assert.match(svg, /<rect class="map-terrain" [^>]*fill="url\(#hubTerrain\)"/, name);
      assert.doesNotMatch(svg, /hubPlaceholder/, name);
      assert.equal(hubMapArtNote(view), 'geometry only', name);
    }
  });
});
