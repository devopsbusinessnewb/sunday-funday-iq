const assert=require('assert');
const engine=require('../apps/guillotine/roster-engine.js');

const league={roster_positions:['QB','RB','RB','WR','WR','TE','FLEX','FLEX','BN']};

// Availability must never be treated as proof that a player is usable.
{
  const exempt=engine.playerEligibility({name:'Example',team:'GB',eligibility:'unverified',status:'Commissioner Exempt'},{week:5,requireVerified:true});
  assert.equal(exempt.state,'BLOCKED');
  assert(exempt.reasons.includes('STATUS_BLOCKED'));

  const unknown=engine.playerEligibility({name:'Unknown',team:'LAR',eligibility:'UNVERIFIED'},{week:5,requireVerified:true});
  assert.equal(unknown.state,'UNCERTAIN');
  assert.equal(unknown.usable,false);

  const verified=engine.playerEligibility({name:'Verified',team:'LAR',eligibility:'VERIFIED'},{week:5,requireVerified:true});
  assert.equal(verified.state,'USABLE');
  assert.equal(verified.usable,true);
}

// Current-week byes are hard blocks for an immediate survival solution.
{
  const bye=engine.playerEligibility({name:'QB',team:'KC',eligibility:'VERIFIED',bye:5},{week:5,requireVerified:true});
  assert.equal(bye.state,'BLOCKED');
  assert(bye.reasons.includes('BYE'));
}

// A claim must be evaluated as a whole-roster construction, not as an isolated player add.
{
  const roster=[
    {id:'qb',position:'QB',bye:5},
    {id:'rb1',position:'RB',bye:13},
    {id:'rb2',position:'RB',bye:11},
    {id:'wr1',position:'WR',bye:6},
    {id:'wr2',position:'WR',bye:9},
    {id:'te',position:'TE',bye:9},
    {id:'flex1',position:'WR',bye:7},
    {id:'flex2',position:'WR',bye:8},
    {id:'bench',position:'RB',bye:13}
  ];
  const target={id:'brown',position:'RB',bye:6,team:'CIN',eligibility:'VERIFIED'};
  const impact=engine.claimImpact({players:roster,target,dropId:'flex2',league,currentWeek:5,endWeek:7,requireVerified:true});
  assert.equal(impact.createsNewHole,true);
  assert(impact.newHoleWeeks.includes(6));
}

// Replacing a bye-week QB with a different-bye QB can resolve an existing lineup hole without creating a new one.
{
  const roster=[
    {id:'mahomes',position:'QB',bye:5},
    {id:'rb1',position:'RB',bye:13},
    {id:'rb2',position:'RB',bye:11},
    {id:'wr1',position:'WR',bye:6},
    {id:'wr2',position:'WR',bye:9},
    {id:'te',position:'TE',bye:9},
    {id:'flex1',position:'WR',bye:7},
    {id:'flex2',position:'WR',bye:8},
    {id:'bench',position:'RB',bye:13}
  ];
  const stafford={id:'stafford',position:'QB',bye:8,team:'LAR',eligibility:'VERIFIED'};
  const impact=engine.claimImpact({players:roster,target:stafford,dropId:'mahomes',league,currentWeek:5,endWeek:7,requireVerified:true});
  assert.equal(impact.current.feasible,true);
  assert.equal(impact.resolvesHole,true);
  assert(impact.resolvedHoleWeeks.includes(5));
  assert.equal(impact.createsNewHole,false);
}

// Same-drop claims must be grouped so the UI/optimizer understands they are mutually exclusive.
{
  const groups=engine.groupClaimsByDrop([
    {target:'Stafford',dropId:'Mahomes'},
    {target:'Brissett',dropId:'Mahomes'},
    {target:'Evans',dropId:'Diggs'}
  ]);
  assert.equal(groups.length,2);
  assert.equal(groups.find(g=>g.dropId==='Mahomes').claims.length,2);
}

console.log('Guillotine roster engine regression suite passed');