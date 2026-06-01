// test/core-harness.mjs — gauntlet for the core-assembly grammar (Layer 1).
// Verifies the placement grammar NEVER breaks across thousands of random buildings:
// every elevator bank is fronted by a lobby, no bank lands on glass, components fit,
// stairs meet remoteness (or are correctly flagged), no component overlaps.
import { assembleCore } from "../client/src/bim/coreAssembly.js";
import { sizeElevators } from "../client/src/bim/elevatoring.js";
import { PROGRAM_PROFILES as PP, getProfile } from "../client/src/bim/programProfiles.js";

const N = parseInt(process.argv[2] || "12000", 10);
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const types = Object.keys(PP), cores = ["central", "side", "end", "double"], poss = ["center", "north", "south", "east", "west"];
const ceil = Math.ceil, max = Math.max;
const fixtures = (n, first, fr, tr) => (n <= first ? max(1, ceil(n / fr)) : ceil(first / fr) + ceil((n - first) / tr));

let failures = 0; const fmsgs = []; const vio = {};
const dist = { corePct: [], flagged: 0, byType: {} };

for (let i = 0; i < N; i++) {
  const program = pick(types), profile = getProfile(program);
  const areaFt2 = rnd(6000, 45000), aspect = rnd(1.0, 2.4);
  const stories = Math.floor(rnd(2, 70));
  const coreType = pick(cores), corePosition = pick(poss);
  const W = Math.round(Math.sqrt(areaFt2 * aspect)), H = Math.round(areaFt2 / W);
  const diagonal = Math.hypot(W, H), riseFt = stories * profile.floorToFloorFt, highRise = riseFt > 75;

  const occ = Math.round(areaFt2 / profile.occLoadFactor), perSex = occ / 2;
  const wc = fixtures(perSex, 50, 25, 50) * 2;
  const restroomAreaFt2 = wc * 45;
  const shaftAreaFt2 = areaFt2 * (profile.shaftPctBase + profile.shaftPctPerStory * stories);
  const elev = sizeElevators({ floorsAboveLobby: stories - 1, floorPopulation: (areaFt2 * 0.8) / profile.elevPopDensity, profile, riseFt });
  const lobbyAreaFt2 = max(elev.passengerCars * elev.paxShaftFt * 10 * 0.5, 120);

  let a;
  try {
    a = assembleCore({ W, H, coreType, corePosition, elevAreaFt2: elev.elevAreaFt2, paxShaftFt: elev.paxShaftFt,
      stairCount: 2, restroomAreaFt2, shaftAreaFt2, lobbyAreaFt2, sprinklered: true, highRise, diagonal });
  } catch (e) { failures++; if (fmsgs.length < 12) fmsgs.push(`THREW ${coreType}/${program}: ${e.message}`); continue; }

  const fail = (m) => { failures++; if (fmsgs.length < 14) fmsgs.push(`${m} [${coreType}/${corePosition} ${program} ${W}x${H} ${stories}st]`); };

  // 1. grammar must hold
  if (!a.valid) { for (const v of a.violations) vio[v] = (vio[v] || 0) + 1; fail("GRAMMAR: " + a.violations.join("; ")); }
  // 2. egress met or flagged
  if (!a.egress.ok) fail(`egress short ${a.egress.actualFt}<${a.egress.requiredFt} not resolved`);
  // 3. non-stair components must not overlap each other
  const cs = a.components;
  for (let x = 0; x < cs.length; x++) for (let y = x + 1; y < cs.length; y++) {
    const A = cs[x].rect, B = cs[y].rect;
    if (A.x < B.x + B.w - 1 && A.x + A.w > B.x + 1 && A.y < B.y + B.h - 1 && A.y + A.h > B.y + 1) { fail(`overlap ${cs[x].name}/${cs[y].name}`); break; }
  }
  // 4. finite area
  if (!Number.isFinite(a.areaPct) || a.areaPct <= 0) fail("bad core %");

  dist.corePct.push(a.areaPct); if (a.flags.length) dist.flagged++;
  dist.byType[coreType] = dist.byType[coreType] || []; dist.byType[coreType].push(a.areaPct);
}

const avg = (x) => x.reduce((s, y) => s + y, 0) / max(x.length, 1);
console.log(`\nCORE-ASSEMBLY GAUNTLET — ${N} random buildings`);
console.log(`hard failures: ${failures} (${(100 * failures / N).toFixed(2)}%)`);
if (fmsgs.length) console.log("samples:\n  " + fmsgs.join("\n  "));
if (Object.keys(vio).length) console.log("violation types:", JSON.stringify(vio, null, 0));
console.log(`\navg core %: ${avg(dist.corePct).toFixed(1)}  ·  stairs-pulled-out flagged: ${(100 * dist.flagged / N).toFixed(0)}%`);
for (const t of cores) console.log(`  ${t.padEnd(9)} avg core ${avg(dist.byType[t] || []).toFixed(1)}%  (n=${(dist.byType[t] || []).length})`);
console.log(failures === 0 ? "\n>>> CORE-ASSEMBLY GAUNTLET PASSED — grammar holds, 0 failures" : "\n!!! FAILURES PRESENT");
