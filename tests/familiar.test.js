/**
 * The Magic Rock familiar, final 2012 form (G211 quest card, G218 skill
 * panel, G219 achievement drop, G220 voice-of-rock overlay).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACHIEVEMENT_DROP,
  PET_ROCK_SHEETS,
  QUEST_ROCK_WH,
  RAY_SETS,
  FAMILIAR_DIALOG_MIN_W,
  achievementBubbleText,
  easeOutBounce,
  familiarCardHeading,
  familiarLook,
  locationViewport,
  petRockFrameStyle,
  raySpinSeconds,
  rayWedgePaths,
  raysSvg,
  skillArtFor,
  skillLearnedActivity,
  skillLearnedModel,
  truncateLabel,
  vogLayout,
} from '../public/js/familiar.js?v=g405-1';
import { CARD_ART_LAYERS } from '../public/js/imagination-data.js';
import {
  _resetFamiliarDialog,
  afterScreens,
  familiarDialogFeature,
  familiarDialogOpen,
  queueSkillLearned,
} from '../public/js/features/familiar-dialog-feature.js?v=g405-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(root, 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

function pngSize(path) {
  const buf = readFileSync(path);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('pet_rock art (CC0 OGA sheet)', () => {
  it('ships the idle sheet the frame table describes', () => {
    const sheet = PET_ROCK_SHEETS.idle;
    const size = pngSize(join(PUBLIC, sheet.src));
    assert.deepEqual(size, { w: sheet.sheetW, h: sheet.sheetH });
    assert.equal(sheet.sheetW / sheet.cellW, sheet.cols);
    assert.ok(sheet.frames <= sheet.cols * (sheet.sheetH / sheet.cellH));
    assert.equal(sheet.frames, 193, 'the Pet_Rock idle label runs 193 frames (pet_rock_rays.fla Pet_Rock.xml)');
  });

  it('draws the rock from its 3x render of pet_rock.swf, three times the cropped 1x sheet (G402)', () => {
    const sheet = PET_ROCK_SHEETS.idle;
    assert.equal(sheet.hires, sheet.src.replace(/\.png$/, '@3x.webp'));
    const b = readFileSync(join(PUBLIC, sheet.hires));
    assert.equal(b.toString('ascii', 12, 16), 'VP8L', 'lossless WebP');
    const bits = b.readUInt32LE(21);
    assert.deepEqual({ w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }, { w: sheet.sheetW * 3, h: sheet.sheetH * 3 });
    // The crop keeps every frame's opaque box, and the square box it is fitted into, inside its cell.
    const side = Math.max(sheet.bbox.w, sheet.bbox.h);
    const cx = sheet.bbox.x + sheet.bbox.w / 2;
    const cy = sheet.bbox.y + sheet.bbox.h / 2;
    assert.ok(cx - side / 2 >= 0 && cx + side / 2 <= sheet.cellW, 'no neighbour cell across');
    assert.ok(cy - side / 2 >= 0 && cy + side / 2 <= sheet.cellH, 'no neighbour cell down');
    assert.match(read('js/familiar.js'), /backgroundImage = `url\("\$\{sheet\.hires \|\| sheet\.src\}"\)`/);
  });

  it('fits the rock into its box like ItemIconView and steps through the grid', () => {
    const f0 = petRockFrameStyle(0, 80);
    assert.equal(f0.scale, Math.round((80 / 51) * 100) / 100);
    assert.equal(f0.frame, 0);
    const f13 = petRockFrameStyle(13, 80);
    assert.equal(f13.frame, 13);
    assert.notEqual(f13.backgroundPosition, f0.backgroundPosition);
    assert.equal(petRockFrameStyle(193, 80).frame, 0, 'frames wrap');
    assert.equal(petRockFrameStyle(-1, 80).frame, 192);
    assert.equal(QUEST_ROCK_WH, 80, 'QuestConversationUI.as 34 ROCK_WH');
  });
});

describe('rays from the source FLAs', () => {
  it('draws six 30 degree wedges', () => {
    const paths = rayWedgePaths(100);
    assert.equal(paths.length, 6);
    assert.match(paths[0], /^M100 100L200 100A100 100 0 0 1 186\.6 150Z$/);
    const svg = raysSvg('quest');
    assert.equal((svg.match(/<path /g) || []).length, 6);
    assert.match(svg, /stop-opacity="0\.66"/);
  });

  it('keeps the quest rays at Rays scale 0.3 and the source loop speeds', () => {
    assert.ok(Math.abs(RAY_SETS.quest.radius - 81.375) < 0.01);
    assert.equal(RAY_SETS.vog.radius, 70.4);
    assert.equal(raySpinSeconds('quest'), 5.967);
    assert.equal(raySpinSeconds('vog'), 3.2);
  });
});

describe('quest card look (G211) and voice of rock (G220)', () => {
  it('gives the Magic Rock its card and leaves other speakers plain', () => {
    // G225: its offers take the quest card, its other lines the CONVERSATION panel.
    assert.equal(familiarLook({ kicker: 'Magic Rock' }), 'conversation');
    assert.equal(familiarLook({ kicker: 'Magic Rock', offer: true }), 'familiar');
    assert.equal(familiarLook({ look: 'plain', kicker: 'Magic Rock' }), 'plain');
    assert.equal(familiarLook({ mode: 'offer', kicker: '' }), 'familiar');
    assert.equal(familiarLook({ kicker: 'Mr. Block' }), 'plain');
    assert.equal(familiarLook({ look: 'vog', kicker: 'Magic Rock' }), 'vog');
    assert.equal(familiarCardHeading({ offer: true }), 'New Quest');
    assert.equal(familiarCardHeading({ offer: false, kicker: 'Magic Rock' }), 'Magic Rock');
  });

  it('builds the familiar card in the game markup without the old orb', () => {
    const html = read('play/index.html');
    const card = html.slice(html.indexOf('id="quest-dialogue"'), html.indexOf('id="rook-museum-exhibit"'));
    assert.doesNotMatch(card, /quest-dialogue-orb/);
    assert.match(card, /id="quest-dialogue-head"/);
    assert.match(card, /assets\/ui\/familiar\/quests_small\.png/);
    assert.match(card, /id="quest-dialogue-close"/);
    for (const id of ['quest-dialogue-kicker', 'quest-dialogue-title', 'quest-dialogue-copy', 'quest-dialogue-next', 'quest-dialogue-cancel']) {
      assert.match(card, new RegExp(`id="${id}"`));
    }
    const css = read('style.css');
    assert.match(css, /\.quest-dialogue\[data-look="familiar"\] \.quest-dialogue-bubble \{[^}]*rgba\(10, 24, 29, 0\.9\)/);
    assert.match(css, /\.quest-dialogue\[data-look="familiar"\]\[data-urgent="true"\] \.fam-rays \{ display: block; \}/);
    assert.match(css, /\.quest-dialogue\[data-look="vog"\] \.quest-dialogue-card \{[^}]*rgba\(0, 0, 0, 0\.7\)/);
  });

  it('wires urgent offers, the close X and the voice-of-rock lines', () => {
    const game = read('game.js');
    assert.match(game, /familiarLook\(\{ look: questDialogueState\.look, kicker: questDialogueState\.kicker, mode, offer \}\)/);
    assert.match(game, /getElementById\('quest-dialogue-close'\)\?\.addEventListener\('click'/);
    assert.match(game, /offer: true,\n\s+urgent: urgent === true,/);
    assert.match(read('js/features/quest-offers-feature.js'), /urgent: card\.emergency === true/);
    assert.match(read('js/quest-rooms/top-of-tree.js'), /text: ROCK_LINE, choices: \[\{ label: 'OK', value: 'ok' \}\], look: 'vog', width: 500/);
    assert.match(read('js/features/smuggling-feature.js'), /kicker: 'Magic Rock', beats, look: 'vog', width: 500/);
    assert.match(read('js/features/quest-instances-feature.js'), /applyFamiliarLook\(dialog\.modal, \{ look, width, grow: opening \}\)/);
  });
});

describe('achievement drop (G219)', () => {
  it('uses the AchievementView timings and bubble text', () => {
    assert.deepEqual({ ...ACHIEVEMENT_DROP }, { delayMs: 1000, durationMs: 1000, bubbleAfterMs: 400 });
    assert.equal(easeOutBounce(0), 0);
    assert.equal(easeOutBounce(1), 1);
    assert.ok(easeOutBounce(0.5) > 0.7 && easeOutBounce(0.5) < 0.8);
    assert.deepEqual(achievementBubbleText({ name: 'Gardener' }), { head: 'New Achievement!', line: 'You got the Gardener badge!' });
    assert.equal(achievementBubbleText({ status: 'Well done.', name: 'X' }).line, 'Well done.');
  });

  it('prints desc on the card and status_text in the bubble (G225, AchievementView.as 349, 552)', () => {
    const fx = read('js/screen-fx.js');
    const drop = fx.slice(fx.indexOf('export function startFamiliarDrop'), fx.indexOf('if (bubble) {', fx.indexOf('export function startFamiliarDrop')));
    assert.match(drop, /const line = text\.line;/);
    assert.match(fx, /status: payload\.status \|\| '',/);
    const game = read('game.js');
    assert.match(game, /body: update\.def\.desc \|\| update\.def\.description \|\| '',\n\s+status: update\.def\.statusText \|\| update\.def\.status_text \|\| '',/);
  });

  it('drops the rock only for badges inside the existing award card', () => {
    const fx = read('js/screen-fx.js');
    assert.match(fx, /kind === 'achievement' && Boolean\(payload\.classTsid\) && !paged/);
    assert.match(fx, /stopFamiliar\(\);/);
    const html = read('play/index.html');
    assert.match(html, /data-award-familiar hidden/);
    assert.match(html, /data-award-familiar-bubble hidden/);
  });
});

describe('skill learned panel (G218)', () => {
  it('models FamiliarDialog SKILL_LEARNED', () => {
    const few = skillLearnedModel({
      classTsid: 'ezcooking_1',
      name: 'EZ Cooking I',
      learned: 'Huzzah!',
      next: [{ classTsid: 'ezcooking_1', name: 'EZ Cooking I' }, { classTsid: 'grilling_1', name: 'Grilling I' }],
    });
    assert.equal(few.header, 'Woohoo! New skill learned...');
    assert.equal(few.chooseLabel, 'Choose a Skill to Learn Next');
    assert.equal(few.treeLabel, 'View Full Skill Tree');
    assert.equal(few.cols, 2);
    assert.deepEqual(few.skills.map((s) => s.classTsid), ['grilling_1'], 'the learned skill is not offered again');
    const many = skillLearnedModel({
      classTsid: 'a_1',
      next: Array.from({ length: 9 }, (_, i) => ({ classTsid: `s_${i}`, name: `Transcendental Radiation ${i}` })),
    });
    assert.equal(many.cols, 3, 'three columns past 8 (BREAK_COUNT)');
    assert.equal(many.skills[0].label, 'Transcendent...', 'StringUtil.truncate keeps 15 characters in all');
    assert.equal(truncateLabel('Short'), 'Short');
  });

  it('finds CC0 skill tiles and writes the source activity line', () => {
    const layers = ['art_skill_animalkinship', 'art_brain'];
    assert.equal(skillArtFor('animalkinship_3', layers), 'assets/imagination/cards/art_skill_animalkinship.svg');
    assert.equal(skillArtFor('light_green_thumb_1', ['art_skill_lightgreenthumb']), 'assets/imagination/cards/art_skill_lightgreenthumb.svg');
    assert.equal(skillArtFor('nudgery_1', layers), 'assets/imagination/cards/art_brain.svg');
    assert.equal(skillLearnedActivity('Grilling I', 'Sizzle.'), 'You finished learning Grilling I. Sizzle.');
    assert.equal(skillLearnedActivity('Grilling I', '', { offline: true }), 'While you were away, you finished learning Grilling I.');
  });

  it('queues finished skills and holds quest offers while it talks', async () => {
    _resetFamiliarDialog();
    const data = {};
    const engine = {
      param: () => null,
      setData: (k, v) => { data[k] = v; },
      skillLearnedInfo: (id) => ({ classTsid: id, name: id, learned: '', next: [] }),
      afterStreetCard: async () => {},
      playSound: () => {},
    };
    familiarDialogFeature.init(engine);
    assert.equal(familiarDialogFeature.holdQuestOffers(), null);
    familiarDialogFeature.onEvent('skill_learned:animalkinship_1', 1, engine);
    familiarDialogFeature.onEvent('skill_learned:ezcooking_1', 1, engine);
    familiarDialogFeature.onEvent('skill_learned:ezcooking_1', 1, engine);
    familiarDialogFeature.onEvent('quoins_collected', 1, engine);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(familiarDialogOpen(), true);
    assert.equal(data.familiarPanel, 'animalkinship_1');
    assert.equal(data.familiarQueue, '1', 'a duplicate is not queued twice');
    assert.equal(familiarDialogFeature.holdQuestOffers(), true);
    queueSkillLearned(engine, '');
    assert.equal(data.familiarQueue, '1');
    _resetFamiliarDialog();
  });

  it('replaces the skill toast and award screen with the panel', () => {
    const game = read('game.js');
    const fn = game.slice(game.indexOf('function handleSkillCompletions'), game.indexOf('function updateSkillChrome'));
    assert.match(fn, /emitGameEvent\(`skill_learned:\$\{row\.classTsid\}`\)/);
    assert.doesNotMatch(fn, /enqueueAward|toast\(/);
    assert.match(game, /skillLearnedInfo\(classTsid\) \{/);
    assert.match(game, /openSkillTree\(classTsid = ''\) \{/);
    const index = read('js/features/index.js');
    // Registered (G185 appends the loneliness feature after it; neither answers the other's first-answer hooks).
    assert.match(index, /^import \{ familiarDialogFeature \} from '\.\/familiar-dialog-feature\.js\?v=g405-1'; FEATURES\.push\(familiarDialogFeature\);$/m);
  });
});

describe('G364 familiar talk waits for an open screen', () => {
  const CLIENT = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine');
  const HAVE_CLIENT = existsSync(CLIENT);
  const clientLines = (p) => readFileSync(join(CLIENT, p), 'utf8').split('\n');

  it('the client gates familiar talk on screen_view_open and hides the panel under the AchievementView', { skip: !HAVE_CLIENT && 'glitch-client not present' }, () => {
    const fc = clientLines('control/TSFrontController.as');
    assert.match(fc[2080], /public function startFamiliarConversationWithPayload/);
    assert.match(fc[2133], /if \(sm\.screen_view_open\) \{/);
    assert.match(fc[2184], /if \(payload\.conv_type != ConversationManager\.TYPE_QUEST_OFFER\) \{ \/\/ we do not q quest_offers/);
    assert.match(fc[2185], /sm\.fam_dialog_conv_payload_q\.push\(payload\);/);
    // The skill panel is not on that gate: it waits only for the You display (2040).
    const skill = fc.slice(2036, 2058).join('\n');
    assert.match(skill, /startFamiliarSkillMessageWithPayload/);
    assert.doesNotMatch(skill, /screen_view_open/);
    const you = clientLines('view/gameoverlay/YouDisplayManager.as');
    assert.match(you[419], /&& !AchievementView\.instance\.parent/);
    const ach = clientLines('view/gameoverlay/AchievementView.as');
    assert.match(ach[306], /changeTeleportDialogVisibility\(\);/);
    assert.match(ach[448], /changeTeleportDialogVisibility\(\);/);
  });

  it('holds the skill panel while a screen shows and grows it after', async () => {
    _resetFamiliarDialog();
    const data = {};
    let screenUp = true;
    const timers = [];
    const engine = {
      param: () => null,
      setData: (k, v) => { data[k] = v; },
      skillLearnedInfo: (id) => ({ classTsid: id, name: id, learned: '', next: [] }),
      afterStreetCard: async () => {},
      screenViewOpen: () => screenUp,
      playSound: () => { data.sound = 'played'; },
    };
    let resolved = false;
    afterScreens(engine, { setTimer: (fn) => timers.push(fn) }).then(() => { resolved = true; });
    await Promise.resolve();
    assert.equal(resolved, false);
    assert.equal(data.familiarHeld, 'screen');
    screenUp = false;
    timers.shift()();
    await Promise.resolve();
    assert.equal(resolved, true);
    assert.equal(data.familiarHeld, '');

    // Through the feature: the panel is claimed (offers held) but not grown or sounded while the screen shows.
    screenUp = true;
    familiarDialogFeature.init(engine);
    familiarDialogFeature.onEvent('skill_learned:animalkinship_1', 1, engine);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(familiarDialogOpen(), true);
    assert.equal(familiarDialogFeature.holdQuestOffers(), true);
    assert.equal(data.familiarHeld, 'screen');
    assert.equal(data.familiarLast, undefined);
    assert.equal(data.sound, undefined);
    screenUp = false;
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(data.familiarHeld, '');
    assert.equal(data.familiarLast, 'animalkinship_1');
    assert.equal(data.sound, 'played');
    _resetFamiliarDialog();
  });

  it('game.js holds the Magic Rock\'s own lines while a screen shows', () => {
    const game = read('game.js');
    const fn = (name) => {
      const start = game.indexOf(`function ${name}(`);
      assert.ok(start >= 0, name);
      return game.slice(start, game.indexOf('\n}\n', start));
    };
    assert.match(fn('isScreenViewOpen'), /\['award-screen', 'new-day-screen', 'giant-screen-panel'\]\.some\(elementShown\)/);
    assert.match(fn('screenGateState'), /screenOpen: isScreenViewOpen\(\),/);
    const waits = fn('familiarWaitsForScreen');
    assert.match(waits, /if \(!opts \|\| opts\.vog\) return false;/);
    assert.match(waits, /\(look === 'familiar' \|\| look === 'conversation'\) && isScreenViewOpen\(\)/);
    assert.match(fn('holdScriptedDialog'), /underEmergency \|\| familiarWaitsForScreen\(opts\)/);
    assert.match(fn('releaseHeldScriptedDialog'), /if \(familiarWaitsForScreen\(heldScriptedDialogs\[0\]\)\) return;/);
    assert.match(game, /screenViewOpen: \(\) => isScreenViewOpen\(\),/);
    // The looks it holds: quest offers and Magic Rock lines, never a plain card or the VOG.
    assert.equal(familiarLook({ kicker: 'Magic Rock' }), 'conversation');
    assert.equal(familiarLook({ offer: true }), 'familiar');
    assert.equal(familiarLook({ kicker: 'Mr. Block' }), 'plain');
  });
});

describe('G225 familiar follow-ups', () => {
  it('sizes the voice of rock from the location viewport, not the game root', () => {
    // A 1256 x 706 root with a 106 px pack: the viewport is 1256 x 600.
    const vp = locationViewport({ rootW: 1256, rootH: 706, packH: 106 });
    assert.deepEqual(vp, { x: 0, y: 0, w: 1256, h: 600 });
    assert.equal(locationViewport({ rootW: 1256, rootH: 706, packH: 106, railLeft: 980 }).w, 980, 'a visible rail narrows it');
    const lay = vogLayout(vp);
    assert.equal(lay.centerX, 628);
    assert.equal(lay.top, Math.round(0.25 * 600 + 12), 'bubble at top_y 25% under the 12 px pointer');
    assert.equal(lay.rockDy, Math.round(0.15 * 600) - lay.top, 'rock centre at y 15%');
    assert.equal(lay.rockSize, Math.round(PET_ROCK_SHEETS.idle.bbox.h * (0.4 * 600) / 145));
    const fx = read('js/familiar.js');
    assert.match(fx, /const lay = vogLayout\(measureLocationViewport\(modal\)\);/);
    assert.doesNotMatch(fx, /modal\.clientHeight \|\| 600;\n\s+const box/);
  });

  it('builds the FamiliarDialog CONVERSATION panel and drops the orb everywhere', () => {
    assert.equal(FAMILIAR_DIALOG_MIN_W, 330);
    const css = read('style.css');
    assert.doesNotMatch(css, /quest-dialogue-orb/);
    assert.match(css, /\.quest-dialogue\[data-look="conversation"\] \.quest-dialogue-card \{[^}]*top: 30px;[^}]*width: 360px;[^}]*rgba\(10, 24, 29, 0\.9\)/);
    assert.match(css, /\.quest-dialogue\[data-look="conversation"\] \.fam-head \{[^}]*border-bottom: 1px solid #49514f/);
    assert.match(css, /@keyframes famConvGrow \{ from \{ transform: translateX\(-50%\) scale\(0\.02\); \}/);
    const qi = read('js/features/quest-instances-feature.js');
    const ffw = read('js/quest-rooms/firefly-whistle.js');
    for (const src of [qi, ffw, read('play/index.html')]) assert.doesNotMatch(src, /quest-dialogue-orb/);
    assert.match(qi, /const look = familiarLook\(\{ look: lookOpt, kicker \}\);/);
    assert.match(qi, /dialog\.close\.addEventListener\('click', \(\) => dialog\.resolve\?\.\(null\)\);/);
    // prompts_add lines go to the prompt stack (G304, ctx.prompt); familiar_send_alert lines take the panel.
    assert.match(read('js/quest-rooms/penalty.js'), /ctx\.prompt\(\{\n\s+text: EXIT_PROMPT,\n\s+iconButtons: true,/);
    assert.match(read('js/quest-rooms/top-of-tree.js'), /ctx\.prompt\(\{ text: nag\.text, choices: \[\{ label: 'Ok', value: '' \}\], timeout: 10, timeoutValue: '' \}\)/);
    assert.match(read('js/quest-rooms/back-alley.js'), /kicker: 'Magic Rock', text: FUEL_HINT/);
  });

  it('ships the skill tiles the imagination SWF has for every remake skill family but Master Gardener', () => {
    for (const fam of ['teleportation', 'eyeballery', 'penmanship', 'woodworking', 'nudgery', 'bureaucraticarts', 'martialimagination']) {
      const name = `art_skill_${fam}`;
      assert.ok(CARD_ART_LAYERS.includes(name), name);
      const svg = readFileSync(join(PUBLIC, `assets/imagination/cards/${name}.svg`), 'utf8');
      assert.match(svg, /viewBox="0 0 230 310"/);
      assert.equal(skillArtFor(`${fam}_1`, CARD_ART_LAYERS), `assets/imagination/cards/${name}.svg`);
    }
    assert.equal(skillArtFor('mastergardener_1', CARD_ART_LAYERS), 'assets/imagination/cards/art_brain.svg', 'no tile in imagination_cards.swf');
  });

  it('keys every import of screen-fx.js the same (it holds the street card state)', () => {
    const keys = new Set();
    const walk = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== 'node_modules' && ent.name !== 'assets') walk(p);
        } else if (ent.name.endsWith('.js')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/(?:from |import\()'[./]*(?:public\/)?(?:js\/)?screen-fx\.js(\?v=[^']*)?'/g)) keys.add(m[1] || '');
        }
      }
    };
    walk(PUBLIC);
    walk(join(root, 'tests'));
    assert.equal(keys.size, 1, [...keys].join(' '));
    assert.ok([...keys][0], 'keyed');
  });
});

describe('one familiar module', () => {
  it('is imported under a single cache key everywhere (the rock ticker is shared)', () => {
    const keys = new Set();
    const walk = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== 'node_modules' && ent.name !== 'assets') walk(p);
        } else if (ent.name.endsWith('.js')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/from '[./]*(?:js\/)?familiar\.js(\?v=[^']*)?'/g)) keys.add(m[1] || '');
        }
      }
    };
    walk(PUBLIC);
    assert.equal(keys.size, 1, `familiar.js under ${[...keys].join(', ')}`);
    assert.ok([...keys][0].startsWith('?v='), 'familiar.js is imported with a key');
  });
});
