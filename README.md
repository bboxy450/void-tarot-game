# The Fool — a walk through a painted valley

A first-person browser game on the 78-card Void Tarot deck. You are the Fool. You begin at dusk in a
castle courtyard where nobles play tarot as a card game, walk out through the gate, and go down into a
valley painted in oil: a winding road, a village of red roofs, a pond and its stream, a ring of standing
stones, a seer's tent, violet mountains under a swirling sky. Cards lie hidden in the valley. Each suit is
an element, and the elements leave residue on the ground and combine. Shades drift in the dusk.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # static site in dist/ (any static server; paths are relative)
pnpm typecheck
```

## Controls

| | |
| --- | --- |
| click | begin, then capture the mouse |
| mouse | look |
| `WASD` / arrows | walk; `Shift` runs; `Space` jumps |
| `E` | take a card; sit with the seer (and rise again) |
| wheel, `1`–`4` (`5`) | choose the card in your hand (next Wands, Cups, Swords, Pentacles, trump) |
| click | cast the card in your hand |
| `M` | silence |

URL flags: `?skip` starts without the title; `?at=x,z,yaw` starts somewhere else; `?shots` (for the
driver) steps frames by hand.

## What the cards do

- **Wands, fire**: a fireball that bursts into flame where it lands.
- **Cups, water**: a splash that leaves a wet, shining pool.
- **Swords, air**: a gust that bends the grass and leaves along its path.
- **Pentacles, earth**: a clod that leaves a dark slick of oil.
- Fire on oil **explodes** (and chains to oil nearby). Air on a pool **charges** it; anything that then
  touches it (a card, a Shade) is struck by forked **lightning**. Air fans a fire; water on fire steams.
- Trumps: **the Tower** calls lightning from the sky and charges pools near it; **the Sun** brightens the
  valley and burns the Shades; **the Star** heals you and gathers motes that strike Shades; any other trump
  opens the void in a violet ring.
- Cards are not used up; each cast has a short cooldown. 18 cards are hidden in the valley.

Shades notice you from about 17 m and drift after you; touching you costs a heart. A hit makes them
flinch; combos hurt them most; undone, they come apart into strokes. Hearts come back when nothing has
struck you for a while. At none, you wake at the castle gate. The seer, in the striped tent east of the
village, lays three of the cards you have found and reads one line from each.

## How it is painted

Everything you see in the world is a **dab**: one mark of a bristle brush on an instanced card, pinned to
a point in 3D (about 2.2 million at load). There is no texture and no light at run time beyond a few
moving lamps.

- **Brush sheet** (`src/paint/brush.ts`): eight marks made in code (long, pressed, curved, dry, round,
  flick, leaf, flat). Channels carry the bristle streaks, the paint's height, a plain mark for small
  strokes, and the full mark with dry ends.
- **Dabs** (`src/paint/dabs.ts`, `shaders.ts`): a dab either faces the eye and runs along a direction
  (leaves, grass, sky, flames) or lies on its surface along the grain (ground, walls, roofs, water),
  stood up toward the eye when seen edge on. Far away, fewer and larger dabs: each has a fixed rank and
  only low ranks stay and grow. Alpha to coverage on a 4-sample target gives one-pixel stroke edges.
- **Underpainting** (`src/paint/under.ts`): coarse geometry in flat, toned colours under the strokes.
- **Colour is mixed once** at build (`src/paint/palette.ts`, `light.ts`): a tone from a ramp picked by
  sun, sky and chance; a low sun with long shadows stamped on a grid (a dab takes sun or shade whole, so
  shadow edges are ragged lines of strokes); lamplight from windows, braziers and lanterns mixed in.
- **Wind** moves leaves and grass in gusts that cross the valley; blasts bend them; torn leaves fly by.
- **Mist** by distance toward warm near the sun, violet elsewhere.
- **The finish** (`src/finish.ts`): one pass that firms stroke edges, grades shade to violet and light to
  gold, lays the canvas weave and a varnish vignette, and carries the flashes.
- **Effects are paint too**: fire, water, gusts, oil, charged pools, lightning, smoke, Shades and the
  cards lying in the world are all dabs (`src/game/fx.ts`, `shades.ts`, `cards.ts`).
- **The hands, hearts and aiming mark** are pixel sprites drawn in code on a low-resolution canvas over
  the picture (`src/ui/hands.ts`); the card in hand is a pixel miniature of its art.
- Resolution adapts: fewer pixels when frames are slow.

## Files

```
index.html, src/style.css      page, canvases
src/main.ts                    renderer, render target, finish, resolution, loop, debug hook (window.__game)
src/finish.ts                  the finishing pass
src/paint/brush.ts             the brush sheet
src/paint/dabs.ts              DabSet (strokes collected while painting), meshes, materials
src/paint/shaders.ts           dab and underpainting GLSL, shared uniforms (wind, mist, lights, blasts)
src/paint/under.ts             underpainting builder
src/paint/light.ts             sun, shadow grid, lamps, shadeColor()
src/paint/palette.ts           colour ramps
src/paint/util.ts              random, noise, colour helpers
src/world/layout.ts            the map: ground height, roads, pond, stream, houses, places
src/world/world.ts             buildWorld(): lamps, things, trees, ground, sky, mountains
src/world/castle.ts            castle, courtyard, nobles' table, lanterns
src/world/things.ts            trees, firs, bushes, houses, stones, figures, the seer's tent
src/world/ground.ts            ground strokes, grass, flowers, water
src/world/surfaces.ts          strokes over rectangles, boxes, tubes and cones
src/world/sky.ts               sky, clouds, sun, moon, stars, mountain ranges
src/world/ctx.ts               what painters share
src/game/game.ts               input, interaction, casting, health, hints, ambient leaves and flames
src/game/player.ts             walking, jumping, collisions
src/game/spells.ts             elements, patches, combos, lightning, trumps
src/game/fx.ts                 dynamic dab pool, moving lights, shake and flash
src/game/shades.ts             Shades
src/game/cards.ts              cards in the world (painted from their art), the hand of cards
src/game/cardData.ts           generated: titles, suits, meanings, image paths
src/game/wind.ts               the gust function for sound and leaves
src/ui/hands.ts                pixel hands, lantern flame, card miniature, hearts
src/ui/hud.ts                  title, count, names, hints, prompts, the reading
src/audio.ts                   all sound, synthesized with Web Audio
scripts/prepare-cards.mjs      downsizes the card art into public/cards and writes cardData.ts
tools/cdp.js                   a small DevTools-protocol client for headless Chrome
tools/drive.js                 the driver: plays the game headless and writes screenshots
tools/look.js                  screenshots from given places
tools/perf.js                  frame times in a windowed Chrome
tools/hands.html               the hand bench: the painted hands alone, enlarged (open under pnpm dev)
tools/handshot.js              screenshot of the hand bench
```

## Card art

`node scripts/prepare-cards.mjs [~/mydev/void-tarot]` reads the deck (read-only) and writes 420 px tall
JPEGs to `public/cards/` (about 3.4 MB) and `src/game/cardData.ts`. It uses macOS `sips`.

## The driver

Start the game (`pnpm dev`), then:

```bash
node tools/drive.js http://localhost:5173/ /tmp/void-tarot-world-shots
```

It opens the game in headless Chrome (Metal ANGLE), walks, takes a card with `E`, lays oil and sets it off,
charges a pool with air and zaps it, throws every element, fights a Shade, casts the Tower and the Sun,
sits with the seer, and captures the title and the running game. It writes PNGs, prints checks and frame
times, and exits non-zero on any failed check or any script error. `node tools/perf.js <url>` measures
frame times in a windowed Chrome.

## Sound

All sound is synthesized at run time with the Web Audio API (no recordings): wind that follows the gusts,
steps on road, grass and water, the lantern's hiss, a low drone with far bells, card pick-up, throws, each
element, the explosion, the zap, Shade cries. It starts on the first click.
