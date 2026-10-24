/**
 * Read the Ur subway out of the GSJS source (register row G115), for
 * tools/build-subway.mjs and tests/subway.test.js. Text only: the object
 * literal is turned into JSON (comments, quotes, bare keys, trailing commas),
 * never evaluated.
 *
 * - config_prod.js `transit_instances.subway_1`: fare, line names, template,
 *   capacities, timeouts, map image urls and the 12 stations (name, tsid,
 *   previous_stop / next_stop, connects_to, x, y, map_pos).
 * - inc_data_maps_prod.js: each station's and the train's own name and hub
 *   (the hub block it is listed under).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GSJS = join(spike, '..', 'glitch-GameServerJS');

/** The JS object literal that starts at `start` (an opening brace), by brace depth outside strings. */
function literalAt(text, start) {
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '/' && text[i + 1] === '/') i = text.indexOf('\n', i) - 1;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('unterminated object literal');
}

/** A plain GSJS data literal (no functions or expressions) as a JSON value. */
export function literalToJson(src) {
  // Strings become JSON strings and comments go, then bare keys get quotes and trailing commas drop.
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let s = '';
      for (i += 1; i < src.length && src[i] !== c; i += 1) s += src[i] === '\\' ? src[(i += 1)] : src[i];
      out += JSON.stringify(s);
    } else if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i) - 1;
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i) + 1;
    } else {
      out += c;
    }
  }
  out = out
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*|\d+)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(out);
}

export function readTransitInstances(gsjs = GSJS) {
  const text = readFileSync(join(gsjs, 'config_prod.js'), 'utf8');
  const at = text.indexOf('var transit_instances = {');
  if (at < 0) throw new Error('config_prod.js: no transit_instances');
  return literalToJson(literalAt(text, text.indexOf('{', at)));
}

/** { tsid: { label, hubId } } for the given tsids from inc_data_maps_prod.js. */
export function readMapLabels(tsids, gsjs = GSJS) {
  const lines = readFileSync(join(gsjs, 'inc_data_maps_prod.js'), 'utf8').split('\n');
  const want = new Set(tsids);
  const out = {};
  let hub = null;
  for (const line of lines) {
    const head = /^\t\t\t"(\d+)"\t: \{/.exec(line);
    if (head) hub = head[1];
    const row = /^\t\t\t\t"([A-Z0-9]+)"\t+: "([^"]*)"/.exec(line);
    if (row && want.has(row[1]) && !out[row[1]]) out[row[1]] = { label: row[2], hubId: hub };
  }
  return out;
}
