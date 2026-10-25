#!/usr/bin/env python3.11
"""Machine art states (register row G193): the Fuelmaker, Blockmaker, Metal Machine and Woodworker draw
their own SWF states instead of a wobbling icon and a drawn ready light.

What the source says
- Each machine SWF (tinyspeck/glitch-items tools/<machine>/<machine>.swf) is timeline animated: its root
  script names an `animatee` clip, and `animations` / `loopers` list its states (the .fla DOMDocument.xml,
  e.g. fuelmaker.fla: animatee = fuelmaker; loopers = [... 'loadOpenHold', 'active', 'ready',
  'collectOpenHold']). The client records each state from the animatee's FrameLabels
  (glitch-client spritesheet/ItemFrameCollectionRecorder.as:486-540), loops the `loopers` and plays the
  rest once (SSCollection.as:116-131) at the engine's 30 fps (TSEngineConstants.as:6 TARGET_FRAMERATE;
  the 24 fps header of fuelmaker.swf and blockmaker.swf does not apply).
- The animatee's labels, not the root's, give the frame counts: the Metal Machine's collectOpen is
  14 frames on the animatee and 8 on the root `states` layer, and the Blockmaker's loadClose 19 vs 18.
  Tiny Speck's own OGA sheets (`<machine>__x1_<state>_png_*.png`, the client's recordings) agree with
  the animatee, cell for cell.
- When each state shows comes from GSJS (cited in public/js/machine-art.js).

What this writes
- public/assets/sprites/machines/<machine>-states.webp: the nine states the game plays (STATES below),
  every OGA cell cropped to one rectangle per machine (the union of the art over those states, kept in
  PLAN so the table builds without the dump) and packed left to right, top to bottom, `cols` per row.
  Lossless; fully transparent pixels are cleared to 0,0,0,0.
- public/js/machine-art-sheets.js: per machine the sheet, cell size, columns, frame count, each state's
  [first, count], the anchor (the GSJS getAssetInfo registration x, the art's bottom) and the Make panel
  scale.

Usage (python3.11 has Pillow):
  python3.11 -I tools/build-machine-art.py            build the sheets and the table
  python3.11 -I tools/build-machine-art.py --check    exit 1 if a sheet or the table is stale
--check always checks the table and each sheet's size; with the OGA dump present (GLITCH_AUDIT, default
~/Documents/glitch-audit) it rebuilds each sheet in memory and compares pixels, and checks the crop and
anchor in PLAN; with glitch-items present it checks every state's frame count against the SWF's animatee
FrameLabels. The SWFs are data: their tags are read, nothing runs them.
"""
import argparse, glob, os, struct, sys, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(HERE)
PUBLIC = os.path.join(SPIKE, 'public')
OUT = os.path.join(PUBLIC, 'assets', 'sprites', 'machines')
OUT_JS = os.path.join(PUBLIC, 'js', 'machine-art-sheets.js')


def audit_dir():
    for d in (os.environ.get('GLITCH_AUDIT'), os.path.dirname(SPIKE), os.path.expanduser('~/Documents/glitch-audit')):
        if d and os.path.isdir(os.path.join(d, 'opengameart')):
            return d
    return None


AUDIT = audit_dir()
FPS = 30  # TSEngineConstants.as:6
MAX_W = 2048  # sheet width cap (the cols per row follow from the cell width)
# The Make panel's tool box (style.css .mp-tool-wrap, 112 x 104), as for the G188 tool sheets.
BOX_W, BOX_H, MAX_SCALE = 110, 93, 1.6

# The states the game plays, in sheet order. assembled is idle; the rest are the making cycle.
STATES = ['assembled', 'loadOpen', 'loadOpenHold', 'loadClose', 'active', 'ready',
          'collectOpen', 'collectOpenHold', 'collectClose']
# The .fla `loopers` that are in STATES (the same four Hold/loop names in every machine).
LOOPERS = ['assembled', 'loadOpenHold', 'active', 'ready', 'collectOpenHold']

# machine: OGA folder, OGA cell (w, h), crop (x0, y0, x1, y1) inside the cell, anchor x in the cell
# (assembled art left - getAssetInfo position.x), glitch-items SWF, GSJS getAssetInfo line.
# Frame counts per state come from the SWF (checked) and the OGA grid (non-empty cells).
PLAN = {
    'blockmaker': ('extracted_supply', (149, 263), (0, 79, 143, 262), 79,
                   'tools/blockmaker/blockmaker.swf', 'items/blockmaker.js:1614'),
    'fuelmaker': ('extracted_recipes', (154, 333), (33, 184, 154, 330), 95,
                  'tools/fuelmaker/fuelmaker.swf', 'items/fuelmaker.js:1609'),
    'metalmaker': ('extracted_mining', (130, 363), (0, 146, 129, 362), 63,
                   'tools/metalmaker/metalmaker.swf', 'items/metalmaker.js:1715'),
    'woodworker': ('extracted_recipes', (146, 354), (12, 206, 145, 352), 80,
                   'tools/woodworker/woodworker.swf', 'items/woodworker.js:1593'),
}

# Frames per state (animatee FrameLabels; the OGA grids hold exactly these many non-empty cells).
FRAMES = {
    'blockmaker': {'assembled': 1, 'loadOpen': 18, 'loadOpenHold': 1, 'loadClose': 19, 'active': 40, 'ready': 14,
                   'collectOpen': 7, 'collectOpenHold': 1, 'collectClose': 5},
    'fuelmaker': {'assembled': 1, 'loadOpen': 15, 'loadOpenHold': 1, 'loadClose': 13, 'active': 40, 'ready': 14,
                  'collectOpen': 8, 'collectOpenHold': 1, 'collectClose': 10},
    'metalmaker': {'assembled': 1, 'loadOpen': 10, 'loadOpenHold': 1, 'loadClose': 13, 'active': 46, 'ready': 14,
                   'collectOpen': 14, 'collectOpenHold': 1, 'collectClose': 10},
    'woodworker': {'assembled': 1, 'loadOpen': 10, 'loadOpenHold': 1, 'loadClose': 10, 'active': 40, 'ready': 14,
                   'collectOpen': 8, 'collectOpenHold': 1, 'collectClose': 10},
}


def out_name(machine):
    return f'{machine}-states.webp'


def geometry(machine):
    """Cell size, columns, rows and frame total of a machine's packed sheet."""
    _dir, _cell, (x0, y0, x1, y1), _ax, _swf, _gsjs = PLAN[machine]
    fw, fh = x1 - x0, y1 - y0
    total = sum(FRAMES[machine][s] for s in STATES)
    cols = MAX_W // fw
    rows = -(-total // cols)
    return fw, fh, cols, rows, total


def scale_for(fw, fh):
    return round(min(MAX_SCALE, BOX_W / fw, BOX_H / fh), 2)


# ---- SWF: FrameLabels of every DefineSprite --------------------------------------------------------

def _tags(body, i, end):
    while i < end:
        cl = struct.unpack('<H', body[i:i + 2])[0]; i += 2
        code, ln = cl >> 6, cl & 0x3f
        if ln == 0x3f:
            ln = struct.unpack('<I', body[i:i + 4])[0]; i += 4
        yield code, body[i:i + ln]
        i += ln
        if code == 0:
            return


def swf_sprite_labels(path):
    """[{label: frame count}] for each DefineSprite (tag 39) of an FWS/CWS SWF that has FrameLabels."""
    d = open(path, 'rb').read()
    if d[:3] == b'CWS':
        body = zlib.decompress(d[8:])
    elif d[:3] == b'FWS':
        body = d[8:]
    else:
        raise ValueError(f'{path}: unsupported SWF signature {d[:3]!r}')
    nbits = body[0] >> 3
    start = (5 + 4 * nbits + 7) // 8 + 4
    out = []
    for code, data in _tags(body, start, len(body)):
        if code != 39:
            continue
        frame, labels = 0, []
        for c, t in _tags(data, 4, len(data)):
            if c == 1:
                frame += 1
            elif c == 43:
                labels.append((t[:t.index(b'\0')].decode('latin1'), frame))
        if labels:
            out.append({name: (labels[k + 1][1] if k + 1 < len(labels) else frame) - at
                        for k, (name, at) in enumerate(labels)})
    return out


def animatee_labels(path):
    """The animatee's {label: frames}: the sprite that labels `active`, with the most labels."""
    rows = [r for r in swf_sprite_labels(path) if 'active' in r and 'ready' in r]
    return max(rows, key=len) if rows else {}


# ---- sheets ------------------------------------------------------------------------------------------

def oga_path(machine, state):
    folder = PLAN[machine][0]
    hits = sorted(glob.glob(os.path.join(AUDIT, 'opengameart', folder, 'glitch-assets', machine,
                                         f'{machine}__x1_{state}_png_*.png')))
    if len(hits) != 1:
        raise SystemExit(f'{machine} {state}: want one OGA sheet, found {len(hits)}')
    return hits[0]


def state_cells(machine, state):
    """The state's OGA cells (full cell size), after checking the grid against FRAMES."""
    from PIL import Image
    _dir, (cw, ch), *_ = PLAN[machine]
    frames = FRAMES[machine][state]
    im = Image.open(oga_path(machine, state)).convert('RGBA')
    if im.size[0] % cw or im.size[1] % ch:
        raise SystemExit(f'{machine} {state}: {im.size} is not a grid of {cw}x{ch}')
    cols = im.size[0] // cw
    n = cols * (im.size[1] // ch)
    cell = lambda k: im.crop(((k % cols) * cw, (k // cols) * ch, (k % cols + 1) * cw, (k // cols + 1) * ch))
    out = []
    for k in range(n):
        c = cell(k)
        has = bool(c.getchannel('A').getbbox())
        if k < frames and not has:
            raise SystemExit(f'{machine} {state}: frame {k} is empty; wrong grid?')
        if k >= frames and has:
            raise SystemExit(f'{machine} {state}: cell {k} past the {frames} frames is not empty')
        if k < frames:
            out.append(c)
    return out


def measure(machine):
    """(union bbox over STATES, assembled bbox) in cell pixels, from the OGA art."""
    union = None
    assembled = None
    for state in STATES:
        for c in state_cells(machine, state):
            bb = c.getchannel('A').getbbox()
            union = bb if union is None else (min(union[0], bb[0]), min(union[1], bb[1]), max(union[2], bb[2]), max(union[3], bb[3]))
            if state == 'assembled':
                assembled = bb
    return union, assembled


def anchor(machine):
    """(ax, ay) in the cropped cell: the registration x, and the bottom of the idle art."""
    _dir, _cell, (x0, y0, _x1, _y1), ax, *_ = PLAN[machine]
    return ax - x0, BOTTOM[machine] - y0


# Bottom of the assembled art in the cell (checked against the OGA art by --check).
BOTTOM = {'blockmaker': 262, 'fuelmaker': 330, 'metalmaker': 361, 'woodworker': 352}
# GSJS getAssetInfo position.x: the art's left edge from the registration point (PLAN cites the lines).
# PLAN's anchor x is the assembled art's left edge minus this.
POS_X = {'blockmaker': -72, 'fuelmaker': -60, 'metalmaker': -62, 'woodworker': -67}


def pack(machine):
    from PIL import Image
    _dir, _cell, crop, *_ = PLAN[machine]
    fw, fh, cols, rows, _total = geometry(machine)
    out = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    k = 0
    for state in STATES:
        for c in state_cells(machine, state):
            out.paste(c.crop(crop), ((k % cols) * fw, (k // cols) * fh))
            k += 1
    return clear_transparent(out)


def clear_transparent(img):
    from PIL import Image
    blank = Image.new('RGBA', img.size, (0, 0, 0, 0))
    return Image.composite(img, blank, img.getchannel('A').point(lambda a: 255 if a else 0))


def table():
    rows = {}
    for machine in sorted(PLAN):
        folder, cell, crop, _ax, swf, gsjs = PLAN[machine]
        fw, fh, cols, _rows, total = geometry(machine)
        states, at = {}, 0
        for s in STATES:
            states[s] = (at, FRAMES[machine][s])
            at += FRAMES[machine][s]
        ax, ay = anchor(machine)
        rows[machine] = {
            'url': f'assets/sprites/machines/{out_name(machine)}', 'fw': fw, 'fh': fh, 'cols': cols, 'frames': total,
            'fps': FPS, 'ax': ax, 'ay': ay, 'scale': scale_for(fw, fh), 'states': states,
            'source': f'OGA {folder}/{machine}__x1_<state> ({cell[0]}x{cell[1]} cells, crop {crop}); '
                      f'glitch-items {os.path.basename(swf)} animatee labels; anchor x from GSJS {gsjs}',
        }
    return rows


def write_js(rows):
    lines = [
        '// Generated by tools/build-machine-art.py (register row G193). Do not edit by hand:',
        '// change the plan there and rerun it (python3.11 -I tools/build-machine-art.py).',
        '//',
        "// Each machine's SWF states from Tiny Speck's OGA sheets, cropped to one cell size and packed in a grid:",
        '// frame k sits at column k % cols, row floor(k / cols). states: name -> [first frame, frame count].',
        '// ax, ay: the anchor in the cell (registration x, bottom of the idle art). scale: the Make panel fit.',
        '// public/js/machine-art.js picks the state and the frame (30 fps, loopers loop, the rest play once).',
        '',
        f"export const MACHINE_ART_LOOPERS = Object.freeze([{', '.join(repr(s) for s in LOOPERS)}]);",
        '',
        'export const MACHINE_ART_SHEETS = Object.freeze({',
    ]
    for machine, r in rows.items():
        lines.append(f"  // {r['source']}")
        states = ', '.join(f'{s}: Object.freeze([{a}, {n}])' for s, (a, n) in r['states'].items())
        lines.append(f"  {machine}: Object.freeze({{ url: '{r['url']}', fw: {r['fw']}, fh: {r['fh']}, cols: {r['cols']}, "
                     f"frames: {r['frames']}, fps: {r['fps']}, ax: {r['ax']}, ay: {r['ay']}, scale: {r['scale']},")
        lines.append(f'    states: Object.freeze({{ {states} }}) }}),')
    lines += ['});', '']
    return '\n'.join(lines)


def cmd_build():
    if not AUDIT:
        raise SystemExit('the OGA dump is missing (set GLITCH_AUDIT)')
    os.makedirs(OUT, exist_ok=True)
    for machine in sorted(PLAN):
        union, assembled = measure(machine)
        if tuple(union) != PLAN[machine][2] or assembled[3] != BOTTOM[machine]:
            raise SystemExit(f'{machine}: crop {union} / bottom {assembled[3]} differ from PLAN; update PLAN')
    total = 0
    for machine in sorted(PLAN):
        img = pack(machine)
        path = os.path.join(OUT, out_name(machine))
        img.save(path, 'WEBP', lossless=True, quality=100, method=6)
        total += os.path.getsize(path)
        print(f'{machine:11} {img.size[0]}x{img.size[1]}  {os.path.getsize(path):>7} bytes')
    with open(OUT_JS, 'w') as f:
        f.write(write_js(table()))
    print('total bytes', total)


def webp_size(path):
    b = open(path, 'rb').read(30)
    if b[:4] != b'RIFF' or b[8:12] != b'WEBP':
        return None
    if b[12:16] == b'VP8L':
        bits = struct.unpack('<I', b[21:25])[0]
        return ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
    if b[12:16] == b'VP8X':
        return (int.from_bytes(b[24:27], 'little') + 1, int.from_bytes(b[27:30], 'little') + 1)
    return None


def cmd_check():
    bad = 0
    if not os.path.exists(OUT_JS) or open(OUT_JS).read() != write_js(table()):
        print('public/js/machine-art-sheets.js is stale'); bad += 1
    items = os.path.join(AUDIT, 'glitch-items') if AUDIT else None
    pixels = bool(AUDIT)
    if pixels:
        from PIL import Image, ImageChops
    for machine in sorted(PLAN):
        fw, fh, cols, rows, _ = geometry(machine)
        path = os.path.join(OUT, out_name(machine))
        if not os.path.exists(path):
            print(f'{machine}: {out_name(machine)} missing'); bad += 1; continue
        if webp_size(path) != (cols * fw, rows * fh):
            print(f'{machine}: {out_name(machine)} is {webp_size(path)}, want {(cols * fw, rows * fh)}'); bad += 1; continue
        swf = PLAN[machine][4]
        if items and os.path.exists(os.path.join(items, swf)):
            labels = animatee_labels(os.path.join(items, swf))
            for s in STATES:
                if labels.get(s) != FRAMES[machine][s]:
                    print(f'{machine}: {swf} animatee {s} has {labels.get(s)} frames, plan says {FRAMES[machine][s]}'); bad += 1
        if pixels:
            union, assembled = measure(machine)
            if tuple(union) != PLAN[machine][2]:
                print(f'{machine}: art bbox {union}, PLAN crop {PLAN[machine][2]}'); bad += 1
            if assembled[3] != BOTTOM[machine] or assembled[0] - PLAN[machine][3] != POS_X[machine]:
                print(f'{machine}: assembled bbox {assembled} vs anchor x {PLAN[machine][3]} / bottom {BOTTOM[machine]}'); bad += 1
            want = pack(machine)
            have = clear_transparent(Image.open(path).convert('RGBA'))
            if ImageChops.difference(want, have).getbbox():
                print(f'{machine}: {out_name(machine)} differs from a fresh pack'); bad += 1
    print(('ok' if not bad else f'{bad} problems') + ('' if pixels else ' (OGA dump missing: pixels not compared)'))
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    if args.check:
        sys.exit(cmd_check())
    cmd_build()


if __name__ == '__main__':
    main()
