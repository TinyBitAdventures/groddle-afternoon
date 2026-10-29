#!/usr/bin/env python3.11
"""Sharp street decos: SVG or a sized WebP for decos the streets draw larger than their files.

build.py ships every deco at 2x (<name>.webp) and most at 3x (<name>@1.5x.webp), which is plenty
for a deco drawn at about half its PNG size. Some placements stretch a small deco far past that:
Guillermo Gamera Way's chimney_yellow_front_01 (front layer) is 268 x 887 world px from a 3x file
of 171 x 573, about 6x magnified on a 4x backing store. This tool finds those and ships a copy
sized to the need, from the same CC0 bundle SWF (tinyspeck/glitch-locations; FFDec reads it, never
runs it).

Measure (no rendering): every drawn deco on every street in index.json, middleground and the
layers drawn in front of it (layers behind it load the 2x file on purpose, js/street-render.js;
blurred layers bake at reduced resolution; hidden layers never draw). Parallax and T_ layers are
only offset, never scaled, so a deco's w x h is its on-screen size in view px. The renderer draws
R backing px per view px (css width / 960 x devicePixelRatio, capped at 4: js/render-density.js);
worst case R = 4. ratio = w x R / texels of the file loaded there (3x where it has one), max of
both axes. Candidates: ratio >= `ratio_min`, or ratio >= `front_min` on a layer that draws over the
avatars, with hard edges in the shipped file (`edge` >= `edge_min`: 99th percentile neighbour step,
0-255; skies, glows and gradients score under 20 and look the same magnified). Decos with no SWF
or a kept PNG (build.py mode png) are listed as skipped.

Format, decided per deco by measurement against FFDec's raster render:
- svg: FFDec's SVG export (stage viewBox added, FFDec attributes stripped), rasterised by
  Chromium the way the game does it (Image -> canvas drawImage at the asked size). Shipped when it
  has no embedded bitmaps and matches the raster render (`svg_rgb`, `svg_alpha`, `svg_bad`):
  FFDec's SVG export drops some placement colour transforms (alpha) and draws masks differently.
  Bytes are tiny; the game rasterises it at the screen's need (js/deco-hires.js sharpDeco).
- webp: otherwise the raster render sized to `target` texels per view px at the largest near
  placement, <name>@<res>x.webp (res texels per logical px, steps of 0.25, longest side at most
  `webp_max_side`), encoded like build.py.

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp 1.6; node + Playwright):
  python3.11 -I tools/deco-pipeline/sharp.py --measure [--out report.json]   (ranked report only)
  python3.11 -I tools/deco-pipeline/sharp.py --work <scratch dir> [--only a,b] [--force]
  python3.11 -I tools/deco-pipeline/sharp.py --check        (no rendering; exit 1 on any problem)
The build is incremental (a deco is redone when its SWF, the shipped file it was measured on or the
settings change). Set BROWSER_LOCK=<dir> to take a mkdir lock around the Chromium step.
"""
import argparse, collections, concurrent.futures, hashlib, json, math, os, re, shutil, subprocess, sys, time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ in tools/
sys.path.insert(0, HERE)
import build  # noqa: E402  (deco-pipeline: paths, encode, stage_resample, FFDec helpers)
audit = build.audit

PUBLIC = build.PUBLIC
OUT = build.OUT
STREETS = build.STREETS
SHARP_PLAN = os.path.join(HERE, 'plan-sharp.json')
SHARP_JS = os.path.join(PUBLIC, 'js', 'deco-sharp-list.js')
RASTER_JS = os.path.join(HERE, 'svg-raster.mjs')
SPIKE = build.SPIKE

SETTINGS = {
    'version': 1,
    'R': 4.0,             # worst-case backing px per view px (render-density.js MAX_RENDER_RESOLUTION)
    'ratio_min': 1.5,     # needed / available texels at R that counts as blurry
    'front_min': 1.0,     # the same on a layer drawn over the avatars
    'edge_min': 40.0,     # hard-edge score of the shipped file (0-255) below which magnifying shows nothing
    'target': 3.0,        # WebP texels per view px at the largest near placement: what a 3x deco drawn at half its PNG size gets
    'webp_max_side': 4096,
    'svg_rgb': 2.0,       # SVG (Chromium) vs FFDec raster: mean premultiplied RGB difference, visible px
    'svg_alpha': 3.0,     #                                  mean alpha difference
    'svg_bad': 3.0,       #                                  % of visible px off by more than 32 (both after check_box)
    'check_side': 1200,   # longest side of the SVG check renders
    'check_box': 4,       # box filter (px) both check renders get before they are compared
}


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def blur_size(filters):
    try:
        n = int(float((filters or {}).get('blur') or 0))
    except (TypeError, ValueError):
        n = 0
    return n if n > 1 else 0


def deco_twins():
    text = open(os.path.join(PUBLIC, 'js', 'street-render.js')).read()
    m = re.search(r'export const DECO_TWINS = Object\.freeze\(\{(.*?)\}\);', text, re.S)
    return dict(re.findall(r"(\w+):\s*'(\w+)'", m.group(1))) if m else {}


def shipped_file(row):
    """(path, size) of the file the game loads for a near layer (3x where there is one)."""
    if row.get('hires'):
        return os.path.join(OUT, row['name'] + '@1.5x.webp'), row['size3']
    return os.path.join(OUT, row['name'] + '.webp'), row['size2']


# ---------- measure ----------

LUM = (0.212671, 0.71516, 0.072169)


def _mul(cur, oth):
    out = [0.0] * 20
    for y in range(4):
        for x in range(5):
            i = y * 5
            out[i + x] = oth[i] * cur[x] + oth[i + 1] * cur[x + 5] + oth[i + 2] * cur[x + 10] + oth[i + 3] * cur[x + 15] + (oth[i + 4] if x == 4 else 0)
    return out


def layer_matrix(f):
    """js/street-render.js glitchLayerMatrix (quasimondo's ColorMatrix: colorize, contrast,
    saturation, brightness), or None."""
    f = f or {}
    num = lambda k: float(f.get(k) or 0)
    b, c, sat, ta, tc = num('brightness'), num('contrast'), num('saturation'), num('tintAmount'), int(num('tintColor'))
    if not (b or c or sat or ta):
        return None
    m = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]
    if ta:
        a = ta / 100
        r, g, bl = ((tc >> 16) & 255) / 255, ((tc >> 8) & 255) / 255, (tc & 255) / 255
        inv = 1 - a
        m = _mul(m, [inv + a * r * LUM[0], a * r * LUM[1], a * r * LUM[2], 0, 0, a * g * LUM[0], inv + a * g * LUM[1], a * g * LUM[2], 0, 0,
                     a * bl * LUM[0], a * bl * LUM[1], inv + a * bl * LUM[2], 0, 0, 0, 0, 0, 1, 0])
    if c:
        k = c / 100 + 1
        o = 128 * (1 - k)
        m = _mul(m, [k, 0, 0, 0, o, 0, k, 0, 0, o, 0, 0, k, 0, o, 0, 0, 0, 1, 0])
    if sat:
        sv = sat / 100 + 1
        inv = 1 - sv
        ir, ig, ib = inv * LUM[0], inv * LUM[1], inv * LUM[2]
        m = _mul(m, [ir + sv, ig, ib, 0, 0, ir, ig + sv, ib, 0, 0, ir, ig, ib + sv, 0, 0, 0, 0, 0, 1, 0])
    if b:
        m = _mul(m, [1, 0, 0, 0, b, 0, 1, 0, 0, b, 0, 0, 1, 0, b, 0, 0, 0, 1, 0])
    return m


def matrix_gain(f):
    """How much a layer's colour matrix scales a grey edge (1 without one): a contrast of -50
    halves every step, so the deco's art shows half as sharp an edge."""
    m = layer_matrix(f)
    if not m:
        return 1.0
    return max(abs(m[i * 5] + m[i * 5 + 1] + m[i * 5 + 2]) for i in range(3))


def blur_bake_res(size, R=4.0):
    """js/street-render.js blurBakeResolution: texels per layer px a blurred layer is baked at."""
    want = min(R, 4 / size)
    return 2 if want >= 2 else 1 if want >= 1 else 0.5


def placements(plan):
    """Every drawn deco: dict(sprite, tsid, street, layer, cls, blur (box px, 0 for none), gain, w, h)."""
    idx = json.load(open(os.path.join(STREETS, 'index.json')))['streets']
    manifest = set(json.load(open(build.MANIFEST)))
    twins = deco_twins()
    out = []
    for tsid, meta in sorted(idx.items()):
        path = os.path.join(PUBLIC, meta['file'])
        if not os.path.exists(path):
            continue
        st = json.load(open(path))
        layers = st.get('layers') or []
        mz = next((l.get('z', i) for i, l in enumerate(layers) if l.get('id') == 'middleground'), None)
        for i, l in enumerate(layers):
            if l.get('id') != 'middleground' and l.get('hidden') is True:
                continue
            z = l.get('z', i)
            if l.get('id') == 'middleground' or mz is None:
                cls = 'middle'
            elif z > mz:
                cls = 'front'
            elif z < mz:
                cls = 'far'
            else:
                cls = 'middle'
            blur = blur_size(l.get('filters'))
            blurred = blur > 0
            gain = round(matrix_gain(l.get('filters')), 3)
            for d in l.get('decos') or []:
                sp = d.get('sprite')
                sp = sp if sp in manifest else twins.get(sp, sp)
                if sp not in manifest or sp not in plan:
                    continue
                L = plan[sp]['size2']
                out.append(dict(sprite=sp, tsid=tsid, street=st.get('label'), layer=l.get('id'), cls=cls, blurred=blurred, blur=blur, gain=gain,
                                w=abs(d.get('w') or 0) or L[0], h=abs(d.get('h') or 0) or L[1], sized=bool(d.get('w')) and bool(d.get('h'))))
    return out


def edge_score(path):
    """99th percentile of the largest premultiplied channel step to the right/lower neighbour (0-255)
    over covered pixels; a centre crop of at most 2048 px keeps texel steps for big files."""
    im = Image.open(path)
    w, h = im.size
    cw, ch = min(w, 2048), min(h, 2048)
    if (cw, ch) != (w, h):
        im = im.crop(((w - cw) // 2, (h - ch) // 2, (w - cw) // 2 + cw, (h - ch) // 2 + ch))
    a = build.premult(im.convert('RGBA'))
    dx = np.abs(np.diff(a, axis=1)).max(axis=2)[:-1, :]
    dy = np.abs(np.diff(a, axis=0)).max(axis=2)[:, :-1]
    d = np.maximum(dx, dy)
    vis = a[:-1, :-1, 3] > 4
    v = d[vis] if vis.any() else d.ravel()
    return round(float(np.percentile(v, 99)), 1) if v.size else 0.0


def measure(plan, old=None):
    """Ranked per-sprite report (worst ratio first). Three kinds of placement, each with its own
    need in texels per view px at R:
    - near (middleground and in front, unblurred): R, against the file loaded there (3x where
      there is one); the deco counts at ratio_min, or front_min on a front layer;
    - far (behind the middleground, unblurred): R, against the 2x file those layers load;
    - blurred (any layer with a box blur of 2+): the blur bake's own density (blur_bake_res:
      2, 1 or 0.5), since the bake keeps nothing finer, against the file loaded there.
    Far and blurred placements count at ratio_min and only where the art's edge survives the
    layer's colour matrix (edge x matrix_gain >= edge_min): washed-out hills look the same
    magnified. s, sf and sb are the largest view px per logical px over the near placements, and
    over the far and blurred placements that count."""
    S = SETTINGS
    old_edges = {r['name']: r for r in ((old or {}).get('decos') or []) + ((old or {}).get('skipped') or []) + ((old or {}).get('soft') or [])}
    by = collections.defaultdict(list)
    for p in placements(plan):
        by[p['sprite']].append(p)
    rows = []
    for sp, ps in by.items():
        row = plan[sp]
        L = row['size2']
        path, f3 = shipped_file(row)
        for p in ps:
            p['kind'] = 'blur' if p['blurred'] else 'far' if p['cls'] == 'far' else 'near'
            avail = L if p['cls'] == 'far' else f3
            dens = blur_bake_res(p['blur'], S['R']) if p['blurred'] else S['R']
            p['ratio'] = round(max(p['w'] * dens / avail[0], p['h'] * dens / avail[1]), 3)
            p['scale'] = max(p['w'] / L[0], p['h'] / L[1])
            p['dens'] = dens
        near = [p for p in ps if p['kind'] == 'near']
        front = max([p['ratio'] for p in near if p['cls'] == 'front'] or [0])
        near_blurry = bool(near) and (max(p['ratio'] for p in near) >= S['ratio_min'] or front >= S['front_min'])
        other = [p for p in ps if p['kind'] != 'near' and p['ratio'] >= S['ratio_min']]
        if not near_blurry and not other:
            continue
        fsha = row.get('sha3') if row.get('hires') else row.get('sha2')
        o = old_edges.get(sp)
        edge = o['edge'] if o and o.get('edge_of') == fsha else edge_score(path)
        counted = [p for p in other if edge * p['gain'] >= S['edge_min']]
        if near_blurry and edge >= S['edge_min']:
            counted += near
        pool = counted or (near if near_blurry else other)
        worst = max(pool, key=lambda p: p['ratio'])
        sf = max([p['scale'] for p in counted if p['kind'] == 'far'] or [0])
        sb = max([p['scale'] for p in counted if p['kind'] == 'blur'] or [0])
        bneed = max([p['scale'] * p['dens'] for p in counted if p['kind'] == 'blur'] or [0])
        r = dict(name=sp, ratio=worst['ratio'], front=front, placements=len(ps),
                 over=sum(1 for p in pool if p['ratio'] >= S['ratio_min']),
                 worst={k: worst[k] for k in ('tsid', 'street', 'layer', 'cls', 'w', 'h', 'blur', 'gain')},
                 file=os.path.basename(path if worst['cls'] != 'far' else path.replace('@1.5x.webp', '.webp')),
                 texels=(L if worst['cls'] == 'far' else f3), need=[round(worst['w'] * worst['dens']), round(worst['h'] * worst['dens'])],
                 s=round(max([max(p['w'] / L[0], p['h'] / L[1]) for p in near] or [0]), 4) if near_blurry and edge >= S['edge_min'] else 0,
                 sf=round(sf, 4), sb=round(sb, 4), bneed=round(bneed, 4), size2=L,
                 counted=bool(counted), unsized=sum(1 for p in counted if not p['sized']), source=row['mode'] == 'swf',
                 edge=edge, edge_of=fsha)
        rows.append(r)
    rows.sort(key=lambda r: -r['ratio'])
    return rows


def classify(rows, plan):
    """(candidates, skipped (no usable source), soft (blurry but no hard edges)) by the settings."""
    S = SETTINGS
    cand, skipped, soft = [], [], []
    for r in rows:
        if not r['counted']:
            soft.append(r)
        elif not r['source']:
            skipped.append(dict(r, reason=plan[r['name']].get('reason') or 'no SWF'))
        elif r['unsized']:
            skipped.append(dict(r, reason='placed without w x h somewhere (natural size depends on the file)'))
        elif webp_res(r, 1.5 if plan[r['name']].get('hires') else 1) is None:
            skipped.append(dict(r, reason=f"cap: {SETTINGS['webp_max_side']} px on the longest side is no sharper than the file it has"))
        else:
            cand.append(r)
    return cand, skipped, soft


# ---------- SVG ----------

# Decos with a hand-exported SVG under the same name (Paradise's moons, see the skill): never overwritten.
HAND_SVGS = {'moon_asset_smile', 'moon_asset_plain'}

SAFE_HREF = re.compile(r'(?:xlink:)?href="(?!#)[^"]*"')


def tidy_svg(text, stage):
    """FFDec's frame SVG with a stage viewBox (so it scales when drawn larger) and its own
    attributes stripped. Returns None for anything but plain vector shapes."""
    if re.search(r'<script|<foreignObject|javascript:|<image|data:', text, re.I) or SAFE_HREF.search(text):
        return None
    text = re.sub(r'<\?xml[^>]*\?>\s*', '', text)
    text = re.sub(r'\s+ffdec:[A-Za-z]+="[^"]*"', '', text)
    text = re.sub(r'\s+xmlns:ffdec="[^"]*"', '', text)
    text = re.sub(r'>\s+<', '><', text).strip()
    w, h = stage
    text = re.sub(r'<svg ', f'<svg viewBox="0 0 {w:g} {h:g}" preserveAspectRatio="none" ', text, count=1)
    return text + '\n'


def export_svgs(work, items):
    """items [(name, swf)] -> {name: svg text}; one JVM per batch."""
    src = os.path.join(work, 'src-svg')
    out = os.path.join(work, 'svg')
    shutil.rmtree(out, ignore_errors=True)
    audit.link_batch(src, items)
    build.ffdec('-zoom', 1, '-ignorebackground', '-select', 1, '-format', 'frame:svg', '-export', 'frame', out, src)
    found = {}
    for n, _ in items:
        p = os.path.join(out, n + '.swf', '1.svg')
        if os.path.exists(p):
            found[n] = open(p, encoding='utf-8', errors='replace').read()
    shutil.rmtree(out, ignore_errors=True)
    shutil.rmtree(src, ignore_errors=True)
    return found


def browser_raster(work, jobs):
    """jobs [(svg path, png path, w, h)]: Chromium draws each SVG at w x h (svg-raster.mjs)."""
    path = os.path.join(work, 'raster-jobs.json')
    json.dump([dict(svg=a, png=b, width=w, height=h) for a, b, w, h in jobs], open(path, 'w'))
    lock = os.environ.get('BROWSER_LOCK')
    if lock:
        for _ in range(900):
            try:
                os.mkdir(lock)
                break
            except FileExistsError:
                time.sleep(2)
        else:
            raise SystemExit('browser lock busy')
    try:
        subprocess.run(['timeout', '1800', 'node', RASTER_JS, path], cwd=SPIKE, check=True)
    finally:
        if lock:
            os.rmdir(lock)


def box(x, k):
    h, w = x.shape[0] // k * k, x.shape[1] // k * k
    return x[:h, :w].reshape(h // k, k, w // k, k, x.shape[2]).mean(axis=(1, 3))


def visible_diff(ref, other, k=None):
    """Mean premultiplied RGB and alpha difference and % of pixels off by more than 32, over pixels
    visible in either, after a k x k box filter (`check_box`): Chromium and FFDec anti-alias edges
    differently by a pixel, which is noise at the check size; missing alpha, shapes or colours
    are not."""
    k = k or SETTINGS['check_box']
    a, b = box(build.premult(ref), k), box(build.premult(other), k)
    d = np.abs(a - b)
    vis = (a[..., 3] > 8) | (b[..., 3] > 8)
    if not vis.any():
        return 0.0, 0.0, 0.0
    e = d.max(axis=2)[vis]
    return (round(float(d[..., :3][vis].mean()), 2), round(float(d[..., 3][vis].mean()), 2),
            round(float((e > 32).mean() * 100), 2))


# ---------- build ----------

def read_sharp():
    if not os.path.exists(SHARP_PLAN):
        return {'settings': None, 'decos': [], 'skipped': [], 'soft': []}
    return json.load(open(SHARP_PLAN))


def write_sharp(p):
    rows = sorted(p['decos'], key=lambda r: r['name'])
    head = {k: v for k, v in p.items() if k not in ('decos', 'skipped', 'soft')}
    head['summary'] = {
        'svg': sum(1 for r in rows if r['kind'] == 'svg'), 'webp': sum(1 for r in rows if r['kind'] == 'webp'),
        'svg_bytes': sum(r['bytes'] for r in rows if r['kind'] == 'svg'),
        'webp_bytes': sum(r['bytes'] for r in rows if r['kind'] == 'webp'),
        'skipped': len(p.get('skipped') or []), 'soft': len(p.get('soft') or []),
    }
    with open(SHARP_PLAN, 'w') as f:
        f.write(json.dumps(head, separators=(',', ':'))[:-1])
        for key, rs in (('decos', rows), ('skipped', p.get('skipped') or []), ('soft', p.get('soft') or [])):
            f.write(f',"{key}":[\n' + ',\n'.join(json.dumps(r, separators=(',', ':')) for r in rs) + '\n]')
        f.write('}\n')


# Settings that only pick candidates or size the WebP: a WebP row is redone when its res changes
# (webp_res), an SVG row never needs them.
SIZING = ('R', 'ratio_min', 'front_min', 'edge_min', 'target', 'webp_max_side')


def row_key(r, prow):
    keep = {k: SETTINGS[k] for k in SETTINGS if k not in SIZING}
    return hashlib.sha256(json.dumps([r['name'], prow.get('swf_sha'), r.get('edge_of'), keep], sort_keys=True).encode()).hexdigest()[:20]


def out_files(r):
    if r['kind'] == 'svg':
        return [os.path.join(OUT, r['name'] + '.svg')]
    return [os.path.join(OUT, f"{r['name']}@{r['res']:g}x.webp")]


def webp_res(r, base):
    """Texels per logical px for the WebP: `target` per view px at the largest near or far
    placement that counts, or a blurred one's bake density, whichever needs most, in
    steps of 0.25, at most `webp_max_side` on the longest side. None when that is no more than the
    file the game already loads (`base`: 1.5 with a 3x file, else 1). Never 1.5: that name is the
    3x file's."""
    L = r['size2']
    need = max(r['s'] * SETTINGS['target'], r.get('sf', 0) * SETTINGS['target'], r.get('bneed', 0))
    res = math.ceil(need * 4 - 1e-6) / 4
    cap = SETTINGS['webp_max_side'] / max(L)
    if res > cap:
        res = math.floor(cap * 4) / 4
    if res == 1.5:
        res = 1.75 if 1.75 <= cap else 1.25
    return res if res > base else None


def cmd_build(args):
    work = os.path.abspath(args.work)
    os.makedirs(work, exist_ok=True)
    plan = build.read_plan()['decos']
    old = read_sharp()
    rows = measure(plan, old)
    cand, skipped, soft = classify(rows, plan)
    olds = {r['name']: r for r in old.get('decos') or []}
    only = set(args.only.split(',')) if args.only else None
    index = audit.bundle_index()
    todo = []
    keep = []
    for r in cand:
        prow = plan[r['name']]
        r['swf_sha'] = prow.get('swf_sha')
        r['key'] = row_key(r, prow)
        o = olds.get(r['name'])
        fresh = (o and o.get('key') == r['key'] and not args.force and all(os.path.exists(f) for f in out_files(o))
                 and (o['kind'] != 'webp' or o.get('res') == webp_res(r, 1.5 if prow.get('hires') else 1)))
        if o and (only and r['name'] not in only or fresh):
            keep.append(dict(o, ratio=r['ratio'], front=r['front'], placements=r['placements'], over=r['over'], worst=r['worst'],
                             s=r['s'], sf=r['sf'], sb=r['sb'], bneed=r['bneed']))
            continue
        if only and r['name'] not in only:
            continue
        r['_swf'] = audit.swf_path(prow['swf'], work, index)
        r['base'] = 1.5 if prow.get('hires') else 1
        r['stage'] = prow['stage']
        todo.append(r)
    print(f'{len(rows)} decos drawn near; {len(cand)} sharp candidates, {len(skipped)} without a source, '
          f'{len(soft)} soft; to do {len(todo)}', flush=True)
    done = []
    for i in range(0, len(todo), args.batch):
        chunk = todo[i:i + args.batch]
        done += build_chunk(work, chunk, args)
        sharp = dict(settings=SETTINGS, generated=time.strftime('%Y-%m-%d'), tools=build.tool_versions(),
                     decos=keep + done, skipped=skipped, soft=soft_rows(soft))
        write_sharp(sharp)
        print(f'  {min(i + args.batch, len(todo))}/{len(todo)}', flush=True)
        if args.max_load and os.getloadavg()[0] > args.max_load:
            while os.getloadavg()[0] > args.max_load * 0.8:
                print(f'  load {os.getloadavg()[0]:.0f}, pausing', flush=True)
                time.sleep(60)
    live = {r['name'] for r in keep + done}
    # Files of decos that are no longer candidates.
    for o in old.get('decos') or []:
        if o['name'] not in live:
            for f in out_files(o):
                # Never a build.py file (a 3x WebP, or a hand-made SVG).
                if f.endswith('@1.5x.webp') or os.path.basename(f)[:-4] in HAND_SVGS:
                    continue
                if os.path.exists(f):
                    os.remove(f)
    sharp = dict(settings=SETTINGS, generated=time.strftime('%Y-%m-%d'), tools=build.tool_versions(),
                 decos=keep + done, skipped=skipped, soft=soft_rows(soft))
    write_sharp(sharp)
    write_js(sharp)
    print('summary', json.load(open(SHARP_PLAN))['summary'])


def soft_rows(soft):
    return [{k: r[k] for k in ('name', 'ratio', 'front', 'edge', 'edge_of', 'worst')} for r in soft]


def build_chunk(work, chunk, args):
    S = SETTINGS
    items = [(r['name'], r['_swf']) for r in chunk]
    svgs = export_svgs(work, items)
    # Check renders: FFDec raster at a zoom giving check_side, stage resampled to the check size.
    groups = collections.defaultdict(list)
    for r in chunk:
        L = r['size2']
        c = max(1.0, S['check_side'] / max(L))
        r['_check'] = [max(1, round(L[0] * c)), max(1, round(L[1] * c))]
        z = max(3, math.ceil(max(r['_check'][0] / r['stage'][0], r['_check'][1] / r['stage'][1]) - 0.02))
        groups[z].append(r)
    refs = {}
    cdir = os.path.join(work, 'check')
    shutil.rmtree(cdir, ignore_errors=True)
    os.makedirs(cdir)
    for z, rs in groups.items():
        found, tmp = build.render_batch(work, z, [(r['name'], r['_swf']) for r in rs])
        for r in rs:
            if r['name'] in found:
                ref = build.stage_resample(build.load(found[r['name']]), r['stage'], z, r['_check'])
                p = os.path.join(cdir, r['name'] + '.ref.png')
                ref.save(p, compress_level=1)
                refs[r['name']] = p
        for p in tmp:
            shutil.rmtree(p, ignore_errors=True)
    jobs = []
    for r in chunk:
        text = svgs.get(r['name'])
        r['_svg'] = tidy_svg(text, r['stage']) if text and r['name'] not in HAND_SVGS else None
        if r['_svg'] and r['name'] in refs:
            p = os.path.join(cdir, r['name'] + '.svg')
            open(p, 'w').write(r['_svg'])
            jobs.append((p, os.path.join(cdir, r['name'] + '.svg.png'), *r['_check']))
    if jobs:
        browser_raster(work, jobs)
    webps = []
    for r in chunk:
        if r['name'] not in refs:
            r['kind'] = None
            r['why'] = 'FFDec produced no frame'
            continue
        svgpng = os.path.join(cdir, r['name'] + '.svg.png')
        if r['_svg'] and os.path.exists(svgpng):
            r['svg_check'] = list(visible_diff(build.load(refs[r['name']]), build.load(svgpng)))
            ok = (r['svg_check'][0] <= S['svg_rgb'] and r['svg_check'][1] <= S['svg_alpha'] and r['svg_check'][2] <= S['svg_bad'])
        else:
            r['svg_check'] = None
            ok = False
        if ok:
            r['kind'] = 'svg'
            dst = os.path.join(OUT, r['name'] + '.svg')
            open(dst, 'w').write(r['_svg'])
            r['bytes'] = os.path.getsize(dst)
            r['sha'] = sha(dst)
            stale = [f for f in os.listdir(OUT) if f.startswith(r['name'] + '@') and f.endswith('x.webp') and f != r['name'] + '@1.5x.webp']
            for f in stale:
                os.remove(os.path.join(OUT, f))
        else:
            r['kind'] = 'webp'
            r['why'] = 'bitmap or not plain vector' if not r['_svg'] else 'SVG differs from the raster render'
            webps.append(r)
    # WebP fallbacks: the raster render sized to the need.
    g2 = collections.defaultdict(list)
    for r in webps:
        r['res'] = webp_res(r, r['base'])
        L = r['size2']
        r['size'] = [max(1, round(L[0] * r['res'])), max(1, round(L[1] * r['res']))]
        z = max(3, math.ceil(max(r['size'][0] / r['stage'][0], r['size'][1] / r['stage'][1]) - 0.02))
        g2[z].append(r)
    for z, rs in g2.items():
        for j in range(0, len(rs), 8):
            sub = rs[j:j + 8]
            found, tmp = build.render_batch(work, z, [(r['name'], r['_swf']) for r in sub])
            for r in sub:
                if r['name'] not in found:
                    r['kind'] = None
                    r['why'] = 'FFDec produced no frame'
                    continue
                img = build.stage_resample(build.load(found[r['name']]), r['stage'], z, r['size'])
                dst = os.path.join(OUT, f"{r['name']}@{r['res']:g}x.webp")
                for f in os.listdir(OUT):
                    if f.startswith(r['name'] + '@') and f.endswith('x.webp') and f not in (r['name'] + '@1.5x.webp', os.path.basename(dst)):
                        os.remove(os.path.join(OUT, f))
                svg_old = os.path.join(OUT, r['name'] + '.svg')
                if os.path.exists(svg_old) and r['name'] not in HAND_SVGS:
                    os.remove(svg_old)
                r['bytes'], r['lossless'], r['err'] = build.encode(img, dst, os.path.join(work, 'enc'))
                r['sha'] = sha(dst)
            for p in tmp:
                shutil.rmtree(p, ignore_errors=True)
    if os.environ.get('SHARP_KEEP_CHECK'):
        shutil.copytree(cdir, os.environ['SHARP_KEEP_CHECK'], dirs_exist_ok=True)
    shutil.rmtree(cdir, ignore_errors=True)
    out = []
    for r in chunk:
        if not r.get('kind'):
            continue
        keep = ('name', 'kind', 's', 'sf', 'sb', 'bneed', 'size2', 'ratio', 'front', 'placements', 'over', 'worst', 'edge', 'edge_of', 'swf_sha',
                'key', 'svg_check', 'why', 'res', 'size', 'bytes', 'sha', 'lossless', 'err')
        out.append({k: r[k] for k in keep if k in r and r[k] is not None})
    return out


# ---------- runtime list ----------

def js_text(p):
    rows = sorted(p['decos'], key=lambda r: r['name'])
    ents = []
    for r in rows:
        v = [r['kind'], r['s'], r['size2'][0], r['size2'][1], r.get('res', 0) if r['kind'] == 'webp' else 0, r.get('sf', 0), r.get('sb', 0)]
        ents.append(json.dumps([r['name'], v], separators=(',', ':')))
    return (
        '/**\n'
        ' * Street decos some street draws much larger than their 2x/3x WebPs (tools/deco-pipeline/sharp.py):\n'
        ' * name -> [kind, s, w, h, res, sf, sb]. kind "svg": assets/decos/groddle/<name>.svg, rasterised at\n'
        " * the screen's need; \"webp\": <name>@<res>x.webp (res 0 for svg). s, sf, sb: the largest view px per\n"
        ' * logical px over its near, far (behind the middleground) and blurred placements that need it\n'
        ' * (0: none, that kind keeps the 2x/3x file); w x h the logical size (the 2x file).\n'
        ' * Generated by sharp.py; do not edit by hand.\n'
        ' */\n'
        'export const SHARP_DECOS = new Map([\n' + ',\n'.join(ents) + '\n]);\n'
    )


def write_js(p):
    open(SHARP_JS, 'w').write(js_text(p))


# ---------- check ----------

def cmd_check(args):
    problems = []
    p = read_sharp()
    if p.get('settings') != SETTINGS:
        problems.append('plan-sharp.json was built with other settings; rebuild')
    plan = build.read_plan()['decos']
    rows = measure(plan, p)
    cand, skipped, soft = classify(rows, plan)
    have = {r['name']: r for r in p.get('decos') or []}
    want = {r['name']: r for r in cand}
    for n in sorted(set(want) - set(have)):
        problems.append(f'{n}: blurry (ratio {want[n]["ratio"]}) but not built')
    for n in sorted(set(have) - set(want)):
        problems.append(f'{n}: built but no longer a candidate')
    for n, r in have.items():
        prow = plan.get(n)
        if not prow:
            problems.append(f'{n}: not in plan.json')
            continue
        if prow.get('swf_sha') != r.get('swf_sha'):
            problems.append(f'{n}: SWF changed since the sharp build')
        if r['kind'] == 'webp' and n in want and r.get('res') != webp_res(want[n], 1.5 if prow.get('hires') else 1):
            problems.append(f'{n}: built at res {r.get("res")}, the rule now gives {webp_res(want[n], 1.5 if prow.get("hires") else 1)}')
        for k in ('s', 'sf', 'sb', 'bneed'):
            if n in want and abs(want[n][k] - r.get(k, 0)) > 1e-6:
                problems.append(f'{n}: placements changed ({k} {r.get(k, 0)} -> {want[n][k]})')
        for f in out_files(r):
            if not os.path.exists(f):
                problems.append(f'{n}: missing {os.path.basename(f)}')
            elif sha(f) != r.get('sha'):
                problems.append(f'{n}: {os.path.basename(f)} is not the built file')
            elif r['kind'] == 'webp':
                w, h = Image.open(f).size
                if [w, h] != r['size'] or abs(w / r['res'] - r['size2'][0]) > 0.5 or abs(h / r['res'] - r['size2'][1]) > 0.5:
                    problems.append(f'{n}: {os.path.basename(f)} is {w}x{h}, expected {r["size"]} at res {r["res"]}')
            else:
                text = open(f).read()
                if tidy_svg(text, [1, 1]) is None or 'viewBox=' not in text:
                    problems.append(f'{n}: {os.path.basename(f)} is not a plain vector SVG with a viewBox')
    shipped = set()
    for r in have.values():
        shipped |= {os.path.basename(f) for f in out_files(r)}
    extra_svgs = {'moon_asset_smile.svg', 'moon_asset_plain.svg'}  # hand-exported, see the skill (Paradise)
    for f in os.listdir(OUT):
        if f.endswith('.svg') and f not in shipped and f not in extra_svgs:
            problems.append(f'{f}: stray SVG')
        if re.search(r'@[\d.]+x\.webp$', f) and not f.endswith('@1.5x.webp') and f not in shipped:
            problems.append(f'{f}: stray sized WebP')
    if not os.path.exists(SHARP_JS) or open(SHARP_JS).read() != js_text(p):
        problems.append('js/deco-sharp-list.js is stale (sharp.py --write-js)')
    for x in problems[:60]:
        print('  ' + x)
    s = json.load(open(SHARP_PLAN))['summary'] if os.path.exists(SHARP_PLAN) else {}
    print(f"{len(have)} sharp decos ({s.get('svg', 0)} svg, {s.get('webp', 0)} webp), {len(skipped)} without a source; {len(problems)} problems")
    return 1 if problems else 0


def cmd_measure(args):
    plan = build.read_plan()['decos']
    rows = measure(plan, read_sharp())
    cand, skipped, soft = classify(rows, plan)
    if args.out:
        json.dump(dict(settings=SETTINGS, rows=rows), open(args.out, 'w'), indent=0)
    print(f'{len(rows)} decos drawn near; {len(cand)} candidates, {len(skipped)} blurry without a usable source, {len(soft)} soft')
    for r in [r for r in rows if r.get('edge', 0) >= SETTINGS['edge_min']][:args.top]:
        w = r['worst']
        print(f"{r['ratio']:6.2f} {r['name']:40s} {w['street'][:26]:26s} {w['layer'][:16]:16s} {w['cls']:6s} "
              f"{w['w']}x{w['h']} need {r['need'][0]}x{r['need'][1]} have {r['texels'][0]}x{r['texels'][1]} ({r['file']}) "
              f"source={'yes' if r['source'] else 'no'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work')
    ap.add_argument('--only')
    ap.add_argument('--batch', type=int, default=60)
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--max-load', type=float, default=40)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--measure', action='store_true')
    ap.add_argument('--out')
    ap.add_argument('--top', type=int, default=30)
    ap.add_argument('--write-js', action='store_true')
    args = ap.parse_args()
    if args.check:
        sys.exit(cmd_check(args))
    if args.measure:
        return cmd_measure(args)
    if args.write_js:
        return write_js(read_sharp())
    if not args.work:
        ap.error('--work is required to build')
    cmd_build(args)


if __name__ == '__main__':
    main()
