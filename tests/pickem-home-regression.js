const fs=require('fs');
const vm=require('vm');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const js=html.split('<script>',2)[1]?.split('</script>',1)[0];
if(!js)throw new Error('Home has no executable script');
const context={console,globalThis:null,localStorage:{getItem:()=>null}};context.globalThis=context;context.__SFIQ_TESTING__=true;
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
nodes.decision={classList:{add:x=>nodes.decision.shown=x==='show'}};
context.localStorage={getItem:()=>JSON.stringify(state)};
context.fetch=async()=>({ok:true,json:async()=>({season:2026,week:3})});
context.document={getElementById:id=>nodes[id]};
vm.runInContext('bootHome()',context).then(()=>{
  if(nodes.week.textContent!=='Week 3'||(nodes.strategies.innerHTML.match(/View picks/g)||[]).length!==4)throw new Error('Home does not present four usable complete-card links');
  if(!nodes.decision.shown||!nodes.currentOdds.textContent||nodes.currentOdds.textContent.includes('%')||!nodes.bestStrategy.textContent)throw new Error('Home does not show model-based season/weekly recommendation');
  if(!html.includes('href="./apps/pickem/?action=refresh-simulate"')||!html.includes('href="./legacy-home.html"')||!html.includes('href="./apps/pickem/?details=1"'))throw new Error('Home lost simulation action, focused data details, or paused fantasy access');
  console.log('CBS home regression passed: four strategies, deep links, week and input freshness.');
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
