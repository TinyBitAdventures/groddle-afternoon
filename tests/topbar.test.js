// The modern top bar (phase 2, Warm paper; js/ui/topbar.js): three floating pills, the HUD mock's
// rings, key caps, Menu groups and Sound popover over the game's real values and its existing ids.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MENU_GROUPS,
  MENU_ROWS,
  TOP_OVERFLOW_STEPS,
  FAVOR_NEUTRAL_ICON,
  popoverLeft,
  favorChip,
  favorRowText,
  levelRing,
  lowEnergyText,
  mailText,
  menuRowFor,
  nameplateLeft,
  pickTopOverflow,
  ringDash,
  vitalRing,
  volumeLevel,
  soundChannelToggle,
} from '../public/js/ui/topbar.js?v=ab9f6a0c';

import { GIANTS, canClaimEmblem, createShrineState, emblemCostFor, favorDisplayGiant, favorPanelRows, giantForStreet } from '../public/js/shrines.js?v=ec26da05';

const pub = join(import.meta.dirname, '..', 'public');
const read = (f) => readFileSync(join(pub, f), 'utf8');
const html = read('play/index.html');
const game = read('game.js');
const topbar = read('js/ui/topbar.js');
const header = html.slice(html.indexOf('<header class="top-bar"'), html.indexOf('</header>'));

describe('top bar helpers', () => {
  it('rings: the share as a dash, the state from js/vitals.js, words with every state', () => {
    assert.equal(ringDash(0.8), '80 100');
    assert.equal(ringDash(1.4), '100 100');
    assert.equal(ringDash(NaN), '0 100');
    const ok = vitalRing('energy', 80, 100);
    assert.deepEqual([ok.level, ok.num, ok.dash, ok.tip, ok.sub], ['ok', '80', '80 100', 'Energy 80/100', 'Click for something to eat']);
    assert.equal(ok.label, 'Energy 80/100. Click for something to eat.');
    const red = vitalRing('energy', 6, 100);
    assert.deepEqual([red.level, red.sub], ['critical', 'Very low: click to eat']);
    assert.equal(red.label, 'Energy 6/100 (very low). Click for something to eat.');
    assert.equal(vitalRing('mood', 15, 100).sub, 'Low: click for something to lift it');
    assert.equal(lowEnergyText('critical'), 'Very low energy');
    assert.equal(lowEnergyText('low'), 'Low energy');
    assert.equal(lowEnergyText('ok'), '');
  });

  it('level, favor and mail say their numbers in words', () => {
    const lv = levelRing({ level: 5, earned: 1205, needed: 2290, progress: 1205 / 2290 });
    assert.deepEqual([lv.num, lv.tip, lv.sub], ['5', 'Level 5', '1,205 / 2,290 XP to level 6']);
    assert.match(lv.label, /Your player card \(Z\)$/);
    assert.equal(levelRing({ level: 60, atCap: true }).sub, 'The top level');
    const f = favorChip({ name: 'Spriggan', points: 37, target: 1000 });
    assert.deepEqual([f.num, f.tip, f.sub], ['37', 'Favor with Spriggan', '37 of 1,000 for an emblem']);
    assert.equal(favorChip(null), null);
    assert.equal(favorChip({ name: 'Spriggan', points: 0, target: 1000 }), null, 'no chip that only says 0');
    // The nameplate: centred on the window while it fits, else in the room between the pills.
    assert.deepEqual(nameplateLeft({ rootW: 1280, plateW: 300, left: 400, right: 990 }), { x: 490, room: 574 });
    assert.deepEqual(nameplateLeft({ rootW: 1280, plateW: 300, left: 537, right: 990 }), { x: 545, room: 437 });
    assert.equal(nameplateLeft({ rootW: 1280, plateW: 300, left: 300, right: 700 }).x, 392);
    assert.deepEqual(mailText(2), { sub: '2 unread', label: 'Mail, 2 unread' });
    assert.deepEqual(mailText(0), { sub: 'No new mail', label: 'Mail' });
    assert.equal(volumeLevel('35'), 35);
    assert.equal(volumeLevel(140), 100);
    assert.equal(volumeLevel('x'), 100);
  });

  it('Effects and Music names turn their channel off, then back to the level it had (Austin 2026-11-02)', () => {
    // On: off, remembering the level.
    assert.deepEqual(soundChannelToggle(65, undefined), { level: 0, restore: 65 });
    // Off: back to what it had.
    assert.deepEqual(soundChannelToggle(0, 65), { level: 65, restore: 65 });
    // Off with nothing remembered (or a remembered 0): full.
    assert.deepEqual(soundChannelToggle(0, undefined), { level: 100, restore: 100 });
    assert.deepEqual(soundChannelToggle(0, 0), { level: 100, restore: 100 });
    // A slider moved after the toggle wins: the next click remembers the new level.
    assert.deepEqual(soundChannelToggle(30, 65), { level: 0, restore: 30 });
    const html = readFileSync(join(pub, 'play/index.html'), 'utf8');
    for (const [kind, word, input] of [['effects', 'Effects', 'sfx-volume'], ['music', 'Music', 'music-volume']]) {
      assert.match(html, new RegExp(`<label class="hud-slider"><button type="button" class="hud-slider-name" data-sound-toggle="${kind}" aria-pressed="false" title="Turn ${kind} off">${word}</button><input id="${input}"`));
    }
    const topbar = readFileSync(join(pub, 'js/ui/topbar.js'), 'utf8');
    assert.match(topbar, /\[data-sound-toggle="\$\{kind\}"\]`\)\?\.addEventListener\('click'/);
  });

  it('the Menu holds what it held, regrouped into Me, World, Social and Settings', () => {
    assert.deepEqual(MENU_GROUPS.map((g) => g.label), ['Me', 'World', 'Social', 'Settings']);
    // Every row the page or a feature puts in #more-list has a group.
    const rows = header.slice(header.indexOf('<div id="more-list"'), header.indexOf('<div id="sound-pop"'));
    for (const id of [...rows.matchAll(/<button id="([\w-]+)"/g)].map((m) => m[1])) assert.ok(MENU_ROWS[id], `${id} has a group`);
    for (const f of ['auctions', 'buddies', 'groups', 'neighbours-mp', 'snaps', 'trade', 'account-backup']) {
      const src = read(`js/features/${f}-feature.js`);
      for (const m of src.matchAll(/el\('button', \{ id: '([\w-]+)'/g)) {
        if (/getElementById\('more-list'\)|getElementById\?\.\('more-list'\)/.test(src)) assert.ok(MENU_ROWS[m[1]] || m[1] === 'bug-btn', `${f}: ${m[1]}`);
      }
    }
    assert.equal(menuRowFor('buddies-btn').group, 'social');
    assert.equal(menuRowFor('signout-btn').group, 'settings');
    assert.equal(menuRowFor('something-new').group, 'world');
    assert.deepEqual([MENU_ROWS['keys-btn'].mod, MENU_ROWS['keys-btn'].key], ['Shift', 'K']);
    // Upgrades (img-btn) opens the imagination panel at its first view; its cap is U (the upgrade cards).
    // X is the Imagination hub (HUB, js/ui/imagination-hub.js), whose Upgrades tile is this row.
    assert.equal(MENU_ROWS['img-btn'].key, 'U');
    assert.match(header, /id="imagination-btn"[^>]*data-key="X"[^>]*aria-label="Imagination \(X\)"/);
  });
});

describe('top bar markup and wiring', () => {
  it('three pills: stats, the nameplate between them, actions; the old ids move with their elements', () => {
    for (const id of ['hud-stats', 'player-menu-btn', 'level-meter', 'stat-level', 'stat-xp', 'bar-level', 'bar-energy', 'stat-energy', 'bar-mood', 'stat-mood', 'stat-img', 'stat-currants', 'favor-stat', 'quoin-stat', 'low-energy-btn',
      'quest-btn', 'make-btn', 'map-btn', 'imagination-btn', 'mail-btn', 'mail-unread-badge', 'sound-btn', 'more-btn', 'more-list', 'sound-pop', 'mute-btn', 'sfx-volume', 'music-volume', 'study-chip']) {
      assert.ok(header.includes(`id="${id}"`), id);
    }
    assert.ok(html.indexOf('id="street-nameplate"') > html.indexOf('<div id="game-root">'), 'the nameplate stays in #game-root (notify zones and the Qurazy banner read it)');
    // Key caps and tooltips as in the mock; N for Make.
    for (const [id, key] of [['quest-btn', 'Q'], ['make-btn', 'N'], ['map-btn', 'M'], ['imagination-btn', 'X']]) {
      assert.match(header, new RegExp(`id="${id}"[^>]*data-tip="[^"]+"[^>]*data-key="${key}"[^>]*aria-label="[^"]*\\(${key}`), id);
      assert.match(header, new RegExp(`id="${id}"[\\s\\S]*?<span class="kcap" aria-hidden="true">${key}</span></button>`), `${id} cap`);
    }
    assert.match(header, /id="sound-btn"[^>]*aria-haspopup="dialog" aria-expanded="false" aria-controls="sound-pop"/);
    assert.match(header, /<div id="sound-pop" class="hud-pop sound-pop" role="dialog" aria-label="Sound" hidden>/);
    assert.match(header, /data-menu-group="me"[\s\S]*data-menu-group="world"[\s\S]*data-menu-group="social"[^>]*hidden[\s\S]*data-menu-group="settings"/);
  });

  it('N opens and closes Make; C never does (bug report #8: C opened Make where Camera Mode could not start)', () => {
    assert.match(game, /if \(isPlainKey\(e, 'n'\)\) openMakePanel\(\);/);
    assert.match(game, /\n      if \(isPlainKey\(e, 'n'\)\) closeMakePanel\(\);/);
    // TSMainView.as cKeyHandler 790-800: C only starts Camera Mode (camera-mode-feature.js).
    assert.doesNotMatch(game, /e\.key === 'c' \|\| e\.key === 'C'\)\s*(open|close)MakePanel/);
    assert.doesNotMatch(game, /e\.key === 'c' \|\| e\.key === 'C' \|\| isPlainKey\(e, 'n'\)/);
    assert.match(read('js/client-hotkeys.js'), /\['Make', \[\['N'\]\]\]/);
    assert.match(read('js/client-hotkeys.js'), /\['Camera Mode', \[\['C'\]\]\]/);
  });

  it('Sound: the sliders scale the effects and music buses and are remembered; Mute is the game\'s own', () => {
    // MUTE (2026-11-01): the sliders and Mute set the buses (js/audio-buses.js, tests/audio-buses.test.js).
    assert.match(game, /const audioSettings = \(\) => \(\{ muted: state\.muted, music: musicLevel\(\), effects: sfxLevel\(\) \}\);/);
    assert.match(game, /audio\.buses\.set\(audioSettings\(\)\);/);
    assert.match(game, /blockPause \? MUSICBLOCK_PLAYBACK\.streetMusicLevel : audio\.musicblock \? 0\.055 : STREET_MUSIC_MIX;/);
    assert.match(game, /saveAudioLevel\(kind, audioLevels\[kind\]\);\n\s*applyMute\(\);/);
    assert.match(game, /audio: \{ levels: \(\) => \(\{ \.\.\.audioLevels \}\), setLevel: setAudioLevel \}/);
    assert.match(game, /document\.getElementById\('sound-btn'\)\?\.setAttribute\('data-muted', String\(state\.muted\)\);/);
  });

  it('wires Imagination, Mail and the Player card to what the game already opens', () => {
    assert.match(game, /onImagination: \(\) => \(modernUi\(\) && imaginationHub \? imaginationHub\.toggle\(\) : document\.getElementById\('img-btn'\)\?\.click\(\)\),/);
    assert.match(game, /onMail: \(\) => \{ if \(state\.started\) openMailboxPanel\(\); \},/);
    assert.match(game, /onPlayerCard: \(\) => document\.getElementById\('player-menu-btn'\)\?\.click\(\),/);
    assert.match(game, /renderTopBar\(document, \{ unread, parcels \}\);/);
    assert.match(game, /icon: `assets\/sprites\/giant-icons\/icon_\$\{favorGiant\.id === 'ti' \? 'tii' : favorGiant\.id\}\.webp`/);
  });

  it('every ring number sits centred in its ring; three digits take the smaller size', () => {
    const css = read('style.css');
    // The old bar's grid columns (.meta-pill, .level-meter) must not place the number off centre.
    assert.match(css, /\[data-ui="modern"\] \.top-bar \.ring,\n\[data-ui="modern"\] \.top-bar \.ring \.level-meter \{ grid-template: none \/ none; gap: 0; \}/);
    assert.match(css, /\.ring-num\[data-digits="3"\],\n\[data-ui="modern"\] \.top-bar \.ring-num\[data-digits="4"\] \{ font-size: var\(--fs-2xs\);/);
    assert.match(topbar, /drawNum\(pill\.querySelector\('\.ring-num'\), r\.num\);/);
    assert.match(topbar, /drawNum\(ring\.querySelector\('\.ring-num'\), r\.num\);/);
  });

  it('keeps a focused control\'s Enter and Space from the game, and no em dashes in what players read', () => {
    assert.match(topbar, /if \(\(e\.key === 'Enter' \|\| e\.key === ' '\) && e\.target\.closest\?\.\('button, \[role="button"\], input'\)\) e\.stopPropagation\(\);/);
    assert.doesNotMatch(topbar.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''), /—/);
    assert.doesNotMatch(header.replace(/<!--[\s\S]*?-->/g, ''), /—/);
  });
});

describe('a narrow window: the actions pill gives way instead of running off the edge', () => {
  const css = read('style.css');
  it('takes the fewest steps, in order: the study pill shortens, then Map, Make and Quests go to the Menu', () => {
    assert.deepEqual([...TOP_OVERFLOW_STEPS], ['chip', 'map', 'make', 'quest']);
    // 390 px: the pill holds 170; the bar's parts measured there (Menu, pill, Quests, Make, Map, Sound).
    const widths = { base: 36 + 36 + 36 + 12, chip: 100, chipShort: 30, map: 36, make: 36, quest: 36 };
    const need = (steps) => widths.base + (steps.includes('chip') ? widths.chipShort : widths.chip)
      + ['map', 'make'].filter((k) => !steps.includes(k)).reduce((n, k) => n + widths[k], 0);
    assert.deepEqual(pickTopOverflow((steps) => need(steps) <= 170), ['chip', 'map', 'make']);
    assert.deepEqual(pickTopOverflow((steps) => need(steps) <= 400), []);
    assert.deepEqual(pickTopOverflow((steps) => need(steps) <= 200), ['chip', 'map']);
    assert.deepEqual(pickTopOverflow(() => false), ['chip', 'map', 'make', 'quest']);
  });
  it('the moved buttons get Menu rows with their keys, and the bar hides them in Modern only', () => {
    for (const [id, key] of [['menu-quest-btn', 'Q'], ['menu-make-btn', 'N'], ['menu-map-btn', 'M']]) {
      assert.equal(MENU_ROWS[id].group, 'world');
      assert.equal(MENU_ROWS[id].key, key);
    }
    assert.match(css, /\[data-ui="modern"\] \.top-bar\[data-overflow~="map"\] #map-btn,/);
    assert.match(css, /\[data-ui="modern"\] \.top-bar\[data-overflow~="chip"\] #study-chip \.study-chip-short \{ display: inline; \}/);
    assert.match(css, /#study-chip \.study-chip-short \{ display: none; \}/);
    // Classic lays its own bar out: the fit clears itself there.
    assert.match(topbar, /if \(doc\.documentElement\.dataset\.ui !== 'modern'\) return apply\(\[\]\);/);
    assert.match(topbar, /installTopOverflow\(doc\);/);
  });
  it('the study pill carries its short form: the count when idle, the time when learning', () => {
    assert.match(game, /function paintStudyChip\(chip, classTsid, name, remaining, short = remaining\)/);
    assert.match(game, /paintStudyChip\(chip, '', 'Skills', `\$\{n\} available`, String\(n\)\);/);
    assert.match(game, /<span class="study-chip-short"><\/span>/);
  });
  it('the street map steps under the nameplate in a narrow window', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 760px) {\n  [data-ui="modern"] .top-bar .hud-cur.currants'));
    assert.match(narrow.slice(0, 1200), /\[data-ui="modern"\] \.street-minimap \{ top: calc\(2 \* var\(--hud-h\) \+ var\(--space-4\)\); \}/);
  });
});

describe('the favor panel (report #170): all eleven Giants from the favor display', () => {
  it('lists every Giant with favor against the next emblem, and marks the ready ones', () => {
    const state = createShrineState({ favor: { alph: 250, lem: 1100, zille: 1000, ti: 3 }, emblems: { lem: 1 } });
    const rows = favorPanelRows(state, 'ti');
    assert.equal(rows.length, 11);
    assert.deepEqual(rows.map((r) => r.id), Object.keys(GIANTS));
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.deepEqual([by.alph.points, by.alph.target, by.alph.share, by.alph.ready], [250, 1000, 0.25, false]);
    // A second emblem costs 100 more (emblemCostFor): 1,100 of 1,100 is ready.
    assert.deepEqual([by.lem.target, by.lem.ready, by.lem.share], [1100, true, 1]);
    assert.equal(by.zille.ready, true);
    assert.equal(by.cosma.points, 0);
    assert.equal(by.cosma.ready, false);
    assert.deepEqual(rows.filter((r) => r.here).map((r) => r.id), ['ti']);
    assert.equal(by.ti.icon, 'assets/sprites/giant-icons/icon_tii.webp');
    for (const r of rows) {
      assert.equal(r.target, emblemCostFor(state, r.id));
      assert.equal(r.ready, canClaimEmblem(state, r.id));
      assert.ok(readFileSync(join(pub, r.icon)).length > 0, `${r.icon} ships`);
    }
    assert.equal(favorPanelRows(state).some((r) => r.here), false);
  });

  it('reads the state and never changes it', () => {
    const state = createShrineState({ favor: { pot: 1000 } });
    const before = JSON.stringify(state);
    favorPanelRows(state, 'pot');
    assert.equal(JSON.stringify(state), before);
  });

  it('says each row in words: the count, or Emblem ready', () => {
    assert.deepEqual(favorRowText({ name: 'Alph', points: 250, target: 1000, ready: false, here: false }),
      { count: '250 / 1,000', mark: '', label: 'Alph: 250 of 1,000 favor' });
    const t = favorRowText({ name: 'Lem', points: 1100, target: 1100, ready: true, here: true });
    assert.equal(t.mark, 'Emblem ready');
    assert.equal(t.label, 'Lem: 1,100 of 1,100 favor. Emblem ready. The Giant of this street');
  });

  it('opens from the favor display by click, Enter or Space; Esc and a second click close it', () => {
    const at = topbar.indexOf('function installFavor(');
    const body = topbar.slice(at, topbar.indexOf('\n}\n', at));
    assert.match(body, /pop\.id = 'favor-pop';/);
    assert.match(body, /chip\.setAttribute\('role', 'button'\)/);
    assert.match(body, /popover\(doc, chip, pop, \{ onOpen: draw, clear: true \}\)/);
    assert.match(body, /e\.key !== 'Enter' && e\.key !== ' '/);
    // No button inside: the panel only shows, so the keys stay on the display and Esc returns there.
    assert.doesNotMatch(body, /<button/);
    assert.match(topbar, /favorPanel = installFavor\(doc, opts\.favor\);/);
    assert.match(topbar, /favorPanel\?\.sync\(\);/);
    assert.match(game, /favor: \{ rows: \(\) => favorPanelRows\(shrineState, favorGiantHere\(\)\?\.id \|\| null\) \},/);
    // The display still shows the street's Giant (favorChip), and the tooltip hides while the panel is open.
    assert.match(game, /favor: favorGiant \? \{\n\s+name: favorGiant\.name,/);
    assert.match(read('style.css'), /\[data-ui="modern"\] \.favor-pop \{ width: 300px;/);
  });
});
describe('the favor display shows whenever any Giant has favor (report #170, G631)', () => {
  const topbar = read('js/ui/topbar.js');
  const game = read('game.js');

  it('hides only when no Giant has any favor', () => {
    assert.equal(favorChip({ name: 'Spriggan', points: 0, target: 1000, any: false }), null);
    assert.equal(favorChip({ name: '', any: false }), null);
    assert.equal(favorChip(null), null);
  });

  it("the street's Giant shows with its favor, 0 included, when another Giant has some", () => {
    const zero = favorChip({ name: 'Spriggan', points: 0, target: 1000, any: true });
    assert.deepEqual([zero.num, zero.neutral, zero.tip, zero.sub], ['0', false, 'Favor with Spriggan', '0 of 1,000 for an emblem']);
    assert.equal(zero.label, 'Favor with Spriggan: 0 of 1,000');
    const some = favorChip({ name: 'Lem', points: 37, target: 1100, any: true });
    assert.deepEqual([some.num, some.tip, some.sub, some.label], ['37', 'Favor with Lem', '37 of 1,100 for an emblem', 'Favor with Lem: 37 of 1,100']);
  });

  it('with no Giant on the street: the favor star alone, no number, and words that say so', () => {
    const none = favorChip({ name: '', any: true });
    assert.deepEqual([none.num, none.neutral, none.tip, none.sub], ['', true, 'Favor with the Giants', 'No Giant has a shrine here']);
    assert.equal(none.label, 'Favor with the Giants. No Giant has a shrine here');
    assert.equal(FAVOR_NEUTRAL_ICON, 'assets/classic/slug_favor_pos.webp');
    assert.ok(existsSync(join(pub, FAVOR_NEUTRAL_ICON)), 'Tiny Speck\'s favor star ships');
    assert.match(topbar, /if \(f\.neutral\) setAttr\(chip, 'data-neutral', ''\);/);
    assert.match(topbar, /const icon = f\.neutral \? FAVOR_NEUTRAL_ICON : state\.favor\.icon;/);
    const css = read('style.css');
    assert.match(css, /\[data-ui="modern"\] \.top-bar #favor-stat\[data-neutral\] strong \{ display: none; \}/);
  });

  it('the game says whether any Giant has favor, with or without a Giant here', () => {
    assert.match(game, /const favorAny = Object\.values\(shrineState\.favor \|\| \{\}\)\.some\(\(points\) => Number\(points\) > 0\);/);
    assert.match(game, /any: favorAny,\n\s+\} : \{ name: '', any: favorAny \},/);
  });

  it("the Giant it reads is the one whose shrine stands on the street; a place with no shrine has none at 0", () => {
    const forest = { tsid: 'GLI1018LOKA18M6', hubName: 'Groddle Forest', officialGiantId: 'friendly' };
    const noShrine = { tsid: 'GCR10K3BPJK1U6F', hubId: '64', hubName: 'Groddle Meadow' };
    const region = giantForStreet(noShrine).id;
    const none = createShrineState();
    const other = createShrineState({ favor: { [region === 'mab' ? 'lem' : 'mab']: 40 } });
    // A shrine's Giant shows with no favor too (the display itself still hides until some Giant has favor).
    assert.equal(favorDisplayGiant(none, forest).id, 'friendly');
    assert.equal(favorDisplayGiant(other, forest).id, 'friendly');
    // No shrine: no Giant at 0, so the favor star alone; the region's Giant while you have favor with it, as before.
    assert.equal(favorDisplayGiant(other, noShrine), null);
    assert.equal(favorDisplayGiant(createShrineState({ favor: { [region]: 12 } }), noShrine).id, region);
    // A home or a room is a place with no shrine; before a street loads there is none either.
    assert.equal(favorDisplayGiant(other, { tsid: 'HOME_1', hubName: 'Homes' }), null);
    assert.equal(favorDisplayGiant(other, null), null);
    // A shrine standing there without an archived row (the starter fallback, a QA shrine) counts.
    assert.equal(favorDisplayGiant(other, noShrine, { shrineHere: true }).id, region);
    // The game asks it for the display and for the panel's "here" row.
    assert.match(game, /const favorGiant = favorGiantHere\(\);/);
    assert.match(game, /function favorGiantHere\(\) \{\n\s+return favorDisplayGiant\(shrineState, currentStreet, \{\n\s+shrineHere: interactables\.some\(\(target\) => String\(target\?\.classId \|\| ''\)\.startsWith\('npc_shrine_'\)\),/);
    assert.match(game, /favor: \{ rows: \(\) => favorPanelRows\(shrineState, favorGiantHere\(\)\?\.id \|\| null\) \},/);
  });

  it('still hidden under 1,100 px wide and in Classic', () => {
    const css = read('style.css');
    assert.match(css, /@media \(max-width: 1100px\) \{[^}]*\}\s*\[data-ui="modern"\] \.top-bar \.hud-favor,\s*\[data-ui="modern"\] \.top-bar \.quoin-stat \{ display: none; \}/);
    assert.match(read('css/classic.css'), /:root\[data-ui="classic"\] \.top-bar #favor-stat,/);
  });
});


describe('the favor panel opens clear of an open side sheet and the Social drawer', () => {
  const topbar = read('js/ui/topbar.js');
  // 1280 wide, a 300 px panel, the favor display centred at x 295: alone it sits at 145 to 445.
  const base = { center: 295, w: 300, lo: 4, hi: 1280 - 300 - 4 };

  it('alone, it centres under the display, inside the bar', () => {
    assert.equal(popoverLeft(base), 145);
    assert.equal(popoverLeft({ ...base, center: 20 }), 4);
    assert.equal(popoverLeft({ ...base, center: 1270 }), 976);
  });

  it('with a sheet open on the left it starts where the sheet ends', () => {
    // Make at 1280: the sheet and its gap cover everything left of x 368.
    assert.equal(popoverLeft({ ...base, clearL: 368 }), 368);
    // A display already right of the sheet keeps its place.
    assert.equal(popoverLeft({ ...base, center: 700, clearL: 368 }), 550);
  });

  it('with the Social drawer open on the right it ends where the drawer begins', () => {
    assert.equal(popoverLeft({ ...base, center: 1000, clearR: 964 }), 664);
    assert.equal(popoverLeft({ ...base, clearL: 368, clearR: 964 }), 368);
  });

  it('with no room for both it stays clear of the sheet, and never leaves the bar', () => {
    assert.equal(popoverLeft({ ...base, clearL: 600, clearR: 800 }), 600);
    assert.equal(popoverLeft({ ...base, clearL: 1200, clearR: 1250 }), 976);
  });

  it('reads the insets the sheets and the drawer already publish, and follows them while open', () => {
    assert.match(topbar, /const l = px\('--inset-l'\);\n\s+const r = px\('--inset-r'\);/);
    assert.match(topbar, /doc\.getElementById\('game-root'\)/);
    assert.match(topbar, /else \{\n\s+draw\(\);[^}]*p\.place\(\);\n\s+\}/);
    // Esc closes the panel first: the popover's own key handler stops the key before the sheet's.
    assert.match(topbar, /if \(e\.key !== 'Escape' \|\| !isOpen\(\)\) return;\n\s+e\.stopPropagation\(\);\n\s+close\(true\);/);
    // The bar still lifts over the drawer while the panel is open (a token, no raw layer number).
    assert.match(read('style.css'), /#favor-pop:not\(\[hidden\]\)\) \{\n\s+z-index: var\(--z-hud-pop\);/);
  });
});
