from pathlib import Path

app = Path('apps/pickem/index.html')
s = app.read_text(encoding='utf-8')

for old in ("const MODEL_BUILD='1.16.7';", "const MODEL_BUILD='1.16.8';"):
    s = s.replace(old, "const MODEL_BUILD='1.16.9';")

old_restore = """function restoreFullWeekState(){
  if(!state||!Array.isArray(state.games)||state.games.length>=SEED.length)return;
"""
new_restore = """function restoreFullWeekState(){
  // Legacy Week 1 repair only. Never pad later weeks to 16 games.
  if(Number(state?.week||1)!==1)return;
  if(!state||!Array.isArray(state.games)||state.games.length>=SEED.length)return;
"""
if old_restore in s:
    s = s.replace(old_restore, new_restore, 1)
elif "if(Number(state?.week||1)!==1)return;" not in s:
    raise SystemExit('restoreFullWeekState anchor not found')

old_condition = """  const om=new Map(odds.map(x=>[x.away+'|'+x.home,x])),old=new Map(state.games.map(x=>[x.away+'|'+x.home,x]));
  if(picks.length&&(detectedWeek!==priorWeek||picks.length===state.games.length)){
"""
new_condition = """  const om=new Map(odds.map(x=>[x.away+'|'+x.home,x])),old=new Map(state.games.map(x=>[x.away+'|'+x.home,x]));
  const structuredFullSlate=Array.isArray(obj?.market)&&obj.market.length===picks.length&&picks.length>0;
  if(picks.length&&(structuredFullSlate||detectedWeek!==priorWeek||picks.length===state.games.length)){
"""
if old_condition in s:
    s = s.replace(old_condition, new_condition, 1)
elif 'const structuredFullSlate=' not in s:
    raise SystemExit('current-week replacement anchor not found')

s = s.replace('<summary>View all 16 picks</summary>', '<summary>View all ${games.length} picks</summary>')

old_rows = """  const rows=strategyCardRows(state.games,p.card,o.current),runAt=Date.parse(o.ranAt||''),changed=Number.isFinite(runAt)&&(Date.parse(state.cbsUpdatedAt||'')>runAt||Date.parse(state.marketUpdatedAt||'')>runAt),f=dataFreshness(state),old=changed||!Number.isFinite(runAt)||Date.now()-runAt>12*3600e3||!f.cbs.current||!f.market.current;
"""
new_rows = """  const rows=strategyCardRows(state.games,p.card,o.current),runAt=Date.parse(o.ranAt||''),changed=Number.isFinite(runAt)&&(Date.parse(state.cbsUpdatedAt||'')>runAt||Date.parse(state.marketUpdatedAt||'')>runAt),f=dataFreshness(state),old=changed||!Number.isFinite(runAt)||Date.now()-runAt>12*3600e3||!f.cbs.current||!f.market.current;
  if(!rows.length||rows.length!==state.games.length){view.innerHTML='<h2>Current slate mismatch</h2><p class="meta">The saved strategy does not match this week’s '+state.games.length+'-game slate. Refresh once to rebuild the four cards from the current CBS schedule.</p><div class="actions"><a class="btn primary" href="?action=refresh-simulate">Refresh &amp; rebuild</a><a class="btn" href="../../">Back to strategies</a></div>';return}
"""
if old_rows in s:
    s = s.replace(old_rows, new_rows, 1)
elif 'Current slate mismatch' not in s:
    raise SystemExit('full-card rows anchor not found')

if 'async function miniPcRefreshHandshake(' not in s:
    raise SystemExit('phone refresh handshake missing')

app.write_text(s, encoding='utf-8')

home = Path('index.html')
h = home.read_text(encoding='utf-8')
for old in ("const MODEL_BUILD='1.16.7';", "const MODEL_BUILD='1.16.8';"):
    h = h.replace(old, "const MODEL_BUILD='1.16.9';")
home.write_text(h, encoding='utf-8')

collector = Path('tools/cbs-collector.py')
c = collector.read_text(encoding='utf-8')
c = c.replace("HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','0')=='1'", "HEADLESS=os.environ.get('SFIQ_CBS_HEADLESS','1')=='1'")
collector.write_text(c, encoding='utf-8')

bridge = Path('tools/cbs-bridge-server.py')
b = bridge.read_text(encoding='utf-8')
if 'def claim_refresh(' not in b or "self.path=='/live'" not in b:
    raise SystemExit('run-token bridge upgrade missing')
bridge.write_text(b, encoding='utf-8')

# Update regression language so CI verifies variable-size NFL weeks instead of requiring 16.
test = Path('tests/pickem-regression.js')
t = test.read_text(encoding='utf-8')
t = t.replace("if(!html.includes('<summary>View all 16 picks</summary>'))throw new Error('Model Lab cards do not expose a simple full-card action');", "if(!html.includes('<summary>View all ${games.length} picks</summary>'))throw new Error('Model Lab cards do not expose a dynamic full-card action');")
if "View all ${games.length} picks" not in t:
    raise SystemExit('dynamic Model Lab regression anchor missing')
test.write_text(t, encoding='utf-8')

print('patched dynamic CBS slate handling + Week 1 fallback isolation')
