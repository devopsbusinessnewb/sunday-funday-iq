#!/usr/bin/env python3
"""Local receiver for CBS Pick'em IQ Bridge.

Listens only on 127.0.0.1:43128. Accepts sanitized CBS live payloads from the
Chrome extension and writes data/live/cbs-pickem.json inside the Sunday Funday
IQ repo. When SFIQ_AUTO_PUSH=1, each changed payload is committed and pushed to
main automatically.

Raw CBS scans, pool IDs, participant names, cookies, auth headers, and browser
session data are not accepted by this endpoint.
"""
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data' / 'live' / 'cbs-pickem.json'
AUTO_PUSH = os.environ.get('SFIQ_AUTO_PUSH', '0') == '1'
MAX_BODY = 2_000_000
FORBIDDEN_KEYS = (
    'cookie', 'authorization', 'csrf', 'token', 'jwt', 'session', 'secret',
    'poolid', 'graphqlsummary', 'captures',
)
FORBIDDEN_URL_BITS = ('picks.cbssports.com/football/pickem/pools/', '/graphql?')


def run_git(*args, check=True):
    return subprocess.run(['git', *args], cwd=ROOT, check=check, text=True, capture_output=True)


def lower_blob(value):
    return json.dumps(value, separators=(',', ':')).lower()


def validate(payload):
    if not isinstance(payload, dict):
        raise ValueError('Payload must be an object')

    blob = lower_blob(payload)
    for key in FORBIDDEN_KEYS:
        if f'"{key}"' in blob:
            raise ValueError(f'Forbidden raw/private field detected: {key}')
    for bit in FORBIDDEN_URL_BITS:
        if bit.lower() in blob:
            raise ValueError('Authenticated CBS URL or GraphQL data detected')

    if payload.get('product') != "CBS Pick'em IQ Bridge — sanitized live input":
        raise ValueError('Unexpected CBS payload product')
    if not isinstance(payload.get('season'), int):
        raise ValueError('Missing integer season')
    if not isinstance(payload.get('week'), int):
        raise ValueError('Missing integer week')
    if not isinstance(payload.get('poolSize'), int) or payload['poolSize'] < 1:
        raise ValueError('Missing pool size')
    if payload.get('confidenceStatus') not in ('submitted', 'unsubmitted', 'partial'):
        raise ValueError('Invalid confidenceStatus')

    card = payload.get('myCard')
    if payload.get('confidenceStatus') == 'submitted':
        if not isinstance(card, dict):
            raise ValueError('Submitted payload requires myCard')
        picks = card.get('picks')
        weights = card.get('weights')
        if not isinstance(picks, list) or not isinstance(weights, list) or len(picks) != len(weights):
            raise ValueError('Invalid myCard arrays')
        n = len(picks)
        if n < 1 or sorted(weights) != list(range(1, n + 1)):
            raise ValueError('Submitted confidence weights must be unique 1..N')
        if any(not isinstance(p, str) or not p.strip() for p in picks):
            raise ValueError('Invalid pick value')

    market = payload.get('market')
    if market is not None and not isinstance(market, list):
        raise ValueError('market must be an array')

    field_model = payload.get('fieldModel')
    if field_model is not None:
        if not isinstance(field_model, dict) or not isinstance(field_model.get('locked', []), list):
            raise ValueError('Invalid fieldModel')
        for game in field_model.get('locked', []):
            if not isinstance(game, dict) or not isinstance(game.get('observations', []), list):
                raise ValueError('Invalid fieldModel locked game')
            for obs in game.get('observations', []):
                if not isinstance(obs, dict) or not isinstance(obs.get('pick'), str):
                    raise ValueError('Invalid field observation')
                if not isinstance(obs.get('weight'), int):
                    raise ValueError('Invalid field observation weight')


def push_snapshot():
    if not AUTO_PUSH:
        return {'pushed': False, 'reason': 'SFIQ_AUTO_PUSH is not enabled'}

    rel = str(OUTPUT.relative_to(ROOT)).replace('\\', '/')
    run_git('add', rel)
    if run_git('diff', '--cached', '--quiet', check=False).returncode == 0:
        return {'pushed': False, 'reason': 'No CBS data changes'}

    data = json.loads(OUTPUT.read_text(encoding='utf-8'))
    week = data.get('week', 'unknown')
    run_git('commit', '-m', f'data: refresh CBS week {week}')

    push = run_git('push', 'origin', 'main', check=False)
    if push.returncode != 0:
        rebase = run_git('pull', '--rebase', '--autostash', 'origin', 'main', check=False)
        if rebase.returncode != 0:
            raise RuntimeError('CBS payload committed locally, but GitHub sync needs attention: ' + (rebase.stderr.strip() or rebase.stdout.strip()))
        push = run_git('push', 'origin', 'main', check=False)
        if push.returncode != 0:
            raise RuntimeError('CBS payload committed locally, but push failed: ' + (push.stderr.strip() or push.stdout.strip()))

    return {'pushed': True, 'commit': run_git('rev-parse', '--short', 'HEAD').stdout.strip()}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST,OPTIONS')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path != '/health':
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        body = json.dumps({'ok': True, 'service': 'CBS IQ sync', 'autoPush': AUTO_PUSH}).encode()
        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != '/cbs-sync':
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BODY:
                raise ValueError('Invalid payload size')
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            validate(payload)
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
            result = push_snapshot()
            body = json.dumps({'ok': True, 'path': str(OUTPUT.relative_to(ROOT)), **result}).encode()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({'ok': False, 'error': str(exc)}).encode()
            self.send_response(400)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        print('[CBS IQ]', fmt % args)


if __name__ == '__main__':
    print(f'CBS IQ sync listening on http://127.0.0.1:43128 -> {OUTPUT}')
    print('Auto-push:', 'ON' if AUTO_PUSH else 'OFF')
    print('Only sanitized CBS payloads are accepted. Raw CBS scans are rejected.')
    HTTPServer(('127.0.0.1', 43128), Handler).serve_forever()
