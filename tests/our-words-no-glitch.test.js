/**
 * Our own player copy never says the game's name (Austin's rule; G318 copy row,
 * words lane 2026-11-09). Tiny Speck's own texts keep it verbatim (graveside_marker.js 66,
 * butler_data.js, rook_hall.js and the rest), so this guards only the lines we wrote:
 *   - the retired notice about the Woodworker, reworded without breaking older saves;
 *   - the one fallback name for a player with no name (js/player-names.js);
 *   - the copy the sweep found (landing, Feats, buddies, follow, builder, foxes); the Restoration page keeps "Glitches" (Austin 2026-11-09: players are Glitches/Glitchens).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BOARD_PINS,
  REMAKE_NOTE_TEXTS,
  RETIRED_BOARD_PIN_TEXTS,
  RETIRED_PIN_REWORDS,
  STREET_NOTES,
  boardPinSeeds,
  isRemakeNote,
  noteContent,
  normalizeNote,
  refreshBoardPins,
} from '../public/js/street-furniture.js?v=55131f49';
import { UNNAMED_PLAYER, playerNameOr } from '../public/js/player-names.js?v=f9b78094';
import { listPlayerTarget } from '../public/js/ui/player-menu.js?v=def643ed';
import { BUDDY_TEXT, normalizeList } from '../public/js/buddies.js?v=cff7bf6e';
import { youLine } from '../public/js/feats-mp.js?v=b5e2f816';
import { fillName } from '../public/js/foxes.js?v=59323f35';
import { APPEARANCE_PRESETS, BODY_STYLES } from '../public/js/character-builder.js?v=3c78a868';
import { boardsData } from '../tools/build-realtime-boards.mjs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const OLD = 'To the kind Glitch who oiled the Woodworker: it hums now.';
const NEW = 'To whoever oiled the Woodworker: it hums now.';

describe('the retired Woodworker notice, reworded', () => {
  it('reads without the game name, and no seeded or retired text says it', () => {
    assert.equal(RETIRED_PIN_REWORDS[OLD], NEW);
    assert.ok(RETIRED_BOARD_PIN_TEXTS.includes(NEW));
    const texts = [...Object.values(STREET_NOTES), ...Object.values(BOARD_PINS)].flat().map((r) => `${r.title || ''} ${r.text}`).concat(RETIRED_BOARD_PIN_TEXTS);
    for (const t of texts) assert.ok(!/glitch/i.test(t), t);
    for (const t of Object.values(RETIRED_PIN_REWORDS)) assert.ok(!/glitch/i.test(t), t);
  });

  it('a save still holding the old words shows the new ones and stays marked as ours', () => {
    const old = { id: 'b3', initialTitle: 'Thanks', initialText: OLD };
    assert.equal(normalizeNote(old).initialText, NEW);
    assert.equal(noteContent(old).body, NEW);
    assert.equal(isRemakeNote(old), true);
    // A board holding nothing but untouched retired notices is still seeded afresh.
    const tsid = 'GHVUR3UKGRU2SD2';
    const fresh = refreshBoardPins([old, { id: 'b4', initialTitle: 'Dues', initialText: RETIRED_BOARD_PIN_TEXTS[13] }], tsid);
    assert.deepEqual(fresh.map((p) => p.initialText), boardPinSeeds(tsid).map((p) => p.initialText));
  });

  it('the realtime server marks both wordings as the remake\'s (data/boards.json remake[])', () => {
    assert.ok(REMAKE_NOTE_TEXTS.includes(OLD) && REMAKE_NOTE_TEXTS.includes(NEW));
    const data = boardsData();
    assert.ok(data.remake.includes(OLD) && data.remake.includes(NEW));
    for (const seeds of Object.values(data.boards)) for (const s of seeds.seeds) assert.ok(!/glitch/i.test(`${s.title} ${s.body}`), s.body);
  });
});

describe('one fallback name for a player with none', () => {
  it('is "Someone", the word the server and site already use', () => {
    assert.equal(UNNAMED_PLAYER, 'Someone');
    assert.equal(playerNameOr(''), 'Someone');
    assert.equal(playerNameOr('  '), 'Someone');
    assert.equal(playerNameOr('Ada Fern'), 'Ada Fern');
    assert.equal(listPlayerTarget({ id: 5 }).label, 'Someone');
    assert.equal(normalizeList({ buddies: [{ id: 7 }] }).buddies[0].name, 'Someone');
  });

  it('no game file keeps its own copy of the old fallback', () => {
    let hits = '';
    try {
      hits = execFileSync('git', ['grep', '-n', "'A Glitch'", '--', 'public'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (err) {
      assert.equal(err.status, 1, 'git grep found nothing (exit 1)');
    }
    assert.equal(hits, '');
  });

  it('every module that names the fallback imports it from player-names.js', () => {
    const files = execFileSync('git', ['grep', '-l', 'UNNAMED_PLAYER', '--', 'public/js'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
    assert.ok(files.length >= 20, files.join(', '));
    for (const f of files) {
      if (f.endsWith('player-names.js')) continue;
      assert.match(read(f), /import \{ UNNAMED_PLAYER \} from '\.\.?\/player-names\.js(\?v=[0-9a-f]{8})?';/, f);
    }
  });

  it('the site names an unnamed inviter the same way', { skip: skipWithoutSite }, () => {
    const groups = readFileSync(sitePath('src', 'Groups.php'), 'utf8');
    assert.ok(!groups.includes("'A Glitch'"));
    assert.ok(groups.includes("public const UNNAMED_PLAYER = 'Someone';"));
  });
});

describe('our own lines the sweep found', () => {
  it('say player, someone or friend instead', () => {
    assert.equal(BUDDY_TEXT.empty, 'No buddies yet. Click another player to add them.');
    assert.equal(youLine({ count: 1 }), '1 player has contributed. You have not yet.');
    assert.equal(youLine({ count: 3 }), '3 players have contributed. You have not yet.');
    assert.equal(fillName('Hello {name}.'), 'Hello friend.');
    assert.equal(APPEARANCE_PRESETS.vector.label, 'Default');
    assert.equal(BODY_STYLES.vector.label, 'Default');
  });

  it('leave no Glitch in the game and landing lines we wrote (the Restoration page keeps Glitches: Austin 2026-11-09)', () => {
    const gone = {
      'public/game.js': ["'Another Glitch'", 'original Glitch wardrobe', 'a new Glitch to say'],
      'public/content.js': ["'this Glitch'"],
      'public/js/features/street-furniture-feature.js': ['Left by a Glitch'],
      'public/js/features/street-jobs-feature.js': ["'a Glitch'"],
      'public/js/features/newxp-feature.js': ["'Glitchling'"],
      'public/js/features/foxes-feature.js': ["PLAYER_NAME = 'Glitch'"],
      'public/play/index.html': ['Three different Glitches', '<b data-hog-player>Glitch</b>'],
      'public/index.html': ['other Glitches', 'alt="A Glitch', 'a Glitch with silver hair', 'over a Glitch', 'rival Glitches'],
      'tools/deploy/social.mjs': ['Glitchen'],
    };
    for (const [file, phrases] of Object.entries(gone)) {
      const text = read(file);
      for (const p of phrases) assert.ok(!text.includes(p), `${file} still says ${p}`);
    }
  });

  it('keeps Tiny Speck\'s own lines verbatim (graveside_marker.js 66)', () => {
    assert.ok(read('public/js/hell.js').includes('They were a good Glitch, a kind Glitch, and they left this world a better place than they found it.'));
  });
});
