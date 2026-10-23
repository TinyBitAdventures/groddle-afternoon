/**
 * Flash blend modes on avatar articles (tools/avatar-compositor/rig.mjs blend
 * groups, js/avatar-compositor.js BLEND_OPS): every hair's color_10 highlight
 * multiplies onto the hair beneath it, inside the hair part's own layer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenSprite } from '../tools/avatar-compositor/rig.mjs';
import { drawListBounds, expandRig, frameDrawList, lookMatrices, slotAssignments } from '../public/js/avatar-rig.js';
import { expandCatalog, resolveLook } from '../public/js/avatar-looks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'public/assets/avatar');
const json = (rel) => JSON.parse(readFileSync(join(DATA, rel), 'utf8'));
const catalog = expandCatalog(json('catalog.json'));

/** A tiny SWF display tree: sprite 1 holds the given placements of shape 9. */
function swfWith(places) {
  const frames = [places.map((p, i) => ({ op: 'place', depth: i + 1, id: 9, matrix: [1, 0, 0, 1, 0, 0], ...p }))];
  return { sprites: new Map([[1, { frames, frameCount: 1, labels: [] }]]), kinds: new Map([[9, 'shape']]) };
}
const alphaCx = (a) => ({ m: [1, 1, 1, a], o: [0, 0, 0, 0] });

describe('Flash blend modes in the flattened ops', () => {
  it('a multiply child makes its parent an isolated layer and becomes a blend group', () => {
    const ops = flattenSprite(swfWith([{ name: 'color_1' }, { name: 'color_10', blendMode: 'multiply' }]), 1, 1, {}, undefined, 0.5);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].bm, 'layer');
    assert.equal(ops[0].a, 0.5, 'the parent alpha applies to its layer');
    const [base, high] = ops[0].ops;
    assert.equal(base.s, 9);
    assert.equal(base.a, undefined);
    assert.equal(high.bm, 'multiply');
    assert.equal(high.ops[0].s, 9);
  });

  it('a layer at full alpha is just its content; at part alpha it is a group with that alpha', () => {
    assert.deepEqual(flattenSprite(swfWith([{ blendMode: 'layer' }]), 1, 1).map((o) => o.s), [9]);
    const [g] = flattenSprite(swfWith([{ blendMode: 'layer', cxform: alphaCx(0.25) }]), 1, 1);
    assert.equal(g.bm, 'layer');
    assert.equal(g.a, 0.25);
    assert.equal(g.ops[0].a, undefined, 'children paint opaque inside the layer');
  });

  it("only a part's direct color_10 child is tagged for AvatarSwf's override", () => {
    const [layer] = flattenSprite(swfWith([{}, { name: 'color_10', blendMode: 'multiply' }, { name: 'color_2', blendMode: 'multiply' }]), 1, 1);
    assert.deepEqual(layer.ops.filter((o) => o.bm).map((o) => o.n), ['color_10', undefined]);
    const nested = swfWith([{}]);
    nested.sprites.set(2, { frames: [[{ op: 'place', depth: 1, id: 1, matrix: [1, 0, 0, 1, 0, 0] }]], frameCount: 1, labels: [] });
    nested.kinds.set(1, 'sprite');
    nested.sprites.get(1).frames[0].push({ op: 'place', depth: 2, id: 9, matrix: [1, 0, 0, 1, 0, 0], name: 'color_10', blendMode: 'multiply' });
    const [inner] = flattenSprite(nested, 2, 1);
    assert.equal(inner.ops.find((o) => o.bm === 'multiply').n, undefined, 'a grandchild color_10 keeps its mode');
  });

  it('a hidden blended child neither draws nor isolates its parent', () => {
    const ops = flattenSprite(swfWith([{}, { blendMode: 'multiply', cxform: alphaCx(0) }]), 1, 1);
    assert.deepEqual(ops.map((o) => o.s), [9]);
  });
});

describe('color_10 highlights follow AvatarSwf', () => {
  const groupsIn = (ops, out = []) => {
    for (const o of ops) {
      if (o.bm) { out.push(o); groupsIn(o.ops, out); } else if (o.clip) groupsIn(o.ops, out);
    }
    return out;
  };
  const shapeOps = (ops) => ops.flatMap((o) => (o.bm || o.clip ? shapeOps(o.ops) : [o]));
  // These two SWFs place their color_10 with normal blending.
  const NO_MULTIPLY = ['electro_longbangs', 'hair_B0018'];

  it("every catalog hair keeps the SWF's color_10 multiply, tagged for the client's override, inside an isolated layer", () => {
    for (const item of catalog.types.hair) {
      const data = json(`articles/hair/${item.name}.json`);
      let found = false;
      for (const part of Object.values(data.parts)) for (const v of part.variants) {
        for (const g of groupsIn(v)) {
          if (g.bm !== 'multiply') continue;
          found = true;
          assert.equal(g.n, 'color_10', `${item.name}: the multiply group is the part's color_10`);
          assert.ok(shapeOps(g.ops).every((o) => o.g?.[0] === 'color_10'), `${item.name}: multiply holds only color_10`);
        }
        assert.ok(!v.some((o) => o.bm === 'multiply'), `${item.name}: a multiply group sits inside its parent's layer`);
      }
      assert.equal(found, !NO_MULTIPLY.includes(item.name), `${item.name} multiply highlight`);
    }
  });

  const rig = expandRig(json('base.json'));
  const all = (items) => items.flatMap((it) => (it.bm || it.clip ? [it, ...all(it.items)] : [it]));
  function drawList(fields, frame) {
    const look = resolveLook(fields, catalog);
    const articles = new Map(Object.entries(look.outfit).filter(([, a]) => a?.name && a.name !== 'none').map(([type, a]) => [a.name, json(`articles/${type}/${a.name}.json`)]));
    const L = { assign: slotAssignments(look.outfit, { hatAllowsHair: () => true }), articles, matrices: lookMatrices(look), face: look.face };
    const shapeOf = (src, id) => (src === 'base' ? rig.shapes[id] : articles.get(src)?.shapes[id]);
    return { list: frameDrawList(rig, L, rig.frames.indexOf(frame)), shapeOf };
  }
  const withOutfit = (outfit, extra = {}) => ({ ...catalog.defaultLook, ...extra, outfit: { ...catalog.defaultLook.outfit, ...outfit } });

  it('hair color_10 draws normally (addShadowToHair), with no layer left around it', () => {
    for (const frame of [801, 1145]) {
      const { list } = drawList(withOutfit({ hair: 'hair_greaser' }), frame);
      const hair = all(list).filter((it) => it.src === 'hair_greaser');
      assert.ok(hair.length > 0, `hair at ${frame}`);
      assert.ok(!all(list).some((it) => it.bm), `frame ${frame}: no blend groups`);
    }
  });

  it("an article's color_10 multiplies only when its colourway leaves color_10 out (maybeColorIt)", () => {
    const corset = catalog.types.shirt.find((i) => i.name === 'corset');
    const has10 = corset.variants.map((v) => Boolean(v.colors?.color_10));
    assert.deepEqual(has10, [true, false, true, true]);
    for (const [variant, colours] of has10.entries()) {
      const { list, shapeOf } = drawList(withOutfit({ shirt: 'corset' }, { variant: { ...catalog.defaultLook.variant, shirt: variant }, tint: {} }), 801);
      const groups = all(list).filter((it) => it.bm);
      assert.equal(groups.some((g) => g.bm === 'multiply'), !colours, `corset colourway ${variant}`);
      // Blend groups never change the bounds.
      const opened = (items) => items.flatMap((it) => (it.bm ? opened(it.items) : it.clip ? [{ ...it, items: opened(it.items) }] : [it]));
      assert.deepEqual(drawListBounds(list, shapeOf), drawListBounds(opened(list), shapeOf));
    }
  });
});
