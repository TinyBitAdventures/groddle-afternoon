#!/usr/bin/env python3.11
"""House wallpaper, floor and ceiling art as WebP at 2x and 3x (register rows G7 / G6).

The original client drew a house interior from three SWF bundles in tinyspeck/glitch-locations
(CC0, glitch-location-swfs/):
- home_wallpaper.swf: every wallpaper / floor / ceiling piece and its 50 x 50 swatch, one embedded
  SWF per class (`home_wallpaper_<piece>` loads `home_wallpaper_<piece>_dataClass`);
- home_groddle.swf: the groddle frame style (house cross-section, end walls), wall / floor / ceiling
  shadows, attic and basement pieces, the entry door;
- home_tower.swf: tower framing, the elevator signpost and the bare tower base.
GameServerJS says which piece goes where (inc_data_homes.js configs, locations/inc_homes.js and
locations/tower.js placed sizes). The client stretched each piece's SWF stage onto its placed
w x h, so every piece is rendered once with FFDec (zoom 4) and resampled (Lanczos) onto 2x and
3x its placed size.

Outputs
- public/assets/homes/wallpaper/<piece>@2x.webp, and <piece>@3x.webp where the 3x render adds
  detail over the 2x file upscaled (most pieces are bitmaps drawn at 1x; their 3x would only be
  bigger). textures.js reads the resolution from the file name.
- public/js/home-wallpaper-art.js (generated): placed size and 3x flag per piece, and the piece
  map of every visible wallpaper / floor / ceiling config.
- tools/home-wallpaper/plan.json: inputs, metrics and output hashes per piece.

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp 1.6; node for the GSJS configs):
  python3.11 -I tools/home-wallpaper/build.py --work <scratch dir> [--force] [--only a,b]
  python3.11 -I tools/home-wallpaper/build.py --check       (no rendering; exit 1 on a problem)
Glitch-locations and GameServerJS are data only: SWFs are read by FFDec, configs are evaluated in an
empty node vm, nothing from either is executed otherwise.
"""
import argparse, csv, hashlib, json, os, re, shutil, subprocess, sys, time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(SPIKE, 'tools', 'icon-hires'))
import swfinfo  # noqa: E402

PUBLIC = os.path.join(SPIKE, 'public')
OUT = os.path.join(PUBLIC, 'assets', 'homes', 'wallpaper')
JS = os.path.join(PUBLIC, 'js', 'home-wallpaper-art.js')
PLAN = os.path.join(HERE, 'plan.json')
LOCATIONS = os.environ.get('GLITCH_LOCATIONS') or os.path.expanduser(
    '~/Documents/glitch-audit/research/audio-hunt/raw/glitch-locations/glitch-location-swfs')
JAVA = '/opt/homebrew/opt/openjdk@21/bin/java'
FFDEC = os.path.expanduser('~/Documents/glitch-audit/tools/ffdec/ffdec.jar')
BUNDLES = ('home_wallpaper', 'home_groddle', 'home_tower')

SETTINGS = {
    'version': 2,
    'zoom': 4,             # FFDec zoom of the one render both sizes come from
    'quality': 84,         # cwebp lossy quality (sharp_yuv, method 4, lossless alpha)
    'lossless_over': 4.5,  # mean premultiplied error (0-255) over visible pixels above which lossless is used
    'min_gain': 6.0,       # 3x render vs 2x upscaled: 99th percentile difference to ship the 3x file
}

# Placed sizes (w, h) by config field: locations/inc_homes.js homes_rebuild_floor.
WALL_FIELDS = {
    'wall': (150, 300), 'wall_2': (150, 300), 'wall_3': (150, 300), 'wall_4': (150, 300),
    'wall_5': (150, 300), 'wall_6': (150, 300), 'wall_left': (150, 300), 'wall_right': (150, 300),
    'wall_single': (150, 300), 'left': (150, 458), 'right': (150, 458), 'swatch': (50, 50),
    # The ground floor's open left end of a house-right home (inc_homes.js homes_rebuild_floor
    # 'left-open': the wallpaper's left_open piece, 150 x 393, where the back yard comes in).
    'left_open': (150, 393),
}
FLOOR_FIELDS = {'main': (150, 108), 'left': (150, 108), 'right': (150, 108), 'swatch': (50, 50),
                **{f'main_{i}': (150, 108) for i in range(2, 7)}}
CEILING_FIELDS = {'main': (150, 63), 'left': (150, 63), 'right': (150, 63), 'swatch': (50, 50),
                  **{f'main_{i}': (150, 63) for i in range(2, 7)}}

# The house shell around the swatches: inc_homes.js (groddle frame style, homes_interior_frames)
# and tower.js (tower_build_floor, tower_build_expansion, tower_build_elevator).
SHELL = {
    'home_groddle': {
        'wallpaper_back_shadow_tile': (150, 300),
        'wallpaper_back_shadow_left': (150, 300),
        'wallpaper_back_shadow_right': (150, 300),
        'wallpaper_end_shadow': (133, 458),
        'ceiling_shadow_left': (300, 50),
        'floor_shadow_left_open': (300, 108),
        # the left-open end (homes_rebuild_floor): divider shadow and the frame_open post
        # (homes_interior_frames.groddle frame_open_deco 17 x 245)
        'wallpaper_divider_shadow': (133, 393),
        'crosssection_divider_end_groddle1': (17, 245),
        'floor_shadow_right': (300, 108),
        'crosssection_horizontal_1500px_groddle1': (1500, 17),
        'crosssection_endwall_groddle1': (17, 492),
        'attic_end_left': (150, 208),
        'attic_tile': (150, 208),
        'attic_end_right': (150, 208),
        'crosssection_ground_end_left_groddle1': (150, 58),
        'crosssection_ground_tile_groddle1': (150, 58),
        'crosssection_ground_end_right_groddle1': (150, 58),
        'door_asset_entry_basic': (75, 236),
    },
    'home_tower': {
        'crosssection_tower_horizontal_1200px': (1200, 28),
        'crosssection_tower_base_horizontal_1177px': (1177, 28),
        'signpost_asset_elevator_tower': (180, 514),
        'towerbase_wallpaper_wall': (150, 300),
        'towerbase_wallpaper_wall_2': (150, 300),
        'towerbase_wallpaper_right': (150, 458),
        'towerbase_floor': (1177, 108),
        'towerbase_ceiling': (1177, 50),
    },
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run_ffdec(*args):
    r = subprocess.run([JAVA, '-Djava.awt.headless=true', '-Xmx4g', '-jar', FFDEC, *map(str, args)],
                       capture_output=True, text=True)
    return r.returncode


def wait_for_load(max_load):
    while os.getloadavg()[0] > max_load:
        print(f'  load {os.getloadavg()[0]:.1f} > {max_load}, waiting', flush=True)
        time.sleep(30)


# ---------- inputs ----------

def gsjs_configs():
    out = subprocess.run(['node', os.path.join(HERE, 'configs.mjs')], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def bundle_bins(work, bundle):
    """{class name (lower case, bundle prefix stripped): bytes of its embedded SWF}."""
    src = os.path.join(LOCATIONS, bundle + '.swf')
    dst = os.path.join(work, 'bundles', bundle)
    sym = os.path.join(dst, 'sym', 'symbols.csv')
    if not os.path.exists(sym):
        run_ffdec('-export', 'symbolClass', os.path.join(dst, 'sym'), src)
        run_ffdec('-export', 'binaryData', os.path.join(dst, 'bin'), src)
    ids = {}
    for row in csv.reader(open(sym), delimiter=';'):
        if len(row) == 2:
            ids[row[1]] = row[0]
    files = {}
    for name in os.listdir(os.path.join(dst, 'bin')):
        files[name.split('_')[0].split('.')[0]] = os.path.join(dst, 'bin', name)
    out = {}
    prefix = bundle + '_'
    for cls, cid in ids.items():
        if not cls.endswith('_dataClass') or cid not in files:
            continue
        key = cls[len(prefix):-len('_dataClass')].lower()
        out[key] = files[cid]
    return out


def wanted_pieces(cfg):
    """{piece: {'bundle', 'size'}} and the piece map per visible config."""
    pieces = {}
    maps = {}

    def want(bundle, piece, size, tiles=False):
        old = pieces.get(piece)
        if old and old['size'] != list(size):
            raise SystemExit(f'{piece}: placed at {old["size"]} and {list(size)}')
        pieces[piece] = {'bundle': bundle, 'size': list(size), 'tiles': tiles or bool(old and old.get('tiles'))}

    for kind, fields in (('walls', WALL_FIELDS), ('floors', FLOOR_FIELDS), ('ceilings', CEILING_FIELDS)):
        maps[kind] = {}
        for key, conf in cfg[kind].items():
            if not conf.get('is_visible'):
                continue
            row = {}
            for field, size in fields.items():
                val = conf.get(field)
                if not isinstance(val, str) or not val:
                    continue
                piece = val.split(',')[0].lower()
                # Pieces laid edge to edge: walls, floor and ceiling runs (not end caps or swatches).
                want('home_wallpaper', piece, size, tiles=field not in ('left', 'right', 'left_open', 'swatch') or kind != 'walls' and field != 'swatch')
                row[field] = piece + (',FLIP' if ',FLIP' in val else '')
            maps[kind][key] = row
    for bundle, rows in SHELL.items():
        for piece, size in rows.items():
            want(bundle, piece, size)
    return pieces, maps


# ---------- images ----------

def premult(a):
    a = a.astype(np.float32)
    return a[..., :3] * (a[..., 3:4] / 255.0), a[..., 3]


def visible_error(a, b):
    pa, aa = premult(np.asarray(a))
    pb, ab = premult(np.asarray(b))
    vis = (aa > 8) | (ab > 8)
    err = np.maximum(np.abs(pa - pb).max(axis=2), np.abs(aa - ab))
    return err[vis]


def seal_edges(img, depth):
    """Tiles that are opaque inside but fade out in their last pixel or two (art that stops a
    hair short of the stage edge, a stage of 150.05 px) show seams when laid side by side. Fill
    each edge from the nearest opaque pixel inward, up to `depth` pixels; leaves shaped pieces
    (end caps, shadows, swatches with a gap) alone."""
    a = np.array(img)
    al = a[..., 3]
    inner = al[depth:-depth, depth:-depth]
    if inner.size == 0 or (inner >= 250).mean() < 0.995:
        return img, False
    h, w = al.shape
    changed = False
    for side in ('l', 'r', 't', 'b'):
        for k in range(depth):
            if side == 'l': idx, src = (slice(None), k), (slice(None), depth)
            elif side == 'r': idx, src = (slice(None), w - 1 - k), (slice(None), w - 1 - depth)
            elif side == 't': idx, src = (k, slice(None)), (depth, slice(None))
            else: idx, src = (h - 1 - k, slice(None)), (h - 1 - depth, slice(None))
            line = a[idx]
            weak = line[..., 3] < 250
            if weak.any():
                line[weak] = a[src][weak]
                a[idx] = line
                changed = True
    return Image.fromarray(a), changed


def gain_3x(img3, img2):
    up = img2.resize(img3.size, Image.BICUBIC)
    err = visible_error(img3, up)
    return round(float(np.percentile(err, 99)), 1) if err.size else 0.0


def cwebp(src_png, dst, lossless=False):
    args = ['cwebp', '-quiet', '-metadata', 'none']
    if lossless:
        args += ['-lossless', '-z', '6']
    else:
        args += ['-q', str(SETTINGS['quality']), '-m', '4', '-sharp_yuv', '-alpha_q', '100', '-alpha_filter', 'best']
    subprocess.run(args + [src_png, '-o', dst], check=True)


def encode(img, dst, tmp):
    png = os.path.join(tmp, os.path.basename(dst) + '.png')
    img.save(png, compress_level=1)
    cwebp(png, dst)
    back = Image.open(dst)
    back.load()
    err = visible_error(img, back.convert('RGBA'))
    mean = round(float(err.mean()), 2) if err.size else 0.0
    lossless = mean > SETTINGS['lossless_over']
    if lossless:
        cwebp(png, dst, lossless=True)
    os.remove(png)
    return lossless, mean


# ---------- build ----------

def render_all(work, todo):
    """todo [(piece, swf path)] -> {piece: render png}; one JVM for the batch."""
    z = SETTINGS['zoom']
    src = os.path.join(work, f'src-z{z}')
    out = os.path.join(work, f'out-z{z}')
    shutil.rmtree(src, ignore_errors=True)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(src)
    for piece, path in todo:
        os.symlink(path, os.path.join(src, piece + '.swf'))
    run_ffdec('-zoom', z, '-ignorebackground', '-select', 1, '-format', 'frame:png', '-export', 'frame', out, src)
    found = {}
    for piece, _ in todo:
        p = os.path.join(out, piece + '.swf', '1.png')
        if os.path.exists(p):
            found[piece] = p
    return found, [src, out]


def build(args):
    cfg = gsjs_configs()
    pieces, maps = wanted_pieces(cfg)
    work = os.path.abspath(args.work)
    os.makedirs(work, exist_ok=True)
    bins = {b: bundle_bins(work, b) for b in BUNDLES}
    plan = json.load(open(PLAN)) if os.path.exists(PLAN) else {'pieces': {}}
    if plan.get('settings') != SETTINGS:
        plan = {'pieces': {}}
    only = set(args.only.split(',')) if args.only else None
    missing = []
    todo = []
    for piece in sorted(pieces):
        meta = pieces[piece]
        path = bins[meta['bundle']].get(piece)
        if not path:
            missing.append(piece)
            continue
        data = open(path, 'rb').read()
        meta['swf_sha'] = sha(data)[:16]
        meta['stage'] = swfinfo.read(path)['stage']
        meta['frames'] = swfinfo.read(path)['frames']
        old = plan['pieces'].get(piece)
        if only and piece not in only:
            if old:
                continue
        if not args.force and old and old.get('swf_sha') == meta['swf_sha'] and old.get('size') == meta['size'] \
                and os.path.exists(os.path.join(OUT, piece + '@2x.webp')):
            continue
        todo.append((piece, path))
    if missing:
        raise SystemExit('pieces not in their bundle: ' + ', '.join(missing))
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(work, 'tmp')
    os.makedirs(tmp, exist_ok=True)
    print(f'{len(pieces)} pieces, {len(todo)} to render', flush=True)
    for start in range(0, len(todo), args.batch):
        wait_for_load(args.max_load)
        batch = todo[start:start + args.batch]
        found, scratch = render_all(work, batch)
        for piece, _ in batch:
            meta = pieces[piece]
            if piece not in found:
                raise SystemExit(f'FFDec rendered nothing for {piece}')
            render = Image.open(found[piece]).convert('RGBA')
            z = SETTINGS['zoom']
            sw, sh = meta['stage']
            box = (0, 0, min(render.width, round(sw * z)), min(render.height, round(sh * z)))
            w, h = meta['size']
            img2 = render.resize((w * 2, h * 2), Image.LANCZOS, box=box)
            img3 = render.resize((w * 3, h * 3), Image.LANCZOS, box=box)
            sealed = False
            if meta.get('tiles'):
                img2, sealed = seal_edges(img2, 4)
                img3, _ = seal_edges(img3, 6)
            gain = gain_3x(img3, img2)
            row = {**meta, 'gain_3x': gain, 'sealed': sealed}
            d2 = os.path.join(OUT, piece + '@2x.webp')
            d3 = os.path.join(OUT, piece + '@3x.webp')
            row['lossless_2x'], row['err_2x'] = encode(img2, d2, tmp)
            row['bytes_2x'] = os.path.getsize(d2)
            row['sha_2x'] = sha(open(d2, 'rb').read())[:16]
            if gain >= SETTINGS['min_gain'] and w * h > 50 * 50:
                row['lossless_3x'], row['err_3x'] = encode(img3, d3, tmp)
                row['bytes_3x'] = os.path.getsize(d3)
                row['sha_3x'] = sha(open(d3, 'rb').read())[:16]
            elif os.path.exists(d3):
                os.remove(d3)
            plan['pieces'][piece] = row
        for p in scratch:
            shutil.rmtree(p, ignore_errors=True)
        print(f'  {min(start + args.batch, len(todo))}/{len(todo)}', flush=True)
    # drop pieces no longer wanted
    for piece in list(plan['pieces']):
        if piece not in pieces:
            del plan['pieces'][piece]
    for name in os.listdir(OUT):
        piece = re.sub(r'@[23]x\.webp$', '', name)
        if piece not in pieces:
            os.remove(os.path.join(OUT, name))
    plan['settings'] = SETTINGS
    plan['maps'] = maps
    json.dump(plan, open(PLAN, 'w'), indent=1, sort_keys=True)
    write_js(plan)
    shutil.rmtree(tmp, ignore_errors=True)
    report(plan)


def js_text(plan):
    sizes = {p: [r['size'][0], r['size'][1], 1 if 'sha_3x' in r else 0] for p, r in sorted(plan['pieces'].items())}
    body = [
        '// Generated by tools/home-wallpaper/build.py from Tiny Speck\'s home_wallpaper.swf, home_groddle.swf and',
        '// home_tower.swf (tinyspeck/glitch-locations, CC0) and GameServerJS inc_data_homes.js. Do not edit.',
        '',
        '/** piece -> [placed w, placed h, has a 3x file]. Files: assets/homes/wallpaper/<piece>@2x.webp / @3x.webp. */',
        'export const WALLPAPER_PIECES = Object.freeze(' + json.dumps(sizes, separators=(',', ':')) + ');',
        '',
        '/** Visible configs: field -> piece (",FLIP" = drawn mirrored), inc_data_homes.js. */',
        'export const WALLPAPER_MAPS = Object.freeze(' + json.dumps(plan['maps'], separators=(',', ':'), sort_keys=True) + ');',
        '',
    ]
    return '\n'.join(body)


def write_js(plan):
    open(JS, 'w').write(js_text(plan))


def report(plan):
    rows = plan['pieces'].values()
    n3 = sum(1 for r in rows if 'sha_3x' in r)
    b2 = sum(r['bytes_2x'] for r in rows)
    b3 = sum(r.get('bytes_3x', 0) for r in rows)
    print(f'{len(plan["pieces"])} pieces, {n3} with 3x; {b2 / 1e6:.1f} MB at 2x, {b3 / 1e6:.1f} MB at 3x')


def check():
    if not os.path.exists(PLAN):
        print('no plan.json')
        return 1
    plan = json.load(open(PLAN))
    bad = 0
    for piece, r in plan['pieces'].items():
        for tag in ('2x', '3x'):
            if f'sha_{tag}' not in r:
                continue
            p = os.path.join(OUT, f'{piece}@{tag}.webp')
            if not os.path.exists(p) or sha(open(p, 'rb').read())[:16] != r[f'sha_{tag}']:
                print('stale or missing', p)
                bad += 1
    js = open(JS).read() if os.path.exists(JS) else ''
    if js != js_text(plan):
        print('js/home-wallpaper-art.js is stale')
        bad += 1
    report(plan)
    return 1 if bad else 0


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--work')
    a.add_argument('--force', action='store_true')
    a.add_argument('--only')
    a.add_argument('--batch', type=int, default=120)
    a.add_argument('--max-load', type=float, default=40)
    a.add_argument('--check', action='store_true')
    args = a.parse_args()
    if args.check:
        sys.exit(check())
    if not args.work:
        a.error('--work is required')
    build(args)


if __name__ == '__main__':
    main()
