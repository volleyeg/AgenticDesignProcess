// server/agents.js
// Live Claude calls (key stays server-side) + deterministic local fallbacks.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

export async function callModel(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    let t = "";
    try { t = await res.text(); } catch {}
    throw new Error("HTTP " + res.status + (t ? ": " + t.slice(0, 120) : ""));
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "api error");
  const txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!txt) throw new Error("empty response");
  return txt;
}

function extractJSON(text) {
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = Math.min(...["{", "["].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
  const last = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (first !== Infinity && last !== -1) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

export async function llm(prompt, retry = true) {
  try {
    return extractJSON(await callModel(prompt));
  } catch (e) {
    if (retry) return llm(prompt + "\n\nIMPORTANT: respond with VALID, COMPLETE, minified JSON only.", false);
    throw e;
  }
}

// ---- Prompts --------------------------------------------------------------

const lessonsBlock = (ls) =>
  ls && ls.length
    ? "Lessons from past stamped projects (apply where relevant):\n" +
      ls.map((l, i) => `${i + 1}. [${l.projectType}|${l.rating}/5] ${l.note}`).join("\n")
    : "No prior lessons yet.";

export const sensingPrompt = (brief) => `You are the SENSING layer of an agentic architectural design system. Convert this brief into structured constraints for a schematic test-fit.
BRIEF: """${brief}"""
Return ONLY minified JSON:
{"projectType":"short","floorplate":{"w":int 10-16,"h":int 7-10},"spaces":[{"id":"short_id","label":"Short Label","w":int 1-6,"h":int 1-5,"daylight":bool,"kind":"work|meet|support|social"}],"adjacencies":[{"a":"id","b":"id","weight":1-3}],"priorities":["short","short"]}
Rules: 6-9 spaces. Total space area 55-75% of floorplate (w*h). Concise ids/labels.`;

export const interpPrompt = (c, ls) => `You are the INTERPRETATION layer. Frame the design problem from these constraints and past lessons.
CONSTRAINTS: ${JSON.stringify(c)}
${lessonsBlock(ls)}
Return ONLY minified JSON: {"tensions":["up to 3 short tensions"],"strategy":"1-2 sentence strategy","appliedLessons":["which past lessons you apply, [] if none"]}`;

export const evalPrompt = (opts) => `You are the EVALUATION layer. Each option has computed spatial metrics. Give each a design-quality score 0-100 (brief alignment + spatial quality) and a one-sentence critique, then rank by overall merit.
OPTIONS: ${JSON.stringify(opts.map((o) => ({ name: o.name, rationale: o.rationale, metrics: o.metrics })))}
Return ONLY minified JSON: {"evaluations":[{"name":"...","qualScore":int,"critique":"one sentence"}],"ranking":["best-first names"]}`;

// ---- Local fallbacks ------------------------------------------------------

const KEYWORDS = [
  [/back.?of.?house|boh|service yard/, { label: "BOH / Service", w: 3, h: 2, daylight: false, kind: "support" }],
  [/desk|workstation|neighbou?rhood|open plan|team/, { label: "Workstations", w: 5, h: 3, daylight: true, kind: "work" }],
  [/conference|boardroom|large meeting/, { label: "Conference", w: 3, h: 2, daylight: false, kind: "meet" }],
  [/meeting|huddle/, { label: "Meeting Rms", w: 2, h: 2, daylight: false, kind: "meet" }],
  [/focus|quiet|library/, { label: "Focus", w: 2, h: 2, daylight: false, kind: "work" }],
  [/cafe|caf\u00e9|social|lounge|pantry|break/, { label: "Cafe / Social", w: 3, h: 3, daylight: true, kind: "social" }],
  [/wellness|mother|wellbeing|nursing/, { label: "Wellness", w: 2, h: 1, daylight: false, kind: "support" }],
  [/reception|waiting|arrival|entry|lobby|entrance/, { label: "Reception", w: 3, h: 2, daylight: true, kind: "social" }],
  [/exam/, { label: "Exam Rooms", w: 4, h: 2, daylight: false, kind: "support" }],
  [/consult|office/, { label: "Consult", w: 2, h: 2, daylight: true, kind: "meet" }],
  [/\blab\b|laboratory/, { label: "Lab", w: 2, h: 2, daylight: false, kind: "support" }],
  [/storage|stock|stockroom/, { label: "Storage", w: 2, h: 2, daylight: false, kind: "support" }],
  [/shop floor|sales floor|retail floor|main shop/, { label: "Shop Floor", w: 5, h: 4, daylight: true, kind: "work" }],
  [/gallery|feature|showcase/, { label: "Gallery", w: 3, h: 2, daylight: true, kind: "social" }],
  [/fitting/, { label: "Fitting Rms", w: 2, h: 2, daylight: false, kind: "support" }],
  [/clienteling|service bar/, { label: "Clienteling", w: 2, h: 2, daylight: false, kind: "meet" }],
];

export function localSensing(brief) {
  const b = brief.toLowerCase();
  const m = b.match(/(\d{1,2})\s*[x\u00d7]\s*(\d{1,2})/) || b.match(/(\d{1,2})\s*by\s*(\d{1,2})/);
  const w = m ? Math.max(10, Math.min(16, +m[1])) : 13;
  const h = m ? Math.max(7, Math.min(10, +m[2])) : 9;
  const spaces = []; const seen = new Set();
  KEYWORDS.forEach(([re, def], i) => {
    if (re.test(b) && !seen.has(def.label)) { seen.add(def.label); spaces.push({ id: "s" + i, ...def }); }
  });
  const fill = [
    { label: "Workstations", w: 5, h: 3, daylight: true, kind: "work" },
    { label: "Meeting Rms", w: 2, h: 2, daylight: false, kind: "meet" },
    { label: "Support", w: 2, h: 2, daylight: false, kind: "support" },
    { label: "Social", w: 3, h: 2, daylight: true, kind: "social" },
    { label: "Storage", w: 2, h: 2, daylight: false, kind: "support" },
  ];
  while (spaces.length < 5) { const f = fill[spaces.length % fill.length]; spaces.push({ id: "s" + (90 + spaces.length), ...f }); }
  const sp = spaces.slice(0, 8);
  const adj = [];
  const social = sp.find((s) => s.kind === "social"), work = sp.find((s) => s.kind === "work"), meet = sp.find((s) => s.kind === "meet");
  if (social && work) adj.push({ a: social.id, b: work.id, weight: 2 });
  if (work && meet) adj.push({ a: work.id, b: meet.id, weight: 2 });
  const projectType = /clinic|exam|patient/.test(b) ? "clinic fit-out" : /retail|shop|flagship/.test(b) ? "retail fit-out" : "workplace fit-out";
  const priorities = [];
  if (/daylight/.test(b)) priorities.push("daylight access");
  if (/collaborat|social|dwell|arrival|entry/.test(b)) priorities.push("connection at the entry");
  if (!priorities.length) priorities.push("usable area", "clear circulation");
  return { projectType, floorplate: { w, h }, spaces: sp, adjacencies: adj, priorities };
}

export function localInterp(c, ls) {
  const tensions = ["daylight vs. usable density", "open collaboration vs. focus/acoustic privacy", "arrival experience vs. floor efficiency"];
  const strategy = `Anchor the plan around ${c.priorities && c.priorities[0] ? c.priorities[0] : "the brief's priorities"}, pushing occupied spaces toward daylight while keeping support functions in the core.`;
  const appliedLessons = (ls || []).slice(0, 2).map((l) => l.note);
  return { tensions: tensions.slice(0, 3), strategy, appliedLessons };
}

export function localEval(opts) {
  const bias = { "Daylight First": 4, "Connected Core": 2, "Efficient Grid": -1 };
  const evaluations = opts.map((o) => ({
    name: o.name,
    qualScore: Math.max(40, Math.min(96, o.metrics.computedScore + (bias[o.name] || 0))),
    critique:
      o.name === "Daylight First" ? "Strong perimeter daylight; watch that core support doesn't feel landlocked."
      : o.name === "Connected Core" ? "Reads as a social, arrival-led plan; verify focus space has enough acoustic separation."
      : "Highly efficient and buildable; the experience is functional rather than expressive.",
  }));
  const ranking = [...evaluations].sort((a, b) => b.qualScore - a.qualScore).map((e) => e.name);
  return { evaluations, ranking };
}
