// client/src/bim/coreLayout.js
// Slicing-tree + squarified-treemap core layout (architectural layout synthesis).
// A core is a double-loaded corridor: a circulation spine with room zones on each side.
// We stack BANDS in depth (slicing cuts), each band spans the full core length, and pack
// many-item bands (risers) with a squarified treemap. Tessellation + adjacency are guaranteed
// by construction: every room touches the spine; no gaps, no overlaps. Areas are preserved.
import { CORE_DIMS } from "./coreObjects.js";

const r1 = (n) => Math.round(n * 10) / 10;

// ---- squarified treemap (Bruls, Huizing & van Wijk 2000): fill rect with near-square cells ----
function squarify(items, x, y, w, h) {
  const out = [];
  if (!items.length) return out;
  const area = items.reduce((s, d) => s + Math.max(d.area, 1), 0);
  const scale = (w * h) / area;
  const q = items.map((d) => ({ d, a: Math.max(d.area, 1) * scale }));
  let cx = x, cy = y, cw = w, ch = h;
  const worst = (row, len) => {
    const s = row.reduce((a, b) => a + b.a, 0), mx = Math.max(...row.map((b) => b.a)), mn = Math.min(...row.map((b) => b.a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  let i = 0;
  while (i < q.length) {
    const vertical = cw >= ch;           // lay the row along the shorter side
    const len = vertical ? ch : cw;
    let row = [q[i]], j = i + 1;
    while (j < q.length) {
      const cand = [...row, q[j]];
      if (worst(row, len) < worst(cand, len)) break;
      row = cand; j++;
    }
    const rowArea = row.reduce((a, b) => a + b.a, 0), thick = rowArea / len;
    let pos = vertical ? cy : cx;
    for (const b of row) {
      const along = b.a / thick;
      if (vertical) { out.push({ d: b.d, rect: { x: r1(cx), y: r1(pos), w: r1(thick), h: r1(along) } }); }
      else { out.push({ d: b.d, rect: { x: r1(pos), y: r1(cy), w: r1(along), h: r1(thick) } }); }
      pos += along;
    }
    if (vertical) { cx += thick; cw -= thick; } else { cy += thick; ch -= thick; }
    i = j;
  }
  return out;
}

// ---- build the band stack (local coords: x along core length, y = depth; y=0 blind, y=D active) ----
// returns { placed:[{...cell, lx,ly,lw,lh}], L, D, stairBands:{y0,y1} }
function layoutBands({ bank, lobby, smoke, washrooms, risers, support, stairs, doubleLoaded, dims }) {
  const carD = bank ? bank.dFt : 0;
  const L = Math.max(bank ? bank.wFt : 12, washrooms.reduce((s, c) => s + c.wFt, 0), 18);
  const placed = [];
  const bandRow = (cell, y0, depth, x0, w) => placed.push({ ...cell, lx: x0, ly: y0, lw: w, lh: depth });
  const areaOf = (arr) => arr.reduce((s, c) => s + c.wFt * c.dFt, 0);

  let y = 0;
  if (doubleLoaded) {
    // elevators -> smoke lobby -> LIFT LOBBY (public spine) -> accessed rooms -> blind risers
    if (bank) { bandRow(bank, y, carD, 0, L); y += carD; }
    if (smoke) { bandRow(smoke, y, smoke.dFt, 0, L); y += smoke.dFt; }
    const corridorY = y; if (lobby) { bandRow(lobby, y, lobby.dFt, 0, L); y += lobby.dFt; }
    const corridorY1 = y;
    // below the spine: a FRONT row of rooms people enter (washrooms, janitor, lactation) that touch the
    // corridor, filled out to the core width with the largest risers; remaining risers in a blind back row.
    const accessed = washrooms.concat(support.filter((c) => c.key === "janitor" || c.key === "lactation"));
    const pool = risers.concat(support.filter((c) => c.key !== "janitor" && c.key !== "lactation")).sort((a, b) => b.wFt * b.dFt - a.wFt * a.dFt);
    const targetD = 13, front = [...accessed];
    let fArea = front.reduce((s, c) => s + c.wFt * c.dFt, 0);
    while (fArea < L * targetD && pool.length) { const it = pool.shift(); front.push(it); fArea += it.wFt * it.dFt; }
    const fD = fArea / L;
    let fx = 0; for (const c of front) { const cw = (c.wFt * c.dFt) / fD; bandRow(c, y, fD, fx, cw); fx += cw; }
    y += fD;
    if (pool.length) { const bD = pool.reduce((s, c) => s + c.wFt * c.dFt, 0) / L; squarify(pool.map((c) => ({ area: c.wFt * c.dFt, cell: c })), 0, y, L, bD).forEach((p) => bandRow(p.d.cell, p.rect.y, p.rect.h, p.rect.x, p.rect.w)); y += bD; }
    return { placed, L, D: y, corridorY, corridorY1 };
  }
  // single-loaded: risers (blind) | [elevators | washrooms] front band | CORRIDOR (active)
  const allRisers = risers.concat(support);
  const wcArea = areaOf(washrooms);
  const frontD = Math.max(carD, 13);                 // front band depth (cars + washrooms front the spine)
  const wcWidth = wcArea > 0 ? wcArea / frontD : 0;   // washrooms sized to that depth
  const Lsingle = Math.max((bank ? bank.wFt : 0) + wcWidth, 16);
  const riserD = areaOf(allRisers) / Lsingle;
  if (allRisers.length) squarify(allRisers.map((c) => ({ area: c.wFt * c.dFt, cell: c })), 0, y, Lsingle, riserD).forEach((p) => bandRow(p.d.cell, p.rect.y, p.rect.h, p.rect.x, p.rect.w));
  if (allRisers.length) y += riserD;
  if (bank) bandRow(bank, y, frontD, 0, bank.wFt);
  let wx = bank ? bank.wFt : 0;
  for (const c of washrooms) { const cw = (c.wFt * c.dFt) / frontD; bandRow(c, y, frontD, wx, cw); wx += cw; }
  y += frontD;
  const corridorY = y; if (lobby) { bandRow(lobby, y, lobby.dFt, 0, Lsingle); y += lobby.dFt; }
  if (smoke) { bandRow(smoke, y, smoke.dFt, 0, Lsingle); y += smoke.dFt; }
  return { placed, L: Lsingle, D: y, corridorY, corridorY1: y };
}

export { squarify, layoutBands };
