/**
 * The site on a phone (the mobile review, Austin 2026-11-06). The header's links used to be a sideways
 * strip that hid most of them and ran under Play. On a phone the bar now holds the mark, Play, the theme
 * button and a Menu button (built by site/theme.js, so a page without the script keeps plain links).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pub = join(import.meta.dirname, '..', 'public');
const css = readFileSync(join(pub, 'site/site-nav.css'), 'utf8');
const theme = readFileSync(join(pub, 'site/theme.js'), 'utf8');

describe('the site header on a phone', () => {
  it('only folds the links when the script ran, and leaves the chat app its own menu', () => {
    assert.match(css, /:root\[data-site-menu\] \.site-nav:not\(\.site-nav-app\) \.site-nav-links \{/);
    assert.match(theme, /root\.setAttribute\('data-site-menu', ''\)/);
    assert.match(theme, /querySelectorAll\('\.site-nav:not\(\.site-nav-app\)'\)/);
  });

  it('keeps Play in the bar and out of the panel, and the extra controls off wide screens', () => {
    assert.match(css, /\.site-nav-bar-play, \.site-nav-menu-btn \{ display: none; \}/);
    assert.match(css, /\.site-nav-links > \.site-nav-play \{ display: none; \}/);
    assert.match(theme, /inBar\.classList\.add\('site-nav-bar-play'\)/);
  });

  it('the Menu button says what it does and says when it is open', () => {
    assert.match(theme, /setAttribute\('aria-label', 'Menu'\)/);
    assert.match(theme, /setAttribute\('aria-controls', links\.id\)/);
    assert.match(theme, /setAttribute\('aria-expanded', open \? 'true' : 'false'\)/);
  });

  it('a news count hidden with the links still shows on the button', () => {
    assert.match(theme, /querySelector\('\.site-nav-badge'\)\) button\.dataset\.news/);
    assert.match(css, /\.site-nav-menu-btn\[data-news\]::after/);
  });

  it('Escape closes the menu only once an open submenu has closed', () => {
    assert.match(theme, /e\.key === 'Escape' && links\.classList\.contains\('is-open'\) && !links\.querySelector\('\.site-nav-panel:not\(\[hidden\]\)'\)/);
  });
});

describe('the rest of the site on a phone', () => {
  it('fields are 16 px, so an iPhone does not zoom the page when one takes focus', () => {
    assert.match(css, /select, textarea \{ font-size: 16px !important; \}/);
  });

  it('the Restoration groups fit a 320 px phone', () => {
    const restoration = readFileSync(join(pub, 'restoration/restoration.css'), 'utf8');
    assert.match(restoration, /\.groups \{[^}]*minmax\(min\(330px, 100%\), 1fr\)/);
  });
});
