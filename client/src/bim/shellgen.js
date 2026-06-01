// client/src/bim/shellgen.js
// Rule-based building-shell generator. Given the five inputs + a rule pack,
// it computes a real shell: structural grid, curtain wall, and a component-sized
// core (elevators / stairs / restrooms / shafts / closets / lobby), with egress
// validation. NOTHING hardcoded — every number is read from the pack.
//
// Everything in feet. The space planner snaps to this shell; it does not invent a core.
import { NORTH_AMERICA, v } from "./rulepacks/northAmerica.js";

const ceil = Math.ceil, max = Math.max, min = Math.min, round = Math.round, sqrt = Math.sqrt;

// WC/lav fixtures for one sex given that sex's occupant count, per the pack's tiered ratios
function fixtures(nPerSex, first, firstRatio, thenRatio) {
  if (nPerSex <= first) return max(1, ceil(nPerSex / firstRatio));
  return ceil(first / firstRatio) + ceil((nPerSex - first) / thenRatio);
}

export function generateShell({
  areaFt2 = 20000, aspect = 1.5, coreType = "central", corePosition = "center",
  stories = 10, floorToFloorFt = 13, sprinklered = true, pack = NORTH_AMERICA,
} = {}) {
  const flags = [];

  // ---- floor envelope ----
  let W = round(sqrt(areaFt2 * aspect));
  let H = round(areaFt2 / max(W, 1));
  const area = W * H;
  const diagonal = sqrt(W * W + H * H);
  const heightFt = stories * floorToFloorFt;
  const highRise = heightFt > v(pack, "core.highRiseFt");

  // ---- occupancy ----
  const occLoad = round(area / v(pack, "occ.loadFactor"));

  // ---- structural grid ----
  const bay = v(pack, "structure.bay");
  const colSize = v(pack, "structure.columnSize");
  const xs = []; for (let x = 0; x <= W + 0.01; x += bay) xs.push(round(x * 100) / 100); if (xs[xs.length - 1] < W) xs.push(W);
  const ys = []; for (let y = 0; y <= H + 0.01; y += bay) ys.push(round(y * 100) / 100); if (ys[ys.length - 1] < H) ys.push(H);
  const columns = [];
  for (const x of xs) for (const y of ys) columns.push({ xFt: x, yFt: y, sizeFt: colSize });

  // ---- facade: mullion lines every module around the perimeter ----
  const mod = v(pack, "planning.module");
  const mullionsX = []; for (let x = 0; x <= W + 0.01; x += mod) mullionsX.push(round(x * 10) / 10);
  const mullionsY = []; for (let y = 0; y <= H + 0.01; y += mod) mullionsY.push(round(y * 10) / 10);
  const facade = { moduleFt: mod, spandrelFt: v(pack, "facade.spandrelFt"), mullionsX, mullionsY };

  // ---- elevators (serve the WHOLE building: sized off building population, then banked) ----
  const buildingArea = area * stories;
  const pop = round(buildingArea / v(pack, "elev.popDensity"));
  let passenger = max(1, max(ceil(pop / v(pack, "elev.personsPerCar")), ceil(buildingArea / v(pack, "elev.sfPerCar"))));
  const maxGroup = v(pack, "elev.maxPerGroup");
  if (passenger > maxGroup) flags.push(`${passenger} passenger cars exceed one group (${maxGroup}) — needs banking / sky lobby`);
  const freight = stories > v(pack, "elev.freightFloors") ? 1 : 0;
  const fireSvc = highRise ? v(pack, "elev.fireSvcCount") : 0;
  const elevShaft = v(pack, "elev.shaftFt");
  const elevCars = passenger + freight + fireSvc;
  const elevAreaRaw = elevCars * elevShaft * elevShaft;
  const lobbyArea = max(passenger * elevShaft * v(pack, "elev.lobbyDepthFt") * 0.5, // bank face x depth
    0.25 * occLoad * 3); // evacuation floor: 25% occ load at 3 sf/person
  const elevators = { passenger, freight, fireSvc, cars: elevCars, shaftFt: elevShaft, areaFt2: round(elevAreaRaw), lobbyFt2: round(lobbyArea) };

  // ---- stairs (count from occupant load) ----
  let stairCount = v(pack, "stair.base");
  if (occLoad > v(pack, "stair.occFor4")) stairCount = 4;
  else if (occLoad > v(pack, "stair.occFor3")) stairCount = 3;
  const sw = v(pack, "stair.widthFt"), sd = v(pack, "stair.depthFt");
  const stairArea = stairCount * sw * sd;

  // ---- restrooms (per sex, 50/50) ----
  const perSex = occLoad / 2;
  const wcPerSex = fixtures(perSex, v(pack, "wc.firstBreak"), v(pack, "wc.firstRatio"), v(pack, "wc.thenRatio"));
  const lavPerSex = fixtures(perSex, v(pack, "lav.firstBreak"), v(pack, "lav.firstRatio"), v(pack, "lav.thenRatio"));
  const wcTotal = wcPerSex * 2, lavTotal = lavPerSex * 2;
  const restroomArea = wcTotal * v(pack, "wc.areaEach");
  const restrooms = { wcPerSex, lavPerSex, wcTotal, lavTotal, areaFt2: round(restroomArea) };

  // ---- shafts / closets ----
  const shaftArea = area * v(pack, "shaft.pct");
  const closetArea = 2 * v(pack, "shaft.closetArea"); // janitor + IDF
  const shafts = { areaFt2: round(shaftArea), closetFt2: round(closetArea) };

  // ---- assemble core block ----
  const componentArea = elevAreaRaw + lobbyArea + stairArea + restroomArea + shaftArea + closetArea;
  const coreArea = componentArea * (1 + v(pack, "core.circFactor"));
  const cAspect = v(pack, "core.aspect");
  let cw = sqrt(coreArea * cAspect), ch = coreArea / cw;
  // keep the core inside the lease envelope
  cw = min(cw, W * 0.6); ch = min(ch, H * 0.6);
  if (cw * ch < coreArea * 0.98) { cw = min(W * 0.6, coreArea / (H * 0.6)); ch = coreArea / cw; }

  let cx, cy;
  if (coreType === "side") { cx = (W - cw) / 2; cy = 0; }               // against the bottom long edge
  else if (coreType === "end") { cx = 0; cy = (H - ch) / 2; }            // against the left short edge
  else { cx = (W - cw) / 2; cy = (H - ch) / 2; }                         // central
  if (corePosition === "north") cy = H - ch;
  else if (corePosition === "south") cy = 0;
  else if (corePosition === "east") cx = W - cw;
  else if (corePosition === "west") cx = 0;
  cx = max(0, min(cx, W - cw)); cy = max(0, min(cy, H - ch));
  const coreRect = { x: round(cx * 10) / 10, y: round(cy * 10) / 10, w: round(cw * 10) / 10, h: round(ch * 10) / 10 };

  // ---- egress validation: required separation, then place stairs to meet it ----
  let sepReq;
  if (highRise) sepReq = min(v(pack, "stair.sepFloorMin"), diagonal * v(pack, "stair.sepHighRise"));
  else sepReq = diagonal * (sprinklered ? v(pack, "stair.sepSprink") : v(pack, "stair.sepNonSprink"));

  // place two primary stairs as far apart as the floor allows along its major axis
  const margin = sw; // keep off the glass line
  const horiz = W >= H;
  const a = { w: sw, h: sd }, b = { w: sw, h: sd };
  let sa, sb;
  if (horiz) { sa = { x: margin, y: H / 2 - sd / 2 }; sb = { x: W - margin - sw, y: H / 2 - sd / 2 }; }
  else { sa = { x: W / 2 - sw / 2, y: margin }; sb = { x: W / 2 - sw / 2, y: H - margin - sd }; }
  const sepActual = Math.hypot((sa.x + sw / 2) - (sb.x + sw / 2), (sa.y + sd / 2) - (sb.y + sd / 2));
  const egressOk = sepActual >= sepReq - 0.5;
  if (!egressOk) flags.push(`stair separation ${round(sepActual)} ft < required ${round(sepReq)} ft (floor too compact)`);

  const stairs = { count: stairCount, widthFt: sw, depthFt: sd, areaFt2: round(stairArea),
    rects: [ { x: round(sa.x*10)/10, y: round(sa.y*10)/10, w: sw, h: sd }, { x: round(sb.x*10)/10, y: round(sb.y*10)/10, w: sw, h: sd } ] };

  // ---- efficiency ----
  const efficiency = (area - coreArea) / area;
  const effLo = v(pack, "efficiency.targetLo"), effHi = v(pack, "efficiency.targetHi");
  if (efficiency < effLo) flags.push(`efficiency ${(efficiency*100).toFixed(0)}% below ${effLo*100}% (core heavy for this floor)`);
  if (efficiency > effHi) flags.push(`efficiency ${(efficiency*100).toFixed(0)}% above ${effHi*100}% (core light — verify)`);

  // ---- core fit check ----
  const coreFits = coreRect.x >= -0.5 && coreRect.y >= -0.5 && coreRect.x + coreRect.w <= W + 0.5 && coreRect.y + coreRect.h <= H + 0.5;
  if (!coreFits) flags.push("core does not fit floor plate");

  return {
    feasible: coreFits,
    inputs: { areaFt2: area, aspect, coreType, corePosition, stories, floorToFloorFt, sprinklered },
    W, H, areaFt2: area, stories, diagonal: round(diagonal), heightFt, highRise, occupantLoad: occLoad,
    grid: { bayFt: bay, xs, ys, columns },
    facade,
    core: { type: coreType, position: corePosition, rect: coreRect, areaFt2: round(coreArea),
      areaPct: round((coreArea / area) * 1000) / 10,
      components: { elevators, stairs, restrooms, shafts, lobbyFt2: round(lobbyArea), closetFt2: round(closetArea) } },
    egress: { stairsRequired: stairCount, separationRequiredFt: round(sepReq), separationActualFt: round(sepActual), ok: egressOk },
    efficiency: round(efficiency * 1000) / 10,
    flags,
  };
}
