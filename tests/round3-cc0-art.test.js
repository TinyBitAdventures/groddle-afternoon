/**
 * Round 3 level review (research/coverage/round3-levels-2026-10-29/review.md): rooms that drew
 * their own stand-ins now use Tiny Speck's CC0 art, and the mechanics around it are unchanged.
 * - Radiant Glare: the `rainbow` deco (quest02.swf, byte-identical to groddle1.swf's) replaces
 *   the drawn bands, fitted to the arch you walk on.
 * - Le Voyage Violet: the washing is hanging_clothes_1..6 on hanging_clothes_line and the moon is
 *   `moon` (abbasid1.swf / quest02.swf decos), in place of drawn garments and a drawn crescent.
 * - Esquibeth grottos: Tiny Speck's own glyphs (esquibeth1.swf: Spriggan, Cosma and Pot, their
 *   glow, the sheetmusiclines staffs and the note dots) replace the three made-up vector glyphs;
 *   each found note sits in the socket carved for it (tools/esquibeth-art/build.py).
 * - Walk Toward the Light and Radiant Glare: every avatar draws in grey (the designer's videos
 *   Et0RkY43A5Q and ZQQydNM9THI and the Snaps), as the client's middleground saturation filter did.
 */
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLOORS, RAINBOW_ART, radiantLayout, rainbowY, room as glareRoom } from '../public/js/quest-rooms/radiant-glare.js?v=9603b55a';
import { room as lightRoom } from '../public/js/quest-rooms/light-perspective.js?v=1b1c1732';
import { glitchLayerMatrix } from '../public/js/street-render.js?v=2b7abfd2';
import { FLOOR_WASH, MOON, VOYAGE_DECOS, VOYAGE_FLOOR, VOYAGE_OWL, VOYAGE_STONE, VOYAGE_STUMP, VOYAGE_W, WASHING, WASHING_LINE, violetMatrix, voyageGroundPlan } from '../public/js/purple-journey-scene.js?v=8b88b497';
import * as esq from '../public/js/quest-rooms/esquibeth.js?v=09145fa7';
import { ESQUIBETH_ART, ESQUIBETH_GLYPHS, ESQUIBETH_STAFFS } from '../public/js/quest-rooms/esquibeth-art.js?v=fe515887';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const decoPlan = () => new Map(read('tools/deco-pipeline/plan.json').split('\n')
  .filter((l) => l.startsWith('{"name"'))
  .map((l) => JSON.parse(l.replace(/,$/, '')))
  .map((r) => [r.name, r]));

describe('Radiant Glare: the CC0 rainbow', () => {
  it('draws the shipped rainbow deco, not vector bands', () => {
    const src = read('public/js/quest-rooms/radiant-glare.js');
    assert.equal(RAINBOW_ART.name, 'rainbow');
    assert.match(src, /kit\.deco\(PIXI, a\.name, a\.x, FLOORS\.glare - a\.up/);
    assert.doesNotMatch(src, /const bands = \[/);
    assert.doesNotMatch(src, /rainbowY\(x\) \+ 6 \+ i \* 9/);
    assert.ok(existsSync(join(root, 'public/assets/decos/groddle/rainbow.webp')));
    const row = decoPlan().get('rainbow');
    assert.equal(row.mode, 'swf');
    assert.equal(row.swf, 'bundle:groddle1.swf#rainbow');
  });

  it('keeps the arch you walk on under the art and the EXIT under the arch', () => {
    const plan = decoPlan().get('rainbow');
    const [fw, fh] = plan.size2;
    const left = RAINBOW_ART.x;
    const right = left + fw * RAINBOW_ART.scale;
    const top = FLOORS.glare - RAINBOW_ART.up;
    // The walking line runs from x 200 to 900, inside the art's width and below its top edge.
    assert.ok(left < 200 && right > 900, `${left}..${right}`);
    for (let x = 200; x <= 900; x += 50) assert.ok(rainbowY(x) >= top, `x ${x}`);
    // Its crown is the top of the bands: within the art's top 30 px.
    assert.ok(rainbowY(550) - top < 30);
    assert.ok(top + fh * RAINBOW_ART.scale > FLOORS.glare - 80);
    const { door } = radiantLayout();
    assert.ok(door.x > left && door.x < right);
  });
});

describe('Le Voyage Violet: the CC0 washing and moon', () => {
  it('hangs the six recovered garments on the recovered line', () => {
    const plan = decoPlan();
    assert.deepEqual(WASHING, [1, 2, 3, 4, 5, 6].map((n) => `hanging_clothes_${n}`));
    for (const name of WASHING) {
      assert.ok(existsSync(join(root, `public/assets/decos/groddle/${name}.webp`)), name);
      assert.equal(plan.get(name).swf, `bundle:abbasid1.swf#${name}`);
    }
    assert.equal(WASHING_LINE, 'hanging_clothes_line');
    assert.equal(plan.get(WASHING_LINE).swf, 'bundle:abbasid1.swf#hanging_clothes_line');
    assert.equal(MOON, 'moon');
    assert.equal(plan.get(MOON).swf, 'bundle:zutto1.swf#moon');
    for (const name of [WASHING_LINE, MOON]) assert.ok(existsSync(join(root, `public/assets/decos/groddle/${name}.webp`)), name);
  });

  it('no longer draws garments or the crescent', () => {
    const src = read('public/js/purple-journey-scene.js');
    for (const gone of ['function garment(', 'function crescent(', "kind === 'shirt'", 'quadraticCurveTo((x1 + x2) / 2']) {
      assert.ok(!src.includes(gone), gone);
    }
    assert.match(src, /deco\(PIXI, WASHING_LINE,/);
    assert.match(src, /deco\(PIXI, name,/);
    assert.match(src, /deco\(PIXI, MOON,/);
  });
});

describe('Le Voyage Violet: the floor from Uralia decos and two made pieces (G964)', () => {
  const src = read('public/js/purple-journey-scene.js');
  const plan = voyageGroundPlan();

  it('no longer draws the stumps, mushrooms, spiral stones or fronds as vectors', () => {
    for (const gone of ['function stump(', 'function mushroom(', 'function spiralStone(', 'function frond(', 'g.ellipse(0, -h, w / 2 + 3, 12)', 'Math.PI * 5']) {
      assert.ok(!src.includes(gone), gone);
    }
    // Only the peaks, the strands and the motes are still drawn.
    assert.equal((src.match(/new PIXI\.Graphics\(\)/g) || []).length, 3);
    assert.match(src, /for \(const p of voyageGroundPlan\(\)\) props\.addChild\(deco\(PIXI, p\.name,/);
  });

  it('puts Tiny Speck\'s zutto1.swf decos where Snap 81702 shows them, at sizes measured there', () => {
    const decos = decoPlan();
    const cc0 = [...VOYAGE_DECOS.mushrooms, ...VOYAGE_DECOS.fronds, VOYAGE_DECOS.fiddlehead, VOYAGE_DECOS.ghost, VOYAGE_DECOS.owl, ...VOYAGE_DECOS.ferns];
    assert.deepEqual(cc0, ['tree_14', 'tree_15', 'tree_13', 'tree_11', 'zutto_tree_2', 'plant_fern_1', 'creature_purple', 'owl_1', 'ground_plant_1', 'ground_plant_2']);
    for (const name of cc0) {
      assert.equal(decos.get(name).swf, `bundle:zutto1.swf#${name}`, name);
      assert.ok(existsSync(join(root, `public/assets/decos/groddle/${name}.webp`)), name);
    }
    const kinds = new Set(plan.map((p) => p.kind));
    assert.deepEqual([...kinds].sort(), ['fiddlehead', 'frond', 'ghost', 'mushroom', 'stone', 'stump']);
    for (const p of plan) {
      assert.ok(p.x > 0 && p.x < VOYAGE_W, `${p.name} at ${p.x}`);
      if (!p.name.startsWith('gz_')) assert.ok(cc0.includes(p.name), p.name);
    }
    // The red umbrella mushroom about 180 units tall (tree_14's drawn rows 363 px at scale 0.5).
    assert.ok(plan.filter((p) => p.name === 'tree_14').every((p) => Math.abs(363 * p.scale - 180) < 12));
    // Drawn back to front: stumps behind the ghost, the ghost behind the stones, the mushrooms in front of them.
    const at = (kind) => plan.findIndex((p) => p.kind === kind);
    assert.ok(at('stump') < at('ghost') && at('ghost') < at('stone') && at('stone') < at('mushroom'));
    // The arrival point stays open.
    assert.ok(plan.every((p) => Math.abs(p.x - 1600) > 140));
    assert.ok(VOYAGE_OWL.scale > 0.9 && VOYAGE_OWL.scale < 1.2);
  });

  it('draws the made stump 220-300 tall and the made stone 120-150 wide, each with its provenance', () => {
    const made = JSON.parse(read('tools/provenance/made-decos.json')).art;
    const stumps = plan.filter((p) => p.name === VOYAGE_STUMP);
    const stones = plan.filter((p) => p.name === VOYAGE_STONE);
    assert.ok(stumps.length >= 3 && stones.length >= 3);
    assert.ok(stumps.some((p) => p.flip) && stones.some((p) => p.flip));
    for (const p of stumps) assert.ok(made[VOYAGE_STUMP].h * 2 * p.scale >= 220 && made[VOYAGE_STUMP].h * 2 * p.scale <= 300, `stump ${p.x}`);
    for (const p of stones) assert.ok(made[VOYAGE_STONE].w * 2 * p.scale >= 120 && made[VOYAGE_STONE].w * 2 * p.scale <= 150, `stone ${p.x}`);
    for (const name of [VOYAGE_STUMP, VOYAGE_STONE]) {
      const row = made[name];
      assert.ok(row, `${name}: provenance`);
      assert.equal(row.code, 'public/js/purple-journey-scene.js');
      assert.equal(row.scene, 'purple_journey');
      assert.equal(row.licence, 'ai-generated');
      assert.equal(createHash('sha256').update(readFileSync(join(root, row.file))).digest('hex'), row.sha256);
      assert.equal(row.inputFiles.length, 5);
      assert.ok(row.inputs.some((i) => i.startsWith('ref:')) && row.inputFiles.slice(1, 4).every((f) => /reference only/.test(f.source)));
      assert.match(row.prompt, /^Draw piece [AB] from attachment 1/);
      assert.match(row.reimagined, /made art/);
    }
    // B came back 1.38:1 and is squeezed to 1.25:1 (drop/model.txt).
    assert.equal(made[VOYAGE_STONE].w / made[VOYAGE_STONE].h, 1.25);
    assert.ok(Math.abs(made[VOYAGE_STUMP].h / made[VOYAGE_STUMP].w - 2.22) < 0.05);
  });

  it('washes the floor violet but keeps a little of its own colour', () => {
    assert.ok(FLOOR_WASH > 0.5 && FLOOR_WASH < 1);
    assert.deepEqual(violetMatrix(0), [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    assert.equal(violetMatrix(1)[0], 0.264);
    assert.match(src, /violetWash\(PIXI, props, FLOOR_WASH\)/);
    assert.equal(VOYAGE_FLOOR, 939);
  });
});

describe('Esquibeth grottos: the CC0 glyphs', () => {
  const plan = JSON.parse(read('tools/esquibeth-art/plan.json'));

  it('ships every piece rendered from esquibeth1.swf, as the plan records it', () => {
    assert.equal(plan.bundle, 'esquibeth1.swf');
    const names = plan.pieces.map((r) => r.name);
    for (const g of ['spriggan', 'cosma', 'pot']) {
      assert.ok(names.includes(`esquibeth_glyph_${g}_01a`), g);
      assert.ok(names.includes(`esquibeth_glyph_${g}_glow_01a`), `${g} glow`);
    }
    for (const s of ['01a', '01b', '01c']) assert.ok(names.includes(`esquibeth_glyph_sheetmusiclines_${s}`));
    for (const d of 'abcde') assert.ok(names.includes(`esquibeth_glyph_dot_01${d}`));
    for (const r of plan.pieces) {
      assert.equal(r.source, `bundle:esquibeth1.swf#${r.name}`);
      const file = join(root, 'public', r.file);
      assert.ok(existsSync(file), r.file);
      assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16), r.webp, r.file);
      assert.match(r.file, /^assets\/sprites\/quest-rooms\/esquibeth\/glyph_[a-z0-9_]+@3x\.webp$/);
      assert.deepEqual(ESQUIBETH_ART[r.name.replace('esquibeth_', '')], { file: r.file, w: r.w, h: r.h, stage: r.stage, trim: r.trim });
    }
  });

  it('puts Spriggan, Cosma and Pot in the three grottos, one carved socket per note found there', () => {
    const want = { waterfall_01: ['spriggan', '01a'], waterfall_02: ['cosma', '01b'], waterfall_03: ['pot', '01c'] };
    for (const [stage, [name, staff]] of Object.entries(want)) {
      const L = esq.stageLayout(stage);
      assert.equal(L.glyph.name, name);
      assert.equal(L.glyph.staff, staff);
      const P = esq.glyphPlacement(stage);
      const notes = L.notes.map((n) => n.n).sort();
      assert.deepEqual(Object.keys(ESQUIBETH_GLYPHS[name].sockets).map(Number), notes);
      assert.deepEqual(Object.keys(P.sockets).map(Number), notes);
      // Every socket is on the glyph's art, and the glow covers the glyph.
      for (const at of Object.values(P.sockets)) {
        assert.ok(at.x > P.glyph.x && at.x < P.glyph.x + P.glyph.w && at.y > P.glyph.y && at.y < P.glyph.y + P.glyph.h);
      }
      assert.ok(Math.abs((P.glow.x + P.glow.w / 2) - (P.glyph.x + P.glyph.w / 2)) < 10);
      // The staff stands over the glyph; the song's marks are on it.
      assert.ok(P.staff.y < P.glyph.y && P.staff.y + P.staff.h > P.glyph.y - 2);
      assert.ok(ESQUIBETH_STAFFS[staff].length >= esq.SONGS[stage].length);
      for (const m of P.marks) assert.ok(m.x >= P.staff.x && m.x <= P.staff.x + P.staff.w);
      for (const n of esq.SONGS[stage]) assert.ok(esq.noteDot(n), `dot ${n}`);
    }
    assert.deepEqual(plan.staffs['01a'].length, 4);
    assert.deepEqual(plan.staffs['01c'].length, 11);
  });

  it('no longer draws made-up glyphs or a stone arch', () => {
    const src = read('public/js/quest-rooms/esquibeth.js');
    for (const gone of ['function drawGlyph(', "'grendaline'", "symbol: 'eye'", "symbol: 'bowl'", 'stone.quadraticCurveTo', 'socketOffsets(', 'STAFF_RADIUS']) {
      assert.ok(!src.includes(gone), gone);
    }
    assert.match(src, /d\.glyphLit = artSprite\(PIXI, place\.glow\)/);
    assert.match(src, /world\.addChild\(artSprite\(PIXI, place\.glyph\)\)/);
  });
});

describe('Walk Toward the Light and Radiant Glare: grey avatars', () => {
  it('both rooms carry the client middleground saturation filter, and no other room does', () => {
    for (const r of [lightRoom, glareRoom]) assert.deepEqual(r.avatarFilters, { saturation: -100 });
    const dir = join(root, 'public/js/quest-rooms');
    const withFilter = readdirSync(dir).filter((f) => f.endsWith('.js') && /avatarFilters:/.test(read(`public/js/quest-rooms/${f}`))).sort();
    assert.deepEqual(withFilter, ['light-perspective.js', 'radiant-glare.js']);
  });

  it('saturation -100 is pure grey: every colour channel reads the same luminance', () => {
    const m = glitchLayerMatrix({ saturation: -100 });
    const rows = [m.slice(0, 5), m.slice(5, 10), m.slice(10, 15)];
    for (const row of rows) {
      assert.deepEqual(row.map((v) => v.toFixed(4)), rows[0].map((v) => v.toFixed(4)));
      assert.ok(Math.abs(row[0] + row[1] + row[2] - 1) < 1e-6);
      assert.equal(row[4], 0);
    }
    assert.deepEqual(m.slice(15), [0, 0, 0, 1, 0]);
  });

  it('applies the filter to you and to other players only while in such a room', () => {
    const game = read('public/game.js');
    // Cleared on every location change, set again by a scene that names it.
    assert.match(game, /function clearWorldEntities\([^)]*\) \{[^]*?if \(entityLayer\) entityLayer\.filters = null;\n  setAvatarTone\(null\);/);
    assert.match(game, /enterScene\(scene\) \{\n(?:    \/\/[^\n]*\n)?    clearWorldEntities\([^)]*\);\n    if \(scene\.avatarFilters\) setAvatarTone\(scene\.avatarFilters\);/);
    assert.match(game, /get avatarTone\(\) \{\n    return avatarTone;/);
    // Your Glitch keeps its other filters (An Autumn Day's silhouette) beside it.
    assert.match(game, /player\.filters = \[\.\.\.\(player\.filters \|\| \[\]\), avatarTone\]/);
    const qi = read('public/js/features/quest-instances-feature.js');
    assert.match(qi, /avatarFilters: scene\.avatarFilters \?\? room\.avatarFilters \?\? null,/);
    // Other players: their Glitch, not their name plate.
    const rt = read('public/js/features/realtime-feature.js');
    assert.match(rt, /const tone = engine\.avatarTone \|\| null;\n\s+if \(\(r\.body\.filters\?\.\[0\] \|\| null\) !== tone\) r\.body\.filters = tone \? \[tone\] : null;/);
  });
});
