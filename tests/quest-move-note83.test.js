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
import { QUEST_MOVES_NOTE, questMoveNote, questOfferCard } from '../public/js/quest-offers.js?v=7790a130';
import { QUEST_ROOMS } from '../public/js/quest-rooms/catalog.js?v=9ebeb502';

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
    assert.match(game, /kicker: 'Magic Rock',\n\s*note: questMoveNote\(def\),/);
    assert.match(read('public/css/classic.css'), /\.quest-dialogue-note/);
  });
});
