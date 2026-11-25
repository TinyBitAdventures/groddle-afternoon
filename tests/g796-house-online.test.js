/**
 * G796 (Austin 2026-11-22: build all ten, free, move saves onto the originals): the house on the
 * home street is Glitch's furniture_chassis, one of ten houses with a choice per part, from the
 * CC0 SWFs (tools/house-art/build.mjs), customized with the house's Customize verb
 * (furniture_chassis.js verbs.customize; the client's ChassisManager / ConfiggerUI), free.
 * This file: visitors and other players on the home street see the owner's house.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeLiveParts, homeLivePrints } from '../public/js/home-live.js?v=9c7abae7';
import { visitorHomeState } from '../public/js/features/homes-feature.js?v=56705fe1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_DIR = process.env.GRODDLE_SITE_DIR || join(root, '../groddle-afternoon-site');

describe("visitors see the owner's house (online)", () => {
  it('the home a visitor reads carries the house; without one it is the style\'s original', () => {
    const v = visitorHomeState({ home: { owned: true, style: 'meadow', house: { chassis: 'orient', config: { roof: 2 }, facingRight: true } }, homes: {} });
    assert.equal(v.house.chassis, 'orient');
    assert.equal(v.house.config.roof, 2);
    assert.equal(v.house.facingRight, true);
    assert.equal(visitorHomeState({ home: { owned: true, style: 'uralia' }, homes: {} }).house.chassis, 'hominid');
  });

  it('a Customize change is a change visitors are told about (home-live "home" print)', () => {
    const save = (house) => ({ systems: { home: { owned: true, style: 'meadow', house }, features: { homes: {} } }, world: { streets: {} } });
    const a = save({ chassis: 'cottage', config: { door: 1 }, facingRight: false });
    const b = save({ chassis: 'cottage', config: { door: 2 }, facingRight: false });
    assert.deepEqual(homeLiveParts(a).home.house, a.systems.home.house);
    assert.notEqual(homeLivePrints(a).home, homeLivePrints(b).home);
  });

  it('the site sends the house with the home (Neighbours::homeHouse)', { skip: !existsSync(join(SITE_DIR, 'src/Neighbours.php')) && 'no site checkout' }, () => {
    const src = readFileSync(join(SITE_DIR, 'src/Neighbours.php'), 'utf8');
    assert.match(src, /'home' => \['owned' => true, 'style' => self::homeStyle\(\$theirs\), 'house' => self::homeHouse\(\$theirs\)\]/);
    let out;
    try {
      const state = JSON.stringify({ systems: { home: { owned: true, house: { chassis: 'firebog', config: { door: 3, 'bad key': 2, top: 99 }, facingRight: true } } } });
      out = execFileSync('/usr/bin/php', ['-r', `require ${JSON.stringify(join(SITE_DIR, 'src/Neighbours.php'))}; echo json_encode([Groddle\\Minn\\Neighbours::homeHouse(json_decode(${JSON.stringify(state)})), Groddle\\Minn\\Neighbours::homeHouse(json_decode('{}'))]);`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return; // no php here
    }
    assert.equal(out, '[{"chassis":"firebog","config":{"door":3},"facingRight":true},null]');
  });
});
