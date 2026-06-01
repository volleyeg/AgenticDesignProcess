// client/src/bim/programProfiles.js
// Program-type profiles — the layer that makes a lab a different building from an
// office. Each profile overrides the structural / MEP / vertical-transport defaults.
// These are DATA, tunable, with sources + confidence (verify per jurisdiction/program).
//
// Sources: WBDG Lab Module (10'6"); HDR/BHDP/CRB/NAP (lab f2f 15-16 ft, load 120-150 psf,
// once-through HVAC, stacking exhaust); ATIS/ElevatorWorld (HC & interval targets);
// office conventions (5 ft module, 30 ft bay, 13 ft f2f, 80-100 psf).

export const PROGRAM_PROFILES = {
  office: {
    id: "office", label: "Office (Business)",
    moduleFt: 5, bayFt: 30, floorToFloorFt: 13, floorLoadPsf: 80,
    occLoadFactor: 150,            // sf/person gross (IBC B)
    elevPopDensity: 250,           // usable sf/person for elevatoring
    carCapacityLb: 3500,           // ~21 persons
    elevHCtarget: 0.12,            // 12% in 5 min
    elevIntervalTargetS: 30,
    shaftPctBase: 0.04, shaftPctPerStory: 0.0008,  // risers grow with height
    hvac: "recirculated", freightOverStories: 10,
    confidence: "solid",
  },
  lab: {
    id: "lab", label: "Laboratory / R&D",
    moduleFt: 10.5, bayFt: 21, floorToFloorFt: 15.5, floorLoadPsf: 135,
    occLoadFactor: 150,
    elevPopDensity: 300,
    carCapacityLb: 4000,
    elevHCtarget: 0.12, elevIntervalTargetS: 30,
    shaftPctBase: 0.09, shaftPctPerStory: 0.0025,  // once-through exhaust, big stacking shafts
    hvac: "once-through", freightOverStories: 1,    // labs essentially always want freight
    confidence: "solid",
  },
  residential: {
    id: "residential", label: "Residential",
    moduleFt: 4, bayFt: 24, floorToFloorFt: 9.5, floorLoadPsf: 50,
    occLoadFactor: 200,
    elevPopDensity: 600,
    carCapacityLb: 2500,
    elevHCtarget: 0.06, elevIntervalTargetS: 60,
    shaftPctBase: 0.05, shaftPctPerStory: 0.0010,  // + trash/recycling chutes
    hvac: "per-unit", freightOverStories: 6,
    confidence: "directional",
  },
  hotel: {
    id: "hotel", label: "Hotel",
    moduleFt: 4, bayFt: 26, floorToFloorFt: 10, floorLoadPsf: 50,
    occLoadFactor: 200,
    elevPopDensity: 500,
    carCapacityLb: 3000,
    elevHCtarget: 0.10, elevIntervalTargetS: 40,   // + heavy service traffic
    shaftPctBase: 0.06, shaftPctPerStory: 0.0012,
    hvac: "per-room", freightOverStories: 1,
    confidence: "directional",
  },
  healthcare: {
    id: "healthcare", label: "Healthcare",
    moduleFt: 4, bayFt: 30, floorToFloorFt: 16, floorLoadPsf: 100,
    occLoadFactor: 120,
    elevPopDensity: 240,
    carCapacityLb: 5000,                            // gurney/bed cars
    elevHCtarget: 0.12, elevIntervalTargetS: 35,
    shaftPctBase: 0.10, shaftPctPerStory: 0.0025,   // high OA + interstitial
    hvac: "high-OA", freightOverStories: 1,
    confidence: "directional",
  },
};

export const getProfile = (id) => PROGRAM_PROFILES[id] || PROGRAM_PROFILES.office;
