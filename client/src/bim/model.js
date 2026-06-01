// client/src/bim/model.js
// BIM-native foundation. One model = source of truth. 2D, 3D, and IFC all read this.
// Units: imperial (feet). 1 planning module = 5 ft.

export const MODULE_FT = 5;

let _seq = 0;
const nextId = () => ++_seq;

export function polygonAreaFt2(pts) {
  // shoelace; pts = [[x,y],...] in feet
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function rectFt(xFt, yFt, wFt, hFt) {
  return [[xFt, yFt], [xFt + wFt, yFt], [xFt + wFt, yFt + hFt], [xFt, yFt + hFt]];
}

export class BimModel {
  constructor(meta = {}) {
    this.meta = {
      name: meta.name || "Untitled Fit-Plan",
      projectType: meta.projectType || "project",
      units: "feet",
    };
    this.project = { id: nextId(), type: "Project", name: this.meta.name };
    this.building = { id: nextId(), type: "Building", name: "Building" };
    this.levels = [];
    this.spaces = [];
    this.walls = [];
    this.cores = [];
    this.columns = [];
    this.doors = [];
    this.corridors = [];
    this.stairs = [];
    this.adjacencies = []; // {aId, bId, weight}
  }

  addLevel({ name = "Level 1", elevationFt = 0, floorToFloorFt = 13 } = {}) {
    const lvl = { id: nextId(), type: "Level", name, elevationFt, floorToFloorFt };
    this.levels.push(lvl);
    return lvl;
  }

  addSpace({ levelId, name, kind = "support", footprintFt, heightFt = 9, daylight = false, seats = 0 }) {
    const areaFt2 = polygonAreaFt2(footprintFt);
    const sp = {
      id: nextId(), type: "Space", levelId, name, kind,
      footprintFt, heightFt, daylight, seats,
      areaFt2: Math.round(areaFt2),
    };
    this.spaces.push(sp);
    return sp;
  }

  addCore({ levelId, footprintFt, heightFt = 13, components = ["elevators", "stairs", "restrooms", "shafts"] }) {
    const core = { id: nextId(), type: "Core", levelId, footprintFt, heightFt, components, areaFt2: Math.round(polygonAreaFt2(footprintFt)) };
    this.cores.push(core);
    return core;
  }

  addCorridor({ levelId, footprintFt, heightFt = 9, loading = null }) {
    const c = { id: nextId(), type: "Corridor", levelId, footprintFt, heightFt, loading, areaFt2: Math.round(polygonAreaFt2(footprintFt)) };
    this.corridors.push(c);
    return c;
  }

  addStair({ levelId, footprintFt, heightFt = 13 }) {
    const s = { id: nextId(), type: "Stair", levelId, footprintFt, heightFt, areaFt2: Math.round(polygonAreaFt2(footprintFt)) };
    this.stairs.push(s);
    return s;
  }

  addColumn({ levelId, xFt, yFt, sizeFt = 1.5 }) {
    const col = { id: nextId(), type: "Column", levelId, xFt, yFt, sizeFt };
    this.columns.push(col);
    return col;
  }

  addWall({ levelId, fromFt, toFt, thicknessFt = 0.5, heightFt = 9, fireRating = null, demising = false }) {
    const w = { id: nextId(), type: "Wall", levelId, fromFt, toFt, thicknessFt, heightFt, fireRating, demising };
    this.walls.push(w);
    return w;
  }

  addDoor({ wallId, atFt, widthFt = 3, connects = [] }) {
    const d = { id: nextId(), type: "Door", wallId, atFt, widthFt, connects };
    this.doors.push(d);
    return d;
  }

  addAdjacency(aId, bId, weight = 1) {
    this.adjacencies.push({ aId, bId, weight });
  }

  bounds() {
    // overall floor extent in feet
    const pts = [...this.spaces, ...this.cores, ...this.corridors].flatMap((e) => e.footprintFt);
    if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, wFt: 0, hFt: 0 };
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, wFt: maxX - minX, hFt: maxY - minY };
  }

  totals() {
    const areaFt2 = this.spaces.reduce((s, x) => s + x.areaFt2, 0);
    const seats = this.spaces.reduce((s, x) => s + (x.seats || 0), 0);
    const corridorFt2 = this.corridors.reduce((s, x) => s + x.areaFt2, 0);
    return {
      levels: this.levels.length,
      spaces: this.spaces.length,
      cores: this.cores.length,
      corridors: this.corridors.length,
      stairs: this.stairs.length,
      areaFt2,
      corridorFt2,
      seats,
    };
  }
}
