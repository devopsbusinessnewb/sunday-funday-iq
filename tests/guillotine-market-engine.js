const assert=require('assert');
const m=require('../apps/guillotine/market-engine.js');

const tx=[
  {type:'waiver',status:'complete',faab_bid:75,roster_ids:[1],adds:[{id:'rb1',position:'RB'}]},
  {type:'waiver',status:'complete',faab_bid:25,roster_ids:[2],adds:[{id:'wr1',position:'WR'}]},
  {type:'waiver',status:'complete',faab_bid:16,roster_ids:[3],adds:[{id:'wr2',position:'WR'}]},
  {type:'waiver',status:'complete',faab_bid:11,roster_ids:[1],adds:[{id:'te1',position:'TE'}]},
  {type:'waiver',status:'complete',faab_bid:7,roster_ids:[4],adds:[{id:'rb2',position:'RB'}]},
  {type:'waiver',status:'failed',faab_bid:125,roster_ids:[2],adds:[{id:'wr3',position:'WR'}]},
  {type:'drop',status:'complete',faab_bid:null,roster_ids:[5],drops:[{id:'x',position:'RB'}]}
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
  const band=m.bidBandFromComparables({transactions:tx,position:'WR',faabRemaining:978,fallback:10,urgency:.5});
  assert.equal(band.sampleSize,2);
  assert(band.target>=16&&band.target<=25);
  assert(band.high>=band.target);
}

{
  const sparse=m.bidBandFromComparables({transactions:tx,position:'QB',faabRemaining:100,fallback:20,urgency:.5});
  assert.equal(sparse.confidence,'LOW');
  assert.equal(sparse.target,30);
}

console.log('Guillotine market engine regression suite passed');