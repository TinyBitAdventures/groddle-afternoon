/**
 * LEVEL BUILDER P1 (spec 6.6, section 14): the op vocabulary (js/builder/ops.js). Every op's
 * inverse gives back a byte-equal zone; a batch is all or nothing; and the site's port
 * (groddle-afternoon-site src/BuilderOps.php) turns the same script into the same bytes.
 * Also the fork (js/builder/zone.js): a forked shipped street fits the draft schema.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpError, applyOp, applyOps, nextDecoId, opsSummary } from '../public/js/builder/ops.js?v=044258c8';
import { DEFAULT_GRADIENT, forkOps, forkStreet, newTsid, relayerPosition, streetKeyFrom } from '../public/js/builder/zone.js?v=9608addf';
import { compileSchema } from '../public/js/builder/schema-check.js?v=cc9d1af4';
import { DECO_TWINS } from '../public/js/street-render.js?v=3bcef6a7';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const json = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const schema = json('docs/level-builder/zone.schema.json');
const catalog = new Map(json('public/assets/content/deco-catalog.json').decos.map((d) => [d.name, d]));
const ecology = json('public/assets/content/street-ecology.json').streets;
const bytes = (z) => JSON.stringify(z);
const hasPhp = spawnSync('php', ['-v']).status === 0;

/** A zone holding a fork of one shipped street. */
function forkedZone(tsid = 'GLI2V0UN7RD1T2J', key = 'lane') {
  const zone = { format: 'groddle-zone/1', id: 'zz-test', title: 'Test', rev: 1, streets: [], edits: [], assets: {} };
  const fork = forkStreet(json(`public/assets/streets/${tsid}.json`), {
    zoneId: zone.id, key, label: 'Copy of a street', tsid: 'GZ0000000000001', catalog, twins: DECO_TWINS, ecologyRow: ecology[tsid],
  });
  applyOps(zone, forkOps(zone, fork));
  return zone;
}

/** A seeded run of ops over a zone's street (the editor's vocabulary). */
function randomOps(zone, n, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const street = zone.streets[0].street;
  const layers = street.layers;
  const ops = [];
  for (let i = 0; i < n; i += 1) {
    const layer = pick(layers.filter((l) => l.decos.length));
    const deco = pick(layer.decos);
    const kind = pick(['set', 'set', 'unset', 'add', 'remove', 'move', 'layer', 'street', 'zone', 'asset', 'editor']);
    if (kind === 'set') ops.push({ op: 'deco.set', street: 'lane', id: deco.id, set: { x: Math.round(rnd() * 900), flip: rnd() > 0.5, r: Math.round(rnd() * 40 - 20) } });
    else if (kind === 'unset') ops.push({ op: 'deco.set', street: 'lane', id: deco.id, set: { hidden: true }, unset: ['flip'] });
    else if (kind === 'add') ops.push({ op: 'deco.add', street: 'lane', layer: layer.id, deco: { id: nextDecoId(street, new Set([`d_${9000 + i}`])), sprite: 'bush_3', x: 10, y: -20, w: 160, h: 90, z: 3, r: 0 }, at: 1 });
    else if (kind === 'remove') ops.push({ op: 'deco.remove', street: 'lane', id: deco.id });
    else if (kind === 'move') ops.push({ op: 'deco.move', street: 'lane', id: deco.id, layer: pick(layers).id, at: 0, set: { x: 5, y: -5 } });
    else if (kind === 'layer') ops.push({ op: 'layer.set', street: 'lane', layer: layer.id, set: { hidden: rnd() > 0.5, filters: { blur: 2, saturation: -20 } } });
    else if (kind === 'street') ops.push({ op: 'street.set', street: 'lane', set: { label: `Lane ${i}`, gradient: { top: '102030', bottom: 'FFEEDD' } }, unset: ['musicFile'] });
    else if (kind === 'zone') ops.push({ op: 'zone.set', set: { notes: `n${i}` } });
    else if (kind === 'asset') ops.push({ op: 'asset.set', name: 'bush_3', asset: rnd() > 0.5 ? null : { origin: 'tinyspeck-cc0', licence: 'CC0-1.0', source: 'groddle1.swf#bush_3' } });
    else ops.push({ op: 'editor.set', street: 'lane', editor: { camera: { x: i, y: 2, zoom: 1 }, lockedLayers: ['sky'] } });
    // Apply as it goes so later ops name real things.
    try { applyOp(structuredClone(zone), ops.at(-1)); applyOp(zone, ops.at(-1)); } catch { ops.pop(); }
  }
  return ops;
}

describe('ops (js/builder/ops.js)', () => {
  it('every op then its inverse gives a byte-equal zone (300 seeded ops on a fork of Hechey Track)', () => {
    const zone = forkedZone();
    const script = randomOps(structuredClone(zone), 300);
    assert.ok(script.length > 250, `ops ${script.length}`);
    for (const op of script) {
      const before = bytes(zone);
      const { inverse } = applyOp(zone, op);
      const after = bytes(zone);
      applyOp(zone, inverse);
      assert.equal(bytes(zone), before, `${op.op} then its inverse`);
      applyOp(zone, op);
      assert.equal(bytes(zone), after, `${op.op} again (redo)`);
    }
  });

  it('a batch undoes in one step, and a failing batch leaves nothing behind', () => {
    const zone = forkedZone();
    const start = bytes(zone);
    const script = randomOps(structuredClone(zone), 40, 11);
    const { inverses, changed } = applyOps(zone, script);
    assert.ok(changed.length > 0);
    applyOps(zone, inverses);
    assert.equal(bytes(zone), start);
    const bad = [...script.slice(0, 5), { op: 'deco.set', street: 'lane', id: 'd_999999', set: { x: 1 } }];
    assert.throws(() => applyOps(zone, bad), (e) => e instanceof OpError && e.code === 'builder_no_deco' && e.index === 5);
    assert.equal(bytes(zone), start, 'all or nothing');
  });

  it('refuses what an op may not touch', () => {
    const zone = forkedZone();
    const id = zone.streets[0].street.layers.find((l) => l.decos.length).decos[0].id;
    const code = (op) => { try { applyOp(zone, op); return 'ok'; } catch (e) { return e.code; } };
    assert.equal(code({ op: 'deco.set', street: 'lane', id, set: { tsid: 'x' } }), 'builder_bad_op');
    assert.equal(code({ op: 'deco.set', street: 'lane', id, set: { x: null } }), 'builder_bad_op');
    assert.equal(code({ op: 'street.set', street: 'lane', set: { platforms: [] } }), 'builder_bad_op');
    assert.equal(code({ op: 'deco.add', street: 'lane', layer: 'middleground', deco: { id, sprite: 'x', x: 0, y: 0 } }), 'builder_exists');
    assert.equal(code({ op: 'deco.add', street: 'lane', layer: 'middleground', deco: { id: 'd_0', sprite: 'x', x: 0, y: 0, events: 1 } }), 'builder_bad_op');
    assert.equal(code({ op: 'layer.set', street: 'lane', layer: 'nope', set: { z: 1 } }), 'builder_no_layer');
    assert.equal(code({ op: 'street.add', street: 'lane', draftStreet: zone.streets[0] }), 'builder_exists');
    assert.equal(code({ op: 'nope' }), 'builder_bad_op');
  });

  it('names the next deco id and sums a batch in words', () => {
    assert.equal(nextDecoId({ layers: [{ decos: [{ id: 'd_4' }, { id: 'x' }] }, { decos: [{ id: 'd_12' }] }] }), 'd_13');
    assert.equal(nextDecoId({ layers: [] }, new Set(['d_2'])), 'd_3');
    assert.equal(opsSummary([{ op: 'deco.set' }, { op: 'deco.set' }, { op: 'deco.add' }]), '2 deco.set, 1 deco.add');
  });
});

describe('fork (js/builder/zone.js)', () => {
  const check = compileSchema(schema);
  for (const [tsid, why] of [['GLI2V0UN7RD1T2J', 'Hechey Track'], ['GA5101HF7F429V5', 'a Baqala street'], ['GIFR1RLV0G43647', 'a heavy street']]) {
    it(`a fork of ${why} fits the draft schema, with ids, provenance and a population`, () => {
      const zone = forkedZone(tsid);
      const errors = check(zone);
      assert.deepEqual(errors, [], JSON.stringify(errors.slice(0, 3)));
      const street = zone.streets[0].street;
      const decos = street.layers.flatMap((l) => l.decos);
      assert.ok(decos.every((d, i) => d.id === `d_${i + 1}`));
      assert.equal(street.stats.decoCount, decos.length);
      assert.ok(street.source.startsWith('groddle-builder zz-test'));
      assert.equal(zone.hub.id, street.hubId);
      const library = decos.filter((d) => catalog.has(d.sprite));
      assert.ok(library.every((d) => zone.assets[d.sprite]?.licence === 'CC0-1.0'));
    });
  }

  it('never changes the shipped street, and gives a sky to a street without one', () => {
    const before = readFileSync(join(root, 'public/assets/streets/GLI2V0UN7RD1T2J.json'), 'utf8');
    const shipped = JSON.parse(before);
    delete shipped.gradient;
    const fork = forkStreet(shipped, { zoneId: 'z', key: 'k', label: 'L', tsid: 'GZ0000000000009', catalog });
    assert.deepEqual(fork.draftStreet.street.gradient, DEFAULT_GRADIENT);
    assert.equal(shipped.layers[0].decos[0].id, JSON.parse(before).layers[0].decos[0].id, 'the input object is untouched');
  });

  it('makes GZ tsids and street keys', () => {
    assert.match(newTsid(), /^GZ[0-9A-Z]{13}$/);
    assert.equal(newTsid(() => new Uint8Array(13)), 'GZ0000000000000');
    assert.equal(streetKeyFrom('Copy of Hechey Track'), 'copy-of-hechey-track');
    assert.equal(streetKeyFrom('Lane', ['lane']), 'lane-2');
    assert.equal(streetKeyFrom('42'), 'street');
  });

  it('re-layering keeps a deco where it appears (layer-local and world space)', () => {
    const street = { bounds: { l: -1000, r: 1000, t: -1000, b: 0 } };
    const mg = { id: 'middleground' };
    const sky = { id: 'sky', w: 1500, h: 1000 };
    const offsets = { sky: { x: 120, y: -30 }, middleground: { x: 0, y: 0 } };
    const deco = { x: 100, y: -60 };
    const p = relayerPosition(street, mg, sky, deco, offsets);
    assert.deepEqual(p, { x: 1100 - 120, y: 940 + 30 });
    assert.deepEqual(relayerPosition(street, sky, mg, p, offsets), { x: 100, y: -60 });
  });
});

describe('the site applies the same ops (groddle-afternoon-site src/BuilderOps.php)', { skip: skipWithoutSite || (!hasPhp && 'no php') }, () => {
  const php = (zone, ops) => {
    const code = `require ${JSON.stringify(SITE_DIR)} . '/src/BuilderOpError.php'; require ${JSON.stringify(SITE_DIR)} . '/src/BuilderOps.php';
      $in = json_decode(stream_get_contents(STDIN), false);
      $out = [];
      foreach ($in->ops as $op) { try { $r = Groddle\\Minn\\BuilderOps::apply($in->zone, $op); $out[] = $r['inverse']; } catch (Groddle\\Minn\\BuilderOpError $e) { $out[] = ['error' => $e->errorCode]; } }
      echo Groddle\\Minn\\BuilderOps::encode(['zone' => $in->zone, 'inverses' => $out]);`;
    return execFileSync('php', ['-d', 'memory_limit=512M', '-r', code], { input: JSON.stringify({ zone, ops }), maxBuffer: 1 << 28 }).toString();
  };

  it('the same script gives the same zone and the same inverses, byte for byte', () => {
    const zone = forkedZone();
    const script = randomOps(structuredClone(zone), 200, 23);
    script.push({ op: 'deco.set', street: 'lane', id: 'd_999999', set: { x: 1 } }, { op: 'hub.set', hub: null }, { op: 'street.remove', street: 'lane' });
    const fromPhp = php(structuredClone(zone), script);
    const inverses = [];
    for (const op of script) {
      try { inverses.push(applyOp(zone, op).inverse); } catch (e) { inverses.push({ error: e.code }); }
    }
    assert.equal(fromPhp, JSON.stringify({ zone, inverses }));
  });

  it('checks the shape and limits before anything is kept', () => {
    const code = (zone, id) => JSON.parse(execFileSync('php', ['-r', `require ${JSON.stringify(SITE_DIR)} . '/src/BuilderOpError.php'; require ${JSON.stringify(SITE_DIR)} . '/src/BuilderOps.php'; echo json_encode(Groddle\\Minn\\BuilderOps::check(json_decode(stream_get_contents(STDIN), false), ${JSON.stringify(id)}));`], { input: JSON.stringify(zone) }).toString());
    const zone = json('tests/fixtures/builder/mossy-hollow.zone.json');
    assert.deepEqual(code(zone, 'mossy-hollow'), []);
    assert.deepEqual(code(forkedZone(), 'zz-test'), []);
    assert.match(JSON.stringify(code(zone, 'other')), /The zone's id is the draft's/);
    const bad = structuredClone(zone);
    bad.streets[0].street.tsid = 'GLI2V0UN7RD1T2J';
    bad.streets[1].street.events = {};
    bad.streets[1].street.layers.push({ id: 'middleground', z: 0, decos: [] });
    const words = JSON.stringify(code(bad, 'mossy-hollow'));
    assert.match(words, /GZ and 13/);
    assert.match(words, /no events/);
    assert.match(words, /exactly one middleground/);
  });
});
