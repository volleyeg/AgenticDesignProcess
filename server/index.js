// server/index.js
import express from "express";
import cors from "cors";
import {
  llm, sensingPrompt, interpPrompt, evalPrompt,
  localSensing, localInterp, localEval,
} from "./agents.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 8787;
const hasKey = !!process.env.ANTHROPIC_API_KEY;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, liveCapable: hasKey, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514" });
});

// Each endpoint tries the live model, falls back locally, and reports which ran.
app.post("/api/sense", async (req, res) => {
  const { brief } = req.body || {};
  if (!brief) return res.status(400).json({ error: "brief required" });
  try {
    const data = await llm(sensingPrompt(brief));
    if (!data.floorplate) throw new Error("malformed");
    res.json({ data, mode: "live" });
  } catch (e) {
    res.json({ data: localSensing(brief), mode: "local", reason: String(e.message || e) });
  }
});

app.post("/api/interpret", async (req, res) => {
  const { constraints, lessons } = req.body || {};
  if (!constraints) return res.status(400).json({ error: "constraints required" });
  try {
    const data = await llm(interpPrompt(constraints, lessons || []));
    res.json({ data, mode: "live" });
  } catch (e) {
    res.json({ data: localInterp(constraints, lessons || []), mode: "local", reason: String(e.message || e) });
  }
});

app.post("/api/evaluate", async (req, res) => {
  const { options } = req.body || {};
  if (!options) return res.status(400).json({ error: "options required" });
  try {
    const data = await llm(evalPrompt(options));
    res.json({ data, mode: "live" });
  } catch (e) {
    res.json({ data: localEval(options), mode: "local", reason: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[forge] server on :${PORT}  liveCapable=${hasKey}`);
  if (!hasKey) console.log("[forge] no ANTHROPIC_API_KEY — endpoints will return local fallback (mode:'local')");
});
