/**
 * Report #231 (live, Dr Flavius): the "Project available" bubbles over the Street Spirits (the
 * vendors) sat off the top of the screen at some window sizes, reachable only by jumping. Glitch hung
 * the bubble over the giver's head (ActionIndicatorView.as 199-202); here it comes down into the view,
 * under the top bar's pills, as the client pushed its chat bubbles down over their speaker
 * (ChatBubble.as keepInBounds 106-117), never past the giver's feet; a giver wholly above the view
 * keeps its bubble with it. js/job-indicator.js jobIndicatorTip, street-jobs-feature tickIndicators.
 * Run: node --test tests/r231-job-bubble-in-view.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { jobIndicatorTip } from '../public/js/job-indicator.js?v=05498227';
import { topClearOver } from '../public/js/features/street-jobs-feature.js?v=d0f80279';

const src = readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'features', 'street-jobs-feature.js'), 'utf8');

describe('report 231: the project bubble stays in view', () => {
  it('a bubble with room above the giver stays where Glitch hung it', () => {
    assert.equal(jobIndicatorTip({ tip: 300, height: 45, viewTop: 100, feet: 500 }), 300);
    assert.equal(jobIndicatorTip({ tip: 145, height: 45, viewTop: 100, feet: 500 }), 145, 'exactly at the line');
  });

  it('above the clear line it comes down until its top clears the bar', () => {
    // The tip wanted 20 px over the view top; the bar is 60 px tall: the top lands on the line.
    const tip = jobIndicatorTip({ tip: 980, height: 45, viewTop: 1060, feet: 1250 });
    assert.equal(tip, 1105);
    assert.ok(tip - 45 >= 1060);
  });

  it('never below the giver\'s feet, and a giver above the view keeps its bubble', () => {
    assert.equal(jobIndicatorTip({ tip: 40, height: 45, viewTop: 100, feet: 120 }), 120, 'down to the feet at most');
    assert.equal(jobIndicatorTip({ tip: -200, height: 45, viewTop: 100, feet: 80 }), -200, 'out of view with its giver');
  });

  it('the clear line is the bottom of the top-bar pills over the bubble\'s columns', () => {
    const boxes = [{ left: 10, right: 520, bottom: 44 }, { left: 540, right: 780, bottom: 44 }, { left: 560, right: 760, bottom: 68 }, { left: 850, right: 1000, bottom: 44 }];
    assert.equal(topClearOver(boxes, 600, 700), 68, 'under the nameplate and the featured pill');
    assert.equal(topClearOver(boxes, 300, 400), 44, 'under the stats pill');
    assert.equal(topClearOver(boxes, 790, 840), 0, 'in the gap between pills');
    assert.equal(topClearOver([], 0, 100), 0, 'Classic: nothing over the world');
  });

  it('tickIndicators places the spirit\'s bubble with them', () => {
    const tick = src.slice(src.indexOf('function tickIndicators('), src.indexOf('function spawnBoard('));
    assert.match(tick, /const want = spr\.y - Math\.abs\(spr\._worldHitH \|\| spr\.height \|\| 0\) - INDICATOR_LIFT;/);
    assert.match(tick, /topClearOver\(topBarViewBoxes\(engine, now\), left, left \+ hit\.width\)/);
    assert.match(tick, /root\.y = jobIndicatorTip\(\{ tip: want, height: -hit\.y \+ 2, viewTop: cam\.y \+ clear \+ 6, feet: spr\.y \}\);/);
    // The featured project is a line inside the nameplate (Austin 2026-11-13), so the nameplate's box covers it.
    assert.match(src, /document\.querySelectorAll\('\.top-bar > \.hud-pill, #street-nameplate'\)/);
  });
});
