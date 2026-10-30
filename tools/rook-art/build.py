#!/usr/bin/env python3.11
"""Tiny Speck's own art for Rooks' Woods and the Museum of the Rook, at 3x.

Pieces
- crusher: glitch-items misc/crusher/crusher.swf (CC0), the Crusher item (items/crusher.js). One
  DefineShape on a one-frame timeline: the SWF has no states or animation, so this one still is all
  of it. Rooks' Woods draws it in place of the remake's drawn grey block.
- rook_hall_painting_01..04_deco: the four framed paintings with their brass plaques, from the
  firebog.swf street bundle (tinyspeck/glitch-locations, CC0; the copy the client loaded, see
  tools/deco-audit/audit.py bundle_index). Each deco is a wooden frame over a 400 x 244 picture
  (a DefineBitsJPEG2 on a shape in its own sprite, placed under the frame at -196.55, -138.75 in the
  deco's main sprite). The room's overlays (glitch-overlays rook_hall_painting_0N.fla, the
  location_overlay rook_hall_speaker.js play() sends) cross-fade three 400 x 244 frames in exactly
  that window, so the deco is rendered here with the picture's PlaceObject removed (FFDec swf2xml,
  edit, xml2swf, in a work copy): the frame alone, with its window empty, and the game draws the
  picture under it (js/rook-museum.js ROOK_MUSEUM_PAINTING_LOOP). The picture each deco embeds is one
  of the overlay's three (checked here pixel for pixel against public/assets/sprites/quests/
  rook-museum/paintings/painting-N{a,b,c}.jpg): that is the still the hall shows.
- rook_hall_placeholder_squawk_stand: the pole the shrine exhibit's speaker stands on (the 2011
  recordings 53YLN1SHLU4 3:54-4:24 and dTqJiZDUZBY 2:30-3:00 show it; reference only). The speaker
  (rook_hall_speaker, already shipped) covers its board.
Not shipped: rook_hall_placeholder_squawkbox and rook_hall_placeholder_old_orb are the same art as
the rook_hall_speaker and rook_hall_focusing_orb items the remake already draws (the placeholders the
items replaced); rook_hall_painting_cave_01_deco and rook_hall_skull_deco appear in none of the three
museum recordings, so the museum leaves them out.

FFDec renders each at zoom 3 with no background (tools/deco-pipeline/build.py render_batch), the
render is trimmed to its visible pixels padded to whole world px, and encoded as WebP
(build.py encode: lossy q82 sharp YUV, lossless where lossy shows artefacts). Pieces are drawn at
their SWF stage size (world px = stage px), so each file is <name>@3x.webp and js/textures.js gives
the sprite its world size.

Writes public/assets/sprites/quests/rook-woods/crusher@3x.webp,
public/assets/sprites/quests/rook-museum/<piece>@3x.webp, tools/rook-art/plan.json and
public/js/rook-art.js (generated: file, world size, stage, trim and each painting's window).

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp):
  python3.11 -I tools/rook-art/build.py --work <scratch dir>
  python3.11 -I tools/rook-art/build.py --check     (no rendering; exit 1 on a problem)
The SWFs are data: FFDec reads and rewrites them, nothing runs them.
"""
import argparse, glob, hashlib, json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
sys.dont_write_bytecode = True
for sub in ('deco-audit', 'icon-hires', 'deco-pipeline'):
    sys.path.insert(0, os.path.join(SPIKE, 'tools', sub))
import build as deco  # noqa: E402  (tools/deco-pipeline/build.py)
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

audit = deco.audit
ITEMS = os.path.expanduser('~/Documents/glitch-audit/glitch-items')
PUBLIC = os.path.join(SPIKE, 'public')
WOODS = os.path.join(PUBLIC, 'assets', 'sprites', 'quests', 'rook-woods')
MUSEUM = os.path.join(PUBLIC, 'assets', 'sprites', 'quests', 'rook-museum')
PAINTINGS = os.path.join(MUSEUM, 'paintings')
PLAN = os.path.join(HERE, 'plan.json')
OUT_JS = os.path.join(PUBLIC, 'js', 'rook-art.js')
ZOOM = 3
BUNDLE = 'firebog.swf'
# The picture's PlaceObject in each painting deco's main sprite (twips): -196.55, -138.75.
PICTURE_TX, PICTURE_TY = -3931, -2775

# (name, out dir, source, variant). source: 'item:<path>' (glitch-items) or 'bundle' (firebog.swf).
PIECES = [
    ('crusher', WOODS, 'item:misc/crusher/crusher.swf', None),
    ('rook_hall_painting_01_deco', MUSEUM, 'bundle', 'frame'),
    ('rook_hall_painting_02_deco', MUSEUM, 'bundle', 'frame'),
    ('rook_hall_painting_03_deco', MUSEUM, 'bundle', 'frame'),
    ('rook_hall_painting_04_deco', MUSEUM, 'bundle', 'frame'),
    ('rook_hall_placeholder_squawk_stand', MUSEUM, 'bundle', None),
]


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def out_name(name, variant):
    base = name.replace('_deco', '_frame') if variant == 'frame' else name
    return f'{base}@{ZOOM}x.webp'


def source_swf(work, name, source):
    if source.startswith('item:'):
        return os.path.join(ITEMS, source[5:])
    return audit.bundled_swf(work, BUNDLE, name, audit.bundle_index())


def frame_variant(work, name, swf):
    """A work copy of the deco without its window picture; returns (swf, window, picture png)."""
    d = os.path.join(work, 'frame', name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    xml = os.path.join(d, 'deco.xml')
    deco.ffdec('-swf2xml', swf, xml)
    text = open(xml, encoding='utf-8').read()
    pat = re.compile(r'<item type="PlaceObject2Tag" characterId="(\d+)" depth="\d+"[^>]*>\s*'
                     rf'<matrix [^>]*translateX="{PICTURE_TX}" translateY="{PICTURE_TY}"/>\s*</item>\s*')
    hits = pat.findall(text)
    if len(hits) != 1:
        raise SystemExit(f'{name}: expected one window picture placement, found {len(hits)}')
    # The main sprite's own placement on the root timeline: the last depth-1 PlaceObject before a frame.
    roots = list(re.finditer(r'<item type="PlaceObject2Tag" characterId="(\d+)" depth="1"[^>]*>\s*<matrix [^>]*'
                             r'translateX="(-?\d+)" translateY="(-?\d+)"/>\s*</item>\s*<item type="ShowFrameTag"', text))
    root = roots[-1] if roots else None
    if not root:
        raise SystemExit(f'{name}: no root placement of the main sprite')
    window = [(int(root.group(2)) + PICTURE_TX) / 20, (int(root.group(3)) + PICTURE_TY) / 20, 400, 244]
    open(os.path.join(d, 'frame.xml'), 'w', encoding='utf-8').write(pat.sub('', text, count=1))
    out = os.path.join(d, name + '.swf')
    deco.ffdec('-xml2swf', os.path.join(d, 'frame.xml'), out)
    if not os.path.exists(out):
        raise SystemExit(f'{name}: xml2swf failed')
    # The picture the deco embeds (the hall's still): FFDec image export, the 400 x 244 JPEG.
    img_dir = os.path.join(d, 'img')
    deco.ffdec('-export', 'image', img_dir, swf)
    pics = [p for p in glob.glob(os.path.join(img_dir, '*')) if Image.open(p).size == (400, 244)]
    if len(pics) != 1:
        raise SystemExit(f'{name}: expected one 400 x 244 picture, found {len(pics)}')
    return out, window, pics[0]


def picture_letter(name, png):
    n = int(re.search(r'_0(\d)_', name).group(1))
    got = np.asarray(Image.open(png).convert('RGB'), dtype=np.int16)
    best = None
    for letter in 'abc':
        ref = np.asarray(Image.open(os.path.join(PAINTINGS, f'painting-{n}{letter}.jpg')).convert('RGB'), dtype=np.int16)
        err = float(np.abs(got - ref).mean())
        if best is None or err < best[1]:
            best = (letter, err)
    if best[1] > 0.5:
        raise SystemExit(f'{name}: its picture matches no overlay frame (best {best})')
    return f'painting-{n}{best[0]}.jpg'


def build(work):
    os.makedirs(work, exist_ok=True)
    items, extra = [], {}
    for name, _, source, variant in PIECES:
        swf = source_swf(work, name, source)
        row = {'source': source if source != 'bundle' else f'bundle:{BUNDLE}#{name}', 'swf': sha(swf)}
        if variant == 'frame':
            swf, window, pic = frame_variant(work, name, swf)
            row['window'] = window
            row['picture'] = picture_letter(name, pic)
        items.append((name, swf))
        extra[name] = row
    found, _ = deco.render_batch(work, ZOOM, items)
    rows = []
    for name, out_dir, _, variant in PIECES:
        if name not in found:
            raise SystemExit(f'FFDec did not render {name}')
        img = Image.open(found[name]).convert('RGBA')
        box = img.getchannel('A').point(lambda a: 255 if a > 2 else 0).getbbox()
        l, t = box[0] // ZOOM * ZOOM, box[1] // ZOOM * ZOOM
        r, b = -(-box[2] // ZOOM) * ZOOM, -(-box[3] // ZOOM) * ZOOM
        crop = Image.new('RGBA', (r - l, b - t), (0, 0, 0, 0))
        crop.paste(img.crop((l, t, min(r, img.width), min(b, img.height))), (0, 0))
        os.makedirs(out_dir, exist_ok=True)
        dst = os.path.join(out_dir, out_name(name, variant))
        size, lossless, err = deco.encode(crop, dst, os.path.join(work, 'enc'))
        row = {
            'name': name,
            **extra[name],
            'file': os.path.relpath(dst, PUBLIC),
            'stage': [-(-img.width // ZOOM), -(-img.height // ZOOM)],
            'trim': [l // ZOOM, t // ZOOM],
            'w': crop.width // ZOOM,
            'h': crop.height // ZOOM,
            'bytes': size,
            'lossless': lossless,
            'error': err,
            'webp': sha(dst),
        }
        rows.append(row)
        print(f"{name}: {crop.width}x{crop.height} {size} B{' lossless' if lossless else ''}"
              f"{'  window ' + str(row['window']) + ' ' + row['picture'] if 'window' in row else ''}")
    json.dump({'zoom': ZOOM, 'pieces': rows}, open(PLAN, 'w'), indent=1)
    open(PLAN, 'a').write('\n')
    write_js(rows)


def num(v):
    return str(int(v)) if float(v).is_integer() else str(v)


def write_js(rows):
    lines = [
        '// Generated by tools/rook-art/build.py: do not edit.',
        "// Rooks' Woods and Museum of the Rook art at 3x (glitch-items crusher.swf; firebog.swf decos, CC0).",
        '// file: under assets/; w x h: world size; stage: the SWF stage; trim: the top-left of the trimmed art',
        '// in the stage (world px). Paintings: the frame alone, `window` the picture rect in the stage (x, y, w, h)',
        '// and `picture` the overlay frame the deco itself embeds (the still the hall shows).',
        'export const ROOK_ART = Object.freeze({',
    ]
    for r in rows:
        extra = ''
        if 'window' in r:
            extra = f", window: Object.freeze([{', '.join(num(v) for v in r['window'])}]), picture: '{r['picture']}'"
        lines.append(f"  {r['name']}: Object.freeze({{ file: 'assets/{r['file'][len('assets/'):]}', w: {r['w']}, h: {r['h']}, "
                     f"stage: [{r['stage'][0]}, {r['stage'][1]}], trim: [{r['trim'][0]}, {r['trim'][1]}]{extra} }}),")
    lines.append('});')
    open(OUT_JS, 'w').write('\n'.join(lines) + '\n')


def check():
    bad = []
    plan = json.load(open(PLAN))
    if [r['name'] for r in plan['pieces']] != [p[0] for p in PIECES]:
        bad.append('plan.json pieces differ from PIECES')
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
        if r['source'].startswith('item:') and sha(os.path.join(ITEMS, r['source'][5:])) != r['swf']:
            bad.append(f"{r['name']}: source SWF changed")
        if 'picture' in r and not os.path.exists(os.path.join(PAINTINGS, r['picture'])):
            bad.append(f"{r['name']}: missing {r['picture']}")
    before = open(OUT_JS).read() if os.path.exists(OUT_JS) else ''
    write_js(plan['pieces'])
    if open(OUT_JS).read() != before:
        open(OUT_JS, 'w').write(before)
        bad.append('public/js/rook-art.js is stale (run build)')
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
