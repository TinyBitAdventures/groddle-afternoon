/**
 * Player avatar: facing helpers, and the retired bitmap avatars stay gone.
 * Run: node --test tests/avatar.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { facingScaleX, facingFromVelocity } from '../public/js/avatar.js?v=c4da73ea';
import { VECTOR_AVATAR } from '../public/js/avatar-vector-sheets.js?v=ad801376';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

/** Every file under public/. */
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}

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

describe('bitmap avatars retired', () => {
  // Players' avatars captured by Wayback (the classic and alt portraits, the
  // 62d8dab1 sheets) are reference only: none ship, nothing points at them.
  const RETIRED = /avatar_styled_|avatar_alt\.png|avatar_player\.png|avatar\/glitch-62d8|avatar\/crowd\//;

  it('ships none of the player sheets or portraits', () => {
    const sprites = join(pub, 'assets/sprites');
    for (const f of ['avatar_styled_idle.png', 'avatar_styled_walk.png', 'avatar_styled_alt.png', 'avatar_alt.png', 'avatar_player.png', 'avatar/glitch-62d8']) {
      assert.ok(!existsSync(join(sprites, f)), f);
    }
    for (const f of readdirSync(sprites)) assert.doesNotMatch(f, /^avatar_styled_/, f);
  });

  it('no game code, page or style refers to them', () => {
    const top = readdirSync(pub).map((n) => join(pub, n)).filter((p) => statSync(p).isFile());
    const dirs = ['js', 'play', 'restoration', 'landing', 'compare', 'site', 'avatar-lab'].map((d) => join(pub, d)).filter(existsSync);
    const code = [...top, ...dirs.flatMap((d) => files(d))].filter((f) => ['.js', '.mjs', '.css', '.html'].includes(extname(f)));
    assert.ok(code.length > 50);
    for (const f of code) {
      const src = readFileSync(f, 'utf8');
      assert.doesNotMatch(src, RETIRED, f.slice(pub.length));
      assert.doesNotMatch(src, /\bavatarStyled(Walk|Idle|Alt)\b|\bglitchAvatar(Base|Jump|Climb)\b|GLITCH_AVATAR\b/, f.slice(pub.length));
    }
  });

  it('the player draws the vector Glitch, walk, climb and jump from its own sheets', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    for (const s of ['vectorAvatarBase', 'vectorAvatarJump', 'vectorAvatarClimb']) assert.ok(game.includes(s), s);
    for (const s of ['base', 'jump', 'climb']) assert.ok(existsSync(join(pub, VECTOR_AVATAR.dir, VECTOR_AVATAR.sheets[s].file)), s);
    assert.doesNotMatch(game, /syncClimbBorrow|climbBorrow|recolorGlitchSheet|glitchAnimPack/);
  });
});
