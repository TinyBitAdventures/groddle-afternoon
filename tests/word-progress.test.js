// The word progress bar (Austin, 2026-10-28): a running verb's word fills over its item,
// as the original's WordProgressBar did, in place of the cream "Move or Esc to cancel" panel.
// Sources (CC0): glitch-client WordProgressBar.as, InLocationAnnouncementOverlay.as,
// AbstractAnnouncementOverlay.as, Announcement.as; glitch-GameServerJS config_base.js 180-209,
// players/inc_skill_packages.js 205-292 and each item's runSkillPackage call.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORD_PROGRESS_MAP,
  VERB_WORD_KEYS,
  CLASS_WORDS,
  TRANT_CLASSES,
  DISMISSIBLE_MIN_MS,
  wordForAction,
  wordPlacementFor,
  wordAnchor,
  wordBarLayout,
  wordTimeline,
  isDismissible,
  heldActionDelta,
} from '../public/js/word-progress.js?v=g387-1';
import { WORD_PROGRESS_ART } from '../public/js/word-progress-art.js?v=g387-1';
import { imageSize } from '../tools/word-progress/build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const GSJS = join(root, '../glitch-GameServerJS');
const CLIENT = join(root, '../glitch-client');
const skipGsjs = existsSync(GSJS) ? false : 'needs tinyspeck/glitch-GameServerJS beside the game';
const skipClient = existsSync(CLIENT) ? false : 'needs tinyspeck/glitch-client beside the game';
const gsjs = (p) => readFileSync(join(GSJS, p), 'utf8');
const client = (p) => readFileSync(join(CLIENT, p), 'utf8');
const line = (text, n) => text.split('\n')[n - 1];

const SWF_WORDS = ['assembling', 'clear', 'crushing', 'crystlmlzng', 'default', 'digdig', 'disassembling', 'embedding', 'harvest', 'installing', 'massage', 'milk', 'mine', 'nibble', 'pet', 'repairing', 'revive', 'scoop', 'scrape', 'scrape2', 'smelting', 'spinning', 'squeeze', 'tend', 'uninstalling', 'water'];

describe('which word a verb shows', () => {
  it('copies config_base.js word_progress_map (180-209)', { skip: skipGsjs }, () => {
    const text = gsjs('config_base.js');
    assert.match(line(text, 180), /^var word_progress_map = \{/);
    const block = text.split('\n').slice(179, 209).join('\n');
    const rows = Object.fromEntries([...block.matchAll(/'(\w+)'\s*:\s*\{type:'(\w+)'\}/g)].map((m) => [m[1], m[2]]));
    assert.deepEqual(rows, { ...WORD_PROGRESS_MAP });
  });

  it('has a drawn word for every map entry, and the 26 the SWF exports', () => {
    assert.deepEqual(Object.keys(WORD_PROGRESS_ART.words).sort(), SWF_WORDS);
    for (const word of Object.values(WORD_PROGRESS_MAP)) assert.ok(WORD_PROGRESS_ART.words[word], word);
    for (const word of Object.values(CLASS_WORDS)) assert.ok(WORD_PROGRESS_ART.words[word], word);
    for (const key of Object.values(VERB_WORD_KEYS)) assert.ok(WORD_PROGRESS_MAP[key], key);
  });

  it('maps the remake actions to the words their source calls used', () => {
    const rows = [
      ['trant_fruit', 'harvest', 'harvest'], // include/trants.js 250
      ['trant_bean', 'water', 'water'], // include/trants.js 130
      ['trant_egg', 'pet', 'pet'], // include/trants.js 35
      ['wood_tree', 'harvest', 'harvest'], // wood_tree.js 702
      ['npc_piggy', 'pet', 'pet'], // npc_piggy.js 955
      ['npc_piggy', 'nibble', 'nibble'], // npc_piggy.js 882
      ['npc_chicken', 'squeeze', 'squeeze'], // npc_chicken.js 776
      ['npc_butterfly', 'massage', 'massage'], // npc_butterfly.js 813
      ['npc_butterfly', 'milk', 'milk'], // npc_butterfly.js 736
      ['rock_beryl_1', 'mine', 'mine'], // include/mining.js 230
      ['mortar_barnacle', 'scrape', 'scrape'], // mortar_barnacle.js 347
      ['ice_knob', 'scrape', 'scrape2'], // ice_knob.js 375
      ['jellisac', 'scoop', 'scoop'], // jellisac.js 67
      ['dirt_pile', 'dig', 'digdig'], // dirt_pile.js 220 (digging -> digdig)
      ['peat_1', 'harvest', 'harvest'], // peat_1.js 367
      ['trant_fruit', 'rook_revive', 'revive'], // include/rook.js 128
      ['garden_crop', 'water_all', 'water'],
    ];
    for (const [cls, verb, word] of rows) assert.equal(wordForAction(cls, verb), word, `${cls} ${verb}`);
    // No word in the source: "doing stuff" (WordProgressBar.as showWord falls back to progress_default).
    for (const [cls, verb] of [['npc_piggy', 'feed:apple'], ['apple', 'pickup'], ['npc_butterfly', 'sing_to'], ['rook_egg', 'smash'], ['block', 'spin']]) {
      assert.equal(wordForAction(cls, verb), 'default', `${cls} ${verb}`);
    }
  });

  it('cites lines that say so', { skip: skipGsjs }, () => {
    const at = (file, n, ...res) => {
      const text = line(gsjs(file), n);
      for (const re of res) assert.match(text, re, `${file} ${n}`);
    };
    at('items/include/trants.js', 35, /word_progress_map\['pet'\]/, /place_at_bottom: true, source_delta_y: -140, source_delta_x: 0/);
    at('items/include/trants.js', 130, /word_progress_map\['water'\]/, /place_at_bottom: true, source_delta_y: -140, source_delta_x: 0/);
    at('items/include/trants.js', 250, /word_progress_map\['harvest'\]/, /place_at_bottom: true, source_delta_y: -140, source_delta_x: 0/);
    at('items/npc_piggy.js', 955, /word_progress_map\['pet'\]/);
    at('items/include/mining.js', 230, /word_progress_map\['mine'\]/);
    at('items/ice_knob.js', 375, /word_progress: \{type:"scrape2"\}/, /source_delta_y: 80, source_delta_x: 40/);
    at('items/mortar_barnacle.js', 347, /word_progress_map\['scrape'\]/, /source_delta_y: 80, source_delta_x: 40/);
    at('items/dirt_pile.js', 220, /word_progress_map\['digging'\]/);
    at('items/include/rook.js', 128, /word_progress_map\['revive'\]/);
    const pkg = gsjs('players/inc_skill_packages.js');
    assert.match(line(pkg, 230), /source_item\.x < this\.x/);
    assert.match(line(pkg, 231), /delta_x = args\.source_delta_x !== undefined \? args\.source_delta_x : 10;/);
    assert.match(line(pkg, 236), /delta_x = args\.source_delta_x !== undefined \? \(args\.source_delta_x \* -1\) : -10;/);
    assert.match(line(pkg, 264), /delta_y: args\.source_delta_y \? args\.source_delta_y : 20,/);
    assert.match(line(pkg, 265), /place_at_bottom: args\.place_at_bottom \? true : false,/);
    assert.match(line(pkg, 279), /if \(duration >= 2000\)\{/);
    assert.match(line(pkg, 281), /annc\['dismissible'\] = true;/);
  });
});

describe('where the word goes', () => {
  it('stands a trant\'s word 140 px above its base (place_at_bottom)', () => {
    for (const cls of TRANT_CLASSES) assert.equal(wordPlacementFor(cls, 'harvest').placeAtBottom, true);
    const at = wordAnchor({ classId: 'trant_fruit', verbId: 'harvest', itemX: 800, itemY: 600, itemTop: 380, playerX: 740 });
    assert.deepEqual(at, { x: 800, y: 460, placeAtBottom: true });
  });

  it('puts other words 20 px below the item\'s top, 10 px toward the player', () => {
    // InLocationAnnouncementOverlay.as 99-104: y = item y + delta_y, + getYAboveDisplay() unless place_at_bottom.
    const left = wordAnchor({ classId: 'rock_beryl_1', verbId: 'mine', itemX: 500, itemY: 700, itemTop: 640, playerX: 430 });
    assert.deepEqual(left, { x: 490, y: 660, placeAtBottom: false });
    const right = wordAnchor({ classId: 'npc_piggy', verbId: 'pet', itemX: 500, itemY: 700, itemTop: 650, playerX: 560 });
    assert.deepEqual(right, { x: 510, y: 670, placeAtBottom: false });
    const scrape = wordAnchor({ classId: 'ice_knob', verbId: 'scrape', itemX: 500, itemY: 700, itemTop: 600, playerX: 600 });
    assert.deepEqual(scrape, { x: 540, y: 680, placeAtBottom: false });
  });

  it('reads the placement rules the client used', { skip: skipClient }, () => {
    const ov = client('com/tinyspeck/engine/view/gameoverlay/InLocationAnnouncementOverlay.as');
    assert.match(line(ov, 88), /base_x = lis_view\.x_of_int_target;/);
    assert.match(line(ov, 100), /x = base_x\+delta_x;/);
    assert.match(line(ov, 101), /y = base_y\+annc\.delta_y;/);
    assert.match(line(ov, 102), /if \(!annc\.place_at_bottom\) \{/);
    assert.match(line(ov, 103), /y\+= lis_view\.getYAboveDisplay\(\);/);
    assert.match(line(ov, 145), /y-= Math\.max\(-120, rect\.y\);/);
    assert.match(line(ov, 201), /word_progress_bar\.x = -word_progress_bar\.width\/2;/);
  });
});

describe('how the word fills', () => {
  it('follows WordProgressBar.as: fill_mc from 0 to the word\'s width, linear; cancel at word + 3, 13 down', { skip: skipClient }, () => {
    const bar = client('com/tinyspeck/engine/view/ui/WordProgressBar.as');
    assert.match(bar, /FILL_NAME:String = 'fill_mc'/);
    assert.match(bar, /fill_mc\.width = 0;\n\s*TSTweener\.addTween\(fill_mc, \{width:current_word\.width, time:animation_speed, transition:'linear', onComplete:animateNextRound\}\);/);
    assert.match(bar, /animation_speed = \(duration_ms\/1000\)\/limit;/);
    assert.match(bar, /cancel_bt\.visible = annc\.dismissible;/);
    assert.match(bar, /cancel_bt\.x = int\(word_holder\.width \+ 3\);\n\s*cancel_bt\.y = 13;/);
    assert.match(bar, /current_word = word_progress_mc\.getAssetByName\('progress_default'\);/);
    const ov = client('com/tinyspeck/engine/view/gameoverlay/InLocationAnnouncementOverlay.as');
    assert.match(line(ov, 200), /word_progress_bar\.show\(annc, fade_in_sec\*1000\);/);
    const annc = client('com/tinyspeck/engine/data/client/Announcement.as');
    assert.match(annc, /public var counter_limit:int = 1;/);
    assert.match(annc, /public var fade_in_sec:Number = \.2;/);
    assert.match(annc, /public var fade_out_sec:Number = \.4;/);
  });

  it('fills in (duration - fade in), fades in 0.2 s and out 0.4 s, none under reduced motion', () => {
    assert.deepEqual(wordTimeline(0, 5000), { fill: 0, alpha: 0 });
    assert.equal(wordTimeline(100, 5000).alpha, 0.5);
    assert.equal(wordTimeline(2400, 5000).fill, 0.5);
    assert.equal(wordTimeline(2400, 5000).alpha, 1);
    assert.equal(wordTimeline(4800, 5000).fill, 1);
    assert.equal(wordTimeline(4800, 5000).alpha, 0.5); // fade out from 4600 (duration - 2 x fade in)
    assert.equal(wordTimeline(5000, 5000).alpha, 0);
    assert.deepEqual(wordTimeline(0, 5000, { reducedMotion: true }), { fill: 0, alpha: 1 });
    // A short verb: fades are at most a third of it (AbstractAnnouncementOverlay.as go 253-256).
    assert.equal(wordTimeline(350, 900).fill, 0.5);
    assert.equal(wordTimeline(100, 600).alpha, 0.5);
    // counter_limit rounds refill the word (unused by skill packages, which keep 1).
    assert.ok(Math.abs(wordTimeline(1200, 5000, { rounds: 2 }).fill - 0.5) < 1e-9);
  });

  it('shows the cancel button from 2 s, beside the word', () => {
    assert.equal(DISMISSIBLE_MIN_MS, 2000);
    assert.equal(isDismissible(1999), false);
    assert.equal(isDismissible(2000), true);
    const harvest = wordBarLayout('harvest');
    assert.equal(harvest.cancelX, Math.floor(harvest.art.fillBox[0] + harvest.art.fillBox[1] + 3));
    assert.equal(harvest.cancelY, 13);
    assert.equal(harvest.width, harvest.cancelX + 20);
  });

  it('holds a verb for QA only when asked', () => {
    const action = { durationMs: 1000, elapsedMs: 200 };
    assert.equal(heldActionDelta(action, 16), 16);
    // 60% full: (1000 - 200 fade in) x 0.6 = 480 ms.
    assert.equal(heldActionDelta(action, 500, 0.6), 280);
    assert.equal(heldActionDelta({ durationMs: 1000, elapsedMs: 480 }, 16, 0.6), 0);
    assert.equal(wordTimeline(480, 1000).fill, 0.6);
    // Full, but the verb never lands while held.
    assert.equal(heldActionDelta({ durationMs: 1000, elapsedMs: 700 }, 500, 1), 100);
    assert.equal(wordTimeline(800, 1000).fill, 1);
  });
});

describe('the art', () => {
  it('ships the atlases and cancel buttons the data module names, at their sizes', () => {
    const { atlas, cancel, words } = WORD_PROGRESS_ART;
    for (const row of [atlas.x1, atlas.x3, cancel.normal, cancel.hover]) {
      const file = join(pub, row.url);
      assert.ok(existsSync(file), row.url);
      const buf = readFileSync(file);
      assert.deepEqual(imageSize(buf), [row.w, row.h], row.url);
      assert.equal(buf.length, row.bytes, row.url);
    }
    assert.match(atlas.x1.url, /word-progress\/words\.png$/);
    assert.match(atlas.x3.url, /word-progress\/words@3x\.webp$/);
    assert.deepEqual([atlas.x1.w, atlas.x1.h], [atlas.w, atlas.h]);
    assert.deepEqual([atlas.x3.w, atlas.x3.h], [atlas.w * 3, atlas.h * 3]);
    assert.deepEqual([cancel.normal.w, cancel.normal.h, cancel.hover.w, cancel.hover.h], [20, 21, 20, 21]);
    for (const [word, art] of Object.entries(words)) {
      for (const layer of ['base', 'fill', 'top']) {
        if (!art[layer]) continue;
        assert.ok(art[layer][0] + art.w <= atlas.w && art[layer][1] + art.h <= atlas.h, `${word} ${layer} in the atlas`);
      }
      assert.ok(art.fillBox[0] + art.fillBox[1] <= art.w + 0.01, `${word} fill fits its cell`);
    }
    assert.equal(words.milk.top, null, 'progress_milk has no highlight layer');
    assert.deepEqual([words.harvest.w, words.harvest.h], [155, 35]);
  });

  it('is current (node tools/word-progress/build.mjs --check)', () => {
    execFileSync(process.execPath, [join(root, 'tools/word-progress/build.mjs'), '--check'], { stdio: 'pipe' });
  });

  it('copies the client\'s cancel PNGs as they are', { skip: skipClient }, () => {
    const dir = join(CLIENT, 'TSEngineAssets/src/assets/graphics');
    assert.deepEqual(readFileSync(join(pub, 'assets/sprites/word-progress/cancel.png')), readFileSync(join(dir, 'word_dismisser_cancel.png')));
    assert.deepEqual(readFileSync(join(pub, 'assets/sprites/word-progress/cancel_hover.png')), readFileSync(join(dir, 'word_dismisser_cancel_hover.png')));
    // The street draws the SVG redraw of those PNGs, so the button stays sharp when the view scales.
    const css = readFileSync(join(pub, 'style.css'), 'utf8');
    assert.match(css, /\.word-progress-cancel \{[^}]*cancel\.svg/);
    assert.match(css, /cancel_hover\.svg/);
  });
});

describe('in the game', () => {
  const game = readFileSync(join(pub, 'game.js'), 'utf8');
  const css = readFileSync(join(pub, 'style.css'), 'utf8');
  const pages = ['play/index.html', 'play/online/index.html'].map((p) => readFileSync(join(pub, p), 'utf8'));

  it('drops the cream panel and its "Move or Esc to cancel" line', () => {
    const texts = [game, css, ...pages, ...readdirSync(join(pub, 'js')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(pub, 'js', f), 'utf8'))];
    for (const text of texts) assert.doesNotMatch(text, /Move or Esc to cancel/);
    assert.doesNotMatch(css, /\.action-progress-(card|copy|track)/);
    assert.doesNotMatch(game, /function positionActionProgress/);
    for (const html of pages) {
      assert.match(html, /<div id="action-progress" class="word-progress" role="status" aria-live="polite" hidden>/);
      assert.match(html, /<button type="button" class="word-progress-cancel" data-word-cancel aria-label="Cancel" title="Cancel" hidden><\/button>/);
      assert.match(html, /style\.css\?v=[^"]*&amp;wordprog=g\d+-\d+(?:&amp;[^"]*)?"/);
    }
  });

  it('cancels from the button, Escape and movement', () => {
    assert.match(game, /createWordProgressView\(el, \{ onCancel: \(\) => cancelCurrentAction\(\) \}\)/);
    assert.match(game, /if \(currentAction\) \{\n\s+cancelCurrentAction\(\);\n\s+return;\n\s+\}/); // Escape
    assert.match(game, /if \(currentAction\) \{\n\s+if \(\['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'W', 'a', 'A', 's', 'S', 'd', 'D'\]\.includes\(e\.key\)\) \{\n\s+cancelCurrentAction\(\);/);
    assert.match(css, /\.word-progress-cancel:hover,[\s\S]*?cancel_hover\.svg/);
  });

  it('places the word from the target and scales it with the street view', () => {
    assert.match(game, /wordAnchor\(\{ classId: currentAction\.classId, verbId: currentAction\.verbId, itemX: spr\.x, itemY: spr\.y, itemTop: spr\.y - art, playerX: player\.x \}\)/);
    assert.match(game, /const scale = \(canvas\.clientWidth \|\| canvas\.width \|\| VIEW_W\) \/ VIEW_W;/);
    assert.match(game, /advanceTimedAction\(currentAction, heldActionDelta\(currentAction, deltaMs\)\)/);
    assert.match(game, /from '\.\/js\/word-progress\.js\?v=g387-1'/);
  });

  it('stays the acting player\'s own, as in the source (no realtime message)', () => {
    for (const f of ['js/realtime-client.js', 'js/features/realtime-feature.js']) {
      assert.doesNotMatch(readFileSync(join(pub, f), 'utf8'), /word-progress|wordProgress|action-progress/);
    }
  });
});
