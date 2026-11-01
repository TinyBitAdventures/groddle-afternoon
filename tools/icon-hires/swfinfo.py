"""Root-timeline info for a SWF: frame count, scene + frame labels, stage size, labelled sprites."""
import sys, zlib, lzma, struct, json

def swf_body(path):
    """The uncompressed SWF body (everything after the 8-byte header) and the version byte."""
    d = open(path, 'rb').read()
    sig = d[:3]
    if sig == b'FWS': body = d[8:]
    elif sig == b'CWS': body = zlib.decompress(d[8:])
    elif sig == b'ZWS':
        props = d[12:17]; body = lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[lzma._decode_filter_properties(lzma.FILTER_LZMA1, props)]).decompress(d[17:])
    else: raise ValueError(sig)
    return body, d[3]


def rect_len(body):
    nbits = body[0] >> 3
    return (5 + 4 * nbits + 7) // 8


def tags(body, start, end):
    """Yield (code, data_offset, data_length) for the tags in body[start:end], sprites included."""
    p = start
    while p < end:
        h = struct.unpack_from('<H', body, p)[0]; p += 2
        code, ln = h >> 6, h & 0x3f
        if ln == 0x3f: ln = struct.unpack_from('<I', body, p)[0]; p += 4
        yield code, p, ln
        if code == 39:
            yield from tags(body, p + 4, p + ln)
        if code == 0: return
        p += ln


def rewrite(path, out, pad=1.0, swaps=None):
    """Write an uncompressed copy of the SWF for rendering:
    - the stage grows by `pad` stage sizes on every side, so FFDec frame exports keep art drawn
      outside the authored stage (furniture registers at its bottom centre, lamps hang above it);
    - `swaps` {old character id: new} changes which symbol a PlaceObject puts down, for items
      whose state is picked by code (firefly_jar shows flies_1 in its icon, the SWF places flies_7)."""
    b, ver = swf_body(path)
    b = bytearray(b)
    info = read(path)
    x0, x1, y0, y1 = info['rect']
    dx, dy = (x1 - x0) * pad, (y1 - y0) * pad
    vals = [round((x0 - dx) * 20), round((x1 + dx) * 20), round((y0 - dy) * 20), round((y1 + dy) * 20)]
    nb = max(v.bit_length() + 1 for v in vals) if any(vals) else 1
    bits = nb
    for v in vals: bits = (bits << nb) | (v & ((1 << nb) - 1))
    tot = 5 + 4 * nb; nbytes = (tot + 7) // 8
    rect = (bits << (nbytes * 8 - tot)).to_bytes(nbytes, 'big')
    if swaps:
        swaps = {int(k): int(v) for k, v in swaps.items()}
        for code, q, ln in list(tags(b, rect_len(b) + 4, len(b))):
            if code == 26 and b[q] & 0x02:      # PlaceObject2 with a character
                at = q + 3
            elif code == 70 and b[q] & 0x02:    # PlaceObject3 with a character
                at = q + 4
                if b[q + 1] & 0x08 or (b[q + 1] & 0x10 and b[q] & 0x02):
                    at = b.index(0, at) + 1
            else:
                continue
            cid = struct.unpack_from('<H', b, at)[0]
            if cid in swaps: struct.pack_into('<H', b, at, swaps[cid])
    body = rect + bytes(b[rect_len(b):])
    open(out, 'wb').write(b'FWS' + bytes([ver]) + struct.pack('<I', len(body) + 8) + body)


class _Bits:
    """Big-endian bit reader over a bytes object from byte offset p (SWF MATRIX / CXFORM records)."""
    def __init__(self, b, p):
        self.b, self.bit = b, p * 8

    def u(self, n):
        v = 0
        for _ in range(n):
            v = (v << 1) | ((self.b[self.bit >> 3] >> (7 - (self.bit & 7))) & 1)
            self.bit += 1
        return v

    def end(self):
        return (self.bit + 7) // 8


def place_name(body, code, q):
    """The instance name of a PlaceObject2 (26) / PlaceObject3 (70) tag whose data starts at q, or None."""
    f1 = body[q]
    f2 = body[q + 1] if code == 70 else 0
    p = q + (2 if code == 70 else 1) + 2          # flags, depth
    if code == 70 and (f2 & 0x08 or (f2 & 0x10 and f1 & 0x02)):
        p = body.index(0, p) + 1                  # class name
    if f1 & 0x02:
        p += 2                                    # character id
    if f1 & 0x04:                                 # MATRIX
        r = _Bits(body, p)
        if r.u(1): n = r.u(5); r.u(2 * n)
        if r.u(1): n = r.u(5); r.u(2 * n)
        n = r.u(5); r.u(2 * n)
        p = r.end()
    if f1 & 0x08:                                 # CXFORMWITHALPHA
        r = _Bits(body, p)
        add, mult, n = r.u(1), r.u(1), r.u(4)
        r.u(4 * n * (add + mult))
        p = r.end()
    if f1 & 0x10:
        p += 2                                    # ratio
    if not f1 & 0x20:
        return None
    return body[p:body.index(0, p)].decode('latin1')


def root_names(path):
    """Instance names placed on the root timeline."""
    body = swf_body(path)[0]
    out = []
    p = rect_len(body) + 4
    while p < len(body):
        h = struct.unpack_from('<H', body, p)[0]; p += 2
        code, ln = h >> 6, h & 0x3f
        if ln == 0x3f: ln = struct.unpack_from('<I', body, p)[0]; p += 4
        if code == 0: break
        if code in (26, 70):
            nm = place_name(body, code, p)
            if nm: out.append(nm)
        p += ln
    return out


def drop_root_places(path, out, names):
    """Write an uncompressed copy of the SWF without the root-timeline PlaceObject tags that put
    down an instance named in `names` (a state child its code hides by default, e.g. a door deco's
    `sign`, which the client only shows for a house that is for sale). Returns the names dropped."""
    body, ver = swf_body(path)
    keep, dropped = [], []
    p = rect_len(body) + 4
    keep.append(body[:p])
    while p < len(body):
        start = p
        h = struct.unpack_from('<H', body, p)[0]; p += 2
        code, ln = h >> 6, h & 0x3f
        if ln == 0x3f: ln = struct.unpack_from('<I', body, p)[0]; p += 4
        nm = place_name(body, code, p) if code in (26, 70) else None
        p += ln
        if nm in names:
            dropped.append(nm)
        else:
            keep.append(body[start:p])
        if code == 0:
            keep.append(body[p:])
            break
    new = b''.join(keep)
    open(out, 'wb').write(b'FWS' + bytes([ver]) + struct.pack('<I', len(new) + 8) + new)
    return dropped


def read(path):
    body = swf_body(path)[0]
    nbits = body[0] >> 3
    rb = (5 + 4 * nbits + 7) // 8
    bits = int.from_bytes(body[:rb], 'big'); tot = rb * 8
    vals = []
    for k in range(4):
        sh = tot - 5 - (k + 1) * nbits
        v = (bits >> sh) & ((1 << nbits) - 1)
        if v >> (nbits - 1): v -= 1 << nbits
        vals.append(v / 20)
    p = rb + 4
    frame = 0; labels = {}; scenes = {}; classes = []; sprites = {}
    while p < len(body):
        h = struct.unpack_from('<H', body, p)[0]; p += 2
        code, ln = h >> 6, h & 0x3f
        if ln == 0x3f: ln = struct.unpack_from('<I', body, p)[0]; p += 4
        t = body[p:p + ln]; p += ln
        if code == 0: break
        if code == 1: frame += 1
        elif code == 43: labels[t.split(b'\0')[0].decode('latin1')] = frame + 1
        elif code == 86:
            q = 0
            def u30():
                nonlocal q
                v = s = 0
                while True:
                    x = t[q]; q += 1; v |= (x & 0x7f) << s; s += 7
                    if not x & 0x80: return v
            n = u30()
            for _ in range(n):
                off = u30(); e = t.index(0, q); nm = t[q:e].decode('latin1'); q = e + 1; scenes[nm] = off + 1
            n = u30()
            for _ in range(n):
                fn = u30(); e = t.index(0, q); nm = t[q:e].decode('latin1'); q = e + 1; labels.setdefault(nm, fn + 1)
        elif code == 39:
            sid, nf = struct.unpack_from('<HH', t, 0); q = 4; sf = 0; sl = {}
            while q < len(t):
                hh = struct.unpack_from('<H', t, q)[0]; q += 2
                c2, l2 = hh >> 6, hh & 0x3f
                if l2 == 0x3f: l2 = struct.unpack_from('<I', t, q)[0]; q += 4
                if c2 == 0: break
                if c2 == 1: sf += 1
                elif c2 == 43: sl[t[q:q + l2].split(b'\0')[0].decode('latin1')] = sf + 1
                q += l2
            sprites[sid] = {'frames': nf, 'labels': sl}
        elif code == 76:
            n = struct.unpack_from('<H', t, 0)[0]; q = 2
            for _ in range(n):
                q += 2; e = t.index(0, q); classes.append(t[q:e].decode('latin1')); q = e + 1
    return {'frames': frame, 'stage': [vals[1] - vals[0], vals[3] - vals[2]], 'rect': vals, 'scenes': scenes, 'labels': labels, 'classes': classes[:6],
            'sprites': {k: v for k, v in sprites.items() if v['labels']}}

if __name__ == '__main__':
    out = {}
    for f in sys.argv[1:]:
        try: out[f] = read(f)
        except Exception as e: out[f] = {'error': str(e)}
    print(json.dumps(out, indent=0))
