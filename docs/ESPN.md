# ESPN IQ architecture

## Goal
Build a season-long ESPN fantasy module that answers the weekly question: **what should I change before kickoff?**

## Private-league constraint
ESPN private fantasy leagues use authenticated ESPN session cookies. Those credentials must never be committed to this public repository, embedded in GitHub Pages, copied into the ESPN module, or written to published JSON.

## Preferred architecture: browser-session bridge
The primary path now avoids manually handling ESPN cookies altogether:

1. The user opens their ESPN Fantasy league in Chrome and is already signed in normally.
2. `extensions/espn-fantasy-bridge/` runs an ESPN API request inside that authenticated ESPN page context.
3. The extension receives the ESPN response but normalizes it immediately into the small Sunday Funday IQ contract.
4. Only the sanitized football snapshot is stored by the extension.
5. If `tools/espn-bridge-server.py` is running, the extension posts the sanitized snapshot to `127.0.0.1:43127`.
6. The local service validates the payload and writes `data/live/espn.json`.
7. With `SFIQ_AUTO_PUSH=1`, the trusted local service can commit and push the refreshed ESPN snapshot automatically.
8. The public GitHub Pages ESPN module reads only `data/live/espn.json`.

This keeps ESPN authentication in the browser where it already exists while making the phone-facing IQ app a consumer rather than a maintenance console.

## Fallback collector
`tools/espn-sync.py` remains as a private environment-variable collector for a future always-on mini PC/server. It is not the preferred setup path for the current laptop because it requires manually provisioning ESPN session values.

## Snapshot contract
The ESPN module accepts a normalized JSON object shaped like:

```json
{
  "meta": {"source":"ESPN browser bridge","status":"connected","updatedAt":"...","season":2026,"week":1,"leagueId":"...","teamId":"..."},
  "league": {"name":"...","scoring":"...","waivers":"...","playoffs":"..."},
  "team": {"name":"...","record":"1-0","standing":1,"faabRemaining":100,"score":0,"projection":110.4},
  "opponent": {"name":"...","score":0,"projection":105.2},
  "lineup": [],
  "bench": [],
  "watch": []
}
```

## Decision layer
The ESPN front end computes:
- projected matchup margin
- favorite/underdog context
- starter injury/status alerts
- simple bench-vs-starter projection comparisons
- `KEEP`, `MONITOR`, `CONSIDER BENCH`, and `REPLACE` guidance

## Next engineering steps
- verify the bridge against the actual ESPN league and roster
- improve ESPN team/position display normalization
- add NFL kickoff/lock awareness
- add waiver/free-agent intelligence
- move the local sync service to the future mini PC so ESPN refreshes can run without opening the laptop
