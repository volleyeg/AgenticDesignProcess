// client/src/bim/rulepacks/northAmerica.js
// Base rule pack for North America. Rules are DATA, not code: the shell engine
// reads values from here. Jurisdiction packs (canada/ontario/toronto, Europe...)
// inherit this and override by id. UI is generated from `tier`/`type`/`label`.
//
// Assumptions for this pack: sprinklered, Business (B) occupancy (both togglable).
// confidence: "solid" = well-established convention/code | "verify" = confirm vs adopted code.

export const NORTH_AMERICA = {
  id: "north-america",
  label: "North America (IBC/IPC base)",
  occupancy: "B",
  rules: {
    // ---- structure & facade ----
    "planning.module":      { label: "Planning / mullion module", group: "structure", tier: "advanced", type: "spacing", value: 5,   unit: "ft", source: "1.5 m planning-grid convention", confidence: "solid" },
    "structure.bay":        { label: "Structural bay spacing",     group: "structure", tier: "advanced", type: "spacing", value: 30,  unit: "ft", source: "typical office bay", confidence: "solid" },
    "structure.columnSize": { label: "Column size",                group: "structure", tier: "advanced", type: "dimension", value: 2, unit: "ft", source: "convention", confidence: "solid" },
    "facade.spandrelFt":    { label: "Spandrel height at slab",    group: "facade",    tier: "advanced", type: "dimension", value: 3, unit: "ft", source: "convention", confidence: "solid" },
    "daylight.depth":       { label: "Usable perimeter depth",     group: "facade",    tier: "advanced", type: "dimension", value: 40, unit: "ft", source: "daylight-depth 30-45 ft (light 8-10 m)", confidence: "solid" },
    "efficiency.targetLo":  { label: "Target net-to-gross (low)",  group: "efficiency",tier: "advanced", type: "percent", value: 0.80, unit: "ratio", source: "floor-plate norms", confidence: "solid" },
    "efficiency.targetHi":  { label: "Target net-to-gross (high)", group: "efficiency",tier: "advanced", type: "percent", value: 0.90, unit: "ratio", source: "floor-plate norms", confidence: "solid" },

    // ---- occupancy ----
    "occ.loadFactor":       { label: "Occupant load factor",       group: "occupancy", tier: "advanced", type: "ratio", value: 150, unit: "sf/person gross", source: "IBC 1004 (2018) Business", confidence: "solid" },

    // ---- egress / stairs ----
    "stair.base":           { label: "Base stair count",           group: "egress", tier: "advanced", type: "count", value: 2,  unit: "stairs", source: "IBC 1006/1021", confidence: "solid" },
    "stair.occFor3":        { label: "Occupants requiring 3rd",     group: "egress", tier: "advanced", type: "count", value: 500, unit: "persons", source: "IBC 1006.3.3", confidence: "solid" },
    "stair.occFor4":        { label: "Occupants requiring 4th",     group: "egress", tier: "advanced", type: "count", value: 1000,unit: "persons", source: "IBC 1006.3.3", confidence: "solid" },
    "stair.widthFt":        { label: "Stair shaft width",          group: "egress", tier: "advanced", type: "dimension", value: 8,  unit: "ft", source: "convention", confidence: "solid" },
    "stair.depthFt":        { label: "Stair shaft depth",          group: "egress", tier: "advanced", type: "dimension", value: 12, unit: "ft", source: "convention", confidence: "solid" },
    "stair.sepSprink":      { label: "Separation (sprinklered)",   group: "egress", tier: "advanced", type: "ratio", value: 1/3, unit: "x diagonal", source: "IBC 1007.1.1", confidence: "solid" },
    "stair.sepNonSprink":   { label: "Separation (non-sprinkler)", group: "egress", tier: "advanced", type: "ratio", value: 1/2, unit: "x diagonal", source: "IBC 1007.1.1", confidence: "solid" },
    "stair.sepHighRise":    { label: "Separation (high-rise)",     group: "egress", tier: "advanced", type: "ratio", value: 1/4, unit: "x diagonal", source: "IBC 403.5.1", confidence: "solid" },
    "stair.sepFloorMin":    { label: "Min separation floor",       group: "egress", tier: "advanced", type: "dimension", value: 30, unit: "ft", source: "IBC 1007.1.1", confidence: "solid" },
    "travel.maxSprink":     { label: "Max travel (sprinklered B)", group: "egress", tier: "advanced", type: "dimension", value: 300, unit: "ft", source: "IBC 1017.2", confidence: "verify" },

    // ---- elevators ----
    "elev.sfPerCar":        { label: "Floor area per elevator",    group: "elevators", tier: "advanced", type: "ratio", value: 45000, unit: "sf/car", source: "VT rule of thumb", confidence: "verify" },
    "elev.personsPerCar":   { label: "Persons per elevator",       group: "elevators", tier: "advanced", type: "ratio", value: 225, unit: "persons/car", source: "VT (modern)", confidence: "verify" },
    "elev.popDensity":      { label: "Elevatoring pop density",    group: "elevators", tier: "advanced", type: "ratio", value: 250, unit: "usable sf/person", source: "VT convention", confidence: "verify" },
    "elev.shaftFt":         { label: "Passenger shaft size",       group: "elevators", tier: "advanced", type: "dimension", value: 8, unit: "ft (sq)", source: "convention", confidence: "solid" },
    "elev.maxPerGroup":     { label: "Max cars per group",         group: "elevators", tier: "advanced", type: "count", value: 8, unit: "cars", source: "VT convention", confidence: "solid" },
    "elev.lobbyDepthFt":    { label: "Elevator lobby depth",       group: "elevators", tier: "advanced", type: "dimension", value: 10, unit: "ft", source: "convention", confidence: "verify" },
    "elev.freightFloors":   { label: "Floors that trigger freight",group: "elevators", tier: "advanced", type: "count", value: 10, unit: "stories", source: "convention", confidence: "solid" },
    "elev.fireSvcHeightFt": { label: "Height for fire-svc cars",   group: "elevators", tier: "advanced", type: "dimension", value: 120, unit: "ft", source: "IBC 3007 / ASME 2019", confidence: "verify" },
    "elev.fireSvcCount":    { label: "Fire-service car count",     group: "elevators", tier: "advanced", type: "count", value: 2, unit: "cars", source: "ASME 2019", confidence: "verify" },

    // ---- restrooms (B, per sex, 50/50 split) ----
    "wc.firstRatio":        { label: "WC 1 per (first 50)",        group: "restrooms", tier: "advanced", type: "ratio", value: 25, unit: "persons/WC", source: "IPC/IBC 2902.1", confidence: "verify" },
    "wc.thenRatio":         { label: "WC 1 per (over 50)",         group: "restrooms", tier: "advanced", type: "ratio", value: 50, unit: "persons/WC", source: "IPC/IBC 2902.1", confidence: "verify" },
    "wc.firstBreak":        { label: "WC ratio breakpoint",        group: "restrooms", tier: "advanced", type: "count", value: 50, unit: "persons", source: "IPC/IBC 2902.1", confidence: "verify" },
    "lav.firstRatio":       { label: "Lav 1 per (first 80)",       group: "restrooms", tier: "advanced", type: "ratio", value: 40, unit: "persons/lav", source: "IPC/IBC 2902.1", confidence: "verify" },
    "lav.thenRatio":        { label: "Lav 1 per (over 80)",        group: "restrooms", tier: "advanced", type: "ratio", value: 80, unit: "persons/lav", source: "IPC/IBC 2902.1", confidence: "verify" },
    "lav.firstBreak":       { label: "Lav ratio breakpoint",       group: "restrooms", tier: "advanced", type: "count", value: 80, unit: "persons", source: "IPC/IBC 2902.1", confidence: "verify" },
    "wc.areaEach":          { label: "Area per WC (all-in)",       group: "restrooms", tier: "advanced", type: "dimension", value: 45, unit: "sf/WC", source: "convention", confidence: "solid" },

    // ---- shafts / mechanical ----
    "shaft.pct":            { label: "Mech/elec/telecom risers",   group: "shafts", tier: "advanced", type: "percent", value: 0.04, unit: "of floor", source: "convention", confidence: "verify" },
    "shaft.closetArea":     { label: "Janitor/IDF closet area",    group: "shafts", tier: "advanced", type: "dimension", value: 60, unit: "sf each", source: "convention", confidence: "solid" },

    // ---- core packing ----
    "core.aspect":          { label: "Core block aspect",          group: "core", tier: "advanced", type: "ratio", value: 1.8, unit: "w:h", source: "convention", confidence: "solid" },
    "core.circFactor":      { label: "Core internal circulation",  group: "core", tier: "advanced", type: "percent", value: 0.20, unit: "of components", source: "convention", confidence: "solid" },
    "core.highRiseFt":      { label: "High-rise height threshold",  group: "core", tier: "advanced", type: "dimension", value: 75, unit: "ft", source: "IBC 202 (high-rise)", confidence: "solid" },
  },
};

// jurisdiction cascade: base + ordered override packs that patch rule values by id
export function resolvePack(base, ...overrides) {
  const rules = { ...base.rules };
  for (const o of overrides) for (const id in (o.rules || {})) rules[id] = { ...rules[id], ...o.rules[id] };
  return { ...base, rules, _chain: [base.id, ...overrides.map((o) => o.id)] };
}

// value accessor for the engine
export function v(pack, id) {
  const r = pack.rules[id];
  if (!r) throw new Error("missing rule: " + id);
  return r.value;
}
