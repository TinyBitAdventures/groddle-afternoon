/**
 * Location XML → street JSON converter + multi-street loader.
 * Run: node --test tests/location-xml.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  convertLocationXml,
  isConvertibleStreet,
  collectSprites,
} from '../public/js/location-xml.js?v=a4db2433';
import { assertStreetGeometry } from '../public/js/street-model.js?v=23b926e5';
import {
  loadStreetDataFromFs,
  loadStreetIndexObject,
  clearStreetCache,
  clearStreetIndex,
  availableStreetTsids,
  STREET_INDEX,
} from '../public/js/street-loader.js?v=d6cbbd5c';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STREETS = join(ROOT, 'public/assets/streets');
const XML_SAMPLE = join(
  ROOT,
  '../streets/mnt/stos/location_data/GLI2V0UN7RD1T2J.xml'
);
const XML_JUNC = join(ROOT, '../streets/mnt/stos/location_data/GLI3272LOTD1B1F.xml');
const XML_FULL = join(
  ROOT,
  '../streets/mnt/stos/location_data'
);

const HUB_NAMES = { 56: 'Groddle Forest' };

describe('convertLocationXml (real fixtures)', () => {
  it('converts Hechey Track XML to valid street geometry', () => {
    assert.ok(existsSync(XML_SAMPLE), 'sample XML present');
    const xml = readFileSync(XML_SAMPLE, 'utf8');
    const street = convertLocationXml(xml, HUB_NAMES);
    assert.equal(street.tsid, 'GLI2V0UN7RD1T2J');
    assert.match(street.label, /Hechey Track/i);
    assert.ok(street.platforms.length >= 10);
    assert.ok(street.layers.length >= 1);
    const decoN = street.layers.reduce((n, L) => n + L.decos.length, 0);
    assert.ok(decoN >= 10);
    assert.ok(street.bounds.r > street.bounds.l);
    assert.equal(street.hubId, '56');
    const stats = assertStreetGeometry(street);
    assert.ok(stats.platforms >= 10);
    assert.ok(stats.decos >= 10);
    assert.equal(isConvertibleStreet(street), true);
  });

  it('converts Groddle Forest Junction XML', () => {
    const xml = readFileSync(XML_JUNC, 'utf8');
    const street = convertLocationXml(xml, HUB_NAMES);
    assert.equal(street.tsid, 'GLI3272LOTD1B1F');
    assert.match(street.label, /Junction/i);
    assertStreetGeometry(street);
    assert.ok(collectSprites(street).length >= 5);
  });

  it('converts an archive XML (Adanac) from full dump', () => {
    const path = join(XML_FULL, 'GLI2V30ECRD1GAU.xml');
    assert.ok(existsSync(path), 'Adanac XML in archive');
    const street = convertLocationXml(readFileSync(path, 'utf8'), HUB_NAMES);
    assert.match(street.label, /Adanac/i);
    assertStreetGeometry(street);
    assert.ok(street.platforms.length >= 5);
  });

  it('retains stable deco ids needed by the Greedy Street Spirit theatre', () => {
    const path = join(XML_FULL, 'GNVD57N9ERF3TNH.xml');
    const street = convertLocationXml(readFileSync(path, 'utf8'), HUB_NAMES);
    const decos = street.layers.flatMap((layer) => layer.decos || []);
    assert.equal(decos.length, 372);
    assert.equal(decos.filter((deco) => deco.id).length, 372);
    assert.ok(decos.some((deco) => deco.id === 'streetspirit_test_1335481122049'));
  });
});

describe('bulk street index + loader', () => {
  before(() => {
    clearStreetCache();
    clearStreetIndex();
    const idx = JSON.parse(readFileSync(join(STREETS, 'index.json'), 'utf8'));
    loadStreetIndexObject(idx);
  });

  it('index lists ≥3 streets including Hechey + Junction', () => {
    const keys = availableStreetTsids();
    assert.ok(keys.length >= 3);
    assert.ok(keys.length >= 1000, `expected large import, got ${keys.length}`);
    assert.ok(STREET_INDEX.streets.GLI2V0UN7RD1T2J);
    assert.ok(STREET_INDEX.streets.GLI3272LOTD1B1F);
    assert.match(STREET_INDEX.streets.GLI2V0UN7RD1T2J.label, /Hechey/i);
  });

  it('loadStreetDataFromFs loads default, Junction, and Adanac', async () => {
    const a = await loadStreetDataFromFs('GLI2V0UN7RD1T2J', STREETS);
    assert.equal(a.tsid, 'GLI2V0UN7RD1T2J');
    assertStreetGeometry(a);

    const b = await loadStreetDataFromFs('GLI3272LOTD1B1F', STREETS);
    assert.equal(b.tsid, 'GLI3272LOTD1B1F');
    assertStreetGeometry(b);

    const c = await loadStreetDataFromFs('GLI2V30ECRD1GAU', STREETS);
    assert.match(c.label, /Adanac/i);
    assertStreetGeometry(c);
  });

  it('import skips are documented and cover remainder of XML set', () => {
    const skips = JSON.parse(
      readFileSync(join(STREETS, 'import-skips.json'), 'utf8')
    );
    assert.ok(skips.count >= 1);
    assert.ok(Array.isArray(skips.skips));
    const total = availableStreetTsids().length + skips.count;
    assert.ok(total >= 2800, `xml covered ${total}`);
  });
});

describe('deco coverage inventory', () => {
  it('every referenced sprite is present or listed missing', () => {
    const missPath = join(STREETS, 'missing-decos.json');
    assert.ok(existsSync(missPath));
    const inv = JSON.parse(readFileSync(missPath, 'utf8'));
    assert.ok(inv.referenced >= 1);
    assert.ok(Array.isArray(inv.missing));
    assert.equal(inv.missingCount, inv.missing.length);
    assert.equal(
      inv.present + inv.missingCount,
      inv.referenced,
      'present + missing should equal referenced'
    );
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'public/assets/decos/manifest.json'), 'utf8')
    );
    assert.ok(Array.isArray(manifest));
    assert.ok(manifest.length >= 1);
    // G427: the underground backdrops behind the cross-section patches (glitch-locations
    // groddle1.swf / corey3.swf bundles, FFDec frame 1 at 2x). Without ug_exface3 the sky
    // gradient showed through the gaps between patches (The Great Hole to Ix, a white spike).
    for (const name of ['ug_exface1', 'ug_exface2', 'ug_exface3']) {
      assert.ok(manifest.includes(name), `${name} in manifest.json`);
      assert.ok(!inv.missing.includes(name), `${name} not listed missing`);
      assert.ok(existsSync(join(ROOT, `public/assets/decos/groddle/${name}.webp`)), `${name}.webp ships`);
      assert.ok(existsSync(join(ROOT, `assets-src/decos/groddle/${name}.png`)), `${name}.png source`);
    }
    const hole = JSON.parse(readFileSync(join(STREETS, 'GLI2VDR4JRD1AEG.json'), 'utf8'));
    const backdrop = hole.layers.find((l) => l.id === 'middleplus').decos.find((d) => d.sprite === 'ug_exface3');
    assert.deepEqual([backdrop.w, backdrop.h, backdrop.z], [2355, 496, 1], 'the patches (z 4-28) sit on it');
    // shipped presence check for known groddle sprites
    for (const name of ['dirt_platform_short', 'tree_coniferous_fg_1']) {
      if (manifest.includes(name)) {
        assert.ok(
          existsSync(join(ROOT, `public/assets/decos/groddle/${name}.webp`))
        );
      }
    }
  });
});
