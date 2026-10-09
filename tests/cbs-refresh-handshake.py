#!/usr/bin/env python3
"""Regression test for the private phone -> mini-PC CBS refresh handshake.

No CBS account, browser, GitHub push, or external network is used. The real
bridge HTTP handler is exercised on an ephemeral localhost port while the
collector is replaced with a deterministic fake.
"""
import importlib.util
import json
import threading
import time
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
BRIDGE_PATH = ROOT / 'tools' / 'cbs-bridge-server.py'
spec = importlib.util.spec_from_file_location('sfiq_cbs_bridge', BRIDGE_PATH)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

PAYLOAD = {
    'product': "CBS Pick'em IQ Bridge — sanitized live input",
    'version': 'test',
    'season': 2026,
    'week': 5,
    'poolSize': 94,
    'exportedAt': '2026-10-09T05:00:00Z',
    'confidenceStatus': 'unsubmitted',
    'market': [],
    'snapshots': [],
}


def request_json(url, method='GET'):
    req = urllib.request.Request(url, data=(b'' if method == 'POST' else None), method=method)
    with urllib.request.urlopen(req, timeout=3) as response:
        return response.status, response.headers, json.loads(response.read().decode('utf-8'))


with TemporaryDirectory() as tmp:
    bridge.OUTPUT = Path(tmp) / 'cbs-pickem.json'
    with bridge.LOCK:
        bridge.SERVICE.update({
            'refreshing': False,
            'currentRunId': None,
            'lastCompletedRunId': None,
            'lastRefreshStarted': None,
            'lastRefreshFinished': None,
            'lastRefreshOk': None,
            'lastRefreshError': None,
            'lastPublishedAt': None,
            'lastCommit': None,
        })

    def fake_run_collector(run_id=None, claimed=False):
        if not claimed:
            started, run_id = bridge.claim_refresh(run_id)
            if not started:
                return False
        time.sleep(0.08)
        bridge.OUTPUT.write_text(json.dumps(PAYLOAD), encoding='utf-8')
        with bridge.LOCK:
            bridge.SERVICE.update({
                'refreshing': False,
                'currentRunId': None,
                'lastCompletedRunId': run_id,
                'lastRefreshFinished': bridge.iso_now(),
                'lastRefreshOk': True,
                'lastRefreshError': None,
                'lastPublishedAt': PAYLOAD['exportedAt'],
                'lastCommit': 'test123',
            })
        return True

    bridge.run_collector = fake_run_collector
    server = ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{server.server_address[1]}'

    try:
        status, headers, started = request_json(base + '/refresh', 'POST')
        assert status == 202 and started['ok'] and started['runId'], started
        run_id = started['runId']
        assert headers.get('Access-Control-Allow-Origin') == '*'

        # A duplicate phone tap must attach to the same in-flight run, not start
        # another collector/browser process.
        _, _, duplicate = request_json(base + '/refresh', 'POST')
        assert duplicate['alreadyRunning'] is True, duplicate
        assert duplicate['runId'] == run_id, (duplicate, run_id)

        deadline = time.time() + 2
        completed = None
        while time.time() < deadline:
            _, _, status_obj = request_json(base + '/status')
            if status_obj.get('lastCompletedRunId') == run_id:
                completed = status_obj
                break
            time.sleep(0.02)
        assert completed is not None, 'refresh run never reached completed state'
        assert completed['lastRefreshOk'] is True, completed
        assert completed['refreshing'] is False, completed

        _, live_headers, live = request_json(base + '/live')
        assert live['ok'] is True and live['payload']['exportedAt'] == PAYLOAD['exportedAt'], live
        assert live['lastCompletedRunId'] == run_id, live
        assert live_headers.get('Access-Control-Allow-Origin') == '*'
    finally:
        server.shutdown()
        server.server_close()

print('CBS refresh handshake regression passed')
