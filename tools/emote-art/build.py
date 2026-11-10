#!/usr/bin/env python3.11 -I
"""The Plank's own swing, for the player who is splanked (lane refsart, register G646).

Source: glitch-GameServerJS items/plank.js 70-78 sends the target a vp_overlay, item_class plank,
state emote_animation, for 10 s. plank.swf's emote_animation scene is 90 frames (root timeline
6-95) and ends on a stop(): at the client's 30 frames a second it plays once, in 3 s.

Tiny Speck's OGA recording of it (opengameart/*/glitch-assets/plank/plank__x1_emote_animation_png_
1354829970.png, CC0) is 3920 x 3492: 8 x 12 cells of 490 x 291, the first 88 drawn and frames 89
and 90 empty (measured here, and by the empty bands between the cells: the art sits every 490 px
across and every 291 px down. Cut as 10 x 9 cells of 392 x 388 it shows two planks at once). This
writes the 90 cells, in order,
as one animated WebP that plays once (lossless, 100 ms / 3 a frame), the way the Emotional Bear's
emotes ship (public/assets/sprites/emotional-bear/*.webp).

  python3.11 -I tools/emote-art/build.py            writes public/assets/sprites/emotes/plank.webp and emotes.json
  python3.11 -I tools/emote-art/build.py --check    exit 1 when stale: with the OGA dump beside the repo the
        file's frames are compared with the sheet's cells; without it, with emotes.json (size, frames, sha256).
"""
import glob
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(SPIKE, 'public', 'assets', 'sprites', 'emotes', 'plank.webp')
META = os.path.join(HERE, 'emotes.json')
SHEET = 'plank__x1_emote_animation_png_1354829970.png'
FW, FH, COLS, ROWS, FRAMES, FPS = 490, 291, 8, 12, 90, 30
# The recording's last two frames are empty: the stars have gone.
BLANK = (88, 89)


def audit_dir():
    for d in (os.environ.get('GLITCH_AUDIT'), os.path.dirname(SPIKE), os.path.expanduser('~/Documents/glitch-audit')):
        if d and os.path.isdir(os.path.join(d, 'opengameart')):
            return d
    return None


def cells():
    from PIL import Image
    hits = sorted(glob.glob(os.path.join(audit_dir(), 'opengameart', '*', 'glitch-assets', 'plank', SHEET)))
    if not hits:
        raise SystemExit(f'{SHEET} is not under opengameart/*/glitch-assets/plank/')
    im = Image.open(hits[0]).convert('RGBA')
    if im.size != (FW * COLS, FH * ROWS):
        raise SystemExit(f'{SHEET}: {im.size} is not {COLS} x {ROWS} cells of {FW} x {FH}')
    for k in range(FRAMES, COLS * ROWS):
        if im.crop(((k % COLS) * FW, (k // COLS) * FH, (k % COLS + 1) * FW, (k // COLS + 1) * FH)).getchannel('A').getbbox():
            raise SystemExit(f'{SHEET}: cell {k} past the {FRAMES} frames holds art')
    out = []
    for k in range(FRAMES):
        c = im.crop(((k % COLS) * FW, (k // COLS) * FH, (k % COLS + 1) * FW, (k // COLS + 1) * FH))
        if bool(c.getchannel('A').getbbox()) == (k in BLANK):
            raise SystemExit(f'{SHEET}: frame {k} is {"drawn" if k in BLANK else "empty"}; wrong grid?')
        out.append(c)
    return out


def seen(img):
    """What is drawn: the colour under a fully transparent pixel is not kept by the encoder."""
    from PIL import Image
    blank = Image.new('RGBA', img.size, (0, 0, 0, 0))
    return Image.composite(img, blank, img.getchannel('A').point(lambda a: 255 if a else 0)).tobytes()


def duration(k):
    # 30 frames a second: 33, 33 and 34 ms in turn.
    return 34 if k % 3 == 2 else 33


def shipped_frames():
    """The picture shown during each of the 90 frames' own time (the encoder joins frames that are the same)."""
    from PIL import Image, ImageSequence
    im = Image.open(OUT)
    shown = []
    for f in ImageSequence.Iterator(im):
        f.load()  # the frame's duration is known once it is decoded
        shown.append((f.info.get('duration') or 0, f.convert('RGBA')))
    out, at, i, end = [], 0, 0, shown[0][0] if shown else 0
    for k in range(FRAMES):
        while i < len(shown) - 1 and at >= end:
            i += 1
            end += shown[i][0]
        out.append(shown[i][1])
        at += duration(k)
    total = sum(d for d, _ in shown)
    return out, total


def meta():
    return {'file': 'assets/sprites/emotes/plank.webp', 'size': [FW, FH], 'frames': FRAMES, 'fps': FPS, 'loop': 1,
            'oga': {'file': SHEET, 'size': [FW * COLS, FH * ROWS], 'cols': COLS, 'rows': ROWS, 'blank': list(BLANK)},
            'swf': {'path': 'food/plank/plank.swf', 'scene': 'emote_animation', 'frames': [6, 95]},
            'sha256': hashlib.sha256(open(OUT, 'rb').read()).hexdigest()}


def main():
    check = '--check' in sys.argv
    have = audit_dir() is not None
    if not check:
        frames = cells()
        with tempfile.TemporaryDirectory() as tmp:
            for k, c in enumerate(frames):
                c.save(os.path.join(tmp, f'{k:03d}.png'))
            args = ['img2webp', '-loop', '1', '-lossless', '-m', '6']
            for k in range(FRAMES):
                args += ['-d', str(duration(k)), os.path.join(tmp, f'{k:03d}.png')]
            os.makedirs(os.path.dirname(OUT), exist_ok=True)
            subprocess.run(args + ['-o', OUT], check=True, capture_output=True)
        json.dump(meta(), open(META, 'w'), indent=1)
        open(META, 'a').write('\n')
        print(f'{OUT}: {FRAMES} frames of {FW}x{FH}, {os.path.getsize(OUT)} bytes')
        return
    stale = []
    if not os.path.exists(OUT) or not os.path.exists(META):
        stale.append('plank.webp or emotes.json is missing')
    else:
        want = json.load(open(META))
        if want != meta():
            stale.append('emotes.json does not describe plank.webp')
        if have:
            got, total = shipped_frames()
            src = cells()
            if total != sum(duration(k) for k in range(FRAMES)) or any(g.size != (FW, FH) or seen(g) != seen(s) for g, s in zip(got, src)):
                stale.append("plank.webp is not the OGA sheet's 90 cells")
    if stale:
        print('\n'.join(stale))
        sys.exit(1)
    print('emote art: 1 current' + ('' if have else ' (no OGA dump: checked against emotes.json)'))


if __name__ == '__main__':
    main()
