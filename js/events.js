/* ============================================================
   NULL POINTER — events.js (v2)
   The horror director. No exposition, no corny lines. Only
   things that happen: whispers, glyph corruption, the figure,
   the echo of you, the corridor that is longer than it is.
   System logs, when they appear, are technical and cold —
   the wrongness is in what they report, not in narration.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  function Director(game) {
    this.game = game;
    this.t = 0;
    this.dread = 0;
    this.nextAmbient = 12;
    this.nextWatcher = 30;
    this.watcherCooldown = 0;
    this.fired = new Set();
  }

  Director.prototype.update = function (dt) {
    const g = this.game;
    this.t += dt;

    const targetDread = Math.min(1, g.fragmentsTaken * 0.2 + this.t / 700);
    this.dread += (targetDread - this.dread) * dt * 0.2;

    // ---- ghost activates after the second fragment ----
    if (g.fragmentsTaken >= 2 && !g.ghost.active) {
      g.ghost.active = true;
    }

    // ---- sentinel escalation ----
    if (g.fragmentsTaken >= 3 && g.sentinels.length < 5 && !this.fired.has('escalate')) {
      this.fired.add('escalate');
      g.addSentinel();
      g.addSentinel();
      g.renderer.corrupt(0.4);
      NP.Audio.hum(1.2);
      g.log('ERR: handler table grown', true);
    }

    // ---- ambient cadence ----
    if (this.t > this.nextAmbient) {
      this.nextAmbient = this.t + (22 + Math.random() * 38) / (0.6 + this.dread);
      NP.Audio.whisper();
      if (Math.random() < 0.4 + this.dread * 0.4) {
        g.renderer.corrupt(0.08 + Math.random() * 0.12);
      }
    }

    // ---- random screen shiver ----
    if (Math.random() < dt * (0.012 + this.dread * 0.07)) {
      g.renderer.corrupt(0.05 + Math.random() * 0.15 * (0.5 + this.dread));
    }

    // ---- rare cold log lines (technical, never narrative) ----
    const LINES = [
      'SIGSEGV: address 0x0000 not mapped',
      'ERR: handler 0x07 returned twice',
      'checkpoint delta: -0x02',
      'WARN: pointer 0x1f aliases user',
      'watcher.pid = 1',
      'ERR: clock read 00:00 twice',
    ];
    if (Math.random() < dt * 0.006 + this.dread * dt * 0.01) {
      g.log(LINES[Math.floor(Math.random() * LINES.length)], Math.random() < 0.4);
    }

    // ---- the watcher ----
    this.watcherCooldown -= dt;
    if (this.t > this.nextWatcher && this.watcherCooldown <= 0) {
      this.nextWatcher = this.t + 45 + Math.random() * 55;
      this.spawnWatcher();
    }
    NP.Entities.updateWatcher(g, dt);

    // ---- loop corridor: it happens, nothing explains it ----
    const lc = g.world.loopCorridor;
    if (lc && !lc.used && g.player.x > lc.x0 + 10 && g.player.y > lc.y - 0.5 && g.player.y < lc.y + 2.5) {
      lc.used = true;
      g.player.x = lc.x0 + 1.5;
      g.player.vx = 0;
      g.renderer.corrupt(0.25);
      NP.Audio.whisper();
    }
  };

  Director.prototype.spawnWatcher = function () {
    const g = this.game;
    const p = g.player;
    for (let tries = 0; tries < 40; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 9 + Math.random() * 5;
      const x = Math.round(p.x + Math.cos(ang) * dist) + 0.5;
      const y = Math.round(p.y + Math.sin(ang) * dist) + 0.5;
      if (x < 1 || y < 1 || x > g.world.W - 2 || y > g.world.H - 2) continue;
      if (g.world.solidAt(x, y)) continue;
      g.watcher = { x, y, active: true, life: 10 + Math.random() * 8 };
      NP.Audio.hum(0.8);
      return;
    }
  };

  NP.Director = Director;
})();
