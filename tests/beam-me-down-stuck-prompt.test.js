/**
 * Beam Me Down has no way back up, and its only way out is the EXIT door on the floor, off screen
 * from the landing. Glitch asked "Are you stuck? Do you want to leave this place?" four minutes
 * after a Ticket to Paradise took you in (paradise_ticket_beam_me_down.js 296:
 * instances_schedule_exit_prompt(id, 4*60)); the prompt (players/inc_instances.js 317-370) has icon
 * buttons and no timeout, Yes, please takes you back where you came in (instances_left), No thanks
 * asks again two minutes later, a dead player is asked a minute later, and leaving the instance
 * takes it away (location.js onPlayerExit 770). The remake never asked. Constellation, an
 * underground puzzle level, never did.
 * Run: node --test tests/beam-me-down-stuck-prompt.test.js
 */
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

/** A stand-in PIXI: every object takes any property and call (the scene is built, never drawn). */
function stub() {
  const t = function () {};
  return new Proxy(t, {
    get(o, k) {
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (typeof k === 'symbol') return o[k];
      if (!(k in o)) o[k] = stub();
      return o[k];
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
    apply: () => stub(),
    construct: (o, args) => {
      const s = stub();
      const a = args[0];
      if (a && typeof a === 'object') for (const k of Object.keys(a)) s[k] = a[k];
      return s;
    },
  });
}
globalThis.PIXI = stub();
globalThis.Image = class {
  constructor() {
    this.width = 40;
    this.height = 30;
  }
  addEventListener() {}
};
globalThis.document = { createElement: () => stub() };

const { puzzleScenesFeature } = await import('../public/js/features/puzzle-scenes-feature.js?v=476e0674');
const { STUCK_PROMPT_TEXT } = await import('../public/js/quest-instance.js?v=bb5d53fd');

const TICKET = 'paradise_ticket_beam_me_down';
const MIN = 60 * 1000;
const HOME = { tsid: 'GLI2V0UN7RD1T2J', x: 120, y: -40 };

function makeEngine(params = {}) {
  const e = {
    PIXI: globalThis.PIXI,
    started: true,
    street: { tsid: HOME.tsid },
    streetTsid: HOME.tsid,
    player: { x: HOME.x, y: HOME.y, baseScale: 1 },
    entityLayer: stub(),
    pc: {},
    inv: { [TICKET]: 1 },
    data: {},
    prompts: [],
    removed: [],
    entered: [],
    dead: false,
    isBusy: false,
    in: false,
    sceneTsid: '',
    param: (k) => params[k] || '',
    busy: () => e.isBusy,
    inScene: () => e.in,
    enterScene(o) {
      e.in = true;
      e.sceneTsid = o.tsid;
    },
    async enter(tsid, opts) {
      e.in = false;
      e.sceneTsid = '';
      e.entered.push({ tsid, x: opts?.spawnX, y: opts?.spawnY });
    },
    transientInstance: () => e.in,
    activateParadiseTicket: (id, start) => start(),
    achievement() {},
    register: (t) => t,
    unregister() {},
    toast() {},
    save() {},
    setData: (k, v) => {
      e.data[k] = v;
    },
    closeMap() {},
    prompt(o) {
      e.prompts.push(o);
      return `p${e.prompts.length}`;
    },
    removePrompt(uid) {
      e.removed.push(uid);
    },
    query: (hook) => (hook === 'isDead' ? e.dead : null),
  };
  return e;
}

/** Into Beam Me Down with the ticket (its pack Activate), as a player would go. */
function beamIn(engine) {
  assert.equal(puzzleScenesFeature.runPackVerb(TICKET, 'activate', engine), true);
  assert.equal(engine.sceneTsid, 'PUZZLESCENE_BEAM_ME_DOWN');
}

const tick = (engine) => puzzleScenesFeature.onTick(16, Date.now(), engine);
const wait = (ms, engine) => {
  mock.timers.tick(ms);
  tick(engine);
};

describe('Beam Me Down asks "Are you stuck?" as Glitch did', () => {
  before(() => mock.timers.enable({ apis: ['Date'], now: 1_000_000 }));
  after(() => mock.timers.reset());

  it('Constellation (an underground puzzle level) never asks', () => {
    puzzleScenesFeature.restore({});
    const engine = makeEngine({ scenedemo: 'constellation' });
    tick(engine);
    assert.equal(engine.sceneTsid, 'PUZZLESCENE_CONSTELLATION');
    wait(10 * MIN, engine);
    assert.equal(engine.prompts.length, 0);
    puzzleScenesFeature.runVerb({ classId: 'puzzle_scene_exit' }, 'leave', engine);
  });

  it('four minutes in: the prompt, with Glitch’s words and buttons, once', async () => {
    puzzleScenesFeature.restore({});
    const engine = makeEngine();
    beamIn(engine);
    wait(4 * MIN - 1000, engine);
    assert.equal(engine.prompts.length, 0, 'not before four minutes');
    wait(1000, engine);
    assert.equal(engine.prompts.length, 1);
    const p = engine.prompts[0];
    assert.equal(p.text, STUCK_PROMPT_TEXT);
    assert.equal(p.text, 'Are you stuck? Do you want to leave this place?');
    assert.equal(p.iconButtons, true);
    assert.deepEqual(p.choices.map((c) => [c.value, c.label]), [['yes', 'Yes, please'], ['no', 'No thanks']]);
    assert.ok(!p.timeout && !p.timeoutMs, 'no timeout');
    assert.equal(engine.data.stuckPrompt, 'beam_me_down');
    wait(5 * MIN, engine);
    assert.equal(engine.prompts.length, 1, 'one at a time');

    // No thanks: asked again two minutes later.
    p.onChoice('no');
    wait(2 * MIN - 1000, engine);
    assert.equal(engine.prompts.length, 1);
    wait(1000, engine);
    assert.equal(engine.prompts.length, 2);

    // Yes, please: back where the ticket was used, as the EXIT does.
    engine.prompts[1].onChoice('yes');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(engine.entered, [{ tsid: HOME.tsid, x: HOME.x, y: HOME.y }]);
    assert.equal(engine.data.sceneStatus, 'left');
    wait(10 * MIN, engine);
    assert.equal(engine.prompts.length, 2, 'gone with the scene');
  });

  it('a dead player is asked a minute later; a dialog on screen holds it back', () => {
    puzzleScenesFeature.restore({});
    const engine = makeEngine();
    beamIn(engine);
    engine.dead = true;
    wait(4 * MIN, engine);
    assert.equal(engine.prompts.length, 0, 'not while dead');
    engine.dead = false;
    wait(MIN - 1000, engine);
    assert.equal(engine.prompts.length, 0);
    engine.isBusy = true;
    wait(1000, engine);
    assert.equal(engine.prompts.length, 0, 'waits out a dialog');
    engine.isBusy = false;
    tick(engine);
    assert.equal(engine.prompts.length, 1);
    puzzleScenesFeature.runVerb({ classId: 'puzzle_scene_exit' }, 'leave', engine);
    assert.deepEqual(engine.removed, ['p1'], 'leaving by the EXIT takes the open prompt away');
  });

  it('leaving by the EXIT before four minutes: never asked', () => {
    puzzleScenesFeature.restore({});
    const engine = makeEngine();
    beamIn(engine);
    wait(MIN, engine);
    puzzleScenesFeature.runVerb({ classId: 'puzzle_scene_exit' }, 'leave', engine);
    wait(10 * MIN, engine);
    assert.equal(engine.prompts.length, 0);
  });

  it('QA &stuckpromptms= replaces the wait', () => {
    puzzleScenesFeature.restore({});
    const engine = makeEngine({ stuckpromptms: '3000' });
    beamIn(engine);
    wait(3000, engine);
    assert.equal(engine.prompts.length, 1);
    puzzleScenesFeature.runVerb({ classId: 'puzzle_scene_exit' }, 'leave', engine);
  });
});
