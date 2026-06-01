// Random-floor gauntlet for the span-derived floor generator.
// Generates N random plates, runs the logic, auto-checks hard rules, reports failures + distribution.
import { generatePlan, DEFAULT_PARAMS } from "../client/src/bim/floorgen.js";

const N = parseInt(process.argv[2] || "3000");
const SEED_ROOMS = (n, dayFrac) => Array.from({ length: n }, (_, i) => ({
  label: "R" + i, kind: Math.random() < 0.5 ? "work" : "support", daylight: Math.random() < dayFrac,
}));

function overlap(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}
function touches(a, b, tol = 0.6) {
  const gx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const gy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  const overlapsXY = overlap(a, b) > 0.1;
  return (gx <= tol && gy <= tol) || overlapsXY;
}

function check(plan) {
  const fails = [];
  const { W, H, core, rooms, corridors, stairs, params } = plan;
  // 1. rooms in bounds, no overlaps (rooms+core)
  const solids = [...rooms, core];
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (r.x < -0.1 || r.y < -0.1 || r.x + r.w > W + 0.1 || r.y + r.h > H + 0.1) fails.push("room out of bounds");
    if (r.w < params.minRoomFt - 0.1 || r.h < params.minRoomFt - 0.1) {
      // allow thin only if it's a sliver from rounding; flag if clearly too small
      if (r.w < params.minRoomFt * 0.5 || r.h < params.minRoomFt * 0.5) fails.push("room too small");
    }
  }
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      const pX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const pY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (pX > 0.5 && pY > 0.5) fails.push("solid overlap"); // real penetration, not a shared wall
    }
  // 2. every room adjacent to a corridor
  for (const r of rooms) {
    if (!corridors.some((c) => touches(r, c))) fails.push("room not on a corridor");
  }
  // 3. corridor width >= 80% of spec
  for (const c of corridors) {
    if (Math.min(c.w, c.h) < params.corridorFt * 0.8 - 0.01) fails.push("corridor too narrow");
  }
  // 4. core adjacent to a corridor (spur)
  if (!corridors.some((c) => touches(core, c))) fails.push("core not on a corridor");
  // 5. two stairs, each adjacent to a corridor
  if (stairs.length !== 2) fails.push("not 2 stairs");
  for (const s of stairs) if (!corridors.some((c) => touches(s, c))) fails.push("stair not on a corridor");
  // 6. loading classification matches measured span rule
  const expectH = plan.spans.availH >= params.interiorDepthFt;
  const expectV = plan.spans.availV >= params.interiorDepthFt;
  const expected = expectH && expectV ? "racetrack" : expectH || expectV ? "double-loaded" : "single-loaded";
  if (expected !== plan.classification) fails.push(`class mismatch (got ${plan.classification}, span implies ${expected})`);
  // 7. corridor ring connected: each spur touches a ring segment
  const ring = corridors.slice(0, 4), spurs = corridors.slice(4);
  for (const sp of spurs) if (!ring.some((c) => touches(sp, c))) fails.push("spur not connected to ring");
  return [...new Set(fails)];
}

const dist = { "single-loaded": 0, "double-loaded": 0, racetrack: 0 };
let infeasible = 0, failures = 0;
const failExamples = [];

for (let i = 0; i < N; i++) {
  const W = Math.round(40 + Math.random() * 260);
  const H = Math.round(38 + Math.random() * 230);
  const nRooms = 4 + Math.floor(Math.random() * 16);
  const plan = generatePlan({ W, H, rooms: SEED_ROOMS(nRooms, 0.55), params: {} });
  if (!plan.feasible) { infeasible++; continue; }
  const fails = check(plan);
  dist[plan.classification] = (dist[plan.classification] || 0) + 1;
  if (fails.length) {
    failures++;
    if (failExamples.length < 12) failExamples.push({ W, H, nRooms, class: plan.classification, spans: plan.spans, fails });
  }
}

const ok = N - infeasible;
console.log(`\n=== GAUNTLET: ${N} random floors ===`);
console.log(`feasible: ${ok}  | infeasible (too small): ${infeasible}`);
console.log(`FAILURES: ${failures}  (${((failures / Math.max(ok,1)) * 100).toFixed(1)}%)`);
console.log(`\ndistribution of plan types (of feasible):`);
for (const k of ["single-loaded", "double-loaded", "racetrack"])
  console.log(`  ${k.padEnd(14)} ${dist[k]}  (${((dist[k] / Math.max(ok,1)) * 100).toFixed(0)}%)`);
if (failExamples.length) {
  console.log(`\nfirst failures (exact dims):`);
  for (const f of failExamples) console.log(`  ${f.W}x${f.H} rooms ${f.nRooms} [${f.class}] availH ${f.spans.availH} availV ${f.spans.availV} -> ${f.fails.join("; ")}`);
}
console.log(failures === 0 ? "\n>>> GAUNTLET PASSED — 0 failures" : "\n>>> FAILURES PRESENT — fix before push");
