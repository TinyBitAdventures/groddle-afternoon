/**
 * Deco art audit (tools/deco-audit): every shipped street deco PNG was compared with the
 * Tiny Speck SWF the street bundle embeds for it. Decos the audit still flags must carry a
 * written verdict, and every re-rendered deco must still be the file the audit fixed.
 * Run: node --test tests/deco-audit.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decoDir = join(root, 'public/assets/decos/groddle');
const report = JSON.parse(readFileSync(join(root, 'tools/deco-audit/report.json'), 'utf8'));
const verdicts = JSON.parse(readFileSync(join(root, 'tools/deco-audit/verdicts.json'), 'utf8'));
const { flag } = verdicts.rule;

const flagged = (r) => r.status === 'scored'
  && (Math.max(r.missing, r.extra) >= flag.missing_or_extra || r.colour >= flag.colour);
const pngSize = (file) => {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('deco art audit', () => {
  it('scored every shipped deco that has a Tiny Speck SWF', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/assets/decos/manifest.json'), 'utf8'));
    const rows = new Map(report.decos.map((r) => [r.name, r]));
    for (const name of manifest) {
      if (!existsSync(join(decoDir, `${name}.png`))) continue;
      const r = rows.get(name);
      assert.ok(r, `${name} missing from report.json`);
      assert.ok(r.status === 'scored' || r.status === 'no-swf', `${name}: ${r.status}`);
    }
    assert.ok(report.summary.scored >= 2700);
  });

  it('leaves no flagged deco without a verdict (the broken list is empty)', () => {
    const open = report.decos.filter(flagged)
      .filter((r) => !verdicts.kept[r.name] && !verdicts.fixed[r.name])
      .map((r) => r.name);
    assert.deepEqual(open, []);
  });

  it('explains every deco it keeps as it is', () => {
    for (const [name, v] of Object.entries(verdicts.kept)) {
      assert.ok(['fine', 'ambiguous'].includes(v.verdict), name);
      assert.ok(String(v.reason || '').length > 20, `${name} needs a reason`);
    }
  });

  it('keeps every re-rendered deco: same size as before, same bytes as the fix', () => {
    const fixed = Object.entries(verdicts.fixed);
    assert.ok(fixed.length >= 150);
    for (const [name, f] of fixed) {
      const file = join(decoDir, `${name}.png`);
      assert.ok(existsSync(file), name);
      assert.deepEqual(pngSize(file), f.size, `${name} size changed (decos are drawn stretched to w x h)`);
      const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
      assert.equal(sha, f.sha256, `${name} is no longer the audited render`);
      assert.ok(f.cause && f.swf, name);
    }
  });

  it('fixed decos now match their SWF', () => {
    const rows = new Map(report.decos.map((r) => [r.name, r]));
    for (const name of Object.keys(verdicts.fixed)) {
      const r = rows.get(name);
      assert.ok(r && r.status === 'scored', name);
      // Hairline art (thin tubes, seams) moves a few edge pixels between the 2x audit render and the fix render.
      assert.ok(Math.max(r.missing, r.extra) < 0.12 && r.colour < 0.12, `${name} still differs from its SWF`);
    }
  });
});
