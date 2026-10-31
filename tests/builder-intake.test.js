/**
 * LEVEL BUILDER P5 (spec 9.1, 10, 13, section 14): asset intake, on the site's side
 * (groddle-afternoon-site src/BuilderIntake.php, run here through php -r on fixtures made in this
 * file), and its storage and routes (BuilderAssets, AdminBuilderAssets, BuilderArt, minn.json).
 *
 * The fixtures: a good PNG; an SVG, a GIF and a JPEG; a 5,000 px PNG; a PNG without alpha; a 3x file
 * that is not 1.5 times its 2x file; an animated PNG; a PNG with a bad checksum; a PNG carrying a
 * PHP payload in text chunks, behind its end and in the colour of its transparent pixels, which
 * must come out clean; art that floats over its anchor; square art; a WebP.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { colourStats } from '../public/js/builder/colour-stats.js?v=30f71984';
import { LICENCE_POLICY } from '../public/js/builder/new-art.js?v=b2411f6f';
import { HAS_SITE, SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const src = (f) => readFileSync(sitePath(f), 'utf8');
const PAYLOAD = '<?php system($_GET["c"]); ?>';

/** A PNG chunk. */
function chunk(type, data = Buffer.alloc(0)) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * A PNG from a pixel function (x, y) => [r, g, b, a]. colour 6 is RGBA, 2 is RGB (no alpha).
 * `extra` chunks go before IDAT; `after` bytes follow IEND; `badCrc` breaks IHDR's checksum.
 */
function png(w, h, px, { colour = 6, extra = [], after = null, badCrc = false } = {}) {
  const ch = colour === 6 ? 4 : 3;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * ch + 1)] = 0;
    for (let x = 0; x < w; x += 1) {
      const p = px(x, y);
      for (let c = 0; c < ch; c += 1) raw[y * (w * ch + 1) + 1 + x * ch + c] = p[c];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colour;
  let head = chunk('IHDR', ihdr);
  if (badCrc) head[head.length - 1] ^= 0xff;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), head, ...extra, chunk('IDAT', deflateSync(raw)), chunk('IEND'), ...(after ? [after] : [])]);
}

/** A bush: a green ellipse resting on the file's bottom row, transparent around it (opaque inside, soft rim). */
const bush = (w, h, { lift = 0, colour = [70, 140, 50] } = {}) => (x, y) => {
  const cx = w / 2;
  const rx = w * 0.4;
  const ry = (h - lift) * 0.45;
  const cy = h - lift - ry - 0.5;
  const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
  if (d > 1.15) return [0, 0, 0, 0];
  return [...colour, d > 1 ? 120 : 255];
};

const base = { draft: 'p5-test', licence: 'own-work-CC0', author: 'Austin Ginder', inputs: ['own:a pencil sketch of a bush', 'deco:bush_3'] };
const b64 = (buf) => Buffer.from(buf).toString('base64');

/** Run BuilderIntake::intake on PHP's side; file2/file3 come back as base64. */
function intake(input, ctx = { library: { bush_3: true, tree_1: true } }) {
  const code = `require ${JSON.stringify(SITE_DIR)} . '/src/BuilderIntake.php';
    $in = json_decode(stream_get_contents(STDIN), true);
    $r = Groddle\\Minn\\BuilderIntake::intake($in['in'], $in['ctx']);
    $r['file2'] = $r['file2'] === null ? null : base64_encode($r['file2']);
    $r['file3'] = $r['file3'] === null ? null : base64_encode($r['file3']);
    echo json_encode($r, JSON_UNESCAPED_SLASHES);`;
  return JSON.parse(execFileSync('php', ['-d', 'memory_limit=1G', '-r', code], { input: JSON.stringify({ in: input, ctx }), maxBuffer: 1 << 28 }).toString());
}

/** Pixels of a WebP as PHP's GD reads them: { w, h, rgba (alpha 0-255 from GD's 7 bits) }. */
function gdPixels(webpB64) {
  const code = `$i = imagecreatefromstring(base64_decode(stream_get_contents(STDIN))); $w = imagesx($i); $h = imagesy($i); $o = '';
    for ($y = 0; $y < $h; $y++) for ($x = 0; $x < $w; $x++) { $c = imagecolorat($i, $x, $y); $a = ($c >> 24) & 0x7F; $o .= chr(($c >> 16) & 255) . chr(($c >> 8) & 255) . chr($c & 255) . chr($a === 0 ? 255 : (int) round((127 - $a) * 255 / 127)); }
    echo json_encode(['w' => $w, 'h' => $h, 'rgba' => base64_encode($o)]);`;
  const r = JSON.parse(execFileSync('php', ['-r', code], { input: webpB64, maxBuffer: 1 << 28 }).toString());
  return { w: r.w, h: r.h, rgba: Buffer.from(r.rgba, 'base64') };
}

const codes = (r, severity) => r.report.findings.filter((f) => !severity || f.severity === severity).map((f) => f.code);

describe('asset intake (groddle-afternoon-site src/BuilderIntake.php)', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
  it('a good PNG passes: kept as a lossless WebP, trimmed, registered bottom-centre, with its provenance row', () => {
    const file = png(120, 100, (x, y) => (x < 10 || x > 109 || y < 15 ? [0, 0, 0, 0] : bush(120, 100)(x, y)));
    const r = intake({ ...base, name: 'gz_mossy_bush', role: 'middleground', file2: b64(file) });
    assert.equal(r.ok, true, JSON.stringify(r.report.findings));
    assert.deepEqual(codes(r, 'refuse'), []);
    assert.deepEqual(codes(r, 'warn'), []);
    const kept = Buffer.from(r.file2, 'base64');
    assert.equal(kept.subarray(0, 4).toString('latin1'), 'RIFF');
    assert.equal(kept.subarray(8, 16).toString('latin1'), 'WEBPVP8L', 'lossless WebP, nothing else');
    assert.equal(r.report.sha256, createHash('sha256').update(kept).digest('hex'));
    const { trim, registration, kept: size } = r.report;
    assert.equal(trim.b, 0, 'never the bottom');
    assert.equal(trim.l, trim.r, 'the sides evenly');
    assert.ok(trim.t > 0 && trim.l > 0);
    assert.deepEqual(registration, { x: size.w / 2, y: size.h });
    assert.deepEqual(Object.keys(r.asset), ['origin', 'licence', 'source', 'author', 'sha256', 'w', 'h', 'registration', 'inputs', 'intake']);
    assert.equal(r.asset.origin, 'new');
    assert.equal(r.asset.licence, 'own-work-CC0');
    assert.deepEqual(r.asset.inputs, base.inputs);
    assert.equal(r.asset.intake, `in-${r.report.sha256.slice(0, 16)}`);
    assert.ok(r.report.colour.s > 0.3 && r.report.colour.hue[3] > 0.9, 'green');
  });

  it('refuses an SVG, a GIF and a JPEG: PNG or WebP only, read from the bytes', () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    for (const [bytes, said] of [[svg, /SVG/], [Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'), /GIF/], [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), /JPEG/]]) {
      const r = intake({ ...base, name: 'gz_thing', file2: b64(bytes) });
      assert.equal(r.ok, false);
      assert.deepEqual(codes(r), ['type']);
      assert.match(r.report.findings[0].message, said);
      assert.match(r.report.findings[0].message, /PNG or WebP only/);
      assert.equal(r.file2, null);
    }
  });

  it('refuses a 5,000 px file from its header, before decoding, and a file under 8 px', () => {
    const wide = png(5000, 8, () => [0, 0, 0, 0]);
    const r = intake({ ...base, name: 'gz_wide', file2: b64(wide) });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), ['too_big']);
    assert.match(r.report.findings[0].message, /5000 by 8 px; at most 4096 px a side/);
    assert.deepEqual(codes(intake({ ...base, name: 'gz_tiny', file2: b64(png(6, 6, () => [1, 2, 3, 255])) })), ['too_small']);
  });

  it('warns on a file without alpha (it draws as a rectangle), and only notes it for a sky', () => {
    const rgb = png(64, 48, (x, y) => [x * 4, y * 5, 90], { colour: 2 });
    const r = intake({ ...base, name: 'gz_solid_wall', role: 'middleground', file2: b64(rgb) });
    assert.equal(r.ok, true);
    assert.deepEqual(codes(r, 'warn'), ['no_alpha']);
    assert.match(r.report.findings.find((f) => f.code === 'no_alpha').message, /no transparency/);
    const sky = intake({ ...base, name: 'gz_solid_sky', role: 'sky', file2: b64(rgb) });
    assert.deepEqual(codes(sky, 'warn'), []);
    assert.ok(codes(sky, 'info').includes('no_alpha'));
  });

  it('refuses a mislabelled 3x file and keeps a right one, trimmed to match', () => {
    const two = png(100, 80, bush(100, 80));
    const bad = intake({ ...base, name: 'gz_bush_three', file2: b64(two), file3: b64(png(140, 120, bush(140, 120))) });
    assert.equal(bad.ok, false);
    assert.deepEqual(codes(bad), ['scale_3x']);
    assert.match(bad.report.findings[0].message, /must be 150 by 120 \(within 1 px\)/);
    const good = intake({ ...base, name: 'gz_bush_three', file2: b64(two), file3: b64(png(151, 120, bush(151, 120))) });
    assert.equal(good.ok, true, JSON.stringify(good.report.findings));
    const p3 = gdPixels(good.file3);
    assert.equal(p3.w, Math.round(good.report.kept.w * 1.5));
    assert.equal(p3.h, Math.round(good.report.kept.h * 1.5));
  });

  it('a PNG with a PHP payload comes out clean: text chunks, trailing bytes and hidden colour all gone', () => {
    const text = (k, v) => chunk('tEXt', Buffer.from(`${k}\0${v}`, 'latin1'));
    // The payload's bytes also sit in the colour of fully transparent pixels.
    const code = Buffer.from(PAYLOAD, 'latin1');
    const file = png(96, 64, (x, y) => {
      const p = bush(96, 64)(x, y);
      if (p[3]) return p;
      const i = (y * 96 + x) * 3;
      return [code[i % code.length], code[(i + 1) % code.length], code[(i + 2) % code.length], 0];
    }, { extra: [text('Comment', PAYLOAD), chunk('zTXt', Buffer.concat([Buffer.from('Raw\0\0', 'latin1'), deflateSync(Buffer.from(PAYLOAD))])), chunk('iTXt', Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${PAYLOAD}`, 'latin1'))], after: Buffer.from(`\n${PAYLOAD}\n`, 'latin1') });
    assert.ok(file.includes(PAYLOAD), 'the fixture carries it');
    const r = intake({ ...base, name: 'gz_innocent_bush', file2: b64(file) });
    assert.equal(r.ok, true, JSON.stringify(r.report.findings));
    const kept = Buffer.from(r.file2, 'base64');
    for (const needle of ['<?php', '<?', 'system(', 'tEXt', 'zTXt', 'iTXt', 'EXIF', 'XMP']) assert.equal(kept.includes(Buffer.from(needle, 'latin1')), false, needle);
    assert.equal(kept.subarray(12, 16).toString('latin1'), 'VP8L', 'one image chunk');
    assert.equal(kept.readUInt32LE(4) + 8, kept.length, 'nothing after it');
    assert.deepEqual(r.report.file2.stripped.map((s) => s.split(' ')[0]), ['tEXt', 'zTXt', 'iTXt', 'bytes']);
    const { rgba } = gdPixels(r.file2);
    let hidden = 0;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] === 0 && (rgba[i] || rgba[i + 1] || rgba[i + 2])) hidden += 1;
    assert.equal(hidden, 0, 'transparent pixels are transparent black');
  });

  it('refuses an animated PNG and a PNG that fails its checksum', () => {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(2, 0);
    assert.deepEqual(codes(intake({ ...base, name: 'gz_anim', file2: b64(png(16, 16, bush(16, 16), { extra: [chunk('acTL', actl)] })) })), ['animated']);
    const crc = intake({ ...base, name: 'gz_broken', file2: b64(png(16, 16, bush(16, 16), { badCrc: true })) });
    assert.deepEqual(codes(crc), ['malformed']);
    assert.match(crc.report.findings[0].message, /checksum/);
  });

  it('warns when art floats over its anchor, and when it has square edges (not on sky or bg)', () => {
    // A lamp whose lowest visible row is 12 px above the file's bottom.
    const lamp = (x, y) => (y < 68 && Math.hypot(x - 40, y - 40) < 28 ? [250, 220, 120, 255] : [0, 0, 0, 0]);
    const floats = intake({ ...base, name: 'gz_lamp', file2: b64(png(80, 80, lamp)) });
    assert.equal(floats.ok, true);
    assert.deepEqual(codes(floats, 'warn'), ['floats']);
    assert.equal(floats.report.findings[0].data.gap, 12);
    assert.equal(floats.report.trim.b, 0, 'the gap is kept: the artist may mean it to hang');
    const box = (x, y) => (x >= 8 && x < 72 && y >= 10 ? [200, 120, 60, 255] : [0, 0, 0, 0]);
    const square = intake({ ...base, name: 'gz_crate', role: 'middleground', file2: b64(png(80, 60, box)) });
    assert.deepEqual(codes(square, 'warn'), ['square_edges']);
    assert.equal(square.report.edge.share, 1);
    assert.deepEqual(codes(intake({ ...base, name: 'gz_far_crate', role: 'bg', file2: b64(png(80, 60, box)) }), 'warn'), []);
  });

  it('refuses incomplete or non-CC0 provenance, and names that break the rules', () => {
    const file = b64(png(40, 40, bush(40, 40)));
    const refusals = (extra) => codes(intake({ ...base, name: 'gz_ai_moss', file2: file, ...extra }), 'refuse');
    assert.deepEqual(refusals({ licence: 'ai-generated' }), ['tool', 'prompt']);
    assert.deepEqual(refusals({ licence: 'ai-generated', tool: 'An image model 2', prompt: 'a mossy stump in a paper cutout style' }), []);
    assert.deepEqual(refusals({ licence: 'CC-BY-4.0' }), ['licence']);
    assert.deepEqual(refusals({ licence: 'CC0-1.0' }), ['licence'], 'CC0-1.0 is the library\'s');
    assert.deepEqual(refusals({ licence: 'own-work-CC0', name: 'gz_moss', author: '' }), ['author']);
    assert.deepEqual(refusals({ licence: 'own-work-CC0', name: 'gz_moss', inputs: ['https://example.com/art.png'] }), ['inputs']);
    assert.deepEqual(refusals({ licence: 'own-work-CC0', name: 'gz_moss', inputs: ['deco:not_a_deco'] }), ['inputs']);
    assert.deepEqual(refusals({ licence: 'own-work-CC0' }), ['name_ai'], 'gz_ai_ is for AI art');
    assert.deepEqual(refusals({ licence: 'ai-generated', name: 'gz_moss', tool: 't', prompt: 'p' }), ['name_ai']);
    assert.deepEqual(refusals({ licence: 'own-work-CC0', name: 'Gz_Moss' }), ['name']);
    assert.deepEqual(refusals({ licence: 'own-work-CC0', name: 'bush_3' }), ['name']);
  });

  it('takes a WebP, and its style is measured against the role (info only)', () => {
    const webp = execFileSync('php', ['-r', `$i = imagecreatetruecolor(64, 64); imagealphablending($i, false); imagesavealpha($i, true); imagefilledrectangle($i, 0, 0, 63, 63, 0x7F000000); imagefilledellipse($i, 32, 40, 50, 48, 0x00E040C0); ob_start(); imagewebp($i, null, 101); echo base64_encode(ob_get_clean());`]).toString();
    const ctx = { library: {}, palette: { middleground: { l: [0.2, 0.3, 0.54], s: [0.17, 0.33, 0.59], hue: [0.1, 0.56, 0.2, 0.05, 0, 0, 0.04, 0.05, 0, 0, 0, 0] } } };
    const r = intake({ ...base, inputs: [], name: 'gz_pink_blob', role: 'middleground', file2: webp }, ctx);
    assert.equal(r.ok, true, JSON.stringify(r.report.findings));
    assert.equal(r.report.file2.type, 'webp');
    assert.ok(codes(r, 'info').includes('style_hue'), 'pink is not a middleground hue');
    assert.ok(r.report.findings.filter((f) => f.check === 'style').every((f) => f.severity === 'info'));
  });

  it('measures colour as js/builder/colour-stats.js does (GD keeps alpha in 7 bits)', () => {
    const r = intake({ ...base, name: 'gz_measure', file2: b64(png(90, 70, (x, y) => (y < 10 ? [0, 0, 0, 0] : [(x * 3) & 255, (y * 7) & 255, (x * y) & 255, 40 + ((x + y) % 216)]))) });
    const { w, h, rgba } = gdPixels(r.file2);
    const js = colourStats(rgba, w, h);
    for (const k of ['l', 's', 'cover']) assert.ok(Math.abs(js[k] - r.report.colour[k]) <= 0.01, `${k} ${js[k]} vs ${r.report.colour[k]}`);
    js.hue.forEach((v, i) => assert.ok(Math.abs(v - r.report.colour.hue[i]) <= 0.02, `hue ${i}`));
  });

  it('holds the licence policy the same in tools/builder/licence-policy.json, js/builder/new-art.js and BuilderIntake::LICENCES', () => {
    const policy = JSON.parse(readFileSync(join(root, 'tools/builder/licence-policy.json'), 'utf8'));
    assert.deepEqual(JSON.parse(JSON.stringify(LICENCE_POLICY.licences)), policy.licences);
    assert.equal(LICENCE_POLICY.newArtName, policy.newArtName);
    assert.equal(LICENCE_POLICY.newArtNameMax, policy.newArtNameMax);
    assert.equal(LICENCE_POLICY.inputsMax, policy.inputs.max);
    const php = JSON.parse(execFileSync('php', ['-r', `require ${JSON.stringify(SITE_DIR)} . '/src/BuilderIntake.php'; use Groddle\\Minn\\BuilderIntake as I; echo json_encode(['licences' => I::LICENCES, 'name' => I::NAME, 'max' => I::NAME_MAX, 'inputs' => I::INPUTS_MAX]);`]).toString());
    assert.deepEqual(php.licences, policy.licences);
    assert.equal(php.name, `/${policy.newArtName.replace('(_', '(?:_')}/`);
    assert.equal(php.max, policy.newArtNameMax);
    assert.equal(php.inputs, policy.inputs.max);
    assert.deepEqual(Object.keys(policy.licences), ['CC0-1.0', 'own-work-CC0', 'ai-generated'], 'CC0 1.0 dedications only (spec 10)');
  });
});

describe('new art on the site: table, routes, the art page and the store check', { skip: skipWithoutSite }, () => {
  it('declares groddle_builder_assets additively (minn.json 0.5.25)', () => {
    const manifest = JSON.parse(src('minn.json'));
    const cols = manifest.tables.groddle_builder_assets.map((l) => l.split(' ')[0]);
    assert.deepEqual(cols.slice(0, 14), ['name', 'sha256', 'draft_id', 'origin', 'licence', 'meta', 'file2', 'file3', 'width', 'height', 'bytes', 'report', 'created_by', 'created_at']);
    assert.ok(manifest.tables.groddle_builder_assets.includes('PRIMARY KEY  (name)'));
    assert.ok(manifest.tables.groddle_builder_assets.includes('UNIQUE KEY sha256 (sha256)'));
    assert.match(manifest.tables.groddle_builder_assets.find((l) => l.startsWith('file2 ')), /mediumblob NOT NULL/);
    const [maj, min, patch] = manifest.version.split('.').map(Number);
    assert.ok(maj > 0 || min > 5 || (min === 5 && patch >= 25), manifest.version);
  });

  it('every asset route is an administrator\'s or a key\'s with its scope (BuilderAuth), gated by the option, and registered', () => {
    const s = src('src/AdminBuilderAssets.php');
    const routes = [...s.matchAll(/#\[Route\(Method::(\w+), self::BASE \. '([^']+)', policy: new Policy\(([^)]*)\)\)\]\s*public function (\w+)\(/g)];
    assert.deepEqual(routes.map((r) => `${r[1]} ${r[2]}`).sort(), ['Get /assets', 'Get /assets/{key:[a-z0-9_]+}', 'Post /assets']);
    for (const [, , path, policy, fn] of routes) {
      assert.equal(policy, 'Access::Public', path);
      const body = s.slice(s.indexOf(`public function ${fn}(`));
      assert.match(body.slice(0, body.indexOf('{') + 90), fn === 'intake' ? /\$this->gate\(\$request, 'assets:write', 'write'\)/ : /\$this->gate\(\$request, 'drafts:read'\)/, fn);
    }
    assert.match(s, /new BuilderAuth\(\$this->minn\)\)->gate\(/);
    assert.match(src('src/BuilderAuth.php'), /AdminBuilder::enabled\(\$this->minn\)/);
    assert.match(s, /BuilderIntake::intake\(\$body/);
    assert.match(s, /builder_asset_refused/);
    const ext = src('src/Extension.php');
    assert.match(ext, /new AdminBuilderAssets\(\$minn\)/);
    assert.match(ext, /routes\(new BuilderArt\(\$minn\)\)/);
  });

  it('serves kept art only as image/webp, to administrators, with nosniff and a closed CSP (spec 13)', () => {
    const s = src('src/BuilderArt.php');
    const handler = s.slice(s.indexOf('public function art('));
    const order = ['AdminBuilder::enabled', '$user === null', "can($user->id, 'manage_options')", "!== 'RIFF'", "!== 'WEBP'", 'self::headers('];
    let at = 0;
    for (const bit of order) {
      const i = handler.indexOf(bit, at);
      assert.ok(i >= at, `${bit} in order`);
      at = i;
    }
    assert.equal((handler.match(/throw new RouteMiss\(\)/g) || []).length, 3, 'every miss is the site 404');
    assert.match(s, /'Content-Type' => 'image\/webp'/);
    assert.match(s, /'X-Content-Type-Options' => 'nosniff'/);
    assert.match(s, /'Content-Security-Policy' => "default-src 'none'; sandbox"/);
    assert.match(s, /'Cache-Control' => 'private, no-store'/);
    assert.match(s, /'\/builder-art\/\{sha:\[0-9a-f\]\{64\}\}'/);
  });

  it('keeps bytes in the database as intake wrote them, and a draft cannot make up provenance', () => {
    const a = src('src/BuilderAssets.php');
    assert.match(a, /FROM_BASE64\(\?\)/);
    assert.match(a, /builder_asset_name_taken', [^;]+, 409/);
    assert.match(a, /public const PER_DRAFT = 200;/);
    assert.match(a, /never came in through asset intake/);
    assert.match(a, /cannot be changed by an edit/);
    const store = src('src/BuilderStore.php');
    assert.ok(store.indexOf('->checkZone($zone)') > store.indexOf('BuilderOps::check($zone, $id)') && store.indexOf('->checkZone($zone)') < store.indexOf('$json = BuilderOps::encode($zone);\n            if (strlen'), 'checked before anything is kept');
    assert.ok(HAS_SITE);
  });
});
