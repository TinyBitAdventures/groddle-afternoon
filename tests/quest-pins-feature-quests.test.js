/**
 * A quest a feature owns pins like a runner quest (Austin 2026-11-19: Pot Luck Day's "Pot's Empty
 * Table" could not be pinned). The quest is drawn into the Quests sheet by its feature
 * (pot-luck-feast-feature questLogCards), not by the quest runner, and the tracker under the left
 * pill kept only the runner's active quests (keepOnly(questState.active)), so its pin went the moment
 * it was made. Now a feature answers questPinInfo(id) with the quest's title and steps while it runs,
 * the tracker draws that row and keeps the pin, and the pin goes once the quest is done or its season
 * ends. Offers (the put-off cards) carry no data-quest, so they stay unpinnable.
 * Run: node --test tests/quest-pins-feature-quests.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl } from './social-fake-dom.js';
import { parseSeasonDate, seasonYearKey } from '../public/js/seasons.js?v=5d8f545a';
import { FEAST_SEASON, QUEST, QUEST_ID, questPinInfo } from '../public/js/pot-luck-feast.js?v=971888be';
import { questPinsFeature, resolveQuestPins } from '../public/js/features/quest-pins-feature.js?v=0e07d9a1';
import { questStep } from '../public/js/ui/quest-sheet.js?v=7409d5d8';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');

// The feature draws its card with createElement and appendChild.
class El extends FakeEl {
  appendChild(kid) { this.append(kid); return kid; }
}
globalThis.document ??= { createElement: (tag) => new El(tag) };
const { potLuckFeastFeature } = await import('../public/js/features/pot-luck-feast-feature.js?v=378a60e4');

const engineOn = (date) => ({ mode: 'solo', started: false, inv: {}, param: (k) => (k === 'seasondate' ? date : ''), setData() {}, query: () => null });
const IN_SEASON = '2026-11-24';
const OUT_OF_SEASON = '2026-12-20';
const active = { key: seasonYearKey(FEAST_SEASON, parseSeasonDate(IN_SEASON)), status: 'active', dishes: 2, dressed: 0, laid: 0 };

/** game.js renderPinnedQuests, as wired: runner quests from questState, the rest from the features. */
function trackerRows(pinIds, { runner = {}, feature = () => null } = {}) {
  return resolveQuestPins(pinIds, {
    runnerActive: (id) => Boolean(runner[id]),
    runnerRow: (id) => (runner[id] === 'hold' ? null : { classTsid: id, title: id }),
    featureRow: (id) => {
      const f = feature(id);
      return f ? { classTsid: id, title: f.title, ...questStep(f.requirements) } : null;
    },
  });
}

describe('Pot’s Empty Table answers a pin while it runs', () => {
  it('has an id the pins take', () => {
    questPinsFeature.restore({});
    assert.deepEqual(questPinsFeature.toggle(QUEST_ID), { ok: true, pinned: true });
    questPinsFeature.restore({});
  });

  it('gives its title and steps while active in season, and nothing offered, done or out of season', () => {
    const info = questPinInfo(active, true);
    assert.equal(info.title, QUEST.title);
    assert.deepEqual(info.requirements.map((r) => [r.current, r.num]), [[2, 3], [0, 1], [0, 3]]);
    assert.equal(questPinInfo(active, false), null);
    assert.equal(questPinInfo({ ...active, status: 'offered' }, true), null);
    assert.equal(questPinInfo({ ...active, status: 'done' }, true), null);
  });

  it('the feature: its active card names the quest (the Pin button) and the query answers it', () => {
    potLuckFeastFeature.restore({ quest: { ...active } }, engineOn(IN_SEASON));
    const [card] = potLuckFeastFeature.questLogCards();
    assert.equal(card.dataset.quest, QUEST_ID);
    assert.equal(potLuckFeastFeature.questPinInfo(QUEST_ID).title, QUEST.title);
    assert.equal(potLuckFeastFeature.questPinInfo('porcine_pleaser'), null);
  });

  it('the feature: done, or the season over, the card has no Pin and the query says so', () => {
    potLuckFeastFeature.restore({ quest: { ...active, status: 'done', dishes: 3, dressed: 1, laid: 3 } }, engineOn(IN_SEASON));
    assert.equal(potLuckFeastFeature.questLogCards()[0].dataset.quest, undefined);
    assert.equal(potLuckFeastFeature.questPinInfo(QUEST_ID), null);
    potLuckFeastFeature.restore({ quest: { ...active } }, engineOn(OUT_OF_SEASON));
    assert.equal(potLuckFeastFeature.questLogCards()[0].dataset.quest, undefined);
    assert.equal(potLuckFeastFeature.questPinInfo(QUEST_ID), null);
  });
});

describe('the tracker keeps a feature quest’s pin and draws its row', () => {
  before(() => questPinsFeature.restore({}));

  it('a pinned feature quest stays pinned and shows its title and current step', () => {
    questPinsFeature.toggle(QUEST_ID);
    const { keep, rows } = trackerRows(questPinsFeature.pins(), { feature: (id) => (id === QUEST_ID ? questPinInfo(active, true) : null) });
    assert.deepEqual(keep, [QUEST_ID]);
    assert.equal(questPinsFeature.keepOnly(keep), false);
    assert.deepEqual(questPinsFeature.pins(), [QUEST_ID]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, QUEST.title);
    assert.equal(rows[0].step, QUEST.steps[0].desc);
    assert.equal(rows[0].stepCount, '2/3');
  });

  it('runner quests are as before: on hold keeps the pin with no row, finished goes', () => {
    questPinsFeature.restore({ pins: ['porcine_pleaser', 'phantom'] });
    const { keep, rows } = trackerRows(questPinsFeature.pins(), { runner: { porcine_pleaser: 'hold' } });
    assert.deepEqual(keep, ['porcine_pleaser']);
    assert.deepEqual(rows, []);
    questPinsFeature.keepOnly(keep);
    assert.deepEqual(questPinsFeature.pins(), ['porcine_pleaser']);
  });

  it('the pin goes when the quest is done', () => {
    questPinsFeature.restore({ pins: [QUEST_ID] });
    const done = { ...active, status: 'done' };
    const { keep, rows } = trackerRows(questPinsFeature.pins(), { feature: () => questPinInfo(done, true) });
    assert.equal(questPinsFeature.keepOnly(keep), true);
    assert.deepEqual(questPinsFeature.pins(), []);
    assert.deepEqual(rows, []);
  });
});

describe('game.js asks the features for the quests they own', () => {
  const tracker = game.slice(game.indexOf('function renderPinnedQuests()'), game.indexOf('/** The pack stamp'));
  it('the tracker keeps what resolveQuestPins keeps (not the runner’s active quests alone)', () => {
    assert.match(tracker, /resolveQuestPins\(pins\.pins\(\)/);
    assert.match(tracker, /featureRow: \(classTsid\) => \{\s*const f = featureQuestPinInfo\(classTsid\)/);
    assert.match(tracker, /pins\.keepOnly\(keep\)/);
    assert.doesNotMatch(tracker, /keepOnly\(Object\.keys\(questState\.active/);
  });

  it('featureQuestPinInfo is the features’ questPinInfo, and a feature card’s head reads its steps', () => {
    assert.match(game, /features\.query\('questPinInfo', id, engine\)/);
    const sheet = game.slice(game.indexOf('const questSheet = createQuestSheet({'), game.indexOf('questSheet.bindMenu('));
    assert.match(sheet, /const f = featureQuestPinInfo\(classTsid\);/);
    // Classic draws no pins (#306): the Pin button and the pinned-first order are Modern's alone.
    assert.match(sheet, /extraActions: \(classTsid\) => \(classTsid && modernUi\(\) \? \[questPinButton\(classTsid\)\] : \[\]\)/);
  });
});
