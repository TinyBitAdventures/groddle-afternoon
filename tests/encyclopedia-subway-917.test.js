/**
 * G917 (#445): the Subway System map in the Encyclopedia (tools/encyclopedia/subway.mjs), drawn at
 * build time with the game's own renderSubwayMapSvg (js/map-views.js) over the recreated paper, every
 * station a link to its street, linked from the home, the Streets list and each station's streets.
 * Reads the built pages (node tools/encyclopedia/build.mjs; tests/encyclopedia.test.js runs --check).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { STATIONS } from '../public/js/subway.js?v=ea6921ff';
import { renderSubwayMapSvg } from '../public/js/map-views.js?v=7ff57fbc';
import { SUBWAY_PATH, SUBWAY_TEXT, stationAnchor } from '../tools/encyclopedia/subway.mjs';

const pub = join(import.meta.dirname, '..', 'public');
const PAGE = `${SUBWAY_PATH}index.html`;
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const page = read(PAGE);
const svg = page.slice(page.indexOf('<svg'), page.indexOf('</svg>') + 6);
/** A page-relative link as a file under public/ (a folder link is its index.html). */
const target = (from, href) => {
  const path = posix.normalize(posix.join(posix.dirname(from), href.replace(/[?#].*$/, '')));
  return path.endsWith('/') ? `${path}index.html` : path;
};
const hrefs = (html, cls) => [...html.matchAll(new RegExp(`<a class="${cls}" href="([^"]+)"`, 'g'))].map((m) => m[1]);

describe('G917 the Subway System map page', () => {
  it('draws the game\'s map as inline SVG: the track, the 12 stations, the paper', () => {
    assert.ok(svg.startsWith('<svg') && svg.includes('class="subway-map-svg"'));
    assert.match(svg, /<path class="subway-track" d="M/);
    assert.equal((svg.match(/<g class="subway-stop[ "]/g) || []).length, STATIONS.length);
    const paper = /<image class="subway-paper-art[^"]*" href="([^"]+)"/.exec(svg)?.[1];
    assert.ok(paper, 'the recreated paper is drawn');
    assert.ok(existsSync(join(pub, target(PAGE, paper))), `${paper} exists`);
    // The same geometry as the game's map: the track's path is the game's, letter for letter.
    const game = renderSubwayMapSvg({ paper: null });
    assert.equal(/<path class="subway-track" d="([^"]+)"/.exec(svg)[1], /<path class="subway-track" d="([^"]+)"/.exec(game)[1]);
  });

  it('is a page, not the game\'s window: links in place of buttons, no line buttons', () => {
    assert.doesNotMatch(svg, /role="button"|tabindex=/);
    assert.doesNotMatch(svg, /subway-line-btn/);
    // The game's own map keeps its buttons (the option is off by default).
    const game = renderSubwayMapSvg({ paper: null });
    assert.match(game, /class="subway-stop-hit" tabindex="0" role="button"/);
    assert.match(game, /subway-line-btn/);
  });

  it('every station and region on the map links to a page that exists', () => {
    const stops = hrefs(svg, 'subway-stop-hit');
    const hubs = hrefs(svg, 'subway-stop-hub-link');
    assert.equal(stops.length, STATIONS.length);
    assert.equal(hubs.length, STATIONS.length);
    for (const href of [...stops, ...hubs]) assert.ok(existsSync(join(pub, target(PAGE, href))), `${href} exists`);
    for (const m of page.slice(page.indexOf('class="sub-list"'), page.indexOf('</ol>')).matchAll(/href="([^"#][^"]*)"/g)) {
      assert.ok(existsSync(join(pub, target(PAGE, m[1]))), `${m[1]} exists`);
    }
  });

  it('lists each station with an anchor, its stairs up and its next stops; the caption says the paper is recreated', () => {
    for (const s of STATIONS) assert.match(page, new RegExp(`<li id="${stationAnchor(s)}" class="sub-station">`));
    for (const m of page.matchAll(/href="#(station-\d+)"/g)) assert.match(page, new RegExp(`id="${m[1]}"`));
    assert.ok(page.includes(SUBWAY_TEXT.caption));
    assert.match(SUBWAY_TEXT.caption, /never archived and is lost/);
    assert.doesNotMatch(page, /subway_map_bg|\.jpg/);
  });

  it('is linked from the Encyclopedia home and the Streets list', () => {
    // A line under the section cards, not a card: the cards are the sections the site menu lists (tests/site-nav-menu.test.js).
    assert.match(read('encyclopedia/index.html'), /<p class="ency-lead-small ency-subway-link">Riding the subway\? <a href="subway\/">The subway map<\/a> shows its 12 stations/);
    assert.doesNotMatch(read('encyclopedia/index.html'), /<a class="ency-card" href="subway\/">/);
    assert.match(read('encyclopedia/streets/index.html'), /<a href="\.\.\/subway\/">subway map<\/a>/);
  });

  it('every station street, and every street a station comes up on, links to the map at its station', () => {
    const streets = read('encyclopedia/search.json').split('\n').filter((l) => l.includes('"s":"streets"')).map((l) => JSON.parse(l.replace(/,$/, '')));
    const bySlug = new Map(streets.map((e) => [e.id, e]));
    let checked = 0;
    for (const rel of streets.map((e) => `${e.h}index.html`)) {
      const html = read(rel);
      const m = /<dt>Subway<\/dt><dd>.*?<a class="st-subway-map" href="([^"]+)">Subway map<\/a><\/dd>/.exec(html);
      const hasSubwayLine = html.includes('<dt>Subway</dt>');
      assert.equal(Boolean(m), hasSubwayLine, `${rel}: the Subway line ends with the map link`);
      if (!m) continue;
      assert.equal(target(rel, m[1]), PAGE);
      assert.match(page, new RegExp(`id="${m[1].split('#')[1]}"`));
      checked += 1;
    }
    assert.ok(bySlug.size > 0);
    assert.equal(checked, STATIONS.length * 2, 'twelve station streets and twelve streets above them');
  });
});

describe('G917 phone width', () => {
  it('the map scrolls inside its frame, the page never sideways', () => {
    const css = read('encyclopedia/streets.css');
    assert.match(css, /\.sub-map-frame \{ overflow-x: auto;/);
    assert.match(css, /\.sub-map-frame svg \{ display: block; width: 100%; min-width: 640px;/);
    assert.ok(existsSync(join(pub, dirname(PAGE))));
  });
});
