#!/usr/bin/env python3
"""Regression coverage for CBS odds parsing without relying on live CBS pages."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('cbs_bridge_server',ROOT/'tools'/'cbs-bridge-server.py')
mod=module_from_spec(spec); spec.loader.exec_module(mod)

schedule=[('TB','DAL'),('PHI','JAX'),('CIN','MIA'),('LV','NE'),('MIN','NO'),('CLE','NYJ'),('IND','PIT'),('HOU','TEN'),('NYG','WAS'),('CHI','GB'),('DEN','LAC'),('DET','ARI'),('SF','SEA'),('BAL','ATL'),('BUF','LAR')]
rows={
'TB':('+385',47.5),'DAL':('-455',47.5),'PHI':('+275',41.5),'JAX':('-325',42.5),
'CIN':('-355',42.5),'MIA':('+310',42.5),'LV':('+176',45.5),'NE':('-192',45.5),
'MIN':('-128',42.0),'NO':('+110',42.5),'CLE':('+110',39.5),'NYJ':('-130',40.5),
'IND':('+120',44.5),'PIT':('-134',44.5),'HOU':('-370',38.5),'TEN':('+295',38.5),
'NYG':('+164',43.5),'WAS':('-175',43.5),'CHI':('-148',45.5),'GB':('+130',45.5),
'DEN':('-175',42.0),'LAC':('+156',42.5),'DET':('-218',53.5),'ARI':('+198',54.5),
'SF':('+138',46.5),'SEA':('-155',47.5),'BAL':('+155',43.5),'ATL':('-174',43.5),
'BUF':('+130',54.5),'LAR':('-152',54.5),
}

parts=['Odds - Week 5']
for i,(away,home) in enumerate(schedule):
    parts.extend(['Sun Oct 11, 1:00pm','Open','Spread','Moneyline','Total'])
    for team in (away,home):
        ml,total=rows[team]
        parts.extend([mod.CANON[team],'o45.5','-110','+3.5','-110',ml,('o' if team==away else 'u')+str(total),'-110'])
    # Intentionally omit the separator from most games; this is the layout that broke the live parser.
    if i%3==0: parts.append('2 Expert Picks')

market=mod.parse_market('\n'.join(parts),schedule)
assert len(market)==15, f'expected 15 games, got {len(market)}'
assert market[0]=={'away':'TB','home':'DAL','awayML':385,'homeML':-455,'total':47.5}
assert market[1]=={'away':'PHI','home':'JAX','awayML':275,'homeML':-325,'total':42.0}
assert market[-1]=={'away':'BUF','home':'LAR','awayML':130,'homeML':-152,'total':54.5}
print('CBS market parser regression passed: 15/15 games')
