import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { servedByMinn } from './minn-served.js';

const pub = join(import.meta.dirname, '..', 'public');
const read = (p) => readFileSync(join(pub, p), 'utf8');
const refs = (html) => [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1])
  .filter((u) => !/^(https?:|mailto:|data:)/.test(u))
  .map((u) => u.split('?')[0]);

describe('home page and /play/', () => {
  const home = read('index.html');
  const play = read('play/index.html');

  it('sends old game links (/?autostart=1...) to /play/ with the same query', () => {
    assert.match(home, /if \(location\.search\) location\.replace\('play\/' \+ location\.search \+ location\.hash\);/);
    assert.ok(home.indexOf('location.replace') < home.indexOf('<link rel="stylesheet"'), 'redirect runs before styles load');
  });

  it('links to the game, the reports and its own assets, all of which exist', () => {
    const list = refs(home);
    for (const want of ['play/', 'restoration/', 'compare/', 'landing/landing.css', 'landing/landing.js', 'landing/hero.webp']) {
      assert.ok(list.includes(want), want);
    }
    for (const ref of list.filter((r) => !servedByMinn(r))) {
      const target = resolve(pub, ref);
      assert.ok(existsSync(ref.endsWith('/') ? join(target, 'index.html') : target), ref);
    }
  });

  it('reads its numbers from restoration/data.json and uses no em dashes', () => {
    assert.match(read('landing/landing.js'), /fetch\('restoration\/data\.json'/);
    assert.ok(!home.includes('—'));
  });

  it('the game page resolves every asset from the site root through <base href="../">', () => {
    const base = play.indexOf('<base href="../" />');
    assert.ok(base > 0);
    const firstRelative = play.search(/(?:href|src)="(?!https?:)/);
    assert.ok(base < firstRelative, 'base comes before the first relative URL');
    for (const ref of refs(play)) {
      if (ref === '../' || servedByMinn(ref)) continue;
      assert.ok(existsSync(resolve(pub, ref)), ref);
    }
  });

  it('the reports link Home and Play', () => {
    for (const page of ['restoration/index.html', 'compare/index.html']) {
      const html = read(page);
      assert.match(html, /<a href="\.\.\/">Home<\/a>/, page);
      assert.match(html, /<a href="\.\.\/play\/">Play Groddle Afternoon<\/a>/, page);
    }
  });
});
