/**
 * Vector Glitch avatar: rig data, colour maths, slot rules, looks and the
 * prerendered default sheets (tools/avatar-compositor, js/avatar-rig.js,
 * js/avatar-looks.js, js/avatar-compositor.js).
 * Run: node --test tests/avatar-compositor.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTICLE_CONTAINERS, HAT_MASKED_HAIR, SKIN_NODES, SLOT_PARTS, applyCM, colorMatrixFor, drawListBounds, expandRig,
  frameDrawList, hardLightMatrix, isBoot, lookMatrices, mergeIdleArticle, mergeIdleRig, slotAssignments,
} from '../public/js/avatar-rig.js';
import {
  COLOR_FIELDS, articleColors, expandCatalog, lookKey, normalizeVectorFields, randomVectorFields, resolveLook, vectorFieldsFromColors,
} from '../public/js/avatar-looks.js';
import { CORE_FRAMES, IDLE_FRAMES, IDLE_SHEETS, SHEET_FRAMES } from '../public/js/avatar-anims.js';
import { VECTOR_AVATAR, VECTOR_AVATAR_HIRES } from '../public/js/avatar-vector-sheets.js';
import { FIRST_DRAW_SPRITES, HIRES_SPRITES } from '../public/js/sprite-hires.js';
import { compactD } from '../tools/avatar-compositor/shapes.mjs';
import { customEase, easeAt, layerAt, readSymbol, tweenElement } from '../tools/avatar-compositor/xfl.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const A = join(pub, 'assets/avatar');
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const coreRig = json(join(A, 'base.json'));
const coreFrameList = coreRig.frames.slice();
// The idle frames load later in the game (prepareIdle); the tests use the merged rig.
const rig = mergeIdleRig(expandRig(coreRig), json(join(A, 'base.idle.json')));
const catalogRaw = readFileSync(join(A, 'catalog.json'), 'utf8');
const catalog = expandCatalog(JSON.parse(catalogRaw));
const RIG_FRAMES = [...CORE_FRAMES, ...IDLE_FRAMES];
const article = (type, name) => mergeIdleArticle(json(join(A, 'articles', type, `${name}.json`)), json(join(A, 'articles', type, `${name}.idle.json`)), CORE_FRAMES.length, IDLE_FRAMES.length);

function articlesFor(look) {
  const m = new Map();
  for (const [type, a] of Object.entries(look.outfit)) m.set(a.name, article(type, a.name));
  return m;
}
function lookCtx(look) {
  const articles = articlesFor(look);
  return {
    look: { assign: slotAssignments(look.outfit, { hatAllowsHair: (h, r) => Boolean(catalog.hatHair[h.name]?.includes(r.name)) }), articles, matrices: lookMatrices(look), face: look.face },
    shapeOf: (src, id) => (src === 'base' ? rig.shapes[id] : articles.get(src)?.shapes[id]),
  };
}
const flat = (items) => items.flatMap((it) => (it.clip ? flat(it.items) : [it]));
/** Article part ops (masks nest: { clip, ops }) as draw-item shaped groups for flat(). */
const asItems = (ops) => ops.map((o) => (o.clip ? { clip: o.clip, items: asItems(o.ops) } : o));

/** Absolute points of a path (M/L/Q or relative m/l/q), for round trips. */
function points(d) {
  const t = d.match(/[MLQmlq]|-?\d*\.?\d+/g);
  const out = [];
  let cmd = 'M';
  let x = 0;
  let y = 0;
  for (let i = 0; i < t.length;) {
    if (/[A-Za-z]/.test(t[i])) { cmd = t[i++]; continue; }
    const n = cmd.toLowerCase() === 'q' ? 4 : 2;
    const v = t.slice(i, i + n).map(Number);
    i += n;
    const rel = cmd === cmd.toLowerCase();
    for (let k = 0; k < n; k += 2) out.push([Math.round(((rel ? x : 0) + v[k]) * 20), Math.round(((rel ? y : 0) + v[k + 1]) * 20)]);
    x = (rel ? x : 0) + v[n - 2];
    y = (rel ? y : 0) + v[n - 1];
    if (cmd === 'm') cmd = 'l';
    if (cmd === 'M') cmd = 'L';
  }
  return out;
}

describe('colour maths (ColorMatrix.as, AvatarSwf)', () => {
  it('a 0% tint is identity and a full tint colours by luminance', () => {
    const id = colorMatrixFor({ tintColor: 'ff0000', tintAmount: '0', brightness: '0', saturation: '0', contrast: '0', alpha: '100' });
    assert.deepEqual(applyCM(id, [10, 120, 230, 1]).map(Math.round), [10, 120, 230, 1]);
    const red = colorMatrixFor({ tintColor: 'ff0000', tintAmount: '100', brightness: '0', saturation: '0', contrast: '0', alpha: '100' });
    const white = applyCM(red, [255, 255, 255, 1]);
    assert.ok(Math.abs(white[0] - 255) < 0.5 && white[1] < 0.5 && white[2] < 0.5);
    // Brightness adds to every channel; alpha 50 halves alpha.
    const b = colorMatrixFor({ tintColor: '000000', tintAmount: '0', brightness: '20', saturation: '0', contrast: '0', alpha: '50' });
    assert.deepEqual(applyCM(b, [100, 100, 100, 1]).map((v) => Math.round(v * 100) / 100), [120, 120, 120, 0.5]);
  });

  it('skin is a hard-light flat tint (old Avatar.swf colouring)', () => {
    const grey = hardLightMatrix('808080');
    const c = applyCM(grey, [100, 150, 200, 1]);
    assert.ok(c.every((v, i) => i === 3 || Math.abs(v - [100, 150, 200][i]) < 1.5));
    const light = applyCM(hardLightMatrix('ffffff'), [40, 40, 40, 1]);
    assert.equal(Math.round(light[0]), 255);
    const dark = applyCM(hardLightMatrix('000000'), [200, 200, 200, 1]);
    assert.equal(Math.round(dark[0]), 0);
  });
});

describe('slot rules (AvatarSwf.initializeHead)', () => {
  const art = (name) => ({ name });
  it('a hat hides hair unless the hat allows it; boots use boot containers', () => {
    const a = slotAssignments({ hat: art('party_hat'), hair: art('mohawk'), shoes: art('cowboy_boots') });
    assert.ok(a.map.has('sideHatContainer_mc'));
    assert.ok(!a.map.has('sideHairContainer_mc'));
    assert.ok(a.map.has('sideBootFootCloseContainer_mc') && !a.map.has('sideShoeCloseContainer_mc'));
    assert.equal(isBoot('ballet_shoes'), false);
    const b = slotAssignments({ hat: art('cap'), hair: art('Buzzcut') }, { hatAllowsHair: () => true });
    assert.ok(b.map.has('sideHairContainer_mc') && b.hatAndHair);
  });
  it('a skirt excludes a dress, and most coats hide shirt sleeves', () => {
    const a = slotAssignments({ skirt: art('short_skirt'), dress: art('paper_dress'), coat: art('anything'), shirt: art('plaid_shirt') });
    assert.ok(a.map.has('sideSkirtContainer_mc') && !a.map.has('sideDressContainer_mc'));
    assert.ok(a.hidden.has('sideShirtSleeveUpperCloseContainer_mc'));
    assert.equal(slotAssignments({ coat: art('Fisherman_vest') }).hidden.size, 0);
  });
});

describe('rig data (Avatar.swf avatarContainer)', () => {
  it('holds every swf frame the sheets use, with slots the client fills', () => {
    // base.json: the core sheets' frames; base.idle.json adds the idle and sleepy ones.
    assert.deepEqual(coreFrameList, CORE_FRAMES);
    assert.deepEqual(rig.frames, RIG_FRAMES);
    assert.equal(new Set(RIG_FRAMES).size, RIG_FRAMES.length);
    for (const name of IDLE_SHEETS) for (const fn of SHEET_FRAMES[name]) assert.ok(IDLE_FRAMES.includes(fn), `${name} ${fn}`);
    assert.equal(rig.table.length, RIG_FRAMES.length);
    for (const s of rig.slots) assert.ok(ARTICLE_CONTAINERS.includes(s), s);
    assert.ok(rig.nodes.every((n) => SKIN_NODES.includes(n.name)), 'body parts are skin parts');
    for (const n of rig.nodes) for (const op of n.ops) assert.ok(rig.shapes[op.s], `${n.name} shape ${op.s}`);
    // The eye/mouth mask copies the skull at skull.x/y: the skull node must be unrotated in its container.
    assert.ok(rig.nodes.some((n) => n.name === 'sideSkull_mc'));
  });

  it('compact paths keep every point on the twip grid', () => {
    const abs = 'M-4.95 1.2 L-5.0 0.05 Q-6.15 -0.4 -6.95 -0.9 L-6.8 0.25 -4.9 1.35 M-0.8 2.45 Q-0.45 2.15 -0.2 1.1 L12 4';
    assert.deepEqual(points(compactD(abs)), points(abs));
    assert.ok(compactD(abs).length < abs.length);
  });
});

describe('catalog and looks', () => {
  it('every catalog article has parts, shapes and real GSJS colourways', () => {
    let n = 0;
    for (const [type, items] of Object.entries(catalog.types)) {
      for (const item of items) {
        const data = article(type, item.name);
        assert.ok(Object.keys(data.parts).length, `${type}/${item.name} parts`);
        for (const part of Object.values(data.parts)) {
          if (part.frames !== 0) assert.equal(part.frames.length, RIG_FRAMES.length);
          for (const v of part.variants) for (const op of flat(asItems(v))) assert.ok(data.shapes[op.s], `${item.name} shape ${op.s}`);
        }
        if (['shirt', 'coat', 'pants', 'shoes', 'hat', 'skirt', 'dress'].includes(type)) assert.ok(item.variants?.length >= 1, `${item.name} colourways`);
        // Idles and AFK work in every look: each article ships its idle frames.
        assert.ok(existsSync(join(A, 'articles', type, `${item.name}.idle.json`)), `${type}/${item.name}.idle.json`);
        assert.deepEqual(Object.keys(data.parts).sort(), [...item.parts].sort(), `${type}/${item.name} parts listed`);
        for (const part of Object.values(data.parts)) assert.equal(part.frames === 0 ? RIG_FRAMES.length : part.frames.length, RIG_FRAMES.length);
        // Wearable whole: every part it ships has a container in the rig.
        const kind = type === 'shoes' && isBoot(item.name) ? 'boots' : type;
        const containers = new Map(SLOT_PARTS[kind].map(([p, c]) => [p, c]));
        for (const part of item.parts.filter((p) => !/HairMask$/.test(p))) assert.ok(rig.slots.includes(containers.get(part)), `${type}/${item.name} ${part} has no container`);
        n += 1;
      }
    }
    assert.ok(n >= 600, `${n} articles`);
    // One name per article across types (the compositor keys articles by name).
    const names = Object.values(catalog.types).flat().map((i) => i.name);
    assert.equal(new Set(names).size, names.length);
    assert.ok(catalog.palettes.skin.length >= 50 && catalog.palettes.hair.length >= 50);
  });

  it('resolves the default look and saved fields, dropping unknown parts', () => {
    const def = resolveLook({}, catalog);
    assert.equal(def.outfit.hair.name, 'eightiesBandana');
    assert.equal(def.outfit.shirt.colors.color_1.tintColor, 'd6f028');
    assert.equal(def.colors.skin.tint, catalog.palettes.skin.find((p) => p.id === catalog.defaultLook.skinColor).color);
    const custom = resolveLook({ outfit: { hair: 'mohawk', hat: 'none', shirt: 'not_a_shirt' }, variant: { pants: 2 } }, catalog);
    assert.equal(custom.outfit.hair.name, 'mohawk');
    assert.equal(custom.outfit.shirt.name, 'classic_undershirt');
    assert.equal(custom.outfit.pants.colors.color_1.tintColor, articleColors(catalog.types.pants.find((p) => p.name === 'plain_trousers'), 2).color_1.tintColor);
    assert.notEqual(lookKey(def), lookKey(custom));
    assert.deepEqual(normalizeVectorFields({ outfit: { hair: 'nope' } }, catalog).outfit, {});
    assert.equal(vectorFieldsFromColors({ shirt: { r: 255, g: 0, b: 16 } }).tint.shirt, 'ff0010');
  });

  it('random looks only use catalog parts, and hats only with hair they allow', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) {
      const f = randomVectorFields(catalog, rng);
      for (const [type, name] of Object.entries(f.outfit)) if (name !== 'none') assert.ok(catalog.types[type].some((x) => x.name === name), `${type} ${name}`);
      if (f.outfit.hat && f.outfit.hat !== 'none') assert.ok(catalog.hatHair[f.outfit.hat].includes(f.outfit.hair));
    }
  });
});

describe('the whole GSJS wardrobe', () => {
  const items = (type) => catalog.types[type] || [];
  const idleIdx = RIG_FRAMES.indexOf(IDLE_FRAMES[0]);
  const stand = RIG_FRAMES.indexOf(801);
  const srcCount = (L, i, name) => flat(frameDrawList(rig, L, i)).filter((it) => it.src === name).length;

  it('packs colours small and expands them to the GSJS fields', () => {
    const raw = JSON.parse(catalogRaw);
    const v = raw.types.pants.find((p) => p.name === 'plain_trousers').variants[0];
    assert.equal(typeof v.colors.color_1, 'string');
    assert.deepEqual(Object.keys(catalog.types.pants.find((p) => p.name === 'plain_trousers').variants[0].colors.color_1), COLOR_FIELDS);
    assert.equal(typeof catalog.palettes.hair[0].colors.color_1.tintColor, 'string');
    assert.equal(expandCatalog(catalog), catalog, 'idempotent');
    assert.ok(catalogRaw.length < 700 * 1024, `catalog.json ${catalogRaw.length} bytes`);
  });

  it('every article draws in the stand or idle frames (idle data present)', () => {
    for (const [type, list] of Object.entries(catalog.types)) {
      for (const item of list) {
        const outfit = { [type]: { name: item.name, parts: item.parts } };
        const look = { outfit: { [type]: { name: item.name, colors: articleColors(item) } }, colors: {}, face: {} };
        const articles = new Map([[item.name, article(type, item.name)]]);
        const L = { assign: slotAssignments(outfit), articles, matrices: lookMatrices(look), face: {} };
        let idle = 0;
        for (let i = idleIdx; i < RIG_FRAMES.length; i++) idle += srcCount(L, i, item.name);
        assert.ok(idle > 0 || srcCount(L, stand, item.name) > 0, `${type}/${item.name} draws nothing`);
      }
    }
  });

  it('a hat hides hair unless it allows it, and masks the hair it allows', () => {
    const hairs = new Set(items('hair').map((h) => h.name));
    for (const hat of items('hat')) {
      const allowed = (catalog.hatHair[hat.name] || []).filter((h) => hairs.has(h));
      const banned = items('hair').find((h) => !allowed.includes(h.name));
      if (!banned) continue;
      const off = lookCtx(resolveLook({ outfit: { hat: hat.name, hair: banned.name } }, catalog)).look;
      assert.ok(!off.assign.hatAndHair && srcCount(off, stand, banned.name) === 0, `${hat.name} hides ${banned.name}`);
      assert.ok(srcCount(off, stand, hat.name) + srcCount(off, idleIdx, hat.name) > 0 || !hat.parts.some((p) => /^side/.test(p)), `${hat.name} draws`);
      if (!allowed.length) continue;
      const on = lookCtx(resolveLook({ outfit: { hat: hat.name, hair: allowed[0] } }, catalog)).look;
      assert.ok(on.assign.hatAndHair, `${hat.name} with ${allowed[0]}`);
      if (hat.parts.includes('sideHatHairMask')) {
        const list = frameDrawList(rig, on, stand);
        const loose = list.filter((it) => !it.clip && it.src === allowed[0]).length;
        assert.equal(loose, 0, `${hat.name} masks ${allowed[0]}`);
      }
    }
  });

  it('coats paint over the top and hide its sleeves; skirts exclude dresses; boots take the boot containers', () => {
    const torso = (L, name) => flat(frameDrawList(rig, L, stand)).map((it, i) => (it.src === name ? i : -1)).filter((i) => i >= 0);
    for (const coat of items('coat')) {
      const L = lookCtx(resolveLook({ outfit: { coat: coat.name, shirt: 'classic_undershirt' } }, catalog)).look;
      assert.equal(L.assign.hidden.size > 0, !['elizabethan_robe', 'mongolian_fighting', 'Fisherman_vest'].includes(coat.name), coat.name);
      if (!coat.parts.includes('coatClose')) continue;
      const shirtAt = torso(L, 'classic_undershirt');
      const coatAt = torso(L, coat.name);
      assert.ok(coatAt.length && Math.max(...coatAt) > Math.max(...shirtAt), `${coat.name} over the shirt`);
    }
    const dress = items('dress')[0].name;
    for (const skirt of items('skirt')) {
      const a = slotAssignments({ skirt: { name: skirt.name, parts: skirt.parts }, dress: { name: dress } });
      assert.ok(![...a.map.values()].flat().some((e) => e.type === 'dress'), `${skirt.name} excludes the dress`);
    }
    for (const shoe of items('shoes')) {
      const a = slotAssignments({ shoes: { name: shoe.name, parts: shoe.parts } });
      const containers = [...a.map.keys()];
      assert.ok(containers.length, `${shoe.name} has slots`);
      assert.equal(containers.some((c) => /Boot/.test(c)), isBoot(shoe.name), shoe.name);
    }
  });

  it('one class worn in two slots stays two articles (the chalky white suit)', () => {
    const shirt = items('shirt').find((i) => i.name === 'chaulkywhite_coatshirtvest');
    const coat = items('coat').find((i) => i.name === 'chaulkywhite_coatshirtvest_coat');
    assert.ok(shirt && coat);
    assert.ok(shirt.parts.includes('shirtTorso') && coat.parts.includes('coatClose'));
    const L = lookCtx(resolveLook({ outfit: { shirt: shirt.name, coat: coat.name } }, catalog)).look;
    assert.ok(srcCount(L, stand, shirt.name) > 0 && srcCount(L, stand, coat.name) > 0);
  });
});

describe('recovered containers (Avatar2011.fla)', () => {
  it('eases and tweens like the compiled SWF', () => {
    // XFL acceleration > 0 eases in (slow start), < 0 eases out.
    assert.equal(easeAt({ accel: 100 }, 0.5), 0.25);
    assert.equal(easeAt({ accel: -100 }, 0.5), 0.75);
    assert.equal(easeAt({ accel: 0 }, 0.3), 0.3);
    const curve = [[0, 0], [0.4545, 0], [0.5977, 1], [1, 1]];
    assert.ok(Math.abs(customEase(curve, 0)) < 1e-6 && Math.abs(customEase(curve, 1) - 1) < 1e-6);
    assert.ok(customEase(curve, 0.1) < 0.05 && customEase(curve, 0.9) > 0.95, 'an S-curve: slow at both ends');
    const e0 = { m: [1, 0, 0, 1, 0, 0], tp: [0, 0], alpha: 1 };
    const e1 = { m: [0, 1, -1, 0, 10, 20], tp: [0, 0], alpha: 1 };
    const half = tweenElement(e0, e1, 0.5).m;
    assert.ok(Math.abs(half[0] - Math.SQRT1_2) < 1e-9 && Math.abs(half[1] - Math.SQRT1_2) < 1e-9, 'rotates the short way');
    assert.deepEqual(half.slice(4), [5, 10]);
    const layer = readSymbol(`<DOMSymbolItem name="x"><timeline><DOMTimeline name="x"><layers><DOMLayer name="a"><frames>
      <DOMFrame index="0" duration="4" tweenType="motion" acceleration="100"><elements><DOMSymbolInstance libraryItemName="c" name="c_mc"><matrix><Matrix tx="0"/></matrix></DOMSymbolInstance></elements></DOMFrame>
      <DOMFrame index="4"><elements><DOMSymbolInstance libraryItemName="c" name="c_mc"><matrix><Matrix tx="8"/></matrix><color><Color alphaMultiplier="0"/></color></DOMSymbolInstance></elements></DOMFrame>
      </frames></DOMLayer></layers></DOMTimeline></timeline></DOMSymbolItem>`).layers[0];
    assert.equal(layerAt(layer, 3)[0].m[4], 2); // eased in: 8 * 0.5^2
    assert.equal(layerAt(layer, 5)[0].alpha, 0);
  });

  it('adds the coat, shoulder, hair-lock, headdress and tail containers at their FLA depths', () => {
    const r = rig.recovered;
    assert.ok(r && r.check.maxPx <= 0.25 && r.check.placements > 10000, 'shared containers match Avatar.swf');
    const want = ['sideCoatSleeveUpperCloseContainer_mc', 'sideCoatSleeveLowerOffsideContainer_mc', 'backCoatSleeveUpperLeftContainer_mc',
      'sideShoulderCloseContainer_mc', 'sideShoulderOffsideContainer_mc', 'sideHairCloseContainer_mc', 'sideHairOffsideContainer_mc',
      'sideHeaddressCloseContainer_mc', 'sideHeaddressOffsideContainer_mc', 'sideTailContainer_mc', 'backTailContainer_mc'];
    for (const c of want) assert.ok(c in r.containers && rig.slots.includes(c), c);
    assert.deepEqual(r.missing, ['sideBraceletCloseContainer_mc']);
    // Paint order at the stand: far hair lock under the body, tail under the
    // torso, front lock and headdress over the close arm and its coat sleeve.
    const rows = rig.table[RIG_FRAMES.indexOf(801)];
    const pos = (pred) => rows.findIndex(pred);
    const slot = (name) => pos((r2) => r2.slot === name);
    const node = (name) => pos((r2) => r2.n !== undefined && rig.nodes[r2.n].name === name);
    assert.ok(slot('sideHairOffsideContainer_mc') < node('sideArmUpperOffside_mc'));
    assert.ok(slot('sideTailContainer_mc') < node('sideTorso_mc'));
    assert.ok(node('sideArmUpperClose_mc') < slot('sideCoatSleeveUpperCloseContainer_mc'));
    assert.ok(slot('sideCoatSleeveUpperCloseContainer_mc') < slot('sideHairCloseContainer_mc'));
    assert.ok(slot('sideHairCloseContainer_mc') < slot('sideHeaddressCloseContainer_mc'));
    // The climb shows the back: back coat sleeves, no side hair locks.
    const climb = rig.table[RIG_FRAMES.indexOf(1150)];
    assert.ok(climb.some((r2) => r2.slot === 'backCoatSleeveUpperLeftContainer_mc'));
    assert.ok(!climb.some((r2) => r2.slot === 'sideHairCloseContainer_mc'));
  });

  it('a coat draws its sleeves and hides the shirt sleeves; a tail and hair locks follow the walk', () => {
    const look = resolveLook({ outfit: { coat: 'navy_coat', pants: 'unicorn_pants', hair: 'pigtails', hat: 'none' } }, catalog);
    const { look: L } = lookCtx(look);
    const sleeveShirt = SLOT_PARTS.shirt.filter(([p]) => /^sleeve/.test(p));
    assert.ok(L.assign.hidden.has(sleeveShirt[0][1]));
    const walk = SHEET_FRAMES.base.slice(0, 12);
    const tailAt = [];
    for (const fn of walk) {
      const items = flat(frameDrawList(rig, L, RIG_FRAMES.indexOf(fn)));
      assert.ok(items.filter((it) => it.src === 'navy_coat').length > 4, `coat at ${fn}`);
      assert.ok(items.some((it) => it.src === 'pigtails'), `hair at ${fn}`);
      tailAt.push(JSON.stringify(items.filter((it) => it.src === 'unicorn_pants').map((it) => it.m.map((v) => v.toFixed(1)))));
    }
    assert.ok(new Set(tailAt).size > 1, 'pants and tail move with the walk');
    // Hair locks sit in the recovered containers.
    const assign = slotAssignments({ hair: { name: 'pigtails', parts: catalog.types.hair.find((h) => h.name === 'pigtails').parts } });
    assert.ok(assign.map.has('sideHairCloseContainer_mc') || assign.map.has('sideHairOffsideContainer_mc'));
  });

  it("a hat's hair mask clips the front and back hair locks too", () => {
    const hat = catalog.types.hat.find((h) => catalog.hatHair[h.name]?.some((hair) => catalog.types.hair.find((x) => x.name === hair)?.parts.some((p) => /HairClose|HairOffside/.test(p))));
    if (!hat) return;
    const hair = catalog.hatHair[hat.name].find((n) => catalog.types.hair.find((x) => x.name === n)?.parts.some((p) => /HairClose|HairOffside/.test(p)));
    const { look: L } = lookCtx(resolveLook({ outfit: { hat: hat.name, hair } }, catalog));
    assert.ok(L.assign.hatAndHair);
    const items = frameDrawList(rig, L, RIG_FRAMES.indexOf(801));
    assert.ok(items.some((it) => it.clip && it.items.some((x) => x.src === hair)), `${hat.name} masks ${hair}`);
    assert.ok(HAT_MASKED_HAIR.includes('sideHairCloseContainer_mc'));
  });
});

describe('draw lists', () => {
  it('every frame of the default look draws the body, clothes and a masked face', () => {
    const look = resolveLook({}, catalog);
    const { look: L, shapeOf } = lookCtx(look);
    for (let i = 0; i < RIG_FRAMES.length; i++) {
      const items = frameDrawList(rig, L, i);
      const srcs = new Set(flat(items).map((it) => it.src));
      assert.ok(srcs.has('base') && srcs.has('eightiesBandana') && srcs.has('plain_trousers'), `frame ${RIG_FRAMES[i]}`);
      assert.ok(drawListBounds(items, shapeOf), `frame ${RIG_FRAMES[i]} bounds`);
      for (const it of flat(items)) assert.ok(it.m.every(Number.isFinite), `frame ${RIG_FRAMES[i]} matrix`);
    }
    // Side frames mask the eyes with the skull; the face animates with the emotion.
    const stand = frameDrawList(rig, L, RIG_FRAMES.indexOf(801));
    assert.ok(stand.some((it) => it.clip && it.items.some((x) => x.src === 'eyes_20101109E')));
    const mouth = (fn) => JSON.stringify(flat(frameDrawList(rig, L, RIG_FRAMES.indexOf(fn))).filter((x) => x.src === 'mouth_08').map((x) => [x.s, x.m.map((v) => v.toFixed(2))]));
    assert.notEqual(mouth(801), mouth(410));
    // Climbing shows the back: no face parts.
    assert.ok(!flat(frameDrawList(rig, L, RIG_FRAMES.indexOf(1150))).some((x) => x.src === 'eyes_20101109E'));
  });

  it('colours reach skin, hair and article colour groups', () => {
    const look = resolveLook({ outfit: { hair: 'Buzzcut' }, hairColor: catalog.palettes.hair[3].id }, catalog);
    const { look: L } = lookCtx(look);
    const items = flat(frameDrawList(rig, L, RIG_FRAMES.indexOf(801)));
    assert.ok(items.some((it) => it.src === 'base' && it.cm), 'skin coloured');
    assert.ok(items.some((it) => it.src === 'Buzzcut' && it.cm), 'hair coloured');
    assert.ok(items.some((it) => it.src === 'classic_undershirt' && it.cm), 'shirt coloured');
  });
});

describe('prerendered default sheets', () => {
  const size = (file) => {
    const b = readFileSync(file);
    if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  };
  it('hold SHEET_FRAMES in the GLITCH_AVATAR layout, with exact 3x files listed for first draw', () => {
    for (const [name, frames] of Object.entries(SHEET_FRAMES)) {
      const d = VECTOR_AVATAR.sheets[name];
      assert.equal(d.cells, frames.length, name);
      assert.equal(d.cols * d.rows >= d.cells && d.cols * (d.rows - 1) < d.cells, true, name);
      const one = `${VECTOR_AVATAR.dir}${d.file}`;
      const three = VECTOR_AVATAR_HIRES[one];
      assert.deepEqual(size(join(pub, one)), [d.cols * d.fw, d.rows * d.fh], name);
      assert.deepEqual(size(join(pub, three)), [d.cols * d.fw * 3, d.rows * d.fh * 3], name);
      assert.ok(d.cols * d.fw * 3 <= 4096, `${name} width`);
      assert.equal(HIRES_SPRITES.get(one), three);
      assert.ok(FIRST_DRAW_SPRITES.has(one));
      assert.ok(d.feetY > 0 && d.feetY <= d.fh && d.midX > 0 && d.midX < d.fw, name);
    }
  });

  it('match the recovered 62d8 sheets pose for pose', () => {
    const score = json(join(root, 'tools/avatar-compositor/score.json'));
    assert.equal(score.pass, true);
    for (const [name, s] of Object.entries(score.sheets)) {
      assert.ok(s.mean >= 0.9, `${name} ${s.mean}`);
      assert.equal(s.unmatched.length, 0, name);
      assert.equal(s.drift.length, 0, name);
      assert.equal(s.frames.length, SHEET_FRAMES[name].length);
    }
  });
});

describe('game wiring', () => {
  it('game.js loads the default sheets, bakes custom looks and keeps the older styles', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    for (const s of ['vectorAvatarBase', 'animPackFromSheets', 'bakeLook', 'vectorBakeScale', 'renderVectorControls', 'loadAvatarCatalog', 'glitchAnimPack']) assert.ok(game.includes(s), s);
    assert.ok(existsSync(join(pub, 'js/avatar-compositor.js')));
  });

  it('loads or bakes the idle sheets on demand, never at boot', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    const sheetsBlock = game.slice(game.indexOf('const SHEETS = {'), game.indexOf('const keys = new Set();'));
    assert.ok(sheetsBlock.includes('vectorAvatarBase'));
    assert.ok(!/(vector|glitch)Avatar(Idle|idle)|SheetDef\('idle/.test(sheetsBlock), 'no avatar idle sheet in the boot SHEETS');
    for (const s of ['ensureIdleSheet', 'bakeIdleSheet', 'loadVectorIdleSheet', 'loadGlitchIdleSheet', 'createIdleClock', 'noteAvatarInput', 'tickAvatarAfk', "You've gone AFK", "You've returned from AFK"]) assert.ok(game.includes(s), s);
    // Every idle sheet ships 1x + 3x for the default look and has its idle frames split out.
    for (const n of IDLE_SHEETS) assert.ok(VECTOR_AVATAR.sheets[n] && existsSync(join(pub, VECTOR_AVATAR.dir, VECTOR_AVATAR.sheets[n].file)), n);
    assert.ok(existsSync(join(A, 'base.idle.json')));
  });
});
