/**
 * Links in chat lines (js/chat-links.js, Austin 2026-11-04): addresses in what players say are links,
 * only http and https, built with text nodes, opening in a new tab; a link to another site asks first
 * and names the real host. Glitch linked chat lines the same way (StringUtil.as linkify 66-90).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOME_HOSTS,
  LINK_MAX,
  LINK_REL,
  appendLinkedText,
  bindChatLinks,
  closeLinkConfirm,
  homeHostsFor,
  leaveText,
  linkConfirmOpen,
  linkSegments,
  linkifyTextNodes,
  readLink,
  trimTrailing,
} from '../public/js/chat-links.js?v=b717fac7';
import { FakeEl, page } from './social-fake-dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** The links in a line: [typed, href, host, home]. */
const links = (text, opts) => linkSegments(text, opts).filter((s) => s.href).map((s) => [s.text, s.href, s.host, s.home]);
/** The line put back together from its pieces (nothing is lost or added). */
const joined = (text) => linkSegments(text).map((s) => s.text).join('');

describe('chat links: what becomes a link', () => {
  it('links the address in Austin\'s line, the rest stays words', () => {
    const line = "Might be a little silly however I'm now giving points on https://groddleafternoon.com/contribute/ for folks that send in reports :).";
    assert.deepEqual(links(line), [['https://groddleafternoon.com/contribute/', 'https://groddleafternoon.com/contribute/', 'groddleafternoon.com', true]]);
    assert.equal(joined(line), line);
    const segs = linkSegments(line);
    assert.equal(segs.length, 3);
    assert.equal(segs[0].text, "Might be a little silly however I'm now giving points on ");
    assert.equal(segs[2].text, ' for folks that send in reports :).');
  });

  it('only http and https: javascript:, data:, file:, vbscript:, mailto: and the rest stay words', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(document.cookie)',
      'javascript://%0aalert(1)',
      'javascript:https://groddleafternoon.com',
      'data:text/html,<script>alert(1)</script>',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
      'vbscript:msgbox',
      'mailto:a@b.com',
      'ftp://example.com/x',
      'blob:https://groddleafternoon.com/1',
      'about:blank',
      'chrome://settings',
    ]) {
      assert.deepEqual(links(bad), [], bad);
      assert.equal(joined(bad), bad, bad);
    }
    for (const bad of ['javascript:x', 'data:x', 'file:x']) assert.equal(readLink(bad), null, bad);
  });

  it('an address glued to a word or a scheme is no link', () => {
    for (const bad of ['xhttps://example.com', 'javascript:https://example.com', 'foo:https://example.com', 'a.www.example.com', 'me@www.example.com', '/https://example.com', 'nogroddleafternoon.com']) {
      assert.deepEqual(links(bad), [], bad);
    }
    // After a space, a bracket or a quote it is one.
    assert.equal(links('see (https://example.com) now')[0][0], 'https://example.com');
    assert.equal(links('"https://example.com"')[0][0], 'https://example.com');
  });

  it('a user name or password before the host stays words (the look-alike trick)', () => {
    for (const bad of ['https://groddleafternoon.com@evil.example', 'https://groddleafternoon.com:pw@evil.example/x', 'https://user@example.com', 'http://a:b@example.com']) {
      assert.deepEqual(links(bad), [], bad);
      assert.equal(readLink(bad), null, bad);
    }
  });

  it('look-alike hosts are other sites: they ask, and the confirm names the real host', () => {
    const [[, , host, home]] = links('https://groddleafternoon.com.evil.example/login');
    assert.equal(host, 'groddleafternoon.com.evil.example');
    assert.equal(home, false);
    assert.equal(links('https://groddle-afternoon.com/')[0][3], false);
    assert.equal(links('https://groddleafternoon.co/')[0][3], false);
    assert.equal(links('https://evil.example/groddleafternoon.com')[0][2], 'evil.example');
    assert.equal(links('https://evil.example/?u=https://groddleafternoon.com')[0][2], 'evil.example');
    // Letters from another alphabet come out as the browser reads them (punycode), never as the look-alike.
    const puny = readLink('https://xn--grddleafternoon-tfb.com/');
    assert.equal(puny.host, 'xn--grddleafternoon-tfb.com');
    assert.equal(puny.home, false);
    // Non-ASCII letters end an address, so "gröddleafternoon.com" is never a link to anywhere.
    assert.deepEqual(links('https://gröddleafternoon.com/'), []);
    assert.equal(leaveText('example.com'), 'This link goes to example.com. Open it?');
  });

  it('the game\'s own site opens at once; the local copy only from the local copy', () => {
    assert.deepEqual(HOME_HOSTS, ['groddleafternoon.com', 'www.groddleafternoon.com']);
    assert.equal(links('https://www.groddleafternoon.com/play/')[0][3], true);
    assert.equal(links('http://groddleafternoon.com/')[0][3], true);
    assert.equal(links('https://play.groddleafternoon.com/')[0][3], false, 'a subdomain is not the site itself');
    assert.equal(links('https://groddle.localhost/play/')[0][3], false);
    assert.deepEqual(homeHostsFor('groddle.localhost'), [...HOME_HOSTS, 'groddle.localhost']);
    assert.deepEqual(homeHostsFor('groddleafternoon.com'), HOME_HOSTS);
    assert.deepEqual(homeHostsFor('evil.localhost'), HOME_HOSTS);
    assert.equal(links('https://groddle.localhost/play/', { homeHosts: homeHostsFor('groddle.localhost') })[0][3], true);
  });

  it('bare www. and groddleafternoon.com forms become https links; other bare hosts stay words', () => {
    assert.deepEqual(links('try www.example.com/a?b=1 ok'), [['www.example.com/a?b=1', 'https://www.example.com/a?b=1', 'www.example.com', false]]);
    assert.deepEqual(links('go to groddleafternoon.com/contribute/!'), [['groddleafternoon.com/contribute/', 'https://groddleafternoon.com/contribute/', 'groddleafternoon.com', true]]);
    assert.deepEqual(links('groddleafternoon.com'), [['groddleafternoon.com', 'https://groddleafternoon.com/', 'groddleafternoon.com', true]]);
    for (const bare of ['example.com', 'groddleafternoon.community', 'groddleafternoon.com.evil.example', 'evil.example/x', 'www.', 'www']) {
      assert.deepEqual(links(bare), [], bare);
    }
  });

  it('trailing punctuation is left out of the link; a bracket the address opened stays in', () => {
    assert.equal(trimTrailing('https://a.com/x.'), 'https://a.com/x');
    assert.equal(trimTrailing('https://a.com/x?!.,;:'), 'https://a.com/x');
    assert.equal(trimTrailing("https://a.com/x'\""), 'https://a.com/x');
    assert.equal(trimTrailing('https://a.com/x)'), 'https://a.com/x');
    assert.equal(trimTrailing('https://en.wikipedia.org/wiki/Glitch_(video_game)'), 'https://en.wikipedia.org/wiki/Glitch_(video_game)');
    assert.equal(trimTrailing('https://en.wikipedia.org/wiki/Glitch_(video_game)).'), 'https://en.wikipedia.org/wiki/Glitch_(video_game)');
    assert.equal(links('(see https://en.wikipedia.org/wiki/Glitch_(video_game)).')[0][0], 'https://en.wikipedia.org/wiki/Glitch_(video_game)');
    assert.equal(links('is it https://a.com/x?')[0][0], 'https://a.com/x');
    assert.equal(links('https://a.com/?q=1&r=2#top, then')[0][0], 'https://a.com/?q=1&r=2#top');
    const line = 'wow https://example.com/page! and https://groddleafternoon.com.';
    assert.deepEqual(links(line).map((l) => l[0]), ['https://example.com/page', 'https://groddleafternoon.com']);
    assert.equal(joined(line), line);
  });

  it('several links, schemes in any case, ports and IP addresses', () => {
    assert.deepEqual(links('HTTPS://Example.COM/A and http://x.org:8080/p').map((l) => [l[1], l[2]]), [['https://example.com/A', 'example.com'], ['http://x.org:8080/p', 'x.org:8080']]);
    assert.equal(links('http://127.0.0.1:8793/healthz')[0][2], '127.0.0.1:8793');
    assert.deepEqual(links('https://localhost/x')[0].slice(2), ['localhost', false]);
    assert.deepEqual(links('https://nodot/'), []);
    assert.deepEqual(links('https://'), []);
    assert.deepEqual(links('https://.com'), []);
  });

  it('a long address stays words', () => {
    const long = `https://example.com/${'a'.repeat(LINK_MAX)}`;
    assert.deepEqual(links(long), []);
    assert.equal(joined(long), long);
    const ok = `https://example.com/${'a'.repeat(LINK_MAX - 30)}`;
    assert.equal(links(ok).length, 1);
  });

  it('markup in a line is words, never part of a link', () => {
    const line = '<a href="javascript:alert(1)">https://example.com</a><img src=x onerror=alert(1)>';
    assert.deepEqual(links(line).map((l) => l[1]), ['https://example.com/']);
    assert.equal(joined(line), line);
    assert.deepEqual(links('https://example.com/"onmouseover="alert(1)').map((l) => l[0]), ['https://example.com/']);
  });
});

describe('chat links: the DOM', () => {
  const saved = {};
  let t;
  before(() => {
    for (const k of ['document', 'innerWidth', 'innerHeight', 'setTimeout']) saved[k] = globalThis[k];
    t = page();
    globalThis.document = t.doc;
    t.doc.removeEventListener = function (type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); };
    globalThis.innerWidth = 1280;
    globalThis.innerHeight = 800;
  });
  after(() => {
    closeLinkConfirm();
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  function guarded(tag) {
    const n = new FakeEl(tag);
    // A line is never drawn as HTML.
    Object.defineProperty(n, 'innerHTML', { set() { throw new Error('innerHTML from a chat line'); } });
    return n;
  }

  it('draws words as text nodes and links with textContent, target _blank and rel', () => {
    const p = guarded('p');
    const doc = { createTextNode: (s) => t.doc.createTextNode(s), createElement: (tag) => guarded(tag) };
    const n = appendLinkedText(p, 'hi <b>https://example.com/x</b> and groddleafternoon.com/contribute/.', { doc, homeHosts: HOME_HOSTS });
    assert.equal(n, 2);
    assert.equal(p.textContent, 'hi <b>https://example.com/x</b> and groddleafternoon.com/contribute/.');
    const [away, home] = p.children.filter((c) => c.tagName === 'A');
    assert.equal(away.getAttribute('href'), 'https://example.com/x');
    assert.equal(away.textContent, 'https://example.com/x');
    assert.equal(away.getAttribute('target'), '_blank');
    assert.equal(away.getAttribute('rel'), LINK_REL);
    assert.equal(LINK_REL, 'noopener noreferrer nofollow ugc');
    assert.equal(away.getAttribute('data-chat-link'), 'away');
    assert.equal(away.getAttribute('data-host'), 'example.com');
    assert.equal(home.getAttribute('data-chat-link'), 'home');
    assert.equal(home.getAttribute('href'), 'https://groddleafternoon.com/contribute/');
    assert.equal(home.textContent, 'groddleafternoon.com/contribute/');
  });

  function linkIn(text) {
    const log = new FakeEl('div');
    t.game.append(log);
    appendLinkedText(log, text, { doc: t.doc, homeHosts: HOME_HOSTS });
    return { log, a: log.children.find((c) => c.tagName === 'A') };
  }

  it('a link to another site asks first, naming its host, and its Open is a link of its own', () => {
    bindChatLinks(t.game, { doc: t.doc, win: globalThis });
    const { a } = linkIn('look https://groddleafternoon.com.evil.example/login');
    const e = a.dispatch('click', { detail: 1, button: 0 });
    assert.equal(e.defaultPrevented, true, 'the browser does not follow it');
    assert.equal(linkConfirmOpen(a), true);
    const box = t.game.querySelector('[data-chat-link-confirm]');
    assert.ok(box);
    assert.equal(box.getAttribute('role'), 'alertdialog');
    assert.match(box.textContent, /^This link goes to groddleafternoon\.com\.evil\.example\. Open it\?/);
    const open = box.querySelector('[data-chat-link-open]');
    assert.equal(open.tagName, 'A');
    assert.equal(open.getAttribute('href'), 'https://groddleafternoon.com.evil.example/login');
    assert.equal(open.getAttribute('target'), '_blank');
    assert.equal(open.getAttribute('rel'), LINK_REL);
    // A second click on the same link while it asks keeps the one confirm.
    a.dispatch('click', { detail: 1, button: 0 });
    assert.equal(t.game.querySelectorAll('[data-chat-link-confirm]').length, 1);
    box.querySelector('[data-chat-link-cancel]').click();
    assert.equal(linkConfirmOpen(), false);
    assert.equal(t.game.querySelector('[data-chat-link-confirm]'), null);
  });

  it('a middle click and Escape: held, then closed', () => {
    const { a } = linkIn('https://example.com/');
    const mid = a.dispatch('auxclick', { button: 1 });
    assert.equal(mid.defaultPrevented, true);
    assert.equal(linkConfirmOpen(a), true);
    const box = t.game.querySelector('[data-chat-link-confirm]');
    const esc = box.dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.defaultPrevented, true);
    assert.equal(esc.stopped, true, 'keys in the confirm never reach the game');
    assert.equal(linkConfirmOpen(), false);
  });

  it('a link to the game\'s own site opens as it is', () => {
    const { a } = linkIn('https://groddleafternoon.com/contribute/');
    const e = a.dispatch('click', { detail: 1, button: 0 });
    assert.equal(e.defaultPrevented, false);
    assert.equal(linkConfirmOpen(), false);
  });

  it('an Activity entry\'s text nodes get their links in place; its markup and links stay as they were', () => {
    // A tiny tree with node types (the drawer's entries are the game's markup).
    const text = (v) => ({ nodeType: 3, nodeValue: v, parent: null, get textContent() { return this.nodeValue; }, replaceWith(...ns) { const k = this.parent.childNodes; const i = k.indexOf(this); for (const n of ns) n.parent = this.parent; k.splice(i, 1, ...ns); } });
    const elem = (tag, ...kids) => {
      const e = { nodeType: 1, tagName: tag.toUpperCase(), childNodes: [], attrs: {}, parent: null,
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
        append(...ns) { for (const n of ns) { n.parent = this; this.childNodes.push(n); } },
        set textContent(v) { this.childNodes = [text(v)]; this.childNodes[0].parent = this; },
        get textContent() { return this.childNodes.map((c) => c.textContent).join(''); } };
      e.append(...kids);
      return e;
    };
    const doc = { createElement: (t) => elem(t), createTextNode: (v) => text(v) };
    const body = elem('div', text('Fi: see https://example.com/a and '), elem('span', text('+3 iMG')), elem('a', text('https://kept.example/')), text(' then groddleafternoon.com/x.'));
    assert.equal(linkifyTextNodes(body, { doc, homeHosts: HOME_HOSTS }), 2);
    assert.equal(body.textContent, 'Fi: see https://example.com/a and +3 iMGhttps://kept.example/ then groddleafternoon.com/x.');
    const made = body.childNodes.filter((c) => c.tagName === 'A' && c.getAttribute('data-chat-link'));
    assert.deepEqual(made.map((a) => [a.getAttribute('href'), a.getAttribute('data-chat-link')]), [['https://example.com/a', 'away'], ['https://groddleafternoon.com/x', 'home']]);
    assert.equal(body.childNodes.find((c) => c.tagName === 'SPAN').textContent, '+3 iMG');
    assert.match(read('public/js/ui/social-drawer.js'), /body\.innerHTML = e\.html \|\| colorizeAmounts\(e\.text\);\n\s+\/\/ LINKS[^\n]*\n\s+linkifyTextNodes\(body, \{ doc: document \}\);/);
  });

  it('every chat surface draws its lines through it', () => {
    const drawer = read('public/js/ui/social-drawer.js');
    assert.match(drawer, /appendLinkedText\(p, String\(line\.text \?\? ''\), \{ doc: document \}\)/);
    assert.doesNotMatch(drawer, /createTextNode\(` \$\{line\.text\}`\)/);
    for (const f of ['realtime-feature', 'party-feature', 'groups-feature']) {
      const src = read(`public/js/features/${f}.js`);
      assert.match(src, /appendLinkedText\(li, line\.text\)/, f);
      assert.doesNotMatch(src, /createTextNode\(line\.text\)/, f);
    }
    const game = read('public/game.js');
    assert.match(game, /bindChatLinks\(document\.getElementById\('game-root'\)\)/);
    // Speech bubbles are drawn on the canvas (never links, as Glitch's ChatBubble): a long address wraps in them.
    assert.match(game, /wordWrapWidth: 246,\n\s+\/\/ LINKS[^\n]*\n\s+breakWords: true,/);
    const css = read('public/style.css');
    assert.match(css, /\.chat-link \{[^}]*text-decoration: underline;/);
    assert.match(css, /\.chat-link-confirm \{[^}]*z-index: var\(--z-notice\);/);
    assert.match(read('public/css/classic.css'), /\.social-drawer \.chat-link \{ color: var\(--c-classic-link\); \}/);
  });
});
