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
    // LANDSCAPE central core (precedent image 4: wide + shallow). Elements sit SIDE BY SIDE across the
    // width in a shallow band of depth D; every room reaches a floor edge (N or S), so there is no dead
    // service vestibule. Stairs go to the far L/R corners (max remoteness); the pax bank + lobby sit
    // centrally (central lobby). Local y=0 = back/N edge, y=D = front/S edge — both face the floor.
    const bankW = bank ? bank.wFt : 18;
    const lobbyD = lobby ? lobby.dFt : 10;
    const sD = stairs.length ? stairs[0].dFt : 15, sW = stairs.length ? stairs[0].wFt : 10;
    const pressShafts = egressExtra.filter((c) => c.key && c.key.startsWith("press"));
    const sealed = mep.concat(pressShafts);
    const wcM = washrooms.find((c) => c.key === "wcM") || washrooms[0] || null;
    const wcW = washrooms.find((c) => c.key === "wcW") || washrooms[1] || null;
    const small = boh.filter((c) => !c.freight);                 // janitor, lift control
    const freight = boh.find((c) => c.freight) || null;
    const mechArea = areaOf(sealed);

    const wcCount = wcM ? (wcM.wc || 3) : 3, lavCount = wcM ? (wcM.lav || 3) : 3, uCount = wcM ? (wcM.urinals || 0) : 0;
    const washDepthNeed = Math.max(5 + Math.max(0, wcCount - 1) * 3, (lavCount + uCount) * 2.5) + 7;  // deeper fixture wall (60in stalls / 30in lav+urinal) + clear zone
    // ELEVATOR LOBBY orientation (Eric / IBC 1016.2): the lobby must give two ways out. The clean form is a
    // N-S corridor open at BOTH the north and south core edges, with cars flanking it (step off, go N or S).
    // Used for <=8 cars; bigger banks fall back to opposed E-W rows (would need elevator zoning anyway).
    const nCars = bank ? (bank.cars || 1) : 0;
    const carW = bank && nCars ? bank.wFt / nCars : 0;
    const lobbyW = Math.max(lobbyD, 9);
    const rotated = nCars >= 2 && nCars <= 8;
    const nW = rotated ? Math.ceil(nCars / 2) : nCars, nE = rotated ? nCars - nW : 0;
    const opposed = !rotated && nCars >= 4;
    const elevDepth = rotated ? Math.max(nW, nE) * carW : (opposed ? 2 * carD + 8 : 16);
    const D = Math.max(sD, carD + lobbyD, washDepthNeed, elevDepth + (rotated ? 1 : 0), 16);  // band depth = deepest requirement
    const stairsLocal = [];
    let x = 0;
    const wcWidth = (c) => Math.max((c.wFt * c.dFt) / D, 13);     // >= 13ft: 5ft stall + 5ft turning circle + ~2ft lav, all clear
    const svcLobbyD = Math.min(8, D * 0.45);
    const roomH = D - svcLobbyD;
    // helper: full-depth washroom with front entry + baffle
    const placeWC = (c) => { if (c) { bandRow({ ...c, entry: "bottom" }, 0, D, x, wcWidth(c)); x += wcWidth(c); } };

    // 1. Stair A — far-left corner (remote)
    if (stairs[0]) { stairsLocal.push({ ...stairs[0], lx: x, ly: 0, lw: sW, lh: D }); x += sW; }

    // 2. BACK-OF-HOUSE block (its OWN freight / service lobby, kept apart from the pax lobby by the washroom):
    //    the freight car AND every BOH service (janitor, control, HVAC) open onto the freight/service lobby.
    const svcStart = x;
    if (freight) { bandRow({ ...freight }, 0, Math.min(freight.dFt, roomH), x, freight.wFt); x += freight.wFt; }
    if (mechArea > 0) {
      const mechW = Math.max(mechArea / roomH, 10);
      squarify(sealed.map((s) => ({ area: s.wFt * s.dFt, cell: s })), x, 0, mechW, roomH).forEach((p) => bandRow({ ...p.d.cell, access: "mech", doorEdge: "bottom" }, p.rect.y, p.rect.h, p.rect.x, p.rect.w));
      x += mechW;
    }
    for (const c of small) { const w = Math.max(c.wFt, 5); bandRow({ ...c, access: "svc", doorEdge: "bottom" }, 0, roomH, x, w); x += w; }
    if (x > svcStart) bandRow({ key: "freightLobby", type: "lobby", name: "Freight / service lobby", access: "edge", vestibule: true, dedicated: true }, roomH, svcLobbyD, svcStart, x - svcStart);

    // 3. Men's washroom — separates the BOH service lobby from the central pax lobby
    placeWC(wcM);

    // 4. Passenger elevators around a central N-S lobby that opens to the floor at the north AND south
    //    edges (step off the lift, go north or south to two parts of the floor — and to both stairs).
    if (rotated) {
      // West cars (vertical stack), then the N-S lobby corridor, then East cars
      bandRow({ ...bank, cars: nW, wFt: nW * carW }, 0, nW * carW, x, carD);
      if (D - nW * carW > 0.5) bandRow({ ...lobby, key: "lobbyW", name: "" }, nW * carW, D - nW * carW, x, carD); // lobby fills below W cars
      if (lobby) bandRow(lobby, 0, D, x + carD, lobbyW);                                       // central N-S lobby (open N + S)
      if (nE > 0) {
        bandRow({ ...bank, cars: nE, wFt: nE * carW, fs: 0 }, 0, nE * carW, x + carD + lobbyW, carD);
        if (D - nE * carW > 0.5) bandRow({ ...lobby, key: "lobbyE", name: "" }, nE * carW, D - nE * carW, x + carD + lobbyW, carD);
      }
      x += carD + lobbyW + (nE > 0 ? carD : 0);
    } else if (opposed) {
      const zoneW = nW > nE ? nW * carW : nW * carW + 6;
      bandRow({ ...bank, cars: nW, wFt: nW * carW }, 0, carD, x, nW * carW);
      bandRow({ ...bank, cars: nE, wFt: nE * carW, fs: 0 }, D - carD, carD, x, nE * carW);
      if (lobby) bandRow(lobby, carD, D - 2 * carD, x, zoneW);
      bandRow({ ...lobby, key: "lobbyS", name: "" }, D - carD, carD, x + nE * carW, zoneW - nE * carW);
      if (zoneW - nW * carW > 0.5) bandRow({ ...lobby, key: "lobbyN", name: "" }, 0, carD, x + nW * carW, zoneW - nW * carW);
      x += zoneW;
    } else {
      if (bank) bandRow(bank, 0, carD, x, bankW);
      if (lobby) bandRow(lobby, carD, D - carD, x, bankW);
      x += bankW;
    }

    // 5. Women's washroom
    placeWC(wcW);

    // 6. Stair B — far-right corner (remote); extras continue along the row
    if (stairs[1]) { stairsLocal.push({ ...stairs[1], lx: x, ly: 0, lw: sW, lh: D }); x += sW; }
    for (let i = 2; i < stairs.length; i++) { stairsLocal.push({ ...stairs[i], lx: x, ly: 0, lw: sW, lh: D }); x += sW; }

    return { placed, L: x, D, corridorY: D - lobbyD, corridorY1: D, stairsLocal };
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
