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
function layoutBands({ bank, lobby, washrooms, stairs, mep, boh, vest, egressExtra, doubleLoaded, dims }) {
  const carD = bank ? bank.dFt : 0;
  const placed = [];
  const bandRow = (cell, y0, depth, x0, w) => placed.push({ ...cell, lx: x0, ly: y0, lw: w, lh: depth });
  const areaOf = (arr) => arr.reduce((s, c) => s + c.wFt * c.dFt, 0);

  if (doubleLoaded) {
    // THREE-COLUMN central core with real circulation:
    //   center : elevator lobby (N, to floor) / pax elevators /
    //            SERVICE ROW [closets + freight + a MECHANICAL ROOM holding the sealed shafts] /
    //            SERVICE CORRIDOR (S, to floor)
    //   sides  : stair at a diagonal corner + washroom (to floor) on each opposite face
    // Every closet and the mech room front the service corridor with a door; the sealed duct/plumbing/
    // fire/pressurization shafts sit INSIDE the mech room (reached through its one door) — nothing landlocked.
    const bankW = bank ? bank.wFt : 18;
    const lobbyD = lobby ? lobby.dFt : 0;
    const pressShafts = mep.concat(egressExtra).filter((c) => c.key && c.key.startsWith("press"));
    const sealed = mep.concat(pressShafts.filter((c) => !mep.includes(c)));        // -> inside mech room
    const stairExtra = egressExtra.filter((c) => !(c.key && c.key.startsWith("press")));  // vest / refuge
    const rowRooms = boh.concat(stairExtra);                                       // front the corridor
    const vestD = vest ? vest.dFt : 6;
    const Dsvc = Math.max(rowRooms.length ? Math.max(...rowRooms.map((c) => c.dFt)) : 0, 10);
    const mechW = sealed.length ? Math.max(areaOf(sealed) / Dsvc, 6) : 0;
    const rowNatW = rowRooms.reduce((s, c) => s + c.wFt, 0) + mechW;
    const centerW = Math.max(bankW, rowNatW, 18);
    const sD = stairs.length ? stairs[0].dFt : 0, sW = stairs.length ? stairs[0].wFt : 0;
    const wcM = washrooms.find((c) => c.key === "wcM") || washrooms[0] || null;
    const wcW = washrooms.find((c) => c.key === "wcW") || (washrooms[1] || null);
    // the washroom's fixture run (its wFt) must fit alongside the stair in the side column, + an entry zone
    const washNeed = Math.max(wcM ? wcM.wFt : 0, wcW ? wcW.wFt : 0) + 8;
    const centerColH = lobbyD + carD + Dsvc + vestD;
    const Hc = Math.max(centerColH, sD + washNeed, sD + 10);
    const vestD2 = vestD + (Hc - centerColH);                    // pad the service corridor to fill the height
    const washH = Hc - sD;
    // washroom column width = the room's real depth (stall + aisle + lav), so it is not stretched skinny
    const Lw = Math.max(wcM ? wcM.dFt : 0, sW, 11);
    const Rw = Math.max(wcW ? wcW.dFt : 0, sW, 11);
    const cx = Lw, totalW = Lw + centerW + Rw;
    let y = 0;
    if (lobby) bandRow(lobby, y, lobbyD, cx, centerW); y += lobbyD;
    if (bank) bandRow(bank, y, carD, cx, centerW); y += carD;
    // service row: closets/freight/stair-extras, then the mech room (sealed shafts squarified inside)
    const scale = centerW / (rowNatW || 1);
    let bx = cx;
    for (const c of rowRooms) { const cw = c.wFt * scale; bandRow(c, y, Dsvc, bx, cw); bx += cw; }
    if (sealed.length) {
      const mw = mechW * scale;
      squarify(sealed.map((c) => ({ area: c.wFt * c.dFt, cell: c })), bx, y, mw, Dsvc).forEach((p) => bandRow({ ...p.d.cell, access: "mech" }, p.rect.y, p.rect.h, p.rect.x, p.rect.w));
      bx += mw;
    }
    y += Dsvc;
    if (vest) bandRow(vest, y, vestD2, cx, centerW);
    const stairsLocal = [];
    if (stairs[0]) stairsLocal.push({ ...stairs[0], lx: 0, ly: 0, lw: Lw, lh: sD });
    if (wcM) bandRow(wcM, sD, washH, 0, Lw);
    if (wcW) bandRow(wcW, 0, washH, cx + centerW, Rw);
    if (stairs[1]) stairsLocal.push({ ...stairs[1], lx: cx + centerW, ly: Hc - sD, lw: Rw, lh: sD });
    for (let i = 2; i < stairs.length; i++) stairsLocal.push({ ...stairs[i], lx: 0, ly: Hc - sD, lw: Lw, lh: sD });
    return { placed, L: totalW, D: Hc, corridorY: 0, corridorY1: lobbyD, stairsLocal };
  }

  // single-loaded (side / end): risers (blind) | [elevators | washrooms] | corridor (active)
  const interior = mep.concat(boh).concat(egressExtra).concat(vest ? [vest] : []);
  const L0 = Math.max(bank ? bank.wFt : 12, washrooms.reduce((s, c) => s + c.wFt, 0), 18);
  const wcArea = areaOf(washrooms);
  const frontD = Math.max(carD, 13);
  const wcWidth = wcArea > 0 ? wcArea / frontD : 0;
  const Lsingle = Math.max((bank ? bank.wFt : 0) + wcWidth, 16);
  let y = 0;
  const riserD = interior.length ? areaOf(interior) / Lsingle : 0;
  if (interior.length) squarify(interior.map((c) => ({ area: c.wFt * c.dFt, cell: c })), 0, y, Lsingle, riserD).forEach((p) => bandRow(p.d.cell, p.rect.y, p.rect.h, p.rect.x, p.rect.w));
  if (interior.length) y += riserD;
  if (bank) bandRow(bank, y, frontD, 0, bank.wFt);
  let wx = bank ? bank.wFt : 0;
  for (const c of washrooms) { const cw = (c.wFt * c.dFt) / frontD; bandRow(c, y, frontD, wx, cw); wx += cw; }
  y += frontD;
  const corridorY = y; if (lobby) { bandRow(lobby, y, lobby.dFt, 0, Lsingle); y += lobby.dFt; }
  return { placed, L: Lsingle, D: y, corridorY, corridorY1: y };
}

export { squarify, layoutBands };
