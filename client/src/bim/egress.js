// egress.js — IBC 2021 Chapter 10 life-safety checks for a single office (Group B) story.
// Every limit here is sourced; these DRIVE core/stair/lobby placement, they are not decoration.
//   1007.1.1  exit remoteness: two exits >= 1/2 the floor diagonal apart; 1/3 if sprinklered (exc.2).
//             High-rise (403.5.1): the lesser of 30 ft OR 1/4 the diagonal — why central cores are legal.
//   1017.2    exit-access travel distance: Group B = 200 ft, 300 ft sprinklered (Table 1017.2).
//   1006.2.1  common path of egress travel: Group B = 75 ft, 100 ft sprinklered.
//   1020.4    dead-end corridor: 20 ft, 50 ft for Group B sprinklered (also OK if <= 2.5x its width).

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// straight-line corner->stair, inflated by a path factor (occupants walk around the core, not through it)
const PATH_FACTOR = 1.3;

export function egressCheck({ W, H, diagonal, occLoad, stairDoors = [], sprinklered = true, highRise = false }) {
  const diag = diagonal || Math.hypot(W, H);

  // --- 1007.1.1 remoteness (separation between the two most-separated stairs) ---
  const sepRequiredFt = highRise ? Math.min(30, diag * 0.25) : diag * (sprinklered ? 1 / 3 : 1 / 2);
  let sepActualFt = 0;
  for (let i = 0; i < stairDoors.length; i++) for (let j = i + 1; j < stairDoors.length; j++) sepActualFt = Math.max(sepActualFt, dist(stairDoors[i], stairDoors[j]));
  const remotenessOk = stairDoors.length < 2 || sepActualFt >= sepRequiredFt - 0.5;

  // --- 1017.2 travel distance: worst floor point (a corner) to the nearest stair ---
  const travelMaxFt = sprinklered ? 300 : 200;
  const corners = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: 0, y: H }, { x: W, y: H }];
  let travelWorstFt = 0;
  for (const c of corners) { let nearest = Infinity; for (const s of stairDoors) nearest = Math.min(nearest, dist(c, s)); if (nearest < Infinity) travelWorstFt = Math.max(travelWorstFt, nearest * PATH_FACTOR); }
  travelWorstFt = Math.round(travelWorstFt);
  const travelOk = stairDoors.length === 0 || travelWorstFt <= travelMaxFt;

  // --- limits the floor circulation (the ring) must respect; reported so the corridor layer can honor them ---
  const commonPathMaxFt = sprinklered ? 100 : 75;
  const deadEndMaxFt = sprinklered ? 50 : 20;

  return {
    sprinklered, highRise, diagonalFt: Math.round(diag),
    sepRequiredFt: Math.round(sepRequiredFt), sepActualFt: Math.round(sepActualFt), remotenessOk,
    travelMaxFt, travelWorstFt, travelOk,
    commonPathMaxFt, deadEndMaxFt,
  };
}

// flags for the shell (only real problems, in plain language)
export function egressFlags(e) {
  const f = [];
  if (!e.remotenessOk) f.push(`egress remoteness short: stairs ${e.sepActualFt} ft apart, need ${e.sepRequiredFt} ft (IBC 1007.1.1) — spread the stairs or interconnect with a 1-hr corridor`);
  if (!e.travelOk) f.push(`travel distance ${e.travelWorstFt} ft exceeds ${e.travelMaxFt} ft to nearest exit (IBC 1017.2) — core/stairs too far from the corners`);
  return f;
}
