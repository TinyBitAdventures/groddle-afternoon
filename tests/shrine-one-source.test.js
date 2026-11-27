/**
 * #475: the map said Sylvan Grove's shrine was Friendly's, the street stood Tii's. A built street
 * upgrade (js/street-jobs.js upgradeEcologyEntry; Sylvan Grove's "Piggy & Patch Place" says "Shrine to
 * Ti") changes the Giant the street spawns, but the hub map's icons (hub-N.json `shrine`) and "Find
 * the closest Shrine" (shrineStreetsFor) read the archived row. All three now read one row, the one
 * enterStreet spawns from (game.js streetEcologyEntry, streetShrineGiant). Without an upgrade that row
 * is the location file's "Shrine to X", which the 2012 map_shrines agrees with on every street.
 *
 * Run: node --test tests/shrine-one-source.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHubMapView } from '../public/js/map-graph.js?v=803cc6cd';
import { ecologyForStreet, populationForStreet, setStreetEcologyCatalog, shrineStreetsFor } from '../public/js/street-ecology.js?v=da5177b2';
import { upgradeEcologyEntry } from '../public/js/street-jobs.js?v=76471e42';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const catalog = setStreetEcologyCatalog(json('public/assets/content/street-ecology.json')) || json('public/assets/content/street-ecology.json');
const jobs = json('public/assets/content/street-jobs.json');
const g = (t) => `G${String(t).slice(1)}`;

/** Every hub file's streets, by G tsid: { hub, street }. */
function hubStreets() {
  const out = [];
  for (const f of readdirSync(join(root, 'public/assets/maps/hubs'))) {
    if (!/^hub-\d+\.json$/.test(f)) continue;
    const hub = json(`public/assets/maps/hubs/${f}`);
    for (const s of hub.streets || []) out.push({ hub, file: f, street: s });
  }
  return out;
}

describe('#475 the map, the shrine finder and the street name one Giant', () => {
  it('every street upgrade option that names a shrine: the street, the map icon and the finder all say it', () => {
    let checked = 0;
    for (const [tsid, row] of Object.entries(jobs.upgrades)) {
      const base = ecologyForStreet(tsid);
      for (const option of row.options) {
        const entry = upgradeEcologyEntry(base, option);
        assert.ok(entry.giantId, `${option.name} names a Giant`);
        // As game.js streetShrineGiant reads it with this upgrade built.
        const shrineAt = (t) => (g(t) === g(tsid) ? entry : ecologyForStreet(t))?.giantId || '';
        // The street: populationForStreet spawns this Giant's shrine (officialGiantId).
        const pop = populationForStreet(tsid, entry);
        assert.equal(pop.shrine, true);
        assert.equal(pop.giantId, entry.giantId, `${tsid} ${option.name}: the street`);
        // The hub map icon.
        const where = hubStreets().find(({ street }) => g(street.tsid) === g(tsid));
        assert.ok(where, `${tsid} is on a hub map`);
        const view = buildHubMapView(where.hub, '', { [tsid]: { label: row.current?.name || tsid } }, { shrineAt });
        const icon = view.streets.find((s) => g(s.tsid) === g(tsid));
        assert.equal(icon.shrine, entry.giantId, `${tsid} ${option.name}: the map`);
        // "Find the closest Shrine to <Giant>".
        assert.ok(shrineStreetsFor(entry.giantId, catalog, (t) => shrineAt(t)).includes(tsid), `${tsid} ${option.name}: the finder`);
        if (base?.giantId && base.giantId !== entry.giantId) {
          assert.ok(!shrineStreetsFor(base.giantId, catalog, (t) => shrineAt(t)).includes(tsid), 'not still listed for the old Giant');
        }
        checked += 1;
      }
    }
    assert.equal(checked, 10, 'five upgradable streets, two options each');
  });

  it("no upgrade built: every hub map street's icon is the row the street spawns from (the location file)", () => {
    let n = 0;
    for (const { file, street } of hubStreets()) {
      const want = ecologyForStreet(g(street.tsid))?.giantId || '';
      assert.equal(street.shrine || '', want, `${file} ${street.name} (${street.tsid})`);
      n += want ? 1 : 0;
    }
    assert.ok(n > 800, `${n} shrine streets`);
  });

  it('game.js reads one row for the street, the map and the finder', () => {
    const game = read('public/game.js');
    assert.match(game, /function streetEcologyEntry\(street\) \{\s+return features\.ecologyOverride\(street, engine\) \|\| ecologyForStreet\(street\.tsid\);\s+\}/);
    assert.match(game, /const ecologyEntry = streetEcologyEntry\(data\);/);
    assert.match(game, /return t \? streetEcologyEntry\(\{ tsid: t \}\)\?\.giantId \|\| '' : '';/);
    assert.match(game, /buildHubMapView\([^)]*\{ shrineAt: streetShrineGiant \}\)/);
    assert.match(game, /shrineStreetsFor\(row\.id, undefined, streetShrineGiant\)/);
    // No other ecologyOverride || ecologyForStreet pair: a second copy would drift again.
    assert.equal((game.match(/features\.ecologyOverride\(/g) || []).length, 1);
  });

  it("the realtime Rook's shrine Giant is the street's too (tools/build-realtime-rook.mjs)", () => {
    const tool = read('tools/build-realtime-rook.mjs');
    assert.match(tool, /const official = population\.giantId \? \{ officialGiantId: population\.giantId \} : \{\};/);
    assert.match(tool, /giant: giantForStreet\(\{ \.\.\.data, \.\.\.official \}\)\.id/);
  });

  it('the server knows each built upgrade\'s shrine: its Giant, and a shrine an upgrade adds (rook.go spot)', { skip: skipWithoutServer }, () => {
    const rook = JSON.parse(readFileSync(serverPath('data/rook.json'), 'utf8'));
    let checked = 0;
    for (const [tsid, row] of Object.entries(jobs.upgrades)) {
      for (const option of row.options) {
        const giant = upgradeEcologyEntry(ecologyForStreet(tsid), option).giantId;
        const own = rook.streets[tsid];
        // Listed where it differs from the street's own row; the same Giant at the same spot reads that row.
        const now = rook.upgrades[tsid]?.[option.id] || own;
        assert.ok(now, `${tsid} ${option.name}: no shrine on the server`);
        assert.equal(now[3], giant, `${tsid} ${option.name}`);
        checked += 1;
      }
    }
    assert.equal(checked, 10);
    // Nightshade Woods: no shrine until its upgrade.
    assert.equal(rook.streets.GCR11JA67NJ15N3, undefined);
    assert.ok(rook.upgrades.GCR11JA67NJ15N3);
  });
});
