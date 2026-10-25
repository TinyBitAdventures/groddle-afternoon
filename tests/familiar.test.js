/**
 * The Magic Rock familiar, final 2012 form (G211 quest card, G218 skill
 * panel, G219 achievement drop, G220 voice-of-rock overlay).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACHIEVEMENT_DROP,
  PET_ROCK_SHEETS,
  QUEST_ROCK_WH,
  RAY_SETS,
  achievementBubbleText,
  easeOutBounce,
  familiarCardHeading,
  familiarLook,
  petRockFrameStyle,
  raySpinSeconds,
  rayWedgePaths,
  raysSvg,
  skillArtFor,
  skillLearnedActivity,
  skillLearnedModel,
  truncateLabel,
} from '../public/js/familiar.js?v=g211-1';
import {
  _resetFamiliarDialog,
  familiarDialogFeature,
  familiarDialogOpen,
  queueSkillLearned,
} from '../public/js/features/familiar-dialog-feature.js?v=g218-1';

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
    assert.equal(familiarLook({ kicker: 'Magic Rock' }), 'familiar');
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
    assert.match(game, /familiarLook\(\{ look: questDialogueState\.look, kicker: questDialogueState\.kicker, mode \}\)/);
    assert.match(game, /getElementById\('quest-dialogue-close'\)\?\.addEventListener\('click'/);
    assert.match(game, /offer: true,\n\s+urgent: urgent === true,/);
    assert.match(read('js/features/quest-offers-feature.js'), /urgent: card\.emergency === true/);
    assert.match(read('js/quest-rooms/top-of-tree.js'), /text: ROCK_LINE, choices: \[\{ label: 'OK', value: 'ok' \}\], look: 'vog', width: 500/);
    assert.match(read('js/features/smuggling-feature.js'), /kicker: 'Magic Rock', beats, look: 'vog', width: 500/);
    assert.match(read('js/features/quest-instances-feature.js'), /applyFamiliarLook\(dialog\.modal, \{ look, width \}\)/);
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
    assert.match(index, /import \{ familiarDialogFeature \} from '\.\/familiar-dialog-feature\.js\?v=g218-1'; FEATURES\.push\(familiarDialogFeature\);\n?$/);
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
    assert.deepEqual([...keys], ['?v=g211-1']);
  });
});
