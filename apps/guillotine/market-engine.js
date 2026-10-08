(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SFIQGuillotineMarketEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const num=x=>Number.isFinite(Number(x))?Number(x):null;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const median=values=>{
    const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
    if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;
  };
  const percentile=(values,p)=>{
    const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
    if(!a.length)return null;if(a.length===1)return a[0];
    const i=(a.length-1)*Math.max(0,Math.min(1,Number(p)));
    const lo=Math.floor(i),hi=Math.ceil(i),f=i-lo;return a[lo]*(1-f)+a[hi]*f;
  };
  function txBid(tx){return num(tx?.faabBid??tx?.faab_bid??tx?.settings?.waiver_bid)}
  function txStatus(tx){return String(tx?.status||'').toLowerCase()}
  function txType(tx){return String(tx?.type||'').toLowerCase()}
  function txRosterIds(tx){return tx?.rosterIds||tx?.roster_ids||tx?.team_ids||[]}
  function txTime(tx){return Number(tx?.timestamp??tx?.status_updated??tx?.created??0)||0}
  function txAdds(tx){
    if(Array.isArray(tx?.adds))return tx.adds;
    if(Array.isArray(tx?.players_added))return tx.players_added;
    const adds=tx?.adds||{};return Object.keys(adds).map(id=>({id,rosterId:adds[id]}));
  }
  function playerId(p){return String(p?.id??p?.player_id??'')}
  function playerPosition(p){return String(p?.position||'').toUpperCase()}
  function completedWaiverBids(transactions=[]){
    return (transactions||[]).filter(tx=>{
      const bid=txBid(tx),type=txType(tx),status=txStatus(tx);
      return bid!=null&&bid>=0&&(type==='waiver'||type==='add')&&(status==='complete'||status==='completed'||status==='success');
    }).map(tx=>({...tx,bid:txBid(tx),addsNormalized:txAdds(tx)}));
  }
  function waiverAttempts(transactions=[]){
    return (transactions||[]).filter(tx=>{
      const bid=txBid(tx),type=txType(tx),status=txStatus(tx);
      return bid!=null&&bid>=0&&(type==='waiver'||type==='add')&&['complete','completed','success','failed'].includes(status)&&txAdds(tx).length;
    }).map(tx=>({...tx,bid:txBid(tx),addsNormalized:txAdds(tx),statusNormalized:txStatus(tx)}));
  }
  function auctionKey(tx,p){
    const t=txTime(tx),bucket=t?Math.floor(t/300000):0;
    return `${playerId(p)}|${bucket}`;
  }
  function auctionResults(transactions=[]){
    const groups=new Map();
    for(const tx of waiverAttempts(transactions)){
      for(const p of tx.addsNormalized){
        const id=playerId(p);if(!id)continue;
        const key=auctionKey(tx,p);
        if(!groups.has(key))groups.set(key,{key,playerId:id,position:playerPosition(p),attempts:[]});
        groups.get(key).attempts.push({bid:tx.bid,status:tx.statusNormalized,rosterIds:txRosterIds(tx).map(String),time:txTime(tx),player:p,tx});
      }
    }
    const out=[];
    for(const g of groups.values()){
      const winners=g.attempts.filter(a=>['complete','completed','success'].includes(a.status));
      if(winners.length!==1)continue;
      const winner=winners[0];
      const losers=g.attempts.filter(a=>a.status==='failed'&&a.bid<=winner.bid);
      const byManager=new Map();
      for(const a of losers){
        const rid=a.rosterIds[0]||'unknown';
        if(!byManager.has(rid)||byManager.get(rid).bid<a.bid)byManager.set(rid,a);
      }
      const losing=[...byManager.values()].map(a=>a.bid).sort((a,b)=>b-a);
      const secondBid=losing.length?losing[0]:null;
      const minimumWinningBid=secondBid==null?1:Math.min(winner.bid,secondBid+1);
      out.push({...g,winnerBid:winner.bid,winnerRosterId:winner.rosterIds[0]||null,losingBids:losing,secondBid,minimumWinningBid,overpay:Math.max(0,winner.bid-minimumWinningBid),bidderCount:1+losing.length,competitive:losing.length>0});
    }
    return out;
  }
  function positionClears(transactions=[],position=''){
    const pos=String(position||'').toUpperCase();
    return completedWaiverBids(transactions).filter(tx=>tx.addsNormalized.some(p=>playerPosition(p)===pos));
  }
  function positionAuctions(transactions=[],position=''){
    const pos=String(position||'').toUpperCase();
    return auctionResults(transactions).filter(x=>!pos||x.position===pos);
  }
  function marketSnapshot(transactions=[]){
    const rows=completedWaiverBids(transactions),bids=rows.map(x=>x.bid),auctions=auctionResults(transactions);
    const thresholds=auctions.map(x=>x.minimumWinningBid),overpay=auctions.map(x=>x.overpay);
    const byPosition={};
    for(const p of ['QB','RB','WR','TE']){
      const wins=positionClears(rows,p).map(x=>x.bid);
      const a=positionAuctions(transactions,p),req=a.map(x=>x.minimumWinningBid),ov=a.map(x=>x.overpay);
      byPosition[p]={count:wins.length,medianWinningBid:median(wins),p75WinningBid:percentile(wins,.75),auctionCount:a.length,medianRequiredBid:median(req),p75RequiredBid:percentile(req,.75),averageOverpay:ov.length?ov.reduce((s,x)=>s+x,0)/ov.length:null,max:wins.length?Math.max(...wins):null};
    }
    return {count:bids.length,median:median(bids),p25:percentile(bids,.25),p75:percentile(bids,.75),p90:percentile(bids,.90),max:bids.length?Math.max(...bids):null,totalSpent:bids.reduce((s,x)=>s+x,0),auctionCount:auctions.length,medianRequiredBid:median(thresholds),p75RequiredBid:percentile(thresholds,.75),totalObservedOverpay:overpay.reduce((s,x)=>s+x,0),byPosition};
  }
  function managerProfile(transactions=[],rosterId){
    const rows=completedWaiverBids(transactions).filter(tx=>txRosterIds(tx).some(id=>String(id)===String(rosterId)));
    const bids=rows.map(x=>x.bid);
    return {rosterId:String(rosterId),wins:rows.length,totalSpent:bids.reduce((s,x)=>s+x,0),average:bids.length?bids.reduce((s,x)=>s+x,0)/bids.length:null,median:median(bids),max:bids.length?Math.max(...bids):null,aggressive:percentile(bids,.75)};
  }
  function playerAuction(transactions=[],targetPlayerId=''){
    const id=String(targetPlayerId||'');
    const rows=auctionResults(transactions).filter(a=>a.playerId===id).sort((a,b)=>Math.max(...b.attempts.map(x=>x.time))-Math.max(...a.attempts.map(x=>x.time)));
    return rows[0]||null;
  }

  // ----- Live competition model -----
  // Historical clearing price is the anchor. Current roster need and full-lineup fit adjust that anchor.
  const BLOCKED_WORDS=['out','injured reserve','ir','pup','suspended','suspension','exempt','commissioner exempt','nfi','reserve'];
  const UNCERTAIN_WORDS=['questionable','doubtful','concussion','limited','did not practice','dnp','day-to-day'];
  function rosterPlayers(roster){
    if(Array.isArray(roster?.players))return roster.players;
    return [...(roster?.starters||[]),...(roster?.bench||[])].filter(p=>p&&!p.empty);
  }
  function playerStatusText(p){return [p?.status,p?.injuryStatus,p?.injury_status,p?.administrativeStatus].filter(Boolean).join(' ').toLowerCase()}
  function weekAvailability(p,week){
    const bye=Number(p?.bye??p?.byeWeek??0);
    const status=playerStatusText(p);
    if(p?.active===false)return {usable:false,reason:'INACTIVE'};
    if(week!=null&&bye===Number(week))return {usable:false,reason:'BYE'};
    if(BLOCKED_WORDS.some(w=>status.includes(w)))return {usable:false,reason:'BLOCKED'};
    if(UNCERTAIN_WORDS.some(w=>status.includes(w)))return {usable:true,reason:'UNCERTAIN'};
    return {usable:true,reason:null};
  }
  function leagueSlotCounts(league={}){
    const slots=league?.rosterPositions||league?.roster_positions||[];
    const counts={};for(const s of slots)counts[String(s).toUpperCase()]=(counts[String(s).toUpperCase()]||0)+1;
    return counts;
  }
  function lineupSlots(league={}){
    const slots=league?.rosterPositions||league?.roster_positions||[];
    return slots.map(String).map(x=>x.toUpperCase()).filter(s=>!['BN','BENCH','IR','RESERVE','TAXI'].includes(s));
  }
  function eligibleForSlot(position,slot){
    const pos=String(position||'').toUpperCase(),s=String(slot||'').toUpperCase();
    if(s===pos)return true;
    if(['FLEX','WRT'].includes(s))return ['RB','WR','TE'].includes(pos);
    if(['WRRB_FLEX','RBWR_FLEX'].includes(s))return ['RB','WR'].includes(pos);
    if(['REC_FLEX','WRTE_FLEX'].includes(s))return ['WR','TE'].includes(pos);
    if(['SUPER_FLEX','SUPERFLEX'].includes(s))return ['QB','RB','WR','TE'].includes(pos);
    return false;
  }
  function playerValue(p){
    for(const k of ['projectedPoints','projection','projected','proj','valueScore','fantasyPoints','points']){
      const v=num(p?.[k]);if(v!=null)return v;
    }
    // Fallback preserves current starters above unknown bench players without pretending to know a projection.
    return p?.starter?10:0;
  }
  function bestLineup({players=[],league={},week=null}={}){
    const slots=lineupSlots(league);
    const pool=(players||[]).filter(p=>weekAvailability(p,week).usable);
    let best={score:-Infinity,assignments:[]};
    function dfs(i,used,score,assignments){
      if(i>=slots.length){if(score>best.score)best={score,assignments:[...assignments]};return;}
      const slot=slots[i];
      // Leaving a slot empty is allowed so this can quantify hard lineup holes.
      dfs(i+1,used,score,assignments.concat([{slot,player:null,value:0}]));
      for(let j=0;j<pool.length;j++){
        if(used.has(j)||!eligibleForSlot(playerPosition(pool[j]),slot))continue;
        used.add(j);
        dfs(i+1,used,score+playerValue(pool[j]),assignments.concat([{slot,player:pool[j],value:playerValue(pool[j])}]));
        used.delete(j);
      }
    }
    dfs(0,new Set(),0,[]);
    return best.score===-Infinity?{score:0,assignments:[]}:best;
  }
  function targetRosterFit({roster,target,week,league,targetValue=null}={}){
    const players=rosterPlayers(roster);
    const before=bestLineup({players,league,week});
    const t={...(target||{})};
    if(targetValue!=null)t.projectedPoints=Number(targetValue);
    const after=bestLineup({players:[...players,t],league,week});
    const tid=playerId(t)||'__TARGET__';
    if(!playerId(t))t.id=tid;
    const selected=after.assignments.find(a=>a.player&&(a.player===t||playerId(a.player)===tid));
    const beforeIds=new Set(before.assignments.filter(a=>a.player).map(a=>playerId(a.player)));
    const afterIds=new Set(after.assignments.filter(a=>a.player&&a.player!==t).map(a=>playerId(a.player)));
    const displaced=before.assignments.map(a=>a.player).find(p=>p&&!afterIds.has(playerId(p)))||null;
    const emptyBefore=before.assignments.filter(a=>!a.player).length;
    const emptyAfter=after.assignments.filter(a=>!a.player).length;
    return {
      rosterId:String(roster?.rosterId??roster?.roster_id??''),
      targetStarts:Boolean(selected),
      targetSlot:selected?.slot||null,
      marginalUpgrade:Math.max(0,after.score-before.score),
      fillsLineupHole:emptyAfter<emptyBefore,
      emptySlotsBefore:emptyBefore,
      emptySlotsAfter:emptyAfter,
      displacedPlayer:displaced,
      beforeScore:before.score,
      afterScore:after.score
    };
  }
  function rosterPositionPressure({roster,position,week,league}={}){
    const pos=String(position||'').toUpperCase();
    const players=rosterPlayers(roster);
    const counts=leagueSlotCounts(league);
    const exactRequired=Number(counts[pos]||0);
    const flexRequired=Number(counts.FLEX||0)+Number(counts.WRT||0)+Number(counts.WRRB_FLEX||0)+Number(counts.RBWR_FLEX||0)+Number(counts.REC_FLEX||0)+Number(counts.WRTE_FLEX||0);
    const activeAtPos=players.filter(p=>playerPosition(p)===pos&&weekAvailability(p,week).usable).length;
    const unavailableAtPos=players.filter(p=>playerPosition(p)===pos&&!weekAvailability(p,week).usable).length;
    const uncertainAtPos=players.filter(p=>playerPosition(p)===pos&&weekAvailability(p,week).reason==='UNCERTAIN').length;
    const flexEligible=p=>['RB','WR','TE'].includes(playerPosition(p));
    const activeFlex=players.filter(p=>flexEligible(p)&&weekAvailability(p,week).usable).length;
    const flexBase=Number(counts.RB||0)+Number(counts.WR||0)+Number(counts.TE||0)+flexRequired;
    const hardDeficit=Math.max(0,exactRequired-activeAtPos);
    const flexDeficit=['RB','WR','TE'].includes(pos)?Math.max(0,flexBase-activeFlex):0;
    const pressure=hardDeficit*3+Math.min(2,unavailableAtPos)*1.1+Math.min(2,uncertainAtPos)*.6+Math.min(2,flexDeficit)*.7;
    return {rosterId:String(roster?.rosterId??roster?.roster_id??''),position:pos,activeAtPos,unavailableAtPos,uncertainAtPos,hardDeficit,flexDeficit,pressure,urgent:hardDeficit>0,likely:pressure>=1.2};
  }
  function rosterFaab(roster,startFaab=1000){
    const direct=num(roster?.faabRemaining??roster?.faab_balance??roster?.faabBalance);
    if(direct!=null)return Math.max(0,direct);
    const used=num(roster?.faabUsed??roster?.settings?.waiver_budget_used);
    return used==null?Number(startFaab||1000):Math.max(0,Number(startFaab||1000)-used);
  }
  function sharedLineupSlot(target,alternative,league){
    const slots=lineupSlots(league);
    return slots.some(s=>eligibleForSlot(playerPosition(target),s)&&eligibleForSlot(playerPosition(alternative),s));
  }
  function competitionContext({rosters=[],position,week,league,myRosterId=null,releasedPlayers=[],startFaab=1000,targetScarcity=.5,target=null,targetValue=null}={}){
    const pos=String(position||playerPosition(target)||'').toUpperCase();
    const rivals=(rosters||[]).filter(r=>String(r?.rosterId??r?.roster_id??'')!==String(myRosterId??'')&&rosterPlayers(r).length);
    const rows=rivals.map(r=>{
      const need=rosterPositionPressure({roster:r,position:pos,week,league});
      const fit=target?targetRosterFit({roster:r,target,week,league,targetValue}):null;
      const faab=rosterFaab(r,startFaab);
      const budgetWeight=clamp(faab/Math.max(1,Number(startFaab||1000)),.15,1.2);
      // A target that cracks the best legal lineup creates demand even when the nominal position is already healthy.
      const flexFitPressure=fit?.targetStarts?(fit.fillsLineupHole?3:1+Math.min(2.5,fit.marginalUpgrade/4)):0;
      const totalPressure=need.pressure+flexFitPressure;
      return {...need,fit,faabRemaining:faab,pressure:totalPressure,weightedPressure:totalPressure*budgetWeight,urgent:need.urgent||Boolean(fit?.fillsLineupHole),likely:need.likely||Boolean(fit?.targetStarts)||totalPressure>=1.2};
    });
    const urgentBidders=rows.filter(r=>r.urgent&&r.faabRemaining>0);
    const likelyBidders=rows.filter(r=>r.likely&&r.faabRemaining>0);
    const starterUpgradeBidders=rows.filter(r=>r.fit?.targetStarts&&r.faabRemaining>0);
    const pressure=rows.reduce((s,r)=>s+r.weightedPressure,0);
    const supply=(releasedPlayers||[]).filter(p=>weekAvailability(p,week).usable&&(target?sharedLineupSlot(target,p,league):playerPosition(p)===pos));
    const equivalentAlternatives=supply.reduce((s,p)=>{
      if(target&&playerId(p)===playerId(target))return s;
      return s+(playerPosition(p)===pos?1:.4);
    },0);
    const alternatives=Math.max(0,equivalentAlternatives);
    const scarcity=clamp(Number(targetScarcity||0),0,1);
    const demandLift=Math.min(.40,urgentBidders.length*.055+Math.max(0,likelyBidders.length-urgentBidders.length)*.02+starterUpgradeBidders.length*.018+Math.min(10,pressure)*.008);
    const supplyRelief=Math.min(.24,alternatives*.04)*(1-.75*scarcity);
    const multiplier=clamp(1+demandLift-supplyRelief,.82,1.42);
    return {position:pos,rivals:rows.length,urgentBidders:urgentBidders.length,likelyBidders:likelyBidders.length,starterUpgradeBidders:starterUpgradeBidders.length,pressure,availableFaab:rows.reduce((s,r)=>s+r.faabRemaining,0),releasedSupply:supply.length,equivalentAlternatives:alternatives,multiplier,rows};
  }

  function bidBandFromComparables({transactions=[],position='',faabRemaining=1000,fallback=10,urgency=0,valueCeiling=null,competition=null}={}){
    const auctions=positionAuctions(transactions,position);
    const vals=auctions.map(x=>x.minimumWinningBid).filter(Number.isFinite);
    const budget=Math.max(0,Number(faabRemaining||0));
    const ceiling=valueCeiling==null?budget:Math.min(budget,Math.max(0,Number(valueCeiling)));
    const u=Math.max(0,Math.min(1,Number(urgency||0)));
    const competitionMultiplier=competition?.multiplier==null?1:clamp(Number(competition.multiplier),.82,1.42);
    if(vals.length<2){
      const base=Math.max(1,Number(fallback||10));
      const raw=base*(1+.20*u)*competitionMultiplier;
      const target=Math.min(ceiling,Math.max(1,Math.round(raw)));
      return {sampleSize:vals.length,low:Math.max(1,Math.round(target*.8)),target,high:Math.min(ceiling,Math.max(target,Math.round(target*1.20))),confidence:'LOW',basis:'CLEARING_THRESHOLD_PLUS_FULL_LINEUP_DEMAND',competitionMultiplier};
    }
    const low=percentile(vals,.50),base=percentile(vals,.70),upper=percentile(vals,.85);
    const historical=base+(upper-base)*(.25+.25*u);
    const market=historical*competitionMultiplier;
    const target=Math.min(ceiling,Math.max(1,Math.round(market+1)));
    const highBase=Math.max(target,Math.round((upper+2)*competitionMultiplier));
    const high=Math.min(ceiling,highBase);
    return {sampleSize:vals.length,low:Math.min(ceiling,Math.max(1,Math.round(low*competitionMultiplier))),target,high,confidence:vals.length>=6?'HIGH':'MEDIUM',basis:'CLEARING_THRESHOLD_PLUS_FULL_LINEUP_DEMAND',competitionMultiplier};
  }
  return {median,percentile,completedWaiverBids,waiverAttempts,auctionResults,positionClears,positionAuctions,marketSnapshot,managerProfile,playerAuction,weekAvailability,lineupSlots,eligibleForSlot,playerValue,bestLineup,targetRosterFit,rosterPositionPressure,competitionContext,bidBandFromComparables};
});