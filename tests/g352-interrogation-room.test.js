/**
 * The Interrogation room (register row G352): the moderators' room an online administrator
 * opens from the console (js/interrogation-room.js, features/interrogation-room-feature.js,
 * tools/build-rebuilt-rooms.mjs, tools/interrogation/build-chair.mjs; groddle-afternoon-site
 * src/AdminConsole.php admin/interrogation and console/console.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertStreetGeometry, platformYAt } from '../public/js/street-model.js?v=b6cb6a4e';
import { arrivalInTarget } from '../public/js/location-navigation.js?v=90fca5cc';
import {
  INTERROGATION_ARRIVE,
  INTERROGATION_ARRIVE_SCREEN,
  INTERROGATION_BOOTH,
  INTERROGATION_BOUNDS,
  INTERROGATION_CHAIR,
  INTERROGATION_DOOR,
  INTERROGATION_FALLBACK,
  INTERROGATION_FLOOR_Y,
  INTERROGATION_HUB,
  INTERROGATION_LIGHT,
  INTERROGATION_PARTITIONS,
  INTERROGATION_RENDER,
  INTERROGATION_SCALE,
  INTERROGATION_SOURCE_TSID,
  INTERROGATION_TEXT,
  INTERROGATION_TSID,
  INTERROGATION_WALLS,
  doorDestinationFor,
  interrogationEcology,
  interrogationStreet,
  isInterrogationTsid,
  normalizeWayBack,
  roomX,
  roomY,
  wayBackFrom,
} from '../public/js/interrogation-room.js?v=c6a73859';
import {
  INTERROGATION_DARK_STOPS,
  INTERROGATION_DOOR_CLASS,
  interrogationRoomFeature,
  interrogationWayBack,
} from '../public/js/features/interrogation-room-feature.js?v=abce8d45';
import { CHAIR_BOX, CHAIR_OUT, CHAIR_PATHS, chairSvg, recolourHex } from '../tools/interrogation/build-chair.mjs';
import { HAS_SITE, sitePath, skipWithoutSite } from '../tools/repos.mjs';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const streets = join(pub, 'assets/streets');
const room = JSON.parse(readFileSync(join(streets, `${INTERROGATION_TSID}.json`), 'utf8'));
const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8'));
const manifest = new Set(JSON.parse(readFileSync(join(pub, 'assets/decos/manifest.json'), 'utf8')));
const gsjs = join(spike, '../glitch-GameServerJS');
const decos = (s) => s.layers.flatMap((l) => l.decos);
const floorAt = (s, x) => s.platforms.map((p) => platformYAt(p, x, 0)).filter((y) => y != null);

describe('the Interrogation room: street JSON', () => {
  it('is written, indexed in hub 67 and current (tools/build-rebuilt-rooms.mjs --check)', () => {
    execFileSync(process.execPath, [join(spike, 'tools/build-rebuilt-rooms.mjs'), '--check'], { stdio: 'pipe' });
    assertStreetGeometry(room);
    assert.deepEqual(room, interrogationStreet());
    assert.match(room.source, /^reconstruction: Interrogation \(LIFLFPPBUUT11SP/);
    assert.equal(room.reconstructed, true);
    const row = index.streets[INTERROGATION_TSID];
    assert.equal(row.label, 'Interrogation');
    assert.equal(row.hubId, '67');
    assert.equal(row.hubName, 'Multiplayer Quests');
    assert.equal(row.reconstructed, true);
    assert.ok(isInterrogationTsid(INTERROGATION_SOURCE_TSID));
  });

  it('names the GSJS map row it comes from (hub 67, "Interrogation")', { skip: !existsSync(gsjs) && 'no GSJS clone' }, () => {
    const maps = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8').split('\n');
    assert.match(maps[17991], /"LIFLFPPBUUT11SP"\s*:\s*"Interrogation"/);
    assert.match(maps[300], /"name"\s*:\s*"Multiplayer Quests"/);
    assert.equal(INTERROGATION_HUB.hubName, 'Multiplayer Quests');
  });

  it('is the render at 1.5 street px a render px: 1080 x 1296, the floor at render y 652', () => {
    assert.equal(INTERROGATION_SCALE, 1.5);
    const B = INTERROGATION_BOUNDS;
    assert.equal(B.r - B.l, INTERROGATION_RENDER.w * INTERROGATION_SCALE);
    assert.equal(B.b - B.t, INTERROGATION_RENDER.h * INTERROGATION_SCALE);
    assert.equal(roomX(0), B.l);
    assert.equal(roomY(INTERROGATION_RENDER.h), B.b);
    assert.equal(INTERROGATION_FLOOR_Y, -318);
    // The render is reference only: never shipped, never named by a shipped path.
    assert.ok(!existsSync(join(pub, INTERROGATION_RENDER.file)));
  });

  it('draws only shipped Tiny Speck decos: the hall bundle\'s cubicle walls, pictogram, glow and door, and the bulb', () => {
    const names = new Set(decos(room).map((d) => d.sprite));
    for (const n of names) assert.ok(manifest.has(n), `${n} in the deco manifest`);
    for (const n of ['cubicle_wall_left', 'cubicle_wall_right', 'cubicle_wall_double', 'bureaucratic_hall_waitingroom_1', 'bureaucratic_hall_light_ray_1', 'hanging_lightbulb', 'door_asset_bureaucratic_hall_int']) assert.ok(names.has(n), n);
    assert.equal(room.stats.decoCount, decos(room).length);
  });

  it('stands every partition on the floor, with the booth between them as the render has it', () => {
    const booth = room.layers.find((l) => l.name === 'booth');
    assert.equal(booth.w, 1080);
    for (const d of booth.decos) assert.equal(d.y + INTERROGATION_BOUNDS.t, INTERROGATION_FLOOR_Y, d.sprite);
    const left = INTERROGATION_PARTITIONS.find((p) => p.sprite === 'cubicle_wall_left');
    const right = INTERROGATION_PARTITIONS.find((p) => p.sprite === 'cubicle_wall_right');
    // The gap: cubicle_wall_left's panel ends at render x 352, the right panels start at 428.
    assert.equal(left.x - left.w / 2 + 56, roomX(352));
    assert.equal(right.x - right.w / 2, roomX(428));
    assert.ok(INTERROGATION_BOOTH.l > roomX(352) && INTERROGATION_BOOTH.r < roomX(428));
    // The pictogram and the bulb over the booth's middle.
    const mg = room.layers.find((l) => l.name === 'middleground');
    const sign = mg.decos.find((d) => d.sprite === 'bureaucratic_hall_waitingroom_1');
    const bulb = mg.decos.find((d) => d.sprite === 'hanging_lightbulb');
    assert.ok(Math.abs(sign.x - INTERROGATION_BOOTH.x) <= 2 && Math.abs(bulb.x - INTERROGATION_BOOTH.x) <= 2);
    assert.ok(bulb.y < sign.y - sign.h, 'the bulb hangs above the sign');
  });

  it('lands a visitor on the floor in the booth, the spot the console sends', () => {
    const at = arrivalInTarget(room, INTERROGATION_ARRIVE.x, INTERROGATION_ARRIVE.y - 4);
    assert.ok(at?.snapped);
    assert.deepEqual(INTERROGATION_ARRIVE_SCREEN, { x: INTERROGATION_ARRIVE.x - INTERROGATION_BOUNDS.l, y: INTERROGATION_ARRIVE.y - INTERROGATION_BOUNDS.t });
    assert.ok(INTERROGATION_ARRIVE.x > INTERROGATION_BOOTH.l && INTERROGATION_ARRIVE.x < INTERROGATION_BOOTH.r);
    // One floor the whole width, walls inside the street, the door between them.
    for (const x of [INTERROGATION_WALLS.l + 10, INTERROGATION_DOOR.x, INTERROGATION_ARRIVE.x, INTERROGATION_WALLS.r - 10]) assert.deepEqual(floorAt(room, x), [INTERROGATION_FLOOR_Y], `floor at ${x}`);
    assert.ok(INTERROGATION_WALLS.l < INTERROGATION_DOOR.x - INTERROGATION_DOOR.w / 2 && INTERROGATION_WALLS.r < INTERROGATION_BOUNDS.r);
    assert.equal(room.barriers.length, 2);
  });

  it('has no door, signpost or ladder in the street data: nothing leads in, the feature runs the way out', () => {
    assert.deepEqual(room.doors, []);
    assert.deepEqual(room.signposts, []);
    assert.deepEqual(room.ladders, []);
    for (const [tsid, row] of Object.entries(index.streets)) {
      if (tsid === INTERROGATION_TSID || !row.file) continue;
      const text = readFileSync(join(pub, row.file), 'utf8');
      assert.ok(!text.includes('FLFPPBUUT11SP'), `${tsid} leads into the Interrogation room`);
    }
  });

  it('is quiet, keeps its own light and spawns nothing', () => {
    assert.equal(room.musicFile, 'NO_MUSIC');
    assert.equal(room.ownLight, true);
    const eco = interrogationEcology(INTERROGATION_TSID);
    assert.deepEqual(eco.counts, {});
    assert.equal(eco.interior, true);
    assert.equal(eco.quoins, 0);
    assert.equal(interrogationEcology('GA5101HF7F429V5'), null);
    assert.deepEqual(interrogationRoomFeature.ecologyOverride({ tsid: INTERROGATION_TSID }), eco);
  });
});

describe('the Interrogation room: the way back', () => {
  it('keeps the street and spot a visitor came from, never the room itself', () => {
    assert.deepEqual(wayBackFrom({ tsid: 'GA5101HF7F429V5', label: 'Hechey Track', x: 900.4, y: 870.6 }), { tsid: 'GA5101HF7F429V5', label: 'Hechey Track', x: 900, y: 871 });
    assert.equal(wayBackFrom({ tsid: INTERROGATION_TSID, x: 1, y: 2 }), null);
    assert.equal(wayBackFrom({}), null);
    assert.deepEqual(wayBackFrom({ tsid: 'GA5101HF7F429V5' }), { tsid: 'GA5101HF7F429V5', label: '' });
    assert.equal(normalizeWayBack({ tsid: '../etc', x: 1, y: 2 }), null);
    assert.equal(normalizeWayBack('GA5101HF7F429V5'), null);
    assert.deepEqual(doorDestinationFor(null), { ...INTERROGATION_FALLBACK });
    assert.deepEqual(doorDestinationFor({ tsid: 'GLI32G3NUTD100I', x: 10, y: 20 }), { tsid: 'GLI32G3NUTD100I', label: '', x: 10, y: 20 });
    assert.ok(index.streets[INTERROGATION_FALLBACK.tsid], 'the fallback street is in the index');
  });

  function fakeEngine(street = 'GA5101HF7F429V5') {
    const calls = { enter: [], saves: 0, sounds: [], data: {}, activity: [] };
    return {
      calls,
      streetTsid: street,
      street: { label: 'Hechey Track' },
      player: { x: 1234, y: 870 },
      streetExists: (t) => Boolean(index.streets[t]),
      inScene: () => false,
      setData: (k, v) => { calls.data[k] = v; },
      save: () => { calls.saves += 1; },
      playSound: (k) => calls.sounds.push(k),
      pushActivity: (t) => calls.activity.push(t),
      async enter(tsid, opts) { calls.enter.push([tsid, opts]); this.streetTsid = tsid; },
    };
  }

  it('remembers where you stood before the room loads, and the door takes you back there', async () => {
    const engine = fakeEngine();
    interrogationRoomFeature.restore(undefined, engine);
    assert.equal(interrogationRoomFeature.enterGate('GLI32G3NUTD100I', engine), null, 'other streets: nothing kept');
    assert.equal(interrogationWayBack(), null);
    assert.equal(interrogationRoomFeature.enterGate(INTERROGATION_TSID, engine), null, 'never a redirect');
    assert.deepEqual(interrogationWayBack(), { tsid: 'GA5101HF7F429V5', label: 'Hechey Track', x: 1234, y: 870 });
    assert.deepEqual(interrogationRoomFeature.save(), { wayBack: { tsid: 'GA5101HF7F429V5', label: 'Hechey Track', x: 1234, y: 870 } });
    engine.streetTsid = INTERROGATION_TSID;
    // A teleport within the room keeps the way back.
    interrogationRoomFeature.enterGate(INTERROGATION_TSID, engine);
    assert.equal(interrogationWayBack().tsid, 'GA5101HF7F429V5');
    const verbs = interrogationRoomFeature.verbsFor({ classId: INTERROGATION_DOOR_CLASS });
    assert.deepEqual(verbs.map((v) => [v.id, v.label, v.enabled]), [['leave', 'Leave', true]]);
    assert.deepEqual(interrogationRoomFeature.verbsFor({ classId: 'npc_piggy' }), []);
    assert.equal(interrogationRoomFeature.runVerb({ classId: INTERROGATION_DOOR_CLASS }, 'leave', engine), true);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(engine.calls.enter, [['GA5101HF7F429V5', { spawnX: 1234, spawnY: 870 }]]);
    assert.equal(engine.calls.data.interrogationLast, 'left:GA5101HF7F429V5');
    assert.deepEqual(engine.calls.sounds, ['DOOR_OPEN']);
    assert.ok(engine.calls.saves >= 1);
    assert.equal(interrogationWayBack(), null, 'used once');
  });

  it('survives a reload in the room (the save slice), and with none kept goes to the fresh start', async () => {
    const engine = fakeEngine(INTERROGATION_TSID);
    interrogationRoomFeature.restore({ wayBack: { tsid: 'GLI32G3NUTD100I', label: 'Gregarious Grange', x: 50, y: 60 } }, engine);
    assert.equal(interrogationWayBack().tsid, 'GLI32G3NUTD100I');
    interrogationRoomFeature.restore({ wayBack: { tsid: INTERROGATION_TSID } }, engine);
    assert.equal(interrogationWayBack(), null);
    interrogationRoomFeature.runVerb({ classId: INTERROGATION_DOOR_CLASS }, 'leave', engine);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(engine.calls.enter, [[INTERROGATION_FALLBACK.tsid, {}]]);
    assert.equal(engine.calls.data.interrogationLast, `fallback:${INTERROGATION_FALLBACK.tsid}`);
  });

  it('a load that starts in the room keeps the saved way back (no street loaded yet: the index default is not where they were)', () => {
    const engine = fakeEngine('GLI2V0UN7RD1T2J');
    engine.street = null;
    engine.player = { x: 200, y: 422 };
    interrogationRoomFeature.restore({ wayBack: { tsid: 'GLI32G3NUTD100I', label: 'Gregarious Grange', x: 50, y: 60 } }, engine);
    interrogationRoomFeature.enterGate(INTERROGATION_TSID, engine);
    assert.deepEqual(interrogationWayBack(), { tsid: 'GLI32G3NUTD100I', label: 'Gregarious Grange', x: 50, y: 60 });
  });

  it('keeps nothing from a scene or a place that is no street (a QA look leaves by the fresh start)', () => {
    const engine = fakeEngine('NB_dorrit');
    interrogationRoomFeature.enterGate(INTERROGATION_TSID, engine);
    assert.equal(interrogationWayBack(), null);
    const scene = fakeEngine();
    scene.inScene = () => true;
    interrogationRoomFeature.enterGate(INTERROGATION_TSID, scene);
    assert.equal(interrogationWayBack(), null);
  });
});

describe('the Interrogation room: the look', () => {
  it('ships the chair: the hall\'s waiting chair, coloured the render\'s red-brown', () => {
    const svg = readFileSync(join(spike, CHAIR_OUT), 'utf8');
    assert.equal(INTERROGATION_CHAIR.url, CHAIR_OUT.replace(/^public\//, ''));
    assert.match(svg, new RegExp(`viewBox="${CHAIR_BOX.x} ${CHAIR_BOX.y} ${CHAIR_BOX.w} ${CHAIR_BOX.h}"`));
    assert.match(svg, /bldg_int_bhall\.swf bureaucratic_hall_bg, CC0/);
    assert.equal((svg.match(/<path /g) || []).length, CHAIR_PATHS.length);
    assert.doesNotMatch(svg, /#945a2b/i, 'no hall orange left');
    // The browns turn red; steel greys and black shadows stay.
    assert.equal(recolourHex('#cac6bb'), '#cac6bb');
    assert.equal(recolourHex('#000000'), '#000000');
    const red = recolourHex('#945a2b');
    assert.notEqual(red, '#945a2b');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(red.slice(i, i + 2), 16));
    assert.ok(r > g && g >= b - 2 && r - g > 60, red);
    // Drawn to the render's size: about 82 street px for the render's 55 px seat.
    assert.ok(Math.abs((INTERROGATION_CHAIR.w * 73) / CHAIR_BOX.w - 55 * INTERROGATION_SCALE) < 6);
    assert.throws(() => chairSvg('<svg></svg>'), /no shape group/);
  });

  it('fades to black round a pool of light under the bulb', () => {
    assert.deepEqual(INTERROGATION_DARK_STOPS[0], [0, 0]);
    const alphas = INTERROGATION_DARK_STOPS.map(([, a]) => a);
    assert.deepEqual([...alphas].sort((a, b) => a - b), alphas, 'darker outwards');
    assert.ok(alphas.at(-1) >= 0.85 && alphas.at(-1) < 0.95, 'dark, but you still see yourself at the door');
    assert.ok(Math.abs(INTERROGATION_LIGHT.x - INTERROGATION_BOOTH.x) <= 2);
    assert.ok(INTERROGATION_LIGHT.y < INTERROGATION_FLOOR_Y && INTERROGATION_LIGHT.y > roomY(440));
  });

  it('player copy: plain, no em-dashes, never the old game\'s name', () => {
    for (const t of Object.values(INTERROGATION_TEXT)) {
      assert.doesNotMatch(t, /[—–]/);
      assert.doesNotMatch(t, /Glitch/);
    }
  });
});

describe('the console: Go to the Interrogation room (groddle-afternoon-site)', { skip: skipWithoutSite }, async () => {
  const mod = HAS_SITE ? await import(pathToFileURL(sitePath('console/console.js')).href) : {};

  it('only an administrator\'s row offers it, yourself included, and only while connected', () => {
    const item = (p, o) => mod.menuFor(p, o).find((i) => i.id === 'interrogation');
    assert.equal(item({ id: 9 }, { me: 1, online: true }), undefined, 'not on a player\'s row');
    assert.deepEqual([item({ id: 1, admin: true }, { me: 1, online: true }).enabled, item({ id: 2, admin: true }, { me: 1, online: true }).enabled], [true, true]);
    const offline = item({ id: 2, admin: true }, { me: 1, online: false });
    assert.equal(offline.enabled, false);
    assert.equal(offline.reason, 'Only for a connected game.');
    assert.equal(item({ id: 1, admin: true }, { me: 1 }).label, 'Go to the Interrogation room');
    assert.equal(mod.logWords({ kind: 'interrogate', detail: {}, delivery: 'live', player: { id: 2, name: 'Ada' } }), 'took Ada to the Interrogation room');
    assert.equal(mod.logWords({ kind: 'interrogate', detail: {}, delivery: 'offline', player: { id: 2, name: 'Ada' } }), 'took Ada to the Interrogation room (they were not online)');
    // An administrator who sent themselves went there (polish2, 2026-11-09).
    assert.equal(mod.logWords({ kind: 'interrogate', detail: {}, delivery: 'live', by: { id: 2, name: 'Ada' }, player: { id: 2, name: 'Ada' } }), 'went to the Interrogation room');
    assert.equal(mod.logWords({ kind: 'interrogate', detail: {}, delivery: 'live', by: { id: 1, name: 'Bo' }, player: { id: 2, name: 'Ada' } }), 'took Ada to the Interrogation room');
    // The kind chip stays on one line: INTERROGATE, the longest kind, fits its column.
    const css = readFileSync(sitePath('console/console.css'), 'utf8');
    assert.match(css, /\.console-kind \{[^}]*white-space: nowrap;/);
    const col = Number(css.match(/\.console-loglist li \{[^}]*grid-template-columns: [\d.]+em ([\d.]+)em/)[1]);
    assert.ok(col >= 7.4, `the kind column (${col}em) fits INTERROGATE`);
    const src = readFileSync(sitePath('console/console.js'), 'utf8');
    assert.match(src, /kind === 'interrogation'\) \{\s*act\('interrogation', p, \{\}\)/);
  });

  it('the route: administrators only, an administrator to send, the realtime teleport into the booth, one log line', () => {
    const src = readFileSync(sitePath('src/AdminConsole.php'), 'utf8');
    assert.match(src, /#\[Route\(Method::Post, '\/groddle\/v1\/admin\/interrogation', policy: new Policy\(Access::Cap, self::ADMIN\)\)\]/);
    const r = src.slice(src.indexOf('public function interrogation('), src.indexOf("#[Route(Method::Post, '/groddle/v1/admin/rook_end'"));
    assert.match(r, /if \(!Capabilities::fromDb\(\$this->minn->db\)->can\(\$player\['id'\], self::ADMIN\)\) \{\s*throw new RestError\('groddle_admin_not_admin'/);
    assert.match(r, /->post\('teleport', \['player' => \$player\['id'\], 'street' => \$tsid\] \+ self::INTERROGATION_ARRIVE\)/);
    assert.match(r, /\$this->record\(\$admin, \$player\['id'\], 'interrogate'/);
    assert.ok(r.indexOf('->can($player') < r.indexOf("->post('teleport'"), 'the check before the call');
    // The same street and spot as the game's module.
    assert.match(src, new RegExp(`public const INTERROGATION_TSID = '${INTERROGATION_TSID}';`));
    assert.match(src, new RegExp(`public const INTERROGATION_ARRIVE = \\['x' => ${INTERROGATION_ARRIVE_SCREEN.x}, 'y' => ${INTERROGATION_ARRIVE_SCREEN.y}\\];`));
    assert.ok('interrogate'.length <= 12, 'fits the log kind column');
    for (const w of r.match(/'[^']*Interrogation[^']*'|"[^"]*Interrogation[^"]*"/g) || []) assert.doesNotMatch(w, /[—–]|Glitch/);
  });
});
