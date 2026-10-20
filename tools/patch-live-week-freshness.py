from pathlib import Path

HOME=Path('index.html')
TEST=Path('tests/pickem-home-regression.js')
home=HOME.read_text(encoding='utf-8')
test=TEST.read_text(encoding='utf-8')

if 'function chooseFreshLive(' not in home:
    anchor="function strategyRecommendation(snapshot){"
    helper="""function liveVersionKey(live){
  const season=Number(live?.season||0),week=Number(live?.week||0),ts=Date.parse(live?.exportedAt||'')||0;
  return[season,week,ts];
}
function chooseFreshLive(candidates){
  return candidates.filter(x=>x&&Number(x.week)>0).sort((a,b)=>{const ak=liveVersionKey(a),bk=liveVersionKey(b);return bk[0]-ak[0]||bk[1]-ak[1]||bk[2]-ak[2]})[0]||null;
}
async function fetchFreshLive(){
  const stamp=Date.now();
  const urls=[
    './data/live/cbs-pickem.json?t='+stamp,
    'https://raw.githubusercontent.com/devopsbusinessnewb/sunday-funday-iq/main/data/live/cbs-pickem.json?t='+stamp
  ];
  const settled=await Promise.allSettled(urls.map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('CBS data unavailable');return r.json()}));
  const live=chooseFreshLive(settled.filter(x=>x.status==='fulfilled').map(x=>x.value));
  if(!live)throw Error('CBS data unavailable');
  return live;
}
"""
    if anchor not in home: raise SystemExit('strategyRecommendation anchor missing')
    home=home.replace(anchor,helper+anchor,1)

old="  let live=null;try{const r=await fetch('./data/live/cbs-pickem.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('CBS data unavailable');live=await r.json()}catch{live={week:state?.week,season:state?.season,unavailable:true}}\n"
new="  let live=null;try{live=await fetchFreshLive()}catch{live={week:state?.week,season:state?.season,unavailable:true}}\n"
if old in home:
    home=home.replace(old,new,1)
elif 'live=await fetchFreshLive()' not in home:
    raise SystemExit('home live fetch anchor missing')

old_export="globalThis.SFIQ_HOME_TEST={MODEL_BUILD,strategySnapshot,strategyRecommendation,tiebreakerRecommendation};"
new_export="globalThis.SFIQ_HOME_TEST={MODEL_BUILD,strategySnapshot,strategyRecommendation,tiebreakerRecommendation,chooseFreshLive,liveVersionKey};"
if old_export in home:
    home=home.replace(old_export,new_export,1)
elif 'chooseFreshLive,liveVersionKey' not in home:
    raise SystemExit('home test export anchor missing')

marker="if(home.strategySnapshot(state,{season:2026,week:4},Date.now()).status!=='missing')throw new Error('Old week projections appeared as current cards');\n"
extra="""if(home.chooseFreshLive([{season:2026,week:6,exportedAt:'2026-10-20T14:10:00Z'},{season:2026,week:7,exportedAt:'2026-10-20T14:09:00Z'}]).week!==7)throw new Error('Home did not prefer the newer CBS week over a later stale-week timestamp');
if(home.chooseFreshLive([{season:2026,week:7,exportedAt:'2026-10-20T14:09:00Z'},{season:2026,week:7,exportedAt:'2026-10-20T14:11:00Z'}]).exportedAt!=='2026-10-20T14:11:00Z')throw new Error('Home did not prefer the newest publication within the same week');
"""
if extra.strip() not in test:
    if marker not in test: raise SystemExit('home regression insertion anchor missing')
    test=test.replace(marker,marker+extra,1)

HOME.write_text(home,encoding='utf-8')
TEST.write_text(test,encoding='utf-8')
print('patched Home to choose the freshest current-week CBS feed across Pages and raw main')
