#!/usr/bin/env python3.11
"""The eleven Giants' portraits as WebP, cut from Tiny Speck's own artwork.

Used by the Encyclopedia's Giants pages (tools/encyclopedia/giants.mjs): the hero of each Giant's
page (/encyclopedia/giants/<giant>/) and its small card in the section list (/encyclopedia/giants/).
They were first cut for the retired Groddle Wiki (register row G167); Austin approved them for the
Encyclopedia on 2026-11-12.

Source: tinyspeck/glitch-items giants/Giants_All.ai (CC0 1.0, glitch-items README.md; commit
9a64021, blob SOURCE_BLOB), an Illustrator CS5.1 file saved with PDF content: one page,
4181 x 9124 pt, eleven portrait panels on their own gradient backgrounds, three to a row and two in
the last row. The panels carry no names; each is matched to its giant by the miniature of the same
painting on that giant's Icon (items icon_<giant>, public/assets/sprites/giant-icons/icon_<giant>.webp,
e.g. the eagle on Cosma's, the elephant on Humbaba's, the octopus on Tii's), which fixes the reading
order in PANEL_ORDER. The pixels are Tiny Speck's, rasterised and cropped: nothing is drawn or
generated.

This file is not the glitch.com Giant_Mab.swf portrait (register G133, reference only): that one is
Tiny Speck web art outside the CC0 repos and never ships.

Output: public/assets/sprites/giant-portraits/<giant>.webp, WIDTH px wide (the panel's own aspect),
and SOURCE.txt beside them: the source, its licence and the sha256 of each file.

Usage (pdftoppm from poppler; python3.11 has Pillow; ../glitch-items beside the repo):
  python3.11 -I tools/giants/portraits.py            write the eleven files and SOURCE.txt
  python3.11 -I tools/giants/portraits.py --check    exit 1 if a file is missing or its bytes differ from SOURCE.txt
"""
import hashlib, os, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCE = os.path.join(ROOT, '..', 'glitch-items', 'giants', 'Giants_All.ai')
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites', 'giant-portraits')
DPI = 40
WIDTH = 360
# Panels in reading order (left to right, top to bottom), matched against each Icon's miniature.
PANEL_ORDER = ['cosma', 'alph', 'humbaba', 'spriggan', 'grendaline', 'zille', 'pot', 'lem', 'ti', 'friendly', 'mab']
# git blob of Giants_All.ai in tinyspeck/glitch-items (commit 9a64021).
SOURCE_BLOB = '46578eee6786402538ab5a12385c83604d1238ef'
NOTE = os.path.join(OUT, 'SOURCE.txt')


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def note_text():
    files = '\n'.join(f'  {g}.webp  sha256 {sha256(os.path.join(OUT, f"{g}.webp"))}' for g in sorted(PANEL_ORDER))
    return f"""Giants' portraits
=================

Source   tinyspeck/glitch-items giants/Giants_All.ai (commit 9a64021, blob {SOURCE_BLOB})
Licence  CC0 1.0 (Tiny Speck's public domain dedication, glitch-items README.md)
Made by  tools/giants/portraits.py: the file's one PDF page rasterised at {DPI} dpi (pdftoppm), each of
         its eleven panels cropped and scaled to {WIDTH} px wide, WebP quality 82. Cut, not drawn or
         generated: every pixel is Tiny Speck's painting.
Matched  each panel to its Giant by the same painting on that Giant's Icon (PANEL_ORDER in the script).
Used by  the Encyclopedia's Giants pages (tools/encyclopedia/giants.mjs): each Giant's hero and its
         card in the section list.

Files
{files}
"""


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
        if not os.path.isfile(NOTE) or open(NOTE, encoding='utf-8').read() != note_text():
            print(f'{os.path.relpath(NOTE, ROOT)} is missing or does not match the files (python3.11 -I tools/giants/portraits.py)')
            sys.exit(1)
        print(f'{len(PANEL_ORDER)} portraits match SOURCE.txt')
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
    with open(NOTE, 'w', encoding='utf-8') as f:
        f.write(note_text())


if __name__ == '__main__':
    main()
