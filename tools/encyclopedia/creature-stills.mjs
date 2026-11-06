/**
 * Report 133: small stills of the Encyclopedia's animals and creatures, each from its own art, so a
 * creature with no pack icon need not show as its Cubimal or an empty box. Licence: every source is
 * Tiny Speck's CC0 art: a sheet the game already ships under public/assets/sprites, or (a creature
 * the game does not draw from a sheet) that creature's SWF in tinyspeck/glitch-items, rendered with
 * ffdec as the puzzle art was (`-format frame:png -export frame`). Nothing else goes in here.
 *
 * Writes public/assets/sprites/encyclopedia/<id>.png and, where the source has it, <id>@3x.png; the
 * transparent margin is trimmed. tools/encyclopedia/data.mjs STILLS points at them.
 *
 *   node tools/encyclopedia/creature-stills.mjs          write them
 *   node tools/encyclopedia/creature-stills.mjs --check  exit 1 if one is missing
 *
 * The SWF rows need ../glitch-items and tools/ffdec beside the repo (or FFDEC=<jar>); a sheet row needs only the repo.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPRITES = join(ROOT, 'public/assets/sprites');
export const STILLS_DIR = 'assets/sprites/encyclopedia';
const JAVA = '/opt/homebrew/opt/openjdk@21/bin/java';
const FFDEC = process.env.FFDEC || join(ROOT, '..', 'tools/ffdec/ffdec.jar');
const ITEMS = join(ROOT, '..', 'glitch-items');

/** One still: `sheet` (under assets/sprites) with its grid (cols x rows) and frame, or `swf` (under glitch-items). */
export const CREATURE_STILLS = Object.freeze({
  npc_piggy: { sheet: 'npc_piggy__x1_look_screen_png_1354829434.png', cols: 10, rows: 5, frame: 0 },
  npc_chicken: { sheet: 'animals/npc_chicken_stand.png', cols: 1, rows: 1, frame: 0 },
  npc_crab: { sheet: 'crabs/npc_crab_idle1.webp', cols: 6, rows: 5, frame: 0 },
  npc_firefly: { sheet: 'resources/firefly-full-path.png', cols: 10, rows: 9, frame: 0 },
  npc_sloth: { sheet: 'newxp/sloth.png', cols: 1, rows: 1, frame: 0 },
  // Flamingo Flamingo's one idle frame (two heads, one bird: newxp-feature's modes.idle).
  npc_flamingo: { sheet: 'newxp/flamingo_idle.png', cols: 1, rows: 1, frame: 0 },
  npc_dustbunny: { sheet: 'newxp/dustbunny_idle.png', cols: 9, rows: 20, frame: 0 },
  npc_juju_bandit: { sheet: 'juju_bandit/juju_green_black_idle1.webp', cols: 8, rows: 8, frame: 16 },
  npc_squid: { sheet: 'quest-rooms/gwendolyn/squid_blue_idle.webp', cols: 4, rows: 12, frame: 0 },
  npc_swoonerfly: { swf: 'inhabitants/swoonerfly/npc_swoonerfly.swf' },
  npc_blimp: { swf: 'misc/npc/npc_blimp/npc_blimp.swf' },
  npc_catch_me_ghost: { swf: 'inhabitants/ghost/npc_catch_me_ghost.swf' },
});

const stillPath = (id, hi) => join(ROOT, 'public', STILLS_DIR, `${id}${hi ? '@3x' : ''}.png`);

const size = (file) => execFileSync('magick', ['identify', '-format', '%w %h\n', file], { encoding: 'utf8' }).split('\n')[0].split(' ').map(Number);

/** The frame of a sheet, its transparent margin trimmed (ImageMagick). */
function writeCell(file, { cols, rows, frame }, out) {
  const [width, height] = size(file);
  const w = Math.floor(width / cols);
  const h = Math.floor(height / rows);
  const crop = `${w}x${h}+${(frame % cols) * w}+${Math.floor(frame / cols) * h}`;
  execFileSync('magick', [file, '-crop', crop, '+repage', '-trim', '+repage', '-strip', `PNG32:${out}`]);
}

function writeSwf(swf, zoom, out) {
  const dir = mkdtempSync(join(tmpdir(), 'creature-still-'));
  try {
    execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(zoom), '-ignorebackground', '-select', '1', '-format', 'frame:png', '-export', 'frame', dir, join(ITEMS, swf)], { stdio: 'ignore' });
    const png = readdirSync(dir).find((f) => f.endsWith('.png'));
    execFileSync('magick', [join(dir, png), '-trim', '+repage', '-strip', `PNG32:${out}`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function write(id, row) {
  mkdirSync(join(ROOT, 'public', STILLS_DIR), { recursive: true });
  if (row.swf) {
    writeSwf(row.swf, 1, stillPath(id));
    writeSwf(row.swf, 3, stillPath(id, true));
    return;
  }
  writeCell(join(SPRITES, row.sheet), row, stillPath(id));
  const hi = join(SPRITES, row.sheet.replace(/\.(png|webp)$/, '@3x.webp'));
  if (existsSync(hi)) writeCell(hi, row, stillPath(id, true));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const missing = Object.keys(CREATURE_STILLS).filter((id) => !existsSync(stillPath(id)));
    if (missing.length) {
      console.error(`creature stills missing: ${missing.join(', ')}`);
      process.exit(1);
    }
  } else {
    for (const [id, row] of Object.entries(CREATURE_STILLS)) write(id, row);
  }
}
