// Ticket 67 (2026-11-03, build 4b4dadc9): a Ticket to Paradise used inside your house came back
// out on the arrival street, while the game still counted you at home (Home offered Open mailbox,
// Go outside, Return to Ur). A home is no street file, so every way back into it fell through to
// the arrival street; Glitch sent you back into your own house (players/inc_instances.js
// instances_enter 81-86, instances_left 168-176).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  HOME_INTERIOR_TSID,
  HOME_STREET_TSID,
  beginHomeVisit,
  createHomeState,
  homeStayAfterArrival,
  imagineHome,
  isHomePlaceTsid,
} from '../public/js/homes.js?v=631ab6b8';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const body = (start, end) => game.slice(game.indexOf(start), game.indexOf(end, game.indexOf(start)));

function homeAtHome() {
  const home = createHomeState();
  imagineHome(home, 'meadow', 1);
  beginHomeVisit(home, { tsid: 'LA1', label: 'A' });
  return home;
}

describe('67: the stay at home follows where you are', () => {
  it('your home street and house are home places; streets and instances are not', () => {
    assert.equal(isHomePlaceTsid(HOME_STREET_TSID), true);
    assert.equal(isHomePlaceTsid(HOME_INTERIOR_TSID), true);
    for (const tsid of ['LA1', 'PARADISE_MOUNTAIN_SCALING', '', null, undefined]) assert.equal(isHomePlaceTsid(tsid), false, String(tsid));
  });

  it('a world street ends the stay, unless it is an instance whose way back is your home', () => {
    const home = homeAtHome();
    assert.equal(homeStayAfterArrival(home, { arrived: 'GLI2V0UN7RD1T2J' }), false);
    assert.equal(homeStayAfterArrival(home, { arrived: 'GLI2V0UN7RD1T2J', wayBack: 'LA1' }), false);
    assert.equal(homeStayAfterArrival(home, { arrived: 'HOG_HAUL', wayBack: HOME_INTERIOR_TSID }), true);
    assert.equal(homeStayAfterArrival(home, { arrived: HOME_INTERIOR_TSID }), true);
    home.inHome = false;
    assert.equal(homeStayAfterArrival(home, { arrived: 'HOG_HAUL', wayBack: HOME_STREET_TSID }), false);
    assert.equal(homeStayAfterArrival(createHomeState(), { arrived: HOME_STREET_TSID }), false);
  });

  it('a street trip or a street load to your home goes into it, at the spot you left', () => {
    assert.match(body('async function streetTripTo(', '\n}\n'), /^async function streetTripTo\(tsid, opts = \{\}\) \{\s*\/\/[^\n]*\n\s*if \(isHomePlaceTsid\(tsid\) && homeState\.owned\) return arriveInHome\(tsid, opts\);/);
    assert.match(body('async function enterStreet(', '\n}\n'), /^async function enterStreet\(tsid, opts = \{\}\) \{\s*\/\/[^\n]*\n\s*if \(isHomePlaceTsid\(tsid\) && homeState\.owned\) return arriveInHome\(tsid, \{ \.\.\.opts, useTransition: false \}\);/);
    const arrive = body('async function arriveInHome(', '\n}\n');
    assert.match(arrive, /homeState\.inHome = true;\s*homeState\.room = tsid === HOME_INTERIOR_TSID \? 'interior' : 'street';/);
    assert.match(arrive, /\{ spawnX: opts\.spawnX, arrive: 'exact' \}/);
    assert.match(arrive, /showLocationTransition\(\{/);
  });

  it('the Paradise course comes back by a street trip to where it was started', () => {
    const back = body('async function returnFromParadise(', '\n}\n');
    assert.match(back, /const destination = paradiseSourceLocation\?\.tsid/);
    assert.match(back, /await enterStreetWithTransition\(destination\.tsid, \{/);
  });

  it('landing on a world street by any trip ends a stay the instance does not lead back to', () => {
    const enter = body('async function enterStreet(', '\n}\n');
    assert.match(enter, /currentStreetTsid = data\.tsid;\s*(\/\/[^\n]*\n\s*)*if \(homeState\.inHome\) homeState\.inHome = homeStayAfterArrival\(homeState, \{ arrived: data\.tsid, wayBack: instanceWayBack\(\)\?\.tsid \}\);/);
    const way = body('function instanceWayBack() {', '\n}\n');
    for (const name of ['legalize', 'rookMuseum', 'summersDay', 'deEmbiggenify', 'greedyStreet', 'paradise', 'hogHaul', 'fourLetter', 'winterWalk', 'rookWoods']) {
      assert.match(way, new RegExp(`return ${name}SourceLocation;`), name);
    }
    assert.match(way, /return ilmenskieStory\(\)\.sourceLocation;/);
  });

  it('an instance started in a scene leads back to the street the scene leads to', () => {
    assert.match(game, /function instanceSourceHere\(here\) \{\s*const back = engine\.inScene\(\) \? engine\.sceneReturnTo : null;/);
    for (const name of ['hogHaul', 'fourLetter', 'legalize', 'greedyStreet', 'winterWalk', 'summersDay', 'rookWoods', 'deEmbiggenify', 'paradise']) {
      assert.match(game, new RegExp(`${name}SourceLocation = opts\\.sourceLocation \\|\\| instanceSourceHere\\(\\{\\s*tsid: currentStreetTsid,`), name);
    }
    assert.match(game, /rookMuseumSourceLocation = instanceSourceHere\(\{/);
    assert.doesNotMatch(game, /SourceLocation = (opts\.sourceLocation \|\| )?\{\s*tsid: currentStreetTsid,/);
  });

  it('Home offers what fits where you are, not a stay an instance carries', () => {
    const panel = body('function renderHomePanel() {', '\n}\n');
    assert.match(panel, /const atHome = homeIsInstanced\(\);/);
    assert.doesNotMatch(panel, /homeState\.inHome/);
    const chrome = body('function updateHomeChrome() {', '\n}\n');
    assert.doesNotMatch(chrome, /homeState\.inHome/);
  });

  it('a reload whose way back is your home resumes in it', () => {
    assert.match(game, /const resumeHomeAt = homeState\.owned && !resumeHomeAtBoot && isHomePlaceTsid\(bootHomeTsid\) \? bootHomeTsid : null;/);
    assert.match(game, /if \(resumeHomeAtBoot \|\| resumeHomeAt \|\| \['home', 'interior', 'decorate', 'cultivate'\]\.includes\(homeDemo\)\) \{\s*if \(resumeHomeAt\) homeState\.room = resumeHomeAt === HOME_INTERIOR_TSID \? 'interior' : 'street';/);
  });
});
