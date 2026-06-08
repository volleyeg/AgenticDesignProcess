// tenantPlan.js — demising / test-fit engine (v3).
// Principles (Eric + IBC):
//   - Elevator exposure: every tenant's entry door lands on the lift-lobby opening. The lobby is pushed off the
//     core centre by the wider BOH cluster, so doors + demising anchor to the ACTUAL lobby x, not the core centre.
//   - Even rentable area: where the lobby is off-centre, the demising JOGS — the deep fields split at the area-
//     balance line while a short neck carries one tenant's entry over to the lobby (equal SF + lobby doors).
//   - Minimal shared corridor: NOT a ring. The lobby is a pass-through; the corridor is one leg per occupied
//     core face (spans the core width; stairs span full core depth so the leg meets both stairs). Short ends dropped.
//   - Two exits: a Business suite needs a 2nd (remote) exit once occ load > 49 OR MEASURED common path > 100 ft
//     (IBC 1006.2.1, sprinklered). Door serving >=50 occ swings in the egress direction (IBC 1010.1.2.1).
// Deterministic geometry only. Rects in floor feet.

const r1 = (n) => Math.round(n * 100) / 100;
const rect = (x, y, w, h) => ({ x: r1(x), y: r1(y), w: r1(Math.max(0, w)), h: r1(Math.max(0, h)) });
const overlap = (a, b) => {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
};
const areaOf = (rs) => rs.reduce((s, r) => s + r.w * r.h, 0);
const OCC_FACTOR = 150, ONE_EXIT_MAX_OCC = 49, COMMON_PATH_MAX = 100;

// OBC 3.8.3.3 barrier-free doorway clearances (feet; code is in mm).
const DOOR_LEAF = 3.5;          // ~1067 mm leaf → clear opening ~990 mm > 860 mm min (OBC 3.8.3.3.(1))
const LATCH_PULL = 1.97;        // 600 mm latch-side clear where the door swings TOWARD the approach (pull side)
const LATCH_PUSH = 0.98;        // 300 mm latch-side clear where it swings AWAY (push side)
const MANEUVER_DEPTH = 4.92;    // 1500 mm level maneuvering area, perpendicular to the door

// Build a barrier-free door: hinge toward `hingeTowardX` so the leaf opens back against the nearest perpendicular
// wall; latch (handle) + maneuvering clearance fall on the open side. swing = leaf direction (egress side if >=50).
function bfDoor({ x, wallY, swing, hingeTowardX, egress, primary }) {
  const hinge = hingeTowardX <= x ? "W" : "E";
  const jx = hinge === "W" ? x - DOOR_LEAF / 2 : x + DOOR_LEAF / 2;       // hinge jamb
  const sx = hinge === "W" ? x + DOOR_LEAF / 2 : x - DOOR_LEAF / 2;       // strike/latch jamb
  const sgn = hinge === "W" ? 1 : -1;                                     // latch clearance extends away from hinge
  const span = (L) => { const end = sx + sgn * L; return { x: Math.min(jx, end), w: Math.abs(jx - end) }; };
  const pullN = swing === "N", p = span(LATCH_PULL), q = span(LATCH_PUSH);
  const clear = {
    pull: rect(p.x, pullN ? wallY - MANEUVER_DEPTH : wallY, p.w, MANEUVER_DEPTH),   // 600 mm, swing side
    push: rect(q.x, pullN ? wallY : wallY - MANEUVER_DEPTH, q.w, MANEUVER_DEPTH),   // 300 mm, opposite side
  };
  return { x: r1(x), y: r1(wallY), swing, hinge, egress, primary, clear };
}

// Farthest travel over a suite's real walkable area (its rects minus core & corridors), from source doors,
// routing AROUND obstructions. Single source => common path of egress travel. Grid Dijkstra, 8-connected.
function farthestTravel(rects, blockers, sources, cell = 3) {
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  const nx = Math.max(2, Math.round((x1 - x0) / cell)), ny = Math.max(2, Math.round((y1 - y0) / cell));
  const cw = (x1 - x0) / nx, ch = (y1 - y0) / ny, N = nx * ny;
  const px = (i) => x0 + (i + 0.5) * cw, py = (j) => y0 + (j + 0.5) * ch;
  const inR = (x, y, r) => x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01;
  const walk = new Uint8Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = px(i), y = py(j);
    walk[j * nx + i] = rects.some((r) => inR(x, y, r)) && !blockers.some((b) => inR(x, y, b)) ? 1 : 0;
  }
  const dist = new Float64Array(N).fill(Infinity), heap = [];
  const up = (c) => { while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break;[heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const push = (d, k) => { heap.push([d, k]); up(heap.length - 1); };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let c = 0; for (; ;) { const a = 2 * c + 1, b = 2 * c + 2; let s = c; if (a < heap.length && heap[a][0] < heap[s][0]) s = a; if (b < heap.length && heap[b][0] < heap[s][0]) s = b; if (s === c) break;[heap[s], heap[c]] = [heap[c], heap[s]]; c = s; } } return t; };
  for (const s of sources) {
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
  let m = 0; for (let k = 0; k < N; k++) if (walk[k] && isFinite(dist[k]) && dist[k] > m) m = dist[k];
  return m;
}

export function planTenants({ W, H, core, tenants = 1, corridorW = 6, stairs = [] }) {
  const cr = core.rect;
  const n = Math.max(1, Math.min(4, tenants | 0));
  const NAMES = ["A", "B", "C", "D"];
  const paxLobby = (core.components || []).find((c) => c.type === "lobby" && !c.vestibule && c.name && c.name.includes("FSAE")) || (core.components || []).find((c) => c.type === "lobby" && !c.vestibule);
  const lobbyX = paxLobby ? r1(paxLobby.rect.x + paxLobby.rect.w / 2) : r1(cr.x + cr.w / 2);
  const balanceX = r1(cr.x + cr.w / 2);                 // leasable is symmetric about the core centre
  const cyMid = r1(cr.y + cr.h / 2);
  const sY = cr.y + cr.h, nY = Math.max(0, cr.y - corridorW);
  const sLeg = rect(cr.x, sY, cr.w, Math.min(corridorW, H - sY));
  const nLeg = rect(cr.x, nY, cr.w, cr.y - nY);
  const sWallY = sLeg.y + sLeg.h, nWallY = nLeg.y;      // tenant-facing corridor edges
  const out = { tenants: n, corridorW, corridor: [], demising: [], suites: [], grossFt2: r1(W * H), leasableFt2: 0, notes: [], lobbyX };

  if (n === 1) {
    const rects = [rect(0, 0, W, H)];
    const area = r1(W * H - cr.w * cr.h);
    const stairPts = (stairs || []).map((s) => ({ x: s.rect.x + s.rect.w / 2, y: s.rect.y + s.rect.h / 2 }));
    const travel = stairPts.length ? Math.round(farthestTravel(rects, [cr], stairPts)) : 0;
    out.suites = [{ id: 0, name: "Tenant A", rects, zone: rects[0], areaFt2: area, occLoad: Math.ceil(area / OCC_FACTOR), exitsRequired: 2, commonPathFt: 0, travelFt: travel, doors: [], stairsInSuite: true }];
    out.leasableFt2 = area;
    out.notes.push(`single tenant — no public corridor; both stairs open into the suite (2 exits). Travel to nearest stair ${travel} ft ≤ 300.`);
    return out;
  }

  // ---- corridor legs + suite rect-sets (with a jogged demising for the 2-tenant case) ----
  let suiteRects = [], needS = false, needN = false;
  const neckH = Math.min(14, H - sWallY - 2);            // depth of the entry neck that carries A's door to the lobby

  if (n === 2) {
    needS = true;
    // West = everything left of balanceX, PLUS a neck (balanceX..lobbyX) at the corridor so its door reaches the lobby
    const west = [rect(0, 0, balanceX, H), rect(balanceX, sWallY, lobbyX - balanceX, neckH)];
    const east = [rect(balanceX, 0, W - balanceX, sWallY), rect(lobbyX, sWallY, W - lobbyX, neckH), rect(balanceX, sWallY + neckH, W - balanceX, H - sWallY - neckH)];
    suiteRects = [west, east];
    out.demising = [
      { x1: balanceX, y1: 0, x2: balanceX, y2: cr.y },                         // north field
      { x1: balanceX, y1: sWallY + neckH, x2: balanceX, y2: H },               // south field
      { x1: balanceX, y1: sWallY + neckH, x2: lobbyX, y2: sWallY + neckH },    // jog
      { x1: lobbyX, y1: sWallY + neckH, x2: lobbyX, y2: sWallY },              // neck east wall (to the lobby)
    ];
  } else if (n === 3) {                                  // West half | NE | SE (doors anchored to the lobby x)
    needS = needN = true;
    suiteRects = [[rect(0, 0, lobbyX, H)], [rect(lobbyX, 0, W - lobbyX, cyMid)], [rect(lobbyX, cyMid, W - lobbyX, H - cyMid)]];
    out.demising = [
      { x1: lobbyX, y1: 0, x2: lobbyX, y2: nWallY }, { x1: lobbyX, y1: sWallY, x2: lobbyX, y2: H },
      { x1: cr.x + cr.w, y1: cyMid, x2: W, y2: cyMid },
    ];
  } else {                                               // quadrants
    needS = needN = true;
    suiteRects = [[rect(0, 0, lobbyX, cyMid)], [rect(lobbyX, 0, W - lobbyX, cyMid)], [rect(0, cyMid, lobbyX, H - cyMid)], [rect(lobbyX, cyMid, W - lobbyX, H - cyMid)]];
    out.demising = [
      { x1: lobbyX, y1: 0, x2: lobbyX, y2: nWallY }, { x1: lobbyX, y1: sWallY, x2: lobbyX, y2: H },
      { x1: 0, y1: cyMid, x2: cr.x, y2: cyMid }, { x1: cr.x + cr.w, y1: cyMid, x2: W, y2: cyMid },
    ];
  }
  // ---- pass 1: geometry, occupant load, exits, doors (provisional, full-extent legs as blockers) ----
  const fullBlockers = [cr, sLeg, nLeg];
  const lobX0 = paxLobby ? paxLobby.rect.x : lobbyX - 5, lobX1 = paxLobby ? paxLobby.rect.x + paxLobby.rect.w : lobbyX + 5;
  const northDoorXs = [], stairNorthDoor = { W: false, E: false };
  const prelim = suiteRects.map((rects, i) => {
    const zone = { x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)) };
    zone.w = Math.max(...rects.map((r) => r.x + r.w)) - zone.x; zone.h = Math.max(...rects.map((r) => r.y + r.h)) - zone.y;
    let areaF = areaOf(rects); for (const b of fullBlockers) for (const r of rects) areaF -= overlap(r, b);
    const occ = Math.ceil(r1(areaF) / OCC_FACTOR);
    const south = zone.y + zone.h > sWallY + 0.5, west = (zone.x + zone.w / 2) < lobbyX;
    const wallY = south ? sWallY : nWallY;
    const swing = occ >= 50 ? (south ? "N" : "S") : (south ? "S" : "N");
    const primary = bfDoor({ x: r1(west ? lobbyX - 2.2 : lobbyX + 2.2), wallY, swing, hingeTowardX: lobbyX, egress: occ >= 50, primary: true });
    const cp = Math.round(farthestTravel(rects, fullBlockers, [primary]));
    const exits = occ > ONE_EXIT_MAX_OCC || cp > COMMON_PATH_MAX ? 2 : 1;
    const trigger = occ > ONE_EXIT_MAX_OCC && cp > COMMON_PATH_MAX ? "occ load + common path" : occ > ONE_EXIT_MAX_OCC ? "occ load > 49" : cp > COMMON_PATH_MAX ? `common path ${cp} ft > 100` : "";
    const doors = [primary];
    if (!south) northDoorXs.push(primary.x);
    if (exits >= 2) {                                          // remote exit toward the far stair on this leg
      const remoteX = r1(west ? cr.x + 4 : cr.x + cr.w - 4);
      doors.push(bfDoor({ x: remoteX, wallY, swing, hingeTowardX: west ? cr.x : cr.x + cr.w, egress: occ >= 50, primary: false }));
      if (!south) { northDoorXs.push(remoteX); stairNorthDoor[west ? "W" : "E"] = true; }
    }
    return { i, rects, zone, south, occ, exits, cp, trigger, doors };
  });

  // ---- corridor legs: S leg spans the core (stairs cap both ends); N leg TRIMMED to its used extent ----
  // A north suite needing only one exit reaches egress through the lobby — no full leg, no dead-end over a tenant.
  const anyN = prelim.some((p) => !p.south);
  if (prelim.some((p) => p.south)) out.corridor.push(sLeg);
  if (anyN) {
    const x0 = Math.max(cr.x, Math.min(lobX0, ...northDoorXs) - 3);
    const x1 = Math.min(cr.x + cr.w, Math.max(lobX1, ...northDoorXs) + 3);
    out.corridor.push(rect(x0, nY, x1 - x0, cr.y - nY));
  }
  out.stairNorthDoor = stairNorthDoor;
  const blockers = [cr, ...out.corridor];

  // ---- pass 2: final rentable area (with the trimmed corridor), egress + BF notes ----
  out.suites = prelim.map((p) => {
    let area = areaOf(p.rects); for (const b of blockers) for (const r of p.rects) area -= overlap(r, b); area = r1(area);
    const occ = Math.ceil(area / OCC_FACTOR);
    const travel = p.exits >= 2 ? Math.round(farthestTravel(p.rects, blockers, p.doors)) : p.cp;
    p.doors.forEach((dr) => { dr.bfOK = !overlap(dr.clear.pull, cr) && !overlap(dr.clear.push, cr) && dr.clear.pull.x >= -0.5 && dr.clear.pull.x + dr.clear.pull.w <= W + 0.5; });
    if (p.exits >= 2) out.notes.push(`Tenant ${NAMES[p.i]} ${area.toLocaleString()} sf · ${occ} occ → 2 exits (${p.trigger}); travel to nearest exit ${travel} ft ≤ 300`);
    else if (p.cp) out.notes.push(`Tenant ${NAMES[p.i]} ${area.toLocaleString()} sf · ${occ} occ · 1 exit · common path ${p.cp} ft ≤ 100`);
    if (p.doors.some((dr) => !dr.bfOK)) out.notes.push(`Tenant ${NAMES[p.i]}: door latch-side clearance blocked — relocate or add a power operator (OBC 3.8.3.3)`);
    return { id: p.i, name: "Tenant " + NAMES[p.i], rects: p.rects, zone: p.zone, areaFt2: area, occLoad: occ, exitsRequired: p.exits, commonPathFt: p.cp, travelFt: travel, doors: p.doors };
  });
  out.leasableFt2 = r1(out.suites.reduce((a, s) => a + s.areaFt2, 0));
  return out;
}
