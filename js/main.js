/* ============================================================
   NULL POINTER — main.js (v2)
   Game state, loop, HUD, screens, PostFX wiring.
   Fast on the feet, cold in the voice.
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
  const staminaEl = $('stamina');
  const logEl = $('log');
  const fpsEl = $('fps');
  const promptEl = $('prompt');
  const touchUI = $('touch-ui');
  const interactBtn = $('interact-btn');
  const endScreen = $('end-screen');
  const endText = $('end-text');
  const restartBtn = $('restart-btn');
  const crashScreen = $('crash-screen');
  const crashText = $('crash-text');
  const rebootBtn = $('reboot-btn');

  const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  /* ---------------- engine objects ---------------- */

  const scene = document.createElement('canvas');   // offscreen 2D scene buffer
  const renderer = new NP.Renderer(scene);
  const postfx = new NP.PostFX(canvas);

  /* ---------------- game state ---------------- */

  let game = null;
  let mode = 'title'; // title | play | ending | ended | crash
  let lastTime = 0;
  let rafId = 0;
  let fpsFrames = 0, fpsLast = performance.now();
  let shaderState = { glitch: 0, damage: 0, dread: 0, chase: 0, pulse: 0, bloomBoost: 0 };

  function newGame(seed) {
    const world = NP.worldGen.generate(seed);
    const g = {
      world,
      player: { x: world.spawn.x, y: world.spawn.y, vx: 0, vy: 0 },
      fragmentsTaken: 0,
      fragmentsLeft: 4,
      integrity: 100,
      stamina: 100,
      staminaDelay: 0,
      lightRadius: 11,
      lightFlicker: 0,
      playerFlicker: 0,
      trail: [],
      trailTimer: 0,
      stepTimer: 0,
      sentinels: world.sentinelPosts.map((p) => Object.assign(NP.Entities.makeSentinel(p.x, p.y), { respawn: { x: p.x, y: p.y } })),
      ghost: NP.Entities.makeGhost(),
      watcher: { active: false, x: 0, y: 0, life: 0 },
      exitReached: false,
      director: null,
      currentZone: -1,
      nearTarget: null,
      endingT: 0,
      log(text, disturbed) { pushLog(text, disturbed); },
      addSentinel() {
        // spawn far from the player
        for (let tries = 0; tries < 40; tries++) {
          const r = world.rooms[Math.floor(Math.random() * world.rooms.length)];
          if (Math.hypot(r.cx + 0.5 - this.player.x, r.cy + 0.5 - this.player.y) > 25) {
            const s = NP.Entities.makeSentinel(r.cx + 0.5, r.cy + 0.5);
            s.respawn = { x: r.cx + 0.5, y: r.cy + 0.5 };
            this.sentinels.push(s);
            return;
          }
        }
      },
      onSentinelAlert() {
        NP.Audio.glitchSting(0.4);
        renderer.corrupt(0.3);
        this.log('ERR: fault handler engaged', true);
      },
      onSentinelHit(s) {
        this.integrity -= 12;
        shaderState.damage = 1;
        NP.Audio.hit();
        renderer.corrupt(0.7);
        postfx.addWave(scene.clientWidth * 0.5, scene.clientHeight * 0.5, 1.0);
        // knockback away from the sentinel
        const dx = this.player.x - s.x, dy = this.player.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        this.player.vx = (dx / d) * 14;
        this.player.vy = (dy / d) * 14;
        s.state = 'stunned';
        s.stunTimer = 9;
        s.trail.length = 0;
        if (this.integrity <= 0) beginCrash();
      },
      onGhostDissolve() {
        NP.Audio.whisper();
        renderer.corrupt(0.5);
        this.log('WARN: duplicate pid terminated', true);
      },
      onWatcherVanish() {
        NP.Audio.whisper();
        this.log('signal lost', true);
      },
    };
    return g;
  }

  /* ---------------- HUD log ---------------- */

  const logLines = [];
  let logQueue = [];

  function pushLog(text, disturbed) {
    const line = { text: (disturbed ? '! ' : '> ') + text, shown: 0, disturbed: !!disturbed };
    logQueue.push(line);
    if (logQueue.length > 3) logQueue = logQueue.slice(-3);
  }

  function updateLog(dt) {
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

  const WALK_SPEED = 7.6;
  const SPRINT_SPEED = 11.8;

  function update(dt) {
    const g = game;
    const p = g.player;

    // ---- sprint & stamina ----
    const wantSprint = NP.Input.sprinting() && Math.hypot(p.vx, p.vy) > 0.5;
    let sprinting = false;
    if (wantSprint && g.stamina > 4) {
      sprinting = true;
      g.stamina = Math.max(0, g.stamina - 27 * dt);
      g.staminaDelay = 0.7;
    } else {
      g.staminaDelay -= dt;
      if (g.staminaDelay <= 0) g.stamina = Math.min(100, g.stamina + 16 * dt);
    }
    const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

    // ---- movement (eased, weighty) ----
    const axes = NP.Input.sampleAxes();
    const ease = Math.min(1, dt * (sprinting ? 11 : 9));
    p.vx += (axes.x * speed - p.vx) * ease;
    p.vy += (axes.y * speed - p.vy) * ease;

    const R = 0.34;
    let nx = p.x + p.vx * dt;
    if (!blocked(nx, p.y, R)) p.x = nx; else p.vx = 0;
    let ny = p.y + p.vy * dt;
    if (!blocked(p.x, ny, R)) p.y = ny; else p.vy = 0;

    const moving = Math.hypot(p.vx, p.vy) > 1.2;

    // ---- trail ----
    if (moving) {
      g.trailTimer -= dt;
      if (g.trailTimer <= 0) {
        g.trailTimer = sprinting ? 0.05 : 0.09;
        g.trail.push({ x: p.x, y: p.y, life: sprinting ? 1.4 : 1.0, sprint: sprinting });
      }
      g.stepTimer -= dt;
      if (g.stepTimer <= 0) {
        g.stepTimer = sprinting ? 0.26 : 0.36;
        NP.Audio.step(g.world.zoneAt(p.x, p.y), sprinting);
      }
    }
    for (let i = g.trail.length - 1; i >= 0; i--) {
      g.trail[i].life -= dt;
      if (g.trail[i].life <= 0) g.trail.splice(i, 1);
    }

    // ---- null zone: the light is thinner there ----
    const inNull = g.world.inNullZone(p.x, p.y);
    const targetLight = inNull ? 5.2 : sprinting ? 12.5 : 11;
    g.lightRadius += (targetLight - g.lightRadius) * Math.min(1, dt * 4);
    if (inNull && Math.random() < dt * 0.5) NP.Audio.whisper();

    // ---- zone transitions ----
    const z = g.world.zoneAt(p.x, p.y);
    if (z !== g.currentZone) {
      if (g.currentZone !== -1) pushLog('entering ' + g.world.ZONES[z].name + ' sector');
      g.currentZone = z;
      sectorEl.textContent = g.world.ZONES[z].name;
    }

    // ---- integrity: slow bleed, faster in .NULL ----
    g.integrity = Math.max(0, g.integrity - dt * (0.02 + (z === 2 ? 0.045 : 0) + (moving ? 0.008 : 0)));
    if (g.integrity <= 0) { beginCrash(); return; }

    g.lightFlicker = Math.max(0, g.lightFlicker - dt);
    g.playerFlicker = Math.max(0, g.playerFlicker - dt);

    // ---- sentinels ----
    for (const s of g.sentinels) NP.Entities.updateSentinel(s, g, dt);

    // ---- ghost ----
    NP.Entities.recordGhost(g.ghost, p, dt);
    NP.Entities.updateGhost(g.ghost, g, dt);

    // ---- director ----
    g.director.update(dt);

    // ---- audio state ----
    NP.Audio.updateState(g, dt);

    // ---- interactions ----
    handleInteraction(dt);

    // ---- shader state ----
    const chaseLevel = g.sentinels.some((s) => s.state === 'chase') ? 1 : 0;
    shaderState.chase += (chaseLevel - shaderState.chase) * Math.min(1, dt * 2);
    shaderState.dread = g.director.dread;
    shaderState.glitch = Math.min(1, shaderState.glitch + renderer.glitch * 0.6);
    shaderState.damage = Math.max(0, shaderState.damage - dt * 1.6);
    // heartbeat pulse visual (synced-ish with audio thump)
    if (shaderState.chase > 0.1) {
      const period = 0.9 - shaderState.chase * 0.35;
      const phase = ((performance.now() / 1000) % period) / period;
      shaderState.pulse = shaderState.chase * Math.max(0, Math.sin(phase * Math.PI)) * 0.8;
    } else {
      shaderState.pulse *= Math.max(0, 1 - dt * 3);
    }
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

    for (const f of g.world.fragments) {
      if (f.taken) continue;
      if (Math.hypot(f.x - p.x, f.y - p.y) < 1.4) { g.nearTarget = { kind: 'frag', ref: f }; break; }
    }
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
        g.integrity = Math.min(100, g.integrity + 6);
        NP.Audio.pickup();
        postfx.addWave(scene.clientWidth * 0.5, scene.clientHeight * 0.5, 1.2);
        renderer.corrupt(0.2);
        pushLog('fragment recovered — ' + (4 - g.fragmentsLeft) + '/4');
        if (g.fragmentsLeft === 0) pushLog('exit node located in ' + g.world.zoneName(g.world.exit.x, g.world.exit.y) + ' sector');
        if (g.fragmentsTaken === 1) { g.lightFlicker = 0.6; NP.Audio.glitchSting(0.5); }
        if (g.fragmentsTaken === 3) { g.playerFlicker = 6.5; g.log('ERR: user checksum changed', true); }
      } else {
        if (g.fragmentsLeft > 0) {
          pushLog('exit node rejected: ' + g.fragmentsLeft + ' fragment(s) missing', true);
          NP.Audio.glitchSting(0.3);
          renderer.corrupt(0.15);
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
    hud.classList.add('hidden');
    touchUI.classList.add('hidden');
    interactBtn.classList.add('hidden');
    NP.Audio.dissolve();
    renderer.corrupt(0.9);
    shaderState.glitch = 0.8;
    promptEl.classList.add('hidden');
  }

  const END_TEXT =
    '> merge complete\n' +
    '> integrity restored: 99.98%\n' +
    '> unaccounted: 0.02% (0x0002)\n' +
    '\n' +
    'process 0x0002 remains resident.\n' +
    'it has your path.';

  function updateEnding(dt) {
    const g = game;
    g.endingT += dt;
    if (Math.random() < dt * 6) { renderer.corrupt(0.2 + Math.random() * 0.3); shaderState.glitch = Math.min(1, shaderState.glitch + 0.2); }
    if (g.endingT > 3.2) {
      mode = 'ended';
      endScreen.classList.remove('hidden');
      let i = 0;
      const tick = setInterval(() => {
        i += 2;
        endText.textContent = END_TEXT.slice(0, i);
        if (i >= END_TEXT.length) clearInterval(tick);
      }, 24);
    }
  }

  /* ---------------- crash ---------------- */

  function beginCrash() {
    if (mode !== 'play') return;
    mode = 'crash';
    NP.Audio.dissolve();
    shaderState.glitch = 1;
    shaderState.damage = 1;
    promptEl.classList.add('hidden');
    interactBtn.classList.add('hidden');
    hud.classList.add('hidden');
    touchUI.classList.add('hidden');
    crashScreen.classList.remove('hidden');
    const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    crashText.textContent =
      'SEGMENTATION FAULT\n' +
      'core dumped at 0x' + hex() + '\n\n' +
      '  rax ' + hex() + '   rbx ' + hex() + '\n' +
      '  rcx 00000000deadbeef   rdx ' + hex() + '\n' +
      '  rsi 0000000000000002   rdi ' + hex() + '\n' +
      '  rip ' + hex() + '   efl 0000000000010246\n\n' +
      'user integrity: 0.0%\n' +
      'faulting page: yours';
  }

  /* ---------------- HUD ---------------- */

  function updateHUD() {
    const g = game;
    integrityVal.textContent = g.integrity.toFixed(1);
    integrityEl.className = g.integrity < 35 ? 'critical' : g.integrity < 60 ? 'warning' : '';
    fragCounter.textContent = 'FRAGMENTS ' + g.fragmentsTaken + '/4';
    // stamina as an ASCII gauge
    const bars = Math.round(g.stamina / 100 * 14);
    staminaEl.textContent = 'RUN [' + '#'.repeat(bars) + '.'.repeat(14 - bars) + ']';
  }

  /* ---------------- loop ---------------- */

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 1 / 60;

    fpsFrames++;
    if (now - fpsLast >= 1000) {
      fpsEl.textContent = 'FPS ' + Math.round((fpsFrames * 1000) / (now - fpsLast));
      fpsFrames = 0;
      fpsLast = now;
    }

    if (mode === 'play') {
      update(dt);
      updateLog(dt);
      renderer.render(game, dt);
      postfx.render(scene, shaderState, dt);
      updateHUD();
    } else if (mode === 'ending') {
      updateEnding(dt);
      renderer.render(game, dt);
      postfx.render(scene, shaderState, dt);
      updateHUD();
    } else if (game && (mode === 'ended' || mode === 'crash')) {
      renderer.render(game, dt);
      shaderState.glitch = Math.max(0, shaderState.glitch - dt * 0.3);
      postfx.render(scene, shaderState, dt);
    }

    NP.Input.endFrame();
  }

  /* ---------------- boot / title ---------------- */

  const BOOT_LINES = [
    'NP-BIOS 4.0.1 (rev 2211)',
    'mem check ........ 64K OK',
    'heap map ......... 3 sectors, degraded',
    'sig handlers ...... overwritten',
    'integrity ......... 99.98%',
    'spawn user ........ 0x0001',
  ];

  function runBoot() {
    let li = 0;
    bootLog.textContent = '';
    const iv = setInterval(() => {
      if (li >= BOOT_LINES.length) {
        clearInterval(iv);
        const ghost = document.createElement('div');
        ghost.textContent = 'user 0x0001: not found';
        ghost.style.color = '#c4455e';
        bootLog.appendChild(ghost);
        setTimeout(() => titleBlock.classList.remove('hidden'), 500);
        return;
      }
      const div = document.createElement('div');
      div.textContent = BOOT_LINES[li];
      bootLog.appendChild(div);
      li++;
    }, 160);
  }

  function startGame() {
    NP.Audio.start();
    titleScreen.classList.add('hidden');
    crashScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    if (IS_TOUCH) touchUI.classList.remove('hidden');
    mode = 'play';
    game = newGame(Math.floor(Math.random() * 1e9));
    game.renderer = renderer; // director logs screen corruption via this
    game.director = new NP.Director(game);
    renderer.resize();
    postfx.resize();
    shaderState = { glitch: 0, damage: 0, dread: 0, chase: 0, pulse: 0, bloomBoost: 0 };
    lastTime = performance.now();
    pushLog('you are inside the program');
    pushLog('recover the 4 memory fragments');
    pushLog('avoid the fault handlers');
    updateHUD();
  }

  function restart() {
    endScreen.classList.add('hidden');
    endText.textContent = '';
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
      stamina: +g.stamina.toFixed(0),
      inNullZone: g.world.inNullZone(g.player.x, g.player.y),
      sentinels: g.sentinels.map((s) => ({ x: +s.x.toFixed(1), y: +s.y.toFixed(1), state: s.state })),
      chaseActive: g.sentinels.some((s) => s.state === 'chase'),
      ghostActive: g.ghost.active,
      watcherActive: g.watcher.active,
      exit: { x: g.world.exit.x, y: g.world.exit.y },
      fragments: g.world.fragments.map((f) => ({ x: f.x, y: f.y, taken: f.taken })),
      nearTarget: g.nearTarget ? g.nearTarget.kind : null,
    });
  };

  window.__gameGet = function () { return game; };

  window.advanceTime = function (ms) {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) {
      const dt = 1 / 60;
      if (mode === 'play') { update(dt); updateLog(dt); renderer.render(game, dt); postfx.render(scene, shaderState, dt); updateHUD(); }
      else if (mode === 'ending') { updateEnding(dt); renderer.render(game, dt); postfx.render(scene, shaderState, dt); }
      else if (game && (mode === 'ended' || mode === 'crash')) { renderer.render(game, dt); postfx.render(scene, shaderState, dt); }
    }
    NP.Input.endFrame();
  };

  /* ---------------- init ---------------- */

  NP.Input.init({
    onKey(code) {
      if (mode === 'title' && (code === 'Enter' || code === 'Space')) startGame();
      if (mode === 'crash' && (code === 'Enter' || code === 'Space')) startGame();
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
  rebootBtn.addEventListener('click', startGame);

  runBoot();
  rafId = requestAnimationFrame(frame);
})();
