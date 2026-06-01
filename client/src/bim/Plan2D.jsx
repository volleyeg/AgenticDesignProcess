// client/src/bim/Plan2D.jsx
// 2D plan drawn FROM the BIM model (in feet) — same source of truth as the 3D view.
import React from "react";

const KIND = { work: "var(--cyan)", meet: "var(--amber)", social: "var(--green)", support: "var(--slate-z)" };

export default function Plan2D({ model, maxW = 560 }) {
  if (!model) return null;
  const b = model.bounds();
  const pad = 8;
  const scale = Math.min(12, (maxW - pad * 2) / Math.max(b.wFt, 1));
  const W = b.wFt * scale + pad * 2;
  const H = b.hFt * scale + pad * 2;
  const X = (xf) => pad + (xf - b.minX) * scale;
  const Y = (yf) => pad + (yf - b.minY) * scale;

  const rect = (fp) => {
    const xs = fp.map((p) => p[0]), ys = fp.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    return { x: X(x0), y: Y(y0), w: (x1 - x0) * scale, h: (y1 - y0) * scale };
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", maxHeight: 340 }}>
      <rect x={pad} y={pad} width={b.wFt * scale} height={b.hFt * scale} fill="none" stroke="var(--cyan)" strokeWidth="1.5" opacity="0.5" />
      {(model.cores || []).map((c, i) => { const r = rect(c.footprintFt); return (
        <rect key={"c" + i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#586173" fillOpacity="0.45" stroke="#8aa0b8" strokeWidth="1" />
      ); })}
      {(model.spaces || []).map((s, i) => {
        const r = rect(s.footprintFt); const col = KIND[s.kind] || KIND.support;
        return (
          <g key={i}>
            <rect x={r.x + 1} y={r.y + 1} width={r.w - 2} height={r.h - 2} fill={col} fillOpacity="0.16" stroke={col} strokeWidth="1.25" rx="2" />
            {s.daylight && <circle cx={r.x + 8} cy={r.y + 8} r="2.5" fill="var(--amber)" />}
            <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 3} fill="var(--ink)" fontSize="10" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>{s.name}</text>
            <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 9} fill="var(--muted)" fontSize="8" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>{s.areaFt2} sf</text>
          </g>
        );
      })}
    </svg>
  );
}
