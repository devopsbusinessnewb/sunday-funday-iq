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

// Sparse markets should no longer double a fallback just because urgency is high.
{
  const sparse=m.bidBandFromComparables({transactions:tx,position:'QB',faabRemaining:100,fallback:20,urgency:.5});
  assert.equal(sparse.confidence,'LOW');
  assert.equal(sparse.target,22);
  assert.equal(sparse.basis,'CLEARING_THRESHOLD_PLUS_LIVE_DEMAND');
}

// Real Week 5 pattern: winner bid should NOT become the learned market price.
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

// The pricing engine must learn required-to-win prices, not historical winning bids.
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

// Live roster context matters: multiple rivals with a QB bye should raise competition modestly.
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

// Injuries and uncertain starters should contribute to demand pressure.
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

// A chop releasing several viable players at the same position should spread demand and lower the bid forecast.
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

// Live demand should adjust, not replace, the historical clearing-price anchor.
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

console.log('Guillotine market engine regression suite passed');