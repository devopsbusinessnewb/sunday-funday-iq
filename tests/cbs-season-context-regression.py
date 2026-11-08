import importlib.util
from pathlib import Path

spec=importlib.util.spec_from_file_location('bridge',Path('tools/cbs-bridge-server.py'))
bridge=importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)

snap={
    'ts':'2026-11-07T23:00:00Z',
    'rows':[
        '1 Leader Entry 812',
        '2 Second Entry 799',
        '__SFIQ_SELF__ 3 Hidden Entry 794',
        '4 Fourth Entry 788',
        '5 Fifth Entry 770'
    ]
}
ctx=bridge.parse_season_context(snap,'',94)
assert ctx is not None
assert ctx['rank']==3
assert ctx['points']==794
assert ctx['leaderPoints']==812
assert ctx['pointsBehindLeader']==18
assert ctx['pointsBehindNext']==5
assert ctx['pointsAheadOfNext']==6
assert 'Tony' not in str(ctx) and 'Eickhoff' not in str(ctx)

missing=bridge.parse_season_context({'rows':['1 Leader 812','2 Other 799']},'',94)
assert missing is None

contradictory={
    'ts':'2026-11-07T23:05:00Z',
    'rows':[
        '1 Leader Entry 660 700',
        '2 Second Entry 650 695',
        '__SFIQ_SELF__ 3 Hidden Entry 640 690',
        '4 Fourth Entry 630 685',
        '5 Fifth Entry 620 680'
    ]
}
ctx2=bridge.parse_season_context(contradictory,'',94)
assert ctx2 is not None
assert ctx2['rank']==3
assert ctx2['leaderPoints']>=ctx2['points']
assert ctx2['pointsBehindLeader']==ctx2['leaderPoints']-ctx2['points']

print('CBS season-context regression passed: anonymized rank and score gaps.')
