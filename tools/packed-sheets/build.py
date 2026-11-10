#!/usr/bin/env python3.11 -I
"""Packed animation sheets from Tiny Speck's OGA sprite sheets (CC0).

Lane refsart, 2026-11-10 (register row G646): states the original played that the remake held
and did not draw. An OGA `<class>__x1_<state>_png_<epoch>.png` sheet is the client's own recording
of one state: fixed cells, read left to right and top to bottom, one cell per SWF frame. Many of
those cells are the same picture (a Chicken's `pause` holds two poses for 88 of its 131 frames)
and most of each cell is empty (the bird fills under a third of its 148 x 110 cell), so each
state is packed as:

  - one WebP of its distinct cells, in order of first showing, every cell cropped to one box (the
    union of the state's art plus PAD px, kept inside the cell) and laid out in the squarest grid;
  - a row in public/js/packed-sheets-data.js: the grid, the box's place in the original cell
    (`at`) and the original cell's size (`cell`), so the game gives each frame its whole cell back
    (a Pixi trim: size, anchor and hit box unchanged), `plays` (the state's frames) and `seq`: the
    packed cell each of them shows (left out when every frame is its own cell).

The 3x twins are rendered from each SWF by tools/vector-sprites/build.mjs: `frameList` in the
row (one SWF frame per packed cell) goes into that tool's manifest.

sheets.json rows: { set, name, class, file (the OGA sheet's name), fw, fh, frames, out (under
public/), fps, loop, swf: { path, sprite, label, start } and a `source` note }. The grid is
measured here, never trusted: the sheet must divide into fw x fh cells, and the first `frames`
cells must hold art (all but those a row lists in `blank`: a frame Tiny Speck's recording left
empty, which gets -1 in seq) and no cell after them.

  python3.11 -I tools/packed-sheets/build.py            writes the sheets, results.json and the module
  python3.11 -I tools/packed-sheets/build.py --check    exit 1 when anything is stale. With the OGA
        dump beside the repo every sheet is rebuilt and compared pixel for pixel; without it the
        shipped files are checked against results.json (pixel hashes), and the module against it.
"""
import argparse
import glob
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
PUBLIC = os.path.join(SPIKE, 'public')
MANIFEST = os.path.join(HERE, 'sheets.json')
RESULTS = os.path.join(HERE, 'results.json')
OUT_JS = os.path.join(PUBLIC, 'js', 'packed-sheets-data.js')
PAD = 2
# A 3x twin stays under 4096 px a side.
MAX_SIDE = 1365


def audit_dir():
    for d in (os.environ.get('GLITCH_AUDIT'), os.path.dirname(SPIKE), os.path.expanduser('~/Documents/glitch-audit')):
        if d and os.path.isdir(os.path.join(d, 'opengameart')):
            return d
    return None


AUDIT = audit_dir()


def oga_path(row):
    hits = sorted(glob.glob(os.path.join(AUDIT, 'opengameart', '*', 'glitch-assets', row['class'], row['file'])))
    if not hits:
        raise SystemExit(f"{row['set']} {row['name']}: {row['file']} is not under opengameart/*/glitch-assets/{row['class']}/")
    return hits[0]


def measure(row):
    """The sheet's cells after checking the grid: (cells, cols, rows)."""
    from PIL import Image
    fw, fh, frames = row['fw'], row['fh'], row['frames']
    im = Image.open(oga_path(row)).convert('RGBA')
    if im.size[0] % fw or im.size[1] % fh:
        raise SystemExit(f"{row['set']} {row['name']}: {im.size} is not a grid of {fw}x{fh}")
    cols, rows = im.size[0] // fw, im.size[1] // fh
    cells = []
    for k in range(cols * rows):
        c = im.crop(((k % cols) * fw, (k // cols) * fh, (k % cols + 1) * fw, (k // cols + 1) * fh))
        has = bool(c.getchannel('A').getbbox())
        if k < frames and not has and k not in row.get('blank', []):
            raise SystemExit(f"{row['set']} {row['name']}: frame {k} is empty; wrong grid?")
        if k >= frames and has:
            raise SystemExit(f"{row['set']} {row['name']}: cell {k} past the {frames} frames holds art")
        if k < frames:
            cells.append(c)
    return cells, cols, rows


def clear_transparent(img):
    from PIL import Image
    blank = Image.new('RGBA', img.size, (0, 0, 0, 0))
    return Image.composite(img, blank, img.getchannel('A').point(lambda a: 255 if a else 0))


def plan(row):
    """Pack one state. Returns (image, result row)."""
    from PIL import Image
    cells, src_cols, src_rows = measure(row)
    fw, fh = row['fw'], row['fh']
    box = None
    for c in cells:
        bb = c.getchannel('A').getbbox()
        if bb:
            box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
    x0, y0 = max(0, box[0] - PAD), max(0, box[1] - PAD)
    x1, y1 = min(fw, box[2] + PAD), min(fh, box[3] + PAD)
    w, h = x1 - x0, y1 - y0
    seen, uniq, seq, first = {}, [], [], []
    for k, c in enumerate(cells):
        if not c.getchannel('A').getbbox():
            # A frame with nothing in it (row `blank`): no cell, the game draws nothing for it.
            seq.append(-1)
            continue
        crop = clear_transparent(c.crop((x0, y0, x1, y1)))
        key = hashlib.sha1(crop.tobytes()).hexdigest()
        if key not in seen:
            seen[key] = len(uniq)
            uniq.append(crop)
            first.append(k)
        seq.append(seen[key])
    n = len(uniq)
    cols = max(1, min(n, round(math.sqrt(n * h / w)), MAX_SIDE // w))
    while math.ceil(n / cols) * h > MAX_SIDE and cols * w + w <= MAX_SIDE:
        cols += 1
    rows = math.ceil(n / cols)
    out = Image.new('RGBA', (cols * w, rows * h), (0, 0, 0, 0))
    for i, c in enumerate(uniq):
        out.paste(c, ((i % cols) * w, (i // cols) * h))
    swf = row.get('swf') or {}
    res = {
        'set': row['set'], 'name': row['name'], 'path': row['out'],
        'fw': w, 'fh': h, 'cols': cols, 'cells': n, 'frames': len(cells),
        'cell': [fw, fh], 'at': [x0, y0], 'fps': row.get('fps', 30), 'loop': bool(row.get('loop', False)),
        'seq': None if seq == list(range(len(cells))) else seq,
        'oga': {'file': row['file'], 'size': [src_cols * fw, src_rows * fh], 'cols': src_cols, 'rows': src_rows, 'art': list(box)},
        'pixels': hashlib.sha256(out.tobytes()).hexdigest(),
    }
    if swf.get('start'):
        res['frameList'] = [swf['start'] + k for k in first]
    return out, res


def shipped_hash(path):
    # The colour under a fully transparent pixel is not kept by the WebP encoder: compare what is seen.
    from PIL import Image
    return hashlib.sha256(clear_transparent(Image.open(path).convert('RGBA')).tobytes()).hexdigest()


def js_text(results):
    lines = [
        '// Generated by tools/packed-sheets/build.py (register row G646). Do not edit by hand:',
        '// change tools/packed-sheets/sheets.json and rerun it (python3.11 -I tools/packed-sheets/build.py).',
        '//',
        "// States of Tiny Speck's own animations (OGA sheets, CC0), each packed as its distinct cells cropped to",
        '// one box. path, fw, fh, cols, frames: the packed grid (frames = the cells drawn in the file, as every',
        '// sheet def here). plays: how many frames the state has; seq: the packed cell each of them shows (absent:',
        '// frame k is cell k; -1: an empty frame). cell: the original OGA cell; at: where the box sits in it. fps and loop: how the',
        '// client played it. js/packed-sheets.js cuts the textures.',
        '',
        'export const PACKED_SHEETS = Object.freeze({',
    ]
    sets = {}
    for r in results:
        sets.setdefault(r['set'], []).append(r)
    for name in sorted(sets):
        lines.append(f'  {json.dumps(name)}: Object.freeze({{')
        for r in sets[name]:
            oga = r['oga']
            lines.append(f"    // OGA {oga['file']}: {oga['size'][0]}x{oga['size'][1]}, {oga['cols']} x {oga['rows']} cells of "
                         f"{r['cell'][0]}x{r['cell'][1]}, {r['frames']} frames, {r['cells']} distinct")
            seq = '' if r['seq'] is None else f", seq: Object.freeze({json.dumps(r['seq'], separators=(',', ':'))})"
            lines.append(f"    {json.dumps(r['name'])}: Object.freeze({{ path: '{r['path']}', fw: {r['fw']}, fh: {r['fh']}, cols: {r['cols']}, "
                         f"frames: {r['cells']}, plays: {r['frames']}, cell: Object.freeze([{r['cell'][0]}, {r['cell'][1]}]), "
                         f"at: Object.freeze([{r['at'][0]}, {r['at'][1]}]), fps: {r['fps']}, loop: {'true' if r['loop'] else 'false'}{seq} }}),")
        lines.append('  }),')
    lines += ['});', '']
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--only', default='')
    args = ap.parse_args()
    rows = json.load(open(MANIFEST))['sheets']
    old = {(r['set'], r['name']): r for r in (json.load(open(RESULTS))['sheets'] if os.path.exists(RESULTS) else [])}
    stale = []
    results = []
    for row in rows:
        key = (row['set'], row['name'])
        out_path = os.path.join(PUBLIC, row['out'])
        if AUDIT is None or (args.only and args.only not in f"{row['set']}/{row['name']}"):
            # No dump here (a public clone), or not asked for: the shipped file against the last results.
            res = old.get(key)
            if not res:
                stale.append(f'{key}: no result (run the builder with the OGA dump beside the repo)')
                continue
            if not os.path.exists(out_path) or shipped_hash(out_path) != res['pixels']:
                stale.append(f"{row['out']}: missing or not the pixels in results.json")
            results.append(res)
            continue
        img, res = plan(row)
        results.append(res)
        if args.check:
            if not os.path.exists(out_path) or shipped_hash(out_path) != res['pixels']:
                stale.append(f"{row['out']}: not what the OGA sheet packs to")
            if old.get(key) != res:
                stale.append(f'{key}: results.json differs')
        else:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            img.save(out_path, 'WEBP', lossless=True, quality=100, method=6, exact=False)
            if shipped_hash(out_path) != res['pixels']:
                raise SystemExit(f"{row['out']}: the WebP does not decode to the packed pixels")
            print(f"{row['out']}: {img.size[0]}x{img.size[1]}, {res['cells']} cells of {res['fw']}x{res['fh']} "
                  f"({res['frames']} frames), {os.path.getsize(out_path)} bytes")
    text = js_text(results)
    if args.check:
        if not os.path.exists(OUT_JS) or open(OUT_JS).read() != text:
            stale.append('public/js/packed-sheets-data.js is stale')
        extra = set(old) - {(r['set'], r['name']) for r in rows}
        if extra:
            stale.append(f'results.json has rows the manifest lacks: {sorted(extra)}')
        if stale:
            print('\n'.join(stale))
            sys.exit(1)
        print(f'packed sheets: {len(results)} current' + ('' if AUDIT else ' (no OGA dump: checked against results.json)'))
        return
    if stale:
        print('\n'.join(stale))
        sys.exit(1)
    json.dump({'sheets': results}, open(RESULTS, 'w'), indent=1)
    open(RESULTS, 'a').write('\n')
    open(OUT_JS, 'w').write(text)
    print(f'wrote {len(results)} sheets, tools/packed-sheets/results.json and public/js/packed-sheets-data.js')


if __name__ == '__main__':
    main()
