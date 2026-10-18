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

print('CBS collector card regression: PASS')
