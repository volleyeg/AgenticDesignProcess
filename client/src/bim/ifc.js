// client/src/bim/ifc.js
// Minimal but VALID IFC4 (STEP / .ifc) exporter for the BIM model.
// Spatial hierarchy Project>Site>Building>Storey>Space, feet units, extruded-solid geometry.

const G64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

// 22-char IFC-compliant GUID from a random 128-bit value.
export function ifcGuid() {
  const bytes = new Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  // build big-endian 128-bit, encode 2 bits then 21*6 bits => 22 chars
  let bits = bytes.map((b) => b.toString(2).padStart(8, "0")).join(""); // 128 bits
  const chunks = [bits.slice(0, 2), ...Array.from({ length: 21 }, (_, i) => bits.slice(2 + i * 6, 8 + i * 6))];
  return chunks.map((c) => G64[parseInt(c, 2)]).join("");
}

const num = (v) => {
  // IFC REAL must carry a decimal point
  const n = Number(v);
  if (!isFinite(n)) return "0.";
  return Number.isInteger(n) ? n + "." : String(n);
};

export function writeIFC(model) {
  let id = 0;
  const lines = [];
  const ref = () => "#" + id;
  const add = (body) => { id += 1; lines.push(`#${id}= ${body};`); return "#" + id; };

  // ---- ownership / app ----
  const person = add("IFCPERSON($,'Forge',$,$,$,$,$,$)");
  const org = add("IFCORGANIZATION($,'Gensler Forge',$,$,$)");
  const pao = add(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const app = add(`IFCAPPLICATION(${org},'0.1','Design Intelligence Console','DIC')`);
  const ts = Math.floor(Date.now() / 1000);
  const owner = add(`IFCOWNERHISTORY(${pao},${app},$,.ADDED.,$,$,$,${ts})`);

  // ---- units: feet + square feet (conversion-based on SI) ----
  const siM = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const siM2 = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const dimL = add("IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0)");
  const dimA = add("IFCDIMENSIONALEXPONENTS(2,0,0,0,0,0,0)");
  const mwuFt = add(`IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),${siM})`);
  const footUnit = add(`IFCCONVERSIONBASEDUNIT(${dimL},.LENGTHUNIT.,'foot',${mwuFt})`);
  const mwuSqFt = add(`IFCMEASUREWITHUNIT(IFCAREAMEASURE(0.09290304),${siM2})`);
  const sqftUnit = add(`IFCCONVERSIONBASEDUNIT(${dimA},.AREAUNIT.,'square foot',${mwuSqFt})`);
  const units = add(`IFCUNITASSIGNMENT((${footUnit},${sqftUnit}))`);

  // ---- geometric context (identity world placement) ----
  const o3d = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const zdir = add("IFCDIRECTION((0.,0.,1.))");
  const xdir = add("IFCDIRECTION((1.,0.,0.))");
  const worldAx = add(`IFCAXIS2PLACEMENT3D(${o3d},${zdir},${xdir})`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,${worldAx},$)`);

  // ---- project / spatial ----
  const project = add(`IFCPROJECT('${ifcGuid()}',${owner},'${esc(model.meta.name)}',$,$,$,$,(${ctx}),${units})`);
  const siteLP = add(`IFCLOCALPLACEMENT($,${worldAx})`);
  const site = add(`IFCSITE('${ifcGuid()}',${owner},'Site',$,$,${siteLP},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldgLP = add(`IFCLOCALPLACEMENT(${siteLP},${worldAx})`);
  const building = add(`IFCBUILDING('${ifcGuid()}',${owner},'${esc(model.building.name)}',$,$,${bldgLP},$,$,.ELEMENT.,$,$,$)`);

  add(`IFCRELAGGREGATES('${ifcGuid()}',${owner},$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES('${ifcGuid()}',${owner},$,$,${site},(${building}))`);

  const storeyRefs = [];
  const spaceRefsByLevel = {};

  for (const lvl of model.levels) {
    const storeyLP = add(`IFCLOCALPLACEMENT(${bldgLP},${worldAx})`);
    const storey = add(`IFCBUILDINGSTOREY('${ifcGuid()}',${owner},'${esc(lvl.name)}',$,$,${storeyLP},$,$,.ELEMENT.,${num(lvl.elevationFt)})`);
    storeyRefs.push(storey);
    spaceRefsByLevel[lvl.id] = { storey, storeyLP, spaces: [] };
  }

  // ---- spaces with extruded geometry + properties ----
  for (const sp of model.spaces) {
    const lvl = spaceRefsByLevel[sp.levelId] || spaceRefsByLevel[model.levels[0].id];
    const ptRefs = sp.footprintFt.map((p) => add(`IFCCARTESIANPOINT((${num(p[0])},${num(p[1])}))`));
    const poly = add(`IFCPOLYLINE((${ptRefs.join(",")},${ptRefs[0]}))`);
    const profile = add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`);
    const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${worldAx},${zdir},${num(sp.heightFt)})`);
    const shapeRep = add(`IFCSHAPEREPRESENTATION(${ctx},'Body','SweptSolid',(${solid}))`);
    const pds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shapeRep}))`);
    const spaceLP = add(`IFCLOCALPLACEMENT(${lvl.storeyLP},${worldAx})`);
    const space = add(`IFCSPACE('${ifcGuid()}',${owner},'${esc(sp.name)}',$,$,${spaceLP},${pds},$,.ELEMENT.,.INTERNAL.,$)`);
    lvl.spaces.push(space);

    // property set
    const pKind = add(`IFCPROPERTYSINGLEVALUE('Kind',$,IFCLABEL('${esc(sp.kind)}'),$)`);
    const pDay = add(`IFCPROPERTYSINGLEVALUE('Daylight',$,IFCBOOLEAN(.${sp.daylight ? "T" : "F"}.),$)`);
    const pSeats = add(`IFCPROPERTYSINGLEVALUE('Seats',$,IFCINTEGER(${Math.round(sp.seats || 0)}),$)`);
    const pset = add(`IFCPROPERTYSET('${ifcGuid()}',${owner},'Pset_ForgeSpace',$,(${pKind},${pDay},${pSeats}))`);
    add(`IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',${owner},$,$,(${space}),${pset})`);

    // base quantity (area in ft2)
    const qArea = add(`IFCQUANTITYAREA('GrossFloorArea',$,$,${num(sp.areaFt2)},$)`);
    const eq = add(`IFCELEMENTQUANTITY('${ifcGuid()}',${owner},'Qto_SpaceBaseQuantities',$,$,(${qArea}))`);
    add(`IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',${owner},$,$,(${space}),${eq})`);
  }

  // aggregate spaces into their storeys
  for (const lvl of model.levels) {
    const e = spaceRefsByLevel[lvl.id];
    if (e && e.spaces.length) add(`IFCRELAGGREGATES('${ifcGuid()}',${owner},$,$,${e.storey},(${e.spaces.join(",")}))`);
  }
  add(`IFCRELAGGREGATES('${ifcGuid()}',${owner},$,$,${building},(${storeyRefs.join(",")}))`);

  // ---- assemble file ----
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "");
  const header = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('${esc(model.meta.name)}.ifc','${stamp}',(''),(''),'Design Intelligence Console','web-ifc-export','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];
  return header.join("\n") + "\n" + lines.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
}

function esc(s) { return String(s == null ? "" : s).replace(/'/g, "''"); }
