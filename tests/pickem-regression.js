const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'apps/pickem/index.html'),'utf8');
if(!html.includes('Build 1.3.0')) throw new Error('Expected Pickem Build 1.3.0');
if(html.includes('EMBEDDED_CBS_SCAN')) throw new Error('CBS live scan must not be embedded in app code');
if(!html.includes("LIVE_CBS_URL='../../data/live/cbs-pickem.json'")) throw new Error('Live CBS data URL missing');
const js=html.split('<script>',2)[1].split('</script>',1)[0];
const ctx={console,globalThis:null,setTimeout,clearTimeout,fetch:async()=>({ok:false})};ctx.globalThis=ctx;ctx.__SFIQ_TESTING__=true;
vm.createContext(ctx);vm.runInContext(js,ctx,{filename:'pickem-index.js'});
const t=ctx.SFIQ_TEST,clone=x=>JSON.parse(JSON.stringify(x));
const pre=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/cbs-pregame.json'),'utf8'));
const post=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/cbs-postgame.json'),'utf8'));
const expectedPre={picks:['SEA','LAR','CIN','BUF','BAL','CAR','DET','JAX','PIT','TEN','GB','PHI','LV','LAC','DAL','KC'],weights:[1,15,14,13,11,10,16,9,7,6,5,12,3,8,4,2]};
const expectedPost={picks:['SEA','SF','CIN','HOU','BAL','CHI','DET','JAX','PIT','NYJ','GB','PHI','LV','LAC','DAL','KC'],weights:[9,1,13,7,14,8,16,12,11,2,6,15,4,10,5,3]};
function assertCard(label,actual,expected){if(actual.pickCount!==16||actual.weightCount!==16)throw new Error(`${label}: ${actual.pickCount}/${actual.weightCount}`);if(JSON.stringify(actual.picks)!==JSON.stringify(expected.picks))throw new Error(`${label}: picks mismatch`);if(JSON.stringify(actual.weights)!==JSON.stringify(expected.weights))throw new Error(`${label}: confidence mismatch`);if(new Set(actual.weights).size!==16)throw new Error(`${label}: confidence not unique`)}
assertCard('pregame',t.extractStructuredCard(pre,clone(t.SEED)),expectedPre);
const postGames=clone(t.SEED);for(const g of postGames){if(g.away==='NE'&&g.home==='SEA')Object.assign(g,{pick:'SEA',weight:9,locked:true,completed:true,winner:1,statusText:'Final 10-13'});if(g.away==='SF'&&g.home==='LAR')Object.assign(g,{pick:'SF',weight:1,locked:true,completed:true,winner:0,statusText:'Final 27-7'})}
assertCard('postgame',t.extractStructuredCard(post,postGames),expectedPost);
const fm=t.extractFieldModel(post,postGames);if(!fm||fm.observedEntries!==92)throw new Error(`field model expected 92, got ${fm?.observedEntries}`);
const live=JSON.parse(fs.readFileSync(path.join(root,'data/live/cbs-pickem.json'),'utf8'));assertCard('published live CBS',t.extractStructuredCard(live,postGames),expectedPost);
console.log('Pickem regression suite passed: pregame 16/16, postgame 16/16, published live 16/16, field model 92.');

