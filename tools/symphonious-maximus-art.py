#!/usr/bin/env python3.11
"""Star-Jingler art for Symphonious Maximus (register row G90), and the island top profiles.

Stars: glitch-items misc/toy_star_1/toy_star_1.swf (CC0, "Star-Jingler-mid"). Its sprite 3 has
the label "1" (frame 1: the yellow star at rest) and "glow" (frames 2-30: a colour matrix from
near white back to yellow, 24 fps). FFDec renders the sprite's frames at zoom 3; frame 1 becomes
toy_star_1@3x.webp and frame 2 (the palest) toy_star_1_glow@3x.webp, each padded to 3x the item's
46x42 stage (getAssetInfo in items/toy_star_1.js). js/features/symphonious-maximus-feature.js
fades the glow frame over the rest frame to play the glow cycle.

Soil (--soil, G104): the Snaps (research/wayback/raw/snaps/symphonious_maximus/, reference only) show a
music-note burrow in the purple hexagon soil under the mint floor; it is zutto1.swf's ground_large_2 (CC0, a
tall soil block whose top carries the note), which is not a street deco. Its embedded SWF is cut from the
street bundle (tools/deco-audit bundled_swf), rendered by FFDec at zoom 2 and cropped to its top SOIL_TOP
stage px (the rest is plain soil the view never reaches), the cut edge and both ends faded out: ground_large_2_top@2x.webp.
js/features/symphonious-maximus-feature.js draws it in the soil band.

Profiles (--profiles): the top edge of each floating island deco, as a fraction of its height at
x = 0.05 .. 0.95 of its width (first row with alpha over 140), for ISLAND_PROFILES in
public/js/symphonious-maximus.js.

Usage (python3.11 has numpy + Pillow; FFDec needs Java 21; cwebp):
  python3.11 -I tools/symphonious-maximus-art.py --work <scratch dir>
  python3.11 -I tools/symphonious-maximus-art.py --profiles
  python3.11 -I tools/symphonious-maximus-art.py --soil --work <scratch dir>
The SWF is data only: FFDec reads it, nothing runs it.
"""
import argparse, os, shutil, subprocess, sys

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(HERE)
AUDIT = os.path.dirname(SPIKE)
SWF = os.path.join(AUDIT, 'glitch-items', 'misc', 'toy_star_1', 'toy_star_1.swf')
FFDEC = os.path.join(AUDIT, 'tools', 'ffdec', 'ffdec.jar')
JAVA = '/opt/homebrew/opt/openjdk@21/bin/java'
OUT = os.path.join(SPIKE, 'public', 'assets', 'sprites', 'symphonious')
DECOS = os.path.join(SPIKE, 'public', 'assets', 'decos', 'groddle')
ZOOM = 3
STAGE = (46, 42)
SOIL_PIECE = 'ground_large_2'
SOIL_TOP = 150
SOIL_FADE = 50
SOIL_FADE_X = 60
ISLANDS = ['flying_platform_1', 'flying_platform_2', 'flying_platform_3', 'flying_platform_4', 'flying_platform_5', 'flying_platform_6']


def profiles():
    for name in ISLANDS:
        a = np.asarray(Image.open(os.path.join(DECOS, name + '.webp')).convert('RGBA'))[..., 3] > 140
        h, w = a.shape
        row = []
        for i in range(1, 20):
            ys = np.nonzero(a[:, min(w - 1, int(i * 0.05 * (w - 1)))])[0]
            row.append(round(ys[0] / h, 2) if len(ys) else None)
        print(f'{name}: {row}')


def render(work):
    src = os.path.join(work, 'in')
    out = os.path.join(work, 'out')
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(src)
    os.symlink(SWF, os.path.join(src, 'toy_star_1.swf'))
    subprocess.run([JAVA, '-Djava.awt.headless=true', '-jar', FFDEC, '-zoom', str(ZOOM), '-format', 'sprite:png',
                    '-export', 'sprite', out, os.path.join(src, 'toy_star_1.swf')], check=True, stdout=subprocess.DEVNULL)
    frames = [d for d in os.listdir(out) if d.startswith('DefineSprite_3')]
    if len(frames) != 1:
        raise SystemExit(f'expected one DefineSprite_3 folder, got {frames}')
    return os.path.join(out, frames[0])


def place(png, dest, work):
    im = Image.open(png).convert('RGBA')
    cw, ch = STAGE[0] * ZOOM, STAGE[1] * ZOOM
    if im.width > cw or im.height > ch:
        raise SystemExit(f'{png}: {im.size} larger than the {cw}x{ch} stage')
    canvas = Image.new('RGBA', (cw, ch))
    canvas.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2))
    tmp = os.path.join(work, os.path.basename(dest) + '.png')
    canvas.save(tmp)
    subprocess.run(['cwebp', '-quiet', '-lossless', '-exact', tmp, '-o', dest], check=True)
    print(dest, os.path.getsize(dest), 'bytes')


def soil(work):
    sys.path.insert(0, os.path.join(HERE, 'deco-audit'))
    import audit  # noqa: E402  (tools/deco-audit/audit.py)
    work = os.path.abspath(work)
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(os.path.join(work, 'in'))
    swf = audit.bundled_swf(work, 'zutto1.swf', SOIL_PIECE, audit.bundle_index())
    os.symlink(swf, os.path.join(work, 'in', SOIL_PIECE + '.swf'))
    out = os.path.join(work, 'out')
    subprocess.run([JAVA, '-Djava.awt.headless=true', '-jar', FFDEC, '-zoom', '2', '-ignorebackground', '-select', '1',
                    '-format', 'frame:png', '-export', 'frame', out, os.path.join(work, 'in')], check=True, stdout=subprocess.DEVNULL)
    im = Image.open(os.path.join(out, SOIL_PIECE + '.swf', '1.png')).convert('RGBA')
    im = im.crop((0, 0, im.width, SOIL_TOP * 2))
    # Fade the cut bottom edge (lowest SOIL_FADE stage px) so it melts into the soil band behind it.
    a = np.asarray(im, dtype=np.float32).copy()
    n = SOIL_FADE * 2
    a[-n:, :, 3] *= np.linspace(1, 0, n, dtype=np.float32)[:, None]
    # And its square left and right ends (SOIL_FADE_X stage px), so it melts into the band at either side.
    m = SOIL_FADE_X * 2
    ramp = np.linspace(0, 1, m, dtype=np.float32)[None, :]
    a[:, :m, 3] *= ramp
    a[:, -m:, 3] *= ramp[:, ::-1]
    im = Image.fromarray(np.clip(a + 0.5, 0, 255).astype('uint8'), 'RGBA')
    tmp = os.path.join(work, 'soil.png')
    im.save(tmp)
    dest = os.path.join(OUT, SOIL_PIECE + '_top@2x.webp')
    subprocess.run(['cwebp', '-quiet', '-q', '86', '-sharp_yuv', '-alpha_q', '100', tmp, '-o', dest], check=True)
    print(dest, im.size, os.path.getsize(dest), 'bytes')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work')
    ap.add_argument('--profiles', action='store_true')
    ap.add_argument('--soil', action='store_true')
    args = ap.parse_args()
    if args.profiles:
        profiles()
        return
    if not args.work:
        ap.error('--work <scratch dir> is required to render')
    if args.soil:
        soil(args.work)
        return
    frames = render(os.path.abspath(args.work))
    os.makedirs(OUT, exist_ok=True)
    place(os.path.join(frames, '1.png'), os.path.join(OUT, 'toy_star_1@3x.webp'), args.work)
    place(os.path.join(frames, '2.png'), os.path.join(OUT, 'toy_star_1_glow@3x.webp'), args.work)


if __name__ == '__main__':
    main()
