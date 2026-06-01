// test/core-pack-harness.mjs — gauntlet for the minimum-area real-object core packer.
import { packCore } from "../client/src/bim/corePacker.js";
import { buildCoreObjects, CORE_TOGGLES } from "../client/src/bim/coreObjects.js";
import { sizeElevators } from "../client/src/bim/elevatoring.js";
import { PROGRAM_PROFILES as PP, getProfile } from "../client/src/bim/programProfiles.js";

const N = parseInt(process.argv[2] || "12000", 10);
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const programs = Object.keys(PP), cores = ["central", "side", "end", "double"], poss = ["center", "north", "south", "east", "west"];
const ceil = Math.ceil, max = Math.max;
const fixtures = (n, f, fr, tr) => (n <= f ? max(1, ceil(n / fr)) : ceil(f / fr) + ceil((n - f) / tr));

let failures = 0, grammarBad = 0; const fmsgs = [], vio = {};
const dist = { pct: [], byCore: {}, byProgram: {}, flagged: 0 };

for (let i = 0; i < N; i++) {
  const program = pick(programs), profile = getProfile(program);
  const areaFt2 = rnd(6000, 50000), aspect = rnd(1.0, 2.4), stories = Math.floor(rnd(2, 80));
  const coreType = pick(cores), corePosition = pick(poss);
  const W = Math.round(Math.sqrt(areaFt2 * aspect)), H = Math.round(areaFt2 / W);
  const diagonal = Math.hypot(W, H), riseFt = stories * profile.floorToFloorFt, highRise = riseFt > 75;
  const occ = Math.round(areaFt2 / profile.occLoadFactor), perSex = occ / 2;
  const wcPerSex = fixtures(perSex, 50, 25, 50), lavPerSex = fixtures(perSex, 80, 40, 80);
  let stairCount = 2; if (occ > 1000) stairCount = 4; else if (occ > 500) stairCount = 3;
  const shaftAreaFt2 = areaFt2 * (profile.shaftPctBase + profile.shaftPctPerStory * stories);
  const elevators = sizeElevators({ floorsAboveLobby: stories - 1, floorPopulation: (areaFt2 * 0.8) / profile.elevPopDensity, profile, riseFt });

  // random toggle subset (some off) to prove toggles never break packing
  const toggles = { ...CORE_TOGGLES };
  for (const k of ["lactation", "elevatorControl", "dataRiser", "fireRiser"]) if (Math.random() < 0.3) toggles[k] = false;

  let out;
  try {
    const { cells } = buildCoreObjects({ elevators, wcPerSex, lavPerSex, stairCount, shaftAreaFt2, highRise, toggles });
    out = packCore({ W, H, coreType, corePosition, cells, sprinklered: true, highRise, diagonal });
  } catch (e) { failures++; if (fmsgs.length < 12) fmsgs.push(`THREW ${coreType}/${program}: ${e.message}`); continue; }

  const fail = (m) => { failures++; if (fmsgs.length < 14) fmsgs.push(`${m} [${coreType}/${corePosition} ${program} ${W}x${H} ${stories}st]`); };
  const within = (r) => r.x >= -0.6 && r.y >= -0.6 && r.x + r.w <= W + 0.6 && r.y + r.h <= H + 0.6;
  // grammar bugs are always failures
  if (!out.grammarOk) { grammarBad++; for (const v of out.violations) vio[v.replace(/[0-9].*/, "").trim()] = (vio[v.replace(/[0-9].*/, "").trim()] || 0) + 1; fail("GRAMMAR: " + out.violations.slice(0, 2).join("; ")); }
  // if the core FITS, nothing may be off-plate; if it doesn't fit, it must be flagged (not silent)
  if (out.fits) { for (const c of [...out.components, ...out.stairCells]) if (!within(c.rect)) { fail(`${c.name} off-plate but fits=true`); break; } }
  else if (!out.flags.some((f) => f.includes("exceeds"))) fail("oversize not flagged");
  if (!out.egress.ok && !out.flags.some((f) => f.includes("remoteness"))) fail("egress short not flagged");
  if (!Number.isFinite(out.areaPct) || out.areaPct <= 0) fail("bad core %");

  dist.pct.push(out.areaPct); if (out.flags.length) dist.flagged++;
  (dist.byCore[coreType] = dist.byCore[coreType] || []).push(out.areaPct);
  (dist.byProgram[program] = dist.byProgram[program] || []).push(out.areaPct);
}

const avg = (x) => x.reduce((s, y) => s + y, 0) / max(x.length, 1);
console.log(`\nCORE-PACKER GAUNTLET — ${N} random buildings (real objects, minimal L)`);
console.log(`hard failures: ${failures} (${(100 * failures / N).toFixed(2)}%)  ·  grammar-invalid: ${grammarBad}`);
if (fmsgs.length) console.log("samples:\n  " + fmsgs.join("\n  "));
if (Object.keys(vio).length) console.log("violation types:", JSON.stringify(vio));
console.log(`\navg core ${avg(dist.pct).toFixed(1)}%  ·  flagged ${(100 * dist.flagged / N).toFixed(0)}%`);
for (const c of cores) console.log(`  ${c.padEnd(9)} avg ${avg(dist.byCore[c] || []).toFixed(1)}%`);
for (const p of programs) console.log(`  ${p.padEnd(12)} avg ${avg(dist.byProgram[p] || []).toFixed(1)}%`);
console.log(failures === 0 ? "\n>>> CORE-PACKER GAUNTLET PASSED — minimal cores, grammar holds, 0 failures" : "\n!!! FAILURES PRESENT");
