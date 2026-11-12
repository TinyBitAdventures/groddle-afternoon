#!/usr/bin/env python3.11
"""Mortar Barnacle spots measured from players' full-street snaps (player report #210).

Tiny Speck's 2012 location files say how many Mortar Barnacles a street had, never where, and
mortar_barnacle.js sets obey_physics false: each one was set by hand, mostly on walls (Froughtful
Fen's sit on the beehive huts above the decks and on a barrel, none on the ground). The planner
(street-ecology.js planStreetPlacements) can only put things on floor lines, so this finds the
real spots instead.

Evidence: the Eleven Giants project's full-street snaps from Nov-Dec 2012
(research/eleven-snaps/<region>/<collector>/<Street Name>[N]_<collector>.png, see its README).
Reference only: no snap pixel is ever copied into the repo. What this writes are positions
measured from them, which are facts.

A full-street snap is exactly the street (1 px = 1 street px, top left = bounds l, t), the same
space the game draws in (street-model.js worldToScreen / platformsScreen). A snap of another size
is resized to the street when its aspect matches (within 0.5 %), else skipped.

Method: masked normalized cross-correlation (grey, FFT) of our own CC0 barnacle art
(assets/sprites/resources/mortar-barnacle-blister1-6.webp, Tiny Speck's six `blister` variants)
in its small, big and ready frames (frame 1-3; the scraped frame 0 is a ragged ring that matches
too loosely) against each snap. The art is the original's own vector art drawn 1:1, so a real
barnacle scores 0.97-0.99 and the best match anywhere else stays under 0.85 (measured over every
snap). A hit counts at THRESHOLD; every snap of a street is matched and the hits merged (one
within MERGE_PX of another is the same barnacle; a barnacle can be scraped, or stood in front
of, in one snap). Precision over recall: a street with more hits than its file count keeps the
ones seen in the most snaps, then the best scores, and the game plans the rest.

Each spot is [x, y, blister]: the frame cell's bottom centre in street px (what
resource-nodes-feature.js draws a wall barnacle from: anchor 0.5, 1 on the cell), and the variant
the snap shows (createResourceNode `variant: blister<n>`).

The game reads the same spots from public/js/barnacle-spots-data.js (written from the JSON here, so
street-ecology.js has them in the browser, the realtime builders and the tests alike, with no fetch).

Usage (python3.11 has numpy + Pillow):
  python3.11 -I tools/snap-placements/barnacles.py                  write barnacle-spots.json and js/barnacle-spots-data.js
  python3.11 -I tools/snap-placements/barnacles.py --check          exit 1 when the .js does not match the .json (no snaps needed)
  python3.11 -I tools/snap-placements/barnacles.py --crops <dir>    also save a crop of every street's matches
  python3.11 -I tools/snap-placements/barnacles.py --only GTJ103U2KJK1BLG --dry
With no research/eleven-snaps beside the repo (a public clone) it says so and writes nothing.
"""
import argparse, json, os, re, sys, unicodedata
from multiprocessing import Pool

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SNAPS = os.path.join(ROOT, '..', 'research', 'eleven-snaps')
SPRITES = os.path.join(ROOT, 'public', 'assets', 'sprites', 'resources')
ECOLOGY = os.path.join(ROOT, 'public', 'assets', 'content', 'street-ecology.json')
INDEX = os.path.join(ROOT, 'public', 'assets', 'streets', 'index.json')
OUT = os.path.join(ROOT, 'public', 'assets', 'content', 'barnacle-spots.json')
JS_OUT = os.path.join(ROOT, 'public', 'js', 'barnacle-spots-data.js')

# js/resource-nodes.js mortar_barnacle sprite.sheets: blister<n> frame width, height (4 frames in a row).
FRAMES = {1: (39, 44), 2: (35, 40), 3: (35, 39), 4: (36, 40), 5: (32, 39), 6: (39, 47)}
STATES = (1, 2, 3)  # small, big, ready (frame index = scrape_state - 1)
THRESHOLD = 0.93
MERGE_PX = 8
MIN_STD = 0.03  # a flat patch (sky, a plain wall) never counts


def norm(s):
    return unicodedata.normalize('NFC', s).lower().strip()


def load_templates(np, Image):
    out = []
    for v, (fw, fh) in FRAMES.items():
        sheet = Image.open(os.path.join(SPRITES, f'mortar-barnacle-blister{v}.webp')).convert('RGBA')
        for st in STATES:
            fr = np.asarray(sheet.crop((st * fw, 0, st * fw + fw, fh))).astype(np.float64) / 255
            out.append((v, st, fr))
    return out


def gray(np, a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def match_snap(np, img, templates, threshold=THRESHOLD):
    """Every local best over THRESHOLD: (score, left, top, variant, state)."""
    I = gray(np, img)
    H, W = I.shape
    th = max(t[2].shape[0] for t in templates)
    tw = max(t[2].shape[1] for t in templates)
    shape = (H + th, W + tw)
    F1 = np.fft.rfft2(I, shape)
    F2 = np.fft.rfft2(I * I, shape)
    hits = []
    for v, st, fr in templates:
        h, w = fr.shape[:2]
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
            hits.append((float(score[y, x]), int(x), int(y), v, st))
    hits.sort(reverse=True)
    picks = []
    for s, x, y, v, st in hits:
        fw, fh = FRAMES[v]
        ax, ay = x + fw / 2, y + fh
        if all(abs(ax - p[5]) > 20 or abs(ay - p[6]) > 20 for p in picks):
            picks.append((s, x, y, v, st, ax, ay))
    return picks


def street_job(job):
    import numpy as np
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    templates = load_templates(np, Image)
    W, H = job['w'], job['h']
    per_snap = []
    for path in job['snaps']:
        im = Image.open(path).convert('RGB')
        if im.size != (W, H):
            if abs(im.size[0] / im.size[1] - W / H) > 0.005 * (W / H):
                per_snap.append((path, None, f'skipped: {im.size[0]}x{im.size[1]} is not {W}x{H}'))
                continue
            im = im.resize((W, H), Image.LANCZOS)
        img = np.asarray(im).astype(np.float64) / 255
        per_snap.append((path, match_snap(np, img, templates, job['threshold']), ''))
    return {**job, 'per_snap': per_snap}


def merge(job):
    """Clusters of hits across snaps: [{x, y, v, seen, score}]."""
    clusters = []
    for path, picks, _ in job['per_snap']:
        for s, x, y, v, st, ax, ay in picks or []:
            for c in clusters:
                if abs(c['x'] - ax) <= MERGE_PX and abs(c['y'] - ay) <= MERGE_PX:
                    if path not in c['snaps']:
                        c['snaps'].append(path)
                    if s > c['score']:
                        c.update(score=s, x=ax, y=ay, v=v, st=st)
                    break
            else:
                clusters.append({'x': ax, 'y': ay, 'v': v, 'st': st, 'score': s, 'snaps': [path]})
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
    from PIL import Image, ImageDraw
    Image.MAX_IMAGE_PIXELS = None
    if not spots:
        return
    im = Image.open(job['snaps'][0]).convert('RGB')
    if im.size != (job['w'], job['h']):
        im = im.resize((job['w'], job['h']), Image.LANCZOS)
    tiles = []
    for x, y, v in spots:
        fw, fh = FRAMES[v]
        box = (int(x - 70), int(y - fh - 60), int(x + 70), int(y + 50))
        tile = im.crop(box).resize((280, 2 * (box[3] - box[1])))
        d = ImageDraw.Draw(tile)
        d.rectangle(((x - fw / 2 - box[0]) * 2, (y - fh - box[1]) * 2, (x + fw / 2 - box[0]) * 2, (y - box[1]) * 2), outline=(255, 0, 255), width=2)
        d.text((4, 4), f'{x:.0f},{y:.0f} b{v}', fill=(255, 0, 255))
        tiles.append(tile)
    cols = min(6, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    th = max(t.height for t in tiles)
    sheet = Image.new('RGB', (cols * 284, rows * (th + 4)), (30, 30, 30))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 284, (i // cols) * (th + 4)))
    os.makedirs(crops, exist_ok=True)
    sheet.save(os.path.join(crops, f"{job['tsid']}-{re.sub(r'[^a-z0-9]+', '-', norm(job['label']))}.png"))


def js_module(streets):
    rows = ',\n'.join(f'  {json.dumps(t)}: {json.dumps(v, separators=(",", ":"))}' for t, v in sorted(streets.items()))
    return ('// Generated by tools/snap-placements/barnacles.py from assets/content/barnacle-spots.json: never edit by hand.\n'
            '/**\n'
            ' * Player report #210: where each street\'s Mortar Barnacles were, measured on players\' full-street snaps\n'
            ' * (see the JSON\'s source note). { [G tsid]: [[x, y, blister], ...] }: the frame cell\'s bottom centre in\n'
            ' * street px and the blister variant. street-ecology.js measuredNodeSpots reads it.\n'
            ' */\n'
            f'export const BARNACLE_SPOTS = Object.freeze({{\n{rows}{"," if rows else ""}\n}});\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--snaps', default=SNAPS)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--only', action='append', default=[])
    ap.add_argument('--crops', default='')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--threshold', type=float, default=THRESHOLD)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    if args.check:
        want = js_module(json.load(open(args.out))['streets'])
        have = open(JS_OUT).read() if os.path.exists(JS_OUT) else ''
        if want != have:
            print(f'{os.path.relpath(JS_OUT, ROOT)} is stale: run python3.11 -I tools/snap-placements/barnacles.py')
            return 1
        print(f'{os.path.relpath(JS_OUT, ROOT)} matches {os.path.relpath(args.out, ROOT)}')
        return 0
    snaps_dir = os.path.abspath(args.snaps)
    if not os.path.isdir(snaps_dir):
        print(f'no snaps at {snaps_dir} (research/eleven-snaps is not public): nothing to measure, {os.path.relpath(args.out, ROOT)} left as it is')
        return 0
    ecology = json.load(open(ECOLOGY))
    index = json.load(open(INDEX))['streets']
    jobs = []
    for tsid, row in sorted(ecology['streets'].items()):
        count = int((row or {}).get('counts', {}).get('mortar_barnacle') or 0)
        if count < 1 or (args.only and tsid not in args.only):
            continue
        meta = index.get(tsid)
        if not meta:
            continue
        street = json.load(open(os.path.join(ROOT, 'public', meta['file'])))
        b = street['bounds']
        snaps = find_snaps(snaps_dir, meta['label'], meta.get('hubName'))
        if snaps:
            jobs.append({'tsid': tsid, 'label': meta['label'], 'count': count, 'w': b['r'] - b['l'], 'h': b['b'] - b['t'], 'snaps': snaps, 'threshold': args.threshold})
    print(f'{len(jobs)} barnacle streets have full-street snaps')
    with Pool(max(1, args.jobs)) as pool:
        done = pool.map(street_job, jobs)
    streets, seen = {}, {}
    total = 0
    for job in sorted(done, key=lambda j: j['tsid']):
        for path, _, note in job['per_snap']:
            if note:
                print(f"  {job['label']}: {os.path.basename(path)} {note}")
        clusters = merge(job)
        keep = clusters[:job['count']]
        spots = sorted([[round(c['x'], 1), round(c['y'], 1), c['v']] for c in keep], key=lambda s: (s[0], s[1]))
        extra = clusters[job['count']:]
        print(f"{job['tsid']} {job['label']}: {len(spots)}/{job['count']} from {len(job['snaps'])} snaps"
              + (f" ({len(extra)} more hits dropped: {[(round(c['x']), round(c['y']), round(c['score'], 3)) for c in extra]})" if extra else '')
              + f" min score {min([c['score'] for c in keep], default=0):.3f}")
        if spots:
            streets[job['tsid']] = [[int(x) if float(x).is_integer() else x, int(y) if float(y).is_integer() else y, v] for x, y, v in spots]
            seen[job['tsid']] = len(job['snaps'])
            total += len(spots)
        if args.crops:
            save_crop(job, spots, args.crops)
    print(f'{total} barnacles on {len(streets)} streets')
    if args.dry or args.only:
        return 0
    out = {
        'source': 'Mortar Barnacle spots measured by tools/snap-placements/barnacles.py (player report #210) from '
                  'players\' full-street snaps of Nov-Dec 2012 gathered by the Eleven Giants project (collectors zoi, '
                  'mackenzie, cleops; reference only, no pixels kept): our CC0 barnacle art matched against each snap. '
                  'Each spot is [x, y, blister]: the frame cell\'s bottom centre in street px (0, 0 = the street\'s '
                  'top left, as street-model.js platformsScreen), and the blister variant the snap shows. '
                  '`snaps` is how many snaps of the street were matched. Do not edit by hand.',
        'streets': streets,
        'snaps': seen,
    }
    with open(args.out, 'w') as f:
        f.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('],"', '],\n"').replace('{"source"', '{\n"source"') + '\n')
    with open(JS_OUT, 'w') as f:
        f.write(js_module(streets))
    print(f'wrote {os.path.relpath(args.out, ROOT)} and {os.path.relpath(JS_OUT, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
