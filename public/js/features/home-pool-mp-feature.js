/**
 * The Magic Rock's daily iMG between real players (register G201): in
 * multiplayer the rock on your home street hands over what your visitors
 * did there the game day before, from the site's pool
 * (groddle-afternoon-site src/HomePool.php; rules and sources in
 * js/home-pool-mp.js), not the solo stipend alone.
 *
 * homes-feature asks two hooks: homeImgPool (what the rock has for you now:
 * a number, 0 until the site has answered) and homeImgCollect (the
 * hand-over: a Promise of the iMG to put in the save, after the site has
 * marked the game day cashed). Everything else in the rock (the bubble, the
 * line, the daily_img counters, the save) is homes-feature's own.
 *
 * Multiplayer only (engine.mode and the realtime client): in solo both
 * hooks answer null and the rock keeps its stipend.
 *
 * QA: canvas data homePool (collect:c when cashed:today's amount);
 * window.groddleHomePool { refresh(), collect(), state }.
 */

import { HOME_POOL_REFRESH_MS, collectAmount, createPoolSite, normalizePool, poolView } from '../home-pool-mp.js?v=d04553e2';

export const HOME_POOL_MP_FEATURE_ID = 'home-pool-mp';

let site = null;
let pool = null;
let askedAt = 0;
let asking = null;
let collecting = null;
let wasHome = false;

function active(engine) {
  return engine?.mode === 'multiplayer' && Boolean(engine.query?.('realtimeClient')) && typeof document !== 'undefined';
}

function siteFor() {
  if (!site) {
    const boot = globalThis.GRODDLE_MP_BOOT || {};
    site = createPoolSite({ nonce: boot.nonce || '', nonceUrl: boot.nonceUrl || '' });
  }
  return site;
}

function publish(engine) {
  engine.setData?.('homePool', poolView(pool));
}

function onOwnStreet(engine) {
  const ctx = engine.homeContext?.();
  return Boolean(ctx?.inHome && ctx.owned && (ctx.room || 'street') === 'street');
}

async function refresh(engine) {
  if (asking) return asking;
  askedAt = Date.now();
  asking = (async () => {
    try {
      const next = normalizePool(await siteFor().mine());
      if (next) pool = next;
    } catch (err) {
      console.warn('[home-pool]', err?.message || err);
    } finally {
      asking = null;
      publish(engine);
    }
    return pool;
  })();
  return asking;
}

async function collect(engine, { cashedToday = false } = {}) {
  if (collecting) return 0;
  collecting = (async () => {
    try {
      const got = await siteFor().collect();
      const amount = collectAmount(got, { cashedToday });
      if (pool) pool = { ...pool, collect: 0, cashed: true };
      return amount;
    } catch (err) {
      console.warn('[home-pool]', err?.message || err);
      return 0;
    } finally {
      collecting = null;
      publish(engine);
    }
  })();
  return collecting;
}

export const homePoolMpFeature = {
  id: HOME_POOL_MP_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (!engine?.started || !active(engine)) return;
    const home = onOwnStreet(engine);
    if (home && (!wasHome || Date.now() - askedAt > HOME_POOL_REFRESH_MS)) refresh(engine);
    wasHome = home;
    if (!globalThis.groddleHomePool) {
      globalThis.groddleHomePool = {
        refresh: () => refresh(engine),
        collect: (opts) => collect(engine, opts),
        get state() { return pool; },
      };
    }
  },

  /** homes-feature rockImgToCollect: houses_get_img_rewards from the site's pool (0 until it answers). */
  homeImgPool(engine) {
    if (!active(engine)) return null;
    return pool && !collecting ? pool.collect : 0;
  },

  /** homes-feature talk to: the hand-over, once a game day (magic_rock.js 427-446). */
  homeImgCollect(engine, opts = {}) {
    if (!active(engine)) return null;
    return collect(engine, opts);
  },
};
