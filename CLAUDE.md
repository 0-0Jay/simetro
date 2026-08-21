# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Simetro: an offline, single-player PWA subway simulator for the Seoul/수도권 metropolitan rail network. No backend/DB — everything (train simulation, missions, settings) runs client-side. Real subway time is compressed 1:30 into wall-clock time while the app is open (`TIME_COMPRESSION_RATE` in `src/store/simulationStore.ts`); while closed, the clock keeps advancing 1:1 with real elapsed time (see `simulationStore` below), so the in-game clock never simply freezes.

## Commands

```bash
npm run dev      # vite dev server
npm run build    # tsc -b && vite build
npm run lint      # oxlint
npm run preview   # serve the production build locally
npm test          # vitest run — pure simulation logic (engine/tracks/missionPlayer/routeGraph/simulationStore)
npm run audit      # scripts/audit-data.mjs — coordinate coverage, network connectivity, zigzag curves, bend-data anomalies, station-naming
```

Type-check, lint, tests, and the data audit are the gates to run after any change:
```bash
npx tsc -b && npx oxlint && npm test && npm run audit
```

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to `main` (Pages source must be set to "GitHub Actions" in repo settings). `vite.config.ts` sets `base: '/simetro/'` only for `command === 'build'`, so local dev is unaffected.

## Architecture

### Data pipeline (raw JSON → simulation graph → rendered map)

1. **`src/data/raw/*.json`** — one file per data source (`seoulMetro1to8`, `seoulLightRail`, `korailLines`, `privateAndGtxLines`, `extraLines`), each an array of `SubwayLine` (see `src/data/types.ts`). Every line has `dataConfidence: 'official' | 'approximate'` — `'official'` means sourced from the 서울교통공사/국토부 public API (only ever covers the core 서울교통공사-operated segment of a line, e.g. 1호선's 서울역~청량리 trunk); everything else (extensions operated by Korail, researched lines) is `'approximate'`, backfilled from 나무위키/위키백과 station-distance tables. Check a line's `notes` field before trusting its numbers.
2. **`src/data/raw/stationCoords.json`** and **`src/data/raw/lineBends.json`** — schematic map coordinates and curve bend-points for every station/segment. These were derived by scraping the actual SVG path/coordinate data from metro.nuua.travel's schematic map (station coordinates × 1.6 scale) using one-off Node scripts (arc-length projection of stations onto the real path curves) that live outside this repo, not as part of the build. If you need to regenerate or extend this data, the technique is: sample the source SVG path at 1px steps via `svg-path-properties`, project each station's coordinate onto the nearest path point, and use arc-length ordering/midpoints for sequence and curve shape.
   - **Loop-line gotcha**: `extract_bend_points`-style regeneration must guard against a wrap-around bug at the seam of circular lines (2호선, 6호선 응암순환) — naively taking `[min(lenA,lenB), max(lenA,lenB)]` as "the arc between two stations" picks the *long way around* the loop when the pair straddles the path's start/end point, corrupting the curve for that one segment. The current extraction guards this by discarding any extracted arc longer than 70% of the path's total length (falls back to a straight line instead). Any future data regeneration needs the same guard.
3. **`src/data/lines/index.ts`** combines all raw files into `SUBWAY_LINES`.
4. **`src/simulation/tracks.ts`** (`buildTracks`) turns each `SubwayLine` into `fwd`/`bwd` `Track`s (one pair per line, plus one pair per branch). It computes `isLoop` (true when a track's first and last stop share a name, e.g. 2호선) and attaches `segmentBends` from `lineBends.json`.
5. **`src/simulation/engine.ts`** ticks trains along a `Track` every frame.

### Train movement is position-based, not schedule-based

There is no headway/timetable concept. Trains maintain a strict minimum gap of `MIN_GAP_STATIONS` (currently 2, i.e. one station between adjacent trains) via `src/simulation/engine.ts`: a following train's position is capped at `aheadPos - MIN_GAP_STATIONS`, and a new train spawns at a track's origin exactly when the rearmost train has moved `MIN_GAP_STATIONS` past it. `initializeTrainsForTrack` fills a track end-to-end at this spacing on load (random phase 0..MIN_GAP_STATIONS-1). Loop tracks (`isLoop`) never spawn/despawn — `segmentIndex` wraps via modulo instead of terminating, and always keep at least one train's worth of slack at the seam (`initializeTrainsForTrack` deliberately under-fills by one train) because `tickTrack` also enforces `MIN_GAP_STATIONS` across the loop's seam (frontmost train vs. the wrapped-around last train) — without that slack a freshly-loaded loop would deadlock at t=0. Delay events (`src/simulation/delayEvents.ts`) roll on each station arrival and, because trains are packed at minimum legal spacing, a single delay can cascade backward through every train queued behind it — this is expected emergent behavior, not a bug, when a train appears "stuck" for a while.

**Express trains** (currently 9호선 only, via `SubwayLine.express` in `seoulLightRail.json`): a `Track` built from a line with `express` data gets `expressStopIndices`/`passingStationIndices` (station names resolved to that direction's stop indices) and `expressSegmentSec` (per-segment travel time with `EXPRESS_DWELL_BONUS_SEC` subtracted for segments leading into a skipped station, floored at `MIN_EXPRESS_SEGMENT_SEC`). `initializeTrainsForTrack`/spawn logic tags every `EXPRESS_EVERY_N`th train `trainClass: 'express'`; `effectiveSegmentSec(track, train)` (in `train.ts`) is the single place that picks the express-vs-local segment array — every position/ETA/rendering call site must go through it rather than reading `track.segmentSec` directly. Overtaking models the real passing-track mechanic: a local arriving at a `passingStationIndices` stop gets `yieldRemainingSec = YIELD_HOLD_SEC` (a scheduled wait, not a "delay" — deliberately kept out of `activeDelay`/the delay-news system), and `tickTrack`'s blocker lookup (`findAheadPos`) skips any yielding local when computing an *express*'s cap, letting it close the gap and pass. `YIELD_HOLD_SEC` must stay comfortably above `MIN_GAP_STATIONS × (fastest express segment time)` — the time an express tailgating at exactly minimum gap needs to close that gap and pull clearly ahead — or the express never finishes overtaking before the local resumes (this was tuned via `engine.test.ts`'s overtake test, not guessed).

### State (Zustand stores in `src/store/`)

- **`simulationStore`** — the live train sim (`tracks`, `trainsByTrack`, `gameSeconds`). `trainsByTrack` itself is never persisted (reloading always re-randomizes exact train placement) — but `gameSeconds` is: `useOfflineClockPersistence` saves `{gameSeconds, savedAtMs}` to `localStorage` (`simetro-clock` key) on tab-hide/pagehide/a 30s timer, and on next launch `computeInitialState` advances `gameSeconds` by the real elapsed time since `savedAtMs` — **1:1, not through `TIME_COMPRESSION_RATE`** — so the clock keeps flowing while the app is closed instead of resetting to first-train time. If the catch-up lands past `LAST_TRAIN_CUTOFF_SECONDS`, trains start empty (matching the real overnight gap) instead of a fresh full fleet.
- **`missionStore`** — persists only `dateKey` and `missionHistory`; `todayMissions`/`activeMission` are derived/ephemeral. Missions are generated deterministically per day via `mulberry32(hashStringToSeed(dateKey))` in `missionGenerator.ts`, using `routeGraph.ts`'s Dijkstra (with a transfer penalty) purely to pick waypoints that hit a difficulty-appropriate total time — that graph is **not** used at mission-execution time.
- **`settingsStore`** — persists `themeColor`; `deriveThemePalette` (in `src/utils/color.ts`) derives the rest of the CSS palette (panel/border/text) from it for guaranteed contrast. `resetAll` wipes `localStorage` and reloads.
- Both `advance()` (simulationStore) and `tick()` (missionStore) are driven every animation frame from the single `useGameClockTicker` hook, mounted once in `App.tsx`.

### Mission execution rides the real simulation

Missions are **not** a scripted/virtual animation. Once started, the player is a `PlayerState` (`waiting` at a station or `riding` a specific real train — see `src/store/missionStore.ts`) that must be manually boarded/alighted via `armBoard`/`armAlight`. `src/simulation/missionPlayer.ts` has the pure helpers this depends on: `getUpcomingTrains` (ETA list for the boarding UI, using `trainEtaToStation`) and `stationsCrossedThisTick` (crossing-detection used both for waypoint credit and for arrival at a boarded train's next stop). A mission waypoint only counts once the player actually *alights* there — merely riding through it does not count. Boarding a train that hasn't spawned yet (e.g. escaping a terminus in the opposite direction) is handled via a synthetic "not yet spawned" `UpcomingTrain` entry (`trainId: null`) plus `armBoardSpawn`, which arms on the next *new* train id that appears on that track.

### Map rendering (`src/components/SubwayMap/`)

Single `SubwayMap` component shared by the Home tab (free pan/zoom) and Mission tab (camera-follow). `usePanZoom` computes `tx/ty` as a *derived* value while `followPoint` is set (always re-centering the followed point at the viewBox center, exploiting `preserveAspectRatio`'s own centering) and only commits that value back into real state on the frame focus is turned off — so toggling focus off doesn't snap the camera back to a stale position. `StationPopover` and `LineLegend` are plain HTML overlays (not SVG), specifically so their text renders at a fixed real pixel size regardless of map zoom/viewBox scale.

### Layout shell

`App.tsx`: fixed `Header` (shows the compressed in-game clock, 12h format, plus the latest delay-news headline) + tab content (`flex-1`) + `TabBar`, three tabs (Home/Mission/Settings) switched via local `useState`, no router.
