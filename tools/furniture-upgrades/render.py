"""Render the furniture upgrade SWFs in plan.json (tools/furniture-upgrades/build.mjs) to WebP.

    python3 -I tools/furniture-upgrades/render.py [--work DIR] [--force] [key ...]

Each SWF (glitch-items, CC0) is rewritten with a stage three times its size
(tools/icon-hires/swfinfo.rewrite: furniture art runs past its authored stage),
then FFDec (Java 21, -ignorebackground) exports frame 1 at zoom 2, one JVM per
batch. The render is trimmed to the art: the game draws a piece with the
bottom centre of that box on its foot point (ceiling pieces: the top centre),
which is how the recovered base frames sit (a base SWF at zoom 1 trims to its
OGA x1 frame exactly). The canvas is padded to even sides so the 1x size is
whole, and written as public/assets/sprites/furniture/upgrades/<class>/<id>@2x.webp
(cwebp, quality 88, sharp_yuv, lossless alpha). art.json records each key's
1x size and the SWF's hash; unchanged keys are skipped unless --force.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.normpath(os.path.join(HERE, '../..'))
sys.path.insert(0, os.path.join(SPIKE, 'tools/icon-hires'))
import swfinfo  # noqa: E402

PLAN = os.path.join(HERE, 'plan.json')
ART = os.path.join(HERE, 'art.json')
OUT = os.path.join(SPIKE, 'public/assets/sprites/furniture/upgrades')
JAVA = '/opt/homebrew/opt/openjdk@21/bin/java'
FFDEC = os.path.expanduser('~/Documents/glitch-audit/tools/ffdec/ffdec.jar')
ZOOM = 2
BATCH = 80


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def trim_box(path):
    out = subprocess.run(['magick', path, '-format', '%@', 'info:'], capture_output=True, text=True).stdout.strip()
    w, rest = out.split('x', 1)
    h, x, y = rest.replace('+', ' ').split()
    return int(w), int(h), int(x), int(y)


def guard():
    load = os.getloadavg()[0]
    free = shutil.disk_usage(os.path.expanduser('~')).free / 1e9
    if free < 8.5:
        sys.exit(f'stop: {free:.1f} GB free')
    return load


def main(args):
    force = '--force' in args
    work = None
    if '--work' in args:
        work = args[args.index('--work') + 1]
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
        dst = os.path.join(OUT, cls, f'{uid}@2x.webp')
        if not force and art.get(key, {}).get('sha') == digest and os.path.exists(dst):
            continue
        todo.append((key, src, digest, dst))
    print(f'{len(todo)} to render in {work}')
    for b in range(0, len(todo), BATCH):
        while guard() > 40:
            print('load above 40, waiting')
            subprocess.run(['sleep', '60'])
        batch = todo[b:b + BATCH]
        src_dir = os.path.join(work, f'src{b}')
        out_dir = os.path.join(work, f'out{b}')
        os.makedirs(src_dir, exist_ok=True)
        names = {}
        for key, src, digest, dst in batch:
            name = key.replace('/', '__') + '.swf'
            names[key] = name
            swfinfo.rewrite(src, os.path.join(src_dir, name), pad=1.0)
        subprocess.run([JAVA, '-Djava.awt.headless=true', '-jar', FFDEC, '-zoom', str(ZOOM), '-ignorebackground',
                        '-select', '1', '-format', 'frame:png', '-export', 'frame', out_dir, src_dir],
                       capture_output=True, text=True)
        for key, src, digest, dst in batch:
            png = os.path.join(out_dir, names[key], '1.png')
            if not os.path.exists(png):
                print('  no render', key)
                art.pop(key, None)
                continue
            w, h, x, y = trim_box(png)
            if w < 4 or h < 4:
                print('  empty render', key)
                art.pop(key, None)
                continue
            W, H = w + (w % 2), h + (h % 2)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            tmp = os.path.join(work, 'tmp.png')
            subprocess.run(['magick', png, '-crop', f'{w}x{h}+{x}+{y}', '+repage', '-background', 'none',
                            '-gravity', 'South', '-extent', f'{W}x{H}', '-strip', tmp], check=True)
            subprocess.run(['cwebp', '-quiet', '-metadata', 'none', '-q', '88', '-m', '4', '-sharp_yuv',
                            '-alpha_q', '100', '-alpha_filter', 'best', tmp, '-o', dst], check=True)
            art[key] = {'w': W // ZOOM, 'h': H // ZOOM, 'sha': digest}
        json.dump(dict(sorted(art.items())), open(ART, 'w'), indent=1)
        open(ART, 'a').write('\n')
        shutil.rmtree(src_dir, ignore_errors=True)
        shutil.rmtree(out_dir, ignore_errors=True)
        print(f'  {min(b + BATCH, len(todo))}/{len(todo)}')
    print(f'{len(art)} in art.json')


if __name__ == '__main__':
    main(sys.argv[1:])
