/**
 * Original street geometry + platform collision tests (shipped modules).
 * Run: node --test tests/street.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertStreetGeometry,
  worldToScreen,
  platformsScreen,
  platformYAt,
  resolveGround,
  pickConnection,
  streetWidth,
  streetHeight,
} from '../public/js/street-model.js?v=g442-6';
import { STREET_INDEX, availableStreetTsids } from '../public/js/street-loader.js?v=g442-6';

const __dirname = dirname(fileURLToPath(import.meta.url));
const streetsDir = join(__dirname, '../public/assets/streets');

function loadJson(tsid) {
  const meta = STREET_INDEX.streets[tsid];
  const path = join(streetsDir, meta.file.replace(/^assets\/streets\//, ''));
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('recovered street data', () => {
  it('Hechey Track has original id/label, platforms, and decos', () => {
    const street = loadJson('GLI2V0UN7RD1T2J');
    const info = assertStreetGeometry(street);
    assert.equal(street.tsid, 'GLI2V0UN7RD1T2J');
    assert.equal(street.label, 'Hechey Track');
    assert.ok(info.platforms >= 10, `platforms ${info.platforms}`);
    assert.ok(info.decos >= 50, `decos ${info.decos}`);
    assert.ok(info.layers >= 2, `layers ${info.layers}`);
    assert.ok(streetWidth(street) > 1000);
    assert.ok(streetHeight(street) > 100);
  });

  it('Groddle Forest Junction is a second original street', () => {
    const street = loadJson('GLI3272LOTD1B1F');
    assert.equal(street.tsid, 'GLI3272LOTD1B1F');
    assert.equal(street.label, 'Groddle Forest Junction');
    assertStreetGeometry(street);
    assert.notEqual(street.tsid, 'GLI2V0UN7RD1T2J');
  });

  it('source documents locations-xml provenance', () => {
    const street = loadJson('GLI2V0UN7RD1T2J');
    assert.match(street.source, /locations-xml|glitch-locations/i);
  });
});

describe('platform collision (real street segments)', () => {
  it('keeps collision platforms active while hiding the diagnostic line by default', () => {
    const renderer = readFileSync(
      join(__dirname, '../public/js/street-render.js'),
      'utf8'
    );
    assert.match(renderer, /const plats = platformsScreen\(street\)/);
    assert.match(renderer, /root\.platformsScreen = plats/);
    assert.match(renderer, /if \(opts\.debugPlatforms === true\)/);
    assert.match(renderer, /deepestPlatformY \+ cameraBottomPadding/);
    assert.match(renderer, /root\.sourceWorldH = sourceH/);
  });

  it('worldToScreen maps bounds origin to 0,0', () => {
    const street = loadJson('GLI2V0UN7RD1T2J');
    const o = worldToScreen(street, street.bounds.l, street.bounds.t);
    assert.equal(o.x, 0);
    assert.equal(o.y, 0);
  });

  it('platformYAt interpolates along a segment', () => {
    const p = { x1: 0, y1: 100, x2: 100, y2: 200 };
    assert.equal(platformYAt(p, 0), 100);
    assert.equal(platformYAt(p, 100), 200);
    assert.equal(platformYAt(p, 50), 150);
    assert.equal(platformYAt(p, 200), null);
  });

  it('resolveGround snaps feet to real Hechey Track platforms', () => {
    const street = loadJson('GLI2V0UN7RD1T2J');
    const plats = platformsScreen(street);
    assert.ok(plats.length >= 10);
    // take midpoint of first platform
    const p = plats[0];
    const mx = (p.x1 + p.x2) / 2;
    const my = platformYAt(p, mx);
    assert.ok(my != null);
    const hit = resolveGround(plats, mx, my - 5, 1, 20);
    assert.ok(hit, 'should find ground under platform midpoint');
    assert.ok(Math.abs(hit.y - my) < 1);
  });

  it('resolveGround returns null when far above all platforms with upward velocity', () => {
    const street = loadJson('GLI2V0UN7RD1T2J');
    const plats = platformsScreen(street);
    const hit = resolveGround(plats, 100, -500, -2, 8);
    // with negative vy (jumping up) snap rules skip — null ok
    assert.equal(hit, null);
  });
});

describe('signpost navigation', () => {
  it('Hechey Track signpost connects to Groddle Forest Junction', () => {
    const street = loadJson('GLI2V0UN7RD1T2J');
    const avail = availableStreetTsids();
    assert.ok(avail.includes('GLI3272LOTD1B1F'));
    let found = null;
    for (const s of street.signposts) {
      const c = pickConnection(s, avail);
      if (c && (c.tsid === 'GLI3272LOTD1B1F' || c.label.includes('Groddle Forest'))) {
        found = c;
        break;
      }
    }
    assert.ok(found, 'expected a signpost connection to Groddle Forest Junction');
    // After L↔G normalize, loaded tsid is GLI...
    assert.equal(found.tsid, 'GLI3272LOTD1B1F');
  });

  it('Junction signpost connects back to Hechey Track', () => {
    const street = loadJson('GLI3272LOTD1B1F');
    let found = null;
    for (const s of street.signposts) {
      const c = pickConnection(s, availableStreetTsids());
      if (c && c.tsid === 'GLI2V0UN7RD1T2J') {
        found = c;
        break;
      }
    }
    assert.ok(found);
    assert.match(found.label, /Hechey/i);
  });
});
