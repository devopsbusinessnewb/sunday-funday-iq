const assert=require('assert');
const core=require('../apps/guillotine/core.js');

function approx(a,b,t=.02){assert(Math.abs(a-b)<=t,`expected ${a} ≈ ${b}`)}

// League context must come from the Sleeper league, not assumed fantasy defaults.
{
  const league={league_id:'g',total_rosters:18,roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','BN'],scoring_settings:{rec:1},settings:{waiver_budget:1000}};
  const rosters=Array.from({length:17},(_,i)=>({roster_id:i+1,players:['p'+i]}));
  const x=core.leagueContext(league,rosters,1000);
  assert.equal(x.teamsConfigured,18);assert.equal(x.teamsAlive,17);assert.equal(x.eliminated,1);
  assert.equal(x.rosterSlots.bench,1);assert.equal(x.rosterSlots.starters,8);
}

// Availability must reject every player on any surviving roster.
{
  const rosters=[{players:['mahomes','chase']},{players:['jefferson']}];
  assert.equal(core.isAvailable('mahomes',rosters),false);
  assert.equal(core.isAvailable('saquon',rosters),true);
  assert.deepEqual(core.availableIds({mahomes:{},saquon:{},jefferson:{}},rosters),['saquon']);
}

// Live-state projection: 0 points is NOT the same as "not started".
{
  assert.equal(core.gameFractionRemaining({state:'pre'}),1);
  assert.equal(core.gameFractionRemaining({state:'post',completed:true}),0);
  approx(core.gameFractionRemaining({state:'in',period:3,clock:'07:30'}),.375,.001);
  // An in-progress player with zero points gets only remaining-game expectation.
  approx(core.playerFinalMean({live:0,projection:16,game:{state:'in',period:3,clock:'07:30'},hasLive:true}),6,.01);
  // A completed zero stays zero.
  assert.equal(core.playerFinalMean({live:0,projection:16,game:{state:'post',completed:true},hasLive:true}),0);
}

// Survival model must distinguish strong/safe and endangered teams.
{
  const teams=[
    {id:'safe',mean:125,sigma:8},
    {id:'mid',mean:98,sigma:11},
    {id:'danger',mean:78,sigma:10},
    {id:'low',mean:70,sigma:8}
  ];
  const sim=core.survivalSimulation(teams,20000,7);
  assert(sim.safe.chopProbability<.01);
  assert(sim.low.chopProbability>.55);
  assert.equal(core.posture({chopProbability:sim.safe.chopProbability,dangerProbability:sim.safe.dangerProbability,cushion:25}),'PRESERVE');
  assert.equal(core.posture({chopProbability:sim.low.chopProbability,dangerProbability:sim.low.dangerProbability,cushion:-4}),'SURVIVE');
}

// Guillotine variance logic: a stronger roster should require a more material upgrade before churn.
{
  assert.equal(core.recommendationAudit({available:true,marginalUpgrade:1.2,posture:'PRESERVE'}).valid,false);
  assert.equal(core.recommendationAudit({available:true,marginalUpgrade:3.2,posture:'PRESERVE'}).valid,true);
  assert.equal(core.recommendationAudit({available:false,marginalUpgrade:8,posture:'SURVIVE'}).valid,false);
}

// Starter marginal value must respect actual eligible lineup slots.
{
  const league={roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','BN']};
  const starters=[
    {name:'QB',position:'QB',slot:'QB',projection:20},
    {name:'RB1',position:'RB',slot:'RB',projection:14},
    {name:'RB2',position:'RB',slot:'RB',projection:11},
    {name:'WR1',position:'WR',slot:'WR',projection:17},
    {name:'WR2',position:'WR',slot:'WR',projection:12},
    {name:'TE',position:'TE',slot:'TE',projection:8},
    {name:'F1',position:'RB',slot:'FLEX',projection:10},
    {name:'F2',position:'WR',slot:'FLEX',projection:9}
  ];
  const wr=core.marginalStarterUpgrade({target:{position:'WR',projection:15},starterPlayers:starters,league});
  assert.equal(wr.replaces.name,'F2');assert.equal(wr.upgrade,6);
  const qb=core.marginalStarterUpgrade({target:{position:'QB',projection:22},starterPlayers:starters,league});
  assert.equal(qb.replaces.name,'QB');assert.equal(qb.upgrade,2);
}

// FAAB economics: danger and material upgrades justify more spend; strong early teams preserve.
{
  const safe=core.bidGuidance({faabRemaining:980,startFaab:1000,teamsAlive:16,startingTeams:18,chopProbability:.01,marginalUpgrade:2,elite:false,scarcity:.4,replacementDepth:.7});
  const danger=core.bidGuidance({faabRemaining:980,startFaab:1000,teamsAlive:16,startingTeams:18,chopProbability:.25,marginalUpgrade:9,elite:true,scarcity:.8,replacementDepth:.2});
  assert(safe.target<75);
  assert(danger.target>safe.target*3);
  assert(danger.hardCeiling<=980);
}

console.log('Guillotine regression suite passed');
