from pathlib import Path

collector_path=Path('tools/cbs-collector.py')
test_path=Path('tests/cbs-collector-card-regression.py')
collector=collector_path.read_text(encoding='utf-8')
test=test_path.read_text(encoding='utf-8')

old="""    for i,line in enumerate(lines):
        wm=re.fullmatch(r'(\\d{1,2})\\s+Pts?',line,re.I)
        if not wm: continue
        for j in range(i-1,max(-1,i-12),-1):
            team=team_token(lines[j])
            if team:
                pairs.append((team,int(wm.group(1)))); break
"""
new="""    for i,line in enumerate(lines):
        wm=re.fullmatch(r'(\\d{1,2})\\s+Pts?',line,re.I)
        if not wm: continue
        # CBS renders both matchup teams near the confidence control. Plain body
        # text does not preserve which side is visually selected, so guessing the
        # nearest team can silently flip a submitted pick. Fail closed whenever
        # more than one matchup team is present in the local text window.
        candidates=[]
        for j in range(i-1,max(-1,i-12),-1):
            if re.fullmatch(r'(\\d{1,2})\\s+Pts?',lines[j],re.I): break
            team=team_token(lines[j])
            if team and team not in candidates: candidates.append(team)
        if len(candidates)==1: pairs.append((candidates[0],int(wm.group(1))))
"""
if old in collector:
    collector=collector.replace(old,new,1)
elif new not in collector:
    raise SystemExit('collector parser anchor not found')

anchor="assert collector.authenticated_self_block(rendered_card(weights=bad))=='', 'Duplicate/missing confidence weights must fail closed'\n"
addition="""
# A real CBS matchup card can expose both teams around one confidence control.
# Text-only parsing must abstain rather than guess the wrong selected side.
ambiguous='\\n'.join(['14/14 Picks','PATRIOTS','BEARS','11 Pts'] + sum(([team,'row',f'{w} Pts'] for team,w in zip(teams[1:],range(13,0,-1))),[]))
assert collector.authenticated_self_block(ambiguous)=='', 'Ambiguous two-team confidence row must fail closed'
"""
if addition.strip() not in test:
    if anchor not in test: raise SystemExit('test anchor not found')
    test=test.replace(anchor,anchor+addition,1)

collector_path.write_text(collector,encoding='utf-8')
test_path.write_text(test,encoding='utf-8')
print('CBS submitted-card parser now fails closed on ambiguous matchup text')
