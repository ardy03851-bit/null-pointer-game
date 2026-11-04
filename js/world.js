/* ============================================================
   NULL POINTER — world.js
   Procedural generation of a "corrupted program" interior.
   Grid of cells; each cell holds a base glyph + a zone id.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const WALL = '#';
  const FLOOR = '.';
  const DOOR = '+';
  const EXIT = '$';

  // Zone palettes: .TEXT (cool calm) → .DATA (amber tension) → .NULL (dead red)
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

  /**
   * Build the world.
   * Layout: rooms + connecting corridors carved out of solid rock.
   * Rooms cluster toward three zone anchors (west/centre/east).
   */
  function generate(seed) {
    const rnd = mulberry32(seed || 1337);
    const W = 132, H = 84;

    // 0 = solid, 1 = floor
    const solid = new Uint8Array(W * H).fill(1);
    const idx = (x, y) => y * W + x;

    const rooms = [];

    function placeRoom(x, y, w, h) {
      for (let ry = y; ry < y + h; ry++) {
        for (let rx = x; rx < x + w; rx++) {
          if (rx > 0 && ry > 0 && rx < W - 1 && ry < H - 1) solid[idx(rx, ry)] = 0;
        }
      }
      rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
    }

    // Three zone anchors; rooms scattered around each
    const anchors = [
      { x: 0.14, y: 0.5 }, { x: 0.5, y: 0.45 }, { x: 0.86, y: 0.55 },
    ];
    const PER_ZONE = 9;

    for (let a = 0; a < anchors.length; a++) {
      const ax = anchors[a].x * W, ay = anchors[a].y * H;
      let last = null;
      for (let i = 0; i < PER_ZONE; i++) {
        let placed = false, tries = 0;
        while (!placed && tries < 60) {
          tries++;
          const w = 7 + Math.floor(rnd() * 9);
          const h = 5 + Math.floor(rnd() * 7);
          const x = Math.floor(ax + (rnd() - 0.5) * W * 0.34);
          const y = Math.floor(ay + (rnd() - 0.5) * H * 0.34);
          if (x < 2 || y < 2 || x + w > W - 2 || y + h > H - 2) continue;

          // overlap check (with 2-cell gap)
          let overlap = false;
          for (const r of rooms) {
            if (x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y) {
              overlap = true; break;
            }
          }
          if (overlap) continue;

          placeRoom(x, y, w, h);
          placed = true;
          const room = rooms[rooms.length - 1];
          room.zone = a;
          // connect to previous room in this zone with an L corridor
          if (last) {
            carveCorridor(room.cx, room.cy, last.cx, last.cy);
          } else if (rooms.length > 1) {
            // connect first room of the zone to a random earlier room (cross-zone link)
            const other = rooms[Math.floor(rnd() * (rooms.length - 1))];
            carveCorridor(room.cx, room.cy, other.cx, other.cy);
          }
          last = room;
        }
      }
    }

    function carveCorridor(x1, y1, x2, y2) {
      let x = x1, y = y1;
      const horizFirst = rnd() < 0.5;
      function stepToward(tx, ty) {
        // drunk walk so corridors aren't always perfect L shapes
        while (x !== tx) {
          x += x < tx ? 1 : -1;
          carve(x, y);
        }
        while (y !== ty) {
          y += y < ty ? 1 : -1;
          carve(x, y);
        }
      }
      if (horizFirst) { stepToward(x2, y); stepToward(x2, y2); }
      else { stepToward(x, y2); stepToward(x2, y2); }
    }

    function carve(x, y) {
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) solid[idx(x, y)] = 0;
    }

    // ---- doors: where a corridor meets a room edge, sometimes a '+' ----
    const doorGlyphs = new Set();
    for (const r of rooms) {
      for (let rx = r.x; rx < r.x + r.w; rx++) {
        for (const [dx, dy] of [[rx, r.y - 1], [rx, r.y + r.h]]) {
          if (solid[idx(dx, dy)] === 0 && rnd() < 0.5) doorGlyphs.add(idx(dx, dy));
        }
      }
      for (let ry = r.y; ry < r.y + r.h; ry++) {
        for (const [dx, dy] of [[r.x - 1, ry], [r.x + r.w, ry]]) {
          if (solid[idx(dx, dy)] === 0 && rnd() < 0.5) doorGlyphs.add(idx(dx, dy));
        }
      }
    }

    // ---- cell model ----
    // glyph codes, one per cell (0 = empty/solid interior)
    const cells = new Array(W * H);
    const zoneOf = new Uint8Array(W * H);
    const decor = new Array(W * H).fill(0); // 1 = residue digit on floor

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        const z = x < W * 0.34 ? 0 : x < W * 0.66 ? 1 : 2;
        zoneOf[i] = z;
        if (solid[i]) {
          // solid: only draw a wall glyph if it borders open space (visible face)
          const nearOpen =
            (x > 0 && !solid[i - 1]) || (x < W - 1 && !solid[i + 1]) ||
            (y > 0 && !solid[i - W]) || (y < H - 1 && !solid[i + W]);
          cells[i] = nearOpen ? WALL : null;
        } else {
          cells[i] = doorGlyphs.has(i) ? DOOR : FLOOR;
          // scattered "data residue" digits on floors (drawn dynamically)
          if (rnd() < 0.045) decor[i] = 1;
        }
      }
    }

    // ---- spawn, fragments, exit ----
    // spawn: first room of zone 0 (west)
    const spawnRoom = rooms.find((r) => r.zone === 0);
    const spawn = { x: spawnRoom.cx + 0.5, y: spawnRoom.cy + 0.5 };

    // fragments: one room per zone, spread out, not the spawn room
    const fragRooms = [];
    for (let z = 1; z <= 2; z++) {
      const candidates = rooms.filter((r) => r.zone === z && r !== spawnRoom);
      fragRooms.push(candidates[Math.floor(rnd() * candidates.length)]);
    }
    // one more in zone 0 but far from spawn
    const far0 = rooms
      .filter((r) => r.zone === 0 && r !== spawnRoom)
      .sort((a, b) => dist2(b, spawnRoom) - dist2(a, spawnRoom))[0];
    fragRooms.push(far0);
    // and one in zone 1
    const candidates1 = rooms.filter((r) => r.zone === 1 && !fragRooms.includes(r));
    fragRooms.push(candidates1[Math.floor(rnd() * candidates1.length)]);

    const fragments = fragRooms.map((r, i) => ({
      id: i,
      x: r.cx + 0.5,
      y: r.cy + 0.5,
      taken: false,
      flicker: rnd() * 10,
    }));

    // exit: farthest room from spawn overall
    const exitRoom = rooms
      .slice()
      .sort((a, b) => dist2(b, spawnRoom) - dist2(a, spawnRoom))[0];
    const exit = { x: exitRoom.cx + 0.5, y: exitRoom.cy + 0.5 };
    // mark exit glyph on the cell map (drawn dynamically too, but keep map truth)
    cells[idx(exitRoom.cx, exitRoom.cy)] = EXIT;

    function dist2(a, b) {
      const dx = a.cx - b.cx, dy = a.cy - b.cy;
      return dx * dx + dy * dy;
    }

    return {
      W, H, cells, zoneOf, decor, idx,
      rooms, fragments, exit, spawn,
      solidAt(x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return true;
        return solid[idx(xi, yi)] === 1;
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
