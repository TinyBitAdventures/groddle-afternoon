/**
 * Register G329: trade requests between players (players/inc_requests.js).
 * The realtime server's requests.go holds each street's requests ("<name> is
 * looking for someone to trade with.", 5 minutes, shown to arrivals,
 * cancelled on leaving), part of trade.go's module; accepting starts a trade
 * through its start. The game's side is in features/trade-feature.js (Menu,
 * Make a trade offer; Start negotiation! / End trade prompts). Solo has none.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('G329 trade requests: the server', { skip: skipWithoutServer }, () => {
  const go = () => readFileSync(serverPath('requests.go'), 'utf8');

  it('says the source words and keeps the 5 minute timeout', () => {
    const src = go();
    assert.match(src, /tradeRequestTimeout = 5 \* time\.Minute \/\/ inc_requests\.js:19/);
    assert.ok(src.includes('" is looking for someone to trade with."'));
    assert.ok(src.includes('" was looking for someone to trade with."'));
    assert.ok(src.includes('" accepted."'));
    assert.ok(src.includes("Wait until there's someone around to hear your offer before you make it!"));
  });

  it('is part of trade.go, which registers its kinds and starts the trade for the accepter', () => {
    const trade = readFileSync(serverPath('trade.go'), 'utf8');
    for (const kind of ['trade_request', 'trade_request_cancel', 'trade_request_accept']) assert.match(trade, new RegExp(`r\\.Handle\\("${kind}"`), kind);
    assert.match(trade, /m\.req = newTradeRequests\(m\.h, func\(cl \*Client, id int64\) \{\n\t\tm\.start\(cl/);
    assert.match(go(), /m\.start\(cl, q\.from\.ID\)/);
  });
});

describe('G329 trade requests: the game', () => {
  const src = read('public/js/features/trade-feature.js');

  it('posts from Menu, Make a trade offer and answers with the source buttons', () => {
    assert.match(src, /menu: 'Make a trade offer', \/\/ ChatDropdown\.as:100/);
    assert.match(src, /accept: 'Start negotiation!'/);
    assert.match(src, /end: 'End trade'/);
    for (const kind of ['trade_request', 'trade_request_cancel', 'trade_request_accept']) assert.ok(src.includes(`'${kind}'`), kind);
    for (const kind of ['trade_requested', 'trade_unrequested']) assert.ok(src.includes(`'msg:${kind}'`), kind);
  });

  it('lives in the multiplayer session only (solo makes no session)', () => {
    assert.match(src, /if \(engine\?\.mode !== 'multiplayer' \|\| typeof document === 'undefined'\) return null;/);
    const at = src.indexOf('// —— Trade requests (G329) ——');
    assert.ok(at > src.indexOf('function createSession(engine, client)'), 'inside createSession');
  });

  it('accepting refuses while a trade is open or items are unsettled, as starting does', () => {
    const body = src.slice(src.indexOf('function acceptRequest(from)'), src.indexOf("const menu = document.getElementById?.('more-list');"));
    assert.match(body, /TRADE_TEXT\.busySelf/);
    assert.match(body, /TRADE_TEXT\.unsettled/);
  });
});
