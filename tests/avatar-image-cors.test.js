/**
 * The avatar compositor asks for its part art with CORS (js/avatar-compositor.js loadImage), so the art can be
 * hosted on another origin without tainting the canvases it is painted on.
 * Run: node --test tests/avatar-image-cors.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadArticles } from '../public/js/avatar-compositor.js?v=1d3df23e';

describe('avatar part images', () => {
  it('are requested with crossOrigin anonymous', async () => {
    const before = { fetch: globalThis.fetch, Image: globalThis.Image };
    const requested = [];
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ shapes: {}, bitmaps: { 1: 'textures/one.webp', 2: 'textures/two.webp' } }) });
    globalThis.Image = class {
      set src(url) {
        requested.push({ url, crossOrigin: this.crossOrigin });
        queueMicrotask(() => this.onload());
      }
    };
    try {
      const { sources } = await loadArticles({ hat: { name: 'cors_test_hat' } }, 'https://cdn.example.test/avatar/');
      assert.equal(sources.get('cors_test_hat').bitmaps.size, 2);
      assert.deepEqual(requested, [
        { url: 'https://cdn.example.test/avatar/textures/one.webp', crossOrigin: 'anonymous' },
        { url: 'https://cdn.example.test/avatar/textures/two.webp', crossOrigin: 'anonymous' },
      ]);
    } finally {
      globalThis.fetch = before.fetch;
      globalThis.Image = before.Image;
    }
  });
});
