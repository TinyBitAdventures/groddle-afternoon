"""Render 3x pack icons from tinyspeck/glitch-items SWFs (CC0) for a plan.

    python3 -I tools/icon-hires/hires.py tools/icon-hires/plan.json WORKDIR [--write] [id ...]
    python3 -I tools/icon-hires/hires.py --list      # regenerate js/icon-hires.js

A plan maps icon ids to their vector source (paths may start with ~):
    "furniture_bed":     {"swf": ".../furniture_base/furniture_bed/furniture_bed.swf"}
    "frying_pan_broken": {"swf": ".../frying_pan.swf", "frame": "broken_iconic"}
    "npc_fox":           {"swf": ".../npc_fox.swf", "sprite": 151, "frame": "iconic"}
    "firefly_jar":       {"swf": ".../firefly_jar.swf", "swap": {"10": 8}}
    "npc_kitty_chicken": {"swf": ".../npc_kitty_chicken.swf", "sprite": 114, "flop": true}
- `frame`: a frame number or a scene / frame label (default 1), of the root
  timeline or of `sprite` (a DefineSprite character id; labels from swfinfo.py).
- `swap`: PlaceObject character ids to replace before rendering, for items whose
  icon state is picked by code (see swfinfo.rewrite).
- `flop`: mirror the render, for OGA icons drawn facing the other way.

Items with no 1x icon yet (register G174) name where it comes from:
    "rock_beryl_2": {"swf": ".../rock_beryl_2.swf", "frame": "iconic",
                     "oga": "~/.../opengameart/extracted_g174/.../rock_beryl_2__x1_iconic_png_1354831453.png"}
    "mental_hope":  {"swf": ".../mental_hope.swf", "seed": true}
    "bag_cabinet_ok_4_4": {"swf": "...", "seed": true, "ref": "~/.../bag_cabinet_ok_4_4__x1_1_png_1354832280.png"}
- `oga`: a Tiny Speck OGA PNG (CC0) that becomes the 1x icon byte for byte;
  the 3x render is checked against it and placed exactly as for any other icon.
- `seed`: no OGA PNG fits (none exists, or it is an animation sheet or larger
  than SEED_MAX), so the 1x is made from the same render: its zoom-1 size
  (Flash's own pixel size, which is what OGA's 1x files are), shrunk so the
  longest side is at most SEED_MAX, on a tight canvas like the OGA icons; the
  3x file is exactly three times it. `ref` (optional) is an OGA PNG of the same
  state to check the render against (both shrunk to the 1x size).
Both write the 1x file only when the 3x render is accepted.

Each SWF is rewritten with a stage three times the size (furniture registers at
its bottom centre, lamps hang above the stage, so a plain frame export clips
them), then FFDec (Java 21, -ignorebackground) exports the frame at a zoom large
enough that the trimmed art is at least 3x the OGA 1x icon (a second, larger
pass runs when the first comes out small). The render is checked against the 1x
icon (aspect within 12%, and `diff`: RMSE of the render shrunk to 1x against the
1x art, on white and on black, 0..1, at most MAX_DIFF) and placed on a canvas
exactly 3x the 1x file so sizes and anchors do not move. Without --write the
results go to WORKDIR/hi; WORKDIR/report.json lists every id with its diff.
Look at a contact sheet before shipping: a low diff does not prove the right art.
"""
import json, glob, math, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import swfinfo  # noqa: E402

SPIKE = os.path.normpath(os.path.join(HERE, '../..'))
ICONS = os.path.join(SPIKE, 'public/assets/sprites/icons')
HIRES_JS = os.path.join(SPIKE, 'public/js/icon-hires.js')
JAVA = '/opt/homebrew/opt/openjdk@21/bin/java'
FFDEC = os.path.expanduser('~/Documents/glitch-audit/tools/ffdec/ffdec.jar')
MAX_DIFF = 0.16
SEED_MAX = 160  # the largest OGA pack icons (still, metalmaker, rock_*_1) are about 160 px


def box(path):
    """Trim box of a PNG: (w, h, x, y, canvas_w, canvas_h)."""
    out = subprocess.run(['magick', path, '-format', '%@ %w %h', 'info:'], capture_output=True, text=True).stdout.strip()
    g = re.match(r'(\d+)x(\d+)\+(\d+)\+(\d+) (\d+) (\d+)', out)
    return tuple(map(int, g.groups())) if g else None


def diff(render, icon, w, h, flop=False):
    """RMSE (0..1) of the trimmed render shrunk to w x h against the trimmed 1x icon."""
    scores = []
    for bg in ('white', 'black'):
        cmd = ['magick',
               '(', icon, '-trim', '+repage', '-background', bg, '-flatten', ')',
               '(', render, *(['-flop'] if flop else []), '-trim', '+repage', '-filter', 'Lanczos',
               '-resize', f'{w}x{h}!', '-background', bg, '-flatten', ')',
               '-metric', 'RMSE', '-compare', '-format', '%[distortion]', 'info:']
        r = subprocess.run(cmd, capture_output=True, text=True)
        m = re.search(r'([0-9.]+)', r.stdout or r.stderr)
        scores.append(float(m.group(1)) if m else 1.0)
    return round(max(scores), 4)


def diff_ref(render, ref, w, h, flop=False):
    """diff() for a seed icon: the render and an OGA reference of any size, both trimmed and shrunk to w x h."""
    scores = []
    for bg in ('white', 'black'):
        cmd = ['magick',
               '(', ref, '-trim', '+repage', '-filter', 'Lanczos', '-resize', f'{w}x{h}!', '-background', bg, '-flatten', ')',
               '(', render, *(['-flop'] if flop else []), '-trim', '+repage', '-filter', 'Lanczos',
               '-resize', f'{w}x{h}!', '-background', bg, '-flatten', ')',
               '-metric', 'RMSE', '-compare', '-format', '%[distortion]', 'info:']
        r = subprocess.run(cmd, capture_output=True, text=True)
        m = re.search(r'([0-9.]+)', r.stdout or r.stderr)
        scores.append(float(m.group(1)) if m else 1.0)
    return round(max(scores), 4)


def seed_size(r, zoom):
    """1x size of a seed icon: the trimmed render at zoom 1, longest side at most SEED_MAX."""
    w, h = r[0] / zoom, r[1] / zoom
    s = min(1.0, SEED_MAX / max(w, h))
    return max(1, round(w * s)), max(1, round(h * s))


def one_x(i, p):
    """The 1x icon a render is checked against and placed on: the shipped file, else the plan's OGA PNG, else None (seed)."""
    icon = os.path.join(ICONS, f'{i}.png')
    if os.path.exists(icon):
        return icon
    return os.path.expanduser(p['oga']) if p.get('oga') else None


def ffdec(*args):
    subprocess.run([JAVA, '-Djava.awt.headless=true', '-jar', FFDEC, *map(str, args)], capture_output=True, text=True)


def export(jobs, work, tag):
    """jobs: [(id, job)] with job = {swf (rewritten), frame (number), zoom, sprite?} -> {id: png path}.
    Root frames: one JVM per (zoom, frame) group. Sprites: one JVM each (FFDec exports every frame)."""
    found, groups = {}, {}
    for i, j in jobs:
        if j.get('sprite'):
            out = os.path.join(work, f'out-{tag}-sprite', i)
            ffdec('-zoom', j['zoom'], '-selectid', j['sprite'], '-format', 'sprite:png', '-export', 'sprite', out, j['swf'])
            pngs = glob.glob(os.path.join(out, f'DefineSprite_{j["sprite"]}*', f'{j["frame"]}.png'))
            if pngs:
                found[i] = pngs[0]
        else:
            groups.setdefault((j['zoom'], j['frame']), []).append((i, j['swf']))
    for (zoom, frame), items in sorted(groups.items()):
        src = os.path.join(work, f'src-{tag}-z{zoom}-f{frame}')
        out = os.path.join(work, f'out-{tag}-z{zoom}-f{frame}')
        os.makedirs(src, exist_ok=True)
        for i, swf in items:
            link = os.path.join(src, f'{i}.swf')
            if os.path.lexists(link):
                os.remove(link)
            os.symlink(swf, link)
        ffdec('-zoom', zoom, '-ignorebackground', '-select', frame, '-format', 'frame:png', '-export', 'frame', out, src)
        for i, _ in items:
            png = os.path.join(out, f'{i}.swf', f'{frame}.png')
            if os.path.exists(png):
                found[i] = png
    return found


def run(plan_path, work, write, only):
    plan = json.load(open(plan_path))
    if only:
        plan = {i: p for i, p in plan.items() if i in only}
    os.makedirs(os.path.join(work, 'hi'), exist_ok=True)
    os.makedirs(os.path.join(work, 'swf'), exist_ok=True)
    jobs, report, ones = [], {}, {}
    for i, p in sorted(plan.items()):
        src = os.path.expanduser(p['swf'])
        info = swfinfo.read(src)
        frame = p.get('frame', 1)
        if not isinstance(frame, int):
            names = info['sprites'].get(p['sprite'], {}).get('labels', {}) if p.get('sprite') else {**info['labels'], **info['scenes']}
            frame = names.get(frame)
            if not frame:
                report[i] = {'ok': False, 'why': f'no label {p["frame"]!r} in {os.path.basename(src)}'}
                continue
        one = ones[i] = one_x(i, p)
        if not one and not p.get('seed'):
            report[i] = {'ok': False, 'why': 'no 1x icon: give the plan an `oga` PNG or `seed`'}
            continue
        swf = os.path.join(work, 'swf', f'{i}.swf')
        swfinfo.rewrite(src, swf, pad=1.0, swaps=p.get('swap'))
        sw, sh = info['stage']
        if one:
            ow, oh = box(one)[:2]
            zoom = p.get('zoom') or max(1, min(8, math.ceil(3.3 * max(ow / max(sw, 1), oh / max(sh, 1)))))
        else:
            zoom = p.get('zoom') or max(1, min(8, math.ceil(3.3 * min(1.0, SEED_MAX / max(sw, sh, 1)))))
        jobs.append((i, {'swf': swf, 'frame': frame, 'zoom': zoom, 'sprite': p.get('sprite')}))
        report[i] = {'swf': src, 'frame': frame, 'sprite': p.get('sprite'), 'zoom': zoom,
                     'one': 'shipped' if one and one.startswith(ICONS) else 'oga' if one else 'seed'}
    renders = export(jobs, work, 'a')

    def target(i, j, r):
        """The 1x size the render must be at least three times."""
        return box(ones[i])[:2] if ones[i] else seed_size(r, j['zoom'])
    # Art smaller than the 3x target (content smaller than the stage) goes again, bigger.
    again = []
    for i, j in jobs:
        r = renders.get(i) and box(renders[i])
        if not r or r[0] < 3 or r[1] < 3:
            continue
        ow, oh = target(i, j, r)
        if (r[0] < ow * 3 or r[1] < oh * 3) and j['zoom'] < 12:
            j2 = {**j, 'zoom': min(12, math.ceil(j['zoom'] * 1.1 * max(ow * 3 / r[0], oh * 3 / r[1])))}
            again.append((i, j2))
    renders.update(export(again, work, 'b'))
    zooms = {i: j['zoom'] for i, j in jobs}
    zooms.update({i: j['zoom'] for i, j in again})
    for i, j in jobs:
        rep, flop, p = report[i], bool(plan[i].get('flop')), plan[i]
        rep['zoom'] = zooms[i]
        src = renders.get(i)
        r = src and box(src)
        if not r or r[0] < 3 or r[1] < 3:
            rep.update(ok=False, why='empty render'); continue
        rw, rh = r[0], r[1]
        one = ones[i]
        if one and box(one)[0] < 1:
            rep.update(ok=False, why='the 1x icon is empty'); continue
        if one:
            ow, oh, ox, oy, w, h = box(one)
            aspect = abs(rw / rh - ow / oh) / (ow / oh)
            d = diff(src, one, ow, oh, flop)
        else:
            # A seed has its 1x cut from this render (r at the zoom it was exported with), on a tight canvas.
            ow, oh = seed_size(r, zooms[i])
            ox, oy, w, h = 0, 0, ow, oh
            ref = p.get('ref') and os.path.expanduser(p['ref'])
            if ref:
                rb = box(ref)
                aspect = abs(rw / rh - rb[0] / rb[1]) / (rb[0] / rb[1])
                d = diff_ref(src, ref, ow, oh, flop)
            else:
                aspect, d = 0.0, None
        rep.update(render=[rw, rh], icon=[ow, oh], aspect=round(aspect, 3), diff=d, png=src)
        if rw < ow * 3 or rh < oh * 3:
            rep.update(ok=False, why=f'render {rw}x{rh} smaller than 3x the icon'); continue
        if aspect > 0.12:
            rep.update(ok=False, why=f'aspect: icon {ow}x{oh}, render {rw}x{rh}'); continue
        if d is not None and d > MAX_DIFF:
            rep.update(ok=False, why=f'art differs from the 1x icon (diff {d})'); continue
        out = ICONS if write else os.path.join(work, 'hi')
        dst = os.path.join(out, f'{i}@3x.png')
        subprocess.run(['magick', src, *(['-flop'] if flop else []), '-trim', '+repage', '-filter', 'Lanczos',
                        '-resize', f'{ow * 3}x{oh * 3}!', '-background', 'none', '-gravity', 'NorthWest',
                        '-extent', f'{w * 3}x{h * 3}-{ox * 3}-{oy * 3}',
                        '-define', 'png:compression-level=9', '-strip', dst], check=True)
        dst1 = os.path.join(out, f'{i}.png')
        if not one:
            subprocess.run(['magick', src, *(['-flop'] if flop else []), '-trim', '+repage', '-filter', 'Lanczos',
                            '-resize', f'{ow}x{oh}!', '-define', 'png:compression-level=9', '-strip', dst1], check=True)
        elif one != dst1:
            shutil.copyfile(one, dst1)  # the shipped icon (dry run) or the OGA PNG, byte for byte
        rep.update(ok=True, out=dst)
    json.dump(report, open(os.path.join(work, 'report.json'), 'w'), indent=1)
    ok = [i for i, r in report.items() if r.get('ok')]
    print(f'{len(ok)} placed, {len(report) - len(ok)} rejected')
    for i, r in sorted(report.items()):
        print(('  ok  ' if r.get('ok') else '  --  ') + i, r.get('one', ''), r.get('diff', ''), r.get('why', ''))


def write_list():
    """Rewrite the HIRES_ICONS set in js/icon-hires.js from the @3x files on disk."""
    ids = sorted(f[:-7] for f in os.listdir(ICONS) if f.endswith('@3x.png') and os.path.exists(os.path.join(ICONS, f[:-7] + '.png')))
    src = open(HIRES_JS).read()
    line = 'export const HIRES_ICONS = new Set(' + json.dumps(ids, separators=(', ', ': ')) + ');'
    src, n = re.subn(r'^export const HIRES_ICONS = new Set\(.*\);$', lambda _: line, src, count=1, flags=re.M)
    assert n == 1, 'HIRES_ICONS line not found'
    open(HIRES_JS, 'w').write(src)
    print(f'{len(ids)} icons listed in {HIRES_JS}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args == ['--list']:
        write_list()
    else:
        rest = [a for a in args[2:] if a != '--write']
        run(args[0], args[1], '--write' in args[2:], set(rest))
