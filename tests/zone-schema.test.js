/**
 * LEVEL BUILDER P0 (docs/level-builder/spec.md section 14): the zone schema and its checker
 * (public/js/builder/schema-check.js), every shipped street against $defs/street, the rules
 * $defs/draftStreet adds, and the deco catalog (tools/builder/deco-catalog.mjs --check).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileSchema, jsonTypes } from '../public/js/builder/schema-check.js?v=cc9d1af4';
import { LAYER_ROLES, layerRole } from '../public/js/builder/layer-role.js?v=e585f610';
import { bundleOf, familyOf, median } from '../tools/builder/deco-catalog.mjs';

const root = join(import.meta.dirname, '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const schema = json('docs/level-builder/zone.schema.json');
const fixture = () => json('tests/fixtures/builder/mossy-hollow.zone.json');
const checkZone = compileSchema(schema);

describe('the schema checker (js/builder/schema-check.js)', () => {
  const tiny = {
    $defs: { n: { type: 'integer', minimum: 0, maximum: 3 } },
    type: 'object',
    required: ['a'],
    additionalProperties: false,
    properties: {
      a: { $ref: '#/$defs/n' },
      s: { type: 'string', pattern: '^x', minLength: 2, maxLength: 3 },
      l: { type: 'array', minItems: 1, maxItems: 2, items: { enum: ['p', 'q'] } },
      m: { type: 'object', propertyNames: { pattern: '^[a-z]+$' }, additionalProperties: { type: 'number', exclusiveMinimum: 0 } },
      c: { const: 'groddle' },
      u: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      no: false,
      all: { allOf: [{ type: 'number' }, { maximum: 5 }] },
    },
  };
  const check = compileSchema(tiny);
  const kw = (v) => check(v).map((e) => `${e.path} ${e.keyword}`);

  it('types: an integer is also a number', () => {
    assert.deepEqual(jsonTypes(3), ['integer', 'number']);
    assert.deepEqual(jsonTypes(3.5), ['number']);
    assert.deepEqual(jsonTypes(null), ['null']);
    assert.deepEqual(jsonTypes([]), ['array']);
  });

  it('passes a good value and names each failure by path and keyword', () => {
    assert.deepEqual(check({ a: 2, s: 'xy', l: ['p'], m: { ab: 1 }, c: 'groddle', u: 4, all: 5 }), []);
    assert.deepEqual(kw({}), [' required']);
    assert.deepEqual(kw({ a: 1.5 }), ['/a type']);
    assert.deepEqual(kw({ a: 9 }), ['/a maximum']);
    assert.deepEqual(kw({ a: 0, z: 1 }), ['/z additionalProperties']);
    assert.deepEqual(kw({ a: 0, s: 'yyyy' }), ['/s maxLength', '/s pattern']);
    assert.deepEqual(kw({ a: 0, l: [] }), ['/l minItems']);
    assert.deepEqual(kw({ a: 0, l: ['p', 'r'] }), ['/l/1 enum']);
    assert.deepEqual(kw({ a: 0, m: { A: 0 } }), ['/m/A propertyNames', '/m/A exclusiveMinimum']);
    assert.deepEqual(kw({ a: 0, c: 'g' }), ['/c const']);
    assert.deepEqual(kw({ a: 0, u: true }), ['/u anyOf']);
    assert.deepEqual(kw({ a: 0, no: 1 }), ['/no false']);
    assert.deepEqual(kw({ a: 0, all: 6 }), ['/all maximum']);
  });

  it('counts characters, not UTF-16 units', () => {
    assert.deepEqual(compileSchema({ type: 'string', maxLength: 2 })('😀😀'), []);
  });

  it('is strict: a keyword it does not know is an error, never ignored', () => {
    assert.throws(() => compileSchema({ type: 'object', patternProperties: {} }), /patternProperties/);
    assert.throws(() => compileSchema({ $ref: 'https://example.com/x' }), /\$ref/);
  });

  it('compiles the whole zone schema (every keyword it uses is supported)', () => {
    assert.equal(typeof checkZone, 'function');
    for (const def of Object.keys(schema.$defs)) assert.equal(typeof compileSchema(schema, `#/$defs/${def}`), 'function', def);
  });
});

describe('the zone schema (docs/level-builder/zone.schema.json)', () => {
  it('every shipped street fits $defs/street', () => {
    const street = compileSchema(schema, '#/$defs/street');
    const dir = join(root, 'public/assets/streets');
    const files = readdirSync(dir).filter((f) => /^[GL][A-Z0-9]+\.json$/.test(f));
    assert.equal(files.length, 1460);
    const bad = [];
    for (const f of files) {
      const errors = street(JSON.parse(readFileSync(join(dir, f), 'utf8')), { limit: 3 });
      if (errors.length) bad.push(`${f}: ${JSON.stringify(errors)}`);
    }
    assert.deepEqual(bad.slice(0, 5), [], `${bad.length} streets fail`);
  });

  it('the two-street example zone (spec 8.7, full form) passes', () => {
    assert.deepEqual(checkZone(fixture()), []);
  });

  it('builder streets: GZ tsids, a builder source, a gradient, no events or feature fields, the limits', () => {
    const bad = (mutate) => {
      const z = fixture();
      mutate(z, z.streets[0].street);
      return checkZone(z).map((e) => `${e.path} ${e.keyword}`);
    };
    assert.ok(bad((z, s) => { s.tsid = 'GLI2V0UN7RD1T2J'; }).includes('/streets/0/street/tsid pattern'));
    assert.ok(bad((z, s) => { s.tsid = 'GZ000000000001'; }).includes('/streets/0/street/tsid pattern'), 'GZ + 13, not 12');
    assert.ok(bad((z, s) => { s.source = 'tinyspeck'; }).includes('/streets/0/street/source pattern'));
    assert.ok(bad((z, s) => { delete s.gradient; }).includes('/streets/0/street required'));
    assert.ok(bad((z, s) => { s.events = {}; }).includes('/streets/0/street/events false'));
    assert.ok(bad((z, s) => { s.physics = { setting: {}, delta: {} }; }).includes('/streets/0/street/physics false'));
    assert.ok(bad((z, s) => { s.subway = {}; }).includes('/streets/0/street/subway false'));
    assert.ok(bad((z, s) => { s.bounds.r = 9000; }).includes('/streets/0/street/bounds/r maximum'));
    assert.ok(bad((z, s) => { s.layers = Array.from({ length: 25 }, (_, i) => ({ id: `l${i}`, name: 'x', z: 0, decos: [] })); }).includes('/streets/0/street/layers maxItems'));
    assert.ok(bad((z) => { z.streets[0].key = 'Lane'; }).includes('/streets/0/key pattern'));
    assert.ok(bad((z) => { z.assets.bush_3.licence = 'CC-BY-4.0'; }).includes('/assets/bush_3/licence enum'));
    assert.ok(bad((z) => { z.format = 'groddle-zone/2'; }).includes('/format const'));
  });
});

describe('the deco catalog (tools/builder/deco-catalog.mjs, assets/content/deco-catalog.json)', () => {
  const cat = json('public/assets/content/deco-catalog.json');

  it('is current (--check)', () => {
    execFileSync(process.execPath, [join(root, 'tools/builder/deco-catalog.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('has one row per library deco, with layer usage, sizes and flags', () => {
    const manifest = json('public/assets/decos/manifest.json');
    assert.equal(cat.count, 2990);
    assert.equal(cat.decos.length, manifest.length);
    assert.equal(cat.streetsScanned, 1460);
    assert.deepEqual(cat.decos.map((d) => d.name), [...manifest].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    const placed = cat.decos.filter((d) => !d.neverPlaced);
    assert.equal(cat.decos.length - placed.length, 137, 'spec 2.4: 137 library decos never placed');
    assert.ok(placed.every((d) => Object.keys(d.layers).length > 0 && d.drawn && d.streets > 0));
    assert.ok(cat.decos.every((d) => Object.keys(d.layers).every((r) => LAYER_ROLES.includes(r))));
    assert.ok(cat.decos.every((d) => Array.isArray(d.size2) && d.size2.length === 2));
    const total = cat.decos.reduce((n, d) => n + d.placements, 0);
    assert.ok(total > 550000 && total <= 555837, `placements ${total}`);
    const bush = cat.decos.find((d) => d.name === 'bush_3');
    assert.equal(bush.family, 'bush');
    assert.equal(bush.source, 'groddle1.swf#bush_3');
    assert.ok(bush.placements > 10000 && bush.layers.middleground > 1000 && bush.hubs.length === 5);
    assert.equal(cat.decos.filter((d) => d.hires).length, 2333);
    assert.equal(cat.decos.filter((d) => d.animated).length > 0, true);
  });

  it('helpers: median, family, bundle', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 3);
    assert.equal(median([]), null);
    assert.equal(familyOf('Brain_stem_large'), 'brain');
    assert.deepEqual(bundleOf({ swf: 'bundle:newxp.swf#Brain_stem_large' }), ['newxp', 'newxp.swf#Brain_stem_large']);
    assert.deepEqual(bundleOf({ name: 'Glints_3' }), ['png', 'png#Glints_3']);
  });

  it('layer roles: the middleground, names that say a role, and depth', () => {
    const street = { layers: [{ id: 'T_1', name: 'mtns', z: -4 }, { id: 'b', name: 'bg 2', z: -2 }, { id: 'middleground', z: 0 }, { id: 'p', name: 'mplus', z: 1 }, { id: 'f', name: 'foreground dark', z: 2 }, { id: 'g', name: 'fg', z: 3 }] };
    assert.deepEqual(street.layers.map((l) => layerRole(l, street)), ['sky', 'bg', 'middleground', 'middleplus', 'foreground', 'foreground']);
    assert.equal(layerRole({ id: 'x', name: 'blue sky', z: -1 }, { layers: [{ id: 'y', z: -5 }] }), 'sky');
  });
});
