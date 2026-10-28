# Contributing to Groddle Afternoon

Issues and pull requests are welcome. A bug you hit while playing, a rule that does not match the original, an item that is missing: [open an issue](https://github.com/TinyBitAdventures/groddle-afternoon/issues), or [send the fix](https://github.com/TinyBitAdventures/groddle-afternoon/pulls).

Groddle Afternoon is three repos. This one is the game. The others are the realtime server ([groddle-afternoon-server](https://github.com/TinyBitAdventures/groddle-afternoon-server)) and the website ([groddle-afternoon-site](https://github.com/TinyBitAdventures/groddle-afternoon-site)). Solo play needs only this repo; multiplayer needs all three. https://groddleafternoon.com/code/ shows what is in each.

## Run it locally

Clone the three repos side by side:

    git clone https://github.com/TinyBitAdventures/groddle-afternoon
    git clone https://github.com/TinyBitAdventures/groddle-afternoon-server
    git clone https://github.com/TinyBitAdventures/groddle-afternoon-site

Play solo:

    cd groddle-afternoon
    node tools/serve-static.mjs public 8080
    # open http://127.0.0.1:8080/play/

Run the tests (Node 22 or newer):

    npm install
    npm test

Many tests check the game against Tiny Speck's own files. For the full suite, clone these beside the repo too:

    git clone https://github.com/tinyspeck/glitch-GameServerJS
    git clone https://github.com/tinyspeck/glitch-client
    git clone https://github.com/tinyspeck/glitch-items
    git clone https://github.com/tinyspeck/glitch-overlays
    git clone https://github.com/tinyspeck/glitch-locations
    unzip -q glitch-locations/locations-xml.zip -d streets

A test that needs a checkout you do not have skips and says what to clone.

## House rules

- **Commit subjects use Emoji-Log**: `📦 NEW:`, `👌 IMPROVE:`, `🐛 FIX:`, `📖 DOC:` or `🤖 TEST:`, then the change in plain words, such as `📦 NEW: Peat bogs and dirt piles to dig`. The body, if any, is short `- ` bullets with the facts that matter.
- **Every change comes with a test**, and `npm test` stays green.
- **Solo play does not change for multiplayer work.** Multiplayer sits beside the solo game, never inside it.
- **Rules cite their source**: the GameServerJS file and line a number or a line of dialogue came from, in a code comment.
- **Words**: item and game text come from Tiny Speck's files; everything else is in our own words, plain, with no em-dashes.
- **Generated files** say so in their header. Change the builder in `tools/` (or the root `build-*.mjs`) and run it, rather than editing the output.

## Licences

The code is MIT (see `LICENSE`). Tiny Speck's art and game data are CC0. The sounds are Tiny Speck's original recordings (archive.org and Glitch's own servers through the Wayback Machine), shipped as the originals. The Glitch name and logo are Tiny Speck's and not part of that release, so they never ship. Only CC0 art and Tiny Speck's own recordings may be added; footage, Snaps and other players' recordings can guide a rebuild but never ship.
