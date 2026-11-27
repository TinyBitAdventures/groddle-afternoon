/**
 * #372c: the phone report page (play/phone/, js/phone/companion.js) could not edit a report, though the
 * site's route (groddle-afternoon-site src/Tickets.php POST tickets/{id}/edit) and the API
 * (js/reports.js edit, canEditFirst) were there. Its thread now shows Edit by the same rule as the
 * game's window (js/ui/reports-sheet.js): your report's first message, until the team reads it.
 * Browser check (WebKit 402 x 660, the page over a faked site): Edit, the box, Save, "edited"; a 409
 * (read meanwhile) shows the site's words and Edit goes.
 * Run: node --test tests/phone-report-edit.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canEditFirst } from '../public/js/reports.js?v=3c805cc4';

const js = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js', 'phone', 'companion.js'), 'utf8');

describe('#372c Edit on the phone report page', () => {
  it('the same rule as the game: the site says editable and the first message is yours', () => {
    const mine = [{ author: 'player', body: 'x' }];
    assert.equal(canEditFirst({ editable: true, messages: mine }), true);
    assert.equal(canEditFirst({ editable: false, messages: mine }), false);
    assert.equal(canEditFirst({ editable: true, messages: [{ author: 'admin' }] }), false);
    assert.match(js, /import \{[^}]*\bcanEditFirst\b[^}]*\} from '\.\.\/reports\.js\?v=[0-9a-f]{8}';/);
  });

  it('drawThread puts Edit on the first message only, when canEditFirst says so, and marks an edited one', () => {
    const fn = js.slice(js.indexOf('function drawThread('), js.indexOf('function editFirst('));
    assert.match(fn, /const canEdit = canEditFirst\(answer\);/);
    assert.match(fn, /if \(i === 0 && canEdit\) \{/);
    assert.match(fn, /'data-phone-edit': '' \}, REPORT_TEXT\.edit\)/);
    assert.match(fn, /m\.edited \? ` · \$\{REPORT_TEXT\.edited\}` : ''/);
  });

  it('Save sends the words to the site\'s edit route; a refusal for a read report shows the site\'s words and draws Edit away', () => {
    const fn = js.slice(js.indexOf('function editFirst('), js.indexOf('let lightboxModule'));
    assert.match(fn, /if \(!text\) \{ msg\.textContent = REPORT_TEXT\.editEmpty;/);
    assert.match(fn, /drawThread\(await reports\.edit\(t\.id, text\), REPORT_TEXT\.editDone\);/);
    assert.match(fn, /if \(err\?\.status === 409\) \{[\s\S]*?drawThread\(await reports\.thread\(t\.id\), refusalWords\(err\)\)/);
  });
});
