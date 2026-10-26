/**
 * Where the game's two sibling repos are checked out.
 *
 * Groddle Afternoon is three repos: this one (the game), the Go realtime
 * server (groddle-afternoon-server) and the Minn theme and extension the site
 * runs (groddle-afternoon-site). The data builders write into the server repo
 * and some tests read the other two. Each is found from an env var, else
 * beside this repo:
 *
 *   GRODDLE_SERVER_DIR   default ../groddle-afternoon-server
 *   GRODDLE_SITE_DIR     default ../groddle-afternoon-site
 *
 * Tests skip with `skipWithoutServer` / `skipWithoutSite` when a checkout is
 * missing; tools that must write into one call `requireServer()` /
 * `requireSite()`, which stop with a hint.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This repo's root (the folder holding public/, tests/ and tools/). */
export const GAME_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The realtime server checkout (TinyBitAdventures/groddle-afternoon-server). */
export const SERVER_DIR = resolve(process.env.GRODDLE_SERVER_DIR || join(GAME_DIR, '..', 'groddle-afternoon-server'));

/** The site checkout (TinyBitAdventures/groddle-afternoon-site): the Minn theme + extension. */
export const SITE_DIR = resolve(process.env.GRODDLE_SITE_DIR || join(GAME_DIR, '..', 'groddle-afternoon-site'));

export const HAS_SERVER = existsSync(join(SERVER_DIR, 'go.mod'));
export const HAS_SITE = existsSync(join(SITE_DIR, 'minn.json'));

/** A path inside the server checkout. */
export const serverPath = (...parts) => join(SERVER_DIR, ...parts);
/** A path inside the site checkout. */
export const sitePath = (...parts) => join(SITE_DIR, ...parts);

const CLONE = {
  server: 'git clone https://github.com/TinyBitAdventures/groddle-afternoon-server ../groddle-afternoon-server',
  site: 'git clone https://github.com/TinyBitAdventures/groddle-afternoon-site ../groddle-afternoon-site',
};

/** A test's `skip` option: false when the server checkout is here, else why it skips. */
export const skipWithoutServer = HAS_SERVER ? false : `needs the realtime server repo at ${SERVER_DIR} (set GRODDLE_SERVER_DIR or ${CLONE.server})`;
/** A test's `skip` option: false when the site checkout is here, else why it skips. */
export const skipWithoutSite = HAS_SITE ? false : `needs the site repo at ${SITE_DIR} (set GRODDLE_SITE_DIR or ${CLONE.site})`;

function need(has, what, dir, clone) {
  if (has) return dir;
  console.error(`${what} not found at ${dir}. Set ${what === 'groddle-afternoon-server' ? 'GRODDLE_SERVER_DIR' : 'GRODDLE_SITE_DIR'}, or: ${clone}`);
  process.exit(1);
}

/** The server checkout, or exit with a hint (for tools that write into it). */
export const requireServer = () => need(HAS_SERVER, 'groddle-afternoon-server', SERVER_DIR, CLONE.server);
/** The site checkout, or exit with a hint (for tools that write into it). */
export const requireSite = () => need(HAS_SITE, 'groddle-afternoon-site', SITE_DIR, CLONE.site);
