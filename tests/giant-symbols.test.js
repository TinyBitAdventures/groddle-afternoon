/**
 * #563: each Giant's own symbol, as carved on its shrine (Lem's arrows, Tii's domino), cut from
 * Tiny Speck's vector shrine SWFs (tools/giant-symbols/build.mjs) and shown in the favor panel,
 * on the favor display and in the shrine window's header, in place of the Icon item art and a
 * generic star.
 * Run: node --test tests/giant-symbols.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIANTS, createShrineState, favorPanelRows, giantSymbolUrl } from '../public/js/shrines.js?v=b063e857';
import { CARVING, SHAPE_IDS, carvingSvg } from '../tools/giant-symbols/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('#563: Giant symbols from the shrines', () => {
  it('ships one clean symbol for each of the eleven Giants', () => {
    assert.deepEqual(Object.keys(SHAPE_IDS).sort(), Object.keys(GIANTS).sort());
    assert.equal(new Set(Object.values(SHAPE_IDS)).size, 11, 'eleven different shapes');
    for (const id of Object.keys(GIANTS)) {
      const file = join(PUB, giantSymbolUrl(id));
      assert.ok(existsSync(file), id);
      const svg = readFileSync(file, 'utf8');
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"/, id);
      // The carving alone: one flat path, holes kept (the domino's pips).
      assert.equal((svg.match(/<path /g) || []).length, 1, id);
      assert.match(svg, new RegExp(`fill="${CARVING}" fill-rule="evenodd"`), id);
    }
    assert.equal(giantSymbolUrl('tii'), 'assets/sprites/giant-symbols/ti.svg');
    assert.equal(giantSymbolUrl('Lem'), 'assets/sprites/giant-symbols/lem.svg');
  });

  it('keeps the carving path of an FFDec shape and drops its light edge', () => {
    const ffdec = '<svg height="20.5px" width="10.25px" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1.0, 0.0, 0.0, 1.0, 5.0, 10.25)">'
      + '<path d="M0 0 L1 1" fill="#dccab2" fill-rule="evenodd" stroke="none"/><path d="M-5 -10 L5 10 -5 10" fill="#71675b" fill-rule="evenodd" stroke="none"/></g></svg>';
    assert.equal(carvingSvg(ffdec, 'x'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.25 20.5" width="10.25" height="20.5"><path transform="translate(5 10.25)" d="M-5 -10 L5 10 -5 10" fill="#71675b" fill-rule="evenodd"/></svg>\n');
    assert.throws(() => carvingSvg(ffdec.replace('#71675b', '#000000'), 'x'), /0 carving paths/);
  });

  it('the favor panel, the favor display and the shrine header show the symbol', () => {
    const rows = favorPanelRows(createShrineState());
    for (const r of rows) assert.equal(r.icon, giantSymbolUrl(r.id));
    const game = read('public/game.js');
    assert.match(game, /icon: giantSymbolUrl\(favorGiant\.id\),/);
    assert.match(game, /glyph\.innerHTML = `<img src="\$\{giantSymbolUrl\(giantId\)\}" alt="" width="22" height="22" \/>`;/);
    assert.doesNotMatch(game, /giant-icons\/icon_\$\{favorGiant/);
    for (const page of ['public/play/index.html', 'public/play/online/index.html']) {
      assert.match(read(page), /id="favor-stat"[^>]*><img src="assets\/sprites\/giant-symbols\/spriggan\.svg/, page);
    }
    const css = read('public/style.css');
    assert.match(css, /\.shrine-glyph img \{[^}]*filter: brightness\(0\) invert\(1\);/);
    assert.match(css, /\.favor-row img \{ width: 20px; height: 20px; object-fit: contain;/);
  });
});
