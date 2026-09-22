(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SFIQGuillotineCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function seeded(seed=20260921){
    return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
  }
  function normal(rnd){
    let u=0,v=0;while(!u)u=rnd();while(!v)v=rnd();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }
  function rosterSlots(league){
    const slots=Array.isArray(league?.roster_positions)?league.roster_positions:[];
    const counts={};for(const s of slots)counts[s]=(counts[s]||0)+1;
    return {slots,counts,bench:counts.BN||0,starters:slots.filter(s=>s!=='BN').length};
  }
  function leagueContext(league,rosters,startFaab=1000){
    const active=(rosters||[]).filter(r=>Array.isArray(r.players)&&r.players.length);
    const slots=rosterSlots(league);
    return {
      leagueId:String(league?.league_id||''),
      teamsConfigured:Number(league?.total_rosters||rosters?.length||0),
      teamsAlive:active.length,
      eliminated:Math.max(0,Number(league?.total_rosters||rosters?.length||0)-active.length),
      startingFaab:Number(startFaab||1000),
      rosterSlots:slots,
      scoring:league?.scoring_settings||{},
      waiverType:league?.settings?.waiver_type,
      waiverBudget:league?.settings?.waiver_budget
    };
  }
  function rosteredSet(rosters){
    const s=new Set();for(const r of rosters||[])for(const id of r.players||[])s.add(String(id));return s;
  }
  function isAvailable(playerId,rosters){return !rosteredSet(rosters).has(String(playerId))}
  function availableIds(players,rosters){
    const used=rosteredSet(rosters);return Object.keys(players||{}).filter(id=>!used.has(String(id)));
  }
  function gameFractionRemaining(game){
    if(!game)return 1;
    if(game.state==='post'||game.completed)return 0;
    if(game.state==='pre'||game.started===false)return 1;
    if(game.state!=='in')return 1;
    const q=Number(game.period||0),clock=String(game.clock||'');
    const m=clock.match(/(\d+):(\d+)/);const secs=m?Number(m[1])*60+Number(m[2]):0;
    if(q>=1&&q<=4)return clamp(((4-q)*900+secs)/3600,0,1);
    // Overtime is highly uncertain but very little regulation projection remains.
    if(q>=5)return .08;
    return .5;
  }
  function playerFinalMean({live=0,projection=0,game=null,hasLive=false}){
    const l=Number(live||0),p=Math.max(0,Number(projection||0));
    const rem=gameFractionRemaining(game);
    if(rem===0)return l;
    if(rem===1&&!hasLive)return p;
    if(rem===1&&hasLive&&l>0)return Math.max(l,p);
    return l+p*rem;
  }
  function playerSigma({projection=0,game=null,position='' }){
    const p=Math.max(0,Number(projection||0)),rem=gameFractionRemaining(game);
    if(rem<=0)return 0;
    const cv=position==='QB'?.30:position==='TE'?.48:.42;
    return Math.max(1.5,p*cv*Math.sqrt(rem));
  }
  function teamDistribution({current=0,players=[]}){
    let mean=Number(current||0),variance=0;
    for(const p of players){
      const live=Number(p.live||0);
      const final=playerFinalMean(p);
      mean+=Math.max(0,final-live);
      const s=playerSigma(p);variance+=s*s;
    }
    return {mean,sigma:Math.sqrt(variance)};
  }
  function survivalSimulation(teams,iters=12000,seed=20260921){
    if(!Array.isArray(teams)||teams.length<2)return {};
    const rnd=seeded(seed),lastCount=new Map(),dangerCount=new Map();
    for(const t of teams){lastCount.set(t.id,0);dangerCount.set(t.id,0)}
    for(let k=0;k<iters;k++){
      const rows=teams.map(t=>({id:t.id,score:Number(t.mean||0)+normal(rnd)*Math.max(.01,Number(t.sigma||0))}))
        .sort((a,b)=>a.score-b.score);
      lastCount.set(rows[0].id,lastCount.get(rows[0].id)+1);
      const n=Math.min(3,rows.length);for(let i=0;i<n;i++)dangerCount.set(rows[i].id,dangerCount.get(rows[i].id)+1);
    }
    const out={};for(const t of teams)out[t.id]={
      chopProbability:lastCount.get(t.id)/iters,
      survivalProbability:1-lastCount.get(t.id)/iters,
      dangerProbability:dangerCount.get(t.id)/iters
    };return out;
  }
  function posture({chopProbability=0,dangerProbability=0,cushion=0}){
    if(chopProbability>=.20||dangerProbability>=.55||cushion<2)return 'SURVIVE';
    if(chopProbability>=.07||dangerProbability>=.30||cushion<8)return 'CAUTION';
    return 'PRESERVE';
  }
  function eligibleForSlot(position,slot){
    position=String(position||'').toUpperCase();slot=String(slot||'').toUpperCase();
    if(slot===position)return true;
    if(slot==='FLEX'||slot==='WRT')return ['RB','WR','TE'].includes(position);
    if(slot==='WRRB_FLEX')return ['RB','WR'].includes(position);
    if(slot==='SUPER_FLEX'||slot==='REC_FLEX')return slot==='SUPER_FLEX'?['QB','RB','WR','TE'].includes(position):['WR','TE'].includes(position);
    return false;
  }
  function marginalStarterUpgrade({target,starterPlayers=[],league}){
    if(!target)return {upgrade:0,replaces:null};
    const slots=rosterSlots(league).slots.filter(s=>s!=='BN');
    const eligible=[];
    for(let i=0;i<starterPlayers.length;i++){
      const p=starterPlayers[i];if(!p)continue;
      const slot=p.slot||slots[i]||p.position;
      if(eligibleForSlot(target.position,slot))eligible.push(p);
    }
    if(!eligible.length)return {upgrade:0,replaces:null};
    eligible.sort((a,b)=>Number(a.projection||0)-Number(b.projection||0));
    const repl=eligible[0],upgrade=Number(target.projection||0)-Number(repl.projection||0);
    return {upgrade,replaces:repl,eligible:eligible.length};
  }
  function compareLineupOptions({teams,mineId,options,iters=10000,seed=20260921}){
    const out=[];
    for(let j=0;j<(options||[]).length;j++){
      const option=options[j],variant=(teams||[]).map(t=>String(t.id)===String(mineId)?{...t,mean:Number(option.mean),sigma:Number(option.sigma)}:{...t});
      const risk=survivalSimulation(variant,iters,seed+j*997)[String(mineId)]||{};
      out.push({...option,...risk});
    }
    return out.sort((a,b)=>(a.chopProbability??1)-(b.chopProbability??1)||(b.survivalProbability??0)-(a.survivalProbability??0));
  }
  function bidGuidance({faabRemaining=1000,startFaab=1000,teamsAlive=18,startingTeams=18,
                        chopProbability=0,marginalUpgrade=0,elite=false,scarcity=.5,replacementDepth=.5,
                        observedEliteClear=null}){
    const budget=Math.max(0,Number(faabRemaining||0)),start=Math.max(1,Number(startFaab||1000));
    const stage=1-clamp((Number(teamsAlive||1)-1)/Math.max(1,Number(startingTeams||18)-1),0,1);
    const urgency=clamp(Number(chopProbability||0)*2.2,0,.65);
    const upgrade=clamp(Number(marginalUpgrade||0)/18,0,.55);
    const scarce=clamp(Number(scarcity||0),0,1),depth=clamp(Number(replacementDepth||0),0,1);
    // Early strong teams preserve FAAB; urgency, true starter improvement, and late stage justify spend.
    let pct=.01+urgency*.32+upgrade*.24+stage*.14+scarce*.06-depth*.04;
    if(elite)pct+=.08;
    if(elite&&Number.isFinite(observedEliteClear))pct=Math.min(pct,Number(observedEliteClear)/start*.78);
    pct=clamp(pct,.005,elite?.48:.28);
    const target=Math.round(Math.min(budget,start*pct));
    return {
      target,
      low:Math.max(0,Math.round(target*.78)),
      high:Math.min(budget,Math.round(target*1.12)),
      hardCeiling:Math.min(budget,Math.round(target*1.28)),
      budgetPct:target/start,
      stage
    };
  }
  function recommendationAudit({available=true,alreadyRostered=false,marginalUpgrade=0,posture='PRESERVE',
                                createsHole=false,stale=false}){
    const reasons=[];
    if(!available||alreadyRostered)reasons.push('UNAVAILABLE');
    if(createsHole)reasons.push('CREATES_ROSTER_HOLE');
    if(stale)reasons.push('STALE_INPUTS');
    const threshold=posture==='SURVIVE'?.5:posture==='CAUTION'?1.5:2.5;
    if(Number(marginalUpgrade||0)<threshold)reasons.push('IMMATERIAL_UPGRADE');
    return {valid:reasons.length===0,reasons};
  }
  return {clamp,rosterSlots,leagueContext,rosteredSet,isAvailable,availableIds,gameFractionRemaining,
    playerFinalMean,playerSigma,teamDistribution,survivalSimulation,posture,eligibleForSlot,
    marginalStarterUpgrade,compareLineupOptions,bidGuidance,recommendationAudit};
});
