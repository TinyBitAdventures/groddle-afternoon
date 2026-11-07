# Report credits

The Contribute page thanks the testers whose bug reports led to a change: a board of the ten players with the most points (`groddle/contribute-credits`, drawn by the site's `src/ContributeCredits.php`). Each report earns its points once, when it is closed or answered, and the site keeps one score per report (`groddle_report_credits`, `src/ReportCredits.php`). An administrator can see and change any score in the console: the Credit box on a report, and the Credits tab.

`credits.mjs` is the scoring agent's tool. It never writes to a site unless told to.

## The rubric

| Kind | Points | When |
|---|---|---|
| `safety_fix` | 5 | The report led to a fix that keeps players' saves, accounts or security safe |
| `bug_fixed` | 3 | A real bug, fixed |
| `improvement_shipped` | 2 | A suggestion or idea that shipped |
| `partial_or_clue` | 1 | Partly addressed, or a clue that led to a fix found elsewhere |
| `none` | 0 | Working as Glitch intended, a repeat of the same player's own report, withdrawn by the player, or nothing changed. Say why kindly. A different player's report of the same bug scores the same as the first (Austin 2026-11-06) |

A report with several changes in it (follow-ups in the same thread count) scores its best change, plus 1 for each other change, up to 8. Count a change once, on the report where it was first raised. When in doubt, choose the lower kind. The reason is one plain line of at most 200 characters, in player words, with no em-dashes, emails or IPs. Refs are the commits that made the change (`game <sha>`, `site <sha>`, `server <sha>`) and the release it shipped in (`game v0.16.0`).

The board ranks players by points, then by the number of reports that led to a change, then by who sent the first such report earliest. Banned players and Austin's own accounts (users 1 and 54) are never on it. A name links to the player's page only when they have a public one (level 5 and up, the Players page's rule).

## Steps

1. Read the reports (read-only GETs). Sign in with a cookie jar and a REST nonce, or with `MINN_USER` / `MINN_PASS`:

   ```
   node tools/reports/credits.mjs read --site=https://groddleafternoon.com --jar=<cookies.txt> --nonce-file=<nonce.txt> --out=<dir>
   ```

   This writes `<dir>/tickets.json` (every closed or answered thread not scored yet) and a draft `<dir>/proposals.json`, with the commits that cite each ticket's number as candidates. A report with news nobody has read is skipped, because opening it marks it read.

2. Score each draft: read the thread, find what fixed it in the three repos' history (commit messages cite "ticket 37", "#21", the player or the street; release notes say what shipped when), and fill in `kind`, `points`, `items`, `reason` and `refs`.

3. Check the file and write the table for Austin:

   ```
   node tools/reports/credits.mjs check --proposals=<dir>/proposals.json --md=<dir>/proposals.md
   ```

4. After Austin's OK, save them. Without `--yes` this is a dry run, and a site that is not `*.localhost` also needs `--live`:

   ```
   node tools/reports/credits.mjs apply --site=https://groddleafternoon.com --jar=... --nonce-file=... --proposals=<dir>/proposals.json --live --yes
   ```

   A proposal whose ticket on that site has another subject or player is skipped.

## In a release

After posting replies, score each closed ticket with tools/reports/credits.mjs and apply after Austin's OK.

## Adding the board to a Contribute page

`tools/contribute/to-minn.mjs` makes new Contribute pages with the testers band already in them, after the ledger. To add the band to a page that is already there, leaving its other words alone:

- `MINN_USER=admin MINN_PASS=... node tools/contribute/to-minn.mjs --add-credits --site=<site>` signs in and saves it.
- Over SSH with WP-CLI, where the script can't sign in: `wp post get <id> --field=post_content > before.html`, then `node tools/contribute/to-minn.mjs --add-credits --stdin < before.html > after.html`, then `wp post update <id> after.html`.
