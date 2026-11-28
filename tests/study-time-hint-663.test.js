/**
 * #663 (G1244, Austin 2026-11-24, ours): a player asked why a skill took so long to study. Glitch slowed
 * every study by 1.05 for each skill known or queued past brain capacity (skills_get_learning_time_modifier,
 * inc_skills.js:1792; imagination-effects.js learningTimeModifier) and never said so on the skill. The
 * Skills sheet now says it in one line under an open skill whose time is still to be set (not learned,
 * not running), with the real numbers: "Takes 2.5 times as long: you know 19 more skills than your brain
 * holds. Brain Capacity cards help." Modern and Classic share the row (Classic's details are the Modern
 * row's open body, classic-skills.js), so one line serves both, and a phone.
 * Run: node --test tests/study-time-hint-663.test.js
 */
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brainLoadNote } from '../public/js/skills-panel.js?v=e1d891c3';
import { learningTimeModifier } from '../public/js/imagination-effects.js?v=70169933';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('#663: the brain capacity line', () => {
  it('says how much longer and by how many skills, from the real formula', () => {
    assert.equal(brainLoadNote({ count: 39, capacity: 20 }), 'Takes 2.5 times as long: you know 19 more skills than your brain holds. Brain Capacity cards help.');
    assert.equal(learningTimeModifier(39, 20).toFixed(1), '2.5');
    assert.equal(brainLoadNote({ count: 68, capacity: 20 }), `Takes ${learningTimeModifier(68, 20).toFixed(1)} times as long: you know 48 more skills than your brain holds. Brain Capacity cards help.`);
    assert.equal(brainLoadNote({ count: 21, capacity: 20 }), 'Takes 5% longer: you know 1 more skill than your brain holds. Brain Capacity cards help.');
    assert.equal(brainLoadNote({ count: 30, capacity: 20 }), 'Takes 63% longer: you know 10 more skills than your brain holds. Brain Capacity cards help.');
    assert.equal(brainLoadNote({ count: 34, capacity: 20 }), 'Takes 98% longer: you know 14 more skills than your brain holds. Brain Capacity cards help.');
  });

  it('nothing while the brain holds them all, for the very first skill, or with no numbers', () => {
    assert.equal(brainLoadNote({ count: 20, capacity: 20 }), '');
    assert.equal(brainLoadNote({ count: 12, capacity: 20 }), '');
    assert.equal(brainLoadNote({ count: 0, capacity: 0 }), '', 'the first skill is faster (0.15), not slower');
    assert.equal(brainLoadNote(null), '');
    assert.equal(brainLoadNote(undefined), '');
  });

  it('plain words: no em dash', () => {
    assert.doesNotMatch(brainLoadNote({ count: 50, capacity: 20 }), /—/);
  });

  it('wired: the open row (not learned, not running), the feature\'s count (known + queued), game.js', () => {
    const panel = read('public/js/skills-panel.js');
    assert.match(panel, /const brain = entry\.status === 'learned' \|\| entry\.status === 'studying' \? '' : brainLoadNote\(ctx\.brainLoad\?\.\(\)\);\n\s+if \(brain\) body\.appendChild\(el\('p', 'skill-brain-note', brain\)\);/);
    const feature = read('public/js/features/imagination-feature.js');
    assert.match(feature, /skillBrainLoad\(engine\) \{\n\s+const learned = engine\?\.learnedSkills \|\| \[\];\n\s+const queued = Object\.keys\(engine\?\.skillQueue \|\| \{\}\)\.length;\n\s+return \{ count: learned\.length \+ queued, capacity: state\.brainCapacity \};/);
    assert.match(read('public/game.js'), /brainLoad: \(\) => features\.query\('skillBrainLoad', engine\),/);
    assert.match(read('public/style.css'), /\.skill-brain-note \{/);
  });
});

let chromium = null;
try { chromium = (await import('playwright')).chromium; } catch { /* no Playwright */ }

describe('#663 in Chrome: the line reads in Modern, Classic and on a phone', { skip: !chromium && 'no playwright' }, () => {
  const LOCK_WAIT_MS = 30 * 60_000;
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  let server = null;
  let chrome = null;
  beforeAll(async () => {
    const { openBrowser } = await import('../tools/qa/browser.mjs');
    const { startServer } = await import('../tools/qa/serve.mjs');
    chrome = await openBrowser({ label: 'study-time-hint-663 test', waitMs: LOCK_WAIT_MS });
    server = await startServer({ root: join(root, 'public') });
  }, { timeout: LOCK_WAIT_MS + 60_000 });
  afterAll(async () => {
    await chrome?.close();
    await server?.stop();
  });

  it('a save with 39 skills known: Modern 1536x702, Classic 1536x702, a phone 375x667', { timeout: 300_000 }, async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const booted = (tab) => tab.waitForFunction(() => !document.body.classList.contains('is-booting') && document.getElementById('overlay')?.classList.contains('hidden'), null, { timeout: 60_000 });
    const seen = {};
    for (const [name, viewport, ui, phone] of [['modern', { width: 1536, height: 702 }, 'modern', false], ['classic', { width: 1536, height: 702 }, 'classic', false], ['phone', { width: 375, height: 667 }, 'modern', true]]) {
      const opts = { viewport, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: UA } : {}) };
      // A first visit makes the save; thirty more first-rank skills go into it for the second.
      const first = await chrome.browser.newContext(opts);
      if (phone) await first.addInitScript(() => localStorage.setItem('groddle-play-device', 'qa-game'));
      const t1 = await first.newPage();
      await t1.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0`);
      await booted(t1);
      await t1.waitForTimeout(2500);
      const save = await t1.evaluate(async () => {
        const cat = await (await fetch('/assets/content/skills.json')).json();
        const ids = Object.keys(cat.skills || cat).filter((id) => /_1$/.test(id)).slice(0, 30);
        const s = JSON.parse(localStorage.getItem('groddle_player_state_v1'));
        s.systems.skills.learned = [...new Set([...(s.systems.skills.learned || []), ...ids])];
        return JSON.stringify(s);
      });
      await first.close();
      const known = JSON.parse(save).systems.skills.learned.length;
      const ctx = await chrome.browser.newContext(opts);
      await ctx.addInitScript(([s, p]) => {
        if (!sessionStorage.getItem('seeded')) {
          sessionStorage.setItem('seeded', '1');
          localStorage.setItem('groddle_player_state_v1', s);
        }
        if (p) localStorage.setItem('groddle-play-device', 'qa-game');
      }, [save, phone]);
      const tab = await ctx.newPage();
      await tab.goto(`${base}/play/?autostart=1&questoffer=off&hstip=0&ui=${ui}`);
      await booted(tab);
      await tab.waitForTimeout(1000);
      await tab.evaluate(() => window.groddleQA?.open?.('skills') ?? document.getElementById('skills-btn')?.click());
      await tab.waitForFunction(() => document.getElementById('skills-panel') && !document.getElementById('skills-panel').hidden);
      const r = await tab.evaluate(async () => {
        if (document.documentElement.dataset.ui === 'classic') document.querySelector('.classic-skills [data-skill], [data-classic-skills] [data-skill]')?.click();
        else document.querySelector('#skills-body .skill-row.is-available .skill-row-head')?.click();
        await new Promise((d) => setTimeout(d, 600));
        const note = document.querySelector('#skills-body .skill-row.is-open .skill-brain-note');
        if (!note) return null;
        note.scrollIntoView({ block: 'center' });
        const box = note.getBoundingClientRect();
        const body = note.closest('.skill-row-body').getBoundingClientRect();
        const cs = getComputedStyle(note);
        return { text: note.textContent, w: box.width, h: box.height, inside: box.left >= body.left - 1 && box.right <= body.right + 1, inView: box.top >= 0 && box.bottom <= innerHeight, size: parseFloat(cs.fontSize), hidden: cs.visibility !== 'visible' || cs.display === 'none' };
      });
      await ctx.close();
      seen[name] = { known, ...r };
    }
    for (const [name, r] of Object.entries(seen)) {
      assert.ok(r.text, `${name}: the line shows (${JSON.stringify(r)})`);
      assert.equal(r.text, brainLoadNote({ count: r.known, capacity: 20 }), `${name}: the real numbers`);
      assert.ok(r.w > 100 && r.h > 0 && r.inside && r.inView && !r.hidden, `${name}: inside the skill's body, on screen (${JSON.stringify(r)})`);
      assert.ok(r.size >= 11, `${name}: readable type (${r.size}px)`);
    }
  });
});
