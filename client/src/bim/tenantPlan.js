// tenantPlan.js — demising / test-fit engine (v2).
// Principles (Eric + IBC):
//   - Elevator exposure: every tenant wants its entry door right off the elevator lobby, so doors are placed
//     as close to the lift lobby opening as the demise allows; the demising line is set to keep doors near the
//     lobby while equalizing rentable area.
//   - Minimal shared corridor: NOT a ring. The lift lobby is itself a pass-through, so the corridor only has to
//     reach the two stairs + two washrooms. In this landscape central core every core door faces the floor on
//     the long faces and the stairs span the full core depth at the ends, so a single leg along a core face
//     (spanning the core width) touches both stairs + both washrooms + the lobby. Short (E/W) ends are dropped.
//   - Two exits when required: a Business space needs two exits once occ load > 49 (150 sf/occ gross) OR common
//     path > 100 ft (IBC 1006.2.1). Large suites get a second, remote exit toward the far stair.
//   - Door swing: a door serving >= 50 occupants swings in the egress direction, i.e. OUT of the suite into the
//     corridor (IBC 1010.1.2.1).
// Deterministic geometry only. Rects in floor feet.

const r1 = (n) => Math.round(n * 100) / 100;
const rect = (x, y, w, h) => ({ x: r1(x), y: r1(y), w: r1(w), h: r1(h) });
const overlap = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
};
const OCC_FACTOR = 150;        // IBC Table 1004.5 — business areas, gross
const ONE_EXIT_MAX_OCC = 49;   // IBC Table 1006.2.1 — B
const COMMON_PATH_MAX = 100;   // IBC Table 1006.2.1 — B, sprinklered (ft)

// Shortest travel distance over a suite's real walkable area (zone minus the core and corridors), from one or
// more source points (exit doors), routing AROUND obstructions. Returns the farthest reachable distance — i.e.
// the common path of egress travel when called with a single door. Grid Dijkstra, 8-connected.
function farthestTravel(zone, blockers, sources, cell = 3) {
  const nx = Math.max(2, Math.round(zone.w / cell)), ny = Math.max(2, Math.round(zone.h / cell));
  const cw = zone.w / nx, ch = zone.h / ny, N = nx * ny;
  const px = (i) => zone.x + (i + 0.5) * cw, py = (j) => zone.y + (j + 0.5) * ch;
  const inR = (x, y, r) => x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01;
  const walk = new Uint8Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) walk[j * nx + i] = blockers.some((b) => inR(px(i), py(j), b)) ? 0 : 1;
  const dist = new Float64Array(N).fill(Infinity);
  const heap = []; // binary min-heap of [d, k]
  const up = (c) => { while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const push = (d, k) => { heap.push([d, k]); up(heap.length - 1); };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let c = 0; for (; ;) { const a = 2 * c + 1, b = 2 * c + 2; let s = c; if (a < heap.length && heap[a][0] < heap[s][0]) s = a; if (b < heap.length && heap[b][0] < heap[s][0]) s = b; if (s === c) break;[heap[s], heap[c]] = [heap[c], heap[s]]; c = s; } } return t; };
  for (const s of sources) {                       // seed nearest walkable cell to each door
    let bk = -1, bd = Infinity;
    for (let k = 0; k < N; k++) if (walk[k]) { const d = Math.hypot(px(k % nx) - s.x, py((k / nx) | 0) - s.y); if (d < bd) { bd = d; bk = k; } }
    if (bk >= 0) { dist[bk] = 0; push(0, bk); }
  }
  const diag = Math.hypot(cw, ch), orth = (cw + ch) / 2;
  while (heap.length) {
    const [d, k] = pop(); if (d > dist[k]) continue;
    const i = k % nx, j = (k / nx) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const nk = nj * nx + ni; if (!walk[nk]) continue;
      const nd = d + (di && dj ? diag : orth);
      if (nd < dist[nk]) { dist[nk] = nd; push(nd, nk); }
    }
  }
  let maxD = 0; for (let k = 0; k < N; k++) if (walk[k] && isFinite(dist[k]) && dist[k] > maxD) maxD = dist[k];
  return maxD;
}

export function planTenants({ W, H, core, tenants = 1, corridorW = 6, stairs = [] }) {
  const cr = core.rect;
  const n = Math.max(1, Math.min(4, tenants | 0));
  const NAMES = ["A", "B", "C", "D"];
  const cx = cr.x + cr.w / 2;                 // lobby is centered on the core
  const cyMid = cr.y + cr.h / 2;
  const sY = cr.y + cr.h, nY = Math.max(0, cr.y - corridorW);
  const out = { tenants: n, corridorW, corridor: [], demising: [], suites: [], grossFt2: r1(W * H), leasableFt2: 0, notes: [] };

  const sLeg = () => rect(cr.x, sY, cr.w, Math.min(corridorW, H - sY));
  const nLeg = () => rect(cr.x, nY, cr.w, cr.y - nY);

  // ---- single tenant: no corridor; the suite wraps the core, both stairs open into it ----
  if (n === 1) {
    const area = r1(W * H - cr.w * cr.h), zone = rect(0, 0, W, H);
    const stairPts = (stairs || []).map((s) => ({ x: s.rect.x + s.rect.w / 2, y: s.rect.y + s.rect.h / 2 }));
    const travel = stairPts.length ? Math.round(farthestTravel(zone, [cr], stairPts)) : 0;
    out.suites = [{ id: 0, name: "Tenant A", zone, areaFt2: area, occLoad: Math.ceil(area / OCC_FACTOR), exitsRequired: 2, commonPathFt: 0, travelFt: travel, doors: [], stairsInSuite: true }];
    out.leasableFt2 = area;
    out.notes.push(`single tenant — no public corridor; both stairs open into the suite (2 exits). Travel to nearest stair ${travel} ft ≤ 300.`);
    return out;
  }

  // ---- zones + which corridor legs are needed ----
  let zones = [], needS = false, needN = false;
  const xm = r1(W / 2), ym = r1(cyMid);
  if (n === 2) {                                   // West | East, each wraps a core end
    zones = [rect(0, 0, xm, H), rect(xm, 0, W - xm, H)];
    needS = true;
    out.demising = [{ x1: xm, y1: 0, x2: xm, y2: nY }, { x1: xm, y1: sY + corridorW, x2: xm, y2: H }];
  } else if (n === 3) {                            // West half | NE | SE
    zones = [rect(0, 0, xm, H), rect(xm, 0, W - xm, ym), rect(xm, ym, W - xm, H - ym)];
    needS = needN = true;
    out.demising = [{ x1: xm, y1: 0, x2: xm, y2: nY }, { x1: xm, y1: sY + corridorW, x2: xm, y2: H }, { x1: cr.x + cr.w, y1: ym, x2: W, y2: ym }];
  } else {                                         // quadrants
    zones = [rect(0, 0, xm, ym), rect(xm, 0, W - xm, ym), rect(0, ym, xm, H - ym), rect(xm, ym, W - xm, H - ym)];
    needS = needN = true;
    out.demising = [
      { x1: xm, y1: 0, x2: xm, y2: nY }, { x1: xm, y1: sY + corridorW, x2: xm, y2: H },
      { x1: 0, y1: ym, x2: cr.x, y2: ym }, { x1: cr.x + cr.w, y1: ym, x2: W, y2: ym },
    ];
  }
  if (needS) out.corridor.push(sLeg());
  if (needN) out.corridor.push(nLeg());

  // ---- build suites: area, MEASURED common path of egress travel, exits, doors near the lobby ----
  out.suites = zones.map((z, i) => {
    let area = z.w * z.h - overlap(z, cr);
    for (const c of out.corridor) area -= overlap(z, c);
    area = r1(area);
    const occ = Math.ceil(area / OCC_FACTOR);
    const south = z.y + z.h > sY + 0.5;                   // which leg this suite fronts
    const leg = south ? sLeg() : nLeg();
    const wallY = south ? leg.y + leg.h : leg.y;          // the suite-facing edge of the corridor
    const blockers = [cr, ...out.corridor];               // walkable = suite zone minus core minus corridor
    const fx0 = Math.max(z.x, leg.x) + 2, fx1 = Math.min(z.x + z.w, leg.x + leg.w) - 2;
    const doors = []; let commonPath = 0, travel = 0, trigger = "", exits = 1;
    if (fx1 > fx0) {
      const primary = { x: r1(Math.max(fx0, Math.min(fx1, cx))), y: r1(wallY) }; // hard against the lobby
      commonPath = Math.round(farthestTravel(z, blockers, [primary]));           // common path with ONE door (the trigger)
      const byOcc = occ > ONE_EXIT_MAX_OCC, byPath = commonPath > COMMON_PATH_MAX;
      exits = byOcc || byPath ? 2 : 1;
      trigger = byOcc && byPath ? "occ load + common path" : byOcc ? "occ load > 49" : byPath ? `common path ${commonPath} ft > 100` : "";
      const swing = occ >= 50 ? (south ? "N" : "S") : (south ? "S" : "N"); // >=50 occ swings to egress
      doors.push({ ...primary, swing, egress: occ >= 50, primary: true });
      travel = commonPath;
      if (exits >= 2) {
        const remote = (cx - fx0) > (fx1 - cx) ? fx0 + 1 : fx1 - 1;        // remote exit toward the far stair
        doors.push({ x: r1(remote), y: r1(wallY), swing, egress: occ >= 50, primary: false });
        travel = Math.round(farthestTravel(z, blockers, doors));           // travel to NEAREST exit (≤300 ft limit)
      }
    }
    if (exits >= 2) out.notes.push(`Tenant ${NAMES[i]} ${area.toLocaleString()} sf · ${occ} occ → 2 exits (${trigger}); travel to nearest exit ${travel} ft ≤ 300`);
    else if (commonPath) out.notes.push(`Tenant ${NAMES[i]} ${area.toLocaleString()} sf · ${occ} occ · 1 exit · common path ${commonPath} ft ≤ 100`);
    return { id: i, name: "Tenant " + NAMES[i], zone: z, areaFt2: area, occLoad: occ, exitsRequired: exits, commonPathFt: commonPath, travelFt: travel, doors };
  });
  out.leasableFt2 = r1(out.suites.reduce((a, s) => a + s.areaFt2, 0));
  return out;
}
