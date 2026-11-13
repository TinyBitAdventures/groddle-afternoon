/**
 * Classic Skills, the card grid and the full skill table (public/js/classic/classic-skills.js; Classic only):
 * the skills screen opens on 205 wide cards, three across, learnable skills first and locked ones up to
 * eleven, the one in study left out, then "...And N More. See full skill table" (ImaginationSkillsUI.as
 * showSkills 526-632; ImaginationSkillElementUI.as). The table, from that tile and the face menu's Skills
 * (PlayerInfoButtons.as:30), has one column per family with the ranks downward (our reading of the web
 * site's "Table o' skills", Flickr emdot_at_glitch_5947049425). Esc: table to grid, grid to hub.
 * Run: node --test tests/classic-skills-grid.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARD_W,
  GRID_COLS,
  GRID_MAX,
  CARD_NAME_MAX,
  NOTHING_TO_LEARN,
  cardName,
  cardTime,
  skillsGrid,
  skillAbbr,
  tableTileState,
  skillTable,
  skillsEscStep,
} from '../public/js/classic/classic-skills.js?v=6b2d5857';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const skin = read('public/css/classic.css');
const tokens = read('public/style.css');
const src = read('public/js/classic/classic-skills.js');
const block = skin.slice(skin.indexOf('/* === Classic skills (lane) === */'), skin.indexOf('/* === end Classic skills === */'));

const sk = (classTsid, seconds, canLearn = true, name = classTsid) => ({ classTsid, seconds, canLearn, name });

describe('the card (ImaginationSkillElementUI.as)', () => {
  it('205 wide, three across, eleven before the locked ones stop, names cut at 22', () => {
    assert.equal(CARD_W, 205);
    assert.equal(GRID_COLS, 3);
    assert.equal(GRID_MAX, 11);
    assert.equal(CARD_NAME_MAX, 22);
  });

  it('the name is cut with "..." past 22 letters (StringUtil.truncate)', () => {
    assert.equal(cardName('Transcendental Radiation III'), 'Transcendental Radi...');
    assert.equal(cardName('Transcendental Radi...').length, 22);
    assert.equal(cardName('Animal Kinship II'), 'Animal Kinship II');
  });

  it('the time is formatTime(seconds, true, true, 2): short words, two parts, "~" when cut', () => {
    assert.equal(cardTime(45), '45 sec');
    assert.equal(cardTime(90), '1 min 30 sec');
    assert.equal(cardTime(3600), '1 hr');
    assert.equal(cardTime(3725), '~1 hr 2 min');
    assert.equal(cardTime(86400 * 2 + 3600), '2 days 1 hr');
    assert.equal(cardTime(86400 + 61), '~1 day 1 min');
  });
});

describe('the grid (ImaginationSkillsUI.as showSkills 526-632)', () => {
  it('every learnable skill, shortest first, then locked ones up to eleven, the one in study left out', () => {
    const skills = [
      ...[50, 10, 30, 20, 40].map((s, i) => sk(`l${i}`, s)),
      ...Array.from({ length: 20 }, (_, i) => sk(`x${String(i).padStart(2, '0')}`, 5, false)),
    ];
    const g = skillsGrid({ skills, learning: { classTsid: 'l3' } });
    assert.deepEqual(g.cards.slice(0, 4).map((c) => c.classTsid), ['l1', 'l2', 'l4', 'l0'], 'l3 (20 s) is in study');
    assert.equal(g.cards.length, 10, 'indices 0-10, one skipped');
    assert.ok(g.cards.slice(4).every((c) => !c.canLearn && c.time === 'Can\'t learn'));
    // total 25, less the one in study (601-602), less the 11 looked at.
    assert.deepEqual(g.more, { lead: '...And 13 More.', link: 'See full skill table', span: 2, br: false });
  });

  it('more learnable skills than eleven: all of them get cards', () => {
    const skills = [...Array.from({ length: 14 }, (_, i) => sk(`l${i}`, i + 1)), sk('x', 1, false)];
    const g = skillsGrid({ skills });
    assert.equal(g.cards.length, 14);
    assert.deepEqual(g.more, { lead: '...And 1 More.', link: 'See full skill table', span: 1, br: true }, 'one card\'s room: two lines');
  });

  it('nothing left over: "See all skills in the full skill table", across a whole row when the last is full', () => {
    const g = skillsGrid({ skills: Array.from({ length: 6 }, (_, i) => sk(`l${i}`, i)) });
    assert.deepEqual(g.more, { lead: 'See all skills in', link: 'the full skill table', span: 3, br: false });
  });

  it('one row only: no "more" tile (`total && next_y`, 588)', () => {
    assert.equal(skillsGrid({ skills: [sk('a', 1), sk('b', 2), sk('c', 3)] }).more, null);
  });

  it('nothing at all: no cards; the empty words are the web page\'s', () => {
    assert.deepEqual(skillsGrid({}), { cards: [], more: null, total: 0 });
    assert.equal(NOTHING_TO_LEARN, 'No skills to learn right now...');
  });
});

describe('the full skill table (our reading of the "Table o\' skills" photo)', () => {
  const catalog = JSON.parse(read('public/assets/content/skills.json'));
  const learned = new Set(['animalkinship_1', 'animalkinship_2', 'soil_appreciation_1']);
  const rows = Object.values(catalog).map((d) => ({
    classTsid: d.classTsid,
    name: d.level ? `${d.name} ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][d.level]}` : d.name,
    family: d.name,
    level: d.level || 0,
    categoryId: d.categoryId,
    reqs: d.reqSkills || [],
    status: learned.has(d.classTsid) ? 'learned' : d.classTsid === 'animalkinship_3' ? 'studying' : d.classTsid === 'soil_appreciation_2' ? 'available' : 'locked',
  }));
  const groups = skillTable(rows, { learning: { classTsid: 'animalkinship_3' } });
  const families = groups.flatMap((g) => g.families);
  const tiles = families.flatMap((f) => f.tiles);

  it('every skill once, one column per family, ranks downward, the kinds in the panel\'s order', () => {
    assert.equal(tiles.length, rows.length);
    assert.equal(families.length, new Set(rows.map((r) => r.family)).size);
    assert.deepEqual(groups.map((g) => g.name), ['Animals', 'Growing', 'Gathering', 'Cooking', 'Alchemy', 'Industrial', 'Intellectual']);
    const ak = families.find((f) => f.name === 'Animal Kinship');
    assert.deepEqual(ak.tiles.map((t) => t.sup), ['1', '2', '3', '4', '5', '6', '7']);
    assert.equal(ak.abbr, 'AK');
    assert.equal(families.find((f) => f.name === 'Botany').tiles[0].sup, '', 'a one-rank skill has no raised number');
  });

  it('a kind\'s families by prerequisite depth, then name: Animal Kinship before Animal Husbandry', () => {
    const animals = groups[0].families.map((f) => f.name);
    assert.equal(animals[0], 'Animal Kinship');
    assert.ok(animals.indexOf('Animal Kinship') < animals.indexOf('Animal Husbandry'));
  });

  it('tiles carry their state', () => {
    const state = (id) => tiles.find((t) => t.classTsid === id).state;
    assert.equal(state('animalkinship_1'), 'learned');
    assert.equal(state('animalkinship_3'), 'studying');
    assert.equal(state('soil_appreciation_2'), 'learnable');
    assert.equal(state('soil_appreciation_5'), 'locked');
    assert.equal(tableTileState('paused', 'a'), 'learnable');
    assert.equal(tableTileState('learned', 'a', { unlearning: { classTsid: 'a' } }), 'unlearning');
  });

  it('letters: each word\'s first, a capitalised word whole', () => {
    assert.equal(skillAbbr('Light Green Thumb'), 'LGT');
    assert.equal(skillAbbr('EZ Cooking'), 'EZC');
    assert.equal(skillAbbr('Botany'), 'B');
    assert.equal(skillAbbr('Jellisac Hands'), 'JH');
  });

  it('the source note says the layout is our reading of the photo', () => {
    assert.match(src, /OUR READING of Emdot's photo \(Flickr photo 5947049425/);
    assert.match(block, /OUR READING of the web site's "Table o' skills"/);
  });
});

describe('ways in and Esc', () => {
  it('Esc steps back one level: table to grid, grid to hub, details to where they came from', () => {
    assert.equal(skillsEscStep('table'), 'grid');
    assert.equal(skillsEscStep('grid'), 'hub');
    assert.equal(skillsEscStep('detail', 'table'), 'table');
    assert.equal(skillsEscStep('detail', 'grid'), 'grid');
  });

  it('the "more" tile and the face menu\'s Skills open the table; cards and tiles open the details', () => {
    assert.match(src, /closest\?\.\('\.classic-skills-more'\)\) \{ click\(\); showTable\(\); \}/);
    assert.match(src, /closest\?\.\('#player-menu \.pm-buttons button'\)/);
    assert.match(src, /textContent\.trim\(\) !== 'Skills'/);
    assert.match(read('public/game.js'), /\['Skills', \(\) => document\.getElementById\('skills-btn'\)\?\.click\(\)\]/, 'the face menu\'s Skills button');
    assert.match(src, /showDetail\(c\.dataset\.skill, \{ origin: 'grid' \}\)/);
    assert.match(src, /showDetail\(t\.dataset\.skill, \{ origin: 'table' \}\)/);
  });

  it('the engine lists every skill with its family, rank, kind and state', () => {
    const game = read('public/game.js');
    assert.match(game, /skillsAll\(now = Date\.now\(\)\) \{/);
    assert.match(game, /family: entry\.def\.name \|\| entry\.title,\n\s+level: Number\(entry\.def\.level\) \|\| 0,\n\s+categoryId: entry\.def\.categoryId,/);
  });
});

describe('the stylesheet', () => {
  it('the screen is wide enough for three 205 cards; the grid is three across', () => {
    assert.match(block, /#skills-panel > \.side-card \{ width: min\(calc\(690 \* var\(--cu\)\), 100%\); \}/);
    assert.match(block, /grid-template-columns: repeat\(3, minmax\(0, calc\(205 \* var\(--cu\)\)\)\);/);
    assert.match(block, /gap: calc\(12 \* var\(--cu\)\) calc\(7 \* var\(--cu\)\);/);
  });

  it('locked cards greyed with the lock; tiles ticked, ringed or faded', () => {
    assert.match(block, /\.classic-skills-card\[data-can="no"\] \.classic-skills-card-icon > img:first-child \{ filter: grayscale\(1\); opacity: 0\.7; \}/);
    assert.match(block, /\.classic-skills-tile\[data-state="locked"\] \{ opacity: 0\.4; \}/);
    assert.match(block, /\.classic-skills-tile\[data-state="learned"\]::after/);
    for (const k of ['animals', 'growing', 'gathering', 'cooking', 'alchemy', 'industrial', 'intellectual']) {
      assert.match(block, new RegExp(`\\[data-cat="${k}"\\] \\.classic-skills-tile \\{ --tile: var\\(--c-classic-skill-cat-${k}\\); \\}`));
      assert.match(tokens, new RegExp(`--c-classic-skill-cat-${k}: #[0-9a-f]{6};\\s*/\\* PROPOSED`));
    }
  });

  it('no em-dashes', () => {
    assert.doesNotMatch(src, /—/);
    assert.doesNotMatch(block, /—/);
  });
});
