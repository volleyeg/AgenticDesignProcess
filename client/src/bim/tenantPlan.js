// tenantPlan.js — demising / test-fit engine.
// Given the floor (W x H), the core (an island), and a tenant count, it produces a deterministic plan:
//   - 1 tenant  : NO public corridor; the whole plate minus the core is one suite. Egress from the lift
//                 lobby to both stairs runs through the sole tenant (IBC 1016.2 allows this for one occupant).
//   - 2-4 tenants: a RACETRACK (ring) corridor wraps the core (the standard multi-tenant solution). The lift
//                 lobby's two openings and both stair doors land on the ring, and the daylight perimeter is
//                 demised into suites that each front the ring -> every suite reaches two stairs without
//                 crossing a neighbour (IBC 1016.2 / 1020; each tenant reaches exits without passing through
//                 an adjacent tenant).
// Geometry only — no coordinates come from an LLM. Returns rects in floor feet.

const r1 = (n) => Math.round(n * 100) / 100;
const rect = (x0, y0, x1, y1) => ({ x: r1(x0), y: r1(y0), w: r1(x1 - x0), h: r1(y1 - y0) });
const areaOf = (rs) => rs.reduce((a, r) => a + Math.max(0, r.w) * Math.max(0, r.h), 0);

// the 4 strips of the band between an outer box and an inner hole (corners belong to N/S so the strips tile)
function frame(ox0, oy0, ox1, oy1, h) {
  const out = {};
  if (h.y > oy0 + 0.1) out.N = rect(ox0, oy0, ox1, h.y);
  if (h.y + h.h < oy1 - 0.1) out.S = rect(ox0, h.y + h.h, ox1, oy1);
  if (h.x > ox0 + 0.1) out.W = rect(ox0, h.y, h.x, h.y + h.h);
  if (h.x + h.w < ox1 - 0.1) out.E = rect(h.x + h.w, h.y, ox1, h.y + h.h);
  return out;
}
const clipX = (r, x0, x1) => r && rect(Math.max(r.x, x0), r.y, Math.min(r.x + r.w, x1), r.y + r.h);
const clipY = (r, y0, y1) => r && rect(r.x, Math.max(r.y, y0), r.x + r.w, Math.min(r.y + r.h, y1));
const ok = (r) => r && r.w > 0.5 && r.h > 0.5;
const keep = (...rs) => rs.filter(ok);

export function planTenants({ W, H, core, stairs = [], tenants = 1, corridorW = 5.5 }) {
  const cr = core.rect;
  const n = Math.max(1, Math.min(4, tenants | 0));
  const NAMES = ["A", "B", "C", "D"];
  const out = { tenants: n, corridorW, ring: null, corridor: [], demising: [], suites: [], grossFt2: W * H, leasableFt2: 0 };

  // ---- single tenant: whole plate minus core, no corridor ----
  if (n === 1) {
    const f = frame(0, 0, W, H, cr);
    const rects = keep(f.N, f.S, f.W, f.E);
    out.suites = [{ id: 0, name: "Tenant A", rects, areaFt2: r1(areaOf(rects)), entry: lobbyEntry(cr) }];
    out.leasableFt2 = out.suites[0].areaFt2;
    return out;
  }

  // ---- ring corridor around the core ----
  const rOut = {
    x: Math.max(0, cr.x - corridorW), y: Math.max(0, cr.y - corridorW),
  };
  rOut.w = Math.min(W, cr.x + cr.w + corridorW) - rOut.x;
  rOut.h = Math.min(H, cr.y + cr.h + corridorW) - rOut.y;
  const rf = frame(rOut.x, rOut.y, rOut.x + rOut.w, rOut.y + rOut.h, cr);
  out.ring = rOut;
  out.corridor = keep(rf.N, rf.S, rf.W, rf.E);

  // ---- leasable strips outside the ring ----
  const L = frame(0, 0, W, H, rOut);                 // N, S, W, E daylight strips
  const xm = r1(W / 2);                              // vertical demising line
  const ym = r1(rOut.y + rOut.h / 2);                // horizontal demising line (aligned to ring mid)
  const suites = [];
  const dem = [];

  if (n === 2) {                                     // West C-shape | East C-shape, split at mid-width
    suites.push(keep(clipX(L.N, 0, xm), L.W, clipX(L.S, 0, xm)));
    suites.push(keep(clipX(L.N, xm, W), L.E, clipX(L.S, xm, W)));
    if (L.N) dem.push({ x1: xm, y1: 0, x2: xm, y2: rOut.y });
    if (L.S) dem.push({ x1: xm, y1: rOut.y + rOut.h, x2: xm, y2: H });
  } else if (n === 3) {                              // West half | NE quadrant | SE quadrant
    suites.push(keep(clipX(L.N, 0, xm), L.W, clipX(L.S, 0, xm)));
    suites.push(keep(clipX(L.N, xm, W), clipY(L.E, 0, ym)));
    suites.push(keep(clipX(L.S, xm, W), clipY(L.E, ym, H)));
    if (L.N) dem.push({ x1: xm, y1: 0, x2: xm, y2: rOut.y });
    if (L.S) dem.push({ x1: xm, y1: rOut.y + rOut.h, x2: xm, y2: H });
    if (L.E) dem.push({ x1: rOut.x + rOut.w, y1: ym, x2: W, y2: ym });
  } else {                                           // 4 = quadrants (corner L-shapes)
    suites.push(keep(clipX(L.N, 0, xm), clipY(L.W, 0, ym)));   // NW
    suites.push(keep(clipX(L.N, xm, W), clipY(L.E, 0, ym)));   // NE
    suites.push(keep(clipX(L.S, 0, xm), clipY(L.W, ym, H)));   // SW
    suites.push(keep(clipX(L.S, xm, W), clipY(L.E, ym, H)));   // SE
    if (L.N) dem.push({ x1: xm, y1: 0, x2: xm, y2: rOut.y });
    if (L.S) dem.push({ x1: xm, y1: rOut.y + rOut.h, x2: xm, y2: H });
    if (L.W) dem.push({ x1: 0, y1: ym, x2: rOut.x, y2: ym });
    if (L.E) dem.push({ x1: rOut.x + rOut.w, y1: ym, x2: W, y2: ym });
  }

  out.demising = dem;
  out.suites = suites.map((rects, i) => ({ id: i, name: "Tenant " + NAMES[i], rects, areaFt2: r1(areaOf(rects)), entry: ringEntry(rects, rOut) }));
  out.leasableFt2 = r1(out.suites.reduce((a, s) => a + s.areaFt2, 0));
  return out;
}

// a door from the sole tenant into the lift lobby (south opening of the core)
function lobbyEntry(cr) { return { x: r1(cr.x + cr.w / 2), y: r1(cr.y + cr.h), edge: "S" }; }

// place a suite's entry on the ring edge along its longest ring-facing run
function ringEntry(rects, rOut) {
  const rx0 = rOut.x, ry0 = rOut.y, rx1 = rOut.x + rOut.w, ry1 = rOut.y + rOut.h;
  let best = null;
  for (const r of rects) {
    const cand = [];
    if (Math.abs(r.y + r.h - ry0) < 0.6) cand.push({ x: r.x + r.w / 2, y: ry0, edge: "S", len: r.w }); // suite north of ring
    if (Math.abs(r.y - ry1) < 0.6) cand.push({ x: r.x + r.w / 2, y: ry1, edge: "N", len: r.w });       // suite south of ring
    if (Math.abs(r.x + r.w - rx0) < 0.6) cand.push({ x: rx0, y: r.y + r.h / 2, edge: "E", len: r.h });  // suite west of ring
    if (Math.abs(r.x - rx1) < 0.6) cand.push({ x: rx1, y: r.y + r.h / 2, edge: "W", len: r.h });        // suite east of ring
    for (const c of cand) if (!best || c.len > best.len) best = c;
  }
  return best ? { x: r1(best.x), y: r1(best.y), edge: best.edge } : null;
}
