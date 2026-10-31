#!/usr/bin/env node
/**
 * LEVEL BUILDER P4 acceptance (spec 8.7, 14): the example session, run end to end against a local
 * site (groddle.localhost by default) as an agent would run it: every step is the CLI with a
 * builder key, and the checks between steps are the ones 8.7 shows (the PHY-003 on the ledge, the
 * render, the fix, a clean validate, the play-test URL, the publish request). It also checks that a
 * replayed and a stale-signed request are refused and that the key cannot reach admin/give.
 *
 *   node tools/builder/example-session.mjs [--url https://groddle.localhost]
 *       [--webroot ~/Cove/Sites/groddle.localhost/public] [--keep] [--out <dir>] [--without-p3]
 *
 * It signs in as the site's administrator through a one-time link minted on this machine
 * (tools/builder/admin-session.mjs) only to make the key and, at the end, to clean up: the draft
 * (archived, then deleted for good with its revisions and new art) and the key (revoked and deleted).
 * The key lives in a temporary GRODDLE_BUILDER_HOME, never in ~/.config/groddle. The builder worker
 * is started from this checkout when none answers on 127.0.0.1:8794, and stopped after.
 * --without-p3 swaps the steps P3's ops serve (street add from a template, population.set,
 * link-world's edit.add) for a fork of Hechey Track, for checks before P3 lands.
 * Exit 0 when every check holds.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { GAME_DIR } from '../repos.mjs';
import { adminSession } from './admin-session.mjs';
import { signKey, parseKey } from './sign.mjs';
import { highestFloorAt } from './cli.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const URL_BASE = arg('url', 'https://groddle.localhost').replace(/\/+$/, '');
const WEBROOT = resolve(arg('webroot', join(homedir(), 'Cove/Sites/groddle.localhost/public')));
const KEEP = process.argv.includes('--keep');
const WITHOUT_P3 = process.argv.includes('--without-p3');
const OUT = resolve(arg('out', mkdtempSync(join(tmpdir(), 'groddle-session-out-'))));
const DRAFT = `mossy-hollow-${Date.now().toString(36)}`;
const CLI = join(GAME_DIR, 'tools/builder/cli.mjs');

const checks = [];
const refused = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
  return ok;
};

/** A tiny CC0 test sprite: a mossy stone, transparent around it, sitting on its bottom row. */
function stonePng(w = 96, h = 64) {
  const chunk = (type, data = Buffer.alloc(0)) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const inside = ((x - w / 2) / (w / 2 - 4)) ** 2 + ((y - h) / (h - 6)) ** 2 <= 1;
      const moss = inside && y < h * 0.45;
      const o = y * (w * 4 + 1) + 1 + x * 4;
      if (inside) raw.set(moss ? [86, 140, 60, 255] : [128, 124, 116, 255], o);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND')]);
}

async function workerUp() {
  try {
    return (await fetch('http://127.0.0.1:8794/health')).ok;
  } catch {
    return false;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const home = mkdtempSync(join(tmpdir(), 'groddle-builder-home-'));
  const env = { ...process.env, GRODDLE_BUILDER_HOME: home, GRODDLE_BUILDER_DRAFT: '' };
  const cli = (...args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { env, cwd: OUT, encoding: 'utf8', maxBuffer: 1 << 26 });
    const line = r.stdout.trim().split('\n').pop() || '';
    let json = null;
    try { json = JSON.parse(line); } catch { /* text output */ }
    // P3 saw unexplained 422s once: keep every 422's whole body.
    if (json?.error?.status === 422 || /422/.test(r.stderr)) {
      const entry = { at: new Date().toISOString(), args, body: json?.error ?? r.stderr.trim() };
      refused.push(entry);
      console.log(`422 ${args.slice(0, 2).join(' ')}: ${JSON.stringify(entry.body)}`);
    }
    return { status: r.status, json, text: r.stdout.trim(), err: r.stderr.trim() };
  };
  let worker = null;
  let admin = null;
  let key = null;
  let created = false;
  try {
    // —— Set up: an administrator's session makes the agent's key ——
    admin = await adminSession({ webroot: WEBROOT, url: URL_BASE });
    const made = await admin.call('POST', 'admin/builder/keys', { label: `example session ${DRAFT}`, scopes: ['drafts:read', 'drafts:write', 'assets:write', 'validate', 'render'], days: 1 });
    if (!check('a key is made from the session (cookie only)', made.status === 201, made.data?.message || '')) return;
    key = made.data.key;
    writeFileSync(join(home, 'builder.env'), made.data.env, { mode: 0o600 });
    if (!(await workerUp())) {
      worker = spawn(process.execPath, [join(GAME_DIR, 'tools/builder/worker.mjs')], { cwd: GAME_DIR, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      for (let i = 0; i < 50 && !(await workerUp()); i += 1) await new Promise((r) => setTimeout(r, 200));
    }
    check('the builder worker answers', await workerUp());

    // —— The session (spec 8.7) ——
    let r = cli('new', DRAFT, '--title', 'Mossy Hollow', '--new-hub', 'Mossy Hollow', '--json');
    created = r.status === 0;
    check('new: a zone with a new hub', created && r.json?.rev === 1 && r.json?.hub?.isNew === true && Number(r.json.hub.id) >= 900, JSON.stringify(r.json));
    if (!created) return;
    r = cli('style', 'hub-58', '--json');
    check('style hub-58: layer bands', r.status === 0 && Array.isArray(r.json?.layers?.sky?.z), JSON.stringify(r.json?.layers?.sky?.filters?.saturation?.band || r.json?.layers?.sky?.z));
    if (WITHOUT_P3) {
      r = cli('street', 'fork', 'GLI2V0UN7RD1T2J', '--draft', DRAFT, '--key', 'lane', '--label', 'Mossy Lane', '--json');
      check('street fork (without P3): lane', r.status === 0 && /^GZ[A-Z0-9]{13}$/.test(r.json?.street || ''), r.err);
      r = cli('street', 'fork', 'GLI2V0UN7RD1T2J', '--draft', DRAFT, '--key', 'end', '--label', 'Hollow End', '--json');
      check('street fork (without P3): end', r.status === 0, r.err);
    } else {
      r = cli('street', 'add', '--draft', DRAFT, '--key', 'lane', '--label', 'Mossy Lane', '--template', 'meadow', '--width', '3000', '--json');
      check('street add: lane from the meadow template', r.status === 0 && /^GZ[A-Z0-9]{13}$/.test(r.json?.street || '') && JSON.stringify(r.json?.layers) === JSON.stringify(['sky', 'bg_1', 'middleground', 'middleplus']), r.err || JSON.stringify(r.json));
      r = cli('street', 'add', '--draft', DRAFT, '--key', 'end', '--label', 'Hollow End', '--template', 'meadow', '--width', '2000', '--json');
      check('street add: end', r.status === 0, r.err);
    }
    r = cli('decos', 'bush', '--layer', 'middleground', '--hub', '58', '--limit', '3', '--json');
    check('decos: bush in hub 58', r.status === 0 && r.json?.length === 3 && r.json.every((d) => d.name.includes('bush') && d.drawn), r.json?.map((d) => d.name).join(', '));

    // The ledge under where `connect` will put lane's post: 132 px over the floor, too high to jump.
    const pulled = cli('pull', DRAFT, '--out', join(OUT, 'pulled.zone.json'), '--json');
    const zone = JSON.parse(readFileSync(pulled.json.file, 'utf8'));
    const lane = zone.streets.find((s) => s.key === 'lane').street;
    const postX = lane.bounds.r - 150;
    const floorY = highestFloorAt(lane, postX);
    const ledgeY = floorY - 132;
    const ops = { ops: [
      { op: 'platform.add', street: 'lane', platform: { x1: postX - 100, y1: ledgeY, x2: postX + 100, y2: ledgeY, pc_perm: -1, item_perm: -1 } },
      { op: 'deco.add', street: 'lane', layer: 'middleground', deco: { sprite: 'heights_topper_2', x: postX, y: ledgeY, w: 220, h: 60, z: 2, r: 0 } },
      { op: 'deco.add', street: 'end', layer: 'middleground', deco: { sprite: 'bush_3', x: 300, y: -60, w: 160, h: 90, z: 1, r: 0 } },
      ...(WITHOUT_P3 ? [] : [{ op: 'population.set', street: 'lane', population: { counts: { npc_piggy: 2, trant_fruit: 1 }, quoins: 6 } }]),
    ] };
    writeFileSync(join(OUT, 'ops.json'), JSON.stringify(ops, null, 1));
    r = cli('ops', '--draft', DRAFT, join(OUT, 'ops.json'), '--json');
    const ledge = (r.json?.changed || []).find((c) => /^lane\/plat_\d+$/.test(c));
    check('ops: a ledge, two decos and a population in one batch', r.status === 0 && ledge && r.json.changed.some((c) => /^end\/d_\d+$/.test(c)), r.err || JSON.stringify(r.json));

    r = cli('connect', 'lane', 'end', '--json');
    check('connect: a post at each facing end, arrivals worked out', r.status === 0 && r.json?.posts?.length === 2, r.err || JSON.stringify(r.json));
    if (WITHOUT_P3) {
      check('link-world waits for P3 (edit.add)', true, 'skipped');
    } else {
      r = cli('link-world', 'lane', '--from', 'GLI2V0UN7RD1T2J', '--json');
      check('link-world: an arm on Hechey Track\'s signpost_3 (it has room; signpost_1 shows four arms), and one back', r.status === 0 && r.json?.edits === 1 && r.json.on === 'GLI2V0UN7RD1T2J/signpost_3' && /^lane\/signpost_\d+$/.test(r.json.post || ''), r.err || JSON.stringify(r.json));
      r = cli('link-world', 'lane', '--from', 'GLI2V0UN7RD1T2J', '--post', 'signpost_1', '--json');
      check('link-world refuses a post that already shows four arms', r.status === 2 && r.json?.error?.code === 'builder_post_full', JSON.stringify(r.json));
      r = cli('populate', '--street', 'end', 'npc_chicken=1', 'trant_bean=1', '--quoins', '4', '--json');
      check('populate: Hollow End\'s population', r.status === 0 && r.json?.changed?.includes('end/population'), r.err || JSON.stringify(r.json));
      r = cli('hub', 'map', '--street', 'end', '--line', '380,240,560,270', '--json');
      check('hub map: Hollow End\'s line', r.status === 0 && r.json?.changed?.includes('hub'), r.err || JSON.stringify(r.json));
      writeFileSync(join(OUT, 'layer-op.json'), JSON.stringify({ ops: [{ op: 'layer.add', street: 'lane', layer: { id: 'bg_9' } }] }));
      r = cli('ops', '--draft', DRAFT, join(OUT, 'layer-op.json'), '--json');
      check('an op spec 8.3 names but nobody built (layer.add) is refused, not sent', r.status === 2 && r.json?.error?.code === 'builder_not_yet', JSON.stringify(r.json));
    }

    // New art through intake, placed on the end street.
    const art = join(OUT, 'gz_mossy_stone.png');
    writeFileSync(art, stonePng());
    const artName = `gz_mossy_stone_${Date.now().toString(36)}`;
    r = cli('asset', 'add', art, '--draft', DRAFT, '--name', artName, '--licence', 'own-work-CC0', '--author', 'Austin Ginder', '--inputs', 'own:a test stone drawn by the session', '--role', 'middleground', '--json');
    check('asset add: new art kept with its provenance', r.status === 0 && r.json?.asset?.sha256, r.err || JSON.stringify(r.json?.error));
    r = cli('place', '--draft', DRAFT, '--street', 'end', '--layer', 'middleground', '--sprite', artName, '--x', '500', '--y', String(highestFloorAt(JSON.parse(readFileSync(cli('pull', DRAFT, '--out', join(OUT, 'p2.zone.json'), '--json').json.file, 'utf8')).streets.find((s) => s.key === 'end').street, 500)), '--json');
    check('place: the new art on Hollow End', r.status === 0, r.err || JSON.stringify(r.json?.error));

    r = cli('validate', '--draft', DRAFT, '--json');
    const phy = (r.json?.findings || []).filter((f) => f.rule === 'PHY-003' && f.street === 'lane');
    // Without P3 there is no link-world, so the lane's only arrival is the arm from Hollow End, which lands on the ledge itself.
    if (WITHOUT_P3) check('validate: runs (PHY-003 needs the link-world arrival, P3)', r.json?.counts, JSON.stringify(r.json?.counts));
    else check('validate: the post on the ledge cannot be reached from the arrival from Hechey Track (PHY-003), exit 1', r.status === 1 && phy.length >= 1, phy.map((f) => f.message).join(' | ') || r.err || JSON.stringify(r.json?.counts));
    const laneErrors = (r.json?.findings || []).filter((f) => f.street === 'lane' && (f.severity === 'error' || f.severity === 'fatal') && f.rule !== 'PHY-003').map((f) => f.rule);

    r = cli('render', '--draft', DRAFT, '--street', 'lane', '--scale', '0.25', '--overlay', 'geometry,reach,findings,grid', '--out', join(OUT, 'lane.png'), '--json');
    check('render: lane.png with the overlays', r.status === 0 && /^\d+x\d+$/.test(r.json?.size || '') && r.json.findings.error >= 1, r.err || JSON.stringify(r.json));

    r = cli('set', `${ledge}`, `y1=${floorY - 90}`, `y2=${floorY - 90}`, '--draft', DRAFT, '--json');
    // P7: the post standing on the ledge comes down with it, and the arm into it lands there again.
    check('set: the ledge down to a 90 px rise, carrying its post; the arm into it lands there again', r.status === 0 && (r.json?.carried || []).length === 1 && (r.json?.arms || []).length >= 1, r.err || JSON.stringify(r.json));
    // The deco on the ledge moves with it.
    const after = JSON.parse(readFileSync(cli('pull', DRAFT, '--out', join(OUT, 'p3.zone.json'), '--json').json.file, 'utf8'));
    const topper = after.streets.find((s) => s.key === 'lane').street.layers.find((l) => l.id === 'middleground').decos.find((d) => d.sprite === 'heights_topper_2' && d.y === ledgeY);
    if (topper) cli('set', `lane/${topper.id}`, `y=${floorY - 90}`, '--draft', DRAFT, '--json');
    const lanePost = after.streets.find((s) => s.key === 'lane').street.signposts.find((p) => p.id === r.json?.carried?.[0]?.split('/')[1]);
    check('set: the post stands on the ledge where it came down to', lanePost?.y === floorY - 90, JSON.stringify(lanePost));
    r = cli('arrivals', '--posts', '--draft', DRAFT, '--json');
    check('arrivals --posts: every post on its floor, every arm landing where its post stands', r.status === 0 && (r.json?.posts || []).length === 0 && (r.json?.arms || []).length === 0, r.err || JSON.stringify(r.json));
    r = cli('validate', '--draft', DRAFT, '--rule', 'PHY-', '--json');
    const left = (r.json?.findings || []).filter((f) => f.street === 'lane' && f.rule === 'PHY-003');
    check('validate: the post is reached now (no PHY-003 on lane)', r.json && left.length === 0, left.map((f) => f.message).join(' | ') || JSON.stringify(r.json?.counts));
    r = cli('validate', '--draft', DRAFT, '--json');
    if (r.json?.counts?.error) console.log('errors left:', JSON.stringify(r.json.findings.filter((f) => f.severity === 'error' || f.severity === 'fatal')));
    check(WITHOUT_P3 ? 'validate: counts (a fork of Hechey Track keeps its own findings)' : 'validate: no errors', WITHOUT_P3 ? r.json?.counts : r.status === 0, JSON.stringify(r.json?.counts) + (laneErrors.length ? ` other lane errors before: ${laneErrors.join(',')}` : ''));
    r = cli('render', '--draft', DRAFT, '--street', 'lane', '--scale', '0.25', '--overlay', 'geometry,reach,findings,grid', '--out', join(OUT, 'lane-fixed.png'), '--json');
    check('render: the fixed lane', r.status === 0, r.err);
    r = cli('render', '--draft', DRAFT, '--street', 'end', '--view', 'camera', '--x', '500', '--y', '-200', '--scale', '1', '--overlay', 'grid,populations', '--out', join(OUT, 'end-camera.png'), '--json');
    check('render: a camera view of Hollow End with the new art', r.status === 0, r.err);

    r = cli('play', '--draft', DRAFT, '--street', 'lane');
    check('play: the play-test address', r.text === `${URL_BASE}/play/?practice=1&autostart=1&draft=${DRAFT}&street=lane`, r.text);
    const body = '{"note":"ready"}';
    const route = `/groddle/v1/admin/builder/drafts/${DRAFT}/publish-request`;
    const header = cli('sign', 'POST', route, body).text;
    const res = await fetch(`${URL_BASE}/wp-json${route}`, { method: 'POST', headers: { 'X-Groddle-Builder': header, 'Content-Type': 'application/json' }, body });
    const ready = await res.json();
    check('publish-request (signed by `cli sign`): the draft is ready', res.status === 200 && ready.state === 'ready', JSON.stringify(ready));

    // —— Refusals (spec 14 P4) ——
    const again = await fetch(`${URL_BASE}/wp-json${route}`, { method: 'POST', headers: { 'X-Groddle-Builder': header, 'Content-Type': 'application/json' }, body });
    check('the same signed request again is refused (replay)', again.status === 401 && (await again.json()).data?.reason === 'replay');
    const k = parseKey(made.data.line);
    const staleHeader = signKey({ keyId: k.keyId, secret: k.secret, method: 'GET', route: `/groddle/v1/admin/builder/drafts/${DRAFT}`, at: Math.floor(Date.now() / 1000) - 120 });
    const stale = await fetch(`${URL_BASE}/wp-json/groddle/v1/admin/builder/drafts/${DRAFT}`, { headers: { 'X-Groddle-Builder': staleHeader } });
    check('a stale signature is refused', stale.status === 401 && (await stale.json()).data?.reason === 'stale');
    const giveBody = JSON.stringify({ player: 1, items: [{ c: 'apple', n: 1 }] });
    const give = await fetch(`${URL_BASE}/wp-json/groddle/v1/admin/give`, { method: 'POST', headers: { 'X-Groddle-Builder': signKey({ keyId: k.keyId, secret: k.secret, method: 'POST', route: '/groddle/v1/admin/give', body: giveBody }), 'Content-Type': 'application/json' }, body: giveBody });
    check('the key cannot reach admin/give', give.status === 401 || give.status === 403, `${give.status} ${(await give.json()).code}`);
    const keys = await fetch(`${URL_BASE}/wp-json/groddle/v1/admin/builder/keys`, { headers: { 'X-Groddle-Builder': signKey({ keyId: k.keyId, secret: k.secret, method: 'GET', route: '/groddle/v1/admin/builder/keys' }) } });
    check('the key cannot manage keys', keys.status === 403, String(keys.status));
  } catch (e) {
    check('the session ran', false, e.stack || e.message);
  } finally {
    // —— Clean up: the draft (with its revisions and new art) and the key ——
    if (admin && created && !KEEP) {
      const a = await admin.call('DELETE', `admin/builder/drafts/${DRAFT}`);
      const p = await admin.call('POST', `admin/builder/drafts/${DRAFT}/purge`);
      check('cleanup: the draft, its revisions and its art deleted', a.status === 200 && p.status === 200 && p.data?.purged, JSON.stringify(p.data));
    }
    if (admin && key && !KEEP) {
      const d = await admin.call('DELETE', `admin/builder/keys/${key.id}?purge=1`);
      check('cleanup: the key revoked and deleted', d.status === 200 && d.data?.state === 'deleted', JSON.stringify(d.data));
    }
    rmSync(home, { recursive: true, force: true });
    if (worker) worker.kill('SIGTERM');
  }
}

await main();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} of ${checks.length} checks hold${KEEP ? ` (kept draft ${DRAFT})` : ''}; pictures and files in ${OUT}`);
writeFileSync(join(OUT, 'session.json'), JSON.stringify({ draft: DRAFT, withoutP3: WITHOUT_P3, checks, refused422: refused }, null, 1));
if (refused.length) console.log(`${refused.length} answer(s) were 422; bodies in ${join(OUT, 'session.json')}`);
process.exit(failed.length ? 1 : 0);
