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
const pickemHtml=fs.readFileSync(path.join(root,'apps/pickem/index.html'),'utf8');
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
if(home.strategySnapshot({...state,marketUpdatedAt:'2026-09-27T12:05:00Z'},{season:2026,week:3},Date.parse('2026-09-27T12:30:00Z')).status!=='stale')throw new Error('New market inputs did not stale the saved simulation');
if(home.strategySnapshot(state,{season:2026,week:3,exportedAt:'2026-09-27T12:10:00Z'},Date.parse('2026-09-27T12:30:00Z')).status!=='stale')throw new Error('New published CBS picks did not stale the saved simulation');
if(home.strategySnapshot(state,{season:2026,week:3},Date.parse('2026-09-29T12:00:00Z')).status!=='stale')throw new Error('Old simulation was presented as current');
const tradeoff=home.strategyRecommendation({currentEval:{top2:.091,win:.055,bottomHalf:.45,avg:102},cards:[
  {key:'aggressive',label:'Aggressive',eval:{top2:.095,win:.06,bottomHalf:.45,avg:101.5}},
  {key:'maxUpside',label:'Max Upside',eval:{top2:.096,win:.061,bottomHalf:.47,avg:101.3}}
]});
if(tradeoff?.choice?.key!=='aggressive'||!tradeoff.reason.includes('only 0.1 more'))throw new Error('Home did not identify the materially better risk/upside tradeoff');
const nodes=Object.fromEntries(['week','status','strategies','currentOdds','currentDetail','bestStrategy','bestOdds','modelRead'].map(id=>[id,{textContent:'',innerHTML:''}]));
nodes.decision={classList:{add:x=>nodes.decision.shown=x==='show'}};
context.localStorage={getItem:()=>JSON.stringify(state)};
context.fetch=async()=>({ok:true,json:async()=>({season:2026,week:3})});
context.document={getElementById:id=>nodes[id]};
vm.runInContext('bootHome()',context).then(()=>{
  if(nodes.week.textContent!=='Week 3'||(nodes.strategies.innerHTML.match(/View complete card/g)||[]).length!==4)throw new Error('Home does not present four usable complete-card links');
  if(!nodes.decision.shown||nodes.currentOdds.textContent!=='4.1%'||!nodes.bestStrategy.textContent)throw new Error('Home does not show the current-card benchmark and best tradeoff');
  if(!html.includes('href="./apps/pickem/?action=refresh-simulate"')||!html.includes('href="./legacy-home.html"')||!html.includes('href="./apps/pickem/?details=1"'))throw new Error('Home lost simulation action, focused data details, or paused fantasy access');
  console.log('CBS home regression passed: four strategies, deep links, week and input freshness.');
}).catch(e=>{console.error(e);process.exitCode=1});
