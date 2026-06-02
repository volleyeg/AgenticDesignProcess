// client/src/bim/coreLayout.js
// Slicing-tree + squarified-treemap core layout (architectural layout synthesis).
// A core is a double-loaded corridor: a circulation spine with room zones on each side.
// We stack BANDS in depth (slicing cuts), each band spans the full core length, and pack
// many-item bands (risers) with a squarified treemap. Tessellation + adjacency are guaranteed
// by construction: every room touches the spine; no gaps, no overlaps. Areas are preserved.
import { CORE_DIMS } from "./coreObjects.js";

const r1 = (n) => Math.round(n * 10) / 10;

// ---- service zone: pack the service rooms by their ADJACENCY RULE.
//   access "dedicated" -> the room gets its own private vestibule (e.g. freight service lobby)
//   access "shared"    -> rooms cluster onto as few shared vestibules as possible (share aggressively)
//   access "floor"     -> the room doors straight to the building floor (e.g. mechanical room)
// Columns span the full band height H; multi-room columns STACK rooms (keeps each room near-square
// instead of a full-height skinny slot). Returns { placed, vests, width }.
const ASPECT_MAX = 2.5;
function packServiceZone(rooms, H, dims, vestW0 = 6) {
  const area = (c) => c.wFt * c.dFt;
  const cols = []; let vid = 0;
  // stack a set of rooms into a column of width colW (heights = area/colW), each tagged to vestibule v
  const stack = (set, colW, x0, vestId) => set.map((c) => ({ ...c, _h: area(c) / colW, vestId })).map((c, i, a) => {
    const yy = a.slice(0, i).reduce((s, k) => s + k._h, 0); return { ...c, lx: x0, ly: yy, lw: colW, lh: c._h };
  });
  // a SHARED column: vestibule strip (opens S) with ALL the shareable rooms stacked on one side, so the
  // column is as wide as possible (wider column = squarer rooms). Each stacked room touches the vestibule.
  const sharedColumn = (set) => {
    const id = vid++;
    const total = set.reduce((s, c) => s + area(c), 0);
    const colW = Math.max(total / H, 6);
    const cells = stack(set.slice().sort((a, b) => area(b) - area(a)), colW, 0, id);
    const vest = { id, lx: colW, ly: 0, lw: vestW0, lh: H, dedicated: false };
    return { w: colW + vestW0, cells, vests: [vest] };
  };
  // a DEDICATED column: one private vestibule (opens S) beside its single room. An elevator (freight)
  // keeps its real car size at the south end; its lobby wraps the rest so the shaft is not stretched.
  const dedicatedColumn = (c) => {
    const id = vid++;
    const isElev = c.type === "elevator" || c.freight;
    const rh = isElev ? Math.min(c.dFt, H) : H;
    const rw = isElev ? Math.max(c.wFt, area(c) / rh) : Math.max(area(c) / H, 5);
    const cells = [{ ...c, lx: 0, ly: H - rh, lw: rw, lh: rh, vestId: id }];
    const vests = [{ id, lx: rw, ly: 0, lw: vestW0, lh: H, dedicated: true }];               // strip beside the shaft
    if (rh < H) vests.push({ id, lx: 0, ly: 0, lw: rw, lh: H - rh, dedicated: true, filler: true }); // lobby cap above
    return { w: rw + vestW0, cells, vests };
  };
  // a FLOOR column: the room doors straight to the floor (no vestibule). Mech holds the sealed ducts.
  const floorColumn = (c) => ({ w: Math.max(area(c) / H, 6), cells: [{ ...c, lx: 0, ly: 0, lw: Math.max(area(c) / H, 6), lh: H }], vests: [] });

  const shared = rooms.filter((r) => r.access === "shared");
  const dedicated = rooms.filter((r) => r.access === "dedicated");
  const floor = rooms.filter((r) => r.access === "floor");
  if (shared.length) cols.push(sharedColumn(shared));           // ALL shareables onto ONE vestibule
  for (const c of dedicated) cols.push(dedicatedColumn(c));
  for (const c of floor) cols.push(floorColumn(c));

  const placed = [], vests = []; let x = 0;
  for (const col of cols) {
    for (const c of col.cells) placed.push({ ...c, lx: c.lx + x });
    for (const v of col.vests) vests.push({ ...v, lx: v.lx + x });
    x += col.w;
  }
  return { placed, vests, width: x };
}

// kept for any caller: legacy small-vestibule pod packer (unused by central now)
function packServicePods(rooms, H) { return packServiceZone(rooms, H, CORE_DIMS); }

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
    //   center : elevator lobby (N) / pax elevators / SERVICE PODS (small vestibules with rooms wrapped
    //            around them, each vestibule opening S to the floor) — count chosen by the packer search
    //   sides  : stair at a diagonal corner + washroom (to floor) on each opposite face
    const bankW = bank ? bank.wFt : 18;
    const lobbyD = lobby ? lobby.dFt : 0;
    const pressShafts = egressExtra.filter((c) => c.key && c.key.startsWith("press"));
    const sealed = mep.concat(pressShafts);                                        // -> inside a mech room
    // stair vestibule / refuge belong at the stairs (folded into the stair enclosure here), not in service pods
    const sD = stairs.length ? stairs[0].dFt : 0, sW = stairs.length ? stairs[0].wFt : 0;
    const wcM = washrooms.find((c) => c.key === "wcM") || washrooms[0] || null;
    const wcW = washrooms.find((c) => c.key === "wcW") || (washrooms[1] || null);
    const washNeed = Math.max(wcM ? wcM.wFt : 0, wcW ? wcW.wFt : 0) + 8;
    const Hc = Math.max(sD + washNeed, lobbyD + carD + 16, sD + 10);
    const serviceH = Hc - lobbyD - carD;
    // the sealed ducts + risers become one HVAC/MECH ROOM on the shared service vestibule (shafts squarified inside)
    const mechArea = areaOf(sealed);
    const mechRoom = mechArea > 0 ? { key: "mech", type: "shaft", name: "Mech / HVAC", wFt: Math.sqrt(mechArea), dFt: Math.sqrt(mechArea), access: "shared", isMech: true } : null;
    const serviceRooms = boh.concat(mechRoom ? [mechRoom] : []);
    const pod = packServiceZone(serviceRooms, serviceH, dims);
    const centerW = Math.max(bankW, pod.width, 18);
    const psc = centerW / (pod.width || 1);
    const washH = Hc - sD;
    const Lw = Math.max(wcM ? wcM.dFt : 0, sW, 11);
    const Rw = Math.max(wcW ? wcW.dFt : 0, sW, 11);
    const cx = Lw, totalW = Lw + centerW + Rw, sy0 = lobbyD + carD;
    let y = 0;
    if (lobby) bandRow(lobby, y, lobbyD, cx, centerW); y += lobbyD;
    if (bank) bandRow(bank, y, carD, cx, centerW); y += carD;
    // place service rooms (scaled to fill centerW); the mech room gets its sealed shafts squarified inside
    for (const c of pod.placed) {
      const rx = cx + c.lx * psc, ry = sy0 + c.ly, rw = c.lw * psc, rh = c.lh;
      if (c.isMech && sealed.length) {
        squarify(sealed.map((s) => ({ area: s.wFt * s.dFt, cell: s })), rx, ry, rw, rh).forEach((p) => bandRow({ ...p.d.cell, access: "mech", vestId: c.vestId }, p.rect.y, p.rect.h, p.rect.x, p.rect.w));
      } else bandRow(c, ry, rh, rx, rw);
    }
    // one label per service vestibule (the L-shaped freight lobby is one space, drawn as strip + filler — label only the strip)
    pod.vests.forEach((v, i) => bandRow({ key: "svcVest" + v.id + "_" + i, type: "lobby", name: v.filler ? "" : (v.dedicated ? "Freight lobby" : "Service vest"), access: "floor", vestibule: true, vestId: v.id, dedicated: v.dedicated, filler: v.filler }, sy0 + v.ly, v.lh, cx + v.lx * psc, v.lw * psc));
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
