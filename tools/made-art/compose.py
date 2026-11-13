#!/usr/bin/env python3.11
"""
The pictures of the Made for Groddle section of /restoration/ that are not a shipped file as it is:
each a crop, a render or a side-by-side composed from the game's own files, written to
public/assets/made-art/ and recorded in tools/made-art/showcase.json (sha256, size, what it shows
and what it was made from), which tools/made-art/build-data.mjs checks against the files.

  python3.11 -I tools/made-art/compose.py --shots <dir>

<dir> holds three PNG screenshots of the game served from this checkout at deviceScaleFactor 2
(tools/qa/serve.mjs; the steps are in each entry's `made`):
  subway-render.png   js/map-views.js renderSubwayMapSvg at 760 x 460 on the game's style.css, the
                      names and line buttons hidden
  room-before.png     the tutorial's EZ Cooking pick on Breezy, EZ Cookin' (1280 x 800), the avatar
                      placed at x 1640, with the street JSON of 51a268aa9d^ (the stand-ins) served
  room-after.png      the same with today's street

Everything else is drawn from shipped files: Tiny Speck's CC0 art and the made art whose provenance
is in tools/provenance/ (made-decos.json, repainted-maps.json, subway-map-paper.json).
"""
import argparse, hashlib, json, os, subprocess, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUB = os.path.join(ROOT, 'public')
OUT = 'public/assets/made-art'
REC = os.path.join(ROOT, 'tools/made-art/showcase.json')
PAPER = (247, 245, 239, 255)

sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
rel = lambda p: os.path.relpath(p, ROOT)


def webp(img, name, lossless=False, q=86):
    png = os.path.join(TMP, name + '.png')
    img.save(png)
    dst = os.path.join(ROOT, OUT, name + '.webp')
    args = ['cwebp', '-quiet', '-metadata', 'none'] + (['-lossless', '-z', '9'] if lossless else ['-q', str(q), '-m', '6', '-sharp_yuv', '-alpha_q', '100'])
    subprocess.run(args + [png, '-o', dst], check=True)
    return dst


def source(path):
    return {'file': rel(path), 'sha256': sha(path)}


# EZ Cookin': our measurement drawing and the made props, side by side at the street's own scale

# The pieces at the sizes measured from the snaps (research/art-briefs/ez-cookin/attach/01-measurements-ours.svg),
# in street units, one above the other on a sheet 250 wide: the lamp (its wires from y 15), the counter
# 24 under it, the table 24 under that, all centred at x 125 (y down).
SCENE = (0, 0, 250, 285)
LAMP = (125 - 37.5, 15)  # the drawing's lamp group origin (the wires' top)
COUNTER = (125 - 110, 91)
TABLE = (125 - 91, 179)
S = 3  # px a unit in the files
SS = 4  # supersampling for the drawing


def bez(p0, p1, p2, p3, n=24):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]


def outline_drawing():
    k = S * SS
    w, h = (SCENE[2] - SCENE[0]) * k, (SCENE[3] - SCENE[1]) * k
    img = Image.new('RGBA', (w, h), PAPER)
    d = ImageDraw.Draw(img)
    ink, lw = (51, 51, 51, 255), round(0.7 * k)
    at = lambda o, x, y: ((o[0] + x - SCENE[0]) * k, (o[1] + y - SCENE[1]) * k)
    box = lambda o, x0, y0, x1, y1: [*at(o, x0, y0), *at(o, x1, y1)]
    # 1. Counter 220 x 64: glass lid 27, steel band 4, tub 33 narrowing to about 197, two seams, two rivets.
    o = COUNTER
    d.rounded_rectangle(box(o, 0, 0, 220, 27), radius=12 * k, fill=(228, 244, 242, 255), outline=ink, width=lw)
    d.rectangle(box(o, 6, 27, 214, 31), fill=(154, 169, 173, 255), outline=ink, width=lw)
    tub = [at(o, 8, 31), at(o, 212, 31), at(o, 204, 58)] + [at(o, *p) for p in bez((204, 58), (202, 62), (198, 64), (194, 64))] + [at(o, 26, 64)] + [at(o, *p) for p in bez((26, 64), (22, 64), (18, 62), (16, 58))]
    d.polygon(tub, fill=(238, 240, 242, 255), outline=ink, width=lw)
    for x in (62, 152):
        d.line([at(o, x, 33), at(o, x, 60)], fill=(153, 153, 153, 255), width=lw)
    for x in (22, 198):
        d.ellipse(box(o, x - 2, 27, x + 2, 31), fill=(255, 255, 255, 255), outline=ink, width=lw)
    # 2. Lamp: cord up (dashed), four wires 22 to one point, shade 75 x 27, diffuser.
    o = LAMP
    for y in range(-15, 0, 4):
        d.line([at(o, 37.5, y), at(o, 37.5, y + 2)], fill=ink, width=lw)
    for x in (12, 28, 47, 63):
        d.line([at(o, 37.5, 0), at(o, x, 22)], fill=ink, width=lw)
    d.rounded_rectangle(box(o, 0, 22, 75, 49), radius=4 * k, fill=(246, 248, 251, 255), outline=ink, width=lw)
    d.ellipse(box(o, 30.5, 47, 44.5, 53), fill=(255, 255, 255, 255), outline=ink, width=lw)
    # 3. Table 182 x 88: oval top 30 with a rim, three rings, scrolled legs and a cross bar.
    o = TABLE
    side = [at(o, 0, 15), at(o, 0, 25)] + [at(o, 91 - 91 * __import__('math').cos(t / 40 * 3.14159), 25 + 17 * __import__('math').sin(t / 40 * 3.14159)) for t in range(41)] + [at(o, 182, 15)]
    d.polygon(side, fill=(221, 230, 230, 255), outline=ink, width=lw)
    for rx, ry, fill in ((91, 15, (238, 247, 246, 255)), (62, 9, (207, 238, 238, 255)), (38, 5, (233, 238, 233, 255))):
        d.ellipse(box(o, 91 - rx, 15 - ry, 91 + rx, 15 + ry), fill=fill, outline=ink, width=lw)
    leg = (85, 85, 85, 255)
    for a, b, c, e in (((70, 42), (55, 55), (75, 70), (62, 86)), ((112, 42), (127, 55), (107, 70), (120, 86)), ((84, 42), (78, 60), (92, 72), (86, 88)), ((98, 42), (104, 60), (90, 72), (96, 88))):
        d.line([at(o, *p) for p in bez(a, b, c, e)], fill=leg, width=round(1.6 * k), joint='curve')
    d.line([at(o, 66, 78), at(o, 116, 78)], fill=leg, width=round(1.6 * k))
    return img.resize((w // SS, h // SS), Image.LANCZOS)


def props_scene():
    w, h = (SCENE[2] - SCENE[0]) * S, (SCENE[3] - SCENE[1]) * S
    img = Image.new('RGBA', (w, h), PAPER)
    deco = lambda n: os.path.join(PUB, 'assets/decos/groddle', f'{n}@1.5x.webp')
    used = []
    # (name, centre x, feet y, drawn w, drawn h): the sizes js/practice-streets.js draws them at (EZ_PROP_ART), the
    # table's top, the counter's feet and the lamp's wires where the drawing has them (the lamp's file ends 2 under
    # its shade, whose top is 27.5 and wires' top 50.5 above the file's foot).
    for name, cx, feet, dw, dh in (('gz_ai_ezc_round_table', 125, 179 + 96, 182, 96), ('gz_ai_ezc_glass_counter', 125, 155, 220, 64), ('gz_ai_ezc_hanging_lamp', 125, 15 + 50.5, 75, 654)):
        p = deco(name)
        used.append(source(p))
        art = Image.open(p).convert('RGBA').resize((round(dw * S), round(dh * S)), Image.LANCZOS)
        x, y = round((cx - dw / 2 - SCENE[0]) * S), round((feet - dh - SCENE[1]) * S)
        img.alpha_composite(art, (x, y)) if y >= 0 else img.alpha_composite(art.crop((0, -y, art.size[0], art.size[1])), (x, 0))
    return img, used


# Region maps: three thumbnails and their paintings, one column each

MAPS = [('27', 'ix'), ('107', 'callopee'), ('131', 'haoma')]
GAP = 3  # px between thumbnails (12 between paintings)


def maps_columns():
    thumbs = [os.path.join(PUB, f'assets/maps/art/thumbs/sm_{s}.jpg') for _, s in MAPS]
    paint = [os.path.join(PUB, f'assets/maps/art/bg/{s}@2x.webp') for _, s in MAPS]
    tw, th = 150, 91
    a = Image.new('RGBA', (tw, th * 3 + GAP * 2), (0, 0, 0, 0))
    b = Image.new('RGBA', (tw * 4, (th * 3 + GAP * 2) * 4), (0, 0, 0, 0))
    for i, (t, p) in enumerate(zip(thumbs, paint)):
        ti = Image.open(t).convert('RGBA')
        assert ti.size == (tw, th), t
        a.alpha_composite(ti, (0, i * (th + GAP)))
        b.alpha_composite(Image.open(p).convert('RGBA').resize((tw * 4, th * 4), Image.LANCZOS), (0, i * (th + GAP) * 4))
    return a, b, [source(t) for t in thumbs], [source(p) for p in paint]


def main():
    global TMP
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots', required=True)
    args = ap.parse_args()
    TMP = os.path.join(args.shots, 'compose-tmp')
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(os.path.join(ROOT, OUT), exist_ok=True)
    rec = {}

    def put(name, dst, what, made, sources):
        w, h = Image.open(dst).size
        rec[rel(dst)] = {'what': what, 'w': w, 'h': h, 'sha256': sha(dst), 'made': made, 'from': sources}

    # Subway: the sign's little map (Tiny Speck, CC0) and the paper with the line on it.
    sign = os.path.join(PUB, 'assets/sprites/icons/subway_map@3x.webp')
    crop = Image.open(sign).convert('RGBA').crop((27, 47, 259, 205))
    put('subway-sign-map', webp(crop, 'subway-sign-map', lossless=True), "The little map on Tiny Speck's in-world Subway Map sign",
        'crop x 27-259, y 47-205 of the sign (its map panel), lossless', [source(sign) | {'licence': 'CC0 1.0, Tiny Speck: glitch-items misc/subway_map (subway_map.swf)'}])
    shot = os.path.join(args.shots, 'subway-render.png')
    r = Image.open(shot).convert('RGBA')
    assert r.size == (1520, 920), r.size
    r = r.crop((8, 8, 1512, 912)).resize((752, 452), Image.LANCZOS)
    paper = os.path.join(PUB, 'assets/maps/art/subway/subway-map-paper@2x.webp')
    put('subway-map-paper-line', webp(r, 'subway-map-paper-line', q=88), 'The recreated Subway System paper with the Red Line and its stations drawn on it',
        "screenshot of js/map-views.js renderSubwayMapSvg (the Map's Subway view) at 760 x 460, deviceScaleFactor 2, on the game's style.css with the station names and line buttons hidden; the rounded corners cropped (8 px), Lanczos to 752 x 452",
        [source(paper), {'file': 'public/js/map-views.js'}, {'shot': 'subway-render.png', 'sha256': sha(shot)}])

    # EZ Cookin': the drawing the model was given, and what came back, at the same scale.
    put('ezc-props-outline', webp(outline_drawing(), 'ezc-props-outline'), "Our drawing of EZ Cookin's table, counter and lamp, at their measured sizes",
        'drawn by compose.py from the outlines of research/art-briefs/ez-cookin/attach/01-measurements-ours.svg (our own measurement drawing) at their measured sizes, lamp, counter and table one above the other 24 units apart, 3 px a unit', [])
    scene, used = props_scene()
    put('ezc-props', webp(scene, 'ezc-props'), "EZ Cookin's made table, counter and lamp, at the sizes the street draws them",
        'the three made decos (3x files) at the sizes the street draws them (js/practice-streets.js EZ_PROP_ART), placed as in the drawing beside it, 3 px a unit, on the same paper', used)
    for which, what, how in (('before', "Breezy, EZ Cookin' with Tiny Speck's stand-ins: store_counter, store_lamp_01, k04_table_01 (CC0)", 'the street JSON of 51a268aa9d^ served in place of today\'s'),
                             ('after', "Breezy, EZ Cookin' with its made counters and lamps", "today's street")):
        shot = os.path.join(args.shots, f'room-{which}.png')
        s = Image.open(shot).convert('RGBA')
        assert s.size == (2560, 1600), s.size
        s = s.crop((464, 120, 2440, 1280)).resize((720, 423), Image.LANCZOS)
        name = 'ezc-room-stand-ins' if which == 'before' else 'ezc-room'
        put(name, webp(s, name, q=84), what,
            f"screenshot of the game (1280 x 800, deviceScaleFactor 2): the tutorial's EZ Cooking pick (?newxp=skill&newxpskill=ezcooking_1, Aiight), the avatar placed at x 1640, {how}; the HUD cropped off (x 232-1220, y 60-640), Lanczos to 720 x 423",
            [{'shot': f'room-{which}.png', 'sha256': sha(shot)}])

    # Region maps.
    a, b, ta, pb = maps_columns()
    put('maps-thumbs', webp(a, 'maps-thumbs', lossless=True), "Tiny Speck's thumbnails of Ix, Callopee and Haoma",
        f'the three CC0 thumbnails as they are, one above the other, {GAP} px apart', [t | {'licence': 'CC0 1.0, Tiny Speck'} for t in ta])
    put('maps-painted', webp(b, 'maps-painted', q=86), 'The paintings of Ix, Callopee and Haoma made again for Groddle',
        f'the three repainted maps (2x files) at four times the thumbnails, one above the other, {GAP * 4} px apart (tools/provenance/repainted-maps.json)', pb)

    doc = {'format': 'groddle-made-showcase/1',
           'about': 'Pictures of the Made for Groddle section composed by tools/made-art/compose.py from shipped files and three game screenshots; tools/made-art/build-data.mjs checks each against its sha256.',
           'files': dict(sorted(rec.items()))}
    open(REC, 'w').write(json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
    for f in os.listdir(TMP):
        os.remove(os.path.join(TMP, f))
    os.rmdir(TMP)
    print('\n'.join(f"{k}: {v['w']} x {v['h']}" for k, v in rec.items()))


if __name__ == '__main__':
    main()
