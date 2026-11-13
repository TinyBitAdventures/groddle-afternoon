#!/usr/bin/env python3
"""
The Still's four world states (#285) from Tiny Speck's own CC0 sheets in the OGA archive
(opengameart/extracted_supply/glitch-assets/still/still__x1_<state>_png_*.png), shipped as
lossless WebP at public/assets/sprites/machines/still-<state>.webp with the source grid kept.

Each sheet is 96x163 cells read left to right, top to bottom; the populated cells are counted
from the alpha channel and must match public/js/still-art.js STILL_ART. The Still's body rests
on y 140 of the cell, its registration 62 px in (GSJS items/still.js getAssetInfo position
x -35, w 68, h 100: the body's left edge is at 27).

Run: python3.11 -I tools/still-art/build.py [--check]
"""
import glob, os, re, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, '..', 'opengameart', 'extracted_supply', 'glitch-assets', 'still')
if not os.path.isdir(SRC):
    SRC = os.path.expanduser('~/Documents/glitch-audit/opengameart/extracted_supply/glitch-assets/still')
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites', 'machines')
JS = os.path.join(ROOT, 'public', 'js', 'still-art.js')
FW, FH = 96, 163
STATES = ['empty', 'active', 'ready', 'collect']


def measure(path):
    im = Image.open(path).convert('RGBA')
    cols, rows = im.width // FW, im.height // FH
    frames = 0
    for k in range(cols * rows):
        c, r = k % cols, k // cols
        if im.crop((c * FW, r * FH, c * FW + FW, r * FH + FH)).getchannel('A').getbbox():
            frames = k + 1
    return cols, rows, frames


def main():
    check = '--check' in sys.argv
    js = open(JS, encoding='utf8').read()
    bad = []
    for state in STATES:
        src = glob.glob(os.path.join(SRC, f'still__x1_{state}_png_*.png'))
        out = os.path.join(OUT, f'still-{state}.webp')
        if not src:
            print(f'{state}: source sheet missing in {SRC}')
            bad.append(state)
            continue
        cols, rows, frames = measure(src[0])
        m = re.search(rf"{state}: Object\.freeze\(\{{ url: '[^']+', cols: (\d+), frames: (\d+)", js)
        want = (int(m.group(1)), int(m.group(2))) if m else None
        print(f'{state}: {cols}x{rows} cells of {FW}x{FH}, {frames} frames (still-art.js {want})')
        if want != (cols, frames):
            bad.append(state)
        if check:
            if not os.path.exists(out):
                bad.append(f'{state} webp')
            else:
                with Image.open(out) as w:
                    if w.size != Image.open(src[0]).size:
                        bad.append(f'{state} size')
        else:
            subprocess.run(['cwebp', '-quiet', '-lossless', '-z', '9', '-exact', src[0], '-o', out], check=True)
    if bad:
        print('out of date:', ', '.join(bad))
        sys.exit(1)


main()
