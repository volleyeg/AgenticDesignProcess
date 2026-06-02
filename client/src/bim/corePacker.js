// client/src/bim/corePacker.js
// Minimum-area packer: assembles the enabled real-dimensioned objects into the smallest
// walled core that passes the placement grammar. Core area = sum of object footprints +
// walls (never the bounding box). Works directly in FLOOR coords via a blind->active
// marching placer (no fragile local-transform), so each core type orients correctly.
import { CORE_DIMS } from "./coreObjects.js";

const r1 = (n) => Math.round(n * 10) / 10;
const A = (c) => c.wFt * c.dFt;
const rectsOverlap = (a, b) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;

export function packCore({ W, H, coreType = "central", corePosition = "center", cells,
  sprinklered = true, highRise = false, diagonal, dims = CORE_DIMS }) {
  const violations = [], flags = [];
  const sepReq = highRise ? Math.min(30, diagonal * 0.25) : diagonal * (sprinklered ? 1 / 3 : 1 / 2);

  // ---- one single-faced cluster: place objects in floor coords (blind->active), return cells + bounds ----
  function placeCluster(clusterCells, type, position) {
    const stairs = clusterCells.filter((c) => c.type === "stair");
    const bank = clusterCells.find((c) => c.key === "liftBank");
    const lobby = clusterCells.find((c) => c.key === "lobby");
    const smoke = clusterCells.find((c) => c.key === "smokeLobby");
    const washrooms = clusterCells.filter((c) => c.type === "restroom");
    const back = clusterCells.filter((c) => c.group === "mep" || c.group === "support" ||
      c.key === "control" || (c.group === "egress" && c.type !== "stair"));

    const bankW = bank ? bank.wFt : 8;
    const washW = washrooms.reduce((s, c) => s + c.wFt, 0);
    const vtSanW = bankW + washW;

    // shelf-pack the blind back services into rows no wider than the VT+sanitary band
    const targetW = Math.max(vtSanW, ...back.map((c) => c.wFt), 1);
    const backRows = []; let cur = [], curW = 0;
    for (const c of back) { if (cur.length && curW + c.wFt > targetW) { backRows.push(cur); cur = []; curW = 0; } cur.push(c); curW += c.wFt; }
    if (cur.length) backRows.push(cur);
    const backDepth = backRows.reduce((s, r) => s + Math.max(...r.map((c) => c.dFt)), 0);

    const bankBandD = Math.max(bank ? bank.dFt : 0, ...washrooms.map((c) => c.dFt), 1);
    const lobbyD = (lobby ? lobby.dFt : 0) + (smoke ? smoke.dFt : 0);
    const blockW = Math.max(vtSanW, ...backRows.map((r) => r.reduce((s, c) => s + c.wFt, 0)), 1);
    const blockD = backDepth + bankBandD + lobbyD;
    const stairW = stairs.length ? stairs[0].wFt : 0, stairD = stairs.length ? stairs[0].dFt : 0;

    // orientation: depth marches blind(0) -> active(blockD); widthAxis carries blockW
    let depthAxis, depthSign, frontDir, availDepth, availWidth;
    if (type === "side") { const south = position !== "north"; depthAxis = "y"; depthSign = south ? +1 : -1; frontDir = south ? "N" : "S"; availDepth = H; availWidth = W; }
    else if (type === "end") { const west = position !== "east"; depthAxis = "x"; depthSign = west ? +1 : -1; frontDir = west ? "E" : "W"; availDepth = W; availWidth = H; }
    else { depthAxis = "y"; depthSign = +1; frontDir = "island"; availDepth = H; availWidth = W; }

    const totalW = blockW + 2 * stairW;
    const wStart = Math.max(0, (availWidth - totalW) / 2) + stairW;
    const dStart = depthSign > 0 ? (type === "central" ? (availDepth - blockD) / 2 : 0) : (type === "central" ? (availDepth + blockD) / 2 : availDepth);

    const placeAt = (d0, rd, w0, ww) => {
      if (depthAxis === "y") { const y = depthSign > 0 ? dStart + d0 : dStart - d0 - rd; return { x: r1(w0), y: r1(y), w: r1(ww), h: r1(rd) }; }
      const x = depthSign > 0 ? dStart + d0 : dStart - d0 - rd; return { x: r1(x), y: r1(w0), w: r1(rd), h: r1(ww) };
    };

    const placed = [];
    // blind back services (risers etc.) along the back
    let d0 = 0;
    for (const r of backRows) { let w0 = wStart; const rd = Math.max(...r.map((c) => c.dFt)); for (const c of r) { placed.push({ ...c, rect: placeAt(d0, c.dFt, w0, c.wFt) }); w0 += c.wFt; } d0 += rd; }
    // bank + washrooms in a band, FRONT-aligned (their lobby-side edges flush) so the spine fronts both
    const bandStart = d0;
    const bandDepth = Math.max(bank ? bank.dFt : 0, ...washrooms.map((c) => c.dFt), 1);
    const frontEdge = bandStart + bandDepth;
    if (bank) placed.push({ ...bank, rect: placeAt(frontEdge - bank.dFt, bank.dFt, wStart, bankW) });
    let ww0 = wStart + bankW;
    for (const c of washrooms) { placed.push({ ...c, rect: placeAt(frontEdge - c.dFt, c.dFt, ww0, c.wFt) }); ww0 += c.wFt; }
    // lobby spine: a corridor spanning the FULL band width, fronting bank AND washrooms; smoke lobby in front of it
    const fullW = bankW + washW;
    let ly = frontEdge;
    if (lobby) { placed.push({ ...lobby, rect: placeAt(ly, lobby.dFt, wStart, fullW) }); ly += lobby.dFt; }
    if (smoke) { placed.push({ ...smoke, rect: placeAt(ly, smoke.dFt, wStart, fullW) }); ly += smoke.dFt; }
    const lobbyTop = frontEdge, lobbyBot = ly; // depth span of the lobby spine

    // stairs flank the two ends of the lobby spine (touching it = reachable), real 10x24, centered on the spine
    const stairsP = [];
    const sY = Math.max(0, (lobbyTop + lobbyBot) / 2 - stairD / 2);
    if (stairs[0]) stairsP.push({ ...stairs[0], rect: placeAt(sY, stairD, wStart - stairW, stairW) });
    if (stairs[1]) stairsP.push({ ...stairs[1], rect: placeAt(sY, stairD, wStart + fullW, stairW) });
    for (let i = 2; i < stairs.length; i++) { const k = Math.floor((i - 2) / 2) + 1, left = i % 2 === 0; stairsP.push({ ...stairs[i], rect: placeAt(sY, stairD, left ? wStart - (k + 1) * stairW : wStart + fullW + k * stairW, stairW) }); }

    return { placed, stairsP, frontDir, blockW: Math.max(blockW, fullW), blockD };
  }

  let placed = [], stairsP = [], frontDir, footArea = 0, fits = true, collide = false;
  if (coreType === "double") {
    const stairsAll = cells.filter((c) => c.type === "stair");
    const mk = (side) => {
      const out = [];
      const bank = cells.find((c) => c.key === "liftBank");
      if (bank) out.push({ ...bank, wFt: r1(bank.wFt / 2), cars: Math.ceil(bank.cars / 2), name: `${Math.ceil(bank.cars / 2)} lifts` });
      const lobby = cells.find((c) => c.key === "lobby"); if (lobby) out.push({ ...lobby, wFt: r1(lobby.wFt / 2) });
      out.push(...cells.filter((c) => c.key === (side === "W" ? "wcM" : "wcW")));
      out.push(...cells.filter((c) => c.group === "mep").filter((_, i) => i % 2 === (side === "W" ? 0 : 1)));
      out.push(...cells.filter((c) => (side === "W" ? c.key === "janitor" : c.key === "lactation")));
      const st = stairsAll[side === "W" ? 0 : 1] || stairsAll[0]; if (st) out.push({ ...st });
      return out;
    };
    const pw = placeCluster(mk("W"), "end", "west"), pe = placeCluster(mk("E"), "end", "east");
    placed = [...pw.placed, ...pe.placed]; stairsP = [...pw.stairsP, ...pe.stairsP];
    frontDir = "split";
    // the two half-cores collide when the plate is too narrow to hold both — that's a fit issue
    for (const a of [...pw.placed, ...pw.stairsP]) for (const b of [...pe.placed, ...pe.stairsP]) if (rectsOverlap(a.rect, b.rect)) { collide = true; break; }
  } else {
    const p = placeCluster(cells, coreType, corePosition);
    placed = p.placed; stairsP = p.stairsP; frontDir = p.frontDir;
  }
  footArea = cells.reduce((s, c) => s + A(c), 0) + cells.reduce((s, c) => s + 2 * dims.wallFt * (c.wFt + c.dFt), 0);
  // authoritative fit: every placed object actually lands on the plate, and (double) the halves don't collide
  const onPlate = (r) => r.x >= -0.6 && r.y >= -0.6 && r.x + r.w <= W + 0.6 && r.y + r.h <= H + 0.6;
  fits = [...placed, ...stairsP].every((c) => onPlate(c.rect)) && !collide;
  if (!fits) flags.push("core exceeds floor plate — densify program, enlarge floor, or split core");

  // ---- egress remoteness: keep the in-core stair, pull the OTHER to the farthest point clear of the core ----
  const sep = (a, b) => Math.hypot((a.x + a.w / 2) - (b.x + b.w / 2), (a.y + a.h / 2) - (b.y + b.h / 2));
  let egress = { requiredFt: Math.round(sepReq), actualFt: 0, ok: true };
  if (stairsP.length >= 2) {
    let actual = sep(stairsP[0].rect, stairsP[1].rect);
    if (actual < sepReq - 0.5 && fits) {
      // core bounds from the non-stair cells, to avoid landing a stair on the core
      const cx = placed.flatMap((c) => [c.rect.x, c.rect.x + c.rect.w]), cy = placed.flatMap((c) => [c.rect.y, c.rect.y + c.rect.h]);
      const cb = { x: Math.min(...cx), y: Math.min(...cy), x2: Math.max(...cx), y2: Math.max(...cy) };
      const sw2 = dims.stair.w, sd2 = dims.stair.d, m = 1;
      const cands = [
        { x: m, y: m }, { x: W - m - sw2, y: m }, { x: m, y: H - m - sd2 }, { x: W - m - sw2, y: H - m - sd2 },
        { x: (W - sw2) / 2, y: m }, { x: (W - sw2) / 2, y: H - m - sd2 }, { x: m, y: (H - sd2) / 2 }, { x: W - m - sw2, y: (H - sd2) / 2 },
      ];
      const a0 = stairsP[0].rect;
      let best = null;
      for (const p of cands) {
        const r = { x: p.x, y: p.y, w: sw2, h: sd2 };
        const hitsCore = r.x < cb.x2 - 1 && r.x + r.w > cb.x + 1 && r.y < cb.y2 - 1 && r.y + r.h > cb.y + 1;
        if (hitsCore) continue;
        const d = sep(a0, r);
        if (!best || d > best.d) best = { r, d };
      }
      if (best && best.d > actual) { stairsP[1].rect = best.r; actual = best.d; flags.push(`stair pulled clear of core for remoteness (${Math.round(actual)} ≥ ${Math.round(sepReq)} ft)`); }
    }
    egress = { requiredFt: Math.round(sepReq), actualFt: Math.round(actual), ok: actual >= sepReq - 0.5 };
    if (!egress.ok) flags.push(`egress remoteness short (${Math.round(actual)} < ${Math.round(sepReq)} ft) — relocate or add a stair`);
  }

  // ---- grammar validation (only true bugs; oversize is a flag, not a grammar violation) ----
  const banks = placed.filter((c) => c.type === "elevator"), lobbies = placed.filter((c) => c.type === "lobby");
  const adj = (a, b) => {
    const sx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), sy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (sx > 2 && (Math.abs(a.y + a.h - b.y) < 1.5 || Math.abs(b.y + b.h - a.y) < 1.5)) ||
           (sy > 2 && (Math.abs(a.x + a.w - b.x) < 1.5 || Math.abs(b.x + b.w - a.x) < 1.5));
  };
  if (!banks.length) violations.push("no elevator bank");
  if (!lobbies.length) violations.push("no lobby");
  for (const bk of banks) if (!lobbies.some((l) => adj(bk.rect, l.rect))) violations.push("bank not fronted by lobby");
  // overlaps are bugs only when the core actually fits; when oversize they're an expected symptom (already flagged)
  if (fits) {
    const all = [...placed, ...stairsP];
    outer: for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
      if (rectsOverlap(all[i].rect, all[j].rect)) { violations.push(`overlap ${all[i].name}/${all[j].name}`); break outer; }
  }

  const all = [...placed, ...stairsP];
  const xs = all.flatMap((c) => [c.rect.x, c.rect.x + c.rect.w]), ys = all.flatMap((c) => [c.rect.y, c.rect.y + c.rect.h]);
  const rect = xs.length ? { x: r1(Math.min(...xs)), y: r1(Math.min(...ys)), w: r1(Math.max(...xs) - Math.min(...xs)), h: r1(Math.max(...ys) - Math.min(...ys)) } : { x: 0, y: 0, w: 0, h: 0 };

  return {
    coreType, corePosition, frontDir, rect, fits,
    areaFt2: Math.round(footArea), areaPct: r1((footArea / (W * H)) * 100),
    components: placed, stairs: stairsP.map((s) => s.rect), stairCells: stairsP,
    egress, valid: violations.length === 0 && fits, grammarOk: violations.length === 0,
    violations, flags,
  };
}
