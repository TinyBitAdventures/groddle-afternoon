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
/** Row G52: the greyscale masters shipped with borrowed (or designed) colours. */
const REIMAGINED = [
  'hat/Women_Plain_Hat', 'hat/banana_hat', 'hat/real_bowler_hat',
  'coat/alph_lem_mab', 'coat/banana_coat',
  'shirt/chaulkywhite_shirtvest', 'shirt/cola_bottle_shirt', 'shirt/frilly_tank_blouse_belly', 'shirt/mushroom_shirt_light', 'shirt/nintendo_shirt_lighter',
  'pants/kiss_pants', 'pants/mongolia_fighting_pants', 'pants/rainbow_leggings',
  'dress/teaport', 'skirt/bell_skirt', 'shoes/slouch_boots', 'shoes/sweet_heart_shoes',
];

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

  it('SWF-only articles come after every GSJS article; own-colour ones have one colourway, the SWF\'s own fills', () => {
    let extras = 0;
    for (const [type, entries] of Object.entries(manifest.articles)) {
      const extra = entries.map((e) => (typeof e === 'object' && (e.ownColours || e.reimagined) ? e : null));
      const first = extra.findIndex(Boolean);
      if (first < 0) continue;
      assert.ok(extra.slice(first).every(Boolean), `${type}: SWF-only articles are appended`);
      for (const e of extra.slice(first)) {
        const it = item(type, e.name);
        assert.ok(it, `${type}/${e.name} in the catalog`);
        assert.equal(it.gsjsId, undefined, e.name);
        assert.equal(it.swfOnly, true, e.name);
        if (e.ownColours && type !== 'hair') assert.deepEqual(it.variants, [{ colors: {} }], e.name);
        extras += 1;
      }
    }
    assert.deepEqual(
      Object.entries(catalog.types).flatMap(([t, l]) => l.filter((i) => !i.gsjsId && t !== 'nose').map((i) => `${t}/${i.name}`)).sort(),
      ['coat/RideRainbow', 'hair/BrowStache', ...REIMAGINED].sort(),
    );
    assert.equal(extras, 2 + REIMAGINED.length);
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
      // Masks, also inside blend groups (the color_10 highlight multiplies, rig.mjs).
      const clipsIn = (ops) => ops.flatMap((o) => (o.clip ? [o] : o.bm ? clipsIn(o.ops) : []));
      const masks = clipsIn(v);
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

describe('reimagined greyscale masters (row G52)', () => {
  const entries = Object.entries(manifest.articles).flatMap(([type, list]) => list.filter((e) => typeof e === 'object' && e.reimagined).map((e) => ({ type, ...e })));

  it('lists the 17 masters, each marked and named for its colour source', () => {
    assert.deepEqual(entries.map((e) => `${e.type}/${e.name}`).sort(), [...REIMAGINED].sort());
    for (const e of entries) {
      const it = item(e.type, e.name);
      assert.equal(it.reimagined, true, e.name);
      assert.equal(it.swfOnly, true, e.name);
      if (e.colourways) {
        assert.equal(it.designedColours, true, e.name);
        assert.equal(it.borrowedColours, undefined, e.name);
        assert.equal(it.variants.length, e.colourways.length, e.name);
      } else {
        const [t, n] = e.borrowedColours.split('/');
        const sib = item(t, n);
        assert.ok(sib?.gsjsId, `${e.name}: ${e.borrowedColours} is a GSJS article`);
        assert.equal(it.borrowedColours, e.borrowedColours);
        assert.equal(it.borrowedLabel, sib.label);
        // Every sibling colourway (or the picked ones), in the sibling's own order.
        assert.deepEqual(it.variants.map((v) => v.from), sib.variants.map((v) => v.id).filter((id) => !e.pick || e.pick.includes(id)), e.name);
      }
    }
  });

  it('every colour slot a master draws gets a colour in every colourway (bar the ones left grey on purpose)', () => {
    for (const e of entries) {
      const it = item(e.type, e.name);
      const data = json(join(A, 'articles', e.type, `${e.name}.json`));
      const slots = data.groups.filter((g) => /^color_\d+$/.test(g));
      assert.ok(slots.length, `${e.name}: a greyscale master has colour slots`);
      const grey = new Set([...Object.entries(e.colourMap || {}), ...Object.entries(e.fill || {})].filter(([, v]) => v === null).map(([k]) => k));
      it.variants.forEach((v, i) => {
        for (const s of slots) if (!grey.has(s)) assert.ok(v.colors[s]?.tintColor, `${e.name} colourway ${i}: ${s}`);
      });
    }
  });

  it('pins a few borrowed colourways, index for index', () => {
    const from = (type, name) => item(type, name).variants.map((v) => v.from);
    assert.deepEqual(from('shirt', 'mushroom_shirt_light'), [141, 149, 164, 353, 1409, 1452, 1521]);
    assert.deepEqual(from('hat', 'real_bowler_hat'), [539, 574, 583, 1331]);
    assert.deepEqual(from('shoes', 'sweet_heart_shoes'), [456, 554, 1332, 1462]);
    // A remapped slot: the shirt-vest's sleeves wear the sibling's shirt colour (color_5).
    const sv = item('shirt', 'chaulkywhite_shirtvest');
    const sib = item('shirt', 'chaulkywhite_coatshirtvest');
    sv.variants.forEach((v, i) => assert.deepEqual(v.colors.color_7, sib.variants[i].colors.color_5));
    assert.equal(item('dress', 'teaport').label, 'Teapot');
  });

  it('come after every GSJS article of their type, so no saved index moves', () => {
    for (const name of REIMAGINED) {
      const [type, n] = name.split('/');
      const list = catalog.types[type];
      const at = list.findIndex((i) => i.name === n);
      assert.ok(list.slice(0, at).every((i) => i.gsjsId || i.swfOnly), name);
      assert.ok(list.slice(at).every((i) => i.swfOnly), name);
    }
  });
});

describe('builder labels (WARD, tools/avatar-compositor/labels.mjs)', () => {
  const all = Object.entries(catalog.types).flatMap(([type, list]) => list.map((it) => ({ type, ...it })));

  it('no builder label is a raw id, a numbered placeholder or a file-name spelling', () => {
    for (const it of all) {
      const where = `${it.type}/${it.name}: "${it.label}"`;
      assert.ok(it.label?.trim(), `${it.type}/${it.name} has no label`);
      // A class name may stand as its own label only when it is a plain word ("Mullet", "Tutu").
      assert.ok(it.label !== it.name || /^[A-Z][a-z]+$/.test(it.name), `${where} is the raw id`);
      assert.doesNotMatch(it.label, /_/, where);
      assert.doesNotMatch(it.label, /^(Eyes|Mouth|Nose|Ears|Hair) \d+$/, where);
      assert.doesNotMatch(it.label, /\b0\d/, `${where}: zero-padded number`);
      assert.doesNotMatch(it.label, /[a-z][A-Z]/, `${where}: CamelCase`);
      assert.doesNotMatch(it.label, /^(wo)?m[ae]ns?\b|^(fe)?male\b|^lady\b|^girl\b|^guy\b(?! fawkes)|^boy\b/i, `${where}: gendered file prefix`);
    }
  });

  it('labels are unique within each type', () => {
    for (const [type, list] of Object.entries(catalog.types)) {
      const seen = new Map();
      for (const it of list) {
        assert.ok(!seen.has(it.label), `${type}: "${it.label}" is both ${seen.get(it.label)} and ${it.name}`);
        seen.set(it.label, it.name);
      }
    }
  });

  it('every labels.mjs row reaches the catalog, marked source or ours', async () => {
    const { ARTICLE_LABELS } = await import('../tools/avatar-compositor/labels.mjs');
    assert.ok(ARTICLE_LABELS.size > 200);
    for (const [key, { label, origin }] of ARTICLE_LABELS) {
      const [type, name] = key.split('/');
      assert.equal(item(type, name)?.label, label, key);
      assert.ok(origin === 'source' || origin === 'ours', key);
    }
    assert.equal(item('hat', 'Women_Plain_Hat').label, 'Plain lace hat');
    assert.equal(item('hat', 'Women_Plain_Hat').borrowedLabel, 'Plain lace dress');
    assert.equal(item('eyes', 'eyes_20101109E').label, 'Cat eyes');
  });

  it('slouch boots drop Fur-topped boots colourway 462 (nearly white on them)', () => {
    const slouch = item('shoes', 'slouch_boots');
    assert.deepEqual(slouch.variants.map((v) => v.from), [460, 1312]);
    assert.ok(ids('shoes', 'top_fur_boots').includes(462), 'the Fur-topped boots keep their own 462');
  });
});
