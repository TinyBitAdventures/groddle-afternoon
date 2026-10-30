/**
 * Five desk calls (Austin, 2026-10-26), one block each:
 * - ORBERA (G293): the Rook stun orb sits just above the name labels with the
 *   joined count on it, solo and multiplayer; the camera no longer looks up.
 * - DROPHOVER (G297): a street Musicblock sits on the ground, still.
 * - RAINBOW (G305): ticket races end on the winner splash only.
 * - BADGE11 (G306): asked again 2026-10-26, Austin: solo counts only the skills
 *   learned beyond the demo kit, so every game earns first_eleven_skills, card
 *   and rewards, at the eleventh skill the player learns.
 * - FOOTWORDS (G314): "Back to Top" stays with its Snap id; An Autumn Day says
 *   GSJS's own "This feeling of …".
 * Run: node --test tests/desk-decisions.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (p) => readFileSync(join(pub, p), 'utf8');
const gsjsPath = join(here, '../../glitch-GameServerJS');
const haveGsjs = existsSync(gsjsPath);
const gsjs = (p) => readFileSync(join(gsjsPath, p), 'utf8');
const game = read('game.js');

/** The text of a top-level function in game.js. */
function fnBody(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, name);
  return src.slice(at, src.indexOf('\n}\n', at) + 2);
}

describe('ORBERA: the orb just above the name labels', () => {
  it('stands its ball just clear of a name plate, the count on the orb', async () => {
    const { ORB_ART } = await import('../public/js/features/rook-attack-feature.js?v=g464-1');
    const plateY = Number(read('js/features/realtime-feature.js').match(/const PLATE_Y = (-\d+);/)[1]);
    // The plate's text bottom is PLATE_Y; 12 px text plus its 4 px pad puts the top about 20 px higher.
    const plateTop = -plateY + 20;
    const ballRadius = 22; // measured from focusing_orb_attack's orb1 frame
    assert.ok(ORB_ART.orbAbove - ballRadius >= plateTop, 'the ball clears the plate');
    assert.ok(ORB_ART.orbAbove - ballRadius <= plateTop + 12, 'and sits just above it');
    // center_bottom placement: the orb clip is 149.35 px above the stage's bottom.
    assert.ok(Math.abs(ORB_ART.dy + (ORB_ART.orbAbove - (294.75 - 145.4))) < 1e-9);
    // In the 408 px view (feet at 306 px) the orb shows with no camera move.
    const orbY = 408 * (0.5 + 150 / 600) - ORB_ART.orbAbove;
    assert.ok(orbY > 60, `orb ${orbY} px from the top`);
  });

  it('solo and multiplayer both use it; no headroom remains', () => {
    const f = read('js/features/rook-attack-feature.js');
    assert.equal((f.match(/y: p\.y \+ ORB_ART\.dy/g) || []).length, 2, 'solo and multiplayer art');
    assert.match(f, /return \{ x: p\.x, y: p\.y - ORB_ART\.orbAbove \};/);
    assert.match(f, /art\.root\.y = pos\.y - ORB_ART\.orbAbove;/);
    assert.match(f, /count\.anchor\.set\(0\.5, 0\.5\);/);
    assert.doesNotMatch(f, /dy: -163|countDy|headroom|setCameraLook|rookHeadroom/i);
    assert.doesNotMatch(read('js/rook-mp.js'), /headroom|setCameraLook/i);
  });
});

describe('DROPHOVER: a street Musicblock sits on the ground', () => {
  it('spawns at its spot, with no hover, bob or pulse', () => {
    const spawn = fnBody(game, 'spawnMusicblockDrop');
    assert.match(spawn, /spr\.y = point\.y;/);
    assert.doesNotMatch(spawn, /point\.y - 120|airborne|\.bob\b/);
    assert.doesNotMatch(game, /for \(const block of worldMusicblocks\)/);
    assert.doesNotMatch(game, /block\.baseScale \* pulse/);
  });
});

describe('RAINBOW: ticket races end on the splash', () => {
  it('the source: quest races (inc_race.js) have the rainbow and emotes, games_end_race has neither', { skip: !haveGsjs && 'no GSJS' }, () => {
    const race = gsjs('locations/inc_race.js');
    assert.match(race, /winner\.show_rainbow\('rainbow_winner'\);\s*winner\.events_add\(\{callback: 'playEmotionAnimationDelayed', em: 'happy'\}, 2\);/);
    const games = gsjs('players/inc_games.js');
    const end = games.slice(games.indexOf('function games_end_race()'), games.indexOf('function', games.indexOf('function games_end_race()') + 10));
    assert.match(end, /label:"Leave the Game"/);
    assert.doesNotMatch(end, /rainbow|playEmotion/);
  });

  it('races-feature plays no rainbow and no happy or angry emote', () => {
    const f = read('js/features/races-feature.js');
    assert.doesNotMatch(f, /drawWinnerRainbow|followWinnerRainbow|playEmotion|\.emote\(/);
    assert.match(f, /buttons: \[\{ label: splash\.leaveLabel, w: splash\.buttonW, value: 'leave', onClick: \(\) => leaveRace\(engine\) \}\]/);
  });
});

describe('BADGE11: the eleven-skills badge', () => {
  it('the demo kit never counts; every game earns it with its card at the eleventh learned skill', () => {
    const at = game.indexOf("} else if (bootParams.has('resetgame') || !NEW_PLAYER) {");
    assert.ok(at > 0);
    const end = game.indexOf('} else {', at);
    const fresh = game.slice(at, end);
    assert.doesNotMatch(fresh, /first_eleven_skills'\)|grantAchievement|handleSkillCompletions/);
    const loud = game.slice(end, game.indexOf('\n  }\n', end));
    assert.match(loud, /handleSkillCompletions\(\[\]\);/);
    // Starter skills are the solo demo kit's; the new multiplayer player has none.
    const kit = game.indexOf('if (!NEW_PLAYER) {', game.indexOf('await loadTransitionAssets();'));
    assert.ok(kit > 0 && game.indexOf("grantSkillWithPrereqs(skillState, 'animalkinship_1');", kit) > kit);
    // Learning the eleventh still awards it (inc_skills.js 1513).
    assert.match(fnBody(game, 'handleSkillCompletions'), /if \(skillsLearnedCount\(\) >= 11\) engine\.grantAchievement\('first_eleven_skills'\);/);
  });
});

describe('FOOTWORDS: footage words', () => {
  it("An Autumn Day says GSJS's own words", { skip: !haveGsjs && 'no GSJS' }, async () => {
    const lines = gsjs('inc_data_maps_prod.js').split('\n');
    assert.match(lines[17951], /"LUVCL0STDIB37HE"\s*: "This feeling of …",/);
    const mod = await import('../public/js/quest-rooms/an-autumn-day.js?v=g458-1');
    assert.equal(mod.CAPTION, 'This feeling of …');
    assert.equal(mod.feelingCaption('comfort'), 'This feeling of comfort.');
    assert.ok(mod.sentenceReady([...mod.SENTENCE, 'comfort.']));
  });

  it('no footage caption is left in the game', () => {
    const dir = join(pub, 'js');
    const files = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.name.endsWith('.js')) files.push(join(d, e.name));
      }
    };
    walk(dir);
    for (const f of [...files, join(pub, 'game.js'), join(pub, 'content.js')]) {
      assert.doesNotMatch(readFileSync(f, 'utf8'), /Almost forgot/i, f);
    }
  });

  it('"Back to Top" stays, its Snap id beside it', () => {
    const f = read('js/paradise-courses.js');
    const at = f.indexOf('export const SKY_PLUNGE_LANDING_SIGNS');
    assert.match(f.slice(at - 400, at), /snap PHF6RRQFSTC2DA8/);
    assert.match(f, /\{ id: 'back-to-top', text: 'Back to Top'/);
  });
});
