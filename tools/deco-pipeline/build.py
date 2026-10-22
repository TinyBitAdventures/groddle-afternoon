#!/usr/bin/env python3.11
"""Street deco textures as WebP at 2x and 3x, rendered from Tiny Speck's SWFs (register row G31).

Every street deco ships as public/assets/decos/groddle/<name>.webp (the 2x art, the same pixel size
as the old PNG) and, where a sharper copy pays off, <name>@1.5x.webp (the 3x art). A deco's logical
size in Pixi stays the old PNG's pixel size, so the 3x file carries resolution 1.5 in its name
(js/textures.js reads `@1.5x`); js/deco-hires.js routes the game's `assets/decos/groddle/<name>.png`
URLs to the right file for the screen.

Sources
- The deco SWF that the street bundle embeds (tinyspeck/glitch-locations, CC0; see
  tools/deco-audit/audit.py bundle_index), rendered once per deco with FFDec at zoom 3 (more for
  decos whose PNG was drawn denser than 2x). The client scaled the SWF stage to the placed w x h, so
  the render's stage rectangle is resampled (Lanczos) onto the 2x and 3x pixel sizes.
- assets-src/decos/groddle/<name>.png: the PNGs the game shipped until G31 (Children of Ur
  _png-2x exports plus the deco audit's re-renders). Not shipped; used as the reference every SWF
  render is compared against, and as the pixels of the decos kept as they were:
  verdicts.json `kept` (FFDec misrenders, animated first frames, the ambiguous Ix decos), decos
  with no SWF, and decos whose SWF render differs from the PNG by more than anti-aliasing and
  gradient noise (`same_colour` / `same_alpha`) unless FFDec's two renderers (raster, and SVG drawn
  by Chromium, --svgcheck) agree, which means the PNG was other art and the SWF wins
  (`corrected`). Kept decos get no 3x file. Small art offsets between the PNG and the SWF stage
  (`shift`, up to a few px) follow the SWF: that is where the client drew the art.

3x files are left out where they cannot be seen: decos only placed on blurred layers (baked at half
resolution), decos every street places at 2/3 of the PNG size or less (the 2x file already has 3
texels per world pixel), decos whose 3x render adds almost nothing over the 2x one upscaled
(skies, soft gradients), and 3x renders over 8192 px on a side. 3x files over 4096 px are flagged
`big`: the runtime only uses them where the GPU takes 8192 px textures.

WebP: lossy quality 82, sharp YUV, lossless alpha; lossless where the lossy file's mean error over
visible pixels is over 4.5 (small art with hard edges).

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp 1.6):
  python3.11 -I tools/deco-pipeline/build.py --work <scratch dir> [--only a,b] [--batch 60] [--force]
  python3.11 -I tools/deco-pipeline/build.py --svgcheck --work <scratch dir>   (then build again)
  python3.11 -I tools/deco-pipeline/build.py --check        (no rendering; exit 1 on any problem)
The build is incremental: a deco is redone when its SWF, source PNG or the settings change.
plan.json records every deco's inputs, mode, metrics and output hashes; --write-js regenerates
js/deco-hires-list.js from it. A full build is about an hour on a busy machine (it pauses while
the load average is over --max-load). Glitch-locations is data only: SWFs are read by FFDec, never executed.
"""
import argparse, collections, concurrent.futures, glob, hashlib, json, math, os, shutil, struct, subprocess, sys, time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
sys.dont_write_bytecode = True  # no __pycache__ in tools/
sys.path.insert(0, os.path.join(SPIKE, 'tools', 'deco-audit'))
sys.path.insert(0, os.path.join(SPIKE, 'tools', 'icon-hires'))
import audit  # noqa: E402
import swfinfo  # noqa: E402

PUBLIC = os.path.join(SPIKE, 'public')
SRC = os.environ.get('DECO_SRC') or os.path.join(SPIKE, 'assets-src', 'decos', 'groddle')
OUT = os.environ.get('DECO_OUT') or os.path.join(PUBLIC, 'assets', 'decos', 'groddle')
MANIFEST = os.path.join(PUBLIC, 'assets', 'decos', 'manifest.json')
STREETS = os.path.join(PUBLIC, 'assets', 'streets')
PLAN = os.path.join(HERE, 'plan.json')
HIRES_JS = os.path.join(PUBLIC, 'js', 'deco-hires-list.js')
VERDICTS = os.path.join(SPIKE, 'tools', 'deco-audit', 'verdicts.json')
JAVA = audit.JAVA
FFDEC = audit.FFDEC

SETTINGS = {
    'version': 1,
    'zoom': 3,              # FFDec zoom for the render both sizes come from (more for denser PNGs)
    'quality': 82,          # cwebp lossy quality (sharp_yuv, method 4, lossless alpha)
    'lossless_over': 4.5,   # mean premultiplied error (0-255) over visible pixels above which lossless is used
    'same_colour': 8.0,     # SWF render vs PNG: mean premultiplied RGB difference (0-255, 2x2 box)
    'same_alpha': 12.0,     #                    mean alpha difference (0-255, 2x2 box)
    'svg_colour': 4.0,      # FFDec raster vs FFDec SVG (--svgcheck), same measures
    'svg_alpha': 5.0,
    'min_gain': 6.0,        # 3x render vs 2x upscaled: 99th percentile difference (0-255, visible px) to ship 3x
    'dense': 2.9,           # texels per world pixel at which the 2x file is already enough
    'max_3x': 8192,         # longest side of a 3x file
    'big_3x': 4096,         # 3x files longer than this only load where MAX_TEXTURE_SIZE allows
}


# ---------- inputs ----------

def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def png_size(path):
    b = open(path, 'rb').read(24)
    return list(struct.unpack('>II', b[16:24]))


def tool_versions():
    cw = subprocess.run(['cwebp', '-version'], capture_output=True, text=True).stdout.split()[0]
    jar = os.path.realpath(FFDEC)
    return {'cwebp': cw, 'ffdec_jar_sha': sha(jar)[:16]}


def placement_stats():
    """sprite -> {count, density (lowest texels per world pixel over placements, from the PNG size),
    blurred_only}. Decos are drawn stretched to their placed w x h."""
    idx = json.load(open(os.path.join(STREETS, 'index.json')))
    out = {}
    for meta in idx.get('streets', {}).values():
        path = os.path.join(PUBLIC, meta['file'])
        if not os.path.exists(path):
            continue
        street = json.load(open(path))
        for layer in street.get('layers') or []:
            blurred = (Number(layer.get('filters') or {}, 'blur')) > 0
            for d in layer.get('decos') or []:
                sp = d.get('sprite')
                if not sp:
                    continue
                e = out.setdefault(sp, {'count': 0, 'sizes': collections.Counter(), 'sharp': 0})
                e['count'] += 1
                e['sizes'][(abs(d.get('w') or 0), abs(d.get('h') or 0))] += 1
                if not blurred:
                    e['sharp'] += 1
    return out


def Number(obj, key):
    try:
        return float(obj.get(key) or 0)
    except (TypeError, ValueError):
        return 0.0


def density(size2, sizes):
    """Lowest texels per world pixel the 2x file gives over the given placed sizes (None: unplaced)."""
    best = None
    for (w, h) in sizes:
        if not w or not h:
            continue
        d = min(size2[0] / w, size2[1] / h)
        best = d if best is None else min(best, d)
    return best


# ---------- images ----------

def load(path):
    im = Image.open(path)
    im.load()
    return im.convert('RGBA')


def premult(a):
    """uint8 RGBA image -> float32 premultiplied RGBA array (0-255)."""
    x = np.asarray(a, dtype=np.float32)
    x[..., :3] *= x[..., 3:4] / 255
    return x


def box2(x):
    h, w = x.shape[0] // 2 * 2, x.shape[1] // 2 * 2
    x = x[:h, :w]
    return (x[0::2, 0::2] + x[1::2, 0::2] + x[0::2, 1::2] + x[1::2, 1::2]) / 4


def compare(a, b):
    """Mean premultiplied colour and alpha difference (0-255) after a 2x2 box filter, which keeps
    anti-aliasing noise out of it; a and b are RGBA images of one size."""
    x, y = box2(premult(a)), box2(premult(b))
    if not x.size:
        return 0.0, 0.0
    d = np.abs(x - y)
    return round(float(d[..., :3].mean()), 3), round(float(d[..., 3].mean()), 3)


def best_shift(a, b, r=3):
    """Integer (dx, dy) within r px that best aligns b's alpha onto a's (for the report)."""
    x = np.asarray(a, dtype=np.float32)[..., 3]
    y = np.asarray(b, dtype=np.float32)[..., 3]
    best, at = None, (0, 0)
    h, w = x.shape
    if h <= 2 * r or w <= 2 * r:
        return [0, 0]
    core = x[r:h - r, r:w - r]
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            e = float(np.abs(core - y[r + dy:h - r + dy, r + dx:w - r + dx]).mean())
            if best is None or e < best - 1e-6:
                best, at = e, (dx, dy)
    return list(at)


def visible_error(a, b):
    """Per-pixel largest premultiplied channel difference (0-255) over pixels visible in a."""
    e = np.abs(premult(a) - premult(b)).max(axis=2)
    vis = np.asarray(a)[..., 3] > 8
    return e[vis] if vis.any() else e.ravel()


def gain_3x(img3, img2):
    """How much the 3x render adds over the 2x file drawn at 3x (bicubic upscale): the 99th
    percentile difference over visible pixels, 0-255. Edges of vector art score 8-120; skies,
    glows and blurs, whose 2x file upscales without loss, score under 4."""
    up = img2.resize(img3.size, Image.BICUBIC)
    return round(float(np.percentile(visible_error(img3, up), 99)), 1)


def stage_resample(render, stage, zoom, size):
    """The render's stage rectangle (stage w x h at `zoom`, from the origin) resampled to size."""
    box = (0, 0, min(render.width, stage[0] * zoom), min(render.height, stage[1] * zoom))
    return render.resize(tuple(size), Image.LANCZOS, box=box)


# ---------- WebP ----------

def cwebp(src_png, dst, lossless=False, quality=None):
    args = ['cwebp', '-quiet', '-metadata', 'none']
    if lossless:
        args += ['-lossless', '-z', '6']
    else:
        args += ['-q', str(quality), '-m', '4', '-sharp_yuv', '-alpha_q', '100', '-alpha_filter', 'best']
    subprocess.run(args + [src_png, '-o', dst], check=True)


def decode_webp(path):
    im = Image.open(path)
    im.load()
    return im.convert('RGBA')


def encode(img, dst, tmp):
    """Lossy WebP unless it shows artefacts (mean premultiplied error over visible pixels above
    `lossless_over`), then lossless. Returns (bytes, lossless, error)."""
    os.makedirs(tmp, exist_ok=True)
    base = os.path.join(tmp, os.path.basename(dst))
    png = base + '.png'
    img.save(png, compress_level=1)
    cwebp(png, dst, quality=SETTINGS['quality'])
    err = visible_error(img, decode_webp(dst))
    p999 = round(float(err.mean()), 2) if err.size else 0.0
    lossless = False
    if p999 > SETTINGS['lossless_over']:
        cwebp(png, dst, lossless=True)
        lossless = True
    os.remove(png)
    return os.path.getsize(dst), lossless, p999


# ---------- FFDec ----------

def ffdec(*args, heap='4g'):
    r = subprocess.run([JAVA, '-Djava.awt.headless=true', f'-Xmx{heap}', '-jar', FFDEC, *map(str, args)],
                       capture_output=True, text=True)
    return r.returncode


def render_batch(work, zoom, items):
    """items [(name, swf)] -> {name: render png}; one JVM per batch."""
    tag = f'z{zoom}'
    src = os.path.join(work, f'src-{tag}')
    out = os.path.join(work, f'out-{tag}')
    shutil.rmtree(out, ignore_errors=True)
    audit.link_batch(src, items)
    ffdec('-zoom', zoom, '-ignorebackground', '-select', 1, '-format', 'frame:png', '-export', 'frame', out, src)
    found = {n: os.path.join(out, n + '.swf', '1.png') for n, _ in items
             if os.path.exists(os.path.join(out, n + '.swf', '1.png'))}
    return found, [src, out]


# ---------- plan ----------

def read_plan():
    if not os.path.exists(PLAN):
        return {'settings': None, 'decos': {}}
    p = json.load(open(PLAN))
    p['decos'] = {r['name']: r for r in p['decos']}
    return p


def write_plan(plan):
    rows = [plan['decos'][n] for n in sorted(plan['decos'])]
    head = {k: v for k, v in plan.items() if k != 'decos'}
    head['summary'] = summarize(rows)
    with open(PLAN, 'w') as f:
        f.write(json.dumps(head, separators=(',', ':'))[:-1] + ',"decos":[\n')
        f.write(',\n'.join(json.dumps(r, separators=(',', ':')) for r in rows))
        f.write('\n]}\n')


def summarize(rows):
    s = collections.Counter()
    b = collections.Counter()
    for r in rows:
        s['mode_' + r.get('mode', '?')] += 1
        if r.get('hires'):
            s['hires'] += 1
            if r.get('big'):
                s['hires_big'] += 1
        elif r.get('no_hires'):
            s['no_hires_' + r['no_hires'].split(':')[0]] += 1
        for k in ('bytes2', 'bytes3'):
            b[k] += r.get(k) or 0
        b['src_bytes'] += r.get('src_bytes') or 0
        if r.get('lossless2') or r.get('lossless3'):
            s['lossless'] += 1
    return {**dict(s), **{k: v for k, v in b.items()}}


# Thresholds that only pick between the SWF render and the PNG (see expect_swf) stay out of the key.
DECISION = ('same_colour', 'same_alpha', 'svg_colour', 'svg_alpha')


def same_art(diff):
    return diff[0] <= SETTINGS['same_colour'] and diff[1] <= SETTINGS['same_alpha']


def expect_swf(row):
    """Would the current thresholds ship this built row's SWF render? (None: not measured.)"""
    if row.get('diff') is None:
        return None
    return same_art(row['diff']) or bool(row.get('svg_ok'))


def inputs_key(name, mode, swf_sha, src_sha, svg_ok=None):
    keep = {k: SETTINGS[k] for k in SETTINGS if k not in DECISION}
    return hashlib.sha256(json.dumps([name, mode, swf_sha, src_sha, svg_ok, keep], sort_keys=True).encode()).hexdigest()[:20]


def base_decisions():
    """name -> dict(mode, reason, swf label, stage, size2, size3, density, blurred_only, no_hires)."""
    report = {r['name']: r for r in json.load(open(audit.REPORT))['decos']}
    verdicts = json.load(open(VERDICTS))
    names = json.load(open(MANIFEST))
    place = placement_stats()
    out = {}
    for n in names:
        src = os.path.join(SRC, n + '.png')
        if not os.path.exists(src):
            raise SystemExit(f'{n}: no source PNG at {src}')
        size2 = png_size(src)
        size3 = [max(1, round(size2[0] * 1.5)), max(1, round(size2[1] * 1.5))]
        r = report.get(n) or {}
        p = place.get(n)
        d = {'name': n, 'size2': size2, 'placed': p['count'] if p else 0}
        dens = density(size2, p['sizes']) if p else None
        d['density'] = round(dens, 2) if dens else None
        if n in verdicts['kept']:
            d.update(mode='png', reason='kept: ' + verdicts['kept'][n]['verdict'])
        elif r.get('status') != 'scored':
            d.update(mode='png', reason='no SWF' if r.get('status') == 'no-swf' else 'not scored')
        else:
            d.update(mode='swf', swf=r['swf'], stage=r['stage'])
        if d['mode'] == 'png':
            d['no_hires'] = 'png'
        elif p and p['sharp'] == 0:
            d['no_hires'] = 'blurred: only placed on blurred layers (baked at half resolution)'
        elif dens and dens >= SETTINGS['dense']:
            d['no_hires'] = f'dense: every placement already gets {dens:.2f} texels per world pixel'
        elif max(size3) > SETTINGS['max_3x']:
            d['no_hires'] = f'size: 3x would be {size3[0]}x{size3[1]}'
        d['size3'] = None if d.get('no_hires') else size3
        out[n] = d
    return out


def render_zoom(d):
    """FFDec zoom that gives at least the largest output's density over the stage."""
    sw, sh = d['stage']
    target = d['size3'] or d['size2']
    need = max(target[0] / max(sw, 1e-3), target[1] / max(sh, 1e-3))
    return max(SETTINGS['zoom'], math.ceil(need - 0.02))


def process(work, d, render_png, plan_row_extra):
    """Make both WebPs for one SWF deco from its render; fall back to the PNG when they differ."""
    n = d['name']
    src = load(os.path.join(SRC, n + '.png'))
    ren = load(render_png)
    z = d['zoom']
    img2 = stage_resample(ren, d['stage'], z, d['size2'])
    c, a = compare(img2, src)
    d['diff'] = [c, a]
    d['shift'] = best_shift(src, img2)
    same = same_art(d['diff'])
    if not same and not d.get('svg_ok'):
        # Differs from the PNG: keep the PNG until --svgcheck shows FFDec's renders agree.
        d['mode'] = 'png'
        d['reason'] = 'differs: SWF render differs from the PNG (run --svgcheck)'
        d['no_hires'] = 'png'
        d['size3'] = None
        return emit_png(work, d, src)
    if not same:
        d['reason'] = 'corrected: the bundle SWF differs from the old PNG; FFDec raster and SVG agree'
    else:
        d['reason'] = 'swf'
    tmp = os.path.join(work, 'enc')
    out2 = os.path.join(OUT, n + '.webp')
    d['bytes2'], d['lossless2'], d['err2'] = encode(img2, out2, tmp)
    d['sha2'] = sha(out2)[:16]
    out3 = os.path.join(OUT, n + '@1.5x.webp')
    if d['size3']:
        img3 = stage_resample(ren, d['stage'], z, d['size3'])
        d['gain'] = gain_3x(img3, img2)
        if d['gain'] < SETTINGS['min_gain']:
            d['no_hires'] = f"flat: 3x adds {d['gain']} over the 2x file upscaled"
            d['size3'] = None
        else:
            d['bytes3'], d['lossless3'], d['err3'] = encode(img3, out3, tmp)
            d['sha3'] = sha(out3)[:16]
            d['big'] = max(d['size3']) > SETTINGS['big_3x']
    if not d['size3']:
        for k in ('bytes3', 'lossless3', 'err3', 'sha3', 'big'):
            d.pop(k, None)
        if os.path.exists(out3):
            os.remove(out3)
    d['hires'] = bool(d['size3'])
    return d


def emit_png(work, d, src=None):
    n = d['name']
    src = src or load(os.path.join(SRC, n + '.png'))
    out2 = os.path.join(OUT, n + '.webp')
    d['bytes2'], d['lossless2'], d['err2'] = encode(src, out2, os.path.join(work, 'enc'))
    d['sha2'] = sha(out2)[:16]
    d['hires'] = False
    out3 = os.path.join(OUT, n + '@1.5x.webp')
    if os.path.exists(out3):
        os.remove(out3)
    for k in ('bytes3', 'lossless3', 'err3', 'sha3', 'big', 'gain'):
        d.pop(k, None)
    return d


def cmd_build(args):
    work = args.work
    os.makedirs(work, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    plan = read_plan()
    plan['settings'] = SETTINGS
    plan['tools'] = tool_versions()
    plan['generated'] = time.strftime('%Y-%m-%d')
    base = base_decisions()
    only = set(args.only.split(',')) if args.only else None
    index = audit.bundle_index()
    todo_png, todo_swf = [], []
    for n, d in base.items():
        if only and n not in only:
            continue
        src_sha = sha(os.path.join(SRC, n + '.png'))
        swf_sha = None
        if d['mode'] == 'swf':
            swf = audit.swf_path(d['swf'], work, index)
            swf_sha = sha(swf)[:16]
            d['_swf_path'] = swf
        old = plan['decos'].get(n) or {}
        d['src_sha'] = src_sha[:16]
        d['src_bytes'] = os.path.getsize(os.path.join(SRC, n + '.png'))
        d['swf_sha'] = swf_sha
        d['svg_ok'] = old.get('svg_ok') if old.get('swf_sha') == swf_sha else None
        if d['svg_ok'] is None:
            d.pop('svg_ok')
        d['key'] = inputs_key(n, d['mode'], swf_sha, src_sha, d.get('svg_ok'))
        done = (old.get('key') == d['key'] and os.path.exists(os.path.join(OUT, n + '.webp'))
                and (not old.get('hires') or os.path.exists(os.path.join(OUT, n + '@1.5x.webp'))))
        if done and old.get('mode') == 'swf' and expect_swf(old) is False:
            done = False  # thresholds moved: now kept as its PNG
        if done and old.get('reason', '').startswith('differs') and expect_swf(old):
            done = False  # thresholds moved (or --svgcheck agreed): now the SWF render
        if done and not args.force:
            continue
        (todo_swf if d['mode'] == 'swf' else todo_png).append(d)
    print(f'{len(base)} decos; to do: {len(todo_swf)} from SWF, {len(todo_png)} from PNG', flush=True)
    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
        for d in pool.map(lambda d: emit_png(work, d), todo_png):
            d.pop('_swf_path', None)
            plan['decos'][d['name']] = d
    if todo_png:
        write_plan(plan)
        print(f'  {len(todo_png)} PNG decos encoded, {time.time() - t0:.0f}s', flush=True)
    for d in todo_swf:
        d['zoom'] = render_zoom(d)
    groups = collections.defaultdict(list)
    for d in todo_swf:
        groups[d['zoom']].append(d)
    done = 0
    for zoom, ds in sorted(groups.items()):
        # Big renders in small batches: a JVM per batch, and render PNGs are deleted as we go.
        ds.sort(key=lambda d: d['size2'][0] * d['size2'][1])
        i = 0
        while i < len(ds):
            batch, px = [], 0
            while i < len(ds) and len(batch) < args.batch and (not batch or px < 60e6):
                batch.append(ds[i]); px += ds[i]['size2'][0] * ds[i]['size2'][1] * 2.25; i += 1
            t = time.time()
            found, tmp = render_batch(work, zoom, [(d['name'], d['_swf_path']) for d in batch])
            def one(d):
                if d['name'] not in found:
                    d['mode'] = 'png'
                    d['reason'] = 'no render: FFDec produced no frame'
                    d['no_hires'] = 'png'
                    d['size3'] = None
                    return emit_png(work, d)
                return process(work, d, found[d['name']], None)
            with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
                for d in pool.map(one, batch):
                    d.pop('_swf_path', None)
                    plan['decos'][d['name']] = d
            for p in tmp:
                shutil.rmtree(p, ignore_errors=True)
            done += len(batch)
            write_plan(plan)
            print(f'  z{zoom} {done}/{len(todo_swf)}  batch {len(batch)} in {time.time() - t:.0f}s', flush=True)
            if args.max_load and os.getloadavg()[0] > args.max_load:
                while os.getloadavg()[0] > args.max_load * 0.8:
                    print(f'  load {os.getloadavg()[0]:.0f}, pausing', flush=True)
                    time.sleep(60)
    # Drop rows for decos no longer in the manifest.
    for n in list(plan['decos']):
        if n not in base:
            del plan['decos'][n]
    write_plan(plan)
    write_js(plan)
    print('summary', summarize(list(plan['decos'].values())))


def cmd_svgcheck(args):
    """For decos whose SWF render differs from the old PNG: render FFDec's SVG in Chromium and
    compare it with the raster render. Agreement means the PNG was older or different art and the
    SWF (what the client drew) wins; disagreement keeps the PNG."""
    work = args.work
    plan = read_plan()
    index = audit.bundle_index()
    rows = [r for r in plan['decos'].values() if r.get('reason', '').startswith('differs')]
    if args.only:
        rows = [r for r in rows if r['name'] in set(args.only.split(','))]
    print(len(rows), 'decos to cross-check', flush=True)
    for i in range(0, len(rows), args.batch):
        chunk = rows[i:i + args.batch]
        items = [(r['name'], audit.swf_path(r['swf'], work, index)) for r in chunk]
        found, tmp = render_batch(work, 2, items)
        svgs, tmp2 = audit.export_svgs(work, 'svgcheck', items, 2)
        for r in chunk:
            n = r['name']
            if n not in found or n not in svgs:
                r['svg_ok'] = False
                r['svg_diff'] = None
                continue
            a = stage_resample(load(found[n]), r['stage'], 2, r['size2'])
            b = stage_resample(load(svgs[n]), r['stage'], 2, r['size2'])
            c, al = compare(a, b)
            r['svg_diff'] = [c, al]
            r['svg_ok'] = c <= SETTINGS['svg_colour'] and al <= SETTINGS['svg_alpha']
        for p in tmp + tmp2:
            shutil.rmtree(p, ignore_errors=True)
        write_plan(plan)
        print(f'  {min(i + args.batch, len(rows))}/{len(rows)}', flush=True)
    ok = [r['name'] for r in rows if r.get('svg_ok')]
    print(f'{len(ok)} of {len(rows)} agree; rebuild them with --only to use the SWF render')
    if ok:
        print(','.join(ok))


# ---------- runtime list ----------

def js_text(plan):
    rows = sorted(plan['decos'].values(), key=lambda r: r['name'])
    hires = [r['name'] for r in rows if r.get('hires') and not r.get('big')]
    big = [r['name'] for r in rows if r.get('hires') and r.get('big')]
    return (
        '/**\n'
        ' * Street decos with a 3x WebP (assets/decos/groddle/<name>@1.5x.webp): Tiny Speck\'s SWF\n'
        ' * (CC0) rendered at 3x. Every deco also has <name>.webp at 2x, the old PNG\'s pixel size, which\n'
        ' * stays its logical size, so the 3x file has resolution 1.5. Generated by\n'
        ' * tools/deco-pipeline/build.py; do not edit by hand.\n'
        ' */\n'
        f'export const HIRES_DECOS = new Set({json.dumps(hires, separators=(", ", ": "))});\n\n'
        '/** 3x decos longer than 4096 px on a side: only where the GPU takes textures that big. */\n'
        f'export const HIRES_DECOS_BIG = new Set({json.dumps(big, separators=(", ", ": "))});\n'
    )


def write_js(plan):
    open(HIRES_JS, 'w').write(js_text(plan))


# ---------- check ----------

def cmd_check(args):
    problems = []
    plan = read_plan()
    names = json.load(open(MANIFEST))
    if {k: v for k, v in (plan.get('settings') or {}).items() if k not in DECISION} != {k: v for k, v in SETTINGS.items() if k not in DECISION}:
        problems.append('plan.json was built with other settings; rebuild')
    base = base_decisions()
    index = audit.bundle_index()
    import tempfile
    work = args.work or tempfile.mkdtemp(prefix='deco-pipeline-check-')
    for n in names:
        r = plan['decos'].get(n)
        if not r:
            problems.append(f'{n}: not in plan.json')
            continue
        src = os.path.join(SRC, n + '.png')
        if sha(src)[:16] != r.get('src_sha'):
            problems.append(f'{n}: source PNG changed since the build')
        if r.get('swf_sha'):
            swf = audit.swf_path(r['swf'], work, index)
            if sha(swf)[:16] != r['swf_sha']:
                problems.append(f'{n}: SWF changed since the build')
        b = base[n]
        if b['mode'] == 'png' and r['mode'] != 'png':
            problems.append(f'{n}: should be kept as its PNG ({b["reason"]})')
        out2 = os.path.join(OUT, n + '.webp')
        out3 = os.path.join(OUT, n + '@1.5x.webp')
        if not os.path.exists(out2):
            problems.append(f'{n}: missing {n}.webp')
        elif sha(out2)[:16] != r.get('sha2'):
            problems.append(f'{n}: {n}.webp is not the built file')
        else:
            w, h = Image.open(out2).size
            if [w, h] != r['size2'] or [w, h] != png_size(src):
                problems.append(f'{n}: {n}.webp is {w}x{h}, the PNG is {r["size2"]}')
        if r.get('hires'):
            if not os.path.exists(out3):
                problems.append(f'{n}: missing {n}@1.5x.webp')
            elif sha(out3)[:16] != r.get('sha3'):
                problems.append(f'{n}: {n}@1.5x.webp is not the built file')
        elif os.path.exists(out3):
            problems.append(f'{n}: stray {n}@1.5x.webp')
    known = set(names)
    for f in os.listdir(OUT):
        stem = f[:-len('@1.5x.webp')] if f.endswith('@1.5x.webp') else f.rsplit('.', 1)[0]
        if f.endswith('.png'):
            problems.append(f'{f}: PNG in the shipped deco folder (sources live in assets-src/decos)')
        elif f.endswith('.webp') and stem not in known:
            problems.append(f'{f}: not in manifest.json')
    for n in plan['decos']:
        if n not in known:
            problems.append(f'{n}: in plan.json but not in manifest.json')
    if not os.path.exists(HIRES_JS) or open(HIRES_JS).read() != js_text(plan):
        problems.append('js/deco-hires-list.js is stale (build.py --write-js)')
    if not args.work:
        shutil.rmtree(work, ignore_errors=True)
    for p in problems[:60]:
        print('  ' + p)
    s = summarize([plan['decos'][n] for n in names if n in plan['decos']])
    print(f'{len(names)} decos, {s.get("hires", 0)} with 3x; {len(problems)} problems')
    return 1 if problems else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', help='scratch dir for renders (deleted as it goes)')
    ap.add_argument('--only')
    ap.add_argument('--batch', type=int, default=60)
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--max-load', type=float, default=40)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--svgcheck', action='store_true')
    ap.add_argument('--write-js', action='store_true')
    args = ap.parse_args()
    if args.check:
        sys.exit(cmd_check(args))
    if args.write_js:
        write_js(read_plan())
        return
    if not args.work:
        ap.error('--work is required to build')
    if args.svgcheck:
        cmd_svgcheck(args)
    else:
        cmd_build(args)


if __name__ == '__main__':
    main()
