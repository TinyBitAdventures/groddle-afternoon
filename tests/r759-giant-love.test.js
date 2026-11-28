/**
 * Report #759: the Giant's "I love you too" screen shows the Giant's own painting cut out with a
 * soft glow (players' snaps of GiantView; the lost giant_<name>_flv_overlay video showed Tiny
 * Speck's Giants_All.ai painting), not its emblem, and online it names you (main.js 1819
 * "I love you too, "+pc.getLabel()); solo, with no names, says "friend".
 * Run: node --test tests/r759-giant-love.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GIANT_CUT, GIANT_SCREEN_TIMES, LOVE_GIANTS, giantCutArt, giantLoveResponse, giantScreenLayout } from '../public/js/giant-love.js?v=abed6d7d';
import { sayLoveLine } from '../public/js/features/shrine-hint-feature.js?v=565483df';

const ROOT = join(import.meta.dirname, '..');
const PORTRAITS = join(ROOT, 'public', 'assets', 'sprites', 'giant-portraits');
const FEATURE = readFileSync(join(ROOT, 'public', 'js', 'features', 'shrine-hint-feature.js'), 'utf8');
const hasDwebp = (() => {
  try {
    execFileSync('dwebp', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** A WebP's canvas size and alpha flag from its VP8X header. */
function webpInfo(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF');
  assert.equal(b.toString('latin1', 8, 16), 'WEBPVP8X', `${file}: extended WebP (alpha)`);
  return { alpha: Boolean(b[20] & 0x10), w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
}

/** RGBA pixels via dwebp -pam. */
function rgba(file) {
  const out = execFileSync('dwebp', [file, '-pam', '-o', '-'], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  const head = out.toString('latin1', 0, 200);
  const end = head.indexOf('ENDHDR\n') + 7;
  const w = Number(/WIDTH (\d+)/.exec(head)[1]);
  const h = Number(/HEIGHT (\d+)/.exec(head)[1]);
  return { w, h, a: (x, y) => out[end + (y * w + x) * 4 + 3] };
}

function engine({ name = '' } = {}) {
  const data = {};
  return {
    data,
    player: { x: 1050, y: 500 },
    interactables: [{ classId: 'npc_shrine_humbaba', state: { giantId: 'humbaba' }, sprite: { x: 1000, y: 500, visible: true, destroyed: false } }],
    setData: (k, v) => { data[k] = v; },
    query: (key) => (key === 'playerChatName' ? name : undefined),
  };
}

describe('#759 the Giant\'s screen shows its cut-out painting', () => {
  it('the screen carries the cut-out portrait, and the page shows it, not the emblem', () => {
    const r = giantLoveResponse('I love you Humbaba', { shrines: [{ giant: 'humbaba', x: 1000, y: 500 }], x: 1050, y: 500 });
    assert.equal(r.ok, true);
    assert.equal(r.screen.art.src, 'assets/sprites/giant-portraits/humbaba-cut.webp');
    assert.equal(r.screen.art.src2x, 'assets/sprites/giant-portraits/humbaba-cut@2x.webp');
    assert.doesNotMatch(FEATURE, /emblem_\$\{/, 'no emblem stand-in on the Giant screen');
    assert.match(FEATURE, /img\.srcset = `\$\{keyedArt\(art\.src\)\} 1x, \$\{keyedArt\(art\.src2x\)\} 2x`/);
    // The glow: a blurred white silhouette around the painting (drop-shadow follows its alpha).
    assert.match(FEATURE, /\.gs-art\{[^}]*filter:drop-shadow\(0 0 calc\(var\(--gs-k\) \* \d+px\) var\(--c-white\)\)/);
  });

  it('every Giant\'s cut-out exists at 1x and 2x, with alpha, at the sizes the layout uses', () => {
    for (const g of LOVE_GIANTS) {
      const art = giantCutArt(g);
      for (const [file, scale] of [[art.src, 1], [art.src2x, 2]]) {
        const path = join(ROOT, 'public', file);
        assert.ok(existsSync(path), file);
        const info = webpInfo(path);
        assert.ok(info.alpha, `${file}: has alpha`);
        assert.deepEqual([info.w, info.h], [GIANT_CUT[g].w * scale, GIANT_CUT[g].h * scale], `${file}: size`);
      }
    }
  });

  it('the cut-outs are transparent at the corners (no panel left behind)', { skip: !hasDwebp && 'dwebp not installed' }, () => {
    for (const g of LOVE_GIANTS) {
      for (const f of [`${g}-cut.webp`, `${g}-cut@2x.webp`]) {
        const px = rgba(join(PORTRAITS, f));
        for (const [x, y] of [[0, 0], [px.w - 1, 0], [0, px.h - 1], [px.w - 1, px.h - 1], [2, 2], [px.w - 3, px.h - 3]]) {
          assert.equal(px.a(x, y), 0, `${f} (${x}, ${y}) transparent`);
        }
        // and the painting itself is opaque in the middle
        let opaque = 0;
        for (let y = 0; y < px.h; y += 4) for (let x = 0; x < px.w; x += 4) if (px.a(x, y) === 255) opaque++;
        assert.ok(opaque > (px.w * px.h) / 16 / 5, `${f}: a painting, not an empty frame`);
      }
    }
  });

  it('SOURCE.txt records the cut-outs: Tiny Speck\'s file, how they were cut, each file\'s bytes', () => {
    const note = readFileSync(join(PORTRAITS, 'SOURCE.txt'), 'utf8');
    assert.match(note, /Cut-outs <giant>-cut\.webp/);
    assert.match(note, /pdftocairo -transp/);
    for (const g of LOVE_GIANTS) {
      assert.match(note, new RegExp(`  ${g}-cut\\.webp  sha256 [0-9a-f]{64}`));
      assert.match(note, new RegExp(`  ${g}-cut@2x\\.webp  sha256 [0-9a-f]{64}`));
    }
  });
});

describe('#759 the line names you online', () => {
  it('online: "I love you too, <your name>" (pc.getLabel())', () => {
    const e = engine({ name: 'Mossy Pebble' });
    const r = sayLoveLine(e, 'I love you Humbaba');
    assert.equal(r.ok, true);
    assert.equal(r.screen.tipBody, 'I love you too, Mossy Pebble');
  });

  it('solo: "I love you too, friend"', () => {
    const r = sayLoveLine(engine(), 'I love you Humbaba');
    assert.equal(r.screen.tipBody, 'I love you too, friend');
  });
});

describe('#759 layout and pace as GiantView', () => {
  it('desktop: art about 0.6 of the view tall, then beside the text, both centred together', () => {
    const lay = giantScreenLayout('humbaba', { w: 1280, h: 720, textW: 420, textH: 90 });
    assert.equal(lay.stacked, false);
    assert.ok(Math.abs(lay.artH / 720 - 0.6) < 0.01, `art ${lay.artH} of 720`);
    assert.deepEqual(lay.start, { x: 640, y: 360 });
    const left = lay.end.x - lay.artW / 2;
    const right = lay.text.x + 420;
    assert.ok(Math.abs((left + right) / 2 - 640) < 0.5, 'art and text centred together');
    assert.ok(lay.text.x > lay.end.x + lay.artW / 2, 'text right of the art');
    assert.ok(lay.text.y < 360 - 45, 'text block raised above the middle');
  });

  it('phones: side by side held sideways, stacked upright, always inside the view', () => {
    const side = giantScreenLayout('mab', { w: 844, h: 390, textW: 230, textH: 50 });
    assert.equal(side.stacked, false);
    assert.ok(side.end.y + side.artH / 2 <= 390 && side.end.y - side.artH / 2 >= 0);
    const up = giantScreenLayout('alph', { w: 390, h: 700, textW: 300, textH: 80 });
    assert.equal(up.stacked, true);
    assert.ok(up.artW <= 390 && up.text.y + 80 <= 700 && up.end.y - up.artH / 2 >= 0, JSON.stringify(up));
  });

  it('follows GiantView\'s timings: grow 3 s after the .8 s fade and .4 s, hold 3 s, slide 1.5 s, text 2 s', () => {
    assert.deepEqual({ ...GIANT_SCREEN_TIMES }, { growAt: 1200, growMs: 3000, slideAt: 7200, slideMs: 1500, textAt: 8700, textMs: 2000, readyAt: 10700, okMs: 500 });
  });
});
