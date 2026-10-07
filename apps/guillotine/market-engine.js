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
  function txBid(tx){
    return num(tx?.faabBid??tx?.faab_bid??tx?.settings?.waiver_bid);
  }
  function txStatus(tx){return String(tx?.status||'').toLowerCase()}
  function txType(tx){return String(tx?.type||'').toLowerCase()}
  function txRosterIds(tx){return tx?.rosterIds||tx?.roster_ids||tx?.team_ids||[]}
  function txAdds(tx){
    if(Array.isArray(tx?.adds))return tx.adds;
    const adds=tx?.adds||{};return Object.keys(adds).map(id=>({id,rosterId:adds[id]}));
  }
  function completedWaiverBids(transactions=[]){
    return (transactions||[]).filter(tx=>{
      const bid=txBid(tx);const type=txType(tx),status=txStatus(tx);
      return bid!=null&&bid>=0&&(type==='waiver'||type==='add')&&(status==='complete'||status==='completed'||status==='success');
    }).map(tx=>({...tx,bid:txBid(tx),addsNormalized:txAdds(tx)}));
  }
  function positionClears(transactions=[],position=''){
    const pos=String(position||'').toUpperCase();
    return completedWaiverBids(transactions).filter(tx=>tx.addsNormalized.some(p=>String(p?.position||'').toUpperCase()===pos));
  }
  function marketSnapshot(transactions=[]){
    const rows=completedWaiverBids(transactions),bids=rows.map(x=>x.bid);
    const byPosition={};
    for(const p of ['QB','RB','WR','TE']){
      const r=positionClears(rows,p),vals=r.map(x=>x.bid);
      byPosition[p]={count:vals.length,median:median(vals),p75:percentile(vals,.75),max:vals.length?Math.max(...vals):null};
    }
    return {
      count:bids.length,
      median:median(bids),
      p25:percentile(bids,.25),
      p75:percentile(bids,.75),
      p90:percentile(bids,.90),
      max:bids.length?Math.max(...bids):null,
      totalSpent:bids.reduce((s,x)=>s+x,0),
      byPosition
    };
  }
  function managerProfile(transactions=[],rosterId){
    const rows=completedWaiverBids(transactions).filter(tx=>txRosterIds(tx).some(id=>String(id)===String(rosterId)));
    const bids=rows.map(x=>x.bid);
    return {
      rosterId:String(rosterId),
      wins:rows.length,
      totalSpent:bids.reduce((s,x)=>s+x,0),
      average:bids.length?bids.reduce((s,x)=>s+x,0)/bids.length:null,
      median:median(bids),
      max:bids.length?Math.max(...bids):null,
      aggressive:percentile(bids,.75)
    };
  }
  function bidBandFromComparables({transactions=[],position='',faabRemaining=1000,fallback=10,urgency=0}={}){
    const rows=position?positionClears(transactions,position):completedWaiverBids(transactions);
    const vals=rows.map(x=>x.bid);
    const budget=Math.max(0,Number(faabRemaining||0));
    if(vals.length<2){
      const target=Math.min(budget,Math.max(1,Math.round(Number(fallback||10)*(1+Math.max(0,Number(urgency||0))))));
      return {sampleSize:vals.length,low:Math.max(1,Math.round(target*.75)),target,high:Math.min(budget,Math.round(target*1.35)),confidence:'LOW'};
    }
    const u=Math.max(0,Math.min(1,Number(urgency||0)));
    const low=percentile(vals,.50),base=percentile(vals,.70),high=percentile(vals,.85);
    const target=base+(high-base)*u;
    return {
      sampleSize:vals.length,
      low:Math.min(budget,Math.max(1,Math.round(low))),
      target:Math.min(budget,Math.max(1,Math.round(target))),
      high:Math.min(budget,Math.max(1,Math.round(high))),
      confidence:vals.length>=6?'HIGH':'MEDIUM'
    };
  }
  return {median,percentile,completedWaiverBids,positionClears,marketSnapshot,managerProfile,bidBandFromComparables};
});