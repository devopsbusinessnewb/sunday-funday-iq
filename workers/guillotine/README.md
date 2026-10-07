# Guillotine mini-PC worker

Purpose: move persistent Sleeper collection/history off the iPhone/browser while keeping GitHub as source of truth and the existing Sunday Funday IQ app as the experience layer.

## What this first phase does

- Pulls current league state from Sleeper's public API.
- Captures all rosters, current-week scores, FAAB usage, recent transactions and the full unrostered QB/RB/WR/TE pool.
- Stores historical snapshots in local SQLite at `C:\Server\Data\SundayFundayIQ\guillotine.db` by default.
- Caches the large Sleeper player directory locally under `C:\Server\Cache\SundayFundayIQ`.
- Writes a sanitized application snapshot to `data/live/guillotine.json`.
- Can optionally commit/push that snapshot with `--publish`.

No Sleeper credentials are required. No browser automation is used.

## Important safety rule

The first phase intentionally marks every available player `UNVERIFIED` for immediate-use eligibility. Sleeper availability means a player is unrostered; it does not prove that the player is active, healthy, not suspended/exempt, or otherwise usable this week. External status validation is the next layer and recommendation code should not treat an `UNVERIFIED` player as a safe immediate-use target.

## Run manually

From the repository root:

```powershell
python workers\guillotine\collector.py
```

To also publish the live snapshot to GitHub:

```powershell
python workers\guillotine\collector.py --publish
```

## Mini-PC defaults

- League: Chop Suey Guillotine League (`1383615005433274368`)
- Sunday_Funday roster ID: `18`
- SQLite: `C:\Server\Data\SundayFundayIQ\guillotine.db`
- Player cache: `C:\Server\Cache\SundayFundayIQ\sleeper_players_nfl.json`
- Published snapshot: `<repo>\data\live\guillotine.json`

Defaults can be overridden with command-line arguments or environment variables:

- `SFIQ_GUILLOTINE_LEAGUE_ID`
- `SFIQ_GUILLOTINE_ROSTER_ID`
- `SFIQ_GUILLOTINE_DB`
- `SFIQ_DATA_DIR`
- `SFIQ_CACHE_DIR`

## Planned next layers

1. Add an external player-status gate (injury / out / suspension / exempt / bye) with explicit freshness.
2. Add multi-week roster construction analysis using the one-bench constraint.
3. Feed the worker snapshot into the existing Guillotine PWA, retaining direct Sleeper reads as a fallback during rollout.
4. Add FAAB market learning and manager-intent models from the local historical database.
5. Add a private Tailscale refresh endpoint after the collector is stable, mirroring the proven CBS trigger pattern without exposing the mini-PC publicly.
