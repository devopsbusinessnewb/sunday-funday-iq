from pathlib import Path
s=Path('tools/cbs-bridge-server.py').read_text(encoding='utf-8')
assert "if picked==total and status!='submitted':" in s
assert "status='partial'" in s
assert 'CBS complete card detected; private entry row unavailable' in s
assert 'Set SFIQ_CBS_ENTRY_NAME on the mini-PC.' not in s
print('CBS complete-card fallback regression passed.')
