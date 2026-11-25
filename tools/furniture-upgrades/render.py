"""Render the furniture upgrade SWFs in plan.json (tools/furniture-upgrades/build.mjs) to WebP.

    python3 -I tools/furniture-upgrades/render.py [--work DIR] [--force] [key ...]

Each SWF (glitch-items, CC0) is rewritten with a stage three times its size
(tools/icon-hires/swfinfo.rewrite: furniture art runs past its authored stage),
then FFDec (Java 21, -ignorebackground) exports frame 1 at zoom 3 (G448; zoom 2
until then, soft on a 3.3x Retina backing store), one JVM per batch. The render is trimmed to the art: the game draws a piece with the
bottom centre of that box on its foot point (ceiling pieces: the top centre),
which is how the recovered base frames sit (a base SWF at zoom 1 trims to its
OGA x1 frame exactly). The canvas is padded to sides a multiple of 3 so the 1x
size is whole, and written as public/assets/sprites/furniture/upgrades/<class>/<id>@3x.webp
(js/textures.js reads the 3 from the name, so the sprite keeps its 1x size)
(cwebp, quality 88, sharp_yuv, lossless alpha). art.json records each key's
1x size and the SWF's hash; unchanged keys are skipped unless --force.

`foot` (1x) is how far the art's bottom sits above the SWF stage's bottom
centre, the point the original placed a piece by (LocationItemstackView.as
_positionViewDO 853-854) and measured its catalog plats from: the trimmed art
loses it, so js/home-decor.js surfaceHeight takes it off a plat (the Basic Wooden
Shelf's plat is 52 over the stage bottom, its art ends 24 px above it, so things
rest 28 px up its 49 px art, on the plank). Each render records it; to measure
it again without writing art:

    python3 -I tools/furniture-upgrades/render.py --feet [--work DIR]

It is measured at ZOOM, from the same trim (and group crop) as the art, never
at zoom 1: FFDec draws a filter (a drop shadow, a glow) the same number of
device pixels at any zoom, so at zoom 1 a blurred shadow reaches further below
the plank than in the zoom-3 art. The Firebog Shelf trims 4 px taller at zoom 1
and its foot read -1 for art whose bottom is 2 px over the stage bottom, so
things on it stood 3 px behind its plat (#669, shelfk 2026-11-25).

The plain pieces (no upgrade) draw their recovered OGA frame, which is the base
SWF's frame 1 trimmed (glitch-items/furniture/furniture_base/<class>/<class>.swf,
bag_furniture_cabinet_base/ for the storage cabinets). Their feet go in
base.json, for every class build-homes.mjs gives a surface, with the trimmed
SWF size (the Fireplace's OGA frame is drawn about five times the SWF's size,
so build-homes scales by art height over SWF height):

    python3 -I tools/furniture-upgrades/render.py --base [--work DIR] [class ...]

A plan entry may carry `parts` ({placed class: class}, the SWF's exported
symbol names) and `group`. `parts` swaps what the SWF places before it is
rendered, for art whose look the client picks at runtime: a Door style places
door_up and its config shows door_down or door_up_job instead (G1137,
items/furniture_door.js getDefaultUpgradeConfig). Keys sharing a `group` are
rendered in one batch and cropped to the union of their art, so a Door keeps
its place when its role changes.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.normpath(os.path.join(HERE, '../..'))
sys.path.insert(0, os.path.join(SPIKE, 'tools/icon-hires'))
import swfinfo  # noqa: E402

PLAN = os.path.join(HERE, 'plan.json')
ART = os.path.join(HERE, 'art.json')
OUT = os.path.join(SPIKE, 'public/assets/sprites/furniture/upgrades')
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from java_path import JAVA  # noqa: E402  (tools/java_path.py: $GRODDLE_JAVA, else the first Homebrew JDK)
FFDEC = os.path.expanduser('~/Documents/glitch-audit/tools/ffdec/ffdec.jar')
ZOOM = 3
BATCH = 80


def symbol_ids(path):
    """Exported class name -> character id (the SWF's SymbolClass tags)."""
    body = swfinfo.swf_body(path)[0]
    out = {}
    for code, q, ln in swfinfo.tags(body, swfinfo.rect_len(body) + 4, len(body)):
        if code != 76:
            continue
        n = int.from_bytes(body[q:q + 2], 'little')
        p = q + 2
        for _ in range(n):
            cid = int.from_bytes(body[p:p + 2], 'little')
            p += 2
            e = body.index(0, p)
            out[body[p:e].decode('latin1')] = cid
            p = e + 1
    return out


def swaps_for(src, parts):
    """`parts` ({class: class}) as character ids for swfinfo.rewrite, or None."""
    if not parts:
        return None
    ids = symbol_ids(src)
    return {ids[a]: ids[b] for a, b in parts.items()}


def batches(todo, plan):
    """BATCH-sized runs of `todo` that never split a `group`."""
    out, cur, last = [], [], None
    for row in todo:
        group = plan[row[0]].get('group')
        if len(cur) >= BATCH and (group is None or group != last):
            out.append(cur)
            cur = []
        cur.append(row)
        last = group
    if cur:
        out.append(cur)
    return out


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def trim_box(path):
    out = subprocess.run(['magick', path, '-format', '%@', 'info:'], capture_output=True, text=True).stdout.strip()
    w, rest = out.split('x', 1)
    h, x, y = rest.replace('+', ' ').split()
    return int(w), int(h), int(x), int(y)


def foot_of(info, y, h, zoom):
    """Stage bottom minus art bottom at 1x: swfinfo.rewrite pads the stage by its own size on every side."""
    x0, x1, y0, y1 = info['rect']
    return round(((y1 - y0) * 2 * zoom - (y + h)) / zoom)


def crops(batch, plan, out_dir, names):
    """{key: (w, h, x, y)}: each render's trim at ZOOM, a `group`'s keys cropped to the union of their art."""
    boxes = {}
    for key in batch:
        png = os.path.join(out_dir, names[key], '1.png')
        if os.path.exists(png):
            boxes[key] = trim_box(png)
    union = {}
    for key, (w, h, x, y) in boxes.items():
        group = plan[key].get('group')
        if group is None:
            continue
        l, t, r, btm = union.get(group, (x, y, x + w, y + h))
        union[group] = (min(l, x), min(t, y), max(r, x + w), max(btm, y + h))
    for key, (w, h, x, y) in list(boxes.items()):
        group = plan[key].get('group')
        if group in union:
            l, t, r, btm = union[group]
            boxes[key] = (r - l, btm - t, l, t)
    return boxes


def feet(art, work):
    """Render every key at ZOOM, as its art was, to measure its foot (no art is written)."""
    plan = json.load(open(PLAN))
    todo = [(key,) for key in sorted(art) if key in plan]
    done = 0
    for b, batch in enumerate(batches(todo, plan)):
        keys = [row[0] for row in batch]
        src_dir = os.path.join(work, f'fsrc{b}')
        out_dir = os.path.join(work, f'fout{b}')
        os.makedirs(src_dir, exist_ok=True)
        names, infos = {}, {}
        for key in keys:
            src = os.path.expanduser(plan[key]['swf'])
            names[key] = key.replace('/', '__') + '.swf'
            infos[key] = swfinfo.read(src)
            swfinfo.rewrite(src, os.path.join(src_dir, names[key]), pad=1.0, swaps=swaps_for(src, plan[key].get('parts')))
        subprocess.run([JAVA, '-Djava.awt.headless=true', '-jar', FFDEC, '-zoom', str(ZOOM), '-ignorebackground',
                        '-select', '1', '-format', 'frame:png', '-export', 'frame', out_dir, src_dir],
                       capture_output=True, text=True)
        for key, (w, h, x, y) in crops(keys, plan, out_dir, names).items():
            if (w + (-w % ZOOM)) // ZOOM != art[key]['w'] or (h + (-h % ZOOM)) // ZOOM != art[key]['h']:
                print(f'  {key}: renders {w}x{h} at {ZOOM}x, its art is {art[key]["w"]}x{art[key]["h"]}: render it again')
                continue
            art[key]['foot'] = foot_of(infos[key], y, h, ZOOM)
        shutil.rmtree(src_dir, ignore_errors=True)
        shutil.rmtree(out_dir, ignore_errors=True)
        done += len(keys)
        print(f'  {done}/{len(todo)}')


BASE = os.path.join(HERE, 'base.json')
FURNITURE = os.path.expanduser('~/Documents/glitch-audit/glitch-items/furniture')


def base_swf(cls):
    for sub in ('furniture_base', 'bag_furniture_cabinet_base'):
        path = os.path.join(FURNITURE, sub, cls, cls + '.swf')
        if os.path.exists(path):
            return path
    return None


def base_feet(classes, work):
    """Render each plain piece's base SWF at zoom 1: its trimmed size and foot, into base.json."""
    base = json.load(open(BASE)) if os.path.exists(BASE) else {}
    classes = classes or sorted(base)
    src_dir = os.path.join(work, 'bsrc')
    out_dir = os.path.join(work, 'bout')
    os.makedirs(src_dir, exist_ok=True)
    infos = {}
    for cls in classes:
        src = base_swf(cls)
        if not src:
            print('  no base SWF', cls)
            continue
        infos[cls] = (src, swfinfo.read(src))
        swfinfo.rewrite(src, os.path.join(src_dir, cls + '.swf'), pad=1.0)
    subprocess.run([JAVA, '-Djava.awt.headless=true', '-jar', FFDEC, '-zoom', '1', '-ignorebackground',
                    '-select', '1', '-format', 'frame:png', '-export', 'frame', out_dir, src_dir],
                   capture_output=True, text=True)
    for cls, (src, info) in infos.items():
        png = os.path.join(out_dir, cls + '.swf', '1.png')
        if not os.path.exists(png):
            print('  no render', cls)
            continue
        w, h, x, y = trim_box(png)
        row = base.get(cls, {})
        row.update({'swf': src.replace(os.path.expanduser('~'), '~'), 'sha': sha(src), 'w': w, 'h': h, 'foot': foot_of(info, y, h, 1)})
        base[cls] = row
    shutil.rmtree(src_dir, ignore_errors=True)
    shutil.rmtree(out_dir, ignore_errors=True)
    json.dump(dict(sorted(base.items())), open(BASE, 'w'), indent=1)
    open(BASE, 'a').write('\n')
    print(f'{len(infos)} base pieces measured into base.json')


def guard():
    load = os.getloadavg()[0]
    free = shutil.disk_usage(os.path.expanduser('~')).free / 1e9
    if free < 4:
        sys.exit(f'stop: {free:.1f} GB free')
    return load


def main(args):
    force = '--force' in args
    work = None
    if '--work' in args:
        work = args[args.index('--work') + 1]
    if '--base' in args:
        only = [a for a in args if not a.startswith('--') and a != work]
        base_feet(only, work or tempfile.mkdtemp(prefix='furnbase-'))
        return
    if '--feet' in args:
        art = json.load(open(ART))
        feet(art, work or tempfile.mkdtemp(prefix='furnfeet-'))
        json.dump(dict(sorted(art.items())), open(ART, 'w'), indent=1)
        open(ART, 'a').write('\n')
        return
    only = [a for a in args if not a.startswith('--') and a != work]
    plan = json.load(open(PLAN))
    art = json.load(open(ART)) if os.path.exists(ART) else {}
    work = work or tempfile.mkdtemp(prefix='furnup-')
    os.makedirs(work, exist_ok=True)
    todo = []
    for key, p in sorted(plan.items()):
        if only and key not in only:
            continue
        src = os.path.expanduser(p['swf'])
        digest = sha(src)
        cls, uid = key.split('/')
        dst = os.path.join(OUT, cls, f'{uid}@{ZOOM}x.webp')
        if not force and art.get(key, {}).get('sha') == digest and os.path.exists(dst):
            continue
        todo.append((key, src, digest, dst))
    # A group renders whole when any of it is due (its crop is the union of its art).
    due = {plan[key].get('group') for key, *_ in todo} - {None}
    if due:
        have = {key for key, *_ in todo}
        for key, p in sorted(plan.items()):
            if p.get('group') in due and key not in have:
                cls, uid = key.split('/')
                src = os.path.expanduser(p['swf'])
                todo.append((key, src, sha(src), os.path.join(OUT, cls, f'{uid}@{ZOOM}x.webp')))
        todo.sort()
    print(f'{len(todo)} to render in {work}')
    done = 0
    for b, batch in enumerate(batches(todo, plan)):
        while guard() > 40:
            print('load above 40, waiting')
            subprocess.run(['sleep', '60'])
        src_dir = os.path.join(work, f'src{b}')
        out_dir = os.path.join(work, f'out{b}')
        os.makedirs(src_dir, exist_ok=True)
        names = {}
        for key, src, digest, dst in batch:
            name = key.replace('/', '__') + '.swf'
            names[key] = name
            swfinfo.rewrite(src, os.path.join(src_dir, name), pad=1.0, swaps=swaps_for(src, plan[key].get('parts')))
        subprocess.run([JAVA, '-Djava.awt.headless=true', '-jar', FFDEC, '-zoom', str(ZOOM), '-ignorebackground',
                        '-select', '1', '-format', 'frame:png', '-export', 'frame', out_dir, src_dir],
                       capture_output=True, text=True)
        boxes = crops([key for key, *_ in batch], plan, out_dir, names)
        for key, src, digest, dst in batch:
            png = os.path.join(out_dir, names[key], '1.png')
            if key not in boxes:
                print('  no render', key)
                art.pop(key, None)
                continue
            w, h, x, y = boxes[key]
            if w < 4 or h < 4:
                print('  empty render', key)
                art.pop(key, None)
                continue
            W, H = w + (-w % ZOOM), h + (-h % ZOOM)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            tmp = os.path.join(work, 'tmp.png')
            subprocess.run(['magick', png, '-crop', f'{w}x{h}+{x}+{y}', '+repage', '-background', 'none',
                            '-gravity', 'South', '-extent', f'{W}x{H}', '-strip', tmp], check=True)
            subprocess.run(['cwebp', '-quiet', '-metadata', 'none', '-q', '88', '-m', '4', '-sharp_yuv',
                            '-alpha_q', '100', '-alpha_filter', 'best', tmp, '-o', dst], check=True)
            art[key] = {'w': W // ZOOM, 'h': H // ZOOM, 'sha': digest, 'foot': foot_of(swfinfo.read(src), y, h, ZOOM)}
        json.dump(dict(sorted(art.items())), open(ART, 'w'), indent=1)
        open(ART, 'a').write('\n')
        shutil.rmtree(src_dir, ignore_errors=True)
        shutil.rmtree(out_dir, ignore_errors=True)
        done += len(batch)
        print(f'  {done}/{len(todo)}')
    print(f'{len(art)} in art.json')


if __name__ == '__main__':
    main(sys.argv[1:])
