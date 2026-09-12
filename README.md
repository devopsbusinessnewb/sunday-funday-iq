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

## ESPN

The ESPN module is being built with private-league credentials kept outside the public repository. See `docs/ESPN.md`.
