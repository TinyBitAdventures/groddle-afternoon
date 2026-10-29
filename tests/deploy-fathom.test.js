/**
 * Fathom analytics reaches the static game pages at deploy time (tools/deploy/fathom.mjs from kinsta.sh),
 * counted on groddleafternoon.com only; the repo's own pages never carry it, so groddle.localhost is not counted.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { FATHOM_SNIPPET, withFathom } from '../tools/deploy/fathom.mjs';

describe('Fathom on the static game pages', () => {
  it('goes in before </head> once, for the live domain only', () => {
    const page = '<!doctype html><html><head><title>x</title></head><body></body></html>';
    const once = withFathom(page);
    assert.ok(once.includes(FATHOM_SNIPPET + '</head>'));
    assert.equal(withFathom(once), null, 'idempotent');
    assert.equal(withFathom('<p>no head</p>'), null);
    assert.match(FATHOM_SNIPPET, /data-site="OTSJXDRZ"/);
    assert.match(FATHOM_SNIPPET, /data-included-domains="groddleafternoon\.com"/);
  });

  it('kinsta.sh runs it on the built game before the upload', () => {
    const deploy = readFileSync(new URL('../tools/deploy/kinsta.sh', import.meta.url), 'utf8');
    const at = deploy.indexOf('tools/deploy/fathom.mjs" "$GAME"');
    assert.ok(at > 0);
    assert.ok(at < deploy.indexOf('"$GAME/" "$HOST:web/game.next/"'), 'before the game rsync');
  });

  it('the repo\'s own pages stay without it', () => {
    for (const p of ['public/index.html', 'public/play/index.html', 'public/play/online/index.html', 'public/compare/index.html']) {
      assert.ok(!readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').includes('usefathom'), p);
    }
  });
});
