/**
 * Styled player avatar helpers + asset checks.
 * Run: node --test tests/avatar.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  AVATAR_SHEETS,
  expectedFrameCount,
  facingScaleX,
  facingFromVelocity,
  walkFrameRects,
  assertStyledAvatarPng,
} from '../public/js/avatar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const spritesDir = join(__dirname, '../public/assets/sprites');

describe('avatar sheet config', () => {
  it('walk sheet has multiple frames', () => {
    assert.equal(expectedFrameCount(AVATAR_SHEETS.walk), 8);
    assert.ok(expectedFrameCount(AVATAR_SHEETS.walk) > 1);
    const rects = walkFrameRects(AVATAR_SHEETS.walk);
    assert.equal(rects.length, 8);
    assert.equal(rects[0].w, 172);
    assert.equal(rects[0].h, AVATAR_SHEETS.walk.fh);
    assert.equal(rects[7].x, 172 * 7);
  });

  it('idle is a single whole frame', () => {
    assert.equal(expectedFrameCount(AVATAR_SHEETS.idle), 1);
    assert.equal(AVATAR_SHEETS.idle.whole, true);
  });

  it('styled asset paths exist on disk', () => {
    for (const sheet of [AVATAR_SHEETS.idle, AVATAR_SHEETS.walk]) {
      const rel = sheet.url.replace(/^assets\/sprites\//, '');
      const path = join(spritesDir, rel);
      assert.ok(existsSync(path), `missing ${path}`);
    }
  });

  it('walk strip frames differ in the feet region (not 8 static copies)', () => {
    const path = join(spritesDir, 'avatar_styled_walk.png');
    // Pure PNG decode via python for reliability
    const out = execFileSync(
      '/usr/bin/python3',
      [
        '-c',
        `
import struct,zlib,hashlib
from pathlib import Path
p=Path(${JSON.stringify(path)})
with open(p,'rb') as f:
    assert f.read(8)==b'\\x89PNG\\r\\n\\x1a\\n'
    w=h=None; idat=b''
    while True:
        length=struct.unpack('>I', f.read(4))[0]
        ctype=f.read(4); data=f.read(length); f.read(4)
        if ctype==b'IHDR': w,h=struct.unpack('>II', data[:8])
        elif ctype==b'IDAT': idat+=data
        elif ctype==b'IEND': break
    raw=zlib.decompress(idat)
    bpp=4; stride=w*bpp; rows=[]; i=0; prev=bytearray(stride)
    for y in range(h):
        ft=raw[i]; i+=1
        row=bytearray(raw[i:i+stride]); i+=stride
        if ft==1:
            for x in range(bpp,stride): row[x]=(row[x]+row[x-bpp])&255
        elif ft==2:
            for x in range(stride): row[x]=(row[x]+prev[x])&255
        elif ft==3:
            for x in range(stride):
                left=row[x-bpp] if x>=bpp else 0
                row[x]=(row[x]+((left+prev[x])//2))&255
        elif ft==4:
            for x in range(stride):
                a=row[x-bpp] if x>=bpp else 0
                b=prev[x]; c=prev[x-bpp] if x>=bpp else 0
                p0=a+b-c; pa,pb,pc=abs(p0-a),abs(p0-b),abs(p0-c)
                pr=a if pa<=pb and pa<=pc else (b if pb<=pc else c)
                row[x]=(row[x]+pr)&255
        rows.append(bytes(row)); prev=row
fw=172
assert w//fw>=8
hashes=[]
for fi in range(8):
    m=hashlib.md5()
    x0=fi*fw
    for y in range(int(h*0.65), h):
        m.update(rows[y][x0*4:(x0+fw)*4])
    hashes.append(m.hexdigest())
print(len(set(hashes)))
print(','.join(h[:8] for h in hashes))
`,
      ],
      { encoding: 'utf8' },
    );
    const unique = parseInt(out.trim().split('\n')[0], 10);
    assert.ok(unique >= 4, `expected ≥4 unique foot frames, got ${unique}`);
  });
});

describe('facing helpers', () => {
  it('facingScaleX flips for right (art faces left by default)', () => {
    // Source sprites face left → positive scale = left, negative = right
    assert.equal(facingScaleX(0.55, 'left'), 0.55);
    assert.equal(facingScaleX(0.55, 'right'), -0.55);
    assert.equal(facingScaleX(-0.55, 'left'), 0.55);
  });

  it('facingFromVelocity tracks direction', () => {
    assert.equal(facingFromVelocity(-1, 'right'), 'left');
    assert.equal(facingFromVelocity(1, 'left'), 'right');
    assert.equal(facingFromVelocity(0, 'left'), 'left');
  });
});

describe('styled asset multi-color', () => {
  it('idle PNG is multi-color clothed art (not monochrome mannequin)', () => {
    const path = join(spritesDir, 'avatar_styled_idle.png');
    const buf = readFileSync(path);
    assertStyledAvatarPng(buf);
    assert.ok(buf.length > 8000, 'styled idle should be a substantial PNG');

    const out = execFileSync(
      '/usr/bin/python3',
      [
        '-c',
        `
from PIL import Image
import statistics as st
im=Image.open(${JSON.stringify(path)}).convert('RGBA')
colors=set(); px=im.load(); w,h=im.size
rs=[]; gs=[]; bs=[]
for y in range(0,h,3):
  for x in range(0,w,3):
    r,g,b,a=px[x,y]
    if a>200:
      colors.add((r//10,g//10,b//10))
      rs.append(r); gs.append(g); bs.append(b)
print(len(colors))
print(st.pstdev(rs), st.pstdev(gs), st.pstdev(bs))
# channel means should not all be equal (not pure grey mannequin)
print(st.mean(rs), st.mean(gs), st.mean(bs))
`,
      ],
      { encoding: 'utf8' },
    );
    const lines = out.trim().split('\n');
    const nColors = parseInt(lines[0], 10);
    assert.ok(nColors >= 20, `expected multi-color avatar, got ${nColors}`);
    const means = lines[2].trim().split(/\s+/).map(Number);
    // greyscale mannequin would have nearly equal R=G=B means
    const spread = Math.max(...means) - Math.min(...means);
    assert.ok(spread > 5, `expected chromatic spread, got ${spread} means=${means}`);
  });

  it('game.js default player sheets point at styled assets', () => {
    const gameJs = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    assert.match(gameJs, /avatarStyledWalk|avatar_styled_walk/);
    assert.match(gameJs, /avatarStyledIdle|avatar_styled_idle/);
    assert.doesNotMatch(
      gameJs,
      /avatarWalk:\s*\{\s*url:\s*'assets\/sprites\/avatar_walk_vector/,
    );
  });
});
