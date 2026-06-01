// client/src/bim/Plan2D.jsx
// 2D plan drawn FROM the BIM model (in feet) — same source of truth as the 3D view.
import React from "react";

const KIND = { work: "var(--cyan)", meet: "var(--amber)", social: "var(--green)", support: "var(--slate-z)",
  elevator: "#7c8aa0", lobby: "#5a6b82", restroom: "#4a8fb0", shaft: "#6a5f7a", lactation: "#7aa06a" };

export default function Plan2D({ model, maxW = 560, labels = true }) {
  if (!model) return null;
  const b = model.bounds();
  const pad = 8;
  const scale = Math.min(12, (maxW - pad * 2) / Math.max(b.wFt, 1));
  const W = b.wFt * scale + pad * 2;
  const H = b.hFt * scale + pad * 2;
  const X = (xf) => pad + (xf - b.minX) * scale;
  const Y = (yf) => pad + (yf - b.minY) * scale;
  const solid = !labels; // shell mode: read components as solid color blocks, key them in the legend

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
      {!solid && (model.cores || []).map((c, i) => { const r = rect(c.footprintFt); return (
        <text key={"ct" + i} x={r.x + r.w / 2} y={r.y + r.h / 2} fill="var(--ink)" fontSize="9" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>CORE</text>
      ); })}
      {(model.spaces || []).map((s, i) => {
        const r = rect(s.footprintFt); const col = KIND[s.kind] || KIND.support;
        const small = r.w < 34 || r.h < 22;
        return (
          <g key={i}>
            <rect x={r.x + 0.5} y={r.y + 0.5} width={Math.max(r.w - 1, 0)} height={Math.max(r.h - 1, 0)} fill={col} fillOpacity={solid ? 0.7 : 0.16} stroke={col} strokeWidth={solid ? 0.6 : 1.25} rx={solid ? 0 : 2} />
            {!solid && s.daylight && <circle cx={r.x + 7} cy={r.y + 7} r="2.2" fill="var(--amber)" />}
            {!solid && !small && <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 3} fill="var(--ink)" fontSize="9" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>{s.name}</text>}
            {!solid && !small && <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 8} fill="var(--muted)" fontSize="7" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>{s.areaFt2} sf</text>}
          </g>
        );
      })}
      {(model.stairs || []).map((s, i) => { const r = rect(s.footprintFt); return (
        <g key={"s" + i}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#c98b5a" fillOpacity="0.7" stroke="#e0a96d" strokeWidth="0.75" />
          <text x={r.x + r.w / 2} y={r.y + r.h / 2} fill="#1a1208" fontSize="6.5" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>ST</text>
        </g>
      ); })}
      {model.facade && (() => {
        const fx = (xf) => pad + (xf - b.minX) * scale, fy = (yf) => pad + (yf - b.minY) * scale;
        const t = 3; // mullion tick length
        return (
          <g>
            {model.facade.mullionsX.map((x, i) => (<g key={"mx" + i}>
              <line x1={fx(x)} y1={fy(0)} x2={fx(x)} y2={fy(0) + t} stroke="#6b7689" strokeWidth="0.6" />
              <line x1={fx(x)} y1={fy(model.facade.H)} x2={fx(x)} y2={fy(model.facade.H) - t} stroke="#6b7689" strokeWidth="0.6" />
            </g>))}
            {model.facade.mullionsY.map((y, i) => (<g key={"my" + i}>
              <line x1={fx(0)} y1={fy(y)} x2={fx(0) + t} y2={fy(y)} stroke="#6b7689" strokeWidth="0.6" />
              <line x1={fx(model.facade.W)} y1={fy(y)} x2={fx(model.facade.W) - t} y2={fy(y)} stroke="#6b7689" strokeWidth="0.6" />
            </g>))}
          </g>
        );
      })()}
      {(model.columns || []).map((c, i) => { const x = pad + (c.xFt - b.minX) * scale, y = pad + (c.yFt - b.minY) * scale, s = Math.max(2, c.sizeFt * scale); return (
        <rect key={"col" + i} x={x - s / 2} y={y - s / 2} width={s} height={s} fill="#8aa0b8" fillOpacity="0.8" />
      ); })}
    </svg>
  );
}
