import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pub = join(import.meta.dirname, '..', 'public');
const html = readFileSync(join(pub, 'play/index.html'), 'utf8');
const game = readFileSync(join(pub, 'game.js'), 'utf8');

describe('player menu (PlayerInfoUI toggleMenu)', () => {
  it('opens from your name and from the level pill', () => {
    // Phase 2: the modern bar's level ring is the button (Z), and the Menu's Player card row opens it.
    assert.match(html, /<button id="player-menu-btn" type="button" class="ring level-ring" data-stat="level" aria-haspopup="true" aria-expanded="false" aria-controls="player-menu"/);
    assert.match(html, /<button id="player-card-btn" type="button" class="chrome-btn">Player card<\/button>/);
    assert.match(html, /<div id="player-menu" class="player-menu" role="dialog" aria-label="Player menu" hidden><\/div>/);
    assert.match(game, /btn\.addEventListener\('click', toggle\);\n[^\n]*\n\s*if \(meter && !btn\.contains\(meter\)\) meter\.addEventListener\('click', toggle\);/);
    assert.match(game, /installMoreMenu\(\);\n\s*installPlayerMenu\(\);/);
  });

  it('shows PlayerStatsUI and the buttons the remake can back', () => {
    for (const bit of ["'Level:'", "’til level ${info.level + 1}", "row('Mood'", "row('Energy'", "row('Currants'"]) {
      assert.ok(game.includes(bit.replace(/^'|'$/g, '')), bit);
    }
    assert.match(game, /\['Skills', \(\) => document\.getElementById\('skills-btn'\)\?\.click\(\)\],\n\s*\['Vanity', \(\) => openLookBuilderOn\('hair'\)\],\n\s*\['Wardrobe', \(\) => openLookBuilderOn\('top'\)\],/);
  });
});
