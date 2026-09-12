#!/usr/bin/env python3
"""Local receiver for ESPN Fantasy IQ Bridge.

Listens only on 127.0.0.1:43127. Accepts sanitized ESPN snapshots from the
Chrome extension and writes data/live/espn.json inside the Sunday Funday IQ
repo. Optionally commits and pushes the data file when SFIQ_AUTO_PUSH=1.

No ESPN cookies or credentials are accepted or stored.
"""
import json, os, subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data' / 'live' / 'espn.json'
AUTO_PUSH = os.environ.get('SFIQ_AUTO_PUSH','0') == '1'
FORBIDDEN = ('espn_s2','swid','cookie','authorization')

def contains_forbidden(value):
    text = json.dumps(value).lower()
    return any(k in text for k in FORBIDDEN)

def validate(snapshot):
    if not isinstance(snapshot, dict): raise ValueError('Snapshot must be an object')
    if contains_forbidden(snapshot): raise ValueError('Credential-like data detected; refusing snapshot')
    if snapshot.get('meta',{}).get('status') != 'connected': raise ValueError('Snapshot status must be connected')
    if not isinstance(snapshot.get('lineup'), list): raise ValueError('Missing lineup array')
    if not isinstance(snapshot.get('bench'), list): raise ValueError('Missing bench array')
    if not snapshot.get('team',{}).get('name'): raise ValueError('Missing team name')

def maybe_push():
    if not AUTO_PUSH: return {'pushed': False, 'reason': 'SFIQ_AUTO_PUSH is not enabled'}
    subprocess.run(['git','add',str(OUTPUT.relative_to(ROOT))], cwd=ROOT, check=True)
    diff = subprocess.run(['git','diff','--cached','--quiet'], cwd=ROOT)
    if diff.returncode == 0: return {'pushed': False, 'reason': 'No ESPN data changes'}
    subprocess.run(['git','commit','-m','data: refresh ESPN snapshot'], cwd=ROOT, check=True)
    subprocess.run(['git','push','origin','main'], cwd=ROOT, check=True)
    return {'pushed': True}

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Access-Control-Allow-Methods','POST,OPTIONS')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        if self.path != '/espn-sync':
            self.send_response(404); self._cors(); self.end_headers(); return
        try:
            length = int(self.headers.get('Content-Length','0'))
            if length <= 0 or length > 2_000_000: raise ValueError('Invalid payload size')
            snapshot = json.loads(self.rfile.read(length).decode('utf-8'))
            validate(snapshot)
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(json.dumps(snapshot, indent=2) + '\n', encoding='utf-8')
            result = maybe_push()
            body = json.dumps({'ok': True, 'path': str(OUTPUT.relative_to(ROOT)), **result}).encode()
            self.send_response(200); self._cors(); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(body)
        except Exception as e:
            body = json.dumps({'ok': False, 'error': str(e)}).encode()
            self.send_response(400); self._cors(); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(body)
    def log_message(self, fmt, *args):
        print('[ESPN IQ]', fmt % args)

if __name__ == '__main__':
    print(f'ESPN IQ sync listening on http://127.0.0.1:43127 -> {OUTPUT}')
    print('Auto-push:', 'ON' if AUTO_PUSH else 'OFF')
    HTTPServer(('127.0.0.1',43127), Handler).serve_forever()
