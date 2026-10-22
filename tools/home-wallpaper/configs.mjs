/**
 * Print GSJS wallpaper / floor / ceiling configs (inc_data_homes.js) and the interior
 * frame configs as JSON on stdout, for tools/home-wallpaper/build.py.
 * GameServerJS is data: the file is evaluated in an empty vm context, nothing else runs.
 */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GSJS = process.env.GLITCH_GSJS || join(process.env.HOME || '', 'Documents/glitch-audit/glitch-GameServerJS');
const ctx = {};
const src = readFileSync(join(GSJS, 'inc_data_homes.js'), 'utf8');
vm.runInNewContext(`${src}\nthis.out = { walls: homes_wallpaper_configs, floors: homes_floor_configs, ceilings: homes_ceiling_configs, frames: homes_interior_frames };`, ctx, { timeout: 5000 });
process.stdout.write(JSON.stringify(ctx.out));
