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
  SPEECH_HUD_MARGIN,
  SPEECH_TAIL_HEIGHT,
  SPEECH_OFFSETS,
  SPEECH_EDGE_LIMIT,
  SPEECH_PUSH_LIMIT,
  limitSpeechShift,
  limitSpeechTip,
  SPEECH_BUBBLE_RADIUS,
  SPEECH_TAIL_HALF,
  SPEECH_TAIL_TIP_INSET,
  STREET_SPIRIT_SPEECH_OFFSET,
  artHeightOf,
  clearSpeechOfBox,
  firstOpaqueRow,
  giveArtHeight,
  opaqueTopOf,
  placeSpeechTail,
  placeSpeechTip,
  speechBubbleRect,
  speechOffsetFor,
  slideOffAvatars,
  speechBubbleOutline,
  speechTailPoints,
  SPEECH_SLIDE_LIMIT,
  SPEECH_HOLD_MARGIN,
  SPEECH_HOLD_MS,
  SPEECH_SHORT_SPEAKER,
  deepestSpeechTip,
  holdSpeechSide,
  speechTipOnSide,
  texelsPerUnit,
} from '../public/js/speech-placement.js?v=09802fc5';

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

describe('a speaker out of view keeps its bubble (G242, ChatBubble.as keepInBounds)', () => {
  it('slides a bubble in from the side by at most 100 px', () => {
    assert.equal(SPEECH_EDGE_LIMIT, 100);
    // In view, or near the edge: wholly in view, as before.
    assert.deepEqual(limitSpeechShift(500, 500), { x: 500, far: false });
    assert.deepEqual(limitSpeechShift(1000, 900), { x: 900, far: false });
    assert.deepEqual(limitSpeechShift(-40, 60), { x: 60, far: false });
    // Further off: 100 px toward the view, and no more.
    assert.deepEqual(limitSpeechShift(1400, 900), { x: 1300, far: true });
    assert.deepEqual(limitSpeechShift(-600, 80), { x: -500, far: true });
  });

  it('pushes a bubble down at most 120 px and never pulls one up', () => {
    // Pushed 80 px: kept.
    assert.deepEqual(limitSpeechTip({ tip: 140, flip: false }, 60), { tip: 140, flip: false, far: false });
    // A speaker 400 px above the view: 120 px, not into view.
    assert.deepEqual(limitSpeechTip({ tip: 140, flip: false }, -260), { tip: -140, flip: false, far: true });
    // A speaker under the view: its bubble stays with it.
    assert.deepEqual(limitSpeechTip({ tip: 390, flip: false }, 500), { tip: 500, flip: false, far: true });
    // Hung under the feet (the remake's own, G185): left alone.
    assert.deepEqual(limitSpeechTip({ tip: 118, flip: true }, 60), { tip: 118, flip: true, far: false });
  });

  it('the client limits are these', { skip: !existsSync(CLIENT) && 'no client checkout' }, () => {
    const bubble = readFileSync(join(CLIENT, 'port/ChatBubble.as'), 'utf8');
    assert.match(bubble, /if \(adj_x && keep_in_viewport_within_reason\) \{\s+var adj_x_limit:int = 100;/);
    assert.match(bubble, /if \(!keep_in_viewport_within_reason && pt\.y - reusable_rect\.height > max_y\)\{/);
    const ava = readFileSync(join(CLIENT, 'view/avatar/AvaChatBubbleManager.as'), 'utf8');
    assert.match(ava, /_currentChatBubble\.keep_in_viewport_within_reason = true;/);
  });

  it('game.js applies both, and clears or slides nothing for a bubble out of view', () => {
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function drawSpeechBubble'));
    assert.match(fn, /const shift = limitSpeechShift\(spr\.x \+ offset\.x, clampWorldOverlayX\(spr\.x \+ offset\.x, meta\.width, 12\)\);/);
    assert.match(fn, /const reach = limitSpeechTip\(place, want\);/);
    assert.match(fn, /const outOfView = shift\.far \|\| reach\.far;/);
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

describe('placeSpeechTail (G233)', () => {
  it('unclamped: the tail sits in the middle', () => {
    assert.deepEqual(placeSpeechTail({ bubbleX: 500, width: 200, speakerX: 500 }), { tip: 100, base: 100 });
  });

  it('slid in from the right edge: the tip stays over the speaker', () => {
    // A chicken 40 px right of the clamped bubble's centre.
    assert.deepEqual(placeSpeechTail({ bubbleX: 600, width: 200, speakerX: 640 }), { tip: 140, base: 140 });
    // From the left edge too.
    assert.deepEqual(placeSpeechTail({ bubbleX: 112, width: 200, speakerX: 60 }), { tip: 48, base: 48 });
  });

  it('near an end the base stops short of the rounded corner and the tail leans out toward the speaker', () => {
    const edge = SPEECH_BUBBLE_RADIUS + SPEECH_TAIL_HALF;
    const right = placeSpeechTail({ bubbleX: 600, width: 200, speakerX: 690 });
    assert.deepEqual(right, { tip: 190, base: 200 - edge });
    assert.ok(right.tip > right.base, 'leans right');
    const left = placeSpeechTail({ bubbleX: 112, width: 200, speakerX: 15 });
    assert.deepEqual(left, { tip: SPEECH_TAIL_TIP_INSET, base: edge });
  });

  it('a speaker past the bubble\'s end: the tip stops 10 px in (ChatBubble.as 175-176, 189-191)', () => {
    assert.deepEqual(placeSpeechTail({ bubbleX: 600, width: 200, speakerX: 900 }), { tip: 200 - SPEECH_TAIL_TIP_INSET, base: 200 - SPEECH_BUBBLE_RADIUS - SPEECH_TAIL_HALF });
    assert.deepEqual(placeSpeechTail({ bubbleX: 600, width: 200, speakerX: -900 }), { tip: SPEECH_TAIL_TIP_INSET, base: SPEECH_BUBBLE_RADIUS + SPEECH_TAIL_HALF });
  });

  it('bad input keeps the middle', () => {
    assert.deepEqual(placeSpeechTail({ bubbleX: 600, width: 156, speakerX: NaN }), { tip: 78, base: 78 });
  });

  it('the client slid the pointer back by the bubble\'s shift and flipped it at the right end', { skip: !existsSync(CLIENT) && 'no client checkout' }, () => {
    const bubble = readFileSync(join(CLIENT, 'port/ChatBubble.as'), 'utf8');
    assert.match(bubble, /var min_x_pointer:int = -\(\(reusable_rect\.width\/2\)-10\);/);
    assert.match(bubble, /_talk_bubble_pointer\.x\+= adj_x;/);
    assert.match(bubble, /_talk_bubble_pointer\.scaleX = -1;\n\s*_talk_bubble_pointer\.x = max_x_pointer\+_talk_bubble_pointer_w;/);
    assert.equal(SPEECH_TAIL_TIP_INSET, 10);
  });

  it('speechBubbleOutline: body and tail as one closed path, the tail on the bottom edge or the top', () => {
    const down = speechBubbleOutline({ width: 200, height: 60, tip: 140, base: 130 });
    assert.deepEqual(down[0], ['moveTo', SPEECH_BUBBLE_RADIUS, 0]);
    assert.deepEqual(down.at(-1), ['closePath']);
    const wedge = (steps) => steps.filter(([op]) => op === 'lineTo').map(([, x, y]) => `${x},${y}`);
    assert.ok(wedge(down).join(' ').includes(`${130 + SPEECH_TAIL_HALF},60 140,71 ${130 - SPEECH_TAIL_HALF},60`));
    const up = speechBubbleOutline({ width: 200, height: 60, tip: 78, base: 78, up: true });
    assert.ok(wedge(up).join(' ').startsWith(`${78 - SPEECH_TAIL_HALF},0 78,-11 ${78 + SPEECH_TAIL_HALF},0`));
    assert.ok(!wedge(up).some((p) => p.endsWith(',71')));
    assert.equal(down.filter(([op]) => op === 'arcTo').length, 4);
  });

  it('speechTailPoints: the down wedge under the bubble, the up wedge over it, both over the border', () => {
    assert.deepEqual(speechTailPoints({ height: 60, tip: 140, base: 130 }), {
      fill: [121, 58, 140, 71, 139, 58],
      edge: [121, 60, 140, 71, 139, 60],
    });
    assert.deepEqual(speechTailPoints({ height: 60, tip: 78, base: 78, up: true }), {
      fill: [69, 2, 78, -11, 87, 2],
      edge: [69, 0, 78, -11, 87, 0],
    });
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
    assert.match(game, /import \{ SPEECH_HOLD_MARGIN, clearSpeechOfBox, deepestSpeechTip, giveArtHeight, holdSpeechSide, hudColumnBox, limitSpeechShift, limitSpeechTip, placeSpeechTail, placeSpeechTip, slideOffAvatars, speechBubbleOutline, speechOffsetFor, speechTipOnSide \} from '\.\/js\/speech-placement\.js\?v=[\w-]+';/);
    assert.match(game, /function register\(target\) \{\n[^\n]*\n  giveArtHeight\(target\);\n  interactables\.push\(target\);/);
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    assert.match(fn, /const offset = speechOffsetFor\(meta\.target\);\n[^\n]*\n[^\n]*\n  const shift = limitSpeechShift\(spr\.x \+ offset\.x, clampWorldOverlayX\(spr\.x \+ offset\.x, meta\.width, 12\)\);\n  bubble\.x = shift\.x;/);
    assert.match(fn, /const want = spr\.y - spriteHeight - 12 \+ offset\.y;/);
    assert.match(fn, /dataset\.speechArt = /);
    // G233: the tail is aimed at the speaker the bubble was meant to centre on.
    assert.match(fn, /const speakerX = spr\.x \+ offset\.x;/);
    assert.match(fn, /placeSpeechTail\(\{ bubbleX: bubble\.x, width: meta\.width, speakerX \}\)/);
    // G427: the tail is the client's one length (ChatBubble.as 374-379), never stretched.
    // One outline for body and tail (Austin 2026-10-29: a separate tail seemed to fade on its own).
    assert.match(fn, /drawSpeechBubble\(meta\.bg, meta\.width, meta\.height, tail, flip\);/);
    assert.doesNotMatch(game, /tailDown|tailUp|drawSpeechTail/);
    assert.match(fn, /bubble\.pivot\.y = flip \? -11 : meta\.height \+ 11;/);
    assert.doesNotMatch(fn, /lift/);
  });

  it('a dressed Street Spirit takes the spirits\' 0 / 60 under the same module key', () => {
    const feature = read('public/js/features/street-spirits-feature.js');
    assert.match(feature, /target\.artHeight = h - 2;\n[\s\S]{0,300}target\.speechOffset = STREET_SPIRIT_SPEECH_OFFSET;/);
    const key = (src) => src.match(/speech-placement\.js\?v=([\w-]+)'/)?.[1];
    assert.equal(key(feature), key(read('public/game.js')));
    assert.equal(key(read('tests/speech-placement.test.js')), key(read('public/game.js')));
  });
});

describe('bubbles keep clear of the activity feed column (G269)', () => {
  // The 700 px case from lane G256: feed popups 427 view px wide from x 14, two lines down to y 210.
  const feed = { left: 14, right: 441, top: 48, bottom: 210 };
  const base = { width: 220, height: 80, viewWidth: 948, viewBottom: 390 };
  const clearOf = (rect, box) => rect.right + SPEECH_HUD_MARGIN <= box.left || rect.left - SPEECH_HUD_MARGIN >= box.right
    || rect.bottom + SPEECH_HUD_MARGIN <= box.top || rect.top - SPEECH_HUD_MARGIN >= box.bottom;

  it('leaves a bubble that is already clear alone', () => {
    assert.equal(clearSpeechOfBox({ ...base, left: 500, tip: 200, speakerX: 600, feet: 300, box: feed }), null);
    assert.equal(clearSpeechOfBox({ ...base, left: 100, tip: 200, speakerX: 200, feet: 300, box: null }), null);
  });

  it('slides beside the column when the tail can still reach the speaker', () => {
    const out = clearSpeechOfBox({ ...base, left: 300, tip: 200, speakerX: 470, feet: 280, box: feed });
    assert.equal(out.how, 'beside');
    const rect = speechBubbleRect({ ...base, left: 300 + out.dx, tip: out.tip, flip: out.flip });
    assert.ok(clearOf(rect, feed));
    assert.ok(470 >= rect.left + 10 && 470 <= rect.right - 10);
  });

  it('drops below the column for a speaker under it, tip still above the feet', () => {
    const out = clearSpeechOfBox({ ...base, left: 100, tip: 200, speakerX: 200, feet: 340, box: feed });
    assert.equal(out.how, 'below');
    assert.equal(out.dx, 0);
    assert.equal(out.tip, feed.bottom + SPEECH_HUD_MARGIN + base.height + SPEECH_TAIL_HEIGHT);
    assert.ok(out.tip <= 340);
    assert.ok(clearOf(speechBubbleRect({ ...base, left: 100, tip: out.tip }), feed));
  });

  it('hangs under the feet when the tip would have to point below them', () => {
    const out = clearSpeechOfBox({ ...base, left: 100, tip: 200, speakerX: 200, feet: 240, box: feed });
    assert.equal(out.how, 'under');
    assert.equal(out.flip, true);
    assert.ok(clearOf(speechBubbleRect({ ...base, left: 100, tip: out.tip, flip: true }), feed));
  });

  it('stays put, marked over, when nothing fits (a phone view the column fills)', () => {
    const phone = { left: 10, right: 700, top: 36, bottom: 360 };
    const out = clearSpeechOfBox({ ...base, left: 300, tip: 300, speakerX: 400, feet: 330, box: phone });
    assert.deepEqual(out, { dx: 0, tip: 300, flip: false, how: 'over' });
  });

  it('clears at 700, 1280 and 1600 px wide (feed popups up to two wrapped lines)', () => {
    for (const viewWidth of [948, 960]) {
      for (const box of [{ left: 10, right: 690, top: 36, bottom: 160 }, feed, { left: 14, right: 334, top: 48, bottom: 150 }]) {
        for (let speakerX = 20; speakerX < viewWidth - 20; speakerX += 37) {
          const left = Math.min(Math.max(12, speakerX - base.width / 2), viewWidth - 12 - base.width);
          const out = clearSpeechOfBox({ ...base, viewWidth, left, tip: 150, speakerX, feet: 330, box });
          const rect = speechBubbleRect({ ...base, left: left + (out?.dx || 0), tip: out ? out.tip : 150, flip: out?.flip });
          assert.notEqual(out?.how, 'over', `${viewWidth} ${box.right} ${speakerX}`);
          assert.ok(clearOf(rect, box), `${viewWidth} ${box.right} ${speakerX}`);
          assert.ok(rect.bottom <= base.viewBottom + 11);
        }
      }
    }
  });

  it('game.js asks it with the buff strip, then the notices and banner (NOTIFY zones), every placement', () => {
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    assert.match(game, /hudColumnBox\(\[document\.getElementById\('buff-strip'\)\]/);
    assert.match(game, /const clear = !outOfView && clearSpeechOfBox\(\{/);
    assert.match(game, /meta\.overHud = clear\?\.how === 'over';/);
    assert.match(game, /el\.toggleAttribute\('data-under-speech', over\)/);
    // The notices' stack and a banner (js/notify-view.js zoneBoxes): moved clear, or the notices fade under it.
    assert.match(game, /const clearZone = !outOfView && zone && clearSpeechOfBox\(\{/);
    assert.match(game, /meta\.overNotices = clearZone\?\.how === 'over';/);
    assert.match(game, /notifyView\?\.setUnderSpeech\(speechBubbles\.some\(\(b\) => b\._speechFx\?\.overNotices\)\);/);
    const css = readFileSync(join(ROOT, 'public/style.css'), 'utf8');
    assert.match(css, /\.buff-strip\[data-under-speech\] \{ opacity: 0\.18; \}/);
    assert.match(css, /\.notify-notices\[data-under-speech\] \{ opacity: 0\.18; \}/);
  });
});

describe('bubbles slide off players\' heads (G357 Austin 2026-10-27, G427 2026-10-29)', () => {
  // A 200 x 50 bubble over a short speaker at x 200 whose tail points at y 400; its body is 339-389.
  const bubble = { left: 100, width: 200, height: 50, tip: 400, speakerX: 200 };
  const player = { left: 220, right: 260, top: 300, bottom: 450 };

  it('slides a bubble off the player beside a short speaker, the tail still on the speaker', () => {
    const out = slideOffAvatars({ ...bubble, avatars: [player] });
    assert.deepEqual(out, { dx: 220 - 6 - 200 - 100, covered: false });
    // The tail's tip stays inside the moved body, over the speaker.
    const tail = placeSpeechTail({ bubbleX: bubble.left + out.dx + 100, width: 200, speakerX: 200 });
    assert.equal(tail.tip, 200 - (bubble.left + out.dx));
  });

  it('takes the shorter way off, either side', () => {
    const left = { left: 140, right: 180, top: 300, bottom: 450 };
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [left] }), { dx: 180 + 6 - 100, covered: false });
  });

  it('leaves alone a bubble that covers nobody, or a head below its body', () => {
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [] }), { dx: 0, covered: false });
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [{ left: 400, right: 460, top: 300, bottom: 450 }] }), { dx: 0, covered: false });
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [{ left: 160, right: 220, top: 395, bottom: 450 }] }), { dx: 0, covered: false });
  });

  it('slides at most 100 px (ChatBubble.as adj_x_limit), stays in view, and keeps its tail on the speaker', () => {
    assert.equal(SPEECH_SLIDE_LIMIT, 100);
    const wide = { ...bubble, left: 50, width: 300 };
    const close = { left: 205, right: 245, top: 300, bottom: 450 };
    assert.deepEqual(slideOffAvatars({ ...wide, avatars: [close] }), { dx: 0, covered: true });
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [player], minLeft: 50 }), { dx: 0, covered: true }, 'the view edge stops the 86 px slide left; right is 166');
    const narrow = { ...bubble, left: 170, width: 60 };
    assert.deepEqual(slideOffAvatars({ ...narrow, avatars: [{ left: 215, right: 255, top: 300, bottom: 450 }] }), { dx: 0, covered: true });
  });

  it('clears two heads at once or not at all', () => {
    const second = { left: 30, right: 90, top: 300, bottom: 450 };
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [player, second] }), { dx: 0, covered: true });
  });

  it('the tail is always the client\'s 11 px', () => {
    const p = speechTailPoints({ height: 50, tip: 100, base: 100 });
    assert.equal(p.fill[3], 50 + 11);
  });

  it('game.js slides tip-down bubbles, hangs a covered one under the feet, names only players and sizes a bubble to its line', () => {
    const game = read('public/game.js');
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    assert.match(fn, /const slideFor = \(p\) => \(p\.flip \|\| outOfView \? \{ dx: 0, covered: false \} : slideOffAvatars\(\{/);
    assert.match(fn, /const avatars = speechAvoidBoxes\(meta\.target\);\n/);
    assert.match(fn, /const belowSpare = cameraY \+ LOCATION_VIEW_H - 8 - \(below \+ 11 \+ meta\.height\);/);
    assert.match(fn, /if \(slide\.covered && belowSpare >= \(keep === false \? SPEECH_HOLD_MARGIN : 0\)\) place = \{ tip: below, flip: true \};/);
    const show = game.slice(game.indexOf('function showSpeechBubble'), game.indexOf('function speechSlugRow'));
    assert.match(show, /const named = target\.classId === 'pc_player' \|\| target\.classId === 'pc_remote';/);
    assert.match(show, /\+ 20, 60, 280\);/);
    assert.match(read('public/js/features/realtime-feature.js'), /speechAvoidTargets\(\) \{/);
  });
});

describe('bubbles hold their place (Austin 2026-11-01: a Bean Tree\'s bubble bounced; a pet Piggy\'s sat on it)', () => {
  const view = { minTip: 140, maxTip: 390 };

  it('the client held the anchor until the art moved more than 20 px (getYAboveDisplay)', { skip: !existsSync(CLIENT) && 'no client checkout' }, () => {
    const src = readFileSync(join(CLIENT, 'view/itemstack/LocationItemstackView.as'), 'utf8');
    assert.match(src, /const px_tolerance:int = 20;/);
    assert.match(src, /if\(gety_rect\.top - action_indicator_offset > px_tolerance \|\| action_indicator_offset - gety_rect\.top > px_tolerance\)\{/);
    assert.equal(SPEECH_HOLD_MARGIN, 24);
    assert.equal(SPEECH_HOLD_MS, 400);
  });

  it('a short speaker is never pushed into: the tip stays over its top, else the bubble hangs under its feet', () => {
    // A 60 px Piggy whose bubble would need a 70 px push: before, the tip went down to its middle (160).
    const pig = { artTop: 130, feet: 190, want: 70 };
    const deepest = deepestSpeechTip(pig);
    assert.equal(deepest, 134);
    assert.ok(190 - 130 < SPEECH_SHORT_SPEAKER);
    assert.deepEqual(placeSpeechTip({ ...view, ...pig, below: 196, belowFits: 40 }), { tip: 140, flip: false }, 'the old rule');
    assert.deepEqual(placeSpeechTip({ ...view, ...pig, below: 196, belowFits: 40, deepest }), { tip: 196, flip: true });
    // A 200 px tree keeps the client's push into its upper half.
    const tree = { artTop: 52, feet: 252, want: 40 };
    assert.equal(deepestSpeechTip(tree), 152);
    assert.deepEqual(placeSpeechTip({ ...view, ...tree, below: 258, belowFits: 40, deepest: deepestSpeechTip(tree) }), { tip: 140, flip: false });
    // A Street Spirit's own offset into its art is never "too deep".
    assert.equal(deepestSpeechTip({ artTop: 136, feet: 380, want: 184 }), 258);
    assert.equal(deepestSpeechTip({ artTop: 136, feet: 200, want: 184 }), 184);
  });

  it('a short speaker under the notices is not covered by a bubble moved below them', () => {
    const notices = { left: 300, right: 700, top: 20, bottom: 120 };
    const base = { width: 220, height: 90, viewWidth: 960, viewBottom: 390, left: 390, speakerX: 500 };
    // The Piggy's art 210-270: dropping the bubble below the notices would point at y 227, inside it.
    const old = clearSpeechOfBox({ ...base, tip: 190, feet: 270, box: notices });
    assert.equal(old.how, 'below', 'without deepest the old rule pointed into the Piggy');
    assert.equal(old.tip, 227);
    const out = clearSpeechOfBox({ ...base, tip: 190, feet: 270, deepest: 214, box: notices });
    assert.notEqual(out.how, 'below');
  });

  it('keeps its side while the fit sits on the edge: small camera or avatar moves never flip it', () => {
    // A tree whose push sits at the 120 px limit: one px either way flips the old rule.
    const tree = { artTop: 52, feet: 330, below: 336 };
    const at = (want, keep) => placeSpeechTip({ ...view, ...tree, want, belowFits: 30, keep });
    assert.equal(at(140 - 121, null).flip, true, 'a new bubble 1 px past the limit hangs under');
    assert.equal(at(140 - 119, null).flip, false);
    for (let d = -20; d <= 20; d += 1) {
      assert.equal(at(140 - 120 + d, false).flip, false, `held over, ${d}`);
      assert.equal(at(140 - 120 + d, true).flip, true, `held under, ${d}`);
    }
    // Missing by more than the margin, it asks to change.
    assert.equal(at(140 - 120 - 30, false).flip, true);
    // Held under while the room below shrinks by less than the margin, even where it would fit above now.
    assert.equal(placeSpeechTip({ ...view, ...tree, want: 140, belowFits: -20, keep: true }).flip, true);
    assert.equal(placeSpeechTip({ ...view, ...tree, want: 0, belowFits: -20, keep: true }).flip, true);
    assert.equal(placeSpeechTip({ ...view, ...tree, want: 0, belowFits: -30, keep: true }).flip, false);
  });

  it('a change of side waits 400 ms of asking and happens once a bubble unless forced', () => {
    const hold = { side: null, since: null, flips: 0 };
    assert.equal(holdSpeechSide(hold, false, 0), false);
    assert.equal(holdSpeechSide(hold, true, 100), false);
    assert.equal(holdSpeechSide(hold, false, 200), false, 'asked back: the wait starts over');
    assert.equal(holdSpeechSide(hold, true, 300), false);
    assert.equal(holdSpeechSide(hold, true, 650), false);
    assert.equal(holdSpeechSide(hold, true, 700), true);
    assert.equal(hold.flips, 1);
    // A second flip is refused however long it is asked for...
    assert.equal(holdSpeechSide(hold, false, 800), true);
    assert.equal(holdSpeechSide(hold, false, 5000), true);
    // ...unless the held side cannot be drawn.
    assert.equal(holdSpeechSide(hold, false, 5100, { forced: true }), false);
  });

  it('the held side\'s tip: under the feet, or over the speaker kept in view', () => {
    assert.deepEqual(speechTipOnSide(true, { ...view, want: 60, below: 226 }), { tip: 226, flip: true });
    assert.deepEqual(speechTipOnSide(false, { ...view, want: 60, below: 226 }), { tip: 140, flip: false });
    assert.deepEqual(speechTipOnSide(false, { ...view, want: 200, below: 226 }), { tip: 200, flip: false });
  });

  it('a slid bubble keeps its berth while a head moves a few px, and goes back once it is 24 px clear', () => {
    const bubble = { left: 100, width: 200, height: 50, tip: 400, speakerX: 200 };
    const head = (x) => ({ left: x, right: x + 40, top: 300, bottom: 450 });
    const first = slideOffAvatars({ ...bubble, avatars: [head(220)] });
    assert.deepEqual(first, { dx: -86, covered: false });
    // The head steps right, just clear of the centred bubble: a new bubble would sit at its edge;
    // the slid one comes back only as far as the head allows plus the gap, not onto it.
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [head(310)] }), { dx: 0, covered: false }, 'a new bubble');
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [head(310)], prefer: -86 }), { dx: 4, covered: false });
    // The head wandering a few px away leaves it put; coming closer moves it only as far as the gap needs.
    for (const x of [312, 316, 320, 326]) assert.equal(slideOffAvatars({ ...bubble, avatars: [head(x)], prefer: 4 }).dx, 4, `head at ${x}`);
    assert.equal(slideOffAvatars({ ...bubble, avatars: [head(308)], prefer: 4 }).dx, 2);
    // 24 px clear of it: back to the middle.
    assert.deepEqual(slideOffAvatars({ ...bubble, avatars: [head(340)], prefer: -86 }), { dx: 0, covered: false });
  });

  it('a bubble moved off the HUD keeps that way while the column grows or shrinks a few px', () => {
    const base = { width: 220, height: 80, viewWidth: 948, viewBottom: 390, left: 300, tip: 200, speakerX: 470, feet: 280 };
    const first = clearSpeechOfBox({ ...base, box: { left: 14, right: 441, top: 48, bottom: 210 } });
    assert.equal(first.how, 'beside');
    // The column shrinks to just clear of the bubble: it stays beside.
    const near = clearSpeechOfBox({ ...base, box: { left: 14, right: 294, top: 48, bottom: 210 }, prefer: first });
    assert.equal(near?.how, 'beside');
    assert.equal(clearSpeechOfBox({ ...base, box: { left: 14, right: 294, top: 48, bottom: 210 } }), null);
  });

  it('a sheet drawn from its 3x file is measured in its own texels (a Chicken\'s bubble sat on it)', () => {
    // js/sprite-hires.js: frames stay in 1x units on a resolution-3 source holding the 3x image.
    assert.equal(texelsPerUnit({ width: 888, resolution: 3 }, { width: 2664 }), 3);
    assert.equal(texelsPerUnit({ width: 704, resolution: 1 }, { width: 704 }), 1);
    assert.equal(texelsPerUnit({ resolution: 3 }, null), 3);
    assert.equal(texelsPerUnit(null, null), 1);
    const src = read('public/js/speech-placement.js');
    assert.match(src, /ctx\.drawImage\(res, f\.x \* k, f\.y \* k, f\.width \* k, f\.height \* k, 0, 0, w, h\);/);
  });

  it('game.js holds the side and the slide every placement', () => {
    const game = read('public/game.js');
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    assert.match(fn, /const hold = meta\.hold \|\| \(meta\.hold = \{ side: null, since: null, flips: 0 \}\);/);
    assert.match(fn, /const deepest = deepestSpeechTip\(\{ artTop: spr\.y - spriteHeight, feet: spr\.y, want \}\);/);
    assert.match(fn, /deepest,\n    keep,\n  \}\);/);
    assert.match(fn, /prefer: meta\.clearHow \|\| null,/);
    assert.match(fn, /prefer: meta\.zoneHow \|\| null,/);
    assert.match(fn, /prefer: meta\.slideWant \|\| 0,/);
    assert.match(fn, /const side = holdSpeechSide\(hold, place\.flip, performance\.now\(\), \{ forced: hold\.side === true && belowSpare < -SPEECH_HOLD_MARGIN \}\);/);
    assert.match(fn, /const held = limitSpeechTip\(speechTipOnSide\(side, \{ want, minTip: lowestTip, maxTip: highestTip, below \}\), want\);/);
  });
});
