// The modern top bar (phase 2, Warm paper; js/ui/topbar.js): three floating pills, the HUD mock's
// rings, key caps, Menu groups and Sound popover over the game's real values and its existing ids.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MENU_GROUPS,
  MENU_ROWS,
  favorChip,
  levelRing,
  lowEnergyText,
  mailText,
  menuRowFor,
  nameplateLeft,
  ringDash,
  vitalRing,
  volumeLevel,
} from '../public/js/ui/topbar.js?v=g486-1';

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
    assert.match(game, /audio\.sfxGain\.gain\.value = state\.muted \? 0 : sfxLevel\(\);/);
    assert.match(game, /const targetVol = state\.muted \? 0 : 0\.26 \* musicLevel\(\);/);
    assert.match(game, /\(blockPause \? MUSICBLOCK_PLAYBACK\.streetMusicLevel : audio\.musicblock \? 0\.055 : 0\.26\) \* musicLevel\(\);/);
    assert.match(game, /saveAudioLevel\(kind, audioLevels\[kind\]\);\n\s*applyMute\(\);/);
    assert.match(game, /audio: \{ levels: \(\) => \(\{ \.\.\.audioLevels \}\), setLevel: setAudioLevel \}/);
    assert.match(game, /document\.getElementById\('sound-btn'\)\?\.setAttribute\('data-muted', String\(state\.muted\)\);/);
  });

  it('wires Imagination, Mail and the Player card to what the game already opens', () => {
    assert.match(game, /onImagination: \(\) => \(modernUi\(\) && imaginationHub \? imaginationHub\.toggle\(\) : document\.getElementById\('img-btn'\)\?\.click\(\)\),/);
    assert.match(game, /onMail: \(\) => \{ if \(state\.started\) openMailboxPanel\(\); \},/);
    assert.match(game, /onPlayerCard: \(\) => document\.getElementById\('player-menu-btn'\)\?\.click\(\),/);
    assert.match(game, /renderTopBar\(document, \{ unread \}\);/);
    assert.match(game, /icon: `assets\/sprites\/giant-icons\/icon_\$\{favorGiant\.id === 'ti' \? 'tii' : favorGiant\.id\}\.png`/);
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
