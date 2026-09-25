#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const {validateArchive}=require('./cbs-pool-archive.js');

function summarizeWeek(archive){
  const valid=validateArchive(archive,{requireComplete:true});
  if(!valid.valid)throw new Error(`Week ${archive.week} archive is incomplete:\n- ${valid.errors.join('\n- ')}`);
  const standings=[...archive.entries].sort((a,b)=>a.rank-b.rank),n=archive.games.length;
  const entryProfiles=archive.entries.map(entry=>{
    let consensus=0,contrarian=0,highConfidenceContrarian=0,ownershipSum=0;
    for(const game of archive.games){
      const pick=entry.card[game.key],metric=archive.analytics.gameMetrics[game.key],share=metric.teams[pick.team].pickShare;
      ownershipSum+=share;
      if(share>=.5)consensus++;else{contrarian++;if(pick.confidence>n*.75)highConfidenceContrarian++}
    }
    return{entryId:entry.entryId,isMine:entry.isMine,rank:entry.rank,weeklyPoints:entry.weeklyPoints,seasonPoints:entry.seasonPoints,consensusRate:consensus/n,contrarianPicks:contrarian,highConfidenceContrarian,averageSelectedOwnership:ownershipSum/n};
  });
  const mostDivisive=archive.games.map(game=>{
    const metric=archive.analytics.gameMetrics[game.key],away=metric.teams[game.away].pickShare;
    return{game:game.key,winner:game.winner,awayShare:away,homeShare:metric.teams[game.home].pickShare,division:1-Math.abs(away-.5)*2};
  }).sort((a,b)=>b.division-a.division);
  return{
    week:archive.week,poolSize:archive.entries.length,winnerScore:archive.analytics.winnerScore,top2Cutoff:archive.analytics.top2Cutoff,
    mine:entryProfiles.find(x=>x.isMine)||null,
    top2:standings.slice(0,2).map(entry=>entryProfiles.find(x=>x.entryId===entry.entryId)),
    entryProfiles,mostDivisive
  };
}

function summarizeHistory(archives){
  const weeks=archives.sort((a,b)=>a.week-b.week).map(summarizeWeek),participants=new Map();
  for(const week of weeks)for(const profile of week.entryProfiles){
    const current=participants.get(profile.entryId)||{entryId:profile.entryId,isMine:profile.isMine,weeks:0,rankTotal:0,top2Finishes:0,consensusTotal:0,contrarianPicks:0,highConfidenceContrarian:0};
    current.weeks++;current.rankTotal+=profile.rank;current.top2Finishes+=profile.rank<=2?1:0;current.consensusTotal+=profile.consensusRate;current.contrarianPicks+=profile.contrarianPicks;current.highConfidenceContrarian+=profile.highConfidenceContrarian;
    participants.set(profile.entryId,current);
  }
  const participantProfiles=[...participants.values()].map(x=>({...x,averageRank:x.rankTotal/x.weeks,averageConsensusRate:x.consensusTotal/x.weeks})).sort((a,b)=>a.averageRank-b.averageRank);
  const buckets=[{label:'0–20%',min:0,max:.2,weights:[]},{label:'20–40%',min:.2,max:.4,weights:[]},{label:'40–60%',min:.4,max:.6,weights:[]},{label:'60–80%',min:.6,max:.8,weights:[]},{label:'80–100%',min:.8,max:1.001,weights:[]}];
  for(const archive of archives)for(const entry of archive.entries)for(const game of archive.games){
    const pick=entry.card[game.key];if(!pick)continue;
    const share=archive.analytics.gameMetrics[game.key].teams[pick.team].pickShare,bucket=buckets.find(x=>share>=x.min&&share<x.max);
    if(bucket)bucket.weights.push(pick.confidence);
  }
  const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  const field=weeks.flatMap(x=>x.entryProfiles),top2=field.filter(x=>x.rank<=2);
  const fieldPrior={
    participantWeeks:field.length,
    averageConsensusRate:average(field.map(x=>x.consensusRate)),
    averageContrarianPicks:average(field.map(x=>x.contrarianPicks)),
    top2AverageConsensusRate:average(top2.map(x=>x.consensusRate)),
    top2AverageContrarianPicks:average(top2.map(x=>x.contrarianPicks)),
    confidenceByPoolOwnershipBucket:buckets.map(({label,weights})=>({label,observations:weights.length,mean:average(weights),median:weights.length?[...weights].sort((a,b)=>a-b)[Math.floor(weights.length/2)]:null}))
  };
  return{schemaVersion:1,weeks:weeks.map(({entryProfiles,...week})=>week),fieldPrior,participantProfiles};
}

if(require.main===module){
  const files=process.argv.slice(2).filter(x=>!x.startsWith('--')),outIndex=process.argv.indexOf('--out'),out=outIndex>=0?process.argv[outIndex+1]:null;
  if(!files.length){console.error('Usage: node tools/cbs-pool-report.js <archive-week-1.json> [archive-week-2.json ...] [--out report.json]');process.exit(2)}
  try{
    const report=summarizeHistory(files.map(file=>JSON.parse(fs.readFileSync(path.resolve(file),'utf8'))));
    if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(path.resolve(out),JSON.stringify(report,null,2)+'\n');console.log(`Saved ${report.weeks.length}-week pool report to ${out}`)}
    else console.log(JSON.stringify(report,null,2));
  }catch(error){console.error(error.message);process.exit(1)}
}

module.exports={summarizeWeek,summarizeHistory};
