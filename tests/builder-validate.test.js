/**
 * LEVEL BUILDER P2 (spec 7, section 14): the validator (js/builder/validate.js), its reach model
 * (js/builder/reach-graph.js) and the stepper it shares with the game (js/avatar-step.js).
 * One fixture per rule: the Mossy Hollow zone (tests/fixtures/builder/mossy-hollow.zone.json)
 * passes clean, and one change to it makes each rule fire.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateZone, RULES, hash16, healOps, plainApex, badWords, zoneArrivals } from '../public/js/builder/validate.js?v=5573cbb0';
import { streetWorld, jumpArc, jumpArcs, reachStreet } from '../public/js/builder/reach-graph.js?v=d03eeab1';
import { GRAVITY, stepAvatar, avatarGround, steerX, coastX, NORMAL_BUFF } from '../public/js/avatar-step.js?v=43b1182e';
import { platformsScreen } from '../public/js/street-model.js?v=b6cb6a4e';
import { loadValidatorContext } from '../tools/builder/validator-context.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const base = JSON.parse(read('tests/fixtures/builder/mossy-hollow.zone.json'));
// Tiny Speck's world alone, so the fixtures validate the same whatever zones are published.
const ctx = loadValidatorContext({ publish: true, zones: false });
const lane = (z) => z.streets[0].street;
const end = (z) => z.streets[1].street;

/** The findings of `rule` after `change` to a copy of Mossy Hollow. */
function fire(rule, change = () => {}, extra = {}) {
  const zone = structuredClone(base);
  change(zone);
  return validateZone(zone, { ...ctx, ...extra }).findings.filter((f) => f.rule === rule);
}

/** A flat street for the stepper: one floor at screen y 940 across 4000 px. */
const flat = { tsid: 'GZTEST000000001', label: 'Flat', bounds: { l: -2000, r: 2000, t: -1000, b: 0 }, platforms: [{ id: 'plat_1', x1: -1990, y1: -60, x2: 1990, y2: -60, pc_perm: -1 }], layers: [], signposts: [] };

describe('the stepper the game and the validator share (js/avatar-step.js)', () => {
  it('a plain jump peaks at 142.5 px (the client: 143) and a flat running jump lands 260 px on (spec 2.3)', () => {
    const w = streetWorld(flat);
    const up = jumpArc(w, { x: 2000, y: 940 }, { dir: 0 });
    assert.ok(Math.abs(940 - up.minY - 142.49) < 0.01, `apex ${940 - up.minY}`);
    assert.equal(Math.round(plainApex()), 142);
    const run = jumpArc(w, { x: 1000, y: 940 }, { dir: 1, run: true });
    assert.ok(Math.abs(run.landed.x - 1000 - 259.6) < 0.5, `running ${run.landed.x - 1000}`);
    assert.equal(run.frames, 59);
  });

  it('steps a frame as game.js does (gravity, move, floor)', () => {
    const lines = platformsScreen(flat);
    const body = { x: 500, y: 900, vx: 2, vy: 0, onGround: false };
    const ground = (x, y, vy) => avatarGround(lines, x, y, vy, { street: flat });
    stepAvatar(body, { platforms: lines, worldW: 4000, ground });
    assert.deepEqual(body, { x: 502, y: 900 + GRAVITY, vx: 2, vy: GRAVITY, onGround: false, tripleJumping: false });
    for (let i = 0; i < 60 && !body.onGround; i += 1) stepAvatar(body, { platforms: lines, worldW: 4000, ground });
    assert.equal(body.y, 940);
    assert.equal(body.onGround, true);
    // The street's ends.
    const edge = stepAvatar({ x: 10, y: 940, vx: -4, vy: 0, onGround: true }, { platforms: lines, worldW: 4000, ground });
    assert.equal(edge.x, 24);
  });

  it('steers as handleInput does: floor and air acceleration, the air stop, coasting', () => {
    assert.equal(steerX(0, 1, true, NORMAL_BUFF), 0.58);
    assert.ok(Math.abs(steerX(0, 1, false, NORMAL_BUFF) - 0.58 * (0.22 / 0.3)) < 1e-12);
    assert.equal(steerX(4.4, 1, true, NORMAL_BUFF), 4.4);
    assert.equal(coastX(1, false, NORMAL_BUFF), 0, 'airborne under friction_thresh stops');
    assert.equal(coastX(4, false, NORMAL_BUFF), 4, 'airborne over it keeps its momentum');
    assert.ok(Math.abs(coastX(4, true, NORMAL_BUFF) - 3.12) < 1e-12);
  });

  it('bridges a seam at the lowest line near x, and stands on the street bottom past every line', () => {
    const lines = [{ x1: 0, y1: 900, x2: 100, y2: 900, pcPerm: -1 }, { x1: 0, y1: 500, x2: 100, y2: 500, pcPerm: -1 }];
    assert.equal(avatarGround(lines, 50, 880, 0), 900);
    assert.equal(avatarGround(lines, 105, 800, 0), 900, 'within 8 px of the lowest line');
    assert.equal(avatarGround(lines, 300, 800, 0), 900, 'no line near: the bottom of every line');
    assert.equal(avatarGround([], 300, 800, 0, { fallback: 777 }), 777);
  });

  it('game.js runs the shared frame', () => {
    const game = read('public/game.js');
    // assert.ok, not assert.match: a failing match would print the whole of game.js.
    assert.ok(/import \{ JUMP_SPEED, (?:MAX_TICK_FRAMES, )?WALK_MAX, avatarGround, coastX, (?:frameSteps, )?stepAvatar, steerAccel, (?:steerX, )?streetPhysicsExtras \} from '\.\/js\/avatar-step\.js\?v=[0-9a-f]{8}';/.test(game), 'imports js/avatar-step.js');
    assert.ok(/stepAvatar\(player, \{\n\s+dt,\n\s+buff: combinedPhysics\(\),/.test(game), 'physics() steps through stepAvatar');
    assert.ok(game.includes('return avatarGround(streetPlatforms, px, py, player?.vy ?? 0, { street: currentStreet, fallback: GROUND_Y });'), 'resolveGround is avatarGround');
    assert.ok(!/function streetPhysicsFreeFall|const STREET_PHYSICS_TERMINAL_VY/.test(game), 'no second copy of the frame');
  });
});

describe('reach (js/builder/reach-graph.js)', () => {
  it('a ledge 130 px up is reached, 170 px up is not (spec 8.7, the client jump and the 16 px ground snap)', () => {
    const at = (rise) => ({ ...flat, platforms: [...flat.platforms, { id: 'plat_2', x1: 1250, y1: -60 - rise, x2: 1450, y2: -60 - rise, pc_perm: -1 }], signposts: [{ id: 'signpost_1', x: 1350, y: -60 - rise, w: 100, h: 200, connects: [{ tsid: 'GLI2V0UN7RD1T2J', label: 'Hechey Track' }] }] });
    assert.equal(reachStreet(at(130), [{ x: 150, y: 940, from: 'a' }]).targets[0].reached, true);
    const r = reachStreet(at(170), [{ x: 150, y: 940, from: 'a' }]);
    assert.equal(r.targets[0].reached, false);
    assert.equal(r.targets[0].closest.y, 940);
  });

  it('a ladder reaches its deck', () => {
    const s = { ...flat, platforms: [...flat.platforms, { id: 'plat_2', x1: 900, y1: -400, x2: 1200, y2: -400, pc_perm: -1 }], ladders: [{ id: 'ladder_1', x: 3000 - 2000, y: -60, w: 50, h: 360 }], signposts: [{ id: 'signpost_1', x: 1100, y: -400, w: 100, h: 200, connects: [{ tsid: 'GLI2V0UN7RD1T2J', label: 'Hechey Track' }] }] };
    const r = reachStreet(s, [{ x: 150, y: 940, from: 'a' }]);
    assert.equal(r.targets[0].reached, true);
    assert.deepEqual(r.deckless, []);
  });

  it('draws the jump-arc overlay from the floor under a point', () => {
    const arcs = jumpArcs(flat, { x: 2000, y: 700 });
    assert.equal(arcs.length, 4);
    assert.ok(arcs.every((a) => a.from.y === 940 && a.points.length > 40 && a.landed));
  });
});

describe('the validator (js/builder/validate.js): one fixture per rule', () => {
  it('Mossy Hollow validates clean (spec 8.7 at rev 7)', () => {
    const r = validateZone(structuredClone(base), ctx);
    assert.deepEqual(r.findings.filter((f) => f.severity !== 'info').map((f) => `${f.rule} ${f.message}`), []);
    assert.equal(r.ok, true);
    assert.ok(r.reach.lane && r.reach.end);
    assert.ok(r.limits.length >= 4);
  });

  /** Spec 8.7 before the fix, out of the client jump: the ledge 170 px over the floor (the other street's arm lands on it). */
  const raise170 = (z) => { const p = lane(z).platforms[1]; p.y1 = -230; p.y2 = -230; lane(z).signposts[0].y = -230; end(z).signposts[0].connects[0].arrive.y = 770; };
  const cases = [
    ['SCH-001', (z) => { z.title = ''; }],
    ['STR-001', (z) => { lane(z).platforms.push({ ...lane(z).platforms[0] }); }],
    ['STR-002', (z) => { lane(z).layers.find((l) => l.id === 'middleground').id = 'mg'; }],
    ['STR-003', (z) => { for (const p of lane(z).platforms) p.pc_perm = 1; }],
    ['STR-004', (z) => { end(z).bounds = { l: -400, r: 400, t: -1000, b: 0 }; end(z).platforms[0] = { ...end(z).platforms[0], x1: -390, x2: 390 }; end(z).signposts[0].x = -300; }],
    ['STR-005', (z) => { lane(z).layers[0].w = 800; }],
    ['STR-006', (z) => { const p = lane(z).platforms[1]; [p.x1, p.x2] = [p.x2, p.x1]; }],
    ['STR-007', (z) => { lane(z).platforms.push({ id: 'plat_9', x1: 0, y1: -60, x2: 10, y2: -300, pc_perm: -1 }); }],
    ['PHY-001', (z) => { end(z).signposts[0].connects[0].arrive = { x: 2850, y: 600 }; }],
    ['PHY-002', (z) => { lane(z).barriers = [{ id: 'wall_1', x: -1350, y: -160, h: 160, pc_perm: null }]; }],
    ['PHY-003', raise170],
    ['PHY-004', (z) => { end(z).doors = [{ id: 'door_1', x: 1500, y: 600, w: 80, h: 200, sprite: 'bush_3', hidden: false, is_locked: false, key_id: 0, requires_level: 0, connect: { tsid: 'GLI2V0UN7RD1T2J', label: 'Hechey Track' } }]; }],
    ['PHY-005', (z) => {
      // A pit with walls: you can fall in from the floor's end, never climb out.
      const s = end(z);
      s.platforms[0].x2 = 600;
      s.platforms.push({ id: 'plat_2', x1: 610, y1: -10, x2: 980, y2: -10, pc_perm: -1 });
      s.barriers = [{ id: 'wall_1', x: 610, y: -200, h: 190, pc_perm: null }];
    }],
    ['PHY-006', (z) => { const p = lane(z).platforms[1]; p.y1 = -198; p.y2 = -198; lane(z).signposts[0].y = -198; }],
    ['PHY-007', (z) => { lane(z).platforms.push({ id: 'plat_9', x1: -400, y1: -600, x2: -200, y2: -600, pc_perm: -1 }); }],
    ['PHY-008', (z) => { lane(z).ladders = [{ id: 'ladder_1', x: -1000, y: -60, w: 50, h: 400 }]; }],
    // P7: the ledge under lane/signpost_1 moved 40 px down, its arm worked out again, the post left floating.
    ['PHY-009', (z) => { Object.assign(lane(z).platforms[1], { y1: -110, y2: -110 }); end(z).signposts[0].connects[0].arrive = { x: 2850, y: 890 }; }],
    ['POP-001', (z) => { z.streets[1].population = { counts: { npc_piggy: 6, npc_chicken: 3, wood_tree: 8, rock_metal_1: 10 }, quoins: 40 }; }],
    ['POP-002', (z) => { for (const p of lane(z).platforms) p.item_perm = 1; }],
    ['NAV-001', (z) => { lane(z).signposts[0].connects[0].tsid = 'GZ0000000000099'; }],
    ['NAV-002', (z) => { delete lane(z).signposts[0].connects[0].arrive; }],
    ['NAV-003', (z) => { end(z).signposts[0].connects[0].tsid = 'GLI2V0UN7RD1T2J'; end(z).signposts[0].connects[0].label = 'Hechey Track'; }],
    ['NAV-004', (z) => { z.edits = []; }],
    ['NAV-005', (z) => { lane(z).signposts[0].connects[0].label = 'The Hollow'; }],
    ['NAV-006', (z) => { z.hub.map.streets.pop(); }],
    ['AST-001', (z) => { lane(z).layers[1].decos[0].sprite = 'gz_not_a_thing'; z.assets.gz_not_a_thing = { origin: 'tinyspeck-cc0', licence: 'CC0-1.0' }; delete z.assets.gz_not_a_thing; }],
    ['AST-002', (z) => { delete z.assets.bush_3; }],
    ['AST-003', (z) => { lane(z).layers[1].decos[0].sprite = 'gz_moss'; z.assets.gz_moss = { origin: 'tinyspeck-cc0', licence: 'CC0-1.0' }; }],
    ['AST-004', (z) => { z.assets.bush_3.licence = 'CC-BY-4.0'; }],
    ['AST-005', (z) => { const d = lane(z).layers[1].decos[0]; d.sprite = 'cave_gr_tile_horiz_sm'; d.w = 900; z.assets.cave_gr_tile_horiz_sm = { origin: 'tinyspeck-cc0', licence: 'CC0-1.0', source: 'x' }; }],
    ['AST-006', (z) => { lane(z).layers[1].decos[0].animated = true; }],
    ['TXT-001', (z) => { lane(z).label = 'Glitch Lane'; }],
    ['TXT-002', (z) => { lane(z).label = 'Hechey Track'; }],
    ['PRF-001', (z) => { for (const p of lane(z).signposts) for (let i = 0; i < 6; i += 1) p.connects.push({ ...p.connects[0] }); }],
    // Zone ambient effects (js/street-effects.js, spec 15 Q12).
    ['FX-001', (z) => { lane(z).emitters = [{ id: 'fx_1', kind: 'steam', layer: 'no_such_layer', x: 0, y: -60 }]; }],
    ['FX-002', (z) => { lane(z).emitters = [{ id: 'fx_1', kind: 'lava', x: lane(z).bounds.r + 400, y: -60 }]; }],
    ['FX-003', (z) => { lane(z).rumble = { every: [4, 5], duration: 3, strength: 20 }; }],
    ['FX-004', (z) => { lane(z).emitters = [{ id: 'fx_1', kind: 'steam', x: 0, y: -60, period: [2, 4], burst: 6 }]; }],
    // A ledge 300 px over the floor, drawn as a 70 px slab with nothing under it (lane GROUNDED).
    ['ART-001', (z) => { lane(z).platforms.push({ id: 'plat_art', x1: -40, y1: -360, x2: 360, y2: -360, pc_perm: -1 }); lane(z).layers.find((l) => l.id === 'middleground').decos.push({ id: 'd_art', sprite: 'bush_3', x: 160, y: -290, w: 400, h: 70, z: 99, r: 0 }); }],
  ];

  it('effects: a busy street is too heavy (PRF-001), and an effect\'s particle art needs provenance (AST-002)', () => {
    const busy = fire('PRF-001', (z) => { lane(z).emitters = Array.from({ length: 30 }, (_, i) => ({ id: `fx_${i + 1}`, kind: 'steam', x: i * 40 - 600, y: -60, rate: 20, size: 200 })); });
    assert.ok(busy.some((f) => f.at === 'lane/effects/particles' && f.severity === 'warn' && !f.data.warn), JSON.stringify(busy.map((f) => f.at)));
    assert.ok(busy.some((f) => f.at === 'lane/effects/overdraw'));
    const art = fire('AST-002', (z) => { lane(z).emitters = [{ id: 'fx_1', kind: 'steam', x: 0, y: -60, sprite: 'bush_3' }]; delete z.assets.bush_3; });
    assert.equal(art.length, 1);
    const zone = structuredClone(base);
    lane(zone).emitters = [{ id: 'fx_1', kind: 'steam', x: 0, y: -60, period: [6, 10], burst: 3 }];
    lane(zone).rumble = { every: [14, 30], duration: 1.6, strength: 6 };
    assert.deepEqual(validateZone(zone, ctx).findings.filter((f) => /^(FX-|PRF-|SCH-)/.test(f.rule)), []);
  });
  it('covers every rule but the STY rules (P5 tests those, tests/builder-style.test.js) and the render-only AST-007 (tests/builder-render.test.js)', () => {
    assert.deepEqual(cases.map(([r]) => r).sort(), Object.keys(RULES).filter((r) => !r.startsWith('STY-') && r !== 'AST-007').sort());
  });

  it('runs P5\'s STY rules with the rest', () => {
    const found = validateZone(structuredClone(base), ctx).findings.filter((f) => f.rule.startsWith('STY-'));
    assert.ok(found.length >= 1);
    const none = fire('STY-004', (z) => { delete lane(z).gradient; });
    assert.equal(none.length, 1);
  });
  for (const [rule, change] of cases) {
    it(`${rule} (${RULES[rule][1]}): passes on Mossy Hollow, fires on the fixture`, () => {
      assert.deepEqual(fire(rule).map((f) => f.message), [], 'clean');
      const found = fire(rule, change);
      assert.ok(found.length >= 1, `${rule} did not fire`);
      const f = found[0];
      assert.equal(f.severity, RULES[rule][0]);
      assert.match(f.fingerprint, /^[0-9a-f]{16}$/);
      assert.ok(f.message && !/\u2014/.test(f.message), f.message);
      if (rule !== 'TXT-001') assert.ok(!/glitch/i.test(f.message), f.message);
    });
  }

  it('a waiver accepts one finding at one place until the geometry changes; fatal and AST-004 never', () => {
    const zone = structuredClone(base);
    raise170(zone);
    const before = validateZone(zone, ctx);
    const f = before.findings.find((x) => x.rule === 'PHY-003');
    zone.waivers = [{ rule: f.rule, at: f.at, reason: 'played it, fine', by: 'austin', fingerprint: f.fingerprint }];
    const r = validateZone(zone, ctx);
    assert.deepEqual(r.findings.find((x) => x.rule === 'PHY-003').waived, { by: 'austin', reason: 'played it, fine' });
    assert.equal(r.counts.error, before.counts.error - 1);
    lane(zone).platforms[1].x1 = 1240;
    assert.ok(!validateZone(zone, ctx).findings.find((x) => x.rule === 'PHY-003').waived, 'new geometry, new fingerprint');
    zone.assets.bush_3.licence = 'CC-BY-4.0';
    const a = validateZone(zone, ctx).findings.find((x) => x.rule === 'AST-004');
    zone.waivers.push({ rule: 'AST-004', at: a.at, reason: 'no', by: 'austin', fingerprint: a.fingerprint });
    assert.ok(!validateZone(zone, ctx).findings.find((x) => x.rule === 'AST-004').waived);
  });

  it('the PHY-003 message and data read as the spec shows them', () => {
    const [f] = fire('PHY-003', raise170);
    assert.equal(f.at, 'lane/signpost_1');
    assert.match(f.message, /^Signpost signpost_1 \(to Hollow End\) cannot be reached from the arrival at 150, 940\.$/);
    assert.deepEqual(f.data.from, ['world:GLI2V0UN7RD1T2J']);
    assert.deepEqual({ ...f.data.closest, x: 0 }, { x: 0, y: 940, rise: 170, jump: 142 });
    assert.equal(f.where.space, 'screen');
  });

  it('small helpers: arrivals, healing, words, fingerprints', () => {
    const a = zoneArrivals(base);
    assert.deepEqual(a.get('lane').map((x) => x.from), ['end/signpost_1', 'world:GLI2V0UN7RD1T2J']);
    assert.deepEqual(healOps('k', { bounds: { l: -100, r: 100, t: -100, b: 0 }, platforms: [{ id: 'p', x1: 150, y1: -10, x2: 50, y2: -10 }] }), [{ op: 'platform.set', street: 'k', id: 'p', set: { x1: 50, x2: 100 } }]);
    assert.deepEqual(badWords('A \u2014 GLITCH'), ['glitch', 'em dash']);
    assert.equal(hash16('a'), hash16('a'));
    assert.notEqual(hash16('a'), hash16('b'));
  });

  it('the schema the editor\'s worker loads is the spec\'s schema', () => {
    assert.equal(read('public/assets/content/zone.schema.json'), read('docs/level-builder/zone.schema.json'));
  });
});

describe('calibration (tools/builder/calibration.json, spec 7.4)', () => {
  const cal = JSON.parse(read('tools/builder/calibration.json'));
  it('covers every shipped street within the time limit and keeps every PHY-003/004/005/006 finding', () => {
    assert.equal(cal.summary.streets, Object.keys(JSON.parse(read('public/assets/streets/index.json')).streets).length);
    assert.ok(cal.summary.wallMs < 10 * 60 * 1000);
    assert.deepEqual(cal.summary.errors, []);
    for (const k of ['PHY-003', 'PHY-004', 'PHY-005', 'PHY-006']) assert.equal(cal.findings.filter((f) => f.rule === k).length, cal.summary.kept[k]);
    // P7: tight jumps are kept with their kind: too little height, or a landing a keyboard player often misses.
    assert.ok(cal.findings.filter((f) => f.rule === 'PHY-006').every((f) => ['height', 'landing'].includes(f.data.kind)));
    assert.ok(cal.findings.every((f) => ['reaches', 'also'].includes(f.data.jump2012)));
  });
});

describe('ART-001: art that floats (js/builder/ground.js, lane GROUNDED)', () => {
  /** A street with a floor (its strip of art past the bottom edge), a low ledge 180 px up and a high one 740 px up, art on each. */
  const street = () => ({
    tsid: 'GZTEST000000002', label: 'Ground Test', bounds: { l: -1000, r: 1000, t: -1000, b: 0 },
    platforms: [
      { id: 'plat_1', x1: -990, y1: -60, x2: 990, y2: -60, pc_perm: -1 },
      { id: 'plat_2', x1: -200, y1: -240, x2: 200, y2: -240, pc_perm: -1 },
      { id: 'plat_3', x1: 300, y1: -800, x2: 700, y2: -800, pc_perm: -1 },
    ],
    layers: [{ id: 'middleground', name: 'middleground', z: 0, decos: [
      { id: 'd_1', sprite: 'gz_floor', x: -500, y: 40, w: 1000, h: 100, z: 1, r: 0 },
      { id: 'd_2', sprite: 'gz_floor', x: 500, y: 40, w: 1000, h: 100, z: 1, r: 0 },
      { id: 'd_3', sprite: 'gz_ledge', x: 0, y: -140, w: 420, h: 102, z: 2, r: 0 },
      { id: 'd_4', sprite: 'gz_ledge', x: 500, y: -700, w: 420, h: 102, z: 2, r: 0 },
    ] }],
    signposts: [], ladders: [], emitters: [],
  });
  const rock = { id: 'd_5', sprite: 'gz_rock', x: 0, y: -40, w: 300, h: 120, z: 0, r: 0 };

  it('a low ledge with open space under it floats; the floor past the bottom edge does not; a high one may float', async () => {
    const { floatingLines, FLOAT_REACH, FLOAT_OPEN } = await import('../public/js/builder/ground.js?v=9218684b');
    assert.equal(FLOAT_REACH, 450);
    assert.equal(FLOAT_OPEN, 24);
    const f = floatingLines(street());
    assert.deepEqual(f.map((x) => x.id), ['plat_2'], 'plat_3 is 740 px over the floor: high, left alone');
    assert.equal(f[0].gap, 180);
    assert.equal(f[0].open, 80, "from the art's underside at -140 down to the floor at -60");
    const held = street();
    held.layers[0].decos.push(rock);
    assert.deepEqual(floatingLines(held), [], 'a rock under it: grounded');
    const short = street();
    short.layers[0].decos.push(rock);
    for (const d of short.layers[0].decos.slice(0, 2)) Object.assign(d, { y: -30, h: 30 });
    const fl = floatingLines(short);
    assert.deepEqual(fl.map((x) => [x.id, x.floor, x.open]), [['plat_1', true, 30]], 'the floor strip stops 30 px above the bottom edge');
  });

  it('the validator says so (warn, at the line, in screen space), unless the zone floats on purpose', () => {
    const zone = structuredClone(base);
    const s = street();
    Object.assign(zone.streets[0].street, { bounds: s.bounds, platforms: s.platforms, signposts: [], ladders: [], emitters: [], layers: zone.streets[0].street.layers.map((l) => (l.id === 'middleground' ? { ...l, decos: s.layers[0].decos } : l)) });
    const only = { ...ctx, rules: ['ART-'] };
    const fs = validateZone(zone, only).findings;
    assert.deepEqual(fs.map((f) => f.at), [`${zone.streets[0].key}/plat_2`]);
    const [f] = fs;
    assert.equal(f.severity, 'warn');
    assert.equal(RULES['ART-001'][1], 'Floats');
    assert.match(f.message, /Ledge plat_2 floats: 80 px of open space under its art, 180 px above the surface below/);
    assert.match(f.fix, /cli\.mjs ground --street \S+ --support/);
    assert.deepEqual(f.where, { x: 1000, y: 860, space: 'screen' });
    zone.ledges = 'floating';
    assert.deepEqual(validateZone(zone, only).findings, [], 'a zone that set "ledges": "floating" gets none');
  });
});
