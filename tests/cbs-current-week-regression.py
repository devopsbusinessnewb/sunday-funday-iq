import json,re
from pathlib import Path

app=Path('apps/pickem/index.html').read_text(encoding='utf-8')
live=json.loads(Path('data/live/cbs-pickem.json').read_text(encoding='utf-8'))
build=re.search(r"const MODEL_BUILD='(\d+\.\d+\.\d+)';",app)
assert build and tuple(map(int,build.group(1).split('.'))) >= (1,16,8), 'current-week support requires build 1.16.8 or newer'
assert "Number(obj?.week||" in app, 'structured payload week is not authoritative'
assert "Number(obj?.season)" in app, 'structured payload season is not authoritative'
assert "Array.isArray(obj?.market)&&obj.market.length" in app, 'structured market slate fallback missing'
assert "detectedWeek!==priorWeek||picks.length===state.games.length" in app, 'new-week slate replacement guard missing'
assert isinstance(live['week'],int) and 1 <= live['week'] <= 18
assert isinstance(live['season'],int) and live['season'] >= 2026
n=len(live['market'])
assert 1 <= n <= 16
market=[(x['away'],x['home']) for x in live['market']]
assert len(set(market))==n
status=live.get('confidenceStatus')
card=live.get('myCard')
assert status in ('partial','submitted'), f'unexpected confidenceStatus: {status!r}'
if status == 'submitted':
    assert isinstance(card,dict), 'submitted status requires myCard'
    assert len(card.get('picks',[]))==n
    assert len(card.get('weights',[]))==n
    assert sorted(card['weights'])==list(range(1,n+1))
    assert all(p in matchup for p,matchup in zip(card['picks'],market)), 'card picks must belong to their market matchup'
    card_state='complete current card'
else:
    assert not card, 'partial status must fail closed without publishing an unverified myCard'
    assert live.get('confidenceSource'), 'partial status requires a sanitized reason'
    card_state='fail-closed partial card'
print(f"CBS current-week regression passed: Week {live['week']}, {n}-game slate, {card_state}")
