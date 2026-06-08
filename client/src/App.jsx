// client/src/App.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Radar, Brain, Boxes, Gauge, ShieldCheck, RotateCcw, Play, Stamp,
  Sun, Layers, History, BookOpen, Trash2, ChevronRight, CircleDot, Activity, Wifi, WifiOff,
} from "lucide-react";
import { GRID, KIND_COLORS, APPROACHES, SAMPLES, generateOptions, computeMetrics } from "./solver.js";
import { generateShell } from "./bim/shellgen.js";
import { planTenants } from "./bim/tenantPlan.js";
import { buildShellModel } from "./bim/buildShell.js";
import { buildBimModel } from "./bim/buildFromConstraints.js";
import { writeIFC } from "./bim/ifc.js";
import Viewer3D from "./bim/Viewer3D.jsx";
import Plan2D from "./bim/Plan2D.jsx";
import PlanArch from "./bim/PlanArch.jsx";

const api = (path, body) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json());

const LS_KEY = "forge:lessons";
const loadLessons = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } };
const saveLessons = (l) => { try { localStorage.setItem(LS_KEY, JSON.stringify(l)); } catch {} };

function FloorPlan({ option, c, highlight }) {
  const p = option.plan;
  if (!p) return null;
  const pad = 2;
  const px = Math.min(6, 360 / Math.max(p.W, 1));
  const W = p.W * px + pad * 2, H = p.H * px + pad * 2;
  const R = (z) => ({ x: pad + z.x * px, y: pad + z.y * px, w: z.w * px, h: z.h * px });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="plan" style={{ maxHeight: 260, width: "100%", height: "auto", display: "block", opacity: highlight ? 1 : 0.95 }}>
      <rect x={pad} y={pad} width={p.W * px} height={p.H * px} fill="none" stroke="var(--cyan)" strokeWidth="1.2" opacity="0.5" />
      {p.corridors.map((z, i) => { const r = R(z); return <rect key={"k" + i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#3a4250" fillOpacity="0.55" stroke="none" />; })}
      {[p.core].map((z, i) => { const r = R(z); return <rect key={"c" + i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#586173" fillOpacity="0.5" stroke="#8aa0b8" strokeWidth="0.8" />; })}
      {p.rooms.map((z, i) => {
        const r = R(z); const col = KIND_COLORS[z.kind] || KIND_COLORS.default;
        return (
          <g key={i}>
            <rect x={r.x + 0.5} y={r.y + 0.5} width={Math.max(r.w - 1, 0)} height={Math.max(r.h - 1, 0)} fill={col} fillOpacity="0.16" stroke={col} strokeWidth="0.9" />
            {z.daylight && <circle cx={r.x + 3} cy={r.y + 3} r="1.5" fill="var(--amber)" />}
          </g>
        );
      })}
      {p.stairs.map((z, i) => { const r = R(z); return <rect key={"s" + i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#c98b5a" fillOpacity="0.75" stroke="none" />; })}
    </svg>
  );
}

const STAGES = [
  { key: "sensing", label: "Sensing", icon: Radar, desc: "brief → constraints" },
  { key: "interpretation", label: "Interpretation", icon: Brain, desc: "frame + recall" },
  { key: "generation", label: "Generation", icon: Boxes, desc: "3 solver strategies" },
  { key: "evaluation", label: "Evaluation", icon: Gauge, desc: "score + rank" },
];

function StageNode({ stage, status }) {
  const Icon = stage.icon;
  const color = status === "done" ? "var(--green)" : status === "running" ? "var(--cyan)" : "var(--muted)";
  return (
    <div className="stage">
      <div className="stage-ico" style={{ border: `1px solid ${color}`, background: status === "idle" ? "transparent" : "color-mix(in srgb," + color + " 12%, transparent)", boxShadow: status === "running" ? `0 0 18px -2px ${color}` : "none" }}>
        <Icon size={17} color={color} className={status === "running" ? "pulse" : ""} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="ellip" style={{ fontFamily: "var(--mono)", fontSize: 11, color }}>{stage.label}</div>
        <div className="ellip" style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)" }}>{stage.desc}</div>
      </div>
    </div>
  );
}

const Bar = ({ label, value, color }) => (
  <div className="bar-row">
    <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", width: 64 }}>{label}</span>
    <div className="bar-track"><div className="bar-fill" style={{ width: `${value}%`, background: color }} /></div>
    <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink)", width: 30, textAlign: "right" }}>{value}%</span>
  </div>
);

const Panel = ({ title, icon: Icon, accent, children, right }) => (
  <div className="panel">
    <div className="panel-head">
      <div className="row gap8">
        {Icon && <Icon size={13} color={accent || "var(--cyan)"} />}
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--ink)" }}>{title.toUpperCase()}</span>
      </div>
      {right}
    </div>
    <div className="panel-body">{children}</div>
  </div>
);

export default function App() {
  const [brief, setBrief] = useState(SAMPLES[0].text);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState({ sensing: "idle", interpretation: "idle", generation: "idle", evaluation: "idle" });
  const [constraints, setConstraints] = useState(null);
  const [interp, setInterp] = useState(null);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rating, setRating] = useState(4);
  const [note, setNote] = useState("");
  const [stamped, setStamped] = useState(false);
  const [lessons, setLessons] = useState(loadLessons());
  const [recalled, setRecalled] = useState(0);
  const [audit, setAudit] = useState([]);
  const [runCount, setRunCount] = useState(0);
  const [mode, setMode] = useState(null);
  const [diag, setDiag] = useState("");
  const [viewMode, setViewMode] = useState("2d");
  const [shellInputs, setShellInputs] = useState({ areaFt2: 25000, aspect: 1.6, coreType: "central", corePosition: "center", stories: 12, program: "office" });
  const [tenants, setTenants] = useState(1);
  const [shellView, setShellView] = useState("2d");

  useEffect(() => { setRunCount(parseInt(localStorage.getItem("forge:runs") || "0")); }, []);

  const log = (layer, summary) => setAudit((a) => [...a, { ts: Date.now(), layer, summary }]);

  async function run() {
    setRunning(true); setDiag(""); setMode(null);
    setConstraints(null); setInterp(null); setOptions([]); setSelected(null); setStamped(false); setNote("");
    setStatus({ sensing: "running", interpretation: "idle", generation: "idle", evaluation: "idle" });

    const recall = lessons.slice(0, 5); setRecalled(recall.length);
    if (recall.length) log("Learning", `recalled ${recall.length} lesson(s) from memory`);
    let anyLocal = false;

    try {
      // 1. SENSING
      log("Sensing", "parsing brief → structured constraints");
      const s = await api("/api/sense", { brief });
      const c = s.data; if (s.mode === "local") { anyLocal = true; setDiag(`sense: local fallback (${s.reason || "n/a"})`); }
      setConstraints(c);
      setStatus((x) => ({ ...x, sensing: "done", interpretation: "running" }));
      log("Sensing", `${(c.spaces || []).length} spaces · ${c.floorplate.w}×${c.floorplate.h} floorplate`);

      // 2. INTERPRETATION
      const ir = await api("/api/interpret", { constraints: c, lessons: recall });
      const ip = ir.data; if (ir.mode === "local") anyLocal = true;
      setInterp(ip);
      setStatus((x) => ({ ...x, interpretation: "done", generation: "running" }));
      log("Interpretation", (ip.strategy || "framed").slice(0, 70));
      if (ip.appliedLessons && ip.appliedLessons.length) log("Interpretation", `applied ${ip.appliedLessons.length} past lesson(s)`);

      // 3. GENERATION (deterministic solver, local)
      let opts = generateOptions(c).map((o) => ({ ...o, metrics: computeMetrics(o, c) }));
      setStatus((x) => ({ ...x, generation: "done", evaluation: "running" }));
      log("Generation", "3 schemes placed by solver + metrics computed");

      // 4. EVALUATION (send only light fields, not the full plan geometry)
      const lightOpts = opts.map((o) => ({ name: o.name, rationale: o.rationale, metrics: o.metrics }));
      const er = await api("/api/evaluate", { options: lightOpts });
      const ev = er.data; if (er.mode === "local") anyLocal = true;
      const em = {}; (ev.evaluations || []).forEach((e) => (em[e.name] = e));
      opts = opts.map((o) => { const e = em[o.name] || { qualScore: 70, critique: "—" }; return { ...o, qualScore: e.qualScore, critique: e.critique, total: Math.round(0.45 * e.qualScore + 0.55 * o.metrics.computedScore) }; });
      opts.sort((a, b) => b.total - a.total);
      setOptions(opts); setSelected(opts[0]?.name || null);
      setStatus((x) => ({ ...x, evaluation: "done" }));
      log("Evaluation", `ranked; lead "${opts[0].name}" (${opts[0].total}/100)`);

      setMode(anyLocal ? "LOCAL" : "LIVE");
    } catch (e) {
      setDiag("Network error reaching the backend. Is the server running on :8787?");
      setStatus((x) => { const n = { ...x }; Object.keys(n).forEach((k) => { if (n[k] === "running") n[k] = "idle"; }); return n; });
    } finally {
      const nrc = (parseInt(localStorage.getItem("forge:runs") || "0") + 1);
      localStorage.setItem("forge:runs", String(nrc)); setRunCount(nrc);
      setRunning(false);
    }
  }

  function stamp() {
    const opt = options.find((o) => o.name === selected); if (!opt) return;
    const lesson = { ts: Date.now(), projectType: constraints?.projectType || "project", rating, note: note.trim() || `Approved "${opt.name}": ${opt.rationale}`, winner: opt.name };
    const next = [lesson, ...lessons]; setLessons(next); saveLessons(next); setStamped(true);
    log("Governance", `human curator STAMPED "${opt.name}" · ${rating}/5 · accountability retained`);
  }

  function resetMemory() { setLessons([]); saveLessons([]); log("Learning", "memory cleared"); }

  const sel = options.find((o) => o.name === selected);
  const bimModel = useMemo(
    () => (sel && constraints ? buildBimModel(constraints, sel) : null),
    [constraints, selected, options]
  );

  const shell = useMemo(() => { try { return generateShell({ ...shellInputs, sprinklered: true }); } catch { return null; } }, [shellInputs]);
  const tenantPlan = useMemo(() => { try { return shell && shell.core ? planTenants({ W: shell.W, H: shell.H, core: shell.core, tenants, stairs: shell.core.stairCells || [] }) : null; } catch { return null; } }, [shell, tenants]);
  const shellModel = useMemo(() => (shell ? buildShellModel(shell) : null), [shell]);

  function downloadShellIFC() {
    if (!shellModel) return;
    const blob = new Blob([writeIFC(shellModel)], { type: "application/x-step" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (shellModel.meta.name || "shell").replace(/[^a-z0-9]+/gi, "_") + ".ifc";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function downloadIFC() {
    if (!bimModel) return;
    const text = writeIFC(bimModel);
    const blob = new Blob([text], { type: "application/x-step" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (bimModel.meta.name || "model").replace(/[^a-z0-9]+/gi, "_") + ".ifc";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    log("Export", `IFC written — ${bimModel.totals().spaces} spaces, ${bimModel.totals().areaFt2} sf`);
  }

  return (
    <div className="app">
      <div className="wrap">
        <div className="bp-bg" />

        <header>
          <div className="row gap8" style={{ marginBottom: 4 }}>
            <Layers size={16} color="var(--cyan)" />
            <span className="kicker">GENSLER FORGE · CONSOLE</span>
            {mode && (
              <span className="badge" style={{ color: mode === "LIVE" ? "var(--green)" : "var(--amber)", borderColor: mode === "LIVE" ? "var(--green)" : "var(--amber)" }}>
                {mode === "LIVE" ? <Wifi size={9} /> : <WifiOff size={9} />}{mode === "LIVE" ? "LIVE AGENTS" : "LOCAL ENGINE"}
              </span>
            )}
          </div>
          <h1>Design Intelligence Console</h1>
          <p className="sub">A nested, self-learning agentic flow for the test-fit / feasibility workflow. Live agents reason about the brief (key stays server-side); a deterministic solver places the geometry; a licensed human curates and stamps; lessons persist and are recalled on every later run.</p>
        </header>

        <div className="gov">
          <div className="row gap6" style={{ marginBottom: 12 }}>
            <ShieldCheck size={12} color="var(--amber)" />
            <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--amber)" }}>GOVERN &amp; ASSURE — every call logged · human stamps · memory versioned</span>
          </div>
          <div className="pipeline">
            {STAGES.map((st, i) => (
              <React.Fragment key={st.key}>
                <StageNode stage={st} status={status[st.key]} />
                {i < STAGES.length - 1 && <ChevronRight size={14} color="var(--line)" style={{ flexShrink: 0 }} />}
              </React.Fragment>
            ))}
          </div>
          <div className="row gap6" style={{ marginTop: 4 }}>
            <RotateCcw size={10} color="var(--green)" />
            <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)" }}>learning loop · {lessons.length} lesson(s) · {runCount} run(s){recalled > 0 && running ? ` · recalling ${recalled}` : ""}</span>
          </div>
        </div>

        <Panel
          title="Building Shell" icon={Boxes} accent="var(--cyan)"
          right={
            <div className="row gap6">
              <button onClick={() => setShellView("2d")} className="chip" style={{ borderColor: shellView === "2d" ? "var(--cyan)" : "var(--line)", color: shellView === "2d" ? "var(--cyan)" : "var(--muted)" }}>2D</button>
              <button onClick={() => setShellView("3d")} className="chip" style={{ borderColor: shellView === "3d" ? "var(--cyan)" : "var(--line)", color: shellView === "3d" ? "var(--cyan)" : "var(--muted)" }}>3D</button>
            </div>
          }
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>
            Rule-based shell — the real foundation (structural grid, curtain wall, and a code-sized core) the space plan snaps to. Every value comes from the editable North America rule pack, nothing hardcoded.
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <label className="sfield">floor area (sf)
              <input type="number" step="1000" value={shellInputs.areaFt2} onChange={(e) => setShellInputs((s) => ({ ...s, areaFt2: Math.max(2000, +e.target.value || 0) }))} className="sinp" />
            </label>
            <label className="sfield">aspect (w:h)
              <input type="number" step="0.1" min="1" max="3" value={shellInputs.aspect} onChange={(e) => setShellInputs((s) => ({ ...s, aspect: Math.min(3, Math.max(1, +e.target.value || 1)) }))} className="sinp" />
            </label>
            <label className="sfield">stories
              <input type="number" step="1" min="1" max="80" value={shellInputs.stories} onChange={(e) => setShellInputs((s) => ({ ...s, stories: Math.max(1, +e.target.value || 1) }))} className="sinp" />
            </label>
            <label className="sfield">program
              <select value={shellInputs.program} onChange={(e) => setShellInputs((s) => ({ ...s, program: e.target.value }))} className="sinp">
                <option value="office">office</option><option value="lab">lab</option><option value="residential">residential</option><option value="hotel">hotel</option><option value="healthcare">healthcare</option>
              </select>
            </label>
            <label className="sfield">core type
              <select value={shellInputs.coreType} onChange={(e) => setShellInputs((s) => ({ ...s, coreType: e.target.value }))} className="sinp">
                <option value="central">central</option><option value="side">side</option><option value="end">end</option><option value="double">double</option>
              </select>
            </label>
            <label className="sfield">core position
              <select value={shellInputs.corePosition} onChange={(e) => setShellInputs((s) => ({ ...s, corePosition: e.target.value }))} className="sinp">
                <option value="center">center</option><option value="north">north</option><option value="south">south</option><option value="east">east</option><option value="west">west</option>
              </select>
            </label>
            <label className="sfield">tenants
              <select value={tenants} onChange={(e) => setTenants(+e.target.value)} className="sinp">
                <option value={1}>1 — full floor</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
              </select>
            </label>
          </div>

          {shell && shellModel && (
            <>
              <div style={{ padding: 6, background: "var(--panel)", borderRadius: 6 }}>
                {shellView === "3d" ? <Viewer3D model={shellModel} /> : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: "1 1 380px", minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>TYPICAL FLOOR PLAN</div>
                      <PlanArch shell={shell} region="floor" maxW={560} tenants={tenants} plan={tenantPlan} />
                      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                        {tenants === 1 ? "single tenant — no public corridor; egress to both stairs runs through the suite" : `${tenants} tenants — minimal corridor (lobby is the pass-through); doors hard against the lift lobby`}
                        {tenantPlan && tenantPlan.notes.slice(0, 4).map((n, i) => <div key={i} style={{ color: "var(--muted)" }}>· {n}</div>)}
                      </div>
                    </div>
                    <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>CORE — ENLARGED</div>
                      <PlanArch shell={shell} region="core" maxW={420} />
                    </div>
                  </div>
                )}
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: "6px 14px", marginTop: 10 }}>
                {(() => {
                  const COL = { elevator: "#7c8aa0", lobby: "#5a6b82", restroom: "#4a8fb0", shaft: "#6a5f7a", lactation: "#7aa06a" };
                  const NAME = { elevator: "Elevator bank", lobby: "Lift lobby", restroom: "Washrooms (M/W)", shaft: "MEP / risers / IDF", lactation: "Lactation" };
                  const groups = {};
                  for (const c of shell.core.components) {
                    const a = c.rect.w * c.rect.h;
                    groups[c.type] = groups[c.type] || { n: 0, area: 0 };
                    groups[c.type].n++; groups[c.type].area += a;
                  }
                  const items = Object.keys(NAME).filter((k) => groups[k]).map((k) => (
                    <span key={k} className="row gap6" style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--muted)" }}>
                      <span style={{ width: 11, height: 11, background: COL[k], borderRadius: 2, display: "inline-block" }} />
                      {NAME[k]} <span style={{ color: "#5a6470" }}>· {Math.round(groups[k].area).toLocaleString()} sf</span>
                    </span>
                  ));
                  items.push(
                    <span key="st" className="row gap6" style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--muted)" }}>
                      <span style={{ width: 11, height: 11, background: "#c98b5a", borderRadius: 2, display: "inline-block" }} /> Egress stairs · {shell.core.stairs.length}
                    </span>,
                    <span key="col" className="row gap6" style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--muted)" }}>
                      <span style={{ width: 11, height: 11, background: "#8aa0b8", borderRadius: 2, display: "inline-block" }} /> Columns · {shell.grid.bayFt}ft bay
                    </span>,
                    <span key="cw" className="row gap6" style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--muted)" }}>
                      <span style={{ width: 11, height: 11, border: "1px solid #6b7689", borderRadius: 2, display: "inline-block" }} /> Curtain wall · {shell.facade.moduleFt}ft module
                    </span>
                  );
                  return items;
                })()}
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 14, marginTop: 10, fontFamily: "var(--mono)", fontSize: 10 }}>
                <span style={{ color: "var(--ink)" }}>{shell.W}×{shell.H} ft{shell.highRise ? " · high-rise" : ""}</span>
                <span style={{ color: "var(--muted)" }}>core <b style={{ color: "var(--cyan)" }}>{shell.core.areaPct}%</b></span>
                <span style={{ color: "var(--muted)" }}>efficiency <b style={{ color: "var(--green)" }}>{shell.efficiency}%</b></span>
                <span style={{ color: "var(--muted)" }}>occ/floor {shell.occupantLoad}</span>
                <span style={{ color: "var(--muted)" }}>elevators <b style={{ color: "var(--ink)" }}>{shell.elevators.passengerCars}</b> pax in {shell.elevators.numZones}z{shell.elevators.skyLobby ? " +sky" : ""} · +{shell.elevators.freight}frt +{shell.elevators.fireService}fs @ {shell.elevators.speedFpm}fpm</span>
                <span style={{ color: "var(--muted)" }}>stairs {shell.egress.stairsRequired} · sep {shell.egress.separationActualFt}/{shell.egress.separationRequiredFt}ft {shell.egress.ok ? "✓" : "✗"}</span>
                <span style={{ color: "var(--muted)" }}>travel {shell.egress.travelWorstFt}/{shell.egress.travelMaxFt}ft {shell.egress.travelOk ? "✓" : "✗"} · dead-end ≤{shell.egress.deadEndMaxFt}ft · common path ≤{shell.egress.commonPathMaxFt}ft</span>
                <span style={{ color: "var(--muted)" }}>WC {shell.restrooms.wcPerSex}/sex · lav {shell.restrooms.lavPerSex}/sex</span>
                <span style={{ color: shell.feasible ? "var(--green)" : "var(--amber)" }}>grammar {shell.feasible ? "valid ✓" : "check ⚠"}</span>
              </div>
              {shell.flags.length > 0 && (
                <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 9, color: "var(--amber)" }}>
                  {shell.flags.map((f, i) => <div key={i}>⚠ {f}</div>)}
                </div>
              )}
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={downloadShellIFC} className="run" style={{ background: "var(--cyan)", color: "#04222b", padding: "6px 12px" }}>
                  <Boxes size={13} /> EXPORT SHELL IFC
                </button>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Project Brief" icon={BookOpen}>
          <div className="chips">{SAMPLES.map((s) => <button key={s.tag} className="chip" onClick={() => setBrief(s.text)}>{s.tag}</button>)}</div>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} className="ta" />
          <div className="row gap8" style={{ marginTop: 8 }}>
            <button onClick={run} disabled={running} className="run">
              {running ? <Activity size={14} className="pulse" /> : <Play size={14} />}{running ? "RUNNING…" : "RUN DESIGN FLOW"}
            </button>
            {lessons.length > 0 && <button onClick={resetMemory} className="ghost"><Trash2 size={11} /> reset memory</button>}
          </div>
          {diag && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber)", marginTop: 8 }}>{diag}</div>}
        </Panel>

        {interp && (
          <div className="fade">
            <Panel title="Interpretation — Problem Framing" icon={Brain}>
              <div style={{ fontFamily: "var(--disp)", fontSize: 15, color: "var(--ink)", lineHeight: 1.4 }}>{interp.strategy}</div>
              {interp.tensions && interp.tensions.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>{interp.tensions.map((t, i) => <span key={i} className="tension">⚡ {t}</span>)}</div>
              )}
              {interp.appliedLessons && interp.appliedLessons.length > 0 && (
                <div className="applied"><span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--green)", letterSpacing: "0.1em" }}>APPLIED FROM MEMORY:</span>
                  <ul>{interp.appliedLessons.map((l, i) => <li key={i}>↳ {l}</li>)}</ul>
                </div>
              )}
            </Panel>
          </div>
        )}

        {options.length > 0 && (
          <div className="fade">
            <Panel title="Generated Schemes — Ranked" icon={Boxes}>
              <div className="scheme-grid">
                {options.map((o, i) => {
                  const isSel = o.name === selected;
                  return (
                    <button key={o.name} onClick={() => { setSelected(o.name); setStamped(false); }} className="scheme" style={{ borderColor: isSel ? "var(--cyan)" : "var(--line)", background: isSel ? "color-mix(in srgb,var(--cyan) 7%,transparent)" : "var(--panel-2)", boxShadow: isSel ? "0 0 16px -4px var(--cyan)" : "none" }}>
                      <div className="scheme-head"><span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink)" }}>{i === 0 ? "★ " : ""}{o.name}</span><span style={{ fontFamily: "var(--mono)", fontSize: 12, color: i === 0 ? "var(--green)" : "var(--muted)" }}>{o.total}</span></div>
                      <div style={{ padding: 6, background: "var(--panel)" }}>{constraints && <FloorPlan option={o} c={constraints} highlight={isSel} />}</div>
                    </button>
                  );
                })}
              </div>
              {sel && (
                <div className="detail">
                  <div>
                    <div style={{ fontFamily: "var(--disp)", fontSize: 16, color: "var(--ink)" }}>{sel.name}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{sel.rationale}</div>
                    <div className="critique"><span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--amber)", letterSpacing: "0.1em" }}>AGENT CRITIQUE</span><div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink)", marginTop: 3 }}>{sel.critique}</div></div>
                  </div>
                  <div className="bars">
                    <Bar label="design Q" value={sel.qualScore} color="var(--amber)" />
                    <Bar label="utilization" value={sel.metrics.utilization} color="var(--cyan)" />
                    <Bar label="daylight" value={sel.metrics.daylightPct} color="var(--green)" />
                    <Bar label="circulation" value={sel.metrics.circulationPct} color="var(--slate-z)" />
                    <div className="row" style={{ justifyContent: "space-between", paddingTop: 2 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)" }}>corridor type</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--cyan)" }}>{sel.metrics.classification} · {sel.plan ? `${sel.plan.W}×${sel.plan.H} ft` : ""}</span>
                    </div>
                    <div className="row" style={{ justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid var(--line)" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)" }}>computed {sel.metrics.computedScore} + design {sel.qualScore}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--green)" }}>→ {sel.total}</span>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        )}

        {bimModel && (
          <div className="fade">
            <Panel
              title="BIM Model" icon={Boxes} accent="var(--green)"
              right={
                <div className="row gap6">
                  <button onClick={() => setViewMode("2d")} className="chip" style={{ borderColor: viewMode === "2d" ? "var(--cyan)" : "var(--line)", color: viewMode === "2d" ? "var(--cyan)" : "var(--muted)" }}>2D</button>
                  <button onClick={() => setViewMode("3d")} className="chip" style={{ borderColor: viewMode === "3d" ? "var(--cyan)" : "var(--line)", color: viewMode === "3d" ? "var(--cyan)" : "var(--muted)" }}>3D</button>
                </div>
              }
            >
              {viewMode === "2d" ? <Plan2D model={bimModel} /> : <Viewer3D model={bimModel} />}
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>
                  {bimModel.totals().levels} level · {bimModel.totals().spaces} rooms · {bimModel.totals().corridors} corridors · {bimModel.totals().stairs} stairs · {bimModel.totals().areaFt2.toLocaleString()} sf · seats {bimModel.totals().seats}
                </span>
                <button onClick={downloadIFC} className="run" style={{ background: "var(--green)", color: "#05291a", padding: "6px 12px" }}>
                  <Boxes size={13} /> EXPORT IFC
                </button>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", marginTop: 6 }}>
                One model, three views: this 2D plan, the 3D scene, and the exported .ifc are all rendered from the same BIM model. Open the .ifc in Revit or any IFC viewer.
              </div>
            </Panel>
          </div>
        )}

        {options.length > 0 && (
          <div className="fade">
            <Panel title="Human Review Gate" icon={Stamp} accent="var(--amber)">
              {!stamped ? (
                <>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>The accountable human curates the agents' output. Your rating + critique become a durable lesson recalled on the next run. (Agents never stamp — the licensed reviewer does.)</p>
                  <div className="row gap6" style={{ marginTop: 10 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>rating</span>
                    {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setRating(n)} className="star"><CircleDot size={16} color={n <= rating ? "var(--amber)" : "var(--line)"} fill={n <= rating ? "var(--amber)" : "none"} /></button>)}
                  </div>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder='e.g. "co-CEOs want a bolder arrival moment and more social space at the entry"' className="note" />
                  <button onClick={stamp} className="stamp"><Stamp size={14} /> STAMP &amp; APPROVE "{selected}"</button>
                </>
              ) : (
                <div className="row gap8" style={{ alignItems: "flex-start" }}>
                  <ShieldCheck size={18} color="var(--green)" style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--green)" }}>Stamped. Lesson written to memory.</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Run the flow again — Interpretation will recall and apply this lesson.</div>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        )}

        <div className="two-col">
          <Panel title="Learning Memory" icon={RotateCcw} accent="var(--green)" right={<span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>{lessons.length}</span>}>
            {lessons.length === 0 ? <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>No lessons yet. Stamp a scheme to teach the system. Memory persists in your browser.</div> : (
              <div className="scroll">{lessons.map((l) => (
                <div key={l.ts} className="lesson"><div className="row" style={{ justifyContent: "space-between" }}><span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--cyan)" }}>{l.projectType}</span><span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--amber)" }}>{l.rating}/5</span></div><div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink)", marginTop: 2 }}>{l.note}</div></div>
              ))}</div>
            )}
          </Panel>
          <Panel title="Audit Trail" icon={History}>
            {audit.length === 0 ? <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>Every agent call and human action is logged here.</div> : (
              <div className="scroll">{audit.slice().reverse().map((a, i) => (
                <div key={i} className="row gap8" style={{ alignItems: "flex-start" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", width: 58, flexShrink: 0 }}>{new Date(a.ts).toLocaleTimeString([], { hour12: false })}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--cyan)", width: 78, flexShrink: 0 }}>{a.layer}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink)" }}>{a.summary}</span>
                </div>
              ))}</div>
            )}
          </Panel>
        </div>

        <div className="foot">PROTOTYPE · LIVE AGENTS REASON (KEY SERVER-SIDE) · DETERMINISTIC SOLVER PLACES GEOMETRY · ZONING-LEVEL (NOT BIM)</div>
      </div>
    </div>
  );
}
