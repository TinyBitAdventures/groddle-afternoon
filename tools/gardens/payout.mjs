/**
 * The release step for shared public gardens (register G368): the one-time
 * reset of players' own plots on the ten public garden streets, their crops
 * sent by in-game mail (groddle-afternoon-site src/GardenPayout.php, POST
 * groddle/v1/admin/gardens/payout, administrators only). Safe to run again:
 * the site remembers who was paid, and a second run only clears plots a stale
 * page wrote back, paying nothing.
 *
 * Order: after the server and site deploys, before the game's (the new game
 * drops these old plots once the server shares the gardens); then once more
 * after the game is live, to clear anything an old page wrote back meanwhile.
 *
 *   MINN_USER=admin MINN_PASS=… node tools/gardens/payout.mjs --site=https://groddle.localhost --dry
 *   MINN_USER=admin MINN_PASS=… node tools/gardens/payout.mjs --site=https://groddle.localhost
 *   … --users=501,502   only these characters (local QA with throwaway players)
 */
import { Minn } from '../changelog/to-minn.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const site = String(args.site || '');
if (!/^https:\/\//.test(site) || !process.env.MINN_USER || !process.env.MINN_PASS) {
  console.error('usage: MINN_USER=… MINN_PASS=… node tools/gardens/payout.mjs --site=https://… [--dry] [--users=1,2]');
  process.exit(2);
}
const body = { dry: args.dry === true };
if (args.users) body.users = String(args.users).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
const minn = new Minn(site);
await minn.signIn(process.env.MINN_USER, process.env.MINN_PASS);
const out = await minn.rest('POST', '/groddle/v1/admin/gardens/payout', body);
for (const p of out.players) {
  const items = Object.entries(p.items).map(([c, n]) => `${n} ${c}`).join(', ') || 'nothing planted';
  console.log(`${p.user} ${p.name}: ${p.streets.length} street(s), ${items}${p.before ? ' (paid before: cleared only)' : p.paid ? ' (paid)' : ''}`);
}
console.log(`${out.dry ? 'dry run: ' : ''}${out.players.length} player(s), ${out.letters} letter(s)`);
