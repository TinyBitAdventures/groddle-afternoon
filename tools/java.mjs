#!/usr/bin/env node
/**
 * The Java the art tools run FFDec under, for every tool (Python tools use tools/java_path.py,
 * which reads the same tools/java.json): $GRODDLE_JAVA when set, else the first Homebrew JDK
 * in java.json's order (bin/java under each prefix), else plain `java` from the PATH.
 *
 *   import { JAVA } from '../java.mjs';
 *   node tools/java.mjs        prints the one it picks
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const JAVA_CONFIG = JSON.parse(readFileSync(new URL('./java.json', import.meta.url), 'utf8'));

/** PURE (given `env` and `exists`): the java binary to run. */
export function findJava({ env = process.env, exists = existsSync, config = JAVA_CONFIG } = {}) {
  const chosen = String(env?.[config.env] || '').trim();
  if (chosen) return chosen;
  for (const jdk of config.jdks) {
    for (const prefix of config.prefixes) {
      const path = `${prefix}/${jdk}/bin/java`;
      if (exists(path)) return path;
    }
  }
  return config.fallback;
}

export const JAVA = findJava();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JAVA);
