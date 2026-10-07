(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SFIQGuillotineMarketEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const num=x=>Number.isFinite(Number(x))?Number(x):null;
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
    // Sleeper processes one waiver batch at a common timestamp. Bucket to 5 minutes for normalized sources.
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
        groups.get(key).attempts.push({
          bid:tx.bid,status:tx.statusNormalized,rosterIds:txRosterIds(tx).map(String),time:txTime(tx),player:p,tx
        });
      }
    }
    const out=[];
    for(const g of groups.values()){
      const winners=g.attempts.filter(a=>['complete','completed','success'].includes(a.status));
      if(winners.length!==1)continue; // ambiguous/no-winner batches are not safe market evidence
      const winner=winners[0];
      const losers=g.attempts.filter(a=>a.status==='failed'&&a.bid<=winner.bid);
      // Keep only each manager's highest submitted losing bid so duplicate/reordered claims do not inflate demand.
      const byManager=new Map();
      for(const a of losers){
        const rid=a.rosterIds[0]||'unknown';
        if(!byManager.has(rid)||byManager.get(rid).bid<a.bid)byManager.set(rid,a);
      }
      const losing=[...byManager.values()].map(a=>a.bid).sort((a,b)=>b-a);
      const secondBid=losing.length?losing[0]:null;
      const minimumWinningBid=secondBid==null?1:Math.min(winner.bid,secondBid+1);
      out.push({
        ...g,
        winnerBid:winner.bid,
        winnerRosterId:winner.rosterIds[0]||null,
        losingBids:losing,
        secondBid,
        minimumWinningBid,
        overpay:Math.max(0,winner.bid-minimumWinningBid),
        bidderCount:1+losing.length,
        competitive:losing.length>0
      });
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
      byPosition[p]={
        count:wins.length,
        medianWinningBid:median(wins),
        p75WinningBid:percentile(wins,.75),
        auctionCount:a.length,
        medianRequiredBid:median(req),
        p75RequiredBid:percentile(req,.75),
        averageOverpay:ov.length?ov.reduce((s,x)=>s+x,0)/ov.length:null,
        max:wins.length?Math.max(...wins):null
      };
    }
    return {
      count:bids.length,
      median:median(bids),p25:percentile(bids,.25),p75:percentile(bids,.75),p90:percentile(bids,.90),
      max:bids.length?Math.max(...bids):null,totalSpent:bids.reduce((s,x)=>s+x,0),
      auctionCount:auctions.length,
      medianRequiredBid:median(thresholds),
      p75RequiredBid:percentile(thresholds,.75),
      totalObservedOverpay:overpay.reduce((s,x)=>s+x,0),
      byPosition
    };
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
  function bidBandFromComparables({transactions=[],position='',faabRemaining=1000,fallback=10,urgency=0,valueCeiling=null}={}){
    // Critical rule: model what it took to WIN, not what winners happened to PAY.
    // Winning bids can be severe overpays and must not teach the model to repeat them.
    const auctions=positionAuctions(transactions,position);
    const vals=auctions.map(x=>x.minimumWinningBid).filter(Number.isFinite);
    const budget=Math.max(0,Number(faabRemaining||0));
    const ceiling=num(valueCeiling)==null?budget:Math.min(budget,Math.max(0,Number(valueCeiling)));
    const u=Math.max(0,Math.min(1,Number(urgency||0)));
    if(vals.length<2){
      // Sparse data => conservative, small urgency premium. Urgency affects willingness ceiling more than market clearing price.
      const base=Math.max(1,Number(fallback||10));
      const target=Math.min(ceiling,Math.max(1,Math.round(base*(1+.20*u))));
      return {sampleSize:vals.length,low:Math.max(1,Math.round(target*.8)),target,high:Math.min(ceiling,Math.max(target,Math.round(target*1.20))),confidence:'LOW',basis:'CLEARING_THRESHOLD'};
    }
    const low=percentile(vals,.50),base=percentile(vals,.70),upper=percentile(vals,.85);
    // Add only a small insurance premium over observed clearing thresholds. Do not scale bids linearly with roster value.
    const market=base+(upper-base)*(.25+.25*u);
    const target=Math.min(ceiling,Math.max(1,Math.round(market+1)));
    const high=Math.min(ceiling,Math.max(target,Math.round(upper+2)));
    return {sampleSize:vals.length,low:Math.min(ceiling,Math.max(1,Math.round(low))),target,high,confidence:vals.length>=6?'HIGH':'MEDIUM',basis:'CLEARING_THRESHOLD'};
  }
  return {median,percentile,completedWaiverBids,waiverAttempts,auctionResults,positionClears,positionAuctions,marketSnapshot,managerProfile,playerAuction,bidBandFromComparables};
});