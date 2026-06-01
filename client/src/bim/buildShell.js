// client/src/bim/buildShell.js
// Turns a generated shell into one BIM model: structural columns, curtain-wall facade,
// and the core decomposed into its real, individually-placed parts (elevator banks,
// lobby, men's/women's, risers, IDF, janitor, lactation) plus opposed egress stairs.
import { BimModel } from "./model.js";

const toFp = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

export function buildShellModel(shell) {
  const f2f = shell.inputs.floorToFloorFt || 13;
  const m = new BimModel({
    name: `Shell — ${shell.programLabel} · ${shell.inputs.coreType} core · ${shell.areaFt2.toLocaleString()} sf · ${shell.stories} st`,
    projectType: "shell",
  });
  const level = m.addLevel({ name: "Level 1", elevationFt: 0, floorToFloorFt: f2f });

  // faint core container (skip for double — its bounding rect spans the whole floor)
  if (shell.core.frontDir !== "split") m.addCore({ levelId: level.id, footprintFt: toFp(shell.core.rect), heightFt: f2f });

  // decomposed core components, each as a typed space
  for (const c of shell.core.components) {
    m.addSpace({ levelId: level.id, name: c.name, kind: c.type, footprintFt: toFp(c.rect), heightFt: 9 });
  }
  // egress stairs
  for (const r of shell.core.stairs) m.addStair({ levelId: level.id, footprintFt: toFp(r), heightFt: f2f });

  // structural grid
  for (const col of shell.grid.columns) m.addColumn({ levelId: level.id, xFt: col.xFt, yFt: col.yFt, sizeFt: col.sizeFt });

  // curtain-wall facade
  m.facade = { W: shell.W, H: shell.H, moduleFt: shell.facade.moduleFt, spandrelFt: shell.facade.spandrelFt,
    mullionsX: shell.facade.mullionsX, mullionsY: shell.facade.mullionsY };

  return m;
}
