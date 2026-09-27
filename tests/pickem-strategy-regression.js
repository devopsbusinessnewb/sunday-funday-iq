const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'apps/pickem/index.html'),'utf8');
const js=html.split('<script>',2)[1].split('</script>',1)[0];
const ctx={console,globalThis:null,setTimeout,clearTimeout,fetch:async()=>({ok:false})};ctx.globalThis=ctx;ctx.__SFIQ_TESTING__=true;
vm.createContext(ctx);vm.runInContext(js,ctx,{filename:'pickem-index.js'});
const t=ctx.SFIQ_TEST;

function game(i,{awayP=.35,awayPct=25,pick=1,weight=i+1}={}){
  const away=`A${i}`,home=`H${i}`,awayML=Math.round(100*(1-awayP)/awayP),homeP=1-awayP,homeML=-Math.round(100*homeP/(1-homeP));
  return{id:`g${i}`,away,home,awayPct,homePct:100-awayPct,awayML,homeML,pick:pick===0?away:home,weight,locked:false,completed:false,winner:null};
}

// Confidence is a probability portfolio. Ownership changes must not move it.
const games=Array.from({length:16},(_,i)=>game(i,{awayP:i<2?.41:.20+i*.005,awayPct:i<2?10:20,weight:i+1}));
const contrarian={choices:games.map((_,i)=>i<2?0:1),weights:games.map(g=>g.weight)};
const allocated=t.allocateConfidence(contrarian,games,new Set());
if(allocated.weights[0]>2||allocated.weights[1]>2)throw new Error(`Contrarian underdogs received excessive confidence: ${allocated.weights[0]}, ${allocated.weights[1]}`);
const ownershipChanged=JSON.parse(JSON.stringify(games));ownershipChanged.forEach(g=>{g.awayPct=45;g.homePct=55});
const allocatedAgain=t.allocateConfidence(contrarian,ownershipChanged,new Set());
if(JSON.stringify(allocated.weights)!==JSON.stringify(allocatedAgain.weights))throw new Error('Ownership changed confidence allocation');

// Max-upside search may consider a credible, highly under-owned 30–40%
// underdog that is too volatile for Balanced, while still excluding longshots.
const upsideDog=game(99,{awayP:.36,awayPct:10,pick:1,weight:1});
if(t.strategicPickEvidence(upsideDog,1,0,{proxyField:true}).eligible)throw new Error('Standard flip gate unexpectedly admitted the upside-only underdog');
if(!t.upsidePickEvidence(upsideDog,0).eligible)throw new Error('Max-upside gate rejected a credible under-owned underdog');
const lotteryDog=game(100,{awayP:.20,awayPct:5,pick:1,weight:1});
if(t.upsidePickEvidence(lotteryDog,0).eligible)throw new Error('Max-upside gate admitted an irrational longshot');

// Strategy lanes must stay structurally distinct. This is a regression guard
// against collapsing four portfolio mandates back into one shared optimizer.
const balancedLane=t.strategyLaneConfig('balanced'),aggressiveLane=t.strategyLaneConfig('aggressive'),maxLane=t.strategyLaneConfig('maxUpside');
if(!(balancedLane.maxFlips<aggressiveLane.maxFlips&&aggressiveLane.maxFlips<maxLane.maxFlips))throw new Error('Strategy flip budgets collapsed together');
const balancedConf=t.confidenceStrategyConfig('balanced'),aggressiveConf=t.confidenceStrategyConfig('aggressive'),maxConf=t.confidenceStrategyConfig('maxUpside');
if(!(balancedConf.probBand<aggressiveConf.probBand&&aggressiveConf.probBand<maxConf.probBand))throw new Error('Strategy confidence risk bands collapsed together');
const aggressiveOnlyDog=game(101,{awayP:.36,awayPct:10,pick:1,weight:1});
if(t.strategyFlipEvidence(aggressiveOnlyDog,0,'balanced').eligible)throw new Error('Balanced admitted an aggressive-only leverage play');
if(!t.strategyFlipEvidence(aggressiveOnlyDog,0,'aggressive').eligible)throw new Error('Aggressive rejected its intended leverage lane');
const maxOnlyDog=game(102,{awayP:.31,awayPct:8,pick:1,weight:1});
if(t.strategyFlipEvidence(maxOnlyDog,0,'aggressive').eligible)throw new Error('Aggressive admitted a max-upside-only play');
if(!t.strategyFlipEvidence(maxOnlyDog,0,'maxUpside').eligible)throw new Error('Max Upside rejected its intended broader leverage lane');

// Near-ties retain the user's prior relative order instead of creating churn.
const ties=[game(20,{awayP:.44,weight:3}),game(21,{awayP:.445,weight:1}),game(22,{awayP:.45,weight:2})];
const tieCard={choices:[1,1,1],weights:[3,1,2]};
const tieAllocated=t.allocateConfidence(tieCard,ties,new Set());
if(JSON.stringify(tieAllocated.weights)!==JSON.stringify(tieCard.weights))throw new Error('Near-tie confidence order churned without evidence');

// With only CBS-wide proxy ownership, candidate generation may not stack
// multiple contrarian underdog flips.
const favoriteCard={choices:games.map(()=>1),weights:games.map(g=>g.weight)};
const search=t.searchCandidates(games,favoriteCard,102,{searchIters:60,seed:991});
for(const c of search.candidates){
  const underdogFlips=c.card.choices.filter((choice,i)=>choice===0&&favoriteCard.choices[i]===1).length;
  if(underdogFlips>1)throw new Error(`Proxy-field search stacked ${underdogFlips} contrarian flips`);
}

// Paired comparison must report no manufactured improvement for identical cards.
const worlds=t.buildWorlds(games,102,90,771,null),same=t.compareCards(favoriteCard,favoriteCard,worlds);
if(Math.abs(same.top2Delta)>1e-12||Math.abs(same.pointsDelta)>1e-12||Math.abs(same.worstScenarioTop2Delta)>1e-12)throw new Error('Identical cards produced a simulated improvement');

// A locked result must be framed relative to the revealed field, not as if
// the user's loss happened in isolation. A loss shared by 90% of the field is
// a small relative setback; the 10% minority winner receives the advantage.
const lockedGames=JSON.parse(JSON.stringify(games));
Object.assign(lockedGames[0],{locked:true,completed:true,winner:0,pick:lockedGames[0].home,weight:11});
const lockedCurrent={choices:lockedGames.map(g=>g.pick===g.away?0:1),weights:[11,1,2,3,4,5,6,7,8,9,10,12,13,14,15,16]};
const lockedField={primaryGameId:lockedGames[0].id,observedEntries:100,locked:[{gameId:lockedGames[0].id,defaultWeight:16,totalObserved:100,observations:[
  ...Array.from({length:90},()=>({pick:lockedGames[0].home,weight:11})),
  ...Array.from({length:10},()=>({pick:lockedGames[0].away,weight:8}))
]}]};
const sharedLoss=t.lockedFieldImpact(lockedGames,lockedField,lockedCurrent);
if(sharedLoss.classification!=='WIDELY_SHARED_LOSS'||Math.abs(sharedLoss.samePickShare-.9)>1e-12||Math.abs(sharedLoss.advantagedShare-.1)>1e-12)throw new Error('Widely shared locked loss was not classified relative to the field');
const minorityWinner={...lockedCurrent,choices:[0,...lockedCurrent.choices.slice(1)]};
const minorityImpact=t.lockedFieldImpact(lockedGames,lockedField,minorityWinner);
if(minorityImpact.classification!=='MINORITY_WIN'||Math.abs(minorityImpact.advantagedShare-.9)>1e-12)throw new Error('Minority locked winner did not retain its field advantage');
const conditional=t.runOptimizer(lockedGames,102,{currentCard:lockedCurrent,searchIters:30,finalIters:60,fieldModel:lockedField});
if(conditional.currentControl?.fieldImpact?.classification!=='WIDELY_SHARED_LOSS'||!Number.isFinite(conditional.currentControl?.eval?.top2))throw new Error('Optimizer did not preserve the current card as the conditional control');
// Histogram scoring must preserve the former sorted-field tie and rank math.
const oldField=[3,3,5,7,7,7,9].sort((a,b)=>a-b),histogram=Array.from({length:12},(_,score)=>oldField.filter(x=>x===score).length);
const above=histogram.map((_,score)=>oldField.filter(x=>x>=score).length).concat(0);
for(const points of [2,3,4,5,7,8,9,10]){
  const old=t.evaluateCard({choices:[1],weights:[points]},[{scenario:0,winners:Uint8Array.from([1]),field:oldField}]);
  const fast=t.evaluateCard({choices:[1],weights:[points]},[{scenario:0,winners:Uint8Array.from([1]),fieldHistogram:histogram,fieldAbove:above,fieldSize:oldField.length}]);
  for(const key of ['top2','win','top10','bottomHalf'])if(Math.abs(old[key]-fast[key])>1e-12)throw new Error(`Histogram scoring changed ${key} for ${points} points`);
}

// Max-upside confidence must be searched against tournament outcomes rather
// than merely returning the conservative probability ordering.
const equalGames=[game(30,{awayP:.40,weight:1}),game(31,{awayP:.40,weight:2}),game(32,{awayP:.40,weight:3})];
const equalCard={choices:[1,1,1],weights:[1,2,3]},upsideWorlds=Array.from({length:30},(_,i)=>({scenario:i%3,validationSeed:i%3,winners:Uint8Array.from([1,0,0]),proxyScore:2,field:[2,2,2,2]}));
const upsideConfidence=t.optimizeTournamentConfidence(equalCard,upsideWorlds,new Set(),equalGames,2);
if(upsideConfidence.card.weights[0]!==3)throw new Error('Tournament confidence search did not improve the upside allocation');
if(t.seedStability(upsideConfidence.card,upsideWorlds).seeds!==3)throw new Error('Independent-seed stability diagnostic missing');

// A held-out entry produced by the same proxy-field process must reproduce the
// mathematical tournament baseline and sensible rank-distribution anchors.
const calibrationWorlds=t.buildWorlds(games,102,2200,1871,null),cal=t.evaluateProxyField(calibrationWorlds),neutral=t.neutralTop2(102);
if(Math.abs(cal.top2-neutral)>.015)throw new Error(`Proxy field is not Top-2 calibrated: ${cal.top2} vs ${neutral}`);
if(Math.abs(cal.top10-.10)>.04)throw new Error(`Proxy field Top-10 distribution is distorted: ${cal.top10}`);
if(Math.abs(cal.bottomHalf-.50)>.05)throw new Error(`Proxy field median distribution is distorted: ${cal.bottomHalf}`);

// Strategy objectives must represent genuinely different jobs. Safest should
// prefer the stronger expected-points floor, while Max Upside may rationally
// accept a much worse floor for a materially higher win ceiling.
const floorCard={avg:90,bottomHalf:.32,top2:.012,win:.004,top10:.12};
const ceilingCard={avg:80,bottomHalf:.66,top2:.055,win:.035,top10:.19};
if(t.strategyObjective('safest',floorCard)<=t.strategyObjective('safest',ceilingCard))throw new Error('Safest objective did not prioritize the scoring floor');
if(t.strategyObjective('maxUpside',ceilingCard)<=t.strategyObjective('maxUpside',floorCard))throw new Error('Max-upside objective remained anchored to the safe card');
const balancedTop2={avg:81,bottomHalf:.48,top2:.021,win:.010,top10:.10},balancedCosmetic={avg:87,bottomHalf:.38,top2:.001,win:0,top10:.17};
if(t.strategyObjective('balanced',balancedTop2)<=t.strategyObjective('balanced',balancedCosmetic))throw new Error('Balanced sacrificed Top-2 probability for cosmetic safety metrics');
if(!t.strategyEquivalent(favoriteCard,JSON.parse(JSON.stringify(favoriteCard))))throw new Error('Equivalent strategy cards were not detected');

// The frontier must expose explicit risk choices, preserve valid confidence,
// and ensure the card labeled Safest actually leads on expected points.
const frontier=t.buildStrategyFrontier(games,favoriteCard,calibrationWorlds,search.candidates.map(x=>x.card),102);
for(const key of ['safest','balanced','aggressive','maxUpside']){
  const p=frontier[key];if(!p||!t.validConfidence(p.card.weights,16))throw new Error(`Invalid or missing ${key} frontier card`);
  if(frontier.safest.eval.avg+1e-9<p.eval.avg)throw new Error(`${key} has more expected points than Safest`);
}
if(frontier.maxUpside.objective!=='win-first'||frontier.aggressive.objective!=='top2-first'||frontier.safest.objective!=='floor-first')throw new Error('Frontier strategies do not expose independent objectives');
if(frontier.balanced.flips>1||frontier.aggressive.flips>3)throw new Error('Balanced or Aggressive exceeded its declared risk lane');
if(frontier.validationSeeds<1||!Number.isInteger(frontier.candidateCount)||frontier.candidateCount<2)throw new Error('Frontier search coverage is not reported');

// Import failures must identify exact games and confidence defects.
const broken=JSON.parse(JSON.stringify(games));broken[0].pick=null;broken[1].weight=null;broken[2].weight=broken[3].weight;
const issues=t.cardImportIssues(broken).join(' | ');
if(!issues.includes(`${broken[0].away} @ ${broken[0].home}: missing selected winner`))throw new Error('Missing pick diagnostic is not actionable');
if(!issues.includes(`${broken[1].away} @ ${broken[1].home}: missing or invalid confidence`))throw new Error('Missing confidence diagnostic is not actionable');
if(!issues.includes('is duplicated'))throw new Error('Duplicate confidence diagnostic missing');

console.log('Pickem strategy regression passed: decision layers separated, proxy leverage capped, confidence stable, and import errors actionable.');
