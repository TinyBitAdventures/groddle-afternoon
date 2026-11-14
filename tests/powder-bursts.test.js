/**
 * G380: the fecundity and hallowed powders and Juju Shoo-Shoo show their powder burst, each with its
 * own numbers (powder_of_*_fecundity.js 311-357, *_hallowed_shrine_powder.js 286-297,
 * juju_shoo_shoo_powder.js 281-288).
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closestTarget } from '../public/js/powders.js?v=6f3d6671';
import { OVERLAY_USES } from '../public/js/overlays.js?v=219965d5';
import { powdersFeature } from '../public/js/features/powders-feature.js?v=4c66c928';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = join(root, '../glitch-GameServerJS');
before(async () => loadContentCatalogsFromDir(join(root, 'public/assets/content')));
beforeEach(() => powdersFeature._reset());

const sprite = (x) => ({ x, y: 400, destroyed: false });
function fakeEngine(over = {}) {
  const data = {};
  const engine = {
    inv: {},
    pc: { energy: 50, mood: 50, energyMax: 100, moodMax: 100 },
    player: { x: 500, y: 400 },
    interactables: [],
    unlockedAchievements: [],
    hasBuff: () => false,
    applyBuff: () => ({ ok: true }),
    removeBuff: () => {},
    achievement: () => {},
    playSound: () => {},
    pushActivity: () => {},
    toast: () => {},
    refreshPack: () => {},
    updateHud: () => {},
    save: () => {},
    setData: (k, v) => { data[k] = v; },
    param: () => null,
    floatText: () => {},
    dropWorldStack: () => {},
    refreshTreeVisual: () => {},
    ...over,
  };
  return { engine, data };
}

describe('the bursts against the source', { skip: !existsSync(GS) && 'glitch-GameServerJS is not beside the game' }, () => {
  const src = (f) => readFileSync(join(GS, 'items', f), 'utf8');
  const block = (file, key) => {
    const text = src(file);
    const at = text.indexOf(`overlay_key_to_url('${key}')`);
    assert.ok(at > 0, file);
    return text.slice(at, at + 400);
  };

  it('fecundity: 300 px, delta 75, 0, on each animal', () => {
    for (const [use, file, key, ms] of [
      ['powder_startling_fecundity', 'powder_of_startling_fecundity.js', 'target_effect_powder_extreme', 5400],
      ['powder_mild_fecundity', 'powder_of_mild_fecundity.js', 'target_effect_powder_mild', 4300],
    ]) {
      const b = block(file, key);
      assert.match(b, /follow: true/);
      assert.match(b, new RegExp(`duration: ${ms},\\s*delay_ms: 2000,\\s*delta_x: 75,\\s*delta_y: 0,\\s*width: 300`));
      const u = OVERLAY_USES[use];
      assert.deepEqual([u.key, u.wh, u.durationMs, u.delayMs, u.dx, u.dy], [key, 300, ms, 2000, 75, 0]);
    }
  });

  it('hallowed: on the closest shrine, 300 px', () => {
    for (const [use, file, key, ms, dx] of [
      ['powder_extremely_hallowed', 'extremely_hallowed_shrine_powder.js', 'target_effect_powder_extreme', 5400, 25],
      ['powder_fairly_hallowed', 'fairly_hallowed_shrine_powder.js', 'target_effect_powder_mild', 4300, 75],
    ]) {
      assert.match(block(file, key), new RegExp(`duration: ${ms},\\s*delay_ms: 2000,\\s*delta_x: ${dx},\\s*delta_y: 200,\\s*width: 300`));
      assert.match(src(file), /var item = pc\.findCloseStack\(isShrine\);/);
      const u = OVERLAY_USES[use];
      assert.deepEqual([u.key, u.wh, u.durationMs, u.delayMs, u.dx, u.dy], [key, 300, ms, 2000, dx, 200]);
    }
  });

  it('Juju Shoo-Shoo: on each boss, 1:1, 3 s, no delay', () => {
    const text = src('juju_shoo_shoo_powder.js');
    assert.match(text, /overlay_key: 'target_effect_powder_mild',\s*duration: 3000,\s*locking: false,\s*itemstack_tsid: bosses\[i\]\.tsid,\s*delta_x: 0,\s*delta_y: 20/);
    const u = OVERLAY_USES.powder_juju_shoo_shoo;
    assert.deepEqual([u.key, u.wh, u.durationMs, u.delayMs, u.dx, u.dy], ['target_effect_powder_mild', 0, 3000, 0, 0, 20]);
  });
});

describe('who gets a burst', () => {
  it('each animal that scatters, up to the 15 the powder reaches', () => {
    for (const [cls, key] of [['powder_of_startling_fecundity', 'target_effect_powder_extreme'], ['powder_of_mild_fecundity', 'target_effect_powder_mild']]) {
      const herd = Array.from({ length: 20 }, (_, i) => ({ classId: 'npc_piggy', sprite: sprite(i * 10) }));
      const { engine, data } = fakeEngine({ interactables: herd });
      engine.inv[cls] = 1;
      powdersFeature.runPackVerb(cls, 'disperse', engine);
      assert.equal(data.powderBurst, `${key}:15`, cls);
    }
  });

  it('the shrine nearest the player, and none without one', () => {
    const near = { classId: 'npc_shrine_grendaline', sprite: sprite(520) };
    assert.equal(closestTarget([{ sprite: sprite(5000) }, near, { sprite: sprite(100) }], 500), near);
    assert.equal(closestTarget([], 500), null);
    const { engine, data } = fakeEngine({ interactables: [near] });
    engine.inv.extremely_hallowed_shrine_powder = 1;
    powdersFeature.runPackVerb('extremely_hallowed_shrine_powder', 'sprinkle', engine);
    assert.equal(data.powderBurst, 'target_effect_powder_extreme:1');
    const none = fakeEngine();
    none.engine.inv.fairly_hallowed_shrine_powder = 1;
    powdersFeature.runPackVerb('fairly_hallowed_shrine_powder', 'sprinkle', none.engine);
    assert.equal(none.data.powderBurst, undefined);
  });

  it('Juju Shoo-Shoo bursts on the boss', () => {
    const f = readFileSync(join(root, 'public/js/features/item-verbs-more-feature.js'), 'utf8');
    assert.match(f, /engine\.query\?\.\('jujuPowderBlow', engine\);\s*jujuBurst\(engine\);/);
    assert.match(f, /t\?\.classId === 'npc_juju_boss' \? t\.sprite : null/);
  });
});
