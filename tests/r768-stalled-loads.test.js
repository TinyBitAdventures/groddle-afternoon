/**
 * #768 (R26, the load side): "there's no house in my house". Nothing in the save was lost: the house
 * was built from it, but its pictures were asked for and the requests never answered (no load, no
 * error). js/textures.js retried only after an error and had no time limit, the home street's
 * neighbours request waited for ever behind its loading flag, and some 75 fetches had no limit.
 * Now one helper (js/load-retry.js) gives every picture and data load a stall limit (20 s) and asks
 * a stalled one again after 1 s, 4 s, 16 s.
 * Run: node --test tests/r768-stalled-loads.test.js
 */
import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as T from '../public/js/textures.js?v=8bb43102';
import { fetchRetry, isLoadTimeout, LOAD_TIMEOUT_MS, loadTimeoutFor, RETRY_WAITS_MS, timeLimit } from '../public/js/load-retry.js?v=24823577';

const root = join(import.meta.dirname, '..');
const flush = async (n = 8) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(ev, fn, ctx) { (this.handlers.get(ev) || this.handlers.set(ev, []).get(ev)).push([fn, ctx]); return this; }
  emit(ev, ...a) { for (const [fn, ctx] of this.handlers.get(ev) || []) fn.apply(ctx, a); return this; }
}
class ImageSource extends Emitter {
  constructor({ resource, label, resolution = 1 }) {
    super();
    Object.assign(this, { resource, label, resolution, width: 1, height: 1, pixelWidth: 1, pixelHeight: 1 });
  }
  resize(w, h, res) { const c = w !== this.width; Object.assign(this, { width: w, height: h, resolution: res, pixelWidth: w * res, pixelHeight: h * res }); if (c) this.emit('resize', this); return c; }
  update() {}
}
class Texture { constructor({ source, label, dynamic }) { Object.assign(this, { source, label, dynamic }); } }
const stalled = new Set();
const asked = [];
class FakeImage {
  set src(url) {
    this._src = url;
    if (!url) return; // the stalled request dropped
    asked.push(url);
    if (stalled.has(url)) return; // the request hangs: neither onload nor onerror
    setImmediate(() => { this.naturalWidth = 150; this.naturalHeight = 300; this.onload?.(); });
  }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
}

const saved = {};
before(() => {
  for (const k of ['PIXI', 'Image', 'document']) saved[k] = globalThis[k];
  globalThis.PIXI = { ImageSource, Texture };
  globalThis.Image = FakeImage;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
});
after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
});

describe('#768: a house picture whose request never answers', () => {
  it('fills in by itself: after its time limit it counts as failed (the report shows it) and is asked for again', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    try {
      T.resetImageFailures();
      const url = 'assets/homes/wallpaper/uralia_wall@2x.webp';
      const routed = T.routeUrl(url);
      stalled.add(routed);
      const wall = T.textureFromUrl(url); // the room is built once; nothing asks again
      await flush();
      assert.equal(T.isLoaded(wall), false);
      mock.timers.tick(LOAD_TIMEOUT_MS - 1);
      await flush();
      assert.equal(T.isFailed(wall), false, 'still waiting just under the limit');
      stalled.delete(routed); // the network is back
      mock.timers.tick(1);
      await flush();
      assert.equal(T.isFailed(wall), true, 'stalled: counted as failed');
      assert.match(T.imageFailureLine(), /uralia_wall@2x\.webp x1/, 'the report says so (it said errors: [])');
      mock.timers.tick(RETRY_WAITS_MS[0]);
      await flush();
      assert.equal(asked.filter((u) => u === routed).length, 2, 'asked for again by itself');
      assert.equal(T.isLoaded(wall), true, 'the walls fill in, on the texture already drawn');
      assert.equal(wall.source.width, 75, 'its size (an @2x picture 150 px wide)');
      assert.match(T.imageFailureLine(), /\(loaded later\)/);
    } finally {
      mock.timers.reset();
    }
  });

  it('a load found past its limit when the room is drawn again (timers held back in a background tab) is asked for again at once', async () => {
    const realNow = Date.now;
    let clock = realNow.call(Date);
    Date.now = () => clock;
    try {
      T.resetImageFailures();
      const url = 'assets/homes/floor/uralia_floor@2x.webp';
      const routed = T.routeUrl(url);
      stalled.add(routed);
      const tex = T.textureFromUrl(url);
      await flush();
      stalled.delete(routed);
      clock += 60_000; // a minute in the house, the floor still blank, no timer has run
      const again = T.textureFromUrl(url);
      await flush();
      assert.equal(again, tex);
      assert.notEqual(T.imageFailureLine(), '');
      assert.equal(asked.filter((u) => u === routed).length, 2);
      assert.equal(T.isLoaded(again), true);
    } finally {
      Date.now = realNow;
    }
  });

  it('each try of a picture gets longer (a slow line still gets a big sheet); textures waits as the helper does', () => {
    assert.deepEqual([1, 2, 3, 4].map((n) => loadTimeoutFor(n)), [20_000, 40_000, 80_000, 160_000]);
    assert.equal(T.RETRY_WAIT_MS, RETRY_WAITS_MS);
  });
});

describe('#768: fetchRetry, the one data load with a stall limit', () => {
  const answer = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  it('a GET that never answers is asked for again after 1 s and its answer used', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
      const calls = [];
      const fetchImpl = (url, init) => {
        calls.push(init);
        return calls.length === 1 ? new Promise(() => {}) : Promise.resolve(answer({ signpost: [1] }));
      };
      let got = null;
      fetchRetry('wp-json/groddle/v1/homes/1/street', { credentials: 'same-origin' }, { fetchImpl }).then((r) => r.json()).then((j) => (got = j));
      await flush();
      mock.timers.tick(LOAD_TIMEOUT_MS);
      await flush();
      assert.equal(calls.length, 1, 'waits before asking again');
      assert.equal(calls[0].signal.aborted, true, 'the stalled request is stopped');
      assert.equal(calls[0].credentials, 'same-origin', 'its own options kept');
      mock.timers.tick(RETRY_WAITS_MS[0]);
      await flush();
      assert.equal(calls.length, 2);
      assert.deepEqual(got, { signpost: [1] });
    } finally {
      mock.timers.reset();
    }
  });

  it('gives up after the last wait with a LoadTimeout (callers say it did not answer)', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
      let n = 0;
      let err = null;
      fetchRetry('assets/content/x.json', undefined, { fetchImpl: () => { n += 1; return new Promise(() => {}); } }).catch((e) => (err = e));
      for (let i = 0; i <= RETRY_WAITS_MS.length; i += 1) {
        await flush();
        mock.timers.tick(LOAD_TIMEOUT_MS);
        await flush();
        if (i < RETRY_WAITS_MS.length) mock.timers.tick(RETRY_WAITS_MS[i]);
      }
      await flush();
      assert.equal(n, RETRY_WAITS_MS.length + 1);
      assert.equal(isLoadTimeout(err), true);
    } finally {
      mock.timers.reset();
    }
  });

  it('a write that stalls is never sent twice: it fails once', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
      let n = 0;
      let err = null;
      fetchRetry('wp-json/groddle/v1/homes/signpost', { method: 'PUT', body: '{}' }, { fetchImpl: () => { n += 1; return new Promise(() => {}); } }).catch((e) => (err = e));
      await flush();
      mock.timers.tick(LOAD_TIMEOUT_MS);
      await flush();
      mock.timers.tick(60_000);
      await flush();
      assert.equal(n, 1);
      assert.equal(isLoadTimeout(err), true);
    } finally {
      mock.timers.reset();
    }
  });

  it('a body that stops coming fails; a long one that keeps coming is not cut', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
      const enc = new TextEncoder();
      const dribble = (pieces, hang) => {
        let i = 0;
        return new Response(new ReadableStream({
          pull(ctrl) {
            if (i < pieces.length) { ctrl.enqueue(enc.encode(pieces[i++])); return new Promise((r) => setTimeout(r, 15_000)); }
            if (hang) return new Promise(() => {});
            ctrl.close();
            return undefined;
          },
        }), { status: 200 });
      };
      let slow = null;
      fetchRetry('assets/music/long.mp3', undefined, { fetchImpl: async () => dribble(['ab', 'cd', 'ef'], false), retry: false }).then((r) => r.text()).then((t) => (slow = t));
      for (let i = 0; i < 4; i += 1) { await flush(); mock.timers.tick(15_000); }
      await flush();
      assert.equal(slow, 'abcdef', '45 s in all, never 20 s without a piece');
      let err = null;
      fetchRetry('assets/content/y.json', undefined, { fetchImpl: async () => dribble(['{"a":'], true), retry: false }).then((r) => r.text()).catch((e) => (err = e));
      await flush();
      mock.timers.tick(15_000);
      await flush();
      mock.timers.tick(LOAD_TIMEOUT_MS);
      await flush();
      assert.equal(isLoadTimeout(err), true);
    } finally {
      mock.timers.reset();
    }
  });

  it('errors are left as fetch gives them: a 404 comes back as it is, a network error rejects at once', async () => {
    const res = await fetchRetry('assets/missing.json', undefined, { fetchImpl: async () => new Response('no', { status: 404 }) });
    assert.equal(res.status, 404);
    let n = 0;
    await assert.rejects(fetchRetry('assets/a.json', undefined, { fetchImpl: async () => { n += 1; throw new TypeError('Failed to fetch'); } }), /Failed to fetch/);
    assert.equal(n, 1);
    const plain = { ok: true, status: 200, json: async () => ({ a: 1 }) };
    assert.equal(await fetchRetry('assets/b.json', undefined, { fetchImpl: async () => plain }), plain, 'a stand-in answer (tests) comes back as it is');
  });

  it('timeLimit: expire() gives up at once', async () => {
    const run = timeLimit(() => new Promise(() => {}), { ms: 60_000 });
    run.expire();
    await assert.rejects(run, (e) => isLoadTimeout(e));
  });
});

/** Every fetch the game makes at run time, with the reason each one left is left. */
const LEFT = {
  'js/data-urls.js': 'the versioned-URL wrapper every fetch passes through, not a load',
  'js/race-courses.js': 'a local helper named fetch (course layout), not a request',
  'js/sound-test.js': 'the sound test page, a tool',
  'js/sound-board.js': 'the sound board tool page; takes its own fetchImpl',
  'js/phone/companion.js': 'the phone companion page: its 280 KB budget (tests/phone-companion.test.js)',
  'js/builder/editor.js': 'the level builder, a tool',
  'js/builder/api.js': 'the level builder, a tool',
  'js/builder/validate-worker.js': 'the level builder, a worker',
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('#768: no picture or data load waits for ever', () => {
  it('every bare fetch( in the game goes through fetchRetry, except the listed ones', () => {
    const files = [join(root, 'public/game.js'), ...walk(join(root, 'public/js'))];
    const bare = [];
    for (const file of files) {
      const rel = relative(join(root, 'public'), file);
      if (rel in LEFT || rel === 'js/load-retry.js') continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\*|\/\/)/.test(line)) return;
        if (/(^|[^\w.$])fetch\(/.test(line) || /globalThis\.fetch\(/.test(line)) bare.push(`${rel}:${i + 1}`);
      });
    }
    assert.deepEqual(bare, []);
  });

  it('textures.js and the home street neighbours request use the helper', () => {
    const tex = readFileSync(join(root, 'public/js/textures.js'), 'utf8');
    assert.match(tex, /from '\.\/load-retry\.js/);
    const hs = readFileSync(join(root, 'public/js/features/home-street-mp-feature.js'), 'utf8');
    assert.match(hs, /res = await fetchRetry\(api \+ path/);
  });
});
