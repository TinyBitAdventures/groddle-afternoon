/**
 * Street project text (Austin 2026-11-01): finishing "Create a new street in Fairgower Lane" showed
 * "Your contributions: 1. {job_location}: You contributed 28% of the work!". The source fills its
 * placeholders in quests/quest.js expandText 232-264 ({pc_label}, {job_phase}, {job_phase_label},
 * {job_location}, {job_performance}, {job_participation}); the contributions list is
 * players/inc_jobs.js jobs_familiar_job_complete_do 485-499. No text a player sees from a street
 * project, a group hall or a quest may keep a {placeholder} or a raw &amp;.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { contributionsText, jobText, phaseName, plainText } from '../public/js/street-jobs.js?v=0235351c';
import { cleanQuestMarkup } from '../public/js/quests.js?v=282e1621';

const root = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));
const quests = JSON.parse(readFileSync(join(root, 'public/assets/content/quests.json'), 'utf8'));
const LEFT = /\{[a-z_]+\}|&amp;/;

function jobs() {
  return [
    ...Object.entries(catalog.jobs).map(([id, job]) => ({ id, job, classes: catalog.classes })),
    ...Object.entries(catalog.halls?.jobs || {}).map(([id, job]) => ({ id, job, classes: { ...catalog.classes, ...catalog.halls.classes } })),
  ];
}

describe('Job and quest text keeps no placeholders', () => {
  it('fills every placeholder quest.js expandText knows', () => {
    const text = jobText('{pc_label}: {job_location}, the {job_phase} phase ({job_phase_label}), {job_performance} place, {job_participation}%', {
      pcLabel: 'Ada', location: 'Fairgower Lane', phase: 'second', phaseLabel: 'Lay a Nice Foundation', performance: '2nd', participation: 28,
    });
    assert.equal(text, 'Ada: Fairgower Lane, the second phase (Lay a Nice Foundation), 2nd place, 28%');
    // quest.js 255-256: first place drops {job_performance} and its space.
    assert.equal(jobText('You came {job_performance} place.', {}), 'You came place.');
    assert.doesNotMatch(jobText('{job_location} {job_participation}'), /\{/);
  });

  it('Fairgower Lane\'s one-phase project: no number and no raw name, just your share', () => {
    const [{ job, classes }] = jobs().filter((j) => j.job.label === 'Fairgower Lane');
    assert.equal(job.phases.length, 1);
    assert.equal(classes[job.phases[0].classTsid].title, '{job_location}');
    assert.equal(phaseName(job, job.phases[0], classes[job.phases[0].classTsid]), 'Fairgower Lane');
    const text = contributionsText(job, { classes }, { mine: () => true, share: () => 28 });
    assert.equal(text, 'You contributed 28% of the work!');
    assert.equal(contributionsText(job, { classes }, { mine: () => false, share: () => 0 }), 'You did not contribute.');
  });

  it('a project of several phases names each one by its label, decoded', () => {
    const { job, classes } = jobs().find((j) => j.job.phases.length > 2 && j.job.phases.some((p) => /&amp;/.test(p.label)));
    const text = contributionsText(job, { classes }, { mine: (p) => p === job.phases[0], share: () => 50 });
    assert.match(text, /^1\. [^:]+: You contributed 50% of the work! 2\. [^:]+: You did not contribute\./);
    assert.doesNotMatch(text, LEFT);
  });

  it('every project\'s titles, phase names, descriptions, completion and contributions read clean', () => {
    let checked = 0;
    for (const { id, job, classes } of jobs()) {
      const vars = { location: job.label, participation: 12 };
      const strings = [job.title, job.desc, contributionsText(job, { classes }, { mine: () => true, share: () => 12 })];
      for (const p of job.phases || []) {
        const def = classes[p.classTsid];
        strings.push(phaseName(job, p, def));
        if (p.delayText) strings.push(plainText(jobText(p.delayText, vars)));
        if (def) strings.push(plainText(jobText(def.desc, vars)), plainText(jobText(def.completion, vars)), plainText(jobText(def.title, vars)));
      }
      for (const s of strings) {
        assert.doesNotMatch(String(s || ''), LEFT, `${id}: ${s}`);
        checked += 1;
      }
    }
    assert.ok(checked > 3000, `checked ${checked}`);
  });

  it('every quest the game offers reads clean once its markup is cleaned', () => {
    for (const def of Object.values(quests)) {
      for (const field of ['title', 'desc', 'offer', 'completion']) {
        const text = cleanQuestMarkup(def[field] || '');
        // Street project classes in quests.json are never offered as quests (build-quests.mjs excluded:job).
        if (/^job_/.test(def.classTsid)) continue;
        assert.doesNotMatch(text, /\{[a-z_]+\}/, `${def.classTsid}.${field}`);
      }
      for (const r of def.requirements || []) assert.doesNotMatch(String(r.desc || ''), /\{[a-z_]+\}/, `${def.classTsid} ${r.id}`);
    }
  });

  it('the feature builds its cards from these helpers', () => {
    const feature = readFileSync(join(root, 'public/js/features/street-jobs-feature.js'), 'utf8');
    assert.match(feature, /const contributions = contributionsText\(job, catalog,/);
    assert.doesNotMatch(feature, /\$\{p\.label \|\| catalog\.classes/);
    assert.doesNotMatch(feature, /\$\{(next|upcoming)\?\.label/);
  });
});
