/**
 * #710: Koulato Cluster's hidden-ladder wormhole to Ruta Asuncion (js/collision-teleporters.js).
 * Glitch: LIF10RP1DBU11NU.xml lists objref IA9AM2L1AN42QFA "Collision-triggered Teleporter";
 * players: "behind the pillar closest to the street sign ... climb a hidden ladder, once you stop
 * climbing jump to the right, you will then be sent to Ruta Asuncion" (glitch forum, 2012);
 * Glitch Strategy Quick Tip #16: "Behind the support beam, up the ladder, to the right".
 * The box and the landing are ours (inventions: koulato-wormhole-landing).
 * Run: node --test tests/koulato-passage-710.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KOULATO_CLUSTER_TSID, RUTA_ASUNCION_TSID, TELEPORTER_CENSUS, collisionTeleportersOn } from '../public/js/collision-teleporters.js?v=e57be0e9';
import { jumpArc, reachStreet, runArc, streetWorld } from '../public/js/builder/reach-graph.js?v=687006d3';
import { inTeleporter } from '../public/js/hidden-floors.js?v=023336cb';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(spike, 'public');
const street = (tsid) => JSON.parse(readFileSync(join(pub, 'assets/streets', `${tsid}.json`), 'utf8'));
const koulato = street('GIF10RP1DBU11NU');
const ruta = street('GM410TMR0S2S1');
const sx = (s, x) => x - s.bounds.l;
const sy = (s, y) => y - s.bounds.t;
const ladder = koulato.ladders.find((x) => x.id === 'ladder_1308363631935');
/** The ladder top's stand point (screen): the ledge plat_1308363631937 at y -848.5. */
const top = { x: sx(koulato, -1850), y: sy(koulato, -848) };
const wired = () => collisionTeleportersOn('GIF10RP1DBU11NU').find((t) => String(t.to).slice(1) === 'M410TMR0S2S1');

describe('#710: the secret passage behind the trunk in Koulato Cluster goes to Ruta Asuncion', () => {
  it('the hidden ladder the reporter climbed is in the street (top at world -1850, -844)', () => {
    assert.ok(ladder && ladder.x === -1850 && ladder.y - ladder.h === -844);
  });

  it('the census row is wired here, and a box on Koulato Cluster leads to Ruta Asuncion', () => {
    const row = TELEPORTER_CENSUS.find((r) => r.tsid === 'GIF10RP1DBU11NU');
    assert.notEqual(row.state, 'inert', `census says: ${row.note}`);
    assert.ok(wired(), 'no box at the ladder top leads to Ruta Asuncion');
    assert.equal(wired().from, KOULATO_CLUSTER_TSID);
    assert.equal(wired().to, RUTA_ASUNCION_TSID);
    assert.equal(wired().objref, 'IA9AM2L1AN42QFA');
  });

  it('climbing the ladder and standing on its top does not teleport', () => {
    const t = wired();
    for (let y = sy(koulato, ladder.y); y >= top.y; y -= 8) assert.ok(!inTeleporter(t, top.x, y), `climbing at y ${y}`);
    assert.ok(!inTeleporter(t, top.x, top.y), 'standing on the top');
    // A jump straight up from the top comes back down on it, untouched.
    const w = streetWorld(koulato);
    const up = jumpArc(w, top, { dir: 0, record: true });
    assert.ok(up.points.every((p) => !inTeleporter(t, p.x, p.y)));
  });

  it('jumping to the right off the ladder top lands in the box (and a walk or a running jump crosses it)', () => {
    const t = wired();
    const w = streetWorld(koulato);
    const jump = jumpArc(w, top, { dir: 1, record: true });
    assert.ok(jump.landed, 'the jump lands');
    assert.ok(inTeleporter(t, jump.landed.x, jump.landed.y), `landed at ${Math.round(jump.landed.x)}, ${Math.round(jump.landed.y)}`);
    for (const arc of [jumpArc(w, top, { dir: 1, run: true, record: true }), runArc(w, { ...top, onGround: true }, { dir: 1, record: true, maxFrames: 120 })]) {
      assert.ok(arc.points.some((p) => inTeleporter(t, p.x, p.y)), 'passes through the box');
    }
  });

  it('nobody on the ground under it can reach the box', () => {
    const t = wired();
    const w = streetWorld(koulato);
    let tried = 0;
    for (let x = t.box.x - t.box.w / 2; x <= t.box.x + t.box.w / 2; x += 10) {
      // The highest floor line under the box at x (screen space).
      const wx = x + koulato.bounds.l;
      const under = koulato.platforms
        .filter((p) => p.pc_perm !== 1 && Math.min(p.x1, p.x2) <= wx && Math.max(p.x1, p.x2) >= wx)
        .map((p) => sy(koulato, p.y1 + ((p.y2 - p.y1) * (wx - p.x1)) / ((p.x2 - p.x1) || 1)))
        .filter((y) => y > t.box.y);
      if (!under.length) continue;
      const g = Math.min(...under);
      tried += 1;
      const up = jumpArc(w, { x, y: g }, { dir: 0, record: true });
      assert.ok(up.points.every((p) => !inTeleporter(t, p.x, p.y)), `jump from the ground at ${x}`);
    }
    assert.ok(tried > 10, 'the ground under the box was checked');
  });

  it('lands on Ruta Asuncion\'s ground floor at the arrival its posts already use, and walks to every exit', () => {
    const t = wired();
    const arrivals = ['GM416LNIKVLM1', 'GM4109NI2R640'].map((k) => street(k).signposts.flatMap((p) => p.connects).find((c) => /Ruta Asuncion/.test(c.label)).arrive);
    for (const a of arrivals) assert.deepEqual({ ...t.arrive }, a);
    const r = reachStreet(ruta, [{ x: t.arrive.x, y: t.arrive.y, from: t.id }]);
    assert.ok(r.arrivals[0].stands, 'stands where it lands');
    for (const target of r.targets) assert.ok(target.reached, `${target.label} reached on foot`);
    assert.deepEqual(collisionTeleportersOn(RUTA_ASUNCION_TSID), [], 'one way: nothing on record leads back');
  });
});
