// client/src/solver.js
// Generates 3 schemes by sizing a floor from the program and running the
// span-derived floor generator (single/double/racetrack decided by depth).
import { generatePlan } from "./bim/floorgen.js";

export const GRID = 40; // legacy px constant (kept for imports)

export const KIND_COLORS = {
  work: "var(--cyan)", meet: "var(--amber)", support: "var(--slate-z)",
  social: "var(--green)", core: "#586173", corridor: "#3a4250", stair: "#c98b5a", default: "var(--slate-z)",
};

export const APPROACHES = [
  { name: "Connected Core", rationale: "Balanced floor: offices on the glass, support rooms flanking a central core, racetrack circulation.", targetUtil: 0.62, aspect: 1.5, roomDepthFt: 15, interiorDepthFt: 14 },
  { name: "Daylight First", rationale: "Wider, shallower plate that pushes nearly every room to the perimeter for maximum daylight.", targetUtil: 0.55, aspect: 1.9, roomDepthFt: 14, interiorDepthFt: 20 },
  { name: "Efficient Grid", rationale: "Tighter, deeper plate with more interior rooms for high usable area.", targetUtil: 0.72, aspect: 1.3, roomDepthFt: 16, interiorDepthFt: 12 },
];

export const SAMPLES = [
  { tag: "Tech HQ floor", text: "Fit-out of a single floorplate for a 90-person software team. Needs ~6 desk neighborhoods, 4 small meeting rooms, 2 large conference rooms, a focus/quiet zone, a generous social cafe near the entry, a wellness room, IT, and storage. Daylight matters most for desks and the cafe. Collaboration and a strong sense of arrival are the priorities." },
  { tag: "Boutique clinic", text: "Test-fit for a floorplate medical clinic. Needs a welcoming reception/waiting area, 6 exam rooms, 2 consult offices, a small lab, staff break room, and storage. Patient calm, clear wayfinding, and daylight in waiting + consult rooms are the priorities." },
  { tag: "Flagship retail", text: "Schematic zoning for a flagship retail space. Needs an experiential entry, main shop floor, a featured product gallery, fitting rooms, a service/clienteling bar, stockroom, and back-of-house. Brand storytelling and dwell time near the entry are the priorities; daylight for the shop floor and gallery." },
];

const MODULE_FT = 5;
const PROGRAM_SCALE = 5;   // sensed modules are schematic; scale to realistic floor areas
const MIN_FLOOR_FT2 = 8500;

// program area (ft^2) from the sensed spaces (their w*h are in 5-ft modules)
function programAreaFt2(constraints) {
  const a = (constraints.spaces || []).reduce((s, r) => s + (r.w || 2) * (r.h || 2) * MODULE_FT * MODULE_FT, 0);
  return Math.max(a * PROGRAM_SCALE, 4000);
}

function sizeFloor(programFt2, ap) {
  // floor sized so program lands near the target net-to-gross
  const floorArea = Math.max(programFt2 / ap.targetUtil, MIN_FLOOR_FT2);
  let W = Math.round(Math.sqrt(floorArea * ap.aspect));
  let H = Math.round(floorArea / Math.max(W, 1));
  W = Math.max(W, 70); H = Math.max(H, 55);
  return { W, H };
}

function layout(constraints, ap) {
  const rooms = (constraints.spaces || []).map((s, i) => ({
    id: s.id || "s" + i, label: s.label, kind: s.kind, daylight: !!s.daylight,
  }));
  const prog = programAreaFt2(constraints);
  let { W, H } = sizeFloor(prog, ap);
  const params = { roomDepthFt: ap.roomDepthFt, interiorDepthFt: ap.interiorDepthFt, corridorFt: 5, minRoomFt: 8 };

  let plan = generatePlan({ W, H, rooms, params });
  let guard = 0;
  while (!plan.feasible && guard++ < 8) { W = Math.round(W * 1.12); H = Math.round(H * 1.12); plan = generatePlan({ W, H, rooms, params }); }
  if (!plan.feasible) plan = generatePlan({ W: 90, H: 70, rooms, params });

  return { name: ap.name, rationale: ap.rationale, floorFt: { w: plan.W, h: plan.H }, plan, classification: plan.classification, spans: plan.spans };
}

export function generateOptions(constraints) {
  return APPROACHES.map((ap) => layout(constraints, ap));
}

const SEAT_PER_FT2 = { work: 1 / 45, meet: 1 / 25, social: 1 / 30, support: 0 };

export function computeMetrics(o, _c) {
  const p = o.plan;
  const floorArea = p.W * p.H;
  const roomArea = p.rooms.reduce((s, r) => s + r.w * r.h, 0);
  const coreArea = (p.core.w || 0) * (p.core.h || 0);
  const corrArea = p.corridors.reduce((s, c) => s + c.w * c.h, 0);
  const utilization = (roomArea + coreArea) / floorArea;

  const dayTotal = p.rooms.filter((r) => r.daylight).length;
  const daySat = p.rooms.filter((r) => r.daylight && r.band === "perimeter").length;
  const daylightPct = dayTotal ? daySat / dayTotal : 1;

  const circulationPct = corrArea / floorArea;
  const seats = p.rooms.reduce((s, r) => s + Math.round((SEAT_PER_FT2[r.kind] || 0) * r.w * r.h), 0);

  const utilScore = Math.max(0, 100 - Math.abs(utilization - 0.68) * 200);
  const circScore = Math.max(0, 100 - Math.abs(circulationPct - 0.13) * 350); // reward sane circulation share
  const computedScore = Math.max(0, Math.min(100, Math.round(0.35 * utilScore + 0.4 * daylightPct * 100 + 0.25 * circScore)));

  return {
    utilization: Math.round(utilization * 100),
    daylightPct: Math.round(daylightPct * 100),
    circulationPct: Math.round(circulationPct * 100),
    seats,
    classification: p.classification,
    overlaps: 0,
    computedScore,
  };
}
