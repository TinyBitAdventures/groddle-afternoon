/**
 * LEVEL BUILDER publishing (docs/level-builder/spec.md 11, phase P6): a zone into the game's files,
 * in a local checkout. Never commits, tags, pushes or deploys: Austin commits and the release flow
 * ships it. `cli.mjs publish --dry-run | --write` calls publishZone.
 *
 * 1. The gate. The zone is validated here, against this checkout, with the publish rules on
 *    (NAV-004): no fatal finding and no error; every warning waived in the zone or acknowledged
 *    (`ack`: a fingerprint, a rule id, or "all"); every asset's licence in licence-policy.json with
 *    its provenance complete (AST-004); labels unique against the index (TXT-002). New art must be
 *    at hand (`art`: a folder holding <name>.webp and, if there is one, <name>@1.5x.webp, the files
 *    intake kept), and its sha256 must be the one its provenance names (AST-003). A checkout with
 *    uncommitted changes is refused (publish in a clean worktree), and so is a zone that would take
 *    another published zone's streets or hub.
 * 2. The files. public/assets/zones/<id>.json (the zone without editor state) and the new art, then
 *    everything derived from the published zones (tools/builder/zones.mjs buildZones): street
 *    files, index and ecology rows, the hub map, the ways in on shipped streets, the new art's
 *    provenance. A dry run works the same through an overlay and lists what would change.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR } from '../repos.mjs';
import { loadValidatorContext } from './validator-context.mjs';
import { validateZone } from '../../public/js/builder/validate.js?v=89d70464';
import { buildZones, commitOverlay, files, overlay, publishedZone, sha256, spritesUsed, zoneText, ZONES_DIR, DECO_DIR } from './zones.mjs';

const ID = /^[a-z][a-z0-9-]{2,47}$/;

/** PURE: the warnings a person has not waived or acknowledged. */
export function unacknowledged(findings, ack = []) {
  const all = ack.includes('all');
  return findings.filter((x) => x.severity === 'warn' && !x.waived && !all && !ack.includes(x.fingerprint) && !ack.includes(x.rule));
}

/** The new art a zone's streets use: [name, row]. */
function usedNewArt(zone) {
  const used = spritesUsed(zone);
  return Object.entries(zone.assets || {}).filter(([name, a]) => a?.origin === 'new' && used.has(name));
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** Whether `root` is a git checkout, its uncommitted tracked changes, and HEAD. */
export function checkoutState(root) {
  try {
    const head = git(root, ['rev-parse', 'HEAD']);
    const dirty = git(root, ['status', '--porcelain', '--untracked-files=no']).split('\n').filter(Boolean);
    return { git: true, head, dirty };
  } catch {
    return { git: false, head: null, dirty: [] };
  }
}

/**
 * Publish a zone into the checkout at `root` (dry run unless `write`). Answers
 * { ok, id, refused: [why], report: { counts, findings }, unacked: [findings], changed: [paths],
 *   notes: [lines], wrote }.
 * @param {object} zone the zone document (a draft's rev, or a zone file)
 * @param {{ root?: string, art?: string|null, ack?: string[], write?: boolean, dirtyOk?: boolean, ctx?: object }} [opts]
 */
export function publishZone(zone, { root = GAME_DIR, art = null, ack = [], write = false, dirtyOk = false, ctx = null } = {}) {
  const refused = [];
  const notes = [];
  const id = zone?.id;
  if (!ID.test(String(id || ''))) return { ok: false, id, refused: ['The zone has no id (lowercase letters, digits and dashes).'], report: null, unacked: [], changed: [], notes, wrote: false };

  // New art: the files intake kept, by name, checked against their provenance.
  const assetFiles = new Map();
  const artBytes = new Map();
  const base = files(root);
  for (const [name, row] of usedNewArt(zone)) {
    const fromArt = art ? join(art, `${name}.webp`) : null;
    const shipped = `${DECO_DIR}/${name}.webp`;
    let bytes = null;
    if (fromArt && existsSync(fromArt)) bytes = readFileSync(fromArt);
    else if (base.exists(shipped)) bytes = base.read(shipped);
    if (!bytes) {
      refused.push(`${name}: no file. Give --art <folder> with ${name}.webp (and ${name}@1.5x.webp if it has one), as intake kept it.`);
      continue;
    }
    assetFiles.set(name, { sha256: sha256(bytes) });
    const three = fromArt ? join(art, `${name}@1.5x.webp`) : null;
    artBytes.set(name, { two: bytes, three: three && existsSync(three) ? readFileSync(three) : null });
    void row;
  }

  // The gate: the validator, with the publish rules, against this checkout.
  const context = { ...(ctx || loadValidatorContext({ publish: true, root })), publish: true, assetFiles };
  const report = validateZone(zone, context);
  delete report.reach;
  const blocking = report.findings.filter((x) => !x.waived && (x.severity === 'fatal' || x.severity === 'error'));
  for (const x of blocking) refused.push(`${x.rule} ${x.severity}: ${x.message}`);
  const unacked = unacknowledged(report.findings, ack);
  for (const x of unacked) refused.push(`${x.rule} warning not acknowledged: ${x.message} (--ack ${x.fingerprint}, --ack ${x.rule} or --ack all)`);

  // A clean checkout, and where the draft was made.
  const state = checkoutState(root);
  if (state.git && state.dirty.length && !dirtyOk) refused.push(`The checkout has uncommitted changes (${state.dirty.slice(0, 3).join('; ')}${state.dirty.length > 3 ? ' ...' : ''}). Publish in a clean worktree.`);
  if (zone.baseCommit) {
    let ancestor = null;
    if (state.git) {
      try {
        git(root, ['merge-base', '--is-ancestor', zone.baseCommit, 'HEAD']);
        ancestor = true;
      } catch {
        ancestor = false;
      }
    }
    notes.push(ancestor === false
      ? `The draft was made at ${String(zone.baseCommit).slice(0, 9)}, which is not behind this checkout's HEAD; it was validated again here.`
      : `The draft was made at ${String(zone.baseCommit).slice(0, 9)}.`);
  }

  // The files, through an overlay (so a refusal or a dry run leaves the disk alone).
  const ov = overlay(base);
  const published = publishedZone(zone);
  const zoneFile = `${ZONES_DIR}/${id}.json`;
  if (base.exists(zoneFile)) notes.push(`${zoneFile} is already published: this publish replaces it.`);
  ov.write(zoneFile, zoneText(published));
  for (const [name, b] of artBytes) {
    ov.write(`${DECO_DIR}/${name}.webp`, b.two);
    if (b.three) ov.write(`${DECO_DIR}/${name}@1.5x.webp`, b.three);
  }
  let changed = [];
  try {
    buildZones(ov);
    changed = [...ov.changes.keys()].filter((p) => {
      const v = ov.changes.get(p);
      return v === null ? base.exists(p) : !(base.exists(p) && base.read(p).equals(v));
    }).sort();
  } catch (e) {
    refused.push(e.message);
  }

  const ok = refused.length === 0;
  if (ok && write) commitOverlay(ov, base);
  return { ok, id, refused, report: { counts: report.counts, findings: report.findings }, unacked, changed, notes, wrote: ok && write };
}

/**
 * After a --write: the generators that read the zones' files as Tiny Speck's (the signpost graph),
 * then the content keys (data-versions; module-keys when js/deco-new-list.js changed). Answers the
 * commands run.
 */
export function afterPublish(changed, { root = GAME_DIR, run = (args) => execFileSync(process.execPath, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }) } = {}) {
  const steps = [['tools/build-signpost-graph.mjs'], ['tools/data-versions/build.mjs']];
  if (changed.includes('public/js/deco-new-list.js')) steps.push(['tools/module-keys/build.mjs']);
  const done = [];
  for (const args of steps) {
    run(args);
    done.push(`node ${args.join(' ')}`);
  }
  return done;
}
