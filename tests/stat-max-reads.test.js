// G965 (root R13): the energy and mood maximums come from one place,
// metabolics.js energyMax/moodMax. In the source both tops are the energy tank
// (players/inc_metabolics.js metabolics_calc_max returns metabolics_get_tank),
// so a read of pc.moodMax (a field nothing sets) silently fell back to 100:
// Instant Resurrection filled mood to 100 and the resurrect mood cap used 100
// for a player whose Energy Tank cards had raised the tank.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { energyMax, moodMax } from '../public/js/metabolics.js?v=48f784bf';
import { normalizeHellState, resurrect } from '../public/js/hell.js?v=d7a75e16';
import { hellFeature } from '../public/js/features/hell-feature.js?v=02f5451d';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const gsjs = join(here, '../../glitch-GameServerJS');

/** Every game script: game.js plus public/js. */
function gameScripts() {
  const out = [join(pub, 'game.js')];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) out.push(full);
    }
  };
  walk(join(pub, 'js'));
  return out;
}

/** Drop comments so doc lines may still name the field. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// The one owner: imagination-feature syncEnergyTank writes pc.energyMax from
// the Energy Tank cards. metabolics.js is the shared reader.
const OWNERS = new Set(['js/metabolics.js', 'js/features/imagination-feature.js']);
const STAT_MAX_FIELD = /\b(?:pc|player)\s*\??\.\s*(?:moodMax|energyMax|maxMood|maxEnergy|moodTop|energyTop|imaginationMax)\b/g;

describe('G965: stat maximums are read through metabolics.js', () => {
  it('no game script reads a stat-max field off the player outside the shared function', () => {
    const offenders = [];
    for (const file of gameScripts()) {
      const rel = relative(pub, file).split('\\').join('/');
      if (OWNERS.has(rel)) continue;
      const lines = code(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(STAT_MAX_FIELD)) offenders.push(`${rel}:${i + 1} ${m[0]}`);
      });
    }
    assert.deepEqual(offenders, [], 'use energyMax(pc) / moodMax(pc) from js/metabolics.js');
  });

  it('the scan catches the old hell reads', () => {
    const old = 'function moodMaxOf(pc) {\n  return Math.max(1, num(pc?.moodMax, 100));\n}\nengine.pc.mood = Math.max(1, Number(engine.pc.moodMax) || 100);';
    assert.equal([...code(old).matchAll(STAT_MAX_FIELD)].length, 2);
  });

  it('mood tops out at the energy tank, as in the source', { skip: !existsSync(gsjs) && 'GSJS not beside the worktree' }, () => {
    const metab = readFileSync(join(gsjs, 'players/inc_metabolics.js'), 'utf8');
    assert.match(metab, /function metabolics_calc_max[\s\S]*?return this\.metabolics_get_tank\(\)/);
    const player = readFileSync(join(gsjs, 'players/player.js'), 'utf8');
    assert.match(player, /this\.metabolics_get_mood\(\) > \(this\.metabolics\.mood\.top \/ 2\)\) this\.metabolics_set_mood\(this\.metabolics\.mood\.top \/ 2\)/);
    assert.equal(moodMax({ energyMax: 160 }), 160);
    assert.equal(energyMax({ energyMax: 160 }), 160);
  });

  it('resurrect caps mood at half the tank, not half of 100', () => {
    const out = resurrect(normalizeHellState({}), { energy: 10, mood: 150, energyMax: 160 }, Date.now(), { inHell: true });
    assert.equal(out.ok, true);
    assert.equal(out.metabolics.mood, 80);
    assert.equal(out.metabolics.energy, 16);
  });

  it('Instant Resurrection fills mood to the tank', () => {
    const base = {
      pc: { energy: 0, mood: 0, energyMax: 160 },
      inv: {},
      streetExists: () => false,
    };
    const engine = new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => undefined) });
    hellFeature.restore({ isDead: true });
    try {
      assert.equal(hellFeature.resurrectNow(engine, { full: true }), true);
      assert.equal(base.pc.energy, 160);
      assert.equal(base.pc.mood, 160);
    } finally {
      hellFeature.restore({});
    }
  });
});
