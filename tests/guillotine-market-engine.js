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
  assert.equal(sparse.basis,'CLEARING_THRESHOLD');
}

// Real Week 5 pattern: winner bid should NOT become the learned market price.
const real=[
  // Stafford: $37 winner, then $10/$2/$1. Market-clearing threshold was about $11, not $37.
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:37,roster_ids:[18],adds:[{id:'stafford',position:'QB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:10,roster_ids:[12],adds:[{id:'stafford',position:'QB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:2,roster_ids:[3],adds:[{id:'stafford',position:'QB'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:1,roster_ids:[4],adds:[{id:'stafford',position:'QB'}]},
  // Evans: $47 winner, then $24/$11. Threshold about $25.
  {type:'waiver',status:'complete',timestamp:batch,faab_bid:47,roster_ids:[18],adds:[{id:'evans',position:'WR'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:24,roster_ids:[8],adds:[{id:'evans',position:'WR'}]},
  {type:'waiver',status:'failed',timestamp:batch,faab_bid:11,roster_ids:[17],adds:[{id:'evans',position:'WR'}]},
  // Chase Brown: true expensive market.
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

console.log('Guillotine market engine regression suite passed');