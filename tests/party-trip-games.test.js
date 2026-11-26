/**
 * G904: a party teleporter taken in a race or game gives the game up. Glitch made the teleporter
 * wherever you stood (GSJS players/inc_party.js 479-520), and leaving a game's instance for any
 * other place, the party space included, ran game.playerLeft(pc) (groups/instance.js
 * player_exited_location 353-355): no prize, and the party leads back to the street you joined the
 * game from. Races and Grab 'Em Good, the Game of Crowns, the solo and online Hog Haul and Math
 * Mayhem each use their own forfeit or leave path. A start still counting down never starts.
 * Run: node --test tests/party-trip-games.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { racesFeature } from '../public/js/features/races-feature.js?v=89ce176b';
import { crownsFeature } from '../public/js/features/crowns-feature.js?v=8279217d';
import { mayhemFeature } from '../public/js/features/mayhem-feature.js?v=6aea206e';
import { hogHaulMpFeature } from '../public/js/features/hog-haul-mp-feature.js?v=d8134654';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(ROOT, '../glitch-GameServerJS');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const slice = (src, from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from) + from.length));
const street = { streetTsid: 'GLI2V0UN7RD1T2J', mode: 'solo', transientInstance: () => false };

describe('nothing running, nothing to give up', () => {
  it('each game answers null off its game', () => {
    for (const f of [racesFeature, crownsFeature, mayhemFeature, hogHaulMpFeature]) {
      assert.equal(f.partyTrip('plan', street), null, f.id);
      assert.equal(f.partyTrip('depart', street), null, f.id);
      assert.equal(f.partyTrip('resume', street, { hold: f.id }), null, `${f.id}: a game is never held`);
    }
  });

  it('the solo Hog Haul answers forfeit only while it holds its street', () => {
    const haul = { streetTsid: 'GHVJQH26ERF3VMJ', mode: 'solo', forfeitHogHaul: () => null, transientInstance: () => true };
    assert.deepEqual(racesFeature.partyTrip('plan', haul), { kind: 'forfeit', label: 'The Great Hog Haul' });
    assert.equal(racesFeature.partyTrip('plan', { ...haul, transientInstance: () => false }), null, 'a plain visit');
    assert.equal(racesFeature.partyTrip('plan', { ...haul, instanceHold: 'hog-haul-mp' }), null, 'an online match: hog-haul-mp-feature');
  });
});

describe('races and Grab \'Em Good (races-feature)', () => {
  const src = read('public/js/features/races-feature.js');
  const depart = slice(src, 'function departForParty(', '\n}\n');

  it('a live race is forfeit with no prize, and the party leads to the street you joined from', () => {
    assert.match(depart, /if \(forfeitRace\(run, Date\.now\(\)\)\) showResult\(engine, \{ stay: true \}\);/);
    assert.match(depart, /const \{ back \} = endRaceHere\(engine\);/);
    assert.match(src, /if \(run\.noPrize\) settled\.reward|settleRace\(run, record\)/);
    assert.match(src, /\} else if \(!stay\) setTimeout\(\(\) => leaveRace\(engine\), 0\);/, 'no second trip racing the party\'s');
  });

  it('Leave the Game still goes back the same way', () => {
    const leave = slice(src, 'async function leaveRace(', '\n}\n');
    assert.match(leave, /const \{ back, outcome \} = endRaceHere\(engine\);\s*const tsid = back\?\.tsid \|\| null;\s*if \(tsid\) await engine\.enter/);
  });

  it('online the server hears race_leave once; a start counting down never starts and the ticket comes back', () => {
    const end = slice(src, 'function endRaceHere(', '\n}\n');
    assert.match(end, /mpClient\?\.send\('race_leave', \{ match: mp\.match \}\);/);
    assert.doesNotMatch(depart, /send\('race_leave'/);
    assert.match(depart, /if \(starting && !run && !isMp\(engine\)\) \{\s*clearTimeout\(startTimer\);/);
    assert.match(depart, /refundPendingTicket\(engine\);/);
  });
});

describe('the other games', () => {
  it('Game of Crowns: out with no prize, crown time still on the badges', () => {
    const src = read('public/js/features/crowns-feature.js');
    const depart = slice(src, 'function departForParty(', '\n}\n');
    assert.match(depart, /engine\.achievement\('it_game:seconds_with_crown', seconds\)/);
    assert.match(depart, /mpClient\?\.send\('crown_leave', \{ match: mp\.match \}\);/);
    assert.doesNotMatch(depart, /currants|grantMoodXp|wins \+= 1/);
    assert.match(src, /const here = engine\?\.streetTsid === CROWNS_STREET && !mayhemHoldsArena\(\)/, 'Math Mayhem answers for its own games');
  });

  it('the solo Hog Haul (game.js forfeitHogHaul): no prize, back where it was joined', () => {
    const game = read('public/game.js');
    const fn = slice(game, '  forfeitHogHaul() {', '\n  },\n');
    assert.match(fn, /hogHaulState = null;/);
    assert.doesNotMatch(fn, /pc\.currants \+=|grantMoodXp|multiplayer_quest_win/);
    assert.match(fn, /hogHaulSourceLocation\?\.tsid \? \{ \.\.\.hogHaulSourceLocation \}/);
  });

  it('online Math Mayhem and Hog Haul tell the server they left', () => {
    assert.match(slice(read('public/js/features/mayhem-feature.js'), '  partyTrip(action, engine) {', '\n  },\n'), /client\?\.send\('mayhem_leave', \{ room: mm\.room \}\);/);
    assert.match(slice(read('public/js/features/hog-haul-mp-feature.js'), '  partyTrip(action, engine) {', '\n  },\n'), /client\?\.send\('race_leave', \{ match: mp\.match \}\);/);
  });

  it('Glitch ran game.playerLeft on any exit from a game\'s instance', { skip: !existsSync(GSJS) && 'no GSJS checkout' }, () => {
    const inst = readFileSync(join(GSJS, 'groups/instance.js'), 'utf8');
    const exited = slice(inst, 'function player_exited_location(', '\n}\n');
    assert.match(exited, /if \(this\.game\)\{\s*this\.game\.playerLeft\(pc\);\s*\}/);
    assert.ok(exited.indexOf('playerLeft') < exited.indexOf('persist this place'), 'before the instance is kept');
  });
});
