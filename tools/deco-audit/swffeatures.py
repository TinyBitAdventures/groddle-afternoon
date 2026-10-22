"""Display-list features of a deco SWF that the coU-decos PNG export mishandled or that FFDec may
render differently from Flash: masks (clipDepth), blend modes, filters, colour transforms.
Reads tags only; nothing in the SWF is executed."""
import struct, sys, os

sys.dont_write_bytecode = True  # no __pycache__ in tools/
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icon-hires'))
import swfinfo  # noqa: E402

BLENDS = {0: 'normal', 1: 'normal', 2: 'layer', 3: 'multiply', 4: 'screen', 5: 'lighten', 6: 'darken',
          7: 'difference', 8: 'add', 9: 'subtract', 10: 'invert', 11: 'alpha', 12: 'erase', 13: 'overlay',
          14: 'hardlight'}
FILTERS = {0: 'dropshadow', 1: 'blur', 2: 'glow', 3: 'bevel', 4: 'gradientglow', 5: 'convolution',
           6: 'colormatrix', 7: 'gradientbevel'}


class Bits:
    def __init__(self, b, p):
        self.b, self.p, self.bit = b, p, 0

    def ub(self, n):
        v = 0
        for _ in range(n):
            byte = self.b[self.p]
            v = (v << 1) | ((byte >> (7 - self.bit)) & 1)
            self.bit += 1
            if self.bit == 8:
                self.bit = 0; self.p += 1
        return v

    def align(self):
        if self.bit:
            self.bit = 0; self.p += 1
        return self.p


def skip_matrix(b, p):
    r = Bits(b, p)
    if r.ub(1):
        n = r.ub(5); r.ub(n); r.ub(n)
    if r.ub(1):
        n = r.ub(5); r.ub(n); r.ub(n)
    n = r.ub(5); r.ub(n); r.ub(n)
    return r.align()


def skip_cxform_alpha(b, p):
    r = Bits(b, p)
    add, mult = r.ub(1), r.ub(1)
    n = r.ub(4)
    if mult:
        for _ in range(4): r.ub(n)
    if add:
        for _ in range(4): r.ub(n)
    return r.align()


def skip_filters(b, p, found):
    n = b[p]; p += 1
    for _ in range(n):
        fid = b[p]; p += 1
        found.add('filter:' + FILTERS.get(fid, str(fid)))
        if fid == 0: p += 23
        elif fid == 1: p += 9
        elif fid == 2: p += 15
        elif fid == 3: p += 27
        elif fid in (4, 7):
            nc = b[p]; p += 1 + 5 * nc + 19
        elif fid == 5:
            mx, my = b[p], b[p + 1]; p += 2 + 8 + 4 * mx * my + 4 + 1
        elif fid == 6: p += 80
        else:
            raise ValueError('filter %d' % fid)
    return p


def features(path):
    body = swfinfo.swf_body(path)[0]
    found = set()
    for code, q, ln in swfinfo.tags(body, swfinfo.rect_len(body) + 4, len(body)):
        if code == 26:
            f = body[q]
            if f & 0x40: found.add('mask')
            if f & 0x08: found.add('cxform')
        elif code == 70:
            f, f2 = body[q], body[q + 1]
            if f & 0x40: found.add('mask')
            if f & 0x08: found.add('cxform')
            if not f2 & 0x03:
                continue
            try:
                p = q + 4
                if f2 & 0x08 or (f2 & 0x10 and f & 0x02):
                    p = body.index(0, p) + 1
                if f & 0x02: p += 2
                if f & 0x04: p = skip_matrix(body, p)
                if f & 0x08: p = skip_cxform_alpha(body, p)
                if f & 0x10: p += 2
                if f & 0x20: p = body.index(0, p) + 1
                if f & 0x40: p += 2
                if f2 & 0x01: p = skip_filters(body, p, found)
                if f2 & 0x02:
                    m = BLENDS.get(body[p], str(body[p]))
                    if m not in ('normal', 'layer'):
                        found.add('blend:' + m)
            except (ValueError, IndexError) as e:
                found.add('unparsed')
    return sorted(found)


if __name__ == '__main__':
    for f in sys.argv[1:]:
        print(f, features(f))
