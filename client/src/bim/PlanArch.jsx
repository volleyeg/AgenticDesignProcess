// client/src/bim/PlanArch.jsx
// Architectural plan renderer (image-4 quality): draws the plate on a drawing-sheet ground —
// poché core walls, elevator car boxes, stair treads + up arrow, washroom fixture symbols,
// door swings, columns as solid squares on a dimensioned grid with gridline bubbles, room labels.
// Two modes: full floor (region=floor) and zoomed core inset (region=core).
import React from "react";
import { planTenants } from "./tenantPlan.js";

const TINT = { // subtle room fills on the sheet so types still read
  elevator: "#e3e7ec", lobby: "#eef1f0", restroom: "#e6eef2", shaft: "#ece8ef",
  lactation: "#e8f0e6", stair: "#efe9e2", support: "#ecedee",
};
const TENANT = ["#dde6d6", "#d8e2ea", "#efe6d0", "#e4dbeb"]; // up to 4 suite fills (muted green/blue/sand/lilac)
const CORRIDOR = "#eae5d9";                                  // racetrack corridor
const SHEET = "#f5f2ea", INK = "#1f2024", POCHE = "#2b2d31", LINE = "#9aa0a6", THIN = "#c7c2b6";
const colLabel = (i) => String.fromCharCode(65 + i); // A,B,C...

export default function PlanArch({ shell, region = "floor", maxW = 720, tenants = 1, plan: planProp = null }) {
  if (!shell || !shell.core) return null;
  const { W, H, core, grid, facade } = shell;
  const cells = core.components || [];
  const stairs = core.stairCells || [];
  const corridor = cells.find((c) => c.key === "lobby")?.rect || cells.find((c) => c.type === "lobby")?.rect || null;
  const vestCells = cells.filter((c) => c.key && c.key.startsWith("svcVest"));
  const vestById = {}; vestCells.filter((v) => !v.filler).forEach((v) => { vestById[v.vestId] = v.rect; });
  const nearestVest = (r) => vestCells.length ? vestCells.map((v) => v.rect).sort((a, b) => (Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y)))[0] : null;
  const vestFor = (c) => (c.vestId != null && vestById[c.vestId]) || nearestVest(c.rect);
  const mechCells = cells.filter((c) => c.access === "mech");
  const mechByVest = {}; mechCells.forEach((c) => { const k = c.vestId != null ? c.vestId : "all"; (mechByVest[k] = mechByVest[k] || { rects: [], doorEdge: c.doorEdge }).rects.push(c.rect); });
  const bbox = (rects) => ({ x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)), w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)), h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)) });
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
  // washroom entry: prefer the core-boundary edge along the room's LONG wall (stall bank wants the long run)
  const wcEntry = (r) => {
    const b = coreBox;
    const onTop = Math.abs(r.y - b.y) < 1.2, onBot = Math.abs((r.y + r.h) - (b.y + b.h)) < 1.2;
    const onLeft = Math.abs(r.x - b.x) < 1.2, onRight = Math.abs((r.x + r.w) - (b.x + b.w)) < 1.2;
    if (r.h >= r.w) { if (onLeft) return "left"; if (onRight) return "right"; }
    else { if (onTop) return "top"; if (onBot) return "bottom"; }
    return perimeterEdge(r);
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
  const CODE = { "Supply air": "SA", "Exhaust air": "EA", "Elec riser": "ELEC", "Data riser": "DATA", "Plumb riser": "PL", "Fire riser": "FP", "Lift control": "CTRL", "Janitor / sink": "JAN", "Lactation": "LACT", "Vestibule": "VEST", "Refuge": "REF", "Press. shaft": "PRES" };
  const codeOf = (n) => CODE[n] || (n || "").split(/[ /.]+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  const Room = ({ r, fill, children, label, walls }) => {
    const px = X(r.x), py = Y(r.y), pw = S(r.w), ph = S(r.h);
    const W = walls || { top: true, bottom: true, left: true, right: true };
    const ix = px + (W.left ? wall : 0), iy = py + (W.top ? wall : 0);
    const iw = pw - (W.left ? wall : 0) - (W.right ? wall : 0), ih = ph - (W.top ? wall : 0) - (W.bottom ? wall : 0);
    const cx = px + pw / 2, cy = py + ph / 2;
    const rotate = ih > iw * 1.25;                       // tall-narrow box -> vertical text
    const along = rotate ? ih : iw, across = rotate ? iw : ih;
    let text = label || "", fs = 7;
    if (text) {
      const fits = (t, f) => t.length * f * 0.62 <= along - 3 && f <= across - 2;
      if (!fits(text, 6)) text = codeOf(label);          // shorten to a code if the full name won't fit
      fs = Math.max(4, Math.min(7, Math.min((along - 3) / Math.max(text.length * 0.62, 1), across - 2)));
    }
    return (
      <g>
        {W.left && <rect x={px} y={py} width={wall} height={ph} fill={POCHE} />}
        {W.right && <rect x={px + pw - wall} y={py} width={wall} height={ph} fill={POCHE} />}
        {W.top && <rect x={px} y={py} width={pw} height={wall} fill={POCHE} />}
        {W.bottom && <rect x={px} y={py + ph - wall} width={pw} height={wall} fill={POCHE} />}
        <rect x={ix} y={iy} width={Math.max(iw, 0)} height={Math.max(ih, 0)} fill={fill} />
        {children}
        {text && across > 6 && (
          <text x={cx} y={cy} fill={INK} fontSize={fs} textAnchor="middle" dominantBaseline="middle" transform={rotate ? `rotate(-90 ${cx} ${cy})` : undefined} style={{ fontFamily: "ui-monospace,monospace" }}>{text}</text>
        )}
      </g>
    );
  };

  // elevator bank -> individual car boxes with the shaft 'X'
  const Elevator = ({ r, cars, svc, fs, freight }) => {
    const isFreight = !!freight;
    const pax = isFreight ? 0 : Math.max(1, cars || 1), nsvc = isFreight ? Math.max(1, cars || 1) : Math.max(0, svc || 0), nfs = Math.max(0, fs || 0), n = pax + nsvc;
    const px = X(r.x) + wall, py = Y(r.y) + wall, pw = S(r.w) - wall * 2, ph = S(r.h) - wall * 2;
    const horiz = pw >= ph; const cw = horiz ? pw / n : pw, ch = horiz ? ph : ph / n;
    return (
      <g>
        <rect x={X(r.x)} y={Y(r.y)} width={S(r.w)} height={S(r.h)} fill={POCHE} />
        {Array.from({ length: n }).map((_, i) => {
          const bx = horiz ? px + i * cw : px, by = horiz ? py : py + i * ch;
          const freight = i >= pax;                       // freight/service car
          const fire = !freight && i < nfs;               // fire-service-designated passenger car
          const tag = freight ? "FRT" : fire ? "FS" : "";
          return (
            <g key={i}>
              <rect x={bx + 0.6} y={by + 0.6} width={cw - 1.2} height={ch - 1.2} fill={freight ? "#e7e3d8" : TINT.elevator} stroke={INK} strokeWidth="0.5" />
              <line x1={bx + 1.5} y1={by + 1.5} x2={bx + cw - 1.5} y2={by + ch - 1.5} stroke="#8b9097" strokeWidth="0.4" />
              <line x1={bx + cw - 1.5} y1={by + 1.5} x2={bx + 1.5} y2={by + ch - 1.5} stroke="#8b9097" strokeWidth="0.4" />
              {tag && Math.min(cw, ch) > 11 && <text x={bx + cw / 2} y={by + ch / 2} fill={INK} fontSize="5.5" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "ui-monospace,monospace" }}>{tag}</text>}
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

  // architectural door: a swing leaf + quarter-circle arc on the given edge of rect r.
  // `at` = fraction along the edge (0..1) where the door sits (default centered).
  const Door = ({ edge, r, w: dw = 3, at = 0.5 }) => {
    const px = X(r.x), py = Y(r.y), pw = S(r.w), ph = S(r.h);
    const edgePx = edge === "top" || edge === "bottom" ? pw : ph;
    const d = Math.min(S(dw), edgePx * 0.7);                         // never wider than the edge it sits on
    const tx = px + Math.max(d / 2, Math.min(pw - d / 2, pw * at));   // along-edge center (horizontal edges)
    const ty = py + Math.max(d / 2, Math.min(ph - d / 2, ph * at));   // along-edge center (vertical edges)
    let hx, hy, lx, ly, ax, ay; // hinge, leaf-end, arc-end
    if (edge === "top") { hx = tx - d / 2; hy = py; lx = hx; ly = hy + d; ax = hx + d; ay = hy; }
    else if (edge === "bottom") { hx = tx - d / 2; hy = py + ph; lx = hx; ly = hy - d; ax = hx + d; ay = hy; }
    else if (edge === "left") { hx = px; hy = ty - d / 2; lx = hx + d; ly = hy; ax = hx; ay = hy + d; }
    else { hx = px + pw; hy = ty - d / 2; lx = hx - d; ly = hy; ax = hx; ay = hy + d; }
    const sweep = edge === "top" || edge === "right" ? 0 : 1;
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

  // washroom: draws EXACTLY the required fixtures — `wc` stalls (one accessible), `lav` lavatories,
  // `urinals` (men). Fixtures run along the DEEP walls; the door opens into a clear front zone the
  // baffle screens (ADA 603.2.3). Entry is the front (S) edge; never opens onto a fixture.
  const Washroom = ({ r, men, entry = "bottom", wc = 3, lav = 3, urinals = 0 }) => {
    const px = X(r.x) + wall, py = Y(r.y) + wall, pw = S(r.w) - wall * 2, ph = S(r.h) - wall * 2;
    const clr = Math.min(S(5.5), ph * 0.42);                       // clear entry zone along the front (no fixtures)
    const fieldTop = py, fieldBot = py + ph - clr;                 // fixtures live above the clear zone
    const F = [];
    const stallDeep = S(5), accRun = S(5), stallRun = S(3), lavW = S(1.6), lavRun = S(2.5), uRun = S(2.5);  // A117.1: stall 60in deep, acc 60x60, lav/urinal 30in clear floor
    const aisleX = px + stallDeep;
    // stalls along the LEFT wall, stacked front-to-back; first stall is the accessible one
    let yy = fieldTop;
    for (let i = 0; i < wc; i++) {
      const run = i === 0 ? accRun : stallRun; if (yy + run > fieldBot + 0.5) break;
      F.push(<rect key={"s" + i} x={px + 0.5} y={yy + 0.5} width={stallDeep - 1} height={run - 1} fill="none" stroke={INK} strokeWidth="0.5" />);
      F.push(<rect key={"t" + i} x={px + stallDeep - 4.4} y={yy + run / 2 - 2} width={2.8} height={4} rx={1.2} fill="none" stroke={INK} strokeWidth="0.45" />);
      F.push(<line key={"sd" + i} x1={aisleX} y1={yy + 1} x2={aisleX - 3.4} y2={yy + run * 0.45} stroke={INK} strokeWidth="0.5" />);
      if (i === 0) F.push(<circle key="acc" cx={px + stallDeep / 2} cy={yy + run / 2} r={2.4} fill="none" stroke={INK} strokeWidth="0.4" />);
      yy += run;
    }
    // lavatories then urinals along the RIGHT wall, front-to-back (stalls on the left wall, clear zone at front)
    const lavX = px + pw - 1 - lavW;
    let ry = fieldTop + 1;
    for (let i = 0; i < lav && ry + 2.6 < fieldBot; i++) { F.push(<rect key={"l" + i} x={lavX} y={ry} width={lavW} height={2.6} rx={1.2} fill="none" stroke={INK} strokeWidth="0.45" />); ry += lavRun; }
    for (let i = 0; i < urinals && ry + 3 < fieldBot; i++) { F.push(<rect key={"u" + i} x={lavX - 0.4} y={ry} width={2.3} height={3} rx={1.1} fill="none" stroke={INK} strokeWidth="0.45" />); ry += uRun; }
    // 60in (5ft) wheelchair turning circle (A117.1 304.3) in the CLEAR AISLE between the stall wall and the
    // lav wall — clear of every fixture (it may overlap clear-floor spaces, never fixtures themselves)
    const aisleL = px + stallDeep, aisleR = px + pw - lavW - S(1.2);
    const tr = Math.min(S(2.5), (aisleR - aisleL) / 2);
    F.push(<circle key="turn" cx={(aisleL + aisleR) / 2} cy={fieldBot - tr - S(0.4)} r={tr} fill="none" stroke={INK} strokeWidth="0.35" strokeDasharray="2 2" opacity="0.5" />);
    return wcGroup(F, r, men, false, "bottom", 0.5);               // door centered on the front, into the clear zone
  };
  const wcGroup = (F, r, men, vertical, e, doorAt) => {
    const px = X(r.x) + wall, py = Y(r.y) + wall, pw = S(r.w) - wall * 2, ph = S(r.h) - wall * 2;
    const big = pw > 22 && ph > 16;
    const lx = vertical ? (e === "right" ? px + pw - 14 : px + 14) : px + pw / 2;
    const ly = vertical ? py + ph - 7 : (e === "top" ? py + ph - 7 : py + 9);
    // privacy baffle: a short free-standing screen just inside the entry; blocks the sightline from the
    // open floor (you step in and round either end) — the in-washroom vestibule the rule calls for.
    const t = Math.max(2, wall * 1.4), inset = S(3.2);
    let baffle = null;
    if (e === "bottom" || e === "top") {
      const len = Math.min(S(5.5), pw * 0.6), yS = e === "bottom" ? py + ph - inset : py + inset;
      const xC = px + Math.max(len / 2, Math.min(pw - len / 2, pw * doorAt));
      baffle = <rect x={xC - len / 2} y={yS - t / 2} width={len} height={t} fill={POCHE} stroke={INK} strokeWidth="0.4" />;
    } else {
      const len = Math.min(S(5.5), ph * 0.6), xS = e === "right" ? px + pw - inset : px + inset;
      const yC = py + Math.max(len / 2, Math.min(ph - len / 2, ph * doorAt));
      baffle = <rect x={xS - t / 2} y={yC - len / 2} width={t} height={len} fill={POCHE} stroke={INK} strokeWidth="0.4" />;
    }
    return (
      <g>
        <rect x={X(r.x)} y={Y(r.y)} width={S(r.w)} height={S(r.h)} fill={POCHE} />
        <rect x={px} y={py} width={pw} height={ph} fill={TINT.restroom} />
        {F}
        {baffle}
        <Door edge={e} r={r} at={doorAt} />
        {big && <text x={lx} y={ly} fill={INK} fontSize="6.5" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "ui-monospace,monospace" }}>{men ? "MEN" : "WOMEN"}</text>}
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

  // ---- tenant test-fit (floor mode): minimal corridor + demised suites (plan memoized in App; SSR computes) ----
  const plan = region === "floor" ? (planProp || planTenants({ W, H, core, tenants, stairs })) : null;
  const R = (r) => ({ x: X(r.x), y: Y(r.y), w: S(r.w), h: S(r.h) });
  // suite zone fills (bottom) — core + corridor get overdrawn on top so the tint shows only in leasable area
  const planFills = plan ? (
    <g>
      {plan.suites.map((s, i) => { const p = R(s.zone); return <rect key={"sz" + i} x={p.x} y={p.y} width={p.w} height={p.h} fill={TENANT[i % 4]} opacity="0.8" />; })}
      {plan.corridor.map((r, i) => { const p = R(r); return <rect key={"co" + i} x={p.x} y={p.y} width={p.w} height={p.h} fill={CORRIDOR} />; })}
    </g>
  ) : null;
  // a door leaf + swing arc on a horizontal corridor wall at (x,y); `swing` = N or S (which way it opens)
  const tenantDoor = (x0, y0, swing, key) => {
    const d = S(3.6), x = X(x0), y = Y(y0), s = swing === "N" ? -1 : 1;
    const hx = x - d / 2, hy = y, lx = hx, ly = y + s * d, ax = x + d / 2, ay = y;
    return (
      <g key={key}>
        <rect x={x - d / 2} y={y - 1.2} width={d} height={2.4} fill={SHEET} />
        <line x1={hx} y1={hy} x2={lx} y2={ly} stroke={INK} strokeWidth="0.7" />
        <path d={`M ${lx} ${ly} A ${d} ${d} 0 0 ${s > 0 ? 1 : 0} ${ax} ${ay}`} fill="none" stroke={INK} strokeWidth="0.4" />
      </g>
    );
  };
  const planOver = plan ? (
    <g>
      {/* corridor walls: a wall line on each tenant-facing (long) edge of every leg */}
      {plan.corridor.map((r, i) => {
        const p = R(r);
        return <g key={"cw" + i}>
          <line x1={p.x} y1={p.y} x2={p.x + p.w} y2={p.y} stroke={POCHE} strokeWidth="1.6" />
          <line x1={p.x} y1={p.y + p.h} x2={p.x + p.w} y2={p.y + p.h} stroke={POCHE} strokeWidth="1.6" />
        </g>;
      })}
      {/* demising walls */}
      {plan.demising.map((d, i) => <line key={"dm" + i} x1={X(d.x1)} y1={Y(d.y1)} x2={X(d.x2)} y2={Y(d.y2)} stroke={POCHE} strokeWidth="2" />)}
      {/* tenant entry / exit doors (swing per IBC 1010.1.2.1) */}
      {plan.suites.flatMap((s) => s.doors.map((dr, j) => tenantDoor(dr.x, dr.y, dr.swing, "td" + s.id + "_" + j)))}
      {/* suite labels — name, rentable area, exit count */}
      {plan.suites.map((s, i) => {
        const p = R(s.zone), midX = p.x + p.w / 2, midY = p.y + p.h * (s.zone.y < core.rect.y ? 0.28 : 0.72);
        return (
          <g key={"sl" + i}>
            <text x={midX} y={midY - 5} fill={INK} fontSize="8" fontWeight="600" textAnchor="middle" style={{ fontFamily: "ui-monospace,monospace" }}>{s.name}</text>
            <text x={midX} y={midY + 5} fill={INK} fontSize="6.5" textAnchor="middle" opacity="0.78" style={{ fontFamily: "ui-monospace,monospace" }}>{s.areaFt2.toLocaleString()} sf · {s.exitsRequired} exit{s.exitsRequired > 1 ? "s" : ""}{s.commonPathFt ? ` · cp ${s.commonPathFt}ft` : ""}</text>
          </g>
        );
      })}
    </g>
  ) : null;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ maxWidth: svgW, background: SHEET, borderRadius: 4, display: "block" }}>
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill={INK} /></marker>
      </defs>
      {planFills}
      {facadeEls}
      {gridEls}
      {region === "floor" && grid && grid.columns.map((c, i) => (
        <rect key={"c" + i} x={X(c.xFt) - S(c.sizeFt) / 2} y={Y(c.yFt) - S(c.sizeFt) / 2} width={S(c.sizeFt)} height={S(c.sizeFt)} fill={POCHE} />
      ))}
      {/* core objects. A lobby leaves an edge OPEN (no wall) where it faces the floor or meets another
          lobby — so the rotated lift lobby actually opens to the floor at its north and south ends. */}
      {(() => {
        const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1;
        const solids = cells.filter((c) => c.type !== "lobby").map((c) => c.rect).concat(stairs.map((s) => s.rect));
        const lobbyWalls = (r) => {
          const W = { top: false, bottom: false, left: false, right: false };
          for (const o of solids) {
            if (Math.abs((o.y + o.h) - r.y) < 1.2 && ov(o.x, o.x + o.w, r.x, r.x + r.w)) W.top = true;
            if (Math.abs(o.y - (r.y + r.h)) < 1.2 && ov(o.x, o.x + o.w, r.x, r.x + r.w)) W.bottom = true;
            if (Math.abs((o.x + o.w) - r.x) < 1.2 && ov(o.y, o.y + o.h, r.y, r.y + r.h)) W.left = true;
            if (Math.abs(o.x - (r.x + r.w)) < 1.2 && ov(o.y, o.y + o.h, r.y, r.y + r.h)) W.right = true;
          }
          return W;
        };
        return cells.filter((c) => inView(c.rect)).map((c, i) => {
          if (c.type === "elevator") return <Elevator key={i} r={c.rect} cars={c.cars} svc={c.svc} fs={c.fs} freight={c.freight} />;
          if (c.type === "restroom") return <Washroom key={i} r={c.rect} men={c.key === "wcM"} entry={c.entry || wcEntry(c.rect)} wc={c.wc} lav={c.lav} urinals={c.urinals} />;
          if (c.type === "lobby" && !c.vestibule) return <Room key={i} r={c.rect} fill={TINT[c.type] || TINT.support} label={c.name} walls={lobbyWalls(c.rect)} />;
          return <Room key={i} r={c.rect} fill={TINT[c.type] || TINT.support} label={c.name} />;
        });
      })()}
      {stairs.filter((s) => inView(s.rect)).map((s, i) => <Stair key={"st" + i} r={s.rect} doorEdge={perimeterEdge(s.rect)} />)}
      {/* legacy vestibule doors (other core types) */}
      {cells.filter((c) => (c.access === "shared" || c.access === "dedicated") && inView(c.rect)).map((c, i) => {
        const v = vestFor(c); const e = v ? edgeToward(c.rect, v) : null; return e ? <Door key={"dv" + i} edge={e} r={c.rect} /> : null;
      })}
      {/* BOH services + landscape edge-rooms: door to their stated edge, else to the floor (perimeter) */}
      {cells.filter((c) => (c.access === "svc" || c.access === "edge") && c.type !== "lobby" && inView(c.rect)).map((c, i) => <Door key={"de" + i} edge={c.doorEdge || perimeterEdge(c.rect)} r={c.rect} />)}
      {Object.keys(mechByVest).map((k, i) => {
        const grp = mechByVest[k]; const mr = bbox(grp.rects); const v = vestById[k];
        const e = grp.doorEdge || (v ? edgeToward(mr, v) : perimeterEdge(mr));
        return inView(mr) ? <Door key={"dm" + i} edge={e} r={mr} /> : null;
      })}
      {cells.filter((c) => c.vestibule && !c.filler && inView(c.rect)).map((v, i) => <Door key={"dvf" + i} edge={perimeterEdge(v.rect)} r={v.rect} w={4} />)}
      {planOver}
    </svg>
  );
}
