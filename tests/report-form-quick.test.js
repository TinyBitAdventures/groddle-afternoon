// Player reports 2026-11-01 (tickets 21, 30, 32): a long reply is read in full, the report form
// takes typing at once with its picture drawn behind it, a blank picture is never sent, and the
// home Mailbox has the original's name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('a long reply is read in full (ticket 21)', () => {
  it('the thread scrolls in the sheet body with a scrollbar you can see, every message at full height, in both skins', () => {
    const modern = read('public/js/features/bug-report-feature.js');
    const classic = read('public/css/classic.css');
    for (const [css, root] of [[modern, '\\[data-ui="modern"\\]'], [classic, ':root\\[data-ui="classic"\\]']]) {
      const rule = new RegExp(`${root} #bug-report-panel \\.reports-messages \\{([^}]*)\\}`).exec(css)?.[1] || '';
      assert.ok(rule, 'a messages rule');
      assert.doesNotMatch(rule, /overflow/, 'the list is not a scroller of its own');
      assert.match(rule, /flex: none/);
      assert.match(css, new RegExp(`${root} #bug-report-panel \\.reports-body::-webkit-scrollbar-thumb \\{`));
      assert.match(css, new RegExp(`${root} #bug-report-panel \\.reports-thread-view \\{ flex: 1 0 auto; \\}`));
    }
    const sheet = read('public/js/ui/reports-sheet.js');
    assert.match(sheet, /body\.scrollTop = Math\.max\(0, body\.scrollTop \+ last\.getBoundingClientRect\(\)\.top/, 'opens at the newest message\'s first line');
    assert.doesNotMatch(sheet, /scrollIntoView/);
  });
});

describe('the home Mailbox (ticket 30)', () => {
  it('is called Mailbox, as the original named it (npc_mailbox.js 3-5); "(1)" read as a count of mail', () => {
    assert.match(read('public/js/features/homes-feature.js'), /classId: 'npc_mailbox',\n\s+\/\/[^\n]*\n\s+label: 'Mailbox',/);
    for (const p of ['public/js/features/homes-feature.js', 'public/game.js', 'public/play/index.html', 'public/play/online/index.html']) {
      assert.doesNotMatch(read(p), /Mailbox \(1\)/, p);
    }
  });
});
