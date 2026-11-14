/**
 * tools/site-nav/add-maps-link.mjs: the release step that puts Maps after Known gaps under Restoration in
 * the header menu (Austin 2026-11-14). It must change only that block, be safe to run twice, and refuse a
 * menu of any other shape.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAPS, addMapsLink } from '../tools/site-nav/add-maps-link.mjs';
import { parseMenu } from '../tools/site-nav/apply.mjs';
import { GAME_DIR } from '../tools/repos.mjs';

describe('Maps in the header menu (tools/site-nav/add-maps-link.mjs)', () => {
  const NESTED = readFileSync(join(GAME_DIR, 'tests/fixtures/site-nav/nested.html'), 'utf8');
  const GROUPED = readFileSync(join(GAME_DIR, 'tests/fixtures/site-nav/grouped.html'), 'utf8');

  it('adds Maps after Known gaps under Restoration, every other byte kept, and is idempotent', () => {
    const out = addMapsLink(NESTED);
    assert.equal(out.changed, true);
    const gaps = '<!-- wp:navigation-link {"label":"Known gaps","url":"/restoration/gaps/","kind":"custom"} /-->';
    assert.equal(out.markup, NESTED.replace(gaps, `${gaps}\n\n<!-- wp:navigation-link {"label":"Maps","url":"/restoration/maps/","kind":"custom"} /-->`));
    assert.deepEqual(parseMenu(out.markup)[3].children[0].children.map((l) => l.href), ['/restoration/history/', '/restoration/gaps/', MAPS.url]);
    const again = addMapsLink(out.markup);
    assert.equal(again.changed, false);
    assert.equal(again.markup, out.markup);
  });

  it('refuses a menu of any other shape', () => {
    assert.throws(() => addMapsLink(GROUPED), /add-gaps-link/);
    assert.throws(() => addMapsLink(''), /one top-level Project submenu/);
    assert.throws(() => addMapsLink(NESTED.replace('<!-- wp:navigation-link {"label":"Compare"', '<!-- wp:navigation-link {"label":"Maps","url":"/restoration/maps/","kind":"custom"} /-->\n\n<!-- wp:navigation-link {"label":"Compare"')), /somewhere else/);
  });
});
