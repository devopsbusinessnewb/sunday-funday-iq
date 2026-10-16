from pathlib import Path

BRIDGE=Path('tools/cbs-bridge-server.py')
TEST=Path('tests/cbs-card-fallback-regression.py')
s=BRIDGE.read_text(encoding='utf-8')

old="if picked==total and status!='submitted': raise ValueError('CBS shows a complete card but the sanitizer could not reconstruct it. Set SFIQ_CBS_ENTRY_NAME on the mini-PC.')"
new="""if picked==total and status!='submitted':
        # Do not fail the entire refresh just because the private standings entry
        # cannot be identified. Fresh market/ownership data is still valid and
        # materially useful. Mark the card as partial so the app will not present
        # a generated baseline as the user's submitted CBS card.
        status='partial'"""
if old not in s and "status='partial'\n    locked=parse_revealed_field" not in s:
    raise SystemExit('complete-card failure anchor not found')
if old in s:
    s=s.replace(old,new,1)

old_source="'confidenceSource':'Automated CBS Weekly Standings row' if my_card else 'CBS Picks status'"
new_source="'confidenceSource':'Automated CBS Weekly Standings row' if my_card else ('CBS complete card detected; private entry row unavailable' if picked==total else 'CBS Picks status')"
if old_source in s:
    s=s.replace(old_source,new_source,1)
elif new_source not in s:
    raise SystemExit('confidence source anchor not found')

BRIDGE.write_text(s,encoding='utf-8')

TEST.write_text("""from pathlib import Path
s=Path('tools/cbs-bridge-server.py').read_text(encoding='utf-8')
assert "if picked==total and status!='submitted':" in s
assert "status='partial'" in s
assert 'CBS complete card detected; private entry row unavailable' in s
assert 'Set SFIQ_CBS_ENTRY_NAME on the mini-PC.' not in s
print('CBS complete-card fallback regression passed.')
""",encoding='utf-8')
print('patched CBS complete-card refresh fallback')
