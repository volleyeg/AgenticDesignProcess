// client/src/bim/floorgen.js
// Span-derived floor plan generation (FEET).
// single/double/racetrack is DERIVED from measured core-to-window span vs. an
// adjustable usable-room-depth standard — never hardcoded.

export const DEFAULT_PARAMS = {
  roomDepthFt: 15,      // usable perimeter room depth (adjustable)
  interiorDepthFt: 14,  // usable interior room depth (adjustable)
  corridorFt: 5,        // clear corridor width
  minRoomFt: 8,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 100) / 100;
const rect = (x, y, w, h) => ({ x: r1(x), y: r1(y), w: r1(w), h: r1(h) });

function distribute(N, weights) {
  const tot = weights.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
  const raw = weights.map((w) => (N * Math.max(w, 0)) / tot);
  const base = raw.map(Math.floor);
  let rem = N - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let k = 0; k < rem && order.length; k++) base[order[k % order.length].i]++;
  return base;
}

function placePerimeter(rooms, W, H, Db, Cw) {
  const edges = [
    { horiz: true, x0: 0, y0: 0, len: W, depth: Db },                                  // top (full width)
    { horiz: true, x0: 0, y0: H - Db, len: W, depth: Db },                             // bottom (full width)
    { horiz: false, x0: 0, y0: Db + Cw, len: H - 2 * (Db + Cw), depth: Db },           // left (middle only)
    { horiz: false, x0: W - Db, y0: Db + Cw, len: H - 2 * (Db + Cw), depth: Db },      // right (middle only)
  ].filter((e) => e.len > 1);
  if (!edges.length) return rooms.map((rm) => ({ ...rm, ...rect(0, 0, Math.max(W, 4), Db), band: "perimeter" }));
  const counts = distribute(rooms.length, edges.map((e) => e.len));
  const out = [];
  let ri = 0;
  edges.forEach((e, ei) => {
    const n = counts[ei]; if (!n) return;
    const cell = e.len / n;
    for (let j = 0; j < n; j++) {
      const room = rooms[ri++]; if (!room) break;
      const g = e.horiz ? rect(e.x0 + j * cell, e.y0, cell, e.depth) : rect(e.x0, e.y0 + j * cell, e.depth, cell);
      out.push({ ...room, ...g, band: "perimeter" });
    }
  });
  return out;
}

// fill a strip (between ring inner edge and a core face) with stacked interior rooms
function fillStrip(rooms, s, minRoom) {
  if (!rooms.length || s.w < minRoom || s.h < minRoom) return { placed: [], leftover: rooms };
  const long = s.alongY ? s.h : s.w;
  const cap = Math.max(1, Math.floor(long / minRoom));
  const take = Math.min(rooms.length, cap);
  const cell = long / take;
  const placed = [];
  for (let j = 0; j < take; j++) {
    const g = s.alongY ? rect(s.x, s.y + j * cell, s.w, cell) : rect(s.x + j * cell, s.y, cell, s.h);
    placed.push({ ...rooms[j], ...g, band: "interior" });
  }
  return { placed, leftover: rooms.slice(take) };
}

const axisMode = (avail, P) => (avail < P.corridorFt ? "shallow" : avail < P.interiorDepthFt ? "corridor" : "rooms");

export function generatePlan({ W, H, rooms, params = {} }) {
  const P = { ...DEFAULT_PARAMS, ...params };
  const Cw = P.corridorFt;
  let Db = P.roomDepthFt;
  while ((W - 2 * (Db + Cw) < P.minRoomFt + 4 || H - 2 * (Db + Cw) < P.minRoomFt + 4) && Db > P.minRoomFt) Db -= 1;

  let izx0 = Db + Cw, izx1 = W - Db - Cw, izy0 = Db + Cw, izy1 = H - Db - Cw;
  let izW = izx1 - izx0, izH = izy1 - izy0;
  if (izW < 12 || izH < 12) return { feasible: false, reason: "floor too small", W, H };

  // core centered, clamped to fit the interior zone
  let cw = clamp(W * 0.16, 12, izW), ch = clamp(H * 0.16, 12, izH);
  let core = rect((W - cw) / 2, (H - ch) / 2, cw, ch);

  let availH = core.x - izx0, availV = core.y - izy0;
  let modeH = axisMode(availH, P), modeV = axisMode(availV, P);

  // snap core to fill any shallow axis so it sits directly against the ring (no degenerate gap)
  if (modeH === "shallow") { core = rect(izx0, core.y, izW, core.h); availH = 0; }
  if (modeV === "shallow") { core = rect(core.x, izy0, core.w, izH); availV = 0; }
  modeH = axisMode(availH, P); modeV = axisMode(availV, P);

  const racetrack = modeH === "rooms" && modeV === "rooms";
  const classification = racetrack ? "racetrack" : (modeH === "rooms" || modeV === "rooms") ? "double-loaded" : "single-loaded";

  const daylight = rooms.filter((r) => r.daylight);
  let interiorCand = rooms.filter((r) => !r.daylight);
  let perimeter = daylight.slice();

  // ---- corridors: continuous perimeter ring (top/bottom full width, left/right middle) ----
  const corridors = [];
  corridors.push(rect(0, Db, W, Cw));                                  // top (full width)
  corridors.push(rect(0, H - Db - Cw, W, Cw));                         // bottom (full width)
  corridors.push(rect(Db, Db + Cw, Cw, H - 2 * (Db + Cw)));            // left (middle)
  corridors.push(rect(W - Db - Cw, Db + Cw, Cw, H - 2 * (Db + Cw)));   // right (middle)
  const ccx = core.x + core.w / 2, ccy = core.y + core.h / 2;

  // ---- interior rooms + spurs ----
  const placedInterior = [];
  const addSpurV = () => {
    corridors.push(rect(ccx - Cw / 2, izy0, Cw, core.y - izy0));
    corridors.push(rect(ccx - Cw / 2, core.y + core.h, Cw, izy1 - (core.y + core.h)));
  };
  const addSpurH = () => {
    corridors.push(rect(izx0, ccy - Cw / 2, core.x - izx0, Cw));
    corridors.push(rect(core.x + core.w, ccy - Cw / 2, izx1 - (core.x + core.w), Cw));
  };

  // place interior rooms on a "rooms"-mode axis (strips flanking the core, touching ring inner edge)
  // each takes a pool, places what fits, returns the leftover (so axes don't double-place)
  function interiorH(splitForSpur, pool) {
    let rem = pool;
    if (splitForSpur) {
      const halfH = (core.h - Cw) / 2;
      const segs = [
        { x: izx0, y: core.y, w: core.x - izx0, h: halfH, alongY: true },
        { x: izx0, y: ccy + Cw / 2, w: core.x - izx0, h: halfH, alongY: true },
        { x: core.x + core.w, y: core.y, w: izx1 - (core.x + core.w), h: halfH, alongY: true },
        { x: core.x + core.w, y: ccy + Cw / 2, w: izx1 - (core.x + core.w), h: halfH, alongY: true },
      ];
      for (const s of segs) { const res = fillStrip(rem, s, P.minRoomFt); placedInterior.push(...res.placed); rem = res.leftover; }
    } else {
      let res = fillStrip(rem, { x: izx0, y: core.y, w: core.x - izx0, h: core.h, alongY: true }, P.minRoomFt);
      placedInterior.push(...res.placed); rem = res.leftover;
      res = fillStrip(rem, { x: core.x + core.w, y: core.y, w: izx1 - (core.x + core.w), h: core.h, alongY: true }, P.minRoomFt);
      placedInterior.push(...res.placed); rem = res.leftover;
    }
    return rem;
  }
  function interiorV(splitForSpur, pool) {
    let rem = pool;
    if (splitForSpur) {
      const halfW = (core.w - Cw) / 2;
      const segs = [
        { x: core.x, y: izy0, w: halfW, h: core.y - izy0, alongY: false },
        { x: ccx + Cw / 2, y: izy0, w: halfW, h: core.y - izy0, alongY: false },
        { x: core.x, y: core.y + core.h, w: halfW, h: izy1 - (core.y + core.h), alongY: false },
        { x: ccx + Cw / 2, y: core.y + core.h, w: halfW, h: izy1 - (core.y + core.h), alongY: false },
      ];
      for (const s of segs) { const res = fillStrip(rem, s, P.minRoomFt); placedInterior.push(...res.placed); rem = res.leftover; }
    } else {
      let res = fillStrip(rem, { x: core.x, y: izy0, w: core.w, h: core.y - izy0, alongY: false }, P.minRoomFt);
      placedInterior.push(...res.placed); rem = res.leftover;
      res = fillStrip(rem, { x: core.x, y: core.y + core.h, w: core.w, h: izy1 - (core.y + core.h), alongY: false }, P.minRoomFt);
      placedInterior.push(...res.placed); rem = res.leftover;
    }
    return rem;
  }

  const coreTouchesRing = modeH === "shallow" || modeV === "shallow";

  if (racetrack) {
    // interior rooms on BOTH axes from one shared pool; spur routed through the shorter-span axis
    const spurOnV = availV <= availH;
    let pool = interiorCand;
    if (spurOnV) { pool = interiorV(true, pool); addSpurV(); pool = interiorH(false, pool); }
    else { pool = interiorH(true, pool); addSpurH(); pool = interiorV(false, pool); }
    perimeter = perimeter.concat(pool);
  } else if (modeH === "rooms") {
    perimeter = perimeter.concat(interiorH(false, interiorCand));
    if (!coreTouchesRing) addSpurV();
  } else if (modeV === "rooms") {
    perimeter = perimeter.concat(interiorV(false, interiorCand));
    if (!coreTouchesRing) addSpurH();
  } else {
    perimeter = perimeter.concat(interiorCand); // no interior rooms fit
    if (!coreTouchesRing) { if (modeV === "corridor") addSpurV(); else addSpurH(); }
  }

  const placedPerim = placePerimeter(perimeter, W, H, Db, Cw);

  // ---- stairs: carve 2 from access corridors touching the core ----
  const touch = (a, b, tol = 0.6) => {
    const gx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
    const gy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
    return gx <= tol && gy <= tol;
  };
  let access = corridors.filter((c) => touch(core, c));
  if (!access.length) { addSpurV(); access = corridors.filter((c) => touch(core, c)); }
  const sSize = P.minRoomFt;
  const stairFrom = (c, end) => {
    const w = Math.min(sSize, c.w), h = Math.min(sSize + 2, c.h);
    return rect(end ? c.x + c.w - w : c.x, end ? c.y + c.h - h : c.y, w, h);
  };
  const stairs = [stairFrom(access[0], false), stairFrom(access[access.length > 1 ? 1 : 0], true)];
  stairs.forEach((s) => { s.kind = "stair"; s.label = "Stair"; });
  core.kind = "core"; core.label = "Core";

  return {
    feasible: true, W, H, core, stairs, corridors,
    rooms: [...placedPerim, ...placedInterior],
    params: P,
    spans: { availH: r1(availH), availV: r1(availV), modeH, modeV },
    classification,
  };
}
