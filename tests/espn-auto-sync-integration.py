#!/usr/bin/env python3
"""End-to-end test for the local ESPN receiver and automatic Git push."""

import importlib.util
import json
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = SOURCE_ROOT / "tools" / "espn-bridge-server.py"
EXAMPLE_PATH = SOURCE_ROOT / "data" / "examples" / "espn-snapshot.example.json"


def git(repo, *args):
    return subprocess.run(
        ["git", *args], cwd=repo, check=True, text=True, capture_output=True
    ).stdout.strip()


def configure(repo):
    git(repo, "config", "user.name", "ESPN IQ Test")
    git(repo, "config", "user.email", "espn-iq-test@example.invalid")


def post(url, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def main():
    with tempfile.TemporaryDirectory(prefix="espn-auto-sync-") as temp:
        temp = Path(temp)
        remote = temp / "remote.git"
        seed = temp / "seed"
        worker = temp / "worker"
        peer = temp / "peer"

        subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
        subprocess.run(["git", "init", "-b", "main", str(seed)], check=True, capture_output=True)
        configure(seed)
        (seed / "data" / "live").mkdir(parents=True)
        (seed / "data" / "live" / "espn.json").write_text("{}\n", encoding="utf-8")
        (seed / "README.md").write_text("integration fixture\n", encoding="utf-8")
        git(seed, "add", ".")
        git(seed, "commit", "-m", "seed")
        git(seed, "remote", "add", "origin", str(remote))
        git(seed, "push", "-u", "origin", "main")
        git(remote, "symbolic-ref", "HEAD", "refs/heads/main")

        subprocess.run(["git", "clone", str(remote), str(worker)], check=True, capture_output=True)
        subprocess.run(["git", "clone", str(remote), str(peer)], check=True, capture_output=True)
        configure(worker)
        configure(peer)

        spec = importlib.util.spec_from_file_location("espn_bridge_server", SERVER_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.ROOT = worker
        module.OUTPUT = worker / "data" / "live" / "espn.json"
        module.AUTO_PUSH = True

        server = HTTPServer(("127.0.0.1", 0), module.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/espn-sync"

        try:
            snapshot = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
            snapshot["meta"]["week"] = 41
            status, result = post(url, snapshot)
            assert status == 200 and result["ok"] and result["pushed"], result

            verify = temp / "verify-first"
            subprocess.run(["git", "clone", str(remote), str(verify)], check=True, capture_output=True)
            published = json.loads((verify / "data" / "live" / "espn.json").read_text())
            assert published["meta"]["week"] == 41

            with_cookie = json.loads(json.dumps(snapshot))
            with_cookie["Cookie"] = "must-not-be-written"
            status, result = post(url, with_cookie)
            assert status == 400 and not result["ok"], result
            assert "credential-like" in result["error"].lower(), result

            git(peer, "pull", "--rebase", "origin", "main")
            (peer / "README.md").write_text("remote advanced\n", encoding="utf-8")
            git(peer, "add", "README.md")
            git(peer, "commit", "-m", "advance remote")
            git(peer, "push", "origin", "main")

            snapshot["meta"]["week"] = 42
            status, result = post(url, snapshot)
            assert status == 200 and result["ok"] and result["pushed"], result

            verify = temp / "verify-retry"
            subprocess.run(["git", "clone", str(remote), str(verify)], check=True, capture_output=True)
            published = json.loads((verify / "data" / "live" / "espn.json").read_text())
            assert published["meta"]["week"] == 42
            assert (verify / "README.md").read_text(encoding="utf-8") == "remote advanced\n"
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    print("ESPN automatic sync integration: PASS")


if __name__ == "__main__":
    main()
