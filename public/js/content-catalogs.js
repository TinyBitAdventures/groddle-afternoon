/**
 * Load mined GSJS content catalogs (quests, achievements, skills, buffs).
 * Browser: fetch assets/content/*.json
 * Node tests: loadFromDir(fs path)
 *
 * The skill catalog also gets Better Learning I to V (better-learning.js,
 * register G62): 2011 skills the late inc_data_skills.js no longer has.
 * The quest catalog also gets our own quests (G1245: Tunes for Crabs, the Vine
 * Radio's, js/vine-radio.js withOursQuests; Back to Gentle Island, a skipped
 * tutorial played later, js/newxp-replay.js withReplayQuest); quests.json keeps
 * Tiny Speck's only.
 */

import { fetchRetry } from './load-retry.js?v=477aa7a7';
import { withBetterLearning } from './better-learning.js?v=044ff9ff';
import { withOursQuests } from './vine-radio.js?v=5436aa09';
import { withReplayQuest } from './newxp-replay.js?v=b2c832ac';

const CACHE = {
  quests: null,
  achievements: null,
  skills: null,
  buffs: null,
  meta: null,
  ready: false,
};

export const CONTENT_BASE = 'assets/content';

/**
 * @param {typeof fetch} [fetchImpl]
 */
export async function loadContentCatalogs(fetchImpl = globalThis.fetch && fetchRetry) {
  if (CACHE.ready) return CACHE;
  const load = async (name) => {
    const res = await fetchImpl(`${CONTENT_BASE}/${name}.json`);
    if (!res.ok) throw new Error(`Failed to load content/${name}.json: ${res.status}`);
    return res.json();
  };
  CACHE.quests = withReplayQuest(withOursQuests(await load('quests')));
  CACHE.achievements = await load('achievements');
  CACHE.skills = withBetterLearning(await load('skills'));
  CACHE.buffs = await load('buffs');
  try {
    CACHE.meta = await load('meta');
  } catch {
    CACHE.meta = null;
  }
  CACHE.ready = true;
  return CACHE;
}

/**
 * Sync load for Node tests.
 * @param {string} dir absolute path to assets/content
 */
export async function loadContentCatalogsFromDir(dir) {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  CACHE.quests = withReplayQuest(withOursQuests(JSON.parse(await readFile(join(dir, 'quests.json'), 'utf8'))));
  CACHE.achievements = JSON.parse(await readFile(join(dir, 'achievements.json'), 'utf8'));
  CACHE.skills = withBetterLearning(JSON.parse(await readFile(join(dir, 'skills.json'), 'utf8')));
  CACHE.buffs = JSON.parse(await readFile(join(dir, 'buffs.json'), 'utf8'));
  try {
    CACHE.meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'));
  } catch {
    CACHE.meta = null;
  }
  CACHE.ready = true;
  return CACHE;
}

export function getQuestCatalog() {
  return CACHE.quests || {};
}

export function getAchievementCatalog() {
  return CACHE.achievements || {};
}

export function getSkillCatalog() {
  return CACHE.skills || {};
}

export function getBuffCatalog() {
  return CACHE.buffs || {};
}

export function getContentMeta() {
  return CACHE.meta;
}

export function isContentReady() {
  return CACHE.ready;
}

/** Test helper */
export function resetContentCatalogs() {
  CACHE.quests = null;
  CACHE.achievements = null;
  CACHE.skills = null;
  CACHE.buffs = null;
  CACHE.meta = null;
  CACHE.ready = false;
}

/**
 * Inject catalogs synchronously (tests / offline).
 */
export function setContentCatalogs({ quests, achievements, skills, buffs, meta }) {
  if (quests) CACHE.quests = quests;
  if (achievements) CACHE.achievements = achievements;
  if (skills) CACHE.skills = skills;
  if (buffs) CACHE.buffs = buffs;
  if (meta) CACHE.meta = meta;
  CACHE.ready = !!(CACHE.quests && CACHE.achievements && CACHE.skills && CACHE.buffs);
}
