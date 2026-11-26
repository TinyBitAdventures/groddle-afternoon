// #671 Sparkly of Interest: "Tried mining but it isn't progressing at all." Mining Sparkly on Neva Neva
// was summed out of sight (quest-offers offers.distinct) behind two 0/1 flags, so the row sat at 0
// until the hidden sum reached 100; the grind row read Tiny Speck's placeholder "Toggle flag
// grind_100_chunks_of_sparkly_in_neva_neva". Now each requirement counts to 100 on its own row.
// Also R53: a counted requirement shows its count. Run: node --test tests/sparkly-of-interest671.test.js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir, resetContentCatalogs, getQuestCatalog } from '../public/js/content-catalogs.js?v=c9b84764';
import { createQuestState, listQuestLog, listQuestTracker } from '../public/js/quests.js?v=f68437db';
import { acceptOffer, routeQuestEvent, makingUnitQuestEvents, COUNTER_ROUTES } from '../public/js/quest-offers.js?v=7e00498b';
import { normalizeQuestSnapshot } from '../public/js/player-save.js?v=f7062a6d';
import { questRequirementText } from '../public/js/quest-text.js?v=d0d07996';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Q = 'sparkly_of_interest_2';
const MINE = 'mine_100_sparkly_while_in_neva_neva';
const GRIND = 'grind_100_chunks_of_sparkly_in_neva_neva';

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(ROOT, 'public/assets/content'));
});

function started() {
  const qs = createQuestState();
  qs.completed.push('sparkly_of_interest_1');
  assert.equal(acceptOffer(qs, Q, { now: 1 }).ok, true);
  return qs;
}
const logRow = (qs, id = Q) => listQuestLog(qs).find((r) => r.def.classTsid === id);
const req = (qs, name, id = Q) => logRow(qs, id).requirements.find((r) => r.name === name);
// One Grinder crush of a Chunk of Sparkly on a street (recipes.json crush_sparkly, game.js noteMadeUnit).
const crush = (street) => makingUnitQuestEvents({ recipe: { tool: 'ore_grinder', inputs: [{ classTsid: 'sparkly', qty: 1 }], outputs: [{ classTsid: 'element_red', qty: 5 }] }, made: 1 }, { street });

describe('#671 Sparkly of Interest counts where the player can see it', () => {
  it('each swing on Neva Neva moves the mine row: 60 chunks read 60/100', () => {
    const qs = started();
    // game.js runWorldVerb: one event per swing with the chunks taken (the browser run took 5, 3, 3).
    for (let i = 0; i < 6; i++) routeQuestEvent(qs, 'sparkly_mined_in:neva_neva', 10);
    const mine = req(qs, MINE);
    assert.equal(mine.num, 100);
    assert.equal(mine.current, 60);
    assert.equal(questRequirementText(mine.desc, mine.current, mine.num), 'Mine 100 chunks of sparkly while in Neva Neva (60/100)');
    const pinned = listQuestTracker(qs, 5).find((r) => r.classTsid === Q).requirements.find((r) => r.name === MINE);
    assert.deepEqual([pinned.current, pinned.total], [60, 100]);
  });

  it('chunks mined on another street do not count', () => {
    const qs = started();
    routeQuestEvent(qs, 'sparkly_mined_in:ajaya_bliss', 40);
    assert.equal(req(qs, MINE).current, 0);
  });

  it('grinding Sparkly on Neva Neva moves the grind row, which reads as words', () => {
    const qs = started();
    for (let i = 0; i < 7; i++) for (const row of crush('neva_neva')) routeQuestEvent(qs, row.event, row.amount);
    for (const row of crush('ajaya_bliss')) routeQuestEvent(qs, row.event, row.amount);
    const grind = req(qs, GRIND);
    assert.equal(grind.current, 7);
    assert.equal(questRequirementText(grind.desc, grind.current, grind.num), 'Grind 100 chunks of sparkly while in Neva Neva (7/100)');
  });

  it('finishes at 100 mined and 100 ground on Neva Neva, not before', () => {
    const qs = started();
    let done = [];
    for (let i = 0; i < 25; i++) done.push(...routeQuestEvent(qs, 'sparkly_mined_in:neva_neva', 4).completable);
    for (let i = 0; i < 99; i++) for (const row of crush('neva_neva')) done.push(...routeQuestEvent(qs, row.event, row.amount).completable);
    assert.deepEqual(done, [], '100 mined and 99 ground is not done');
    for (const row of crush('neva_neva')) done.push(...routeQuestEvent(qs, row.event, row.amount).completable);
    assert.deepEqual(done.map((r) => r.classTsid), [Q]);
    assert.deepEqual(logRow(qs).requirements.map((r) => `${r.current}/${r.num}`), ['100/100', '100/100']);
  });

  it('Another Simple Sample counts the same way in Ajaya Bliss', () => {
    const qs = createQuestState();
    qs.completed.push('sparkly_of_interest_1', Q, 'sparkly_of_interest_3');
    assert.equal(acceptOffer(qs, 'sparkly_of_interest_4', { now: 1 }).ok, true);
    routeQuestEvent(qs, 'sparkly_mined_in:ajaya_bliss', 9);
    routeQuestEvent(qs, 'sparkly_mined_in:neva_neva', 9);
    for (const row of crush('ajaya_bliss')) routeQuestEvent(qs, row.event, row.amount);
    assert.deepEqual(logRow(qs, 'sparkly_of_interest_4').requirements.map((r) => `${r.desc} ${r.current}/${r.num}`), [
      'Mine 100 chunks of sparkly while in Ajaya Bliss 9/100',
      'Grind 100 chunks of sparkly while in Ajaya Bliss 1/100',
    ]);
  });
});

describe('#671 the count is kept by the save', () => {
  it('survives a save and a load (solo and online saves both load through normalizeQuestSnapshot)', () => {
    const qs = started();
    routeQuestEvent(qs, 'sparkly_mined_in:neva_neva', 37);
    const back = normalizeQuestSnapshot(JSON.parse(JSON.stringify(qs)));
    assert.equal(back.active[Q].progress[MINE], 37);
    routeQuestEvent(back, 'sparkly_mined_in:neva_neva', 63);
    assert.equal(req(back, MINE).current, 100);
  });

  it('a save from before keeps the chunks it summed out of sight, and a flipped flag reads as done', () => {
    const old = {
      active: { [Q]: { classTsid: Q, progress: {}, startedAt: 1 }, sparkly_of_interest_4: { classTsid: 'sparkly_of_interest_4', progress: { mine_100_sparkly_in_ajaya_bliss: 1 }, startedAt: 1 } },
      completed: ['sparkly_of_interest_1'],
      offers: {
        managed: { [Q]: 1 },
        distinct: {
          [Q]: { [`sum:${MINE}`]: ['sparkly_mined_in:neva_neva:57'], [`sum:${GRIND}`]: ['sparkly_ground_in:neva_neva:3'] },
          sparkly_of_interest_4: { 'sum:mine_100_sparkly_in_ajaya_bliss': ['sparkly_mined_in:ajaya_bliss:104'] },
        },
      },
    };
    const back = normalizeQuestSnapshot(old);
    assert.deepEqual(back.active[Q].progress, { [MINE]: 57, [GRIND]: 3 });
    assert.equal(back.active.sparkly_of_interest_4.progress.mine_100_sparkly_in_ajaya_bliss, 100);
    assert.equal(back.offers.distinct[Q]?.[`sum:${MINE}`], undefined, 'the sum moves into the row, once');
    assert.deepEqual(normalizeQuestSnapshot(JSON.parse(JSON.stringify(back))).active[Q].progress, { [MINE]: 57, [GRIND]: 3 });
  });
});

describe('R53: a counted requirement shows its count on its row', () => {
  it('no requirement is summed toward a number behind a 0/1 row', () => {
    const bad = [];
    for (const def of Object.values(getQuestCatalog())) {
      for (const r of def.requirements || []) {
        for (const route of COUNTER_ROUTES) {
          if (!route.threshold || route.counter !== r.name) continue;
          // A threshold route adds 1 per label that reaches it (Betterlearning: one per Giant, 0/5).
          // On a flag that 1 is the whole row: the amounts behind it never show.
          if (r.type !== 'counter' || !(Number(r.num) > 1)) bad.push(`${def.classTsid} ${r.name}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});
