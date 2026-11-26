#!/usr/bin/env python3.11
"""The street map's door icons, one per kind of way out (#645, Austin 2026-11-26): a dinosaur's
mouth, a portal and a plain door (public/js/ui/street-minimap.js DOOR_ART, doorLook).

Glitch's street map had no door marks, so it had no icons for them: these are ours, but every one is
Tiny Speck's own CC0 art, scaled down, with nothing drawn:
  dino    door_dino_01, the blue dinosaur entrance (public/assets/decos/groddle/door_dino_01@1.5x.webp,
          the deco the game draws on Cinnabar Chibe)
  portal  familiar_dialog_teleport, the teleporter in the client's teleport dialog
          (glitch-client TSEngineAssets graphics/familiar_dialog_teleport.png, shipped byte for byte as
          public/assets/classic/familiar_dialog_teleport.webp)
  door    furniture_door, the house's wooden door (glitch-items furniture_door,
          public/assets/sprites/furniture/furniture_door@3x.webp)

Each is cropped to its drawn pixels, fitted centred in a square (Lanczos) and written lossless:
`<name>.webp` at the computer card's 12 px and `<name>_hd.webp` at 96 px for the phone sheet (26 CSS px,
about 79 device px on a 3x screen) and high-DPI screens (markArt's srcset).

Usage (python3.11 has Pillow):
  python3.11 -I tools/build-minimap-door-icons.py           write public/assets/ui/minimap/
  python3.11 -I tools/build-minimap-door-icons.py --check   exit 1 when a file is missing or its pixels differ
"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(HERE)
PUBLIC = os.path.join(SPIKE, 'public')
OUT = os.path.join(PUBLIC, 'assets', 'ui', 'minimap')

ICONS = {
    'door_look_dino': 'assets/decos/groddle/door_dino_01@1.5x.webp',
    'door_look_portal': 'assets/classic/familiar_dialog_teleport.webp',
    'door_look_door': 'assets/sprites/furniture/furniture_door@3x.webp',
}
SIZES = {'': 12, '_hd': 96}


def render(src, px):
    im = Image.open(os.path.join(PUBLIC, src)).convert('RGBA')
    box = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(box)
    w, h = im.size
    s = px / max(w, h)
    im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    out = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    out.alpha_composite(im, ((px - im.width) // 2, (px - im.height) // 2))
    return out


def same(a, b):
    # Fully clear pixels may keep any colour through an encoder; compare what shows.
    if a.size != b.size:
        return False
    pa, pb = a.tobytes(), b.tobytes()
    return all(pa[i:i + 4] == pb[i:i + 4] or (pa[i + 3] == 0 and pb[i + 3] == 0) for i in range(0, len(pa), 4))


def main():
    check = '--check' in sys.argv[1:]
    bad = []
    for name, src in ICONS.items():
        for suffix, px in SIZES.items():
            path = os.path.join(OUT, f'{name}{suffix}.webp')
            img = render(src, px)
            if check:
                if not os.path.exists(path) or not same(Image.open(path).convert('RGBA'), img):
                    bad.append(os.path.relpath(path, SPIKE))
                continue
            os.makedirs(OUT, exist_ok=True)
            img.save(path, 'WEBP', lossless=True, quality=100, method=6, exact=False)
            print(os.path.relpath(path, SPIKE), f'{px}x{px}', os.path.getsize(path), 'bytes')
    if bad:
        print('stale or missing (run python3.11 -I tools/build-minimap-door-icons.py):', *bad, sep='\n  ')
        sys.exit(1)
    if check:
        print('minimap door icons current')


if __name__ == '__main__':
    main()
