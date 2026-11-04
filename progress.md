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

## v0.2 status — COMPLETE

Everything below ships on top of v0.1:

- **WebGL2 post-processing** (js/gl.js): offscreen scene → bright pass (¼ res) → separable blur → composite shader with barrel distortion, chromatic aberration, glitch bands, up to 4 radial shockwaves (fragment pickups, sentinel hits), bloom, scanlines, grain, vignette + heartbeat pulse, damage flash, dread color grade. Graceful 2D fallback if no WebGL2.
- **Sentinels** (js/entities.js): patrol (2.6 t/s) → line-of-sight chase (9.4 t/s) with movement lead, give-up timer 4.5s, catch < 0.75 → hit (−12 integrity, knockback, damage flash, shockwave), stun + respawn at post, afterimage trail. Walk 7.6 < chase 9.4 < sprint 11.8 — juke, sprint, or hide. Director escalates +2 sentinels at 3 fragments.
- **Sprint + stamina**: Shift (or joystick edge) → 11.8 t/s, stamina 100 draining 27/s, regen 16/s after 0.7s pause; ASCII gauge bottom-left. Light radius widens when sprinting (12.5), collapses in null zones (5.2).
- **Null zones**: 4 dark pockets — sentinels refuse to path in, whispers, faster integrity bleed, hiding works (verified: sentinel disengages).
- **Ghost**: player path recorded at 10Hz; after 2 fragments, replayed 13s delayed as faint `@` with dissolve static when you approach it (< 4.5).
- **Watcher**: spawns every 45–100s, mirrors your movement (opposite x), vanishes when close.
- **World**: 39 rooms, 168×96, 2-wide corridors, sevens room (red 7s), 5 data rivers (flowing digit streams), loop corridor that teleports you back once.
- **Crash flow**: integrity ≤ 0 → SEGFAULT core-dump screen (register dump, "faulting page: yours") with generated backdrop; [REBOOT] restarts.
- **Ending**: cold technical text — "process 0x0002 remains resident. it has your path." HUD hidden during ending/crash.
- **Audio**: layered bed drone + dread cluster (setTargetAtTime), chase layer + tick, heartbeat thump synced to vignette pulse, FM metallic hit, ring-mod whisper, pickup noise-sweep whoosh, dissolve.
- **Assets**: AI-generated backdrops (title / crash / end), dark + low opacity behind text.
- **Boot**: BIOS-style lines, red "user 0x0001: not found", title reveals after.
- **Testing hooks preserved**: window.render_game_to_text(), window.advanceTime(ms), window.__gameGet().

### v0.2 bugs fixed during test

- `const NP` redeclared across plain scripts → SyntaxError (back to `var`)
- `#title-block` had a leftover `hidden` class
- Director referenced `g.renderer` before it was attached (now set in startGame)
- HUD stayed visible behind the end screen (now hidden on ending)

### Verified with Playwright (SwiftShader headless)

Boot→title→start, walk/sprint/stamina, fragment pickup (E + touch EXEC), sentinel patrol→chase→catch→stun→crash→reboot, null-zone hiding, ghost replay, watcher, full ending + restart, iPad touch joystick (edge = sprint) + release, interact button visibility/collection, zero console errors.

## Known gaps / TODO

- No puzzle depth yet — fragments are simple pickups
- Watcher has one behavior only (mirror + vanish)
- No settings screen (mute is M key, undocumented on touch — add a small mute button)
- Ending text is fixed; no variation between runs
- Headless screenshots of end/crash screens hang Playwright's stability wait (GPU-bound rAF); use CDP Page.captureScreenshot

## Next steps for edits

- All files are plain script tags (no modules) so index.html works via file:// — keep it that way
- Renderer: `renderer.corrupt(severity)`; PostFX: `postfx.addWave(x, y, strength)`, shaderState = {glitch, damage, dread, chase, pulse, bloomBoost}
- Director beats keyed on time/fragment counts in js/events.js — the place to add new scares
- World gen: js/world.js `generate(seed)`; zone palettes in ZONES; spawn/fragments/exit placement at bottom
- Testing hooks: window.render_game_to_text(), window.advanceTime(ms), window.__gameGet()
