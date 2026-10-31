#!/usr/bin/env python3.11
"""Frame strips for the street decos the original played: placements flagged animated (G435).

The client shows a placed deco stopped on its first frame unless the placement is flagged
animated (DecoRenderer.as 301-305: MCUtil.recursiveGotoAndStop(decoAsset, 0), else
MCUtil.recursivePlay(decoAsset)), and a playing deco runs its whole timeline, nested clips on
their own clocks, at the stage's frame rate (TSEngineConstants.TARGET_FRAMERATE 30; FlashVarModel
fps defaults to it). build-street-layers.mjs carries the flag from the location XML into the
street JSON (`animated: true`); this renders those decos' timelines and js/street-render.js plays
them (js/deco-anim.js).

Per deco (the same bundle SWF the still came from: plan.json's `swf`, else the bundle that places
it most, as recover.py picks):
- Loop: the root timeline's frames, or, when nested clips run longer (a one-frame root whose
  child twinkles for 30), the least common multiple of every timeline under it while that stays
  within MAX_PERIOD, else the longest one (the nested clips' phase then jumps once a loop:
  fireflies, light_discs_02/03/05). FFDec draws every nested clip on its own clock from when it
  was placed, as Flash plays them; past the root's last frame it needs a work copy whose root is
  one sprite holding the old root timeline, padded to the loop (wrap()).
- Frame scripts: the decos' ActionScript is the item-animation template (frame 1 only inits) or
  nothing, except LOOP_FROM below.
- Strips: every frame resampled from the FFDec render (zoom 2, or 3 where the still has a 3x file)
  onto the still's pixel size (the 2x strip) and 1.5 times it (the 3x strip, for decos in
  js/deco-hires-list.js HIRES_DECOS), trimmed to its pixels, identical frames stored once,
  packed into one WebP of at most MAX_SIDE a side, encoded like build.py (lossy q82, lossless
  alpha, lossless where lossy shows). Size to need: a strip is drawn smaller than the still's
  size when every animated placement draws it at under NEED_TEXELS texels per world pixel (and
  blurred-layer placements at their bake's density), and smaller again past MAX_BYTES decoded
  (MAX_BYTES_3X for the 3x strip, which is left out under MIN_3X times the 2x density). A street
  holds at most STREET_BYTES of 2x strips, counting each colour layer's recoloured copy
  (js/street-render.js bakeLayerColour): past it, the strips that cost that street most are drawn
  smaller (street_caps, from each strip's bytes at full size in the last build: run twice on a
  fresh plan).
- Output: public/assets/decos/animated/<name>.webp (+ <name>@1.5x.webp), <name>.json (loop,
  sequence, per strip its density and frame rects), animated.json here (inputs, sizes, hashes) and
  public/js/deco-anim-list.js (name -> frames, loop start, 3x).

Rebuilt rooms play a few decos no archived street places (SCENE_ANIMATED: An Autumn Day's falling
leaves and the girl on the bench, Being Watched's lit TVs): the same strips, made at the stage's full
3x, with no still and no placements; js/deco-anim.js sceneAnim draws them.

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp 1.6):
  python3.11 -I tools/deco-pipeline/animate.py --list
  python3.11 -I tools/deco-pipeline/animate.py --work <scratch> [--only a,b] [--batch 4]
  python3.11 -I tools/deco-pipeline/animate.py --check        (no rendering; exit 1 on any problem)
Glitch-locations is data only: SWFs are read by FFDec, never executed.
"""
import argparse, collections, hashlib, json, math, os, shutil, struct, sys, time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ in tools/
sys.path.insert(0, HERE)
import build  # noqa: E402
import recover  # noqa: E402
audit = build.audit
swfinfo = build.swfinfo

PUBLIC = build.PUBLIC
STREETS = build.STREETS
OUT = os.path.join(PUBLIC, 'assets', 'decos', 'animated')
PLAN = os.path.join(HERE, 'animated.json')
LIST_JS = os.path.join(PUBLIC, 'js', 'deco-anim-list.js')

FPS = 30            # TSEngineConstants.TARGET_FRAMERATE
MAX_PERIOD = 600    # longest loop rendered (20 s); past it the longest timeline
NEED_TEXELS = 3.0   # texels per world px a strip never needs to exceed (js/deco-hires.js SHARP_SLACK at the top density)
MAX_BYTES = 24 << 20  # decoded RGBA bytes of one 2x strip
MAX_BYTES_3X = 16 << 20  # and of one 3x strip
MIN_3X = 1.2        # a 3x strip under 1.2 times the 2x one's density is not made
STREET_BYTES = 80 << 20  # decoded 2x strips one street holds, recoloured copies included
MAX_SIDE = 4096     # atlas side (every WebGL 2 GPU)
PAD = 2             # transparent px between packed frames
SETTINGS = {'version': 1, 'fps': FPS, 'max_period': MAX_PERIOD, 'need': NEED_TEXELS, 'max_bytes': MAX_BYTES,
            'max_bytes_3x': MAX_BYTES_3X, 'min_3x': MIN_3X, 'street_bytes': STREET_BYTES,
            'max_side': MAX_SIDE, 'pad': PAD, 'quality': build.SETTINGS['quality'],
            'lossless_over': build.SETTINGS['lossless_over']}

# Frame scripts that change the loop (decompiled with FFDec -export script, data only):
# hell_yelling_head_v2_fla.MainTimeline frame350: this.gotoAndPlay("half blink").
LOOP_FROM = {'hell_yelling_head_v2': 'half blink'}

# Decos no archived street places that a rebuilt room plays (its location is lost, its art is not):
# name -> (bundle, what it is). They have no still in manifest.json (a room shows nothing until the
# strip is in), take the 3x strip at the stage's full size, and count no placements. The rooms place
# them through js/deco-anim.js sceneAnim.
SCENE_ANIMATED = {
    # An Autumn Day (js/quest-rooms/an-autumn-day.js): quest01.swf, the bundle with the memory's own
    # decos. Each is one leaf falling down a 140 x 360 stage (frame 1 of 01a and 01c is blank: their
    # leaf sets off at frame 23 and 49).
    'falling_leaves_01_anatumunsday': ('quest01.swf', 'a leaf falling down a 140 x 360 column, 120 frames'),
    'falling_leaves_01a_anatumunsday': ('quest01.swf', 'a leaf falling down a 140 x 360 column, from frame 23 of 277'),
    'falling_leaves_01b_anatumunsday': ('quest01.swf', 'a leaf falling down a 140 x 360 column, 254 frames'),
    'falling_leaves_01c_anatumunsday': ('quest01.swf', 'a leaf falling down a 140 x 360 column, frames 49 to 192 of 313'),
    'silhouette_girl_anautumsday': ('quest01.swf', 'the girl on the bench, her hair blowing (33 frames)'),
    # Being Watched (js/quest-rooms/being-watched.js): the Bureaucratic Hall's TV with its screen lit
    # and flickering (nested clips of 17, 9 and 8 frames: the 17-frame loop, as for any deco).
    'bureaucratic_hall_tv_1_animated': ('bldg_int_bhall.swf', 'a ceiling TV, its pale screen glowing and flickering'),
}

CONTROL = {1, 4, 5, 12, 15, 18, 19, 26, 28, 43, 45, 70, 89}  # tags that belong to a timeline


# ---------- SWF timelines ----------

def tags(body, start, end):
    """(code, header offset, data offset, length) for one timeline's own tags."""
    p = start
    while p < end:
        h0 = p
        h = struct.unpack_from('<H', body, p)[0]; p += 2
        code, ln = h >> 6, h & 0x3f
        if ln == 0x3f:
            ln = struct.unpack_from('<I', body, p)[0]; p += 4
        yield code, h0, p, ln
        if code == 0:
            return
        p += ln


def placed_char(body, code, q):
    if code == 4:
        return struct.unpack_from('<H', body, q)[0]
    flags = body[q]
    if not flags & 0x02:
        return None
    p = q + 1
    if code == 70:
        flags2 = body[p]; p += 1
        p += 2  # depth
        if flags2 & 0x08 or (flags2 & 0x10 and flags & 0x02 and False):
            p = body.index(0, p) + 1  # class name
        return struct.unpack_from('<H', body, p)[0]
    return struct.unpack_from('<H', body, p + 2)[0]


def timeline(path):
    """Root frame count, labels, and the frame counts of every sprite placed under the root."""
    body = swfinfo.swf_body(path)[0]
    start = swfinfo.rect_len(body) + 4
    sprites = {}

    def walk(s, e):
        tl = {'frames': 0, 'places': set(), 'labels': {}}
        for code, h0, q, ln in tags(body, s, e):
            if code == 1:
                tl['frames'] += 1
            elif code == 43:
                tl['labels'][body[q:body.index(0, q)].decode('latin1')] = tl['frames'] + 1
            elif code in (4, 26, 70):
                c = placed_char(body, code, q)
                if c is not None:
                    tl['places'].add(c)
            elif code == 39:
                sid = struct.unpack_from('<H', body, q)[0]
                sprites[sid] = walk(q + 4, q + ln)
        return tl

    root = walk(start, len(body))
    lens, seen, stack = [], set(), list(root['places'])
    while stack:
        c = stack.pop()
        if c in seen or c not in sprites:
            continue
        seen.add(c)
        if sprites[c]['frames'] > 1:
            lens.append(sprites[c]['frames'])
        stack.extend(sprites[c]['places'])
    return {'root': max(1, root['frames']), 'nested': sorted(set(lens), reverse=True), 'labels': root['labels']}


def loop_period(tl):
    all_lens = [tl['root']] + tl['nested']
    lcm = 1
    for n in all_lens:
        lcm = lcm * n // math.gcd(lcm, n)
        if lcm > MAX_PERIOD:
            break
    return lcm if lcm <= MAX_PERIOD else max(all_lens)


def wrap(src, dst, period):
    """A work copy whose root holds the old root timeline as one sprite, then `period` frames."""
    body, ver = swfinfo.swf_body(src)
    r = swfinfo.rect_len(body)
    frames = struct.unpack_from('<H', body, r + 2)[0]
    defs, ctrl, ids = [], [], set()
    for code, h0, q, ln in tags(body, r + 4, len(body)):
        if code in (0, 86):  # End, root scene/label data
            continue
        raw = body[h0:q + ln]
        if code in CONTROL:
            ctrl.append(raw)
        else:
            defs.append(raw)
            if code not in (69, 9, 77, 76, 82, 72, 65, 64, 63, 41, 24, 58, 56, 87) and ln >= 2:
                ids.add(struct.unpack_from('<H', body, q)[0])
    nid = next(i for i in range(65535, 0, -1) if i not in ids)
    long_tag = lambda code, data: struct.pack('<HI', (code << 6) | 0x3f, len(data)) + data
    sprite = long_tag(39, struct.pack('<HH', nid, frames) + b''.join(ctrl) + b'\x00\x00')
    place = long_tag(26, bytes([0x02]) + struct.pack('<HH', 1, nid))
    out = body[:r + 2] + struct.pack('<H', period) + b''.join(defs) + sprite + place + b'\x40\x00' * period + b'\x00\x00'
    with open(dst, 'wb') as f:
        f.write(b'FWS' + bytes([ver]) + struct.pack('<I', len(out) + 8) + out)


# ---------- Erase ----------
# Flash's Erase blend mode (PlaceObject3 blend 12) cuts the child's shape out of its parent's
# layer. FFDec does not draw it at all, so the eraser's cut is lost and the layer renders whole.
# portal_wintry is the one deco that erases: its pale oval is a white rectangle (alpha 189) with a
# rectangle-with-an-oval-hole erased from it, then blurred; FFDec drew the whole rectangle, and
# Northwest Passage showed a translucent white box where the wintry portal is (Austin 2026-10-31).
# The fix renders such a deco twice: as FFDec draws it (the eraser skipped) and with the eraser
# drawn as a normal child. Where the eraser covers a translucent layer, the second render is more
# opaque by exactly the covered part: g = (a_drawn - a) / (1 - a), and the erased frame keeps
# 1 - g of its alpha (unerase()).
ERASE = 12  # BlendMode.ERASE
DRAWN = '~eraser-drawn'  # the work copy's suffix


class _Bits:
    def __init__(self, b, p):
        self.b, self.p, self.bit = b, p, 0

    def u(self, n):
        v = 0
        for _ in range(n):
            v = (v << 1) | ((self.b[self.p] >> (7 - self.bit)) & 1)
            self.bit += 1
            if self.bit == 8:
                self.bit, self.p = 0, self.p + 1
        return v

    def end(self):
        return self.p + (1 if self.bit else 0)


def _skip_matrix(b, p):
    r = _Bits(b, p)
    for _ in range(2):  # scale, rotate
        if r.u(1):
            n = r.u(5)
            r.u(2 * n)
    n = r.u(5)
    r.u(2 * n)
    return r.end()


def _skip_cxform(b, p):
    r = _Bits(b, p)
    add, mult, n = r.u(1), r.u(1), r.u(4)
    r.u(n * 4 * (add + mult))
    return r.end()


# Fixed filter sizes after the type byte: DropShadow, Blur, Glow, Bevel, ColorMatrix.
_FILTER_BYTES = {0: 23, 1: 9, 2: 15, 3: 27, 6: 80}


def blend_at(b, q):
    """Offset of a PlaceObject3's blend mode byte (data at q), or None when it has none."""
    f1, f2 = b[q], b[q + 1]
    if not f2 & 0x02:
        return None
    p = q + 4  # flags, depth
    if f2 & 0x08 or (f2 & 0x10 and f1 & 0x02):
        p = b.index(0, p) + 1  # class name
    p += 2 if f1 & 0x02 else 0  # character
    if f1 & 0x04:
        p = _skip_matrix(b, p)
    if f1 & 0x08:
        p = _skip_cxform(b, p)
    p += 2 if f1 & 0x10 else 0  # ratio
    if f1 & 0x20:
        p = b.index(0, p) + 1  # name
    p += 2 if f1 & 0x40 else 0  # clip depth
    if f2 & 0x01:
        count = b[p]
        p += 1
        for _ in range(count):
            t = b[p]
            p += 1
            if t in (4, 7):  # gradient glow / bevel
                p += 1 + 5 * b[p] + 19
            elif t == 5:  # convolution
                p += 2 + 8 + 4 * b[p] * b[p + 1] + 5
            else:
                p += _FILTER_BYTES[t]
    return p


def erase_offsets(body):
    """Offsets of every Erase blend byte in the SWF body, nested sprites included."""
    out = []

    def walk(s, e):
        for code, h0, q, ln in tags(body, s, e):
            if code == 70:
                p = blend_at(body, q)
                if p is not None and body[p] == ERASE:
                    out.append(p)
            elif code == 39:
                walk(q + 4, q + ln)

    walk(swfinfo.rect_len(body) + 4, len(body))
    return out


def erasers(path):
    return len(erase_offsets(swfinfo.swf_body(path)[0]))


def eraser_drawn(src, dst):
    """A work copy with every Erase child drawn as a normal one (BlendMode.NORMAL)."""
    body, ver = swfinfo.swf_body(src)
    body = bytearray(body)
    for p in erase_offsets(body):
        body[p] = 1
    with open(dst, 'wb') as f:
        f.write(b'FWS' + bytes([ver]) + struct.pack('<I', len(body) + 8) + bytes(body))


def unerase(img, drawn):
    """The frame as Flash draws it: FFDec's render (eraser skipped) less what the eraser covers,
    from the same frame rendered with the eraser drawn (`drawn`). Both straight-alpha RGBA."""
    a = np.asarray(img, dtype=np.float32)
    d = np.asarray(drawn, dtype=np.float32)
    ao, an = a[..., 3] / 255, d[..., 3] / 255
    seen = ao < 0.999
    if np.any(~seen & (np.abs(an - ao) > 2 / 255)):
        raise ValueError('an eraser over an opaque layer: its cut cannot be read from the alpha')
    g = np.where(seen, np.clip((an - ao) / np.maximum(1e-6, 1 - ao), 0, 1), 0)
    out = a.copy()
    out[..., 3] = np.round(a[..., 3] * (1 - g))
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


# ---------- placements ----------

def animated_placements():
    """sprite -> [{tsid, layer, far, blur, colour, w, h}] for placements flagged animated."""
    idx = json.load(open(os.path.join(STREETS, 'index.json')))
    out = collections.defaultdict(list)
    for tsid, meta in sorted(idx.get('streets', {}).items()):
        path = os.path.join(PUBLIC, meta['file'])
        if not os.path.exists(path):
            continue
        street = json.load(open(path))
        layers = street.get('layers') or []
        mz = next((i for i, l in enumerate(layers) if l.get('id') == 'middleground'), None)
        mlz = None if mz is None else (layers[mz].get('z') if layers[mz].get('z') is not None else mz)
        for li, layer in enumerate(layers):
            z = layer.get('z') if layer.get('z') is not None else li
            f = layer.get('filters') or {}
            blur = int(float(f.get('blur') or 0))
            for d in layer.get('decos') or []:
                if d.get('animated') and d.get('sprite'):
                    out[d['sprite']].append({'tsid': tsid, 'layer': layer.get('id'), 'far': mlz is not None and z < mlz,
                                             'blur': blur if blur > 1 else 0,
                                             'colour': any(k != 'blur' for k in f),
                                             'colour_key': json.dumps({k: v for k, v in f.items() if k != 'blur'}, sort_keys=True),
                                             'w': abs(d.get('w') or 0), 'h': abs(d.get('h') or 0)})
    return out


def bake_res(blur):
    """js/street-render.js blurBakeResolution at the renderer's top density (2 and over)."""
    want = min(2.0, 4.0 / blur)
    return 2.0 if want >= 2 else 1.0 if want >= 1 else 0.5


def copies(places):
    """{street: copies of this strip it holds}: the strip, plus one per distinct colour of the
    unblurred colour layers it is on (a blurred layer draws it live through the filters)."""
    out = collections.defaultdict(set)
    for p in places:
        out[p['tsid']].add(p['colour_key'] if p['colour'] and not p['blur'] else '')
    return {t: 1 + len(k - {''}) for t, k in out.items()}


def street_caps(rows, budget=STREET_BYTES):
    """{name: largest scale} so no street holds more than `budget` of 2x strips. rows: [(name,
    bytes at scale 1, starting scale, {street: copies})]."""
    scale = {n: s for n, _, s, _ in rows}
    area = {n: a for n, a, _, _ in rows}
    streets = collections.defaultdict(dict)
    for n, _, _, cp in rows:
        for t, c in cp.items():
            streets[t][n] = c
    cost = lambda t: sum(area[n] * scale[n] ** 2 * c for n, c in streets[t].items())
    for _ in range(10000):
        worst = max(streets, key=cost, default=None)
        if worst is None or cost(worst) <= budget:
            break
        cands = [n for n in streets[worst] if scale[n] > 0.25]
        if not cands:
            break
        n = max(cands, key=lambda n: area[n] * scale[n] ** 2 * streets[worst][n])
        scale[n] *= 0.95
    return scale


def need_scale(size2, places):
    """Largest fraction of the still's pixel size any animated placement can use (<= 1)."""
    best = 0.0
    for p in places:
        if not p['w'] or not p['h']:
            continue
        dens = min(size2[0] / p['w'], size2[1] / p['h'])  # texels per world px of the 2x strip
        need = bake_res(p['blur']) if p['blur'] else NEED_TEXELS
        best = max(best, need / dens)
    return min(1.0, best) if best else 1.0


# ---------- frames ----------

def trim_box(a):
    """Alpha bounds grown by 1 px (the edge texels stay clear for linear sampling), or None."""
    al = a[..., 3]
    ys = np.flatnonzero(al.any(axis=1))
    if not ys.size:
        return None
    xs = np.flatnonzero(al.any(axis=0))
    h, w = al.shape
    return max(0, int(xs[0]) - 1), max(0, int(ys[0]) - 1), min(w, int(xs[-1]) + 2), min(h, int(ys[-1]) + 2)


def pack(sizes, max_side=MAX_SIDE, pad=PAD):
    """Shelf-pack (w, h) boxes; returns (width, height, [(x, y)]) or None when they do not fit."""
    if not sizes:
        return 1, 1, []
    area = sum((w + pad) * (h + pad) for w, h in sizes)
    widest = max(w for w, _ in sizes) + pad
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
    width = min(max_side, max(widest, int(math.ceil(math.sqrt(area) * 1.08))))
    while True:
        at = [None] * len(sizes)
        x = y = shelf = 0
        for i in order:
            w, h = sizes[i]
            if x + w + pad > width:
                x, y, shelf = 0, y + shelf, 0
            at[i] = (x, y)
            x += w + pad
            shelf = max(shelf, h + pad)
        height = y + shelf
        if height <= max_side:
            return width, height, at
        if width >= max_side:
            return None
        width = min(max_side, int(width * 1.15) + 1)


def frame_images(render_dir, period, stage, zoom, size, drawn_dir=None):
    """Each frame resampled to `size`; with `drawn_dir` (the eraser-drawn render) its erasers cut."""
    blank = lambda: Image.new('RGBA', (max(1, round(stage[0] * zoom)), max(1, round(stage[1] * zoom))))
    for i in range(1, period + 1):
        p = os.path.join(render_dir, f'{i}.png')
        ren = build.load(p) if os.path.exists(p) else blank()
        if drawn_dir:
            q = os.path.join(drawn_dir, f'{i}.png')
            drawn = build.load(q) if os.path.exists(q) else blank()
            if drawn.size != ren.size:
                raise ValueError(f'{render_dir} frame {i}: the eraser-drawn render is {drawn.size}, not {ren.size}')
            ren = unerase(ren, drawn)
        yield build.stage_resample(ren, stage, zoom, size)


def make_strip(render_dir, period, stage, zoom, size, scale, seq_from=None, drawn_dir=None):
    """Unique trimmed frames of one strip at `scale` x `size` -> (frames, seq, px size). Identical
    frames are stored once; `seq_from` (the 2x strip's sequence) makes a 3x strip store the same
    frames, so both strips share one sequence."""
    px = (max(1, round(size[0] * scale)), max(1, round(size[1] * scale)))
    uniq, seq, frames = {}, [], []
    for i, img in enumerate(frame_images(render_dir, period, stage, zoom, px, drawn_dir)):
        if seq_from is not None and seq_from[i] < len(frames):
            seq.append(seq_from[i])
            continue
        a = np.asarray(img)
        b = trim_box(a)
        if b is None:
            key = 'empty'
            crop = None
        else:
            crop = np.ascontiguousarray(a[b[1]:b[3], b[0]:b[2]])
            key = hashlib.sha1(crop.tobytes() + struct.pack('<4i', *b)).hexdigest()
        if seq_from is not None:
            key = seq_from[i]
        if key not in uniq:
            uniq[key] = len(frames)
            frames.append((b, crop))
        seq.append(uniq[key])
    return frames, seq, px


def strip_bytes(frames):
    return sum((b[2] - b[0]) * (b[3] - b[1]) * 4 for b, _ in frames if b)


def write_strip(frames, px, dst, tmp):
    sizes = [((b[2] - b[0]) if b else 1, (b[3] - b[1]) if b else 1) for b, _ in frames]
    packed = pack(sizes)
    if packed is None:
        return None
    width, height, at = packed
    atlas = np.zeros((height, width, 4), dtype=np.uint8)
    rects = []
    for (b, crop), (x, y), (w, h) in zip(frames, at, sizes):
        if b is None:
            rects.append([x, y, 0, 0, 0, 0])
            continue
        atlas[y:y + h, x:x + w] = crop
        rects.append([x, y, w, h, b[0], b[1]])
    nbytes, lossless, err = build.encode(Image.fromarray(atlas, 'RGBA'), dst, tmp)
    return {'w': width, 'h': height, 'rects': rects, 'bytes': nbytes, 'lossless': lossless, 'err': err,
            'decoded': width * height * 4}


# ---------- plan ----------

def read_plan():
    if not os.path.exists(PLAN):
        return {'settings': SETTINGS, 'decos': {}}
    p = json.load(open(PLAN))
    p['decos'] = {r['name']: r for r in p['decos']}
    return p


def write_plan(plan):
    rows = [plan['decos'][n] for n in sorted(plan['decos'])]
    shipped = [r for r in rows if r.get('strips')]
    plan['summary'] = {
        'animated_placements': sum(r['placements'] for r in rows),
        'decos': len(rows), 'shipped': len(shipped),
        'static': sorted(r['name'] for r in rows if r.get('skip', '').startswith('static')),
        'frames': sum(r['frames'] for r in shipped),
        'unique_frames': sum(r['unique'] for r in shipped),
        'webp_bytes': sum(s['bytes'] for r in shipped for s in r['strips']),
        'decoded_bytes_2x': sum(r['strips'][0]['decoded'] for r in shipped),
        'decoded_bytes_3x': sum(s['decoded'] for r in shipped for s in r['strips'][1:]),
    }
    head = {k: v for k, v in plan.items() if k != 'decos'}
    with open(PLAN, 'w') as f:
        f.write(json.dumps(head, separators=(',', ':'))[:-1] + ',"decos":[\n')
        f.write(',\n'.join(json.dumps(r, separators=(',', ':')) for r in rows))
        f.write('\n]}\n')


def js_text(plan):
    rows = [r for r in sorted(plan['decos'].values(), key=lambda r: r['name']) if r.get('strips')]
    body = ',\n'.join(f'  [{json.dumps(r["name"])}, [{r["frames"]}, {r["loop_from"]}, {1 if len(r["strips"]) > 1 else 0}]]' for r in rows)
    return (
        '/**\n'
        ' * Street decos the client played when a placement is flagged animated (DecoRenderer.as\n'
        ' * 301-305), as frame strips: assets/decos/animated/<name>.json (loop, sequence, frame rects) with\n'
        ' * <name>.webp (the still\'s 2x size) and, where the still has a 3x file, <name>@1.5x.webp.\n'
        ' * name -> [timeline frames at 30 fps, loop start frame, has a 3x strip]. Generated by\n'
        ' * tools/deco-pipeline/animate.py; do not edit by hand.\n'
        ' */\n'
        f'export const ANIM_DECOS = new Map([\n{body},\n]);\n'
    )


def source_for(n, plan_rows, place, index, cands, work):
    row = plan_rows.get(n) or {}
    if row.get('mode') == 'swf' and row.get('swf'):
        return audit.swf_path(row['swf'], work, index), row['swf']
    srcs = recover.sources(n, place, index, cands)
    if not srcs:
        return None, None
    swf = recover.swf_for(work, srcs[0], n, index)
    return swf, audit.swf_label(swf, work)


def survey(work):
    places = animated_placements()
    stills = build.read_plan()['decos']
    place = audit.placements()
    index = audit.bundle_index()
    cands = audit.swf_candidates()
    manifest = set(json.load(open(build.MANIFEST)))
    rows = []
    for n, (bundle, what) in sorted(SCENE_ANIMATED.items()):
        swf = audit.bundled_swf(work, bundle, n, index)
        tl = timeline(swf)
        info = swfinfo.read(swf)
        r = {'name': n, 'placements': 0, 'streets': 0, 'scene': what, 'swf': audit.swf_label(swf, work),
             'swf_sha': build.sha(swf)[:16], 'stage': info['stage'], 'root': tl['root'], 'nested': tl['nested'][:6],
             'frames': loop_period(tl), 'loop_from': 0}
        # One notional placement at the stage's size, so the strip is cut for full 3x.
        rows.append((r, swf, [{'tsid': 'scene', 'layer': 'middleground', 'far': False, 'blur': 0, 'colour': False,
                               'colour_key': '{}', 'w': info['stage'][0], 'h': info['stage'][1]}]))
    for n in sorted(places, key=lambda k: (-len(places[k]), k)):
        swf, label = source_for(n, stills, place, index, cands, work)
        r = {'name': n, 'placements': len(places[n]), 'streets': len({p['tsid'] for p in places[n]})}
        if n not in manifest:
            r['skip'] = 'not shipped: no still in manifest.json'
        if not swf:
            r['skip'] = 'no SWF'
            rows.append((r, None, places[n]))
            continue
        tl = timeline(swf)
        info = swfinfo.read(swf)
        r.update(swf=label, swf_sha=build.sha(swf)[:16], stage=info['stage'], root=tl['root'], nested=tl['nested'][:6])
        r['frames'] = loop_period(tl)
        if erasers(swf):
            r['erase'] = erasers(swf)
        lf = LOOP_FROM.get(n)
        r['loop_from'] = (tl['labels'][lf] - 1) if lf and lf in tl['labels'] else 0
        if r['frames'] <= 1:
            r['skip'] = 'static: one frame, nothing nested plays'
        rows.append((r, swf, places[n]))
    return rows, stills


def cmd_list(args):
    rows, _ = survey(args.work or os.path.join('/tmp', 'animate-list'))
    for r, _, _ in rows:
        print(f"{r['name']:38s} {r['placements']:4d} placed {r['streets']:3d} streets  root {r.get('root', '-')!s:>4} "
              f"nested {r.get('nested', [])!s:18s} loop {r.get('frames', '-')!s:>4} {r.get('skip', '')}")


def cmd_build(args):
    work = args.work
    os.makedirs(work, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    rows, stills = survey(work)
    plan = read_plan()
    plan['settings'] = SETTINGS
    only = set(args.only.split(',')) if args.only else None
    todo = []
    for r, swf, places in rows:
        n = r['name']
        if only and n not in only:
            continue
        if r.get('skip'):
            plan['decos'][n] = r
            for f in (n + '.webp', n + '@1.5x.webp', n + '.json'):
                if os.path.exists(os.path.join(OUT, f)):
                    os.remove(os.path.join(OUT, f))
            continue
        still = stills.get(n) or {}
        size2 = still.get('size2') or [max(1, round(r['stage'][0] * 2)), max(1, round(r['stage'][1] * 2))]
        r['size'] = size2
        r['hires'] = n in SCENE_ANIMATED or bool(still.get('hires') and not still.get('big'))
        r['need'] = round(need_scale(size2, places), 3)
        r['copies'] = copies(places)
        todo.append((r, swf))
    # The street budget, from each strip's bytes at full size in the last build.
    prev = {n: row for n, row in plan['decos'].items() if row.get('area1')}
    est = [(r['name'], prev[r['name']]['area1'], min(r['need'], math.sqrt(MAX_BYTES / prev[r['name']]['area1'])), r['copies'])
           for r, _ in todo if r['name'] in prev]
    others = [(n, row['area1'], row['strips'][0]['res'], row.get('copies_by_street') or {}) for n, row in prev.items()
              if row.get('strips') and n not in {r['name'] for r, _ in todo}]
    caps = street_caps(est + others)
    for r, _ in todo:
        if r['name'] in caps:
            r['cap'] = round(caps[r['name']], 4)
    for i in range(0, len(todo), args.batch):
        chunk = todo[i:i + args.batch]
        while os.getloadavg()[0] > args.max_load:
            print(f'  load {os.getloadavg()[0]:.0f}: waiting', flush=True)
            time.sleep(30)
        for zoom in (2, 3):
            items = [(r, swf) for r, swf in chunk if (3 if r['hires'] else 2) == zoom]
            if not items:
                continue
            src = os.path.join(work, f'src-{zoom}')
            out = os.path.join(work, f'out-{zoom}')
            shutil.rmtree(src, ignore_errors=True)
            shutil.rmtree(out, ignore_errors=True)
            os.makedirs(src)
            for r, swf in items:
                dst = os.path.join(src, r['name'] + '.swf')
                if r['frames'] > r['root']:
                    wrap(swf, dst, r['frames'])
                else:
                    os.symlink(swf, dst)
                if r.get('erase'):
                    eraser_drawn(dst, os.path.join(src, r['name'] + DRAWN + '.swf'))
            t0 = time.time()
            build.ffdec('-zoom', zoom, '-ignorebackground', '-format', 'frame:png', '-export', 'frame', out, src, heap='4g')
            for r, _ in items:
                drawn = os.path.join(out, r['name'] + DRAWN + '.swf') if r.get('erase') else None
                process(r, os.path.join(out, r['name'] + '.swf'), zoom, work, drawn)
                plan['decos'][r['name']] = r
                print(f"  {r['name']}: {r['frames']} frames, {r['unique']} unique, "
                      + ', '.join(f"{s['density']}x {s['w']}x{s['h']} {s['bytes'] // 1024} KB (res {s['res']})" for s in r['strips']), flush=True)
            shutil.rmtree(src, ignore_errors=True)
            shutil.rmtree(out, ignore_errors=True)
            print(f'  batch {min(i + args.batch, len(todo))}/{len(todo)} zoom {zoom}: {time.time() - t0:.0f}s', flush=True)
        write_plan(plan)
    write_plan(plan)
    open(LIST_JS, 'w').write(js_text(plan))
    print('summary', json.dumps(plan['summary']))


def process(r, render_dir, zoom, work, drawn_dir=None):
    n = r['name']
    stage = r['stage']
    size2 = r['size']
    strips = []
    seq2 = None
    tmp = os.path.join(work, 'enc')
    for density in ((1, 1.5) if r['hires'] else (1,)):
        budget = MAX_BYTES if density == 1 else MAX_BYTES_3X
        # The 3x strip only goes as far as the need, and only where it is clearly sharper.
        scale = min(r['need'], r.get('cap', 1)) if density == 1 else min(1.5, r['need'] * 1.5)
        frames = None
        while density == 1 or scale >= MIN_3X:
            frames, seq, px = make_strip(render_dir, r['frames'], stage, zoom, size2, scale, None if density == 1 else seq2, drawn_dir)
            if strip_bytes(frames) > budget * 0.9 and scale > 0.25:
                scale *= math.sqrt(budget * 0.85 / strip_bytes(frames))
                frames = None
                continue
            dst = os.path.join(OUT, n + ('@1.5x' if density > 1 else '') + '.webp')
            res = write_strip(frames, px, dst, tmp)
            if res is None or res['decoded'] > budget:
                scale *= 0.85
                frames = None
                continue
            break
        if frames is None:
            out3 = os.path.join(OUT, n + '@1.5x.webp')
            if os.path.exists(out3):
                os.remove(out3)
            continue
        res.update(density=density, file=os.path.basename(dst), res=round(px[0] / size2[0], 5),
                   sha=build.sha(dst)[:16])
        strips.append(res)
        if density == 1:
            seq2 = seq
            r['seq'] = seq
            r['unique'] = len(frames)
            r['area1'] = round(res['decoded'] / (px[0] / size2[0]) ** 2)
    r['strips'] = [{k: v for k, v in s.items() if k != 'rects'} for s in strips]
    r['copies_by_street'] = r.pop('copies', {})
    data = {
        'about': 'Tiny Speck CC0 deco timeline (glitch-locations), tools/deco-pipeline/animate.py',
        'name': n, 'fps': FPS, 'frames': r['frames'], 'loopFrom': r['loop_from'], 'size': size2,
        'seq': r.pop('seq'),
        'strips': [{'density': s['density'], 'file': s['file'], 'res': s['res'], 'w': s['w'], 'h': s['h'], 'rects': s['rects']}
                   for s in strips],
    }
    with open(os.path.join(OUT, n + '.json'), 'w') as f:
        f.write(json.dumps(data, separators=(',', ':')) + '\n')
    r['json_sha'] = build.sha(os.path.join(OUT, n + '.json'))[:16]


def cmd_check(args):
    problems = []
    plan = read_plan()
    places = animated_placements()
    for n in places:
        if n not in plan['decos']:
            problems.append(f'{n}: flagged animated on {len(places[n])} placements but not in animated.json')
    for n in SCENE_ANIMATED:
        if not (plan['decos'].get(n) or {}).get('strips'):
            problems.append(f'{n}: a rebuilt room plays it but it has no strip (run --only {n})')
    for n, r in plan['decos'].items():
        if n not in places and n not in SCENE_ANIMATED:
            problems.append(f'{n}: in animated.json but no placement is flagged animated now')
            continue
        if r.get('placements') != len(places.get(n, [])):
            problems.append(f'{n}: {len(places[n])} animated placements, animated.json says {r.get("placements")}')
        if r.get('skip'):
            if os.path.exists(os.path.join(OUT, n + '.json')):
                problems.append(f'{n}: skipped ({r["skip"]}) but {n}.json ships')
            continue
        jp = os.path.join(OUT, n + '.json')
        if not os.path.exists(jp):
            problems.append(f'{n}: no {n}.json')
            continue
        if build.sha(jp)[:16] != r.get('json_sha'):
            problems.append(f'{n}: {n}.json differs from animated.json')
        d = json.load(open(jp))
        if d['frames'] != r['frames'] or len(d['seq']) != d['frames']:
            problems.append(f'{n}: sequence has {len(d["seq"])} frames, the loop {d["frames"]}')
        if not (0 <= d['loopFrom'] < d['frames']):
            problems.append(f'{n}: loop start {d["loopFrom"]} outside the loop')
        for s, row in zip(d['strips'], r['strips']):
            fp = os.path.join(OUT, s['file'])
            if not os.path.exists(fp):
                problems.append(f'{n}: no {s["file"]}')
                continue
            if build.sha(fp)[:16] != row['sha']:
                problems.append(f'{n}: {s["file"]} differs from animated.json')
            with Image.open(fp) as im:
                if list(im.size) != [s['w'], s['h']]:
                    problems.append(f'{n}: {s["file"]} is {im.size}, the JSON says {s["w"]}x{s["h"]}')
            if max(s['w'], s['h']) > MAX_SIDE:
                problems.append(f'{n}: {s["file"]} over {MAX_SIDE} px')
            if len(s['rects']) != r['unique'] or max(d['seq']) >= len(s['rects']):
                problems.append(f'{n}: {s["file"]} has {len(s["rects"])} frames, the sequence needs {max(d["seq"]) + 1}')
    shipped = {r['name'] for r in plan['decos'].values() if r.get('strips')}
    on_disk = {f.split('.')[0].split('@')[0] for f in os.listdir(OUT)} if os.path.isdir(OUT) else set()
    for n in sorted(on_disk - shipped):
        problems.append(f'{n}: files in assets/decos/animated/ but not in animated.json')
    if not os.path.exists(LIST_JS) or open(LIST_JS).read() != js_text(plan):
        problems.append('js/deco-anim-list.js is stale (run animate.py --write-js)')
    for p in problems:
        print(p)
    s = plan.get('summary', {})
    print(f"{len(shipped)} animated decos ({s.get('frames')} frames, {s.get('unique_frames')} unique, "
          f"{(s.get('webp_bytes') or 0) // 1024} KB WebP); {len(problems)} problems")
    return 1 if problems else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--write-js', action='store_true')
    ap.add_argument('--work')
    ap.add_argument('--only')
    ap.add_argument('--batch', type=int, default=4)
    ap.add_argument('--max-load', type=float, default=40)
    args = ap.parse_args()
    if args.check:
        sys.exit(cmd_check(args))
    if args.list:
        cmd_list(args)
        return
    if args.write_js:
        open(LIST_JS, 'w').write(js_text(read_plan()))
        return
    if not args.work:
        ap.error('--work is required')
    cmd_build(args)


if __name__ == '__main__':
    main()
