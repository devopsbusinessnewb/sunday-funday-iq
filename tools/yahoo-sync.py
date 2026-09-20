#!/usr/bin/env python3
"""Private Yahoo Fantasy collector for Sunday Funday IQ.

This script runs only on a trusted machine. Yahoo OAuth credentials and tokens stay
outside the repository. The only file intended for GitHub Pages is the sanitized
football snapshot at data/live/yahoo.json.

Environment variables:
  YAHOO_CLIENT_ID          required for authorization/sync
  YAHOO_CLIENT_SECRET      required for authorization/sync
  YAHOO_REDIRECT_URI       optional; defaults to the registered Sunday Funday IQ callback
  YAHOO_TEAM_KEY           optional; auto-discovered when possible
  YAHOO_LEAGUE_KEY         optional; derived from team key when possible
  YAHOO_SEASON             optional; defaults to 2026
  YAHOO_WEEK               optional; defaults to 1
  YAHOO_FAAB_BUDGET        optional; league starting FAAB if Yahoo omits it

Token storage defaults to ~/.sunday-funday-iq/yahoo-oauth.json and is created with
owner-only permissions where the OS supports chmod. Never copy this token file into
the repository.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import time
import webbrowser
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth"
TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token"
API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2"
TOKEN_PATH = Path(os.environ.get("YAHOO_TOKEN_PATH", Path.home() / ".sunday-funday-iq" / "yahoo-oauth.json"))
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "data" / "live" / "yahoo.json"
DEFAULT_REDIRECT_URI = "https://devopsbusinessnewb.github.io/sunday-funday-iq/oauth/yahoo/"


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def require_credentials() -> tuple[str, str]:
    client_id, client_secret = env("YAHOO_CLIENT_ID"), env("YAHOO_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise SystemExit("Set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET on the trusted machine. Do not paste them into GitHub or the public app.")
    return client_id, client_secret


def basic_auth(client_id: str, client_secret: str) -> str:
    raw = f"{client_id}:{client_secret}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def post_token(fields: dict[str, str]) -> dict:
    client_id, client_secret = require_credentials()
    body = urlencode(fields).encode()
    req = Request(TOKEN_URL, data=body, headers={
        "Authorization": basic_auth(client_id, client_secret),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Sunday-Funday-IQ-Yahoo/0.4.1",
    })
    try:
        with urlopen(req, timeout=30) as response:
            return json.load(response)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"Yahoo token request failed ({exc.code}): {detail[:400]}") from exc


def save_tokens(tokens: dict) -> None:
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = load_tokens(optional=True) or {}
    if not tokens.get("refresh_token") and existing.get("refresh_token"):
        tokens["refresh_token"] = existing["refresh_token"]
    tokens["saved_at"] = int(time.time())
    tokens["expires_at"] = int(time.time()) + int(tokens.get("expires_in", 3600)) - 60
    TOKEN_PATH.write_text(json.dumps(tokens, indent=2), encoding="utf-8")
    try:
        os.chmod(TOKEN_PATH, 0o600)
    except OSError:
        pass


def load_tokens(optional: bool = False) -> dict | None:
    if not TOKEN_PATH.exists():
        if optional:
            return None
        raise SystemExit(f"Yahoo is not authorized on this machine yet. Run: python {Path(__file__).name} --authorize")
    return json.loads(TOKEN_PATH.read_text(encoding="utf-8"))


def authorize() -> None:
    client_id, _ = require_credentials()
    redirect_uri = env("YAHOO_REDIRECT_URI", DEFAULT_REDIRECT_URI)
    state = base64.urlsafe_b64encode(os.urandom(18)).decode().rstrip("=")
    auth_url = AUTH_URL + "?" + urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
        "language": "en-us",
    })
    print("Opening Yahoo authorization in your default browser...")
    print("If the browser does not open, paste this URL into the browser on this trusted machine:\n")
    print(auth_url)
    webbrowser.open(auth_url)
    print("\nAfter approval, Yahoo will redirect to the Sunday Funday IQ callback page.")
    redirected = input("Paste the FULL redirected URL from the browser here: ").strip()
    if not redirected:
        raise SystemExit("No redirected URL supplied.")
    parsed = urlparse(redirected)
    params = parse_qs(parsed.query)
    code = (params.get("code") or [""])[0]
    returned_state = (params.get("state") or [""])[0]
    error = (params.get("error") or [""])[0]
    if error:
        raise SystemExit(f"Yahoo authorization returned an error: {error}")
    if not code:
        raise SystemExit("The redirected URL did not contain an authorization code.")
    if returned_state != state:
        raise SystemExit("OAuth state mismatch. Refusing to exchange the authorization code.")
    tokens = post_token({"grant_type": "authorization_code", "redirect_uri": redirect_uri, "code": code})
    save_tokens(tokens)
    print(f"Yahoo authorization saved privately to {TOKEN_PATH}. This file is not part of the repository.")


def access_token() -> str:
    tokens = load_tokens()
    if tokens.get("access_token") and int(tokens.get("expires_at", 0)) > int(time.time()):
        return tokens["access_token"]
    refresh = tokens.get("refresh_token")
    if not refresh:
        raise SystemExit("Yahoo refresh token is missing. Run --authorize again.")
    redirect_uri = env("YAHOO_REDIRECT_URI", DEFAULT_REDIRECT_URI)
    new_tokens = post_token({"grant_type": "refresh_token", "redirect_uri": redirect_uri, "refresh_token": refresh})
    save_tokens(new_tokens)
    return new_tokens["access_token"]


def api_xml(path: str) -> ET.Element:
    token = access_token()
    req = Request(f"{API_BASE}/{path}", headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/xml",
        "User-Agent": "Sunday-Funday-IQ-Yahoo/0.4.1",
    })
    try:
        with urlopen(req, timeout=30) as response:
            payload = response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        if exc.code in (401, 403):
            raise SystemExit(f"Yahoo Fantasy API rejected the request ({exc.code}). Confirm Fantasy Sports API permission is enabled/provisioned for the Yahoo developer app. {detail[:250]}") from exc
        raise SystemExit(f"Yahoo Fantasy API request failed ({exc.code}): {detail[:350]}") from exc
    root = ET.fromstring(payload)
    for node in root.iter():
        if "}" in node.tag:
            node.tag = node.tag.split("}", 1)[1]
    return root


def first_text(node: ET.Element | None, tag: str, default=None):
    if node is None:
        return default
    found = node.find(f".//{tag}")
    if found is None or found.text is None:
        return default
    return found.text.strip()


def path_text(node: ET.Element | None, tags: list[str], default=None):
    cur = node
    for tag in tags:
        if cur is None:
            return default
        cur = cur.find(tag)
    if cur is None or cur.text is None:
        return default
    return cur.text.strip()


def as_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_int(value, default=None):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def league_key_from_team(team_key: str) -> str:
    match = re.match(r"^(.+?\.l\.\d+)\.t\.\d+$", team_key)
    return match.group(1) if match else ""


def discover_team_key(season: int) -> str:
    root = api_xml("users;use_login=1/games;game_keys=nfl/teams")
    candidates = []
    for team in root.findall(".//team"):
        key = first_text(team, "team_key")
        if not key:
            continue
        team_season = as_int(first_text(team, "season"))
        candidates.append((team_season, key, first_text(team, "name", "Yahoo Team")))
    if not candidates:
        raise SystemExit("Yahoo authentication worked, but no Yahoo Fantasy Football team was returned for the signed-in account.")
    matching = [c for c in candidates if c[0] == season]
    choice = matching[0] if matching else candidates[0]
    if len(matching) > 1 and not env("YAHOO_TEAM_KEY"):
        names = ", ".join(f"{name} ({key})" for _, key, name in matching)
        raise SystemExit(f"Multiple {season} Yahoo football teams were found. Set YAHOO_TEAM_KEY locally to the one Sunday Funday IQ should use: {names}")
    return choice[1]


def player_from_xml(player: ET.Element) -> dict:
    selected = player.find(".//selected_position")
    slot = first_text(selected, "position", "BN") if selected is not None else "BN"
    eligible = [p.text.strip() for p in player.findall(".//eligible_positions/position") if p.text]
    projection = as_float(path_text(player.find(".//player_projected_points"), ["total"]))
    points = as_float(path_text(player.find(".//player_points"), ["total"]), 0.0)
    editable = first_text(player, "is_editable")
    game_state = first_text(player, "game_status") or first_text(player, "display_status") or "upcoming"
    locked = editable == "0" or game_state.lower() in {"live", "final", "completed", "in progress"}
    status = first_text(player, "status") or first_text(player, "injury_note") or "Active"
    return {
        "playerKey": first_text(player, "player_key"),
        "slot": slot,
        "name": first_text(player, "full", "Unknown Player"),
        "pos": first_text(player, "display_position", "—").split(",")[0],
        "nflTeam": first_text(player, "editorial_team_abbr"),
        "status": status,
        "projection": projection,
        "points": points,
        "gameState": game_state,
        "locked": locked,
        "eligiblePositions": eligible,
    }


def team_nodes(root: ET.Element) -> list[ET.Element]:
    return list(root.findall(".//team"))


def team_key(node: ET.Element) -> str:
    return first_text(node, "team_key", "")


def build_snapshot(season: int, week: int) -> dict:
    my_team_key = env("YAHOO_TEAM_KEY") or discover_team_key(season)
    league_key = env("YAHOO_LEAGUE_KEY") or league_key_from_team(my_team_key)
    if not league_key:
        raise SystemExit("Could not derive Yahoo league key. Set YAHOO_LEAGUE_KEY locally.")

    team_root = api_xml(f"team/{my_team_key}")
    settings_root = api_xml(f"league/{league_key}/settings")
    standings_root = api_xml(f"league/{league_key}/standings")
    scoreboard_root = api_xml(f"league/{league_key}/scoreboard;week={week}")
    roster_root = api_xml(f"team/{my_team_key}/roster;week={week}/players")

    my_team_node = next((t for t in team_nodes(team_root) if team_key(t) == my_team_key), None) or (team_nodes(team_root)[0] if team_nodes(team_root) else None)
    standing_node = next((t for t in team_nodes(standings_root) if team_key(t) == my_team_key), None)

    my_score_node = None
    opp_score_node = None
    for matchup in scoreboard_root.findall(".//matchup"):
        teams = matchup.findall(".//teams/team") or matchup.findall(".//team")
        keys = [team_key(t) for t in teams]
        if my_team_key in keys:
            my_score_node = next((t for t in teams if team_key(t) == my_team_key), None)
            opp_score_node = next((t for t in teams if team_key(t) != my_team_key), None)
            break

    players = [player_from_xml(p) for p in roster_root.findall(".//player")]
    bench_slots = {"BN", "IR", "IL", "IL+"}
    lineup = [p for p in players if p["slot"] not in bench_slots]
    bench = [p for p in players if p["slot"] in bench_slots]

    wins = as_int(path_text(standing_node, ["team_standings", "outcome_totals", "wins"]), 0)
    losses = as_int(path_text(standing_node, ["team_standings", "outcome_totals", "losses"]), 0)
    ties = as_int(path_text(standing_node, ["team_standings", "outcome_totals", "ties"]), 0)
    record = f"{wins}-{losses}" + (f"-{ties}" if ties else "")
    rank = as_int(path_text(standing_node, ["team_standings", "rank"]))
    faab_remaining = as_float(first_text(standing_node, "faab_balance") or first_text(my_team_node, "faab_balance"))
    faab_budget = as_float(env("YAHOO_FAAB_BUDGET"))
    uses_faab = first_text(settings_root, "uses_faab") == "1"
    scoring = first_text(settings_root, "scoring_type", "Yahoo scoring")
    num_teams = as_int(first_text(settings_root, "num_teams"))
    my_score = as_float(path_text(my_score_node, ["team_points", "total"]), 0.0)
    opp_score = as_float(path_text(opp_score_node, ["team_points", "total"]), 0.0)
    my_proj = as_float(path_text(my_score_node, ["team_projected_points", "total"]))
    opp_proj = as_float(path_text(opp_score_node, ["team_projected_points", "total"]))

    watch = []
    for p in lineup:
        status = str(p.get("status") or "").lower()
        if p.get("locked"):
            continue
        if re.search(r"out|injured reserve|\bir\b|doubtful|inactive|suspended", status):
            watch.append({"priority": "high", "title": f"{p['name']} needs attention", "detail": f"Starting {p['slot']} is listed {p['status']}."})
        elif re.search(r"questionable|game.?time|limited", status):
            watch.append({"priority": "medium", "title": f"Monitor {p['name']}", "detail": f"Starting {p['slot']} is listed {p['status']}."})

    return {
        "meta": {"source": "Yahoo Fantasy API", "status": "connected", "updatedAt": datetime.now(timezone.utc).isoformat(), "season": season, "week": week, "contractVersion": 1},
        "league": {
            "key": league_key,
            "name": first_text(settings_root, "name", "Yahoo Fantasy"),
            "teamCount": num_teams,
            "scoring": scoring,
            "waivers": "FAAB" if uses_faab else first_text(settings_root, "waiver_rule", "Yahoo waivers"),
            "faabBudget": faab_budget,
        },
        "team": {
            "key": my_team_key,
            "name": first_text(my_team_node, "name", "Your Team"),
            "record": record,
            "standing": rank,
            "faabRemaining": faab_remaining,
            "score": my_score,
            "projection": my_proj,
        },
        "opponent": {
            "key": team_key(opp_score_node) if opp_score_node is not None else None,
            "name": first_text(opp_score_node, "name", "Opponent") if opp_score_node is not None else "Opponent",
            "score": opp_score,
            "projection": opp_proj,
        },
        "lineup": lineup,
        "bench": bench,
        "waivers": [],
        "watch": watch,
    }


def assert_sanitized(snapshot: dict) -> None:
    serialized = json.dumps(snapshot).lower()
    forbidden = ("access_token", "refresh_token", "client_secret", "authorization", "cookie", "oauth_token")
    leaks = [word for word in forbidden if word in serialized]
    if leaks:
        raise SystemExit(f"Refusing to write Yahoo snapshot because forbidden credential fields were detected: {', '.join(leaks)}")


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=REPO_ROOT, text=True, capture_output=True)


def publish(output: Path) -> None:
    if output.resolve() != DEFAULT_OUTPUT.resolve():
        raise SystemExit("--publish is only allowed when writing the repository's data/live/yahoo.json")
    pull = git("pull", "--rebase", "--autostash", "origin", "main")
    if pull.returncode:
        raise SystemExit(f"Git pull failed before Yahoo publish: {pull.stderr.strip()}")
    git("add", str(output.relative_to(REPO_ROOT)))
    diff = git("diff", "--cached", "--quiet")
    if diff.returncode == 0:
        print("Yahoo snapshot is unchanged; nothing to publish.")
        return
    commit = git("commit", "-m", f"Update Yahoo live snapshot week {json.loads(output.read_text())['meta']['week']}")
    if commit.returncode:
        raise SystemExit(f"Git commit failed: {commit.stderr.strip()}")
    pushed = git("push", "origin", "main")
    if pushed.returncode:
        raise SystemExit(f"Git push failed: {pushed.stderr.strip()}")
    print("Yahoo sanitized snapshot committed and pushed to main.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Private Yahoo Fantasy collector for Sunday Funday IQ")
    parser.add_argument("--authorize", action="store_true", help="Run the one-time Yahoo browser authorization flow")
    parser.add_argument("--week", type=int, default=int(env("YAHOO_WEEK", "1")))
    parser.add_argument("--season", type=int, default=int(env("YAHOO_SEASON", "2026")))
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--publish", action="store_true", help="Commit and push the sanitized data/live/yahoo.json after sync")
    args = parser.parse_args()
    if args.authorize:
        authorize()
        return
    snapshot = build_snapshot(args.season, args.week)
    assert_sanitized(snapshot)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(f"Wrote sanitized Yahoo snapshot to {args.output}")
    if args.publish:
        publish(args.output)


if __name__ == "__main__":
    main()
