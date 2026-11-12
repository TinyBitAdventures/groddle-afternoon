/**
 * Player report #83: some quests move you the moment you accept them, and
 * the offer said so only in its own words. 47 of the 62 startable quests
 * (onStarted) move you in the source: questInstanceLocation
 * (quest_scripting.js), the instances_create_delayed event or
 * teleportToLocationDelayed, all from "Ok, I'll do it!" (accept_and_start,
 * main.js doQuestConversationChoice 6033-6049). build-quests.mjs records that
 * as movesOnStart, and the offer card says "Accepting takes you somewhere
 * new." on its last page where the remake carries the move (a rebuilt room,
 * or the quest's own module).
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { getQuestCatalog, loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=10b118dd';
import { QUEST_MOVES_NOTE, questMoveNote, questOfferCard } from '../public/js/quest-offers.js?v=d76abcd0';
import { QUEST_ROOMS } from '../public/js/quest-rooms/catalog.js?v=d77d3d17';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const GS_QUESTS = join(ROOT, '../glitch-GameServerJS/quests');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

/** What each startable quest's onStarted calls, read from the source itself. */
function sourceStarts() {
  const out = {};
  for (const [id, def] of Object.entries(getQuestCatalog())) {
    if (!def.needsStart) continue;
    const ctx = {};
    vm.runInNewContext(readFileSync(join(GS_QUESTS, `${id}.js`), 'utf8'), ctx, { timeout: 2000 });
    const body = String(ctx.onStarted).split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
    out[id] = { instance: /\bquestInstanceLocation\(/.test(body), delayed: /callback:\s*'instances_create_delayed'/.test(body), teleport: /\bteleportToLocationDelayed\(/.test(body) };
  }
  return out;
}

describe('#83 quests that move you on accept', () => {
  it('movesOnStart is exactly the startable quests whose onStarted moves you (47 of 62)', { skip: existsSync(GS_QUESTS) ? false : 'no glitch-GameServerJS checkout' }, () => {
    const starts = sourceStarts();
    assert.equal(Object.keys(starts).length, 62);
    const fromSource = Object.entries(starts).filter(([, s]) => s.instance || s.delayed || s.teleport).map(([id]) => id).sort();
    const inData = Object.values(getQuestCatalog()).filter((def) => def.movesOnStart).map((def) => def.classTsid).sort();
    assert.deepEqual(inData, fromSource);
    assert.equal(inData.length, 47);
    const counts = { instance: 0, delayed: 0, teleport: 0 };
    for (const s of Object.values(starts)) for (const k of Object.keys(counts)) if (s[k]) counts[k] += 1;
    assert.deepEqual(counts, { instance: 34, delayed: 8, teleport: 5 });
  });

  it('only a startable quest moves you, and every rebuilt room quest that starts with onStarted is one', () => {
    const cat = getQuestCatalog();
    for (const def of Object.values(cat)) if (def.movesOnStart) assert.equal(def.needsStart, true, def.classTsid);
    for (const id of Object.keys(QUEST_ROOMS)) if (cat[id]?.needsStart) assert.equal(cat[id].movesOnStart, true, id);
  });

  it('the offer card carries the note where the remake moves you, and nowhere else', () => {
    const cat = getQuestCatalog();
    assert.equal(QUEST_MOVES_NOTE, 'Accepting takes you somewhere new.');
    assert.doesNotMatch(QUEST_MOVES_NOTE, /—/);
    // A rebuilt room (Radiant Glare, "Do" / "Do not"), and a module that runs the quest (Winter Walk).
    assert.equal(questOfferCard('radiant_glare').moveNote, QUEST_MOVES_NOTE);
    assert.equal(questMoveNote(cat.winter_walk), QUEST_MOVES_NOTE);
    // Startable but staying put: a timed quest.
    assert.equal(questOfferCard('mining_mine_in_time_period').moveNote, '');
    // soilappreciation_1 moved you to a practice street the remake does not have: no note.
    assert.equal(cat.soilappreciation_1.movesOnStart, true);
    assert.equal(questMoveNote(cat.soilappreciation_1), '');
    assert.equal(questOfferCard('blending_make_level1_recipes').moveNote, '');
    const offered = Object.values(cat).filter((def) => def.solo && questMoveNote(def));
    assert.ok(offered.length >= 44, `${offered.length} offers carry the note`);
  });

  it('the Magic Rock, the nap, the firefly and NPC offers pass the note to the card, which shows it on the last page', () => {
    assert.match(read('public/js/features/quest-offers-feature.js'), /note: card\.moveNote/);
    assert.match(read('public/js/features/bureaucratic-halls-feature.js'), /note: questMoveNote\(def\)/);
    assert.match(read('public/js/features/resource-nodes-feature.js'), /note: card\.moveNote/);
    assert.match(read('public/js/features/vendor-npcs-feature.js'), /note: card\.moveNote/);
    const game = read('public/game.js');
    assert.match(game, /offerQuestDialogue\(\{[^}]*note = ''/);
    assert.match(game, /note\.textContent = index >= beats\.length - 1 \? questDialogueState\.note \|\| '' : '';/);
    // G562: the story offer names its giver (the Magic Rock unless a Street Spirit's reminisce opens it).
    assert.match(game, /function openQuestDialogue\(classTsid, \{ kicker = 'Magic Rock'/);
    assert.match(game, /kicker,\n\s*note: questMoveNote\(def\),/);
    assert.match(read('public/css/classic.css'), /\.quest-dialogue-note/);
  });
});

// An NPC's offer has no start step: accepting it runs the quest's onAccepted (quest.js onAccept
// 59-76), and some of those move you the same ways. build-quests.mjs records that as
// movesOnAccept; the same note shows on those offers: Gwendolyn in Room 23 (tower_quest), Zzybzfrx
// in the Gwendolyn rooms (parts 2 and 3) and the Juju Bandit (help_juju_bandits).
describe('#83 follow-up: NPC offers whose accept moves you', () => {
  /** Every quest in the catalog whose GSJS onAccepted moves you, read from the source itself. */
  function sourceAccepts() {
    const out = [];
    for (const id of Object.keys(getQuestCatalog())) {
      const file = join(GS_QUESTS, `${id}.js`);
      if (!existsSync(file)) continue;
      const ctx = {};
      vm.runInNewContext(readFileSync(file, 'utf8'), ctx, { timeout: 2000 });
      if (typeof ctx.onAccepted !== 'function') continue;
      const body = String(ctx.onAccepted).split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
      if (/\b(questInstanceLocation|teleportToLocationDelayed)\(|callback:\s*'instances_create_delayed'/.test(body)) out.push(id);
    }
    return out.sort();
  }

  it('movesOnAccept is exactly the quests whose onAccepted moves you', { skip: existsSync(GS_QUESTS) ? false : 'no glitch-GameServerJS checkout' }, () => {
    const inData = Object.values(getQuestCatalog()).filter((def) => def.movesOnAccept).map((def) => def.classTsid).sort();
    assert.deepEqual(inData, sourceAccepts());
    assert.deepEqual(inData, ['chris_test', 'help_juju_bandits', 'rook_hall', 'tower_quest', 'tower_quest_part2', 'tower_quest_part3', 'tower_quest_part3repeat']);
  });

  it('those offers carry the note where the remake moves you (a rebuilt room or its own module), the test quest does not', () => {
    const cat = getQuestCatalog();
    for (const id of ['tower_quest', 'tower_quest_part2', 'tower_quest_part3', 'tower_quest_part3repeat', 'help_juju_bandits', 'rook_hall']) {
      assert.equal(questMoveNote(cat[id]), QUEST_MOVES_NOTE, id);
      assert.equal(questOfferCard(id).moveNote, QUEST_MOVES_NOTE, id);
    }
    assert.equal(questMoveNote(cat.chris_test), '', 'a dev test quest with no room');
    // A quest whose onAccepted stays put (hell_quest.js) keeps no note.
    assert.ok(cat.hell_quest);
    assert.equal(cat.hell_quest.movesOnAccept, undefined);
    assert.equal(questMoveNote(cat.hell_quest), '');
  });

  it("Gwendolyn's, the Juju Bandit's and Zzybzfrx's offers pass it to the card, which shows it on the last page", () => {
    assert.match(read('public/js/features/gwendolyn-room-23-feature.js'), /kicker: GWENDOLYN_LABEL,[\s\S]{0,200}note: card\.moveNote,/);
    assert.match(read('public/js/features/juju-bandits-feature.js'), /kicker: JUJU_BANDIT\.label,[\s\S]{0,200}note: card\.moveNote,/);
    const qi = read('public/js/features/quest-instances-feature.js');
    assert.match(qi, /export async function offerInRoom\([\s\S]*?note: questMoveNote\(def\),[\s\S]*?\n\}/);
    assert.match(qi, /<p class="quest-dialogue-note" data-qi-note hidden><\/p>/);
    assert.match(qi, /dialog\.note\.textContent = last \? note \|\| '' : '';/);
    // The rooms offer parts 2 and 3 through offerInRoom.
    assert.match(read('public/js/quest-rooms/gwendolyn.js'), /ctx\.offerQuest\(PART2, \{ kicker: 'Zzybzfrx' \}\)/);
    assert.match(read('public/js/quest-rooms/gwendolyn.js'), /ctx\.offerQuest\(third, \{ kicker: 'Zzybzfrx' \}\)/);
  });
});
