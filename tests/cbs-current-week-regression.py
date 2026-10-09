import json,re
from pathlib import Path

app=Path('apps/pickem/index.html').read_text(encoding='utf-8')
live=json.loads(Path('data/live/cbs-pickem.json').read_text(encoding='utf-8'))
assert "const MODEL_BUILD='1.16.8';" in app
assert "Number(obj?.week||" in app, 'structured payload week is not authoritative'
assert "Number(obj?.season)" in app, 'structured payload season is not authoritative'
assert "Array.isArray(obj?.market)&&obj.market.length" in app, 'structured market slate fallback missing'
assert "detectedWeek!==priorWeek||picks.length===state.games.length" in app, 'new-week slate replacement guard missing'
assert live['week']==5
assert len(live['market'])==15
assert len(live.get('myCard',{}).get('picks',[]))==15
assert len(live.get('myCard',{}).get('weights',[]))==15
assert sorted(live['myCard']['weights'])==list(range(1,16))
market=[(x['away'],x['home']) for x in live['market']]
assert len(set(market))==15
print('CBS current-week regression passed: structured Week 5, 15-game slate, complete current card')
