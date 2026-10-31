/**
 * LEVEL BUILDER P1 (spec 6.6, section 14): the op vocabulary (js/builder/ops.js). Every op's
 * inverse gives back a byte-equal zone; a batch is all or nothing; and the site's port
 * (groddle-afternoon-site src/BuilderOps.php) turns the same script into the same bytes.
 * Also the fork (js/builder/zone.js): a forked shipped street fits the draft schema.
 * P3 adds population.set, hubmap.set, edit.add and edit.remove to the same scripts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEOMETRY, OP_NAMES, OpError, applyOp, applyOps, nextDecoId, nextGeometryId, opsSummary } from '../public/js/builder/ops.js?v=acf30407';
import { DEFAULT_GRADIENT, forkOps, forkStreet, newTsid, relayerPosition, streetKeyFrom } from '../public/js/builder/zone.js?v=6a3db28e';
import { compileSchema } from '../public/js/builder/schema-check.js?v=cc9d1af4';
import { DECO_TWINS } from '../public/js/street-render.js?v=3f8384af';
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

/** A random geometry item of a kind (no id), for <kind>.add. */
function geometryItem(kind, rnd, pick, i) {
  const r = (n) => Math.round(rnd() * n);
  if (kind === 'platform') return { x1: r(900), y1: -r(400), x2: 900 + r(400), y2: -r(400), pc_perm: pick([-1, 0, 1, null]), item_perm: pick([-1, null]) };
  if (kind === 'barrier') return { x: r(900), y: -r(400), h: 40 + r(200), pc_perm: pick([0, null]) };
  if (kind === 'ladder') return { x: r(900), y: -r(400), w: 50, h: 100 + r(400), ...(rnd() > 0.5 ? { tiling: { cap_0: { sprite: 'ladder_tile_center_00_basicWood', w: 60, h: 50 } } } : {}) };
  if (kind === 'emitter') return { kind: pick(['steam', 'lava', 'embers']), x: r(900), y: -r(200), ...(rnd() > 0.5 ? { layer: 'middleground' } : {}), rate: 1 + r(10), size: 10 + r(90), ...(rnd() > 0.5 ? { period: [3, 3 + r(6)], burst: 1 } : {}) };
  return { x: r(900), y: -r(200), w: 150, h: 200, connects: rnd() > 0.7 ? [] : [{ tsid: 'GZ0000000000002', label: `Arm ${i}`, hub_id: '56', arrive: { x: r(900), y: -r(200) } }] };
}

/** A seeded run of ops over a zone's street (the editor's vocabulary). */
function randomOps(zone, n, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const street = zone.streets[0].street;
  const layers = street.layers;
  const kinds = Object.keys(GEOMETRY);
  const ops = [];
  const keep = (op) => {
    // Apply as it goes so later ops name real things.
    ops.push(op);
    try { applyOp(structuredClone(zone), op); applyOp(zone, op); } catch { ops.pop(); }
  };
  for (let i = 0; i < n; i += 1) {
    if (i === 9 || i === Math.floor(n * 0.7)) {
      // P3: empty the zone's edits with prune (the list goes), add one back (fresh: its inverse
      // prunes), and drop and put back a population and the hub map.
      for (let k = (zone.edits || []).length - 1; k >= 0; k -= 1) keep({ op: 'edit.remove', at: k, prune: true });
      keep({ op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', signpost: 'signpost_1', connect: { tsid: 'GZ0000000000001', label: `Lane ${i}`, hub_id: '900', arrive: { x: 150, y: 940 } } } });
      keep({ op: 'population.set', street: 'lane', population: null });
      keep({ op: 'population.set', street: 'lane', population: { counts: { npc_piggy: 2 }, quoins: 3 } });
      keep({ op: 'hubmap.set', map: null });
      keep({ op: 'hubmap.set', map: { color: '#1d3a80', streets: [{ tsid: zone.streets[0].street.tsid, name: 'Lane', x1: 10, y1: 20, x2: 200, y2: 30 }] } });
      continue;
    }
    if (i === 7 || i === Math.floor(n * 0.4)) {
      // Zone ambient effects: an effect on a street without any (its inverse prunes), a period
      // set as a list then dropped, one with an id, the ladder's own set and remove, and the
      // street's rumble set and unset (spec 15 Q12).
      const fx = nextGeometryId(street, 'emitter');
      keep({ op: 'emitter.add', street: 'lane', emitter: { kind: 'steam', x: 10, y: -60, rate: 6 } });
      keep({ op: 'emitter.set', street: 'lane', id: fx, set: { period: [4, 8], burst: 2, layer: 'middleground' } });
      keep({ op: 'emitter.set', street: 'lane', id: fx, set: { rate: 3 }, unset: ['period', 'burst'] });
      keep({ op: 'emitter.add', street: 'lane', emitter: { id: 'fx_77', kind: 'lava', x: 40, y: -60, sprite: 'bush_3' }, at: 0 });
      const ladder = (street.ladders || [])[0];
      if (ladder) keep({ op: 'ladder.set', street: 'lane', id: ladder.id, set: { h: 140 } });
      const rung = nextGeometryId(street, 'ladder');
      keep({ op: 'ladder.add', street: 'lane', ladder: { x: 5, y: -60, w: 50, h: 100 } });
      keep({ op: 'ladder.remove', street: 'lane', id: rung });
      keep({ op: 'street.set', street: 'lane', set: { rumble: { every: [10, 20], duration: 1.5, strength: 6 } } });
      if (i === 7) keep({ op: 'street.set', street: 'lane', set: {}, unset: ['rumble'] });
      if (i !== 7) for (const e of [...(street.emitters || [])]) keep({ op: 'emitter.remove', street: 'lane', id: e.id, prune: true });
      continue;
    }
    if (i === 5 || i === Math.floor(n * 0.6)) {
      // A sure tour of the perm and prune paths: a barrier on a street without any, made hard,
      // softened (a null goes back), its perm unset, then removed with prune (the list empties).
      const id = nextGeometryId(street, 'barrier');
      keep({ op: 'barrier.add', street: 'lane', barrier: { x: 40, y: -90, h: 120, pc_perm: 0 } });
      keep({ op: 'barrier.set', street: 'lane', id, set: { pc_perm: null } });
      keep({ op: 'barrier.set', street: 'lane', id, set: { pc_perm: 1 } });
      keep({ op: 'barrier.set', street: 'lane', id, set: { h: 80 }, unset: ['pc_perm'] });
      for (const b of [...(street.barriers || [])]) keep({ op: 'barrier.remove', street: 'lane', id: b.id, prune: true });
      continue;
    }
    const layer = pick(layers.filter((l) => l.decos.length));
    const deco = pick(layer.decos);
    const kind = pick(['set', 'set', 'unset', 'add', 'remove', 'move', 'layer', 'street', 'zone', 'asset', 'editor',
      'geo.add', 'geo.add', 'geo.set', 'geo.perm', 'geo.remove', 'geo.remove', 'connect.add', 'connect.set', 'connect.remove',
      'pop', 'hubmap', 'hub', 'edit.add', 'edit.add', 'edit.remove']);
    // Geometry: a kind, one of its items (if any) and a signpost arm.
    const g = pick(kinds);
    const item = pick(street[GEOMETRY[g].list]?.length ? street[GEOMETRY[g].list] : [{ id: `${GEOMETRY[g].prefix}none` }]);
    const post = pick((street.signposts || []).filter((p) => Array.isArray(p.connects)).concat([{ id: 'signpost_none', connects: [] }]));
    const arm = Math.floor(rnd() * Math.max(1, post.connects.length));
    if (kind === 'set') ops.push({ op: 'deco.set', street: 'lane', id: deco.id, set: { x: Math.round(rnd() * 900), flip: rnd() > 0.5, r: Math.round(rnd() * 40 - 20) } });
    else if (kind === 'unset') ops.push({ op: 'deco.set', street: 'lane', id: deco.id, set: { hidden: true }, unset: ['flip'] });
    else if (kind === 'add') ops.push({ op: 'deco.add', street: 'lane', layer: layer.id, deco: { id: nextDecoId(street, new Set([`d_${9000 + i}`])), sprite: 'bush_3', x: 10, y: -20, w: 160, h: 90, z: 3, r: 0 }, at: 1 });
    else if (kind === 'remove') ops.push({ op: 'deco.remove', street: 'lane', id: deco.id });
    else if (kind === 'move') ops.push({ op: 'deco.move', street: 'lane', id: deco.id, layer: pick(layers).id, at: 0, set: { x: 5, y: -5 } });
    else if (kind === 'layer') ops.push({ op: 'layer.set', street: 'lane', layer: layer.id, set: { hidden: rnd() > 0.5, filters: { blur: 2, saturation: -20 } } });
    else if (kind === 'street') ops.push({ op: 'street.set', street: 'lane', set: { label: `Lane ${i}`, gradient: { top: '102030', bottom: 'FFEEDD' } }, unset: ['musicFile'] });
    else if (kind === 'zone') ops.push({ op: 'zone.set', set: { notes: `n${i}` } });
    else if (kind === 'asset') ops.push({ op: 'asset.set', name: 'bush_3', asset: rnd() > 0.5 ? null : { origin: 'tinyspeck-cc0', licence: 'CC0-1.0', source: 'groddle1.swf#bush_3' } });
    else if (kind === 'editor') ops.push({ op: 'editor.set', street: 'lane', editor: { camera: { x: i, y: 2, zoom: 1 }, lockedLayers: ['sky'] } });
    else if (kind === 'geo.add') {
      // Without an id (the next free one), or with one, first or last; sometimes at a place.
      const fresh = geometryItem(g, rnd, pick, i);
      const id = `${GEOMETRY[g].prefix}${9000 + i}`;
      const thing = pick([fresh, { id, ...fresh }, { ...fresh, id }]);
      ops.push({ op: `${g}.add`, street: 'lane', [g]: thing, ...(rnd() > 0.5 ? { at: Math.floor(rnd() * 3) } : {}) });
    } else if (kind === 'geo.set') {
      const f = GEOMETRY[g].fields.filter((k) => k !== 'pc_perm' && k !== 'item_perm' && k !== 'tiling');
      const set = { [pick(f)]: Math.round(rnd() * 500), [pick(f)]: -Math.round(rnd() * 500) };
      ops.push({ op: `${g}.set`, street: 'lane', id: item.id, set, ...(g === 'ladder' && rnd() > 0.5 ? { unset: ['tiling'] } : {}) });
    } else if (kind === 'geo.perm') {
      // pc_perm and item_perm: null (hard), a number, or gone.
      // Mostly a hard one (so a null goes back in an inverse), else the first or last few.
      const p = pick(['platform', 'barrier']);
      const all = street[GEOMETRY[p].list] || [];
      const hard = all.filter((x) => x.pc_perm === null);
      const it = pick(hard.length && rnd() > 0.4 ? hard : [...all.slice(0, 3), ...all.slice(-3), { id: `${GEOMETRY[p].prefix}none` }]);
      const how = pick(['null', 'null', 'unset', 'number', 'item']);
      if (how === 'null') ops.push({ op: `${p}.set`, street: 'lane', id: it.id, set: { pc_perm: null } });
      else if (how === 'unset') ops.push({ op: `${p}.set`, street: 'lane', id: it.id, set: {}, unset: ['pc_perm'] });
      else if (how === 'number') ops.push({ op: `${p}.set`, street: 'lane', id: it.id, set: { pc_perm: pick([-1, 0, 1]) } });
      else ops.push({ op: 'platform.set', street: 'lane', id: (street.platforms[0] || {}).id, set: { item_perm: null, y1: -7 }, unset: ['pc_perm'] });
    } else if (kind === 'geo.remove') {
      // Half the time a barrier: the fork has none, so removes there empty the list.
      const r = (street.barriers || []).length && rnd() > 0.5 ? pick(street.barriers) : item;
      ops.push({ op: `${r === item ? g : 'barrier'}.remove`, street: 'lane', id: r.id, ...(rnd() > 0.4 ? { prune: true } : {}) });
    }
    else if (kind === 'connect.add') {
      const connect = { tsid: 'GZ0000000000003', label: `Way ${i}`, ...(rnd() > 0.5 ? { hub_id: '56' } : {}), ...(rnd() > 0.7 ? { hidden: true } : {}), ...(rnd() > 0.5 ? { arrive: { x: 1, y: -2 } } : {}) };
      ops.push({ op: 'connect.add', street: 'lane', signpost: post.id, connect, ...(rnd() > 0.5 ? { at: 0 } : {}) });
    } else if (kind === 'connect.set') {
      ops.push({ op: 'connect.set', street: 'lane', signpost: post.id, at: arm, set: { label: `Sign ${i}`, hidden: rnd() > 0.5 }, ...(rnd() > 0.5 ? { unset: [pick(['hub_id', 'arrive'])] } : {}) });
    } else if (kind === 'pop') {
      const counts = Object.fromEntries([['npc_piggy', Math.floor(rnd() * 4)], [pick(['trant_fruit', 'rock_beryl_1', 'npc_chicken']), 1 + Math.floor(rnd() * 3)]].filter(([, v]) => v > 0));
      ops.push({ op: 'population.set', street: 'lane', population: rnd() > 0.85 ? null : { counts, ...(rnd() > 0.5 ? { quoins: Math.floor(rnd() * 9) } : {}), ...(rnd() > 0.8 ? { interior: false } : {}) } });
    } else if (kind === 'hubmap') {
      const line = () => ({ tsid: pick(['GZ0000000000001', 'GZ0000000000002']), name: `Line ${i}`, x1: Math.round(rnd() * 760), y1: Math.round(rnd() * 460), x2: Math.round(rnd() * 760), y2: Math.round(rnd() * 460) });
      ops.push({ op: 'hubmap.set', map: rnd() > 0.9 ? null : { ...(rnd() > 0.5 ? { color: '#2a5d34', top_color: '#88aa66' } : {}), streets: [line(), ...(rnd() > 0.5 ? [line()] : [])], ...(rnd() > 0.6 ? { hubs: [{ tsid: 'LLIE7307LTG11T2', hub_id: '56', hubName: 'Groddle Forest', label: 'To: Groddle Forest', x: 700, y: Math.round(rnd() * 400), arrow: 90 }] } : {}) } });
    } else if (kind === 'hub') {
      ops.push({ op: 'hub.set', hub: { id: String(900 + Math.floor(rnd() * 3)), name: `Hub ${i}`, isNew: true, ...(rnd() > 0.5 ? { map: { streets: [] } } : {}) } });
    } else if (kind === 'edit.add') {
      const edit = rnd() > 0.3
        ? { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', signpost: pick(['signpost_1', 'signpost_2']), connect: { tsid: 'GZ0000000000001', label: `In ${i}`, ...(rnd() > 0.5 ? { hub_id: '900' } : {}), ...(rnd() > 0.4 ? { arrive: { x: Math.round(rnd() * 900), y: 940 } } : {}) } }
        : { tsid: 'GA5101HF7F429V5', op: 'add-signpost', newSignpost: { id: `signpost_${i}`, x: 10, y: -60, w: 100, h: 200, connects: [{ tsid: 'GZ0000000000001', label: 'Lane' }] } };
      ops.push({ op: 'edit.add', edit, ...(rnd() > 0.5 ? { at: Math.floor(rnd() * 3) } : {}) });
    } else if (kind === 'edit.remove') {
      ops.push({ op: 'edit.remove', at: Math.floor(rnd() * Math.max(1, (zone.edits || []).length + 1)), ...(rnd() > 0.5 ? { prune: true } : {}) });
    } else ops.push({ op: 'connect.remove', street: 'lane', signpost: post.id, at: arm });
    keep(ops.pop());
  }
  return ops;
}

/** What a script exercises of the P2 ops, replayed on a copy of the zone. */
function p2Coverage(zone, script) {
  const z = structuredClone(zone);
  const seen = new Set();
  for (const op of script) {
    const [kind, verb] = op.op.split('.');
    const list = GEOMETRY[kind] ? z.streets[0].street[GEOMETRY[kind].list] : null;
    const { inverse } = applyOp(z, op);
    seen.add(op.op);
    if (verb === 'add' && GEOMETRY[kind]) seen.add(op[kind].id === undefined ? 'add without an id' : 'add with an id');
    if (inverse.prune) seen.add('add on a street without the list');
    if (verb === 'remove' && op.prune && inverse.order && GEOMETRY[kind]) seen.add(`prune empties ${GEOMETRY[kind].list}`);
    if (verb === 'remove' && op.prune && !inverse.order && list) seen.add('prune on a list that stays');
    if (verb === 'set' && op.set && op.set.pc_perm === null) seen.add('pc_perm set to null');
    if (verb === 'set' && (op.unset || []).includes('pc_perm')) seen.add('pc_perm unset');
    if (verb === 'set' && inverse.set && inverse.set.pc_perm === null) seen.add('pc_perm null put back');
  }
  return seen;
}

const P2_MUST = [
  ...OP_NAMES.filter((n) => GEOMETRY[n.split('.')[0]] || n.startsWith('connect.')),
  'add without an id', 'add with an id', 'add on a street without the list', 'prune empties barriers', 'prune on a list that stays',
  'pc_perm set to null', 'pc_perm unset', 'pc_perm null put back',
];
const assertP2 = (zone, script) => {
  const seen = p2Coverage(zone, script);
  assert.deepEqual(P2_MUST.filter((k) => !seen.has(k)), [], 'the script exercises every P2 op');
};

/** What a script exercises of the P3 ops (the removes that empty, the adds that make the list). */
function p3Coverage(zone, script) {
  const z = structuredClone(zone);
  const seen = new Set();
  for (const op of script) {
    const { inverse } = applyOp(z, op);
    seen.add(op.op);
    if (op.op === 'edit.add' && inverse.prune) seen.add('edit.add makes the list');
    if (op.op === 'edit.remove' && inverse.order) seen.add('edit.remove empties the list');
    if (op.op === 'population.set' && op.population === null && inverse.order) seen.add('population removed');
    if (op.op === 'hubmap.set' && op.map === null && inverse.order) seen.add('hub map removed');
    if (op.op === 'edit.add' && op.edit.op === 'add-signpost') seen.add('add-signpost');
  }
  return seen;
}
const P3_MUST = ['population.set', 'hubmap.set', 'hub.set', 'edit.add', 'edit.remove', 'edit.add makes the list', 'edit.remove empties the list', 'population removed', 'hub map removed', 'add-signpost'];
const assertP3 = (zone, script) => {
  const seen = p3Coverage(zone, script);
  assert.deepEqual(P3_MUST.filter((k) => !seen.has(k)), [], 'the script exercises every P3 op');
};

describe('ops (js/builder/ops.js)', () => {
  it('every op then its inverse gives a byte-equal zone (300 seeded ops on a fork of Hechey Track)', () => {
    const zone = forkedZone();
    const script = randomOps(structuredClone(zone), 300);
    assert.ok(script.length > 250, `ops ${script.length}`);
    assertP2(zone, script);
    assertP3(zone, script);
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
    const script = randomOps(structuredClone(zone), 220, 31);
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
    // P2: geometry and signpost arms.
    const ladder = zone.streets[0].street.ladders[0].id;
    const post = zone.streets[0].street.signposts[0].id;
    assert.equal(code({ op: 'platform.set', street: 'lane', id: 'plat_nope', set: { x1: 1 } }), 'builder_no_platform');
    assert.equal(code({ op: 'barrier.remove', street: 'lane', id: 'wall_1', prune: true }), 'builder_no_barrier');
    assert.equal(code({ op: 'signpost.remove', street: 'lane', id: 'nope' }), 'builder_no_signpost');
    assert.equal(code({ op: 'ladder.set', street: 'lane', id: ladder, set: { tiling: null } }), 'builder_bad_op');
    assert.equal(code({ op: 'ladder.set', street: 'lane', id: ladder, set: { pc_perm: 1 } }), 'builder_bad_op');
    assert.equal(code({ op: 'ladder.set', street: 'lane', id: ladder, unset: ['id'] }), 'builder_bad_op');
    assert.equal(code({ op: 'platform.add', street: 'lane', platform: { id: '', x1: 0 } }), 'builder_bad_op');
    assert.equal(code({ op: 'platform.add', street: 'lane', platform: { id: 7, x1: 0 } }), 'builder_bad_op');
    assert.equal(code({ op: 'platform.add', street: 'lane', platform: { x1: 0, connects: [] } }), 'builder_bad_op');
    assert.equal(code({ op: 'platform.add', street: 'lane' }), 'builder_bad_op');
    assert.equal(code({ op: 'signpost.add', street: 'lane', signpost: { id: post, x: 0, y: 0 } }), 'builder_exists');
    assert.equal(code({ op: 'signpost.add', street: 'lane', signpost: { x: 0, connects: {} } }), 'builder_bad_op');
    assert.equal(code({ op: 'signpost.add', street: 'lane', signpost: { x: 0, connects: [{ tsid: 'GZ0000000000002' }] } }), 'builder_bad_op');
    assert.equal(code({ op: 'connect.add', street: 'lane', signpost: 'nope', connect: { tsid: 'x', label: 'y' } }), 'builder_no_signpost');
    assert.equal(code({ op: 'connect.add', street: 'lane', signpost: post, connect: { tsid: 'x', label: 'y', events: 1 } }), 'builder_bad_op');
    assert.equal(code({ op: 'connect.remove', street: 'lane', signpost: post, at: 99 }), 'builder_no_connect');
    assert.equal(code({ op: 'connect.set', street: 'lane', signpost: post, at: '0', set: { label: 'x' } }), 'builder_no_connect');
    assert.equal(code({ op: 'connect.set', street: 'lane', signpost: post, at: 0, set: { hub_id: null } }), 'builder_bad_op');
    assert.equal(code({ op: 'platform.frob', street: 'lane' }), 'builder_bad_op');
    assert.equal(code({ op: 'platform.add', street: 'nope', platform: {} }), 'builder_no_street');
    assert.equal(code({ op: 'platform.set', street: 'lane', id: zone.streets[0].street.platforms[0].id, set: { pc_perm: null, item_perm: null } }), 'ok');
    // P3: populations, the hub map and zone edits.
    assert.equal(code({ op: 'population.set', street: 'lane', population: { quoins: 1 } }), 'builder_bad_op');
    assert.equal(code({ op: 'population.set', street: 'lane', population: [] }), 'builder_bad_op');
    assert.equal(code({ op: 'hubmap.set', map: { hubs: [] } }), 'builder_bad_op');
    assert.equal(code({ op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', connect: { tsid: 'GZ0000000000001', label: 'x' } } }), 'builder_bad_op');
    assert.equal(code({ op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', signpost: 'signpost_1', connect: { tsid: 'GZ0000000000001', label: 'x', at: 1 } } }), 'builder_bad_op');
    assert.equal(code({ op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'remove-connect', signpost: 'signpost_1' } }), 'builder_bad_op');
    assert.equal(code({ op: 'edit.remove', at: 0 }), 'builder_no_edit');
    assert.equal(code({ op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', signpost: 'signpost_1', connect: { tsid: 'GZ0000000000001', label: 'x' } } }), 'ok');
    assert.equal(code({ op: 'hub.set', hub: null }), 'ok');
    assert.equal(code({ op: 'hubmap.set', map: { streets: [] } }), 'builder_no_hub');
  });

  it('names the next deco id and sums a batch in words', () => {
    assert.equal(nextDecoId({ layers: [{ decos: [{ id: 'd_4' }, { id: 'x' }] }, { decos: [{ id: 'd_12' }] }] }), 'd_13');
    assert.equal(nextDecoId({ layers: [] }, new Set(['d_2'])), 'd_3');
    assert.equal(nextGeometryId({ platforms: [{ id: '_pl1285104321235' }, { id: 'plat_4' }, { id: 'plat_x9' }] }, 'platform'), 'plat_5');
    assert.equal(nextGeometryId({}, 'barrier'), 'wall_1');
    assert.equal(nextGeometryId({ ladders: [{ id: 'ladder_1284683116151' }] }, 'ladder'), 'ladder_1284683116152');
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
    const script = randomOps(structuredClone(zone), 220, 31);
    assertP2(zone, script);
    assertP3(zone, script);
    const post = zone.streets[0].street.signposts[0].id;
    const ladder = zone.streets[0].street.ladders[0].id;
    script.push(
      { op: 'deco.set', street: 'lane', id: 'd_999999', set: { x: 1 } },
      // P2 failures, so the error codes match too.
      { op: 'platform.set', street: 'lane', id: 'plat_nope', set: { x1: 1 } },
      { op: 'barrier.remove', street: 'lane', id: 'wall_nope', prune: true },
      { op: 'ladder.set', street: 'lane', id: 'ladder_nope', set: { x: 1 } },
      { op: 'signpost.set', street: 'lane', id: 'signpost_nope', set: { x: 1 } },
      { op: 'ladder.set', street: 'lane', id: ladder, set: { tiling: null } },
      { op: 'ladder.set', street: 'lane', id: ladder, set: { pc_perm: 1 } },
      { op: 'platform.add', street: 'lane', platform: { id: null, x1: 0 } },
      { op: 'platform.add', street: 'lane', platform: { x1: 0, events: [] } },
      { op: 'signpost.add', street: 'lane', signpost: { x: 0, connects: [{ tsid: 'GZ0000000000002', label: 'x', events: 1 }] } },
      { op: 'connect.add', street: 'lane', signpost: 'signpost_nope', connect: { tsid: 'x', label: 'y' } },
      { op: 'connect.add', street: 'lane', signpost: post, connect: { tsid: 'x' } },
      { op: 'connect.remove', street: 'lane', signpost: post, at: -1 },
      { op: 'connect.set', street: 'lane', signpost: post, at: 99, set: { label: 'x' } },
      { op: 'platform.frob', street: 'lane' },
      // P3 failures.
      { op: 'population.set', street: 'lane', population: { quoins: 2 } },
      { op: 'population.set', street: 'nope', population: null },
      { op: 'hubmap.set', map: { streets: {} } },
      { op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-door' } },
      { op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', signpost: 'signpost_1', connect: { tsid: 'GZ0000000000001' } } },
      { op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', signpost: '', connect: { tsid: 'GZ0000000000001', label: 'x' } } },
      { op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-connect', signpost: 'signpost_1', connect: { tsid: 'GZ0000000000001', label: 'x', events: 1 } } },
      { op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-signpost' } },
      { op: 'edit.add', edit: { tsid: 'GLI2V0UN7RD1T2J', op: 'add-signpost', newSignpost: {}, extra: 1 } },
      { op: 'edit.remove', at: 99 },
      { op: 'edit.remove', at: '0' },
      // And some that land: an edit placed first, the population and map reordered.
      { op: 'edit.add', edit: { op: 'add-connect', tsid: 'GLI2V0UN7RD1T2J', connect: { label: 'Back in', tsid: 'GZ0000000000001' }, signpost: 'signpost_3' }, at: -4 },
      { op: 'population.set', street: 'lane', population: { quoins: 1, counts: {} }, order: ['population', 'key'] },
      { op: 'hubmap.set', map: { streets: [], hubs: [] }, order: ['map', 'id'] },
      { op: 'hubmap.set', map: null },
      { op: 'hub.set', hub: null },
      { op: 'hubmap.set', map: { streets: [] } },
      // And some that land: clamped places, an id last, a reorder, a signpost without arms gaining one.
      { op: 'barrier.add', street: 'lane', barrier: { x: 1, y: -2, h: 3, pc_perm: null, id: 'wall_77' }, at: 99 },
      { op: 'barrier.add', street: 'lane', barrier: { x: 4, y: -5, h: 6 }, at: -3 },
      { op: 'barrier.set', street: 'lane', id: 'wall_77', set: { pc_perm: 1 }, unset: ['h'], order: ['pc_perm', 'id'] },
      { op: 'signpost.add', street: 'lane', signpost: { x: 9, y: -9, w: 150, h: 200 } },
      { op: 'connect.add', street: 'lane', signpost: post, connect: { label: 'Back', tsid: 'GZ0000000000004', hidden: false }, at: 1 },
      { op: 'hub.set', hub: null },
      { op: 'street.remove', street: 'lane' },
    );
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
