/**
 * #474: after the Rooks' Woods quest sent the player home, the Woods' music kept playing on the home
 * street until the next Ur street. Every arrival names its own music: a street (enterStreet, its hub
 * or its music_file), a feature scene with a music_file (enterScene) or set aside and put back
 * (resumeScene), and your home. The home was the one arrival that named none, so whatever played last
 * (an instance's, a quest room's, a street's music_file) carried in. Glitch's home streets each had
 * their style's music_file (music_map HOME_STREET_GRODDLE_WHISTLE, HOME_STREET_FIREBOGS,
 * HOME_STREET_URALIA), looped as any street's is (location.js 481-482).
 *
 * Run: node --test tests/arrival-music.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME_STYLES, createHomeState, homeMusicFile, imagineHome } from '../public/js/homes.js?v=4f4ade68';
import { HUB_DEFAULT_MUSIC, resolveAmbientTheme, setAmbientMusicConfig, tracksForTheme } from '../public/js/ambient-music.js?v=fd8fe13e';
import { EXTERIOR_STYLES, streetStyleFor, switchStreetStyle } from '../public/js/home-styles.js?v=ec5d2f69';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');

/** The body of a top-level function in game.js (from its line to the next top-level function). */
function fnBody(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, `${head} is in game.js`);
  const next = src.slice(at + head.length).search(/\n(async )?function /);
  return src.slice(at, next < 0 ? undefined : at + head.length + next);
}

/** An engine method's body (two-space indent in the engine object). */
function methodBody(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, `${head} is in game.js`);
  const end = src.indexOf('\n  },', at);
  return src.slice(at, end);
}

describe('#474 every home names its own music', () => {
  const cfg = setAmbientMusicConfig(JSON.parse(read('public/assets/content/ambient-music.json')));

  it("each style's home street music_file resolves to a theme with recordings on disk", () => {
    assert.deepEqual(Object.keys(HOME_STYLES).map((s) => homeMusicFile(s)), ['HOME_STREET_GRODDLE_WHISTLE', 'HOME_STREET_FIREBOGS', 'HOME_STREET_URALIA']);
    assert.equal(homeMusicFile(''), 'HOME_STREET_GRODDLE_WHISTLE', 'no style is the Meadow');
    for (const style of Object.keys(HOME_STYLES)) {
      const theme = resolveAmbientTheme({ hubId: 'home', hubName: 'Homes', musicFile: homeMusicFile(style) });
      assert.equal(theme, `street:${homeMusicFile(style)}`, style);
      const tracks = tracksForTheme(theme);
      assert.ok(tracks.length, `${style} has tracks`);
      for (const t of tracks) assert.ok(existsSync(join(root, 'public', t)), t);
    }
    assert.ok(cfg);
  });

  it("a home's theme is never the Rooks' Woods' (or any instance's) theme, so arriving switches it", () => {
    const rook = resolveAmbientTheme({ hubName: 'Rook Woods' });
    for (const style of Object.keys(HOME_STYLES)) assert.notEqual(resolveAmbientTheme({ hubId: 'home', musicFile: homeMusicFile(style) }), rook);
  });

  it('renderHomeScene, the one way onto the home street, into the house and onto a Tower floor, sets it', () => {
    const body = fnBody(game, 'async function renderHomeScene(');
    assert.match(body, /musicFile: homeMusicFile\(features\.query\('homeStreetStyle', engine\) \|\| homeState\.style\),/);
    assert.match(body, /if \(state\.started && audio\.ctx\) setAmbientForStreet\(currentStreet\);/);
    // The music after currentStreet is the home: set before it, the last place's would be named.
    assert.ok(body.indexOf('setAmbientForStreet(currentStreet)') > body.indexOf('currentStreet = {'));
  });

  it('every way home reaches renderHomeScene (trips, instance and quest room exits, Teleport Home, the door, a feature, a reload)', () => {
    // streetTripTo and enterStreet: a home place is arriveInHome, never a street file.
    assert.match(fnBody(game, 'async function streetTripTo('), /if \(isHomePlaceTsid\(tsid\) && homeState\.owned\) return arriveInHome\(tsid, opts\);/);
    assert.match(fnBody(game, 'async function enterStreet('), /if \(isHomePlaceTsid\(tsid\) && homeState\.owned\) return arriveInHome\(/);
    assert.match(fnBody(game, 'async function arriveInHome('), /renderHomeScene\(/);
    assert.match(fnBody(game, 'async function teleportHome('), /renderHomeScene\(/);
    // engine.enter: every feature's way out (quest rooms, party spaces, races, puzzle scenes).
    const enter = methodBody(game, '  async enter(tsid, opts = {}) {');
    assert.match(enter, /if \(tsid === HOME_STREET_TSID \|\| tsid === HOME_INTERIOR_TSID\) \{[\s\S]*renderHomeScene\(/);
    assert.match(enter, /enterStreetWithTransition\(/);
    // The instances' own ways back go by a street trip, never by drawing a street themselves.
    for (const fn of ['async function returnFromRookWoods(']) assert.match(fnBody(game, fn), /enterStreetWithTransition\(/);
    // No feature draws a home room itself: they all ask the engine.
    for (const f of readdirSync(join(root, 'public/js/features'))) {
      if (!f.endsWith('.js')) continue;
      assert.doesNotMatch(read(`public/js/features/${f}`), /renderHomeScene\(/, f);
    }
  });

  it('the other arrivals name theirs: a street, a scene with a music_file, a scene put back', () => {
    assert.match(fnBody(game, 'async function enterStreet('), /setAmbientForStreet\(data\);/);
    const scene = methodBody(game, '  enterScene(scene) {');
    assert.match(scene, /if \(scene\.musicFile\) \{[\s\S]{0,200}setAmbientForStreet\(currentStreet\);/);
    assert.match(methodBody(game, '  resumeScene(parked, spot = null) {'), /resumeWorld\(parked, spot, \{ scene: true \}\);/);
    // G911: the world park the scenes share (and the rooms game.js holds for a party).
    assert.match(fnBody(game, 'function resumeWorld('), /setAmbientForStreet\(currentStreet\);/);
  });

  it("another player's home plays its style's music too (a scene with a music_file)", () => {
    const n = read('public/js/features/neighbours-mp-feature.js');
    assert.match(n, /musicFile: homeMusicFile\(streetStyleFor\(visitorHomeState\(visit\.view\)\.streetStyle, visitorHomeState\(visit\.view\)\.style\)\),/);
  });
});

// #661: the home street's music follows the street style you have now. Glitch's Change Style
// re-cloned the street from the new template, its music_file with it (inc_homes.js 2861-2885), and
// the street played geometry.music_file (location.js 481-482). Failed on v0.64.0: the scene asked
// homeMusicFile(homeState.style), the look the home was bought in, written once.
describe('#661 home music follows the street style', () => {
  setAmbientMusicConfig(JSON.parse(read('public/assets/content/ambient-music.json')));
  const pc = () => ({ imagination: 100000, level: 10 });

  it('a Meadow home changed to a Firebog street plays the Firebog home street music', () => {
    const home = createHomeState();
    imagineHome(home, 'meadow');
    const street = { streetStyle: streetStyleFor(null, home.style) };
    assert.equal(homeMusicFile(street.streetStyle), 'HOME_STREET_GRODDLE_WHISTLE');
    assert.equal(switchStreetStyle(street, pc(), 'firebog_4_high').ok, true);
    assert.equal(homeMusicFile(streetStyleFor(street.streetStyle, home.style)), 'HOME_STREET_FIREBOGS');
    assert.equal(switchStreetStyle(street, pc(), 'uralia_2_high').ok, true);
    assert.equal(homeMusicFile(streetStyleFor(street.streetStyle, home.style)), 'HOME_STREET_URALIA');
  });

  it('a Firebog home changed to a Meadow street plays the Meadow whistle (the report)', () => {
    const home = createHomeState();
    imagineHome(home, 'firebog');
    const street = { streetStyle: streetStyleFor(null, home.style) };
    assert.equal(homeMusicFile(street.streetStyle), 'HOME_STREET_FIREBOGS');
    assert.equal(switchStreetStyle(street, pc(), 'meadow_ext_default_high').ok, true);
    assert.equal(homeMusicFile(streetStyleFor(street.streetStyle, home.style)), 'HOME_STREET_GRODDLE_WHISTLE');
  });

  it("every style plays its family's music, the rest the Forest set a POL hub got", () => {
    for (const row of EXTERIOR_STYLES) {
      const want = row.key.startsWith('firebog_') ? 'HOME_STREET_FIREBOGS'
        : row.key.startsWith('uralia_') ? 'HOME_STREET_URALIA'
          : row.key.startsWith('meadow') ? 'HOME_STREET_GRODDLE_WHISTLE' : HUB_DEFAULT_MUSIC;
      assert.equal(homeMusicFile(row.key), want, row.key);
    }
    // The hub default is Glitch's ambient_library.default (main.js 332-336), even on a floor named like a hub.
    for (const hubName of ['Homes', 'Uralia', 'Groddle Lounge', '']) {
      assert.equal(resolveAmbientTheme({ hubId: 'scene', hubName, musicFile: homeMusicFile('forest_1_high') }), 'default', hubName);
    }
    assert.deepEqual(tracksForTheme('default').map((t) => t.split('/').pop().replace(/\..*$/, '')).slice(0, 1), ['FOREST_AMBIENT1']);
  });

  it('the scene asks the homes feature for the street style now; the feature answers it', () => {
    const feature = read('public/js/features/homes-feature.js');
    assert.match(feature, /homeStreetStyle\(engine\) \{\n\s*return currentStreetStyle\(engine\);/);
    // Change Style redraws the street at once, which names the music again.
    const apply = feature.slice(feature.indexOf('function applyStreetStyle('), feature.indexOf('function renderStyleDialog('));
    assert.ok(apply.indexOf('streetStyle = key;') < apply.indexOf('engine.refreshHomeScene?.();'));
  });
});
