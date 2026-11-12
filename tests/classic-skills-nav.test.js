/**
 * Classic Skills navigation (public/js/classic/classic-skills.js; Classic only): the hub's Skills cloud
 * shows what you could learn (ImgMenuSkills.as 109-160), a skill opens its own details view
 * (ImaginationSkillDetailsUI.as 60-119), Esc steps back one level (ImgMenuView.as onEscKey 653-666),
 * and the list's header is the study bar (ImaginationSkillsUI.as 120-215, 401-460, 657-669).
 * Run: node --test tests/classic-skills-nav.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLOUD_ICONS_MAX,
  CLOUD_ICONS_ROW,
  learnableOrder,
  skillsCloud,
  studyHeader,
  unlearnCancelPrompt,
  skillsEscStep,
  skillIconUrl,
} from '../public/js/classic/classic-skills.js?v=37dae8e4';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const skin = read('public/css/classic.css');
const tokens = read('public/style.css');
const block = skin.slice(skin.indexOf('/* === Classic skills (lane) === */'), skin.indexOf('/* === end Classic skills === */'));

const row = (classTsid, seconds, name = classTsid) => ({ classTsid, seconds, name });

describe('the hub\'s Skills cloud (ImgMenuSkills.as 109-160)', () => {
  it('five icons at most, three to a row', () => {
    assert.equal(CLOUD_ICONS_MAX, 5);
    assert.equal(CLOUD_ICONS_ROW, 3);
    const many = Array.from({ length: 9 }, (_, i) => row(`s${i}`, 100 + i));
    const cloud = skillsCloud({ learnable: many });
    assert.equal(cloud.icons.length, 5);
    assert.equal(cloud.sub, '9 available', 'the count is every learnable skill, not only those shown');
  });

  it('the client\'s order: shortest first, then by name without case (NCMsgHandler.as 2451-2454)', () => {
    const order = learnableOrder([row('c', 60, 'Cheffery'), row('b', 9, 'bogs'), row('a', 9, 'Alchemy'), row('d', 30, 'Dig')]);
    assert.deepEqual(order.map((r) => r.classTsid), ['a', 'b', 'd', 'c']);
    assert.deepEqual(skillsCloud({ learnable: [row('x', 50), row('y', 5)] }).icons, ['y', 'x']);
  });

  it('nothing to learn: "0 available", and the skill in study (or being unlearned) still shows (152-163)', () => {
    assert.deepEqual(skillsCloud({}), { icons: [], sub: '0 available' });
    assert.deepEqual(skillsCloud({ learnable: [], learning: { classTsid: 'mining_1' } }).icons, ['mining_1']);
    assert.deepEqual(skillsCloud({ learnable: [], unlearning: { classTsid: 'cheffery_1' } }).icons, ['cheffery_1']);
  });

  it('the icons are the skills\' own card art', () => {
    assert.match(skillIconUrl('animalkinship_2'), /art_skill_animalkinship\.svg$/);
  });

  it('the hub asks the engine each time it opens, and draws the icons and the count', () => {
    const hub = read('public/js/classic/classic-hub.js');
    assert.match(hub, /skillsCloud\(\{ learnable: engine\.skillsLearnable\(\)/);
    assert.match(hub, /refreshSkills\(\);\n\s+box\.hidden = false;/);
    assert.match(hub, /classic-hub-sub/);
    const game = read('public/game.js');
    assert.match(game, /skillsLearnable\(now = Date\.now\(\)\) \{/);
    assert.match(game, /entry\.status === 'available' \|\| entry\.status === 'studying' \|\| entry\.status === 'paused'/,
      'skills_learnable_list: not learned and learnable, the one in study included');
    assert.match(game, /skillStudyNow\(now = Date\.now\(\)\) \{/);
  });
});

describe('the study header (ImaginationSkillsUI.as 401-460)', () => {
  it('nothing in study: "Select a skill..."', () => {
    assert.deepEqual(studyHeader({}), { kind: 'none', select: 'Select a skill...' });
  });

  it('learning: "Learning", the whole name, the time left and the bar\'s progress', () => {
    const h = studyHeader({ learning: { classTsid: 'transcendentalradiation_3', name: 'Transcendental Radiation III', remainingSeconds: 116, progress: 0.25 } });
    assert.equal(h.kind, 'learn');
    assert.equal(h.verb, 'Learning');
    assert.equal(h.name, 'Transcendental Radiation III', 'never cut');
    assert.equal(h.time, '1:56 left');
    assert.equal(h.progress, 0.25);
    assert.equal(h.cancel, false);
  });

  it('accelerated learning is the fast bar; at 0 it reads "any second now!" (412)', () => {
    assert.equal(studyHeader({ learning: { classTsid: 'a', name: 'A', remainingSeconds: 5, progress: 0.9, isAccelerated: true } }).kind, 'fast');
    assert.equal(studyHeader({ learning: { classTsid: 'a', name: 'A', remainingSeconds: 0, progress: 1 } }).time, 'any second now!');
  });

  it('unlearning: teal, filling from the right, with a Cancel; a skill in study goes first (404)', () => {
    const un = { classTsid: 'mining_1', name: 'Mining I', remainingSeconds: 30, progress: 0.5 };
    const h = studyHeader({ unlearning: un });
    assert.deepEqual([h.kind, h.verb, h.cancel], ['unlearn', 'Unlearning', true]);
    assert.equal(studyHeader({ learning: { classTsid: 'b', name: 'B', remainingSeconds: 9, progress: 0 }, unlearning: un }).kind, 'learn');
    assert.match(block, /\[data-study="unlearn"\] \.classic-skills-fill \{\s*inset: 0 0 0 auto;/, 'anchored right');
    assert.match(tokens, /--c-classic-skill-unlearn-top: #75c1c2;/);
  });

  it('Cancel asks first, in the client\'s words (220-226, 661)', () => {
    assert.deepEqual(unlearnCancelPrompt('Mining I'), {
      title: 'Cancel Unlearning?',
      text: 'Are you sure you\'d like to cancel unlearning Mining I? Your unlearning progress will not be saved!',
      yes: 'Yes, cancel unlearning',
      no: 'Nevermind!',
    });
    const src = read('public/js/classic/classic-skills.js');
    assert.match(src, /engine\.scriptedDialogue\(\{/);
    assert.match(src, /'runSkillUnlearn', h\.classTsid, 'cancel', engine/);
  });

  it('Modern\'s study cards give way to the header in Classic only', () => {
    assert.match(block, /:root\[data-ui="classic"\] #game-root #skills-panel #skills-body > \.skill-tree-study \{ display: none; \}/);
  });
});

describe('details and Esc (ImaginationSkillDetailsUI.as, ImgMenuView.as 653-666)', () => {
  it('Esc steps back: details to the grid, the grid to the hub (the table: tests/classic-skills-grid.test.js)', () => {
    assert.equal(skillsEscStep('detail'), 'grid');
    assert.equal(skillsEscStep('grid'), 'hub');
  });

  it('one skill open at a time through the panel\'s own hook, which Modern never calls', () => {
    const panel = read('public/js/skills-panel.js');
    assert.match(panel, /export function openOnlySkillInPanel\(classTsid, box = null\)/);
    const game = read('public/game.js');
    assert.doesNotMatch(game, /openOnlySkillInPanel/);
    assert.doesNotMatch(read('public/js/features/unlearning-feature.js'), /openOnlySkillInPanel/);
  });

  it('a card opens its details; Back to Skills and Start learning return to it', () => {
    const src = read('public/js/classic/classic-skills.js');
    assert.match(src, /'Back to Skills'/);
    assert.match(src, /closest\?\.\('\.skill-row-head'\)/);
    assert.match(src, /e\.stopPropagation\(\);/, 'the row does not open in place');
    assert.match(src, /pendingStart && h\.kind !== 'none'/, 'started: back to the list (onAPIComplete)');
    assert.match(src, /hub\.open\(\)/, 'the grid steps back to the hub');
    assert.match(src, /topWindow\(doc, win\) !== panel/, 'a dialog over Skills keeps its own Esc');
    assert.match(src, /window\.addEventListener\('keydown', [^]*?, true\);/, 'ahead of the game\'s keys');
  });

  it('the details cross-fade in .3 s and the parts stay out of Modern', () => {
    assert.match(block, /\[data-classic-skills="detail"\] :is\(#skills-body, \.classic-skill-back\) \{ animation: classic-skills-in 0\.3s linear; \}/);
    assert.match(block, /prefers-reduced-motion: reduce/);
    const src = read('public/js/classic/classic-skills.js');
    assert.match(src, /class: 'classic-skills-study', 'data-study': 'none', hidden: true/);
    assert.match(src, /class: 'classic-skill-back', hidden: true/);
    assert.match(src, /study\.hidden = !on/);
  });

  it('Shift+S still opens Skills, which now steps back to the hub (TSMainView.as 892-912)', () => {
    const game = read('public/game.js');
    assert.match(game, /if \(e\.shiftKey && \(e\.key === 's' \|\| e\.key === 'S'\)\) \{\n\s+keys\.delete\(e\.key\);\n\s+if \(!e\.repeat\) openSkillsPanel\(\);/);
  });
});

describe('the study chip and the stylesheet block', () => {
  it('the chip shows the whole name (data-tip) instead of the 16-letter cut, in Classic', () => {
    assert.match(block, /#study-chip \.study-chip-name \{ display: none; \}/);
    assert.match(block, /#study-chip\[data-tip\]::before \{\s*content: attr\(data-tip\);/);
    assert.match(read('public/game.js'), /chip\.dataset\.tip = name;/, 'game.js keeps the whole name there');
  });

  it('one block at the end of classic.css, every rule under Classic', () => {
    assert.equal(skin.split('/* === Classic skills (lane) === */').length, 2);
    assert.equal(skin.split('/* === end Classic skills === */').length, 2);
    assert.ok(block.length > 100);
    // Top-level commas only (not those inside :is() or :has()).
    const parts = (sel) => {
      const out = [''];
      let depth = 0;
      for (const ch of sel) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && !depth) out.push('');
        else out[out.length - 1] += ch;
      }
      return out.map((p) => p.trim());
    };
    const selectors = block.replace(/\/\*[^]*?\*\//g, '').replace(/@keyframes[^{]+\{[^}]*\{[^}]*\}[^}]*\}/g, '')
      .split('}').map((r) => r.split('{').at(-2)?.trim()).filter((s) => s && !s.startsWith('@'));
    assert.ok(selectors.length > 20);
    for (const sel of selectors) for (const part of parts(sel)) assert.match(part, /^:root\[data-ui="classic"\]/, part);
  });

  it('no em-dashes in the lane\'s code or words', () => {
    for (const text of [read('public/js/classic/classic-skills.js'), block]) assert.doesNotMatch(text, /—/);
  });
});
