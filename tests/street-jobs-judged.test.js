/**
 * The last four street_project rows the inventory could not classify, judged
 * by hand in tools/inventory/overrides.json (G15). This pins the verdicts and,
 * where the archived sources are on this machine, the source facts they rest on:
 *   645                                unbuilt_original: no street_info, never offered at shutdown
 *   job_standard1_for_new_streets      an empty jobs_init stub keyed by a class id, not a job
 *   job_standard1_for_street_upgrades  the same, on Clamber Crag
 *   166 (Seldom Squish)                done in the original before seed_grain was deleted
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { judgeJobs } from '../tools/inventory/detectors.mjs';
import { closedStreets, initializeStreetJobs, normalizeStreetJobState } from '../public/js/street-jobs.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const overrides = JSON.parse(readFileSync(join(spike, 'tools/inventory/overrides.json'), 'utf8'));
const sj = JSON.parse(readFileSync(join(spike, 'public/assets/content/street-jobs.json'), 'utf8'));
const AUDIT = join(homedir(), 'Documents/glitch-audit');
const XML = process.env.GRODDLE_LOCATION_XML || join(AUDIT, 'streets/mnt/stos/location_data');
const GSJS = join(AUDIT, 'glitch-GameServerJS');
const haveXml = existsSync(join(XML, 'LA9GT0J87H92MPR.xml'));
const haveGsjs = existsSync(join(GSJS, 'locations/inc_jobs.js'));

const VERDICTS = {
  645: 'unbuilt_original',
  job_standard1_for_new_streets: 'excluded',
  job_standard1_for_street_upgrades: 'excluded',
  166: 'excluded',
};

/** The body of one job id directly under a location's jobs block. */
function jobBody(tsid, id) {
  const xml = readFileSync(join(XML, `${tsid}.xml`), 'utf8');
  const at = xml.indexOf('<object id="jobs">');
  const indent = xml.slice(xml.lastIndexOf('\n', at) + 1, at);
  const block = xml.slice(at, xml.indexOf(`\n${indent}</object>`, at));
  const open = `\n${indent}\t<object id="${id}">`;
  const start = block.indexOf(open);
  if (start < 0) return null;
  const end = block.indexOf(`\n${indent}\t</object>`, start);
  return block.slice(start + open.length, end);
}

describe('street projects judged by hand (G15)', () => {
  it('overrides.json carries each verdict with source evidence', () => {
    for (const [id, status] of Object.entries(VERDICTS)) {
      const o = overrides[`street_project:${id}`];
      assert.ok(o, `street_project:${id} override`);
      assert.equal(o.status, status, id);
      assert.equal(o.register, 'G15', id);
      assert.match(o.reason, /\.(js|xml):\d+/, `${id} cites file:line`);
    }
  });

  it('the detector leaves them unknown / missing, so only the overrides decide', () => {
    const rows = judgeJobs({ jobIds: Object.keys(VERDICTS), jobs: sj.jobs, excluded: sj.excluded });
    const by = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    assert.equal(by['166'], 'missing');
    for (const id of ['645', 'job_standard1_for_new_streets', 'job_standard1_for_street_upgrades']) assert.equal(by[id], 'unknown', id);
  });

  it('none of them closes a road: Seldom Squish and Samak Shun stay open as at shutdown', () => {
    for (const id of Object.keys(VERDICTS)) assert.equal(sj.jobs[id], undefined, `${id} is not a playable job`);
    const state = normalizeStreetJobState({});
    initializeStreetJobs(state, []);
    const closed = closedStreets(state, sj);
    assert.ok(closed.includes(sj.jobs['644'].street), 'a fresh game still closes Dunlin Roble (job 644)');
    assert.ok(!closed.includes('GLI57G8I2HI1CSO'), 'Seldom Squish open');
    assert.ok(!closed.includes('GA9GT0J87H92MPR'), 'Samak Shun open');
    assert.match(sj.excluded['166'].reason, /seed_grain/);
  });

  it('the class-keyed rows are empty stubs; the classes\' real jobs are counted under their own ids', { skip: !haveXml && 'location XML not on this machine' }, () => {
    for (const tsid of ['LCR101UN0NJ1QPQ', 'LCR10NQRPKJ16H6', 'LLI1BQA9PUH16A0']) assert.equal(jobBody(tsid, 'job_standard1_for_new_streets').trim(), '', tsid);
    assert.equal(jobBody('LCR1OU9H34K19OE', 'job_standard1_for_street_upgrades').trim(), '', 'Clamber Crag');
    // Real upgrade jobs of job_standard1_for_street_upgrades: excluded as already upgraded.
    for (const id of ['3', '4', '6', '8', '10', '12', '40', '55', '73']) assert.match(sj.excluded[id]?.reason || '', /^already upgraded/, id);
    // Middle Arbor's own job 4 uses the class under a numeric id.
    assert.match(jobBody('LCR101UN0NJ1QPQ', '4'), /<str id="class_id">job_standard1_for_street_upgrades<\/str>/);
    const playable = Object.values(sj.jobs).filter((j) => (j.phases || []).some((p) => p.classTsid === 'job_standard1_for_new_streets'));
    assert.equal(playable.length, 21);
  });

  it('645 has phases but no street_info on either street, and both streets are unlocked', { skip: !haveXml && 'location XML not on this machine' }, () => {
    for (const tsid of ['LA95G0P137927B4', 'LA9GT0J87H92MPR']) {
      const body = jobBody(tsid, '645');
      assert.ok(body, tsid);
      assert.match(body, /<object id="class_ids">/, tsid);
      assert.doesNotMatch(body, /street_info/, tsid);
      assert.match(readFileSync(join(XML, `${tsid}.xml`), 'utf8'), /<bool id="jobs_is_locked">false<\/bool>/, tsid);
    }
    assert.match(jobBody('LA95G0P137927B4', '645'), /<objref id="instance" tsid="QA9NNJ98RNA2G5P"\/>/, 'started once');
  });

  it('GSJS: no street_info means never listed; jobs_init makes the stubs', { skip: !haveGsjs && 'GSJS not on this machine' }, () => {
    const lines = readFileSync(join(GSJS, 'locations/inc_jobs.js'), 'utf8').split('\n');
    assert.match(lines[2], /if \(!this\.jobs\[id\]\) this\.jobs\[id\] = \{\};/);
    assert.match(lines[406], /function jobs_get_all/);
    assert.match(lines[410], /if \(!this\.jobs\[id\]\.class_ids\) continue;/);
    assert.match(lines[411], /if \(!this\.jobs\[id\]\.street_info\) continue;/);
  });

  it('166: Seldom Squish was built; seed_grain was deleted before shutdown', { skip: (!haveGsjs || !haveXml) && 'sources not on this machine' }, () => {
    assert.match(readFileSync(join(XML, 'LLI57G8I2HI1CSO.xml'), 'utf8'), /<bool id="jobs_is_locked">false<\/bool>/);
    const spirit = jobBody('LLICF642CTI16R1', '166');
    assert.equal((spirit.match(/<objref id="instance"/g) || []).length, 4, 'all four phases started on Peatland Moors');
    assert.ok(!existsSync(join(GSJS, 'items/seed_grain.js')));
    const tags = readFileSync(join(GSJS, 'items/catalog_tags.js'), 'utf8');
    const deleted = tags.slice(tags.indexOf('"deleted" : ['), tags.indexOf('],', tags.indexOf('"deleted" : [')));
    assert.match(deleted, /'seed_grain'/);
    assert.match(readFileSync(join(GSJS, 'quests/job_standard1b_for_new_groddle_meadow_streets.js'), 'utf8'), /"class_id"\s*:\s*"seed_grain"/);
  });
});
