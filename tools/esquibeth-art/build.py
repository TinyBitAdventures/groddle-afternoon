#!/usr/bin/env python3.11
"""Tiny Speck's own Giant glyphs for the Esquibeth grottos, at 3x.

Source: the esquibeth1.swf location bundle (tinyspeck/glitch-locations, CC0; glitch-location-swfs/,
the copy the client loaded). It embeds each deco as its own SWF (DefineBinaryData exported as
esquibeth1_<class>_dataClass; tools/deco-audit/audit.py bundle_index):
- esquibeth_glyph_spriggan_01a, _cosma_01a, _pot_01a: the three carved glyphs, each one flat shape
  with its note sockets carved in (the round dents, each with its note's mark: 1 the dot, 2 the
  mushroom, 3 the hook, 4 the cross, 5 the squiggle; the shipped note1..5 sprites carry the same
  marks). Spriggan has sockets 1-3, Cosma 1-4 and Pot 1-5: the 3, 4 and 5 notes of the Eastern
  Grotto, the Western Grotto and the Waterfall Climb. Players' Snaps (round3-levels-2026-10-29,
  reference only) show Spriggan in the Eastern Grotto (PHFJQRSE70D2EEF_92789), Cosma in the
  Western Grotto (wayback/raw/snaps/last_pilgrimage_of_esquibeth PHFU45SOPTC28NR_87732) and Pot
  on the Waterfall Climb (LIFR7REVQ583H6Q PDO9Q7AUPQV23M6_100745).
- esquibeth_glyph_<glyph>_glow_01a: the glyph's lit outline (white and cyan), drawn over it once
  the song is played. Its offset on the glyph is found here by matching the two shapes.
- esquibeth_glyph_sheetmusiclines_01a, _01b, _01c: the staff over each glyph, with 4, 7 and 11 lit
  marks (one staff per grotto, in order; the Snaps show it above the glyph).
- esquibeth_glyph_dot_01a..e: five small note rings.

FFDec renders each at zoom 3 with no background (tools/deco-pipeline/build.py render_batch); the
render is the SWF stage, so positions measured on it are stage px. Each piece is trimmed to its
visible pixels padded to whole stage px and encoded as WebP (build.py encode). Pieces are drawn at
their stage size times the room's scale, so each file is <name>@3x.webp.

Measured here on the renders (written to plan.json and the generated module):
- sockets: the centre of each carved dent (where a disc of radius 20 render px is all dark glyph),
  numbered by the mark carved in it; checked against the expected count per glyph.
- glow: the glow's top-left in the glyph's stage (best overlap of the two alpha masks).
- marks: the centres of the staff's lit marks (bright white rings), left to right.

Writes public/assets/sprites/quest-rooms/esquibeth/<piece>@3x.webp, tools/esquibeth-art/plan.json
and public/js/quest-rooms/esquibeth-art.js (generated).

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp):
  python3.11 -I tools/esquibeth-art/build.py --work <scratch dir>
  python3.11 -I tools/esquibeth-art/build.py --check     (no rendering; exit 1 on a problem)
The SWFs are data: FFDec reads them, nothing runs them.
"""
import argparse, hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
sys.dont_write_bytecode = True
for sub in ('deco-audit', 'icon-hires', 'deco-pipeline'):
    sys.path.insert(0, os.path.join(SPIKE, 'tools', sub))
import build as deco  # noqa: E402  (tools/deco-pipeline/build.py)
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

audit = deco.audit
PUBLIC = os.path.join(SPIKE, 'public')
OUT_DIR = os.path.join(PUBLIC, 'assets', 'sprites', 'quest-rooms', 'esquibeth')
PLAN = os.path.join(HERE, 'plan.json')
OUT_JS = os.path.join(PUBLIC, 'js', 'quest-rooms', 'esquibeth-art.js')
ZOOM = 3
BUNDLE = 'esquibeth1.swf'
GLYPHS = {'spriggan': 3, 'cosma': 4, 'pot': 5}
STAFFS = ['01a', '01b', '01c']
DOTS = ['01a', '01b', '01c', '01d', '01e']
PIECES = ([f'esquibeth_glyph_{g}_01a' for g in GLYPHS] + [f'esquibeth_glyph_{g}_glow_01a' for g in GLYPHS]
          + [f'esquibeth_glyph_sheetmusiclines_{s}' for s in STAFFS] + [f'esquibeth_glyph_dot_{d}' for d in DOTS])


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def short(name):
    return name[len('esquibeth_'):]


def alpha(img):
    return np.asarray(img.convert('RGBA'), dtype=np.float64)


def disc_cover(mask, r):
    """For each pixel, the share of a disc of radius r around it that is inside `mask` (FFT)."""
    h, w = mask.shape
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    k = ((xx ** 2 + yy ** 2) <= r * r).astype(np.float64)
    k /= k.sum()
    P = np.zeros((h + 2 * r + 1, w + 2 * r + 1))
    P[:h, :w] = mask
    K = np.zeros_like(P)
    K[:2 * r + 1, :2 * r + 1] = k
    return np.real(np.fft.ifft2(np.fft.fft2(P) * np.fft.fft2(K)))[r:h + r, r:w + r]


def find_sockets(img, r=20, thr=0.97):
    """Centres (stage px) of the carved dents: where a disc of radius r is all dark glyph."""
    a = alpha(img)
    mask = ((a[..., 3] > 160) & (a[..., :3].mean(-1) < 110)).astype(np.float64)
    cov = disc_cover(mask, r)
    h, w = mask.shape
    c = cov.copy()
    out = []
    while True:
        i = int(np.argmax(c))
        y, x = divmod(i, w)
        if c[y, x] < thr:
            break
        y0, x0 = max(0, y - r), max(0, x - r)
        ys, xs = np.where(cov[y0:y + r, x0:x + r] >= thr)
        out.append((round((xs.mean() + x0) / ZOOM, 1), round((ys.mean() + y0) / ZOOM, 1)))
        c[max(0, y - 2 * r):y + 2 * r, max(0, x - 2 * r):x + 2 * r] = 0
    return out


def number_sockets(glyph, pts):
    """Every glyph carves its dents in the same places for the same notes: 2 is the top one, 1 the
    upper left, 3 the right of the middle, 4 the lower left, 5 the lowest (Pot). Assigned by place,
    then checked: the top dent is highest, 1 is left of 3."""
    pts = sorted(pts, key=lambda p: p[1])
    n = {}
    n[2] = pts[0]
    rest = pts[1:]
    if glyph == 'pot':
        n[5] = max(rest, key=lambda p: p[1])
        rest = [p for p in rest if p != n[5]]
    if len(rest) == 3:
        n[4] = max(rest, key=lambda p: p[1])
        rest = [p for p in rest if p != n[4]]
    left, right = sorted(rest, key=lambda p: p[0])
    n[1], n[3] = left, right
    if not (n[1][0] < n[3][0] and n[2][1] < min(n[1][1], n[3][1])):
        raise SystemExit(f'{glyph}: sockets do not sit as expected: {n}')
    return {k: list(n[k]) for k in sorted(n)}


def glow_offset(glyph_img, glow_img):
    """The glow's top-left in the glyph's stage (stage px): the shift that best overlaps the masks."""
    g = (alpha(glyph_img)[..., 3] > 100).astype(np.float64)
    o = (alpha(glow_img)[..., 3] > 100).astype(np.float64)
    h = g.shape[0] + o.shape[0]
    w = g.shape[1] + o.shape[1]
    G = np.zeros((h, w)); G[:g.shape[0], :g.shape[1]] = g
    O = np.zeros((h, w)); O[:o.shape[0], :o.shape[1]] = o
    corr = np.real(np.fft.ifft2(np.fft.fft2(G) * np.conj(np.fft.fft2(O))))
    y, x = divmod(int(np.argmax(corr)), w)
    if y > h // 2: y -= h
    if x > w // 2: x -= w
    return [round(x / ZOOM, 1), round(y / ZOOM, 1)]


def lit_marks(img):
    """Centres (stage px) of the staff's bright white rings, left to right."""
    a = alpha(img)
    m = (a[..., 0] > 230) & (a[..., 1] > 230) & (a[..., 2] > 230) & (a[..., 3] > 200)
    h, w = m.shape
    seen = np.zeros_like(m)
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if not m[y0, x0] or seen[y0, x0]:
                continue
            stack = [(y0, x0)]
            seen[y0, x0] = True
            pts = []
            while stack:
                y, x = stack.pop()
                pts.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(pts) > 15:
                ys, xs = zip(*pts)
                out.append([round(float(np.mean(xs)) / ZOOM, 1), round(float(np.mean(ys)) / ZOOM, 1)])
    return sorted(out)


def build(work):
    os.makedirs(work, exist_ok=True)
    index = audit.bundle_index()
    items = [(name, audit.bundled_swf(work, BUNDLE, name, index)) for name in PIECES]
    swfs = dict(items)
    found, _ = deco.render_batch(work, ZOOM, items)
    renders = {}
    rows = []
    for name in PIECES:
        if name not in found:
            raise SystemExit(f'FFDec did not render {name}')
        img = Image.open(found[name]).convert('RGBA')
        renders[name] = img
        box = img.getchannel('A').point(lambda a: 255 if a > 2 else 0).getbbox()
        l, t = box[0] // ZOOM * ZOOM, box[1] // ZOOM * ZOOM
        r, b = -(-box[2] // ZOOM) * ZOOM, -(-box[3] // ZOOM) * ZOOM
        crop = Image.new('RGBA', (r - l, b - t), (0, 0, 0, 0))
        crop.paste(img.crop((l, t, min(r, img.width), min(b, img.height))), (0, 0))
        os.makedirs(OUT_DIR, exist_ok=True)
        dst = os.path.join(OUT_DIR, f'{short(name)}@{ZOOM}x.webp')
        size, lossless, err = deco.encode(crop, dst, os.path.join(work, 'enc'))
        rows.append({
            'name': name,
            'source': f'bundle:{BUNDLE}#{name}',
            'swf': sha(swfs[name]),
            'file': os.path.relpath(dst, PUBLIC),
            'stage': [-(-img.width // ZOOM), -(-img.height // ZOOM)],
            'trim': [l // ZOOM, t // ZOOM],
            'w': crop.width // ZOOM,
            'h': crop.height // ZOOM,
            'bytes': size,
            'lossless': lossless,
            'error': err,
            'webp': sha(dst),
        })
        print(f"{name}: {crop.width}x{crop.height} {size} B{' lossless' if lossless else ''}")
    glyphs = {}
    for g, count in GLYPHS.items():
        base = renders[f'esquibeth_glyph_{g}_01a']
        pts = find_sockets(base)
        if len(pts) != count:
            raise SystemExit(f'{g}: found {len(pts)} sockets, expected {count}')
        glyphs[g] = {'sockets': number_sockets(g, pts), 'glow': glow_offset(base, renders[f'esquibeth_glyph_{g}_glow_01a'])}
        print(g, glyphs[g])
    staffs = {}
    for s in STAFFS:
        staffs[s] = lit_marks(renders[f'esquibeth_glyph_sheetmusiclines_{s}'])
        print('staff', s, len(staffs[s]))
    plan = {'zoom': ZOOM, 'bundle': BUNDLE, 'bundleSha': sha(os.path.join(audit.BUNDLES, BUNDLE)),
            'glyphs': glyphs, 'staffs': staffs, 'pieces': rows}
    json.dump(plan, open(PLAN, 'w'), indent=1)
    open(PLAN, 'a').write('\n')
    write_js(plan)


def num(v):
    return str(int(v)) if float(v).is_integer() else str(v)


def pair(p):
    return f'[{num(p[0])}, {num(p[1])}]'


def write_js(plan):
    lines = [
        '// Generated by tools/esquibeth-art/build.py: do not edit.',
        "// Tiny Speck's Giant glyphs for the Esquibeth grottos at 3x (esquibeth1.swf decos, glitch-locations, CC0).",
        '// file: under assets/; w x h: the trimmed art in stage px; stage: the SWF stage; trim: the',
        "// art's top-left in the stage. Glyphs: sockets (note -> centre in the stage) and the glow's",
        "// top-left in the glyph's stage. Staffs: the lit marks' centres in the stage, left to right.",
        'export const ESQUIBETH_ART = Object.freeze({',
    ]
    for r in plan['pieces']:
        lines.append(f"  {short(r['name'])}: Object.freeze({{ file: '{r['file']}', w: {r['w']}, h: {r['h']}, "
                     f"stage: [{r['stage'][0]}, {r['stage'][1]}], trim: [{r['trim'][0]}, {r['trim'][1]}] }}),")
    lines.append('});')
    lines.append('export const ESQUIBETH_GLYPHS = Object.freeze({')
    for g, v in plan['glyphs'].items():
        socks = ', '.join(f'{k}: {pair(p)}' for k, p in v['sockets'].items())
        lines.append(f"  {g}: Object.freeze({{ sockets: Object.freeze({{ {socks} }}), glow: {pair(v['glow'])} }}),")
    lines.append('});')
    lines.append('export const ESQUIBETH_STAFFS = Object.freeze({')
    for s, marks in plan['staffs'].items():
        lines.append(f"  '{s}': Object.freeze([{', '.join(pair(p) for p in marks)}]),")
    lines.append('});')
    open(OUT_JS, 'w').write('\n'.join(lines) + '\n')


def check():
    bad = []
    plan = json.load(open(PLAN))
    if [r['name'] for r in plan['pieces']] != PIECES:
        bad.append('plan.json pieces differ from PIECES')
    for g, count in GLYPHS.items():
        if sorted(int(k) for k in plan['glyphs'].get(g, {}).get('sockets', {})) != list(range(1, count + 1)):
            bad.append(f'{g}: sockets are not notes 1-{count}')
    bundle = os.path.join(audit.BUNDLES, BUNDLE)
    if os.path.exists(bundle) and sha(bundle) != plan['bundleSha']:
        bad.append(f'{BUNDLE} changed')
    for r in plan['pieces']:
        dst = os.path.join(PUBLIC, r['file'])
        if not os.path.exists(dst):
            bad.append(f'missing {dst}')
            continue
        if sha(dst) != r['webp']:
            bad.append(f'{dst} changed')
        with Image.open(dst) as im:
            if im.size != (r['w'] * ZOOM, r['h'] * ZOOM):
                bad.append(f'{dst} is {im.size}')
    before = open(OUT_JS).read() if os.path.exists(OUT_JS) else ''
    write_js(plan)
    if open(OUT_JS).read() != before:
        open(OUT_JS, 'w').write(before)
        bad.append('public/js/quest-rooms/esquibeth-art.js is stale (run build)')
    for b in bad:
        print(b)
    print('ok' if not bad else f'{len(bad)} problem(s)')
    return 1 if bad else 0


if __name__ == '__main__':
    a = argparse.ArgumentParser()
    a.add_argument('--work')
    a.add_argument('--check', action='store_true')
    args = a.parse_args()
    if args.check:
        sys.exit(check())
    if not args.work:
        a.error('--work <scratch dir> is required to build')
    build(args.work)
