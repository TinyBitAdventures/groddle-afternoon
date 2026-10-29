#!/usr/bin/env python3.11
"""Sprite sheets for the potion lane (register rows G149 and G150), rendered from Tiny Speck's own
SWFs in tinyspeck/glitch-items (CC0):

- misc/physics/avatar_embiggenifier (the Embiggenifying Potion's cloud), sprite 59 `loop`
- misc/physics/avatar_smallifier (the De-Embiggenifying Potion's cloud), sprite 59 `loop`
- misc/physics/anti_gravitys_rainbow (Rainbow Juice's rainbow), sprite 47 `loop`
- inhabitants/scion_of_purple/purple_apparition (the Scion of Purple in the Purple Journey),
  sprite 81: talk, idle0, idle1, idle2 in one sheet, fadeIn and fadeOut (wide sparkle bursts) in a
  second, smaller-resolution one

FFDec renders every frame of a sprite at `zoom` (1 = the item's world size: getAssetInfo gives the
Scion 285 x 305, which zoom 1 matches). Each sheet keeps every `step`th frame of its labels, crops
them to the union of their alpha boxes, resizes by `resize` and packs the cells into one WebP.
`anchorX`/`anchorY` give, in cell pixels, the bottom centre of the reference frame's alpha box (the
item's own origin: getAssetInfo position x -w/2, y -h), so sheets of one item line up.
Writes public/assets/sprites/potions/*.webp and public/js/potion-art.js (sheet meta).

Usage (python3.11 has Pillow; FFDec needs Java 21):
  python3.11 -I tools/potion-art.py --work <scratch dir>
The SWFs are data: FFDec reads them, nothing runs them.
"""
import argparse, glob, json, math, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(HERE)
PUBLIC = os.path.join(SPIKE, 'public')
OUT = os.path.join(PUBLIC, 'assets', 'sprites', 'potions')
OUT_JS = os.path.join(PUBLIC, 'js', 'potion-art.js')
# GLITCH_AUDIT names the audit workspace when the spike is a worktree elsewhere.
AUDIT = os.environ.get('GLITCH_AUDIT') or os.path.dirname(SPIKE)
ITEMS = os.path.join(AUDIT, 'glitch-items')
JAVA = '/opt/homebrew/opt/openjdk@21/bin/java'
FFDEC = os.path.join(AUDIT, 'tools', 'ffdec', 'ffdec.jar')

# item -> swf, sprite id, zoom, reference frame (its alpha box bottom centre is the anchor), sheets.
# A sheet: name, labels [(label, first, last)] (1-based SWF frames), step, resize, WebP quality.
# G448: the clouds and the rainbow at zoom 3 (1.5 was 2.2x soft on a 3.3x Retina backing store), the
# Scion's fade bursts at its main sheet's density (resize 0.5 drew them 6.6x soft). The Scion's main
# sheet stays at zoom 1: zoom 2 would be 164 MB of GPU for its 86 cells.
JOBS = {
    'avatar_embiggenifier': ('misc/physics/avatar_embiggenifier/avatar_embiggenifier.swf', 59, 3, 1, [
        ('avatar_embiggenifier', [('loop', 1, 79)], 2, 1, 86),
    ]),
    'avatar_smallifier': ('misc/physics/avatar_smallifier/avatar_smallifier.swf', 59, 3, 1, [
        ('avatar_smallifier', [('loop', 1, 79)], 2, 1, 86),
    ]),
    'anti_gravitys_rainbow': ('misc/physics/anti_gravitys_rainbow/anti_gravitys_rainbow.swf', 47, 3, 1, [
        ('anti_gravitys_rainbow', [('loop', 1, 60)], 2, 1, 86),
    ]),
    'scion_of_purple': ('inhabitants/scion_of_purple/purple_apparition.swf', 81, 1, 127, [
        ('scion_of_purple', [('talk', 47, 126), ('idle0', 127, 195), ('idle1', 196, 264), ('idle2', 265, 302)], 3, 1, 88),
        ('scion_of_purple_fade', [('fadeIn', 1, 46), ('fadeOut', 303, 348)], 3, 1, 82),
    ]),
}


def render(work, name, swf, sprite, zoom):
    out = os.path.join(work, f'{name}@{zoom}')
    folder = os.path.join(out, f'DefineSprite_{sprite}')
    if not glob.glob(os.path.join(folder, '*.png')):
        os.makedirs(out, exist_ok=True)
        subprocess.run([JAVA, '-jar', FFDEC, '-format', 'sprite:png', '-zoom', str(zoom), '-selectid', str(sprite),
                        '-export', 'sprite', out, os.path.join(ITEMS, swf)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return folder


def alpha_box(im):
    return im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()


def main():
    from PIL import Image
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', required=True)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for item, (swf, sprite, zoom, ref, sheets) in JOBS.items():
        folder = render(args.work, item, swf, sprite, zoom)
        frame = lambda f: Image.open(os.path.join(folder, f'{f}.png')).convert('RGBA')
        rb = alpha_box(frame(ref))
        ax, ay = (rb[0] + rb[2]) / 2, rb[3]
        for name, labels, step, resize, quality in sheets:
            picked, ranges = [], {}
            for label, first, last in labels:
                start = len(picked)
                picked.extend(range(first, last + 1, step))
                ranges[label] = [start, len(picked) - start]
            images = [frame(f) for f in picked]
            box = None
            for im in images:
                b = alpha_box(im)
                if b:
                    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
            x0, y0, x1, y1 = box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1
            cw, ch = max(1, round((x1 - x0) * resize)), max(1, round((y1 - y0) * resize))
            cols = max(1, min(len(images), int(math.ceil(math.sqrt(len(images) * ch / cw)))))
            rows = int(math.ceil(len(images) / cols))
            sheet = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
            for i, im in enumerate(images):
                cell = im.crop((x0, y0, x1, y1))
                if resize != 1:
                    cell = cell.resize((cw, ch), Image.LANCZOS)
                sheet.alpha_composite(cell, ((i % cols) * cw, (i // cols) * ch))
            path = os.path.join(OUT, f'{name}.webp')
            sheet.save(path, 'WEBP', quality=quality, method=6)
            meta[name] = {
                'url': f'assets/sprites/potions/{name}.webp',
                'cellW': cw, 'cellH': ch, 'cols': cols, 'frames': len(images),
                # World px per sheet px.
                'scale': round(1 / (zoom * resize), 6),
                'anchorX': round((ax - x0) * resize, 1), 'anchorY': round((ay - y0) * resize, 1),
                'labels': ranges,
                'source': f'glitch-items/{swf} sprite {sprite}, every {step} frame(s) at zoom {zoom}',
            }
            print(f'{name}: {len(images)} cells {cw}x{ch} in {cols} cols -> {os.path.getsize(path) // 1024} KB')
    with open(OUT_JS, 'w') as fh:
        fh.write('/**\n * Potion lane sprite sheets (generated by tools/potion-art.py from CC0 glitch-items SWFs).\n'
                 ' * Do not edit by hand.\n */\n')
        fh.write(f'export const POTION_ART = Object.freeze({json.dumps(meta, indent=1)});\n')


if __name__ == '__main__':
    main()
