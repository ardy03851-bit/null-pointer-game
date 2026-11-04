/* ============================================================
   NULL POINTER — main.js
   Game state, loop, HUD, screens. Everything character-shaped.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const titleScreen = $('title-screen');
  const bootLog = $('boot-log');
  const titleBlock = $('title-block');
  const startBtn = $('start-btn');
  const hud = $('hud');
  const sectorEl = $('sector');
  const integrityEl = $('integrity');
  const integrityVal = $('integrity-val');
  const fragCounter = $('frag-counter');
  const logEl = $('log');
  const fpsEl = $('fps');
  const promptEl = $('prompt');
  const touchUI = $('touch-ui');
  const interactBtn = $('interact-btn');
  const endScreen = $('end-screen');
  const endText = $('end-text');
  const restartBtn = $('restart-btn');

  const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  /* ---------------- game state ---------------- */

  let game = null;
  let mode = 'title'; // title | play | ending | ended
  let lastTime = 0;
  let rafId = 0;
  let fpsFrames = 0, fpsLast = performance.now();

  function newGame(seed) {
    const world = NP.worldGen.generate(seed);
    return {
      world,
      player: { x: world.spawn.x, y: world.spawn.y, vx: 0, vy: 0 },
      fragmentsTaken: 0,
      fragmentsLeft: 4,
      integrity: 100,
      lightRadius: 10.5,
      lightFlicker: 0,
      playerFlicker: 0,
      trail: [],
      trailTimer: 0,
      stepTimer: 0,
      watcher: { active: false, x: 0, y: 0, life: 0 },
      ghost: null,
      exitReached: false,
      renderer: game ? game.renderer : null, // reuse renderer across runs
      director: null,
      currentZone: -1,
      nearTarget: null,
      endingT: 0,
      log(text, disturbed) { pushLog(text, disturbed); },
    };
  }

  /* ---------------- HUD log (typewriter) ---------------- */

  const logLines = [];
  let logQueue = [];

  function pushLog(text, disturbed) {
    const line = { text: (disturbed ? '! ' : '> ') + text, shown: 0, disturbed: !!disturbed, el: null };
    logQueue.push(line);
    if (logQueue.length > 3) logQueue = logQueue.slice(-3);
  }

  function updateLog(dt) {
    // type out the newest line
    for (const line of logQueue) {
      if (line.shown < line.text.length) {
        line.shown = Math.min(line.text.length, line.shown + dt * 26);
        if (line.shown >= line.text.length) {
          logLines.push(line);
          if (logLines.length > 6) logLines.shift();
          renderLogEl();
        }
      }
    }
    logQueue = logQueue.filter((l) => l.shown < l.text.length || !logLines.includes(l));
  }

  function renderLogEl() {
    logEl.innerHTML = '';
    for (let i = 0; i < logLines.length; i++) {
      const age = logLines.length - 1 - i;
      const div = document.createElement('div');
      div.className = 'line old-' + Math.min(4, age) + (logLines[i].disturbed ? ' disturbed' : '');
      div.textContent = logLines[i].text;
      logEl.appendChild(div);
    }
    const typing = logQueue.find((l) => l.shown < l.text.length);
    if (typing) {
      const div = document.createElement('div');
      div.className = 'line' + (typing.disturbed ? ' disturbed' : '');
      div.textContent = typing.text.slice(0, Math.floor(typing.shown));
      const caret = document.createElement('span');
      caret.className = 'caret';
      caret.textContent = '▌';
      div.appendChild(caret);
      logEl.appendChild(div);
    }
  }

  /* ---------------- update ---------------- */

  function update(dt) {
    const g = game;
    const p = g.player;

    // movement: velocity eases toward target — soft, weighty
    const axes = NP.Input.sampleAxes();
    const SPEED = 6.4;
    const tvx = axes.x * SPEED;
    const tvy = axes.y * SPEED;
    const ease = Math.min(1, dt * 9);
    p.vx += (tvx - p.vx) * ease;
    p.vy += (tvy - p.vy) * ease;

    // per-axis collision so you slide along walls
    const R = 0.34;
    let nx = p.x + p.vx * dt;
    if (!blocked(nx, p.y, R)) p.x = nx; else p.vx = 0;
    let ny = p.y + p.vy * dt;
    if (!blocked(p.x, ny, R)) p.y = ny; else p.vy = 0;

    const moving = Math.hypot(p.vx, p.vy) > 1.2;

    // trail of fading quotes behind you
    if (moving) {
      g.trailTimer -= dt;
      if (g.trailTimer <= 0) {
        g.trailTimer = 0.09;
        g.trail.push({ x: p.x, y: p.y, life: 1.6 });
      }
      // footsteps
      g.stepTimer -= dt;
      if (g.stepTimer <= 0) {
        g.stepTimer = 0.36;
        NP.Audio.step(g.world.zoneAt(p.x, p.y));
      }
    }
    for (let i = g.trail.length - 1; i >= 0; i--) {
      g.trail[i].life -= dt;
      if (g.trail[i].life <= 0) g.trail.splice(i, 1);
    }

    // zone transitions
    const z = g.world.zoneAt(p.x, p.y);
    if (z !== g.currentZone) {
      if (g.currentZone !== -1) pushLog('entering ' + g.world.ZONES[z].name + ' sector');
      g.currentZone = z;
      sectorEl.textContent = g.world.ZONES[z].name;
    }

    // integrity: bleeds away as you stay inside
    g.integrity = Math.max(29, g.integrity - dt * 0.022 - (moving ? dt * 0.008 : 0));

    // flicker timers
    g.lightFlicker = Math.max(0, g.lightFlicker - dt);
    g.playerFlicker = Math.max(0, g.playerFlicker - dt);

    // interactions
    handleInteraction(dt);

    // horror director
    g.director.update(dt);
  }

  function blocked(x, y, r) {
    const w = game.world;
    return (
      w.solidAt(x - r, y - r) || w.solidAt(x + r, y - r) ||
      w.solidAt(x - r, y + r) || w.solidAt(x + r, y + r)
    );
  }

  function handleInteraction(dt) {
    const g = game;
    const p = g.player;
    g.nearTarget = null;

    // fragments
    for (const f of g.world.fragments) {
      if (f.taken) continue;
      if (Math.hypot(f.x - p.x, f.y - p.y) < 1.4) { g.nearTarget = { kind: 'frag', ref: f }; break; }
    }
    // exit
    if (!g.nearTarget && !g.exitReached && Math.hypot(g.world.exit.x - p.x, g.world.exit.y - p.y) < 1.6) {
      g.nearTarget = { kind: 'exit' };
    }

    const hasTarget = !!g.nearTarget;
    if (hasTarget) {
      promptEl.textContent = g.nearTarget.kind === 'frag'
        ? '[E] ACCESS FRAGMENT'
        : g.fragmentsLeft === 0 ? '[E] EXIT PROCESS' : '[E] EXIT NODE — INSUFFICIENT DATA';
      promptEl.classList.remove('hidden');
      if (IS_TOUCH) interactBtn.classList.remove('hidden');
    } else {
      promptEl.classList.add('hidden');
      interactBtn.classList.add('hidden');
    }

    const interactPressed = NP.Input.consumeInteract();
    if (interactPressed && hasTarget) {
      if (g.nearTarget.kind === 'frag') {
        g.nearTarget.ref.taken = true;
        g.fragmentsTaken++;
        g.fragmentsLeft--;
        g.integrity = Math.max(0, g.integrity - 3.5);
        NP.Audio.pickup();
        pushLog('fragment recovered — ' + (4 - g.fragmentsLeft) + '/4');
        if (g.fragmentsLeft === 0) pushLog('exit node located in ' + game.world.zoneName(game.world.exit.x, game.world.exit.y) + ' sector');
      } else {
        if (g.fragmentsLeft > 0) {
          pushLog('exit node rejected: ' + g.fragmentsLeft + ' fragment(s) missing', true);
          NP.Audio.glitchSting(0.3);
          g.renderer.corrupt(0.15);
        } else {
          beginEnding();
        }
      }
    }
  }

  /* ---------------- ending ---------------- */

  function beginEnding() {
    if (mode !== 'play') return;
    mode = 'ending';
    game.exitReached = true;
    NP.Audio.dissolve();
    game.renderer.corrupt(0.9);
    promptEl.classList.add('hidden');
    interactBtn.classList.add('hidden');
  }

  const END_TEXT =
    '> fragment merge complete\n' +
    '> integrity restored: 99.98%\n' +
    '> 0.02% unaccounted\n' +
    '\n' +
    'it is not gone.\n' +
    'it is still in here.\n' +
    'with you.\n' +
    '\n' +
    'NULL POINTER — v0.1 feel test';

  function updateEnding(dt) {
    const g = game;
    g.endingT += dt;
    // cascade of corruption while the program "shuts down"
    if (Math.random() < dt * 6) g.renderer.corrupt(0.2 + Math.random() * 0.3);
    if (g.endingT > 3.2) {
      mode = 'ended';
      endScreen.classList.remove('hidden');
      // type the ending text
      let i = 0;
      const tick = setInterval(() => {
        i += 2;
        endText.textContent = END_TEXT.slice(0, i);
        if (i >= END_TEXT.length) clearInterval(tick);
      }, 24);
    }
  }

  /* ---------------- HUD ---------------- */

  function updateHUD() {
    const g = game;
    integrityVal.textContent = g.integrity.toFixed(1);
    integrityEl.className = g.integrity < 35 ? 'critical' : g.integrity < 60 ? 'warning' : '';
    fragCounter.textContent = 'FRAGMENTS ' + g.fragmentsTaken + '/4';
  }

  /* ---------------- loop ---------------- */

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 1 / 60;

    // fps meter
    fpsFrames++;
    if (now - fpsLast >= 1000) {
      fpsEl.textContent = 'FPS ' + Math.round((fpsFrames * 1000) / (now - fpsLast));
      fpsFrames = 0;
      fpsLast = now;
    }

    if (mode === 'play') {
      update(dt);
      updateLog(dt);
      game.renderer.render(game, dt);
      updateHUD();
    } else if (mode === 'ending') {
      updateEnding(dt);
      game.renderer.render(game, dt);
      updateHUD();
    } else if (game && (mode === 'ended')) {
      // keep faint world behind the end screen
      game.renderer.render(game, dt);
    }

    NP.Input.endFrame();
  }

  /* ---------------- boot / title ---------------- */

  const BOOT_LINES = [
    'NULL POINTER v0.1.0 — bootloader',
    'checking memory .............. degraded',
    'mapping heap ................. 3 sectors',
    'integrity .................... 99.98%',
    'loading user ................. ',
  ];

  function runBoot() {
    let li = 0;
    bootLog.textContent = '';
    const iv = setInterval(() => {
      if (li >= BOOT_LINES.length) {
        clearInterval(iv);
        // the subtle wrong line, then the title
        const ghost = document.createElement('div');
        ghost.textContent = 'user not found. loading ghost.';
        ghost.style.color = '#c4455e';
        bootLog.appendChild(ghost);
        setTimeout(() => {
          titleBlock.classList.remove('hidden');
        }, 500);
        return;
      }
      const div = document.createElement('div');
      div.textContent = BOOT_LINES[li];
      bootLog.appendChild(div);
      li++;
    }, 150);
  }

  function startGame() {
    NP.Audio.start();
    titleScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    if (IS_TOUCH) touchUI.classList.remove('hidden');
    mode = 'play';
    game = newGame(Math.floor(Math.random() * 1e9));
    game.renderer = renderer;
    game.director = new NP.Director(game);
    renderer.resize(); // clears chunk cache with correct sizes
    lastTime = performance.now();
    pushLog('you are inside the program');
    pushLog('recover the 4 memory fragments');
    updateHUD();
  }

  function restart() {
    endScreen.classList.add('hidden');
    endText.textContent = '';
    // clear log state
    logLines.length = 0;
    logEl.innerHTML = '';
    renderer.corrupt(0.2);
    startGame();
  }

  /* ---------------- testing hooks ---------------- */

  window.render_game_to_text = function () {
    if (!game) return JSON.stringify({ mode });
    const g = game;
    return JSON.stringify({
      mode,
      player: { x: +g.player.x.toFixed(2), y: +g.player.y.toFixed(2) },
      velocity: { x: +g.player.vx.toFixed(2), y: +g.player.vy.toFixed(2) },
      sector: g.world.zoneName(g.player.x, g.player.y),
      fragmentsTaken: g.fragmentsTaken,
      fragmentsLeft: g.fragmentsLeft,
      integrity: +g.integrity.toFixed(1),
      exit: { x: g.world.exit.x, y: g.world.exit.y },
      fragments: g.world.fragments.map((f) => ({ x: f.x, y: f.y, taken: f.taken })),
      watcherActive: g.watcher.active,
      nearTarget: g.nearTarget ? g.nearTarget.kind : null,
      trailLen: g.trail.length,
    });
  };

  // exposed for automated testing (playwright teleports)
  window.__gameGet = function () { return game; };

  window.advanceTime = function (ms) {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) {
      const dt = 1 / 60;
      if (mode === 'play') { update(dt); updateLog(dt); game.renderer.render(game, dt); updateHUD(); }
      else if (mode === 'ending') { updateEnding(dt); game.renderer.render(game, dt); }
      else if (game && mode === 'ended') { game.renderer.render(game, dt); }
    }
    NP.Input.endFrame();
  };

  /* ---------------- init ---------------- */

  const renderer = new NP.Renderer(canvas);

  NP.Input.init({
    onKey(code) {
      if (mode === 'title' && (code === 'Enter' || code === 'Space')) startGame();
      if (code === 'KeyM' && NP.Audio.master) {
        NP.Audio.enabled = !NP.Audio.enabled;
        NP.Audio.master.gain.value = NP.Audio.enabled ? 0.55 : 0;
      }
    },
    joystickZone: $('joystick-zone'),
    joystickBase: $('joystick-base'),
    joystickKnob: $('joystick-knob'),
  });

  interactBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    NP.Input.tapInteract();
  });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', restart);

  runBoot();
  rafId = requestAnimationFrame(frame);
})();
