/**
 * G1290 (report #669): the whole-house picture draws the machines and the Crafty Bot on the floors
 * the player is not standing on, from the saved home (homes-feature floorShotContainer asks
 * home-machines-feature drawHomeShotMachines and craftybot-feature drawHomeShotBot). It left them
 * out before, so a picture taken downstairs lost the machines upstairs.
 * Run: node --test tests/g1290-whole-house-machines.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homeMachinesFeature, homeShotMachineSprite } from '../public/js/features/home-machines-feature.js?v=a4203cfd';
import { craftybotFeature } from '../public/js/features/craftybot-feature.js?v=98c36471';
import { MACHINE_ART_SHEETS } from '../public/js/machine-art-sheets.js?v=0fd6183b';
import { INTERIOR } from '../public/js/home-decor.js?v=c63e5e16';

class Obj {
  constructor(texture) {
    this.texture = texture;
    this.children = [];
    this.anchor = { set: (x, y) => { this.anchor.x = x; this.anchor.y = y ?? x; } };
    this.scale = { x: 1, y: 1, set: (x, y) => { this.scale.x = x; this.scale.y = y ?? x; } };
  }
  addChild(c) { this.children.push(c); return c; }
}
const PIXI = {
  Container: Obj,
  Sprite: Obj,
  AnimatedSprite: Obj,
  Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } },
  ImageSource: class { on() {} emit() {} once() {} },
  Texture: class { constructor(o) { Object.assign(this, o); } once() {} },
};

function withPixi(fn) {
  const prev = globalThis.PIXI;
  globalThis.PIXI = PIXI;
  try { return fn(); } finally { globalThis.PIXI = prev; }
}

const row = (id, classTsid, place, rx) => ({ id: `hm-${String(id).replace('hm-', '').padStart(16, '0')}`, classTsid, place, rx, fuel: 50, music: true, job: null, contents: {} });

describe('the machines a floor keeps are drawn into its picture', () => {
  it('each machine on that floor, at its room x on the walk line, from its own sheet; none from other floors', () => withPixi(() => {
    homeMachinesFeature._reset();
    homeMachinesFeature.restore({ machines: [row('hm-1', 'woodworker', 'house:2', 273), row('hm-2', 'fuelmaker', 'house:2', 158), row('hm-3', 'woodworker', 'house:1', 600), row('hm-4', 'blockmaker', 'street', 900)] });
    const layer = new Obj();
    const n = homeMachinesFeature.drawHomeShotMachines('house:2', layer, 0, { PIXI });
    assert.equal(n, 2);
    assert.deepEqual(layer.children.map((s) => [s.x, s.y]), [[273, INTERIOR.floorY], [158, INTERIOR.floorY]]);
    const s = MACHINE_ART_SHEETS.woodworker;
    const wood = layer.children[0];
    assert.equal(wood.texture.frame.width, s.fw, 'one frame of the machine\'s sheet');
    assert.equal(wood.texture.frame.x, 0, 'the assembled (idle) frame');
    assert.deepEqual([wood.anchor.x, wood.anchor.y], [s.ax / s.fw, s.ay / s.fh], 'its registration point on the walk line');
    // The ground floor's room x 0 is past the back yard.
    const ground = new Obj();
    homeMachinesFeature.restore({ machines: [row('hm-5', 'woodworker', 'house', 300)] });
    homeMachinesFeature.drawHomeShotMachines('house', ground, 1200, { PIXI });
    assert.equal(ground.children[0].x, 1500);
    homeMachinesFeature._reset();
  }));

  it('a running job shows the machine working', () => withPixi(() => {
    const t = 1_000_000;
    const busy = homeShotMachineSprite(PIXI, { ...row('hm-6', 'woodworker', 'house:1', 400), job: { user: 'me', startedAt: t - 10_000, readyAt: t + 60_000, qty: 1 } }, 0, t);
    const s = MACHINE_ART_SHEETS.woodworker;
    const k = (busy.texture.frame.y / s.fh) * s.cols + busy.texture.frame.x / s.fw;
    assert.ok(k >= s.states.active[0] && k < s.states.active[0] + s.states.active[1], `frame ${k} is in the active state`);
  }));
});

describe('the Crafty Bot is drawn into the picture of the floor it stands on', () => {
  it('standing, or folded asleep (sleepMode), at its x on the walk line; not on another floor', () => withPixi(() => {
    const engine = { PIXI };
    craftybotFeature.restore({ owned: true, where: 'interior', floor: 2, x: 1555, dir: 'left', craftState: 'idle', anim: 'idle0' });
    const other = new Obj();
    assert.equal(craftybotFeature.drawHomeShotBot(1, other, INTERIOR.floorY, engine), 0);
    assert.equal(other.children.length, 0);
    const top = new Obj();
    assert.equal(craftybotFeature.drawHomeShotBot(2, top, INTERIOR.floorY, engine), 1);
    const bot = top.children[0];
    assert.deepEqual([bot.x, bot.y], [1555, INTERIOR.floorY + 2]);
    assert.match(bot.texture.source?.[Object.getOwnPropertySymbols(bot.texture.source).find((k) => bot.texture.source[k]?.url)]?.url || '', /craftybot_idle0/);
    craftybotFeature.restore({ owned: true, where: 'interior', floor: 2, x: 1555, craftState: 'sleep', anim: 'sleepMode', collapsed: true });
    const asleep = new Obj();
    craftybotFeature.drawHomeShotBot(2, asleep, INTERIOR.floorY, engine);
    const src = asleep.children[0].texture.source;
    assert.match(src[Object.getOwnPropertySymbols(src).find((k) => src[k]?.url)].url, /craftybot_sleepMode/, 'folded, as the 2012 picture shows it');
    craftybotFeature.restore(undefined);
  }));
});

describe('homes-feature asks for them on every floor it draws from the saved home', () => {
  it('floorShotContainer draws the floor\'s machines and the bot', () => {
    const homes = readFileSync(join(import.meta.dirname, '..', 'public/js/features/homes-feature.js'), 'utf8');
    const at = homes.indexOf('function floorShotContainer(');
    const body = homes.slice(at, homes.indexOf('\n}\n', at));
    assert.match(body, /engine\.query\?\.\('drawHomeShotMachines', place, root, x0, engine\)/);
    assert.match(body, /engine\.query\?\.\('drawHomeShotBot', houseFloor, root, INTERIOR\.floorY, engine\)/);
    assert.match(body, /towerFloor != null \? towerPlace\(towerFloor\) : houseFloor != null \? housePlace\(houseFloor\)/);
  });
});
