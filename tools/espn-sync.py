#!/usr/bin/env python3
"""Private ESPN Fantasy collector for Sunday Funday IQ.

Credentials are read only from environment variables and are never written to output.
This script is intended to run on a trusted private machine (future mini PC/server),
not in GitHub Pages and not in a public GitHub Action.

Required environment variables:
  ESPN_LEAGUE_ID
  ESPN_TEAM_ID
  ESPN_SWID
  ESPN_S2
Optional:
  ESPN_SEASON (defaults to 2026)
  ESPN_WEEK (defaults to 1)
  ESPN_OUTPUT (defaults to espn-snapshot.json)
"""
import json, os, sys
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LEAGUE_ID=os.environ.get('ESPN_LEAGUE_ID','').strip()
TEAM_ID=os.environ.get('ESPN_TEAM_ID','').strip()
SWID=os.environ.get('ESPN_SWID','').strip()
ESPN_S2=os.environ.get('ESPN_S2','').strip()
SEASON=int(os.environ.get('ESPN_SEASON','2026'))
WEEK=int(os.environ.get('ESPN_WEEK','1'))
OUTPUT=os.environ.get('ESPN_OUTPUT','espn-snapshot.json')

if not all([LEAGUE_ID,TEAM_ID,SWID,ESPN_S2]):
    sys.exit('Missing ESPN_LEAGUE_ID, ESPN_TEAM_ID, ESPN_SWID, or ESPN_S2 environment variable.')

BASE=f'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}/segments/0/leagues/{LEAGUE_ID}'
VIEWS=['mSettings','mTeam','mRoster','mMatchup','mMatchupScore']
url=BASE+'?'+urlencode([('view',v) for v in VIEWS]+[('scoringPeriodId',WEEK)])
req=Request(url,headers={'Cookie':f'espn_s2={ESPN_S2}; SWID={SWID}','User-Agent':'Sunday-Funday-IQ/0.1'})
with urlopen(req,timeout=30) as r:
    raw=json.load(r)

team_id=int(TEAM_ID)
teams={int(t['id']):t for t in raw.get('teams',[])}
me=teams.get(team_id)
if not me:
    sys.exit(f'ESPN_TEAM_ID {TEAM_ID} was not found in league {LEAGUE_ID}.')

schedule=raw.get('schedule',[])
match=None
for g in schedule:
    if int(g.get('matchupPeriodId',0))!=WEEK: continue
    if int(g.get('home',{}).get('teamId',-1))==team_id or int(g.get('away',{}).get('teamId',-1))==team_id:
        match=g;break

opp_id=None
my_side='home'
if match:
    if int(match.get('home',{}).get('teamId',-1))==team_id:
        opp_id=int(match.get('away',{}).get('teamId',-1));my_side='home'
    else:
        opp_id=int(match.get('home',{}).get('teamId',-1));my_side='away'
opp=teams.get(opp_id,{}) if opp_id else {}

slot_names={0:'QB',2:'RB',4:'WR',6:'TE',16:'D/ST',17:'K',23:'FLEX',20:'BENCH',21:'IR'}

def player_row(entry):
    p=entry.get('playerPoolEntry',{}).get('player',{})
    slot=int(entry.get('lineupSlotId',20))
    stats=p.get('stats') or []
    proj=0.0;pts=0.0
    for s in stats:
        if int(s.get('scoringPeriodId',-1))!=WEEK: continue
        if s.get('statSourceId')==1: proj=float(s.get('appliedTotal',0) or 0)
        if s.get('statSourceId')==0: pts=float(s.get('appliedTotal',0) or 0)
    return {
        'slot':slot_names.get(slot,str(slot)),
        'name':p.get('fullName','Unknown'),
        'pos':p.get('defaultPositionId'),
        'team':p.get('proTeamId'),
        'status':p.get('injuryStatus') or 'Active',
        'projection':round(proj,2),
        'points':round(pts,2),
        'starter':slot not in (20,21)
    }

entries=me.get('roster',{}).get('entries',[])
players=[player_row(e) for e in entries]
lineup=[p for p in players if p['starter']]
bench=[p for p in players if not p['starter']]

record=me.get('record',{}).get('overall',{})
my_match=(match or {}).get(my_side,{})
opp_side='away' if my_side=='home' else 'home'
opp_match=(match or {}).get(opp_side,{})

watch=[]
for p in lineup:
    st=str(p.get('status','')).lower()
    if any(x in st for x in ['out','injured reserve','doubtful']):
        watch.append({'priority':'high','title':f"{p['name']} needs attention",'detail':f"Starting {p['slot']} is listed {p['status']}."})
    elif 'questionable' in st:
        watch.append({'priority':'medium','title':f"Monitor {p['name']}",'detail':f"Starting {p['slot']} is questionable."})

settings=raw.get('settings',{})
faab=me.get('transactionCounter',{}).get('acquisitionBudgetSpent')
faab_limit=settings.get('acquisitionSettings',{}).get('acquisitionBudget')
faab_remaining=(faab_limit-faab) if isinstance(faab_limit,(int,float)) and isinstance(faab,(int,float)) else None

snapshot={
    'meta':{'source':'ESPN private collector','status':'connected','updatedAt':datetime.now(timezone.utc).isoformat(),'season':SEASON,'week':WEEK},
    'league':{'name':settings.get('name') or 'ESPN Fantasy','scoring':'ESPN league scoring','waivers':'FAAB / ESPN waiver rules','playoffs':'League playoff settings synced privately'},
    'team':{'name':me.get('name') or me.get('abbrev') or 'Your Team','record':f"{record.get('wins',0)}-{record.get('losses',0)}",'standing':me.get('playoffSeed'),'faabRemaining':faab_remaining,'score':my_match.get('totalPoints',0),'projection':my_match.get('totalProjectedPointsLive',0)},
    'opponent':{'name':opp.get('name') or opp.get('abbrev') or 'Opponent','score':opp_match.get('totalPoints',0),'projection':opp_match.get('totalProjectedPointsLive',0)},
    'lineup':lineup,'bench':bench,'watch':watch
}

with open(OUTPUT,'w',encoding='utf-8') as f: json.dump(snapshot,f,indent=2)
print(f'Wrote sanitized ESPN snapshot to {OUTPUT}. Credentials were not written.')
