/**
 * VERBS (phase 2 modern UI): the verb menu's placement and keys, the Quests sheet's steps and
 * rewards, the panel shell's wiring and the pinned quests' save slice.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeVerbMenu, plainWords, verbRowKeys, verbRowInner, verbRowAttrs } from '../public/js/ui/verb-menu.js?v=g477-1';
import { questCardTab, questRewardChips, questStep } from '../public/js/ui/quest-sheet.js?v=g477-1';
import { MAX_QUEST_PINS, normalizeQuestPins, questPinsFeature } from '../public/js/features/quest-pins-feature.js?v=g469-3';
import { FEATURES } from '../public/js/features/index.js?v=registry-369';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const room = { w: 1280, h: 800, top: 52, floor: 736, left: 8, right: 60 };

describe('the verb menu (js/ui/verb-menu.js)', () => {
  it('sits above the thing with its tail on it', () => {
    const p = placeVerbMenu({ anchor: { left: 500, top: 500, right: 560, bottom: 560 }, size: { w: 240, h: 200 }, room });
    assert.equal(p.below, false);
    assert.equal(p.y, 500 - 12 - 200);
    assert.equal(p.x, 530 - 120);
    assert.equal(p.tail, 120 - 8);
  });

  it('points into a tall thing whose top is off the view, and flips below one with no room above', () => {
    const tree = placeVerbMenu({ anchor: { left: 100, top: 0, right: 300, bottom: 600 }, size: { w: 240, h: 200 }, room });
    assert.equal(tree.below, false);
    assert.equal(tree.y, 52);
    const high = placeVerbMenu({ anchor: { left: 600, top: 60, right: 640, bottom: 100 }, size: { w: 240, h: 200 }, room });
    assert.equal(high.below, true);
    assert.equal(high.y, 112);
  });

  it('steps off the avatar when the tail can still reach, and stays inside the insets', () => {
    const avatar = { left: 480, top: 300, right: 560, bottom: 520 };
    const p = placeVerbMenu({ anchor: { left: 560, top: 500, right: 620, bottom: 540 }, size: { w: 240, h: 200 }, room, avoid: avatar });
    assert.ok(p.x >= avatar.right || p.x + 240 <= avatar.left, 'clear of the avatar');
    assert.ok(p.tail != null);
    const edge = placeVerbMenu({ anchor: { left: 1250, top: 500, right: 1270, bottom: 540 }, size: { w: 240, h: 200 }, room });
    assert.equal(edge.x, 1280 - 60 - 240);
  });

  it('keys rows 1-9 with the back row 0, and draws cost, gain, count, chevron and lock', () => {
    assert.deepEqual(verbRowKeys([{ back: true }, {}, {}]), ['0', '1', '2']);
    assert.equal(verbRowKeys(Array.from({ length: 11 }, () => ({})))[10], '');
    assert.match(verbRowInner({ key: '1', label: 'pet', cost: 4 }), /vm-cost[^>]*aria-label="4 energy"/);
    assert.match(verbRowInner({ key: '2', label: 'Eat one', gain: '+4' }), /vm-gain">\+4</);
    assert.match(verbRowInner({ key: '3', label: 'feed', next: true }), /vm-chev/);
    assert.match(verbRowInner({ key: '4', label: 'capture', disabled: true, cost: 20 }), /vm-lock/);
    assert.match(verbRowAttrs({ disabled: true, reason: 'You need <b>Herdkeeping</b>.' }), /aria-disabled="true" data-vm-reason="You need Herdkeeping\."/);
    assert.equal(plainWords('Give <a href="x">Piggies</a>&nbsp;love'), 'Give Piggies love');
  });

  it('game.js keeps every verb and its order, and both skins get the anchor', () => {
    const game = read('game.js');
    assert.match(game, /const verbs = menuVerbsFor\(target\);\n[\s\S]*?renderVerbMenu\(target, verbs\);/);
    assert.match(game, /if \(verbMenuKey\(document\.getElementById\('verb-menu'\), e\)\)/);
    for (const v of ['--vm-anchor-left', '--vm-anchor-x', '--vm-left', '--vm-top', '--vm-bottom', '--vm-tail']) assert.ok(game.includes(`'${v}'`), v);
  });
});

describe('the Quests sheet (js/ui/quest-sheet.js)', () => {
  it('shows the first step not done, its count and how far along', () => {
    assert.deepEqual(questStep([{ desc: 'Pet Piggies', current: 4, num: 6 }]), { step: 'Pet Piggies', count: '4/6', percent: 67 });
    assert.deepEqual(questStep([{ desc: 'A', current: 1, num: 1 }, { desc: 'B', current: 0, num: 2 }]).step, 'B');
    assert.equal(questStep([]).count, '');
  });

  it('says a quest\'s rewards in short chips', () => {
    assert.deepEqual(questRewardChips({ xp: 200, currants: 50, energy: 30, favor: { 0: { giant: 'humbaba', points: 10 } } }), ['+200 iMG', '+50 currants', '+30 energy', '+10 favor']);
  });

  it('sorts cards into Active, Offered and Done', () => {
    const card = (cls) => ({ classList: { contains: (c) => cls.split(' ').includes(c) } });
    assert.equal(questCardTab(card('q-card')), 'active');
    assert.equal(questCardTab(card('q-card q-put-off')), 'offered');
    assert.equal(questCardTab(card('q-card story-offer')), 'offered');
    assert.equal(questCardTab(card('q-card done')), 'done');
  });

  it('the play page has the tabs, and the panels keep their ids', () => {
    const html = read('play/index.html');
    for (const id of ['quest-panel', 'quest-tabs', 'quest-tab-active', 'quest-tab-offered', 'quest-tab-done', 'quest', 'quest-meta', 'quest-close', 'make-panel', 'make-title', 'make-tools', 'make-search', 'make-canmake', 'make-list', 'map-panel', 'map-hub-title', 'quest-pins']) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.match(html, /id="make-canmake" checked/);
  });
});

describe('the panel shell and the pinned quests', () => {
  it('game.js mounts the shell with Quests, Make, Badges, Skills, Buffs and the Map', () => {
    const game = read('game.js');
    for (const id of ['quest-panel', 'make-panel', 'achieve-panel', 'skills-panel', 'buffs-panel']) assert.ok(game.includes(`{ id: '${id}', close:`), id);
    assert.match(game, /\{ id: 'map-panel', kind: 'center', close: \(\) => closeMap\(\) \}/);
    assert.match(game, /sideInsetLeft: \(\) => panelShell\?\.insetLeft\(\) \|\| 0,/);
  });

  it('keeps at most two pins, in order, and rides in the save as a feature slice', () => {
    assert.equal(MAX_QUEST_PINS, 2);
    assert.ok(FEATURES.includes(questPinsFeature));
    questPinsFeature.restore(undefined);
    assert.deepEqual(questPinsFeature.save(), { pins: [], collapsed: false });
    assert.equal(questPinsFeature.toggle('animalkinship_pet_piggies').pinned, true);
    assert.equal(questPinsFeature.toggle('legalize_it').pinned, true);
    assert.equal(questPinsFeature.toggle('third_quest').reason, 'full');
    questPinsFeature.setCollapsed(true);
    const slice = JSON.parse(JSON.stringify(questPinsFeature.save()));
    assert.deepEqual(slice, { pins: ['animalkinship_pet_piggies', 'legalize_it'], collapsed: true });
    questPinsFeature.restore(slice);
    assert.equal(questPinsFeature.isPinned('legalize_it'), true);
    assert.equal(questPinsFeature.keepOnly(['legalize_it']), true);
    assert.deepEqual(questPinsFeature.pins(), ['legalize_it']);
    assert.deepEqual(normalizeQuestPins({ pins: ['a', 'a', 'b', 'c', '<bad>'], collapsed: 'yes' }), { pins: ['a', 'b'], collapsed: false });
    questPinsFeature.restore(undefined);
  });
});
