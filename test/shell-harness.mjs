// test/shell-harness.mjs — gauntlet for the INTEGRATED shell (program + elevatoring + core grammar).
import { generateShell } from "../client/src/bim/shellgen.js";
import { PROGRAM_PROFILES as PP } from "../client/src/bim/programProfiles.js";

const N = parseInt(process.argv[2] || "12000", 10);
const rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
const programs = Object.keys(PP), cores = ["central", "side", "end", "double"], poss = ["center", "north", "south", "east", "west"];
const within = (r, W, H) => r.x >= -0.6 && r.y >= -0.6 && r.x + r.w <= W + 0.6 && r.y + r.h <= H + 0.6;

let failures = 0, grammarBad = 0; const fmsgs = [];
const dist = { core: [], eff: [], sky: 0, flagged: 0, byProgram: {}, byCore: {} };

for (let i = 0; i < N; i++) {
  const program = pick(programs), coreType = pick(cores), corePosition = pick(poss);
  const areaFt2 = rnd(6000, 50000), aspect = rnd(1.0, 2.4), stories = Math.floor(rnd(2, 80));
  let s;
  try { s = generateShell({ areaFt2, aspect, coreType, corePosition, stories, program }); }
  catch (e) { failures++; if (fmsgs.length < 12) fmsgs.push(`THREW ${program}/${coreType} ${stories}st: ${e.message}`); continue; }
  const fail = (m) => { failures++; if (fmsgs.length < 12) fmsgs.push(`${m} [${program}/${coreType}/${corePosition} ${s.W}x${s.H} ${stories}st]`); };

  // 1. core grammar must be valid (overlaps / bank-fronting); oversize is a flagged condition, not a bug
  if (!s.core.grammarOk) { grammarBad++; fail("grammar invalid: " + s.core.violations.join("; ")); }
  // 2. if the core fits, nothing off-plate; if not, it must be flagged
  if (s.core.fits) { for (const c of [...s.core.components, ...s.core.stairCells]) if (!within(c.rect, s.W, s.H)) { fail(`${c.name} off-plate but fits`); break; } }
  else if (!s.flags.some((f) => f.includes("exceeds"))) fail("oversize not flagged");
  // 3. egress met or flagged
  if (!s.egress.ok && !s.flags.some((f) => f.includes("remoteness"))) fail("egress short not flagged");
  // 4. elevators sane
  if (!(s.elevators.passengerCars >= 1) || !Number.isFinite(s.elevators.elevAreaFt2)) fail("bad elevators");
  // 5. finite metrics
  if (![s.efficiency, s.core.areaPct, s.occupantLoad].every(Number.isFinite)) fail("non-finite metric");
  // 6. sky-lobby logic consistent with elevatoring
  if ((stories - 1 > 60) !== s.elevators.skyLobby) fail(`skyLobby ${s.elevators.skyLobby} for ${stories}st`);

  dist.core.push(s.core.areaPct); dist.eff.push(s.efficiency);
  if (s.elevators.skyLobby) dist.sky++; if (s.flags.length) dist.flagged++;
  (dist.byProgram[program] = dist.byProgram[program] || []).push(s.core.areaPct);
  (dist.byCore[coreType] = dist.byCore[coreType] || []).push(s.efficiency);
}

const avg = (x) => x.reduce((s, y) => s + y, 0) / Math.max(x.length, 1);
console.log(`\nINTEGRATED SHELL GAUNTLET — ${N} random buildings`);
console.log(`hard failures: ${failures} (${(100 * failures / N).toFixed(2)}%)  ·  grammar-invalid: ${grammarBad}`);
if (fmsgs.length) console.log("samples:\n  " + fmsgs.join("\n  "));
console.log(`\navg core ${avg(dist.core).toFixed(1)}%  ·  avg efficiency ${avg(dist.eff).toFixed(1)}%  ·  sky ${(100*dist.sky/N).toFixed(0)}%  ·  advisory flags ${(100*dist.flagged/N).toFixed(0)}%`);
for (const p of programs) console.log(`  ${p.padEnd(12)} avg core ${avg(dist.byProgram[p] || []).toFixed(1)}%`);
for (const c of cores) console.log(`  ${c.padEnd(9)} avg eff ${avg(dist.byCore[c] || []).toFixed(1)}%`);
console.log(failures === 0 ? "\n>>> INTEGRATED SHELL GAUNTLET PASSED — 0 failures" : "\n!!! FAILURES PRESENT");
