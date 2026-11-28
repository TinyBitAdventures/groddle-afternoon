/**
 * #486 (G1003, Austin 2026-11-18): quest rooms the source made with {no_auto_return: true} show no
 * Go back once solved; the room's own way out is the way home. Leave before the room is solved
 * stays. players/inc_instances.js instances_left 145 sends you back only without no_auto_return;
 * Glitch's client had no room-bar button at all.
 * Run: node --test tests/quest-room-no-auto-return.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roomLeaveButton } from '../public/js/quest-instance.js?v=bb5d53fd';
import { QUEST_ROOMS, roomModulePath } from '../public/js/quest-rooms/catalog.js?v=f37a25ba';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjsDir = join(root, '../glitch-GameServerJS');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** Quests whose own file makes their room with no_auto_return (quests/*.js instances_create_delayed). */
function noAutoReturnQuests() {
  const dir = join(gsjsDir, 'quests');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js') && /instances_create_delayed[^\n]*no_auto_return: true/.test(readFileSync(join(dir, f), 'utf8')))
    .map((f) => f.replace(/\.js$/, ''))
    .sort();
}

const loadRoom = async (roomId) => (await import(`../public/js/quest-rooms/${roomModulePath(roomId).slice(2)}`)).room;

describe('#486 no Go back in no_auto_return rooms', () => {
  it('the bar keeps Leave while the room runs and drops Go back once a no_auto_return room is solved', () => {
    assert.deepEqual(roomLeaveButton({}, 'active'), { label: 'Leave', hidden: false });
    assert.deepEqual(roomLeaveButton({}, 'solved'), { label: 'Go back', hidden: false });
    assert.deepEqual(roomLeaveButton({ doneLabel: 'Wake up' }, 'solved'), { label: 'Wake up', hidden: false });
    assert.deepEqual(roomLeaveButton({ noAutoReturn: true }, 'active'), { label: 'Leave', hidden: false });
    assert.equal(roomLeaveButton({ noAutoReturn: true }, 'solved').hidden, true);
  });

  it('the source: Firefly Whistle and the four Tower quests', { skip: !existsSync(gsjsDir) && 'no GSJS checkout' }, () => {
    assert.deepEqual(noAutoReturnQuests(), ['firefly_whistle', 'tower_quest', 'tower_quest_part2', 'tower_quest_part3', 'tower_quest_part3repeat']);
    const inst = readFileSync(join(gsjsDir, 'players/inc_instances.js'), 'utf8');
    assert.match(inst, /if \(\(!instance\.getProp\('no_auto_return'\) && !no_auto_return\) \|\| force\)\{/);
  });

  it('every no_auto_return quest room is flagged, and no other built room is', { skip: !existsSync(gsjsDir) && 'no GSJS checkout' }, async () => {
    const quests = noAutoReturnQuests();
    const flagged = new Set(quests.map((q) => QUEST_ROOMS[q]));
    assert.deepEqual([...flagged].sort(), ['firefly_whistle', 'gwendolyn']);
    for (const roomId of flagged) assert.equal((await loadRoom(roomId)).noAutoReturn, true, roomId);
    for (const [quest, roomId] of Object.entries(QUEST_ROOMS)) {
      if (flagged.has(roomId)) continue;
      assert.match(read(`public/js/quest-rooms/${roomModulePath(roomId).slice(2)}`), /^(?![\s\S]*noAutoReturn: true)/, `${quest} -> ${roomId}`);
    }
  });

  it('the feature hides the button, ignores a click on it, and says how to get home', () => {
    const src = read('public/js/features/quest-instances-feature.js');
    assert.match(src, /const leave = roomLeaveButton\(room, run\.status\);\s*hud\.leave\.textContent = leave\.label;\s*hud\.leave\.hidden = leave\.hidden;/);
    assert.match(src, /function confirmLeave\(engine\) \{\s*if \(!run\) return;\s*if \(roomLeaveButton\(room, run\.status\)\.hidden\) return;/);
    assert.match(src, /\.qi-hud-heading button\[hidden\]\{display:none\}/);
    assert.match(src, /run\.status === 'solved' && room\?\.noAutoReturn\) return \{ ok: false, msg: room\.doneTravelText/);
  });
});
