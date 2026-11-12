// Ticket 18(b), Austin's design 2026-11-01: the report opens over other windows, and its picture
// holds the game's UI (Include the game's UI, on by default) with chat, mail and Activity blanked
// and the Reports window left out; the context names the open windows.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { REPORT_TEXT } from '../public/js/reports.js?v=fa6c662a';
import { REPORT_LEAVE_OUT, REPORT_MASK, maskClone, openPanels } from '../public/js/features/bug-report-feature.js?v=991c33c7';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** A tiny element tree: enough for maskClone and openPanels. */
function node(attrs = {}, children = []) {
  const n = { ...attrs, style: {}, hidden: Boolean(attrs.hidden), children, attrs: {} };
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.getClientRects = () => (n.hidden ? [] : [1]);
  const all = () => children.flatMap((c) => [c, ...c.all()]);
  n.all = all;
  const has = (c) => (n.className || '').split(' ').includes(c);
  n.matches = (sel) => sel.split(',').map((x) => x.trim()).some((x) => (x.startsWith('#') ? n.id === x.slice(1) : x.startsWith('.') ? x.slice(1).split('.').every(has) : false));
  n.querySelectorAll = (sel) => (sel === '*' ? all() : all().filter((c) => c.matches(sel)));
  n.querySelector = (sel) => n.querySelectorAll(sel)[0] || null;
  return n;
}

describe('the picture with the game UI', () => {
  it('blanks the words in chat, mail and Activity, keeping their boxes', () => {
    const words = node({ className: 'social-msg', textContent: 'secret' });
    const chat = node({ className: 'social-log' }, [node({ className: 'social-act' }, [words])]);
    const input = node({ id: 'local-chat-input', value: 'half typed' });
    const mail = node({ id: 'mail-reader' }, [node({ className: 'line' })]);
    const pack = node({ id: 'pack' }, [node({ className: 'pack-slot' })]);
    const tree = node({ id: 'wrap' }, [chat, input, mail, pack]);
    assert.equal(maskClone(tree), 3);
    assert.equal(chat.style.color, 'transparent');
    assert.equal(words.style.visibility, 'hidden', 'every word inside is hidden');
    assert.equal(input.value, '', 'a draft is not sent');
    assert.equal(mail.children[0].style.visibility, 'hidden');
    assert.equal(pack.style.color, undefined, 'the rest of the UI is drawn as it is');
    for (const s of ['#local-chat-stream', '.social-log', '#mail-reader', '#mail-list', '#activity-history', '.grp-lines']) assert.ok(REPORT_MASK.includes(s), s);
    assert.deepEqual([...REPORT_LEAVE_OUT], ['bug-report-panel', 'bug-btn-lift']);
  });

  it('names the open windows for the report context', () => {
    globalThis.getComputedStyle ||= () => ({ visibility: 'visible' });
    const make = node({ id: 'make-panel', className: 'side-panel', dataset: { makeToolName: 'Gassifier' } }, [node({ id: 'make-title', textContent: 'Make Heavy Gas' })]);
    const shrine = node({ id: 'shrine-panel', className: 'glitch-modal' }, [node({ tag: 'h2', textContent: 'Shrine to Mab' })]);
    shrine.querySelector = (sel) => (sel === 'h2' ? shrine.children[0] : null);
    const map = node({ id: 'map-panel', className: 'map-panel' });
    const shut = node({ id: 'vendor-panel', className: 'glitch-modal', hidden: true });
    const report = node({ id: 'bug-report-panel', className: 'ui-sheet' });
    // The Social drawer is open nearly all the time in Modern, so it is left out (Austin, 2026-11-01).
    const social = node({ id: 'social-body' });
    const doc = node({}, [make, shrine, map, shut, report, social]);
    assert.deepEqual(openPanels(doc), ['make:gassifier/heavy gas', 'donate:mab', 'map']);
  });

  it('draws the page with a pinned, self-hosted MIT library loaded only when a report opens', () => {
    const f = read('public/js/features/bug-report-feature.js');
    const lib = 'public/vendor/modern-screenshot/modern-screenshot-4.7.0.mjs';
    assert.ok(existsSync(join(root, lib)));
    assert.match(read('public/vendor/modern-screenshot/LICENSE'), /MIT License/);
    assert.match(f, /const SHOT_LIB = '\.\.\/\.\.\/vendor\/modern-screenshot\/modern-screenshot-4\.7\.0\.mjs';/);
    assert.match(f, /import\(SHOT_LIB\)/, 'a dynamic import, not a static one');
    assert.doesNotMatch(f, /^import .*modern-screenshot/m);
    // The canvas comes from the stage (render then extract), not the WebGL buffer.
    assert.match(f, /engine\?\.snapshotCanvas\?\.\(\{ width: cssW \}\)/);
    assert.match(read('public/game.js'), /snapshotCanvas\(\{ width = VIEW_W \} = \{\}\) \{[\s\S]*?frame: new PIXI\.Rectangle\(0, 0, VIEW_W, VIEW_H\)/);
  });

  it('lets the player choose the world only, and opens over other windows', () => {
    const sheet = read('public/js/ui/reports-sheet.js');
    assert.match(sheet, /id: 'reports-picture-ui'[\s\S]*?checked: true/);
    assert.match(sheet, /capture\(\{ ui \}\)/);
    assert.equal(REPORT_TEXT.pictureUi, 'Include the game\'s UI');
    for (const k of ['pictureUi', 'pictureHintUi', 'pictureDrawing']) assert.doesNotMatch(REPORT_TEXT[k], /—|Glitch/, k);
    const f = read('public/js/features/bug-report-feature.js');
    assert.match(f, /lift\.id = 'bug-btn-lift';/);
    assert.match(f, /#bug-btn-lift \{ position: fixed; z-index: calc\(var\(--z-modal\) \+ 31\);/);
  });

  it('the site keeps the open windows with the report and the console shows them', { skip: skipWithoutSite }, () => {
    assert.match(readFileSync(sitePath('src/BugReports.php'), 'utf8'), /'panels' => 300\]/);
    assert.match(readFileSync(sitePath('console/console.js'), 'utf8'), /\['panels', 'Open windows'\]/);
  });
});
