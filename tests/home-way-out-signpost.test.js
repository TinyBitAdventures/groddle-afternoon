/**
 * GATESIGN (Austin 2026-10-31): the home street's way out is Tiny Speck's own street signpost,
 * not a code-drawn "World Gate", and the Imagination menu has Back to world as the original did.
 *
 * The original had no gate: you left home through the Imagination menu (glitch-client
 * ImgMenuHome.as at home: "Back to world", tip "<street>, <hub>", /leave; ImgMenuBackToWorld.as
 * in another player's home), and the home street's only post was the friends' signpost
 * (locations/inc_homes.js geo_lock_signpost). The signpost stands where the gate stood, its one
 * arm pointing left with the street you will return to on it; Enter on it takes you there.
 * Run: node --test tests/home-way-out-signpost.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getVerbsFor } from '../public/content.js?v=72cc82cd';
import { SIGN_FIRST_ARM_Y, SIGN_POST_W, SIGN_SCALE } from '../public/js/street-render.js?v=90a690df';
import { WAY_OUT_FALLBACK, WAY_OUT_HIT, wayOutTarget } from '../public/js/features/homes-feature.js?v=1b54505a';
import {
  GATE_POST_HALF,
  SIGNPOST_POST_HALF,
  createCultivationState,
  dispatcherRx,
  footprint,
  groundFixtures,
  homeStreetLayout,
  normalizeCultivationState,
  placementCheck,
} from '../public/js/home-cultivation.js?v=7097c51d';
import { DISPATCHER_TEXT, GATE, dispatcherDefaultRx, dispatcherFits, fixtureName, gateX, signpostX, streetFixtures } from '../public/js/home-street-fixtures.js?v=a9d81324';
import { HUB_TILES, hubTileBackground, hubTileForKey, hubTileState } from '../public/js/ui/imagination-hub.js?v=fff73f8c';
import { HUB_CLOUDS, placeClouds } from '../public/js/classic/classic-hub.js?v=264ab19f';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');
const CLIENT = join(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'view', 'ui', 'imagination');

describe('the way-out signpost replaces the World Gate', () => {
  const homes = read('js/features/homes-feature.js');

  it('is a street signpost from Tiny Speck\'s PNGs, not a drawn gate', () => {
    assert.doesNotMatch(homes, /makeGateSprite/);
    assert.match(homes, /function makeWayOutSignpost\(engine, label\) \{\n\s+const post = oneArmSignpost\(engine\.PIXI, label \|\| WAY_OUT_FALLBACK, \{ left: true \}\);/);
    // Your own street and a visitor's view of someone's both draw it.
    assert.equal((homes.match(/makeWayOutSignpost\(/g) || []).length, 3);
    assert.match(homes, /const gate = makeWayOutSignpost\(eng, opts\.returnLabel\);/);
    const render = read('js/street-render.js');
    const helper = render.slice(render.indexOf('export function oneArmSignpost('), render.indexOf('/** @type {Set<string>|null} */\nlet decoManifest'));
    for (const art of ['SIGNPOST.shadow', 'SIGNPOST.post', 'SIGNPOST.arm']) assert.match(helper, new RegExp(`textureFromUrl\\(${art.replace('.', '\\.')}\\)`), art);
    assert.doesNotMatch(helper, /Graphics/, 'no drawn art');
    // The words as every signpost's (signLabel), the arm mirrored on the left (makeSign left_side).
    assert.match(helper, /const label = signLabel\(PIXI, text, fill\);/);
    assert.match(helper, /if \(left\) board\.scale\.x \*= -1;/);
    for (const f of ['signpost_post.png', 'signpost_arm.png', 'signpost_shadow.png']) assert.ok(existsSync(join(pub, 'assets/ui/signpost', f)), f);
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
    files.push(join(pub, 'game.js'), join(pub, 'content.js'));
    for (const f of files) {
      // Comments may remember it; strings may not.
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
      assert.doesNotMatch(code, /['"`][^'"`\n]*World Gate/, f);
    }
  });

  it('its arm names the street you will return to, its target says where', () => {
    assert.deepEqual(wayOutTarget({ label: 'Hechey Track', hubName: 'Groddle Forest' }), { label: 'Hechey Track', subtitle: 'Back to Hechey Track, Groddle Forest' });
    assert.deepEqual(wayOutTarget({ label: 'Groddle', hubName: 'Groddle' }), { label: 'Groddle', subtitle: 'Back to Groddle' });
    assert.deepEqual(wayOutTarget({}), { label: WAY_OUT_FALLBACK, subtitle: 'Back out into the world' });
    assert.doesNotMatch(JSON.stringify(wayOutTarget({ label: 'X', hubName: 'Y' })), /—|Glitch/);
    assert.match(homes, /const way = ctx\.wayOut \|\| \{ label: ctx\.returnLabel \|\| '', hubName: '' \};/);
    assert.match(homes, /classId: 'home_return_marker',\n\s+label: words\.label,\n\s+subtitle: words\.subtitle,/);
    // The remembered street, else your arrival street, as returnFromHome goes (game.js).
    const game = read('game.js');
    assert.match(game, /function homeReturnDestination\(back = homeState\.returnLocation\) \{\n\s+const tsid = back\?\.tsid \|\| STREET_INDEX\.default;/);
    assert.match(game, /const destination = homeReturnDestination\(result\.returnLocation\);/);
    assert.match(game, /wayOut: \(\(\{ tsid, label, hubName \}\) => \(\{ tsid, label, hubName \}\)\)\(homeReturnDestination\(\)\),/);
  });

  it('Enter on it offers the way back to that street, which returns you (handleHomeTarget)', () => {
    const verbs = getVerbsFor({ classId: 'home_return_marker', state: { returnLabel: 'Hechey Track', returnHub: 'Groddle Forest' } }, { pc: {}, inv: {} });
    const back = verbs.find((v) => v.id === 'return_to_world');
    assert.equal(back.label, 'back to Hechey Track');
    assert.equal(back.tooltip, 'Teleport back to Hechey Track, Groddle Forest');
    const none = getVerbsFor({ classId: 'home_return_marker', state: {} }, { pc: {}, inv: {} }).find((v) => v.id === 'return_to_world');
    assert.equal(none.label, 'back to the world');
    assert.match(read('game.js'), /if \(target\?\.classId === 'home_return_marker' && verbId === 'return_to_world'\) \{\n\s+returnFromHome\(\);/);
  });

  it('its arm sits at a street signpost\'s first slot, above the friends\' signpost\'s arms, so they never cross', () => {
    const mp = read('js/features/home-street-mp-feature.js');
    assert.match(mp, /const postH = 200;/);
    assert.match(mp, /arm\.y = -postH \+ i \* 28 \+ 32;/);
    const friendsTop = -200 + 32; // the friends' highest arm (slot 0, a right arm), holder units
    const tilt = Math.tan((5.5 * Math.PI) / 180);
    const half = (30 * SIGN_SCALE) / 2; // both arms are 30 tall
    const gap = gateX({ lotLeft: 0 }) - signpostX({ lotLeft: 0 });
    assert.equal(gap, 110);
    // Each arm's tip rises 5.5 degrees; check every x between the posts, whatever the names' lengths.
    for (let d = 0; d <= gap; d += 1) {
      const wayBottom = SIGN_FIRST_ARM_Y * SIGN_SCALE - tilt * d + half;
      const friendsArmTop = friendsTop * SIGN_SCALE - tilt * (gap - d) - half;
      assert.ok(wayBottom < friendsArmTop, `at ${d} px left of the way-out post`);
    }
  });

  it('stands on the old gate\'s spot with its hit box; the ground keeps clear of its post', () => {
    assert.deepEqual({ ...GATE }, { lotDx: 40, half: 70 });
    assert.deepEqual({ ...WAY_OUT_HIT }, { w: 140, h: 210 });
    assert.equal(GATE_POST_HALF, SIGNPOST_POST_HALF);
    assert.ok(SIGN_POST_W / 2 <= GATE_POST_HALF, 'the post is inside its ground span');
    const layout = homeStreetLayout(createCultivationState({}));
    const g = groundFixtures(layout).find((f) => f.id === 'gate');
    assert.deepEqual([g.x1, g.x2], [gateX(layout) - GATE_POST_HALF, gateX(layout) + GATE_POST_HALF]);
    assert.equal(fixtureName('gate'), 'signpost');
    assert.doesNotMatch(JSON.stringify(DISPATCHER_TEXT), /World Gate|gate/);
  });

  it('old saves stay good: the dispatcher\'s usual spot and fits are unchanged, a cultivation on the wider post steps aside', () => {
    const st = createCultivationState({});
    const layout = homeStreetLayout(st);
    assert.equal(dispatcherDefaultRx(layout), -674);
    assert.equal(dispatcherRx(st), -674);
    // Every spot that fit beside the gate's 140 px board still fits (the span is the same).
    const span = streetFixtures(layout).find((f) => f.id === 'gate');
    assert.deepEqual([span.x1, span.x2], [gateX(layout) - 70, gateX(layout) + 70]);
    assert.equal(dispatcherFits(layout, gateX(layout) - 200).ok, false, 'still under the friends\' signpost');
    // A Patch saved 6 px clear of the old 12 px pole (half 10) now stands on the wider post: it
    // moves to the nearest spot that fits, the same on every client.
    const rx = Math.round(gateX(layout) + footprint('proto_patch') + 10 + 6 - layout.houseX);
    assert.equal(placementCheck(st, 'proto_patch', rx).reason, 'gate');
    assert.ok(Math.abs(layout.houseX + rx - gateX(layout)) - footprint('proto_patch') >= 10, 'clear of the old pole');
    const old = normalizeCultivationState({ items: [{ id: 1, protoClass: 'proto_patch', endClass: 'patch', rx }] });
    assert.notEqual(old.items[0].rx, rx);
    assert.equal(placementCheck(old, 'proto_patch', old.items[0].rx, 1, { dispatcher: false }).ok, true);
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

  it('the visited street\'s signpost names the street the visitor came from and takes them back', () => {
    assert.match(mp, /const built = visitorHomeScene\(engine, visit\.view, room, \{ returnLabel: wayOutOf\(visit\.returnTo\)\.label \}\);/);
    assert.match(mp, /t\.gate = engine\.register\(\{ classId: CLASS_GATE, featureId: NEIGHBOURS_MP_FEATURE_ID, label: way\.label,/);
    assert.match(mp, /if \(target\.classId === CLASS_GATE\) return \[\{ id: 'go_back'/);
    assert.match(mp, /else if \(verbId === 'go_back'\) goBack\(\);/);
  });

  it('Back to world on a visit is the visit\'s own way back (ImgMenuBackToWorld.as /leave)', () => {
    assert.match(mp, /wayOut\(\) \{\n\s+if \(!visit \|\| !readVisitScene\(engine\.streetTsid\)\) return null;\n\s+return \{ \.\.\.wayOutOf\(visit\.returnTo\), go: \(\) => goBack\(\) \};/);
    assert.match(mp, /homeVisitWayOut\(engine\) \{\n\s+if \(!session \|\| engine\?\.mode !== 'multiplayer'\) return null;\n\s+return session\.wayOut\(\) \|\| null;/);
  });

  it('the owner\'s street online keeps the same signpost (homes-feature) beside the friends\' signpost', () => {
    const own = read('js/features/home-street-mp-feature.js');
    assert.match(own, /return fixtureSignpostX\(layout\);/);
    assert.match(read('js/features/homes-feature.js'), /classId: 'home_return_marker',/);
  });
});
