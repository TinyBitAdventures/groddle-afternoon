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
  SPEECH_PUSH_LIMIT,
  SPEECH_BUBBLE_RADIUS,
  SPEECH_TAIL_HALF,
  SPEECH_TAIL_TIP_INSET,
  STREET_SPIRIT_SPEECH_OFFSET,
  artHeightOf,
  clearSpeechOfBox,
  firstOpaqueRow,
  giveArtHeight,
  liftOverAvatars,
  opaqueTopOf,
  placeSpeechTail,
  placeSpeechTip,
  speechBubbleRect,
  speechOffsetFor,
  speechTailPoints,
} from '../public/js/speech-placement.js?v=g357-1';

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
    assert.match(game, /import \{ clearSpeechOfBox, giveArtHeight, hudColumnBox, liftOverAvatars, placeSpeechTail, placeSpeechTip, speechOffsetFor, speechTailPoints \} from '\.\/js\/speech-placement\.js\?v=[\w-]+';/);
    assert.match(game, /function register\(target\) \{\n[^\n]*\n  giveArtHeight\(target\);\n  interactables\.push\(target\);/);
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    assert.match(fn, /const offset = speechOffsetFor\(meta\.target\);\n  bubble\.x = clampWorldOverlayX\(spr\.x \+ offset\.x, meta\.width, 12\);/);
    assert.match(fn, /want: spr\.y - spriteHeight - 12 \+ offset\.y,/);
    assert.match(fn, /dataset\.speechArt = /);
    // G233: the tail is aimed at the speaker the bubble was meant to centre on.
    assert.match(fn, /placeSpeechTail\(\{ bubbleX: bubble\.x, width: meta\.width, speakerX: spr\.x \+ offset\.x \}\)/);
    assert.match(fn, /drawSpeechTail\(meta\.tailDown, meta\.height, tail, false, 11 \+ liftPx\);\n\s*drawSpeechTail\(meta\.tailUp, meta\.height, tail, true\);/);
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

  it('game.js asks it with the feed and buff strip every placement', () => {
    const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
    assert.match(game, /hudColumnBox\(\[\.\.\.\(feed\?\.children \|\| \[\]\), document\.getElementById\('buff-strip'\)\]/);
    assert.match(game, /const clear = clearSpeechOfBox\(\{/);
    assert.match(game, /meta\.overHud = clear\?\.how === 'over';/);
    assert.match(game, /el\.toggleAttribute\('data-under-speech', over\)/);
    const css = readFileSync(join(ROOT, 'public/style.css'), 'utf8');
    assert.match(css, /\.activity-feed\[data-under-speech\], \.buff-strip\[data-under-speech\] \{ opacity: 0\.18; \}/);
  });
});

describe('bubbles keep off players\' heads (G357, Austin 2026-10-27)', () => {
  // A 200 x 50 bubble whose tail points at y 400 (a short speaker's head); its body is 339-389.
  const bubble = { left: 100, width: 200, height: 50, tip: 400 };
  const player = { left: 160, right: 220, top: 300, bottom: 450 };

  it('lifts a bubble clear of the player standing beside a short speaker', () => {
    const out = liftOverAvatars({ ...bubble, avatars: [player] });
    assert.equal(out.covered, false);
    // body bottom = 400 - 11 - lift must sit 6 px over the head at 300
    assert.equal(out.lift, 400 - 11 - (300 - 6));
  });

  it('leaves alone a bubble that covers nobody, or a player off to the side', () => {
    assert.deepEqual(liftOverAvatars({ ...bubble, avatars: [] }), { lift: 0, covered: false });
    assert.equal(liftOverAvatars({ ...bubble, avatars: [{ left: 400, right: 460, top: 300, bottom: 450 }] }).lift, 0);
    // a head already under the tail's point: the body is above it
    assert.equal(liftOverAvatars({ ...bubble, avatars: [{ left: 160, right: 220, top: 395, bottom: 450 }] }).lift, 0);
  });

  it('rises at most 120 px (ChatBubble.as) and never out of view', () => {
    const tall = { left: 160, right: 220, top: 150, bottom: 450 };
    assert.deepEqual(liftOverAvatars({ ...bubble, avatars: [tall] }), { lift: 120, covered: true });
    assert.deepEqual(liftOverAvatars({ ...bubble, avatars: [player], maxLift: 40 }), { lift: 40, covered: true });
  });

  it('keeps rising past a second head the first lift ran into', () => {
    const higher = { left: 250, right: 300, top: 280, bottom: 330 };
    const out = liftOverAvatars({ ...bubble, avatars: [player, higher] });
    assert.equal(out.lift, 400 - 11 - (280 - 6));
  });

  it('a stretched tail reaches the speaker', () => {
    const p = speechTailPoints({ height: 50, tip: 100, base: 100, length: 11 + 40 });
    assert.equal(p.fill[3], 50 + 51);
  });

  it('game.js lifts tip-down bubbles, names only players and sizes a bubble to its line', () => {
    const game = read('public/game.js');
    const fn = game.slice(game.indexOf('function positionSpeechBubble'), game.indexOf('function showSpeechBubble'));
    assert.match(fn, /const lift = place\.flip \? \{ lift: 0 \} : liftOverAvatars\(\{/);
    assert.match(fn, /avatars: speechAvoidBoxes\(meta\.target\), maxLift: place\.tip - lowestTip,/);
    const show = game.slice(game.indexOf('function showSpeechBubble'), game.indexOf('function speechSlugRow'));
    assert.match(show, /const named = target\.classId === 'pc_player' \|\| target\.classId === 'pc_remote';/);
    assert.match(show, /\+ 24, 60, 280\);/);
    assert.match(read('public/js/features/realtime-feature.js'), /speechAvoidTargets\(\) \{/);
  });
});
