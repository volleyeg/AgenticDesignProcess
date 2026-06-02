// client/src/bim/shellgen.js
// Rule-based building-shell generator — now the integration point for all three layers:
//   Layer 3 (program profile) sets module/bay/floor-to-floor/loading/MEP,
//   Layer 2 (elevatoring)     sizes cars/zones by real traffic analysis,
//   Layer 1 (core assembly)   places the decomposed core with its placement grammar.
// The jurisdiction rule pack still owns the CODE rules (egress, fixtures, high-rise).
// Everything in feet.
import { NORTH_AMERICA, v } from "./rulepacks/northAmerica.js";
import { getProfile } from "./programProfiles.js";
import { sizeElevators } from "./elevatoring.js";
import { buildCoreObjects, CORE_TOGGLES } from "./coreObjects.js";
import { packCore } from "./corePacker.js";

const round = Math.round, max = Math.max, ceil = Math.ceil, sqrt = Math.sqrt;
const fixtures = (n, first, fr, tr) => (n <= first ? max(1, ceil(n / fr)) : ceil(first / fr) + ceil((n - first) / tr));

export function generateShell({
  areaFt2 = 20000, aspect = 1.5, coreType = "central", corePosition = "center",
  stories = 10, program = "office", sprinklered = true, pack = NORTH_AMERICA, floorToFloorFt, toggles = CORE_TOGGLES,
} = {}) {
  const profile = getProfile(program);
  const f2f = floorToFloorFt || profile.floorToFloorFt;
  const flags = [];

  // ---- envelope ----
  let W = round(sqrt(areaFt2 * aspect));
  let H = round(areaFt2 / max(W, 1));
  const area = W * H, diagonal = sqrt(W * W + H * H);
  const heightFt = stories * f2f;
  const highRise = heightFt > v(pack, "core.highRiseFt");

  // ---- occupancy (program-specific) ----
  const occLoad = round(area / profile.occLoadFactor);

  // ---- structural grid (program bay) ----
  const bay = profile.bayFt, colSize = v(pack, "structure.columnSize");
  const xs = []; for (let x = 0; x <= W + 0.01; x += bay) xs.push(round(x * 100) / 100); if (xs[xs.length - 1] < W) xs.push(W);
  const ys = []; for (let y = 0; y <= H + 0.01; y += bay) ys.push(round(y * 100) / 100); if (ys[ys.length - 1] < H) ys.push(H);
  const columns = []; for (const x of xs) for (const y of ys) columns.push({ xFt: x, yFt: y, sizeFt: colSize });

  // ---- facade (program module) ----
  const mod = profile.moduleFt;
  const mullionsX = []; for (let x = 0; x <= W + 0.01; x += mod) mullionsX.push(round(x * 10) / 10);
  const mullionsY = []; for (let y = 0; y <= H + 0.01; y += mod) mullionsY.push(round(y * 10) / 10);
  const facade = { moduleFt: mod, spandrelFt: v(pack, "facade.spandrelFt"), mullionsX, mullionsY };

  // ---- LAYER 2: elevatoring by traffic analysis ----
  const floorPopulation = (area * 0.8) / profile.elevPopDensity;
  const elevators = sizeElevators({ floorsAboveLobby: stories - 1, floorPopulation, profile, riseFt: heightFt });
  flags.push(...elevators.flags);

  // ---- egress count (code rule) ----
  let stairCount = v(pack, "stair.base");
  if (occLoad > v(pack, "stair.occFor4")) stairCount = 4; else if (occLoad > v(pack, "stair.occFor3")) stairCount = 3;
  const sw = v(pack, "stair.widthFt"), sd = v(pack, "stair.depthFt");
  // egress capacity (IBC 1005.3.1): required width = occupants x per-occupant factor
  // (0.2 in sprinklered, 0.3 in not). A stair carries ~ its clear width / factor occupants.
  const egressPerOcc = sprinklered ? 0.2 : 0.3;
  const stairClearIn = Math.max(44, sw * 12 - 26);          // clear run width inside the shaft
  const capacityPerStair = Math.floor(stairClearIn / egressPerOcc);
  while (stairCount * capacityPerStair < occLoad && stairCount < 8) stairCount++;
  const egressCapacity = { perStair: capacityPerStair, stairs: stairCount, requiredOcc: occLoad, ok: stairCount * capacityPerStair >= occLoad };
  if (stairCount > (occLoad > 1000 ? 4 : occLoad > 500 ? 3 : 2)) flags.push(`extra stair added for egress capacity (load ${occLoad} needs ${Math.ceil(occLoad / capacityPerStair)} stairs of ${sw} ft)`);

  // ---- restrooms (code fixture rules) ----
  const perSex = occLoad / 2;
  const wcPerSex = fixtures(perSex, v(pack, "wc.firstBreak"), v(pack, "wc.firstRatio"), v(pack, "wc.thenRatio"));
  const lavPerSex = fixtures(perSex, v(pack, "lav.firstBreak"), v(pack, "lav.firstRatio"), v(pack, "lav.thenRatio"));
  const restroomAreaFt2 = wcPerSex * 2 * v(pack, "wc.areaEach");

  // ---- shafts (program MEP, grows with height) ----
  const shaftAreaFt2 = area * (profile.shaftPctBase + profile.shaftPctPerStory * stories);

  // ---- LAYER 1: pack the core from real toggleable objects (minimum-area, walled, grammar-checked) ----
  const { cells, tracked } = buildCoreObjects({ elevators, wcPerSex, lavPerSex, stairCount, shaftAreaFt2, highRise, floorOccupants: occLoad, toggles });
  const core = packCore({ W, H, coreType, corePosition, cells, sprinklered, highRise, diagonal });
  flags.push(...core.flags);
  if (!core.grammarOk) flags.push(...core.violations.map((x) => "grammar: " + x));

  // ---- efficiency ----
  const efficiency = (area - core.areaFt2) / area;
  const effLo = v(pack, "efficiency.targetLo");
  if (efficiency < effLo) flags.push(`efficiency ${(efficiency * 100).toFixed(0)}% below ${effLo * 100}% (core heavy for this floor)`);

  return {
    feasible: core.valid,
    inputs: { areaFt2: area, aspect, coreType, corePosition, stories, floorToFloorFt: f2f, sprinklered, program },
    program: profile.id, programLabel: profile.label,
    W, H, areaFt2: area, stories, diagonal: round(diagonal), heightFt, highRise, occupantLoad: occLoad,
    grid: { bayFt: bay, xs, ys, columns },
    facade,
    elevators,
    restrooms: { wcPerSex, lavPerSex },
    core, trackedNotDrawn: tracked,
    egress: { stairsRequired: stairCount, capacity: egressCapacity, separationRequiredFt: core.egress.requiredFt, separationActualFt: core.egress.actualFt, ok: core.egress.ok },
    efficiency: round(efficiency * 1000) / 10,
    flags,
  };
}
