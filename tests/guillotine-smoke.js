const fs=require('fs');
const assert=require('assert');
const vm=require('vm');
const html=fs.readFileSync('apps/guillotine/index.html','utf8');
assert(html.includes('Build 2.13 · survival engine'));
assert(html.includes('<script src="./core.js"></script>'));
assert(html.includes('CORE.survivalSimulation'));
assert(html.includes('CORE.isAvailable'));
assert(html.includes('nextProjectionPoints'));
assert(html.includes('sfiqGuillotineHistoryV1'));
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
assert(scripts.length>=1,'expected inline application script');
for(const js of scripts)new Function(js);
// Exercise the actual application projection entry points for both weeks.
const projectionFunctions=scripts.join('\n').match(/function pointsFromProjectionMap\([\s\S]*?(?=function normalizeEspnTeam)/);
assert(projectionFunctions,'expected inline projection helpers');
const state={
  league:{scoring_settings:{rec:0.5}},
  projections:{kyren:{stats:{pts_ppr:14.74,pts_half_ppr:13.27,pts_std:11.8}},zero:{stats:{pts_ppr:3,pts_half_ppr:0}},fallback:{stats:{pts_ppr:8}},generic:{stats:{fantasy_points:6}}},
  nextProjections:{kyren:{pts_ppr:15.1,pts_half_ppr:13.5}}
};
const projectionContext=vm.createContext({state});
vm.runInContext(projectionFunctions[0],projectionContext);
assert.equal(vm.runInContext('projectionPoints("kyren")',projectionContext),13.27);
assert.equal(vm.runInContext('nextProjectionPoints("kyren")',projectionContext),13.5);
assert.equal(vm.runInContext('projectionPoints("zero")',projectionContext),0);
assert.equal(vm.runInContext('projectionPoints("fallback")',projectionContext),8);
assert.equal(vm.runInContext('projectionPoints("generic")',projectionContext),6);
assert.equal(vm.runInContext('projectionPoints("missing")',projectionContext),0);
state.league.scoring_settings.rec=1;
assert.equal(vm.runInContext('projectionPoints("kyren")',projectionContext),14.74);
state.league.scoring_settings.rec=0;
assert.equal(vm.runInContext('projectionPoints("kyren")',projectionContext),11.8);
state.league.scoring_settings.rec=0.75;
assert.equal(vm.runInContext('projectionPoints("kyren")',projectionContext),14.74);
console.log('Guillotine production smoke test passed');
