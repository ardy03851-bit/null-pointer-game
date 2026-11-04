# NULL POINTER

An ASCII horror exploration game that runs entirely in your browser — no build step, no dependencies. You are inside a corrupted program, exploring its memory sectors to recover four lost fragments while something watches from the dark.

Everything in the world — walls, floors, the player, the entity that follows you — is rendered as characters. Letters, digits, punctuation. Different colors and sizes carry all of the art direction.

> v0.1 — feel test build. This version exists to test the style, movement, and atmosphere. Gameplay depth comes later.

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
| Interact | E / Space / Enter | EXEC button (appears near interactables) |
| Mute | M | — |

## Design notes

- **Rendering** — the world is a grid of glyphs drawn to canvas. Static geometry is baked into cached chunk canvases; dynamic glyphs (player `@`, fragments `*`, the watcher `&`, the exit node `$`) are drawn per frame at varying sizes. A radial gradient darkness composited over everything gives the light radius.
- **Horror direction** — no jumpscares. Unease comes from a wrongness scheduler (`js/events.js`): whispers in the ambient drone, glyphs briefly swapping to the wrong character, horizontal screen bands tearing, a watcher figure (`&`) that stands at the edge of your light and silently vanishes when approached, and system logs that stop making sense.
- **Audio** — fully procedural WebAudio (drone, breath noise, footsteps, whispers, glitch stings). No audio files.
- **iPad support** — pointer events, floating touch joystick, safe-area insets, gesture blocking, viewport-fit=cover. Works in Safari full-screen when added to the Home Screen.

## Files

```
index.html        page shell, HUD, touch UI, title & end screens
css/style.css     terminal phosphor styling, scanlines, vignette
js/world.js       procedural world generation (rooms, corridors, sectors)
js/input.js       keyboard + touch joystick input
js/audio.js       procedural WebAudio
js/render.js      ASCII renderer, chunk cache, glitch effects
js/events.js      the horror director (unease scheduler)
js/main.js        game state, loop, HUD wiring
```

## Roadmap (post-feel-test)

- More sector types and room "programs" with distinct ASCII set-pieces
- A second entity type; the watcher evolving across acts
- Puzzles built from glyph manipulation
- Save-free run structure with meta-changes between runs
