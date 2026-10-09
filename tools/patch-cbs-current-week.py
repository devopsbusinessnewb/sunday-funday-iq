from pathlib import Path

app=Path('apps/pickem/index.html')
s=app.read_text(encoding='utf-8')

for old in ("const MODEL_BUILD='1.16.7';",):
    s=s.replace(old,"const MODEL_BUILD='1.16.8';")

old_week="const detectedWeek=Number((String(pickSnap?.text||'').match(/\\bWeek\\s+(\\d+)\\b/i)||[])[1]);"
new_week="const detectedWeek=Number(obj?.week||((String(pickSnap?.text||'').match(/\\bWeek\\s+(\\d+)\\b/i)||[])[1]));\n  if(Number.isInteger(Number(obj?.season))&&Number(obj.season)>2000)state.season=Number(obj.season);"
if old_week not in s:
    raise SystemExit('week detection anchor not found')
s=s.replace(old_week,new_week,1)

old_fallback="""  if(!picks.length){
    // Preserve the known Week 1 matchup structure if the newer bridge provides structured data but no visible text snapshot.
    picks=state.games.map(g=>({away:g.away,home:g.home,awayPct:g.awayPct,homePct:g.homePct}));
  }
"""
new_fallback="""  if(!picks.length&&Array.isArray(obj?.market)&&obj.market.length){
    const ownership=new Map();
    const text=String(pickSnap?.text||'');
    const rx=/0-0\\s*\\n([A-Z]{2,3})\\s*\\n(\\d+)%\\s*\\n0-0\\s*\\n([A-Z]{2,3})\\s*\\n(\\d+)%/g;
    let m;while((m=rx.exec(text))!==null){ownership.set(normalizeTeam(m[1])+'|'+normalizeTeam(m[3]),{awayPct:Number(m[2]),homePct:Number(m[4])})}
    picks=obj.market.map(x=>{const away=normalizeTeam(x.away),home=normalizeTeam(x.home),o=ownership.get(away+'|'+home)||{};return{away,home,awayPct:o.awayPct??50,homePct:o.homePct??50}});
  }
  if(!picks.length){
    picks=state.games.map(g=>({away:g.away,home:g.home,awayPct:g.awayPct,homePct:g.homePct}));
  }
"""
if old_fallback not in s:
    raise SystemExit('picks fallback anchor not found')
s=s.replace(old_fallback,new_fallback,1)

old_replace="if(picks.length===state.games.length){"
new_replace="if(picks.length&&(detectedWeek!==priorWeek||picks.length===state.games.length)){"
if old_replace not in s:
    raise SystemExit('slate replacement anchor not found')
s=s.replace(old_replace,new_replace,1)

needle="globalThis.SFIQ_TEST={"
if needle not in s: raise SystemExit('test export anchor missing')

app.write_text(s,encoding='utf-8')

home=Path('index.html')
h=home.read_text(encoding='utf-8').replace("const MODEL_BUILD='1.16.7';","const MODEL_BUILD='1.16.8';")
home.write_text(h,encoding='utf-8')
print('patched current-week structured CBS import and build 1.16.8')
