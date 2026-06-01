# AgenticDesignProcess — Design Intelligence Console

A nested, self-learning agentic design flow for the test-fit / feasibility workflow, now on a **BIM-native foundation**.

## What it does
1. **Sensing / Interpretation / Evaluation** — live Claude agents read a brief, frame the problem (recalling past lessons), and score options. Key stays server-side.
2. **Generation** — a deterministic solver places three zoning schemes.
3. **BIM model** — the chosen scheme is built into one BIM model (Project → Building → Level → Space, in **feet**, with properties + relationships). The 2D plan, the 3D view, and the exported **IFC** file are all rendered from this single model.
4. **Human review** — you curate, rate, and stamp a winner; the lesson persists and is recalled next run.

## Architecture
```
client/            React + Vite UI
  src/
    App.jsx         the console
    solver.js       deterministic placement + metrics
    bim/
      model.js              BIM-native model (feet, elements + relationships)
      buildFromConstraints  scheme -> BIM model
      ifc.js                valid IFC4 (.ifc) exporter
      Plan2D.jsx            2D plan rendered from the model
      Viewer3D.jsx          three.js 3D view of the model
server/            Node/Express proxy (holds ANTHROPIC_API_KEY)
```

## Run (Codespace)
```bash
npm run install:all        # installs server + client deps
npm install                # root (concurrently)
npm run dev                # server :8787 + client :5173
```
Set `ANTHROPIC_API_KEY` as a Codespaces secret (or in `server/.env`). Forward port **5173** and open it.

- Run the design flow → pick a scheme → the **BIM Model** panel shows it in **2D** or **3D**, with **Export IFC**.
- The `.ifc` opens in Revit or any IFC viewer; it carries feet units, the spatial hierarchy, space geometry, areas, and properties.

## Honest scope
Schematic-level BIM (rooms/walls/core/properties), not detailed construction models or expressive form. The licensed human stays the accountable stamp. Validated against IfcOpenShell (IFC4).
