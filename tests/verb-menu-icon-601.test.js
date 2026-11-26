// #601 (an Android phone): the Rube's menu had his face in its head; after trading he left, and the
// next menu, on a Dullite rock, showed the Rube's face for a moment before the rock's. The menu's
// head picture is one <img> kept between menus, and an <img> given a new src keeps showing the old
// picture until the new one loads. A changed picture now waits unseen until it has loaded.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setVerbMenuIcon } from '../public/js/ui/verb-menu.js?v=1ad4f969';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** A stand-in <img>: src loads later (cached: at once), its load handler then fires. */
function fakeImg({ cached = new Set() } = {}) {
  const attrs = {};
  const img = {
    hidden: true,
    dataset: {},
    onload: null,
    onerror: null,
    complete: true,
    naturalWidth: 0,
    getAttribute: (k) => attrs[k] ?? null,
    set src(v) {
      attrs.src = v;
      const hit = cached.has(v);
      img.complete = hit;
      img.naturalWidth = hit ? 40 : 0;
    },
    get src() { return attrs.src; },
    finishLoad() {
      img.complete = true;
      img.naturalWidth = 40;
      img.onload?.();
    },
  };
  return img;
}

describe('#601: the verb menu never shows the last thing\'s picture', () => {
  it('a new picture waits unseen until it loads', () => {
    const img = fakeImg();
    setVerbMenuIcon(img, 'icons/npc_rube.webp');
    img.finishLoad();
    assert.equal(img.hidden, false);
    assert.equal(img.dataset.vmIconWait, undefined);
    // The next menu, on a rock: the Rube's face must not show while the rock's loads.
    setVerbMenuIcon(img, 'icons/rock_dullite_1.webp');
    assert.equal(img.getAttribute('src'), 'icons/rock_dullite_1.webp');
    assert.equal(img.dataset.vmIconWait, '1', 'unseen while it loads');
    img.finishLoad();
    assert.equal(img.dataset.vmIconWait, undefined, 'shows once loaded');
  });

  it('a picture already loaded shows at once; the same one is left alone; none hides it', () => {
    const img = fakeImg({ cached: new Set(['icons/apple.webp']) });
    setVerbMenuIcon(img, 'icons/apple.webp');
    assert.equal(img.dataset.vmIconWait, undefined);
    assert.equal(img.hidden, false);
    setVerbMenuIcon(img, 'icons/apple.webp');
    assert.equal(img.dataset.vmIconWait, undefined);
    setVerbMenuIcon(img, '');
    assert.equal(img.hidden, true);
    setVerbMenuIcon(null, 'x');
  });

  it('a late load of an older picture never uncovers a newer one still loading', () => {
    const img = fakeImg();
    setVerbMenuIcon(img, 'a.webp');
    const lateA = img.onload;
    setVerbMenuIcon(img, 'b.webp');
    lateA();
    assert.equal(img.dataset.vmIconWait, '1');
  });

  it('game.js draws the head picture through it; style.css keeps the waiting picture unseen in both skins', () => {
    assert.match(read('public/game.js'), /setVerbMenuIcon\(icon, iconUrl\);/);
    assert.doesNotMatch(read('public/game.js'), /if \(iconUrl && icon\.getAttribute\('src'\) !== iconUrl\) icon\.src = iconUrl;/);
    assert.match(read('public/style.css'), /^#verb-menu \.vm-icon\[data-vm-icon-wait\] \{ visibility: hidden; \}/m);
  });
});
