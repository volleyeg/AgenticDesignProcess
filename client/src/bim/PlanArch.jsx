// client/src/bim/PlanArch.jsx
// Architectural plan renderer (image-4 quality): draws the plate on a drawing-sheet ground —
// poché core walls, elevator car boxes, stair treads + up arrow, washroom fixture symbols,
// door swings, columns as solid squares on a dimensioned grid with gridline bubbles, room labels.
// Two modes: full floor (region=floor) and zoomed core inset (region=core).
import React from "react";

const TINT = { // subtle room fills on the sheet so types still read
  elevator: "#e3e7ec", lobby: "#eef1f0", restroom: "#e6eef2", shaft: "#ece8ef",
  lactation: "#e8f0e6", stair: "#efe9e2", support: "#ecedee",
};
const SHEET = "#f5f2ea", INK = "#1f2024", POCHE = "#2b2d31", LINE = "#9aa0a6", THIN = "#c7c2b6";
const colLabel = (i) => String.fromCharCode(65 + i); // A,B,C...

export default function PlanArch({ shell, region = "floor", maxW = 720 }) {
  if (!shell || !shell.core) return null;
  const { W, H, core, grid, facade } = shell;
  const cells = core.components || [];
  const stairs = core.stairCells || [];
  const corridor = cells.find((c) => c.key === "lobby")?.rect || cells.find((c) => c.type === "lobby")?.rect || null;
  const _all = [...cells, ...stairs].map((c) => c.rect).filter(Boolean);
  const coreBox = _all.length
    ? { x: Math.min(..._all.map((r) => r.x)), y: Math.min(..._all.map((r) => r.y)), w: 0, h: 0 }
    : { x: 0, y: 0, w: 0, h: 0 };
  if (_all.length) { coreBox.w = Math.max(..._all.map((r) => r.x + r.w)) - coreBox.x; coreBox.h = Math.max(..._all.map((r) => r.y + r.h)) - coreBox.y; }
  // which edge of a rect lies on the core's outer boundary (i.e. faces the floor)
  const perimeterEdge = (r) => {
    const b = coreBox;
    if (Math.abs(r.y - b.y) < 1.2) return "top";
    if (Math.abs((r.y + r.h) - (b.y + b.h)) < 1.2) return "bottom";
    if (Math.abs(r.x - b.x) < 1.2) return "left";
    if (Math.abs((r.x + r.w) - (b.x + b.w)) < 1.2) return "right";
    return "bottom";
  };

  // view region
  let rx, ry, rw, rh, pad;
  if (region === "core" && core.rect && core.rect.w > 0) {
    pad = Math.max(core.rect.w, core.rect.h) * 0.18 + 6;
    rx = core.rect.x - pad; ry = core.rect.y - pad; rw = core.rect.w + pad * 2; rh = core.rect.h + pad * 2;
  } else { rx = 0; ry = 0; rw = W; rh = H; pad = 0; }

  const M = 34; // sheet margin for bubbles/dims
  const scale = Math.min((maxW - M * 2) / rw, 13);
  const X = (x) => M + (x - rx) * scale;
  const Y = (y) => M + (y - ry) * scale;
  const S = (v) => v * scale;
  const svgW = rw * scale + M * 2, svgH = rh * scale + M * 2;
  const wall = Math.max(S(0.67), 1.5); // poché wall thickness in px

  const inView = (r) => r.x + r.w > rx && r.x < rx + rw && r.y + r.h > ry && r.y < ry + rh;

  // ---- room drawing: dark envelope + inset interior = poché walls ----
  const Room = ({ r, fill, children, label, sub }) => {
    const px = X(r.x), py = Y(r.y), pw = S(r.w), ph = S(r.h);
    const big = pw > 30 && ph > 16;
    return (
      <g>
        <rect x={px} y={py} width={pw} height={ph} fill={POCHE} />
        <rect x={px + wall} y={py + wall} width={Math.max(pw - wall * 2, 0)} height={Math.max(ph - wall * 2, 0)} fill={fill} />
        {children}
        {label && big && (
          <text x={px + pw / 2} y={py + ph / 2} fill={INK} fontSize={Math.min(9, pw / 6)} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "ui-monospace,monospace" }}>
            {label}{sub ? <tspan x={px + pw / 2} dy="9" fontSize="6.5" fill="#6b6e73">{sub}</tspan> : null}
          </text>
        )}
      </g>
    );
  };

  // elevator bank -> individual car boxes with the shaft 'X'
  const Elevator = ({ r, cars, svc }) => {
    const pax = Math.max(1, cars || 1), nsvc = Math.max(0, svc || 0), n = pax + nsvc;
    const px = X(r.x) + wall, py = Y(r.y) + wall, pw = S(r.w) - wall * 2, ph = S(r.h) - wall * 2;
    const horiz = pw >= ph; const cw = horiz ? pw / n : pw, ch = horiz ? ph : ph / n;
    return (
      <g>
        <rect x={X(r.x)} y={Y(r.y)} width={S(r.w)} height={S(r.h)} fill={POCHE} />
        {Array.from({ length: n }).map((_, i) => {
          const bx = horiz ? px + i * cw : px, by = horiz ? py : py + i * ch;
          const freight = i >= pax;
          return (
            <g key={i}>
              <rect x={bx + 0.6} y={by + 0.6} width={cw - 1.2} height={ch - 1.2} fill={freight ? "#e7e3d8" : TINT.elevator} stroke={INK} strokeWidth="0.5" />
              <line x1={bx + 1.5} y1={by + 1.5} x2={bx + cw - 1.5} y2={by + ch - 1.5} stroke="#8b9097" strokeWidth="0.4" />
              <line x1={bx + cw - 1.5} y1={by + 1.5} x2={bx + 1.5} y2={by + ch - 1.5} stroke="#8b9097" strokeWidth="0.4" />
              {freight && Math.min(cw, ch) > 12 && <text x={bx + cw / 2} y={by + ch / 2} fill={INK} fontSize="6" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "ui-monospace,monospace" }}>FRT</text>}
            </g>
          );
        })}
      </g>
    );
  };

  // stair: entry landing at the door -> two flights with a mid-landing (switchback) -> up arrow
  const Stair = ({ r, doorEdge }) => {
    const px = X(r.x), py = Y(r.y), pw = S(r.w), ph = S(r.h);
    const ix = px + wall, iy = py + wall, iw = pw - wall * 2, ih = ph - wall * 2;
    const edge = doorEdge || (ih >= iw ? "bottom" : "left");
    const vert = edge === "bottom" || edge === "top";   // flights run vertically
    const entryLand = Math.min(S(4), (vert ? ih : iw) * 0.22);  // landing at the entry door
    const midLand = Math.min(S(3.5), (vert ? ih : iw) * 0.16);  // half-landing at the turn
    const L = [];
    const landRect = [];
    if (vert) {
      const half = iw / 2;
      const entryBottom = edge !== "top";
      const eLandY = entryBottom ? iy + ih - entryLand : iy;        // entry landing band
      const mLandY = entryBottom ? iy : iy + ih - midLand;          // mid-landing band (far end)
      const runY0 = entryBottom ? iy + midLand : iy + entryLand;
      const runH = ih - entryLand - midLand;
      const treads = Math.max(4, Math.round(runH / 4));
      for (let f = 0; f < 2; f++) { const fx = ix + f * half; for (let i = 1; i < treads; i++) { const ty = runY0 + (runH * i) / treads; L.push(<line key={f + "t" + i} x1={fx + 0.5} y1={ty} x2={fx + half - 0.5} y2={ty} stroke="#7d7468" strokeWidth="0.5" />); } }
      L.push(<line key="str" x1={ix + half} y1={runY0} x2={ix + half} y2={runY0 + runH} stroke={INK} strokeWidth="0.6" />);
      L.push(<line key="ar" x1={ix + half * 0.5} y1={entryBottom ? runY0 + runH - 2 : runY0 + 2} x2={ix + half * 0.5} y2={entryBottom ? runY0 + 2 : runY0 + runH - 2} stroke={INK} strokeWidth="0.8" markerEnd="url(#arr)" />);
      landRect.push(<rect key="el" x={ix} y={eLandY} width={iw} height={entryLand} fill={TINT.stair} stroke="none" />);
      landRect.push(<line key="ell" x1={ix} y1={entryBottom ? eLandY : eLandY + entryLand} x2={ix + iw} y2={entryBottom ? eLandY : eLandY + entryLand} stroke={INK} strokeWidth="0.5" strokeDasharray="2 2" />);
    } else {
      const half = ih / 2;
      const entryLeft = edge !== "right";
      const runX0 = entryLeft ? ix + entryLand : ix + midLand;
      const runW = iw - entryLand - midLand;
      const treads = Math.max(4, Math.round(runW / 4));
      for (let f = 0; f < 2; f++) { const fy = iy + f * half; for (let i = 1; i < treads; i++) { const tx = runX0 + (runW * i) / treads; L.push(<line key={f + "t" + i} x1={tx} y1={fy + 0.5} x2={tx} y2={fy + half - 0.5} stroke="#7d7468" strokeWidth="0.5" />); } }
      L.push(<line key="str" x1={runX0} y1={iy + half} x2={runX0 + runW} y2={iy + half} stroke={INK} strokeWidth="0.6" />);
      L.push(<line key="ar" x1={entryLeft ? runX0 + 2 : runX0 + runW - 2} y1={iy + half * 0.5} x2={entryLeft ? runX0 + runW - 2 : runX0 + 2} y2={iy + half * 0.5} stroke={INK} strokeWidth="0.8" markerEnd="url(#arr)" />);
      const eLandX = entryLeft ? ix : ix + iw - entryLand;
      landRect.push(<line key="ell" x1={entryLeft ? eLandX + entryLand : eLandX} y1={iy} x2={entryLeft ? eLandX + entryLand : eLandX} y2={iy + ih} stroke={INK} strokeWidth="0.5" strokeDasharray="2 2" />);
    }
    return (
      <g>
        <rect x={px} y={py} width={pw} height={ph} fill={POCHE} />
        <rect x={ix} y={iy} width={Math.max(iw, 0)} height={Math.max(ih, 0)} fill={TINT.stair} />
        {landRect}
        {L}
        {doorEdge && <Door edge={doorEdge} r={r} />}
      </g>
    );
  };

  // architectural door: a swing leaf + quarter-circle arc on the given edge of rect r
  const Door = ({ edge, r, w: dw = 3 }) => {
    const px = X(r.x), py = Y(r.y), pw = S(r.w), ph = S(r.h), d = S(dw);
    let hx, hy, lx, ly, ax, ay; // hinge, leaf-end, arc-end
    if (edge === "top") { hx = px + pw / 2 - d / 2; hy = py; lx = hx; ly = hy + d; ax = hx + d; ay = hy; }
    else if (edge === "bottom") { hx = px + pw / 2 - d / 2; hy = py + ph; lx = hx; ly = hy - d; ax = hx + d; ay = hy; }
    else if (edge === "left") { hx = px; hy = py + ph / 2 - d / 2; lx = hx + d; ly = hy; ax = hx; ay = hy + d; }
    else { hx = px + pw; hy = py + ph / 2 - d / 2; lx = hx - d; ly = hy; ax = hx; ay = hy + d; }
    const sweep = edge === "top" || edge === "right" ? 1 : 0;
    return (
      <g>
        <rect x={edge === "left" || edge === "right" ? hx - 1 : hx} y={edge === "top" || edge === "bottom" ? hy - 1 : hy} width={edge === "left" || edge === "right" ? 2 : d} height={edge === "top" || edge === "bottom" ? 2 : d} fill={SHEET} />
        <line x1={hx} y1={hy} x2={lx} y2={ly} stroke={INK} strokeWidth="0.7" />
        <path d={`M ${lx} ${ly} A ${d} ${d} 0 0 ${sweep} ${ax} ${ay}`} fill="none" stroke={INK} strokeWidth="0.4" />
      </g>
    );
  };
  // which edge of room r faces corridor rect c (shares an edge)?
  const edgeToward = (r, c) => {
    if (Math.abs(r.y - (c.y + c.h)) < 1.2 && r.x < c.x + c.w && r.x + r.w > c.x) return "top";
    if (Math.abs((r.y + r.h) - c.y) < 1.2 && r.x < c.x + c.w && r.x + r.w > c.x) return "bottom";
    if (Math.abs(r.x - (c.x + c.w)) < 1.2 && r.y < c.y + c.h && r.y + r.h > c.y) return "left";
    if (Math.abs((r.x + r.w) - c.x) < 1.2 && r.y < c.y + c.h && r.y + r.h > c.y) return "right";
    return null;
  };

  // washroom: room + fixture symbols (stalls along back wall, lavs along front)
  // washroom: stalls line the wall OPPOSITE the entry (doors face the aisle), lavs + urinals on a side
  // wall, and a clear circulation aisle along the entry — the entry door never opens into a stall.
  const Washroom = ({ r, men, entry }) => {
    const px = X(r.x) + wall, py = Y(r.y) + wall, pw = S(r.w) - wall * 2, ph = S(r.h) - wall * 2;
    const e = entry || (ph >= pw ? "left" : "bottom");
    const F = []; const sd = S(5); const run = S(3); const acc = S(5);
    const vertical = e === "left" || e === "right";
    if (vertical) {
      const stallsRight = e !== "right";                 // stalls on the wall opposite the entry
      const sx = stallsRight ? px + pw - sd : px;
      const aisleEdge = stallsRight ? sx : sx + sd;      // stall-door side faces the aisle
      let yy = py, idx = 0;
      while (yy + run <= py + ph - 1) {
        const h = idx === 0 ? acc : run; if (yy + h > py + ph) break;
        F.push(<rect key={"s" + idx} x={sx} y={yy + 0.5} width={sd} height={h - 1} fill="none" stroke={INK} strokeWidth="0.5" />);
        F.push(<rect key={"t" + idx} x={stallsRight ? sx + sd - 4.5 : sx + 1.5} y={yy + h / 2 - 2} width={3} height={4} rx={1.3} fill="none" stroke={INK} strokeWidth="0.45" />);
        F.push(<line key={"sd" + idx} x1={aisleEdge} y1={yy + 1} x2={stallsRight ? aisleEdge - 3.5 : aisleEdge + 3.5} y2={yy + h * 0.45} stroke={INK} strokeWidth="0.5" />);
        if (idx === 0) F.push(<circle key="acc" cx={sx + sd / 2} cy={yy + h / 2} r={2.4} fill="none" stroke={INK} strokeWidth="0.4" />);
        yy += h; idx++;
      }
      const lavX0 = stallsRight ? px + 1.5 : px + sd + S(2);   // lavs along the top wall over the aisle
      const lavN = Math.max(1, Math.floor((pw - sd - S(2)) / S(2.2)));
      for (let i = 0; i < lavN; i++) F.push(<rect key={"l" + i} x={lavX0 + i * S(2.2)} y={py + 1} width={S(1.6)} height={2.6} rx={1.2} fill="none" stroke={INK} strokeWidth="0.45" />);
      if (men) { const uN = Math.max(1, Math.floor((pw - sd - S(2)) / S(1.8))); for (let i = 0; i < uN; i++) F.push(<rect key={"u" + i} x={lavX0 + i * S(1.8)} y={py + ph - 4} width={2.3} height={3} rx={1.1} fill="none" stroke={INK} strokeWidth="0.45" />); }
    } else {
      const stallsTop = e !== "top";
      const sy = stallsTop ? py : py + ph - sd;
      const aisleEdge = stallsTop ? sy + sd : sy;
      let xx = px, idx = 0;
      while (xx + run <= px + pw - 1) {
        const w = idx === 0 ? acc : run; if (xx + w > px + pw) break;
        F.push(<rect key={"s" + idx} x={xx + 0.5} y={sy} width={w - 1} height={sd} fill="none" stroke={INK} strokeWidth="0.5" />);
        F.push(<rect key={"t" + idx} x={xx + w / 2 - 1.5} y={stallsTop ? sy + sd - 4.5 : sy + 1.5} width={3} height={4} rx={1.3} fill="none" stroke={INK} strokeWidth="0.45" />);
        F.push(<line key={"sd" + idx} x1={xx + 1} y1={aisleEdge} x2={xx + w * 0.45} y2={stallsTop ? aisleEdge + 3.5 : aisleEdge - 3.5} stroke={INK} strokeWidth="0.5" />);
        if (idx === 0) F.push(<circle key="acc" cx={xx + w / 2} cy={sy + sd / 2} r={2.4} fill="none" stroke={INK} strokeWidth="0.4" />);
        xx += w; idx++;
      }
      const lavY0 = stallsTop ? py + sd + S(2) : py + 1;
      const lavN = Math.max(1, Math.floor((pw - S(2)) / S(2.2)));
      for (let i = 0; i < lavN; i++) F.push(<rect key={"l" + i} x={px + 1 + i * S(2.2)} y={lavY0} width={S(1.6)} height={2.6} rx={1.2} fill="none" stroke={INK} strokeWidth="0.45" />);
    }
    const big = pw > 24 && ph > 18;
    return (
      <g>
        <rect x={X(r.x)} y={Y(r.y)} width={S(r.w)} height={S(r.h)} fill={POCHE} />
        <rect x={px} y={py} width={pw} height={ph} fill={TINT.restroom} />
        {F}
        {big && <text x={vertical ? (e === "right" ? px + pw - sd / 2 : px + sd / 2) : px + pw / 2} y={vertical ? py + ph / 2 : (e === "top" ? py + ph - 6 : py + 8)} fill={INK} fontSize="6.5" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "ui-monospace,monospace" }}>{men ? "MEN" : "WOMEN"}</text>}
      </g>
    );
  };

  // ---- structural grid + bubbles + dims (floor mode only) ----
  const gridEls = [];
  if (region === "floor" && grid) {
    grid.xs.forEach((x, i) => {
      gridEls.push(<line key={"gx" + i} x1={X(x)} y1={Y(0) - 16} x2={X(x)} y2={Y(H)} stroke={THIN} strokeWidth="0.5" strokeDasharray="3 3" />);
      gridEls.push(<circle key={"bx" + i} cx={X(x)} cy={Y(0) - 22} r="7" fill={SHEET} stroke={INK} strokeWidth="0.7" />);
      gridEls.push(<text key={"tx" + i} x={X(x)} y={Y(0) - 22} fill={INK} fontSize="7" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "ui-monospace,monospace" }}>{i + 1}</text>);
    });
    grid.ys.forEach((y, i) => {
      gridEls.push(<line key={"gy" + i} x1={X(0) - 16} y1={Y(y)} x2={X(W)} y2={Y(y)} stroke={THIN} strokeWidth="0.5" strokeDasharray="3 3" />);
      gridEls.push(<circle key={"by" + i} cx={X(0) - 22} cy={Y(y)} r="7" fill={SHEET} stroke={INK} strokeWidth="0.7" />);
      gridEls.push(<text key={"ty" + i} x={X(0) - 22} y={Y(y)} fill={INK} fontSize="7" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "ui-monospace,monospace" }}>{colLabel(i)}</text>);
    });
  }

  // facade (double line) — floor mode
  const facadeEls = region === "floor" ? (
    <g>
      <rect x={X(0)} y={Y(0)} width={S(W)} height={S(H)} fill="none" stroke={INK} strokeWidth="1.4" />
      <rect x={X(0) + 2} y={Y(0) + 2} width={S(W) - 4} height={S(H) - 4} fill="none" stroke={LINE} strokeWidth="0.5" />
    </g>
  ) : null;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ maxWidth: svgW, background: SHEET, borderRadius: 4, display: "block" }}>
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill={INK} /></marker>
      </defs>
      {facadeEls}
      {gridEls}
      {region === "floor" && grid && grid.columns.map((c, i) => (
        <rect key={"c" + i} x={X(c.xFt) - S(c.sizeFt) / 2} y={Y(c.yFt) - S(c.sizeFt) / 2} width={S(c.sizeFt)} height={S(c.sizeFt)} fill={POCHE} />
      ))}
      {/* core objects */}
      {cells.filter((c) => inView(c.rect)).map((c, i) => {
        if (c.type === "elevator") return <Elevator key={i} r={c.rect} cars={c.cars} svc={c.svc} />;
        if (c.type === "restroom") return <Washroom key={i} r={c.rect} men={c.key === "wcM"} entry={perimeterEdge(c.rect)} />;
        const label = c.rect.w * scale > 30 ? c.name : "";
        return <Room key={i} r={c.rect} fill={TINT[c.type] || TINT.support} label={label} />;
      })}
      {stairs.filter((s) => inView(s.rect)).map((s, i) => <Stair key={"st" + i} r={s.rect} doorEdge={perimeterEdge(s.rect)} />)}
      {/* washrooms open OUT to the floor: door on whichever washroom edge lies on the core's outer boundary */}
      {cells.filter((c) => c.type === "restroom" && inView(c.rect)).map((c, i) => (
        <Door key={"d" + i} edge={perimeterEdge(c.rect)} r={c.rect} />
      ))}
    </svg>
  );
}
