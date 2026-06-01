// client/src/bim/buildShell.js
// Turns a generated shell (from shellgen) into one BIM model: structural columns,
// curtain-wall facade, and a core decomposed into its real parts (elevators,
// stairs, restrooms, shafts, lobby). This is the foundation the space planner
// later snaps to — it does not invent a core.
import { BimModel } from "./model.js";

const toFp = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

export function buildShellModel(shell) {
  const f2f = shell.inputs.floorToFloorFt || 13;
  const m = new BimModel({
    name: `Shell — ${shell.inputs.coreType} core · ${shell.areaFt2.toLocaleString()} sf · ${shell.stories} st`,
    projectType: "shell",
  });
  const level = m.addLevel({ name: "Level 1", elevationFt: 0, floorToFloorFt: f2f });
  const c = shell.core.components;

  // core outline (faint container) then its decomposed parts on top
  m.addCore({ levelId: level.id, footprintFt: toFp(shell.core.rect), heightFt: f2f });
  const sp = (name, kind, r) => r && m.addSpace({ levelId: level.id, name, kind, footprintFt: toFp(r), heightFt: 9 });
  sp(`${c.elevators.passenger} Elevators`, "elevator", c.elevators.rect);
  if (c.elevators.fireSvc) sp(`${c.elevators.fireSvc} Fire-svc`, "elevator", null); // counted; shares bank
  sp("Lift Lobby", "lobby", c.lobbyRect);
  sp("Men", "restroom", c.restrooms.rects[0]);
  sp("Women", "restroom", c.restrooms.rects[1]);
  sp("Shafts / IDF", "shaft", c.shafts.rect);

  // egress stairs
  for (const r of c.stairs.rects) m.addStair({ levelId: level.id, footprintFt: toFp(r), heightFt: f2f });

  // structural grid
  for (const col of shell.grid.columns) m.addColumn({ levelId: level.id, xFt: col.xFt, yFt: col.yFt, sizeFt: col.sizeFt });

  // curtain-wall facade (mullion lines + spandrel) for rendering
  m.facade = { W: shell.W, H: shell.H, moduleFt: shell.facade.moduleFt, spandrelFt: shell.facade.spandrelFt,
    mullionsX: shell.facade.mullionsX, mullionsY: shell.facade.mullionsY };

  return m;
}
