const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const history=JSON.parse(fs.readFileSync(path.join(root,'data/analysis/cbs-history.json'),'utf8'));
const {scoreCard,compareCards}=require(path.join(root,'tools/cbs-history-report.js'));

const week1=history.weeks.find(w=>w.week===1),week2=history.weeks.find(w=>w.week===2);
const byId=(week,id)=>week.cards.find(c=>c.id===id);
const expected={
  '1:original':[108,12],
  '1:recommendation_1':[114,12],
  '1:recommendation_2':[94,11],
  '1:recommendation_3':[102,13],
  '2:cbs_consensus_baseline':[91,11],
  '2:original':[74,9],
  '2:model_1_6_1':[85,8],
  '2:final_submitted':[85,8],
  '2:model_confidence_no_flips':[79,9]
};
for(const [key,[points,correct]] of Object.entries(expected)){
  const [weekNo,id]=key.split(':'),week=Number(weekNo)===1?week1:week2,result=scoreCard(week,byId(week,id));
  if(result.points!==points||result.correct!==correct)throw new Error(`${key}: expected ${points}/${correct}, got ${result.points}/${result.correct}`);
}
const week2Delta=compareCards(week2,byId(week2,'original'),byId(week2,'final_submitted'));
if(week2Delta.deltaPoints!==11||week2Delta.deltaCorrect!==-1)throw new Error('Week 2 counterfactual attribution changed');
const confidenceOnly=compareCards(week2,byId(week2,'original'),byId(week2,'model_confidence_no_flips'));
if(confidenceOnly.deltaPoints!==5||confidenceOnly.deltaCorrect!==0)throw new Error('Week 2 confidence-only attribution changed');
const consensus=byId(week2,'cbs_consensus_baseline');
if(consensus.role!=='independent_baseline'||consensus.performanceBenchmark!==true)throw new Error('Week 2 disciplined CBS consensus benchmark missing');
const modelVsConsensus=compareCards(week2,consensus,byId(week2,'model_1_6_1'));
if(modelVsConsensus.deltaPoints!==-6||modelVsConsensus.deltaCorrect!==-3)throw new Error('Week 2 model-vs-consensus benchmark changed');

console.log('CBS history regression passed: Weeks 1–2 decisions and counterfactual scores are immutable.');
