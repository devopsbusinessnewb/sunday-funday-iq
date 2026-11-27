const fs=require('fs');
const vm=require('vm');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const js=html.split('<script>',2)[1]?.split('</script>',1)[0];
if(!js)throw new Error('Home has no executable script');
class TestDate extends Date{
  static now(){return Date.parse('2026-09-27T12:30:00Z')}
}
const context={console,Date:TestDate,AbortController,setTimeout,clearTimeout,globalThis:null,localStorage:{getItem:()=>null}};context.globalThis=context;context.__SFIQ_TESTING__=true;
vm.createContext(context);vm.runInContext(js.includes('if(!TESTING)bootHome()')?js:js.slice(0,js.lastIndexOf("\ndocument.querySelectorAll('.tile').forEach")),context);
const home=context.SFIQ_HOME_TEST;
if(!home?.strategySnapshot)throw new Error('Home does not expose saved CBS strategies');
const pickemHtml=fs.readFileSync(path.join(__dirname,'../apps/pickem/index.html'),'utf8');
const pickemBuild=(pickemHtml.match(/const MODEL_BUILD='([^']+)'/)||[])[1];
if(!pickemBuild||pickemBuild!==home.MODEL_BUILD)throw new Error(`CBS home/model build mismatch: home ${home.MODEL_BUILD}, pickem ${pickemBuild||'missing'}`);
if(/Build\s+1\.\d+\.\d+/.test(pickemHtml))throw new Error('Pickem header contains a hard-coded build number instead of MODEL_BUILD');

const cards=Object.fromEntries(['safest','balanced','aggressive','maxUpside'].map((key,i)=>[key,{label:key,card:{choices:[1],weights:[i+1]},eval:{top2:.02+i*.01,win:.01,bottomHalf:.4,avg:90},stability:{top2Min:.01,top2Max:.06}}]));
const currentEval={top2:.041,win:.022,bottomHalf:.43,avg:91};
const state={week:3,season:2026,optimization:{modelBuild:home.MODEL_BUILD,ranAt:'2026-09-27T12:00:00Z',strategies:cards,currentEval},cbsUpdatedAt:'2026-09-27T11:00:00Z',marketUpdatedAt:'2026-09-27T11:00:00Z'};
const result=home.strategySnapshot(state,{season:2026,week:3},Date.parse('2026-09-27T12:30:00Z'));
if(result.status!=='ready'||result.cards.length!==4||result.cards[3].key!=='maxUpside')throw new Error('Current week four-strategy dashboard missing');
if(!result.cards.every(x=>x.href.includes('strategy='+x.key)))throw new Error('Strategy tiles do not open corresponding full cards');
if(home.strategySnapshot(state,{season:2026,week:4},Date.now()).status!=='missing')throw new Error('Old week projections appeared as current cards');
const lionsHome=JSON.parse(JSON.stringify(state));
lionsHome.games=[{away:'CHI',home:'DET',pick:null,locked:false}];
for(const s of Object.values(lionsHome.optimization.strategies))s.card={choices:[0],weights:[1]};
if(home.strategySnapshot(lionsHome,{season:2026,week:3}).status!=='pick-rule-conflict')throw Error('Home recommended a cached card against Detroit');
for(const s of Object.values(lionsHome.optimization.strategies))s.card.choices[0]=1;
if(home.strategySnapshot(lionsHome,{season:2026,week:3}).cards.length!==4)throw Error('Home blocked Detroit-protected cards');
const lockedState=JSON.parse(JSON.stringify(state));
lockedState.games=[{away:'IND',home:'HOU',pick:'HOU',weight:9,locked:true},...Array.from({length:12},(_,i)=>({away:'A'+i,home:'H'+i,locked:false}))];
const lockedSnapshot=home.strategySnapshot(lockedState,{season:2026,week:3});
if(lockedSnapshot.status!=='locked-conflict'||lockedSnapshot.cards.length||!lockedSnapshot.message.includes('HOU is locked at 9'))throw Error('Home advertised probabilities for cards contradicting a known lock');
for(const s of Object.values(lockedState.optimization.strategies))s.card={choices:[1,...Array(12).fill(0)],weights:[9,1,2,3,4,5,6,7,8,10,11,12,13]};
if(home.strategySnapshot(lockedState,{season:2026,week:3}).cards.length!==4)throw Error('Home blocked cards that preserve the actual locked pick');
lockedState.confirmedLockedPicks=[{season:2026,week:3,away:'IND',home:'HOU',pick:'HOU',weight:8}];
if(home.strategySnapshot(lockedState,{season:2026,week:3}).status!=='locked-conflict')throw Error('Home ignored a user-confirmed confidence correction');
lockedState.confirmedLockedPicks[0].week=2;
if(home.strategySnapshot(lockedState,{season:2026,week:3}).cards.length!==4)throw Error('A prior-week correction leaked into this week');
if(home.chooseFreshLive([{season:2026,week:6,exportedAt:'2026-10-20T14:10:00Z'},{season:2026,week:7,exportedAt:'2026-10-20T14:09:00Z'}]).week!==7)throw new Error('Home did not prefer the newer CBS week over a later stale-week timestamp');
if(home.chooseFreshLive([{season:2026,week:7,exportedAt:'2026-10-20T14:09:00Z'},{season:2026,week:7,exportedAt:'2026-10-20T14:11:00Z'}]).exportedAt!=='2026-10-20T14:11:00Z')throw new Error('Home did not prefer the newest publication within the same week');
if(home.strategySnapshot({...state,marketUpdatedAt:'2026-09-27T12:05:00Z'},{season:2026,week:3},Date.parse('2026-09-27T12:30:00Z')).status!=='stale')throw new Error('New market inputs did not stale the saved simulation');
if(home.strategySnapshot(state,{season:2026,week:3,exportedAt:'2026-09-27T12:10:00Z'},Date.parse('2026-09-27T12:30:00Z')).status!=='stale')throw new Error('New published CBS picks did not stale the saved simulation');
if(home.strategySnapshot(state,{season:2026,week:3},Date.parse('2026-09-29T12:00:00Z')).status!=='stale')throw new Error('Old simulation was presented as current');
const now=Date.parse('2026-09-27T12:30:00Z');
const publish={season:2026,week:3};
const startedRaw={events:[{competitions:[{competitors:[
  {homeAway:'away',team:{abbreviation:'JAC'}},{homeAway:'home',team:{abbreviation:'HOU'}}
],status:{type:{state:'in',completed:false}}}]}]};
const startedEvidence=home.scoreboardGameStates(startedRaw);
if(startedEvidence.length!==1||!startedEvidence[0].started||startedEvidence[0].completed)throw Error('Authoritative live kickoff was not recognized before final');
const newLock=JSON.parse(JSON.stringify(lockedState));
newLock.games[0]={...newLock.games[0],away:'JAX',locked:false};
newLock.confirmedLockedPicks=[];
newLock.confidenceStatus='unsubmitted';
newLock.optimization.currentSource='generated_baseline';
if(home.strategySnapshot(newLock,publish,now,startedEvidence).status!=='locked-conflict')throw Error('Home treated an unsubmitted or generated pick as the actual newly locked pick');
if(home.strategySnapshot(newLock,{...publish,gameState:[{away:'JAX',home:'HOU',started:true}]},now).status!=='locked-conflict')throw Error('Home missed an explicitly started game from current CBS data');
const scheduledOnly={...publish,gameState:[{away:'JAX',home:'HOU',completed:false,statusText:'9/26 - 1:00 PM EST'}]};
if(home.strategySnapshot(newLock,scheduledOnly,now).status!=='ready')throw Error('A schedule label alone must not lock a delayed game');
// Minimal sanitized data extracted from Week 12 export commit 91c25595b404ec38dc8d539ddfce08110408b17f.
// A current draft can have been rebuilt after export, so newer-published-data
// freshness alone is not sufficient when the browser's scoreboard is down.
const fridayPublished={season:2026,week:12,exportedAt:'2026-11-27T20:54:29.860705Z',gameState:[
  {away:'DEN',home:'PIT',completed:false,winner:null,statusText:'9:42 - 2nd'},
]};
const fridayNow=Date.parse('2026-11-27T21:00:00Z');
const fridayDraft=JSON.parse(JSON.stringify(newLock));
Object.assign(fridayDraft,{week:12,cbsUpdatedAt:fridayPublished.exportedAt,marketUpdatedAt:'2026-11-27T20:54:29.860680Z'});
fridayDraft.optimization.ranAt='2026-11-27T20:57:00Z';
fridayDraft.games[0]={away:'DEN',home:'PIT',locked:false,pick:null,weight:null};
if(home.strategySnapshot(fridayDraft,fridayPublished,fridayNow,[]).status!=='locked-conflict')throw Error('Friday CBS period-clock evidence did not block pre-kickoff strategies with ESPN unavailable');
for(const statusText of ['11/27 - 3:00 PM EST','3:00 PM - EST','6:61 - 2nd','9:42 - 2nd postponed','Delayed']){
  const draft={...fridayPublished,gameState:[{...fridayPublished.gameState[0],statusText}]};
  if(home.strategySnapshot(fridayDraft,draft,fridayNow,[]).status!=='ready')throw Error('Non-live status text cannot prove kickoff');
}
const explicitFalse={...fridayPublished,gameState:[{...fridayPublished.gameState[0],started:false}]};
if(home.strategySnapshot(fridayDraft,explicitFalse,fridayNow,[]).status!=='ready')throw Error('Structured kickoff flag should take precedence over the legacy text fallback');
const fridayConfirmed={...fridayDraft,confirmedLockedPicks:[{season:2026,week:12,away:'DEN',home:'PIT',pick:'PIT',weight:9}]};
const fridayOutdated=home.strategySnapshot(fridayConfirmed,fridayPublished,fridayNow,[]);
if(!fridayOutdated.kickoffChanged||home.strategyAdvice(fridayOutdated))throw Error('Standings-confirmed lock still requires rerunning pre-kickoff cards');

newLock.confirmedLockedPicks=[{season:2026,week:3,away:'JAX',home:'HOU',pick:'HOU',weight:9}];
const preKickoff=home.strategySnapshot(newLock,publish,now,startedEvidence);
if(preKickoff.status!=='stale'||!preKickoff.kickoffChanged||home.strategyAdvice(preKickoff)!==null)throw Error('A simulation predating kickoff cannot be a current recommendation even if it matched the locked pick');
newLock.games[0].locked=true;
if(home.strategySnapshot(newLock,publish,now,startedEvidence).status!=='ready')throw Error('Home did not retain rebuilt strategies with the confirmed lock');
newLock.games[0].locked=false;
newLock.confirmedLockedPicks=[];
newLock.confidenceStatus='submitted';
newLock.optimization.currentSource='submitted';
if(home.strategySnapshot(newLock,publish,now,startedEvidence).status!=='stale')throw Error('A genuinely submitted local locked pick should be retained, with a rebuild still required');
newLock.applied=true;
if(home.strategySnapshot(newLock,publish,now,startedEvidence).status!=='locked-conflict')throw Error('An applied IQ card masqueraded as a CBS submission');
if(home.strategySnapshot({...state,cbsUpdatedAt:'2026-09-25T12:00:00Z'},publish,now).status!=='stale')throw Error('Do not recommend from a recent simulation that used stale CBS inputs');
const tradeoff=home.strategyRecommendation({currentEval:{top2:.091,win:.055,bottomHalf:.45,avg:102},cards:[
  {key:'aggressive',label:'Aggressive',eval:{top2:.095,win:.06,bottomHalf:.45,avg:101.5}},
  {key:'maxUpside',label:'Max Upside',eval:{top2:.096,win:.061,bottomHalf:.47,avg:101.3}}
]});
if(tradeoff?.choice?.key!=='aggressive'||!tradeoff.reason.includes('only 0.1 more'))throw new Error('Home did not identify the materially better risk/upside tradeoff');
const dual=home.dualGoalRecommendation({cards:[
  {key:'safest',label:'Safest',eval:{top2:.03,win:.01,bottomHalf:.30,avg:90}},
  {key:'balanced',label:'Balanced',eval:{top2:.08,win:.04,bottomHalf:.33,avg:89}},
  {key:'aggressive',label:'Aggressive',eval:{top2:.12,win:.07,bottomHalf:.38,avg:87}},
  {key:'maxUpside',label:'Max Upside',eval:{top2:.14,win:.09,bottomHalf:.45,avg:82}}
]});
if(dual?.choice?.key!=='balanced'||dual?.max?.key!=='maxUpside')throw new Error('Home did not choose the season + weekly-money posture from the strategy frontier');
const seasonAware=home.seasonAwareRecommendation({week:9,cards:[
  {key:'safest',label:'Safest',eval:{top2:.03,win:.01,bottomHalf:.30,avg:90}},
  {key:'balanced',label:'Balanced',eval:{top2:.08,win:.04,bottomHalf:.33,avg:89}},
  {key:'aggressive',label:'Aggressive',eval:{top2:.12,win:.07,bottomHalf:.37,avg:87.8}},
  {key:'maxUpside',label:'Max Upside',eval:{top2:.14,win:.09,bottomHalf:.46,avg:82}}
]},{rank:3,pointsBehindLeader:12,pointsAheadOfNext:7},9);
if(!seasonAware?.seasonAware||seasonAware.choice.key!=='aggressive'||!seasonAware.reason.includes('Overall #3'))throw new Error('Home did not adapt recommendation to live season position');
const nodes=Object.fromEntries(['week','status','strategies','leftDecisionLabel','rightDecisionLabel','currentOdds','currentDetail','bestStrategy','bestOdds','modelRead'].map(id=>[id,{textContent:'',innerHTML:''}]));
nodes.decision={classList:{add:x=>nodes.decision.shown=x==='show',remove:()=>nodes.decision.shown=false}};
context.localStorage={getItem:()=>JSON.stringify(state)};
context.fetch=async()=>({ok:true,json:async()=>({season:2026,week:3})});
context.document={getElementById:id=>nodes[id]};
vm.runInContext('bootHome()',context).then(async()=>{
  if(nodes.week.textContent!=='Week 3'||(nodes.strategies.innerHTML.match(/View picks/g)||[]).length!==4)throw new Error('Home does not present four usable complete-card links');
  if(!nodes.decision.shown||!nodes.currentOdds.textContent||nodes.currentOdds.textContent.includes('%')||!nodes.bestStrategy.textContent)throw new Error('Home does not show model-based season/weekly recommendation');
  if(!html.includes('href="./apps/pickem/?action=refresh-simulate"')||!html.includes('href="./legacy-home.html"')||!html.includes('href="./apps/pickem/?details=1"'))throw new Error('Home lost simulation action, focused data details, or paused fantasy access');
  context.fetch=async()=>({ok:true,json:async()=>({...publish,exportedAt:'2026-09-27T12:10:00Z'})});
  await vm.runInContext('bootHome()',context);
  if(nodes.decision.shown||!nodes.strategies.innerHTML.includes('OLD SIMULATION')||nodes.strategies.innerHTML.includes('RECOMMENDED')||nodes.strategies.innerHTML.includes('View picks'))throw Error('Stale Home must not promote or expose last-good picks as actionable');
  context.localStorage={getItem:()=>JSON.stringify(newLock)};
  context.fetch=async url=>({ok:true,json:async()=>url.includes('site.api.espn.com')?startedRaw:publish});
  await vm.runInContext('bootHome()',context);
  if(nodes.decision.shown||!nodes.strategies.innerHTML.includes('Verify locked picks')||nodes.strategies.innerHTML.includes('View picks'))throw Error('Home must block newly locked conflicts from the live scoreboard');
  context.Date=class extends Date{static now(){return fridayNow}};
  context.localStorage={getItem:()=>JSON.stringify(fridayDraft)};
  context.fetch=async url=>{if(url.includes('site.api.espn.com'))throw Error('Scoreboard unavailable');return{ok:true,json:async()=>fridayPublished}};
  await vm.runInContext('bootHome()',context);
  if(nodes.week.textContent!=='Week 12'||nodes.decision.shown||!nodes.strategies.innerHTML.includes('Verify locked picks')||nodes.strategies.innerHTML.includes('View picks'))throw Error('Phone Home exposed pre-kickoff advice from a fresh draft during scoreboard outage');
  console.log('CBS home regression passed: four strategies, freshness, and live kickoff locks.');
}).catch(e=>{console.error(e);process.exitCode=1});

const screenshotAdvice=home.strategyAdvice({cards:[
{key:'safest',label:'Safest',eval:{top2:.044,win:.016,avg:89,bottomHalf:.27}},
{key:'balanced',label:'Balanced',eval:{top2:.103,win:.054,avg:88.8,bottomHalf:.35}},
{key:'aggressive',label:'Aggressive',eval:{top2:.133,win:.085,avg:87.5,bottomHalf:.43}},
{key:'maxUpside',label:'Max Upside',eval:{top2:.132,win:.095,avg:83.7,bottomHalf:.55}}
]});
if(screenshotAdvice.choice.key!=='aggressive')throw Error('Weekly volatility must not veto affordable weekly-money upside');
if(!screenshotAdvice.paragraphs.join(' ').includes('1.3 more expected points')||!screenshotAdvice.paragraphs.join(' ').includes('no better Top-2 probability'))throw Error('Missing quantified season/weekly tradeoff');

// November 22: the old weekly bottom-half cap discarded all three alternatives,
// recommending 0.2% Top 2 despite Aggressive costing only 0.7 expected points.
const november22={cards:[
{key:'safest',label:'Safest',eval:{top2:.002,win:.0004,avg:73.7,bottomHalf:.08}},
{key:'balanced',label:'Balanced',eval:{top2:.037,win:.013,avg:73.5,bottomHalf:.22}},
{key:'aggressive',label:'Aggressive',eval:{top2:.113,win:.061,avg:73,bottomHalf:.34}},
{key:'maxUpside',label:'Max Upside',eval:{top2:.136,win:.092,avg:71.4,bottomHalf:.44}}
]};
const originalCards=JSON.stringify(november22.cards);
const weeklyMoney=home.strategyAdvice(november22);
if(weeklyMoney.choice.key!=='aggressive'||weeklyMoney.max.key!=='maxUpside')throw Error('November 22 recommendation failed to retain a weekly-money path');
if(!weeklyMoney.summary.includes('+11.1 percentage points')||!weeklyMoney.summary.includes('0.7 fewer expected points')||!weeklyMoney.summary.includes('8% → 34%'))throw Error('Recommendation must quantify weekly upside, scoring cost, and downside');
if(JSON.stringify(november22.cards)!==originalCards)throw Error('Recommendation must not mutate the four strategy outputs');
const moreVolatile={cards:november22.cards.map(c=>({...c,eval:{...c.eval,bottomHalf:c.key==='aggressive'?.60:c.eval.bottomHalf}}))};
if(home.strategyAdvice(moreVolatile).choice.key!=='aggressive')throw Error('Weekly bottom-half risk became a hidden season-risk veto');
const expensive={cards:november22.cards.map(c=>({...c,eval:{...c.eval,avg:c.key==='aggressive'?70:c.eval.avg}}))};
if(home.strategyAdvice(expensive).choice.key!=='balanced')throw Error('Recommendation lost its expected-points budget');
const tied={cards:november22.cards.map(c=>({...c,eval:{...c.eval,top2:.10}}))};
if(home.strategyAdvice(tied).choice.key!=='safest')throw Error('Equal weekly-money chances should retain expected scoring');
const safeOnly=home.strategyAdvice({cards:[november22.cards[0],november22.cards[3]]});
if(safeOnly.choice.key!=='safest'||!safeOnly.summary.includes('13.6% Top 2 for 2.3 fewer expected points'))throw Error('A scoring-budget exclusion must disclose the weekly opportunity being passed up');
if(html.includes('the other cards do not offer enough weekly upside'))throw Error('Home must not misrepresent excluded weekly-money upside');

if(!html.includes('<details class="panel drilldown">')||html.includes('<h2>Get the latest card</h2>'))throw Error('Home must keep analysis collapsed and refresh compact');

const freshRunOldCbs={cbsUpdatedAt:'2026-11-11T12:56:00Z',marketUpdatedAt:'2026-11-12T17:57:00Z'};
if(!home.inputAgeWarning(freshRunOldCbs,Date.parse('2026-11-12T18:00:00Z')).includes('29h old'))throw Error('Fresh simulation must disclose older CBS input');
if(home.inputAgeWarning({...freshRunOldCbs,cbsUpdatedAt:'2026-11-12T17:56:00Z'},Date.parse('2026-11-12T18:00:00Z')))throw Error('Fresh inputs should not warn');
