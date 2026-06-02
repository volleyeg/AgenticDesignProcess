// client/src/bim/corePacker.js
// Core packer built on slicing-band layout (coreLayout.js): the core is a double-loaded
// corridor (central) or single-loaded (side/end), assembled as a slicing tree with squarified
// treemap for the riser zones. Tessellation + spine adjacency are guaranteed by construction.
// Output shape is unchanged so shellgen / renderer / gauntlets stay the same.
import { CORE_DIMS } from "./coreObjects.js";
import { layoutBands } from "./coreLayout.js";

const r1 = (n) => Math.round(n * 10) / 10;
const rectsOverlap = (a, b) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
const groupCells = (cells) => ({
  bank: cells.find((c) => c.key === "liftBank"),
  lobby: cells.find((c) => c.key === "lobby"),
  smoke: cells.find((c) => c.key === "smokeLobby"),
  washrooms: cells.filter((c) => c.type === "restroom"),
  stairs: cells.filter((c) => c.type === "stair"),
  risers: cells.filter((c) => c.group === "mep"),
  support: cells.filter((c) => c.group === "support" || c.key === "control" || (c.group === "egress" && c.type !== "stair")),
});

// transform local band coords (x along length, y=depth 0=blind..D=active) to floor coords
function transformer(type, position, L, D, stairW, W, H) {
  const fullW = L + 2 * stairW;
  if (type === "end") {
    const west = position !== "east", oy = (H - fullW) / 2;
    const f = west
      ? (lx, ly, lw, lh) => ({ x: r1(ly), y: r1(oy + lx + stairW), w: r1(lh), h: r1(lw) })
      : (lx, ly, lw, lh) => ({ x: r1(W - ly - lh), y: r1(oy + lx + stairW), w: r1(lh), h: r1(lw) });
    return { frontDir: west ? "E" : "W", f };
  }
  const ox = (W - fullW) / 2;
  if (type === "side") {
    const south = position !== "north";
    const f = south
      ? (lx, ly, lw, lh) => ({ x: r1(ox + lx + stairW), y: r1(ly), w: r1(lw), h: r1(lh) })
      : (lx, ly, lw, lh) => ({ x: r1(ox + lx + stairW), y: r1(H - ly - lh), w: r1(lw), h: r1(lh) });
    return { frontDir: south ? "N" : "S", f };
  }
  const oy = (H - D) / 2; // central island
  return { frontDir: "island", f: (lx, ly, lw, lh) => ({ x: r1(ox + lx + stairW), y: r1(oy + ly), w: r1(lw), h: r1(lh) }) };
}

// lay out one cluster (single- or double-loaded) and map to floor coords
function buildCluster(cells, type, position, doubleLoaded, W, H, dims) {
  const g = groupCells(cells);
  const lay = layoutBands({ ...g, doubleLoaded, dims });
  const stairW = g.stairs.length ? g.stairs[0].wFt : 0, stairD = g.stairs.length ? g.stairs[0].dFt : 0;
  let stairsLocal, flankOffset;
  if (lay.stairsLocal) {                 // central: stairs already placed at diagonal corners inside the core
    stairsLocal = lay.stairsLocal; flankOffset = 0;
  } else {                               // single-loaded: flank the corridor ends
    const cY = (lay.corridorY + lay.corridorY1) / 2 - stairD / 2;
    stairsLocal = [];
    if (g.stairs[0]) stairsLocal.push({ ...g.stairs[0], lx: -stairW, ly: cY, lw: stairW, lh: stairD });
    if (g.stairs[1]) stairsLocal.push({ ...g.stairs[1], lx: lay.L, ly: cY, lw: stairW, lh: stairD });
    for (let i = 2; i < g.stairs.length; i++) { const k = Math.floor((i - 2) / 2) + 1, left = i % 2 === 0; stairsLocal.push({ ...g.stairs[i], lx: left ? -(k + 1) * stairW : lay.L + k * stairW, ly: cY, lw: stairW, lh: stairD }); }
    flankOffset = stairW;
  }
  const { frontDir, f } = transformer(type, position, lay.L, lay.D, flankOffset, W, H);
  return {
    frontDir,
    placed: lay.placed.map((c) => ({ ...c, rect: f(c.lx, c.ly, c.lw, c.lh) })),
    stairsP: stairsLocal.map((s) => ({ ...s, rect: f(s.lx, s.ly, s.lw, s.lh) })),
  };
}

export function packCore({ W, H, coreType = "central", corePosition = "center", cells,
  sprinklered = true, highRise = false, diagonal, dims = CORE_DIMS }) {
  const violations = [], flags = [];
  const sepReq = highRise ? Math.min(30, diagonal * 0.25) : diagonal * (sprinklered ? 1 / 3 : 1 / 2);

  let placed = [], stairsP = [], frontDir, collide = false;
  if (coreType === "double") {
    const stairsAll = cells.filter((c) => c.type === "stair");
    const mk = (side) => {
      const out = [];
      const bank = cells.find((c) => c.key === "liftBank");
      if (bank) out.push({ ...bank, wFt: r1(bank.wFt / 2), cars: Math.max(1, Math.ceil(bank.cars / 2)), name: `${Math.max(1, Math.ceil(bank.cars / 2))} lifts` });
      const lobby = cells.find((c) => c.key === "lobby"); if (lobby) out.push({ ...lobby, wFt: r1(lobby.wFt / 2) });
      out.push(...cells.filter((c) => c.key === (side === "W" ? "wcM" : "wcW")));
      out.push(...cells.filter((c) => c.group === "mep").filter((_, i) => i % 2 === (side === "W" ? 0 : 1)));
      out.push(...cells.filter((c) => (side === "W" ? c.key === "janitor" : c.key === "lactation") || (c.group === "egress" && c.type !== "stair")));
      const st = stairsAll[side === "W" ? 0 : 1] || stairsAll[0]; if (st) out.push({ ...st });
      return out;
    };
    const pw = buildCluster(mk("W"), "end", "west", false, W, H, dims);
    const pe = buildCluster(mk("E"), "end", "east", false, W, H, dims);
    placed = [...pw.placed, ...pe.placed]; stairsP = [...pw.stairsP, ...pe.stairsP]; frontDir = "split";
    for (const a of [...pw.placed, ...pw.stairsP]) { for (const b of [...pe.placed, ...pe.stairsP]) if (rectsOverlap(a.rect, b.rect)) { collide = true; break; } if (collide) break; }
  } else {
    const c = buildCluster(cells, coreType, coreType === "central" ? "center" : corePosition, coreType === "central", W, H, dims);
    placed = c.placed; stairsP = c.stairsP; frontDir = c.frontDir;
  }

  const onPlate = (r) => r.x >= -0.6 && r.y >= -0.6 && r.x + r.w <= W + 0.6 && r.y + r.h <= H + 0.6;
  let fits = [...placed, ...stairsP].every((c) => onPlate(c.rect)) && !collide;
  if (!fits) flags.push("core exceeds floor plate — densify program, enlarge floor, or split core");

  // ---- egress remoteness: keep in-core stair, pull the other clear of the core if too close ----
  const sep = (a, b) => Math.hypot((a.x + a.w / 2) - (b.x + b.w / 2), (a.y + a.h / 2) - (b.y + b.h / 2));
  let egress = { requiredFt: Math.round(sepReq), actualFt: 0, ok: true };
  if (stairsP.length >= 2) {
    let actual = sep(stairsP[0].rect, stairsP[1].rect);
    if (actual < sepReq - 0.5 && fits) {
      const cx = placed.flatMap((c) => [c.rect.x, c.rect.x + c.rect.w]), cy = placed.flatMap((c) => [c.rect.y, c.rect.y + c.rect.h]);
      const cb = { x: Math.min(...cx), y: Math.min(...cy), x2: Math.max(...cx), y2: Math.max(...cy) };
      const sw2 = dims.stair.w, sd2 = dims.stair.d, m = 1, a0 = stairsP[0].rect;
      const cands = [
        { x: m, y: m }, { x: W - m - sw2, y: m }, { x: m, y: H - m - sd2 }, { x: W - m - sw2, y: H - m - sd2 },
        { x: (W - sw2) / 2, y: m }, { x: (W - sw2) / 2, y: H - m - sd2 }, { x: m, y: (H - sd2) / 2 }, { x: W - m - sw2, y: (H - sd2) / 2 },
      ];
      let best = null;
      for (const p of cands) {
        const r = { x: p.x, y: p.y, w: sw2, h: sd2 };
        if (r.x < cb.x2 - 1 && r.x + r.w > cb.x + 1 && r.y < cb.y2 - 1 && r.y + r.h > cb.y + 1) continue;
        const d = sep(a0, r); if (!best || d > best.d) best = { r, d };
      }
      if (best && best.d > actual) { stairsP[1].rect = best.r; actual = best.d; flags.push(`stair pulled clear of core for remoteness (${Math.round(actual)} ≥ ${Math.round(sepReq)} ft)`); }
    }
    egress = { requiredFt: Math.round(sepReq), actualFt: Math.round(actual), ok: actual >= sepReq - 0.5 };
    if (!egress.ok) flags.push(`egress remoteness short (${egress.actualFt} < ${egress.requiredFt} ft) — relocate or add a stair`);
  }

  // ---- grammar validation (guaranteed by construction; checked anyway) ----
  const banks = placed.filter((c) => c.type === "elevator"), lobbies = placed.filter((c) => c.type === "lobby");
  const adj = (a, b) => {
    const sx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), sy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (sx > 2 && (Math.abs(a.y + a.h - b.y) < 1.5 || Math.abs(b.y + b.h - a.y) < 1.5)) ||
           (sy > 2 && (Math.abs(a.x + a.w - b.x) < 1.5 || Math.abs(b.x + b.w - a.x) < 1.5));
  };
  if (!banks.length) violations.push("no elevator bank");
  if (!lobbies.length) violations.push("no lobby");
  for (const bk of banks) if (!lobbies.some((l) => adj(bk.rect, l.rect))) violations.push("bank not fronted by lobby");
  if (fits) { const all = [...placed, ...stairsP]; outer: for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (rectsOverlap(all[i].rect, all[j].rect)) { violations.push(`overlap ${all[i].name}/${all[j].name}`); break outer; } }

  const all = [...placed, ...stairsP];
  const footArea = placed.reduce((s, c) => s + c.rect.w * c.rect.h, 0) + stairsP.reduce((s, c) => s + c.rect.w * c.rect.h, 0);
  const xs = all.flatMap((c) => [c.rect.x, c.rect.x + c.rect.w]), ys = all.flatMap((c) => [c.rect.y, c.rect.y + c.rect.h]);
  const rect = xs.length ? { x: r1(Math.min(...xs)), y: r1(Math.min(...ys)), w: r1(Math.max(...xs) - Math.min(...xs)), h: r1(Math.max(...ys) - Math.min(...ys)) } : { x: 0, y: 0, w: 0, h: 0 };

  return {
    coreType, corePosition, frontDir, rect, fits,
    areaFt2: Math.round(footArea), areaPct: r1((footArea / (W * H)) * 100),
    components: placed, stairs: stairsP.map((s) => s.rect), stairCells: stairsP,
    egress, valid: violations.length === 0 && fits, grammarOk: violations.length === 0, violations, flags,
  };
}
