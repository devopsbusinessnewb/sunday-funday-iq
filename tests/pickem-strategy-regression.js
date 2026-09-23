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

// Import failures must identify exact games and confidence defects.
const broken=JSON.parse(JSON.stringify(games));broken[0].pick=null;broken[1].weight=null;broken[2].weight=broken[3].weight;
const issues=t.cardImportIssues(broken).join(' | ');
if(!issues.includes(`${broken[0].away} @ ${broken[0].home}: missing selected winner`))throw new Error('Missing pick diagnostic is not actionable');
if(!issues.includes(`${broken[1].away} @ ${broken[1].home}: missing or invalid confidence`))throw new Error('Missing confidence diagnostic is not actionable');
if(!issues.includes('is duplicated'))throw new Error('Duplicate confidence diagnostic missing');

console.log('Pickem strategy regression passed: decision layers separated, proxy leverage capped, confidence stable, and import errors actionable.');
