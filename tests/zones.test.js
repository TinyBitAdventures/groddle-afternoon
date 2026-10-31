/**
 * LEVEL BUILDER P6 (docs/level-builder/spec.md 11, 14): published zones.
 *
 * - The checkout's own published zones (public/assets/zones/*.json; none until Austin ships one):
 *   each passes the schema and the validator with the publish rules and no error; everything
 *   derived from them is current (build-zones, apply-zone-edits and build-zone-maps --check); every
 *   gz_ file has its provenance row; no label says "glitch" or carries an em dash; zones stay off
 *   the world's hub list and out of the Completist badges, and never reach the realtime server.
 * - Publishing, into a temporary copy of the files it touches: the Mossy Hollow fixture (with a
 *   little new art) gives the zone file, its streets, index and ecology rows, the hub map, the way
 *   in on Hechey Track with its arrival, and the new art's provenance; a second run changes nothing;
 *   the navigation rebuild's dropped `arrive` comes back; taking the zone out leaves the files as
 *   they were. The gate refuses errors, unacknowledged warnings, art whose bytes are not the ones
 *   its provenance names, and another zone's streets.
 * - The game: a multiplayer page drops zone streets and every arm into one.
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { GAME_DIR } from '../tools/repos.mjs';
import { buildZones, files, listZones, mergeZoneIndex, mergeZoneEcology, streetWithZoneEdits, zoneStreets, sha256, overlay, NEW_ART } from '../tools/builder/zones.mjs';
import { publishZone, unacknowledged } from '../tools/builder/publish.mjs';
import { loadValidatorContext } from '../tools/builder/validator-context.mjs';
import { validateZone } from '../public/js/builder/validate.js?v=89d70464';
import { isZoneTsid, withoutZoneConnects, withoutZoneRows } from '../public/js/zone-streets.js?v=b40010d5';
import { listHubsFromIndex } from '../public/js/map-graph.js?v=419ce342';
import { HUB_MAP_STREETS } from '../public/js/hub-maps-data.js?v=ffe222f1';
import { applyStreetIndex, clearStreetIndex, clearStreetCache, loadStreetDataFromFs, setZoneStreetsShown, STREET_INDEX } from '../public/js/street-loader.js?v=390e4702';
import { run } from '../tools/builder/cli.mjs';

const HECHEY = 'GLI2V0UN7RD1T2J';
const read = (p) => readFileSync(join(GAME_DIR, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const node = (...args) => execFileSync(process.execPath, args, { cwd: GAME_DIR, encoding: 'utf8', stdio: 'pipe' });
const fixture = () => json('tests/fixtures/builder/mossy-hollow-editor.zone.json');
const ART = join(GAME_DIR, 'tests/fixtures/builder');
const ctx = loadValidatorContext({ publish: true });

/** The fixture with a little new art on Hollow End (own work, its sha256 the fixture file's). */
function withArt(zone = fixture()) {
  const bytes = readFileSync(join(ART, 'gz_moss_mound.webp'));
  zone.assets.gz_moss_mound = {
    origin: 'new', licence: 'own-work-CC0', source: 'Austin Ginder', author: 'Austin Ginder', sha256: sha256(bytes),
    w: 48, h: 32, registration: { x: 24, y: 32 }, inputs: ['own:a test mound drawn by code'], intake: 'in-0123456789abcdef',
  };
  const end = zone.streets.find((s) => s.key === 'end').street;
  end.layers.find((l) => l.id === 'middleground').decos.push({ id: 'd_900', sprite: 'gz_moss_mound', x: 200, y: -60, w: 24, h: 16, z: 40, r: 0 });
  return zone;
}

/** A temporary checkout holding only the files publishing reads and writes, with no zone in it. */
function tempCheckout() {
  const root = mkdtempSync(join(tmpdir(), 'zones-'));
  for (const p of ['public/assets/streets/index.json', 'public/assets/content/street-ecology.json', 'public/assets/maps/index.json', `public/assets/streets/${HECHEY}.json`, 'public/js/deco-new-list.js']) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    copyFileSync(join(GAME_DIR, p), join(root, p));
  }
  // Whatever this checkout has published, the copy starts with none.
  buildZones(files(root));
  return root;
}

const snapshot = (root) => {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${name.name}`;
      if (name.isDirectory()) walk(p);
      else out[p] = readFileSync(join(root, p), 'utf8');
    }
  };
  walk('public');
  if (existsSync(join(root, 'tools'))) walk('tools');
  return out;
};

describe('the published zones in this checkout (public/assets/zones)', () => {
  const zones = listZones(files(GAME_DIR)).map((z) => z.zone);

  it('everything derived from them is current (build-zones, apply-zone-edits, build-zone-maps --check)', () => {
    for (const tool of ['build-zones.mjs', 'apply-zone-edits.mjs', 'build-zone-maps.mjs']) assert.match(node(`tools/builder/${tool}`, '--check'), /current/);
  });

  it('each passes the schema and the validator (publish rules) with no fatal finding or error', () => {
    for (const zone of zones) {
      const r = validateZone(zone, ctx);
      assert.deepEqual(r.findings.filter((x) => !x.waived && ['fatal', 'error'].includes(x.severity)).map((x) => `${x.rule} ${x.message}`), [], zone.id);
      assert.ok(!zone.streets.some((s) => s.editor), `${zone.id}: no editor state is published`);
    }
  });

  it('labels: no "glitch", no em dash; their rows say which zone', () => {
    const index = json('public/assets/streets/index.json').streets;
    for (const zone of zones) {
      const words = [zone.title, zone.hub?.name, ...zone.streets.flatMap((s) => [s.street.label, ...(s.street.signposts || []).flatMap((p) => (p.connects || []).map((c) => c.label))]), ...(zone.edits || []).map((e) => e.connect?.label)];
      for (const w of words.filter(Boolean)) assert.ok(!/glitch|—/i.test(w), `${zone.id}: "${w}"`);
      for (const s of zone.streets) {
        assert.equal(index[s.street.tsid]?.zone, zone.id, s.street.tsid);
      }
    }
  });

  it('every gz_ file ships with its provenance row, and every row with its file', () => {
    const gz = readdirSync(join(GAME_DIR, 'public/assets/decos/groddle')).filter((f) => f.startsWith('gz_'));
    const art = existsSync(join(GAME_DIR, NEW_ART)) ? json(NEW_ART).art : {};
    for (const f of gz) {
      const name = f.replace(/(@1\.5x)?\.webp$/, '');
      assert.ok(art[name], `${f} has no row in ${NEW_ART}`);
      assert.equal(sha256(readFileSync(join(GAME_DIR, 'public/assets/decos/groddle', f))), f.includes('@1.5x') ? art[name].sha256_3 : art[name].sha256, f);
    }
    for (const [name, row] of Object.entries(art)) assert.ok(existsSync(join(GAME_DIR, row.file)), name);
    assert.ok(!json('public/assets/decos/manifest.json').some((n) => n.startsWith('gz_')), 'new art stays out of the library manifest');
  });

  it('zones stay off the world map: not in hub-maps-data.js (Completist), hub rows marked and left off the hub list', () => {
    for (const streets of Object.values(HUB_MAP_STREETS)) assert.ok(!streets.some(isZoneTsid));
    const maps = json('public/assets/maps/index.json');
    for (const zone of zones.filter((z) => z.hub?.isNew)) {
      assert.ok(!HUB_MAP_STREETS[zone.hub.id], `hub ${zone.hub.id} is not a Completist hub`);
      assert.equal(maps.hubs[zone.hub.id]?.zone, zone.id);
      assert.ok(!listHubsFromIndex(maps).some((h) => h.hubId === zone.hub.id));
      assert.ok(listHubsFromIndex(maps, { keep: zone.hub.id }).some((h) => h.hubId === zone.hub.id), 'its own map still opens');
    }
  });

  it('zone streets never reach the realtime server: the builders skip them and load streets as a multiplayer page', () => {
    for (const f of ['tools/build-realtime-objects.mjs', 'tools/build-realtime-quoins.mjs', 'tools/build-realtime-rook.mjs']) {
      const src = read(f);
      assert.match(src, /Object\.keys\(index\.streets\)\.filter\(\(t\) => !isZoneTsid\(t\)\)/, f);
      assert.match(src, /setZoneStreetsShown\(false\);/, f);
    }
  });

  it('Tiny Speck\'s generators keep the zones: names merges the index rows, ecology the populations, navigation puts the ways in back', () => {
    assert.match(read('build-street-names.mjs'), /mergeZoneIndex\(index, listZones\(files\(root\)\)/);
    assert.match(read('build-street-ecology.mjs'), /mergeZoneEcology\(catalog, listZones\(files\(root\)\)/);
    assert.match(read('build-street-navigation.mjs'), /applyZoneEdits\(zoneFiles, listZones\(zoneFiles\)/);
    // They load (a name clash with the merge's imports would only show when one runs).
    for (const f of ['build-street-names.mjs', 'build-street-ecology.mjs', 'build-street-navigation.mjs', 'build-hub-maps.mjs']) node('--check', f);
    // The measured files (the deco catalog, style profiles, calibration) are Tiny Speck's streets only.
    for (const f of ['tools/builder/deco-catalog.mjs', 'tools/builder/style-profile.mjs', 'tools/builder/validator-context.mjs']) assert.match(read(f), /!isZoneTsid\(f\.slice\(0, -5\)\)/, f);
  });
});

describe('publishing (tools/builder/publish.mjs), into a temporary copy', () => {
  let root;
  let before0;
  let r;
  before(() => {
    root = tempCheckout();
    before0 = snapshot(root);
    r = publishZone(withArt(), { root, art: ART, ctx, write: true, dirtyOk: true });
  });

  it('passes the gate and writes the zone, its streets, rows, hub map, way in and new art', () => {
    assert.deepEqual(r.refused, []);
    assert.ok(r.wrote);
    const z = fixture();
    const [lane, end] = z.streets.map((s) => s.street);
    assert.deepEqual(r.changed, [
      'public/assets/content/street-ecology.json',
      'public/assets/decos/groddle/gz_moss_mound.webp',
      'public/assets/decos/groddle/gz_moss_mound@1.5x.webp',
      'public/assets/maps/hubs/hub-904.json',
      'public/assets/maps/index.json',
      `public/assets/streets/${HECHEY}.json`,
      `public/assets/streets/${end.tsid}.json`,
      `public/assets/streets/${lane.tsid}.json`,
      'public/assets/streets/index.json',
      `public/assets/zones/${z.id}.json`,
      'public/js/deco-new-list.js',
      'tools/provenance/new-art.json',
    ].sort());
    const out = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
    const published = out(`public/assets/zones/${z.id}.json`);
    assert.equal(published.id, z.id);
    assert.ok(published.streets.every((s) => !s.editor));
    const laneFile = out(`public/assets/streets/${lane.tsid}.json`);
    assert.equal(laneFile.label, 'Mossy Lane');
    assert.equal(laneFile.stats.decoCount, laneFile.layers.reduce((n, l) => n + l.decos.length, 0));
    const index = out('public/assets/streets/index.json').streets;
    assert.deepEqual(index[lane.tsid], { label: 'Mossy Lane', file: `assets/streets/${lane.tsid}.json`, hubId: '904', hubName: 'Mossy Hollow', platforms: lane.platforms.length, decos: laneFile.stats.decoCount, zone: z.id });
    const eco = out('public/assets/content/street-ecology.json');
    assert.deepEqual(eco.streets[lane.tsid], { label: 'Mossy Lane', counts: { trant_fruit: 1, npc_piggy: 2 }, quoins: 6 });
    assert.equal(eco.zoneStreetCount, 2);
    const hub = out('public/assets/maps/hubs/hub-904.json');
    assert.deepEqual(hub.streets.map((s) => s.tsid), [lane.tsid, end.tsid]);
    assert.equal(out('public/assets/maps/index.json').hubs['904'].zone, z.id);
    const arm = out(`public/assets/streets/${HECHEY}.json`).signposts.find((p) => p.id === 'signpost_3').connects.at(-1);
    assert.deepEqual(arm, { tsid: lane.tsid, label: 'Mossy Lane', hub_id: '904', arrive: { x: 150, y: 940 } });
    const art = out('tools/provenance/new-art.json').art.gz_moss_mound;
    assert.equal(art.licence, 'own-work-CC0');
    assert.equal(art.author, 'Austin Ginder');
    assert.deepEqual(art.zones, [z.id]);
    assert.ok(art.file3);
    const list = readFileSync(join(root, 'public/js/deco-new-list.js'), 'utf8');
    assert.match(list, /export const NEW_DECOS = new Set\(\["gz_moss_mound"\]\);/);
    assert.match(list, /export const NEW_DECOS_HIRES = new Set\(\["gz_moss_mound"\]\);/);
  });

  it('a second run changes nothing (build-zones is idempotent), nor do the generators\' merges', () => {
    const ov = overlay(files(root));
    buildZones(ov);
    const changed = [...ov.changes].filter(([p, v]) => !(v && readFileSync(join(root, p)).equals(v)));
    assert.deepEqual(changed.map(([p]) => p), []);
    const zones = listZones(files(root)).map((z) => z.zone);
    const index = readFileSync(join(root, 'public/assets/streets/index.json'), 'utf8');
    assert.equal(`${JSON.stringify(mergeZoneIndex(JSON.parse(index), zones), null, 2)}\n`, index);
    const eco = readFileSync(join(root, 'public/assets/content/street-ecology.json'), 'utf8');
    assert.equal(`${JSON.stringify(mergeZoneEcology(JSON.parse(eco), zones), null, 2)}\n`, eco);
  });

  it('the navigation rebuild drops the arm\'s arrive (no source for it); the zone\'s edits put it back', () => {
    const zones = listZones(files(root)).map((z) => z.zone);
    const shipped = JSON.parse(readFileSync(join(root, `public/assets/streets/${HECHEY}.json`), 'utf8'));
    const rebuilt = structuredClone(shipped);
    for (const p of rebuilt.signposts) for (const c of p.connects) if (isZoneTsid(c.tsid)) delete c.arrive;
    assert.deepEqual(streetWithZoneEdits(rebuilt, zones[0].edits, zoneStreets(zones)), shipped);
    // And Tiny Speck's own arms are untouched: the street with the zone's arms taken off is the original.
    const original = JSON.parse(before0[`public/assets/streets/${HECHEY}.json`]);
    assert.deepEqual({ ...shipped, signposts: withoutZoneConnects(shipped.signposts) }, original);
  });

  it('taking the zone out (deleting its file) leaves every file as it was', () => {
    const copy = mkdtempSync(join(tmpdir(), 'zones-out-'));
    for (const [p, text] of Object.entries(snapshot(root))) {
      mkdirSync(dirname(join(copy, p)), { recursive: true });
      copyFileSync(join(root, p), join(copy, p));
      void text;
    }
    files(copy).remove(`public/assets/zones/${fixture().id}.json`);
    buildZones(files(copy));
    const after = snapshot(copy);
    for (const p of Object.keys(after)) if (!(p in before0)) assert.ok(p === 'tools/provenance/new-art.json', `${p} is left over`);
    for (const [p, text] of Object.entries(before0)) assert.equal(after[p], text, p);
  });

  it('a dry run lists the same files and writes nothing', () => {
    const fresh = tempCheckout();
    const was = snapshot(fresh);
    const dry = publishZone(withArt(), { root: fresh, art: ART, ctx, write: false, dirtyOk: true });
    assert.ok(dry.ok);
    assert.deepEqual(dry.changed, r.changed);
    assert.deepEqual(snapshot(fresh), was);
  });
});

describe('the publish gate', () => {
  const refusedFor = (zone, opts = {}) => {
    const root = tempCheckout();
    const was = snapshot(root);
    const out = publishZone(zone, { root, art: ART, ctx, write: true, dirtyOk: true, ...opts });
    assert.equal(out.ok, false);
    assert.deepEqual(snapshot(root), was, 'nothing written');
    return out.refused.join('\n');
  };

  it('refuses an error finding (a label that says glitch: TXT-001)', () => {
    const z = fixture();
    z.streets[0].street.label = 'Glitchy Lane';
    assert.match(refusedFor(z), /TXT-001 error/);
  });

  it('refuses a warning until it is acknowledged or waived', () => {
    const z = fixture();
    // Hollow End's arm back to Mossy Lane hidden: a one-way road (NAV-003, a warning).
    const end = z.streets.find((s) => s.key === 'end').street;
    end.signposts[0].connects[0].hidden = true;
    const report = validateZone(z, ctx);
    const warns = unacknowledged(report.findings);
    assert.ok(warns.some((x) => x.rule === 'NAV-003'), JSON.stringify(warns.map((x) => x.rule)));
    assert.match(refusedFor(z), /NAV-003 warning not acknowledged/);
    const root = tempCheckout();
    assert.ok(publishZone(z, { root, ctx, write: false, dirtyOk: true, ack: ['NAV-003', ...warns.filter((x) => x.rule !== 'NAV-003').map((x) => x.fingerprint)] }).ok);
    assert.ok(publishZone(z, { root, ctx, write: false, dirtyOk: true, ack: ['all'] }).ok);
  });

  it('refuses new art that is missing, or whose bytes are not the ones its provenance names (AST-003)', () => {
    assert.match(refusedFor(withArt(), { art: null }), /gz_moss_mound: no file/);
    const z = withArt();
    z.assets.gz_moss_mound.sha256 = 'f'.repeat(64);
    assert.match(refusedFor(z), /AST-003/);
  });

  it('refuses a zone that would take another published zone\'s street', () => {
    const root = tempCheckout();
    assert.ok(publishZone(fixture(), { root, ctx, write: true, dirtyOk: true }).ok);
    const other = fixture();
    other.id = 'mossy-copy';
    other.hub = { ...other.hub, id: '905' };
    const out = publishZone(other, { root, ctx, write: false, dirtyOk: true });
    assert.equal(out.ok, false);
    assert.match(out.refused.join('\n'), /is in two zones/);
  });

  it('cli.mjs publish file:<zone> --dry-run lists the files and writes nothing; it needs --dry-run or --write', async () => {
    const was = read('public/assets/streets/index.json');
    const dry = await run(['publish', `file:${join(ART, 'mossy-hollow-editor.zone.json')}`, '--dry-run', '--dirty', '--json'], { env: { GRODDLE_BUILDER_HOME: mkdtempSync(join(tmpdir(), 'zones-home-')) } });
    assert.equal(dry.exit, 0);
    assert.ok(dry.out.changed.includes(`public/assets/zones/${fixture().id}.json`) || dry.out.notes.some((n) => /already published/.test(n)));
    assert.equal(read('public/assets/streets/index.json'), was);
    await assert.rejects(run(['publish', `file:${join(ART, 'mossy-hollow-editor.zone.json')}`], { env: {} }), /--dry-run \| --write/);
  });
});

describe('the game: zones are solo only (js/zone-streets.js, js/street-loader.js)', () => {
  it('a multiplayer page drops zone rows and every arm into a zone; solo keeps them', async () => {
    const root = tempCheckout();
    assert.ok(publishZone(fixture(), { root, ctx, write: true, dirtyOk: true }).ok);
    const dir = join(root, 'public/assets/streets');
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    const lane = fixture().streets[0].street.tsid;
    try {
      for (const shown of [true, false]) {
        setZoneStreetsShown(shown);
        clearStreetIndex();
        clearStreetCache();
        applyStreetIndex(index);
        assert.equal(lane in STREET_INDEX.streets, shown);
        const hechey = await loadStreetDataFromFs(HECHEY, dir);
        const arms = hechey.signposts.flatMap((p) => p.connects.map((c) => c.tsid));
        assert.equal(arms.includes(lane), shown);
        assert.ok(arms.length > 4, 'Tiny Speck\'s own arms stay');
      }
    } finally {
      setZoneStreetsShown(true);
      clearStreetIndex();
      clearStreetCache();
    }
    assert.deepEqual(Object.keys(withoutZoneRows({ [lane]: {}, [HECHEY]: {}, GX: { zone: 'z' } })), [HECHEY]);
    assert.deepEqual(withoutZoneConnects([{ id: 'a', connects: [{ tsid: lane }] }, { id: 'b', connects: [{ tsid: lane }, { tsid: HECHEY }] }]), [{ id: 'b', connects: [{ tsid: HECHEY }] }]);
  });
});
