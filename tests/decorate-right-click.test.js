/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit item 6): in Decorate and Cultivate a right-click
 * on the room already selects the piece and floats its actions (homes-feature's press takes any
 * button, only the main one drags). The browser's menu no longer opens on top of them: the room's
 * contextmenu is stopped while an edit mode is on, the floating actions and Place are [data-ctx]
 * (js/ui/context-guard.js), and the world's own right-click menu stands down (game.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pub = join(import.meta.dirname, '../public');
const homes = readFileSync(join(pub, 'js/features/homes-feature.js'), 'utf8');
const builder = readFileSync(join(pub, 'js/ui/home-builder.js'), 'utf8');
const game = readFileSync(join(pub, 'game.js'), 'utf8');

describe('Decorate and Cultivate: no browser menu over the room', () => {
  const bind = homes.slice(homes.indexOf('\nfunction bindPointer('), homes.indexOf('\n}\n', homes.indexOf('\nfunction bindPointer(')));

  it('the room\'s contextmenu is stopped while an edit mode is on, and says what is selected', () => {
    assert.match(bind, /root\.addEventListener\('contextmenu', \(e\) => \{\n\s+if \(!mode \|\| !scene \|\| !isCanvas\(e\)\) return;\n\s+e\.preventDefault\(\);\n\s+engine\.setData\('contextMenu', selected \? `home:\$\{selected\.kind\}:\$\{selected\.id\}` : ''\);/);
  });

  it('a right press still selects (any button) and only the main button drags', () => {
    const press = bind.slice(bind.indexOf("root.addEventListener('pointerdown'"));
    assert.match(press, /selectStack\(engine, stack\.id\);\n\s+if \(e\.button === 0\) \{/);
    assert.match(press, /selected = item \? \{ kind: 'furniture', id: item\.id \} : null;[\s\S]*?if \(item && e\.button === 0\) \{/);
    assert.match(press, /selectFixture\(engine, fixtureAt\(engine, p\)\)\) \{[\s\S]*?if \(e\.button === 0\) \{/);
  });

  it('the floating actions and Place over the room are [data-ctx]', () => {
    assert.match(builder, /const pop = el\(doc, 'div', \{ class: 'hb-pop', id: 'homes-pop', role: 'toolbar', hidden: true, 'data-ctx': 'home-edit' \}\);/);
    assert.match(builder, /const place = el\(doc, 'button', \{ type: 'button', class: 'hb-place', id: 'homes-place', hidden: true, 'data-ctx': 'home-edit' \}\);/);
  });

  it('the world\'s right-click menu stands down in an edit mode', () => {
    assert.match(game, /features\.query\('homeEditMode', engine\) \? 'decorating'/);
  });
});
