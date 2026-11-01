#!/usr/bin/env python3.11
"""House door decos without the For Sale sign, and the For Sale art for houses that are for sale
(Austin 2026-11-01: "I can't imagine the for sale being shown on them").

Tiny Speck's POL house decos (pol_ext_meadow.swf door_asset_house_{large,medium,small}_0N, CC0)
carry a `sign` MovieClip on their root timeline, a wooden "For Sale" board on a post at the left of
the house. The client showed it only for a house that was for sale: DoorView.as 50-56 and 228-232
(`if (_door.for_sale) showSign(); else hideSign();`, `_decoAsset.sign.visible = false`), the
server's door `for_sale` flag (location.js 2313/2436, inc_pols.js pols_is_for_sale). A static
render, and the Children of Ur PNG exports the game shipped before, show it on every house, so the
player's own house on their home street, the neighbours' houses and every owned house on a public
street all looked for sale.

This tool:
1. renders each such deco's SWF twice (as it is, and with the sign dropped: build.py
   default_state / swfinfo.drop_root_places), and takes the sign's pixels from the difference;
2. writes a sign-free copy of the deco's source PNG to assets-src/decos/door-signs/<deco>.png:
   the old PNG, with the sign's pixels (grown 3 px, feathered 1 px) taken from the sign-free
   render, aligned onto the PNG (several kept PNGs sit a few px off the SWF stage, so the offset
   is measured: alpha bounding boxes, then the best colour match within 4 px). Nothing else in
   the PNG changes, so the art keeps its size, registration and anchor;
3. runs build.py on those decos: build.py renders the SWFs without the sign (HIDDEN_BY_DEFAULT)
   and compares/keeps against the sign-free sources, so the shipped <deco>.webp and
   <deco>@1.5x.webp are the not-for-sale houses at the same tiers as before;
4. writes the For Sale art, the deco as it was (the SWF render with its sign, or the old PNG for
   decos kept as their PNG), to public/assets/decos/door-signs/<deco>__forsale.webp, or
   <deco>__forsale@1.5x.webp for decos with a 3x file: one file per deco, its best tier (a door is
   drawn at its own rect, about 9 texels per world pixel). js/door-sign-art.js lists them and
   features/doors-feature.js draws a door with `for_sale` (public POL streets) from it.
The house `plate` stays blank (showNumber writes digits on it only for a numbered door; the
remake labels numbered doors with its own plate). These decos have no keyholes (no showLock).

door-signs.json records, per deco, its inputs, the measured offset, the sign's box in the 2x
art, and the check: the shipped house and its For Sale art must differ inside the sign's box
(`sign_diff`) and agree outside it (`rest_diff`).

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp 1.6):
  python3.11 -I tools/deco-pipeline/door-signs.py --work <scratch dir> [--force]
  python3.11 -I tools/deco-pipeline/door-signs.py --check     (no rendering; exit 1 on any problem)
"""
import argparse, json, os, shutil, subprocess, sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ in tools/
sys.path.insert(0, HERE)
import build  # noqa: E402  (paths, FFDec, default_state, stage_resample, encode)
audit = build.audit
swfinfo = build.swfinfo

OUT = os.path.join(build.PUBLIC, 'assets', 'decos', 'door-signs')
STATE_SRC = build.STATE_SRC
PLAN = os.path.join(HERE, 'door-signs.json')
JS = os.path.join(build.PUBLIC, 'js', 'door-sign-art.js')
VERSION = 1
GROW = 3            # px the sign's pixels are grown by before the sign-free render replaces them
SIGN_MIN = 20.0     # check: mean premultiplied difference inside the sign's box, at least
REST_MAX = 1.5      # check: mean premultiplied difference outside it, at most


def sign_decos(work, index=None):
    """{deco: original SWF path} for manifest decos whose SWF places a `sign` on its root timeline."""
    plan = build.read_plan()['decos']
    index = index or audit.bundle_index()
    out = {}
    for n in json.load(open(build.MANIFEST)):
        label = (plan.get(n) or {}).get('swf')
        if not label:
            continue
        b = label[len('bundle:'):].split('#')[0] if label.startswith('bundle:') else None
        if b and n not in index.get(b, {}):
            continue
        swf = audit.swf_path(label, work, index)
        if 'sign' in swfinfo.root_names(swf):
            out[n] = swf
    return out


def file_name(deco, hires):
    return f'{deco}__forsale{"@1.5x" if hires else ""}.webp'


# ---------- images ----------

def arr(img):
    return np.asarray(img, dtype=np.float32)


def shift(x, dx, dy):
    """x moved right dx and down dy, zero fill."""
    out = np.zeros_like(x)
    h, w = x.shape[:2]
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = x[ys, xs]
    return out


def bbox(alpha, cut=8):
    ys, xs = np.nonzero(alpha > cut)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def align(src, img, r=4):
    """(dx, dy) that moves img onto src: alpha boxes first, then the best premultiplied match."""
    a, b = bbox(arr(src)[..., 3]), bbox(arr(img)[..., 3])
    gx, gy = round((a[0] - b[0] + a[2] - b[2]) / 2), round((a[1] - b[1] + a[3] - b[3]) / 2)
    ps, pi = build.premult(src), build.premult(img)
    best, at = None, (gx, gy)
    for dy in range(gy - r, gy + r + 1):
        for dx in range(gx - r, gx + r + 1):
            e = float(np.abs(ps - shift(pi, dx, dy)).mean())
            if best is None or e < best - 1e-6:
                best, at = e, (dx, dy)
    return list(at)


def grow(m, n):
    out = m.copy()
    for _ in range(n):
        g = out.copy()
        g[1:] |= out[:-1]; g[:-1] |= out[1:]; g[:, 1:] |= out[:, :-1]; g[:, :-1] |= out[:, 1:]
        out = g
    return out


def feather(m):
    f = m.astype(np.float32)
    p = np.pad(f, 1, mode='edge')
    return sum(p[y:y + f.shape[0], x:x + f.shape[1]] for y in range(3) for x in range(3)) / 9


def unpremult(p):
    a = p[..., 3:4]
    rgb = np.where(a > 0, p[..., :3] * 255 / np.maximum(a, 1e-6), 0)
    return Image.fromarray(np.clip(np.concatenate([rgb, a], axis=2) + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def region_diffs(plain, sale, box):
    """Mean premultiplied difference inside box (x0, y0, x1, y1) and outside it."""
    d = np.abs(build.premult(plain) - build.premult(sale)).mean(axis=2)
    inside = np.zeros(d.shape, bool)
    x0, y0, x1, y1 = box
    inside[y0:y1 + 1, x0:x1 + 1] = True
    return round(float(d[inside].mean()), 2), round(float(d[~inside].mean()), 3)


def sale_at_2x(path, size2):
    im = build.decode_webp(path)
    return im if list(im.size) == list(size2) else im.resize(tuple(size2), Image.LANCZOS)


# ---------- plan + runtime list ----------

def read_plan():
    if os.path.exists(PLAN):
        return json.load(open(PLAN))
    return {'version': VERSION, 'decos': {}}


def js_text(plan):
    art = {d: r['forsale'] for d, r in sorted(plan['decos'].items())}
    lines = [
        '/**',
        ' * Generated by tools/deco-pipeline/door-signs.py: the POL house decos as they look when the',
        " * house is for sale, with the deco's `sign` showing (DoorView.as 228-232 shows it only for",
        ' * `_door.for_sale`). The plain decos in assets/decos/groddle have no sign. Do not edit.',
        ' */',
        f'export const DOOR_SALE_ART = Object.freeze({json.dumps(art, separators=(",", ":"))});',
        '',
        '/** The For Sale file for a door of `deco`, or null (draw the plain deco). */',
        'export function doorSaleArt(deco) {',
        '  const f = DOOR_SALE_ART[deco];',
        '  return f ? `assets/decos/door-signs/${f}` : null;',
        '}',
        '',
    ]
    return '\n'.join(lines)


def write_plan(plan):
    with open(PLAN, 'w') as f:
        json.dump(plan, f, indent=1, sort_keys=True)
        f.write('\n')
    with open(JS, 'w') as f:
        f.write(js_text(plan))


# ---------- build ----------

def cmd_build(args):
    work = os.path.abspath(args.work)
    os.makedirs(work, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(STATE_SRC, exist_ok=True)
    index = audit.bundle_index()
    decos = sign_decos(work, index)
    deco_plan = build.read_plan()['decos']
    plan = read_plan()
    plan['version'] = VERSION
    rows = {}
    todo = []
    for n, swf in decos.items():
        prev = plan['decos'].get(n) or {}
        src = os.path.join(build.SRC, n + '.png')
        key = {'swf_sha': build.sha(swf)[:16], 'src_sha': build.sha(src)[:16]}
        if (not args.force and all(prev.get(k) == v for k, v in key.items())
                and os.path.exists(os.path.join(STATE_SRC, n + '.png'))
                and build.sha(os.path.join(STATE_SRC, n + '.png'))[:16] == prev.get('nosign_sha')):
            rows[n] = prev
            continue
        todo.append((n, swf, key))
    # 1-2: sign-free sources.
    if todo:
        items = []
        for n, swf, _ in todo:
            free, hidden = build.default_state(swf, work)
            assert hidden == ['sign'], (n, hidden)
            items += [(n + '__sign', swf), (n + '__free', free)]
        zoom = build.SETTINGS['zoom']
        found, tmp = build.render_batch(work, zoom, items)
        for n, swf, key in todo:
            r = deco_plan[n]
            if n + '__sign' not in found or n + '__free' not in found:
                raise SystemExit(f'{n}: FFDec produced no frame')
            src = build.load(os.path.join(build.SRC, n + '.png'))
            size2 = list(src.size)
            with2 = build.stage_resample(build.load(found[n + '__sign']), r['stage'], zoom, size2)
            free2 = build.stage_resample(build.load(found[n + '__free']), r['stage'], zoom, size2)
            sign = np.abs(build.premult(with2) - build.premult(free2)).max(axis=2) > 4
            dx, dy = align(src, with2)
            core = shift(sign, dx, dy)
            m = feather(grow(core, GROW))[..., None]
            out = build.premult(src) * (1 - m) + shift(build.premult(free2), dx, dy) * m
            dst = os.path.join(STATE_SRC, n + '.png')
            unpremult(out).save(dst, optimize=True)
            x0, y0, x1, y1 = bbox(core.astype(np.float32) * 255, 0)
            rows[n] = {**key, 'offset': [dx, dy], 'sign_box': [x0, y0, x1, y1], 'size2': size2,
                       'nosign_sha': build.sha(dst)[:16]}
            print(f'{n}: offset {dx},{dy}, sign {x1 - x0 + 1}x{y1 - y0 + 1} at {x0},{y0}', flush=True)
        for p in tmp:
            shutil.rmtree(p, ignore_errors=True)
    # 3: the shipped plain decos, without the sign.
    names = sorted(decos)
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'build.py'), '--work', work, '--only', ','.join(names)], check=True)
    deco_plan = build.read_plan()['decos']
    # 4: the For Sale art, at each deco's best tier.
    renders, tmps, zooms = {}, [], {}
    for n in names:
        if deco_plan[n]['mode'] == 'swf':
            zooms.setdefault(deco_plan[n].get('zoom') or build.SETTINGS['zoom'], []).append(n)
    for zoom, ns in zooms.items():
        found, tmp = build.render_batch(work, zoom, [(n, decos[n]) for n in ns])
        for n in ns:
            r = deco_plan[n]
            renders[n] = build.stage_resample(build.load(found[n]), r['stage'], zoom, r['size3'] if r.get('hires') else r['size2'])
        tmps += tmp
    keep = set()
    for n in names:
        r = deco_plan[n]
        img = renders[n] if n in renders else build.load(os.path.join(build.SRC, n + '.png'))
        f = file_name(n, bool(r.get('hires')) and n in renders)
        dst = os.path.join(OUT, f)
        nbytes, lossless, err = build.encode(img, dst, os.path.join(work, 'enc'))
        keep.add(f)
        plain = build.decode_webp(os.path.join(build.OUT, n + '.webp'))
        sd, rd = region_diffs(plain, sale_at_2x(dst, rows[n]['size2']), rows[n]['sign_box'])
        rows[n].update(forsale=f, forsale_sha=build.sha(dst)[:16], forsale_bytes=nbytes,
                       forsale_lossless=lossless, plain_sha=r['sha2'], sign_diff=sd, rest_diff=rd)
        print(f'{n}: for sale {f} {nbytes} bytes; sign diff {sd}, rest {rd}', flush=True)
    for p in tmps:
        shutil.rmtree(p, ignore_errors=True)
    for f in os.listdir(OUT):
        if f not in keep:
            os.remove(os.path.join(OUT, f))
    plan['decos'] = rows
    write_plan(plan)
    print(f'{len(rows)} house decos without their sign; {len(keep)} For Sale files')
    return 0


# ---------- check ----------

def cmd_check(args):
    import tempfile
    work = args.work or tempfile.mkdtemp(prefix='door-signs-check-')
    bad = []
    plan = read_plan()
    deco_plan = build.read_plan()['decos']
    decos = sign_decos(work)
    if set(decos) != set(plan['decos']):
        bad.append(f'decos with a sign {sorted(decos)} != door-signs.json {sorted(plan["decos"])}')
    for n, r in plan['decos'].items():
        if n not in decos:
            continue
        if build.sha(decos[n])[:16] != r['swf_sha']:
            bad.append(f'{n}: SWF changed (run --work)')
        if build.sha(os.path.join(build.SRC, n + '.png'))[:16] != r['src_sha']:
            bad.append(f'{n}: source PNG changed (run --work)')
        ns = os.path.join(STATE_SRC, n + '.png')
        if not os.path.exists(ns) or build.sha(ns)[:16] != r['nosign_sha']:
            bad.append(f'{n}: sign-free source missing or changed')
        row = deco_plan.get(n) or {}
        if row.get('hidden') != ['sign']:
            bad.append(f'{n}: plan.json row does not hide the sign (build.py)')
        if row.get('src_sha') != r['nosign_sha']:
            bad.append(f'{n}: plan.json row was not built from the sign-free source')
        plain_p = os.path.join(build.OUT, n + '.webp')
        if not os.path.exists(plain_p) or build.sha(plain_p)[:16] != r['plain_sha']:
            bad.append(f'{n}: shipped {n}.webp is not the one measured here (run --work)')
            continue
        f = os.path.join(OUT, r['forsale'])
        if r['forsale'] != file_name(n, r['forsale'].endswith('@1.5x.webp')) or \
                (r['forsale'].endswith('@1.5x.webp') and not row.get('hires')):
            bad.append(f'{n}: For Sale file {r["forsale"]} does not match the deco tier')
        if not os.path.exists(f) or build.sha(f)[:16] != r['forsale_sha']:
            bad.append(f'{n}: {r["forsale"]} missing or changed')
            continue
        # The pixel check: no sale sign on the house, and nothing else moved.
        sd, rd = region_diffs(build.decode_webp(plain_p), sale_at_2x(f, r['size2']), r['sign_box'])
        if sd < SIGN_MIN:
            bad.append(f'{n}: the shipped house still looks like its For Sale art inside the sign box ({sd})')
        if rd > REST_MAX:
            bad.append(f'{n}: the shipped house differs from its For Sale art outside the sign ({rd})')
        if [sd, rd] != [r['sign_diff'], r['rest_diff']]:
            bad.append(f'{n}: measured {sd}/{rd}, door-signs.json has {r["sign_diff"]}/{r["rest_diff"]}')
    shipped = set(os.listdir(OUT)) if os.path.isdir(OUT) else set()
    want = {r['forsale'] for r in plan['decos'].values()}
    for f in sorted(shipped - want):
        bad.append(f'{f}: stray file in assets/decos/door-signs')
    if not os.path.exists(JS) or open(JS).read() != js_text(plan):
        bad.append(f'{JS}: stale (run --work)')
    if not args.work:
        shutil.rmtree(work, ignore_errors=True)
    for b in bad:
        print('  ' + b)
    print(f'door-signs check: {len(plan["decos"])} decos, {len(bad)} problems')
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    if a.check:
        return cmd_check(a)
    if not a.work:
        ap.error('--work <scratch dir> or --check')
    return cmd_build(a)


if __name__ == '__main__':
    sys.exit(main())
