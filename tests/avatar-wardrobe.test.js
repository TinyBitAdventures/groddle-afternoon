/**
 * Wardrobe data guarantees (row G18): saved looks keep their colourways,
 * SWF-only articles, and morph-shape masks (shape tweens) in the articles.
 * Run: node --test tests/avatar-wardrobe.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { articleColors, expandCatalog, randomVectorFields, resolveLook } from '../public/js/avatar-looks.js';
import { CORE_FRAMES } from '../public/js/avatar-anims.js';
import { MORPH_ID_BASE, morphOfShapeId, morphShapeId } from '../tools/avatar-compositor/rig.mjs';
import { morphShapeAt, parseMorphSvg } from '../tools/avatar-compositor/shapes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(root, 'public/assets/avatar');
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const catalog = expandCatalog(json(join(A, 'catalog.json')));
const manifest = json(join(root, 'tools/avatar-compositor/catalog.json'));
const item = (type, name) => catalog.types[type].find((i) => i.name === name);
const ids = (type, name) => item(type, name).variants.map((v) => v.id);

describe('saved colourway indices', () => {
  // Saved looks store variant[type] as an index into the article's colourways
  // (js/avatar-looks.js), not the GSJS id: these must never move.
  const PINNED = {
    'pants/plain_trousers': [161, 352, 405, 420, 837, 849, 861, 865, 1047, 1048, 1049, 1178, 1179, 1345, 1346, 1438],
    'shoes/converse': [232, 251, 269, 270, 271, 285, 913, 940, 1372],
    'shirt/classic_undershirt': [144, 158, 180, 209],
    'coat/chaulkywhite_coatshirtvest_coat': [1533, 1534, 1535, 1536, 1537, 1538, 1540, 1541],
    'hat/tiara': [1117, 1169, 1170, 1337],
    'coat/RidePig': [1555],
  };

  it('pins the colourways of a few articles, index for index', () => {
    for (const [key, want] of Object.entries(PINNED)) {
      const [type, name] = key.split('/');
      assert.deepEqual(ids(type, name), want, key);
    }
    // The Sunday best and Dapper presets save { pants: 13 } on plain trousers.
    const look = resolveLook({ outfit: { pants: 'plain_trousers' }, variant: { pants: 13 } }, catalog);
    assert.deepEqual(look.outfit.pants.colors, articleColors(item('pants', 'plain_trousers'), 13));
    assert.equal(item('pants', 'plain_trousers').variants[13].id, 1345);
  });

  it('lists GSJS colourways by id, so a new GSJS id can only append', () => {
    for (const list of Object.values(catalog.types)) {
      for (const it of list) {
        const gs = (it.variants || []).map((v) => v.id).filter((v) => v !== undefined);
        assert.deepEqual(gs, [...gs].sort((a, b) => a - b), it.name);
      }
    }
  });

  it('SWF-only articles come after every GSJS article and have one colourway, the SWF\'s own fills', () => {
    let extras = 0;
    for (const [type, entries] of Object.entries(manifest.articles)) {
      const own = entries.map((e) => (typeof e === 'object' && e.ownColours ? e.name : null));
      const first = own.findIndex(Boolean);
      if (first < 0) continue;
      assert.ok(own.slice(first).every(Boolean), `${type}: SWF-only articles are appended`);
      for (const name of own.slice(first)) {
        const it = item(type, name);
        assert.ok(it, `${type}/${name} in the catalog`);
        assert.equal(it.gsjsId, undefined, name);
        assert.equal(it.swfOnly, true, name);
        if (type !== 'hair') assert.deepEqual(it.variants, [{ colors: {} }], name);
        extras += 1;
      }
    }
    assert.deepEqual(
      Object.entries(catalog.types).flatMap(([t, l]) => l.filter((i) => !i.gsjsId && t !== 'nose').map((i) => `${t}/${i.name}`)).sort(),
      ['coat/RideRainbow', 'hair/BrowStache'],
    );
    assert.equal(extras, 2);
  });

  it('random looks (and the seeded NPC looks) draw only from the GSJS wardrobe', () => {
    let seed = 11;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const f = randomVectorFields(catalog, rng);
      for (const [type, name] of Object.entries(f.outfit)) if (name !== 'none') assert.ok(!item(type, name).swfOnly, `${type}/${name}`);
    }
  });
});

describe('morph shapes (shape tweens)', () => {
  it('draw ids keep the morph id and ratio apart from SWF character ids', () => {
    assert.equal(morphOfShapeId(285), null);
    for (const [id, ratio] of [[285, 0], [285, 65535], [1, 1234]]) {
      const s = morphShapeId(id, ratio);
      assert.ok(s >= MORPH_ID_BASE && Number.isSafeInteger(s));
      assert.deepEqual(morphOfShapeId(s), { id, ratio });
    }
  });

  it('interpolates outline, fill and bounds at the placement ratio', () => {
    const svg = `<svg><g transform="matrix(1,0,0,1,5,5)">
      <path d="M0.0 0.0 L10.0 0.0 Q10.0 10.0 0.0 10.0 L0.0 0.0" fill="#ff0000" fill-rule="evenodd" stroke="none">
        <animate attributeName="fill" dur="2.0s" repeatCount="indefinite" values="#ff0000;#0000ff"/>
        <animate attributeName="d" dur="2.0s" repeatCount="indefinite" values="M0.0 0.0 L10.0 0.0 Q10.0 10.0 0.0 10.0 L0.0 0.0;M0.0 0.0 L20.0 0.0 Q20.0 20.0 0.0 20.0 L0.0 0.0"/>
      </path></g></svg>`;
    const paths = parseMorphSvg(svg);
    const bounds = [{ xmin: 0, ymin: 0, xmax: 10, ymax: 10 }, { xmin: 0, ymin: 0, xmax: 20, ymax: 20 }];
    const start = morphShapeAt(paths, 0, bounds);
    const mid = morphShapeAt(paths, 32768, bounds);
    const end = morphShapeAt(paths, 65535, bounds);
    assert.equal(start.p[0].d, 'M0 0l10 0q0 10-10 10l0-10');
    assert.equal(end.p[0].d, 'M0 0l20 0q0 20-20 20l0-20');
    assert.equal(mid.p[0].d, 'M0 0l15 0q0 15-15 15l0-15');
    assert.deepEqual(start.p[0].f, [255, 0, 0, 1]);
    assert.deepEqual(end.p[0].f, [0, 0, 255, 1]);
    assert.equal(mid.p[0].r, 'evenodd');
    assert.deepEqual(mid.b, [0, 0, 15, 15]);
  });

  it('every mask in every article has an outline (a morph mask once flattened to nothing)', () => {
    for (const [type, list] of Object.entries(catalog.types)) {
      for (const { name } of list) {
        for (const file of [`${name}.json`, `${name}.idle.json`]) {
          const data = json(join(A, 'articles', type, file));
          const walk = (ops) => {
            for (const o of ops) {
              if (!o.clip) continue;
              assert.ok(o.clip.length, `${type}/${file}: empty mask`);
              walk(o.ops);
            }
          };
          for (const part of Object.values(data.parts)) part.variants.forEach(walk);
        }
      }
    }
  });

  it('hair_20101116B from behind: its streak masks are morph outlines at the climb frames', () => {
    const data = json(join(A, 'articles/hair/hair_20101116B.json'));
    const back = data.parts.backHair;
    for (const fn of [1145, 1150, 1155, 1163]) {
      const v = back.variants[back.frames === 0 ? 0 : back.frames[CORE_FRAMES.indexOf(fn)]];
      const masks = v.filter((o) => o.clip);
      assert.equal(masks.length, 4, `frame ${fn}`);
      for (const m of masks) {
        for (const c of m.clip) {
          assert.ok(morphOfShapeId(c.s), `frame ${fn}: mask ${c.s} is a morph`);
          assert.ok(data.shapes[c.s]?.p.some((p) => p.f && p.d.length > 20), `frame ${fn}: mask ${c.s} outline`);
        }
      }
    }
  });
});
