# Boomtown

Boomtown is a browser-based Three.js strategy toy about building a tiny July 4th fireworks town on a procedural island, then managing workers through a fixed four-day production sprint. You sketch the island, place buildings, assign logistics loops, and try to finish the Launch Field with enough staged fireworks to put on a successful show by the end of July 4.

## What it does

- Generates and renders a stylized 3D island scene with editable placement zones and lighting presets.
- Lets players place production buildings, paths, and launch infrastructure on top of the island.
- Simulates worker assignment, hauling, crafting, construction progress, and launch capacity in real time.
- Tracks a deterministic four-day scenario with scoring thresholds and day-end summaries.
- Includes headless simulation tests for scoring, economy, production, crowding, fireworks, and scripted four-day runs.

## Gameplay loop

The simulation goal is simple: complete the Launch Field and stage at least 12 launchable fireworks before the end of day 4.

Core resources and flow:

- `Lumber Mill` produces wood.
- `Water Tower` provides water.
- `Quarry` can supply ore or stone depending on the assigned route.
- `Fireworks Factory` consumes wood, water, and ore to produce fireworks.
- `Launch Field` must be built before any staged fireworks count.
- `Launch racks` increase launch capacity in 6-firework increments.

The current tuned balance lives in [docs/balance.md](./docs/balance.md).

## Controls

Scene modes:

- `Pan`: orbit and inspect the island
- `Island`: draw a new island outline
- `Build`: place prefab buildings
- `Edit`: select, rotate, or delete placed buildings
- `Paths`: inspect generated walkways
- `Simulate`: run the worker/logistics game

Simulation controls:

- `Click`: select a worker
- `Drag`: marquee select workers
- `Shift + click worker`: add or remove a worker from the selection
- `Click building`: assign selected workers to a one-shot building task
- `Shift + click buildings`: create a source -> destination hauling loop
- `I`: select idle workers
- `Pause button`: pause the run to inspect state or queue orders
- `Speed button`: cycle simulation speed from `1x` to `8x`

## Tech stack

- TypeScript
- Vite
- Three.js
- Node.js test runner

## Getting started

### Prerequisites

- Node.js with support for `--experimental-strip-types` in the built-in test runner
- npm

### Install

```bash
npm install
```

### Run the dev server

```bash
npm run dev
```

To expose the dev server on your LAN:

```bash
npm run lan
```

### Build for production

```bash
npm run build
```

This runs TypeScript compilation, builds with Vite, and writes `dist/build-info.json` with the resolved Azure path metadata.

### Preview the build

```bash
npm run preview
```

Or on your LAN:

```bash
npm run preview:lan
```

## Tests

Run the automated test suite with:

```bash
npm test
```

The current suite covers:

- building production
- worker routing and crowd avoidance
- economy and resource transfer logic
- fireworks show planning
- deterministic scoring
- scripted four-day runs

## Deployment

The repository includes an Azure Blob Storage deploy script:

```bash
npm run deploy
```

Useful details:

- `npm run deploy:dry-run` prints the Azure CLI commands without changing blobs.
- The deploy path defaults to container `summer-into-ai` and virtual directory `boomtown`.
- `VIRTUAL_DIR`, `AZURE_STORAGE_CONTAINER`, and `VITE_BASE_PATH` can override the default path behavior.
- Deploys expect the Azure CLI to be installed and authenticated with `az login`.

## Project structure

```text
src/
  assets/       Models and textures
  scene/        Three.js scene setup, camera, prefab placement, visuals
  simulation/   Economy, worker logic, scoring, fixed-step simulation
tests/          Node-based gameplay and systems tests
scripts/        Build, local serving, and Azure deployment helpers
docs/           Design and balance notes
```

## Notes for contributors

- The main browser entry point is [src/main.ts](./src/main.ts).
- Most gameplay state and rules live under [src/simulation](./src/simulation).
- The interactive 3D runtime is coordinated by [src/scene/SceneController.ts](./src/scene/SceneController.ts).
- Balance expectations and target playtest outcomes are documented in [docs/balance.md](./docs/balance.md).
