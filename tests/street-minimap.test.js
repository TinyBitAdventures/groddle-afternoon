/**
 * MINIMAP (G370): the street map (js/ui/street-minimap.js, features/street-minimap-feature.js),
 * after glitch-client MiniMapView.as. The geometry and bleed, which signposts show, the tips, the
 * dot colours, no_map / fog_map, the setting and its toggles, and that it keeps clear of the Social
 * drawer (--inset-r) with the route card stacked under it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from './css-tokens.js';
import {
  EXPAND_TAB,
  ITEM_DOT,
  MAP_BLEED,
  MAP_WIDTH,
  MAX_CONTRACTED_H,
  NO_MAP_TEXT,
  OTHER_DOT,
  STREET_MAP_LABEL,
  STREET_MAP_STORAGE_KEY,
  TRACKED_ITEMS,
  YOU_DOT,
  createStreetMapPref,
  dotColor,
  dotLook,
  loadStreetMap,
  mapGeometry,
  minimapVisibility,
  parseStreetMap,
  placeMark,
  saveStreetMap,
  scrollFor,
  signpostMarks,
  tipFor,
  toMap,
} from '../public/js/ui/street-minimap.js?fresh=street-minimap';
import { clientKeyAction, hotkeySections, hotkeyText } from '../public/js/client-hotkeys.js?fresh=street-minimap';
import { minimapRows } from '../public/js/features/street-minimap-feature.js?fresh=street-minimap';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const street = (over = {}) => ({ bounds: { l: -3000, r: 3000, t: -1000, b: 0 }, signposts: [], ...over });

/** A storage stand-in; `fail` makes every call throw (a private window). */
function fakeStorage(fail = false) {
  const m = new Map();
  return {
    getItem: (k) => { if (fail) throw new Error('denied'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (fail) throw new Error('denied'); m.set(k, String(v)); },
    map: m,
  };
}

describe('street map: geometry (addGraphic, translateX/Y, placeThingAt)', () => {
  it('the source numbers', () => {
    assert.equal(MAP_WIDTH, 160);
    assert.equal(MAX_CONTRACTED_H, 70);
    assert.deepEqual({ ...EXPAND_TAB }, { w: 30, h: 10 });
    assert.equal(MAP_BLEED, 20);
  });

  it('scales the street to 160 wide and keeps its shape', () => {
    const g = mapGeometry(street());
    assert.equal(g.w, 160);
    assert.equal(g.mapH, (1000 * 160) / 6000);
    assert.equal(g.expandable, false, 'a short street shows whole, no tab');
    assert.equal(g.contractedH, g.mapH);
    assert.equal(g.bleed, 20);
  });

  it('a tall street shows a 70 px slice plus the tab height, with the tab, when it grows by 14 or more', () => {
    const tall = mapGeometry(street({ bounds: { l: 0, r: 1500, t: -2700, b: 0 } }));
    assert.equal(tall.mapH, 288);
    assert.equal(tall.expandable, true);
    assert.equal(tall.contractedH, 80, 'MAX_CONTRACTED_H + MAP_EXPAND_BUTTON_H');
    // 83 px tall: under 70 + 14, no tab.
    const edge = mapGeometry(street({ bounds: { l: 0, r: 1600, t: -830, b: 0 } }));
    assert.equal(edge.expandable, false);
    const over = mapGeometry(street({ bounds: { l: 0, r: 1600, t: -850, b: 0 } }));
    assert.equal(over.expandable, true);
  });

  it('everything scales with the width (u), the bleed too', () => {
    const g = mapGeometry(street({ bounds: { l: 0, r: 1500, t: -2700, b: 0 } }), { width: 192 });
    assert.equal(g.u, 1.2);
    assert.equal(g.bleed, 24);
    assert.equal(g.contractedH, 96);
    assert.equal(g.tab.w, 36);
  });

  it('maps the street bounds onto the map, rounded', () => {
    const g = mapGeometry(street());
    assert.deepEqual(toMap(g, 0, 0), { x: 0, y: 0 });
    assert.deepEqual(toMap(g, 6000, 1000), { x: 160, y: 27 });
    assert.deepEqual(toMap(g, 3000, 500), { x: 80, y: 13 });
    assert.deepEqual(toMap(g, 3010, 0), { x: 80, y: 0 });
  });

  it('a mark stands on its point, centred, and may bleed past the edges', () => {
    const g = mapGeometry(street());
    const p = placeMark(g, 3000, 900, 12, 12, 0);
    assert.deepEqual(p, { left: 74, top: 12, visible: true });
    // A dot at the left edge pokes out into the bleed instead of being cut off.
    const left = placeMark(g, 0, 900, 12, 12, 0);
    assert.equal(left.left, -6);
    assert.ok(left.left > -MAP_BLEED);
    // A post at the top: never more than its height above the map (the EC max() in placeThingAt).
    const top = placeMark(g, 3000, 0, 10, 15, 0);
    assert.equal(top.top, -14);
    assert.equal(top.visible, true);
  });

  it('hides a mark whose foot is above what shows (showHideIcons)', () => {
    const g = mapGeometry(street({ bounds: { l: 0, r: 1500, t: -2700, b: 0 } }));
    assert.equal(placeMark(g, 750, 270, 12, 12, 40).visible, false, 'foot at 29, window top at 40');
    assert.equal(placeMark(g, 750, 600, 12, 12, 40).visible, true);
  });

  it('keeps you centred, inside the map; the unroll holds the bottom (updateYou)', () => {
    const g = mapGeometry(street({ bounds: { l: 0, r: 1500, t: -2700, b: 0 } }));
    assert.equal(scrollFor(g, 0, 80), 0);
    assert.equal(scrollFor(g, 150, 80), 110);
    assert.equal(scrollFor(g, 280, 80), 208, 'never past the bottom');
    assert.equal(scrollFor(g, 150, 200, true), 88, 'while tweening: the bottom holds');
    assert.equal(scrollFor(g, 150, 288), 0, 'expanded: the whole map');
  });
});

describe('street map: signposts and tips (maybeAddSignpost, getTip)', () => {
  const s = street({
    signposts: [
      { id: 'a', x: -2739, y: -403, connects: [{ tsid: 'L1', label: 'Plains Rte C' }, { tsid: 'L2', label: 'Empty Via 4' }] },
      { id: 'b', x: 0, y: -100, connects: [{ tsid: 'L3', label: 'Secret', hidden: true }] },
      { id: 'c', x: 100, y: -100, hidden: true, connects: [{ tsid: 'L4', label: 'Gone' }] },
      { id: 'd', x: 200, y: -100, invisible: true, connects: [{ tsid: 'L5', label: 'Gone too' }] },
      { id: 'e', x: 300, y: -100, connects: [{ tsid: 'L6', label: 'Shown', hidden: false }, { tsid: 'L7', label: 'Not this', hidden: true }] },
      { id: 'f', x: 400, y: -100, connects: [] },
      { id: 'g', x: 500, y: -100, quarterInfo: { style: 'tower' }, connects: [{ tsid: 'L8', label: 'Floor' }] },
    ],
  });

  it('shows posts with a visible connection; hidden, invisible, empty and styled posts are skipped', () => {
    const marks = signpostMarks(s);
    assert.deepEqual(marks.map((m) => m.id), ['a', 'e']);
    assert.deepEqual([marks[0].x, marks[0].y], [261, 597], 'world points: the street less its bounds');
  });

  it('a home street shows its posts even with no visible connection (hidden and invisible posts still go)', () => {
    assert.deepEqual(signpostMarks({ ...s, isHome: true }).map((m) => m.id), ['a', 'b', 'e', 'f']);
  });

  it('tips: a post lists its places one per line; a player and an item show their label; you show none', () => {
    const [a, e] = signpostMarks(s);
    assert.equal(tipFor(a), 'Plains Rte C\nEmpty Via 4');
    assert.equal(tipFor(e), 'Shown');
    assert.equal(tipFor({ kind: 'player', label: 'Bumbishfish' }), 'Bumbishfish');
    assert.equal(tipFor({ kind: 'item', label: 'The Rube' }), 'The Rube');
    assert.equal(tipFor({ kind: 'you', label: 'Ur' }), null);
    assert.equal(tipFor({ kind: 'player', label: '  ' }), null);
  });

  it('every archived street the map can show has its posts (no street errors)', () => {
    let posts = 0;
    for (const f of readdirSync(join(root, 'public/assets/streets')).filter((n) => n.endsWith('.json')).slice(0, 400)) {
      const data = JSON.parse(read(`public/assets/streets/${f}`));
      const marks = signpostMarks(data);
      posts += marks.length;
      for (const m of marks) assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y), `${f} ${m.id}`);
    }
    assert.ok(posts > 300, `${posts} posts`);
  });
});

describe('street map: dots (addYou, colorPC, ITEMS_TO_TRACK)', () => {
  it('you: a black r 4 dot, 2 px white ring, the 0xFFD616 glow, no tip', () => {
    const you = dotLook({ kind: 'you' });
    assert.equal(you.fill, '#000000', 'addYou fills 0, not the unused YOU_DOT_COLOR');
    assert.equal(you.stroke, '#ffffff');
    assert.equal(you.r, 4);
    assert.equal(you.ring, 2);
    assert.equal(you.glow, '#ffd616');
    assert.equal(you.size, 10);
    assert.deepEqual({ ...YOU_DOT }, { r: 4, ring: 2, fill: '#000000', stroke: '#ffffff', glow: '#ffd616' });
  });

  it('another player: white r 5 (circleSize 4 + half the ring) with a 2 px black ring', () => {
    const o = dotLook({ kind: 'player', label: 'Amp' });
    assert.deepEqual([o.fill, o.stroke, o.r, o.size, o.text], ['#ffffff', '#000000', 5, 12, '']);
    assert.equal(OTHER_DOT.r, 5);
  });

  it('a colour group fills the dot (ColorUtil.getDotColor: #rrggbb, else black)', () => {
    assert.equal(dotLook({ kind: 'player', colorGroup: '#3399FF' }).fill, '#3399ff');
    assert.equal(dotLook({ kind: 'player', colorGroup: 'red' }).fill, '#000000');
    assert.equal(dotColor(''), '#000000');
  });

  it('game text: 2 px bigger, the ring the fill colour, the text inside', () => {
    const t = dotLook({ kind: 'player', colorGroup: '#cc0000', gameText: '3' });
    assert.deepEqual([t.fill, t.stroke, t.r, t.size, t.text], ['#cc0000', '#cc0000', 7, 16, '3']);
  });

  it('the Rube: an orange 0xf8992a dot with a black ring; he is the only tracked item', () => {
    const i = dotLook({ kind: 'item' });
    assert.deepEqual([i.fill, i.stroke, i.size], ['#f8992a', '#000000', 12]);
    assert.equal(ITEM_DOT.fill, '#f8992a');
    assert.deepEqual([...TRACKED_ITEMS], ['npc_rube']);
  });

  it('the CSS draws the same colours (tokens), and a dot takes its row colour', () => {
    const css = resolveTokens(read('public/style.css'));
    const block = css.slice(css.indexOf('/* —— MINIMAP —— */'), css.indexOf('/* —— end MINIMAP —— */'));
    assert.ok(block.length > 100, 'the MINIMAP block');
    assert.match(block, /\.smm-you \{[^}]*background: #000000;[^}]*border-color: #ffffff;[^}]*box-shadow:[^}]*rgba\(255, 214, 22, 0\.55\)/);
    assert.match(block, /\.smm-dot \{[^}]*border: calc\(2px \* var\(--mm-u\)\) solid var\(--dot-ring, #000000\)[^}]*background: var\(--dot, #ffffff\)/);
    assert.match(block, /\.smm-item \{ background: #f8992a; \}/);
    const mod = read('public/js/ui/street-minimap.js');
    assert.match(mod, /setProperty\('--dot', look\.fill\)/);
    assert.match(mod, /setProperty\('--dot-ring', look\.stroke\)/);
  });

  it('the feature reads other players, local companions and the Rube', () => {
    const engine = {
      query: (hook) => (hook === 'minimapPlayers' ? [{ id: 'u7', label: 'Kim', x: 10, y: 20 }] : hook === 'minimapItems' ? [{ id: 'npc_rube', label: 'The Rube', x: 30, y: 40 }] : null),
      localCompanions: [{ name: 'Amp', label: 'Amp', sprite: { x: 50, y: 60 } }, { name: 'Gone', sprite: { x: 1, y: 1, destroyed: true } }],
    };
    assert.deepEqual(minimapRows(engine).map((r) => `${r.kind}:${r.id}:${r.label}`), ['player:u7:Kim', 'player:local-Amp:Amp', 'item:npc_rube:The Rube']);
    assert.deepEqual(minimapRows({ query: () => null }), [], 'solo with nobody here');
  });

  it('realtime answers the players drawn on the street; the Rube feature answers him', () => {
    assert.match(read('public/js/features/realtime-feature.js'), /minimapPlayers\(\) \{[\s\S]{0,300}session\.remotes\.values\(\)[\s\S]{0,200}x: r\.root\.x, y: r\.root\.y/);
    assert.match(read('public/js/features/rube-feature.js'), /minimapItems\(\) \{[\s\S]{0,300}id: RUBE_CLASS/);
  });
});

describe('street map: no_map and fog_map', () => {
  // Tiny Speck's streets: a published zone's (GZ) carry noMap of their own (spec 11).
  const streets = readdirSync(join(root, 'public/assets/streets')).filter((n) => n.endsWith('.json') && !/^[GL]Z/.test(n));
  const flagged = (key) => streets.filter((f) => read(`public/assets/streets/${f}`).includes(`"${key}":true`));

  it('the archive\'s flags are carried (build-street-layers.mjs): 65 no_map, 2 fog_map', () => {
    const noMap = flagged('noMap');
    const fog = flagged('fogMap');
    assert.equal(noMap.length, 65);
    assert.deepEqual(fog.sort(), ['GHH12E1QP611OPA.json', 'GLI1D5DO1671QPA.json'], 'The Drop and The Other Drop');
    assert.ok(noMap.includes('GA9H1V6OGRU2FSB.json'), 'Abandoned Hauki Seeks Manor');
    assert.match(read('build-street-layers.mjs'), /topBool\('no_map'\)[\s\S]{0,200}topBool\('fog_map'\)/);
  });

  it('no_map hides the map; fog_map keeps it with the wash and the words', () => {
    assert.equal(minimapVisibility({ street: { noMap: true } }), 'no-map');
    assert.equal(minimapVisibility({ street: { fogMap: true } }), 'shown');
    assert.equal(NO_MAP_TEXT, "No map: You're on your own");
    const mod = read('public/js/ui/street-minimap.js');
    assert.match(mod, /const fogged = Boolean\(street\.fogMap\);\s+fog\.hidden = !fogged;\s+wash\.hidden = !fogged;/);
    assert.match(resolveTokens(read('public/style.css')), /\.smm-fogwash \{ position: absolute; inset: 0; background: rgba\(0, 0, 0, 0\.7\); \}/);
  });

  it('hides while you move, in full-screen moments, the Imagination menu, decorate, Camera Mode, the tutorial and scenes', () => {
    const s = {};
    assert.equal(minimapVisibility({ street: s }), 'shown');
    for (const k of ['moving', 'screenView', 'imagination', 'decorating', 'cameraMode', 'tutorial', 'cutscene']) {
      assert.equal(minimapVisibility({ street: s, [k]: true }), 'hidden', k);
    }
    assert.equal(minimapVisibility({ street: null }), 'hidden');
    assert.equal(minimapVisibility({ street: s, started: false }), 'hidden');
    assert.equal(minimapVisibility({ street: s, pref: false }), 'off');
    const feat = read('public/js/features/street-minimap-feature.js');
    for (const hook of ["query?.('cameraModeActive', engine) === true", "query?.('tutorialRunning', engine) === true", "query?.('homeEditMode', engine) === 'decorate'", 'engine.streetCardUp?.()', 'engine.screenViewOpen?.()', 'engine.imaginationHubOpen?.()', 'engine.instanceHold', 'engine.vogOpen?.()']) {
      assert.ok(feat.includes(hook), hook);
    }
    assert.match(read('public/js/features/camera-mode-feature.js'), /cameraModeActive\(\) \{\s+return active \? true : null;/);
    assert.match(read('public/js/features/newxp-feature.js'), /tutorialRunning\(engine\) \{/);
  });
});

describe('street map: the setting', () => {
  it('on by default; "off" and "on" stored; anything else is the default', () => {
    assert.equal(parseStreetMap(null), true);
    assert.equal(parseStreetMap('off'), false);
    assert.equal(parseStreetMap('on'), true);
    assert.equal(parseStreetMap('maybe'), true);
    assert.equal(STREET_MAP_STORAGE_KEY, 'groddle.streetMap');
    assert.equal(STREET_MAP_LABEL, 'Street map');
  });

  it('remembers the choice; a storage that throws leaves it on and unremembered', () => {
    const st = fakeStorage();
    saveStreetMap(false, st);
    assert.equal(st.map.get('groddle.streetMap'), 'off');
    assert.equal(loadStreetMap(st), false);
    const bad = fakeStorage(true);
    assert.equal(loadStreetMap(bad), true);
    assert.doesNotThrow(() => saveStreetMap(false, bad));
  });

  it('set, toggle and listeners', () => {
    const st = fakeStorage();
    const pref = createStreetMapPref({ win: {}, storage: st });
    const heard = [];
    pref.onChange((on) => heard.push(on));
    assert.equal(pref.get(), true);
    pref.toggle();
    assert.equal(pref.get(), false);
    assert.equal(st.map.get('groddle.streetMap'), 'off');
    pref.set(false);
    pref.toggle();
    assert.deepEqual(heard, [false, true]);
    assert.equal(createStreetMapPref({ win: {}, storage: st }).get(), true, 'a new window reads it back');
  });

  it('Shift+M toggles it (the client\'s Shift+M was the chat map\'s tab); the sheet lists it', () => {
    const k = (key, o = {}) => ({ key, ...o });
    assert.equal(clientKeyAction(k('M', { shiftKey: true })), 'street-map');
    assert.equal(clientKeyAction(k('m')), 'map', 'M is still the hub map');
    const rows = hotkeySections().flatMap((s) => s.rows.map(([label, alts]) => `${label}: ${hotkeyText(alts)}`));
    assert.ok(rows.includes('Street Map: Shift+M'));
    assert.match(read('public/game.js'), /if \(action === 'street-map'\) \{\s+if \(!e\.repeat\) toggleStreetMap\(\);/);
  });

  it('a switch in the Menu\'s Settings, a box in Preferences, and the card\'s own hide and show buttons', () => {
    const topbar = read('public/js/ui/topbar.js');
    assert.match(topbar, /installStreetMap\(doc, opts\.streetMap\);/);
    assert.match(topbar, /row\.dataset\.menuControl = 'street-map';/);
    assert.match(read('public/game.js'), /streetMap: streetMapSetting,/);
    const prefs = read('public/js/classic/classic-prefs.js');
    assert.match(prefs, /parts\.streetMap\.addEventListener\('change', \(\) => setStreetMap\(parts\.streetMap\.checked\)\);/);
    assert.match(prefs, /win\.append\([^)]*tintRow, mapRow, foot\);/);
    const mod = read('public/js/ui/street-minimap.js');
    assert.match(mod, /class="smm-hide" aria-label="Hide the street map \(Shift\+M\)"/);
    assert.match(mod, /showBtn\.id = 'street-minimap-show';/);
    assert.match(mod, /if \(e\.key === 'Enter' \|\| e\.key === ' '\) e\.stopPropagation\(\);/, 'its keys are its own');
    assert.match(mod, /tab\.setAttribute\('aria-expanded'/);
  });

  it('expands on a 2 s hover or the tab, without the tween under reduced motion', () => {
    const mod = read('public/js/ui/street-minimap.js');
    assert.match(mod, /export const ROLLOVER_MS = 2000;/);
    assert.match(mod, /export const TWEEN_MS = 400;/);
    assert.match(mod, /rollTimer = setTimeout\(\(\) => setExpanded\(true\), ROLLOVER_MS\);/);
    assert.match(mod, /if \(!animate \|\| reducedMotion\(\) \|\|/);
    assert.match(read('public/js/features/street-minimap-feature.js'), /prefers-reduced-motion: reduce/);
    assert.match(read('public/style.css'), /@media \(prefers-reduced-motion: reduce\) \{\s+\.street-minimap \.smm-tab img \{ transition: none; \}/);
  });
});

describe('street map: placement', () => {
  const css = read('public/style.css');
  const block = css.slice(css.indexOf('/* —— MINIMAP —— */'), css.indexOf('/* —— end MINIMAP —— */'));

  it('modern: top right under the bar, left of the Social drawer (--inset-r)', () => {
    const rule = block.match(/\n\.street-minimap \{([^}]*)\}/);
    assert.ok(rule, 'the card rule');
    assert.match(rule[1], /top: calc\(var\(--hud-h\) \+ var\(--space-3\)\);/);
    assert.match(rule[1], /right: max\(var\(--hud-inset\), var\(--inset-r\)\);/);
    assert.match(rule[1], /z-index: var\(--z-hud\);/);
    assert.match(block, /\.smm-show \{[^}]*right: max\(var\(--hud-inset\), var\(--inset-r\)\);/);
  });

  it('the route card stacks under it in both skins (--minimap-h)', () => {
    assert.match(block, /\[data-ui="modern"\] #game-root \.route-gps \{ top: calc\(var\(--hud-h\) \+ var\(--space-3\) \+ var\(--minimap-h, 0px\)\); \}/);
    assert.ok(css.indexOf('/* —— MINIMAP —— */') > css.indexOf('[data-ui="modern"] #game-root .route-gps {'), 'after the PAPER rule, so it wins');
    assert.match(read('public/css/classic.css'), /:root\[data-ui="classic"\] #game-root \.route-gps \{ top: calc\(var\(--minimap-h, 0px\) \+ 10 \* var\(--cu\)\); \}/);
    assert.match(read('public/js/features/street-minimap-feature.js'), /setProperty\('--minimap-h', `\$\{h > 0 \? h \+ 12 : 0\}px`\)/);
  });

  it('classic: 160 wide at the world\'s top right with the copied art', () => {
    const classic = read('public/css/classic.css');
    assert.match(classic, /:root\[data-ui="classic"\] #game-root \.street-minimap \{\s+--mm-w: calc\(160 \* var\(--cu\)\);\s+top: 0;\s+right: 0;/);
    const manifest = JSON.parse(read('tools/classic-art/manifest.json'));
    const names = manifest.copy.map((e) => e.name);
    assert.ok(names.includes('map_expand_arrow') && names.includes('teensy_signpost'));
    assert.match(read('public/js/classic/classic-art.js'), /map_expand_arrow/);
  });

  it('the picture is an image, never a canvas on the page (tools read the first canvas)', () => {
    const mod = read('public/js/ui/street-minimap.js');
    assert.doesNotMatch(mod, /<canvas/);
    assert.match(mod, /<img class="smm-pic" alt="" \/>/);
  });

  it('registered as a feature', () => {
    assert.match(read('public/js/features/index.js'), /streetMinimapFeature,\n\];/);
  });
});
