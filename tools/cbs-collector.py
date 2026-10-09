#!/usr/bin/env python3
"""Persistent-browser CBS collector for Sunday Funday IQ."""
import importlib.util
import argparse, json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('Playwright is not installed. Run: pip install playwright && playwright install chromium',file=sys.stderr); raise SystemExit(2)
RAW_POOL_URL=os.environ.get('SFIQ_CBS_POOL_URL','').strip().rstrip('/')
_POOL_MATCH=re.match(r'^(https://picks\.cbssports\.com/football/pickem/pools/[^/?#]+)',RAW_POOL_URL,re.I)
POOL_URL=_POOL_MATCH.group(1) if _POOL_MATCH else RAW_POOL_URL
LOCAL_APPDATA=os.environ.get('LOCALAPPDATA')
DEFAULT_PROFILE=Path(LOCAL_APPDATA)/'SundayFundayIQ'/'cbs-profile' if LOCAL_APPDATA else Path.home()/'.sfiq'/'cbs-profile'
PROFILE_DIR=Path(os.environ.get('SFIQ_CBS_PROFILE_DIR',str(DEFAULT_PROFILE))).expanduser()
RECEIVER=os.environ.get('SFIQ_CBS_RECEIVER','http://127.0.0.1:43128/cbs-capture')
HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','1')=='1'
_runtime_spec=importlib.util.spec_from_file_location('cbs_worker_runtime',Path(__file__).with_name('cbs-worker-runtime.py'))
runtime=importlib.util.module_from_spec(_runtime_spec); _runtime_spec.loader.exec_module(runtime)
def iso_now(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def open_context(p,headless):
    PROFILE_DIR.mkdir(parents=True,exist_ok=True); kwargs=dict(user_data_dir=str(PROFILE_DIR),headless=headless,viewport={'width':1440,'height':1000})
    try: return p.chromium.launch_persistent_context(channel='chrome',**kwargs)
    except Exception: return p.chromium.launch_persistent_context(**kwargs)
def page_text(page):
    try: return page.locator('body').inner_text(timeout=15000)
    except Exception: return ''
def visit(page,url,wait_ms=3500):
    page.goto(url,wait_until='domcontentloaded',timeout=60000); page.wait_for_timeout(wait_ms); return {'text':page_text(page)[:1_500_000],'title':page.title(),'ts':iso_now(),'url':page.url}
def assert_logged_in(snap):
    if 'picks.cbssports.com' not in snap.get('url','') or '/football/pickem/' not in snap.get('url','') or 'Week ' not in snap.get('text',''): raise RuntimeError('CBS login/session appears expired. Re-run with --login.')
def parse_week(*texts):
    joined='\n'.join(str(t or '') for t in texts)
    m=re.search(r'\bWeek\s+(\d{1,2})\b',joined,re.I)
    if not m: raise RuntimeError('Could not determine current CBS week before loading odds.')
    return int(m.group(1))
def post_capture(capture):
    req=urllib.request.Request(RECEIVER,data=json.dumps(capture).encode(),method='POST',headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=90) as r: return json.loads(r.read().decode())
    except urllib.error.HTTPError as exc:
        try: detail=exc.read().decode('utf-8','replace')
        except Exception: detail=''
        raise RuntimeError(f'CBS receiver rejected capture ({exc.code}): {detail or exc.reason}') from exc
def login_mode():
    if not POOL_URL: raise RuntimeError('Set SFIQ_CBS_POOL_URL before first login.')
    with sync_playwright() as p:
        ctx=open_context(p,False)
        try:
            page=ctx.pages[0] if ctx.pages else ctx.new_page(); page.goto(POOL_URL,wait_until='domcontentloaded',timeout=60000)
            print('Log into CBS in the dedicated Sunday Funday IQ Chrome window.'); input('When the Pick’em pool is visible, press Enter here... '); assert_logged_in({'url':page.url,'text':page_text(page)}); print('CBS session saved in',PROFILE_DIR)
        finally: ctx.close()
def collect(debug_odds=False):
    if not POOL_URL: raise RuntimeError('Set SFIQ_CBS_POOL_URL on the mini-PC.')
    with sync_playwright() as p:
        ctx=open_context(p,HEADLESS)
        try:
            page=ctx.pages[0] if ctx.pages else ctx.new_page()
            picks=visit(page,POOL_URL); assert_logged_in(picks)
            standings=visit(page,POOL_URL+'/standings/weekly',4000)
            week=parse_week(picks.get('text'),standings.get('text'))
            season=datetime.now().year
            odds_url=f'https://www.cbssports.com/nfl/odds/{season}/regular/week-{week}/'
            odds=visit(page,odds_url,4500)
            picks['title']='NFL Football Tourney | Picks'
            standings['title']='NFL Football Tourney | Weekly Standings'
            odds['title']=f'CBS NFL Odds | Week {week}'
            if debug_odds:
                print(f'ODDS_URL={odds_url}')
                print('\n'.join(odds.get('text','').splitlines()[:220]))
            capture={'product':'CBS Pick’em IQ automated local capture','version':'1.0.3','exportedAt':iso_now(),'privacy':'Raw browser text remains local and is sent only to the localhost sanitizer.','snapshots':[picks,standings,odds]}
            result=post_capture(capture)
            if not result.get('ok'): raise RuntimeError(result.get('error') or 'CBS receiver rejected capture')
            print(json.dumps(result))
        finally: ctx.close()
def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--login',action='store_true'); parser.add_argument('--debug-odds',action='store_true'); args=parser.parse_args()
    try:
        with runtime.ProfileLock(PROFILE_DIR):
            if args.login: login_mode()
            else: runtime.run_recorded(lambda: collect(args.debug_odds))
    except runtime.CollectorBusy as exc:
        print(str(exc),file=sys.stderr)
        raise SystemExit(75)
if __name__=='__main__': main()
