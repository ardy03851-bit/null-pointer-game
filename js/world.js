/* ============================================================
   NULL POINTER — world.js
   Procedural interior of a corrupted program. v2:
   - larger world, wide arteries (2 cells) for fast movement
   - set-pieces: the sevens room, null zones (dark whisper
     pockets sentinels refuse to enter), data rivers,
     one corridor that is longer than it should be
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const WALL = '#';
  const FLOOR = '.';
  const DOOR = '+';
  const EXIT = '$';

  const ZONES = [
    { name: '.TEXT', wall: [96, 132, 148], floor: [42, 58, 68] },
    { name: '.DATA', wall: [148, 122, 82], floor: [66, 52, 32] },
    { name: '.NULL', wall: [138, 74, 88], floor: [56, 30, 38] },
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(seed) {
    const rnd = mulberry32(seed || 1337);
    const W = 168, H = 96;

    const solid = new Uint8Array(W * H).fill(1);
    const idx = (x, y) => y * W + x;
    const rooms = [];

    function placeRoom(x, y, w, h) {
      for (let ry = y; ry < y + h; ry++)
        for (let rx = x; rx < x + w; rx++)
          if (rx > 0 && ry > 0 && rx < W - 1 && ry < H - 1) solid[idx(rx, ry)] = 0;
      rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2), zone: -1 });
    }

    const anchors = [
      { x: 0.12, y: 0.5 }, { x: 0.5, y: 0.42 }, { x: 0.88, y: 0.58 },
    ];
    const PER_ZONE = 13;

    function carve(x, y) {
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) solid[idx(x, y)] = 0;
    }

    // wide corridor: carve 2-wide
    function carveCorridor(x1, y1, x2, y2, wide) {
      let x = x1, y = y1;
      const stepX = () => { while (x !== x2) { x += x < x2 ? 1 : -1; carve(x, y); if (wide) carve(x, y + 1); } };
      const stepY = () => { while (y !== y2) { y += y < y2 ? 1 : -1; carve(x, y); if (wide) carve(x + 1, y); } };
      if (rnd() < 0.5) { stepX(); stepY(); } else { stepY(); stepX(); }
    }

    for (let a = 0; a < anchors.length; a++) {
      const ax = anchors[a].x * W, ay = anchors[a].y * H;
      let last = null;
      for (let i = 0; i < PER_ZONE; i++) {
        let placed = false, tries = 0;
        while (!placed && tries < 90) {
          tries++;
          const w = 8 + Math.floor(rnd() * 11);
          const h = 6 + Math.floor(rnd() * 8);
          const x = Math.floor(ax + (rnd() - 0.5) * W * 0.36);
          const y = Math.floor(ay + (rnd() - 0.5) * H * 0.38);
          if (x < 2 || y < 2 || x + w > W - 2 || y + h > H - 2) continue;
          let overlap = false;
          for (const r of rooms) {
            if (x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y) {
              overlap = true; break;
            }
          }
          if (overlap) continue;
          placeRoom(x, y, w, h);
          const room = rooms[rooms.length - 1];
          room.zone = a;
          if (last) carveCorridor(room.cx, room.cy, last.cx, last.cy, rnd() < 0.55);
          else if (rooms.length > 1) {
            const other = rooms[Math.floor(rnd() * (rooms.length - 1))];
            carveCorridor(room.cx, room.cy, other.cx, other.cy, true); // cross-zone links are always wide
          }
          last = room;
        }
      }
    }

    // ---- doors ----
    const doorGlyphs = new Set();
    for (const r of rooms) {
      for (let rx = r.x; rx < r.x + r.w; rx++) {
        for (const [dx, dy] of [[rx, r.y - 1], [rx, r.y + r.h]]) {
          if (solid[idx(dx, dy)] === 0 && rnd() < 0.45) doorGlyphs.add(idx(dx, dy));
        }
      }
      for (let ry = r.y; ry < r.y + r.h; ry++) {
        for (const [dx, dy] of [[r.x - 1, ry], [r.x + r.w, ry]]) {
          if (solid[idx(dx, dy)] === 0 && rnd() < 0.45) doorGlyphs.add(idx(dx, dy));
        }
      }
    }

    // ---- cells ----
    const cells = new Array(W * H);
    const zoneOf = new Uint8Array(W * H);
    const decor = new Array(W * H).fill(0);   // 1 = residue digit, 2 = sevens-room digit
    const nullZone = new Uint8Array(W * H);   // 1 = null zone (dark pocket)

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        const z = x < W * 0.34 ? 0 : x < W * 0.66 ? 1 : 2;
        zoneOf[i] = z;
        if (solid[i]) {
          const nearOpen =
            (x > 0 && !solid[i - 1]) || (x < W - 1 && !solid[i + 1]) ||
            (y > 0 && !solid[i - W]) || (y < H - 1 && !solid[i + W]);
          cells[i] = nearOpen ? WALL : null;
        } else {
          cells[i] = doorGlyphs.has(i) ? DOOR : FLOOR;
          if (rnd() < 0.05) decor[i] = 1;
        }
      }
    }

    // ---- set-piece: the sevens room ----
    const sevensRoom = rooms.filter((r) => r.zone === 1)[3];
    if (sevensRoom) {
      for (let ry = sevensRoom.y; ry < sevensRoom.y + sevensRoom.h; ry++)
        for (let rx = sevensRoom.x; rx < sevensRoom.x + sevensRoom.w; rx++)
          decor[idx(rx, ry)] = 2;
    }

    // ---- set-piece: null zones (dark pockets) ----
    const nullZones = [];
    for (let n = 0; n < 4; n++) {
      const r = rooms[Math.floor(rnd() * rooms.length)];
      if (!r || r.zone === 0 && n === 0) continue;
      const cx = r.cx, cy = r.cy;
      const rad = 2 + rnd() * 1.5;
      nullZones.push({ x: cx, y: cy, r: rad });
      for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
        for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (Math.hypot(x - cx, y - cy) <= rad && !solid[idx(x, y)]) {
            nullZone[idx(x, y)] = 1;
          }
        }
      }
    }

    // ---- set-piece: data rivers (long corridors get flowing digit streams) ----
    const rivers = [];
    for (let n = 0; n < 5; n++) {
      // find a long horizontal open run
      const y = 3 + Math.floor(rnd() * (H - 6));
      let bestX0 = -1, bestLen = 0, x0 = -1;
      for (let x = 1; x < W - 1; x++) {
        if (!solid[idx(x, y)]) { if (x0 < 0) x0 = x; }
        else { if (x - x0 > bestLen) { bestLen = x - x0; bestX0 = x0; } x0 = -1; }
      }
      if (bestLen > 16) rivers.push({ x0: bestX0, x1: bestX0 + bestLen - 1, y, dir: rnd() < 0.5 ? 1 : -1 });
    }

    // ---- set-piece: the corridor that repeats ----
    // a wide straight corridor: crossing it eastward teleports you back once
    let loopCorridor = null;
    {
      // find a horizontal 2-wide corridor run in zone 2
      for (let tries = 0; tries < 300 && !loopCorridor; tries++) {
        const y = 4 + Math.floor(rnd() * (H - 10));
        let x0 = -1;
        for (let x = 2; x < W - 2; x++) {
          if (!solid[idx(x, y)] && !solid[idx(x, y + 1)]) { if (x0 < 0) x0 = x; }
          else {
            if (x - x0 > 14 && x0 > W * 0.6) { loopCorridor = { x0, x1: x - 1, y, used: false }; break; }
            x0 = -1;
          }
        }
      }
    }

    // ---- spawn / fragments / exit ----
    const spawnRoom = rooms.find((r) => r.zone === 0);
    const spawn = { x: spawnRoom.cx + 0.5, y: spawnRoom.cy + 0.5 };

    const fragRooms = [];
    const used = new Set([spawnRoom]);
    function pickRoom(zone, farFrom) {
      const cands = rooms.filter((r) => r.zone === zone && !used.has(r));
      if (!cands.length) return null;
      cands.sort((a, b) => dist2(b, farFrom) - dist2(a, farFrom));
      const pick = cands[Math.floor(rnd() * Math.min(3, cands.length))];
      used.add(pick);
      return pick;
    }
    for (const r of [pickRoom(2, spawnRoom), pickRoom(1, spawnRoom), pickRoom(0, spawnRoom), pickRoom(1, spawnRoom)]) {
      if (r) fragRooms.push(r);
    }
    while (fragRooms.length < 4) fragRooms.push(rooms[rooms.length - fragRooms.length]);

    const fragments = fragRooms.map((r, i) => ({
      id: i, x: r.cx + 0.5, y: r.cy + 0.5, taken: false, flicker: rnd() * 10,
    }));

    const exitRoom = rooms.slice().sort((a, b) => dist2(b, spawnRoom) - dist2(a, spawnRoom))[0];
    const exit = { x: exitRoom.cx + 0.5, y: exitRoom.cy + 0.5 };
    cells[idx(exitRoom.cx, exitRoom.cy)] = EXIT;

    // ---- sentinel posts ----
    const sentinelPosts = [];
    for (let i = 0; i < 3; i++) {
      const r = rooms.filter((r) => r.zone === 1 + (i % 2) && r !== spawnRoom && !fragRooms.includes(r))[0];
      if (r) sentinelPosts.push({ x: r.cx + 0.5, y: r.cy + 0.5 });
    }

    function dist2(a, b) {
      const dx = a.cx - b.cx, dy = a.cy - b.cy;
      return dx * dx + dy * dy;
    }

    return {
      W, H, cells, zoneOf, decor, nullZone, idx, rivers, loopCorridor, nullZones,
      rooms, fragments, exit, spawn, sentinelPosts,
      solidAt(x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return true;
        return solid[idx(xi, yi)] === 1;
      },
      lineOfSight(x1, y1, x2, y2) {
        const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          if (this.solidAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
        }
        return true;
      },
      inNullZone(x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return false;
        return nullZone[idx(xi, yi)] === 1;
      },
      zoneAt(x, y) {
        const xi = Math.max(0, Math.min(W - 1, Math.floor(x)));
        const yi = Math.max(0, Math.min(H - 1, Math.floor(y)));
        return zoneOf[idx(xi, yi)];
      },
      zoneName(x, y) { return ZONES[this.zoneAt(x, y)].name; },
      ZONES,
    };
  }

  NP.WALL = WALL;
  NP.FLOOR = FLOOR;
  NP.EXIT = EXIT;
  NP.worldGen = { generate, ZONES };
})();
