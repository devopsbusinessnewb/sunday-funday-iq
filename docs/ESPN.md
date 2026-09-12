# ESPN IQ architecture

## Goal
Build a season-long ESPN fantasy module that helps answer the weekly question: **what should I change before kickoff?**

## Private-league constraint
ESPN private fantasy leagues use authenticated ESPN session cookies (`espn_s2` and `SWID`). Those credentials must never be committed to this public repository, embedded in GitHub Pages, placed in client-side JavaScript, or written to a published JSON file.

## Architecture
1. A trusted private collector runs on a local machine/server.
2. The collector calls ESPN's fantasy endpoint using private session cookies stored only in the machine environment.
3. The collector normalizes the response into a small Sunday Funday IQ snapshot containing only data needed by the app.
4. The front end reads the sanitized snapshot and renders lineup, matchup, FAAB, roster and decision flags.

`tools/espn-sync.py` is the first collector implementation.

## ESPN endpoint pattern
The collector uses the private-league fantasy endpoint for football and requests repeated views including `mSettings`, `mTeam`, `mRoster`, `mMatchup`, and `mMatchupScore`.

## V0.1 front-end contract
The ESPN module accepts a normalized JSON object shaped like:

```json
{
  "meta": {"source":"ESPN private collector","status":"connected","updatedAt":"...","season":2026,"week":1},
  "league": {"name":"...","scoring":"...","waivers":"...","playoffs":"..."},
  "team": {"name":"...","record":"1-0","standing":1,"faabRemaining":100,"score":0,"projection":110.4},
  "opponent": {"name":"...","score":0,"projection":105.2},
  "lineup": [],
  "bench": [],
  "watch": []
}
```

## Next build
- establish the user's ESPN team ID and verify collector output against the actual private league
- normalize ESPN numeric position/team identifiers into display names
- add actionable start/sit comparisons rather than injury-only flags
- add waiver/free-agent intelligence
- automate private collection and safe delivery without exposing ESPN credentials
