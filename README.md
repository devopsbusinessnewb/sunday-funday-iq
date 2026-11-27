# Sunday Funday IQ

Sunday Funday IQ is the production home for Tony's football decision-support tools.

## Production structure

- `index.html` — launcher/home page
- `apps/guillotine/index.html` — Sleeper Guillotine IQ
- `apps/pickem/index.html` — CBS Pick'em IQ
- `apps/espn/index.html` — ESPN Fantasy IQ foundation
- `data/live/` — normalized live-data snapshots consumed by front-end modules
- `tests/` — regression fixtures and validation scripts
- `.github/workflows/` — automated validation
- `docs/` — deployment and module documentation

## Source of truth

The `main` branch of this repository is the production source of truth. Generated copies in ChatGPT conversations or Library are not canonical. For normal development, inspect and modify the repository directly, validate the change, then deploy via GitHub Pages.

## Pick'em data architecture

CBS data is separated from the application code:

- App code: `apps/pickem/index.html`
- Current sanitized CBS snapshot: `data/live/cbs-pickem.json`

A CBS refresh can update only the live JSON without requiring a new Pick'em application build.

## Validation

Pick'em changes are protected by automated regression checks that verify JavaScript syntax and known CBS import fixtures before deployment.

## Operating brief

**Goal:** Have trustworthy inputs before pick and lineup decisions without adding a second collection or publishing path. The tools are advisory; do not submit picks, claims, transactions, or lineup changes as part of a refresh.

- **CBS Pick'em:** The existing Windows bridge publishes the [sanitized snapshot](data/live/cbs-pickem.json); [GitHub Pages](https://devopsbusinessnewb.github.io/sunday-funday-iq/apps/pickem/) serves it separately from app code. Verify the deployed file, correct week, export time, and odds time separately. The app uses 24-hour CBS and 12-hour market cutoffs. Keep the four strategy engines unchanged, preserve verified locked teams and confidence, and never infer submission from a blank or auto-populated slate. Detroit is a pick constraint, not a probability adjustment. Compare weekly Top-2 upside, expected points, and downside without claiming season-title odds. No additional standings collection.
- **Sleeper Guillotine:** The [production app](https://devopsbusinessnewb.github.io/sunday-funday-iq/apps/guillotine/) reads Sleeper directly on open or Refresh; treat roster, weekly scores, FAAB, league rules, and projection scoring format as separate inputs to verify. The [historical worker](workers/guillotine/README.md) exists, but its output is not the production app's data source. Do not stand up another collector or publish roster details as a substitute for confirming the existing read path.
- **Verified November 27, 2026:** The served Pick'em app and Week 12 snapshot matched GitHub main, and CBS regression checks passed. The bridge published version 2.4.1, but the live on-demand status request returned HTTP 503 from the cloud environment; a successful snapshot publish does not verify the phone refresh path. The Guillotine app was served and the league roster and scoreboard were independently readable from Sleeper via a connected read-only tool. [PR #33](https://github.com/devopsbusinessnewb/sunday-funday-iq/pull/33) now prefers the league’s matching projection format for both weeks. CI, the deployed projection code against live Sleeper inputs, and the Week 12 dashboard render passed. This does not verify any particular phone or change provider state.
- **Next:** Check deployed data freshness and the Sleeper read path before kickoff. For a CBS failure, distinguish publishing/hosting from the existing on-demand bridge path before retrying. For Guillotine, distinguish unavailable inputs from valid empty or zero results. The legacy projection fallback still applies when the matching field is missing; do not treat a fallback number as a verified format match. Follow [deployment guidance](docs/DEPLOYMENT.md) and [CBS worker diagnostics](docs/CBS-WORKER-RELIABILITY.md).

## ESPN

The ESPN module is being built with private-league credentials kept outside the public repository. See `docs/ESPN.md`.
