// #603: on an upright phone the camera rises over a Paradise course's top by the top bar's height
// (game.js cameraTopSlack, G928). The course's sky stopped at y 0, so the canvas's clear colour
// (the page's light blue) showed as a band behind the bar on Abysmal Thrill and Radial Heights.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shortSceneBand } from '../public/js/location-view.js?v=04d55c40';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
const fnBody = (name) => {
  const at = game.indexOf(`function ${name}(`);
  return game.slice(at, game.indexOf('\n}\n', at));
};

describe('Paradise sky over the course top (#603)', () => {
  it('every course paints its top colour on up over y 0', () => {
    const sky = fnBody('paintParadiseSky');
    assert.match(sky, /if \(index === 0\) sky\.rect\(0, -PARADISE_SKY_ABOVE, course\.width, PARADISE_SKY_ABOVE\)\.fill\(color\);/);
    const above = Number(/const PARADISE_SKY_ABOVE = (\d+);/.exec(game)?.[1]);
    // More than any phone's top bar at the smallest stage scale (a 1000 px view on a 400 css px tall canvas).
    assert.ok(above >= 600, `${above}`);
    // Every course's background goes through it (recovered, drawn and art courses alike).
    assert.match(fnBody('buildParadiseBackground'), /^[^]*paintParadiseSky\(root, course\);[^]*if \(course\.id === 'cloud_rings'\)/);
  });

  it('the band over a short view takes the course top colour where it is dark', () => {
    assert.match(fnBody('paintParadiseSky'), /root\.skyTop = `#\$\{\(stops\[0\]\[1\] >>> 0\)\.toString\(16\)\.padStart\(6, '0'\)\.slice\(-6\)\}`;/);
    assert.equal(shortSceneBand('#00222e'), '#00222e');
  });
});
