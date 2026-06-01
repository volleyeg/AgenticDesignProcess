// client/src/bim/buildFromConstraints.js
// Turns the solver's output (constraints + a chosen scheme) into one BIM model.
import { BimModel, MODULE_FT, rectFt } from "./model.js";

const SEAT_PER_FT2 = { work: 1 / 45, meet: 1 / 25, social: 1 / 30, support: 0 };

export function buildBimModel(constraints, option) {
  const m = new BimModel({
    name: `${constraints.projectType || "Fit"} — ${option.name}`,
    projectType: constraints.projectType || "project",
  });
  const level = m.addLevel({ name: "Level 1", elevationFt: 0, floorToFloorFt: 13 });

  const idMap = {}; // solver zone id -> bim space id
  for (const z of option.zones || []) {
    const fp = rectFt(z.x * MODULE_FT, z.y * MODULE_FT, z.w * MODULE_FT, z.h * MODULE_FT);
    const areaFt2 = z.w * MODULE_FT * (z.h * MODULE_FT);
    const seats = Math.round((SEAT_PER_FT2[z.kind] || 0) * areaFt2);
    const sp = m.addSpace({
      levelId: level.id,
      name: z.label,
      kind: z.kind,
      footprintFt: fp,
      heightFt: 9,
      daylight: !!z.daylight,
      seats,
    });
    idMap[z.id] = sp.id;
  }

  for (const a of constraints.adjacencies || []) {
    if (idMap[a.a] && idMap[a.b]) m.addAdjacency(idMap[a.a], idMap[a.b], a.weight || 1);
  }

  return m;
}
