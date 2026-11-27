/**
 * G859 (#413, #421): the pack search on an upright phone. The open field (150 px) and the bag buttons
 * left the hits no room, on the street and in Decoration Mode's Pack tab, and a letter typed just after
 * the tap showed late: the redraw of every stack (game.js renderPackBar) ran inside the input event,
 * before the letter could paint. Now a letter paints first and the redraw follows (letters typed before
 * it share one), Enter and Down still pick from the up-to-date hits, and upright the bags and the count
 * step aside while searching.
 * Run: node --test tests/pack-search-phone.test.js
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackRow } from '../public/js/ui/pack-row.js?v=f5ef5f6c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

function fakeEl(id) {
  const on = {};
  return {
    id, value: '', hidden: false, dataset: {},
    classList: { toggle() {}, contains: () => false },
    addEventListener: (type, fn) => { (on[type] ||= []).push(fn); },
    fire: (type, ev = {}) => { for (const fn of on[type] || []) fn({ preventDefault() {}, stopPropagation() {}, ...ev }); },
    setAttribute() {}, focus() {}, select() {},
    querySelector: () => null, querySelectorAll: () => [],
  };
}

describe('G859: a typed letter paints before the pack redraws', () => {
  let frames;
  let tasks;
  let saved;
  beforeEach(() => {
    frames = [];
    tasks = [];
    saved = { raf: globalThis.requestAnimationFrame, st: globalThis.setTimeout };
    globalThis.requestAnimationFrame = (fn) => frames.push(fn);
    globalThis.setTimeout = (fn) => { tasks.push(fn); return tasks.length; };
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = saved.raf;
    globalThis.setTimeout = saved.st;
  });
  const mount = () => {
    const els = Object.fromEntries(['pack-bar', 'pack-row', 'pack-search', 'pack-search-btn', 'pack-search-input', 'pack-search-close', 'pack-items', 'pack-pager', 'pack-scroll'].map((id) => [id, fakeEl(id)]));
    const queries = [];
    const row = createPackRow({ document: { getElementById: (id) => els[id] || null }, onQuery: (q) => queries.push(q) });
    row.install();
    row.openSearch();
    return { els, queries, row, input: els['pack-search-input'] };
  };
  const type = (input, text) => { input.value = text; input.fire('input'); };
  const run = (list) => { const fns = list.splice(0); for (const fn of fns) fn(); };

  it('no redraw inside the input event; one after the next frame and a task, for every letter typed by then', () => {
    const { queries, row, input } = mount();
    type(input, 'c');
    type(input, 'ch');
    assert.deepEqual(queries, [], 'nothing drawn while the letter waits to paint');
    assert.equal(row.query(), 'ch', 'the query itself is current at once');
    assert.equal(frames.length, 1, 'one frame asked for');
    run(frames);
    assert.deepEqual(queries, [], 'not in the frame itself (that is before its paint)');
    run(tasks);
    assert.deepEqual(queries, ['ch'], 'one redraw with the latest letters');
    type(input, 'chi');
    run(frames);
    run(tasks);
    assert.deepEqual(queries, ['ch', 'chi']);
  });

  it('Enter and Down draw the waiting hits first; closing drops a waiting redraw', () => {
    const { queries, row, input } = mount();
    type(input, 'pi');
    input.fire('keydown', { key: 'Enter' });
    assert.deepEqual(queries, ['pi']);
    run(frames);
    run(tasks);
    assert.deepEqual(queries, ['pi'], 'not drawn twice');
    type(input, 'pic');
    input.fire('keydown', { key: 'ArrowDown' });
    assert.deepEqual(queries, ['pi', 'pic']);
    type(input, 'pick');
    row.closeSearch({ focusButton: false });
    assert.deepEqual(queries, ['pi', 'pic', ''], 'the close draws the full pack');
    run(frames);
    run(tasks);
    assert.deepEqual(queries, ['pi', 'pic', ''], 'the dropped redraw never runs');
  });
});

describe('G859: upright, the hits have room while searching', () => {
  const at = css.indexOf('/* G859 (#413, #421)');
  const rule = css.slice(at, css.indexOf('\n}\n', at) + 2);
  it('the bags, divider and count step aside and the field is narrower, on a phone held upright only', () => {
    assert.ok(at > 0);
    assert.match(rule, /@media \(orientation: portrait\) \{/);
    assert.match(rule, /:root\.touch-phone #game-root #pack-row\.is-searching :is\(#pack-bags, \.pack-vsep, #pack-count\) \{ display: none; \}/);
    assert.match(rule, /:root\.touch-phone #game-root #pack-row\.is-searching \.pack-search input \{ width: 92px; \}/);
    for (const line of rule.split('\n').filter((l) => l.includes('{') && !l.includes('@media'))) assert.match(line, /^\s+:root\.touch-phone /, line);
  });
});
