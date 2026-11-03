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

import { FLOORS, RAINBOW_ART, radiantLayout, rainbowY, room as glareRoom } from '../public/js/quest-rooms/radiant-glare.js?v=28231178';
import { room as lightRoom } from '../public/js/quest-rooms/light-perspective.js?v=d293d41d';
import { glitchLayerMatrix } from '../public/js/street-render.js?v=9349c0e5';
import { MOON, WASHING, WASHING_LINE } from '../public/js/purple-journey-scene.js?v=7e3a5b5d';
import * as esq from '../public/js/quest-rooms/esquibeth.js?v=22da8016';
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
    assert.match(game, /function clearWorldEntities\(\) \{[^]*?if \(entityLayer\) entityLayer\.filters = null;\n  setAvatarTone\(null\);/);
    assert.match(game, /enterScene\(scene\) \{\n    clearWorldEntities\(\);\n    if \(scene\.avatarFilters\) setAvatarTone\(scene\.avatarFilters\);/);
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
