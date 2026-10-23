#!/usr/bin/env python3.11
"""Room art rendered from Tiny Speck's location decos for rooms whose own location files are lost.

Sets (each: decos, world scale per deco, output folder, a plan and a generated JS size table):
- kids_room (register row G65): Mr. Block's playroom (template LIF149EVS2A22H1, "The Kid's Room" in
  inc_data_maps_prod.js) is not in the public locations dump. Four player Snaps of it
  (research/wayback/raw/snaps/letter_block_1/, reference only) show a giant child's bedroom, and every
  piece in them exists as a CC0 k04 deco in the kukubee2.swf street bundle: the monster wallpaper,
  carpet, bed, panda, dresser, tea table, teapot, cups, teddy, the pink "tall guy", stools, the
  kidney table, CRAYLON crayons, bricks, sneaker, sock, ring stacker, book, window and the torn wall
  patch. js/kids-room-scene.js lays them out.
- sky_plunge (G68): the Sky Plunge landing's two doors (Snap research/wayback/raw/snaps/
  paradise_sky_plunge/: tall, round-topped dark wooden doors with an oval window) are the CC0
  door_asset_heights_interior deco (groddle1.swf bundle). js/paradise-course-runtime.js places them.

This reuses the street deco pipeline (tools/deco-pipeline/build.py): the deco SWF a bundle embeds is
rendered once by FFDec (render_batch), its stage is resampled with Lanczos onto the output size
(stage_resample) and encoded as WebP (encode: lossy q82 sharp YUV, lossless where the lossy file
shows artefacts). Each piece is drawn at one world scale (world px per SWF stage px, read off the
Snaps against the avatar), so the file is <name>@2x.webp at twice that size (or @1.5x for soft
textures) and js/textures.js gives the sprite its world size. A texture whose stage does not tile
(the carpet) is made seamless by cross-fading its own edges (a band of its width and height is
folded onto the opposite edge).

Writes, per set: the WebPs, tools/room-art/<set>.json (plan) and the set's generated JS table.

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp):
  python3.11 -I tools/room-art/build.py --work <scratch dir> [--set kids_room] [--force]
  python3.11 -I tools/room-art/build.py --check     (no rendering; exit 1 on a problem)
Glitch-locations is data only: the SWFs are read by FFDec, never executed.
"""
import argparse, json, math, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
sys.dont_write_bytecode = True
for sub in ('deco-audit', 'icon-hires', 'deco-pipeline'):
    sys.path.insert(0, os.path.join(SPIKE, 'tools', sub))
import audit  # noqa: E402
import swfinfo  # noqa: E402
import build as deco  # noqa: E402  (tools/deco-pipeline/build.py)

PUBLIC = os.path.join(SPIKE, 'public')

# Per set: name -> (world scale, density, seamless band[, bundle]). Kid's Room scales come from the
# Snaps: the remake's shrunken avatar is ~50 world px tall where the Snaps' is ~85 px, so a piece's
# world size is ~0.6 of its size in the Snap. The Sky Plunge door is ~1.6 avatars tall, as in its Snap.
SETS = {
    'kids_room': {
        'bundle': 'kukubee2.swf',
        'out': 'assets/sprites/quest-rooms/kids_room',
        'js': 'js/kids-room-art.js',
        'export': 'KIDS_ROOM_FILES',
        'pieces': {
            'k04_wallpaper_08_monsters': (0.45, 1.5, 0),
            'k04_wallcrack_02': (0.25, 2, 0),
            'k04_window_01': (0.32, 2, 0),
            'k04_carpet_01_white': (0.5, 1.5, 0.12),
            'k04_molding_02_white': (0.3, 2, 0),
            'k04_bed_01': (0.32, 2, 0),
            'k04_doll_01_panda': (0.12, 2, 0),
            'k04_dresser_03': (0.4, 2, 0),
            'k04_table_07': (0.25, 2, 0),
            'k04_teapot_01': (0.33, 2, 0),
            'k04_teacup_01': (0.2, 2, 0),
            'k04_teddybear_01': (0.29, 2, 0),
            'k04_tallguything_01': (0.22, 2, 0),
            'k04_stool_01': (0.23, 2, 0),
            'k04_table_08': (0.18, 2, 0),
            'k04_craylon_01': (0.19, 2, 0),
            'k04_craylon_02': (0.19, 2, 0),
            'k04_craylon_03': (0.19, 2, 0),
            'k04_blocko_01': (0.12, 2, 0),
            'k04_blocko_02': (0.12, 2, 0),
            'k04_blocko_03': (0.12, 2, 0),
            'k04_blocko_04': (0.12, 2, 0),
            'k04_sneaker_01': (0.12, 2, 0),
            'k04_sock_01': (0.085, 2, 0),
            'k04_babyrings_01': (0.24, 2, 0),
            'k04_book_01_blue': (0.045, 2, 0),
        },
    },
    'sky_plunge': {
        'bundle': 'groddle1.swf',
        'out': 'assets/sprites/paradise/sky_plunge',
        'js': 'js/sky-plunge-art.js',
        'export': 'SKY_PLUNGE_FILES',
        'pieces': {
            'door_asset_heights_interior': (0.9, 2, 0),
        },
    },
}


def set_paths(name):
    cfg = SETS[name]
    return (os.path.join(PUBLIC, cfg['out']), os.path.join(HERE, f'{name}.json'), os.path.join(PUBLIC, cfg['js']))


def piece(spec, cfg):
    scale, density, band = spec[:3]
    return scale, density, band, (spec[3] if len(spec) > 3 else cfg['bundle'])


def file_name(name, density):
    return f'{name}@{density:g}x.webp'


def key(name, scale, density, band, swf_sha):
    return f'{swf_sha}:{scale}:{density}:{band}:{json.dumps(deco.SETTINGS, sort_keys=True)}'


def seamless(img, band):
    """Fold a band of the image's width and height onto the opposite edges (linear cross-fade) so the
    result tiles; it is smaller by the band. Fully opaque (the stage edge is half transparent)."""
    import numpy as np
    from PIL import Image
    a = np.asarray(img, dtype=np.float32)
    for axis in (1, 0):
        n = a.shape[axis]
        b = max(1, int(round(n * band)))
        t = np.linspace(0, 1, b, dtype=np.float32)
        t = t[None, :, None] if axis == 1 else t[:, None, None]
        head = np.take(a, range(0, b), axis=axis)
        tail = np.take(a, range(n - b, n), axis=axis)
        mid = np.take(a, range(b, n - b), axis=axis)
        a = np.concatenate([head * t + tail * (1 - t), mid], axis=axis)
    a[..., 3] = 255
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype('uint8'), 'RGBA')


def write_js(name, rows):
    cfg = SETS[name]
    bundles = sorted({r['swf'].split('#')[0][len('bundle:'):] for r in rows.values()})
    lines = [f"// Generated by tools/room-art/build.py ({name}) from tinyspeck/glitch-locations {', '.join(bundles)} (CC0).",
             f"// Do not edit. deco -> [file in {cfg['out']}/, world w, world h].",
             f"export const {cfg['export']} = Object.freeze({{"]
    for deco_name, r in sorted(rows.items()):
        lines.append(f"  {deco_name}: ['{r['file']}', {r['world'][0]}, {r['world'][1]}],")
    lines.append('});')
    return '\n'.join(lines) + '\n'


def build_set(args, set_name, index):
    cfg = SETS[set_name]
    OUT, PLAN, OUT_JS = set_paths(set_name)
    PIECES = cfg['pieces']
    os.makedirs(args.work, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    plan = json.load(open(PLAN)) if os.path.exists(PLAN) else {}
    rows = plan.get('pieces', {})
    todo = []
    for name, spec in PIECES.items():
        scale, density, band, bundle = piece(spec, cfg)
        swf = audit.bundled_swf(args.work, bundle, name, index)
        swf_sha = deco.sha(swf)[:16]
        stage = swfinfo.read(swf)['stage']
        px = [max(1, round(stage[0] * scale * density)), max(1, round(stage[1] * scale * density))]
        row = {'scale': scale, 'density': density, 'band': band, 'stage': stage, 'px': px,
               'file': file_name(name, density), 'swf': f'bundle:{bundle}#{name}', 'swf_sha': swf_sha}
        row['key'] = key(name, scale, density, band, swf_sha)
        old = rows.get(name) or {}
        if not args.force and old.get('key') == row['key'] and os.path.exists(os.path.join(OUT, row['file'])):
            continue
        row['_swf'] = swf
        row['zoom'] = max(1, math.ceil(scale * density - 0.02))
        todo.append((name, row))
    print(f'{set_name}: {len(PIECES)} pieces; to do: {len(todo)}', flush=True)
    by_zoom = {}
    for name, row in todo:
        by_zoom.setdefault(row['zoom'], []).append((name, row))
    for zoom, batch in sorted(by_zoom.items()):
        found, tmp = deco.render_batch(args.work, zoom, [(n, r['_swf']) for n, r in batch])
        for name, row in batch:
            if name not in found:
                raise SystemExit(f'{name}: FFDec produced no frame')
            img = deco.stage_resample(deco.load(found[name]), row['stage'], zoom, row['px'])
            if row['band']:
                img = seamless(img, row['band'])
            row['out_px'] = list(img.size)
            row['world'] = [math.floor(img.size[0] / row['density'] + 0.5), math.floor(img.size[1] / row['density'] + 0.5)]  # as JS Math.round
            dst = os.path.join(OUT, row['file'])
            row['bytes'], row['lossless'], row['err'] = deco.encode(img, dst, os.path.join(args.work, 'enc'))
            row['sha'] = deco.sha(dst)[:16]
            for k in ('_swf', 'zoom'):
                row.pop(k, None)
            rows[name] = row
            print(f'  {row["file"]} {row["out_px"][0]}x{row["out_px"][1]} {row["bytes"]} B', flush=True)
        for p in tmp:
            shutil.rmtree(p, ignore_errors=True)
    for name in list(rows):
        if name not in PIECES:
            del rows[name]
    bundles = sorted({piece(spec, cfg)[3] for spec in PIECES.values()})
    plan = {'source': f"tinyspeck/glitch-locations {', '.join(bundles)} (CC0), rendered by tools/deco-pipeline",
            'settings': deco.SETTINGS, 'tools': deco.tool_versions(), 'pieces': dict(sorted(rows.items()))}
    with open(PLAN, 'w') as f:
        json.dump(plan, f, indent=1)
        f.write('\n')
    with open(OUT_JS, 'w') as f:
        f.write(write_js(set_name, rows))
    print('total bytes', sum(r['bytes'] for r in rows.values()))


def cmd_build(args):
    index = audit.bundle_index()
    for set_name in ([args.set] if args.set else SETS):
        build_set(args, set_name, index)


def cmd_check():
    bad = 0
    for set_name, cfg in SETS.items():
        OUT, PLAN, OUT_JS = set_paths(set_name)
        if not os.path.exists(PLAN):
            print(f'{set_name}: no plan'); bad += 1; continue
        rows = json.load(open(PLAN))['pieces']
        for name, spec in cfg['pieces'].items():
            scale, density, band, bundle = piece(spec, cfg)
            row = rows.get(name)
            if not row or row['scale'] != scale or row['density'] != density or row.get('band') != band \
                    or row['swf'] != f'bundle:{bundle}#{name}':
                print(f'{set_name}/{name}: not built as {spec}'); bad += 1; continue
            path = os.path.join(OUT, row['file'])
            if not os.path.exists(path) or deco.sha(path)[:16] != row['sha']:
                print(f'{set_name}/{name}: {row["file"]} missing or changed'); bad += 1
        for name in rows:
            if name not in cfg['pieces']:
                print(f'{set_name}/{name}: in the plan but not in the set'); bad += 1
        if not os.path.exists(OUT_JS) or open(OUT_JS).read() != write_js(set_name, rows):
            print(f'{cfg["js"]} is stale'); bad += 1
    print('ok' if not bad else f'{bad} problems')
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--work', help='scratch dir for renders')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--set', choices=sorted(SETS))
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    if args.check:
        sys.exit(cmd_check())
    if not args.work:
        ap.error('--work is required to build')
    cmd_build(args)


if __name__ == '__main__':
    main()
