/**
 * One Java for every art tool (tools/java.mjs, tools/java_path.py, both reading tools/java.json):
 * $GRODDLE_JAVA, else the first Homebrew JDK in java.json's order, else `java` on the PATH.
 * Homebrew removed openjdk@21 (2026-11), which 13 tools had hard-coded.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findJava, JAVA_CONFIG } from '../tools/java.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, 'tools');
const HELPERS = new Set(['tools/java.json', 'tools/java.mjs', 'tools/java_path.py']);

/** The cases both helpers must agree on: [env, existing paths, expected]. */
const brew = (v, prefix = '/opt/homebrew/opt') => `${prefix}/${v}/bin/java`;
const CASES = [
  [{ GRODDLE_JAVA: '/my/jdk/bin/java' }, [brew('openjdk@21')], '/my/jdk/bin/java'],
  [{ GRODDLE_JAVA: '  ' }, [brew('openjdk@25')], brew('openjdk@25')],
  [{}, [brew('openjdk@27'), brew('openjdk@17'), brew('openjdk@25')], brew('openjdk@25')],
  [{}, [brew('openjdk@21'), brew('openjdk@25')], brew('openjdk@21')],
  [{}, [brew('openjdk'), brew('openjdk@27')], brew('openjdk@27')],
  [{}, [brew('openjdk@17', '/usr/local/opt')], brew('openjdk@17', '/usr/local/opt')],
  [{}, [], 'java'],
];

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(mjs|js|py|sh)$/.test(name)) out.push(p);
  }
  return out;
}

describe('the art tools\' Java', () => {
  it('GRODDLE_JAVA, else the first Homebrew JDK in order, else java', () => {
    for (const [env, have, want] of CASES) {
      assert.equal(findJava({ env, exists: (p) => have.includes(p) }), want, JSON.stringify({ env, have }));
    }
  });

  it('the Python helper picks the same in every case', () => {
    const script = [
      'import json, sys',
      `sys.path.insert(0, ${JSON.stringify(TOOLS)})`,
      'from java_path import find_java',
      'cases = json.loads(sys.argv[1])',
      'print(json.dumps([find_java(env, lambda p, have=set(have): p in have) for env, have, _ in cases]))',
    ].join('\n');
    let out;
    try {
      out = execFileSync('python3', ['-I', '-c', script, JSON.stringify(CASES)], { encoding: 'utf8' });
    } catch (e) {
      if (e.code === 'ENOENT') return; // no python3 here
      throw e;
    }
    assert.deepEqual(JSON.parse(out), CASES.map((c) => c[2]));
  });

  it('openjdk@21 is gone from the list, and the list is what the helpers read', () => {
    assert.equal(JAVA_CONFIG.env, 'GRODDLE_JAVA');
    assert.ok(JAVA_CONFIG.jdks.includes('openjdk@25') && JAVA_CONFIG.jdks.includes('openjdk@17'));
    assert.match(readFileSync(join(TOOLS, 'java_path.py'), 'utf8'), /java\.json/);
  });

  it('no tool names a JDK path of its own: each takes the helper', () => {
    const own = [];
    const users = [];
    for (const f of files(TOOLS)) {
      const rel = relative(ROOT, f);
      if (HELPERS.has(rel)) continue;
      const src = readFileSync(f, 'utf8');
      // A path to a java binary (Homebrew or any other) written into the tool.
      if (/openjdk|['"`][^'"`\s]*\/bin\/java['"`]/.test(src)) own.push(rel);
      if (/^\s*(?:const |export const )?(?:JAVA|J)\s*=\s*['"`]/m.test(src)) own.push(`${rel} (writes JAVA in)`);
      if (/\bJAVA\b/.test(src)) users.push([rel, src]);
    }
    assert.deepEqual(own, []);
    for (const [rel, src] of users) {
      const helper = /from '\.\.?\/(?:\.\.\/)?(?:java\.mjs|vector-sprites\/swf-labels\.mjs|swf-labels\.mjs)'|from java_path import JAVA|audit\.JAVA/.test(src);
      assert.ok(helper, `${rel} takes JAVA from the helper`);
    }
    // The 13 tools that had openjdk@21 written in, plus the swf-labels re-export.
    assert.ok(users.length >= 13, `${users.length} tools use the helper`);
  });
});
