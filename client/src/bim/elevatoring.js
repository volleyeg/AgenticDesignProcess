// client/src/bim/elevatoring.js
// Vertical-transportation sub-engine. Real Up-Peak Round Trip Time (UPRTT) method:
// from building population + floors-above-lobby, compute probable stops (S),
// highest reversal floor (H), round-trip time (RTT), then handling capacity (HC)
// and interval — and size car count / speed / zoning to hit the profile's targets.
//
// This replaces "1 car per 45,000 sf". Sources: Barney/CIBSE RTT method (ElevatorWorld,
// Peters Research); Al-Sharif zone/stack limits (~20 floors single-deck, ~60 direct);
// ATIS targets (office 11-15% HC / 20-30s interval; residential 5-7% / 40-60s).

const LOAD_FACTOR = 0.8;     // up-peak car fills to ~80%
const TS = 8;                // stop time per stop (door open/dwell/close + accel/decel loss), s
const TP = 1.0;              // passenger transfer time each way, s
const LB_PER_PERSON = 150;   // car capacity persons = lb / 150
const MAX_PER_GROUP = 8;     // cars per group
const SINGLE_DECK_FLOOR_LIMIT = 20;
const DIRECT_FROM_GROUND_LIMIT = 60; // above this -> sky lobby / stacks
const SMALL_BUILDING_FLOORS = 6;     // below this, traffic analysis over-provisions; use simple rule

// rated speed (fpm) by rise in feet
function speedForRise(riseFt) {
  if (riseFt <= 75) return 200;
  if (riseFt <= 150) return 350;
  if (riseFt <= 300) return 500;
  if (riseFt <= 500) return 700;
  if (riseFt <= 800) return 1000;
  return 1600;
}

// expected number of stops for a full car of P passengers over N served floors
function expectedStops(N, P) { return N * (1 - Math.pow(1 - 1 / N, P)); }
// highest reversal floor
function highestReversal(N, P) {
  let sum = 0;
  for (let i = 1; i <= N - 1; i++) sum += Math.pow(i / N, P);
  return N - sum;
}

// round trip time (s) for one car serving a zone of `floors` with `df` floor-to-floor, speed v (fpm)
function roundTripTime(floors, df, vFpm, P) {
  const v = vFpm / 60;                    // ft/s
  const N = Math.max(floors, 1);
  const S = expectedStops(N, P);
  const H = highestReversal(N, P);
  const tv = df / v;                      // interfloor transit at rated speed
  return 2 * H * tv + (S + 1) * TS + 2 * P * TP;
}

// size a single group for one zone; returns the smallest car count meeting targets
function sizeGroup({ floors, population, df, vFpm, carLb, hcTarget, intervalTarget }) {
  const carPersons = Math.max(1, Math.floor((carLb / LB_PER_PERSON) * LOAD_FACTOR));
  const RTT = roundTripTime(floors, df, vFpm, carPersons);
  let chosen = null;
  for (let L = 1; L <= MAX_PER_GROUP; L++) {
    const interval = RTT / L;
    const hc = population > 0 ? (300 * carPersons * L / RTT) / population : 1;
    if (hc >= hcTarget && interval <= intervalTarget) { chosen = { L, RTT, interval, hc, carPersons }; break; }
  }
  if (!chosen) { // best effort at the group cap
    const L = MAX_PER_GROUP, interval = RTT / L, hc = population > 0 ? (300 * carPersons * L / RTT) / population : 1;
    chosen = { L, RTT, interval, hc, carPersons, short: true };
  }
  return chosen;
}

export function sizeElevators({ floorsAboveLobby, floorPopulation, profile, riseFt }) {
  const flags = [];
  const df = profile.floorToFloorFt;
  const vFpm = speedForRise(riseFt);
  const carLb = profile.carCapacityLb;
  const hcTarget = profile.elevHCtarget;
  const intervalTarget = profile.elevIntervalTargetS;

  const skyLobby = floorsAboveLobby > DIRECT_FROM_GROUND_LIMIT;
  if (skyLobby) flags.push(`${floorsAboveLobby} floors > ${DIRECT_FROM_GROUND_LIMIT} — sky lobby / express shuttle stack required`);

  const carPersons = Math.max(1, Math.floor((carLb / LB_PER_PERSON) * LOAD_FACTOR));
  let zones;

  if (floorsAboveLobby <= SMALL_BUILDING_FLOORS) {
    // small/low building: up-peak method over-provisions, so size simply by population for HC only
    const pop = floorsAboveLobby * floorPopulation;
    const RTT = roundTripTime(floorsAboveLobby, df, vFpm, carPersons);
    let L = 1;
    while (L < 4 && (300 * carPersons * L / RTT) / Math.max(pop, 1) < hcTarget) L++;
    zones = [{ index: 1, floors: floorsAboveLobby, population: Math.round(pop), cars: L,
      carPersons, carCapacityLb: carLb, speedFpm: vFpm, rttS: Math.round(RTT),
      intervalS: Math.round((RTT / L) * 10) / 10, hcPct: Math.round((300 * carPersons * L / RTT) / Math.max(pop, 1) * 1000) / 10, ok: true }];
  } else {
    // try increasing zone counts; for each, size every zone to meet targets within the car cap.
    // choose the plan with the fewest TOTAL cars (ties: fewer zones).
    const maxZones = Math.max(1, Math.min(Math.ceil(floorsAboveLobby / 4), 12));
    let best = null;
    for (let Z = 1; Z <= maxZones; Z++) {
      const per = Math.ceil(floorsAboveLobby / Z);
      const cand = []; let ok = true, total = 0;
      for (let z = 0; z < Z; z++) {
        const fl = Math.min(per, floorsAboveLobby - z * per);
        if (fl <= 0) continue;
        const pop = fl * floorPopulation;
        const g = sizeGroup({ floors: fl, population: pop, df, vFpm, carLb, hcTarget, intervalTarget });
        if (g.short) ok = false;
        total += g.L;
        cand.push({ index: z + 1, floors: fl, population: Math.round(pop), cars: g.L,
          carPersons: g.carPersons, carCapacityLb: carLb, speedFpm: vFpm, rttS: Math.round(g.RTT),
          intervalS: Math.round(g.interval * 10) / 10, hcPct: Math.round(g.hc * 1000) / 10, ok: !g.short });
      }
      if (ok && (!best || total < best.total)) best = { zones: cand, total };
      if (ok && Z >= 2 && best && best.total <= total) break; // diminishing returns
    }
    if (!best) { // nothing met targets within cap; take the most-zoned best-effort
      const per = Math.ceil(floorsAboveLobby / maxZones); const cand = [];
      for (let z = 0; z < maxZones; z++) {
        const fl = Math.min(per, floorsAboveLobby - z * per); if (fl <= 0) continue;
        const pop = fl * floorPopulation; const g = sizeGroup({ floors: fl, population: pop, df, vFpm, carLb, hcTarget, intervalTarget });
        cand.push({ index: z + 1, floors: fl, population: Math.round(pop), cars: g.L, carPersons: g.carPersons,
          carCapacityLb: carLb, speedFpm: vFpm, rttS: Math.round(g.RTT), intervalS: Math.round(g.interval * 10) / 10,
          hcPct: Math.round(g.hc * 1000) / 10, ok: false });
      }
      best = { zones: cand };
      flags.push("can't meet target within car cap — double-deck / DCS / more shafts needed");
    }
    zones = best.zones;
  }

  // service + life-safety cars
  const freight = floorsAboveLobby > profile.freightOverStories ? Math.max(1, Math.round(floorsAboveLobby / 40)) : (profile.freightOverStories <= 1 ? 1 : 0);
  const fireService = riseFt > 120 ? 2 : 0;
  const occupantEvac = riseFt > 420;
  if (occupantEvac) flags.push("very tall — occupant evacuation elevators likely required");

  const localCars = zones.reduce((s, z) => s + z.cars, 0);
  const shuttleCars = skyLobby ? Math.max(2, Math.ceil(localCars / 6)) : 0;
  const passengerCars = localCars + shuttleCars;
  const totalCars = passengerCars + freight + fireService;

  // shaft footprint: cars sit in the core; service/fire cars are larger
  const paxShaftFt = carLb >= 4500 ? 9 : 8;             // bed/gurney cars wider
  const svcShaftFt = 10;
  const elevAreaFt2 = passengerCars * paxShaftFt * paxShaftFt + (freight + fireService) * svcShaftFt * svcShaftFt;

  return {
    method: "UPRTT", speedFpm: vFpm, skyLobby, numZones: zones.length,
    zones, shuttleCars, freight, fireService, occupantEvac,
    passengerCars, totalCars, paxShaftFt, svcShaftFt, elevAreaFt2: Math.round(elevAreaFt2),
    flags,
  };
}
