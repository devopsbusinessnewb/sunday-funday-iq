from pathlib import Path

# Keep the phone refresh flow on the published-data completion path.
app = Path('apps/pickem/index.html')
s = app.read_text(encoding='utf-8')
s = s.replace("const MODEL_BUILD='1.16.2';", "const MODEL_BUILD='1.16.4';")
s = s.replace("const MODEL_BUILD='1.16.3';", "const MODEL_BUILD='1.16.4';")
app.write_text(s, encoding='utf-8')

home = Path('index.html')
h = home.read_text(encoding='utf-8')
h = h.replace("const MODEL_BUILD='1.16.2';", "const MODEL_BUILD='1.16.4';")
h = h.replace("const MODEL_BUILD='1.16.3';", "const MODEL_BUILD='1.16.4';")
home.write_text(h, encoding='utf-8')

# CBS removes moneyline rows after a game has completed. Preserve the last
# published market row ONLY for games explicitly marked FINAL in CBS standings;
# all future/unplayed games still must parse fresh or the refresh fails.
bridge = Path('tools/cbs-bridge-server.py')
b = bridge.read_text(encoding='utf-8')
old = """    market=parse_market(ot,schedule)\n    if len(market)!=len(schedule): raise ValueError(f'Could not parse current CBS odds for full Week {week} slate ({len(market)}/{len(schedule)} games)')\n"""
new = """    current_market=parse_market(ot,schedule)\n    current_by_key={(m['away'],m['home']):m for m in current_market}\n    prev_by_key={(m.get('away'),m.get('home')):m for m in prev.get('market',[]) if isinstance(m,dict)}\n    final_games={(norm_team(a),norm_team(h)) for a,h in re.findall(r'(?:^|\\n)FINAL\\s*\\n([A-Z]{2,3})\\n([A-Z]{2,3})(?:\\n|$)',st,re.I)}\n    market=[]; missing=[]\n    for game in schedule:\n        fresh=current_by_key.get(game)\n        if fresh:\n            market.append(fresh); continue\n        if game in final_games and game in prev_by_key:\n            market.append(prev_by_key[game]); continue\n        missing.append(game)\n    if missing:\n        raise ValueError(f'Could not parse current CBS odds for {len(missing)} unplayed Week {week} game(s): '+', '.join(f'{a}-{h}' for a,h in missing))\n"""
if old in b:
    b=b.replace(old,new)
elif 'current_by_key=' not in b:
    raise SystemExit('CBS market validation anchor not found; refusing partial patch')
bridge.write_text(b,encoding='utf-8')

print('patched CBS refresh for postgame odds removal')
