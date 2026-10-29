#!/usr/bin/env python3.11
"""Street decos the streets place but the game never shipped, recovered from Tiny Speck's SWFs (G431).

A deco the renderer cannot find in public/assets/decos/manifest.json (and that has no DECO_TWINS
stand-in, js/street-render.js) is skipped: whatever sat behind it shows through (G427: the sky
through the gaps of The Great Hole to Ix's dirt, because ug_exface3 was missing). Most of those
decos are embedded in the street bundles of tinyspeck/glitch-locations (CC0; FFDec reads the SWFs,
never runs them), the same bytes the client loaded (DecoByteLoader).

Source rule for the frame: the client shows a placed deco stopped on its first frame unless the
placement is flagged animated (DecoRenderer.as 301-305: MCUtil.recursiveGotoAndStop(decoAsset, 0),
else recursivePlay). The imported street JSON keeps no animated flag, so frame 1 is what the
streets drew; multi-frame SWFs are listed in recovered.json (root_frames / sprite_frames).

Which copy: the bundle that places the deco most (tools/deco-audit placements), else any bundle,
else source/<set>/<name>.swf. Copies in other bundles that differ are listed as variants.

Output: assets-src/decos/groddle/<name>.png, FFDec frame 1 at zoom 2 (the 2x size every source PNG
has: the stage at 2 px per world px), the manifest entry, and the row in recovered.json. Then
tools/deco-audit scores it (audit --only) and build.py / sharp.py make the shipped files as for
every other deco.

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21):
  python3.11 -I tools/deco-pipeline/recover.py --list                 (what is missing, and from where)
  python3.11 -I tools/deco-pipeline/recover.py --work <scratch> [--only a,b] [--batch 40]
  python3.11 -I tools/deco-pipeline/recover.py --check                (no rendering; exit 1 on any problem)
Then, for the recovered names:
  python3.11 -I tools/deco-pipeline/recover.py --audit --work <scratch>   (scores them into report.json)
  python3.11 -I tools/deco-pipeline/build.py --work <scratch> --only <names>
  python3.11 -I tools/deco-pipeline/sharp.py --work <scratch> --only <names>   (those --measure lists)
"""
import argparse, collections, hashlib, json, os, shutil, sys, time, types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # no __pycache__ in tools/
sys.path.insert(0, HERE)
import build  # noqa: E402
import sharp  # noqa: E402
audit = build.audit

SRC = build.SRC
MANIFEST = build.MANIFEST
PUBLIC = build.PUBLIC
RECOVERED = os.path.join(HERE, 'recovered.json')
MISSING_JSON = os.path.join(PUBLIC, 'assets', 'streets', 'missing-decos.json')
MISSING_TXT = os.path.join(PUBLIC, 'assets', 'decos', '_missing_now.txt')
ZOOM = 2

# Left missing on purpose (each still listed in missing-decos.json):
HELD = {
    # Every source placement is flagged animated (location XML <bool id="animated">), which the
    # imported street JSON dropped and the renderer cannot play yet: no still frame was ever shown.
    'bubble_test': 'animated on all 6 placements (270-frame rising bubbles); frame 1 is a faint blob',
    'stars_fade': 'animated on 8 of 9 placements (a 30-frame twinkle); frame 1 is empty',
    # A photograph of a real person, a designer placeholder on the dev street unnnn only.
    'rook_hall_placeholder_painting': 'a photo of a real person (placeholder on unnnn); a product call',
}


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def read_json(path, default):
    return json.load(open(path)) if os.path.exists(path) else default


def missing_now(place, manifest, twins):
    """Placed sprites the renderer cannot draw (not shipped, no shipped twin)."""
    have = set(manifest)
    return sorted(n for n in place if n not in have and twins.get(n) not in have)


def sources(n, place, index, cands):
    """[(label, kind)] for n: placing bundles first (most placements first), other bundles, source/."""
    used = [b for b in (place.get(n) or {}).get('bundles', {}) if b != 'None']
    rest = sorted(b for b, names in index.items() if n in names and b not in used)
    out = [(b, 'bundle') for b in used + rest]
    out += [(p, 'source') for p in cands.get(n, [])]
    return out


def swf_for(work, src, n, index):
    label, kind = src
    return audit.bundled_swf(work, label, n, index) if kind == 'bundle' else label


def cmd_list(args):
    place = audit.placements()
    index = audit.bundle_index()
    cands = audit.swf_candidates()
    miss = missing_now(place, json.load(open(MANIFEST)), sharp.deco_twins())
    rows = []
    for n in miss:
        srcs = sources(n, place, index, cands)
        p = place[n]
        rows.append({'name': n, 'placed': p['count'], 'streets': p['streets'], 'held': HELD.get(n),
                     'source': (srcs[0][1] + ':' + os.path.basename(srcs[0][0])) if srcs else None,
                     'example': p['example']})
    rows.sort(key=lambda r: (-r['streets'], -r['placed'], r['name']))
    have = [r for r in rows if r['source']]
    none = [r for r in rows if not r['source']]
    if args.json:
        json.dump({'missing': rows}, open(args.json, 'w'), indent=1)
    print(f'{len(rows)} placed decos missing: {len(have)} with a SWF, {len(none)} with none')
    for r in rows[: args.top]:
        print(f"  {r['name']:44s} {r['streets']:4d} streets {r['placed']:5d} placed  {r['source'] or '-'}")
    if none:
        print('no source:', ', '.join(r['name'] for r in none))
    return rows


def cmd_recover(args):
    work = args.work
    os.makedirs(work, exist_ok=True)
    place = audit.placements()
    index = audit.bundle_index()
    cands = audit.swf_candidates()
    manifest = json.load(open(MANIFEST))
    twins = sharp.deco_twins()
    miss = missing_now(place, manifest, twins)
    if args.only:
        only = set(args.only.split(','))
        miss = [n for n in miss if n in only]
    miss = [n for n in miss if n not in HELD]
    rec = read_json(RECOVERED, {'about': 'G431: decos recovered by tools/deco-pipeline/recover.py', 'decos': {}})
    todo = []
    for n in miss:
        srcs = sources(n, place, index, cands)
        if not srcs:
            continue
        chosen = srcs[0]
        swf = swf_for(work, chosen, n, index)
        others = []
        mine = sha(swf)
        for s in srcs[1:]:
            o = swf_for(work, s, n, index)
            if sha(o) != mine:
                others.append(os.path.basename(s[0]))
        root, longest = audit.swf_frames(swf)
        info = audit.swfinfo.read(swf)
        todo.append((n, swf, {
            'swf': audit.swf_label(swf, work), 'swf_sha': mine[:16], 'stage': info['stage'],
            'root_frames': root, 'sprite_frames': longest, 'frame': 1,
            'variants_differ': others, 'placed': place[n]['count'], 'streets': place[n]['streets'],
        }))
    print(f'{len(todo)} decos to recover', flush=True)
    done = []
    for i in range(0, len(todo), args.batch):
        chunk = todo[i:i + args.batch]
        while os.getloadavg()[0] > args.max_load:
            print(f'  load {os.getloadavg()[0]:.0f}: waiting', flush=True)
            time.sleep(30)
        t0 = time.time()
        found, src, out = audit.export_frames(work, 'recover', [(n, swf) for n, swf, _ in chunk], ZOOM)
        for n, swf, row in chunk:
            if n not in found:
                print(f'  {n}: FFDec gave no frame', flush=True)
                continue
            dest = os.path.join(SRC, n + '.png')
            shutil.copyfile(found[n], dest)
            row['png'] = build.png_size(dest)
            row['png_sha'] = sha(dest)[:16]
            rec['decos'][n] = row
            done.append(n)
        shutil.rmtree(src, ignore_errors=True)
        shutil.rmtree(out, ignore_errors=True)
        print(f'  {min(i + args.batch, len(todo))}/{len(todo)}  {time.time() - t0:.0f}s', flush=True)
    rec['decos'] = dict(sorted(rec['decos'].items()))
    json.dump(rec, open(RECOVERED, 'w'), indent=1)
    open(RECOVERED, 'a').write('\n')
    write_manifest(sorted(set(manifest) | set(done)))
    write_missing(place)
    print(f'recovered {len(done)}; names: {",".join(done)}')


def write_manifest(names):
    raw = open(MANIFEST).read()
    open(MANIFEST, 'w').write(json.dumps(names, indent=2) + ('\n' if raw.endswith('\n') else ''))


def write_missing(place=None):
    """missing-decos.json and _missing_now.txt from the streets as they are now."""
    place = place or audit.placements()
    manifest = json.load(open(MANIFEST))
    miss = missing_now(place, manifest, sharp.deco_twins())
    inv = read_json(MISSING_JSON, {})
    raw = open(MISSING_JSON).read() if os.path.exists(MISSING_JSON) else ''
    inv.update({'referenced': len(place), 'present': len(place) - len(miss), 'missingCount': len(miss), 'missing': miss})
    open(MISSING_JSON, 'w').write(json.dumps(inv, indent=2) + ('\n' if raw.endswith('\n') or not raw else ''))
    open(MISSING_TXT, 'w').write('\n'.join(miss) + '\n')


def cmd_audit(args):
    """Score the recovered decos (tools/deco-audit audit --only) and merge their rows into report.json."""
    rec = read_json(RECOVERED, {'decos': {}})['decos']
    names = sorted(n for n in rec if os.path.exists(os.path.join(SRC, n + '.png')))
    real = audit.REPORT
    tmp = os.path.join(args.work, 'report-recovered.json')
    audit.REPORT = tmp
    try:
        audit.cmd_audit(types.SimpleNamespace(work=os.path.join(args.work, 'audit'), only=','.join(names),
                                              batch=args.batch, zoom=2))
    finally:
        audit.REPORT = real
    new = {r['name']: r for r in json.load(open(tmp))['decos'] if r['name'] in set(names)}
    rep = json.load(open(real))
    rows = [r for r in rep['decos'] if r['name'] not in new]
    top = max((r.get('rank', 0) for r in rows), default=0)
    for i, n in enumerate(names):
        r = new[n]
        r['rank'] = top + 1 + i
        rows.append(r)
    rep['decos'] = rows
    rep['summary'] = dict(collections.Counter(r['status'] for r in rows))
    audit.dump_report(rep)
    bad = [n for n in names if new[n].get('status') != 'scored' or (new[n].get('badness') or 0) > 0.05]
    print(f'merged {len(names)} rows; summary {rep["summary"]}; not a clean score: {bad}')


def cmd_check(args):
    problems = []
    rec = read_json(RECOVERED, {'decos': {}})['decos']
    manifest = set(json.load(open(MANIFEST)))
    report = {r['name']: r for r in json.load(open(audit.REPORT))['decos']}
    for n, row in rec.items():
        png = os.path.join(SRC, n + '.png')
        if n not in manifest:
            problems.append(f'{n}: recovered but not in manifest.json')
        if not os.path.exists(png):
            problems.append(f'{n}: no source PNG')
        elif sha(png)[:16] != row.get('png_sha'):
            problems.append(f'{n}: source PNG differs from the recovered render')
        if n not in report:
            problems.append(f'{n}: not scored in tools/deco-audit/report.json')
        if not os.path.exists(os.path.join(build.OUT, n + '.webp')):
            problems.append(f'{n}: no {n}.webp (run build.py --only)')
    place = audit.placements()
    miss = missing_now(place, sorted(manifest), sharp.deco_twins())
    inv = read_json(MISSING_JSON, {})
    if inv.get('missing') != miss:
        problems.append('missing-decos.json is stale (run --write-missing)')
    txt = [l for l in open(MISSING_TXT).read().split('\n') if l] if os.path.exists(MISSING_TXT) else []
    if txt != miss:
        problems.append('_missing_now.txt is stale (run --write-missing)')
    index = audit.bundle_index()
    cands = audit.swf_candidates()
    left = [n for n in miss if n not in HELD and sources(n, place, index, cands)]
    for n in HELD:
        if n in manifest or n in rec:
            problems.append(f'{n}: held ({HELD[n]}) but shipped')
    if left:
        problems.append(f'{len(left)} missing decos still have a SWF: {", ".join(left[:12])}')
    for p in problems:
        print(p)
    held = [n for n in miss if n in HELD]
    print(f'{len(rec)} recovered, {len(miss)} still missing ({len(held)} held, {len(miss) - len(held)} with no SWF); {len(problems)} problems')
    return 1 if problems else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--json')
    ap.add_argument('--top', type=int, default=40)
    ap.add_argument('--work')
    ap.add_argument('--only')
    ap.add_argument('--batch', type=int, default=40)
    ap.add_argument('--max-load', type=float, default=40)
    ap.add_argument('--audit', action='store_true')
    ap.add_argument('--write-missing', action='store_true')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    if args.check:
        sys.exit(cmd_check(args))
    if args.list:
        cmd_list(args)
        return
    if args.write_missing:
        write_missing()
        return
    if not args.work:
        ap.error('--work is required')
    if args.audit:
        cmd_audit(args)
    else:
        cmd_recover(args)


if __name__ == '__main__':
    main()
