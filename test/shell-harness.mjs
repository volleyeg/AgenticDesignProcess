// test/shell-harness.mjs
// Random-building gauntlet for the shell engine. Throws thousands of random
// area/shape/coreType/corePosition/height combos at generateShell and verifies
// every rule holds: counts match the pack formulas, core fits, stairs meet (or
// are correctly flagged for) remoteness, efficiency sane. Reports distribution.
import { generateShell } from "../client/src/bim/shellgen.js";
import { NORTH_AMERICA as P, v } from "../client/src/bim/rulepacks/northAmerica.js";

const N = parseInt(process.argv[2] || "12000", 10);
const ceil = Math.ceil, max = Math.max;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function expectedFixtures(nPerSex, first, fr, tr) {
  if (nPerSex <= first) return max(1, ceil(nPerSex / fr));
  return ceil(first / fr) + ceil((nPerSex - first) / tr);
}

let failures = 0; const fmsgs = [];
const dist = { core: [], eff: [], elev: {}, stair: {}, highRise: 0, flagged: 0, types: {} };

for (let i = 0; i < N; i++) {
  const areaFt2 = rnd(4000, 60000);
  const aspect = rnd(1.0, 2.6);
  const coreType = pick(["central", "side", "end"]);
  const corePosition = pick(["center", "north", "south", "east", "west"]);
  const stories = Math.floor(rnd(1, 40));
  const sprinklered = Math.random() > 0.1;

  let s;
  try { s = generateShell({ areaFt2, aspect, coreType, corePosition, stories, sprinklered }); }
  catch (e) { failures++; if (fmsgs.length < 12) fmsgs.push(`THREW @${Math.round(areaFt2)}sf ${coreType}: ${e.message}`); continue; }

  const fail = (m) => { failures++; if (fmsgs.length < 12) fmsgs.push(`${m} @${Math.round(s.areaFt2)}sf asp${aspect.toFixed(1)} ${coreType}/${corePosition} ${stories}st`); };

  // 1. core must fit the plate
  const c = s.core.rect;
  if (!(c.x >= -0.6 && c.y >= -0.6 && c.x + c.w <= s.W + 0.6 && c.y + c.h <= s.H + 0.6)) fail("core does not fit");

  // 2. stair count matches the rule
  let expStairs = v(P, "stair.base");
  if (s.occupantLoad > v(P, "stair.occFor4")) expStairs = 4; else if (s.occupantLoad > v(P, "stair.occFor3")) expStairs = 3;
  if (s.egress.stairsRequired !== expStairs) fail(`stair count ${s.egress.stairsRequired} != ${expStairs}`);

  // 3. elevator passenger count matches max(buildingPop/225, buildingArea/45000)
  const buildingArea = s.areaFt2 * stories;
  const pop = Math.round(buildingArea / v(P, "elev.popDensity"));
  const expPax = max(1, max(ceil(pop / v(P, "elev.personsPerCar")), ceil(buildingArea / v(P, "elev.sfPerCar"))));
  if (s.core.components.elevators.passenger !== expPax) fail(`elev pax ${s.core.components.elevators.passenger} != ${expPax}`);

  // 4. freight + fire-service rules
  const expFreight = stories > v(P, "elev.freightFloors") ? 1 : 0;
  if (s.core.components.elevators.freight !== expFreight) fail(`freight ${s.core.components.elevators.freight} != ${expFreight}`);
  const expFire = s.highRise ? v(P, "elev.fireSvcCount") : 0;
  if (s.core.components.elevators.fireSvc !== expFire) fail(`firesvc ${s.core.components.elevators.fireSvc} != ${expFire}`);

  // 5. restroom fixtures match the tiered formula
  const perSex = s.occupantLoad / 2;
  const expWc = expectedFixtures(perSex, v(P, "wc.firstBreak"), v(P, "wc.firstRatio"), v(P, "wc.thenRatio"));
  const expLav = expectedFixtures(perSex, v(P, "lav.firstBreak"), v(P, "lav.firstRatio"), v(P, "lav.thenRatio"));
  if (s.core.components.restrooms.wcPerSex !== expWc) fail(`WC/sex ${s.core.components.restrooms.wcPerSex} != ${expWc}`);
  if (s.core.components.restrooms.lavPerSex !== expLav) fail(`Lav/sex ${s.core.components.restrooms.lavPerSex} != ${expLav}`);

  // 6. stairs within bounds + separation either met or flagged (not silently wrong)
  for (const r of s.core.components.stairs.rects)
    if (!(r.x >= -0.6 && r.y >= -0.6 && r.x + r.w <= s.W + 0.6 && r.y + r.h <= s.H + 0.6)) fail("stair off-plate");
  if (!s.egress.ok && !s.flags.some((f) => f.includes("separation"))) fail("egress not ok but not flagged");

  // 7. numbers must be finite
  if (![s.W, s.H, s.efficiency, s.core.areaPct, s.occupantLoad].every(Number.isFinite)) fail("non-finite output");

  // 8. efficiency out of band must be flagged (honest), not silent
  if ((s.efficiency < v(P,"efficiency.targetLo")*100 || s.efficiency > v(P,"efficiency.targetHi")*100) && !s.flags.some(f=>f.includes("efficiency"))) fail("eff out of band, not flagged");

  // distribution
  dist.core.push(s.core.areaPct); dist.eff.push(s.efficiency);
  dist.elev[s.core.components.elevators.passenger] = (dist.elev[s.core.components.elevators.passenger] || 0) + 1;
  dist.stair[s.egress.stairsRequired] = (dist.stair[s.egress.stairsRequired] || 0) + 1;
  dist.types[coreType] = (dist.types[coreType] || 0) + 1;
  if (s.highRise) dist.highRise++;
  if (s.flags.length) dist.flagged++;
}

const avg = (a) => a.reduce((x, y) => x + y, 0) / max(a.length, 1);
console.log(`\nSHELL GAUNTLET — ${N} random buildings`);
console.log(`hard failures: ${failures}  (${(100*failures/N).toFixed(2)}%)`);
if (fmsgs.length) console.log("samples:\n  " + fmsgs.join("\n  "));
console.log(`\navg core %: ${avg(dist.core).toFixed(1)}   avg efficiency: ${avg(dist.eff).toFixed(1)}%`);
console.log(`high-rise: ${(100*dist.highRise/N).toFixed(0)}%   buildings with >=1 advisory flag: ${(100*dist.flagged/N).toFixed(0)}%`);
console.log("passenger elevators:", JSON.stringify(dist.elev));
console.log("stairs:", JSON.stringify(dist.stair));
console.log(failures === 0 ? "\n>>> SHELL GAUNTLET PASSED — 0 hard failures" : "\n!!! FAILURES PRESENT");
