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

// Common path of egress travel MEASURED THROUGH THE CORRIDOR NETWORK (IBC defn): distance from the most remote
// point to where two distinct paths to two exits first become available. Grids the suite + corridor legs + lobby;
// the suite connects to the corridor ONLY at its door(s); stairs are the exits. With shortest-path fields dA, dB
// from the two exits (and dAB between them), the shared-prefix length to a point R is (dA[R]+dB[R]-dAB)/2 — the
// travel before the routes diverge. Returns the worst-case common path and the exit-access travel distance.
function suiteEgress(rects, doors, corridorRects, lobby, exits, cr, cell = 3) {
  if (!exits.length || !doors.length) return { commonPath: 0, travel: 0 };
  const zones = [...rects, ...corridorRects]; if (lobby) zones.push(lobby);
  const pts = exits.concat(doors.map((d) => ({ x: d.x, y: d.y })));
  const x0 = Math.min(...zones.map((r) => r.x), ...pts.map((p) => p.x)), y0 = Math.min(...zones.map((r) => r.y), ...pts.map((p) => p.y));
  const x1 = Math.max(...zones.map((r) => r.x + r.w), ...pts.map((p) => p.x)), y1 = Math.max(...zones.map((r) => r.y + r.h), ...pts.map((p) => p.y));
  const nx = Math.max(2, Math.round((x1 - x0) / cell)), ny = Math.max(2, Math.round((y1 - y0) / cell));
  const cw = (x1 - x0) / nx, ch = (y1 - y0) / ny, N = nx * ny;
  const px = (i) => x0 + (i + 0.5) * cw, py = (j) => y0 + (j + 0.5) * ch;
  const inR = (x, y, r) => x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01;
  const cls = new Uint8Array(N);                                  // 0 blocked · 1 suite · 2 corridor/lobby
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = px(i), y = py(j), k = j * nx + i;
    if (lobby && inR(x, y, lobby)) cls[k] = 2;                    // lobby is walkable egress (inside the core)
    else if (inR(x, y, cr)) cls[k] = 0;                          // rest of the core is solid
    else if (corridorRects.some((c) => inR(x, y, c))) cls[k] = 2;
    else if (rects.some((r) => inR(x, y, r))) cls[k] = 1;
    else cls[k] = 0;
  }
  const nearest = (x, y, want) => { let bk = -1, bd = Infinity; for (let k = 0; k < N; k++) if (cls[k] === want) { const d = Math.hypot(px(k % nx) - x, py((k / nx) | 0) - y); if (d < bd) { bd = d; bk = k; } } return bk; };
  const portal = new Map();                                       // suite<->corridor links, only at doors
  const link = (a, b) => { if (a < 0 || b < 0) return; if (!portal.has(a)) portal.set(a, []); portal.get(a).push(b); if (!portal.has(b)) portal.set(b, []); portal.get(b).push(a); };
  for (const d of doors) link(nearest(d.x, d.y, 1), nearest(d.x, d.y, 2));
  const exitCells = exits.map((e) => nearest(e.x, e.y, 2)).filter((k) => k >= 0);
  if (!exitCells.length) return { commonPath: 0, travel: 0 };
  const diag = Math.hypot(cw, ch), orth = (cw + ch) / 2;
  const run = (src) => {
    const dist = new Float64Array(N).fill(Infinity), heap = [];
    const up = (c) => { while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break;[heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const push = (d, k) => { heap.push([d, k]); up(heap.length - 1); };
    const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let c = 0; for (; ;) { const a = 2 * c + 1, b = 2 * c + 2; let s = c; if (a < heap.length && heap[a][0] < heap[s][0]) s = a; if (b < heap.length && heap[b][0] < heap[s][0]) s = b; if (s === c) break;[heap[s], heap[c]] = [heap[c], heap[s]]; c = s; } } return t; };
    dist[src] = 0; push(0, src);
    while (heap.length) {
      const [d, k] = pop(); if (d > dist[k]) continue;
      const i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const nk = nj * nx + ni; if (cls[nk] === 0 || cls[nk] !== cls[k]) continue;   // same region only
        const nd = d + (di && dj ? diag : orth); if (nd < dist[nk]) { dist[nk] = nd; push(nd, nk); }
      }
      const pl = portal.get(k); if (pl) for (const nk of pl) { const nd = d + Math.hypot(px(nk % nx) - px(i), py(((nk / nx) | 0)) - py(j)); if (nd < dist[nk]) { dist[nk] = nd; push(nd, nk); } }
    }
    return dist;
  };
  const dA = run(exitCells[0]);
  const dB = exitCells.length >= 2 ? run(exitCells[1]) : dA;
  const dAB = exitCells.length >= 2 ? dA[exitCells[1]] : 0;
  let cp = 0, tr = 0;
  for (let k = 0; k < N; k++) if (cls[k] === 1) {
    const a = dA[k], b = dB[k];
    if (isFinite(a) && isFinite(b)) { cp = Math.max(cp, (a + b - dAB) / 2); tr = Math.max(tr, Math.min(a, b)); }
    else if (isFinite(a)) { cp = Math.max(cp, a); tr = Math.max(tr, a); }
    else if (isFinite(b)) { cp = Math.max(cp, b); tr = Math.max(tr, b); }
  }
  return { commonPath: Math.max(0, Math.round(cp)), travel: Math.round(tr) };
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
  // ---- pass 1: split stair discharge (westmost stair → NORTH leg, the rest → SOUTH leg) so a deep suite's
  // two exits diverge early — north half exits north, south half exits south. Then size doors + exits. ----
  const fullBlockers = [cr, sLeg, nLeg];
  const lobX0 = paxLobby ? paxLobby.rect.x : lobbyX - 5, lobX1 = paxLobby ? paxLobby.rect.x + paxLobby.rect.w : lobbyX + 5;
  const sortedStairs = (stairs || []).slice().sort((a, b) => a.rect.x - b.rect.x);
  const northStair = sortedStairs[0] || null;                  // a switchback stair discharges ONE end; westmost → north
  const northStairX = northStair ? r1(northStair.rect.x + northStair.rect.w / 2) : null;
  const exitPts = (stairs || []).map((s) => ({ x: s.rect.x + s.rect.w / 2, y: northStair && s === northStair ? cr.y : cr.y + cr.h }));
  out.stairDischargeNorthX = northStairX;                      // renderer: this stair's floor-landing door faces north
  const fullCorr = [sLeg, nLeg], lobbyRect = paxLobby ? paxLobby.rect : null;
  const northDoorXs = [];
  const DOORM = 3.5;                                            // min clearance from a door's center to a side wall (½ leaf + jamb + buffer)

  const prelim = suiteRects.map((rects, i) => {
    const zone = { x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)) };
    zone.w = Math.max(...rects.map((r) => r.x + r.w)) - zone.x; zone.h = Math.max(...rects.map((r) => r.y + r.h)) - zone.y;
    let areaF = areaOf(rects); for (const b of fullBlockers) for (const r of rects) areaF -= overlap(r, b);
    const occ = Math.ceil(r1(areaF) / OCC_FACTOR);
    const west = (zone.x + zone.w / 2) < lobbyX;
    const touchesS = zone.y + zone.h > sWallY + 0.5, touchesN = zone.y < nY - 0.5, fullHeight = touchesS && touchesN;
    const lobDoorX = west ? lobbyX - 2.2 : lobbyX + 2.2;
    const mkDoor = (x, wallY, onSouthLeg, primary) => bfDoor({ x: r1(x), wallY, swing: occ >= 50 ? (onSouthLeg ? "N" : "S") : (onSouthLeg ? "S" : "N"), hingeTowardX: lobbyX, egress: occ >= 50, primary });
    // door-able x-range on a leg: ONLY the rects that straddle that leg's tenant wall (so a jog's deep rect can't
    // drag the range onto the demising), kept DOORM clear of the suite's side walls so a leaf never lands on a wall
    const frontage = (onSouthLeg) => {
      const w = onSouthLeg ? sWallY : nWallY;
      const rs = rects.filter((r) => onSouthLeg ? (r.y <= w + 0.01 && r.y + r.h > w + 0.01) : (r.y < w - 0.01 && r.y + r.h >= w - 0.01));
      if (!rs.length) return [lobbyX, lobbyX];
      const a = Math.max(cr.x + DOORM, Math.min(...rs.map((r) => r.x)) + DOORM), b = Math.min(cr.x + cr.w - DOORM, Math.max(...rs.map((r) => r.x + r.w)) - DOORM);
      return a <= b ? [a, b] : [(a + b) / 2, (a + b) / 2];
    };
    const place = (x, onSouthLeg) => { const [a, b] = frontage(onSouthLeg); return Math.min(b, Math.max(a, x)); };
    let doors, exits, trigger, eg, hasN = false, hasS = false;
    if (fullHeight) {                                          // door on EACH leg → divergent N/S egress
      const sd = mkDoor(place(lobDoorX, true), sWallY, true, true);          // main entry at the lobby + south egress
      const nd = mkDoor(place(northStairX != null ? northStairX : lobDoorX, false), nWallY, false, false);  // north egress toward the north stair
      doors = [sd, nd]; northDoorXs.push(nd.x); hasS = hasN = true;
      exits = 2; trigger = "full-height — divergent N/S exits";
      eg = suiteEgress(rects, doors, fullCorr, lobbyRect, exitPts, cr);
    } else {                                                   // quadrant fronts a single leg
      const onS = touchesS, wallY = onS ? sWallY : nWallY;
      const primary = mkDoor(place(lobDoorX, onS), wallY, onS, true);
      doors = [primary]; if (onS) hasS = true; else { hasN = true; northDoorXs.push(primary.x); }
      const e1 = suiteEgress(rects, [primary], fullCorr, lobbyRect, exitPts, cr);
      exits = occ > ONE_EXIT_MAX_OCC || e1.commonPath > COMMON_PATH_MAX ? 2 : 1;
      trigger = occ > ONE_EXIT_MAX_OCC && e1.commonPath > COMMON_PATH_MAX ? "occ load + common path" : occ > ONE_EXIT_MAX_OCC ? "occ load > 49" : e1.commonPath > COMMON_PATH_MAX ? `single-exit common path ${e1.commonPath} ft > 100` : "";
      if (exits >= 2) {                                        // remote at the far end of the frontage (away from the lobby)
        const [f0, f1] = frontage(onS);
        const remoteX = Math.abs(f0 - lobDoorX) > Math.abs(f1 - lobDoorX) ? f0 : f1;
        const rd = mkDoor(remoteX, wallY, onS, false);
        doors.push(rd); if (!onS) northDoorXs.push(rd.x);
      }
      eg = exits >= 2 ? suiteEgress(rects, doors, fullCorr, lobbyRect, exitPts, cr) : e1;
    }
    return { i, rects, zone, occ, exits, trigger, doors, hasN, hasS, commonPath: eg.commonPath, travel: eg.travel };
  });

  // ---- corridor legs: S leg spans the core (E stair discharges south at its east end). N leg reaches the
  // north-discharging (west) stair and covers the north doors; east surplus trimmed back to the tenants. ----
  if (prelim.some((p) => p.hasS)) out.corridor.push(sLeg);
  if (prelim.some((p) => p.hasN)) {
    const x1 = Math.min(cr.x + cr.w, Math.max(lobX1, ...northDoorXs) + 3);
    out.corridor.push(rect(cr.x, nY, x1 - cr.x, cr.y - nY));    // x0 = cr.x so the leg meets the north stair
  }
  const blockers = [cr, ...out.corridor];

  // ---- pass 2: final rentable area (with the trimmed corridor), egress + BF notes ----
  out.suites = prelim.map((p) => {
    let area = areaOf(p.rects); for (const b of blockers) for (const r of p.rects) area -= overlap(r, b); area = r1(area);
    const occ = Math.ceil(area / OCC_FACTOR);
    p.doors.forEach((dr) => { dr.bfOK = !overlap(dr.clear.pull, cr) && !overlap(dr.clear.push, cr) && dr.clear.pull.x >= -0.5 && dr.clear.pull.x + dr.clear.pull.w <= W + 0.5; });
    if (p.exits >= 2) out.notes.push(`Tenant ${NAMES[p.i]} ${area.toLocaleString()} sf · ${occ} occ → 2 exits (${p.trigger}); common path ${p.commonPath} ft, travel ${p.travel} ft ≤ 300`);
    else out.notes.push(`Tenant ${NAMES[p.i]} ${area.toLocaleString()} sf · ${occ} occ · 1 exit · common path ${p.commonPath} ft ≤ 100`);
    if (p.commonPath > COMMON_PATH_MAX) out.notes.push(`Tenant ${NAMES[p.i]}: common path ${p.commonPath} ft still > 100 — separate the two exits further (IBC 1006.2.1)`);
    if (p.travel > 300) out.notes.push(`Tenant ${NAMES[p.i]}: travel ${p.travel} ft > 300 — needs a closer exit (IBC 1017)`);
    if (p.doors.some((dr) => !dr.bfOK)) out.notes.push(`Tenant ${NAMES[p.i]}: door latch-side clearance blocked — relocate or add a power operator (OBC 3.8.3.3)`);
    return { id: p.i, name: "Tenant " + NAMES[p.i], rects: p.rects, zone: p.zone, areaFt2: area, occLoad: occ, exitsRequired: p.exits, commonPathFt: p.commonPath, travelFt: p.travel, doors: p.doors };
  });
  out.leasableFt2 = r1(out.suites.reduce((a, s) => a + s.areaFt2, 0));
  return out;
}
