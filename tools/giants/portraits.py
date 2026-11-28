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

Cut-outs (#759): <giant>-cut.webp and <giant>-cut@2x.webp, the same painting without its panel, on
a transparent ground, for the Giant's screen ("I love you <Giant>", public/js/giant-love.js), where
the original's video (giant_<name>_flv_overlay, lost) showed this painting cut out with a soft
glow. Each panel in the file is one optional-content layer (/OC /MC0 ... /MC10) whose first paint is
the panel's flat gradient: a clip to the panel rectangle and one shading fill (`BX /Sh<n> sh EX`).
Every blend mode in the file is /Normal, so dropping those eleven fills (qpdf --qdf, then fix-qdf)
and rendering with a transparent page (pdftocairo -transp) leaves exactly Tiny Speck's figure
pixels, soft edges and the faint bubbles and specks painted around them included. Each cut-out is
cropped to its panel rectangle (read from that same clip), then trimmed to its painted pixels plus
CUT_PAD; every Giant keeps the same scale (CUT_PANEL_W px per panel width at 2x), so their sizes
relative to each other are the painting's.

Usage (pdftoppm and pdftocairo from poppler, qpdf and fix-qdf; python3.11 has Pillow; ../glitch-items beside the repo):
  python3.11 -I tools/giants/portraits.py            write the eleven portraits, their cut-outs and SOURCE.txt
  python3.11 -I tools/giants/portraits.py --check    exit 1 if a file is missing or its bytes differ from SOURCE.txt
"""
import hashlib, os, re, subprocess, sys, tempfile
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
# Cut-outs: the panel is CUT_PANEL_W px wide at 2x (the 1x file is half), trimmed to the figure plus CUT_PAD px.
CUT_PANEL_W = 600
CUT_PAD = 6
PAGE_H_PT = 9124.18


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def out_files():
    return [f'{g}{suffix}.webp' for g in sorted(PANEL_ORDER) for suffix in ('', '-cut', '-cut@2x')]


def note_text():
    files = '\n'.join(f'  {f}  sha256 {sha256(os.path.join(OUT, f))}' for f in out_files())
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

Cut-outs <giant>-cut.webp (1x) and <giant>-cut@2x.webp: the same painting without its panel. Each
         panel is one layer of the file whose first paint is the panel's flat gradient (one shading
         fill clipped to the panel); those eleven fills are dropped from the page (qpdf, fix-qdf)
         and the page rendered on a transparent ground (pdftocairo -transp). Every blend mode in
         the file is Normal, so what is left is exactly the figure as painted. Cropped to the
         panel, trimmed to the painted pixels plus {CUT_PAD} px, the panel {CUT_PANEL_W} px wide at 2x
         (all eleven at one scale), WebP quality 85 with alpha.
Used by  the Giant's screen ("I love you <Giant>" at a shrine, public/js/giant-love.js and
         public/js/features/shrine-hint-feature.js), as the original's video showed the painting.

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


def strip_panel_grounds(src, dst, tmp):
    """Giants_All.ai without the eleven panel gradients; returns the panel rectangles in pt (x0, y0, x1, y1, PDF y up)."""
    qdf = os.path.join(tmp, 'giants.qdf')
    subprocess.run(['qpdf', '--qdf', '--object-streams=disable', src, qdf], check=True)
    data = open(qdf, 'rb').read()
    start = data.index(b'%% Contents for page 1')
    end = data.index(b'endstream', start)
    seg = data[start:end]
    layer = re.compile(rb'/OC /MC\d+ BDC')
    ground = re.compile(rb'(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\s+W n\s+q\s+/GS\d+ gs\s+[-\d. ]+ cm\s+(BX /Sh\d+ sh EX)')
    out, pos, rects = [], 0, []
    for m in layer.finditer(seg):
        g = ground.search(seg, m.end())
        if not g or g.start() - m.end() > 40:
            sys.exit(f'layer at byte {m.start()}: its first paint is not a clipped shading (the panel gradient)')
        x, y, w, h = (float(v) for v in g.groups()[:4])
        rects.append((min(x, x + w), min(y, y + h), max(x, x + w), max(y, y + h)))
        out += [seg[pos:g.start(5)], b'']
        pos = g.end(5)
    out.append(seg[pos:])
    if len(rects) != len(PANEL_ORDER):
        sys.exit(f'found {len(rects)} panel layers, expected {len(PANEL_ORDER)}')
    edited = os.path.join(tmp, 'giants-cut.qdf')
    with open(edited, 'wb') as f:
        f.write(data[:start] + b''.join(out) + data[end:])
    with open(dst, 'wb') as f:
        subprocess.run(['fix-qdf', edited], check=True, stdout=f)
    # Reading order (top row first, left to right), as PANEL_ORDER.
    return sorted(rects, key=lambda r: (-round(r[3] / 100), r[0]))


def premul_resize(im, size):
    return im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def cut_outs(tmp):
    pdf = os.path.join(tmp, 'giants-cut.pdf')
    rects = strip_panel_grounds(SOURCE, pdf, tmp)
    panel_pt = rects[0][2] - rects[0][0]
    px_per_pt = CUT_PANEL_W / panel_pt
    subprocess.run(['pdftocairo', '-png', '-transp', '-singlefile', '-r', f'{px_per_pt * 72:.4f}', pdf, os.path.join(tmp, 'cut')], check=True)
    page = Image.open(os.path.join(tmp, 'cut.png')).convert('RGBA')
    for giant, (x0, y0, x1, y1) in zip(PANEL_ORDER, rects):
        box = tuple(round(v * px_per_pt) for v in (x0, PAGE_H_PT - y1, x1, PAGE_H_PT - y0))
        art = page.crop(box)
        alpha = art.getchannel('A')
        w, h = art.size
        edge = max(alpha.crop(b).getextrema()[1] for b in ((0, 0, w, 1), (0, h - 1, w, h), (0, 0, 1, h), (w - 1, 0, w, h)))
        if edge > 16:
            sys.exit(f'{giant}: the figure reaches the panel edge (alpha {edge}); the panel crop would cut it')
        l, t, r, b = alpha.point(lambda a: 255 if a > 2 else 0).getbbox()
        art = art.crop((max(0, l - CUT_PAD), max(0, t - CUT_PAD), min(w, r + CUT_PAD), min(h, b + CUT_PAD)))
        if art.size[0] % 2 or art.size[1] % 2:  # even, so the 1x file is exactly half
            art = art.crop((0, 0, art.size[0] - art.size[0] % 2, art.size[1] - art.size[1] % 2))
        for suffix, im in (('-cut@2x', art), ('-cut', premul_resize(art, (art.size[0] // 2, art.size[1] // 2)))):
            path = os.path.join(OUT, f'{giant}{suffix}.webp')
            im.save(path, 'WEBP', quality=85, alpha_quality=100, method=6)
            print(f'{giant}{suffix}: {im.size[0]}x{im.size[1]} {os.path.getsize(path) // 1024} KB')


def main():
    check = '--check' in sys.argv
    if check:
        missing = [f for f in out_files() if not os.path.isfile(os.path.join(OUT, f))]
        if missing:
            print('missing portraits: ' + ', '.join(missing) + ' (python3.11 -I tools/giants/portraits.py)')
            sys.exit(1)
        if not os.path.isfile(NOTE) or open(NOTE, encoding='utf-8').read() != note_text():
            print(f'{os.path.relpath(NOTE, ROOT)} is missing or does not match the files (python3.11 -I tools/giants/portraits.py)')
            sys.exit(1)
        print(f'{len(PANEL_ORDER)} portraits and their cut-outs match SOURCE.txt')
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
    with tempfile.TemporaryDirectory() as tmp:
        cut_outs(tmp)
    with open(NOTE, 'w', encoding='utf-8') as f:
        f.write(note_text())


if __name__ == '__main__':
    main()
