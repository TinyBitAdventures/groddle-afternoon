#!/usr/bin/env python3.11
"""Make panel tool animations (register row G188): every making tool's own `tool_animation`, in one row.

The Glitch client plays a tool's `tool_animation` scene while a recipe is being made
(glitch-client com/tinyspeck/engine/view/ui/making/MakingToolAnimator.as:16 TOOL_FRAME, :92 ItemIconView),
looping it (spritesheet/SSCollection.as:123, "tool_animation" is always GOTOANDLOOP) at the engine's
30 fps (model/TSEngineConstants.as:6 TARGET_FRAMERATE; the item SWFs play at the host stage rate, so the
24 fps headers of grand_ol_grinder.swf, crystallizer.swf and tinkertool.swf do not apply).

Sources (CC0): Tiny Speck's OpenGameArt dump, `<class>__x1_tool_animation_png_*.png`, one sheet per item
class, frames in a grid read left to right. The frame count of each grid is the length of the
`tool_animation` scene in the item's own SWF in tinyspeck/glitch-items (DefineSceneAndFrameLabelData),
which is also how each sheet is checked to be that tool's art: the GSJS item file names the same SWF
(`asset_swf_v`, cited per row below). The cells past the last frame must be empty.

Each grid is repacked into one row (frame k at x = k * fw), the way the Grand Ol' Grinder was in 9d736239,
so CSS can play it with one `steps(frames)` animation. Writes public/assets/sprites/making/<tool>-work.webp
(lossless; fully transparent pixels are cleared to 0,0,0,0, about 40% smaller than PNG)
and public/js/make-tool-sheets.js (tool -> sheet, frame size, frame count, fps, display scale).

The Fruit Changing Machine keeps its sharper 3x render from b81d991f (17 of the 90 frames, FFDec from the
SWF, not built here); it is in the table so it plays through the same path, with its timing kept.

Usage (python3.11 has Pillow):
  python3.11 -I tools/build-make-tool-sheets.py            build the sheets and the table
  python3.11 -I tools/build-make-tool-sheets.py --check    exit 1 if a sheet or the table is stale
--check always checks the table and each sheet's size; it also rebuilds each sheet in memory and compares
pixels when the OGA dump is present (GLITCH_AUDIT, default ~/Documents/glitch-audit), and the frame
counts against the SWFs when glitch-items is. The SWFs are data: their tags are read, nothing runs them.
"""
import argparse, glob, json, os, struct, sys, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(HERE)
PUBLIC = os.path.join(SPIKE, 'public')
OUT = os.path.join(PUBLIC, 'assets', 'sprites', 'making')
OUT_JS = os.path.join(PUBLIC, 'js', 'make-tool-sheets.js')


def audit_dir():
    for d in (os.environ.get('GLITCH_AUDIT'), os.path.dirname(SPIKE), os.path.expanduser('~/Documents/glitch-audit')):
        if d and os.path.isdir(os.path.join(d, 'opengameart')):
            return d
    return None


AUDIT = audit_dir()
FPS = 30  # TSEngineConstants.as:6
# The Make panel's tool box (style.css .mp-tool-wrap, 112 x 104): fit each cell in about 110 x 93,
# never upscaling the 1x art past 1.6. The Grand Ol' Grinder's 50 x 79 comes out at 1.18, as in 9d736239.
BOX_W, BOX_H, MAX_SCALE = 110, 93, 1.6

# tool: (OGA sheet under opengameart/, grid columns, cell w, cell h, frames, glitch-items SWF, GSJS asset_swf_v)
PLAN = {
    'alchemical_tongs': ('extracted_mining/glitch-assets/alchemical_tongs/alchemical_tongs__x1_tool_animation_png_1354832647.png', 12, 70, 102, 48, 'tools/tool_base/alchemical_tongs/alchemical_tongs.swf', 'items/alchemical_tongs.js:653'),
    'awesome_pot': ('extracted_recipes/glitch-assets/awesome_pot/awesome_pot__x1_tool_animation_png_1354830341.png', 13, 68, 96, 90, 'tools/tool_base/awesome_pot/awesome_pot.swf', 'items/awesome_pot.js:663'),
    'beaker': ('extracted_recipes/glitch-assets/beaker/beaker__x1_tool_animation_png_1354832125.png', 30, 31, 63, 90, 'tools/tool_base/beaker/beaker.swf', 'items/beaker.js:664'),
    'bean_seasoner': ('extracted_recipes/glitch-assets/bean_seasoner/bean_seasoner__x1_tool_animation_png_1354830309.png', 45, 22, 52, 90, 'tools/tool_base/bean_seasoner/bean_seasoner.swf', 'items/bean_seasoner.js:662'),
    'blender': ('extracted_recipes/glitch-assets/blender/blender__x1_tool_animation_png_1354829408.png', 16, 58, 104, 61, 'tools/tool_base/blender/blender.swf', 'items/blender.js:662'),
    'bubble_tuner': ('extracted_recipes/glitch-assets/bubble_tuner/bubble_tuner__x1_tool_animation_png_1354830317.png', 15, 57, 48, 90, 'tools/tool_base/bubble_tuner/bubble_tuner.swf', 'items/bubble_tuner.js:654'),
    'cauldron': ('extracted_recipes/glitch-assets/cauldron/cauldron__x1_tool_animation_png_1354836768.png', 10, 98, 130, 75, 'tools/tool_base/cauldron/cauldron.swf', 'items/cauldron.js:664'),
    'cocktail_shaker': ('extracted_recipes/glitch-assets/cocktail_shaker/cocktail_shaker__x1_tool_animation_png_1354830094.png', 8, 118, 119, 90, 'tools/tool_base/cocktail_shaker/cocktail_shaker.swf', 'items/cocktail_shaker.js:663'),
    'construction_tool': ('extracted_homes/glitch-assets/construction_tool/construction_tool__x1_tool_animation_png_1354833722.png', 16, 61, 59, 79, 'tools/tool_base/construction_tool/construction_tool.swf', 'items/construction_tool.js:718'),
    'crystallizer': ('extracted_recipes/glitch-assets/crystallizer/crystallizer__x1_tool_animation_png_1354833105.png', 8, 122, 175, 98, 'tools/tool_base/crystallizer/crystallizer.swf', 'items/crystallizer.js:759'),
    'egg_seasoner': ('extracted_recipes/glitch-assets/egg_seasoner/egg_seasoner__x1_tool_animation_png_1354830313.png', 30, 23, 52, 90, 'tools/tool_base/egg_seasoner/egg_seasoner.swf', 'items/egg_seasoner.js:641'),
    'frying_pan': ('extracted_recipes/glitch-assets/frying_pan/frying_pan__x1_tool_animation_png_1354830080.png', 6, 160, 96, 90, 'tools/tool_base/frying_pan/frying_pan.swf', 'items/frying_pan.js:662'),
    'gassifier': ('extracted_recipes/glitch-assets/gassifier/gassifier__x1_tool_animation_png_1354830621.png', 23, 43, 40, 90, 'tools/tool_base/gassifier/gassifier.swf', 'items/gassifier.js:654'),
    'grand_ol_grinder': ('extracted_g174/glitch-assets/grand_ol_grinder/grand_ol_grinder__x1_tool_animation_png_1354836354.png', 17, 50, 79, 83, 'tools/ore_grinder/grand_ol_grinder/grand_ol_grinder.swf', 'items/grand_ol_grinder.js:996'),
    'knife_and_board': ('extracted_recipes/glitch-assets/knife_and_board/knife_and_board__x1_tool_animation_png_1354830074.png', 12, 79, 64, 36, 'tools/tool_base/knife_and_board/knife_and_board.swf', 'items/knife_and_board.js:666'),
    'loomer': ('extracted_homes/glitch-assets/loomer/loomer__x1_tool_animation_png_1354839642.png', 12, 67, 45, 60, 'tools/tool_base/loomer/loomer.swf', 'items/loomer.js:652'),
    'mike_tyson_grill': ('extracted_recipes/glitch-assets/mike_tyson_grill/mike_tyson_grill__x1_tool_animation_png_1354830323.png', 8, 115, 73, 75, 'tools/tool_base/mike_tyson_grill/mike_tyson_grill.swf', 'items/mike_tyson_grill.js:662'),
    'ore_grinder': ('extracted_mining/glitch-assets/ore_grinder/ore_grinder__x1_tool_animation_png_1354831497.png', 17, 50, 87, 83, 'tools/tool_base/ore_grinder/ore_grinder.swf', 'items/ore_grinder.js:995'),
    'saucepan': ('extracted_recipes/glitch-assets/saucepan/saucepan__x1_tool_animation_png_1354830344.png', 15, 65, 59, 90, 'tools/tool_base/saucepan/saucepan.swf', 'items/saucepan.js:663'),
    'smelter': ('extracted_mining/glitch-assets/smelter/smelter__x1_tool_animation_png_1354832633.png', 13, 74, 70, 100, 'tools/tool_base/smelter/smelter.swf', 'items/smelter.js:933'),
    'spice_mill': ('extracted_recipes/glitch-assets/spice_mill/spice_mill__x1_tool_animation_png_1354830432.png', 23, 43, 112, 90, 'tools/tool_base/spice_mill/spice_mill.swf', 'items/spice_mill.js:655'),
    'spindle': ('extracted_supply/glitch-assets/spindle/spindle__x1_tool_animation_png_1354839668.png', 15, 57, 50, 45, 'tools/tool_base/spindle/spindle.swf', 'items/spindle.js:797'),
    'splendid_spindle': ('extracted_supply/glitch-assets/splendid_spindle/splendid_spindle__x1_tool_animation_png_1354839809.png', 15, 56, 50, 45, 'tools/spindle/splendid_spindle/splendid_spindle.swf', 'items/splendid_spindle.js:798'),
    'test_tube': ('extracted_recipes/glitch-assets/test_tube/test_tube__x1_tool_animation_png_1354832128.png', 45, 21, 63, 90, 'tools/tool_base/test_tube/test_tube.swf', 'items/test_tube.js:651'),
    'tincturing_kit': ('extracted_recipes/glitch-assets/tincturing_kit/tincturing_kit__x1_tool_animation_png_1354836763.png', 19, 50, 80, 150, 'tools/tool_base/tincturing_kit/tincturing_kit.swf', 'items/tincturing_kit.js:653'),
    'tinkertool': ('extracted_g188/glitch-assets/tinkertool/tinkertool__x1_tool_animation_png_1354832368.png', 13, 51, 46, 26, 'tools/tool_base/tinkertool/tinkertool.swf', 'items/tinkertool.js:849'),
}

# Not built here: b81d991f's 3x render (17 frames of 44 x 66 at 1x, 1.35 s, scale 1.42; see the docstring).
FRUIT_MACHINE = {'url': 'assets/sprites/making/fruit_changing_machine-work@3x.webp', 'fw': 44, 'fh': 66, 'frames': 17,
                 'durationMs': 1350, 'scale': 1.42, 'density': 3,
                 'source': 'glitch-items fruit_changing_machine.swf tool_animation, frames 1-17 at 3x (b81d991f)'}


def out_name(tool):
    return f'{tool}-work.webp'


def scale_for(fw, fh):
    return round(min(MAX_SCALE, BOX_W / fw, BOX_H / fh), 2)


# ---- SWF scenes (DefineSceneAndFrameLabelData, tag 86) ------------------------------------------------

def _u30(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7f) << s; s += 7
        if not c & 0x80:
            return r, i


def swf_scenes(path):
    """{scene name: frame count} for the root timeline of an FWS/CWS SWF."""
    d = open(path, 'rb').read()
    if d[:3] == b'CWS':
        body = zlib.decompress(d[8:])
    elif d[:3] == b'FWS':
        body = d[8:]
    else:
        raise ValueError(f'{path}: unsupported SWF signature {d[:3]!r}')
    nbits = body[0] >> 3
    i = (5 + 4 * nbits + 7) // 8
    total = struct.unpack('<H', body[i + 2:i + 4])[0]
    i += 4
    scenes = []
    while i < len(body):
        cl = struct.unpack('<H', body[i:i + 2])[0]; i += 2
        code, ln = cl >> 6, cl & 0x3f
        if ln == 0x3f:
            ln = struct.unpack('<I', body[i:i + 4])[0]; i += 4
        data = body[i:i + ln]; i += ln
        if code == 86:
            n, j = _u30(data, 0)
            for _ in range(n):
                off, j = _u30(data, j)
                e = data.index(b'\0', j)
                scenes.append((data[j:e].decode('latin1'), off)); j = e + 1
            break
        if code == 0:
            break
    return {name: (scenes[k + 1][1] if k + 1 < len(scenes) else total) - off for k, (name, off) in enumerate(scenes)}


# ---- sheets ------------------------------------------------------------------------------------------

def repack(tool):
    """The OGA grid as one row of `frames` cells, after checking the grid against the plan."""
    from PIL import Image
    src, cols, fw, fh, frames, _swf, _gsjs = PLAN[tool]
    path = os.path.join(AUDIT, 'opengameart', src)
    im = Image.open(path).convert('RGBA')
    rows = -(-frames // cols)
    if im.size != (cols * fw, rows * fh):
        raise SystemExit(f'{tool}: {src} is {im.size}, plan says {cols}x{rows} cells of {fw}x{fh}')
    cell = lambda k: im.crop(((k % cols) * fw, (k // cols) * fh, (k % cols + 1) * fw, (k // cols + 1) * fh))
    for k in range(frames, cols * rows):
        if cell(k).getchannel('A').getbbox():
            raise SystemExit(f'{tool}: cell {k} past the {frames} frames is not empty; wrong grid?')
    out = Image.new('RGBA', (frames * fw, fh), (0, 0, 0, 0))
    for k in range(frames):
        c = cell(k)
        if not c.getchannel('A').getbbox():
            raise SystemExit(f'{tool}: frame {k} is empty; wrong grid?')
        out.paste(c, (k * fw, 0))
    return clear_transparent(out)


def clear_transparent(img):
    """RGBA with every fully transparent pixel set to 0,0,0,0 (what a lossless WebP may drop anyway)."""
    from PIL import Image
    blank = Image.new('RGBA', img.size, (0, 0, 0, 0))
    return Image.composite(img, blank, img.getchannel('A').point(lambda a: 255 if a else 0))


def table():
    rows = {}
    for tool, (src, cols, fw, fh, frames, swf, gsjs) in sorted(PLAN.items()):
        rows[tool] = {'url': f'assets/sprites/making/{out_name(tool)}', 'fw': fw, 'fh': fh, 'frames': frames,
                      'fps': FPS, 'scale': scale_for(fw, fh),
                      'source': f'OGA {os.path.basename(src)} ({cols} cols); glitch-items {os.path.basename(swf)} tool_animation; GSJS {gsjs}'}
    rows['fruit_changing_machine'] = dict(FRUIT_MACHINE)
    return dict(sorted(rows.items()))


def write_js(rows):
    lines = [
        '// Generated by tools/build-make-tool-sheets.py (register row G188). Do not edit by hand:',
        '// change the plan there and rerun it (python3.11 -I tools/build-make-tool-sheets.py).',
        '//',
        "// Each making tool's own tool_animation for the Make panel, repacked into one row: frame k sits at",
        '// x = k * fw. The client loops it (glitch-client SSCollection.as:123) at 30 fps (TSEngineConstants.as:6).',
        '// scale fits the 1x cell in the panel\'s tool box; density is texels per CSS pixel (1 unless noted).',
        '',
        'export const MAKE_TOOL_SHEETS = Object.freeze({',
    ]
    for tool, r in rows.items():
        lines.append(f"  // {r['source']}")
        fields = [f"url: '{r['url']}'", f"fw: {r['fw']}", f"fh: {r['fh']}", f"frames: {r['frames']}"]
        if 'fps' in r:
            fields.append(f"fps: {r['fps']}")
        if 'durationMs' in r:
            fields.append(f"durationMs: {r['durationMs']}")
        fields.append(f"scale: {r['scale']}")
        if r.get('density', 1) != 1:
            fields.append(f"density: {r['density']}")
        lines.append(f'  {tool}: Object.freeze({{ {", ".join(fields)} }}),')
    lines += ['});', '']
    return '\n'.join(lines)


def cmd_build():
    if not AUDIT:
        raise SystemExit('the OGA dump is missing (set GLITCH_AUDIT)')
    from PIL import Image  # noqa: F401
    total = 0
    for tool in sorted(PLAN):
        img = repack(tool)
        path = os.path.join(OUT, out_name(tool))
        img.save(path, 'WEBP', lossless=True, quality=100, method=6)
        total += os.path.getsize(path)
        print(f'{tool:20} {img.size[0]}x{img.size[1]}  {os.path.getsize(path):>7} bytes')
    with open(OUT_JS, 'w') as f:
        f.write(write_js(table()))
    print('total bytes', total)


def webp_size(path):
    """(w, h) of a lossless (VP8L) or extended (VP8X) WebP, from its header."""
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
    rows = table()
    if not os.path.exists(OUT_JS) or open(OUT_JS).read() != write_js(rows):
        print('public/js/make-tool-sheets.js is stale'); bad += 1
    items = os.path.join(AUDIT, 'glitch-items') if AUDIT else None
    pixels = bool(AUDIT)
    if pixels:
        from PIL import Image, ImageChops
    for tool in sorted(PLAN):
        src, cols, fw, fh, frames, swf, _ = PLAN[tool]
        path = os.path.join(OUT, out_name(tool))
        if not os.path.exists(path):
            print(f'{tool}: {out_name(tool)} missing'); bad += 1; continue
        if webp_size(path) != (frames * fw, fh):
            print(f'{tool}: {out_name(tool)} is {webp_size(path)}, want {(frames * fw, fh)}'); bad += 1; continue
        if items and os.path.exists(os.path.join(items, swf)):
            got = swf_scenes(os.path.join(items, swf)).get('tool_animation')
            if got != frames:
                print(f'{tool}: {swf} tool_animation has {got} frames, plan says {frames}'); bad += 1
        if pixels:
            want = repack(tool)
            have = clear_transparent(Image.open(path).convert('RGBA'))
            if ImageChops.difference(want, have).getbbox():
                print(f'{tool}: {out_name(tool)} differs from a fresh repack'); bad += 1
    fcm = os.path.join(PUBLIC, FRUIT_MACHINE['url'])
    if not os.path.exists(fcm):
        print('fruit_changing_machine: 3x sheet missing'); bad += 1
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
