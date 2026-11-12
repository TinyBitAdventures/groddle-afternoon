/**
 * FORSALE (Austin 2026-11-01, "I can't imagine the for sale being shown on them"): the POL house
 * decos (door_asset_house_*) show no For Sale sign. Tiny Speck's SWF carries a `sign` MovieClip the
 * client showed only for a house that was for sale (glitch-client DoorView.as 50-56, 228-232;
 * server location.js 2313/2436, inc_pols.js pols_is_for_sale); our render had flattened it in.
 * tools/deco-pipeline/door-signs.py renders the houses without it and keeps the For Sale art for
 * the public POL street doors whose `for_sale` flag is set.
 *
 * Run: node --test tests/door-signs.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOOR_SALE_ART, doorSaleArt } from '../public/js/door-sign-art.js?v=69daffff';
import { NEIGHBOURS } from '../public/js/neighbours.js?v=caec2f76';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const read = (p) => readFileSync(join(spike, p), 'utf8');
const signs = JSON.parse(read('tools/deco-pipeline/door-signs.json'));
const plan = Object.fromEntries(JSON.parse(read('tools/deco-pipeline/plan.json')).decos.map((r) => [r.name, r]));
const python = '/opt/homebrew/bin/python3.11';
const locations = join(homedir(), 'Documents/glitch-audit/research/audio-hunt/raw/glitch-locations');
const HOUSES = ['large', 'medium', 'small'].flatMap((s) => [1, 2, 3, 4, 5].map((i) => `door_asset_house_${s}_0${i}`));

describe('house decos carry no For Sale sign', () => {
  it('every POL house deco is rendered without its sign', () => {
    assert.deepEqual(Object.keys(signs.decos).sort(), HOUSES);
    for (const n of HOUSES) {
      const r = plan[n];
      assert.deepEqual(r.hidden, ['sign'], `${n}: build.py hides the sign`);
      assert.equal(r.src_sha, signs.decos[n].nosign_sha, `${n}: built from the sign-free source`);
      assert.ok(existsSync(join(spike, 'assets-src/decos/door-signs', `${n}.png`)), n);
    }
  });

  it('pixel check: the shipped house differs from its For Sale art in the sign box only', () => {
    for (const n of HOUSES) {
      const s = signs.decos[n];
      // The measurement is of the file that ships (door-signs.py --check re-measures it).
      assert.equal(s.plain_sha, plan[n].sha2, `${n}: measured the shipped ${n}.webp`);
      assert.ok(s.sign_diff >= 20, `${n}: sign box differs by ${s.sign_diff}`);
      assert.ok(s.rest_diff <= 1.5, `${n}: rest differs by ${s.rest_diff}`);
      const [x0, y0, x1, y1] = s.sign_box;
      // Tiny Speck's board stands at the front left of every house, about 215 x 225 px of 2x art.
      assert.ok(x0 < 40 && x1 - x0 > 180 && x1 - x0 < 240 && y1 - y0 > 190 && y1 - y0 < 250, `${n}: ${s.sign_box}`);
      assert.ok(y1 >= s.size2[1] - 40, `${n}: the board stands on the ground`);
    }
  });

  it('keeps the house sizes and tiers (nothing moves)', () => {
    for (const n of HOUSES) {
      assert.deepEqual(plan[n].size2, signs.decos[n].size2, n);
      const hires = Boolean(plan[n].hires);
      assert.equal(existsSync(join(pub, 'assets/decos/groddle', `${n}@1.5x.webp`)), hires, n);
    }
  });

  it('the home street, neighbours and Classic home draw the plain house decos', () => {
    const homes = read('public/js/features/homes-feature.js');
    const block = homes.slice(homes.indexOf('const HOUSES = {'), homes.indexOf('export const HOUSE_STYLE_KEYS'));
    const paths = [...block.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(paths, ['door_asset_house_large_01', 'door_asset_house_medium_03', 'door_asset_house_large_05']);
    for (const p of paths) assert.ok(HOUSES.includes(p));
    for (const nb of NEIGHBOURS) assert.ok(!nb.house.path.includes('__forsale'), nb.id);
    assert.doesNotMatch(read('public/game.js'), /__forsale/);
    assert.doesNotMatch(homes, /doorSaleArt|__forsale/);
  });
});

describe('For Sale art for houses that are for sale', () => {
  it('ships one file per house at its best tier, and nothing else', () => {
    const shipped = new Set(readdirSync(join(pub, 'assets/decos/door-signs')));
    assert.deepEqual([...shipped].sort(), Object.values(DOOR_SALE_ART).sort());
    for (const n of HOUSES) {
      const file = doorSaleArt(n);
      assert.equal(file, `assets/decos/door-signs/${n}__forsale${plan[n].hires ? '@1.5x' : ''}.webp`);
      assert.ok(existsSync(join(pub, file)), file);
    }
    assert.equal(doorSaleArt('door_asset_apartment_door_lock'), null);
  });

  it('public POL streets: a door with for_sale has its For Sale art (Hayden Seek Alley: all six)', () => {
    const dir = join(pub, 'assets/streets');
    let forSale = 0;
    let owned = 0;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'index.json') continue;
      const s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      for (const d of s.doors || []) {
        if (!HOUSES.includes(d.sprite)) continue;
        if (d.for_sale) {
          forSale += 1;
          assert.ok(doorSaleArt(d.sprite), `${f} ${d.sprite}`);
        } else owned += 1;
      }
    }
    assert.ok(forSale >= 30 && owned >= 20, `${forSale} for sale, ${owned} owned`);
    const hayden = JSON.parse(readFileSync(join(dir, 'GLI11VQR8871IPQ.json'), 'utf8')).doors.filter((d) => HOUSES.includes(d.sprite));
    assert.equal(hayden.length, 6);
    assert.ok(hayden.every((d) => d.for_sale === true));
  });

  it('doors-feature draws the For Sale art only for a door with for_sale', () => {
    const fx = read('public/js/features/doors-feature.js');
    assert.match(fx, /const saleArt = !door\.src && !lockArt && hasArt && door\.for_sale \? doorSaleArt\(door\.sprite\) : null;/);
  });
});

describe('door-signs.py --check', () => {
  it('sources, plan, files and the pixel check are current', { skip: (!existsSync(python) && 'needs python3.11') || (!existsSync(locations) && 'needs glitch-locations') }, () => {
    const out = execFileSync(python, ['-I', join(spike, 'tools/deco-pipeline/door-signs.py'), '--check'], { encoding: 'utf8', timeout: 600000 });
    assert.match(out, /door-signs check: 15 decos, 0 problems/);
  });
});
