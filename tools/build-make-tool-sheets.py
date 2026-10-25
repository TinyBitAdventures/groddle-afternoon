#!/usr/bin/env python3.11
"""Make panel tool animations (register rows G188, G191): every making tool's own `tool_animation`, sharp.

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

Sharp sheets (G191, the b81d991f method): `--render` exports every frame of the SWF's tool_animation
scene with FFDec at zoom 3 (Java 21, root timeline, a copy of the SWF with a stage three times the size so
art outside the authored stage is kept: tools/icon-hires/swfinfo.py rewrite), then lets
tools/vector-sprites/build.mjs (--dry) find the one placement that makes each render's 3:1 box downscale
match the OGA cell and score every frame. Tools that pass are written at a density of 3 texels per CSS
pixel when the panel draws them above 1x (scale > 1, so 3.2 device pixels per art pixel at DPR 2) and 2
otherwise (a 3x render shrunk with Lanczos), as `<tool>-work@<d>x.webp`, in a grid whose columns divide
the frame count (every row full, so style.css plays it with one steps() per axis) and whose sides stay
under WebP's 16383 px. The placements and scores are kept in tools/make-tool-hires.json, so the table
and --check need neither FFDec nor the renders. A tool that fails keeps its 1x row
(`<tool>-work.webp`, frame k at x = k * fw, repacked from the OGA grid as in 9d736239).

Writes public/assets/sprites/making/<tool>-work[@<d>x].webp (lossless; fully transparent pixels are
cleared to 0,0,0,0) and public/js/make-tool-sheets.js (tool -> sheet, frame size, columns, frame count,
fps, display scale, density).

Usage (python3.11 has Pillow and numpy):
  python3.11 -I tools/build-make-tool-sheets.py --render   render, place, write the sharp sheets and the table
  python3.11 -I tools/build-make-tool-sheets.py            rewrite the 1x rows and the table from the plan
  python3.11 -I tools/build-make-tool-sheets.py --check    exit 1 if a sheet or the table is stale
--render needs glitch-items, Java 21 + FFDec and node (work files in research/make-tool-hires).
--check always checks the table and each sheet's size; with the OGA dump present (GLITCH_AUDIT, default
~/Documents/glitch-audit) it compares each 1x row's pixels with a fresh repack and scores each sharp
sheet's box downscale against the OGA cells (the build.mjs score: mean 0.88, every frame 0.8), and with
glitch-items it checks the frame counts against the SWFs. The SWFs are data: their tags are read and
FFDec renders them; nothing runs their scripts.
"""
import argparse, glob, json, os, struct, subprocess, sys, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(HERE)
PUBLIC = os.path.join(SPIKE, 'public')
OUT = os.path.join(PUBLIC, 'assets', 'sprites', 'making')
OUT_JS = os.path.join(PUBLIC, 'js', 'make-tool-sheets.js')
HIRES_JSON = os.path.join(HERE, 'make-tool-hires.json')


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
    'fruit_changing_machine': ('extracted_g188/glitch-assets/fruit_changing_machine/fruit_changing_machine__x1_tool_animation_png_1354830329.png', 18, 44, 66, 90, 'tools/tool_base/fruit_changing_machine/fruit_changing_machine.swf', 'items/fruit_changing_machine.js:654'),
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

MAX_SIDE = 16383  # WebP's largest side
SHEET_MIN, FRAME_MIN = 0.88, 0.8  # tools/vector-sprites/build.mjs SHEET_MIN, FRAME_MIN


def out_name(tool, density=1):
    return f'{tool}-work.webp' if density == 1 else f'{tool}-work@{density}x.webp'


def density_for(scale):
    """3 texels per CSS pixel when the panel draws the art above 1x, else 2 (DPR 2 needs 2 x scale)."""
    return 3 if scale > 1 else 2


def grid_cols(frames, fw, fh, density):
    """Columns for a full-row grid (cols divides frames) within MAX_SIDE, squarest first; None if none fits."""
    best = None
    for c in range(1, frames + 1):
        if frames % c:
            continue
        W, H = c * fw * density, frames // c * fh * density
        if W > MAX_SIDE or H > MAX_SIDE:
            continue
        if best is None or max(W, H) < best[0]:
            best = (max(W, H), c)
    return best and best[1]


def load_hires():
    return json.load(open(HIRES_JSON)) if os.path.exists(HIRES_JSON) else {}


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
    hires = load_hires()
    for tool, (src, cols, fw, fh, frames, swf, gsjs) in sorted(PLAN.items()):
        scale = scale_for(fw, fh)
        source = f'OGA {os.path.basename(src)} ({cols} cols); glitch-items {os.path.basename(swf)} tool_animation; GSJS {gsjs}'
        h = hires.get(tool)
        if h:
            a, b = h['swfFrames']
            rows[tool] = {'url': f'assets/sprites/making/{out_name(tool, h["density"])}', 'fw': fw, 'fh': fh,
                          'cols': h['cols'], 'frames': frames, 'fps': FPS, 'scale': scale, 'density': h['density'],
                          'source': f'{source}; SWF frames {a}-{b} at {h["density"]}x (score {h["score"]})'}
        else:
            rows[tool] = {'url': f'assets/sprites/making/{out_name(tool)}', 'fw': fw, 'fh': fh, 'cols': frames,
                          'frames': frames, 'fps': FPS, 'scale': scale, 'source': source}
    return dict(sorted(rows.items()))


def write_js(rows):
    lines = [
        '// Generated by tools/build-make-tool-sheets.py (register rows G188, G191). Do not edit by hand:',
        '// change the plan there and rerun it (python3.11 -I tools/build-make-tool-sheets.py [--render]).',
        '//',
        "// Each making tool's own tool_animation for the Make panel, in a grid of full rows: frame k sits at",
        '// column k % cols, row floor(k / cols), cells fw x fh in CSS pixels. The client loops it',
        '// (glitch-client SSCollection.as:123) at 30 fps (TSEngineConstants.as:6). scale fits the cell in the',
        "// panel's tool box; density is texels per CSS pixel (1 unless noted: the sharp FFDec renders, G191).",
        '',
        'export const MAKE_TOOL_SHEETS = Object.freeze({',
    ]
    for tool, r in rows.items():
        lines.append(f"  // {r['source']}")
        fields = [f"url: '{r['url']}'", f"fw: {r['fw']}", f"fh: {r['fh']}", f"cols: {r['cols']}",
                  f"frames: {r['frames']}", f"fps: {r['fps']}", f"scale: {r['scale']}"]
        if r.get('density', 1) != 1:
            fields.append(f"density: {r['density']}")
        lines.append(f'  {tool}: Object.freeze({{ {", ".join(fields)} }}),')
    lines += ['});', '']
    return '\n'.join(lines)


def stale_files(keep):
    """Make-tool sheets in OUT that the table no longer names (old 1x rows, old densities)."""
    tools = set(PLAN)
    out = []
    for f in sorted(os.listdir(OUT)):
        stem = f.split('-work', 1)[0]
        if stem in tools and '-work' in f and f not in keep:
            out.append(f)
    return out


def write_table_and_rows():
    """The 1x rows of tools without a sharp sheet, the table, and stale files removed."""
    rows = table()
    total = 0
    for tool, r in rows.items():
        if r.get('density', 1) != 1:
            total += os.path.getsize(os.path.join(PUBLIC, r['url']))
            continue
        img = repack(tool)
        path = os.path.join(OUT, out_name(tool))
        img.save(path, 'WEBP', lossless=True, quality=100, method=6)
        total += os.path.getsize(path)
        print(f'{tool:22} 1x row {img.size[0]}x{img.size[1]}  {os.path.getsize(path):>7} bytes')
    keep = {os.path.basename(r['url']) for r in rows.values()}
    for f in stale_files(keep):
        os.remove(os.path.join(OUT, f))
        print('removed', f)
    with open(OUT_JS, 'w') as f:
        f.write(write_js(rows))
    print('total bytes', total)


def cmd_build():
    if not AUDIT:
        raise SystemExit('the OGA dump is missing (set GLITCH_AUDIT)')
    write_table_and_rows()


# ---- sharp renders (G191) -----------------------------------------------------------------------------

def cmd_render(work, only):
    """FFDec zoom-3 renders of each tool_animation scene, placed by tools/vector-sprites/build.mjs --dry."""
    if not AUDIT:
        raise SystemExit('the OGA dump is missing (set GLITCH_AUDIT)')
    from PIL import Image
    sys.path.insert(0, os.path.join(HERE, 'icon-hires'))
    import swfinfo  # noqa: E402
    items = os.path.join(AUDIT, 'glitch-items')
    for d in ('ref', 'swf'):
        os.makedirs(os.path.join(work, d), exist_ok=True)
    tools = [t for t in sorted(PLAN) if not only or t in only]
    jobs, starts = [], {}
    for tool in tools:
        src, cols, fw, fh, frames, swf, _ = PLAN[tool]
        info = swfinfo.read(os.path.join(items, swf))
        start = info['scenes']['tool_animation']  # 1-based root frame (DefineSceneAndFrameLabelData)
        starts[tool] = start
        ref = os.path.join(work, 'ref', f'{tool}.png')
        repack(tool).save(ref)
        padded = os.path.join(work, 'swf', f'{tool}.swf')
        swfinfo.rewrite(os.path.join(items, swf), padded, pad=1.0)
        jobs.append({'name': f'make-{tool}', 'swf': padded, 'sprite': 0, 'sheets': [{
            'path': os.path.relpath(ref, PUBLIC), 'fw': fw, 'fh': fh, 'cols': frames, 'frames': frames,
            'swfStart': start, 'swfCount': frames, 'mirror': False, 'shift': 0}]})
    manifest = os.path.join(work, 'make-tools.json')
    json.dump({'about': 'Generated by tools/build-make-tool-sheets.py --render (G191).', 'jobs': jobs}, open(manifest, 'w'), indent=1)
    subprocess.run(['node', os.path.join(HERE, 'vector-sprites', 'build.mjs'), '--manifest', manifest, '--work', work, '--dry'], check=True)
    results = json.load(open(os.path.join(work, 'dry-results.json')))
    hires = load_hires()
    for tool in tools:
        src, cols, fw, fh, frames, swf, _ = PLAN[tool]
        r = results.get(os.path.relpath(os.path.join(work, 'ref', f'{tool}.png'), PUBLIC), {})
        if r.get('status') != 'dry':
            print(f'{tool}: kept at 1x ({r.get("reason", "not built")})')
            hires.pop(tool, None)
            continue
        density = density_for(scale_for(fw, fh))
        gc = grid_cols(frames, fw, fh, density)
        if not gc:
            print(f'{tool}: no full-row grid fits {MAX_SIDE} px at {density}x; kept at 1x')
            hires.pop(tool, None)
            continue
        dx, dy = r['offset3x']
        a, b = r['swfFrames']
        frame_dir = os.path.join(work, f'{tool}_0', 'root')
        sheet = Image.new('RGBA', (gc * fw * density, frames // gc * fh * density), (0, 0, 0, 0))
        for k in range(frames):
            img = Image.open(os.path.join(frame_dir, f'{a + k}.png')).convert('RGBA')
            cell = Image.new('RGBA', (fw * 3, fh * 3), (0, 0, 0, 0))
            cell.paste(img, (dx, dy))  # render pixel (X, Y) at cell 3x pixel (X + dx, Y + dy), clipped
            if density != 3:
                cell = cell.convert('RGBa').resize((fw * density, fh * density), Image.LANCZOS).convert('RGBA')
            sheet.paste(cell, ((k % gc) * fw * density, (k // gc) * fh * density))
        path = os.path.join(OUT, out_name(tool, density))
        clear_transparent(sheet).save(path, 'WEBP', lossless=True, quality=100, method=6)
        mean, low = hires_score(tool, path, density, gc)
        hires[tool] = {'density': density, 'cols': gc, 'swfFrames': [a, b], 'offset3x': [dx, dy],
                       'score': round(mean, 4), 'minFrame': round(low, 4), 'placementScore': r['score']}
        print(f'{tool:22} {density}x {sheet.size[0]}x{sheet.size[1]} ({gc} cols) score {mean:.3f} min {low:.3f}  {os.path.getsize(path):>8} bytes')
    with open(HIRES_JSON, 'w') as f:
        rows = [f'  {json.dumps(t)}: {json.dumps(h, separators=(", ", ": "))}' for t, h in sorted(hires.items())]
        f.write('{\n' + ',\n'.join(rows) + '\n}\n')
    write_table_and_rows()


def _premul(a):
    """float32 premultiplied RGBA (0..255) from a uint8 RGBA array."""
    a = a.astype('float32')
    a[..., :3] *= a[..., 3:4] / 255
    return a


def frame_score(o, d):
    """tools/vector-sprites/build.mjs compare + scoreOf for two aligned premultiplied cells."""
    import numpy as np
    both = (o[..., 3] > 0) | (d[..., 3] > 0)
    m = np.maximum(o[..., 3], d[..., 3])[both].sum()
    if m == 0:
        return 1.0
    ea = np.abs(o[..., 3] - d[..., 3])[both].sum()
    ec = np.abs(o[..., :3] - d[..., :3])[both].sum()
    return float(1 - (ea / m + ec / (3 * m)) / 2)


def hires_score(tool, path, density, gc):
    """(mean, min) frame score of a sharp sheet's box downscale against the OGA cells."""
    import numpy as np
    from PIL import Image
    _src, _cols, fw, fh, frames, *_ = PLAN[tool]
    ref = np.asarray(repack(tool))
    hi = np.asarray(Image.open(path).convert('RGBA'))
    scores = []
    for k in range(frames):
        x, y = (k % gc) * fw * density, (k // gc) * fh * density
        cell = _premul(hi[y:y + fh * density, x:x + fw * density])
        down = cell.reshape(fh, density, fw, density, 4).mean(axis=(1, 3))
        scores.append(frame_score(_premul(ref[:, k * fw:(k + 1) * fw]), down))
    return sum(scores) / len(scores), min(scores)


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
        r = rows[tool]
        d, gc = r.get('density', 1), r['cols']
        name = os.path.basename(r['url'])
        path = os.path.join(PUBLIC, r['url'])
        if not os.path.exists(path):
            print(f'{tool}: {name} missing'); bad += 1; continue
        want = (gc * fw * d, frames // gc * fh * d)
        if frames % gc or webp_size(path) != want:
            print(f'{tool}: {name} is {webp_size(path)}, want {want} ({gc} cols)'); bad += 1; continue
        if items and os.path.exists(os.path.join(items, swf)):
            got = swf_scenes(os.path.join(items, swf)).get('tool_animation')
            if got != frames:
                print(f'{tool}: {swf} tool_animation has {got} frames, plan says {frames}'); bad += 1
        if not pixels:
            continue
        if d == 1:
            have = clear_transparent(Image.open(path).convert('RGBA'))
            if ImageChops.difference(repack(tool), have).getbbox():
                print(f'{tool}: {name} differs from a fresh repack'); bad += 1
        else:
            mean, low = hires_score(tool, path, d, gc)
            if mean < SHEET_MIN or low < FRAME_MIN:
                print(f'{tool}: {name} scores {mean:.3f} (min frame {low:.3f}) against the OGA cells'); bad += 1
    keep = {os.path.basename(r['url']) for r in rows.values()}
    for f in stale_files(keep):
        print(f'{f} is not in the table'); bad += 1
    print(('ok' if not bad else f'{bad} problems') + ('' if pixels else ' (OGA dump missing: pixels not compared)'))
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--render', action='store_true', help='FFDec renders + placement, then build')
    ap.add_argument('--work', default=os.path.join(AUDIT or SPIKE, 'research', 'make-tool-hires'))
    ap.add_argument('tools', nargs='*', help='--render only these tools')
    args = ap.parse_args()
    if args.check:
        sys.exit(cmd_check())
    if args.render:
        cmd_render(args.work, set(args.tools))
        return
    cmd_build()


if __name__ == '__main__':
    main()
