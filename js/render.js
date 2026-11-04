/* ============================================================
   NULL POINTER — render.js
   The ASCII renderer. The world is a grid of characters.
   Static cells are baked into chunk canvases (cache); dynamic
   things (player, fragments, watcher, residue flicker) draw
   on top each frame; then darkness (the light radius) is
   composited over everything with a radial gradient.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const CHUNK = 24; // cells per chunk

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 18;         // css px per cell
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = 0;
    this.viewH = 0;
    this.chunks = new Map();
    this.camX = 0;
    this.camY = 0;
    this.time = 0;

    // glitch state
    this.glitch = 0;           // 0..1 severity, decays
    this.rowShifts = [];       // {y, h, dx, life}
    this.swapCells = [];       // {x, y, ch, life}

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  Renderer.prototype._resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    // cell size adapts: smaller screens get smaller glyphs but a similar view
    this.cell = Math.max(13, Math.min(22, Math.round(Math.min(w / 64, h / 40))));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.viewW = w;
    this.viewH = h;
    this.chunks.clear(); // cell size changed → caches invalid
  };

  Renderer.prototype.resize = function () { this._resize(); };

  /* ---------------- chunk cache ---------------- */

  Renderer.prototype._chunkKey = function (cx, cy) { return cx + ',' + cy; };

  Renderer.prototype._getChunk = function (world, cx, cy) {
    const key = this._chunkKey(cx, cy);
    let ch = this.chunks.get(key);
    if (ch) return ch;

    const px = CHUNK * this.cell;
    const cv = document.createElement('canvas');
    cv.width = Math.round(px * this.dpr);
    cv.height = Math.round(px * this.dpr);
    const c2 = cv.getContext('2d');
    c2.scale(this.dpr, this.dpr);
    c2.font = this._glyphFont(this.cell);
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';

    for (let ly = 0; ly < CHUNK; ly++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = cx * CHUNK + lx;
        const wy = cy * CHUNK + ly;
        if (wx < 0 || wy < 0 || wx >= world.W || wy >= world.H) continue;
        const i = world.idx(wx, wy);
        const g = world.cells[i];
        if (!g) continue;
        const zone = world.ZONES[world.zoneOf[i]];
        const col = g === '#' ? zone.wall : g === '.' ? zone.floor : [200, 200, 200];
        c2.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
        c2.fillText(g, lx * this.cell + this.cell / 2, ly * this.cell + this.cell / 2);
      }
    }

    ch = { canvas: cv };
    this.chunks.set(key, ch);
    return ch;
  };

  Renderer.prototype._glyphFont = function (px, weight) {
    return (weight || '') + ' ' + Math.round(px) + 'px "JetBrains Mono", monospace';
  };

  /* ---------------- main draw ---------------- */

  Renderer.prototype.render = function (game, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const world = game.world;
    const p = game.player;

    // camera: smooth follow, clamped to world bounds
    const targetX = p.x - this.viewW / this.cell / 2;
    const targetY = p.y - this.viewH / this.cell / 2;
    this.camX += (targetX - this.camX) * Math.min(1, dt * 6);
    this.camY += (targetY - this.camY) * Math.min(1, dt * 6);
    const maxX = world.W - this.viewW / this.cell;
    const maxY = world.H - this.viewH / this.cell;
    this.camX = Math.max(0, Math.min(maxX, this.camX));
    this.camY = Math.max(0, Math.min(maxY, this.camY));

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#04070c';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const offX = -this.camX * this.cell;
    const offY = -this.camY * this.cell;
    const cell = this.cell;
    const px0 = Math.floor(this.camX), py0 = Math.floor(this.camY);
    const cols = Math.ceil(this.viewW / cell) + 1;
    const rows = Math.ceil(this.viewH / cell) + 1;

    // ---- static world (chunk cache) ----
    ctx.imageSmoothingEnabled = false;
    const c0x = Math.floor(px0 / CHUNK), c0y = Math.floor(py0 / CHUNK);
    const c1x = Math.floor((px0 + cols) / CHUNK), c1y = Math.floor((py0 + rows) / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const ch = this._getChunk(world, cx, cy);
        ctx.drawImage(ch.canvas,
          (cx * CHUNK) * cell + offX, (cy * CHUNK) * cell + offY,
          CHUNK * cell, CHUNK * cell);
      }
    }

    // ---- dynamic glyph layer ----
    const sx = (wx) => wx * cell + offX;
    const sy = (wy) => wy * cell + offY;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // residue digits flicker: a handful of random visible floor cells per frame
    ctx.font = this._glyphFont(cell * 0.85);
    for (let n = 0; n < 7; n++) {
      const wx = px0 + Math.floor(Math.random() * cols);
      const wy = py0 + Math.floor(Math.random() * rows);
      if (wx < 0 || wy < 0 || wx >= world.W || wy >= world.H) continue;
      const i = world.idx(wx, wy);
      if (!world.decor[i]) continue;
      const zone = world.ZONES[world.zoneOf[i]];
      ctx.fillStyle = 'rgba(' + zone.wall.join(',') + ',0.5)';
      ctx.fillText(String(Math.floor(Math.random() * 10)), sx(wx + 0.5), sy(wy + 0.5));
    }

    // exit node: '$' pulses in size — bigger than life
    if (!game.exitReached) {
      const pulse = 1.35 + Math.sin(this.time * 2.4) * 0.28;
      ctx.font = this._glyphFont(cell * pulse, '700 ');
      const i = world.idx(Math.floor(game.world.exit.x), Math.floor(game.world.exit.y));
      const zone = world.ZONES[world.zoneOf[i]];
      ctx.fillStyle = game.fragmentsLeft === 0
        ? 'rgb(124,232,213)'
        : 'rgb(' + Math.round(zone.wall[0] * 0.7) + ',' + Math.round(zone.wall[1] * 0.7) + ',' + Math.round(zone.wall[2] * 0.7) + ')';
      ctx.fillText('$', sx(game.world.exit.x), sy(game.world.exit.y));
    }

    // fragments: '*' pulsing, drawn amber, bigger when near player
    for (const f of game.world.fragments) {
      if (f.taken) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d > 26) continue;
      const s = 0.9 + Math.sin(this.time * 3 + f.flicker) * 0.25 + Math.max(0, (10 - d) * 0.05);
      ctx.font = this._glyphFont(cell * s, '700 ');
      ctx.fillStyle = 'rgb(232,163,76)';
      ctx.fillText('*', sx(f.x), sy(f.y));
    }

    // ghost duplicate (after fragment 4)
    if (game.ghost && game.ghost.active) {
      ctx.font = this._glyphFont(cell, '700 ');
      ctx.fillStyle = 'rgba(159,184,196,0.16)';
      ctx.fillText('@', sx(game.ghost.x), sy(game.ghost.y));
    }

    // the watcher: faint, at the edge of the light — drawn UNDER darkness below,
    // then re-drawn faintly over it so it barely bleeds through.
    if (game.watcher.active) {
      const w = game.watcher;
      ctx.font = this._glyphFont(cell * 1.9, '700 '); // big. looming.
      ctx.fillStyle = 'rgba(150,60,80,0.85)';
      ctx.fillText('&', sx(w.x), sy(w.y));
    }

    // player: '@' — flickers to '&' for single frames late in the game
    let pGlyph = '@';
    if (game.playerFlicker > 0 && Math.random() < 0.35) pGlyph = '&';
    ctx.font = this._glyphFont(cell, '700 ');
    ctx.fillStyle = pGlyph === '@' ? 'rgb(220,238,245)' : 'rgb(196,69,94)';
    ctx.fillText(pGlyph, sx(p.x), sy(p.y));

    // player trail: fading ',' ghosts of where you were
    ctx.font = this._glyphFont(cell * 0.8);
    for (const t of game.trail) {
      const a = t.life / 1.6 * 0.28;
      ctx.fillStyle = 'rgba(159,184,196,' + a.toFixed(3) + ')';
      ctx.fillText("'", sx(t.x), sy(t.y));
    }

    // ---- darkness / light ----
    const px = sx(p.x), py = sy(p.y);
    const r = game.lightRadius * cell;
    const flick = 1 + Math.sin(this.time * 1.7) * 0.015 + (game.lightFlicker > 0 ? Math.random() * 0.35 : 0);
    const grad = ctx.createRadialGradient(px, py, r * 0.32 * flick, px, py, r * flick);
    grad.addColorStop(0, 'rgba(3,6,12,0)');
    grad.addColorStop(0.55, 'rgba(3,6,12,0.25)');
    grad.addColorStop(0.82, 'rgba(3,6,12,0.78)');
    grad.addColorStop(1, 'rgba(3,6,12,0.955)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // subtle teal light tint near the player
    const tint = ctx.createRadialGradient(px, py, 0, px, py, r * 0.5);
    tint.addColorStop(0, 'rgba(124,232,213,0.05)');
    tint.addColorStop(1, 'rgba(124,232,213,0)');
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // the watcher barely bleeding through the dark
    if (game.watcher.active) {
      const w = game.watcher;
      ctx.font = this._glyphFont(cell * 1.9, '700 ');
      ctx.fillStyle = 'rgba(150,60,80,0.14)';
      ctx.fillText('&', sx(w.x), sy(w.y));
    }

    // ---- corruption passes ----
    this._drawSwaps(world, sx, sy, cell, ctx);
    this._updateGlitch(dt);
    this._applyRowShifts(ctx);
  };

  /* ---------------- glitch machinery ---------------- */

  Renderer.prototype._drawSwaps = function (world, sx, sy, cell, ctx) {
    // random visible cells briefly show the wrong character
    if (this.glitch > 0.04 && Math.random() < this.glitch) {
      const wx = Math.floor(this.camX + Math.random() * (this.viewW / cell));
      const wy = Math.floor(this.camY + Math.random() * (this.viewH / cell));
      if (wx >= 0 && wy >= 0 && wx < world.W && wy < world.H && world.cells[world.idx(wx, wy)]) {
        this.swapCells.push({ x: wx, y: wy, ch: '01#%&$@?!'[Math.floor(Math.random() * 9)], life: 0.05 + Math.random() * 0.1 });
      }
    }
    ctx.font = this._glyphFont(cell);
    for (let i = this.swapCells.length - 1; i >= 0; i--) {
      const s = this.swapCells[i];
      ctx.fillStyle = 'rgba(196,69,94,0.75)';
      ctx.fillText(s.ch, sx(s.x + 0.5), sy(s.y + 0.5));
    }
  };

  Renderer.prototype._updateGlitch = function (dt) {
    this.glitch = Math.max(0, this.glitch - dt * 1.4);

    for (let i = this.swapCells.length - 1; i >= 0; i--) {
      const s = this.swapCells[i];
      s.life -= dt;
      if (s.life <= 0) this.swapCells.splice(i, 1);
    }
    for (let i = this.rowShifts.length - 1; i >= 0; i--) {
      const r = this.rowShifts[i];
      r.life -= dt;
      if (r.life <= 0) this.rowShifts.splice(i, 1);
    }
  };

  Renderer.prototype._applyRowShifts = function (ctx) {
    for (const r of this.rowShifts) {
      const y = r.y * this.dpr;
      const h = r.h * this.dpr;
      const dx = r.dx * this.dpr;
      // copy the band onto itself, offset — reads its own pixels, fine on canvas
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.canvas, 0, y, this.canvas.width, h, dx, y, this.canvas.width, h);
      // red band edge
      ctx.fillStyle = 'rgba(196,69,94,' + (0.05 * r.life).toFixed(3) + ')';
      ctx.fillRect(0, y, this.canvas.width, h);
      ctx.restore();
    }
  };

  /** trigger a screen glitch burst of a given severity 0..1 */
  Renderer.prototype.corrupt = function (severity) {
    this.glitch = Math.min(1, this.glitch + severity);
    const bands = 1 + Math.round(severity * 5);
    for (let i = 0; i < bands; i++) {
      const y = Math.random() * this.viewH;
      this.rowShifts.push({
        y, h: 8 + Math.random() * 30,
        dx: (Math.random() - 0.5) * 90 * severity,
        life: 0.12 + Math.random() * 0.35,
      });
    }
  };

  Renderer.prototype.flashLight = function () {
    // momentary loss of light — implemented as a strong glitch pulse
    this.corrupt(0.55);
  };

  NP.Renderer = Renderer;
})();
