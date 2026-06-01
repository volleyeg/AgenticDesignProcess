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
      {(model.corridors || []).map((c, i) => { const r = rect(c.footprintFt); return (
        <rect key={"k" + i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#3a4250" fillOpacity="0.55" stroke="#4a5563" strokeWidth="0.5" />
      ); })}
      {(model.cores || []).map((c, i) => { const r = rect(c.footprintFt); return (
        <rect key={"c" + i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#586173" fillOpacity="0.5" stroke="#8aa0b8" strokeWidth="1" />
      ); })}
      {(model.cores || []).map((c, i) => { const r = rect(c.footprintFt); return (
        <text key={"ct" + i} x={r.x + r.w / 2} y={r.y + r.h / 2} fill="var(--ink)" fontSize="9" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>CORE</text>
      ); })}
      {(model.spaces || []).map((s, i) => {
        const r = rect(s.footprintFt); const col = KIND[s.kind] || KIND.support;
        const small = r.w < 34 || r.h < 22;
        return (
          <g key={i}>
            <rect x={r.x + 1} y={r.y + 1} width={r.w - 2} height={r.h - 2} fill={col} fillOpacity="0.16" stroke={col} strokeWidth="1.25" rx="2" />
            {s.daylight && <circle cx={r.x + 7} cy={r.y + 7} r="2.2" fill="var(--amber)" />}
            {!small && <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 3} fill="var(--ink)" fontSize="9" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>{s.name}</text>}
            {!small && <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 8} fill="var(--muted)" fontSize="7" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>{s.areaFt2} sf</text>}
          </g>
        );
      })}
      {(model.stairs || []).map((s, i) => { const r = rect(s.footprintFt); return (
        <g key={"s" + i}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#c98b5a" fillOpacity="0.7" stroke="#e0a96d" strokeWidth="0.75" />
          <text x={r.x + r.w / 2} y={r.y + r.h / 2} fill="#1a1208" fontSize="6.5" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>ST</text>
        </g>
      ); })}
    </svg>
  );
}
