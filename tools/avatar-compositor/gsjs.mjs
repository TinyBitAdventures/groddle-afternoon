/**
 * Avatar data from glitch-GameServerJS (CC0): wardrobe articles with their
 * default colours (inc_data_clothing.js), face articles and the skin/hair
 * colour palettes (inc_data_faces.js), the default new-player choices
 * (inc_data_default_avatars.js). The files are plain data assignments; they
 * run in an empty vm context with no access to Node.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import vm from 'node:vm';

export const GSJS = join(os.homedir(), 'Documents/glitch-audit/glitch-GameServerJS');

function run(file, after = '') {
  const ctx = vm.createContext({});
  vm.runInContext(`${readFileSync(join(GSJS, file), 'utf8')}\n${after}`, ctx, { timeout: 5000 });
  return ctx;
}

export function loadGsjsAvatarData() {
  const clothingCtx = run('inc_data_clothing.js', `
    for (var k in this) { if (/^set_data_clothing_/.test(k) && typeof this[k] === 'function') this[k](); }
  `);
  const faces = run('inc_data_faces.js');
  const defaults = run('inc_data_default_avatars.js');
  const toPlain = (v) => JSON.parse(JSON.stringify(v ?? {}));
  return {
    clothing: toPlain(clothingCtx.data_clothing),
    faces: toPlain(faces.data_faces),
    colors: toPlain(faces.data_avatar_colors),
    defaults: toPlain(defaults.default_avatars),
  };
}

/** hat_hair_map from AvatarSwfParticulars.as: hat -> hairs it can be worn with. */
export function loadHatHairMap(file) {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf('hat_hair_map:Object = {');
  const body = src.slice(start, src.indexOf('};', start));
  const out = {};
  for (const m of body.matchAll(/([A-Za-z0-9_]+)\s*:\s*\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  return out;
}
