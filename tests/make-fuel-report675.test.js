/**
 * #675: the Make panel at a machine showed only energy (0 for an Urth Block), never the fuel the job
 * burns, its Max ignored the tank, and only Make itself refused (home-machines-feature startJob).
 * Glitch sent the fuel as an ingredient row less the Blockmaker cards (inc_making.js 1598-1619); the
 * details said "Uses: 0 energy / 50 units of fuel" for the chosen count, in the warning colour when the
 * tank held less (MakingDetailsUI.as 262-269, 317-334), and Make was off with "You need more fuel to
 * make this" (250-256). Placed machines and room machines both pass their tank as the station's toolState.
 * Run: node --test tests/make-fuel-report675.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAKE_FUEL_TIP, jobFuel, makeFuelView, tankOf } from '../public/js/home-machines.js?v=0344a288';
import { machineTank } from '../public/js/machine-rooms.js?v=a99c4d01';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const recipes = JSON.parse(read('public/assets/content/recipes.json'));
const urth = (recipes.recipes || recipes).grade_aa_earth_block;

describe('#675 a machine recipe shows its fuel', () => {
  it('an Urth Block at a Blockmaker: the units for the count and the tank, short in the warning state', () => {
    assert.equal(urth.tool, 'blockmaker');
    const tank = tankOf({ classTsid: 'blockmaker', fuel: 30 });
    const ten = makeFuelView({ classTsid: 'blockmaker', perUnit: urth.toolWear, qty: 10, toolState: tank });
    assert.equal(ten.need, urth.toolWear * 10);
    assert.equal(ten.text, `Uses ${urth.toolWear * 10} units of fuel. The tank has 30.`);
    assert.equal(ten.short, true);
    assert.equal(makeFuelView({ classTsid: 'blockmaker', perUnit: urth.toolWear, qty: 2, toolState: tank }).short, false);
    // Max: what the tank pays for, never past the batch limit.
    assert.equal(ten.max(10), Math.floor(30 / urth.toolWear));
    assert.equal(makeFuelView({ classTsid: 'blockmaker', perUnit: urth.toolWear, qty: 1, toolState: tankOf({ classTsid: 'blockmaker', fuel: 999 }) }).max(10), 10);
    assert.equal(makeFuelView({ classTsid: 'blockmaker', perUnit: urth.toolWear, qty: 1, toolState: tankOf({ classTsid: 'blockmaker', fuel: 1 }) }).max(10), 0);
    assert.equal(MAKE_FUEL_TIP, 'You need more fuel to make this');
  });

  it('the Blockmaker cards burn less, as the Make itself charges (jobFuel)', () => {
    const up = ['blockmaking_save_fuel_2'];
    const v = makeFuelView({ classTsid: 'blockmaker', perUnit: urth.toolWear, qty: 10, upgrades: up, toolState: tankOf({ classTsid: 'blockmaker', fuel: 30 }) });
    assert.equal(v.need, jobFuel('blockmaker', urth.toolWear, 10, up));
    assert.ok(v.need < urth.toolWear * 10);
    assert.equal(v.max(10), [...Array(11).keys()].filter((n) => jobFuel('blockmaker', urth.toolWear, n, up) <= 30).pop());
  });

  it('a room machine\'s tank reads the same; one unit of fuel is singular; no fuel, no line', () => {
    const v = makeFuelView({ classTsid: 'fuelmaker', perUnit: 1, qty: 1, toolState: machineTank({ condition: { fuelmaker: { remaining: 4 } } }, 'fuelmaker') });
    assert.equal(v.text, 'Uses 1 unit of fuel. The tank has 4.');
    assert.equal(makeFuelView({ classTsid: 'fuelmaker', perUnit: 1, qty: 3 }).text, 'Uses 3 units of fuel.');
    assert.equal(makeFuelView({ classTsid: 'blender', perUnit: 0 }), null);
  });

  it('the Make panel shows the line, caps Max by the tank and turns Make off with the tip', () => {
    const game = read('public/game.js');
    const at = game.indexOf('// #675: a machine recipe\'s fuel, from the machine\'s own tank');
    assert.ok(at > 0);
    const detail = game.slice(at, game.indexOf("detail.querySelector('[data-make-go]')", at));
    assert.match(detail, /makeFuelView\(\{ classTsid: recipe\.tool, perUnit: recipe\.toolWear, qty, upgrades: pc\.imaginationUpgrades \|\| \[\], toolState: station\?\.tool === recipe\.tool \? station\.toolState : null \}\)/);
    assert.match(detail, /const blockedLine = makeBlockedLine\(recipe, check\) \|\| \(fuelOne\?\.short \? MAKE_FUEL_TIP : ''\);/);
    assert.match(detail, /if \(fuelOne\) m = fuelOne\.max\(m\);/);
    assert.match(detail, /data-make-fuel/);
    assert.match(detail, /data-make-go \$\{maxMake < 1 \? `disabled title="\$\{escapeHtml\(blockedLine\)\}"` : ''\}/);
    assert.match(read('public/style.css'), /\.make-detail-body \.make-fuel\.is-short \{[^}]*color: var\(--text-danger\)/);
    // Both machine kinds hand the Make panel their tank.
    assert.match(read('public/js/features/home-machines-feature.js'), /toolState: tankOf\(m\),\n\s+homeMachine: m\.id,/);
    assert.match(read('public/js/features/machine-rooms-feature.js'), /toolState: m\.tank,\n\s+roomMachine: m\.def\.id,/);
  });
});
