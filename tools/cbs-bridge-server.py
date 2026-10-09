#!/usr/bin/env python3
"""Local automation service for Sunday Funday IQ CBS Pick'em.

Raw CBS page data is accepted only on localhost and is never written to disk.
The service sanitizes it in memory, writes data/live/cbs-pickem.json, and may
commit/push when SFIQ_AUTO_PUSH=1.
"""
import json, os, re, subprocess, sys, threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'data'/'live'/'cbs-pickem.json'
COLLECTOR=ROOT/'tools'/'cbs-collector.py'
AUTO_PUSH=os.environ.get('SFIQ_AUTO_PUSH','0')=='1'
ENTRY_NAME=os.environ.get('SFIQ_CBS_ENTRY_NAME','').strip()
MAX_BODY=8_000_000
FORBIDDEN_KEYS=('cookie','authorization','csrf','token','jwt','session','secret','poolid','graphqlsummary','captures')
FORBIDDEN_URL_BITS=('picks.cbssports.com/football/pickem/pools/','/graphql?')
TEAM_MAP={'STEELERS':'PIT','BROWNS':'CLE','COLTS':'IND','COMMANDERS':'WAS','PATRIOTS':'NE','BILLS':'BUF','TITANS':'TEN','RAVENS':'BAL','JETS':'NYJ','BEARS':'CHI','JAGUARS':'JAX','JAC':'JAX','BENGALS':'CIN','COWBOYS':'DAL','TEXANS':'HOU','CARDINALS':'ARI','GIANTS':'NYG','RAMS':'LAR','EAGLES':'PHI','PACKERS':'GB','BUCCANEERS':'TB','DOLPHINS':'MIA','VIKINGS':'MIN','CHIEFS':'KC','RAIDERS':'LV','BRONCOS':'DEN','49ERS':'SF','CHARGERS':'LAC','SEAHAWKS':'SEA','LIONS':'DET','PANTHERS':'CAR','FALCONS':'ATL','SAINTS':'NO'}
ABBR=set(TEAM_MAP.values())
CANON={abbr:name.title() for name,abbr in TEAM_MAP.items() if len(name)>3}
SERVICE={'refreshing':False,'lastRefreshStarted':None,'lastRefreshFinished':None,'lastRefreshOk':None,'lastRefreshError':None,'lastPublishedAt':None,'lastCommit':None}
LOCK=threading.Lock()

def iso_now(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def norm_team(v):
    x=str(v or '').upper().strip(); return TEAM_MAP.get(x,'JAX' if x=='JAC' else x)
def run_git(*args,check=True): return subprocess.run(['git',*args],cwd=ROOT,check=check,text=True,capture_output=True)
def lower_blob(v): return json.dumps(v,separators=(',',':')).lower()

def validate_sanitized(p):
    if not isinstance(p,dict): raise ValueError('Payload must be an object')
    blob=lower_blob(p)
    for key in FORBIDDEN_KEYS:
        if f'"{key}"' in blob: raise ValueError(f'Forbidden raw/private field detected: {key}')
    for bit in FORBIDDEN_URL_BITS:
        if bit.lower() in blob: raise ValueError('Authenticated CBS URL or GraphQL data detected')
    if p.get('product')!="CBS Pick'em IQ Bridge — sanitized live input": raise ValueError('Unexpected CBS payload product')
    if not isinstance(p.get('season'),int) or not isinstance(p.get('week'),int): raise ValueError('Missing season/week')
    if not isinstance(p.get('poolSize'),int) or p['poolSize']<1: raise ValueError('Missing pool size')
    if p.get('confidenceStatus') not in ('submitted','unsubmitted','partial'): raise ValueError('Invalid confidenceStatus')
    card=p.get('myCard')
    if p.get('confidenceStatus')=='submitted':
        if not isinstance(card,dict): raise ValueError('Submitted payload requires myCard')
        picks,weights=card.get('picks'),card.get('weights')
        if not isinstance(picks,list) or not isinstance(weights,list) or len(picks)!=len(weights): raise ValueError('Invalid myCard arrays')
        n=len(picks)
        if sorted(weights)!=list(range(1,n+1)): raise ValueError('Submitted confidence weights must be unique 1..N')

def latest_snapshot(raw,pattern):
    hits=[s for s in raw.get('snapshots',[]) if re.search(pattern,str(s.get('title',''))+' '+str(s.get('url','')),re.I)]
    return max(hits,key=lambda s:str(s.get('ts','')),default=None)

def parse_schedule(text):
    head=text.split('\n\n\n1st\n',1)[0]
    pat=re.compile(r'(?:FINAL|(?:\d+(?:ST|ND|RD|TH)\s+\d+:\d+)|(?:SUN|MON|THU)\s+[^\n]+)\n([A-Z]{2,3})\n([A-Z]{2,3})')
    return [(norm_team(a),norm_team(h)) for a,h in pat.findall(head)]

def parse_ownership(text):
    record=r'\d+-\d+(?:-\d+)?'; rx=re.compile(record+r'\s*\n([A-Z0-9 ]+?)\s*\n(\d+)%[\s\S]{0,120}?'+record+r'\s*\n([A-Z0-9 ]+?)\s*\n(\d+)%')
    out={}
    for a,ap,h,hp in rx.findall(text):
        a,h=norm_team(a),norm_team(h)
        if a in ABBR and h in ABBR: out[f'{a}|{h}']={'away':a,'home':h,'awayPct':int(ap),'homePct':int(hp)}
    return out

def parse_entry_card(text,name,n):
    if not name: return None
    starts=[m.start() for m in re.finditer(re.escape(name),text,re.I)]
    if not starts: return None
    seg=text[starts[-1]:]; nxt=re.search(r'\n\n\n\d+(?:st|nd|rd|th)\n',seg,re.I)
    if nxt: seg=seg[:nxt.start()]
    pairs=[]
    for team,w in re.findall(r'\n([A-Z]{2,3})\n\((\d{1,2})\)',seg):
        team=norm_team(team)
        if team in ABBR: pairs.append((team,int(w)))
    return pairs[:n] if pairs else None

def parse_revealed_field(text,schedule,pool_size):
    team_to_game={}
    for i,(a,h) in enumerate(schedule): team_to_game[a]=i; team_to_game[h]=i
    groups={i:[] for i in range(len(schedule))}
    for team,w in re.findall(r'\n([A-Z]{2,3})\n\((\d{1,2})\)',text):
        team=norm_team(team); i=team_to_game.get(team); w=int(w)
        if i is not None and 1<=w<=len(schedule): groups[i].append({'pick':team,'weight':w})
    threshold=max(5,int(max(1,pool_size)*.25)); locked=[]
    for i,obs in groups.items():
        if len(obs)<threshold: continue
        a,h=schedule[i]; locked.append({'key':f'{a}|{h}','gameId':f'{a}-{h}','away':a,'home':h,'observations':obs,'totalObserved':len(obs)})
    return locked

def parse_market(text,schedule):
    """Parse CBS odds from the stable seven-value team rows in page innerText.

    CBS does not render an Expert Picks separator after every game, so using that
    marker as the game boundary can swallow the following matchup. Each team row
    itself is stable: team name, open total/spread price, current spread/price,
    moneyline, and current total/price. We therefore parse each scheduled team
    independently and use fixed local row boundaries instead of page separators.
    """
    lines=[x.strip() for x in str(text or '').splitlines() if x.strip()]
    low=[x.lower() for x in lines]
    def idx_after(name,start=0):
        needle=name.lower()
        for i in range(start,len(low)):
            if low[i]==needle: return i
        return -1
    def team_values(team_index):
        block=lines[team_index+1:team_index+8]
        if len(block)<7: return None
        ml=block[4]
        total=block[5]
        if not re.fullmatch(r'[+-]\d{3,4}',ml): return None
        tm=re.fullmatch(r'[ou](\d+(?:\.\d+)?)',total,re.I)
        if not tm: return None
        return int(ml),float(tm.group(1))
    out=[]; cursor=0
    for a,h in schedule:
        an=CANON.get(a); hn=CANON.get(h)
        if not an or not hn: continue
        ai=idx_after(an,cursor)
        if ai<0: ai=idx_after(an,0)
        if ai<0: continue
        hi=idx_after(hn,ai+1)
        if hi<0: continue
        av=team_values(ai); hv=team_values(hi)
        if not av or not hv: continue
        aml,atotal=av; hml,htotal=hv
        if abs(atotal-htotal)>1.0: continue
        total=atotal if abs(atotal-htotal)<0.01 else round((atotal+htotal)/2,1)
        out.append({'away':a,'home':h,'awayML':aml,'homeML':hml,'total':total})
        cursor=hi+8
    return out

def ownership_text(schedule,ownership):
    lines=['CBS Pickem sanitized ownership']
    for a,h in schedule:
        r=ownership.get(f'{a}|{h}')
        if r: lines.extend(['0-0',a,f"{r['awayPct']}%",'0-0',h,f"{r['homePct']}%"])
    return '\n'.join(lines)

def standings_text(schedule,locked):
    lines=['Weekly Standings','Sanitized observations']
    for a,h in schedule: lines.extend(['SUN',a,h])
    for g in locked:
        for o in g['observations']: lines.extend([o['pick'],f"({o['weight']})"])
    return '\n'.join(lines)

def load_previous():
    try: return json.loads(OUTPUT.read_text(encoding='utf-8')) if OUTPUT.exists() else {}
    except Exception: return {}

def sanitize_raw(raw):
    if not isinstance(raw,dict) or not isinstance(raw.get('snapshots'),list): raise ValueError('Invalid raw CBS capture')
    picks=latest_snapshot(raw,r'\|\s*Picks\b'); standings=latest_snapshot(raw,r'Weekly Standings|/standings/weekly'); odds=latest_snapshot(raw,r'CBS NFL Odds|cbssports\.com/nfl/odds')
    if not picks or not standings or not odds: raise ValueError('CBS capture must include Picks, Weekly Standings, and Odds')
    pt,st,ot=str(picks.get('text','')),str(standings.get('text','')),str(odds.get('text','')); schedule=parse_schedule(st)
    if len(schedule)<2: raise ValueError('Could not reconstruct CBS weekly schedule')
    prev=load_previous(); wm=re.search(r'\bWeek\s+(\d{1,2})\b',pt+'\n'+st,re.I); week=int(wm.group(1)) if wm else int(prev.get('week') or 0)
    if week<1: raise ValueError('Could not determine CBS week')
    season=int(prev.get('season') or datetime.now().year); pool_size=int(prev.get('poolSize') or 94); own=parse_ownership(pt)
    if len(own)<max(2,len(schedule)//2): raise ValueError('Could not parse enough CBS ownership rows')
    current_market=parse_market(ot,schedule)
    current_by_key={(m['away'],m['home']):m for m in current_market}
    prev_by_key={(m.get('away'),m.get('home')):m for m in prev.get('market',[]) if isinstance(m,dict)}
    final_games={(norm_team(a),norm_team(h)) for a,h in re.findall(r'(?:^|\n)FINAL\s*\n([A-Z]{2,3})\n([A-Z]{2,3})(?:\n|$)',st,re.I)}
    market=[]; missing=[]
    for game in schedule:
        fresh=current_by_key.get(game)
        if fresh:
            market.append(fresh); continue
        if game in final_games and game in prev_by_key:
            market.append(prev_by_key[game]); continue
        missing.append(game)
    if missing:
        raise ValueError(f'Could not parse current CBS odds for {len(missing)} unplayed Week {week} game(s): '+', '.join(f'{a}-{h}' for a,h in missing))
    pairs=parse_entry_card(st,ENTRY_NAME,len(schedule)); pm=re.search(r'\b(\d+)\s*/\s*(\d+)\s+Picks\b',pt,re.I); picked=int(pm.group(1)) if pm else (len(pairs) if pairs else 0); total=int(pm.group(2)) if pm else len(schedule)
    my_card=None; status='unsubmitted' if picked==0 else 'partial'
    if pairs and len(pairs)==len(schedule):
        teams=[p for p,_ in pairs]; weights=[w for _,w in pairs]
        if sorted(weights)==list(range(1,len(schedule)+1)) and all(team in schedule[i] for i,team in enumerate(teams)):
            my_card={'picks':teams,'weights':weights}; status='submitted'
    if picked==total and status!='submitted': raise ValueError('CBS shows a complete card but the sanitizer could not reconstruct it. Set SFIQ_CBS_ENTRY_NAME on the mini-PC.')
    locked=parse_revealed_field(st,schedule,pool_size); exported=str(raw.get('exportedAt') or iso_now())
    payload={'product':"CBS Pick'em IQ Bridge — sanitized live input",'version':'2.1.1','season':season,'week':week,'poolSize':pool_size,'exportedAt':exported,'source':'Automated local CBS browser capture','privacy':'Raw CBS session/page data sanitized locally; pool/account identifiers and participant names not published.','confidenceStatus':status,'confidenceSource':'Automated CBS Weekly Standings row' if my_card else 'CBS Picks status','marketCapturedAt':odds.get('ts') or exported,'marketSource':f'CBS Sports odds — Week {week}','market':market,'fieldModel':{'source':'Sanitized CBS revealed-pool observations','capturedAt':standings.get('ts') or exported,'observedEntries':max([g['totalObserved'] for g in locked],default=0),'locked':locked},'snapshots':[{'title':'NFL Football Tourney | Picks','url':f'sanitized://cbs-pickem/week-{week}','ts':picks.get('ts') or exported,'text':ownership_text(schedule,own)},{'title':'NFL Football Tourney | Weekly Standings','url':f'sanitized://cbs-pickem/week-{week}/standings/weekly','ts':standings.get('ts') or exported,'text':standings_text(schedule,locked)}]}
    if my_card: payload['myCard']=my_card
    return payload

def push_snapshot():
    if not AUTO_PUSH: return {'pushed':False,'reason':'SFIQ_AUTO_PUSH is not enabled'}
    rel=str(OUTPUT.relative_to(ROOT)).replace('\\','/'); run_git('add',rel)
    if run_git('diff','--cached','--quiet',check=False).returncode==0: return {'pushed':False,'reason':'No CBS data changes'}
    week=json.loads(OUTPUT.read_text(encoding='utf-8')).get('week','unknown'); run_git('commit','-m',f'data: refresh CBS week {week}')
    push=run_git('push','origin','main',check=False)
    if push.returncode!=0:
        rebase=run_git('pull','--rebase','--autostash','origin','main',check=False)
        if rebase.returncode!=0: raise RuntimeError('GitHub sync needs attention: '+(rebase.stderr.strip() or rebase.stdout.strip()))
        push=run_git('push','origin','main',check=False)
        if push.returncode!=0: raise RuntimeError('Push failed: '+(push.stderr.strip() or push.stdout.strip()))
    commit=run_git('rev-parse','--short','HEAD').stdout.strip()
    with LOCK: SERVICE['lastCommit']=commit
    return {'pushed':True,'commit':commit}

def publish(payload):
    validate_sanitized(payload); OUTPUT.parent.mkdir(parents=True,exist_ok=True); tmp=OUTPUT.with_suffix('.json.tmp'); tmp.write_text(json.dumps(payload,indent=2)+'\n',encoding='utf-8'); tmp.replace(OUTPUT); result=push_snapshot()
    with LOCK: SERVICE['lastPublishedAt']=payload.get('exportedAt') or iso_now()
    return result

def run_collector():
    with LOCK:
        if SERVICE['refreshing']: return
        SERVICE.update({'refreshing':True,'lastRefreshStarted':iso_now(),'lastRefreshFinished':None,'lastRefreshOk':None,'lastRefreshError':None})
    try:
        proc=subprocess.run([sys.executable,str(COLLECTOR)],cwd=ROOT,text=True,capture_output=True,timeout=180)
        if proc.returncode!=0: raise RuntimeError((proc.stderr or proc.stdout or 'CBS collector failed').strip())
        with LOCK: SERVICE['lastRefreshOk']=True
    except Exception as exc:
        with LOCK: SERVICE['lastRefreshOk']=False; SERVICE['lastRefreshError']=str(exc)
    finally:
        with LOCK: SERVICE['refreshing']=False; SERVICE['lastRefreshFinished']=iso_now()

class Handler(BaseHTTPRequestHandler):
    def _cors(self): self.send_header('Access-Control-Allow-Origin','*'); self.send_header('Access-Control-Allow-Headers','Content-Type'); self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
    def _json(self,code,value):
        body=json.dumps(value).encode(); self.send_response(code); self._cors(); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        if self.path=='/health': return self._json(200,{'ok':True,'service':'CBS IQ automation','autoPush':AUTO_PUSH})
        if self.path=='/status':
            with LOCK: status=dict(SERVICE)
            return self._json(200,{'ok':True,'autoPush':AUTO_PUSH,**status})
        self._json(404,{'ok':False,'error':'Not found'})
    def do_POST(self):
        try:
            if self.path=='/refresh-sync':
                with LOCK: busy=SERVICE['refreshing']
                if busy: return self._json(409,{'ok':False,'error':'CBS refresh is already running. Try again in a moment.'})
                run_collector()
                with LOCK: status=dict(SERVICE)
                if not status.get('lastRefreshOk'):
                    detail=str(status.get('lastRefreshError') or 'CBS refresh failed').strip().splitlines()[-1]
                    return self._json(400,{'ok':False,'error':detail})
                try: payload=json.loads(OUTPUT.read_text(encoding='utf-8'))
                except Exception as exc: return self._json(500,{'ok':False,'error':'CBS refreshed but the sanitized payload could not be loaded: '+str(exc)})
                return self._json(200,{'ok':True,'payload':payload,'lastCommit':status.get('lastCommit'),'publishedAt':status.get('lastPublishedAt')})
            if self.path=='/refresh':
                with LOCK: busy=SERVICE['refreshing']
                if not busy: threading.Thread(target=run_collector,daemon=True).start()
                return self._json(202,{'ok':True,'started':not busy,'alreadyRunning':busy})
            length=int(self.headers.get('Content-Length','0'))
            if length<=0 or length>MAX_BODY: raise ValueError('Invalid payload size')
            body=json.loads(self.rfile.read(length).decode('utf-8'))
            if self.path=='/cbs-capture':
                payload=sanitize_raw(body); result=publish(payload); return self._json(200,{'ok':True,'sanitized':True,'week':payload['week'],'confidenceStatus':payload['confidenceStatus'],**result})
            if self.path=='/cbs-sync':
                result=publish(body); return self._json(200,{'ok':True,'sanitized':True,'week':body.get('week'),**result})
            self._json(404,{'ok':False,'error':'Not found'})
        except Exception as exc: self._json(400,{'ok':False,'error':str(exc)})
    def log_message(self,fmt,*args): print('[CBS IQ]',fmt%args)

if __name__=='__main__':
    print(f'CBS IQ automation listening on http://127.0.0.1:43128 -> {OUTPUT}')
    print('Auto-push:','ON' if AUTO_PUSH else 'OFF')
    print('Entry name configured:','YES' if ENTRY_NAME else 'NO')
    ThreadingHTTPServer(('127.0.0.1',43128),Handler).serve_forever()
