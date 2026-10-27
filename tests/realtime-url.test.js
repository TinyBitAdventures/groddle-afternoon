/**
 * The realtime server's address (G335 hosting): /ws on the site's own host, unless
 * wp-config.php defines GRODDLE_REALTIME_URL (a ws:// or wss:// address on another
 * host, for a site whose web server cannot pass /ws on). The site's ticket answer
 * carries it as url (groddle-afternoon-site src/RealtimeTicket.php); the client
 * connects there (js/realtime-client.js socketUrl).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { socketUrl } from '../public/js/realtime-client.js?v=mp3-4';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = process.env.GRODDLE_SITE_DIR || join(root, '..', 'groddle-afternoon-site');
const ticketPhp = join(siteDir, 'src/RealtimeTicket.php');

function siteUrl(value) {
  const define = value === undefined ? '' : `define('GRODDLE_REALTIME_URL', ${JSON.stringify(value)});`;
  return execFileSync('php', ['-r', `${define} require ${JSON.stringify(ticketPhp)}; echo json_encode(Groddle\\Minn\\RealtimeTicket::socketUrl());`], { encoding: 'utf8' }).trim();
}

describe('the realtime server address', () => {
  it('the client keeps a named ws:// or wss:// address and puts a path on the page host', () => {
    const base = 'https://groddleafternoon.com/play/online/';
    assert.equal(socketUrl('wss://play.groddleafternoon.com/ws', base), 'wss://play.groddleafternoon.com/ws');
    assert.equal(socketUrl('/ws', base), 'wss://groddleafternoon.com/ws');
    assert.equal(socketUrl(undefined, base), 'wss://groddleafternoon.com/ws');
  });

  it('the client prefers the ticket url over its path', () => {
    const src = readFileSync(join(root, 'public/js/realtime-client.js'), 'utf8');
    assert.match(src, /new WS\(socketUrl\(t\?\.url \|\| t\?\.path, baseUri\)\)/);
  });

  it('the site names only a ws:// or wss:// address with a host and no credentials', { skip: !existsSync(ticketPhp) }, () => {
    assert.equal(JSON.parse(siteUrl(undefined)), null);
    assert.equal(JSON.parse(siteUrl('wss://play.groddleafternoon.com/ws')), 'wss://play.groddleafternoon.com/ws');
    assert.equal(JSON.parse(siteUrl('ws://127.0.0.1:8793/ws')), 'ws://127.0.0.1:8793/ws');
    for (const bad of ['https://play.example.com/ws', 'wss://user:pw@play.example.com/ws', 'wss:///ws', 'javascript:alert(1)', 'wss://play.example.com/ws#x']) {
      assert.equal(JSON.parse(siteUrl(bad)), null, bad);
    }
    const src = readFileSync(ticketPhp, 'utf8');
    assert.match(src, /\$answer\['url'\] = \$url;/);
  });
});
