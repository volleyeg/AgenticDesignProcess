// client/src/solver.js
// Floor-plate + central-core placement. Works in grid units (1 unit = 5 ft via bim/model MODULE_FT).
// Produces options with a real floor boundary, a centered core, perimeter (daylight) rooms,
// and support rooms flanking the core. Everything writes into the BIM model downstream.

export const GRID = 40; // px per grid unit in 2D thumbnails

export const KIND_COLORS = {
  work: "var(--cyan)", meet: "var(--amber)", support: "var(--slate-z)",
  social: "var(--green)", core: "#586173", default: "var(--slate-z)",
};

export const APPROACHES = [
  { name: "Connected Core", rationale: "Offices ring the daylit perimeter around a central core; support flanks the core.", efficiency: 0.60, aspect: 1.5, coreFrac: 0.10, bandFrac: 0.26, pushAll: false },
  { name: "Daylight First", rationale: "Maximum perimeter exposure — nearly every room reaches the glass; the core stays compact.", efficiency: 0.66, aspect: 1.75, coreFrac: 0.08, bandFrac: 0.30, pushAll: true },
  { name: "Efficient Grid", rationale: "Tighter floor with a deeper band and more interior rooms for high usable area.", efficiency: 0.54, aspect: 1.35, coreFrac: 0.12, bandFrac: 0.30, pushAll: false },
];

export const SAMPLES = [
  { tag: "Tech HQ floor", text: "Fit-out of a single 14x9 floorplate for a 90-person software team. Needs ~60 desks in neighborhoods, 4 small meeting rooms, 2 large conference rooms, a focus/quiet zone, a generous social cafe near the entry, and a wellness room. Daylight matters most for desks and the cafe. Collaboration and a strong sense of arrival are the priorities." },
  { tag: "Boutique clinic", text: "Test-fit for a 12x8 floorplate medical clinic. Needs a welcoming reception/waiting area, 6 exam rooms, 2 consult offices, a small lab, staff break room, and storage. Patient calm, clear wayfinding, and daylight in waiting + consult rooms are the priorities." },
  { tag: "Flagship retail", text: "Schematic zoning for a 13x9 flagship retail space. Needs an experiential entry moment, main shop floor, a featured product gallery, fitting rooms, a service/clienteling bar, stockroom, and back-of-house. Brand storytelling and dwell time near the entry are the priorities; daylight for the shop floor and gallery." },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 10) / 10;

function distribute(N, weights) {
  const tot = weights.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
  const raw = weights.map((w) => (N * Math.max(w, 0)) / tot);
  const base = raw.map(Math.floor);
  let rem = N - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let k = 0; k < rem && order.length; k++) base[order[k % order.length].i]++;
  return base;
}

function placeEdges(rooms, W, H, Db) {
  // ring of 4 bands; returns placed zones touching the perimeter
  const edges = [
    { horiz: true, x0: 0, y0: 0, len: W, depth: Db },                 // top
    { horiz: false, x0: W - Db, y0: Db, len: H - 2 * Db, depth: Db },   // right
    { horiz: true, x0: 0, y0: H - Db, len: W, depth: Db },             // bottom
    { horiz: false, x0: 0, y0: Db, len: H - 2 * Db, depth: Db },        // left
  ].filter((e) => e.len > 0.5);
  const counts = distribute(rooms.length, edges.map((e) => e.len));
  const out = [];
  let ri = 0;
  edges.forEach((e, ei) => {
    const n = counts[ei];
    if (!n) return;
    const cell = e.len / n;
    for (let j = 0; j < n; j++) {
      const room = rooms[ri++];
      if (!room) break;
      const z = e.horiz
        ? { x: r1(e.x0 + j * cell), y: r1(e.y0), w: r1(cell), h: r1(e.depth) }
        : { x: r1(e.x0), y: r1(e.y0 + j * cell), w: r1(e.depth), h: r1(cell) };
      out.push({ ...room, ...z });
    }
  });
  // any leftover (shouldn't happen) gets dropped into top band end
  while (ri < rooms.length) { const room = rooms[ri++]; out.push({ ...room, x: 0, y: 0, w: 2, h: Db }); }
  return out;
}

function placeInterior(rooms, W, H, Db, core, corridor) {
  if (!rooms.length) return { placed: [], leftover: [] };
  const x0 = Db + corridor, x1 = W - Db - corridor;
  const y0 = Db + corridor, y1 = H - Db - corridor;
  const strips = [];
  const leftW = core.x - x0, rightW = x1 - (core.x + core.w);
  if (leftW >= 2) strips.push({ x: x0, w: leftW, y: y0, h: y1 - y0 });
  if (rightW >= 2) strips.push({ x: core.x + core.w, w: rightW, y: y0, h: y1 - y0 });
  if (!strips.length) return { placed: [], leftover: rooms.slice() };
  const caps = strips.map((s) => Math.max(0, Math.floor(s.h / 1.5)));
  const totalCap = caps.reduce((a, b) => a + b, 0);
  const take = Math.min(rooms.length, totalCap);
  const toPlace = rooms.slice(0, take);
  const leftover = rooms.slice(take);
  const counts = distribute(toPlace.length, caps);
  const placed = [];
  let ri = 0;
  strips.forEach((s, si) => {
    const n = counts[si]; if (!n) return;
    const cell = s.h / n;
    for (let j = 0; j < n; j++) {
      const room = toPlace[ri++]; if (!room) break;
      placed.push({ ...room, x: r1(s.x), y: r1(s.y + j * cell), w: r1(s.w), h: r1(cell) });
    }
  });
  return { placed, leftover };
}

function layout(constraints, ap) {
  const src = (constraints.spaces || []).map((s, i) => ({
    id: s.id || "s" + i, label: s.label, kind: s.kind, daylight: !!s.daylight, area: s.w * s.h,
  }));
  const prog = src.reduce((a, b) => a + b.area, 0) || 10;
  const floorArea = prog / ap.efficiency;
  let W = clamp(Math.round(Math.sqrt(floorArea * ap.aspect)), 9, 28);
  let H = clamp(Math.round(floorArea / W), 7, 18);
  let Db = clamp(Math.round(Math.min(W, H) * ap.bandFrac), 2, 6);
  while (H - 2 * Db < 2 || W - 2 * Db < 2) Db -= 1;
  Db = Math.max(Db, 2);

  // core, centered
  const ca = W * H * ap.coreFrac;
  const cw = clamp(Math.round(Math.sqrt(ca * 1.6)), 2, Math.floor(W * 0.45));
  const ch = clamp(Math.round(ca / cw), 1, Math.floor(H * 0.45));
  const core = { id: "core", label: "Core", kind: "core", daylight: false, x: Math.round((W - cw) / 2), y: Math.round((H - ch) / 2), w: cw, h: ch };

  // split rooms: daylight (+all if pushAll) ring the perimeter; support tries the interior
  let perimeter = ap.pushAll ? src.slice() : src.filter((r) => r.daylight);
  const interiorCand = ap.pushAll ? [] : src.filter((r) => !r.daylight);
  const { placed: placedInterior, leftover } = placeInterior(interiorCand, W, H, Db, core, 1);
  perimeter = perimeter.concat(leftover); // anything that didn't fit interior joins the ring
  const placedPerim = placeEdges(perimeter, W, H, Db);

  const zones = [core, ...placedPerim, ...placedInterior];
  return { name: ap.name, rationale: ap.rationale, floor: { w: W, h: H }, core, zones };
}

export function generateOptions(constraints) {
  return APPROACHES.map((ap) => layout(constraints, ap));
}

// ---- metrics (uses the option's own floor size) ---------------------------
function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}
function touch(a, b, tol) {
  const gx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const gy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return gx <= tol && gy <= tol;
}
export function computeMetrics(o, c) {
  const fw = (o.floor && o.floor.w) || c.floorplate.w;
  const fh = (o.floor && o.floor.h) || c.floorplate.h;
  const z = o.zones || [];
  const utilization = z.reduce((s, q) => s + q.w * q.h, 0) / (fw * fh);
  let overlaps = 0;
  for (let i = 0; i < z.length; i++)
    for (let j = i + 1; j < z.length; j++)
      if (overlapArea(z[i], z[j]) > 0.25) overlaps++;
  const dl = z.filter((q) => q.daylight);
  const touching = dl.filter((q) => q.x <= 0.05 || q.y <= 0.05 || Math.abs(q.x + q.w - fw) <= 0.05 || Math.abs(q.y + q.h - fh) <= 0.05).length;
  const daylightPct = dl.length ? touching / dl.length : 1;
  const adj = c.adjacencies || []; let sat = 0;
  adj.forEach((a) => { const za = z.find((q) => q.id === a.a), zb = z.find((q) => q.id === a.b); if (za && zb && touch(za, zb, 0.3)) sat++; });
  const adjacencyPct = adj.length ? sat / adj.length : 1;
  const utilScore = Math.max(0, 100 - Math.abs(utilization - 0.7) * 200);
  const computedScore = Math.max(0, Math.min(100, Math.round(0.3 * utilScore + 0.35 * daylightPct * 100 + 0.35 * adjacencyPct * 100 - overlaps * 8)));
  return { utilization: Math.round(utilization * 100), daylightPct: Math.round(daylightPct * 100), adjacencyPct: Math.round(adjacencyPct * 100), overlaps, computedScore };
}
