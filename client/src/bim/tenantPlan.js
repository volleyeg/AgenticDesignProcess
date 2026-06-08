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

export function planTenants({ W, H, core, tenants = 1, corridorW = 6 }) {
  const cr = core.rect;
  const n = Math.max(1, Math.min(4, tenants | 0));
  const NAMES = ["A", "B", "C", "D"];
  const cx = cr.x + cr.w / 2;                 // lobby is centered on the core
  const cyMid = cr.y + cr.h / 2;
  const sY = cr.y + cr.h, nY = Math.max(0, cr.y - corridorW);
  const out = { tenants: n, corridorW, corridor: [], demising: [], suites: [], grossFt2: r1(W * H), leasableFt2: 0, notes: [] };

  const exitsFor = (areaFt2) => (areaFt2 / OCC_FACTOR > ONE_EXIT_MAX_OCC ? 2 : 1);
  const sLeg = () => rect(cr.x, sY, cr.w, Math.min(corridorW, H - sY));
  const nLeg = () => rect(cr.x, nY, cr.w, cr.y - nY);

  // ---- single tenant: no corridor; the suite wraps the core, both stairs open into it ----
  if (n === 1) {
    const area = r1(W * H - cr.w * cr.h);
    out.suites = [{ id: 0, name: "Tenant A", zone: rect(0, 0, W, H), areaFt2: area, occLoad: Math.ceil(area / OCC_FACTOR), exitsRequired: 2, doors: [], stairsInSuite: true }];
    out.leasableFt2 = area;
    out.notes.push("single tenant — no public corridor; both stairs open directly into the suite (2 exits inherent)");
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

  // ---- build suites: area (zone minus core minus corridor), exits, doors near the lobby ----
  out.suites = zones.map((z, i) => {
    let area = z.w * z.h - overlap(z, cr);
    for (const c of out.corridor) area -= overlap(z, c);
    area = r1(area);
    const occ = Math.ceil(area / OCC_FACTOR);
    const exits = exitsFor(area);
    // pick the leg this suite fronts: south leg if the suite has area south of the core, else north
    const south = z.y + z.h > sY + 0.5;
    const leg = south ? sLeg() : nLeg();
    const wallY = south ? leg.y + leg.h : leg.y;          // the suite-facing edge of the corridor
    const swing = exits >= 1 && occ >= 50 ? (south ? "N" : "S") : (south ? "S" : "N"); // >=50 occ swings to egress (into corridor)
    // frontage = where this suite is adjacent to the leg
    const fx0 = Math.max(z.x, leg.x) + 2, fx1 = Math.min(z.x + z.w, leg.x + leg.w) - 2;
    const doors = [];
    if (fx1 > fx0) {
      const near = Math.max(fx0, Math.min(fx1, cx));       // closest point to the lobby -> primary door (elevator exposure)
      doors.push({ x: r1(near), y: r1(wallY), swing, egress: occ >= 50, primary: true });
      if (exits >= 2) {                                    // second, remote exit toward the far stair
        const remote = (cx - fx0) > (fx1 - cx) ? fx0 + 1 : fx1 - 1; // far end of frontage
        doors.push({ x: r1(remote), y: r1(wallY), swing, egress: occ >= 50, primary: false });
      }
    }
    if (exits >= 2) out.notes.push(`Tenant ${NAMES[i]} ${area.toLocaleString()} sf ~ ${occ} occ -> 2 exits (IBC 1006.2.1)`);
    return { id: i, name: "Tenant " + NAMES[i], zone: z, areaFt2: area, occLoad: occ, exitsRequired: exits, doors };
  });
  out.leasableFt2 = r1(out.suites.reduce((a, s) => a + s.areaFt2, 0));
  return out;
}
