from pathlib import Path

# Apply the validated app/home transformation first.
exec(Path('tools/patch-cbs-refresh-resilience-v2.py').read_text(encoding='utf-8'),{'__name__':'__main__'})

TEST=Path('tests/pickem-regression.js')
t=TEST.read_text(encoding='utf-8')
old="""if(live.confidenceStatus==='unsubmitted'){
  if(liveCard.pickCount!==0||liveCard.weightCount!==0)throw new Error(`published live CBS blank slate unexpectedly contains picks/confidence: ${liveCard.pickCount}/${liveCard.weightCount}`);
  const generated=t.simulationCurrentCard(liveGames);
  if(generated.source!=='generated_baseline'||!t.validConfidence(generated.card.weights,liveExpected))throw new Error('published blank CBS slate cannot generate a valid Week baseline');
}else{
  if(liveCard.pickCount!==liveExpected||liveCard.weightCount!==liveExpected)throw new Error(`published live CBS: ${liveCard.pickCount}/${liveCard.weightCount}`);
  if(new Set(liveCard.weights).size!==liveExpected||liveCard.weights.some(x=>x<1||x>liveExpected))throw new Error(`published live CBS: confidence values must be unique 1–${liveExpected}`);
  if(liveCard.picks.some((pick,i)=>pick!==liveGames[i].away&&pick!==liveGames[i].home))throw new Error('published live CBS: invalid matchup pick');
}
"""
new="""if(live.confidenceStatus==='submitted'){
  if(liveCard.pickCount!==liveExpected||liveCard.weightCount!==liveExpected)throw new Error(`published submitted CBS: ${liveCard.pickCount}/${liveCard.weightCount}`);
  if(new Set(liveCard.weights).size!==liveExpected||liveCard.weights.some(x=>x<1||x>liveExpected))throw new Error(`published submitted CBS: confidence values must be unique 1–${liveExpected}`);
  if(liveCard.picks.some((pick,i)=>pick!==liveGames[i].away&&pick!==liveGames[i].home))throw new Error('published submitted CBS: invalid matchup pick');
}else{
  if(liveCard.pickCount===liveExpected&&liveCard.weightCount===liveExpected)throw new Error('published non-submitted CBS payload unexpectedly reconstructs a complete card');
  const generated=t.simulationCurrentCard(liveGames);
  if(generated.source!=='generated_baseline'||!t.validConfidence(generated.card.weights,liveExpected))throw new Error('published incomplete CBS slate cannot generate a valid Week baseline');
}
"""
if old in t:
    t=t.replace(old,new,1)
elif "published submitted CBS:" not in t:
    raise SystemExit('live confidence-status regression anchor not found')
TEST.write_text(t,encoding='utf-8')
print('updated regression semantics for partial CBS cards')
