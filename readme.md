# Groddle Afternoon

A fresh take on the world of Glitch, Tiny Speck's browser game (2011 to 2012), rebuilt for the
modern web. It is not online yet: run it locally (see [Run it locally](#run-it-locally) below).
Multiplayer is built and tested locally, but there is no public server and no players yet.

Walk the original streets, pet piggies, milk butterflies, harvest trees, mine rocks, cook, grow
gardens, learn skills, earn badges, build street projects, fight off a Rook attack and play the
quest rooms. The art and sound are Tiny Speck's own, from their public-domain release, and the
game rules come from the server code they published. Everything else (the engine, the rooms whose
layouts were never archived, the missing art) is new work.

- **Solo**: your own character, saved in your browser. No account needed.
- **Multiplayer**: make a character with an email and a password, right in the game, and it is saved on the server. Other players share the
  street with you: chat, parties, shared quoins and rocks, races, trading, and Rook attacks fought
  together.

## The three repos

| Repo | What it is |
|---|---|
| **groddle-afternoon** (this one) | The game: a PixiJS 8 web app in `public/`, its tests, and the tools that build its data from Tiny Speck's sources |
| [groddle-afternoon-server](https://github.com/TinyBitAdventures/groddle-afternoon-server) | The Go realtime server for multiplayer |
| [groddle-afternoon-site](https://github.com/TinyBitAdventures/groddle-afternoon-site) | The website: a theme and extension for [Minn](https://github.com/austinginder/minn-engine) that serves the game, keeps accounts and multiplayer saves, and signs the realtime server's tickets |

Solo play needs only this repo. Multiplayer needs all three.

## Run it locally

Solo play is static files. Serve `public/` and open the game:

    node tools/serve-static.mjs public 8080
    # open http://127.0.0.1:8080/play/

Use this small server rather than `python3 -m http.server`: the game loads many modules and
assets at once, and Python's server resets connections under that load, so the game stalls at the
loading card.

The home page is `/`, the game is `/play/`, and the restoration report is `/restoration/`. Query
parameters open the game straight into a system or room for testing, for example
`/play/?autostart=1&fresh=1&questdemo=fourletter`. The links on the restoration report add
`&practice=1`, which keeps that visit's progress in the tab and leaves your real save alone.

Multiplayer needs the site running on Minn (it serves `/play/online/`, accounts and saves) and the
realtime server behind the same host at `/ws`. See the readmes of the
[site](https://github.com/TinyBitAdventures/groddle-afternoon-site) and the
[server](https://github.com/TinyBitAdventures/groddle-afternoon-server).

### Controls

| Input | Action |
|---|---|
| A / D or the arrow keys | Walk |
| W / Space | Jump; three quick jumps on landing make a Triple Jump |
| Up at a ladder | Climb |
| E, or click something | Open its verb menu (Pet, Harvest, Talk to, ...) |
| Esc | Close menus and panels |
| M | Mute |

## Tests

    npm install
    npm test

Node 22 or newer. The tests check the game's rules against Tiny Speck's own data, so many of them
read the original sources from checkouts beside this repo:

    cd ..
    git clone https://github.com/tinyspeck/glitch-GameServerJS
    git clone https://github.com/tinyspeck/glitch-client
    git clone https://github.com/tinyspeck/glitch-items
    git clone https://github.com/tinyspeck/glitch-overlays
    git clone https://github.com/tinyspeck/glitch-locations
    unzip -q glitch-locations/locations-xml.zip -d streets

The multiplayer tests read the server and site repos from `../groddle-afternoon-server` and
`../groddle-afternoon-site` (or `GRODDLE_SERVER_DIR` and `GRODDLE_SITE_DIR`), and skip with a
clone hint when they are missing. A few tests check the item catalog against a research
inventory kept outside the repo, and skip without it.

`tools/shot.mjs` takes a screenshot of any route and `tools/playtest.mjs` plays the game like a
person would (both use Playwright with your installed Chrome).

## How it is built

- `public/game.js` is the engine core: streets, camera, physics, input, the verb menu and the HUD.
- `public/js/` holds the game's rules, one plain module per system (mining, gardens, skills,
  quoins, shrines, ...), written to match the original server code and tested on their own.
- `public/js/features/` holds newer systems as feature modules that reach the world only through
  the engine's hooks.
- `public/assets/` holds the art, sound and data. The `build-*.mjs` scripts and `tools/` turn Tiny
  Speck's released sources into that data (streets, recipes, stores, quests, badges, sounds).

## Credits and licence

The code in this repo is MIT licensed: see [LICENSE](LICENSE).

The art and game data come from Tiny Speck's release of Glitch into the public domain
([CC0](https://creativecommons.org/publicdomain/zero/1.0/)): the
[Glitch public-domain game art](https://www.glitchthegame.com/public-domain-game-art/) and the
[tinyspeck repositories on GitHub](https://github.com/tinyspeck).

The sounds are Tiny Speck's original recordings, shipped as the originals. Most come from the
Glitch audio sets on archive.org (three tagged CC0 and one untagged, all from the same uploader);
the rest come from Glitch's own servers through the Wayback Machine, and one from a copy of
Slack's sounds on archive.org. Tiny Speck's public-domain page names its art, not its sounds, so
for the sounds this rests on those uploads. Sounds that were never recovered play short tones the
game makes itself. Thank you, Tiny Speck, and everyone who played and recorded the game.

Groddle Afternoon is a fan project. It is not affiliated with or endorsed by Tiny Speck or Slack,
and it does not use the Glitch name or logo.
