/**
 * Row G359: the article SWFs the inventory listed as missing from the avatar
 * catalog. Four ship (two caterpillar coats in their own colours, two
 * greyscale masters with a sibling's colourways); the others are judged in
 * tools/inventory/overrides.json (copies of shipped articles, work copies,
 * and the never-wired bracelets, row G360).
 * Run: node --test tests/wardrobe-restored.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandCatalog, resolveLook } from '../public/js/avatar-looks.js';
import { SLOT_PARTS } from '../public/js/avatar-rig.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(root, 'public/assets/avatar');
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const catalog = expandCatalog(json(join(A, 'catalog.json')));
const manifest = json(join(root, 'tools/avatar-compositor/catalog.json'));
const overrides = json(join(root, 'tools/inventory/overrides.json'));
const item = (type, name) => catalog.types[type].find((i) => i.name === name);
const article = (type, name) => json(join(A, 'articles', type, `${name}.json`));

describe('restored wardrobe articles (G359)', () => {
  it('the caterpillar coats ship in their own colours, after every GSJS coat', () => {
    const coats = catalog.types.coat;
    for (const [name, label] of [['caterpillar_coat_01', 'Caterpillar coat 1'], ['caterpillar_coat_02', 'Caterpillar coat 2']]) {
      const it = item('coat', name);
      assert.ok(it, name);
      assert.equal(it.label, label);
      assert.equal(it.swfOnly, true);
      assert.equal(it.gsjsId, undefined);
      assert.deepEqual(it.variants, [{ colors: {} }]);
      assert.deepEqual(it.parts, ['coatClose']);
      const data = article('coat', name);
      assert.match(data.source, new RegExp(`wardrobe/coat/${name}\\.swf`));
      assert.ok(Object.keys(data.shapes).length > 0, `${name} draws`);
      assert.ok(coats.findIndex((i) => i.name === name) > coats.findLastIndex((i) => i.gsjsId), `${name} after the GSJS coats`);
    }
  });

  it('the carnival skirt is the skirt-slot SWF, its belt in the pants article\'s colourways', () => {
    const it = item('skirt', 'brazil_carnival_tail_skirt');
    assert.equal(it.reimagined, true);
    assert.equal(it.borrowedColours, 'pants/brazil_carnival_tail');
    assert.deepEqual(it.parts, ['skirt']);
    assert.deepEqual(it.variants.map((v) => v.from), item('pants', 'brazil_carnival_tail').variants.map((v) => v.id));
    assert.match(article('skirt', 'brazil_carnival_tail_skirt').source, /wardrobe\/skirt\/brazil_carnival_tail_skirt\.swf/);
  });

  it('the loose glitchfashion shirt comes from skirt/glitchfashionShirt.swf and keeps its back sleeves', () => {
    const it = item('shirt', 'glitchfashionShirt_loose');
    assert.equal(it.reimagined, true);
    assert.equal(it.borrowedColours, 'shirt/glitchfashionShirt');
    const data = article('shirt', 'glitchfashionShirt_loose');
    assert.match(data.source, /wardrobe\/skirt\/glitchfashionShirt\.swf/);
    // Every shirt part the slot draws, the back sleeves from the SWF's backCoatSleeve* classes (manifest partsFrom).
    assert.deepEqual([...it.parts].sort(), SLOT_PARTS.shirt.map(([p]) => p).sort());
    const entry = manifest.articles.shirt.find((e) => e.name === 'glitchfashionShirt_loose');
    for (const part of Object.keys(entry.partsFrom)) assert.ok(it.parts.includes(part), part);
  });

  it('each restored article resolves into a wearable look', () => {
    for (const outfit of [{ coat: 'caterpillar_coat_01' }, { coat: 'caterpillar_coat_02' }, { skirt: 'brazil_carnival_tail_skirt' }, { shirt: 'glitchfashionShirt_loose' }]) {
      const look = resolveLook({ outfit }, catalog);
      const [type, name] = Object.entries(outfit)[0];
      assert.equal(look.outfit[type]?.name ?? look.outfit[type], name);
    }
  });

  it('every other missing row is judged with a reason in the inventory overrides', () => {
    const judged = {
      'coat/chaulkywhite_coatshirtvest': 'source', 'skirt/RideBurgerCar': 'source', 'skirt/RidePig': 'source', 'skirt/Women_Plain_Dress': 'source',
      'dress/female_steampunk_skirt': 'excluded', 'shirt/female_steampunk_skirt': 'excluded', 'skirt/glitchfashionShirt': 'reimagined',
      'bracelet/bracelet_B010': 'unbuilt_original', 'bracelet/bracelet_B010_grey': 'unbuilt_original',
    };
    for (const [key, status] of Object.entries(judged)) {
      const o = overrides[`wardrobe:${key}`];
      assert.ok(o, key);
      assert.equal(o.status, status, key);
      assert.ok(o.reason.length > 40, key);
      assert.match(o.register, /^G3(59|60)$/, key);
    }
    // The coat-slot chaulkywhite SWF really is what the catalog's _coat entry builds.
    assert.match(article('coat', 'chaulkywhite_coatshirtvest_coat').source, /wardrobe\/coat\/chaulkywhite_coatshirtvest\.swf/);
  });
});
