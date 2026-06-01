// client/src/App.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Radar, Brain, Boxes, Gauge, ShieldCheck, RotateCcw, Play, Stamp,
  Sun, Layers, History, BookOpen, Trash2, ChevronRight, CircleDot, Activity, Wifi, WifiOff,
} from "lucide-react";
import { GRID, KIND_COLORS, APPROACHES, SAMPLES, generateOptions, computeMetrics } from "./solver.js";
import { buildBimModel } from "./bim/buildFromConstraints.js";
import { writeIFC } from "./bim/ifc.js";
import Viewer3D from "./bim/Viewer3D.jsx";
import Plan2D from "./bim/Plan2D.jsx";

const api = (path, body) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json());

const LS_KEY = "forge:lessons";
const loadLessons = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } };
const saveLessons = (l) => { try { localStorage.setItem(LS_KEY, JSON.stringify(l)); } catch {} };

function FloorPlan({ option, c, highlight }) {
  const fw = (option.floor && option.floor.w) || c.floorplate.w;
  const fh = (option.floor && option.floor.h) || c.floorplate.h;
  const px = Math.min(GRID, 360 / Math.max(fw, 1));
  const W = fw * px, H = fh * px;
  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="plan" style={{ maxHeight: 260, width: "100%", height: "auto", display: "block" }}>
      {Array.from({ length: fw + 1 }).map((_, i) => <line key={"v" + i} x1={i * px} y1={0} x2={i * px} y2={H} stroke="var(--line)" strokeWidth="0.5" />)}
      {Array.from({ length: fh + 1 }).map((_, i) => <line key={"h" + i} x1={0} y1={i * px} x2={W} y2={i * px} stroke="var(--line)" strokeWidth="0.5" />)}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--cyan)" strokeWidth="1.5" opacity="0.5" />
      {(option.zones || []).map((z, i) => {
        const col = KIND_COLORS[z.kind] || KIND_COLORS.default;
        const isCore = z.kind === "core";
        return (
          <g key={i} style={{ opacity: highlight ? 1 : 0.95 }}>
            <rect x={z.x * px + 1} y={z.y * px + 1} width={z.w * px - 2} height={z.h * px - 2} fill={col} fillOpacity={isCore ? 0.4 : 0.16} stroke={col} strokeWidth="1.1" rx="2" />
            {z.daylight && <Sun x={z.x * px + 4} y={z.y * px + 4} width={9} height={9} color="var(--amber)" />}
            {z.w * px > 26 && <text x={z.x * px + (z.w * px) / 2} y={z.y * px + (z.h * px) / 2} fill="var(--ink)" fontSize="8" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "var(--mono)" }}>{z.label}</text>}
          </g>
        );
      })}
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

      // 4. EVALUATION
      const er = await api("/api/evaluate", { options: opts });
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
                    <Bar label="adjacency" value={sel.metrics.adjacencyPct} color="var(--cyan)" />
                    <div className="row" style={{ justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid var(--line)" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)" }}>overlaps {sel.metrics.overlaps} · computed {sel.metrics.computedScore} + design {sel.qualScore}</span>
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
                  {bimModel.totals().levels} level · {bimModel.totals().spaces} spaces · {bimModel.totals().areaFt2.toLocaleString()} sf · seats {bimModel.totals().seats} · units: feet
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
