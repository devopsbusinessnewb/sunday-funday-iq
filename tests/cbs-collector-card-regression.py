#!/usr/bin/env python3
"""Regression tests for the authenticated CBS Picks-page card parser."""
import importlib.util
import sys
import types
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

# The parser itself does not need a browser. Stub Playwright so this regression
# stays fast and deterministic in GitHub Actions.
playwright=types.ModuleType('playwright')
sync_api=types.ModuleType('playwright.sync_api')
sync_api.sync_playwright=lambda: None
playwright.sync_api=sync_api
sys.modules['playwright']=playwright
sys.modules['playwright.sync_api']=sync_api

spec=importlib.util.spec_from_file_location('collector',ROOT/'tools'/'cbs-collector.py')
collector=importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

teams=['RAMS','49ERS','CHIEFS','BILLS','PACKERS','EAGLES','LIONS','RAVENS','TEXANS','BEARS','COLTS','VIKINGS','SAINTS','BRONCOS']

def rendered_card(picked=14,total=14,weights=None):
    weights=weights or list(range(14,0,-1))
    lines=[f'{picked}/{total} Picks']
    for team,weight in zip(teams,weights):
        lines.extend([team,'Some CBS row detail',f'{weight} Pts'])
    return '\n'.join(lines)

def pairs(block):
    lines=[x.strip() for x in block.splitlines() if x.strip()]
    out=[]
    for i,x in enumerate(lines):
        if x.startswith('(') and x.endswith(')') and i:
            out.append((lines[i-1],int(x[1:-1])))
    return out

block=collector.authenticated_self_block(rendered_card())
assert collector.AUTH_SELF_MARKER in block, 'Complete current CBS card was not recognized'
parsed=pairs(block)
assert len(parsed)==14, f'Expected 14 picks, got {len(parsed)}'
assert sorted(w for _,w in parsed)==list(range(1,15)), 'Confidence weights must be exactly 1..14'
assert parsed[0][0]=='LAR' and parsed[1][0]=='SF', 'Full CBS team names must normalize to canonical abbreviations'

assert collector.authenticated_self_block(rendered_card(picked=13,total=14))=='', 'Incomplete CBS card must fail closed'
bad=[14,13,12,11,10,9,8,7,6,5,4,3,2,2]
assert collector.authenticated_self_block(rendered_card(weights=bad))=='', 'Duplicate/missing confidence weights must fail closed'

# CBS can render both teams around a single confidence control. Plain body text
# loses the visual selected state, so the parser must abstain instead of guessing.
ambiguous=['14/14 Picks','PATRIOTS','BEARS','11 Pts']
for team,weight in zip(teams[1:],range(13,0,-1)):
    ambiguous.extend([team,'Some CBS row detail',f'{weight} Pts'])
assert collector.authenticated_self_block('\n'.join(ambiguous))=='', 'Ambiguous two-team confidence row must fail closed'

# Synthetic structured current-week evidence. The collector does not yet have
# a trusted DOM adapter for these inputs; these tests do not certify one.
from copy import deepcopy

evidence=collector.assess_weekly_standings_evidence
games=[
    {'away':'AAA','home':'BBB','phase':'final'},
    {'away':'CCC','home':'DDD','phase':'started'},
    {'away':'EEE','home':'FFF','phase':'scheduled'},
    {'away':'GGG','home':'HHH','phase':'scheduled'},
]
entry={'week':12,'label':'Example Owner','authenticated_own_entry':True}
cell1={'away':'AAA','home':'BBB','pick':'BBB','confidence':4}
cell2={'away':'CCC','home':'DDD','explicit_missed':True}
cell3={'away':'EEE','home':'FFF','pick':'EEE','confidence':2}
standings={'week':12,'rows':[
    {'label':'Different Entry','cells':[None,None,None,None]},
    {'label':' Example  Owner ','cells':[cell1,cell2,cell3,None]},
]}
base=evidence(12,'EXAMPLE OWNER',entry,standings,games,[games[2]])
assert base=={'identity':'verified','alignment':True,'locked_exact':1,
             'locked_missed_explicit':1,'locked_unknown':0,
             'scheduled_exact':1,'open_confirmed':1}
assert evidence(12,'Example Owner',entry,standings,games)['open_confirmed']==0
assert evidence(12,'Example Owner',{**entry,'authenticated_own_entry':False},standings,games)['identity']=='unknown'
assert evidence(12,'Example Owner',{**entry,'week':11},standings,games)['identity']=='unknown'
assert evidence(12,'Example Owner',{**entry,'label':'Wrong Entry'},standings,games)['identity']=='unknown'
assert evidence(12,'Example Owner',entry,{**standings,'rows':standings['rows']+standings['rows'][1:]},games)['identity']=='ambiguous'
assert evidence(12,'Example Owner',entry,{**standings,'rows':standings['rows'][:1]},games)['identity']=='missing'
unmapped=deepcopy(standings)
unmapped['rows'][1]['cells'][1]={'away':'CCC','home':'DDD','text':'-'}
assert evidence(12,'Example Owner',entry,unmapped,games)['locked_unknown']==1
unmapped['rows'][1]['cells'][1]=None
assert evidence(12,'Example Owner',entry,unmapped,games)['locked_unknown']==1
unmapped['rows'][1]['cells'][1]={'away':'CCC','home':'DDD','pick':'AAA','confidence':3}
assert evidence(12,'Example Owner',entry,unmapped,games)['locked_unknown']==1
unmapped['rows'][1]['cells'][1]={'away':'CCC','home':'DDD','pick':'CCC','confidence':4}
assert evidence(12,'Example Owner',entry,unmapped,games)['locked_unknown']==2
unmapped['rows'][1]['cells'][1]={'away':'AAA','home':'BBB','pick':'AAA','confidence':3}
assert not evidence(12,'Example Owner',entry,unmapped,games)['alignment']
unmapped['rows'][1]['cells'].pop()
assert not evidence(12,'Example Owner',entry,unmapped,games)['alignment']
assert not evidence(12,'Example Owner',entry,standings,[games[0]]*4)['alignment']

print('CBS collector card regression: PASS')
