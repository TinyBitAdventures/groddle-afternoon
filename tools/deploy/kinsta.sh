#!/usr/bin/env bash
# Deploys a release of the Groddle site to groddleafternoon.com (Kinsta): the game, the Groddle theme
# (groddle-afternoon-site), Minn Engine and Minn Admin, each at the version tools/deploy/live.json names.
# Everything is exported from git (tags for the game and site, pinned commits for Minn), never copied
# from a working tree, so nothing uncommitted can ship. The database and wp-config.php are left alone
# (the first deploy, 2026-10-27, imported the database and added MINN_WP_API and GRODDLE_REALTIME_URL).
#
# Kinsta's layout, and why:
# - PHP may only open files under public/ and web/ (open_basedir), so the built game lives in
#   ~/web/game (the site's groddle_static_root option is ../web/game) and the realtime secret in
#   ~/web/realtime.secret (groddle_realtime_secret_file). Each top-level game entry is a symlink
#   in public/, as on groddle.localhost.
# - nginx serves a folder's index.html itself and answers 403 for a folder with none, so every
#   built folder that shadows a published Minn page or Note gets an index.php that hands the
#   request to Minn (index.php wins over index.html there).
# - The game goes up with rsync into a hard-linked copy of the live one (only changed files cross the
#   slow link), then the copies swap, so players never load a half-written game.
#
# Usage: tools/deploy/kinsta.sh [<release json>]   (default: tools/deploy/live.json)
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
RELEASE=${1:-$here/tools/deploy/live.json}
# The Kinsta SSH address stays out of the repo: GRODDLE_KINSTA_SSH (user@host) and GRODDLE_KINSTA_PORT,
# from the environment or ~/.config/groddle/deploy.env.
[ -f "$HOME/.config/groddle/deploy.env" ] && . "$HOME/.config/groddle/deploy.env"
HOST=${GRODDLE_KINSTA_SSH:?set GRODDLE_KINSTA_SSH=user@host, or put it in ~/.config/groddle/deploy.env}
PORT=${GRODDLE_KINSTA_PORT:?set GRODDLE_KINSTA_PORT, or put it in ~/.config/groddle/deploy.env}
SSH=(ssh -p "$PORT" -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
SITE_REPO=${GRODDLE_SITE_DIR:-$(dirname "$here")/groddle-afternoon-site}
ENGINE_REPO=${MINN_ENGINE_REPO:-$HOME/Cove/Sites/minn-engine.localhost}
ADMIN_REPO=${MINN_ADMIN_REPO:-$HOME/Cove/Sites/minnadmin.localhost/public/wp-content/plugins/minn-admin}
AUDIT=$(dirname "$(cd "$here" && pwd -P)")

field() { node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const v = r[process.argv[2]]; if (!v) process.exit(1); console.log(v);' "$RELEASE" "$1" || { echo "$RELEASE names no $1" >&2; exit 1; }; }
resolve() { git -C "$1" rev-parse --verify --quiet "$2^{commit}" || { echo "$2 is not in $1: tag or fetch it first" >&2; exit 1; }; }
GAME_REF=$(field game); SITE_REF=$(field site); ENGINE_REF=$(field engine); ADMIN_REF=$(field minnAdmin)
game_c=$(resolve "$here" "$GAME_REF"); site_c=$(resolve "$SITE_REPO" "$SITE_REF")
engine_c=$(resolve "$ENGINE_REPO" "$ENGINE_REF"); admin_c=$(resolve "$ADMIN_REPO" "$ADMIN_REF")
echo "deploying game $GAME_REF, site $SITE_REF, Minn Engine ${engine_c:0:8}, Minn Admin ${admin_c:0:8}"

# The real path: macOS hands out /var/... for /private/var/..., and the build tools only run as main
# when the path they were started by matches their own (they did nothing at all from /var).
work=$(cd "$(mktemp -d)" && pwd -P)
trap 'git -C "$here" worktree remove --force "$work/game" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

echo "1/6 export and build"
mkdir -p "$work/engine" "$work/admin" "$work/site"
git -C "$ENGINE_REPO" archive "$engine_c" public/minn | tar -x -C "$work/engine"
git -C "$ADMIN_REPO" archive "$admin_c" | tar -x -C "$work/admin"
rm -rf "$work/admin/tests"
git -C "$SITE_REPO" archive "$site_c" | tar -x -C "$work/site"
git -C "$here" worktree add --detach --quiet "$work/game" "$game_c"
# The restoration and catalog builds read the original sources and the research inventory beside the game.
for d in glitch-GameServerJS streets glitch-client glitch-items glitch-overlays research; do [ -e "$AUDIT/$d" ] && ln -s "$AUDIT/$d" "$work/$d"; done
ln -s "$here/node_modules" "$work/game/node_modules"
(cd "$work/game" && node tools/build-restoration.mjs >/dev/null)
[ "$(git -C "$work/game" status --porcelain -- public/restoration/history.json)" ] || echo "note: the restoration history was already current"
# The Code page measures the repos at the tags this release names (the tagged copy describes the one before).
node "$work/game/tools/codebase/build-data.mjs" --release="$RELEASE" --out="$work/game/public/codebase/data.json"
# The header menu is content on the live site (Minn Admin, Design, Navigation): write the live one in.
"${SSH[@]}" "$HOST" 'cd ~/public && wp post list --post_type=wp_navigation --post_status=publish --fields=ID,post_date --format=json' > "$work/menus.json"
menu=$(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8") || "[]"); m.sort((a, b) => (a.post_date === b.post_date ? b.ID - a.ID : (a.post_date < b.post_date ? 1 : -1))); console.log(m[0]?.ID || "");' "$work/menus.json")
if [ -n "$menu" ]; then
	"${SSH[@]}" "$HOST" "cd ~/public && wp post get $menu --field=post_content" > "$work/menu.html"
	nav=$(node "$work/game/tools/site-nav/apply.mjs" --game="$work/game/public" --menu="$work/menu.html")
	echo "$nav"
	case "$nav" in "site nav:"*) ;; *) echo "the menu was not written into the built pages" >&2; exit 1;; esac
fi
GAME="$work/game/public"

echo "2/6 Minn Engine, Minn Admin, theme"
rsync -rlc --delete --exclude admin --exclude .install.json -e "${SSH[*]}" "$work/engine/public/minn/" "$HOST:public/minn/"
rsync -rlc --delete --exclude tests --exclude node_modules -e "${SSH[*]}" "$work/admin/" "$HOST:public/wp-content/plugins/minn-admin/"
rsync -rlc --delete -e "${SSH[*]}" "$work/site/" "$HOST:public/wp-content/themes/groddle/"
"${SSH[@]}" "$HOST" 'ln -sfn ../wp-content/plugins/minn-admin ~/public/minn/admin'

echo "3/6 the game (changed files only)"
"${SSH[@]}" "$HOST" 'rm -rf ~/web/game.next && cp -al ~/web/game ~/web/game.next'
rsync -rlc --delete --exclude index.php --timeout=120 -e "${SSH[*]}" "$GAME/" "$HOST:web/game.next/"
"${SSH[@]}" "$HOST" 'rm -rf ~/web/game.old && mv ~/web/game ~/web/game.old && mv ~/web/game.next ~/web/game && rm -rf ~/web/game.old'

echo "4/6 links, shims"
links=$(cd "$GAME" && ls -A | tr "\n" " ")
"${SSH[@]}" "$HOST" "bash -s" <<REMOTE
set -e
cd ~/public
for n in $links; do
	[ "\$n" = index.html ] && continue
	if [ -e "\$n" ] && [ ! -L "\$n" ]; then echo "kept \$n (not a link)"; continue; fi
	ln -sfn "../web/game/\$n" "\$n"
done
# Links whose entry left the game go.
for l in *; do
	if [ -L "\$l" ] && [ ! -e "\$l" ]; then case "\$(readlink "\$l")" in ../web/game/*) rm "\$l";; esac; fi
done
find ~/web/game -mindepth 2 -name index.php -delete
shim='<?php
// Kinsta serves a folder index itself: hand this folder'"'"'s address to Minn (tools/deploy/kinsta.sh writes this).
require \$_SERVER["DOCUMENT_ROOT"] . "/index.php";'
n=0
wp db query "SELECT post_type, post_name FROM wp_posts WHERE post_status='publish' AND post_type IN ('page','post')" --skip-column-names > /tmp/groddle-paths.txt
while read -r type slug; do
	[ "\$type" = post ] && p="changelog/\$slug" || p="\$slug"
	[ -d ~/web/game/\$p ] && { printf '%s\n' "\$shim" > ~/web/game/\$p/index.php; n=\$((n+1)); }
done < /tmp/groddle-paths.txt
rm -f /tmp/groddle-paths.txt
echo "shims: \$n"
echo "\$(date -u +%FT%TZ) game $GAME_REF site $SITE_REF engine ${engine_c:0:8} minn-admin ${admin_c:0:8}" >> ~/private/deploys.log
REMOTE

# G335 slice 4 (Austin 2026-10-28): users 1 and 54 (the developer's and the reviewer's characters) start the
# multiplayer ledger at a new player's zero, not from their saves (site src/Ledger.php, option
# groddle_ledger_start_empty). Idempotent: a ledger already put back to zero ("zeroed") is never zeroed again.
START_EMPTY=${GRODDLE_LEDGER_START_EMPTY:-1,54}
case "$START_EMPTY" in *[!0-9,]*) echo "GRODDLE_LEDGER_START_EMPTY must be ids and commas" >&2; exit 1;; esac
"${SSH[@]}" "$HOST" "cd ~/public && wp db query \"INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('groddle_ledger_start_empty', '$START_EMPTY', 'off') ON DUPLICATE KEY UPDATE option_value = VALUES(option_value)\""
echo "ledger: users $START_EMPTY start at a new player's zero"

echo "5/6 cache"
"${SSH[@]}" "$HOST" 'cd ~/public && wp cache flush' | tail -1

echo "6/6 check"
for p in / /play/ /play/online/ /restoration/ /changelog/ /musicblocks/ /items/ /wp-json/groddle/v1/me; do
	printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://groddleafternoon.com$p?deploy=$RANDOM")" "$p"
done
