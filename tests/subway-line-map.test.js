// The line map on the train (Austin's call, 2026-11-01): on the subway train, M opens the line you
// are riding with its stops, where the train is, the next stop and the stop you picked; off the
// train M is the world map as before.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { STATIONS, createRide, lineText, lineView, nextStation, rideTiming, stepRide } from '../public/js/subway.js?v=44d1a09f';
import { applyTrain } from '../public/js/subway-mp.js?v=ffd57d82';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const feature = readFileSync(join(root, 'public/js/features/subway-feature.js'), 'utf8');
const client = join(root, '../glitch-client/com/tinyspeck/engine');

describe('lineView: the line being ridden', () => {
  it('standing at Gregarious Grange on the Red Line: the stops in riding order, round the loop', () => {
    const ride = createRide({ stop: 3, direction: 'forwards', now: 0, timing: rideTiming(1) });
    const v = lineView(ride);
    assert.equal(v.lineName, 'Red Line');
    assert.equal(v.at.name, 'Gregarious Grange');
    assert.equal(v.moving, false);
    assert.equal(v.next.name, nextStation(3, 'forwards').name);
    assert.equal(v.next.away, 1);
    assert.equal(v.stops.length, STATIONS.length);
    // The train's own station last: 0 stops away while it stands there.
    assert.equal(v.stops.at(-1).id, 3);
    assert.equal(v.stops.at(-1).away, 0);
    for (let i = 1; i < v.stops.length; i += 1) assert.equal(v.stops[i].id, nextStation(v.stops[i - 1].id, 'forwards').id);
    assert.equal(v.chosen, null);
  });

  it('the Blue Line runs the other way', () => {
    const v = lineView(createRide({ stop: 3, direction: 'backwards', now: 0, timing: rideTiming(1) }));
    assert.equal(v.lineName, 'Blue Line');
    assert.equal(v.next.id, nextStation(3, 'backwards').id);
    assert.equal(v.colour, '#5aaee6');
  });

  it('moving: still at its last station (the client\'s star, grey), the next stop ahead; a stop you pick counts down', () => {
    const t = rideTiming(1);
    const ride = createRide({ stop: 3, direction: 'forwards', now: 0, timing: t });
    stepRide(ride, ride.departAt + 1);
    assert.equal(ride.phase, 'moving');
    const third = lineView(ride).stops[2];
    let v = lineView(ride, third.id);
    assert.equal(v.moving, true);
    assert.equal(v.at.id, 3);
    assert.equal(v.stops.at(-1).away, STATIONS.length);
    assert.deepEqual(v.chosen, { id: third.id, name: third.name, away: 3 });
    assert.equal(lineText.getOffAt(v.chosen.name, v.chosen.away), `You get off at ${third.name}, 3 stops from here.`);
    stepRide(ride, ride.arriveAt + 1);
    v = lineView(ride, third.id);
    assert.equal(v.at.id, nextStation(3, 'forwards').id);
    assert.equal(v.chosen.away, 2);
    assert.equal(lineView(ride, 999).chosen, null);
  });

  it('a shared train (MPPUBLIC): the ride on the server\'s clock is what the map shows', () => {
    const ride = createRide({ stop: 3, direction: 'forwards', now: 0, timing: rideTiming(1) });
    // The server says the train left while we stood: the ride departs now (js/subway-mp.js applyTrain).
    applyTrain(ride, { train: 'T1', street: 'TRAIN_0000000000000001', line: 'forwards', stop: 3, phase: 'moving', riders: [], need: 0, departIn: 0, arriveIn: 15000 }, 1000);
    stepRide(ride, 1000);
    const v = lineView(ride);
    assert.equal(v.at.id, 3);
    assert.equal(v.moving, true);
    assert.equal(v.next.id, nextStation(3, 'forwards').id);
  });

  it('player copy: plain words, no em dashes', () => {
    const copy = [lineText.title('Red Line'), lineText.at('X'), lineText.between('X', 'Y'), lineText.next, lineText.pick, lineText.getOffAt('X', 0), lineText.getOffAt('X', 1), lineText.yourStop, lineText.mark('X'), lineText.unmark];
    for (const c of copy) assert.doesNotMatch(c, /—|Glitch/);
    assert.equal(lineText.getOffAt('X', 1), 'You get off at X, 1 stop from here.');
  });
});

describe('wiring', () => {
  it('game.js openMap asks the subway first (M, the map button and Classic\'s go through it)', () => {
    assert.match(game, /async function openMap\(hubId, \{ find = '', focus = '', view: pickedView = '' \} = \{\}\) \{\s*\/\/[^\n]*\n\s*if \(!hubId && !find && features\.query\('openMapOverride', engine\) === true\) return;/);
  });

  it('only on the train: M opens the line map, M again closes it; off the train it says no', () => {
    assert.match(feature, /openMapOverride\(engine\) \{\s*if \(!inCar\(engine\) \|\| !ride\) return false;\s*if \(lineMap\) return closeLineMap\(engine\);\s*return openLineMap\(engine\);/);
  });

  it('it follows the train while open, and the stop you picked is forgotten off the train', () => {
    assert.match(feature, /if \(lineMap && lineKey\(lineView\(ride, chosenStop\)\) !== lineMap\.key\) drawLineMap\(engine\);/);
    assert.match(feature, /ride = null;\s*chosenStop = null;\s*closeLineMap\(engine\);/);
    assert.match(feature, /kicker: chosenStop === station\.id \? lineText\.yourStop : CAR_LABEL_KICKER,/);
  });

  it('cites the client\'s transit map while riding', { skip: !existsSync(client) && 'needs glitch-client beside the repo' }, () => {
    const mt = readFileSync(join(client, 'view/gameoverlay/maps/MapTransit.as'), 'utf8').split('\n');
    assert.match(mt.slice(179, 240).join('\n'), /getGreyScaleFilter[\s\S]*Next stop:/);
    assert.match(mt.slice(124, 135).join('\n'), /if we are riding the transit, they can't switch the lines!/);
    const hm = readFileSync(join(client, 'view/gameoverlay/maps/HubMapDialog.as'), 'utf8').split('\n');
    assert.match(hm.slice(925, 931).join('\n'), /if we are on the transit, update the map based on where we are/);
  });
});
