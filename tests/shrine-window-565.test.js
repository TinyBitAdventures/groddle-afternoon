/**
 * #565 (G1080, items 2, 3 and 5): the Shrine window's favor row shows an earned emblem as the Emblem's
 * own icon (emblem_<giant>), a mouse wheel scrolls the row sideways, and the header links the Giant's
 * Encyclopedia page. Item 4 (Learn Faster? unfolded or not) is tests/shrine-learn-fold.test.js.
 * Run: node --test tests/shrine-window-565.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIANTS } from '../public/js/shrines.js?v=f5eb7690';
import { buildEncyclopediaIndex, encyclopediaPage } from '../public/js/encyclopedia-links.js?v=0c3b2863';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
const css = readFileSync(join(PUBLIC, 'style.css'), 'utf8');
const render = game.slice(game.indexOf('function renderShrinePanel('), game.indexOf('function renderShrineLearnFaster('));

describe('#565 the Shrine window', () => {
  it('an earned emblem is the Emblem icon, not a ◉', () => {
    assert.doesNotMatch(render, /◉/);
    assert.match(render, /<img class="shrine-chip-emblem" src="\$\{escapeHtml\(itemIconUrl\(`emblem_\$\{row\.id\}`\)\)\}"/);
    assert.match(css, /\.shrine-chip-emblem \{[^}]*width: 16px;/);
    // itemIconUrl's fallback, the pack icon of every Giant's emblem (Tii's is emblem_ti).
    for (const id of Object.keys(GIANTS)) assert.ok(existsSync(join(PUBLIC, `assets/sprites/icons/emblem_${id}.webp`)), id);
  });

  it('a mouse wheel scrolls the favor row sideways, bound once', () => {
    assert.match(render, /if \(!allFavor\.dataset\.wheel\) \{\n\s+allFavor\.dataset\.wheel = '1';\n\s+allFavor\.addEventListener\('wheel', \(e\) => \{/);
    assert.match(render, /allFavor\.scrollLeft \+= e\.deltaMode === 1 \? e\.deltaY \* 16 : e\.deltaY;\n\s+e\.preventDefault\(\);\n\s+\}, \{ passive: false \}\);/);
    assert.match(render, /Math\.abs\(e\.deltaY\) <= Math\.abs\(e\.deltaX\) \|\| allFavor\.scrollWidth <= allFavor\.clientWidth\) return;/);
  });

  it('the header links the Giant\'s Encyclopedia page, every Giant has one', () => {
    assert.match(render, /encyclopedia\.link\(document, \{ section: 'giants', id: giantId \}, 'shrine-ency'\)/);
    assert.match(game, /if \(isShrineOpen\(\)\) renderShrinePanel\(\);\n  \},/, 'drawn again once the index is in');
    const index = buildEncyclopediaIndex(JSON.parse(readFileSync(join(PUBLIC, 'encyclopedia/search.json'), 'utf8')));
    for (const id of Object.keys(GIANTS)) assert.equal(encyclopediaPage(index, { section: 'giants', id }), `encyclopedia/giants/${id}/`);
  });
});
