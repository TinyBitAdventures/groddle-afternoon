/**
 * LEVEL BUILDER P3 (spec 6.3, 6.4, 11, section 14): new zones. The deco picker's search (ranking
 * and facets, js/builder/deco-search.js), street templates and hubs (js/builder/templates.js),
 * the hub map and population helpers (js/builder/editor-zone.js), zone edits on shipped streets
 * (js/builder/zone.js, the play-test's js/builder/draft-play.js) and the NAV rules for them
 * (js/builder/validate.js), with Mossy Hollow (tests/fixtures/builder/mossy-hollow.zone.json).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokensOf, searchDecos, facetCounts, passesFacets, sizeClass, drawnSize, hubPlacements, newArtRows, thumbUrl, decoFor, textScore, queryWords, NEW_ART_BUNDLE } from '../public/js/builder/deco-search.js?v=fda9b16b';
import { TEMPLATES, newStreet, newStreetOps, groundStrip, templateLayers, gradientFrom, hslHex, filtersFor, nextHubId, newHub, nextMapLine, mapWithStreet, mapWithoutStreet, profileOf, FLOOR_Y, MAP_W, MAP_H } from '../public/js/builder/templates.js?v=008481d2';
import { populationWith, plannedSpots, moveMapLine, mapForStreets, spotGroup } from '../public/js/builder/editor-zone.js?v=36e4d449';
import { intakeBody, base64Of } from '../public/js/builder/editor-picker.js?v=724352b6';
import { streetWithEdits, editsOn, linkEdit, streetStats } from '../public/js/builder/zone.js?v=6a3db28e';
import { applyZoneEdits } from '../public/js/builder/draft-play.js?v=65af71eb';
import { applyOps } from '../public/js/builder/ops.js?v=acf30407';
import { compileSchema } from '../public/js/builder/schema-check.js?v=cc9d1af4';
import { validateZone, placementRequests } from '../public/js/builder/validate.js?v=89d70464';
import { platformsScreen, worldToScreen, streetWidth } from '../public/js/street-model.js?v=23b926e5';
import { populationForStreet, planStreetPlacements } from '../public/js/street-ecology.js?v=7e30da8f';
import { arriveFor } from '../public/js/builder/geometry-handles.js?v=d39231a4';
import { applyStreetIndex, clearStreetIndex } from '../public/js/street-loader.js?v=390e4702';
import { loadValidatorContext } from '../tools/builder/validator-context.mjs';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const rows = json('public/assets/content/deco-catalog.json').decos;
const catalog = new Map(rows.map((r) => [r.name, r]));
const profiles = json('public/assets/content/style-profiles.json');
const schema = json('docs/level-builder/zone.schema.json');
const check = compileSchema(schema);
const base = json('tests/fixtures/builder/mossy-hollow.zone.json');
// Tiny Speck's world alone, so the fixtures validate the same whatever zones are published.
const ctx = loadValidatorContext({ publish: true, zones: false });
const names = (found) => found.map((r) => r.row.name);

describe('the deco picker\'s search (js/builder/deco-search.js, spec 6.4)', () => {
  it('splits names on _, digits and case', () => {
    assert.deepEqual(tokensOf('Brain_stem_large'), ['brain', 'stem', 'large']);
    assert.deepEqual(tokensOf('tree2Big'), ['tree', '2', 'big']);
    assert.deepEqual(tokensOf('corey3_bush_lightPuff2'), ['corey', '3', 'bush', 'light', 'puff', '2']);
    assert.deepEqual(queryWords(' Bush3 '), ['bush', '3']);
  });

  it('ranks the name typed exactly first, then hub placements, then placements overall', () => {
    assert.equal(names(searchDecos(rows, 'bush_3'))[0], 'bush_3');
    // Every "bush" deco matches as well as the others; the most placed comes first.
    const all = searchDecos(rows, 'bush', { limit: 5 });
    assert.equal(all[0].row.name, 'bush_3');
    for (let i = 1; i < all.length; i += 1) assert.ok(all[i - 1].row.placements >= all[i].row.placements || all[i - 1].score > all[i].score);
    // In Groddle Meadow (hub 58), the bushes placed there come ahead of bush_3 (never in its top 5 there).
    const meadow = searchDecos(rows, 'bush', { hub: '58', limit: 5 });
    assert.ok(meadow[0].hub > 0 && meadow[0].row.name !== 'bush_3', names(meadow).join());
    assert.ok(meadow.findIndex((r) => r.row.name === 'bush_3') > meadow.findIndex((r) => r.hub > 0));
    // No words: the hub's most placed decos first (Groddle Forest, hub 56).
    const forest = searchDecos(rows, '', { hub: '56', limit: 3 });
    assert.ok(forest[0].hub >= forest[1].hub && forest[1].hub >= forest[2].hub);
    assert.equal(hubPlacements(forest[0].row, '56'), forest[0].hub);
    // A word that matches nothing finds nothing; every word must match.
    assert.equal(searchDecos(rows, 'xyzzy').length, 0);
    assert.ok(searchDecos(rows, 'bush xyzzy').length === 0);
    assert.ok(textScore({ name: 'heights_topper_2', family: 'heights', bundle: 'groddle1' }, ['topper']) > textScore({ name: 'x_toppers', family: 'x', bundle: 'groddle1' }, ['topper']));
  });

  it('facets: layer role, art set, used in this hub, animated, size class, never placed', () => {
    const sky = searchDecos(rows, 'tree', { role: 'sky' });
    assert.ok(sky.length > 0 && sky.every((r) => r.row.layers.sky > 0));
    const g1 = searchDecos(rows, '', { bundle: 'groddle1' });
    assert.ok(g1.length > 400 && g1.every((r) => r.row.bundle === 'groddle1'));
    const inHub = searchDecos(rows, '', { hub: '58', inHub: true });
    assert.ok(inHub.length > 0 && inHub.every((r) => r.hub > 0));
    const anim = searchDecos(rows, '', { animated: true });
    assert.ok(anim.length > 0 && anim.every((r) => r.row.animated));
    const huge = searchDecos(rows, 'cave', { size: 'huge' });
    assert.ok(huge.length > 0 && huge.every((r) => Math.max(drawnSize(r.row).w, drawnSize(r.row).h) >= 700));
    const never = searchDecos(rows, '', { neverPlaced: true });
    assert.equal(never.length, rows.filter((r) => r.neverPlaced).length);
    assert.equal(passesFacets(rows[0], {}), true);
    assert.equal(sizeClass({ drawn: { w_med: 40, h_med: 90 } }), 'small');
    assert.equal(sizeClass({ size2: [800, 100] }), 'large');
  });

  it('counts what each facet would leave, the others applied', () => {
    const c = facetCounts(rows, 'bush', { hub: '58' });
    const bush = searchDecos(rows, 'bush');
    assert.equal(Object.values(c.size).reduce((a, b) => a + b, 0), bush.length);
    assert.equal(c.inHub, searchDecos(rows, 'bush', { hub: '58', inHub: true }).length);
    assert.equal(c.role.middleground, searchDecos(rows, 'bush', { role: 'middleground' }).length);
    assert.equal(c.bundle[0][0], 'groddle1');
    const narrowed = facetCounts(rows, 'bush', { hub: '58', role: 'sky' });
    assert.equal(narrowed.size.medium, searchDecos(rows, 'bush', { role: 'sky', size: 'medium' }).length);
  });

  it('lists the zone\'s new art (first when nothing is typed) and places a deco at its median size', () => {
    const assets = {
      gz_mossy_stone: { origin: 'new', licence: 'own-work-CC0', author: 'Austin', sha256: 'a'.repeat(64), w: 300, h: 180, intake: 'x' },
      gz_half: { origin: 'new', licence: 'own-work-CC0', author: 'Austin' },
      bush_3: { origin: 'tinyspeck-cc0', licence: 'CC0-1.0', source: 'groddle1.swf#bush_3' },
    };
    const art = newArtRows(assets);
    assert.deepEqual(art.map((r) => r.name), ['gz_mossy_stone'], 'only new art with a stored file');
    assert.equal(art[0].bundle, NEW_ART_BUNDLE);
    assert.deepEqual(drawnSize(art[0]), { w: 150, h: 90 });
    assert.equal(thumbUrl(art[0]), `/builder-art/${'a'.repeat(64)}`);
    assert.equal(thumbUrl({ name: 'bush_3' }), 'assets/decos/groddle/bush_3.webp');
    assert.equal(searchDecos([...rows, ...art], '')[0].row.name, 'gz_mossy_stone');
    assert.equal(searchDecos([...rows, ...art], 'mossy stone')[0].row.name, 'gz_mossy_stone');
    const bush = rows.find((r) => r.name === 'bush_3');
    assert.deepEqual(decoFor(bush, { id: 'd_4', x: 10.4, y: -60, z: 3 }), { id: 'd_4', sprite: 'bush_3', x: 10, y: -60, w: bush.drawn.w_med, h: bush.drawn.h_med, z: 3, r: 0 });
  });

  it('builds the intake body P5\'s route takes (spec 9.1)', () => {
    const own = intakeBody({ draft: 'mossy-hollow', name: ' gz_moss ', file2: 'AAA', licence: 'own-work-CC0', author: 'Austin', tool: '', prompt: 'ignored', inputs: 'deco:bush_3\n\n own:my sketch ', role: 'middleground' });
    assert.deepEqual(own, { draft: 'mossy-hollow', name: 'gz_moss', file2: 'AAA', licence: 'own-work-CC0', author: 'Austin', inputs: ['deco:bush_3', 'own:my sketch'], role: 'middleground' });
    const ai = intakeBody({ draft: 'd', name: 'gz_ai_moss', file2: 'A', file3: 'B', licence: 'ai-generated', author: 'Austin', tool: 'Model 2', prompt: 'moss', inputs: '' });
    assert.deepEqual(ai, { draft: 'd', name: 'gz_ai_moss', file2: 'A', licence: 'ai-generated', author: 'Austin', file3: 'B', tool: 'Model 2', prompt: 'moss' });
    assert.equal(base64Of(new Uint8Array([104, 105])), 'aGk=');
  });
});

describe('templates, hubs and the hub map (js/builder/templates.js, spec 6.3)', () => {
  const zoneWith = (...streets) => ({ format: 'groddle-zone/1', id: 'zz-t', title: 'T', rev: 1, hub: newHub({ id: '900', name: 'Test Hollow' }), streets, edits: [], assets: {} });

  for (const t of TEMPLATES) {
    it(`${t.name}: a street that fits the draft schema, with a floor line and a sky`, () => {
      const row = newStreet({ zoneId: 'zz-t', key: 'lane', label: 'Lane', template: t.id, hub: { id: '900', name: 'Test Hollow' }, profiles, tsid: 'GZ0000000000001', catalog });
      const zone = zoneWith();
      zone.streets = [];
      applyOps(zone, newStreetOps(zone, row, catalog));
      assert.deepEqual(check(zone), []);
      assert.equal(zone.hub.map.streets[0].tsid, 'GZ0000000000001');
      const ground = row.street.layers.find((l) => l.id === 'middleground').decos;
      assert.ok(ground.length >= 2 && ground.every((d) => d.sprite === t.ground && zone.assets[d.sprite].licence === 'CC0-1.0'));
      assert.ok(ground[0].x - ground[0].w / 2 <= row.street.bounds.l + 10 && ground.at(-1).x + ground.at(-1).w / 2 >= row.street.bounds.r - 10, 'the ground runs end to end');
      const s = row.street;
      assert.equal(s.platforms.length, 1);
      assert.equal(s.platforms[0].y1, FLOOR_Y);
      assert.equal(s.platforms[0].pc_perm, -1);
      assert.match(s.gradient.top, /^[0-9A-F]{6}$/);
      assert.equal(s.layers.filter((l) => l.id === 'middleground').length, 1);
      assert.deepEqual(s.layers.map((l) => l.id), [...t.roles]);
      assert.deepEqual(s.stats, streetStats(s));
      assert.equal(s.stats.decoCount, ground.length);
      // Q11: a zone street shows its street map (the world map is kept apart by the zone markers).
      assert.equal(s.noMap, undefined);
      assert.equal(s.bounds.r - s.bounds.l, 3000);
      assert.equal(s.bounds.b - s.bounds.t, t.height);
      // Back layers behind the middleground in order, front layers ahead of it.
      const zs = s.layers.map((l) => l.z);
      assert.deepEqual([...zs].sort((a, b) => a - b), zs);
      // No fatal finding or error while it is built (NAV-004, nothing leads in yet, is the publish gate's).
      const r = validateZone(zone, { ...ctx, publish: false });
      assert.deepEqual(r.findings.filter((f) => ['fatal', 'error'].includes(f.severity)).map((f) => f.message), []);
    });
  }

  it('takes its layers from the measured profiles: widths, z and filters', () => {
    const meadow = profileOf(profiles, 'hub-58');
    const layers = templateLayers(TEMPLATES[0], meadow, 3000, 1000);
    const sky = layers.find((l) => l.id === 'sky');
    assert.equal(sky.w, Math.round(3000 * meadow.roles.sky.w[1]));
    assert.equal(sky.h, 1000);
    assert.ok(sky.z < layers.find((l) => l.id === 'bg_1').z);
    const tall = templateLayers(TEMPLATES[1], profileOf(profiles, 'default'), 3000, 2400);
    assert.ok(tall.find((l) => l.id === 'sky').h < 2400, 'Tall: back layers shorter than the street (vertical parallax)');
    assert.deepEqual(groundStrip({ ground: 'cave_gr_texture_2' }, -500, 500).map((d) => d.x), [-343, -43, 257, 344]);
    assert.deepEqual(groundStrip({ ground: '' }, -500, 500), []);
    assert.deepEqual(filtersFor({ layers: 10, filters: { blur: { n: 6, band: [1, 3.4, 5] }, contrast: { n: 2, band: [0, -20, 0] } } }), { blur: 3 });
    const forest = newStreet({ zoneId: 'z', key: 'f', label: 'F', template: 'forest', hub: { id: '900', name: 'H' }, profiles, tsid: 'GZ0000000000002' }).street;
    assert.ok(forest.layers.some((l) => l.id === 'foreground' && l.w > 3000));
    const cave = gradientFrom(profileOf(profiles, 'hub-50'));
    const meadowSky = gradientFrom(profileOf(profiles, 'hub-58'));
    const light = (hex) => parseInt(hex.slice(0, 2), 16) + parseInt(hex.slice(2, 4), 16) + parseInt(hex.slice(4), 16);
    assert.ok(light(cave.top) < light(meadowSky.top), 'a cave\'s sky is darker than a meadow\'s');
    assert.equal(hslHex(0, 1, 0.5), 'FF0000');
    assert.equal(hslHex(120, 1, 0.25), '008000');
  });

  it('clamps sizes and gives hub ids from 900', () => {
    const s = newStreet({ zoneId: 'z', key: 'k', label: 'K', width: 99999, height: 10, hub: { id: '900', name: 'H' }, profiles, tsid: 'GZ0000000000003' }).street;
    assert.equal(s.bounds.r - s.bounds.l, 8000);
    assert.equal(s.bounds.b - s.bounds.t, 600);
    assert.equal(nextHubId([]), '900');
    assert.equal(nextHubId(['900', '901', 903]), '902');
    assert.equal(nextHubId(Array.from({ length: 100 }, (_, i) => 900 + i)), null);
    assert.deepEqual(newHub({ id: 905, name: 'Fern Gully' }), { id: '905', name: 'Fern Gully', isNew: true, map: { color: '#1d3a80', top_color: '#989cb6', btm_color: '#6a6d7f', streets: [] } });
  });

  it('draws each new street on the hub map, joined to the last, inside 760 by 460', () => {
    let map = newHub({ id: '900', name: 'H' }).map;
    for (let i = 1; i <= 7; i += 1) map = mapWithStreet(map, { tsid: `GZ000000000000${i}`, name: `S${i}` });
    assert.equal(map.streets.length, 7);
    for (let i = 1; i < 7; i += 1) assert.deepEqual([map.streets[i].x1, map.streets[i].y1], [map.streets[i - 1].x2, map.streets[i - 1].y2]);
    for (const l of map.streets) for (const [k, max] of [['x1', MAP_W], ['x2', MAP_W], ['y1', MAP_H], ['y2', MAP_H]]) assert.ok(l[k] >= 0 && l[k] <= max);
    assert.equal(mapWithStreet(map, { tsid: 'GZ0000000000001', name: 'Renamed' }).streets[0].name, 'Renamed');
    assert.equal(mapWithoutStreet(map, 'GZ0000000000001').streets.length, 6);
    assert.deepEqual(nextMapLine(null, { tsid: 'GZ0000000000009', name: 'A' }), { tsid: 'GZ0000000000009', name: 'A', x1: 200, y1: 230, x2: 360, y2: 230 });
    assert.deepEqual(moveMapLine({ x1: 10, y1: 10, x2: 750, y2: 20 }, 'line', 30, -20), { x1: 40, y1: 0, x2: 760, y2: 0 });
    assert.deepEqual(moveMapLine({ x1: 10, y1: 10, x2: 50, y2: 20 }, 'b', 5, 5), { x1: 10, y1: 10, x2: 55, y2: 25 });
    const synced = mapForStreets({ streets: [{ tsid: 'GZX', name: 'gone', x1: 0, y1: 0, x2: 1, y2: 1 }] }, [{ tsid: 'GZ0000000000001', name: 'Lane' }]);
    assert.deepEqual(synced.streets.map((s) => s.tsid), ['GZ0000000000001']);
  });

  it('a new street and its map line go in as ops, and undo as one', () => {
    const zone = zoneWith();
    zone.streets = [];
    const start = JSON.stringify(zone);
    const row = newStreet({ zoneId: 'zz-t', key: 'lane', label: 'Lane', hub: zone.hub, profiles, tsid: 'GZ0000000000001' });
    const ops = newStreetOps(zone, row);
    assert.deepEqual(ops.map((o) => o.op), ['asset.set', 'street.add', 'hubmap.set']);
    assert.deepEqual(ops[0].asset, { origin: 'tinyspeck-cc0', licence: 'CC0-1.0', source: 'groddle1.swf#evenground_platform_long' }, 'the same row the catalog gives');
    assert.deepEqual(newStreetOps(zone, row, catalog)[0], ops[0]);
    const { inverses } = applyOps(zone, ops);
    assert.equal(zone.hub.map.streets.length, 1);
    applyOps(zone, inverses);
    assert.equal(JSON.stringify(zone), start);
  });
});

describe('populations (js/builder/editor-zone.js, spec 6.7)', () => {
  it('sets one class at a time, in the classes\' order, and drops a zero', () => {
    let pop = populationWith(null, 'npc_piggy', 2);
    pop = populationWith(pop, 'trant_fruit', 1);
    assert.deepEqual(Object.keys(pop.counts), ['trant_fruit', 'npc_piggy']);
    assert.deepEqual(populationWith({ counts: { npc_piggy: 2 }, quoins: 6 }, 'npc_piggy', 0), { counts: {}, quoins: 6 });
    assert.equal(populationWith(null, 'npc_chicken', 40).counts.npc_chicken, 12);
  });

  it('shows the spots the planner gives, as game.js plans them', () => {
    const row = base.streets[0];
    const spots = plannedSpots({ street: row.street, population: row.population, platformsScreen, worldToScreen, populationForStreet, planStreetPlacements, placementRequests, worldW: streetWidth(row.street) });
    const keys = spots.map((s) => s.key);
    assert.equal(keys.filter((k) => k === 'piggies').length, 2);
    assert.equal(keys.filter((k) => k === 'quoins').length, 6);
    assert.equal(keys.filter((k) => k === 'trees').length, 1);
    assert.ok(spots.every((s) => s.y > 900), 'on the floor');
    assert.equal(spotGroup('piggies').id, 'animals');
    assert.equal(spotGroup('flyingButterflies').id, 'animals');
    assert.equal(spotGroup('vendor').id, 'other');
  });
});

describe('ways in from shipped streets (edits[], spec 4 and 11)', () => {
  const hechey = ctx.streetFor('GLI2V0UN7RD1T2J');

  it('puts the zone\'s arms on a copy of the shipped street, never the street itself', () => {
    const before = JSON.stringify(hechey);
    const copy = streetWithEdits(hechey, base.edits);
    assert.equal(JSON.stringify(hechey), before);
    const post = copy.signposts.find((p) => p.id === 'signpost_3');
    assert.equal(post.connects.at(-1).tsid, 'GZ0000000000001');
    assert.equal(post.connects.length, hechey.signposts.find((p) => p.id === 'signpost_3').connects.length + 1);
    // The L form names the same street; edits on other streets, and missing signposts, are left out.
    assert.equal(editsOn([{ ...base.edits[0], tsid: 'LLI2V0UN7RD1T2J' }], 'GLI2V0UN7RD1T2J').length, 1);
    assert.equal(editsOn(base.edits, 'GA5101HF7F429V5').length, 0);
    assert.equal(JSON.stringify(streetWithEdits(hechey, [{ ...base.edits[0], signpost: 'signpost_99' }]).signposts), JSON.stringify(hechey.signposts));
    const added = streetWithEdits(hechey, [{ tsid: 'GLI2V0UN7RD1T2J', op: 'add-signpost', newSignpost: { id: 'signpost_9', x: 0, y: -60, w: 100, h: 200, connects: [{ tsid: 'GZ0000000000001', label: 'Mossy Lane' }] } }]);
    assert.equal(added.signposts.at(-1).id, 'signpost_9');
  });

  it('a link from the shipped side lands where the zone street\'s way back stands', () => {
    const lane = base.streets[0].street;
    const arrive = arriveFor(lane, 'GLI2V0UN7RD1T2J');
    assert.deepEqual(arrive, base.edits[0].connect.arrive);
    assert.deepEqual(linkEdit({ shippedTsid: 'GLI2V0UN7RD1T2J', signpost: 'signpost_3', target: { tsid: lane.tsid, label: lane.label, hubId: '900' }, arrive }), base.edits[0]);
    assert.deepEqual(linkEdit({ shippedTsid: 'GLI2V0UN7RD1T2J', signpost: 'signpost_1', target: { tsid: lane.tsid, label: lane.label, hubId: 'x' } }), { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', signpost: 'signpost_1', connect: { tsid: lane.tsid, label: 'Mossy Lane' } });
  });

  it('the play-test registers an edited copy of each street the edits name', async () => {
    applyStreetIndex({ default: 'GLI2V0UN7RD1T2J', streets: { GLI2V0UN7RD1T2J: { label: 'Hechey Track', hubId: '58', file: 'assets/streets/GLI2V0UN7RD1T2J.json' }, A: {}, B: {} } });
    try {
      const registered = {};
      const rowsSeen = {};
      const done = await applyZoneEdits([{ ...base.edits[0], tsid: 'LLI2V0UN7RD1T2J' }], {
        load: async (tsid) => structuredClone(hechey),
        register: (rowsByTsid, streets) => { Object.assign(registered, streets); Object.assign(rowsSeen, rowsByTsid); return Object.keys(streets); },
      });
      assert.deepEqual(done, ['GLI2V0UN7RD1T2J']);
      assert.equal(rowsSeen.GLI2V0UN7RD1T2J.label, 'Hechey Track');
      assert.equal(registered.GLI2V0UN7RD1T2J.signposts.find((p) => p.id === 'signpost_3').connects.at(-1).label, 'Mossy Lane');
      // A street that will not load stays as shipped; no edits, nothing to do.
      assert.deepEqual(await applyZoneEdits(base.edits, { load: async () => { throw new Error('offline'); }, register: () => ['x'] }), []);
      assert.deepEqual(await applyZoneEdits(null), []);
    } finally {
      clearStreetIndex();
    }
  });

  it('the site\'s play bundle carries the edits (groddle-afternoon-site src/AdminBuilder.php)', { skip: skipWithoutSite }, () => {
    assert.match(readFileSync(join(SITE_DIR, 'src/AdminBuilder.php'), 'utf8'), /'edits' => is_array\(\$zone->edits \?\? null\) \? \$zone->edits : \[\]/);
  });
});

describe('NAV rules for zone edits (js/builder/validate.js, spec 7.3)', () => {
  const fire = (rule, change) => {
    const zone = structuredClone(base);
    change(zone);
    return validateZone(zone, ctx).findings.filter((f) => f.rule === rule);
  };
  const lane = (z) => z.streets[0].street;

  it('Mossy Hollow, linked from Hechey Track and back, is clean', () => {
    assert.deepEqual(validateZone(structuredClone(base), ctx).findings.filter((f) => f.severity !== 'info').map((f) => f.message), []);
  });

  const cases = [
    ['NAV-001', 'an edit on a street that is not shipped', (z) => { z.edits[0].tsid = 'LZZZZZZZZZZZZZZ'; }, /not a shipped street/],
    ['NAV-001', 'an edit on a signpost the shipped street lacks', (z) => { z.edits[0].signpost = 'signpost_99'; }, /has no such signpost/],
    ['NAV-001', 'an edit leading to a street not in the zone', (z) => { z.edits[0].connect.tsid = 'GZ0000000000099'; }, /not one of this zone's streets/],
    ['NAV-002', 'an edit with no arrival', (z) => { delete z.edits[0].connect.arrive; }, /has no arrival point/],
    ['NAV-002', 'an edit arriving off the floor', (z) => { z.edits[0].connect.arrive = { x: 150, y: 600 }; }, /off its floor/],
    ['NAV-003', 'a way in with no way back', (z) => { lane(z).signposts.pop(); }, /Hechey Track leads to Mossy Lane, but no signpost there leads back/],
    ['NAV-003', 'a road out to a shipped street with no way back in', (z) => { z.edits = []; }, /Mossy Lane leads to Hechey Track, but nothing there leads back/],
    ['NAV-005', 'an edit\'s arm named differently', (z) => { z.edits[0].connect.label = 'The Lane'; }, /reads "The Lane"; the street is called "Mossy Lane"/],
    ['TXT-001', 'an edit\'s arm with a word not allowed', (z) => { z.edits[0].connect.label = 'Glitch Lane'; }, /uses glitch/],
  ];
  for (const [rule, what, change, words] of cases) {
    it(`${rule}: ${what}`, () => {
      const found = fire(rule, change);
      assert.ok(found.some((f) => words.test(f.message)), found.map((f) => f.message).join(' | ') || 'nothing fired');
    });
  }

  it('a hidden arm in, an L-form tsid and a new signpost on the shipped street all pass', () => {
    assert.deepEqual(fire('NAV-002', (z) => { z.edits[0].connect.hidden = true; delete z.edits[0].connect.arrive; }), []);
    assert.deepEqual(fire('NAV-001', (z) => { z.edits[0].tsid = 'LLI2V0UN7RD1T2J'; }), []);
    assert.deepEqual(fire('NAV-003', (z) => { z.edits[0].tsid = 'LLI2V0UN7RD1T2J'; }), []);
    const added = (z) => { z.edits = [{ tsid: 'GLI2V0UN7RD1T2J', op: 'add-signpost', newSignpost: { id: 'signpost_9', x: -2600, y: -47, w: 100, h: 200, connects: [z.edits[0].connect] } }]; };
    for (const rule of ['NAV-001', 'NAV-002', 'NAV-003', 'NAV-004']) assert.deepEqual(fire(rule, added).map((f) => f.message), [], rule);
  });

  it('every edit finding names the edit, and has a fingerprint', () => {
    const [f] = fire('NAV-002', (z) => { delete z.edits[0].connect.arrive; });
    assert.equal(f.at, 'edit/0');
    assert.equal(f.street, null);
    assert.match(f.fingerprint, /^[0-9a-f]{16}$/);
  });
});

describe('Mossy Hollow as the editor built it (spec 14 P3 acceptance, 2026-10-31)', () => {
  // tests/fixtures/builder/mossy-hollow-editor.zone.json: the draft the P3 acceptance run made
  // through the editor's UI on groddle.localhost (New draft, two New streets, the picker, signposts
  // and arms, a way in from Hechey Track, populations, the hub map), as the site stored it.
  const built = json('tests/fixtures/builder/mossy-hollow-editor.zone.json');

  it('fits the schema and validates clean for publishing', () => {
    assert.deepEqual(check(built), []);
    const r = validateZone(structuredClone(built), ctx);
    assert.deepEqual(r.findings.filter((f) => f.severity !== 'info').map((f) => f.message), []);
  });

  it('has its two streets on a new hub\'s map, a way in from Hechey Track and populations', () => {
    assert.deepEqual(built.streets.map((r) => r.street.label), ['Mossy Lane', 'Hollow End']);
    assert.ok(Number(built.hub.id) >= 900 && built.hub.isNew);
    assert.deepEqual(built.hub.map.streets.map((s) => s.tsid), built.streets.map((r) => r.street.tsid));
    assert.equal(built.edits.length, 1);
    assert.equal(built.edits[0].tsid, 'GLI2V0UN7RD1T2J');
    assert.ok(built.streets.every((r) => r.population && Object.keys(r.population.counts).length));
    assert.ok(built.streets.every((r) => r.street.tsid.startsWith('GZ') && r.street.noMap === true));
  });
});
