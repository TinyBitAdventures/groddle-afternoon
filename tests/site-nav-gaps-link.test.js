/**
 * tools/site-nav/add-gaps-link.mjs: the release step that puts Known gaps under Restoration in the live
 * header menu (Austin 2026-11-12). It must change only those blocks, be safe to run twice, and refuse a
 * menu of any other shape.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addGapsLink } from '../tools/site-nav/add-gaps-link.mjs';
import { parseMenu } from '../tools/site-nav/apply.mjs';

const fixtures = join(import.meta.dirname, 'fixtures/site-nav');
const GROUPED = readFileSync(join(fixtures, 'grouped.html'), 'utf8');
const NESTED = readFileSync(join(fixtures, 'nested.html'), 'utf8');

describe('adding Known gaps to the header menu (tools/site-nav/add-gaps-link.mjs)', () => {
  it('turns Restoration into a submenu of History and Known gaps, every other byte kept', () => {
    const out = addGapsLink(GROUPED);
    assert.equal(out.changed, true);
    assert.equal(out.markup, NESTED);
    const before = GROUPED.split('<!-- wp:navigation-link {"label":"Restoration"')[0];
    assert.ok(out.markup.startsWith(before), 'the Encyclopedia, Players and Community untouched');
    assert.ok(out.markup.endsWith(GROUPED.slice(GROUPED.indexOf('<!-- wp:navigation-link {"label":"Compare"'))), 'Compare onward untouched');
    assert.deepEqual(parseMenu(out.markup)[3].children[0].children.map((l) => l.href), ['/restoration/history/', '/restoration/gaps/']);
  });

  it('is idempotent', () => {
    const out = addGapsLink(NESTED);
    assert.equal(out.changed, false);
    assert.equal(out.markup, NESTED);
  });

  it('adds only Known gaps when Restoration already holds History', () => {
    const partial = NESTED.replace('\n\n<!-- wp:navigation-link {"label":"Known gaps","url":"/restoration/gaps/","kind":"custom"} /-->', '');
    assert.notEqual(partial, NESTED);
    const out = addGapsLink(partial);
    assert.equal(out.changed, true);
    assert.equal(out.markup, NESTED);
  });

  it('refuses a menu of any other shape', () => {
    const refuse = (markup, why) => assert.throws(() => addGapsLink(markup), why);
    refuse('', /one top-level Project submenu/);
    refuse(GROUPED.replace('"label":"Project"', '"label":"About"'), /one top-level Project submenu/);
    refuse(GROUPED.replace('"label":"Restoration"', '"label":"Report"'), /no Restoration link/);
    refuse(GROUPED.replace('"label":"History","url":"/restoration/history/"', '"label":"History","url":"/history/"'), /not followed by the History link/);
    refuse(GROUPED.replace('<!-- wp:navigation-link {"label":"Compare"', '<!-- wp:navigation-link {"label":"Gaps","url":"/restoration/gaps/","kind":"custom"} /-->\n\n<!-- wp:navigation-link {"label":"Compare"'), /already links to \/restoration\/gaps\//);
    refuse(NESTED.replace('"label":"History"', '"label":"Story"'), /already a submenu/);
    refuse(GROUPED.replace('<!-- /wp:navigation-submenu -->\n\n<!-- wp:navigation-link {"label":"Play"', '<!-- wp:navigation-link {"label":"Play"'), /never closed/);
  });
});
