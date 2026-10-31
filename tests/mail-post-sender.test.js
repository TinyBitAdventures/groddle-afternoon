/**
 * Lane HOMEMAIL: "emails shouldn't say 'Tiny Speck Post'". The game's own letters come from
 * Groddle Afternoon Post; letters already saved under "Tiny Speck Post" or "Tiny Speck" read
 * under the new name as they load, and no other sender changes. Credits to Tiny Speck's art
 * elsewhere stay.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MAIL_POST_SENDER, deliverMail, mailSender, normalizeMailboxState, seedMailbox } from '../public/js/mailbox.js?v=e62cffa6';
import { letterLine } from '../public/js/mail-courier.js?v=cef544b7';
import { STREET_MAIL_WELCOME } from '../public/js/features/street-furniture-feature.js?v=c12c7cb8';

const publicDir = join(import.meta.dirname, '..', 'public');

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}

describe('the post office is Groddle Afternoon Post (HOMEMAIL)', () => {
  it('names the sender once', () => {
    assert.equal(MAIL_POST_SENDER, 'Groddle Afternoon Post');
    assert.equal(STREET_MAIL_WELCOME.sender, MAIL_POST_SENDER);
    assert.equal(letterLine(0, { sender: '' }), "OK, so there's like… an express message for you from Groddle Afternoon Post.");
  });

  it('sends no in-game mail as Tiny Speck', () => {
    const files = [...sources(join(publicDir, 'js')), join(publicDir, 'game.js')];
    const hits = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // A sender given as words (sender: '...' or a sender fallback) that names Tiny Speck.
      for (const m of text.matchAll(/(sender\s*[:=]|cleanParty\([^)]*,|\|\|)\s*(['"`])Tiny Speck[^'"`]*\2/g)) hits.push(`${relative(publicDir, file)}: ${m[0]}`);
    }
    assert.deepEqual(hits, []);
    // The letters the game writes itself.
    const st = seedMailbox({ messages: [] }, 1_000_000);
    assert.deepEqual(st.messages.map((m) => m.sender), ['Groddle Afternoon Post', 'Amp']);
    assert.equal(deliverMail(st, { text: 'No sender given' }).sender, MAIL_POST_SENDER);
  });

  it('reads letters saved under the old names as Groddle Afternoon Post, and leaves every other sender alone', () => {
    const saved = normalizeMailboxState({
      messages: [
        { id: 'a', sender: 'Tiny Speck Post', text: 'Your mailbox is ready.' },
        { id: 'b', sender: 'Tiny Speck', text: "Here's a special delivery just for you!" },
        { id: 'c', sender: { label: '  Tiny Speck Post ' }, text: 'Old shape' },
        { id: 'd', sender: 'Amp', text: 'Hi' },
        { id: 'e', sender: 'Auction Fulfillment and Logistics Corporation', text: 'Sold' },
        { id: 'f', sender: 'Tiny Specks', text: 'Not the post office' },
        { id: 'g', sender: '', text: 'Nobody' },
      ],
    });
    assert.deepEqual(saved.messages.map((m) => m.sender), [
      'Groddle Afternoon Post',
      'Groddle Afternoon Post',
      'Groddle Afternoon Post',
      'Amp',
      'Auction Fulfillment and Logistics Corporation',
      'Tiny Specks',
      'Groddle Afternoon Post',
    ]);
    // Delivered under the old name (a stale caller, a server row): shown under the new one.
    assert.equal(deliverMail(normalizeMailboxState({}), { sender: 'Tiny Speck', text: 'x' }).sender, MAIL_POST_SENDER);
    assert.equal(mailSender('Tiny Speck Post'), MAIL_POST_SENDER);
    assert.equal(mailSender('Lily Linguistic'), 'Lily Linguistic');
    assert.equal(letterLine(1, { sender: 'Tiny Speck' }), "Oh, right. There's also a message from Groddle Afternoon Post.");
  });

  it("keeps the site email's credit to Tiny Speck's art", (t) => {
    const site = process.env.GRODDLE_SITE_DIR;
    if (!site) return t.skip('GRODDLE_SITE_DIR is not set');
    {
      assert.match(readFileSync(join(site, 'src', 'PlayerMail.php'), 'utf8'), /made with Tiny Speck\\'s public-domain art/);
    }
  });
});
