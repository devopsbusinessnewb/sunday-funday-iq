const assert=require('assert');
const m=require('../apps/guillotine/market-engine.js');

const batch=1_791_389_322_055;
const tx=[
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:75,roster_ids:[1],adds:[{id:'rb1',position:'RB'}]},
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:25,roster_ids:[2],adds:[{id:'wr1',position:'WR'}]},
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:16,roster_ids:[3],adds:[{id:'wr2',position:'WR'}]},
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:11,roster_ids:[1],adds:[{id:'te1',position:'TE'}]},
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:7,roster_ids:[4],adds:[{id:'rb2',position:'RB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:125,roster_ids:[2],adds:[{id:'wr3',position:'WR'}]},
  {type:'drop',status:'complete',timestamp:batch,faab_bid:null,roster_ids:[5],drops:[{id:'x',position:'RB'}]}
];

{
  const rows=m.completedWaiverBids(tx);
  assert.equal(rows.length,5);
  assert.equal(rows.some(x=>x.bid===125),false);
}

{
  const snap=m.marketSnapshot(tx);
  assert.equal(snap.count,5);
  assert.equal(snap.totalSpent,134);
  assert.equal(snap.byPosition.RB.count,2);
  assert.equal(snap.byPosition.WR.count,2);
}

{
  const p=m.managerProfile(tx,1);
  assert.equal(p.wins,2);
  assert.equal(p.totalSpent,86);
  assert.equal(p.max,75);
}

{
  const sparse=m.bidBandFromComparables({transactions:tx,position:'QB',faabRemaining:100,fallback:20,urgency:.5});
  assert.equal(sparse.confidence,'LOW');
  assert.equal(sparse.target,22);
  assert.equal(sparse.basis,'CLEARING_THRESHOLD_PLUS_FULL_LINEUP_DEMAND');
}

const real=[
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:37,roster_ids:[18],adds:[{id:'stafford',position:'QB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:10,roster_ids:[12],adds:[{id:'stafford',position:'QB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:2,roster_ids:[3],adds:[{id:'stafford',position:'QB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:1,roster_ids:[4],adds:[{id:'stafford',position:'QB'}]},
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:47,roster_ids:[18],adds:[{id:'evans',position:'WR'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:24,roster_ids:[8],adds:[{id:'evans',position:'WR'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:11,roster_ids:[17],adds:[{id:'evans',position:'WR'}]},
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:233,roster_ids:[14],adds:[{id:'brown',position:'RB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:201,roster_ids:[16],adds:[{id:'brown',position:'RB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:195,roster_ids:[5],adds:[{id:'brown',position:'RB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:127,roster_ids:[17],adds:[{id:'brown',position:'RB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:75,roster_ids:[12],adds:[{id:'brown',position:'RB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:61,roster_ids:[10],adds:[{id:'brown',position:'RB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:41,roster_ids:[18],adds:[{id:'brown',position:'RB'}]}
];

{
  const stafford=m.playerAuction(real,'stafford');
  assert.equal(stafford.winnerBid,37);
  assert.equal(stafford.secondBid,10);
  assert.equal(stafford.minimumWinningBid,11);
  assert.equal(stafford.overpay,26);

  const evans=m.playerAuction(real,'evans');
  assert.equal(evans.minimumWinningBid,25);
  assert.equal(evans.overpay,22);

  const brown=m.playerAuction(real,'brown');
  assert.equal(brown.minimumWinningBid,202);
  assert.equal(brown.overpay,31);
}

{
  const history=[
    ...real,
    {type:'waiver',status:'complete',timestamp:batch+600000,faab_bid:1,roster_ids:[12],adds:[{id:'nix',position:'QB'}]},
    {type:'waiver',status:'complete',timestamp:batch+1200000,faab_bid:1,roster_ids:[14],adds:[{id:'brissett',position:'QB'}]}
  ];
  const qb=m.bidBandFromComparables({transactions:history,position:'QB',faabRemaining:894,fallback:15,urgency:.8,valueCeiling:40});
  assert(qb.target<20,`QB target should stay market-led, got ${qb.target}`);
  assert(qb.high<=20,`QB high should stay disciplined, got ${qb.high}`);
}

{
  const league={roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','BN']};
  const mk=(id,qbBye,faab=900)=>({rosterId:id,faabRemaining:faab,players:[
    {id:`q${id}`,position:'QB',bye:qbBye?5:10,active:true},
    {position:'RB',bye:10,active:true},{position:'RB',bye:11,active:true},{position:'RB',bye:12,active:true},
    {position:'WR',bye:7,active:true},{position:'WR',bye:8,active:true},{position:'WR',bye:9,active:true},
    {position:'TE',bye:13,active:true},{position:'WR',bye:14,active:true}
  ]});
  const rosters=[mk(18,true),mk(1,true),mk(2,true),mk(3,false),mk(4,false)];
  const ctx=m.competitionContext({rosters,position:'QB',week:5,league,myRosterId:18,releasedPlayers:[{position:'QB',active:true}],targetScarcity:.5});
  assert.equal(ctx.urgentBidders,2);
  assert(ctx.multiplier>1,'Two rival QB holes should lift expected clearing price');
}

{
  const league={roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','BN']};
  const roster={rosterId:1,players:[
    {position:'QB',active:true},{position:'RB',active:true},{position:'RB',active:true},{position:'RB',active:true},
    {position:'WR',active:true},{position:'WR',status:'questionable',active:true},{position:'WR',status:'out',active:true},
    {position:'TE',active:true},{position:'TE',active:true}
  ]};
  const p=m.rosterPositionPressure({roster,position:'WR',week:5,league});
  assert(p.pressure>0);
  assert(p.unavailableAtPos>=1);
  assert(p.uncertainAtPos>=1);
}

{
  const league={roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','BN']};
  const roster={rosterId:1,faabRemaining:900,players:[
    {position:'QB',bye:5,active:true},{position:'RB',active:true},{position:'RB',active:true},{position:'RB',active:true},
    {position:'WR',active:true},{position:'WR',active:true},{position:'WR',active:true},{position:'TE',active:true},{position:'WR',active:true}
  ]};
  const one=m.competitionContext({rosters:[roster],position:'QB',week:5,league,myRosterId:99,releasedPlayers:[{position:'QB',active:true}],targetScarcity:.2});
  const many=m.competitionContext({rosters:[roster],position:'QB',week:5,league,myRosterId:99,releasedPlayers:[{position:'QB',active:true},{position:'QB',active:true},{position:'QB',active:true},{position:'QB',active:true}],targetScarcity:.2});
  assert(many.multiplier<one.multiplier,'More viable released QBs should reduce bid pressure');
}

{
  const history=[
    ...real,
    {type:'waiver',status:'complete',timestamp:batch+600000,faab_bid:1,roster_ids:[12],adds:[{id:'nix',position:'QB'}]},
    {type:'waiver',status:'complete',timestamp:batch+1200000,faab_bid:1,roster_ids:[14],adds:[{id:'brissett',position:'QB'}]}
  ];
  const low=m.bidBandFromComparables({transactions:history,position:'QB',faabRemaining:894,fallback:15,urgency:.3,valueCeiling:40,competition:{multiplier:.9}});
  const high=m.bidBandFromComparables({transactions:history,position:'QB',faabRemaining:894,fallback:15,urgency:.3,valueCeiling:40,competition:{multiplier:1.25}});
  assert(high.target>low.target);
  assert(high.target<=25,'Demand adjustment should stay disciplined around historical clearing prices');
}

// Critical regression: an elite RB must create demand by displacing a weak FLEX even when RB1/RB2 are healthy.
{
  const league={roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','BN']};
  const roster={rosterId:7,faabRemaining:940,players:[
    {id:'qb',position:'QB',projectedPoints:18,active:true,starter:true},
    {id:'rb1',position:'RB',projectedPoints:14,active:true,starter:true},
    {id:'rb2',position:'RB',projectedPoints:12,active:true,starter:true},
    {id:'wr1',position:'WR',projectedPoints:13,active:true,starter:true},
    {id:'wr2',position:'WR',projectedPoints:11,active:true,starter:true},
    {id:'te',position:'TE',projectedPoints:8,active:true,starter:true},
    {id:'weakflex',position:'WR',projectedPoints:5,active:true,starter:true},
    {id:'flex2',position:'WR',projectedPoints:7,active:true,starter:true},
    {id:'bench',position:'WR',projectedPoints:4,active:true}
  ]};
  const barkley={id:'barkley',position:'RB',projectedPoints:16,active:true};
  const fit=m.targetRosterFit({roster,target:barkley,week:5,league});
  assert.equal(fit.targetStarts,true,'Elite RB should start through FLEX even with two healthy RB starters');
  assert(['FLEX','WRT'].includes(fit.targetSlot),'Target should enter a FLEX slot');
  assert(fit.marginalUpgrade>=9,'Target should displace weak FLEX and create meaningful upgrade');
  assert.equal(fit.displacedPlayer.id,'weakflex');

  const ctx=m.competitionContext({rosters:[roster],target:barkley,position:'RB',week:5,league,myRosterId:18,releasedPlayers:[barkley],targetScarcity:.9});
  assert.equal(ctx.starterUpgradeBidders,1,'Roster should count as a bidder because Barkley improves FLEX');
  assert(ctx.rows[0].likely,'FLEX upgrade must contribute to likely bidder status');
  assert(ctx.multiplier>1,'FLEX-driven demand should increase expected clearing price');
}

// Cross-position chop supply can relieve FLEX demand, but less than a true same-position substitute.
{
  const league={roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','BN']};
  const roster={rosterId:1,faabRemaining:900,players:[
    {position:'QB',projectedPoints:18,active:true},{position:'RB',projectedPoints:13,active:true},{position:'RB',projectedPoints:12,active:true},
    {position:'WR',projectedPoints:10,active:true},{position:'WR',projectedPoints:9,active:true},{position:'TE',projectedPoints:7,active:true},
    {position:'WR',projectedPoints:4,active:true},{position:'WR',projectedPoints:5,active:true}
  ]};
  const target={id:'elite-rb',position:'RB',projectedPoints:16,active:true};
  const same=m.competitionContext({rosters:[roster],target,position:'RB',week:5,league,myRosterId:99,releasedPlayers:[target,{id:'rb-alt',position:'RB',projectedPoints:12,active:true}],targetScarcity:.3});
  const cross=m.competitionContext({rosters:[roster],target,position:'RB',week:5,league,myRosterId:99,releasedPlayers:[target,{id:'wr-alt',position:'WR',projectedPoints:12,active:true}],targetScarcity:.3});
  assert(same.multiplier<cross.multiplier,'Same-position substitute should relieve demand more than flex-only substitute');
}

console.log('Guillotine market engine regression suite passed');