from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

API = "https://api.sleeper.app/v1"
DEFAULT_LEAGUE_ID = "1383615005433274368"
DEFAULT_ROSTER_ID = 18
POSITIONS = {"QB", "RB", "WR", "TE"}

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LIVE_PATH = REPO_ROOT / "data" / "live" / "guillotine.json"
DEFAULT_DATA_DIR = Path(os.environ.get("SFIQ_DATA_DIR", r"C:\Server\Data\SundayFundayIQ"))
DEFAULT_CACHE_DIR = Path(os.environ.get("SFIQ_CACHE_DIR", r"C:\Server\Cache\SundayFundayIQ"))
DEFAULT_DB_PATH = Path(os.environ.get("SFIQ_GUILLOTINE_DB", str(DEFAULT_DATA_DIR / "guillotine.db")))
PLAYERS_CACHE = DEFAULT_CACHE_DIR / "sleeper_players_nfl.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_json(path: str, retries: int = 3, timeout: int = 20) -> Any:
    url = path if path.startswith("http") else f"{API}{path}"
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "SundayFundayIQ-Guillotine/1.0"})
            with urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last}")


def load_players(cache_hours: int = 12) -> dict[str, Any]:
    DEFAULT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if PLAYERS_CACHE.exists():
        age_hours = (time.time() - PLAYERS_CACHE.stat().st_mtime) / 3600
        if age_hours <= cache_hours:
            return json.loads(PLAYERS_CACHE.read_text(encoding="utf-8"))
    players = fetch_json("/players/nfl", retries=3, timeout=45)
    PLAYERS_CACHE.write_text(json.dumps(players), encoding="utf-8")
    return players


def player_name(p: dict[str, Any]) -> str:
    full = (p.get("full_name") or "").strip()
    if full:
        return full
    return " ".join(x for x in [p.get("first_name"), p.get("last_name")] if x).strip()


def team_name_for_user(user: dict[str, Any]) -> str:
    meta = user.get("metadata") or {}
    return meta.get("team_name") or user.get("display_name") or user.get("username") or "Unknown"


def ensure_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            captured_at TEXT NOT NULL,
            league_id TEXT NOT NULL,
            week INTEGER NOT NULL,
            state_hash TEXT NOT NULL,
            payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_snapshots_league_week
            ON snapshots(league_id, week, captured_at);

        CREATE TABLE IF NOT EXISTS transactions (
            transaction_id TEXT PRIMARY KEY,
            captured_at TEXT NOT NULL,
            week INTEGER,
            type TEXT,
            status TEXT,
            roster_ids_json TEXT,
            adds_json TEXT,
            drops_json TEXT,
            faab_bid INTEGER,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS roster_players (
            captured_at TEXT NOT NULL,
            roster_id INTEGER NOT NULL,
            player_id TEXT NOT NULL,
            is_starter INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (captured_at, roster_id, player_id)
        );

        CREATE TABLE IF NOT EXISTS available_players (
            captured_at TEXT NOT NULL,
            player_id TEXT NOT NULL,
            name TEXT,
            position TEXT,
            team TEXT,
            status TEXT,
            injury_status TEXT,
            PRIMARY KEY (captured_at, player_id)
        );
        """
    )
    return db


def normalize_transaction(tx: dict[str, Any], players: dict[str, Any]) -> dict[str, Any]:
    settings = tx.get("settings") or {}
    adds = tx.get("adds") or {}
    drops = tx.get("drops") or {}

    def rows(mapping: dict[str, Any]) -> list[dict[str, Any]]:
        out = []
        for pid, roster_id in mapping.items():
            p = players.get(str(pid), {}) or {}
            out.append({
                "id": str(pid),
                "name": player_name(p) or str(pid),
                "position": p.get("position"),
                "team": p.get("team"),
                "rosterId": roster_id,
            })
        return out

    return {
        "id": str(tx.get("transaction_id")),
        "type": tx.get("type"),
        "status": tx.get("status"),
        "created": tx.get("created"),
        "rosterIds": tx.get("roster_ids") or [],
        "adds": rows(adds),
        "drops": rows(drops),
        "faabBid": settings.get("waiver_bid"),
    }


def material_hash(snapshot: dict[str, Any]) -> str:
    material = dict(snapshot)
    material.pop("generatedAt", None)
    material.pop("collector", None)
    raw = json.dumps(material, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def run_git_publish(live_path: Path) -> bool:
    rel = live_path.relative_to(REPO_ROOT)
    subprocess.run(["git", "add", str(rel)], cwd=REPO_ROOT, check=True)
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO_ROOT)
    if diff.returncode == 0:
        return False
    subprocess.run(["git", "commit", "-m", "Refresh Guillotine live data"], cwd=REPO_ROOT, check=True)
    subprocess.run(["git", "pull", "--rebase"], cwd=REPO_ROOT, check=True)
    subprocess.run(["git", "push"], cwd=REPO_ROOT, check=True)
    return True


def collect(league_id: str, my_roster_id: int, db_path: Path, live_path: Path) -> dict[str, Any]:
    captured_at = utc_now()
    state = fetch_json("/state/nfl")
    week = int(state.get("week") or 1)
    league = fetch_json(f"/league/{league_id}")
    rosters = fetch_json(f"/league/{league_id}/rosters")
    users = fetch_json(f"/league/{league_id}/users")
    matchups = fetch_json(f"/league/{league_id}/matchups/{week}")
    players = load_players()

    tx_raw: list[dict[str, Any]] = []
    for tx_week in sorted({max(1, week - 1), week}):
        try:
            tx_raw.extend(fetch_json(f"/league/{league_id}/transactions/{tx_week}"))
        except RuntimeError:
            pass

    users_by_id = {str(u.get("user_id")): u for u in users}
    rostered_ids: set[str] = set()
    roster_rows = []
    my_roster = None
    waiver_budget = int((league.get("settings") or {}).get("waiver_budget") or 1000)

    matchup_by_roster = {int(m.get("roster_id")): m for m in matchups if m.get("roster_id") is not None}

    for roster in rosters:
        rid = int(roster.get("roster_id"))
        owner_id = str(roster.get("owner_id") or "")
        user = users_by_id.get(owner_id, {})
        ids = [str(x) for x in (roster.get("players") or [])]
        starters = {str(x) for x in (roster.get("starters") or [])}
        rostered_ids.update(ids)
        settings = roster.get("settings") or {}
        used = int(settings.get("waiver_budget_used") or 0)
        row = {
            "rosterId": rid,
            "ownerId": owner_id,
            "ownerName": user.get("display_name") or user.get("username"),
            "teamName": team_name_for_user(user),
            "faabUsed": used,
            "faabRemaining": max(0, waiver_budget - used),
            "points": (matchup_by_roster.get(rid, {}) or {}).get("points", 0),
            "players": [],
        }
        for pid in ids:
            p = players.get(pid, {}) or {}
            row["players"].append({
                "id": pid,
                "name": player_name(p) or pid,
                "position": p.get("position"),
                "team": p.get("team"),
                "status": p.get("status"),
                "injuryStatus": p.get("injury_status"),
                "starter": pid in starters,
            })
        roster_rows.append(row)
        if rid == my_roster_id:
            my_roster = row

    available = []
    for pid, p in players.items():
        if str(pid) in rostered_ids:
            continue
        if (p or {}).get("position") not in POSITIONS:
            continue
        name = player_name(p or {})
        if not name:
            continue
        available.append({
            "id": str(pid),
            "name": name,
            "position": p.get("position"),
            "team": p.get("team"),
            "status": p.get("status"),
            "injuryStatus": p.get("injury_status"),
            "active": p.get("active"),
            "eligibility": "UNVERIFIED",
            "eligibilityNote": "Sleeper availability only; external status validation not yet connected.",
        })
    available.sort(key=lambda x: (x.get("position") or "", x.get("name") or ""))

    tx = [normalize_transaction(x, players) for x in tx_raw]
    # Deduplicate because a transaction can appear in more than one requested window.
    tx = list({x["id"]: x for x in tx if x.get("id") and x.get("id") != "None"}.values())
    tx.sort(key=lambda x: x.get("created") or 0, reverse=True)

    snapshot = {
        "schemaVersion": 1,
        "generatedAt": captured_at,
        "collector": {
            "mode": "mini-pc",
            "source": "Sleeper public API",
            "statusValidation": "sleeper_only",
        },
        "freshness": {
            "sleeper": {"status": "fresh", "asOf": captured_at},
            "playerStatus": {"status": "partial", "asOf": captured_at, "note": "External NFL status gate not connected yet."},
        },
        "league": {
            "id": league_id,
            "name": league.get("name"),
            "season": league.get("season"),
            "status": league.get("status"),
            "week": week,
            "rosterPositions": league.get("roster_positions") or [],
            "waiverBudget": waiver_budget,
        },
        "myRosterId": my_roster_id,
        "myRoster": my_roster,
        "rosters": roster_rows,
        "availablePlayers": available,
        "transactions": tx,
        "warnings": [
            "Available means unrostered in Sleeper; it does not yet mean medically or administratively eligible to play.",
            "Recommendation logic should not treat UNVERIFIED players as safe immediate-use targets.",
        ],
    }
    snapshot["stateHash"] = material_hash(snapshot)

    db = ensure_db(db_path)
    try:
        db.execute(
            "INSERT INTO snapshots(captured_at, league_id, week, state_hash, payload_json) VALUES(?,?,?,?,?)",
            (captured_at, league_id, week, snapshot["stateHash"], json.dumps(snapshot, separators=(",", ":"))),
        )
        for x in tx:
            db.execute(
                """INSERT INTO transactions(transaction_id,captured_at,week,type,status,roster_ids_json,adds_json,drops_json,faab_bid,raw_json)
                   VALUES(?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(transaction_id) DO UPDATE SET captured_at=excluded.captured_at,status=excluded.status,raw_json=excluded.raw_json""",
                (x["id"], captured_at, week, x.get("type"), x.get("status"), json.dumps(x.get("rosterIds")), json.dumps(x.get("adds")), json.dumps(x.get("drops")), x.get("faabBid"), json.dumps(x)),
            )
        for r in roster_rows:
            for p in r["players"]:
                db.execute(
                    "INSERT OR REPLACE INTO roster_players(captured_at,roster_id,player_id,is_starter) VALUES(?,?,?,?)",
                    (captured_at, r["rosterId"], p["id"], 1 if p["starter"] else 0),
                )
        for p in available:
            db.execute(
                "INSERT OR REPLACE INTO available_players(captured_at,player_id,name,position,team,status,injury_status) VALUES(?,?,?,?,?,?,?)",
                (captured_at, p["id"], p["name"], p["position"], p.get("team"), p.get("status"), p.get("injuryStatus")),
            )
        db.commit()
    finally:
        db.close()

    live_path.parent.mkdir(parents=True, exist_ok=True)
    live_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    return snapshot


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect and persist Sunday Funday IQ Guillotine league state.")
    parser.add_argument("--league-id", default=os.environ.get("SFIQ_GUILLOTINE_LEAGUE_ID", DEFAULT_LEAGUE_ID))
    parser.add_argument("--roster-id", type=int, default=int(os.environ.get("SFIQ_GUILLOTINE_ROSTER_ID", DEFAULT_ROSTER_ID)))
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--live", type=Path, default=DEFAULT_LIVE_PATH)
    parser.add_argument("--publish", action="store_true", help="Commit and push data/live/guillotine.json if it changed.")
    args = parser.parse_args()

    try:
        snapshot = collect(args.league_id, args.roster_id, args.db, args.live)
        print(f"Guillotine snapshot OK | week {snapshot['league']['week']} | {len(snapshot['availablePlayers'])} available | {len(snapshot['transactions'])} transactions")
        if args.publish:
            changed = run_git_publish(args.live)
            print("Published to GitHub." if changed else "No material file change to publish.")
        return 0
    except Exception as exc:
        print(f"Guillotine collector FAILED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
