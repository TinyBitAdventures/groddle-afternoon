/**
 * #284 (an iPhone tab killed by WebKit on the signpost trip from Ferncaster End to Froughtful Fen):
 * a street trip no longer holds two streets' art on the GPU. The street left behind is unloaded at
 * once (game.js enterStreet, js/textures.js unloadGpuCopies) instead of 20 s into the next one.
 * Run: node --test tests/street-trip-memory.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');

describe('#284: the street left behind leaves the GPU when the next one is built', () => {
  it('enterStreet unloads the old street art right after destroying its view', () => {
    assert.match(
      game,
      /bgLayer\.destroy\(\{ children: true \}\);\n\s*\/\/ #284[^\n]*\n\s*textureUrls\.unloadGpuCopies\(\{ match: STREET_ART_URL, managed: app\?\.renderer\?\.texture\?\.managedTextures \}\);\n\s*\}\n\s*const available = await loadDecoManifest\(\);/
    );
  });
});
