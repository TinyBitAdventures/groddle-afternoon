#!/usr/bin/env bash
# Deploys the Groddle site to groddleafternoon.com (Kinsta), as first done on 2026-10-27:
# the development Minn Engine and Minn Admin, the Groddle theme (groddle-afternoon-site) and the
# built game. The database and wp-config.php are left alone (the first deploy imported the
# database and added MINN_WP_API and GRODDLE_REALTIME_URL to wp-config.php).
#
# Kinsta's layout, and why:
# - PHP may only open files under public/ and web/ (open_basedir), so the built game lives in
#   ~/web/game (the site's groddle_static_root option is ../web/game) and the realtime secret in
#   ~/web/realtime.secret (groddle_realtime_secret_file). Each top-level game entry is a symlink
#   in public/, as on groddle.localhost.
# - nginx serves a folder's index.html itself and answers 403 for a folder with none, so every
#   built folder that shadows a published Minn page or Note gets an index.php that hands the
#   request to Minn (index.php wins over index.html there).
# - The route to Kinsta is slow per connection, so the game goes up as a tarball in parallel
#   parts, resumable, checked by sha256.
#
# Usage: tools/deploy/kinsta.sh [--game <built public/ dir>]   (default: ~/Cove/Sites/groddle.localhost/game,
# which the dev-glitch-game sync fills from a clean main checkout)
set -euo pipefail
# The Kinsta SSH address stays out of the repo: GRODDLE_KINSTA_SSH (user@host) and GRODDLE_KINSTA_PORT,
# from the environment or ~/.config/groddle/deploy.env.
[ -f "$HOME/.config/groddle/deploy.env" ] && . "$HOME/.config/groddle/deploy.env"
HOST=${GRODDLE_KINSTA_SSH:?set GRODDLE_KINSTA_SSH=user@host, or put it in ~/.config/groddle/deploy.env}
PORT=${GRODDLE_KINSTA_PORT:?set GRODDLE_KINSTA_PORT, or put it in ~/.config/groddle/deploy.env}
SSH=(ssh -p "$PORT" -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
GAME=${GAME:-$HOME/Cove/Sites/groddle.localhost/game}
[ "${1:-}" = "--game" ] && GAME=$2
ENGINE=$HOME/Cove/Sites/minn-engine.localhost/public/minn
ADMIN=$HOME/Cove/Sites/minnadmin.localhost/public/wp-content/plugins/minn-admin
THEME=$HOME/Documents/glitch-audit/groddle-afternoon-site
[ -f "$GAME/play/index.html" ] || { echo "no built game at $GAME" >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "1/5 engine, Minn Admin, theme"
rsync -az --delete --exclude admin --exclude .install.json -e "${SSH[*]}" "$ENGINE/" "$HOST:public/minn/"
rsync -az --delete --exclude .git --exclude tests --exclude node_modules -e "${SSH[*]}" "$ADMIN/" "$HOST:public/wp-content/plugins/minn-admin/"
rsync -az --delete --exclude .git -e "${SSH[*]}" "$THEME/" "$HOST:public/wp-content/themes/groddle/"
"${SSH[@]}" "$HOST" 'ln -sfn ../wp-content/plugins/minn-admin ~/public/minn/admin'

echo "2/5 the game, in parallel parts"
(cd "$GAME" && COPYFILE_DISABLE=1 tar -cf - .) | split -b 120m - "$work/game.tar.part."
"${SSH[@]}" "$HOST" 'rm -rf ~/private/game-parts && mkdir -p ~/private/game-parts'
for p in "$work"/game.tar.part.*; do
	( for try in 1 2 3 4 5 6 7 8; do
		rsync -q --partial --append --timeout=60 -e "${SSH[*]}" "$p" "$HOST:private/game-parts/" && break
		sleep 5
	done ) &
done
wait
(cd "$work" && shasum -a 256 game.tar.part.* | awk '{print $1, $2}') > "$work/local.sums"
"${SSH[@]}" "$HOST" 'cd ~/private/game-parts && sha256sum game.tar.part.* | awk "{print \$1, \$2}"' > "$work/remote.sums"
diff -q "$work/local.sums" "$work/remote.sums" >/dev/null || { echo "a part did not arrive whole: run again" >&2; exit 1; }

echo "3/5 unpack, links, shims"
links=$(cd "$GAME" && ls -A)
"${SSH[@]}" "$HOST" "bash -s" <<REMOTE
set -e
rm -rf ~/web/game.new && mkdir -p ~/web/game.new
cat ~/private/game-parts/game.tar.part.* | tar -xf - -C ~/web/game.new 2>/dev/null
rm -rf ~/web/game.old && { [ -d ~/web/game ] && mv ~/web/game ~/web/game.old || true; } && mv ~/web/game.new ~/web/game
rm -rf ~/private/game-parts ~/web/game.old
cd ~/public
for n in $links; do
	[ "\$n" = index.html ] && continue
	if [ -e "\$n" ] && [ ! -L "\$n" ]; then echo "kept \$n (not a link)"; continue; fi
	ln -sfn "../web/game/\$n" "\$n"
done
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
REMOTE

echo "4/5 cache"
"${SSH[@]}" "$HOST" 'cd ~/public && wp cache flush' | tail -1

echo "5/5 check"
for p in / /play/ /play/online/ /restoration/ /changelog/ /musicblocks/ /wp-json/groddle/v1/me; do
	printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://groddleafternoon.com$p?deploy=$RANDOM")" "$p"
done
