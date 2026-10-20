# Groddle Afternoon — Glitch web spike

A minimal browser prototype that proves the asset path works:

- **Sprites** from the OpenGameArt Glitch PNG dump (`npc_piggy`, `apple`, `npc_chicken`, `quoin`)
- **Audio** recovered from the Wayback Machine (`c1.glitch.bz` via archive.org)
- **Engine** PixiJS 7 (CDN) — not Flash, not GSJS

## Current slice: homes and mail

The remake now includes a source-backed personal home loop:

- Buy a one-time deed for **1,000 currants** and choose a Meadow, Firebog, or Uralia style.
- Teleport to a persistent outdoor home street, enter the house interior, and return to the exact street position you left.
- Use the physical **Mailbox (1)** to read, archive, delete, and reply to letters.
- Receive one attached item stack and/or enclosed currants, or send both using the original GSJS postage calculation.
- Local companions deliver deterministic replies after a short delay; this stands in for the unavailable live multiplayer mail backend.

Focused QA: `https://groddle.localhost/?autostart=1&resetgame=1&homedemo=purchase`

## Run (Cove — preferred)

Live as a plain Cove site:

**https://groddle.localhost**

```bash
# recreate if needed
cove add groddle --plain

# push latest files into the site docroot
rsync -a --delete ~/Documents/glitch-audit/spike/public/ "$(cove path groddle)/"
```

`cove path groddle` → `~/Cove/Sites/groddle.localhost/public`

## Run (local static server)

```bash
cd ~/Documents/glitch-audit/spike/public
python3 -m http.server 8765
# open http://localhost:8765
```

Click **Start** to unlock audio (browser autoplay policy).

## Controls

| Key | Action |
|-----|--------|
| A / D or ← / → | Move |
| W / Space / ↑ | Jump |
| E or click piggy | Pet |

## Quest

Pet **3** piggies and gather **5** apples.

## Layout

```
spike/public/
  index.html
  style.css
  game.js
  assets/sprites/   # OGA PNGs
  assets/audio/     # Wayback MP3s
```

## Notes

- Player avatar is a placeholder doodle — full wardrobe is *not* in the OGA spritesheet dump (use vanity/wardrobe FLA zips later).
- Street is a hand-drawn hill, not a real LocoDeco street.
- Sheet frame sizes were reverse-engineered from PNG dimensions (piggy = 88×62 cells).

## License

Game art/audio: Tiny Speck **CC0**. Glitch name/logo not included. This spike is a tech demo, not a product.
