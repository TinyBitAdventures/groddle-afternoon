// G222: the learn button's own words (ImaginationSkillDetailsUI.as setLearnButton
// 203-246) and the study bar's colours and arrows (ImaginationSkillsUI.as 200-263,
// 401-460, 501-517; ProgressBar.as).
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js';
import { learnButtonText, studyBarKind } from '../public/js/skills-panel.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const imagination = join(here, '../../glitch-client/com/tinyspeck/engine/view/ui/imagination');
const A = 'animalkinship_1';
const B = 'ezcooking_1';

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
});

describe('the learn button (setLearnButton)', () => {
  it('the client wording', { skip: !existsSync(imagination) && 'no client checkout' }, () => {
    const src = readFileSync(join(imagination, 'ImaginationSkillDetailsUI.as'), 'utf8');
    assert.match(src, /var label_txt:String = 'Start learning this skill';/);
    assert.match(src, /label_txt = 'Switch to '\+\(current_details\.learning && current_details\.paused \? 'resume' : 'start'\)\+' learning this instead';/);
    assert.match(src, /txt = 'You\\'ve got this skill on pause at the moment';\s*label_txt = 'Resume learning this skill';/);
  });

  it('nothing studying: start, or resume with the on-pause tip', () => {
    assert.deepEqual(learnButtonText({ classTsid: B, status: 'available' }, null), { label: 'Start learning this skill', note: null });
    const paused = learnButtonText({ classTsid: B, status: 'paused' }, null);
    assert.equal(paused.label, 'Resume learning this skill');
    assert.deepEqual(paused.note, { kind: 'on-pause', lines: ["You've got this skill on pause at the moment"] });
  });

  it('another skill studying: switch to start or resume, with the switch note', () => {
    const active = { classTsid: A, isAccelerated: false };
    const start = learnButtonText({ classTsid: B, status: 'available' }, active);
    assert.equal(start.label, 'Switch to start learning this instead');
    assert.equal(start.note.kind, 'paused');
    assert.match(start.note.lines[0], /^Your progress on .+ will be paused$/);
    const resume = learnButtonText({ classTsid: B, status: 'paused' }, { classTsid: A, isAccelerated: true });
    assert.equal(resume.label, 'Switch to resume learning this instead');
    assert.equal(resume.note.kind, 'accelerated');
  });

  it('the panel uses it for the row button, the note and the paused card', () => {
    const panel = read('js/skills-panel.js');
    assert.doesNotMatch(panel, /Start studying ·|Resume ·|'Resume study'/);
    assert.match(panel, /btn\.textContent = learnButtonText\(entry, active\)\.label;/);
    assert.match(panel, /\? learnButtonText\(entry, active\)\.note/);
    assert.match(panel, /row\.isPaused \? learnButtonText\(\{ classTsid: row\.classTsid, status: 'paused' \}, active\)\.label : 'Pause study'/);
  });
});

describe('the study bar', () => {
  it('the client colours and arrows', { skip: !existsSync(imagination) && 'no client checkout' }, () => {
    const src = readFileSync(join(imagination, 'ImaginationSkillsUI.as'), 'utf8');
    for (const hex of ['afca2f', '95b101', '9db52e', '879f08', 'f5e242', 'd79305', 'b38b00', '9a7802']) {
      assert.match(src, new RegExp(`0x${hex}\\)`), hex);
    }
    assert.match(src, /\[0xf6e571, 0xedcb35\]/);
    assert.match(src, /private static const ARROW_W:uint = 17;\s*private static const ARROW_H:uint = 25;\s*private static const ARROW_PADD:uint = 7;/);
    assert.match(src, /TSTweener\.addTween\(arrows, \{x:0, time:\.4, transition:'linear'/);
  });

  it('learning, accelerated and paused bars', () => {
    assert.equal(studyBarKind({ isPaused: false, isAccelerated: false }), 'learn');
    assert.equal(studyBarKind({ isPaused: false, isAccelerated: true }), 'fast');
    assert.equal(studyBarKind({ isPaused: true, isAccelerated: false }), 'paused');
    assert.equal(studyBarKind(null), 'learn');
    const panel = read('js/skills-panel.js');
    assert.match(panel, /if \(kind === 'fast'\) fill\.appendChild\(el\('span', 'skill-study-arrows'\)\);/);
    assert.match(panel, /card\.appendChild\(studyBar\(unlearning\.progress, 'unlearn'\)\);/);
    assert.match(panel, /`skill-study-time\$\{row\.isAccelerated \? ' is-fast' : ''\}`/);
  });

  it('style.css draws them in those colours, with the arrows scrolling one step every 0.4 s', () => {
    const css = read('style.css');
    const block = css.slice(css.indexOf('/* G222: study bars'), css.indexOf('.skill-study-card .skill-study-time.is-fast'));
    assert.match(block, /linear-gradient\(180deg, #afca2f, #95b101\)/);
    assert.match(block, /linear-gradient\(180deg, #9db52e, #879f08\) right \/ 2px 100% no-repeat/);
    assert.match(block, /linear-gradient\(180deg, #f5e242, #d79305\)/);
    assert.match(block, /stop-color='%23f6e571'.*stop-color='%23edcb35'/);
    assert.match(block, /width='24' height='25'.*M0 0v25l17-12\.5z/);
    assert.match(block, /animation: skill-study-arrows 0\.4s linear infinite;/);
    assert.match(block, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
