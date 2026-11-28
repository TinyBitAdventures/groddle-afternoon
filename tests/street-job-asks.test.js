/**
 * G1073 (chat 2026-11-20): players at Hazy Gate 5's board (job 552) read "needs Master Chef II" on a
 * work step that had not opened as a rule for joining. Austin's ruling (option A, explain the board):
 * one line saying anyone can give items and skills are only for tool work, each item ask links to
 * where the item comes from (the item's Encyclopedia page, as the pack's item card does), and a work
 * row names its skill only once that step is open (G802, approved later, names it on a locked step too,
 * marked when you don't know it). Glitch: items need no skill (quest.js 1471), tool
 * work needs the tool and the skill (quest.js 942-986, 1489).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeStreetJobState, phaseRequirements } from '../public/js/street-jobs.js?v=76471e42';
import { ITEM_GET_ANCHOR, JOB_ASK_TEXT, itemAskSubject, itemGetHref, showAskRule, workSkillMissing, workSkillNote } from '../public/js/street-job-asks.js?v=32adbe89';

import { streetJobsFeature, projectApi } from '../public/js/features/street-jobs-feature.js?v=7f778c85';
import { createToolConditionState } from '../public/js/tools.js?v=4156bba8';
import { Display, FakeEl, fakePixi } from './fake-scene.js';

const root = join(import.meta.dirname, '..');
const catalog = JSON.parse(readFileSync(join(root, 'public/assets/content/street-jobs.json'), 'utf8'));
const feature = readFileSync(join(root, 'public/js/features/street-jobs-feature.js'), 'utf8');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const label = (id) => ({ saucery_2: 'Saucery II', masterchef_2: 'Master Chef II', masterchef_1: 'Master Chef I' })[id] || id;

describe('G1073: the street project board explains who can give what', () => {
  const reqs = phaseRequirements(normalizeStreetJobState({}), catalog, '552');

  it('Hazy Gate 5 opens on plain vegetables; its work steps are locked', () => {
    const open = reqs.filter((r) => r.open);
    assert.ok(open.length >= 3);
    assert.ok(open.every((r) => r.type === 'item' && !r.skill));
    assert.deepEqual(reqs.filter((r) => r.type === 'work').map((r) => [r.skill, r.open]), [['saucery_2', false], ['masterchef_2', false]]);
  });

  it('G802: every work step not done names its skill, a locked one too, and says when you lack it', () => {
    assert.deepEqual(reqs.filter((x) => x.type === 'work').map((r) => workSkillNote(r, label)), ['needs Saucery II', 'needs Master Chef II']);
    const work = reqs.find((r) => r.skill === 'masterchef_2');
    assert.equal(work.open, false);
    assert.equal(workSkillNote(work, label, []), "needs Master Chef II, you don't know it yet");
    assert.equal(workSkillNote(work, label, ['masterchef_2']), 'needs Master Chef II');
    assert.equal(workSkillMissing(work, []), true);
    assert.equal(workSkillMissing(work, ['masterchef_2']), false);
    assert.equal(workSkillNote({ ...work, open: true }, label), 'needs Master Chef II');
    assert.equal(workSkillNote({ ...work, open: true, skill: 'masterchef_1', skillWas: 'masterchef_2' }, label, []), "needs Master Chef I (II further out), you don't know it yet");
    assert.equal(workSkillNote({ ...work, open: true, skill: '', skillWas: 'masterchef_2' }, label), JOB_ASK_TEXT.noSkillNearStart);
    assert.equal(workSkillNote({ ...work, open: false, skill: '', skillWas: 'masterchef_2' }, label, []), JOB_ASK_TEXT.noSkillNearStart);
    assert.equal(workSkillMissing({ ...work, skill: '', skillWas: 'masterchef_2' }, []), false);
    assert.equal(workSkillNote({ ...work, open: true, done: true }, label, []), '');
    assert.equal(workSkillMissing({ ...work, done: true }, []), false);
    assert.equal(workSkillNote(reqs.find((r) => r.type === 'item'), label, []), '');
  });

  it('the rule line: plain, short, shown while the project takes items or work', () => {
    assert.equal(JOB_ASK_TEXT.rule, 'Anyone can give items. Skills are only needed for tool work.');
    for (const t of Object.values(JOB_ASK_TEXT)) assert.doesNotMatch(typeof t === 'function' ? t() : t, /[–—]/);
    assert.equal(showAskRule(reqs, true), true);
    assert.equal(showAskRule(reqs, false), false);
    assert.equal(showAskRule(reqs.map((r) => ({ ...r, done: true })), true), false);
    assert.equal(showAskRule([{ type: 'currants', done: false }], true), false);
  });

  it('each open item ask goes to its Encyclopedia page at How to get it', () => {
    const zucchini = reqs.find((r) => r.classId === 'zucchini');
    assert.deepEqual(itemAskSubject(zucchini, () => 'Zucchini'), { id: 'zucchini', name: 'Zucchini' });
    assert.equal(itemAskSubject({ ...zucchini, done: true }), null);
    assert.equal(itemAskSubject(reqs.find((r) => r.type === 'work')), null);
    assert.equal(itemGetHref('https://x.test/encyclopedia/items/zucchini/'), `https://x.test/encyclopedia/items/zucchini/${ITEM_GET_ANCHOR}`);
    assert.equal(itemGetHref(''), '');
    // The anchor is the item page's "In the remake" heading, where How to get it is.
    const page = readFileSync(join(root, 'public/encyclopedia/items/zucchini/index.html'), 'utf8');
    assert.match(page, new RegExp(`id="${ITEM_GET_ANCHOR.slice(1)}"`));
    const after = page.slice(page.indexOf(`id="${ITEM_GET_ANCHOR.slice(1)}"`));
    assert.match(after.slice(0, 2000), /How to get it/);
  });

  it('the board (solo and shared, one renderPanel) uses them; the old always-on skill line is gone', () => {
    assert.doesNotMatch(feature, /else if \(r\.skill\) meta\.push\(`needs /);
    assert.match(feature, /const skillNote = workSkillNote\(r, skillLabel, ctx\.learned \|\| \[\]\);/);
    assert.match(feature, /sj-skill\$\{workSkillMissing\(r, ctx\.learned\) \? ' is-missing' : ''\}/);
    assert.match(feature, /<p class="sj-rule" data-sj-rule hidden><\/p>\s*<ul class="sj-reqs" data-sj-reqs><\/ul>/);
    assert.match(feature, /rule\.hidden = !showAskRule\(reqs, open\);/);
    assert.match(feature, /const getLink = askGetLink\(engine, itemAskSubject\(r, itemLabel\)\);/);
    assert.match(feature, /a\.href = itemGetHref\(a\.href\);/);
    // The link is the game's own Encyclopedia link (js/encyclopedia-links.js), handed to features by the engine.
    assert.match(game, /encyclopediaLink: \(subject, className = ''\) => encyclopedia\.link\(document, subject, className\),/);
    assert.match(game, /encyclopediaLoad: \(\) => encyclopedia\.load\(\),/);
  });
});

describe('G1073: Hazy Gate 5\'s board as drawn, solo and online', () => {
  const HAZY = '552';
  let engine;
  const saved = {};
  const linked = [];
  before(async () => {
    for (const k of ['document', 'window', 'fetch', 'PIXI']) saved[k] = globalThis[k];
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    const body = new FakeEl('body');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    globalThis.PIXI = fakePixi;
    globalThis.fetch = async (url) => {
      const rel = String(url).split('?')[0].replace(/^\//, '');
      try {
        return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(root, 'public', rel), 'utf8')) };
      } catch {
        return { ok: false, status: 404, json: async () => null };
      }
    };
    engine = {
      mode: 'solo', PIXI: fakePixi, entityLayer: new Display(), fxLayer: new Display(),
      streetTsid: catalog.jobs[HAZY].connecting[0], street: { tsid: catalog.jobs[HAZY].connecting[0] }, player: { x: 500, y: 800 },
      interactables: [], inv: {}, pc: { level: 1, energy: 100, mood: 100, currants: 0 }, learnedSkills: [], unlockedAchievements: [],
      param: () => null, placement: () => [], toolState: createToolConditionState(), query: () => null, register: (t) => t,
      say() {}, setData() {}, toast() {}, prompt() {}, pushActivity() {}, floatText() {}, updateHud() {}, refreshPack() {}, playSound() {},
      award() {}, save() {}, achievement() {}, grantAchievement() {},
      // The game's Encyclopedia link (game.js engine.encyclopediaLink): an item with a page gets one.
      encyclopediaReady: true,
      encyclopediaLink: (subject, className) => {
        linked.push(subject.id);
        const a = new FakeEl('a');
        a.className = `ency-link ${className}`;
        a.href = `https://groddle.localhost/encyclopedia/items/${subject.id}/`;
        a.textContent = 'In the Encyclopedia';
        return a;
      },
    };
    streetJobsFeature.init(engine);
    streetJobsFeature.restore({}, engine);
    await projectApi.ready();
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  for (const mode of ['solo', 'multiplayer']) {
    it(`${mode}: the rule line, the locked work's skills marked as not known (G802), a way to each vegetable`, () => {
      engine.mode = mode;
      streetJobsFeature.restore({}, engine);
      linked.length = 0;
      projectApi.open(engine, HAZY);
      const nodes = globalThis.document.body.all();
      const texts = nodes.map((n) => n.textContent).filter(Boolean);
      const rule = nodes.find((n) => n.textContent === JOB_ASK_TEXT.rule);
      assert.ok(rule && !rule.hidden, 'the rule line shows');
      // G802: the locked work rows name their skills, marked for a player who knows neither.
      const skills = nodes.filter((n) => n.dataset?.sjSkill);
      // Solo eases them a level this close to the start (#425: "Saucery I (II further out)").
      const lvl = mode === 'solo' ? 1 : 2;
      assert.deepEqual(skills.map((n) => n.dataset.sjSkill), [`saucery_${lvl}`, `masterchef_${lvl}`]);
      for (const n of skills) {
        assert.match(n.textContent, /^needs (Saucery|Master ?Chef)/i);
        assert.match(n.textContent, /, you don't know it yet$/);
        assert.match(n.className, /\bis-missing\b/);
      }
      assert.ok(texts.some((t) => t.includes('opens after the earlier steps')));
      const links = nodes.filter((n) => n.dataset?.sjGet);
      assert.deepEqual(links.map((a) => a.dataset.sjGet).sort(), ['broccoli', 'cabbage', 'corn', 'onion', 'rice', 'zucchini']);
      for (const a of links) {
        assert.equal(a.textContent, JOB_ASK_TEXT.getIt);
        assert.equal(a.href, `https://groddle.localhost/encyclopedia/items/${a.dataset.sjGet}/${ITEM_GET_ANCHOR}`);
      }
    });
  }

  it('a skill you know is named without the mark', () => {
    engine.mode = 'solo';
    engine.learnedSkills = ['saucery_1', 'masterchef_1'];
    streetJobsFeature.restore({}, engine);
    projectApi.open(engine, HAZY);
    const skills = globalThis.document.body.all().filter((n) => n.dataset?.sjSkill);
    engine.learnedSkills = [];
    assert.equal(skills.length, 2);
    for (const n of skills) {
      assert.doesNotMatch(n.textContent, /don't know/);
      assert.doesNotMatch(n.className, /is-missing/);
    }
  });

  it('the work step names its skill once it opens', () => {
    engine.mode = 'solo';
    streetJobsFeature.restore({}, engine);
    const { state } = streetJobsFeature._state();
    const src = catalog.classes[catalog.jobs[HAZY].phases[0].classTsid].requirements;
    state.jobs[HAZY] = { phase: 0, got: Object.fromEntries(src.filter((r) => r.group === 1 && r.bucket === '1').map((r) => [r.id, r.num])), mine: {}, startedAt: 1 };
    projectApi.open(engine, HAZY);
    const texts = globalThis.document.body.all().map((n) => n.textContent).filter(Boolean);
    assert.ok(texts.some((t) => /needs saucery/i.test(t)), 'the open step says what it needs');
    assert.ok(texts.some((t) => t.includes('opens after the earlier steps')), 'the other bucket\'s step is still locked');
  });
});
