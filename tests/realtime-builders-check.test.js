/**
 * G523: `--check` on a realtime data builder only compares. Rook and objects ignored the flag, so
 * a "check" rewrote the server's file and the suite never saw it stale. Every
 * tools/build-realtime-*.mjs runs here against a throwaway server folder whose file is out of date:
 * it must fail and leave the bytes as they were. Rook and objects are also held to the real server
 * repo, as the other builders' own tests hold theirs.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const builders = readdirSync(join(root, 'tools')).filter((f) => /^build-realtime-.*\.mjs$/.test(f)).sort();
const STALE = '{"stale":true}\n';

const run = (tool, env = {}, args = ['--check']) => spawnSync(process.execPath, [join(root, 'tools', tool), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });

describe('--check on the realtime data builders writes nothing', () => {
  let server;
  let data;
  const outFile = (tool) => {
    const name = tool.replace(/^build-realtime-|\.mjs$/g, '');
    return `${name}.json`;
  };

  before(() => {
    server = mkdtempSync(join(tmpdir(), 'groddle-builder-check-'));
    data = join(server, 'data');
    mkdirSync(data);
    writeFileSync(join(server, 'go.mod'), 'module throwaway\n');
    for (const tool of builders) writeFileSync(join(data, outFile(tool)), STALE);
  });
  after(() => rmSync(server, { recursive: true, force: true }));

  it('finds the builders', () => {
    assert.ok(builders.length >= 14, builders.join());
    for (const tool of ['build-realtime-rook.mjs', 'build-realtime-objects.mjs']) assert.ok(builders.includes(tool));
  });

  for (const tool of builders) {
    it(`${tool}: a stale file fails and stays as it was`, () => {
      const file = join(data, outFile(tool));
      const before = statSync(file).mtimeMs;
      const r = run(tool, { GRODDLE_SERVER_DIR: server });
      assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /is stale: run node tools\/build-realtime-/);
      assert.equal(readFileSync(file, 'utf8'), STALE);
      assert.equal(statSync(file).mtimeMs, before);
    });
  }

  it('no builder made another file in the server folder', () => {
    assert.deepEqual(readdirSync(data).sort(), builders.map(outFile).sort());
    assert.deepEqual(readdirSync(server).sort(), ['data', 'go.mod']);
  });
});

describe('the two that had no check are current', () => {
  for (const tool of ['build-realtime-rook.mjs', 'build-realtime-objects.mjs']) {
    it(`${tool} --check passes against the server repo`, { skip: skipWithoutServer }, () => {
      const r = run(tool);
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /is current/);
    });
  }
});
