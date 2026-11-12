#!/usr/bin/env python3.11
"""The eleven giants' portraits as WebP, cut from Tiny Speck's own artwork (Groddle Wiki, register row G167).

Source: tinyspeck/glitch-items giants/Giants_All.ai (CC0, glitch-items README.md), an Illustrator
CS5.1 file saved with PDF content: one page, 4181 x 9124 pt, eleven portrait panels on their own
gradient backgrounds, three to a row and two in the last row. The panels carry no names; each is
matched to its giant by the miniature of the same painting on that giant's Icon (items icon_<giant>,
public/assets/sprites/icons/icon_<giant>@3x.png, e.g. the eagle on Cosma's, the elephant on
Humbaba's, the octopus on Tii's), which fixes the reading order in PANEL_ORDER.

This file is not the glitch.com Giant_Mab.swf portrait (register G133, reference only): that one is
Tiny Speck web art outside the CC0 repos and never ships.

Output: public/assets/sprites/giant-portraits/<giant>.webp, WIDTH px wide (the panel's own aspect).

Usage (pdftoppm from poppler; python3.11 has Pillow):
  python3.11 -I tools/giants/portraits.py            write the eleven files
  python3.11 -I tools/giants/portraits.py --check    exit 1 if a file is missing
"""
import os, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCE = os.path.join(ROOT, '..', 'glitch-items', 'giants', 'Giants_All.ai')
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites', 'giant-portraits')
DPI = 40
WIDTH = 360
# Panels in reading order (left to right, top to bottom), matched against each Icon's miniature.
PANEL_ORDER = ['cosma', 'alph', 'humbaba', 'spriggan', 'grendaline', 'zille', 'pot', 'lem', 'ti', 'friendly', 'mab']


def runs(flags, min_len):
    """[start, end) runs of True at least min_len long."""
    out, start = [], None
    for i, f in enumerate(flags + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def panels(im):
    w, h = im.size
    px = im.load()
    ink = lambda x, y: min(px[x, y][:3]) < 250
    rows = runs([any(ink(x, y) for x in range(0, w, 3)) for y in range(h)], 200)
    found = []
    for top, bottom in rows:
        mid = range(top + 20, bottom - 20, 7)
        cols = runs([any(ink(x, y) for y in mid) for x in range(w)], 200)
        found += [(left, top, right, bottom) for left, right in cols]
    return found


def main():
    check = '--check' in sys.argv
    if check:
        missing = [g for g in PANEL_ORDER if not os.path.isfile(os.path.join(OUT, f'{g}.webp'))]
        if missing:
            print('missing portraits: ' + ', '.join(missing) + ' (python3.11 -I tools/giants/portraits.py)')
            sys.exit(1)
        return
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdftoppm', '-r', str(DPI), '-png', SOURCE, os.path.join(tmp, 'page')], check=True)
        page = Image.open(os.path.join(tmp, sorted(os.listdir(tmp))[0])).convert('RGB')
    boxes = panels(page)
    if len(boxes) != len(PANEL_ORDER):
        sys.exit(f'found {len(boxes)} panels, expected {len(PANEL_ORDER)}')
    os.makedirs(OUT, exist_ok=True)
    for giant, box in zip(PANEL_ORDER, boxes):
        art = page.crop(box)
        art = art.resize((WIDTH, round(art.height * WIDTH / art.width)), Image.LANCZOS)
        path = os.path.join(OUT, f'{giant}.webp')
        art.save(path, 'WEBP', quality=82, method=6)
        print(f'{giant}: panel {box} -> {art.size[0]}x{art.size[1]} {os.path.getsize(path) // 1024} KB')


if __name__ == '__main__':
    main()
