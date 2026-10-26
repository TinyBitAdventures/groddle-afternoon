import json, os, re, subprocess, sys
T = sys.argv[1]
ICONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'sprites', 'icons')
m = json.load(open(f'{T}/map.json'))
def box(path):
    out = subprocess.run(['magick', path, '-format', '%@ %w %h', 'info:'], capture_output=True, text=True).stdout.strip()
    g = re.match(r'(\d+)x(\d+)\+(\d+)\+(\d+) (\d+) (\d+)', out)
    return tuple(map(int, g.groups())) if g else None
ok, bad = [], []
for i in sorted(m):
    src = f'{T}/out/{i}.swf/1.png'
    orig = f'{ICONS}/{i}.png'
    if not os.path.exists(src):
        bad.append((i, 'no render')); continue
    o = box(orig); r = box(src)
    if not o or not r or r[0] < 3 or r[1] < 3:
        bad.append((i, 'empty')); continue
    ow, oh, ox, oy, w, h = o
    rw, rh = r[0], r[1]
    ra, oa = rw / rh, ow / oh
    scale = (rw / ow + rh / oh) / 2
    if abs(ra - oa) / oa > 0.12 or not (2.3 < scale < 3.8):
        bad.append((i, f'mismatch orig {ow}x{oh} render {rw}x{rh}')); continue
    dst = f'{T}/hi/{i}@3x.png'
    subprocess.run(['magick', src, '-trim', '+repage', '-filter', 'Lanczos', '-resize', f'{ow*3}x{oh*3}!',
                    '-background', 'none', '-gravity', 'NorthWest', '-extent', f'{w*3}x{h*3}-{ox*3}-{oy*3}',
                    '-define', 'png:compression-level=9', '-strip', dst], check=True)
    ok.append(i)
json.dump({'ok': ok, 'bad': bad}, open(f'{T}/result.json', 'w'), indent=1)
print(len(ok), len(bad))
for b in bad: print(b)
