/**
 * Speech bubble placement (register G214): the class offsets, the client's
 * push over the speaker, and art heights for animals, trees and Icons.
 * Run: node --test tests/speech-placement.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ART_HEIGHT_CLASS,
  SPEECH_OFFSETS,
  SPEECH_PUSH_LIMIT,
  STREET_SPIRIT_SPEECH_OFFSET,
  artHeightOf,
  firstOpaqueRow,
  giveArtHeight,
  opaqueTopOf,
  placeSpeechTip,
  speechOffsetFor,
} from '../public/js/speech-placement.js?v=g214-1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const CLIENT = join(ROOT, '../glitch-client/com/tinyspeck/engine');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** A fake frame: `rows` empty rows on top, then opaque ones. */
function frame(w, h, emptyRows) {
  const alpha = new Uint8Array(w * h);
  for (let y = emptyRows; y < h; y++) alpha[y * w + Math.floor(w / 2)] = 255;
  return { alpha, w, h };
}

describe('conversation offsets (GameServerJS classProps)', () => {
  it('match conversation_offset_x / _y in every listed class', { skip: !existsSync(GSJS) && 'no GSJS checkout' }, () => {
    const prop = (src, name) => Number(src.match(new RegExp(`"${name}"\\s*:\\s*"(-?\\d+)"`))?.[1] || 0);
    for (const [cls, off] of Object.entries(SPEECH_OFFSETS)) {
      const src = readFileSync(join(GSJS, 'items', `${cls}.js`), 'utf8');
      assert.deepEqual({ x: off.x, y: off.y }, { x: prop(src, 'conversation_offset_x'), y: prop(src, 'conversation_offset_y') }, cls);
    }
    // Every Street Spirit class: 0 / 60.
    const spirits = readdirSync(join(GSJS, 'items')).filter((f) => /^street_spirit(_\w+)?\.js$/.test(f));
    assert.ok(spirits.length >= 5);
    for (const f of spirits) {
      const src = readFileSync(join(GSJS, 'items', f), 'utf8');
      assert.equal(prop(src, 'conversation_offset_x'), STREET_SPIRIT_SPEECH_OFFSET.x, f);
      assert.equal(prop(src, 'conversation_offset_y'), STREET_SPIRIT_SPEECH_OFFSET.y, f);
    }
    // sendBubble sends them with every itemstack bubble (item.js 578-579).
    const item = readFileSync(join(GSJS, 'items/item.js'), 'utf8');
    assert.match(item, /if \(this\.classProps\.conversation_offset_y\) rsp\.offset_y = intval\(this\.classProps\.conversation_offset_y\);/);
  });

  it('a feature\'s own offset wins over the class; unknown classes are 0 / 0', () => {
    assert.deepEqual(speechOffsetFor({ classId: 'npc_piggy' }), { x: 0, y: -22 });
    assert.deepEqual(speechOffsetFor({ classId: 'vendor_x', speechOffset: STREET_SPIRIT_SPEECH_OFFSET }), { x: 0, y: 60 });
    assert.deepEqual(speechOffsetFor({ classId: 'trant_bean' }), { x: 0, y: 0 });
    assert.deepEqual(speechOffsetFor(null), { x: 0, y: 0 });
  });

  it('the client moved the bubble by them and pushed it down at most 120 px', { skip: !existsSync(CLIENT) && 'no client checkout' }, () => {
    const lis = readFileSync(join(CLIENT, 'view/itemstack/LisChatBubbleManager.as'), 'utf8');
    assert.match(lis, /_chat_bubble\.show\(send_msg, new Point\(0\+offset_x, chat_y\+offset_y\), extra_sp, 0, reverse_pointer\);/);
    assert.match(lis, /_chat_bubble\.keep_in_viewport_within_reason = true;/);
    const bubble = readFileSync(join(CLIENT, 'port/ChatBubble.as'), 'utf8');
    assert.match(bubble, /y-= Math\.max\(-120, reusable_rect\.y\);/);
    assert.equal(SPEECH_PUSH_LIMIT, 120);
  });
});

describe('placeSpeechTip', () => {
  // A view whose bubble tip may sit from y 140 (top) to 390 (bottom).
  const view = { minTip: 140, maxTip: 390 };

  it('room above: the tip over the art, offsets applied', () => {
    assert.deepEqual(placeSpeechTip({ ...view, want: 200, artTop: 212, feet: 300, below: 306, belowFits: false }), { tip: 200, flip: false });
  });

  it('the 244 px Firebog beside the player: its 60 px offset keeps the bubble above, unclamped', () => {
    const feet = 380;
    const artTop = feet - 244;
    const old = placeSpeechTip({ ...view, want: artTop - 12, artTop, feet, below: feet + 6, belowFits: false });
    assert.equal(old.tip, 140, 'without the offset it would be pushed down');
    const now = placeSpeechTip({ ...view, want: artTop - 12 + STREET_SPIRIT_SPEECH_OFFSET.y, artTop, feet, below: feet + 6, belowFits: false });
    assert.deepEqual(now, { tip: artTop + 48, flip: false });
  });

  it('pushed down over the speaker as far as 120 px while it points at the upper half of the art', () => {
    // A 200 px tree 100 px too high: pushed down, no flip.
    assert.deepEqual(placeSpeechTip({ ...view, want: 40, artTop: 52, feet: 252, below: 258, belowFits: true }), { tip: 140, flip: false });
  });

  it('a short speaker near the top hangs the bubble under its feet (G185) when the push would pass its middle', () => {
    assert.deepEqual(placeSpeechTip({ ...view, want: 60, artTop: 72, feet: 112, below: 118, belowFits: true }), { tip: 118, flip: true });
    // More than 120 px short: under the feet too.
    assert.deepEqual(placeSpeechTip({ ...view, want: 0, artTop: 12, feet: 400, below: 406, belowFits: true }), { tip: 406, flip: true });
    // No room below either: kept in view over the speaker.
    assert.deepEqual(placeSpeechTip({ ...view, want: 60, artTop: 72, feet: 112, below: 118, belowFits: false }), { tip: 140, flip: false });
  });

  it('never below the view', () => {
    assert.deepEqual(placeSpeechTip({ ...view, want: 500, artTop: 512, feet: 600, below: 606, belowFits: false }), { tip: 390, flip: false });
  });
});

describe('art heights', () => {
  it('firstOpaqueRow skips faint pixels and reads RGBA strides', () => {
    const f = frame(4, 6, 2);
    assert.equal(firstOpaqueRow(f.alpha, 4, 6), 2);
    assert.equal(firstOpaqueRow(new Uint8Array(12).fill(10), 4, 3), -1);
    const rgba = new Uint8Array(4 * 4 * 3);
    rgba[(2 * 4 + 1) * 4 + 3] = 200;
    assert.equal(firstOpaqueRow(rgba.subarray(3), 4, 3, 4), 2);
  });

  it('a sprite\'s art height is its frame\'s opaque top above the anchor, scaled; the tallest frame of a clip', () => {
    const tex = (h, empty) => ({ frame: { width: 10, height: h }, orig: { height: h }, px: frame(10, h, empty) });
    const readFake = (t) => t.px;
    const a = tex(110, 40);
    const b = tex(110, 30);
    // Bottom anchor: 110 - 40 = 70 px of art, x 0.5.
    assert.equal(artHeightOf({ texture: a, anchor: { y: 1 }, scale: { y: 0.5 } }, readFake), 35);
    // Animated: the tallest frame (80), flipped sprites use |scale|.
    assert.equal(artHeightOf({ textures: [a, b], anchor: { y: 1 }, scale: { y: -1 } }, readFake), 80);
    // Centre anchor (a flying butterfly): half the frame, less the empty top.
    assert.equal(artHeightOf({ texture: tex(100, 20), anchor: { y: 0.5 }, scale: { y: 1 } }, readFake), 30);
    // Not loaded yet: 0, and nothing cached.
    const late = { frame: { width: 10, height: 50 }, orig: { height: 50 } };
    assert.equal(artHeightOf({ texture: late, anchor: { y: 1 }, scale: { y: 1 } }, () => null), 0);
    assert.equal(opaqueTopOf(late, () => frame(10, 50, 5)), 5);
  });

  it('animals, trees and Icons get one; Street Spirits and everything else keep theirs', () => {
    for (const cls of ['npc_piggy', 'npc_chicken', 'npc_butterfly', 'npc_batterfly', 'trant_fruit', 'trant_bean', 'wood_tree', 'icon_alph', 'icon_tii']) assert.ok(ART_HEIGHT_CLASS.test(cls), cls);
    for (const cls of ['rock_beryl_1', 'npc_shrine_alph', 'street_spirit_firebog', 'vendor_kitchen', 'npc_piggy_explorer']) assert.ok(!ART_HEIGHT_CLASS.test(cls), cls);
    const tex = { frame: { width: 10, height: 60 }, orig: { height: 60 }, px: frame(10, 60, 10) };
    const pig = giveArtHeight({ classId: 'npc_piggy', sprite: { texture: tex, anchor: { y: 1 }, scale: { y: 2 } } }, (t) => t.px);
    assert.equal(pig.artHeight, 100);
    pig.sprite.scale.y = 1;
    assert.equal(pig.artHeight, 50, 'read live');
    pig.artHeight = 7;
    assert.equal(pig.artHeight, 7, 'a feature can still set one');
    const rock = giveArtHeight({ classId: 'rock_beryl_1', sprite: {} });
    assert.equal('artHeight' in rock, false);
  });
});

describe('wiring', () => {
  it('game.js places every bubble through the module and gives registered targets art heights', () => {
    const game = read('public/game.js');
    assert.match(game, /import \{ giveArtHeight, placeSpeechTip, speechOffsetFor \} from '\.\/js\/speech-placement\.js\?v=[\w-]+';/);
    assert.match(game, /function register\(target\) \{\n[^\n]*\n  giveArtHeight\(target\);\n  interactables\.push\(target\);/);
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    assert.match(fn, /const offset = speechOffsetFor\(meta\.target\);\n  bubble\.x = clampWorldOverlayX\(spr\.x \+ offset\.x, meta\.width, 12\);/);
    assert.match(fn, /want: spr\.y - spriteHeight - 12 \+ offset\.y,/);
    assert.match(fn, /dataset\.speechArt = /);
  });

  it('a dressed Street Spirit takes the spirits\' 0 / 60 under the same module key', () => {
    const feature = read('public/js/features/street-spirits-feature.js');
    assert.match(feature, /target\.artHeight = h - 2;\n[\s\S]{0,300}target\.speechOffset = STREET_SPIRIT_SPEECH_OFFSET;/);
    const key = (src) => src.match(/speech-placement\.js\?v=([\w-]+)'/)?.[1];
    assert.equal(key(feature), key(read('public/game.js')));
    assert.equal(key(read('tests/speech-placement.test.js')), key(read('public/game.js')));
  });
});
