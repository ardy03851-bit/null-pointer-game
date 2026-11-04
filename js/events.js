/* ============================================================
   NULL POINTER — events.js
   The horror director. No jumpscares — only wrongness.
   A timeline of small events keyed to time survived and
   fragments recovered, plus ambient random whispers, watcher
   sightings, and glitches that scale with dread level.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  function Director(game) {
    this.game = game;
    this.t = 0;                 // seconds since run start
    this.dread = 0;             // 0..1 overall wrongness
    this.nextAmbient = 14;      // next ambient whisper time
    this.nextWatcher = 26;      // next watcher sighting time
    this.watcherCooldown = 0;
    this.firedLog = new Set();
  }

  Director.prototype.update = function (dt) {
    const g = this.game;
    this.t += dt;

    // dread rises with fragments and time (slowly)
    const targetDread = Math.min(1, g.fragmentsTaken * 0.22 + this.t / 900);
    this.dread += (targetDread - this.dread) * dt * 0.2;

    // ---------- one-shot scripted beats ----------
    this.beat(20, () => {
      g.log('process watcher attached', true);
      NP.Audio.hum(0.6);
    });
    this.beat(75, () => g.log('there are 4 fragments. there were 4 others', true));
    this.beat(150, () => g.log('you have been here before', true));

    // fragment-driven beats
    if (g.fragmentsTaken >= 1 && !this.firedLog.has('f1')) {
      this.firedLog.add('f1');
      g.renderer.flashLight();
      g.lightFlicker = 0.6;
      NP.Audio.glitchSting(0.5);
      g.log('memory integrity compromised', true);
    }
    if (g.fragmentsTaken >= 2 && !this.firedLog.has('f2')) {
      this.firedLog.add('f2');
      g.renderer.corrupt(0.35);
      NP.Audio.hum(1.2);
    }
    if (g.fragmentsTaken >= 3 && !this.firedLog.has('f3')) {
      this.firedLog.add('f3');
      g.playerFlicker = 6.5; // '@' flickers to '&' for a while
      g.log('who is typing', true);
    }
    if (g.fragmentsTaken >= 4 && !this.firedLog.has('f4')) {
      this.firedLog.add('f4');
      // a ghost of you remains at the spawn room
      g.ghost = { x: g.world.spawn.x, y: g.world.spawn.y, active: true };
      g.renderer.corrupt(0.5);
      g.log('exit node stabilized. it is watching you leave', true);
    }

    // ---------- ambient cadence ----------
    if (this.t > this.nextAmbient) {
      this.nextAmbient = this.t + (24 + Math.random() * 40) / (0.6 + this.dread);
      NP.Audio.whisper();
      // sometimes a faint glitch accompanies it
      if (Math.random() < 0.4 + this.dread * 0.4) {
        g.renderer.corrupt(0.08 + Math.random() * 0.12);
      }
    }

    // small random screen shiver, more often as dread rises
    if (Math.random() < dt * (0.01 + this.dread * 0.06)) {
      g.renderer.corrupt(0.05 + Math.random() * 0.15 * (0.5 + this.dread));
    }

    // ---------- the watcher ----------
    this.watcherCooldown -= dt;
    if (this.t > this.nextWatcher && this.watcherCooldown <= 0) {
      this.nextWatcher = this.t + 40 + Math.random() * 50;
      this.spawnWatcher();
    }
    const w = g.watcher;
    if (w.active) {
      const d = Math.hypot(w.x - g.player.x, w.y - g.player.y);
      w.life -= dt;
      // vanishes when approached, or after lingering unseen
      if (d < 4.5 || w.life <= 0) {
        w.active = false;
        this.watcherCooldown = 12;
        if (d < 4.5) {
          // silent disappearance + a whisper, no sting
          NP.Audio.whisper();
          g.log('signal lost', true);
        }
      }
    }

    // ghost interaction: seeing your own residue up close
    if (g.ghost && g.ghost.active) {
      const d = Math.hypot(g.ghost.x - g.player.x, g.ghost.y - g.player.y);
      if (d < 2.2) {
        g.ghost.active = false;
        NP.Audio.whisper();
        g.log('it was you', true);
      }
    }
  };

  Director.prototype.beat = function (time, fn) {
    const key = 't' + time;
    if (this.t >= time && !this.firedLog.has(key)) {
      this.firedLog.add(key);
      fn();
    }
  };

  Director.prototype.spawnWatcher = function () {
    const g = this.game;
    const p = g.player;
    // stand it in a dark corridor 9-14 cells away, roughly ahead of the player
    for (let tries = 0; tries < 40; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 9 + Math.random() * 5;
      const x = Math.round(p.x + Math.cos(ang) * dist) + 0.5;
      const y = Math.round(p.y + Math.sin(ang) * dist) + 0.5;
      if (x < 1 || y < 1 || x > g.world.W - 2 || y > g.world.H - 2) continue;
      if (g.world.solidAt(x, y)) continue;
      // don't spawn inside a room with the player; prefer corridors — any floor works
      g.watcher = { x, y, active: true, life: 9 + Math.random() * 8 };
      NP.Audio.hum(0.8);
      return;
    }
  };

  NP.Director = Director;
})();
