/**
 * LEVEL BUILDER P4 (spec 8.5, 14): the render endpoint's renderer. /builder-render/ draws a street
 * with the game's own renderer in Chrome (tools/builder/render.mjs, under the browser lock), and a
 * render of Hechey Track at scale 0.25 matches the stored picture to within 1% of pixels (a channel
 * more than 32 levels off, the P1 measure). Overlays draw over it; the frame math is pure.
 *
 * Refresh the picture after a deliberate change to the renderer:
 *   GRODDLE_RENDER_GOLDEN_WRITE=1 node --test tests/builder-render.test.js
 */
import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from '../tools/repos.mjs';
import { createRenderer, renderInput, RENDERS_ANYWAY } from '../tools/builder/render.mjs';
import { loadValidatorContext } from '../tools/builder/validator-context.mjs';
import { forkStreet } from '../public/js/builder/zone.js?v=29defbb2';
import { DECO_TWINS } from '../public/js/street-render.js?v=b42b5803';

const GOLDEN = join(GAME_DIR, 'tests/fixtures/builder/hechey-track-0.25.png');
const pub = (p) => join(GAME_DIR, 'public', p);
let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

function hecheyZone() {
  const shipped = JSON.parse(readFileSync(pub('assets/streets/GLI2V0UN7RD1T2J.json'), 'utf8'));
  const catalog = new Map(JSON.parse(readFileSync(pub('assets/content/deco-catalog.json'), 'utf8')).decos.map((d) => [d.name, d]));
  const fork = forkStreet(shipped, { zoneId: 'golden', key: 'hechey', label: 'Hechey Track', tsid: 'GZ0000000000001', catalog, twins: DECO_TWINS });
  return { format: 'groddle-zone/1', id: 'golden', title: 'Golden', rev: 1, hub: fork.hub, streets: [fork.draftStreet], edits: [], assets: fork.assets };
}

describe('the render page\'s frame (pure)', async () => {
  const { renderFrame, gridLines } = await import('../public/builder-render/render.js?v=807b4bfb');
  const street = { bounds: { l: -1500, r: 1500, t: -1000, b: 0 } };
  it('full: the whole street at the scale, at most 4096 px a side', () => {
    const f = renderFrame(street, { view: 'full', scale: 0.25 });
    assert.deepEqual([f.width, f.height, f.scale], [750, 250, 0.25]);
    const big = renderFrame({ bounds: { l: 0, r: 8000, t: -6000, b: 0 } }, { view: 'full', scale: 1 });
    assert.ok(big.width <= 4096 && big.height <= 4096);
  });
  it('camera: the view centred on the world point, kept inside the street', () => {
    const f = renderFrame(street, { view: 'camera', x: 0, y: -300, w: 960, h: 540, scale: 1 });
    assert.deepEqual(f.cam, { x: 1500 - 480, y: 700 - 270 });
    assert.deepEqual([f.width, f.height], [960, 540]);
    const edge = renderFrame(street, { view: 'camera', x: -1500, y: 0, scale: 0.5 });
    assert.deepEqual(edge.cam, { x: 0, y: 1000 - 540 });
  });
  it('grid: every 100 world px, labels where they fit', () => {
    const f = renderFrame(street, { view: 'full', scale: 0.25 });
    const g = gridLines(street, f);
    assert.equal(g.xs.length, 31);
    assert.equal(g.every, 500);
    assert.ok(g.xs.find((x) => x.value === -1500 && x.label));
  });
});

describe('render golden: Hechey Track at scale 0.25 (Chrome, under the browser lock)', { skip: !chromium && 'no playwright' }, () => {
  const renderer = createRenderer({ idleMs: 500, label: 'builder render golden test' });
  after(() => renderer.close());
  const ctx = loadValidatorContext();
  const zone = hecheyZone();

  it('draws the street as the stored picture, within 1% of pixels', { timeout: 300_000 }, async () => {
    const out = await renderer.render(renderInput(zone, 'hechey', ctx, { view: 'full', scale: 0.25, overlay: [] }));
    assert.deepEqual([out.width, out.height], [1500, 250]);
    assert.equal(out.png.subarray(1, 4).toString(), 'PNG');
    if (process.env.GRODDLE_RENDER_GOLDEN_WRITE === '1' || !existsSync(GOLDEN)) writeFileSync(GOLDEN, out.png);
    const d = await renderer.diff(out.png, readFileSync(GOLDEN));
    assert.ok(d.sameSize, 'same size');
    assert.ok(d.ratio < 0.01, `${(d.ratio * 100).toFixed(2)}% of pixels differ`);
  });

  it('overlays draw over it (geometry, grid and findings change the picture)', { timeout: 300_000 }, async () => {
    const out = await renderer.render(renderInput(zone, 'hechey', ctx, { view: 'full', scale: 0.25, overlay: ['geometry', 'grid', 'findings'] }));
    const d = await renderer.diff(out.png, readFileSync(GOLDEN));
    assert.ok(d.ratio > 0.02, `${(d.ratio * 100).toFixed(2)}% differ`);
  });

  it('a fatal finding blocks the render, missing art does not', () => {
    const broken = structuredClone(zone);
    broken.streets[0].street.platforms = [];
    assert.throws(() => renderInput(broken, 'hechey', ctx, {}), (e) => e.code === 'builder_invalid' && e.status === 422);
    assert.ok(RENDERS_ANYWAY.has('AST-001'));
  });
});

describe('honest renders: art left out is named, never dropped silently (lane GROUNDED)', async () => {
  const { leftOutFindings, RENDER_ONLY } = await import('../tools/builder/render.mjs');
  const { callContext } = await import('../tools/builder/worker.mjs');
  const { localArt, parseLeftOut } = await import('../tools/builder/cli.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execFileSync, spawnSync } = await import('node:child_process');
  const { SITE_DIR, skipWithoutSite } = await import('../tools/repos.mjs');
  const sha = (c) => c.repeat(64);
  const zone = () => {
    const z = hecheyZone();
    const st = z.streets[0].street;
    st.layers.find((l) => l.id === 'middleground').decos.push({ id: 'd_new1', sprite: 'gz_ai_rock', x: 100, y: -60, w: 200, h: 100, z: 1, r: 0 });
    st.emitters = [{ id: 'fx_1', kind: 'steam', x: 0, y: -60, sprite: 'gz_ai_puff' }];
    z.assets.gz_ai_rock = { origin: 'new', licence: 'ai-generated', sha256: sha('a'), w: 400, h: 200 };
    z.assets.gz_ai_puff = { origin: 'new', licence: 'ai-generated', sha256: sha('b'), w: 60, h: 60 };
    z.assets.gz_ai_unused = { origin: 'new', licence: 'ai-generated', sha256: sha('c'), w: 60, h: 60 };
    return z;
  };

  it('renderInput puts an AST-007 warning on each piece left out that the street draws, and counts it', () => {
    assert.deepEqual(RENDER_ONLY, ['AST-007']);
    const z = zone();
    const f = leftOutFindings(z.streets[0], 'hechey', [{ name: 'gz_ai_rock', why: 'over the 12 MB of new art a render carries' }, 'gz_ai_puff', 'gz_ai_unused']);
    assert.deepEqual(f.map((x) => [x.rule, x.severity, x.at]), [['AST-007', 'warn', 'hechey/d_new1'], ['AST-007', 'warn', 'hechey/fx_1']]);
    assert.match(f[0].message, /gz_ai_rock was left out of this render \(over the 12 MB of new art a render carries\): it draws as the missing-art placeholder/);
    assert.equal(f[0].where.space, 'screen');
    const ctx = callContext(loadValidatorContext(), { artLeftOut: [{ name: 'gz_ai_rock', why: 'x' }] });
    const input = renderInput(z, 'hechey', ctx, { street: 'hechey', view: 'full', scale: 0.25, overlay: ['findings'], layers: [] });
    assert.ok(input.findings.some((x) => x.rule === 'AST-007'), 'drawn on the findings overlay');
    const plain = renderInput(z, 'hechey', loadValidatorContext(), { street: 'hechey', view: 'full', scale: 0.25, overlay: [], layers: [] });
    assert.equal(input.counts.warn, plain.counts.warn + 1);
  });

  it('the CLI prints the site\'s header as a warning; --art <folder> hands in the zone\'s art by name and names what is missing', () => {
    assert.deepEqual(parseLeftOut('0'), []);
    assert.deepEqual(parseLeftOut('2 gz_ai_a,gz_ai_b').map((x) => x.name), ['gz_ai_a', 'gz_ai_b']);
    const dir = mkdtempSync(join(tmpdir(), 'art-folder-'));
    try {
      writeFileSync(join(dir, 'gz_ai_rock.webp'), Buffer.from('RIFF0000WEBP'));
      writeFileSync(join(dir, 'gz_ai_unused.png'), Buffer.from('png'));
      const got = localArt(zone(), 'hechey', dir);
      assert.deepEqual(got.found.sort(), ['gz_ai_rock', 'gz_ai_unused']);
      assert.deepEqual(got.missing, ['gz_ai_puff'], 'drawn by an effect and not in the folder');
      assert.equal(Buffer.from(got.art[sha('a')], 'base64').toString(), 'RIFF0000WEBP', 'under the row\'s sha256');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the site sends the smallest pieces first up to 12 MB and names the rest (AdminBuilderAgent::pickArt)', { skip: skipWithoutSite || (spawnSync('php', ['-v']).status !== 0 && 'no php') }, () => {
    const z = zone();
    const street = z.streets[0].street;
    street.layers.find((l) => l.id === 'middleground').decos.push({ id: 'd_new2', sprite: 'gz_ai_unused', x: 0, y: -60, w: 10, h: 10, z: 1, r: 0 });
    const code = `require ${JSON.stringify(SITE_DIR)} . '/src/AdminBuilderAgent.php';
      $in = json_decode(stream_get_contents(STDIN), false);
      $sizes = ['${sha('a')}' => 9, '${sha('b')}' => 4, '${sha('c')}' => null];
      [$art, $left] = Groddle\\Minn\\AdminBuilderAgent::pickArt($in->zone, $in->street, fn (string $s): ?string => $sizes[$s] === null ? null : str_repeat('x', $sizes[$s]), 10);
      echo json_encode(['sent' => array_keys($art), 'left' => $left, 'budget' => Groddle\\Minn\\AdminBuilderAgent::ART_BYTES]);`;
    const r = JSON.parse(execFileSync('php', ['-r', code], { input: JSON.stringify({ zone: z, street }) }).toString());
    assert.deepEqual(r.sent, [sha('b')], 'the 4-byte puff fits a 10-byte budget; the 9-byte rock does not');
    assert.deepEqual(r.left, ['gz_ai_rock', 'gz_ai_unused'], 'over the budget, and a kept file that is gone');
    assert.equal(r.budget, 12_000_000);
    const src = readFileSync(join(SITE_DIR, 'src/AdminBuilderAgent.php'), 'utf8');
    assert.match(src, /'X-Builder-Art-Left-Out' => count\(\$left\)/);
    assert.match(src, /'artLeftOut' =>/);
  });
});
