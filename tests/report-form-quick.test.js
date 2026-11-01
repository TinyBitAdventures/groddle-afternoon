// Player reports 2026-11-01 (tickets 21, 30, 32): a long reply is read in full, the report form
// takes typing at once with its picture drawn behind it, a blank picture is never sent, and the
// home Mailbox has the original's name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('the home Mailbox (ticket 30)', () => {
  it('is called Mailbox, as the original named it (npc_mailbox.js 3-5); "(1)" read as a count of mail', () => {
    assert.match(read('public/js/features/homes-feature.js'), /classId: 'npc_mailbox',\n\s+\/\/[^\n]*\n\s+label: 'Mailbox',/);
    for (const p of ['public/js/features/homes-feature.js', 'public/game.js', 'public/play/index.html', 'public/play/online/index.html']) {
      assert.doesNotMatch(read(p), /Mailbox \(1\)/, p);
    }
  });
});
