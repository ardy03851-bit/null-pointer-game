/* ============================================================
   NULL POINTER — render.js (v2)
   Draws the ASCII world into an offscreen 2D canvas (the
   "scene buffer"), which the WebGL PostFX pipeline then pushes
   through the shader chain. Adds: flowing data rivers, drifting
   glyph debris, sentinel afterimages, ghost echo, null-zone
   darkness, sprint trail.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const CHUNK = 24;

  function Renderer(sceneCanvas) {
    this.scene = sceneCanvas;
    this.ctx = sceneCanvas.getContext('2d');
    this.cell = 18;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.viewW = 0;
    this.viewH = 0;
    this.chunks = new Map();
    this.camX = 0;
    this.camY = 0;
    this.time = 0;

    this.glitch = 0;        // 2D glyph corruption severity
    this.swapCells = [];

    this.debris = [];       // floating glyph motes
    this._initDebris();

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  Renderer.prototype._resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    this.cell = Math.max(13, Math.min(22, Math.round(Math.min(w / 64, h / 40))));
    this.viewW = w;
    this.viewH = h;
    this.scene.width = Math.round(w * this.dpr);
    this.scene.height = Math.round(h * this.dpr);
    this.chunks.clear();
  };

  Renderer.prototype.resize = function () { this._resize(); };

  Renderer.prototype._initDebris = function () {
    this.debris = [];
    for (let i = 0; i < 34; i++) {
      this.debris.push({
        x: Math.random() * 200, y: Math.random() * 120,
        ch: '.,:\';`~*+-'[Math.floor(Math.random() * 11)],
        speed: 0.15 + Math.random() * 0.3,
        drift: Math.random() * Math.PI * 2,
      });
    }
  };

  Renderer.prototype._glyphFont = function (px, weight) {
    return (weight || '') + ' ' + Math.round(px) + 'px "JetBrains Mono", monospace';
  };

  /* ---------------- chunk cache ---------------- */

  Renderer.prototype._getChunk = function (world, cx, cy) {
    const key = cx + ',' + cy;
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
        // sevens-room floors glow faintly wrong
        if (world.decor[i] === 2 && g === '.') col === null;
        c2.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
        c2.fillText(g, lx * this.cell + this.cell / 2, ly * this.cell + this.cell / 2);
      }
    }
    ch = { canvas: cv };
    this.chunks.set(key, ch);
    return ch;
  };

  /* ---------------- main draw ---------------- */

  Renderer.prototype.render = function (game, dt) {
    this.time += dt;
    const ctx = this.ctx;
    const world = game.world;
    const p = game.player;

    // camera: follow with velocity look-ahead (fast-paced framing)
    const lookX = p.x + p.vx * 0.28;
    const lookY = p.y + p.vy * 0.28;
    const targetX = lookX - this.viewW / this.cell / 2;
    const targetY = lookY - this.viewH / this.cell / 2;
    const k = Math.min(1, dt * 7);
    this.camX += (targetX - this.camX) * k;
    this.camY += (targetY - this.camY) * k;
    this.camX = Math.max(0, Math.min(world.W - this.viewW / this.cell, this.camX));
    this.camY = Math.max(0, Math.min(world.H - this.viewH / this.cell, this.camY));

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#04070c';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const offX = -this.camX * this.cell;
    const offY = -this.camY * this.cell;
    const cell = this.cell;
    const px0 = Math.floor(this.camX), py0 = Math.floor(this.camY);
    const cols = Math.ceil(this.viewW / cell) + 1;
    const rows = Math.ceil(this.viewH / cell) + 1;
    const sx = (wx) => wx * cell + offX;
    const sy = (wy) => wy * cell + offY;

    // ---- static world ----
    ctx.imageSmoothingEnabled = false;
    const c0x = Math.floor(px0 / CHUNK), c0y = Math.floor(py0 / CHUNK);
    const c1x = Math.floor((px0 + cols) / CHUNK), c1y = Math.floor((py0 + rows) / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const ch = this._getChunk(world, cx, cy);
        ctx.drawImage(ch.canvas, cx * CHUNK * cell + offX, cy * CHUNK * cell + offY, CHUNK * cell, CHUNK * cell);
      }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ---- data rivers: flowing digits along corridors ----
    ctx.font = this._glyphFont(cell * 0.85);
    for (const river of world.rivers) {
      if (river.y < py0 - 1 || river.y > py0 + rows + 1) continue;
      const len = river.x1 - river.x0;
      const speed = 3.2 * river.dir;
      for (let n = 0; n < Math.ceil(len / 4); n++) {
        const t = ((this.time * speed * 0.25 + n * 4) % len + len) % len;
        const wx = river.x0 + t;
        if (wx < px0 || wx > px0 + cols) continue;
        if (world.solidAt(wx, river.y)) continue;
        const a = 0.10 + 0.08 * Math.sin(this.time * 2 + n);
        ctx.fillStyle = 'rgba(124,232,213,' + a.toFixed(3) + ')';
        ctx.fillText(String(Math.floor((this.time * 3 + n * 7) % 10)), sx(wx), sy(river.y + 0.5));
      }
    }

    // ---- drifting glyph debris ----
    ctx.font = this._glyphFont(cell * 0.7);
    for (const d of this.debris) {
      d.y -= d.speed * dt;
      d.x += Math.sin(this.time * 0.4 + d.drift) * 0.08 * dt;
      const wx = d.x, wy = d.y;
      if (wx < px0 - 2 || wx > px0 + cols + 2 || wy < py0 - 2 || wy > py0 + rows + 2) {
        // respawn at bottom of view
        d.x = px0 + Math.random() * cols;
        d.y = py0 + rows + 1;
        continue;
      }
      if (world.solidAt(d.x, d.y)) continue;
      const a = 0.05 + 0.04 * Math.sin(this.time + d.drift);
      ctx.fillStyle = 'rgba(159,184,196,' + a.toFixed(3) + ')';
      ctx.fillText(d.ch, sx(d.x), sy(d.y));
    }

    // ---- residue digit flicker (sevens room shows only 7s) ----
    ctx.font = this._glyphFont(cell * 0.85);
    for (let n = 0; n < 9; n++) {
      const wx = px0 + Math.floor(Math.random() * cols);
      const wy = py0 + Math.floor(Math.random() * rows);
      if (wx < 0 || wy < 0 || wx >= world.W || wy >= world.H) continue;
      const i = world.idx(wx, wy);
      if (!world.decor[i]) continue;
      const zone = world.ZONES[world.zoneOf[i]];
      const isSeven = world.decor[i] === 2;
      ctx.fillStyle = isSeven
        ? 'rgba(196,69,94,0.55)'
        : 'rgba(' + zone.wall.join(',') + ',0.5)';
      ctx.fillText(isSeven ? '7' : String(Math.floor(Math.random() * 10)), sx(wx + 0.5), sy(wy + 0.5));
    }

    // ---- exit node ----
    if (!game.exitReached) {
      const pulse = 1.35 + Math.sin(this.time * 2.4) * 0.28;
      ctx.font = this._glyphFont(cell * pulse, '700 ');
      ctx.fillStyle = game.fragmentsLeft === 0 ? 'rgb(124,232,213)' : 'rgb(96,110,118)';
      ctx.fillText('$', sx(game.world.exit.x), sy(game.world.exit.y));
    }

    // ---- fragments ----
    for (const f of game.world.fragments) {
      if (f.taken) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d > 28) continue;
      const s = 0.9 + Math.sin(this.time * 3 + f.flicker) * 0.25 + Math.max(0, (10 - d) * 0.05);
      ctx.font = this._glyphFont(cell * s, '700 ');
      ctx.fillStyle = 'rgb(232,163,76)';
      ctx.fillText('*', sx(f.x), sy(f.y));
    }

    // ---- sentinels ----
    for (const s of game.sentinels) {
      if (s.state === 'stunned' && s.stunTimer < 0) continue;
      // afterimages
      ctx.font = this._glyphFont(cell * 0.95, '700 ');
      for (const t of s.trail) {
        ctx.fillStyle = 'rgba(196,69,94,' + (t.life * 0.5).toFixed(3) + ')';
        ctx.fillText('E', sx(t.x), sy(t.y));
      }
      const visible = s.state !== 'stunned';
      if (visible) {
        const bob = Math.sin(this.time * 6 + s.seed) * 0.06;
        ctx.font = this._glyphFont(cell * (1.15 + bob), '700 ');
        ctx.fillStyle = s.state === 'chase' ? 'rgb(228,60,80)' : 'rgb(178,60,78)';
        ctx.fillText('E', sx(s.x), sy(s.y));
      } else {
        // dissolving after a hit
        ctx.font = this._glyphFont(cell * (1 + Math.random() * 0.3), '700 ');
        ctx.fillStyle = 'rgba(196,69,94,' + (Math.random() * 0.5).toFixed(3) + ')';
        ctx.fillText('%', sx(s.x), sy(s.y));
      }
    }

    // ---- ghost echo ----
    if (game.ghost && game.ghost.active) {
      const g = game.ghost;
      if (g.dissolve > 0) {
        ctx.font = this._glyphFont(cell * 1.2, '700 ');
        for (let n = 0; n < 5; n++) {
          ctx.fillStyle = 'rgba(159,184,196,' + (Math.random() * 0.4 * g.dissolve).toFixed(3) + ')';
          ctx.fillText('%&@#E'[Math.floor(Math.random() * 5)],
            sx(g.x + (Math.random() - 0.5) * 2), sy(g.y + (Math.random() - 0.5) * 2));
        }
      } else {
        ctx.font = this._glyphFont(cell, '700 ');
        ctx.fillStyle = 'rgba(159,184,196,0.20)';
        ctx.fillText('@', sx(g.x), sy(g.y));
      }
    }

    // ---- watcher (drawn under and faintly over darkness) ----
    if (game.watcher.active) {
      ctx.font = this._glyphFont(cell * 1.9, '700 ');
      ctx.fillStyle = 'rgba(150,60,80,0.85)';
      ctx.fillText('&', sx(game.watcher.x), sy(game.watcher.y));
    }

    // ---- player ----
    let pGlyph = '@';
    if (game.playerFlicker > 0 && Math.random() < 0.3) pGlyph = '&';
    ctx.font = this._glyphFont(cell, '700 ');
    ctx.fillStyle = pGlyph === '@' ? 'rgb(225,242,248)' : 'rgb(196,69,94)';
    ctx.fillText(pGlyph, sx(p.x), sy(p.y));

    // ---- trail ----
    ctx.font = this._glyphFont(cell * 0.8);
    for (const t of game.trail) {
      const a = (t.life / 1.4) * (t.sprint ? 0.4 : 0.26);
      ctx.fillStyle = 'rgba(159,184,196,' + a.toFixed(3) + ')';
      ctx.fillText("'", sx(t.x), sy(t.y));
    }

    // ---- null zones: the light simply isn't there ----
    for (const nz of world.nullZones) {
      const cx = sx(nz.x), cy = sy(nz.y);
      const r = nz.r * cell * 1.4;
      if (cx < -r || cx > this.viewW + r || cy < -r || cy > this.viewH + r) continue;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(1,2,5,0.92)');
      grad.addColorStop(0.7, 'rgba(1,2,5,0.7)');
      grad.addColorStop(1, 'rgba(1,2,5,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // ---- darkness / light ----
    const px = sx(p.x), py = sy(p.y);
    const lr = game.lightRadius * cell;
    const flick = 1 + Math.sin(this.time * 1.7) * 0.015 + (game.lightFlicker > 0 ? Math.random() * 0.35 : 0);
    const grad = ctx.createRadialGradient(px, py, lr * 0.30 * flick, px, py, lr * flick);
    grad.addColorStop(0, 'rgba(3,6,12,0)');
    grad.addColorStop(0.55, 'rgba(3,6,12,0.25)');
    grad.addColorStop(0.82, 'rgba(3,6,12,0.78)');
    grad.addColorStop(1, 'rgba(3,6,12,0.955)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // teal light tint near the player
    const tint = ctx.createRadialGradient(px, py, 0, px, py, lr * 0.5);
    tint.addColorStop(0, 'rgba(124,232,213,0.05)');
    tint.addColorStop(1, 'rgba(124,232,213,0)');
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // watcher bleeding through the dark
    if (game.watcher.active) {
      ctx.font = this._glyphFont(cell * 1.9, '700 ');
      ctx.fillStyle = 'rgba(150,60,80,0.14)';
      ctx.fillText('&', sx(game.watcher.x), sy(game.watcher.y));
    }

    // ---- glyph corruption pass ----
    this._drawSwaps(world, sx, sy, cell, ctx, dt);
  };

  Renderer.prototype._drawSwaps = function (world, sx, sy, cell, ctx, dt) {
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
      s.life -= dt;
      if (s.life <= 0) this.swapCells.splice(i, 1);
    }
    this.glitch = Math.max(0, this.glitch - dt * 1.4);
  };

  Renderer.prototype.corrupt = function (severity) {
    this.glitch = Math.min(1, this.glitch + severity);
  };

  NP.Renderer = Renderer;
})();
