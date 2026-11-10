/**
 * GATESIGN, GATESIGN2 (Austin 2026-10-31): the home street's way out is Tiny Speck's own street
 * signpost, not a code-drawn "World Gate"; and one post, not two ("the 2 different poles look
 * silly. Let's combine and just put the top one as, Back to Ur"). The friends' signpost's post
 * carries the way out as its top arm, Back to Ur, pointing left; the friends' arms hang below.
 * The Imagination menu keeps Back to world, as the original had.
 *
 * The original had no gate: you left home through the Imagination menu (glitch-client
 * ImgMenuHome.as at home: "Back to world", tip "<street>, <hub>", /leave; ImgMenuBackToWorld.as
 * in another player's home), and the home street's only post was the friends' signpost
 * (locations/inc_homes.js geo_lock_signpost).
 * Run: node --test tests/home-way-out-signpost.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getVerbsFor } from '../public/content.js?v=0c78b59c';
import { SIGN_FIRST_ARM_Y, SIGN_POST_W, SIGN_SCALE } from '../public/js/street-render.js?v=881d705a';
import { WAY_OUT_ARM, WAY_OUT_HIT, wayOutTarget } from '../public/js/features/homes-feature.js?v=ff63e234';
import { FRIENDS_HIT_H } from '../public/js/features/home-street-mp-feature.js?v=5d69e807';
import {
  SIGNPOST_POST_HALF,
  createCultivationState,
  dispatcherRx,
  footprint,
  groundFixtures,
  homeStreetLayout,
  normalizeCultivationState,
  placementCheck,
} from '../public/js/home-cultivation.js?v=9571e110';
import { DISPATCHER_TEXT, SIGNPOST, dispatcherDefaultRx, dispatcherFits, signpostX, streetFixtures } from '../public/js/home-street-fixtures.js?v=bad831a1';
import { sceneSignMarks } from '../public/js/ui/street-minimap.js?v=fa31d398';
import { HUB_TILES, hubTileBackground, hubTileForKey, hubTileState } from '../public/js/ui/imagination-hub.js?v=51fa371f';
import { HUB_CLOUDS, placeClouds } from '../public/js/classic/classic-hub.js?v=ddd2c64f';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');
const CLIENT = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'view', 'ui', 'imagination');

describe('one signpost at home: its top arm says Back to Ur', () => {
  const homes = read('js/features/homes-feature.js');
  const mp = read('js/features/home-street-mp-feature.js');

  it('homes-feature draws the one post, from Tiny Speck\'s PNGs, where the friends\' signpost stands', () => {
    assert.doesNotMatch(homes, /makeGateSprite|makeWayOutSignpost|gateX/);
    assert.match(homes, /function makeHomeSignpost\(engine\) \{\n\s+const post = oneArmSignpost\(engine\.PIXI, WAY_OUT_ARM, \{ left: true \}\);/);
    // Your own street and a visitor's view of someone's both draw it, at the friends' signpost's x.
    assert.equal((homes.match(/makeHomeSignpost\(/g) || []).length, 3);
    assert.equal((homes.match(/gate\.x = signpostX\(layout\);/g) || []).length, 2);
    assert.match(mp, /return fixtureSignpostX\(layout\);/);
    const render = read('js/street-render.js');
    const helper = render.slice(render.indexOf('export function oneArmSignpost('), render.indexOf('/** @type {Set<string>|null} */\nlet decoManifest'));
    for (const art of ['shadow', 'post', 'arm']) assert.match(helper, new RegExp(`textureFromUrl\\(SIGNPOST\\.${art}\\)`), art);
    assert.doesNotMatch(helper, /Graphics/, 'no drawn art');
    assert.match(helper, /if \(left\) board\.scale\.x \*= -1;/);
  });

  it('the top arm reads exactly Back to Ur; the friends\' signpost draws only its arms, no second post', () => {
    assert.equal(WAY_OUT_ARM, 'Back to Ur');
    const draw = mp.slice(mp.indexOf('  function drawSignpost('), mp.indexOf('  /** note_pole.as'));
    assert.ok(draw.length > 500);
    assert.doesNotMatch(draw, /SIGN_ART\.post|SIGN_ART\.shadow/);
    assert.match(draw, /const board = new PIXI\.Sprite\(textureFromUrl\(SIGN_ART\.arm\)\);/);
    // Its arms keep their slots, under the post's top arm, drawn over the post.
    assert.match(draw, /const postH = 200;/);
    assert.match(draw, /arm\.y = -postH \+ i \* 28 \+ 32;/);
    assert.match(draw, /box\.zIndex = 21;/);
  });

  it('no player-facing "World Gate" is left in the game', () => {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.js')) files.push(p);
      }
    };
    walk(join(pub, 'js'));
    files.push(join(pub, 'game.js'), join(pub, 'content.js'), join(root, 'tools', 'restoration', 'checklist.mjs'));
    for (const f of files) {
      // Comments may remember it; strings may not.
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
      assert.doesNotMatch(code, /['"`][^'"`\n]*World Gate/, f);
    }
    assert.doesNotMatch(read('restoration/data.json'), /World Gate/);
  });

  it('the top arm\'s target is Back to Ur, its tip the street you will return to and its hub', () => {
    assert.deepEqual(wayOutTarget({ label: 'Hechey Track', hubName: 'Groddle Forest' }), { label: 'Back to Ur', subtitle: 'Hechey Track, Groddle Forest' });
    assert.deepEqual(wayOutTarget({ label: 'Groddle', hubName: 'Groddle' }), { label: 'Back to Ur', subtitle: 'Groddle' });
    assert.deepEqual(wayOutTarget({}), { label: 'Back to Ur', subtitle: 'Back out into the world' });
    assert.match(homes, /classId: 'home_return_marker',\n\s+label: words\.label,\n\s+subtitle: words\.subtitle,/);
    // The remembered street, else your arrival street, as returnFromHome goes (game.js).
    const game = read('game.js');
    assert.match(game, /function homeReturnDestination\(back = homeState\.returnLocation\) \{\n\s+const tsid = back\?\.tsid \|\| STREET_INDEX\.default;/);
    assert.match(game, /const destination = homeReturnDestination\(result\.returnLocation\);/);
  });

  it('Enter on it offers the way back to that street, which returns you (handleHomeTarget)', () => {
    const verbs = getVerbsFor({ classId: 'home_return_marker', state: { returnLabel: 'Hechey Track', returnHub: 'Groddle Forest' } }, { pc: {}, inv: {} });
    const back = verbs.find((v) => v.id === 'return_to_world');
    assert.equal(back.label, 'back to Hechey Track');
    assert.equal(back.tooltip, 'Teleport back to Hechey Track, Groddle Forest');
    assert.match(read('game.js'), /if \(target\?\.classId === 'home_return_marker' && verbId === 'return_to_world'\) \{\n\s+returnFromHome\(\);/);
  });

  it('the top arm sits above the friends\' arms on the same post, and a click there is the way out', () => {
    const half = (30 * SIGN_SCALE) / 2;
    const wayY = SIGN_FIRST_ARM_Y * SIGN_SCALE;
    // The friends' highest arm (slot 0, a right arm, tilting the other way) and their left arms
    // (slots 1 and 3, tilting as the top arm does) all stay below it.
    for (let i = 0; i < 5; i++) {
      const y = (-200 + i * 28 + 32) * SIGN_SCALE;
      assert.ok(wayY + half < y - half - 6, `slot ${i}`);
    }
    const tilt = Math.tan((5.5 * Math.PI) / 180);
    const slot0 = (-200 + 32) * SIGN_SCALE;
    for (let d = 0; d <= SIGNPOST.right; d += 2) assert.ok(wayY + half < slot0 - tilt * d - half || d > 0, `right arm at ${d}`);
    // Hit boxes: the post's (the way out) is taller than the friends' arms', which stop under the top arm.
    assert.deepEqual({ ...WAY_OUT_HIT }, { w: 140, h: 210 });
    assert.ok(FRIENDS_HIT_H < -wayY + half, 'the friends\' box stops under Back to Ur');
    assert.ok(FRIENDS_HIT_H >= -slot0 + half, 'and covers their top arm');
  });

  it('one post: its ground is the signpost\'s alone, the old second post\'s ground is free; saves stay good', () => {
    const st = createCultivationState({});
    const layout = homeStreetLayout(st);
    assert.deepEqual(streetFixtures(layout).map((f) => f.id), ['signpost', 'rock', 'butler_box']);
    assert.ok(SIGN_POST_W / 2 <= SIGNPOST_POST_HALF, 'the post is inside its ground span');
    const g = groundFixtures(layout).find((f) => f.id === 'signpost');
    assert.deepEqual([g.x1, g.x2], [signpostX(layout) - SIGNPOST_POST_HALF, signpostX(layout) + SIGNPOST_POST_HALF]);
    // The Mail Dispatcher's usual spot is unchanged (past the signpost's left arms).
    assert.equal(dispatcherDefaultRx(layout), -674);
    assert.equal(dispatcherRx(st), -674);
    // Where the second post stood (lot + 40) is no fixture now: the dispatcher may stand there.
    const old = layout.lotLeft + 40;
    for (const f of [...groundFixtures(layout), ...streetFixtures(layout)]) assert.ok(old < f.x1 || old > f.x2, f.id);
    assert.equal(dispatcherFits(layout, old + 60).ok, true);
    // A Patch reaching over the old post's ground fits now, and a save with one loads as it was.
    const rx = -250;
    assert.ok(layout.houseX + rx - footprint('proto_patch') < old, 'over the old post');
    assert.equal(placementCheck(st, 'proto_patch', rx).ok, true);
    const saved = normalizeCultivationState({ items: [{ id: 1, protoClass: 'proto_patch', endClass: 'patch', rx }] });
    assert.equal(saved.items[0].rx, rx);
    assert.doesNotMatch(JSON.stringify(DISPATCHER_TEXT), /World Gate|gate|signposts/);
  });

  it('the street map shows one signpost there: Back to Ur over the friends', () => {
    const marks = sceneSignMarks([
      { classId: 'home_return_marker', label: 'Back to Ur', sprite: { x: 290, y: 872 } },
      { classId: 'mp_home_signpost', label: 'Signpost', state: { arms: ['Pal40'] }, sprite: { x: 290, y: 872 } },
    ]);
    assert.deepEqual(marks, [{ kind: 'sign', id: 'scene:home_return_marker:0', x: 290, y: 872, tip: 'Back to Ur\nPal40' }]);
  });
});

describe('Back to world in the Imagination menu', () => {
  it('the Modern hub has the seventh cloud, B, with its own cloud art on a card blue', () => {
    const back = HUB_TILES.find((t) => t.id === 'back');
    assert.deepEqual([back.label, back.key], ['Back to world', 'B']);
    assert.equal(back.art, 'assets/classic/cloud_back_to_world.svg');
    assert.ok(existsSync(join(pub, back.art)) && existsSync(join(pub, back.under)));
    assert.equal(hubTileForKey({ key: 'b' }).id, 'back');
    // Home stays the Home panel: no second "Go home".
    assert.equal(HUB_TILES.filter((t) => /home/i.test(t.label)).length, 1);
  });

  it('dims out in the world, tips the street and hub at home, and shows that street', () => {
    const back = HUB_TILES.find((t) => t.id === 'back');
    assert.deepEqual(hubTileState(back, { disabled: true, tip: 'You are out in the world', art: null }), { disabled: true, tip: 'You are out in the world', art: back.art, photo: false });
    const home = hubTileState(back, { disabled: false, tip: 'Hechey Track, Groddle Forest', art: 'assets/loading-strips/GA5101HF7F429V5.jpg' });
    assert.deepEqual(home, { disabled: false, tip: 'Hechey Track, Groddle Forest', art: 'assets/loading-strips/GA5101HF7F429V5.jpg', photo: true });
    assert.equal(hubTileBackground(back, home), "url('assets/loading-strips/GA5101HF7F429V5.jpg')");
    assert.equal(hubTileBackground(back), `url('${back.art}'), url('${back.under}')`);
    assert.deepEqual(hubTileState(HUB_TILES[0], null), { disabled: false, tip: '', art: HUB_TILES[0].art, photo: false });
  });

  it('the hub leaves a dimmed tile alone and the game wires the way out', () => {
    const hub = read('js/ui/imagination-hub.js');
    assert.match(hub, /if \(tiles\.find\(\(t\) => t\.dataset\.hubTile === id\)\?\.getAttribute\('aria-disabled'\) === 'true'\) return false;/);
    assert.match(hub, /imgEl\.textContent = hubPillText\(imagination\(\)\);\n\s+refreshTiles\(\);/);
    const game = read('game.js');
    assert.match(game, /back: \(\) => homeWayOut\(\)\?\.go\?\.\(\),/);
    assert.match(game, /if \(id !== 'back'\) return null;\n\s+const way = homeWayOut\(\);/);
    // Anywhere in your own home (street or house: isTsidInHome), or on a visit to someone's.
    assert.match(game, /const visit = features\.query\('homeVisitWayOut', engine\);\n\s+const base = visit \|\| \(homeIsInstanced\(\) \? \{ \.\.\.homeReturnDestination\(\), go: \(\) => returnFromHome\(\) \} : null\);/);
    assert.match(game, /const tip = base\.hubName && base\.hubName !== base\.label \? `\$\{base\.label\}, \$\{base\.hubName\}` : base\.label;/);
    const css = read('style.css');
    assert.match(css, /\.imagination-hub \.hub-tile\[aria-disabled="true"\] \.hub-art \{ opacity: 0\.5;/);
  });

  it('Classic: at home the home cloud reads Back to world and leaves, the world cloud dims to Go home', () => {
    assert.deepEqual(HUB_CLOUDS.map((c) => c.id).slice(-2), ['home', 'back']);
    assert.equal(placeClouds(true).backTitle, 'Go home');
    assert.equal(placeClouds(false).backTitle, 'Back to world');
    const src = read('js/classic/classic-hub.js');
    assert.match(src, /else if \(id === 'home' && atHome\(\) && wayOut\(\)\) wayOut\(\)\.go\(\);/);
    assert.match(src, /else if \(id === 'back'\) wayOut\(\)\?\.go\?\.\(\);/);
    assert.match(src, /homeCloud\.title = home && way \? way\.tip : '';/);
  });

  it('follows the client\'s clouds where its source is present', { skip: !existsSync(CLIENT) && 'needs glitch-client beside the game' }, () => {
    const home = readFileSync(join(CLIENT, 'ImgMenuHome.as'), 'utf8');
    assert.match(home, /setTitle\(is_home \? 'Back to world' : 'Go home'\);/);
    assert.match(home, /if\(hub\) tip_txt \+= ', '\+hub\.label;/);
    const back = readFileSync(join(CLIENT, 'ImgMenuBackToWorld.as'), 'utf8');
    assert.match(back, /\(is_home \? 'Go home' : 'Back to world'\)/);
    assert.match(back, /enabled = !is_home && location\.is_pol;/);
  });
});

describe('online: a visitor\'s way out and the owner\'s', () => {
  const mp = read('js/features/neighbours-mp-feature.js');

  it('a visitor sees the same one post: its top arm Back to Ur takes them back where they came from', () => {
    assert.match(mp, /const built = visitorHomeScene\(engine, visit\.view, room, \{ returnLabel: wayOutOf\(visit\.returnTo\)\.label(, floor, via)? \}\);/);
    assert.match(mp, /t\.gate = engine\.register\(\{ classId: CLASS_GATE, featureId: NEIGHBOURS_MP_FEATURE_ID, label: 'Back to Ur', subtitle: `\$\{way\.label\}/);
    assert.match(mp, /if \(target\.classId === CLASS_GATE\) return \[\{ id: 'go_back'/);
    assert.match(mp, /else if \(verbId === 'go_back'\) goBack\(\);/);
  });

  it('Back to world on a visit is the visit\'s own way back (ImgMenuBackToWorld.as /leave)', () => {
    assert.match(mp, /wayOut\(\) \{\n\s+if \(!visit \|\| !readVisitScene\(engine\.streetTsid\)\) return null;\n\s+return \{ \.\.\.wayOutOf\(visit\.returnTo\), go: \(\) => goBack\(\) \};/);
    assert.match(mp, /homeVisitWayOut\(engine\) \{\n\s+if \(!session \|\| engine\?\.mode !== 'multiplayer'\) return null;\n\s+return session\.wayOut\(\) \|\| null;/);
  });

  it('the owner\'s street online: the same post, the friends\' arms hung on it', () => {
    const own = read('js/features/home-street-mp-feature.js');
    assert.match(own, /if \(own\.neighbors\) drawSignpost\(signpostX\(layout\), STREET_GROUND_Y, own\.neighbors, \{ owner: true \}\);/);
    assert.match(own, /drawSignpost\(signpostX\(layout\), STREET_GROUND_Y, signpostArms\(visit\.data\.signpost\)\.filter\(Boolean\), \{ owner: false \}\);/);
    assert.match(read('js/features/homes-feature.js'), /classId: 'home_return_marker',/);
  });
});
