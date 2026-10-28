#!/usr/bin/env python3.11
"""Ladder tiling art: the tile decos that street ladders' `tiling` names (js/ladder-tiling.js draws them).

The client drew a ladder's tiling (LadderView / SurfaceView.tile) from deco classes the street bundle
embeds, like any other deco (DecoByteLoader.loadClassByDeco for cap_0, cap_1 and every center). Only 9
ladders in the location XML carry a tiling, and the classes they name were never placed as ordinary
decos, so the deco pipeline never made them. This script adds them to it:

1. Collects every tiling piece (cap_0, cap_1, centers) from assets/streets/*.json and resolves its
   class the way street-render.js does (the name itself, else DECO_TWINS), then finds that class in
   the street's own bundles (swf_file, tinyspeck/glitch-locations, CC0; tools/deco-audit bundle_index).
2. For a class not shipped yet: renders the embedded SWF's frame 1 with FFDec at zoom 2 (the deco
   sources' 2x size, the stage rectangle resampled to round(stage x 2)) into
   assets-src/decos/groddle/<class>.png, adds the class to assets/decos/manifest.json and a `scored`
   row to tools/deco-audit/report.json (its bundle SWF and stage; the source is the render itself).
3. Runs tools/deco-pipeline/build.py --only <those classes>, which renders them again at 3x and
   writes <class>.webp, <class>@1.5x.webp, plan.json and js/deco-hires-list.js like every deco.

A piece whose class is in none of the street's bundles is listed and left undrawn, as the client
did (isAssetAvailable false). Snool's stone tiling names `ladder_tile_center_0N_stone`, which its
arbito1.swf only has as `arbito_ladder_tile_center_0N_stone`; Tiny Speck laid those as decos over
the ladder instead, so the tiling stays undrawn there.

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp 1.6):
  python3.11 -I tools/build-ladder-tiles.py --work <scratch dir>
  python3.11 -I tools/build-ladder-tiles.py --check     (no rendering; exit 1 on any problem)
Glitch-locations is data only: SWFs are read by FFDec, never executed.
"""
import argparse, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(HERE)
sys.dont_write_bytecode = True  # no __pycache__ in tools/
sys.path.insert(0, os.path.join(HERE, 'deco-audit'))
sys.path.insert(0, os.path.join(HERE, 'icon-hires'))
import audit  # noqa: E402
import swfinfo  # noqa: E402
from PIL import Image  # noqa: E402

PUBLIC = os.path.join(SPIKE, 'public')
STREETS = os.path.join(PUBLIC, 'assets', 'streets')
MANIFEST = os.path.join(PUBLIC, 'assets', 'decos', 'manifest.json')
SRC = os.path.join(SPIKE, 'assets-src', 'decos', 'groddle')
RENDER_JS = os.path.join(PUBLIC, 'js', 'street-render.js')
PIPELINE = os.path.join(HERE, 'deco-pipeline', 'build.py')


def deco_twins():
    """DECO_TWINS from street-render.js (XML class name -> shipped deco)."""
    text = open(RENDER_JS).read()
    m = re.search(r'export const DECO_TWINS = Object\.freeze\(\{(.*?)\}\);', text, re.S)
    return dict(re.findall(r"(\w+):\s*'(\w+)'", m.group(1))) if m else {}


def tiling_pieces():
    """[(street tsid, label, ladder, piece name, class, bundles)] for every ladder tiling piece."""
    idx = json.load(open(os.path.join(STREETS, 'index.json')))['streets']
    twins = deco_twins()
    out = []
    for tsid, meta in sorted(idx.items()):
        path = os.path.join(PUBLIC, meta['file'])
        if not os.path.exists(path):
            continue
        street = json.load(open(path))
        bundles = [b.strip() for b in str(street.get('swf_file') or '').split(',') if b.strip()]
        for ladder in street.get('ladders') or []:
            t = ladder.get('tiling')
            if not isinstance(t, dict):
                continue
            pieces = [('cap_0', t.get('cap_0')), ('cap_1', t.get('cap_1'))]
            pieces += [(f'centers[{i}]', c) for i, c in enumerate(t.get('centers') or [])]
            for key, p in pieces:
                if p and p.get('sprite'):
                    out.append((tsid, meta.get('label'), ladder, key, p['sprite'], twins.get(p['sprite'], p['sprite']), bundles))
    return out


def resolve(pieces, index):
    """class -> {bundle, uses, example} for classes found in their street's bundles; plus the misses."""
    found, missing = {}, []
    for tsid, label, ladder, key, sprite, cls, bundles in pieces:
        bundle = next((b for b in bundles if cls in index.get(b, {})), None)
        if not bundle:
            missing.append((tsid, label, ladder['id'], key, sprite))
            continue
        e = found.setdefault(cls, {'bundle': bundle, 'uses': 0, 'streets': set(),
                                   'example': {'tsid': tsid, 'label': label, 'x': ladder['x'], 'y': ladder['y']}})
        e['uses'] += 1
        e['streets'].add(tsid)
    return found, missing


def render_sources(work, todo, index):
    """FFDec frame 1 at zoom 2 for each class -> assets-src PNG at round(stage x 2)."""
    items = [(cls, audit.bundled_swf(work, e['bundle'], cls, index)) for cls, e in todo.items()]
    found, src, out = audit.export_frames(work, 'ladder-tiles', items, 2)
    rows = {}
    for cls, swf in items:
        if cls not in found:
            raise SystemExit(f'{cls}: FFDec produced no frame')
        sw, sh = swfinfo.read(swf)['stage']
        size = (max(1, round(sw * 2)), max(1, round(sh * 2)))
        ren = Image.open(found[cls]).convert('RGBA')
        box = (0, 0, min(ren.width, sw * 2), min(ren.height, sh * 2))
        img = ren.resize(size, Image.LANCZOS, box=box)
        os.makedirs(SRC, exist_ok=True)
        img.save(os.path.join(SRC, cls + '.png'), optimize=True)
        root, longest = audit.swf_frames(swf)
        rows[cls] = {'stage': [sw, sh], 'png': list(size), 'render': list(ren.size), 'root_frames': root,
                     'sprite_frames': longest, 'swf': audit.swf_label(swf, work)}
        print(f'  {cls}: {todo[cls]["bundle"]} stage {sw}x{sh} -> {size[0]}x{size[1]}', flush=True)
    shutil.rmtree(src, ignore_errors=True)
    shutil.rmtree(out, ignore_errors=True)
    return rows


def add_report_rows(todo, rendered):
    report = json.load(open(audit.REPORT))
    have = {r['name'] for r in report['decos']}
    rank = max((r.get('rank') or 0) for r in report['decos'])
    for cls in sorted(rendered):
        if cls in have:
            continue
        e, r = todo[cls], rendered[cls]
        rank += 1
        # No earlier PNG to audit against: the source is this render, so the scores are trivial.
        report['decos'].append({
            'name': cls, 'placed': 0, 'streets': len(e['streets']), 'example': e['example'],
            'ladder_tiling': e['uses'], 'key': f"{cls}__b_{e['bundle'][:-4]}", 'swf': r['swf'], 'stage': r['stage'],
            'render': r['render'], 'root_frames': r['root_frames'], 'sprite_frames': r['sprite_frames'],
            'iou': 1.0, 'missing': 0.0, 'extra': 0.0, 'colour': 0.0, 'badness': 0.0, 'png': r['png'],
            'variants': 1, 'status': 'scored', 'rank': rank})
    report['summary'] = dict(__import__('collections').Counter(r['status'] for r in report['decos']))
    audit.dump_report(report)


def add_manifest(names):
    m = json.load(open(MANIFEST))
    new = sorted(set(m) | set(names))
    if new != m:
        with open(MANIFEST, 'w') as f:
            f.write(json.dumps(new, indent=2) + '\n')


def cmd_build(args):
    index = audit.bundle_index()
    found, missing = resolve(tiling_pieces(), index)
    shipped = set(json.load(open(MANIFEST)))
    todo = {c: e for c, e in found.items() if c not in shipped or not os.path.exists(os.path.join(SRC, c + '.png'))}
    print(f'{len(found)} tiling classes in their bundles, {len(todo)} to add; {len(missing)} pieces with no class')
    for m in missing:
        print('  not drawn:', *m)
    if not todo:
        return
    os.makedirs(args.work, exist_ok=True)
    rendered = render_sources(args.work, todo, index)
    add_report_rows(todo, rendered)
    add_manifest(rendered)
    subprocess.run([sys.executable, '-I', PIPELINE, '--work', os.path.join(args.work, 'pipeline'),
                    '--only', ','.join(sorted(rendered))], check=True)


def cmd_check(args):
    problems = []
    index = audit.bundle_index()
    found, missing = resolve(tiling_pieces(), index)
    shipped = set(json.load(open(MANIFEST)))
    report = {r['name']: r for r in json.load(open(audit.REPORT))['decos']}
    for cls, e in sorted(found.items()):
        if cls not in shipped:
            problems.append(f'{cls}: not in manifest.json')
        if not os.path.exists(os.path.join(SRC, cls + '.png')):
            problems.append(f'{cls}: no source PNG')
        r = report.get(cls) or {}
        if r.get('status') != 'scored' or not r.get('swf'):
            problems.append(f'{cls}: no scored report row')
        if not os.path.exists(os.path.join(PUBLIC, 'assets', 'decos', 'groddle', cls + '.webp')):
            problems.append(f'{cls}: missing {cls}.webp')
    for p in problems:
        print('  ' + p)
    print(f'{len(found)} tiling classes, {len(missing)} pieces with no class (left undrawn); {len(problems)} problems')
    return 1 if problems else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', help='scratch dir for renders')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    if args.check:
        sys.exit(cmd_check(args))
    if not args.work:
        ap.error('--work is required to build')
    cmd_build(args)


if __name__ == '__main__':
    main()
