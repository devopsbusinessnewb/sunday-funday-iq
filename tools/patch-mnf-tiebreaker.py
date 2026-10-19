from pathlib import Path

HOME=Path('index.html')
APP=Path('apps/pickem/index.html')
home=HOME.read_text(encoding='utf-8')
app=APP.read_text(encoding='utf-8')

old_home="function tiebreakerRecommendation(live){const rows=Array.isArray(live?.market)?live.market:[];const g=rows[rows.length-1];const total=Number(g?.total);if(!g||!Number.isFinite(total))return null;return{away:g.away,home:g.home,total,score:Math.round(total)}}"
new_home="""function scheduledRank(statusText){
  const m=String(statusText||'').match(/(\\d{1,2})\\/(\\d{1,2})\\s*-\\s*(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i);
  if(!m)return null;
  let h=Number(m[3])%12;if(String(m[5]).toUpperCase()==='PM')h+=12;
  return Number(m[1])*1e6+Number(m[2])*1e4+h*100+Number(m[4]);
}
function tiebreakerRecommendation(live){
  const rows=Array.isArray(live?.market)?live.market:[],states=Array.isArray(live?.gameState)?live.gameState:[];
  const scheduled=states.map(s=>({s,rank:scheduledRank(s?.statusText)})).filter(x=>Number.isFinite(x.rank)).sort((a,b)=>b.rank-a.rank);
  for(const {s} of scheduled){
    const g=rows.find(r=>r.away===s.away&&r.home===s.home),total=Number(g?.total);
    if(g&&Number.isFinite(total))return{away:g.away,home:g.home,total,score:Math.round(total)};
  }
  return null;
}"""
if old_home in home:
    home=home.replace(old_home,new_home,1)
elif 'function scheduledRank(statusText)' not in home:
    raise SystemExit('home tiebreaker helper anchor not found')
home=home.replace('Based on the current market total for the final scheduled game.','Based on the current market total for the Monday Night Football game.',1)
if 'tiebreakerRecommendation};' not in home:
    home=home.replace("globalThis.SFIQ_HOME_TEST={MODEL_BUILD,strategySnapshot,strategyRecommendation};","globalThis.SFIQ_HOME_TEST={MODEL_BUILD,strategySnapshot,strategyRecommendation,tiebreakerRecommendation};",1)

old_app="const tbGame=games[games.length-1],tbTotal=Number(tbGame?.total),tbScore=Number.isFinite(tbTotal)?Math.round(tbTotal):null;"
new_app="const tbGame=[...games].map(g=>({g,rank:(()=>{const m=String(g?.statusText||'').match(/(\\d{1,2})\\/(\\d{1,2})\\s*-\\s*(\\d{1,2}):(\\d{2})\\s*(AM|PM)/i);if(!m)return null;let h=Number(m[3])%12;if(String(m[5]).toUpperCase()==='PM')h+=12;return Number(m[1])*1e6+Number(m[2])*1e4+h*100+Number(m[4])})()})).filter(x=>Number.isFinite(x.rank)).sort((a,b)=>b.rank-a.rank)[0]?.g||null,tbTotal=Number(tbGame?.total),tbScore=Number.isFinite(tbTotal)?Math.round(tbTotal):null;"
if old_app in app:
    app=app.replace(old_app,new_app,1)
elif 'const tbGame=[...games].map' not in app:
    raise SystemExit('model lab tiebreaker anchor not found')

HOME.write_text(home,encoding='utf-8')
APP.write_text(app,encoding='utf-8')
print('MNF tiebreaker patch applied or already present')
