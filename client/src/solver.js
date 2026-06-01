// client/src/solver.js
// Deterministic placement + metrics. No model, no key, never fails.

export const GRID = 40;

export const KIND_COLORS = {
  work: "var(--cyan)", meet: "var(--amber)", support: "var(--slate-z)", social: "var(--green)", default: "var(--slate-z)",
};

export const APPROACHES = [
  { name: "Connected Core", rationale: "Social and arrival spaces anchor the entry; work and support wrap the core." },
  { name: "Daylight First", rationale: "Occupied spaces pushed to the daylit perimeter; support absorbed into the interior." },
  { name: "Efficient Grid", rationale: "Dense orthogonal packing prioritizes usable area and short circulation." },
];

export const SAMPLES = [
  { tag: "Tech HQ floor", text: "Fit-out of a single 14x9 floorplate for a 90-person software team. Needs ~60 desks in neighborhoods, 4 small meeting rooms, 2 large conference rooms, a focus/quiet zone, a generous social cafe near the entry, and a wellness room. Daylight matters most for desks and the cafe. Collaboration and a strong sense of arrival are the priorities." },
  { tag: "Boutique clinic", text: "Test-fit for a 12x8 floorplate medical clinic. Needs a welcoming reception/waiting area, 6 exam rooms, 2 consult offices, a small lab, staff break room, and storage. Patient calm, clear wayfinding, and daylight in waiting + consult rooms are the priorities." },
  { tag: "Flagship retail", text: "Schematic zoning for a 13x9 flagship retail space. Needs an experiential entry moment, main shop floor, a featured product gallery, fitting rooms, a service/clienteling bar, stockroom, and back-of-house. Brand storytelling and dwell time near the entry are the priorities; daylight for the shop floor and gallery." },
];

function orderSpaces(spaces, approach) {
  const arr = [...spaces];
  if (approach === "Daylight First") arr.sort((a, b) => (b.daylight ? 1 : 0) - (a.daylight ? 1 : 0) || b.w * b.h - a.w * a.h);
  else if (approach === "Efficient Grid") arr.sort((a, b) => b.w * b.h - a.w * a.h);
  else { const rank = (k) => ({ social: 0, meet: 1, work: 2, support: 3 }[k] ?? 4); arr.sort((a, b) => rank(a.kind) - rank(b.kind)); }
  return arr;
}

function packShelf(spaces, fw, fh) {
  const zones = []; let x = 0, y = 0, rowH = 0;
  for (const s of spaces) {
    let w = Math.min(Math.max(1, s.w), fw); let h = Math.max(1, s.h);
    if (x + w > fw + 0.001) { x = 0; y += rowH; rowH = 0; }
    if (y + h > fh) { if (fh - y > 0) h = fh - y; else y = Math.max(0, fh - h); }
    zones.push({ id: s.id, label: s.label, kind: s.kind, daylight: !!s.daylight, x, y, w, h });
    x += w; rowH = Math.max(rowH, h);
  }
  return zones;
}

export function generateOptions(c) {
  return APPROACHES.map((ap) => ({
    name: ap.name, rationale: ap.rationale,
    zones: packShelf(orderSpaces(c.spaces || [], ap.name), c.floorplate.w, c.floorplate.h),
  }));
}

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
  const fw = c.floorplate.w, fh = c.floorplate.h, z = o.zones || [];
  const utilization = z.reduce((s, q) => s + q.w * q.h, 0) / (fw * fh);
  let overlaps = 0;
  for (let i = 0; i < z.length; i++) for (let j = i + 1; j < z.length; j++) if (overlapArea(z[i], z[j]) > 0.01) overlaps++;
  const dl = z.filter((q) => q.daylight);
  const touching = dl.filter((q) => q.x <= 0.01 || q.y <= 0.01 || Math.abs(q.x + q.w - fw) <= 0.01 || Math.abs(q.y + q.h - fh) <= 0.01).length;
  const daylightPct = dl.length ? touching / dl.length : 1;
  const adj = c.adjacencies || []; let sat = 0;
  adj.forEach((a) => { const za = z.find((q) => q.id === a.a), zb = z.find((q) => q.id === a.b); if (za && zb && touch(za, zb, 0.25)) sat++; });
  const adjacencyPct = adj.length ? sat / adj.length : 1;
  const utilScore = Math.max(0, 100 - Math.abs(utilization - 0.65) * 220);
  const computedScore = Math.max(0, Math.min(100, Math.round(0.3 * utilScore + 0.35 * daylightPct * 100 + 0.35 * adjacencyPct * 100 - overlaps * 10)));
  return { utilization: Math.round(utilization * 100), daylightPct: Math.round(daylightPct * 100), adjacencyPct: Math.round(adjacencyPct * 100), overlaps, computedScore };
}
