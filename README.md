# NULL POINTER

An ASCII horror exploration game that runs entirely in your browser — no build step, no dependencies. You are inside a corrupted program, exploring its memory sectors to recover four lost fragments while something watches from the dark.

Everything in the world — walls, floors, the player, the entity that follows you — is rendered as characters. Letters, digits, punctuation. Different colors and sizes carry all of the art direction.

> v0.2 — the program fights back. Sentinels hunt you, your own past self replays behind you, and the entire frame now runs through a WebGL2 post-processing stack.

## Play

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

### Controls

| Action | Keyboard | Touch (iPad) |
|---|---|---|
| Move | WASD / arrows | left thumb anywhere — floating joystick |
| Sprint | hold Shift | push the joystick to its edge |
| Interact | E / Space / Enter | EXEC button (appears near interactables) |
| Mute | M | — |

## How to survive

- Recover the **4 memory fragments**, then reach the **exit node** (`$`) in the deepest sector.
- **Sentinels** (`E`) patrol the program. If one sees you, it chases — faster than you walk, slower than you sprint. Sprinting drains stamina; manage it or get cornered.
- **Null zones** — the dark red pockets where the program has died — are safe hiding places. Sentinels refuse to enter them, and the world there is quieter than it should be.
- Getting caught dumps core. Zero integrity = **SEGFAULT**, run over.

## Design notes

- **Rendering** — the world is a grid of glyphs drawn to an offscreen canvas, then pushed through a WebGL2 post-processing chain: quarter-res bright pass, separable gaussian bloom, barrel distortion, chromatic aberration, glitch bands, radial shockwaves, CRT scanlines, animated grain, and a vignette that pulses with your heartbeat. Falls back to a plain 2D blit if WebGL2 is unavailable.
- **Entities** — sentinels have real AI: patrol, line-of-sight detection, chase with movement lead, give-up timers, and respawn posts. Your movement is recorded and replayed 13 seconds later as a faint `@` — the ghost of your own path. A watcher (`&`) occasionally mirrors your movement at the edge of the light.
- **Horror direction** — no jumpscares. Unease comes from the director (`js/events.js`): dread scales with progress, ambient whispers, glyphs swapping to wrong characters, screen tears, a corridor that sometimes isn't where you left it, and cold system logs (`SIGSEGV`, handler tables growing) instead of narrative captions.
- **Audio** — fully procedural WebAudio: layered drone + dread cluster, chase layer with ticking, heartbeat synced to the visual vignette pulse, FM metallic hits, ring-modulated whispers, footsteps per sector. No audio files.
- **AI-generated backdrops** — the title, crash, and end screens use generated ASCII-adjacent texture art (`assets/img/`), kept dark and low-opacity behind the text.
- **iPad support** — pointer events, floating touch joystick with edge-sprint, safe-area insets, gesture blocking, viewport-fit=cover. Works in Safari full-screen when added to the Home Screen.

## Files

```
index.html        page shell, HUD, touch UI, title / crash / end screens
css/style.css     terminal phosphor styling, scanlines, vignette
js/world.js       procedural world generation (rooms, corridors, sectors, set-pieces)
js/input.js       keyboard + touch joystick input
js/audio.js       procedural WebAudio
js/gl.js          WebGL2 post-processing stack (bloom, distortion, glitch, shockwaves)
js/render.js      ASCII renderer, chunk cache, glyph corruption
js/entities.js    sentinel AI, ghost recorder/replay, watcher
js/events.js      the horror director (dread, escalation, ambient unease)
js/main.js        game state, loop, HUD wiring
assets/img/       generated backdrop art
```

## Roadmap

- More sector types and room "programs" with distinct ASCII set-pieces
- A second entity type; the watcher evolving across acts
- Puzzles built from glyph manipulation
- Save-free run structure with meta-changes between runs
