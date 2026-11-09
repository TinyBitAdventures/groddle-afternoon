/**
 * G480: the cone of silence holds in Local chat, as in the original
 * (main.js doLocalChat 1708-1710, doLocalChatStart 1679). The server's half is
 * groddle-afternoon-server hub.go "chat" and "typing" (channels_test.go); here
 * is what the player under it sees: no bubble, no line, no mark, the source's
 * one sentence.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createRealtimeClient } from '../public/js/realtime-client.js?v=b13cbae1';
import { LOCAL_SUSPENDED } from '../public/js/features/realtime-feature.js?v=d90ae938';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

function fakeClient() {
  const made = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; made.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  }
  const client = createRealtimeClient({ ticket: async () => ({ ticket: 't', path: '/ws' }), baseUri: 'https://groddle.localhost/play/online/', WebSocket: FakeSocket, setTimeout: () => 0, clearTimeout: () => {}, now: () => 1000, random: () => 0.5 });
  return { client, last: () => made.at(-1) };
}

describe('G480 the cone of silence in Local chat', () => {
  it('uses the source sentence', () => {
    assert.equal(LOCAL_SUSPENDED, "Sorry, you're currently suspended from this chat.");
    assert.doesNotMatch(LOCAL_SUSPENDED, /—/);
  });

  it('hello says whether the ticket put the player under the cone', async () => {
    for (const [word, want] of [[true, true], [undefined, false], ['yes', false]]) {
      const { client, last } = fakeClient();
      client.start();
      await flush();
      last().open();
      await flush();
      last().receive({ t: 'hello', you: { id: 7, name: 'Ada' }, cone: word });
      assert.equal(client.me.cone, want);
      client.stop?.();
    }
  });

  it('a new word from the server reaches the feature as msg:cone, and a refusal comes as an error', async () => {
    const { client, last } = fakeClient();
    const seen = [];
    client.on('msg:cone', (m) => seen.push(['cone', m.on]));
    client.on('error', (m) => seen.push(['error', m.code]));
    client.start();
    await flush();
    last().open();
    await flush();
    last().receive({ t: 'hello', you: { id: 7, name: 'Ada' } });
    last().receive({ t: 'cone', on: true });
    last().receive({ t: 'error', code: 'suspended', message: LOCAL_SUSPENDED });
    assert.deepEqual(seen, [['cone', true], ['error', 'suspended']]);
    client.stop?.();
  });

  it('sayLocalChat asks before the line shows or goes out, and only for the player\'s own lines', () => {
    const game = read('public/game.js');
    const at = game.indexOf('function sayLocalChat');
    const body = game.slice(at, game.indexOf('function finishAssistedFeatChain', at));
    const ask = body.indexOf("features.query('localChatRefused', engine)");
    assert.ok(ask > 0, 'sayLocalChat asks');
    assert.match(body.slice(ask - 40, ask), /participant === 'Ur' &&/, 'companions in solo are never refused');
    for (const later of ['submitIncantation(', "features.query('localChatSaid'", 'showLocalChatBubble(', 'showSpeechBubble(', 'notify.chat(']) {
      assert.ok(body.indexOf(later) > ask, `${later} comes after the check: the Feat never hears a refused line`);
    }
  });

  it('the typing mark stays home under the cone, and a solo game has no session to ask', () => {
    const src = read('public/js/features/realtime-feature.js');
    assert.match(src, /if \(coned\(\) \|\| typedLine \|\|/);
    assert.match(src, /localChatRefused\(\) \{\s*return session\?\.refuseLine\(\) \? true : null;/);
  });
});

describe('G480 the site names the cone in the ticket', { skip: skipWithoutSite }, () => {
  it('a realtime ticket carries the chat cone, so Local chat needs no groups list', () => {
    const ticket = readFileSync(join(SITE_DIR, 'src/RealtimeTicket.php'), 'utf8');
    assert.match(ticket, /in_array\('chat', \(new Groups\(\$this->minn\)\)->cones\(\$user->id\), true\)/);
    assert.match(ticket, /\$payload\['cone'\] = true;/);
    assert.match(readFileSync(join(SITE_DIR, 'src/Groups.php'), 'utf8'), /public function cones\(int \$me\): array/);
  });
});
