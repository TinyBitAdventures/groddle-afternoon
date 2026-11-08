"""Lossless WebP for the game's raster art, for the Python generators (see tools/webp-lossless.mjs).

Austin 2026-11-07: every picture the game ships is lossless WebP where that is smaller. The
encoder is `cwebp -lossless -z 9 -exact -metadata none`, so the WebP decodes to exactly the
PNG's pixels (alpha and the colour under transparent pixels included).
"""
import os
import subprocess
import tempfile

CWEBP_ARGS = ['-quiet', '-lossless', '-z', '9', '-exact', '-metadata', 'none']


def encode(src, dst):
    """Encode the picture file src to the lossless WebP dst."""
    tmp = f'{dst}.tmp-{os.getpid()}.webp'
    subprocess.run(['cwebp', *CWEBP_ARGS, src, '-o', tmp], check=True, stdout=subprocess.DEVNULL)
    os.replace(tmp, dst)
    return dst


def save(img, dst):
    """Save a PIL image as lossless WebP at dst (through a temporary PNG, so cwebp does the encode)."""
    fd, tmp = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    try:
        img.save(tmp, format='PNG')
        return encode(tmp, dst)
    finally:
        os.unlink(tmp)


def webp_name(path):
    """The path with its .png/.jpg ending swapped for .webp."""
    root, ext = os.path.splitext(path)
    return root + '.webp' if ext.lower() in ('.png', '.jpg', '.jpeg') else path
