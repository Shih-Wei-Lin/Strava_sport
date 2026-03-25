## Stage 1: Extract Export Helpers
**Goal**: Move export serialization and file-download helpers out of `app.js` into a dedicated module without changing output shape.
**Success Criteria**: Export buttons still produce the same JSON/Markdown payloads and `app.js` is smaller and more focused.
**Tests**: `npm test`, `npm run check`
**Status**: Complete

## Stage 2: Isolate Strava Data Access
**Goal**: Separate Strava API and IndexedDB access helpers from UI orchestration.
**Success Criteria**: Network/cache logic can be read independently from rendering code, with no UI behavior regressions.
**Tests**: `npm test`, `npm run check`
**Status**: Not Started

## Stage 3: Reduce Repeated Analytics Passes
**Goal**: Consolidate repeated run-list scans in analytics utilities.
**Success Criteria**: Derived metrics are computed with fewer redundant filters/reduces and existing analytics tests remain green.
**Tests**: `npm test`
**Status**: Not Started

## Stage 4: Add Refactor Safety Nets
**Goal**: Add lightweight tests around export serialization and key non-UI helpers.
**Success Criteria**: Core refactor targets have automated coverage beyond the existing analytics suite.
**Tests**: `npm test`
**Status**: Not Started
