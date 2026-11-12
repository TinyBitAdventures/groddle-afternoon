#!/usr/bin/env python3.11
"""Quoin spots and kinds measured from players' full-street snaps (register G271, G257).

Tiny Speck's 2012 location files list each street's quoins (objrefs labelled "Coin") but never where
they hung or what kind each was, so the remake planned them on floor lines and picked each spot's
kind by a hash (js/quoins.js planStreetQuoins). This finds the real ones instead.

Evidence: the Eleven Giants project's full-street snaps from Nov-Dec 2012
(research/eleven-snaps/<region>/<collector>/<Street Name>[N]_<collector>.png, see its README).
Reference only: no snap pixel is ever copied into the repo. What this writes are positions and
kinds measured from them, which are facts.

A full-street snap is exactly the street (1 px = 1 street px, top left = bounds l, t), the same
space the game draws in (street-model.js platformsScreen). A snap of another size is resized to the
street when its aspect matches (within 0.5 %), else skipped.

Method, on our own CC0 quoin sheet (assets/sprites/quoin__x1_..._1354829599.webp, Tiny Speck's 1x
art: 24 frames x 8 kinds of 40 x 45, the coin's bob baked into the frames):
1. Candidates: masked normalized cross-correlation (grey, FFT) of each kind's coin body (the frame
   without its propeller, which spins) against the snap; every local best at CANDIDATE or over.
2. Kind and frame: around each candidate, masked colour NCC of all 192 full frames (propeller
   included) over a small window; the best frame names the kind. Quoins score 0.94-0.99 on most
   streets and 0.54-0.9 on streets drawn through a colour filter; every candidate checked by eye
   (all 186 under 0.9) was a quoin, so none is dropped (ACCEPT). A kind that wins by less than
   KIND_MARGIN (Umbra's black silhouettes) is not trusted: that street's kinds are left ''.
3. Every snap of a street is matched and the hits merged: one within MERGE_PX of another is the
   same quoin (a quoin grabbed before a snap is missing from it, and quoins bob).
Frames f and f + 12 of a kind are the same picture shifted (the propeller turns twice per bob), so
the frame cannot place the cell exactly; the coin body can. Each spot is therefore where the remake
should centre its 40 x 45 cell (game.js spawnWorldQuoin, anchor 0.5, 0.5) for the coin's bob to
centre on where the snap shows it: the body's position less its mean offset over the 24 frames.
Calibration: Eleven's one archived quoin (eleven-server bench fixture IHFK8C8NB6J2FJ5, Pansanu
Insanu x 376, y -484, i.e. 3376, 516 here) is measured at 3383, 512-513 in Zoi's and Cleops's snaps:
Glitch's x, y sits about 7 px left of the cell centre and 3 px under the bob's middle.

A street's measured quoins never exceed its file's Coin count (Tiny Speck's locations-xml.zip,
when it is beside the repo): the ones seen in the most snaps, then the best scores, are kept.
Qurazy quoins (a per-player roll on the street's Qurazy marker, G260, G271) are kept apart.

The game reads the same spots from public/js/quoin-spots-data.js (written from the JSON here, so the
browser, the realtime builder and the tests share them, with no fetch).

Usage (python3.11 has numpy + Pillow):
  python3.11 -I tools/snap-placements/quoins.py                 write quoin-spots.json and js/quoin-spots-data.js
  python3.11 -I tools/snap-placements/quoins.py --check         exit 1 when the .js does not match the .json (no snaps needed)
  python3.11 -I tools/snap-placements/quoins.py --crops <dir>   also save a crop sheet of every street's matches
  python3.11 -I tools/snap-placements/quoins.py --only GHFF2N2M36J2MG3 --dry
  --cache <file>  keep every snap's raw matches there and reuse them (to retune ACCEPT without rematching)
  --stats         print the score histogram of every match
With no research/eleven-snaps beside the repo (a public clone) it says so and writes nothing.
"""
import argparse, json, os, re, sys, unicodedata, zipfile
from multiprocessing import Pool

# One BLAS thread per worker: the pool is the parallelism (threaded matmuls per worker run 15x slower).
for _var in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_var, '1')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SNAPS = os.path.join(ROOT, '..', 'research', 'eleven-snaps')
LOCATIONS_ZIP = os.path.join(ROOT, '..', 'streets', 'locations-xml.zip')
SHEET = os.path.join(ROOT, 'public', 'assets', 'sprites', 'quoin__x1_1_x1_2_x1_3_x1_4_x1_5_x1_6_x1_7_x1_8_png_1354829599.webp')
ECOLOGY = os.path.join(ROOT, 'public', 'assets', 'content', 'street-ecology.json')
INDEX = os.path.join(ROOT, 'public', 'assets', 'streets', 'index.json')
OUT = os.path.join(ROOT, 'public', 'assets', 'content', 'quoin-spots.json')
JS_OUT = os.path.join(ROOT, 'public', 'js', 'quoin-spots-data.js')

# js/quoins.js QUOIN_TYPES rows (QUOIN_SHEET: 24 frames of 40 x 45 per row).
KINDS = ('xp', 'mood', 'energy', 'currants', 'mystery', 'favor', 'time', 'qurazy')
FW, FH, FRAMES = 40, 45, 24
CANDIDATE = 0.75
# Every stage 2 match from 0.54 to 0.9 (186 of them, crops in the lane notes) was a quoin, most on
# streets drawn through a colour filter (greyscale, Bliss's peach, Umbra's black silhouettes):
# the candidate pass is the real gate, so no match it finds is thrown away.
ACCEPT = 0.5
# A sighting whose best kind beats every other kind by less than this shows a shape and no colour
# (Umbra's silhouettes: all 22 such sightings); that street's kinds are left '' and the game hashes them.
KIND_MARGIN = 0.1
MERGE_PX = 20
MIN_STD = 0.03  # a flat patch (sky, a plain wall) never counts
WIN_X, WIN_Y = 3, 14
GPU_BAND = 800  # rows per GPU pass  # stage 2 window around a candidate's cell (the bob moves the body up to 12 px)
CACHE_VERSION = 1
# Collectors whose snaps never show a quoin (Mackenzie's: 0 of the first 170 matched, none in
# Pansanu Insanu where Zoi's and Cleops's show 10 and 11): matching them costs time and finds nothing.
NO_QUOIN_COLLECTORS = ('mackenzie',)


def norm(s):
    return unicodedata.normalize('NFC', s).lower().strip()


def fast_len(n):
    while True:
        m = n
        for p in (2, 3, 5):
            while m % p == 0:
                m //= p
        if m == 1:
            return n
        n += 1


class Art:
    """The quoin sheet: frames, each kind's coin body, and each frame's body offset."""

    def __init__(self, np, Image):
        self.np = np
        sheet = np.asarray(Image.open(SHEET).convert('RGBA')).astype(np.float64) / 255
        self.frames = [[sheet[k * FH:(k + 1) * FH, f * FW:(f + 1) * FW] for f in range(FRAMES)] for k in range(len(KINDS))]
        self.bodies = []  # per kind: (grey template, mask, top row in frame 0)
        self.offset = []  # per kind: body top row in each frame
        for k, kind in enumerate(KINDS):
            a0 = self.frames[k][0][..., 3] > 0.5
            if kind == 'qurazy':
                rows = np.where(a0.any(1))[0]
                top, bottom = int(rows[0]), int(rows[-1]) + 1
            else:
                top, bottom = self.body_rows(a0)
            body = self.frames[k][0][top:bottom]
            self.bodies.append((self.gray(body), (body[..., 3] > 0.5).astype(np.float64), top))
            offs = []
            for f in range(FRAMES):
                af = (self.frames[k][f][..., 3] > 0.5).astype(np.float64)
                mb = body[..., 3] > 0.5
                best = (-1, 0)
                for y in range(0, FH - (bottom - top) + 1):
                    s = (af[y:y + bottom - top] * mb).sum() - (af[y:y + bottom - top] * ~mb).sum()
                    if s > best[0]:
                        best = (s, y)
                offs.append(best[1])
            self.offset.append(offs)
        self.mean_offset = [sum(o) / len(o) for o in self.offset]
        Ms, Ts, keys = [], [], []
        for k in range(len(KINDS)):
            for f in range(FRAMES):
                fr = self.frames[k][f]
                M = (fr[..., 3] > 0.5).astype(np.float64)
                n = M.sum()
                T = fr[..., :3] * M[..., None]
                T = (T - (T.sum((0, 1)) / n)[None, None, :]) * M[..., None]
                Ms.append(M.ravel())
                Ts.append(T.reshape(-1))
                keys.append((k, f))
        self.Ms = np.array(Ms).T  # (FH*FW, K)
        self.Ts = np.array(Ts).T  # (FH*FW*3, K)
        self.tnorm = np.sqrt((self.Ts * self.Ts).sum(0))
        self.n = self.Ms.sum(0)
        self.keys = keys

    def gray(self, a):
        return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114

    def body_rows(self, alpha):
        """The coin under the propeller: the rows after its stem (the last 1-2 px wide row in the top part)."""
        np = self.np
        w = alpha.sum(1)
        rows = np.where(w > 0)[0]
        stem = [y for y in rows if w[y] <= 2 and y < rows[-1] - 12]
        return (max(stem) + 1 if stem else int(rows[0])), int(rows[-1]) + 1

    def candidates(self, img, threshold=CANDIDATE):
        """Stage 1: (score, cell left, cell top as if frame 0, kind) local bests."""
        np = self.np
        I = self.gray(img)
        found = None
        if self.gpu():
            try:
                # Bands of rows keep the GPU's maps small on the biggest streets.
                found = []
                hmax = max(T.shape[0] for T, _, _ in self.bodies)
                for y0 in range(0, I.shape[0], GPU_BAND):
                    band = I[y0:y0 + GPU_BAND + hmax]
                    if band.shape[0] < hmax:
                        break
                    found += [(sc, x, y + y0, k) for sc, x, y, k in self.hits_gpu(band, threshold) if y < GPU_BAND]
            except RuntimeError:
                # Out of GPU memory (other apps hold it): this snap on the CPU.
                self._torch.mps.empty_cache()
                found = None
        if found is None:
            found = []
            for k, score in enumerate(self.scores_fft(I)):
                ys, xs = np.where(score >= threshold)
                found += [(float(score[y, x]), int(x), int(y), k) for y, x in zip(ys, xs)]
        hits = [(sc, x, y - self.bodies[k][2], k) for sc, x, y, k in found]
        hits.sort(reverse=True)
        picks = []
        for hit in hits:
            if all(abs(hit[1] - p[1]) > 15 or abs(hit[2] - p[2]) > 15 for p in picks):
                picks.append(hit)
        return picks

    def scores_fft(self, I):
        """Each kind's body NCC map over grey image I (numpy FFT, float64)."""
        np = self.np
        H, W = I.shape
        shape = (fast_len(H + FH), fast_len(W + FW))
        F1 = np.fft.rfft2(I, shape)
        F2 = np.fft.rfft2(I * I, shape)
        out = []
        for T, M, _ in self.bodies:
            h, w = T.shape
            n = M.sum()
            Tp = (T - (T * M).sum() / n) * M
            FM = np.conj(np.fft.rfft2(M, shape))
            num = np.fft.irfft2(F1 * np.conj(np.fft.rfft2(Tp, shape)), shape)[:H - h + 1, :W - w + 1]
            s1 = np.fft.irfft2(F1 * FM, shape)[:H - h + 1, :W - w + 1]
            s2 = np.fft.irfft2(F2 * FM, shape)[:H - h + 1, :W - w + 1]
            var = np.maximum(s2 - s1 * s1 / n, 0)
            score = num / np.sqrt((Tp * Tp).sum() * np.maximum(var, 1e-9))
            score[var / n < MIN_STD * MIN_STD] = 0
            out.append(score)
        return out

    def gpu(self):
        """torch with Metal (MPS) when this Mac has it: the same NCC as direct convolutions, about 5x faster."""
        if not hasattr(self, '_torch'):
            self._torch = None
            if os.environ.get('QUOINS_NO_GPU') != '1':
                try:
                    import torch
                    if torch.backends.mps.is_available():
                        self._torch = torch
                except Exception:
                    pass
        return self._torch is not None

    def hits_gpu(self, I, threshold):
        """scores_fft's maps worked out on the GPU (float32), only the (score, x, y, kind) at threshold come back."""
        np, torch = self.np, self._torch
        import torch.nn.functional as F
        H, W = I.shape
        hmax = max(T.shape[0] for T, _, _ in self.bodies)
        Tps, Ms, ns, tn = [], [], [], []
        for T, M, _ in self.bodies:
            n = M.sum()
            Tp = (T - (T * M).sum() / n) * M
            pad = ((0, hmax - T.shape[0]), (0, 0))
            Tps.append(np.pad(Tp, pad))
            Ms.append(np.pad(M, pad))
            ns.append(n)
            tn.append(np.sqrt((Tp * Tp).sum()))
        dev = torch.device('mps')
        K = len(Tps)
        # Centre the image first so float32 keeps the windowed variance exact enough; the rows under
        # the street pad the taller kinds' kernels.
        Ic = np.pad(I - I.mean(), ((0, hmax), (0, 0)))
        x = torch.from_numpy(np.stack([Ic, Ic * Ic])[:, None].astype(np.float32)).to(dev)
        k = torch.from_numpy(np.stack(Tps + Ms)[:, None].astype(np.float32)).to(dev)
        n = torch.tensor(ns, dtype=torch.float32, device=dev)[:, None, None]
        t = torch.tensor(tn, dtype=torch.float32, device=dev)[:, None, None]
        out = []
        with torch.no_grad():
            a = F.conv2d(x[:1], k)[0]
            s2 = F.conv2d(x[1:], k[K:])[0]
            num, s1 = a[:K], a[K:]
            var = torch.clamp(s2 - s1 * s1 / n, min=0)
            score = num / (t * torch.sqrt(torch.clamp(var, min=1e-9)))
            score = torch.where(var / n < MIN_STD * MIN_STD, torch.zeros_like(score), score)
            idx = torch.nonzero(score >= threshold).cpu().numpy()
            vals = score[score >= threshold].cpu().numpy() if len(idx) else []
        for (kk, y, xx), v in zip(idx, vals):
            if y <= H - self.bodies[kk][0].shape[0]:  # inside the street for this kind's own height
                out.append((float(v), int(xx), int(y), int(kk)))
        return out

    def classify(self, img, cand):
        """Stage 2: (score, kind, frame, spot x, spot y, margin) of the best full frame near a candidate;
        margin: how far the best frame of any other kind scores below it (a silhouette street such as
        Umbra, all black, leaves the coin's shape and no colour, so its kind is a guess)."""
        np = self.np
        _, cx, cy, _ = cand
        H, W = img.shape[:2]
        x0, y0 = max(0, cx - WIN_X), max(0, cy - WIN_Y)
        x1, y1 = min(W, cx + WIN_X + FW), min(H, cy + WIN_Y + FH)
        R = img[y0:y1, x0:x1]
        if R.shape[0] < FH or R.shape[1] < FW:
            return None
        win = np.lib.stride_tricks.sliding_window_view(R, (FH, FW), axis=(0, 1))
        ny, nx = win.shape[:2]
        P = np.ascontiguousarray(win.transpose(0, 1, 3, 4, 2)).reshape(ny * nx, FH * FW, 3)
        num = P.reshape(ny * nx, -1) @ self.Ts
        var = np.zeros_like(num)
        for c in range(3):
            Pc = P[..., c]
            a = Pc @ self.Ms
            var += np.maximum((Pc * Pc) @ self.Ms - a * a / self.n, 0)
        score = num / (np.sqrt(var) * self.tnorm + 1e-9)
        w, j = np.unravel_index(int(np.argmax(score)), score.shape)
        k, f = self.keys[j]
        per_kind = score.max(0).reshape(len(KINDS), FRAMES).max(1)
        margin = float(score[w, j] - max(v for i, v in enumerate(per_kind) if i != k))
        left, top = x0 + w % nx, y0 + w // nx
        # The cell whose mean bob puts the coin where the snap shows it.
        x = left + FW / 2
        y = top + FH / 2 + self.offset[k][f] - self.mean_offset[k]
        return (float(score[w, j]), k, f, round(x, 1), round(y, 1), round(margin, 4))


ART = None


def worker_init(counter, gpu_workers):
    """The first gpu_workers of the pool share the GPU (Metal serializes them); the rest use numpy's FFT."""
    with counter.get_lock():
        counter.value += 1
        if counter.value > gpu_workers:
            os.environ['QUOINS_NO_GPU'] = '1'


def snap_job(job):
    """Every candidate's best frame in one snap: [(score, kind, frame, x, y)] or a skip note."""
    global ART
    import numpy as np
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    if ART is None:
        ART = Art(np, Image)
    path, W, H = job['path'], job['w'], job['h']
    im = Image.open(path).convert('RGB')
    if im.size != (W, H):
        if abs(im.size[0] / im.size[1] - W / H) > 0.005 * (W / H):
            return {**job, 'hits': None, 'note': f'skipped: {im.size[0]}x{im.size[1]} is not {W}x{H}'}
        im = im.resize((W, H), Image.LANCZOS)
    img = np.asarray(im).astype(np.float64) / 255
    hits = []
    if job.get('rekind') is not None:
        # A cache from before margins: classify again around each hit's own cell (no stage 1).
        cands = [(h[5], int(round(h[3] - FW / 2)), int(round(h[4] - FH / 2)), 0) for h in job['rekind']]
    else:
        cands = ART.candidates(img)
    for cand in cands:
        best = ART.classify(img, cand)
        if best:
            hits.append([round(best[0], 4), KINDS[best[1]], best[2], best[3], best[4], round(cand[0], 4), best[5]])
    return {**job, 'hits': hits, 'note': ''}


def merge(snaps, accept):
    """Clusters of accepted hits across a street's snaps: [{x, y, kind, score, margin, snaps, kinds}].
    The place is the best-scoring sighting's; the kind the most certain sighting's (largest margin),
    '' when even that one is under KIND_MARGIN."""
    clusters = []
    for path, hits in snaps:
        for score, kind, frame, x, y, _, margin in hits or []:
            if score < accept:
                continue
            for c in clusters:
                if abs(c['x'] - x) <= MERGE_PX and abs(c['y'] - y) <= MERGE_PX:
                    if path not in c['snaps']:
                        c['snaps'].append(path)
                    c['kinds'][kind] = c['kinds'].get(kind, 0) + 1
                    if score > c['score']:
                        c.update(score=score, x=x, y=y, path=path)
                    if margin > c['margin']:
                        c.update(margin=margin, seen=kind)
                    break
            else:
                clusters.append({'x': x, 'y': y, 'path': path, 'seen': kind, 'score': score, 'margin': margin, 'snaps': [path], 'kinds': {kind: 1}})
    # One near tie means the street is drawn so a quoin shows its shape and not its colour (Umbra's
    # black silhouettes: a currants, mood and time coin are one black disc there), so no sighting on
    # it names a kind.
    hidden = any(c['margin'] < KIND_MARGIN for c in clusters if c['seen'] != 'qurazy')
    for c in clusters:
        c['kind'] = '' if hidden else c['seen']
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


def coin_counts(source_tsids):
    """{L tsid: Coin objrefs in its 2012 location file}, or {} without locations-xml.zip."""
    if not os.path.exists(LOCATIONS_ZIP):
        return {}
    out = {}
    with zipfile.ZipFile(LOCATIONS_ZIP) as z:
        names = {os.path.basename(n)[:-4]: n for n in z.namelist() if n.endswith('.xml')}
        for tsid in source_tsids:
            if tsid not in names:
                continue
            xml = z.read(names[tsid]).decode('utf8', 'replace')
            m = re.search(r'<objrefs id="items">(.*?)</objrefs>', xml, re.S)
            out[tsid] = len(re.findall(r'label="(?:Coin|Quoin)"', m.group(1))) if m else 0
    return out


def save_crop(street, clusters, crops):
    """A sheet of every spot, each cut from the snap that shows it best."""
    from PIL import Image, ImageDraw
    Image.MAX_IMAGE_PIXELS = None
    if not clusters:
        return
    images = {}
    tiles = []
    for c in sorted(clusters, key=lambda c: (c['x'], c['y'])):
        x, y, kind = c['x'], c['y'], c['kind'] or f"? {c['seen']}"
        if c['path'] not in images:
            im = Image.open(c['path']).convert('RGB')
            if im.size != (street['w'], street['h']):
                im = im.resize((street['w'], street['h']), Image.LANCZOS)
            images[c['path']] = im
        box = (int(x - 50), int(y - 50), int(x + 50), int(y + 50))
        tile = images[c['path']].crop(box).resize((200, 200))
        d = ImageDraw.Draw(tile)
        d.rectangle(((x - FW / 2 - box[0]) * 2, (y - FH / 2 - box[1]) * 2, (x + FW / 2 - box[0]) * 2, (y + FH / 2 - box[1]) * 2), outline=(255, 0, 255), width=1)
        d.text((4, 4), f'{x:.0f},{y:.0f} {kind}', fill=(255, 0, 255))
        tiles.append(tile)
    cols = min(8, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 204, rows * 204), (30, 30, 30))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 204, (i // cols) * 204))
    os.makedirs(crops, exist_ok=True)
    sheet.save(os.path.join(crops, f"{street['tsid']}-{re.sub(r'[^a-z0-9]+', '-', norm(street['label']))}.png"))


def js_module(streets, coins):
    rows = ',\n'.join(f'  {json.dumps(t)}: {json.dumps(v, separators=(",", ":"))}' for t, v in sorted(streets.items()))
    counts = ',\n'.join(f'  {json.dumps(t)}: {n}' for t, n in sorted(coins.items()))
    return ('// Generated by tools/snap-placements/quoins.py from assets/content/quoin-spots.json: never edit by hand.\n'
            '/**\n'
            ' * Register G271/G257: where each street\'s quoins hung and what kind each was, measured on players\'\n'
            ' * full-street snaps (see the JSON\'s source note). { [G tsid]: [[x, y, kind], ...] }: the centre of the\n'
            ' * quoin\'s 40 x 45 cell in street px (the coin bobs around it) and its js/quoins.js QUOIN_TYPES id\n'
            ' * (\'\' where the snap shows its shape and no colour: the kind is then hashed as elsewhere).\n'
            ' * js/quoins.js measuredStreetQuoins reads it.\n'
            ' */\n'
            f'export const QUOIN_SPOTS = Object.freeze({{\n{rows}{"," if rows else ""}\n}});\n'
            '\n'
            '/** Those streets\' Coin objrefs in their 2012 location files: how many quoins each had (js/quoins.js streetQuoinPoints). */\n'
            f'export const QUOIN_COIN_COUNTS = Object.freeze({{\n{counts}{"," if counts else ""}\n}});\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--snaps', default=SNAPS)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--only', action='append', default=[])
    ap.add_argument('--crops', default='')
    ap.add_argument('--cache', default='')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--stats', action='store_true')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--gpu-workers', type=int, default=1)
    ap.add_argument('--accept', type=float, default=ACCEPT)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    if args.check:
        data = json.load(open(args.out))
        want = js_module(data['streets'], data.get('coins', {}))
        have = open(JS_OUT).read() if os.path.exists(JS_OUT) else ''
        if want != have:
            print(f'{os.path.relpath(JS_OUT, ROOT)} is stale: run python3.11 -I tools/snap-placements/quoins.py')
            return 1
        print(f'{os.path.relpath(JS_OUT, ROOT)} matches {os.path.relpath(args.out, ROOT)}')
        return 0
    snaps_dir = os.path.abspath(args.snaps)
    if not os.path.isdir(snaps_dir):
        print(f'no snaps at {snaps_dir} (research/eleven-snaps is not public): nothing to measure, {os.path.relpath(args.out, ROOT)} left as it is')
        return 0
    ecology = json.load(open(ECOLOGY))['streets']
    index = json.load(open(INDEX))['streets']
    streets = []
    for tsid, meta in sorted(index.items()):
        if not tsid.startswith('G') or tsid.startswith('GZ') or (args.only and tsid not in args.only):
            continue
        street = json.load(open(os.path.join(ROOT, 'public', meta['file'])))
        b = street['bounds']
        snaps = [p for p in find_snaps(snaps_dir, meta['label'], meta.get('hubName'))
                 if os.path.basename(os.path.dirname(p)) not in NO_QUOIN_COLLECTORS]
        if snaps:
            source = (ecology.get(tsid) or {}).get('sourceTsid') or ('L' + tsid[1:])
            streets.append({'tsid': tsid, 'label': meta['label'], 'source': source, 'w': b['r'] - b['l'], 'h': b['b'] - b['t'], 'snaps': snaps})
    print(f'{len(streets)} streets have full-street snaps ({sum(len(s["snaps"]) for s in streets)} snaps)')
    coins = coin_counts([s['source'] for s in streets])
    cache = {}
    if args.cache and os.path.exists(args.cache):
        cache = json.load(open(args.cache))
        if cache.get('version') != CACHE_VERSION:
            cache = {}
    cache.setdefault('version', CACHE_VERSION)
    cache.setdefault('snaps', {})
    jobs = []
    for s in streets:
        for path in s['snaps']:
            key = f"{os.path.relpath(path, snaps_dir)}@{s['w']}x{s['h']}"
            row = cache['snaps'].get(key)
            if row is None:
                jobs.append({'key': key, 'path': path, 'w': s['w'], 'h': s['h']})
            elif row['hits'] and any(len(h) < 7 for h in row['hits']):
                jobs.append({'key': key, 'path': path, 'w': s['w'], 'h': s['h'], 'rekind': row['hits']})
    print(f'{len(jobs)} snaps to match')
    from multiprocessing import Value
    with Pool(max(1, args.jobs), initializer=worker_init, initargs=(Value('i', 0), args.gpu_workers)) as pool:
        for i, done in enumerate(pool.imap_unordered(snap_job, jobs, chunksize=1)):
            cache['snaps'][done['key']] = {'hits': done['hits'], 'note': done['note']}
            if args.cache and i % 10 == 9:
                json.dump(cache, open(args.cache, 'w'))
    if args.cache:
        json.dump(cache, open(args.cache, 'w'))
    if args.stats:
        bins = {}
        for row in cache['snaps'].values():
            for h in row['hits'] or []:
                b = round(int(h[0] * 50) / 50, 2)
                bins[b] = bins.get(b, 0) + 1
        print('stage 2 score histogram:', dict(sorted(bins.items())))
    out_streets, seen, counts, qurazy = {}, {}, {}, {}
    total, kinds, capped, mixed = 0, {}, 0, 0
    for s in streets:
        per_snap = []
        for path in s['snaps']:
            row = cache['snaps'][f"{os.path.relpath(path, snaps_dir)}@{s['w']}x{s['h']}"]
            if row['note']:
                print(f"  {s['label']}: {os.path.basename(path)} {row['note']}")
            per_snap.append((path, row['hits']))
        clusters = merge(per_snap, args.accept)
        q = [c for c in clusters if c['seen'] == 'qurazy']
        clusters = [c for c in clusters if c['seen'] != 'qurazy']
        n = coins.get(s['source'])
        keep = clusters[:n] if n is not None else clusters
        if n is not None and len(clusters) > n:
            capped += 1
        mixed += sum(1 for c in keep if len(c['kinds']) > 1)
        spots = sorted([[c['x'], c['y'], c['kind']] for c in keep], key=lambda r: (r[0], r[1]))
        line = f"{s['tsid']} {s['label']}: {len(spots)}{'/' + str(n) if n is not None else ''} from {len(s['snaps'])} snaps"
        if n is not None and len(clusters) > n:
            line += f" ({len(clusters) - n} more dropped)"
        if q:
            line += f" qurazy {[(c['x'], c['y']) for c in q]}"
        print(line)
        if spots:
            out_streets[s['tsid']] = [[int(x) if float(x).is_integer() else x, int(y) if float(y).is_integer() else y, k] for x, y, k in spots]
            seen[s['tsid']] = len(s['snaps'])
            if n is not None:
                counts[s['tsid']] = n
            total += len(spots)
            for _, _, k in spots:
                kinds[k] = kinds.get(k, 0) + 1
        if q:
            qurazy[s['tsid']] = [[c['x'], c['y']] for c in q]
        if args.crops:
            save_crop(s, keep + q, args.crops)
    print(f'{total} quoins on {len(out_streets)} streets; kinds {dict(sorted(kinds.items()))}; '
          f'{capped} streets capped at their Coin count; {mixed} spots seen as two kinds; qurazy on {len(qurazy)} streets')
    if args.dry or args.only:
        return 0
    out = {
        'source': 'Quoin spots and kinds measured by tools/snap-placements/quoins.py (register G271, G257) from '
                  'players\' full-street snaps of Nov-Dec 2012 gathered by the Eleven Giants project (collectors zoi, '
                  'cleops, shellos and donors; Mackenzie\'s snaps show no quoins; reference only, no pixels kept): our CC0 quoin sheet matched against '
                  'every snap of a street and the matches merged. Each spot is [x, y, kind]: the centre of the '
                  'quoin\'s 40 x 45 cell in street px (0, 0 = the street\'s top left, as street-model.js '
                  'platformsScreen), placed so the coin\'s baked bob centres on where the snaps show it, and the '
                  'kind (js/quoins.js QUOIN_TYPES) its art shows, \'\' where a colour filter leaves only its '
                  'shape (the game then picks the kind as for an unmeasured street). `snaps` is how many snaps of the street were '
                  'matched, `coins` the Coin objrefs in its 2012 location file (Tiny Speck locations-xml.zip, '
                  'CC0; a street never has more measured quoins than that), `qurazy` the Qurazy quoins seen '
                  '(a per-player roll on the street\'s marker, not a natural spot). Do not edit by hand.',
        'streets': out_streets,
        'snaps': seen,
        'coins': counts,
        'qurazy': qurazy,
    }
    with open(args.out, 'w') as f:
        f.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('],"', '],\n"').replace('{"source"', '{\n"source"') + '\n')
    with open(JS_OUT, 'w') as f:
        f.write(js_module(out_streets, counts))
    print(f'wrote {os.path.relpath(args.out, ROOT)} and {os.path.relpath(JS_OUT, ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
