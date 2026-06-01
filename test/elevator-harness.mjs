// test/elevator-harness.mjs — gauntlet for the UPRTT elevatoring sub-engine.
import { sizeElevators } from "../client/src/bim/elevatoring.js";
import { PROGRAM_PROFILES as PP } from "../client/src/bim/programProfiles.js";

const N = parseInt(process.argv[2] || "10000", 10);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const types = Object.keys(PP);

let failures = 0; const fmsgs = [];
const dist = { cars: [], zones: {}, sky: 0, flagged: 0, hc: [], interval: [], byType: {} };

for (let i = 0; i < N; i++) {
  const stories = Math.floor(rnd(2, 100));
  const floorArea = rnd(5000, 50000);
  const type = pick(types);
  const profile = PP[type];
  const floorsAboveLobby = stories - 1;
  const floorPopulation = (floorArea * 0.8) / profile.elevPopDensity;
  const riseFt = stories * profile.floorToFloorFt;

  let r;
  try { r = sizeElevators({ floorsAboveLobby, floorPopulation, profile, riseFt }); }
  catch (e) { failures++; if (fmsgs.length < 12) fmsgs.push(`THREW ${type} ${stories}st: ${e.message}`); continue; }

  const fail = (m) => { failures++; if (fmsgs.length < 12) fmsgs.push(`${m} [${type} ${stories}st ${Math.round(floorArea)}sf]`); };

  // 1. zones cover exactly the floors above lobby
  const covered = r.zones.reduce((s, z) => s + z.floors, 0);
  if (covered !== floorsAboveLobby) fail(`zones cover ${covered} != ${floorsAboveLobby}`);
  // 2. no group exceeds the car cap
  for (const z of r.zones) if (z.cars > 8) fail(`zone ${z.index} has ${z.cars} cars > 8`);
  // 3. sky lobby logic
  if ((floorsAboveLobby > 60) !== r.skyLobby) fail(`skyLobby ${r.skyLobby} for ${floorsAboveLobby} floors`);
  // 4. fire-service logic
  if ((riseFt > 120 ? 2 : 0) !== r.fireService) fail(`fireService ${r.fireService} @ ${Math.round(riseFt)}ft`);
  // 5. finite + at least one car
  if (![r.totalCars, r.passengerCars, r.elevAreaFt2].every(Number.isFinite) || r.totalCars < 1) fail("bad car totals");
  // 6. each zone interval/hc finite
  for (const z of r.zones) if (![z.hcPct, z.intervalS, z.rttS].every(Number.isFinite)) fail(`zone ${z.index} non-finite`);

  dist.cars.push(r.passengerCars);
  dist.zones[r.numZones] = (dist.zones[r.numZones] || 0) + 1;
  if (r.skyLobby) dist.sky++;
  if (r.flags.length) dist.flagged++;
  for (const z of r.zones) { dist.hc.push(z.hcPct); dist.interval.push(z.intervalS); }
  dist.byType[type] = dist.byType[type] || { cars: [], zones: [] };
  dist.byType[type].cars.push(r.passengerCars); dist.byType[type].zones.push(r.numZones);
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
console.log(`\nELEVATORING GAUNTLET — ${N} random buildings`);
console.log(`hard failures: ${failures} (${(100*failures/N).toFixed(2)}%)`);
if (fmsgs.length) console.log("samples:\n  " + fmsgs.join("\n  "));
console.log(`\navg passenger cars ${avg(dist.cars).toFixed(1)}  ·  zones ${JSON.stringify(dist.zones)}`);
console.log(`sky lobby ${(100*dist.sky/N).toFixed(0)}%  ·  zones-meeting-target flagged ${(100*dist.flagged/N).toFixed(0)}%`);
console.log(`avg achieved HC ${avg(dist.hc).toFixed(1)}%  ·  avg interval ${avg(dist.interval).toFixed(1)}s`);
for (const t of Object.keys(dist.byType)) console.log(`  ${t.padEnd(12)} avg cars ${avg(dist.byType[t].cars).toFixed(1)}  avg zones ${avg(dist.byType[t].zones).toFixed(1)}`);
console.log(failures === 0 ? "\n>>> ELEVATORING GAUNTLET PASSED — 0 hard failures" : "\n!!! FAILURES PRESENT");
