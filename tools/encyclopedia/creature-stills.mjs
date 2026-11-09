/**
 * Report 133: small stills of the Encyclopedia's animals and creatures, each from its own art, so a
 * creature with no pack icon need not show as its Cubimal or an empty box. Licence: every source is
 * Tiny Speck's CC0 art: a sheet the game already ships under public/assets/sprites, or (a creature
 * the game does not draw from a sheet) that creature's SWF in tinyspeck/glitch-items, rendered with
 * ffdec as the puzzle art was (`-format frame:png -export frame`). Nothing else goes in here.
 *
 * Writes public/assets/sprites/encyclopedia/<id>.webp and, where the source has it, <id>@3x.webp (lossless); the
 * transparent margin is trimmed. tools/encyclopedia/data.mjs STILLS points at them.
 *
 *   node tools/encyclopedia/creature-stills.mjs [id...]  write them (all, or those ids)
 *   node tools/encyclopedia/creature-stills.mjs --check  exit 1 if one is missing
 *
 * The SWF rows need ../glitch-items and tools/ffdec beside the repo (or FFDEC=<jar>); a sheet row needs only the repo.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replacePngWithWebp } from '../webp-lossless.mjs';
import { JAVA } from '../java.mjs'; // $GRODDLE_JAVA, else the first Homebrew JDK (tools/java.json)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPRITES = join(ROOT, 'public/assets/sprites');
export const STILLS_DIR = 'assets/sprites/encyclopedia';
const FFDEC = process.env.FFDEC || join(ROOT, '..', 'tools/ffdec/ffdec.jar');
const ITEMS = join(ROOT, '..', 'glitch-items');

/** One still: `sheet` (under assets/sprites) with its grid (cols x rows) and frame, or `swf` (under glitch-items). */
export const CREATURE_STILLS = Object.freeze({
  npc_piggy: { sheet: 'npc_piggy__x1_look_screen_png_1354829434.webp', cols: 10, rows: 5, frame: 0 },
  npc_chicken: { sheet: 'animals/npc_chicken_stand.webp', cols: 1, rows: 1, frame: 0 },
  npc_crab: { sheet: 'crabs/npc_crab_idle1.webp', cols: 6, rows: 5, frame: 0 },
  npc_firefly: { sheet: 'resources/firefly-full-path.webp', cols: 10, rows: 9, frame: 0 },
  npc_sloth: { sheet: 'newxp/sloth.webp', cols: 1, rows: 1, frame: 0 },
  // Flamingo Flamingo's one idle frame (two heads, one bird: newxp-feature's modes.idle).
  npc_flamingo: { sheet: 'newxp/flamingo_idle.webp', cols: 1, rows: 1, frame: 0 },
  npc_dustbunny: { sheet: 'newxp/dustbunny_idle.webp', cols: 9, rows: 20, frame: 0 },
  npc_juju_bandit: { sheet: 'juju_bandit/juju_green_black_idle1.webp', cols: 8, rows: 8, frame: 16 },
  npc_squid: { sheet: 'quest-rooms/gwendolyn/squid_blue_idle.webp', cols: 4, rows: 12, frame: 0 },
  npc_swoonerfly: { swf: 'inhabitants/swoonerfly/npc_swoonerfly.swf' },
  npc_blimp: { swf: 'misc/npc/npc_blimp/npc_blimp.swf' },
  npc_catch_me_ghost: { swf: 'inhabitants/ghost/npc_catch_me_ghost.swf' },
  // The People section: each person's own SWF, not their Cubimal, and no empty boxes.
  npc_yoga_frog: { swf: 'inhabitants/yoga_frog/npc_yoga_frog.swf' },
  npc_myopic_frog: { swf: 'inhabitants/myopic_frog/npc_myopic_frog.swf' },
  npc_gwendolyn: { swf: 'inhabitants/gwendolyn/npc_gwendolyn.swf' },
  npc_widget: { swf: 'inhabitants/widget_bot/npc_widget.swf' },
  npc_piggy_explorer: { swf: 'inhabitants/ilmenskie_jones/npc_piggy_explorer.swf' },
  npc_juju_grandma: { swf: 'inhabitants/juju_grandma/npc_juju_grandma.swf' },
  npc_maintenance_bot: { swf: 'inhabitants/maintenance_bot/npc_maintenance_bot.swf' },
  npc_bureaucrat: { swf: 'inhabitants/bureaucrat/npc_bureaucrat.swf' },
  npc_fox_ranger: { swf: 'inhabitants/fox_ranger/npc_fox_ranger.swf' },
  npc_gardening_vendor: { swf: 'inhabitants/gardening_vendor/npc_gardening_vendor.swf' },
  npc_jabba2: { swf: 'inhabitants/helga/npc_jabba2.swf' },
  npc_cooking_vendor: { swf: 'inhabitants/meal_vendor/npc_cooking_vendor.swf' },
  npc_sno_cone_vending_machine: { swf: 'inhabitants/sno_cone_vending_machine/npc_sno_cone_vending_machine.swf' },
  npc_tool_vendor: { swf: 'inhabitants/tool_vendor/npc_tool_vendor.swf' },
  npc_jabba1: { swf: 'inhabitants/uncle_friendly/npc_jabba1.swf' },
  npc_esquibeth_playback: { swf: 'misc/npc/npc_esquibeth_playback/npc_esquibeth_playback.swf', sprite: 45, frame: 30 },
  npc_forehorseman: { swf: 'inhabitants/forehorseman/npc_forehorseman.swf' },
  npc_letterblock: { swf: 'quest_items/letterblock/npc_letterblock.swf' },
  npc_mail_dispatcher: { swf: 'misc/npc/npc_mail_dispatcher/npc_mail_dispatcher.swf' },
  npc_mailbox: { swf: 'misc/npc/npc_mailbox/npc_mailbox.swf' },
  npc_rare_item_vendor: { swf: 'inhabitants/rare_item_vendor/npc_rare_item_vendor.swf' },
  npc_spinning_wheel: { swf: 'misc/npc/npc_spinning_wheel/npc_spinning_wheel.swf', sprite: 290, frame: 40 },
});

const stillPath = (id, hi) => join(ROOT, 'public', STILLS_DIR, `${id}${hi ? '@3x' : ''}.webp`);
/** ImageMagick draws a PNG beside the still, then it ships as lossless WebP (tools/webp-lossless.mjs). */
const asWebp = (out, draw) => { const png = out.replace(/\.webp$/, '.tmp.png'); draw(png); replacePngWithWebp(png, out); };

const size = (file) => execFileSync('magick', ['identify', '-format', '%w %h\n', file], { encoding: 'utf8' }).split('\n')[0].split(' ').map(Number);

/** The frame of a sheet, its transparent margin trimmed (ImageMagick). */
function writeCell(file, { cols, rows, frame }, out) {
  const [width, height] = size(file);
  const w = Math.floor(width / cols);
  const h = Math.floor(height / rows);
  const crop = `${w}x${h}+${(frame % cols) * w}+${Math.floor(frame / cols) * h}`;
  execFileSync('magick', [file, '-crop', crop, '+repage', '-trim', '+repage', '-strip', `PNG32:${out}`]);
}

function writeSwf(swf, zoom, out, sprite = null, frame = 1) {
  const dir = mkdtempSync(join(tmpdir(), 'creature-still-'));
  try {
    if (sprite) {
      // The main timeline shows nothing at rest (Esquibeth, the Spinning Wheel): a frame of their own symbol, past its appear.
      execFileSync(JAVA, ['-jar', FFDEC, '-zoom', String(zoom), '-ignorebackground', '-selectid', String(sprite), '-format', 'sprite:png', '-export', 'sprite', dir, join(ITEMS, swf)], { stdio: 'ignore' });
      const sub = readdirSync(dir).find((f) => f.startsWith(`DefineSprite_${sprite}`));
      execFileSync('magick', [join(dir, sub, `${frame}.png`), '-trim', '+repage', '-strip', `PNG32:${out}`]);
      return;
    }
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
    asWebp(stillPath(id), (png) => writeSwf(row.swf, 1, png, row.sprite, row.frame));
    asWebp(stillPath(id, true), (png) => writeSwf(row.swf, 3, png, row.sprite, row.frame));
    return;
  }
  asWebp(stillPath(id), (png) => writeCell(join(SPRITES, row.sheet), row, png));
  const hi = join(SPRITES, row.sheet.replace(/\.(png|webp)$/, '@3x.webp'));
  if (existsSync(hi)) asWebp(stillPath(id, true), (png) => writeCell(hi, row, png));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const missing = Object.keys(CREATURE_STILLS).filter((id) => !existsSync(stillPath(id)));
    if (missing.length) {
      console.error(`creature stills missing: ${missing.join(', ')}`);
      process.exit(1);
    }
  } else {
    const only = process.argv.slice(2);
    for (const [id, row] of Object.entries(CREATURE_STILLS)) if (!only.length || only.includes(id)) write(id, row);
  }
}
