# ESPN Fantasy IQ Bridge

Chrome extension for Sunday Funday IQ.

## Purpose
The bridge uses the ESPN Fantasy page that is already signed in in Chrome, calls ESPN through that browser session, and normalizes the response into the Sunday Funday IQ ESPN snapshot contract. It never reads, exports, stores, or publishes ESPN session cookies.

## Normal weekly flow
1. Pull the latest Sunday Funday IQ repo when code changes are available.
2. Double-click **Start ESPN IQ Sync.cmd** in the repository root and leave that small window open.
3. Open your ESPN Fantasy league in Chrome.
4. Open the ESPN Fantasy IQ Bridge.
5. Click **Capture ESPN Snapshot**.
6. The bridge sends the sanitized snapshot to the local sync service.
7. The sync service overwrites `data/live/espn.json`, commits the change, and pushes it to `main` automatically.
8. GitHub Pages then serves the refreshed snapshot to Sunday Funday IQ.

That means there is no JSON download, rename, drag/drop, GitHub Desktop commit, or ChatGPT upload in the normal path.

## First-time browser-extension setup
Load `extensions/espn-fantasy-bridge` as an unpacked Chrome extension from `chrome://extensions/` with Developer mode enabled.

## Local IQ sync
`Start ESPN IQ Sync.cmd` launches the local receiver with automatic GitHub push enabled. The underlying command is:

```bat
set SFIQ_AUTO_PUSH=1
python tools\espn-bridge-server.py
```

The server binds only to `127.0.0.1:43127`, validates the normalized payload, and rejects payloads containing credential-like keys such as `espn_s2`, `SWID`, `Cookie`, or `Authorization`.

If `main` changed since the laptop last synced, the service attempts a rebase with autostash and retries the push. If it still cannot push, it returns an error rather than silently claiming success.

## Fallback
If the local service is not running, **Download Last Snapshot** remains available from the extension. The canonical repository target is always `data/live/espn.json`.

## Security boundary
The public GitHub Pages app receives only the sanitized snapshot. ESPN authentication remains inside the ESPN browser session.
