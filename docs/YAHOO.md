# Yahoo Fantasy module

Build 0.4.1 establishes the official Yahoo Fantasy API boundary for Sunday Funday IQ.

## Security boundary

`apps/yahoo/` and `data/live/yahoo.json` are public GitHub Pages assets. They must contain football data only. OAuth client secrets, access tokens, refresh tokens, passwords, cookies, and authorization headers must never be written there.

`tools/yahoo-sync.py` runs on a trusted private machine. It reads the Yahoo Client ID and Client Secret from local environment variables and stores OAuth tokens by default at `~/.sunday-funday-iq/yahoo-oauth.json`. That token file is outside the repository and should remain private.

## One-time authorization

1. Confirm the Yahoo Developer application has **Fantasy Sports** API permission enabled.
2. On the trusted machine, set `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` locally. Do not paste either value into GitHub or the public app.
3. The registered callback is `https://devopsbusinessnewb.github.io/sunday-funday-iq/oauth/yahoo/`. Set `YAHOO_REDIRECT_URI` only if the Yahoo app registration is changed later.
4. Run `python tools/yahoo-sync.py --authorize`.
5. Approve access in the browser. Yahoo redirects to the Sunday Funday IQ callback page. Copy the **full redirected URL** back into the local collector; the collector verifies the OAuth `state` value before exchanging the one-time code.

The callback page never receives or stores the Client Secret, access token, or refresh token. After that, the collector uses the saved refresh token to renew access tokens automatically. Yahoo may rotate refresh tokens; the collector always preserves the newest returned refresh token.

## Sync

Run a private sync without publishing:

`python tools/yahoo-sync.py --week 2`

Run a sync and publish the sanitized snapshot to `main`:

`python tools/yahoo-sync.py --week 2 --publish`

If the Yahoo account contains more than one 2026 football team, set `YAHOO_TEAM_KEY` locally so the collector knows which league/team belongs to this module. `YAHOO_LEAGUE_KEY` is normally derived automatically from the team key.

## Current contract

The public snapshot contains `meta`, `league`, `team`, `opponent`, `lineup`, `bench`, `waivers`, and `watch`. Player records support `gameState` and `locked`, and the browser decision engine will not recommend swapping a locked starter or using a locked bench player.

Yahoo fields that are not present in a league/API response remain `null` rather than being invented. In particular, projections and game-lock state are treated as optional inputs until the live Yahoo payload confirms their availability.

## Next validation gate

The first authenticated sync must validate the actual league key, roster, current-week matchup, standings, scoring type, FAAB balance, Yahoo projection availability, and any game-state/lock fields Yahoo exposes for this league. Waiver/free-agent intelligence is intentionally held until this base snapshot is proven against real data.
