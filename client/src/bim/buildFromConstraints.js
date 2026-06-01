// client/src/bim/buildFromConstraints.js
// Turns a chosen scheme (option.plan, in feet) into one BIM model:
// rooms -> spaces, core -> core, corridors -> corridors, stairs -> stairs.
import { BimModel } from "./model.js";

const SEAT_PER_FT2 = { work: 1 / 45, meet: 1 / 25, social: 1 / 30, support: 0 };
const toFp = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

export function buildBimModel(constraints, option) {
  const m = new BimModel({
    name: `${constraints.projectType || "Fit"} — ${option.name}`,
    projectType: constraints.projectType || "project",
  });
  const level = m.addLevel({ name: "Level 1", elevationFt: 0, floorToFloorFt: 13 });
  const p = option.plan;
  if (!p) return m;

  m.addCore({ levelId: level.id, footprintFt: toFp(p.core), heightFt: 13 });

  for (const r of p.rooms) {
    const areaFt2 = r.w * r.h;
    const seats = Math.round((SEAT_PER_FT2[r.kind] || 0) * areaFt2);
    m.addSpace({ levelId: level.id, name: r.label, kind: r.kind, footprintFt: toFp(r), heightFt: 9, daylight: !!r.daylight, seats });
  }
  for (const c of p.corridors) m.addCorridor({ levelId: level.id, footprintFt: toFp(c), heightFt: 9, loading: p.classification });
  for (const s of p.stairs) m.addStair({ levelId: level.id, footprintFt: toFp(s), heightFt: 13 });

  return m;
}
