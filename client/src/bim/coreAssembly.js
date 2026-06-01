// client/src/bim/coreAssembly.js
// LAYER 1 — the core as a real assembly with a placement grammar.
// The core has a FRONT. Components carry orientation + adjacency rules:
//   - elevator bank sits BEHIND a lobby; the lobby is the active face toward usable floor
//   - elevators therefore open into the lobby, never onto glass or a blind wall
//   - opposed egress stairs are placed REMOTE from each other (pulled apart if needed)
//   - toilet rooms sit together on a stacked wet wall and may be blind (no daylight)
//   - risers / IDF / janitor / shafts may be blind (interior)
// It assembles DIFFERENTLY per typology: a side core is organized as a side core,
// not a central core shoved to an edge. Geometry is authoritative here and gauntlet-checked.
//
// All feet. Consumes the elevatoring result (Layer 2) and program profile (Layer 3).

const r1 = (n) => Math.round(n * 10) / 10;
const rectOf = (x, y, w, h) => ({ x: r1(x), y: r1(y), w: r1(w), h: r1(h) });
const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
const within = (r, W, H) => r.x >= -0.6 && r.y >= -0.6 && r.x + r.w <= W + 0.6 && r.y + r.h <= H + 0.6;

// distribute `parts` (each {key,name,type,area}) as proportional slices along an axis of a rect
function sliceBands(rect, axis, parts) {
  const total = parts.reduce((s, p) => s + p.area, 0) || 1;
  const out = []; let cur = axis === "x" ? rect.x : rect.y;
  for (const p of parts) {
    const span = (axis === "x" ? rect.w : rect.h) * (p.area / total);
    out.push({ ...p, rect: axis === "x" ? rectOf(cur, rect.y, span, rect.h) : rectOf(rect.x, cur, rect.w, span) });
    cur += span;
  }
  return out;
}

export function assembleCore({
  W, H, coreType = "central", corePosition = "center",
  elevAreaFt2, paxShaftFt = 8, stairCount = 2, stairWidthFt = 8, stairDepthFt = 12,
  restroomAreaFt2, shaftAreaFt2, lobbyAreaFt2, idfAreaFt2 = 60, janitorAreaFt2 = 60, lactationAreaFt2 = 60,
  circFactor = 0.18, sprinklered = true, highRise = false, diagonal,
}) {
  const violations = [], flags = [];
  const sw = stairWidthFt, sd = stairDepthFt;

  // back-of-core services (blind-OK) vs. the front lobby vs. the elevator bank between them
  const backParts = [
    { key: "wcM", name: "Men", type: "restroom", area: restroomAreaFt2 / 2 },
    { key: "wcW", name: "Women", type: "restroom", area: restroomAreaFt2 / 2 },
    { key: "shaft", name: "MEP Risers", type: "shaft", area: shaftAreaFt2 },
    { key: "idf", name: "IDF", type: "shaft", area: idfAreaFt2 },
    { key: "jan", name: "Janitor", type: "shaft", area: janitorAreaFt2 },
    { key: "lact", name: "Lactation", type: "lactation", area: lactationAreaFt2 },
  ];
  const backArea = backParts.reduce((s, p) => s + p.area, 0);
  const componentArea = backArea + elevAreaFt2 + lobbyAreaFt2;
  const coreArea = componentArea * (1 + circFactor);

  let comps = [], stairRects = [], frontDir, coreRect, footArea = coreArea;
  const sepReq = highRise ? Math.min(30, diagonal * 0.25) : diagonal * (sprinklered ? 1 / 3 : 1 / 2);

  // ---- helpers to lay out a single-faced core band (side / end / each half of a double) ----
  // depthAxis: the axis running from the blind back to the active front.
  function layoutSingleFace(originX, originY, bandW, bandDepth, depthAxis, frontSign, label) {
    // reserve a stair column at each end of the band's width; pack [back | bank | lobby] in depth
    const usableW = Math.max(bandW - 2 * sw, sw);
    const crossAxis = depthAxis === "y" ? "x" : "y";
    const innerOrigin = depthAxis === "y" ? { x: originX + sw, y: originY } : { x: originX, y: originY + sw };
    const innerRect = depthAxis === "y" ? rectOf(innerOrigin.x, innerOrigin.y, usableW, bandDepth)
                                        : rectOf(innerOrigin.x, innerOrigin.y, bandDepth, usableW);
    // order back->front depends on frontSign (+1 means front is at higher coord)
    const depthParts = [
      { key: "back", area: backArea }, { key: "bank", area: elevAreaFt2 }, { key: "lobby", area: lobbyAreaFt2 },
    ];
    if (frontSign < 0) depthParts.reverse(); // front at lower coord
    const dBands = sliceBands(innerRect, depthAxis, depthParts);
    for (const b of dBands) {
      if (b.key === "bank") comps.push({ key: "bank", name: "Elevators", type: "elevator", rect: b.rect, face: label });
      else if (b.key === "lobby") comps.push({ key: "lobby", name: "Lift Lobby", type: "lobby", rect: b.rect, face: label });
      else { // split back services across the cross axis
        for (const s of sliceBands(b.rect, crossAxis, backParts)) comps.push({ key: s.key, name: s.name, type: s.type, rect: s.rect, face: "blind" });
      }
    }
    return { usableW, innerOrigin };
  }

  if (coreType === "side" || coreType === "end") {
    const onShort = coreType === "end";
    const edgeLen = onShort ? H : W, fitDepth = (onShort ? W : H) * 0.6;
    const coreDepth = Math.min(onShort ? W : H, 44);
    let span = coreArea / coreDepth;            // length along the edge
    span = Math.min(span, edgeLen * 0.92);
    let depthUse = coreArea / span;             // recompute depth to preserve area
    if (depthUse > fitDepth) { depthUse = fitDepth; if (span * depthUse < coreArea - 1) flags.push("core exceeds floor plate — densify program, enlarge floor, or split core"); }
    if (coreType === "side") {
      // band along a horizontal edge; front faces into the floor (vertical depth)
      const south = corePosition !== "north";
      const cx = (W - span) / 2, cy = south ? 0 : H - depthUse;
      coreRect = rectOf(cx, cy, span, depthUse); frontDir = south ? "N" : "S";
      layoutSingleFace(cx, cy, span, depthUse, "y", south ? +1 : -1, frontDir);
      // stairs flank the two ends, full depth
      stairRects = [rectOf(cx, cy + depthUse / 2 - sd / 2, sw, sd), rectOf(cx + span - sw, cy + depthUse / 2 - sd / 2, sw, sd)];
    } else {
      const west = corePosition !== "east";
      const cx = west ? 0 : W - depthUse, cy = (H - span) / 2;
      coreRect = rectOf(cx, cy, depthUse, span); frontDir = west ? "E" : "W";
      layoutSingleFace(cx, cy, span, depthUse, "x", west ? +1 : -1, frontDir);
      stairRects = [rectOf(cx + depthUse / 2 - sw / 2, cy, sw, sd), rectOf(cx + depthUse / 2 - sw / 2, cy + span - sd, sw, sd)];
    }
    footArea = span * depthUse;
  } else if (coreType === "double") {
    // two half-cores on the east & west edges, each facing inward; stairs maximally remote
    const half = coreArea / 2;
    const coreDepth = Math.min(W * 0.22, 40);
    let span = half / coreDepth; span = Math.min(span, H * 0.92);
    const depthUse = half / span;
    const cyW = (H - span) / 2;
    // west half (front faces East = +x)
    const savedBack = backArea; // each half carries a full back band (split toilets etc. schematically)
    coreRect = rectOf(0, cyW, depthUse, span); frontDir = "split";
    layoutSingleFace(0, cyW, span, depthUse, "x", +1, "E");
    stairRects = [rectOf(depthUse / 2 - sw / 2, cyW, sw, sd)];
    // east half (front faces West = -x)
    layoutSingleFace(W - depthUse, cyW, span, depthUse, "x", -1, "W");
    stairRects.push(rectOf(W - depthUse / 2 - sw / 2, cyW + span - sd, sw, sd));
    coreRect = rectOf(0, cyW, W, span); // report bounding extent for fit checks
    footArea = 2 * depthUse * span;
    void savedBack;
  } else {
    // central island: services spine in the middle, two elevator banks + lobbies on the long faces,
    // stairs at the two short ends (remote). Active faces = the racetrack on all sides.
    const fitW = W * 0.78, fitH = H * 0.7;
    let ch = Math.min(Math.max(Math.sqrt(coreArea / 1.7), 45), fitH);
    let cw = Math.min(coreArea / ch, fitW);
    let chUse = coreArea / cw;
    if (chUse > fitH) { chUse = fitH; cw = Math.min(coreArea / chUse, fitW); if (cw * chUse < coreArea - 1) flags.push("core exceeds floor plate — densify program, enlarge floor, or split core"); }
    const cx = (W - cw) / 2, cy = (H - chUse) / 2;
    coreRect = rectOf(cx, cy, cw, chUse); frontDir = "island";
    const usableW = Math.max(cw - 2 * sw, sw);
    const inner = rectOf(cx + sw, cy, usableW, chUse);
    // y-bands: lobbyS | bankS | center services | bankN | lobbyN
    const yParts = [
      { key: "lobbyS", area: lobbyAreaFt2 / 2 }, { key: "bankS", area: elevAreaFt2 / 2 },
      { key: "center", area: backArea }, { key: "bankN", area: elevAreaFt2 / 2 }, { key: "lobbyN", area: lobbyAreaFt2 / 2 },
    ];
    for (const b of sliceBands(inner, "y", yParts)) {
      if (b.key === "center") for (const s of sliceBands(b.rect, "x", backParts)) comps.push({ key: s.key, name: s.name, type: s.type, rect: s.rect, face: "blind" });
      else if (b.key.startsWith("bank")) comps.push({ key: b.key, name: "Elevators", type: "elevator", rect: b.rect, face: b.key.endsWith("N") ? "N" : "S" });
      else comps.push({ key: b.key, name: "Lift Lobby", type: "lobby", rect: b.rect, face: b.key.endsWith("N") ? "N" : "S" });
    }
    stairRects = [rectOf(cx, cy + chUse / 2 - sd / 2, sw, sd), rectOf(cx + cw - sw, cy + chUse / 2 - sd / 2, sw, sd)];
    footArea = cw * chUse;
  }

  // ---- enforce egress remoteness: pull stairs apart if the core can't satisfy it ----
  const sep = (a, b) => Math.hypot((a.x + a.w / 2) - (b.x + b.w / 2), (a.y + a.h / 2) - (b.y + b.h / 2));
  if (stairRects.length >= 2) {
    let actual = sep(stairRects[0], stairRects[1]);
    if (actual < sepReq - 0.5) {
      const horiz = W >= H, m = sw;
      stairRects[0] = horiz ? rectOf(m, H / 2 - sd / 2, sw, sd) : rectOf(W / 2 - sw / 2, m, sw, sd);
      stairRects[1] = horiz ? rectOf(W - m - sw, H / 2 - sd / 2, sw, sd) : rectOf(W / 2 - sw / 2, H - m - sd, sw, sd);
      actual = sep(stairRects[0], stairRects[1]);
      flags.push(`stairs pulled out of core to meet remoteness (${Math.round(actual)} ft ≥ ${Math.round(sepReq)} ft required)`);
    }
    var egress = { requiredFt: Math.round(sepReq), actualFt: Math.round(actual), ok: actual >= sepReq - 0.5 };
  } else {
    var egress = { requiredFt: Math.round(sepReq), actualFt: Math.round(sep(stairRects[0], stairRects[stairRects.length - 1] || stairRects[0])), ok: true };
  }

  // ---- GRAMMAR VALIDATION ----
  const lobbies = comps.filter((c) => c.type === "lobby");
  const banks = comps.filter((c) => c.type === "elevator");
  if (!lobbies.length) violations.push("no lift lobby");
  if (!banks.length) violations.push("no elevator bank");
  // every elevator bank must be adjacent to a lobby (so cars open into the lobby, not glass/floor)
  for (const bank of banks) {
    const touchesLobby = lobbies.some((l) => {
      const ax = Math.max(bank.rect.x, l.rect.x), bx = Math.min(bank.rect.x + bank.rect.w, l.rect.x + l.rect.w);
      const ay = Math.max(bank.rect.y, l.rect.y), by = Math.min(bank.rect.y + bank.rect.h, l.rect.y + l.rect.h);
      const sharedX = bx - ax, sharedY = by - ay;
      // adjacent if they share a substantial edge (one overlaps in one axis and abuts in the other)
      return (sharedX > 2 && Math.abs((bank.rect.y + bank.rect.h) - l.rect.y) < 1.5) ||
             (sharedX > 2 && Math.abs((l.rect.y + l.rect.h) - bank.rect.y) < 1.5) ||
             (sharedY > 2 && Math.abs((bank.rect.x + bank.rect.w) - l.rect.x) < 1.5) ||
             (sharedY > 2 && Math.abs((l.rect.x + l.rect.w) - bank.rect.x) < 1.5);
    });
    if (!touchesLobby) violations.push("elevator bank not fronted by a lobby");
  }
  // no elevator bank may sit on the building perimeter (would open onto glass)
  for (const bank of banks) {
    const onGlass = bank.rect.x <= 0.6 || bank.rect.y <= 0.6 || bank.rect.x + bank.rect.w >= W - 0.6 || bank.rect.y + bank.rect.h >= H - 0.6;
    if (onGlass && coreType !== "double") violations.push("elevator bank on the glass line");
  }
  // components within the floor
  for (const c of comps) if (!within(c.rect, W, H)) violations.push(`${c.name} off-plate`);

  return {
    coreType, corePosition, frontDir, rect: coreRect,
    areaFt2: Math.round(footArea), areaPct: r1((footArea / (W * H)) * 100),
    components: comps, stairs: stairRects, egress,
    valid: violations.length === 0, violations, flags,
  };
}
