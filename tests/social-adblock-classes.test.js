/**
 * #155 trace (2026-11-27): AdGuard's Social media filter list hides, on every site, elements with the
 * classes .social-tab (##.social-tab) and .social-count (~m.bazonline.ch,~github.com##.social-count).
 * The Modern Social drawer used both (js/ui/social-drawer.js: its tab row's buttons and an Activity
 * line's "x2"), so with that list on its tabs vanished. They are .sd-tab and .sd-count now (JS, the
 * Modern and Classic CSS). The names below are every generic AdGuard hiding rule that is one social-*
 * class (Social media, Annoyances, Widgets, Base and the other AdGuard lists, as downloaded for the
 * trace); no class the game draws or styles may be one of them.
 * Run: node --test tests/social-adblock-classes.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const ADGUARD_SOCIAL = new Set(`social-area-syncer social-bar social-bar-wrapper social-block social-block-div social-block-links
social-block-share social-box social-btn-block social-btn-list_mini social-button-small social-button_holder social-count
social-count-plus social-fb-alt2 social-fp-widget social-hatena social-horizontal social-icons-big social-icons-widget
social-likes social-likes_single-w social-line social-links-block social-links-tooltip social-links-wrapper social-listing
social-love social-media-box social-media-iframe social-media-share social-media-sharing social-menu social-nav
social-networks social-profiles-widget social-roll social-row social-service social-share social-share-bar
social-share-block social-share-buttons social-share-buttons-block social-share-container social-share-facebook
social-share-google social-share-ic social-share-links social-share-stumbleupon social-share-twitter social-share-widget
social-share-wrapper social-shares social-sharing social-sidebar social-sidebar-wrap social-sitewide social-sticky
social-tab social-tab-large social-tab-mini social-tools social-twitter-alt2 social-userbar-widget_container
social-userbar-widget_social_container_short social-v social-widget social-widget-sidebar social-widgets
social-widgets-in`.split(/\s+/).filter(Boolean));

function files(dir, ext) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (!['assets', 'encyclopedia', 'vendor'].includes(e.name)) out.push(...files(rel, ext));
    } else if (ext.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

/** Every social-* class a stylesheet selects (.social-x) or a script sets (in a class string). */
function classesUsed() {
  const used = new Map();
  const add = (c, f) => { if (!used.has(c)) used.set(c, f); };
  for (const f of [...files('public', ['.css']), 'public/game.js', ...files('public/js', ['.js'])]) {
    const src = read(f);
    for (const m of src.matchAll(/\.(social-[A-Za-z0-9_-]+)/g)) add(m[1], f);
    // class: 'a b', className = 'a', classList.add('a'), class="a"
    for (const m of src.matchAll(/(?:class(?:Name)?\s*[:=]\s*|classList\.(?:add|toggle|remove|contains)\()\s*(['"`])([^'"`]*)\1/g)) {
      for (const c of m[2].split(/\s+/)) if (/^social-/.test(c)) add(c, f);
    }
  }
  return used;
}

describe('#155: no class the game uses is one AdGuard\'s lists hide everywhere', () => {
  it('none of the Social drawer\'s classes is an AdGuard social-* rule', () => {
    const hit = [...classesUsed()].filter(([c]) => ADGUARD_SOCIAL.has(c)).map(([c, f]) => `${c} (${f})`);
    assert.deepEqual(hit, []);
  });

  it('the tab row\'s buttons are .sd-tab and an Activity line\'s count .sd-count, styled in Modern and Classic', () => {
    const js = read('public/js/ui/social-drawer.js');
    assert.match(js, /class: chats \? 'sd-tab is-chats' : 'sd-tab'/);
    assert.match(js, /el\('span', \{ class: 'sd-count' \}/);
    assert.match(read('public/style.css'), /\.social-drawer \.sd-tab \{/);
    assert.match(read('public/style.css'), /\n\.sd-count \{/);
    assert.match(read('public/css/classic.css'), /\.social-drawer \.sd-tab \{/);
    assert.match(read('public/css/classic.css'), /\.social-drawer \.sd-count \{/);
  });
});
