// client/src/bim/coreObjects.js
// The real, toggleable core object library. Each object has a REAL dimension and a
// wall/fire property; the packer assembles only the ones switched ON into the smallest
// walled core. "Smallest possible core" = sum of real objects + their walls, never padded.
// All feet. DIMS and TOGGLES are editable (advanced drawer); seeded with NA defaults.

export const CORE_DIMS = {
  liftPax: { w: 7, d: 7 },        // passenger car clear+structure
  liftService: { w: 8, d: 10 },   // freight / fire-service car
  lobbyDepthFt: 10,               // min elevator lobby depth in front of a bank
  stair: { w: 10, d: 24 },        // egress stair run (incl landings)
  vestibule: { w: 8, d: 6 },      // smokeproof vestibule at stair (high-rise)
  pressShaft: { w: 3, d: 4 },     // stair pressurization shaft (high-rise)
  control: { w: 4, d: 6 },        // MRL elevator control closet
  janitor: { w: 5, d: 7 },        // janitor + service sink
  lactation: { w: 7, d: 8 },      // lockable, not a bathroom
  smokeLobby: { w: 10, d: 8 },    // fire-rated elevator lobby (high-rise)
  refuge: { w: 6, d: 5 },         // area of refuge at stair (high-rise)
  // washroom fixtures
  wcStall: { w: 3, d: 5 }, accStall: { w: 5, d: 5 }, urinal: { w: 1.5, d: 2 }, lav: { w: 2.5, d: 2 }, aisleFt: 5,
  wallFt: 0.67,                   // interior fire-rated core wall (~8 in)
  structWallFt: 1.0,              // structural core wall (thicker on tall buildings)
};

// default ON; some only apply to high-rise (the engine still respects the toggle)
export const CORE_TOGGLES = {
  liftBank: true, lobby: true, elevatorControl: true,
  stairs: true, stairVestibule: true, stairPressShaft: true, refuge: true, smokeLobby: true,
  washrooms: true, janitor: true, lactation: true,
  mechSupply: true, mechExhaust: true, electricalRiser: true, dataRiser: true, plumbingRiser: true, fireRiser: true,
  drinkingFountain: true, // tracked, NOT drawn as a core object
};

// MEP shaft shares of the program shaft budget (redistributed if a toggle is off)
const MEP_SHARES = { mechSupply: 0.30, mechExhaust: 0.30, electricalRiser: 0.12, dataRiser: 0.08, plumbingRiser: 0.08, fireRiser: 0.07, pressuriz: 0.05 };

function washroomDims(wcPerSex, lavPerSex, men, D = CORE_DIMS) {
  const stalls = Math.max(1, wcPerSex);
  const wcRun = (stalls - 1) * D.wcStall.w + D.accStall.w + (men ? Math.round(wcPerSex / 2) * D.urinal.w : 0);
  const lavRun = lavPerSex * D.lav.w + 3;
  const w = Math.max(wcRun, lavRun) + 2 * D.wallFt;
  const d = D.accStall.d + D.aisleFt + D.lav.d + 2 * D.wallFt; // stall + aisle + lav + walls
  return { w: Math.round(w * 10) / 10, d: Math.round(d * 10) / 10 };
}

// build the list of cells to pack from the building's requirements + toggles
export function buildCoreObjects({ elevators, wcPerSex, lavPerSex, stairCount, shaftAreaFt2, highRise,
  floorOccupants = 0, dims = CORE_DIMS, toggles = CORE_TOGGLES }) {
  const D = dims, T = toggles, cells = [], tracked = [];

  // ---- vertical transportation ----
  const pax = elevators.passengerCars, svc = elevators.freight, fs = elevators.fireService || 0;
  if (T.liftBank) {
    const bankW = pax * D.liftPax.w + svc * D.liftService.w;
    const bankD = Math.max(D.liftPax.d, svc ? D.liftService.d : 0);
    cells.push({ key: "liftBank", type: "elevator", name: `${pax} lifts${svc ? ` +${svc} frt` : ""}`, wFt: bankW, dFt: bankD, group: "vt", face: "front", rows: 1, cars: pax, svc, fs });
    // ONE enclosed elevator lobby (in a sprinklered building it is itself the smoke-protected lobby).
    // Size it by the occupant-evacuation rule: >= 25% of the floor occupant load at 3 sf/person
    // (IBC 3008.6.2), with the fire-service-access floor of 150 sf / no dimension < 8 ft (IBC 3007.6.4).
    if (T.lobby) {
      const oeeArea = 0.25 * floorOccupants * 3;
      const minArea = highRise ? Math.max(150, oeeArea) : Math.max(oeeArea, bankW * D.lobbyDepthFt);
      let lobW = bankW;
      let lobD = Math.max(D.lobbyDepthFt, highRise ? 8 : 0, minArea / lobW);
      cells.push({ key: "lobby", type: "lobby", name: highRise ? "Elevator lobby (FSAE)" : "Elevator lobby", wFt: lobW, dFt: Math.round(lobD * 10) / 10, group: "vt", face: "active", rated: highRise });
    }
    if (T.elevatorControl) cells.push({ key: "control", type: "shaft", name: "Lift control", wFt: D.control.w, dFt: D.control.d, group: "vt", face: "blind" });
  }

  // ---- egress ----
  if (T.stairs) for (let i = 0; i < stairCount; i++) {
    cells.push({ key: "stair" + i, type: "stair", name: "Egress stair", wFt: D.stair.w, dFt: D.stair.d, group: "egress", face: "remote" });
    if (highRise && T.stairVestibule) cells.push({ key: "vest" + i, type: "lobby", name: "Vestibule", wFt: D.vestibule.w, dFt: D.vestibule.d, group: "egress", face: "remote" });
    if (highRise && T.stairPressShaft) cells.push({ key: "press" + i, type: "shaft", name: "Press. shaft", wFt: D.pressShaft.w, dFt: D.pressShaft.d, group: "egress", face: "blind" });
    if (highRise && T.refuge) cells.push({ key: "refuge" + i, type: "refuge", name: "Refuge", wFt: D.refuge.w, dFt: D.refuge.d, group: "egress", face: "remote" });
  }

  // ---- sanitary ----
  if (T.washrooms) {
    const m = washroomDims(wcPerSex, lavPerSex, true, D), w = washroomDims(wcPerSex, lavPerSex, false, D);
    cells.push({ key: "wcM", type: "restroom", name: "Men", wFt: m.w, dFt: m.d, group: "sanitary", face: "blind" });
    cells.push({ key: "wcW", type: "restroom", name: "Women", wFt: w.w, dFt: w.d, group: "sanitary", face: "blind" });
  }
  if (T.janitor) cells.push({ key: "janitor", type: "shaft", name: "Janitor / sink", wFt: D.janitor.w, dFt: D.janitor.d, group: "support", face: "blind" });
  if (T.lactation) cells.push({ key: "lactation", type: "lactation", name: "Lactation", wFt: D.lactation.w, dFt: D.lactation.d, group: "support", face: "blind" });
  if (T.drinkingFountain) tracked.push("drinking fountain (corridor niche)");

  // ---- MEP shafts (split the program shaft budget across enabled risers) ----
  const shaftKeys = ["mechSupply", "mechExhaust", "electricalRiser", "dataRiser", "plumbingRiser", "fireRiser"];
  const names = { mechSupply: "Supply air", mechExhaust: "Exhaust air", electricalRiser: "Elec riser", dataRiser: "Data riser", plumbingRiser: "Plumb riser", fireRiser: "Fire riser", pressuriz: "Press riser" };
  const active = shaftKeys.filter((k) => T[k]);
  const shareSum = active.reduce((s, k) => s + MEP_SHARES[k], 0) || 1;
  for (const k of active) {
    const a = shaftAreaFt2 * (MEP_SHARES[k] / shareSum);
    const w = Math.min(Math.max(Math.sqrt(a), 2), 18), d = Math.max(a / w, 2);
    cells.push({ key: k, type: "shaft", name: names[k], wFt: Math.round(w * 10) / 10, dFt: Math.round(d * 10) / 10, group: "mep", face: "blind" });
  }

  return { cells, tracked };
}
