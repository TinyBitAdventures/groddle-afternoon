// G318 copy sweep, batch of 2026-11-08: lines the remake had written itself where the original's
// own words survive in GSJS. Each line is checked in the game and, when the source is beside the
// game, in the GSJS file it came from.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const game = (f) => readFileSync(join(root, 'public', f), 'utf8');
const gsjs = (f) => {
  try { return readFileSync(join(root, '..', 'glitch-GameServerJS', f), 'utf8').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\//g, '/'); } catch { return null; }
};

const LINES = [
  ['js/spinning-wheel.js', "Oh my! I believe you've hit the jackpot!", 'items/npc_spinning_wheel.js'],
  ['js/rook-museum.js', 'A magic rock told me talk to you.', 'quests/rook_hall_start.js'],
  ['game.js', "Psssst. Here'sss the deal.", 'items/npc_bureaucrat.js'],
  ['game.js', "I'd get it myself, but I'm kind of lacking in the appendage department, if you know what I mean.", 'quests/de_embiggenify_part2.js'],
  ['game.js', "(And here's a hint: have a look behind the cake!)", 'quests/de_embiggenify_part2.js'],
  ['game.js', "Ok, I'll do it!", 'quests/quest.js'],
  ['game.js', 'Not right now', 'quests/quest.js'],
  ['js/features/home-tower-feature.js', "That's odd, I coulda sworn I had something for you...", 'players/inc_familiar.js'],
  ['js/features/home-tower-feature.js', 'Finish the Tower Project', 'quests/build_a_tower.js'],
  ['js/features/home-tower-feature.js', 'Go to your home street and Cultivate a Tower to get started.', 'quests/build_a_tower.js'],
  ['js/features/animal-husbandry-feature.js', 'The butterfly ascends to a higher plane.', 'items/npc_butterfly.js'],
  ['js/newxp.js', 'Drag an EGG onto the Dustbunny. Or, click on the Dustbunny to give it an EGG.', 'items/npc_newxp_dustbunny.js'],
];

describe('G318: the original words where they survive', () => {
  for (const [file, line, src] of LINES) {
    it(`${file}: ${line.slice(0, 48)}`, (t) => {
      assert.ok(game(file).replace(/\\'/g, "'").includes(line), `${file} lacks the line`);
      const source = gsjs(src);
      if (!source) return t.skip('needs glitch-GameServerJS beside the game');
      assert.ok(source.includes(line), `${src} lacks it`);
    });
  }

  it('the invented wording is gone', () => {
    const all = ['game.js', 'js/spinning-wheel.js', 'js/rook-museum.js', 'js/features/home-tower-feature.js', 'js/features/animal-husbandry-feature.js']
      .map((f) => game(f)).join('\n');
    for (const old of ['I believe you have hit the jackpot', 'route through the red tape', 'but: appendages', 'STORY_ACCEPT_LABELS',
      "'Accept quest'", "'Maybe later'", "I'll let you know when I think of something", 'Bigger, bigger!', 'has ascended to a higher plane']) {
      assert.ok(!all.includes(old), old);
    }
  });

  it('a story offer takes the quest\'s own button_accept (quests.json acceptLabel), else quest.js\'s default', () => {
    const src = game('game.js');
    assert.match(src, /questDialogueState\.acceptLabel \|\| def\?\.acceptLabel \|\| "Ok, I'll do it!"/);
    assert.match(src, /questDialogueState\.declineLabel \|\| def\?\.declineLabel \|\| 'Not right now'/);
    const quests = JSON.parse(game('assets/content/quests.json'));
    const q = quests.quests || quests;
    assert.equal(q.rook_hall_start.acceptLabel, 'If you say so…');
    assert.equal(q.phantom_glitch.acceptLabel, "Never mind. It's ghost hunting time!");
  });
});
