/* ============================================================
   NULL POINTER — entities.js
   Sentinels: patrolling fault handlers ('E'). They see you,
   they hunt you. They will not enter the null zones.
   Ghost: a replay of your own movement, seconds behind you.
   Watcher: the figure at the edge of the light that mirrors
   your steps and is gone when you turn.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const SENTINEL_SPEED_PATROL = 2.6;
  const SENTINEL_SPEED_CHASE = 9.4;
  const SENTINEL_SIGHT = 9.0;
  const SENTINEL_GIVEUP = 4.5; // seconds without LOS

  function makeSentinel(x, y) {
    return {
      x, y,
      vx: 0, vy: 0,
      state: 'patrol',        // patrol | chase | stunned
      target: null,
      loseTimer: 0,
      stunTimer: 0,
      trail: [],
      seed: Math.random() * 100,
      respawn: null,          // {x,y} post for respawns
    };
  }

  function updateSentinel(s, game, dt) {
    const world = game.world;
    const p = game.player;

    if (s.state === 'stunned') {
      s.stunTimer -= dt;
      if (s.stunTimer <= 0 && s.respawn) { s.x = s.respawn.x; s.y = s.respawn.y; s.state = 'patrol'; }
      return;
    }

    const dist = Math.hypot(p.x - s.x, p.y - s.y);
    const los = world.lineOfSight(s.x, s.y, p.x, p.y);
    const playerHidden = world.inNullZone(p.x, p.y);

    // ---- perception ----
    if (s.state === 'patrol') {
      if (dist < SENTINEL_SIGHT && los && !playerHidden) {
        s.state = 'chase';
        game.onSentinelAlert(s);
      }
    }

    if (s.state === 'chase') {
      if (playerHidden || !los) {
        s.loseTimer += dt;
        if (s.loseTimer > SENTINEL_GIVEUP || playerHidden) {
          s.state = 'patrol';
          s.loseTimer = 0;
        }
      } else {
        s.loseTimer = 0;
      }
      // catch
      if (dist < 0.75 && !playerHidden) {
        game.onSentinelHit(s);
        return;
      }
    }

    // ---- movement ----
    let tx, ty, speed;
    if (s.state === 'chase') {
      speed = SENTINEL_SPEED_CHASE;
      // target the player's position with slight lead
      tx = p.x + p.vx * 0.15;
      ty = p.y + p.vy * 0.15;
      // refuse to path into null zones
      if (world.inNullZone(tx, ty)) {
        s.state = 'patrol';
        s.loseTimer = 0;
        tx = s.x; ty = s.y;
      }
    } else {
      speed = SENTINEL_SPEED_PATROL;
      // wander: pick a reachable floor cell ahead, re-pick when close
      if (!s.target || Math.hypot(s.target.x - s.x, s.target.y - s.y) < 0.8) {
        for (let tries = 0; tries < 12; tries++) {
          const ang = Math.random() * Math.PI * 2;
          const d = 4 + Math.random() * 8;
          const nx = s.x + Math.cos(ang) * d;
          const ny = s.y + Math.sin(ang) * d;
          if (!world.solidAt(nx, ny) && !world.inNullZone(nx, ny) && world.lineOfSight(s.x, s.y, nx, ny)) {
            s.target = { x: nx, y: ny };
            break;
          }
        }
        if (!s.target) s.target = { x: s.x, y: s.y };
      }
      tx = s.target.x; ty = s.target.y;
    }

    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const step = Math.min(d, speed * dt);
      const nx = s.x + (dx / d) * step;
      const ny = s.y + (dy / d) * step;
      if (!world.solidAt(nx, s.y)) s.x = nx;
      if (!world.solidAt(s.x, ny)) s.y = ny;
    }

    // afterimage trail
    if (s.state === 'chase') {
      s.trail.push({ x: s.x, y: s.y, life: 0.5 });
    }
    for (let i = s.trail.length - 1; i >= 0; i--) {
      s.trail[i].life -= dt;
      if (s.trail[i].life <= 0) s.trail.splice(i, 1);
    }
  }

  /* ---------------- ghost: your own echo ---------------- */

  function makeGhost() {
    return {
      active: false,
      path: [],            // recorded player positions
      playhead: 0,
      delay: 13.0,         // seconds behind
      dissolve: 0,
      x: 0, y: 0,
    };
  }

  function recordGhost(ghost, player, dt) {
    ghost._rec = (ghost._rec || 0) + dt;
    if (ghost._rec >= 0.1) {
      ghost._rec = 0;
      ghost.path.push({ x: player.x, y: player.y, t: ghost._time });
    }
  }

  function updateGhost(ghost, game, dt) {
    if (!ghost.active || ghost.dissolve > 0) {
      if (ghost.dissolve > 0) ghost.dissolve -= dt;
      return;
    }
    ghost._time = (ghost._time || 0) + dt;
    // find path point at (now - delay)
    const target = ghost._time - ghost.delay;
    while (ghost.playhead < ghost.path.length - 1 && ghost.path[ghost.playhead + 1].t <= target) {
      ghost.playhead++;
    }
    const a = ghost.path[ghost.playhead];
    if (!a) return;
    ghost.x = a.x; ghost.y = a.y;

    // dissolve when the player comes close — it never gets seen up close
    const d = Math.hypot(a.x - game.player.x, a.y - game.player.y);
    if (d < 4.5) {
      ghost.dissolve = 1.2;
      game.onGhostDissolve();
    }
  }

  /* ---------------- watcher: the mirror figure ---------------- */

  function updateWatcher(game, dt) {
    const w = game.watcher;
    if (!w.active) return;
    const p = game.player;
    w.life -= dt;

    // mirror movement: it moves opposite your x, same y — wrong on purpose
    w.x -= p.vx * dt * 0.55;
    w.y += p.vy * dt * 0.3;

    const d = Math.hypot(w.x - p.x, w.y - p.y);
    if (d < 5 || w.life <= 0 || game.world.solidAt(w.x, w.y)) {
      if (d < 5) game.onWatcherVanish();
      w.active = false;
    }
  }

  NP.Entities = {
    makeSentinel, updateSentinel,
    makeGhost, recordGhost, updateGhost,
    updateWatcher,
    SENTINEL_SPEED_CHASE,
  };
})();
