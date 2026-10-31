/**
 * LEVEL BUILDER P4 (spec 8.2): the agent's CLI on file: zones. Every command that writes turns into
 * the same ops the editor sends (public/js/builder/ops.js); validate exits 1 on an error or a fatal
 * finding; a draft on the site is written with If-Match, signed, and rebuilt after a 409. The
 * catalog search, style profiles and guide come from the files the validator uses.
 */
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parseArgs, setOps, rmOps, populateOps, hubMapOps, linkWorldOps, prepareOps, connectOps, highestFloorAt, permOf, CliError } from '../tools/builder/cli.mjs';
import { signKey, canonicalQuery } from '../tools/builder/sign.mjs';
import { GAME_DIR } from '../tools/repos.mjs';

const dir = mkdtempSync(join(tmpdir(), 'builder-cli-'));
const env = { GRODDLE_BUILDER_HOME: join(dir, 'home'), GRODDLE_BUILDER_URL: 'https://example.invalid', GRODDLE_BUILDER_KEY: `${'a'.repeat(16)}.${'b'.repeat(64)}` };
const cli = (...argv) => run(argv, { env });
const file = join(dir, 'zone.json');
const zone = () => JSON.parse(readFileSync(file, 'utf8'));
const shipped = (tsid) => JSON.parse(readFileSync(join(GAME_DIR, 'public/assets/streets', `${tsid}.json`), 'utf8'));
const HECHEY = 'GLI2V0UN7RD1T2J';

describe('arguments', () => {
  it('file:<path> anywhere, --draft file:, -m, negative numbers as values', () => {
    assert.deepEqual(parseArgs(['place', '--x', '300', '--y', '-60', 'file:z.json', '--json']), { positionals: ['place'], flags: { x: '300', y: '-60', file: 'z.json', json: true } });
    assert.equal(parseArgs(['validate', '--draft', 'file:a.json']).flags.file, 'a.json');
    assert.equal(parseArgs(['push', 'f.json', '-m', 'a note']).flags.m, 'a note');
    assert.equal(parseArgs(['render', '--overlay=geometry,grid']).flags.overlay, 'geometry,grid');
  });
  it('perm words', () => {
    assert.deepEqual(['floor', 'roof', 'soft', 'hard'].map((w) => permOf(w)), [-1, 1, 0, null]);
    assert.throws(() => permOf('jelly'), CliError);
  });
});

describe('a zone file, built with the CLI', () => {
  before(async () => {
    await cli('new', 'cli-test', '--title', 'Cli Test', '--new-hub', 'Cli Hollow', `file:${file}`);
  });

  it('new writes a zone at rev 1 with a new hub in 900-999', () => {
    const z = zone();
    assert.equal(z.format, 'groddle-zone/1');
    assert.equal(z.rev, 1);
    assert.deepEqual(z.hub, { id: '900', name: 'Cli Hollow', isNew: true });
  });

  it('street fork copies a shipped street under a GZ tsid, with provenance rows', async () => {
    const r = await cli('street', 'fork', HECHEY, '--key', 'lane', '--label', 'Cli Lane', `file:${file}`);
    assert.match(r.out.street, /^GZ[A-Z0-9]{13}$/);
    assert.equal(r.out.rev, 2);
    const z = zone();
    assert.equal(z.streets[0].street.label, 'Cli Lane');
    assert.equal(z.assets.bush_3.origin, 'tinyspeck-cc0');
    await cli('street', 'fork', HECHEY, '--key', 'end', '--label', 'Cli End', `file:${file}`);
    assert.equal(zone().streets.length, 2);
  });

  it('place: the next deco id, the median drawn size, z on top, a provenance row when missing', async () => {
    const before = zone().streets[0].street.layers.find((l) => l.id === 'middleground').decos;
    const r = await cli('place', '--street', 'lane', '--sprite', 'heights_topper_2', '--x', '1350', '--y', '-192', `file:${file}`);
    const d = zone().streets[0].street.layers.find((l) => l.id === 'middleground').decos.at(-1);
    assert.equal(`lane/${d.id}`, r.out.id);
    assert.equal(d.z, Math.max(...before.map((x) => x.z || 0)) + 1);
    assert.ok(d.w > 0 && d.h > 0);
    assert.equal(zone().assets.heights_topper_2.licence, 'CC0-1.0');
    await assert.rejects(() => cli('place', '--street', 'lane', '--sprite', 'no_such_thing', '--x', '1', '--y', '1', `file:${file}`), /No deco "no_such_thing"/);
  });

  it('platform, wall, ladder and signpost take the next ids (lines run left to right)', async () => {
    const p = await cli('platform', '--street', 'lane', '--from', '1450,-192', '--to', '1250,-192', '--perm', 'floor', `file:${file}`);
    const w = await cli('wall', '--street', 'lane', '--x', '0', '--y', '-300', '--h', '200', `file:${file}`);
    const l = await cli('ladder', '--street', 'lane', '--x', '100', '--y', '-60', '--h', '300', `file:${file}`);
    const s = await cli('signpost', '--street', 'lane', '--x', '-200', '--y', '-60', `file:${file}`);
    const st = zone().streets[0].street;
    const plat = st.platforms.find((x) => `lane/${x.id}` === p.out.id);
    assert.deepEqual([plat.x1, plat.x2, plat.pc_perm, plat.item_perm], [1250, 1450, -1, -1]);
    assert.equal(st.barriers.find((x) => `lane/${x.id}` === w.out.id).pc_perm, null);
    assert.equal(st.ladders.find((x) => `lane/${x.id}` === l.out.id).w, 50);
    assert.deepEqual(st.signposts.find((x) => `lane/${x.id}` === s.out.id).connects, []);
  });

  it('set and rm address anything by <street>/<id>; key= removes a field', async () => {
    const st = zone().streets[0].street;
    const d = st.layers.find((l) => l.id === 'middleground').decos.at(-1);
    await cli('set', `lane/${d.id}`, 'x=1360', 'flip=true', `file:${file}`);
    let after = zone().streets[0].street.layers.find((l) => l.id === 'middleground').decos.at(-1);
    assert.deepEqual([after.x, after.flip], [1360, true]);
    await cli('set', `lane/${d.id}`, 'flip=', `file:${file}`);
    after = zone().streets[0].street.layers.find((l) => l.id === 'middleground').decos.at(-1);
    assert.equal('flip' in after, false);
    await cli('set', 'lane', 'label="Cli Lane Two"', `file:${file}`);
    assert.equal(zone().streets[0].street.label, 'Cli Lane Two');
    await cli('set', 'lane/middleground', 'hidden=false', `file:${file}`);
    assert.equal(zone().streets[0].street.layers.find((l) => l.id === 'middleground').hidden, false);
    await cli('rm', `lane/${d.id}`, `file:${file}`);
    assert.equal(zone().streets[0].street.layers.find((l) => l.id === 'middleground').decos.some((x) => x.id === d.id), false);
    assert.deepEqual(setOps(zone(), 'lane/signpost_1/0', ['label=Somewhere']), [{ op: 'connect.set', street: 'lane', signpost: 'signpost_1', at: 0, set: { label: 'Somewhere' } }]);
    assert.deepEqual(rmOps(zone(), 'end'), [{ op: 'street.remove', street: 'end' }]);
    assert.throws(() => rmOps(zone(), 'lane/d_999999'), /no deco or geometry/);
  });

  it('connect: a post at each facing end on the highest floor, arms both ways with arrivals', async () => {
    const r = await cli('connect', 'lane', 'end', `file:${file}`);
    assert.equal(r.out.posts.length, 2);
    const z = zone();
    const [a, b] = r.out.posts.map((p) => p.split('/'));
    const lane = z.streets.find((s) => s.key === a[0]).street;
    const end = z.streets.find((s) => s.key === b[0]).street;
    const pa = lane.signposts.find((p) => p.id === a[1]);
    const pb = end.signposts.find((p) => p.id === b[1]);
    assert.equal(pa.x, lane.bounds.r - 150);
    assert.equal(pa.y, highestFloorAt(lane, pa.x));
    assert.equal(pb.x, end.bounds.l + 150);
    assert.equal(pa.connects[0].tsid, end.tsid);
    assert.equal(pb.connects[0].tsid, lane.tsid);
    assert.ok(pa.connects[0].arrive && pb.connects[0].arrive, 'arrivals worked out');
    assert.throws(() => connectOps(z, 'lane', 'lane'), /two different streets/);
  });

  it('ops <file>: deco ids filled in, library provenance added, all or nothing', async () => {
    const ops = join(dir, 'ops.json');
    writeFileSync(ops, JSON.stringify({ ops: [
      { op: 'deco.add', street: 'end', layer: 'middleground', deco: { sprite: 'heights_topper_1', x: 300, y: -60, w: 160, h: 90, z: 1, r: 0 } },
      { op: 'deco.add', street: 'end', layer: 'middleground', deco: { sprite: 'heights_topper_1', x: 500, y: -60, w: 160, h: 90, z: 1, r: 0 } },
    ] }));
    const before = zone().rev;
    const r = await cli('ops', ops, `file:${file}`);
    assert.equal(r.out.rev, before + 1);
    assert.equal(r.out.changed.filter((c) => /^end\/d_\d+$/.test(c)).length, 2);
    assert.ok(zone().assets.heights_topper_1);
    writeFileSync(ops, JSON.stringify({ ops: [{ op: 'deco.set', street: 'end', id: 'd_1', set: { x: 1 } }, { op: 'deco.set', street: 'end', id: 'd_nope', set: { x: 1 } }] }));
    await assert.rejects(() => cli('ops', ops, `file:${file}`), (e) => e.code === 'builder_invalid' && e.data.op === 1);
    assert.equal(zone().rev, before + 1, 'nothing written');
    const filled = prepareOps(zone(), [{ op: 'deco.add', street: 'end', layer: 'middleground', deco: { sprite: 'bush_3', x: 0, y: 0, w: 1, h: 1 } }]);
    assert.equal(filled.length, 1, 'bush_3 already has its row');
    assert.match(filled[0].deco.id, /^d_\d+$/);
  });

  it('validate: findings as JSON; exit 1 on a fatal, 0 when only notes are left', async () => {
    const r = await cli('validate', '--rule', 'NAV-', `file:${file}`);
    assert.equal(r.exit, 0, JSON.stringify(r.out.counts));
    assert.ok(Array.isArray(r.out.findings));
    const broken = join(dir, 'broken.json');
    const z = zone();
    z.streets[1].street.platforms = [];
    writeFileSync(broken, JSON.stringify(z));
    const b = await cli('validate', `file:${broken}`);
    assert.equal(b.exit, 1);
    assert.ok(b.out.findings.some((f) => f.rule === 'STR-003' && f.severity === 'fatal'));
  });

  it('the P3 ops are built as spec 8.3 names them (population.set, hubmap.set, edit.add)', () => {
    const z = zone();
    assert.deepEqual(populateOps(z, 'lane', ['npc_piggy=2', 'trant_fruit=1'], 6), [{ op: 'population.set', street: 'lane', population: { counts: { npc_piggy: 2, trant_fruit: 1 }, quoins: 6 } }]);
    assert.throws(() => populateOps(z, 'lane', ['piggy']), /class=count/);
    const [map] = hubMapOps(z, 'lane', '200,260,380,240');
    assert.equal(map.op, 'hubmap.set');
    assert.deepEqual(map.map.streets[0], { tsid: z.streets[0].street.tsid, name: z.streets[0].street.label, x1: 200, y1: 260, x2: 380, y2: 240 });
    const link = linkWorldOps(z, 'lane', shipped(HECHEY));
    const edit = link.ops.at(-1);
    assert.equal(edit.op, 'edit.add');
    assert.equal(edit.edit.tsid, HECHEY);
    assert.equal(edit.edit.op, 'add-connect');
    assert.equal(edit.edit.connect.tsid, z.streets[0].street.tsid);
    assert.equal(link.ops[0].op, 'signpost.add');
    assert.equal(link.ops[0].signpost.connects[0].tsid, HECHEY);
  });
});

describe('catalog, style and guide', () => {
  it('decos: text match, then the hub, then placements', async () => {
    const r = await cli('decos', 'bush', '--layer', 'middleground', '--hub', '58', '--limit', '3');
    assert.equal(r.out.length, 3);
    assert.ok(r.out.every((d) => d.name.includes('bush') && d.layers.middleground > 0));
    assert.ok(r.out[0].inHub >= r.out[1].inHub);
  });
  it('style: a hub profile with its layer bands', async () => {
    const r = await cli('style', 'hub-58');
    assert.equal(r.out.profile, 'hub-58');
    assert.ok(r.out.layers.middleground.density.length === 3);
    await assert.rejects(() => cli('style', 'hub-99999'), /No style profile/);
  });
  it('guide: the jump numbers come from the stepper', async () => {
    const g = (await cli('guide')).out;
    assert.equal(g.jump.plainApex, 104.9);
    assert.equal(g.jump.runningJump, 198);
    assert.ok(g.rules.some((r) => r.id === 'PHY-003' && r.severity === 'error'));
    assert.ok(g.ops.includes('deco.add'));
    assert.equal(g.limits.ratesPerMinute.render, 20);
  });
});

describe('a draft on the site (signed REST, faked here)', () => {
  it('writes ops with If-Match, signs every request, and rebuilds after a 409', async () => {
    const z = { format: 'groddle-zone/1', id: 'remote', title: 'R', rev: 4, streets: [], edits: [], assets: {} };
    const calls = [];
    let rev = 4;
    const fetchImpl = async (url, init) => {
      const u = new URL(url);
      calls.push({ method: init.method, path: u.pathname, ifMatch: init.headers['If-Match'], header: init.headers['X-Groddle-Builder'], body: init.body ?? '', query: u.search.slice(1) });
      const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
      if (init.method === 'GET') return json(200, { ...z, rev }, { ETag: `"${rev}"` });
      if (calls.filter((c) => c.method === 'POST').length === 1) {
        rev = 5;
        return json(409, { code: 'builder_rev_conflict', message: 'moved', data: { status: 409, rev: 5 } });
      }
      return json(200, { rev: 6, changed: ['zone'] });
    };
    writeFileSync(join(dir, 'zone-set.json'), JSON.stringify({ ops: [{ op: 'zone.set', set: { title: 'Remote' } }] }));
    const done = await run(['ops', join(dir, 'zone-set.json'), '--draft', 'remote'], { env, fetchImpl });
    assert.equal(done.out.rev, 6);
    const posts = calls.filter((c) => c.method === 'POST');
    assert.deepEqual(posts.map((c) => c.ifMatch), ['"4"', '"5"']);
    for (const c of calls) {
      const route = c.path.replace(/^\/wp-json/, '');
      const [keyId, at, nonce] = c.header.split('.');
      assert.equal(c.header, signKey({ keyId, secret: 'b'.repeat(64), method: c.method, route, query: canonicalQuery(c.query), body: c.body, at: Number(at), nonce }));
    }
  });

  it('publish waits for P6; an unknown command is refused', async () => {
    await assert.rejects(() => cli('publish', '--dry-run'), (e) => e.code === 'builder_not_yet');
    await assert.rejects(() => cli('nope'), /No command "nope"/);
  });

  it('sign prints the header for a request', async () => {
    const r = await cli('sign', 'POST', '/groddle/v1/admin/builder/drafts/x/publish-request', '{"note":"ready"}');
    assert.match(r.out.header, /^a{16}\.\d+\.[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/);
  });
});
