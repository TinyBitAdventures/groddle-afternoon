#!/usr/bin/env python3.11
"""Audit every shipped street deco PNG against Tiny Speck's SWF for the same sprite class.

The deco PNGs under public/assets/decos/groddle/ came from ChildrenOfUr/coU-decos `_png-2x`
(scripts/fetch-street-decos.py in the audit workspace). Some of those exports lost layers
(community_machine_room_ext kept only its roof). This renders each SWF's first root frame
with FFDec (one JVM per batch of symlinked SWFs), scales it to the shipped PNG's size (decos
are drawn stretched to their placed w x h, anchored bottom-centre), and scores the pair.

Scores (on a copy of both images fitted inside 256 px):
  iou       alpha-coverage intersection over union (alpha >= 50%)
  missing   share of the SWF's coverage that the PNG lacks (1 px tolerance)
  extra     share of the PNG's coverage that the SWF lacks (1 px tolerance)
  colour    mean |RGB| difference where both are opaque, 0..1
  trim_iou  IoU after cropping both to their own alpha bounds (high trim_iou with low iou
            means the art is shifted or scaled, not missing)
  badness   max(missing, extra) + colour / 2, the ranking key

Usage (python3.11 has numpy + Pillow on this machine; run with -I):
  python3.11 -I tools/deco-audit/audit.py audit  --work <scratch dir> [--only a,b] [--batch 150]
  python3.11 -I tools/deco-audit/audit.py rescore --work <scratch dir> [--only a,b]   (no FFDec; after a fix)
  python3.11 -I tools/deco-audit/audit.py sheet  --work <scratch dir> --out <png> [--top 60] [--names a,b]
  python3.11 -I tools/deco-audit/audit.py render --work <scratch dir> --names a,b [--write]

`render` re-renders at the shipped PNG's resolution (zoom = PNG width / stage width, at least 2) both
with FFDec's rasteriser and with FFDec's SVG export drawn by Chromium (svg2png.mjs, Playwright),
resizes each to the exact shipped size (Lanczos), logs how well the two agree (render.json in the
work dir) and, with --write --use svg|raster, replaces the PNG in place.
Glitch-locations is data only: SWFs are read by FFDec, never executed.
"""
import argparse, collections, glob, hashlib, json, math, os, shutil, subprocess, sys, time

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
sys.dont_write_bytecode = True  # no __pycache__ in tools/
sys.path.insert(0, os.path.join(SPIKE, 'tools', 'icon-hires'))
import swfinfo  # noqa: E402

PUBLIC = os.path.join(SPIKE, 'public')
DECOS = os.path.join(PUBLIC, 'assets', 'decos', 'groddle')
STREETS = os.path.join(PUBLIC, 'assets', 'streets')
LOCATIONS = os.path.expanduser('~/Documents/glitch-audit/research/audio-hunt/raw/glitch-locations/source')
JAVA = '/opt/homebrew/opt/openjdk@21/bin/java'
FFDEC = os.path.expanduser('~/Documents/glitch-audit/tools/ffdec/ffdec.jar')
BUNDLES = os.path.join(os.path.dirname(LOCATIONS), 'glitch-location-swfs')
REPORT = os.path.join(HERE, 'report.json')
FIT = 256


def ffdec(*args):
    r = subprocess.run([JAVA, '-Djava.awt.headless=true', '-Xmx2g', '-jar', FFDEC, *map(str, args)],
                       capture_output=True, text=True)
    return r.returncode


def swf_candidates():
    out = collections.defaultdict(list)
    for p in sorted(glob.glob(os.path.join(LOCATIONS, '*', '*.swf'))):
        out[os.path.basename(p)[:-4]].append(p)
    return out


def bundle_index():
    """{bundle file: {sprite class: (offset, length)}}. Each street bundle (the SWFs named in a street's
    swf_file) embeds every deco as its own SWF in a DefineBinaryData tag, exported as
    `<bundle>_<class>_dataClass`; the client loads those exact bytes (DecoByteLoader) and scales the
    embedded SWF's stage to the placed w x h (DecoRenderer.syncRendererWithModel)."""
    import struct
    out = {}
    for path in sorted(glob.glob(os.path.join(BUNDLES, '*.swf'))):
        b = os.path.basename(path)
        body = swfinfo.swf_body(path)[0]
        bins, sym = {}, {}
        for code, q, ln in swfinfo.tags(body, swfinfo.rect_len(body) + 4, len(body)):
            if code == 87:
                bins[struct.unpack_from('<H', body, q)[0]] = (q + 6, ln - 6)
            elif code == 76:
                n = struct.unpack_from('<H', body, q)[0]; r = q + 2
                for _ in range(n):
                    cid = struct.unpack_from('<H', body, r)[0]; r += 2
                    e = body.index(0, r); sym[body[r:e].decode('latin1')] = cid; r = e + 1
        pre = b[:-4] + '_'
        out[b] = {k[len(pre):-len('_dataClass')]: bins[c] for k, c in sym.items()
                  if k.startswith(pre) and k.endswith('_dataClass') and c in bins}
    return out


_BODIES = {}


def bundled_swf(work, bundle, name, index):
    """Write the deco SWF embedded in a street bundle to the work dir (data only, never run)."""
    dest = os.path.join(work, 'bundled', bundle[:-4], name + '.swf')
    if not os.path.exists(dest):
        if bundle not in _BODIES:
            _BODIES[bundle] = swfinfo.swf_body(os.path.join(BUNDLES, bundle))[0]
        q, ln = index[bundle][name]
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, 'wb').write(_BODIES[bundle][q:q + ln])
    return dest


def swf_frames(path):
    """Root frame count and the longest DefineSprite timeline (animated decos)."""
    body = swfinfo.swf_body(path)[0]
    start = swfinfo.rect_len(body) + 4
    root = 0
    longest = 1
    p = start
    import struct
    while p < len(body):
        h = struct.unpack_from('<H', body, p)[0]; p += 2
        code, ln = h >> 6, h & 0x3f
        if ln == 0x3f:
            ln = struct.unpack_from('<I', body, p)[0]; p += 4
        if code == 0:
            break
        if code == 1:
            root += 1
        elif code == 39:
            longest = max(longest, struct.unpack_from('<H', body, p + 2)[0])
        p += ln
    return root, longest


def placements(index=None):
    """sprite -> {count, streets, example {tsid, label, x, y, w, h}, bundles {bundle: placements}}.
    A placement's bundle is the first SWF in its street's swf_file list that embeds the class."""
    idx = json.load(open(os.path.join(STREETS, 'index.json')))
    index = index or bundle_index()
    out = {}
    for tsid, meta in sorted(idx.get('streets', {}).items()):
        path = os.path.join(PUBLIC, meta['file'])
        if not os.path.exists(path):
            continue
        street = json.load(open(path))
        loads = [x.strip() for x in str(street.get('swf_file') or '').split(',') if x.strip()]
        for layer in street.get('layers') or []:
            for d in layer.get('decos') or []:
                sp = d.get('sprite')
                if not sp:
                    continue
                e = out.setdefault(sp, {'count': 0, 'streets': set(), 'example': None, 'sizes': collections.Counter(),
                                        'bundles': collections.Counter()})
                e['count'] += 1
                e['bundles'][next((b for b in loads if sp in index.get(b, {})), None)] += 1
                e['streets'].add(tsid)
                e['sizes'][(d.get('w'), d.get('h'))] += 1
                if e['example'] is None or (layer.get('name') == 'middleground' and e['example']['layer'] != 'middleground'):
                    e['example'] = {'tsid': tsid, 'label': meta.get('label'), 'layer': layer.get('name'),
                                    'x': d.get('x'), 'y': d.get('y'), 'w': d.get('w'), 'h': d.get('h')}
    for e in out.values():
        e['streets'] = len(e['streets'])
        e['size'] = list(e['sizes'].most_common(1)[0][0])
        del e['sizes']
        e['bundles'] = {str(k): v for k, v in e['bundles'].most_common()}
    return out


def load_rgba(path):
    im = Image.open(path)
    im.load()
    return im.convert('RGBA')


def fit_size(w, h, cap=FIT):
    s = min(1.0, cap / max(w, h))
    return max(1, round(w * s)), max(1, round(h * s))


def dilate(m):
    """3x3 max filter (bool or float), the 1 px anti-aliasing tolerance."""
    d = m.copy()
    d[1:, :] = np.maximum(d[1:, :], m[:-1, :]); d[:-1, :] = np.maximum(d[:-1, :], m[1:, :])
    e = d.copy()
    e[:, 1:] = np.maximum(e[:, 1:], d[:, :-1]); e[:, :-1] = np.maximum(e[:, :-1], d[:, 1:])
    return e


def fit_pair(cur, ren):
    """Both images as float RGBA arrays at the shipped PNG's aspect, fitted inside FIT px."""
    tw, th = fit_size(*cur.size)
    a = np.asarray(cur.resize((tw, th), Image.BOX), dtype=np.float32) / 255
    b = np.asarray(ren.resize((tw, th), Image.BOX), dtype=np.float32) / 255
    return a, b


def trim_mask(al):
    m = al >= max(0.02, 0.25 * float(al.max()))
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    return al[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def score(a, b):
    """a = shipped PNG, b = SWF render, float RGBA arrays of one size (fit_pair).
    Alpha is soft (translucent glows and blurs count by their opacity)."""
    pa, pb = a[..., 3], b[..., 3]
    sa, sb = float(pa.sum()), float(pb.sum())
    n = pa.size
    union = float(np.maximum(pa, pb).sum())
    iou = float(np.minimum(pa, pb).sum()) / union if union else 1.0
    missing = float(np.clip(pb - dilate(pa), 0, None).sum()) / sb if sb else 0.0
    extra = float(np.clip(pa - dilate(pb), 0, None).sum()) / sa if sa else 0.0
    w = np.minimum(pa, pb)
    colour = float((np.abs(a[..., :3] - b[..., :3]).mean(axis=2) * w).sum() / w.sum()) if w.sum() > 1e-6 else 0.0
    trim_iou = None
    ta, tb = trim_mask(pa), trim_mask(pb)
    if ta is not None and tb is not None:
        tb2 = np.asarray(Image.fromarray((tb * 255).astype(np.uint8)).resize(ta.shape[::-1], Image.BOX),
                         dtype=np.float32) / 255
        u = float(np.maximum(ta, tb2).sum())
        trim_iou = round(float(np.minimum(ta, tb2).sum()) / u, 4) if u else 1.0
    # Soft IoU is low for blurred or hairline art even when nothing is wrong; missing/extra already
    # carry the 1 px tolerance, so they rank layer loss, wrong art and shifted framing.
    badness = max(missing, extra) + 0.5 * colour
    return {'iou': round(iou, 4), 'missing': round(missing, 4), 'extra': round(extra, 4),
            'colour': round(colour, 4), 'trim_iou': trim_iou, 'cov_png': round(sa / n, 4),
            'cov_swf': round(sb / n, 4), 'swf_blank': sb < 0.002 * n, 'png_blank': sa < 0.002 * n,
            'badness': round(float(badness), 4)}


def checker(w, h, cell=8):
    im = Image.new('RGBA', (w, h), (205, 205, 205, 255))
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range((y // cell) % 2 * cell, w, cell * 2):
            d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(240, 240, 240, 255))
    return im


def pair_thumb(cur, ren, cell=(300, 170)):
    """current | swf render, each fitted to the cell over a checkerboard."""
    out = Image.new('RGBA', (cell[0] * 2 + 6, cell[1]), (60, 60, 60, 255))
    for i, im in enumerate((cur, ren)):
        s = min(cell[0] / im.width, cell[1] / im.height)
        t = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        bg = checker(*t.size)
        bg.alpha_composite(t)
        out.paste(bg, (i * (cell[0] + 6) + (cell[0] - t.width) // 2, (cell[1] - t.height) // 2))
    return out.convert('RGB')


def link_batch(src, items):
    shutil.rmtree(src, ignore_errors=True)
    os.makedirs(src)
    for key, swf in items:
        os.symlink(swf, os.path.join(src, key + '.swf'))


def export_frames(work, tag, items, zoom, frame=1):
    """items [(key, swf)] -> {key: png path}; one JVM for the whole batch."""
    src = os.path.join(work, f'src-{tag}')
    out = os.path.join(work, f'out-{tag}')
    shutil.rmtree(out, ignore_errors=True)
    link_batch(src, items)
    ffdec('-zoom', zoom, '-ignorebackground', '-select', frame, '-format', 'frame:png', '-export', 'frame', out, src)
    found = {}
    for key, _ in items:
        p = os.path.join(out, key + '.swf', f'{frame}.png')
        if os.path.exists(p):
            found[key] = p
    return found, src, out


def deco_bundles(n, place, index):
    """Bundles whose embedded copy of n is drawn on some street, else every bundle that embeds n."""
    used = [b for b in (place.get(n) or {}).get('bundles', {}) if b != 'None']
    return used or sorted(b for b, names in index.items() if n in names)


def swf_label(swf, work):
    if swf.startswith(os.path.join(work, 'bundled')):
        return 'bundle:' + os.path.basename(os.path.dirname(swf)) + '.swf#' + os.path.basename(swf)[:-4]
    return os.path.relpath(swf, LOCATIONS)


def swf_path(label, work, index=None):
    if label.startswith('bundle:'):
        b, n = label[len('bundle:'):].split('#')
        return bundled_swf(work, b, n, index or bundle_index())
    return os.path.join(LOCATIONS, label)


def cmd_audit(args):
    work = args.work
    os.makedirs(os.path.join(work, 'thumbs'), exist_ok=True)
    os.makedirs(os.path.join(work, 'fit'), exist_ok=True)
    state_path = os.path.join(work, 'scores.json')
    state = json.load(open(state_path)) if os.path.exists(state_path) else {}
    cands = swf_candidates()
    index = bundle_index()
    place = placements(index)
    names = sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(DECOS, '*.png')))
    if args.only:
        names = [n for n in names if n in set(args.only.split(','))]
        for n in names:
            state.pop(n, None)
    todo = []
    for n in names:
        if n in state:
            continue
        for b in deco_bundles(n, place, index):
            todo.append((n + '__b_' + b[:-4], n, bundled_swf(work, b, n, index)))
        for swf in cands.get(n, []):
            todo.append((n + '__' + os.path.basename(os.path.dirname(swf)), n, swf))
    print(f'{len(names)} decos, {len(todo)} SWF renders to do', flush=True)
    for i in range(0, len(todo), args.batch):
        chunk = todo[i:i + args.batch]
        t0 = time.time()
        found, src, out = export_frames(work, 'audit', [(k, s) for k, _, s in chunk], args.zoom)
        for key, n, swf in chunk:
            e = state.setdefault(n, {'variants': {}})
            cur_path = os.path.join(DECOS, n + '.png')
            cur = load_rgba(cur_path)
            root, longest = swf_frames(swf)
            info = swfinfo.read(swf)
            v = {'swf': swf_label(swf, work), 'stage': info['stage'], 'root_frames': root,
                 'sprite_frames': longest}
            if key in found:
                ren = load_rgba(found[key])
                v['render'] = list(ren.size)
                a, b = fit_pair(cur, ren)
                Image.fromarray((b * 255).round().astype(np.uint8), 'RGBA').save(os.path.join(work, 'fit', key + '.png'))
                v.update(score(a, b))
                pair_thumb(cur, ren).save(os.path.join(work, 'thumbs', key + '.png'))
            else:
                v['error'] = 'no render'
            e['variants'][key] = v
            e['png'] = list(cur.size)
        shutil.rmtree(src, ignore_errors=True)
        shutil.rmtree(out, ignore_errors=True)
        json.dump(state, open(state_path, 'w'))
        print(f'  {min(i + args.batch, len(todo))}/{len(todo)}  {time.time() - t0:.0f}s', flush=True)
    write_report(state, names if not args.only else None)


def write_report(state, names=None):
    index = bundle_index()
    place = placements(index)
    cands = swf_candidates()
    all_names = sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(DECOS, '*.png')))
    rows = []
    for n in all_names:
        e = state.get(n)
        p = place.get(n)
        row = {'name': n, 'placed': p['count'] if p else 0, 'streets': p['streets'] if p else 0,
               'example': p['example'] if p else None}
        if p:
            row['bundles'] = p['bundles']
        if not cands.get(n) and not any(n in names for names in index.values()):
            row['status'] = 'no-swf'
        elif not e:
            row['status'] = 'not-scored'
        else:
            vs = [dict(v, key=k) for k, v in e['variants'].items() if 'badness' in v]
            if not vs:
                row['status'] = 'no-render'
                row['swf'] = [v['swf'] for v in e['variants'].values()]
            else:
                ps = p['size'] if p else None
                for v in vs:
                    v['stage_fits'] = bool(ps and ps[0] and ps[1] and abs(ps[0] - v['stage'][0]) <= 2.5
                                           and abs(ps[1] - v['stage'][1]) <= 2.5)
                # The street bundle's embedded copy is what the client drew; the most used one wins.
                # Without one (decos only code places), prefer a source SWF whose stage is the
                # placed size, then the closest match.
                order = list((p or {}).get('bundles', {}))
                def rank(v):
                    if v['swf'].startswith('bundle:'):
                        b = v['swf'][len('bundle:'):].split('#')[0]
                        return (0, order.index(b) if b in order else 99, 0, v['badness'])
                    return (1, 0, not v['stage_fits'], v['badness'])
                best = min(vs, key=rank)
                src = [v for v in vs if not v['swf'].startswith('bundle:')]
                if src and best['swf'].startswith('bundle:'):
                    row['source_badness'] = min(v['badness'] for v in src)
                row['stage_fits'] = best['stage_fits']
                row['placed_size'] = ps
                row['png_half_vs_stage'] = [round(e['png'][0] / 2 - best['stage'][0], 1), round(e['png'][1] / 2 - best['stage'][1], 1)]
                row.update({k: best[k] for k in ('key', 'swf', 'stage', 'render', 'root_frames', 'sprite_frames', 'iou',
                                                 'missing', 'extra', 'colour', 'trim_iou', 'cov_png', 'cov_swf',
                                                 'swf_blank', 'png_blank', 'badness')})
                row['png'] = e['png']
                row['variants'] = len(e['variants'])
                row['status'] = 'scored'
        rows.append(row)
    rows.sort(key=lambda r: (-(r.get('badness') or -1), r['name']))
    for i, r in enumerate(rows):
        r['rank'] = i + 1
    summary = collections.Counter(r['status'] for r in rows)
    report = {'generated': time.strftime('%Y-%m-%d'),
              'source': 'tinyspeck/glitch-locations (CC0): the deco SWF embedded in the street bundle '
                        '(glitch-location-swfs/<bundle>.swf, <bundle>_<class>_dataClass), else source/<set>/<class>.swf',
              'method': 'FFDec frame 1 at zoom 2 (bundle SWF), scaled to the shipped PNG, both fitted in 256 px; see audit.py',
              'summary': dict(summary), 'decos': rows}
    dump_report(report)
    print('report', dict(summary))


def dump_report(report):
    """One deco per line, so a re-audit diffs by deco."""
    for r in report['decos']:
        if r.get('example'):
            r['example'] = {k: r['example'].get(k) for k in ('tsid', 'label', 'x', 'y')}
    head = {k: v for k, v in report.items() if k != 'decos'}
    with open(REPORT, 'w') as f:
        f.write(json.dumps(head, separators=(',', ':'))[:-1] + ',"decos":[\n')
        f.write(',\n'.join(json.dumps(r, separators=(',', ':')) for r in report['decos']))
        f.write('\n]}\n')


def cmd_rescore(args):
    """Score the shipped PNGs again against the kept fitted renders (no FFDec), e.g. after a fix."""
    work = args.work
    state_path = os.path.join(work, 'scores.json')
    state = json.load(open(state_path))
    only = set(args.only.split(',')) if args.only else None
    for n, e in state.items():
        if only and n not in only:
            continue
        cur = load_rgba(os.path.join(DECOS, n + '.png'))
        e['png'] = list(cur.size)
        for key, v in e['variants'].items():
            fp = os.path.join(work, 'fit', key + '.png')
            if not os.path.exists(fp):
                continue
            fit = load_rgba(fp)
            a, b = fit_pair(cur, fit)
            v.update(score(a, b))
            pair_thumb(cur, fit).save(os.path.join(work, 'thumbs', key + '.png'))
    json.dump(state, open(state_path, 'w'))
    write_report(state)


def cmd_sheet(args):
    rep = json.load(open(REPORT))
    rows = [r for r in rep['decos'] if r['status'] == 'scored']
    if args.names:
        want = args.names.split(',')
        rows = [r for n in want for r in rows if r['name'] == n]
    else:
        rows = rows[args.skip:args.skip + args.top]
    thumbs = os.path.join(args.work, 'thumbs')
    cols = args.cols
    cw, ch = 606, 170 + 34
    sheet = Image.new('RGB', (cw * cols + 10 * (cols + 1), ch * math.ceil(len(rows) / cols) + 10), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    for i, r in enumerate(rows):
        x = 10 + (i % cols) * (cw + 10)
        y = 10 + (i // cols) * ch
        key = r['key']
        tp = os.path.join(thumbs, key + '.png')
        if os.path.exists(tp):
            sheet.paste(Image.open(tp), (x, y + 30))
        d.text((x, y + 2), f"#{r['rank']} {r['name']}  ({r['swf']})", fill=(255, 255, 255))
        d.text((x, y + 15), f"iou {r['iou']:.2f} miss {r['missing']:.2f} extra {r['extra']:.2f} col {r['colour']:.2f} "
                            f"trim {r['trim_iou']} fr {r['root_frames']}/{r['sprite_frames']} placed {r['placed']}",
               fill=(200, 200, 120))
    sheet.save(args.out)
    print(args.out, len(rows))


def export_svgs(work, tag, items, zoom, frame=1):
    """items [(key, swf)] -> {key: png}: FFDec's SVG frame export rasterised by Chromium (svg2png.mjs).
    FFDec's own raster path draws some gradients blocky and misses some bitmap-filled masks
    (kukubee paper art); its SVG path gets those right, so renders are made both ways and compared."""
    src = os.path.join(work, f'src-{tag}')
    out = os.path.join(work, f'svg-{tag}')
    png = os.path.join(work, f'svgpng-{tag}')
    for d in (out, png):
        shutil.rmtree(d, ignore_errors=True)
    link_batch(src, items)
    ffdec('-zoom', zoom, '-ignorebackground', '-select', frame, '-format', 'frame:svg', '-export', 'frame', out, src)
    subprocess.run(['node', os.path.join(HERE, 'svg2png.mjs'), out, png], cwd=SPIKE, capture_output=True, text=True)
    found = {k: os.path.join(png, k + '.png') for k, _ in items if os.path.exists(os.path.join(png, k + '.png'))}
    return found, [src, out, png]


def cmd_render(args):
    """Render each named deco both ways at the shipped PNG's resolution and size, report how well
    the two renders agree, and with --write --use raster|svg copy the chosen one over the PNG."""
    cands = swf_candidates()
    rep = {r['name']: r for r in json.load(open(REPORT))['decos']}
    work = args.work
    names = list(dict.fromkeys(args.names.split(',')))
    groups = collections.defaultdict(list)
    for n in names:
        swf = swf_path(rep[n]['swf'], work) if rep.get(n, {}).get('swf') else cands[n][0]
        png = os.path.join(DECOS, n + '.png')
        pw, ph = Image.open(png).size
        sw, sh = swfinfo.read(swf)['stage']
        zoom = max(2, math.ceil(max(pw / sw, ph / sh) * 1.0001)) if sw and sh else 2
        groups[zoom].append((n, swf, (pw, ph)))
    for d in ('raster', 'svg'):
        os.makedirs(os.path.join(work, 'rendered', d), exist_ok=True)
    log_path = os.path.join(work, 'render.json')
    log = json.load(open(log_path)) if os.path.exists(log_path) else {}
    for zoom, items in groups.items():
        found, src, out = export_frames(work, f'render-z{zoom}', [(n, s) for n, s, _ in items], zoom)
        svgs, tmp = export_svgs(work, f'render-z{zoom}', [(n, s) for n, s, _ in items], zoom)
        for n, swf, size in items:
            e = {'zoom': zoom, 'swf': rep.get(n, {}).get('swf'), 'size': list(size)}
            finals = {}
            for kind, got in (('raster', found), ('svg', svgs)):
                if n in got:
                    final = load_rgba(got[n]).resize(size, Image.LANCZOS)
                    final.save(os.path.join(work, 'rendered', kind, n + '.png'), optimize=True)
                    finals[kind] = final
            if len(finals) == 2:
                e['agree'] = score(*fit_pair(finals['svg'], finals['raster']))
            cur = load_rgba(os.path.join(DECOS, n + '.png'))
            for kind, final in finals.items():
                e['vs_png_' + kind] = score(*fit_pair(cur, final))['badness']
            log[n] = e
            print(n, zoom, sorted(finals), 'agree', e.get('agree', {}).get('badness'), flush=True)
        for d in [src, out] + tmp:
            shutil.rmtree(d, ignore_errors=True)
    json.dump(log, open(log_path, 'w'), indent=0)
    if args.write:
        for n in names:
            p = os.path.join(work, 'rendered', args.use, n + '.png')
            if not os.path.exists(p):
                print('MISSING', args.use, n)
                continue
            dest = os.path.join(DECOS, n + '.png')
            assert Image.open(p).size == Image.open(dest).size, n
            shutil.copyfile(p, dest)
            print('wrote', n, args.use, hashlib.sha256(open(p, 'rb').read()).hexdigest()[:12])


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('audit'); a.add_argument('--work', required=True); a.add_argument('--only'); a.add_argument('--batch', type=int, default=100)
    a.add_argument('--zoom', type=int, default=2)
    s = sub.add_parser('sheet'); s.add_argument('--work', required=True); s.add_argument('--out', required=True)
    s.add_argument('--top', type=int, default=60); s.add_argument('--skip', type=int, default=0); s.add_argument('--cols', type=int, default=3); s.add_argument('--names')
    r = sub.add_parser('render'); r.add_argument('--work', required=True); r.add_argument('--names', required=True); r.add_argument('--write', action='store_true')
    r.add_argument('--use', choices=('raster', 'svg'), default='svg')
    w = sub.add_parser('report'); w.add_argument('--work', required=True)
    q = sub.add_parser('rescore'); q.add_argument('--work', required=True); q.add_argument('--only')
    args = ap.parse_args()
    if args.cmd == 'audit':
        cmd_audit(args)
    elif args.cmd == 'sheet':
        cmd_sheet(args)
    elif args.cmd == 'render':
        cmd_render(args)
    elif args.cmd == 'rescore':
        cmd_rescore(args)
    elif args.cmd == 'report':
        write_report(json.load(open(os.path.join(args.work, 'scores.json'))))


if __name__ == '__main__':
    main()
