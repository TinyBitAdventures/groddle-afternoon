/**
 * "Support the game" (Austin 2026-11-12): players in Global asked whether the game takes donations and
 * could not find a way. The site's /contribute/ page holds the GitHub Sponsors link; the in-game Menu
 * (World group, after Encyclopedia) and the start card's fine print now link to it, in a new tab.
 * Both pages carry <base> at the site root, so "contribute/" is /contribute/.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_ROWS, menuRowFor } from '../public/js/ui/topbar.js?v=3e654797';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const PAGES = ['public/play/index.html', 'public/play/online/index.html'];

describe('Support the game', () => {
  it('the Menu has the row on solo and online, a link to /contribute/ in a new tab', () => {
    for (const page of PAGES) {
      const html = read(page);
      assert.match(html, /<base href="(?:\.\.\/)+" \/>/, page);
      const menu = html.slice(html.indexOf('<div id="more-list"'), html.indexOf('<div id="sound-pop"'));
      const links = menu.match(/<a id="support-btn"[^>]*>Support the game<\/a>/g) || [];
      assert.equal(links.length, 1, `${page}: one Support the game row`);
      const a = links[0];
      assert.match(a, /class="chrome-btn"/, page);
      assert.match(a, /href="contribute\/"/, page);
      assert.match(a, /target="_blank"/, page);
      assert.match(a, /rel="noopener"/, page);
      // In the World group, after Encyclopedia.
      const world = menu.slice(menu.indexOf('data-menu-group="world"'), menu.indexOf('data-menu-group="social"'));
      assert.ok(world.indexOf('id="support-btn"') > world.indexOf('id="encyclopedia-btn"'), page);
    }
    assert.equal(menuRowFor('support-btn').group, 'world');
    assert.ok(MENU_ROWS['support-btn'].rank > MENU_ROWS['encyclopedia-btn'].rank);
    assert.equal(MENU_ROWS['support-btn'].key, undefined, 'no key cap: it leaves the game');
  });

  it('the start card fine print links it after Privacy on solo and online', () => {
    for (const page of PAGES) {
      assert.match(read(page), /<p class="fine">[^\n]*<a href="privacy-policy\/">Privacy<\/a> · <a href="contribute\/" target="_blank" rel="noopener">Support the game<\/a><\/p>/, page);
    }
  });

  it('the Menu sorts, arrows to and closes on a link row as it does a button', () => {
    const topbar = read('public/js/ui/topbar.js');
    assert.match(topbar, /const ROW = 'button, a\[href\]';/);
    assert.match(topbar, /list\.querySelectorAll\(ROW\)/);
    assert.match(topbar, /:scope > :is\(button, a\[href\]\)/);
    assert.match(topbar, /querySelectorAll\(ROW \+ ', input\[type="range"\], input\[type="checkbox"\]'\)\]/);
    assert.match(read('public/game.js'), /if \(e\.target\.closest\('button, a\[href\]'\)\) setOpen\(false\);/);
    assert.match(read('public/style.css'), /\.more-list a\.chrome-btn \{ display: block; box-sizing: border-box; text-decoration: none; \}/);
    // Classic: the link row takes the button rows' type and colour (classic.css `.top-bar button`).
    const classic = read('public/css/classic.css');
    const block = classic.slice(classic.indexOf('/* === support-link (lane) === */'), classic.indexOf('/* === end support-link === */'));
    assert.match(block, /:root\[data-ui="classic"\] \.top-bar #more-list a\.chrome-btn \{ font-family: var\(--font-classic-body\); color: var\(--c-classic-text\); \}/);
    assert.ok(classic.indexOf('/* === end support-link === */') < classic.indexOf('/* == TICKETS =='), 'above the TICKETS section');
  });

  it('the wording is exact and has no em-dash', () => {
    for (const page of PAGES) {
      const html = read(page);
      for (const m of html.matchAll(/[^\n]*Support the game[^\n]*/g)) assert.doesNotMatch(m[0], /\u2014/, page);
      assert.doesNotMatch(html, /Support The Game|Support the Game|support the game/);
    }
  });
});
