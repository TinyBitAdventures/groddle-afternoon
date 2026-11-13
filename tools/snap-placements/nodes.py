#!/usr/bin/env python3.11
"""Jellisac, Peat Bog and rock spots measured from players' full-street snaps (player reports #249, #250).

Tiny Speck's 2012 location files only count a street's Jellisacs and Peat Bogs, never where they
were, and both were set by hand (jellisac.js and peat_base.js obey_physics false). The planner
(street-ecology.js planStreetPlacements) can only put things on floor lines, so it hung a Jellisac on
a ledge in mid-air on Vuoksi Vale, where every one of the street's sat in a dark hole in the rock
face, and laid a Peat Bog along Ratin Jot Jog's big root, its low end over air. This finds the real
spots instead, as tools/snap-placements/barnacles.py does for Mortar Barnacles (report #210).

Evidence: the Eleven Giants project's full-street snaps from Nov-Dec 2012
(research/eleven-snaps/<region>/<collector>/<Street Name>[N]_<collector>.png). Reference only: no
snap pixel is ever copied into the repo. What this writes are positions measured from them, which
are facts.

A full-street snap is exactly the street (1 px = 1 street px, top left = bounds l, t), the same
space the game draws in. A snap of another size is resized to the street when its aspect matches
(within 0.5 %), else skipped.

Method (barnacles.py's): masked normalized cross-correlation (grey, FFT) of our own CC0 node art,
every variant in its growing frames, against each snap. The art is the original's own art drawn
1:1, so a real node scores 0.92-0.99, and one half hidden behind the snap's foreground grass or
roots 0.86-0.92 (every hit from 0.86 up was checked by eye on its crop: all real). A hit counts at
the class's threshold; every snap of a
street is matched and the hits merged (one within MERGE_PX of another is the same node). Precision
over recall: a street with more hits than its file count keeps the ones seen in the most snaps,
then the best scores, and the game plans the rest (street-ecology.js PLANNED_NODE_CAPS, steady
floors).

Each spot is [x, y, variant]: the frame cell's bottom centre in street px (what
resource-nodes-feature.js draws a measured node from: anchor 0.5, 1 on the cell), and the variant
number the snap shows (jellySack<n>, peat<n>).

Rocks (the placements audit of 2026-11-12): Glitch's Metal, Beryl, Dullite and Sparkly Rocks were set
by hand too (rock_metal_1.js etc. obey_physics false), and each came in three shapes, rock_<kind>_1,
_2 and _3 (the _2 and _3 classes are proxy_item of _1: the same rock to mine, its own art). The
planner put 31% of them on floors where the street never had one. Every rock template (each kind's
three shapes, every chunk frame) is matched at half resolution (ROCK_DOWN: 60 templates over a
12000 px street would cost minutes a snap at full size), each hit then refined at full resolution in
a ROCK_REFINE px window over its kind's 15 templates, which gives its spot and its shape. Real rocks
score 0.90-0.99 at half resolution and the best non-rock 0.81 (ROCK_THRESHOLD; Sparkly's glitter
scores lower, 0.84). Each spot is [x, y, shape]: the frame cell's bottom centre in street px, as
game.js spawnMineRock draws it (anchor 0.5, 1, at 1:1), and the shape the snap shows (1, 2, 3). At
most the location file's count of each kind is kept (the most seen, then the best), and the game
plans the rest.

The game reads the spots from public/js/node-spots-data.js (written from
public/assets/content/node-spots.json here, so street-ecology.js has them in the browser, the
realtime builders and the tests alike).

Usage (python3.11 has numpy + Pillow):
  python3.11 -I tools/snap-placements/nodes.py                    write node-spots.json and js/node-spots-data.js
  python3.11 -I tools/snap-placements/nodes.py --check            exit 1 when the .js does not match the .json
  python3.11 -I tools/snap-placements/nodes.py --crops <dir>      also save a crop of every street's matches
  python3.11 -I tools/snap-placements/nodes.py --only jellisac:GIFDIDJT0GU1CR8 --dry
  python3.11 -I tools/snap-placements/nodes.py --group rocks       measure only the rocks, keep the rest
With no research/eleven-snaps beside the repo (a public clone) it says so and writes nothing.
"""
import argparse, json, os, re, sys, unicodedata
from multiprocessing import Pool
for _v in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_v, '1')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SNAPS = os.path.join(ROOT, '..', 'research', 'eleven-snaps')
SPRITES = os.path.join(ROOT, 'public', 'assets', 'sprites', 'resources')
MINING = os.path.join(ROOT, 'public', 'assets', 'sprites', 'mining')
ECOLOGY = os.path.join(ROOT, 'public', 'assets', 'content', 'street-ecology.json')
INDEX = os.path.join(ROOT, 'public', 'assets', 'streets', 'index.json')
OUT = os.path.join(ROOT, 'public', 'assets', 'content', 'node-spots.json')
JS_OUT = os.path.join(ROOT, 'public', 'js', 'node-spots-data.js')

# js/resource-nodes.js sprite.sheets: variant -> (file, frame width, height, cols). `frames` are the
# frame indexes matched: a Jellisac's small to ready (frame 0, empty, is a bare stub that matches
# too loosely), every Peat Bog frame but the last (harvests_remaining 0, a flat smear).
CLASSES = {
    'jellisac': {
        'export': 'JELLISAC_SPOTS',
        'name': 'Jellisac',
        'variant': 'jellySack',
        'sheets': {1: ('jellisac-jellysack1.webp', 40, 48, 5), 2: ('jellisac-jellysack2.webp', 42, 46, 5),
                   3: ('jellisac-jellysack3.webp', 44, 39, 5), 4: ('jellisac-jellysack4.webp', 47, 52, 5)},
        'frames': (1, 2, 3, 4),
        'threshold': 0.86,
        'near': (24, 24),
    },
    'peat_1': {
        'export': 'PEAT_SPOTS',
        'name': 'Peat Bog',
        'variant': 'peat',
        'sheets': {1: ('peat-1.webp', 211, 52, 3), 2: ('peat-2.webp', 166, 46, 5), 3: ('peat-3.webp', 178, 57, 5)},
        'frames': (0, 1, 2, 3),
        'threshold': 0.86,
        'near': (90, 30),
    },
}
# js/mining.js ROCK_CATALOG and ROCK_SHAPES: rock class -> shape -> (sheet, cell w, h); five chunk frames
# a sheet (Tiny Speck's x1_5 ... x1_1), every one matched.
ROCKS = {
    'rock_metal_1': {'export': 'ROCK_METAL_SPOTS', 'threshold': 0.88,
                     'shapes': {1: ('rock_metal.webp', 137, 100), 2: ('rock_metal_2.webp', 156, 137), 3: ('rock_metal_3.webp', 184, 92)}},
    'rock_beryl_1': {'export': 'ROCK_BERYL_SPOTS', 'threshold': 0.88,
                     'shapes': {1: ('rock_beryl.webp', 134, 120), 2: ('rock_beryl_2.webp', 146, 129), 3: ('rock_beryl_3.webp', 184, 98)}},
    'rock_dullite_1': {'export': 'ROCK_DULLITE_SPOTS', 'threshold': 0.88,
                       'shapes': {1: ('rock_dullite.webp', 131, 114), 2: ('rock_dullite_2.webp', 131, 130), 3: ('rock_dullite_3.webp', 180, 82)}},
    'rock_sparkly_1': {'export': 'ROCK_SPARKLY_SPOTS', 'threshold': 0.84,
                       'shapes': {1: ('rock_sparkly.webp', 131, 127), 2: ('rock_sparkly_2.webp', 151, 150), 3: ('rock_sparkly_3.webp', 173, 88)}},
}
ROCK_FRAMES = (0, 1, 2, 3, 4)
ROCK_DOWN = 0.5
ROCK_REFINE = 6  # px each way, full resolution
ROCK_NEAR = (50, 40)  # one rock per this box in a snap (Glitch's rocks stand 60 px apart and more)
ROCK_MERGE_PX = 24  # the same rock in two snaps (a frame's cell may shift its best fit a few px)
ROCK_MIN_FULL = 0.75  # a refined hit under this at full resolution was a lucky blur: dropped
MERGE_PX = 10
MIN_STD = 0.03  # a flat patch (sky, a plain wall) never counts


def norm(s):
    return unicodedata.normalize('NFC', s).lower().strip()


def load_templates(np, Image, cls):
    out = []
    for v, (file, fw, fh, cols) in cls['sheets'].items():
        sheet = Image.open(os.path.join(SPRITES, file)).convert('RGBA')
        for f in cls['frames']:
            x, y = (f % cols) * fw, (f // cols) * fh
            fr = np.asarray(sheet.crop((x, y, x + fw, y + fh))).astype(np.float64) / 255
            if (fr[..., 3] > 0.5).sum() < 40:
                continue
            out.append((v, f, fr))
    return out


def gray(np, a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


TILE = 2048  # matched in overlapping tiles so a 12000 px street never needs gigabytes of FFT


def match_snap(np, I, templates, cls, threshold):
    """Every local best over the threshold in a grey snap: (score, left, top, variant, frame, anchor x, anchor y)."""
    H, W = I.shape
    th = max(t[2].shape[0] for t in templates)
    tw = max(t[2].shape[1] for t in templates)
    hits = []
    for y0 in range(0, max(1, H - th) + 1, TILE - th):
        for x0 in range(0, max(1, W - tw) + 1, TILE - tw):
            for s, x, y, v, f in match_tile(np, I[y0:y0 + TILE, x0:x0 + TILE], templates, threshold):
                hits.append((s, x + x0, y + y0, v, f))
            if x0 + TILE >= W:
                break
        if y0 + TILE >= H:
            break
    return pick(hits, cls)


def match_tile(np, I, templates, threshold):
    """(score, left, top, variant, frame) for every template position over the threshold in one tile."""
    H, W = I.shape
    th = max(t[2].shape[0] for t in templates)
    tw = max(t[2].shape[1] for t in templates)
    shape = (H + th, W + tw)
    F1 = np.fft.rfft2(I, shape)
    F2 = np.fft.rfft2(I * I, shape)
    hits = []
    for v, f, fr in templates:
        h, w = fr.shape[:2]
        if h > H or w > W:
            continue
        M = (fr[..., 3] > 0.5).astype(np.float64)
        T = gray(np, fr)
        n = M.sum()
        Tp = (T - (T * M).sum() / n) * M

        def corr(F, k):
            return np.fft.irfft2(F * np.conj(np.fft.rfft2(k, shape)), shape)[:H - h + 1, :W - w + 1]
        num = corr(F1, Tp)
        s1 = corr(F1, M)
        s2 = corr(F2, M)
        var = np.maximum(s2 - s1 * s1 / n, 0)
        score = num / np.sqrt((Tp * Tp).sum() * np.maximum(var, 1e-9))
        score[var / n < MIN_STD * MIN_STD] = 0
        ys, xs = np.where(score >= threshold)
        for y, x in zip(ys, xs):
            hits.append((float(score[y, x]), int(x), int(y), v, f))
    return hits


def pick(hits, cls):
    """The best hit of each cluster, with its frame cell's bottom centre."""
    hits = sorted(set(hits), reverse=True)
    nx, ny = cls['near']
    picks = []
    for s, x, y, v, f in hits:
        fw, fh = cls['sheets'][v][1], cls['sheets'][v][2]
        ax, ay = x + fw / 2, y + fh
        if all(abs(ax - p[5]) > nx or abs(ay - p[6]) > ny for p in picks):
            picks.append((s, x, y, v, f, ax, ay))
    return picks


def street_job(job):
    import numpy as np
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    cls = CLASSES[job['cls']]
    templates = load_templates(np, Image, cls)
    W, H = job['w'], job['h']
    per_snap = []
    for path in job['snaps']:
        im = Image.open(path).convert('RGB')
        if im.size != (W, H):
            if abs(im.size[0] / im.size[1] - W / H) > 0.005 * (W / H):
                per_snap.append((path, None, f'skipped: {im.size[0]}x{im.size[1]} is not {W}x{H}'))
                continue
            im = im.resize((W, H), Image.LANCZOS)
        a = np.asarray(im)
        grey = (a[..., 0] * np.float32(0.299 / 255) + a[..., 1] * np.float32(0.587 / 255) + a[..., 2] * np.float32(0.114 / 255)).astype(np.float64)
        del a, im
        per_snap.append((path, match_snap(np, grey, templates, cls, job['threshold']), ''))
        del grey
    return {**job, 'per_snap': per_snap}


def rock_templates(np, Image):
    """[(class, shape, frame, full RGBA cell, half RGBA cell)] for every rock template."""
    out = []
    for cls, rock in ROCKS.items():
        for shape, (file, fw, fh) in rock['shapes'].items():
            sheet = Image.open(os.path.join(MINING, file)).convert('RGBA')
            for f in ROCK_FRAMES:
                cell = sheet.crop((f * fw, 0, f * fw + fw, fh))
                full = np.asarray(cell).astype(np.float64) / 255
                if (full[..., 3] > 0.5).sum() < 40:
                    continue
                half = np.asarray(cell.resize((max(4, round(fw * ROCK_DOWN)), max(4, round(fh * ROCK_DOWN))), Image.LANCZOS)).astype(np.float64) / 255
                out.append((cls, shape, f, full, half))
    return out


def ncc_window(np, I, fr, x0, y0, reach):
    """Best masked NCC of one full-size template with its top left within `reach` px of (x0, y0): (score, x, y)."""
    from numpy.lib.stride_tricks import sliding_window_view
    H, W = I.shape
    h, w = fr.shape[:2]
    lx, ly = max(0, x0 - reach), max(0, y0 - reach)
    hx, hy = min(W - w, x0 + reach), min(H - h, y0 + reach)
    if hx < lx or hy < ly:
        return (-1, x0, y0)
    region = I[ly:hy + h, lx:hx + w]
    M = (fr[..., 3] > 0.5).astype(np.float64)
    T = gray(np, fr)
    n = M.sum()
    Tp = (T - (T * M).sum() / n) * M
    view = sliding_window_view(region, (h, w))
    num = np.einsum('abij,ij->ab', view, Tp)
    s1 = np.einsum('abij,ij->ab', view, M)
    s2 = np.einsum('abij,ij->ab', view * view, M) if view.size < 4e7 else np.einsum('abij,ij->ab', sliding_window_view(region * region, (h, w)), M)
    var = np.maximum(s2 - s1 * s1 / n, 0)
    score = num / np.sqrt((Tp * Tp).sum() * np.maximum(var, 1e-9))
    score[var / n < MIN_STD * MIN_STD] = 0
    b = np.unravel_index(int(np.argmax(score)), score.shape)
    return (float(score[b]), lx + int(b[1]), ly + int(b[0]))


def rock_snap(np, Image, path, W, H, templates):
    """Every rock one snap shows: [(full score, class, shape, frame, ax, ay, half score)]."""
    im = Image.open(path).convert('RGB')
    if im.size != (W, H):
        if abs(im.size[0] / im.size[1] - W / H) > 0.005 * (W / H):
            return None, f'skipped: {im.size[0]}x{im.size[1]} is not {W}x{H}'
        im = im.resize((W, H), Image.LANCZOS)
    small = im.resize((max(1, round(W * ROCK_DOWN)), max(1, round(H * ROCK_DOWN))), Image.LANCZOS)

    def grey_of(img):
        a = np.asarray(img)
        return (a[..., 0] * np.float32(0.299 / 255) + a[..., 1] * np.float32(0.587 / 255) + a[..., 2] * np.float32(0.114 / 255)).astype(np.float64)
    full, half = grey_of(im), grey_of(small)
    del im, small
    floor = min(r['threshold'] for r in ROCKS.values())
    halves = [(i, t[4]) for i, t in enumerate(templates)]
    Hh, Wh = half.shape
    th = max(t[1].shape[0] for t in halves)
    tw = max(t[1].shape[1] for t in halves)
    hits = []
    for y0 in range(0, max(1, Hh - th) + 1, TILE - th):
        for x0 in range(0, max(1, Wh - tw) + 1, TILE - tw):
            for s, x, y, i, _ in match_tile(np, half[y0:y0 + TILE, x0:x0 + TILE], [(i, 0, t) for i, t in halves], floor):
                cls, shape, f, fr, hf = templates[i]
                if s < ROCKS[cls]['threshold']:
                    continue
                # the hit's cell bottom centre in full street px
                hits.append((s, (x + x0 + hf.shape[1] / 2) / ROCK_DOWN, (y + y0 + hf.shape[0]) / ROCK_DOWN, i))
            if x0 + TILE >= Wh:
                break
        if y0 + TILE >= Hh:
            break
    del half
    hits.sort(reverse=True)
    picks = []
    nx, ny = ROCK_NEAR
    for s, ax, ay, i in hits:
        if all(abs(ax - p[1]) > nx or abs(ay - p[2]) > ny for p in picks):
            picks.append((s, ax, ay, i))
    out = []
    for s, ax, ay, i in picks:
        cls = templates[i][0]
        best = None
        for c2, shape, f, fr, _ in templates:
            if c2 != cls:
                continue
            h, w = fr.shape[:2]
            score, x, y = ncc_window(np, full, fr, int(round(ax - w / 2)), int(round(ay - h)), ROCK_REFINE + 2)
            if best is None or score > best[0]:
                best = (score, cls, shape, f, x + w / 2, y + h, s)
        if best and best[0] >= ROCK_MIN_FULL:
            out.append(best)
    return out, ''


def rock_street_job(job):
    import numpy as np
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    templates = rock_templates(np, Image)
    per_snap = []
    for path in job['snaps']:
        found, note = rock_snap(np, Image, path, job['w'], job['h'], templates)
        per_snap.append((path, found, note))
    return {**job, 'per_snap': per_snap}


def rock_merge(job):
    """Rocks across a street's snaps: [{x, y, cls, shape, seen, score}], the most seen first."""
    clusters = []
    for path, found, _ in job['per_snap']:
        for score, cls, shape, f, ax, ay, hs in found or []:
            for c in clusters:
                if abs(c['x'] - ax) <= ROCK_MERGE_PX and abs(c['y'] - ay) <= ROCK_MERGE_PX:
                    if path not in c['snaps']:
                        c['snaps'].append(path)
                    if score > c['score']:
                        c.update(score=score, x=ax, y=ay, cls=cls, shape=shape)
                    break
            else:
                clusters.append({'x': ax, 'y': ay, 'cls': cls, 'shape': shape, 'score': score, 'snaps': [path]})
    clusters.sort(key=lambda c: (-len(c['snaps']), -c['score']))
    return clusters


def any_job(job):
    return rock_street_job(job) if job['cls'] == 'rocks' else street_job(job)


def merge(job):
    """Clusters of hits across snaps: [{x, y, v, seen, score}]."""
    clusters = []
    for path, picks, _ in job['per_snap']:
        for s, x, y, v, f, ax, ay in picks or []:
            for c in clusters:
                if abs(c['x'] - ax) <= MERGE_PX and abs(c['y'] - ay) <= MERGE_PX:
                    if path not in c['snaps']:
                        c['snaps'].append(path)
                    if s > c['score']:
                        c.update(score=s, x=ax, y=ay, v=v, f=f)
                    break
            else:
                clusters.append({'x': ax, 'y': ay, 'v': v, 'f': f, 'score': s, 'snaps': [path]})
    clusters.sort(key=lambda c: (-len(c['snaps']), -c['score']))
    return clusters


def find_snaps(snaps_dir, label, hub):
    want = norm(label)
    roots = [os.path.join(snaps_dir, hub)] if hub and os.path.isdir(os.path.join(snaps_dir, hub)) else [snaps_dir]
    out = []
    for root in roots:
        for dirpath, _, files in os.walk(root):
            for f in files:
                m = re.match(r'^(.*?)(\d*)_([^_]+)\.(png|jpe?g)$', norm(f))
                if m and m.group(1).strip() == want:
                    out.append(os.path.join(dirpath, f))
    return sorted(out)


def save_crop(job, spots, crops):
    """A small contact sheet of the matches (scratch QA only, never in the repo)."""
    from PIL import Image, ImageDraw
    Image.MAX_IMAGE_PIXELS = None
    if not spots:
        return
    cls = CLASSES[job['cls']]
    im = Image.open(job['snaps'][0]).convert('RGB')
    if im.size != (job['w'], job['h']):
        im = im.resize((job['w'], job['h']), Image.LANCZOS)
    tiles = []
    for x, y, v, score in spots[:12]:
        fw, fh = cls['sheets'][v][1], cls['sheets'][v][2]
        box = (int(x - fw / 2 - 40), int(y - fh - 40), int(x + fw / 2 + 40), int(y + 30))
        tile = im.crop(box)
        d = ImageDraw.Draw(tile)
        d.rectangle((x - fw / 2 - box[0], y - fh - box[1], x + fw / 2 - box[0], y - box[1]), outline=(255, 0, 255), width=1)
        d.text((2, 2), f'{score:.3f}', fill=(255, 0, 255))
        tiles.append(tile)
    W = sum(t.width + 2 for t in tiles)
    H = max(t.height for t in tiles)
    sheet = Image.new('RGB', (W, H), (30, 30, 30))
    xx = 0
    for t in tiles:
        sheet.paste(t, (xx, 0))
        xx += t.width + 2
    os.makedirs(crops, exist_ok=True)
    sheet.save(os.path.join(crops, f"{job['cls']}-{job['tsid']}-{re.sub(r'[^a-z0-9]+', '-', norm(job['label']))}.png"))


def js_module(data):
    parts = ['// Generated by tools/snap-placements/nodes.py from assets/content/node-spots.json: never edit by hand.\n'
             '/**\n'
             ' * Player reports #249 and #250: where each street\'s Jellisacs and Peat Bogs were, measured on players\'\n'
             ' * full-street snaps (see the JSON\'s source note). { [G tsid]: [[x, y, variant], ...] }: the frame cell\'s\n'
             ' * bottom centre in street px and the variant number (jellySack<n>, peat<n>). The rocks the same\n'
             ' * (the placements audit, 2026-11-12), with the shape the snap shows (rock_<kind>_<n>, 1-3).\n'
             ' * street-ecology.js measuredNodeSpots reads them.\n'
             ' */\n']
    for cls_id, cls in [*CLASSES.items(), *ROCKS.items()]:
        streets = data.get(cls_id, {}).get('streets', {})
        rows = ',\n'.join(f'  {json.dumps(t)}: {json.dumps(v, separators=(",", ":"))}' for t, v in sorted(streets.items()))
        parts.append(f'export const {cls["export"]} = Object.freeze({{\n{rows}{"," if rows else ""}\n}});\n')
    return '\n'.join(parts)


def num(v):
    v = round(v, 1)
    return int(v) if float(v).is_integer() else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--snaps', default=SNAPS)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--only', action='append', default=[], help='<class>:<tsid> or <class> (rocks: rocks:<tsid>)')
    ap.add_argument('--group', choices=('all', 'nodes', 'rocks'), default='all', help='what to measure; the rest is kept from --out')
    ap.add_argument('--crops', default='')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--jobs', type=int, default=3)
    ap.add_argument('--threshold', type=float, default=0)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    if args.check:
        want = js_module(json.load(open(args.out))['classes'])
        have = open(JS_OUT).read() if os.path.exists(JS_OUT) else ''
        if want != have:
            print(f'{os.path.relpath(JS_OUT, ROOT)} is stale: run python3.11 -I tools/snap-placements/nodes.py')
            return 1
        print(f'{os.path.relpath(JS_OUT, ROOT)} matches {os.path.relpath(args.out, ROOT)}')
        return 0
    snaps_dir = os.path.abspath(args.snaps)
    if not os.path.isdir(snaps_dir):
        print(f'no snaps at {snaps_dir} (research/eleven-snaps is not public): nothing to measure, {os.path.relpath(args.out, ROOT)} left as it is')
        return 0
    ecology = json.load(open(ECOLOGY))
    index = json.load(open(INDEX))['streets']
    only = [o.split(':') for o in args.only]
    jobs = []

    def street_meta(tsid):
        meta = index.get(tsid)
        if not meta:
            return None
        street = json.load(open(os.path.join(ROOT, 'public', meta['file'])))
        b = street['bounds']
        return meta, b['r'] - b['l'], b['b'] - b['t']

    if args.group in ('all', 'nodes'):
        for cls_id, cls in CLASSES.items():
            for tsid, row in sorted(ecology['streets'].items()):
                count = int((row or {}).get('counts', {}).get(cls_id) or 0)
                if count < 1:
                    continue
                if only and not any(o[0] == cls_id and (len(o) < 2 or o[1] == tsid) for o in only):
                    continue
                got = street_meta(tsid)
                if not got:
                    continue
                meta, w, h = got
                snaps = find_snaps(snaps_dir, meta['label'], meta.get('hubName'))
                if snaps:
                    jobs.append({'cls': cls_id, 'tsid': tsid, 'label': meta['label'], 'count': count, 'w': w,
                                 'h': h, 'snaps': snaps, 'threshold': args.threshold or cls['threshold']})
    if args.group in ('all', 'rocks'):
        for tsid, row in sorted(ecology['streets'].items()):
            counts = {c: int((row or {}).get('counts', {}).get(c) or 0) for c in ROCKS}
            if sum(counts.values()) < 1:
                continue
            if only and not any(o[0] == 'rocks' and (len(o) < 2 or o[1] == tsid) for o in only):
                continue
            got = street_meta(tsid)
            if not got:
                continue
            meta, w, h = got
            snaps = find_snaps(snaps_dir, meta['label'], meta.get('hubName'))
            if snaps:
                jobs.append({'cls': 'rocks', 'tsid': tsid, 'label': meta['label'], 'counts': counts, 'w': w, 'h': h, 'snaps': snaps})
    print(f'{len(jobs)} street jobs have full-street snaps')
    with Pool(max(1, args.jobs), maxtasksperchild=4) as pool:
        done = []
        for job in pool.imap_unordered(any_job, jobs, chunksize=1):
            done.append(job)
            print(f"  matched {len(done)}/{len(jobs)}: {job['cls']} {job['label']}", flush=True)
    measured = list(CLASSES) * (args.group in ('all', 'nodes')) + list(ROCKS) * (args.group in ('all', 'rocks'))
    old = json.load(open(args.out))['classes'] if os.path.exists(args.out) else {}
    out = {c: ({'streets': {}, 'snaps': {}} if c in measured else old.get(c, {'streets': {}, 'snaps': {}})) for c in [*CLASSES, *ROCKS]}
    totals = {c: [0, 0] for c in measured}
    shapes = {c: [0, 0, 0] for c in ROCKS}
    for job in sorted(done, key=lambda j: (j['cls'], j['tsid'])):
        for path, _, note in job['per_snap']:
            if note:
                print(f"  {job['label']}: {os.path.basename(path)} {note}")
        if job['cls'] == 'rocks':
            clusters = rock_merge(job)
            kept = []
            for cls, n in job['counts'].items():
                mine = [c for c in clusters if c['cls'] == cls][:n]
                kept += mine
                if mine:
                    out[cls]['streets'][job['tsid']] = sorted([[num(c['x']), num(c['y']), c['shape']] for c in mine])
                    out[cls]['snaps'][job['tsid']] = len(job['snaps'])
                    totals[cls][0] += len(mine)
                    totals[cls][1] += 1
                    for c in mine:
                        shapes[cls][c['shape'] - 1] += 1
            extra = [c for c in clusters if c not in kept]
            want = sum(job['counts'].values())
            print(f"rocks {job['tsid']} {job['label']}: {len(kept)}/{want} from {len(job['snaps'])} snaps"
                  + (f" ({len(extra)} more dropped: {[(c['cls'][5:-2], round(c['x']), round(c['y']), round(c['score'], 3), len(c['snaps'])) for c in extra][:6]})" if extra else '')
                  + f" min score {min([c['score'] for c in kept], default=0):.3f}")
            continue
        clusters = merge(job)
        keep = clusters[:job['count']]
        spots = sorted([[round(c['x'], 1), round(c['y'], 1), c['v']] for c in keep], key=lambda s: (s[0], s[1]))
        extra = clusters[job['count']:]
        print(f"{job['cls']} {job['tsid']} {job['label']}: {len(spots)}/{job['count']} from {len(job['snaps'])} snaps"
              + (f" ({len(extra)} more hits dropped: {[(round(c['x']), round(c['y']), round(c['score'], 3)) for c in extra][:6]})" if extra else '')
              + f" min score {min([c['score'] for c in keep], default=0):.3f}")
        if spots:
            out[job['cls']]['streets'][job['tsid']] = [[int(x) if float(x).is_integer() else x, int(y) if float(y).is_integer() else y, v] for x, y, v in spots]
            out[job['cls']]['snaps'][job['tsid']] = len(job['snaps'])
            totals[job['cls']][0] += len(spots)
            totals[job['cls']][1] += 1
        if args.crops:
            save_crop(job, sorted([[c['x'], c['y'], c['v'], c['score']] for c in keep]), args.crops)
    for c, (n, s) in totals.items():
        print(f'{c}: {n} spots on {s} streets' + (f' (shapes _1/_2/_3: {"/".join(map(str, shapes[c]))})' if c in ROCKS else ''))
    if args.dry or only:
        return 0
    data = {
        'source': 'Jellisac, Peat Bog and rock spots measured by tools/snap-placements/nodes.py (player reports #249, #250; '
                  'the placements audit of 2026-11-12) from players\' full-street snaps of Nov-Dec 2012 gathered by the Eleven '
                  'Giants project (collectors zoi, mackenzie, cleops; reference only, no pixels kept): our CC0 node and rock art '
                  'matched against each snap. classes[class].streets[tsid] = [[x, y, variant], ...]: the frame cell\'s bottom '
                  'centre in street px (0, 0 = the street\'s top left, as street-model.js platformsScreen) and the variant number '
                  'the snap shows (jellySack<n>, peat<n>; a rock\'s shape, rock_<kind>_<n>). `snaps` is how many snaps of the '
                  'street were matched. Do not edit by hand.',
        'classes': out,
    }
    with open(args.out, 'w') as f:
        f.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('],"', '],\n"').replace('{"source"', '{\n"source"') + '\n')
    with open(JS_OUT, 'w') as f:
        f.write(js_module(out))
    print(f'wrote {os.path.relpath(args.out, ROOT)} and {os.path.relpath(JS_OUT, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
