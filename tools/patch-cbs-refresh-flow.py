from pathlib import Path

app = Path('apps/pickem/index.html')
s = app.read_text(encoding='utf-8')
for old in ("const MODEL_BUILD='1.16.1';", "const MODEL_BUILD='1.16.2';"):
    s = s.replace(old, "const MODEL_BUILD='1.16.3';")

start = s.find('async function triggerMiniPcCbsRefresh(){')
end = s.find('async function loadPublishedCbs(', start)
if start < 0 or end < 0:
    raise SystemExit('refresh lifecycle boundaries not found; refusing partial patch')

new_refresh = """async function triggerMiniPcCbsRefresh(){
  const rawLiveUrl='https://raw.githubusercontent.com/devopsbusinessnewb/sunday-funday-iq/main/data/live/cbs-pickem.json';
  let baselineExportedAt=null;
  try{
    const baselineResponse=await fetch(rawLiveUrl+'?baseline='+Date.now(),{cache:'no-store'});
    if(baselineResponse.ok)baselineExportedAt=(await baselineResponse.json())?.exportedAt||null;
  }catch(_){}

  show('Starting CBS refresh on the mini-PC…');
  const startResponse=await fetch(CBS_AUTOMATION_URL+'/refresh',{method:'POST',cache:'no-store'});
  if(!startResponse.ok)throw new Error('Mini-PC refresh endpoint returned HTTP '+startResponse.status);

  const deadline=Date.now()+180000;
  let attempts=0;
  while(Date.now()<deadline){
    await waitFor(attempts++<2?1800:2500);
    show(attempts<3?'Mini-PC is refreshing CBS…':'Waiting for the refreshed CBS data…');
    try{
      const publishedResponse=await fetch(rawLiveUrl+'?refresh='+Date.now(),{cache:'no-store'});
      if(!publishedResponse.ok)continue;
      const obj=await publishedResponse.json();
      const exportedAt=obj?.exportedAt||null;
      if(!exportedAt)continue;
      if(baselineExportedAt&&exportedAt===baselineExportedAt)continue;
      importScan(obj);
      show('CBS refresh complete. Building today’s cards…');
      return true;
    }catch(_){}
  }
  throw new Error('The mini-PC refresh did not publish new CBS data within 3 minutes.');
}
"""
s = s[:start] + new_refresh + s[end:]
s = s.replace('â€¦','…')
app.write_text(s, encoding='utf-8')

home = Path('index.html')
h = home.read_text(encoding='utf-8')
for old in ("const MODEL_BUILD='1.15.2';", "const MODEL_BUILD='1.16.1';", "const MODEL_BUILD='1.16.2';"):
    h = h.replace(old, "const MODEL_BUILD='1.16.3';")
if "const MODEL_BUILD='1.16.3';" not in h:
    raise SystemExit('home MODEL_BUILD anchor not found')
home.write_text(h, encoding='utf-8')

# Week length is not always 16 games. Keep live-data validation tied to the
# published market/slate size while preserving fixed-size fixture tests.
test = Path('tests/pickem-regression.js')
t = test.read_text(encoding='utf-8')
old = """const live=JSON.parse(fs.readFileSync(path.join(root,'data/live/cbs-pickem.json'),'utf8'));
const livePickSnap=(live.snapshots||[]).find(x=>/Picks/i.test(x.title||'')),liveMatchups=t.parsePicks(livePickSnap?.text||'');
if(liveMatchups.length!==16)throw new Error(`published live CBS: expected 16 matchups, got ${liveMatchups.length}`);
const liveGames=liveMatchups.map((g,i)=>({id:'g'+(i+1),...g,pick:null,weight:null,locked:false,completed:false,winner:null}));
const liveCard=t.extractStructuredCard(live,liveGames);
if(live.confidenceStatus==='unsubmitted'){
  if(liveCard.pickCount!==0||liveCard.weightCount!==0)throw new Error(`published live CBS blank slate unexpectedly contains picks/confidence: ${liveCard.pickCount}/${liveCard.weightCount}`);
  const generated=t.simulationCurrentCard(liveGames);
  if(generated.source!=='generated_baseline'||!t.validConfidence(generated.card.weights,16))throw new Error('published blank CBS slate cannot generate a valid Week baseline');
}else{
  if(liveCard.pickCount!==16||liveCard.weightCount!==16)throw new Error(`published live CBS: ${liveCard.pickCount}/${liveCard.weightCount}`);
  if(new Set(liveCard.weights).size!==16||liveCard.weights.some(x=>x<1||x>16))throw new Error('published live CBS: confidence values must be unique 1–16');"""
new = """const live=JSON.parse(fs.readFileSync(path.join(root,'data/live/cbs-pickem.json'),'utf8'));
const livePickSnap=(live.snapshots||[]).find(x=>/Picks/i.test(x.title||'')),liveMatchups=t.parsePicks(livePickSnap?.text||'');
const liveExpected=Array.isArray(live.market)&&live.market.length?live.market.length:liveMatchups.length;
if(liveExpected<1||liveMatchups.length!==liveExpected)throw new Error(`published live CBS: expected ${liveExpected} matchups, got ${liveMatchups.length}`);
const liveGames=liveMatchups.map((g,i)=>({id:'g'+(i+1),...g,pick:null,weight:null,locked:false,completed:false,winner:null}));
const liveCard=t.extractStructuredCard(live,liveGames);
if(live.confidenceStatus==='unsubmitted'){
  if(liveCard.pickCount!==0||liveCard.weightCount!==0)throw new Error(`published live CBS blank slate unexpectedly contains picks/confidence: ${liveCard.pickCount}/${liveCard.weightCount}`);
  const generated=t.simulationCurrentCard(liveGames);
  if(generated.source!=='generated_baseline'||!t.validConfidence(generated.card.weights,liveExpected))throw new Error('published blank CBS slate cannot generate a valid Week baseline');
}else{
  if(liveCard.pickCount!==liveExpected||liveCard.weightCount!==liveExpected)throw new Error(`published live CBS: ${liveCard.pickCount}/${liveCard.weightCount}`);
  if(new Set(liveCard.weights).size!==liveExpected||liveCard.weights.some(x=>x<1||x>liveExpected))throw new Error(`published live CBS: confidence values must be unique 1–${liveExpected}`);"""
if old in t:
    t = t.replace(old,new)
elif 'const liveExpected=' not in t:
    raise SystemExit('live-week regression block not found; refusing partial patch')
test.write_text(t,encoding='utf-8')
print('patched refresh flow to advance on new published CBS data')
