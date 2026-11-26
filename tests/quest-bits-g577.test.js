/**
 * G577 (live reports 2026-11-08): #147 quest markup shown raw on a pinned quest, #143 the
 * encyclopedia saying a quest "takes you to a place of its own" when it doesn't, and #142 no
 * popup for a quest started from the Offered tab, with pinned quests first in the Quests sheet.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIN_STEPS_SHOWN, createQuestTracker, pinStepsHtml, questStepHtml } from '../public/js/ui/quest-tracker.js?v=9aeb6645';
import { questStep, orderQuestCards } from '../public/js/ui/quest-sheet.js?v=7409d5d8';
import { QUEST_MOVES_HERE, questTakesYouAway } from '../tools/encyclopedia/data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
const list = Array.isArray(quests) ? quests : quests.quests || Object.values(quests);
const quest = (id) => list.find((q) => q.classTsid === id);

describe('#147 a pinned quest draws its step as the Quests sheet does', () => {
  it('every step with markup comes out bold, never as raw tags', () => {
    const withTags = list.flatMap((q) => (q.requirements || []).filter((r) => /<[a-z]/i.test(r.desc || '')).map((r) => [q.classTsid, r]));
    assert.deepEqual(withTags.map(([id]) => id).sort(), [
      'mining_deplete_rocks_in_time_period',
      'soilappreciation_get_all_back_yard_trees_to_level10',
      'soilappreciation_plant_beans_in_back_yard_patches',
      'teleportation_teleport_between_zones',
    ]);
    for (const [id, r] of withTags) {
      const html = questStepHtml(questStep([{ ...r, current: 0 }]).step);
      assert.doesNotMatch(html, /&lt;|&gt;/, id);
      assert.match(html, /<b>[^<]+<\/b>/, id);
    }
    assert.equal(questStepHtml('Teleport to <b>Tamila</b> from <b>Shimla Mirch</b>'), 'Teleport to <b>Tamila</b> from <b>Shimla Mirch</b>');
  });

  it('anything else is escaped, and the row uses it (one tracker for both interfaces)', () => {
    assert.equal(questStepHtml('a <script>x</script> & b'), 'a x &amp; b');
    const tracker = readFileSync(join(root, 'public/js/ui/quest-tracker.js'), 'utf8');
    assert.match(tracker, /<span class="tq-step">\$\{questStepHtml\(r\.step\)\}<\/span>/);
    assert.match(tracker, /questTextPlain\(r\.step\)/);
  });
});

describe('#143 which quests take you somewhere', () => {
  it('a named location alone does not (Notice the Unnoticeable and the rest)', () => {
    for (const id of ['phantom_glitch', 'hell_hole', 'hell_quest', 'rook_hall', 'teleportation_rescue_pig', 'tend_to_your_community']) {
      assert.equal(questTakesYouAway(quest(id)), false, id);
    }
  });

  it('a room quest that moves you on start or accept does; a later part played in the room does not', () => {
    for (const id of ['help_juju_bandits', 'tower_quest', 'tower_quest_part3repeat']) assert.equal(questTakesYouAway(quest(id)), true, id);
    for (const id of ['le_miserable_part_2', 'smuggle_the_smuggler_part2', 'smuggle_the_smuggler_part3']) {
      assert.equal(questTakesYouAway(quest(id)), false, id);
      assert.ok(quest(id).instanceRoom, id);
    }
  });

  it("the remake's own cases, and a start it can't carry says nothing", () => {
    assert.deepEqual(Object.keys(QUEST_MOVES_HERE).sort(), ['rook_hall', 'rook_hall_start']);
    assert.equal(questTakesYouAway(quest('rook_hall_start')), true);
    // G682: both practice streets are rebuilt quest rooms now.
    assert.equal(questTakesYouAway(quest('soilappreciation_1')), true);
    assert.equal(questTakesYouAway(quest('ezcooking_1')), true);
    assert.equal(questTakesYouAway(quest('get_first_tool')), false);
  });

  it('the built page says it only for those', () => {
    const page = (id) => readFileSync(join(root, `public/encyclopedia/quests/${id}/index.html`), 'utf8');
    assert.doesNotMatch(page('phantom_glitch'), /takes you to a place of its own/);
    assert.match(page('help_juju_bandits'), /takes you to a place of its own/);
    assert.match(page('le_miserable_part_2'), /goes on in the place the quest before it took you to/);
  });
});

describe('#142 the Offered tab and pinned quests', () => {
  it("a quest started from an offer gets the conversation's popup and sound", () => {
    const f = readFileSync(join(root, 'public/js/features/quest-offers-feature.js'), 'utf8');
    assert.match(f, /engine\.toast\?\.\(`New quest: \$\{def\.title\}`, 3600\);\s*engine\.playSound\?\.\('QUEST_ADDED', \{ volume: 0\.65 \}\);/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /playSfx\('alert', \{ volume: 0\.65 \}\);\s*pushActivity\(`New quest: \$\{def\.title\}\. /);
    assert.match(readFileSync(join(root, 'public/js/sound-moments.js'), 'utf8'), /alert: 'QUEST_ADDED'/);
  });

  it('pinned quests come first whatever the sort, each group keeping its order', () => {
    const rows = [
      { n: 0, title: 'Delta', progress: 0.1 },
      { n: 1, title: 'Alpha', progress: 0.9, pinned: true },
      { n: 2, title: 'Charlie', progress: 0.5 },
      { n: 3, title: 'Bravo', progress: 0.2, pinned: true },
    ];
    const ids = (s) => orderQuestCards(rows, s).map((r) => r.title);
    assert.deepEqual(ids('newest'), ['Alpha', 'Bravo', 'Delta', 'Charlie']);
    assert.deepEqual(ids('oldest'), ['Bravo', 'Alpha', 'Charlie', 'Delta']);
    assert.deepEqual(ids('name'), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
    assert.deepEqual(ids('progress'), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
    assert.deepEqual(orderQuestCards(rows.map((r) => ({ ...r, pinned: false })), 'name').map((r) => r.title), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('the sheet asks the pins', () => {
    const sheet = readFileSync(join(root, 'public/js/ui/quest-sheet.js'), 'utf8');
    assert.match(sheet, /pinned = Boolean\(n\.dataset\.quest && isPinned\(n\.dataset\.quest\)\)/);
    assert.match(readFileSync(join(root, 'public/game.js'), 'utf8'), /isPinned: \(classTsid\) => modernUi\(\) && Boolean\(questPins\(\)\?\.isPinned\(classTsid\)\)/);
  });
});

describe('#397 a quest of several steps shows them all', () => {
  const bubble = [{ desc: 'Make 7 x Tiny Bubble', current: 7, num: 7 }, { desc: 'Make 7 x Blue Bubble', current: 3, num: 7 }];
  const eggs = [
    { desc: 'Make a Fried Eggs', current: 1, num: 1 },
    { desc: 'Make a Basic Omelet', current: 1, num: 1 },
    { desc: 'Make a Bun', current: 0, num: 1 },
  ];

  it("the card head counts steps done (Eggs 'n' Basics 2/3) and the bar sums the counts (Bubble 1/2 at 71%)", () => {
    assert.equal(questStep(eggs).count, '2/3');
    const b = questStep(bubble);
    assert.deepEqual([b.count, b.percent, b.step, b.stepCount], ['1/2', 71, 'Make 7 x Blue Bubble', '3/7']);
    const sheet = readFileSync(join(root, 'public/js/ui/quest-sheet.js'), 'utf8');
    assert.match(sheet, /if \(step\.stepCount\) \{[\s\S]*?n\.className = 'qc-step-n';\s*n\.textContent = step\.stepCount;/);
    assert.match(sheet, /fill\.style\.width = `\$\{step\.percent\}%`;/);
    // Classic draws the head count in brackets after the step, so it says what it counts.
    assert.match(sheet, /count\.className = step\.steps \? 'qc-count qc-steps' : 'qc-count';/);
    assert.match(readFileSync(join(root, 'public/css/classic.css'), 'utf8'), /\.qc-count\.qc-steps:has\(\+ \.qc-step\)::after \{ content: " steps\)"; \}/);
  });

  it('the pinned row lists only the steps left (Blue 3/7) and folds the done ones into one line', () => {
    const html = pinStepsHtml(questStep(bubble).steps);
    assert.equal((html.match(/class="tq-req"/g) || []).length, 1);
    assert.match(html, /<span class="tq-req-text">Make 7 x Blue Bubble<\/span><span class="tq-req-n">3\/7<\/span>/);
    assert.match(html, /<i style="width:43%"><\/i>/);
    assert.doesNotMatch(html, /Tiny Bubble/);
    assert.match(html, /<span class="tq-done">1 done<\/span>/);
    assert.doesNotMatch(html, /more/);
    // A step of one shows its words and bar but no 0/1 (QuestTracker.as updateReq: need_num > 1).
    assert.doesNotMatch(pinStepsHtml(questStep(eggs).steps), /tq-req-n/);
  });

  it('up to three steps left, then "+N more"', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ desc: `Step ${i}`, current: i === 0 ? 2 : 0, num: 2 }));
    const html = pinStepsHtml(questStep(many).steps);
    assert.equal(PIN_STEPS_SHOWN, 3);
    assert.equal((html.match(/class="tq-req"/g) || []).length, 3);
    assert.match(html, /Step 1[\s\S]*Step 2[\s\S]*Step 3/);
    assert.doesNotMatch(html, /Step 4/);
    assert.match(html, /<span class="tq-more">\+2 more<\/span><span class="tq-done">1 done<\/span>/);
  });

  it('a quest of one step draws its row as before', () => {
    const one = questStep([{ desc: 'Pet Piggies', current: 2, num: 6 }]);
    assert.equal(one.steps, undefined);
    assert.equal(pinStepsHtml(one.steps), '');
    const list = { innerHTML: '', addEventListener() {}, contains: () => false, querySelector: () => null };
    const el = {
      hidden: false,
      parentElement: null,
      ownerDocument: { activeElement: null },
      classList: { toggle() {}, contains: () => false },
      querySelector: (sel) => (sel === '[data-pins-list]' ? list : null),
    };
    const tracker = createQuestTracker({ el });
    tracker.render([{ classTsid: 'p', title: 'Porcine Pleaser', ...one }], false);
    assert.match(list.innerHTML, /<span class="tq-n">2\/6<\/span><\/span><span class="tq-step">Pet Piggies<\/span><span class="tq-bar"/);
    assert.doesNotMatch(list.innerHTML, /tq-steps/);
    tracker.render([{ classTsid: 'b', title: 'Bubble Transmogrification', ...questStep(bubble) }], false);
    assert.match(list.innerHTML, /class="tq has-steps"/);
    assert.match(list.innerHTML, /<span class="tq-n">1\/2<\/span><\/span><span class="tq-steps">/);
    assert.doesNotMatch(list.innerHTML, /tq-step"|class="tq-bar"/, 'the step list stands in for the one step line and bar');
    assert.match(list.innerHTML, /aria-label="Bubble Transmogrification, 1 of 2 steps done: Make 7 x Blue Bubble 3\/7\. Open in Quests\./);
  });
});
