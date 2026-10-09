const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'apps/pickem/index.html'),'utf8');
if(!html.includes('id="buildLabel"')) throw new Error('Pickem build label is not bound to MODEL_BUILD');
if(!html.includes("POOL_HISTORY_URL='../../data/analysis/cbs-pool-history-report.json'"))throw new Error('Completed-pool history is not wired into the module');
if(!html.includes('PROVISIONAL · PARTIAL POOL REVEAL')) throw new Error('Partial pool reveal label missing');
if(!html.includes('CURRENT CARD STILL LEADS THIS SEARCH')||!html.includes('Safety → upside strategy frontier'))throw new Error('Risk-return frontier or current-card guardrail missing');
if(!html.includes("state.originalConfidenceStatus==='placeholder'"))throw new Error('Placeholder confidence must not be presented as a meaningful baseline');
if(!html.includes("sfiqPickemV04")) throw new Error('Clean standings storage migration missing');
if(!html.includes('fieldModelComplete(state)')) throw new Error('Partial field must remain provisional');
if(!html.includes('href="?lab=1">Model Lab</a>')||!html.includes('Full-Slate Model Lab'))throw new Error('Full-slate Model Lab UI missing');
if(html.includes('View 0 changes and full card')||html.includes('winner flip')&&html.includes('Top-2 vs Safest'))throw new Error('Model Lab leaked cross-card comparison language into individual strategy cards');
if(!html.includes('<summary>View all ${games.length} picks</summary>'))throw new Error('Model Lab cards do not expose a dynamic full-card action');
if(!html.includes('Compare strategies')||!html.includes('Scenario Lab'))throw new Error('Strategy comparison or Scenario Lab UI missing');
if(!html.includes('Tradeoff vs Safest')||!html.includes('Avg score'))throw new Error('Model Lab does not frame average score as a strategy tradeoff');
if(!html.includes('Results update automatically')||!html.includes('scenario-livebar'))throw new Error('Scenario Lab lacks live recompute UX');
if(html.includes('id="scenarioRun"'))throw new Error('Scenario Lab still requires scrolling to a Run button');


if(html.includes('EMBEDDED_CBS_SCAN')) throw new Error('CBS live scan must not be embedded in app code');
if(!html.includes("LIVE_CBS_URL='../../data/live/cbs-pickem.json'")) throw new Error('Live CBS data URL missing');
if(html.includes('id="phoneSyncBtn"')||html.includes("$('phoneSyncBtn').onclick=pasteCbsPhoneSync"))throw new Error('Unused iPhone shortcut control must stay removed');
if(html.includes('id="scanFile"')||html.includes("$('scanFile').click()"))throw new Error('Refresh CBS Data must never open a local file picker');
if(!html.includes('week=${encodeURIComponent(state.week||1)}'))throw new Error('CBS market/results refresh is not week-aware');
if(!html.includes('body::before')||!html.includes('env(safe-area-inset-top)'))throw new Error('iPhone safe-area protection missing');
const js=html.split('<script>',2)[1].split('</script>',1)[0];
const ctx={console,globalThis:null,setTimeout,clearTimeout,fetch:async()=>({ok:false})};ctx.globalThis=ctx;ctx.__SFIQ_TESTING__=true;
vm.createContext(ctx);vm.runInContext(js,ctx,{filename:'pickem-index.js'});
const t=ctx.SFIQ_TEST,clone=x=>JSON.parse(JSON.stringify(x));
const swapCard={choices:[0,1,0],weights:[1,2,3]};
t.scenarioSwapConfidence(swapCard,0,3);
if(JSON.stringify(swapCard.weights)!==JSON.stringify([3,2,1]))throw new Error('Scenario confidence edit did not swap values to preserve uniqueness');

const blankGames=Array.from({length:16},(_,i)=>({id:'b'+i,away:'A'+i,home:'H'+i,awayPct:35,homePct:65,awayML:150,homeML:-170,total:44,pick:null,weight:null,locked:false,completed:false,winner:null}));
const blankBaseline=t.simulationCurrentCard(blankGames);
if(blankBaseline.source!=='generated_baseline'||blankBaseline.card.choices.some(x=>x!==0&&x!==1)||!t.validConfidence(blankBaseline.card.weights,16))throw new Error('Blank weekly slate cannot generate a valid pregame baseline');
const labSource=[{id:'g1',away:'A',home:'H',awayPct:40,homePct:60,awayML:120,homeML:-140,pick:'H',weight:1,locked:true,completed:true,winner:0,statusText:'Final'}];
const labCopy=t.fullSlateLabGames(labSource);
if(labCopy[0].locked||labCopy[0].completed||labCopy[0].winner!==null||labSource[0].locked!==true)throw new Error('Model Lab did not isolate/unlock a temporary slate copy');

if(typeof t.strategyCardRows!=='function')throw new Error('Complete strategy card view missing');
const displayGames=[{id:'a',away:'BUF',home:'KC',awayPct:70,homePct:30,awayML:-180,homeML:160,pick:'BUF',weight:1},{id:'b',away:'DET',home:'GB',awayPct:55,homePct:45,awayML:-120,homeML:110,pick:'DET',weight:2}];
const display=t.strategyCardRows(displayGames,{choices:[0,1],weights:[2,1]},{choices:[0,0],weights:[1,2]});
if(display.length!==2||display[0].team!=='BUF'||display[0].confidence!==2||display[1].team!=='GB'||!display[1].pickChanged)throw new Error('Full card does not show CBS-ready picks in descending confidence order');
const cardView={hidden:true,innerHTML:''},bodyClasses=new Set();
ctx.document={body:{classList:{add(...names){names.forEach(name=>bodyClasses.add(name))},remove(...names){names.forEach(name=>bodyClasses.delete(name))},contains(name){return bodyClasses.has(name)}}},getElementById:id=>id==='fullCardView'?cardView:null};
ctx.location={search:'?strategy=balanced'};ctx.URLSearchParams=URLSearchParams;
ctx.testGames=clone(t.SEED);ctx.testCard={choices:ctx.testGames.map(g=>g.pick===g.away?0:1),weights:ctx.testGames.map((_,i)=>i+1)};
vm.runInContext("state.games=testGames;state.week=3;state.optimization={modelBuild:MODEL_BUILD,ranAt:new Date().toISOString(),current:testCard,strategies:{balanced:{label:'Balanced',card:testCard,eval:{top2:.04,win:.01,bottomHalf:.3,avg:85}}}};renderFullCard()",ctx);
if(cardView.hidden||!cardView.innerHTML.includes('16 picks')||(cardView.innerHTML.match(/<details class="row">/g)||[]).length!==16)throw new Error('Strategy navigation did not render a complete 16-game card');
if(cardView.innerHTML.indexOf('class="points">16')>cardView.innerHTML.indexOf('class="points">1'))throw new Error('Full card displays points in the wrong order');
if(!cardView.innerHTML.includes('The simulation should be rerun before using these picks'))throw new Error('Card suppressed stale simulation warning');
if(/PICK CHANGE|CONFIDENCE MOVE|Submitted confidence|Keep the winner|difference(?:s)? from the card/.test(cardView.innerHTML))throw new Error('Strategy card still reads like a change list');
if(!/Pick [A-Z]+ for 16 points/.test(cardView.innerHTML)||!cardView.innerHTML.includes('Data &amp; model details')||!cardView.innerHTML.includes('strategy=balanced&amp;details=1'))throw new Error('Card lacks direct pick instructions or focused details navigation');
ctx.location={search:'?strategy=balanced&details=1'};
vm.runInContext('renderFullCard()',ctx);
if(!cardView.innerHTML.includes('How this card was modeled')||cardView.innerHTML.includes('Week 3 tournament card')||!cardView.innerHTML.includes('Back to Balanced card'))throw new Error('Details do not stay within the strategy experience');
ctx.location={search:'?details=1'};
vm.runInContext('renderFullCard()',ctx);
if(!cardView.innerHTML.includes('Data &amp; model details')||!cardView.innerHTML.includes('CBS picks')||cardView.innerHTML.includes('Run Simulation</button>'))throw new Error('Home details do not open a focused data view');
ctx.location={search:'?action=refresh-simulate'};
vm.runInContext('renderFullCard()',ctx);
if(cardView.hidden||!bodyClasses.has('run-mode'))throw new Error('Refresh route exposed the retired module');
if(!cardView.innerHTML.includes('Updating today’s cards')||!cardView.innerHTML.includes('CBS data')||!cardView.innerHTML.includes('Market odds')||!cardView.innerHTML.includes('Simulation'))throw new Error('Refresh route lacks focused progress steps');
if(cardView.innerHTML.includes('Week 3 tournament card')||cardView.innerHTML.includes('Run Simulation</button>'))throw new Error('Refresh route still renders retired dashboard content');
delete ctx.document;delete ctx.location;
if(typeof t.iqProb!=='function'||typeof t.formProb!=='function'||typeof t.refreshIqModel!=='function')throw new Error('IQ probability engine exports missing');
if(typeof t.probabilityProfile!=='function'||typeof t.strategicPickEvidence!=='function'||typeof t.allocateConfidence!=='function'||typeof t.compareCards!=='function')throw new Error('Separated decision-layer exports missing');
if(typeof t.buildStrategyFrontier!=='function'||typeof t.evaluateProxyField!=='function'||typeof t.neutralTop2!=='function')throw new Error('Calibrated strategy-frontier exports missing');
if(typeof t.normalizePoolHistory!=='function'||typeof t.drawFieldPicks!=='function')throw new Error('Historical pool prior helpers missing');
if(typeof t.applyStructuredCard!=='function')throw new Error('Authoritative CBS card merge helper missing');
if(Math.abs(t.neutralTop2(102)-2/102)>1e-12||Math.abs(t.neutralWin(102)-1/102)>1e-12)throw new Error('Neutral pool benchmarks are incorrect');
if(Math.abs(t.iqFormWeight(1)-.12)>1e-12)throw new Error('Week 2 form weight must remain conservatively shrunk');
if(t.iqFormWeight(6)>.37)throw new Error('Early-season form weight cap is too aggressive');
if(t.confidenceCeilingFromProbability(.417,16)!==4)throw new Error('Market underdog must not receive elite confidence');
if(t.confidenceCeilingFromProbability(.447,16)!==4)throw new Error('Small IQ edge must not turn a market underdog into an elite-confidence play');
if(t.confidenceCeilingFromProbability(.61,16)!==12)throw new Error('Moderate favorite confidence ceiling is too aggressive');
if(t.confidenceCeilingFromProbability(.71,16)!==16)throw new Error('Strong favorite confidence ceiling is too restrictive');
if(Math.abs(t.scenarioProbability(.42,.54,1)-.42)>1e-12||Math.abs(t.scenarioProbability(.42,.54,2)-.48)>1e-12)throw new Error('Market/IQ stress-test scenarios are incorrect');
const riskGames=[{id:'atl',away:'ATL',home:'CAR',awayPct:23,homePct:77,awayML:140,homeML:-140,pick:'ATL',weight:13}];
for(let i=1;i<16;i++)riskGames.push({id:'safe'+i,away:'U'+i,home:'F'+i,awayPct:20,homePct:80,awayML:200,homeML:-200,pick:'F'+i,weight:i===13?16:i});
const riskCard={choices:riskGames.map((g,i)=>i?1:0),weights:riskGames.map(g=>g.weight)};
const calibrated=t.seedRiskCalibratedConfidence(riskCard,riskGames,new Set());
if(calibrated.weights[0]>4)throw new Error(`41.7% contrarian side received unsafe confidence ${calibrated.weights[0]}`);
if(t.confidenceRiskPenalty(riskGames,calibrated)!==0)throw new Error('Risk-calibrated seed card violates its confidence ceilings');
const atlEvidence=t.strategicPickEvidence(riskGames[0],1,0,{proxyField:true});
if(!atlEvidence.eligible||!atlEvidence.contrarian||atlEvidence.classification!=='OPTIONAL FLIP')throw new Error('Credible underdog leverage must remain optional, not strong or blocked');
const reckless={id:'reckless',away:'DOG',home:'FAV',awayPct:7,homePct:93,awayML:300,homeML:-350,pick:'FAV',weight:1};
if(t.strategicPickEvidence(reckless,1,0,{proxyField:true}).eligible)throw new Error('Low-probability underdog was allowed as a leverage flip');
const strong={id:'strong',away:'DOG',home:'FAV',awayPct:35,homePct:65,awayML:190,homeML:-215,pick:'DOG',weight:1};
const strongEvidence=t.strategicPickEvidence(strong,0,1,{proxyField:true});
if(!strongEvidence.eligible||strongEvidence.contrarian||strongEvidence.classification!=='STRONG FLIP')throw new Error('Clear expected-winner correction must be a strong flip');
const ownershipVariant=clone(riskGames);ownershipVariant.forEach((g,i)=>{g.awayPct=i?49:5;g.homePct=100-g.awayPct});
const ownershipCalibrated=t.allocateConfidence(riskCard,ownershipVariant,new Set());
if(JSON.stringify(calibrated.weights)!==JSON.stringify(ownershipCalibrated.weights))throw new Error('Pool ownership contaminated confidence allocation');
const iqFallback=t.iqProb(t.SEED[0],0),marketFallback=t.marketProb(t.SEED[0],0);if(Math.abs(iqFallback-marketFallback)>1e-12)throw new Error('IQ probability must fall back to market without team ratings');
const week2Parsed=t.parsePicks('1-0\nBENGALS\n37%\n0-1\nTEXANS\n63%');
if(week2Parsed.length!==1||week2Parsed[0].away!=='CIN'||week2Parsed[0].home!=='HOU')throw new Error('Week 2 records were not parsed');
const directGames=[{away:'A',home:'B'},{away:'C',home:'D'}];
const directCard=t.extractStructuredCard({myCard:{picks:['B','C'],weights:[2,1]}},directGames);
if(directCard.pickCount!==2||directCard.picks[0]!=='B'||directCard.weights[1]!==1)throw new Error('Sanitized direct CBS card was not imported');
const pre=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/cbs-pregame.json'),'utf8'));
const post=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/cbs-postgame.json'),'utf8'));
const expectedPre={picks:['SEA','LAR','CIN','BUF','BAL','CAR','DET','JAX','PIT','TEN','GB','PHI','LV','LAC','DAL','KC'],weights:[1,15,14,13,11,10,16,9,7,6,5,12,3,8,4,2]};
const expectedPost={picks:['SEA','SF','CIN','HOU','BAL','CHI','DET','JAX','PIT','NYJ','GB','PHI','LV','LAC','DAL','KC'],weights:[9,1,13,7,14,8,16,12,11,2,6,15,4,10,5,3]};
function assertCard(label,actual,expected){if(actual.pickCount!==16||actual.weightCount!==16)throw new Error(`${label}: ${actual.pickCount}/${actual.weightCount}`);if(JSON.stringify(actual.picks)!==JSON.stringify(expected.picks))throw new Error(`${label}: picks mismatch`);if(JSON.stringify(actual.weights)!==JSON.stringify(expected.weights))throw new Error(`${label}: confidence mismatch`);if(new Set(actual.weights).size!==16)throw new Error(`${label}: confidence not unique`)}
assertCard('pregame',t.extractStructuredCard(pre,clone(t.SEED)),expectedPre);
const postGames=clone(t.SEED);for(const g of postGames){if(g.away==='NE'&&g.home==='SEA')Object.assign(g,{pick:'SEA',weight:9,locked:true,completed:true,winner:1,statusText:'Final 10-13'});if(g.away==='SF'&&g.home==='LAR')Object.assign(g,{pick:'SF',weight:1,locked:true,completed:true,winner:0,statusText:'Final 27-7'})}
assertCard('postgame',t.extractStructuredCard(post,postGames),expectedPost);
const fm=t.extractFieldModel(post,postGames);if(!fm||fm.observedEntries!==92)throw new Error(`field model expected 92, got ${fm?.observedEntries}`);
const live=JSON.parse(fs.readFileSync(path.join(root,'data/live/cbs-pickem.json'),'utf8'));
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
  if(new Set(liveCard.weights).size!==liveExpected||liveCard.weights.some(x=>x<1||x>liveExpected))throw new Error(`published live CBS: confidence values must be unique 1–${liveExpected}`);
  if(liveCard.picks.some((pick,i)=>pick!==liveGames[i].away&&pick!==liveGames[i].home))throw new Error('published live CBS: invalid matchup pick');
}
// A version upgrade must retire old model odds without losing submitted cards
// or the decision history used for postgame analysis.
const saved={games:liveGames,optimization:{modelBuild:'1.9.1',recommended:{choices:[],weights:[]}},recommendedCard:{choices:[],weights:[]},sim:{top2:.053},originalCard:{choices:[0],weights:[11]},decisionHistory:[{type:'locked',at:'2026-09-24'}]};
ctx.localStorage={getItem:()=>JSON.stringify(saved)};
const migrated=vm.runInContext('loadState()',ctx);
if(migrated.optimization||migrated.recommendedCard||migrated.sim)throw new Error('Old simulated recommendations survived model upgrade');
if(migrated.originalCard.weights[0]!==11||migrated.decisionHistory[0].type!=='locked')throw new Error('Model upgrade lost saved user decisions');
delete ctx.localStorage;
if(live.season===2026&&live.week===3){
  const expectedLive={
    picks:['GB','BUF','CAR','DET','HOU','JAX','KC','NYG','CIN','SEA','SF','MIN','BAL','NO','LAR','PHI'],
    weights:[11,16,15,14,13,12,10,9,8,7,6,5,4,3,2,1]
  };
  assertCard('published Week 3 screenshot card',liveCard,expectedLive);
  if(live.confidenceStatus!=='submitted'||!/Green Bay at 11/i.test(live.confidenceNote||''))throw new Error('published Week 3 CBS: final submitted confidence provenance missing');
  const staleLocked=clone(liveGames);
  const gb=staleLocked.find(g=>g.away==='ATL'&&g.home==='GB');Object.assign(gb,{pick:'GB',weight:16,locked:true,completed:true});
  t.applyStructuredCard(staleLocked,liveCard);
  if(gb.weight!==11)throw new Error('authoritative CBS refresh preserved stale locked GB confidence');
}
const stableOpts={currentCard:{choices:expectedPost.picks.map((p,i)=>p===postGames[i].away?0:1),weights:expectedPost.weights},searchIters:120,finalIters:300,seed:20260908,fieldModel:fm};
const first=t.runOptimizer(postGames,93,stableOpts),second=t.runOptimizer(postGames,93,{...stableOpts,currentCard:first.recommended});
for(const key of ['safest','balanced','aggressive','maxUpside'])if(!first.strategies?.[key])throw new Error(`strategy frontier missing ${key}`);
if(first.strategies.safest.eval.avg+1e-9<first.strategies.balanced.eval.avg-3)throw new Error('Balanced card exceeded its expected-points risk budget');
if(first.strategies.aggressive.eval.avg+1e-9<first.strategies.safest.eval.avg-6)throw new Error('Aggressive card exceeded its expected-points risk budget');
if(!Number.isFinite(first.fieldCalibration?.top2)||!Number.isFinite(first.fieldCalibrationError))throw new Error('Proxy-field calibration diagnostic missing');
if(JSON.stringify(first.recommended)!==JSON.stringify(second.recommended))throw new Error('optimizer recommendation is path-dependent');
if(t.cardActions(postGames,second.current,second.recommended,second.finalWorlds).length)throw new Error('applied recommendation produces reversal advice');
const protectedGames=clone(postGames);protectedGames[2].protectedPick=true;protectedGames[2].protectedConfidence=true;
const protectedRun=t.runOptimizer(protectedGames,93,{...stableOpts,searchIters:60,finalIters:120});
if(protectedRun.recommended.choices[2]!==stableOpts.currentCard.choices[2]||protectedRun.recommended.weights[2]!==stableOpts.currentCard.weights[2])throw new Error('protected pick or confidence changed');

const poolHistory=JSON.parse(fs.readFileSync(path.join(root,'data/analysis/cbs-pool-history-report.json'),'utf8')),poolPrior=t.normalizePoolHistory(poolHistory,16);
if(!poolPrior||poolPrior.weeks!==2||Math.abs(poolPrior.reliability-.2)>1e-12)throw new Error('Two-week pool history must be conservatively weighted at 20%');
const learnedRun=t.runOptimizer(postGames,93,{...stableOpts,searchIters:100,finalIters:240,poolPrior});
if(!learnedRun.poolPrior||learnedRun.poolPrior.weeks!==2)throw new Error('Optimizer did not preserve historical-prior provenance');
if(learnedRun.strategies.balanced.objective!=='risk-adjusted-top2'||learnedRun.strategies.aggressive.objective!=='top2-first'||learnedRun.strategies.maxUpside.objective!=='win-first')throw new Error('Strategy frontier did not preserve independent objectives');
console.log('Pickem regression suite passed: imports valid, live card flexible, recommendations stable after application.');
