/**
 * The Project page (register G338, Austin 2026-10-28): the header's Project
 * link leads to /project/, a Minn page made once by tools/project/to-minn.mjs
 * with a card for each page of the restoration story, and the header marks
 * Project on those pages too (tools/site-nav/apply.mjs SECTIONS).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CARDS, projectContent } from '../tools/project/to-minn.mjs';
import { SECTIONS } from '../tools/site-nav/apply.mjs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');

describe('the Project page (tools/project/to-minn.mjs)', () => {
  const content = projectContent();

  it('has a card for Restoration, Compare, Notes and Code, each linking its page with one line of words', () => {
    assert.deepEqual(CARDS.map((c) => [c.title, c.href]), [['Restoration', '/restoration/'], ['Compare', '/compare/'], ['Notes', '/changelog/'], ['Code', '/code/']]);
    for (const c of CARDS) {
      assert.ok(content.includes(`<div class="wp-block-group pj-card pj-card-${c.id}">`), c.id);
      assert.ok(content.includes(`<a href="${c.href}">${c.title}</a>`), c.href);
      assert.ok(c.words.length > 20 && c.words.length < 140 && !c.words.includes('\n'), `${c.id}: one line`);
    }
  });

  it('gathers the same pages the header marks Project on', () => {
    assert.deepEqual(CARDS.map((c) => c.href), SECTIONS['/project/']);
  });

  it('is words in core blocks only, in the house style', () => {
    const names = new Set([...content.matchAll(/<!-- wp:([a-z0-9/-]+)/g)].map((m) => m[1]));
    assert.deepEqual([...names].sort(), ['group', 'heading', 'paragraph']);
    assert.doesNotMatch(content, /—/, 'no em-dashes in page copy');
    assert.doesNotMatch(content, /Glitch™|glitch\.com/i);
  });

  it('refuses to overwrite the page without --force and makes it full width', () => {
    const src = readFileSync(join(root, 'tools/project/to-minn.mjs'), 'utf8');
    assert.match(src, /if \(found\[0\] && !args\.force\) \{/);
    assert.match(src, /slug: 'project', status: 'publish', template: 'page-wide'/);
  });

  it('wears a Tiny Speck icon on each card from the game\'s own CC0 icons (the site\'s style.css)', { skip: skipWithoutSite }, () => {
    const css = readFileSync(sitePath('style.css'), 'utf8');
    for (const c of CARDS) {
      const rule = css.match(new RegExp(`\\.pj-card-${c.id} \\{[^}]*--pj-icon: url\\("/assets/sprites/icons/([a-z0-9_]+)@3x\\.png"\\)`));
      assert.ok(rule, `${c.id} has an icon`);
      assert.equal(rule[1], c.icon, c.id);
      assert.ok(existsSync(join(root, `public/assets/sprites/icons/${c.icon}@3x.png`)), c.icon);
    }
    assert.match(css, /\.pj-card-title a::after \{ content: ""; position: absolute; inset: 0;/, 'the whole card is the link');
  });
});
