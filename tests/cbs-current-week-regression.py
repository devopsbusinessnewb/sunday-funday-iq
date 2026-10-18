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

# Week 6 is the production incident that exposed two independent ways the slate
# could shrink: completed Thursday games disappearing and ESPN's WSH alias
# causing Monday WAS @ SF to be dropped. Keep the exact known-good contract
# pinned while Week 6 is the live payload so either regression fails CI.
if live['season']==2026 and live['week']==6:
    assert n==14, f'2026 Week 6 must contain all 14 games, got {n}'
    assert ('SEA','DEN') in market, 'completed Thursday SEA @ DEN disappeared from Week 6'
    assert ('WAS','SF') in market, 'Monday WAS @ SF disappeared from Week 6'

# Payload v2.2+ makes the complete weekly slate an explicit contract. This
# prevents a finished Thursday game from silently shrinking Sunday projections.
version=tuple(int(x) for x in str(live.get('version','0.0.0')).split('.')[:3])
if version >= (2,2,0):
    assert live.get('slateSize')==n, f"slateSize {live.get('slateSize')} does not match {n} published games"
    game_state=live.get('gameState')
    assert isinstance(game_state,list) and len(game_state)==n, 'v2.2 payload must publish state for every weekly game'
    state_matchups=[(x.get('away'),x.get('home')) for x in game_state]
    assert state_matchups==market, 'gameState must align 1:1 with the full market slate'
    for g in game_state:
        if g.get('completed'):
            assert g.get('winner') in (g.get('away'),g.get('home')), 'completed game must have a valid winner'
    if live['season']==2026 and live['week']==6:
        thursday=next(g for g in game_state if (g.get('away'),g.get('home'))==('SEA','DEN'))
        assert thursday.get('completed') is True, 'Week 6 Thursday game must remain completed'
        assert thursday.get('winner')=='DEN', 'Week 6 Thursday winner must remain DEN'

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
