// client/src/bim/coreLayout.js
// Slicing-tree + squarified-treemap core layout (architectural layout synthesis).
// A core is a double-loaded corridor: a circulation spine with room zones on each side.
// We stack BANDS in depth (slicing cuts), each band spans the full core length, and pack
// many-item bands (risers) with a squarified treemap. Tessellation + adjacency are guaranteed
// by construction: every room touches the spine; no gaps, no overlaps. Areas are preserved.
import { CORE_DIMS } from "./coreObjects.js";

const r1 = (n) => Math.round(n * 10) / 10;

// ---- service pods: wrap up to 3 rooms (left / top / right) around one small vestibule that opens
// 'south' (to the floor). The code DECIDES how many pods by trying each valid count and keeping the
// arrangement that packs the service zone into the least width (tightest core). No hard-coded layout.
// Returns { placed:[{...cell,lx,ly,lw,lh}], vests:[{id,lx,ly,lw,lh}], width } packed into height H.
function packServicePods(rooms, H, vestW0 = 6, vestH0 = 7) {
  if (!rooms.length) return { placed: [], vests: [], width: 0 };
  const area = (c) => c.wFt * c.dFt;
  // build ONE pod (1-3 rooms) at local origin; returns {cells, vest, w} filling height H
  const buildPod = (grp, id) => {
    const cells = [], R = grp.slice().sort((a, b) => area(b) - area(a));
    const top = R.length === 3 ? R[2] : null;          // smallest caps the middle column
    const left = R[0] || null, right = R.length >= 2 ? R[1] : null;
    const vestH = top ? Math.min(vestH0, H - 4) : H;    // small vestibule if a top room caps it, else full height
    const vestW = top ? Math.max(vestW0, area(top) / Math.max(H - vestH, 4)) : vestW0;
    const leftW = left ? Math.max(area(left) / H, 4) : 0;
    const rightW = right ? Math.max(area(right) / H, 4) : 0;
    const w = leftW + vestW + rightW;
    if (left) cells.push({ ...left, lx: 0, ly: 0, lw: leftW, lh: H, vestId: id });
    if (top) cells.push({ ...top, lx: leftW, ly: 0, lw: vestW, lh: H - vestH, vestId: id });
    if (right) cells.push({ ...right, lx: leftW + vestW, ly: 0, lw: rightW, lh: H, vestId: id });
    const vest = { id, lx: leftW, ly: H - vestH, lw: vestW, lh: vestH };
    return { cells, vest, w };
  };
  // partition rooms into n pods (<=3 each), greedily balancing area into the currently-smallest pod
  const partition = (n) => {
    const groups = Array.from({ length: n }, () => []);
    const load = new Array(n).fill(0);
    for (const room of rooms.slice().sort((a, b) => area(b) - area(a))) {
      let best = -1; for (let i = 0; i < n; i++) if (groups[i].length < 3 && (best < 0 || load[i] < load[best])) best = i;
      if (best < 0) return null;                          // can't fit (n too small)
      groups[best].push(room); load[best] += area(room);
    }
    return groups.filter((g) => g.length);
  };
  // try the minimum feasible pod count and one more; keep the tightest (least width)
  let bestW = Infinity, best = null;
  const nMin = Math.ceil(rooms.length / 3);
  for (let n = nMin; n <= nMin + 1; n++) {
    const groups = partition(n); if (!groups) continue;
    const pods = groups.map((g, i) => buildPod(g, i));
    const width = pods.reduce((s, p) => s + p.w, 0);
    const ar = pods.reduce((s, p) => s + Math.abs(Math.log((p.w || 1) / H)), 0);  // squareness penalty
    const cost = width + ar * 0.5;
    if (cost < bestW) { bestW = cost; best = { pods, width }; }
  }
  if (!best) { const p = buildPod(rooms.slice(0, 3), 0); best = { pods: [p], width: p.w }; }
  // lay the pods left-to-right
  const placed = [], vests = []; let x = 0;
  for (const p of best.pods) {
    for (const c of p.cells) placed.push({ ...c, lx: c.lx + x });
    vests.push({ ...p.vest, lx: p.vest.lx + x });
    x += p.w;
  }
  return { placed, vests, width: best.width };
}

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
    // the sealed shafts become one MECHANICAL ROOM (a single pod room; shafts squarified inside it)
    const mechArea = areaOf(sealed);
    const mechRoom = mechArea > 0 ? { key: "mech", type: "shaft", name: "Mechanical", wFt: Math.sqrt(mechArea), dFt: Math.sqrt(mechArea), access: "vestibule", isMech: true } : null;
    const serviceRooms = boh.concat(mechRoom ? [mechRoom] : []);
    const pod = packServicePods(serviceRooms, serviceH);
    const centerW = Math.max(bankW, pod.width, 18);
    const psc = centerW / (pod.width || 1);
    const washH = Hc - sD;
    const Lw = Math.max(wcM ? wcM.dFt : 0, sW, 11);
    const Rw = Math.max(wcW ? wcW.dFt : 0, sW, 11);
    const cx = Lw, totalW = Lw + centerW + Rw, sy0 = lobbyD + carD;
    let y = 0;
    if (lobby) bandRow(lobby, y, lobbyD, cx, centerW); y += lobbyD;
    if (bank) bandRow(bank, y, carD, cx, centerW); y += carD;
    // place the pod rooms (scaled to fill centerW); the mech room gets its sealed shafts squarified inside
    for (const c of pod.placed) {
      const rx = cx + c.lx * psc, ry = sy0 + c.ly, rw = c.lw * psc, rh = c.lh;
      if (c.isMech && sealed.length) {
        squarify(sealed.map((s) => ({ area: s.wFt * s.dFt, cell: s })), rx, ry, rw, rh).forEach((p) => bandRow({ ...p.d.cell, access: "mech", vestId: c.vestId }, p.rect.y, p.rect.h, p.rect.x, p.rect.w));
      } else bandRow(c, ry, rh, rx, rw);
    }
    pod.vests.forEach((v, i) => bandRow({ key: "svcVest" + v.id, type: "lobby", name: pod.vests.length > 1 ? "Service vest " + (v.id + 1) : "Service vestibule", access: "floor", vestibule: true, vestId: v.id }, sy0 + v.ly, v.lh, cx + v.lx * psc, v.lw * psc));
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
