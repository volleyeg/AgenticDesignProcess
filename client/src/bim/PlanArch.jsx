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
  const Elevator = ({ r, cars }) => {
    const n = Math.max(1, cars || 1);
    const px = X(r.x) + wall, py = Y(r.y) + wall, pw = S(r.w) - wall * 2, ph = S(r.h) - wall * 2;
    const horiz = pw >= ph; const cw = horiz ? pw / n : pw, ch = horiz ? ph : ph / n;
    return (
      <g>
        <rect x={X(r.x)} y={Y(r.y)} width={S(r.w)} height={S(r.h)} fill={POCHE} />
        {Array.from({ length: n }).map((_, i) => {
          const bx = horiz ? px + i * cw : px, by = horiz ? py : py + i * ch;
          return (
            <g key={i}>
              <rect x={bx + 0.6} y={by + 0.6} width={cw - 1.2} height={ch - 1.2} fill={TINT.elevator} stroke={INK} strokeWidth="0.5" />
              <line x1={bx + 1.5} y1={by + 1.5} x2={bx + cw - 1.5} y2={by + ch - 1.5} stroke="#8b9097" strokeWidth="0.4" />
              <line x1={bx + cw - 1.5} y1={by + 1.5} x2={bx + 1.5} y2={by + ch - 1.5} stroke="#8b9097" strokeWidth="0.4" />
            </g>
          );
        })}
      </g>
    );
  };

  // stair: tread lines across the run + center up-arrow
  const Stair = ({ r }) => {
    const px = X(r.x), py = Y(r.y), pw = S(r.w), ph = S(r.h);
    const horiz = pw >= ph; const treads = Math.max(4, Math.round((horiz ? r.w : r.h) / 1.0));
    const lines = [];
    for (let i = 1; i < treads; i++) {
      const t = i / treads;
      if (horiz) lines.push(<line key={i} x1={px + pw * t} y1={py + wall} x2={px + pw * t} y2={py + ph - wall} stroke="#7d7468" strokeWidth="0.5" />);
      else lines.push(<line key={i} x1={px + wall} y1={py + ph * t} x2={px + pw - wall} y2={py + ph * t} stroke="#7d7468" strokeWidth="0.5" />);
    }
    return (
      <g>
        <rect x={px} y={py} width={pw} height={ph} fill={POCHE} />
        <rect x={px + wall} y={py + wall} width={Math.max(pw - wall * 2, 0)} height={Math.max(ph - wall * 2, 0)} fill={TINT.stair} />
        {lines}
        <line x1={horiz ? px + pw * 0.2 : px + pw / 2} y1={horiz ? py + ph / 2 : py + ph * 0.8} x2={horiz ? px + pw * 0.8 : px + pw / 2} y2={horiz ? py + ph / 2 : py + ph * 0.2} stroke={INK} strokeWidth="0.8" markerEnd="url(#arr)" />
        {pw > 22 && ph > 22 && <text x={px + pw / 2} y={py + ph - 5} fill={INK} fontSize="6" textAnchor="middle" style={{ fontFamily: "ui-monospace,monospace" }}>UP</text>}
      </g>
    );
  };

  // washroom: room + fixture symbols (stalls along back wall, lavs along front)
  const Washroom = ({ r, men }) => {
    const px = X(r.x) + wall, py = Y(r.y) + wall, pw = S(r.w) - wall * 2, ph = S(r.h) - wall * 2;
    const stallW = S(3), depth = S(5), nStall = Math.max(1, Math.floor(pw / stallW));
    const fixtures = [];
    for (let i = 0; i < nStall; i++) { // WC stalls along the top (back) wall
      const sx = px + i * (pw / nStall);
      fixtures.push(<rect key={"s" + i} x={sx + 1} y={py + 1} width={pw / nStall - 2} height={depth - 1} fill="none" stroke={INK} strokeWidth="0.5" />);
      fixtures.push(<rect key={"w" + i} x={sx + (pw / nStall) / 2 - 1.5} y={py + 2} width={3} height={4} rx={1.5} fill="none" stroke={INK} strokeWidth="0.5" />);
    }
    const lavN = Math.max(1, Math.floor(pw / S(2.5)));
    for (let i = 0; i < lavN; i++) { // lavs along the bottom (front) wall
      const lx = px + i * (pw / lavN) + (pw / lavN) / 2;
      fixtures.push(<circle key={"l" + i} cx={lx} cy={py + ph - 3} r={1.6} fill="none" stroke={INK} strokeWidth="0.5" />);
    }
    return (
      <g>
        <rect x={X(r.x)} y={Y(r.y)} width={S(r.w)} height={S(r.h)} fill={POCHE} />
        <rect x={px} y={py} width={pw} height={ph} fill={TINT.restroom} />
        {fixtures}
        {pw > 26 && <text x={px + pw / 2} y={py + ph / 2 + 1} fill={INK} fontSize="7" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "ui-monospace,monospace" }}>{men ? "MEN" : "WOMEN"}</text>}
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
        if (c.type === "elevator") return <Elevator key={i} r={c.rect} cars={c.cars} />;
        if (c.type === "restroom") return <Washroom key={i} r={c.rect} men={c.key === "wcM"} />;
        const label = c.rect.w * scale > 30 ? c.name : "";
        return <Room key={i} r={c.rect} fill={TINT[c.type] || TINT.support} label={label} />;
      })}
      {stairs.filter((s) => inView(s.rect)).map((s, i) => <Stair key={"st" + i} r={s.rect} />)}
    </svg>
  );
}
