/**
 * Report #258: a Giant in the favor panel finds the closest Shrine to it and sets it as the
 * destination, as Glitch's Giant button did ("Find the closest Shrine to <Giant>",
 * glitch-client FavorProgressUI.as 129, 189-212; GetInfoDialog.as 769-787, 1094-1118).
 * Run: node --test tests/r258-favor-shrine.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shrineStreetsFor } from '../public/js/street-ecology.js?v=64dcdacc';
import { GIANTS } from '../public/js/shrines.js?v=7260fa28';

const pub = join(dirname(fileURLToPath(import.meta.url)), '../public');
const ecology = JSON.parse(readFileSync(join(pub, 'assets/content/street-ecology.json'), 'utf8'));

describe('report #258: the closest Shrine to a Giant', () => {
  it('every Giant has shrine streets, and only its own', () => {
    for (const giant of Object.values(GIANTS)) {
      const streets = shrineStreetsFor(giant.id, ecology);
      assert.ok(streets.length > 50, giant.id);
      for (const t of streets) assert.equal(ecology.streets[t].giantId, giant.id);
    }
    assert.deepEqual(shrineStreetsFor('', ecology), []);
  });

  it('a row click asks for the route to all of them, so the nearest by road wins', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /favor: \{ rows: \(\) => favorPanelRows\(shrineState, favorGiantHere\(\)\?\.id \|\| null\), find: \(giant\) => findNearestShrine\(giant\) \}/);
    assert.match(game, /engine\.query\('mapRoute', 'set', \{ to: streets, source: 'player' \}, engine\)/);
    assert.match(game, /The nearest \$\{shrine\} is right here in your location!/);
    const topbar = readFileSync(join(pub, 'js/ui/topbar.js'), 'utf8');
    assert.match(topbar, /title="\$\{esc\(`Find the closest Shrine to \$\{r\.name\}`\)\}"/);
  });
});
