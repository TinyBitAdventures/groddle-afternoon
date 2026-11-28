/**
 * Report #385: in Glitch a click on a door went straight through, never a menu. The subway
 * station's steps opened a one-line menu (Enter) in ours. glitch-client control/TSFrontController.as
 * startInteractionWith 3600-3607: a DoorView starts the DOOR_MOVE at once; a click reaches it when its
 * walk ends (engine/AvatarController.as 164-197) and the keyboard's interaction too (465-479).
 * js/world-context-menu.js GLITCH_ONE_CLICK_DOORS: every location door (features/doors-feature.js
 * `street_door`) runs its Enter on a click, a tap, Enter or E; a right-click opens the menu.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLITCH_ONE_CLICK_DOORS, isOneClick, isOneClickDoor, oneClickChoice, oneClickVerbId, worldContextAction } from '../public/js/world-context-menu.js?v=00e2eb03';
import { doorsFeature } from '../public/js/features/doors-feature.js?v=d770172d';
import { STATIONS, stationStreet } from '../public/js/subway.js?v=ea6921ff';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const CLIENT = join(root, '../glitch-client/com/tinyspeck/engine/control/TSFrontController.as');
const engine = { inv: { slots: [] } };

describe('report 385: a click on a door goes through it, as in Glitch', () => {
  it('the subway station\'s steps are a location door: a click runs Enter, no menu', () => {
    for (const station of STATIONS) {
      const street = stationStreet(station);
      const stairs = street.doors.find((d) => d.id === 'door_subway_stairs');
      assert.ok(stairs, station.tsid);
      const target = { classId: 'street_door', door: stairs };
      const verbs = doorsFeature.verbsFor(target, engine);
      assert.deepEqual(verbs.map((v) => v.id), ['enter'], 'one verb: the menu was one line');
      const one = oneClickChoice(target, verbs);
      assert.equal(one.kind, 'run', station.tsid);
      assert.equal(one.verb.id, 'enter');
    }
  });

  it('every street door, and nothing else that is not a Glitch one-click item', () => {
    assert.deepEqual(GLITCH_ONE_CLICK_DOORS, { street_door: 'enter' });
    assert.equal(isOneClickDoor({ classId: 'street_door' }), true);
    assert.equal(isOneClick({ classId: 'street_door' }), true);
    assert.equal(oneClickVerbId({ classId: 'street_door' }), 'enter');
    for (const cls of ['home_door', 'puzzle_exit_door', 'magic_rock', 'npc_piggy', '']) assert.equal(isOneClickDoor({ classId: cls }), false, cls);
    // A door already opening (Enter off) opens its menu; a locked door still runs Enter, which says why.
    assert.deepEqual(oneClickChoice({ classId: 'street_door' }, [{ id: 'enter', enabled: false }]), { kind: 'menu' });
    assert.equal(oneClickChoice({ classId: 'street_door', door: { is_locked: true } }, [{ id: 'enter', enabled: true }]).kind, 'run');
    // A right-click opens the menu.
    assert.deepEqual(worldContextAction({ thing: { classId: 'street_door' } }), { kind: 'menu' });
  });

  it('game.js: a click and Enter at a door run its verb (through requestVerb, which walks there first)', () => {
    const game = read('public/game.js');
    const down = game.slice(game.indexOf("app.canvas.addEventListener('pointerdown', (e) => {"), game.indexOf("app.canvas.addEventListener('contextmenu'"));
    assert.match(down, /oneClickChoice\(best, \(\) => menuVerbsFor\(best\)\)/);
    const helper = game.slice(game.indexOf('\nfunction openMenuOrDoor('), game.indexOf('\n}\n', game.indexOf('\nfunction openMenuOrDoor(')));
    assert.match(helper, /if \(isOneClickDoor\(target\) && !currentAction\) \{/);
    assert.match(helper, /requestVerb\(target, one\.verb\);/);
    assert.match(helper, /openVerbMenu\(target\);/);
    const enter = game.slice(game.indexOf('\nfunction tryOpenNearestMenu('), game.indexOf('\n}\n', game.indexOf('\nfunction tryOpenNearestMenu(')));
    assert.equal((enter.match(/openMenuOrDoor\(/g) || []).length, 3, 'the recent thing, the hovered thing and the nearest');
    assert.doesNotMatch(enter, /openVerbMenu\(/);
  });

  it('the client\'s door rule (TSFrontController.as 3600-3607)', { skip: !existsSync(CLIENT) && 'needs glitch-client beside the game' }, () => {
    const lines = readFileSync(CLIENT, 'utf8').split('\n');
    assert.match(lines[3599], /if \(interaction_sprite is DoorView\) \{/);
    assert.match(lines[3605], /startLocationMove\(false, MoveModel\.DOOR_MOVE, DoorView\(interaction_sprite\)\.tsid, connect\.street_tsid\);/);
    assert.match(lines[3606], /return;/);
  });
});
