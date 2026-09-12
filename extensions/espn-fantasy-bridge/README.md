# ESPN Fantasy IQ Bridge

Chrome extension prototype for Sunday Funday IQ.

## Purpose
The bridge uses the ESPN Fantasy page that is already signed in in Chrome, calls ESPN through that browser session, and normalizes the response into the Sunday Funday IQ ESPN snapshot contract. It never reads, exports, stores, or publishes ESPN session cookies.

## Current flow
1. Open your ESPN Fantasy league in Chrome.
2. Open the extension.
3. League ID and team ID are inferred from the ESPN URL when available; otherwise enter them once.
4. Click **Capture ESPN Snapshot**.
5. The bridge fetches ESPN data in the page context, sanitizes it, and stores only the normalized snapshot in extension storage.
6. If `tools/espn-bridge-server.py` is running locally, the snapshot is sent automatically to `data/live/espn.json`.
7. If the local service is not running, **Download Last Snapshot** remains available as a fallback.

## Local IQ sync
Run from the repository root:

```bash
python tools/espn-bridge-server.py
```

To let the local service commit and push ESPN data automatically after each successful capture:

```bash
set SFIQ_AUTO_PUSH=1
python tools/espn-bridge-server.py
```

The server binds only to `127.0.0.1:43127` and rejects payloads containing credential-like keys such as `espn_s2`, `SWID`, `Cookie`, or `Authorization`.

## Security boundary
The public GitHub Pages app receives only the sanitized snapshot. ESPN authentication remains inside the ESPN browser session.
