/**
 * Notice the Unnoticeable on a cold spot (Austin 2026-10-29: "walked into the faint ghost shape and
 * nothing happened"). In the source the echo is a clickable location_overlay and walking into it does
 * nothing (quests/phantom_glitch.js showPhantom 447-461); the street plays HEARTBEAT for the visit
 * (onEnterLocation 437-438) until the click (callback_clickPhantom 323) or leaving (onExitLocation 442-445).
 * The remake: a registered target with the notice verb (Enter chip, click), the heartbeat loop, and a
 * first-time line that says how.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getVerbsFor } from '../public/content.js?v=g455-2';
import { SYNTH_KEY_RECIPES, SYNTH_RECIPES } from '../public/js/synth-sfx.js?v=g388-1';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const GSJS = join(root, '..', 'glitch-GameServerJS', 'quests', 'phantom_glitch.js');
const fn = (name) => {
  const start = game.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return game.slice(start, game.indexOf('\n}\n', start));
};

describe('the Phantom echo on a cold spot', () => {
  it('offers Notice on an echo and Talk to on the final Phantom', () => {
    const ctx = { pc: { energy: 100, mood: 100 }, inv: {} };
    const echo = getVerbsFor({ classId: 'phantom_glitch', state: { kind: 'echo' } }, ctx);
    assert.deepEqual(echo.map((v) => [v.id, v.enabled]), [['notice', true]]);
    const final = getVerbsFor({ classId: 'phantom_glitch', state: { kind: 'final' } }, ctx);
    assert.deepEqual(final.map((v) => v.id), ['talk_to']);
  });

  it('is a clickable target the Enter chip names as soon as it is readable', () => {
    const spawn = fn('spawnPhantomQuestEncounter');
    assert.match(spawn, /phantomTarget = register\(\{\n\s+classId: 'phantom_glitch',/);
    assert.match(spawn, /sprite\.eventMode = 'static';/);
    // The chip's keyboard chain: the new shape is the Enter target for ten seconds within 160 px.
    assert.match(spawn, /recentInteractionTarget = phantomTarget;\n\s+recentInteractionUntil = Date\.now\(\) \+ 10_000;/);
    assert.match(fn('handlePhantomInteraction'), /kind === 'echo' && verbId === 'notice'/);
  });

  it('plays the heartbeat while an echo haunts the street and stops it on notice and on leaving', () => {
    assert.equal(SYNTH_KEY_RECIPES.HEARTBEAT, 'heartbeat');
    assert.equal(typeof SYNTH_RECIPES.heartbeat, 'function');
    assert.match(fn('startPhantomHeartbeat'), /playSoundLoop\('HEARTBEAT', \{ intervalMs: 1100/);
    const spawn = fn('spawnPhantomQuestEncounter');
    assert.match(spawn, /if \(encounter\.kind === 'echo'\) startPhantomHeartbeat\(\);/);
    const notice = fn('handlePhantomInteraction');
    assert.ok(notice.indexOf('stopPhantomHeartbeat();') > notice.indexOf("verbId === 'notice'"));
    assert.match(fn('removePhantomTarget'), /stopPhantomHeartbeat\(\)/);
    // Street change: the street teardown clears the target and the loop together.
    assert.match(game, /stopPhantomHeartbeat\(\);\n\s+phantomTarget = null;/);
  });

  it('tells a first-time hunter to click the shape or press Enter, once the shape can be read', () => {
    const spawn = fn('spawnPhantomQuestEncounter');
    assert.match(spawn, /const first = encounter\.found === 0;\n\s+pushActivity\(\n\s+first\n\s+\? 'You feel a chill\. Something half-imagined is nearby\. Click the faint shape, or stand by it and press Enter, to notice it\.'\n\s+: 'You feel a chill\. Something half-imagined is nearby\.'/);
    // Said once, when the shape is readable (after the street's arrival lines), not at spawn.
    assert.match(spawn, /if \(encounter\.kind !== 'echo' \|\| target\.state\.announced \|\| phantomTarget !== target\) return;\n\s+target\.state\.announced = true;/);
    assert.match(spawn, /sprite\.onFrameChange = \(frame\) => \{[\s\S]*?announceEcho\(\);\n\s+\};/);
    assert.match(spawn, /sprite\.onComplete = \(\) => \{[\s\S]*?announceEcho\(\);\n\s+\};/);
  });

  it('cites the source heartbeat and clickable overlay', { skip: !existsSync(GSJS) && 'no GSJS checkout' }, () => {
    const lines = readFileSync(GSJS, 'utf8').split('\n');
    assert.match(lines[437], /this\.owner\.announce_sound\('HEARTBEAT', 1000000\);/);
    assert.match(lines[322], /this\.owner\.announce_sound_stop\('HEARTBEAT'\);/);
    assert.match(lines[441], /^function onExitLocation\(previous_location\)\{/);
    assert.match(lines[443], /this\.owner\.announce_sound_stop\('HEARTBEAT'\);/);
    assert.match(lines[455], /is_clickable: true,/);
    assert.match(lines[457], /click_payload: \{quest_callback: 'clickPhantom'/);
  });
});
