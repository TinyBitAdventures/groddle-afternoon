#!/usr/bin/env python3.11
"""The widget by the Hall of Rejected Concepts' first window (register row G86): its idle loop at 3x.

Two player recordings (reference only: -03T3bLY7a0 t0016-t0024 and E6BIN3OfEkI ~0:09) show a widget
hovering just right of the Hall's first window. Its yellow knob, pale face with dark eyes and tan body
match the widgetWood variant of Tiny Speck's npc_widget.swf (glitch-items inhabitants/widget_bot, CC0),
the art the Mezzanine's Greeterbot also wears; the other variants are widgetGreen, widgetWhite,
widgetPink and widgetTin (npc_widget.as config_options, GSJS items/npc_widget.js instancePropsChoices).

npc_widget.swf: SymbolClass widgetWood = DefineSprite 40, frame labels idle 1, attract 25, talk 82,
move 151; 24 fps (SWF header). idle (one of the loopers) is frames 1-24 and frame 24 repeats frame 1,
so the loop is frames 1-23.

FFDec exports sprite 40 at zoom 3 (every frame on one canvas), the idle frames are trimmed to their
shared visible box padded to whole world pixels, packed into one sheet (COLS columns) and encoded as WebP
(tools/deco-pipeline/build.py encode: lossy q82 sharp YUV, lossless where lossy shows artefacts).

Writes public/assets/sprites/quests/hall-rejected-concepts/npc_widget_widgetWood_idle@3x.webp and
tools/hall-concepts-art/widget.json; js/hall-rejected-concepts.js HALL_WIDGET carries the sheet geometry
(tests/hall-rejected-concepts.test.js checks it against widget.json).

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp):
  python3.11 -I tools/hall-concepts-art/widget.py --work <scratch dir>
  python3.11 -I tools/hall-concepts-art/widget.py --check     (no rendering; exit 1 on a problem)
The SWF is read by FFDec, never executed.
"""
import argparse, hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
sys.dont_write_bytecode = True
for sub in ('deco-audit', 'icon-hires', 'deco-pipeline'):
    sys.path.insert(0, os.path.join(SPIKE, 'tools', sub))
import build as deco  # noqa: E402  (tools/deco-pipeline/build.py)
from PIL import Image  # noqa: E402

SWF = os.path.expanduser('~/Documents/glitch-audit/glitch-items/inhabitants/widget_bot/npc_widget.swf')
OUT = os.path.join(SPIKE, 'public', 'assets', 'sprites', 'quests', 'hall-rejected-concepts')
PLAN = os.path.join(HERE, 'widget.json')
VARIANT = 'widgetWood'
SPRITE_ID = 40  # SymbolClass widgetWood
FRAMES = range(1, 24)  # idle 1-24; 24 == 1
FPS = 24
COLS = 6
ZOOM = 3
NAME = f'npc_widget_{VARIANT}_idle@{ZOOM}x.webp'


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def build(work):
    os.makedirs(work, exist_ok=True)
    src = os.path.join(work, 'widget-src')
    out = os.path.join(work, 'widget-out')
    os.makedirs(src, exist_ok=True)
    link = os.path.join(src, 'npc_widget.swf')
    if not os.path.islink(link):
        os.symlink(SWF, link)
    deco.ffdec('-zoom', ZOOM, '-selectid', SPRITE_ID, '-format', 'sprite:png', '-export', 'sprite', out, src, heap='2g')
    folder = os.path.join(out, 'npc_widget.swf', f'DefineSprite_{SPRITE_ID}_{VARIANT}')
    frames = [Image.open(os.path.join(folder, f'{i}.png')).convert('RGBA') for i in FRAMES]
    size = frames[0].size
    if any(f.size != size for f in frames):
        raise SystemExit('FFDec frames differ in size')
    boxes = [f.getchannel('A').point(lambda a: 255 if a > 2 else 0).getbbox() for f in frames]
    l = min(b[0] for b in boxes) // ZOOM * ZOOM
    t = min(b[1] for b in boxes) // ZOOM * ZOOM
    r = -(-max(b[2] for b in boxes) // ZOOM) * ZOOM
    b = -(-max(b[3] for b in boxes) // ZOOM) * ZOOM
    fw, fh = r - l, b - t
    rows = -(-len(frames) // COLS)
    sheet = Image.new('RGBA', (fw * COLS, fh * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        cell = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        cell.paste(f.crop((l, t, min(r, f.width), min(b, f.height))), (0, 0))
        sheet.paste(cell, ((i % COLS) * fw, (i // COLS) * fh))
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, NAME)
    nbytes, lossless, err = deco.encode(sheet, dst, os.path.join(work, 'enc'))
    plan = {
        'swf': sha(SWF),
        'variant': VARIANT,
        'sprite': SPRITE_ID,
        'frames': len(frames),
        'fps': FPS,
        'cols': COLS,
        'frameW': fw // ZOOM,
        'frameH': fh // ZOOM,
        'trim': [l // ZOOM, t // ZOOM],
        'canvas': [-(-size[0] // ZOOM), -(-size[1] // ZOOM)],
        'file': NAME,
        'bytes': nbytes,
        'lossless': lossless,
        'error': err,
        'webp': sha(dst),
    }
    json.dump(plan, open(PLAN, 'w'), indent=1)
    open(PLAN, 'a').write('\n')
    print(f'{NAME}: {sheet.width}x{sheet.height} {nbytes} B{" lossless" if lossless else ""}, frame {fw // ZOOM}x{fh // ZOOM}')


def check():
    bad = []
    plan = json.load(open(PLAN))
    dst = os.path.join(OUT, plan['file'])
    if not os.path.exists(dst):
        bad.append(f'missing {dst}')
    else:
        if sha(dst) != plan['webp']:
            bad.append(f'{dst} changed')
        rows = -(-plan['frames'] // plan['cols'])
        with Image.open(dst) as im:
            if im.size != (plan['frameW'] * plan['cols'] * ZOOM, plan['frameH'] * rows * ZOOM):
                bad.append(f'{dst} is {im.size}')
    if os.path.exists(SWF) and sha(SWF) != plan['swf']:
        bad.append('npc_widget.swf changed')
    if plan['frames'] != len(FRAMES) or plan['cols'] != COLS or plan['file'] != NAME:
        bad.append('widget.json differs from the script')
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
