/**
 * G221 (desk KEYS): the keyboard follows the original client where nothing
 * clashes. TSMainView.as 641-667 registers U (upgrade cards, uKeyHandler
 * 996-1010), Shift+S (skills, 893-913), Shift+C (cultivation, 816-830) and
 * Shift+T (the Teleport tab, 915-923; MapChatArea.as 330-347). Buffs moved
 * from U to Y. G186 (desk HUBLESS) rides along: instance copies show the
 * street name alone (location.js 3311).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { teleportationFeature } from '../public/js/features/teleportation-feature.js?v=g463-1';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');

function keyBlock(game) {
  const start = game.indexOf("window.addEventListener('keydown', (e) => {\n    if (e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]')) {");
  assert.ok(start > 0, 'main keydown handler');
  return game.slice(start, game.indexOf("window.addEventListener('keyup'", start));
}

describe('G221 client hotkeys', () => {
  it('U opens the upgrade cards, plain only and once per press', () => {
    const img = read('js/features/imagination-feature.js');
    assert.match(img, /\(e\.key === 'u' \|\| e\.key === 'U'\) && !e\.shiftKey && !e\.metaKey && !e\.ctrlKey && !e\.altKey && !e\.repeat/);
    assert.match(img, /openPanel\(\{ view: 'hand' \}\)/);
    assert.match(img, /title: 'Imagination upgrades \(U or X\)'/);
  });

  it('game.js: Buffs on Y, Shift+S skills, Shift+T teleport points ahead of T and the movement keys', () => {
    const keys = keyBlock(read('game.js'));
    assert.doesNotMatch(keys, /e\.key === 'u'/, 'nothing in game.js answers U');
    assert.match(keys, /if \(e\.key === 'y' \|\| e\.key === 'Y'\) openBuffsPanel\(\);/);
    assert.match(keys, /if \(e\.key === 'y' \|\| e\.key === 'Y'\) closeBuffsPanel\(\);/);
    const shiftS = keys.indexOf("if (e.shiftKey && (e.key === 's' || e.key === 'S')) {");
    const shiftT = keys.indexOf("if (e.shiftKey && (e.key === 't' || e.key === 'T')) {");
    const plainT = keys.indexOf("if (e.key === 't' || e.key === 'T') doTeleport();");
    assert.ok(shiftS > 0 && shiftT > shiftS && plainT > shiftT, 'Shift+T is read before plain T');
    assert.match(keys.slice(shiftS, shiftT), /keys\.delete\(e\.key\);\s+if \(!e\.repeat\) openSkillsPanel\(\);\s+return;/);
    assert.match(keys.slice(shiftT, plainT), /features\.query\('teleportPointsKey', engine\)/);
    // G226/G231 Shift+C stays with homes-feature cultivateKey; Camera Mode keeps plain C.
    assert.match(keys, /e\.shiftKey && \(e\.key === 'c' \|\| e\.key === 'C'\) && features\.query\('cultivateKey', engine\)/);
    assert.match(read('js/features/camera-mode-feature.js'), /k === 'c' && !e\.metaKey && !e\.ctrlKey && !e\.altKey && !e\.shiftKey/);
  });

  it('a letter let go after Shift does not stay held', () => {
    const game = read('game.js');
    assert.match(game, /window\.addEventListener\('keyup', \(e\) => \{\s+keys\.delete\(e\.key\);\s+if \(e\.key\?\.length === 1\) \{\s+keys\.delete\(e\.key\.toLowerCase\(\)\);\s+keys\.delete\(e\.key\.toUpperCase\(\)\);/);
  });

  it('Shift+T: the Map on the Teleportation card with the skill, else the Teleportation I skill', async () => {
    const calls = [];
    const data = {};
    const engine = {
      learnedSkills: [],
      setData: (k, v) => { data[k] = v; },
      openSkillTree: (id) => calls.push(['skill', id]),
      openMap: () => { calls.push(['map']); return Promise.resolve(); },
    };
    assert.equal(teleportationFeature.teleportPointsKey(engine), true);
    assert.deepEqual(calls, [['skill', 'teleportation_1']]);
    assert.equal(data.teleportKey, 'skill');
    engine.learnedSkills = ['teleportation_1'];
    assert.equal(teleportationFeature.teleportPointsKey(engine), true);
    await Promise.resolve();
    assert.deepEqual(calls.at(-1), ['map']);
    assert.equal(data.teleportKey, 'points');
  });

  it('the welcome card and chrome titles name the new keys', () => {
    const html = read('play/index.html');
    assert.match(html, /title="Buffs \(Y\)">Buffs</);
    assert.match(html, /title="Skills \(K or Shift\+S\)">Skills</);
    assert.match(html, /<kbd>U<\/kbd> upgrades ·/);
    assert.match(html, /<kbd>Y<\/kbd> buffs ·/);
    assert.match(html, /<kbd>C<\/kbd> camera ·/);
    assert.match(html, /<kbd>Shift<\/kbd>\+<kbd>T<\/kbd> teleport points ·/);
    assert.doesNotMatch(html, /<kbd>U<\/kbd> buffs|<kbd>C<\/kbd> make|Buffs \(U\)|Making \(C\)/);
  });
});

describe('G186 hubless instance copies', () => {
  it('the 21 copies have no hub in the index, and the location label has no Groddle Forest fallback', () => {
    const index = JSON.parse(read('assets/streets/index.json'));
    const hubless = Object.entries(index.streets).filter(([, row]) => !row.hubId && !row.hubName);
    assert.equal(hubless.length, 21);
    assert.ok(hubless.some(([tsid]) => tsid === 'GNVV9IM8PL4301V'), "A Summer's Day");
    const game = read('game.js');
    assert.match(game, /: currentStreet\.hubName \|\| ''\);\s+streetEl\.textContent = hubLabel \? `\$\{streetLabel\} · \$\{hubLabel\}` : streetLabel;/);
    assert.doesNotMatch(game, /currentStreet\.hubName \|\| 'Groddle Forest'\)/);
  });
});
