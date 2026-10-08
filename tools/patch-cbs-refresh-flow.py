from pathlib import Path

app = Path('apps/pickem/index.html')
s = app.read_text(encoding='utf-8')
s = s.replace("const MODEL_BUILD='1.16.1';", "const MODEL_BUILD='1.16.2';")

start = s.find('async function triggerMiniPcCbsRefresh(){')
end = s.find('async function loadPublishedCbs(', start)
if start < 0 or end < 0:
    raise SystemExit('refresh lifecycle boundaries not found; refusing partial patch')

new_refresh = """async function triggerMiniPcCbsRefresh(){
  let baseline=null;
  try{
    const r=await fetch(CBS_AUTOMATION_URL+'/status',{cache:'no-store'});
    if(r.ok)baseline=await r.json();
  }catch(_){}
  const baselineStarted=baseline?.lastRefreshStarted||null;
  const baselineFinished=baseline?.lastRefreshFinished||null;
  show('Starting CBS refresh on the mini-PC…');
  const startResponse=await fetch(CBS_AUTOMATION_URL+'/refresh',{method:'POST',cache:'no-store'});
  if(!startResponse.ok)throw new Error('Mini-PC refresh endpoint returned HTTP '+startResponse.status);
  const startResult=await startResponse.json();
  let observedRun=!!startResult.alreadyRunning;
  const statusDeadline=Date.now()+180000;
  while(Date.now()<statusDeadline){
    await waitFor(1800);
    let statusResponse;
    try{statusResponse=await fetch(CBS_AUTOMATION_URL+'/status',{cache:'no-store'})}catch(_){continue}
    if(!statusResponse.ok)continue;
    const status=await statusResponse.json();
    if(status.refreshing){observedRun=true;show('Mini-PC is refreshing CBS…');continue}
    const completedNewRun=observedRun||status.lastRefreshStarted!==baselineStarted||status.lastRefreshFinished!==baselineFinished;
    if(!completedNewRun)continue;
    if(status.lastRefreshOk===false)throw new Error(status.lastRefreshError||'Mini-PC CBS refresh failed.');
    if(status.lastRefreshOk===true){
      show('CBS refreshed and pushed. Loading the new data…');
      const publishDeadline=Date.now()+120000;
      while(Date.now()<publishDeadline){
        if(await loadPublishedCbs({silent:true,onlyIfNewer:true})){
          show('CBS refresh complete. Sunday Funday IQ is current.');
          return true;
        }
        await waitFor(2500);
      }
      throw new Error('CBS refreshed successfully, but the published app data is still deploying. Try again in a moment.');
    }
  }
  throw new Error('CBS refresh is taking longer than expected. Check Tailscale and try again.');
}
"""
s = s[:start] + new_refresh + s[end:]
s = s.replace('â€¦','…')
app.write_text(s, encoding='utf-8')

# Week length is not always 16 games. Keep live-data validation tied to the
# published market/slate size while preserving the fixed 16-game fixture tests.
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
print('patched refresh lifecycle and variable-week regression')
