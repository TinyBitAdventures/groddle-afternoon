// G1127 (#606, a player's ideas, none from Glitch; Austin 2026-11-22: build 1, 2 and 4, not 3):
// (1) the line map on the train is the Map's Subway view (the same paper, curved track and window),
// (2) the train's star rides that curve between stops, not a straight line, and (4) each line has its
// own colour, from one table (js/subway.js LINE_COLOURS) that every subway map draws from, made of
// design tokens. The star stays a star (idea 3, a train icon, is not built).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LINE_COLOURS, LINE_TOKENS, STATIONS, createRide, cubicAt, curvePoint, lineStarPoint, lineView, nextStation, rideTiming, stationById, stepRide, subwayPoints, subwaySegments } from '../public/js/subway.js?v=ea6921ff';
import { renderSubwayMapSvg } from '../public/js/map-views.js?v=7ff57fbc';
import { readTokens } from '../tools/tokens/css-sources.mjs';

const root = join(import.meta.dirname, '..');
const feature = readFileSync(join(root, 'public/js/features/subway-feature.js'), 'utf8');
const fn = (name) => {
  const a = feature.indexOf(`function ${name}(`);
  return feature.slice(a, feature.indexOf('\n}\n', a) + 2);
};
const segIndex = (fromId) => STATIONS.findIndex((s) => s.id === fromId);
/** The least distance from pt to the drawn segment (sampled finely). */
function distToSeg(seg, pt) {
  let best = Infinity;
  for (let i = 0; i <= 2000; i += 1) {
    const c = cubicAt(seg, i / 2000);
    best = Math.min(best, Math.hypot(c.x - pt.x, c.y - pt.y));
  }
  return best;
}
const movingRide = (stop, direction) => {
  const ride = createRide({ stop, direction, now: 0, timing: rideTiming(1) });
  stepRide(ride, ride.departAt);
  assert.equal(ride.phase, 'moving');
  return ride;
};

describe('(4) one colour table, design tokens', () => {
  it('each line has its own token, defined in style.css as a palette colour', () => {
    const tokens = readTokens(root);
    assert.notEqual(LINE_TOKENS.forwards, LINE_TOKENS.backwards);
    for (const dir of ['forwards', 'backwards']) {
      assert.equal(LINE_COLOURS[dir], `var(${LINE_TOKENS[dir]})`);
      const value = tokens.get(LINE_TOKENS[dir]);
      assert.match(value || '', /^var\(--c-(red|blue)-[\w-]+\)$/, `${LINE_TOKENS[dir]} is a palette colour`);
    }
    assert.match(tokens.get('--subway-red'), /--c-red-/);
    assert.match(tokens.get('--subway-blue'), /--c-blue-/);
  });

  it('the Map\'s Subway view and the train\'s line map both take their colour from it', () => {
    for (const dir of ['forwards', 'backwards']) {
      assert.match(renderSubwayMapSvg({ direction: dir }), new RegExp(`class="subway-map-svg"[^>]*style="--line-c: var\\(${LINE_TOKENS[dir]}\\)"`));
      const view = lineView(movingRide(3, dir));
      assert.equal(view.colour, LINE_COLOURS[dir]);
      assert.match(renderSubwayMapSvg({ ride: view }), new RegExp(`class="subway-map-svg is-riding"[^>]*style="--line-c: var\\(${LINE_TOKENS[dir]}\\)"`));
    }
  });

  it('no raw colour left in the subway feature\'s maps: they are the Map\'s drawing', () => {
    assert.match(fn('lineSvg'), /return renderSubwayMapSvg\(\{ ride: view, paper: subwayPaper\(\) \}\);/);
    assert.match(fn('mapSvg'), /return renderSubwayMapSvg\(\{/);
    assert.doesNotMatch(feature, /#e8553c|#5aaee6|#eceadb/i);
    for (const name of ['lineSvg', 'mapSvg']) assert.doesNotMatch(fn(name), /#[0-9a-f]{3,6}\b/i, name);
  });
});

describe('(1) the line map on the train is the Map\'s Subway view', () => {
  const view = lineView(movingRide(3, 'forwards'), nextStation(nextStation(3, 'forwards').id, 'forwards').id);
  const car = renderSubwayMapSvg({ ride: view });
  const tab = renderSubwayMapSvg({ direction: 'forwards' });
  const track = (svg) => /<path class="subway-track" d="([^"]+)"/.exec(svg)?.[1];

  it('the same paper, curved track and frame as the Map\'s', () => {
    assert.ok(track(car));
    assert.equal(track(car), track(tab));
    assert.match(track(car), / C/, 'the track is curves');
    assert.match(car, /<svg viewBox="0 0 760 460"/);
    assert.match(car, /class="subway-paper-art map-bg-soft/);
  });

  it('the ride\'s own marks: the star on the train\'s station, the next stop, your stop ringed, no line buttons', () => {
    const at = stationById(view.at.id);
    assert.match(car, new RegExp(`subway-line-star moving" data-star="1"[^>]*transform="translate\\(${at.map_pos[0]} ${at.map_pos[1]}\\)"`));
    assert.match(car, new RegExp(`<g class="subway-stop is-next" data-station="${view.next.id}"`));
    assert.match(car, /subway_map_next_stop_red/);
    assert.match(car, new RegExp(`<g class="subway-stop is-mine" data-station="${view.chosen.id}"[^]*?class="subway-stop-mine"[^]*?>Your stop</text>`));
    assert.doesNotMatch(car, /subway-line-btn/);
    assert.doesNotMatch(car, /set a destination or teleport/);
    assert.match(car, /aria-label="Red Line map"/);
    assert.match(fn('drawLineMap'), /bindSubwayMap\(lineMap\.svg, \{ onStop: \(e, st\) => chooseStop\(engine, st\.id\) \}\);/);
  });

  it('the station\'s Subway Map is it too, with nothing to press', () => {
    const still = renderSubwayMapSvg({ here: { station: stationById(1), how: 'here' }, next: 6, interactive: false });
    assert.equal(track(still), track(tab));
    assert.doesNotMatch(still, /tabindex|role="button"|subway-line-btn/);
    assert.match(still, /<g class="subway-stop is-next" data-station="6"/);
  });

  it('the window is the Map\'s: its card, scrim and gold frame', () => {
    assert.match(feature, /\.subway-map \{ [^}]*background: var\(--scrim\); \}/);
    assert.match(feature, /\.subway-map-card \{ [^}]*background: var\(--surface\); border: 1px solid var\(--border\); border-radius: var\(--radius-l\);/);
    assert.match(feature, /\.subway-map-zoom, \.subway-line-frame \{ [^}]*border: 1px solid var\(--c-gold-59\);/);
  });
});

describe('(2) the star rides the curve', () => {
  const segs = subwaySegments(subwayPoints());

  it('mid-ride the star lies on the drawn track, off the straight line between the stops', () => {
    for (const dir of ['forwards', 'backwards']) {
      for (const stop of [3, 8, 1]) {
        const view = lineView(movingRide(stop, dir));
        const next = view.next.id;
        const seg = segs[dir === 'forwards' ? segIndex(stop) : segIndex(next)];
        for (const p of [0.25, 0.5, 0.75]) {
          const pt = lineStarPoint(view, p);
          assert.ok(distToSeg(seg, pt) < 0.5, `${dir} from ${stop} at ${p}: on the curve`);
        }
      }
    }
    // Jutuan Central to Onto Parada bows well away from the straight line.
    const view = lineView(movingRide(4, 'forwards'));
    const a = stationById(4).map_pos;
    const b = stationById(view.next.id).map_pos;
    const mid = lineStarPoint(view, 0.5);
    assert.ok(Math.hypot(mid.x - (a[0] + b[0]) / 2, mid.y - (a[1] + b[1]) / 2) > 10, 'not the straight line\'s middle');
  });

  it('even pace: half the hop is half the track; the ends are the stations', () => {
    const seg = segs[segIndex(3)];
    const next = nextStation(3, 'forwards').id;
    const arc = (pt) => {
      // Track length from the start of the segment to its sample nearest pt.
      let len = 0;
      let best = { d: Infinity, len: 0 };
      let prev = cubicAt(seg, 0);
      for (let i = 1; i <= 4000; i += 1) {
        const c = cubicAt(seg, i / 4000);
        len += Math.hypot(c.x - prev.x, c.y - prev.y);
        prev = c;
        const d = Math.hypot(c.x - pt.x, c.y - pt.y);
        if (d < best.d) best = { d, len };
      }
      return { at: best.len, total: len };
    };
    const { at, total } = arc(curvePoint(3, next, 0.5));
    assert.ok(Math.abs(at / total - 0.5) < 0.02, `half way: ${(at / total).toFixed(3)}`);
    assert.deepEqual(curvePoint(3, next, 0), { x: stationById(3).map_pos[0], y: stationById(3).map_pos[1] });
    assert.deepEqual(curvePoint(3, next, 1), { x: stationById(next).map_pos[0], y: stationById(next).map_pos[1] });
    // The Blue Line runs the same stretch backwards.
    const back = curvePoint(next, 3, 0.3);
    const fwd = curvePoint(3, next, 0.7);
    assert.ok(Math.hypot(back.x - fwd.x, back.y - fwd.y) < 0.01);
    assert.equal(curvePoint(3, 5, 0.5), null, 'not neighbours');
  });

  it('the feature places the star with no offset: the map is drawn on map_pos itself', () => {
    assert.match(fn('placeLineStar'), /const at = `translate\(\$\{pt\.x\.toFixed\(1\)\} \$\{pt\.y\.toFixed\(1\)\}\)`;/);
    assert.doesNotMatch(feature, /LINE_MAP_SHIFT/);
  });
});
