/**
 * G1117 (#592): on a slow laptop the loading card sat on "Gathering a little scrap of Ur…" for a long
 * time and never said how far the start had got. It now names each step of the start in plain words
 * with a bar: the game's code (its files counted as they arrive), then each load game.js main()
 * waits for. Both play pages load js/boot-progress.js ahead of game.js.
 * Run: node --test tests/boot-progress.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOOT_STEPS, BOOT_TEXT, bootStep, bootStepText, countsAsCode, startBootProgress } from '../public/js/boot-progress.js?v=f13d90b4';
import { FakeEl } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');

describe('G1117: the loading card says how far the start has got', () => {
  it('plain words, the step and how many, a file count while the code loads', () => {
    assert.equal(bootStepText('code').text, "Loading the game's code · step 1 of 9");
    assert.equal(bootStepText('code', { files: 214 }).text, "Loading the game's code · 214 files · step 1 of 9");
    assert.equal(bootStepText('code', { files: 1 }).text, "Loading the game's code · 1 file · step 1 of 9");
    assert.equal(bootStepText('sounds').text, 'Loading sounds · step 4 of 9');
    assert.equal(bootStepText('sounds', { files: 9 }).text, 'Loading sounds · step 4 of 9');
    assert.equal(bootStepText('look').text, 'Getting your look ready · step 9 of 9');
    assert.equal(bootStepText('nope'), null);
    for (const k of BOOT_STEPS) {
      assert.ok(typeof BOOT_TEXT[k] === 'string', k);
      assert.doesNotMatch(bootStepText(k, { files: 3 }).text, /[–—]/);
    }
  });

  it('counts the game\'s scripts, modules and style sheets, not its pictures or data', () => {
    assert.equal(countsAsCode({ name: 'https://x.test/js/street-jobs.js?v=884e34b3' }), true);
    assert.equal(countsAsCode({ name: 'https://x.test/style.css?v=1' }), true);
    assert.equal(countsAsCode({ name: 'https://x.test/assets/sprites/a.webp' }), false);
    assert.equal(countsAsCode({ name: 'https://x.test/assets/content/street-jobs.json' }), false);
  });

  it('fills the card in as the boot goes: the file count, then each step, never backwards', () => {
    const els = { 'boot-loader': new FakeEl('div'), 'boot-loader-copy': new FakeEl('span'), 'boot-loader-bar': new FakeEl('b') };
    els['boot-loader-bar'].hidden = true;
    els['boot-loader-bar'].style.setProperty = function (k, v) { this[k] = v; };
    const doc = { getElementById: (id) => els[id] || null };
    let seen = null;
    class PO {
      constructor(fn) { seen = fn; }
      observe(o) { assert.deepEqual(o, { type: 'resource', buffered: true }); }
      disconnect() { seen = null; }
    }
    assert.equal(startBootProgress(doc, PO), true);
    assert.equal(els['boot-loader-copy'].textContent, "Loading the game's code · step 1 of 9");
    assert.equal(els['boot-loader-bar'].hidden, false);
    assert.equal(els['boot-loader'].dataset.bootStep, 'code');
    seen({ getEntries: () => [{ name: 'https://x.test/game.js?v=1' }, { name: 'https://x.test/js/a.js?v=2' }, { name: 'https://x.test/a.webp' }] });
    assert.equal(els['boot-loader-copy'].textContent, "Loading the game's code · 2 files · step 1 of 9");
    assert.equal(startBootProgress(doc, PO), false, 'once');
    bootStep('sounds', doc);
    assert.equal(seen, null, 'the count stops once the code is in');
    assert.equal(els['boot-loader-copy'].textContent, 'Loading sounds · step 4 of 9');
    assert.equal(els['boot-loader-bar'].getAttribute('aria-valuenow'), '4');
    assert.equal(els['boot-loader-bar'].style['--boot-progress'], '39%');
    bootStep('screen', doc);
    assert.equal(els['boot-loader'].dataset.bootStep, 'sounds', 'never backwards');
    bootStep('look', doc);
    assert.equal(els['boot-loader-copy'].textContent, 'Getting your look ready · step 9 of 9');
  });

  it('both play pages load it ahead of game.js, with the bar in the card; game.js names each step', () => {
    const solo = read('play/index.html');
    assert.match(solo, /<b id="boot-loader-bar" class="boot-loader-bar" role="progressbar"[^>]* hidden><i><\/i><\/b>/);
    assert.ok(solo.indexOf('src="js/boot-progress.js') > 0 && solo.indexOf('src="js/boot-progress.js') < solo.indexOf('src="game.js'));
    const online = read('play/online/index.html');
    assert.match(online, /<b id="boot-loader-bar"/);
    assert.ok(online.indexOf('src="js/boot-progress.js') > 0 && online.indexOf('src="js/boot-progress.js') < online.indexOf('id="online-boot"'));
    const game = read('game.js');
    const main = game.slice(game.indexOf('async function main()'));
    let at = 0;
    for (const k of BOOT_STEPS.slice(1)) {
      const i = main.indexOf(`bootStep('${k}')`);
      assert.ok(i > at, `bootStep('${k}') in order`);
      at = i;
    }
    assert.match(read('style.css'), /\.boot-loader-card \.boot-loader-bar i \{[^}]*width: var\(--boot-progress, 0%\)/);
  });
});
