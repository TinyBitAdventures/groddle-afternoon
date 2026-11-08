/**
 * The release step for shared street Patches (register G564 slice 3, the plan's section 10): the
 * one-time hand-over of players' own street Patches (groddle-afternoon-site src/PatchPayout.php, POST
 * groddle/v1/admin/patches/payout, administrators only). Option B (Austin 2026-11-08, "decide by the
 * count"): where one player planted a Patch their Seedling or tree becomes the shared one with them as
 * planter; where several did the most grown wins and the others get their bean and the fruit on it
 * back by letter. Safe to run again: the site remembers who was paid, and a second run only clears
 * plots a stale page wrote back, paying and winning nothing.
 *
 * The winners reach the realtime server as a seed file (server patches_seed.go, -patches-seed): the
 * real run writes it with --seed-out, the release copies it to the realtime host beside the state file
 * and restarts the server, which plants each winner once at its first connect (and refunds one that
 * can't land itself).
 *
 * Order (the plan's section 12): server (with -patches on), site, the dry run (check it against the live
 * count), the real run with --seed-out, copy the seed and restart the server, the game, then the real run
 * once more to clear anything an old page wrote back (its seed is empty: nothing to copy).
 *
 *   MINN_USER=admin MINN_PASS=… node tools/patches/payout.mjs --site=https://groddle.localhost --dry
 *   MINN_USER=admin MINN_PASS=… node tools/patches/payout.mjs --site=https://groddle.localhost --seed-out=realtime-patches-seed.json
 *   … --users=501,502   change only these characters (the winners are still decided over every save)
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** The seed file's text from the route's answer; a dry run's winners are never for the server. */
export function seedFile(out) {
  if (out?.dry !== false) throw new Error('a dry run writes no seed file');
  if (!Array.isArray(out?.seed?.plots)) throw new Error('the answer carries no seed');
  return `${JSON.stringify({ v: 1, plots: out.seed.plots }, null, 1)}\n`;
}

async function main() {
  const { Minn } = await import('../changelog/to-minn.mjs');
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
  const site = String(args.site || '');
  if (!/^https:\/\//.test(site) || !process.env.MINN_USER || !process.env.MINN_PASS || (args.dry === true && args['seed-out'])) {
    console.error('usage: MINN_USER=… MINN_PASS=… node tools/patches/payout.mjs --site=https://… [--dry | --seed-out=<file>] [--users=1,2]');
    process.exit(2);
  }
  const body = { dry: args.dry === true };
  if (args.users) body.users = String(args.users).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const minn = new Minn(site);
  await minn.signIn(process.env.MINN_USER, process.env.MINN_PASS);
  const out = await minn.rest('POST', '/groddle/v1/admin/patches/payout', body);
  for (const p of out.players) {
    const wins = p.wins.map((w) => `${w.tree} ${w.stage} on ${w.street} ${w.key}`).join(', ');
    const items = Object.entries(p.items).map(([c, n]) => `${n} ${c}`).join(', ');
    const what = [wins && `wins ${wins}`, items && `refund ${items}`].filter(Boolean).join('; ') || 'nothing planted';
    console.log(`${p.user} ${p.name}: ${p.streets.length} street(s), ${what}${p.before ? ' (paid before: cleared only)' : p.paid ? (out.dry ? ' (would pay)' : ' (paid)') : ''}`);
  }
  console.log(`${out.dry ? 'dry run: ' : ''}${out.players.length} player(s), ${out.seed.plots.length} winner(s), ${out.letters} letter(s)`);
  if (args['seed-out']) {
    await writeFile(String(args['seed-out']), seedFile(out));
    console.log(`seed for the realtime server: ${args['seed-out']} (${out.seed.plots.length} plot(s))`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
