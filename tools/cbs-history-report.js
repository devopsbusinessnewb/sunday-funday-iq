#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const historyPath=path.resolve(__dirname,'../data/analysis/cbs-history.json');
const history=JSON.parse(fs.readFileSync(historyPath,'utf8'));

function scoreCard(week,card){
  let points=0,correct=0;
  const decisions=[];
  for(const [game,winner] of Object.entries(week.results||{})){
    const pick=card.picks?.[game],confidence=Number(card.confidence?.[game]);
    if(!pick||!Number.isFinite(confidence))throw new Error(`Week ${week.week} ${card.id}: missing ${game}`);
    const won=pick===winner;
    if(won){correct++;points+=confidence}
    decisions.push({game,pick,winner,confidence,won,points:won?confidence:0});
  }
  const weights=Object.values(card.confidence||{}).map(Number).sort((a,b)=>a-b);
  if(weights.length!==Object.keys(week.results||{}).length||weights.some((v,i)=>v!==i+1))throw new Error(`Week ${week.week} ${card.id}: confidence values are not 1–${weights.length}`);
  return{week:week.week,id:card.id,label:card.label,correct,points,decisions};
}

function compareCards(week,baseline,candidate){
  const a=scoreCard(week,baseline),b=scoreCard(week,candidate),attribution=[];
  for(const game of Object.keys(week.results)){
    const pickChanged=baseline.picks[game]!==candidate.picks[game];
    const confidenceChanged=baseline.confidence[game]!==candidate.confidence[game];
    if(!pickChanged&&!confidenceChanged)continue;
    const winner=week.results[game];
    const before=baseline.picks[game]===winner?baseline.confidence[game]:0;
    const after=candidate.picks[game]===winner?candidate.confidence[game]:0;
    attribution.push({game,pickChanged,confidenceChanged,before,after,delta:after-before});
  }
  return{baseline:a,candidate:b,deltaPoints:b.points-a.points,deltaCorrect:b.correct-a.correct,attribution};
}

const report={schemaVersion:history.schemaVersion,generatedAt:new Date().toISOString(),weeks:[]};
for(const week of history.weeks){
  const cards=week.cards.map(card=>scoreCard(week,card));
  const original=week.cards.find(x=>x.id==='original')||week.cards[0];
  const independentBaselines=week.cards.filter(x=>x.role==='independent_baseline');
  const originalIsPlaceholder=original.performanceBenchmark===false||original.role==='simulation_input_placeholder';
  const benchmarkComparisons=[];
  for(const baseline of independentBaselines)for(const candidate of week.cards.filter(x=>x.role==='model_recommendation'||x.role==='actual_submission'))benchmarkComparisons.push({...compareCards(week,baseline,candidate),diagnosticOnly:false});
  report.weeks.push({week:week.week,cards,baseline:{id:original.id,label:original.label,performanceBenchmark:!originalIsPlaceholder},comparisons:week.cards.filter(x=>x!==original).map(card=>({...compareCards(week,original,card),diagnosticOnly:originalIsPlaceholder,note:originalIsPlaceholder?'Difference from an operational placeholder; do not interpret as model outperformance.':null})),benchmarkComparisons});
}

if(require.main===module&&process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else if(require.main===module){
  for(const week of report.weeks){
    console.log(`Week ${week.week}`);
    for(const c of week.cards)console.log(`  ${c.label}: ${c.points} points, ${c.correct} correct`);
    for(const c of week.comparisons)console.log(`  ${c.diagnosticOnly?'diagnostic vs placeholder':'vs original'} — ${c.candidate.label}: ${c.deltaPoints>=0?'+':''}${c.deltaPoints} points, ${c.deltaCorrect>=0?'+':''}${c.deltaCorrect} correct${c.diagnosticOnly?' (not model-performance evidence)':''}`);
    for(const c of week.benchmarkComparisons)console.log(`  model check vs ${c.baseline.label} — ${c.candidate.label}: ${c.deltaPoints>=0?'+':''}${c.deltaPoints} points, ${c.deltaCorrect>=0?'+':''}${c.deltaCorrect} correct`);
  }
}

module.exports={scoreCard,compareCards};
