/**
 * G911 (Austin 2026-11-16: build): a party teleporter taken in one of the eight hand-built game.js
 * places (Storyland, Legalize It's Back Alley, Paradise, Rooks' Woods, the Museum of the Rook, A
 * Summer's Day, Winter Walk, Four Letter Words) holds it, as G904 holds a quest room. Glitch made the
 * teleporter wherever you stood (GSJS players/inc_party.js 479-520), kept an instance you left for
 * the party space, another instance (groups/instance.js player_exited_location 343-363), and leaving
 * the party sent you back to that spot (players/inc_instances.js instances_enter 80-86,
 * instances_left 135-180). Only a game's instance gave the game up on the way out (instance.js
 * 353-355), and none of the eight was a game. The run's clock stops while away, the place comes back
 * as you left it, and a reload at the party never puts you inside a place whose run went with the page.
 * Run: node --test tests/party-trip-places.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HELD_PLACE_CLOCKS,
  HELD_PLACE_KINDS,
  greedyReplayEvents,
  heldPlaceHold,
  heldPlaceKind,
  shiftHeldClock,
} from '../public/js/party-held-places.js?v=c34cb987';
import { GREEDY_ACTS, createGreedyStreetSpiritState, greedyRemainingMs, pressGreedyAct } from '../public/js/greedy-street-spirit.js?v=00620a1c';
import { createWinterWalkState, winterWalkRemainingMs } from '../public/js/winter-walk.js?v=89f8dc32';
import { normalizePartyRecord } from '../public/js/party-spaces.js?v=4e1ca2a5';
import { partyTeleporterSpot } from '../public/js/features/party-spaces-feature.js?v=bbc1fcb7';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const slice = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from) + from.length));
const game = read('public/game.js');
const OUTSIDE = { tsid: 'GLI2V0UN7RD1T2J', x: 3082, y: 192 };

describe('the hold the party record keeps (js/party-held-places.js)', () => {
  it('every place has its own hold, and the record keeps it with the spot', () => {
    assert.equal(HELD_PLACE_KINDS.length, 9, 'eight places, Rooks\' Woods and the Museum apart');
    for (const kind of HELD_PLACE_KINDS) {
      assert.equal(heldPlaceKind(heldPlaceHold(kind)), kind);
      const rec = normalizePartyRecord({ party: { template: 'moon', startedAt: Date.now(), expiresAt: Date.now() + 600_000, inside: true, returnTo: { ...OUTSIDE, hold: heldPlaceHold(kind), at: { x: 700, y: 400 } } } });
      assert.equal(rec.party.returnTo.hold, `place-${kind}`, kind);
      assert.deepEqual(rec.party.returnTo.at, { x: 700, y: 400 });
    }
    assert.equal(heldPlaceHold('hog-haul'), '', 'a game is never held');
    assert.equal(heldPlaceKind('quest-instances'), '', 'another owner\'s hold');
    assert.equal(heldPlaceKind('place-nowhere'), '');
  });

  it('a place that holds opens the teleporter (partyTeleporterSpot)', () => {
    assert.equal(partyTeleporterSpot({ transient: true, plan: 'hold' }), 'hold');
  });
});

describe('the run\'s clock stops while away (shiftHeldClock)', () => {
  it('Winter Walk comes back with the time left it had', () => {
    const t0 = 1_000_000;
    const walk = createWinterWalkState({ now: t0 });
    const left = winterWalkRemainingMs(walk, t0 + 60_000);
    // Ten minutes at the party.
    assert.deepEqual(shiftHeldClock(walk, 'winter-walk', 600_000), ['startedAt', 'expiresAt']);
    assert.equal(winterWalkRemainingMs(walk, t0 + 660_000), left);
  });

  it('Storyland too; an unset clock (Rooks\' Woods before the warning) stays unset', () => {
    const story = createGreedyStreetSpiritState({ enteredAt: 5_000 });
    const left = greedyRemainingMs(story, 65_000);
    shiftHeldClock(story, 'storyland', 120_000);
    assert.equal(greedyRemainingMs(story, 185_000), left);
    const woods = { startedAt: 0, expiresAt: 0 };
    assert.deepEqual(shiftHeldClock(woods, 'rook-woods', 50_000), []);
    assert.deepEqual(woods, { startedAt: 0, expiresAt: 0 });
    assert.deepEqual(shiftHeldClock({ startedAt: 9 }, 'four-letter', 50_000), [], 'no clock of its own');
  });

  it('each timed place names the fields its module keeps', () => {
    for (const [kind, keys] of Object.entries(HELD_PLACE_CLOCKS)) {
      assert.ok(HELD_PLACE_KINDS.includes(kind), kind);
      assert.ok(keys.length === 2, kind);
    }
    assert.match(read('public/js/de-embiggenify.js'), /deadlineAt: enteredAt \+ EESTI_DURATION_MS/);
    assert.match(read('public/js/paradise-flight.js'), /expiresAt: now \+ PARADISE_DURATION_MS/);
    assert.match(read('public/js/summers-day.js'), /expiresAt: now \+ SUMMERS_DAY_MAIN_DURATION_MS/);
    assert.match(read('public/js/rook-woods.js'), /state\.expiresAt = state\.startedAt \+ ROOK_WOODS_DURATION_MS/);
  });
});

describe('Storyland rebuilt shows the acts read (greedyReplayEvents)', () => {
  it('the scene events each Wall Button showed, act by act', () => {
    const story = createGreedyStreetSpiritState({ enteredAt: Date.now() });
    const shown = [];
    for (const act of [0, 2, 0]) shown.push(pressGreedyAct(story, act).eventId);
    const replay = greedyReplayEvents(story.actSteps, GREEDY_ACTS);
    assert.deepEqual([...replay].sort(), [...shown].sort());
    assert.deepEqual(replay, [GREEDY_ACTS[0].eventIds[0], GREEDY_ACTS[0].eventIds[1], GREEDY_ACTS[2].eventIds[0]]);
    assert.deepEqual(greedyReplayEvents([99], GREEDY_ACTS), [...GREEDY_ACTS[0].eventIds], 'never past the act');
  });
});

describe('game.js answers the teleporter for its own places', () => {
  it('engine.query falls back to heldPlaceTrip for partyTrip when no feature answers', () => {
    assert.match(game, /query: \(hook, \.\.\.args\) => features\.query\(hook, \.\.\.args\) \?\? \(hook === 'partyTrip' \? heldPlaceTrip\(\.\.\.args\) : null\),/);
    const trip = slice(game, 'function heldPlaceTrip(', '\n}\n');
    assert.match(trip, /return kind \? \{ kind: 'hold', label: HELD_PLACES\[kind\]\.label\(\) \} : null;/);
    assert.match(trip, /const kind = heldPlaceKind\(back\?\.hold\);\s*return kind \? resumeHeldPlace\(kind, back\) : null;/, 'someone else\'s hold is left to them');
  });

  it('every place is in the table, here only while nothing is under way', () => {
    const table = slice(game, 'const HELD_PLACES = {', '\n};\n');
    for (const kind of HELD_PLACE_KINDS) assert.match(table, new RegExp(`\\n  '?${kind}'?: \\{`), kind);
    for (const [kind, busy] of [
      ['storyland', 'greedyStreetTransitionBusy'],
      ['legalize', 'legalizeTransitionBusy'],
      ['paradise', 'paradiseTransitionBusy'],
      ['rook-woods', 'rookWoodsTransitionBusy'],
      ['rook-museum', 'rookMuseumTransitionBusy'],
      ['summers-day', 'summersDayTransitionBusy'],
      ['winter-walk', 'winterWalkTransitionBusy'],
      ['de-embiggenify', 'deEmbiggenifyTransitionBusy'],
    ]) assert.match(slice(table, `${kind.includes('-') ? `'${kind}'` : kind}: {`, '\n  },\n'), new RegExp(`here: \\(\\) => \\w+IsInstanced\\(\\) && !${busy}`), kind);
    assert.match(slice(game, 'function heldPlaceHere(', '\n}\n'), /if \(heldPlace \|\| isQuestDialogueOpen\(\)\) return '';/);
  });

  it('depart keeps the place and answers the street it was entered from, the spot and the hold', () => {
    const depart = slice(game, 'function departHeldPlace(', '\n}\n');
    assert.match(depart, /const kept = place\.depart\?\.\(\) \|\| \{\};/);
    assert.match(depart, /heldPlace = \{ kind, at, since: Date\.now\(\), kept \};/);
    assert.match(depart, /return \{ hold: heldPlaceHold\(kind\), tsid: back\.tsid, x: back\.x, y: back\.y, label, at \};/);
  });

  it('hand-drawn rooms are parked whole; street places and rebuilt rooms come back at their stage', () => {
    const table = slice(game, 'const HELD_PLACES = {', '\n};\n');
    const entry = (kind) => slice(table, `${kind.includes('-') ? `'${kind}'` : kind}: {`, '\n  },\n');
    assert.match(entry('four-letter'), /parkWorld\(\{ targets: \[\.\.\.fourLetterTargets, fourLetterMrBlock\] \}\)/);
    assert.match(entry('paradise'), /\[\.\.\.paradisePickups, \.\.\.paradiseRings, paradiseExit, \.\.\.paradiseEventQuoinEntries\]/);
    assert.match(entry('summers-day'), /if \(!held\.kept\.parked\) return setupSummersDayMain\(held\.at\);/);
    assert.match(entry('de-embiggenify'), /setupDeEmbiggenifyInstance\(held\.at\)/);
    assert.match(entry('storyland'), /setupGreedyStreetInstance\(\);[\s\S]*greedyReplayEvents\(greedyStreetState\.actSteps, GREEDY_ACTS\)[\s\S]*standAtHeldSpot\(held\.at\)/);
    assert.match(entry('winter-walk'), /setupWinterWalkStage\(winterWalkState\.stage\);\s*standAtHeldSpot\(held\.at\);/);
    assert.match(entry('rook-woods'), /setupRookWoodsInstance\(\);\s*standAtHeldSpot\(held\.at\);/);
    assert.match(entry('rook-museum'), /closeRookMuseumExhibit\(\);/);
    assert.match(game, /async function setupSummersDayMain\(spot = null\) \{[\s\S]{0,120}const spawn = spot \|\| summersDayStreetPoint/);
    assert.match(game, /async function setupDeEmbiggenifyInstance\(spot = null\) \{[\s\S]{0,120}const spawn = spot \|\| eestiStreetPoint/);
  });

  it('shrunk places put you at full size for the party and small again on the way back', () => {
    const table = slice(game, 'const HELD_PLACES = {', '\n};\n');
    assert.match(slice(table, "'four-letter': {", '\n  },\n'), /player\.baseScale = fourLetterPlayerBaseScale;[\s\S]*player\.baseScale = \(fourLetterPlayerBaseScale \|\| player\.baseScale\) \* 0\.42;/);
    assert.match(slice(table, "'de-embiggenify': {", '\n  },\n'), /player\.baseScale = deEmbiggenifyPlayerBaseScale;/);
  });

  it('resume moves the run\'s clock on first; after a reload only the saved Back Alley comes back', () => {
    const resume = slice(game, 'async function resumeHeldPlace(', '\n}\n');
    assert.match(resume, /kind === 'legalize' \? \{ kind, at: back\?\.at \|\| null, since: Date\.now\(\), kept: \{\} \} : null;/);
    assert.match(resume, /if \(!held \|\| !run\) return false;/, 'no run, no way in: the party leads to the street');
    assert.ok(resume.indexOf('shiftHeldClock(run, kind') < resume.indexOf('place.resume(held)'));
    assert.match(slice(game, 'async function resumeLegalizeAlley(', '\n}\n'), /const run = legalizeRouteState\(\);\s*if \(!run \|\| !LEGALIZE_ALLEY_STAGES\.includes\(run\.stage\)\) return false;/);
  });

  it('a reload at the party never saves a place\'s way back over the party (instanceWayBack)', () => {
    const back = slice(game, 'function instanceWayBack() {', '\n}\n');
    assert.match(back, /^function instanceWayBack\(\) \{\s*\/\/ G911[^\n]*\n[^\n]*\n\s*if \(heldPlace \|\| isPartyStreet\(currentStreetTsid\)\) return null;/);
    assert.ok(back.indexOf('isPartyStreet') < back.indexOf('legalizeSourceLocation'), 'before the G718 hall rule');
  });

  it('a start while held waits at the party, and ends a hold whose way back never came', () => {
    for (const fn of ['startFourLetterQuest(opts', 'startLegalizeIt(opts', 'startWinterWalk(opts', 'startSummersDay(opts', 'startGreedyStreetSpirit(opts',
      'startRookWoodsQuest(opts', 'startRookMuseum(opts', 'startDeEmbiggenify(opts', 'startParadiseFlight(courseId']) {
      assert.match(game, new RegExp(`async function ${fn.replace('(', '\\(')}[^\\n]*\\n  if \\(heldPlaceBlocksStart\\('[a-z-]+'\\)\\) return null;`), fn);
    }
    const blocks = slice(game, 'function heldPlaceBlocksStart(', '\n}\n');
    assert.match(blocks, /if \(isPartyStreet\(currentStreetTsid\)\) \{/);
    assert.match(blocks, /HELD_PLACES\[kind\]\.drop\?\.\(\);\s*heldPlace = null;/);
  });

  it('the G904 scene park shares the same world park', () => {
    assert.match(game, /parkScene\(\{ sprites = \[\], targets = \[\] \} = \{\}\) \{\s*if \(!engine\.inScene\(\) \|\| !bgLayer \|\| !world\) return null;\s*const parked = parkWorld\(\{ sprites, targets \}\);/);
    assert.match(game, /resumeScene\(parked, spot = null\) \{\s*if \(!parked\?\.bg \|\| parked\.bg\.destroyed \|\| !world\) return false;\s*resumeWorld\(parked, spot, \{ scene: true \}\);/);
  });
});

describe('A Summer\'s Day and De-Embiggenify keep their street\'s puzzle run (puzzles-feature)', () => {
  const src = read('public/js/features/puzzles-feature.js');
  it('the run inside a game.js instance is held with it, in the page only, and game.js answers', () => {
    const depart = slice(src, 'function departForParty(', '\n}\n');
    assert.match(depart, /const owned = Boolean\(run\.def\.instance\);/);
    assert.match(depart, /if \(owned\) \{\s*instanceHeld = held;\s*return null;\s*\}/);
    assert.match(slice(src, 'function applyHeld(', '\n}\n'), /const held = save\.held \|\| instanceHeld;/);
    assert.match(src, /if \(instanceHeld && instanceHeld\.tsid !== key\(tsid\) && !partySpaceForStreet\(tsid\)\) instanceHeld = null;/);
    // The saved hold's reload rule never sends you into a game.js instance.
    assert.doesNotMatch(slice(src, '  reloadLocation(saved, engine) {', '\n  },\n'), /instanceHeld/);
  });
});

describe('party-spaces-feature says which places hold', () => {
  it('the comment above partyTeleporterSpot no longer lists the eight as refused', () => {
    const src = read('public/js/features/party-spaces-feature.js');
    const doc = slice(src, ' * G901: where a party teleporter may open.', 'export function partyTeleporterSpot(');
    assert.match(doc, /G911 \(Austin 2026-11-16: build\)/);
    const still = doc.slice(doc.indexOf("Still ''"));
    assert.doesNotMatch(still, /De-Embiggenify|Four Letter|Storyland|Paradise|Winter Walk/);
  });
});

describe('none of the eight was a game in Glitch', { skip: !existsSync(GSJS) && 'no GSJS checkout' }, () => {
  it('quest and ticket instances, never a shared game instance (no game.playerLeft on the way out)', () => {
    const sources = {
      storyland: 'quests/greedy_street_spirit.js',
      legalize: 'quests/card_carrying_qualification.js',
      paradise: 'items/paradise_ticket_starlit_night.js',
      'rook-woods': 'quests/rook_egg_smash.js',
      'rook-museum': 'quests/rook_hall.js',
      'summers-day': 'quests/blue_and_white_part1.js',
      'winter-walk': 'quests/winter_walk.js',
      'de-embiggenify': 'quests/de_embiggenify.js',
      'four-letter': 'quests/letter_block_2.js',
    };
    for (const [kind, file] of Object.entries(sources)) {
      const text = readFileSync(join(GSJS, file), 'utf8');
      assert.match(text, /questInstanceLocation\(|instances_create_delayed|instances_create\(/, kind);
      assert.doesNotMatch(text, /start_game|startInstancedGame|shared_instance/, kind);
    }
    const inst = readFileSync(join(GSJS, 'groups/instance.js'), 'utf8');
    assert.match(inst, /this\.game = apiNewGroup\('global_game'\);/, 'a game only where start_game runs it');
  });
});
