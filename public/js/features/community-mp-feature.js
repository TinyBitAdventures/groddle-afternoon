/**
 * The Community boards' notices in Activity (js/community-notices.js has the rules and words):
 * while you play online, a reply to your thread or a post that quotes you on the website's boards
 * (/chat/) becomes an Activity line with a link to it. The site hands each notice over once
 * (groddle-afternoon-site src/Community.php, POST community/notices/game); the header's Community
 * link carries the same count on the website.
 *
 * Multiplayer only (engine.mode): solo asks nothing. QA: canvas data communityNotices (how many
 * were logged); window.groddleCommunity.
 */

import { createMinnAccount } from '../minn-account.js?v=b29fae30';
import { NOTICE_FIRST_MS, NOTICE_POLL_MS, communityNoticeHtml, communityNoticesFrom } from '../community-notices.js?v=f676c372';

export const COMMUNITY_MP_FEATURE_ID = 'community-mp';

/** One session: asks the site, logs what came. `account` has communityNotices(). */
export function createCommunitySession(engine, account, { now = Date.now } = {}) {
  let next = now() + NOTICE_FIRST_MS;
  let busy = false;
  let logged = 0;
  const seen = new Set();

  function log(n) {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    logged += 1;
    if (engine.notify?.log) engine.notify.log(n.text, { kind: 'info', html: communityNoticeHtml(n) });
    else engine.pushActivity?.(n.text);
    engine.setData?.('communityNotices', String(logged));
  }

  async function ask() {
    if (busy) return 0;
    busy = true;
    try {
      const list = communityNoticesFrom(await account.communityNotices());
      for (const n of list) log(n);
      return list.length;
    } catch {
      return 0;
    } finally {
      busy = false;
    }
  }

  return {
    ask,
    tick(t = now()) {
      if (t < next || typeof document !== 'undefined' && document.hidden) return;
      next = t + NOTICE_POLL_MS;
      ask();
    },
    get logged() { return logged; },
  };
}

let session = null;

export const communityMpFeature = {
  id: COMMUNITY_MP_FEATURE_ID,

  onTick(dtMs, now, engine) {
    if (engine?.mode !== 'multiplayer' || !engine.started || typeof document === 'undefined') return;
    if (!session) {
      const boot = globalThis.GRODDLE_MP_BOOT || {};
      session = createCommunitySession(engine, createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' }));
      globalThis.groddleCommunity = session;
    }
    session.tick();
  },
};
