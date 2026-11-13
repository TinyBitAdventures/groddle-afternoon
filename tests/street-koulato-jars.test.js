/**
 * Koulato Cluster's firefly jars (register G679): js/koulato-jars.js against the street's own
 * scripts (GIF10RP1DBU11NU.json events, from LIF10RP1DBU11NU.xml).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JAR_ARRIVALS, JAR_BOXES, JAR_DECOS, JAR_FLIES, countArrival, inJarBox, isKoulatoCluster, litJars, normalizeJarSave } from '../public/js/koulato-jars.js?v=5838b30a';
import { createEventRuntime, runLocationEvent } from '../public/js/location-events.js?v=05663361';
import { koulatoJarsFeature } from '../public/js/features/koulato-jars-feature.js?v=4e2e3fbf';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const street = () => JSON.parse(readFileSync(join(root, 'public/assets/streets/GIF10RP1DBU11NU.json'), 'utf8'));

describe('Koulato Cluster jars (G679)', () => {
  test('the decos the events touch are hide_all\'s twelve, and all start hidden', () => {
    const s = street();
    const touched = new Set();
    for (const acts of Object.values(s.events)) for (const a of acts) if (a.deco) touched.add(a.deco);
    assert.deepEqual([...touched].sort(), [...JAR_DECOS].sort());
    koulatoJarsFeature.prepareStreet(s);
    const hidden = s.layers.flatMap((l) => l.decos || []).filter((d) => d.hidden).map((d) => d.id).sort();
    assert.deepEqual(hidden, [...JAR_DECOS].sort());
  });

  test('each box stands in front of its jar: the jar\'s back-layer x scaled to the street, the source reward point 15-20 px left', () => {
    const s = street();
    const layer = s.layers.find((l) => l.id === 'T_1352760858565');
    const mg = s.layers.find((l) => l.id === 'middleground');
    const jars = ['jar5_1352760858569', 'jar5_1352760858571', 'jar5_1352760858570'].map((id) => layer.decos.find((d) => d.id === id));
    JAR_BOXES.forEach((box, i) => {
      assert.ok(Math.abs(jars[i].x * (mg.w / layer.w) - box.x) <= 3, `jar ${box.n}`);
      assert.ok(box.x - box.drop.x >= 10 && box.x - box.drop.x <= 22, `reward ${box.n}`);
      assert.ok(box.why.length > 30);
    });
    // The boxes do not overlap: one Glitch lights one jar.
    for (let i = 1; i < JAR_BOXES.length; i++) assert.ok(JAR_BOXES[i].x - JAR_BOXES[i - 1].x > JAR_BOXES[i].w);
    // Each box reaches the walkable ledge under its jar.
    for (const box of JAR_BOXES) {
      const ledge = s.platforms.find((p) => Math.min(p.x1, p.x2) + 2500 <= box.x && Math.max(p.x1, p.x2) + 2500 >= box.x && Math.abs(p.y1 + 1500 - 1167) < 15);
      assert.ok(ledge && inJarBox(box, box.x, ledge.y1 + 1500), `ledge under jar ${box.n}`);
    }
  });

  test('the jars come out every 30th arrival (player_enter, reset_vars)', () => {
    const save = normalizeJarSave(null);
    for (let i = 1; i < JAR_ARRIVALS; i++) assert.equal(countArrival(save), false);
    assert.equal(countArrival(save), true);
    assert.deepEqual(save, { arrivals: 0, placed: true });
    assert.deepEqual(normalizeJarSave({ arrivals: 'x', placed: 1 }), { arrivals: 0, placed: false });
    assert.deepEqual(normalizeJarSave({ arrivals: 12.7, placed: true }), { arrivals: 12, placed: true });
  });

  test('a jar lights for any Glitch on it; all three at once is the street\'s three-player puzzle', () => {
    const on = (n) => ({ x: JAR_BOXES[n].x, y: JAR_BOXES[n].y - 10 });
    assert.deepEqual(litJars([on(1)]), [false, true, false]);
    assert.deepEqual(litJars([on(0), on(1), on(2)]), [true, true, true]);
    assert.deepEqual(litJars([{ x: JAR_BOXES[1].x, y: JAR_BOXES[1].y - 400 }]), [false, false, false]);
  });

  test('the street\'s scripts: jars out, a light per jar, complete once with the big pools, then everything out', () => {
    const s = street();
    const rt = createEventRuntime();
    const shown = (fx) => fx.filter((e) => e.type === 'deco' && e.visible).map((e) => e.id);
    assert.equal(shown(runLocationEvent(rt, s.events, 'place_jars', { now: 0 })).length, 3);
    assert.ok(rt.flags.has('jars_on'));
    assert.deepEqual(shown(runLocationEvent(rt, s.events, 'jar2_on', { now: 10 })), ['firebog_light_pool_1352760858567', 'fireflies_1352760858574']);
    const fx = runLocationEvent(rt, s.events, 'complete', { now: 20 });
    assert.equal(shown(fx).length, 3);
    assert.ok(rt.flags.has('completed') && !rt.flags.has('jars_on'));
    assert.deepEqual(rt.timers.map((t) => t.event), ['hide_all']);
    assert.deepEqual(runLocationEvent(rt, s.events, 'complete', { now: 30 }), [], 'once');
    assert.deepEqual(runLocationEvent(rt, s.events, 'jar1_on', { now: 40 }), [], 'no lights once the jars are put away');
    assert.equal(JAR_FLIES, 7);
    assert.ok(isKoulatoCluster('LIF10RP1DBU11NU') && isKoulatoCluster('GIF10RP1DBU11NU'));
  });
});
