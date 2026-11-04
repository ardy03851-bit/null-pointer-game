# NULL POINTER — development notes

Original prompt: "code a new repository, it's a Web game. index.html and pages. The game is an indie game where your goal is to explore an inside of a corrupted program, but the whole game is rendered in characters and letters and numbers... different colours and sizes. That's the style. Full iPad support. Horror elements that are very nice and creepy — not jumps but subtle things that bring unease. First version: style, movement and feel test, then create the repo."

## v0.1 status (feel test build) — COMPLETE

- ASCII renderer with cached chunk canvases, per-glyph sizes/colors, radial light falloff, scanline/vignette CSS overlay
- Procedural world: 3 sectors (.TEXT cool / .DATA amber / .NULL red), 27 rooms, drunk-walk corridors, doors
- Movement: eased analog velocity (WASD/arrows + floating touch joystick), circle-vs-grid sliding collision, footstep SFX per sector
- Objective: recover 4 fragments (*), then reach the exit node ($) — rejected until all 4 collected
- Horror director (js/events.js): scripted log beats at 20s/75s/150s, fragment-triggered beats (light flicker, drone detune, player glyph flickering @→&, ghost duplicate at spawn), watcher (&) sightings at the light's edge that vanish when approached, ambient whispers, random glyph swaps + horizontal screen-band glitches scaling with dread
- Audio: fully procedural WebAudio — drone with breathing LFO, brown-noise breath, footsteps, detuned pickup chime, whispers, glitch stings, ending dissolve
- iPad: pointer events, floating joystick (left 52% of screen), contextual EXEC button, safe-area insets, gesture/zoom blocking
- Tested end-to-end with Playwright (desktop 1280x800 + iPad emulation 1180x820 touch): boot→start→move→pickups→ending→restart, zero console errors; joystick hold/release verified via CDP touch events

## Known gaps / TODO (deliberate, v0.1 scope)

- No puzzle depth yet — fragments are simple pickups
- Watcher has one behavior only (stand + vanish)
- No settings screen (mute is M key, undocumented on touch — add a small mute button)
- World layout is one static seed per run; no meta-progression between runs
- Ending text is fixed; no variation

## Next steps for edits

- All files are plain script tags (no modules) so index.html works via file:// — keep it that way
- Renderer: `renderer.corrupt(severity)` for glitch bursts, `renderer.flashLight()` for light loss
- Director beats are keyed on time/fragment counts in js/events.js — the place to add new scares
- World gen: js/world.js `generate(seed)`; zone palettes in ZONES; spawn/fragments/exit placement at bottom
- Testing hooks: window.render_game_to_text(), window.advanceTime(ms), window.__gameGet()
