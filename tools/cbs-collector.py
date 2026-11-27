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
AUTH_SELF_MARKER='__SFIQ_AUTHENTICATED_SELF__'
LEGACY_ENTRY_LABEL=os.environ.get('SFIQ_CBS_ENTRY_NAME','').strip()
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
def table_rows(page):
    """Capture standings rows locally; mark the authenticated row when CBS exposes a visual/ARIA hint."""
    try:
        rows=page.locator('tr,[role="row"]')
        out=[]
        for i in range(min(rows.count(),300)):
            row=rows.nth(i)
            text=' '.join(str(row.inner_text(timeout=3000) or '').split())
            if not text: continue
            attrs=[]
            for name in ('class','aria-current','aria-selected','data-current-user','data-testid'):
                try:
                    value=row.get_attribute(name)
                    if value: attrs.append(f'{name}={value}')
                except Exception: pass
            hint=' '.join(attrs).lower()
            is_self=any(token in hint for token in ('aria-current=true','aria-selected=true','current-user','currentuser','my-entry','myentry','is-me','isme','self','highlight'))
            record=('__SFIQ_SELF__ ' if is_self else '')+text
            if record not in out: out.append(record[:1000])
        return out
    except Exception: return []
def assert_logged_in(snap):
    if 'picks.cbssports.com' not in snap.get('url','') or '/football/pickem/' not in snap.get('url','') or 'Week ' not in snap.get('text',''): raise RuntimeError('CBS login/session appears expired. Re-run with --login.')
def parse_week(*texts):
    joined='\n'.join(str(t or '') for t in texts)
    m=re.search(r'\bWeek\s+(\d{1,2})\b',joined,re.I)
    if not m: raise RuntimeError('Could not determine current CBS week before loading odds.')
    return int(m.group(1))
TEAM_ALIASES={'49ERS':'SF','BEARS':'CHI','BENGALS':'CIN','BILLS':'BUF','BRONCOS':'DEN','BROWNS':'CLE','BUCCANEERS':'TB','CARDINALS':'ARI','CHARGERS':'LAC','CHIEFS':'KC','COLTS':'IND','COMMANDERS':'WAS','COWBOYS':'DAL','DOLPHINS':'MIA','EAGLES':'PHI','FALCONS':'ATL','GIANTS':'NYG','JAGUARS':'JAX','JAC':'JAX','JETS':'NYJ','LIONS':'DET','PACKERS':'GB','PANTHERS':'CAR','PATRIOTS':'NE','RAIDERS':'LV','RAMS':'LAR','RAVENS':'BAL','SAINTS':'NO','SEAHAWKS':'SEA','STEELERS':'PIT','TEXANS':'HOU','TITANS':'TEN','VIKINGS':'MIN'}
def team_token(line):
    first=str(line or '').strip().upper().split(' ')[0]
    if first in TEAM_ALIASES: return TEAM_ALIASES[first]
    return first if re.fullmatch(r'[A-Z]{2,3}',first) else ''
def assess_weekly_standings_evidence(week, account_name, current_entry, standings, games, open_games=()):
    """Local diagnostic classifier; not called by the collector or publisher.

    Inputs must come from structured, already-observed CBS UI, not inferred
    from flattened body text. current_entry is a separate CBS-owned signal
    identifying the authenticated entry and week. standings carries the
    observed week and full table rows; games is the ordered matchup headers.
    Each nonempty cell must identify its own matchup; an explicit missed
    marker must be established from CBS semantics before mapping it to
    explicit_missed. open_games contains matchup pairs with an enabled
    control on the same authenticated Picks surface. The result contains no
    identity, picks, confidence values, URLs, or raw content.
    """
    report={'identity':'unknown','alignment':False,'locked_exact':0,
            'locked_missed_explicit':0,'locked_unknown':0,
            'scheduled_exact':0,'open_confirmed':0}
    def label(value):
        return ' '.join(value.split()).casefold() if isinstance(value,str) else ''
    def key(value):
        if not isinstance(value,dict): return None
        a,h=value.get('away'),value.get('home')
        if not isinstance(a,str) or not isinstance(h,str): return None
        a,h=a.strip().upper(),h.strip().upper()
        if not re.fullmatch(r'[A-Z]{2,3}',a) or not re.fullmatch(r'[A-Z]{2,3}',h) or a==h: return None
        return a,h

    if type(week) is not int or not isinstance(current_entry,dict) or not isinstance(standings,dict): return report
    if current_entry.get('week')!=week or standings.get('week')!=week: return report
    account=label(account_name)
    # A profile/row name match alone is not a separate owner-entry signal.
    if not account or current_entry.get('authenticated_own_entry') is not True or label(current_entry.get('label'))!=account:
        return report
    rows=standings.get('rows')
    if not isinstance(rows,list): return report
    matched=[r for r in rows if isinstance(r,dict) and label(r.get('label'))==account]
    if len(matched)!=1:
        report['identity']='ambiguous' if matched else 'missing'
        return report
    report['identity']='verified'
    cells=matched[0].get('cells')
    if not isinstance(games,list) or not games or not isinstance(cells,list) or len(cells)!=len(games): return report
    keys=[key(g) for g in games]
    if None in keys or len(set(keys))!=len(keys): return report
    if any(cell is not None and key(cell)!=game for cell,game in zip(cells,keys)): return report
    report['alignment']=True

    known_open={key(g) for g in open_games} if isinstance(open_games,(tuple,list)) else set()
    valid=[]
    for cell,game in zip(cells,keys):
        pick,confidence=(cell.get('pick'),cell.get('confidence')) if cell else (None,None)
        exact=(isinstance(pick,str) and pick in game and type(confidence) is int
               and 1<=confidence<=len(games) and cell.get('explicit_missed') is not True)
        valid.append(confidence if exact else None)
    for header,game,cell,confidence in zip(games,keys,cells,valid):
        phase=header.get('phase')
        exact=confidence is not None and valid.count(confidence)==1
        missed=(cell is not None and cell.get('explicit_missed') is True
                and cell.get('pick') is None and cell.get('confidence') is None)
        if phase in ('started','final'):
            report['locked_exact' if exact else 'locked_missed_explicit' if missed else 'locked_unknown']+=1
        elif phase=='scheduled':
            if exact: report['scheduled_exact']+=1
            if game in known_open: report['open_confirmed']+=1
    return report


def authenticated_self_block(text):
    """Recover the signed-in user's complete confidence card from Picks."""
    raw=str(text or '')
    pm=re.search(r'\b(\d+)\s*/\s*(\d+)\s+Picks\b',raw,re.I)
    if not pm or int(pm.group(1))!=int(pm.group(2)): return ''
    n=int(pm.group(2)); lines=[x.strip() for x in raw.splitlines()]; pairs=[]
    for i,line in enumerate(lines):
        wm=re.fullmatch(r'(\d{1,2})\s+Pts?',line,re.I)
        if not wm: continue
        candidates=[]
        for j in range(i-1,max(-1,i-12),-1):
            if re.fullmatch(r'(\d{1,2})\s+Pts?',lines[j],re.I): break
            team=team_token(lines[j])
            if team and team not in candidates: candidates.append(team)
        # Plain body text can contain both matchup teams around one confidence
        # control. In that case the visual selection is lost, so guessing is unsafe.
        if len(candidates)==1: pairs.append((candidates[0],int(wm.group(1))))
    if len(pairs)<n:
        old=[]
        for i,line in enumerate(lines):
            wm=re.fullmatch(r'\((\d{1,2})\)',line)
            if not wm: continue
            candidates=[]
            for j in range(i-1,max(-1,i-8),-1):
                if re.fullmatch(r'\((\d{1,2})\)',lines[j]): break
                team=team_token(lines[j])
                if team and team not in candidates: candidates.append(team)
            if len(candidates)==1: old.append((candidates[0],int(wm.group(1))))
        if len(old)>=n: pairs=old
    for start in range(max(0,len(pairs)-n+1)):
        window=pairs[start:start+n]
        if len(window)==n and len({t for t,_ in window})==n and sorted(w for _,w in window)==list(range(1,n+1)):
            out=['',AUTH_SELF_MARKER]
            if LEGACY_ENTRY_LABEL: out.append(LEGACY_ENTRY_LABEL)
            for team,w in window: out.extend([team,f'({w})'])
            return '\n'.join(out)
    return ''
def fetch_week_slate(season,week):
    """Get the complete NFL week so finished games cannot disappear from IQ."""
    url=f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates={season}&seasontype=2&week={week}'
    req=urllib.request.Request(url,headers={'User-Agent':'SundayFundayIQ/1.0'})
    try:
        with urllib.request.urlopen(req,timeout=20) as r: data=json.loads(r.read().decode())
    except Exception: return []
    slate=[]
    for ev in data.get('events',[]):
        comp=(ev.get('competitions') or [{}])[0]; teams=comp.get('competitors') or []
        away=next((x for x in teams if x.get('homeAway')=='away'),None); home=next((x for x in teams if x.get('homeAway')=='home'),None)
        if not away or not home: continue
        a=team_token((away.get('team') or {}).get('abbreviation')); h=team_token((home.get('team') or {}).get('abbreviation'))
        if not a or not h: continue
        st=(comp.get('status') or {}).get('type') or (ev.get('status') or {}).get('type') or {}; completed=bool(st.get('completed')); winner=None
        if completed:
            if away.get('winner') is True: winner=a
            elif home.get('winner') is True: winner=h
            else:
                try:
                    av=float(away.get('score')); hv=float(home.get('score')); winner=a if av>hv else h if hv>av else None
                except Exception: pass
        slate.append({'away':a,'home':h,'completed':completed,'winner':winner,'statusText':st.get('shortDetail') or st.get('detail') or st.get('description') or ''})
    return slate
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
            page=ctx.pages[0] if ctx.pages else ctx.new_page(); picks=visit(page,POOL_URL); assert_logged_in(picks); standings=visit(page,POOL_URL+'/standings/weekly',4000)
            overall=None
            for overall_url in (POOL_URL+'/standings/overall',POOL_URL+'/standings'):
                try:
                    candidate=visit(page,overall_url,4000); candidate['rows']=table_rows(page); candidate['title']='NFL Football Tourney | Overall Standings'
                    body=str(candidate.get('text') or '')
                    if candidate['rows'] and re.search(r'overall|season|standings',body,re.I):
                        overall=candidate; break
                except Exception:
                    continue
            self_block=authenticated_self_block(picks.get('text',''))
            if self_block: standings['text']=str(standings.get('text',''))+self_block
            week=parse_week(picks.get('text'),standings.get('text')); season=datetime.now().year; slate=fetch_week_slate(season,week); odds_url=f'https://www.cbssports.com/nfl/odds/{season}/regular/week-{week}/'; odds=visit(page,odds_url,4500)
            picks['title']='NFL Football Tourney | Picks'; standings['title']='NFL Football Tourney | Weekly Standings'; odds['title']=f'CBS NFL Odds | Week {week}'
            if debug_odds: print(f'ODDS_URL={odds_url}'); print('\n'.join(odds.get('text','').splitlines()[:220]))
            capture={'product':'CBS Pick’em IQ automated local capture','version':'1.0.10','exportedAt':iso_now(),'privacy':'Raw browser text remains local and is sent only to the localhost sanitizer.','slate':slate,'snapshots':[picks,standings,odds]+([overall] if overall else [])}
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
        print(str(exc),file=sys.stderr); raise SystemExit(75)
if __name__=='__main__': main()
