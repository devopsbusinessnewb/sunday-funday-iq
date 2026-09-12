# Sunday Funday IQ deployment workflow

## Source of truth
GitHub `main` is the production source of truth. Chat files and Library copies are reference artifacts only.

## Code changes
Small low-risk UI fixes may go directly to `main` after local validation. Parser, optimizer, data-model, and multi-file changes should use a branch/PR when practical, with regression validation before merge.

## Regression protection
`.github/workflows/validate-pickem.yml` checks JavaScript syntax and runs `tests/pickem-regression.js` whenever Pick'em code, CBS live data, or regression fixtures change. The suite verifies pregame and postgame CBS card reconstruction, unique 1-16 confidence values, and the revealed-field model.

## Data vs. code
CBS live state is published separately at `data/live/cbs-pickem.json`. A CBS refresh should update that data file without requiring a new application build. `apps/pickem/index.html` loads published CBS data on startup when it is newer than browser state. Manual bridge JSON import remains a fallback.
