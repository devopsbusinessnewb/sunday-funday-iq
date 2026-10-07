(function(root,factory){
  const core=(typeof module==='object'&&module.exports)?require('./core.js'):(root&&root.SFIQGuillotineCore);
  const api=factory(core);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SFIQGuillotineRosterEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(core){
  'use strict';
  if(!core)throw new Error('SFIQ Guillotine core is required');

  const BLOCKED_WORDS=['out','injured reserve','ir','pup','suspended','suspension','exempt','commissioner exempt','nfi','reserve'];
  const UNCERTAIN_WORDS=['questionable','doubtful','concussion','limited','did not practice','dnp','day-to-day'];
  const clean=x=>String(x==null?'':x).trim().toLowerCase();

  function playerEligibility(player,{week=null,requireVerified=false}={}){
    const reasons=[];
    const eligibility=clean(player?.eligibility);
    const statusText=[player?.status,player?.injuryStatus,player?.injury_status,player?.administrativeStatus].map(clean).filter(Boolean).join(' | ');
    const bye=Number(player?.bye??player?.byeWeek??0);

    if(week!=null&&bye&&bye===Number(week))reasons.push('BYE');
    if(player?.team===null||player?.team==='')reasons.push('NO_NFL_TEAM');
    if(player?.active===false)reasons.push('INACTIVE');
    if(eligibility==='blocked')reasons.push('STATUS_BLOCKED');
    if(BLOCKED_WORDS.some(w=>statusText.includes(w)))reasons.push('STATUS_BLOCKED');

    const blocked=[...new Set(reasons)];
    if(blocked.length)return {state:'BLOCKED',usable:false,verified:eligibility==='verified',reasons:blocked};

    const uncertain=[];
    if(eligibility==='unverified'||eligibility==='uncertain'||!eligibility)uncertain.push('STATUS_UNVERIFIED');
    if(UNCERTAIN_WORDS.some(w=>statusText.includes(w)))uncertain.push('INJURY_UNCERTAIN');
    if(requireVerified&&eligibility!=='verified')uncertain.push('VERIFICATION_REQUIRED');
    const unique=[...new Set(uncertain)];
    if(unique.length)return {state:'UNCERTAIN',usable:!requireVerified,verified:false,reasons:unique};

    return {state:'USABLE',usable:true,verified:true,reasons:[]};
  }

  function cloneRoster(players){return (players||[]).map(p=>({...p}));}

  function applyClaim({players=[],target,dropId=null}){
    const next=cloneRoster(players);
    let removed=null;
    if(dropId!=null){
      const idx=next.findIndex(p=>String(p.id)===String(dropId));
      if(idx>=0)removed=next.splice(idx,1)[0];
    }
    if(target)next.push({...target});
    return {players:next,removed};
  }

  function claimImpact({players=[],target,dropId=null,league,currentWeek=1,endWeek=14,requireVerified=false}){
    const eligibility=playerEligibility(target,{week:currentWeek,requireVerified});
    const before=core.futureByeRisk({players,league,currentWeek,endWeek});
    const applied=applyClaim({players,target,dropId});
    const after=core.futureByeRisk({players:applied.players,league,currentWeek,endWeek});
    const beforeWeeks=new Set((before.weeks||[]).map(x=>Number(x.week)));
    const afterWeeks=new Set((after.weeks||[]).map(x=>Number(x.week)));
    const newHoleWeeks=[...afterWeeks].filter(w=>!beforeWeeks.has(w)).sort((a,b)=>a-b);
    const resolvedHoleWeeks=[...beforeWeeks].filter(w=>!afterWeeks.has(w)).sort((a,b)=>a-b);
    const current=core.lineupFeasibility({players:applied.players,league,week:currentWeek});
    return {
      eligibility,
      removed:applied.removed,
      roster:applied.players,
      before,
      after,
      current,
      createsNewHole:newHoleWeeks.length>0,
      newHoleWeeks,
      resolvesHole:resolvedHoleWeeks.length>0,
      resolvedHoleWeeks
    };
  }

  function auditClaim({players=[],target,dropId=null,league,currentWeek=1,endWeek=14,posture='PRESERVE',marginalUpgrade=0,available=true,requireVerified=false}){
    const impact=claimImpact({players,target,dropId,league,currentWeek,endWeek,requireVerified});
    const reasons=[];
    if(!available)reasons.push('UNAVAILABLE');
    if(impact.eligibility.state==='BLOCKED')reasons.push(...impact.eligibility.reasons);
    if(requireVerified&&impact.eligibility.state!=='USABLE')reasons.push('PLAYER_STATUS_UNVERIFIED');
    if(!impact.current.feasible)reasons.push('CURRENT_WEEK_LINEUP_HOLE');
    if(impact.createsNewHole)reasons.push('CREATES_FUTURE_LINEUP_HOLE');
    const base=core.recommendationAudit({available,marginalUpgrade,posture,createsHole:impact.createsNewHole,stale:false});
    reasons.push(...base.reasons.filter(r=>r!=='CREATES_ROSTER_HOLE'));
    const unique=[...new Set(reasons)];
    return {valid:unique.length===0,reasons:unique,impact};
  }

  function groupClaimsByDrop(claims=[]){
    const groups=new Map();
    for(const claim of claims){
      const key=claim.dropId==null?'__NO_DROP__':String(claim.dropId);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(claim);
    }
    return [...groups.entries()].map(([dropId,items])=>({dropId:dropId==='__NO_DROP__'?null:dropId,claims:items}));
  }

  function rankRosterClaims(claims=[]){
    return [...claims].sort((a,b)=>{
      const aBlocked=a.audit?.impact?.eligibility?.state==='BLOCKED'?1:0;
      const bBlocked=b.audit?.impact?.eligibility?.state==='BLOCKED'?1:0;
      if(aBlocked!==bBlocked)return aBlocked-bBlocked;
      const aHole=a.audit?.impact?.createsNewHole?1:0,bHole=b.audit?.impact?.createsNewHole?1:0;
      if(aHole!==bHole)return aHole-bHole;
      return Number(b.valueScore||0)-Number(a.valueScore||0);
    });
  }

  return {playerEligibility,applyClaim,claimImpact,auditClaim,groupClaimsByDrop,rankRosterClaims};
});