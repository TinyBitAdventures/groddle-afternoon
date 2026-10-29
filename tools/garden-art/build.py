#!/usr/bin/env python3.11
"""Garden plot dishes and the bed frame, drawn from code (our own art, G316).

The baseline shipped plot_dry/wet/dirty.png and bed_frame_wood.png with no
record of where they came from (research/coverage/g312-provenance.md: no OGA,
SWF or FLA match), so they are redrawn here at the same sizes and anchors:

  public/assets/sprites/garden/plot_dry.png    128 x 96  dish of dry soil on a wooden plinth
  public/assets/sprites/garden/plot_wet.png    128 x 96  the same, darker and glossy
  public/assets/sprites/garden/plot_dirty.png  128 x 96  dry soil with weed sprouts
  public/assets/sprites/garden/bed_frame_wood.png 280 x 110  bevelled wooden frame around dark soil

Shapes are drawn at 4x and box-downsampled, so the output is the same on every run;
bed_frame_wood@3x.png is the bed at 3x (4x shapes, Lanczos to 3x) for dense screens.

  python3.11 -I tools/garden-art/build.py          (write)
  python3.11 -I tools/garden-art/build.py --check  (exit 1 when a file differs)
"""
import io, os, sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'public', 'assets', 'sprites', 'garden')
SS = 4


def box(draw, xy, fill, kind='rect', **kw):
    xy = [v * SS for v in xy]
    if kind == 'ellipse':
        draw.ellipse(xy, fill=fill, **kw)
    elif kind == 'poly':
        draw.polygon(xy, fill=fill, **kw)
    elif kind == 'rounded':
        draw.rounded_rectangle(xy, fill=fill, **{k: v * SS if k == 'radius' else v for k, v in kw.items()})
    else:
        draw.rectangle(xy, fill=fill, **kw)


def plot(state):
    w, h = 128, 96
    im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Soft ground shadow.
    box(d, [10, 74, 118, 92], (0, 0, 0, 40), 'ellipse')
    # Wooden plinth (a trapezoid under the dish).
    box(d, [22, 56, 106, 56, 112, 80, 16, 80], (92, 62, 38, 255), 'poly')
    box(d, [16, 76, 112, 80], (70, 46, 28, 255))
    box(d, [26, 58, 102, 62], (116, 82, 52, 255))
    # Dish rim and soil.
    rim = (150, 112, 70, 255)
    soil = {'dry': (122, 92, 60, 255), 'wet': (78, 56, 36, 255), 'dirty': (110, 82, 54, 255)}[state]
    inner = {'dry': (104, 76, 48, 255), 'wet': (60, 42, 26, 255), 'dirty': (94, 68, 44, 255)}[state]
    box(d, [6, 28, 122, 70], (84, 58, 34, 255), 'ellipse')
    box(d, [6, 24, 122, 66], rim, 'ellipse')
    box(d, [12, 28, 116, 62], soil, 'ellipse')
    box(d, [18, 34, 110, 60], inner, 'ellipse')
    # Furrows.
    for i, y in enumerate((40, 46, 52)):
        box(d, [30 - i * 2, y, 98 + i * 2, y + 2], tuple(max(0, c - 14) for c in inner[:3]) + (255,), 'ellipse')
    if state == 'wet':
        box(d, [34, 33, 70, 38], (150, 130, 110, 110), 'ellipse')
        box(d, [80, 50, 96, 53], (150, 130, 110, 80), 'ellipse')
    if state == 'dirty':
        for x, y, s in ((34, 44, 1.0), (48, 50, 0.8), (64, 42, 1.1), (80, 49, 0.9), (94, 44, 0.8)):
            g = (84, 128, 52, 255)
            box(d, [x - 1, y - 7 * s, x + 1, y], g)
            box(d, [x - 6 * s, y - 8 * s, x, y - 4 * s], g, 'ellipse')
            box(d, [x, y - 10 * s, x + 6 * s, y - 6 * s], (104, 150, 64, 255), 'ellipse')
    return im.resize((w, h), Image.BOX)


def bed_frame(scale=1):
    w, h = 280, 110
    im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    box(d, [2, 6, 278, 108], (150, 104, 56, 255), 'rounded', radius=8)
    box(d, [2, 6, 278, 14], (214, 170, 104, 255), 'rounded', radius=6)
    box(d, [2, 96, 278, 108], (118, 80, 42, 255), 'rounded', radius=6)
    box(d, [14, 18, 266, 94], (96, 64, 36, 255), 'rounded', radius=4)
    box(d, [18, 22, 262, 90], (72, 48, 30, 255), 'rounded', radius=3)
    box(d, [18, 22, 262, 30], (58, 38, 24, 255))
    return im.resize((w * scale, h * scale), Image.BOX if scale == 1 else Image.LANCZOS)


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def main():
    files = {f'plot_{s}.png': plot(s) for s in ('dry', 'wet', 'dirty')}
    files['bed_frame_wood.png'] = bed_frame()
    # The bed is drawn at scale 1 in the world: a 3x render for dense screens (lane SPRITES
    # 2026-10-29), listed in tools/vector-sprites/results.json so js/sprite-hires.js routes it.
    files['bed_frame_wood@3x.png'] = bed_frame(3)
    check = '--check' in sys.argv
    bad = 0
    for name, im in files.items():
        data = png_bytes(im)
        path = os.path.join(OUT, name)
        if check:
            same = os.path.exists(path) and open(path, 'rb').read() == data
            print(('ok   ' if same else 'DIFF ') + name)
            bad += not same
        else:
            open(path, 'wb').write(data)
            print('wrote', name, im.size)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
